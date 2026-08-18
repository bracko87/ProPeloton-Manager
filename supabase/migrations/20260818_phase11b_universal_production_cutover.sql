-- PPM Phase 11B — Universal production lifecycle cutover
-- Date: 2026-08-18
--
-- Installs the production lifecycle while leaving it DISABLED until the
-- separate activation script is run. Reuses the current Phase 11A2 bridge,
-- existing game clock, existing stage-plan finalizer, existing result tables,
-- existing fatigue/supply/health/classification/reward writers and the existing
-- wear ledger. No old SQL race physics or replay simulator is activated.
--
-- Production contract after activation:
--   stage lock (start - 3 game hours)
--   -> one backend runRaceEngine calculation
--   -> immutable hidden output + replay
--   -> replay opens at scheduled stage game time
--   -> 900 real-second replay/publication window
--   -> exact-once Phase 8/9/10 persistence + official publication
--   -> next stage becomes eligible.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

/* ------------------------------------------------------------------------- */
/* 0. Hard prerequisites                                                      */
/* ------------------------------------------------------------------------- */
do $phase11b_preflight$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.game_state') is null then v_missing := array_append(v_missing, 'game_state'); end if;
  if to_regclass('public.game_clock_config') is null then v_missing := array_append(v_missing, 'game_clock_config'); end if;
  if to_regclass('public.race_engine_runtime_control_v1') is null then v_missing := array_append(v_missing, 'race_engine_runtime_control_v1'); end if;
  if to_regclass('public.race_stage_automation_state') is null then v_missing := array_append(v_missing, 'race_stage_automation_state'); end if;
  if to_regclass('public.race_stage_simulation_runs') is null then v_missing := array_append(v_missing, 'race_stage_simulation_runs'); end if;
  if to_regclass('public.race_stage_rider_states') is null then v_missing := array_append(v_missing, 'race_stage_rider_states'); end if;
  if to_regclass('public.race_stage_authoritative_runs') is null then v_missing := array_append(v_missing, 'race_stage_authoritative_runs'); end if;
  if to_regclass('public.race_stage_results') is null then v_missing := array_append(v_missing, 'race_stage_results'); end if;
  if to_regclass('public.race_stage_point_results') is null then v_missing := array_append(v_missing, 'race_stage_point_results'); end if;
  if to_regclass('public.race_stage_report_events') is null then v_missing := array_append(v_missing, 'race_stage_report_events'); end if;
  if to_regclass('public.race_engine_stage_wear_applications') is null then v_missing := array_append(v_missing, 'race_engine_stage_wear_applications'); end if;
  if to_regclass('public.rider_health_case_context_v1') is null then v_missing := array_append(v_missing, 'rider_health_case_context_v1'); end if;
  if to_regclass('public.races') is null then v_missing := array_append(v_missing, 'races'); end if;
  if to_regclass('public.race_stages') is null then v_missing := array_append(v_missing, 'race_stages'); end if;
  if to_regclass('public.race_stage_points') is null then v_missing := array_append(v_missing, 'race_stage_points'); end if;
  if to_regclass('public.race_participant_teams_v1') is null then v_missing := array_append(v_missing, 'race_participant_teams_v1'); end if;
  if to_regclass('public.race_participant_riders_v1') is null then v_missing := array_append(v_missing, 'race_participant_riders_v1'); end if;
  if to_regclass('public.race_preparations') is null then v_missing := array_append(v_missing, 'race_preparations'); end if;
  if to_regclass('public.race_stage_plans') is null then v_missing := array_append(v_missing, 'race_stage_plans'); end if;
  if to_regclass('public.race_stage_plan_riders') is null then v_missing := array_append(v_missing, 'race_stage_plan_riders'); end if;
  if to_regclass('public.club_equipment_inventory') is null then v_missing := array_append(v_missing, 'club_equipment_inventory'); end if;
  if to_regclass('public.club_race_supplies') is null then v_missing := array_append(v_missing, 'club_race_supplies'); end if;
  if to_regclass('public.club_race_supply_units') is null then v_missing := array_append(v_missing, 'club_race_supply_units'); end if;
  if to_regclass('public.race_stage_supply_usage_events') is null then v_missing := array_append(v_missing, 'race_stage_supply_usage_events'); end if;
  if to_regclass('public.club_team_cars') is null then v_missing := array_append(v_missing, 'club_team_cars'); end if;
  if to_regclass('public.club_team_buses') is null then v_missing := array_append(v_missing, 'club_team_buses'); end if;
  if to_regclass('public.club_equipment_vans') is null then v_missing := array_append(v_missing, 'club_equipment_vans'); end if;
  if to_regclass('public.club_mobile_workshops') is null then v_missing := array_append(v_missing, 'club_mobile_workshops'); end if;
  if to_regclass('public.club_medical_vans') is null then v_missing := array_append(v_missing, 'club_medical_vans'); end if;

  if to_regprocedure('public.get_current_game_timestamp()') is null then v_missing := array_append(v_missing, 'get_current_game_timestamp()'); end if;
  if to_regprocedure('public.get_race_stage_profile_detail_v1(uuid)') is null then v_missing := array_append(v_missing, 'get_race_stage_profile_detail_v1(uuid)'); end if;
  if to_regprocedure('public.race_engine_get_stage_rider_inputs_v1(uuid)') is null then v_missing := array_append(v_missing, 'race_engine_get_stage_rider_inputs_v1(uuid)'); end if;
  if to_regprocedure('public.race_engine_get_stage_phase_commands_v1(uuid)') is null then v_missing := array_append(v_missing, 'race_engine_get_stage_phase_commands_v1(uuid)'); end if;
  if to_regprocedure('public.race_engine_get_stage_phase9_inputs_v1(uuid)') is null then v_missing := array_append(v_missing, 'race_engine_get_stage_phase9_inputs_v1(uuid)'); end if;
  if to_regprocedure('public.get_race_stage_pre_stage_leaders_v1(uuid)') is null then v_missing := array_append(v_missing, 'get_race_stage_pre_stage_leaders_v1(uuid)'); end if;
  if to_regprocedure('public.race_engine_finalize_due_stage_plan_snapshots_v1(integer,boolean)') is null then v_missing := array_append(v_missing, 'race_engine_finalize_due_stage_plan_snapshots_v1(integer,boolean)'); end if;
  if to_regprocedure('public.race_engine_apply_stage_fatigue_v1(uuid)') is null then v_missing := array_append(v_missing, 'race_engine_apply_stage_fatigue_v1(uuid)'); end if;
  if to_regprocedure('public.race_engine_apply_stage_equipment_asset_wear_v1(uuid,boolean)') is null then v_missing := array_append(v_missing, 'race_engine_apply_stage_equipment_asset_wear_v1(uuid,boolean)'); end if;
  if to_regprocedure('public.apply_race_stage_supply_usage_v1(uuid,jsonb,date,text,uuid)') is null then v_missing := array_append(v_missing, 'apply_race_stage_supply_usage_v1(uuid,jsonb,date,text,uuid)'); end if;
  if to_regprocedure('public.health_create_rider_case_v1(uuid,uuid,text,text,text,uuid,text,date,jsonb)') is null then v_missing := array_append(v_missing, 'health_create_rider_case_v1(...)'); end if;
  if to_regprocedure('public.health_normalize_case_code_v1(text)') is null then v_missing := array_append(v_missing, 'health_normalize_case_code_v1(text)'); end if;
  if to_regprocedure('public.race_engine_write_cumulative_classifications_v1(uuid)') is null then v_missing := array_append(v_missing, 'race_engine_write_cumulative_classifications_v1(uuid)'); end if;
  if to_regprocedure('public.generate_race_ranking_point_awards_v1(uuid,uuid,boolean)') is null then v_missing := array_append(v_missing, 'generate_race_ranking_point_awards_v1(uuid,uuid,boolean)'); end if;
  if to_regprocedure('public.generate_race_prize_awards_v1(uuid,uuid,boolean)') is null then v_missing := array_append(v_missing, 'generate_race_prize_awards_v1(uuid,uuid,boolean)'); end if;
  if to_regprocedure('public.race_engine_pay_prize_awards_v1(uuid,uuid)') is null then v_missing := array_append(v_missing, 'race_engine_pay_prize_awards_v1(uuid,uuid)'); end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'Phase 11B installation blocked; missing prerequisites: %', v_missing;
  end if;
end;
$phase11b_preflight$;

/* ------------------------------------------------------------------------- */
/* 1. Reuse runtime-control singleton as the production activation boundary.   */
/* ------------------------------------------------------------------------- */
alter table public.race_engine_runtime_control_v1
  add column if not exists typescript_lifecycle_enabled boolean not null default false,
  add column if not exists typescript_activation_game_at timestamp without time zone null,
  add column if not exists typescript_calculation_lead_hours integer not null default 3,
  add column if not exists typescript_replay_duration_real_seconds integer not null default 900;

alter table public.race_engine_runtime_control_v1
  drop constraint if exists race_engine_runtime_control_v1_ts_lead_hours_chk;
alter table public.race_engine_runtime_control_v1
  add constraint race_engine_runtime_control_v1_ts_lead_hours_chk
  check (typescript_calculation_lead_hours between 1 and 24);

alter table public.race_engine_runtime_control_v1
  drop constraint if exists race_engine_runtime_control_v1_ts_replay_seconds_chk;
alter table public.race_engine_runtime_control_v1
  add constraint race_engine_runtime_control_v1_ts_replay_seconds_chk
  check (typescript_replay_duration_real_seconds between 60 and 7200);

-- Migration installs disabled. Activation is a separate deliberate operation.
update public.race_engine_runtime_control_v1
set typescript_lifecycle_enabled = false,
    updated_at = clock_timestamp(),
    updated_by = current_user,
    notes = 'Phase 11B production lifecycle installed but disabled. Legacy execution remains disabled. Run the Phase 11B activation script only after source deploy/tests pass.'
where singleton_id = true;

/* ------------------------------------------------------------------------- */
/* 2. Production calculation payload — same canonical Phase 11A2 inputs.      */
/* ------------------------------------------------------------------------- */
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

  select coalesce(jsonb_agg(to_jsonb(team) order by to_jsonb(team)::text), '[]'::jsonb)
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
    'contract', 'universal_race_calculation_payload_v3_phase11b',
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
      'verification_only', false
    )
  );
end;
$function$;



