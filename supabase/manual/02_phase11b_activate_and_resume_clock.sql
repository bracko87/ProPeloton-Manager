-- Phase 11B production activation + clock resume.
-- COMMITTED operation. Run ONLY after:
--   1) Phase 11B migration installed and 01 verification clean;
--   2) source files replaced;
--   3) 486/486 consolidated tests pass in the real repository;
--   4) npm run build passes;
--   5) Netlify production deploy is live and runner health reports Phase 11B.
--
-- This deletes ONLY the known manual Phase 11A2 Stage 5 verification canary,
-- activates forward-only TypeScript lifecycle at the frozen game timestamp,
-- resets last_advanced_at to real NOW (prevents month-long catch-up), then resumes
-- the two existing pause guards. It does not create/alter database cron jobs.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $phase11b_activate$
declare
  c_canary constant uuid := '1239ff6a-5736-4361-8e06-9d8204050bc0'::uuid;
  c_rio constant uuid := '65739034-f9e5-4b5c-8f21-4ea27451e0d4'::uuid;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_activation_game_at timestamp without time zone;
  v_rows bigint;
  v_races bigint;
  v_stages bigint;
  v_fingerprint text;
  v_canary_count integer;
  v_bad integer;
  v_clock_count integer;
  v_alt_clock_count integer;
  v_legacy_scheduler_count integer;
  v_state_paused boolean;
  v_config_paused boolean;
  v_season integer;
  v_month integer;
  v_day integer;
  v_hour integer;
  v_minute integer;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true
  for update;

  if not found then raise exception 'Phase 11B activation blocked: runtime-control singleton missing.'; end if;

  -- Safe accidental rerun before any race has progressed: do not move the
  -- activation boundary or clock anchor a second time.
  if coalesce(v_control.typescript_lifecycle_enabled, false) then
    return;
  end if;

  if v_control.active_engine <> 'typescript_v1'
     or not v_control.typescript_execution_enabled
     or v_control.legacy_execution_enabled
  then
    raise exception 'Phase 11B activation blocked: runtime control is not TypeScript-only.';
  end if;

  select gs.is_paused, gc.is_paused,
         gs.season_number, gs.month_number, gs.day_number,
         gs.hour_number, gs.minute_number
  into v_state_paused, v_config_paused,
       v_season, v_month, v_day, v_hour, v_minute
  from public.game_state gs
  cross join public.game_clock_config gc
  where gs.id = true and gc.id = true;

  if not coalesce(v_state_paused, false) or not coalesce(v_config_paused, false) then
    raise exception 'Phase 11B activation blocked: expected both game-clock pause guards to still be enabled.';
  end if;

  select count(*)::integer into v_clock_count
  from cron.job
  where active and command ilike '%run_daily_tick_if_needed%';
  select count(*)::integer into v_alt_clock_count
  from cron.job
  where active and command ilike '%run_game_minute_tick_if_unpaused_v1%';
  select count(*)::integer into v_legacy_scheduler_count
  from cron.job
  where active and (
    command ilike '%process_race_stage_automation_v1%'
    or command ilike '%race_engine_admin_scheduler_tick_v1%'
    or command ilike '%race_engine_forward_only_scheduler_tick_v1%'
    or command ilike '%run_race_stage_simulation_v1%'
  );

  if v_clock_count <> 1 then
    raise exception 'Phase 11B activation blocked: expected exactly one active run_daily_tick_if_needed clock owner, found %.', v_clock_count;
  end if;
  if v_alt_clock_count <> 0 then
    raise exception 'Phase 11B activation blocked: alternate minute clock is active.';
  end if;
  if v_legacy_scheduler_count <> 0 then
    raise exception 'Phase 11B activation blocked: legacy/old race scheduler cron is active.';
  end if;

  select
    count(*)::bigint,
    count(distinct race_id)::bigint,
    count(distinct stage_id)::bigint,
    md5(coalesce(string_agg(
      md5(concat_ws('|',
        coalesce(race_id::text, ''), coalesce(stage_id::text, ''),
        coalesce(rider_id::text, ''), coalesce(team_id::text, ''),
        coalesce(rank::text, ''), coalesce(status::text, ''),
        coalesce(elapsed_seconds::text, ''), coalesce(gap_seconds::text, ''),
        coalesce(bonus_seconds::text, ''), coalesce(penalty_seconds::text, ''),
        coalesce(output_contract::text, '')
      )), '' order by stage_id::text, rank, rider_id::text), ''))
  into v_rows, v_races, v_stages, v_fingerprint
  from public.race_stage_results;

  if v_rows <> 14058
     or v_races <> 70
     or v_stages <> 154
     or v_fingerprint <> '65aeb3a206efab120a52589651272df1'
  then
    raise exception 'Phase 11B activation blocked: historical official-result baseline changed (%/%/%/%).',
      v_rows, v_races, v_stages, v_fingerprint;
  end if;

  select count(*)::integer into v_canary_count
  from public.race_stage_simulation_runs run
  where run.id = c_canary
    and run.stage_id = '34b13464-ee4d-40ea-af68-3e420ab19e68'::uuid
    and run.status = 'running'
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and run.result_summary_json ->> 'calculation_contract' = 'universal_phase11a_calculated_hidden_v1'
    and not coalesce((run.result_summary_json ->> 'phase11_persistence_applied')::boolean, true)
    and not coalesce((run.result_summary_json ->> 'official_outputs_persisted')::boolean, true)
    and not coalesce((run.result_summary_json ->> 'results_published')::boolean, true);

  if v_canary_count <> 1 then
    raise exception 'Phase 11B activation blocked: exact known Stage 5 verification canary was not found in untouched state.';
  end if;

  select
    (select count(*) from public.race_stage_results r where r.simulation_run_id = c_canary)
    + (select count(*) from public.race_stage_rider_states r where r.simulation_run_id = c_canary)
    + (select count(*) from public.race_engine_stage_wear_applications r where r.simulation_run_id = c_canary)
    + (select count(*) from public.race_stage_authoritative_runs r where r.simulation_run_id = c_canary)
    + (select count(*) from public.race_stage_supply_usage_events e where coalesce(e.idempotency_key, '') like '%' || c_canary::text || '%')
    + (select count(*) from public.rider_health_case_context_v1 h where coalesce(h.notes ->> 'phase11_simulation_run_id', '') = c_canary::text)
  into v_bad;

  if v_bad <> 0 then
    raise exception 'Phase 11B activation blocked: verification canary has persistent side effects (% rows).', v_bad;
  end if;

  -- No Rio production output exists yet. The one canary is the only permitted run.
  if (select count(*) from public.race_stage_simulation_runs where race_id = c_rio) <> 1
     or (select count(*) from public.race_stage_results where race_id = c_rio) <> 0
     or (select count(*) from public.race_stage_authoritative_runs where race_id = c_rio) <> 0
  then
    raise exception 'Phase 11B activation blocked: Rio Tour contains unexpected production output.';
  end if;

  -- Remove ONLY the disposable manual verification run. No official/history rows exist for it.
  delete from public.race_stage_automation_state where simulation_run_id = c_canary;
  delete from public.race_stage_simulation_runs where id = c_canary;

  if (select count(*) from public.race_stage_simulation_runs where race_id = c_rio) <> 0 then
    raise exception 'Phase 11B activation blocked: Rio Tour is not clean after canary removal.';
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_activation_game_at;

  update public.race_engine_runtime_control_v1
  set active_engine = 'typescript_v1',
      legacy_execution_enabled = false,
      typescript_execution_enabled = true,
      typescript_lifecycle_enabled = true,
      typescript_activation_game_at = v_activation_game_at,
      typescript_calculation_lead_hours = 3,
      typescript_replay_duration_real_seconds = 900,
      typescript_activated_at = coalesce(typescript_activated_at, clock_timestamp()),
      updated_at = clock_timestamp(),
      updated_by = current_user,
      notes = 'Phase 11B universal production lifecycle ACTIVE. Netlify minute scheduler owns race calculation; browser is read-only; legacy race execution remains disabled.'
  where singleton_id = true;

  -- Resume without replaying the month of real time spent intentionally paused.
  -- game_clock_config stays paused while game_state is updated, so any game-state
  -- trigger sees the administrative pause and does not launch hourly processors.
  update public.game_state
  set is_paused = false,
      last_advanced_at = clock_timestamp()
  where id = true;

  update public.game_clock_config
  set is_paused = false
  where id = true;

  -- Stored game date/time components must not move during activation itself.
  if exists (
    select 1 from public.game_state gs
    where gs.id = true
      and (gs.season_number, gs.month_number, gs.day_number, gs.hour_number, gs.minute_number)
          is distinct from (v_season, v_month, v_day, v_hour, v_minute)
  ) then
    raise exception 'Phase 11B activation changed stored game date/time components unexpectedly.';
  end if;
