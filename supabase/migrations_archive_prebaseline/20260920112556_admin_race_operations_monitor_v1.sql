-- Administrator Race Operations monitor.
-- Tracks the three production checkpoints for every stage:
-- calculation -> replay readiness -> fully published/finalized.
-- Active problems feed the admin sidebar badge and the email alert worker.

create table if not exists public.race_operations_config_v1 (
  id boolean primary key default true check (id = true),
  alert_email text not null,
  email_enabled boolean not null default true,
  email_delay_minutes integer not null default 5 check (email_delay_minutes between 0 and 120),
  calculation_grace_game_minutes integer not null default 30 check (calculation_grace_game_minutes between 0 and 240),
  replay_grace_game_minutes integer not null default 10 check (replay_grace_game_minutes between 0 and 240),
  completion_grace_game_minutes integer not null default 15 check (completion_grace_game_minutes between 0 and 240),
  history_game_days integer not null default 7 check (history_game_days between 1 and 30),
  updated_at timestamptz not null default now()
);

insert into public.race_operations_config_v1 (
  id, alert_email, email_enabled, email_delay_minutes,
  calculation_grace_game_minutes, replay_grace_game_minutes,
  completion_grace_game_minutes, history_game_days
)
values (
  true, 'bracko87@live.com', true, 5,
  30, 10, 15, 7
)
on conflict (id) do update
set
  alert_email = excluded.alert_email,
  email_enabled = excluded.email_enabled,
  updated_at = now();

