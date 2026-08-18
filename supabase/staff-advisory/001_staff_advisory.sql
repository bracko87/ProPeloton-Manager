-- Staff Advisory Support
-- Apply in Supabase SQL editor / migration pipeline after reviewing canonical wallet,
-- ledger and inbox table/function names in the deployed project.
--
-- IMPORTANT:
-- The activation RPC is intentionally written around two integration hooks:
--   public.staff_advisory_debit_coins_v1(...)
--   public.staff_advisory_deliver_inbox_v1(...)
-- They must be implemented against the project's canonical coin ledger and Inbox
-- transaction model before activation is exposed in production.

create extension if not exists pgcrypto;

create table if not exists public.staff_advisory_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null,
  staff_id uuid not null,
  role_type text not null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_purchase_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, staff_id)
);

create index if not exists staff_advisory_access_user_idx
  on public.staff_advisory_access(user_id, expires_at desc);

create table if not exists public.staff_advisory_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null,
  staff_id uuid not null,
  role_type text not null,
  idempotency_key text not null,
  purchase_kind text not null check (purchase_kind in ('activation', 'renewal')),
  coin_price integer not null check (coin_price > 0),
  duration_days integer not null check (duration_days > 0),
  previous_expires_at timestamptz,
  new_expires_at timestamptz not null,
  ledger_entry_id uuid,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  failure_code text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists staff_advisory_purchases_staff_idx
  on public.staff_advisory_purchases(club_id, staff_id, created_at desc);

create table if not exists public.staff_advisory_pins (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null,
  staff_id uuid not null,
  sort_order smallint not null check (sort_order between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, club_id, staff_id),
  unique (user_id, club_id, sort_order)
);

create table if not exists public.staff_advisory_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null,
  staff_id uuid not null,
  role_type text not null,
  report_code text not null,
  reporting_period_start timestamptz not null,
  reporting_period_end timestamptz not null,
  title text not null,
  summary text not null,
  report_json jsonb not null default '{}'::jsonb,
  source_fingerprint text,
  inbox_conversation_id uuid,
  inbox_message_id uuid,
  created_at timestamptz not null default now(),
  unique (club_id, staff_id, report_code, reporting_period_start)
);

create index if not exists staff_advisory_reports_access_idx
  on public.staff_advisory_reports(user_id, staff_id, created_at desc);

create table if not exists public.staff_advisory_report_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  staff_id uuid not null,
  report_code text not null,
  event_key text not null,
  source_type text not null,
  source_id text,
  occurred_at timestamptz not null default now(),
  consumed_by_report_id uuid references public.staff_advisory_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (club_id, staff_id, report_code, event_key)
);

alter table public.staff_advisory_access enable row level security;
alter table public.staff_advisory_purchases enable row level security;
alter table public.staff_advisory_pins enable row level security;
alter table public.staff_advisory_reports enable row level security;
alter table public.staff_advisory_report_events enable row level security;

drop policy if exists staff_advisory_access_read_own on public.staff_advisory_access;
create policy staff_advisory_access_read_own
  on public.staff_advisory_access for select
  using (user_id = auth.uid());

drop policy if exists staff_advisory_purchases_read_own on public.staff_advisory_purchases;
create policy staff_advisory_purchases_read_own
  on public.staff_advisory_purchases for select
  using (user_id = auth.uid());

drop policy if exists staff_advisory_pins_own on public.staff_advisory_pins;
create policy staff_advisory_pins_own
  on public.staff_advisory_pins for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists staff_advisory_reports_read_own on public.staff_advisory_reports;
create policy staff_advisory_reports_read_own
  on public.staff_advisory_reports for select
  using (user_id = auth.uid());

-- No direct client policy for report_events. Backend/service role only.

create or replace function public.staff_advisory_get_state_v1(p_club_id uuid)
returns table (
  staff_id uuid,
  role_type text,
  advisory_status text,
  expires_at timestamptz,
  is_pinned boolean,
  pin_order smallint
)
language sql
security definer
set search_path = public
as $$
  select
    s.id as staff_id,
    s.role_type::text,
    case
      when a.expires_at is null then 'inactive'
      when a.expires_at > now() then 'active'
      else 'expired'
    end as advisory_status,
    a.expires_at,
    (p.staff_id is not null) as is_pinned,
    p.sort_order
  from public.club_staff s
  left join public.staff_advisory_access a
    on a.club_id = s.club_id
   and a.staff_id = s.id
   and a.user_id = auth.uid()
  left join public.staff_advisory_pins p
    on p.club_id = s.club_id
   and p.staff_id = s.id
   and p.user_id = auth.uid()
  where s.club_id = p_club_id
    and s.is_active = true
    and s.role_type::text in (
      'head_coach',
      'sport_director',
      'team_doctor',
      'mechanic',
      'scout_analyst',
      'u23_head_coach'
    )
  order by coalesce(p.sort_order, 99), s.role_type::text, s.id;
$$;

revoke all on function public.staff_advisory_get_state_v1(uuid) from public;
grant execute on function public.staff_advisory_get_state_v1(uuid) to authenticated;