end;
$phase11b_activate$;

commit;

with rio as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'stage_number', s.stage_number,
    'stage_id', s.id,
    'calculation_due_game_at', s.stage_date::timestamp + make_interval(
      hours => coalesce(s.planned_start_hour_number, 12),
      mins => coalesce(s.planned_start_minute, 0)
    ) - interval '3 hours',
    'stage_start_game_at', s.stage_date::timestamp + make_interval(
      hours => coalesce(s.planned_start_hour_number, 12),
      mins => coalesce(s.planned_start_minute, 0)
    )
  ) order by s.stage_number), '[]'::jsonb) as rows
  from public.race_stages s
  where s.race_id = '65739034-f9e5-4b5c-8f21-4ea27451e0d4'::uuid
)
select jsonb_pretty(jsonb_build_object(
  'status', 'phase11b_production_activated_clock_resumed',
  'current_game_timestamp', public.get_current_game_timestamp(),
  'game_state', (select to_jsonb(gs) from public.game_state gs where gs.id = true),
  'game_clock_config', (select to_jsonb(gc) from public.game_clock_config gc where gc.id = true),
  'runtime_control', (select to_jsonb(c) from public.race_engine_runtime_control_v1 c where c.singleton_id = true),
  'rio_schedule', (select rows from rio),
  'stage5_verification_canary_removed', not exists (
    select 1 from public.race_stage_simulation_runs where id = '1239ff6a-5736-4361-8e06-9d8204050bc0'::uuid
  ),
  'legacy_race_execution_enabled', false
)) as phase11b_activation_result;
