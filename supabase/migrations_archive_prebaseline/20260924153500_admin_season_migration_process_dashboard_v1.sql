-- Admin Migration Process dashboard (read-only operational monitor)
-- Keeps the live season-transition checklist separate from historical completed test/production runs.
-- These RPCs do not start, advance, arm, pause, resume, or otherwise mutate a season transition.

CREATE OR REPLACE FUNCTION public.get_admin_season_migration_problem_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_readiness jsonb;
  v_count integer := 0;
  v_run public.season_transition_engine_runs_v2%rowtype;
  v_control public.season_transition_control_v1%rowtype;
  v_current_season integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  v_readiness := public.get_season_transition_preflight_v1();
  v_count := coalesce((v_readiness ->> 'blocking_components')::integer, 0);

  select *
  into v_run
  from public.season_transition_engine_runs_v2 r
  where r.mode = 'production'
    and r.status <> 'completed'
  order by r.created_at desc
  limit 1;

  if found and (
    v_run.status = 'failed'
    or nullif(v_run.error_message,'') is not null
  ) then
    v_count := v_count + 1;
  end if;

  v_current_season := public.get_current_season_number();

  select *
  into v_control
  from public.season_transition_control_v1
  where id = true;

  if found
     and coalesce(v_control.is_armed,false)
     and (
       v_control.armed_source_season is distinct from v_current_season
       or v_control.armed_target_season is distinct from v_current_season + 1
     )
  then
    v_count := v_count + 1;
  end if;

  if exists (
    select 1
    from public.game_daily_tick_backlog_v1 b
    where nullif(b.last_error,'') is not null
      and b.current_game_date >= public.get_game_date_for_season_start(v_current_season)
      and b.current_game_date <= public.get_current_game_date_date()
      and b.status <> 'processed'
  ) then
    v_count := v_count + 1;
  end if;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_season_migration_process_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game public.game_state%rowtype;
  v_game_date date;
  v_game_ts timestamptz;
  v_next_source integer;
  v_next_target integer;
  v_source integer;
  v_target integer;
  v_source_end date;
  v_target_start date;
  v_readiness jsonb;
  v_persistence jsonb;
  v_control public.season_transition_control_v1%rowtype;
  v_run public.season_transition_engine_runs_v2%rowtype;
  v_active_run_found boolean := false;
  v_pair_run_found boolean := false;
  v_blocking_components integer := 0;
  v_required_components integer := 0;
  v_ready_components integer := 0;
  v_exact_pair_armed boolean := false;
  v_wrong_pair_armed boolean := false;
  v_events jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_checkpoints jsonb := '[]'::jsonb;
  v_backlog jsonb := null;
  v_checklist jsonb := '[]'::jsonb;
  v_overall_status text := 'waiting';
  v_problem_count integer := 0;
  v_run_status text := null;
  v_run_error text := null;
  v_core_done boolean := false;
  v_rewards_done boolean := false;
  v_comms_done boolean := false;
  v_final_done boolean := false;
  v_resumed boolean := false;
  v_at_source_end boolean := false;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select *
  into v_game
  from public.game_state
  where id = true;

  if not found then
    raise exception 'game_state is not initialized';
  end if;

  v_game_date := public.get_current_game_date_date();
  v_game_ts := public.get_current_game_timestamp();
  v_next_source := v_game.season_number;
  v_next_target := v_next_source + 1;

  /*
   * Prefer an unfinished production run, because that is the migration an
   * administrator must currently diagnose. Otherwise the page becomes the
   * checklist for the next N -> N+1 transition.
   */
  select *
  into v_run
  from public.season_transition_engine_runs_v2 r
  where r.mode = 'production'
    and r.status <> 'completed'
  order by r.created_at desc
  limit 1;

  v_active_run_found := found;

  if v_active_run_found then
    v_source := v_run.source_season;
    v_target := v_run.target_season;
    v_pair_run_found := true;
  else
    v_source := v_next_source;
    v_target := v_next_target;
    /*
     * Completed production runs belong to History, not to the live checklist.
     * This matters after rollback/lab verification: an old successful run must
     * never make the next real transition appear partially completed.
     */
    v_pair_run_found := false;
  end if;

  v_source_end := public.get_game_date_for_season_end(v_source);
  v_target_start := public.get_game_date_for_season_start(v_target);
  v_at_source_end := v_game.season_number = v_source and v_game_date = v_source_end;

  v_readiness := public.get_season_transition_preflight_v1();
  v_persistence := public.get_season_transition_persistence_guard_status_v1();

  v_required_components :=
    coalesce((v_readiness ->> 'required_components')::integer, 0);
  v_ready_components :=
    coalesce((v_readiness ->> 'ready_components')::integer, 0);
  v_blocking_components :=
    coalesce((v_readiness ->> 'blocking_components')::integer, 0);

  select *
  into v_control
  from public.season_transition_control_v1
  where id = true;

  if found then
    v_exact_pair_armed :=
      coalesce(v_control.is_armed, false)
      and v_control.armed_source_season = v_source
      and v_control.armed_target_season = v_target;

    v_wrong_pair_armed :=
      coalesce(v_control.is_armed, false)
      and not v_exact_pair_armed;
  end if;

  if v_pair_run_found then
    v_run_status := v_run.status;
    v_run_error := v_run.error_message;

    v_core_done := v_run.status in (
      'core_validated','rewards_applied','communication_pending',
      'communication_done','final_validated','completed'
    );
    v_rewards_done := v_run.status in (
      'rewards_applied','communication_pending','communication_done',
      'final_validated','completed'
    );
    v_comms_done := v_run.status in (
      'communication_done','final_validated','completed'
    );
    v_final_done := v_run.status = 'completed';
    v_resumed :=
      v_run.status = 'completed'
      and nullif(v_run.metadata ->> 'resumed_at', '') is not null;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'phase', e.phase,
          'event_type', e.event_type,
          'payload', e.payload,
          'created_at', e.created_at
        )
        order by e.id desc
      ),
      '[]'::jsonb
    )
    into v_events
    from (
      select *
      from public.season_transition_engine_events_v2
      where run_id = v_run.id
      order by id desc
      limit 100
    ) e;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(h) order by h.created_at desc),
    '[]'::jsonb
  )
  into v_history
  from (
    select
      r.id,
      r.source_season,
      r.target_season,
      r.mode,
      r.status,
      r.source_end_date,
      r.target_start_date,
      r.error_message,
      r.created_at,
      r.source_frozen_at,
      r.core_applied_at,
      r.completed_at,
      r.updated_at,
      nullif(r.metadata ->> 'resumed_at', '') as resumed_at
    from public.season_transition_engine_runs_v2 r
    where r.mode = 'production'
    order by r.created_at desc
    limit 10
  ) h;

  select coalesce(
    jsonb_agg(to_jsonb(c) order by c.created_at desc),
    '[]'::jsonb
  )
  into v_checkpoints
  from (
    select
      cp.id,
      cp.label,
      cp.source_season,
      cp.source_end_date,
      cp.restore_method,
      cp.status,
      cp.notes,
      cp.created_at,
      cp.verified_at,
      cp.updated_at
    from public.season_transition_lab_checkpoints_v1 cp
    order by cp.created_at desc
    limit 10
  ) c;

  select to_jsonb(b)
  into v_backlog
  from (
    select
      d.id,
      d.current_game_date,
      d.season_number,
      d.month_number,
      d.day_number,
      d.status,
      d.attempts,
      d.source,
      d.last_error,
      d.processed_at,
      d.created_at,
      d.updated_at
    from public.game_daily_tick_backlog_v1 d
    where d.current_game_date = v_target_start
    order by d.created_at desc
    limit 1
  ) b;

  /*
   * Permanent operational checklist.
   * "blocked" always means the game should remain paused / the transition
   * should not advance until the displayed problem is repaired.
   */
  v_checklist := jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'key', 'component_readiness',
      'title', 'Preflight readiness',
      'description', 'All required season-transition components must be certified before the boundary can be armed.',
      'status', case
        when v_blocking_components = 0 and v_required_components > 0 then 'ready'
        else 'blocked'
      end,
      'detail', format('%s/%s required components ready', v_ready_components, v_required_components),
      'problem', case
        when v_blocking_components > 0
          then format('%s required component(s) are not ready.', v_blocking_components)
        else null
      end,
      'remediation', case
        when v_blocking_components > 0
          then 'Open the readiness checklist below, repair every non-ready required component, then refresh this page. Do not force the boundary.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 2,
      'key', 'arm_pair',
      'title', 'Arm exact season pair',
      'description', format('The transition control must be armed for Season %s -> Season %s. The boundary controller can auto-arm only when all readiness checks are green.', v_source, v_target),
      'status', case
        when v_exact_pair_armed then 'done'
        when v_wrong_pair_armed then 'blocked'
        when v_blocking_components > 0 then 'blocked'
        else 'waiting'
      end,
      'detail', case
        when v_exact_pair_armed then 'Exact source/target pair is armed.'
        when v_wrong_pair_armed then format('Control is armed for Season %s -> Season %s.', v_control.armed_source_season, v_control.armed_target_season)
        else 'Not armed yet; automatic arming is allowed only with a green readiness gate.'
      end,
      'problem', case
        when v_wrong_pair_armed then 'A different season pair is armed.'
        when v_blocking_components > 0 then 'Readiness gate is not fully green.'
        else null
      end,
      'remediation', case
        when v_wrong_pair_armed then 'Disarm the incorrect pair, verify the source/target seasons, and arm only the exact pair after readiness is green.'
        when v_blocking_components > 0 then 'Resolve the blocking readiness components first.'
        else 'No manual action is required before the boundary unless an administrator intentionally pre-arms the pair.'
      end
    ),
    jsonb_build_object(
      'order', 3,
      'key', 'boundary_pause',
      'title', 'Pause at Dec 31 -> Jan 1 boundary',
      'description', 'The ordinary game clock must not write Jan 1 directly. The v2 boundary controller takes ownership, pauses both clock/state, and fails closed on any error.',
      'status', case
        when v_pair_run_found and (
          v_run.status in (
            'source_frozen','core_applied','core_validated','rewards_applied',
            'communication_pending','communication_done','final_validated','completed'
          )
          or (v_run.status = 'failed' and coalesce(v_game.is_paused,false))
        ) then 'done'
        when v_at_source_end and coalesce(v_game.is_paused,false) then 'running'
        else 'waiting'
      end,
      'detail', case
        when coalesce(v_game.is_paused,false) then 'Game is currently paused.'
        else format('Automatic trigger is the exact game-date boundary %s -> %s.', v_source_end, v_target_start)
      end,
      'problem', null,
      'remediation', 'If the boundary controller fails, keep the game paused and diagnose the run error before retrying.'
    ),
    jsonb_build_object(
      'order', 4,
      'key', 'freeze_source',
      'title', 'Freeze source season',
      'description', 'Snapshot final standings, reconcile the canonical source snapshot, and verify division winners before any target-season mutations.',
      'status', case
        when v_pair_run_found and v_run.status = 'failed' then 'blocked'
        when v_pair_run_found and v_run.status in (
          'source_frozen','core_applied','core_validated','rewards_applied',
          'communication_pending','communication_done','final_validated','completed'
        ) then 'done'
        when v_pair_run_found and v_run.status = 'created' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_pair_run_found and v_run.source_frozen_at is not null
          then format('Source frozen at %s.', v_run.source_frozen_at)
        else 'Waiting for the exact season boundary.'
      end,
      'problem', case when v_pair_run_found and v_run.status = 'failed' then v_run.error_message else null end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'failed'
          then 'Repair the source snapshot/date/pause invariant shown by the error. Do not advance the clock. Start a new controlled run only after the cause is understood.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 5,
      'key', 'target_boundary',
      'title', 'Move to target Jan 1 while paused',
      'description', 'After source freeze succeeds, set the game to Season N+1, Jan 1, 00:00 while the game remains paused and queue Jan 1 daily processing.',
      'status', case
        when v_pair_run_found
         and v_game.season_number = v_target
         and v_game_date = v_target_start then 'done'
        else 'waiting'
      end,
      'detail', case
        when v_game.season_number = v_target and v_game_date = v_target_start
          then format('Game is at Season %s · Jan 1%s.', v_target, case when v_game.is_paused then ' and paused' else '' end)
        else format('Target boundary is Season %s · Jan 1.', v_target)
      end,
      'problem', case
        when v_pair_run_found
         and v_run.status in ('source_frozen','core_applied','core_validated','rewards_applied','communication_pending','communication_done')
         and not (v_game.season_number = v_target and v_game_date = v_target_start)
          then 'Transition run exists but the live game is not at its target Jan 1 boundary.'
        else null
      end,
      'remediation', 'The live game must remain at the target Jan 1 boundary until the transition completes.'
    ),
    jsonb_build_object(
      'order', 6,
      'key', 'core_transition',
      'title', 'Atomic core migration',
      'description', 'Calendar, ranking/history snapshot, retirements, competition/inactive clubs, rider and staff contracts, stale negotiations, AI rosters, sponsors, Developing Team and target-state verification run as the core transition.',
      'status', case
        when v_core_done then 'done'
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status in ('source_frozen','core_applied') then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_core_done then 'Core migration committed and target fresh-state validation passed.'
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then 'A core attempt failed and was rolled back atomically; the source freeze remains available for retry.'
        else 'Waiting for source freeze and target-boundary handoff.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then 'Fix the exact invariant named in the run error, then retry continuation. The failed core mutation was rolled back; do not manually reapply completed-looking partial data.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 7,
      'key', 'rewards',
      'title', 'Apply season rewards',
      'description', 'Apply the guarded, idempotent reward grants only after core validation succeeds.',
      'status', case
        when v_rewards_done then 'done'
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status = 'core_validated' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_rewards_done then 'Season rewards applied.'
        else 'Rewards remain separated from the core transition and are safe to retry.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null
          then 'Repair the reward invariant or ledger issue, then retry continuation. Core sporting state is already validated and must not be rerun manually.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 8,
      'key', 'communications',
      'title', 'Dispatch season communications',
      'description', 'Send season-start, movement and contract-expiry communications with idempotent event keys.',
      'status', case
        when v_comms_done then 'done'
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status in ('rewards_applied','communication_pending') then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_comms_done then 'Post-transition communications completed.'
        else 'Communication failure never rolls back successful sporting state.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null
          then 'Fix the notification/inbox error and retry communications. Do not rerun the sporting transition.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 9,
      'key', 'final_validation',
      'title', 'Final invariant validation',
      'description', 'Recheck source snapshot, target fresh state, persistence guards, reward guard/grants and the completed transition bridge before declaring success.',
      'status', case
        when v_final_done then 'done'
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status = 'communication_done' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_final_done then 'Final validation passed; transition is completed.'
        else 'Game remains paused until this check passes.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null
          then 'Repair only the failed final invariant, then retry finalization. Core/rewards/communications are already committed by design.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 10,
      'key', 'resume',
      'title', 'Resume game at Jan 1',
      'description', 'Resume only after the transition is completed and the game is still exactly at target Jan 1.',
      'status', case
        when v_resumed then 'done'
        when v_final_done and coalesce(v_game.is_paused,false) then 'ready'
        when v_final_done and not coalesce(v_game.is_paused,false) then 'done'
        else 'waiting'
      end,
      'detail', case
        when v_resumed or (v_final_done and not coalesce(v_game.is_paused,false))
          then 'Game clock resumed after successful transition.'
        when v_final_done then 'Transition completed; resume is the final controlled action.'
        else 'Resume is forbidden before completion.'
      end,
      'problem', null,
      'remediation', 'Never unpause a failed or incomplete season transition.'
    ),
    jsonb_build_object(
      'order', 11,
      'key', 'jan1_daily_backlog',
      'title', 'Process Jan 1 daily automation',
      'description', 'The Jan 1 daily tick is intentionally queued during migration and processed by forward daily automation only after the transition boundary is safely handled.',
      'status', case
        when v_backlog is null then 'waiting'
        when v_backlog ->> 'status' = 'processed' then 'done'
        when nullif(v_backlog ->> 'last_error','') is not null then 'blocked'
        else 'waiting'
      end,
      'detail', case
        when v_backlog is null then 'Jan 1 backlog row does not exist yet.'
        when v_backlog ->> 'status' = 'processed' then 'Jan 1 daily automation processed successfully.'
        else format('Jan 1 daily automation status: %s.', coalesce(v_backlog ->> 'status','unknown'))
      end,
      'problem', nullif(v_backlog ->> 'last_error',''),
      'remediation', case
        when nullif(v_backlog ->> 'last_error','') is not null
          then 'Keep the backlog pending, fix the reported daily processor error and let the retry-safe forward automation process it again.'
        else 'No action required.'
      end
    )
  );

  v_problem_count := v_blocking_components;
  if v_wrong_pair_armed then
    v_problem_count := v_problem_count + 1;
  end if;
  if v_pair_run_found and (
    v_run.status = 'failed'
    or (v_run.status <> 'completed' and nullif(v_run.error_message,'') is not null)
  ) then
    v_problem_count := v_problem_count + 1;
  end if;
  if nullif(v_backlog ->> 'last_error','') is not null then
    v_problem_count := v_problem_count + 1;
  end if;

  v_overall_status := case
    when v_problem_count > 0 then 'needs_attention'
    when v_pair_run_found and v_run.status = 'completed' then 'completed'
    when v_pair_run_found then 'in_progress'
    when v_exact_pair_armed then 'armed'
    when v_blocking_components = 0 then 'ready'
    else 'blocked'
  end;

  return jsonb_build_object(
    'overall_status', v_overall_status,
    'problem_count', v_problem_count,
    'game', jsonb_build_object(
      'season', v_game.season_number,
      'month', v_game.month_number,
      'day', v_game.day_number,
      'hour', v_game.hour_number,
      'minute', v_game.minute_number,
      'paused', v_game.is_paused,
      'game_date', v_game_date,
      'game_timestamp', v_game_ts
    ),
    'pair', jsonb_build_object(
      'source_season', v_source,
      'target_season', v_target,
      'source_end_date', v_source_end,
      'target_start_date', v_target_start,
      'using_active_run_pair', v_active_run_found
    ),
    'timing_policy', jsonb_build_object(
      'trigger', 'exact_dec31_to_jan1_game_date_boundary',
      'automatic_controller', 'season_transition_boundary_controller_v2',
      'game_pauses_before_mutation', true,
      'target_boundary_time', 'Jan 1 00:00 game time',
      'fail_closed', true,
      'resume_only_after_completed', true,
      'jan1_daily_processing_deferred', true
    ),
    'readiness', v_readiness,
    'persistence', v_persistence,
    'control', case when v_control.id is null then null else to_jsonb(v_control) end,
    'run', case
      when not v_pair_run_found then null
      else jsonb_build_object(
        'id', v_run.id,
        'source_season', v_run.source_season,
        'target_season', v_run.target_season,
        'mode', v_run.mode,
        'status', v_run.status,
        'source_end_date', v_run.source_end_date,
        'target_start_date', v_run.target_start_date,
        'error_message', v_run.error_message,
        'created_at', v_run.created_at,
        'source_frozen_at', v_run.source_frozen_at,
        'core_applied_at', v_run.core_applied_at,
        'completed_at', v_run.completed_at,
        'updated_at', v_run.updated_at,
        'resumed_at', nullif(v_run.metadata ->> 'resumed_at',''),
        'core_report', v_run.core_report,
        'reward_report', v_run.reward_report,
        'communication_report', v_run.communication_report,
        'validation_report', v_run.validation_report
      )
    end,
    'checklist', v_checklist,
    'events', v_events,
    'jan1_backlog', v_backlog,
    'history', v_history,
    'lab_checkpoints', v_checkpoints
  );
end;
$function$;

revoke all on function public.get_admin_season_migration_process_v1() from public;
revoke all on function public.get_admin_season_migration_problem_count_v1() from public;

grant execute on function public.get_admin_season_migration_process_v1() to authenticated;
grant execute on function public.get_admin_season_migration_problem_count_v1() to authenticated;
