-- Release reliability hardening for universal race automation.
-- Keeps stale worker recovery ahead of race time, adds immediate Pass 2 wakeup,
-- adds a two-minute independent supervisor, and avoids transient false-red
-- failures while an automatic recovery still has time to complete.

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_recover_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_run record;
  v_stage_start_game_at timestamp without time zone;
  v_deadline_reached boolean;
  v_stale_after interval;
  v_age interval;
  v_phase text;
  v_recovered integer := 0;
  v_checked integer := 0;
begin
  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  for v_run in
    select sr.id as simulation_run_id,
           sr.stage_id,
           sr.race_id,
           sr.started_at,
           sr.updated_at,
           sr.created_at,
           coalesce(nullif(sr.result_summary_json->>'survival_phase',''),'claimed') as survival_phase,
           s.stage_date,
           s.planned_start_hour_number,
           s.planned_start_minute
    from public.race_stage_simulation_runs sr
    join public.race_stages s on s.id=sr.stage_id
    where sr.engine_version='race_engine_ts_v1'
      and sr.simulation_mode='deterministic_road_race_v1'
      and sr.status='running'
      and (
        coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
        or (
          coalesce(sr.result_summary_json->>'calculation_contract','')=''
          and coalesce(sr.result_summary_json->>'phase11b_contract','')='universal_production_engine_v2'
          and coalesce(sr.result_summary_json->>'support_contract','')='supabase_race_calculation_survival_v1'
        )
      )
      and not exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
      )
    order by coalesce(sr.updated_at,sr.started_at,sr.created_at)
    limit 200
  loop
    v_checked := v_checked + 1;
    v_stage_start_game_at := v_run.stage_date::timestamp
      + make_interval(hours=>coalesce(v_run.planned_start_hour_number,12),
                      mins=>coalesce(v_run.planned_start_minute,0));
    v_deadline_reached := v_current_game_at >= v_stage_start_game_at - interval '15 minutes';
    v_phase := coalesce(nullif(v_run.survival_phase,''),'claimed');

    v_stale_after := case
      when v_phase in ('primary_engine_started','fallback_engine_started') then interval '8 minutes'
      when v_phase in ('pass1_resume_claimed','pass1_payload_loading','pass1_started',
                       'pass2_resume_claimed','pass2_payload_loading') then interval '4 minutes'
      when v_phase in ('primary_engine_finished','fallback_engine_finished','output_ready','submitting','scenario_reserved') then interval '3 minutes'
      when v_phase in ('claimed','payload_loading','payload_loaded','pass1_pending','pass1_ready_no_scenario') then interval '5 minutes'
      else interval '5 minutes'
    end;

    v_age := clock_timestamp() - coalesce(v_run.updated_at,v_run.started_at,v_run.created_at);

    if v_age >= v_stale_after then
      perform public.universal_race_stage_fail_calculation_v1(
        v_run.stage_id,
        v_run.simulation_run_id,
        'Race calculation survival watchdog recovered an expired calculation lease.',
        jsonb_build_object(
          'recovery_model','race_calculation_survival_phase_aware_lease_v2',
          'reason','expired_phase_aware_calculation_lease_without_authoritative_result',
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at,
          'mandatory_ready_deadline_game_at',v_stage_start_game_at - interval '15 minutes'
        )
      );

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      ) values (
        v_run.stage_id,
        v_run.race_id,
        v_run.simulation_run_id,
        'recover_expired_phase_lease',
        'expired_phase_aware_calculation_lease_without_authoritative_result',
        jsonb_build_object(
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );
      begin
        perform net.http_post(
          url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-universal-race-worker-secret',(
              select decrypted_secret
              from vault.decrypted_secrets
              where name='universal_race_worker_secret_v1'
              limit 1
            )
          ),
          body := '{"action":"tick"}'::jsonb,
          timeout_milliseconds := 30000
        );
      exception when others then
        null;
      end;
      v_recovered := v_recovered + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'checked_running_claims',v_checked,
    'recovered_stale_claims',v_recovered,
    'claimed_or_payload_lease_seconds',240,
    'engine_lease_seconds',480,
    'post_engine_lease_seconds',180,
    'mandatory_ready_lead_minutes',15,
    'deadline_shortening_disabled',true,
    'model_version','race_calculation_survival_phase_aware_lease_v3'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_operations_refresh_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game_now timestamptz;
  v_history_days integer;
  v_calc_grace integer;
  v_replay_grace integer;
  v_completion_grace integer;
  v_problem_count integer;
  v_row_count integer;
