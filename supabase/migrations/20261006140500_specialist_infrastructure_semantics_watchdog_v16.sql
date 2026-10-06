-- Specialist infrastructure integration corrections v16.
-- Separate the agreed U16 Head Coach +12% effectiveness from the rider's
-- flat development multiplier, and make Control Center verify the real hooks.

create or replace function private.youth_u16_infrastructure_development_multiplier_v1(
  p_academy_id uuid,
  p_focus_code text,
  p_is_race boolean default false
)
returns numeric
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_club_id uuid;
  v_youth_level integer:=0;
  v_sprint integer:=0;
  v_climb integer:=0;
  v_ttt integer:=0;
  v_bonus_bps integer:=0;
begin
  select a.club_id into v_club_id
  from public.youth_academies a
  where a.id=p_academy_id;

  if v_club_id is null then return 1.0; end if;

  select
    coalesce(ci.youth_academy_level,0),
    coalesce(ci.sprint_performance_circuit_level,0),
    coalesce(ci.climbing_performance_center_level,0),
    coalesce(ci.team_time_trial_center_level,0)
  into v_youth_level,v_sprint,v_climb,v_ttt
  from public.club_infrastructure ci
  where ci.club_id=v_club_id;

  if coalesce(p_is_race,false) then
    v_bonus_bps:=case v_youth_level
      when 1 then 600
      when 2 then 1200
      else 0
    end;

    v_bonus_bps:=v_bonus_bps+
      case lower(coalesce(p_focus_code,''))
        when 'sprint' then case when v_sprint>=1 then 500 else 0 end
        when 'climbing' then case when v_climb>=1 then 500 else 0 end
        when 'time_trial' then case when v_ttt>=1 then 500 else 0 end
        else 0
      end;
  else
    -- Flat U16 development bonus only. The Level 2 Head Coach +12%
    -- effectiveness is applied separately to the coach contribution.
    v_bonus_bps:=case v_youth_level
      when 1 then 800
      when 2 then 1500
      else 0
    end;

    v_bonus_bps:=v_bonus_bps+
      case lower(coalesce(p_focus_code,''))
        when 'sprint' then case when v_sprint>=1 then 1200 else 0 end
        when 'climbing' then case when v_climb>=1 then 1200 else 0 end
        when 'time_trial' then case when v_ttt>=1 then 1000 else 0 end
        else 0
      end;
  end if;

  return 1.0+v_bonus_bps::numeric/10000.0;
end;
$function$;

create or replace function private.youth_u16_head_coach_effectiveness_multiplier_v1(
  p_academy_id uuid
)
returns numeric
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select case
    when coalesce(ci.youth_academy_level,0)>=2 then 1.12::numeric
    else 1.00::numeric
  end
  from public.youth_academies a
  left join public.club_infrastructure ci on ci.club_id=a.club_id
  where a.id=p_academy_id
  limit 1;
$function$;

do $patch_u16_head_coach$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'private.process_youth_development_week_v1(date)'::regprocedure
  );

  if position('v_coach_effectiveness_multiplier numeric' in ddl)=0 then
    ddl:=replace(
      ddl,
      '  v_infra_multiplier numeric:=1.0;'||chr(10),
      '  v_infra_multiplier numeric:=1.0;'||chr(10)||
      '  v_coach_effectiveness_multiplier numeric:=1.0;'||chr(10)
    );
  end if;

  if position(
    'youth_u16_head_coach_effectiveness_multiplier_v1' in ddl
  )=0 then
    ddl:=replace(
      ddl,
      '    v_infra_multiplier:=private.youth_u16_infrastructure_development_multiplier_v1(v_rider.academy_id,v_focus,false);',
      '    v_infra_multiplier:=private.youth_u16_infrastructure_development_multiplier_v1(v_rider.academy_id,v_focus,false);'||
      chr(10)||
      '    v_coach_effectiveness_multiplier:=private.youth_u16_head_coach_effectiveness_multiplier_v1(v_rider.academy_id);'
    );
  end if;

  if position(
    'v_coach_score*v_coach_effectiveness_multiplier' in ddl
  )=0 then
    ddl:=replace(
      ddl,
      '        *(0.72+v_coach_score/180.0)',
      '        *(0.72+(v_coach_score*v_coach_effectiveness_multiplier)/180.0)'
    );
  end if;

  if position(
    '''u16_head_coach_effectiveness_multiplier''' in ddl
  )=0 then
    ddl:=replace(
      ddl,
      '''u16_infrastructure_development_multiplier'',round(v_infra_multiplier,4),',
      '''u16_infrastructure_development_multiplier'',round(v_infra_multiplier,4),'||
      chr(10)||
      '        ''u16_head_coach_effectiveness_multiplier'',round(v_coach_effectiveness_multiplier,4),'
    );
  end if;

  if position(
    'v_coach_score*v_coach_effectiveness_multiplier' in ddl
  )=0
  or position(
    'youth_u16_head_coach_effectiveness_multiplier_v1' in ddl
  )=0 then
    raise exception 'Could not wire U16 Head Coach infrastructure effectiveness correctly';
  end if;

  execute ddl;
