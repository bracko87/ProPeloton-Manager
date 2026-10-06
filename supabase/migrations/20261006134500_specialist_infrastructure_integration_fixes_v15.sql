-- Close two legacy integration gaps from specialist infrastructure v14.
-- 1) Recurring-cost summary uses the same housing model as the real weekly charge.
-- 2) Team Time Trial Center is injected after TTT state creation.
--    Its +5% pacing-efficiency rating maps to a balanced 0.5% elapsed-time gain,
--    rather than an unrealistic raw 5% time reduction.

create or replace function public.get_club_team_policy_recurring_costs(
  p_club_id uuid
)
returns table(
  club_id uuid,
  active_rider_count integer,
  active_staff_count integer,
  housing_monthly_cost integer,
  nutrition_weekly_cost integer,
  recovery_weekly_cost integer,
  logistics_weekly_cost integer,
  staff_support_monthly_cost integer,
  vehicle_monthly_cost integer,
  weekly_total integer,
  monthly_total integer
)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_policy public.club_team_policies;
  v_rider_count integer:=0;
  v_staff_count integer:=0;
  v_housing_weekly_unit integer:=0;
  v_housing_weekly_total integer:=0;
  v_housing_monthly_total integer:=0;
  v_nutrition_rate integer:=0;
  v_recovery_rate integer:=0;
  v_logistics_rate integer:=0;
  v_staff_support_rate integer:=0;
  v_vehicle_rate integer:=0;
begin
  v_policy:=public.ensure_club_team_policies(p_club_id);

  select count(*) into v_rider_count
  from public.club_riders cr
  where cr.club_id=p_club_id;

  select count(*) into v_staff_count
  from public.club_staff cs
  where cs.club_id=p_club_id and cs.is_active=true;

  select coalesce(c.base_cost,0) into v_housing_weekly_unit
  from public.team_policy_option_catalog c
  where c.policy_key='rider_housing_support'
    and c.option_code=v_policy.rider_housing_support
    and c.is_active=true
  limit 1;
  v_housing_weekly_unit:=coalesce(v_housing_weekly_unit,0);

  if public.team_residential_campus_active_v1(p_club_id) then
    v_housing_weekly_unit:=0;
  end if;

  v_housing_weekly_total:=
    (v_rider_count+v_staff_count)*v_housing_weekly_unit;
  v_housing_monthly_total:=v_housing_weekly_total*4;

  select coalesce(c.base_cost,0) into v_nutrition_rate
  from public.team_policy_option_catalog c
  where c.policy_key='nutrition_support_level'
    and c.option_code=v_policy.nutrition_support_level
    and c.is_active=true
  limit 1;

  select coalesce(c.base_cost,0) into v_recovery_rate
  from public.team_policy_option_catalog c
  where c.policy_key='recovery_support_level'
    and c.option_code=v_policy.recovery_support_level
    and c.is_active=true
  limit 1;

  select coalesce(c.base_cost,0) into v_logistics_rate
  from public.team_policy_option_catalog c
  where c.policy_key='logistics_support_level'
    and c.option_code=v_policy.logistics_support_level
    and c.is_active=true
  limit 1;

  v_staff_support_rate:=0;

  v_vehicle_rate:=case v_policy.team_vehicle_policy
    when 'small_fleet' then 3000
    when 'full_fleet' then 7000
    else 0
  end;

  return query
  select
    p_club_id,
    v_rider_count,
    v_staff_count,
    v_housing_monthly_total,
    coalesce(v_nutrition_rate,0),
    coalesce(v_recovery_rate,0),
    coalesce(v_logistics_rate,0),
    0,
    v_vehicle_rate,
    (
      v_housing_weekly_total+
      coalesce(v_nutrition_rate,0)+
      coalesce(v_recovery_rate,0)+
      coalesce(v_logistics_rate,0)
    )::integer,
    (
      v_housing_monthly_total+
      4*(
        coalesce(v_nutrition_rate,0)+
        coalesce(v_recovery_rate,0)+
        coalesce(v_logistics_rate,0)
      )+
      v_vehicle_rate
    )::integer;
