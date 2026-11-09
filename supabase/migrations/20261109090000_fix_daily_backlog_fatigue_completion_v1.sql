-- ProPeloton Manager: ensure daily fatigue is executed, not merely reported as done.
-- Specific observed failure: S1 2000-11-23 marked processed while no daily tick ran.
-- Historical 98 false-success days are NOT replayed or relabeled by this migration.
-- This migration changes only the daily processors, not the sporting race engine.

-- Fail closed when the daily tick silently returned or swallowed fatigue errors.
-- At game date D, the previous in-game day (D-1) must be processed for
-- every rider. This marker is written by public.process_daily_fatigue().
-- Deliberately does not replay any historical finished day.
create or replace function private.assert_daily_fatigue_processed_v1(p_game_date date)
returns void language plpgsql security definer
set search_path = 'pg_catalog', 'public', 'private', 'pg_temp'
as $assert$
begin
  if p_game_date is null or public.get_current_game_date_date() is distinct from p_game_date then
    raise exception 'daily fatigue verification: processed game date mismatch (expected %, actual %)',
      p_game_date, public.get_current_game_date_date();
  end if;
  if exists (
    select 1 from public.riders r
    where r.fatigue_updated_on is null
       or r.fatigue_updated_on < (p_game_date - 1)
  ) then
    raise exception 'daily fatigue verification failed: one or more riders lack completed recovery for %', (p_game_date - 1);
  end if;
end;
$assert$;
revoke all on function private.assert_daily_fatigue_processed_v1(date) from public, anon, authenticated;

-- Full fallback: use the same transactional game-state execution mode as
-- forward daily automation; leave game_clock_config paused throughout.
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
    -- The clock_config remains paused. Unpause only the transactional game_state
    -- snapshot so process_daily_tick() does not return without doing work.
    is_paused = false
  where id = true;

  v_old_statement_timeout := current_setting('statement_timeout', true);

  perform set_config(
    'statement_timeout',
    greatest(10, least(coalesce(p_statement_timeout_seconds, 60), 90))::text || 's',
    true
  );

  begin
    perform public.process_daily_tick();
    perform private.assert_daily_fatigue_processed_v1(v_target_date);
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
    insert into public.game_daily_tick_log(season_number,month_number,day_number,tick_version,ran_at)
    values (v_backlog.season_number,v_backlog.month_number,v_backlog.day_number,
            coalesce(v_backlog.tick_version,v_original_state.tick_version),now())
    on conflict do nothing;
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
$function$;


-- Smart retry: verify the original core tick and record completion only after
-- game processors succeeded; do not rerun the core on partial prior success.
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
      perform private.assert_daily_fatigue_processed_v1(v_target_date);
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
    insert into public.game_daily_tick_log(season_number,month_number,day_number,tick_version,ran_at)
    values (v_backlog.season_number,v_backlog.month_number,v_backlog.day_number,
            coalesce(v_backlog.tick_version,v_original_state.tick_version),now())
    on conflict do nothing;
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
$function$;


