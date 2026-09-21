-- Enforce one canonical race lifecycle clock.
-- Replay may open only at the current canonical stage start.
-- Official outputs may publish only at canonical stage start + 30 game minutes.
-- If a previously opened replay becomes early after a schedule correction,
-- lifecycle self-heals it back to calculated_hidden before publication.

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_reveal_game_at timestamp without time zone;
begin
  select public.get_current_game_timestamp()::timestamp without time zone,
         public.race_stage_planned_start_game_at_v1(p_stage_id)::timestamp without time zone
    into v_current_game_at, v_stage_start_game_at;

  if v_stage_start_game_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'race_stage_publication_blocked_missing_canonical_start';
  end if;

  v_reveal_game_at := v_stage_start_game_at + interval '30 minutes';

  if v_current_game_at < v_reveal_game_at then
    return jsonb_build_object(
      'status','deferred_not_before_reveal',
      'stage_id',p_stage_id,
      'current_game_at',v_current_game_at,
      'stage_start_game_at',v_stage_start_game_at,
      'official_results_reveal_game_at',v_reveal_game_at,
      'official_outputs_persisted',false,
      'guard_model','canonical_start_plus_30_hard_gate_v2'
    );
  end if;

  begin
    return public.universal_race_stage_finalize_core_survival_v1(p_stage_id);
  exception
    when query_canceled then
      raise exception using
        errcode = 'P0001',
        message = 'race_stage_publication_deferred_after_statement_timeout';
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_process_lifecycle_core_v1(p_max_publications integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_snapshot_result jsonb;
  v_state record;
  v_result jsonb;
  v_opened jsonb := '[]'::jsonb;
  v_published jsonb := '[]'::jsonb;
  v_publication_failures jsonb := '[]'::jsonb;
  v_opened_count integer := 0;
  v_published_count integer := 0;
  v_publication_failure_count integer := 0;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  if not found
     or not coalesce(v_control.typescript_lifecycle_enabled, false)
     or v_control.active_engine <> 'typescript_v1'
     or not v_control.typescript_execution_enabled
     or v_control.legacy_execution_enabled
  then
    return jsonb_build_object('status', 'disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  v_snapshot_result := public.race_engine_finalize_due_stage_plan_snapshots_v1(200, false);

  /*
   * Canonical schedule self-heal:
   * If a replay was opened under stale timing metadata but the CURRENT
   * canonical start is still in the future, hide it again.
   */
  update public.race_stage_automation_state state
  set scheduled_game_at =
        public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone,
      last_status = 'calculated_hidden',
      last_checked_at = clock_timestamp(),
      details =
        (coalesce(state.details,'{}'::jsonb)
          - 'replay_opened_at_real'
          - 'replay_opened_game_at'
          - 'replay_closes_at_real'
          - 'official_results_reveal_game_at'
          - 'historical_catchup_replay_fast_forwarded'
          - 'historical_catchup_fast_forwarded_at_real'
          - 'historical_catchup_current_game_at'
          - 'historical_catchup_rule')
        || jsonb_build_object(
             'schedule_self_healed_at_real',clock_timestamp(),
             'schedule_self_heal_reason','canonical_stage_start_moved_to_future',
             'schedule_self_heal_game_at',v_current_game_at
           ),
      updated_at = clock_timestamp()
  from public.race_stage_simulation_runs run
  where run.id = state.simulation_run_id
    and state.last_status = 'replay_live'
    and public.race_stage_planned_start_game_at_v1(state.stage_id) is not null
    and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone > v_current_game_at
    and run.status = 'running'
    and coalesce(run.result_summary_json ->> 'calculation_contract','') = 'universal_phase11b_calculated_hidden_v1'
    and not exists (
      select 1
      from public.race_stage_authoritative_runs a
      where a.stage_id = state.stage_id
    );

  for v_state in
    select
      state.stage_id,
      state.simulation_run_id,
      state.scheduled_game_at,
      public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone as canonical_stage_start_game_at,
      state.details
    from public.race_stage_automation_state state
    join public.race_stage_simulation_runs run
      on run.id = state.simulation_run_id
    where state.last_status = 'calculated_hidden'
      and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone <= v_current_game_at
      and run.status = 'running'
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and coalesce(run.result_summary_json ->> 'calculation_contract', '') =
        'universal_phase11b_calculated_hidden_v1'
    order by public.race_stage_planned_start_game_at_v1(state.stage_id), state.stage_id
    for update of state skip locked
  loop
    update public.race_stage_automation_state
    set scheduled_game_at = v_state.canonical_stage_start_game_at,
        last_status = 'replay_live',
        last_checked_at = clock_timestamp(),
        details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
          'replay_opened_at_real', clock_timestamp(),
          'replay_opened_game_at', v_current_game_at,
          'replay_closes_at_real',
            clock_timestamp()
              + make_interval(
                  secs => coalesce(
                    v_control.typescript_replay_duration_real_seconds,
                    900
                  )
                ),
          'official_results_reveal_game_at',
            v_state.canonical_stage_start_game_at + interval '30 minutes',
          'live_replay_minimum_game_minutes', 30
        ),
        updated_at = clock_timestamp()
    where stage_id = v_state.stage_id;

    v_opened := v_opened || jsonb_build_array(jsonb_build_object(
      'stage_id', v_state.stage_id,
      'simulation_run_id', v_state.simulation_run_id,
      'status', 'replay_live',
      'results_reveal_game_at',
        v_state.canonical_stage_start_game_at + interval '30 minutes'
    ));
    v_opened_count := v_opened_count + 1;
  end loop;

  for v_state in
    select state.stage_id
    from public.race_stage_automation_state state
    where state.last_status = 'replay_live'
      and nullif(state.details ->> 'replay_closes_at_real', '') is not null
      and (state.details ->> 'replay_closes_at_real')::timestamptz
            <= clock_timestamp()
      -- HARD PUBLICATION GATE: even if a real-time replay close timestamp is
      -- accidentally early, official outputs cannot publish until 30 in-game
      -- minutes after the scheduled stage start.
      and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes'
            <= v_current_game_at
    order by
      (state.details ->> 'replay_closes_at_real')::timestamptz,
      state.stage_id
    limit greatest(1, least(coalesce(p_max_publications, 4), 20))
    for update of state skip locked
  loop
    begin
      v_result := public.universal_race_stage_finalize_v1(v_state.stage_id);
      v_published := v_published || jsonb_build_array(v_result);
      v_published_count := v_published_count + 1;
    exception when others then
      update public.race_stage_automation_state
      set last_checked_at = clock_timestamp(),
          last_error = sqlerrm,
          details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
            'publication_last_error', sqlerrm,
            'publication_last_failed_at_real', clock_timestamp()
          ),
          updated_at = clock_timestamp()
      where stage_id = v_state.stage_id;

      v_publication_failures :=
        v_publication_failures || jsonb_build_array(
          jsonb_build_object(
            'stage_id', v_state.stage_id,
            'status', 'publication_failed',
            'error', sqlerrm
          )
        );
      v_publication_failure_count := v_publication_failure_count + 1;
    end;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'current_game_at', v_current_game_at,
    'stage_plan_snapshot_result', v_snapshot_result,
    'replay_opened_count', v_opened_count,
    'replay_openings', v_opened,
    'published_count', v_published_count,
    'publications', v_published,
    'publication_failure_count', v_publication_failure_count,
    'publication_failures', v_publication_failures,
    'official_result_reveal_rule', 'not_before_stage_start_plus_30_game_minutes_v1'
  );
end;
$function$
;