/* ------------------------------------------------------------------------- */
/* 3. Claim one named stage, but only when it is genuinely due.               */
/* ------------------------------------------------------------------------- */
create or replace function public.universal_race_stage_claim_calculation_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $phase11b_claim$
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
begin
  if p_stage_id is null then
    return jsonb_build_object('status', 'blocked', 'reason', 'stage_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:' || p_stage_id::text, 0));

  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  if not found
     or v_control.active_engine <> 'typescript_v1'
     or not v_control.typescript_execution_enabled
     or v_control.legacy_execution_enabled
     or not coalesce(v_control.typescript_lifecycle_enabled, false)
  then
    return jsonb_build_object('status', 'disabled', 'reason', 'phase11b_lifecycle_not_enabled');
  end if;

  if v_control.typescript_activation_game_at is null then
    return jsonb_build_object('status', 'disabled', 'reason', 'production_activation_game_boundary_missing');
  end if;

  select
    stage.id,
    stage.race_id,
    stage.stage_number,
    stage.stage_date,
    stage.planned_start_hour_number,
    stage.planned_start_minute,
    lower(coalesce(stage.stage_format, 'road_race')) as stage_format,
    coalesce(stage.weather_cancelled, false) as weather_cancelled
  into v_stage
  from public.race_stages stage
  where stage.id = p_stage_id;

  if not found then
    return jsonb_build_object('status', 'blocked', 'reason', 'stage_not_found', 'stage_id', p_stage_id);
  end if;

  if v_stage.weather_cancelled then
    return jsonb_build_object('status', 'skipped', 'reason', 'weather_cancelled', 'stage_id', p_stage_id);
  end if;

  v_stage_start_game_at := v_stage.stage_date::timestamp
    + make_interval(
        hours => coalesce(v_stage.planned_start_hour_number, 12),
        mins => coalesce(v_stage.planned_start_minute, 0)
      );
  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_control.typescript_calculation_lead_hours, 3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  -- Forward-only production boundary. Historical races can never be picked up.
  if v_stage_start_game_at < v_control.typescript_activation_game_at then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'before_phase11b_activation_boundary',
      'stage_id', p_stage_id,
      'stage_start_game_at', v_stage_start_game_at,
      'activation_game_at', v_control.typescript_activation_game_at
    );
  end if;

  if v_current_game_at < v_calculation_due_game_at then
    return jsonb_build_object(
      'status', 'not_due',
      'stage_id', p_stage_id,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'stage_start_game_at', v_stage_start_game_at
    );
  end if;

  -- Stage races are strictly ordered. A later non-cancelled stage cannot be
  -- calculated until the previous non-cancelled stage has been published.
  select previous.id
  into v_previous_stage_id
  from public.race_stages previous
  where previous.race_id = v_stage.race_id
    and previous.stage_number < v_stage.stage_number
    and not coalesce(previous.weather_cancelled, false)
  order by previous.stage_number desc
  limit 1;

  if v_previous_stage_id is not null and not exists (
    select 1
    from public.race_stage_authoritative_runs authority
    join public.race_stage_simulation_runs previous_run
      on previous_run.id = authority.simulation_run_id
    where authority.stage_id = v_previous_stage_id
      and authority.engine_version = 'race_engine_ts_v1'
      and authority.simulation_mode = 'deterministic_road_race_v1'
      and previous_run.status = 'completed'
      and coalesce((previous_run.result_summary_json ->> 'results_published')::boolean, false)
  ) then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'previous_stage_not_published',
      'stage_id', p_stage_id,
      'previous_stage_id', v_previous_stage_id
    );
  end if;

  select run.* into v_existing_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and run.status in ('running', 'completed')
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') in (
      'phase11b_claim_pending_v1',
      'universal_phase11b_calculated_hidden_v1'
    )
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status', case
        when coalesce(v_existing_run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11b_calculated_hidden_v1'
          then 'already_calculated'
        else 'already_claimed'
      end,
      'stage_id', p_stage_id,
      'simulation_run_id', v_existing_run.id,
      'run_status', v_existing_run.status
    );
  end if;

  perform set_config('app.race_engine_writer_family', 'typescript', true);

  insert into public.race_stage_simulation_runs (
    race_id, stage_id, status, engine_version, simulation_mode,
    started_at, input_snapshot_json, result_summary_json
  ) values (
    v_stage.race_id,
    p_stage_id,
    'running',
    'race_engine_ts_v1',
    'deterministic_road_race_v1',
    clock_timestamp(),
    '{}'::jsonb,
    jsonb_build_object(
      'calculation_contract', 'phase11b_claim_pending_v1',
      'calculation_status', 'claimed',
      'claimed_at_real', clock_timestamp(),
      'calculation_due_game_at', v_calculation_due_game_at,
      'stage_start_game_at', v_stage_start_game_at,
      'official_outputs_persisted', false,
      'phase11_persistence_applied', false,
      'results_published', false,
      'verification_only', false
    )
  ) returning id into v_run_id;

  insert into public.race_stage_automation_state (
    stage_id, race_id, scheduled_game_at, last_status, simulation_run_id,
    attempt_count, last_checked_at, last_started_at, last_error, details, updated_at
  ) values (
    p_stage_id,
    v_stage.race_id,
    v_stage_start_game_at,
    'calculating',
    v_run_id,
    1,
    clock_timestamp(),
    clock_timestamp(),
    null,
    jsonb_build_object(
      'contract', 'phase11b_universal_production_lifecycle_v1',
      'calculation_due_game_at', v_calculation_due_game_at,
      'stage_start_game_at', v_stage_start_game_at,
      'replay_duration_real_seconds', coalesce(v_control.typescript_replay_duration_real_seconds, 900),
      'worker_version', 'netlify_phase11b_v1',
      'verification_only', false
    ),
    clock_timestamp()
  )
  on conflict (stage_id) do update
  set race_id = excluded.race_id,
      scheduled_game_at = excluded.scheduled_game_at,
      last_status = excluded.last_status,
      simulation_run_id = excluded.simulation_run_id,
      attempt_count = public.race_stage_automation_state.attempt_count + 1,
      last_checked_at = excluded.last_checked_at,
      last_started_at = excluded.last_started_at,
      last_error = null,
      details = coalesce(public.race_stage_automation_state.details, '{}'::jsonb) || excluded.details,
      updated_at = excluded.updated_at;

  v_payload := public.universal_race_stage_get_calculation_payload_v1(p_stage_id);

  return jsonb_build_object(
    'status', 'claimed',
    'contract', 'universal_race_stage_calculation_claim_v2_phase11b',
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'simulation_run_id', v_run_id,
    'current_game_at', v_current_game_at,
    'calculation_due_game_at', v_calculation_due_game_at,
    'stage_start_game_at', v_stage_start_game_at,
    'stage_format', v_stage.stage_format,
    'payload', v_payload
  );
end;
$phase11b_claim$;

/* ------------------------------------------------------------------------- */
/* 4. Submit immutable universal output; still hidden and not yet persistent. */
/* ------------------------------------------------------------------------- */
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
as $phase11b_submit$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_input_hash text;
  v_output_hash text;
  v_stage_start_game_at timestamp without time zone;
