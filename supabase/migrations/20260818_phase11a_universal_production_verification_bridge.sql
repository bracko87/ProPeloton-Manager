-- PPM Phase 11A1 — universal production verification bridge
--
-- Self-contained verification bridge for the CURRENT production schema.
-- Reuses:
--   * race_stage_simulation_runs
--   * existing cross-engine writer guards
--   * race_engine_runtime_control_v1
--   * existing Phase 1/9 production input RPCs
--
-- Phase 11A1 DOES NOT publish official results and DOES NOT mutate riders,
-- fatigue, supplies, equipment/assets, health cases, classifications or
-- historical authority rows. It stores only a hidden TypeScript simulation run
-- and exposes that exact stored output through a read-only replay RPC.
--
-- IMPORTANT: this migration does NOT activate TypeScript execution. Use the
-- separate controlled verification activation SQL only after preflight passes.

begin;

-- Base-schema prerequisites only. Do not require older universal lifecycle RPCs:
-- this migration owns the verification claim/fail/read bridge itself.
do $$
begin
  if to_regclass('public.race_stage_simulation_runs') is null then
    raise exception 'Phase 11A1 prerequisite missing: race_stage_simulation_runs';
  end if;
  if to_regclass('public.race_engine_runtime_control_v1') is null then
    raise exception 'Phase 11A1 prerequisite missing: race_engine_runtime_control_v1';
  end if;
  if to_regprocedure('public.race_engine_get_stage_rider_inputs_v1(uuid)') is null then
    raise exception 'Phase 11A1 prerequisite missing: race_engine_get_stage_rider_inputs_v1(uuid)';
  end if;
  if to_regprocedure('public.race_engine_get_stage_phase_commands_v1(uuid)') is null then
    raise exception 'Phase 11A1 prerequisite missing: race_engine_get_stage_phase_commands_v1(uuid)';
  end if;
  if to_regprocedure('public.race_engine_get_stage_phase9_inputs_v1(uuid)') is null then
    raise exception 'Phase 11A1 prerequisite missing: race_engine_get_stage_phase9_inputs_v1(uuid)';
  end if;
  if to_regprocedure('public.get_race_stage_pre_stage_leaders_v1(uuid)') is null then
    raise exception 'Phase 11A1 prerequisite missing: get_race_stage_pre_stage_leaders_v1(uuid)';
  end if;
  if to_regprocedure('public.get_race_stage_profile_detail_v1(uuid)') is null then
    raise exception 'Phase 11A1 prerequisite missing: get_race_stage_profile_detail_v1(uuid)';
  end if;
  if to_regprocedure('public.get_current_game_timestamp()') is null then
    raise exception 'Phase 11A1 prerequisite missing: get_current_game_timestamp()';
  end if;
end $$;

create or replace function public.universal_race_stage_get_calculation_payload_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_race_id uuid;
  v_race jsonb;
  v_stage jsonb;
  v_profile jsonb;
  v_rider_inputs jsonb;
  v_phase_commands jsonb;
  v_phase9_inputs jsonb;
  v_pre_stage_leaders jsonb;
  v_stage_points jsonb;
  v_participant_teams jsonb;
  v_participant_riders jsonb;
  v_stage_plans jsonb;
  v_stage_plan_riders jsonb;
  v_stage_start_game_at timestamp without time zone;
  v_lock_game_at timestamp without time zone;
