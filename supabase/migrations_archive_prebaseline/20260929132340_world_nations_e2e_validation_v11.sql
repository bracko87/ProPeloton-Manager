create or replace function private.run_nations_e2e_validation_core_v1(
  p_association_count integer default 48
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_count integer:=greatest(1,least(coalesce(p_association_count,48),128));
  v_plan jsonb;
  v_plan_100 jsonb;
  v_final_qualification jsonb;
  v_world_final jsonb;
  v_preliminary_count integer:=0;
  v_preliminary_100_count integer:=0;
  v_cfg public.national_association_config%rowtype;
  v_sched public.nations_competition_schedule_config%rowtype;
  v_pkg jsonb;
  v_mask_1 int4range;
  v_mask_2 int4range;
  v_ttt_winner integer:=0;
  v_road_top3 integer:=0;
  v_road_crash_case integer:=0;
  v_required_notifications integer:=0;
  v_cron_ok boolean:=false;
  v_no_treasury boolean:=false;
  v_runtime_gate_ok boolean:=false;
  v_lineup_rule_ok boolean:=false;
  v_checks jsonb:='[]'::jsonb;
  v_failures integer:=0;
  v_warnings integer:=0;
  v_pass boolean;
  v_health jsonb;
begin
  select * into v_cfg from public.national_association_config where id=true;
  select * into v_sched from public.nations_competition_schedule_config where id=true;

  v_plan:=public.nations_qualification_plan_v1(v_count);
  v_plan_100:=public.nations_qualification_plan_v1(100);

  select value into v_final_qualification
  from jsonb_array_elements(coalesce(v_plan->'rounds','[]'::jsonb))
  where value->>'round_type'='final_qualification'
  order by (value->>'round_index')::integer
  limit 1;

  select value into v_world_final
  from jsonb_array_elements(coalesce(v_plan->'rounds','[]'::jsonb))
  where value->>'round_type'='world_final'
  order by (value->>'round_index')::integer
  limit 1;

  select count(*)::integer into v_preliminary_count
  from jsonb_array_elements(coalesce(v_plan->'rounds','[]'::jsonb))
  where value->>'round_type'='preliminary';

  select count(*)::integer into v_preliminary_100_count
  from jsonb_array_elements(coalesce(v_plan_100->'rounds','[]'::jsonb))
  where value->>'round_type'='preliminary';

  v_pass :=
    v_cfg.minimum_active_members=5
    and v_cfg.annual_registration_start_month=1
    and v_cfg.annual_registration_start_day=1
    and v_cfg.annual_registration_close_month=1
    and v_cfg.annual_registration_close_day=10
    and v_cfg.annual_round1_close_month=1
    and v_cfg.annual_round1_close_day=20
    and v_cfg.annual_round2_close_month=1
    and v_cfg.annual_round2_close_day=27
    and v_cfg.repeated_runoff_days=7
    and v_cfg.national_squad_size=10
    and v_cfg.national_lineup_size=7
    and v_cfg.max_lineup_changes=3
    and v_cfg.masked_overall_span=3
    and v_cfg.max_active_callups=15
    and v_cfg.callup_response_days=7;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','core_config',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'minimum_members',v_cfg.minimum_active_members,
      'registration','Jan 1-10',
      'round1','Jan 10-20',
      'round2','Jan 20-27',
      'repeated_runoff_days',v_cfg.repeated_runoff_days,
      'squad_size',v_cfg.national_squad_size,
      'lineup_size',v_cfg.national_lineup_size,
      'max_lineup_changes',v_cfg.max_lineup_changes,
      'masked_overall_span',v_cfg.masked_overall_span,
      'max_active_callups',v_cfg.max_active_callups,
      'callup_response_days',v_cfg.callup_response_days
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select not exists(
    select 1
    from information_schema.tables t
    where t.table_schema='public'
      and (
        t.table_name ilike '%national_association%treasury%'
        or t.table_name ilike '%national_association%contribution%'
      )
  ) into v_no_treasury;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','no_treasury',
    'status',case when v_no_treasury then 'pass' else 'fail' end,
    'detail','National Associations have no treasury/contribution tables.'
  ));
  if not v_no_treasury then v_failures:=v_failures+1; end if;

  v_pass :=
    (v_plan->>'active_associations')::integer=v_count
    and v_final_qualification is not null
    and v_world_final is not null
    and (
      v_count<32
      or (
        (v_final_qualification->>'entrants_target')::integer=32
        and (v_final_qualification->>'advance_target')::integer=16
        and (v_final_qualification->>'group_count')::integer=4
      )
    )
    and (
      v_count<16
      or (
        (v_world_final->>'entrants_target')::integer=16
        and (v_world_final->>'advance_target')::integer=1
      )
    )
    and (v_count<=32 or v_preliminary_count>=1);

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_stress_'||v_count::text,
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',v_plan
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_pass :=
    v_preliminary_100_count>=2
    and exists(
      select 1
      from jsonb_array_elements(v_plan_100->'rounds') e
      where e->>'round_type'='final_qualification'
        and (e->>'entrants_target')::integer=32
        and (e->>'advance_target')::integer=16
        and (e->>'group_count')::integer=4
    )
    and exists(
      select 1
      from jsonb_array_elements(v_plan_100->'rounds') e
      where e->>'round_type'='world_final'
        and (e->>'entrants_target')::integer=16
        and (e->>'advance_target')::integer=1
    );

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_scale_100',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',v_plan_100
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_pass :=
    v_sched.final_month=11
    and v_sched.final_day=24
    and v_sched.final_qualification_gap_days=42
    and v_sched.preliminary_gap_days>0
    and v_sched.host_selection_days_before_final>0;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','calendar_anchors',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'world_final',format('%s-%s',v_sched.final_month,v_sched.final_day),
      'final_qualification_gap_days',v_sched.final_qualification_gap_days,
      'preliminary_gap_days',v_sched.preliminary_gap_days,
      'earliest_preliminary',format('%s-%s',v_sched.earliest_preliminary_month,v_sched.earliest_preliminary_day),
      'host_selection_days_before_final',v_sched.host_selection_days_before_final
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_pkg:=public.get_national_team_standard_package_v1();
  v_pass :=
    coalesce((
      select sum((x->>'quantity')::integer)
      from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
      where x->>'asset_key'='team_car'
    ),0)=10
    and coalesce((
      select max((x->>'asset_level')::integer)
      from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
      where x->>'asset_key'='team_car'
    ),0)=5
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='energy_gels' and (x->>'quantity')::integer=250
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='bidons_water_bottles' and (x->>'quantity')::integer=250
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='nutrition_packs' and (x->>'quantity')::integer=250
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='race_jersey_complete' and (x->>'quantity')::integer=50
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='rain_jackets' and (x->>'quantity')::integer=50
    )
    and coalesce(jsonb_array_length(v_pkg->'staff'),0)=1
    and (v_pkg->'staff'->>0)='national_coach'
    and coalesce((v_pkg->>'has_treasury')::boolean,false)=false
    and coalesce(v_pkg->>'cost_model','')='system_covered';

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','standard_package',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'team_cars',(
        select coalesce(sum((x->>'quantity')::integer),0)
        from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
        where x->>'asset_key'='team_car'
      ),
      'team_car_level',(
        select coalesce(max((x->>'asset_level')::integer),0)
        from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
        where x->>'asset_key'='team_car'
      ),
      'equipment_models',jsonb_array_length(coalesce(v_pkg->'equipment','[]'::jsonb)),
      'supplies',v_pkg->'supplies',
      'staff',v_pkg->'staff',
      'has_treasury',v_pkg->'has_treasury',
      'cost_model',v_pkg->'cost_model'
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_mask_1:=private.national_coach_masked_overall_bounds_v1(
    '00000000-0000-0000-0000-000000000082'::uuid,82,1
  );
  v_mask_2:=private.national_coach_masked_overall_bounds_v1(
    '00000000-0000-0000-0000-000000000082'::uuid,82,1
  );
  v_pass :=
    v_mask_1=v_mask_2
    and 82<@v_mask_1
    and upper(v_mask_1)-lower(v_mask_1)=4;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','masked_overall_stability',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'actual_overall',82,
      'range_low',lower(v_mask_1),
      'range_high',upper(v_mask_1)-1,
      'stable',v_mask_1=v_mask_2
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select coalesce(max(points) filter(where race_type='team_time_trial' and finishing_position=1),0)
  into v_ttt_winner
  from public.nations_points_curve
  where is_active=true;

  select coalesce(sum(points),0)
  into v_road_top3
  from public.nations_points_curve
  where is_active=true
    and race_type='road_race'
    and finishing_position in (1,2,3);

  select coalesce(sum(points),0)
  into v_road_crash_case
  from public.nations_points_curve
  where is_active=true
    and race_type='road_race'
    and finishing_position in (1,2,4);

  v_pass :=
    v_ttt_winner>0
    and v_road_top3>v_ttt_winner
    and (v_road_top3*2)>v_ttt_winner
    and v_road_crash_case>=floor(v_road_top3*0.90);

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','points_balance',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'ttt_win_points',v_ttt_winner,
      'road_best_three_1_2_3',v_road_top3,
      'road_best_three_1_2_4',v_road_crash_case,
      'crash_case_retention_pct',round(100.0*v_road_crash_case/nullif(v_road_top3,0),1)
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select
    pg_get_functiondef('public.submit_national_team_lineup_v1(uuid,integer,uuid[])'::regprocedure)
      ilike '%maximum of % lineup changes%'
    and pg_get_functiondef('public.submit_national_team_lineup_v1(uuid,integer,uuid[])'::regprocedure)
      ilike '%national_lineup_size%'
    and pg_get_functiondef('public.submit_national_team_lineup_v1(uuid,integer,uuid[])'::regprocedure)
      ilike '%max_lineup_changes%'
  into v_lineup_rule_ok;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','lineup_contract',
    'status',case when v_lineup_rule_ok then 'pass' else 'fail' end,
    'detail','Exactly 7 starters; previous day required; maximum 3 changes sourced from config.'
  ));
  if not v_lineup_rule_ok then v_failures:=v_failures+1; end if;

  select
    pg_get_functiondef('public.process_nations_race_runtime_v2()'::regprocedure)
      ilike '%v_valid_teams=v_expected%'
    and pg_get_functiondef('public.process_nations_race_runtime_v2()'::regprocedure)
      ilike '%min_riders_per_team=7%'
    and pg_get_functiondef('public.process_nations_race_runtime_v2()'::regprocedure)
      ilike '%max_riders_per_team=7%'
  into v_runtime_gate_ok;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','complete_field_race_gate',
    'status',case when v_runtime_gate_ok then 'pass' else 'fail' end,
    'detail','Every nation in the group must provide a valid 7-rider startlist before the Nations race can become scheduled.'
  ));
  if not v_runtime_gate_ok then v_failures:=v_failures+1; end if;

  select count(*)::integer
  into v_required_notifications
  from public.notification_types
  where is_active=true
    and code=any(array[
      'NATIONAL_ASSOCIATION_ACTIVATED',
      'NATIONAL_COACH_ELECTION_OPEN',
      'NATIONAL_COACH_ELECTED',
      'NATIONAL_TEAM_CALLUP_RECEIVED',
      'NATIONAL_TEAM_SQUAD_CONFIRMED',
      'NATIONAL_TEAM_DUTY_STARTED',
      'NATIONAL_TEAM_DUTY_COMPLETED',
      'NATIONS_QUALIFICATION_DRAW',
      'NATIONS_RACE_RESULT',
      'NATIONS_ADVANCED',
      'NATIONS_ELIMINATED',
      'NATIONS_WORLD_FINAL_QUALIFIED',
      'NATIONS_HOST_SELECTED',
      'NATIONS_FINAL_RESULT',
      'NATIONS_CHAMPION'
    ]);

  v_pass:=v_required_notifications=15;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','notification_lifecycle',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'required',15,
      'present_active',v_required_notifications
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select exists(
    select 1
    from cron.job j
    where j.jobname='national-association-nations-runtime-v1'
      and j.active=true
      and j.schedule='*/15 * * * *'
      and j.command ilike '%process_national_association_nations_runtime_v4%'
  ) into v_cron_ok;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','automatic_runtime',
    'status',case when v_cron_ok then 'pass' else 'fail' end,
    'detail','15-minute National Association / World Nations maintenance job uses runtime v4.'
  ));
  if not v_cron_ok then v_failures:=v_failures+1; end if;

  v_health:=public.check_nations_operations_health_v1();
  v_pass:=coalesce(v_health->>'status','error')='success';

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','current_operations_health',
    'status',case when v_pass then 'pass' else 'warning' end,
    'detail',v_health
  ));
  if not v_pass then v_warnings:=v_warnings+1; end if;

  return jsonb_build_object(
    'status',case when v_failures=0 then 'pass' else 'fail' end,
    'association_count_tested',v_count,
    'failures',v_failures,
    'warnings',v_warnings,
    'checks',v_checks,
    'summary',case
      when v_failures=0 and v_warnings=0 then
        format('World Nations E2E contract validation passed for %s-association stress field.',v_count)
      when v_failures=0 then
        format('World Nations E2E contract validation passed with %s warning(s).',v_warnings)
      else
        format('World Nations E2E contract validation found %s failure(s) and %s warning(s).',v_failures,v_warnings)
    end
  );
end;
$function$;

revoke all on function private.run_nations_e2e_validation_core_v1(integer)
from public,anon,authenticated;

create or replace function public.run_admin_nations_e2e_validation_v1(
  p_association_count integer default 48
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return private.run_nations_e2e_validation_core_v1(p_association_count);
end;
$function$;

revoke all on function public.run_admin_nations_e2e_validation_v1(integer)
from public,anon;
grant execute on function public.run_admin_nations_e2e_validation_v1(integer)
to authenticated;