-- Forward path: verify actual rider recovery, not just function return.
CREATE OR REPLACE FUNCTION public.process_forward_daily_automation_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_lock_key bigint :=
    hashtext('public.process_forward_daily_automation_v1')::bigint;
  v_clock_lock_key bigint :=
    hashtext('public.run_daily_tick_if_needed')::bigint;

  v_activation public.automation_forward_activation_v1%rowtype;
  v_backlog public.game_daily_tick_backlog_v1%rowtype;
  v_original_state public.game_state%rowtype;
  v_original_config public.game_clock_config%rowtype;
  v_have_snapshot boolean := false;

  v_core_already_ok boolean := false;
  v_core_ok boolean := false;
  v_due_events_ok boolean := false;
  v_game_processors_result jsonb := null;
  v_game_processors_ok boolean := false;
  v_tax_result jsonb := null;
  v_error text := null;
  v_sqlstate text := null;
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'status', 'skipped_forward_daily_processor_busy',
      'success', false
    );
  end if;

  if not pg_try_advisory_xact_lock(v_clock_lock_key) then
    return jsonb_build_object(
      'status', 'skipped_clock_tick_busy',
      'success', false
    );
  end if;

  select *
  into v_activation
  from public.automation_forward_activation_v1
  where id = true;

  if not found then
    return jsonb_build_object(
      'status', 'blocked_missing_forward_activation',
      'success', false
    );
  end if;

  select *
  into v_backlog
  from public.game_daily_tick_backlog_v1
  where status = 'pending'
    and current_game_date >= v_activation.daily_processing_starts_on
  order by current_game_date
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object(
      'status', 'no_forward_daily_backlog_due',
      'success', true,
      'daily_processing_starts_on', v_activation.daily_processing_starts_on
    );
  end if;

  v_core_already_ok := coalesce(
    (v_backlog.payload ->> 'forward_core_daily_ok')::boolean,
    false
  );

  select *
  into v_original_state
  from public.game_state
  where id = true
  for update;

  select *
  into v_original_config
  from public.game_clock_config
  where id = true
  for update;

  if v_original_state.id is null or v_original_config.id is null then
    raise exception 'Could not snapshot live game clock.';
  end if;

  v_have_snapshot := true;

  update public.game_daily_tick_backlog_v1
  set
    status = 'running',
    attempts = attempts + 1,
    last_error = null,
    updated_at = now()
  where id = v_backlog.id;

  update public.game_clock_config
  set is_paused = true
  where id = true;

  update public.game_state
  set
    season_number = public.season_from_game_date(v_backlog.current_game_date),
    month_number = extract(month from v_backlog.current_game_date)::smallint,
    day_number = extract(day from v_backlog.current_game_date)::smallint,
    hour_number = 0,
    minute_number = 0,
    tick_version = coalesce(v_backlog.tick_version, v_original_state.tick_version),
    is_paused = false,
    last_advanced_at = clock_timestamp()
  where id = true;

  begin
    if not v_core_already_ok then
      perform public.process_daily_tick();
      perform private.assert_daily_fatigue_processed_v1(v_backlog.current_game_date);
      v_core_ok := true;

      perform public.process_due_game_events();
      v_due_events_ok := true;

      if to_regprocedure(
           'public.finance_run_due_monthly_tax_audits_guarded_v1(boolean)'
         ) is not null then
        execute
          'select public.finance_run_due_monthly_tax_audits_guarded_v1(true)'
        into v_tax_result;
      end if;

      if to_regprocedure(
           'public.finance_process_weekly_emergency_loan_repayments()'
         ) is not null then
        perform public.finance_process_weekly_emergency_loan_repayments();
      end if;

      update public.game_daily_tick_backlog_v1
      set
        status = 'pending',
        updated_at = now(),
        last_error = null,
        payload = payload || jsonb_build_object(
          'forward_core_daily_ok', true,
          'forward_core_daily_completed_at', now(),
          'forward_due_game_events_ok', true,
          'forward_tax_result', v_tax_result
        )
      where id = v_backlog.id;
    else
      v_core_ok := true;
      v_due_events_ok := true;
    end if;

    select public.run_daily_game_processors_v1(true)
    into v_game_processors_result;

    v_game_processors_ok := coalesce(
      (v_game_processors_result ->> 'success')::boolean,
      false
    );

  exception when others then
    v_sqlstate := sqlstate;
    v_error := sqlerrm;
  end;

  /* Always restore the exact live clock before final backlog bookkeeping. */
  update public.game_state
  set
    season_number = v_original_state.season_number,
    month_number = v_original_state.month_number,
    day_number = v_original_state.day_number,
    hour_number = v_original_state.hour_number,
    minute_number = v_original_state.minute_number,
    tick_version = v_original_state.tick_version,
    is_paused = v_original_state.is_paused,
    last_advanced_at = v_original_state.last_advanced_at
  where id = true;

  update public.game_clock_config
  set
    base_real_at = v_original_config.base_real_at,
    base_game_at = v_original_config.base_game_at,
    base_season = v_original_config.base_season,
    speed_multiplier = v_original_config.speed_multiplier,
    is_paused = v_original_config.is_paused
  where id = true;

  v_have_snapshot := false;

  if v_core_ok and v_due_events_ok and v_game_processors_ok
     and v_error is null then
    insert into public.game_daily_tick_log (
      season_number,
      month_number,
      day_number,
      tick_version,
      ran_at
    )
    values (
      v_backlog.season_number,
      v_backlog.month_number,
      v_backlog.day_number,
      coalesce(v_backlog.tick_version, v_original_state.tick_version),
      now()
    )
    on conflict do nothing;

    update public.game_daily_tick_backlog_v1
    set
      status = 'processed',
      processed_at = now(),
      updated_at = now(),
      last_error = null,
      payload = payload || jsonb_build_object(
        'forward_daily_automation_success', true,
        'forward_daily_automation_completed_at', now(),
        'forward_game_processors_result', v_game_processors_result
      )
    where id = v_backlog.id;
  else
    update public.game_daily_tick_backlog_v1
    set
      status = 'pending',
      processed_at = null,
      updated_at = now(),
      last_error = concat_ws(
        ': ',
        v_sqlstate,
        coalesce(
          v_error,
          v_game_processors_result ->> 'error',
          'forward_daily_game_processors_returned_success_false'
        )
      ),
      payload = payload || jsonb_build_object(
        'forward_daily_automation_success', false,
        'forward_daily_automation_last_failed_at', now(),
        'forward_game_processors_result', v_game_processors_result,
        'forward_sqlstate', v_sqlstate,
        'forward_error', v_error
      )
    where id = v_backlog.id;
  end if;

  return jsonb_build_object(
    'status', case
      when v_core_ok and v_due_events_ok and v_game_processors_ok
           and v_error is null
        then 'forward_daily_processed'
      else 'forward_daily_pending_retry'
    end,
    'success',
      v_core_ok and v_due_events_ok and v_game_processors_ok
      and v_error is null,
    'processed_game_date', v_backlog.current_game_date,
    'daily_processing_starts_on', v_activation.daily_processing_starts_on,
    'core_daily_ok', v_core_ok,
    'due_game_events_ok', v_due_events_ok,
    'game_processors_ok', v_game_processors_ok,
    'game_processors_result', v_game_processors_result,
    'sqlstate', v_sqlstate,
    'error', v_error
  );

exception when others then
  if v_have_snapshot then
    begin
      update public.game_state
      set
        season_number = v_original_state.season_number,
        month_number = v_original_state.month_number,
        day_number = v_original_state.day_number,
        hour_number = v_original_state.hour_number,
        minute_number = v_original_state.minute_number,
        tick_version = v_original_state.tick_version,
        is_paused = v_original_state.is_paused,
        last_advanced_at = v_original_state.last_advanced_at
      where id = true;

      update public.game_clock_config
      set
        base_real_at = v_original_config.base_real_at,
        base_game_at = v_original_config.base_game_at,
        base_season = v_original_config.base_season,
        speed_multiplier = v_original_config.speed_multiplier,
        is_paused = v_original_config.is_paused
      where id = true;
    exception when others then
      null;
    end;
  end if;

  if v_backlog.id is not null then
    update public.game_daily_tick_backlog_v1
    set
      status = 'pending',
      processed_at = null,
      updated_at = now(),
      last_error = concat_ws(': ', sqlstate, sqlerrm)
    where id = v_backlog.id;
  end if;

  return jsonb_build_object(
    'status', 'forward_daily_processor_error',
    'success', false,
    'sqlstate', sqlstate,
    'error', sqlerrm
  );
end;
$function$;