begin
  if p_stage_id is null or p_simulation_run_id is null or p_input_snapshot is null or p_universal_result is null then
    raise exception using errcode = '22023', message = 'stage_id, simulation_run_id, input_snapshot and universal output are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_submit:' || p_stage_id::text, 0));
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
  for update;

  if not found then raise exception 'Claimed Phase 11B run was not found.'; end if;
  if v_run.status <> 'running' then raise exception 'Run % is not running.', p_simulation_run_id; end if;
  if coalesce(v_run.result_summary_json ->> 'calculation_contract', '') <> 'phase11b_claim_pending_v1' then
    raise exception 'Run % is not a Phase 11B pending claim.', p_simulation_run_id;
  end if;

  if coalesce(p_input_snapshot #>> '{engine,engineKey}', '') <> 'ppm_universal_race_v1'
     or coalesce(p_input_snapshot #>> '{engine,engineVersion}', '') <> '1'
     or coalesce(p_input_snapshot #>> '{stage,stageId}', '') <> p_stage_id::text
     or coalesce(p_input_snapshot #>> '{race,raceId}', '') <> v_run.race_id::text
  then
    raise exception 'Universal input identity does not match the claimed run.';
  end if;

  if coalesce(p_universal_result ->> 'contractVersion', '') <> 'universal_race_stage_output_v1'
     or coalesce(p_universal_result ->> 'engineKey', '') <> 'ppm_universal_race_v1'
     or coalesce(p_universal_result ->> 'engineVersion', '') <> '1'
     or coalesce(p_universal_result ->> 'stageId', '') <> p_stage_id::text
     or coalesce(p_universal_result ->> 'raceId', '') <> v_run.race_id::text
     or coalesce(p_universal_result #>> '{universalResult,validationPassed}', '') <> 'true'
  then
    raise exception 'Universal output identity/contract is invalid.';
  end if;

  v_manifest := coalesce(p_universal_result -> 'applicationManifest', '{}'::jsonb);
  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1'
     or not coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
     or coalesce((v_manifest ->> 'persistenceApplied')::boolean, true)
  then
    raise exception 'Phase 11 application manifest is missing, invalid, or already applied.';
  end if;

  if jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) = 0 then
    raise exception 'Phase 11 application manifest contains no rider-state rows.';
  end if;

  select stage.stage_date::timestamp
      + make_interval(hours => coalesce(stage.planned_start_hour_number, 12), mins => coalesce(stage.planned_start_minute, 0))
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  v_input_hash := md5(p_input_snapshot::text);
  v_output_hash := md5(p_universal_result::text);

  update public.race_stage_simulation_runs
  set input_snapshot_json = p_input_snapshot,
      result_summary_json = jsonb_build_object(
        'calculation_contract', 'universal_phase11b_calculated_hidden_v1',
        'contractVersion', p_universal_result ->> 'contractVersion',
        'engineKey', p_universal_result ->> 'engineKey',
        'engineVersion', p_universal_result ->> 'engineVersion',
        'raceId', p_universal_result ->> 'raceId',
        'stageId', p_universal_result ->> 'stageId',
        'calculation_status', 'calculated_hidden',
        'calculated_at_real', clock_timestamp(),
        'stage_start_game_at', v_stage_start_game_at,
        'input_hash_md5', v_input_hash,
        'output_hash_md5', v_output_hash,
        'output_snapshot', p_universal_result,
        'universal_result', p_universal_result -> 'universalResult',
        'application_manifest', v_manifest,
        'official_outputs_persisted', false,
        'phase11_persistence_applied', false,
        'results_published', false,
        'verification_only', false
      ),
      error_message = null,
      failed_at = null,
      updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  update public.race_stage_automation_state
  set last_status = 'calculated_hidden',
      last_checked_at = clock_timestamp(),
      last_error = null,
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'calculated_at_real', clock_timestamp(),
        'input_hash_md5', v_input_hash,
        'output_hash_md5', v_output_hash,
        'manifest_ready', true,
        'verification_only', false
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and simulation_run_id = p_simulation_run_id;

  return jsonb_build_object(
    'status', 'calculated_hidden',
    'contract', 'universal_phase11b_calculated_hidden_v1',
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
$phase11b_submit$;

/* ------------------------------------------------------------------------- */
/* 5. Failure recorder — retryable by the same lifecycle.                     */
/* ------------------------------------------------------------------------- */
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
as $phase11b_fail$
begin
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  update public.race_stage_simulation_runs
  set status = 'failed',
      failed_at = clock_timestamp(),
      error_message = left(coalesce(p_error_message, 'Unknown error'), 10000),
      result_summary_json = coalesce(result_summary_json, '{}'::jsonb) || jsonb_build_object(
        'calculation_status', 'failed',
        'failed_at_real', clock_timestamp(),
        'error_details', coalesce(p_error_details, '{}'::jsonb),
        'verification_only', false
      ),
      updated_at = clock_timestamp()
  where id = p_simulation_run_id
    and stage_id = p_stage_id
    and engine_version = 'race_engine_ts_v1'
    and simulation_mode = 'deterministic_road_race_v1';

  update public.race_stage_automation_state
  set last_status = 'failed',
      last_error = left(coalesce(p_error_message, 'Unknown error'), 10000),
      last_checked_at = clock_timestamp(),
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'failed_at_real', clock_timestamp(),
        'error_details', coalesce(p_error_details, '{}'::jsonb)
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and simulation_run_id = p_simulation_run_id;

  return jsonb_build_object('status', 'failed_recorded', 'stage_id', p_stage_id, 'simulation_run_id', p_simulation_run_id);
end;
$phase11b_fail$;

/* ------------------------------------------------------------------------- */
/* 6. Existing fatigue writer: apply stored universal state, no recalculation. */
/* ------------------------------------------------------------------------- */
create or replace function public.race_engine_apply_stage_fatigue_v1(p_simulation_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $phase11b_fatigue$
declare
  v_updated_count integer := 0;
begin
  update public.riders rider
  set fatigue = least(100, greatest(0, state_row.fatigue_after_stage::integer))
  from public.race_stage_rider_states state_row
  where state_row.simulation_run_id = p_simulation_run_id
    and state_row.rider_id = rider.id
    and state_row.stage_status in ('finished', 'dnf', 'otl');

  get diagnostics v_updated_count = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'updated_count', v_updated_count,
    'source', 'prewritten_universal_phase8_state'
  );
end;
$phase11b_fatigue$;

/* ------------------------------------------------------------------------- */
/* 7. Existing wear writer upgraded to consume exact Phase 9 manifest values. */
/*    Non-universal calls keep the existing v8.5 behavior below the new branch.*/
/* ------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_equipment_asset_wear_v1(p_simulation_run_id uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_stage_distance_km numeric := 0;
  v_applied_game_date date;
  v_updated_equipment_count integer := 0;
  v_inserted_equipment_log_count integer := 0;
  v_result jsonb;
  v_inserted_plan_rows integer := 0;
  v_inserted_direct_plan_rows integer := 0;
  v_inserted_prep_plan_rows integer := 0;
  v_categories text[] := array['frame', 'wheelset', 'groupset', 'tires', 'helmet', 'shoes'];
  -- Phase 11B universal-manifest exact application branch.
  v_manifest jsonb;
  v_resource_updates jsonb;
  v_resource_row jsonb;
  v_resource_id uuid;
  v_resource_type text;
  v_team_id uuid;
  v_condition_before numeric;
  v_condition_after numeric;
  v_condition_used numeric;
  v_current_condition numeric;
  v_asset_key text;
  v_asset_table text;
  v_universal_candidate_count integer := 0;
  v_universal_equipment_updated integer := 0;
  v_universal_asset_updated integer := 0;
  v_universal_log_inserted integer := 0;
  v_universal_already_applied integer := 0;
  v_universal_sql text;
begin
  if p_simulation_run_id is null then
    raise exception 'p_simulation_run_id is required';
  end if;

  -- Resolve the stage from whichever simulation-run table exists.
  if to_regclass('public.race_stage_simulation_runs') is not null then
    execute 'select stage_id from public.race_stage_simulation_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null and to_regclass('public.race_simulation_runs') is not null then
    execute 'select stage_id from public.race_simulation_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null and to_regclass('public.race_stage_runs') is not null then
    execute 'select stage_id from public.race_stage_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  execute 'select race_id, coalesce(distance_km, 0)::numeric from public.race_stages where id = $1 limit 1'
    into v_race_id, v_stage_distance_km
    using v_stage_id;

  -- Persistent race use belongs to the immutable in-game stage date, not to
  -- the real clock moment at which the replay/publication window closes.
  select stage.stage_date::date
  into v_applied_game_date
  from public.race_stages stage
  where stage.id = v_stage_id;

  /* ------------------------------------------------------------------
     Phase 11B universal-manifest path.

     Phase 9 owns resource calculations. For universal runs this writer does
     NOT recompute wear from mutable plans or staff. It applies the exact
     phase9ResourceUpdates already stored in the immutable application manifest.
     The existing race_engine_stage_wear_applications ledger remains the
     exact-once guard for equipment and assets.
     ------------------------------------------------------------------ */
  select coalesce(run.result_summary_json -> 'application_manifest', '{}'::jsonb)
  into v_manifest
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1';

  if coalesce(v_manifest ->> 'contractVersion', '') = 'universal_phase11_application_manifest_v1'
     and coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
  then
    v_resource_updates := coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb);

    if jsonb_typeof(v_resource_updates) <> 'array' then
      raise exception 'Universal Phase 9 resource updates are not an array for run %', p_simulation_run_id;
    end if;

    select count(*)::integer
    into v_universal_candidate_count
    from jsonb_array_elements(v_resource_updates) item
    where item ->> 'resourceType' in ('equipment', 'asset');

    if p_dry_run then
      return jsonb_build_object(
        'status', 'ok',
        'version', 'phase11b_manifest_exact_v1',
        'dry_run', true,
        'simulation_run_id', p_simulation_run_id,
        'stage_id', v_stage_id,
        'race_id', v_race_id,
        'stage_distance_km', v_stage_distance_km,
        'manifest_resource_candidate_count', v_universal_candidate_count,
        'resource_updates', (
          select coalesce(jsonb_agg(item), '[]'::jsonb)
          from jsonb_array_elements(v_resource_updates) item
          where item ->> 'resourceType' in ('equipment', 'asset')
        )
      );
    end if;

    for v_resource_row in
      select item
      from jsonb_array_elements(v_resource_updates) item
      where item ->> 'resourceType' in ('equipment', 'asset')
      order by item ->> 'resourceType', item ->> 'resourceId'
    loop
      v_resource_type := v_resource_row ->> 'resourceType';
      v_resource_id := nullif(v_resource_row ->> 'resourceId', '')::uuid;
      v_team_id := nullif(v_resource_row ->> 'teamId', '')::uuid;
      v_condition_before := nullif(v_resource_row ->> 'conditionBefore', '')::numeric;
      v_condition_after := nullif(v_resource_row ->> 'conditionAfter', '')::numeric;
      v_condition_used := coalesce(
        nullif(v_resource_row ->> 'conditionUsed', '')::numeric,
        greatest(coalesce(v_condition_before, 0) - coalesce(v_condition_after, 0), 0)
      );

      if v_resource_id is null or v_condition_before is null or v_condition_after is null then
        raise exception 'Universal Phase 9 % resource row is incomplete: %', v_resource_type, v_resource_row;
      end if;

      if exists (
        select 1
        from public.race_engine_stage_wear_applications log
        where log.simulation_run_id = p_simulation_run_id
          and log.target_type = v_resource_type
          and log.target_id = v_resource_id
      ) then
        v_universal_already_applied := v_universal_already_applied + 1;
        continue;
      end if;

      if v_resource_type = 'equipment' then
        select inventory.condition_percent
        into v_current_condition
        from public.club_equipment_inventory inventory
        where inventory.id = v_resource_id
        for update;

        if not found then
          raise exception 'Phase 11B equipment resource % was not found.', v_resource_id;
        end if;

        if abs(coalesce(v_current_condition, 100) - v_condition_before) > 0.02 then
          raise exception 'Phase 11B equipment condition drift for %: current %, manifest before %.',
            v_resource_id, v_current_condition, v_condition_before;
        end if;

        insert into public.race_engine_stage_wear_applications (
          simulation_run_id, stage_id, race_id, club_id, target_type,
          target_table, target_id, target_key, condition_loss,
          applied_game_date, metadata
        ) values (
          p_simulation_run_id, v_stage_id, v_race_id, v_team_id, 'equipment',
          'club_equipment_inventory', v_resource_id,
          coalesce(
            (select inventory.equipment_category from public.club_equipment_inventory inventory where inventory.id = v_resource_id),
            'equipment'
          ),
          greatest(v_condition_used, 0), v_applied_game_date,
          jsonb_build_object(
            'source', 'phase11b_universal_application_manifest',
            'condition_before', v_condition_before,
            'condition_after', v_condition_after,
            'stage_distance_km', v_stage_distance_km,
            'resource_update', v_resource_row
          )
        ) on conflict do nothing;

        if found then
          v_universal_log_inserted := v_universal_log_inserted + 1;

          update public.club_equipment_inventory inventory
          set
            condition_percent = greatest(0, least(100, v_condition_after)),
            last_used_game_date = coalesce(v_applied_game_date, inventory.last_used_game_date),
            total_distance_km = coalesce(inventory.total_distance_km, 0) + v_stage_distance_km,
            total_race_days = coalesce(inventory.total_race_days, 0) + 1
          where inventory.id = v_resource_id;

          select inventory.condition_percent
          into v_current_condition
          from public.club_equipment_inventory inventory
          where inventory.id = v_resource_id;
          if abs(coalesce(v_current_condition, 100) - greatest(0, least(100, v_condition_after))) > 0.02 then
            raise exception 'Phase 11B equipment post-application mismatch for %: current %, manifest after %.',
              v_resource_id, v_current_condition, v_condition_after;
          end if;

          v_universal_equipment_updated := v_universal_equipment_updated + 1;
        else
          v_universal_already_applied := v_universal_already_applied + 1;
        end if;
      else
        v_asset_key := coalesce(
          (select run.input_snapshot_json #>> array['preparation','assets',v_resource_id::text,'assetKey']
           from public.race_stage_simulation_runs run where run.id = p_simulation_run_id),
          ''
        );

        v_asset_table := case lower(v_asset_key)
          when 'team_car' then 'club_team_cars'
          when 'car' then 'club_team_cars'
          when 'team_bus' then 'club_team_buses'
          when 'bus' then 'club_team_buses'
          when 'equipment_van' then 'club_equipment_vans'
          when 'van' then 'club_equipment_vans'
          when 'mobile_workshop' then 'club_mobile_workshops'
          when 'workshop' then 'club_mobile_workshops'
          when 'medical_van' then 'club_medical_vans'
          when 'medical' then 'club_medical_vans'
          else null
        end;

        if v_asset_table is null then
          raise exception 'Phase 11B asset % has unsupported asset key %.', v_resource_id, v_asset_key;
        end if;

        execute format('select condition_percent from public.%I where id = $1 for update', v_asset_table)
          into v_current_condition
          using v_resource_id;

        if not found then
          raise exception 'Phase 11B asset % was not found in %.', v_resource_id, v_asset_table;
        end if;

        if abs(coalesce(v_current_condition, 100) - v_condition_before) > 0.02 then
          raise exception 'Phase 11B asset condition drift for %: current %, manifest before %.',
            v_resource_id, v_current_condition, v_condition_before;
        end if;

        insert into public.race_engine_stage_wear_applications (
          simulation_run_id, stage_id, race_id, club_id, target_type,
          target_table, target_id, target_key, condition_loss,
          applied_game_date, metadata
        ) values (
          p_simulation_run_id, v_stage_id, v_race_id, v_team_id, 'asset',
          v_asset_table, v_resource_id, v_asset_key,
          greatest(v_condition_used, 0), v_applied_game_date,
          jsonb_build_object(
            'source', 'phase11b_universal_application_manifest',
            'condition_before', v_condition_before,
            'condition_after', v_condition_after,
            'stage_distance_km', v_stage_distance_km,
            'resource_update', v_resource_row
          )
        ) on conflict do nothing;

        if found then
          v_universal_log_inserted := v_universal_log_inserted + 1;
          -- Asset tables share condition_percent/id, while usage counters have
          -- evolved independently across asset types. Apply the authoritative
          -- condition first, then update only optional counters that actually
          -- exist on the current production relation.
          execute format(
            'update public.%I set condition_percent = greatest(0, least(100, $1)) where id = $2',
            v_asset_table
          ) using v_condition_after, v_resource_id;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'last_used_game_date'
          ) then
            execute format(
              'update public.%I set last_used_game_date = coalesce($1, last_used_game_date) where id = $2',
              v_asset_table
            ) using v_applied_game_date, v_resource_id;
          end if;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'total_distance_km'
          ) then
            execute format(
              'update public.%I set total_distance_km = coalesce(total_distance_km, 0) + $1 where id = $2',
              v_asset_table
            ) using v_stage_distance_km, v_resource_id;
          end if;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'total_race_days'
          ) then
            execute format(
              'update public.%I set total_race_days = coalesce(total_race_days, 0) + 1 where id = $1',
              v_asset_table
            ) using v_resource_id;
          end if;

          if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = v_asset_table and column_name = 'updated_at'
          ) then
            execute format(
              'update public.%I set updated_at = clock_timestamp() where id = $1',
              v_asset_table
            ) using v_resource_id;
          end if;

          execute format('select condition_percent from public.%I where id = $1', v_asset_table)
            into v_current_condition
            using v_resource_id;
          if abs(coalesce(v_current_condition, 100) - greatest(0, least(100, v_condition_after))) > 0.02 then
            raise exception 'Phase 11B asset post-application mismatch for %: current %, manifest after %.',
              v_resource_id, v_current_condition, v_condition_after;
          end if;

          v_universal_asset_updated := v_universal_asset_updated + 1;
        else
          v_universal_already_applied := v_universal_already_applied + 1;
        end if;
      end if;
    end loop;

    return jsonb_build_object(
      'status', 'ok',
      'version', 'phase11b_manifest_exact_v1',
      'dry_run', false,
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'race_id', v_race_id,
      'manifest_resource_candidate_count', v_universal_candidate_count,
      'equipment_updated_count', v_universal_equipment_updated,
      'asset_updated_count', v_universal_asset_updated,
      'wear_log_inserted_count', v_universal_log_inserted,
      'already_applied_count', v_universal_already_applied
    );
  end if;

  -- v8.4: if a previous failed function call left this temp table in the
  -- same SQL editor/session transaction, recreate it cleanly.
  drop table if exists pg_temp.tmp_stage_equipment_plan_sources;

  create temp table tmp_stage_equipment_plan_sources (
    club_id uuid not null,
    rider_id uuid null,
    source_value_id uuid null,
    source_kind text not null
  ) on commit drop;

  -- -------------------------------------------------------------------
  -- Stage-plan source, schema-safe.
  -- Important: do not reference rsp.club_id or rsp.rider_id directly.
  -- row_to_json(rsp) returns only real columns, so missing fields become NULL.
  -- -------------------------------------------------------------------
  insert into tmp_stage_equipment_plan_sources (club_id, rider_id, source_value_id, source_kind)
  select distinct
    resolved.club_id,
    resolved.rider_id,
    resolved.source_value_id,
    'stage_plan_json'::text
  from public.race_stage_plans rsp
  cross join lateral (select row_to_json(rsp)::jsonb as rspj) rsp_json
  cross join lateral (
    select
      coalesce(
        nullif(rsp_json.rspj->>'race_preparation_id', ''),
        nullif(rsp_json.rspj->>'preparation_id', ''),
        nullif(rsp_json.rspj->>'race_plan_id', ''),
        nullif(rsp_json.rspj->>'race_preparation', '')
      ) as preparation_id_text,
      coalesce(
        nullif(rsp_json.rspj->>'rider_id', ''),
        nullif(rsp_json.rspj->>'selected_rider_id', ''),
        nullif(rsp_json.rspj->>'club_rider_id', '')
      ) as rider_id_text,
      coalesce(
        nullif(rsp_json.rspj #>> '{rider_equipment_json,id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,setup_id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,preset_id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,equipment_setup_id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_json,id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_json,setup_id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_setup_json,id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_preset_json,id}', '')
      ) as source_value_text
  ) raw_values
  left join public.race_preparations rp
    on row_to_json(rp)::jsonb->>'id' = raw_values.preparation_id_text
  cross join lateral (
    select
      coalesce(
        nullif(rsp_json.rspj->>'club_id', ''),
        nullif(rsp_json.rspj->>'team_id', ''),
        nullif(row_to_json(rp)::jsonb->>'club_id', ''),
        nullif(row_to_json(rp)::jsonb #>> '{metadata,participating_club_id}', '')
      ) as club_id_text
  ) club_source
  cross join lateral (
    select
      case
        when club_source.club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then club_source.club_id_text::uuid
        else null
      end as club_id,
      case
        when raw_values.rider_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then raw_values.rider_id_text::uuid
        else null
      end as rider_id,
      case
        when raw_values.source_value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then raw_values.source_value_text::uuid
        else null
      end as source_value_id
  ) resolved
  where rsp.stage_id = v_stage_id
    and resolved.club_id is not null
    and (
      resolved.rider_id is not null
      or resolved.source_value_id is not null
      or rsp_json.rspj ? 'rider_equipment_json'
      or rsp_json.rspj ? 'equipment_json'
      or rsp_json.rspj ? 'equipment_setup_json'
      or rsp_json.rspj ? 'equipment_preset_json'
    );

  get diagnostics v_inserted_direct_plan_rows = row_count;

  -- -------------------------------------------------------------------
  -- Race-preparation source, schema-safe.
  -- Important: do not reference rpr.rider_id directly. Use row_to_json.
  -- This fallback is necessary because the current race_stage_plans table is
  -- not one-row-per-rider in this DB.
  -- -------------------------------------------------------------------
  if to_regclass('public.race_preparation_riders') is not null then
    insert into tmp_stage_equipment_plan_sources (club_id, rider_id, source_value_id, source_kind)
    select distinct
      resolved.club_id,
      resolved.rider_id,
      resolved.source_value_id,
      'race_preparation_riders'::text
    from public.race_preparation_riders rpr
    cross join lateral (select row_to_json(rpr)::jsonb as rprj) rpr_json
    join public.race_preparations rp
      on row_to_json(rp)::jsonb->>'id' = coalesce(
        nullif(rpr_json.rprj->>'race_preparation_id', ''),
        nullif(rpr_json.rprj->>'preparation_id', ''),
        nullif(rpr_json.rprj->>'race_plan_id', '')
      )
    cross join lateral (select row_to_json(rp)::jsonb as rpj) rp_json
    cross join lateral (
      select
        coalesce(
          nullif(rp_json.rpj->>'club_id', ''),
          nullif(rp_json.rpj #>> '{metadata,participating_club_id}', '')
        ) as club_id_text,
        coalesce(
          nullif(rpr_json.rprj->>'rider_id', ''),
          nullif(rpr_json.rprj->>'selected_rider_id', ''),
          nullif(rpr_json.rprj->>'club_rider_id', '')
        ) as rider_id_text,
        coalesce(
          nullif(rpr_json.rprj #>> '{rider_equipment_json,id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,setup_id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,preset_id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,equipment_setup_id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_json,id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_json,setup_id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_setup_json,id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_preset_json,id}', '')
        ) as source_value_text
    ) raw_values
    cross join lateral (
      select
        case
          when raw_values.club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.club_id_text::uuid
          else null
        end as club_id,
        case
          when raw_values.rider_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.rider_id_text::uuid
          else null
        end as rider_id,
        case
          when raw_values.source_value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.source_value_text::uuid
          else null
        end as source_value_id
    ) resolved
    where rp_json.rpj->>'race_id' = v_race_id::text
      and resolved.club_id is not null
      and resolved.rider_id is not null;

    get diagnostics v_inserted_prep_plan_rows = row_count;
  end if;

  select count(*) into v_inserted_plan_rows from tmp_stage_equipment_plan_sources;

  -- v8.4: same safety for the candidate temp table.
  drop table if exists pg_temp.tmp_stage_equipment_wear_candidates;

  create temp table tmp_stage_equipment_wear_candidates (
    inventory_item_id uuid primary key,
    club_id uuid,
    catalog_item_id uuid,
    equipment_category text,
    display_name text,
    rider_use_count integer,
    allocated_physical_use_count integer,
    planned_loss numeric,
    already_applied boolean,
    pending_loss numeric,
    match_type text,
    source_value_id uuid
  ) on commit drop;

  -- -------------------------------------------------------------------
  -- Equipment matching strategy v8.5:
  -- 1) Count planned riders per club from schema-safe plan sources.
  -- 2) If equipment wear was already logged for this simulation run, treat
  --    those logged physical inventory rows as the fixed candidate set.
  --    This prevents a post-apply dry-run from selecting different equipment
  --    after condition_percent changed.
  -- 3) Only fill missing slots per club/category from unlogged inventory.
  -- 4) Limit setup/preset equipment matching to one physical item per rider
  --    per category.
  -- -------------------------------------------------------------------
  insert into tmp_stage_equipment_wear_candidates (
    inventory_item_id,
    club_id,
    catalog_item_id,
    equipment_category,
    display_name,
    rider_use_count,
    allocated_physical_use_count,
    planned_loss,
    already_applied,
    pending_loss,
    match_type,
    source_value_id
  )
  with planned_riders as (
    select
      club_id,
      greatest(1, count(distinct rider_id))::integer as rider_count,
      (array_agg(source_value_id order by source_value_id::text nulls last))[1] as source_value_id
    from tmp_stage_equipment_plan_sources
    where club_id is not null
      and rider_id is not null
    group by club_id
  ),
  required_categories as (
    select
      pr.club_id,
      pr.rider_count,
      pr.source_value_id,
      c.equipment_category
    from planned_riders pr
    cross join unnest(v_categories) as c(equipment_category)
  ),
  equipment_catalog_rows as (
    select
      ec.id as catalog_item_id,
      lower(coalesce(
        nullif(ecj->>'equipment_category', ''),
        nullif(ecj->>'category', ''),
        nullif(ecj->>'item_category', ''),
        nullif(ecj->>'type', '')
      )) as equipment_category,
      coalesce(
        nullif(ecj->>'display_name', ''),
        nullif(ecj->>'name', ''),
        nullif(ecj->>'item_name', ''),
        nullif(ecj->>'model_name', ''),
        nullif(ecj->>'model', ''),
        nullif(ecj->>'brand', ''),
        ec.id::text
      ) as display_name,
      case
        when coalesce(
          nullif(ecj->>'condition_loss_per_race_day', ''),
          nullif(ecj->>'wear_per_race_day', ''),
          nullif(ecj->>'condition_loss', ''),
          nullif(ecj->>'race_day_condition_loss', '')
        ) ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(
          nullif(ecj->>'condition_loss_per_race_day', ''),
          nullif(ecj->>'wear_per_race_day', ''),
          nullif(ecj->>'condition_loss', ''),
          nullif(ecj->>'race_day_condition_loss', '')
        )::numeric
        else 0::numeric
      end as condition_loss_per_race_day
    from public.equipment_catalog ec
    cross join lateral (select row_to_json(ec)::jsonb as ecj) j
  ),
  logged_equipment as (
    select
      wea.target_id as inventory_item_id,
      coalesce(wea.club_id, cei.club_id) as club_id,
      cei.catalog_item_id,
      lower(coalesce(cei.equipment_category, ecr.equipment_category, wea.target_key)) as equipment_category,
      coalesce(nullif(cei.display_name, ''), ecr.display_name, wea.target_id::text) as display_name,
      rc.rider_count as rider_use_count,
      rc.rider_count as allocated_physical_use_count,
      coalesce(wea.condition_loss, 0)::numeric(10,3) as planned_loss,
      'setup_preset_limited'::text as match_type,
      rc.source_value_id,
      true as already_applied,
      0::numeric(10,3) as pending_loss,
      0 as source_priority
    from public.race_engine_stage_wear_applications wea
    join public.club_equipment_inventory cei
      on cei.id = wea.target_id
    left join equipment_catalog_rows ecr
      on ecr.catalog_item_id = cei.catalog_item_id
    join required_categories rc
      on rc.club_id = coalesce(wea.club_id, cei.club_id)
     and rc.equipment_category = lower(coalesce(cei.equipment_category, ecr.equipment_category, wea.target_key))
    where wea.simulation_run_id = p_simulation_run_id
      and wea.target_type = 'equipment'
      and wea.target_table = 'club_equipment_inventory'
  ),
  logged_counts as (
    select
      club_id,
      equipment_category,
      count(*)::integer as logged_count
    from logged_equipment
    group by club_id, equipment_category
  ),
  ranked_unlogged_inventory as (
    select
      cei.id as inventory_item_id,
      cei.club_id,
      cei.catalog_item_id,
      lower(coalesce(cei.equipment_category, ecr.equipment_category)) as equipment_category,
      coalesce(nullif(cei.display_name, ''), ecr.display_name, cei.id::text) as display_name,
      ecr.condition_loss_per_race_day,
      row_number() over (
        partition by cei.club_id, lower(coalesce(cei.equipment_category, ecr.equipment_category))
        order by
          coalesce(cei.condition_percent, 100) desc,
          cei.id::text asc
      ) as physical_rank
    from public.club_equipment_inventory cei
    join equipment_catalog_rows ecr on ecr.catalog_item_id = cei.catalog_item_id
    left join public.race_engine_stage_wear_applications existing_log
      on existing_log.simulation_run_id = p_simulation_run_id
     and existing_log.target_type = 'equipment'
     and existing_log.target_table = 'club_equipment_inventory'
     and existing_log.target_id = cei.id
    where cei.club_id in (select club_id from planned_riders)
      and lower(coalesce(cei.equipment_category, ecr.equipment_category)) = any(v_categories)
      and coalesce(cei.condition_percent, 100) > 0
      and existing_log.id is null
  ),
  fill_candidates as (
    select
      rui.inventory_item_id,
      rui.club_id,
      rui.catalog_item_id,
      rui.equipment_category,
      rui.display_name,
      rc.rider_count as rider_use_count,
      rc.rider_count as allocated_physical_use_count,
      greatest(
        0,
        (v_stage_distance_km / 100.0)
        * coalesce(nullif(rui.condition_loss_per_race_day, 0), 0.35)
        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(rui.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,3) as planned_loss,
      'setup_preset_limited'::text as match_type,
      rc.source_value_id,
      false as already_applied,
      greatest(
        0,
        (v_stage_distance_km / 100.0)
        * coalesce(nullif(rui.condition_loss_per_race_day, 0), 0.35)
        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(rui.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,3) as pending_loss,
      1 as source_priority
    from required_categories rc
    join ranked_unlogged_inventory rui
      on rui.club_id = rc.club_id
     and rui.equipment_category = rc.equipment_category
    left join logged_counts lc
      on lc.club_id = rc.club_id
     and lc.equipment_category = rc.equipment_category
    where rui.physical_rank <= greatest(0, rc.rider_count - coalesce(lc.logged_count, 0))
  ),
  raw_candidates as (
    select * from logged_equipment
    union all
    select * from fill_candidates
  ),
  consolidated as (
    select distinct on (rc.inventory_item_id)
      rc.inventory_item_id,
      rc.club_id,
      rc.catalog_item_id,
      rc.equipment_category,
      rc.display_name,
      rc.rider_use_count,
      rc.allocated_physical_use_count,
      rc.planned_loss,
      rc.already_applied,
      rc.pending_loss,
      rc.match_type,
      rc.source_value_id
    from raw_candidates rc
    order by rc.inventory_item_id, rc.source_priority, rc.equipment_category
  )
  select
    c.inventory_item_id,
    c.club_id,
    c.catalog_item_id,
    c.equipment_category,
    c.display_name,
    c.rider_use_count,
    c.allocated_physical_use_count,
    c.planned_loss,
    c.already_applied,
    c.pending_loss,
    c.match_type,
    c.source_value_id
  from consolidated c;

  -- p_dry_run=true is the safe/default path and performs no writes.
  if not p_dry_run then
    insert into public.race_engine_stage_wear_applications (
      simulation_run_id,
      stage_id,
      race_id,
      club_id,
      target_type,
      target_table,
      target_id,
      target_key,
      condition_loss,
      applied_game_date,
      metadata
    )
    select
      p_simulation_run_id,
      v_stage_id,
      v_race_id,
      c.club_id,
      'equipment',
      'club_equipment_inventory',
      c.inventory_item_id,
      c.equipment_category,
      c.pending_loss,
      v_applied_game_date,
      jsonb_build_object(
        'source', 'race_engine_stage_interactions_v8_5',
        'match_type', c.match_type,
        'catalog_item_id', c.catalog_item_id,
        'source_value_id', c.source_value_id,
        'display_name', c.display_name,
        'stage_distance_km', v_stage_distance_km,
        'rider_use_count', c.rider_use_count,
        'allocated_physical_use_count', c.allocated_physical_use_count
      )
    from tmp_stage_equipment_wear_candidates c
    where c.pending_loss > 0
      and c.already_applied = false
    on conflict (simulation_run_id, target_type, target_table, target_id) do nothing;

    get diagnostics v_inserted_equipment_log_count = row_count;

    update public.club_equipment_inventory cei
    set
      condition_percent = greatest(0, coalesce(cei.condition_percent, 100) - c.pending_loss),
      last_used_game_date = coalesce(v_applied_game_date, cei.last_used_game_date),
      total_distance_km = coalesce(cei.total_distance_km, 0) + v_stage_distance_km,
      total_race_days = coalesce(cei.total_race_days, 0) + 1
    from tmp_stage_equipment_wear_candidates c
    join public.race_engine_stage_wear_applications wea
      on wea.simulation_run_id = p_simulation_run_id
     and wea.target_type = 'equipment'
     and wea.target_table = 'club_equipment_inventory'
     and wea.target_id = c.inventory_item_id
     and wea.metadata->>'source' = 'race_engine_stage_interactions_v8_5'
    where cei.id = c.inventory_item_id
      and c.pending_loss > 0
      and c.already_applied = false;

    get diagnostics v_updated_equipment_count = row_count;
  end if;

  v_result := jsonb_build_object(
    'status', 'ok',
    'version', 'v8_5_log_locked_equipment_candidates',
    'dry_run', p_dry_run,
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'race_id', v_race_id,
    'stage_distance_km', v_stage_distance_km,
    'plan_source_rows', v_inserted_plan_rows,
    'plan_source_rows_from_stage_plan_json', v_inserted_direct_plan_rows,
    'plan_source_rows_from_race_preparation_riders', v_inserted_prep_plan_rows,
    'plan_sources_by_kind', coalesce((
      select jsonb_agg(jsonb_build_object('source_kind', source_kind, 'rows', rows, 'riders', riders) order by source_kind)
      from (
        select source_kind, count(*) as rows, count(distinct rider_id) as riders
        from tmp_stage_equipment_plan_sources
        group by source_kind
      ) s
    ), '[]'::jsonb),
    'planned_riders_by_club', coalesce((
      select jsonb_agg(jsonb_build_object('club_id', club_id, 'rider_count', rider_count) order by club_id::text)
      from (
        select club_id, count(distinct rider_id) as rider_count
        from tmp_stage_equipment_plan_sources
        where rider_id is not null
        group by club_id
      ) pr
    ), '[]'::jsonb),
    'equipment_candidate_count', (select count(*) from tmp_stage_equipment_wear_candidates),
    'equipment_pending_count', (select count(*) from tmp_stage_equipment_wear_candidates where pending_loss > 0),
    'equipment_already_applied_count', (select count(*) from tmp_stage_equipment_wear_candidates where already_applied),
    'equipment_updated_count', v_updated_equipment_count,
    'equipment_log_inserted_count', v_inserted_equipment_log_count,
    'asset_existing_log_count', (
      select count(*)
      from public.race_engine_stage_wear_applications wea
      where wea.simulation_run_id = p_simulation_run_id
        and wea.target_type = 'asset'
    ),
    'asset_existing_logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'target_table', wea.target_table,
          'target_id', wea.target_id,
          'target_key', wea.target_key,
          'condition_loss', wea.condition_loss,
          'already_applied', true,
          'pending_loss', 0,
          'applied_game_date', wea.applied_game_date,
          'metadata', wea.metadata
        )
        order by wea.target_table, wea.target_key, wea.target_id::text
      )
      from public.race_engine_stage_wear_applications wea
      where wea.simulation_run_id = p_simulation_run_id
        and wea.target_type = 'asset'
    ), '[]'::jsonb),
    'equipment_candidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'inventory_item_id', c.inventory_item_id,
          'club_id', c.club_id,
          'catalog_item_id', c.catalog_item_id,
          'equipment_category', c.equipment_category,
          'display_name', c.display_name,
          'rider_use_count', c.rider_use_count,
          'allocated_physical_use_count', c.allocated_physical_use_count,
          'planned_loss', c.planned_loss,
          'already_applied', c.already_applied,
          'pending_loss', c.pending_loss,
          'match_type', c.match_type,
          'source_value_id', c.source_value_id
        )
        order by c.club_id::text, c.equipment_category, c.display_name, c.inventory_item_id::text
      )
      from tmp_stage_equipment_wear_candidates c
    ), '[]'::jsonb),
    'debug_schema_columns', coalesce((
      select jsonb_object_agg(table_name, columns)
      from (
        select
          table_name,
          jsonb_agg(column_name order by ordinal_position) as columns
        from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            'race_stage_plans',
            'race_preparation_riders',
            'race_preparations',
            'club_equipment_inventory',
            'equipment_catalog'
          )
        group by table_name
      ) c
    ), '{}'::jsonb)
  );

  return v_result;
