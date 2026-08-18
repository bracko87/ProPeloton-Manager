-- Phase 11B runtime verification — READ ONLY.
-- Safe to run immediately after activation and later after Rio stages progress.
-- Historical fingerprint excludes Phase 11B production rows, so it must remain
-- the original 14058 / 70 / 154 / 65aeb3... forever.

with
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
rio as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'stage_number', s.stage_number,
    'stage_id', s.id,
    'weather_cancelled', coalesce(s.weather_cancelled, false),
    'calculation_due_game_at', s.stage_date::timestamp + make_interval(
      hours => coalesce(s.planned_start_hour_number, 12),
      mins => coalesce(s.planned_start_minute, 0)
    ) - make_interval(hours => coalesce(c.typescript_calculation_lead_hours, 3)),
    'stage_start_game_at', s.stage_date::timestamp + make_interval(
      hours => coalesce(s.planned_start_hour_number, 12),
      mins => coalesce(s.planned_start_minute, 0)
    ),
    'simulation_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', run.id,
        'status', run.status,
        'engine_version', run.engine_version,
        'simulation_mode', run.simulation_mode,
        'calculation_contract', run.result_summary_json ->> 'calculation_contract',
        'persistence_applied', run.result_summary_json ->> 'phase11_persistence_applied',
        'results_published', run.result_summary_json ->> 'results_published'
      ) order by run.created_at)
      from public.race_stage_simulation_runs run where run.stage_id = s.id
    ), '[]'::jsonb),
    'lifecycle_state', (select to_jsonb(a) from public.race_stage_automation_state a where a.stage_id = s.id),
    'official_result_count', (select count(*) from public.race_stage_results r where r.stage_id = s.id),
    'authoritative_run', (select to_jsonb(a) from public.race_stage_authoritative_runs a where a.stage_id = s.id)
  ) order by s.stage_number), '[]'::jsonb) as rows
  from public.race_stages s
  cross join public.race_engine_runtime_control_v1 c
  where s.race_id = '65739034-f9e5-4b5c-8f21-4ea27451e0d4'::uuid
    and c.singleton_id = true
),
historical as (
  select
    count(*)::bigint as rows,
    count(distinct result.race_id)::bigint as races,
    count(distinct result.stage_id)::bigint as stages,
    md5(coalesce(string_agg(
      md5(concat_ws('|',
        coalesce(result.race_id::text, ''), coalesce(result.stage_id::text, ''),
        coalesce(result.rider_id::text, ''), coalesce(result.team_id::text, ''),
        coalesce(result.rank::text, ''), coalesce(result.status::text, ''),
        coalesce(result.elapsed_seconds::text, ''), coalesce(result.gap_seconds::text, ''),
        coalesce(result.bonus_seconds::text, ''), coalesce(result.penalty_seconds::text, ''),
        coalesce(result.output_contract::text, '')
      )), '' order by result.stage_id::text, result.rank, result.rider_id::text), '')) as fingerprint
  from public.race_stage_results result
  where result.simulation_run_id is null
     or not exists (
       select 1
       from public.race_stage_simulation_runs run
       where run.id = result.simulation_run_id
         and run.result_summary_json ->> 'calculation_contract' = 'universal_phase11b_calculated_hidden_v1'
     )
)
select jsonb_pretty(jsonb_build_object(
  'report', 'phase11b_runtime_verify_v1',
  'read_only', true,
  'clock', (select row from clock_state),
  'runtime_control', (select to_jsonb(c) from public.race_engine_runtime_control_v1 c where c.singleton_id = true),
  'relevant_cron_jobs', (select rows from jobs),
  'rio_tour', (select rows from rio),
  'historical_official_results', jsonb_build_object(
    'official_result_rows', (select rows from historical),
    'races_with_results', (select races from historical),
    'stages_with_results', (select stages from historical),
    'official_result_fingerprint', (select fingerprint from historical),
    'expected_rows', 14058,
    'expected_races', 70,
    'expected_stages', 154,
    'expected_fingerprint', '65aeb3a206efab120a52589651272df1',
    'matches_baseline', (
      select rows = 14058 and races = 70 and stages = 154
         and fingerprint = '65aeb3a206efab120a52589651272df1'
      from historical
    )
  )
)) as phase11b_runtime_verification;