end;
$patch_u16_head_coach$;

create or replace function public.monitor_special_infrastructure_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  missing_cfg integer:=0;
  invalid_level integer:=0;
  invalid_prereq integer:=0;
  integration_missing integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into missing_cfg
  from (values
    ('team_residential_campus'),
    ('sprint_performance_circuit'),
    ('climbing_performance_center'),
    ('team_time_trial_center')
  ) v(facility_key)
  where not exists(
    select 1
    from public.infrastructure_facility_upgrade_config c
    where c.facility_key=v.facility_key and c.target_level=1
  );

  select count(*) into invalid_level
  from public.club_infrastructure ci
  where ci.team_residential_campus_level not between 0 and 1
     or ci.sprint_performance_circuit_level not between 0 and 1
     or ci.climbing_performance_center_level not between 0 and 1
     or ci.team_time_trial_center_level not between 0 and 1;

  select count(*) into invalid_prereq
  from public.club_infrastructure ci
  where (ci.team_residential_campus_level>0 and ci.youth_academy_level<1)
     or (
       (
         ci.sprint_performance_circuit_level>0
         or ci.climbing_performance_center_level>0
         or ci.team_time_trial_center_level>0
       )
       and ci.training_center_level<2
     );

  select count(*) into integration_missing
  from (
    values
      (
        position(
          'team_residential_campus_active_v1'
          in pg_get_functiondef(
            'public.get_club_team_policy_estimate(uuid)'::regprocedure
          )
        )>0
      ),
      (
        position(
          'team_residential_campus_active_v1'
          in pg_get_functiondef(
            'public.finance_process_weekly_developing_team_accommodation_v1()'::regprocedure
          )
        )>0
      ),
      (
        position(
          'finance_process_monthly_special_facility_maintenance_v1'
          in pg_get_functiondef(
            'public.finance_run_due_monthly_tax_audits(boolean)'::regprocedure
          )
        )>0
      ),
      (
        position(
          'youth_u16_head_coach_effectiveness_multiplier_v1'
          in pg_get_functiondef(
            'private.process_youth_development_week_v1(date)'::regprocedure
          )
        )>0
      ),
      (
        position(
          'youth_u16_infrastructure_development_multiplier_v1'
          in pg_get_functiondef(
            'private.simulate_youth_race_v1(uuid)'::regprocedure
          )
        )>0
      ),
      (
        position(
          'apply_team_time_trial_center_bonus_v1'
          in pg_get_functiondef(
            'public.run_race_stage_team_time_trial_v1(uuid)'::regprocedure
          )
        )>0
      ),
      (
        position(
          'team_residential_campus_active_v1'
          in pg_get_functiondef(
            'public.process_daily_fatigue()'::regprocedure
          )
        )>0
      ),
      (
        exists(
          select 1
          from pg_trigger t
          where t.tgname='trg_zzzzzzz_specialist_facility_regular_training_v1'
            and not t.tgisinternal
            and t.tgenabled<>'D'
        )
      ),
      (
        exists(
          select 1
          from pg_trigger t
          where t.tgname='trg_zz_specialist_race_development_v1'
            and not t.tgisinternal
            and t.tgenabled<>'D'
        )
      )
  ) checks(ok)
  where not checks.ok;

  issues:=missing_cfg+invalid_level+invalid_prereq+integration_missing;

  details:=jsonb_build_object(
    'missing_facility_configs',missing_cfg,
    'invalid_facility_levels',invalid_level,
    'built_facilities_with_missing_prerequisite',invalid_prereq,
    'missing_gameplay_integrations',integration_missing
  );

  return private.youth_watchdog_finish_v1(
    'check:special_infrastructure',
    issues,
    'high',
    'Specialist infrastructure requires attention',
    format(
      'Specialist infrastructure integrity found %s problem record(s).',
      issues
    ),
    'Residential Campus and specialist performance facilities are healthy.',
    details
  );
end;
$function$;

select public.monitor_special_infrastructure_health_v1();