end;
$function$;


/* ------------------------------------------------------------------------- */
/* 8. Supply application orchestrator. Phase 9 math remains authoritative.    */
/* ------------------------------------------------------------------------- */
create or replace function public.universal_race_stage_apply_phase9_supplies_v1(
  p_simulation_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $phase11b_supplies$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_row jsonb;
  v_resource_id text;
  v_kind text;
  v_supply_key text;
  v_team_id uuid;
  v_current_quantity numeric;
  v_before numeric;
  v_current_uses numeric;
  v_unit_id uuid;
  v_stage_date date;
  v_team record;
  v_usage jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_call_count integer := 0;
begin
  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  for update;

  if not found then raise exception 'Unknown simulation run %', p_simulation_run_id; end if;
  v_manifest := coalesce(v_run.result_summary_json -> 'application_manifest', '{}'::jsonb);
  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1' then
    raise exception 'Run % has no universal Phase 11 application manifest.', p_simulation_run_id;
  end if;

  select stage.stage_date::date into v_stage_date
  from public.race_stages stage where stage.id = v_run.stage_id;

  -- Drift-check every source row before any supply mutation.
  for v_row in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)) item
    where item ->> 'resourceType' = 'supply'
    order by item ->> 'resourceId'
  loop
    v_resource_id := v_row ->> 'resourceId';
    v_kind := coalesce(v_run.input_snapshot_json #>> array['preparation','raceSupplies',v_resource_id,'resourceKind'], '');
    v_supply_key := coalesce(v_run.input_snapshot_json #>> array['preparation','raceSupplies',v_resource_id,'supplyKey'], '');
    v_team_id := nullif(v_row ->> 'teamId', '')::uuid;

    if v_kind = 'consumable_supply' and nullif(v_row ->> 'quantityBefore', '') is not null then
      v_before := (v_row ->> 'quantityBefore')::numeric;
      select supply.quantity_available::numeric
      into v_current_quantity
      from public.club_race_supplies supply
      where supply.club_id = v_team_id and supply.supply_key = v_supply_key
      for update;

      if not found then v_current_quantity := 0; end if;
      if abs(coalesce(v_current_quantity, 0) - coalesce(v_before, 0)) > 0.001 then
        raise exception 'Phase 11B supply quantity drift for team %, key %: current %, manifest before %.',
          v_team_id, v_supply_key, v_current_quantity, v_before;
      end if;
    elsif v_kind = 'durable_supply_unit' and nullif(v_row ->> 'stageUsesBefore', '') is not null then
      v_unit_id := replace(v_resource_id, 'durable:', '')::uuid;
      v_before := (v_row ->> 'stageUsesBefore')::numeric;
      select unit.stage_uses_remaining::numeric
      into v_current_uses
      from public.club_race_supply_units unit
      where unit.id = v_unit_id
      for update;

      if not found then raise exception 'Phase 11B durable supply unit % was not found.', v_unit_id; end if;
      if abs(coalesce(v_current_uses, 0) - coalesce(v_before, 0)) > 0.001 then
        raise exception 'Phase 11B durable supply drift for unit %: current %, manifest before %.',
          v_unit_id, v_current_uses, v_before;
      end if;
    end if;
  end loop;

  for v_team in
    with rows as (
      select
        nullif(item ->> 'teamId', '')::uuid as team_id,
        item ->> 'resourceId' as resource_id,
        coalesce(v_run.input_snapshot_json #>> array['preparation','raceSupplies',item ->> 'resourceId','supplyKey'], '') as supply_key,
        coalesce(v_run.input_snapshot_json #>> array['preparation','raceSupplies',item ->> 'resourceId','resourceKind'], '') as resource_kind,
        coalesce(nullif(item ->> 'quantityUsed', '')::numeric, 0) as quantity_used,
        coalesce(nullif(item ->> 'stageUsesUsed', '')::numeric, 0) as stage_uses_used
      from jsonb_array_elements(coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)) item
      where item ->> 'resourceType' = 'supply'
    ), grouped as (
      select
        team_id,
        supply_key,
        sum(case when resource_kind = 'consumable_supply' then quantity_used else 0 end)::integer as consumable_used,
        sum(case when resource_kind = 'durable_supply_unit' then stage_uses_used else 0 end)::integer as durable_used
      from rows
      where team_id is not null and supply_key <> ''
      group by team_id, supply_key
    )
    select
      team_id,
      coalesce(sum(consumable_used) filter (where supply_key = 'bidons_water_bottles'), 0)::integer as bidons,
      coalesce(sum(consumable_used) filter (where supply_key = 'energy_gels'), 0)::integer as gels,
      coalesce(sum(consumable_used) filter (where supply_key = 'nutrition_packs'), 0)::integer as nutrition,
      coalesce(sum(durable_used) filter (where supply_key = 'race_jersey_complete'), 0)::integer as jerseys,
      coalesce(sum(durable_used) filter (where supply_key = 'rain_jackets'), 0)::integer as jackets
    from grouped
    group by team_id
    order by team_id
  loop
    v_usage := jsonb_build_object(
      'bidons_water_bottles', v_team.bidons,
      'energy_gels', v_team.gels,
      'nutrition_packs', v_team.nutrition,
      'race_jersey_complete', v_team.jerseys,
      'rain_jackets', v_team.jackets,
      'rain_jacket_counts_as_use', v_team.jackets > 0,
      'source', 'phase11b_universal_application_manifest'
    );

    v_result := public.apply_race_stage_supply_usage_v1(
      v_team.team_id,
      v_usage,
      v_stage_date,
      'phase11b:' || p_simulation_run_id::text || ':supplies:' || v_team.team_id::text,
      null
    );
    v_results := v_results || jsonb_build_array(v_result);
    v_call_count := v_call_count + 1;
  end loop;

  -- Exact post-application verification against the immutable Phase 9 rows.
  -- This turns any unexpected inventory selection/drift into a transaction
  -- failure rather than silently accepting a different persistent result.
  for v_row in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)) item
    where item ->> 'resourceType' = 'supply'
    order by item ->> 'resourceId'
  loop
    v_resource_id := v_row ->> 'resourceId';
    v_kind := coalesce(v_run.input_snapshot_json #>> array['preparation','raceSupplies',v_resource_id,'resourceKind'], '');
    v_supply_key := coalesce(v_run.input_snapshot_json #>> array['preparation','raceSupplies',v_resource_id,'supplyKey'], '');
    v_team_id := nullif(v_row ->> 'teamId', '')::uuid;

    if v_kind = 'consumable_supply' and nullif(v_row ->> 'quantityAfter', '') is not null then
      select supply.quantity_available::numeric
      into v_current_quantity
      from public.club_race_supplies supply
      where supply.club_id = v_team_id and supply.supply_key = v_supply_key;

      if not found then v_current_quantity := 0; end if;
      if abs(coalesce(v_current_quantity, 0) - (v_row ->> 'quantityAfter')::numeric) > 0.001 then
        raise exception 'Phase 11B supply post-application mismatch for team %, key %: current %, manifest after %.',
          v_team_id, v_supply_key, v_current_quantity, (v_row ->> 'quantityAfter')::numeric;
      end if;
    elsif v_kind = 'durable_supply_unit' and nullif(v_row ->> 'stageUsesAfter', '') is not null then
      v_unit_id := replace(v_resource_id, 'durable:', '')::uuid;
      select unit.stage_uses_remaining::numeric
      into v_current_uses
      from public.club_race_supply_units unit
      where unit.id = v_unit_id;

      if not found then raise exception 'Phase 11B durable supply unit % disappeared after application.', v_unit_id; end if;
      if abs(coalesce(v_current_uses, 0) - (v_row ->> 'stageUsesAfter')::numeric) > 0.001 then
        raise exception 'Phase 11B durable supply post-application mismatch for unit %: current %, manifest after %.',
          v_unit_id, v_current_uses, (v_row ->> 'stageUsesAfter')::numeric;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'team_application_count', v_call_count,
    'results', v_results
  );
end;
$phase11b_supplies$;

/* ------------------------------------------------------------------------- */
/* 9. Health candidates -> existing unified health creator, exact-once.       */
/* ------------------------------------------------------------------------- */
create or replace function public.universal_race_stage_apply_health_candidates_v1(
  p_simulation_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $phase11b_health$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_row jsonb;
  v_rider_id uuid;
  v_team_id uuid;
  v_case_code text;
  v_incident_id text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_existing integer := 0;
begin
  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  for update;
  if not found then raise exception 'Unknown simulation run %', p_simulation_run_id; end if;

  v_manifest := coalesce(v_run.result_summary_json -> 'application_manifest', '{}'::jsonb);

  for v_row in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'healthCaseCandidates', '[]'::jsonb)) item
    order by item ->> 'riderId', item ->> 'incidentId'
  loop
    v_rider_id := nullif(v_row ->> 'riderId', '')::uuid;
    v_team_id := nullif(v_row ->> 'teamId', '')::uuid;
    v_case_code := nullif(v_row ->> 'caseCode', '');
    v_incident_id := coalesce(v_row ->> 'incidentId', '');

    if v_rider_id is null or v_team_id is null or v_case_code is null then
      raise exception 'Incomplete Phase 10 health candidate: %', v_row;
    end if;

    if exists (
      select 1
      from public.rider_health_case_context_v1 context
      where context.rider_id = v_rider_id
        and context.source_type = 'race'
        and context.source_id = v_run.stage_id
        and context.case_code = public.health_normalize_case_code_v1(v_case_code)
        and coalesce(context.notes ->> 'phase11_incident_id', '') = v_incident_id
    ) then
      v_existing := v_existing + 1;
      continue;
    end if;

    v_result := public.health_create_rider_case_v1(
      v_rider_id,
      v_team_id,
      v_case_code,
      coalesce(nullif(v_row ->> 'severity', ''), 'moderate'),
      'race',
      v_run.stage_id,
      nullif(v_row ->> 'bodyPart', ''),
      (select stage.stage_date::date from public.race_stages stage where stage.id = v_run.stage_id),
      coalesce(v_row -> 'notes', '{}'::jsonb) || jsonb_build_object(
        'phase11_incident_id', v_incident_id,
        'phase11_simulation_run_id', p_simulation_run_id,
        'phase11_source_type', 'race_stage_incident',
        'selection_blocked_after_stage', coalesce((v_row ->> 'selectionBlockedAfterStage')::boolean, false)
      )
    );

    v_results := v_results || jsonb_build_array(v_result);
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'created_count', v_created,
    'already_applied_count', v_existing,
    'results', v_results
  );
