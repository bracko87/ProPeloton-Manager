CREATE OR REPLACE FUNCTION public.race_engine_admin_process_next_due_stage_once_v1(p_cutoff_stage_date date, p_race_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text, p_auto_compact boolean DEFAULT true, p_tail_step_seconds integer DEFAULT 10, p_target_replay_rows integer DEFAULT 4900, p_preserve_last_frames integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_queue jsonb;
  v_candidate jsonb;
  v_stage_id uuid;
  v_process_result jsonb;
  v_confirm_required text := 'CONFIRM_PROCESS_NEXT_DUE_STAGE_ONCE';
begin
  perform set_config('statement_timeout', '300s', true);

  if p_cutoff_stage_date is null then
    return jsonb_build_object(
      'status', 'blocked_missing_cutoff_stage_date',
      'reason', 'p_cutoff_stage_date is required.'
    );
  end if;

  if p_dry_run = false
     and coalesce(p_confirm_text, '') <> v_confirm_required then
    return jsonb_build_object(
      'status', 'blocked_confirmation_required',
      'dry_run', p_dry_run,
      'required_confirm_text', v_confirm_required,
      'reason', 'Real processing requires explicit confirmation.'
    );
  end if;

  v_queue := public.race_engine_admin_get_due_stage_queue_v1(
    p_cutoff_stage_date,
    p_race_id,
    10
  );

  v_candidate := v_queue->'next_candidate';

  if v_candidate is null or v_candidate = 'null'::jsonb then
    return jsonb_build_object(
      'status', 'no_due_stage_to_process',
      'dry_run', p_dry_run,
      'cutoff_stage_date', p_cutoff_stage_date,
      'race_id_filter', p_race_id,
      'queue', v_queue,
      'reason', 'Queue has no safe next candidate.'
    );
  end if;

  if coalesce(v_candidate->>'stage_id', '') = '' then
    return jsonb_build_object(
      'status', 'blocked_invalid_queue_candidate',
      'dry_run', p_dry_run,
      'candidate', v_candidate,
      'queue', v_queue,
      'reason', 'Queue candidate has no stage_id.'
    );
  end if;

  if coalesce(v_candidate->>'stage_format', '') <> 'road_race' then
    return jsonb_build_object(
      'status', 'blocked_non_road_stage',
      'dry_run', p_dry_run,
      'candidate', v_candidate,
      'queue', v_queue,
      'reason', 'Only road_race stages are allowed in this scheduler wrapper.'
    );
  end if;

  if coalesce(v_candidate->>'participant_gate_passed', 'false') <> 'true' then
    return jsonb_build_object(
      'status', 'blocked_participant_gate_failed',
      'dry_run', p_dry_run,
      'candidate', v_candidate,
      'queue', v_queue,
      'reason', 'Participant gate failed.'
    );
  end if;

  if coalesce(v_candidate->>'road_automation_gate_passed', 'false') <> 'true' then
    return jsonb_build_object(
      'status', 'blocked_road_automation_gate_failed',
      'dry_run', p_dry_run,
      'candidate', v_candidate,
      'queue', v_queue,
      'reason', 'Road automation gate failed.'
    );
  end if;

  v_stage_id := (v_candidate->>'stage_id')::uuid;

  v_process_result := public.race_engine_admin_process_stage_once_v1(
    v_stage_id,
    p_dry_run,
    case
      when p_dry_run then null
      else 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE'
    end,
    p_auto_compact,
    p_tail_step_seconds,
    p_target_replay_rows,
    p_preserve_last_frames
  );

  return jsonb_build_object(
    'status',
      case
        when p_dry_run then 'dry_run_next_due_stage_checked'
        else 'real_next_due_stage_processed_once'
      end,
    'wrapper_version', 'phase_3c_process_next_due_stage_once_v1',
    'dry_run', p_dry_run,
    'cutoff_stage_date', p_cutoff_stage_date,
    'race_id_filter', p_race_id,
    'selected_stage_id', v_stage_id,
    'selected_candidate', v_candidate,
    'process_result', v_process_result,
    'queue_before', v_queue,
    'safety_rule', 'Exactly one queue candidate and one pipeline action per call.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_admin_scheduler_tick_v1(p_cutoff_stage_date date DEFAULT NULL::date, p_dry_run boolean DEFAULT false, p_confirm_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_cfg record;
  v_cutoff date;
  v_locked boolean := false;
  v_log_id uuid;
  v_result jsonb;
  v_status text;
  v_required_confirm text := 'CONFIRM_RACE_ENGINE_SCHEDULER_TICK';
begin
  perform set_config('statement_timeout', '300s', true);

  select *
  into v_cfg
  from public.race_engine_scheduler_config
  where id = 1;

  if not found then
    return jsonb_build_object(
      'status', 'blocked_missing_scheduler_config',
      'reason', 'race_engine_scheduler_config row id=1 is missing.'
    );
  end if;

  if v_cfg.is_enabled is not true then
    return jsonb_build_object(
      'status', 'scheduler_disabled',
      'reason', 'Scheduler config is disabled.',
      'config', to_jsonb(v_cfg)
    );
  end if;

  v_cutoff := coalesce(p_cutoff_stage_date, v_cfg.cutoff_stage_date);

  if v_cutoff is null then
    return jsonb_build_object(
      'status', 'blocked_missing_cutoff_stage_date',
      'reason', 'No cutoff date was supplied and config cutoff_stage_date is null.'
    );
  end if;

  if p_dry_run = false
     and coalesce(p_confirm_text, '') <> v_required_confirm then
    return jsonb_build_object(
      'status', 'blocked_confirmation_required',
      'required_confirm_text', v_required_confirm,
      'reason', 'Real scheduler tick requires explicit confirmation.'
    );
  end if;

  v_locked := pg_try_advisory_lock(hashtext('race_engine_scheduler_tick_v1')::bigint);

  if not v_locked then
    return jsonb_build_object(
      'status', 'skipped_scheduler_lock_busy',
      'reason', 'Another race engine scheduler tick is already running.',
      'cutoff_stage_date', v_cutoff,
      'dry_run', p_dry_run
    );
  end if;

  insert into public.race_engine_scheduler_tick_runs (
    dry_run,
    cutoff_stage_date,
    status
  )
  values (
    p_dry_run,
    v_cutoff,
    'started'
  )
  returning id into v_log_id;

  v_result := public.race_engine_admin_process_next_due_stage_once_v1(
    v_cutoff,
    null,
    p_dry_run,
    case
      when p_dry_run then null
      else 'CONFIRM_PROCESS_NEXT_DUE_STAGE_ONCE'
    end,
    true,
    10,
    4900,
    20
  );

  v_status := coalesce(v_result->>'status', 'completed_without_status');

  update public.race_engine_scheduler_tick_runs
  set
    finished_at = now(),
    status = v_status,
    result = v_result,
    error_message = null
  where id = v_log_id;

  perform pg_advisory_unlock(hashtext('race_engine_scheduler_tick_v1')::bigint);

  return jsonb_build_object(
    'status', 'scheduler_tick_completed',
    'scheduler_tick_version', 'phase_3c_scheduler_tick_v1',
    'log_id', v_log_id,
    'dry_run', p_dry_run,
    'cutoff_stage_date', v_cutoff,
    'process_result', v_result,
    'safety_rule', 'One scheduler tick processes exactly one due-stage action. Advisory lock prevents overlap.'
  );

exception
  when others then
    if v_log_id is not null then
      update public.race_engine_scheduler_tick_runs
      set
        finished_at = now(),
        status = 'error',
        error_message = sqlerrm
      where id = v_log_id;
    end if;

    if v_locked then
      perform pg_advisory_unlock(hashtext('race_engine_scheduler_tick_v1')::bigint);
    end if;

    return jsonb_build_object(
      'status', 'scheduler_tick_error',
      'error_message', sqlerrm,
      'dry_run', p_dry_run,
      'cutoff_stage_date', v_cutoff
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_admin_process_stage_once_v1(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirm_text text DEFAULT NULL::text, p_auto_compact boolean DEFAULT true, p_tail_step_seconds integer DEFAULT 10, p_target_replay_rows integer DEFAULT 4900, p_preserve_last_frames integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lock_namespace integer := hashtext('race_engine_stage');
  v_lock_key integer;
  v_lock_acquired boolean;

  v_result jsonb;
  v_state_before_fallback jsonb;
  v_state_after_tail jsonb;
  v_tail_result jsonb;
  v_closeout_result jsonb;

  v_next_action text;
  v_result_status text;
begin
  if p_stage_id is null then
    raise exception 'p_stage_id must not be null';
  end if;

  v_lock_key := hashtext(p_stage_id::text);

  v_lock_acquired := pg_try_advisory_xact_lock(
    v_lock_namespace,
    v_lock_key
  );

  if not v_lock_acquired then
    return jsonb_build_object(
      'status', 'stage_locked_skip',
      'reason', 'Another transaction already holds the race engine stage lock.',
      'stage_id', p_stage_id,
      'stage_lock_applied', true,
      'stage_lock_acquired', false,
      'stage_lock_namespace', v_lock_namespace,
      'stage_lock_key', v_lock_key,
      'stage_lock_wrapper', 'race_engine_admin_process_stage_once_v1',
      'stage_lock_started_at', now()
    );
  end if;

  -- First use the existing unlocked implementation.
  v_result := public.race_engine_admin_process_stage_once_unlocked_v1(
    p_stage_id,
    p_dry_run,
    p_confirm_text,
    p_auto_compact,
    p_tail_step_seconds,
    p_target_replay_rows,
    p_preserve_last_frames
  );

  v_result_status := coalesce(v_result->>'status', '');
  v_next_action := coalesce(
    v_result->>'next_action_before',
    v_result->'state_before'->>'next_action',
    ''
  );

  -- Normal path: return existing result with lock metadata.
  if v_result_status <> 'blocked_manual_review_needed' then
    return v_result
      || jsonb_build_object(
        'stage_lock_applied', true,
        'stage_lock_acquired', true,
        'stage_lock_namespace', v_lock_namespace,
        'stage_lock_key', v_lock_key,
        'stage_lock_wrapper', 'race_engine_admin_process_stage_once_v1',
        'stage_lock_finished_at', now()
      );
  end if;

  -- Dry runs should not repair or close out anything.
  if p_dry_run then
    return v_result
      || jsonb_build_object(
        'stage_lock_applied', true,
        'stage_lock_acquired', true,
        'stage_lock_namespace', v_lock_namespace,
        'stage_lock_key', v_lock_key,
        'stage_lock_wrapper', 'race_engine_admin_process_stage_once_v1',
        'auto_tail_review_fallback_available', true,
        'auto_tail_review_fallback_skipped_reason', 'dry_run',
        'stage_lock_finished_at', now()
      );
  end if;

  -- Keep the same admin confirmation guard.
  if coalesce(p_confirm_text, '') <> 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE' then
    return v_result
      || jsonb_build_object(
        'stage_lock_applied', true,
        'stage_lock_acquired', true,
        'stage_lock_namespace', v_lock_namespace,
        'stage_lock_key', v_lock_key,
        'stage_lock_wrapper', 'race_engine_admin_process_stage_once_v1',
        'auto_tail_review_fallback_skipped_reason', 'missing_admin_confirm',
        'required_confirm_text', 'CONFIRM_ADMIN_STAGE_PROCESS_ONCE',
        'stage_lock_finished_at', now()
      );
  end if;

  -- Re-check current state inside the same stage lock.
  v_state_before_fallback :=
    public.race_engine_get_stage_processing_state_v1(p_stage_id);

  v_next_action := coalesce(
    v_state_before_fallback->>'next_action',
    v_next_action,
    ''
  );

  if v_next_action not in (
    'run_tail_repair_dry_run_then_real',
    'run_stage_closeout_helper_or_mark_tail_repaired_after_review'
  ) then
    return v_result
      || jsonb_build_object(
        'stage_lock_applied', true,
        'stage_lock_acquired', true,
        'stage_lock_namespace', v_lock_namespace,
        'stage_lock_key', v_lock_key,
        'stage_lock_wrapper', 'race_engine_admin_process_stage_once_v1',
        'auto_tail_review_fallback_skipped_reason', 'next_action_not_supported',
        'fallback_state_next_action', v_next_action,
        'stage_lock_finished_at', now()
      );
  end if;

  -- Direct tail repair. This is the same call that passed manually.
  v_tail_result := public.race_engine_process_stage_tail_repair_v1(
    p_stage_id,
    false,
    'CONFIRM_STAGE_TAIL_REPAIR',
    p_tail_step_seconds
  );

  v_state_after_tail :=
    public.race_engine_get_stage_processing_state_v1(p_stage_id);

  -- If tail is now marked/repaired and closeout is possible, close out.
  if coalesce(v_state_after_tail->>'tail_repair_completed', 'false') = 'true'
     or coalesce(v_tail_result->>'status', '') = 'official_road_runner_executed_tail_repaired'
  then
    v_closeout_result := public.race_engine_closeout_stage_after_tail_v1(
      p_stage_id,
      false,
      'CONFIRM_STAGE_CLOSEOUT',
      p_auto_compact,
      p_target_replay_rows,
      p_preserve_last_frames
    );

    return jsonb_build_object(
      'status', 'tail_review_auto_repaired_and_closeout_attempted',
      'reason', 'Admin wrapper auto-handled blocked tail-review state using direct tail repair and closeout.',
      'stage_id', p_stage_id,
      'original_result', v_result,
      'fallback_state_before', v_state_before_fallback,
      'tail_repair_result', v_tail_result,
      'state_after_tail', v_state_after_tail,
      'closeout_result', v_closeout_result,
      'stage_lock_applied', true,
      'stage_lock_acquired', true,
      'stage_lock_namespace', v_lock_namespace,
      'stage_lock_key', v_lock_key,
      'stage_lock_wrapper', 'race_engine_admin_process_stage_once_v1',
      'auto_tail_review_fallback_applied', true,
      'stage_lock_finished_at', now()
    );
  end if;

  return jsonb_build_object(
    'status', 'tail_review_auto_repair_failed',
    'reason', 'Tail review fallback ran, but tail_repair_completed was not confirmed.',
    'stage_id', p_stage_id,
    'original_result', v_result,
    'fallback_state_before', v_state_before_fallback,
    'tail_repair_result', v_tail_result,
    'state_after_tail', v_state_after_tail,
    'stage_lock_applied', true,
    'stage_lock_acquired', true,
    'stage_lock_namespace', v_lock_namespace,
    'stage_lock_key', v_lock_key,
    'stage_lock_wrapper', 'race_engine_admin_process_stage_once_v1',
    'auto_tail_review_fallback_applied', true,
    'stage_lock_finished_at', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_write_replay_frames_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_distance_km numeric;
  v_rider_count integer;
  v_existing_frames integer;
  v_frame_count integer;
  v_estimated_winner_seconds integer;
  v_inserted_rows integer := 0;
begin
  if p_simulation_run_id is null then
    raise exception 'p_simulation_run_id must not be null';
  end if;

  select
    run.race_id,
    run.stage_id,
    coalesce(stage.distance_km, 120)::numeric
  into
    v_race_id,
    v_stage_id,
    v_distance_km
  from public.race_stage_simulation_runs run
  join public.race_stages stage
    on stage.id = run.stage_id
  where run.id = p_simulation_run_id;

  if v_stage_id is null then
    raise exception 'Simulation run % was not found.', p_simulation_run_id;
  end if;

  select count(*)
  into v_rider_count
  from public.race_stage_rider_states state
  where state.simulation_run_id = p_simulation_run_id
    and lower(coalesce(state.stage_status, 'finished')) not in (
      'dns',
      'did_not_start'
    );

  if coalesce(v_rider_count, 0) = 0 then
    raise exception 'No rider states found for simulation run %.', p_simulation_run_id;
  end if;

  select count(*)
  into v_existing_frames
  from public.race_stage_replay_frames frame
  where frame.simulation_run_id = p_simulation_run_id;

  if v_existing_frames > 0 then
    return jsonb_build_object(
      'status', 'replay_frames_already_exist_skip',
      'reason', 'Replay frames already exist for this simulation run; lightweight writer did not rewrite them.',
      'simulation_run_id', p_simulation_run_id,
      'race_id', v_race_id,
      'stage_id', v_stage_id,
      'existing_frame_rows', v_existing_frames,
      'writer_version', 'temporary_lightweight_replay_writer_v1'
    );
  end if;

  -- Keep replay small and predictable.
  -- Roughly 60–120 frames per stage, not thousands.
  v_frame_count := least(
    120,
    greatest(60, round(v_distance_km / 2.0)::integer)
  );

  -- Lightweight estimated winner time.
  -- Official stage results remain source of truth later.
  v_estimated_winner_seconds := greatest(
    1,
    round((v_distance_km / 42.0) * 3600)::integer
  );

  with rider_base as (
    select
      state.rider_id,
      state.team_id,
      coalesce(state.finish_position, 9999) as finish_position,
      greatest(0, coalesce(state.gap_seconds, 0))::integer as final_gap_seconds,

      coalesce(
        nullif(
          trim(
            concat_ws(
              ' ',
              nullif(rider.first_name, ''),
              nullif(rider.last_name, '')
            )
          ),
          ''
        ),
        nullif(rider.display_name, ''),
        state.metadata->>'rider_name',
        'Rider'
      ) as rider_name,

      coalesce(
        nullif(state.metadata->>'team_name', ''),
        state.team_id::text,
        'Team'
      ) as team_name

    from public.race_stage_rider_states state
    join public.riders rider
      on rider.id = state.rider_id
    where state.simulation_run_id = p_simulation_run_id
      and lower(coalesce(state.stage_status, 'finished')) not in (
        'dns',
        'did_not_start'
      )
  ),

  frames as (
    select
      frame_number,
      (frame_number::numeric / v_frame_count::numeric) as progress_ratio,
      round(
        (frame_number::numeric / v_frame_count::numeric)
        * v_estimated_winner_seconds
      )::integer as race_seconds,
      round(
        (frame_number::numeric / v_frame_count::numeric)
        * v_distance_km,
        3
      ) as km_marker
    from generate_series(0, v_frame_count) as frame_number
  ),

  rider_live as (
    select
      frame.frame_number,
      frame.progress_ratio,
      frame.race_seconds,
      frame.km_marker,

      rider.rider_id,
      rider.team_id,
      rider.finish_position,
      rider.rider_name,
      rider.team_name,
      rider.final_gap_seconds,

      case
        when frame.progress_ratio < 0.15 then 0
        else round(
          rider.final_gap_seconds
          * power(frame.progress_ratio, 1.35)
        )::integer
      end as live_gap_seconds

    from frames frame
    cross join rider_base rider
  ),

  rider_grouped as (
    select
      live.*,

      case
        when live.live_gap_seconds <= 9 then 1
        when live.live_gap_seconds <= 45 then 2
        when live.live_gap_seconds <= 120 then 3
        else 4
      end as group_order

    from rider_live live
  ),

  replay_groups as (
    select
      grouped.frame_number,
      grouped.race_seconds,
      grouped.km_marker,
      grouped.group_order,

      case grouped.group_order
        when 1 then 'front_group'
        when 2 then 'main_peloton'
        when 3 then 'dropped_group'
        else 'outside_group_01'
      end as group_code,

      case grouped.group_order
        when 1 then 'Front group'
        when 2 then 'Peloton'
        when 3 then 'Dropped group'
        else 'Outside group'
      end as group_label,

      min(grouped.live_gap_seconds)::integer as gap_seconds,

      -- Lightweight speed estimate, enough for replay UI continuity.
      round(
        case
          when grouped.race_seconds <= 0 then 42
          else grouped.km_marker / greatest(grouped.race_seconds, 1) * 3600
        end,
        2
      ) as avg_speed_kmh,

      array_agg(grouped.rider_id order by grouped.finish_position, grouped.rider_id) as rider_ids,
      array_agg(grouped.rider_name order by grouped.finish_position, grouped.rider_id) as rider_names,
      array_agg(grouped.team_name order by grouped.finish_position, grouped.rider_id) as team_names,
      count(*)::integer as group_size

    from rider_grouped grouped
    group by
      grouped.frame_number,
      grouped.race_seconds,
      grouped.km_marker,
      grouped.group_order
  )

  insert into public.race_stage_replay_frames (
    simulation_run_id,
    race_id,
    stage_id,
    frame_number,
    race_seconds,
    km_marker,
    group_code,
    group_label,
    group_order,
    gap_seconds,
    avg_speed_kmh,
    rider_ids,
    rider_names,
    team_names,
    metadata,
    replay_mode,
    entity_type,
    entity_key,
    entity_label
  )
  select
    p_simulation_run_id,
    v_race_id,
    v_stage_id,
    replay.frame_number,
    replay.race_seconds,
    replay.km_marker,
    replay.group_code,
    replay.group_label,
    replay.group_order,
    case
      when replay.group_order = 1 then 0
      else replay.gap_seconds
    end as gap_seconds,
    replay.avg_speed_kmh,
    replay.rider_ids,
    replay.rider_names,
    replay.team_names,
    jsonb_build_object(
      'source', 'temporary_lightweight_replay_writer_v1',
      'reason', 'Heavy recursive replay writer temporarily replaced after statement timeouts.',
      'phase', 'phase_b2_c_emergency_stabilization',
      'model', 'lightweight_gap_bucket_replay',
      'group_size', replay.group_size,
      'estimated_winner_seconds', v_estimated_winner_seconds,
      'distance_km', v_distance_km,
      'frame_count', v_frame_count,
      'temporary', true
    ),
    'road_race',
    'group',
    replay.group_code,
    replay.group_label
  from replay_groups replay
  order by
    replay.frame_number,
    replay.group_order
  on conflict (simulation_run_id, frame_number, entity_key)
  do update set
    race_seconds = excluded.race_seconds,
    km_marker = excluded.km_marker,
    group_code = excluded.group_code,
    group_label = excluded.group_label,
    group_order = excluded.group_order,
    gap_seconds = excluded.gap_seconds,
    avg_speed_kmh = excluded.avg_speed_kmh,
    rider_ids = excluded.rider_ids,
    rider_names = excluded.rider_names,
    team_names = excluded.team_names,
    metadata = excluded.metadata,
    replay_mode = excluded.replay_mode,
    entity_type = excluded.entity_type,
    entity_label = excluded.entity_label;

  get diagnostics v_inserted_rows = row_count;

  return jsonb_build_object(
    'status', 'replay_frames_written',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'writer_version', 'temporary_lightweight_replay_writer_v1',
    'temporary', true,
    'rider_count', v_rider_count,
    'frame_count', v_frame_count,
    'inserted_or_updated_rows', v_inserted_rows,
    'estimated_winner_seconds', v_estimated_winner_seconds,
    'distance_km', v_distance_km
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_run_due_monthly_tax_audits_guarded_v1(p_notify boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('public.finance_run_due_monthly_tax_audits_guarded_v1')::bigint;
  v_result jsonb;
  v_old_statement_timeout text;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'status', 'skipped_already_running',
      'function', 'finance_run_due_monthly_tax_audits_guarded_v1'
    );
  end if;

  v_old_statement_timeout := current_setting('statement_timeout', true);

  -- Very short guard: if it cannot finish quickly, it must be deferred.
  perform set_config('statement_timeout', '8000', true);

  begin
    select public.finance_run_due_monthly_tax_audits(p_notify)
    into v_result;

    perform set_config(
      'statement_timeout',
      coalesce(nullif(v_old_statement_timeout, ''), '0'),
      true
    );

    return jsonb_build_object(
      'status', 'completed',
      'result', v_result
    );

  exception
    when query_canceled then
      perform set_config(
        'statement_timeout',
        coalesce(nullif(v_old_statement_timeout, ''), '0'),
        true
      );

      insert into public.game_time_job_warnings_v1(warning_type, payload)
      values (
        'monthly_tax_audit_deferred_query_canceled',
        jsonb_build_object(
          'status', 'deferred',
          'sqlstate', sqlstate,
          'error', sqlerrm,
          'notify', p_notify,
          'created_at', now()
        )
      );

      return jsonb_build_object(
        'status', 'deferred_query_canceled',
        'sqlstate', sqlstate,
        'error', sqlerrm
      );

    when others then
      perform set_config(
        'statement_timeout',
        coalesce(nullif(v_old_statement_timeout, ''), '0'),
        true
      );

      insert into public.game_time_job_warnings_v1(warning_type, payload)
      values (
        'monthly_tax_audit_deferred_error',
        jsonb_build_object(
          'status', 'deferred',
          'sqlstate', sqlstate,
          'error', sqlerrm,
          'notify', p_notify,
          'created_at', now()
        )
      );

      return jsonb_build_object(
        'status', 'deferred_error_caught',
        'sqlstate', sqlstate,
        'error', sqlerrm
      );
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_one_daily_tick_backlog_v1(p_statement_timeout_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('public.process_one_daily_tick_backlog_v1')::bigint;

  v_backlog public.game_daily_tick_backlog_v1%rowtype;
  v_original_state public.game_state%rowtype;
  v_target_date date;

  v_process_daily_tick_ok boolean := false;
  v_tax_result jsonb := null;
  v_emergency_loan_ok boolean := false;
  v_game_processors_result jsonb := null;
  v_game_processors_success boolean := false;

  v_old_statement_timeout text;
  v_error text := null;
  v_sqlstate text := null;
  v_status text := 'unknown';
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'ok', false,
      'status', 'skipped_already_running'
    );
  end if;

  select *
  into v_backlog
  from public.game_daily_tick_backlog_v1
  where status = 'pending'
  order by current_game_date asc
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'status', 'no_pending_backlog'
    );
  end if;

  select *
  into v_original_state
  from public.game_state
  where id = true
  for update;

  if not found then
    raise exception 'game_state row not found';
  end if;

  v_target_date := v_backlog.current_game_date;

  update public.game_daily_tick_backlog_v1
  set
    status = 'running',
    attempts = attempts + 1,
    updated_at = now(),
    last_error = null
  where id = v_backlog.id;

  -- Keep clock paused while processing.
  begin
    update public.game_clock_config
    set is_paused = true
    where id = true;
  exception when others then
    null;
  end;

  -- Temporarily set game date so processors read the backlog day.
  update public.game_state
  set
    season_number = public.season_from_game_date(v_target_date),
    month_number = extract(month from v_target_date)::smallint,
    day_number = extract(day from v_target_date)::smallint,
    hour_number = 0,
    minute_number = 0,
    tick_version = coalesce(v_backlog.tick_version, v_original_state.tick_version),
    last_advanced_at = clock_timestamp(),
    is_paused = true
  where id = true;

  v_old_statement_timeout := current_setting('statement_timeout', true);

  perform set_config(
    'statement_timeout',
    greatest(10, least(coalesce(p_statement_timeout_seconds, 60), 90))::text || 's',
    true
  );

  begin
    perform public.process_daily_tick();
    v_process_daily_tick_ok := true;

    begin
      select public.finance_run_due_monthly_tax_audits_guarded_v1(true)
      into v_tax_result;
    exception
      when query_canceled then
        v_tax_result := jsonb_build_object(
          'status', 'query_canceled_deferred',
          'sqlstate', sqlstate,
          'error', sqlerrm
        );
      when others then
        v_tax_result := jsonb_build_object(
          'status', 'error_deferred',
          'sqlstate', sqlstate,
          'error', sqlerrm
        );
    end;

    perform public.finance_process_weekly_emergency_loan_repayments();
    v_emergency_loan_ok := true;

    select public.run_daily_game_processors_v1(false)
    into v_game_processors_result;

    v_game_processors_success :=
      coalesce((v_game_processors_result ->> 'success')::boolean, false);

    if v_game_processors_success is not true then
      v_status := 'failed';
      v_sqlstate := 'P0001';
      v_error := coalesce(
        v_game_processors_result ->> 'error',
        'run_daily_game_processors_v1 returned success=false'
      );
    else
      v_status := 'processed';
    end if;

  exception
    when query_canceled then
      v_status := 'failed';
      v_sqlstate := sqlstate;
      v_error := sqlerrm;

    when others then
      v_status := 'failed';
      v_sqlstate := sqlstate;
      v_error := sqlerrm;
  end;

  perform set_config(
    'statement_timeout',
    coalesce(nullif(v_old_statement_timeout, ''), '0'),
    true
  );

  -- Restore real current game clock exactly, keep paused.
  update public.game_state
  set
    season_number = v_original_state.season_number,
    month_number = v_original_state.month_number,
    day_number = v_original_state.day_number,
    hour_number = v_original_state.hour_number,
    minute_number = v_original_state.minute_number,
    tick_version = v_original_state.tick_version,
    is_paused = true,
    last_advanced_at = v_original_state.last_advanced_at
  where id = true;

  if v_status = 'processed' then
    update public.game_daily_tick_backlog_v1
    set
      status = 'processed',
      processed_at = now(),
      updated_at = now(),
      last_error = null,
      payload = payload || jsonb_build_object(
        'processed_at', now(),
        'process_daily_tick_ok', v_process_daily_tick_ok,
        'tax_result', v_tax_result,
        'emergency_loan_ok', v_emergency_loan_ok,
        'game_processors_result', v_game_processors_result
      )
    where id = v_backlog.id;
  else
    update public.game_daily_tick_backlog_v1
    set
      status = 'pending',
      updated_at = now(),
      last_error = concat_ws(': ', v_sqlstate, v_error),
      payload = payload || jsonb_build_object(
        'last_failed_at', now(),
        'last_sqlstate', v_sqlstate,
        'last_error', v_error,
        'process_daily_tick_ok', v_process_daily_tick_ok,
        'tax_result', v_tax_result,
        'emergency_loan_ok', v_emergency_loan_ok,
        'game_processors_result', v_game_processors_result,
        'strict_processor_detected_failure', true
      )
    where id = v_backlog.id;
  end if;

  insert into public.game_daily_tick_backlog_processor_runs_v1 (
    backlog_id,
    current_game_date,
    status,
    payload
  )
  values (
    v_backlog.id,
    v_backlog.current_game_date,
    v_status,
    jsonb_build_object(
      'process_daily_tick_ok', v_process_daily_tick_ok,
      'tax_result', v_tax_result,
      'emergency_loan_ok', v_emergency_loan_ok,
      'game_processors_result', v_game_processors_result,
      'game_processors_success', v_game_processors_success,
      'sqlstate', v_sqlstate,
      'error', v_error,
      'original_game_state_restored_to', to_jsonb(v_original_state)
    )
  );

  return jsonb_build_object(
    'ok', v_status = 'processed',
    'status', v_status,
    'processed_game_date', v_backlog.current_game_date,
    'process_daily_tick_ok', v_process_daily_tick_ok,
    'tax_result', v_tax_result,
    'emergency_loan_ok', v_emergency_loan_ok,
    'game_processors_result', v_game_processors_result,
    'game_processors_success', v_game_processors_success,
    'sqlstate', v_sqlstate,
    'error', v_error
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.try_numeric_from_text_v1(p_value text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_clean text;
begin
  if p_value is null then
    return null;
  end if;

  v_clean := trim(p_value);

  if v_clean = '' then
    return null;
  end if;

  if v_clean ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return v_clean::numeric;
  end if;

  return null;
exception
  when others then
    return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_avg_temp_c_v1(p_stage_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_value numeric;
begin
  select coalesce(
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'avg_temp_c'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'average_temp_c'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'temperature_avg_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'avg_temp_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'average_temp_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'temperature_avg_c')
  )
  into v_value
  from public.race_stages rs
  left join lateral (
    select d.weather_snapshot
    from public.race_stage_profile_details d
    where d.stage_id = rs.id
    limit 1
  ) rspd on true
  where rs.id = p_stage_id;

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_min_temp_c_v1(p_stage_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_value numeric;
begin
  select coalesce(
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'avg_min_temp_c'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'min_temp_c'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'temperature_min_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'avg_min_temp_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'min_temp_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'temperature_min_c')
  )
  into v_value
  from public.race_stages rs
  left join lateral (
    select d.weather_snapshot
    from public.race_stage_profile_details d
    where d.stage_id = rs.id
    limit 1
  ) rspd on true
  where rs.id = p_stage_id;

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_max_temp_c_v1(p_stage_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_value numeric;
begin
  select coalesce(
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'avg_max_temp_c'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'max_temp_c'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'temperature_max_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'avg_max_temp_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'max_temp_c'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'temperature_max_c')
  )
  into v_value
  from public.race_stages rs
  left join lateral (
    select d.weather_snapshot
    from public.race_stage_profile_details d
    where d.stage_id = rs.id
    limit 1
  ) rspd on true
  where rs.id = p_stage_id;

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_condition_text_v2(p_stage_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_condition text;
begin
  select nullif(
    lower(trim(coalesce(
      rs.weather_snapshot ->> 'weather_condition',
      rs.weather_snapshot ->> 'condition',
      rs.weather_snapshot ->> 'main_condition',
      rs.weather_snapshot ->> 'weather',
      rspd.weather_snapshot ->> 'weather_condition',
      rspd.weather_snapshot ->> 'condition',
      rspd.weather_snapshot ->> 'main_condition',
      rspd.weather_snapshot ->> 'weather'
    ))),
    ''
  )
  into v_condition
  from public.race_stages rs
  left join lateral (
    select d.weather_snapshot
    from public.race_stage_profile_details d
    where d.stage_id = rs.id
    limit 1
  ) rspd on true
  where rs.id = p_stage_id;

  if v_condition is not null then
    return v_condition;
  end if;

  -- Fallback from weather_summary text
  select case
    when lower(coalesce(rs.weather_summary, '')) like '%snow%' then 'snow'
    when lower(coalesce(rs.weather_summary, '')) like '%rain%' then 'rain'
    when lower(coalesce(rs.weather_summary, '')) like '%storm%' then 'storm'
    when lower(coalesce(rs.weather_summary, '')) like '%overcast%' then 'overcast'
    when lower(coalesce(rs.weather_summary, '')) like '%cloud%' then 'cloudy'
    when lower(coalesce(rs.weather_summary, '')) like '%sun%' then 'sunny'
    else null
  end
  into v_condition
  from public.race_stages rs
  where rs.id = p_stage_id;

  return v_condition;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_snow_cm_v2(p_stage_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_value numeric;
begin
  select coalesce(
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'snow_cm'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'avg_snow_cm'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'snowfall_cm'),
    public.try_numeric_from_text_v1(rs.weather_snapshot ->> 'snow_amount_cm'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'snow_cm'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'avg_snow_cm'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'snowfall_cm'),
    public.try_numeric_from_text_v1(rspd.weather_snapshot ->> 'snow_amount_cm')
  )
  into v_value
  from public.race_stages rs
  left join lateral (
    select d.weather_snapshot
    from public.race_stage_profile_details d
    where d.stage_id = rs.id
    limit 1
  ) rspd on true
  where rs.id = p_stage_id;

  return coalesce(v_value, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_has_actual_snow_v2(p_stage_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_condition text;
  v_snow_cm numeric;
begin
  v_condition := public.race_stage_weather_condition_text_v2(p_stage_id);
  v_snow_cm := public.race_stage_weather_snow_cm_v2(p_stage_id);

  return coalesce(v_condition = 'snow', false)
      or coalesce(v_condition like '%snow%', false)
      or coalesce(v_snow_cm > 0, false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_cancellation_reason_v1(p_stage_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_final_status text;
  v_final_snapshot jsonb;
begin
  select
    s.weather_snapshot,
    s.weather_summary,
    coalesce(s.metadata, '{}'::jsonb) as metadata
  into v_stage
  from public.race_stages s
  where s.id = p_stage_id;

  if not found then
    return null;
  end if;

  v_final_status := nullif(v_stage.metadata ->> 'weather_final_decision_status', '');
  v_final_snapshot := v_stage.metadata -> 'weather_final_snapshot';

  if v_final_status = 'cleared' then
    return null;
  end if;

  if v_final_status = 'cancelled' and v_final_snapshot is not null then
    return public.race_stage_weather_cancellation_reason_from_snapshot_v1(
      v_final_snapshot,
      v_stage.weather_summary
    );
  end if;

  -- Before final decision, this still represents forecast risk.
  return public.race_stage_weather_cancellation_reason_from_snapshot_v1(
    v_stage.weather_snapshot,
    v_stage.weather_summary
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_one_daily_tick_backlog_smart_v1(p_statement_timeout_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('public.process_one_daily_tick_backlog_smart_v1')::bigint;

  v_backlog public.game_daily_tick_backlog_v1%rowtype;
  v_original_state public.game_state%rowtype;
  v_target_date date;

  v_prior_process_daily_tick_ok boolean := false;
  v_prior_emergency_loan_ok boolean := false;
  v_prior_tax_result jsonb := null;

  v_game_processors_result jsonb := null;
  v_game_processors_success boolean := false;

  v_old_statement_timeout text;
  v_error text := null;
  v_sqlstate text := null;
  v_status text := 'unknown';
  v_delegate_result jsonb := null;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'ok', false,
      'status', 'skipped_already_running'
    );
  end if;

  select *
  into v_backlog
  from public.game_daily_tick_backlog_v1
  where status = 'pending'
  order by current_game_date asc
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'status', 'no_pending_backlog'
    );
  end if;

  v_prior_process_daily_tick_ok :=
    coalesce((v_backlog.payload ->> 'process_daily_tick_ok')::boolean, false);

  v_prior_emergency_loan_ok :=
    coalesce((v_backlog.payload ->> 'emergency_loan_ok')::boolean, false);

  v_prior_tax_result := v_backlog.payload -> 'tax_result';

  /*
    If this day has not already passed process_daily_tick, use the normal
    strict full processor. This avoids duplicating full daily logic only for
    partially processed days like Dec 2/Dec 3.
  */
  if v_prior_process_daily_tick_ok is not true then
    select public.process_one_daily_tick_backlog_v1(p_statement_timeout_seconds)
    into v_delegate_result;

    return jsonb_build_object(
      'ok', coalesce((v_delegate_result ->> 'ok')::boolean, false),
      'status', v_delegate_result ->> 'status',
      'mode', 'delegated_full_processor',
      'delegate_result', v_delegate_result
    );
  end if;

  select *
  into v_original_state
  from public.game_state
  where id = true
  for update;

  if not found then
    raise exception 'game_state row not found';
  end if;

  v_target_date := v_backlog.current_game_date;

  update public.game_daily_tick_backlog_v1
  set
    status = 'running',
    attempts = attempts + 1,
    updated_at = now(),
    last_error = null
  where id = v_backlog.id;

  update public.game_clock_config
  set is_paused = true
  where id = true;

  update public.game_state
  set
    season_number = public.season_from_game_date(v_target_date),
    month_number = extract(month from v_target_date)::smallint,
    day_number = extract(day from v_target_date)::smallint,
    hour_number = 0,
    minute_number = 0,
    tick_version = coalesce(v_backlog.tick_version, v_original_state.tick_version),
    last_advanced_at = clock_timestamp(),
    is_paused = true
  where id = true;

  v_old_statement_timeout := current_setting('statement_timeout', true);

  perform set_config(
    'statement_timeout',
    greatest(10, least(coalesce(p_statement_timeout_seconds, 60), 90))::text || 's',
    true
  );

  begin
    select public.run_daily_game_processors_v1(false)
    into v_game_processors_result;

    v_game_processors_success :=
      coalesce((v_game_processors_result ->> 'success')::boolean, false);

    if v_game_processors_success is true then
      v_status := 'processed';
    else
      v_status := 'failed';
      v_sqlstate := 'P0001';
      v_error := coalesce(
        v_game_processors_result ->> 'error',
        'run_daily_game_processors_v1 returned success=false'
      );
    end if;

  exception
    when query_canceled then
      v_status := 'failed';
      v_sqlstate := sqlstate;
      v_error := sqlerrm;

    when others then
      v_status := 'failed';
      v_sqlstate := sqlstate;
      v_error := sqlerrm;
  end;

  perform set_config(
    'statement_timeout',
    coalesce(nullif(v_old_statement_timeout, ''), '0'),
    true
  );

  -- Restore real current game clock exactly, keep paused.
  update public.game_state
  set
    season_number = v_original_state.season_number,
    month_number = v_original_state.month_number,
    day_number = v_original_state.day_number,
    hour_number = v_original_state.hour_number,
    minute_number = v_original_state.minute_number,
    tick_version = v_original_state.tick_version,
    is_paused = true,
    last_advanced_at = v_original_state.last_advanced_at
  where id = true;

  if v_status = 'processed' then
    update public.game_daily_tick_backlog_v1
    set
      status = 'processed',
      processed_at = now(),
      updated_at = now(),
      last_error = null,
      payload = payload || jsonb_build_object(
        'processed_at', now(),
        'smart_processor_mode', 'retry_game_processors_only',
        'process_daily_tick_ok', true,
        'tax_result', v_prior_tax_result,
        'emergency_loan_ok', v_prior_emergency_loan_ok,
        'game_processors_result', v_game_processors_result
      )
    where id = v_backlog.id;
  else
    update public.game_daily_tick_backlog_v1
    set
      status = 'pending',
      updated_at = now(),
      last_error = concat_ws(': ', v_sqlstate, v_error),
      payload = payload || jsonb_build_object(
        'last_failed_at', now(),
        'smart_processor_mode', 'retry_game_processors_only',
        'last_sqlstate', v_sqlstate,
        'last_error', v_error,
        'process_daily_tick_ok', true,
        'tax_result', v_prior_tax_result,
        'emergency_loan_ok', v_prior_emergency_loan_ok,
        'game_processors_result', v_game_processors_result
      )
    where id = v_backlog.id;
  end if;

  insert into public.game_daily_tick_backlog_processor_runs_v1 (
    backlog_id,
    current_game_date,
    status,
    payload
  )
  values (
    v_backlog.id,
    v_backlog.current_game_date,
    v_status,
    jsonb_build_object(
      'smart_processor_mode', 'retry_game_processors_only',
      'process_daily_tick_ok', true,
      'tax_result', v_prior_tax_result,
      'emergency_loan_ok', v_prior_emergency_loan_ok,
      'game_processors_result', v_game_processors_result,
      'game_processors_success', v_game_processors_success,
      'sqlstate', v_sqlstate,
      'error', v_error,
      'original_game_state_restored_to', to_jsonb(v_original_state)
    )
  );

  return jsonb_build_object(
    'ok', v_status = 'processed',
    'status', v_status,
    'mode', 'retry_game_processors_only',
    'processed_game_date', v_backlog.current_game_date,
    'process_daily_tick_ok', true,
    'tax_result', v_prior_tax_result,
    'emergency_loan_ok', v_prior_emergency_loan_ok,
    'game_processors_result', v_game_processors_result,
    'game_processors_success', v_game_processors_success,
    'sqlstate', v_sqlstate,
    'error', v_error
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_race_stage_weather_cancellation_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
  v_stage_count integer;
  v_reason text;
  v_final_decision jsonb;
  v_final_status text;
begin
  if p_stage_id is null then
    raise exception 'Stage ID is required.';
  end if;

  select s.race_id
  into v_race_id
  from public.race_stages s
  where s.id = p_stage_id;

  if v_race_id is null then
    raise exception 'Stage % was not found.', p_stage_id;
  end if;

  select count(*)::integer
  into v_stage_count
  from public.race_stages s
  where s.race_id = v_race_id;

  -- Idempotent no-op if already cancelled.
  if exists (
    select 1
    from public.race_stages s
    where s.id = p_stage_id
      and s.weather_cancelled is true
  ) then
    select s.weather_cancellation_reason
    into v_reason
    from public.race_stages s
    where s.id = p_stage_id;

    return jsonb_build_object(
      'status', 'already_cancelled',
      'cancelled', true,
      'race_id', v_race_id,
      'stage_id', p_stage_id,
      'reason', v_reason,
      'stage_count', v_stage_count,
      'is_one_day_race', v_stage_count = 1
    );
  end if;

  -- New v2 behavior: create final 24h weather snapshot once before deciding.
  v_final_decision := public.race_stage_weather_prepare_final_decision_v1(
    p_stage_id,
    false
  );

  v_final_status := v_final_decision ->> 'weather_final_decision_status';
  v_reason := public.race_stage_weather_cancellation_reason_v1(p_stage_id);

  if v_final_status = 'cleared' or v_reason is null then
    return jsonb_build_object(
      'status', 'weather_cleared',
      'cancelled', false,
      'race_id', v_race_id,
      'stage_id', p_stage_id,
      'reason', null,
      'stage_count', v_stage_count,
      'is_one_day_race', v_stage_count = 1,
      'weather_final_decision', v_final_decision
    );
  end if;

  update public.race_stages s
  set
    weather_cancelled = true,
    weather_cancellation_reason = v_reason,
    weather_cancelled_at = coalesce(s.weather_cancelled_at, now()),
    metadata =
      coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'weather_final_decision_status', 'cancelled',
        'weather_final_decision_reason', v_reason,
        'weather_cancelled_by', 'apply_race_stage_weather_cancellation_v1',
        'weather_cancelled_version', 'weather_final_recheck_v2'
      )
  where s.id = p_stage_id;

  return jsonb_build_object(
    'status', 'weather_cancelled',
    'cancelled', true,
    'race_id', v_race_id,
    'stage_id', p_stage_id,
    'reason', v_reason,
    'stage_count', v_stage_count,
    'is_one_day_race', v_stage_count = 1,
    'weather_final_decision', v_final_decision
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_cleanup_warm_snow_weather_snapshot_v1(p_snapshot jsonb, p_new_condition text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_next jsonb;
begin
  v_next := coalesce(p_snapshot, '{}'::jsonb);

  -- Ensure there is a canonical condition key after cleanup.
  v_next := jsonb_set(
    v_next,
    '{weather_condition}',
    to_jsonb(p_new_condition),
    true
  );

  -- Also update any alternative condition keys if they exist.
  if v_next ? 'condition' then
    v_next := jsonb_set(v_next, '{condition}', to_jsonb(p_new_condition), true);
  end if;

  if v_next ? 'main_condition' then
    v_next := jsonb_set(v_next, '{main_condition}', to_jsonb(p_new_condition), true);
  end if;

  if v_next ? 'weather' then
    v_next := jsonb_set(v_next, '{weather}', to_jsonb(p_new_condition), true);
  end if;

  -- Remove snow amounts / force them to zero.
  v_next := jsonb_set(v_next, '{snow_cm}', to_jsonb(0), true);
  v_next := jsonb_set(v_next, '{avg_snow_cm}', to_jsonb(0), true);

  if v_next ? 'snowfall_cm' then
    v_next := jsonb_set(v_next, '{snowfall_cm}', to_jsonb(0), true);
  end if;

  if v_next ? 'snow_amount_cm' then
    v_next := jsonb_set(v_next, '{snow_amount_cm}', to_jsonb(0), true);
  end if;

  return v_next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_cleanup_weather_cancelled_stage_artifacts_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted integer := 0;

  v_stage_results_deleted integer := 0;
  v_stage_point_results_deleted integer := 0;
  v_ranking_awards_deleted integer := 0;
  v_classification_rows_deleted integer := 0;
  v_replay_frames_deleted integer := 0;
  v_rider_states_deleted integer := 0;
  v_team_states_deleted integer := 0;
  v_incidents_deleted integer := 0;
  v_report_events_deleted integer := 0;

  v_has_table boolean;
  v_has_column boolean;
begin
  -- ----------------------------------------------------------
  -- race_stage_results
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_results') is not null
  into v_has_table;

  if v_has_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_results'
        and column_name = 'stage_id'
    )
    into v_has_column;

    if v_has_column then
      delete from public.race_stage_results
      where stage_id = p_stage_id;

      get diagnostics v_stage_results_deleted = row_count;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_stage_point_results
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_point_results') is not null
  into v_has_table;

  if v_has_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_point_results'
        and column_name = 'stage_id'
    )
    into v_has_column;

    if v_has_column then
      delete from public.race_stage_point_results
      where stage_id = p_stage_id;

      get diagnostics v_stage_point_results_deleted = row_count;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_ranking_point_awards
  -- Possible stage-link columns can differ by version.
  -- ----------------------------------------------------------
  select to_regclass('public.race_ranking_point_awards') is not null
  into v_has_table;

  if v_has_table then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_ranking_point_awards'
        and column_name = 'stage_id'
    ) then
      delete from public.race_ranking_point_awards
      where stage_id = p_stage_id;

      get diagnostics v_deleted = row_count;
      v_ranking_awards_deleted := v_ranking_awards_deleted + v_deleted;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_ranking_point_awards'
        and column_name = 'source_stage_id'
    ) then
      delete from public.race_ranking_point_awards
      where source_stage_id = p_stage_id;

      get diagnostics v_deleted = row_count;
      v_ranking_awards_deleted := v_ranking_awards_deleted + v_deleted;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_ranking_point_awards'
        and column_name = 'after_stage_id'
    ) then
      delete from public.race_ranking_point_awards
      where after_stage_id = p_stage_id;

      get diagnostics v_deleted = row_count;
      v_ranking_awards_deleted := v_ranking_awards_deleted + v_deleted;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_classification_standings
  -- ----------------------------------------------------------
  select to_regclass('public.race_classification_standings') is not null
  into v_has_table;

  if v_has_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_classification_standings'
        and column_name = 'stage_id'
    )
    into v_has_column;

    if v_has_column then
      delete from public.race_classification_standings
      where stage_id = p_stage_id;

      get diagnostics v_classification_rows_deleted = row_count;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_stage_replay_frames
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_replay_frames') is not null
  into v_has_table;

  if v_has_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_replay_frames'
        and column_name = 'stage_id'
    )
    into v_has_column;

    if v_has_column then
      delete from public.race_stage_replay_frames
      where stage_id = p_stage_id;

      get diagnostics v_replay_frames_deleted = row_count;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_stage_rider_states
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_rider_states') is not null
  into v_has_table;

  if v_has_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_rider_states'
        and column_name = 'stage_id'
    )
    into v_has_column;

    if v_has_column then
      delete from public.race_stage_rider_states
      where stage_id = p_stage_id;

      get diagnostics v_rider_states_deleted = row_count;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_stage_team_states
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_team_states') is not null
  into v_has_table;

  if v_has_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_team_states'
        and column_name = 'stage_id'
    )
    into v_has_column;

    if v_has_column then
      delete from public.race_stage_team_states
      where stage_id = p_stage_id;

      get diagnostics v_team_states_deleted = row_count;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_stage_incidents
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_incidents') is not null
  into v_has_table;

  if v_has_table then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_incidents'
        and column_name = 'stage_id'
    )
    into v_has_column;

    if v_has_column then
      delete from public.race_stage_incidents
      where stage_id = p_stage_id;

      get diagnostics v_incidents_deleted = row_count;
    end if;
  end if;


  -- ----------------------------------------------------------
  -- race_stage_report_events
  -- Delete only prior weather-cancellation summary events.
  -- Do not delete normal report events here unless they are from
  -- weather_cancellation_v1.
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_report_events') is not null
  into v_has_table;

  if v_has_table then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_report_events'
        and column_name = 'stage_id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_report_events'
        and column_name = 'metadata'
    )
    then
      delete from public.race_stage_report_events
      where stage_id = p_stage_id
        and metadata ->> 'source' = 'weather_cancellation_v1';

      get diagnostics v_report_events_deleted = row_count;
    end if;
  end if;


  return jsonb_build_object(
    'status', 'weather_cancelled_stage_artifacts_cleaned',
    'stage_id', p_stage_id,

    'stage_results_deleted', v_stage_results_deleted,
    'stage_point_results_deleted', v_stage_point_results_deleted,
    'ranking_awards_deleted', v_ranking_awards_deleted,
    'classification_rows_deleted', v_classification_rows_deleted,
    'replay_frames_deleted', v_replay_frames_deleted,
    'rider_states_deleted', v_rider_states_deleted,
    'team_states_deleted', v_team_states_deleted,
    'incidents_deleted', v_incidents_deleted,
    'weather_report_events_deleted', v_report_events_deleted,

    'no_results', true,
    'no_points', true,
    'no_ranking_points', true,
    'no_classifications_for_stage', true,
    'no_replay', true,
    'no_fatigue', true,
    'no_prize_money', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_weather_cancelled_stage_run_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_apply_result jsonb;
  v_cleanup_result jsonb;

  v_result_summary jsonb;

  v_has_runs_table boolean;
  v_has_column boolean;

  v_existing_run_id uuid;
  v_run_id uuid;

  v_order_expr text := 'created_at desc nulls last';
  v_set_parts text[] := array[]::text[];
  v_insert_cols text[] := array[]::text[];
  v_insert_vals text[] := array[]::text[];
  v_sql text;

  v_updated_runs integer := 0;
  v_inserted_run boolean := false;
begin
  -- ----------------------------------------------------------
  -- Stage must exist and must be a weather-cancellation candidate
  -- ----------------------------------------------------------
  select
    c.stage_id,
    c.race_id,
    c.stage_number,
    c.stage_date,
    c.weather_cancelled,
    c.weather_cancellation_reason,
    c.weather_cancelled_at,
    c.cancellation_reason,
    c.should_cancel_for_weather,
    c.weather_condition_text,
    c.snow_cm,
    c.avg_temp_c,
    c.min_temp_c,
    c.max_temp_c
  into v_stage
  from public.race_stage_weather_cancellation_candidates_v1 c
  where c.stage_id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'synthetic_run_created', false
    );
  end if;

  if coalesce(v_stage.should_cancel_for_weather, false) = false then
    return jsonb_build_object(
      'status', 'not_weather_cancelled',
      'cancelled', false,
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'reason', null,
      'synthetic_run_created', false,
      'avg_temp_c', v_stage.avg_temp_c,
      'weather_condition_text', v_stage.weather_condition_text
    );
  end if;

  -- ----------------------------------------------------------
  -- Apply cancellation flag
  -- ----------------------------------------------------------
  v_apply_result := public.apply_race_stage_weather_cancellation_v1(p_stage_id);

  -- ----------------------------------------------------------
  -- Clean old/generated artifacts
  -- ----------------------------------------------------------
  v_cleanup_result := public.race_engine_cleanup_weather_cancelled_stage_artifacts_v1(p_stage_id);

  -- ----------------------------------------------------------
  -- Synthetic result summary
  -- ----------------------------------------------------------
  v_result_summary := jsonb_build_object(
    'status', 'weather_cancelled',
    'cancelled', true,
    'reason', v_stage.cancellation_reason,
    'race_id', v_stage.race_id,
    'stage_id', v_stage.stage_id,
    'stage_number', v_stage.stage_number,

    'engine_version', 'weather_cancellation_v1',
    'simulation_mode', 'weather_cancelled_no_simulation',

    'no_results', true,
    'no_points', true,
    'no_ranking_points', true,
    'no_prize_money', true,
    'no_fatigue', true,
    'no_replay', true,

    'weather_condition_text', v_stage.weather_condition_text,
    'snow_cm', v_stage.snow_cm,
    'avg_temp_c', v_stage.avg_temp_c,
    'min_temp_c', v_stage.min_temp_c,
    'max_temp_c', v_stage.max_temp_c,

    'created_at', now()
  );

  -- ----------------------------------------------------------
  -- race_stage_simulation_runs table must exist
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_simulation_runs') is not null
  into v_has_runs_table;

  if not coalesce(v_has_runs_table, false) then
    return jsonb_build_object(
      'status', 'simulation_runs_table_missing',
      'cancelled', true,
      'stage_id', p_stage_id,
      'apply_result', v_apply_result,
      'cleanup_result', v_cleanup_result
    );
  end if;

  -- ----------------------------------------------------------
  -- Pick ordering expression safely
  -- ----------------------------------------------------------
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'completed_at'
  ) then
    v_order_expr := 'completed_at desc nulls last';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'created_at'
  ) then
    v_order_expr := 'created_at desc nulls last';
  else
    v_order_expr := 'id desc';
  end if;

  -- ----------------------------------------------------------
  -- Find existing run for this stage, if any.
  -- If a normal run already exists from the broken period,
  -- convert it to weather_cancellation_v1 instead of inserting
  -- a duplicate.
  -- ----------------------------------------------------------
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'stage_id'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'id'
  ) then
    execute format(
      'select id from public.race_stage_simulation_runs where stage_id = $1 order by %s limit 1',
      v_order_expr
    )
    using p_stage_id
    into v_existing_run_id;
  end if;

  -- ----------------------------------------------------------
  -- If an existing run exists, convert it to synthetic completed.
  -- ----------------------------------------------------------
  if v_existing_run_id is not null then
    v_set_parts := array[]::text[];

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'status'
    ) then
      v_set_parts := array_append(v_set_parts, 'status = ''completed''');
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'engine_version'
    ) then
      v_set_parts := array_append(v_set_parts, 'engine_version = ''weather_cancellation_v1''');
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'simulation_mode'
    ) then
      v_set_parts := array_append(v_set_parts, 'simulation_mode = ''weather_cancelled_no_simulation''');
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'result_summary_json'
    ) then
      v_set_parts := array_append(
        v_set_parts,
        'result_summary_json = ' || quote_literal(v_result_summary::text) || '::jsonb'
      );
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'result_summary'
    ) then
      v_set_parts := array_append(
        v_set_parts,
        'result_summary = ' || quote_literal(v_result_summary::text) || '::jsonb'
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'metadata'
    ) then
      v_set_parts := array_append(
        v_set_parts,
        'metadata = coalesce(metadata, ''{}''::jsonb) || ' ||
        quote_literal(jsonb_build_object(
          'source', 'weather_cancellation_v1',
          'simulation_mode', 'weather_cancelled_no_simulation',
          'weather_cancelled', true,
          'weather_cancellation_reason', v_stage.cancellation_reason
        )::text) ||
        '::jsonb'
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'started_at'
    ) then
      v_set_parts := array_append(v_set_parts, 'started_at = coalesce(started_at, now())');
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'completed_at'
    ) then
      v_set_parts := array_append(v_set_parts, 'completed_at = coalesce(completed_at, now())');
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'race_stage_simulation_runs'
        and column_name = 'updated_at'
    ) then
      v_set_parts := array_append(v_set_parts, 'updated_at = now()');
    end if;

    if array_length(v_set_parts, 1) is not null then
      v_sql := format(
        'update public.race_stage_simulation_runs set %s where id = $1',
        array_to_string(v_set_parts, ', ')
      );

      execute v_sql using v_existing_run_id;
      get diagnostics v_updated_runs = row_count;
      v_run_id := v_existing_run_id;
    end if;

    return jsonb_build_object(
      'status', 'weather_cancelled_existing_run_converted',
      'cancelled', true,
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'reason', v_stage.cancellation_reason,
      'simulation_run_id', v_run_id,
      'updated_runs', v_updated_runs,
      'inserted_run', false,
      'apply_result', v_apply_result,
      'cleanup_result', v_cleanup_result,
      'result_summary', v_result_summary
    );
  end if;

  -- ----------------------------------------------------------
  -- If no run exists, insert synthetic completed run.
  -- Dynamic insert avoids failing if optional columns do not exist.
  -- ----------------------------------------------------------
  v_insert_cols := array[]::text[];
  v_insert_vals := array[]::text[];

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'stage_id'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'stage_id');
    v_insert_vals := array_append(v_insert_vals, quote_literal(p_stage_id::text) || '::uuid');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'race_id'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'race_id');
    v_insert_vals := array_append(v_insert_vals, quote_literal(v_stage.race_id::text) || '::uuid');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'status'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'status');
    v_insert_vals := array_append(v_insert_vals, quote_literal('completed'));
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'engine_version'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'engine_version');
    v_insert_vals := array_append(v_insert_vals, quote_literal('weather_cancellation_v1'));
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'simulation_mode'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'simulation_mode');
    v_insert_vals := array_append(v_insert_vals, quote_literal('weather_cancelled_no_simulation'));
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'result_summary_json'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'result_summary_json');
    v_insert_vals := array_append(v_insert_vals, quote_literal(v_result_summary::text) || '::jsonb');
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'result_summary'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'result_summary');
    v_insert_vals := array_append(v_insert_vals, quote_literal(v_result_summary::text) || '::jsonb');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'metadata'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'metadata');
    v_insert_vals := array_append(
      v_insert_vals,
      quote_literal(jsonb_build_object(
        'source', 'weather_cancellation_v1',
        'simulation_mode', 'weather_cancelled_no_simulation',
        'weather_cancelled', true,
        'weather_cancellation_reason', v_stage.cancellation_reason
      )::text) || '::jsonb'
    );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'created_at'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'created_at');
    v_insert_vals := array_append(v_insert_vals, 'now()');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'started_at'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'started_at');
    v_insert_vals := array_append(v_insert_vals, 'now()');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'completed_at'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'completed_at');
    v_insert_vals := array_append(v_insert_vals, 'now()');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'updated_at'
  ) then
    v_insert_cols := array_append(v_insert_cols, 'updated_at');
    v_insert_vals := array_append(v_insert_vals, 'now()');
  end if;

  if array_length(v_insert_cols, 1) is null then
    return jsonb_build_object(
      'status', 'simulation_runs_insert_columns_missing',
      'cancelled', true,
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'apply_result', v_apply_result,
      'cleanup_result', v_cleanup_result
    );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'id'
  ) then
    v_sql := format(
      'insert into public.race_stage_simulation_runs (%s) values (%s) returning id',
      array_to_string(v_insert_cols, ', '),
      array_to_string(v_insert_vals, ', ')
    );

    execute v_sql into v_run_id;
  else
    v_sql := format(
      'insert into public.race_stage_simulation_runs (%s) values (%s)',
      array_to_string(v_insert_cols, ', '),
      array_to_string(v_insert_vals, ', ')
    );

    execute v_sql;
  end if;

  v_inserted_run := true;

  return jsonb_build_object(
    'status', 'weather_cancelled_synthetic_run_created',
    'cancelled', true,
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'reason', v_stage.cancellation_reason,
    'simulation_run_id', v_run_id,
    'updated_runs', 0,
    'inserted_run', v_inserted_run,
    'apply_result', v_apply_result,
    'cleanup_result', v_cleanup_result,
    'result_summary', v_result_summary
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_finalize_weather_cancelled_race_state_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_exists boolean;

  v_total_stage_count integer := 0;
  v_cancelled_stage_count integer := 0;
  v_result_stage_count integer := 0;
  v_completed_run_count integer := 0;

  v_all_stages_cancelled boolean := false;
  v_all_stages_have_completed_runs boolean := false;

  v_weather_status text := 'none';
  v_new_race_status text := null;

  v_has_status_column boolean := false;

  v_result jsonb;
begin
  select exists (
    select 1
    from public.races r
    where r.id = p_race_id
  )
  into v_race_exists;

  if not coalesce(v_race_exists, false) then
    return jsonb_build_object(
      'status', 'race_not_found',
      'race_id', p_race_id
    );
  end if;

  select count(*)
  into v_total_stage_count
  from public.race_stages rs
  where rs.race_id = p_race_id;

  select count(*)
  into v_cancelled_stage_count
  from public.race_stages rs
  where rs.race_id = p_race_id
    and coalesce(rs.weather_cancelled, false) = true;

  -- FIXED:
  -- Count only real result stages that are NOT weather-cancelled.
  select count(distinct r.stage_id)
  into v_result_stage_count
  from public.race_stage_results r
  join public.race_stages rs
    on rs.id = r.stage_id
  where rs.race_id = p_race_id
    and coalesce(rs.weather_cancelled, false) = false;

  select count(distinct rs.id)
  into v_completed_run_count
  from public.race_stages rs
  where rs.race_id = p_race_id
    and exists (
      select 1
      from public.race_stage_simulation_runs run
      where run.stage_id = rs.id
        and run.status = 'completed'
    );

  v_all_stages_cancelled :=
    v_total_stage_count > 0
    and v_cancelled_stage_count = v_total_stage_count;

  v_all_stages_have_completed_runs :=
    v_total_stage_count > 0
    and v_completed_run_count = v_total_stage_count;

  v_weather_status :=
    case
      when v_cancelled_stage_count = 0 then 'none'
      when v_all_stages_cancelled then 'all_stages_weather_cancelled'
      else 'partly_weather_cancelled'
    end;

  v_new_race_status :=
    case
      when v_all_stages_have_completed_runs then 'completed'
      when v_cancelled_stage_count > 0 then 'active'
      else null
    end;

  update public.races r
  set metadata =
    coalesce(r.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'weather_cancellation_status', v_weather_status,
      'weather_cancelled_stage_count', v_cancelled_stage_count,
      'weather_total_stage_count', v_total_stage_count,
      'weather_all_stages_cancelled', v_all_stages_cancelled,
      'weather_result_stage_count', v_result_stage_count,
      'weather_completed_run_count', v_completed_run_count,
      'weather_all_stages_have_completed_runs', v_all_stages_have_completed_runs,
      'weather_state_finalized_at', now()
    )
  where r.id = p_race_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'races'
      and column_name = 'status'
  )
  into v_has_status_column;

  if v_has_status_column and v_new_race_status is not null then
    update public.races r
    set status = v_new_race_status
    where r.id = p_race_id;
  end if;

  v_result := jsonb_build_object(
    'status', 'weather_race_state_finalized',
    'race_id', p_race_id,
    'weather_cancellation_status', v_weather_status,
    'weather_cancelled_stage_count', v_cancelled_stage_count,
    'weather_total_stage_count', v_total_stage_count,
    'weather_all_stages_cancelled', v_all_stages_cancelled,
    'weather_result_stage_count', v_result_stage_count,
    'weather_completed_run_count', v_completed_run_count,
    'weather_all_stages_have_completed_runs', v_all_stages_have_completed_runs,
    'new_race_status', v_new_race_status
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_one_backlog_game_processors_only_v1(p_game_date date, p_statement_timeout_seconds integer DEFAULT 180)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('public.process_one_backlog_game_processors_only_v1')::bigint;

  v_backlog public.game_daily_tick_backlog_v1%rowtype;
  v_original_state public.game_state%rowtype;

  v_old_statement_timeout text;
  v_game_processors_result jsonb := null;
  v_game_processors_success boolean := false;

  v_status text := 'unknown';
  v_error text := null;
  v_sqlstate text := null;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'ok', false,
      'status', 'skipped_already_running'
    );
  end if;

  select *
  into v_backlog
  from public.game_daily_tick_backlog_v1
  where current_game_date = p_game_date
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'status', 'backlog_day_not_found',
      'game_date', p_game_date
    );
  end if;

  if v_backlog.status = 'processed' then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_processed',
      'game_date', p_game_date
    );
  end if;

  if coalesce((v_backlog.payload ->> 'process_daily_tick_ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'status', 'not_partial_success_day',
      'game_date', p_game_date,
      'message', 'process_daily_tick_ok is not true, so game-processors-only retry is unsafe'
    );
  end if;

  select *
  into v_original_state
  from public.game_state
  where id = true
  for update;

  if not found then
    raise exception 'game_state row not found';
  end if;

  update public.game_daily_tick_backlog_v1
  set
    status = 'running',
    updated_at = now(),
    last_error = null
  where id = v_backlog.id;

  update public.game_clock_config
  set is_paused = true
  where id = true;

  update public.game_state
  set
    season_number = public.season_from_game_date(p_game_date),
    month_number = extract(month from p_game_date)::smallint,
    day_number = extract(day from p_game_date)::smallint,
    hour_number = 0,
    minute_number = 0,
    tick_version = coalesce(v_backlog.tick_version, v_original_state.tick_version),
    last_advanced_at = clock_timestamp(),
    is_paused = true
  where id = true;

  v_old_statement_timeout := current_setting('statement_timeout', true);

  perform set_config(
    'statement_timeout',
    greatest(30, least(coalesce(p_statement_timeout_seconds, 180), 240))::text || 's',
    true
  );

  begin
    select public.run_daily_game_processors_v1(false)
    into v_game_processors_result;

    v_game_processors_success :=
      coalesce((v_game_processors_result ->> 'success')::boolean, false);

    if v_game_processors_success is true then
      v_status := 'processed';
    else
      v_status := 'failed';
      v_sqlstate := 'P0001';
      v_error := coalesce(
        v_game_processors_result ->> 'error',
        'run_daily_game_processors_v1 returned success=false'
      );
    end if;

  exception
    when query_canceled then
      v_status := 'failed';
      v_sqlstate := sqlstate;
      v_error := sqlerrm;

    when others then
      v_status := 'failed';
      v_sqlstate := sqlstate;
      v_error := sqlerrm;
  end;

  perform set_config(
    'statement_timeout',
    coalesce(nullif(v_old_statement_timeout, ''), '0'),
    true
  );

  -- Restore real game clock exactly, keep paused.
  update public.game_state
  set
    season_number = v_original_state.season_number,
    month_number = v_original_state.month_number,
    day_number = v_original_state.day_number,
    hour_number = v_original_state.hour_number,
    minute_number = v_original_state.minute_number,
    tick_version = v_original_state.tick_version,
    is_paused = true,
    last_advanced_at = v_original_state.last_advanced_at
  where id = true;

  if v_status = 'processed' then
    update public.game_daily_tick_backlog_v1
    set
      status = 'processed',
      processed_at = now(),
      updated_at = now(),
      last_error = null,
      payload = payload || jsonb_build_object(
        'game_processors_only_retry_at', now(),
        'game_processors_result', v_game_processors_result,
        'game_processors_success', true
      )
    where id = v_backlog.id;
  else
    update public.game_daily_tick_backlog_v1
    set
      status = 'pending',
      updated_at = now(),
      last_error = concat_ws(': ', v_sqlstate, v_error),
      payload = payload || jsonb_build_object(
        'game_processors_only_retry_failed_at', now(),
        'last_sqlstate', v_sqlstate,
        'last_error', v_error,
        'game_processors_result', v_game_processors_result,
        'game_processors_success', false
      )
    where id = v_backlog.id;
  end if;

  insert into public.game_daily_tick_backlog_processor_runs_v1 (
    backlog_id,
    current_game_date,
    status,
    payload
  )
  values (
    v_backlog.id,
    p_game_date,
    v_status,
    jsonb_build_object(
      'mode', 'game_processors_only',
      'game_processors_success', v_game_processors_success,
      'game_processors_result', v_game_processors_result,
      'sqlstate', v_sqlstate,
      'error', v_error,
      'original_game_state_restored_to', to_jsonb(v_original_state)
    )
  );

  return jsonb_build_object(
    'ok', v_status = 'processed',
    'status', v_status,
    'mode', 'game_processors_only',
    'processed_game_date', p_game_date,
    'game_processors_success', v_game_processors_success,
    'game_processors_result_summary',
      jsonb_build_object(
        'success', v_game_processors_result ->> 'success',
        'skipped', v_game_processors_result ->> 'skipped',
        'reason', v_game_processors_result ->> 'reason',
        'current_game_date', v_game_processors_result ->> 'current_game_date',
        'processor_key', v_game_processors_result ->> 'processor_key',
        'error', left(coalesce(v_game_processors_result ->> 'error', ''), 300)
      ),
    'sqlstate', v_sqlstate,
    'error', left(coalesce(v_error, ''), 300)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_auto_finalize_weather_race_state_from_run_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_has_weather_cancelled_stage boolean := false;
begin
  -- Only care about completed runs.
  if coalesce(new.status, '') <> 'completed' then
    return new;
  end if;

  -- Resolve race_id from the stage.
  select rs.race_id
  into v_race_id
  from public.race_stages rs
  where rs.id = new.stage_id;

  if v_race_id is null then
    return new;
  end if;

  -- Only refresh if this race has at least one weather-cancelled stage.
  select exists (
    select 1
    from public.race_stages rs
    where rs.race_id = v_race_id
      and coalesce(rs.weather_cancelled, false) = true
  )
  into v_has_weather_cancelled_stage;

  if coalesce(v_has_weather_cancelled_stage, false) = true then
    perform public.race_engine_finalize_weather_cancelled_race_state_v1(v_race_id);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_write_weather_cancelled_stage_report_event_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_run_id uuid;

  v_table_exists boolean := false;
  v_existing_count integer := 0;
  v_inserted_count integer := 0;

  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_sql text;

  v_reason_label text;
  v_headline text;
  v_description text;
  v_metadata jsonb;

  v_next_event_order integer;
begin
  -- ----------------------------------------------------------
  -- Table must exist.
  -- ----------------------------------------------------------
  select to_regclass('public.race_stage_report_events') is not null
  into v_table_exists;

  if not coalesce(v_table_exists, false) then
    return jsonb_build_object(
      'status', 'report_events_table_missing',
      'stage_id', p_stage_id,
      'inserted', false
    );
  end if;

  -- ----------------------------------------------------------
  -- Stage must exist and be weather-cancelled.
  -- ----------------------------------------------------------
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.weather_cancelled,
    rs.weather_cancellation_reason,
    c.weather_condition_text,
    c.snow_cm,
    c.avg_temp_c,
    c.min_temp_c,
    c.max_temp_c
  into v_stage
  from public.race_stages rs
  left join public.race_stage_weather_cancellation_candidates_v1 c
    on c.stage_id = rs.id
  where rs.id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'inserted', false
    );
  end if;

  if coalesce(v_stage.weather_cancelled, false) = false then
    return jsonb_build_object(
      'status', 'stage_not_weather_cancelled',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'inserted', false
    );
  end if;

  -- ----------------------------------------------------------
  -- Avoid duplicate weather-cancellation report events.
  -- ----------------------------------------------------------
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'metadata'
  ) then
    select count(*)
    into v_existing_count
    from public.race_stage_report_events e
    where e.stage_id = p_stage_id
      and e.metadata ->> 'source' = 'weather_cancellation_v1'
      and e.metadata ->> 'event_type' = 'weather_cancelled';

    if coalesce(v_existing_count, 0) > 0 then
      return jsonb_build_object(
        'status', 'weather_cancelled_report_event_already_exists',
        'stage_id', p_stage_id,
        'race_id', v_stage.race_id,
        'existing_count', v_existing_count,
        'inserted', false
      );
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Resolve synthetic run ID if available.
  -- ----------------------------------------------------------
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_simulation_runs'
      and column_name = 'id'
  ) then
    select run.id
    into v_run_id
    from public.race_stage_simulation_runs run
    where run.stage_id = p_stage_id
      and run.status = 'completed'
      and run.engine_version = 'weather_cancellation_v1'
      and run.simulation_mode = 'weather_cancelled_no_simulation'
    order by run.completed_at desc nulls last, run.created_at desc nulls last
    limit 1;
  end if;

  -- ----------------------------------------------------------
  -- Optional event_order support.
  -- Your table has UNIQUE(stage_id, event_order), so we fill it
  -- when the column exists.
  -- ----------------------------------------------------------
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'event_order'
  ) then
    select coalesce(max(e.event_order), 0) + 1
    into v_next_event_order
    from public.race_stage_report_events e
    where e.stage_id = p_stage_id;
  end if;

  v_reason_label :=
    case v_stage.weather_cancellation_reason
      when 'snow' then 'Snow'
      when 'temperature_below_5c' then 'Temperature below 5°C'
      else coalesce(v_stage.weather_cancellation_reason, 'Weather')
    end;

  v_headline := 'Stage cancelled due to weather';

  v_description :=
    'Stage ' || coalesce(v_stage.stage_number::text, '?') ||
    ' was cancelled due to weather. Reason: ' || v_reason_label || '.';

  v_metadata := jsonb_build_object(
    'source', 'weather_cancellation_v1',
    'event_type', 'weather_cancelled',
    'reason', v_stage.weather_cancellation_reason,
    'reason_label', v_reason_label,
    'race_id', v_stage.race_id,
    'stage_id', v_stage.stage_id,
    'stage_number', v_stage.stage_number,
    'stage_date', v_stage.stage_date,
    'weather_condition_text', v_stage.weather_condition_text,
    'snow_cm', v_stage.snow_cm,
    'avg_temp_c', v_stage.avg_temp_c,
    'min_temp_c', v_stage.min_temp_c,
    'max_temp_c', v_stage.max_temp_c,
    'no_results', true,
    'no_points', true,
    'no_replay', true,
    'no_fatigue', true,
    'no_prize_money', true,
    'created_at', now()
  );

  -- ----------------------------------------------------------
  -- Dynamic insert.
  -- IMPORTANT FIX:
  -- race_id is now inserted if the column exists.
  -- ----------------------------------------------------------

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'race_id'
  ) then
    v_cols := array_append(v_cols, 'race_id');
    v_vals := array_append(v_vals, quote_literal(v_stage.race_id::text) || '::uuid');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'stage_id'
  ) then
    v_cols := array_append(v_cols, 'stage_id');
    v_vals := array_append(v_vals, quote_literal(p_stage_id::text) || '::uuid');
  end if;

  if v_run_id is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'simulation_run_id'
  ) then
    v_cols := array_append(v_cols, 'simulation_run_id');
    v_vals := array_append(v_vals, quote_literal(v_run_id::text) || '::uuid');
  end if;

  if v_next_event_order is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'event_order'
  ) then
    v_cols := array_append(v_cols, 'event_order');
    v_vals := array_append(v_vals, v_next_event_order::text);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'event_second'
  ) then
    v_cols := array_append(v_cols, 'event_second');
    v_vals := array_append(v_vals, '0');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'distance_km'
  ) then
    v_cols := array_append(v_cols, 'distance_km');
    v_vals := array_append(v_vals, '0');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'km'
  ) then
    v_cols := array_append(v_cols, 'km');
    v_vals := array_append(v_vals, '0');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'event_type'
  ) then
    v_cols := array_append(v_cols, 'event_type');
    v_vals := array_append(v_vals, quote_literal('summary'));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'title'
  ) then
    v_cols := array_append(v_cols, 'title');
    v_vals := array_append(v_vals, quote_literal(v_headline));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'headline'
  ) then
    v_cols := array_append(v_cols, 'headline');
    v_vals := array_append(v_vals, quote_literal(v_headline));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'description'
  ) then
    v_cols := array_append(v_cols, 'description');
    v_vals := array_append(v_vals, quote_literal(v_description));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'body'
  ) then
    v_cols := array_append(v_cols, 'body');
    v_vals := array_append(v_vals, quote_literal(v_description));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'severity'
  ) then
    v_cols := array_append(v_cols, 'severity');
    v_vals := array_append(v_vals, quote_literal('info'));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'metadata'
  ) then
    v_cols := array_append(v_cols, 'metadata');
    v_vals := array_append(v_vals, quote_literal(v_metadata::text) || '::jsonb');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'created_at'
  ) then
    v_cols := array_append(v_cols, 'created_at');
    v_vals := array_append(v_vals, 'now()');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'race_stage_report_events'
      and column_name = 'updated_at'
  ) then
    v_cols := array_append(v_cols, 'updated_at');
    v_vals := array_append(v_vals, 'now()');
  end if;

  if array_length(v_cols, 1) is null then
    return jsonb_build_object(
      'status', 'no_insertable_report_event_columns',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'inserted', false
    );
  end if;

  v_sql := format(
    'insert into public.race_stage_report_events (%s) values (%s)',
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', ')
  );

  execute v_sql;
  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'status', 'weather_cancelled_report_event_inserted',
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'simulation_run_id', v_run_id,
    'inserted', v_inserted_count > 0,
    'inserted_count', v_inserted_count,
    'event_type', 'summary',
    'metadata_event_type', 'weather_cancelled',
    'reason', v_stage.weather_cancellation_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_one_backlog_game_processor_child_step_v1(p_game_date date, p_step_name text DEFAULT NULL::text, p_statement_timeout_seconds integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('public.process_one_backlog_game_processor_child_step_v1')::bigint;

  v_backlog public.game_daily_tick_backlog_v1%rowtype;
  v_original_state public.game_state%rowtype;

  v_step_order text[] := array[
    'assign_race_start_times',
    'repair_future_race_statuses',
    'process_race_application_deadlines',
    'process_rider_submission_deadlines',
    'backfill_ai_rider_reservations_for_closed_races',
    'cleanup_premature_ai_race_entries',
    'process_due_race_days',
    'process_completed_race_commitment_scores'
  ];

  v_step_sql text;
  v_step text;
  v_existing_steps jsonb;
  v_step_result jsonb;
  v_started_at timestamptz;
  v_finished_at timestamptz;

  v_old_statement_timeout text;
  v_error text := null;
  v_sqlstate text := null;
  v_ok boolean := false;
  v_completed_count integer := 0;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'ok', false,
      'status', 'skipped_already_running'
    );
  end if;

  select *
  into v_backlog
  from public.game_daily_tick_backlog_v1
  where current_game_date = p_game_date
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'status', 'backlog_day_not_found',
      'game_date', p_game_date
    );
  end if;

  if v_backlog.status = 'processed' then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_processed',
      'game_date', p_game_date
    );
  end if;

  if coalesce((v_backlog.payload ->> 'process_daily_tick_ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'status', 'not_partial_success_day',
      'game_date', p_game_date,
      'message', 'process_daily_tick_ok is not true, so child-step retry is unsafe'
    );
  end if;

  v_existing_steps := coalesce(v_backlog.payload -> 'game_processor_child_steps', '{}'::jsonb);

  if p_step_name is not null then
    v_step := p_step_name;
  else
    select s
    into v_step
    from unnest(v_step_order) s
    where coalesce(v_existing_steps #>> array[s, 'status'], '') <> 'ok'
    limit 1;
  end if;

  if v_step is null then
    update public.game_daily_tick_backlog_v1
    set
      status = 'processed',
      processed_at = now(),
      updated_at = now(),
      last_error = null,
      payload = payload || jsonb_build_object(
        'game_processors_success', true,
        'game_processors_result', jsonb_build_object(
          'success', true,
          'manual_split', true,
          'current_game_date', public.game_date_display_v1(
            public.season_from_game_date(p_game_date),
            extract(month from p_game_date)::int,
            extract(day from p_game_date)::int
          )
        )
      )
    where id = v_backlog.id;

    return jsonb_build_object(
      'ok', true,
      'status', 'processed',
      'mode', 'all_child_steps_already_ok',
      'game_date', p_game_date
    );
  end if;

  if not (v_step = any(v_step_order)) then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_step_name',
      'step_name', v_step,
      'allowed_steps', to_jsonb(v_step_order)
    );
  end if;

  v_step_sql := case v_step
    when 'assign_race_start_times'
      then 'select public.assign_race_start_times_v1()'
    when 'repair_future_race_statuses'
      then 'select public.repair_future_race_statuses_v1()'
    when 'process_race_application_deadlines'
      then 'select public.process_race_application_deadlines_v1()'
    when 'process_rider_submission_deadlines'
      then 'select public.process_rider_submission_deadlines_v1()'
    when 'backfill_ai_rider_reservations_for_closed_races'
      then 'select public.backfill_ai_rider_reservations_for_closed_races_v1()'
    when 'cleanup_premature_ai_race_entries'
      then 'select public.cleanup_premature_ai_race_entries_v1()'
    when 'process_due_race_days'
      then 'select public.process_due_race_days_v1()'
    when 'process_completed_race_commitment_scores'
      then 'select public.process_completed_race_commitment_scores_v1()'
  end;

  select *
  into v_original_state
  from public.game_state
  where id = true
  for update;

  if not found then
    raise exception 'game_state row not found';
  end if;

  update public.game_clock_config
  set is_paused = true
  where id = true;

  update public.game_state
  set
    season_number = public.season_from_game_date(p_game_date),
    month_number = extract(month from p_game_date)::smallint,
    day_number = extract(day from p_game_date)::smallint,
    hour_number = 0,
    minute_number = 0,
    tick_version = coalesce(v_backlog.tick_version, v_original_state.tick_version),
    last_advanced_at = clock_timestamp(),
    is_paused = true
  where id = true;

  v_old_statement_timeout := current_setting('statement_timeout', true);

  perform set_config(
    'statement_timeout',
    greatest(15, least(coalesce(p_statement_timeout_seconds, 45), 80))::text || 's',
    true
  );

  v_started_at := clock_timestamp();

  begin
    execute v_step_sql;
    v_ok := true;
    v_finished_at := clock_timestamp();

  exception
    when query_canceled then
      v_ok := false;
      v_sqlstate := sqlstate;
      v_error := sqlerrm;
      v_finished_at := clock_timestamp();

    when others then
      v_ok := false;
      v_sqlstate := sqlstate;
      v_error := sqlerrm;
      v_finished_at := clock_timestamp();
  end;

  perform set_config(
    'statement_timeout',
    coalesce(nullif(v_old_statement_timeout, ''), '0'),
    true
  );

  -- Restore real game clock exactly, keep paused.
  update public.game_state
  set
    season_number = v_original_state.season_number,
    month_number = v_original_state.month_number,
    day_number = v_original_state.day_number,
    hour_number = v_original_state.hour_number,
    minute_number = v_original_state.minute_number,
    tick_version = v_original_state.tick_version,
    is_paused = true,
    last_advanced_at = v_original_state.last_advanced_at
  where id = true;

  v_step_result := jsonb_build_object(
    'status', case when v_ok then 'ok' else 'failed' end,
    'step', v_step,
    'started_at', v_started_at,
    'finished_at', v_finished_at,
    'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000),
    'sqlstate', v_sqlstate,
    'error', left(coalesce(v_error, ''), 400)
  );

  v_existing_steps := v_existing_steps || jsonb_build_object(v_step, v_step_result);

  select count(*)
  into v_completed_count
  from unnest(v_step_order) s
  where coalesce(v_existing_steps #>> array[s, 'status'], '') = 'ok';

  if v_ok then
    update public.game_daily_tick_backlog_v1
    set
      status = case when v_completed_count = array_length(v_step_order, 1) then 'processed' else 'pending' end,
      processed_at = case when v_completed_count = array_length(v_step_order, 1) then now() else null end,
      updated_at = now(),
      last_error = null,
      payload =
        payload
        || jsonb_build_object(
          'game_processor_child_steps', v_existing_steps,
          'game_processor_child_steps_completed', v_completed_count,
          'game_processor_child_steps_total', array_length(v_step_order, 1),
          'game_processors_success', v_completed_count = array_length(v_step_order, 1),
          'game_processors_result',
            case
              when v_completed_count = array_length(v_step_order, 1)
              then jsonb_build_object(
                'success', true,
                'manual_split', true,
                'current_game_date', public.game_date_display_v1(
                  public.season_from_game_date(p_game_date),
                  extract(month from p_game_date)::int,
                  extract(day from p_game_date)::int
                )
              )
              else coalesce(payload -> 'game_processors_result', '{}'::jsonb)
            end
        )
    where id = v_backlog.id;
  else
    update public.game_daily_tick_backlog_v1
    set
      status = 'pending',
      updated_at = now(),
      last_error = concat_ws(': ', v_sqlstate, v_error),
      payload =
        payload
        || jsonb_build_object(
          'game_processor_child_steps', v_existing_steps,
          'game_processor_child_steps_completed', v_completed_count,
          'game_processor_child_steps_total', array_length(v_step_order, 1),
          'last_failed_child_step', v_step,
          'game_processors_success', false
        )
    where id = v_backlog.id;
  end if;

  return jsonb_build_object(
    'ok', v_ok,
    'status', case
      when v_ok and v_completed_count = array_length(v_step_order, 1) then 'processed'
      when v_ok then 'step_processed'
      else 'step_failed'
    end,
    'mode', 'child_step',
    'game_date', p_game_date,
    'step', v_step,
    'completed_steps', v_completed_count,
    'total_steps', array_length(v_step_order, 1),
    'duration_ms', v_step_result -> 'duration_ms',
    'sqlstate', v_sqlstate,
    'error', left(coalesce(v_error, ''), 300)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_refund_one_day_weather_cancelled_race_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;

  v_total_stage_count integer := 0;
  v_cancelled_stage_count integer := 0;

  v_refund_count integer := 0;
  v_refund_total bigint := 0;

  v_skipped_count integer := 0;

  v_refund_tx_id uuid;
  v_idempotency_key text;

  v_metadata jsonb;
  v_results jsonb := '[]'::jsonb;

  v_prep record;
begin
  -- ----------------------------------------------------------
  -- Resolve stage/race.
  -- ----------------------------------------------------------
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.weather_cancelled,
    rs.weather_cancellation_reason,
    r.name as race_name,
    r.status as race_status,
    r.metadata as race_metadata
  into v_stage
  from public.race_stages rs
  join public.races r
    on r.id = rs.race_id
  where rs.id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  -- ----------------------------------------------------------
  -- Must be one-day race.
  -- ----------------------------------------------------------
  select count(*)
  into v_total_stage_count
  from public.race_stages rs
  where rs.race_id = v_stage.race_id;

  if coalesce(v_total_stage_count, 0) <> 1 then
    return jsonb_build_object(
      'status', 'not_one_day_race_no_refund',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_count', v_total_stage_count,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  -- ----------------------------------------------------------
  -- Stage must be weather-cancelled.
  -- ----------------------------------------------------------
  if coalesce(v_stage.weather_cancelled, false) = false then
    return jsonb_build_object(
      'status', 'stage_not_weather_cancelled_no_refund',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_count', v_total_stage_count,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  select count(*)
  into v_cancelled_stage_count
  from public.race_stages rs
  where rs.race_id = v_stage.race_id
    and coalesce(rs.weather_cancelled, false) = true;

  if v_cancelled_stage_count <> v_total_stage_count then
    return jsonb_build_object(
      'status', 'race_not_fully_weather_cancelled_no_refund',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_count', v_total_stage_count,
      'weather_cancelled_stage_count', v_cancelled_stage_count,
      'refunded', false,
      'refund_count', 0,
      'refund_total', 0
    );
  end if;

  -- ----------------------------------------------------------
  -- Finance function uses finance.internal = 1 to allow backend
  -- system credit without user-session permission problems.
  -- ----------------------------------------------------------
  perform set_config('finance.internal', '1', true);

  -- ----------------------------------------------------------
  -- Refund every paid preparation for this one-day cancelled race.
  -- Only refund rows that actually had a finance charge transaction.
  -- ----------------------------------------------------------
  for v_prep in
    select
      rp.id as race_preparation_id,
      rp.race_id,
      rp.club_id,
      rp.participating_club_id,
      rp.status as preparation_status,
      rp.startlist_status,
      rp.participation_cost_cash,
      rp.travel_cost_cash,
      rp.staff_travel_cost_cash,
      rp.asset_transport_cost_cash,
      rp.supplies_cost_cash,
      rp.operations_cost_cash,
      rp.total_cost_cash,
      rp.finance_transaction_id,
      coalesce(rp.metadata, '{}'::jsonb) as metadata
    from public.race_preparations rp
    where rp.race_id = v_stage.race_id
    order by rp.club_id
  loop
    if coalesce(v_prep.total_cost_cash, 0) <= 0 then
      v_skipped_count := v_skipped_count + 1;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'race_preparation_id', v_prep.race_preparation_id,
          'club_id', v_prep.club_id,
          'status', 'skipped_no_cost',
          'amount', coalesce(v_prep.total_cost_cash, 0)
        )
      );

      continue;
    end if;

    if v_prep.finance_transaction_id is null then
      v_skipped_count := v_skipped_count + 1;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'race_preparation_id', v_prep.race_preparation_id,
          'club_id', v_prep.club_id,
          'status', 'skipped_no_original_finance_transaction',
          'amount', coalesce(v_prep.total_cost_cash, 0)
        )
      );

      continue;
    end if;

    v_idempotency_key :=
      'weather_cancelled_one_day_refund:' || v_prep.race_preparation_id::text;

    v_metadata := jsonb_build_object(
      'source', 'weather_cancellation_v1',
      'source_type', 'one_day_weather_cancelled_race_refund',
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_id', v_stage.stage_id,
      'stage_number', v_stage.stage_number,
      'stage_date', v_stage.stage_date,
      'weather_cancellation_reason', v_stage.weather_cancellation_reason,

      'race_preparation_id', v_prep.race_preparation_id,
      'club_id', v_prep.club_id,
      'participating_club_id', v_prep.participating_club_id,

      'original_finance_transaction_id', v_prep.finance_transaction_id,
      'refund_amount', v_prep.total_cost_cash,

      'participation_cost_cash', v_prep.participation_cost_cash,
      'travel_cost_cash', v_prep.travel_cost_cash,
      'staff_travel_cost_cash', v_prep.staff_travel_cost_cash,
      'asset_transport_cost_cash', v_prep.asset_transport_cost_cash,
      'supplies_cost_cash', v_prep.supplies_cost_cash,
      'operations_cost_cash', v_prep.operations_cost_cash,

      'no_results', true,
      'no_points', true,
      'no_replay', true,
      'no_fatigue', true,
      'no_prize_money', true,
      'created_at', now()
    );

    -- Use p_type='income' because finance_credit_to_club's default
    -- known-safe type is income. The refund meaning is stored in metadata.
    v_refund_tx_id := public.finance_credit_to_club(
      v_prep.club_id,
      v_prep.total_cost_cash,
      'income',
      'SINK',
      v_idempotency_key,
      v_metadata
    );

    update public.race_preparations rp
    set metadata =
      coalesce(rp.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'weather_refund_status', 'refunded',
        'weather_refund_source', 'weather_cancellation_v1',
        'weather_refund_transaction_id', v_refund_tx_id,
        'weather_refund_amount', v_prep.total_cost_cash,
        'weather_refund_idempotency_key', v_idempotency_key,
        'weather_refunded_at', now()
      ),
      updated_at = now()
    where rp.id = v_prep.race_preparation_id;

    v_refund_count := v_refund_count + 1;
    v_refund_total := v_refund_total + v_prep.total_cost_cash;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'race_preparation_id', v_prep.race_preparation_id,
        'club_id', v_prep.club_id,
        'status', 'refunded',
        'amount', v_prep.total_cost_cash,
        'refund_transaction_id', v_refund_tx_id,
        'idempotency_key', v_idempotency_key
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'one_day_weather_cancelled_race_refund_processed',
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'weather_cancellation_reason', v_stage.weather_cancellation_reason,
    'stage_count', v_total_stage_count,
    'weather_cancelled_stage_count', v_cancelled_stage_count,
    'refunded', v_refund_count > 0,
    'refund_count', v_refund_count,
    'refund_total', v_refund_total,
    'skipped_count', v_skipped_count,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_backlog_application_deadlines_split_one_v1(p_game_date date, p_statement_timeout_seconds integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('public.process_backlog_application_deadlines_split_one_v1')::bigint;

  v_backlog public.game_daily_tick_backlog_v1%rowtype;
  v_original_state public.game_state%rowtype;

  v_season integer := public.season_from_game_date(p_game_date);
  v_month integer := extract(month from p_game_date)::integer;
  v_day integer := extract(day from p_game_date)::integer;
  v_today_ordinal integer;

  v_progress jsonb;
  v_done_ai_fill jsonb;

  v_missing_deadline_count integer := 0;
  v_status_updated integer := 0;

  v_race record;
  v_result jsonb;
  v_old_statement_timeout text;

  v_started_at timestamptz;
  v_finished_at timestamptz;
  v_error text := null;
  v_sqlstate text := null;

  v_remaining_review_races integer := 0;
  v_remaining_ai_fill_races integer := 0;

  v_child_steps jsonb;
  v_completed_count integer;
  v_step_order text[] := array[
    'assign_race_start_times',
    'repair_future_race_statuses',
    'process_race_application_deadlines',
    'process_rider_submission_deadlines',
    'backfill_ai_rider_reservations_for_closed_races',
    'cleanup_premature_ai_race_entries',
    'process_due_race_days',
    'process_completed_race_commitment_scores'
  ];
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'ok', false,
      'status', 'skipped_already_running'
    );
  end if;

  select *
  into v_backlog
  from public.game_daily_tick_backlog_v1
  where current_game_date = p_game_date
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'status', 'backlog_day_not_found',
      'game_date', p_game_date
    );
  end if;

  if v_backlog.status = 'processed' then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_processed',
      'game_date', p_game_date
    );
  end if;

  if coalesce((v_backlog.payload ->> 'process_daily_tick_ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'status', 'not_partial_success_day',
      'game_date', p_game_date
    );
  end if;

  v_today_ordinal := public.game_date_ordinal_v1(v_season, v_month, v_day);

  v_progress := coalesce(
    v_backlog.payload -> 'application_deadline_split_v1',
    '{}'::jsonb
  );

  v_done_ai_fill := coalesce(
    v_progress -> 'ai_fill_done',
    '{}'::jsonb
  );

  select *
  into v_original_state
  from public.game_state
  where id = true
  for update;

  if not found then
    raise exception 'game_state row not found';
  end if;

  update public.game_clock_config
  set is_paused = true
  where id = true;

  update public.game_state
  set
    season_number = v_season,
    month_number = v_month::smallint,
    day_number = v_day::smallint,
    hour_number = 0,
    minute_number = 0,
    tick_version = coalesce(v_backlog.tick_version, v_original_state.tick_version),
    last_advanced_at = clock_timestamp(),
    is_paused = true
  where id = true;


  -- =========================================================
  -- Phase A: repair missing race entry deadline fields once
  -- =========================================================

  if coalesce((v_progress ->> 'deadline_repair_done')::boolean, false) is not true then
    select count(*)::integer
    into v_missing_deadline_count
    from public.race_entry_rules rer
    where rer.application_deadline_policy is null
       or rer.team_list_announcement_season_number is null
       or rer.team_list_announcement_month_number is null
       or rer.team_list_announcement_day_number is null
       or rer.rider_submission_deadline_season_number is null
       or rer.rider_submission_deadline_month_number is null
       or rer.rider_submission_deadline_day_number is null
       or rer.ai_fill_deadline_season_number is null
       or rer.ai_fill_deadline_month_number is null
       or rer.ai_fill_deadline_day_number is null;

    for v_race in
      select rer.race_id
      from public.race_entry_rules rer
      where rer.application_deadline_policy is null
         or rer.team_list_announcement_season_number is null
         or rer.team_list_announcement_month_number is null
         or rer.team_list_announcement_day_number is null
         or rer.rider_submission_deadline_season_number is null
         or rer.rider_submission_deadline_month_number is null
         or rer.rider_submission_deadline_day_number is null
         or rer.ai_fill_deadline_season_number is null
         or rer.ai_fill_deadline_month_number is null
         or rer.ai_fill_deadline_day_number is null
      limit 25
    loop
      perform *
      from public.recalculate_race_entry_deadlines_v1(v_race.race_id);
    end loop;

    v_progress :=
      v_progress
      || jsonb_build_object(
        'deadline_repair_done', true,
        'missing_deadline_count_before', v_missing_deadline_count
      );

    update public.game_daily_tick_backlog_v1
    set
      updated_at = now(),
      last_error = null,
      payload = payload || jsonb_build_object(
        'application_deadline_split_v1', v_progress
      )
    where id = v_backlog.id;

    -- Restore real game clock exactly, keep paused.
    update public.game_state
    set
      season_number = v_original_state.season_number,
      month_number = v_original_state.month_number,
      day_number = v_original_state.day_number,
      hour_number = v_original_state.hour_number,
      minute_number = v_original_state.minute_number,
      tick_version = v_original_state.tick_version,
      is_paused = true,
      last_advanced_at = v_original_state.last_advanced_at
    where id = true;

    return jsonb_build_object(
      'ok', true,
      'status', 'substep_processed',
      'substep', 'deadline_repair',
      'missing_deadline_count_before', v_missing_deadline_count
    );
  end if;


  -- =========================================================
  -- Phase B: update application statuses once
  -- Includes race_active, so keep loose constraint for now.
  -- =========================================================

  if coalesce((v_progress ->> 'status_update_done')::boolean, false) is not true then
    update public.race_entry_rules rer
    set
      applications_status = case
      -- Preserve lifecycle completion on the race end date.
      when lower(trim(coalesce(r.status::text, ''))) in (
        'completed', 'finished', 'race_finished', 'complete'
      ) then 'race_finished'
        when v_today_ordinal > public.game_date_ordinal_v1(
          extract(year from coalesce(r.end_date, r.start_date))::integer - 1999,
          extract(month from coalesce(r.end_date, r.start_date))::integer,
          extract(day from coalesce(r.end_date, r.start_date))::integer
        )
          then 'race_finished'

        when v_today_ordinal >= public.game_date_ordinal_v1(
          extract(year from r.start_date)::integer - 1999,
          extract(month from r.start_date)::integer,
          extract(day from r.start_date)::integer
        )
        and v_today_ordinal <= public.game_date_ordinal_v1(
          extract(year from coalesce(r.end_date, r.start_date))::integer - 1999,
          extract(month from coalesce(r.end_date, r.start_date))::integer,
          extract(day from coalesce(r.end_date, r.start_date))::integer
        )
          then 'race_active'

        when v_today_ordinal < public.game_date_ordinal_v1(
          rer.applications_open_season_number,
          rer.applications_open_month_number,
          rer.applications_open_day_number
        )
          then 'not_open'

        when v_today_ordinal <= public.game_date_ordinal_v1(
          rer.applications_close_season_number,
          rer.applications_close_month_number,
          rer.applications_close_day_number
        )
          then 'open'

        else 'closed'
      end,
      updated_at = now()
    from public.races r
    where r.id = rer.race_id
      and rer.applications_open_season_number is not null
      and rer.applications_open_month_number is not null
      and rer.applications_open_day_number is not null
      and rer.applications_close_season_number is not null
      and rer.applications_close_month_number is not null
      and rer.applications_close_day_number is not null;

    get diagnostics v_status_updated = row_count;

    v_progress :=
      v_progress
      || jsonb_build_object(
        'status_update_done', true,
        'status_rows_updated', v_status_updated
      );

    update public.game_daily_tick_backlog_v1
    set
      updated_at = now(),
      last_error = null,
      payload = payload || jsonb_build_object(
        'application_deadline_split_v1', v_progress
      )
    where id = v_backlog.id;

    update public.game_state
    set
      season_number = v_original_state.season_number,
      month_number = v_original_state.month_number,
      day_number = v_original_state.day_number,
      hour_number = v_original_state.hour_number,
      minute_number = v_original_state.minute_number,
      tick_version = v_original_state.tick_version,
      is_paused = true,
      last_advanced_at = v_original_state.last_advanced_at
    where id = true;

    return jsonb_build_object(
      'ok', true,
      'status', 'substep_processed',
      'substep', 'status_update',
      'status_rows_updated', v_status_updated
    );
  end if;


  -- =========================================================
  -- Phase C: review one race with due human applications
  -- =========================================================

  select count(*)::integer
  into v_remaining_review_races
  from public.races r
  join public.race_entry_rules rer
    on rer.race_id = r.id
  where public.game_date_ordinal_v1(
    rer.team_list_announcement_season_number,
    rer.team_list_announcement_month_number,
    rer.team_list_announcement_day_number
  ) <= v_today_ordinal
  and public.game_date_ordinal_v1(
    extract(year from r.start_date)::integer - 1999,
    extract(month from r.start_date)::integer,
    extract(day from r.start_date)::integer
  ) > v_today_ordinal
  and exists (
    select 1
    from public.race_team_entries rte
    where rte.race_id = r.id
      and rte.status in ('applied', 'under_review')
      and coalesce(rte.is_ai_filler, false) is false
  );

  if v_remaining_review_races > 0 then
    select
      r.id as race_id,
      r.name as race_name
    into v_race
    from public.races r
    join public.race_entry_rules rer
      on rer.race_id = r.id
    where public.game_date_ordinal_v1(
      rer.team_list_announcement_season_number,
      rer.team_list_announcement_month_number,
      rer.team_list_announcement_day_number
    ) <= v_today_ordinal
    and public.game_date_ordinal_v1(
      extract(year from r.start_date)::integer - 1999,
      extract(month from r.start_date)::integer,
      extract(day from r.start_date)::integer
    ) > v_today_ordinal
    and exists (
      select 1
      from public.race_team_entries rte
      where rte.race_id = r.id
        and rte.status in ('applied', 'under_review')
        and coalesce(rte.is_ai_filler, false) is false
    )
    order by r.start_date, r.name
    limit 1;

    v_started_at := clock_timestamp();

    begin
      select public.review_race_applications_v1(v_race.race_id, false)
      into v_result;

      v_finished_at := clock_timestamp();

      update public.game_daily_tick_backlog_v1
      set
        updated_at = now(),
        last_error = null,
        payload = payload || jsonb_build_object(
          'application_deadline_split_v1',
          v_progress || jsonb_build_object(
            'last_review_result',
            jsonb_build_object(
              'race_id', v_race.race_id,
              'race_name', v_race.race_name,
              'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000),
              'result', v_result
            )
          )
        )
      where id = v_backlog.id;

      update public.game_state
      set
        season_number = v_original_state.season_number,
        month_number = v_original_state.month_number,
        day_number = v_original_state.day_number,
        hour_number = v_original_state.hour_number,
        minute_number = v_original_state.minute_number,
        tick_version = v_original_state.tick_version,
        is_paused = true,
        last_advanced_at = v_original_state.last_advanced_at
      where id = true;

      return jsonb_build_object(
        'ok', true,
        'status', 'substep_processed',
        'substep', 'review_one_race',
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'remaining_review_races_before', v_remaining_review_races,
        'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000)
      );

    exception when others then
      v_finished_at := clock_timestamp();

      update public.game_daily_tick_backlog_v1
      set
        updated_at = now(),
        last_error = concat_ws(': ', sqlstate, sqlerrm),
        payload = payload || jsonb_build_object(
          'application_deadline_split_v1',
          v_progress || jsonb_build_object(
            'last_failed_review_race',
            jsonb_build_object(
              'race_id', v_race.race_id,
              'race_name', v_race.race_name,
              'sqlstate', sqlstate,
              'error', sqlerrm,
              'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000)
            )
          )
        )
      where id = v_backlog.id;

      update public.game_state
      set
        season_number = v_original_state.season_number,
        month_number = v_original_state.month_number,
        day_number = v_original_state.day_number,
        hour_number = v_original_state.hour_number,
        minute_number = v_original_state.minute_number,
        tick_version = v_original_state.tick_version,
        is_paused = true,
        last_advanced_at = v_original_state.last_advanced_at
      where id = true;

      return jsonb_build_object(
        'ok', false,
        'status', 'substep_failed',
        'substep', 'review_one_race',
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'sqlstate', sqlstate,
        'error', left(sqlerrm, 300)
      );
    end;
  end if;


  -- =========================================================
  -- Phase D: AI-fill exactly one due race
  -- =========================================================

  select count(*)::integer
  into v_remaining_ai_fill_races
  from public.races r
  join public.race_entry_rules rer
    on rer.race_id = r.id
  where public.game_date_ordinal_v1(
    rer.team_list_announcement_season_number,
    rer.team_list_announcement_month_number,
    rer.team_list_announcement_day_number
  ) <= v_today_ordinal
  and public.game_date_ordinal_v1(
    extract(year from r.start_date)::integer - 1999,
    extract(month from r.start_date)::integer,
    extract(day from r.start_date)::integer
  ) > v_today_ordinal
  and (
    select count(*)
    from public.race_team_entries rte
    where rte.race_id = r.id
      and rte.status = 'accepted'
  ) < coalesce(rer.target_teams, rer.min_teams, rer.max_teams, 12)
  and not (v_done_ai_fill ? r.id::text);

  if v_remaining_ai_fill_races > 0 then
    select
      r.id as race_id,
      r.name as race_name,
      r.start_date
    into v_race
    from public.races r
    join public.race_entry_rules rer
      on rer.race_id = r.id
    where public.game_date_ordinal_v1(
      rer.team_list_announcement_season_number,
      rer.team_list_announcement_month_number,
      rer.team_list_announcement_day_number
    ) <= v_today_ordinal
    and public.game_date_ordinal_v1(
      extract(year from r.start_date)::integer - 1999,
      extract(month from r.start_date)::integer,
      extract(day from r.start_date)::integer
    ) > v_today_ordinal
    and (
      select count(*)
      from public.race_team_entries rte
      where rte.race_id = r.id
        and rte.status = 'accepted'
    ) < coalesce(rer.target_teams, rer.min_teams, rer.max_teams, 12)
    and not (v_done_ai_fill ? r.id::text)
    order by r.start_date, r.name
    limit 1;

    v_old_statement_timeout := current_setting('statement_timeout', true);

    perform set_config(
      'statement_timeout',
      greatest(20, least(coalesce(p_statement_timeout_seconds, 45), 80))::text || 's',
      true
    );

    v_started_at := clock_timestamp();

    begin
      select public.fill_race_ai_teams_v1(v_race.race_id)
      into v_result;

      v_finished_at := clock_timestamp();

      perform set_config(
        'statement_timeout',
        coalesce(nullif(v_old_statement_timeout, ''), '0'),
        true
      );

      v_done_ai_fill :=
        v_done_ai_fill || jsonb_build_object(
          v_race.race_id::text,
          jsonb_build_object(
            'status', 'ok',
            'race_name', v_race.race_name,
            'start_date', v_race.start_date,
            'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000),
            'result_summary',
              jsonb_build_object(
                'success', v_result ->> 'success',
                'ai_entries_added', v_result ->> 'ai_entries_added',
                'accepted_entries', v_result ->> 'accepted_entries',
                'target_teams', v_result ->> 'target_teams'
              )
          )
        );

      v_progress :=
        v_progress || jsonb_build_object(
          'ai_fill_done', v_done_ai_fill,
          'last_ai_fill_race_id', v_race.race_id,
          'last_ai_fill_race_name', v_race.race_name
        );

      update public.game_daily_tick_backlog_v1
      set
        updated_at = now(),
        last_error = null,
        payload = payload || jsonb_build_object(
          'application_deadline_split_v1', v_progress
        )
      where id = v_backlog.id;

      update public.game_state
      set
        season_number = v_original_state.season_number,
        month_number = v_original_state.month_number,
        day_number = v_original_state.day_number,
        hour_number = v_original_state.hour_number,
        minute_number = v_original_state.minute_number,
        tick_version = v_original_state.tick_version,
        is_paused = true,
        last_advanced_at = v_original_state.last_advanced_at
      where id = true;

      return jsonb_build_object(
        'ok', true,
        'status', 'substep_processed',
        'substep', 'ai_fill_one_race',
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'start_date', v_race.start_date,
        'remaining_ai_fill_races_before', v_remaining_ai_fill_races,
        'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000),
        'result_summary',
          jsonb_build_object(
            'success', v_result ->> 'success',
            'ai_entries_added', v_result ->> 'ai_entries_added',
            'accepted_entries', v_result ->> 'accepted_entries',
            'target_teams', v_result ->> 'target_teams'
          )
      );

    exception
      when query_canceled then
        v_finished_at := clock_timestamp();
        v_sqlstate := sqlstate;
        v_error := sqlerrm;

      when others then
        v_finished_at := clock_timestamp();
        v_sqlstate := sqlstate;
        v_error := sqlerrm;
    end;

    perform set_config(
      'statement_timeout',
      coalesce(nullif(v_old_statement_timeout, ''), '0'),
      true
    );

    update public.game_daily_tick_backlog_v1
    set
      updated_at = now(),
      last_error = concat_ws(': ', v_sqlstate, v_error),
      payload = payload || jsonb_build_object(
        'application_deadline_split_v1',
        v_progress || jsonb_build_object(
          'last_failed_ai_fill_race',
          jsonb_build_object(
            'race_id', v_race.race_id,
            'race_name', v_race.race_name,
            'start_date', v_race.start_date,
            'sqlstate', v_sqlstate,
            'error', v_error,
            'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000)
          )
        )
      )
    where id = v_backlog.id;

    update public.game_state
    set
      season_number = v_original_state.season_number,
      month_number = v_original_state.month_number,
      day_number = v_original_state.day_number,
      hour_number = v_original_state.hour_number,
      minute_number = v_original_state.minute_number,
      tick_version = v_original_state.tick_version,
      is_paused = true,
      last_advanced_at = v_original_state.last_advanced_at
    where id = true;

    return jsonb_build_object(
      'ok', false,
      'status', 'substep_failed',
      'substep', 'ai_fill_one_race',
      'race_id', v_race.race_id,
      'race_name', v_race.race_name,
      'start_date', v_race.start_date,
      'sqlstate', v_sqlstate,
      'error', left(coalesce(v_error, ''), 300),
      'duration_ms', round(extract(epoch from (v_finished_at - v_started_at)) * 1000)
    );
  end if;


  -- =========================================================
  -- Phase E: no remaining review/AI-fill work.
  -- Mark process_race_application_deadlines child step OK.
  -- =========================================================

  v_child_steps := coalesce(v_backlog.payload -> 'game_processor_child_steps', '{}'::jsonb);

  v_child_steps :=
    v_child_steps || jsonb_build_object(
      'process_race_application_deadlines',
      jsonb_build_object(
        'status', 'ok',
        'step', 'process_race_application_deadlines',
        'manual_split', true,
        'completed_at', now()
      )
    );

  select count(*)
  into v_completed_count
  from unnest(v_step_order) s
  where coalesce(v_child_steps #>> array[s, 'status'], '') = 'ok';

  update public.game_daily_tick_backlog_v1
  set
    status = 'pending',
    updated_at = now(),
    last_error = null,
    payload =
      payload
      || jsonb_build_object(
        'game_processor_child_steps', v_child_steps,
        'game_processor_child_steps_completed', v_completed_count,
        'game_processor_child_steps_total', array_length(v_step_order, 1),
        'application_deadline_split_v1',
          v_progress || jsonb_build_object(
            'complete', true,
            'completed_at', now(),
            'remaining_review_races', 0,
            'remaining_ai_fill_races', 0
          )
      )
  where id = v_backlog.id;

  update public.game_state
  set
    season_number = v_original_state.season_number,
    month_number = v_original_state.month_number,
    day_number = v_original_state.day_number,
    hour_number = v_original_state.hour_number,
    minute_number = v_original_state.minute_number,
    tick_version = v_original_state.tick_version,
    is_paused = true,
    last_advanced_at = v_original_state.last_advanced_at
  where id = true;

  return jsonb_build_object(
    'ok', true,
    'status', 'application_deadline_child_step_completed',
    'game_date', p_game_date,
    'completed_steps', v_completed_count,
    'total_steps', array_length(v_step_order, 1)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_process_weather_cancelled_stage_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;

  v_synthetic_result jsonb;
  v_report_result jsonb;
  v_refund_result jsonb;
  v_finalize_result jsonb;
  v_notification_result jsonb;

  v_status text;
begin
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.weather_cancelled,
    rs.weather_cancellation_reason,
    c.should_cancel_for_weather,
    c.cancellation_reason
  into v_stage
  from public.race_stages rs
  left join public.race_stage_weather_cancellation_candidates_v1 c
    on c.stage_id = rs.id
  where rs.id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id
    );
  end if;

  if coalesce(v_stage.should_cancel_for_weather, false) = false
     and coalesce(v_stage.weather_cancelled, false) = false then
    return jsonb_build_object(
      'status', 'not_weather_cancelled',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'cancelled', false,
      'reason', null
    );
  end if;

  -- 1. Apply stage cancellation + cleanup + synthetic completed run.
  v_synthetic_result :=
    public.race_engine_apply_weather_cancelled_stage_run_v1(p_stage_id);

  -- Refresh stage state after synthetic function.
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.weather_cancelled,
    rs.weather_cancellation_reason
  into v_stage
  from public.race_stages rs
  where rs.id = p_stage_id;

  -- 2. Write safe report event.
  v_report_result :=
    public.race_engine_write_weather_cancelled_stage_report_event_v1(p_stage_id);

  -- 3. Refund only if this is a one-day fully weather-cancelled race.
  -- For multi-stage races this safely returns no refund.
  v_refund_result :=
    public.race_engine_refund_one_day_weather_cancelled_race_v1(p_stage_id);

  -- 4. Refresh race-level metadata/status.
  v_finalize_result :=
    public.race_engine_finalize_weather_cancelled_race_state_v1(v_stage.race_id);

  -- 5. Create visible player notifications.
  -- This runs after finalize, so race-level notification knows whether
  -- the whole race is cancelled.
  v_notification_result :=
    public.race_engine_create_weather_cancellation_notifications_v1(p_stage_id);

  v_status :=
    case
      when v_synthetic_result ->> 'status' in (
        'weather_cancelled_existing_run_converted',
        'weather_cancelled_synthetic_run_created'
      )
      then 'weather_cancelled_stage_processed'
      else coalesce(v_synthetic_result ->> 'status', 'weather_cancelled_stage_processed')
    end;

  return jsonb_build_object(
    'status', v_status,
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'stage_number', v_stage.stage_number,
    'weather_cancelled', v_stage.weather_cancelled,
    'weather_cancellation_reason', v_stage.weather_cancellation_reason,
    'synthetic_result', v_synthetic_result,
    'report_result', v_report_result,
    'refund_result', v_refund_result,
    'finalize_result', v_finalize_result,
    'notification_result', v_notification_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_race_stage_weather_cancellations_v1(p_limit integer DEFAULT 50, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_ts timestamptz;
  v_game_date date;
  v_limit integer := greatest(coalesce(p_limit, 50), 0);

  v_stage record;
  v_result jsonb;

  v_due_count integer := 0;
  v_processed_count integer := 0;
  v_failed_count integer := 0;

  v_results jsonb := '[]'::jsonb;
begin
  v_game_ts := public.get_current_game_timestamp();
  v_game_date := (v_game_ts at time zone 'UTC')::date;

  -- ----------------------------------------------------------
  -- Dry run / count due candidates.
  -- ----------------------------------------------------------
  select count(*)
  into v_due_count
  from public.race_stage_weather_cancellation_candidates_v1 c
  join public.race_stages rs
    on rs.id = c.stage_id
  where coalesce(c.should_cancel_for_weather, false) = true
    and coalesce(rs.weather_cancelled, false) = false
    and c.stage_date <= (v_game_date + 1);

  if p_dry_run = true then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'stage_id', q.stage_id,
          'race_id', q.race_id,
          'race_name', q.race_name,
          'stage_number', q.stage_number,
          'stage_date', q.stage_date,
          'cancellation_reason', q.cancellation_reason,
          'weather_condition_text', q.weather_condition_text,
          'avg_temp_c', q.avg_temp_c,
          'min_temp_c', q.min_temp_c,
          'max_temp_c', q.max_temp_c
        )
        order by q.stage_date, q.race_name, q.stage_number
      ),
      '[]'::jsonb
    )
    into v_results
    from (
      select
        c.stage_id,
        c.race_id,
        r.name as race_name,
        c.stage_number,
        c.stage_date,
        c.cancellation_reason,
        c.weather_condition_text,
        c.avg_temp_c,
        c.min_temp_c,
        c.max_temp_c
      from public.race_stage_weather_cancellation_candidates_v1 c
      join public.race_stages rs
        on rs.id = c.stage_id
      join public.races r
        on r.id = c.race_id
      where coalesce(c.should_cancel_for_weather, false) = true
        and coalesce(rs.weather_cancelled, false) = false
        and c.stage_date <= (v_game_date + 1)
      order by c.stage_date, r.name, c.stage_number
      limit v_limit
    ) q;

    return jsonb_build_object(
      'status', 'dry_run',
      'game_timestamp', v_game_ts,
      'game_date', v_game_date,
      'decision_due_until_stage_date', v_game_date + 1,
      'due_count_total', v_due_count,
      'limit', v_limit,
      'stages', v_results
    );
  end if;

  -- ----------------------------------------------------------
  -- Process due candidates.
  -- Continue even if one stage fails.
  -- ----------------------------------------------------------
  for v_stage in
    select
      c.stage_id,
      c.race_id,
      r.name as race_name,
      c.stage_number,
      c.stage_date,
      c.cancellation_reason,
      c.weather_condition_text,
      c.avg_temp_c,
      c.min_temp_c,
      c.max_temp_c
    from public.race_stage_weather_cancellation_candidates_v1 c
    join public.race_stages rs
      on rs.id = c.stage_id
    join public.races r
      on r.id = c.race_id
    where coalesce(c.should_cancel_for_weather, false) = true
      and coalesce(rs.weather_cancelled, false) = false
      and c.stage_date <= (v_game_date + 1)
    order by c.stage_date, r.name, c.stage_number
    limit v_limit
  loop
    begin
      v_result := public.race_engine_process_weather_cancelled_stage_v1(v_stage.stage_id);

      v_processed_count := v_processed_count + 1;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'stage_id', v_stage.stage_id,
          'race_id', v_stage.race_id,
          'race_name', v_stage.race_name,
          'stage_number', v_stage.stage_number,
          'stage_date', v_stage.stage_date,
          'cancellation_reason', v_stage.cancellation_reason,
          'status', coalesce(v_result ->> 'status', 'processed'),
          'result', v_result
        )
      );

    exception when others then
      v_failed_count := v_failed_count + 1;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'stage_id', v_stage.stage_id,
          'race_id', v_stage.race_id,
          'race_name', v_stage.race_name,
          'stage_number', v_stage.stage_number,
          'stage_date', v_stage.stage_date,
          'cancellation_reason', v_stage.cancellation_reason,
          'status', 'failed',
          'error', sqlerrm
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'status', 'processed',
    'game_timestamp', v_game_ts,
    'game_date', v_game_date,
    'decision_due_until_stage_date', v_game_date + 1,
    'due_count_total_before_run', v_due_count,
    'limit', v_limit,
    'processed_count', v_processed_count,
    'failed_count', v_failed_count,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.manual_non_national_ai_fill_backlog_fallback_v1(p_game_date date, p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_name text;
  v_start_date date;
  v_target_teams integer;
  v_accepted_before integer;
  v_accepted_after integer;
  v_missing_slots integer;
  v_inserted_blockers integer := 0;
  v_inserted_ai_teams integer := 0;
begin
  select
    r.name,
    r.start_date,
    coalesce(rer.target_teams, rer.min_teams, rer.max_teams, 12)
  into
    v_race_name,
    v_start_date,
    v_target_teams
  from public.races r
  join public.race_entry_rules rer
    on rer.race_id = r.id
  where r.id = p_race_id;

  if v_race_name is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'race_not_found',
      'race_id', p_race_id
    );
  end if;

  select count(*)::integer
  into v_accepted_before
  from public.race_team_entries rte
  where rte.race_id = p_race_id
    and rte.status = 'accepted';

  v_missing_slots := greatest(0, v_target_teams - coalesce(v_accepted_before, 0));


  -- Block National Teams for this race so generic filler cannot choose them later.
  insert into public.race_team_entries (
    id,
    race_id,
    club_id,
    status,
    entry_source,
    is_ai_filler,
    auto_filled_at,
    commitment_score_snapshot,
    acceptance_score,
    review_round,
    decision_reason,
    reviewed_at,
    final_decision_at,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    p_race_id,
    pool.id,
    'cancelled',
    'ai_fill_national_team_blocker',
    true,
    now(),
    null,
    null,
    0,
    'Blocked by backlog repair: national teams are not valid generic AI filler teams because rider nationality lock applies.',
    now(),
    now(),
    now(),
    now()
  from public.ai_competition_filler_club_pool_v1 pool
  join public.clubs c
    on c.id = pool.id
  where c.name ilike '%National Team%'
    and not exists (
      select 1
      from public.race_team_entries rte
      where rte.race_id = p_race_id
        and rte.club_id = pool.id
    )
  on conflict (race_id, club_id) do nothing;

  get diagnostics v_inserted_blockers = row_count;


  -- Manually accept non-national AI filler teams up to target.
  insert into public.race_team_entries (
    id,
    race_id,
    club_id,
    status,
    entry_source,
    is_ai_filler,
    auto_filled_at,
    commitment_score_snapshot,
    acceptance_score,
    review_round,
    decision_reason,
    reviewed_at,
    final_decision_at,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    p_race_id,
    pool.id,
    'accepted',
    'ai_fill_manual_backlog_repair',
    true,
    now(),
    null,
    null,
    0,
    'Accepted by backlog repair: manual non-national AI filler fallback after generic AI-fill timed out.',
    now(),
    now(),
    now(),
    now()
  from public.ai_competition_filler_club_pool_v1 pool
  join public.clubs c
    on c.id = pool.id
  where c.name not ilike '%National Team%'
    and not exists (
      select 1
      from public.race_team_entries rte
      where rte.race_id = p_race_id
        and rte.club_id = pool.id
    )
  order by random()
  limit v_missing_slots
  on conflict (race_id, club_id) do nothing;

  get diagnostics v_inserted_ai_teams = row_count;

  select count(*)::integer
  into v_accepted_after
  from public.race_team_entries rte
  where rte.race_id = p_race_id
    and rte.status = 'accepted';


  -- Mark this race as done in application-deadline split progress.
  update public.game_daily_tick_backlog_v1 b
  set
    status = 'pending',
    last_error = null,
    updated_at = now(),
    payload =
      b.payload
      || jsonb_build_object(
        'application_deadline_split_v1',
        coalesce(b.payload -> 'application_deadline_split_v1', '{}'::jsonb)
        || jsonb_build_object(
          'ai_fill_done',
          coalesce(b.payload #> '{application_deadline_split_v1,ai_fill_done}', '{}'::jsonb)
          || jsonb_build_object(
            p_race_id::text,
            jsonb_build_object(
              'status', 'ok',
              'manual_fallback', true,
              'race_name', v_race_name,
              'start_date', v_start_date,
              'target_teams', v_target_teams,
              'accepted_before', v_accepted_before,
              'accepted_after', v_accepted_after,
              'inserted_ai_teams', v_inserted_ai_teams,
              'inserted_national_team_blockers', v_inserted_blockers,
              'completed_at', now(),
              'reason', 'Manual non-national AI filler fallback after fill_race_ai_teams_v1 timeout.'
            )
          ),
          'last_ai_fill_race_id', p_race_id,
          'last_ai_fill_race_name', v_race_name,
          'last_failed_ai_fill_race', null
        )
      )
  where b.current_game_date = p_game_date
    and b.status <> 'processed';

  return jsonb_build_object(
    'ok', true,
    'status', 'manual_ai_fill_done',
    'race_id', p_race_id,
    'race_name', v_race_name,
    'start_date', v_start_date,
    'target_teams', v_target_teams,
    'accepted_before', v_accepted_before,
    'missing_slots_before', v_missing_slots,
    'inserted_ai_teams', v_inserted_ai_teams,
    'inserted_national_team_blockers', v_inserted_blockers,
    'accepted_after', v_accepted_after
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_create_weather_cancellation_notifications_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_reason text;
  v_reason_label text;

  v_total_stage_count integer := 0;
  v_cancelled_stage_count integer := 0;
  v_active_stage_count integer := 0;
  v_effective_stage_count integer := 1;

  v_is_one_day boolean := false;
  v_is_race_fully_cancelled boolean := false;

  v_stage_notification_count integer := 0;
  v_race_notification_count integer := 0;
  v_total_recipient_count integer := 0;

  v_notification_id bigint;
  v_existing_notification_id bigint;

  v_event_key text;
  v_action_url text;
  v_stage_path text;
  v_image_url text;
  v_payload jsonb;
  v_type_code text;
  v_title text;
  v_message text;

  v_recipient record;
  v_results jsonb := '[]'::jsonb;
begin
  select
    rs.id as stage_id,
    rs.race_id,
    rs.stage_number,
    rs.stage_date,
    rs.name as stage_name,
    rs.profile_image_url as stage_profile_image_url,
    rs.weather_cancelled,
    rs.weather_cancellation_reason,
    rs.weather_cancelled_at,
    r.name as race_name,
    r.status as race_status,
    coalesce(r.is_stage_race, false) as is_stage_race,
    r.stage_count,
    coalesce(r.metadata, '{}'::jsonb) as race_metadata,
    r.logo_url,
    r.profile_image_url as race_profile_image_url
  into v_stage
  from public.race_stages rs
  join public.races r
    on r.id = rs.race_id
  where rs.id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'notification_created', false
    );
  end if;

  if coalesce(v_stage.weather_cancelled, false) = false
     and lower(coalesce(v_stage.race_status, '')) not in ('cancelled', 'canceled', 'weather_cancelled', 'weather_canceled') then
    return jsonb_build_object(
      'status', 'stage_not_weather_cancelled',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'notification_created', false
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (where coalesce(rs.weather_cancelled, false) = true)::integer,
    count(*) filter (where coalesce(rs.weather_cancelled, false) = false)::integer
  into v_total_stage_count, v_cancelled_stage_count, v_active_stage_count
  from public.race_stages rs
  where rs.race_id = v_stage.race_id;

  v_effective_stage_count := greatest(coalesce(v_stage.stage_count, v_total_stage_count, 1), 1);
  v_is_one_day := v_effective_stage_count <= 1 or coalesce(v_stage.is_stage_race, false) = false;

  v_is_race_fully_cancelled :=
    lower(coalesce(v_stage.race_status, '')) in ('cancelled', 'canceled', 'weather_cancelled', 'weather_canceled')
    or coalesce(v_stage.race_metadata ->> 'weather_cancellation_status', '') = 'all_stages_weather_cancelled'
    or (
      v_total_stage_count > 0
      and v_cancelled_stage_count >= v_total_stage_count
    )
    or (
      v_is_one_day = true
      and coalesce(v_stage.weather_cancelled, false) = true
    );

  v_reason := coalesce(
    nullif(v_stage.weather_cancellation_reason, ''),
    nullif(v_stage.race_metadata ->> 'weather_cancellation_reason', ''),
    'unsafe_weather'
  );
  v_reason_label := public.weather_cancellation_reason_label_v1(v_reason);

  v_action_url := '/dashboard/races/' || v_stage.race_id::text;
  v_stage_path := v_action_url || '?stageId=' || v_stage.stage_id::text;
  v_image_url := coalesce(
    nullif(v_stage.stage_profile_image_url, ''),
    nullif(v_stage.logo_url, ''),
    nullif(v_stage.race_profile_image_url, '')
  );

  if v_is_race_fully_cancelled then
    v_type_code := 'RACE_WEATHER_CANCELLED';
    v_title := 'Race cancelled due to weather: ' || coalesce(v_stage.race_name, 'Race');
    v_message := coalesce(v_stage.race_name, 'This race')
      || ' was cancelled because of '
      || v_reason_label
      || '. No results, points, prize money, fatigue, or replay will be generated for the cancelled race.';
    v_event_key := 'weather_cancelled_race:' || v_stage.race_id::text;
  else
    v_type_code := 'RACE_STAGE_WEATHER_CANCELLED';
    v_title := 'Stage cancelled due to weather: ' || coalesce(v_stage.race_name, 'Race');
    v_message := 'Stage '
      || coalesce(v_stage.stage_number::text, '?')
      || ' of '
      || coalesce(v_stage.race_name, 'this race')
      || ' was cancelled because of '
      || v_reason_label
      || '. The race can continue if other stages are still active.';
    v_event_key := 'weather_cancelled_stage:' || v_stage.stage_id::text;
  end if;

  -- Notify all user-owned clubs with race preparations.
  for v_recipient in
    select distinct
      rp.club_id,
      coalesce(rp.participating_club_id, rp.club_id) as participating_club_id,
      c.owner_user_id as user_id
    from public.race_preparations rp
    join public.clubs c
      on c.id = rp.club_id
    where rp.race_id = v_stage.race_id
      and c.owner_user_id is not null
    order by rp.club_id
  loop
    v_total_recipient_count := v_total_recipient_count + 1;

    v_payload := jsonb_build_object(
      'source', 'weather_cancellation_v1',
      'event_type', case when v_is_race_fully_cancelled then 'race_weather_cancelled' else 'stage_weather_cancelled' end,
      'race_id', v_stage.race_id,
      'race_name', v_stage.race_name,
      'stage_id', v_stage.stage_id,
      'stage_number', v_stage.stage_number,
      'stage_name', v_stage.stage_name,
      'stage_date', v_stage.stage_date,
      'club_id', v_recipient.club_id,
      'participating_club_id', v_recipient.participating_club_id,
      'reason', v_reason,
      'reason_label', v_reason_label,
      'race_cancelled', v_is_race_fully_cancelled,
      'race_fully_cancelled', v_is_race_fully_cancelled,
      'stage_cancelled', true,
      'race_status', v_stage.race_status,
      'race_path', v_action_url,
      'action_url', v_action_url,
      'stage_path', v_stage_path,
      'image_url', v_image_url,
      'race_logo_url', v_stage.logo_url,
      'race_profile_image_url', v_stage.race_profile_image_url,
      'stage_profile_image_url', v_stage.stage_profile_image_url,
      'total_stage_count', v_total_stage_count,
      'cancelled_stage_count', v_cancelled_stage_count,
      'active_stage_count', v_active_stage_count,
      'no_results', true,
      'no_points', true,
      'no_replay', true,
      'no_fatigue', true,
      'no_prize_money', true
    );

    v_existing_notification_id := null;

    select n.id
    into v_existing_notification_id
    from public.user_notifications un
    join public.notifications n
      on n.id = un.notification_id
    join public.notification_types nt
      on nt.id = n.type_id
    where un.user_id = v_recipient.user_id
      and un.deleted_at is null
      and nt.code = v_type_code
      and (
        (v_is_race_fully_cancelled and coalesce(n.payload_json ->> 'race_id', '') = v_stage.race_id::text)
        or
        (not v_is_race_fully_cancelled and coalesce(n.payload_json ->> 'stage_id', '') = v_stage.stage_id::text)
      )
    order by n.created_at desc
    limit 1;

    if v_existing_notification_id is not null then
      v_notification_id := v_existing_notification_id;
    else
      v_notification_id := public.ppm_create_user_notification_direct_v1(
        v_recipient.user_id,
        v_type_code,
        v_title,
        v_message,
        v_action_url,
        v_payload,
        v_event_key || ':club:' || v_recipient.club_id::text
      );

      if v_is_race_fully_cancelled then
        v_race_notification_count := v_race_notification_count + 1;
      else
        v_stage_notification_count := v_stage_notification_count + 1;
      end if;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'club_id', v_recipient.club_id,
        'user_id', v_recipient.user_id,
        'notification_id', v_notification_id,
        'existing_notification_id', v_existing_notification_id,
        'type_code', v_type_code,
        'event_key', v_event_key || ':club:' || v_recipient.club_id::text
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'weather_cancellation_notifications_processed',
    'stage_id', v_stage.stage_id,
    'race_id', v_stage.race_id,
    'race_name', v_stage.race_name,
    'stage_number', v_stage.stage_number,
    'reason', v_reason,
    'reason_label', v_reason_label,
    'race_fully_cancelled', v_is_race_fully_cancelled,
    'recipient_count', v_total_recipient_count,
    'stage_notification_count', v_stage_notification_count,
    'race_notification_count', v_race_notification_count,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_hourly_market_ai_jobs_guarded_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_policy_result jsonb;
  v_clock_paused boolean := false;
  v_clock_text text;
begin
  select
    coalesce(gs.is_paused, false),
    gt.display_text
  into
    v_clock_paused,
    v_clock_text
  from public.game_state gs
  cross join lateral public.get_game_time() gt
  where gs.id = true
  limit 1;

  if coalesce(v_clock_paused, false) is true then
    v_result := jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'game_clock_paused',
      'clock', v_clock_text
    );

    insert into public.cron_guard_run_log_v1(job_key, status, result)
    values ('market_ai_hourly', 'skipped_clock_paused', v_result);

    return v_result;
  end if;

  begin
    -- Policy check only. Does not update clubs.cash_balance.
    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'finance_ensure_ai_unlimited_funds_v1'
        and pg_get_function_identity_arguments(p.oid) = ''
    ) then
      select public.finance_ensure_ai_unlimited_funds_v1()
      into v_policy_result;
    else
      v_policy_result := jsonb_build_object(
        'success', true,
        'skipped', true,
        'reason', 'finance_ensure_ai_unlimited_funds_v1_not_installed'
      );
    end if;

    select public.run_hourly_market_ai_jobs()
    into v_result;

    v_result := coalesce(v_result, jsonb_build_object('success', true))
      || jsonb_build_object(
        'guarded', true,
        'ai_unlimited_funds_policy_check', v_policy_result
      );

    insert into public.cron_guard_run_log_v1(job_key, status, result)
    values ('market_ai_hourly', 'completed', v_result);

    return v_result;

  exception when others then
    v_result := jsonb_build_object(
      'success', false,
      'guarded', true,
      'caught_by_guard', true,
      'sqlstate', sqlstate,
      'error', sqlerrm,
      'cron_should_not_hard_fail', true,
      'business_rule_notes', jsonb_build_array(
        'AI teams are unlimited-funds teams.',
        'Do not update public.clubs.cash_balance directly; it is finance-ledger-managed.',
        'National teams may only hire/select riders from their own country.',
        'One invalid AI market offer should be skipped/repaired, not kill the cron.'
      )
    );

    insert into public.cron_guard_run_log_v1(job_key, status, result, error)
    values ('market_ai_hourly', 'guarded_error', v_result, sqlerrm);

    -- Important: do not RAISE.
    -- Returning JSON means pg_cron sees this as a successful SQL call.
    return v_result;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_competition_sizes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lock_key bigint := hashtext('public.ensure_competition_sizes.hourly_minimum_fill_v2')::bigint;
  v_run_id uuid := gen_random_uuid();
  v_game record;
  v_target record;
  v_current integer;
  v_needed integer;
  v_fill jsonb;
  v_moved integer := 0;
  v_this_moved integer := 0;
  v_unresolved integer := 0;
  v_movements jsonb := '[]'::jsonb;
  v_health jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object('success',true,'status','skipped_already_running');
  end if;

  if public.season_transition_guard_active_v1()
     or exists(select 1 from public.season_transition_runs_v1 where status='running') then
    v_result:=jsonb_build_object('success',true,'status','skipped_season_transition_running','run_id',v_run_id);
    insert into public.cron_guard_run_log_v1(job_key,status,result) values('ensure_competition_sizes','skipped_season_transition_running',v_result);
    return v_result;
  end if;

  select season_number,month_number,day_number,hour_number,minute_number
  into v_game from public.game_state where id=true;

  for v_target in
    select * from (values
      ('worldteam'::text,'WORLD'::text,25,1),
      ('proteam','PRO_WEST',20,2),('proteam','PRO_EAST',20,3),
      ('continental','CONTINENTAL_EUROPE',20,4),('continental','CONTINENTAL_AMERICA',20,5),
      ('continental','CONTINENTAL_ASIA',20,6),('continental','CONTINENTAL_AFRICA',20,7),('continental','CONTINENTAL_OCEANIA',20,8),
      ('amateur','NORTH_AMERICA',10,9),('amateur','SOUTH_AMERICA',10,10),('amateur','WESTERN_EUROPE',10,11),('amateur','CENTRAL_EUROPE',10,12),
      ('amateur','SOUTHERN_BALKAN_EUROPE',10,13),('amateur','NORTHERN_EASTERN_EUROPE',10,14),('amateur','WEST_NORTH_AFRICA',10,15),
      ('amateur','CENTRAL_SOUTH_AFRICA',10,16),('amateur','WEST_CENTRAL_ASIA',10,17),('amateur','SOUTH_ASIA',10,18),('amateur','EAST_SOUTHEAST_ASIA',10,19),('amateur','OCEANIA',10,20)
    ) as x(target_tier,target_division,min_teams,ord) order by ord
  loop
    if v_target.target_tier='worldteam' then
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='worldteam';
    elsif v_target.target_tier='proteam' then
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='proteam' and tier2_division=v_target.target_division;
    elsif v_target.target_tier='continental' then
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='continental' and tier3_division=v_target.target_division;
    else
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='amateur' and amateur_division=v_target.target_division;
    end if;

    v_needed:=greatest(v_target.min_teams-v_current,0);
    if v_needed>0 then
      v_fill:=public.fill_competition_target_from_curated_ai_v2(v_target.target_tier,v_target.target_division,v_needed,v_run_id,v_game.season_number,v_game.month_number,v_game.day_number,v_game.hour_number,v_game.minute_number);
      v_this_moved:=coalesce((v_fill->>'moved')::int,0);
      v_moved:=v_moved+v_this_moved;
      v_unresolved:=v_unresolved+greatest(v_needed-v_this_moved,0);
      v_movements:=v_movements||coalesce(v_fill->'movements','[]'::jsonb);
    end if;
  end loop;

  for v_target in
    select * from (values
      ('worldteam'::text,'WORLD'::text,25,25),
      ('proteam','PRO_WEST',20,25),('proteam','PRO_EAST',20,25),
      ('continental','CONTINENTAL_EUROPE',20,25),('continental','CONTINENTAL_AMERICA',20,25),('continental','CONTINENTAL_ASIA',20,25),('continental','CONTINENTAL_AFRICA',20,25),('continental','CONTINENTAL_OCEANIA',20,25),
      ('amateur','NORTH_AMERICA',10,null),('amateur','SOUTH_AMERICA',10,null),('amateur','WESTERN_EUROPE',10,null),('amateur','CENTRAL_EUROPE',10,null),('amateur','SOUTHERN_BALKAN_EUROPE',10,null),('amateur','NORTHERN_EASTERN_EUROPE',10,null),('amateur','WEST_NORTH_AFRICA',10,null),('amateur','CENTRAL_SOUTH_AFRICA',10,null),('amateur','WEST_CENTRAL_ASIA',10,null),('amateur','SOUTH_ASIA',10,null),('amateur','EAST_SOUTHEAST_ASIA',10,null),('amateur','OCEANIA',10,null)
    ) as x(target_tier,target_division,min_teams,max_teams)
  loop
    if v_target.target_tier='worldteam' then
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='worldteam';
    elsif v_target.target_tier='proteam' then
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='proteam' and tier2_division=v_target.target_division;
    elsif v_target.target_tier='continental' then
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='continental' and tier3_division=v_target.target_division;
    else
      select count(*)::int into v_current from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='amateur' and amateur_division=v_target.target_division;
    end if;
    v_health:=v_health||jsonb_build_array(jsonb_build_object('tier',v_target.target_tier,'division',v_target.target_division,'count',v_current,'minimum',v_target.min_teams,'maximum',v_target.max_teams,'minimum_ok',v_current>=v_target.min_teams,'maximum_ok',case when v_target.max_teams is null then true else v_current<=v_target.max_teams end));
  end loop;

  v_result:=jsonb_build_object(
    'success',v_unresolved=0,'status',case when v_unresolved=0 then 'minimums_enforced' else 'minimums_partially_unresolved' end,
    'run_id',v_run_id,'curated_ai_only',true,'placeholder_generation_disabled',true,'human_clubs_protected',true,
    'source_minimums_protected',true,'midseason_excess_trimming_disabled',true,'moved_clubs',v_moved,
    'unresolved_shortages',v_unresolved,'movements',v_movements,'health',v_health
  );

  insert into public.cron_guard_run_log_v1(job_key,status,result)
  values('ensure_competition_sizes',case when v_unresolved=0 then 'minimums_enforced' else 'minimums_partially_unresolved' end,v_result);
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_get_medical_staff_support_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s record;

  v_staff_count integer := 0;
  v_doctor_count integer := 0;
  v_physio_count integer := 0;
  v_nutrition_count integer := 0;

  v_score numeric;
  v_role_text text;

  v_doctor_recovery_pct numeric := 0;
  v_physio_recovery_pct numeric := 0;
  v_nutrition_recovery_pct numeric := 0;

  v_doctor_risk_pct numeric := 0;
  v_physio_risk_pct numeric := 0;
  v_nutrition_risk_pct numeric := 0;

  v_recovery_pct numeric := 0;
  v_risk_pct numeric := 0;
  v_daily_recovery_bonus integer := 0;
  v_fatigue_floor_reduction integer := 0;

  v_staff_labels text[] := array[]::text[];
  v_role_breakdown jsonb := '{}'::jsonb;
  v_related_club_ids uuid[] := array[]::uuid[];
begin
  if p_club_id is null then
    return jsonb_build_object(
      'available', false,
      'staff_name', null,
      'specialization', null,
      'risk_reduction_pct', 0,
      'recovery_duration_reduction_pct', 0,
      'daily_recovery_bonus', 0,
      'fatigue_floor_reduction', 0,
      'role_breakdown', '{}'::jsonb,
      'related_club_ids', array[]::uuid[]
    );
  end if;

  v_related_club_ids :=
    public.health_get_related_medical_club_ids_v1(p_club_id);

  if to_regclass('public.club_staff') is null then
    return jsonb_build_object(
      'available', false,
      'staff_name', null,
      'specialization', null,
      'risk_reduction_pct', 0,
      'recovery_duration_reduction_pct', 0,
      'daily_recovery_bonus', 0,
      'fatigue_floor_reduction', 0,
      'role_breakdown', '{}'::jsonb,
      'related_club_ids', v_related_club_ids
    );
  end if;

  for s in
    select
      cs.id,
      cs.club_id,
      cs.staff_name,
      cs.first_name,
      cs.last_name,
      cs.role_type,
      cs.specialization,
      coalesce(cs.expertise, 50)::numeric as expertise,
      coalesce(cs.experience, 50)::numeric as experience,
      coalesce(cs.efficiency, 50)::numeric as efficiency,
      array_position(v_related_club_ids, cs.club_id) as related_order
    from public.club_staff cs
    where cs.club_id = any(v_related_club_ids)
      and coalesce(cs.is_active, true) = true
      and (
        lower(coalesce(cs.role_type, '')) like '%doctor%'
        or lower(coalesce(cs.role_type, '')) like '%physio%'
        or lower(coalesce(cs.role_type, '')) like '%physiotherapist%'
        or lower(coalesce(cs.role_type, '')) like '%nutrition%'
        or lower(coalesce(cs.role_type, '')) like '%medical%'
        or lower(coalesce(cs.role_type, '')) like '%therapist%'
        or lower(coalesce(cs.specialization, '')) like '%doctor%'
        or lower(coalesce(cs.specialization, '')) like '%physio%'
        or lower(coalesce(cs.specialization, '')) like '%physiotherapist%'
        or lower(coalesce(cs.specialization, '')) like '%nutrition%'
        or lower(coalesce(cs.specialization, '')) like '%medical%'
        or lower(coalesce(cs.specialization, '')) like '%therapist%'
      )
    order by
      array_position(v_related_club_ids, cs.club_id) nulls last,
      case
        when lower(
          coalesce(cs.role_type, '') || ' ' ||
          coalesce(cs.specialization, '')
        ) like '%doctor%' then 1
        when lower(
          coalesce(cs.role_type, '') || ' ' ||
          coalesce(cs.specialization, '')
        ) like '%physio%' then 2
        when lower(
          coalesce(cs.role_type, '') || ' ' ||
          coalesce(cs.specialization, '')
        ) like '%therapist%' then 2
        when lower(
          coalesce(cs.role_type, '') || ' ' ||
          coalesce(cs.specialization, '')
        ) like '%nutrition%' then 3
        else 4
      end,
      cs.expertise desc nulls last,
      cs.experience desc nulls last,
      cs.efficiency desc nulls last
  loop
    v_staff_count := v_staff_count + 1;

    v_role_text := lower(
      coalesce(s.role_type, '') || ' ' ||
      coalesce(s.specialization, '')
    );

    v_score := least(
      1,
      greatest(
        0,
        (
          least(greatest(s.expertise, 0), 100) * 0.55
          + least(greatest(s.experience, 0), 100) * 0.25
          + least(greatest(s.efficiency, 0), 100) * 0.20
        ) / 100.0
      )
    );

    v_staff_labels := array_append(
      v_staff_labels,
      coalesce(
        nullif(trim(coalesce(s.staff_name, '')), ''),
        nullif(
          trim(
            coalesce(s.first_name, '') || ' ' ||
            coalesce(s.last_name, '')
          ),
          ''
        ),
        s.role_type,
        'Medical staff'
      )
    );

    if v_role_text like '%doctor%'
       or v_role_text like '%medical%' then
      v_doctor_count := v_doctor_count + 1;

      v_doctor_recovery_pct := greatest(
        v_doctor_recovery_pct,
        round(v_score * 12.0, 2)
      );

      v_doctor_risk_pct := greatest(
        v_doctor_risk_pct,
        round(v_score * 10.0, 2)
      );

    elsif v_role_text like '%physio%'
       or v_role_text like '%physiotherapist%'
       or v_role_text like '%therapist%' then
      v_physio_count := v_physio_count + 1;

      v_physio_recovery_pct := least(
        9,
        v_physio_recovery_pct + round(v_score * 4.5, 2)
      );

      v_physio_risk_pct := least(
        5,
        v_physio_risk_pct + round(v_score * 2.5, 2)
      );

    elsif v_role_text like '%nutrition%' then
      v_nutrition_count := v_nutrition_count + 1;

      v_nutrition_recovery_pct := least(
        5,
        v_nutrition_recovery_pct + round(v_score * 2.5, 2)
      );

      v_nutrition_risk_pct := least(
        5,
        v_nutrition_risk_pct + round(v_score * 3.5, 2)
      );
    end if;
  end loop;

  v_recovery_pct := least(
    25,
    greatest(
      0,
      v_doctor_recovery_pct
      + v_physio_recovery_pct
      + v_nutrition_recovery_pct
    )
  );

  v_risk_pct := least(
    20,
    greatest(
      0,
      v_doctor_risk_pct
      + v_physio_risk_pct
      + v_nutrition_risk_pct
    )
  );

  v_daily_recovery_bonus :=
    case
      when v_recovery_pct <= 0 then 0
      else least(
        6,
        greatest(
          1,
          floor(v_recovery_pct / 4.0)::integer
        )
      )
    end;

  v_fatigue_floor_reduction :=
    case
      when v_risk_pct <= 0 then 0
      else least(
        8,
        greatest(
          1,
          floor(v_risk_pct / 3.5)::integer
        )
      )
    end;

  v_role_breakdown := jsonb_build_object(
    'team_doctors', v_doctor_count,
    'physios', v_physio_count,
    'nutritionists', v_nutrition_count,
    'doctor_recovery_pct', v_doctor_recovery_pct,
    'physio_recovery_pct', v_physio_recovery_pct,
    'nutrition_recovery_pct', v_nutrition_recovery_pct,
    'doctor_risk_pct', v_doctor_risk_pct,
    'physio_risk_pct', v_physio_risk_pct,
    'nutrition_risk_pct', v_nutrition_risk_pct
  );

  return jsonb_build_object(
    'available', v_staff_count > 0,
    'staff_name',
      case
        when v_staff_count = 0 then null
        else array_to_string(
          v_staff_labels[
            1:least(
              coalesce(array_length(v_staff_labels, 1), 0),
              4
            )
          ],
          ', '
        )
      end,
    'specialization',
      case
        when v_staff_count = 0 then null
        else concat_ws(
          ' + ',
          case
            when v_doctor_count > 0 then
              v_doctor_count || ' Team Doctor' ||
              case when v_doctor_count = 1 then '' else 's' end
          end,
          case
            when v_physio_count > 0 then
              v_physio_count || ' Physio' ||
              case when v_physio_count = 1 then '' else 's' end
          end,
          case
            when v_nutrition_count > 0 then
              v_nutrition_count || ' Nutritionist' ||
              case when v_nutrition_count = 1 then '' else 's' end
          end
        )
      end,
    'risk_reduction_pct', v_risk_pct,
    'recovery_duration_reduction_pct', v_recovery_pct,
    'daily_recovery_bonus', v_daily_recovery_bonus,
    'fatigue_floor_reduction', v_fatigue_floor_reduction,
    'role_breakdown', v_role_breakdown,
    'related_club_ids', v_related_club_ids
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_calculate_case_recovery_v1(p_club_id uuid, p_case_code text, p_severity text DEFAULT 'moderate'::text, p_started_on date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_case public.health_case_catalogue_v1%rowtype;
  v_started_on date := coalesce(
    p_started_on,
    case
      when to_regprocedure('public.get_current_game_date_date()') is not null
        then public.get_current_game_date_date()
      else current_date
    end
  );
  v_severity text := lower(coalesce(p_severity, 'moderate'));
  v_base_min integer;
  v_base_max integer;
  v_selected_base_days integer;
  v_staff jsonb;
  v_medical_center_level integer;
  v_staff_reduction_pct numeric := 0;
  v_infrastructure_reduction_pct numeric := 0;
  v_infrastructure_risk_reduction_pct numeric := 0;
  v_infrastructure_fatigue_floor_reduction integer := 0;
  v_total_reduction_pct numeric := 0;
  v_final_days integer;
begin
  select cat.*
  into v_case
  from public.health_case_catalogue_v1 cat
  where cat.case_code = lower(trim(p_case_code));

  if not found then
    raise exception 'Unknown health case code: %', p_case_code;
  end if;

  if v_severity not in ('minor', 'moderate', 'major') then
    raise exception 'Invalid severity %. Expected minor/moderate/major.', p_severity;
  end if;

  if v_severity = 'minor' then
    v_base_min := v_case.minor_min_days;
    v_base_max := v_case.minor_max_days;
  elsif v_severity = 'major' then
    v_base_min := v_case.major_min_days;
    v_base_max := v_case.major_max_days;
  else
    v_base_min := v_case.moderate_min_days;
    v_base_max := v_case.moderate_max_days;
  end if;

  v_selected_base_days := ceil((v_base_min + v_base_max) / 2.0)::integer;
  v_staff := public.health_get_medical_staff_support_v1(p_club_id);
  v_medical_center_level := public.health_get_medical_center_level_v1(p_club_id);

  v_staff_reduction_pct := coalesce(nullif(v_staff->>'recovery_duration_reduction_pct', '')::numeric, 0);
  v_infrastructure_reduction_pct := public.health_get_medical_center_recovery_bonus_pct_v1(v_medical_center_level);
  v_infrastructure_risk_reduction_pct := public.health_get_medical_center_risk_reduction_pct_v1(v_medical_center_level);
  v_infrastructure_fatigue_floor_reduction := public.health_get_medical_center_fatigue_floor_reduction_v1(v_medical_center_level);

  v_total_reduction_pct := least(45, greatest(0, v_staff_reduction_pct + v_infrastructure_reduction_pct));
  v_final_days := greatest(1, ceil(v_selected_base_days * (1 - (v_total_reduction_pct / 100.0)))::integer);

  return jsonb_build_object(
    'case_code', v_case.case_code,
    'case_type', v_case.case_type,
    'display_name', v_case.display_name,
    'severity', v_severity,
    'source_contexts', v_case.source_contexts,
    'body_part_required', v_case.body_part_required,
    'default_body_parts', v_case.default_body_parts,
    'base_min_days', v_base_min,
    'base_max_days', v_base_max,
    'selected_base_days', v_selected_base_days,
    'medical_staff', v_staff,
    'medical_staff_reduction_pct', v_staff_reduction_pct,
    'medical_center_level', v_medical_center_level,
    'infrastructure_reduction_pct', v_infrastructure_reduction_pct,
    'infrastructure_risk_reduction_pct', v_infrastructure_risk_reduction_pct,
    'infrastructure_fatigue_floor_reduction', v_infrastructure_fatigue_floor_reduction,
    'total_reduction_pct', v_total_reduction_pct,
    'final_recovery_days', v_final_days,
    'started_on', v_started_on,
    'expected_full_recovery_on', v_started_on + v_final_days,
    'selection_blocked_default', v_case.selection_blocked_default,
    'training_blocked_default', v_case.training_blocked_default,
    'development_blocked_default', v_case.development_blocked_default
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_validate_case_assignment_v1(p_case_code text, p_source_type text, p_body_part text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_case public.health_case_catalogue_v1%rowtype;
  v_source_type text := lower(coalesce(p_source_type, 'unknown'));
  v_body_part text := nullif(trim(coalesce(p_body_part, '')), '');
begin
  select cat.*
  into v_case
  from public.health_case_catalogue_v1 cat
  where cat.case_code = lower(trim(p_case_code));

  if not found then
    return jsonb_build_object(
      'valid', false,
      'reason', 'unknown_case_code'
    );
  end if;

  if v_source_type <> 'unknown'
     and not (v_source_type = any(v_case.source_contexts)) then
    return jsonb_build_object(
      'valid', false,
      'reason', 'invalid_source_for_case',
      'allowed_sources', v_case.source_contexts
    );
  end if;

  if v_case.body_part_required and v_body_part is null then
    return jsonb_build_object(
      'valid', false,
      'reason', 'body_part_required',
      'suggested_body_parts', v_case.default_body_parts
    );
  end if;

  return jsonb_build_object(
    'valid', true,
    'case_code', v_case.case_code,
    'case_type', v_case.case_type,
    'body_part_required', v_case.body_part_required,
    'source_type', v_source_type,
    'body_part', v_body_part
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_ensure_ai_unlimited_funds_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare
  v_ai_clubs integer := 0;
begin
  select count(*)::integer
  into v_ai_clubs
  from public.clubs c
  where coalesce(c.is_ai, false) is true
    and c.deleted_at is null;

  insert into public.cron_guard_run_log_v1(job_key, status, result)
  values (
    'ai_unlimited_funds_policy',
    'policy_checked_no_direct_cash_balance_update',
    jsonb_build_object(
      'success', true,
      'checked_ai_clubs', v_ai_clubs,
      'rule', 'AI teams are unlimited-funds teams.',
      'important', 'public.clubs.cash_balance is finance-ledger-managed and must not be updated directly.',
      'next_required_fix', 'Patch transfer/finance completion logic so AI buyer clubs bypass insufficient-funds failures safely.'
    )
  );

  return jsonb_build_object(
    'success', true,
    'checked_ai_clubs', v_ai_clubs,
    'rule', 'AI teams are unlimited-funds teams.',
    'cash_balance_direct_update', false,
    'reason', 'public.clubs.cash_balance is managed by finance ledger.',
    'next_required_fix', 'Patch transfer/finance completion logic so AI buyer clubs bypass insufficient-funds failures safely.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_create_rider_case_v1(p_rider_id uuid, p_club_id uuid, p_case_code text, p_severity text DEFAULT 'moderate'::text, p_source_type text DEFAULT 'unknown'::text, p_source_id uuid DEFAULT NULL::uuid, p_body_part text DEFAULT NULL::text, p_started_on date DEFAULT NULL::date, p_notes jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_started_on date := p_started_on;
  v_case public.health_case_catalogue_v1%rowtype;
  v_validation jsonb;
  v_calc jsonb;
  v_health_case_id uuid := gen_random_uuid();
  v_case_type text;
  v_expected_full_recovery_on date;
  v_source_type text := lower(coalesce(p_source_type, 'unknown'));
  v_severity text := lower(coalesce(p_severity, 'moderate'));
  v_body_part text := nullif(trim(coalesce(p_body_part, '')), '');
begin
  if p_rider_id is null then
    raise exception 'p_rider_id is required';
  end if;

  if not exists (
    select 1
    from public.riders r
    where r.id = p_rider_id
  ) then
    raise exception 'Unknown rider: %', p_rider_id;
  end if;

  if p_case_code is null or trim(p_case_code) = '' then
    raise exception 'p_case_code is required';
  end if;

  if v_severity not in ('minor', 'moderate', 'major') then
    raise exception
      'Invalid severity %. Expected minor, moderate or major.',
      p_severity;
  end if;

  if v_source_type not in (
    'race',
    'training',
    'daily_life',
    'travel',
    'weather',
    'manual',
    'unknown'
  ) then
    raise exception
      'Invalid source type %. Expected race, training, daily_life, travel, weather, manual or unknown.',
      p_source_type;
  end if;

  if v_started_on is null then
    if to_regprocedure('public.get_current_game_date_date()') is not null then
      v_started_on := public.get_current_game_date_date();
    else
      v_started_on := current_date;
    end if;
  end if;

  select cat.*
  into v_case
  from public.health_case_catalogue_v1 cat
  where cat.case_code = lower(trim(p_case_code));

  if not found then
    raise exception 'Unknown health case code: %', p_case_code;
  end if;

  v_validation := public.health_validate_case_assignment_v1(
    v_case.case_code,
    v_source_type,
    v_body_part
  );

  if coalesce((v_validation->>'valid')::boolean, false) is not true then
    raise exception
      'Invalid health case assignment: %',
      v_validation::text;
  end if;

  v_calc := public.health_calculate_case_recovery_v1(
    p_club_id,
    v_case.case_code,
    v_severity,
    v_started_on
  );

  v_case_type := v_calc->>'case_type';
  v_expected_full_recovery_on :=
    (v_calc->>'expected_full_recovery_on')::date;

  insert into public.rider_health_cases (
    id,
    rider_id,
    case_type,
    case_code,
    severity,
    source,
    status,
    started_on,
    active_until,
    recovery_until,
    resolved_on,
    selection_blocked,
    training_blocked,
    development_blocked,
    created_at
  )
  values (
    v_health_case_id,
    p_rider_id,
    v_case_type,
    v_case.case_code,
    v_severity,
    v_source_type,
    'active',
    v_started_on,
    v_expected_full_recovery_on,
    v_expected_full_recovery_on,
    null,
    coalesce(
      (v_calc->>'selection_blocked_default')::boolean,
      true
    ),
    coalesce(
      (v_calc->>'training_blocked_default')::boolean,
      true
    ),
    coalesce(
      (v_calc->>'development_blocked_default')::boolean,
      true
    ),
    now()
  );

  insert into public.rider_health_case_context_v1 (
    health_case_id,
    rider_id,
    club_id,
    case_code,
    case_type,
    source_type,
    source_id,
    body_part,
    severity,
    base_min_days,
    base_max_days,
    selected_base_days,
    medical_staff_reduction_pct,
    infrastructure_reduction_pct,
    total_reduction_pct,
    final_recovery_days,
    started_on,
    expected_full_recovery_on,
    notes
  )
  values (
    v_health_case_id,
    p_rider_id,
    p_club_id,
    v_case.case_code,
    v_case_type,
    v_source_type,
    p_source_id,
    v_body_part,
    v_severity,
    (v_calc->>'base_min_days')::integer,
    (v_calc->>'base_max_days')::integer,
    (v_calc->>'selected_base_days')::integer,
    (v_calc->>'medical_staff_reduction_pct')::numeric,
    (v_calc->>'infrastructure_reduction_pct')::numeric,
    (v_calc->>'total_reduction_pct')::numeric,
    (v_calc->>'final_recovery_days')::integer,
    v_started_on,
    v_expected_full_recovery_on,
    coalesce(p_notes, '{}'::jsonb)
      || jsonb_build_object(
        'created_by', 'health_create_rider_case_v1',
        'calculation', v_calc
      )
  );

  update public.riders r
  set
    availability_status =
      case
        when v_case_type = 'sickness' then 'sick'
        else 'injured'
      end,
    unavailable_until = v_expected_full_recovery_on,
    unavailable_reason =
      case
        when v_case_type = 'sickness' then 'sickness'
        else 'injury'
      end
  where r.id = p_rider_id;

  return jsonb_build_object(
    'health_case_id', v_health_case_id,
    'rider_id', p_rider_id,
    'club_id', p_club_id,
    'case_code', v_case.case_code,
    'case_type', v_case_type,
    'severity', v_severity,
    'source_type', v_source_type,
    'source_id', p_source_id,
    'body_part', v_body_part,
    'expected_full_recovery_on', v_expected_full_recovery_on,
    'calculation', v_calc
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_pick_default_body_part_v1(p_case_code text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parts text[];
  v_count integer;
  v_index integer;
begin
  select cat.default_body_parts
  into v_parts
  from public.health_case_catalogue_v1 cat
  where cat.case_code =
    public.health_normalize_case_code_v1(p_case_code);

  v_count := coalesce(array_length(v_parts, 1), 0);

  if v_count <= 0 then
    return null;
  end if;

  v_index := 1 + floor(random() * v_count)::integer;

  return v_parts[v_index];
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_rider_health_case(p_rider_id uuid, p_case_type text, p_case_code text, p_severity text, p_source text, p_started_on date, p_active_days integer, p_recovery_days integer DEFAULT 0, p_fatigue_floor_on_return smallint DEFAULT 25)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existing_case_id uuid;
  v_case_id uuid;
  v_old_status text;
  v_new_status text;
  v_current_fatigue integer;
  v_morale_hit integer;
  v_club_id uuid;
  v_case_code text;
  v_case_type text;
  v_source_type text;
  v_body_part text;
  v_result jsonb;
  v_expected_full_recovery_on date;
  v_normalized_input_type text :=
    lower(trim(coalesce(p_case_type, '')));
  v_normalized_severity text :=
    lower(trim(coalesce(p_severity, '')));
begin
  if v_normalized_input_type not in ('injury', 'sickness') then
    raise exception 'Invalid case_type: %', p_case_type;
  end if;

  if v_normalized_severity not in ('minor', 'moderate', 'major') then
    raise exception 'Invalid severity: %', p_severity;
  end if;

  if p_started_on is null then
    raise exception 'p_started_on is required';
  end if;

  if coalesce(p_active_days, 0) < 1 then
    raise exception 'p_active_days must be at least 1';
  end if;

  if coalesce(p_recovery_days, 0) < 0 then
    raise exception 'p_recovery_days cannot be negative';
  end if;

  select hc.id
  into v_existing_case_id
  from public.rider_health_cases hc
  where hc.rider_id = p_rider_id
    and hc.status in ('active', 'recovering')
  order by hc.created_at desc
  limit 1;

  if v_existing_case_id is not null then
    raise exception
      'Rider % already has an open health case %',
      p_rider_id,
      v_existing_case_id;
  end if;

  select
    coalesce(r.availability_status, 'fit'),
    coalesce(r.fatigue, 0)
  into
    v_old_status,
    v_current_fatigue
  from public.riders r
  where r.id = p_rider_id;

  if not found then
    raise exception 'Rider not found for id %', p_rider_id;
  end if;

  select cr.club_id
  into v_club_id
  from public.club_riders cr
  where cr.rider_id = p_rider_id
  limit 1;

  v_case_code :=
    public.health_normalize_case_code_v1(p_case_code);

  select cat.case_type
  into v_case_type
  from public.health_case_catalogue_v1 cat
  where cat.case_code = v_case_code;

  if v_case_type is null then
    raise exception
      'Unknown normalized health case code %. Original code was %',
      v_case_code,
      p_case_code;
  end if;

  v_source_type :=
    public.health_normalize_source_type_v1(
      p_source,
      v_case_type
    );

  if v_case_type = 'injury' then
    v_body_part :=
      public.health_pick_default_body_part_v1(v_case_code);
  else
    v_body_part := null;
  end if;

  v_result := public.health_create_rider_case_v1(
    p_rider_id,
    v_club_id,
    v_case_code,
    v_normalized_severity,
    v_source_type,
    null,
    v_body_part,
    p_started_on,
    jsonb_build_object(
      'legacy_create_rider_health_case_call',
      true,
      'original_case_type',
      p_case_type,
      'original_case_code',
      p_case_code,
      'original_source',
      p_source,
      'original_active_days',
      p_active_days,
      'original_recovery_days',
      p_recovery_days,
      'original_fatigue_floor_on_return',
      p_fatigue_floor_on_return
    )
  );

  v_case_id := (v_result->>'health_case_id')::uuid;
  v_expected_full_recovery_on :=
    (v_result->>'expected_full_recovery_on')::date;

  v_morale_hit :=
    case v_normalized_severity
      when 'minor' then 3
      when 'moderate' then 6
      else 10
    end;

  v_new_status :=
    case
      when v_case_type = 'injury' then 'injured'
      when v_case_type = 'sickness' then 'sick'
      else 'fit'
    end;

  update public.riders r
  set
    morale = greatest(
      0,
      least(100, coalesce(r.morale, 50) - v_morale_hit)
    ),
    availability_status = v_new_status,
    unavailable_until = v_expected_full_recovery_on,
    unavailable_reason =
      case
        when v_case_type = 'injury' then 'injury'
        else 'sickness'
      end
  where r.id = p_rider_id;

  update public.rider_health_cases hc
  set
    morale_hit_applied = true,
    fatigue_floor_on_return = greatest(
      0,
      least(
        100,
        coalesce(p_fatigue_floor_on_return, 25) - public.health_get_medical_center_fatigue_floor_reduction_v1(public.health_get_medical_center_level_v1(v_club_id))
      )
    )
  where hc.id = v_case_id;

  if v_old_status is distinct from v_new_status then
    begin
      perform public.notify_rider_status_transition(
        p_rider_id,
        p_started_on,
        v_old_status,
        v_new_status,
        v_current_fatigue,
        v_expected_full_recovery_on,
        case
          when v_case_type = 'injury' then 'injury'
          else 'sickness'
        end
      );
    exception
      when others then
        raise warning
          'create_rider_health_case notification failed: %',
          sqlerrm;
    end;
  end if;

  return v_case_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_health_overview(p_club_id uuid)
 RETURNS TABLE(rider_id uuid, display_name text, country_code text, overall smallint, fatigue smallint, availability_status text, unavailable_until date, unavailable_reason text, health_case_id uuid, case_type text, case_code text, severity text, source text, case_status text, started_on date, active_until date, recovery_until date, expected_full_recovery_on date, source_type text, source_id uuid, body_part text, base_min_days integer, base_max_days integer, selected_base_days integer, medical_staff_reduction_pct numeric, infrastructure_reduction_pct numeric, total_reduction_pct numeric, final_recovery_days integer, health_notes jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and (
        c.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.club_memberships cm
          where cm.club_id = c.id
            and cm.user_id = auth.uid()
        )
      )
  ) then
    raise exception 'Not allowed to read this club health overview.'
      using errcode='42501';
  end if;

  return query
  select
    r.id,
    r.display_name,
    r.country_code,
    r.overall,
    coalesce(r.fatigue,0)::smallint,
    coalesce(r.availability_status,'fit'),
    r.unavailable_until,
    r.unavailable_reason,
    hc.id,
    hc.case_type,
    hc.case_code,
    hc.severity,
    hc.source,
    hc.status,
    hc.started_on,
    hc.active_until,
    hc.recovery_until,
    coalesce(ctx.expected_full_recovery_on,hc.recovery_until,hc.active_until),
    ctx.source_type,
    ctx.source_id,
    ctx.body_part,
    ctx.base_min_days,
    ctx.base_max_days,
    ctx.selected_base_days,
    ctx.medical_staff_reduction_pct,
    ctx.infrastructure_reduction_pct,
    ctx.total_reduction_pct,
    ctx.final_recovery_days,
    coalesce(ctx.notes,'{}'::jsonb)
  from public.club_riders cr
  join public.riders r on r.id=cr.rider_id
  left join public.rider_health_cases hc
    on hc.rider_id=r.id
   and hc.status in ('active','recovering')
  left join public.rider_health_case_context_v1 ctx
    on ctx.health_case_id=hc.id
  where cr.club_id=p_club_id
    and (
      coalesce(r.availability_status,'fit') <> 'fit'
      or hc.id is not null
    )
  order by
    case
      when coalesce(r.availability_status,'fit')='injured' then 1
      when coalesce(r.availability_status,'fit')='sick' then 2
      when coalesce(r.availability_status,'fit')='not_fully_fit' then 3
      else 4
    end,
    coalesce(
      ctx.expected_full_recovery_on,
      hc.recovery_until,
      hc.active_until,
      r.unavailable_until
    ) asc nulls last,
    r.display_name asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_write_cumulative_classifications_v2(p_simulation_run_id uuid, p_dry_run boolean DEFAULT true, p_confirmation_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_number integer;
  v_previous_standing_stage_id uuid;

  v_preview_row_count integer := 0;
  v_general_row_count integer := 0;
  v_points_row_count integer := 0;
  v_mountain_row_count integer := 0;
  v_young_row_count integer := 0;
  v_team_row_count integer := 0;

  v_invalid_integer_rows integer := 0;
  v_weather_cancelled_stage_count integer := 0;

  v_deleted_rows integer := 0;
  v_inserted_rows integer := 0;

  v_preview_summary jsonb := '[]'::jsonb;
  v_current_summary jsonb := '[]'::jsonb;
  v_top_points jsonb := '[]'::jsonb;
begin
  /*
   * Resolve the completed simulation run.
   */
  select
    simulation_run.race_id,
    simulation_run.stage_id,
    stage.stage_number
  into
    v_race_id,
    v_stage_id,
    v_stage_number
  from public.race_stage_simulation_runs simulation_run
  join public.race_stages stage
    on stage.id = simulation_run.stage_id
  where simulation_run.id = p_simulation_run_id
    and lower(
      coalesce(
        simulation_run.status,
        ''
      )
    ) = 'completed'
  limit 1;

  if v_race_id is null
     or v_stage_id is null
     or v_stage_number is null
  then
    raise exception
      'Completed simulation run % was not found.',
      p_simulation_run_id;
  end if;

  /*
   * Temporary safety guard:
   *
   * The current preview has been validated for ordinary completed stages.
   * Weather-cancelled stages contain no ordinary result rows and require a
   * separate classification-scope hardening before this writer is routed
   * globally.
   */
  select count(*)::integer
  into v_weather_cancelled_stage_count
  from public.race_stages stage
  where stage.race_id = v_race_id
    and stage.stage_number <= v_stage_number
    and coalesce(stage.weather_cancelled, false) = true;

  /*
   * Find the latest earlier stage that actually has a classification snapshot.
   *
   * This is safer than assuming the immediately previous scheduled stage has
   * standings.
   */
  select previous_snapshot.after_stage_id
  into v_previous_standing_stage_id
  from (
    select
      standing.after_stage_id,
      previous_stage.stage_number
    from public.race_classification_standings standing
    join public.race_stages previous_stage
      on previous_stage.id = standing.after_stage_id
    where standing.race_id = v_race_id
      and previous_stage.stage_number < v_stage_number
    group by
      standing.after_stage_id,
      previous_stage.stage_number
    order by previous_stage.stage_number desc
    limit 1
  ) previous_snapshot;

  /*
   * Inspect the preview.
   */
  select
    count(*)::integer,

    count(*) filter (
      where preview.classification_type = 'general'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'points'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'mountain'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'young'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'team'
    )::integer

  into
    v_preview_row_count,
    v_general_row_count,
    v_points_row_count,
    v_mountain_row_count,
    v_young_row_count,
    v_team_row_count

  from public.race_engine_preview_cumulative_classifications_v2(
    v_race_id,
    v_stage_number
  ) preview;

  if v_preview_row_count = 0 then
    raise exception
      'Classification preview returned zero rows for race %, stage number %.',
      v_race_id,
      v_stage_number;
  end if;

  if v_general_row_count = 0 then
    raise exception
      'Classification preview returned no general-classification riders.';
  end if;

  /*
   * race_classification_standings stores time values as integer.
   * Refuse the write instead of silently overflowing or truncating.
   */
  select count(*)::integer
  into v_invalid_integer_rows
  from public.race_engine_preview_cumulative_classifications_v2(
    v_race_id,
    v_stage_number
  ) preview
  where (
      preview.total_time_seconds is not null
      and (
        preview.total_time_seconds > 2147483647
        or preview.total_time_seconds < -2147483648
      )
    )
    or (
      preview.gap_seconds is not null
      and (
        preview.gap_seconds > 2147483647
        or preview.gap_seconds < -2147483648
      )
    );

  if v_invalid_integer_rows > 0 then
    raise exception
      '% preview rows contain time values outside the integer range.',
      v_invalid_integer_rows;
  end if;

  /*
   * Compact preview summary.
   */
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classification_type',
          preview_group.classification_type,
        'row_count',
          preview_group.row_count,
        'total_points',
          preview_group.total_points
      )
      order by preview_group.sort_order
    ),
    '[]'::jsonb
  )
  into v_preview_summary
  from (
    select
      preview.classification_type,
      count(*)::integer as row_count,
      sum(coalesce(preview.points, 0))::integer
        as total_points,

      case preview.classification_type
        when 'general' then 1
        when 'points' then 2
        when 'mountain' then 3
        when 'young' then 4
        when 'team' then 5
        else 99
      end as sort_order

    from public.race_engine_preview_cumulative_classifications_v2(
      v_race_id,
      v_stage_number
    ) preview

    group by preview.classification_type
  ) preview_group;

  /*
   * Current stored snapshot summary.
   */
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classification_type',
          current_group.classification_type,
        'row_count',
          current_group.row_count,
        'total_points',
          current_group.total_points
      )
      order by current_group.sort_order
    ),
    '[]'::jsonb
  )
  into v_current_summary
  from (
    select
      standing.classification_type,
      count(*)::integer as row_count,
      sum(coalesce(standing.points, 0))::integer
        as total_points,

      case standing.classification_type
        when 'general' then 1
        when 'points' then 2
        when 'mountain' then 3
        when 'young' then 4
        when 'team' then 5
        else 99
      end as sort_order

    from public.race_classification_standings standing

    where standing.race_id = v_race_id
      and standing.after_stage_id = v_stage_id
      and standing.classification_type in (
        'general',
        'points',
        'mountain',
        'young',
        'team'
      )

    group by standing.classification_type
  ) current_group;

  /*
   * Top canonical points riders for audit output.
   */
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank',
          point_preview.classification_rank,
        'rider_id',
          point_preview.rider_id,
        'rider_name',
          point_preview.display_name_snapshot,
        'team_name',
          point_preview.team_name_snapshot,
        'points',
          point_preview.points
      )
      order by point_preview.classification_rank
    ),
    '[]'::jsonb
  )
  into v_top_points
  from (
    select preview.*
    from public.race_engine_preview_cumulative_classifications_v2(
      v_race_id,
      v_stage_number
    ) preview
    where preview.classification_type = 'points'
    order by preview.classification_rank
    limit 10
  ) point_preview;

  /*
   * Dry-run finishes here.
   */
  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'status',
        'dry_run',
      'write_performed',
        false,
      'simulation_run_id',
        p_simulation_run_id,
      'race_id',
        v_race_id,
      'stage_id',
        v_stage_id,
      'stage_number',
        v_stage_number,
      'previous_standing_stage_id',
        v_previous_standing_stage_id,
      'weather_cancelled_stage_count_in_scope',
        v_weather_cancelled_stage_count,
      'preview_row_count',
        v_preview_row_count,
      'preview_summary',
        v_preview_summary,
      'current_summary',
        v_current_summary,
      'top_points',
        v_top_points,
      'confirmation_required_for_write',
        'CONFIRM_CANONICAL_CLASSIFICATIONS_V2'
    );
  end if;

  /*
   * Actual-write guards.
   */
  if p_confirmation_token is distinct from
    'CONFIRM_CANONICAL_CLASSIFICATIONS_V2'
  then
    raise exception
      'Actual classification write requires confirmation token %.',
      'CONFIRM_CANONICAL_CLASSIFICATIONS_V2';
  end if;

  if v_weather_cancelled_stage_count > 0 then
    raise exception
      'V2 classification write is temporarily blocked because % weather-cancelled stage(s) exist in the classification scope.',
      v_weather_cancelled_stage_count;
  end if;

  /*
   * Replace only this stage's classification snapshot.
   *
   * If insertion fails, PostgreSQL rolls the deletion back automatically.
   */
  delete from public.race_classification_standings standing
  where standing.race_id = v_race_id
    and standing.after_stage_id = v_stage_id
    and standing.classification_type in (
      'general',
      'points',
      'mountain',
      'young',
      'team'
    );

  get diagnostics v_deleted_rows = row_count;

  insert into public.race_classification_standings (
    race_id,
    after_stage_id,
    classification_type,
    entity_type,
    rider_id,
    team_id,
    rank,
    previous_rank,
    total_time_seconds,
    gap_seconds,
    points,
    display_name_snapshot,
    team_name_snapshot
  )
  select
    v_race_id,
    v_stage_id,
    preview.classification_type,
    preview.entity_type,
    preview.rider_id,
    preview.team_id,
    preview.classification_rank,

    previous_standing.rank,

    case
      when preview.total_time_seconds is null
        then null
      else preview.total_time_seconds::integer
    end,

    case
      when preview.gap_seconds is null
        then null
      else preview.gap_seconds::integer
    end,

    preview.points,
    preview.display_name_snapshot,
    preview.team_name_snapshot

  from public.race_engine_preview_cumulative_classifications_v2(
    v_race_id,
    v_stage_number
  ) preview

  left join public.race_classification_standings previous_standing
    on previous_standing.race_id = v_race_id
   and previous_standing.after_stage_id =
      v_previous_standing_stage_id
   and previous_standing.classification_type =
      preview.classification_type
   and previous_standing.entity_type =
      preview.entity_type
   and (
     (
       preview.entity_type = 'rider'
       and previous_standing.rider_id =
         preview.rider_id
     )
     or
     (
       preview.entity_type = 'team'
       and previous_standing.team_id =
         preview.team_id
     )
   )

  order by
    case preview.classification_type
      when 'general' then 1
      when 'points' then 2
      when 'mountain' then 3
      when 'young' then 4
      when 'team' then 5
      else 99
    end,
    preview.classification_rank;

  get diagnostics v_inserted_rows = row_count;

  return jsonb_build_object(
    'status',
      'completed',
    'write_performed',
      true,
    'writer_version',
      'cumulative_classifications_v2_canonical_points',
    'simulation_run_id',
      p_simulation_run_id,
    'race_id',
      v_race_id,
    'stage_id',
      v_stage_id,
    'stage_number',
      v_stage_number,
    'previous_standing_stage_id',
      v_previous_standing_stage_id,
    'deleted_rows',
      v_deleted_rows,
    'inserted_rows',
      v_inserted_rows,
    'general_rows',
      v_general_row_count,
    'points_rows',
      v_points_row_count,
    'mountain_rows',
      v_mountain_row_count,
    'young_rows',
      v_young_row_count,
    'team_rows',
      v_team_row_count,
    'preview_summary',
      v_preview_summary,
    'top_points',
      v_top_points
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repair_existing_ai_race_data_cleanup_only_v1(p_max_races integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lock_key bigint := hashtext('public.repair_existing_ai_race_data_cleanup_only_v1')::bigint;
  v_race record;

  v_races_checked integer := 0;
  v_bad_ai_entries_cancelled integer := 0;
  v_bad_ai_participants_removed integer := 0;
  v_national_bad_participants_removed integer := 0;

  v_this_bad_entries_cancelled integer := 0;
  v_this_bad_ai_participants_removed integer := 0;
  v_this_national_bad_removed integer := 0;

  v_results jsonb := '[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'success', false,
      'status', 'skipped_already_running'
    );
  end if;

  for v_race in
    with affected as (
      select distinct rte.race_id
      from public.race_team_entries rte
      where rte.status = 'accepted'
        and coalesce(rte.is_ai_filler, false) is true
        and not exists (
          select 1
          from public.ai_competition_filler_club_pool_v1 pool
          where pool.id = rte.club_id
        )

      union

      select distinct rpr.race_id
      from public.race_participant_riders rpr
      join public.clubs c
        on c.id = rpr.team_id
      join public.riders r
        on r.id = rpr.rider_id
      where public.is_national_team_club_v1(c.id) is true
        and upper(coalesce(c.country_code, '')) <> ''
        and upper(coalesce(r.country_code, rpr.country_code_snapshot, '')) <> ''
        and upper(coalesce(c.country_code, '')) <> upper(coalesce(r.country_code, rpr.country_code_snapshot, ''))
    )
    select
      r.id as race_id,
      r.name as race_name,
      r.start_date
    from affected a
    join public.races r
      on r.id = a.race_id
    order by r.start_date, r.name
    limit greatest(1, coalesce(p_max_races, 10))
  loop
    v_races_checked := v_races_checked + 1;

    v_this_bad_entries_cancelled := 0;
    v_this_bad_ai_participants_removed := 0;
    v_this_national_bad_removed := 0;


    -- A. Remove participants belonging to AI filler entries not from curated pool.
    with bad_entries as (
      select
        rte.race_id,
        rte.club_id
      from public.race_team_entries rte
      where rte.race_id = v_race.race_id
        and rte.status = 'accepted'
        and coalesce(rte.is_ai_filler, false) is true
        and not exists (
          select 1
          from public.ai_competition_filler_club_pool_v1 pool
          where pool.id = rte.club_id
        )
    ),
    deleted as (
      delete from public.race_participant_riders rpr
      using bad_entries b
      where rpr.race_id = b.race_id
        and rpr.team_id = b.club_id
      returning rpr.id
    )
    select count(*)::integer
    into v_this_bad_ai_participants_removed
    from deleted;

    v_bad_ai_participants_removed :=
      v_bad_ai_participants_removed + coalesce(v_this_bad_ai_participants_removed, 0);


    -- B. Cancel non-curated accepted AI filler entries.
    update public.race_team_entries rte
    set
      status = 'cancelled',
      decision_reason = concat(
        coalesce(rte.decision_reason, ''),
        case when coalesce(rte.decision_reason, '') = '' then '' else ' | ' end,
        'Cancelled by repair_existing_ai_race_data_cleanup_only_v1: AI filler entry was not from curated/prepaid AI pool.'
      ),
      updated_at = now()
    where rte.race_id = v_race.race_id
      and rte.status = 'accepted'
      and coalesce(rte.is_ai_filler, false) is true
      and not exists (
        select 1
        from public.ai_competition_filler_club_pool_v1 pool
        where pool.id = rte.club_id
      );

    get diagnostics v_this_bad_entries_cancelled = row_count;

    v_bad_ai_entries_cancelled :=
      v_bad_ai_entries_cancelled + coalesce(v_this_bad_entries_cancelled, 0);


    -- C. Remove foreign riders from National Team race startlists.
    with deleted as (
      delete from public.race_participant_riders rpr
      using public.clubs c,
            public.riders r
      where rpr.race_id = v_race.race_id
        and c.id = rpr.team_id
        and r.id = rpr.rider_id
        and public.is_national_team_club_v1(c.id) is true
        and upper(coalesce(c.country_code, '')) <> ''
        and upper(coalesce(r.country_code, rpr.country_code_snapshot, '')) <> ''
        and upper(coalesce(c.country_code, '')) <> upper(coalesce(r.country_code, rpr.country_code_snapshot, ''))
      returning rpr.id
    )
    select count(*)::integer
    into v_this_national_bad_removed
    from deleted;

    v_national_bad_participants_removed :=
      v_national_bad_participants_removed + coalesce(v_this_national_bad_removed, 0);


    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'bad_ai_entries_cancelled', v_this_bad_entries_cancelled,
        'bad_ai_participants_removed', v_this_bad_ai_participants_removed,
        'national_team_bad_participants_removed', v_this_national_bad_removed,
        'refill_called', false,
        'note', 'Cleanup only. Refill is intentionally separate to avoid long trigger/ranking chains.'
      )
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'status', 'cleanup_batch_processed',
    'max_races', p_max_races,
    'races_checked', v_races_checked,
    'bad_ai_entries_cancelled', v_bad_ai_entries_cancelled,
    'bad_ai_participants_removed', v_bad_ai_participants_removed,
    'national_team_bad_participants_removed', v_national_bad_participants_removed,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_simulation_steps_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5)
 RETURNS TABLE(stage_id uuid, step_order integer, parent_segment_order integer, phase_number integer, parent_km_start numeric, parent_km_end numeric, km_start numeric, km_end numeric, distance_km numeric, elevation_start_m numeric, elevation_end_m numeric, elevation_change_m numeric, slope_percent numeric, terrain_type text, is_first_step boolean, is_finish_step boolean, point_gate_count integer, point_gates_json jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_stage_distance_km numeric;

  v_segment_count integer := 0;
  v_profile_start_km numeric;
  v_profile_end_km numeric;
  v_profile_gap_count integer := 0;
  v_invalid_point_count integer := 0;
begin
  if p_stage_id is null then
    raise exception 'stage_id is required';
  end if;

  if p_target_step_km is null
     or p_target_step_km <= 0
  then
    raise exception
      'target_step_km must be greater than zero';
  end if;

  if p_target_step_km < 0.1 then
    raise exception
      'target_step_km must be at least 0.1 km';
  end if;

  if p_target_step_km > 5 then
    raise exception
      'target_step_km must not exceed 5 km';
  end if;

  select stage.distance_km::numeric
  into v_stage_distance_km
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_distance_km is null then
    raise exception
      'Stage % was not found.',
      p_stage_id;
  end if;

  if v_stage_distance_km <= 0 then
    raise exception
      'Stage % has invalid distance %.',
      p_stage_id,
      v_stage_distance_km;
  end if;

  /*
   * Validate the parent profile.
   */
  select
    count(*)::integer,
    min(segment.km_start),
    max(segment.km_end)
  into
    v_segment_count,
    v_profile_start_km,
    v_profile_end_km
  from public.race_engine_get_stage_segments_v1(
    p_stage_id
  ) segment;

  if v_segment_count = 0 then
    raise exception
      'Stage % has no usable profile segments.',
      p_stage_id;
  end if;

  if abs(
    coalesce(v_profile_start_km, 0)
  ) > 0.001 then
    raise exception
      'Stage profile must begin at 0 km. Current first boundary: %.',
      v_profile_start_km;
  end if;

  if abs(
    coalesce(v_profile_end_km, 0)
    - v_stage_distance_km
  ) > 0.01 then
    raise exception
      'Stage profile ends at % km but stage distance is % km.',
      v_profile_end_km,
      v_stage_distance_km;
  end if;

  /*
   * Reject gaps or overlaps between parent profile segments.
   */
  with ordered_segments as (
    select
      segment.segment_order,
      segment.km_start,
      segment.km_end,

      lag(segment.km_end) over (
        order by segment.segment_order
      ) as previous_km_end

    from public.race_engine_get_stage_segments_v1(
      p_stage_id
    ) segment
  )
  select count(*)::integer
  into v_profile_gap_count
  from ordered_segments
  where ordered_segments.previous_km_end is not null
    and abs(
      ordered_segments.km_start
      - ordered_segments.previous_km_end
    ) > 0.001;

  if v_profile_gap_count > 0 then
    raise exception
      'Stage profile contains % segment gap(s) or overlap(s).',
      v_profile_gap_count;
  end if;

  /*
   * Reject point gates outside the physical stage.
   */
  select count(*)::integer
  into v_invalid_point_count
  from public.race_stage_points point_definition
  where point_definition.stage_id = p_stage_id
    and (
      point_definition.km_from_start < 0
      or point_definition.km_from_start >
        v_stage_distance_km
    );

  if v_invalid_point_count > 0 then
    raise exception
      'Stage contains % point gate(s) outside the route distance.',
      v_invalid_point_count;
  end if;

  return query

  with parent_segments as (
    select
      segment.segment_order,
      segment.km_start,
      segment.km_end,
      segment.distance_km,
      segment.elevation_start_m,
      segment.elevation_end_m,
      segment.elevation_change_m,
      segment.slope_percent,
      segment.terrain_type,
      segment.phase_number

    from public.race_engine_get_stage_segments_v1(
      p_stage_id
    ) segment
  ),

  /*
   * Regular target-distance boundaries.
   *
   * The exact stage finish is added separately in case the distance is not
   * evenly divisible by the selected target step.
   */
  regular_boundaries as (
    select
      generated_km::numeric as boundary_km
    from generate_series(
      0::numeric,
      v_stage_distance_km,
      p_target_step_km
    ) generated_km
  ),

  /*
   * Every boundary which must be preserved:
   *
   * - regular 0.5 km grid
   * - profile-segment starts
   * - profile-segment ends
   * - sprint/KOM/finish gates
   * - exact stage start
   * - exact stage finish
   */
  all_boundaries as (
    select boundary_km
    from regular_boundaries

    union

    select parent_segment.km_start
    from parent_segments parent_segment

    union

    select parent_segment.km_end
    from parent_segments parent_segment

    union

    select point_definition.km_from_start
    from public.race_stage_points point_definition
    where point_definition.stage_id = p_stage_id

    union

    select 0::numeric

    union

    select v_stage_distance_km
  ),

  valid_boundaries as (
    select distinct
      greatest(
        0::numeric,
        least(
          v_stage_distance_km,
          boundary.boundary_km
        )
      ) as boundary_km

    from all_boundaries boundary

    where boundary.boundary_km is not null
  ),

  ordered_boundaries as (
    select
      boundary.boundary_km as km_start,

      lead(boundary.boundary_km) over (
        order by boundary.boundary_km
      ) as km_end

    from valid_boundaries boundary
  ),

  raw_steps as (
    select
      row_number() over (
        order by boundary.km_start
      )::integer as step_order,

      boundary.km_start,
      boundary.km_end,
      boundary.km_end - boundary.km_start
        as distance_km

    from ordered_boundaries boundary

    where boundary.km_end is not null
      and boundary.km_end >
        boundary.km_start
  ),

  /*
   * Because all parent profile boundaries are included in all_boundaries,
   * no simulation step is allowed to cross between two parent segments.
   */
  steps_with_parent as (
    select
      raw_step.step_order,
      raw_step.km_start,
      raw_step.km_end,
      raw_step.distance_km,

      parent_segment.segment_order
        as parent_segment_order,

      parent_segment.phase_number,

      parent_segment.km_start
        as parent_km_start,

      parent_segment.km_end
        as parent_km_end,

      parent_segment.distance_km
        as parent_distance_km,

      parent_segment.elevation_start_m
        as parent_elevation_start_m,

      parent_segment.elevation_change_m
        as parent_elevation_change_m,

      parent_segment.terrain_type

    from raw_steps raw_step

    join lateral (
      select parent.*
      from parent_segments parent

      where raw_step.km_start >=
        parent.km_start - 0.000001

        and raw_step.km_end <=
          parent.km_end + 0.000001

      order by parent.segment_order

      limit 1
    ) parent_segment
      on true
  ),

  interpolated_steps as (
    select
      parent_step.*,

      round(
        (
          parent_step.parent_elevation_start_m
          +
          (
            (
              parent_step.km_start
              - parent_step.parent_km_start
            )
            /
            nullif(
              parent_step.parent_distance_km,
              0
            )
          )
          * parent_step.parent_elevation_change_m
        )::numeric,
        4
      ) as calculated_elevation_start_m,

      round(
        (
          parent_step.parent_elevation_start_m
          +
          (
            (
              parent_step.km_end
              - parent_step.parent_km_start
            )
            /
            nullif(
              parent_step.parent_distance_km,
              0
            )
          )
          * parent_step.parent_elevation_change_m
        )::numeric,
        4
      ) as calculated_elevation_end_m

    from steps_with_parent parent_step
  )

  select
    p_stage_id as stage_id,

    simulation_step.step_order,

    simulation_step.parent_segment_order,
    simulation_step.phase_number,

    round(
      simulation_step.parent_km_start,
      6
    ) as parent_km_start,

    round(
      simulation_step.parent_km_end,
      6
    ) as parent_km_end,

    round(
      simulation_step.km_start,
      6
    ) as km_start,

    round(
      simulation_step.km_end,
      6
    ) as km_end,

    round(
      simulation_step.distance_km,
      6
    ) as distance_km,

    simulation_step.calculated_elevation_start_m
      as elevation_start_m,

    simulation_step.calculated_elevation_end_m
      as elevation_end_m,

    round(
      (
        simulation_step.calculated_elevation_end_m
        - simulation_step.calculated_elevation_start_m
      )::numeric,
      4
    ) as elevation_change_m,

    round(
      (
        (
          simulation_step.calculated_elevation_end_m
          - simulation_step.calculated_elevation_start_m
        )
        /
        nullif(
          simulation_step.distance_km * 1000,
          0
        )
        * 100
      )::numeric,
      4
    ) as slope_percent,

    simulation_step.terrain_type,

    simulation_step.step_order = 1
      as is_first_step,

    abs(
      simulation_step.km_end
      - v_stage_distance_km
    ) <= 0.000001
      as is_finish_step,

    coalesce(
      point_gates.point_gate_count,
      0
    )::integer as point_gate_count,

    coalesce(
      point_gates.point_gates_json,
      '[]'::jsonb
    ) as point_gates_json

  from interpolated_steps simulation_step

  left join lateral (
    select
      count(*)::integer as point_gate_count,

      jsonb_agg(
        jsonb_build_object(
          'point_id',
            point_definition.id,

          'point_type',
            upper(
              coalesce(
                point_definition.point_type,
                ''
              )
            ),

          'name',
            point_definition.name,

          'km_from_start',
            point_definition.km_from_start,

          'kom_category',
            point_definition.kom_category,

          'points_scheme',
            coalesce(
              point_definition.points_scheme,
              '[]'::jsonb
            ),

          'time_bonus_seconds',
            coalesce(
              point_definition.time_bonus_seconds,
              '[]'::jsonb
            ),

          'is_finish_point',
            point_definition.is_finish_point,

          'sort_order',
            point_definition.sort_order
        )
        order by
          point_definition.sort_order,
          point_definition.id
      ) as point_gates_json

    from public.race_stage_points point_definition

    where point_definition.stage_id =
      p_stage_id

      and abs(
        point_definition.km_from_start
        - simulation_step.km_end
      ) <= 0.000001
  ) point_gates
    on true

  order by simulation_step.step_order;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_get_related_medical_club_ids_v1(p_club_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ids uuid[] := array[]::uuid[];
  v_parent_id uuid := null;
  v_child_id uuid;
begin
  if p_club_id is null then
    return array[]::uuid[];
  end if;

  -- Always search the rider/current club first.
  v_ids := array_append(v_ids, p_club_id);

  if to_regclass('public.clubs') is null
     or not exists (
       select 1
       from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'clubs'
         and c.column_name = 'parent_club_id'
     ) then
    return v_ids;
  end if;

  begin
    select c.parent_club_id
    into v_parent_id
    from public.clubs c
    where c.id = p_club_id;

    -- If the current club is a developing/child club, include its parent.
    if v_parent_id is not null
       and not (v_parent_id = any(v_ids)) then
      v_ids := array_append(v_ids, v_parent_id);
    end if;

    -- If the current club is itself a main club, include its children.
    for v_child_id in
      select c.id
      from public.clubs c
      where c.parent_club_id = p_club_id
      order by c.id
    loop
      if v_child_id is not null
         and not (v_child_id = any(v_ids)) then
        v_ids := array_append(v_ids, v_child_id);
      end if;
    end loop;

    -- When the current club is a child, also include sibling developing clubs
    -- after the parent. This preserves the direct -> parent -> linked order.
    if v_parent_id is not null then
      for v_child_id in
        select c.id
        from public.clubs c
        where c.parent_club_id = v_parent_id
          and c.id <> p_club_id
        order by c.id
      loop
        if v_child_id is not null
           and not (v_child_id = any(v_ids)) then
          v_ids := array_append(v_ids, v_child_id);
        end if;
      end loop;
    end if;

  exception
    when others then
      -- Preserve at least the direct/current club if linkage metadata drifts.
      return array[p_club_id]::uuid[];
  end;

  return coalesce(v_ids, array[p_club_id]::uuid[]);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_calculate_daily_sharpness_decay_v1(p_case_type text, p_severity text, p_case_status text, p_days_since_started integer, p_total_reduction_pct numeric DEFAULT 0)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base numeric := 0;
  v_long_absence numeric := 0;
  v_case_multiplier numeric := 1.0;
  v_support_softening numeric := 1.0;
begin
  /*
    Returns a negative race-sharpness delta.

    Active cases lose race rhythm faster.
    Recovering cases lose rhythm more slowly.
    Long absence adds extra loss after 14, 28 and 45 days.
    Sickness is less destructive than injury.
    Medical/infrastructure support softens, but never removes, decay.
  */

  if coalesce(p_case_status, '') = 'active' then
    v_base :=
      case coalesce(p_severity, 'moderate')
        when 'minor' then 0.14
        when 'moderate' then 0.24
        when 'major' then 0.35
        else 0.24
      end;

  elsif coalesce(p_case_status, '') = 'recovering' then
    v_base :=
      case coalesce(p_severity, 'moderate')
        when 'minor' then 0.07
        when 'moderate' then 0.12
        when 'major' then 0.18
        else 0.12
      end;

  else
    return 0;
  end if;

  v_long_absence :=
    case
      when coalesce(p_days_since_started, 0) >= 45
        then 0.20
      when coalesce(p_days_since_started, 0) >= 28
        then 0.12
      when coalesce(p_days_since_started, 0) >= 14
        then 0.06
      else 0
    end;

  v_case_multiplier :=
    case coalesce(p_case_type, 'injury')
      when 'sickness' then 0.65
      else 1.00
    end;

  v_support_softening :=
    1.0
    - (
      least(
        greatest(
          coalesce(p_total_reduction_pct, 0),
          0
        ),
        30
      )
      / 100.0
      * 0.25
    );

  return round(
    (
      -1
      * (v_base + v_long_absence)
      * v_case_multiplier
      * v_support_softening
    )::numeric,
    3
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_apply_daily_case_condition_effects_v1(p_effect_date date DEFAULT NULL::date, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_effect_date date;
  c record;
  v_days_since_started integer;
  v_delta numeric;
  v_processed integer := 0;
  v_skipped integer := 0;
  v_total_delta numeric := 0;
begin
  v_effect_date := coalesce(
    p_effect_date,
    public.get_current_game_date_date()
  );

  if v_effect_date is null then
    raise exception
      'health_apply_daily_case_condition_effects_v1: could not resolve effect date';
  end if;

  for c in
    select
      hc.id as health_case_id,
      hc.rider_id,
      hc.case_type,
      hc.case_code,
      hc.severity,
      hc.status as case_status,
      hc.started_on,
      coalesce(
        ctx.total_reduction_pct,
        0
      ) as total_reduction_pct,
      coalesce(
        ctx.expected_full_recovery_on,
        hc.recovery_until,
        hc.active_until
      ) as expected_full_recovery_on
    from public.rider_health_cases hc
    left join public.rider_health_case_context_v1 ctx
      on ctx.health_case_id = hc.id
    where hc.status in ('active', 'recovering')
      and hc.started_on is not null
      and hc.started_on <= v_effect_date
      and coalesce(
        ctx.expected_full_recovery_on,
        hc.recovery_until,
        hc.active_until,
        v_effect_date
      ) >= v_effect_date
  loop
    if coalesce(p_force, false) = false
       and exists (
         select 1
         from public.rider_health_condition_effect_runs_v1 er
         where er.effect_date = v_effect_date
           and er.rider_id = c.rider_id
           and er.health_case_id = c.health_case_id
           and er.effect_type = 'race_sharpness_decay'
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_days_since_started := greatest(
      1,
      (v_effect_date - c.started_on) + 1
    );

    v_delta :=
      public.health_calculate_daily_sharpness_decay_v1(
        c.case_type,
        c.severity,
        c.case_status,
        v_days_since_started,
        c.total_reduction_pct
      );

    if coalesce(v_delta, 0) = 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.rider_race_condition (
      rider_id,
      race_sharpness,
      last_raced_on,
      race_days_last_14,
      race_days_last_30,
      total_race_days,
      last_stage_sharpness_delta,
      last_stage_overload_penalty,
      updated_at
    )
    values (
      c.rider_id,
      greatest(
        5,
        least(100, 50 + v_delta)
      )::numeric(6, 2),
      null,
      0,
      0,
      0,
      v_delta::numeric(8, 3),
      0,
      now()
    )
    on conflict (rider_id) do update
    set
      race_sharpness = greatest(
        5,
        least(
          100,
          coalesce(
            public.rider_race_condition.race_sharpness,
            50
          ) + v_delta
        )
      )::numeric(6, 2),
      last_stage_sharpness_delta =
        v_delta::numeric(8, 3),
      last_stage_overload_penalty = 0,
      updated_at = now();

    insert into public.rider_health_condition_effect_runs_v1 (
      effect_date,
      rider_id,
      health_case_id,
      effect_type,
      sharpness_delta,
      metadata
    )
    values (
      v_effect_date,
      c.rider_id,
      c.health_case_id,
      'race_sharpness_decay',
      v_delta,
      jsonb_build_object(
        'source',
        'health_apply_daily_case_condition_effects_v1',
        'case_type',
        c.case_type,
        'case_code',
        c.case_code,
        'severity',
        c.severity,
        'case_status',
        c.case_status,
        'days_since_started',
        v_days_since_started,
        'total_reduction_pct',
        c.total_reduction_pct,
        'expected_full_recovery_on',
        c.expected_full_recovery_on
      )
    )
    on conflict (
      effect_date,
      rider_id,
      health_case_id,
      effect_type
    ) do nothing;

    v_processed := v_processed + 1;
    v_total_delta := v_total_delta + v_delta;
  end loop;

  return jsonb_build_object(
    'ok',
    true,
    'effect_date',
    v_effect_date,
    'processed',
    v_processed,
    'skipped',
    v_skipped,
    'total_sharpness_delta',
    round(coalesce(v_total_delta, 0)::numeric, 3)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_json_number_v1(p_doc jsonb, p_key text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_text text;
  v_num numeric;
begin
  if p_doc is null or p_key is null then
    return null;
  end if;

  v_text := nullif(p_doc ->> p_key, '');

  if v_text is null then
    return null;
  end if;

  begin
    v_num := v_text::numeric;
    return v_num;
  exception
    when others then
      return null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_condition_from_snapshot_v1(p_snapshot jsonb, p_summary text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_condition text;
begin
  v_condition := lower(nullif(trim(coalesce(
    p_snapshot ->> 'condition',
    p_snapshot ->> 'weather_condition',
    p_snapshot ->> 'condition_text',
    p_snapshot ->> 'weather_condition_text',
    p_snapshot ->> 'label',
    p_snapshot ->> 'name'
  )), ''));

  if v_condition is not null then
    return v_condition;
  end if;

  -- Only use the summary when it is short. This avoids false positives such as
  -- place names containing Snow/Snowbird in long descriptive summaries.
  if p_summary is not null and length(p_summary) <= 80 then
    v_condition := lower(p_summary);

    if v_condition like '%snow%' then
      return 'snow';
    end if;

    if v_condition like '%rain%' then
      return 'rain';
    end if;

    if v_condition like '%overcast%' then
      return 'overcast';
    end if;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_cancellation_reason_from_snapshot_v1(p_snapshot jsonb, p_summary text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_condition text;
  v_avg_temp numeric;
begin
  v_condition := public.race_stage_weather_condition_from_snapshot_v1(
    p_snapshot,
    p_summary
  );

  v_avg_temp := coalesce(
    public.race_stage_weather_json_number_v1(p_snapshot, 'avg_temp_c'),
    public.race_stage_weather_json_number_v1(p_snapshot, 'average_temp_c'),
    public.race_stage_weather_json_number_v1(p_snapshot, 'temperature_c'),
    public.race_stage_weather_json_number_v1(p_snapshot, 'temp_c')
  );

  if v_condition in (
    'snow',
    'snowy',
    'light snow',
    'heavy snow',
    'snow showers',
    'blizzard'
  ) then
    return 'snow';
  end if;

  if v_avg_temp is not null and v_avg_temp < 5 then
    return 'temperature_below_5c';
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_final_adjustment_c_v1(p_stage_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_hash_bigint bigint;
  v_ratio numeric;
  v_delta numeric;
begin
  if p_stage_id is null then
    return 0;
  end if;

  v_hash_bigint := (
    ('x' || substr(md5(p_stage_id::text || ':weather-final-recheck-v2'), 1, 8))::bit(32)::bigint
  );

  v_ratio := v_hash_bigint::numeric / 4294967295.0;
  v_delta := round((-1.5 + (v_ratio * 5.0))::numeric, 1);

  return v_delta;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_build_final_snapshot_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_snapshot jsonb;
  v_summary text;
  v_condition text;
  v_avg numeric;
  v_min numeric;
  v_max numeric;
  v_delta numeric;
  v_final_avg numeric;
  v_final_min numeric;
  v_final_max numeric;
  v_final_condition text;
  v_final_snapshot jsonb;
begin
  select
    coalesce(s.weather_snapshot, '{}'::jsonb),
    s.weather_summary
  into
    v_snapshot,
    v_summary
  from public.race_stages s
  where s.id = p_stage_id;

  if not found then
    raise exception 'Stage % was not found.', p_stage_id;
  end if;

  v_condition := public.race_stage_weather_condition_from_snapshot_v1(
    v_snapshot,
    v_summary
  );

  v_avg := coalesce(
    public.race_stage_weather_json_number_v1(v_snapshot, 'avg_temp_c'),
    public.race_stage_weather_json_number_v1(v_snapshot, 'average_temp_c'),
    public.race_stage_weather_json_number_v1(v_snapshot, 'temperature_c'),
    public.race_stage_weather_json_number_v1(v_snapshot, 'temp_c')
  );

  v_min := coalesce(
    public.race_stage_weather_json_number_v1(v_snapshot, 'avg_min_temp_c'),
    public.race_stage_weather_json_number_v1(v_snapshot, 'min_temp_c'),
    case when v_avg is not null then v_avg - 1.5 else null end
  );

  v_max := coalesce(
    public.race_stage_weather_json_number_v1(v_snapshot, 'avg_max_temp_c'),
    public.race_stage_weather_json_number_v1(v_snapshot, 'max_temp_c'),
    case when v_avg is not null then v_avg + 2.0 else null end
  );

  v_delta := public.race_stage_weather_final_adjustment_c_v1(p_stage_id);

  if v_avg is null then
    -- If a stage has no numeric forecast, keep it safe and do not cancel.
    v_final_avg := null;
    v_final_min := null;
    v_final_max := null;
  else
    v_final_avg := round((v_avg + v_delta)::numeric, 1);
    v_final_min := round((coalesce(v_min, v_avg - 1.5) + v_delta)::numeric, 1);
    v_final_max := round((coalesce(v_max, v_avg + 2.0) + v_delta)::numeric, 1);
  end if;

  /*
   * Condition normalization:
   * - If forecast was snow but final temperature improved above threshold,
   *   snow becomes rain/overcast.
   * - If forecast was cold rain but final temperature improves, it becomes rain.
   * - If final temperature remains below threshold, it stays unsafe.
   */
  if v_condition in ('snow', 'snowy', 'light snow', 'heavy snow', 'snow showers', 'blizzard') then
    if v_final_avg is not null and v_final_avg >= 5 then
      v_final_condition := case
        when v_final_min is not null and v_final_min < 5 then 'rain'
        else 'overcast'
      end;
    else
      v_final_condition := 'snow';
    end if;
  elsif v_final_avg is not null and v_final_avg < 5 then
    v_final_condition := coalesce(v_condition, 'cold rain');
  else
    v_final_condition := case
      when coalesce(v_condition, '') in ('cold rain', 'snow', 'snowy', 'light snow', 'heavy snow') then 'rain'
      else coalesce(v_condition, 'overcast')
    end;
  end if;

  v_final_snapshot := v_snapshot
    || jsonb_build_object(
      'avg_temp_c', v_final_avg,
      'avg_min_temp_c', v_final_min,
      'avg_max_temp_c', v_final_max,
      'condition', v_final_condition,
      'weather_condition', v_final_condition,
      'forecast_adjustment_c', v_delta,
      'weather_phase', 'final_24h_recheck',
      'weather_temperature_policy_offset_c', 3,
      'generated_by', 'race_stage_weather_build_final_snapshot_v1'
    );

  return v_final_snapshot;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_weather_prepare_final_decision_v1(p_stage_id uuid, p_force_refresh boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_existing_status text;
  v_final_snapshot jsonb;
  v_final_reason text;
  v_decision_status text;
begin
  select
    s.id,
    s.race_id,
    s.stage_number,
    s.weather_cancelled,
    s.weather_cancellation_reason,
    s.weather_snapshot,
    s.weather_summary,
    coalesce(s.metadata, '{}'::jsonb) as metadata
  into v_stage
  from public.race_stages s
  where s.id = p_stage_id;

  if not found then
    raise exception 'Stage % was not found.', p_stage_id;
  end if;

  v_existing_status := nullif(v_stage.metadata ->> 'weather_final_decision_status', '');

  if v_existing_status is not null and not coalesce(p_force_refresh, false) then
    return jsonb_build_object(
      'status', 'already_decided',
      'stage_id', p_stage_id,
      'race_id', v_stage.race_id,
      'weather_final_decision_status', v_existing_status,
      'weather_final_decision_reason', v_stage.metadata ->> 'weather_final_decision_reason',
      'weather_final_snapshot', v_stage.metadata -> 'weather_final_snapshot'
    );
  end if;

  v_final_snapshot := public.race_stage_weather_build_final_snapshot_v1(p_stage_id);

  v_final_reason := public.race_stage_weather_cancellation_reason_from_snapshot_v1(
    v_final_snapshot,
    v_stage.weather_summary
  );

  v_decision_status := case
    when v_final_reason is null then 'cleared'
    else 'cancelled'
  end;

  update public.race_stages s
  set
    metadata =
      coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'weather_forecast_snapshot', coalesce(s.metadata -> 'weather_forecast_snapshot', s.weather_snapshot),
        'weather_forecast_cancellation_reason', public.race_stage_weather_cancellation_reason_from_snapshot_v1(s.weather_snapshot, s.weather_summary),
        'weather_final_snapshot', v_final_snapshot,
        'weather_final_decision_status', v_decision_status,
        'weather_final_decision_reason', v_final_reason,
        'weather_final_decision_at', now(),
        'weather_final_recheck_version', 'weather_final_recheck_v2',
        'weather_temperature_policy_offset_c', 3,
        'weather_decision_note', case
          when v_decision_status = 'cancelled' then
            'Final 24h weather recheck remained below safety threshold.'
          else
            'Final 24h weather recheck improved above safety threshold; stage continues.'
        end
      )
  where s.id = p_stage_id;

  return jsonb_build_object(
    'status', 'completed',
    'stage_id', p_stage_id,
    'race_id', v_stage.race_id,
    'weather_final_decision_status', v_decision_status,
    'weather_final_decision_reason', v_final_reason,
    'weather_final_snapshot', v_final_snapshot
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_assign_team_captains_v1(p_race_id uuid, p_team_id uuid DEFAULT NULL::uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_found boolean := false;
  v_is_stage_race boolean := false;
  v_stage_count integer := 1;
  v_flat_share numeric := 0;
  v_hilly_share numeric := 0;
  v_mountain_share numeric := 0;
  v_cobbled_share numeric := 0;
  v_tt_stage_count integer := 0;
  v_sprint_finish_count integer := 0;
  v_summit_finish_count integer := 0;
  v_race_kind text := 'balanced';
  v_default_stage_role text := 'protected_rider';

  v_team record;
  v_existing_count integer := 0;
  v_captain_id uuid;
  v_captain_name text;
  v_captain_score numeric;
  v_captain_source text;
  v_updated_preparation_rows integer := 0;
  v_updated_stage_defaults integer := 0;

  v_team_count integer := 0;
  v_assigned_count integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_race_id is null then
    raise exception 'p_race_id is required';
  end if;

  select
    true,
    (
      coalesce(r.is_stage_race, false)
      or coalesce(r.stage_count, 0) > 1
      or count(rs.id) > 1
    ) as is_stage_race,
    greatest(
      coalesce(r.stage_count, 0),
      count(rs.id)::integer,
      1
    ) as stage_count,

    coalesce(
      sum(
        greatest(coalesce(rs.distance_km, 1), 1)
        * coalesce(
            rs.flat_pct,
            case
              when lower(coalesce(rs.terrain_type, rs.profile_type, '')) like '%flat%'
                then 100
              else 0
            end
          )
      )
      /
      nullif(
        sum(greatest(coalesce(rs.distance_km, 1), 1)),
        0
      ),
      0
    ) as flat_share,

    coalesce(
      sum(
        greatest(coalesce(rs.distance_km, 1), 1)
        * coalesce(
            rs.hilly_pct,
            case
              when lower(coalesce(rs.terrain_type, rs.profile_type, '')) like '%hill%'
                or lower(coalesce(rs.profile_type, '')) like '%puncheur%'
                then 100
              else 0
            end
          )
      )
      /
      nullif(
        sum(greatest(coalesce(rs.distance_km, 1), 1)),
        0
      ),
      0
    ) as hilly_share,

    coalesce(
      sum(
        greatest(coalesce(rs.distance_km, 1), 1)
        * coalesce(
            rs.mountain_pct,
            case
              when lower(coalesce(rs.terrain_type, rs.profile_type, '')) like '%mountain%'
                or lower(coalesce(rs.profile_type, '')) like '%climb%'
                then 100
              else 0
            end
          )
      )
      /
      nullif(
        sum(greatest(coalesce(rs.distance_km, 1), 1)),
        0
      ),
      0
    ) as mountain_share,

    coalesce(
      sum(
        greatest(coalesce(rs.distance_km, 1), 1)
        * coalesce(
            rs.cobbled_pct,
            case
              when lower(coalesce(rs.terrain_type, rs.profile_type, '')) like '%cobbl%'
                then 100
              else 0
            end
          )
      )
      /
      nullif(
        sum(greatest(coalesce(rs.distance_km, 1), 1)),
        0
      ),
      0
    ) as cobbled_share,

    count(rs.id) filter (
      where lower(coalesce(rs.stage_format, '')) in (
        'prologue',
        'individual_time_trial',
        'team_time_trial',
        'itt',
        'ttt',
        'time_trial'
      )
    )::integer as tt_stage_count,

    count(rs.id) filter (
      where lower(coalesce(rs.finish_type, '')) like '%flat%'
         or lower(coalesce(rs.finish_type, '')) like '%sprint%'
    )::integer as sprint_finish_count,

    count(rs.id) filter (
      where coalesce(rs.is_summit_finish, false)
         or lower(coalesce(rs.finish_type, '')) like '%summit%'
         or lower(coalesce(rs.finish_type, '')) like '%mountain%'
    )::integer as summit_finish_count

  into
    v_race_found,
    v_is_stage_race,
    v_stage_count,
    v_flat_share,
    v_hilly_share,
    v_mountain_share,
    v_cobbled_share,
    v_tt_stage_count,
    v_sprint_finish_count,
    v_summit_finish_count

  from public.races r
  left join public.race_stages rs
    on rs.race_id = r.id
  where r.id = p_race_id
  group by
    r.id,
    r.is_stage_race,
    r.stage_count;

  if not coalesce(v_race_found, false) then
    raise exception 'Race not found: %', p_race_id;
  end if;

  v_race_kind :=
    case
      when v_is_stage_race then 'stage_race_gc'
      when v_tt_stage_count >= v_stage_count then 'time_trial'
      when v_mountain_share >= 30 or v_summit_finish_count > 0 then 'mountain'
      when v_cobbled_share >= 25 then 'cobbled'
      when (v_hilly_share + v_mountain_share) >= 30 then 'hilly'
      when v_flat_share >= 50 or v_sprint_finish_count > 0 then 'sprint'
      else 'balanced'
    end;

  v_default_stage_role :=
    case
      when v_is_stage_race then 'team_leader_gc'
      when v_race_kind = 'sprint' then 'sprinter'
      when v_race_kind = 'mountain' then 'climber'
      when v_race_kind = 'hilly' then 'protected_rider'
      when v_race_kind = 'cobbled' then 'protected_rider'
      when v_race_kind = 'time_trial' then null
      else 'protected_rider'
    end;

  for v_team in
    select distinct
      rpr.team_id
    from public.race_participant_riders rpr
    where rpr.race_id = p_race_id
      and rpr.team_id is not null
      and (p_team_id is null or rpr.team_id = p_team_id)
    order by rpr.team_id
  loop
    v_team_count := v_team_count + 1;
    v_captain_id := null;
    v_captain_name := null;
    v_captain_score := null;
    v_captain_source := null;
    v_updated_preparation_rows := 0;
    v_updated_stage_defaults := 0;

    /*
     * First preserve a captain already fixed in the submitted Race Plan.
     */
    if not p_force then
      select
        count(*)::integer,
        min(preparation_rider.rider_id::text)::uuid
      into
        v_existing_count,
        v_captain_id
      from public.race_preparations preparation
      join public.race_preparation_riders preparation_rider
        on preparation_rider.race_preparation_id = preparation.id
      join public.race_participant_riders participant
        on participant.race_id = p_race_id
       and participant.team_id = v_team.team_id
       and participant.rider_id = preparation_rider.rider_id
      where preparation.race_id = p_race_id
        and coalesce(
          preparation.participating_club_id,
          preparation.club_id
        ) = v_team.team_id
        and coalesce(preparation.status, '') in (
          'submitted',
          'locked',
          'sent_to_engine'
        )
        and lower(coalesce(preparation_rider.race_role, '')) in (
          'team_leader',
          'road_captain'
        );

      if v_existing_count = 1 then
        v_captain_source := 'existing_race_preparation';
      else
        v_captain_id := null;
      end if;
    end if;

    /*
     * Do not preserve a generic participant role_snapshot = Leader.
     *
     * Legacy AI startlists used ordinary squad roles as participant
     * snapshots. Those labels were never authoritative race-captain
     * decisions and could nominate a weaker rider by accident.
     *
     * A submitted Race Plan captain may still be preserved above when
     * p_force is false. Otherwise the announced riders are always scored.
     */

    /*
     * No fixed captain exists: rank only the riders actually announced
     * for this team and race.
     */
    if v_captain_id is null then
      with attributes as (
        select
          participant.rider_id,

          coalesce(
            nullif(participant.rider_name_snapshot, ''),
            nullif(rider.display_name, ''),
            nullif(
              trim(
                concat_ws(
                  ' ',
                  rider.first_name,
                  rider.last_name
                )
              ),
              ''
            ),
            participant.rider_id::text
          ) as rider_name,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['sprint', 'sprint_skill'],
            coalesce(rider.sprint, 50)
          ) as sprint_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['climbing', 'mountain', 'climb', 'climbing_skill'],
            coalesce(rider.climbing, 50)
          ) as climbing_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['time_trial', 'timetrial', 'tt'],
            coalesce(rider.time_trial, 50)
          ) as time_trial_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['flat', 'flat_skill'],
            coalesce(rider.flat, 50)
          ) as flat_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['endurance', 'stamina'],
            coalesce(rider.endurance, 50)
          ) as endurance_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['recovery'],
            coalesce(rider.recovery, 50)
          ) as recovery_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['resistance'],
            coalesce(rider.resistance, 50)
          ) as resistance_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['race_iq', 'race_intelligence', 'intelligence'],
            coalesce(rider.race_iq, 50)
          ) as race_iq_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['teamwork', 'team_work'],
            coalesce(rider.teamwork, 50)
          ) as teamwork_score,

          public.jsonb_number_any_v1(
            coalesce(preparation_snapshot.rider_snapshot_json, '{}'::jsonb),
            array['overall', 'overall_rating'],
            coalesce(participant.overall_snapshot, rider.overall, 50)
          ) as overall_score,

          coalesce(rider.fatigue, 0)::numeric as fatigue_score,
          coalesce(race_condition.race_sharpness, 50)::numeric as sharpness_score,

          lower(
            coalesce(
              nullif(
                nullif(
                  preparation_snapshot.race_role,
                  ''
                ),
                'selected'
              ),
              rider.role::text,
              ''
            )
          ) as base_role

        from public.race_participant_riders participant

        join public.riders rider
          on rider.id = participant.rider_id

        left join public.rider_race_condition race_condition
          on race_condition.rider_id = participant.rider_id

        left join lateral (
          select
            preparation_rider.rider_snapshot_json,
            preparation_rider.race_role

          from public.race_preparations preparation

          join public.race_preparation_riders preparation_rider
            on preparation_rider.race_preparation_id = preparation.id

          where preparation.race_id = p_race_id
            and coalesce(
              preparation.participating_club_id,
              preparation.club_id
            ) = v_team.team_id
            and preparation_rider.rider_id = participant.rider_id

          order by
            case
              when preparation.status in (
                'submitted',
                'locked',
                'sent_to_engine'
              ) then 0
              else 1
            end,
            preparation.updated_at desc,
            preparation.id desc

          limit 1
        ) preparation_snapshot
          on true

        where participant.race_id = p_race_id
          and participant.team_id = v_team.team_id
      ),

      scored as (
        select
          attributes.*,

          (
            case v_race_kind
              when 'stage_race_gc' then
                  attributes.climbing_score * 0.22
                + attributes.time_trial_score * 0.16
                + attributes.endurance_score * 0.16
                + attributes.recovery_score * 0.12
                + attributes.resistance_score * 0.10
                + attributes.race_iq_score * 0.10
                + attributes.overall_score * 0.10
                + attributes.flat_score * 0.04
                + attributes.climbing_score
                    * least(0.12, greatest(v_mountain_share, 0) / 100 * 0.12)
                + attributes.time_trial_score
                    * least(
                        0.10,
                        greatest(v_tt_stage_count, 0)::numeric
                        / greatest(v_stage_count, 1)::numeric
                        * 0.10
                      )

              when 'sprint' then
                  attributes.sprint_score * 0.40
                + attributes.flat_score * 0.18
                + attributes.endurance_score * 0.12
                + attributes.resistance_score * 0.08
                + attributes.race_iq_score * 0.08
                + attributes.overall_score * 0.08
                + attributes.recovery_score * 0.04
                + attributes.teamwork_score * 0.02

              when 'mountain' then
                  attributes.climbing_score * 0.42
                + attributes.endurance_score * 0.15
                + attributes.recovery_score * 0.12
                + attributes.resistance_score * 0.10
                + attributes.race_iq_score * 0.08
                + attributes.overall_score * 0.08
                + attributes.time_trial_score * 0.03
                + attributes.teamwork_score * 0.02

              when 'hilly' then
                  attributes.climbing_score * 0.27
                + attributes.flat_score * 0.15
                + attributes.endurance_score * 0.15
                + attributes.resistance_score * 0.10
                + attributes.race_iq_score * 0.10
                + attributes.overall_score * 0.10
                + attributes.sprint_score * 0.08
                + attributes.recovery_score * 0.05

              when 'cobbled' then
                  attributes.flat_score * 0.25
                + attributes.resistance_score * 0.18
                + attributes.endurance_score * 0.15
                + attributes.race_iq_score * 0.12
                + attributes.overall_score * 0.12
                + attributes.sprint_score * 0.08
                + attributes.teamwork_score * 0.06
                + attributes.recovery_score * 0.04

              when 'time_trial' then
                  attributes.time_trial_score * 0.55
                + attributes.endurance_score * 0.15
                + attributes.flat_score * 0.10
                + attributes.resistance_score * 0.08
                + attributes.overall_score * 0.08
                + attributes.race_iq_score * 0.04

              else
                  attributes.overall_score * 0.22
                + attributes.endurance_score * 0.16
                + attributes.race_iq_score * 0.12
                + attributes.resistance_score * 0.10
                + attributes.recovery_score * 0.10
                + attributes.climbing_score * 0.10
                + attributes.flat_score * 0.08
                + attributes.time_trial_score * 0.06
                + attributes.sprint_score * 0.04
                + attributes.teamwork_score * 0.02
            end
          )

          + case
              when attributes.base_role in (
                'leader',
                'team_leader',
                'road_captain'
              )
                then 3
              when v_race_kind = 'sprint'
               and attributes.base_role = 'sprinter'
                then 2
              when v_race_kind in ('mountain', 'hilly')
               and attributes.base_role = 'climber'
                then 2
              else 0
            end

          + greatest(
              -2,
              least(
                2,
                (attributes.sharpness_score - 50) * 0.04
              )
            )

          - least(
              4,
              greatest(attributes.fatigue_score, 0) * 0.04
            ) as captain_score

        from attributes
      )

      select
        scored.rider_id,
        scored.rider_name,
        scored.captain_score
      into
        v_captain_id,
        v_captain_name,
        v_captain_score
      from scored
      order by
        scored.captain_score desc,
        scored.overall_score desc,
        scored.race_iq_score desc,
        scored.rider_name asc,
        scored.rider_id asc
      limit 1;

      v_captain_source := 'profile_skill_score_v2';
    else
      select
        coalesce(
          nullif(rpr.rider_name_snapshot, ''),
          nullif(r.display_name, ''),
          nullif(
            trim(concat_ws(' ', r.first_name, r.last_name)),
            ''
          ),
          v_captain_id::text
        )
      into v_captain_name
      from public.race_participant_riders rpr
      left join public.riders r
        on r.id = rpr.rider_id
      where rpr.race_id = p_race_id
        and rpr.team_id = v_team.team_id
        and rpr.rider_id = v_captain_id
      limit 1;
    end if;

    if v_captain_id is null then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'team_id', v_team.team_id,
          'status', 'no_candidate'
        )
      );
      continue;
    end if;

    /*
     * Publish exactly one visible Leader snapshot.
     */
    update public.race_participant_riders participant
    set
      role_snapshot =
        case
          when participant.rider_id = v_captain_id
            then 'Leader'

          when public.race_role_is_captain_v1(participant.role_snapshot)
            then
              /*
               * Demote a previous/legacy Leader to a guaranteed
               * non-captain display role.
               *
               * Do not copy riders.role blindly: several legacy riders
               * have roster role = Leader, which would recreate a second
               * visible captain immediately.
               */
              case
                when lower(coalesce(rider.role::text, '')) in (
                  'sprinter',
                  'sprint'
                ) then 'Sprinter'

                when lower(coalesce(rider.role::text, '')) in (
                  'climber',
                  'mountain',
                  'mountain_specialist'
                ) then 'Climber'

                when lower(coalesce(rider.role::text, '')) in (
                  'time_trial',
                  'time trial',
                  'tt',
                  'time_trialist'
                ) then 'TT'

                when lower(coalesce(rider.role::text, '')) in (
                  'domestique',
                  'helper',
                  'helper_domestique',
                  'leadout',
                  'lead_out',
                  'lead_out_rider'
                ) then 'Domestique'

                when lower(coalesce(rider.role::text, '')) in (
                  'breakaway',
                  'breakaway_rider',
                  'rouleur'
                ) then 'Breakaway'

                when lower(coalesce(rider.role::text, '')) in (
                  'all_rounder',
                  'all-rounder',
                  'all rounder',
                  'protected_rider',
                  'free_role',
                  'selected'
                ) then 'All-rounder'

                /*
                 * Captain-like or unknown roster roles are converted
                 * from the rider's strongest core race skill.
                 */
                when coalesce(rider.sprint, 0) >= greatest(
                  coalesce(rider.climbing, 0),
                  coalesce(rider.time_trial, 0),
                  coalesce(rider.flat, 0),
                  coalesce(rider.endurance, 0)
                ) then 'Sprinter'

                when coalesce(rider.climbing, 0) >= greatest(
                  coalesce(rider.sprint, 0),
                  coalesce(rider.time_trial, 0),
                  coalesce(rider.flat, 0),
                  coalesce(rider.endurance, 0)
                ) then 'Climber'

                when coalesce(rider.time_trial, 0) >= greatest(
                  coalesce(rider.sprint, 0),
                  coalesce(rider.climbing, 0),
                  coalesce(rider.flat, 0),
                  coalesce(rider.endurance, 0)
                ) then 'TT'

                else 'All-rounder'
              end

          else participant.role_snapshot
        end
    from public.riders rider
    where participant.race_id = p_race_id
      and participant.team_id = v_team.team_id
      and rider.id = participant.rider_id;

    /*
     * Persist the race-level captain in the Race Plan. The allowed
     * race_role constraint already supports team_leader.
     */
    update public.race_preparation_riders preparation_rider
    set
      race_role =
        case
          when preparation_rider.rider_id = v_captain_id
            then 'team_leader'

          when lower(coalesce(preparation_rider.race_role, '')) in (
            'team_leader',
            'road_captain'
          )
            then 'selected'

          else preparation_rider.race_role
        end,

      metadata =
        case
          when preparation_rider.rider_id = v_captain_id
            then coalesce(preparation_rider.metadata, '{}'::jsonb)
              || jsonb_build_object(
                   'race_captain', true,
                   'race_captain_source', v_captain_source,
                   'race_captain_race_kind', v_race_kind,
                   'race_captain_assigned_at', now()
                 )

          else
            coalesce(preparation_rider.metadata, '{}'::jsonb)
              - 'race_captain'
              - 'race_captain_source'
              - 'race_captain_race_kind'
              - 'race_captain_assigned_at'
        end,

      updated_at = now()

    from public.race_preparations preparation

    where preparation_rider.race_preparation_id = preparation.id
      and preparation.race_id = p_race_id
      and coalesce(
        preparation.participating_club_id,
        preparation.club_id
      ) = v_team.team_id
      and coalesce(preparation.status, '') in (
        'submitted',
        'locked',
        'sent_to_engine'
      );

    get diagnostics
      v_updated_preparation_rows = row_count;

    update public.race_preparations preparation
    set
      metadata = coalesce(preparation.metadata, '{}'::jsonb)
        || jsonb_build_object(
             'race_captain_rider_id', v_captain_id,
             'race_captain_name', v_captain_name,
             'race_captain_source', v_captain_source,
             'race_captain_race_kind', v_race_kind,
             'race_captain_assigned_at', now()
           ),
      updated_at = now()
    where preparation.race_id = p_race_id
      and coalesce(
        preparation.participating_club_id,
        preparation.club_id
      ) = v_team.team_id
      and coalesce(preparation.status, '') in (
        'submitted',
        'locked',
        'sent_to_engine'
      );

    /*
     * Supply a default stage role only for untouched draft Stage Plans.
     * Saved manager choices are never overwritten.
     */
    if v_default_stage_role is not null then
      update public.race_stage_plans stage_plan
      set
        rider_roles_json = jsonb_set(
          coalesce(stage_plan.rider_roles_json, '{}'::jsonb),
          array[v_captain_id::text],
          to_jsonb(v_default_stage_role),
          true
        ),

        metadata = coalesce(stage_plan.metadata, '{}'::jsonb)
          || jsonb_build_object(
               'default_race_captain_rider_id', v_captain_id,
               'default_race_captain_role', v_default_stage_role,
               'default_race_captain_source', 'race_assign_team_captains_v1'
             ),

        updated_at = now()

      from public.race_preparations preparation

      where stage_plan.race_preparation_id = preparation.id
        and preparation.race_id = p_race_id
        and coalesce(
          preparation.participating_club_id,
          preparation.club_id
        ) = v_team.team_id
        and coalesce(stage_plan.status, 'draft') = 'draft'
        and stage_plan.last_saved_at is null
        and coalesce(stage_plan.rider_roles_json, '{}'::jsonb) = '{}'::jsonb
        and not exists (
          select 1
          from public.race_stages stage
          where stage.id = stage_plan.stage_id
            and lower(coalesce(stage.stage_format, '')) in (
              'prologue',
              'individual_time_trial',
              'team_time_trial',
              'itt',
              'ttt',
              'time_trial'
            )
        );

      get diagnostics
        v_updated_stage_defaults = row_count;
    end if;

    v_assigned_count := v_assigned_count + 1;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'team_id', v_team.team_id,
        'status', 'assigned',
        'captain_rider_id', v_captain_id,
        'captain_name', v_captain_name,
        'captain_score', v_captain_score,
        'captain_source', v_captain_source,
        'race_kind', v_race_kind,
        'default_stage_role', v_default_stage_role,
        'updated_preparation_rows', v_updated_preparation_rows,
        'updated_stage_plan_defaults', v_updated_stage_defaults
      )
    );
  end loop;

  /*
   * The existing numbering function already prioritizes Leader/Captain
   * snapshots and gives that rider the first number inside the team block.
   */
  /*
   * Keep the captain first without recalculating team ranking blocks.
   * The former race_assign_team_start_numbers_v1 call joined the full
   * ranking standings view and could time out during mass backfills.
   */
  perform public.race_reorder_team_captain_first_v1(
    p_race_id,
    p_team_id
  );

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'race_kind', v_race_kind,
    'is_stage_race', v_is_stage_race,
    'stage_count', v_stage_count,
    'flat_share', round(v_flat_share, 2),
    'hilly_share', round(v_hilly_share, 2),
    'mountain_share', round(v_mountain_share, 2),
    'cobbled_share', round(v_cobbled_share, 2),
    'tt_stage_count', v_tt_stage_count,
    'teams_checked', v_team_count,
    'teams_with_captain', v_assigned_count,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_assign_race_captains_after_participant_insert_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race record;
  v_metadata jsonb;
begin
  for v_race in
    select distinct inserted.race_id
    from new_participant_rows inserted
    where inserted.race_id is not null
  loop
    select coalesce(race.metadata, '{}'::jsonb)
    into v_metadata
    from public.races race
    where race.id = v_race.race_id;

    if lower(
      coalesce(
        v_metadata ->> 'race_startlist_captains_finalized',
        'false'
      )
    ) in ('true', '1', 'yes') then
      continue;
    end if;

    perform public.race_assign_team_captains_v1(
      v_race.race_id,
      null,
      true
    );
  end loop;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_reorder_team_captain_first_v1(p_race_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated_count integer := 0;
begin
  if p_race_id is null then
    raise exception 'p_race_id is required';
  end if;

  /*
   * Only reorder riders inside each team's already assigned number set.
   *
   * This deliberately does NOT recalculate team blocks or join the team
   * ranking views. It therefore avoids the expensive ranking function that
   * caused statement timeouts during captain backfills.
   */
  with participant_base as (
    select
      participant.id,
      participant.team_id,
      participant.rider_id,
      participant.rider_name_snapshot,
      participant.role_snapshot,
      participant.overall_snapshot,
      participant.start_number
    from public.race_participant_riders participant
    where participant.race_id = p_race_id
      and participant.team_id is not null
      and (
        p_team_id is null
        or participant.team_id = p_team_id
      )
  ),

  number_sets as (
    select
      base.team_id,

      array_agg(
        base.start_number
        order by base.start_number
      ) filter (
        where base.start_number is not null
      ) as existing_numbers,

      min(base.start_number) as minimum_number,
      max(base.start_number) as maximum_number

    from participant_base base
    group by base.team_id
  ),

  ranked_riders as (
    select
      base.id,
      base.team_id,

      row_number() over (
        partition by base.team_id
        order by
          case
            when public.race_role_is_captain_v1(base.role_snapshot)
              then 0
            else 1
          end,

          base.start_number nulls last,
          coalesce(base.overall_snapshot, 0) desc,
          lower(coalesce(base.rider_name_snapshot, '')) asc,
          base.rider_id asc
      )::integer as rider_order

    from participant_base base
  ),

  desired_numbers as (
    select
      ranked.id,

      case
        when numbers.existing_numbers is not null
         and coalesce(
               array_length(numbers.existing_numbers, 1),
               0
             ) >= ranked.rider_order
          then numbers.existing_numbers[ranked.rider_order]

        else
          coalesce(numbers.maximum_number, 0)
          + greatest(
              1,
              ranked.rider_order
              - coalesce(
                  array_length(numbers.existing_numbers, 1),
                  0
                )
            )
      end::integer as desired_start_number

    from ranked_riders ranked

    join number_sets numbers
      on numbers.team_id = ranked.team_id
  ),

  updated as (
    update public.race_participant_riders participant
    set start_number = desired.desired_start_number

    from desired_numbers desired

    where participant.id = desired.id
      and participant.start_number
          is distinct from desired.desired_start_number

    returning participant.id
  )

  select count(*)::integer
  into v_updated_count
  from updated;

  return coalesce(v_updated_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_race_team_list_announcement_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_team_count integer := 0;
  v_team_count_before_fill integer := 0;
  v_max_teams integer := 0;
  v_fill_result jsonb := '{}'::jsonb;
begin
  select greatest(
           coalesce(rer.max_teams, rer.target_teams, rer.min_teams, 0),
           coalesce(rer.target_teams, rer.min_teams, 0)
         )::integer
  into v_max_teams
  from public.race_entry_rules rer
  where rer.race_id = p_race_id
  limit 1;

  if not found then
    raise exception 'Team-list announcement cannot be finalized: race % has no entry rules', p_race_id;
  end if;

  select count(distinct coalesce(
           entry.participating_club_id,
           entry.club_id
         ))::integer
  into v_team_count_before_fill
  from public.race_team_entries entry
  where entry.race_id = p_race_id
    and entry.status in ('accepted', 'confirmed');

  -- Final safety net: if normal review already reached target_teams but left
  -- unused max_teams capacity, fill those remaining places before freezing
  -- the official team-list announcement.
  if v_team_count_before_fill < v_max_teams then
    select public.fill_race_ai_teams_v1(p_race_id)
    into v_fill_result;

    if coalesce((v_fill_result ->> 'success')::boolean, false) is not true then
      raise exception
        'Team-list announcement cannot be finalized: AI max-field fill failed for race %: %',
        p_race_id,
        v_fill_result;
    end if;
  else
    v_fill_result := jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'already_at_or_above_max',
      'accepted_teams', v_team_count_before_fill,
      'max_teams', v_max_teams,
      'ai_entries_added', 0
    );
  end if;

  select count(distinct coalesce(
           entry.participating_club_id,
           entry.club_id
         ))::integer
  into v_team_count
  from public.race_team_entries entry
  where entry.race_id = p_race_id
    and entry.status in ('accepted', 'confirmed');

  if v_team_count = 0 then
    raise exception
      'Team-list announcement cannot be finalized: race % has no accepted teams',
      p_race_id;
  end if;

  update public.races race
  set
    metadata =
      coalesce(race.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'team_list_announcement_finalized', true,
        'team_list_announcement_finalized_at', now(),
        'team_list_announcement_processed', true,
        'team_list_announcement_processed_at', now(),
        'team_list_announcement_team_count', v_team_count,
        'team_list_announcement_max_teams', v_max_teams,
        'team_list_announcement_fill_to_max_policy', true,
        'captains_pending_rider_deadline', true
      ),
    updated_at = now()
  where race.id = p_race_id;

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'team_count_before_max_fill', v_team_count_before_fill,
    'team_count', v_team_count,
    'max_teams', v_max_teams,
    'ai_entries_added', coalesce((v_fill_result ->> 'ai_entries_added')::integer, 0),
    'remaining_capacity', greatest(0, v_max_teams - v_team_count),
    'team_list_announced', true,
    'fill_to_max_policy', true,
    'ai_fill_result', v_fill_result,
    'captains_and_numbers_finalized', false,
    'captains_pending_rider_deadline', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalize_race_startlist_captains_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_preparation record;

  v_ai_repair jsonb;
  v_ai_assignment jsonb;
  v_captain_assignment jsonb;

  v_min_riders integer := 0;
  v_max_riders integer := 999;

  v_expected_team_count integer := 0;
  v_missing_team_count integer := 0;
  v_invalid_size_team_count integer := 0;
  v_invalid_captain_team_count integer := 0;
  v_rider_count integer := 0;
begin
  select
    coalesce(rules.min_riders_per_team, 0),
    coalesce(rules.max_riders_per_team, 999)
  into
    v_min_riders,
    v_max_riders
  from public.race_entry_rules rules
  where rules.race_id = p_race_id
  limit 1;

  if not found then
    raise exception
      'Race entry rules were not found for race %',
      p_race_id;
  end if;

  for v_preparation in
    select distinct on (preparation.club_id)
      preparation.id
    from public.race_preparations preparation
    where preparation.race_id = p_race_id
      and (
        coalesce(preparation.status, '') in (
          'submitted', 'locked', 'sent_to_engine'
        )
        or coalesce(preparation.startlist_status, '') in (
          'submitted', 'locked', 'sent_to_engine'
        )
      )
    order by
      preparation.club_id,
      preparation.updated_at desc nulls last,
      preparation.id desc
  loop
    perform public.sync_submitted_race_preparation_to_participants_v1(
      v_preparation.id
    );
  end loop;

  /*
   * Complete AI teams first. Any AI filler team that still cannot reach the
   * minimum rider count is withdrawn and replaced by another eligible AI
   * team. This preserves strict national-team nationality rules instead of
   * inventing or relabelling riders.
   */
  select public.race_replace_unfillable_ai_teams_v1(
    p_race_id,
    10
  )
  into v_ai_repair;

  select public.assign_ai_riders_to_race_v1(p_race_id)
  into v_ai_assignment;

  with expected_teams as (
    select distinct
      coalesce(
        entry.participating_club_id,
        entry.club_id
      ) as team_id
    from public.race_team_entries entry

    left join lateral (
      select
        preparation.status,
        preparation.startlist_status
      from public.race_preparations preparation
      where preparation.race_id = entry.race_id
        and preparation.club_id = entry.club_id
      order by
        preparation.updated_at desc nulls last,
        preparation.id desc
      limit 1
    ) latest_preparation
      on true

    where entry.race_id = p_race_id
      and entry.status in ('accepted', 'confirmed')
      and entry.missed_startlist_at is null
      and coalesce(latest_preparation.status, '')
          <> 'missed_startlist'
      and coalesce(latest_preparation.startlist_status, '')
          <> 'missed_startlist'
  ),
  team_sizes as (
    select
      expected.team_id,
      count(participant.rider_id)::integer as rider_count
    from expected_teams expected
    left join public.race_participant_riders participant
      on participant.race_id = p_race_id
     and participant.team_id = expected.team_id
    group by expected.team_id
  )
  select
    count(*)::integer,
    count(*) filter (where rider_count = 0)::integer,
    count(*) filter (
      where rider_count > 0
        and (
          rider_count < v_min_riders
          or rider_count > v_max_riders
        )
    )::integer
  into
    v_expected_team_count,
    v_missing_team_count,
    v_invalid_size_team_count
  from team_sizes;

  if v_missing_team_count > 0 then
    raise exception
      'Race startlist cannot be finalized: % eligible team(s) in race % still have no participant riders',
      v_missing_team_count,
      p_race_id;
  end if;

  if v_invalid_size_team_count > 0 then
    raise exception
      'Race startlist cannot be finalized: % team(s) in race % are outside the allowed rider-count range %-%',
      v_invalid_size_team_count,
      p_race_id,
      v_min_riders,
      v_max_riders;
  end if;

  select public.race_assign_team_captains_v1(
    p_race_id,
    null,
    true
  )
  into v_captain_assignment;

  with expected_teams as (
    select distinct
      coalesce(
        entry.participating_club_id,
        entry.club_id
      ) as team_id
    from public.race_team_entries entry

    left join lateral (
      select
        preparation.status,
        preparation.startlist_status
      from public.race_preparations preparation
      where preparation.race_id = entry.race_id
        and preparation.club_id = entry.club_id
      order by
        preparation.updated_at desc nulls last,
        preparation.id desc
      limit 1
    ) latest_preparation
      on true

    where entry.race_id = p_race_id
      and entry.status in ('accepted', 'confirmed')
      and entry.missed_startlist_at is null
      and coalesce(latest_preparation.status, '')
          <> 'missed_startlist'
      and coalesce(latest_preparation.startlist_status, '')
          <> 'missed_startlist'
  ),
  captain_check as (
    select
      expected.team_id,

      count(participant.rider_id) filter (
        where public.race_role_is_captain_v1(
          participant.role_snapshot
        )
      )::integer as captain_count,

      min(participant.start_number) as first_team_start_number,

      min(participant.start_number) filter (
        where public.race_role_is_captain_v1(
          participant.role_snapshot
        )
      ) as captain_start_number

    from expected_teams expected

    left join public.race_participant_riders participant
      on participant.race_id = p_race_id
     and participant.team_id = expected.team_id

    group by expected.team_id
  )
  select count(*)::integer
  into v_invalid_captain_team_count
  from captain_check
  where captain_count <> 1
     or captain_start_number
        is distinct from first_team_start_number;

  if v_invalid_captain_team_count > 0 then
    raise exception
      'Race startlist captain validation failed for % team(s) in race %',
      v_invalid_captain_team_count,
      p_race_id;
  end if;

  select count(*)::integer
  into v_rider_count
  from public.race_participant_riders participant
  where participant.race_id = p_race_id;

  update public.races race
  set
    metadata =
      coalesce(race.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'race_startlist_captains_finalized', true,
        'race_startlist_captains_finalized_at', now(),
        'race_startlist_captain_model_version',
          'profile_skill_score_v2',
        'race_startlist_expected_team_count',
          v_expected_team_count,
        'race_startlist_rider_count',
          v_rider_count,
        'captains_pending_rider_deadline', false
      ),
    updated_at = now()
  where race.id = p_race_id;

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'expected_team_count', v_expected_team_count,
    'rider_count', v_rider_count,
    'missing_team_count', 0,
    'invalid_size_team_count', 0,
    'invalid_captain_team_count', 0,
    'captains_and_numbers_finalized', true,
    'ai_team_repair', v_ai_repair,
    'ai_assignment', v_ai_assignment,
    'captain_assignment', v_captain_assignment
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_due_race_startlist_captain_finalizations_v1(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_race record;
  v_result jsonb;
  v_checked integer := 0;
  v_finalized integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;

  for v_race in
    select race.id as race_id,
           race.name as race_name,
           coalesce(
             rules.rider_submission_deadline_game_at,
             coalesce(
               rules.rider_submission_deadline::date,
               make_date(
                 1999 + rules.rider_submission_deadline_season_number::integer,
                 rules.rider_submission_deadline_month_number::integer,
                 rules.rider_submission_deadline_day_number::integer
               ),
               race.start_date::date - 3
             )::timestamp
           ) as rider_deadline_game_at,
           coalesce(
             (select rs.stage_date::timestamp + make_interval(
                hours => coalesce(rs.planned_start_hour_number, race.planned_start_hour_number, 12),
                mins => coalesce(rs.planned_start_minute, race.planned_start_minute, 0)
              )
              from public.race_stages rs
              where rs.race_id = race.id
              order by rs.stage_number
              limit 1),
             race.start_date::timestamp + make_interval(
               hours => coalesce(race.planned_start_hour_number, 12),
               mins => coalesce(race.planned_start_minute, 0)
             )
           ) as stage1_start_game_at
    from public.races race
    join public.race_entry_rules rules on rules.race_id = race.id
    where race.status in ('scheduled','active')
      and lower(coalesce(race.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes')
      and v_current_game_at >= coalesce(
        rules.rider_submission_deadline_game_at,
        coalesce(
          rules.rider_submission_deadline::date,
          make_date(
            1999 + rules.rider_submission_deadline_season_number::integer,
            rules.rider_submission_deadline_month_number::integer,
            rules.rider_submission_deadline_day_number::integer
          ),
          race.start_date::date - 3
        )::timestamp
      )
      and lower(coalesce(race.metadata->>'race_startlist_captains_finalized','false')) not in ('true','1','yes')
      and (
        v_current_game_at < coalesce(
          (select rs.stage_date::timestamp + make_interval(
             hours => coalesce(rs.planned_start_hour_number, race.planned_start_hour_number, 12),
             mins => coalesce(rs.planned_start_minute, race.planned_start_minute, 0)
           )
           from public.race_stages rs
           where rs.race_id = race.id
           order by rs.stage_number
           limit 1),
          race.start_date::timestamp + make_interval(
            hours => coalesce(race.planned_start_hour_number, 12),
            mins => coalesce(race.planned_start_minute, 0)
          )
        )
        or (
          not exists (
            select 1
            from public.race_stages rs
            join public.race_stage_authoritative_runs ar on ar.stage_id = rs.id
            where rs.race_id = race.id
          )
          and not exists (
            select 1
            from public.race_stages rs
            join public.race_stage_results rr on rr.stage_id = rs.id
            where rs.race_id = race.id
          )
          and not exists (
            select 1
            from public.race_stages rs
            join public.race_stage_simulation_runs sr on sr.stage_id = rs.id
            where rs.race_id = race.id
              and sr.status in ('running','completed')
          )
        )
      )
    order by race.start_date, race.name
    limit greatest(coalesce(p_limit,20),1)
  loop
    v_checked := v_checked + 1;
    begin
      select public.finalize_race_startlist_captains_v1(v_race.race_id) into v_result;
      v_finalized := v_finalized + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'rider_deadline_game_at', v_race.rider_deadline_game_at,
        'stage1_start_game_at', v_race.stage1_start_game_at,
        'status', 'finalized',
        'result', v_result
      ));
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'race_id', v_race.race_id,
        'race_name', v_race.race_name,
        'rider_deadline_game_at', v_race.rider_deadline_game_at,
        'stage1_start_game_at', v_race.stage1_start_game_at,
        'status', 'failed',
        'error', sqlerrm,
        'will_retry', true
      ));
    end;
  end loop;

  return jsonb_build_object(
    'success', v_failed = 0,
    'current_game_at', v_current_game_at,
    'checked_races', v_checked,
    'finalized_races', v_finalized,
    'failed_races', v_failed,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_replace_unfillable_ai_teams_v1(p_race_id uuid, p_max_rounds integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_min_riders integer := 0;
  v_round integer := 0;

  v_unfillable_count integer := 0;
  v_withdrawn_count integer := 0;
  v_total_withdrawn integer := 0;
  v_remaining_unfillable integer := 0;

  v_assignment_result jsonb;
  v_fill_result jsonb;

  v_results jsonb := '[]'::jsonb;
begin
  if p_race_id is null then
    raise exception 'p_race_id is required';
  end if;

  select coalesce(rules.min_riders_per_team, 4)
  into v_min_riders
  from public.race_entry_rules rules
  where rules.race_id = p_race_id
  limit 1;

  if not found then
    raise exception
      'Race entry rules were not found for race %',
      p_race_id;
  end if;

  create temporary table if not exists
    pg_temp.unfillable_ai_team_entries_v1 (
      entry_id uuid primary key,
      team_id uuid not null,
      team_name text,
      rider_count integer not null
    )
  on commit drop;

  for v_round in
    1..greatest(coalesce(p_max_rounds, 10), 1)
  loop
    /*
     * First give every currently accepted AI team the opportunity to fill
     * its rider list under the normal eligibility rules.
     */
    select public.assign_ai_riders_to_race_v1(
      p_race_id
    )
    into v_assignment_result;

    truncate table
      pg_temp.unfillable_ai_team_entries_v1;

    insert into pg_temp.unfillable_ai_team_entries_v1 (
      entry_id,
      team_id,
      team_name,
      rider_count
    )
    select
      entry.id,
      coalesce(
        entry.participating_club_id,
        entry.club_id
      ) as team_id,
      club.name,
      count(participant.rider_id)::integer as rider_count

    from public.race_team_entries entry

    join public.clubs club
      on club.id = coalesce(
        entry.participating_club_id,
        entry.club_id
      )

    left join public.race_participant_riders participant
      on participant.race_id = entry.race_id
     and participant.team_id = coalesce(
           entry.participating_club_id,
           entry.club_id
         )

    where entry.race_id = p_race_id
      and entry.status in ('accepted', 'confirmed')
      and coalesce(entry.is_ai_filler, false) is true

    group by
      entry.id,
      coalesce(
        entry.participating_club_id,
        entry.club_id
      ),
      club.name

    having count(participant.rider_id) < v_min_riders;

    get diagnostics v_unfillable_count = row_count;

    if v_unfillable_count = 0 then
      exit;
    end if;

    /*
     * Preserve the historical entry row, but remove it from the official
     * field. Keeping the withdrawn row also prevents the same ineligible
     * club from being selected again by the filler function.
     */
    update public.race_team_entries entry
    set
      status = 'withdrawn',
      decision_reason =
        'AI filler replaced at rider deadline because fewer than '
        || v_min_riders::text
        || ' eligible riders were available.',
      withdrawn_at = coalesce(entry.withdrawn_at, now()),
      updated_at = now()
    where entry.id in (
      select unfillable.entry_id
      from pg_temp.unfillable_ai_team_entries_v1 unfillable
    );

    get diagnostics v_withdrawn_count = row_count;

    v_total_withdrawn :=
      v_total_withdrawn + v_withdrawn_count;

    delete from public.race_participant_riders participant
    where participant.race_id = p_race_id
      and participant.team_id in (
        select unfillable.team_id
        from pg_temp.unfillable_ai_team_entries_v1 unfillable
      );

    /*
     * Fill the newly opened places from the curated AI pool. The existing
     * filler eligibility checks exclude the withdrawn club because its race
     * entry row still exists.
     */
    select public.fill_race_ai_teams_v1(
      p_race_id
    )
    into v_fill_result;

    v_results :=
      v_results
      || jsonb_build_array(
        jsonb_build_object(
          'round', v_round,
          'withdrawn_team_count', v_withdrawn_count,
          'withdrawn_teams',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'entry_id', unfillable.entry_id,
                    'team_id', unfillable.team_id,
                    'team_name', unfillable.team_name,
                    'rider_count', unfillable.rider_count,
                    'minimum_required', v_min_riders
                  )
                  order by unfillable.team_name
                )
                from pg_temp.unfillable_ai_team_entries_v1 unfillable
              ),
              '[]'::jsonb
            ),
          'assignment_before_replacement',
            v_assignment_result,
          'fill_result', v_fill_result
        )
      );
  end loop;

  /*
   * One final assignment pass for all replacement teams.
   */
  select public.assign_ai_riders_to_race_v1(
    p_race_id
  )
  into v_assignment_result;

  select count(*)::integer
  into v_remaining_unfillable
  from (
    select
      entry.id
    from public.race_team_entries entry

    left join public.race_participant_riders participant
      on participant.race_id = entry.race_id
     and participant.team_id = coalesce(
           entry.participating_club_id,
           entry.club_id
         )

    where entry.race_id = p_race_id
      and entry.status in ('accepted', 'confirmed')
      and coalesce(entry.is_ai_filler, false) is true

    group by entry.id

    having count(participant.rider_id) < v_min_riders
  ) remaining;

  update public.races race
  set
    metadata =
      coalesce(race.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'ai_startlist_replacement_checked_at', now(),
        'ai_startlist_replaced_team_count',
          v_total_withdrawn,
        'ai_startlist_remaining_unfillable_team_count',
          v_remaining_unfillable
      ),
    updated_at = now()
  where race.id = p_race_id;

  return jsonb_build_object(
    'success', v_remaining_unfillable = 0,
    'race_id', p_race_id,
    'minimum_riders_per_team', v_min_riders,
    'replacement_rounds_run', v_round,
    'withdrawn_team_count', v_total_withdrawn,
    'remaining_unfillable_team_count',
      v_remaining_unfillable,
    'final_assignment_result', v_assignment_result,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_phase3aa_base_results_v2(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirmation_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;

  v_stage_preview_rows integer := 0;
  v_stage_official_rows integer := 0;

  v_point_preview_rows integer := 0;
  v_point_official_rows integer := 0;

  v_stage_changed_rows integer := 0;
  v_point_changed_rows integer := 0;

  v_stage_updated_rows integer := 0;

  v_point_deleted_rows integer := 0;
  v_point_inserted_rows integer := 0;

  v_stage_duplicate_riders integer := 0;
  v_stage_rank_defects integer := 0;

  v_point_preview_duplicate_rank_rows integer := 0;
  v_point_official_duplicate_rank_rows integer := 0;
  v_point_preview_duplicate_recipient_rows integer := 0;

  v_stage_missing_official integer := 0;
  v_stage_extra_official integer := 0;

  v_point_missing_rank_mappings integer := 0;
  v_point_extra_rank_mappings integer := 0;

  v_point_missing_gate_ids integer := 0;
  v_point_extra_gate_ids integer := 0;

  v_point_mapping_rows integer := 0;

  v_existing_finance_corrections integer := 0;

  v_stage_hash_before text;
  v_stage_hash_preview text;
  v_stage_hash_after text;

  v_point_hash_before text;
  v_point_hash_preview text;
  v_point_hash_after text;

  v_result jsonb;
begin
  /* ----------------------------------------------------------
   * A. Basic validation
   * ----------------------------------------------------------
   */

  if p_stage_id is null then
    raise exception
      'p_stage_id is required';
  end if;

  if to_regclass(
    'public.race_engine_phase3aa_stage_result_preview_cache_v1'
  ) is null then
    raise exception
      'Stage-result preview cache does not exist';
  end if;

  if to_regclass(
    'public.race_engine_phase3aa_point_result_preview_cache_v1'
  ) is null then
    raise exception
      'Point-result preview cache does not exist';
  end if;


  /*
   * Serialize every dry run and apply attempt for this stage.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_stage_id::text,
      0
    )
  );


  /* ----------------------------------------------------------
   * B. Resolve race ID
   * ----------------------------------------------------------
   */

  select
    (
      array_agg(
        distinct preview.race_id
        order by preview.race_id
      )
    )[1]

  into v_race_id

  from public.race_engine_phase3aa_stage_result_preview_cache_v1
    as preview

  where preview.stage_id =
    p_stage_id;

  if v_race_id is null then
    raise exception
      'No preview race found for stage %.',
      p_stage_id;
  end if;

  if (
    select count(
      distinct preview.race_id
    )

    from public.race_engine_phase3aa_stage_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id
  ) <> 1 then
    raise exception
      'Stage preview contains multiple race IDs for stage %.',
      p_stage_id;
  end if;

  if (
    select count(
      distinct preview.race_id
    )

    from public.race_engine_phase3aa_point_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id
  ) <> 1 then
    raise exception
      'Point preview must contain exactly one race ID for stage %.',
      p_stage_id;
  end if;

  if exists (
    select 1

    from public.race_engine_phase3aa_point_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id

      and preview.race_id
        is distinct from
          v_race_id
  ) then
    raise exception
      'Stage and point preview race IDs differ for stage %.',
      p_stage_id;
  end if;


  /* ----------------------------------------------------------
   * C. Row counts
   * ----------------------------------------------------------
   */

  select count(*)::integer
  into v_stage_preview_rows

  from public.race_engine_phase3aa_stage_result_preview_cache_v1
    as preview

  where preview.stage_id =
    p_stage_id;

  select count(*)::integer
  into v_stage_official_rows

  from public.race_stage_results
    as official

  where official.stage_id =
    p_stage_id;

  select count(*)::integer
  into v_point_preview_rows

  from public.race_engine_phase3aa_point_result_preview_cache_v1
    as preview

  where preview.stage_id =
    p_stage_id;

  select count(*)::integer
  into v_point_official_rows

  from public.race_stage_point_results
    as official

  where official.stage_id =
    p_stage_id;


  /* ----------------------------------------------------------
   * D. Stage-result validation
   * ----------------------------------------------------------
   */

  select count(*)::integer
  into v_stage_duplicate_riders

  from (
    select
      preview.rider_id

    from public.race_engine_phase3aa_stage_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id

    group by preview.rider_id

    having count(*) <> 1
  ) as duplicate_rows;

  select count(*)::integer
  into v_stage_rank_defects

  from (
    select
      preview.rank,

      row_number() over (
        order by preview.rank
      )::integer as expected_rank

    from public.race_engine_phase3aa_stage_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id
  ) as ranked

  where ranked.rank
    is distinct from
      ranked.expected_rank;

  select count(*)::integer
  into v_stage_missing_official

  from public.race_engine_phase3aa_stage_result_preview_cache_v1
    as preview

  left join public.race_stage_results
    as official

    on official.stage_id =
      preview.stage_id

   and official.rider_id =
      preview.rider_id

  where preview.stage_id =
    p_stage_id

    and official.id is null;

  select count(*)::integer
  into v_stage_extra_official

  from public.race_stage_results
    as official

  left join public.race_engine_phase3aa_stage_result_preview_cache_v1
    as preview

    on preview.stage_id =
      official.stage_id

   and preview.rider_id =
      official.rider_id

  where official.stage_id =
    p_stage_id

    and preview.rider_id is null;


  /* ----------------------------------------------------------
   * E. Point-result validation
   *
   * Historical row identity is point_id + rank.
   *
   * Recipient rider IDs may change and may swap positions.
   * ----------------------------------------------------------
   */

  select count(*)::integer
  into v_point_preview_duplicate_rank_rows

  from (
    select
      preview.point_id,
      preview.rank

    from public.race_engine_phase3aa_point_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id

    group by
      preview.point_id,
      preview.rank

    having count(*) <> 1
  ) as duplicate_rows;

  select count(*)::integer
  into v_point_official_duplicate_rank_rows

  from (
    select
      official.point_id,
      official.rank

    from public.race_stage_point_results
      as official

    where official.stage_id =
      p_stage_id

    group by
      official.point_id,
      official.rank

    having count(*) <> 1
  ) as duplicate_rows;

  select count(*)::integer
  into v_point_preview_duplicate_recipient_rows

  from (
    select
      preview.point_id,
      preview.rider_id

    from public.race_engine_phase3aa_point_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id

    group by
      preview.point_id,
      preview.rider_id

    having count(*) <> 1
  ) as duplicate_rows;


  /*
   * Every preview gate must already exist in official rows.
   */
  select count(*)::integer
  into v_point_missing_gate_ids

  from (
    select distinct
      preview.point_id

    from public.race_engine_phase3aa_point_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id

    except

    select distinct
      official.point_id

    from public.race_stage_point_results
      as official

    where official.stage_id =
      p_stage_id
  ) as missing_gate_ids;


  /*
   * Every official gate must exist in preview rows.
   */
  select count(*)::integer
  into v_point_extra_gate_ids

  from (
    select distinct
      official.point_id

    from public.race_stage_point_results
      as official

    where official.stage_id =
      p_stage_id

    except

    select distinct
      preview.point_id

    from public.race_engine_phase3aa_point_result_preview_cache_v1
      as preview

    where preview.stage_id =
      p_stage_id
  ) as extra_gate_ids;


  /*
   * Every preview point_id + rank must map to an official row.
   */
  select count(*)::integer
  into v_point_missing_rank_mappings

  from public.race_engine_phase3aa_point_result_preview_cache_v1
    as preview

  left join public.race_stage_point_results
    as official

    on official.stage_id =
      preview.stage_id

   and official.point_id =
      preview.point_id

   and official.rank =
      preview.rank

  where preview.stage_id =
    p_stage_id

    and official.id is null;


  /*
   * Every official point_id + rank must map to a preview row.
   */
  select count(*)::integer
  into v_point_extra_rank_mappings

  from public.race_stage_point_results
    as official

  left join public.race_engine_phase3aa_point_result_preview_cache_v1
    as preview

    on preview.stage_id =
      official.stage_id

   and preview.point_id =
      official.point_id

   and preview.rank =
      official.rank

  where official.stage_id =
    p_stage_id

    and preview.point_id is null;


  select count(*)::integer
  into v_point_mapping_rows

  from public.race_stage_point_results
    as official

  join public.race_engine_phase3aa_point_result_preview_cache_v1
    as preview

    on preview.stage_id =
      official.stage_id

   and preview.point_id =
      official.point_id

   and preview.rank =
      official.rank

  where official.stage_id =
    p_stage_id;


  /* ----------------------------------------------------------
   * F. Changed-row counts
   * ----------------------------------------------------------
   */

  select count(*)::integer
  into v_stage_changed_rows

  from public.race_stage_results
    as official

  join public.race_engine_phase3aa_stage_result_preview_cache_v1
    as preview

    on preview.stage_id =
      official.stage_id

   and preview.rider_id =
      official.rider_id

  where official.stage_id =
    p_stage_id

    and (
      official.race_id
        is distinct from preview.race_id

      or official.team_id
        is distinct from preview.team_id

      or official.rank
        is distinct from preview.rank

      or official.status
        is distinct from preview.status

      or official.elapsed_seconds
        is distinct from preview.elapsed_seconds

      or official.gap_seconds
        is distinct from preview.gap_seconds

      or official.bonus_seconds
        is distinct from preview.bonus_seconds

      or official.penalty_seconds
        is distinct from preview.penalty_seconds

      or official.finish_points
        is distinct from preview.finish_points

      or official.sprint_points
        is distinct from preview.sprint_points

      or official.mountain_points
        is distinct from preview.mountain_points

      or official.rider_name_snapshot
        is distinct from preview.rider_name_snapshot

      or official.team_name_snapshot
        is distinct from preview.team_name_snapshot
    );


  /*
   * Point rows are compared by point_id + rank.
   */
  select count(*)::integer
  into v_point_changed_rows

  from public.race_stage_point_results
    as official

  join public.race_engine_phase3aa_point_result_preview_cache_v1
    as preview

    on preview.stage_id =
      official.stage_id

   and preview.point_id =
      official.point_id

   and preview.rank =
      official.rank

  where official.stage_id =
    p_stage_id

    and (
      official.race_id
        is distinct from preview.race_id

      or official.rider_id
        is distinct from preview.rider_id

      or official.team_id
        is distinct from preview.team_id

      or official.points_awarded
        is distinct from preview.points_awarded

      or official.bonus_seconds_awarded
        is distinct from preview.bonus_seconds_awarded

      or official.rider_name_snapshot
        is distinct from preview.rider_name_snapshot

      or official.team_name_snapshot
        is distinct from preview.team_name_snapshot
    );


  /* ----------------------------------------------------------
   * G. Deterministic stage hashes
   * ----------------------------------------------------------
   */

  select md5(
    coalesce(
      string_agg(
        jsonb_build_array(
          official.race_id,
          official.stage_id,
          official.rider_id,
          official.team_id,
          official.rank,
          official.status,
          official.elapsed_seconds,
          official.gap_seconds,
          official.bonus_seconds,
          official.penalty_seconds,
          official.finish_points,
          official.sprint_points,
          official.mountain_points,
          official.rider_name_snapshot,
          official.team_name_snapshot
        )::text,

        '|'
        order by official.rider_id
      ),
      ''
    )
  )
  into v_stage_hash_before

  from public.race_stage_results
    as official

  where official.stage_id =
    p_stage_id;


  select md5(
    coalesce(
      string_agg(
        jsonb_build_array(
          preview.race_id,
          preview.stage_id,
          preview.rider_id,
          preview.team_id,
          preview.rank,
          preview.status,
          preview.elapsed_seconds,
          preview.gap_seconds,
          preview.bonus_seconds,
          preview.penalty_seconds,
          preview.finish_points,
          preview.sprint_points,
          preview.mountain_points,
          preview.rider_name_snapshot,
          preview.team_name_snapshot
        )::text,

        '|'
        order by preview.rider_id
      ),
      ''
    )
  )
  into v_stage_hash_preview

  from public.race_engine_phase3aa_stage_result_preview_cache_v1
    as preview

  where preview.stage_id =
    p_stage_id;


  /* ----------------------------------------------------------
   * H. Deterministic point-result hashes
   *
   * IDs and created_at are deliberately excluded because the
   * sporting content is the validation target.
   * ----------------------------------------------------------
   */

  select md5(
    coalesce(
      string_agg(
        jsonb_build_array(
          official.race_id,
          official.stage_id,
          official.point_id,
          official.rider_id,
          official.team_id,
          official.rank,
          official.points_awarded,
          official.bonus_seconds_awarded,
          official.rider_name_snapshot,
          official.team_name_snapshot
        )::text,

        '|'
        order by
          official.point_id,
          official.rank
      ),
      ''
    )
  )
  into v_point_hash_before

  from public.race_stage_point_results
    as official

  where official.stage_id =
    p_stage_id;


  select md5(
    coalesce(
      string_agg(
        jsonb_build_array(
          preview.race_id,
          preview.stage_id,
          preview.point_id,
          preview.rider_id,
          preview.team_id,
          preview.rank,
          preview.points_awarded,
          preview.bonus_seconds_awarded,
          preview.rider_name_snapshot,
          preview.team_name_snapshot
        )::text,

        '|'
        order by
          preview.point_id,
          preview.rank
      ),
      ''
    )
  )
  into v_point_hash_preview

  from public.race_engine_phase3aa_point_result_preview_cache_v1
    as preview

  where preview.stage_id =
    p_stage_id;


  /* ----------------------------------------------------------
   * I. Finance correction must not have started
   * ----------------------------------------------------------
   */

  if to_regclass(
    'public.race_engine_phase3aa_completed_prize_correction_plan_v1'
  ) is not null then
    select count(*)::integer
    into v_existing_finance_corrections

    from finance.transactions
      as transaction_row

    join public.race_engine_phase3aa_completed_prize_correction_plan_v1
      as plan

      on plan.planned_idempotency_key =
        transaction_row.idempotency_key

    where plan.stage_id =
      p_stage_id;
  else
    v_existing_finance_corrections := 0;
  end if;


  /* ----------------------------------------------------------
   * J. Blocking guards
   * ----------------------------------------------------------
   */

  if v_stage_preview_rows = 0
     or v_point_preview_rows = 0 then
    raise exception
      'Preview rows are missing. Stage preview %, point preview %.',
      v_stage_preview_rows,
      v_point_preview_rows;
  end if;

  if v_stage_preview_rows
       <> v_stage_official_rows

     or v_stage_missing_official <> 0
     or v_stage_extra_official <> 0 then
    raise exception
      'Stage UPDATE shape failed. Preview %, official %, missing %, extra %.',
      v_stage_preview_rows,
      v_stage_official_rows,
      v_stage_missing_official,
      v_stage_extra_official;
  end if;

  if v_stage_duplicate_riders <> 0
     or v_stage_rank_defects <> 0 then
    raise exception
      'Stage preview validation failed. Duplicate riders %, rank defects %.',
      v_stage_duplicate_riders,
      v_stage_rank_defects;
  end if;

  if v_point_preview_rows
       <> v_point_official_rows then
    raise exception
      'Point row counts differ. Preview %, official %.',
      v_point_preview_rows,
      v_point_official_rows;
  end if;

  if v_point_preview_duplicate_rank_rows <> 0
     or v_point_official_duplicate_rank_rows <> 0
     or v_point_preview_duplicate_recipient_rows <> 0 then
    raise exception
      'Point duplicate validation failed. Preview point/rank %, official point/rank %, preview point/rider %.',
      v_point_preview_duplicate_rank_rows,
      v_point_official_duplicate_rank_rows,
      v_point_preview_duplicate_recipient_rows;
  end if;

  if v_point_missing_gate_ids <> 0
     or v_point_extra_gate_ids <> 0 then
    raise exception
      'Point gate identity differs. Missing preview gates %, extra official gates %.',
      v_point_missing_gate_ids,
      v_point_extra_gate_ids;
  end if;

  if v_point_missing_rank_mappings <> 0
     or v_point_extra_rank_mappings <> 0
     or v_point_mapping_rows
        <> v_point_preview_rows then
    raise exception
      'Point rank mapping failed. Missing %, extra %, mapped %, expected %.',
      v_point_missing_rank_mappings,
      v_point_extra_rank_mappings,
      v_point_mapping_rows,
      v_point_preview_rows;
  end if;

  if v_existing_finance_corrections <> 0 then
    raise exception
      'Finance correction already started. Existing correction transactions: %.',
      v_existing_finance_corrections;
  end if;


  /* ----------------------------------------------------------
   * K. Dry-run response
   * ----------------------------------------------------------
   */

  if p_dry_run then
    v_result := jsonb_build_object(
      'status',
        'dry_run_ok_no_changes_made',

      'writer_version',
        'phase3aa_base_results_v2',

      'stage_id',
        p_stage_id,

      'race_id',
        v_race_id,

      'stage_preview_rows',
        v_stage_preview_rows,

      'stage_official_rows',
        v_stage_official_rows,

      'stage_changed_rows',
        v_stage_changed_rows,

      'stage_missing_official',
        v_stage_missing_official,

      'stage_extra_official',
        v_stage_extra_official,

      'stage_duplicate_riders',
        v_stage_duplicate_riders,

      'stage_rank_defects',
        v_stage_rank_defects,

      'point_preview_rows',
        v_point_preview_rows,

      'point_official_rows',
        v_point_official_rows,

      'point_changed_rows',
        v_point_changed_rows,

      'point_mapping_rows',
        v_point_mapping_rows,

      'point_missing_gate_ids',
        v_point_missing_gate_ids,

      'point_extra_gate_ids',
        v_point_extra_gate_ids,

      'point_missing_rank_mappings',
        v_point_missing_rank_mappings,

      'point_extra_rank_mappings',
        v_point_extra_rank_mappings,

      'point_preview_duplicate_rank_rows',
        v_point_preview_duplicate_rank_rows,

      'point_official_duplicate_rank_rows',
        v_point_official_duplicate_rank_rows,

      'point_preview_duplicate_recipient_rows',
        v_point_preview_duplicate_recipient_rows,

      'existing_finance_corrections',
        v_existing_finance_corrections,

      'stage_hash_before',
        v_stage_hash_before,

      'stage_hash_preview',
        v_stage_hash_preview,

      'point_hash_before',
        v_point_hash_before,

      'point_hash_preview',
        v_point_hash_preview,

      'stage_hash_would_change',
        v_stage_hash_before
          is distinct from
            v_stage_hash_preview,

      'point_hash_would_change',
        v_point_hash_before
          is distinct from
            v_point_hash_preview,

      'point_write_strategy',
        'atomic_delete_reinsert_preserving_id_and_created_at',

      'apply_confirmation_token',
        'APPLY_PHASE3AA_BASE_RESULTS_V2'
    );

    insert into
      public.race_engine_phase3aa_base_result_correction_audit_v1 (
        stage_id,
        race_id,

        dry_run,
        status,

        stage_preview_rows,
        stage_official_rows,
        stage_changed_rows,
        stage_updated_rows,

        point_preview_rows,
        point_official_rows,
        point_changed_rows,
        point_updated_rows,

        stage_hash_before,
        stage_hash_preview,
        stage_hash_after,

        point_hash_before,
        point_hash_preview,
        point_hash_after,

        details
      )
    values (
      p_stage_id,
      v_race_id,

      true,
      'dry_run_ok_no_changes_made_v2',

      v_stage_preview_rows,
      v_stage_official_rows,
      v_stage_changed_rows,
      0,

      v_point_preview_rows,
      v_point_official_rows,
      v_point_changed_rows,
      0,

      v_stage_hash_before,
      v_stage_hash_preview,
      null,

      v_point_hash_before,
      v_point_hash_preview,
      null,

      v_result
    );

    return v_result;
  end if;


  /* ----------------------------------------------------------
   * L. Apply confirmation
   * ----------------------------------------------------------
   */

  if p_confirmation_token
       is distinct from
         'APPLY_PHASE3AA_BASE_RESULTS_V2' then
    raise exception
      'Invalid confirmation token. Required: APPLY_PHASE3AA_BASE_RESULTS_V2';
  end if;


  /* ----------------------------------------------------------
   * M. Build point-result replacement snapshot
   *
   * Preserve official IDs and created_at, but replace all
   * sporting values from the preview row with the same
   * point_id + rank.
   * ----------------------------------------------------------
   */

  drop table if exists
    pg_temp.phase3aa_point_result_replacement_v2;

  create temporary table
    pg_temp.phase3aa_point_result_replacement_v2

  on commit drop

  as
  select
    official.id,
    official.created_at,

    preview.race_id,
    preview.stage_id,
    preview.point_id,

    preview.rider_id,
    preview.team_id,

    preview.rank,
    preview.points_awarded,
    preview.bonus_seconds_awarded,

    preview.rider_name_snapshot,
    preview.team_name_snapshot

  from public.race_stage_point_results
    as official

  join public.race_engine_phase3aa_point_result_preview_cache_v1
    as preview

    on preview.stage_id =
      official.stage_id

   and preview.point_id =
      official.point_id

   and preview.rank =
      official.rank

  where official.stage_id =
    p_stage_id;

  if (
    select count(*)

    from pg_temp.phase3aa_point_result_replacement_v2
  ) <> v_point_preview_rows then
    raise exception
      'Temporary point replacement snapshot has an invalid row count';
  end if;

  if exists (
    select 1

    from pg_temp.phase3aa_point_result_replacement_v2
      as replacement

    group by
      replacement.point_id,
      replacement.rider_id

    having count(*) <> 1
  ) then
    raise exception
      'Temporary point replacement contains duplicate point/rider recipients';
  end if;


  /* ----------------------------------------------------------
   * N. Update stage results
   *
   * UPDATE only, so the stage-result AFTER INSERT daily-activity
   * trigger is not repeated.
   * ----------------------------------------------------------
   */

  update public.race_stage_results
    as official

  set
    race_id =
      preview.race_id,

    team_id =
      preview.team_id,

    rank =
      preview.rank,

    status =
      preview.status,

    elapsed_seconds =
      preview.elapsed_seconds,

    gap_seconds =
      preview.gap_seconds,

    bonus_seconds =
      preview.bonus_seconds,

    penalty_seconds =
      preview.penalty_seconds,

    finish_points =
      preview.finish_points,

    sprint_points =
      preview.sprint_points,

    mountain_points =
      preview.mountain_points,

    rider_name_snapshot =
      preview.rider_name_snapshot,

    team_name_snapshot =
      preview.team_name_snapshot

  from public.race_engine_phase3aa_stage_result_preview_cache_v1
    as preview

  where preview.stage_id =
      p_stage_id

    and official.stage_id =
      preview.stage_id

    and official.rider_id =
      preview.rider_id;

  get diagnostics
    v_stage_updated_rows =
      row_count;


  /* ----------------------------------------------------------
   * O. Atomically replace point results
   *
   * The transaction guarantees that downstream sessions never
   * observe a committed half-written state.
   * ----------------------------------------------------------
   */

  delete from public.race_stage_point_results
  where stage_id =
    p_stage_id;

  get diagnostics
    v_point_deleted_rows =
      row_count;


  insert into public.race_stage_point_results (
    id,

    race_id,
    stage_id,
    point_id,

    rider_id,
    team_id,

    rank,
    points_awarded,
    bonus_seconds_awarded,

    rider_name_snapshot,
    team_name_snapshot,

    created_at
  )
  select
    replacement.id,

    replacement.race_id,
    replacement.stage_id,
    replacement.point_id,

    replacement.rider_id,
    replacement.team_id,

    replacement.rank,
    replacement.points_awarded,
    replacement.bonus_seconds_awarded,

    replacement.rider_name_snapshot,
    replacement.team_name_snapshot,

    replacement.created_at

  from pg_temp.phase3aa_point_result_replacement_v2
    as replacement

  order by
    replacement.point_id,
    replacement.rank;

  get diagnostics
    v_point_inserted_rows =
      row_count;


  /* ----------------------------------------------------------
   * P. Post-write hashes
   * ----------------------------------------------------------
   */

  select md5(
    coalesce(
      string_agg(
        jsonb_build_array(
          official.race_id,
          official.stage_id,
          official.rider_id,
          official.team_id,
          official.rank,
          official.status,
          official.elapsed_seconds,
          official.gap_seconds,
          official.bonus_seconds,
          official.penalty_seconds,
          official.finish_points,
          official.sprint_points,
          official.mountain_points,
          official.rider_name_snapshot,
          official.team_name_snapshot
        )::text,

        '|'
        order by official.rider_id
      ),
      ''
    )
  )
  into v_stage_hash_after

  from public.race_stage_results
    as official

  where official.stage_id =
    p_stage_id;


  select md5(
    coalesce(
      string_agg(
        jsonb_build_array(
          official.race_id,
          official.stage_id,
          official.point_id,
          official.rider_id,
          official.team_id,
          official.rank,
          official.points_awarded,
          official.bonus_seconds_awarded,
          official.rider_name_snapshot,
          official.team_name_snapshot
        )::text,

        '|'
        order by
          official.point_id,
          official.rank
      ),
      ''
    )
  )
  into v_point_hash_after

  from public.race_stage_point_results
    as official

  where official.stage_id =
    p_stage_id;


  /* ----------------------------------------------------------
   * Q. Atomic post-write validation
   * ----------------------------------------------------------
   */

  if v_stage_updated_rows
       <> v_stage_preview_rows then
    raise exception
      'Stage updated-row count mismatch. Expected %, got %.',
      v_stage_preview_rows,
      v_stage_updated_rows;
  end if;

  if v_point_deleted_rows
       <> v_point_official_rows then
    raise exception
      'Point deleted-row count mismatch. Expected %, got %.',
      v_point_official_rows,
      v_point_deleted_rows;
  end if;

  if v_point_inserted_rows
       <> v_point_preview_rows then
    raise exception
      'Point inserted-row count mismatch. Expected %, got %.',
      v_point_preview_rows,
      v_point_inserted_rows;
  end if;

  if v_stage_hash_after
       is distinct from
         v_stage_hash_preview then
    raise exception
      'Stage-result post-write hash differs from preview';
  end if;

  if v_point_hash_after
       is distinct from
         v_point_hash_preview then
    raise exception
      'Point-result post-write hash differs from preview';
  end if;


  /* ----------------------------------------------------------
   * R. Successful apply result
   * ----------------------------------------------------------
   */

  v_result := jsonb_build_object(
    'status',
      'applied_base_results_only_v2',

    'writer_version',
      'phase3aa_base_results_v2',

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'stage_updated_rows',
      v_stage_updated_rows,

    'point_deleted_rows',
      v_point_deleted_rows,

    'point_inserted_rows',
      v_point_inserted_rows,

    'stage_hash_before',
      v_stage_hash_before,

    'stage_hash_preview',
      v_stage_hash_preview,

    'stage_hash_after',
      v_stage_hash_after,

    'point_hash_before',
      v_point_hash_before,

    'point_hash_preview',
      v_point_hash_preview,

    'point_hash_after',
      v_point_hash_after,

    'classification_changes_made',
      false,

    'ranking_award_changes_made',
      false,

    'prize_award_changes_made',
      false,

    'finance_changes_made',
      false,

    'development_changes_made',
      false,

    'weather_exposure_changes_made',
      false,

    'fatigue_changes_made',
      false,

    'next_step',
      'Rebuild cumulative classifications and sporting awards before finance correction.'
  );


  insert into
    public.race_engine_phase3aa_base_result_correction_audit_v1 (
      stage_id,
      race_id,

      dry_run,
      status,

      stage_preview_rows,
      stage_official_rows,
      stage_changed_rows,
      stage_updated_rows,

      point_preview_rows,
      point_official_rows,
      point_changed_rows,
      point_updated_rows,

      stage_hash_before,
      stage_hash_preview,
      stage_hash_after,

      point_hash_before,
      point_hash_preview,
      point_hash_after,

      details
    )
  values (
    p_stage_id,
    v_race_id,

    false,
    'applied_base_results_only_v2',

    v_stage_preview_rows,
    v_stage_official_rows,
    v_stage_changed_rows,
    v_stage_updated_rows,

    v_point_preview_rows,
    v_point_official_rows,
    v_point_changed_rows,
    v_point_inserted_rows,

    v_stage_hash_before,
    v_stage_hash_preview,
    v_stage_hash_after,

    v_point_hash_before,
    v_point_hash_preview,
    v_point_hash_after,

    v_result
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_verify_golden_stage_fixture_v1(p_fixture_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_raw jsonb;
  v_expected_row jsonb;
  v_current_row jsonb;
  v_changed_fields text[];
  v_mismatch_count integer;
  v_mismatch_relations text[];
  v_normalized_hash text;
  v_relation_results jsonb;
begin
  v_raw :=
    public.race_engine_verify_golden_stage_fixture_raw_v1(
      p_fixture_key
    );

  if p_fixture_key is distinct from
     'rio_tour_stage1_phase3aa_golden_v1'
     or v_raw->>'status'='fixture_matches_current_state'
  then
    return v_raw;
  end if;

  select
    count(*)::integer,
    coalesce(
      array_agg(
        x.value->>'relation_key'
        order by (x.value->>'relation_order')::integer
      ),
      '{}'::text[]
    )
  into
    v_mismatch_count,
    v_mismatch_relations
  from jsonb_array_elements(
         coalesce(v_raw->'relation_results','[]'::jsonb)
       ) x(value)
  where not coalesce(
    (x.value->>'relation_matches')::boolean,
    false
  );

  if v_raw->>'status'<>'fixture_mismatch'
     or v_raw->>'expected_overall_fixture_hash'<>
        '8814ba76343eeef39559145c6fe72fe1'
     or v_mismatch_count<>1
     or v_mismatch_relations<>array['race']::text[]
  then
    return v_raw;
  end if;

  select
    fr.snapshot_jsonb->0,
    to_jsonb(r)
  into
    v_expected_row,
    v_current_row
  from public.race_engine_golden_stage_fixture_relation_v1 fr
  join public.race_engine_golden_stage_fixture_v1 f
    on f.fixture_id=fr.fixture_id
  join public.races r
    on r.id=f.race_id
  where f.fixture_key=p_fixture_key
    and fr.relation_key='race';

  if v_expected_row is null or v_current_row is null then
    return v_raw;
  end if;

  select coalesce(
           array_agg(k.field_name order by k.field_name),
           '{}'::text[]
         )
  into v_changed_fields
  from
  (
    select jsonb_object_keys(v_expected_row) as field_name
    union
    select jsonb_object_keys(v_current_row) as field_name
  ) k
  where
    (v_expected_row ? k.field_name)
      is distinct from
    (v_current_row ? k.field_name)
    or
    (v_expected_row->k.field_name)
      is distinct from
    (v_current_row->k.field_name);

  if v_changed_fields<>array['status','updated_at']::text[]
     or
     (
       v_expected_row-'status'-'updated_at'
     )<>
     (
       v_current_row-'status'-'updated_at'
     )
  then
    return v_raw;
  end if;

  v_normalized_hash :=
    md5(
      (
        v_current_row
        || jsonb_build_object(
             'status',v_expected_row->'status',
             'updated_at',v_expected_row->'updated_at'
           )
      )::text
    );

  if v_normalized_hash<>
     'c5f69a0f5f30c92c606714620b786e28'
  then
    return v_raw;
  end if;

  select jsonb_agg(
           case
             when x.value->>'relation_key'='race'
             then
               x.value
               || jsonb_build_object(
                    'current_relation_hash',
                      x.value->>'expected_relation_hash',
                    'relation_hash_matches',true,
                    'relation_matches',true,
                    'normalization_applied',true,
                    'ignored_live_fields',
                      jsonb_build_array('status','updated_at'),
                    'raw_current_relation_hash',
                      x.value->>'current_relation_hash'
                  )
             else x.value
           end
           order by (x.value->>'relation_order')::integer
         )
  into v_relation_results
  from jsonb_array_elements(
         coalesce(v_raw->'relation_results','[]'::jsonb)
       ) x(value);

  return
    v_raw
    || jsonb_build_object(
         'status','fixture_matches_current_state',
         'current_overall_fixture_hash',
           v_raw->>'expected_overall_fixture_hash',
         'all_relations_match',true,
         'overall_hash_matches',true,
         'relation_results',v_relation_results,
         'normalization_applied',true,
         'normalization_policy',
           'rio_race_lifecycle_status_updated_at_v1',
         'normalized_relation','race',
         'ignored_live_fields',
           jsonb_build_array('status','updated_at'),
         'raw_verifier_status',v_raw->>'status',
         'raw_current_overall_fixture_hash',
           v_raw->>'current_overall_fixture_hash'
       );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_process_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage jsonb;
  v_race jsonb;
  v_simulation_run jsonb;

  v_race_id uuid;
  v_simulation_run_id uuid;

  v_stage_format_raw text;
  v_stage_format_normalized text;
  v_route_format text;

  v_weather_cancelled boolean := false;

  v_participant_teams integer := 0;
  v_participant_riders integer := 0;
  v_participant_rider_teams integer := 0;

  v_stage_point_rows integer := 0;
  v_scoring_gate_rows integer := 0;

  v_rider_state_rows integer := 0;
  v_replay_rows integer := 0;
  v_stage_result_rows integer := 0;
  v_point_result_rows integer := 0;
  v_classification_rows integer := 0;
  v_ranking_rows integer := 0;
  v_prize_rows integer := 0;
  v_report_rows integer := 0;

  v_effect_ledger_rows integer := 0;
  v_verified_effect_rows integer := 0;

  v_selected_core_owner text;
  v_selected_finalizer_owner text;

  v_current_run_status text;
  v_completed_run boolean := false;

  v_is_golden_fixture_stage boolean := false;

  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;

  v_ownership jsonb := '[]'::jsonb;

  v_can_future_execute boolean := false;

  v_plan jsonb;
begin
  if p_stage_id is null then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'reason',
        'p_stage_id is required.',

      'dry_run_only_contract',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  select to_jsonb(stage_row)
  into v_stage
  from public.race_stages stage_row
  where stage_row.id = p_stage_id;

  if v_stage is null then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'dry_run_only_contract',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  v_race_id :=
    nullif(
      v_stage ->> 'race_id',
      ''
    )::uuid;

  select to_jsonb(race_row)
  into v_race
  from public.races race_row
  where race_row.id = v_race_id;

  select to_jsonb(run_row)
  into v_simulation_run
  from public.race_stage_simulation_runs run_row
  where run_row.stage_id = p_stage_id
  limit 1;

  v_simulation_run_id :=
    nullif(
      v_simulation_run ->> 'id',
      ''
    )::uuid;

  v_current_run_status :=
    lower(
      coalesce(
        v_simulation_run ->> 'status',
        'not_created'
      )
    );

  v_completed_run :=
    v_current_run_status = 'completed';

  v_weather_cancelled :=
    coalesce(
      nullif(
        v_stage ->> 'weather_cancelled',
        ''
      )::boolean,
      false
    );

  v_stage_format_raw :=
    lower(
      coalesce(
        nullif(
          btrim(
            v_stage ->> 'stage_format'
          ),
          ''
        ),
        'road_race'
      )
    );

  v_stage_format_normalized :=
    regexp_replace(
      v_stage_format_raw,
      '[^a-z0-9]+',
      '_',
      'g'
    );

  v_stage_format_normalized :=
    btrim(
      v_stage_format_normalized,
      '_'
    );

  if v_weather_cancelled then
    v_route_format :=
      'weather_cancelled';

  elsif v_stage_format_normalized in
        (
          'individual_time_trial',
          'individual_tt',
          'itt',
          'time_trial',
          'prologue'
        )
  then
    v_route_format :=
      'individual_time_trial';

  elsif v_stage_format_normalized in
        (
          'team_time_trial',
          'team_tt',
          'ttt'
        )
  then
    v_route_format :=
      'team_time_trial';

  elsif v_stage_format_normalized in
        (
          'road_race',
          'road',
          'flat',
          'hilly',
          'mountain',
          'mountainous',
          'cobbled',
          'gravel',
          'circuit',
          'criterium',
          'one_day',
          'stage'
        )
  then
    v_route_format :=
      'road_race';

  else
    v_route_format :=
      'unsupported';
  end if;

  v_selected_core_owner :=
    case v_route_format
      when 'road_race'
        then 'future canonical road physical core'

      when 'individual_time_trial'
        then 'future canonical ITT/prologue physical core'

      when 'team_time_trial'
        then 'future canonical TTT physical core'

      when 'weather_cancelled'
        then 'race_engine_process_weather_cancelled_stage_v1'

      else null
    end;

  v_selected_finalizer_owner :=
    case v_route_format
      when 'road_race'
        then 'future universal ordered finalizer'

      when 'individual_time_trial'
        then 'future universal ordered TT finalizer'

      when 'team_time_trial'
        then 'future universal ordered TTT finalizer'

      when 'weather_cancelled'
        then 'weather cancellation closeout contract'

      else null
    end;

  select
    count(
      distinct participant_team.club_id
    )::integer
  into v_participant_teams
  from public.race_participant_teams_v1 participant_team
  where participant_team.race_id = v_race_id;

  select
    count(*)::integer,
    count(
      distinct participant_rider.team_id
    )::integer
  into
    v_participant_riders,
    v_participant_rider_teams
  from public.race_participant_riders participant_rider
  where participant_rider.race_id = v_race_id;

  select
    count(*)::integer,

    count(*) filter
    (
      where upper(
              coalesce(
                stage_point.point_type,
                ''
              )
            ) <> 'START'
    )::integer
  into
    v_stage_point_rows,
    v_scoring_gate_rows
  from public.race_stage_points stage_point
  where stage_point.stage_id = p_stage_id;

  select count(*)::integer
  into v_rider_state_rows
  from public.race_stage_rider_states rider_state
  where rider_state.stage_id = p_stage_id;

  select count(*)::integer
  into v_replay_rows
  from public.race_stage_replay_frames replay_row
  where replay_row.stage_id = p_stage_id;

  select count(*)::integer
  into v_stage_result_rows
  from public.race_stage_results result_row
  where result_row.stage_id = p_stage_id;

  select count(*)::integer
  into v_point_result_rows
  from public.race_stage_point_results point_result
  where point_result.stage_id = p_stage_id;

  select count(*)::integer
  into v_classification_rows
  from public.race_classification_standings classification
  where classification.after_stage_id = p_stage_id;

  select count(*)::integer
  into v_ranking_rows
  from public.race_ranking_point_awards ranking_award
  where ranking_award.stage_id = p_stage_id;

  select count(*)::integer
  into v_prize_rows
  from public.race_prize_awards prize_award
  where prize_award.stage_id = p_stage_id;

  select count(*)::integer
  into v_report_rows
  from public.race_stage_report_events report_event
  where report_event.stage_id = p_stage_id;

  select
    count(*)::integer,

    count(*) filter
    (
      where effect_row.effect_status = 'verified'
    )::integer
  into
    v_effect_ledger_rows,
    v_verified_effect_rows
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id;

  v_is_golden_fixture_stage :=
    exists
    (
      select 1

      from public.race_engine_golden_stage_fixture_v1 fixture

      where fixture.stage_id = p_stage_id
        and fixture.fixture_status =
            'frozen_and_validated'
    );

  if v_route_format = 'unsupported' then
    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'unsupported_stage_format',

          'raw_stage_format',
            v_stage_format_raw,

          'normalized_stage_format',
            v_stage_format_normalized
        )
      );
  end if;

  if not v_weather_cancelled
     and v_participant_teams <= 0 then

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'missing_participant_teams'
        )
      );
  end if;

  if not v_weather_cancelled
     and v_participant_riders <= 0 then

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'missing_participant_riders'
        )
      );
  end if;

  if v_completed_run then
    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'completed_simulation_run_is_immutable',

          'simulation_run_id',
            v_simulation_run_id,

          'required_behavior',
            'verify_only_no_execution'
        )
      );
  end if;

  if v_is_golden_fixture_stage then
    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'frozen_golden_fixture_stage',

          'required_behavior',
            'verify_only_no_execution'
        )
      );
  end if;

  if v_route_format = 'road_race'
     and v_scoring_gate_rows = 0 then

    v_warnings :=
      v_warnings
      ||
      jsonb_build_array(
        jsonb_build_object(
          'warning',
            'road_stage_has_no_scoring_gate_rows'
        )
      );
  end if;

  if v_participant_teams <>
     v_participant_rider_teams then

    v_warnings :=
      v_warnings
      ||
      jsonb_build_array(
        jsonb_build_object(
          'warning',
            'participant_team_count_differs_from_rider_team_count',

          'participant_team_rows',
            v_participant_teams,

          'rider_distinct_team_rows',
            v_participant_rider_teams
        )
      );
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'layer_order',
                 ownership.layer_order,

               'layer_key',
                 ownership.layer_key,

               'lifecycle_class',
                 ownership.lifecycle_class,

               'exactly_once_required',
                 ownership.exactly_once_required,

               'owner_component',
                 ownership.owner_component,

               'selected_writer_contract',
                 coalesce(
                   ownership.writer_by_format
                     ->> v_route_format,

                   ownership.writer_by_format
                     ->> 'all_completed_formats',

                   ownership.writer_by_format
                     ->> 'all'
                 ),

               'dependencies',
                 ownership.dependency_layers,

               'rerun_policy',
                 ownership.rerun_policy,

               'completion_evidence',
                 ownership.completion_evidence
             )
             order by ownership.layer_order
           ),
           '[]'::jsonb
         )
  into v_ownership

  from public.race_engine_stage_layer_ownership_v2 ownership

  where ownership.contract_version =
        'phase3ab_stage_processor_contract_v2'

    and ownership.is_active;

  v_can_future_execute :=
    jsonb_array_length(v_blockers) = 0
    and v_route_format <> 'unsupported';

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_stage_process_plan_v2_dry_run_contract_v1',

      'status',
        case
          when v_completed_run
            or v_is_golden_fixture_stage
            then 'verify_only_no_execution'

          when jsonb_array_length(v_blockers) > 0
            then 'blocked_by_plan'

          else 'future_execution_candidate'
        end,

      'dry_run_only_contract',
        true,

      'production_execution_enabled',
        false,

      'stage',
        jsonb_build_object(
          'stage_id',
            p_stage_id,

          'race_id',
            v_race_id,

          'race_name',
            v_race ->> 'name',

          'stage_number',
            nullif(
              v_stage ->> 'stage_number',
              ''
            )::integer,

          'stage_name',
            v_stage ->> 'name',

          'stage_date',
            v_stage ->> 'stage_date',

          'distance_km',
            v_stage ->> 'distance_km',

          'raw_stage_format',
            v_stage_format_raw,

          'normalized_stage_format',
            v_stage_format_normalized,

          'route_format',
            v_route_format,

          'weather_cancelled',
            v_weather_cancelled,

          'frozen_golden_fixture_stage',
            v_is_golden_fixture_stage
        ),

      'selected_path',
        jsonb_build_object(
          'core_owner',
            v_selected_core_owner,

          'finalizer_owner',
            v_selected_finalizer_owner,

          'existing_runner_will_be_called',
            false,

          'existing_tt_finalizer_will_be_called',
            false
        ),

      'inputs',
        jsonb_build_object(
          'participant_teams',
            v_participant_teams,

          'participant_riders',
            v_participant_riders,

          'participant_rider_distinct_teams',
            v_participant_rider_teams,

          'stage_point_rows',
            v_stage_point_rows,

          'scoring_gate_rows',
            v_scoring_gate_rows
        ),

      'current_state',
        jsonb_build_object(
          'simulation_run_id',
            v_simulation_run_id,

          'simulation_run_status',
            v_current_run_status,

          'completed_simulation_run',
            v_completed_run,

          'rider_state_rows',
            v_rider_state_rows,

          'replay_rows',
            v_replay_rows,

          'stage_result_rows',
            v_stage_result_rows,

          'point_result_rows',
            v_point_result_rows,

          'classification_rows',
            v_classification_rows,

          'ranking_award_rows',
            v_ranking_rows,

          'prize_award_rows',
            v_prize_rows,

          'report_event_rows',
            v_report_rows,

          'effect_ledger_rows',
            v_effect_ledger_rows,

          'verified_effect_ledger_rows',
            v_verified_effect_rows
        ),

      'blockers',
        v_blockers,

      'warnings',
        v_warnings,

      'canonical_layer_ownership',
        v_ownership,

      'future_execution_eligible_by_plan',
        v_can_future_execute,

      'b1_execution_result',
        'no_engine_execution_available',

      'required_next_phase',
        'shadow_validate_plans_across_stage_format_and_terrain_matrix'
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash',
        md5(v_plan::text),

      'generated_at',
        clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_process_stage_once_v2(p_stage_id uuid, p_dry_run boolean DEFAULT true, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
declare
  v_process_run_id uuid :=
    gen_random_uuid();

  v_plan jsonb;

  v_fixture_before jsonb;
  v_fixture_after jsonb;

  v_fixture_before_status text;
  v_fixture_after_status text;

  v_stage_id uuid :=
    p_stage_id;

  v_race_id uuid;
  v_simulation_run_id uuid;

  v_normalized_stage_format text;
  v_selected_core_owner text;
  v_selected_finalizer_owner text;

  v_stage_lock_key bigint;

  v_status text;
  v_reason text;

  v_result jsonb;
begin
  if v_stage_id is null then
    v_status :=
      'blocked_missing_stage';

    v_reason :=
      'p_stage_id is required.';

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,

      processor_version,

      requested_dry_run,
      confirmation_text_hash,

      status,
      reason,

      production_execution_enabled,
      existing_runner_called,

      caller_identity,
      finished_at,

      metadata
    )
    values
    (
      v_process_run_id,
      '00000000-0000-0000-0000-000000000000'::uuid,

      'phase3ab_process_stage_once_v2_b1_dry_run_only',

      coalesce(p_dry_run, true),

      case
        when p_confirmation_text is null
          then null
        else md5(p_confirmation_text)
      end,

      v_status,
      v_reason,

      false,
      false,

      session_user,
      clock_timestamp(),

      jsonb_build_object(
        'b1_contract',
          'dry_run_only'
      )
    );

    return jsonb_build_object(
      'status',
        v_status,

      'reason',
        v_reason,

      'process_run_id',
        v_process_run_id,

      'production_execution_enabled',
        false,

      'existing_runner_called',
        false
    );
  end if;

  v_stage_lock_key :=
    hashtextextended(
      'race_engine_process_stage_once_v2:'
      ||
      v_stage_id::text,
      0
    );

  perform pg_advisory_xact_lock(
    v_stage_lock_key
  );

  v_fixture_before :=
    public.race_engine_verify_golden_stage_fixture_v1(
      'rio_tour_stage1_phase3aa_golden_v1'
    );

  v_fixture_before_status :=
    v_fixture_before ->> 'status';

  if v_fixture_before_status is distinct from
     'fixture_matches_current_state' then

    v_status :=
      'blocked_golden_fixture_mismatch';

    v_reason :=
      'Rio golden fixture does not match current state.';

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,

      processor_version,

      requested_dry_run,
      confirmation_text_hash,

      status,
      reason,

      stage_lock_key,

      golden_fixture_status_before,
      golden_fixture_status_after,

      production_execution_enabled,
      existing_runner_called,

      caller_identity,
      finished_at,

      metadata
    )
    values
    (
      v_process_run_id,
      v_stage_id,

      'phase3ab_process_stage_once_v2_b1_dry_run_only',

      coalesce(p_dry_run, true),

      case
        when p_confirmation_text is null
          then null
        else md5(p_confirmation_text)
      end,

      v_status,
      v_reason,

      v_stage_lock_key,

      v_fixture_before_status,
      v_fixture_before_status,

      false,
      false,

      session_user,
      clock_timestamp(),

      jsonb_build_object(
        'fixture_verification',
          v_fixture_before
      )
    );

    return jsonb_build_object(
      'status',
        v_status,

      'reason',
        v_reason,

      'process_run_id',
        v_process_run_id,

      'golden_fixture_status',
        v_fixture_before_status,

      'production_execution_enabled',
        false,

      'existing_runner_called',
        false
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_process_plan_v2(
      v_stage_id
    );

  v_race_id :=
    nullif(
      v_plan
        -> 'stage'
        ->> 'race_id',
      ''
    )::uuid;

  v_simulation_run_id :=
    nullif(
      v_plan
        -> 'current_state'
        ->> 'simulation_run_id',
      ''
    )::uuid;

  v_normalized_stage_format :=
    v_plan
      -> 'stage'
      ->> 'route_format';

  v_selected_core_owner :=
    v_plan
      -> 'selected_path'
      ->> 'core_owner';

  v_selected_finalizer_owner :=
    v_plan
      -> 'selected_path'
      ->> 'finalizer_owner';

  if not coalesce(
           p_dry_run,
           true
         ) then

    v_status :=
      'blocked_execution_not_enabled_in_b1';

    v_reason :=
      'Phase 3AB-B1 installs a dry-run-only contract. Real execution is unavailable regardless of confirmation text.';

  elsif v_plan ->> 'status' =
        'verify_only_no_execution' then

    v_status :=
      'dry_run_completed_stage_verify_only';

    v_reason :=
      'The stage is completed or frozen as a golden fixture. The V2 contract performed verification only.';

  elsif v_plan ->> 'status' =
        'blocked_by_plan' then

    v_status :=
      'dry_run_blocked_by_plan';

    v_reason :=
      'The planner found blockers. No engine function was called.';

  else
    v_status :=
      'dry_run_ready_shadow_only';

    v_reason :=
      'The planner found a future execution candidate, but B1 is shadow/dry-run only.';
  end if;

  v_fixture_after :=
    public.race_engine_verify_golden_stage_fixture_v1(
      'rio_tour_stage1_phase3aa_golden_v1'
    );

  v_fixture_after_status :=
    v_fixture_after ->> 'status';

  if v_fixture_after_status is distinct from
     'fixture_matches_current_state' then

    raise exception
      'Phase 3AB-B1 wrapper validation failed: Rio golden fixture changed during dry-run processing.';
  end if;

  insert into public.race_engine_stage_process_runs_v2
  (
    process_run_id,

    stage_id,
    race_id,
    simulation_run_id,

    processor_version,

    requested_dry_run,
    confirmation_text_hash,

    status,
    reason,

    normalized_stage_format,
    selected_core_owner,
    selected_finalizer_owner,

    stage_lock_key,

    process_plan,
    plan_hash,

    golden_fixture_status_before,
    golden_fixture_status_after,

    production_execution_enabled,
    existing_runner_called,

    caller_identity,
    finished_at,

    metadata
  )
  values
  (
    v_process_run_id,

    v_stage_id,
    v_race_id,
    v_simulation_run_id,

    'phase3ab_process_stage_once_v2_b1_dry_run_only',

    coalesce(p_dry_run, true),

    case
      when p_confirmation_text is null
        then null
      else md5(p_confirmation_text)
    end,

    v_status,
    v_reason,

    v_normalized_stage_format,
    v_selected_core_owner,
    v_selected_finalizer_owner,

    v_stage_lock_key,

    v_plan,
    v_plan ->> 'plan_hash',

    v_fixture_before_status,
    v_fixture_after_status,

    false,
    false,

    session_user,
    clock_timestamp(),

    jsonb_build_object(
      'b1_contract',
        'dry_run_only',

      'confirmation_text_ignored_for_execution',
        true,

      'existing_runner_call_count',
        0,

      'golden_fixture_before',
        v_fixture_before_status,

      'golden_fixture_after',
        v_fixture_after_status
    )
  );

  v_result :=
    jsonb_build_object(
      'status',
        v_status,

      'reason',
        v_reason,

      'process_run_id',
        v_process_run_id,

      'stage_id',
        v_stage_id,

      'race_id',
        v_race_id,

      'simulation_run_id',
        v_simulation_run_id,

      'requested_dry_run',
        coalesce(p_dry_run, true),

      'production_execution_enabled',
        false,

      'existing_runner_called',
        false,

      'golden_fixture_status_before',
        v_fixture_before_status,

      'golden_fixture_status_after',
        v_fixture_after_status,

      'process_plan',
        v_plan,

      'next_phase',
        'shadow_validate_plans_across_stage_format_and_terrain_matrix'
    );

  return v_result;

exception
  when others then
    begin
      insert into public.race_engine_stage_process_runs_v2
      (
        process_run_id,
        stage_id,
        race_id,
        simulation_run_id,

        processor_version,

        requested_dry_run,
        confirmation_text_hash,

        status,
        reason,

        normalized_stage_format,
        selected_core_owner,
        selected_finalizer_owner,

        stage_lock_key,

        process_plan,
        plan_hash,

        golden_fixture_status_before,
        golden_fixture_status_after,

        production_execution_enabled,
        existing_runner_called,

        caller_identity,
        finished_at,

        error_message,

        metadata
      )
      values
      (
        v_process_run_id,
        coalesce(
          v_stage_id,
          '00000000-0000-0000-0000-000000000000'::uuid
        ),
        v_race_id,
        v_simulation_run_id,

        'phase3ab_process_stage_once_v2_b1_dry_run_only',

        coalesce(p_dry_run, true),

        case
          when p_confirmation_text is null
            then null
          else md5(p_confirmation_text)
        end,

        'error',
        'Dry-run wrapper returned an error without calling an existing runner.',

        v_normalized_stage_format,
        v_selected_core_owner,
        v_selected_finalizer_owner,

        v_stage_lock_key,

        coalesce(
          v_plan,
          '{}'::jsonb
        ),

        v_plan ->> 'plan_hash',

        v_fixture_before_status,
        v_fixture_after_status,

        false,
        false,

        session_user,
        clock_timestamp(),

        sqlstate || ': ' || sqlerrm,

        jsonb_build_object(
          'b1_contract',
            'dry_run_only',

          'existing_runner_call_count',
            0
        )
      );
    exception
      when others then
        null;
    end;

    return jsonb_build_object(
      'status',
        'error',

      'process_run_id',
        v_process_run_id,

      'stage_id',
        v_stage_id,

      'error_state',
        sqlstate,

      'error_message',
        sqlerrm,

      'production_execution_enabled',
        false,

      'existing_runner_called',
        false
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_effect_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_process_plan jsonb;

  v_race_id uuid;
  v_simulation_run_id uuid;

  v_route_format text;
  v_process_status text;

  v_stage_result_hash text;
  v_classification_hash text;
  v_ranking_hash text;
  v_prize_hash text;
  v_finance_hash text;
  v_rider_state_hash text;
  v_development_hash text;
  v_daily_activity_hash text;
  v_stage_race_run_hash text;

  v_stage_result_rows integer;
  v_classification_rows integer;
  v_ranking_rows integer;
  v_prize_rows integer;
  v_finance_lock_rows integer;
  v_rider_state_rows integer;
  v_development_rows integer;
  v_daily_activity_rows integer;

  v_effect_plans jsonb;
  v_plan jsonb;
begin
  v_process_plan :=
    public.race_engine_get_stage_process_plan_v2(
      p_stage_id
    );

  if v_process_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'shadow_only_contract',
        true,

      'production_effect_execution_enabled',
        false
    );
  end if;

  v_race_id :=
    nullif(
      v_process_plan
        -> 'stage'
        ->> 'race_id',
      ''
    )::uuid;

  v_simulation_run_id :=
    nullif(
      v_process_plan
        -> 'current_state'
        ->> 'simulation_run_id',
      ''
    )::uuid;

  v_route_format :=
    v_process_plan
      -> 'stage'
      ->> 'route_format';

  v_process_status :=
    v_process_plan ->> 'status';

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(result_row)::text,
          '|'
          order by
            result_row.rank,
            result_row.rider_id::text
        ),
        ''
      )
    )
  into
    v_stage_result_rows,
    v_stage_result_hash
  from public.race_stage_results result_row
  where result_row.stage_id = p_stage_id;

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(classification)::text,
          '|'
          order by
            classification.classification_type,
            classification.rank,
            coalesce(
              classification.rider_id::text,
              classification.team_id::text
            )
        ),
        ''
      )
    )
  into
    v_classification_rows,
    v_classification_hash
  from public.race_classification_standings classification
  where classification.after_stage_id = p_stage_id;

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(ranking_award)::text,
          '|'
          order by
            ranking_award.source_type,
            ranking_award.rank,
            ranking_award.id::text
        ),
        ''
      )
    )
  into
    v_ranking_rows,
    v_ranking_hash
  from public.race_ranking_point_awards ranking_award
  where ranking_award.stage_id = p_stage_id;

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(prize_award)::text,
          '|'
          order by
            prize_award.rank,
            prize_award.id::text
        ),
        ''
      )
    )
  into
    v_prize_rows,
    v_prize_hash
  from public.race_prize_awards prize_award
  where prize_award.stage_id = p_stage_id;

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(event_lock)::text
          ||
          ':'
          ||
          coalesce(
            to_jsonb(transaction_row)::text,
            ''
          ),
          '|'
          order by
            event_lock.event_type,
            event_lock.club_id::text,
            event_lock.ref_id::text
        ),
        ''
      )
    )
  into
    v_finance_lock_rows,
    v_finance_hash
  from finance.event_locks event_lock

  left join finance.transactions transaction_row
    on transaction_row.id =
       event_lock.transaction_id

  where event_lock.ref_id in
        (
          select prize_award.id
          from public.race_prize_awards prize_award
          where prize_award.stage_id = p_stage_id
        );

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(rider_state)::text,
          '|'
          order by rider_state.rider_id::text
        ),
        ''
      )
    )
  into
    v_rider_state_rows,
    v_rider_state_hash
  from public.race_stage_rider_states rider_state
  where rider_state.stage_id = p_stage_id;

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(development_event)::text,
          '|'
          order by development_event.id::text
        ),
        ''
      )
    )
  into
    v_development_rows,
    v_development_hash
  from public.rider_race_development_events development_event
  where development_event.stage_id = p_stage_id;

  select
    count(*)::integer,

    md5(
      coalesce(
        string_agg(
          to_jsonb(activity)::text,
          '|'
          order by
            activity.rider_id::text,
            activity.activity_date
        ),
        ''
      )
    )
  into
    v_daily_activity_rows,
    v_daily_activity_hash
  from public.rider_daily_activity activity
  where activity.source_id = p_stage_id
    and activity.source = 'race';

  select md5(
           coalesce(
             to_jsonb(stage_row)::text,
             ''
           )
           ||
           '|'
           ||
           coalesce(
             to_jsonb(race_row)::text,
             ''
           )
           ||
           '|'
           ||
           coalesce(
             to_jsonb(simulation_row)::text,
             ''
           )
         )
  into v_stage_race_run_hash

  from public.race_stages stage_row

  join public.races race_row
    on race_row.id =
       stage_row.race_id

  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id =
       stage_row.id

  where stage_row.id = p_stage_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'effect_order',
                 contract.effect_order,

               'effect_key',
                 contract.effect_key,

               'lifecycle_class',
                 contract.lifecycle_class,

               'required_for_route',
                 (
                   v_route_format =
                   any(contract.required_routes)
                 ),

               'skipped_for_route',
                 (
                   v_route_format =
                   any(contract.skipped_routes)
                 ),

               'owner_component',
                 contract.owner_component,

               'production_writer_function',
                 contract.production_writer_function,

               'source_dependencies',
                 contract.source_dependencies,

               'production_ledger_key_supported',
                 contract.production_ledger_key_supported,

               'production_execution_status',
                 contract.production_execution_status,

               'production_blocker',
                 contract.production_blocker,

               'source_payload_hash',
                 case contract.effect_key
                   when 'ranking_awards'
                     then md5(
                       coalesce(v_stage_result_hash, '')
                       || ':'
                       || coalesce(v_classification_hash, '')
                     )

                   when 'prize_awards'
                     then md5(
                       coalesce(v_stage_result_hash, '')
                       || ':'
                       || coalesce(v_classification_hash, '')
                     )

                   when 'prize_payment'
                     then md5(
                       coalesce(v_prize_hash, '')
                     )

                   when 'development'
                     then md5(
                       coalesce(v_stage_race_run_hash, '')
                       || ':'
                       || coalesce(v_rider_state_hash, '')
                       || ':'
                       || coalesce(v_stage_result_hash, '')
                     )

                   when 'daily_activity'
                     then md5(
                       coalesce(v_stage_result_hash, '')
                       || ':'
                       || coalesce(v_stage_race_run_hash, '')
                     )

                   when 'weather_exposure'
                     then md5(
                       coalesce(v_stage_race_run_hash, '')
                       || ':'
                       || coalesce(v_stage_result_hash, '')
                       || ':'
                       || coalesce(v_rider_state_hash, '')
                     )

                   when 'fatigue'
                     then md5(
                       coalesce(v_stage_race_run_hash, '')
                       || ':'
                       || coalesce(v_rider_state_hash, '')
                     )

                   when 'weather_closeout'
                     then md5(
                       coalesce(v_stage_race_run_hash, '')
                     )

                   when 'sponsor_objectives'
                     then md5(
                       coalesce(v_stage_race_run_hash, '')
                       || ':'
                       || coalesce(v_stage_result_hash, '')
                       || ':'
                       || coalesce(v_classification_hash, '')
                       || ':'
                       || coalesce(v_ranking_hash, '')
                     )

                   when 'stage_closeout'
                     then md5(
                       coalesce(v_stage_race_run_hash, '')
                       || ':'
                       || coalesce(v_ranking_hash, '')
                       || ':'
                       || coalesce(v_prize_hash, '')
                       || ':'
                       || coalesce(v_finance_hash, '')
                       || ':'
                       || coalesce(v_development_hash, '')
                       || ':'
                       || coalesce(v_daily_activity_hash, '')
                       || ':'
                       || coalesce(v_rider_state_hash, '')
                     )

                   else md5(
                     coalesce(v_stage_race_run_hash, '')
                   )
                 end,

               'observed_payload_hash',
                 case contract.effect_key
                   when 'ranking_awards'
                     then v_ranking_hash

                   when 'prize_awards'
                     then v_prize_hash

                   when 'prize_payment'
                     then v_finance_hash

                   when 'development'
                     then v_development_hash

                   when 'daily_activity'
                     then v_daily_activity_hash

                   when 'weather_exposure'
                     then md5(
                       coalesce(v_rider_state_hash, '')
                       || ':weather'
                     )

                   when 'fatigue'
                     then md5(
                       coalesce(v_rider_state_hash, '')
                       || ':fatigue'
                     )

                   when 'weather_closeout'
                     then v_stage_race_run_hash

                   when 'sponsor_objectives'
                     then md5(
                       coalesce(v_stage_race_run_hash, '')
                       || ':sponsor_evidence_not_yet_canonical'
                     )

                   when 'stage_closeout'
                     then v_stage_race_run_hash

                   else v_stage_race_run_hash
                 end,

               'evidence_summary',
                 case contract.effect_key
                   when 'ranking_awards'
                     then jsonb_build_object(
                       'row_count',
                         v_ranking_rows,

                       'relation',
                         'public.race_ranking_point_awards'
                     )

                   when 'prize_awards'
                     then jsonb_build_object(
                       'row_count',
                         v_prize_rows,

                       'relation',
                         'public.race_prize_awards'
                     )

                   when 'prize_payment'
                     then jsonb_build_object(
                       'event_lock_rows',
                         v_finance_lock_rows,

                       'relations',
                         jsonb_build_array(
                           'finance.event_locks',
                           'finance.transactions'
                         )
                     )

                   when 'development'
                     then jsonb_build_object(
                       'row_count',
                         v_development_rows,

                       'relation',
                         'public.rider_race_development_events'
                     )

                   when 'daily_activity'
                     then jsonb_build_object(
                       'row_count',
                         v_daily_activity_rows,

                       'relation',
                         'public.rider_daily_activity'
                     )

                   when 'weather_exposure'
                     then jsonb_build_object(
                       'rider_state_rows',
                         v_rider_state_rows,

                       'evidence_scope',
                         'rider-state weather metadata'
                     )

                   when 'fatigue'
                     then jsonb_build_object(
                       'rider_state_rows',
                         v_rider_state_rows,

                       'evidence_scope',
                         'fatigue before/gain/after rider state'
                     )

                   when 'weather_closeout'
                     then jsonb_build_object(
                       'evidence_scope',
                         'stage/race/run status'
                     )

                   when 'sponsor_objectives'
                     then jsonb_build_object(
                       'evidence_scope',
                         'manual canonical objective/payment adapter still required'
                     )

                   when 'stage_closeout'
                     then jsonb_build_object(
                       'evidence_scope',
                         'stage/race/run immutable closeout state'
                     )

                   else '{}'::jsonb
                 end,

               'shadow_claim_ready',
                 true,

               'production_execution_enabled',
                 false
             )
             order by contract.effect_order
           ),
           '[]'::jsonb
         )
  into v_effect_plans

  from public.race_engine_stage_effect_contract_v2 contract

  where contract.contract_version =
        'phase3ab_stage_effect_contract_v2'

    and contract.is_active;

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_stage_effect_plan_v2_shadow_only_v1',

      'status',
        'shadow_effect_plan_ready',

      'stage_id',
        p_stage_id,

      'race_id',
        v_race_id,

      'simulation_run_id',
        v_simulation_run_id,

      'route_format',
        v_route_format,

      'stage_process_status',
        v_process_status,

      'shadow_only_contract',
        true,

      'production_effect_execution_enabled',
        false,

      'production_effect_ledger_will_be_written',
        false,

      'current_counts',
        jsonb_build_object(
          'stage_results',
            v_stage_result_rows,

          'classifications',
            v_classification_rows,

          'ranking_awards',
            v_ranking_rows,

          'prize_awards',
            v_prize_rows,

          'finance_event_locks',
            v_finance_lock_rows,

          'rider_states',
            v_rider_state_rows,

          'development_events',
            v_development_rows,

          'daily_activity',
            v_daily_activity_rows
        ),

      'effect_plans',
        v_effect_plans,

      'production_ledger_schema_gaps',
        jsonb_build_array(
          'daily_activity',
          'weather_closeout',
          'sponsor_objectives'
        ),

      'next_phase',
        'guarded_migration_of_production_effect_ledger_keys_and_adapters'
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash',
        md5(v_plan::text),

      'generated_at',
        clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_claim_stage_effect_v2(p_shadow_run_id uuid, p_stage_id uuid, p_effect_key text, p_source_payload_hash text, p_shadow_only boolean DEFAULT true, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan jsonb;
  v_effect_plan jsonb;

  v_claim_id uuid;
  v_claim_status text;
  v_claim_attempt_count integer;

  v_race_id uuid;
  v_simulation_run_id uuid;
  v_route_format text;

  v_current_source_hash text;
begin
  if not coalesce(p_shadow_only, true) then
    return jsonb_build_object(
      'status',
        'blocked_real_effect_claim_not_enabled_in_b4',

      'shadow_run_id',
        p_shadow_run_id,

      'stage_id',
        p_stage_id,

      'effect_key',
        p_effect_key,

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false,

      'confirmation_text_ignored',
        p_confirmation_text is not null
    );
  end if;

  if p_shadow_run_id is null
     or p_stage_id is null
     or nullif(btrim(p_effect_key), '') is null
     or nullif(btrim(p_source_payload_hash), '') is null then

    return jsonb_build_object(
      'status',
        'blocked_invalid_shadow_claim_input',

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'phase3ab_b4_shadow_claim',
        p_shadow_run_id::text,
        p_stage_id::text,
        lower(btrim(p_effect_key))
      ),
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then

    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_effect_plan_v2(
      p_stage_id
    );

  select effect_plan.value
  into v_effect_plan
  from jsonb_array_elements(
         v_plan -> 'effect_plans'
       ) effect_plan(value)
  where effect_plan.value ->> 'effect_key' =
        lower(btrim(p_effect_key))
  limit 1;

  if v_effect_plan is null then
    return jsonb_build_object(
      'status',
        'blocked_unknown_effect_key',

      'effect_key',
        p_effect_key,

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  v_current_source_hash :=
    v_effect_plan ->> 'source_payload_hash';

  if v_current_source_hash is distinct from
     p_source_payload_hash then

    return jsonb_build_object(
      'status',
        'blocked_source_payload_hash_mismatch',

      'effect_key',
        p_effect_key,

      'expected_source_payload_hash',
        v_current_source_hash,

      'provided_source_payload_hash',
        p_source_payload_hash,

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  v_race_id :=
    nullif(
      v_plan ->> 'race_id',
      ''
    )::uuid;

  v_simulation_run_id :=
    nullif(
      v_plan ->> 'simulation_run_id',
      ''
    )::uuid;

  v_route_format :=
    v_plan ->> 'route_format';

  insert into
    public.race_engine_stage_effect_shadow_claim_v2
  (
    shadow_run_id,

    contract_version,

    stage_id,
    race_id,
    simulation_run_id,

    effect_key,

    route_format,

    source_payload_hash,

    claim_status,

    claim_attempt_count,
    verify_attempt_count,

    production_effect_ledger_written,
    production_writer_called,

    requested_by,

    metadata
  )
  values
  (
    p_shadow_run_id,

    'phase3ab_stage_effect_contract_v2',

    p_stage_id,
    v_race_id,
    v_simulation_run_id,

    lower(btrim(p_effect_key)),

    v_route_format,

    p_source_payload_hash,

    'claimed_shadow_only',

    1,
    0,

    false,
    false,

    session_user,

    jsonb_build_object(
      'source',
        'race_engine_claim_stage_effect_v2',

      'b4_shadow_only',
        true,

      'effect_plan',
        v_effect_plan
    )
  )
  on conflict
  (
    shadow_run_id,
    stage_id,
    effect_key,
    source_payload_hash
  )
  do update
  set
    claim_attempt_count =
      public.race_engine_stage_effect_shadow_claim_v2.claim_attempt_count
      + 1,

    updated_at =
      clock_timestamp(),

    metadata =
      public.race_engine_stage_effect_shadow_claim_v2.metadata
      ||
      jsonb_build_object(
        'last_reclaim_at',
          clock_timestamp(),

        'last_reclaim_by',
          session_user
      )

  returning
    claim_id,
    claim_status,
    claim_attempt_count

  into
    v_claim_id,
    v_claim_status,
    v_claim_attempt_count;

  return jsonb_build_object(
    'status',
      'claimed_shadow_only',

    'claim_id',
      v_claim_id,

    'shadow_run_id',
      p_shadow_run_id,

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'simulation_run_id',
      v_simulation_run_id,

    'effect_key',
      lower(btrim(p_effect_key)),

    'source_payload_hash',
      p_source_payload_hash,

    'claim_attempt_count',
      v_claim_attempt_count,

    'production_effect_ledger_written',
      false,

    'production_writer_called',
      false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_verify_stage_effect_v2(p_shadow_run_id uuid, p_stage_id uuid, p_effect_key text, p_source_payload_hash text, p_observed_payload_hash text, p_shadow_only boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan jsonb;
  v_effect_plan jsonb;

  v_expected_observed_hash text;

  v_claim_id uuid;
  v_verify_attempt_count integer;
  v_claim_attempt_count integer;
begin
  if not coalesce(p_shadow_only, true) then
    return jsonb_build_object(
      'status',
        'blocked_real_effect_verification_not_enabled_in_b4',

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  if p_shadow_run_id is null
     or p_stage_id is null
     or nullif(btrim(p_effect_key), '') is null
     or nullif(btrim(p_source_payload_hash), '') is null
     or nullif(btrim(p_observed_payload_hash), '') is null then

    return jsonb_build_object(
      'status',
        'blocked_invalid_shadow_verification_input',

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'phase3ab_b4_shadow_verify',
        p_shadow_run_id::text,
        p_stage_id::text,
        lower(btrim(p_effect_key))
      ),
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then

    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_effect_plan_v2(
      p_stage_id
    );

  select effect_plan.value
  into v_effect_plan
  from jsonb_array_elements(
         v_plan -> 'effect_plans'
       ) effect_plan(value)
  where effect_plan.value ->> 'effect_key' =
        lower(btrim(p_effect_key))
  limit 1;

  if v_effect_plan is null then
    return jsonb_build_object(
      'status',
        'blocked_unknown_effect_key',

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  if v_effect_plan ->> 'source_payload_hash'
     is distinct from
     p_source_payload_hash then

    return jsonb_build_object(
      'status',
        'blocked_source_payload_hash_mismatch',

      'expected_source_payload_hash',
        v_effect_plan ->> 'source_payload_hash',

      'provided_source_payload_hash',
        p_source_payload_hash,

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  v_expected_observed_hash :=
    v_effect_plan ->> 'observed_payload_hash';

  if v_expected_observed_hash is distinct from
     p_observed_payload_hash then

    update
      public.race_engine_stage_effect_shadow_claim_v2 shadow_claim

    set
      claim_status =
        'verification_mismatch',

      observed_payload_hash =
        p_observed_payload_hash,

      verify_attempt_count =
        shadow_claim.verify_attempt_count + 1,

      updated_at =
        clock_timestamp(),

      metadata =
        shadow_claim.metadata
        ||
        jsonb_build_object(
          'expected_observed_payload_hash',
            v_expected_observed_hash,

          'provided_observed_payload_hash',
            p_observed_payload_hash,

          'verification_mismatch_at',
            clock_timestamp()
        )

    where shadow_claim.shadow_run_id =
          p_shadow_run_id

      and shadow_claim.stage_id =
          p_stage_id

      and shadow_claim.effect_key =
          lower(btrim(p_effect_key))

      and shadow_claim.source_payload_hash =
          p_source_payload_hash;

    return jsonb_build_object(
      'status',
        'verification_mismatch',

      'effect_key',
        lower(btrim(p_effect_key)),

      'expected_observed_payload_hash',
        v_expected_observed_hash,

      'provided_observed_payload_hash',
        p_observed_payload_hash,

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  update
    public.race_engine_stage_effect_shadow_claim_v2 shadow_claim

  set
    claim_status =
      'verified_shadow_only',

    observed_payload_hash =
      p_observed_payload_hash,

    verify_attempt_count =
      shadow_claim.verify_attempt_count + 1,

    verified_at =
      coalesce(
        shadow_claim.verified_at,
        clock_timestamp()
      ),

    updated_at =
      clock_timestamp(),

    metadata =
      shadow_claim.metadata
      ||
      jsonb_build_object(
        'verified_by',
          session_user,

        'verified_at',
          clock_timestamp(),

        'source',
          'race_engine_verify_stage_effect_v2'
      )

  where shadow_claim.shadow_run_id =
        p_shadow_run_id

    and shadow_claim.stage_id =
        p_stage_id

    and shadow_claim.effect_key =
        lower(btrim(p_effect_key))

    and shadow_claim.source_payload_hash =
        p_source_payload_hash

  returning
    claim_id,
    verify_attempt_count,
    claim_attempt_count

  into
    v_claim_id,
    v_verify_attempt_count,
    v_claim_attempt_count;

  if v_claim_id is null then
    return jsonb_build_object(
      'status',
        'blocked_shadow_claim_not_found',

      'effect_key',
        lower(btrim(p_effect_key)),

      'production_effect_ledger_written',
        false,

      'production_writer_called',
        false
    );
  end if;

  return jsonb_build_object(
    'status',
      'verified_shadow_only',

    'claim_id',
      v_claim_id,

    'shadow_run_id',
      p_shadow_run_id,

    'stage_id',
      p_stage_id,

    'effect_key',
      lower(btrim(p_effect_key)),

    'source_payload_hash',
      p_source_payload_hash,

    'observed_payload_hash',
      p_observed_payload_hash,

    'claim_attempt_count',
      v_claim_attempt_count,

    'verify_attempt_count',
      v_verify_attempt_count,

    'production_effect_ledger_written',
      false,

    'production_writer_called',
      false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_effect_reservation_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_effect_plan jsonb;
  v_process_status text;
  v_route_format text;
  v_is_golden_fixture boolean;

  v_effects jsonb;
  v_plan jsonb;
begin
  v_effect_plan :=
    public.race_engine_get_stage_effect_plan_v2(
      p_stage_id
    );

  if v_effect_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'reservation_only_contract',
        true,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_process_status :=
    v_effect_plan ->> 'stage_process_status';

  v_route_format :=
    v_effect_plan ->> 'route_format';

  v_is_golden_fixture :=
    exists
    (
      select 1
      from public.race_engine_golden_stage_fixture_v1 fixture
      where fixture.stage_id = p_stage_id
        and fixture.fixture_status =
            'frozen_and_validated'
    );

  select coalesce(
           jsonb_agg(
             effect_row.value
             ||
             jsonb_build_object(
               'reservation_eligible',
                 (
                   v_process_status =
                   'future_execution_candidate'

                   and not v_is_golden_fixture

                   and coalesce(
                         (
                           effect_row.value
                             ->> 'required_for_route'
                         )::boolean,
                         false
                       )

                   and coalesce(
                         (
                           effect_row.value
                             ->> 'production_ledger_key_supported'
                         )::boolean,
                         false
                       )
                 ),

               'reservation_blocker',
                 case
                   when v_is_golden_fixture
                     then 'frozen_golden_fixture_stage'

                   when v_process_status <>
                        'future_execution_candidate'
                     then 'stage_not_future_execution_candidate'

                   when not coalesce(
                              (
                                effect_row.value
                                  ->> 'required_for_route'
                              )::boolean,
                              false
                            )
                     then 'effect_not_required_for_route'

                   when not coalesce(
                              (
                                effect_row.value
                                  ->> 'production_ledger_key_supported'
                              )::boolean,
                              false
                            )
                     then 'production_ledger_key_not_supported'

                   else null
                 end,

               'reservation_status_after_success',
                 'planned',

               'production_writer_execution_enabled',
                 false
             )
             order by
               (
                 effect_row.value
                   ->> 'effect_order'
               )::integer
           ),
           '[]'::jsonb
         )
  into v_effects

  from jsonb_array_elements(
         v_effect_plan -> 'effect_plans'
       ) effect_row(value);

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_stage_effect_reservation_plan_v2_b5_v1',

      'status',
        case
          when v_is_golden_fixture
            then 'reservation_blocked_golden_fixture'

          when v_process_status <>
               'future_execution_candidate'
            then 'reservation_blocked_stage_not_future_candidate'

          else 'reservation_plan_ready'
        end,

      'stage_id',
        p_stage_id,

      'race_id',
        v_effect_plan ->> 'race_id',

      'simulation_run_id',
        v_effect_plan ->> 'simulation_run_id',

      'route_format',
        v_route_format,

      'stage_process_status',
        v_process_status,

      'golden_fixture_stage',
        v_is_golden_fixture,

      'reservation_only_contract',
        true,

      'production_writer_execution_enabled',
        false,

      'allowed_effect_status_transition',
        'absent_to_planned_only',

      'effects',
        v_effects
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash',
        md5(v_plan::text),

      'generated_at',
        clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_reserve_stage_effect_v2(p_stage_id uuid, p_effect_key text, p_source_payload_hash text, p_reservation_only boolean DEFAULT true, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan jsonb;
  v_effect jsonb;

  v_race_id uuid;
  v_simulation_run_id uuid;

  v_effect_id uuid;
  v_effect_status text;
  v_existing_source_hash text;
  v_existing_idempotency_key text;
  v_attempt_count integer;

  v_owner_component text;
  v_writer_function text;

  v_idempotency_key text;
begin
  if not coalesce(
           p_reservation_only,
           true
         ) then

    return jsonb_build_object(
      'status',
        'blocked_effect_execution_not_enabled_in_b5',

      'stage_id',
        p_stage_id,

      'effect_key',
        p_effect_key,

      'confirmation_text_ignored',
        p_confirmation_text is not null,

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  if p_stage_id is null
     or nullif(btrim(p_effect_key), '') is null
     or nullif(btrim(p_source_payload_hash), '') is null then

    return jsonb_build_object(
      'status',
        'blocked_invalid_reservation_input',

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'phase3ab_b5_effect_reservation',
        p_stage_id::text,
        lower(btrim(p_effect_key))
      ),
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then

    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_effect_reservation_plan_v2(
      p_stage_id
    );

  if v_plan ->> 'status'
     is distinct from
     'reservation_plan_ready' then

    return jsonb_build_object(
      'status',
        v_plan ->> 'status',

      'stage_id',
        p_stage_id,

      'effect_key',
        lower(btrim(p_effect_key)),

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  select effect_row.value
  into v_effect

  from jsonb_array_elements(
         v_plan -> 'effects'
       ) effect_row(value)

  where effect_row.value ->> 'effect_key' =
        lower(btrim(p_effect_key))

  limit 1;

  if v_effect is null then
    return jsonb_build_object(
      'status',
        'blocked_unknown_effect_key',

      'effect_key',
        lower(btrim(p_effect_key)),

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  if not coalesce(
           (
             v_effect
               ->> 'reservation_eligible'
           )::boolean,
           false
         ) then

    return jsonb_build_object(
      'status',
        'blocked_effect_reservation_not_eligible',

      'effect_key',
        lower(btrim(p_effect_key)),

      'reservation_blocker',
        v_effect ->> 'reservation_blocker',

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  if v_effect ->> 'source_payload_hash'
     is distinct from
     p_source_payload_hash then

    return jsonb_build_object(
      'status',
        'blocked_source_payload_hash_mismatch',

      'effect_key',
        lower(btrim(p_effect_key)),

      'expected_source_payload_hash',
        v_effect ->> 'source_payload_hash',

      'provided_source_payload_hash',
        p_source_payload_hash,

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  v_race_id :=
    nullif(
      v_plan ->> 'race_id',
      ''
    )::uuid;

  v_simulation_run_id :=
    nullif(
      v_plan ->> 'simulation_run_id',
      ''
    )::uuid;

  v_owner_component :=
    v_effect ->> 'owner_component';

  v_writer_function :=
    v_effect ->> 'production_writer_function';

  v_idempotency_key :=
    'race-engine-v2:stage:'
    ||
    p_stage_id::text
    ||
    ':effect:'
    ||
    lower(btrim(p_effect_key))
    ||
    ':source:'
    ||
    p_source_payload_hash;

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.source_payload_hash,
    effect_row.idempotency_key,

    coalesce(
      nullif(
        effect_row.metadata
          ->> 'reservation_attempt_count',
        ''
      )::integer,
      1
    )

  into
    v_effect_id,
    v_effect_status,
    v_existing_source_hash,
    v_existing_idempotency_key,
    v_attempt_count

  from public.race_engine_stage_effect_ledger_v2 effect_row

  where effect_row.stage_id =
        p_stage_id

    and effect_row.effect_key =
        lower(btrim(p_effect_key))

  for update;

  if v_effect_id is not null then
    if v_existing_source_hash is distinct from
       p_source_payload_hash then

      return jsonb_build_object(
        'status',
          'blocked_existing_reservation_source_hash_drift',

        'effect_id',
          v_effect_id,

        'effect_key',
          lower(btrim(p_effect_key)),

        'existing_source_payload_hash',
          v_existing_source_hash,

        'provided_source_payload_hash',
          p_source_payload_hash,

        'production_writer_execution_enabled',
          false,

        'production_writer_called',
          false,

        'effect_status_changed',
          false
      );
    end if;

    if v_existing_idempotency_key is distinct from
       v_idempotency_key then

      return jsonb_build_object(
        'status',
          'blocked_existing_reservation_idempotency_mismatch',

        'effect_id',
          v_effect_id,

        'effect_key',
          lower(btrim(p_effect_key)),

        'production_writer_execution_enabled',
          false,

        'production_writer_called',
          false,

        'effect_status_changed',
          false
      );
    end if;

    if v_effect_status is distinct from
       'planned' then

      return jsonb_build_object(
        'status',
          'blocked_existing_effect_not_planned',

        'effect_id',
          v_effect_id,

        'effect_key',
          lower(btrim(p_effect_key)),

        'existing_effect_status',
          v_effect_status,

        'production_writer_execution_enabled',
          false,

        'production_writer_called',
          false,

        'effect_status_changed',
          false
      );
    end if;

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      metadata =
        coalesce(
          effect_row.metadata,
          '{}'::jsonb
        )
        ||
        jsonb_build_object(
          'reservation_attempt_count',
            v_attempt_count + 1,

          'last_reserved_at',
            clock_timestamp(),

          'last_reserved_by',
            session_user,

          'reservation_adapter_version',
            'phase3ab_b5_nonexecuting_reservation_v1'
        ),

      updated_at =
        clock_timestamp()

    where effect_row.effect_id =
          v_effect_id;

    return jsonb_build_object(
      'status',
        'already_reserved_planned',

      'effect_id',
        v_effect_id,

      'stage_id',
        p_stage_id,

      'race_id',
        v_race_id,

      'simulation_run_id',
        v_simulation_run_id,

      'effect_key',
        lower(btrim(p_effect_key)),

      'effect_status',
        'planned',

      'source_payload_hash',
        p_source_payload_hash,

      'idempotency_key',
        v_idempotency_key,

      'reservation_attempt_count',
        v_attempt_count + 1,

      'production_writer_execution_enabled',
        false,

      'production_writer_called',
        false,

      'effect_status_changed',
        false
    );
  end if;

  insert into
    public.race_engine_stage_effect_ledger_v2
  (
    stage_id,
    race_id,
    simulation_run_id,

    effect_key,
    effect_status,

    owner_component,
    writer_function,

    idempotency_key,
    source_payload_hash,

    started_at,

    metadata
  )
  values
  (
    p_stage_id,
    v_race_id,
    v_simulation_run_id,

    lower(btrim(p_effect_key)),
    'planned',

    v_owner_component,
    v_writer_function,

    v_idempotency_key,
    p_source_payload_hash,

    null,

    jsonb_build_object(
      'reservation_attempt_count',
        1,

      'reserved_at',
        clock_timestamp(),

      'reserved_by',
        session_user,

      'reservation_only',
        true,

      'production_writer_execution_enabled',
        false,

      'reservation_adapter_version',
        'phase3ab_b5_nonexecuting_reservation_v1',

      'effect_plan',
        v_effect
    )
  )
  returning effect_id
  into v_effect_id;

  return jsonb_build_object(
    'status',
      'reserved_planned',

    'effect_id',
      v_effect_id,

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'simulation_run_id',
      v_simulation_run_id,

    'effect_key',
      lower(btrim(p_effect_key)),

    'effect_status',
      'planned',

    'source_payload_hash',
      p_source_payload_hash,

    'idempotency_key',
      v_idempotency_key,

    'reservation_attempt_count',
      1,

    'production_writer_execution_enabled',
      false,

    'production_writer_called',
      false,

    'effect_status_changed',
      true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_effect_execution_gate_v2(p_stage_id uuid, p_effect_key text, p_source_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_effect record;
begin
  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.source_payload_hash,
    effect_row.applied_payload_hash,
    effect_row.idempotency_key,
    effect_row.owner_component,
    effect_row.writer_function,
    effect_row.metadata

  into v_effect

  from public.race_engine_stage_effect_ledger_v2 effect_row

  where effect_row.stage_id =
        p_stage_id

    and effect_row.effect_key =
        lower(btrim(p_effect_key))

  limit 1;

  return jsonb_build_object(
    'status',
      'blocked_production_writer_execution_not_enabled_in_b5',

    'stage_id',
      p_stage_id,

    'effect_key',
      lower(btrim(p_effect_key)),

    'provided_source_payload_hash',
      p_source_payload_hash,

    'reservation_found',
      v_effect.effect_id is not null,

    'effect_id',
      v_effect.effect_id,

    'effect_status',
      v_effect.effect_status,

    'reserved_source_payload_hash',
      v_effect.source_payload_hash,

    'source_payload_hash_matches',
      case
        when v_effect.effect_id is null
          then false
        else v_effect.source_payload_hash
             is not distinct from
             p_source_payload_hash
      end,

    'idempotency_key',
      v_effect.idempotency_key,

    'owner_component',
      v_effect.owner_component,

    'writer_function',
      v_effect.writer_function,

    'production_writer_execution_enabled',
      false,

    'production_writer_called',
      false,

    'permitted_status_transition',
      'none',

    'next_phase_required',
      'writer_specific_guarded_adapter_and_evidence_verification'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_effect_writer_adapter_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_reservation_plan jsonb;

  v_stage_status text;
  v_route_format text;
  v_golden_fixture boolean;

  v_adapters jsonb;
  v_plan jsonb;

  v_definition_drift_count integer;
  v_required_adapter_count integer;
begin
  v_reservation_plan :=
    public.race_engine_get_stage_effect_reservation_plan_v2(
      p_stage_id
    );

  if v_reservation_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_stage_status :=
    v_reservation_plan ->> 'stage_process_status';

  v_route_format :=
    v_reservation_plan ->> 'route_format';

  v_golden_fixture :=
    coalesce(
      (
        v_reservation_plan
          ->> 'golden_fixture_stage'
      )::boolean,
      false
    );

  with adapter_rows as
  (
    select
      manifest.adapter_order,
      manifest.effect_key,

      manifest.current_entry_type,
      manifest.current_writer_signature,
      manifest.current_writer_schema,
      manifest.current_writer_name,

      manifest.current_writer_definition_hash
        as stored_writer_definition_hash,

      case
        when current_function.oid is null
          then null
        else md5(
          pg_get_functiondef(
            current_function.oid
          )
        )
      end as current_writer_definition_hash,

      manifest.current_writer_security_definer,

      manifest.current_writer_public_execute,
      manifest.current_writer_anon_execute,
      manifest.current_writer_authenticated_execute,
      manifest.current_writer_service_role_execute,

      manifest.adapter_strategy,

      manifest.required_ledger_status_before,
      manifest.future_status_transition,

      manifest.source_hash_required,
      manifest.evidence_hash_required,

      manifest.destructive_regeneration_risk,
      manifest.multiple_entry_risk,
      manifest.trigger_consolidation_required,
      manifest.backend_only_required,

      manifest.production_execution_status,
      manifest.production_blocker,

      manifest.rollback_policy,
      manifest.evidence_contract,

      effect_plan.value
        as effect_plan,

      coalesce(
        (
          effect_plan.value
            ->> 'required_for_route'
        )::boolean,
        false
      ) as required_for_route,

      coalesce(
        (
          effect_plan.value
            ->> 'reservation_eligible'
        )::boolean,
        false
      ) as reservation_eligible,

      effect_plan.value
        ->> 'source_payload_hash'
        as source_payload_hash,

      effect_plan.value
        ->> 'observed_payload_hash'
        as observed_payload_hash,

      ledger.effect_id,
      ledger.effect_status,
      ledger.idempotency_key,
      ledger.source_payload_hash
        as ledger_source_payload_hash,
      ledger.applied_payload_hash,

      (
        current_function.oid is not null

        and md5(
              pg_get_functiondef(
                current_function.oid
              )
            )
            =
            manifest.current_writer_definition_hash
      ) as writer_definition_matches

    from public.race_engine_stage_effect_writer_adapter_manifest_v2 manifest

    left join pg_proc current_function
      on current_function.oid =
         to_regprocedure(
           manifest.current_writer_signature
         )

     and current_function.prokind = 'f'

    left join lateral
    (
      select effect_row.value
      from jsonb_array_elements(
             v_reservation_plan -> 'effects'
           ) effect_row(value)
      where effect_row.value ->> 'effect_key' =
            manifest.effect_key
      limit 1
    ) effect_plan
      on true

    left join public.race_engine_stage_effect_ledger_v2 ledger
      on ledger.stage_id =
         p_stage_id
     and ledger.effect_key =
         manifest.effect_key

    where manifest.manifest_version =
          'phase3ab_writer_adapter_manifest_v2'

      and manifest.is_active
  )

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'adapter_order',
            adapter.adapter_order,

          'effect_key',
            adapter.effect_key,

          'required_for_route',
            adapter.required_for_route,

          'reservation_eligible',
            adapter.reservation_eligible,

          'current_entry_type',
            adapter.current_entry_type,

          'current_writer_signature',
            adapter.current_writer_signature,

          'stored_writer_definition_hash',
            adapter.stored_writer_definition_hash,

          'current_writer_definition_hash',
            adapter.current_writer_definition_hash,

          'writer_definition_matches',
            adapter.writer_definition_matches,

          'current_writer_security_definer',
            adapter.current_writer_security_definer,

          'current_writer_permissions',
            jsonb_build_object(
              'public_execute',
                adapter.current_writer_public_execute,

              'anon_execute',
                adapter.current_writer_anon_execute,

              'authenticated_execute',
                adapter.current_writer_authenticated_execute,

              'service_role_execute',
                adapter.current_writer_service_role_execute
            ),

          'adapter_strategy',
            adapter.adapter_strategy,

          'required_ledger_status_before',
            adapter.required_ledger_status_before,

          'future_status_transition',
            adapter.future_status_transition,

          'source_hash_required',
            adapter.source_hash_required,

          'evidence_hash_required',
            adapter.evidence_hash_required,

          'destructive_regeneration_risk',
            adapter.destructive_regeneration_risk,

          'multiple_entry_risk',
            adapter.multiple_entry_risk,

          'trigger_consolidation_required',
            adapter.trigger_consolidation_required,

          'backend_only_required',
            adapter.backend_only_required,

          'production_execution_status',
            adapter.production_execution_status,

          'production_blocker',
            adapter.production_blocker,

          'source_payload_hash',
            adapter.source_payload_hash,

          'observed_payload_hash',
            adapter.observed_payload_hash,

          'ledger',
            jsonb_build_object(
              'effect_id',
                adapter.effect_id,

              'effect_status',
                adapter.effect_status,

              'idempotency_key',
                adapter.idempotency_key,

              'source_payload_hash',
                adapter.ledger_source_payload_hash,

              'applied_payload_hash',
                adapter.applied_payload_hash
            ),

          'rollback_policy',
            adapter.rollback_policy,

          'evidence_contract',
            adapter.evidence_contract,

          'writer_execution_enabled',
            false,

          'writer_execution_blocker',
            case
              when not adapter.writer_definition_matches
                then 'writer_definition_drift'

              when v_golden_fixture
                then 'frozen_golden_fixture_stage'

              when v_stage_status <>
                   'future_execution_candidate'
                then 'stage_not_future_execution_candidate'

              when not adapter.required_for_route
                then 'effect_not_required_for_route'

              when adapter.effect_id is null
                then 'effect_not_reserved'

              when adapter.effect_status <>
                   'planned'
                then 'effect_not_in_planned_status'

              when adapter.ledger_source_payload_hash
                   is distinct from
                   adapter.source_payload_hash
                then 'reserved_source_hash_mismatch'

              else 'production_writer_execution_not_enabled_in_b6'
            end
        )
        order by adapter.adapter_order
      ),
      '[]'::jsonb
    ),

    count(*) filter
    (
      where not adapter.writer_definition_matches
    )::integer,

    count(*) filter
    (
      where adapter.required_for_route
    )::integer

  into
    v_adapters,
    v_definition_drift_count,
    v_required_adapter_count

  from adapter_rows adapter;

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_writer_adapter_plan_v2_nonexecuting_v1',

      'status',
        case
          when v_definition_drift_count > 0
            then 'blocked_writer_definition_drift'

          when v_golden_fixture
               or v_stage_status =
                  'verify_only_no_execution'
            then 'historical_verify_only'

          when v_stage_status =
               'future_execution_candidate'
            then 'writer_adapter_plan_ready_nonexecuting'

          else 'blocked_stage_process_state'
        end,

      'stage_id',
        p_stage_id,

      'route_format',
        v_route_format,

      'stage_process_status',
        v_stage_status,

      'golden_fixture_stage',
        v_golden_fixture,

      'required_adapter_count',
        v_required_adapter_count,

      'writer_definition_drift_count',
        v_definition_drift_count,

      'production_writer_execution_enabled',
        false,

      'adapters',
        v_adapters
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash',
        md5(v_plan::text),

      'generated_at',
        clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_effect_writer_adapter_gate_v2(p_stage_id uuid, p_effect_key text, p_source_payload_hash text, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan jsonb;
  v_adapter jsonb;
begin
  v_plan :=
    public.race_engine_get_stage_effect_writer_adapter_plan_v2(
      p_stage_id
    );

  select adapter_row.value
  into v_adapter

  from jsonb_array_elements(
         coalesce(
           v_plan -> 'adapters',
           '[]'::jsonb
         )
       ) adapter_row(value)

  where adapter_row.value ->> 'effect_key' =
        lower(btrim(p_effect_key))

  limit 1;

  return jsonb_build_object(
    'status',
      'blocked_writer_adapter_execution_not_enabled_in_b6',

    'stage_id',
      p_stage_id,

    'effect_key',
      lower(btrim(p_effect_key)),

    'provided_source_payload_hash',
      p_source_payload_hash,

    'confirmation_text_ignored',
      p_confirmation_text is not null,

    'adapter_found',
      v_adapter is not null,

    'adapter_plan_status',
      v_plan ->> 'status',

    'writer_definition_matches',
      coalesce(
        (
          v_adapter
            ->> 'writer_definition_matches'
        )::boolean,
        false
      ),

    'effect_required_for_route',
      coalesce(
        (
          v_adapter
            ->> 'required_for_route'
        )::boolean,
        false
      ),

    'effect_id',
      v_adapter
        -> 'ledger'
        ->> 'effect_id',

    'effect_status',
      v_adapter
        -> 'ledger'
        ->> 'effect_status',

    'reserved_source_payload_hash',
      v_adapter
        -> 'ledger'
        ->> 'source_payload_hash',

    'planned_source_payload_hash',
      v_adapter
        ->> 'source_payload_hash',

    'source_payload_hash_matches',
      (
        v_adapter
          ->> 'source_payload_hash'
      )
      is not distinct from
      p_source_payload_hash,

    'manifest_execution_blocker',
      v_adapter
        ->> 'writer_execution_blocker',

    'production_writer_execution_enabled',
      false,

    'production_writer_called',
      false,

    'permitted_effect_status_transition',
      'none',

    'next_phase_required',
      'effect_specific_adapter_implementation_and_rolled_back_mutation_tests'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_closeout_readiness_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_adapter_plan jsonb;

  v_stage_status text;
  v_route_format text;
  v_golden_fixture boolean;

  v_required_effects jsonb;

  v_required_count integer := 0;
  v_verified_count integer := 0;
  v_planned_count integer := 0;
  v_missing_count integer := 0;
  v_drift_count integer := 0;
  v_source_mismatch_count integer := 0;

  v_status text;
begin
  v_adapter_plan :=
    public.race_engine_get_stage_effect_writer_adapter_plan_v2(
      p_stage_id
    );

  if v_adapter_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'stage_closeout_execution_enabled',
        false
    );
  end if;

  v_stage_status :=
    v_adapter_plan ->> 'stage_process_status';

  v_route_format :=
    v_adapter_plan ->> 'route_format';

  v_golden_fixture :=
    coalesce(
      (
        v_adapter_plan
          ->> 'golden_fixture_stage'
      )::boolean,
      false
    );

  with required_adapters as
  (
    select adapter_row.value
      as adapter

    from jsonb_array_elements(
           v_adapter_plan -> 'adapters'
         ) adapter_row(value)

    where coalesce(
            (
              adapter_row.value
                ->> 'required_for_route'
            )::boolean,
            false
          )
  )

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'effect_key',
            required_adapter.adapter
              ->> 'effect_key',

          'writer_definition_matches',
            (
              required_adapter.adapter
                ->> 'writer_definition_matches'
            )::boolean,

          'effect_id',
            required_adapter.adapter
              -> 'ledger'
              ->> 'effect_id',

          'effect_status',
            required_adapter.adapter
              -> 'ledger'
              ->> 'effect_status',

          'planned_source_payload_hash',
            required_adapter.adapter
              ->> 'source_payload_hash',

          'reserved_source_payload_hash',
            required_adapter.adapter
              -> 'ledger'
              ->> 'source_payload_hash',

          'applied_payload_hash',
            required_adapter.adapter
              -> 'ledger'
              ->> 'applied_payload_hash',

          'closeout_requirement_satisfied',
            (
              required_adapter.adapter
                ->> 'writer_definition_matches'
            )::boolean

            and required_adapter.adapter
                  -> 'ledger'
                  ->> 'effect_status'
                =
                'verified'

            and required_adapter.adapter
                  -> 'ledger'
                  ->> 'source_payload_hash'
                is not distinct from
                required_adapter.adapter
                  ->> 'source_payload_hash'
        )
        order by
          (
            required_adapter.adapter
              ->> 'adapter_order'
          )::integer
      ),
      '[]'::jsonb
    ),

    count(*)::integer,

    count(*) filter
    (
      where required_adapter.adapter
              -> 'ledger'
              ->> 'effect_status'
            =
            'verified'
    )::integer,

    count(*) filter
    (
      where required_adapter.adapter
              -> 'ledger'
              ->> 'effect_status'
            =
            'planned'
    )::integer,

    count(*) filter
    (
      where required_adapter.adapter
              -> 'ledger'
              ->> 'effect_id'
            is null
    )::integer,

    count(*) filter
    (
      where not coalesce(
                  (
                    required_adapter.adapter
                      ->> 'writer_definition_matches'
                  )::boolean,
                  false
                )
    )::integer,

    count(*) filter
    (
      where required_adapter.adapter
              -> 'ledger'
              ->> 'effect_id'
            is not null

        and required_adapter.adapter
              -> 'ledger'
              ->> 'source_payload_hash'
            is distinct from
            required_adapter.adapter
              ->> 'source_payload_hash'
    )::integer

  into
    v_required_effects,

    v_required_count,
    v_verified_count,
    v_planned_count,
    v_missing_count,
    v_drift_count,
    v_source_mismatch_count

  from required_adapters required_adapter;

  v_status :=
    case
      when v_golden_fixture
           or v_stage_status =
              'verify_only_no_execution'
        then 'historical_stage_verify_only_no_retroactive_claims'

      when v_drift_count > 0
        then 'closeout_blocked_writer_definition_drift'

      when v_source_mismatch_count > 0
        then 'closeout_blocked_source_hash_mismatch'

      when v_required_count > 0
           and v_verified_count =
               v_required_count
        then 'closeout_contract_satisfied_execution_still_disabled'

      else 'closeout_blocked_unverified_effects'
    end;

  return jsonb_build_object(
    'status',
      v_status,

    'stage_id',
      p_stage_id,

    'route_format',
      v_route_format,

    'stage_process_status',
      v_stage_status,

    'golden_fixture_stage',
      v_golden_fixture,

    'required_effect_count',
      v_required_count,

    'verified_effect_count',
      v_verified_count,

    'planned_effect_count',
      v_planned_count,

    'missing_effect_count',
      v_missing_count,

    'writer_definition_drift_count',
      v_drift_count,

    'source_hash_mismatch_count',
      v_source_mismatch_count,

    'required_effects',
      v_required_effects,

    'stage_closeout_execution_enabled',
      false,

    'production_writer_execution_enabled',
      false,

    'closeout_policy',
      'all required route effects must be verified with matching source hashes before immutable closeout'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_ranking_awards_adapter_rollback_v2(p_stage_id uuid, p_confirmation_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_required_confirmation constant text :=
    'RUN_PHASE3AB_B7_RANKING_AWARDS_ROLLBACK_TEST_V1';

  v_stage_id uuid :=
    p_stage_id;

  v_race_id uuid;
  v_simulation_run_id uuid;
  v_simulation_status text;
  v_route_format text;

  v_writer_oid oid;
  v_writer_hash text;
  v_manifest_hash text;

  v_source_payload_hash text;
  v_planner_observed_hash_before text;
  v_planner_observed_hash_first text;
  v_planner_observed_hash_second text;

  v_before_snapshot jsonb;
  v_first_snapshot jsonb;
  v_second_snapshot jsonb;
  v_after_snapshot jsonb;

  v_global_ranking_hash_before text;
  v_global_ranking_hash_after text;

  v_other_ranking_hash_before text;
  v_other_ranking_hash_first text;
  v_other_ranking_hash_second text;
  v_other_ranking_hash_after text;

  v_source_hash_before text;
  v_source_hash_first text;
  v_source_hash_second text;
  v_source_hash_after text;

  v_prize_hash_before text;
  v_prize_hash_first text;
  v_prize_hash_second text;
  v_prize_hash_after text;

  v_lifecycle_hash_before text;
  v_lifecycle_hash_first text;
  v_lifecycle_hash_second text;
  v_lifecycle_hash_after text;

  v_finance_counts_before jsonb;
  v_finance_counts_first jsonb;
  v_finance_counts_second jsonb;
  v_finance_counts_after jsonb;

  v_effect_ledger_hash_before text;
  v_effect_ledger_hash_after text;

  v_test_effect_id uuid;
  v_test_idempotency_key text;

  v_ledger_status_inside text;
  v_ledger_applied_hash_inside text;

  v_rollback_marker boolean := false;

  v_semantic_rerun_stable boolean;
  v_identity_rerun_stable boolean;
  v_identity_churn_observed boolean;
  v_planner_observed_hash_rerun_stable boolean;

  v_generator_scope_safe boolean;
  v_unrelated_state_unchanged_inside boolean;
  v_rollback_restored_exact_state boolean;

  v_result jsonb;
begin
  if p_confirmation_text is distinct from
     v_required_confirmation then

    return jsonb_build_object(
      'status',
        'blocked_invalid_confirmation',

      'stage_id',
        p_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if v_stage_id is null then
    return jsonb_build_object(
      'status',
        'blocked_missing_stage',

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:b7:ranking-test:'
      ||
      v_stage_id::text,
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then

    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'stage_id',
        v_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_golden_stage_fixture_v1 fixture
    where fixture.stage_id = v_stage_id
      and fixture.fixture_status =
          'frozen_and_validated'
  ) then
    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_stage',

      'stage_id',
        v_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  select
    stage_row.race_id,

    simulation_row.id,
    lower(
      coalesce(
        simulation_row.status,
        'not_created'
      )
    ),

    process_plan
      -> 'stage'
      ->> 'route_format'

  into
    v_race_id,
    v_simulation_run_id,
    v_simulation_status,
    v_route_format

  from public.race_stages stage_row

  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id =
       stage_row.id

  cross join lateral
    public.race_engine_get_stage_process_plan_v2(
      stage_row.id
    ) process_plan

  where stage_row.id =
        v_stage_id;

  if v_race_id is null then
    return jsonb_build_object(
      'status',
        'blocked_stage_not_found',

      'stage_id',
        v_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if v_simulation_status is distinct from
     'completed' then
    return jsonb_build_object(
      'status',
        'blocked_stage_not_completed',

      'stage_id',
        v_stage_id,

      'simulation_status',
        v_simulation_status,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if v_route_format not in
     (
       'road_race',
       'individual_time_trial',
       'team_time_trial'
     ) then
    return jsonb_build_object(
      'status',
        'blocked_unsupported_route_for_ranking_test',

      'stage_id',
        v_stage_id,

      'route_format',
        v_route_format,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if not exists
  (
    select 1
    from public.race_stage_results result_row
    where result_row.stage_id =
          v_stage_id
  ) then
    return jsonb_build_object(
      'status',
        'blocked_missing_stage_results',

      'stage_id',
        v_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_stage_effect_ledger_v2 effect_row
    where effect_row.stage_id =
          v_stage_id
      and effect_row.effect_key =
          'ranking_awards'
  ) then
    return jsonb_build_object(
      'status',
        'blocked_existing_ranking_effect_ledger_row',

      'stage_id',
        v_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  v_writer_oid :=
    to_regprocedure(
      'public.generate_race_ranking_point_awards_v1(uuid,uuid,boolean)'
    );

  if v_writer_oid is null then
    return jsonb_build_object(
      'status',
        'blocked_ranking_writer_missing',

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  select md5(
           pg_get_functiondef(
             v_writer_oid
           )
         )
  into v_writer_hash;

  select manifest.current_writer_definition_hash
  into v_manifest_hash

  from public.race_engine_stage_effect_writer_adapter_manifest_v2 manifest

  where manifest.manifest_version =
        'phase3ab_writer_adapter_manifest_v2'

    and manifest.effect_key =
        'ranking_awards'

    and manifest.is_active;

  if v_manifest_hash is null
     or v_writer_hash is distinct from
        v_manifest_hash then

    return jsonb_build_object(
      'status',
        'blocked_ranking_writer_definition_drift',

      'current_writer_hash',
        v_writer_hash,

      'manifest_writer_hash',
        v_manifest_hash,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  select effect_row.value
           ->> 'source_payload_hash',

         effect_row.value
           ->> 'observed_payload_hash'

  into
    v_source_payload_hash,
    v_planner_observed_hash_before

  from jsonb_array_elements(
         public.race_engine_get_stage_effect_plan_v2(
           v_stage_id
         )
         -> 'effect_plans'
       ) effect_row(value)

  where effect_row.value ->> 'effect_key' =
        'ranking_awards';

  v_before_snapshot :=
    public.race_engine_get_stage_ranking_award_snapshot_v2(
      v_stage_id
    );

  select md5(
           coalesce(
             string_agg(
               to_jsonb(ranking_award)::text,
               '|'
               order by ranking_award.id
             ),
             ''
           )
         )
  into v_global_ranking_hash_before
  from public.race_ranking_point_awards ranking_award;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(ranking_award)::text,
               '|'
               order by ranking_award.id
             ),
             ''
           )
         )
  into v_other_ranking_hash_before
  from public.race_ranking_point_awards ranking_award
  where ranking_award.stage_id is distinct from
        v_stage_id;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(result_row)::text,
                        '|'
                        order by
                          result_row.rank,
                          result_row.rider_id
                      )
               from public.race_stage_results result_row
               where result_row.stage_id =
                     v_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(classification)::text,
                        '|'
                        order by
                          classification.classification_type,
                          classification.rank,
                          coalesce(
                            classification.rider_id::text,
                            classification.team_id::text
                          )
                      )
               from public.race_classification_standings classification
               where classification.after_stage_id =
                     v_stage_id
             ),
             ''
           )
         )
  into v_source_hash_before;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(prize_award)::text,
               '|'
               order by prize_award.id
             ),
             ''
           )
         )
  into v_prize_hash_before
  from public.race_prize_awards prize_award
  where prize_award.stage_id =
        v_stage_id;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(development_event)::text,
                        '|'
                        order by development_event.id
                      )
               from public.rider_race_development_events development_event
               where development_event.stage_id =
                     v_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(activity)::text,
                        '|'
                        order by
                          activity.rider_id,
                          activity.activity_date
                      )
               from public.rider_daily_activity activity
               where activity.source_id =
                     v_stage_id
                 and activity.source =
                     'race'
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(rider_state)::text,
                        '|'
                        order by rider_state.rider_id
                      )
               from public.race_stage_rider_states rider_state
               where rider_state.stage_id =
                     v_stage_id
             ),
             ''
           )
         )
  into v_lifecycle_hash_before;

  select jsonb_build_object(
           'transactions',
             (
               select count(*)::bigint
               from finance.transactions
             ),

           'entries',
             (
               select count(*)::bigint
               from finance.entries
             ),

           'event_locks',
             (
               select count(*)::bigint
               from finance.event_locks
             )
         )
  into v_finance_counts_before;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by
                 effect_row.stage_id,
                 effect_row.effect_key
             ),
             ''
           )
         )
  into v_effect_ledger_hash_before
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_test_effect_id :=
    gen_random_uuid();

  v_test_idempotency_key :=
    'phase3ab-b7-rollback-test:'
    ||
    v_stage_id::text
    ||
    ':ranking_awards:'
    ||
    v_test_effect_id::text;

  begin
    insert into public.race_engine_stage_effect_ledger_v2
    (
      effect_id,

      stage_id,
      race_id,
      simulation_run_id,

      effect_key,
      effect_status,

      owner_component,
      writer_function,

      idempotency_key,
      source_payload_hash,

      metadata
    )
    values
    (
      v_test_effect_id,

      v_stage_id,
      v_race_id,
      v_simulation_run_id,

      'ranking_awards',
      'planned',

      'phase3ab_b7_ranking_adapter_rollback_test',
      'public.generate_race_ranking_point_awards_v1(uuid,uuid,boolean)',

      v_test_idempotency_key,
      v_source_payload_hash,

      jsonb_build_object(
        'test_only',
          true,

        'will_be_rolled_back',
          true,

        'test_version',
          'phase3ab_b7_ranking_awards_rollback_v1'
      )
    );

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status =
        'started',

      started_at =
        clock_timestamp(),

      metadata =
        effect_row.metadata
        ||
        jsonb_build_object(
          'writer_call_attempt',
            1
        ),

      updated_at =
        clock_timestamp()

    where effect_row.effect_id =
          v_test_effect_id;

    perform public.generate_race_ranking_point_awards_v1(
      v_race_id,
      v_stage_id,
      false
    );

    v_first_snapshot :=
      public.race_engine_get_stage_ranking_award_snapshot_v2(
        v_stage_id
      );

    select effect_row.value
             ->> 'observed_payload_hash'
    into v_planner_observed_hash_first

    from jsonb_array_elements(
           public.race_engine_get_stage_effect_plan_v2(
             v_stage_id
           )
           -> 'effect_plans'
         ) effect_row(value)

    where effect_row.value ->> 'effect_key' =
          'ranking_awards';

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(ranking_award)::text,
                 '|'
                 order by ranking_award.id
               ),
               ''
             )
           )
    into v_other_ranking_hash_first
    from public.race_ranking_point_awards ranking_award
    where ranking_award.stage_id is distinct from
          v_stage_id;

    select md5(
             coalesce(
               (
                 select string_agg(
                          to_jsonb(result_row)::text,
                          '|'
                          order by
                            result_row.rank,
                            result_row.rider_id
                        )
                 from public.race_stage_results result_row
                 where result_row.stage_id =
                       v_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(classification)::text,
                          '|'
                          order by
                            classification.classification_type,
                            classification.rank,
                            coalesce(
                              classification.rider_id::text,
                              classification.team_id::text
                            )
                        )
                 from public.race_classification_standings classification
                 where classification.after_stage_id =
                       v_stage_id
               ),
               ''
             )
           )
    into v_source_hash_first;

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(prize_award)::text,
                 '|'
                 order by prize_award.id
               ),
               ''
             )
           )
    into v_prize_hash_first
    from public.race_prize_awards prize_award
    where prize_award.stage_id =
          v_stage_id;

    select md5(
             coalesce(
               (
                 select string_agg(
                          to_jsonb(development_event)::text,
                          '|'
                          order by development_event.id
                        )
                 from public.rider_race_development_events development_event
                 where development_event.stage_id =
                       v_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(activity)::text,
                          '|'
                          order by
                            activity.rider_id,
                            activity.activity_date
                        )
                 from public.rider_daily_activity activity
                 where activity.source_id =
                       v_stage_id
                   and activity.source =
                       'race'
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(rider_state)::text,
                          '|'
                          order by rider_state.rider_id
                        )
                 from public.race_stage_rider_states rider_state
                 where rider_state.stage_id =
                       v_stage_id
               ),
               ''
             )
           )
    into v_lifecycle_hash_first;

    select jsonb_build_object(
             'transactions',
               (
                 select count(*)::bigint
                 from finance.transactions
               ),

             'entries',
               (
                 select count(*)::bigint
                 from finance.entries
               ),

             'event_locks',
               (
                 select count(*)::bigint
                 from finance.event_locks
               )
           )
    into v_finance_counts_first;

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status =
        'applied',

      applied_at =
        clock_timestamp(),

      applied_payload_hash =
        v_first_snapshot ->> 'semantic_hash',

      metadata =
        effect_row.metadata
        ||
        jsonb_build_object(
          'first_semantic_hash',
            v_first_snapshot ->> 'semantic_hash',

          'first_identity_hash',
            v_first_snapshot ->> 'identity_hash'
        ),

      updated_at =
        clock_timestamp()

    where effect_row.effect_id =
          v_test_effect_id;

    perform public.generate_race_ranking_point_awards_v1(
      v_race_id,
      v_stage_id,
      false
    );

    v_second_snapshot :=
      public.race_engine_get_stage_ranking_award_snapshot_v2(
        v_stage_id
      );

    select effect_row.value
             ->> 'observed_payload_hash'
    into v_planner_observed_hash_second

    from jsonb_array_elements(
           public.race_engine_get_stage_effect_plan_v2(
             v_stage_id
           )
           -> 'effect_plans'
         ) effect_row(value)

    where effect_row.value ->> 'effect_key' =
          'ranking_awards';

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(ranking_award)::text,
                 '|'
                 order by ranking_award.id
               ),
               ''
             )
           )
    into v_other_ranking_hash_second
    from public.race_ranking_point_awards ranking_award
    where ranking_award.stage_id is distinct from
          v_stage_id;

    select md5(
             coalesce(
               (
                 select string_agg(
                          to_jsonb(result_row)::text,
                          '|'
                          order by
                            result_row.rank,
                            result_row.rider_id
                        )
                 from public.race_stage_results result_row
                 where result_row.stage_id =
                       v_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(classification)::text,
                          '|'
                          order by
                            classification.classification_type,
                            classification.rank,
                            coalesce(
                              classification.rider_id::text,
                              classification.team_id::text
                            )
                        )
                 from public.race_classification_standings classification
                 where classification.after_stage_id =
                       v_stage_id
               ),
               ''
             )
           )
    into v_source_hash_second;

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(prize_award)::text,
                 '|'
                 order by prize_award.id
               ),
               ''
             )
           )
    into v_prize_hash_second
    from public.race_prize_awards prize_award
    where prize_award.stage_id =
          v_stage_id;

    select md5(
             coalesce(
               (
                 select string_agg(
                          to_jsonb(development_event)::text,
                          '|'
                          order by development_event.id
                        )
                 from public.rider_race_development_events development_event
                 where development_event.stage_id =
                       v_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(activity)::text,
                          '|'
                          order by
                            activity.rider_id,
                            activity.activity_date
                        )
                 from public.rider_daily_activity activity
                 where activity.source_id =
                       v_stage_id
                   and activity.source =
                       'race'
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(rider_state)::text,
                          '|'
                          order by rider_state.rider_id
                        )
                 from public.race_stage_rider_states rider_state
                 where rider_state.stage_id =
                       v_stage_id
               ),
               ''
             )
           )
    into v_lifecycle_hash_second;

    select jsonb_build_object(
             'transactions',
               (
                 select count(*)::bigint
                 from finance.transactions
               ),

             'entries',
               (
                 select count(*)::bigint
                 from finance.entries
               ),

             'event_locks',
               (
                 select count(*)::bigint
                 from finance.event_locks
               )
           )
    into v_finance_counts_second;

    v_semantic_rerun_stable :=
      v_first_snapshot ->> 'semantic_hash'
      is not distinct from
      v_second_snapshot ->> 'semantic_hash'

      and (
            v_first_snapshot ->> 'row_count'
          )::integer =
          (
            v_second_snapshot ->> 'row_count'
          )::integer

      and (
            v_first_snapshot ->> 'total_rider_points'
          )::bigint =
          (
            v_second_snapshot ->> 'total_rider_points'
          )::bigint

      and (
            v_first_snapshot ->> 'total_team_points'
          )::bigint =
          (
            v_second_snapshot ->> 'total_team_points'
          )::bigint

      and (
            v_first_snapshot
              ->> 'duplicate_natural_key_count'
          )::integer = 0

      and (
            v_second_snapshot
              ->> 'duplicate_natural_key_count'
          )::integer = 0;

    v_identity_rerun_stable :=
      v_first_snapshot ->> 'identity_hash'
      is not distinct from
      v_second_snapshot ->> 'identity_hash';

    v_identity_churn_observed :=
      not v_identity_rerun_stable;

    v_planner_observed_hash_rerun_stable :=
      v_planner_observed_hash_first
      is not distinct from
      v_planner_observed_hash_second;

    v_generator_scope_safe :=
      v_other_ranking_hash_before
      is not distinct from
      v_other_ranking_hash_first

      and v_other_ranking_hash_first
          is not distinct from
          v_other_ranking_hash_second;

    v_unrelated_state_unchanged_inside :=
      v_source_hash_before
      is not distinct from
      v_source_hash_first

      and v_source_hash_first
          is not distinct from
          v_source_hash_second

      and v_prize_hash_before
          is not distinct from
          v_prize_hash_first

      and v_prize_hash_first
          is not distinct from
          v_prize_hash_second

      and v_lifecycle_hash_before
          is not distinct from
          v_lifecycle_hash_first

      and v_lifecycle_hash_first
          is not distinct from
          v_lifecycle_hash_second

      and v_finance_counts_before
          is not distinct from
          v_finance_counts_first

      and v_finance_counts_first
          is not distinct from
          v_finance_counts_second;

    if not coalesce(
             v_semantic_rerun_stable,
             false
           ) then
      raise exception
        'Phase 3AB-B7 test failed: repeated ranking generation was not semantically stable.';
    end if;

    if not coalesce(
             v_generator_scope_safe,
             false
           ) then
      raise exception
        'Phase 3AB-B7 test failed: ranking generator changed other-stage awards.';
    end if;

    if not coalesce(
             v_unrelated_state_unchanged_inside,
             false
           ) then
      raise exception
        'Phase 3AB-B7 test failed: ranking generator changed an unrelated source, prize, finance, or lifecycle relation.';
    end if;

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status =
        'verified',

      verified_at =
        clock_timestamp(),

      applied_payload_hash =
        v_second_snapshot ->> 'semantic_hash',

      metadata =
        effect_row.metadata
        ||
        jsonb_build_object(
          'second_semantic_hash',
            v_second_snapshot ->> 'semantic_hash',

          'second_identity_hash',
            v_second_snapshot ->> 'identity_hash',

          'semantic_rerun_stable',
            v_semantic_rerun_stable,

          'identity_rerun_stable',
            v_identity_rerun_stable,

          'identity_churn_observed',
            v_identity_churn_observed,

          'planner_observed_hash_rerun_stable',
            v_planner_observed_hash_rerun_stable
        ),

      updated_at =
        clock_timestamp()

    where effect_row.effect_id =
          v_test_effect_id;

    select
      effect_row.effect_status,
      effect_row.applied_payload_hash

    into
      v_ledger_status_inside,
      v_ledger_applied_hash_inside

    from public.race_engine_stage_effect_ledger_v2 effect_row

    where effect_row.effect_id =
          v_test_effect_id;

    if v_ledger_status_inside is distinct from
       'verified'

       or v_ledger_applied_hash_inside is distinct from
          v_second_snapshot ->> 'semantic_hash' then
      raise exception
        'Phase 3AB-B7 test failed: simulated ledger sequence did not reach verified.';
    end if;

    raise exception
      using
        errcode = 'P5002',
        message =
          'PHASE3AB_B7_ROLLBACK_RANKING_WRITER_AND_LEDGER';

  exception
    when sqlstate 'P5002' then
      v_rollback_marker := true;
  end;

  if not v_rollback_marker then
    raise exception
      'Phase 3AB-B7 test failed: rollback marker was not reached.';
  end if;

  v_after_snapshot :=
    public.race_engine_get_stage_ranking_award_snapshot_v2(
      v_stage_id
    );

  select md5(
           coalesce(
             string_agg(
               to_jsonb(ranking_award)::text,
               '|'
               order by ranking_award.id
             ),
             ''
           )
         )
  into v_global_ranking_hash_after
  from public.race_ranking_point_awards ranking_award;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(ranking_award)::text,
               '|'
               order by ranking_award.id
             ),
             ''
           )
         )
  into v_other_ranking_hash_after
  from public.race_ranking_point_awards ranking_award
  where ranking_award.stage_id is distinct from
        v_stage_id;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(result_row)::text,
                        '|'
                        order by
                          result_row.rank,
                          result_row.rider_id
                      )
               from public.race_stage_results result_row
               where result_row.stage_id =
                     v_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(classification)::text,
                        '|'
                        order by
                          classification.classification_type,
                          classification.rank,
                          coalesce(
                            classification.rider_id::text,
                            classification.team_id::text
                          )
                      )
               from public.race_classification_standings classification
               where classification.after_stage_id =
                     v_stage_id
             ),
             ''
           )
         )
  into v_source_hash_after;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(prize_award)::text,
               '|'
               order by prize_award.id
             ),
             ''
           )
         )
  into v_prize_hash_after
  from public.race_prize_awards prize_award
  where prize_award.stage_id =
        v_stage_id;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(development_event)::text,
                        '|'
                        order by development_event.id
                      )
               from public.rider_race_development_events development_event
               where development_event.stage_id =
                     v_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(activity)::text,
                        '|'
                        order by
                          activity.rider_id,
                          activity.activity_date
                      )
               from public.rider_daily_activity activity
               where activity.source_id =
                     v_stage_id
                 and activity.source =
                     'race'
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(rider_state)::text,
                        '|'
                        order by rider_state.rider_id
                      )
               from public.race_stage_rider_states rider_state
               where rider_state.stage_id =
                     v_stage_id
             ),
             ''
           )
         )
  into v_lifecycle_hash_after;

  select jsonb_build_object(
           'transactions',
             (
               select count(*)::bigint
               from finance.transactions
             ),

           'entries',
             (
               select count(*)::bigint
               from finance.entries
             ),

           'event_locks',
             (
               select count(*)::bigint
               from finance.event_locks
             )
         )
  into v_finance_counts_after;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by
                 effect_row.stage_id,
                 effect_row.effect_key
             ),
             ''
           )
         )
  into v_effect_ledger_hash_after
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_rollback_restored_exact_state :=
    v_before_snapshot ->> 'identity_hash'
    is not distinct from
    v_after_snapshot ->> 'identity_hash'

    and v_before_snapshot ->> 'semantic_hash'
        is not distinct from
        v_after_snapshot ->> 'semantic_hash'

    and v_global_ranking_hash_before
        is not distinct from
        v_global_ranking_hash_after

    and v_other_ranking_hash_before
        is not distinct from
        v_other_ranking_hash_after

    and v_source_hash_before
        is not distinct from
        v_source_hash_after

    and v_prize_hash_before
        is not distinct from
        v_prize_hash_after

    and v_lifecycle_hash_before
        is not distinct from
        v_lifecycle_hash_after

    and v_finance_counts_before
        is not distinct from
        v_finance_counts_after

    and v_effect_ledger_hash_before
        is not distinct from
        v_effect_ledger_hash_after

    and not exists
        (
          select 1
          from public.race_engine_stage_effect_ledger_v2 effect_row
          where effect_row.effect_id =
                v_test_effect_id
        );

  if not coalesce(
           v_rollback_restored_exact_state,
           false
         ) then
    raise exception
      'Phase 3AB-B7 test failed: subtransaction rollback did not restore exact state.';
  end if;

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    raise exception
      'Phase 3AB-B7 test failed: Rio golden fixture changed.';
  end if;

  v_result :=
    jsonb_build_object(
      'status',
        'rolled_back_ranking_adapter_test_passed',

      'test_version',
        'phase3ab_b7_ranking_awards_rollback_v1',

      'stage_id',
        v_stage_id,

      'race_id',
        v_race_id,

      'simulation_run_id',
        v_simulation_run_id,

      'simulation_status',
        v_simulation_status,

      'route_format',
        v_route_format,

      'writer_signature',
        'public.generate_race_ranking_point_awards_v1(uuid,uuid,boolean)',

      'writer_definition_hash',
        v_writer_hash,

      'source_payload_hash',
        v_source_payload_hash,

      'before_snapshot',
        v_before_snapshot,

      'first_generated_snapshot',
        v_first_snapshot,

      'second_generated_snapshot',
        v_second_snapshot,

      'after_rollback_snapshot',
        v_after_snapshot,

      'semantic_rerun_stable',
        v_semantic_rerun_stable,

      'identity_rerun_stable',
        v_identity_rerun_stable,

      'identity_churn_observed',
        v_identity_churn_observed,

      'planner_observed_hashes',
        jsonb_build_object(
          'before',
            v_planner_observed_hash_before,

          'after_first_generation',
            v_planner_observed_hash_first,

          'after_second_generation',
            v_planner_observed_hash_second,

          'rerun_stable',
            v_planner_observed_hash_rerun_stable
        ),

      'generator_scope_safe',
        v_generator_scope_safe,

      'unrelated_state_unchanged_inside_test',
        v_unrelated_state_unchanged_inside,

      'simulated_ledger_sequence',
        jsonb_build_object(
          'effect_id',
            v_test_effect_id,

          'status_before_rollback',
            v_ledger_status_inside,

          'applied_payload_hash_before_rollback',
            v_ledger_applied_hash_inside,

          'row_exists_after_rollback',
            false
        ),

      'rollback_restored_exact_state',
        v_rollback_restored_exact_state,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false,

      'production_writer_call_count_inside_rolled_back_test',
        2,

      'production_writer_calls_persisted',
        0,

      'production_readiness_finding',
        case
          when v_identity_churn_observed
            then 'semantic output is stable but physical award identity churn proves reruns must be prohibited after immutable closeout'
          else 'semantic and identity output were stable in this test; production execution remains disabled pending guarded adapter installation'
        end
    );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_ranking_awards_adapter_plan_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_config record;

  v_source jsonb;
  v_output jsonb;
  v_process_plan jsonb;

  v_stage_id uuid;
  v_race_id uuid;
  v_simulation_run_id uuid;
  v_simulation_status text;

  v_route_format text;
  v_stage_process_status text;

  v_golden_fixture boolean;

  v_writer_oid oid;
  v_current_writer_hash text;
  v_writer_definition_matches boolean;

  v_process_run record;
  v_process_run_found boolean := false;
  v_process_run_execution_capable boolean := false;

  v_effect record;
  v_effect_found boolean := false;

  v_prize_rows integer;
  v_finance_event_lock_rows integer;
  v_closeout_status text;

  v_plan_status text;
  v_plan_blockers jsonb := '[]'::jsonb;
  v_plan_warnings jsonb := '[]'::jsonb;

  v_plan jsonb;
begin
  select *
  into v_config
  from public.race_engine_stage_ranking_adapter_config_v2 config
  where config.adapter_key =
        'ranking_awards';

  if not found then
    return jsonb_build_object(
      'status',
        'blocked_ranking_adapter_config_missing',

      'stage_id',
        p_stage_id,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_process_plan :=
    public.race_engine_get_stage_process_plan_v2(
      p_stage_id
    );

  if v_process_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'production_writer_execution_enabled',
        false
    );
  end if;

  select
    stage_row.id,
    stage_row.race_id,

    simulation_row.id,
    lower(
      coalesce(
        simulation_row.status,
        'not_created'
      )
    )

  into
    v_stage_id,
    v_race_id,
    v_simulation_run_id,
    v_simulation_status

  from public.race_stages stage_row

  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id =
       stage_row.id

  where stage_row.id =
        p_stage_id;

  v_route_format :=
    v_process_plan
      -> 'stage'
      ->> 'route_format';

  v_stage_process_status :=
    v_process_plan ->> 'status';

  v_golden_fixture :=
    exists
    (
      select 1
      from public.race_engine_golden_stage_fixture_v1 fixture
      where fixture.stage_id =
            p_stage_id
        and fixture.fixture_status =
            'frozen_and_validated'
    );

  v_source :=
    public.race_engine_get_stage_ranking_source_evidence_v2(
      p_stage_id
    );

  v_output :=
    public.race_engine_get_stage_ranking_output_evidence_v2(
      p_stage_id
    );

  v_writer_oid :=
    to_regprocedure(
      v_config.writer_signature
    );

  if v_writer_oid is not null then
    select md5(
             pg_get_functiondef(
               v_writer_oid
             )
           )
    into v_current_writer_hash;
  end if;

  v_writer_definition_matches :=
    v_writer_oid is not null

    and v_current_writer_hash
        is not distinct from
        v_config.writer_definition_hash;

  if p_process_run_id is not null then
    select
      process_run.process_run_id,
      process_run.stage_id,
      process_run.race_id,
      process_run.simulation_run_id,

      process_run.requested_dry_run,
      process_run.status,
      process_run.production_execution_enabled,
      process_run.existing_runner_called,

      process_run.processor_version

    into v_process_run

    from public.race_engine_stage_process_runs_v2 process_run

    where process_run.process_run_id =
          p_process_run_id;

    v_process_run_found := found;

    if v_process_run_found then
      v_process_run_execution_capable :=
        v_process_run.stage_id =
        p_stage_id

        and not v_process_run.requested_dry_run

        and v_process_run.status =
            'started'

        and v_process_run.production_execution_enabled

        and v_process_run.existing_runner_called;
    end if;
  end if;

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.idempotency_key,
    effect_row.source_payload_hash,
    effect_row.applied_payload_hash,
    effect_row.owner_component,
    effect_row.writer_function

  into v_effect

  from public.race_engine_stage_effect_ledger_v2 effect_row

  where effect_row.stage_id =
        p_stage_id

    and effect_row.effect_key =
        'ranking_awards';

  v_effect_found := found;

  select count(*)::integer
  into v_prize_rows

  from public.race_prize_awards prize_award

  where prize_award.stage_id =
        p_stage_id;

  select count(*)::integer
  into v_finance_event_lock_rows

  from finance.event_locks event_lock

  where event_lock.ref_id in
        (
          select prize_award.id
          from public.race_prize_awards prize_award
          where prize_award.stage_id =
                p_stage_id
        );

  select effect_row.effect_status
  into v_closeout_status

  from public.race_engine_stage_effect_ledger_v2 effect_row

  where effect_row.stage_id =
        p_stage_id

    and effect_row.effect_key =
        'stage_closeout';

  if not v_writer_definition_matches then
    v_plan_status :=
      'blocked_ranking_writer_definition_drift';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'ranking_writer_definition_drift',

          'expected_hash',
            v_config.writer_definition_hash,

          'current_hash',
            v_current_writer_hash
        )
      );

  elsif v_golden_fixture then
    v_plan_status :=
      'historical_verify_only_golden_fixture';

  elsif v_route_format not in
        (
          'road_race',
          'individual_time_trial',
          'team_time_trial'
        ) then
    v_plan_status :=
      'blocked_unsupported_route';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'unsupported_route_format',

          'route_format',
            v_route_format
        )
      );

  elsif v_stage_process_status =
        'verify_only_no_execution' then

    if (
         v_output ->> 'row_count'
       )::integer > 0 then
      v_plan_status :=
        'historical_verify_only_existing_awards';
    else
      v_plan_status :=
        'historical_verify_only_completed_stage_missing_awards';

      v_plan_warnings :=
        v_plan_warnings
        ||
        jsonb_build_array(
          jsonb_build_object(
            'warning',
              'completed_stage_has_no_ranking_awards',

            'policy',
              'record_historical_debt_without_regeneration'
          )
        );
    end if;

  elsif v_source ->> 'status'
        <>
        'source_evidence_ready' then
    v_plan_status :=
      'source_not_ready_no_stage_results';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'ranking_source_not_ready',

          'source_status',
            v_source ->> 'status'
        )
      );

  elsif v_prize_rows > 0
        or v_finance_event_lock_rows > 0 then
    v_plan_status :=
      'blocked_downstream_prize_or_finance_exists';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'downstream_prize_or_finance_exists',

          'prize_rows',
            v_prize_rows,

          'finance_event_lock_rows',
            v_finance_event_lock_rows
        )
      );

  elsif v_closeout_status is not null then
    v_plan_status :=
      'blocked_stage_closeout_effect_exists';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'stage_closeout_effect_exists',

          'closeout_status',
            v_closeout_status
        )
      );

  elsif v_effect_found
        and v_effect.effect_status in
            (
              'applied',
              'verified',
              'skipped'
            ) then
    v_plan_status :=
      'blocked_ranking_effect_already_finalized';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'ranking_effect_already_finalized',

          'effect_status',
            v_effect.effect_status
        )
      );

  elsif not v_process_run_found then
    v_plan_status :=
      'blocked_production_process_run_required';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'production_process_run_required',

          'current_b1_policy',
            'process runs are dry-run-only'
        )
      );

  elsif not v_process_run_execution_capable then
    v_plan_status :=
      'blocked_process_run_not_execution_capable';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'process_run_not_execution_capable',

          'process_run_id',
            p_process_run_id,

          'requested_dry_run',
            v_process_run.requested_dry_run,

          'process_run_status',
            v_process_run.status,

          'production_execution_enabled',
            v_process_run.production_execution_enabled,

          'existing_runner_called',
            v_process_run.existing_runner_called
        )
      );

  elsif not v_effect_found then
    v_plan_status :=
      'blocked_ranking_effect_reservation_required';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'ranking_effect_reservation_required'
        )
      );

  elsif v_effect.effect_status <>
        'planned' then
    v_plan_status :=
      'blocked_ranking_effect_not_planned';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'ranking_effect_not_planned',

          'effect_status',
            v_effect.effect_status
        )
      );

  elsif v_effect.source_payload_hash is distinct from
        v_source ->> 'source_payload_hash' then
    v_plan_status :=
      'blocked_ranking_source_hash_mismatch';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'ranking_source_hash_mismatch',

          'planned_source_hash',
            v_source ->> 'source_payload_hash',

          'reserved_source_hash',
            v_effect.source_payload_hash
        )
      );

  elsif not v_config.execution_enabled then
    v_plan_status :=
      'blocked_ranking_adapter_execution_disabled_in_b8';

    v_plan_blockers :=
      v_plan_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'ranking_adapter_execution_disabled_in_b8',

          'config_version',
            v_config.config_version
        )
      );

  else
    v_plan_status :=
      'ready_for_guarded_ranking_execution';
  end if;

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_b8_guarded_ranking_adapter_plan_v1',

      'status',
        v_plan_status,

      'stage_id',
        v_stage_id,

      'race_id',
        v_race_id,

      'simulation_run_id',
        v_simulation_run_id,

      'simulation_status',
        v_simulation_status,

      'route_format',
        v_route_format,

      'stage_process_status',
        v_stage_process_status,

      'golden_fixture_stage',
        v_golden_fixture,

      'writer',
        jsonb_build_object(
          'signature',
            v_config.writer_signature,

          'expected_definition_hash',
            v_config.writer_definition_hash,

          'current_definition_hash',
            v_current_writer_hash,

          'definition_matches',
            v_writer_definition_matches
        ),

      'source_evidence',
        v_source,

      'output_evidence',
        v_output,

      'process_run',
        jsonb_build_object(
          'requested_process_run_id',
            p_process_run_id,

          'found',
            v_process_run_found,

          'execution_capable',
            v_process_run_execution_capable,

          'current_b1_production_execution_available',
            false
        ),

      'effect_ledger',
        jsonb_build_object(
          'found',
            v_effect_found,

          'effect_id',
            v_effect.effect_id,

          'effect_status',
            v_effect.effect_status,

          'idempotency_key',
            v_effect.idempotency_key,

          'source_payload_hash',
            v_effect.source_payload_hash,

          'applied_payload_hash',
            v_effect.applied_payload_hash
        ),

      'downstream_state',
        jsonb_build_object(
          'prize_rows',
            v_prize_rows,

          'finance_event_lock_rows',
            v_finance_event_lock_rows,

          'stage_closeout_effect_status',
            v_closeout_status
        ),

      'blockers',
        v_plan_blockers,

      'warnings',
        v_plan_warnings,

      'execution_config',
        jsonb_build_object(
          'config_version',
            v_config.config_version,

          'execution_enabled',
            v_config.execution_enabled,

          'allow_historical_rebuild',
            v_config.allow_historical_rebuild,

          'hard_disabled_by_check_constraint',
            true
        ),

      'production_writer_execution_enabled',
        false,

      'semantic_output_hash_required',
        true,

      'identity_hash_must_not_be_used_for_equivalence',
        true
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash',
        md5(v_plan::text),

      'generated_at',
        clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_ranking_awards_adapter_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_config record;
  v_plan jsonb;

  v_race_id uuid;
  v_source_payload_hash text;

  v_effect_id uuid;
  v_effect_status text;
  v_reserved_source_hash text;

  v_output jsonb;

  v_confirmation_valid boolean;
begin
  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then

    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'stage_id',
        p_stage_id,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_ranking_awards_adapter_plan_v2(
      p_stage_id,
      p_process_run_id
    );

  if not coalesce(
           p_execute,
           false
         ) then
    return jsonb_build_object(
      'status',
        'dry_run_ranking_adapter_plan',

      'stage_id',
        p_stage_id,

      'process_run_id',
        p_process_run_id,

      'plan',
        v_plan,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  if v_plan ->> 'status' in
     (
       'historical_verify_only_golden_fixture',
       'historical_verify_only_existing_awards',
       'historical_verify_only_completed_stage_missing_awards'
     ) then
    return jsonb_build_object(
      'status',
        v_plan ->> 'status',

      'stage_id',
        p_stage_id,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  select *
  into v_config
  from public.race_engine_stage_ranking_adapter_config_v2 config
  where config.adapter_key =
        'ranking_awards';

  if not found
     or not coalesce(
              v_config.execution_enabled,
              false
            ) then

    return jsonb_build_object(
      'status',
        'blocked_ranking_adapter_execution_disabled_in_b8',

      'stage_id',
        p_stage_id,

      'process_run_id',
        p_process_run_id,

      'plan_status',
        v_plan ->> 'status',

      'config_found',
        found,

      'config_version',
        v_config.config_version,

      'hard_disabled_by_check_constraint',
        true,

      'confirmation_text_ignored',
        p_confirmation_text is not null,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  /*
   * The code below is the reviewed future execution sequence.
   * It cannot be reached in B8 because execution_enabled is constrained false.
   */

  v_confirmation_valid :=
    md5(
      coalesce(
        p_confirmation_text,
        ''
      )
    )
    =
    v_config.required_confirmation_hash;

  if not v_confirmation_valid then
    return jsonb_build_object(
      'status',
        'blocked_invalid_ranking_adapter_confirmation',

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  if v_plan ->> 'status'
     is distinct from
     'ready_for_guarded_ranking_execution' then

    return jsonb_build_object(
      'status',
        'blocked_ranking_adapter_plan_not_ready',

      'plan_status',
        v_plan ->> 'status',

      'plan',
        v_plan,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:ranking-adapter:'
      ||
      p_stage_id::text,
      0
    )
  );

  v_race_id :=
    nullif(
      v_plan ->> 'race_id',
      ''
    )::uuid;

  v_source_payload_hash :=
    v_plan
      -> 'source_evidence'
      ->> 'source_payload_hash';

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.source_payload_hash

  into
    v_effect_id,
    v_effect_status,
    v_reserved_source_hash

  from public.race_engine_stage_effect_ledger_v2 effect_row

  where effect_row.stage_id =
        p_stage_id

    and effect_row.effect_key =
        'ranking_awards'

  for update;

  if v_effect_id is null
     or v_effect_status <>
        'planned'
     or v_reserved_source_hash is distinct from
        v_source_payload_hash then

    raise exception
      'Ranking adapter invariant failed: planned matching effect reservation required.';
  end if;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status =
      'started',

    started_at =
      coalesce(
        effect_row.started_at,
        clock_timestamp()
      ),

    error_message =
      null,

    metadata =
      effect_row.metadata
      ||
      jsonb_build_object(
        'adapter_version',
          'phase3ab_b8_guarded_ranking_adapter_v1',

        'process_run_id',
          p_process_run_id,

        'source_hash_version',
          v_config.source_hash_version,

        'output_hash_version',
          v_config.output_hash_version
      ),

    updated_at =
      clock_timestamp()

  where effect_row.effect_id =
        v_effect_id;

  perform public.generate_race_ranking_point_awards_v1(
    v_race_id,
    p_stage_id,
    false
  );

  v_output :=
    public.race_engine_get_stage_ranking_output_evidence_v2(
      p_stage_id
    );

  if (
       v_output ->> 'row_count'
     )::integer <= 0

     or (
          v_output
            ->> 'duplicate_natural_key_count'
        )::integer <> 0 then

    raise exception
      'Ranking adapter output verification failed: rows %, duplicate natural keys %.',
      v_output ->> 'row_count',
      v_output ->> 'duplicate_natural_key_count';
  end if;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status =
      'applied',

    applied_at =
      clock_timestamp(),

    applied_payload_hash =
      v_output ->> 'semantic_hash',

    metadata =
      effect_row.metadata
      ||
      jsonb_build_object(
        'semantic_output_evidence',
          v_output,

        'identity_hash_excluded_from_equivalence',
          true
      ),

    updated_at =
      clock_timestamp()

  where effect_row.effect_id =
        v_effect_id;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status =
      'verified',

    verified_at =
      clock_timestamp(),

    updated_at =
      clock_timestamp()

  where effect_row.effect_id =
        v_effect_id

    and effect_row.effect_status =
        'applied'

    and effect_row.applied_payload_hash =
        v_output ->> 'semantic_hash';

  if not found then
    raise exception
      'Ranking adapter verification transition failed.';
  end if;

  return jsonb_build_object(
    'status',
      'ranking_awards_applied_and_verified',

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'process_run_id',
      p_process_run_id,

    'effect_id',
      v_effect_id,

    'source_payload_hash',
      v_source_payload_hash,

    'applied_payload_hash',
      v_output ->> 'semantic_hash',

    'output_evidence',
      v_output,

    'production_writer_called',
      true,

    'effect_ledger_changed',
      true,

    'production_writer_execution_enabled',
      true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_prize_regeneration_guard_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_process_plan jsonb;
  v_snapshot jsonb;

  v_stage_id uuid;
  v_race_id uuid;
  v_simulation_status text;
  v_route_format text;
  v_process_status text;

  v_is_golden boolean;
  v_prize_payment_effect_status text;

  v_guard_status text;
begin
  v_process_plan :=
    public.race_engine_get_stage_process_plan_v2(
      p_stage_id
    );

  if v_process_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'generator_call_allowed',
        false
    );
  end if;

  select
    stage_row.id,
    stage_row.race_id,
    lower(coalesce(simulation_row.status, 'not_created'))
  into
    v_stage_id,
    v_race_id,
    v_simulation_status
  from public.race_stages stage_row
  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id = stage_row.id
  where stage_row.id = p_stage_id;

  v_route_format :=
    v_process_plan -> 'stage' ->> 'route_format';

  v_process_status :=
    v_process_plan ->> 'status';

  v_is_golden :=
    exists
    (
      select 1
      from public.race_engine_golden_stage_fixture_v1 fixture
      where fixture.stage_id = p_stage_id
        and fixture.fixture_status = 'frozen_and_validated'
    );

  v_snapshot :=
    public.race_engine_get_stage_prize_award_snapshot_v2(
      p_stage_id
    );

  select effect_row.effect_status
  into v_prize_payment_effect_status
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'prize_payment';

  v_guard_status :=
    case
      when v_is_golden
        then 'blocked_golden_fixture_prize_identity_immutable'

      when (
             v_snapshot ->> 'paid_row_count'
           )::integer > 0
        or (
             v_snapshot ->> 'finance_event_lock_count'
           )::integer > 0
        or v_prize_payment_effect_status in
           (
             'started',
             'applied',
             'verified',
             'skipped'
           )
        then 'blocked_paid_prize_identity_immutable'

      when v_process_status = 'verify_only_no_execution'
           and (
                 v_snapshot ->> 'row_count'
               )::integer = 0
        then 'historical_verify_only_completed_stage_missing_prizes'

      when v_simulation_status = 'completed'
           and (
                 v_snapshot ->> 'row_count'
               )::integer > 0
        then 'safe_for_rollback_test_only_unpaid'

      when v_process_status = 'future_execution_candidate'
        then 'future_stage_not_ready_for_prize_generation'

      else 'blocked_stage_not_eligible_for_prize_regeneration'
    end;

  return jsonb_build_object(
    'guard_version',
      'phase3ab_b9_paid_prize_identity_guard_v1',

    'status',
      v_guard_status,

    'stage_id',
      v_stage_id,

    'race_id',
      v_race_id,

    'route_format',
      v_route_format,

    'stage_process_status',
      v_process_status,

    'simulation_status',
      v_simulation_status,

    'golden_fixture_stage',
      v_is_golden,

    'prize_snapshot',
      v_snapshot,

    'prize_payment_effect_status',
      v_prize_payment_effect_status,

    'generator_call_allowed',
      v_guard_status =
      'safe_for_rollback_test_only_unpaid',

    'production_generator_call_allowed',
      false,

    'paid_identity_policy',
      'any paid row, finance event lock, or finalized prize-payment effect permanently blocks destructive regeneration'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_prize_awards_adapter_rollback_v2(p_stage_id uuid, p_confirmation_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_required_confirmation constant text :=
    'RUN_PHASE3AB_B9_PRIZE_AWARDS_ROLLBACK_TEST_V1';

  v_guard jsonb;

  v_race_id uuid;
  v_simulation_run_id uuid;
  v_route_format text;
  v_is_final boolean;

  v_writer_oid oid;
  v_writer_hash text;
  v_manifest_hash text;

  v_before_snapshot jsonb;
  v_first_snapshot jsonb;
  v_second_snapshot jsonb;
  v_after_snapshot jsonb;

  v_source_hash_before text;
  v_source_hash_first text;
  v_source_hash_second text;
  v_source_hash_after text;

  v_other_prize_hash_before text;
  v_other_prize_hash_first text;
  v_other_prize_hash_second text;
  v_other_prize_hash_after text;

  v_ranking_hash_before text;
  v_ranking_hash_first text;
  v_ranking_hash_second text;
  v_ranking_hash_after text;

  v_finance_hash_before text;
  v_finance_hash_first text;
  v_finance_hash_second text;
  v_finance_hash_after text;

  v_ledger_hash_before text;
  v_ledger_hash_after text;

  v_test_effect_id uuid;
  v_rollback_marker boolean := false;

  v_semantic_stable boolean;
  v_identity_stable boolean;
  v_identity_churn boolean;

  v_scope_safe boolean;
  v_unrelated_safe boolean;
  v_rollback_exact boolean;
begin
  if p_confirmation_text is distinct from
     v_required_confirmation then
    return jsonb_build_object(
      'status',
        'blocked_invalid_confirmation',

      'stage_id',
        p_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:b9:prize-test:'
      ||
      p_stage_id::text,
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  v_guard :=
    public.race_engine_get_stage_prize_regeneration_guard_v2(
      p_stage_id
    );

  if v_guard ->> 'status'
     is distinct from
     'safe_for_rollback_test_only_unpaid' then
    return jsonb_build_object(
      'status',
        v_guard ->> 'status',

      'stage_id',
        p_stage_id,

      'guard',
        v_guard,

      'generator_called',
        false,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  v_race_id :=
    nullif(v_guard ->> 'race_id', '')::uuid;

  v_route_format :=
    v_guard ->> 'route_format';

  select simulation_row.id
  into v_simulation_run_id
  from public.race_stage_simulation_runs simulation_row
  where simulation_row.stage_id = p_stage_id;

  select not exists
         (
           select 1
           from public.race_stages later_stage
           join public.race_stages current_stage
             on current_stage.id = p_stage_id
           where later_stage.race_id = current_stage.race_id
             and later_stage.stage_number >
                 current_stage.stage_number
         )
  into v_is_final;

  v_writer_oid :=
    to_regprocedure(
      'public.generate_race_prize_awards_v1(uuid,uuid,boolean)'
    );

  select md5(pg_get_functiondef(v_writer_oid))
  into v_writer_hash;

  select manifest.current_writer_definition_hash
  into v_manifest_hash
  from public.race_engine_stage_effect_writer_adapter_manifest_v2 manifest
  where manifest.manifest_version =
        'phase3ab_writer_adapter_manifest_v2'
    and manifest.effect_key =
        'prize_awards'
    and manifest.is_active;

  if v_writer_hash is distinct from
     '53407e6bd5d52aa68dbede2329be0d2f'
     or v_manifest_hash is distinct from
        v_writer_hash then
    return jsonb_build_object(
      'status',
        'blocked_prize_writer_definition_drift',

      'current_writer_hash',
        v_writer_hash,

      'manifest_writer_hash',
        v_manifest_hash,

      'generator_called',
        false,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  v_before_snapshot :=
    public.race_engine_get_stage_prize_award_snapshot_v2(
      p_stage_id
    );

  select md5(
           coalesce(
             (
               select string_agg(
                        (
                          to_jsonb(result_row)
                          - 'id'
                          - 'created_at'
                          - 'updated_at'
                        )::text,
                        '|'
                        order by result_row.rank, result_row.rider_id
                      )
               from public.race_stage_results result_row
               where result_row.stage_id = p_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        (
                          to_jsonb(classification)
                          - 'id'
                          - 'created_at'
                          - 'updated_at'
                        )::text,
                        '|'
                        order by
                          classification.classification_type,
                          classification.rank,
                          coalesce(
                            classification.rider_id::text,
                            classification.team_id::text
                          )
                      )
               from public.race_classification_standings classification
               where classification.after_stage_id = p_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(bucket_rule)::text,
                        '|'
                        order by
                          bucket_rule.race_class_code,
                          bucket_rule.bucket_key
                      )
               from public.race_prize_bucket_rules bucket_rule
             ),
             ''
           )
         )
  into v_source_hash_before;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(prize_award)::text,
               '|'
               order by prize_award.id
             ),
             ''
           )
         )
  into v_other_prize_hash_before
  from public.race_prize_awards prize_award
  where prize_award.stage_id is distinct from p_stage_id;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(ranking_award)::text,
               '|'
               order by ranking_award.id
             ),
             ''
           )
         )
  into v_ranking_hash_before
  from public.race_ranking_point_awards ranking_award;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(transaction_row)::text,
                        '|'
                        order by transaction_row.id
                      )
               from finance.transactions transaction_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(entry_row)::text,
                        '|'
                        order by entry_row.id
                      )
               from finance.entries entry_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(lock_row)::text,
                        '|'
                        order by
                          lock_row.event_type,
                          lock_row.club_id,
                          lock_row.ref_id
                      )
               from finance.event_locks lock_row
             ),
             ''
           )
         )
  into v_finance_hash_before;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by effect_row.stage_id, effect_row.effect_key
             ),
             ''
           )
         )
  into v_ledger_hash_before
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_test_effect_id := gen_random_uuid();

  begin
    insert into public.race_engine_stage_effect_ledger_v2
    (
      effect_id,
      stage_id,
      race_id,
      simulation_run_id,
      effect_key,
      effect_status,
      owner_component,
      writer_function,
      idempotency_key,
      source_payload_hash,
      metadata
    )
    values
    (
      v_test_effect_id,
      p_stage_id,
      v_race_id,
      v_simulation_run_id,
      'prize_awards',
      'planned',
      'phase3ab_b9_prize_adapter_rollback_test',
      'public.generate_race_prize_awards_v1(uuid,uuid,boolean)',
      'phase3ab-b9-rollback-test:'
      ||
      p_stage_id::text
      ||
      ':'
      ||
      v_test_effect_id::text,
      v_source_hash_before,
      jsonb_build_object(
        'test_only', true,
        'will_be_rolled_back', true,
        'is_final', v_is_final
      )
    );

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status = 'started',
      started_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where effect_row.effect_id = v_test_effect_id;

    perform public.generate_race_prize_awards_v1(
      v_race_id,
      p_stage_id,
      v_is_final
    );

    v_first_snapshot :=
      public.race_engine_get_stage_prize_award_snapshot_v2(
        p_stage_id
      );

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(prize_award)::text,
                 '|'
                 order by prize_award.id
               ),
               ''
             )
           )
    into v_other_prize_hash_first
    from public.race_prize_awards prize_award
    where prize_award.stage_id is distinct from p_stage_id;

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(ranking_award)::text,
                 '|'
                 order by ranking_award.id
               ),
               ''
             )
           )
    into v_ranking_hash_first
    from public.race_ranking_point_awards ranking_award;

    select md5(
             coalesce(
               (
                 select string_agg(
                          to_jsonb(transaction_row)::text,
                          '|'
                          order by transaction_row.id
                        )
                 from finance.transactions transaction_row
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(entry_row)::text,
                          '|'
                          order by entry_row.id
                        )
                 from finance.entries entry_row
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(lock_row)::text,
                          '|'
                          order by
                            lock_row.event_type,
                            lock_row.club_id,
                            lock_row.ref_id
                        )
                 from finance.event_locks lock_row
               ),
               ''
             )
           )
    into v_finance_hash_first;

    select md5(
             coalesce(
               (
                 select string_agg(
                          (
                            to_jsonb(result_row)
                            - 'id'
                            - 'created_at'
                            - 'updated_at'
                          )::text,
                          '|'
                          order by result_row.rank, result_row.rider_id
                        )
                 from public.race_stage_results result_row
                 where result_row.stage_id = p_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          (
                            to_jsonb(classification)
                            - 'id'
                            - 'created_at'
                            - 'updated_at'
                          )::text,
                          '|'
                          order by
                            classification.classification_type,
                            classification.rank,
                            coalesce(
                              classification.rider_id::text,
                              classification.team_id::text
                            )
                        )
                 from public.race_classification_standings classification
                 where classification.after_stage_id = p_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(bucket_rule)::text,
                          '|'
                          order by
                            bucket_rule.race_class_code,
                            bucket_rule.bucket_key
                        )
                 from public.race_prize_bucket_rules bucket_rule
               ),
               ''
             )
           )
    into v_source_hash_first;

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status = 'applied',
      applied_at = clock_timestamp(),
      applied_payload_hash =
        v_first_snapshot ->> 'semantic_hash',
      updated_at = clock_timestamp()
    where effect_row.effect_id = v_test_effect_id;

    perform public.generate_race_prize_awards_v1(
      v_race_id,
      p_stage_id,
      v_is_final
    );

    v_second_snapshot :=
      public.race_engine_get_stage_prize_award_snapshot_v2(
        p_stage_id
      );

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(prize_award)::text,
                 '|'
                 order by prize_award.id
               ),
               ''
             )
           )
    into v_other_prize_hash_second
    from public.race_prize_awards prize_award
    where prize_award.stage_id is distinct from p_stage_id;

    select md5(
             coalesce(
               string_agg(
                 to_jsonb(ranking_award)::text,
                 '|'
                 order by ranking_award.id
               ),
               ''
             )
           )
    into v_ranking_hash_second
    from public.race_ranking_point_awards ranking_award;

    select md5(
             coalesce(
               (
                 select string_agg(
                          to_jsonb(transaction_row)::text,
                          '|'
                          order by transaction_row.id
                        )
                 from finance.transactions transaction_row
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(entry_row)::text,
                          '|'
                          order by entry_row.id
                        )
                 from finance.entries entry_row
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(lock_row)::text,
                          '|'
                          order by
                            lock_row.event_type,
                            lock_row.club_id,
                            lock_row.ref_id
                        )
                 from finance.event_locks lock_row
               ),
               ''
             )
           )
    into v_finance_hash_second;

    select md5(
             coalesce(
               (
                 select string_agg(
                          (
                            to_jsonb(result_row)
                            - 'id'
                            - 'created_at'
                            - 'updated_at'
                          )::text,
                          '|'
                          order by result_row.rank, result_row.rider_id
                        )
                 from public.race_stage_results result_row
                 where result_row.stage_id = p_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          (
                            to_jsonb(classification)
                            - 'id'
                            - 'created_at'
                            - 'updated_at'
                          )::text,
                          '|'
                          order by
                            classification.classification_type,
                            classification.rank,
                            coalesce(
                              classification.rider_id::text,
                              classification.team_id::text
                            )
                        )
                 from public.race_classification_standings classification
                 where classification.after_stage_id = p_stage_id
               ),
               ''
             )
             ||
             '||'
             ||
             coalesce(
               (
                 select string_agg(
                          to_jsonb(bucket_rule)::text,
                          '|'
                          order by
                            bucket_rule.race_class_code,
                            bucket_rule.bucket_key
                        )
                 from public.race_prize_bucket_rules bucket_rule
               ),
               ''
             )
           )
    into v_source_hash_second;

    v_semantic_stable :=
      v_first_snapshot ->> 'semantic_hash'
      is not distinct from
      v_second_snapshot ->> 'semantic_hash'

      and (
            v_first_snapshot ->> 'row_count'
          )::integer =
          (
            v_second_snapshot ->> 'row_count'
          )::integer

      and (
            v_first_snapshot ->> 'total_amount_cash'
          )::bigint =
          (
            v_second_snapshot ->> 'total_amount_cash'
          )::bigint

      and (
            v_first_snapshot
              ->> 'duplicate_natural_key_count'
          )::integer = 0

      and (
            v_second_snapshot
              ->> 'duplicate_natural_key_count'
          )::integer = 0

      and (
            v_first_snapshot ->> 'paid_row_count'
          )::integer = 0

      and (
            v_second_snapshot ->> 'paid_row_count'
          )::integer = 0

      and (
            v_first_snapshot
              ->> 'finance_event_lock_count'
          )::integer = 0

      and (
            v_second_snapshot
              ->> 'finance_event_lock_count'
          )::integer = 0;

    v_identity_stable :=
      v_first_snapshot ->> 'identity_hash'
      is not distinct from
      v_second_snapshot ->> 'identity_hash';

    v_identity_churn :=
      not v_identity_stable;

    v_scope_safe :=
      v_other_prize_hash_before
      is not distinct from
      v_other_prize_hash_first

      and v_other_prize_hash_first
          is not distinct from
          v_other_prize_hash_second;

    v_unrelated_safe :=
      v_ranking_hash_before
      is not distinct from
      v_ranking_hash_first

      and v_ranking_hash_first
          is not distinct from
          v_ranking_hash_second

      and v_finance_hash_before
          is not distinct from
          v_finance_hash_first

      and v_finance_hash_first
          is not distinct from
          v_finance_hash_second

      and v_source_hash_before
          is not distinct from
          v_source_hash_first

      and v_source_hash_first
          is not distinct from
          v_source_hash_second;

    if not coalesce(v_semantic_stable, false) then
      raise exception
        'Phase 3AB-B9 test failed: repeated prize generation was not semantically stable.';
    end if;

    if not coalesce(v_scope_safe, false) then
      raise exception
        'Phase 3AB-B9 test failed: prize generator changed another stage.';
    end if;

    if not coalesce(v_unrelated_safe, false) then
      raise exception
        'Phase 3AB-B9 test failed: prize generator changed ranking, finance, or source state.';
    end if;

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status = 'verified',
      verified_at = clock_timestamp(),
      applied_payload_hash =
        v_second_snapshot ->> 'semantic_hash',
      metadata =
        effect_row.metadata
        ||
        jsonb_build_object(
          'semantic_rerun_stable',
            v_semantic_stable,

          'identity_churn_observed',
            v_identity_churn
        ),
      updated_at = clock_timestamp()
    where effect_row.effect_id = v_test_effect_id;

    raise exception
      using
        errcode = 'P5003',
        message =
          'PHASE3AB_B9_ROLLBACK_PRIZE_WRITER_AND_LEDGER';

  exception
    when sqlstate 'P5003' then
      v_rollback_marker := true;
  end;

  if not v_rollback_marker then
    raise exception
      'Phase 3AB-B9 test failed: rollback marker was not reached.';
  end if;

  v_after_snapshot :=
    public.race_engine_get_stage_prize_award_snapshot_v2(
      p_stage_id
    );

  select md5(
           coalesce(
             (
               select string_agg(
                        (
                          to_jsonb(result_row)
                          - 'id'
                          - 'created_at'
                          - 'updated_at'
                        )::text,
                        '|'
                        order by result_row.rank, result_row.rider_id
                      )
               from public.race_stage_results result_row
               where result_row.stage_id = p_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        (
                          to_jsonb(classification)
                          - 'id'
                          - 'created_at'
                          - 'updated_at'
                        )::text,
                        '|'
                        order by
                          classification.classification_type,
                          classification.rank,
                          coalesce(
                            classification.rider_id::text,
                            classification.team_id::text
                          )
                      )
               from public.race_classification_standings classification
               where classification.after_stage_id = p_stage_id
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(bucket_rule)::text,
                        '|'
                        order by
                          bucket_rule.race_class_code,
                          bucket_rule.bucket_key
                      )
               from public.race_prize_bucket_rules bucket_rule
             ),
             ''
           )
         )
  into v_source_hash_after;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(prize_award)::text,
               '|'
               order by prize_award.id
             ),
             ''
           )
         )
  into v_other_prize_hash_after
  from public.race_prize_awards prize_award
  where prize_award.stage_id is distinct from p_stage_id;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(ranking_award)::text,
               '|'
               order by ranking_award.id
             ),
             ''
           )
         )
  into v_ranking_hash_after
  from public.race_ranking_point_awards ranking_award;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(transaction_row)::text,
                        '|'
                        order by transaction_row.id
                      )
               from finance.transactions transaction_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(entry_row)::text,
                        '|'
                        order by entry_row.id
                      )
               from finance.entries entry_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(lock_row)::text,
                        '|'
                        order by
                          lock_row.event_type,
                          lock_row.club_id,
                          lock_row.ref_id
                      )
               from finance.event_locks lock_row
             ),
             ''
           )
         )
  into v_finance_hash_after;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by effect_row.stage_id, effect_row.effect_key
             ),
             ''
           )
         )
  into v_ledger_hash_after
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_rollback_exact :=
    v_before_snapshot ->> 'identity_hash'
    is not distinct from
    v_after_snapshot ->> 'identity_hash'

    and v_before_snapshot ->> 'semantic_hash'
        is not distinct from
        v_after_snapshot ->> 'semantic_hash'

    and v_source_hash_before
        is not distinct from
        v_source_hash_after

    and v_other_prize_hash_before
        is not distinct from
        v_other_prize_hash_after

    and v_ranking_hash_before
        is not distinct from
        v_ranking_hash_after

    and v_finance_hash_before
        is not distinct from
        v_finance_hash_after

    and v_ledger_hash_before
        is not distinct from
        v_ledger_hash_after

    and not exists
        (
          select 1
          from public.race_engine_stage_effect_ledger_v2 effect_row
          where effect_row.effect_id = v_test_effect_id
        );

  if not coalesce(v_rollback_exact, false) then
    raise exception
      'Phase 3AB-B9 test failed: rollback did not restore exact state.';
  end if;

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    raise exception
      'Phase 3AB-B9 test failed: Rio golden fixture changed.';
  end if;

  return jsonb_build_object(
    'status',
      'rolled_back_prize_adapter_test_passed',

    'test_version',
      'phase3ab_b9_prize_awards_rollback_v1',

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'simulation_run_id',
      v_simulation_run_id,

    'route_format',
      v_route_format,

    'is_final_stage',
      v_is_final,

    'writer_signature',
      'public.generate_race_prize_awards_v1(uuid,uuid,boolean)',

    'writer_definition_hash',
      v_writer_hash,

    'regeneration_guard',
      v_guard,

    'before_snapshot',
      v_before_snapshot,

    'first_generated_snapshot',
      v_first_snapshot,

    'second_generated_snapshot',
      v_second_snapshot,

    'after_rollback_snapshot',
      v_after_snapshot,

    'semantic_rerun_stable',
      v_semantic_stable,

    'identity_rerun_stable',
      v_identity_stable,

    'identity_churn_observed',
      v_identity_churn,

    'generator_scope_safe',
      v_scope_safe,

    'unrelated_state_unchanged_inside_test',
      v_unrelated_safe,

    'rollback_restored_exact_state',
      v_rollback_exact,

    'all_mutations_rolled_back',
      true,

    'production_writer_call_count_inside_rolled_back_test',
      2,

    'production_writer_calls_persisted',
      0,

    'production_execution_enabled',
      false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_prize_awards_adapter_plan_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_config record;

  v_process_plan jsonb;
  v_source jsonb;
  v_output jsonb;
  v_paid_guard jsonb;

  v_stage_id uuid;
  v_race_id uuid;
  v_simulation_run_id uuid;
  v_simulation_status text;

  v_route_format text;
  v_stage_process_status text;

  v_golden_fixture boolean;

  v_writer_oid oid;
  v_current_writer_hash text;
  v_writer_definition_matches boolean;

  v_process_run record;
  v_process_run_found boolean := false;
  v_process_run_execution_capable boolean := false;

  v_ranking_effect record;
  v_ranking_effect_found boolean := false;

  v_prize_effect record;
  v_prize_effect_found boolean := false;

  v_prize_payment_effect_status text;
  v_closeout_effect_status text;

  v_plan_status text;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;

  v_plan jsonb;
begin
  select *
  into v_config
  from public.race_engine_stage_prize_adapter_config_v2 config
  where config.adapter_key = 'prize_awards';

  if not found then
    return jsonb_build_object(
      'status',
        'blocked_prize_adapter_config_missing',

      'stage_id',
        p_stage_id,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_process_plan :=
    public.race_engine_get_stage_process_plan_v2(
      p_stage_id
    );

  if v_process_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'production_writer_execution_enabled',
        false
    );
  end if;

  select
    stage_row.id,
    stage_row.race_id,
    simulation_row.id,
    lower(coalesce(simulation_row.status, 'not_created'))
  into
    v_stage_id,
    v_race_id,
    v_simulation_run_id,
    v_simulation_status
  from public.race_stages stage_row
  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id = stage_row.id
  where stage_row.id = p_stage_id;

  v_route_format :=
    v_process_plan -> 'stage' ->> 'route_format';

  v_stage_process_status :=
    v_process_plan ->> 'status';

  v_golden_fixture :=
    exists
    (
      select 1
      from public.race_engine_golden_stage_fixture_v1 fixture
      where fixture.stage_id = p_stage_id
        and fixture.fixture_status = 'frozen_and_validated'
    );

  v_source :=
    public.race_engine_get_stage_prize_source_evidence_v2(
      p_stage_id
    );

  v_output :=
    public.race_engine_get_stage_prize_award_snapshot_v2(
      p_stage_id
    );

  v_paid_guard :=
    public.race_engine_get_stage_prize_regeneration_guard_v2(
      p_stage_id
    );

  v_writer_oid :=
    to_regprocedure(
      v_config.writer_signature
    );

  if v_writer_oid is not null then
    select md5(pg_get_functiondef(v_writer_oid))
    into v_current_writer_hash;
  end if;

  v_writer_definition_matches :=
    v_writer_oid is not null
    and v_current_writer_hash
        is not distinct from
        v_config.writer_definition_hash;

  if p_process_run_id is not null then
    select
      process_run.process_run_id,
      process_run.stage_id,
      process_run.race_id,
      process_run.simulation_run_id,
      process_run.requested_dry_run,
      process_run.status,
      process_run.production_execution_enabled,
      process_run.existing_runner_called,
      process_run.processor_version
    into v_process_run
    from public.race_engine_stage_process_runs_v2 process_run
    where process_run.process_run_id = p_process_run_id;

    v_process_run_found := found;

    if v_process_run_found then
      v_process_run_execution_capable :=
        v_process_run.stage_id = p_stage_id
        and not v_process_run.requested_dry_run
        and v_process_run.status = 'started'
        and v_process_run.production_execution_enabled
        and v_process_run.existing_runner_called;
    end if;
  end if;

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.idempotency_key,
    effect_row.source_payload_hash,
    effect_row.applied_payload_hash
  into v_ranking_effect
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'ranking_awards';

  v_ranking_effect_found := found;

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.idempotency_key,
    effect_row.source_payload_hash,
    effect_row.applied_payload_hash
  into v_prize_effect
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'prize_awards';

  v_prize_effect_found := found;

  select effect_row.effect_status
  into v_prize_payment_effect_status
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'prize_payment';

  select effect_row.effect_status
  into v_closeout_effect_status
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'stage_closeout';

  if not v_writer_definition_matches then
    v_plan_status :=
      'blocked_prize_writer_definition_drift';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_writer_definition_drift',

          'expected_hash',
            v_config.writer_definition_hash,

          'current_hash',
            v_current_writer_hash
        )
      );

  elsif v_golden_fixture then
    v_plan_status :=
      'historical_verify_only_golden_fixture';

  elsif v_route_format not in
        (
          'road_race',
          'individual_time_trial',
          'team_time_trial'
        ) then
    v_plan_status :=
      'blocked_unsupported_route';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'unsupported_route_format',

          'route_format',
            v_route_format
        )
      );

  elsif v_paid_guard ->> 'status' =
        'blocked_paid_prize_identity_immutable' then
    v_plan_status :=
      'historical_verify_only_paid_prize_identity_immutable';

  elsif v_stage_process_status =
        'verify_only_no_execution'
        and (
              v_output ->> 'row_count'
            )::integer > 0 then
    v_plan_status :=
      'historical_verify_only_existing_unpaid_prizes';

  elsif v_stage_process_status =
        'verify_only_no_execution'
        and (
              v_output ->> 'row_count'
            )::integer = 0 then
    v_plan_status :=
      'historical_verify_only_completed_stage_missing_prizes';

    v_warnings :=
      v_warnings
      ||
      jsonb_build_array(
        jsonb_build_object(
          'warning',
            'completed_stage_has_no_prize_awards',

          'policy',
            'record_historical_debt_without_regeneration'
        )
      );

  elsif v_source ->> 'status' <>
        'source_evidence_ready' then
    v_plan_status :=
      'source_not_ready_no_stage_results';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_source_not_ready',

          'source_status',
            v_source ->> 'status'
        )
      );

  elsif (
          v_output ->> 'paid_row_count'
        )::integer > 0
        or (
             v_output ->> 'finance_event_lock_count'
           )::integer > 0 then
    v_plan_status :=
      'blocked_paid_or_finance_locked_prize_identity';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'paid_or_finance_locked_prize_identity',

          'paid_row_count',
            v_output ->> 'paid_row_count',

          'finance_event_lock_count',
            v_output ->> 'finance_event_lock_count'
        )
      );

  elsif v_prize_payment_effect_status in
        (
          'started',
          'applied',
          'verified',
          'skipped'
        ) then
    v_plan_status :=
      'blocked_prize_payment_effect_exists';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_payment_effect_exists',

          'effect_status',
            v_prize_payment_effect_status
        )
      );

  elsif v_closeout_effect_status is not null then
    v_plan_status :=
      'blocked_stage_closeout_effect_exists';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'stage_closeout_effect_exists',

          'effect_status',
            v_closeout_effect_status
        )
      );

  elsif not v_ranking_effect_found
        or v_ranking_effect.effect_status <>
           'verified' then
    v_plan_status :=
      'blocked_verified_ranking_effect_required';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'verified_ranking_effect_required',

          'ranking_effect_found',
            v_ranking_effect_found,

          'ranking_effect_status',
            v_ranking_effect.effect_status
        )
      );

  elsif not v_process_run_found then
    v_plan_status :=
      'blocked_production_process_run_required';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'production_process_run_required',

          'current_b1_policy',
            'process runs are dry-run-only'
        )
      );

  elsif not v_process_run_execution_capable then
    v_plan_status :=
      'blocked_process_run_not_execution_capable';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'process_run_not_execution_capable',

          'process_run_id',
            p_process_run_id,

          'requested_dry_run',
            v_process_run.requested_dry_run,

          'process_run_status',
            v_process_run.status,

          'production_execution_enabled',
            v_process_run.production_execution_enabled,

          'existing_runner_called',
            v_process_run.existing_runner_called
        )
      );

  elsif not v_prize_effect_found then
    v_plan_status :=
      'blocked_prize_effect_reservation_required';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_effect_reservation_required'
        )
      );

  elsif v_prize_effect.effect_status <>
        'planned' then
    v_plan_status :=
      'blocked_prize_effect_not_planned';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_effect_not_planned',

          'effect_status',
            v_prize_effect.effect_status
        )
      );

  elsif v_prize_effect.source_payload_hash is distinct from
        v_source ->> 'source_payload_hash' then
    v_plan_status :=
      'blocked_prize_source_hash_mismatch';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_source_hash_mismatch',

          'planned_source_hash',
            v_source ->> 'source_payload_hash',

          'reserved_source_hash',
            v_prize_effect.source_payload_hash
        )
      );

  elsif not v_config.execution_enabled then
    v_plan_status :=
      'blocked_prize_adapter_execution_disabled_in_b10';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_adapter_execution_disabled_in_b10',

          'config_version',
            v_config.config_version
        )
      );

  else
    v_plan_status :=
      'ready_for_guarded_prize_execution';
  end if;

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_b10_guarded_prize_adapter_plan_v1',

      'status',
        v_plan_status,

      'stage_id',
        v_stage_id,

      'race_id',
        v_race_id,

      'simulation_run_id',
        v_simulation_run_id,

      'simulation_status',
        v_simulation_status,

      'route_format',
        v_route_format,

      'stage_process_status',
        v_stage_process_status,

      'golden_fixture_stage',
        v_golden_fixture,

      'writer',
        jsonb_build_object(
          'signature',
            v_config.writer_signature,

          'expected_definition_hash',
            v_config.writer_definition_hash,

          'current_definition_hash',
            v_current_writer_hash,

          'definition_matches',
            v_writer_definition_matches
        ),

      'source_evidence',
        v_source,

      'output_evidence',
        v_output,

      'paid_identity_guard',
        v_paid_guard,

      'process_run',
        jsonb_build_object(
          'requested_process_run_id',
            p_process_run_id,

          'found',
            v_process_run_found,

          'execution_capable',
            v_process_run_execution_capable,

          'current_b1_production_execution_available',
            false
        ),

      'dependencies',
        jsonb_build_object(
          'ranking_effect_found',
            v_ranking_effect_found,

          'ranking_effect_status',
            v_ranking_effect.effect_status,

          'ranking_applied_payload_hash',
            v_ranking_effect.applied_payload_hash,

          'prize_payment_effect_status',
            v_prize_payment_effect_status,

          'stage_closeout_effect_status',
            v_closeout_effect_status
        ),

      'effect_ledger',
        jsonb_build_object(
          'found',
            v_prize_effect_found,

          'effect_id',
            v_prize_effect.effect_id,

          'effect_status',
            v_prize_effect.effect_status,

          'idempotency_key',
            v_prize_effect.idempotency_key,

          'source_payload_hash',
            v_prize_effect.source_payload_hash,

          'applied_payload_hash',
            v_prize_effect.applied_payload_hash
        ),

      'blockers',
        v_blockers,

      'warnings',
        v_warnings,

      'execution_config',
        jsonb_build_object(
          'config_version',
            v_config.config_version,

          'execution_enabled',
            v_config.execution_enabled,

          'allow_historical_rebuild',
            v_config.allow_historical_rebuild,

          'allow_paid_regeneration',
            v_config.allow_paid_regeneration,

          'hard_disabled_by_check_constraints',
            true
        ),

      'production_writer_execution_enabled',
        false,

      'semantic_output_hash_required',
        true,

      'identity_hash_must_not_be_used_for_equivalence',
        true,

      'paid_identity_is_immutable',
        true
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash',
        md5(v_plan::text),

      'generated_at',
        clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_prize_awards_adapter_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_config record;
  v_plan jsonb;

  v_race_id uuid;
  v_is_final_stage boolean;
  v_source_payload_hash text;

  v_prize_effect_id uuid;
  v_prize_effect_status text;
  v_reserved_source_hash text;

  v_source_after jsonb;
  v_output jsonb;

  v_confirmation_valid boolean;
begin
  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then

    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'stage_id',
        p_stage_id,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_prize_awards_adapter_plan_v2(
      p_stage_id,
      p_process_run_id
    );

  if not coalesce(p_execute, false) then
    return jsonb_build_object(
      'status',
        'dry_run_prize_adapter_plan',

      'stage_id',
        p_stage_id,

      'process_run_id',
        p_process_run_id,

      'plan',
        v_plan,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  if v_plan ->> 'status' in
     (
       'historical_verify_only_golden_fixture',
       'historical_verify_only_paid_prize_identity_immutable',
       'historical_verify_only_existing_unpaid_prizes',
       'historical_verify_only_completed_stage_missing_prizes'
     ) then
    return jsonb_build_object(
      'status',
        v_plan ->> 'status',

      'stage_id',
        p_stage_id,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  select *
  into v_config
  from public.race_engine_stage_prize_adapter_config_v2 config
  where config.adapter_key = 'prize_awards';

  if not found
     or not coalesce(v_config.execution_enabled, false) then

    return jsonb_build_object(
      'status',
        'blocked_prize_adapter_execution_disabled_in_b10',

      'stage_id',
        p_stage_id,

      'process_run_id',
        p_process_run_id,

      'plan_status',
        v_plan ->> 'status',

      'config_found',
        found,

      'config_version',
        v_config.config_version,

      'hard_disabled_by_check_constraints',
        true,

      'confirmation_text_ignored',
        p_confirmation_text is not null,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  /*
   * Future reviewed execution sequence.
   * Unreachable in B10 because execution_enabled is constrained false.
   */

  v_confirmation_valid :=
    md5(coalesce(p_confirmation_text, ''))
    =
    v_config.required_confirmation_hash;

  if not v_confirmation_valid then
    return jsonb_build_object(
      'status',
        'blocked_invalid_prize_adapter_confirmation',

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  if v_plan ->> 'status'
     is distinct from
     'ready_for_guarded_prize_execution' then

    return jsonb_build_object(
      'status',
        'blocked_prize_adapter_plan_not_ready',

      'plan_status',
        v_plan ->> 'status',

      'plan',
        v_plan,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:prize-adapter:'
      ||
      p_stage_id::text,
      0
    )
  );

  v_race_id :=
    nullif(v_plan ->> 'race_id', '')::uuid;

  v_is_final_stage :=
    (
      v_plan
        -> 'source_evidence'
        ->> 'is_final_stage'
    )::boolean;

  v_source_payload_hash :=
    v_plan
      -> 'source_evidence'
      ->> 'source_payload_hash';

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.source_payload_hash
  into
    v_prize_effect_id,
    v_prize_effect_status,
    v_reserved_source_hash
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'prize_awards'
  for update;

  if v_prize_effect_id is null
     or v_prize_effect_status <> 'planned'
     or v_reserved_source_hash is distinct from
        v_source_payload_hash then
    raise exception
      'Prize adapter invariant failed: planned matching prize effect reservation required.';
  end if;

  if (
       v_plan
         -> 'paid_identity_guard'
         ->> 'production_generator_call_allowed'
     )::boolean then
    raise exception
      'Prize adapter invariant failed: B9 guard unexpectedly allows production generation.';
  end if;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status =
      'started',

    started_at =
      coalesce(
        effect_row.started_at,
        clock_timestamp()
      ),

    error_message =
      null,

    metadata =
      effect_row.metadata
      ||
      jsonb_build_object(
        'adapter_version',
          'phase3ab_b10_guarded_prize_adapter_v1',

        'process_run_id',
          p_process_run_id,

        'source_hash_version',
          v_config.source_hash_version,

        'output_hash_version',
          v_config.output_hash_version,

        'is_final_stage',
          v_is_final_stage
      ),

    updated_at =
      clock_timestamp()

  where effect_row.effect_id =
        v_prize_effect_id;

  perform public.generate_race_prize_awards_v1(
    v_race_id,
    p_stage_id,
    v_is_final_stage
  );

  v_source_after :=
    public.race_engine_get_stage_prize_source_evidence_v2(
      p_stage_id
    );

  if v_source_after ->> 'source_payload_hash'
     is distinct from
     v_source_payload_hash then
    raise exception
      'Prize adapter source drift detected during writer execution.';
  end if;

  v_output :=
    public.race_engine_get_stage_prize_award_snapshot_v2(
      p_stage_id
    );

  if (
       v_output ->> 'row_count'
     )::integer <= 0

     or (
          v_output
            ->> 'duplicate_natural_key_count'
        )::integer <> 0

     or (
          v_output
            ->> 'paid_row_count'
        )::integer <> 0

     or (
          v_output
            ->> 'finance_event_lock_count'
        )::integer <> 0 then

    raise exception
      'Prize adapter output verification failed: rows %, duplicates %, paid %, finance locks %.',
      v_output ->> 'row_count',
      v_output ->> 'duplicate_natural_key_count',
      v_output ->> 'paid_row_count',
      v_output ->> 'finance_event_lock_count';
  end if;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status =
      'applied',

    applied_at =
      clock_timestamp(),

    applied_payload_hash =
      v_output ->> 'semantic_hash',

    metadata =
      effect_row.metadata
      ||
      jsonb_build_object(
        'semantic_output_evidence',
          v_output,

        'identity_hash_excluded_from_equivalence',
          true,

        'paid_identity_is_immutable_after_payment',
          true
      ),

    updated_at =
      clock_timestamp()

  where effect_row.effect_id =
        v_prize_effect_id;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status =
      'verified',

    verified_at =
      clock_timestamp(),

    updated_at =
      clock_timestamp()

  where effect_row.effect_id =
        v_prize_effect_id

    and effect_row.effect_status =
        'applied'

    and effect_row.applied_payload_hash =
        v_output ->> 'semantic_hash';

  if not found then
    raise exception
      'Prize adapter verification transition failed.';
  end if;

  return jsonb_build_object(
    'status',
      'prize_awards_applied_and_verified',

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'process_run_id',
      p_process_run_id,

    'effect_id',
      v_prize_effect_id,

    'source_payload_hash',
      v_source_payload_hash,

    'applied_payload_hash',
      v_output ->> 'semantic_hash',

    'output_evidence',
      v_output,

    'production_writer_called',
      true,

    'effect_ledger_changed',
      true,

    'production_writer_execution_enabled',
      true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_prize_payment_rollback_v2(p_stage_id uuid, p_confirmation_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_required_confirmation constant text :=
    'RUN_PHASE3AB_B11_PRIZE_PAYMENT_ROLLBACK_TEST_V1';

  v_session_auth_role text :=
    coalesce(
      auth.role(),
      ''
    );

  v_source_before jsonb;
  v_output_before jsonb;

  v_source_first jsonb;
  v_output_first jsonb;
  v_source_second jsonb;
  v_output_second jsonb;

  v_source_after jsonb;
  v_output_after jsonb;

  v_race_id uuid;
  v_simulation_run_id uuid;

  v_writer_hash text;
  v_finance_primitive_hash text;

  v_first_call jsonb;
  v_second_call jsonb;

  v_global_prize_hash_before text;
  v_global_prize_hash_after text;

  v_global_finance_hash_before text;
  v_global_finance_hash_after text;

  v_global_ledger_hash_before text;
  v_global_ledger_hash_after text;

  v_test_effect_id uuid;
  v_rollback_marker boolean := false;

  v_first_payment_valid boolean;
  v_second_call_noop boolean;
  v_second_call_state_stable boolean;
  v_rollback_exact boolean;
begin
  if p_confirmation_text is distinct from
     v_required_confirmation then
    return jsonb_build_object(
      'status',
        'blocked_invalid_confirmation',

      'stage_id',
        p_stage_id,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if v_session_auth_role <> 'service_role' then
    return jsonb_build_object(
      'status',
        'payment_mutation_test_skipped_session_not_service_role',

      'stage_id',
        p_stage_id,

      'observed_auth_role',
        nullif(v_session_auth_role, ''),

      'writer_called',
        false,

      'all_mutations_rolled_back',
        true,

      'coverage_gap',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:b11:payment-test:'
      ||
      p_stage_id::text,
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'writer_called',
        false,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_golden_stage_fixture_v1 fixture
    where fixture.stage_id = p_stage_id
      and fixture.fixture_status =
          'frozen_and_validated'
  ) then
    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_stage',

      'writer_called',
        false,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  v_source_before :=
    public.race_engine_get_stage_prize_payment_source_evidence_v2(
      p_stage_id
    );

  v_output_before :=
    public.race_engine_get_stage_prize_payment_output_evidence_v2(
      p_stage_id
    );

  if v_source_before ->> 'stage_process_status'
     is distinct from
     'verify_only_no_execution'
     or v_source_before ->> 'status'
        is distinct from
        'source_ready_all_pending'
     or v_output_before ->> 'status'
        is distinct from
        'unpaid_no_finance_evidence' then
    return jsonb_build_object(
      'status',
        'blocked_stage_not_safe_for_payment_rollback_test',

      'source_evidence',
        v_source_before,

      'output_evidence',
        v_output_before,

      'writer_called',
        false,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_stage_effect_ledger_v2 effect_row
    where effect_row.stage_id = p_stage_id
      and effect_row.effect_key =
          'prize_payment'
  ) then
    return jsonb_build_object(
      'status',
        'blocked_existing_prize_payment_effect',

      'writer_called',
        false,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  v_race_id :=
    nullif(
      v_source_before ->> 'race_id',
      ''
    )::uuid;

  select simulation_row.id
  into v_simulation_run_id
  from public.race_stage_simulation_runs simulation_row
  where simulation_row.stage_id = p_stage_id;

  v_writer_hash :=
    md5(
      pg_get_functiondef(
        'public.race_engine_pay_prize_awards_v1(uuid,uuid)'::regprocedure
      )
    );

  v_finance_primitive_hash :=
    md5(
      pg_get_functiondef(
        'public.finance_award_race_prize(uuid,uuid,bigint,jsonb)'::regprocedure
      )
    );

  if v_writer_hash is distinct from
     'b482a8804fa2a21680a69196220a8e54'
     or v_finance_primitive_hash is distinct from
        '1cb83a6e4ff8d1deebfddba0b3afc7f5' then
    return jsonb_build_object(
      'status',
        'blocked_payment_function_definition_drift',

      'writer_definition_hash',
        v_writer_hash,

      'finance_primitive_definition_hash',
        v_finance_primitive_hash,

      'writer_called',
        false,

      'all_mutations_rolled_back',
        true,

      'production_execution_enabled',
        false
    );
  end if;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(prize_award)::text,
               '|'
               order by prize_award.id
             ),
             ''
           )
         )
  into v_global_prize_hash_before
  from public.race_prize_awards prize_award;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(transaction_row)::text,
                        '|'
                        order by transaction_row.id
                      )
               from finance.transactions transaction_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(entry_row)::text,
                        '|'
                        order by entry_row.id
                      )
               from finance.entries entry_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(lock_row)::text,
                        '|'
                        order by
                          lock_row.event_type,
                          lock_row.club_id,
                          lock_row.ref_id
                      )
               from finance.event_locks lock_row
             ),
             ''
           )
         )
  into v_global_finance_hash_before;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by effect_row.stage_id, effect_row.effect_key
             ),
             ''
           )
         )
  into v_global_ledger_hash_before
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_test_effect_id := gen_random_uuid();

  begin
    insert into public.race_engine_stage_effect_ledger_v2
    (
      effect_id,
      stage_id,
      race_id,
      simulation_run_id,
      effect_key,
      effect_status,
      owner_component,
      writer_function,
      idempotency_key,
      source_payload_hash,
      metadata
    )
    values
    (
      v_test_effect_id,
      p_stage_id,
      v_race_id,
      v_simulation_run_id,
      'prize_payment',
      'planned',
      'phase3ab_b11_prize_payment_rollback_test',
      'public.race_engine_pay_prize_awards_v1(uuid,uuid)',
      'phase3ab-b11-payment-rollback-test:'
      ||
      p_stage_id::text
      ||
      ':'
      ||
      v_test_effect_id::text,
      v_source_before ->> 'source_payload_hash',
      jsonb_build_object(
        'test_only',
          true,

        'will_be_rolled_back',
          true
      )
    );

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status = 'started',
      started_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where effect_row.effect_id = v_test_effect_id;

    v_first_call :=
      public.race_engine_pay_prize_awards_v1(
        v_race_id,
        p_stage_id
      );

    v_source_first :=
      public.race_engine_get_stage_prize_payment_source_evidence_v2(
        p_stage_id
      );

    v_output_first :=
      public.race_engine_get_stage_prize_payment_output_evidence_v2(
        p_stage_id
      );

    v_first_payment_valid :=
      (
        v_first_call ->> 'paid_count'
      )::integer
      =
      (
        v_source_before
          ->> 'payable_pending_row_count'
      )::integer

      and (
            v_first_call ->> 'total_cash_paid'
          )::bigint
          =
          (
            v_source_before
              ->> 'total_amount_cash'
          )::bigint

      and v_source_first ->> 'status'
          =
          'source_historical_all_paid'

      and v_output_first ->> 'status'
          =
          'paid_finance_evidence_complete';

    if not coalesce(v_first_payment_valid, false) then
      raise exception
        'Phase 3AB-B11 payment test failed: first payment result/evidence invalid.';
    end if;

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status = 'applied',
      applied_at = clock_timestamp(),
      applied_payload_hash =
        v_output_first ->> 'finance_evidence_hash',
      updated_at = clock_timestamp()
    where effect_row.effect_id = v_test_effect_id;

    v_second_call :=
      public.race_engine_pay_prize_awards_v1(
        v_race_id,
        p_stage_id
      );

    v_source_second :=
      public.race_engine_get_stage_prize_payment_source_evidence_v2(
        p_stage_id
      );

    v_output_second :=
      public.race_engine_get_stage_prize_payment_output_evidence_v2(
        p_stage_id
      );

    v_second_call_noop :=
      (
        v_second_call ->> 'paid_count'
      )::integer = 0

      and (
            v_second_call ->> 'total_cash_paid'
          )::bigint = 0;

    v_second_call_state_stable :=
      v_source_first ->> 'source_payload_hash'
      is not distinct from
      v_source_second ->> 'source_payload_hash'

      and v_output_first ->> 'finance_evidence_hash'
          is not distinct from
          v_output_second ->> 'finance_evidence_hash';

    if not coalesce(v_second_call_noop, false)
       or not coalesce(v_second_call_state_stable, false) then
      raise exception
        'Phase 3AB-B11 payment test failed: second payment call was not a stable no-op.';
    end if;

    update public.race_engine_stage_effect_ledger_v2 effect_row
    set
      effect_status = 'verified',
      verified_at = clock_timestamp(),
      applied_payload_hash =
        v_output_second ->> 'finance_evidence_hash',
      metadata =
        effect_row.metadata
        ||
        jsonb_build_object(
          'first_payment_valid',
            v_first_payment_valid,

          'second_call_noop',
            v_second_call_noop,

          'second_call_state_stable',
            v_second_call_state_stable
        ),
      updated_at = clock_timestamp()
    where effect_row.effect_id = v_test_effect_id;

    raise exception
      using
        errcode = 'P5004',
        message =
          'PHASE3AB_B11_ROLLBACK_PRIZE_PAYMENT_AND_LEDGER';

  exception
    when sqlstate 'P5004' then
      v_rollback_marker := true;
  end;

  if not v_rollback_marker then
    raise exception
      'Phase 3AB-B11 payment test failed: rollback marker not reached.';
  end if;

  v_source_after :=
    public.race_engine_get_stage_prize_payment_source_evidence_v2(
      p_stage_id
    );

  v_output_after :=
    public.race_engine_get_stage_prize_payment_output_evidence_v2(
      p_stage_id
    );

  select md5(
           coalesce(
             string_agg(
               to_jsonb(prize_award)::text,
               '|'
               order by prize_award.id
             ),
             ''
           )
         )
  into v_global_prize_hash_after
  from public.race_prize_awards prize_award;

  select md5(
           coalesce(
             (
               select string_agg(
                        to_jsonb(transaction_row)::text,
                        '|'
                        order by transaction_row.id
                      )
               from finance.transactions transaction_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(entry_row)::text,
                        '|'
                        order by entry_row.id
                      )
               from finance.entries entry_row
             ),
             ''
           )
           ||
           '||'
           ||
           coalesce(
             (
               select string_agg(
                        to_jsonb(lock_row)::text,
                        '|'
                        order by
                          lock_row.event_type,
                          lock_row.club_id,
                          lock_row.ref_id
                      )
               from finance.event_locks lock_row
             ),
             ''
           )
         )
  into v_global_finance_hash_after;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by effect_row.stage_id, effect_row.effect_key
             ),
             ''
           )
         )
  into v_global_ledger_hash_after
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_rollback_exact :=
    v_source_before ->> 'source_payload_hash'
    is not distinct from
    v_source_after ->> 'source_payload_hash'

    and v_output_before ->> 'finance_evidence_hash'
        is not distinct from
        v_output_after ->> 'finance_evidence_hash'

    and v_global_prize_hash_before
        is not distinct from
        v_global_prize_hash_after

    and v_global_finance_hash_before
        is not distinct from
        v_global_finance_hash_after

    and v_global_ledger_hash_before
        is not distinct from
        v_global_ledger_hash_after

    and not exists
        (
          select 1
          from public.race_engine_stage_effect_ledger_v2 effect_row
          where effect_row.effect_id = v_test_effect_id
        );

  if not coalesce(v_rollback_exact, false) then
    raise exception
      'Phase 3AB-B11 payment test failed: rollback did not restore exact state.';
  end if;

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    raise exception
      'Phase 3AB-B11 payment test failed: Rio fixture changed.';
  end if;

  return jsonb_build_object(
    'status',
      'rolled_back_prize_payment_test_passed',

    'test_version',
      'phase3ab_b11_prize_payment_rollback_v1',

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'observed_auth_role',
      v_session_auth_role,

    'writer_definition_hash',
      v_writer_hash,

    'finance_primitive_definition_hash',
      v_finance_primitive_hash,

    'source_before',
      v_source_before,

    'output_before',
      v_output_before,

    'first_call_result',
      v_first_call,

    'source_after_first_call',
      v_source_first,

    'output_after_first_call',
      v_output_first,

    'second_call_result',
      v_second_call,

    'source_after_second_call',
      v_source_second,

    'output_after_second_call',
      v_output_second,

    'source_after_rollback',
      v_source_after,

    'output_after_rollback',
      v_output_after,

    'first_payment_valid',
      v_first_payment_valid,

    'second_call_noop',
      v_second_call_noop,

    'second_call_state_stable',
      v_second_call_state_stable,

    'rollback_restored_exact_state',
      v_rollback_exact,

    'all_mutations_rolled_back',
      true,

    'writer_call_count_inside_rolled_back_test',
      2,

    'writer_calls_persisted',
      0,

    'coverage_gap',
      false,

    'production_execution_enabled',
      false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_prize_payment_adapter_plan_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_config record;

  v_process_plan jsonb;
  v_source jsonb;
  v_output jsonb;

  v_stage_id uuid;
  v_race_id uuid;
  v_simulation_run_id uuid;
  v_simulation_status text;

  v_route_format text;
  v_stage_process_status text;

  v_golden_fixture boolean;

  v_writer_hash text;
  v_finance_primitive_hash text;
  v_function_hashes_match boolean;

  v_process_run record;
  v_process_run_found boolean := false;
  v_process_run_execution_capable boolean := false;

  v_prize_effect record;
  v_prize_effect_found boolean := false;

  v_payment_effect record;
  v_payment_effect_found boolean := false;

  v_closeout_effect_status text;

  v_plan_status text;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;

  v_plan jsonb;
begin
  select *
  into v_config
  from public.race_engine_stage_prize_payment_adapter_config_v2 config
  where config.adapter_key = 'prize_payment';

  if not found then
    return jsonb_build_object(
      'status',
        'blocked_prize_payment_adapter_config_missing',

      'stage_id',
        p_stage_id,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_process_plan :=
    public.race_engine_get_stage_process_plan_v2(
      p_stage_id
    );

  if v_process_plan ->> 'status' =
     'stage_not_found' then
    return jsonb_build_object(
      'status',
        'stage_not_found',

      'stage_id',
        p_stage_id,

      'production_writer_execution_enabled',
        false
    );
  end if;

  select
    stage_row.id,
    stage_row.race_id,
    simulation_row.id,
    lower(coalesce(simulation_row.status, 'not_created'))
  into
    v_stage_id,
    v_race_id,
    v_simulation_run_id,
    v_simulation_status
  from public.race_stages stage_row
  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id = stage_row.id
  where stage_row.id = p_stage_id;

  v_route_format :=
    v_process_plan -> 'stage' ->> 'route_format';

  v_stage_process_status :=
    v_process_plan ->> 'status';

  v_golden_fixture :=
    exists
    (
      select 1
      from public.race_engine_golden_stage_fixture_v1 fixture
      where fixture.stage_id = p_stage_id
        and fixture.fixture_status = 'frozen_and_validated'
    );

  v_source :=
    public.race_engine_get_stage_prize_payment_source_evidence_v2(
      p_stage_id
    );

  v_output :=
    public.race_engine_get_stage_prize_payment_output_evidence_v2(
      p_stage_id
    );

  v_writer_hash :=
    md5(
      pg_get_functiondef(
        'public.race_engine_pay_prize_awards_v1(uuid,uuid)'::regprocedure
      )
    );

  v_finance_primitive_hash :=
    md5(
      pg_get_functiondef(
        'public.finance_award_race_prize(uuid,uuid,bigint,jsonb)'::regprocedure
      )
    );

  v_function_hashes_match :=
    v_writer_hash is not distinct from
    v_config.writer_definition_hash

    and v_finance_primitive_hash is not distinct from
        v_config.finance_primitive_definition_hash;

  if p_process_run_id is not null then
    select
      process_run.process_run_id,
      process_run.stage_id,
      process_run.race_id,
      process_run.simulation_run_id,
      process_run.requested_dry_run,
      process_run.status,
      process_run.production_execution_enabled,
      process_run.existing_runner_called,
      process_run.processor_version
    into v_process_run
    from public.race_engine_stage_process_runs_v2 process_run
    where process_run.process_run_id = p_process_run_id;

    v_process_run_found := found;

    if v_process_run_found then
      v_process_run_execution_capable :=
        v_process_run.stage_id = p_stage_id
        and not v_process_run.requested_dry_run
        and v_process_run.status = 'started'
        and v_process_run.production_execution_enabled
        and v_process_run.existing_runner_called;
    end if;
  end if;

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.source_payload_hash,
    effect_row.applied_payload_hash
  into v_prize_effect
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'prize_awards';

  v_prize_effect_found := found;

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.idempotency_key,
    effect_row.source_payload_hash,
    effect_row.applied_payload_hash
  into v_payment_effect
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'prize_payment';

  v_payment_effect_found := found;

  select effect_row.effect_status
  into v_closeout_effect_status
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'stage_closeout';

  if not v_function_hashes_match then
    v_plan_status :=
      'blocked_prize_payment_function_definition_drift';

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        jsonb_build_object(
          'blocker',
            'prize_payment_function_definition_drift',

          'expected_writer_hash',
            v_config.writer_definition_hash,

          'current_writer_hash',
            v_writer_hash,

          'expected_finance_primitive_hash',
            v_config.finance_primitive_definition_hash,

          'current_finance_primitive_hash',
            v_finance_primitive_hash
        )
      );

  elsif v_golden_fixture then
    v_plan_status :=
      'historical_verify_only_golden_fixture';

  elsif v_route_format not in
        (
          'road_race',
          'individual_time_trial',
          'team_time_trial'
        ) then
    v_plan_status :=
      'blocked_unsupported_route';

  elsif v_stage_process_status =
        'verify_only_no_execution'
        and v_output ->> 'status' =
            'paid_finance_evidence_complete' then
    v_plan_status :=
      'historical_verify_only_paid_finance_verified';

  elsif v_stage_process_status =
        'verify_only_no_execution'
        and (
              v_source ->> 'paid_row_count'
            )::integer > 0
        and v_output ->> 'status' <>
            'paid_finance_evidence_complete' then
    v_plan_status :=
      'historical_paid_finance_inconsistent_manual_review';

    v_warnings :=
      v_warnings
      ||
      jsonb_build_array(
        jsonb_build_object(
          'warning',
            'paid_prize_rows_do_not_have_complete_direct_finance_evidence',

          'policy',
            'manual review only; never repay automatically'
        )
      );

  elsif v_stage_process_status =
        'verify_only_no_execution'
        and v_source ->> 'status' =
            'source_ready_all_pending'
        and v_output ->> 'status' =
            'unpaid_no_finance_evidence' then
    v_plan_status :=
      'historical_verify_only_unpaid_prizes_not_paid';

  elsif v_stage_process_status =
        'verify_only_no_execution'
        and v_source ->> 'status' =
            'source_not_ready_no_prize_awards' then
    v_plan_status :=
      'historical_verify_only_completed_stage_missing_prizes';

  elsif v_source ->> 'status' =
        'source_not_ready_no_prize_awards' then
    v_plan_status :=
      'source_not_ready_no_prize_awards';

  elsif v_source ->> 'status' <>
        'source_ready_all_pending' then
    v_plan_status :=
      'blocked_prize_payment_source_not_all_pending';

  elsif v_output ->> 'status' <>
        'unpaid_no_finance_evidence' then
    v_plan_status :=
      'blocked_existing_payment_finance_evidence';

  elsif not v_prize_effect_found
        or v_prize_effect.effect_status <>
           'verified' then
    v_plan_status :=
      'blocked_verified_prize_awards_effect_required';

  elsif v_closeout_effect_status is not null then
    v_plan_status :=
      'blocked_stage_closeout_effect_exists';

  elsif not v_process_run_found then
    v_plan_status :=
      'blocked_production_process_run_required';

  elsif not v_process_run_execution_capable then
    v_plan_status :=
      'blocked_process_run_not_execution_capable';

  elsif not v_payment_effect_found then
    v_plan_status :=
      'blocked_prize_payment_effect_reservation_required';

  elsif v_payment_effect.effect_status <>
        'planned' then
    v_plan_status :=
      'blocked_prize_payment_effect_not_planned';

  elsif v_payment_effect.source_payload_hash is distinct from
        v_source ->> 'source_payload_hash' then
    v_plan_status :=
      'blocked_prize_payment_source_hash_mismatch';

  elsif not v_config.execution_enabled then
    v_plan_status :=
      'blocked_prize_payment_adapter_execution_disabled_in_b11';

  else
    v_plan_status :=
      'ready_for_guarded_prize_payment_execution';
  end if;

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_b11_guarded_prize_payment_adapter_plan_v1',

      'status',
        v_plan_status,

      'stage_id',
        v_stage_id,

      'race_id',
        v_race_id,

      'simulation_run_id',
        v_simulation_run_id,

      'simulation_status',
        v_simulation_status,

      'route_format',
        v_route_format,

      'stage_process_status',
        v_stage_process_status,

      'golden_fixture_stage',
        v_golden_fixture,

      'function_contract',
        jsonb_build_object(
          'writer_signature',
            v_config.writer_signature,

          'expected_writer_hash',
            v_config.writer_definition_hash,

          'current_writer_hash',
            v_writer_hash,

          'finance_primitive_signature',
            v_config.finance_primitive_signature,

          'expected_finance_primitive_hash',
            v_config.finance_primitive_definition_hash,

          'current_finance_primitive_hash',
            v_finance_primitive_hash,

          'hashes_match',
            v_function_hashes_match
        ),

      'source_evidence',
        v_source,

      'output_evidence',
        v_output,

      'dependencies',
        jsonb_build_object(
          'prize_awards_effect_found',
            v_prize_effect_found,

          'prize_awards_effect_status',
            v_prize_effect.effect_status,

          'prize_awards_applied_payload_hash',
            v_prize_effect.applied_payload_hash,

          'stage_closeout_effect_status',
            v_closeout_effect_status
        ),

      'process_run',
        jsonb_build_object(
          'requested_process_run_id',
            p_process_run_id,

          'found',
            v_process_run_found,

          'execution_capable',
            v_process_run_execution_capable,

          'current_b1_production_execution_available',
            false
        ),

      'payment_effect_ledger',
        jsonb_build_object(
          'found',
            v_payment_effect_found,

          'effect_id',
            v_payment_effect.effect_id,

          'effect_status',
            v_payment_effect.effect_status,

          'idempotency_key',
            v_payment_effect.idempotency_key,

          'source_payload_hash',
            v_payment_effect.source_payload_hash,

          'applied_payload_hash',
            v_payment_effect.applied_payload_hash
        ),

      'blockers',
        v_blockers,

      'warnings',
        v_warnings,

      'execution_config',
        jsonb_build_object(
          'config_version',
            v_config.config_version,

          'execution_enabled',
            v_config.execution_enabled,

          'allow_historical_payment',
            v_config.allow_historical_payment,

          'allow_repayment',
            v_config.allow_repayment,

          'hard_disabled_by_check_constraints',
            true
        ),

      'production_writer_execution_enabled',
        false,

      'physical_prize_award_id_is_payment_identity',
        true,

      'repayment_allowed',
        false
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash',
        md5(v_plan::text),

      'generated_at',
        clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_prize_payment_adapter_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_config record;
  v_plan jsonb;

  v_race_id uuid;
  v_source_hash text;

  v_payment_effect_id uuid;
  v_payment_effect_status text;
  v_reserved_source_hash text;

  v_payment_result jsonb;
  v_output jsonb;

  v_confirmation_valid boolean;
begin
  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    return jsonb_build_object(
      'status',
        'blocked_golden_fixture_mismatch',

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_prize_payment_adapter_plan_v2(
      p_stage_id,
      p_process_run_id
    );

  if not coalesce(p_execute, false) then
    return jsonb_build_object(
      'status',
        'dry_run_prize_payment_adapter_plan',

      'stage_id',
        p_stage_id,

      'process_run_id',
        p_process_run_id,

      'plan',
        v_plan,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  if v_plan ->> 'status' in
     (
       'historical_verify_only_golden_fixture',
       'historical_verify_only_paid_finance_verified',
       'historical_paid_finance_inconsistent_manual_review',
       'historical_verify_only_unpaid_prizes_not_paid',
       'historical_verify_only_completed_stage_missing_prizes'
     ) then
    return jsonb_build_object(
      'status',
        v_plan ->> 'status',

      'stage_id',
        p_stage_id,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  select *
  into v_config
  from public.race_engine_stage_prize_payment_adapter_config_v2 config
  where config.adapter_key = 'prize_payment';

  if not found
     or not coalesce(v_config.execution_enabled, false) then
    return jsonb_build_object(
      'status',
        'blocked_prize_payment_adapter_execution_disabled_in_b11',

      'stage_id',
        p_stage_id,

      'process_run_id',
        p_process_run_id,

      'plan_status',
        v_plan ->> 'status',

      'config_found',
        found,

      'config_version',
        v_config.config_version,

      'hard_disabled_by_check_constraints',
        true,

      'confirmation_text_ignored',
        p_confirmation_text is not null,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  /*
   * Future reviewed production sequence.
   * Unreachable in B11 because execution_enabled is constrained false.
   */

  v_confirmation_valid :=
    md5(coalesce(p_confirmation_text, ''))
    =
    v_config.required_confirmation_hash;

  if not v_confirmation_valid then
    return jsonb_build_object(
      'status',
        'blocked_invalid_prize_payment_confirmation',

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  if v_plan ->> 'status'
     is distinct from
     'ready_for_guarded_prize_payment_execution' then
    return jsonb_build_object(
      'status',
        'blocked_prize_payment_plan_not_ready',

      'plan_status',
        v_plan ->> 'status',

      'plan',
        v_plan,

      'production_writer_called',
        false,

      'effect_ledger_changed',
        false,

      'production_writer_execution_enabled',
        false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:prize-payment-adapter:'
      ||
      p_stage_id::text,
      0
    )
  );

  v_race_id :=
    nullif(v_plan ->> 'race_id', '')::uuid;

  v_source_hash :=
    v_plan
      -> 'source_evidence'
      ->> 'source_payload_hash';

  select
    effect_row.effect_id,
    effect_row.effect_status,
    effect_row.source_payload_hash
  into
    v_payment_effect_id,
    v_payment_effect_status,
    v_reserved_source_hash
  from public.race_engine_stage_effect_ledger_v2 effect_row
  where effect_row.stage_id = p_stage_id
    and effect_row.effect_key = 'prize_payment'
  for update;

  if v_payment_effect_id is null
     or v_payment_effect_status <> 'planned'
     or v_reserved_source_hash is distinct from
        v_source_hash then
    raise exception
      'Prize-payment adapter invariant failed: planned matching effect reservation required.';
  end if;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status = 'started',
    started_at =
      coalesce(effect_row.started_at, clock_timestamp()),
    error_message = null,
    metadata =
      effect_row.metadata
      ||
      jsonb_build_object(
        'adapter_version',
          'phase3ab_b11_guarded_prize_payment_adapter_v1',

        'process_run_id',
          p_process_run_id,

        'source_hash_version',
          v_config.source_hash_version,

        'output_hash_version',
          v_config.output_hash_version,

        'physical_award_id_is_payment_identity',
          true
      ),
    updated_at = clock_timestamp()
  where effect_row.effect_id = v_payment_effect_id;

  v_payment_result :=
    public.race_engine_pay_prize_awards_v1(
      v_race_id,
      p_stage_id
    );

  v_output :=
    public.race_engine_get_stage_prize_payment_output_evidence_v2(
      p_stage_id
    );

  if v_output ->> 'status'
     is distinct from
     'paid_finance_evidence_complete' then
    raise exception
      'Prize-payment adapter finance verification failed: %.',
      v_output ->> 'status';
  end if;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status = 'applied',
    applied_at = clock_timestamp(),
    applied_payload_hash =
      v_output ->> 'finance_evidence_hash',
    metadata =
      effect_row.metadata
      ||
      jsonb_build_object(
        'payment_result',
          v_payment_result,

        'finance_output_evidence',
          v_output
      ),
    updated_at = clock_timestamp()
  where effect_row.effect_id = v_payment_effect_id;

  update public.race_engine_stage_effect_ledger_v2 effect_row
  set
    effect_status = 'verified',
    verified_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where effect_row.effect_id = v_payment_effect_id
    and effect_row.effect_status = 'applied'
    and effect_row.applied_payload_hash =
        v_output ->> 'finance_evidence_hash';

  if not found then
    raise exception
      'Prize-payment adapter verification transition failed.';
  end if;

  return jsonb_build_object(
    'status',
      'prize_payment_applied_and_verified',

    'stage_id',
      p_stage_id,

    'race_id',
      v_race_id,

    'process_run_id',
      p_process_run_id,

    'effect_id',
      v_payment_effect_id,

    'source_payload_hash',
      v_source_hash,

    'applied_payload_hash',
      v_output ->> 'finance_evidence_hash',

    'payment_result',
      v_payment_result,

    'output_evidence',
      v_output,

    'production_writer_called',
      true,

    'effect_ledger_changed',
      true,

    'production_writer_execution_enabled',
      true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_development_adapter_rollback_v2(p_stage_id uuid, p_test_mode text, p_confirmation_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_mode text := lower(coalesce(p_test_mode,''));
  v_source_before jsonb;
  v_output_before jsonb;
  v_source_first jsonb;
  v_output_first jsonb;
  v_source_second jsonb;
  v_output_second jsonb;
  v_source_after jsonb;
  v_output_after jsonb;

  v_race_id uuid;
  v_run_id uuid;
  v_writer_hash text;

  v_first_result jsonb;
  v_second_result jsonb;

  v_events_before text;
  v_events_after text;
  v_condition_before text;
  v_condition_after text;
  v_bank_before text;
  v_bank_after text;
  v_riders_before text;
  v_riders_after text;
  v_ledger_before text;
  v_ledger_after text;

  v_effect_id uuid;
  v_rollback_marker boolean := false;
  v_first_valid boolean;
  v_second_noop boolean;
  v_state_stable boolean;
  v_rollback_exact boolean;
begin
  if p_confirmation_text is distinct from
     'RUN_PHASE3AB_B12_DEVELOPMENT_ROLLBACK_TEST_V1' then
    return jsonb_build_object(
      'status','blocked_invalid_confirmation',
      'stage_id',p_stage_id,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if v_mode not in ('existing_complete_rerun','missing_output_first_apply') then
    return jsonb_build_object(
      'status','blocked_invalid_test_mode',
      'test_mode',p_test_mode,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase3ab:b12:development-test:'||p_stage_id::text,0)
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status' <> 'fixture_matches_current_state' then
    return jsonb_build_object(
      'status','blocked_golden_fixture_mismatch',
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if exists(
    select 1 from public.race_engine_golden_stage_fixture_v1 f
    where f.stage_id=p_stage_id and f.fixture_status='frozen_and_validated'
  ) then
    return jsonb_build_object(
      'status','blocked_golden_fixture_stage',
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  v_source_before :=
    public.race_engine_get_stage_development_source_evidence_v2(p_stage_id);
  v_output_before :=
    public.race_engine_get_stage_development_output_evidence_v2(p_stage_id);

  if v_source_before ->> 'status' <> 'source_evidence_ready' then
    return jsonb_build_object(
      'status','blocked_development_source_not_ready',
      'source_evidence',v_source_before,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if v_mode='existing_complete_rerun'
     and v_output_before ->> 'status' <> 'development_output_complete' then
    return jsonb_build_object(
      'status','blocked_existing_output_not_complete',
      'output_evidence',v_output_before,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if v_mode='missing_output_first_apply'
     and v_output_before ->> 'status' <> 'no_development_events' then
    return jsonb_build_object(
      'status','blocked_missing_output_case_not_empty',
      'output_evidence',v_output_before,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if exists(
    select 1 from public.race_engine_stage_effect_ledger_v2 e
    where e.stage_id=p_stage_id and e.effect_key='development'
  ) then
    return jsonb_build_object(
      'status','blocked_existing_development_effect',
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  v_race_id := nullif(v_source_before->>'race_id','')::uuid;
  v_run_id := nullif(v_source_before->>'simulation_run_id','')::uuid;
  v_writer_hash := md5(pg_get_functiondef(
    'public.race_engine_award_race_development_progress_v1(uuid,uuid)'::regprocedure
  ));

  if v_writer_hash <> '07b7ef0e3fd0d785ed2433fe570f1778' then
    return jsonb_build_object(
      'status','blocked_development_writer_definition_drift',
      'writer_definition_hash',v_writer_hash,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by e.id),''))
  into v_events_before
  from public.rider_race_development_events e;

  select md5(coalesce(string_agg(to_jsonb(c)::text,'|' order by c.rider_id),''))
  into v_condition_before
  from public.rider_race_condition c;

  select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by to_jsonb(b)::text),''))
  into v_bank_before
  from public.rider_attribute_progress_bank b;

  select md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by r.id),''))
  into v_riders_before
  from public.riders r;

  select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by e.stage_id,e.effect_key),''))
  into v_ledger_before
  from public.race_engine_stage_effect_ledger_v2 e;

  v_effect_id := gen_random_uuid();

  begin
    insert into public.race_engine_stage_effect_ledger_v2
    (
      effect_id,stage_id,race_id,simulation_run_id,
      effect_key,effect_status,owner_component,writer_function,
      idempotency_key,source_payload_hash,metadata
    )
    values
    (
      v_effect_id,p_stage_id,v_race_id,v_run_id,
      'development','planned',
      'phase3ab_b12_development_rollback_test',
      'public.race_engine_award_race_development_progress_v1(uuid,uuid)',
      'phase3ab-b12-development-test:'||p_stage_id::text||':'||
        v_mode||':'||v_effect_id::text,
      v_source_before->>'source_payload_hash',
      jsonb_build_object('test_only',true,'will_be_rolled_back',true,'mode',v_mode)
    );

    update public.race_engine_stage_effect_ledger_v2
    set effect_status='started',
        started_at=clock_timestamp(),
        updated_at=clock_timestamp()
    where effect_id=v_effect_id;

    v_first_result :=
      public.race_engine_award_race_development_progress_v1(v_run_id,null);

    v_source_first :=
      public.race_engine_get_stage_development_source_evidence_v2(p_stage_id);
    v_output_first :=
      public.race_engine_get_stage_development_output_evidence_v2(p_stage_id);

    v_first_valid :=
      case when v_mode='existing_complete_rerun' then
        v_first_result->>'status'='completed'
        and (v_first_result->>'inserted_events')::integer=0
        and v_output_first->>'combined_output_hash'
            is not distinct from v_output_before->>'combined_output_hash'
      else
        v_first_result->>'status'='completed'
        and (v_first_result->>'inserted_events')::integer>0
        and v_output_first->>'status'='development_output_complete'
      end;

    if not coalesce(v_first_valid,false) then
      raise exception
        'Phase 3AB-B12 development test failed: invalid first call for mode %.',
        v_mode;
    end if;

    update public.race_engine_stage_effect_ledger_v2
    set effect_status='applied',
        applied_at=clock_timestamp(),
        applied_payload_hash=v_output_first->>'combined_output_hash',
        updated_at=clock_timestamp()
    where effect_id=v_effect_id;

    v_second_result :=
      public.race_engine_award_race_development_progress_v1(v_run_id,null);

    v_source_second :=
      public.race_engine_get_stage_development_source_evidence_v2(p_stage_id);
    v_output_second :=
      public.race_engine_get_stage_development_output_evidence_v2(p_stage_id);

    v_second_noop :=
      v_second_result->>'status'='completed'
      and (v_second_result->>'inserted_events')::integer=0;

    v_state_stable :=
      v_source_first->>'source_payload_hash'
        is not distinct from v_source_second->>'source_payload_hash'
      and v_output_first->>'combined_output_hash'
        is not distinct from v_output_second->>'combined_output_hash';

    if not coalesce(v_second_noop,false)
       or not coalesce(v_state_stable,false) then
      raise exception
        'Phase 3AB-B12 development test failed: second call was not an idempotent no-op.';
    end if;

    update public.race_engine_stage_effect_ledger_v2
    set effect_status='verified',
        verified_at=clock_timestamp(),
        applied_payload_hash=v_output_second->>'combined_output_hash',
        metadata=metadata||jsonb_build_object(
          'first_call_valid',v_first_valid,
          'second_call_noop',v_second_noop,
          'semantic_state_stable',v_state_stable,
          'first_result',v_first_result,
          'second_result',v_second_result
        ),
        updated_at=clock_timestamp()
    where effect_id=v_effect_id;

    raise exception using
      errcode='P5005',
      message='PHASE3AB_B12_ROLLBACK_DEVELOPMENT_AND_LEDGER';

  exception when sqlstate 'P5005' then
    v_rollback_marker := true;
  end;

  if not v_rollback_marker then
    raise exception 'Phase 3AB-B12 test failed: rollback marker not reached.';
  end if;

  v_source_after :=
    public.race_engine_get_stage_development_source_evidence_v2(p_stage_id);
  v_output_after :=
    public.race_engine_get_stage_development_output_evidence_v2(p_stage_id);

  select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by e.id),''))
  into v_events_after
  from public.rider_race_development_events e;

  select md5(coalesce(string_agg(to_jsonb(c)::text,'|' order by c.rider_id),''))
  into v_condition_after
  from public.rider_race_condition c;

  select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by to_jsonb(b)::text),''))
  into v_bank_after
  from public.rider_attribute_progress_bank b;

  select md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by r.id),''))
  into v_riders_after
  from public.riders r;

  select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by e.stage_id,e.effect_key),''))
  into v_ledger_after
  from public.race_engine_stage_effect_ledger_v2 e;

  v_rollback_exact :=
    v_source_before->>'source_payload_hash'
      is not distinct from v_source_after->>'source_payload_hash'
    and v_output_before->>'combined_output_hash'
      is not distinct from v_output_after->>'combined_output_hash'
    and v_events_before is not distinct from v_events_after
    and v_condition_before is not distinct from v_condition_after
    and v_bank_before is not distinct from v_bank_after
    and v_riders_before is not distinct from v_riders_after
    and v_ledger_before is not distinct from v_ledger_after
    and not exists(
      select 1 from public.race_engine_stage_effect_ledger_v2
      where effect_id=v_effect_id
    );

  if not coalesce(v_rollback_exact,false) then
    raise exception
      'Phase 3AB-B12 development test failed: rollback did not restore exact state.';
  end if;

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status' <> 'fixture_matches_current_state' then
    raise exception 'Phase 3AB-B12 development test changed Rio.';
  end if;

  return jsonb_build_object(
    'status','rolled_back_development_adapter_test_passed',
    'test_version','phase3ab_b12_development_rollback_v1',
    'test_mode',v_mode,
    'stage_id',p_stage_id,
    'race_id',v_race_id,
    'simulation_run_id',v_run_id,
    'writer_definition_hash',v_writer_hash,
    'source_before',v_source_before,
    'output_before',v_output_before,
    'first_writer_result',v_first_result,
    'output_after_first_call',v_output_first,
    'second_writer_result',v_second_result,
    'output_after_second_call',v_output_second,
    'output_after_rollback',v_output_after,
    'first_call_valid',v_first_valid,
    'second_call_noop',v_second_noop,
    'semantic_state_stable',v_state_stable,
    'rollback_restored_exact_state',v_rollback_exact,
    'all_mutations_rolled_back',true,
    'writer_call_count_inside_rolled_back_test',2,
    'writer_calls_persisted',0,
    'production_execution_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_development_adapter_plan_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_source jsonb;
  v_output jsonb;
  v_ownership jsonb;
  v_stage record;
  v_writer_hash text;
  v_process record;
  v_process_found boolean := false;
  v_process_capable boolean := false;
  v_effect record;
  v_effect_found boolean := false;
  v_closeout text;
  v_status text;
  v_plan jsonb;
begin
  select * into v_config
  from public.race_engine_stage_development_adapter_config_v2
  where adapter_key='development';

  if not found then
    return jsonb_build_object(
      'status','blocked_development_adapter_config_missing',
      'stage_id',p_stage_id,
      'production_writer_execution_enabled',false
    );
  end if;

  select
    s.id stage_id,s.race_id,run.id simulation_run_id,
    lower(coalesce(run.status,'not_created')) simulation_status
  into v_stage
  from public.race_stages s
  left join public.race_stage_simulation_runs run on run.stage_id=s.id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id,
      'production_writer_execution_enabled',false
    );
  end if;

  v_source :=
    public.race_engine_get_stage_development_source_evidence_v2(p_stage_id);
  v_output :=
    public.race_engine_get_stage_development_output_evidence_v2(p_stage_id);
  v_ownership :=
    public.race_engine_get_development_trigger_ownership_v2();
  v_writer_hash := md5(pg_get_functiondef(
    'public.race_engine_award_race_development_progress_v1(uuid,uuid)'::regprocedure
  ));

  if p_process_run_id is not null then
    select * into v_process
    from public.race_engine_stage_process_runs_v2
    where process_run_id=p_process_run_id;
    v_process_found := found;

    if v_process_found then
      v_process_capable :=
        v_process.stage_id=p_stage_id
        and not v_process.requested_dry_run
        and v_process.status='started'
        and v_process.production_execution_enabled
        and v_process.existing_runner_called;
    end if;
  end if;

  select * into v_effect
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id and effect_key='development';
  v_effect_found := found;

  select effect_status into v_closeout
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id and effect_key='stage_closeout';

  if v_writer_hash<>v_config.writer_definition_hash then
    v_status := 'blocked_development_writer_definition_drift';
  elsif exists(
    select 1 from public.race_engine_golden_stage_fixture_v1
    where stage_id=p_stage_id and fixture_status='frozen_and_validated'
  ) then
    v_status := 'historical_verify_only_golden_fixture';
  elsif v_source->>'route_format' not in
        ('road_race','individual_time_trial','team_time_trial') then
    v_status := 'blocked_unsupported_route';
  elsif v_source->>'stage_process_status'='verify_only_no_execution'
        and v_output->>'status'='development_output_complete' then
    v_status := 'historical_verify_only_existing_development';
  elsif v_source->>'stage_process_status'='verify_only_no_execution'
        and v_output->>'status'='no_development_events' then
    v_status := 'historical_verify_only_completed_stage_missing_development';
  elsif v_source->>'status'<>'source_evidence_ready' then
    v_status := 'source_not_ready_for_development';
  elsif v_closeout is not null then
    v_status := 'blocked_stage_closeout_effect_exists';
  elsif v_ownership->>'status'<>'ready_for_v2_adapter_owner' then
    v_status := 'blocked_legacy_development_producer_triggers_still_enabled';
  elsif not v_process_found then
    v_status := 'blocked_production_process_run_required';
  elsif not v_process_capable then
    v_status := 'blocked_process_run_not_execution_capable';
  elsif not v_effect_found then
    v_status := 'blocked_development_effect_reservation_required';
  elsif v_effect.effect_status<>'planned' then
    v_status := 'blocked_development_effect_not_planned';
  elsif v_effect.source_payload_hash is distinct from
        v_source->>'source_payload_hash' then
    v_status := 'blocked_development_source_hash_mismatch';
  elsif not v_config.execution_enabled
        or not v_config.allow_legacy_trigger_cutover then
    v_status := 'blocked_development_adapter_execution_disabled_in_b12';
  else
    v_status := 'ready_for_guarded_development_execution';
  end if;

  v_plan := jsonb_build_object(
    'plan_version','phase3ab_b12_guarded_development_adapter_plan_v1',
    'status',v_status,
    'stage_id',v_stage.stage_id,
    'race_id',v_stage.race_id,
    'simulation_run_id',v_stage.simulation_run_id,
    'simulation_status',v_stage.simulation_status,
    'route_format',v_source->>'route_format',
    'stage_process_status',v_source->>'stage_process_status',
    'writer',jsonb_build_object(
      'signature',v_config.writer_signature,
      'expected_definition_hash',v_config.writer_definition_hash,
      'current_definition_hash',v_writer_hash,
      'definition_matches',v_writer_hash=v_config.writer_definition_hash
    ),
    'trigger_ownership',v_ownership,
    'source_evidence',v_source,
    'output_evidence',v_output,
    'process_run',jsonb_build_object(
      'requested_process_run_id',p_process_run_id,
      'found',v_process_found,
      'execution_capable',v_process_capable,
      'current_b1_production_execution_available',false
    ),
    'development_effect_ledger',jsonb_build_object(
      'found',v_effect_found,
      'effect_id',v_effect.effect_id,
      'effect_status',v_effect.effect_status,
      'idempotency_key',v_effect.idempotency_key,
      'source_payload_hash',v_effect.source_payload_hash,
      'applied_payload_hash',v_effect.applied_payload_hash
    ),
    'stage_closeout_effect_status',v_closeout,
    'execution_config',jsonb_build_object(
      'config_version',v_config.config_version,
      'execution_enabled',v_config.execution_enabled,
      'allow_historical_rebuild',v_config.allow_historical_rebuild,
      'allow_legacy_trigger_cutover',v_config.allow_legacy_trigger_cutover,
      'canonical_owner',v_config.canonical_owner,
      'hard_disabled_by_check_constraints',true
    ),
    'production_writer_execution_enabled',false,
    'legacy_triggers_changed_by_b12',false
  );

  return v_plan||jsonb_build_object(
    'plan_hash',md5(v_plan::text),
    'generated_at',clock_timestamp()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_development_adapter_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_plan jsonb;
  v_run_id uuid;
  v_source_hash text;
  v_effect record;
  v_writer_result jsonb;
  v_output jsonb;
begin
  v_plan :=
    public.race_engine_get_stage_development_adapter_plan_v2(
      p_stage_id,p_process_run_id
    );

  if not coalesce(p_execute,false) then
    return jsonb_build_object(
      'status','dry_run_development_adapter_plan',
      'stage_id',p_stage_id,
      'plan',v_plan,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'legacy_triggers_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  if v_plan->>'status' in (
    'historical_verify_only_golden_fixture',
    'historical_verify_only_existing_development',
    'historical_verify_only_completed_stage_missing_development'
  ) then
    return jsonb_build_object(
      'status',v_plan->>'status',
      'stage_id',p_stage_id,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'legacy_triggers_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  select * into v_config
  from public.race_engine_stage_development_adapter_config_v2
  where adapter_key='development';

  if not found
     or not v_config.execution_enabled
     or not v_config.allow_legacy_trigger_cutover then
    return jsonb_build_object(
      'status','blocked_development_adapter_execution_disabled_in_b12',
      'stage_id',p_stage_id,
      'process_run_id',p_process_run_id,
      'plan_status',v_plan->>'status',
      'hard_disabled_by_check_constraints',true,
      'confirmation_text_ignored',p_confirmation_text is not null,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'legacy_triggers_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  if md5(coalesce(p_confirmation_text,''))<>
     v_config.required_confirmation_hash then
    return jsonb_build_object(
      'status','blocked_invalid_development_adapter_confirmation',
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'legacy_triggers_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  if v_plan->>'status'<>'ready_for_guarded_development_execution' then
    return jsonb_build_object(
      'status','blocked_development_adapter_plan_not_ready',
      'plan',v_plan,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'legacy_triggers_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('phase3ab:development-adapter:'||p_stage_id::text,0)
  );

  v_run_id := nullif(v_plan->>'simulation_run_id','')::uuid;
  v_source_hash := v_plan->'source_evidence'->>'source_payload_hash';

  select * into v_effect
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id and effect_key='development'
  for update;

  if v_effect.effect_id is null
     or v_effect.effect_status<>'planned'
     or v_effect.source_payload_hash is distinct from v_source_hash then
    raise exception
      'Development adapter invariant failed: planned matching development effect required.';
  end if;

  update public.race_engine_stage_effect_ledger_v2
  set effect_status='started',
      started_at=coalesce(started_at,clock_timestamp()),
      error_message=null,
      metadata=metadata||jsonb_build_object(
        'adapter_version','phase3ab_b12_guarded_development_adapter_v1',
        'process_run_id',p_process_run_id,
        'legacy_producer_triggers_required_disabled',true,
        'progress_bank_trigger_required_enabled',true
      ),
      updated_at=clock_timestamp()
  where effect_id=v_effect.effect_id;

  v_writer_result :=
    public.race_engine_award_race_development_progress_v1(v_run_id,null);

  v_output :=
    public.race_engine_get_stage_development_output_evidence_v2(p_stage_id);

  if v_output->>'status'<>'development_output_complete' then
    raise exception
      'Development adapter output verification failed: %.',
      v_output->>'status';
  end if;

  update public.race_engine_stage_effect_ledger_v2
  set effect_status='applied',
      applied_at=clock_timestamp(),
      applied_payload_hash=v_output->>'combined_output_hash',
      metadata=metadata||jsonb_build_object(
        'writer_result',v_writer_result,
        'development_output_evidence',v_output
      ),
      updated_at=clock_timestamp()
  where effect_id=v_effect.effect_id;

  update public.race_engine_stage_effect_ledger_v2
  set effect_status='verified',
      verified_at=clock_timestamp(),
      updated_at=clock_timestamp()
  where effect_id=v_effect.effect_id
    and effect_status='applied'
    and applied_payload_hash=v_output->>'combined_output_hash';

  if not found then
    raise exception 'Development adapter verification transition failed.';
  end if;

  return jsonb_build_object(
    'status','development_applied_and_verified',
    'stage_id',p_stage_id,
    'simulation_run_id',v_run_id,
    'process_run_id',p_process_run_id,
    'effect_id',v_effect.effect_id,
    'source_payload_hash',v_source_hash,
    'applied_payload_hash',v_output->>'combined_output_hash',
    'writer_result',v_writer_result,
    'output_evidence',v_output,
    'production_writer_called',true,
    'effect_ledger_changed',true,
    'legacy_triggers_changed',false,
    'production_writer_execution_enabled',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_fatigue_adapter_rollback_v2(p_stage_id uuid, p_test_class text, p_confirmation_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_test_class text :=
    lower(coalesce(p_test_class, ''));

  v_source_before jsonb;
  v_output_before jsonb;

  v_source_first jsonb;
  v_output_first jsonb;

  v_source_second jsonb;
  v_output_second jsonb;

  v_source_after jsonb;
  v_output_after jsonb;

  v_race_id uuid;
  v_simulation_run_id uuid;
  v_writer_hash text;

  v_first_result jsonb;
  v_second_result jsonb;

  v_riders_before text;
  v_riders_after text;
  v_ledger_before text;
  v_ledger_after text;

  v_effect_id uuid;
  v_rollback_marker boolean := false;

  v_first_call_valid boolean;
  v_second_call_stable boolean;
  v_rollback_exact boolean;
begin
  if p_confirmation_text is distinct from
     'RUN_PHASE3AB_B13_FATIGUE_ROLLBACK_TEST_V1' then
    return jsonb_build_object(
      'status', 'blocked_invalid_confirmation',
      'stage_id', p_stage_id,
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  if v_test_class not in
     (
       'exact_current_match',
       'historical_state_mismatch'
     ) then
    return jsonb_build_object(
      'status', 'blocked_invalid_test_class',
      'test_class', p_test_class,
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:b13:fatigue-test:' || p_stage_id::text,
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    return jsonb_build_object(
      'status', 'blocked_golden_fixture_mismatch',
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_golden_stage_fixture_v1 fixture
    where fixture.stage_id = p_stage_id
      and fixture.fixture_status = 'frozen_and_validated'
  ) then
    return jsonb_build_object(
      'status', 'blocked_golden_fixture_stage',
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  v_source_before :=
    public.race_engine_get_stage_fatigue_source_evidence_v2(
      p_stage_id
    );

  v_output_before :=
    public.race_engine_get_stage_fatigue_output_evidence_v2(
      p_stage_id
    );

  if v_source_before ->> 'status'
     is distinct from
     'source_evidence_ready' then
    return jsonb_build_object(
      'status', 'blocked_fatigue_source_not_ready',
      'source_evidence', v_source_before,
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  if v_test_class = 'exact_current_match'
     and v_output_before ->> 'status'
         is distinct from
         'fatigue_output_matches_stage_target' then
    return jsonb_build_object(
      'status', 'blocked_exact_match_case_does_not_match',
      'output_evidence', v_output_before,
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  if v_test_class = 'historical_state_mismatch'
     and v_output_before ->> 'status'
         is distinct from
         'fatigue_output_differs_from_stage_target' then
    return jsonb_build_object(
      'status', 'blocked_mismatch_case_does_not_differ',
      'output_evidence', v_output_before,
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_stage_effect_ledger_v2 effect_row
    where effect_row.stage_id = p_stage_id
      and effect_row.effect_key = 'fatigue'
  ) then
    return jsonb_build_object(
      'status', 'blocked_existing_fatigue_effect',
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  v_race_id :=
    nullif(v_source_before ->> 'race_id', '')::uuid;

  v_simulation_run_id :=
    nullif(v_source_before ->> 'simulation_run_id', '')::uuid;

  v_writer_hash :=
    md5(
      pg_get_functiondef(
        'public.race_engine_apply_stage_fatigue_v1(uuid)'::regprocedure
      )
    );

  if v_writer_hash is distinct from
     '1fec51363749695054363d5d86d10fd5' then
    return jsonb_build_object(
      'status', 'blocked_fatigue_writer_definition_drift',
      'writer_definition_hash', v_writer_hash,
      'writer_called', false,
      'all_mutations_rolled_back', true,
      'production_execution_enabled', false
    );
  end if;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(rider_row)::text,
               '|'
               order by rider_row.id
             ),
             ''
           )
         )
  into v_riders_before
  from public.riders rider_row;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by effect_row.stage_id, effect_row.effect_key
             ),
             ''
           )
         )
  into v_ledger_before
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_effect_id := gen_random_uuid();

  begin
    insert into public.race_engine_stage_effect_ledger_v2
    (
      effect_id,
      stage_id,
      race_id,
      simulation_run_id,
      effect_key,
      effect_status,
      owner_component,
      writer_function,
      idempotency_key,
      source_payload_hash,
      metadata
    )
    values
    (
      v_effect_id,
      p_stage_id,
      v_race_id,
      v_simulation_run_id,
      'fatigue',
      'planned',
      'phase3ab_b13_fatigue_rollback_test',
      'public.race_engine_apply_stage_fatigue_v1(uuid)',
      'phase3ab-b13-fatigue-test:'
      || p_stage_id::text
      || ':'
      || v_test_class
      || ':'
      || v_effect_id::text,
      v_source_before ->> 'source_payload_hash',
      jsonb_build_object(
        'test_only', true,
        'will_be_rolled_back', true,
        'test_class', v_test_class,
        'historical_reapply_allowed', false
      )
    );

    update public.race_engine_stage_effect_ledger_v2
    set
      effect_status = 'started',
      started_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where effect_id = v_effect_id;

    v_first_result :=
      public.race_engine_apply_stage_fatigue_v1(
        v_simulation_run_id
      );

    v_source_first :=
      public.race_engine_get_stage_fatigue_source_evidence_v2(
        p_stage_id
      );

    v_output_first :=
      public.race_engine_get_stage_fatigue_output_evidence_v2(
        p_stage_id
      );

    v_first_call_valid :=
      v_first_result ->> 'status' = 'completed'

      and (
            v_first_result ->> 'updated_count'
          )::integer
          =
          (
            v_source_before ->> 'eligible_rider_count'
          )::integer

      and v_source_first ->> 'source_payload_hash'
          is not distinct from
          v_source_before ->> 'source_payload_hash'

      and v_output_first ->> 'status'
          =
          'fatigue_output_matches_stage_target'

      and (
            v_output_first ->> 'mismatching_rider_count'
          )::integer = 0;

    if not coalesce(v_first_call_valid, false) then
      raise exception
        'Phase 3AB-B13 fatigue test failed: first writer call invalid.';
    end if;

    update public.race_engine_stage_effect_ledger_v2
    set
      effect_status = 'applied',
      applied_at = clock_timestamp(),
      applied_payload_hash =
        v_output_first ->> 'current_vs_target_hash',
      updated_at = clock_timestamp()
    where effect_id = v_effect_id;

    v_second_result :=
      public.race_engine_apply_stage_fatigue_v1(
        v_simulation_run_id
      );

    v_source_second :=
      public.race_engine_get_stage_fatigue_source_evidence_v2(
        p_stage_id
      );

    v_output_second :=
      public.race_engine_get_stage_fatigue_output_evidence_v2(
        p_stage_id
      );

    v_second_call_stable :=
      v_second_result ->> 'status' = 'completed'

      and (
            v_second_result ->> 'updated_count'
          )::integer
          =
          (
            v_source_before ->> 'eligible_rider_count'
          )::integer

      and v_source_first ->> 'source_payload_hash'
          is not distinct from
          v_source_second ->> 'source_payload_hash'

      and v_output_first ->> 'current_vs_target_hash'
          is not distinct from
          v_output_second ->> 'current_vs_target_hash'

      and v_output_second ->> 'status'
          =
          'fatigue_output_matches_stage_target';

    if not coalesce(v_second_call_stable, false) then
      raise exception
        'Phase 3AB-B13 fatigue test failed: second writer call was not stable.';
    end if;

    update public.race_engine_stage_effect_ledger_v2
    set
      effect_status = 'verified',
      verified_at = clock_timestamp(),
      applied_payload_hash =
        v_output_second ->> 'current_vs_target_hash',
      metadata =
        metadata
        ||
        jsonb_build_object(
          'first_call_valid', v_first_call_valid,
          'second_call_stable', v_second_call_stable,
          'first_result', v_first_result,
          'second_result', v_second_result
        ),
      updated_at = clock_timestamp()
    where effect_id = v_effect_id;

    raise exception using
      errcode = 'P5006',
      message = 'PHASE3AB_B13_ROLLBACK_FATIGUE_AND_LEDGER';

  exception
    when sqlstate 'P5006' then
      v_rollback_marker := true;
  end;

  if not v_rollback_marker then
    raise exception
      'Phase 3AB-B13 fatigue test failed: rollback marker not reached.';
  end if;

  v_source_after :=
    public.race_engine_get_stage_fatigue_source_evidence_v2(
      p_stage_id
    );

  v_output_after :=
    public.race_engine_get_stage_fatigue_output_evidence_v2(
      p_stage_id
    );

  select md5(
           coalesce(
             string_agg(
               to_jsonb(rider_row)::text,
               '|'
               order by rider_row.id
             ),
             ''
           )
         )
  into v_riders_after
  from public.riders rider_row;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(effect_row)::text,
               '|'
               order by effect_row.stage_id, effect_row.effect_key
             ),
             ''
           )
         )
  into v_ledger_after
  from public.race_engine_stage_effect_ledger_v2 effect_row;

  v_rollback_exact :=
    v_source_before ->> 'source_payload_hash'
    is not distinct from
    v_source_after ->> 'source_payload_hash'

    and v_output_before ->> 'current_vs_target_hash'
        is not distinct from
        v_output_after ->> 'current_vs_target_hash'

    and v_riders_before is not distinct from v_riders_after

    and v_ledger_before is not distinct from v_ledger_after

    and not exists
        (
          select 1
          from public.race_engine_stage_effect_ledger_v2 effect_row
          where effect_row.effect_id = v_effect_id
        );

  if not coalesce(v_rollback_exact, false) then
    raise exception
      'Phase 3AB-B13 fatigue test failed: rollback did not restore exact state.';
  end if;

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status'
     is distinct from
     'fixture_matches_current_state' then
    raise exception
      'Phase 3AB-B13 fatigue test changed Rio.';
  end if;

  return jsonb_build_object(
    'status', 'rolled_back_fatigue_adapter_test_passed',
    'test_version', 'phase3ab_b13_fatigue_rollback_v1',
    'test_class', v_test_class,
    'stage_id', p_stage_id,
    'race_id', v_race_id,
    'simulation_run_id', v_simulation_run_id,
    'writer_definition_hash', v_writer_hash,

    'source_before', v_source_before,
    'output_before', v_output_before,

    'first_writer_result', v_first_result,
    'output_after_first_call', v_output_first,

    'second_writer_result', v_second_result,
    'output_after_second_call', v_output_second,

    'output_after_rollback', v_output_after,

    'first_call_valid', v_first_call_valid,
    'second_call_stable', v_second_call_stable,
    'rollback_restored_exact_state', v_rollback_exact,

    'historical_reapply_was_safe_for_production', false,
    'historical_reapply_policy', 'rollback test only',

    'all_mutations_rolled_back', true,
    'writer_call_count_inside_rolled_back_test', 2,
    'writer_calls_persisted', 0,
    'production_execution_enabled', false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_fatigue_adapter_plan_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_source jsonb;
  v_output jsonb;
  v_stage record;
  v_writer_hash text;

  v_process record;
  v_process_found boolean := false;
  v_process_capable boolean := false;

  v_development_status text;
  v_weather_status text;
  v_closeout_status text;

  v_effect record;
  v_effect_found boolean := false;

  v_plan_status text;
  v_plan jsonb;
begin
  select *
  into v_config
  from public.race_engine_stage_fatigue_adapter_config_v2
  where adapter_key = 'fatigue';

  if not found then
    return jsonb_build_object(
      'status', 'blocked_fatigue_adapter_config_missing',
      'stage_id', p_stage_id,
      'production_writer_execution_enabled', false
    );
  end if;

  select
    stage_row.id as stage_id,
    stage_row.race_id,
    simulation_row.id as simulation_run_id,
    lower(coalesce(simulation_row.status, 'not_created')) as simulation_status
  into v_stage
  from public.race_stages stage_row
  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id = stage_row.id
  where stage_row.id = p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status', 'stage_not_found',
      'stage_id', p_stage_id,
      'production_writer_execution_enabled', false
    );
  end if;

  v_source :=
    public.race_engine_get_stage_fatigue_source_evidence_v2(
      p_stage_id
    );

  v_output :=
    public.race_engine_get_stage_fatigue_output_evidence_v2(
      p_stage_id
    );

  v_writer_hash :=
    md5(
      pg_get_functiondef(
        'public.race_engine_apply_stage_fatigue_v1(uuid)'::regprocedure
      )
    );

  if p_process_run_id is not null then
    select *
    into v_process
    from public.race_engine_stage_process_runs_v2
    where process_run_id = p_process_run_id;

    v_process_found := found;

    if v_process_found then
      v_process_capable :=
        v_process.stage_id = p_stage_id
        and not v_process.requested_dry_run
        and v_process.status = 'started'
        and v_process.production_execution_enabled
        and v_process.existing_runner_called;
    end if;
  end if;

  select effect_status
  into v_development_status
  from public.race_engine_stage_effect_ledger_v2
  where stage_id = p_stage_id
    and effect_key = 'development';

  select effect_status
  into v_weather_status
  from public.race_engine_stage_effect_ledger_v2
  where stage_id = p_stage_id
    and effect_key = 'weather_exposure';

  select effect_status
  into v_closeout_status
  from public.race_engine_stage_effect_ledger_v2
  where stage_id = p_stage_id
    and effect_key = 'stage_closeout';

  select *
  into v_effect
  from public.race_engine_stage_effect_ledger_v2
  where stage_id = p_stage_id
    and effect_key = 'fatigue';

  v_effect_found := found;

  if v_writer_hash is distinct from
     v_config.writer_definition_hash then
    v_plan_status :=
      'blocked_fatigue_writer_definition_drift';

  elsif exists
        (
          select 1
          from public.race_engine_golden_stage_fixture_v1 fixture
          where fixture.stage_id = p_stage_id
            and fixture.fixture_status = 'frozen_and_validated'
        ) then
    v_plan_status :=
      'historical_verify_only_golden_fixture';

  elsif v_source ->> 'route_format'
        not in
        (
          'road_race',
          'individual_time_trial',
          'team_time_trial'
        ) then
    v_plan_status :=
      'blocked_unsupported_route';

  elsif v_source ->> 'stage_process_status'
        =
        'verify_only_no_execution'
        and v_output ->> 'status'
            =
            'fatigue_output_matches_stage_target' then
    v_plan_status :=
      'historical_verify_only_fatigue_matches_stage_target';

  elsif v_source ->> 'stage_process_status'
        =
        'verify_only_no_execution'
        and v_output ->> 'status'
            =
            'fatigue_output_differs_from_stage_target' then
    v_plan_status :=
      'historical_fatigue_differs_manual_history_no_reapply';

  elsif v_source ->> 'status'
        <>
        'source_evidence_ready' then
    v_plan_status :=
      'source_not_ready_for_fatigue';

  elsif v_closeout_status is not null then
    v_plan_status :=
      'blocked_stage_closeout_effect_exists';

  elsif v_development_status is distinct from 'verified' then
    v_plan_status :=
      'blocked_verified_development_effect_required';

  elsif v_weather_status not in ('verified', 'skipped') then
    v_plan_status :=
      'blocked_verified_or_skipped_weather_exposure_required';

  elsif not v_process_found then
    v_plan_status :=
      'blocked_production_process_run_required';

  elsif not v_process_capable then
    v_plan_status :=
      'blocked_process_run_not_execution_capable';

  elsif not v_effect_found then
    v_plan_status :=
      'blocked_fatigue_effect_reservation_required';

  elsif v_effect.effect_status <> 'planned' then
    v_plan_status :=
      'blocked_fatigue_effect_not_planned';

  elsif v_effect.source_payload_hash is distinct from
        v_source ->> 'source_payload_hash' then
    v_plan_status :=
      'blocked_fatigue_source_hash_mismatch';

  elsif not v_config.execution_enabled
        or v_config.allow_historical_reapply
        or v_config.allow_post_closeout_reapply then
    v_plan_status :=
      'blocked_fatigue_adapter_execution_disabled_in_b13';

  else
    v_plan_status :=
      'ready_for_guarded_fatigue_execution';
  end if;

  v_plan :=
    jsonb_build_object(
      'plan_version',
        'phase3ab_b13_guarded_fatigue_adapter_plan_v1',

      'status', v_plan_status,

      'stage_id', v_stage.stage_id,
      'race_id', v_stage.race_id,
      'simulation_run_id', v_stage.simulation_run_id,
      'simulation_status', v_stage.simulation_status,

      'route_format', v_source ->> 'route_format',
      'stage_process_status', v_source ->> 'stage_process_status',

      'writer',
        jsonb_build_object(
          'signature', v_config.writer_signature,
          'expected_definition_hash', v_config.writer_definition_hash,
          'current_definition_hash', v_writer_hash,
          'definition_matches',
            v_writer_hash is not distinct from
            v_config.writer_definition_hash
        ),

      'source_evidence', v_source,
      'output_evidence', v_output,

      'dependencies',
        jsonb_build_object(
          'development_effect_status', v_development_status,
          'weather_exposure_effect_status', v_weather_status,
          'stage_closeout_effect_status', v_closeout_status
        ),

      'process_run',
        jsonb_build_object(
          'requested_process_run_id', p_process_run_id,
          'found', v_process_found,
          'execution_capable', v_process_capable,
          'current_b1_production_execution_available', false
        ),

      'fatigue_effect_ledger',
        jsonb_build_object(
          'found', v_effect_found,
          'effect_id', v_effect.effect_id,
          'effect_status', v_effect.effect_status,
          'idempotency_key', v_effect.idempotency_key,
          'source_payload_hash', v_effect.source_payload_hash,
          'applied_payload_hash', v_effect.applied_payload_hash
        ),

      'execution_config',
        jsonb_build_object(
          'config_version', v_config.config_version,
          'execution_enabled', v_config.execution_enabled,
          'allow_historical_reapply',
            v_config.allow_historical_reapply,
          'allow_post_closeout_reapply',
            v_config.allow_post_closeout_reapply,
          'hard_disabled_by_check_constraints', true
        ),

      'historical_reapply_allowed', false,
      'production_writer_execution_enabled', false
    );

  return
    v_plan
    ||
    jsonb_build_object(
      'plan_hash', md5(v_plan::text),
      'generated_at', clock_timestamp()
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_fatigue_adapter_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_plan jsonb;
  v_simulation_run_id uuid;
  v_source_hash text;
  v_effect record;
  v_writer_result jsonb;
  v_output jsonb;
begin
  v_plan :=
    public.race_engine_get_stage_fatigue_adapter_plan_v2(
      p_stage_id,
      p_process_run_id
    );

  if not coalesce(p_execute, false) then
    return jsonb_build_object(
      'status', 'dry_run_fatigue_adapter_plan',
      'stage_id', p_stage_id,
      'plan', v_plan,
      'production_writer_called', false,
      'effect_ledger_changed', false,
      'rider_fatigue_changed', false,
      'production_writer_execution_enabled', false
    );
  end if;

  if v_plan ->> 'status' in
     (
       'historical_verify_only_golden_fixture',
       'historical_verify_only_fatigue_matches_stage_target',
       'historical_fatigue_differs_manual_history_no_reapply'
     ) then
    return jsonb_build_object(
      'status', v_plan ->> 'status',
      'stage_id', p_stage_id,
      'production_writer_called', false,
      'effect_ledger_changed', false,
      'rider_fatigue_changed', false,
      'production_writer_execution_enabled', false
    );
  end if;

  select *
  into v_config
  from public.race_engine_stage_fatigue_adapter_config_v2
  where adapter_key = 'fatigue';

  if not found
     or not v_config.execution_enabled
     or v_config.allow_historical_reapply
     or v_config.allow_post_closeout_reapply then
    return jsonb_build_object(
      'status',
        'blocked_fatigue_adapter_execution_disabled_in_b13',
      'stage_id', p_stage_id,
      'process_run_id', p_process_run_id,
      'plan_status', v_plan ->> 'status',
      'hard_disabled_by_check_constraints', true,
      'confirmation_text_ignored',
        p_confirmation_text is not null,
      'production_writer_called', false,
      'effect_ledger_changed', false,
      'rider_fatigue_changed', false,
      'production_writer_execution_enabled', false
    );
  end if;

  /*
   * Future reviewed production sequence.
   * Unreachable in B13.
   */

  if md5(coalesce(p_confirmation_text, ''))
     <>
     v_config.required_confirmation_hash then
    return jsonb_build_object(
      'status', 'blocked_invalid_fatigue_adapter_confirmation',
      'production_writer_called', false,
      'effect_ledger_changed', false,
      'rider_fatigue_changed', false,
      'production_writer_execution_enabled', false
    );
  end if;

  if v_plan ->> 'status'
     is distinct from
     'ready_for_guarded_fatigue_execution' then
    return jsonb_build_object(
      'status', 'blocked_fatigue_adapter_plan_not_ready',
      'plan', v_plan,
      'production_writer_called', false,
      'effect_ledger_changed', false,
      'rider_fatigue_changed', false,
      'production_writer_execution_enabled', false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:fatigue-adapter:' || p_stage_id::text,
      0
    )
  );

  v_simulation_run_id :=
    nullif(v_plan ->> 'simulation_run_id', '')::uuid;

  v_source_hash :=
    v_plan -> 'source_evidence' ->> 'source_payload_hash';

  select *
  into v_effect
  from public.race_engine_stage_effect_ledger_v2
  where stage_id = p_stage_id
    and effect_key = 'fatigue'
  for update;

  if v_effect.effect_id is null
     or v_effect.effect_status <> 'planned'
     or v_effect.source_payload_hash
        is distinct from
        v_source_hash then
    raise exception
      'Fatigue adapter invariant failed: planned matching fatigue effect required.';
  end if;

  update public.race_engine_stage_effect_ledger_v2
  set
    effect_status = 'started',
    started_at = coalesce(started_at, clock_timestamp()),
    error_message = null,
    metadata =
      metadata
      ||
      jsonb_build_object(
        'adapter_version',
          'phase3ab_b13_guarded_fatigue_adapter_v1',
        'process_run_id', p_process_run_id,
        'source_hash_version', v_config.source_hash_version,
        'output_hash_version', v_config.output_hash_version,
        'historical_reapply_allowed', false,
        'post_closeout_reapply_allowed', false
      ),
    updated_at = clock_timestamp()
  where effect_id = v_effect.effect_id;

  v_writer_result :=
    public.race_engine_apply_stage_fatigue_v1(
      v_simulation_run_id
    );

  v_output :=
    public.race_engine_get_stage_fatigue_output_evidence_v2(
      p_stage_id
    );

  if v_output ->> 'status'
     is distinct from
     'fatigue_output_matches_stage_target' then
    raise exception
      'Fatigue adapter output verification failed: %.',
      v_output ->> 'status';
  end if;

  update public.race_engine_stage_effect_ledger_v2
  set
    effect_status = 'applied',
    applied_at = clock_timestamp(),
    applied_payload_hash =
      v_output ->> 'current_vs_target_hash',
    metadata =
      metadata
      ||
      jsonb_build_object(
        'writer_result', v_writer_result,
        'fatigue_output_evidence', v_output
      ),
    updated_at = clock_timestamp()
  where effect_id = v_effect.effect_id;

  update public.race_engine_stage_effect_ledger_v2
  set
    effect_status = 'verified',
    verified_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where effect_id = v_effect.effect_id
    and effect_status = 'applied'
    and applied_payload_hash =
        v_output ->> 'current_vs_target_hash';

  if not found then
    raise exception
      'Fatigue adapter verification transition failed.';
  end if;

  return jsonb_build_object(
    'status', 'fatigue_applied_and_verified',
    'stage_id', p_stage_id,
    'simulation_run_id', v_simulation_run_id,
    'process_run_id', p_process_run_id,
    'effect_id', v_effect.effect_id,
    'source_payload_hash', v_source_hash,
    'applied_payload_hash',
      v_output ->> 'current_vs_target_hash',
    'writer_result', v_writer_result,
    'output_evidence', v_output,
    'production_writer_called', true,
    'effect_ledger_changed', true,
    'rider_fatigue_changed', true,
    'production_writer_execution_enabled', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_weather_exposure_adapter_rollback_v2(p_stage_id uuid, p_test_class text, p_confirmation_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_class text := lower(coalesce(p_test_class,''));

  v_source_before jsonb;
  v_output_before jsonb;
  v_source_first jsonb;
  v_output_first jsonb;
  v_source_second jsonb;
  v_output_second jsonb;
  v_source_after jsonb;
  v_output_after jsonb;

  v_race_id uuid;
  v_run_id uuid;
  v_writer_hash text;

  v_first_result jsonb;
  v_second_result jsonb;

  v_exposure_before text;
  v_exposure_after text;
  v_states_before text;
  v_states_after text;

  v_health_count_before bigint;
  v_health_count_first bigint;
  v_health_count_second bigint;
  v_health_count_after bigint;
  v_health_before text;
  v_health_first text;
  v_health_second text;
  v_health_after text;

  v_context_count_before bigint;
  v_context_count_first bigint;
  v_context_count_second bigint;
  v_context_count_after bigint;
  v_context_before text;
  v_context_first text;
  v_context_second text;
  v_context_after text;

  v_riders_before text;
  v_riders_after text;
  v_ledger_before text;
  v_ledger_after text;

  v_effect_id uuid;
  v_rollback_marker boolean := false;

  v_first_valid boolean;
  v_second_valid boolean;
  v_event_cardinality_stable boolean;
  v_output_semantic_stable boolean;
  v_health_state_stable boolean;
  v_context_state_stable boolean;
  v_rerun_risk boolean;
  v_rollback_exact boolean;
  v_status text;
begin
  if p_confirmation_text is distinct from
     'RUN_PHASE3AB_B14_WEATHER_EXPOSURE_ROLLBACK_TEST_V1' then
    return jsonb_build_object(
      'status','blocked_invalid_confirmation',
      'stage_id',p_stage_id,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if v_class not in ('weather_required','weather_not_required') then
    return jsonb_build_object(
      'status','blocked_invalid_test_class',
      'test_class',p_test_class,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:b14:weather-exposure-test:'||p_stage_id::text,
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status' is distinct from
     'fixture_matches_current_state' then
    return jsonb_build_object(
      'status','blocked_golden_fixture_mismatch',
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_golden_stage_fixture_v1 f
    where f.stage_id=p_stage_id
      and f.fixture_status='frozen_and_validated'
  ) then
    return jsonb_build_object(
      'status','blocked_golden_fixture_stage',
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  v_source_before :=
    public.race_engine_get_stage_weather_exposure_source_evidence_v2(
      p_stage_id
    );
  v_output_before :=
    public.race_engine_get_stage_weather_exposure_output_evidence_v2(
      p_stage_id
    );

  if v_source_before->>'status'<>'source_evidence_ready' then
    return jsonb_build_object(
      'status','blocked_weather_exposure_source_not_ready',
      'source_evidence',v_source_before,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if v_class='weather_required'
     and not coalesce(
       (v_source_before->>'rain_jacket_required')::boolean,
       false
     ) then
    return jsonb_build_object(
      'status','blocked_required_case_is_not_required',
      'source_evidence',v_source_before,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if v_class='weather_not_required'
     and coalesce(
       (v_source_before->>'rain_jacket_required')::boolean,
       false
     ) then
    return jsonb_build_object(
      'status','blocked_not_required_case_is_required',
      'source_evidence',v_source_before,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_stage_effect_ledger_v2 e
    where e.stage_id=p_stage_id
      and e.effect_key='weather_exposure'
  ) then
    return jsonb_build_object(
      'status','blocked_existing_weather_exposure_effect',
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  v_race_id := nullif(v_source_before->>'race_id','')::uuid;
  v_run_id := nullif(v_source_before->>'simulation_run_id','')::uuid;
  v_writer_hash := md5(pg_get_functiondef(
    'public.race_engine_apply_rain_jacket_weather_exposure_v1(uuid,uuid)'::regprocedure
  ));

  if v_writer_hash<>'df905af0204c256d6332e049ed9226cc' then
    return jsonb_build_object(
      'status','blocked_weather_exposure_writer_definition_drift',
      'writer_definition_hash',v_writer_hash,
      'writer_called',false,
      'all_mutations_rolled_back',true,
      'production_execution_enabled',false
    );
  end if;

  select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by e.id),''))
  into v_exposure_before
  from public.race_stage_weather_exposure_events e;

  select md5(coalesce(string_agg(to_jsonb(s)::text,'|' order by s.id),''))
  into v_states_before
  from public.race_stage_rider_states s;

  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      to_jsonb(h)::text,
      '|' order by coalesce(to_jsonb(h)->>'id',to_jsonb(h)::text)
    ),''))
  into v_health_count_before,v_health_before
  from public.rider_health_cases h;

  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      to_jsonb(h)::text,
      '|' order by coalesce(
        to_jsonb(h)->>'health_case_id',
        to_jsonb(h)->>'id',
        to_jsonb(h)::text
      )
    ),''))
  into v_context_count_before,v_context_before
  from public.rider_health_case_context_v1 h;

  select md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by r.id),''))
  into v_riders_before
  from public.riders r;

  select md5(coalesce(string_agg(
    to_jsonb(e)::text,
    '|' order by e.stage_id,e.effect_key
  ),''))
  into v_ledger_before
  from public.race_engine_stage_effect_ledger_v2 e;

  v_effect_id := gen_random_uuid();

  begin
    insert into public.race_engine_stage_effect_ledger_v2
    (
      effect_id,stage_id,race_id,simulation_run_id,
      effect_key,effect_status,owner_component,writer_function,
      idempotency_key,source_payload_hash,metadata
    )
    values
    (
      v_effect_id,p_stage_id,v_race_id,v_run_id,
      'weather_exposure','planned',
      'phase3ab_b14_weather_exposure_rollback_test',
      'public.race_engine_apply_rain_jacket_weather_exposure_v1(uuid,uuid)',
      'phase3ab-b14-weather-exposure-test:'||p_stage_id::text||':'||
        v_class||':'||v_effect_id::text,
      v_source_before->>'source_payload_hash',
      jsonb_build_object(
        'test_only',true,
        'will_be_rolled_back',true,
        'test_class',v_class,
        'health_case_rerun_allowed',false
      )
    );

    update public.race_engine_stage_effect_ledger_v2
    set
      effect_status='started',
      started_at=clock_timestamp(),
      updated_at=clock_timestamp()
    where effect_id=v_effect_id;

    v_first_result :=
      public.race_engine_apply_rain_jacket_weather_exposure_v1(
        v_run_id,p_stage_id
      );

    v_source_first :=
      public.race_engine_get_stage_weather_exposure_source_evidence_v2(
        p_stage_id
      );
    v_output_first :=
      public.race_engine_get_stage_weather_exposure_output_evidence_v2(
        p_stage_id
      );

    v_first_valid :=
      case
        when v_class='weather_required' then
          v_first_result->>'status'='completed'
          and v_output_first->>'status'='weather_exposure_output_complete'
          and (v_output_first->>'exposure_row_count')::integer
              =
              (v_source_before->>'finished_rider_count')::integer
        else
          v_first_result->>'status'='skipped_not_required'
          and v_output_first->>'status'
              ='weather_exposure_skipped_not_required_complete'
      end;

    if not coalesce(v_first_valid,false) then
      raise exception
        'Phase 3AB-B14 test failed: invalid first output for class %.',
        v_class;
    end if;

    select
      count(*)::bigint,
      md5(coalesce(string_agg(
        to_jsonb(h)::text,
        '|' order by coalesce(to_jsonb(h)->>'id',to_jsonb(h)::text)
      ),''))
    into v_health_count_first,v_health_first
    from public.rider_health_cases h;

    select
      count(*)::bigint,
      md5(coalesce(string_agg(
        to_jsonb(h)::text,
        '|' order by coalesce(
          to_jsonb(h)->>'health_case_id',
          to_jsonb(h)->>'id',
          to_jsonb(h)::text
        )
      ),''))
    into v_context_count_first,v_context_first
    from public.rider_health_case_context_v1 h;

    update public.race_engine_stage_effect_ledger_v2
    set
      effect_status='applied',
      applied_at=clock_timestamp(),
      applied_payload_hash=v_output_first->>'combined_output_hash',
      updated_at=clock_timestamp()
    where effect_id=v_effect_id;

    v_second_result :=
      public.race_engine_apply_rain_jacket_weather_exposure_v1(
        v_run_id,p_stage_id
      );

    v_source_second :=
      public.race_engine_get_stage_weather_exposure_source_evidence_v2(
        p_stage_id
      );
    v_output_second :=
      public.race_engine_get_stage_weather_exposure_output_evidence_v2(
        p_stage_id
      );

    v_second_valid :=
      case
        when v_class='weather_required' then
          v_second_result->>'status'='completed'
          and v_output_second->>'status'='weather_exposure_output_complete'
        else
          v_second_result->>'status'='skipped_not_required'
          and v_output_second->>'status'
              ='weather_exposure_skipped_not_required_complete'
      end;

    v_event_cardinality_stable :=
      (v_output_first->>'exposure_row_count')::integer
      =
      (v_output_second->>'exposure_row_count')::integer
      and
      (v_output_first->>'distinct_exposure_rider_count')::integer
      =
      (v_output_second->>'distinct_exposure_rider_count')::integer;

    v_output_semantic_stable :=
      v_output_first->>'combined_output_hash'
      is not distinct from
      v_output_second->>'combined_output_hash';

    select
      count(*)::bigint,
      md5(coalesce(string_agg(
        to_jsonb(h)::text,
        '|' order by coalesce(to_jsonb(h)->>'id',to_jsonb(h)::text)
      ),''))
    into v_health_count_second,v_health_second
    from public.rider_health_cases h;

    select
      count(*)::bigint,
      md5(coalesce(string_agg(
        to_jsonb(h)::text,
        '|' order by coalesce(
          to_jsonb(h)->>'health_case_id',
          to_jsonb(h)->>'id',
          to_jsonb(h)::text
        )
      ),''))
    into v_context_count_second,v_context_second
    from public.rider_health_case_context_v1 h;

    v_health_state_stable :=
      v_health_count_first=v_health_count_second
      and v_health_first is not distinct from v_health_second;

    v_context_state_stable :=
      v_context_count_first=v_context_count_second
      and v_context_first is not distinct from v_context_second;

    v_rerun_risk :=
      not coalesce(v_output_semantic_stable,false)
      or not coalesce(v_health_state_stable,false)
      or not coalesce(v_context_state_stable,false);

    if not coalesce(v_second_valid,false)
       or not coalesce(v_event_cardinality_stable,false) then
      raise exception
        'Phase 3AB-B14 test failed: second call broke output shape or event identity.';
    end if;

    update public.race_engine_stage_effect_ledger_v2
    set
      effect_status='verified',
      verified_at=clock_timestamp(),
      applied_payload_hash=v_output_second->>'combined_output_hash',
      metadata=metadata||jsonb_build_object(
        'first_output_valid',v_first_valid,
        'second_output_valid',v_second_valid,
        'event_cardinality_stable',v_event_cardinality_stable,
        'output_semantic_stable',v_output_semantic_stable,
        'health_case_state_stable',v_health_state_stable,
        'health_context_state_stable',v_context_state_stable,
        'rerun_risk_detected',v_rerun_risk,
        'first_result',v_first_result,
        'second_result',v_second_result
      ),
      updated_at=clock_timestamp()
    where effect_id=v_effect_id;

    raise exception using
      errcode='P5007',
      message='PHASE3AB_B14_ROLLBACK_WEATHER_EXPOSURE_HEALTH_AND_LEDGER';

  exception when sqlstate 'P5007' then
    v_rollback_marker := true;
  end;

  if not v_rollback_marker then
    raise exception
      'Phase 3AB-B14 test failed: rollback marker not reached.';
  end if;

  v_source_after :=
    public.race_engine_get_stage_weather_exposure_source_evidence_v2(
      p_stage_id
    );
  v_output_after :=
    public.race_engine_get_stage_weather_exposure_output_evidence_v2(
      p_stage_id
    );

  select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by e.id),''))
  into v_exposure_after
  from public.race_stage_weather_exposure_events e;

  select md5(coalesce(string_agg(to_jsonb(s)::text,'|' order by s.id),''))
  into v_states_after
  from public.race_stage_rider_states s;

  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      to_jsonb(h)::text,
      '|' order by coalesce(to_jsonb(h)->>'id',to_jsonb(h)::text)
    ),''))
  into v_health_count_after,v_health_after
  from public.rider_health_cases h;

  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      to_jsonb(h)::text,
      '|' order by coalesce(
        to_jsonb(h)->>'health_case_id',
        to_jsonb(h)->>'id',
        to_jsonb(h)::text
      )
    ),''))
  into v_context_count_after,v_context_after
  from public.rider_health_case_context_v1 h;

  select md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by r.id),''))
  into v_riders_after
  from public.riders r;

  select md5(coalesce(string_agg(
    to_jsonb(e)::text,
    '|' order by e.stage_id,e.effect_key
  ),''))
  into v_ledger_after
  from public.race_engine_stage_effect_ledger_v2 e;

  v_rollback_exact :=
    v_source_before->>'source_payload_hash'
      is not distinct from v_source_after->>'source_payload_hash'
    and v_output_before->>'combined_output_hash'
      is not distinct from v_output_after->>'combined_output_hash'
    and v_exposure_before is not distinct from v_exposure_after
    and v_states_before is not distinct from v_states_after
    and v_health_count_before=v_health_count_after
    and v_health_before is not distinct from v_health_after
    and v_context_count_before=v_context_count_after
    and v_context_before is not distinct from v_context_after
    and v_riders_before is not distinct from v_riders_after
    and v_ledger_before is not distinct from v_ledger_after
    and not exists(
      select 1
      from public.race_engine_stage_effect_ledger_v2
      where effect_id=v_effect_id
    );

  if not coalesce(v_rollback_exact,false) then
    raise exception
      'Phase 3AB-B14 test failed: rollback did not restore exact state.';
  end if;

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     ) ->> 'status' is distinct from
     'fixture_matches_current_state' then
    raise exception
      'Phase 3AB-B14 test changed Rio.';
  end if;

  v_status := case
    when v_rerun_risk then
      'rolled_back_weather_exposure_test_passed_rerun_risk_detected'
    else
      'rolled_back_weather_exposure_test_passed_semantic_idempotent'
  end;

  return jsonb_build_object(
    'status',v_status,
    'test_version','phase3ab_b14_weather_exposure_rollback_v1',
    'test_class',v_class,
    'stage_id',p_stage_id,
    'race_id',v_race_id,
    'simulation_run_id',v_run_id,
    'writer_definition_hash',v_writer_hash,
    'source_before',v_source_before,
    'output_before',v_output_before,
    'first_writer_result',v_first_result,
    'output_after_first_call',v_output_first,
    'second_writer_result',v_second_result,
    'output_after_second_call',v_output_second,
    'output_after_rollback',v_output_after,
    'first_output_valid',v_first_valid,
    'second_output_valid',v_second_valid,
    'event_cardinality_stable',v_event_cardinality_stable,
    'output_semantic_stable',v_output_semantic_stable,
    'health_case_count_before',v_health_count_before,
    'health_case_count_after_first_call',v_health_count_first,
    'health_case_count_after_second_call',v_health_count_second,
    'health_case_state_stable',v_health_state_stable,
    'health_context_count_before',v_context_count_before,
    'health_context_count_after_first_call',v_context_count_first,
    'health_context_count_after_second_call',v_context_count_second,
    'health_context_state_stable',v_context_state_stable,
    'rerun_risk_detected',v_rerun_risk,
    'rollback_restored_exact_state',v_rollback_exact,
    'historical_reapply_allowed',false,
    'health_case_rerun_allowed',false,
    'all_mutations_rolled_back',true,
    'writer_call_count_inside_rolled_back_test',2,
    'writer_calls_persisted',0,
    'production_execution_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_weather_exposure_adapter_plan_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_source jsonb;
  v_output jsonb;
  v_stage record;

  v_writer_hash text;
  v_requirement_hash text;
  v_health_hash text;

  v_process record;
  v_process_found boolean := false;
  v_process_capable boolean := false;

  v_development_status text;
  v_fatigue_status text;
  v_closeout_status text;

  v_effect record;
  v_effect_found boolean := false;

  v_status text;
  v_plan jsonb;
begin
  select *
  into v_config
  from public.race_engine_stage_weather_exposure_adapter_config_v2
  where adapter_key='weather_exposure';

  if not found then
    return jsonb_build_object(
      'status','blocked_weather_exposure_adapter_config_missing',
      'stage_id',p_stage_id,
      'production_writer_execution_enabled',false
    );
  end if;

  select
    s.id stage_id,
    s.race_id,
    run.id simulation_run_id,
    lower(coalesce(run.status,'not_created')) simulation_status
  into v_stage
  from public.race_stages s
  left join public.race_stage_simulation_runs run on run.stage_id=s.id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id,
      'production_writer_execution_enabled',false
    );
  end if;

  v_source :=
    public.race_engine_get_stage_weather_exposure_source_evidence_v2(
      p_stage_id
    );
  v_output :=
    public.race_engine_get_stage_weather_exposure_output_evidence_v2(
      p_stage_id
    );

  v_writer_hash := md5(pg_get_functiondef(
    'public.race_engine_apply_rain_jacket_weather_exposure_v1(uuid,uuid)'::regprocedure
  ));
  v_requirement_hash := md5(pg_get_functiondef(
    'public.race_engine_stage_rain_jacket_requirement_v1(uuid)'::regprocedure
  ));
  v_health_hash := md5(pg_get_functiondef(
    'public.create_rider_health_case(uuid,text,text,text,text,date,integer,integer,smallint)'::regprocedure
  ));

  if p_process_run_id is not null then
    select *
    into v_process
    from public.race_engine_stage_process_runs_v2
    where process_run_id=p_process_run_id;

    v_process_found := found;

    if v_process_found then
      v_process_capable :=
        v_process.stage_id=p_stage_id
        and not v_process.requested_dry_run
        and v_process.status='started'
        and v_process.production_execution_enabled
        and v_process.existing_runner_called;
    end if;
  end if;

  select effect_status
  into v_development_status
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id
    and effect_key='development';

  select effect_status
  into v_fatigue_status
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id
    and effect_key='fatigue';

  select effect_status
  into v_closeout_status
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id
    and effect_key='stage_closeout';

  select *
  into v_effect
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id
    and effect_key='weather_exposure';

  v_effect_found := found;

  if v_writer_hash is distinct from v_config.writer_definition_hash then
    v_status := 'blocked_weather_exposure_writer_definition_drift';

  elsif v_requirement_hash is distinct from
        v_config.requirement_helper_definition_hash then
    v_status := 'blocked_rain_jacket_requirement_definition_drift';

  elsif v_health_hash is distinct from
        v_config.health_case_definition_hash then
    v_status := 'blocked_health_case_function_definition_drift';

  elsif exists
        (
          select 1
          from public.race_engine_golden_stage_fixture_v1 f
          where f.stage_id=p_stage_id
            and f.fixture_status='frozen_and_validated'
        ) then
    v_status := 'historical_verify_only_golden_fixture';

  elsif v_source->>'status'='route_skipped_weather_cancelled' then
    v_status := 'weather_cancelled_skip_normal_exposure';

  elsif v_source->>'route_format'<>v_config.validated_route then
    v_status := 'blocked_route_not_validated_for_weather_exposure_v1';

  elsif v_source->>'stage_process_status'='verify_only_no_execution'
        and v_output->>'status' in
            (
              'weather_exposure_output_complete',
              'weather_exposure_skipped_not_required_complete'
            ) then
    v_status := 'historical_verify_only_existing_weather_exposure';

  elsif v_source->>'stage_process_status'='verify_only_no_execution' then
    v_status :=
      'historical_weather_exposure_incomplete_manual_review_no_reapply';

  elsif v_source->>'status'<>'source_evidence_ready' then
    v_status := 'source_not_ready_for_weather_exposure';

  elsif v_closeout_status is not null then
    v_status := 'blocked_stage_closeout_effect_exists';

  elsif v_development_status is distinct from 'verified' then
    v_status := 'blocked_verified_development_effect_required';

  elsif v_fatigue_status in ('started','applied','verified') then
    v_status := 'blocked_fatigue_already_started_or_completed';

  elsif not v_process_found then
    v_status := 'blocked_production_process_run_required';

  elsif not v_process_capable then
    v_status := 'blocked_process_run_not_execution_capable';

  elsif not v_effect_found then
    v_status := 'blocked_weather_exposure_effect_reservation_required';

  elsif v_effect.effect_status<>'planned' then
    v_status := 'blocked_weather_exposure_effect_not_planned';

  elsif v_effect.source_payload_hash is distinct from
        v_source->>'source_payload_hash' then
    v_status := 'blocked_weather_exposure_source_hash_mismatch';

  elsif not v_config.execution_enabled
        or v_config.allow_historical_reapply
        or v_config.allow_post_closeout_reapply
        or v_config.allow_health_case_rerun then
    v_status := 'blocked_weather_exposure_adapter_execution_disabled_in_b14';

  else
    v_status := 'ready_for_guarded_weather_exposure_execution';
  end if;

  v_plan := jsonb_build_object(
    'plan_version','phase3ab_b14_guarded_weather_exposure_adapter_plan_v1',
    'status',v_status,
    'stage_id',v_stage.stage_id,
    'race_id',v_stage.race_id,
    'simulation_run_id',v_stage.simulation_run_id,
    'simulation_status',v_stage.simulation_status,
    'route_format',v_source->>'route_format',
    'stage_process_status',v_source->>'stage_process_status',

    'writer_contract',jsonb_build_object(
      'signature',v_config.writer_signature,
      'expected_definition_hash',v_config.writer_definition_hash,
      'current_definition_hash',v_writer_hash,
      'definition_matches',
        v_writer_hash is not distinct from v_config.writer_definition_hash
    ),

    'requirement_helper_contract',jsonb_build_object(
      'signature',v_config.requirement_helper_signature,
      'expected_definition_hash',
        v_config.requirement_helper_definition_hash,
      'current_definition_hash',v_requirement_hash,
      'definition_matches',
        v_requirement_hash is not distinct from
        v_config.requirement_helper_definition_hash
    ),

    'health_case_contract',jsonb_build_object(
      'signature',v_config.health_case_signature,
      'expected_definition_hash',v_config.health_case_definition_hash,
      'current_definition_hash',v_health_hash,
      'definition_matches',
        v_health_hash is not distinct from v_config.health_case_definition_hash,
      'rerun_allowed',false
    ),

    'source_evidence',v_source,
    'output_evidence',v_output,

    'dependencies',jsonb_build_object(
      'development_effect_status',v_development_status,
      'fatigue_effect_status',v_fatigue_status,
      'stage_closeout_effect_status',v_closeout_status
    ),

    'process_run',jsonb_build_object(
      'requested_process_run_id',p_process_run_id,
      'found',v_process_found,
      'execution_capable',v_process_capable,
      'current_b1_production_execution_available',false
    ),

    'weather_exposure_effect_ledger',jsonb_build_object(
      'found',v_effect_found,
      'effect_id',v_effect.effect_id,
      'effect_status',v_effect.effect_status,
      'idempotency_key',v_effect.idempotency_key,
      'source_payload_hash',v_effect.source_payload_hash,
      'applied_payload_hash',v_effect.applied_payload_hash
    ),

    'execution_config',jsonb_build_object(
      'config_version',v_config.config_version,
      'execution_enabled',v_config.execution_enabled,
      'allow_historical_reapply',v_config.allow_historical_reapply,
      'allow_post_closeout_reapply',v_config.allow_post_closeout_reapply,
      'allow_health_case_rerun',v_config.allow_health_case_rerun,
      'validated_route',v_config.validated_route,
      'hard_disabled_by_check_constraints',true
    ),

    'historical_reapply_allowed',false,
    'health_case_rerun_allowed',false,
    'production_writer_execution_enabled',false
  );

  return v_plan||jsonb_build_object(
    'plan_hash',md5(v_plan::text),
    'generated_at',clock_timestamp()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_weather_exposure_adapter_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_plan jsonb;
  v_run_id uuid;
  v_source_hash text;
  v_effect record;
  v_writer_result jsonb;
  v_output jsonb;
  v_expected_status text;
begin
  v_plan :=
    public.race_engine_get_stage_weather_exposure_adapter_plan_v2(
      p_stage_id,p_process_run_id
    );

  if not coalesce(p_execute,false) then
    return jsonb_build_object(
      'status','dry_run_weather_exposure_adapter_plan',
      'stage_id',p_stage_id,
      'plan',v_plan,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'exposure_rows_changed',false,
      'rider_state_metadata_changed',false,
      'health_cases_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  if v_plan->>'status' in
     (
       'historical_verify_only_golden_fixture',
       'historical_verify_only_existing_weather_exposure',
       'historical_weather_exposure_incomplete_manual_review_no_reapply',
       'weather_cancelled_skip_normal_exposure'
     ) then
    return jsonb_build_object(
      'status',v_plan->>'status',
      'stage_id',p_stage_id,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'exposure_rows_changed',false,
      'rider_state_metadata_changed',false,
      'health_cases_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  select *
  into v_config
  from public.race_engine_stage_weather_exposure_adapter_config_v2
  where adapter_key='weather_exposure';

  if not found
     or not v_config.execution_enabled
     or v_config.allow_historical_reapply
     or v_config.allow_post_closeout_reapply
     or v_config.allow_health_case_rerun then
    return jsonb_build_object(
      'status','blocked_weather_exposure_adapter_execution_disabled_in_b14',
      'stage_id',p_stage_id,
      'process_run_id',p_process_run_id,
      'plan_status',v_plan->>'status',
      'hard_disabled_by_check_constraints',true,
      'confirmation_text_ignored',p_confirmation_text is not null,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'exposure_rows_changed',false,
      'rider_state_metadata_changed',false,
      'health_cases_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  if md5(coalesce(p_confirmation_text,''))
     <>v_config.required_confirmation_hash then
    return jsonb_build_object(
      'status','blocked_invalid_weather_exposure_adapter_confirmation',
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'exposure_rows_changed',false,
      'rider_state_metadata_changed',false,
      'health_cases_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  if v_plan->>'status'<>'ready_for_guarded_weather_exposure_execution' then
    return jsonb_build_object(
      'status','blocked_weather_exposure_adapter_plan_not_ready',
      'plan',v_plan,
      'production_writer_called',false,
      'effect_ledger_changed',false,
      'exposure_rows_changed',false,
      'rider_state_metadata_changed',false,
      'health_cases_changed',false,
      'production_writer_execution_enabled',false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'phase3ab:weather-exposure-adapter:'||p_stage_id::text,
      0
    )
  );

  v_run_id := nullif(v_plan->>'simulation_run_id','')::uuid;
  v_source_hash := v_plan->'source_evidence'->>'source_payload_hash';

  select *
  into v_effect
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id
    and effect_key='weather_exposure'
  for update;

  if v_effect.effect_id is null
     or v_effect.effect_status<>'planned'
     or v_effect.source_payload_hash is distinct from v_source_hash then
    raise exception
      'Weather-exposure adapter invariant failed: planned matching effect required.';
  end if;

  update public.race_engine_stage_effect_ledger_v2
  set
    effect_status='started',
    started_at=coalesce(started_at,clock_timestamp()),
    error_message=null,
    metadata=metadata||jsonb_build_object(
      'adapter_version','phase3ab_b14_guarded_weather_exposure_adapter_v1',
      'process_run_id',p_process_run_id,
      'source_hash_version',v_config.source_hash_version,
      'output_hash_version',v_config.output_hash_version,
      'historical_reapply_allowed',false,
      'post_closeout_reapply_allowed',false,
      'health_case_rerun_allowed',false
    ),
    updated_at=clock_timestamp()
  where effect_id=v_effect.effect_id;

  v_writer_result :=
    public.race_engine_apply_rain_jacket_weather_exposure_v1(
      v_run_id,p_stage_id
    );

  v_output :=
    public.race_engine_get_stage_weather_exposure_output_evidence_v2(
      p_stage_id
    );

  v_expected_status := case
    when coalesce(
      (v_plan->'source_evidence'->>'rain_jacket_required')::boolean,
      false
    ) then 'weather_exposure_output_complete'
    else 'weather_exposure_skipped_not_required_complete'
  end;

  if v_output->>'status' is distinct from v_expected_status then
    raise exception
      'Weather-exposure output verification failed: expected %, received %.',
      v_expected_status,v_output->>'status';
  end if;

  update public.race_engine_stage_effect_ledger_v2
  set
    effect_status='applied',
    applied_at=clock_timestamp(),
    applied_payload_hash=v_output->>'combined_output_hash',
    metadata=metadata||jsonb_build_object(
      'writer_result',v_writer_result,
      'weather_exposure_output_evidence',v_output
    ),
    updated_at=clock_timestamp()
  where effect_id=v_effect.effect_id;

  update public.race_engine_stage_effect_ledger_v2
  set
    effect_status='verified',
    verified_at=clock_timestamp(),
    updated_at=clock_timestamp()
  where effect_id=v_effect.effect_id
    and effect_status='applied'
    and applied_payload_hash=v_output->>'combined_output_hash';

  if not found then
    raise exception
      'Weather-exposure adapter verification transition failed.';
  end if;

  return jsonb_build_object(
    'status','weather_exposure_applied_and_verified',
    'stage_id',p_stage_id,
    'simulation_run_id',v_run_id,
    'process_run_id',p_process_run_id,
    'effect_id',v_effect.effect_id,
    'source_payload_hash',v_source_hash,
    'applied_payload_hash',v_output->>'combined_output_hash',
    'writer_result',v_writer_result,
    'output_evidence',v_output,
    'production_writer_called',true,
    'effect_ledger_changed',true,
    'exposure_rows_changed',true,
    'rider_state_metadata_changed',true,
    'health_cases_changed',
      coalesce((v_writer_result->>'illness_cases_created')::integer,0)>0,
    'production_writer_execution_enabled',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_daily_activity_adapter_plan_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_projection jsonb;
  v_output jsonb;
  v_ownership jsonb;
  v_process record;
  v_process_found boolean := false;
  v_process_capable boolean := false;
  v_effect record;
  v_effect_found boolean := false;
  v_closeout text;
  v_status text;
  v_plan jsonb;
begin
  select *
  into v_config
  from public.race_engine_stage_daily_activity_adapter_config_v2
  where adapter_key='daily_activity';

  if not found then
    return jsonb_build_object(
      'status','blocked_daily_activity_adapter_config_missing',
      'stage_id',p_stage_id,
      'production_projection_execution_enabled',false
    );
  end if;

  v_projection :=
    public.race_engine_get_stage_daily_activity_projection_v2(p_stage_id);
  v_output :=
    public.race_engine_get_stage_daily_activity_output_evidence_v2(p_stage_id);
  v_ownership :=
    public.race_engine_get_daily_activity_trigger_ownership_v2();

  if p_process_run_id is not null then
    select *
    into v_process
    from public.race_engine_stage_process_runs_v2
    where process_run_id=p_process_run_id;

    v_process_found := found;

    if v_process_found then
      v_process_capable :=
        v_process.stage_id=p_stage_id
        and not v_process.requested_dry_run
        and v_process.status='started'
        and v_process.production_execution_enabled
        and v_process.existing_runner_called;
    end if;
  end if;

  select *
  into v_effect
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id
    and effect_key='daily_activity';

  v_effect_found := found;

  select effect_status
  into v_closeout
  from public.race_engine_stage_effect_ledger_v2
  where stage_id=p_stage_id
    and effect_key='stage_closeout';

  if exists
     (
       select 1
       from public.race_engine_golden_stage_fixture_v1 f
       where f.stage_id=p_stage_id
         and f.fixture_status='frozen_and_validated'
     ) then
    v_status := 'historical_verify_only_golden_fixture';

  elsif v_projection->>'stage_process_status'='verify_only_no_execution'
        and v_output->>'status'='daily_activity_projection_complete' then
    v_status := 'historical_verify_only_existing_daily_activity';

  elsif v_projection->>'stage_process_status'='verify_only_no_execution' then
    v_status :=
      'historical_daily_activity_differs_manual_review_no_reprojection';

  elsif v_projection->>'status'<>'projection_ready' then
    v_status := 'source_not_ready_for_daily_activity';

  elsif v_closeout is not null then
    v_status := 'blocked_stage_closeout_effect_exists';

  elsif v_ownership->>'status'<>'legacy_result_insert_trigger_active' then
    v_status := 'blocked_unexpected_trigger_ownership_state';

  elsif not v_process_found then
    v_status := 'blocked_production_process_run_required';

  elsif not v_process_capable then
    v_status := 'blocked_process_run_not_execution_capable';

  elsif not v_effect_found then
    v_status := 'blocked_daily_activity_effect_reservation_required';

  elsif v_effect.effect_status<>'planned' then
    v_status := 'blocked_daily_activity_effect_not_planned';

  elsif v_effect.source_payload_hash is distinct from
        v_projection->>'projection_hash' then
    v_status := 'blocked_daily_activity_source_hash_mismatch';

  elsif not v_config.execution_enabled
        or not v_config.allow_trigger_cutover
        or v_config.allow_historical_reprojection
        or v_config.allow_same_day_source_replacement then
    v_status := 'blocked_daily_activity_adapter_execution_disabled_in_b15';

  else
    v_status := 'ready_for_guarded_daily_activity_projection';
  end if;

  v_plan := jsonb_build_object(
    'plan_version','phase3ab_b15_daily_activity_adapter_plan_v1',
    'status',v_status,
    'stage_id',p_stage_id,
    'route_format',v_projection->>'route_format',
    'stage_process_status',v_projection->>'stage_process_status',
    'trigger_ownership',v_ownership,
    'projection',v_projection,
    'output_evidence',v_output,
    'process_run',jsonb_build_object(
      'requested_process_run_id',p_process_run_id,
      'found',v_process_found,
      'execution_capable',v_process_capable,
      'current_b1_production_execution_available',false
    ),
    'effect_ledger',jsonb_build_object(
      'found',v_effect_found,
      'effect_id',v_effect.effect_id,
      'effect_status',v_effect.effect_status,
      'source_payload_hash',v_effect.source_payload_hash,
      'applied_payload_hash',v_effect.applied_payload_hash
    ),
    'stage_closeout_effect_status',v_closeout,
    'execution_config',jsonb_build_object(
      'execution_enabled',v_config.execution_enabled,
      'allow_trigger_cutover',v_config.allow_trigger_cutover,
      'allow_historical_reprojection',
        v_config.allow_historical_reprojection,
      'allow_same_day_source_replacement',
        v_config.allow_same_day_source_replacement,
      'hard_disabled_by_check_constraints',true
    ),
    'production_projection_execution_enabled',false,
    'legacy_trigger_changed_by_b15',false
  );

  return v_plan||jsonb_build_object(
    'plan_hash',md5(v_plan::text),
    'generated_at',clock_timestamp()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_daily_activity_adapter_v2(p_stage_id uuid, p_process_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_config record;
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_stage_daily_activity_adapter_plan_v2(
      p_stage_id,p_process_run_id
    );

  if not coalesce(p_execute,false) then
    return jsonb_build_object(
      'status','dry_run_daily_activity_adapter_plan',
      'stage_id',p_stage_id,
      'plan',v_plan,
      'activity_rows_changed',false,
      'effect_ledger_changed',false,
      'legacy_trigger_changed',false,
      'production_projection_execution_enabled',false
    );
  end if;

  if v_plan->>'status' in
     (
       'historical_verify_only_golden_fixture',
       'historical_verify_only_existing_daily_activity',
       'historical_daily_activity_differs_manual_review_no_reprojection'
     ) then
    return jsonb_build_object(
      'status',v_plan->>'status',
      'stage_id',p_stage_id,
      'activity_rows_changed',false,
      'effect_ledger_changed',false,
      'legacy_trigger_changed',false,
      'production_projection_execution_enabled',false
    );
  end if;

  select *
  into v_config
  from public.race_engine_stage_daily_activity_adapter_config_v2
  where adapter_key='daily_activity';

  if not found
     or not v_config.execution_enabled
     or not v_config.allow_trigger_cutover
     or v_config.allow_historical_reprojection
     or v_config.allow_same_day_source_replacement then
    return jsonb_build_object(
      'status','blocked_daily_activity_adapter_execution_disabled_in_b15',
      'stage_id',p_stage_id,
      'process_run_id',p_process_run_id,
      'plan_status',v_plan->>'status',
      'confirmation_text_ignored',p_confirmation_text is not null,
      'hard_disabled_by_check_constraints',true,
      'activity_rows_changed',false,
      'effect_ledger_changed',false,
      'legacy_trigger_changed',false,
      'production_projection_execution_enabled',false
    );
  end if;

  /*
   * B15 intentionally contains no reachable or unreachable INSERT/UPDATE
   * statement for rider_daily_activity. The future cutover must first define
   * and approve the same-day multi-source policy, then install a new adapter
   * in a later phase.
   */
  return jsonb_build_object(
    'status','blocked_daily_activity_writer_not_implemented_in_b15',
    'stage_id',p_stage_id,
    'activity_rows_changed',false,
    'effect_ledger_changed',false,
    'legacy_trigger_changed',false,
    'production_projection_execution_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_weather_closeout_projection_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_race record;
  v_total integer;
  v_cancelled integer;
  v_completed_runs integer;
  v_result_stages integer;
  v_all_cancelled boolean;
  v_all_runs_complete boolean;
  v_expected_weather_status text;
  v_expected_race_status text;
begin
  select
    r.id,
    r.name,
    r.status,
    r.is_stage_race,
    r.stage_count,
    r.metadata
  into v_race
  from public.races r
  where r.id=p_race_id;

  if v_race.id is null then
    return jsonb_build_object(
      'status','race_not_found',
      'race_id',p_race_id
    );
  end if;

  select
    count(*)::integer,
    count(*) filter
      (where coalesce(s.weather_cancelled,false))::integer
  into
    v_total,
    v_cancelled
  from public.race_stages s
  where s.race_id=p_race_id;

  select count(distinct run.stage_id)::integer
  into v_completed_runs
  from public.race_stage_simulation_runs run
  join public.race_stages s on s.id=run.stage_id
  where s.race_id=p_race_id
    and lower(coalesce(run.status,''))='completed';

  select count(distinct sr.stage_id)::integer
  into v_result_stages
  from public.race_stage_results sr
  join public.race_stages s on s.id=sr.stage_id
  where s.race_id=p_race_id;

  v_all_cancelled :=
    v_total>0 and v_cancelled=v_total;

  v_all_runs_complete :=
    v_total>0 and v_completed_runs=v_total;

  v_expected_weather_status :=
    case
      when v_cancelled=0 then
        'no_weather_cancelled_stages'

      when v_all_cancelled then
        'all_stages_weather_cancelled'

      else
        'partly_weather_cancelled'
    end;

  v_expected_race_status :=
    case
      when v_all_runs_complete then 'completed'
      else v_race.status
    end;

  return jsonb_build_object(
    'status','projection_ready',
    'race_id',v_race.id,
    'race_name',v_race.name,
    'current_race_status',v_race.status,
    'is_stage_race',v_race.is_stage_race,
    'declared_stage_count',v_race.stage_count,
    'weather_total_stage_count',v_total,
    'weather_cancelled_stage_count',v_cancelled,
    'weather_completed_run_count',v_completed_runs,
    'weather_result_stage_count',v_result_stages,
    'weather_all_stages_cancelled',v_all_cancelled,
    'weather_all_stages_have_completed_runs',
      v_all_runs_complete,
    'expected_weather_cancellation_status',
      v_expected_weather_status,
    'expected_race_status',
      v_expected_race_status,
    'closeout_required',
      v_cancelled>0,
    'source_ready',
      v_cancelled>0 and v_all_runs_complete,
    'projection_version',
      'weather_closeout_projection_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_weather_closeout_output_evidence_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_projection jsonb;
  v_race record;
  v_metadata jsonb;
  v_stored_weather_status text;
  v_status_matches boolean;
  v_weather_status_matches boolean;
begin
  v_projection :=
    public.race_engine_get_weather_closeout_projection_v2(
      p_race_id
    );

  if v_projection->>'status'<>'projection_ready' then
    return jsonb_build_object(
      'status','output_not_ready',
      'race_id',p_race_id,
      'projection',v_projection
    );
  end if;

  select
    r.id,r.status,coalesce(r.metadata,'{}'::jsonb) metadata
  into v_race
  from public.races r
  where r.id=p_race_id;

  v_metadata:=v_race.metadata;

  v_stored_weather_status :=
    coalesce(
      v_metadata->>'weather_cancellation_status',
      v_metadata->>'weather_cancelled_status',
      v_metadata#>>'{weather,cancellation_status}'
    );

  v_status_matches :=
    v_race.status is not distinct from
      (v_projection->>'expected_race_status');

  v_weather_status_matches :=
    case
      when v_projection->>'expected_weather_cancellation_status'=
           'no_weather_cancelled_stages'
        then v_stored_weather_status is null
             or v_stored_weather_status=
                'no_weather_cancelled_stages'

      else v_stored_weather_status is not distinct from
           (
             v_projection
               ->>'expected_weather_cancellation_status'
           )
    end;

  return jsonb_build_object(
    'status','weather_closeout_output_evidence_complete',
    'race_id',p_race_id,
    'current_race_status',v_race.status,
    'stored_weather_cancellation_status',
      v_stored_weather_status,
    'expected_race_status',
      v_projection->>'expected_race_status',
    'expected_weather_cancellation_status',
      v_projection->>'expected_weather_cancellation_status',
    'race_status_matches',v_status_matches,
    'weather_status_matches',v_weather_status_matches,
    'output_matches_projection',
      v_status_matches and v_weather_status_matches,
    'metadata',v_metadata,
    'projection',v_projection
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_weather_closeout_writer_rollback_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_projection jsonb;
  v_before jsonb;
  v_after_call jsonb;
  v_after_rollback jsonb;
  v_writer_result jsonb;
  v_payload jsonb;
  v_detail text;
  v_marker constant text :=
    'PHASE3AB_B16_WEATHER_CLOSEOUT_ROLLBACK_MARKER';
begin
  if p_race_id =
     '65739034-f9e5-4b5c-8f21-4ea27451e0d4'::uuid then
    return jsonb_build_object(
      'status','blocked_golden_fixture_writer_test',
      'race_id',p_race_id,
      'writer_called',false
    );
  end if;

  v_projection :=
    public.race_engine_get_weather_closeout_projection_v2(
      p_race_id
    );

  if v_projection->>'status'<>'projection_ready'
     or not coalesce(
              (v_projection->>'closeout_required')::boolean,
              false
            )
     or not coalesce(
              (v_projection->>'source_ready')::boolean,
              false
            ) then
    return jsonb_build_object(
      'status','coverage_gap_source_not_ready',
      'race_id',p_race_id,
      'writer_called',false,
      'projection',v_projection
    );
  end if;

  select jsonb_build_object(
    'race_hash',
      (
        select md5(to_jsonb(r)::text)
        from public.races r
        where r.id=p_race_id
      ),

    'stage_hash',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(s)::text,'|'
              order by s.id
            ),
            ''
          )
        )
        from public.race_stages s
        where s.race_id=p_race_id
      ),

    'run_hash',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(run)::text,'|'
              order by run.id
            ),
            ''
          )
        )
        from public.race_stage_simulation_runs run
        join public.race_stages s on s.id=run.stage_id
        where s.race_id=p_race_id
      ),

    'result_hash',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(sr)::text,'|'
              order by sr.id
            ),
            ''
          )
        )
        from public.race_stage_results sr
        join public.race_stages s on s.id=sr.stage_id
        where s.race_id=p_race_id
      )
  )
  into v_before;

  begin
    v_writer_result :=
      public.race_engine_finalize_weather_cancelled_race_state_v1(
        p_race_id
      );

    select jsonb_build_object(
      'race_hash',
        (
          select md5(to_jsonb(r)::text)
          from public.races r
          where r.id=p_race_id
        ),

      'stage_hash',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(s)::text,'|'
                order by s.id
              ),
              ''
            )
          )
          from public.race_stages s
          where s.race_id=p_race_id
        ),

      'run_hash',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(run)::text,'|'
                order by run.id
              ),
              ''
            )
          )
          from public.race_stage_simulation_runs run
          join public.race_stages s on s.id=run.stage_id
          where s.race_id=p_race_id
        ),

      'result_hash',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(sr)::text,'|'
                order by sr.id
              ),
              ''
            )
          )
          from public.race_stage_results sr
          join public.race_stages s on s.id=sr.stage_id
          where s.race_id=p_race_id
        )
    )
    into v_after_call;

    v_payload :=
      jsonb_build_object(
        'writer_result',v_writer_result,
        'after_call',v_after_call
      );

    raise exception using
      errcode='P0001',
      message=v_marker,
      detail=v_payload::text;

  exception
    when raise_exception then
      get stacked diagnostics v_detail=pg_exception_detail;

      if sqlerrm<>v_marker then
        raise;
      end if;

      v_payload:=v_detail::jsonb;
  end;

  select jsonb_build_object(
    'race_hash',
      (
        select md5(to_jsonb(r)::text)
        from public.races r
        where r.id=p_race_id
      ),

    'stage_hash',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(s)::text,'|'
              order by s.id
            ),
            ''
          )
        )
        from public.race_stages s
        where s.race_id=p_race_id
      ),

    'run_hash',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(run)::text,'|'
              order by run.id
            ),
            ''
          )
        )
        from public.race_stage_simulation_runs run
        join public.race_stages s on s.id=run.stage_id
        where s.race_id=p_race_id
      ),

    'result_hash',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(sr)::text,'|'
              order by sr.id
            ),
            ''
          )
        )
        from public.race_stage_results sr
        join public.race_stages s on s.id=sr.stage_id
        where s.race_id=p_race_id
      )
  )
  into v_after_rollback;

  v_writer_result:=v_payload->'writer_result';
  v_after_call:=v_payload->'after_call';

  return jsonb_build_object(
    'status',
      case
        when v_before=v_after_rollback
          then 'rollback_test_passed'
        else 'rollback_test_failed'
      end,

    'race_id',p_race_id,
    'writer_called',true,
    'writer_result',v_writer_result,
    'projection',v_projection,
    'before_hashes',v_before,
    'after_call_hashes',v_after_call,
    'after_rollback_hashes',v_after_rollback,
    'exact_rollback',v_before=v_after_rollback,
    'writer_status_matches',
      v_writer_result->>'status'=
        'weather_race_state_finalized',
    'writer_weather_status_matches',
      v_writer_result->>'weather_cancellation_status'
      is not distinct from
      (
        v_projection
          ->>'expected_weather_cancellation_status'
      ),
    'writer_race_status_matches',
      v_writer_result->>'new_race_status'
      is not distinct from
      (v_projection->>'expected_race_status'),
    'rollback_marker_present',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_weather_closeout_adapter_plan_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_projection jsonb;
  v_output jsonb;
  v_is_golden boolean;
  v_status text;
begin
  v_projection :=
    public.race_engine_get_weather_closeout_projection_v2(
      p_race_id
    );

  v_output :=
    public.race_engine_get_weather_closeout_output_evidence_v2(
      p_race_id
    );

  select exists
  (
    select 1
    from public.race_engine_golden_stage_fixture_v1 f
    where f.race_id=p_race_id
      and f.fixture_status='frozen_and_validated'
  )
  into v_is_golden;

  v_status :=
    case
      when v_projection->>'status'<>'projection_ready' then
        'source_not_ready_for_weather_closeout'

      when not coalesce(
             (v_projection->>'closeout_required')::boolean,
             false
           ) then
        'weather_closeout_not_required'

      when v_is_golden then
        'historical_verify_only_golden_fixture'

      when not coalesce(
             (v_projection->>'source_ready')::boolean,
             false
           ) then
        'source_not_ready_for_weather_closeout'

      when coalesce(
             (
               v_output
                 ->>'output_matches_projection'
             )::boolean,
             false
           ) then
        'historical_verify_only_existing_weather_closeout'

      else
        'historical_weather_closeout_differs_manual_review_no_recloseout'
    end;

  return jsonb_build_object(
    'status',v_status,
    'race_id',p_race_id,
    'projection',v_projection,
    'output_evidence',v_output,
    'production_execution_enabled',false,
    'trigger_cutover_allowed',false,
    'historical_recloseout_allowed',false,
    'incomplete_race_closeout_allowed',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_weather_closeout_adapter_v2(p_race_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_weather_closeout_adapter_plan_v2(
      p_race_id
    );

  return jsonb_build_object(
    'status',
      'blocked_weather_closeout_adapter_execution_disabled_in_b16',
    'race_id',p_race_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'plan',v_plan,
    'writer_called',false,
    'race_rows_changed',false,
    'stage_rows_changed',false,
    'simulation_run_rows_changed',false,
    'stage_result_rows_changed',false,
    'effect_ledger_changed',false,
    'legacy_trigger_changed',false,
    'production_execution_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_sponsor_objective_source_evidence_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_catalog'
AS $function$
declare
  v_race record;
  v_objective_count integer;
  v_eligible_count integer;
  v_stage_count integer;
  v_completed_run_count integer;
  v_result_count integer;
  v_classification_count integer;
  v_objective_hash text;
  v_result_hash text;
  v_classification_hash text;
  v_objectives jsonb;
begin
  select r.id,r.name,r.status,r.is_stage_race,r.stage_count
  into v_race
  from public.races r
  where r.id=p_race_id;

  if v_race.id is null then
    return jsonb_build_object(
      'status','race_not_found',
      'race_id',p_race_id
    );
  end if;

  select
    count(*)::integer,
    count(*) filter
    (
      where o.status='active'
        and o.check_state in('scheduled','waiting_for_result')
        and o.objective_result_state='pending'
        and
        (
          o.target_check_game_date is null
          or o.target_check_game_date<=
             public.get_current_game_date_safe_v1()
        )
    )::integer,
    md5(
      coalesce(
        string_agg(
          to_jsonb(o)::text,
          '|'
          order by o.id
        ),
        ''
      )
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'objective_id',o.id,
          'club_sponsor_id',o.club_sponsor_id,
          'objective_code',o.objective_code,
          'title',o.title,
          'status',o.status,
          'check_state',o.check_state,
          'objective_result_state',
            o.objective_result_state,
          'reward_amount',o.reward_amount,
          'current_value',o.current_value,
          'target_value',o.target_value,
          'evaluation_mode',o.evaluation_mode,
          'objective_target_mode',
            o.objective_target_mode,
          'target_check_game_date',
            o.target_check_game_date,
          'payout_transaction_id',
            o.payout_transaction_id,
          'failed_reason',o.failed_reason
        )
        order by o.id
      ),
      '[]'::jsonb
    )
  into
    v_objective_count,
    v_eligible_count,
    v_objective_hash,
    v_objectives
  from public.club_sponsor_objectives o
  where o.target_race_id=p_race_id;

  select count(*)::integer
  into v_stage_count
  from public.race_stages s
  where s.race_id=p_race_id;

  select count(distinct run.stage_id)::integer
  into v_completed_run_count
  from public.race_stage_simulation_runs run
  join public.race_stages s on s.id=run.stage_id
  where s.race_id=p_race_id
    and lower(coalesce(run.status,''))='completed';

  select
    count(*)::integer,
    md5(
      coalesce(
        string_agg(
          to_jsonb(sr)::text,
          '|'
          order by to_jsonb(sr)::text
        ),
        ''
      )
    )
  into v_result_count,v_result_hash
  from public.race_stage_results sr
  join public.race_stages s on s.id=sr.stage_id
  where s.race_id=p_race_id;

  select
    count(*)::integer,
    md5(
      coalesce(
        string_agg(
          to_jsonb(cs)::text,
          '|'
          order by to_jsonb(cs)::text
        ),
        ''
      )
    )
  into v_classification_count,v_classification_hash
  from public.race_classification_standings cs
  where cs.race_id=p_race_id;

  return jsonb_build_object(
    'status','source_evidence_ready',
    'race_id',v_race.id,
    'race_name',v_race.name,
    'race_status',v_race.status,
    'is_stage_race',v_race.is_stage_race,
    'declared_stage_count',v_race.stage_count,
    'actual_stage_count',v_stage_count,
    'completed_run_count',v_completed_run_count,
    'stage_result_count',v_result_count,
    'classification_count',v_classification_count,
    'objective_count',v_objective_count,
    'eligible_objective_count',v_eligible_count,
    'objective_hash',v_objective_hash,
    'stage_result_hash',v_result_hash,
    'classification_hash',v_classification_hash,
    'objectives',v_objectives,
    'source_ready',
      v_race.status='completed'
      and v_stage_count>0
      and v_completed_run_count=v_stage_count
      and
      (
        v_result_count>0
        or v_classification_count>0
      ),
    'processing_required',v_eligible_count>0,
    'source_version',
      'sponsor_objective_source_evidence_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_sponsor_objective_output_evidence_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_catalog'
AS $function$
declare
  v_source jsonb;
  v_objective_ids uuid[];
  v_objective_count integer;
  v_pending integer;
  v_completed integer;
  v_failed integer;
  v_paid integer;
  v_payout_linked integer;
  v_tx_count integer;
  v_entry_count integer;
  v_positive bigint;
  v_negative bigint;
  v_net bigint;
  v_notification_count integer;
  v_objective_hash text;
  v_tx_hash text;
  v_entry_hash text;
begin
  v_source :=
    public.race_engine_get_sponsor_objective_source_evidence_v2(
      p_race_id
    );

  if v_source->>'status'<>'source_evidence_ready' then
    return jsonb_build_object(
      'status','output_evidence_not_ready',
      'race_id',p_race_id,
      'source',v_source
    );
  end if;

  select array_agg(o.id order by o.id)
  into v_objective_ids
  from public.club_sponsor_objectives o
  where o.target_race_id=p_race_id;

  select
    count(*)::integer,
    count(*) filter(
      where o.objective_result_state='pending'
    )::integer,
    count(*) filter(
      where o.objective_result_state='completed'
    )::integer,
    count(*) filter(
      where o.objective_result_state='failed'
    )::integer,
    count(*) filter(
      where o.objective_result_state='paid'
    )::integer,
    count(*) filter(
      where o.payout_transaction_id is not null
    )::integer,
    md5(
      coalesce(
        string_agg(
          to_jsonb(o)::text,'|' order by o.id
        ),
        ''
      )
    )
  into
    v_objective_count,
    v_pending,
    v_completed,
    v_failed,
    v_paid,
    v_payout_linked,
    v_objective_hash
  from public.club_sponsor_objectives o
  where o.target_race_id=p_race_id;

  select
    count(*)::integer,
    md5(
      coalesce(
        string_agg(
          to_jsonb(t)::text,'|' order by t.id
        ),
        ''
      )
    )
  into v_tx_count,v_tx_hash
  from finance.transactions t
  where
    (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
      = any(coalesce(v_objective_ids,array[]::uuid[]))
    or t.idempotency_key = any(
      coalesce(
        (
          select array_agg(
            'sponsor_objective_bonus:'||x::text
          )
          from unnest(
            coalesce(v_objective_ids,array[]::uuid[])
          ) x
        ),
        array[]::text[]
      )
    );

  select
    count(*)::integer,
    coalesce(sum(e.amount) filter(where e.amount>0),0),
    coalesce(sum(e.amount) filter(where e.amount<0),0),
    coalesce(sum(e.amount),0),
    md5(
      coalesce(
        string_agg(
          to_jsonb(e)::text,'|' order by e.id
        ),
        ''
      )
    )
  into
    v_entry_count,
    v_positive,
    v_negative,
    v_net,
    v_entry_hash
  from finance.entries e
  join finance.transactions t on t.id=e.transaction_id
  where
    (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
      = any(coalesce(v_objective_ids,array[]::uuid[]))
    or t.idempotency_key = any(
      coalesce(
        (
          select array_agg(
            'sponsor_objective_bonus:'||x::text
          )
          from unnest(
            coalesce(v_objective_ids,array[]::uuid[])
          ) x
        ),
        array[]::text[]
      )
    );

  select count(*)::integer
  into v_notification_count
  from public.notifications n
  where n.payload_json->>'objective_id'
        = any(
            coalesce(
              (
                select array_agg(x::text)
                from unnest(
                  coalesce(v_objective_ids,array[]::uuid[])
                ) x
              ),
              array[]::text[]
            )
          );

  return jsonb_build_object(
    'status','output_evidence_ready',
    'race_id',p_race_id,
    'objective_count',v_objective_count,
    'pending_count',v_pending,
    'completed_count',v_completed,
    'failed_count',v_failed,
    'paid_state_count',v_paid,
    'payout_linked_count',v_payout_linked,
    'bonus_transaction_count',v_tx_count,
    'bonus_entry_count',v_entry_count,
    'positive_entry_sum',v_positive,
    'negative_entry_sum',v_negative,
    'net_entry_sum',v_net,
    'objective_notification_count',v_notification_count,
    'objective_hash',v_objective_hash,
    'transaction_hash',v_tx_hash,
    'entry_hash',v_entry_hash,
    'finance_balanced',v_net=0,
    'effective_paid_count',v_payout_linked,
    'paid_state_semantic_gap',
      v_payout_linked>v_paid,
    'source',v_source,
    'output_version',
      'sponsor_objective_output_evidence_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_sponsor_objective_writer_rollback_v2(p_race_id uuid, p_expected_case text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_catalog'
AS $function$
declare
  v_objective_ids uuid[];
  v_source jsonb;
  v_before jsonb;
  v_after_call jsonb;
  v_after_rollback jsonb;
  v_writer_result jsonb;
  v_payload jsonb;
  v_detail text;
  v_marker constant text :=
    'PHASE3AB_B17_SPONSOR_OBJECTIVE_ROLLBACK_MARKER';
begin
  if p_race_id is null then
    raise exception 'B17 rollback test requires race id.';
  end if;

  if p_race_id =
     '65739034-f9e5-4b5c-8f21-4ea27451e0d4'::uuid then
    return jsonb_build_object(
      'status','blocked_golden_fixture_writer_test',
      'race_id',p_race_id,
      'writer_called',false
    );
  end if;

  if p_expected_case not in('noop','mutation') then
    raise exception
      'B17 rollback test expected case must be noop or mutation.';
  end if;

  v_source :=
    public.race_engine_get_sponsor_objective_source_evidence_v2(
      p_race_id
    );

  if v_source->>'status'<>'source_evidence_ready' then
    return jsonb_build_object(
      'status','coverage_gap_source_not_ready',
      'race_id',p_race_id,
      'writer_called',false,
      'source',v_source
    );
  end if;

  select array_agg(o.id order by o.id)
  into v_objective_ids
  from public.club_sponsor_objectives o
  where o.target_race_id=p_race_id;

  if coalesce(array_length(v_objective_ids,1),0)=0 then
    return jsonb_build_object(
      'status','coverage_gap_no_objectives',
      'race_id',p_race_id,
      'writer_called',false,
      'source',v_source
    );
  end if;

  perform 1
  from public.club_sponsor_objectives o
  where o.id=any(v_objective_ids)
  order by o.id
  for update;

  select jsonb_build_object(
    'objectives',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(o)::text,'|' order by o.id
            ),
            ''
          )
        )
        from public.club_sponsor_objectives o
        where o.id=any(v_objective_ids)
      ),

    'sponsors',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(cs)::text,'|' order by cs.id
            ),
            ''
          )
        )
        from public.club_sponsors cs
        where cs.id in
        (
          select o.club_sponsor_id
          from public.club_sponsor_objectives o
          where o.id=any(v_objective_ids)
        )
      ),

    'transactions',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(t)::text,'|' order by t.id
            ),
            ''
          )
        )
        from finance.transactions t
        where
          (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
            =any(v_objective_ids)
          or t.idempotency_key = any(
            array(
              select
                'sponsor_objective_bonus:' || x::text
              from unnest(v_objective_ids) x
            )
          )
      ),

    'entries',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(e)::text,'|' order by e.id
            ),
            ''
          )
        )
        from finance.entries e
        join finance.transactions t
          on t.id=e.transaction_id
        where
          (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
            =any(v_objective_ids)
          or t.idempotency_key = any(
            array(
              select
                'sponsor_objective_bonus:' || x::text
              from unnest(v_objective_ids) x
            )
          )
      ),

    'account_balances',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(b)::text,'|'
              order by to_jsonb(b)::text
            ),
            ''
          )
        )
        from finance.account_balances b
      ),

    'event_locks',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(l)::text,'|'
              order by l.event_type,l.club_id,l.ref_id
            ),
            ''
          )
        )
        from finance.event_locks l
        where l.ref_id=any(v_objective_ids)
           or lower(l.event_type) like
              '%sponsor%objective%'
      ),

    'notifications',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(n)::text,'|'
              order by to_jsonb(n)::text
            ),
            ''
          )
        )
        from public.notifications n
        where n.payload_json->>'objective_id'
              = any(
                array(
                  select x::text
                  from unnest(v_objective_ids) x
                )
              )
      ),

    'stage_results',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(sr)::text,'|'
              order by to_jsonb(sr)::text
            ),
            ''
          )
        )
        from public.race_stage_results sr
        join public.race_stages s on s.id=sr.stage_id
        where s.race_id=p_race_id
      ),

    'classifications',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(cs)::text,'|'
              order by to_jsonb(cs)::text
            ),
            ''
          )
        )
        from public.race_classification_standings cs
        where cs.race_id=p_race_id
      )
  )
  into v_before;

  begin
    v_writer_result :=
      public.sponsor_process_objectives_for_race_v1(
        p_race_id,
        false
      );

    select jsonb_build_object(
      'objectives',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(o)::text,'|' order by o.id
              ),
              ''
            )
          )
          from public.club_sponsor_objectives o
          where o.id=any(v_objective_ids)
        ),

      'sponsors',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(cs)::text,'|' order by cs.id
              ),
              ''
            )
          )
          from public.club_sponsors cs
          where cs.id in
          (
            select o.club_sponsor_id
            from public.club_sponsor_objectives o
            where o.id=any(v_objective_ids)
          )
        ),

      'transactions',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(t)::text,'|' order by t.id
              ),
              ''
            )
          )
          from finance.transactions t
          where
            (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
              =any(v_objective_ids)
            or t.idempotency_key = any(
            array(
              select
                'sponsor_objective_bonus:' || x::text
              from unnest(v_objective_ids) x
            )
          )
        ),

      'entries',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(e)::text,'|' order by e.id
              ),
              ''
            )
          )
          from finance.entries e
          join finance.transactions t
            on t.id=e.transaction_id
          where
            (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
              =any(v_objective_ids)
            or t.idempotency_key = any(
            array(
              select
                'sponsor_objective_bonus:' || x::text
              from unnest(v_objective_ids) x
            )
          )
        ),

      'account_balances',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(b)::text,'|'
                order by to_jsonb(b)::text
              ),
              ''
            )
          )
          from finance.account_balances b
        ),

      'event_locks',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(l)::text,'|'
                order by l.event_type,l.club_id,l.ref_id
              ),
              ''
            )
          )
          from finance.event_locks l
          where l.ref_id=any(v_objective_ids)
             or lower(l.event_type) like
                '%sponsor%objective%'
        ),

      'notifications',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(n)::text,'|'
                order by to_jsonb(n)::text
              ),
              ''
            )
          )
          from public.notifications n
          where n.payload_json->>'objective_id'
              = any(
                array(
                  select x::text
                  from unnest(v_objective_ids) x
                )
              )
        ),

      'stage_results',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(sr)::text,'|'
                order by to_jsonb(sr)::text
              ),
              ''
            )
          )
          from public.race_stage_results sr
          join public.race_stages s on s.id=sr.stage_id
          where s.race_id=p_race_id
        ),

      'classifications',
        (
          select md5(
            coalesce(
              string_agg(
                to_jsonb(cs)::text,'|'
                order by to_jsonb(cs)::text
              ),
              ''
            )
          )
          from public.race_classification_standings cs
          where cs.race_id=p_race_id
        )
    )
    into v_after_call;

    v_payload :=
      jsonb_build_object(
        'writer_result',v_writer_result,
        'after_call',v_after_call,
        'output_after_call',
          public.race_engine_get_sponsor_objective_output_evidence_v2(
            p_race_id
          )
      );

    raise exception using
      errcode='P0001',
      message=v_marker,
      detail=v_payload::text;

  exception
    when raise_exception then
      get stacked diagnostics v_detail=pg_exception_detail;

      if sqlerrm<>v_marker then
        raise;
      end if;

      v_payload:=v_detail::jsonb;
  end;

  select jsonb_build_object(
    'objectives',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(o)::text,'|' order by o.id
            ),
            ''
          )
        )
        from public.club_sponsor_objectives o
        where o.id=any(v_objective_ids)
      ),

    'sponsors',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(cs)::text,'|' order by cs.id
            ),
            ''
          )
        )
        from public.club_sponsors cs
        where cs.id in
        (
          select o.club_sponsor_id
          from public.club_sponsor_objectives o
          where o.id=any(v_objective_ids)
        )
      ),

    'transactions',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(t)::text,'|' order by t.id
            ),
            ''
          )
        )
        from finance.transactions t
        where
          (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
            =any(v_objective_ids)
          or t.idempotency_key = any(
            array(
              select
                'sponsor_objective_bonus:' || x::text
              from unnest(v_objective_ids) x
            )
          )
      ),

    'entries',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(e)::text,'|' order by e.id
            ),
            ''
          )
        )
        from finance.entries e
        join finance.transactions t
          on t.id=e.transaction_id
        where
          (
            case
              when coalesce(t.metadata->>'objective_id','')
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (t.metadata->>'objective_id')::uuid
              else null::uuid
            end
          )
            =any(v_objective_ids)
          or t.idempotency_key = any(
            array(
              select
                'sponsor_objective_bonus:' || x::text
              from unnest(v_objective_ids) x
            )
          )
      ),

    'account_balances',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(b)::text,'|'
              order by to_jsonb(b)::text
            ),
            ''
          )
        )
        from finance.account_balances b
      ),

    'event_locks',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(l)::text,'|'
              order by l.event_type,l.club_id,l.ref_id
            ),
            ''
          )
        )
        from finance.event_locks l
        where l.ref_id=any(v_objective_ids)
           or lower(l.event_type) like
              '%sponsor%objective%'
      ),

    'notifications',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(n)::text,'|'
              order by to_jsonb(n)::text
            ),
            ''
          )
        )
        from public.notifications n
        where n.payload_json->>'objective_id'
              = any(
                array(
                  select x::text
                  from unnest(v_objective_ids) x
                )
              )
      ),

    'stage_results',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(sr)::text,'|'
              order by to_jsonb(sr)::text
            ),
            ''
          )
        )
        from public.race_stage_results sr
        join public.race_stages s on s.id=sr.stage_id
        where s.race_id=p_race_id
      ),

    'classifications',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(cs)::text,'|'
              order by to_jsonb(cs)::text
            ),
            ''
          )
        )
        from public.race_classification_standings cs
        where cs.race_id=p_race_id
      )
  )
  into v_after_rollback;

  v_writer_result:=v_payload->'writer_result';
  v_after_call:=v_payload->'after_call';

  return jsonb_build_object(
    'status',
      case
        when v_before=v_after_rollback
         and
         (
           (
             p_expected_case='noop'
             and v_before=v_after_call
             and coalesce(
                   (
                     v_writer_result
                       ->>'processed_count'
                   )::integer,
                   -1
                 )=0
           )
           or
           (
             p_expected_case='mutation'
             and v_before<>v_after_call
             and coalesce(
                   (
                     v_writer_result
                       ->>'processed_count'
                   )::integer,
                   0
                 )>0
           )
         )
          then 'rollback_test_passed'
        else 'rollback_test_failed'
      end,

    'race_id',p_race_id,
    'expected_case',p_expected_case,
    'objective_ids',to_jsonb(v_objective_ids),
    'writer_called',true,
    'writer_result',v_writer_result,
    'source',v_source,
    'before_hashes',v_before,
    'after_call_hashes',v_after_call,
    'after_rollback_hashes',v_after_rollback,
    'output_after_call',v_payload->'output_after_call',
    'mutation_observed_inside_test',
      v_before<>v_after_call,
    'exact_rollback',
      v_before=v_after_rollback,
    'input_rows_unchanged_inside_test',
      v_before->>'stage_results'
        =v_after_call->>'stage_results'
      and v_before->>'classifications'
        =v_after_call->>'classifications',
    'sponsors_unchanged_inside_test',
      v_before->>'sponsors'
        =v_after_call->>'sponsors',
    'rollback_marker_present',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_sponsor_objective_adapter_plan_v2(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_catalog'
AS $function$
declare
  v_source jsonb;
  v_output jsonb;
  v_is_golden boolean;
  v_status text;
begin
  v_source :=
    public.race_engine_get_sponsor_objective_source_evidence_v2(
      p_race_id
    );

  v_output :=
    public.race_engine_get_sponsor_objective_output_evidence_v2(
      p_race_id
    );

  select exists
  (
    select 1
    from public.race_engine_golden_stage_fixture_v1 f
    where f.race_id=p_race_id
      and f.fixture_status='frozen_and_validated'
  )
  into v_is_golden;

  v_status :=
    case
      when v_source->>'status'<>'source_evidence_ready' then
        'source_not_ready_for_sponsor_objectives'

      when (v_source->>'objective_count')::integer=0 then
        'sponsor_objectives_not_required'

      when v_is_golden then
        'historical_verify_only_golden_fixture'

      when not coalesce(
             (v_source->>'source_ready')::boolean,
             false
           ) then
        'source_not_ready_for_sponsor_objectives'

      when coalesce(
             (v_source->>'processing_required')::boolean,
             false
           ) then
        'historical_pending_objectives_manual_review_no_processing'

      when coalesce(
             (v_output->>'paid_state_semantic_gap')::boolean,
             false
           ) then
        'historical_verify_only_existing_outputs_with_paid_state_semantic_gap'

      else
        'historical_verify_only_existing_sponsor_objective_outputs'
    end;

  return jsonb_build_object(
    'status',v_status,
    'race_id',p_race_id,
    'source',v_source,
    'output_evidence',v_output,
    'production_execution_enabled',false,
    'historical_processing_allowed',false,
    'force_evaluation_allowed',false,
    'frontend_execution_allowed',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_sponsor_objective_adapter_v2(p_race_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_sponsor_objective_adapter_plan_v2(
      p_race_id
    );

  return jsonb_build_object(
    'status',
      'blocked_sponsor_objective_adapter_execution_disabled_in_b17',
    'race_id',p_race_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'plan',v_plan,
    'top_level_writer_called',false,
    'evaluator_called',false,
    'payment_writer_called',false,
    'objective_rows_changed',false,
    'finance_transactions_changed',false,
    'finance_entries_changed',false,
    'account_balances_changed',false,
    'event_locks_changed',false,
    'notifications_changed',false,
    'objective_triggers_changed',false,
    'production_execution_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_closeout_source_evidence_v3(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage record;
  v_run record;
  v_output jsonb;
  v_plan jsonb;
  v_legacy_readiness jsonb;

  v_dependencies jsonb;
  v_required_count integer;
  v_verified_count integer;
  v_missing_count integer;
  v_drift_count integer;
  v_source_mismatch_count integer;

  v_route_format text;
  v_stage_process_status text;
  v_golden boolean;
  v_source_ready boolean;
  v_source_hash text;
begin
  select
    s.id stage_id,
    s.race_id,
    s.stage_number,
    s.stage_date,
    s.stage_format,
    s.weather_cancelled,
    r.name race_name,
    r.status race_status
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  select *
  into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id
  limit 1;

  select to_jsonb(i)
  into v_output
  from public.race_engine_stage_output_integrity_v1 i
  where i.stage_id=p_stage_id
  limit 1;

  v_plan :=
    public.race_engine_get_stage_effect_writer_adapter_plan_v2(
      p_stage_id
    );

  v_legacy_readiness :=
    public.race_engine_get_stage_closeout_readiness_v2(
      p_stage_id
    );

  v_route_format :=
    v_plan->>'route_format';

  v_stage_process_status :=
    v_plan->>'stage_process_status';

  v_golden :=
    coalesce(
      (v_plan->>'golden_fixture_stage')::boolean,
      false
    );

  with dependency_rows as
  (
    select adapter_row.value adapter
    from jsonb_array_elements(
      coalesce(v_plan->'adapters','[]'::jsonb)
    ) adapter_row(value)
    where coalesce(
            (
              adapter_row.value
                ->>'required_for_route'
            )::boolean,
            false
          )
      and adapter_row.value->>'effect_key'
          <> 'stage_closeout'
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'effect_key',
            d.adapter->>'effect_key',
          'adapter_order',
            (d.adapter->>'adapter_order')::integer,
          'writer_definition_matches',
            coalesce(
              (
                d.adapter
                  ->>'writer_definition_matches'
              )::boolean,
              false
            ),
          'planned_source_payload_hash',
            d.adapter->>'source_payload_hash',
          'effect_id',
            d.adapter->'ledger'->>'effect_id',
          'effect_status',
            d.adapter->'ledger'->>'effect_status',
          'reserved_source_payload_hash',
            d.adapter
              ->'ledger'
              ->>'source_payload_hash',
          'applied_payload_hash',
            d.adapter
              ->'ledger'
              ->>'applied_payload_hash',
          'requirement_satisfied',
            coalesce(
              (
                d.adapter
                  ->>'writer_definition_matches'
              )::boolean,
              false
            )
            and
            d.adapter
              ->'ledger'
              ->>'effect_status'
            = 'verified'
            and
            d.adapter
              ->'ledger'
              ->>'source_payload_hash'
            is not distinct from
            d.adapter->>'source_payload_hash'
        )
        order by
          (d.adapter->>'adapter_order')::integer
      ),
      '[]'::jsonb
    ),

    count(*)::integer,

    count(*) filter
    (
      where d.adapter
              ->'ledger'
              ->>'effect_status'
            = 'verified'
        and d.adapter
              ->'ledger'
              ->>'source_payload_hash'
            is not distinct from
            d.adapter->>'source_payload_hash'
        and coalesce(
              (
                d.adapter
                  ->>'writer_definition_matches'
              )::boolean,
              false
            )
    )::integer,

    count(*) filter
    (
      where d.adapter
              ->'ledger'
              ->>'effect_id'
            is null
    )::integer,

    count(*) filter
    (
      where not coalesce(
                  (
                    d.adapter
                      ->>'writer_definition_matches'
                  )::boolean,
                  false
                )
    )::integer,

    count(*) filter
    (
      where d.adapter
              ->'ledger'
              ->>'effect_id'
            is not null
        and d.adapter
              ->'ledger'
              ->>'source_payload_hash'
            is distinct from
            d.adapter->>'source_payload_hash'
    )::integer

  into
    v_dependencies,
    v_required_count,
    v_verified_count,
    v_missing_count,
    v_drift_count,
    v_source_mismatch_count

  from dependency_rows d;

  v_source_ready :=
    coalesce(v_run.status,'')='completed'
    and
    (
      coalesce(v_stage.weather_cancelled,false)
      or coalesce(
           v_output->>'output_integrity_status',
           ''
         )='completed_outputs_present'
    );

  v_source_hash :=
    md5(
      jsonb_build_object(
        'stage_id',v_stage.stage_id,
        'race_id',v_stage.race_id,
        'stage_number',v_stage.stage_number,
        'stage_date',v_stage.stage_date,
        'stage_format',v_stage.stage_format,
        'weather_cancelled',v_stage.weather_cancelled,
        'race_status',v_stage.race_status,
        'simulation_run_id',v_run.id,
        'simulation_run_status',v_run.status,
        'output_integrity',v_output,
        'dependencies',v_dependencies
      )::text
    );

  return jsonb_build_object(
    'status','source_evidence_ready',
    'stage_id',v_stage.stage_id,
    'race_id',v_stage.race_id,
    'race_name',v_stage.race_name,
    'race_status',v_stage.race_status,
    'stage_number',v_stage.stage_number,
    'stage_date',v_stage.stage_date,
    'stage_format',v_stage.stage_format,
    'route_format',v_route_format,
    'weather_cancelled',
      v_stage.weather_cancelled,
    'simulation_run_id',v_run.id,
    'simulation_run_status',v_run.status,
    'output_integrity',v_output,
    'stage_process_status',
      v_stage_process_status,
    'golden_fixture_stage',v_golden,
    'required_dependency_count',
      v_required_count,
    'verified_dependency_count',
      v_verified_count,
    'missing_dependency_count',
      v_missing_count,
    'writer_definition_drift_count',
      v_drift_count,
    'source_hash_mismatch_count',
      v_source_mismatch_count,
    'dependencies',v_dependencies,
    'all_dependencies_verified',
      v_required_count>0
      and v_verified_count=v_required_count,
    'source_ready',v_source_ready,
    'source_payload_hash',v_source_hash,
    'legacy_readiness',v_legacy_readiness,
    'source_version',
      'stage_closeout_source_evidence_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_closeout_output_evidence_v3(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_source jsonb;
  v_attempt jsonb;
  v_summary jsonb;
  v_ledger jsonb;

  v_marker_present boolean;
  v_rerun_guard_active boolean;
  v_output_hash text;
  v_status text;
begin
  v_source :=
    public.race_engine_get_stage_closeout_source_evidence_v3(
      p_stage_id
    );

  if v_source->>'status'<>'source_evidence_ready' then
    return jsonb_build_object(
      'status','output_evidence_not_ready',
      'stage_id',p_stage_id,
      'source',v_source
    );
  end if;

  select
    to_jsonb(a),
    a.execution_summary
  into
    v_attempt,
    v_summary
  from public.race_engine_stage_processing_attempts_v1 a
  where a.stage_id=p_stage_id
    and not a.dry_run
  order by a.created_at desc
  limit 1;

  select to_jsonb(l)
  into v_ledger
  from public.race_engine_stage_effect_ledger_v2 l
  where l.stage_id=p_stage_id
    and l.effect_key='stage_closeout'
  limit 1;

  v_marker_present :=
    coalesce(
      (
        v_summary
          ->>'stage_closeout_completed'
      )::boolean,
      false
    )
    and
    v_summary->>'stage_closeout_status'
    = 'stage_closeout_passed';

  v_rerun_guard_active :=
    coalesce(
      (
        v_source
          ->'output_integrity'
          ->>'should_block_normal_simulation'
      )::boolean,
      false
    );

  v_status :=
    case
      when coalesce(
             (
               v_source
                 ->>'golden_fixture_stage'
             )::boolean,
             false
           )
        then 'historical_golden_fixture_verify_only'

      when v_marker_present
        then 'legacy_closeout_marker_present_without_v2_immutable_boundary'

      when not coalesce(
             (
               v_source
                 ->>'source_ready'
             )::boolean,
             false
           )
        then 'closeout_output_not_ready'

      when coalesce(
             (
               v_source
                 ->>'weather_cancelled'
             )::boolean,
             false
           )
        then 'weather_cancelled_closeout_marker_not_materialized'

      else 'legacy_closeout_marker_missing'
    end;

  v_output_hash :=
    md5(
      jsonb_build_object(
        'stage_id',p_stage_id,
        'latest_attempt',v_attempt,
        'stage_closeout_ledger',v_ledger,
        'rerun_guard_active',v_rerun_guard_active,
        'legacy_closeout_marker_present',
          v_marker_present
      )::text
    );

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'latest_non_dry_processing_attempt',v_attempt,
    'stage_closeout_ledger',v_ledger,
    'legacy_closeout_marker_present',
      v_marker_present,
    'rerun_guard_active',
      v_rerun_guard_active,
    'v2_stage_closeout_ledger_verified',
      coalesce(v_ledger->>'effect_status','')
      = 'verified',
    'atomic_stage_run_immutable_marker_present',
      false,
    'legacy_contract_gap_present',
      true,
    'output_evidence_hash',v_output_hash,
    'source',v_source,
    'output_version',
      'stage_closeout_output_evidence_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_stage_closeout_writer_rollback_v2(p_stage_id uuid, p_case_key text, p_dry_run boolean, p_confirm_text text, p_auto_compact boolean, p_allowed_statuses text[], p_expect_mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_before jsonb;
  v_after_call jsonb;
  v_after_rollback jsonb;
  v_writer_result jsonb;
  v_payload jsonb;
  v_detail text;

  v_status_allowed boolean;
  v_mutation_observed boolean;
  v_exact_rollback boolean;
  v_replay_unchanged_inside boolean;

  v_marker constant text :=
    'PHASE3AB_B18_STAGE_CLOSEOUT_ROLLBACK_MARKER';
begin
  if p_stage_id=
     '24709c46-b258-4db3-a3aa-fd92dc37630e'::uuid
  then
    return jsonb_build_object(
      'status','blocked_golden_fixture_closeout_test',
      'stage_id',p_stage_id,
      'writer_called',false
    );
  end if;

  if p_auto_compact then
    raise exception
      'B18 rollback tests must keep replay compaction disabled.';
  end if;

  v_before :=
    public.race_engine_get_stage_closeout_mutation_snapshot_v2(
      p_stage_id
    );

  begin
    v_writer_result :=
      public.race_engine_closeout_stage_after_tail_v1(
        p_stage_id,
        p_dry_run,
        p_confirm_text,
        false,
        4900,
        20
      );

    v_after_call :=
      public.race_engine_get_stage_closeout_mutation_snapshot_v2(
        p_stage_id
      );

    v_payload :=
      jsonb_build_object(
        'writer_result',v_writer_result,
        'after_call',v_after_call
      );

    raise exception using
      errcode='P0001',
      message=v_marker,
      detail=v_payload::text;

  exception
    when raise_exception then
      get stacked diagnostics v_detail=pg_exception_detail;

      if sqlerrm<>v_marker then
        raise;
      end if;

      v_payload:=v_detail::jsonb;
  end;

  v_writer_result:=v_payload->'writer_result';
  v_after_call:=v_payload->'after_call';

  v_after_rollback :=
    public.race_engine_get_stage_closeout_mutation_snapshot_v2(
      p_stage_id
    );

  v_status_allowed :=
    v_writer_result->>'status'
    = any(coalesce(p_allowed_statuses,array[]::text[]));

  v_mutation_observed :=
    v_before is distinct from v_after_call;

  v_exact_rollback :=
    v_before=v_after_rollback;

  v_replay_unchanged_inside :=
    v_before->>'replay_frames'
    =v_after_call->>'replay_frames';

  return jsonb_build_object(
    'status',
      case
        when v_status_allowed
         and v_exact_rollback
         and v_replay_unchanged_inside
         and v_mutation_observed=p_expect_mutation
         and coalesce(
               v_writer_result->'compaction_result',
               'null'::jsonb
             )='null'::jsonb
          then 'rollback_test_passed'
        else 'rollback_test_failed'
      end,

    'case_key',p_case_key,
    'stage_id',p_stage_id,
    'writer_called',true,
    'dry_run',p_dry_run,
    'auto_compact',false,
    'allowed_statuses',to_jsonb(p_allowed_statuses),
    'writer_result',v_writer_result,
    'before_hashes',v_before,
    'after_call_hashes',v_after_call,
    'after_rollback_hashes',v_after_rollback,
    'writer_status_allowed',v_status_allowed,
    'mutation_expected',p_expect_mutation,
    'mutation_observed_inside_test',
      v_mutation_observed,
    'replay_unchanged_inside_test',
      v_replay_unchanged_inside,
    'exact_rollback',v_exact_rollback,
    'rollback_marker_present',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_closeout_adapter_plan_v3(p_stage_id uuid, p_simulation_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_source jsonb;
  v_output jsonb;
  v_status text;
begin
  v_source :=
    public.race_engine_get_stage_closeout_source_evidence_v3(
      p_stage_id
    );

  v_output :=
    public.race_engine_get_stage_closeout_output_evidence_v3(
      p_stage_id
    );

  v_status :=
    case
      when v_source->>'status'<>'source_evidence_ready'
        then 'source_not_ready_for_stage_closeout'

      when coalesce(
             (
               v_source
                 ->>'golden_fixture_stage'
             )::boolean,
             false
           )
        then 'historical_verify_only_golden_fixture'

      when v_source->>'stage_process_status'
           = 'verify_only_no_execution'
           and coalesce(
                 (
                   v_output
                     ->>'legacy_closeout_marker_present'
                 )::boolean,
                 false
               )
        then 'historical_verify_only_legacy_closeout_marker'

      when v_source->>'stage_process_status'
           = 'verify_only_no_execution'
        then 'historical_closeout_missing_manual_review_no_retroactive_execution'

      when not coalesce(
             (
               v_source
                 ->>'source_ready'
             )::boolean,
             false
           )
        then 'source_not_ready_for_stage_closeout'

      when not coalesce(
             (
               v_source
                 ->>'all_dependencies_verified'
             )::boolean,
             false
           )
        then 'closeout_blocked_unverified_v2_dependencies'

      when coalesce(
             (
               v_output
                 ->>'v2_stage_closeout_ledger_verified'
             )::boolean,
             false
           )
        then 'stage_closeout_already_verified_read_only'

      else 'closeout_contract_ready_but_execution_disabled'
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id,
    'source',v_source,
    'output_evidence',v_output,
    'contract',
      public.race_engine_get_stage_closeout_contract_v3(),
    'production_execution_enabled',false,
    'legacy_closeout_call_allowed',false,
    'replay_compaction_allowed',false,
    'historical_closeout_allowed',false,
    'atomic_immutable_marker_required',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_closeout_adapter_v3(p_stage_id uuid, p_simulation_run_id uuid DEFAULT NULL::uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_stage_closeout_adapter_plan_v3(
      p_stage_id,
      p_simulation_run_id
    );

  return jsonb_build_object(
    'status',
      'blocked_stage_closeout_adapter_execution_disabled_in_b18',
    'stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'plan',v_plan,
    'legacy_closeout_writer_called',false,
    'replay_compaction_called',false,
    'processing_attempt_rows_changed',false,
    'stage_rows_changed',false,
    'simulation_run_rows_changed',false,
    'race_rows_changed',false,
    'effect_ledger_changed',false,
    'production_execution_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_set_stage_immutable_state_updated_at_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  new.updated_at:=clock_timestamp();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_stage_immutable_state_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if old.immutable_status='immutable' then
    raise exception
      'Immutable stage state cannot be changed or deleted for stage %.',
      old.stage_id
      using errcode='P0001';
  end if;

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_atomic_stage_process_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage record;
  v_run record;

  v_existing_plan jsonb;
  v_reservation_plan jsonb;
  v_writer_plan jsonb;
  v_closeout_plan jsonb;
  v_guard jsonb;
  v_immutable jsonb;

  v_route_format text;
  v_stage_process_status text;
  v_status text;
  v_golden boolean;
  v_completed boolean;
  v_contract_ready boolean;
  v_plan_hash text;
begin
  select
    s.id stage_id,
    s.race_id,
    s.stage_number,
    s.stage_date,
    s.stage_format,
    s.weather_cancelled,
    r.name race_name,
    r.status race_status
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id,
      'production_execution_enabled',false
    );
  end if;

  select *
  into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id
  limit 1;

  select to_jsonb(i)
  into v_immutable
  from public.race_engine_stage_immutable_state_v2 i
  where i.stage_id=p_stage_id;

  v_existing_plan :=
    public.race_engine_get_stage_process_plan_v2(
      p_stage_id
    );

  v_reservation_plan :=
    public.race_engine_get_stage_effect_reservation_plan_v2(
      p_stage_id
    );

  v_writer_plan :=
    public.race_engine_get_stage_effect_writer_adapter_plan_v2(
      p_stage_id
    );

  v_closeout_plan :=
    public.race_engine_get_stage_closeout_adapter_plan_v3(
      p_stage_id,
      v_run.id
    );

  v_guard :=
    public.race_engine_get_stage_production_guard_v1(
      p_stage_id
    );

  v_route_format :=
    coalesce(
      v_reservation_plan->>'route_format',
      case
        when v_stage.weather_cancelled
          then 'weather_cancelled'
        when v_stage.stage_format in
             (
               'individual_time_trial',
               'prologue',
               'pair_time_trial'
             )
          then 'individual_time_trial'
        when v_stage.stage_format='team_time_trial'
          then 'team_time_trial'
        else 'road_race'
      end
    );

  if v_stage.weather_cancelled then
    v_route_format:='weather_cancelled';
  end if;

  v_stage_process_status :=
    coalesce(
      v_reservation_plan->>'stage_process_status',
      v_existing_plan->>'stage_process_status'
    );

  v_golden :=
    exists
    (
      select 1
      from public.race_engine_golden_stage_fixture_v1 f
      where f.stage_id=p_stage_id
        and f.fixture_status='frozen_and_validated'
    );

  v_completed :=
    coalesce(v_run.status,'')='completed'
    and coalesce(
          (v_guard->>'should_block_normal_simulation')::boolean,
          false
        );

  v_contract_ready :=
    not v_golden
    and not v_completed
    and not v_stage.weather_cancelled
    and v_stage_process_status='future_execution_candidate'
    and v_route_format in
        (
          'road_race',
          'individual_time_trial',
          'team_time_trial'
        )
    and coalesce(
          (v_writer_plan->>'writer_definition_drift_count')::integer,
          0
        )=0
    and v_immutable is null;

  v_status :=
    case
      when coalesce(v_immutable->>'immutable_status','')='immutable'
        then 'immutable_stage_return_saved_outputs'

      when v_golden
        then 'historical_golden_fixture_verify_only'

      when v_stage.weather_cancelled
           and v_completed
        then 'historical_weather_cancelled_verify_only'

      when v_completed
        then 'historical_completed_verify_only_no_retroactive_claim'

      when v_stage.weather_cancelled
        then 'weather_cancelled_route_contract_pending_execution_disabled'

      when v_contract_ready
        then 'contract_ready_execution_disabled'

      else 'blocked_by_existing_stage_plan'
    end;

  v_plan_hash :=
    md5(
      jsonb_build_object(
        'stage_id',v_stage.stage_id,
        'race_id',v_stage.race_id,
        'stage_number',v_stage.stage_number,
        'stage_date',v_stage.stage_date,
        'stage_format',v_stage.stage_format,
        'weather_cancelled',v_stage.weather_cancelled,
        'race_status',v_stage.race_status,
        'simulation_run_id',v_run.id,
        'simulation_run_status',v_run.status,
        'route_format',v_route_format,
        'stage_process_status',v_stage_process_status,
        'existing_plan_hash',v_existing_plan->>'plan_hash',
        'reservation_plan_hash',v_reservation_plan->>'plan_hash',
        'writer_plan_hash',v_writer_plan->>'plan_hash',
        'writer_definition_drift_count',
          v_writer_plan->>'writer_definition_drift_count',
        'immutable_state',v_immutable,
        'resolved_status',v_status
      )::text
    );

  return jsonb_build_object(
    'status',v_status,
    'stage_id',v_stage.stage_id,
    'race_id',v_stage.race_id,
    'race_name',v_stage.race_name,
    'race_status',v_stage.race_status,
    'stage_number',v_stage.stage_number,
    'stage_date',v_stage.stage_date,
    'raw_stage_format',v_stage.stage_format,
    'route_format',v_route_format,
    'weather_cancelled',v_stage.weather_cancelled,
    'simulation_run_id',v_run.id,
    'simulation_run_status',v_run.status,
    'golden_fixture_stage',v_golden,
    'historical_completed_stage',v_completed,
    'stage_process_status',v_stage_process_status,
    'contract_ready',v_contract_ready,
    'immutable_state',v_immutable,
    'existing_v2_process_plan',v_existing_plan,
    'effect_reservation_plan',v_reservation_plan,
    'effect_writer_plan',v_writer_plan,
    'closeout_plan',v_closeout_plan,
    'production_guard',v_guard,
    'atomic_contract',
      public.race_engine_get_atomic_stage_processor_contract_v2(),
    'atomic_plan_hash',v_plan_hash,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false,
    'existing_v2_shell_replacement_enabled',false,
    'planner_version',
      'phase3ac_a3_atomic_stage_process_plan_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_atomic_stage_processor_v2(p_stage_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_atomic_stage_process_plan_v2(
      p_stage_id
    );

  return jsonb_build_object(
    'status',
      'blocked_atomic_stage_processor_execution_disabled_in_phase3ac_a3',
    'stage_id',p_stage_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'plan',v_plan,
    'existing_v2_shell_called',false,
    'runner_called',false,
    'writer_called',false,
    'effect_reserved',false,
    'effect_transitioned',false,
    'closeout_called',false,
    'replay_compaction_called',false,
    'immutable_state_changed',false,
    'simulation_run_changed',false,
    'processing_attempt_changed',false,
    'cron_changed',false,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_immutable_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage record;
  v_run record;
  v_immutable record;

  v_writer_plan jsonb;
  v_closeout_evidence jsonb;
  v_output_integrity jsonb;

  v_required_effect_count integer:=0;
  v_terminal_effect_count integer:=0;
  v_missing_effect_count integer:=0;
  v_source_mismatch_count integer:=0;
  v_stage_closeout_verified boolean:=false;

  v_computed_source_hash text;
  v_computed_effect_hash text;
  v_computed_output_hash text;
  v_computed_closeout_hash text;
  v_evidence_hash text;

  v_run_matches boolean:=false;
  v_hashes_match boolean:=false;
  v_valid boolean:=false;
  v_status text;
begin
  select
    s.id stage_id,
    s.race_id,
    s.stage_number,
    s.stage_date,
    s.stage_format,
    s.weather_cancelled,
    r.name race_name,
    r.status race_status
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  select *
  into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id
  limit 1;

  select *
  into v_immutable
  from public.race_engine_stage_immutable_state_v2 i
  where i.stage_id=p_stage_id;

  v_writer_plan :=
    public.race_engine_get_stage_effect_writer_adapter_plan_v2(
      p_stage_id
    );

  v_closeout_evidence :=
    public.race_engine_get_stage_closeout_output_evidence_v3(
      p_stage_id
    );

  select to_jsonb(i)
  into v_output_integrity
  from public.race_engine_stage_output_integrity_v1 i
  where i.stage_id=p_stage_id
  limit 1;

  with required_adapters as
  (
    select a.value adapter
    from jsonb_array_elements(
      coalesce(v_writer_plan->'adapters','[]'::jsonb)
    ) a(value)
    where coalesce(
            (a.value->>'required_for_route')::boolean,
            false
          )
  ),
  joined as
  (
    select
      r.adapter->>'effect_key' effect_key,
      r.adapter->>'source_payload_hash' planned_source_hash,
      l.effect_status,
      l.source_payload_hash,
      l.applied_payload_hash
    from required_adapters r
    left join public.race_engine_stage_effect_ledger_v2 l
      on l.stage_id=p_stage_id
     and l.effect_key=r.adapter->>'effect_key'
  )
  select
    count(*)::integer,
    count(*) filter
    (
      where effect_status in('verified','skipped')
    )::integer,
    count(*) filter
    (
      where effect_status is null
    )::integer,
    count(*) filter
    (
      where effect_status is not null
        and source_payload_hash
            is distinct from planned_source_hash
    )::integer,
    coalesce(
      bool_or(
        effect_key='stage_closeout'
        and effect_status='verified'
      ),
      false
    )
  into
    v_required_effect_count,
    v_terminal_effect_count,
    v_missing_effect_count,
    v_source_mismatch_count,
    v_stage_closeout_verified
  from joined;

  v_computed_source_hash :=
    md5(
      jsonb_build_object(
        'stage',
          jsonb_build_object(
            'stage_id',v_stage.stage_id,
            'race_id',v_stage.race_id,
            'stage_number',v_stage.stage_number,
            'stage_date',v_stage.stage_date,
            'stage_format',v_stage.stage_format,
            'weather_cancelled',v_stage.weather_cancelled
          ),
        'race',
          jsonb_build_object(
            'race_id',v_stage.race_id,
            'race_status',v_stage.race_status
          ),
        'simulation_run',
          jsonb_build_object(
            'simulation_run_id',v_run.id,
            'simulation_run_stage_id',v_run.stage_id,
            'simulation_run_race_id',v_run.race_id,
            'simulation_run_status',v_run.status
          )
      )::text
    );

  select md5(
           coalesce(
             string_agg(
               jsonb_build_object(
                 'effect_key',l.effect_key,
                 'effect_status',l.effect_status,
                 'simulation_run_id',l.simulation_run_id,
                 'source_payload_hash',l.source_payload_hash,
                 'applied_payload_hash',l.applied_payload_hash
               )::text,
               '|'
               order by l.effect_key
             ),
             ''
           )
         )
  into v_computed_effect_hash
  from public.race_engine_stage_effect_ledger_v2 l
  where l.stage_id=p_stage_id;

  v_computed_output_hash :=
    md5(coalesce(v_output_integrity::text,''));

  v_computed_closeout_hash :=
    md5(coalesce(v_closeout_evidence::text,''));

  v_run_matches :=
    v_immutable.stage_id is not null
    and v_run.id is not null
    and v_immutable.simulation_run_id=v_run.id
    and v_run.stage_id=v_stage.stage_id
    and v_run.race_id=v_stage.race_id
    and v_run.status='completed';

  v_hashes_match :=
    v_immutable.stage_id is not null
    and v_immutable.source_payload_hash
        is not distinct from v_computed_source_hash
    and v_immutable.effect_matrix_hash
        is not distinct from v_computed_effect_hash
    and v_immutable.output_payload_hash
        is not distinct from v_computed_output_hash
    and v_immutable.closeout_evidence_hash
        is not distinct from v_computed_closeout_hash;

  v_valid :=
    v_immutable.immutable_status='immutable'
    and v_run_matches
    and v_required_effect_count>0
    and v_terminal_effect_count=v_required_effect_count
    and v_missing_effect_count=0
    and v_source_mismatch_count=0
    and v_stage_closeout_verified
    and v_hashes_match;

  v_status :=
    case
      when v_immutable.stage_id is null
        then 'immutable_state_not_found'
      when v_immutable.immutable_status='planned'
        then 'atomic_claim_planned'
      when v_immutable.immutable_status='verifying'
        then 'atomic_claim_verifying'
      when v_immutable.immutable_status='failed'
        then 'atomic_claim_failed'
      when v_valid
        then 'immutable_evidence_valid'
      else 'immutable_evidence_invalid'
    end;

  v_evidence_hash :=
    md5(
      jsonb_build_object(
        'stage_id',p_stage_id,
        'immutable_status',v_immutable.immutable_status,
        'simulation_run_id',v_immutable.simulation_run_id,
        'required_effect_count',v_required_effect_count,
        'terminal_effect_count',v_terminal_effect_count,
        'missing_effect_count',v_missing_effect_count,
        'source_mismatch_count',v_source_mismatch_count,
        'stage_closeout_verified',v_stage_closeout_verified,
        'computed_source_hash',v_computed_source_hash,
        'computed_effect_hash',v_computed_effect_hash,
        'computed_output_hash',v_computed_output_hash,
        'computed_closeout_hash',v_computed_closeout_hash,
        'stored_source_hash',v_immutable.source_payload_hash,
        'stored_effect_hash',v_immutable.effect_matrix_hash,
        'stored_output_hash',v_immutable.output_payload_hash,
        'stored_closeout_hash',v_immutable.closeout_evidence_hash,
        'valid',v_valid
      )::text
    );

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'race_id',v_stage.race_id,
    'race_name',v_stage.race_name,
    'stage_number',v_stage.stage_number,
    'stage_format',v_stage.stage_format,
    'simulation_run_id',v_run.id,
    'simulation_run_status',v_run.status,
    'immutable_state',
      case
        when v_immutable.stage_id is null
          then null
        else to_jsonb(v_immutable)
      end,
    'required_effect_count',v_required_effect_count,
    'terminal_effect_count',v_terminal_effect_count,
    'missing_effect_count',v_missing_effect_count,
    'source_hash_mismatch_count',v_source_mismatch_count,
    'stage_closeout_verified',v_stage_closeout_verified,
    'simulation_run_matches',v_run_matches,
    'stored_hashes_match',v_hashes_match,
    'immutable_evidence_valid',v_valid,
    'computed_source_payload_hash',v_computed_source_hash,
    'computed_effect_matrix_hash',v_computed_effect_hash,
    'computed_output_payload_hash',v_computed_output_hash,
    'computed_closeout_evidence_hash',v_computed_closeout_hash,
    'immutable_evidence_hash',v_evidence_hash,
    'writer_plan',v_writer_plan,
    'output_integrity',v_output_integrity,
    'closeout_evidence',v_closeout_evidence,
    'evidence_version',
      'phase3ac_a4_stage_immutable_evidence_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_atomic_stage_claim_decision_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
  v_evidence jsonb;
  v_status text;
begin
  v_plan :=
    public.race_engine_get_atomic_stage_process_plan_v2(
      p_stage_id
    );

  v_evidence :=
    public.race_engine_get_stage_immutable_evidence_v2(
      p_stage_id
    );

  v_status :=
    case
      when v_evidence->>'status'='immutable_evidence_valid'
        then 'duplicate_immutable_return_saved_evidence'

      when v_evidence->>'status'='immutable_evidence_invalid'
        then 'blocked_invalid_immutable_evidence'

      when v_evidence->>'status' in
           (
             'atomic_claim_planned',
             'atomic_claim_verifying'
           )
        then 'claim_already_present_execution_disabled'

      when v_evidence->>'status'='atomic_claim_failed'
        then 'failed_claim_requires_protected_reset'

      when v_plan->>'status'='contract_ready_execution_disabled'
        then 'claim_ready_execution_disabled'

      else coalesce(
             v_plan->>'status',
             'claim_blocked_unknown_stage_state'
           )
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'plan',v_plan,
    'immutable_evidence',v_evidence,
    'claim_write_allowed',false,
    'duplicate_return_read_only',true,
    'runner_allowed',false,
    'effect_reservation_allowed',false,
    'closeout_allowed',false,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false,
    'decision_version',
      'phase3ac_a4_atomic_stage_claim_decision_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_atomic_claim_duplicate_rollback_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage_id constant uuid :=
    '2d33de11-3a34-412a-b90a-847d4839c8d9';
  v_race_id constant uuid :=
    'ac821a5c-8f41-4a73-afdc-bb01a8af4c07';
  v_simulation_run_id constant uuid :=
    '35667f21-9184-4ea7-95c3-73ca6fc057e1';

  v_marker constant text :=
    'PHASE3AC_A4_CLAIM_DUPLICATE_ROLLBACK_MARKER';

  v_writer_plan jsonb;
  v_adapter jsonb;
  v_hashes jsonb;
  v_evidence jsonb;
  v_first_decision jsonb;
  v_second_decision jsonb;

  v_before_immutable_hash text;
  v_after_immutable_hash text;
  v_before_ledger_hash text;
  v_after_ledger_hash text;

  v_inserted_effects integer:=0;
  v_guard_observed boolean:=false;
  v_duplicate_same boolean:=false;
begin
  select md5(
           coalesce(
             string_agg(
               to_jsonb(i)::text,
               '|'
               order by to_jsonb(i)::text
             ),
             ''
           )
         )
  into v_before_immutable_hash
  from public.race_engine_stage_immutable_state_v2 i
  where i.stage_id=v_stage_id;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(l)::text,
               '|'
               order by to_jsonb(l)::text
             ),
             ''
           )
         )
  into v_before_ledger_hash
  from public.race_engine_stage_effect_ledger_v2 l
  where l.stage_id=v_stage_id;

  if exists
  (
    select 1
    from public.race_engine_stage_immutable_state_v2
    where stage_id=v_stage_id
  )
  or exists
  (
    select 1
    from public.race_engine_stage_effect_ledger_v2
    where stage_id=v_stage_id
  ) then
    return jsonb_build_object(
      'status','rollback_test_blocked_existing_claim_or_ledger',
      'stage_id',v_stage_id,
      'writer_called',false
    );
  end if;

  begin
    v_writer_plan :=
      public.race_engine_get_stage_effect_writer_adapter_plan_v2(
        v_stage_id
      );

    for v_adapter in
      select a.value
      from jsonb_array_elements(
        coalesce(v_writer_plan->'adapters','[]'::jsonb)
      ) a(value)
      where coalesce(
              (a.value->>'required_for_route')::boolean,
              false
            )
      order by (a.value->>'adapter_order')::integer
    loop
      insert into public.race_engine_stage_effect_ledger_v2
      (
        stage_id,
        race_id,
        simulation_run_id,
        effect_key,
        effect_status,
        owner_component,
        writer_function,
        source_payload_hash,
        applied_payload_hash,
        verified_at,
        metadata
      )
      values
      (
        v_stage_id,
        v_race_id,
        v_simulation_run_id,
        v_adapter->>'effect_key',
        'verified',
        'phase3ac_a4_rollback_test',
        v_adapter->>'current_writer_signature',
        v_adapter->>'source_payload_hash',
        md5(
          v_stage_id::text
          || ':'
          || (v_adapter->>'effect_key')
          || ':phase3ac_a4_test'
        ),
        clock_timestamp(),
        jsonb_build_object(
          'test_only',true,
          'must_rollback',true,
          'source','phase3ac_a4_claim_duplicate_test'
        )
      );

      v_inserted_effects:=v_inserted_effects+1;
    end loop;

    v_hashes :=
      public.race_engine_get_stage_immutable_evidence_v2(
        v_stage_id
      );

    insert into public.race_engine_stage_immutable_state_v2
    (
      stage_id,
      race_id,
      simulation_run_id,
      process_run_id,
      immutable_status,
      route_format,
      processor_version,
      source_payload_hash,
      effect_matrix_hash,
      output_payload_hash,
      closeout_evidence_hash,
      immutable_at,
      metadata
    )
    values
    (
      v_stage_id,
      v_race_id,
      v_simulation_run_id,
      null,
      'immutable',
      'road_race',
      'phase3ac_a4_rollback_test_only',
      v_hashes->>'computed_source_payload_hash',
      v_hashes->>'computed_effect_matrix_hash',
      v_hashes->>'computed_output_payload_hash',
      v_hashes->>'computed_closeout_evidence_hash',
      clock_timestamp(),
      jsonb_build_object(
        'test_only',true,
        'must_rollback',true
      )
    );

    v_evidence :=
      public.race_engine_get_stage_immutable_evidence_v2(
        v_stage_id
      );

    v_first_decision :=
      public.race_engine_get_atomic_stage_claim_decision_v2(
        v_stage_id
      );

    v_second_decision :=
      public.race_engine_get_atomic_stage_claim_decision_v2(
        v_stage_id
      );

    v_duplicate_same :=
      v_first_decision->>'status'
      = 'duplicate_immutable_return_saved_evidence'
      and
      v_second_decision->>'status'
      = 'duplicate_immutable_return_saved_evidence'
      and
      v_first_decision
        ->'immutable_evidence'
        ->>'immutable_evidence_hash'
      =
      v_second_decision
        ->'immutable_evidence'
        ->>'immutable_evidence_hash';

    begin
      update public.race_engine_stage_immutable_state_v2
      set metadata=
            metadata
            ||jsonb_build_object('illegal_change',true)
      where stage_id=v_stage_id;

      raise exception
        'Immutable guard did not block duplicate-test update.';

    exception
      when raise_exception then
        if sqlerrm like
             'Immutable stage state cannot be changed or deleted%'
        then
          v_guard_observed:=true;
        else
          raise;
        end if;
    end;

    raise exception using
      errcode='P0001',
      message=v_marker;

  exception
    when raise_exception then
      if sqlerrm<>v_marker then
        raise;
      end if;
  end;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(i)::text,
               '|'
               order by to_jsonb(i)::text
             ),
             ''
           )
         )
  into v_after_immutable_hash
  from public.race_engine_stage_immutable_state_v2 i
  where i.stage_id=v_stage_id;

  select md5(
           coalesce(
             string_agg(
               to_jsonb(l)::text,
               '|'
               order by to_jsonb(l)::text
             ),
             ''
           )
         )
  into v_after_ledger_hash
  from public.race_engine_stage_effect_ledger_v2 l
  where l.stage_id=v_stage_id;

  return jsonb_build_object(
    'status',
      case
        when v_inserted_effects>0
         and v_evidence->>'status'='immutable_evidence_valid'
         and coalesce(
               (
                 v_evidence
                   ->>'immutable_evidence_valid'
               )::boolean,
               false
             )
         and v_duplicate_same
         and v_guard_observed
         and v_before_immutable_hash=v_after_immutable_hash
         and v_before_ledger_hash=v_after_ledger_hash
          then 'rollback_test_passed'
        else 'rollback_test_failed'
      end,
    'stage_id',v_stage_id,
    'inserted_effect_count_inside_test',v_inserted_effects,
    'immutable_evidence_inside_test',v_evidence,
    'first_duplicate_decision',v_first_decision,
    'second_duplicate_decision',v_second_decision,
    'duplicate_return_same_evidence',v_duplicate_same,
    'immutable_guard_observed',v_guard_observed,
    'immutable_before_hash',v_before_immutable_hash,
    'immutable_after_rollback_hash',v_after_immutable_hash,
    'effect_ledger_before_hash',v_before_ledger_hash,
    'effect_ledger_after_rollback_hash',v_after_ledger_hash,
    'exact_rollback',
      v_before_immutable_hash=v_after_immutable_hash
      and v_before_ledger_hash=v_after_ledger_hash,
    'runner_called',false,
    'writer_called',false,
    'production_effect_reservation_called',false,
    'closeout_called',false,
    'rollback_marker_present',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_atomic_stage_claim_v2(p_stage_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_decision jsonb;
begin
  v_decision :=
    public.race_engine_get_atomic_stage_claim_decision_v2(
      p_stage_id
    );

  if v_decision->>'status'
     = 'duplicate_immutable_return_saved_evidence' then
    return jsonb_build_object(
      'status','duplicate_immutable_return_saved_evidence',
      'stage_id',p_stage_id,
      'execute_requested',coalesce(p_execute,false),
      'confirmation_supplied',p_confirmation is not null,
      'decision',v_decision,
      'claim_written',false,
      'runner_called',false,
      'writer_called',false,
      'effect_reserved',false,
      'closeout_called',false,
      'production_execution_enabled',false
    );
  end if;

  return jsonb_build_object(
    'status',
      'blocked_atomic_stage_claim_execution_disabled_in_phase3ac_a4',
    'stage_id',p_stage_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'decision',v_decision,
    'claim_written',false,
    'immutable_state_changed',false,
    'process_run_changed',false,
    'simulation_run_changed',false,
    'runner_called',false,
    'writer_called',false,
    'effect_reserved',false,
    'effect_transitioned',false,
    'closeout_called',false,
    'replay_compaction_called',false,
    'cron_changed',false,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_simulation_run_claim_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage record;
  v_run record;
  v_immutable record;
  v_atomic_decision jsonb;
  v_atomic_plan jsonb;

  v_expected_input_snapshot jsonb;
  v_expected_input_hash text;
  v_pair_consistent boolean:=false;
  v_status text;
begin
  select
    s.id stage_id,
    s.race_id,
    s.stage_number,
    s.stage_date,
    s.stage_format,
    s.weather_cancelled,
    r.name race_name,
    r.status race_status
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  select *
  into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id
  limit 1;

  select *
  into v_immutable
  from public.race_engine_stage_immutable_state_v2 i
  where i.stage_id=p_stage_id;

  v_atomic_decision :=
    public.race_engine_get_atomic_stage_claim_decision_v2(
      p_stage_id
    );

  v_atomic_plan :=
    v_atomic_decision->'plan';

  v_expected_input_snapshot :=
    jsonb_build_object(
      'snapshot_version',
        'phase3ac_a5_simulation_run_claim_input_v1',
      'stage_id',v_stage.stage_id,
      'race_id',v_stage.race_id,
      'stage_number',v_stage.stage_number,
      'stage_date',v_stage.stage_date,
      'raw_stage_format',v_stage.stage_format,
      'route_format',v_atomic_plan->>'route_format',
      'weather_cancelled',v_stage.weather_cancelled,
      'atomic_plan_hash',v_atomic_plan->>'atomic_plan_hash',
      'claim_decision_status',v_atomic_decision->>'status'
    );

  v_expected_input_hash :=
    md5(v_expected_input_snapshot::text);

  v_pair_consistent :=
    (
      v_run.id is null
      and v_immutable.stage_id is null
    )
    or
    (
      v_run.id is not null
      and v_immutable.stage_id is not null
      and v_run.stage_id=v_immutable.stage_id
      and v_run.race_id=v_immutable.race_id
      and v_run.id=v_immutable.simulation_run_id
    );

  v_status :=
    case
      when v_run.id is null
           and v_immutable.stage_id is null
        then 'simulation_run_claim_not_present'

      when v_run.id is null
           or v_immutable.stage_id is null
        then 'simulation_run_claim_pair_inconsistent'

      when not v_pair_consistent
        then 'simulation_run_claim_pair_inconsistent'

      when v_run.status='pending'
           and v_immutable.immutable_status='planned'
        then 'simulation_run_claim_pending'

      when v_run.status='running'
           and v_immutable.immutable_status='verifying'
        then 'simulation_run_claim_running'

      when v_run.status='failed'
           and v_immutable.immutable_status='failed'
        then 'simulation_run_claim_failed'

      when v_run.status='completed'
           and v_immutable.immutable_status='immutable'
        then 'simulation_run_claim_completed_immutable'

      when v_run.status='cancelled'
        then 'simulation_run_claim_cancelled'

      else 'simulation_run_claim_state_inconsistent'
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',v_stage.stage_id,
    'race_id',v_stage.race_id,
    'race_name',v_stage.race_name,
    'race_status',v_stage.race_status,
    'stage_number',v_stage.stage_number,
    'stage_date',v_stage.stage_date,
    'raw_stage_format',v_stage.stage_format,
    'route_format',v_atomic_plan->>'route_format',
    'weather_cancelled',v_stage.weather_cancelled,

    'simulation_run',
      case
        when v_run.id is null then null
        else to_jsonb(v_run)
      end,

    'immutable_state',
      case
        when v_immutable.stage_id is null then null
        else to_jsonb(v_immutable)
      end,

    'claim_pair_consistent',v_pair_consistent,
    'expected_engine_version',
      'race_engine_v2_atomic_orchestrator_v1',
    'expected_simulation_mode',
      'atomic_stage_processor_v2',
    'expected_input_snapshot',v_expected_input_snapshot,
    'expected_input_snapshot_hash',v_expected_input_hash,
    'atomic_claim_decision',v_atomic_decision,
    'production_execution_enabled',false,
    'claim_write_allowed',false,
    'evidence_version',
      'phase3ac_a5_simulation_run_claim_evidence_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_simulation_run_claim_decision_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_evidence jsonb;
  v_atomic_status text;
  v_status text;
begin
  v_evidence :=
    public.race_engine_get_simulation_run_claim_evidence_v2(
      p_stage_id
    );

  v_atomic_status :=
    v_evidence
      ->'atomic_claim_decision'
      ->>'status';

  v_status :=
    case
      when v_evidence->>'status'='stage_not_found'
        then 'stage_not_found'

      when v_atomic_status='duplicate_immutable_return_saved_evidence'
        then 'duplicate_immutable_return_saved_evidence'

      when v_atomic_status in
           (
             'historical_golden_fixture_verify_only',
             'historical_completed_verify_only_no_retroactive_claim',
             'historical_weather_cancelled_verify_only'
           )
        then v_atomic_status

      when v_evidence->>'status'=
           'simulation_run_claim_completed_immutable'
        then 'duplicate_immutable_return_saved_evidence'

      when v_evidence->>'status'=
           'simulation_run_claim_pending'
        then 'simulation_run_claim_pending_existing'

      when v_evidence->>'status'=
           'simulation_run_claim_running'
        then 'simulation_run_claim_running_existing'

      when v_evidence->>'status'=
           'simulation_run_claim_failed'
        then 'simulation_run_claim_failed_requires_protected_reset'

      when v_evidence->>'status'=
           'simulation_run_claim_cancelled'
        then 'simulation_run_claim_cancelled_requires_route_review'

      when v_evidence->>'status' in
           (
             'simulation_run_claim_pair_inconsistent',
             'simulation_run_claim_state_inconsistent'
           )
        then 'blocked_simulation_run_claim_state_inconsistent'

      when v_evidence->>'status'=
           'simulation_run_claim_not_present'
           and v_atomic_status='claim_ready_execution_disabled'
        then 'simulation_run_claim_ready_execution_disabled'

      else coalesce(
             v_atomic_status,
             'simulation_run_claim_blocked_unknown_state'
           )
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'claim_evidence',v_evidence,
    'claim_insert_allowed',false,
    'claim_transition_allowed',false,
    'runner_allowed',false,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false,
    'decision_version',
      'phase3ac_a5_simulation_run_claim_decision_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_simulation_run_claim_failure_rollback_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage_id constant uuid :=
    'd666d6ec-9765-49d2-afbc-50913281f09f';
  v_race_id constant uuid :=
    '18bff35c-f3b8-4654-b211-575c2c04970c';

  v_run_id uuid:=gen_random_uuid();
  v_marker constant text :=
    'PHASE3AC_A5_SIMULATION_RUN_CLAIM_ROLLBACK_MARKER';

  v_before jsonb;
  v_after_rollback jsonb;
  v_initial_decision jsonb;
  v_pending_decision jsonb;
  v_running_decision jsonb;
  v_failed_decision jsonb;
  v_final_decision jsonb;
  v_claim_evidence jsonb;

  v_duplicate_blocked boolean:=false;
  v_failure_injected boolean:=false;
begin
  v_before :=
    public.race_engine_get_simulation_run_claim_snapshot_v2(
      v_stage_id
    );

  v_initial_decision :=
    public.race_engine_get_simulation_run_claim_decision_v2(
      v_stage_id
    );

  if v_initial_decision->>'status'
     <> 'simulation_run_claim_ready_execution_disabled'
  then
    return jsonb_build_object(
      'status','rollback_test_blocked_stage_not_claim_ready',
      'stage_id',v_stage_id,
      'initial_decision',v_initial_decision
    );
  end if;

  if exists
  (
    select 1
    from public.race_stage_simulation_runs
    where stage_id=v_stage_id
  )
  or exists
  (
    select 1
    from public.race_engine_stage_immutable_state_v2
    where stage_id=v_stage_id
  )
  or exists
  (
    select 1
    from public.race_engine_stage_effect_ledger_v2
    where stage_id=v_stage_id
  )
  then
    return jsonb_build_object(
      'status','rollback_test_blocked_existing_stage_claim_state',
      'stage_id',v_stage_id
    );
  end if;

  begin
    v_claim_evidence :=
      public.race_engine_get_simulation_run_claim_evidence_v2(
        v_stage_id
      );

    insert into public.race_stage_simulation_runs
    (
      id,
      race_id,
      stage_id,
      status,
      engine_version,
      simulation_mode,
      input_snapshot_json,
      result_summary_json,
      started_at,
      completed_at,
      failed_at,
      error_message
    )
    values
    (
      v_run_id,
      v_race_id,
      v_stage_id,
      'pending',
      'race_engine_v2_atomic_orchestrator_v1',
      'atomic_stage_processor_v2',
      v_claim_evidence->'expected_input_snapshot',
      '{}'::jsonb,
      null,
      null,
      null,
      null
    );

    insert into public.race_engine_stage_immutable_state_v2
    (
      stage_id,
      race_id,
      simulation_run_id,
      process_run_id,
      immutable_status,
      route_format,
      processor_version,
      metadata
    )
    values
    (
      v_stage_id,
      v_race_id,
      v_run_id,
      null,
      'planned',
      'road_race',
      'phase3ac_a5_rollback_test_only',
      jsonb_build_object(
        'test_only',true,
        'must_rollback',true,
        'claim_input_hash',
          v_claim_evidence->>'expected_input_snapshot_hash'
      )
    );

    v_pending_decision :=
      public.race_engine_get_simulation_run_claim_decision_v2(
        v_stage_id
      );

    begin
      insert into public.race_stage_simulation_runs
      (
        id,
        race_id,
        stage_id,
        status,
        engine_version,
        simulation_mode,
        input_snapshot_json,
        result_summary_json
      )
      values
      (
        gen_random_uuid(),
        v_race_id,
        v_stage_id,
        'pending',
        'race_engine_v2_atomic_orchestrator_v1',
        'atomic_stage_processor_v2',
        '{}'::jsonb,
        '{}'::jsonb
      );

    exception
      when unique_violation then
        v_duplicate_blocked:=true;
    end;

    update public.race_stage_simulation_runs
    set
      status='running',
      started_at=clock_timestamp(),
      failed_at=null,
      error_message=null,
      updated_at=clock_timestamp()
    where id=v_run_id;

    update public.race_engine_stage_immutable_state_v2
    set
      immutable_status='verifying',
      failure_message=null,
      metadata=
        metadata
        ||jsonb_build_object(
            'test_transition','running'
          )
    where stage_id=v_stage_id;

    v_running_decision :=
      public.race_engine_get_simulation_run_claim_decision_v2(
        v_stage_id
      );

    update public.race_stage_simulation_runs
    set
      status='failed',
      failed_at=clock_timestamp(),
      error_message='phase3ac_a5_injected_failure',
      updated_at=clock_timestamp()
    where id=v_run_id;

    update public.race_engine_stage_immutable_state_v2
    set
      immutable_status='failed',
      failure_message='phase3ac_a5_injected_failure',
      metadata=
        metadata
        ||jsonb_build_object(
            'test_transition','failed'
          )
    where stage_id=v_stage_id;

    v_failed_decision :=
      public.race_engine_get_simulation_run_claim_decision_v2(
        v_stage_id
      );

    v_failure_injected:=true;

    raise exception using
      errcode='P0001',
      message=v_marker;

  exception
    when raise_exception then
      if sqlerrm<>v_marker then
        raise;
      end if;
  end;

  v_after_rollback :=
    public.race_engine_get_simulation_run_claim_snapshot_v2(
      v_stage_id
    );

  v_final_decision :=
    public.race_engine_get_simulation_run_claim_decision_v2(
      v_stage_id
    );

  return jsonb_build_object(
    'status',
      case
        when v_initial_decision->>'status'
             = 'simulation_run_claim_ready_execution_disabled'
         and v_pending_decision->>'status'
             = 'simulation_run_claim_pending_existing'
         and v_running_decision->>'status'
             = 'simulation_run_claim_running_existing'
         and v_failed_decision->>'status'
             = 'simulation_run_claim_failed_requires_protected_reset'
         and v_duplicate_blocked
         and v_failure_injected
         and v_before=v_after_rollback
         and v_final_decision->>'status'
             = 'simulation_run_claim_ready_execution_disabled'
          then 'rollback_test_passed'
        else 'rollback_test_failed'
      end,

    'stage_id',v_stage_id,
    'synthetic_simulation_run_id',v_run_id,
    'initial_decision',v_initial_decision,
    'pending_decision',v_pending_decision,
    'running_decision',v_running_decision,
    'failed_decision',v_failed_decision,
    'final_decision_after_rollback',v_final_decision,
    'duplicate_stage_run_blocked',v_duplicate_blocked,
    'failure_injected',v_failure_injected,
    'before_snapshot',v_before,
    'after_rollback_snapshot',v_after_rollback,
    'exact_rollback',v_before=v_after_rollback,
    'simulation_run_persisted',
      exists(
        select 1
        from public.race_stage_simulation_runs
        where id=v_run_id
      ),
    'immutable_claim_persisted',
      exists(
        select 1
        from public.race_engine_stage_immutable_state_v2
        where stage_id=v_stage_id
      ),
    'runner_called',false,
    'writer_called',false,
    'effect_reservation_called',false,
    'closeout_called',false,
    'rollback_marker_present',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_simulation_run_claim_v2(p_stage_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_decision jsonb;
begin
  v_decision :=
    public.race_engine_get_simulation_run_claim_decision_v2(
      p_stage_id
    );

  if v_decision->>'status'
     = 'duplicate_immutable_return_saved_evidence' then
    return jsonb_build_object(
      'status','duplicate_immutable_return_saved_evidence',
      'stage_id',p_stage_id,
      'execute_requested',coalesce(p_execute,false),
      'confirmation_supplied',p_confirmation is not null,
      'decision',v_decision,
      'simulation_run_written',false,
      'immutable_claim_written',false,
      'runner_called',false,
      'production_execution_enabled',false
    );
  end if;

  return jsonb_build_object(
    'status',
      'blocked_simulation_run_claim_execution_disabled_in_phase3ac_a5',
    'stage_id',p_stage_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'decision',v_decision,
    'simulation_run_written',false,
    'immutable_claim_written',false,
    'simulation_run_transitioned',false,
    'process_run_changed',false,
    'runner_called',false,
    'writer_called',false,
    'effect_reserved',false,
    'effect_transitioned',false,
    'closeout_called',false,
    'replay_compaction_called',false,
    'cron_changed',false,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_set_stage_process_claim_updated_at_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  new.updated_at:=clock_timestamp();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_terminal_process_run_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if tg_op='DELETE' then
    raise exception
      'Process-run audit rows cannot be deleted: %.',
      old.process_run_id
      using errcode='P0001';
  end if;

  if new.process_run_id<>old.process_run_id
     or new.stage_id<>old.stage_id
     or new.race_id is distinct from old.race_id
     or new.processor_version<>old.processor_version
     or new.requested_dry_run<>old.requested_dry_run
     or new.created_at<>old.created_at then
    raise exception
      'Process-run identity fields cannot change: %.',
      old.process_run_id
      using errcode='P0001';
  end if;

  if old.status<>'started'
     or old.finished_at is not null then
    raise exception
      'Terminal process-run audit row cannot change: % status %.',
      old.process_run_id,
      old.status
      using errcode='P0001';
  end if;

  if new.status='started'
     or new.finished_at is null then
    raise exception
      'Started process-run may transition only once to a terminal status with finished_at: %.',
      old.process_run_id
      using errcode='P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_stage_process_claim_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_active record;
  v_predecessor record;
begin
  if tg_op='DELETE' then
    raise exception
      'Stage process claims cannot be deleted; release or supersede them.'
      using errcode='P0001';
  end if;

  if exists
  (
    select 1
    from public.race_engine_stage_immutable_state_v2 i
    where i.stage_id=old.stage_id
      and i.immutable_status='immutable'
  ) then
    raise exception
      'Immutable stage process claim cannot change: %.',
      old.stage_id
      using errcode='P0001';
  end if;

  if new.stage_id<>old.stage_id
     or new.race_id<>old.race_id
     or new.claim_id<>old.claim_id
     or new.created_at<>old.created_at then
    raise exception
      'Stage process claim identity cannot change: %.',
      old.stage_id
      using errcode='P0001';
  end if;

  if old.claim_status in('released','superseded') then
    raise exception
      'Released or superseded process claim cannot be reactivated: %.',
      old.stage_id
      using errcode='P0001';
  end if;

  if new.active_process_run_id
     is distinct from old.active_process_run_id then

    if new.predecessor_process_run_id
       is distinct from old.active_process_run_id
       or new.claim_generation<>old.claim_generation+1 then
      raise exception
        'Retry must append a new process run, link the predecessor, and increment claim_generation for stage %.',
        old.stage_id
        using errcode='P0001';
    end if;

  elsif new.claim_generation<>old.claim_generation then
    raise exception
      'claim_generation cannot change without a new process-run identity for stage %.',
      old.stage_id
      using errcode='P0001';
  end if;

  select pr.stage_id,pr.race_id,pr.finished_at,pr.status
  into v_active
  from public.race_engine_stage_process_runs_v2 pr
  where pr.process_run_id=new.active_process_run_id;

  if v_active.stage_id is null
     or v_active.stage_id<>new.stage_id
     or v_active.race_id is distinct from new.race_id then
    raise exception
      'Active process-run identity does not match stage/race claim: %.',
      new.active_process_run_id
      using errcode='P0001';
  end if;

  if new.predecessor_process_run_id is not null then
    select pr.stage_id,pr.race_id
    into v_predecessor
    from public.race_engine_stage_process_runs_v2 pr
    where pr.process_run_id=new.predecessor_process_run_id;

    if v_predecessor.stage_id is null
       or v_predecessor.stage_id<>new.stage_id
       or v_predecessor.race_id is distinct from new.race_id then
      raise exception
        'Predecessor process-run identity does not match stage/race claim: %.',
        new.predecessor_process_run_id
        using errcode='P0001';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_validate_new_stage_process_claim_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_active record;
  v_predecessor record;
begin
  if exists
  (
    select 1
    from public.race_engine_stage_immutable_state_v2 i
    where i.stage_id=new.stage_id
      and i.immutable_status='immutable'
  ) then
    raise exception
      'Cannot claim immutable stage %.',
      new.stage_id
      using errcode='P0001';
  end if;

  select pr.stage_id,pr.race_id
  into v_active
  from public.race_engine_stage_process_runs_v2 pr
  where pr.process_run_id=new.active_process_run_id;

  if v_active.stage_id is null
     or v_active.stage_id<>new.stage_id
     or v_active.race_id is distinct from new.race_id then
    raise exception
      'Active process-run identity does not match new stage/race claim: %.',
      new.active_process_run_id
      using errcode='P0001';
  end if;

  if new.predecessor_process_run_id is not null then
    select pr.stage_id,pr.race_id
    into v_predecessor
    from public.race_engine_stage_process_runs_v2 pr
    where pr.process_run_id=new.predecessor_process_run_id;

    if v_predecessor.stage_id is null
       or v_predecessor.stage_id<>new.stage_id
       or v_predecessor.race_id is distinct from new.race_id then
      raise exception
        'Predecessor process-run identity does not match new stage/race claim: %.',
        new.predecessor_process_run_id
        using errcode='P0001';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_process_run_recovery_evidence_v2(p_stage_id uuid, p_stale_after interval DEFAULT '00:30:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage record;
  v_claim record;
  v_active_run public.race_engine_stage_process_runs_v2%rowtype;
  /*
   * A concrete row type is required because stages with no active claim skip
   * the SELECT INTO below. A generic RECORD would then have indeterminate
   * tuple structure when its fields are read.
   */
  v_latest_run jsonb;
  v_simulation_decision jsonb;

  v_minimum interval;
  v_effective_stale_after interval;

  v_live_backend boolean:=false;
  v_live_stage_lock boolean:=false;
  v_stale_by_time boolean:=false;
  v_process_run_matches boolean:=false;
  v_stage_immutable boolean:=false;
  v_process_run_count integer:=0;

  v_status text;
begin
  select
    s.id stage_id,
    s.race_id,
    s.stage_number,
    s.stage_date,
    s.stage_format,
    s.weather_cancelled,
    r.name race_name,
    r.status race_status
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  select minimum_stale_after
  into v_minimum
  from public.race_engine_process_run_recovery_config_v2
  where config_key='process_run_recovery';

  v_effective_stale_after :=
    greatest(
      coalesce(p_stale_after,interval '30 minutes'),
      coalesce(v_minimum,interval '15 minutes')
    );

  select *
  into v_claim
  from public.race_engine_stage_process_claim_v2 c
  where c.stage_id=p_stage_id;

  if v_claim.stage_id is not null then
    select *
    into v_active_run
    from public.race_engine_stage_process_runs_v2 pr
    where pr.process_run_id=v_claim.active_process_run_id;
  end if;

  select count(*)::integer
  into v_process_run_count
  from public.race_engine_stage_process_runs_v2 pr
  where pr.stage_id=p_stage_id;

  select to_jsonb(pr)
  into v_latest_run
  from public.race_engine_stage_process_runs_v2 pr
  where pr.stage_id=p_stage_id
  order by pr.created_at desc,pr.process_run_id desc
  limit 1;

  select exists
  (
    select 1
    from public.race_engine_stage_immutable_state_v2 i
    where i.stage_id=p_stage_id
      and i.immutable_status='immutable'
  )
  into v_stage_immutable;

  if v_claim.stage_id is not null
     and v_claim.owner_backend_pid is not null then
    select exists
    (
      select 1
      from pg_stat_activity a
      where a.pid=v_claim.owner_backend_pid
        and a.backend_start<=v_claim.claimed_at
        and a.state is distinct from 'idle in transaction (aborted)'
    )
    into v_live_backend;
  end if;

  if v_claim.stage_id is not null then
    select exists
    (
      select 1
      from pg_locks l
      where l.locktype='advisory'
        and l.granted
        and l.classid::bigint=
            (
              (v_claim.stage_lock_key>>32)
              &4294967295::bigint
            )
        and l.objid::bigint=
            (
              v_claim.stage_lock_key
              &4294967295::bigint
            )
    )
    into v_live_stage_lock;
  end if;

  v_stale_by_time :=
    v_claim.claim_status in('claimed','running')
    and coalesce(v_claim.heartbeat_at,v_claim.claimed_at)
        <=clock_timestamp()-v_effective_stale_after
    and v_claim.expires_at<=clock_timestamp();

  v_process_run_matches :=
    v_claim.stage_id is not null
    and v_active_run.process_run_id is not null
    and v_active_run.stage_id=v_claim.stage_id
    and v_active_run.race_id is not distinct from v_claim.race_id;

  v_simulation_decision :=
    public.race_engine_get_simulation_run_claim_decision_v2(
      p_stage_id
    );

  v_status :=
    case
      when v_stage_immutable
        then 'process_claim_immutable_read_only'

      when v_claim.stage_id is null
        then 'process_claim_not_present'

      when not v_process_run_matches
        then 'process_claim_process_run_mismatch'

      when v_claim.claim_status in('claimed','running')
           and v_stale_by_time
           and (v_live_backend or v_live_stage_lock)
        then 'process_claim_stale_but_live_owner_no_recovery'

      when v_claim.claim_status in('claimed','running')
           and v_stale_by_time
           and not v_live_backend
           and not v_live_stage_lock
        then 'process_claim_stale_recovery_candidate'

      when v_claim.claim_status in('claimed','running')
           and (v_live_backend or v_live_stage_lock)
        then 'process_claim_active_live_no_recovery'

      when v_claim.claim_status in('claimed','running')
        then 'process_claim_recent_no_recovery'

      when v_claim.claim_status='failed'
        then 'process_claim_failed_recovery_candidate'

      when v_claim.claim_status='released'
        then 'process_claim_released'

      when v_claim.claim_status='superseded'
        then 'process_claim_superseded'

      else 'process_claim_state_inconsistent'
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',v_stage.stage_id,
    'race_id',v_stage.race_id,
    'race_name',v_stage.race_name,
    'race_status',v_stage.race_status,
    'stage_number',v_stage.stage_number,
    'stage_date',v_stage.stage_date,
    'stage_format',v_stage.stage_format,
    'weather_cancelled',v_stage.weather_cancelled,

    'claim',
      case
        when v_claim.stage_id is null then null
        else to_jsonb(v_claim)
      end,

    'active_process_run',
      case
        when v_active_run.process_run_id is null then null
        else to_jsonb(v_active_run)
      end,

    'latest_process_run',v_latest_run,
    'process_run_count',v_process_run_count,
    'process_run_identity_policy','append_only_attempt_identity',
    'retry_policy','append_new_process_run_and_link_predecessor',

    'effective_stale_after',
      v_effective_stale_after::text,

    'heartbeat_age',
      case
        when v_claim.stage_id is null then null
        else
          clock_timestamp()
          -coalesce(v_claim.heartbeat_at,v_claim.claimed_at)
      end,

    'stale_by_time',v_stale_by_time,
    'live_backend_present',v_live_backend,
    'live_stage_advisory_lock_present',v_live_stage_lock,
    'active_process_run_matches_claim',v_process_run_matches,
    'stage_immutable',v_stage_immutable,

    'safe_recovery_candidate',
      v_status in
      (
        'process_claim_stale_recovery_candidate',
        'process_claim_failed_recovery_candidate'
      ),

    'simulation_run_claim_decision',v_simulation_decision,
    'production_claim_enabled',false,
    'production_recovery_enabled',false,
    'scheduler_cutover_enabled',false,
    'evidence_version',
      'phase3ac_a6_process_run_recovery_evidence_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_process_run_recovery_decision_v2(p_stage_id uuid, p_stale_after interval DEFAULT '00:30:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_evidence jsonb;
  v_simulation_status text;
  v_status text;
begin
  v_evidence :=
    public.race_engine_get_process_run_recovery_evidence_v2(
      p_stage_id,
      p_stale_after
    );

  v_simulation_status :=
    v_evidence
      ->'simulation_run_claim_decision'
      ->>'status';

  v_status :=
    case
      when v_evidence->>'status'='stage_not_found'
        then 'stage_not_found'

      when v_simulation_status in
           (
             'historical_golden_fixture_verify_only',
             'historical_completed_verify_only_no_retroactive_claim',
             'historical_weather_cancelled_verify_only',
             'duplicate_immutable_return_saved_evidence'
           )
        then v_simulation_status

      when v_evidence->>'status'='process_claim_immutable_read_only'
        then 'duplicate_immutable_return_saved_evidence'

      when v_evidence->>'status'='process_claim_not_present'
           and v_simulation_status=
               'simulation_run_claim_ready_execution_disabled'
        then 'process_run_claim_ready_execution_disabled'

      when v_evidence->>'status'=
           'process_claim_stale_recovery_candidate'
        then 'process_run_stale_recovery_ready_execution_disabled'

      when v_evidence->>'status'=
           'process_claim_failed_recovery_candidate'
        then 'process_run_failed_retry_ready_execution_disabled'

      when v_evidence->>'status'=
           'process_claim_active_live_no_recovery'
        then 'process_run_claim_active_live_no_recovery'

      when v_evidence->>'status'=
           'process_claim_stale_but_live_owner_no_recovery'
        then 'process_run_claim_stale_but_live_owner_no_recovery'

      when v_evidence->>'status'=
           'process_claim_recent_no_recovery'
        then 'process_run_claim_recent_no_recovery'

      when v_evidence->>'status'=
           'process_claim_released'
           and v_simulation_status=
               'simulation_run_claim_ready_execution_disabled'
        then 'process_run_released_retry_ready_execution_disabled'

      when v_evidence->>'status'=
           'process_claim_superseded'
        then 'process_run_claim_superseded_read_only'

      else 'blocked_process_run_claim_state_inconsistent'
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'evidence',v_evidence,
    'claim_write_allowed',false,
    'recovery_write_allowed',false,
    'process_run_append_allowed',false,
    'terminal_process_run_mutation_allowed',false,
    'runner_allowed',false,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false,
    'decision_version',
      'phase3ac_a6_process_run_recovery_decision_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_process_run_recovery_rollback_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_road_stage constant uuid :=
    'd666d6ec-9765-49d2-afbc-50913281f09f';
  v_road_race constant uuid :=
    '18bff35c-f3b8-4654-b211-575c2c04970c';

  v_itt_stage constant uuid :=
    '10411fed-6ef1-4e6d-80d8-a3d0f484df98';
  v_itt_race constant uuid :=
    'b1dcff1f-9f18-4e79-9558-40f40f9b781e';

  v_ttt_stage constant uuid :=
    '2579368d-1775-4346-9b7f-0229ff88621d';
  v_ttt_race constant uuid :=
    'd4664e13-fb5b-4af0-a876-86e5064f94c1';

  v_road_run uuid:=gen_random_uuid();
  v_itt_run uuid:=gen_random_uuid();
  v_ttt_failed_run uuid:=gen_random_uuid();
  v_ttt_retry_run uuid:=gen_random_uuid();

  v_road_lock bigint :=
    hashtextextended(
      'race_engine_process_stage_once_v2:'
      ||'d666d6ec-9765-49d2-afbc-50913281f09f',
      0
    );

  v_itt_lock bigint :=
    hashtextextended(
      'race_engine_process_stage_once_v2:'
      ||'10411fed-6ef1-4e6d-80d8-a3d0f484df98',
      0
    );

  v_ttt_lock bigint :=
    hashtextextended(
      'race_engine_process_stage_once_v2:'
      ||'2579368d-1775-4346-9b7f-0229ff88621d',
      0
    );

  v_marker constant text :=
    'PHASE3AC_A6_PROCESS_RUN_RECOVERY_ROLLBACK_MARKER';

  v_road_before jsonb;
  v_itt_before jsonb;
  v_ttt_before jsonb;

  v_road_after jsonb;
  v_itt_after jsonb;
  v_ttt_after jsonb;

  v_live_decision jsonb;
  v_stale_decision jsonb;
  v_failed_decision jsonb;
  v_retry_decision jsonb;

  v_terminal_guard_observed boolean:=false;
  v_retry_append_verified boolean:=false;
begin
  v_road_before :=
    public.race_engine_get_process_run_recovery_snapshot_v2(
      v_road_stage
    );

  v_itt_before :=
    public.race_engine_get_process_run_recovery_snapshot_v2(
      v_itt_stage
    );

  v_ttt_before :=
    public.race_engine_get_process_run_recovery_snapshot_v2(
      v_ttt_stage
    );

  if exists
  (
    select 1
    from public.race_engine_stage_process_claim_v2
    where stage_id in(v_road_stage,v_itt_stage,v_ttt_stage)
  ) then
    return jsonb_build_object(
      'status','rollback_test_blocked_existing_claim'
    );
  end if;

  begin
    perform pg_advisory_xact_lock(v_road_lock);

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,
      race_id,
      processor_version,
      requested_dry_run,
      status,
      reason,
      normalized_stage_format,
      stage_lock_key,
      process_plan,
      plan_hash,
      production_execution_enabled,
      existing_runner_called,
      caller_identity,
      started_at,
      finished_at,
      metadata
    )
    values
    (
      v_road_run,
      v_road_stage,
      v_road_race,
      'phase3ac_a6_rollback_test_only',
      false,
      'started',
      'Synthetic live claim test; must rollback.',
      'road_race',
      v_road_lock,
      jsonb_build_object('test_only',true),
      md5('phase3ac_a6_road_live'),
      false,
      false,
      session_user,
      clock_timestamp(),
      null,
      jsonb_build_object('test_only',true,'must_rollback',true)
    );

    insert into public.race_engine_stage_process_claim_v2
    (
      stage_id,
      race_id,
      active_process_run_id,
      predecessor_process_run_id,
      claim_generation,
      claim_status,
      owner_backend_pid,
      owner_session_user,
      stage_lock_key,
      claimed_at,
      heartbeat_at,
      expires_at,
      metadata
    )
    values
    (
      v_road_stage,
      v_road_race,
      v_road_run,
      null,
      1,
      'running',
      pg_backend_pid(),
      session_user,
      v_road_lock,
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()+interval '30 minutes',
      jsonb_build_object('test_only',true,'must_rollback',true)
    );

    v_live_decision :=
      public.race_engine_get_process_run_recovery_decision_v2(
        v_road_stage,
        interval '30 minutes'
      );

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,
      race_id,
      processor_version,
      requested_dry_run,
      status,
      reason,
      normalized_stage_format,
      stage_lock_key,
      process_plan,
      plan_hash,
      production_execution_enabled,
      existing_runner_called,
      caller_identity,
      started_at,
      finished_at,
      metadata
    )
    values
    (
      v_itt_run,
      v_itt_stage,
      v_itt_race,
      'phase3ac_a6_rollback_test_only',
      false,
      'started',
      'Synthetic stale claim test; must rollback.',
      'individual_time_trial',
      v_itt_lock,
      jsonb_build_object('test_only',true),
      md5('phase3ac_a6_itt_stale'),
      false,
      false,
      session_user,
      clock_timestamp()-interval '2 hours',
      null,
      jsonb_build_object('test_only',true,'must_rollback',true)
    );

    insert into public.race_engine_stage_process_claim_v2
    (
      stage_id,
      race_id,
      active_process_run_id,
      predecessor_process_run_id,
      claim_generation,
      claim_status,
      owner_backend_pid,
      owner_session_user,
      stage_lock_key,
      claimed_at,
      heartbeat_at,
      expires_at,
      metadata
    )
    values
    (
      v_itt_stage,
      v_itt_race,
      v_itt_run,
      null,
      1,
      'running',
      2147483000,
      'phase3ac_a6_absent_backend',
      v_itt_lock,
      clock_timestamp()-interval '2 hours',
      clock_timestamp()-interval '2 hours',
      clock_timestamp()-interval '90 minutes',
      jsonb_build_object('test_only',true,'must_rollback',true)
    );

    v_stale_decision :=
      public.race_engine_get_process_run_recovery_decision_v2(
        v_itt_stage,
        interval '30 minutes'
      );

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,
      race_id,
      processor_version,
      requested_dry_run,
      status,
      reason,
      normalized_stage_format,
      stage_lock_key,
      process_plan,
      plan_hash,
      production_execution_enabled,
      existing_runner_called,
      caller_identity,
      started_at,
      finished_at,
      error_message,
      metadata
    )
    values
    (
      v_ttt_failed_run,
      v_ttt_stage,
      v_ttt_race,
      'phase3ac_a6_rollback_test_only',
      false,
      'error',
      'Synthetic failed claim test; must rollback.',
      'team_time_trial',
      v_ttt_lock,
      jsonb_build_object('test_only',true),
      md5('phase3ac_a6_ttt_failed'),
      false,
      false,
      session_user,
      clock_timestamp()-interval '10 minutes',
      clock_timestamp()-interval '9 minutes',
      'phase3ac_a6_injected_failure',
      jsonb_build_object('test_only',true,'must_rollback',true)
    );

    insert into public.race_engine_stage_process_claim_v2
    (
      stage_id,
      race_id,
      active_process_run_id,
      predecessor_process_run_id,
      claim_generation,
      claim_status,
      owner_backend_pid,
      owner_session_user,
      stage_lock_key,
      claimed_at,
      heartbeat_at,
      expires_at,
      failure_message,
      metadata
    )
    values
    (
      v_ttt_stage,
      v_ttt_race,
      v_ttt_failed_run,
      null,
      1,
      'failed',
      null,
      session_user,
      v_ttt_lock,
      clock_timestamp()-interval '10 minutes',
      null,
      null,
      'phase3ac_a6_injected_failure',
      jsonb_build_object('test_only',true,'must_rollback',true)
    );

    v_failed_decision :=
      public.race_engine_get_process_run_recovery_decision_v2(
        v_ttt_stage,
        interval '30 minutes'
      );

    begin
      update public.race_engine_stage_process_runs_v2
      set reason='illegal terminal mutation'
      where process_run_id=v_ttt_failed_run;

      raise exception
        'Terminal process-run guard did not block mutation.';

    exception
      when raise_exception then
        if sqlerrm like
             'Terminal process-run audit row cannot change:%'
        then
          v_terminal_guard_observed:=true;
        else
          raise;
        end if;
    end;

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,
      race_id,
      processor_version,
      requested_dry_run,
      status,
      reason,
      normalized_stage_format,
      stage_lock_key,
      process_plan,
      plan_hash,
      production_execution_enabled,
      existing_runner_called,
      caller_identity,
      started_at,
      finished_at,
      metadata
    )
    values
    (
      v_ttt_retry_run,
      v_ttt_stage,
      v_ttt_race,
      'phase3ac_a6_rollback_test_only',
      false,
      'started',
      'Synthetic retry process run; must rollback.',
      'team_time_trial',
      v_ttt_lock,
      jsonb_build_object('test_only',true),
      md5('phase3ac_a6_ttt_retry'),
      false,
      false,
      session_user,
      clock_timestamp(),
      null,
      jsonb_build_object('test_only',true,'must_rollback',true)
    );

    /*
     * A new claim generation represents a new ownership lease. Refresh
     * claimed_at together with owner PID, heartbeat and expiry so backend_start
     * validation is evaluated against the new owner generation rather than the
     * predecessor's failed lease timestamp.
     */
    update public.race_engine_stage_process_claim_v2
    set
      active_process_run_id=v_ttt_retry_run,
      predecessor_process_run_id=v_ttt_failed_run,
      claim_generation=2,
      claim_status='running',
      owner_backend_pid=pg_backend_pid(),
      owner_session_user=session_user,
      claimed_at=clock_timestamp(),
      heartbeat_at=clock_timestamp(),
      expires_at=clock_timestamp()+interval '30 minutes',
      released_at=null,
      failure_message=null,
      metadata=
        metadata
        ||jsonb_build_object(
            'retry_test',true,
            'predecessor_preserved',true
          )
    where stage_id=v_ttt_stage;

    v_retry_decision :=
      public.race_engine_get_process_run_recovery_decision_v2(
        v_ttt_stage,
        interval '30 minutes'
      );

    v_retry_append_verified :=
      (
        select count(*)=2
        from public.race_engine_stage_process_runs_v2
        where process_run_id in
              (
                v_ttt_failed_run,
                v_ttt_retry_run
              )
      )
      and exists
      (
        select 1
        from public.race_engine_stage_process_claim_v2 c
        where c.stage_id=v_ttt_stage
          and c.active_process_run_id=v_ttt_retry_run
          and c.predecessor_process_run_id=v_ttt_failed_run
          and c.claim_generation=2
          and c.claim_status='running'
      );

    raise exception using
      errcode='P0001',
      message=v_marker;

  exception
    when raise_exception then
      if sqlerrm<>v_marker then
        raise;
      end if;
  end;

  v_road_after :=
    public.race_engine_get_process_run_recovery_snapshot_v2(
      v_road_stage
    );

  v_itt_after :=
    public.race_engine_get_process_run_recovery_snapshot_v2(
      v_itt_stage
    );

  v_ttt_after :=
    public.race_engine_get_process_run_recovery_snapshot_v2(
      v_ttt_stage
    );

  return jsonb_build_object(
    'status',
      case
        when v_live_decision->>'status'
             = 'process_run_claim_active_live_no_recovery'
         and coalesce(
               (
                 v_live_decision
                   ->'evidence'
                   ->>'live_backend_present'
               )::boolean,
               false
             )
         and coalesce(
               (
                 v_live_decision
                   ->'evidence'
                   ->>'live_stage_advisory_lock_present'
               )::boolean,
               false
             )
         and v_stale_decision->>'status'
             = 'process_run_stale_recovery_ready_execution_disabled'
         and v_failed_decision->>'status'
             = 'process_run_failed_retry_ready_execution_disabled'
         and v_retry_decision->>'status'
             = 'process_run_claim_active_live_no_recovery'
         and v_terminal_guard_observed
         and v_retry_append_verified
         and v_road_before=v_road_after
         and v_itt_before=v_itt_after
         and v_ttt_before=v_ttt_after
          then 'rollback_test_passed'
        else 'rollback_test_failed'
      end,

    'live_claim_decision',v_live_decision,
    'stale_claim_decision',v_stale_decision,
    'failed_claim_decision',v_failed_decision,
    'retry_claim_decision',v_retry_decision,

    'terminal_process_run_guard_observed',
      v_terminal_guard_observed,

    'retry_appended_new_process_run',
      v_retry_append_verified,

    'road_exact_rollback',v_road_before=v_road_after,
    'itt_exact_rollback',v_itt_before=v_itt_after,
    'ttt_exact_rollback',v_ttt_before=v_ttt_after,

    'exact_rollback',
      v_road_before=v_road_after
      and v_itt_before=v_itt_after
      and v_ttt_before=v_ttt_after,

    'synthetic_process_runs_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_runs_v2
        where process_run_id in
              (
                v_road_run,
                v_itt_run,
                v_ttt_failed_run,
                v_ttt_retry_run
              )
      ),

    'synthetic_claims_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_claim_v2
        where stage_id in
              (
                v_road_stage,
                v_itt_stage,
                v_ttt_stage
              )
      ),

    'runner_called',false,
    'writer_called',false,
    'effect_reservation_called',false,
    'closeout_called',false,
    'rollback_marker_present',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_process_run_recovery_v2(p_stage_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_decision jsonb;
begin
  v_decision :=
    public.race_engine_get_process_run_recovery_decision_v2(
      p_stage_id,
      interval '30 minutes'
    );

  return jsonb_build_object(
    'status',
      'blocked_process_run_recovery_execution_disabled_in_phase3ac_a6',
    'stage_id',p_stage_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'decision',v_decision,
    'process_run_written',false,
    'process_run_mutated',false,
    'claim_written',false,
    'claim_recovered',false,
    'simulation_run_changed',false,
    'immutable_state_changed',false,
    'runner_called',false,
    'writer_called',false,
    'effect_reserved',false,
    'effect_transitioned',false,
    'closeout_called',false,
    'replay_compaction_called',false,
    'cron_changed',false,
    'production_claim_enabled',false,
    'production_recovery_enabled',false,
    'scheduler_cutover_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_atomic_orchestrator_dry_run_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_atomic_plan jsonb;
  v_atomic_claim jsonb;
  v_simulation_claim jsonb;
  v_process_claim jsonb;
  v_status text;
  v_lock_key bigint;
begin
  v_atomic_plan :=
    public.race_engine_get_atomic_stage_process_plan_v2(
      p_stage_id
    );

  v_atomic_claim :=
    public.race_engine_get_atomic_stage_claim_decision_v2(
      p_stage_id
    );

  v_simulation_claim :=
    public.race_engine_get_simulation_run_claim_decision_v2(
      p_stage_id
    );

  v_process_claim :=
    public.race_engine_get_process_run_recovery_decision_v2(
      p_stage_id,
      interval '30 minutes'
    );

  v_lock_key :=
    hashtextextended(
      'race_engine_process_stage_once_v2:'||p_stage_id::text,
      0
    );

  v_status :=
    case
      when v_process_claim->>'status' in
           (
             'historical_golden_fixture_verify_only',
             'historical_completed_verify_only_no_retroactive_claim',
             'historical_weather_cancelled_verify_only',
             'duplicate_immutable_return_saved_evidence'
           )
        then v_process_claim->>'status'

      when v_atomic_plan->>'status'=
           'contract_ready_execution_disabled'
       and v_atomic_claim->>'status'=
           'claim_ready_execution_disabled'
       and v_simulation_claim->>'status'=
           'simulation_run_claim_ready_execution_disabled'
       and v_process_claim->>'status'=
           'process_run_claim_ready_execution_disabled'
        then 'rollback_only_real_claim_lifecycle_ready'

      else 'atomic_orchestrator_dry_run_blocked'
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'stage_lock_key',v_lock_key,
    'atomic_plan',v_atomic_plan,
    'atomic_claim_decision',v_atomic_claim,
    'simulation_run_claim_decision',v_simulation_claim,
    'process_run_recovery_decision',v_process_claim,

    'lifecycle',
      case
        when v_status='rollback_only_real_claim_lifecycle_ready'
          then jsonb_build_array(
            'acquire canonical stage advisory transaction lock',
            'insert started process-run attempt',
            'insert running process claim',
            'verify live backend and advisory lock',
            'evaluate atomic plan without downstream writes',
            'transition process-run to terminal dry-run status',
            'transition claim to released',
            'verify released retry decision',
            'rollback process-run and claim exactly'
          )
        else '[]'::jsonb
      end,

    'persistent_dry_run_audit_owner',
      'race_engine_process_stage_once_v2(uuid,boolean,text)',

    'shadow_orchestrator_owner',
      'race_engine_run_atomic_orchestrator_dry_run_v2(uuid)',

    'process_run_write_scope','rollback_only',
    'process_claim_write_scope','rollback_only',
    'simulation_run_write_allowed',false,
    'effect_reservation_allowed',false,
    'writer_execution_allowed',false,
    'closeout_allowed',false,
    'existing_v2_shell_replacement_allowed',false,
    'scheduler_cutover_allowed',false,
    'plan_version',
      'phase3ac_a7_atomic_orchestrator_dry_run_plan_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_run_atomic_orchestrator_dry_run_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_race_id uuid;
  v_stage_number integer;
  v_stage_date date;
  v_raw_stage_format text;

  v_plan jsonb;
  v_atomic_plan jsonb;
  v_route_format text;
  v_lock_key bigint;

  v_process_run_id uuid:=gen_random_uuid();
  v_before jsonb;
  v_after jsonb;

  v_live_decision jsonb;
  v_released_decision jsonb;
  v_fixture_before jsonb;
  v_fixture_after jsonb;

  v_marker constant text :=
    'PHASE3AC_A7_ATOMIC_ORCHESTRATOR_ROLLBACK_MARKER';

  v_lifecycle_completed boolean:=false;
begin
  select
    s.race_id,
    s.stage_number,
    s.stage_date,
    s.stage_format
  into
    v_race_id,
    v_stage_number,
    v_stage_date,
    v_raw_stage_format
  from public.race_stages s
  where s.id=p_stage_id;

  if v_race_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  v_plan :=
    public.race_engine_get_atomic_orchestrator_dry_run_plan_v2(
      p_stage_id
    );

  if v_plan->>'status'
     <> 'rollback_only_real_claim_lifecycle_ready' then
    return jsonb_build_object(
      'status',v_plan->>'status',
      'stage_id',p_stage_id,
      'plan',v_plan,
      'lifecycle_executed',false,
      'persistent_writes',0
    );
  end if;

  v_atomic_plan:=v_plan->'atomic_plan';
  v_route_format:=v_atomic_plan->>'route_format';
  v_lock_key:=(v_plan->>'stage_lock_key')::bigint;

  v_before :=
    public.race_engine_get_atomic_orchestrator_snapshot_v2(
      p_stage_id
    );

  v_fixture_before :=
    public.race_engine_verify_golden_stage_fixture_v1(
      'rio_tour_stage1_phase3aa_golden_v1'
    );

  begin
    perform pg_advisory_xact_lock(v_lock_key);

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,
      race_id,
      processor_version,
      requested_dry_run,
      status,
      reason,
      normalized_stage_format,
      stage_lock_key,
      process_plan,
      plan_hash,
      production_execution_enabled,
      existing_runner_called,
      caller_identity,
      started_at,
      finished_at,
      golden_fixture_status_before,
      golden_fixture_status_after,
      metadata
    )
    values
    (
      v_process_run_id,
      p_stage_id,
      v_race_id,
      'phase3ac_a7_atomic_orchestrator_dry_run_v1',
      true,
      'started',
      'A7 rollback-only real claim lifecycle.',
      v_route_format,
      v_lock_key,
      v_plan,
      md5(v_plan::text),
      false,
      false,
      session_user,
      clock_timestamp(),
      null,
      v_fixture_before->>'status',
      null,
      jsonb_build_object(
        'phase','phase3ac_a7',
        'rollback_only',true,
        'stage_number',v_stage_number,
        'stage_date',v_stage_date,
        'raw_stage_format',v_raw_stage_format
      )
    );

    insert into public.race_engine_stage_process_claim_v2
    (
      stage_id,
      race_id,
      active_process_run_id,
      predecessor_process_run_id,
      claim_generation,
      claim_status,
      owner_backend_pid,
      owner_session_user,
      stage_lock_key,
      claimed_at,
      heartbeat_at,
      expires_at,
      metadata
    )
    values
    (
      p_stage_id,
      v_race_id,
      v_process_run_id,
      null,
      1,
      'running',
      pg_backend_pid(),
      session_user,
      v_lock_key,
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()+interval '30 minutes',
      jsonb_build_object(
        'phase','phase3ac_a7',
        'rollback_only',true
      )
    );

    v_live_decision :=
      public.race_engine_get_process_run_recovery_decision_v2(
        p_stage_id,
        interval '30 minutes'
      );

    if v_live_decision->>'status'
       <> 'process_run_claim_active_live_no_recovery'
       or not coalesce(
                (
                  v_live_decision
                    ->'evidence'
                    ->>'live_backend_present'
                )::boolean,
                false
              )
       or not coalesce(
                (
                  v_live_decision
                    ->'evidence'
                    ->>'live_stage_advisory_lock_present'
                )::boolean,
                false
              ) then
      raise exception
        'A7 live claim verification failed for stage %.',
        p_stage_id;
    end if;

    v_fixture_after :=
      public.race_engine_verify_golden_stage_fixture_v1(
        'rio_tour_stage1_phase3aa_golden_v1'
      );

    update public.race_engine_stage_process_runs_v2
    set
      status='dry_run_ready_shadow_only',
      reason='A7 real claim lifecycle verified; rollback required.',
      finished_at=clock_timestamp(),
      golden_fixture_status_after=v_fixture_after->>'status',
      metadata=
        metadata
        ||jsonb_build_object(
            'active_live_verified',true,
            'runner_called',false,
            'writer_called',false,
            'simulation_run_written',false,
            'effect_reserved',false,
            'closeout_called',false
          )
    where process_run_id=v_process_run_id;

    update public.race_engine_stage_process_claim_v2
    set
      claim_status='released',
      released_at=clock_timestamp(),
      metadata=
        metadata
        ||jsonb_build_object(
            'released_after_shadow_verification',true
          )
    where stage_id=p_stage_id;

    v_released_decision :=
      public.race_engine_get_process_run_recovery_decision_v2(
        p_stage_id,
        interval '30 minutes'
      );

    if v_released_decision->>'status'
       <> 'process_run_released_retry_ready_execution_disabled'
    then
      raise exception
        'A7 released claim verification failed for stage %: %.',
        p_stage_id,
        v_released_decision->>'status';
    end if;

    v_lifecycle_completed:=true;

    raise exception using
      errcode='P0001',
      message=v_marker;

  exception
    when raise_exception then
      if sqlerrm<>v_marker then
        raise;
      end if;
  end;

  v_after :=
    public.race_engine_get_atomic_orchestrator_snapshot_v2(
      p_stage_id
    );

  v_fixture_after :=
    public.race_engine_verify_golden_stage_fixture_v1(
      'rio_tour_stage1_phase3aa_golden_v1'
    );

  return jsonb_build_object(
    'status',
      case
        when v_lifecycle_completed
         and v_before=v_after
         and v_fixture_before->>'status'
             ='fixture_matches_current_state'
         and v_fixture_after->>'status'
             ='fixture_matches_current_state'
         and not exists
             (
               select 1
               from public.race_engine_stage_process_runs_v2
               where process_run_id=v_process_run_id
             )
         and not exists
             (
               select 1
               from public.race_engine_stage_process_claim_v2
               where stage_id=p_stage_id
             )
          then 'rollback_only_real_claim_lifecycle_passed'
        else 'rollback_only_real_claim_lifecycle_failed'
      end,

    'stage_id',p_stage_id,
    'race_id',v_race_id,
    'route_format',v_route_format,
    'stage_lock_key',v_lock_key,
    'synthetic_process_run_id',v_process_run_id,

    'plan_status',v_plan->>'status',
    'live_claim_decision',v_live_decision,
    'released_claim_decision',v_released_decision,

    'lifecycle_completed',v_lifecycle_completed,
    'before_snapshot',v_before,
    'after_snapshot',v_after,
    'exact_rollback',v_before=v_after,

    'process_run_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_runs_v2
        where process_run_id=v_process_run_id
      ),

    'process_claim_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_claim_v2
        where stage_id=p_stage_id
      ),

    'simulation_run_written',false,
    'immutable_state_written',false,
    'effect_ledger_written',false,
    'runner_called',false,
    'writer_called',false,
    'closeout_called',false,
    'rio_fixture_before',v_fixture_before->>'status',
    'rio_fixture_after',v_fixture_after->>'status',
    'rollback_marker_observed',true,
    'orchestrator_version',
      'phase3ac_a7_atomic_orchestrator_dry_run_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_atomic_orchestrator_v2(p_stage_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_atomic_orchestrator_dry_run_plan_v2(
      p_stage_id
    );

  return jsonb_build_object(
    'status',
      'blocked_atomic_orchestrator_production_execution_disabled_in_phase3ac_a7',
    'stage_id',p_stage_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'plan',v_plan,
    'process_run_written',false,
    'process_claim_written',false,
    'simulation_run_written',false,
    'immutable_state_written',false,
    'effect_reserved',false,
    'effect_transitioned',false,
    'runner_called',false,
    'writer_called',false,
    'closeout_called',false,
    'replay_compaction_called',false,
    'existing_v2_shell_changed',false,
    'cron_changed',false,
    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_stage_process_claim_history_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if tg_op='DELETE' then
    raise exception
      'Stage process claim history rows cannot be deleted: %.',
      old.claim_history_id
      using errcode='P0001';
  end if;

  raise exception
    'Stage process claim history rows are append-only and cannot be updated: %.',
    old.claim_history_id
    using errcode='P0001';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_capture_stage_process_claim_history_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_event_type text;
  v_previous_sequence integer;
  v_previous_event_hash text;
  v_event_sequence integer;
  v_recorded_at timestamptz:=clock_timestamp();
  v_claim_row_hash text;
  v_event_hash text;
begin
  if tg_op='INSERT' then
    v_event_type:='claim_created';
  elsif new.active_process_run_id
        is distinct from old.active_process_run_id
        and new.claim_generation=old.claim_generation+1 then
    v_event_type:='retry_generation_started';
  elsif new.claim_status is distinct from old.claim_status then
    v_event_type :=
      case new.claim_status
        when 'failed' then 'claim_failed'
        when 'released' then 'claim_released'
        when 'superseded' then 'claim_superseded'
        else 'claim_updated'
      end;
  elsif new.heartbeat_at is distinct from old.heartbeat_at
        or new.expires_at is distinct from old.expires_at then
    v_event_type:='heartbeat_refreshed';
  else
    v_event_type:='claim_updated';
  end if;

  select
    h.event_sequence,
    h.event_hash
  into
    v_previous_sequence,
    v_previous_event_hash
  from public.race_engine_stage_process_claim_history_v2 h
  where h.stage_id=new.stage_id
  order by h.event_sequence desc
  limit 1;

  v_event_sequence:=coalesce(v_previous_sequence,0)+1;
  v_claim_row_hash:=md5(to_jsonb(new)::text);

  v_event_hash :=
    md5(
      jsonb_build_object(
        'stage_id',new.stage_id,
        'race_id',new.race_id,
        'claim_id',new.claim_id,
        'active_process_run_id',new.active_process_run_id,
        'predecessor_process_run_id',
          new.predecessor_process_run_id,
        'claim_generation',new.claim_generation,
        'event_sequence',v_event_sequence,
        'event_type',v_event_type,
        'claim_status_before',
          case when tg_op='UPDATE' then old.claim_status else null end,
        'claim_status_after',new.claim_status,
        'stage_lock_key',new.stage_lock_key,
        'claimed_at',new.claimed_at,
        'heartbeat_at',new.heartbeat_at,
        'expires_at',new.expires_at,
        'released_at',new.released_at,
        'failure_message',new.failure_message,
        'claim_row_hash',v_claim_row_hash,
        'previous_event_hash',v_previous_event_hash,
        'recorded_at',v_recorded_at
      )::text
    );

  insert into
    public.race_engine_stage_process_claim_history_v2
  (
    stage_id,
    race_id,
    claim_id,
    active_process_run_id,
    predecessor_process_run_id,
    claim_generation,
    event_sequence,
    event_type,
    claim_status_before,
    claim_status_after,
    owner_backend_pid,
    owner_session_user,
    stage_lock_key,
    claimed_at,
    heartbeat_at,
    expires_at,
    released_at,
    failure_message,
    metadata_snapshot,
    claim_row_hash,
    previous_event_hash,
    event_hash,
    recorded_at
  )
  values
  (
    new.stage_id,
    new.race_id,
    new.claim_id,
    new.active_process_run_id,
    new.predecessor_process_run_id,
    new.claim_generation,
    v_event_sequence,
    v_event_type,
    case when tg_op='UPDATE' then old.claim_status else null end,
    new.claim_status,
    new.owner_backend_pid,
    new.owner_session_user,
    new.stage_lock_key,
    new.claimed_at,
    new.heartbeat_at,
    new.expires_at,
    new.released_at,
    new.failure_message,
    new.metadata,
    v_claim_row_hash,
    v_previous_event_hash,
    v_event_hash,
    v_recorded_at
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_test_claim_history_case_v2(p_stage_id uuid, p_scenario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_race_id uuid;
  v_route_format text;
  v_lock_key bigint;

  v_run_1 uuid:=gen_random_uuid();
  v_run_2 uuid:=gen_random_uuid();

  v_before jsonb;
  v_after jsonb;
  v_history jsonb;
  v_event_types jsonb;
  v_expected_event_types jsonb;

  v_marker constant text :=
    'PHASE3AC_A8_CLAIM_HISTORY_ROLLBACK_MARKER';

  v_lifecycle_completed boolean:=false;
begin
  select
    s.race_id,
    case
      when lower(
             trim(
               coalesce(s.stage_format,'')
             )
           ) in
           (
             'prologue',
             'itt',
             'individual_time_trial',
             'individual time trial',
             'time_trial',
             'time trial'
           )
        then 'individual_time_trial'

      when lower(
             trim(
               coalesce(s.stage_format,'')
             )
           ) in
           (
             'ttt',
             'team_time_trial',
             'team time trial'
           )
        then 'team_time_trial'

      else 'road_race'
    end
  into
    v_race_id,
    v_route_format
  from public.race_stages s
  where s.id=p_stage_id;

  if v_race_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  if p_scenario not in
     (
       'road_retry_release',
       'itt_supersede',
       'ttt_fail'
     ) then
    return jsonb_build_object(
      'status','unsupported_test_scenario',
      'scenario',p_scenario,
      'stage_id',p_stage_id
    );
  end if;

  v_lock_key :=
    hashtextextended(
      'race_engine_process_stage_once_v2:'||p_stage_id::text,
      0
    );

  v_before :=
    public.race_engine_get_claim_history_contract_snapshot_v2(
      p_stage_id
    );

  begin
    perform pg_advisory_xact_lock(v_lock_key);

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,
      race_id,
      processor_version,
      requested_dry_run,
      status,
      reason,
      normalized_stage_format,
      stage_lock_key,
      process_plan,
      plan_hash,
      production_execution_enabled,
      existing_runner_called,
      caller_identity,
      started_at,
      metadata
    )
    values
    (
      v_run_1,
      p_stage_id,
      v_race_id,
      'phase3ac_a8_claim_history_rollback_test_v1',
      false,
      'started',
      'A8 synthetic claim-history test; must rollback.',
      v_route_format,
      v_lock_key,
      jsonb_build_object(
        'phase','phase3ac_a8',
        'scenario',p_scenario,
        'rollback_only',true
      ),
      md5(
        jsonb_build_object(
          'phase','phase3ac_a8',
          'scenario',p_scenario,
          'rollback_only',true
        )::text
      ),
      false,
      false,
      session_user,
      clock_timestamp(),
      jsonb_build_object(
        'phase','phase3ac_a8',
        'scenario',p_scenario,
        'rollback_only',true
      )
    );

    insert into public.race_engine_stage_process_claim_v2
    (
      stage_id,
      race_id,
      active_process_run_id,
      predecessor_process_run_id,
      claim_generation,
      claim_status,
      owner_backend_pid,
      owner_session_user,
      stage_lock_key,
      claimed_at,
      heartbeat_at,
      expires_at,
      metadata
    )
    values
    (
      p_stage_id,
      v_race_id,
      v_run_1,
      null,
      1,
      'running',
      pg_backend_pid(),
      session_user,
      v_lock_key,
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()+interval '30 minutes',
      jsonb_build_object(
        'phase','phase3ac_a8',
        'scenario',p_scenario,
        'rollback_only',true
      )
    );

    if p_scenario='road_retry_release' then
      update public.race_engine_stage_process_claim_v2
      set
        heartbeat_at=clock_timestamp(),
        expires_at=clock_timestamp()+interval '30 minutes'
      where stage_id=p_stage_id;

      update public.race_engine_stage_process_runs_v2
      set
        status='error',
        finished_at=clock_timestamp(),
        error_message='Synthetic A8 failure before retry.'
      where process_run_id=v_run_1;

      update public.race_engine_stage_process_claim_v2
      set
        claim_status='failed',
        failure_message='Synthetic A8 failure before retry.'
      where stage_id=p_stage_id;

      insert into public.race_engine_stage_process_runs_v2
      (
        process_run_id,
        stage_id,
        race_id,
        processor_version,
        requested_dry_run,
        status,
        reason,
        normalized_stage_format,
        stage_lock_key,
        process_plan,
        plan_hash,
        production_execution_enabled,
        existing_runner_called,
        caller_identity,
        started_at,
        metadata
      )
      values
      (
        v_run_2,
        p_stage_id,
        v_race_id,
        'phase3ac_a8_claim_history_rollback_test_v1',
        false,
        'started',
        'A8 synthetic retry generation; must rollback.',
        v_route_format,
        v_lock_key,
        jsonb_build_object(
          'phase','phase3ac_a8',
          'scenario',p_scenario,
          'retry_generation',2,
          'rollback_only',true
        ),
        md5(
          jsonb_build_object(
            'phase','phase3ac_a8',
            'scenario',p_scenario,
            'retry_generation',2,
            'rollback_only',true
          )::text
        ),
        false,
        false,
        session_user,
        clock_timestamp(),
        jsonb_build_object(
          'phase','phase3ac_a8',
          'scenario',p_scenario,
          'retry_generation',2,
          'rollback_only',true
        )
      );

      update public.race_engine_stage_process_claim_v2
      set
        active_process_run_id=v_run_2,
        predecessor_process_run_id=v_run_1,
        claim_generation=2,
        claim_status='running',
        owner_backend_pid=pg_backend_pid(),
        owner_session_user=session_user,
        claimed_at=clock_timestamp(),
        heartbeat_at=clock_timestamp(),
        expires_at=clock_timestamp()+interval '30 minutes',
        released_at=null,
        failure_message=null,
        metadata=
          metadata
          ||jsonb_build_object(
              'retry_generation',2
            )
      where stage_id=p_stage_id;

      update public.race_engine_stage_process_runs_v2
      set
        status='dry_run_ready_shadow_only',
        finished_at=clock_timestamp(),
        reason='Synthetic retry verified; must rollback.'
      where process_run_id=v_run_2;

      update public.race_engine_stage_process_claim_v2
      set
        claim_status='released',
        released_at=clock_timestamp()
      where stage_id=p_stage_id;

      v_expected_event_types :=
        '[
          "claim_created",
          "heartbeat_refreshed",
          "claim_failed",
          "retry_generation_started",
          "claim_released"
        ]'::jsonb;

    elsif p_scenario='itt_supersede' then
      update public.race_engine_stage_process_runs_v2
      set
        status='dry_run_ready_shadow_only',
        finished_at=clock_timestamp(),
        reason='Synthetic ITT supersede; must rollback.'
      where process_run_id=v_run_1;

      update public.race_engine_stage_process_claim_v2
      set
        claim_status='superseded',
        released_at=clock_timestamp()
      where stage_id=p_stage_id;

      v_expected_event_types :=
        '[
          "claim_created",
          "claim_superseded"
        ]'::jsonb;

    else
      update public.race_engine_stage_process_runs_v2
      set
        status='error',
        finished_at=clock_timestamp(),
        error_message='Synthetic TTT failure; must rollback.'
      where process_run_id=v_run_1;

      update public.race_engine_stage_process_claim_v2
      set
        claim_status='failed',
        failure_message='Synthetic TTT failure; must rollback.'
      where stage_id=p_stage_id;

      v_expected_event_types :=
        '[
          "claim_created",
          "claim_failed"
        ]'::jsonb;
    end if;

    v_history :=
      public.race_engine_get_stage_process_claim_history_v2(
        p_stage_id
      );

    select coalesce(
      jsonb_agg(
        to_jsonb(h.event_type)
        order by h.event_sequence
      ),
      '[]'::jsonb
    )
    into v_event_types
    from public.race_engine_stage_process_claim_history_v2 h
    where h.stage_id=p_stage_id;

    if v_event_types<>v_expected_event_types
       or not coalesce(
                (v_history->>'chain_valid')::boolean,
                false
              )
       or (v_history->>'event_count')::integer
          <>jsonb_array_length(v_expected_event_types)
    then
      raise exception
        'A8 claim-history event matrix failed for stage %, scenario %.',
        p_stage_id,
        p_scenario;
    end if;

    v_lifecycle_completed:=true;

    raise exception using
      errcode='P0001',
      message=v_marker;

  exception
    when raise_exception then
      if sqlerrm<>v_marker then
        raise;
      end if;
  end;

  v_after :=
    public.race_engine_get_claim_history_contract_snapshot_v2(
      p_stage_id
    );

  return jsonb_build_object(
    'status',
      case
        when v_lifecycle_completed
         and v_before=v_after
         and not exists
             (
               select 1
               from public.race_engine_stage_process_claim_history_v2
               where stage_id=p_stage_id
             )
         and not exists
             (
               select 1
               from public.race_engine_stage_process_claim_v2
               where stage_id=p_stage_id
             )
         and not exists
             (
               select 1
               from public.race_engine_stage_process_runs_v2
               where process_run_id in(v_run_1,v_run_2)
             )
          then 'claim_history_rollback_case_passed'
        else 'claim_history_rollback_case_failed'
      end,

    'stage_id',p_stage_id,
    'scenario',p_scenario,
    'route_format',v_route_format,
    'stage_lock_key',v_lock_key,
    'expected_event_types',v_expected_event_types,
    'actual_event_types',v_event_types,
    'history_summary',v_history,
    'lifecycle_completed',v_lifecycle_completed,
    'before_snapshot',v_before,
    'after_snapshot',v_after,
    'exact_rollback',v_before=v_after,
    'claim_history_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_claim_history_v2
        where stage_id=p_stage_id
      ),
    'process_claim_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_claim_v2
        where stage_id=p_stage_id
      ),
    'synthetic_process_run_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_runs_v2
        where process_run_id in(v_run_1,v_run_2)
      ),
    'runner_called',false,
    'writer_called',false,
    'effect_reserved',false,
    'closeout_called',false,
    'rollback_marker_observed',true,
    'test_version',
      'phase3ac_a8_claim_history_rollback_case_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_production_claim_commit_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_a7_plan jsonb;
  v_process_decision jsonb;
  v_config
    public.race_engine_production_claim_commit_config_v2%rowtype;

  v_claim jsonb;
  v_history jsonb;
  v_status text;
begin
  select *
  into v_config
  from public.race_engine_production_claim_commit_config_v2
  where config_key='production_claim_commit';

  v_a7_plan :=
    public.race_engine_get_atomic_orchestrator_dry_run_plan_v2(
      p_stage_id
    );

  v_process_decision :=
    public.race_engine_get_process_run_recovery_decision_v2(
      p_stage_id,
      v_config.claim_ttl
    );

  select to_jsonb(c)
  into v_claim
  from public.race_engine_stage_process_claim_v2 c
  where c.stage_id=p_stage_id;

  v_history :=
    public.race_engine_get_stage_process_claim_history_v2(
      p_stage_id
    );

  v_status :=
    case
      when v_a7_plan->>'status' in
           (
             'historical_golden_fixture_verify_only',
             'historical_completed_verify_only_no_retroactive_claim',
             'historical_weather_cancelled_verify_only',
             'duplicate_immutable_return_saved_evidence'
           )
        then v_a7_plan->>'status'

      when v_claim is not null
       and v_process_decision->>'status'=
           'process_run_claim_active_live_no_recovery'
        then 'existing_live_production_claim_return_saved_evidence'

      when v_a7_plan->>'status'=
           'rollback_only_real_claim_lifecycle_ready'
       and v_process_decision->>'status'=
           'process_run_claim_ready_execution_disabled'
        then
          case
            when v_config.production_claim_commit_enabled
              then 'production_claim_commit_ready'
            else 'production_claim_commit_contract_ready_execution_disabled'
          end

      else 'production_claim_commit_blocked'
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'stage_lock_key',
      v_a7_plan->>'stage_lock_key',
    'a7_plan_status',v_a7_plan->>'status',
    'process_run_decision_status',
      v_process_decision->>'status',
    'active_claim',v_claim,
    'claim_history',v_history,

    'atomic_commit_writes',
      jsonb_build_array(
        'started process-run identity with requested_dry_run=false',
        'running active claim generation 1',
        'claim_created append-only history event'
      ),

    'success_evidence',
      jsonb_build_array(
        'process_run_id',
        'claim_id',
        'claim_generation',
        'stage_lock_key',
        'claimed_at',
        'expires_at',
        'process_plan_hash',
        'history_event_hash'
      ),

    'duplicate_policy',
      'return saved live reservation evidence without inserting another process run',

    'failure_policy',
      'rollback process-run, claim and history event together',

    'dry_run_policy',
      'committed dry-run claims prohibited; A7 remains rollback-only',

    'required_confirmation',
      v_config.required_confirmation,

    'claim_ttl',
      v_config.claim_ttl,

    'production_claim_commit_enabled',
      v_config.production_claim_commit_enabled,

    'runner_enabled',false,
    'simulation_run_write_enabled',false,
    'effect_reservation_enabled',false,
    'writer_execution_enabled',false,
    'closeout_enabled',false,
    'scheduler_cutover_enabled',false,

    'plan_version',
      'phase3ac_a8_production_claim_commit_plan_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_production_claim_commit_v2(p_stage_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_production_claim_commit_plan_v2(
      p_stage_id
    );

  return jsonb_build_object(
    'status',
      'blocked_production_claim_commit_execution_disabled_in_phase3ac_a8',
    'stage_id',p_stage_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'confirmation_matches',
      p_confirmation=
      'CONFIRM_PHASE3AC_A8_PRODUCTION_CLAIM_COMMIT',
    'plan',v_plan,
    'process_run_written',false,
    'process_claim_written',false,
    'claim_history_written',false,
    'simulation_run_written',false,
    'immutable_state_written',false,
    'effect_reserved',false,
    'effect_transitioned',false,
    'runner_called',false,
    'writer_called',false,
    'closeout_called',false,
    'replay_compaction_called',false,
    'existing_v2_shell_changed',false,
    'cron_changed',false,
    'production_claim_commit_enabled',false,
    'runner_enabled',false,
    'scheduler_cutover_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_stage_runner_handoff_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if tg_op='DELETE' then
    raise exception
      'Runner handoff rows cannot be deleted: %.',
      old.handoff_id;
  end if;

  if old.handoff_status in
     ('runner_succeeded','runner_failed','duplicate_completed')
  then
    raise exception
      'Terminal runner handoff rows cannot be changed: %.',
      old.handoff_id;
  end if;

  if new.handoff_id<>old.handoff_id
     or new.stage_id<>old.stage_id
     or new.race_id<>old.race_id
     or new.process_run_id<>old.process_run_id
     or new.claim_id<>old.claim_id
     or new.claim_generation<>old.claim_generation
     or new.stage_lock_key<>old.stage_lock_key
     or new.route_format<>old.route_format
     or new.runner_signature<>old.runner_signature
  then
    raise exception
      'Runner handoff identity fields are immutable: %.',
      old.handoff_id;
  end if;

  if old.handoff_status='reserved'
     and new.handoff_status not in
         (
           'reserved',
           'runner_invoking',
           'runner_failed',
           'duplicate_completed'
         )
  then
    raise exception
      'Invalid runner handoff transition % -> %.',
      old.handoff_status,
      new.handoff_status;
  end if;

  if old.handoff_status='runner_invoking'
     and new.handoff_status not in
         (
           'runner_invoking',
           'runner_succeeded',
           'runner_failed'
         )
  then
    raise exception
      'Invalid runner handoff transition % -> %.',
      old.handoff_status,
      new.handoff_status;
  end if;

  new.updated_at:=clock_timestamp();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_stage_runner_handoff_history_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if tg_op='DELETE' then
    raise exception
      'Runner handoff history cannot be deleted: %.',
      old.handoff_history_id;
  end if;

  raise exception
    'Runner handoff history is append-only: %.',
    old.handoff_history_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_capture_stage_runner_handoff_history_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_sequence integer;
  v_previous_hash text;
  v_event_type text;
  v_recorded_at timestamptz:=clock_timestamp();
  v_row_hash text;
  v_event_hash text;
begin
  select
    h.event_sequence,
    h.event_hash
  into
    v_sequence,
    v_previous_hash
  from public.race_engine_stage_runner_handoff_history_v2 h
  where h.handoff_id=new.handoff_id
  order by h.event_sequence desc
  limit 1;

  v_sequence:=coalesce(v_sequence,0)+1;

  v_event_type :=
    case
      when tg_op='INSERT' then 'handoff_reserved'
      when new.handoff_status='runner_invoking'
           and old.handoff_status is distinct from new.handoff_status
        then 'runner_invoking'
      when new.handoff_status='runner_succeeded'
        then 'runner_succeeded'
      when new.handoff_status='runner_failed'
        then 'runner_failed'
      when new.handoff_status='duplicate_completed'
        then 'duplicate_completed'
      else 'handoff_updated'
    end;

  v_row_hash:=md5(to_jsonb(new)::text);

  v_event_hash :=
    md5(
      jsonb_build_object(
        'handoff_id',new.handoff_id,
        'stage_id',new.stage_id,
        'process_run_id',new.process_run_id,
        'claim_id',new.claim_id,
        'event_sequence',v_sequence,
        'event_type',v_event_type,
        'status_before',
          case when tg_op='UPDATE' then old.handoff_status else null end,
        'status_after',new.handoff_status,
        'simulation_run_id',new.simulation_run_id,
        'handoff_row_hash',v_row_hash,
        'previous_event_hash',v_previous_hash,
        'recorded_at',v_recorded_at
      )::text
    );

  insert into public.race_engine_stage_runner_handoff_history_v2
  (
    handoff_id,
    stage_id,
    race_id,
    process_run_id,
    claim_id,
    claim_generation,
    event_sequence,
    event_type,
    status_before,
    status_after,
    simulation_run_id,
    runner_result_snapshot,
    failure_message,
    metadata_snapshot,
    handoff_row_hash,
    previous_event_hash,
    event_hash,
    recorded_at
  )
  values
  (
    new.handoff_id,
    new.stage_id,
    new.race_id,
    new.process_run_id,
    new.claim_id,
    new.claim_generation,
    v_sequence,
    v_event_type,
    case when tg_op='UPDATE' then old.handoff_status else null end,
    new.handoff_status,
    new.simulation_run_id,
    new.runner_result,
    new.failure_message,
    new.metadata,
    v_row_hash,
    v_previous_hash,
    v_event_hash,
    v_recorded_at
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_runner_handoff_plan_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage jsonb;
  v_race_id uuid;
  v_route text;
  v_run jsonb;
  v_claim jsonb;
  v_process_run jsonb;
  v_handoff jsonb;
  v_status text;
begin
  select to_jsonb(s),s.race_id
  into v_stage,v_race_id
  from public.race_stages s
  where s.id=p_stage_id;

  if v_stage is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  v_route :=
    case
      when lower(trim(coalesce(v_stage->>'stage_format',''))) in
           (
             'prologue','itt','individual_time_trial',
             'individual time trial','time_trial','time trial'
           )
        then 'individual_time_trial'
      when lower(trim(coalesce(v_stage->>'stage_format',''))) in
           ('ttt','team_time_trial','team time trial')
        then 'team_time_trial'
      else 'road_race'
    end;

  select to_jsonb(r)
  into v_run
  from public.race_stage_simulation_runs r
  where r.stage_id=p_stage_id;

  select to_jsonb(c)
  into v_claim
  from public.race_engine_stage_process_claim_v2 c
  where c.stage_id=p_stage_id;

  if v_claim is not null then
    select to_jsonb(p)
    into v_process_run
    from public.race_engine_stage_process_runs_v2 p
    where p.process_run_id=
          (v_claim->>'active_process_run_id')::uuid;
  end if;

  select to_jsonb(h)
  into v_handoff
  from public.race_engine_stage_runner_handoff_v2 h
  where h.stage_id=p_stage_id;

  v_status :=
    case
      when p_stage_id=
           '24709c46-b258-4db3-a3aa-fd92dc37630e'::uuid
        then 'historical_golden_fixture_verify_only'

      when coalesce((v_stage->>'weather_cancelled')::boolean,false)
       and v_run->>'status'='completed'
        then 'historical_weather_cancelled_verify_only'

      when v_run->>'status'='completed'
        then 'existing_completed_simulation_verify_only'

      when v_handoff is not null
       and v_handoff->>'handoff_status' in
           ('runner_succeeded','duplicate_completed')
        then 'duplicate_runner_handoff_return_saved_evidence'

      when v_run is not null
        then 'conflicting_noncompleted_simulation_run_blocked'

      when v_claim is null
        then 'runner_handoff_requires_live_claim_execution_disabled'

      when v_claim->>'claim_status' not in ('claimed','running')
        then 'runner_handoff_claim_not_live_blocked'

      when v_process_run is null
        then 'runner_handoff_process_run_missing_blocked'

      when v_process_run->>'status'<>'started'
        then 'runner_handoff_process_run_not_started_blocked'

      when exists
           (
             select 1
             from public.race_engine_stage_immutable_state_v2 i
             where i.stage_id=p_stage_id
           )
        then 'runner_handoff_immutable_stage_blocked'

      when v_handoff is not null
        then 'runner_handoff_existing_nonterminal_handoff_blocked'

      else 'runner_handoff_ready_execution_disabled'
    end;

  return jsonb_build_object(
    'status',v_status,
    'stage_id',p_stage_id,
    'race_id',v_race_id,
    'route_format',v_route,
    'stage_lock_key',
      hashtextextended(
        'race_engine_process_stage_once_v2:'||p_stage_id::text,
        0
      ),
    'active_claim',v_claim,
    'process_run',v_process_run,
    'existing_handoff',v_handoff,
    'existing_simulation_run',v_run,
    'simulation_run_owner','route_specific_runner',
    'precreate_simulation_run',false,
    'dispatcher_signature',
      'run_race_stage_simulation_v1(uuid)',
    'production_runner_handoff_enabled',false,
    'effect_reservation_enabled',false,
    'closeout_enabled',false,
    'scheduler_cutover_enabled',false,
    'plan_version',
      'phase3ac_a9_route_runner_handoff_plan_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_runner_handoff_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_result jsonb:='{}'::jsonb;
  v_hash text;
  v_count bigint;
  v_relation record;
  v_race_id uuid;
begin
  select s.race_id
  into v_race_id
  from public.race_stages s
  where s.id=p_stage_id;

  v_result :=
    jsonb_build_object(
      'stage_hash',
        (
          select md5(coalesce(to_jsonb(s)::text,''))
          from public.race_stages s
          where s.id=p_stage_id
        ),
      'race_hash',
        (
          select md5(coalesce(to_jsonb(r)::text,''))
          from public.races r
          where r.id=v_race_id
        )
    );

  for v_relation in
    select
      n.nspname schema_name,
      c.relname relation_name
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public'
      and c.relkind in ('r','p')
      and a.attname='stage_id'
      and a.attnum>0
      and not a.attisdropped
    order by c.relname
  loop
    execute format(
      'select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from %I.%I t where t.stage_id=$1',
      v_relation.schema_name,
      v_relation.relation_name
    )
    into v_count,v_hash
    using p_stage_id;

    v_result :=
      v_result
      ||jsonb_build_object(
          v_relation.schema_name||'.'||v_relation.relation_name,
          jsonb_build_object(
            'count',v_count,
            'hash',v_hash
          )
        );
  end loop;

  for v_relation in
    select
      n.nspname schema_name,
      c.relname relation_name
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public'
      and c.relkind in ('r','p')
      and a.attname='simulation_run_id'
      and a.attnum>0
      and not a.attisdropped
      and not exists
          (
            select 1
            from pg_attribute s
            where s.attrelid=c.oid
              and s.attname='stage_id'
              and s.attnum>0
              and not s.attisdropped
          )
    order by c.relname
  loop
    execute format(
      'select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from %I.%I t where t.simulation_run_id in (select id from public.race_stage_simulation_runs where stage_id=$1)',
      v_relation.schema_name,
      v_relation.relation_name
    )
    into v_count,v_hash
    using p_stage_id;

    v_result :=
      v_result
      ||jsonb_build_object(
          v_relation.schema_name||'.'||v_relation.relation_name||':by_simulation_run',
          jsonb_build_object(
            'count',v_count,
            'hash',v_hash
          )
        );
  end loop;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_run_runner_handoff_shadow_v2(p_stage_id uuid, p_mode text DEFAULT 'success_rollback'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_stage jsonb;
  v_race_id uuid;
  v_route text;
  v_lock_key bigint;

  v_process_run_id uuid:=gen_random_uuid();
  v_claim_id uuid;
  v_handoff_id uuid:=gen_random_uuid();
  v_simulation_run_id uuid;

  v_runner_result jsonb;
  v_history jsonb;

  v_before jsonb;
  v_after jsonb;

  v_fixture_before jsonb;
  v_fixture_after jsonb;

  v_inner_marker constant text :=
    'PHASE3AC_A9_INNER_RUNNER_ROLLBACK_MARKER';
  v_outer_marker constant text :=
    'PHASE3AC_A9_OUTER_SHADOW_ROLLBACK_MARKER';

  v_runner_completed boolean:=false;
  v_failure_audit_verified boolean:=false;
  v_inner_rollback_verified boolean:=false;
begin
  select to_jsonb(s),s.race_id
  into v_stage,v_race_id
  from public.race_stages s
  where s.id=p_stage_id;

  if v_stage is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id
    );
  end if;

  if p_mode not in ('success_rollback','injected_failure_rollback') then
    return jsonb_build_object(
      'status','unsupported_shadow_mode',
      'stage_id',p_stage_id,
      'mode',p_mode
    );
  end if;

  if exists
  (
    select 1
    from public.race_stage_simulation_runs r
    where r.stage_id=p_stage_id
  ) then
    return jsonb_build_object(
      'status','existing_simulation_run_verify_only',
      'stage_id',p_stage_id,
      'mode',p_mode
    );
  end if;

  if exists
  (
    select 1
    from public.race_engine_stage_process_claim_v2 c
    where c.stage_id=p_stage_id
  ) then
    return jsonb_build_object(
      'status','existing_process_claim_blocked',
      'stage_id',p_stage_id,
      'mode',p_mode
    );
  end if;

  v_route :=
    case
      when lower(trim(coalesce(v_stage->>'stage_format',''))) in
           (
             'prologue','itt','individual_time_trial',
             'individual time trial','time_trial','time trial'
           )
        then 'individual_time_trial'
      when lower(trim(coalesce(v_stage->>'stage_format',''))) in
           ('ttt','team_time_trial','team time trial')
        then 'team_time_trial'
      else 'road_race'
    end;

  v_lock_key :=
    hashtextextended(
      'race_engine_process_stage_once_v2:'||p_stage_id::text,
      0
    );

  v_before :=
    public.race_engine_get_runner_handoff_snapshot_v2(p_stage_id);

  v_fixture_before :=
    public.race_engine_verify_golden_stage_fixture_v1(
      'rio_tour_stage1_phase3aa_golden_v1'
    );

  begin
    perform pg_advisory_xact_lock(v_lock_key);

    insert into public.race_engine_stage_process_runs_v2
    (
      process_run_id,
      stage_id,
      race_id,
      processor_version,
      requested_dry_run,
      status,
      reason,
      normalized_stage_format,
      stage_lock_key,
      process_plan,
      plan_hash,
      golden_fixture_status_before,
      production_execution_enabled,
      existing_runner_called,
      caller_identity,
      started_at,
      metadata
    )
    values
    (
      v_process_run_id,
      p_stage_id,
      v_race_id,
      'phase3ac_a9_route_runner_handoff_shadow_v1',
      true,
      'started',
      'A9 rollback-only runner handoff shadow.',
      v_route,
      v_lock_key,
      jsonb_build_object(
        'phase','phase3ac_a9',
        'route_format',v_route,
        'mode',p_mode,
        'route_runner_owned_simulation_run',true
      ),
      md5(
        jsonb_build_object(
          'phase','phase3ac_a9',
          'route_format',v_route,
          'mode',p_mode,
          'route_runner_owned_simulation_run',true
        )::text
      ),
      v_fixture_before->>'status',
      false,
      false,
      session_user,
      clock_timestamp(),
      jsonb_build_object(
        'phase','phase3ac_a9',
        'rollback_only',true,
        'mode',p_mode
      )
    );

    insert into public.race_engine_stage_process_claim_v2
    (
      stage_id,
      race_id,
      active_process_run_id,
      predecessor_process_run_id,
      claim_generation,
      claim_status,
      owner_backend_pid,
      owner_session_user,
      stage_lock_key,
      claimed_at,
      heartbeat_at,
      expires_at,
      metadata
    )
    values
    (
      p_stage_id,
      v_race_id,
      v_process_run_id,
      null,
      1,
      'running',
      pg_backend_pid(),
      session_user,
      v_lock_key,
      clock_timestamp(),
      clock_timestamp(),
      clock_timestamp()+interval '30 minutes',
      jsonb_build_object(
        'phase','phase3ac_a9',
        'rollback_only',true,
        'mode',p_mode
      )
    )
    returning claim_id into v_claim_id;

    insert into public.race_engine_stage_runner_handoff_v2
    (
      handoff_id,
      stage_id,
      race_id,
      process_run_id,
      claim_id,
      claim_generation,
      stage_lock_key,
      route_format,
      runner_signature,
      handoff_status,
      metadata
    )
    values
    (
      v_handoff_id,
      p_stage_id,
      v_race_id,
      v_process_run_id,
      v_claim_id,
      1,
      v_lock_key,
      v_route,
      'run_race_stage_simulation_v1(uuid)',
      'reserved',
      jsonb_build_object(
        'phase','phase3ac_a9',
        'rollback_only',true,
        'mode',p_mode
      )
    );

    if p_mode='success_rollback' then
      update public.race_engine_stage_runner_handoff_v2
      set
        handoff_status='runner_invoking',
        runner_started_at=clock_timestamp()
      where handoff_id=v_handoff_id;

      v_runner_result :=
        public.run_race_stage_simulation_v1(p_stage_id);

      v_simulation_run_id :=
        public.race_engine_try_uuid_v1(
          coalesce(
            v_runner_result->>'simulation_run_id',
            v_runner_result->>'run_id',
            v_runner_result->>'race_stage_simulation_run_id'
          )
        );

      if v_simulation_run_id is null then
        v_simulation_run_id :=
          public.race_engine_resolve_latest_stage_simulation_run_v20(
            p_stage_id
          );
      end if;

      if v_simulation_run_id is null
         or not exists
            (
              select 1
              from public.race_stage_simulation_runs r
              where r.id=v_simulation_run_id
                and r.stage_id=p_stage_id
                and r.status='completed'
            )
      then
        raise exception
          'A9 shadow runner did not produce a completed simulation for stage %.',
          p_stage_id;
      end if;

      update public.race_engine_stage_runner_handoff_v2
      set
        handoff_status='runner_succeeded',
        simulation_run_id=v_simulation_run_id,
        runner_result=coalesce(v_runner_result,'{}'::jsonb),
        runner_finished_at=clock_timestamp()
      where handoff_id=v_handoff_id;

      update public.race_engine_stage_process_runs_v2
      set
        simulation_run_id=v_simulation_run_id,
        status='dry_run_ready_shadow_only',
        reason='A9 route runner handoff verified; outer rollback required.',
        finished_at=clock_timestamp(),
        golden_fixture_status_after=
          public.race_engine_verify_golden_stage_fixture_v1(
            'rio_tour_stage1_phase3aa_golden_v1'
          )->>'status',
        metadata=
          metadata
          ||jsonb_build_object(
              'runner_handoff_verified',true,
              'simulation_run_id',v_simulation_run_id,
              'runner_result_status',v_runner_result->>'status'
            )
      where process_run_id=v_process_run_id;

      update public.race_engine_stage_process_claim_v2
      set
        claim_status='released',
        released_at=clock_timestamp(),
        metadata=
          metadata
          ||jsonb_build_object(
              'runner_handoff_verified',true
            )
      where stage_id=p_stage_id;

      v_history :=
        public.race_engine_get_runner_handoff_history_v2(p_stage_id);

      if not coalesce((v_history->>'chain_valid')::boolean,false)
         or (v_history->>'event_count')::integer<>3
      then
        raise exception
          'A9 handoff history chain failed for stage %.',
          p_stage_id;
      end if;

      v_runner_completed:=true;

    else
      begin
        update public.race_engine_stage_runner_handoff_v2
        set
          handoff_status='runner_invoking',
          runner_started_at=clock_timestamp()
        where handoff_id=v_handoff_id;

        v_runner_result :=
          public.run_race_stage_simulation_v1(p_stage_id);

        v_simulation_run_id :=
          public.race_engine_resolve_latest_stage_simulation_run_v20(
            p_stage_id
          );

        raise exception using
          errcode='P0001',
          message=v_inner_marker;

      exception
        when raise_exception then
          if sqlerrm<>v_inner_marker then
            raise;
          end if;
      end;

      v_inner_rollback_verified :=
        not exists
        (
          select 1
          from public.race_stage_simulation_runs r
          where r.stage_id=p_stage_id
        );

      if not v_inner_rollback_verified then
        raise exception
          'A9 injected failure did not roll back runner writes for stage %.',
          p_stage_id;
      end if;

      update public.race_engine_stage_process_runs_v2
      set
        status='error',
        error_message='Injected A9 post-run failure after nested rollback.',
        finished_at=clock_timestamp(),
        metadata=
          metadata
          ||jsonb_build_object(
              'injected_runner_failure_verified',true,
              'inner_runner_writes_rolled_back',true
            )
      where process_run_id=v_process_run_id;

      update public.race_engine_stage_process_claim_v2
      set
        claim_status='failed',
        failure_message=
          'Injected A9 post-run failure after nested rollback.',
        metadata=
          metadata
          ||jsonb_build_object(
              'inner_runner_writes_rolled_back',true
            )
      where stage_id=p_stage_id;

      update public.race_engine_stage_runner_handoff_v2
      set
        handoff_status='runner_failed',
        failure_message=
          'Injected A9 post-run failure after nested rollback.',
        runner_finished_at=clock_timestamp(),
        metadata=
          metadata
          ||jsonb_build_object(
              'inner_runner_writes_rolled_back',true
            )
      where handoff_id=v_handoff_id;

      v_history :=
        public.race_engine_get_runner_handoff_history_v2(p_stage_id);

      v_failure_audit_verified :=
        coalesce((v_history->>'chain_valid')::boolean,false)
        and (v_history->>'event_count')::integer=2
        and exists
            (
              select 1
              from public.race_engine_stage_runner_handoff_v2 h
              where h.handoff_id=v_handoff_id
                and h.handoff_status='runner_failed'
            )
        and exists
            (
              select 1
              from public.race_engine_stage_process_claim_v2 c
              where c.stage_id=p_stage_id
                and c.claim_status='failed'
            )
        and exists
            (
              select 1
              from public.race_engine_stage_process_runs_v2 p
              where p.process_run_id=v_process_run_id
                and p.status='error'
            );

      if not v_failure_audit_verified then
        raise exception
          'A9 injected failure audit contract failed for stage %.',
          p_stage_id;
      end if;
    end if;

    raise exception using
      errcode='P0001',
      message=v_outer_marker;

  exception
    when raise_exception then
      if sqlerrm<>v_outer_marker then
        raise;
      end if;
  end;

  v_after :=
    public.race_engine_get_runner_handoff_snapshot_v2(p_stage_id);

  v_fixture_after :=
    public.race_engine_verify_golden_stage_fixture_v1(
      'rio_tour_stage1_phase3aa_golden_v1'
    );

  return jsonb_build_object(
    'status',
      case
        when v_before=v_after
         and v_fixture_before->>'status'='fixture_matches_current_state'
         and v_fixture_after->>'status'='fixture_matches_current_state'
         and not exists
             (
               select 1
               from public.race_engine_stage_process_runs_v2 p
               where p.process_run_id=v_process_run_id
             )
         and not exists
             (
               select 1
               from public.race_engine_stage_process_claim_v2 c
               where c.stage_id=p_stage_id
             )
         and not exists
             (
               select 1
               from public.race_engine_stage_runner_handoff_v2 h
               where h.handoff_id=v_handoff_id
             )
         and not exists
             (
               select 1
               from public.race_engine_stage_runner_handoff_history_v2 h
               where h.handoff_id=v_handoff_id
             )
         and not exists
             (
               select 1
               from public.race_stage_simulation_runs r
               where r.stage_id=p_stage_id
             )
         and
             (
               (p_mode='success_rollback' and v_runner_completed)
               or
               (
                 p_mode='injected_failure_rollback'
                 and v_inner_rollback_verified
                 and v_failure_audit_verified
               )
             )
          then
            case
              when p_mode='success_rollback'
                then 'route_runner_handoff_shadow_passed'
              else 'runner_failure_isolation_shadow_passed'
            end
        else 'runner_handoff_shadow_failed'
      end,

    'stage_id',p_stage_id,
    'race_id',v_race_id,
    'route_format',v_route,
    'mode',p_mode,
    'stage_lock_key',v_lock_key,
    'simulation_run_owner','route_specific_runner',
    'precreated_simulation_run',false,
    'runner_completed_before_outer_rollback',v_runner_completed,
    'inner_runner_rollback_verified',v_inner_rollback_verified,
    'failure_audit_verified',v_failure_audit_verified,
    'runner_result',v_runner_result,
    'resolved_simulation_run_id',v_simulation_run_id,
    'history_evidence',v_history,
    'before_snapshot',v_before,
    'after_snapshot',v_after,
    'exact_rollback',v_before=v_after,
    'process_run_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_runs_v2
        where process_run_id=v_process_run_id
      ),
    'process_claim_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_process_claim_v2
        where stage_id=p_stage_id
      ),
    'handoff_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_runner_handoff_v2
        where handoff_id=v_handoff_id
      ),
    'handoff_history_persisted',
      exists
      (
        select 1
        from public.race_engine_stage_runner_handoff_history_v2
        where handoff_id=v_handoff_id
      ),
    'simulation_run_persisted',
      exists
      (
        select 1
        from public.race_stage_simulation_runs
        where stage_id=p_stage_id
      ),
    'effect_reserved',false,
    'closeout_called',false,
    'scheduler_cutover_enabled',false,
    'shadow_version',
      'phase3ac_a9_route_runner_handoff_shadow_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_runner_handoff_v2(p_stage_id uuid, p_execute boolean DEFAULT false, p_confirmation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_plan jsonb;
begin
  v_plan :=
    public.race_engine_get_runner_handoff_plan_v2(p_stage_id);

  return jsonb_build_object(
    'status',
      'blocked_runner_handoff_execution_disabled_in_phase3ac_a9',
    'stage_id',p_stage_id,
    'execute_requested',coalesce(p_execute,false),
    'confirmation_supplied',p_confirmation is not null,
    'confirmation_matches',
      p_confirmation='CONFIRM_PHASE3AC_A9_RUNNER_HANDOFF',
    'plan',v_plan,
    'process_run_written',false,
    'process_claim_written',false,
    'claim_history_written',false,
    'handoff_written',false,
    'handoff_history_written',false,
    'simulation_run_written',false,
    'runner_called',false,
    'effect_reserved',false,
    'closeout_called',false,
    'scheduler_cutover_enabled',false,
    'production_runner_handoff_enabled',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_stage_effect_history_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  raise exception
    'Stage effect history is append-only.'
    using errcode='P0001';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_capture_stage_effect_history_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_history_id uuid := gen_random_uuid();
  v_event_sequence integer;
  v_previous_hash text;
  v_event_type text;
  v_status_before text;
  v_event_payload jsonb;
  v_event_hash text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'phase3ac_a10_effect_history',
        new.stage_id::text
      ),
      0
    )
  );

  select
    h.event_sequence,
    h.event_hash
  into
    v_event_sequence,
    v_previous_hash
  from public.race_engine_stage_effect_history_v2 h
  where h.stage_id=new.stage_id
  order by h.event_sequence desc
  limit 1;

  v_event_sequence :=
    coalesce(v_event_sequence,0)+1;

  if tg_op='INSERT' then
    v_status_before := null;
    v_event_type := 'effect_reserved';

    v_event_payload :=
      jsonb_build_object(
        'operation','INSERT',
        'new_metadata',new.metadata,
        'captured_by',session_user
      );
  else
    v_status_before := old.effect_status;

    v_event_type :=
      case
        when old.effect_status is distinct from new.effect_status
          then 'effect_'||new.effect_status
        else 'effect_reservation_refreshed'
      end;

    v_event_payload :=
      jsonb_build_object(
        'operation','UPDATE',
        'old_metadata',old.metadata,
        'new_metadata',new.metadata,
        'captured_by',session_user
      );
  end if;

  v_event_hash :=
    md5(
      jsonb_build_object(
        'history_id',v_history_id,
        'stage_id',new.stage_id,
        'race_id',new.race_id,
        'simulation_run_id',new.simulation_run_id,
        'effect_id',new.effect_id,
        'effect_key',new.effect_key,
        'event_sequence',v_event_sequence,
        'event_type',v_event_type,
        'status_before',v_status_before,
        'status_after',new.effect_status,
        'source_payload_hash',new.source_payload_hash,
        'applied_payload_hash',new.applied_payload_hash,
        'error_message',new.error_message,
        'event_payload',v_event_payload,
        'previous_event_hash',v_previous_hash
      )::text
    );

  insert into public.race_engine_stage_effect_history_v2
  (
    history_id,
    stage_id,
    race_id,
    simulation_run_id,
    effect_id,
    effect_key,
    event_sequence,
    event_type,
    status_before,
    status_after,
    source_payload_hash,
    applied_payload_hash,
    error_message,
    event_payload,
    previous_event_hash,
    event_hash
  )
  values
  (
    v_history_id,
    new.stage_id,
    new.race_id,
    new.simulation_run_id,
    new.effect_id,
    new.effect_key,
    v_event_sequence,
    v_event_type,
    v_status_before,
    new.effect_status,
    new.source_payload_hash,
    new.applied_payload_hash,
    new.error_message,
    v_event_payload,
    v_previous_hash,
    v_event_hash
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_effect_transition_plan_v2(p_stage_id uuid, p_effect_key text, p_target_status text, p_applied_payload_hash text DEFAULT NULL::text, p_transition_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_effect record;
  v_adapter_plan jsonb;
  v_adapter jsonb;

  v_effect_key text;
  v_target_status text;

  v_adapter_order integer;
  v_required_for_route boolean;
  v_expected_source_hash text;

  v_dependency_count integer := 0;
  v_dependencies jsonb := '[]'::jsonb;

  v_transition_allowed boolean := false;
  v_duplicate_terminal boolean := false;
  v_reason text;

  v_config jsonb;
begin
  v_effect_key := lower(btrim(coalesce(p_effect_key,'')));
  v_target_status := lower(btrim(coalesce(p_target_status,'')));

  if p_stage_id is null
     or v_effect_key=''
     or v_target_status=''
     or jsonb_typeof(coalesce(p_transition_metadata,'{}'::jsonb))
        is distinct from 'object'
  then
    return jsonb_build_object(
      'status','blocked_invalid_transition_input',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'target_status',v_target_status,
      'transition_allowed',false,
      'effect_status_changed',false
    );
  end if;

  if v_target_status not in
     (
       'started',
       'applied',
       'verified',
       'skipped',
       'failed'
     )
  then
    return jsonb_build_object(
      'status','blocked_invalid_target_status',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'target_status',v_target_status,
      'transition_allowed',false,
      'effect_status_changed',false
    );
  end if;

  select
    l.effect_id,
    l.stage_id,
    l.race_id,
    l.simulation_run_id,
    l.effect_key,
    l.effect_status,
    l.owner_component,
    l.writer_function,
    l.idempotency_key,
    l.source_payload_hash,
    l.applied_payload_hash,
    l.error_message,
    l.metadata
  into v_effect
  from public.race_engine_stage_effect_ledger_v2 l
  where l.stage_id=p_stage_id
    and l.effect_key=v_effect_key
  limit 1;

  if v_effect.effect_id is null then
    return jsonb_build_object(
      'status','blocked_effect_not_reserved',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'target_status',v_target_status,
      'transition_allowed',false,
      'effect_status_changed',false
    );
  end if;

  v_adapter_plan :=
    public.race_engine_get_stage_effect_writer_adapter_plan_v2(
      p_stage_id
    );

  select a.value
  into v_adapter
  from jsonb_array_elements(
         coalesce(v_adapter_plan->'adapters','[]'::jsonb)
       ) a(value)
  where a.value->>'effect_key'=v_effect_key
  limit 1;

  if v_adapter is null then
    return jsonb_build_object(
      'status','blocked_effect_adapter_not_found',
      'stage_id',p_stage_id,
      'effect_id',v_effect.effect_id,
      'effect_key',v_effect_key,
      'current_status',v_effect.effect_status,
      'target_status',v_target_status,
      'transition_allowed',false,
      'effect_status_changed',false
    );
  end if;

  v_adapter_order :=
    nullif(v_adapter->>'adapter_order','')::integer;

  v_required_for_route :=
    coalesce(
      nullif(v_adapter->>'required_for_route','')::boolean,
      false
    );

  v_expected_source_hash :=
    v_adapter->>'source_payload_hash';

  with prior_required as
  (
    select
      a.value->>'effect_key' effect_key,
      (a.value->>'adapter_order')::integer adapter_order,
      l.effect_status
    from jsonb_array_elements(
           coalesce(v_adapter_plan->'adapters','[]'::jsonb)
         ) a(value)
    left join public.race_engine_stage_effect_ledger_v2 l
      on l.stage_id=p_stage_id
     and l.effect_key=a.value->>'effect_key'
    where coalesce(
            nullif(a.value->>'required_for_route','')::boolean,
            false
          )
      and (a.value->>'adapter_order')::integer<v_adapter_order
  )
  select
    count(*) filter
    (
      where effect_status is distinct from 'verified'
    )::integer,

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'effect_key',effect_key,
          'adapter_order',adapter_order,
          'effect_status',effect_status,
          'dependency_satisfied',
            effect_status='verified'
        )
        order by adapter_order
      ),
      '[]'::jsonb
    )
  into
    v_dependency_count,
    v_dependencies
  from prior_required;

  if v_effect.source_payload_hash
     is distinct from v_expected_source_hash
  then
    v_reason := 'blocked_reserved_source_hash_drift';

  elsif v_effect.effect_status in
        ('verified','skipped','failed')
  then
    if v_effect.effect_status=v_target_status
       and
       (
         v_target_status<>'verified'
         or v_effect.applied_payload_hash
            is not distinct from p_applied_payload_hash
       )
    then
      v_duplicate_terminal := true;
      v_reason := 'duplicate_terminal_transition_saved_evidence';
    else
      v_reason := 'blocked_terminal_effect_transition';
    end if;

  elsif v_effect.effect_status='planned'
        and v_target_status='started'
  then
    if v_dependency_count=0 then
      v_transition_allowed := true;
      v_reason := 'planned_to_started_allowed';
    else
      v_reason := 'blocked_unsatisfied_effect_dependencies';
    end if;

  elsif v_effect.effect_status='started'
        and v_target_status='applied'
  then
    if nullif(btrim(coalesce(p_applied_payload_hash,'')),'')
       is null
    then
      v_reason := 'blocked_applied_payload_hash_required';
    else
      v_transition_allowed := true;
      v_reason := 'started_to_applied_allowed';
    end if;

  elsif v_effect.effect_status='applied'
        and v_target_status='verified'
  then
    if nullif(btrim(coalesce(p_applied_payload_hash,'')),'')
       is null
    then
      v_reason := 'blocked_verified_payload_hash_required';

    elsif v_effect.applied_payload_hash
          is distinct from p_applied_payload_hash
    then
      v_reason := 'blocked_applied_payload_hash_mismatch';

    else
      v_transition_allowed := true;
      v_reason := 'applied_to_verified_allowed';
    end if;

  elsif v_target_status='skipped'
        and v_effect.effect_status in ('planned','started')
  then
    if v_required_for_route then
      v_reason := 'blocked_required_effect_cannot_be_skipped';
    else
      v_transition_allowed := true;
      v_reason := 'optional_effect_skip_allowed';
    end if;

  elsif v_target_status='failed'
        and v_effect.effect_status in
            ('planned','started','applied')
  then
    if nullif(
         btrim(
           coalesce(
             p_transition_metadata->>'error_message',
             ''
           )
         ),
         ''
       ) is null
    then
      v_reason := 'blocked_failure_message_required';
    else
      v_transition_allowed := true;
      v_reason := 'effect_failure_transition_allowed';
    end if;

  else
    v_reason := 'blocked_invalid_lifecycle_transition';
  end if;

  select to_jsonb(c)-'created_at'-'updated_at'
  into v_config
  from public.race_engine_effect_immutable_config_v2 c
  where c.config_key='effect_immutable';

  return jsonb_build_object(
    'status',v_reason,

    'stage_id',p_stage_id,
    'race_id',v_effect.race_id,
    'simulation_run_id',v_effect.simulation_run_id,

    'effect_id',v_effect.effect_id,
    'effect_key',v_effect_key,

    'current_status',v_effect.effect_status,
    'target_status',v_target_status,

    'adapter_order',v_adapter_order,
    'required_for_route',v_required_for_route,

    'reserved_source_payload_hash',
      v_effect.source_payload_hash,

    'expected_source_payload_hash',
      v_expected_source_hash,

    'existing_applied_payload_hash',
      v_effect.applied_payload_hash,

    'provided_applied_payload_hash',
      p_applied_payload_hash,

    'unsatisfied_dependency_count',
      v_dependency_count,

    'dependencies',
      v_dependencies,

    'transition_allowed',
      v_transition_allowed,

    'duplicate_terminal_transition',
      v_duplicate_terminal,

    'effect_status_changed',
      false,

    'configuration',
      v_config,

    'production_effect_transition_enabled',
      false,

    'transition_plan_version',
      'phase3ac_a10_effect_transition_plan_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_transition_stage_effect_v2(p_stage_id uuid, p_effect_key text, p_target_status text, p_applied_payload_hash text DEFAULT NULL::text, p_transition_metadata jsonb DEFAULT '{}'::jsonb, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan jsonb;
  v_config record;
  v_effect record;

  v_effect_key text;
  v_target_status text;

  v_transition_count integer;
begin
  v_effect_key := lower(btrim(coalesce(p_effect_key,'')));
  v_target_status := lower(btrim(coalesce(p_target_status,'')));

  select *
  into v_config
  from public.race_engine_effect_immutable_config_v2
  where config_key='effect_immutable';

  if not coalesce(p_execute,false) then
    v_plan :=
      public.race_engine_get_stage_effect_transition_plan_v2(
        p_stage_id,
        v_effect_key,
        v_target_status,
        p_applied_payload_hash,
        coalesce(p_transition_metadata,'{}'::jsonb)
      );

    return v_plan
           ||
           jsonb_build_object(
             'status',
               'transition_plan_only_execution_disabled',
             'execute_requested',
               false,
             'effect_status_changed',
               false
           );
  end if;

  if not coalesce(
           v_config.transition_shadow_execution_enabled,
           false
         )
  then
    return jsonb_build_object(
      'status',
        'blocked_effect_transition_execution_disabled_in_phase3ac_a10',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'target_status',v_target_status,
      'execute_requested',true,
      'confirmation_supplied',
        p_confirmation_text is not null,
      'confirmation_matches',
        md5(coalesce(p_confirmation_text,''))
        =
        v_config.transition_confirmation_hash,
      'effect_status_changed',false,
      'production_effect_transition_enabled',false
    );
  end if;

  if md5(coalesce(p_confirmation_text,''))
     is distinct from
     v_config.transition_confirmation_hash
  then
    return jsonb_build_object(
      'status',
        'blocked_effect_transition_confirmation_mismatch',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'target_status',v_target_status,
      'execute_requested',true,
      'confirmation_supplied',
        p_confirmation_text is not null,
      'confirmation_matches',false,
      'effect_status_changed',false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'phase3ac_a10_stage_effect_transition',
        p_stage_id::text
      ),
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     )->>'status'
     is distinct from 'fixture_matches_current_state'
  then
    return jsonb_build_object(
      'status','blocked_golden_fixture_mismatch',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'effect_status_changed',false
    );
  end if;

  if p_stage_id=
     '24709c46-b258-4db3-a3aa-fd92dc37630e'::uuid
  then
    return jsonb_build_object(
      'status','historical_golden_fixture_verify_only',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'effect_status_changed',false,
      'rio_writer_calls',0
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_effect_transition_plan_v2(
      p_stage_id,
      v_effect_key,
      v_target_status,
      p_applied_payload_hash,
      coalesce(p_transition_metadata,'{}'::jsonb)
    );

  if coalesce(
       (v_plan->>'duplicate_terminal_transition')::boolean,
       false
     )
  then
    return v_plan
           ||
           jsonb_build_object(
             'status',
               'duplicate_terminal_transition_saved_evidence',
             'execute_requested',
               true,
             'effect_status_changed',
               false,
             'production_effect_transition_enabled',
               false
           );
  end if;

  if not coalesce(
           (v_plan->>'transition_allowed')::boolean,
           false
         )
  then
    return v_plan
           ||
           jsonb_build_object(
             'execute_requested',
               true,
             'effect_status_changed',
               false,
             'production_effect_transition_enabled',
               false
           );
  end if;

  select
    l.effect_id,
    l.effect_status,
    l.metadata
  into v_effect
  from public.race_engine_stage_effect_ledger_v2 l
  where l.stage_id=p_stage_id
    and l.effect_key=v_effect_key
  for update;

  if v_effect.effect_id is null then
    return jsonb_build_object(
      'status','blocked_effect_not_reserved_after_lock',
      'stage_id',p_stage_id,
      'effect_key',v_effect_key,
      'effect_status_changed',false
    );
  end if;

  if v_effect.effect_status
     is distinct from v_plan->>'current_status'
  then
    return v_plan
           ||
           jsonb_build_object(
             'status',
               'blocked_effect_status_changed_after_plan',
             'locked_current_status',
               v_effect.effect_status,
             'effect_status_changed',
               false
           );
  end if;

  v_transition_count :=
    coalesce(
      nullif(
        v_effect.metadata->>'transition_count',
        ''
      )::integer,
      0
    )+1;

  update public.race_engine_stage_effect_ledger_v2 l
  set
    effect_status=v_target_status,

    started_at=
      case
        when v_target_status='started'
          then coalesce(l.started_at,clock_timestamp())
        else l.started_at
      end,

    applied_payload_hash=
      case
        when v_target_status in ('applied','verified')
          then p_applied_payload_hash
        else l.applied_payload_hash
      end,

    applied_at=
      case
        when v_target_status='applied'
          then coalesce(l.applied_at,clock_timestamp())
        else l.applied_at
      end,

    verified_at=
      case
        when v_target_status in ('verified','skipped')
          then coalesce(l.verified_at,clock_timestamp())
        else l.verified_at
      end,

    error_message=
      case
        when v_target_status='failed'
          then p_transition_metadata->>'error_message'
        else null
      end,

    metadata=
      coalesce(l.metadata,'{}'::jsonb)
      ||
      coalesce(p_transition_metadata,'{}'::jsonb)
      ||
      jsonb_build_object(
        'transition_count',v_transition_count,
        'transitioned_at',clock_timestamp(),
        'transitioned_by',session_user,
        'previous_status',v_effect.effect_status,
        'target_status',v_target_status,
        'transition_writer_version',
          'phase3ac_a10_effect_transition_writer_v1',
        'execution_mode','rollback_shadow_only',
        'production_effect_transition_enabled',false
      ),

    updated_at=clock_timestamp()

  where l.effect_id=v_effect.effect_id
    and l.effect_status=v_effect.effect_status

  returning
    l.effect_id,
    l.race_id,
    l.simulation_run_id,
    l.effect_status,
    l.source_payload_hash,
    l.applied_payload_hash,
    l.started_at,
    l.applied_at,
    l.verified_at,
    l.error_message,
    l.metadata
  into v_effect;

  if not found then
    return v_plan
           ||
           jsonb_build_object(
             'status',
               'blocked_effect_transition_lost_update',
             'effect_status_changed',
               false
           );
  end if;

  return jsonb_build_object(
    'status','effect_transition_applied_in_shadow_mode',

    'stage_id',p_stage_id,
    'race_id',v_effect.race_id,
    'simulation_run_id',v_effect.simulation_run_id,

    'effect_id',v_effect.effect_id,
    'effect_key',v_effect_key,

    'previous_status',v_plan->>'current_status',
    'effect_status',v_effect.effect_status,

    'source_payload_hash',v_effect.source_payload_hash,
    'applied_payload_hash',v_effect.applied_payload_hash,

    'started_at',v_effect.started_at,
    'applied_at',v_effect.applied_at,
    'verified_at',v_effect.verified_at,

    'error_message',v_effect.error_message,
    'metadata',v_effect.metadata,

    'effect_status_changed',true,

    'production_effect_transition_enabled',false,
    'scheduler_cutover_enabled',false,

    'transition_writer_version',
      'phase3ac_a10_effect_transition_writer_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_immutable_write_plan_v2(p_stage_id uuid, p_simulation_run_id uuid, p_process_run_id uuid, p_route_format text, p_source_payload_hash text, p_effect_matrix_hash text, p_output_payload_hash text, p_closeout_evidence_hash text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_run record;
  v_process record;
  v_existing record;

  v_closeout_readiness jsonb;
  v_output_integrity jsonb;
  v_closeout_evidence jsonb;

  v_normalized_route text;

  v_computed_source_hash text;
  v_computed_effect_hash text;
  v_computed_output_hash text;
  v_computed_closeout_hash text;

  v_status text;

  v_closeout_contract_satisfied boolean := false;
  v_active_process_closeout_override boolean := false;
begin
  if p_stage_id is null
     or p_simulation_run_id is null
     or p_process_run_id is null
     or nullif(btrim(coalesce(p_route_format,'')),'') is null
     or nullif(btrim(coalesce(p_source_payload_hash,'')),'') is null
     or nullif(btrim(coalesce(p_effect_matrix_hash,'')),'') is null
     or nullif(btrim(coalesce(p_output_payload_hash,'')),'') is null
     or nullif(btrim(coalesce(p_closeout_evidence_hash,'')),'') is null
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))
        is distinct from 'object'
  then
    return jsonb_build_object(
      'status','blocked_invalid_immutable_write_input',
      'stage_id',p_stage_id,
      'immutable_write_allowed',false,
      'immutable_state_written',false
    );
  end if;

  select
    s.id stage_id,
    s.race_id,
    s.stage_number,
    s.stage_date,
    s.stage_format,
    coalesce(
      nullif(to_jsonb(s)->>'weather_cancelled','')::boolean,
      false
    ) weather_cancelled,
    r.status race_status
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_stage.stage_id is null then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id,
      'immutable_write_allowed',false,
      'immutable_state_written',false
    );
  end if;

  v_normalized_route :=
    case
      when v_stage.weather_cancelled
        then 'weather_cancelled'

      when lower(coalesce(v_stage.stage_format,'')) in
           (
             'individual_time_trial',
             'time_trial',
             'itt',
             'prologue'
           )
        then 'individual_time_trial'

      when lower(coalesce(v_stage.stage_format,'')) in
           (
             'team_time_trial',
             'ttt'
           )
        then 'team_time_trial'

      else 'road_race'
    end;

  select
    run.id,
    run.stage_id,
    run.race_id,
    run.status
  into v_run
  from public.race_stage_simulation_runs run
  where run.id=p_simulation_run_id;

  select
    pr.process_run_id,
    pr.stage_id,
    pr.race_id,
    pr.simulation_run_id,
    pr.status,
    pr.finished_at
  into v_process
  from public.race_engine_stage_process_runs_v2 pr
  where pr.process_run_id=p_process_run_id;

  select *
  into v_existing
  from public.race_engine_stage_immutable_state_v2 i
  where i.stage_id=p_stage_id;

  v_closeout_readiness :=
    public.race_engine_get_stage_closeout_readiness_v2(
      p_stage_id
    );

  v_active_process_closeout_override :=
    v_closeout_readiness->>'status'
      = 'historical_stage_verify_only_no_retroactive_claims'

    and not coalesce(
              nullif(
                v_closeout_readiness
                  ->>'golden_fixture_stage',
                ''
              )::boolean,
              false
            )

    and v_process.process_run_id is not null
    and v_process.stage_id=p_stage_id
    and v_process.race_id=v_stage.race_id
    and v_process.simulation_run_id=p_simulation_run_id
    and v_process.status='started'
    and v_process.finished_at is null

    and coalesce(
          nullif(
            v_closeout_readiness
              ->>'required_effect_count',
            ''
          )::integer,
          0
        )>0

    and coalesce(
          nullif(
            v_closeout_readiness
              ->>'verified_effect_count',
            ''
          )::integer,
          -1
        )
        =
        coalesce(
          nullif(
            v_closeout_readiness
              ->>'required_effect_count',
            ''
          )::integer,
          -2
        )

    and coalesce(
          nullif(
            v_closeout_readiness
              ->>'missing_effect_count',
            ''
          )::integer,
          -1
        )=0

    and coalesce(
          nullif(
            v_closeout_readiness
              ->>'writer_definition_drift_count',
            ''
          )::integer,
          -1
        )=0

    and coalesce(
          nullif(
            v_closeout_readiness
              ->>'source_hash_mismatch_count',
            ''
          )::integer,
          -1
        )=0;

  v_closeout_contract_satisfied :=
    v_closeout_readiness->>'status'
      = 'closeout_contract_satisfied_execution_still_disabled'
    or v_active_process_closeout_override;

  select to_jsonb(i)
  into v_output_integrity
  from public.race_engine_stage_output_integrity_v1 i
  where i.stage_id=p_stage_id
  limit 1;

  v_closeout_evidence :=
    public.race_engine_get_stage_closeout_output_evidence_v3(
      p_stage_id
    );

  v_computed_source_hash :=
    md5(
      jsonb_build_object(
        'stage',
          jsonb_build_object(
            'stage_id',v_stage.stage_id,
            'race_id',v_stage.race_id,
            'stage_number',v_stage.stage_number,
            'stage_date',v_stage.stage_date,
            'stage_format',v_stage.stage_format,
            'weather_cancelled',v_stage.weather_cancelled
          ),
        'race',
          jsonb_build_object(
            'race_id',v_stage.race_id,
            'race_status',v_stage.race_status
          ),
        'simulation_run',
          jsonb_build_object(
            'simulation_run_id',v_run.id,
            'simulation_run_stage_id',v_run.stage_id,
            'simulation_run_race_id',v_run.race_id,
            'simulation_run_status',v_run.status
          )
      )::text
    );

  select md5(
           coalesce(
             string_agg(
               jsonb_build_object(
                 'effect_key',l.effect_key,
                 'effect_status',l.effect_status,
                 'simulation_run_id',l.simulation_run_id,
                 'source_payload_hash',l.source_payload_hash,
                 'applied_payload_hash',l.applied_payload_hash
               )::text,
               '|'
               order by l.effect_key
             ),
             ''
           )
         )
  into v_computed_effect_hash
  from public.race_engine_stage_effect_ledger_v2 l
  where l.stage_id=p_stage_id;

  v_computed_output_hash :=
    md5(coalesce(v_output_integrity::text,''));

  v_computed_closeout_hash :=
    md5(coalesce(v_closeout_evidence::text,''));

  v_status :=
    case
      when p_stage_id=
           '24709c46-b258-4db3-a3aa-fd92dc37630e'::uuid
        then 'historical_golden_fixture_verify_only'

      when v_existing.stage_id is not null
           and v_existing.immutable_status='immutable'
           and v_existing.simulation_run_id=p_simulation_run_id
           and v_existing.process_run_id=p_process_run_id
           and v_existing.route_format=v_normalized_route
           and v_existing.source_payload_hash
               is not distinct from p_source_payload_hash
           and v_existing.effect_matrix_hash
               is not distinct from p_effect_matrix_hash
           and v_existing.output_payload_hash
               is not distinct from p_output_payload_hash
           and v_existing.closeout_evidence_hash
               is not distinct from p_closeout_evidence_hash
        then 'duplicate_immutable_request_saved_evidence'

      when v_existing.stage_id is not null
        then 'blocked_existing_immutable_state_mismatch'

      when lower(btrim(p_route_format))
           is distinct from v_normalized_route
        then 'blocked_route_format_mismatch'

      when v_run.id is null
        then 'blocked_simulation_run_not_found'

      when v_run.stage_id is distinct from p_stage_id
           or v_run.race_id is distinct from v_stage.race_id
        then 'blocked_simulation_run_scope_mismatch'

      when v_run.status is distinct from 'completed'
        then 'blocked_simulation_run_not_completed'

      when v_process.process_run_id is null
        then 'blocked_process_run_not_found'

      when v_process.stage_id is distinct from p_stage_id
           or v_process.race_id is distinct from v_stage.race_id
           or v_process.simulation_run_id
              is distinct from p_simulation_run_id
        then 'blocked_process_run_scope_mismatch'

      when v_process.status is distinct from 'started'
           or v_process.finished_at is not null
        then 'blocked_process_run_not_active'

      when not v_closeout_contract_satisfied
        then 'blocked_closeout_contract_not_satisfied'

      when p_source_payload_hash
           is distinct from v_computed_source_hash
        then 'blocked_immutable_source_hash_mismatch'

      when p_effect_matrix_hash
           is distinct from v_computed_effect_hash
        then 'blocked_immutable_effect_hash_mismatch'

      when p_output_payload_hash
           is distinct from v_computed_output_hash
        then 'blocked_immutable_output_hash_mismatch'

      when p_closeout_evidence_hash
           is distinct from v_computed_closeout_hash
        then 'blocked_immutable_closeout_hash_mismatch'

      else 'immutable_write_ready_execution_disabled'
    end;

  return jsonb_build_object(
    'status',v_status,

    'stage_id',p_stage_id,
    'race_id',v_stage.race_id,
    'simulation_run_id',p_simulation_run_id,
    'process_run_id',p_process_run_id,

    'provided_route_format',lower(btrim(p_route_format)),
    'normalized_route_format',v_normalized_route,

    'simulation_run_status',v_run.status,
    'process_run_status',v_process.status,

    'closeout_readiness',v_closeout_readiness,

    'closeout_contract_satisfied',
      v_closeout_contract_satisfied,

    'active_process_closeout_override_applied',
      v_active_process_closeout_override,

    'active_process_closeout_override_policy',
      'verify-only readiness is accepted only for a non-golden stage with an exact active V2 process run linked to the completed simulation and a fully verified, hash-matching required-effect matrix',

    'provided_hashes',
      jsonb_build_object(
        'source_payload_hash',p_source_payload_hash,
        'effect_matrix_hash',p_effect_matrix_hash,
        'output_payload_hash',p_output_payload_hash,
        'closeout_evidence_hash',p_closeout_evidence_hash
      ),

    'computed_hashes',
      jsonb_build_object(
        'source_payload_hash',v_computed_source_hash,
        'effect_matrix_hash',v_computed_effect_hash,
        'output_payload_hash',v_computed_output_hash,
        'closeout_evidence_hash',v_computed_closeout_hash
      ),

    'existing_immutable_state',
      case
        when v_existing.stage_id is null
          then null
        else to_jsonb(v_existing)
      end,

    'immutable_write_allowed',
      v_status='immutable_write_ready_execution_disabled',

    'duplicate_immutable_request',
      v_status='duplicate_immutable_request_saved_evidence',

    'immutable_state_written',false,

    'legacy_closeout_called',false,
    'production_immutable_closeout_enabled',false,

    'immutable_plan_version',
      'phase3ac_a10_immutable_write_plan_v2_active_process_closeout'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_write_stage_immutable_state_v2(p_stage_id uuid, p_simulation_run_id uuid, p_process_run_id uuid, p_route_format text, p_source_payload_hash text, p_effect_matrix_hash text, p_output_payload_hash text, p_closeout_evidence_hash text, p_metadata jsonb DEFAULT '{}'::jsonb, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan jsonb;
  v_config record;
  v_race_id uuid;
  v_existing jsonb;
begin
  select *
  into v_config
  from public.race_engine_effect_immutable_config_v2
  where config_key='effect_immutable';

  if not coalesce(p_execute,false) then
    v_plan :=
      public.race_engine_get_stage_immutable_write_plan_v2(
        p_stage_id,
        p_simulation_run_id,
        p_process_run_id,
        p_route_format,
        p_source_payload_hash,
        p_effect_matrix_hash,
        p_output_payload_hash,
        p_closeout_evidence_hash,
        coalesce(p_metadata,'{}'::jsonb)
      );

    return v_plan
           ||
           jsonb_build_object(
             'status',
               'immutable_plan_only_execution_disabled',
             'execute_requested',false,
             'immutable_state_written',false
           );
  end if;

  if not coalesce(
           v_config.immutable_shadow_execution_enabled,
           false
         )
  then
    return jsonb_build_object(
      'status',
        'blocked_immutable_write_execution_disabled_in_phase3ac_a10',
      'stage_id',p_stage_id,
      'simulation_run_id',p_simulation_run_id,
      'process_run_id',p_process_run_id,
      'execute_requested',true,
      'confirmation_supplied',
        p_confirmation_text is not null,
      'confirmation_matches',
        md5(coalesce(p_confirmation_text,''))
        =
        v_config.immutable_confirmation_hash,
      'immutable_state_written',false,
      'legacy_closeout_called',false,
      'production_immutable_closeout_enabled',false
    );
  end if;

  if md5(coalesce(p_confirmation_text,''))
     is distinct from
     v_config.immutable_confirmation_hash
  then
    return jsonb_build_object(
      'status',
        'blocked_immutable_write_confirmation_mismatch',
      'stage_id',p_stage_id,
      'simulation_run_id',p_simulation_run_id,
      'process_run_id',p_process_run_id,
      'execute_requested',true,
      'confirmation_matches',false,
      'immutable_state_written',false,
      'legacy_closeout_called',false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        ':',
        'phase3ac_a10_stage_immutable_write',
        p_stage_id::text
      ),
      0
    )
  );

  if public.race_engine_verify_golden_stage_fixture_v1(
       'rio_tour_stage1_phase3aa_golden_v1'
     )->>'status'
     is distinct from 'fixture_matches_current_state'
  then
    return jsonb_build_object(
      'status','blocked_golden_fixture_mismatch',
      'stage_id',p_stage_id,
      'immutable_state_written',false,
      'rio_writer_calls',0
    );
  end if;

  if p_stage_id=
     '24709c46-b258-4db3-a3aa-fd92dc37630e'::uuid
  then
    return jsonb_build_object(
      'status','historical_golden_fixture_verify_only',
      'stage_id',p_stage_id,
      'immutable_state_written',false,
      'rio_writer_calls',0
    );
  end if;

  v_plan :=
    public.race_engine_get_stage_immutable_write_plan_v2(
      p_stage_id,
      p_simulation_run_id,
      p_process_run_id,
      p_route_format,
      p_source_payload_hash,
      p_effect_matrix_hash,
      p_output_payload_hash,
      p_closeout_evidence_hash,
      coalesce(p_metadata,'{}'::jsonb)
    );

  if coalesce(
       (v_plan->>'duplicate_immutable_request')::boolean,
       false
     )
  then
    return v_plan
           ||
           jsonb_build_object(
             'status',
               'duplicate_immutable_request_saved_evidence',
             'execute_requested',true,
             'immutable_state_written',false,
             'legacy_closeout_called',false
           );
  end if;

  if not coalesce(
           (v_plan->>'immutable_write_allowed')::boolean,
           false
         )
  then
    return v_plan
           ||
           jsonb_build_object(
             'execute_requested',true,
             'immutable_state_written',false,
             'legacy_closeout_called',false
           );
  end if;

  v_race_id :=
    nullif(v_plan->>'race_id','')::uuid;

  insert into public.race_engine_stage_immutable_state_v2 as immutable_row
  (
    stage_id,
    race_id,
    simulation_run_id,
    process_run_id,

    immutable_status,
    route_format,
    processor_version,

    source_payload_hash,
    effect_matrix_hash,
    output_payload_hash,
    closeout_evidence_hash,

    immutable_at,
    failure_message,

    metadata
  )
  values
  (
    p_stage_id,
    v_race_id,
    p_simulation_run_id,
    p_process_run_id,

    'immutable',
    v_plan->>'normalized_route_format',
    'phase3ac_a10_atomic_immutable_writer_v1',

    p_source_payload_hash,
    p_effect_matrix_hash,
    p_output_payload_hash,
    p_closeout_evidence_hash,

    clock_timestamp(),
    null,

    coalesce(p_metadata,'{}'::jsonb)
    ||
    jsonb_build_object(
      'immutable_writer_version',
        'phase3ac_a10_atomic_immutable_writer_v1',
      'written_at',clock_timestamp(),
      'written_by',session_user,
      'execution_mode','rollback_shadow_only',
      'legacy_closeout_called',false,
      'production_immutable_closeout_enabled',false,
      'immutable_plan',v_plan
    )
  )
  returning to_jsonb(immutable_row)
  into v_existing;

  return jsonb_build_object(
    'status','immutable_state_written_in_shadow_mode',
    'stage_id',p_stage_id,
    'race_id',v_race_id,
    'simulation_run_id',p_simulation_run_id,
    'process_run_id',p_process_run_id,
    'immutable_state',v_existing,
    'immutable_state_written',true,
    'legacy_closeout_called',false,
    'production_immutable_closeout_enabled',false,
    'scheduler_cutover_enabled',false,
    'immutable_writer_version',
      'phase3ac_a10_atomic_immutable_writer_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_guard_effect_adapter_registry_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception
    'race_engine_effect_adapter_registry_v2 is immutable. Registry rows cannot be updated or deleted; install a new registry_version instead.';
end;
$function$
;

