-- Availability and full replay payload must agree: compacted or incomplete
-- simulation snapshots must not advertise Watch Replay as available.
-- Existing finished classification / official result visibility is unaffected.
CREATE OR REPLACE FUNCTION public.get_universal_race_stage_replay_availability_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Only advertise replays that the full payload endpoint can actually load.
  -- Older simulation records are intentionally compacted by maintenance,
  -- which removes the checkpoint timeline; official results remain intact.
  if v_calculated and exists (
    select 1
    from public.race_stage_simulation_runs checked
    where checked.id = v_run_id
      and (
        coalesce(checked.result_summary_json->>'calculation_contract', '') <>
          'universal_phase11b_calculated_hidden_v1'
        or coalesce((checked.result_summary_json->>'archived')::boolean, false)
        or coalesce((checked.input_snapshot_json->>'archived')::boolean, false)
        or jsonb_typeof(checked.result_summary_json->'output_snapshot') is distinct from 'object'
        or jsonb_typeof(checked.result_summary_json #> '{output_snapshot,universalResult,replayTimeline,checkpoints}') is distinct from 'array'
        or jsonb_array_length(
          case when jsonb_typeof(checked.result_summary_json #> '{output_snapshot,universalResult,replayTimeline,checkpoints}') = 'array'
            then checked.result_summary_json #> '{output_snapshot,universalResult,replayTimeline,checkpoints}'
            else '[]'::jsonb end
        ) < 2
      )
  ) then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case
        when exists (
          select 1 from public.race_stage_simulation_runs old
          where old.id = v_run_id
            and (
              coalesce((old.result_summary_json->>'archived')::boolean, false)
              or coalesce((old.input_snapshot_json->>'archived')::boolean, false)
            )
        ) then 'replay_archived'
        else 'replay_payload_missing'
      end,
      'stage_id', p_stage_id,
      'race_id', v_run_race_id,
      'calculated', false,
      'results_visible', v_run_status = 'completed',
      'browser_calculation_allowed', false
    );
  end if;

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
$function$