begin
  if p_stage_id is null then
    raise exception using errcode = '22023', message = 'stage_id is required';
  end if;

  select
    stage.race_id,
    to_jsonb(stage),
    stage.stage_date::timestamp
      + make_interval(
          hours => coalesce(stage.planned_start_hour_number, 12),
          mins => coalesce(stage.planned_start_minute, 0)
        )
  into v_race_id, v_stage, v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_race_id is null then
    raise exception using errcode = 'P0002', message = format('Stage %s was not found.', p_stage_id);
  end if;

  v_lock_game_at := v_stage_start_game_at - interval '3 hours';

  select to_jsonb(race) into v_race
  from public.races race
  where race.id = v_race_id;

  v_profile := coalesce(public.get_race_stage_profile_detail_v1(p_stage_id), '{}'::jsonb);

  select coalesce(jsonb_agg(to_jsonb(row) order by row.team_id, row.rider_id), '[]'::jsonb)
  into v_rider_inputs
  from public.race_engine_get_stage_rider_inputs_v1(p_stage_id) row;

  select coalesce(jsonb_agg(to_jsonb(row) order by row.team_id, row.rider_id), '[]'::jsonb)
  into v_phase_commands
  from public.race_engine_get_stage_phase_commands_v1(p_stage_id) row;

  -- Phase 9 remains the sole calculation owner for preparation/resources.
  select coalesce(public.race_engine_get_stage_phase9_inputs_v1(p_stage_id), '{}'::jsonb)
  into v_phase9_inputs;

  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
  into v_pre_stage_leaders
  from public.get_race_stage_pre_stage_leaders_v1(p_stage_id) row;

  select coalesce(
    jsonb_agg(to_jsonb(point) order by point.sort_order, point.km_from_start, point.id),
    '[]'::jsonb
  ) into v_stage_points
  from public.race_stage_points point
  where point.stage_id = p_stage_id;

  select coalesce(jsonb_agg(to_jsonb(team) order by coalesce(team.team_id::text, team.club_id::text)), '[]'::jsonb)
  into v_participant_teams
  from public.race_participant_teams_v1 team
  where team.race_id = v_race_id
    and lower(coalesce(team.status, 'accepted')) = 'accepted';

  select coalesce(jsonb_agg(to_jsonb(rider) order by rider.start_number nulls last, rider.rider_id), '[]'::jsonb)
  into v_participant_riders
  from public.race_participant_riders_v1 rider
  where rider.race_id = v_race_id;

  select coalesce(
    jsonb_agg(
      to_jsonb(plan)
        || jsonb_build_object(
             'team_id', coalesce(preparation.participating_club_id, preparation.club_id),
             'club_id', preparation.club_id,
             'participating_club_id', preparation.participating_club_id,
             'race_preparation_status', preparation.status
           )
      order by coalesce(preparation.participating_club_id, preparation.club_id), plan.id
    ),
    '[]'::jsonb
  ) into v_stage_plans
  from public.race_stage_plans plan
  join public.race_preparations preparation on preparation.id = plan.race_preparation_id
  where plan.stage_id = p_stage_id;

  select coalesce(
    jsonb_agg(
      to_jsonb(plan_rider)
        || jsonb_build_object(
             'team_id', coalesce(preparation.participating_club_id, preparation.club_id),
             'race_stage_plan_id', plan.id
           )
      order by coalesce(preparation.participating_club_id, preparation.club_id), plan_rider.rider_id
    ),
    '[]'::jsonb
  ) into v_stage_plan_riders
  from public.race_stage_plan_riders plan_rider
  join public.race_stage_plans plan on plan.id = plan_rider.race_stage_plan_id
  join public.race_preparations preparation on preparation.id = plan.race_preparation_id
  where plan.stage_id = p_stage_id;

  return jsonb_build_object(
    'contract', 'universal_race_calculation_payload_v2_phase11a1',
    'race', coalesce(v_race, '{}'::jsonb),
    'stage', coalesce(v_stage, '{}'::jsonb),
    'profile', coalesce(v_profile, '{}'::jsonb),
    'participant_teams', coalesce(v_participant_teams, '[]'::jsonb),
    'participant_riders', coalesce(v_participant_riders, '[]'::jsonb),
    'rider_inputs', coalesce(v_rider_inputs, '[]'::jsonb),
    'phase_commands', coalesce(v_phase_commands, '[]'::jsonb),
    'phase9_inputs', coalesce(v_phase9_inputs, '{}'::jsonb),
    'pre_stage_leaders', coalesce(v_pre_stage_leaders, '[]'::jsonb),
    'stage_points', coalesce(v_stage_points, '[]'::jsonb),
    'locked_plans', coalesce(v_stage_plans, '[]'::jsonb),
    'stage_plan_riders', coalesce(v_stage_plan_riders, '[]'::jsonb),
    'lifecycle', jsonb_build_object(
      'lock_game_at', v_lock_game_at,
      'stage_start_game_at', v_stage_start_game_at,
      'replay_duration_real_seconds', 900,
      'official_outputs_persisted', false,
      'phase11_persistence_applied', false,
      'verification_only', true
    )
  );