end;
$phase11b_health$;

/* ------------------------------------------------------------------------- */
/* 10. Exact-once finalizer: Phase 8/9/10 persistence + official publication. */
/* ------------------------------------------------------------------------- */
create or replace function public.universal_race_stage_finalize_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $phase11b_finalize$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_manifest jsonb;
  v_output jsonb;
  v_row jsonb;
  v_stage_result_count integer := 0;
  v_point_result_count integer := 0;
  v_report_event_count integer := 0;
  v_rider_state_count integer := 0;
  v_fatigue_result jsonb;
  v_supply_result jsonb;
  v_wear_result jsonb;
  v_health_result jsonb;
  v_classification_result jsonb;
  v_prize_payment_result jsonb;
  v_is_final_stage boolean := false;
  v_role_code text;
  v_stage_status text;
  v_start_stamina numeric;
begin
  if p_stage_id is null then raise exception 'p_stage_id is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_finalize:' || p_stage_id::text, 0));
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  select * into v_state
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id
  for update;
  if not found then raise exception 'Phase 11B lifecycle state for stage % was not found.', p_stage_id; end if;

  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = v_state.simulation_run_id
    and run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
  for update;
  if not found then raise exception 'Phase 11B simulation run for stage % was not found.', p_stage_id; end if;

  if v_run.status = 'completed'
     and coalesce((v_run.result_summary_json ->> 'results_published')::boolean, false)
  then
    return jsonb_build_object(
      'status', 'already_published',
      'stage_id', p_stage_id,
      'simulation_run_id', v_run.id
    );
  end if;

  if v_run.status <> 'running'
     or coalesce(v_run.result_summary_json ->> 'calculation_contract', '') <> 'universal_phase11b_calculated_hidden_v1'
  then
    raise exception 'Stage % does not have a running hidden Phase 11B calculation.', p_stage_id;
  end if;

  if v_state.last_status <> 'replay_live' then
    raise exception 'Stage % replay is not live/closable; current lifecycle status is %.', p_stage_id, v_state.last_status;
  end if;

  if nullif(v_state.details ->> 'replay_closes_at_real', '') is null
     or clock_timestamp() < (v_state.details ->> 'replay_closes_at_real')::timestamptz
  then
    raise exception 'Stage % replay window has not closed.', p_stage_id;
  end if;

  v_manifest := coalesce(v_run.result_summary_json -> 'application_manifest', '{}'::jsonb);
  v_output := coalesce(v_run.result_summary_json -> 'output_snapshot', '{}'::jsonb);

  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1'
     or not coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
     or coalesce((v_manifest ->> 'persistenceApplied')::boolean, true)
     or coalesce(v_output ->> 'contractVersion', '') <> 'universal_race_stage_output_v1'
  then
    raise exception 'Stage % has no unapplied valid Phase 11 manifest/output.', p_stage_id;
  end if;

  -- No competing official output may exist. Historical rows are never replaced.
  if exists (select 1 from public.race_stage_results result where result.stage_id = p_stage_id)
     or exists (select 1 from public.race_stage_point_results point_result where point_result.stage_id = p_stage_id)
     or exists (select 1 from public.race_stage_report_events report_event where report_event.stage_id = p_stage_id)
     or exists (select 1 from public.race_stage_authoritative_runs authority where authority.stage_id = p_stage_id)
  then
    raise exception 'Stage % already has official output/authority; Phase 11B refuses to overwrite it.', p_stage_id;
  end if;

  -- A production finalizer starts from a clean persistence boundary. Individual
  -- application helpers are exposed only for internal reuse; if anything has
  -- already mutated this run outside this transaction, refuse to compound it.
  if exists (select 1 from public.race_stage_rider_states state_row where state_row.simulation_run_id = v_run.id)
     or exists (select 1 from public.race_engine_stage_wear_applications wear where wear.simulation_run_id = v_run.id)
     or exists (
       select 1 from public.race_stage_supply_usage_events event
       where coalesce(event.idempotency_key, '') like 'phase11b:' || v_run.id::text || ':%'
     )
     or exists (
       select 1 from public.rider_health_case_context_v1 context
       where coalesce(context.notes ->> 'phase11_simulation_run_id', '') = v_run.id::text
     )
  then
    raise exception 'Stage % already has partial Phase 11B persistence; refusing non-atomic finalization.', p_stage_id;
  end if;

  /* Phase 8 rider state handoff. */
  for v_row in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) item
    order by item ->> 'riderId'
  loop
    select plan_rider ->> 'stageRole'
    into v_role_code
    from jsonb_array_elements(coalesce(v_run.input_snapshot_json -> 'stagePlans', '[]'::jsonb)) team_plan,
         jsonb_array_elements(coalesce(team_plan -> 'riders', '[]'::jsonb)) plan_rider
    where plan_rider ->> 'riderId' = v_row ->> 'riderId'
    limit 1;

    v_role_code := coalesce(nullif(v_role_code, ''), 'free_role');
    v_stage_status := case lower(coalesce(v_row ->> 'finishStatus', 'finished'))
      when 'dns' then 'dns'
      when 'dnf' then 'dnf'
      when 'otl' then 'otl'
      else 'finished'
    end;
    v_start_stamina := least(
      100::numeric,
      greatest(
        0::numeric,
        coalesce(nullif(v_row ->> 'finishStamina', '')::numeric, 0)
          + coalesce(nullif(v_row ->> 'staminaSpent', '')::numeric, 0)
      )
    );

    insert into public.race_stage_rider_states (
      simulation_run_id, race_id, stage_id, rider_id, team_id, role_code,
      start_stamina, finish_stamina, stamina_spent,
      fatigue_before_stage, fatigue_gain, fatigue_after_stage,
      stage_status, finish_position, finish_time_seconds, gap_seconds, metadata
    ) values (
      v_run.id,
      v_run.race_id,
      v_run.stage_id,
      nullif(v_row ->> 'riderId', '')::uuid,
      nullif(v_row ->> 'teamId', '')::uuid,
      v_role_code,
      v_start_stamina,
      coalesce(nullif(v_row ->> 'finishStamina', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'staminaSpent', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueBeforeStage', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueGain', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueAfterStage', '')::numeric, 0),
      v_stage_status,
      nullif(v_row ->> 'finishPosition', '')::integer,
      nullif(v_row ->> 'finishTimeSeconds', '')::integer,
      nullif(v_row ->> 'gapSeconds', '')::integer,
      jsonb_build_object(
        'source', 'phase11b_universal_application_manifest',
        'manifest_write_key', v_row ->> 'writeKey',
        'official_finish_status', lower(coalesce(v_row ->> 'finishStatus', 'finished')),
        'universal_engine_key', 'ppm_universal_race_v1',
        'universal_engine_version', '1'
      )
    )
    on conflict (simulation_run_id, rider_id) do update
    set team_id = excluded.team_id,
        role_code = excluded.role_code,
        start_stamina = excluded.start_stamina,
        finish_stamina = excluded.finish_stamina,
        stamina_spent = excluded.stamina_spent,
        fatigue_before_stage = excluded.fatigue_before_stage,
        fatigue_gain = excluded.fatigue_gain,
        fatigue_after_stage = excluded.fatigue_after_stage,
        stage_status = excluded.stage_status,
        finish_position = excluded.finish_position,
        finish_time_seconds = excluded.finish_time_seconds,
        gap_seconds = excluded.gap_seconds,
        metadata = excluded.metadata;
  end loop;

  select count(*)::integer into v_rider_state_count
  from public.race_stage_rider_states state_row
  where state_row.simulation_run_id = v_run.id;

  if v_rider_state_count <> jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) then
    raise exception 'Phase 11B rider-state persistence count mismatch: % stored vs % manifest.',
      v_rider_state_count,
      jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb));
  end if;

  v_fatigue_result := public.race_engine_apply_stage_fatigue_v1(v_run.id);
  v_supply_result := public.universal_race_stage_apply_phase9_supplies_v1(v_run.id);
  v_wear_result := public.race_engine_apply_stage_equipment_asset_wear_v1(v_run.id, false);
  v_health_result := public.universal_race_stage_apply_health_candidates_v1(v_run.id);

  /* Official result rows from the same immutable output. */
  insert into public.race_stage_results (
    race_id, stage_id, rider_id, team_id, rank, status,
    elapsed_seconds, gap_seconds, bonus_seconds, penalty_seconds,
    finish_points, sprint_points, mountain_points,
    rider_name_snapshot, team_name_snapshot,
    simulation_run_id, output_contract, created_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    nullif(row ->> 'rank', '')::integer,
    lower(coalesce(row ->> 'status', 'finished')),
    nullif(row ->> 'elapsedSeconds', '')::numeric::integer,
    nullif(row ->> 'gapSeconds', '')::numeric::integer,
    coalesce(nullif(row ->> 'bonusSeconds', '')::numeric::integer, 0),
    coalesce(nullif(row ->> 'penaltySeconds', '')::numeric::integer, 0),
    coalesce(nullif(row ->> 'finishPoints', '')::integer, 0),
    coalesce(nullif(row ->> 'sprintPoints', '')::integer, 0),
    coalesce(nullif(row ->> 'mountainPoints', '')::integer, 0),
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    v_run.id,
    'run_scoped_v1',
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,stageResults}', '[]'::jsonb)) row;
  get diagnostics v_stage_result_count = row_count;

  if v_stage_result_count = 0 then raise exception 'Phase 11B publication produced no stage result rows.'; end if;

  insert into public.race_stage_point_results (
    race_id, stage_id, point_id, rider_id, team_id, rank,
    points_awarded, bonus_seconds_awarded,
    rider_name_snapshot, team_name_snapshot, created_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'pointId', '')::uuid,
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    nullif(row ->> 'rank', '')::integer,
    coalesce(nullif(row ->> 'pointsAwarded', '')::integer, 0),
    coalesce(nullif(row ->> 'bonusSecondsAwarded', '')::integer, 0),
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,pointResults}', '[]'::jsonb)) row
  where coalesce(nullif(row ->> 'pointsAwarded', '')::integer, 0) <> 0
     or coalesce(nullif(row ->> 'bonusSecondsAwarded', '')::integer, 0) <> 0;
  get diagnostics v_point_result_count = row_count;

  insert into public.race_stage_report_events (
    race_id, stage_id, event_order, km_marker, race_time_label,
    event_type, title, description, rider_id, team_id,
    rider_name_snapshot, team_name_snapshot, metadata,
    created_at, updated_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'eventOrder', '')::integer,
    nullif(row ->> 'kmMarker', '')::numeric,
    null,
    case row ->> 'eventType'
      when 'race_start' then 'start'
      when 'phase_end' then 'summary'
      when 'finish_preparation' then 'summary'
      when 'race_status' then 'summary'
      when 'breakaway_formation' then 'breakaway'
      when 'peloton_control' then 'tactical_tempo'
      when 'group_split' then 'split'
      when 'late_chase' then 'tactical_chase'
      when 'bridge_attack' then 'tactical_attack'
      when 'bridge_progress' then 'tactical_chase'
      when 'bridge_merge' then 'catch'
      when 'incident' then 'tactical_incident_warning'
      when 'group_merge' then 'catch'
      else case
        when row ->> 'eventType' in (
          'attack', 'breakaway', 'catch', 'crash', 'finish', 'kom',
          'mechanical', 'neutral_start', 'split', 'sprint', 'start', 'summary',
          'tactical_attack', 'tactical_breakaway_attempt', 'tactical_chase',
          'tactical_command', 'tactical_equipment_wear',
          'tactical_incident_warning', 'tactical_leadout',
          'tactical_positioning', 'tactical_protection', 'tactical_safety',
          'tactical_sprint', 'tactical_tempo', 'weather'
        ) then row ->> 'eventType'
        else 'summary'
      end
    end,
    row ->> 'title',
    row ->> 'description',
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    coalesce(row -> 'metadata', '{}'::jsonb) || jsonb_build_object(
      'simulation_run_id', v_run.id,
      'output_contract', 'universal_race_stage_output_v1',
      'universal_event_type', row ->> 'eventType'
    ),
    clock_timestamp(),
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,reportEvents}', '[]'::jsonb)) row;
  get diagnostics v_report_event_count = row_count;

  -- Reuse the existing classification contract: the simulation run is marked
  -- completed before authority/classification writers inspect it. This remains
  -- atomic because every statement in this finalizer is in the same transaction;
  -- any later failure rolls this update back together with all persistence.
  update public.race_stage_simulation_runs
  set status = 'completed',
      completed_at = clock_timestamp(),
      failed_at = null,
      error_message = null,
      updated_at = clock_timestamp()
  where id = v_run.id;

  -- Mark official authority only after every persistent layer above succeeds.
  insert into public.race_stage_authoritative_runs (
    stage_id, simulation_run_id, race_id, engine_version, simulation_mode,
    authority_kind, approved_at, activated_at, approved_by,
    contract_version, metadata, created_at, updated_at
  ) values (
    v_run.stage_id,
    v_run.id,
    v_run.race_id,
    'race_engine_ts_v1',
    'deterministic_road_race_v1',
    'typescript_activation',
    clock_timestamp(),
    clock_timestamp(),
    current_user,
    'race_stage_authoritative_run_v1',
    jsonb_build_object(
      'universal_engine_key', 'ppm_universal_race_v1',
      'universal_engine_version', '1',
      'universal_output_contract', 'universal_race_stage_output_v1',
      'input_hash_md5', v_run.result_summary_json ->> 'input_hash_md5',
      'output_hash_md5', v_run.result_summary_json ->> 'output_hash_md5',
      'worker_version', 'netlify_phase11b_v1',
      'legacy_calculation_used', false,
      'legacy_replay_used', false,
      'legacy_commentary_used', false,
      'phase11_persistence_applied', true
    ),
    clock_timestamp(),
    clock_timestamp()
  );

  v_classification_result := public.race_engine_write_cumulative_classifications_v1(v_run.id);

  select not exists (
    select 1
    from public.race_stages later
    where later.race_id = v_run.race_id
      and later.stage_number > (select current_stage.stage_number from public.race_stages current_stage where current_stage.id = v_run.stage_id)
      and not coalesce(later.weather_cancelled, false)
  ) into v_is_final_stage;

  if v_is_final_stage then
    perform public.generate_race_ranking_point_awards_v1(v_run.race_id, v_run.stage_id, true);
    perform public.generate_race_prize_awards_v1(v_run.race_id, v_run.stage_id, true);
    v_prize_payment_result := public.race_engine_pay_prize_awards_v1(v_run.race_id, v_run.stage_id);
  end if;

  update public.race_stage_simulation_runs
  set status = 'completed',
      completed_at = clock_timestamp(),
      failed_at = null,
      error_message = null,
      result_summary_json = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                coalesce(result_summary_json, '{}'::jsonb),
                '{application_manifest,persistenceApplied}', 'true'::jsonb, true
              ),
              '{output_snapshot,applicationManifest,persistenceApplied}', 'true'::jsonb, true
            ),
            '{phase11_persistence_applied}', 'true'::jsonb, true
          ),
          '{official_outputs_persisted}', 'true'::jsonb, true
        ),
        '{results_published}', 'true'::jsonb, true
      ) || jsonb_build_object(
        'calculation_status', 'published',
        'published_at_real', clock_timestamp(),
        'verification_only', false
      ),
      updated_at = clock_timestamp()
  where id = v_run.id;

  update public.race_stage_automation_state
  set last_status = 'published',
      last_published_at = clock_timestamp(),
      last_checked_at = clock_timestamp(),
      last_error = null,
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'results_published', true,
        'results_published_at_real', clock_timestamp(),
        'phase11_persistence_applied', true,
        'official_outputs_persisted', true,
        'stage_result_count', v_stage_result_count,
        'point_result_count', v_point_result_count,
        'report_event_count', v_report_event_count,
        'rider_state_count', v_rider_state_count,
        'is_final_stage', v_is_final_stage
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id;

  return jsonb_build_object(
    'status', 'published',
    'race_id', v_run.race_id,
    'stage_id', p_stage_id,
    'simulation_run_id', v_run.id,
    'stage_result_count', v_stage_result_count,
    'point_result_count', v_point_result_count,
    'report_event_count', v_report_event_count,
    'rider_state_count', v_rider_state_count,
    'fatigue_result', v_fatigue_result,
    'supply_result', v_supply_result,
    'wear_result', v_wear_result,
    'health_result', v_health_result,
    'classification_result', v_classification_result,
    'is_final_stage', v_is_final_stage,
    'prize_payment_result', v_prize_payment_result
  );
