-- Staff Advisory Support — canonical coin integration and operational RPCs
-- Depends on 001_staff_advisory.sql and the existing project coin system:
--   public.user_wallets
--   public.user_coin_ledger
--   public.apply_coin_delta(uuid, integer, text, jsonb)

create or replace function public.staff_advisory_debit_coins_v1(
  p_user_id uuid,
  p_coin_price integer,
  p_idempotency_key text,
  p_reference_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_system_key text;
begin
  if p_coin_price <= 0 then
    raise exception 'invalid_coin_price';
  end if;

  v_system_key := 'staff_advisory:' || p_idempotency_key;

  -- Serialize wallet spending so two concurrent purchases cannot both pass
  -- the same balance check.
  select w.balance
    into v_balance
    from public.user_wallets w
   where w.user_id = p_user_id
   for update;

  if not found then
    raise exception 'coin_wallet_not_found';
  end if;

  if v_balance < p_coin_price then
    raise exception 'insufficient_coins';
  end if;

  -- Canonical wallet + ledger function. The system_key is stable, so the
  -- project's existing idempotency protection prevents duplicate ledger writes.
  perform public.apply_coin_delta(
    p_user_id,
    -p_coin_price,
    'staff_advisory_access',
    jsonb_build_object(
      'system_key', v_system_key,
      'category', 'staff_advisory',
      'reference_id', p_reference_id,
      'idempotency_key', p_idempotency_key,
      'coin_price', p_coin_price
    )
  );

  -- apply_coin_delta currently returns void. The purchase row remains the
  -- durable cross-reference and the coin ledger carries reference_id/system_key.
  return null;
end;
$$;

revoke all on function public.staff_advisory_debit_coins_v1(uuid, integer, text, uuid) from public;

create or replace function public.staff_advisory_quote_v1(
  p_club_id uuid,
  p_staff_id uuid,
  p_coin_price integer default 10,
  p_duration_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_staff public.club_staff%rowtype;
  v_existing public.staff_advisory_access%rowtype;
  v_wallet_balance integer;
  v_base timestamptz;
  v_new_expiry timestamptz;
  v_kind text;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if p_coin_price <= 0 or p_duration_days <= 0 then
    raise exception 'invalid_commercial_terms';
  end if;

  if public.get_my_club_id() is distinct from p_club_id then
    raise exception 'club_access_denied';
  end if;

  select s.* into v_staff
    from public.club_staff s
   where s.id = p_staff_id
     and s.club_id = p_club_id
     and s.is_active = true;

  if not found then
    raise exception 'staff_not_hired_or_inactive';
  end if;

  if v_staff.role_type::text not in (
    'head_coach', 'sport_director', 'team_doctor',
    'mechanic', 'scout_analyst', 'u23_head_coach'
  ) then
    raise exception 'unsupported_staff_role';
  end if;

  select * into v_existing
    from public.staff_advisory_access a
   where a.user_id = v_user_id
     and a.club_id = p_club_id
     and a.staff_id = p_staff_id;

  select w.balance into v_wallet_balance
    from public.user_wallets w
   where w.user_id = v_user_id;

  v_base := greatest(coalesce(v_existing.expires_at, now()), now());
  v_new_expiry := v_base + make_interval(days => p_duration_days);
  v_kind := case
    when v_existing.id is null then 'activation'
    else 'renewal'
  end;

  return jsonb_build_object(
    'staff_id', p_staff_id,
    'role_type', v_staff.role_type::text,
    'purchase_kind', v_kind,
    'coin_price', p_coin_price,
    'duration_days', p_duration_days,
    'current_expires_at', v_existing.expires_at,
    'new_expires_at', v_new_expiry,
    'wallet_balance', coalesce(v_wallet_balance, 0),
    'can_afford', coalesce(v_wallet_balance, 0) >= p_coin_price,
    'automatic_renewal', false
  );
end;
$$;

revoke all on function public.staff_advisory_quote_v1(uuid, uuid, integer, integer) from public;
grant execute on function public.staff_advisory_quote_v1(uuid, uuid, integer, integer) to authenticated;

create or replace function public.staff_advisory_get_reports_v1(
  p_club_id uuid,
  p_staff_id uuid default null,
  p_limit integer default 30
)
returns table (
  report_id uuid,
  staff_id uuid,
  role_type text,
  report_code text,
  title text,
  summary text,
  report_json jsonb,
  reporting_period_start timestamptz,
  reporting_period_end timestamptz,
  created_at timestamptz,
  inbox_conversation_id uuid,
  inbox_message_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.staff_id,
    r.role_type,
    r.report_code,
    r.title,
    r.summary,
    r.report_json,
    r.reporting_period_start,
    r.reporting_period_end,
    r.created_at,
    r.inbox_conversation_id,
    r.inbox_message_id
  from public.staff_advisory_reports r
  where r.user_id = auth.uid()
    and r.club_id = p_club_id
    and (p_staff_id is null or r.staff_id = p_staff_id)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.staff_advisory_get_reports_v1(uuid, uuid, integer) from public;
grant execute on function public.staff_advisory_get_reports_v1(uuid, uuid, integer) to authenticated;

create or replace function public.staff_advisory_store_report_v1(
  p_user_id uuid,
  p_club_id uuid,
  p_staff_id uuid,
  p_report_code text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_title text,
  p_summary text,
  p_report_json jsonb,
  p_source_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.club_staff%rowtype;
  v_access public.staff_advisory_access%rowtype;
  v_report public.staff_advisory_reports%rowtype;
  v_delivery jsonb;
begin
  if p_period_end <= p_period_start then
    raise exception 'invalid_reporting_period';
  end if;

  select s.* into v_staff
    from public.club_staff s
   where s.id = p_staff_id
     and s.club_id = p_club_id
     and s.is_active = true;

  if not found then
    raise exception 'staff_not_hired_or_inactive';
  end if;

  select a.* into v_access
    from public.staff_advisory_access a
   where a.user_id = p_user_id
     and a.club_id = p_club_id
     and a.staff_id = p_staff_id
     and a.expires_at > now();

  if not found then
    raise exception 'advisory_access_inactive';
  end if;

  insert into public.staff_advisory_reports(
    user_id, club_id, staff_id, role_type, report_code,
    reporting_period_start, reporting_period_end,
    title, summary, report_json, source_fingerprint
  ) values (
    p_user_id, p_club_id, p_staff_id, v_staff.role_type::text, p_report_code,
    p_period_start, p_period_end,
    p_title, p_summary, coalesce(p_report_json, '{}'::jsonb), p_source_fingerprint
  )
  on conflict (club_id, staff_id, report_code, reporting_period_start)
  do nothing
  returning * into v_report;

  if not found then
    select r.* into v_report
      from public.staff_advisory_reports r
     where r.club_id = p_club_id
       and r.staff_id = p_staff_id
       and r.report_code = p_report_code
       and r.reporting_period_start = p_period_start;

    return jsonb_build_object(
      'report_id', v_report.id,
      'created', false,
      'duplicate_prevented', true
    );
  end if;

  v_delivery := public.staff_advisory_deliver_inbox_v1(
    p_user_id,
    p_staff_id,
    v_staff.role_type::text,
    v_report.id,
    p_title,
    p_summary
  );

  update public.staff_advisory_reports
     set inbox_conversation_id = nullif(v_delivery->>'conversation_id', '')::uuid,
         inbox_message_id = nullif(v_delivery->>'message_id', '')::uuid
   where id = v_report.id;

  return jsonb_build_object(
    'report_id', v_report.id,
    'created', true,
    'duplicate_prevented', false,
    'delivery', v_delivery
  );
end;
$$;

-- Backend/service-role invocation only. Do not grant to authenticated.
revoke all on function public.staff_advisory_store_report_v1(uuid, uuid, uuid, text, timestamptz, timestamptz, text, text, jsonb, text) from public;