end;
$function$;

-- Controlled verification claim. This function does not schedule itself and does
-- not activate TypeScript execution. The runtime-control row must already be in
-- the explicit TypeScript-only state before a claim can create a run.
create or replace function public.universal_race_stage_claim_calculation_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_stage record;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_existing_run public.race_stage_simulation_runs%rowtype;
  v_run_id uuid;
  v_payload jsonb;
begin
  if p_stage_id is null then
    return jsonb_build_object('status', 'blocked', 'reason', 'stage_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11a1_claim:' || p_stage_id::text, 0));

  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  if not found then
    return jsonb_build_object('status', 'blocked', 'reason', 'runtime_control_row_missing');
  end if;

  if v_control.active_engine <> 'typescript_v1'
     or not v_control.typescript_execution_enabled
     or v_control.legacy_execution_enabled
  then
    return jsonb_build_object(
      'status', 'disabled',
      'reason', 'typescript_verification_not_enabled',
      'runtime_control', to_jsonb(v_control)
    );
  end if;

  select
    stage.id,
    stage.race_id,
    stage.stage_number,
    stage.stage_date,
    stage.planned_start_hour_number,
    stage.planned_start_minute,
    lower(coalesce(stage.stage_format, 'road_race')) as stage_format
  into v_stage
  from public.race_stages stage
  where stage.id = p_stage_id;

  if not found then
    return jsonb_build_object('status', 'blocked', 'reason', 'stage_not_found', 'stage_id', p_stage_id);
  end if;

  -- Phase 11A production verification currently uses the accepted road-race path.
  if v_stage.stage_format not in ('road', 'road_race', 'classic', 'one_day', 'mass_start') then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'phase11a1_verification_currently_road_only',
      'stage_id', p_stage_id,
      'stage_format', v_stage.stage_format
    );
  end if;

  select run.* into v_existing_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and run.status in ('running', 'completed')
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') in (
      'phase11a1_claim_pending_v1',
      'universal_phase11a_calculated_hidden_v1'
    )
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status',
      case
        when coalesce(v_existing_run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11a_calculated_hidden_v1'
          then 'already_calculated'
        else 'already_claimed'
      end,
      'stage_id', p_stage_id,
      'simulation_run_id', v_existing_run.id,
      'run_status', v_existing_run.status
    );
  end if;

  -- Reuse the existing TypeScript database identity required by the installed
  -- cross-engine guards. The engine output itself still identifies as
  -- ppm_universal_race_v1 / version 1.
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  insert into public.race_stage_simulation_runs (
    race_id,
    stage_id,
    status,
    engine_version,
    simulation_mode,
    started_at,
    input_snapshot_json,
    result_summary_json
  ) values (
    v_stage.race_id,
    p_stage_id,
    'running',
    'race_engine_ts_v1',
    'deterministic_road_race_v1',
    clock_timestamp(),
    '{}'::jsonb,
    jsonb_build_object(
      'calculation_contract', 'phase11a1_claim_pending_v1',
      'claimed_at_real', clock_timestamp(),
      'official_outputs_persisted', false,
      'phase11_persistence_applied', false,
      'verification_only', true
    )
  ) returning id into v_run_id;

  v_payload := public.universal_race_stage_get_calculation_payload_v1(p_stage_id);

  return jsonb_build_object(
    'status', 'claimed',
    'contract', 'universal_race_stage_calculation_claim_v1',
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'simulation_run_id', v_run_id,
    'payload', v_payload,
    'database_engine_version', 'race_engine_ts_v1',
    'database_simulation_mode', 'deterministic_road_race_v1',
    'official_outputs_persisted', false,
    'phase11_persistence_applied', false
  );
end;
$function$;

-- Signature intentionally reused. p_universal_result stores the complete
-- universal_race_stage_output_v1 snapshot, including the exact Phase 8/9/10
-- application manifest. No official publication or persistent rider/resource
-- application occurs here.
create or replace function public.universal_race_stage_submit_calculation_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_input_snapshot jsonb,
  p_universal_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_input_hash text;
  v_output_hash text;
  v_manifest jsonb;
