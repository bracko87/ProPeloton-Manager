-- Phase 11B install verification — READ ONLY.
-- Run after installing 20260818_phase11b_universal_production_cutover.sql,
-- before activation. Expected: lifecycle disabled, clock still paused, Stage 5
-- verification canary still present, historical official results unchanged.

with
control as (
  select to_jsonb(c) as row
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id = true
),
clock_state as (
  select jsonb_build_object(
    'current_game_timestamp', public.get_current_game_timestamp(),
    'game_state', to_jsonb(gs),
    'game_clock_config', to_jsonb(gc)
  ) as row
  from public.game_state gs
  cross join public.game_clock_config gc
  where gs.id = true and gc.id = true
),
jobs as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobid', jobid, 'jobname', jobname, 'active', active,
    'schedule', schedule, 'command', command
  ) order by jobid), '[]'::jsonb) as rows
  from cron.job
  where command ilike '%run_daily_tick_if_needed%'
     or command ilike '%run_game_minute_tick_if_unpaused_v1%'
     or command ilike '%process_race_stage_automation_v1%'
     or command ilike '%race_engine_admin_scheduler_tick_v1%'
     or command ilike '%race_engine_forward_only_scheduler_tick_v1%'
     or command ilike '%run_race_stage_simulation_v1%'
),
functions as (
  select jsonb_build_object(
    'claim_next_due', to_regprocedure('public.universal_race_stage_claim_next_due_v1(text)') is not null,
    'lifecycle_tick', to_regprocedure('public.universal_race_stage_process_lifecycle_v1(integer)') is not null,
    'finalizer', to_regprocedure('public.universal_race_stage_finalize_v1(uuid)') is not null,
    'replay_reader', to_regprocedure('public.get_universal_race_stage_replay_payload_v1(uuid)') is not null,
    'phase9_supplies', to_regprocedure('public.universal_race_stage_apply_phase9_supplies_v1(uuid)') is not null,
    'health_handoff', to_regprocedure('public.universal_race_stage_apply_health_candidates_v1(uuid)') is not null
  ) as row
),
canary as (
  select jsonb_build_object(
    'simulation_run_id', run.id,
    'stage_id', run.stage_id,
    'status', run.status,
    'calculation_contract', run.result_summary_json ->> 'calculation_contract',
    'official_result_rows', (select count(*) from public.race_stage_results r where r.simulation_run_id = run.id),
    'rider_state_rows', (select count(*) from public.race_stage_rider_states s where s.simulation_run_id = run.id),
    'wear_rows', (select count(*) from public.race_engine_stage_wear_applications w where w.simulation_run_id = run.id),
    'authoritative_rows', (select count(*) from public.race_stage_authoritative_runs a where a.simulation_run_id = run.id)
  ) as row
  from public.race_stage_simulation_runs run
  where run.id = '1239ff6a-5736-4361-8e06-9d8204050bc0'::uuid
),
rio as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'stage_number', s.stage_number,
    'stage_id', s.id,
    'stage_start_game_at', s.stage_date::timestamp + make_interval(
      hours => coalesce(s.planned_start_hour_number, 12),
      mins => coalesce(s.planned_start_minute, 0)
    ),
    'simulation_run_count', (select count(*) from public.race_stage_simulation_runs r where r.stage_id = s.id),
    'official_result_count', (select count(*) from public.race_stage_results r where r.stage_id = s.id),
    'authoritative_run_count', (select count(*) from public.race_stage_authoritative_runs a where a.stage_id = s.id)
  ) order by s.stage_number), '[]'::jsonb) as rows
  from public.race_stages s
  where s.race_id = '65739034-f9e5-4b5c-8f21-4ea27451e0d4'::uuid
),
fingerprint as (
  select jsonb_build_object(
    'official_result_rows', count(*)::bigint,
    'races_with_results', count(distinct race_id)::bigint,
    'stages_with_results', count(distinct stage_id)::bigint,
    'official_result_fingerprint', md5(coalesce(string_agg(
      md5(concat_ws('|',
        coalesce(race_id::text, ''), coalesce(stage_id::text, ''),
        coalesce(rider_id::text, ''), coalesce(team_id::text, ''),
        coalesce(rank::text, ''), coalesce(status::text, ''),
        coalesce(elapsed_seconds::text, ''), coalesce(gap_seconds::text, ''),
        coalesce(bonus_seconds::text, ''), coalesce(penalty_seconds::text, ''),
        coalesce(output_contract::text, '')
      )), '' order by stage_id::text, rank, rider_id::text), ''))
  ) as row
  from public.race_stage_results
)
select jsonb_pretty(jsonb_build_object(
  'report', 'phase11b_install_verify_v1',
  'read_only', true,
  'clock', (select row from clock_state),
  'runtime_control', (select row from control),
  'functions', (select row from functions),
  'relevant_cron_jobs', (select rows from jobs),
  'stage5_verification_canary', coalesce((select row from canary), 'null'::jsonb),
  'rio_tour', (select rows from rio),
  'historical_official_results', (select row from fingerprint),
  'expected_before_activation', jsonb_build_object(
    'lifecycle_enabled', false,
    'game_state_paused', true,
    'game_clock_config_paused', true,
    'historical_rows', 14058,
    'historical_fingerprint', '65aeb3a206efab120a52589651272df1'
  )
)) as phase11b_install_verification;