create or replace function public.staff_advisory_set_pins_v1(
  p_club_id uuid,
  p_staff_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_staff_id uuid;
  v_order integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  v_count := coalesce(array_length(p_staff_ids, 1), 0);
  if v_count > 5 then
    raise exception 'pin_limit_exceeded';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_staff_ids, '{}'::uuid[])) x(staff_id)
    left join public.club_staff s
      on s.id = x.staff_id
     and s.club_id = p_club_id
     and s.is_active = true
    where s.id is null
  ) then
    raise exception 'invalid_or_inactive_staff';
  end if;

  delete from public.staff_advisory_pins
   where user_id = auth.uid()
     and club_id = p_club_id;

  foreach v_staff_id in array coalesce(p_staff_ids, '{}'::uuid[])
  loop
    v_order := v_order + 1;
    insert into public.staff_advisory_pins(user_id, club_id, staff_id, sort_order)
    values (auth.uid(), p_club_id, v_staff_id, v_order);
  end loop;
end;
$$;

revoke all on function public.staff_advisory_set_pins_v1(uuid, uuid[]) from public;
grant execute on function public.staff_advisory_set_pins_v1(uuid, uuid[]) to authenticated;

-- Integration hook. Replace body with canonical atomic wallet+ledger transaction.
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
begin
  raise exception 'staff_advisory_coin_ledger_hook_not_configured';
end;
$$;

revoke all on function public.staff_advisory_debit_coins_v1(uuid, integer, text, uuid) from public;

-- Integration hook. Implement against canonical Inbox system-message RPC.
create or replace function public.staff_advisory_deliver_inbox_v1(
  p_user_id uuid,
  p_staff_id uuid,
  p_role_type text,
  p_report_id uuid,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('conversation_id', null, 'message_id', null);
end;
$$;

revoke all on function public.staff_advisory_deliver_inbox_v1(uuid, uuid, text, uuid, text, text) from public;

create or replace function public.staff_advisory_activate_v1(
  p_club_id uuid,
  p_staff_id uuid,
  p_idempotency_key text,
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
  v_existing_purchase public.staff_advisory_purchases%rowtype;
  v_purchase_id uuid := gen_random_uuid();
  v_base timestamptz;
  v_new_expiry timestamptz;
  v_kind text;
  v_ledger_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key_required';
  end if;

  select * into v_existing_purchase
  from public.staff_advisory_purchases
  where user_id = v_user_id
    and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'purchase_id', v_existing_purchase.id,
      'status', v_existing_purchase.status,
      'staff_id', v_existing_purchase.staff_id,
      'expires_at', v_existing_purchase.new_expires_at,
      'coin_price', v_existing_purchase.coin_price,
      'idempotent_replay', true
    );
  end if;

  select s.* into v_staff
  from public.club_staff s
  where s.id = p_staff_id
    and s.club_id = p_club_id
    and s.is_active = true
  for update;

  if not found then
    raise exception 'staff_not_hired_or_inactive';
  end if;

  if v_staff.role_type::text not in (
    'head_coach', 'sport_director', 'team_doctor',
    'mechanic', 'scout_analyst', 'u23_head_coach'
  ) then
    raise exception 'unsupported_staff_role';
  end if;

  -- Ownership must be verified through the deployed canonical club ownership model.
  -- This assertion uses get_my_club_id(), which is already used by the frontend route guard.
  if public.get_my_club_id() is distinct from p_club_id then
    raise exception 'club_access_denied';
  end if;

  select * into v_existing
  from public.staff_advisory_access
  where user_id = v_user_id
    and club_id = p_club_id
    and staff_id = p_staff_id
  for update;

  v_base := greatest(coalesce(v_existing.expires_at, now()), now());
  v_new_expiry := v_base + make_interval(days => p_duration_days);
  v_kind := case when v_existing.id is null then 'activation' else 'renewal' end;

  insert into public.staff_advisory_purchases(
    id, user_id, club_id, staff_id, role_type, idempotency_key,
    purchase_kind, coin_price, duration_days, previous_expires_at,
    new_expires_at, status
  ) values (
    v_purchase_id, v_user_id, p_club_id, p_staff_id, v_staff.role_type::text,
    p_idempotency_key, v_kind, p_coin_price, p_duration_days,
    v_existing.expires_at, v_new_expiry, 'completed'
  );

  -- If debit fails, the transaction rolls back: no purchase, no access, no coin loss.
  v_ledger_id := public.staff_advisory_debit_coins_v1(
    v_user_id, p_coin_price, p_idempotency_key, v_purchase_id
  );

  insert into public.staff_advisory_access(
    user_id, club_id, staff_id, role_type, activated_at,
    expires_at, last_purchase_id
  ) values (
    v_user_id, p_club_id, p_staff_id, v_staff.role_type::text,
    now(), v_new_expiry, v_purchase_id
  )
  on conflict (club_id, staff_id) do update
    set user_id = excluded.user_id,
        role_type = excluded.role_type,
        expires_at = excluded.expires_at,
        last_purchase_id = excluded.last_purchase_id,
        updated_at = now();

  update public.staff_advisory_purchases
     set ledger_entry_id = v_ledger_id
   where id = v_purchase_id;

  return jsonb_build_object(
    'purchase_id', v_purchase_id,
    'status', 'completed',
    'staff_id', p_staff_id,
    'role_type', v_staff.role_type::text,
    'purchase_kind', v_kind,
    'coin_price', p_coin_price,
    'expires_at', v_new_expiry,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.staff_advisory_activate_v1(uuid, uuid, text, integer, integer) from public;
-- Activation is intended to be called by the Edge Function using a service client
-- while forwarding the authenticated user's JWT context / invoking the RPC as user.

grant execute on function public.staff_advisory_activate_v1(uuid, uuid, text, integer, integer) to authenticated;