end;
$function$;

create or replace function public.apply_team_time_trial_center_bonus_v1(
  p_simulation_run_id uuid
)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_count integer:=0;
begin
  with eligible as (
    select ts.id,ts.team_id
    from public.race_stage_team_states ts
    join public.clubs c on c.id=ts.team_id
    join public.club_infrastructure ci
      on ci.club_id=case when c.club_type='developing'
        then coalesce(c.parent_club_id,c.id) else c.id end
    where ts.simulation_run_id=p_simulation_run_id
      and ci.team_time_trial_center_level>=1
      and not coalesce((ts.metadata->>'ttt_center_bonus_applied')::boolean,false)
  )
  update public.race_stage_team_states ts
  set
    -- +5% formation/pacing efficiency is intentionally translated into a
    -- 0.5% elapsed-time gain. A literal -5% time would be race-breaking.
    team_finish_time_seconds=
      greatest(1,round(ts.team_finish_time_seconds*0.995)::integer),
    team_work_score=round(coalesce(ts.team_work_score,0)*1.05,4),
    metadata=coalesce(ts.metadata,'{}'::jsonb)||jsonb_build_object(
      'ttt_center_bonus_applied',true,
      'ttt_center_pacing_efficiency_bonus_bps',500,
      'ttt_center_elapsed_time_modifier',0.995,
      'ttt_center_effect_version','ttt_center_v2'
    )
  from eligible e
  where ts.id=e.id;

  get diagnostics v_count=row_count;

  update public.race_stage_rider_states rs
  set
    finish_time_seconds=
      greatest(1,round(rs.finish_time_seconds*0.995)::integer),
    metadata=coalesce(rs.metadata,'{}'::jsonb)||jsonb_build_object(
      'ttt_center_bonus_applied',true,
      'ttt_center_pacing_efficiency_bonus_bps',500,
      'ttt_center_elapsed_time_modifier',0.995,
      'ttt_center_effect_version','ttt_center_v2'
    )
  where rs.simulation_run_id=p_simulation_run_id
    and coalesce((rs.metadata->>'is_dropped_rider')::boolean,false)=false
    and exists(
      select 1
      from public.clubs c
      join public.club_infrastructure ci
        on ci.club_id=case when c.club_type='developing'
          then coalesce(c.parent_club_id,c.id) else c.id end
      where c.id=rs.team_id and ci.team_time_trial_center_level>=1
    );

  with ranked as (
    select id,row_number() over(
      order by team_finish_time_seconds,team_id
    )::integer new_rank
    from public.race_stage_team_states
    where simulation_run_id=p_simulation_run_id
  )
  update public.race_stage_team_states ts
  set team_rank=r.new_rank
  from ranked r
  where ts.id=r.id;

  return v_count;
end;
$function$;

do $patch_ttt_runner_v2$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.run_race_stage_team_time_trial_v1(uuid)'::regprocedure
  );

  if position('apply_team_time_trial_center_bonus_v1' in ddl)=0 then
    ddl:=regexp_replace(
      ddl,
      '(v_state_result[[:space:]]*:=[[:space:]]*public[.]race_engine_write_team_time_trial_states_v1[(][[:space:]]*v_run_id[[:space:]]*[)][[:space:]]*;)',
      E'\\1\n\n  perform public.apply_team_time_trial_center_bonus_v1(v_run_id);',
      'n'
    );
  end if;

  if position('apply_team_time_trial_center_bonus_v1' in ddl)=0 then
    raise exception 'Could not patch Team Time Trial runner with specialist facility hook';
  end if;

  execute ddl;
end;
$patch_ttt_runner_v2$;

select public.monitor_special_infrastructure_health_v1();
