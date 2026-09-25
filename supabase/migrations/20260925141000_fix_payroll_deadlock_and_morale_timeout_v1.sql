-- Prevent weekly payroll deadlocks and remove excessive rider-update work from daily morale processing.
-- Live production migration applied to ProPeloton Manager on 2026-09-25.

create or replace function public.finance_process_weekly_rider_wages_guarded_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lock_key bigint := hashtext('finance_process_weekly_rider_wages_guarded_v1');
  v_result jsonb;
begin
  if not pg_try_advisory_lock(v_lock_key) then
    return jsonb_build_object('status', 'skipped_already_running', 'job', 'weekly_rider_wages');
  end if;

  begin
    perform pg_advisory_xact_lock(
      hashtextextended('finance_weekly_payroll_global_v1', 0)
    );

    if not public._job_rate_limit_can_run_v1('weekly_rider_wages', interval '12 hours') then
      perform pg_advisory_unlock(v_lock_key);
      return jsonb_build_object('status', 'skipped_rate_limited', 'job', 'weekly_rider_wages');
    end if;

    select to_jsonb(public.finance_process_weekly_rider_wages())
      into v_result;

    perform public._job_rate_limit_finish_v1('weekly_rider_wages', v_result);
    perform pg_advisory_unlock(v_lock_key);

    return jsonb_build_object('status', 'completed', 'job', 'weekly_rider_wages', 'result', v_result);
  exception when others then
    perform public._job_rate_limit_finish_v1(
      'weekly_rider_wages',
      jsonb_build_object('status', 'error', 'message', sqlerrm)
    );
    perform pg_advisory_unlock(v_lock_key);
    raise;
  end;
end;
$function$;

create or replace function public.finance_process_weekly_staff_wages()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_game_date date;
  v_iso_dow integer;
  v_payroll_date date;
  v_week_key text;
  r record;
  v_existing_transaction_id uuid;
  v_charge_result jsonb;
  v_clubs_processed integer := 0;
  v_clubs_charged integer := 0;
  v_clubs_skipped_already_charged integer := 0;
  v_clubs_skipped_no_staff integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('finance_weekly_payroll_global_v1', 0)
  );

  v_current_game_date := public.get_current_game_date_date();

  if v_current_game_date is null then
    return jsonb_build_object('ok', false, 'reason', 'game_date_missing');
  end if;

  v_iso_dow := extract(isodow from v_current_game_date)::int;
  v_payroll_date := v_current_game_date - ((v_iso_dow - 1) * interval '1 day')::interval;
  v_week_key := to_char(v_payroll_date, 'IYYY-IW');

  if v_current_game_date < v_payroll_date then
    return jsonb_build_object(
      'ok', true,
      'did_run', false,
      'reason', 'before_payroll_date',
      'current_game_date', v_current_game_date,
      'payroll_date', v_payroll_date,
      'week_key', v_week_key
    );
  end if;

  for r in
    select c.id as club_id
    from public.clubs c
    where c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
    order by c.id
  loop
    v_clubs_processed := v_clubs_processed + 1;

    select t.id
    into v_existing_transaction_id
    from finance.transactions t
    where t.type = 'staff_salary_payday'
      and coalesce(t.metadata ->> 'charged_club_id', t.metadata ->> 'club_id') = r.club_id::text
      and t.idempotency_key in (
        'staff_salary_payday:' || r.club_id::text || ':' || v_week_key,
        'staff_salary_payday:' || r.club_id::text || ':' || v_week_key || ':backfill'
      )
    order by t.created_at desc
    limit 1;

    if v_existing_transaction_id is not null then
      v_clubs_skipped_already_charged := v_clubs_skipped_already_charged + 1;
      continue;
    end if;

    select public.finance_charge_club_staff_wages(
      r.club_id,
      'staff_salary_payday:' || r.club_id::text || ':' || v_week_key
    )
    into v_charge_result;

    if coalesce((v_charge_result ->> 'charged')::boolean, false) = true then
      v_clubs_charged := v_clubs_charged + 1;
    elsif coalesce((v_charge_result ->> 'already_charged')::boolean, false) = true then
      v_clubs_skipped_already_charged := v_clubs_skipped_already_charged + 1;
    else
      v_clubs_skipped_no_staff := v_clubs_skipped_no_staff + 1;
    end if;
  end loop;

  insert into public.staff_payroll_runs (week_key, processed_at)
  values (v_week_key, now())
  on conflict (week_key)
  do update set processed_at = excluded.processed_at;

  return jsonb_build_object(
    'ok', true,
    'did_run', true,
    'week_key', v_week_key,
    'payroll_date', v_payroll_date,
    'current_game_date', v_current_game_date,
    'clubs_processed', v_clubs_processed,
    'clubs_charged', v_clubs_charged,
    'clubs_skipped_already_charged', v_clubs_skipped_already_charged,
    'clubs_skipped_no_staff', v_clubs_skipped_no_staff
  );
