create or replace function public.get_universal_race_stage_replay_payload_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_output jsonb;
  v_replay_sync jsonb;
  v_replay_checkpoints jsonb;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  select stage.stage_date::timestamp
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
      'stage_id', p_stage_id
    );
  end if;

  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_control.typescript_calculation_lead_hours, 3));

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select run.*
  into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.status in ('running', 'completed')
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') =
      'universal_phase11b_calculated_hidden_v1'
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case
        when v_current_game_at < v_calculation_due_game_at
          then 'awaiting_calculation_window'
        else 'awaiting_backend_calculation'
      end,
      'stage_id', p_stage_id,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  v_output := coalesce(
    v_run.result_summary_json -> 'output_snapshot',
    '{}'::jsonb
  );

  -- A completed authoritative run can contain non-blocking synchronization
  -- warnings while still having a deterministic, chronologically complete,
  -- classification-matching replay timeline. Race Detail already supports
  -- replayProgressGuarantee.canProgress as a degraded-mode fallback, so derive
  -- that guarantee in the read payload without mutating the stored run or
  -- recalculating any official race output.
  v_replay_sync := coalesce(
    v_output #> '{universalResult,replaySynchronization}',
    '{}'::jsonb
  );
  v_replay_checkpoints := coalesce(
    v_output #> '{universalResult,replayTimeline,checkpoints}',
    '[]'::jsonb
  );

  if coalesce((v_replay_sync ->> 'synchronized')::boolean, false) = false
     and jsonb_typeof(v_replay_checkpoints) = 'array'
     and jsonb_array_length(v_replay_checkpoints) >= 2
     and coalesce((v_replay_sync ->> 'allCheckpointRidersComplete')::boolean, false)
     and coalesce((v_replay_sync ->> 'allCheckpointsChronological')::boolean, false)
     and coalesce((v_replay_sync ->> 'allGapsMatchGroups')::boolean, false)
     and coalesce((v_replay_sync ->> 'allResultFieldsHiddenBeforeFinish')::boolean, false)
     and coalesce((v_replay_sync ->> 'finalCheckpointMatchesClassification')::boolean, false)
  then
    v_output := jsonb_set(
      v_output,
      '{universalResult,replayProgressGuarantee}',
      jsonb_build_object(
        'canProgress', true,
        'mode', 'degraded',
        'reason', 'non_blocking_synchronization_warnings',
        'issueCount', jsonb_array_length(
          coalesce(v_replay_sync -> 'issues', '[]'::jsonb)
        )
      ),
      true
    );
  end if;

  select *
  into v_state
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id;

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
      'results_visible', coalesce(
        (v_run.result_summary_json ->> 'results_published')::boolean,
        false
      ),
      'results_published_at', v_state.details ->> 'results_published_at_real',
      'speed_locked', false,
      'verification_only', false,
      'official_outputs_persisted', coalesce(
        (v_run.result_summary_json ->> 'official_outputs_persisted')::boolean,
        false
      ),
      'phase11_persistence_applied', coalesce(
        (v_run.result_summary_json ->> 'phase11_persistence_applied')::boolean,
        false
      ),
      'browser_calculation_allowed', false
    )
  );
end;
$function$;