end;
$phase11b_finalize$;

/* ------------------------------------------------------------------------- */
/* 11. Claim the next production stage due under the game clock.              */
/* ------------------------------------------------------------------------- */
create or replace function public.universal_race_stage_claim_next_due_v1(
  p_worker_id text default 'netlify_phase11b_v1'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $phase11b_next_due$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_id uuid;
  v_claim jsonb;
begin
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id = true;
  if not found or not coalesce(v_control.typescript_lifecycle_enabled, false) then
    return jsonb_build_object('status', 'disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  for v_stage_id in
    select stage.id
    from public.race_stages stage
    where not coalesce(stage.weather_cancelled, false)
      and stage.planned_start_hour_number is not null
      and (
        stage.stage_date::timestamp
          + make_interval(hours => coalesce(stage.planned_start_hour_number, 12), mins => coalesce(stage.planned_start_minute, 0))
      ) >= v_control.typescript_activation_game_at
      and (
        stage.stage_date::timestamp
          + make_interval(hours => coalesce(stage.planned_start_hour_number, 12), mins => coalesce(stage.planned_start_minute, 0))
          - make_interval(hours => coalesce(v_control.typescript_calculation_lead_hours, 3))
      ) <= v_current_game_at
      and not exists (
        select 1
        from public.race_stage_authoritative_runs authority
        where authority.stage_id = stage.id
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs run
        where run.stage_id = stage.id
          and run.engine_version = 'race_engine_ts_v1'
          and run.simulation_mode = 'deterministic_road_race_v1'
          and run.status in ('running', 'completed')
          and coalesce(run.result_summary_json ->> 'calculation_contract', '') in (
            'phase11b_claim_pending_v1',
            'universal_phase11b_calculated_hidden_v1'
          )
      )
    order by stage.stage_date, stage.planned_start_hour_number, stage.planned_start_minute, stage.race_id, stage.stage_number
    limit 20
  loop
    v_claim := public.universal_race_stage_claim_calculation_v1(v_stage_id);
    if coalesce(v_claim ->> 'status', '') = 'claimed' then
      return v_claim || jsonb_build_object('worker_id', coalesce(nullif(p_worker_id, ''), 'netlify_phase11b_v1'));
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'no_due_stage',
    'current_game_at', v_current_game_at
  );
end;
$phase11b_next_due$;

/* ------------------------------------------------------------------------- */
/* 12. Replay opening and due publication.                                    */
/* ------------------------------------------------------------------------- */
create or replace function public.universal_race_stage_process_lifecycle_v1(
  p_max_publications integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $phase11b_lifecycle$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_snapshot_result jsonb;
  v_state record;
  v_result jsonb;
  v_opened jsonb := '[]'::jsonb;
  v_published jsonb := '[]'::jsonb;
  v_opened_count integer := 0;
  v_published_count integer := 0;
begin
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id = true;
  if not found
     or not coalesce(v_control.typescript_lifecycle_enabled, false)
     or v_control.active_engine <> 'typescript_v1'
     or not v_control.typescript_execution_enabled
     or v_control.legacy_execution_enabled
  then
    return jsonb_build_object('status', 'disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  -- Reuse the existing authoritative plan-snapshot finalizer. This is input
  -- preparation only; it never calculates a race.
  v_snapshot_result := public.race_engine_finalize_due_stage_plan_snapshots_v1(200, false);

  for v_state in
    select
      state.stage_id,
      state.simulation_run_id,
      state.scheduled_game_at,
      state.details
    from public.race_stage_automation_state state
    join public.race_stage_simulation_runs run on run.id = state.simulation_run_id
    where state.last_status = 'calculated_hidden'
      and state.scheduled_game_at <= v_current_game_at
      and run.status = 'running'
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and coalesce(run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11b_calculated_hidden_v1'
    order by state.scheduled_game_at, state.stage_id
    for update of state skip locked
  loop
    update public.race_stage_automation_state
    set last_status = 'replay_live',
        last_checked_at = clock_timestamp(),
        details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
          'replay_opened_at_real', clock_timestamp(),
          'replay_opened_game_at', v_current_game_at,
          'replay_closes_at_real', clock_timestamp() + make_interval(secs => coalesce(v_control.typescript_replay_duration_real_seconds, 900))
        ),
        updated_at = clock_timestamp()
    where stage_id = v_state.stage_id;

    v_opened := v_opened || jsonb_build_array(jsonb_build_object(
      'stage_id', v_state.stage_id,
      'simulation_run_id', v_state.simulation_run_id,
      'status', 'replay_live'
    ));
    v_opened_count := v_opened_count + 1;
  end loop;

  for v_state in
    select state.stage_id
    from public.race_stage_automation_state state
    where state.last_status = 'replay_live'
      and nullif(state.details ->> 'replay_closes_at_real', '') is not null
      and (state.details ->> 'replay_closes_at_real')::timestamptz <= clock_timestamp()
    order by (state.details ->> 'replay_closes_at_real')::timestamptz, state.stage_id
    limit greatest(1, least(coalesce(p_max_publications, 4), 20))
    for update of state skip locked
  loop
    v_result := public.universal_race_stage_finalize_v1(v_state.stage_id);
    v_published := v_published || jsonb_build_array(v_result);
    v_published_count := v_published_count + 1;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'current_game_at', v_current_game_at,
    'stage_plan_snapshot_result', v_snapshot_result,
    'replay_opened_count', v_opened_count,
    'replay_openings', v_opened,
    'published_count', v_published_count,
    'publications', v_published
  );
end;
$phase11b_lifecycle$;

/* ------------------------------------------------------------------------- */
/* 13. Read-only replay RPC: stored output only; never calculates.            */
/* ------------------------------------------------------------------------- */
create or replace function public.get_universal_race_stage_replay_payload_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $phase11b_replay$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_output jsonb;
begin
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id = true;

  select stage.stage_date::timestamp
      + make_interval(hours => coalesce(stage.planned_start_hour_number, 12), mins => coalesce(stage.planned_start_minute, 0))
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_start_game_at is null then
    return jsonb_build_object('status', 'not_available', 'reason', 'stage_not_found_or_unscheduled', 'stage_id', p_stage_id);
  end if;

  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_control.typescript_calculation_lead_hours, 3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  select run.* into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.status in ('running', 'completed')
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11b_calculated_hidden_v1'
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case when v_current_game_at < v_calculation_due_game_at then 'awaiting_calculation_window' else 'awaiting_backend_calculation' end,
      'stage_id', p_stage_id,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  v_output := coalesce(v_run.result_summary_json -> 'output_snapshot', '{}'::jsonb);
  select * into v_state from public.race_stage_automation_state state where state.stage_id = p_stage_id;

  if v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'calculated', true,
      'simulation_run_id', v_run.id,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_visible', false,
      'browser_calculation_allowed', false
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
      'replay_opened_at_real', v_state.details ->> 'replay_opened_at_real',
      'replay_closes_at_real', v_state.details ->> 'replay_closes_at_real',
      'results_visible', coalesce((v_run.result_summary_json ->> 'results_published')::boolean, false),
      'results_published_at', v_state.details ->> 'results_published_at_real',
      'speed_locked', false,
      'verification_only', false,
      'official_outputs_persisted', coalesce((v_run.result_summary_json ->> 'official_outputs_persisted')::boolean, false),
      'phase11_persistence_applied', coalesce((v_run.result_summary_json ->> 'phase11_persistence_applied')::boolean, false),
      'browser_calculation_allowed', false
    )
  );
