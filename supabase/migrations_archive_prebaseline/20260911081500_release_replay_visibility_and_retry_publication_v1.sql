-- Keep the 15-minute replay gate authoritative for result visibility, but never
-- leave a completed replay trapped behind a failed Phase 11 publication step.
-- Sporting output remains the immutable stored backend calculation. Publication
-- persistence is retried independently and never recalculates the race.

create or replace function public.get_race_stage_live_state_v1(p_stage_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with lifecycle as (
    select
      state.stage_id,
      state.simulation_run_id,
      state.last_status,
      state.last_error,
      nullif(state.details ->> 'replay_opened_at_real', '')::timestamptz as replay_opened_at_real,
      nullif(state.details ->> 'replay_closes_at_real', '')::timestamptz as replay_closes_at_real
    from public.race_stage_automation_state state
    where state.stage_id = p_stage_id
    limit 1
  ),
  latest_run as (
    select
      run.id as simulation_run_id,
      run.status as run_status,
      run.created_at,
      coalesce((run.result_summary_json ->> 'results_published')::boolean, false) as results_published
    from public.race_stage_simulation_runs run
    where run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status in ('running','completed')
    order by run.created_at desc
    limit 1
  ),
  resolved as (
    select
      coalesce(lifecycle.simulation_run_id, latest_run.simulation_run_id) as simulation_run_id,
      lifecycle.last_status,
      lifecycle.last_error,
      latest_run.run_status,
      latest_run.results_published,
      coalesce(lifecycle.replay_opened_at_real, latest_run.created_at) as live_started_at,
      coalesce(
        lifecycle.replay_closes_at_real,
        latest_run.created_at + interval '15 minutes'
      ) as live_ends_at
    from (select 1) seed
    left join lifecycle on true
    left join latest_run on true
  )
  select jsonb_build_object(
    'stage_id', p_stage_id,
    'has_simulation', resolved.simulation_run_id is not null,
    'simulation_run_id', resolved.simulation_run_id,
    'live_started_at', resolved.live_started_at,
    'live_ends_at', resolved.live_ends_at,
    'is_live', case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then false
      when resolved.last_status = 'replay_live' and resolved.live_ends_at is not null
        then now() < resolved.live_ends_at
      else false
    end,
    'results_visible', case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then true
      when resolved.results_published then true
      when resolved.last_status = 'published' then true
      when resolved.live_ends_at is not null then now() >= resolved.live_ends_at
      else false
    end,
    'speed_locked', case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then false
      when resolved.results_published then false
      when resolved.last_status = 'published' then false
      when resolved.last_status = 'replay_live' and resolved.live_ends_at is not null
        then now() < resolved.live_ends_at
      else false
    end,
    'publication_pending', case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' or resolved.results_published or resolved.last_status = 'published' then false
      when resolved.live_ends_at is not null and now() >= resolved.live_ends_at then true
      else false
    end,
    'publication_error', resolved.last_error,
    'progress', case
      when resolved.simulation_run_id is null then 0
      when resolved.run_status = 'completed' then 1
      when resolved.results_published or resolved.last_status = 'published' then 1
      when resolved.live_ends_at is not null and now() >= resolved.live_ends_at then 1
      when resolved.last_status = 'replay_live'
       and resolved.live_started_at is not null
       and resolved.live_ends_at is not null then
        greatest(
          0,
          least(
            1,
            extract(epoch from (now() - resolved.live_started_at)) /
            greatest(1, extract(epoch from (resolved.live_ends_at - resolved.live_started_at)))
          )
        )
      else 0
    end
  )
  from resolved;
$function$;

create or replace function public.get_universal_race_stage_replay_payload_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable
security definer
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
  v_replay_closes_at_real timestamptz;
  v_results_published boolean := false;
  v_replay_window_elapsed boolean := false;
  v_results_visible boolean := false;
  v_speed_locked boolean := false;
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

  v_replay_closes_at_real := nullif(v_state.details ->> 'replay_closes_at_real', '')::timestamptz;
  v_results_published :=
    coalesce((v_run.result_summary_json ->> 'results_published')::boolean, false)
    or v_run.status = 'completed'
    or coalesce(v_state.last_status, '') = 'published';
  v_replay_window_elapsed :=
    v_replay_closes_at_real is not null
    and now() >= v_replay_closes_at_real;
  v_results_visible := v_results_published or v_replay_window_elapsed;
  v_speed_locked :=
    not v_results_visible
    and coalesce(v_state.last_status, '') = 'replay_live'
    and v_replay_closes_at_real is not null
    and now() < v_replay_closes_at_real;

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
      'results_visible', v_results_visible,
      'results_published_at', v_state.details ->> 'results_published_at_real',
      'speed_locked', v_speed_locked,
      'publication_pending', v_replay_window_elapsed and not v_results_published,
      'publication_error', v_state.last_error,
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

create or replace function public.universal_race_stage_retry_due_publications_v1(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_state record;
  v_result jsonb;
  v_checked integer := 0;
  v_published integer := 0;
  v_failed integer := 0;
  v_publications jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_sqlstate text;
  v_error text;
begin
  for v_state in
    select state.stage_id, state.simulation_run_id
    from public.race_stage_automation_state state
    where state.last_status = 'replay_live'
      and nullif(state.details ->> 'replay_closes_at_real', '') is not null
      and (state.details ->> 'replay_closes_at_real')::timestamptz <= clock_timestamp()
    order by (state.details ->> 'replay_closes_at_real')::timestamptz, state.stage_id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  loop
    v_checked := v_checked + 1;

    begin
      v_result := public.universal_race_stage_finalize_v1(v_state.stage_id);
      v_published := v_published + 1;
      v_publications := v_publications || jsonb_build_array(v_result);
    exception when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;

      update public.race_stage_automation_state
      set last_checked_at = clock_timestamp(),
          last_error = left(
            format('Publication retry failed [%s]: %s', v_sqlstate, v_error),
            2000
          ),
          details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
            'publication_pending', true,
            'publication_retry_failed_at_real', clock_timestamp(),
            'publication_retry_sqlstate', v_sqlstate,
            'publication_retry_error', left(v_error, 1500)
          ),
          updated_at = clock_timestamp()
      where stage_id = v_state.stage_id;

      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'stage_id', v_state.stage_id,
        'simulation_run_id', v_state.simulation_run_id,
        'sqlstate', v_sqlstate,
        'error', left(v_error, 1500)
      ));
    end;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'checked', v_checked,
    'published', v_published,
    'failed', v_failed,
    'publications', v_publications,
    'failures', v_failures,
    'model_version', 'universal_race_publication_retry_v1'
  );
end;
$function$;

revoke all on function public.universal_race_stage_retry_due_publications_v1(integer) from public, anon, authenticated;
grant execute on function public.universal_race_stage_retry_due_publications_v1(integer) to service_role;
grant execute on function public.get_race_stage_live_state_v1(uuid) to authenticated, service_role;
grant execute on function public.get_universal_race_stage_replay_payload_v1(uuid) to authenticated, service_role;

do $do$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select jobid
  into v_job_id
  from cron.job
  where jobname = 'universal-race-publication-retry-v1'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'universal-race-publication-retry-v1',
    '* * * * *',
    'select public.universal_race_stage_retry_due_publications_v1(20);'
  );
end
$do$;

comment on function public.universal_race_stage_retry_due_publications_v1(integer)
is 'Retries due Phase 11 race publication independently. A failed publication is recorded and retried without recalculating or altering the stored sporting output.';