begin
  select
    public.get_current_game_timestamp(),
    history_game_days,
    calculation_grace_game_minutes,
    replay_grace_game_minutes,
    completion_grace_game_minutes
  into
    v_game_now,
    v_history_days,
    v_calc_grace,
    v_replay_grace,
    v_completion_grace
  from public.race_operations_config_v1
  where id = true;

  if v_game_now is null then
    raise exception 'Current game timestamp is unavailable';
  end if;

  with candidates as (
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      r.category as race_category,
      (coalesce(cr.prize_fund_min_cash, 0) > 0) as prizes_expected,
      coalesce(cr.ranking_points_enabled, true) as ranking_points_enabled,
      s.stage_number,
      s.name as stage_name,
      public.race_stage_planned_start_game_at_v1(s.id) as stage_start_game_at,
      coalesce(s.weather_cancelled, false) as stage_weather_cancelled,
      lower(coalesce(r.status, '')) in ('cancelled','canceled') as race_cancelled
    from public.race_stages s
    join public.races r on r.id = s.race_id
    left join public.race_category_rules cr
      on cr.race_class_code = r.category
    where s.stage_date between
      (v_game_now::date - v_history_days)
      and
      (v_game_now::date + 1)
  ),
  metrics as (
    select
      c.*,
      a.last_status as automation_status,
      a.simulation_run_id,
      coalesce(a.attempt_count, 0) as attempt_count,
      a.last_error,
      a.details,
      sr.status as simulation_run_status,
      sr.engine_version,
      coalesce(
        nullif(a.details->>'calculation_due_game_at', '')::timestamptz,
        case
          when w.calculation_due_game_at is not null
            then w.calculation_due_game_at at time zone 'UTC'
          else c.stage_start_game_at - interval '3 hours'
        end
      ) as calculation_due_game_at,
      coalesce(
        nullif(a.details->>'official_results_reveal_game_at', '')::timestamptz,
        c.stage_start_game_at + interval '30 minutes'
      ) as results_due_game_at,
      nullif(a.details->>'calculated_at_real', '')::timestamptz
        as calculation_completed_at_real,
      coalesce((a.details->>'manifest_ready')::boolean, false)
        as replay_manifest_ready,
      nullif(a.details->>'replay_opened_game_at', '')::timestamptz
        as replay_opened_game_at,
      nullif(a.details->>'replay_opened_at_real', '')::timestamptz
        as replay_opened_at_real,
      nullif(a.details->>'replay_closes_at_real', '')::timestamptz
        as replay_closed_at_real,
      coalesce((a.details->>'results_published')::boolean, false)
        as results_published,
      coalesce((a.details->>'official_outputs_persisted')::boolean, false)
        as official_outputs_persisted,
      nullif(a.details->>'results_published_at_real', '')::timestamptz
        as results_published_at_real,
      nullif(a.details->>'survival_phase', '') as survival_phase,
      coalesce(res.result_rows, 0) as stage_result_rows,
      coalesce(cls.classification_rows, 0) as classification_rows,
      coalesce(rankings.ranking_award_rows, 0) as ranking_award_rows,
      coalesce(prizes.prize_award_rows, 0) as prize_award_rows,
      coalesce(prizes.paid_prize_award_rows, 0) as paid_prize_award_rows
    from candidates c
    left join public.race_stage_automation_state a
      on a.stage_id = c.stage_id
    left join public.race_engine_due_stage_watchdog_v1 w
      on w.stage_id = c.stage_id
    left join public.race_stage_simulation_runs sr
      on sr.id = a.simulation_run_id
    left join lateral (
      select count(*)::integer as result_rows
      from public.race_stage_results x
      where x.stage_id = c.stage_id
    ) res on true
    left join lateral (
      select count(*)::integer as classification_rows
      from public.race_classification_standings x
      where x.after_stage_id = c.stage_id
    ) cls on true
    left join lateral (
      select count(*)::integer as ranking_award_rows
      from public.race_ranking_point_awards x
      where x.stage_id = c.stage_id
    ) rankings on true
    left join lateral (
      select
        count(*)::integer as prize_award_rows,
        count(*) filter (where x.status = 'paid')::integer
          as paid_prize_award_rows
      from public.race_prize_awards x
      where x.stage_id = c.stage_id
    ) prizes on true
    where c.stage_start_game_at is not null
  ),
  derived as (
    select
      m.*,
      (m.stage_weather_cancelled or m.race_cancelled) as is_cancelled,
      (
        m.calculation_completed_at_real is not null
        or m.replay_manifest_ready
        or m.automation_status in (
          'calculated_hidden','replay_live','published','completed'
        )
        or m.stage_result_rows > 0
        or m.simulation_run_status = 'completed'
      ) as calculation_done,
      (
        m.replay_manifest_ready
        or m.automation_status in ('replay_live','published','completed')
        or m.results_published
      ) as replay_ready,
      (
        m.automation_status = 'published'
        and m.results_published
        and m.official_outputs_persisted
        and m.stage_result_rows > 0
        and m.classification_rows > 0
        and (
          not m.prizes_expected
          or (
            m.prize_award_rows > 0
            and m.paid_prize_award_rows = m.prize_award_rows
          )
        )
        and (
          not m.ranking_points_enabled
          or m.ranking_award_rows > 0
        )
      ) as completion_done
    from metrics m
  ),
  evaluated as (
    select
      d.*,
      case
        when d.is_cancelled then 'cancelled'
        when d.calculation_done then 'done'
        /* An active worker is progress, not an overdue failure. Evaluate this
         * before deadline/failed presentation so recovery and long-running
         * calculations are shown truthfully in Race Operations. */
        when d.automation_status = 'calculating'
          or d.simulation_run_status = 'running' then 'running'
        when d.automation_status = 'failed'
          or d.simulation_run_status = 'failed' then
          case
            when v_game_now < d.stage_start_game_at - interval '15 minutes'
              then 'running'
            else 'failed'
          end
        when v_game_now >= d.calculation_due_game_at
             + make_interval(mins => v_calc_grace) then 'overdue'
        else 'waiting'
      end as calculation_status,
      case
        when d.is_cancelled then 'cancelled'
        when d.replay_ready then 'ready'
        when not d.calculation_done then 'blocked'
        when v_game_now >= d.stage_start_game_at
             + make_interval(mins => v_replay_grace) then 'overdue'
        else 'waiting'
      end as replay_status,
      case
        when d.is_cancelled then 'cancelled'
        when d.completion_done then 'done'
        when not d.calculation_done or not d.replay_ready then 'blocked'
        when v_game_now >= d.results_due_game_at
             + make_interval(mins => v_completion_grace) then 'overdue'
        else 'waiting'
      end as completion_status
    from derived d
  ),
  final_rows as (
    select
      e.*,
      case
        when e.is_cancelled or e.completion_done then false
        when e.calculation_status in ('failed','overdue') then true
        when e.replay_status = 'overdue' then true
        when e.completion_status = 'overdue' then true
        else false
      end as has_problem,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed' then 'engine_failed'
        when e.calculation_status = 'overdue' then 'calculation_overdue'
        when e.replay_status = 'overdue' then 'replay_not_ready'
        when e.completion_status = 'overdue' then 'completion_incomplete'
        else null
      end as issue_key,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed' then 'critical'
        when e.calculation_status = 'overdue' then 'critical'
        when e.replay_status = 'overdue' then 'high'
        when e.completion_status = 'overdue' then 'high'
        else null
      end as issue_severity,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed'
          then coalesce(
            nullif(e.last_error, ''),
            'The production race-engine run exhausted its automatic recovery window.'
          )
        when e.calculation_status = 'overdue'
          then 'The stage calculation deadline passed without a completed calculation.'
        when e.replay_status = 'overdue'
          then 'The stage reached race time but the replay package is not ready.'
        when e.completion_status = 'overdue'
          then 'The replay/result window passed but official results or post-race processing are incomplete.'
        else null
      end as issue_message
    from evaluated e
  )
  insert into public.race_operations_stage_status_v1 (
    stage_id, race_id, race_name, race_category, stage_number, stage_name,
    stage_start_game_at, calculation_due_game_at, results_due_game_at,
    game_now_at_check, calculation_status, calculation_completed_at_real,
    calculation_run_id, calculation_attempt_count, replay_status,
    replay_manifest_ready, replay_opened_game_at, replay_opened_at_real,
    replay_closed_at_real, completion_status, results_published,
    official_outputs_persisted, stage_result_rows, classification_rows,
    ranking_award_rows, prize_award_rows, paid_prize_award_rows,
    results_published_at_real, automation_status, engine_version,
    survival_phase, last_error, is_cancelled, has_problem, issue_key,
    issue_severity, issue_message, first_problem_at, resolved_at,
    last_checked_at, updated_at
  )
  select
    f.stage_id, f.race_id, f.race_name, f.race_category, f.stage_number,
    f.stage_name, f.stage_start_game_at, f.calculation_due_game_at,
    f.results_due_game_at, v_game_now, f.calculation_status,
    f.calculation_completed_at_real, f.simulation_run_id, f.attempt_count,
    f.replay_status, f.replay_manifest_ready, f.replay_opened_game_at,
    f.replay_opened_at_real, f.replay_closed_at_real, f.completion_status,
    f.results_published, f.official_outputs_persisted, f.stage_result_rows,
    f.classification_rows, f.ranking_award_rows, f.prize_award_rows,
    f.paid_prize_award_rows, f.results_published_at_real,
    f.automation_status, f.engine_version, f.survival_phase, f.last_error,
    f.is_cancelled, f.has_problem, f.issue_key, f.issue_severity,
    f.issue_message, case when f.has_problem then now() else null end,
    null, now(), now()
  from final_rows f
  on conflict (stage_id) do update
  set
    race_id = excluded.race_id,
    race_name = excluded.race_name,
    race_category = excluded.race_category,
    stage_number = excluded.stage_number,
    stage_name = excluded.stage_name,
    stage_start_game_at = excluded.stage_start_game_at,
    calculation_due_game_at = excluded.calculation_due_game_at,
    results_due_game_at = excluded.results_due_game_at,
    game_now_at_check = excluded.game_now_at_check,
    calculation_status = excluded.calculation_status,
    calculation_completed_at_real = excluded.calculation_completed_at_real,
    calculation_run_id = excluded.calculation_run_id,
    calculation_attempt_count = excluded.calculation_attempt_count,
    replay_status = excluded.replay_status,
    replay_manifest_ready = excluded.replay_manifest_ready,
    replay_opened_game_at = excluded.replay_opened_game_at,
    replay_opened_at_real = excluded.replay_opened_at_real,
    replay_closed_at_real = excluded.replay_closed_at_real,
    completion_status = excluded.completion_status,
    results_published = excluded.results_published,
    official_outputs_persisted = excluded.official_outputs_persisted,
    stage_result_rows = excluded.stage_result_rows,
    classification_rows = excluded.classification_rows,
    ranking_award_rows = excluded.ranking_award_rows,
    prize_award_rows = excluded.prize_award_rows,
    paid_prize_award_rows = excluded.paid_prize_award_rows,
    results_published_at_real = excluded.results_published_at_real,
    automation_status = excluded.automation_status,
    engine_version = excluded.engine_version,
    survival_phase = excluded.survival_phase,
    last_error = excluded.last_error,
    is_cancelled = excluded.is_cancelled,
    has_problem = excluded.has_problem,
    issue_key = excluded.issue_key,
    issue_severity = excluded.issue_severity,
    issue_message = excluded.issue_message,
    first_problem_at = case
      when excluded.has_problem then
        case
          when public.race_operations_stage_status_v1.has_problem
               and public.race_operations_stage_status_v1.issue_key
                   is not distinct from excluded.issue_key
          then coalesce(
            public.race_operations_stage_status_v1.first_problem_at,
            excluded.first_problem_at
          )
          else excluded.first_problem_at
        end
      else null
    end,
    resolved_at = case
      when excluded.has_problem then null
      when public.race_operations_stage_status_v1.has_problem then now()
      else public.race_operations_stage_status_v1.resolved_at
    end,
    last_checked_at = now(),
    updated_at = now();

  update public.race_operations_incidents_v1 i
  set
    resolved_at = now(),
    resolution_message = 'The monitor no longer detects this problem.',
    last_seen_at = now(),
    updated_at = now()
  where i.resolved_at is null
    and exists (
      select 1
      from public.race_operations_stage_status_v1 s
      where s.stage_id = i.stage_id
        and (
          not s.has_problem
          or s.issue_key is distinct from i.issue_key
        )
    );

  insert into public.race_operations_incidents_v1 (
    stage_id, race_id, race_name, stage_number, issue_key, severity,
    message, stage_start_game_at, detected_game_at, detected_at,
    last_seen_at, metadata
  )
  select
    s.stage_id, s.race_id, s.race_name, s.stage_number, s.issue_key,
    s.issue_severity, s.issue_message, s.stage_start_game_at,
    s.game_now_at_check, now(), now(),
    jsonb_build_object(
      'calculation_status', s.calculation_status,
      'replay_status', s.replay_status,
      'completion_status', s.completion_status,
      'automation_status', s.automation_status,
      'engine_version', s.engine_version,
      'survival_phase', s.survival_phase,
      'last_error', s.last_error,
      'calculation_due_game_at', s.calculation_due_game_at,
      'results_due_game_at', s.results_due_game_at
    )
  from public.race_operations_stage_status_v1 s
  where s.has_problem
    and s.issue_key is not null
    and not exists (
      select 1
      from public.race_operations_incidents_v1 i
      where i.stage_id = s.stage_id
        and i.issue_key = s.issue_key
        and i.resolved_at is null
    );

  update public.race_operations_incidents_v1 i
  set
    last_seen_at = now(),
    message = s.issue_message,
    severity = s.issue_severity,
    updated_at = now()
  from public.race_operations_stage_status_v1 s
  where i.stage_id = s.stage_id
    and i.issue_key = s.issue_key
    and i.resolved_at is null
    and s.has_problem;

  delete from public.race_operations_stage_status_v1 s
  where s.stage_start_game_at < v_game_now - make_interval(days => v_history_days)
    and not s.has_problem;

  delete from public.race_operations_incidents_v1 i
  where i.resolved_at is not null
    and i.stage_start_game_at < v_game_now - make_interval(days => v_history_days);

  select count(*)::integer into v_problem_count
  from public.race_operations_stage_status_v1
  where has_problem;

  select count(*)::integer into v_row_count
  from public.race_operations_stage_status_v1;

  return jsonb_build_object(
    'ok', true,
    'game_now', v_game_now,
    'rows', v_row_count,
    'problems', v_problem_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_release_supervisor_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lock bigint := hashtext('universal_race_release_supervisor_v1')::bigint;
  v_watchdog jsonb := '{}'::jsonb;
  v_survival jsonb := '{}'::jsonb;
  v_publication jsonb := '{}'::jsonb;
  v_ops jsonb := '{}'::jsonb;
  v_runner_request bigint;
  v_pass1_request bigint;
  v_pass2_request bigint;
  v_secret text;
begin
  if not pg_try_advisory_xact_lock(v_lock) then
    return jsonb_build_object('status','already_running');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='universal_race_worker_secret_v1'
  limit 1;

  begin
    v_watchdog := public.race_engine_due_stage_watchdog_run_v1();
  exception when others then
    v_watchdog := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  begin
    v_survival := public.universal_race_stage_survival_recover_v1();
  exception when others then
    v_survival := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  if v_secret is not null then
    begin
      v_runner_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-runner',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;

    begin
      v_pass1_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass1-resume',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;

    begin
      v_pass2_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;
  end if;

  begin
    v_publication := public.universal_race_stage_retry_due_publications_v1(20);
  exception when others then
    v_publication := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  begin
    v_ops := public.race_operations_refresh_v1();
  exception when others then
    v_ops := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  return jsonb_build_object(
    'status','completed',
    'watchdog',v_watchdog,
    'survival',v_survival,
    'publication',v_publication,
    'operations',v_ops,
    'runner_request_id',v_runner_request,
    'pass1_request_id',v_pass1_request,
    'pass2_request_id',v_pass2_request,
    'model_version','universal_race_release_supervisor_v1'
  );
end;
$function$
;

do $block$
begin
  if exists(select 1 from cron.job where jobname='universal-race-release-supervisor-v1') then
    perform cron.unschedule('universal-race-release-supervisor-v1');
  end if;
end;
$block$;

select cron.schedule(
  'universal-race-release-supervisor-v1',
  '*/2 * * * *',
  'select public.universal_race_release_supervisor_v1();'
);