end;
$phase11b_replay$;

/* ------------------------------------------------------------------------- */
/* 14. Permissions                                                            */
/* ------------------------------------------------------------------------- */
revoke all on function public.universal_race_stage_claim_next_due_v1(text) from public, anon, authenticated;
revoke all on function public.universal_race_stage_process_lifecycle_v1(integer) from public, anon, authenticated;
revoke all on function public.universal_race_stage_finalize_v1(uuid) from public, anon, authenticated;
revoke all on function public.universal_race_stage_apply_phase9_supplies_v1(uuid) from public, anon, authenticated;
revoke all on function public.universal_race_stage_apply_health_candidates_v1(uuid) from public, anon, authenticated;

revoke all on function public.universal_race_stage_get_calculation_payload_v1(uuid) from public, anon, authenticated;
revoke all on function public.universal_race_stage_claim_calculation_v1(uuid) from public, anon, authenticated;
revoke all on function public.universal_race_stage_submit_calculation_v1(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.universal_race_stage_fail_calculation_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;

grant execute on function public.universal_race_stage_claim_next_due_v1(text) to service_role;
grant execute on function public.universal_race_stage_process_lifecycle_v1(integer) to service_role;
grant execute on function public.universal_race_stage_finalize_v1(uuid) to service_role;
grant execute on function public.universal_race_stage_apply_phase9_supplies_v1(uuid) to service_role;
grant execute on function public.universal_race_stage_apply_health_candidates_v1(uuid) to service_role;

grant execute on function public.universal_race_stage_get_calculation_payload_v1(uuid) to service_role;
grant execute on function public.universal_race_stage_claim_calculation_v1(uuid) to service_role;
grant execute on function public.universal_race_stage_submit_calculation_v1(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.universal_race_stage_fail_calculation_v1(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.get_universal_race_stage_replay_payload_v1(uuid) to authenticated, service_role;

comment on function public.get_universal_race_stage_replay_payload_v1(uuid)
is 'Phase 11B read-only universal replay payload. Reads only a stored backend universal result and never calculates a race.';

commit;
