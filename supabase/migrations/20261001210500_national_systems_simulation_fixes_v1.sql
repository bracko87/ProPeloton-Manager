-- Fixes discovered by the full National Ranking + National Association Season 2 rollback rehearsal.
--
-- 1) Selection notifications referenced x.qualifying_places without selecting it,
--    which blocked National Championship freeze -> invitation processing.
-- 2) The non-destructive World Nations validator still expected the retired
--    50 -> 32 -> 16 structure instead of the current 50 -> four qualification
--    groups -> 16-team World Final structure.

CREATE OR REPLACE FUNCTION public.national_championship_notify_selection_v1(p_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer:=0;
  v_country_name text;
  v_event_date date;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    return 0;
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=upper(e.country_code)
  limit 1;

  v_country_name:=coalesce(v_country_name,e.country_code);

  for x in
    select
      en.rider_id,
      en.rider_name_snapshot,
      en.entry_path,
      en.heat_number,
      en.participation_decision,
      h.qualification_date,
      h.qualifying_places,
      root.owner_user_id
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root on root.id=case
      when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id
      else rc.id
    end
    where en.edition_id=e.id
      and en.participation_decision='pending'
      and root.owner_user_id is not null
  loop
    v_event_date:=case
      when x.entry_path='qualification' then x.qualification_date
      else e.final_date
    end;

    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_name_snapshot||' selected for National Championship',
      x.rider_name_snapshot||' is selected for the '||v_country_name||' National Championship. '||
      case
        when x.entry_path='qualification' then
          'Qualification Group '||coalesce(x.heat_number,1)||' races on '||x.qualification_date||
          '. The first '||coalesce(x.qualifying_places,0)||' rider(s) from this group advance to the final on '||e.final_date||'. '
        else
          'No qualification is required; the final is on '||e.final_date||'. '
      end||
      'Approve or refuse participation before '||e.participation_decision_deadline||
      '. If approved, the rider is locked from '||(v_event_date-1)||' through '||(v_event_date+1)||
      ' and cannot participate in another race during that Championship lock window.',
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'edition_id',e.id,
        'country_code',e.country_code,
        'country_name',v_country_name,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'entry_path',x.entry_path,
        'heat_number',x.heat_number,
        'qualification_date',x.qualification_date,
        'qualifying_places',x.qualifying_places,
        'final_date',e.final_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'lock_window_start',v_event_date-1,
        'lock_window_end',v_event_date+1,
        'action_path','/dashboard/national-ranking?tab=duty',
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'
      ),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text
    );

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION private.world_nations_e2e_validation_core_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    jsonb_array_length(coalesce(v_plan->'rounds','[]'::jsonb))=2
    and (v_plan#>>'{rounds,0,round_type}')='final_qualification'
    and (v_plan#>>'{rounds,0,entrants_target}')::integer=50
    and (v_plan#>>'{rounds,0,advance_target}')::integer=16
    and (v_plan#>>'{rounds,0,group_count}')::integer=4
    and (v_plan#>>'{rounds,0,group_size_min}')::integer=12
    and (v_plan#>>'{rounds,0,group_size_max}')::integer=16
    and (v_plan#>>'{rounds,1,round_type}')='world_final'
    and (v_plan#>>'{rounds,1,entrants_target}')::integer=16
    and (v_plan#>>'{rounds,1,advance_target}')::integer=1;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_50_to_16_final',
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
    and exists(select 1 from public.national_team_standard_supplies where supply_key='energy_gel' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='water_bottle' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='nutrition_pack' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='race_jersey_complete' and quantity=50 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='rain_jacket' and quantity=50 and is_active)
  into v_condition;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','standard_package_no_treasury',
    'passed',coalesce(v_condition,false),
    'details','No Association treasury table exists; the fixed National Team package is system-provided.'
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
