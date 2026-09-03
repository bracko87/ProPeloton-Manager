create or replace function public.race_startlist_engine_readiness_v1(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_current_game_at timestamp without time zone;
  v_team_list_finalized boolean := false;
  v_rider_deadline timestamp without time zone;
  v_min_teams integer := 0;
  v_min_riders integer := 0;
  v_max_riders integer := 999;
  v_eligible_teams integer := 0;
  v_missing_team_snapshots integer := 0;
  v_invalid_rider_sizes integer := 0;
  v_missing_start_numbers integer := 0;
  v_invalid_captains integer := 0;
  v_unexpected_rider_teams integer := 0;
  v_ready boolean := false;
  v_reason text := 'unknown';
begin
  if p_race_id is null then
    return jsonb_build_object('ready',false,'reason','race_id_required');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  select
    lower(coalesce(r.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes'),
    coalesce(
      rules.rider_submission_deadline_game_at,
      coalesce(
        rules.rider_submission_deadline::date,
        make_date(1999 + rules.rider_submission_deadline_season_number::integer,
                  rules.rider_submission_deadline_month_number::integer,
                  rules.rider_submission_deadline_day_number::integer),
        r.start_date::date - 3
      )::timestamp
    ),
    coalesce(rules.min_teams,0),
    coalesce(rules.min_riders_per_team,0),
    coalesce(rules.max_riders_per_team,999)
  into v_team_list_finalized,v_rider_deadline,v_min_teams,v_min_riders,v_max_riders
  from public.races r
  join public.race_entry_rules rules on rules.race_id=r.id
  where r.id=p_race_id;

  if not found then
    return jsonb_build_object('ready',false,'reason','race_or_entry_rules_not_found','race_id',p_race_id);
  end if;

  with eligible as (
    select distinct coalesce(e.participating_club_id,e.club_id) as team_id
    from public.race_team_entries e
    left join lateral (
      select p.status,p.startlist_status
      from public.race_preparations p
      where p.race_id=e.race_id and p.club_id=e.club_id
      order by p.updated_at desc nulls last,p.id desc
      limit 1
    ) latest_preparation on true
    where e.race_id=p_race_id
      and e.status in ('accepted','confirmed')
      and e.missed_startlist_at is null
      and coalesce(latest_preparation.status,'') <> 'missed_startlist'
      and coalesce(latest_preparation.startlist_status,'') <> 'missed_startlist'
      and coalesce(e.participating_club_id,e.club_id) is not null
  ),
  per_team as (
    select e.team_id,
      count(r.rider_id)::integer as rider_count,
      count(r.rider_id) filter (where public.race_role_is_captain_v1(r.role_snapshot))::integer as captain_count,
      min(r.start_number) as first_team_start_number,
      min(r.start_number) filter (where public.race_role_is_captain_v1(r.role_snapshot)) as captain_start_number,
      count(r.rider_id) filter (where r.start_number is null)::integer as missing_numbers
    from eligible e
    left join public.race_participant_riders r on r.race_id=p_race_id and r.team_id=e.team_id
    group by e.team_id
  ),
  counts as (
    select
      (select count(*)::integer from eligible) as eligible_teams,
      (select count(*)::integer from eligible e where not exists (
        select 1 from public.race_participant_teams_v1 t
        where t.race_id=p_race_id and lower(coalesce(t.status,'accepted'))='accepted' and t.club_id=e.team_id
      )) as missing_team_snapshots,
      (select count(*)::integer from per_team where rider_count < v_min_riders or rider_count > v_max_riders) as invalid_rider_sizes,
      (select coalesce(sum(missing_numbers),0)::integer from per_team) as missing_start_numbers,
      (select count(*)::integer from per_team where captain_count <> 1 or captain_start_number is distinct from first_team_start_number) as invalid_captains,
      (select count(distinct r.team_id)::integer from public.race_participant_riders r
       where r.race_id=p_race_id and not exists (select 1 from eligible e where e.team_id=r.team_id)) as unexpected_rider_teams
  )
  select eligible_teams,missing_team_snapshots,invalid_rider_sizes,missing_start_numbers,invalid_captains,unexpected_rider_teams
  into v_eligible_teams,v_missing_team_snapshots,v_invalid_rider_sizes,v_missing_start_numbers,v_invalid_captains,v_unexpected_rider_teams
  from counts;

  v_ready := v_team_list_finalized
    and v_current_game_at >= v_rider_deadline
    and v_eligible_teams >= v_min_teams
    and v_missing_team_snapshots = 0
    and v_invalid_rider_sizes = 0
    and v_missing_start_numbers = 0
    and v_invalid_captains = 0
    and v_unexpected_rider_teams = 0;

  v_reason := case
    when not v_team_list_finalized then 'team_list_not_finalized'
    when v_current_game_at < v_rider_deadline then 'rider_deadline_not_reached'
    when v_eligible_teams < v_min_teams then 'insufficient_eligible_teams'
    when v_missing_team_snapshots > 0 then 'missing_participant_team_snapshots'
    when v_invalid_rider_sizes > 0 then 'invalid_team_rider_counts'
    when v_missing_start_numbers > 0 then 'missing_start_numbers'
    when v_invalid_captains > 0 then 'invalid_team_captains'
    when v_unexpected_rider_teams > 0 then 'unexpected_participant_rider_teams'
    else 'ready'
  end;

  return jsonb_build_object(
    'ready',v_ready,'reason',v_reason,'race_id',p_race_id,'current_game_at',v_current_game_at,
    'rider_deadline_game_at',v_rider_deadline,'team_list_finalized',v_team_list_finalized,
    'minimum_teams',v_min_teams,'eligible_teams',v_eligible_teams,
    'minimum_riders_per_team',v_min_riders,'maximum_riders_per_team',v_max_riders,
    'missing_participant_team_snapshots',v_missing_team_snapshots,
    'invalid_team_rider_counts',v_invalid_rider_sizes,'missing_start_numbers',v_missing_start_numbers,
    'invalid_team_captains',v_invalid_captains,'unexpected_participant_rider_teams',v_unexpected_rider_teams
  );
end;
$function$;

create or replace function public.race_startlist_engine_ready_v1(p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select coalesce((public.race_startlist_engine_readiness_v1(p_race_id)->>'ready')::boolean,false);
$function$;

create or replace function public.reconcile_race_startlist_engine_readiness_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_readiness jsonb;
  v_changed boolean := false;
begin
  v_readiness := public.race_startlist_engine_readiness_v1(p_race_id);
  if coalesce((v_readiness->>'ready')::boolean,false) then
    update public.races r
    set metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object(
          'race_startlist_captains_finalized',true,
          'race_startlist_captains_finalized_at',coalesce(nullif(r.metadata->>'race_startlist_captains_finalized_at','')::timestamptz,now()),
          'captains_pending_rider_deadline',false,
          'race_startlist_engine_reconciled',true,
          'race_startlist_engine_reconciled_at',now(),
          'race_startlist_engine_reconciliation_model','snapshot_invariants_v1'
        ),updated_at=now()
    where r.id=p_race_id
      and lower(coalesce(r.metadata->>'race_startlist_captains_finalized','false')) not in ('true','1','yes');
    get diagnostics v_changed = row_count;
  end if;
  return jsonb_build_object('race_id',p_race_id,'changed',v_changed,'readiness',v_readiness);
end;
$function$;

create or replace function public.universal_race_stage_claim_calculation_v1(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_stage record;
  v_previous_stage_id uuid;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_existing_run public.race_stage_simulation_runs%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_run_id uuid;
  v_payload jsonb;
  v_startlist_readiness jsonb;
  v_startlist_reconciliation jsonb;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||p_stage_id::text,0));
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or v_control.active_engine<>'typescript_v1' or not v_control.typescript_execution_enabled
     or v_control.legacy_execution_enabled or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','reason','phase11b_lifecycle_not_enabled');
  end if;
  if v_control.typescript_activation_game_at is null then
    return jsonb_build_object('status','disabled','reason','production_activation_game_boundary_missing');
  end if;

  select stage.id,stage.race_id,stage.stage_number,stage.stage_date,stage.planned_start_hour_number,
         stage.planned_start_minute,lower(coalesce(stage.stage_format,'road_race')) stage_format,
         coalesce(stage.weather_cancelled,false) weather_cancelled
  into v_stage from public.race_stages stage where stage.id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;
  if v_stage.weather_cancelled then return jsonb_build_object('status','skipped','reason','weather_cancelled','stage_id',p_stage_id); end if;

  v_stage_start_game_at:=v_stage.stage_date::timestamp+make_interval(hours=>coalesce(v_stage.planned_start_hour_number,12),mins=>coalesce(v_stage.planned_start_minute,0));
  v_calculation_due_game_at:=v_stage_start_game_at-make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  if v_stage_start_game_at < v_control.typescript_activation_game_at then
    return jsonb_build_object('status','blocked','reason','before_phase11b_activation_boundary','stage_id',p_stage_id,'stage_start_game_at',v_stage_start_game_at,'activation_game_at',v_control.typescript_activation_game_at);
  end if;
  if v_current_game_at < v_calculation_due_game_at then
    return jsonb_build_object('status','not_due','stage_id',p_stage_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at);
  end if;

  v_startlist_readiness:=public.race_startlist_engine_readiness_v1(v_stage.race_id);
  if not coalesce((v_startlist_readiness->>'ready')::boolean,false) then
    return jsonb_build_object('status','blocked','reason','race_startlist_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,'startlist_readiness',v_startlist_readiness);
  end if;
  v_startlist_reconciliation:=public.reconcile_race_startlist_engine_readiness_v1(v_stage.race_id);

  select previous.id into v_previous_stage_id
  from public.race_stages previous
  where previous.race_id=v_stage.race_id and previous.stage_number<v_stage.stage_number
    and not coalesce(previous.weather_cancelled,false)
  order by previous.stage_number desc limit 1;

  if v_previous_stage_id is not null and not exists (
    select 1 from public.race_stage_authoritative_runs authority
    join public.race_stage_simulation_runs previous_run on previous_run.id=authority.simulation_run_id
    where authority.stage_id=v_previous_stage_id and authority.engine_version='race_engine_ts_v1'
      and authority.simulation_mode='deterministic_road_race_v1' and previous_run.status='completed'
      and coalesce((previous_run.result_summary_json->>'results_published')::boolean,false)
  ) then
    return jsonb_build_object('status','blocked','reason','previous_stage_not_published','stage_id',p_stage_id,'previous_stage_id',v_previous_stage_id);
  end if;

  select run.* into v_existing_run from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1'
    and run.simulation_mode='deterministic_road_race_v1' and run.status in ('running','completed')
    and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
  order by run.updated_at desc,run.created_at desc,run.id desc limit 1;
  if found then
    return jsonb_build_object('status',case when coalesce(v_existing_run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1' then 'already_calculated' else 'already_claimed' end,
      'stage_id',p_stage_id,'simulation_run_id',v_existing_run.id,'run_status',v_existing_run.status);
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);
  insert into public.race_stage_simulation_runs(race_id,stage_id,status,engine_version,simulation_mode,started_at,input_snapshot_json,result_summary_json)
  values(v_stage.race_id,p_stage_id,'running','race_engine_ts_v1','deterministic_road_race_v1',clock_timestamp(),'{}'::jsonb,
    jsonb_build_object('calculation_contract','phase11b_claim_pending_v1','calculation_status','claimed','claimed_at_real',clock_timestamp(),
      'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
      'official_outputs_persisted',false,'phase11_persistence_applied',false,'results_published',false,'verification_only',false,
      'startlist_readiness',v_startlist_readiness,'startlist_reconciliation',v_startlist_reconciliation))
  returning id into v_run_id;

  insert into public.race_stage_automation_state(stage_id,race_id,scheduled_game_at,last_status,simulation_run_id,attempt_count,last_checked_at,last_started_at,last_error,details,updated_at)
  values(p_stage_id,v_stage.race_id,v_stage_start_game_at,'calculating',v_run_id,1,clock_timestamp(),clock_timestamp(),null,
    jsonb_build_object('contract','phase11b_universal_production_lifecycle_v1','calculation_due_game_at',v_calculation_due_game_at,
      'stage_start_game_at',v_stage_start_game_at,'replay_duration_real_seconds',coalesce(v_control.typescript_replay_duration_real_seconds,900),
      'worker_version','netlify_phase11b_v1','verification_only',false,'startlist_readiness_model','snapshot_invariants_v1'),clock_timestamp())
  on conflict(stage_id) do update set race_id=excluded.race_id,scheduled_game_at=excluded.scheduled_game_at,last_status=excluded.last_status,
    simulation_run_id=excluded.simulation_run_id,attempt_count=public.race_stage_automation_state.attempt_count+1,last_checked_at=excluded.last_checked_at,
    last_started_at=excluded.last_started_at,last_error=null,details=coalesce(public.race_stage_automation_state.details,'{}'::jsonb)||excluded.details,updated_at=excluded.updated_at;

  v_payload:=public.universal_race_stage_get_calculation_payload_v1(p_stage_id);
  return jsonb_build_object('status','claimed','contract','universal_race_stage_calculation_claim_v2_phase11b','stage_id',p_stage_id,
    'race_id',v_stage.race_id,'simulation_run_id',v_run_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,
    'stage_start_game_at',v_stage_start_game_at,'stage_format',v_stage.stage_format,'startlist_readiness',v_startlist_readiness,'payload',v_payload);
end;
$function$;

create or replace function public.universal_race_stage_claim_next_due_v1(p_worker_id text default 'netlify_phase11b_v1'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_id uuid;
  v_claim jsonb;
begin
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then return jsonb_build_object('status','disabled'); end if;
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  for v_stage_id in
    select stage.id from public.race_stages stage join public.races race on race.id=stage.race_id
    where not coalesce(stage.weather_cancelled,false)
      and stage.planned_start_hour_number is not null
      and public.race_startlist_engine_ready_v1(stage.race_id)
      and stage.stage_date::timestamp+make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0)) >= v_control.typescript_activation_game_at
      and stage.stage_date::timestamp+make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0))
          -make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3)) <= v_current_game_at
      and not exists(select 1 from public.race_stage_authoritative_runs authority where authority.stage_id=stage.id)
      and not exists(select 1 from public.race_stage_simulation_runs run where run.stage_id=stage.id and run.engine_version='race_engine_ts_v1'
        and run.simulation_mode='deterministic_road_race_v1' and run.status in ('running','completed')
        and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1'))
      and not exists(select 1 from public.race_stage_simulation_runs failed_run where failed_run.stage_id=stage.id
        and failed_run.engine_version='race_engine_ts_v1' and failed_run.simulation_mode='deterministic_road_race_v1'
        and failed_run.status='failed' and failed_run.failed_at is not null and failed_run.failed_at>clock_timestamp()-interval '10 minutes')
    order by stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,stage.race_id,stage.stage_number
    limit 20
  loop
    v_claim:=public.universal_race_stage_claim_calculation_v1(v_stage_id);
    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim||jsonb_build_object('worker_id',coalesce(nullif(p_worker_id,''),'netlify_phase11b_v1'));
    end if;
  end loop;
  return jsonb_build_object('status','no_due_stage','current_game_at',v_current_game_at);
end;
$function$;

grant execute on function public.race_startlist_engine_readiness_v1(uuid) to authenticated,service_role;
grant execute on function public.race_startlist_engine_ready_v1(uuid) to authenticated,service_role;
grant execute on function public.reconcile_race_startlist_engine_readiness_v1(uuid) to service_role;