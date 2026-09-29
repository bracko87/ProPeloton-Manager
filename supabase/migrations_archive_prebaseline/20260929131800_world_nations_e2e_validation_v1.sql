create or replace function private.world_nations_e2e_validation_core_v3()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_checks jsonb:='[]'::jsonb;
  v_plan jsonb;
  v_mask1 int4range;
  v_mask2 int4range;
  v_passed integer:=0;
  v_failed integer:=0;
  v_condition boolean;
  v_health jsonb;
  v_cfg public.national_association_config%rowtype;
begin
  select * into v_cfg
  from public.national_association_config
  where id=true;

  v_plan:=public.nations_qualification_plan_v1(50);
  v_condition :=
    jsonb_array_length(coalesce(v_plan->'rounds','[]'::jsonb))=3
    and (v_plan#>>'{rounds,0,entrants_target}')::integer=50
    and (v_plan#>>'{rounds,0,advance_target}')::integer=32
    and (v_plan#>>'{rounds,1,entrants_target}')::integer=32
    and (v_plan#>>'{rounds,1,advance_target}')::integer=16
    and (v_plan#>>'{rounds,2,entrants_target}')::integer=16
    and (v_plan#>>'{rounds,2,advance_target}')::integer=1;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_50_to_32_to_16',
    'passed',v_condition,
    'details',v_plan
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select bool_and(
    coalesce((p->>'finalist_target')::integer,0)=least(n,16)
    and jsonb_array_length(coalesce(p->'rounds','[]'::jsonb))>=2
    and (p#>>array['rounds',(jsonb_array_length(p->'rounds')-1)::text,'round_type'])='world_final'
    and (p#>>array['rounds',(jsonb_array_length(p->'rounds')-1)::text,'entrants_target'])::integer=least(n,16)
  )
  into v_condition
  from (
    select n,public.nations_qualification_plan_v1(n) p
    from unnest(array[5,16,17,25,32,33,40,50,64,65,80,100,128]) n
  ) q;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_scalability_5_to_128',
    'passed',coalesce(v_condition,false),
    'details','Representative field sizes from 5 through 128 preserve the dynamic qualification pyramid and World Final target.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
    public.calculate_nation_road_race_points_v1(array[1,2,3,4,5])=106
    and public.calculate_nation_road_race_points_v1(array[1])=40;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','road_points_best_three_only',
    'passed',v_condition,
    'details',jsonb_build_object(
      'positions_1_to_5',public.calculate_nation_road_race_points_v1(array[1,2,3,4,5]),
      'expected',106
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
    public.nations_ttt_points_v1(1)=70
    and public.nations_ttt_points_v1(16)=4
    and public.nations_ttt_points_v1(17)=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','ttt_points_curve',
    'passed',v_condition,
    'details',jsonb_build_object(
      'first',public.nations_ttt_points_v1(1),
      'sixteenth',public.nations_ttt_points_v1(16),
      'outside_curve',public.nations_ttt_points_v1(17)
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_mask1:=private.national_coach_masked_overall_bounds_v1(
    '11111111-1111-1111-1111-111111111111'::uuid,82,1
  );
  v_mask2:=private.national_coach_masked_overall_bounds_v1(
    '11111111-1111-1111-1111-111111111111'::uuid,82,1
  );
  v_condition :=
    v_mask1=v_mask2
    and v_mask1 @> 82
    and (upper(v_mask1)-lower(v_mask1)-1)<=v_cfg.masked_overall_span;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','masked_overall_stable_and_narrow',
    'passed',v_condition,
    'details',jsonb_build_object(
      'first_call',v_mask1::text,
      'second_call',v_mask2::text,
      'true_overall',82,
      'configured_span',v_cfg.masked_overall_span
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select
    not exists(
      select 1
      from information_schema.tables
      where table_schema='public'
        and table_name ilike 'national_association%treasury%'
    )
    and exists(
      select 1 from public.national_team_standard_assets
      where asset_key='team_car' and asset_level=5 and quantity=10 and is_active
    )
    and (select count(*) from public.national_team_standard_equipment where is_active)=18
    and exists(select 1 from public.national_team_standard_supplies where supply_key='energy_gels' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='bidons_water_bottles' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='nutrition_packs' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='race_jersey_complete' and quantity=50 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='rain_jackets' and quantity=50 and is_active)
  into v_condition;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','standard_package_no_treasury',
    'passed',coalesce(v_condition,false),
    'details','No Association treasury exists. 10 level-5 team cars, 18 fixed equipment models, 250 bidons, 250 gels, 250 nutrition packs, 50 jerseys and 50 rain jackets are system-provided.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
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
    and v_cfg.max_active_callups=15
    and v_cfg.callup_response_days=7;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','association_election_and_team_config',
    'passed',coalesce(v_condition,false),
    'details',jsonb_build_object(
      'minimum_members',v_cfg.minimum_active_members,
      'registration','Jan 1-10',
      'round1','Jan 10-20',
      'round2','Jan 20-27',
      'repeat_runoff_days',v_cfg.repeated_runoff_days,
      'squad_size',v_cfg.national_squad_size,
      'lineup_size',v_cfg.national_lineup_size,
      'max_lineup_changes',v_cfg.max_lineup_changes
    )
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select
    to_regprocedure('public.ensure_nations_group_event_race_v1(uuid)') is not null
    and to_regprocedure('public.sync_nations_group_event_participants_v1(uuid)') is not null
    and to_regprocedure('public.process_nations_group_results_v1(uuid)') is not null
    and to_regprocedure('public.refresh_nations_group_partial_scores_v1(uuid)') is not null
    and exists(
      select 1 from cron.job
      where jobname='national-association-nations-runtime-v1'
        and active
        and command ilike '%process_national_association_nations_runtime_v4%'
    )
  into v_condition;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','race_runtime_wiring',
    'passed',coalesce(v_condition,false),
    'details','Race creation, participant sync, result processing, live score refresh and runtime v4 are installed.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select count(*)=17
  into v_condition
  from public.notification_types
  where code in (
    'NATIONAL_ASSOCIATION_ACTIVATED',
    'NATIONAL_COACH_ELECTION_OPEN',
    'NATIONAL_COACH_VOTING_OPEN',
    'NATIONAL_COACH_RUNOFF_OPEN',
    'NATIONAL_COACH_ELECTED',
    'NATIONAL_TEAM_CALLUP_RECEIVED',
    'NATIONAL_TEAM_CALLUP_RESPONSE',
    'NATIONAL_TEAM_SQUAD_CONFIRMED',
    'NATIONAL_TEAM_DUTY_STARTED',
    'NATIONAL_TEAM_DUTY_COMPLETED',
    'NATIONS_QUALIFICATION_DRAW',
    'NATIONS_RACE_RESULT',
    'NATIONS_ADVANCED',
    'NATIONS_ELIMINATED',
    'NATIONS_WORLD_FINAL_QUALIFIED',
    'NATIONS_FINAL_RESULT',
    'NATIONS_CHAMPION'
  ) and is_active;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','notification_lifecycle',
    'passed',coalesce(v_condition,false),
    'details','Association, election, call-up, National Duty, race-day, advancement and final-result notification types are active.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_health:=public.check_nations_operations_health_v1();
  v_condition:=coalesce(v_health->>'status','error')='success';
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','current_runtime_health',
    'passed',v_condition,
    'details',v_health
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','exact_tie_after_all_four_tiebreaks',
    'passed',false,
    'severity','design_decision_required',
    'details','An exact tie after total points, race wins, podiums, TTT placing and best Day 3 rider placing still returns unresolved_tie_at_cutoff. A final sporting fallback rule is still required.'
  ));
  v_failed:=v_failed+1;

  return jsonb_build_object(
    'status',case when v_failed=0 then 'passed' else 'attention_required' end,
    'mode','non_destructive_validation',
    'passed_checks',v_passed,
    'failed_checks',v_failed,
    'checks',v_checks
  );
end;
$function$;

revoke all on function private.world_nations_e2e_validation_core_v3()
from public,anon,authenticated;

create or replace function public.run_admin_world_nations_e2e_validation_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;
  return private.world_nations_e2e_validation_core_v3();
end;
$function$;

revoke all on function public.run_admin_world_nations_e2e_validation_v1()
from public,anon;
grant execute on function public.run_admin_world_nations_e2e_validation_v1()
to authenticated;
