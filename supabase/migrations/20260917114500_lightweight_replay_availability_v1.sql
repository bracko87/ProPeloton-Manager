-- Lightweight replay availability contract.
--
-- The full replay payload can be many megabytes because it contains both the
-- authoritative input snapshot and the complete engine output. Race detail only
-- needs a few scalar fields to decide whether the Watch Replay button can open.
-- This RPC deliberately avoids reading result_summary_json/output_snapshot.

create or replace function public.get_universal_race_stage_replay_availability_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_calculation_lead_hours integer := 3;

  v_state_run_id uuid;
  v_state_status text;
  v_state_error text;
  v_state_details jsonb := '{}'::jsonb;

  v_run_id uuid;
  v_run_race_id uuid;
  v_run_status text;

  v_calculated boolean := false;
  v_replay_closes_at_real timestamptz;
  v_results_published boolean := false;
  v_replay_window_elapsed boolean := false;
  v_results_visible boolean := false;
begin
  select coalesce(control.typescript_calculation_lead_hours, 3)::integer
  into v_calculation_lead_hours
  from public.race_engine_runtime_control_v1 control
  where control.singleton_id = true;

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
    return jsonb_build_object(
      'status', 'not_available',
      'reason', 'stage_not_found_or_unscheduled',
      'stage_id', p_stage_id,
      'calculated', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_calculation_lead_hours, 3));

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select
    state.simulation_run_id,
    state.last_status,
    state.last_error,
    coalesce(state.details, '{}'::jsonb)
  into
    v_state_run_id,
    v_state_status,
    v_state_error,
    v_state_details
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id;

  -- Prefer the run explicitly owned by the lifecycle row. Reading these scalar
  -- columns does not detoast the large authoritative result payload.
  if v_state_run_id is not null then
    select
      run.id,
      run.race_id,
      run.status
    into
      v_run_id,
      v_run_race_id,
      v_run_status
    from public.race_stage_simulation_runs run
    where run.id = v_state_run_id
      and run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status in ('running', 'completed')
    limit 1;
  end if;

  -- A completed run is authoritative even if the lifecycle row was lost or
  -- repaired later. This fallback still reads scalar columns only.
  if v_run_id is null then
    select
      run.id,
      run.race_id,
      run.status
    into
      v_run_id,
      v_run_race_id,
      v_run_status
    from public.race_stage_simulation_runs run
    where run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status = 'completed'
    order by run.updated_at desc, run.created_at desc, run.id desc
    limit 1;
  end if;

  v_calculated :=
    v_run_id is not null
    and (
      v_run_status = 'completed'
      or coalesce(v_state_status, '') in (
        'calculated_hidden',
        'replay_live',
        'published'
      )
    );

  if not v_calculated then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case
        when v_current_game_at < v_calculation_due_game_at
          then 'awaiting_calculation_window'
        else 'awaiting_backend_calculation'
      end,
      'stage_id', p_stage_id,
      'calculated', false,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  if v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'race_id', v_run_race_id,
      'calculated', true,
      'simulation_run_id', v_run_id,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_visible', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_replay_closes_at_real := nullif(
    v_state_details ->> 'replay_closes_at_real',
    ''
  )::timestamptz;

  v_results_published :=
    v_run_status = 'completed'
    or coalesce(v_state_status, '') = 'published';

  v_replay_window_elapsed :=
    v_replay_closes_at_real is not null
    and now() >= v_replay_closes_at_real;

  v_results_visible := v_results_published or v_replay_window_elapsed;

  return jsonb_build_object(
    'status', 'available',
    'stage_id', p_stage_id,
    'race_id', v_run_race_id,
    'calculated', true,
    'simulation_run_id', v_run_id,
    'replay_opens_game_at', v_stage_start_game_at,
    'results_visible', v_results_visible,
    'publication_pending',
      v_replay_window_elapsed and not v_results_published,
    'publication_error', v_state_error,
    'browser_calculation_allowed', false
  );
end;
$function$;

revoke all on function public.get_universal_race_stage_replay_availability_v1(uuid)
from public, anon;

grant execute on function public.get_universal_race_stage_replay_availability_v1(uuid)
to authenticated, service_role;

comment on function public.get_universal_race_stage_replay_availability_v1(uuid)
is 'Returns replay availability metadata without reading or returning the multi-megabyte authoritative race payload.';