begin
  if p_stage_id is null or p_simulation_run_id is null or p_input_snapshot is null or p_universal_result is null then
    raise exception using errcode = '22023', message = 'stage_id, simulation_run_id, input_snapshot and universal output are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11a1_submit:' || p_stage_id::text, 0));
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'The claimed universal simulation run was not found.'; end if;
  if v_run.status <> 'running' then raise exception using errcode = '55000', message = format('Simulation run %s is not running; current status is %s.', p_simulation_run_id, v_run.status); end if;

  if coalesce(p_input_snapshot #>> '{engine,engineKey}', '') <> 'ppm_universal_race_v1'
     or coalesce(p_input_snapshot #>> '{engine,engineVersion}', '') <> '1'
     or coalesce(p_input_snapshot #>> '{stage,stageId}', '') <> p_stage_id::text
     or coalesce(p_input_snapshot #>> '{race,raceId}', '') <> v_run.race_id::text
  then
    raise exception using errcode = '22023', message = 'The universal input identity does not match the claimed run.';
  end if;

  if coalesce(p_universal_result ->> 'contractVersion', '') <> 'universal_race_stage_output_v1'
     or coalesce(p_universal_result ->> 'engineKey', '') <> 'ppm_universal_race_v1'
     or coalesce(p_universal_result ->> 'engineVersion', '') <> '1'
     or coalesce(p_universal_result ->> 'stageId', '') <> p_stage_id::text
     or coalesce(p_universal_result ->> 'raceId', '') <> v_run.race_id::text
     or coalesce(p_universal_result #>> '{universalResult,validationPassed}', '') <> 'true'
  then
    raise exception using errcode = '22023', message = 'The universal output identity/contract is invalid.';
  end if;

  v_manifest := coalesce(p_universal_result -> 'applicationManifest', '{}'::jsonb);
  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1'
     or coalesce((v_manifest ->> 'readyForApplication')::boolean, false) is not true
     or coalesce((v_manifest ->> 'persistenceApplied')::boolean, true) is not false
  then
    raise exception using errcode = '22023', message = 'Phase 11 application manifest is missing, invalid, or already applied.';
  end if;

  v_input_hash := md5(p_input_snapshot::text);
  v_output_hash := md5(p_universal_result::text);

  -- Keep status running: existing completion/publication mechanisms are not
  -- invoked by the verification bridge.
  update public.race_stage_simulation_runs
  set
    input_snapshot_json = p_input_snapshot,
    result_summary_json = jsonb_build_object(
      'calculation_contract', 'universal_phase11a_calculated_hidden_v1',
      'contractVersion', p_universal_result ->> 'contractVersion',
      'engineKey', p_universal_result ->> 'engineKey',
      'engineVersion', p_universal_result ->> 'engineVersion',
      'raceId', p_universal_result ->> 'raceId',
      'stageId', p_universal_result ->> 'stageId',
      'calculation_status', 'calculated_hidden',
      'calculated_at_real', clock_timestamp(),
      'input_hash_md5', v_input_hash,
      'output_hash_md5', v_output_hash,
      'output_snapshot', p_universal_result,
      'universal_result', p_universal_result -> 'universalResult',
      'application_manifest', v_manifest,
      'official_outputs_persisted', false,
      'phase11_persistence_applied', false,
      'results_published', false,
      'verification_only', true
    ),
    error_message = null,
    failed_at = null,
    updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  return jsonb_build_object(
    'status', 'calculated_hidden',
    'contract', 'universal_phase11a_calculated_hidden_v1',
    'stage_id', p_stage_id,
    'race_id', v_run.race_id,
    'simulation_run_id', p_simulation_run_id,
    'input_hash_md5', v_input_hash,
    'output_hash_md5', v_output_hash,
    'phase11_manifest_ready', true,
    'official_outputs_persisted', false,
    'phase11_persistence_applied', false,
    'results_published', false
  );
end;
$function$;

create or replace function public.universal_race_stage_fail_calculation_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_error_message text,
  p_error_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_stage_id is null or p_simulation_run_id is null then
    raise exception using errcode = '22023', message = 'stage_id and simulation_run_id are required';
  end if;

  perform set_config('app.race_engine_writer_family', 'typescript', true);

  update public.race_stage_simulation_runs
  set
    status = 'failed',
    failed_at = clock_timestamp(),
    error_message = left(coalesce(p_error_message, 'Unknown error'), 10000),
    result_summary_json = coalesce(result_summary_json, '{}'::jsonb) || jsonb_build_object(
      'calculation_status', 'failed',
      'failed_at_real', clock_timestamp(),
      'error_details', coalesce(p_error_details, '{}'::jsonb),
      'verification_only', true
    ),
    updated_at = clock_timestamp()
  where id = p_simulation_run_id
    and stage_id = p_stage_id
    and engine_version = 'race_engine_ts_v1'
    and simulation_mode = 'deterministic_road_race_v1';

  return jsonb_build_object(
    'status', 'failed_recorded',
    'stage_id', p_stage_id,
    'simulation_run_id', p_simulation_run_id
  );
end;
$function$;

-- Authoritative read-only replay payload for the hidden verification run.
-- It selects only the explicit Phase 11A contract; historical official runs and
-- authoritative-run pointers are not changed or consulted as fallback.
create or replace function public.get_universal_race_stage_replay_payload_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_output jsonb;
begin
  select
    stage.stage_date::timestamp
      + make_interval(
          hours => coalesce(stage.planned_start_hour_number, 12),
          mins => coalesce(stage.planned_start_minute, 0)
        )
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_start_game_at is null then
    return jsonb_build_object('status', 'not_available', 'reason', 'stage_not_found_or_unscheduled', 'stage_id', p_stage_id);
  end if;

  select run.* into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.status in ('running', 'completed')
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11a_calculated_hidden_v1'
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_available', 'reason', 'phase11a_universal_output_missing', 'stage_id', p_stage_id);
  end if;

  v_output := coalesce(v_run.result_summary_json -> 'output_snapshot', '{}'::jsonb);
  if coalesce(v_output ->> 'contractVersion', '') <> 'universal_race_stage_output_v1' then
    return jsonb_build_object('status', 'not_available', 'reason', 'universal_output_not_calculated', 'stage_id', p_stage_id);
  end if;

  select public.get_current_game_timestamp() into v_current_game_at;
  if v_current_game_at is null or v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'calculated', true,
      'replay_opens_game_at', v_stage_start_game_at,
      'official_outputs_persisted', false,
      'phase11_persistence_applied', false
    );
  end if;

  return jsonb_build_object(
    'status', 'available',
    'stage_id', p_stage_id,
    'race_id', v_run.race_id,
    'simulation_run_id', v_run.id,
    'engine_version', v_output ->> 'engineVersion',
    'engine_key', v_output ->> 'engineKey',
    'database_engine_identity', v_run.engine_version,
    'database_simulation_mode', v_run.simulation_mode,
    'input_snapshot', v_run.input_snapshot_json,
    'output_snapshot', v_output,
    'lifecycle', jsonb_build_object(
      'replay_opened_game_at', v_stage_start_game_at,
      'results_visible', false,
      'results_published_at', null,
      'speed_locked', false,
      'verification_only', true,
      'official_outputs_persisted', false,
      'phase11_persistence_applied', false
    )
  );
end;
$function$;

revoke all on function public.universal_race_stage_get_calculation_payload_v1(uuid) from public, anon, authenticated;
revoke all on function public.universal_race_stage_claim_calculation_v1(uuid) from public, anon, authenticated;
revoke all on function public.universal_race_stage_submit_calculation_v1(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.universal_race_stage_fail_calculation_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;

grant execute on function public.universal_race_stage_get_calculation_payload_v1(uuid) to service_role;
grant execute on function public.universal_race_stage_claim_calculation_v1(uuid) to service_role;
grant execute on function public.universal_race_stage_submit_calculation_v1(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.universal_race_stage_fail_calculation_v1(uuid,uuid,text,jsonb) to service_role;

grant execute on function public.get_universal_race_stage_replay_payload_v1(uuid) to authenticated, service_role;

comment on function public.get_universal_race_stage_replay_payload_v1(uuid)
is 'Phase 11A1 authoritative read-only universal replay payload. Reads only the stored verification run and never publishes official race results.';

commit;
