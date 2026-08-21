-- Staff Advisory Support — security hardening
-- Commercial terms are database-owned. Authenticated clients cannot choose price
-- or duration by bypassing the Edge Function.

create table if not exists public.staff_advisory_config (
  config_key text primary key,
  coin_price integer not null check (coin_price > 0),
  duration_days integer not null check (duration_days > 0),
  reports_enabled boolean not null default true,
  purchases_enabled boolean not null default true,
  automatic_renewal boolean not null default false check (automatic_renewal = false),
  final_pricing_confirmed boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.staff_advisory_config(
  config_key,
  coin_price,
  duration_days,
  reports_enabled,
  purchases_enabled,
  automatic_renewal,
  final_pricing_confirmed
)
values ('default', 10, 30, true, true, false, true)
on conflict (config_key) do nothing;

alter table public.staff_advisory_config enable row level security;
-- No client table policies. Terms are exposed only through quote/state RPCs.

create or replace function public.staff_advisory_get_commercial_terms_v1()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'coin_price', c.coin_price,
    'duration_days', c.duration_days,
    'automatic_renewal', c.automatic_renewal,
    'final_pricing_confirmed', c.final_pricing_confirmed,
    'purchases_enabled', c.purchases_enabled,
    'reports_enabled', c.reports_enabled
  )
  from public.staff_advisory_config c
  where c.config_key = 'default';
$$;

revoke all on function public.staff_advisory_get_commercial_terms_v1() from public;
grant execute on function public.staff_advisory_get_commercial_terms_v1() to authenticated;

-- Lock down the parameterised internal functions from direct authenticated use.
revoke execute on function public.staff_advisory_quote_v1(uuid, uuid, integer, integer) from authenticated;
revoke execute on function public.staff_advisory_activate_v1(uuid, uuid, text, integer, integer) from authenticated;

create or replace function public.staff_advisory_quote_secure_v1(
  p_club_id uuid,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.staff_advisory_config%rowtype;
begin
  select * into v_config
    from public.staff_advisory_config
   where config_key = 'default';

  if not found then
    raise exception 'staff_advisory_config_missing';
  end if;

  if not v_config.purchases_enabled then
    raise exception 'staff_advisory_purchases_disabled';
  end if;

  return public.staff_advisory_quote_v1(
    p_club_id,
    p_staff_id,
    v_config.coin_price,
    v_config.duration_days
  ) || jsonb_build_object(
    'final_pricing_confirmed', v_config.final_pricing_confirmed
  );
end;
$$;

revoke all on function public.staff_advisory_quote_secure_v1(uuid, uuid) from public;
grant execute on function public.staff_advisory_quote_secure_v1(uuid, uuid) to authenticated;

create or replace function public.staff_advisory_activate_secure_v1(
  p_club_id uuid,
  p_staff_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.staff_advisory_config%rowtype;
begin
  select * into v_config
    from public.staff_advisory_config
   where config_key = 'default';

  if not found then
    raise exception 'staff_advisory_config_missing';
  end if;

  if not v_config.purchases_enabled then
    raise exception 'staff_advisory_purchases_disabled';
  end if;

  return public.staff_advisory_activate_v1(
    p_club_id,
    p_staff_id,
    p_idempotency_key,
    v_config.coin_price,
    v_config.duration_days
  );
end;
$$;

revoke all on function public.staff_advisory_activate_secure_v1(uuid, uuid, text) from public;
grant execute on function public.staff_advisory_activate_secure_v1(uuid, uuid, text) to authenticated;

-- Add ownership enforcement to read state.
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
  where public.get_my_club_id() = p_club_id
    and s.club_id = p_club_id
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

-- Recreate pin setter with explicit club ownership validation.
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

  if public.get_my_club_id() is distinct from p_club_id then
    raise exception 'club_access_denied';
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