create table if not exists public.race_operations_stage_status_v1 (
  stage_id uuid primary key references public.race_stages(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  race_name text not null,
  race_category text null,
  stage_number integer not null,
  stage_name text null,
  stage_start_game_at timestamptz not null,
  calculation_due_game_at timestamptz not null,
  results_due_game_at timestamptz not null,
  game_now_at_check timestamptz not null,
  calculation_status text not null,
  calculation_completed_at_real timestamptz null,
  calculation_run_id uuid null,
  calculation_attempt_count integer not null default 0,
  replay_status text not null,
  replay_manifest_ready boolean not null default false,
  replay_opened_game_at timestamptz null,
  replay_opened_at_real timestamptz null,
  replay_closed_at_real timestamptz null,
  completion_status text not null,
  results_published boolean not null default false,
  official_outputs_persisted boolean not null default false,
  stage_result_rows integer not null default 0,
  classification_rows integer not null default 0,
  ranking_award_rows integer not null default 0,
  prize_award_rows integer not null default 0,
  paid_prize_award_rows integer not null default 0,
  results_published_at_real timestamptz null,
  automation_status text null,
  engine_version text null,
  survival_phase text null,
  last_error text null,
  is_cancelled boolean not null default false,
  has_problem boolean not null default false,
  issue_key text null,
  issue_severity text null,
  issue_message text null,
  first_problem_at timestamptz null,
  resolved_at timestamptz null,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint race_operations_calc_status_chk
    check (calculation_status in ('waiting','running','done','overdue','failed','cancelled')),
  constraint race_operations_replay_status_chk
    check (replay_status in ('waiting','blocked','ready','overdue','cancelled')),
  constraint race_operations_completion_status_chk
    check (completion_status in ('waiting','blocked','done','overdue','cancelled')),
  constraint race_operations_issue_severity_chk
    check (issue_severity is null or issue_severity in ('warning','high','critical'))
);

create table if not exists public.race_operations_incidents_v1 (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.race_stages(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  race_name text not null,
  stage_number integer not null,
  issue_key text not null,
  severity text not null,
  message text not null,
  stage_start_game_at timestamptz not null,
  detected_game_at timestamptz not null,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolution_message text null,
  email_sent_at timestamptz null,
  email_attempt_count integer not null default 0,
  email_last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint race_operations_incident_severity_chk
    check (severity in ('warning','high','critical'))
);

create unique index if not exists race_operations_one_open_issue_per_stage_key_v1
  on public.race_operations_incidents_v1(stage_id, issue_key)
  where resolved_at is null;

create index if not exists race_operations_status_problem_idx_v1
  on public.race_operations_stage_status_v1(has_problem, stage_start_game_at desc);

create index if not exists race_operations_status_start_idx_v1
  on public.race_operations_stage_status_v1(stage_start_game_at desc);

create index if not exists race_operations_incident_open_idx_v1
  on public.race_operations_incidents_v1(resolved_at, detected_at desc);

create index if not exists race_operations_incident_email_idx_v1
  on public.race_operations_incidents_v1(email_sent_at, detected_at)
  where resolved_at is null;

alter table public.race_operations_config_v1 enable row level security;
alter table public.race_operations_stage_status_v1 enable row level security;
alter table public.race_operations_incidents_v1 enable row level security;

revoke all on table public.race_operations_config_v1 from anon, authenticated;
revoke all on table public.race_operations_stage_status_v1 from anon, authenticated;
revoke all on table public.race_operations_incidents_v1 from anon, authenticated;

create or replace function public.race_operations_refresh_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
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
        when d.automation_status = 'failed'
          or d.simulation_run_status = 'failed' then 'failed'
        when v_game_now >= d.calculation_due_game_at
             + make_interval(mins => v_calc_grace) then 'overdue'
        when d.automation_status = 'calculating'
          or d.simulation_run_status = 'running' then 'running'
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
        when e.automation_status = 'failed'
          or e.simulation_run_status = 'failed' then true
        when e.calculation_status in ('failed','overdue') then true
        when e.replay_status = 'overdue' then true
        when e.completion_status = 'overdue' then true
        else false
      end as has_problem,
      case
        when e.is_cancelled or e.completion_done then null
        when e.automation_status = 'failed'
          or e.simulation_run_status = 'failed' then 'engine_failed'
        when e.calculation_status = 'overdue' then 'calculation_overdue'
        when e.replay_status = 'overdue' then 'replay_not_ready'
        when e.completion_status = 'overdue' then 'completion_incomplete'
        else null
      end as issue_key,
      case
        when e.is_cancelled or e.completion_done then null
        when e.automation_status = 'failed'
          or e.simulation_run_status = 'failed' then 'critical'
        when e.calculation_status = 'overdue' then 'critical'
        when e.replay_status = 'overdue' then 'high'
        when e.completion_status = 'overdue' then 'high'
        else null
      end as issue_severity,
      case
        when e.is_cancelled or e.completion_done then null
        when e.automation_status = 'failed'
          or e.simulation_run_status = 'failed'
          then coalesce(
            nullif(e.last_error, ''),
            'The production race-engine run is in a failed state.'
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
$$;

create or replace function public.get_admin_race_operations_problem_count_v1()
returns integer
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer into v_count
  from public.race_operations_stage_status_v1
  where has_problem;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.get_admin_race_operations_v1(
  p_view text default 'today',
  p_days integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_game_now timestamptz;
  v_view text := lower(trim(coalesce(p_view, 'today')));
  v_days integer := greatest(1, least(coalesce(p_days, 7), 30));
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_view not in ('today','problems','history') then
    raise exception 'Invalid race operations view'
      using errcode = '22023';
  end if;

  v_game_now := public.get_current_game_timestamp();

  select jsonb_build_object(
    'game_now', v_game_now,
    'alert_email', (
      select alert_email from public.race_operations_config_v1 where id = true
    ),
    'email_enabled', (
      select email_enabled from public.race_operations_config_v1 where id = true
    ),
    'counts', jsonb_build_object(
      'today_total', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
      )::integer,
      'today_problems', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
          and s.has_problem
      )::integer,
      'active_problems', count(*) filter (
        where s.has_problem
      )::integer,
      'completed_today', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
          and s.completion_status = 'done'
      )::integer
    ),
    'rows', coalesce(
      (
        select jsonb_agg(
          to_jsonb(row_data)
          order by row_data.stage_start_game_at desc
        )
        from (
          select
            s.*,
            i.id as incident_id,
            i.detected_at as incident_detected_at,
            i.email_sent_at as incident_email_sent_at,
            i.email_attempt_count as incident_email_attempt_count,
            i.email_last_error as incident_email_last_error
          from public.race_operations_stage_status_v1 s
          left join lateral (
            select ii.*
            from public.race_operations_incidents_v1 ii
            where ii.stage_id = s.stage_id
              and ii.resolved_at is null
            order by ii.detected_at desc
            limit 1
          ) i on true
          where
            (
              v_view = 'today'
              and s.stage_start_game_at::date = v_game_now::date
            )
            or (
              v_view = 'problems'
              and s.has_problem
            )
            or (
              v_view = 'history'
              and s.stage_start_game_at >= v_game_now - make_interval(days => v_days)
              and s.stage_start_game_at <= v_game_now + interval '1 day'
            )
          order by s.stage_start_game_at desc
        ) row_data
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.race_operations_stage_status_v1 s;

  return v_result;
end;
$$;

create or replace function public.admin_refresh_race_operations_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return public.race_operations_refresh_v1();
end;
$$;

create or replace function public.race_operations_validate_alert_secret_v1(
  p_secret text
)
returns boolean
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'race_operations_alert_worker_secret_v1'
      and s.decrypted_secret = p_secret
  );
$$;

revoke all on function public.race_operations_refresh_v1()
  from public, anon, authenticated;
grant execute on function public.race_operations_refresh_v1()
  to service_role;

revoke all on function public.get_admin_race_operations_problem_count_v1()
  from public, anon;
revoke all on function public.get_admin_race_operations_v1(text, integer)
  from public, anon;
revoke all on function public.admin_refresh_race_operations_v1()
  from public, anon;

grant execute on function public.get_admin_race_operations_problem_count_v1()
  to authenticated, service_role;
grant execute on function public.get_admin_race_operations_v1(text, integer)
  to authenticated, service_role;
grant execute on function public.admin_refresh_race_operations_v1()
  to authenticated, service_role;

revoke all on function public.race_operations_validate_alert_secret_v1(text)
  from public, anon, authenticated;
grant execute on function public.race_operations_validate_alert_secret_v1(text)
  to service_role;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'race_operations_alert_worker_secret_v1'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'race_operations_alert_worker_secret_v1',
      'Secret used by the Race Operations email alert cron.'
    );
  end if;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'race-operations-monitor-v1'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'race-operations-monitor-v1',
    '*/5 * * * *',
    'select public.race_operations_refresh_v1();'
  );

  select jobid into v_job_id
  from cron.job
  where jobname = 'race-operations-email-alerts-v1'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'race-operations-email-alerts-v1',
    '2-59/5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/send-race-operations-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-race-ops-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'race_operations_alert_worker_secret_v1'
            limit 1
          )
        ),
        body := '{"action":"send_pending"}'::jsonb,
        timeout_milliseconds := 30000
      );
    $cron$
  );
end
$$;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'race_operations_stage_status_v1'
  ) then
    execute 'alter publication supabase_realtime add table public.race_operations_stage_status_v1';
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'race_operations_incidents_v1'
  ) then
    execute 'alter publication supabase_realtime add table public.race_operations_incidents_v1';
  end if;
end
$$;

select public.race_operations_refresh_v1();