end;
$function$;

create or replace function public.finance_charge_club_staff_wages(
  p_club_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff_count integer := 0;
  v_total_wages bigint := 0;
  v_current_game_date date;
  v_payroll_date date;
  v_transaction_id uuid;
  v_existing_transaction_id uuid;
  v_current_balance numeric := 0;
  v_finance_club_id uuid;
  v_requested_club_type text;
  v_effective_idempotency_key text;
  v_funds_result jsonb;
begin
  v_current_game_date := public.get_current_game_date_date();

  if v_current_game_date is null then
    raise exception 'finance_charge_club_staff_wages: could not resolve current game date';
  end if;

  v_payroll_date := date_trunc('week', v_current_game_date)::date;

  select
    case when c.club_type = 'developing' then c.parent_club_id else c.id end,
    c.club_type
  into v_finance_club_id, v_requested_club_type
  from public.clubs c
  where c.id = p_club_id
  limit 1;

  if v_finance_club_id is null then
    raise exception 'finance_charge_club_staff_wages: could not resolve finance club for club %', p_club_id;
  end if;

  v_effective_idempotency_key := coalesce(
    nullif(p_idempotency_key, ''),
    'staff_salary_payday:' || v_finance_club_id::text || ':' || v_payroll_date::text
  );

  select w.staff_count, w.total_wages
  into v_staff_count, v_total_wages
  from public.get_club_staff_weekly_wages(p_club_id) w;

  if coalesce(v_staff_count, 0) <= 0 or coalesce(v_total_wages, 0) <= 0 then
    return jsonb_build_object(
      'ok', true,
      'charged', false,
      'staff_count', coalesce(v_staff_count, 0),
      'total_wages', coalesce(v_total_wages, 0),
      'reason', 'no_active_staff'
    );
  end if;

  select t.id
  into v_existing_transaction_id
  from finance.transactions t
  where t.idempotency_key = v_effective_idempotency_key
  limit 1;

  if v_existing_transaction_id is not null then
    return jsonb_build_object(
      'ok', true,
      'charged', false,
      'already_charged', true,
      'reason', 'duplicate_staff_payroll',
      'club_id', p_club_id,
      'finance_club_id', v_finance_club_id,
      'staff_count', v_staff_count,
      'total_wages', v_total_wages,
      'payroll_date', v_payroll_date,
      'transaction_id', v_existing_transaction_id
    );
  end if;

  -- Snapshot only: never row-lock club_finance_summary before the canonical
  -- finance_ensure_mandatory_funds advisory lock.
  select coalesce(cfs.current_balance, 0)
  into v_current_balance
  from public.club_finance_summary cfs
  where cfs.club_id = v_finance_club_id;

  perform set_config('finance.internal', '1', true);

  v_funds_result := public.finance_ensure_mandatory_funds(
    v_finance_club_id,
    v_total_wages,
    'staff_salary_payday',
    v_payroll_date::text,
    'mandatory_funds:staff_salary_payday:' ||
      v_finance_club_id::text || ':' || v_payroll_date::text
  );

  if coalesce((v_funds_result ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', true,
      'charged', false,
      'reason', 'mandatory_funds_failed',
      'club_id', p_club_id,
      'finance_club_id', v_finance_club_id,
      'current_balance_before_funding', coalesce(v_current_balance, 0),
      'staff_count', v_staff_count,
      'total_wages', v_total_wages,
      'payroll_date', v_payroll_date,
      'funds_result', v_funds_result
    );
  end if;

  select public.finance_spend_from_club(
    v_finance_club_id,
    v_total_wages,
    'staff_salary_payday',
    'SINK',
    v_effective_idempotency_key,
    jsonb_build_object(
      'game_date', v_payroll_date,
      'current_game_date_when_processed', v_current_game_date,
      'staff_count', v_staff_count,
      'total_wages', v_total_wages,
      'source', 'weekly_staff_payroll',
      'requested_club_id', p_club_id,
      'finance_club_id', v_finance_club_id,
      'requested_club_type', v_requested_club_type,
      'mandatory_funds_result', v_funds_result
    )
  )
  into v_transaction_id;

  return jsonb_build_object(
    'ok', true,
    'charged', true,
    'staff_count', v_staff_count,
    'total_wages', v_total_wages,
    'club_id', p_club_id,
    'finance_club_id', v_finance_club_id,
    'payroll_date', v_payroll_date,
    'transaction_id', v_transaction_id,
    'mandatory_funds_result', v_funds_result
  );
end;
$function$;

create or replace function public.resolve_rider_current_club_for_morale_notification_v1(
  p_rider_id uuid,
  p_rider_row jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_club_id uuid;
begin
  if coalesce(p_rider_row->>'club_id', '') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return (p_rider_row->>'club_id')::uuid;
  end if;

  select cr.club_id
  into v_club_id
  from public.club_riders cr
  join public.clubs c on c.id = cr.club_id
  where cr.rider_id = p_rider_id
    and c.owner_user_id is not null
    and coalesce(c.is_ai, false) = false
  order by cr.created_at desc nulls last
  limit 1;

  return v_club_id;
end;
$function$;

create or replace function public.notify_rider_negative_morale_state_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rider_row jsonb;
  v_club_id uuid;
  v_owner_user_id uuid;
  v_rider_name text;
  v_first_name text;
  v_last_name text;
  v_action_url text;
  v_event_date text;
  v_morale_threshold integer := 39;
  v_more_selection_event boolean;
  v_unhappy_event boolean;
  v_release_event boolean;
begin
  v_more_selection_event :=
    coalesce(old.asked_for_more_selection, false) = false
    and coalesce(new.asked_for_more_selection, false) = true;

  v_unhappy_event :=
    (
      coalesce(old.morale, 50) > v_morale_threshold
      and coalesce(new.morale, 50) <= v_morale_threshold
    )
    or (
      old.low_morale_since is null
      and new.low_morale_since is not null
    );

  v_release_event :=
    coalesce(old.release_requested, false) = false
    and coalesce(new.release_requested, false) = true;

  if not (v_more_selection_event or v_unhappy_event or v_release_event) then
    return new;
  end if;

  v_rider_row := to_jsonb(new);
  v_club_id := public.resolve_rider_current_club_for_morale_notification_v1(new.id, v_rider_row);

  if v_club_id is null then return new; end if;

  select coalesce(c.owner_user_id, parent.owner_user_id)
  into v_owner_user_id
  from public.clubs c
  left join public.clubs parent on parent.id = c.parent_club_id
  where c.id = v_club_id
    and coalesce(c.is_ai, false) = false;

  if v_owner_user_id is null then return new; end if;

  v_first_name := coalesce(
    nullif(v_rider_row->>'first_name', ''),
    nullif(v_rider_row->>'firstname', ''),
    nullif(v_rider_row->>'given_name', '')
  );
  v_last_name := coalesce(
    nullif(v_rider_row->>'last_name', ''),
    nullif(v_rider_row->>'lastname', ''),
    nullif(v_rider_row->>'family_name', '')
  );
  v_rider_name := nullif(trim(coalesce(v_first_name, '') || ' ' || coalesce(v_last_name, '')), '');
  v_rider_name := coalesce(
    v_rider_name,
    nullif(v_rider_row->>'full_name', ''),
    nullif(v_rider_row->>'display_name', ''),
    nullif(v_rider_row->>'name', ''),
    'A rider'
  );

  v_action_url := '/dashboard/my-riders/' || new.id::text;
  v_event_date := coalesce(new.morale_updated_on::text, current_date::text);

  if v_more_selection_event and not exists (
    select 1
    from public.notifications n
    join public.notification_types nt on nt.id = n.type_id
    where nt.code = 'RIDER_WANTS_MORE_RACE_SELECTION'
      and n.payload_json->>'event_key' =
        'rider_morale:more_selection:' || new.id::text || ':' || v_event_date
  ) then
    perform public.create_infrastructure_notification(
      v_owner_user_id,
      'RIDER_WANTS_MORE_RACE_SELECTION',
      'Rider wants more race selection',
      v_rider_name || ' wants to be selected for more races. If this does not improve, he may ask to leave the team and terminate his contract.',
      v_action_url,
      jsonb_build_object(
        'event_key', 'rider_morale:more_selection:' || new.id::text || ':' || v_event_date,
        'rider_id', new.id,
        'rider_name', v_rider_name,
        'club_id', v_club_id,
        'morale', new.morale,
        'morale_updated_on', new.morale_updated_on,
        'low_morale_since', new.low_morale_since,
        'asked_for_more_selection', new.asked_for_more_selection,
        'release_requested', new.release_requested,
        'reason', 'race_selection',
        'action_url', v_action_url
      )
    );
  end if;

  if v_unhappy_event and not exists (
    select 1
    from public.notifications n
    join public.notification_types nt on nt.id = n.type_id
    where nt.code = 'RIDER_UNHAPPY'
      and n.payload_json->>'event_key' =
        'rider_morale:unhappy:' || new.id::text || ':' || v_event_date
  ) then
    perform public.create_infrastructure_notification(
      v_owner_user_id,
      'RIDER_UNHAPPY',
      'Rider morale is low',
      v_rider_name || ' is unhappy. Review his morale and team situation.',
      v_action_url,
      jsonb_build_object(
        'event_key', 'rider_morale:unhappy:' || new.id::text || ':' || v_event_date,
        'rider_id', new.id,
        'rider_name', v_rider_name,
        'club_id', v_club_id,
        'morale', new.morale,
        'morale_threshold', v_morale_threshold,
        'morale_updated_on', new.morale_updated_on,
        'low_morale_since', new.low_morale_since,
        'asked_for_more_selection', new.asked_for_more_selection,
        'release_requested', new.release_requested,
        'reason', 'low_morale',
        'action_url', v_action_url
      )
    );
  end if;

  if v_release_event and not exists (
    select 1
    from public.notifications n
    join public.notification_types nt on nt.id = n.type_id
    where nt.code = 'RIDER_REQUESTS_RELEASE'
      and n.payload_json->>'event_key' =
        'rider_morale:release_requested:' || new.id::text || ':' || v_event_date
  ) then
    perform public.create_infrastructure_notification(
      v_owner_user_id,
      'RIDER_REQUESTS_RELEASE',
      'Rider requests release',
      v_rider_name || ' is very unhappy and has requested to leave the team.',
      v_action_url,
      jsonb_build_object(
        'event_key', 'rider_morale:release_requested:' || new.id::text || ':' || v_event_date,
        'rider_id', new.id,
        'rider_name', v_rider_name,
        'club_id', v_club_id,
        'morale', new.morale,
        'morale_updated_on', new.morale_updated_on,
        'low_morale_since', new.low_morale_since,
        'asked_for_more_selection', new.asked_for_more_selection,
        'release_requested', new.release_requested,
        'reason', 'release_requested',
        'action_url', v_action_url
      )
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_rider_negative_morale_state_v1 on public.riders;
create trigger trg_notify_rider_negative_morale_state_v1
after update of morale, morale_updated_on, low_morale_since, asked_for_more_selection, release_requested
on public.riders
for each row
when (
  (coalesce(old.asked_for_more_selection, false) = false and coalesce(new.asked_for_more_selection, false) = true)
  or (coalesce(old.morale, 50) > 39 and coalesce(new.morale, 50) <= 39)
  or (old.low_morale_since is null and new.low_morale_since is not null)
  or (coalesce(old.release_requested, false) = false and coalesce(new.release_requested, false) = true)
)
execute function public.notify_rider_negative_morale_state_v1();

drop trigger if exists trg_staff_advisory_head_coach_skill_change_v1 on public.riders;
create trigger trg_staff_advisory_head_coach_skill_change_v1
after update of sprint, climbing, flat, time_trial, endurance, teamwork, race_iq, recovery
on public.riders
for each row
when (
  old.sprint is distinct from new.sprint
  or old.climbing is distinct from new.climbing
  or old.flat is distinct from new.flat
  or old.time_trial is distinct from new.time_trial
  or old.endurance is distinct from new.endurance
  or old.teamwork is distinct from new.teamwork
  or old.race_iq is distinct from new.race_iq
  or old.recovery is distinct from new.recovery
)
execute function public.staff_advisory_notify_head_coach_skill_change_v1();

create or replace function public.trg_refresh_rider_market_value()
returns trigger
language plpgsql
as $function$
declare
  v_old_morale_band integer;
  v_new_morale_band integer;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  if tg_op = 'UPDATE' then
    v_old_morale_band := case
      when coalesce(old.morale, 50) >= 85 then 5
      when coalesce(old.morale, 50) >= 70 then 4
      when coalesce(old.morale, 50) >= 50 then 3
      when coalesce(old.morale, 50) >= 35 then 2
      else 1
    end;

    v_new_morale_band := case
      when coalesce(new.morale, 50) >= 85 then 5
      when coalesce(new.morale, 50) >= 70 then 4
      when coalesce(new.morale, 50) >= 50 then 3
      when coalesce(new.morale, 50) >= 35 then 2
      else 1
    end;

    if old.salary is not distinct from new.salary
       and old.birth_date is not distinct from new.birth_date
       and old.contract_expires_at is not distinct from new.contract_expires_at
       and old.potential is not distinct from new.potential
       and old.overall is not distinct from new.overall
       and old.role is not distinct from new.role
       and old.sprint is not distinct from new.sprint
       and old.climbing is not distinct from new.climbing
       and old.time_trial is not distinct from new.time_trial
       and old.endurance is not distinct from new.endurance
       and old.flat is not distinct from new.flat
       and old.recovery is not distinct from new.recovery
       and old.resistance is not distinct from new.resistance
       and old.race_iq is not distinct from new.race_iq
       and old.teamwork is not distinct from new.teamwork
       and old.release_requested is not distinct from new.release_requested
       and v_old_morale_band = v_new_morale_band
    then
      return new;
    end if;
  end if;

  perform public.refresh_rider_value_snapshot(new.id);
  return new;
end;
$function$;

drop trigger if exists trg_refresh_market_value_on_riders on public.riders;
create trigger trg_refresh_market_value_on_riders
after insert or update of
  salary,
  birth_date,
  contract_expires_at,
  morale,
  release_requested,
  potential,
  overall,
  role,
  sprint,
  climbing,
  time_trial,
  endurance,
  flat,
  recovery,
  resistance,
  race_iq,
  teamwork
on public.riders
for each row
execute function public.trg_refresh_rider_market_value();

select cron.alter_job(
  job_id := jobid,
  schedule := '5 */12 * * *'
)
from cron.job
where jobname = 'weekly-staff-wages-check';
