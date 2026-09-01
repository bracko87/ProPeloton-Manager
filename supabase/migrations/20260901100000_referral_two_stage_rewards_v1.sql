-- Two-stage referral rewards:
-- 1) 2 coins after 3 distinct real (UTC) activity days, max 10 free rewards/inviter/month.
-- 2) 40 coins once after first paid conversion: Premium OR Coin package.
-- Stripe coin checkout/webhook remains unchanged.

alter table public.club_referrals
  add column if not exists activity_reward_coins integer not null default 2,
  add column if not exists activity_day_count integer not null default 0,
  add column if not exists activity_qualified_at timestamptz,
  add column if not exists activity_reward_granted_at timestamptz,
  add column if not exists activity_reward_status text not null default 'pending',
  add column if not exists paid_conversion_type text,
  add column if not exists paid_conversion_at timestamptz,
  add column if not exists paid_conversion_system_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.club_referrals'::regclass
      and conname = 'club_referrals_activity_reward_status_chk'
  ) then
    alter table public.club_referrals
      add constraint club_referrals_activity_reward_status_chk
      check (activity_reward_status in ('pending','granted','capped','ineligible'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.club_referrals'::regclass
      and conname = 'club_referrals_paid_conversion_type_chk'
  ) then
    alter table public.club_referrals
      add constraint club_referrals_paid_conversion_type_chk
      check (paid_conversion_type is null or paid_conversion_type in ('coin_package','premium'));
  end if;
end $$;

create table if not exists public.referral_activity_days (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.club_referrals(id) on delete cascade,
  referred_user_id uuid not null,
  activity_date date not null,
  created_at timestamptz not null default now(),
  unique (referral_id, activity_date)
);

create index if not exists referral_activity_days_user_date_idx
  on public.referral_activity_days (referred_user_id, activity_date desc);

alter table public.referral_activity_days enable row level security;
revoke all on table public.referral_activity_days from public, anon, authenticated;
grant select, insert, update, delete on table public.referral_activity_days to service_role;

update public.club_referrals r
set
  paid_conversion_type = coalesce(r.paid_conversion_type, 'coin_package'),
  paid_conversion_at = coalesce(r.paid_conversion_at, r.qualifying_purchase_at, r.completed_at),
  paid_conversion_system_key = coalesce(r.paid_conversion_system_key, r.qualifying_purchase_system_key)
where r.reward_granted_at is not null
  and r.paid_conversion_type is null;

update public.club_referrals r
set activity_reward_status = 'ineligible'
where r.activity_reward_status = 'pending'
  and (
    not exists (
      select 1 from public.clubs c
      where c.id = r.referrer_club_id
        and c.deleted_at is null
        and c.owner_user_id is not null
        and c.club_type = 'main'
        and c.is_ai = false
    )
    or not exists (
      select 1 from public.clubs c
      where c.id = r.referred_club_id
        and c.deleted_at is null
        and c.owner_user_id = r.referred_user_id
        and c.club_type = 'main'
        and c.is_ai = false
    )
  );

create or replace function public.referral_notify_reward_v1(
  p_user_id uuid,
  p_referral_id uuid,
  p_reward_coins integer,
  p_reward_kind text,
  p_conversion_type text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type_id bigint;
  v_notification_id bigint;
  v_message text;
begin
  select id into v_type_id
  from public.notification_types
  where code = 'REFERRAL_REWARD_GRANTED'
    and is_active = true
  limit 1;

  if v_type_id is null then return; end if;

  if p_reward_kind = 'activity' then
    v_message := 'Your invited friend became an active player. You received ' || p_reward_coins || ' coins.';
  else
    v_message := 'Your invited friend completed their first paid conversion (' ||
      case when p_conversion_type = 'premium' then 'Premium' else 'Coin package' end ||
      '). You received ' || p_reward_coins || ' coins.';
  end if;

  insert into public.notifications (
    type_id, title, message, source, created_by_user_id,
    action_url, payload_json, expires_at, created_at
  ) values (
    v_type_id, 'Referral reward received', v_message, 'game', null,
    '/dashboard/invite-friends',
    jsonb_build_object(
      'system_key', 'referral_reward_notification_' || p_reward_kind || '_' || p_referral_id::text,
      'club_referral_id', p_referral_id,
      'reward_coins', p_reward_coins,
      'reward_kind', p_reward_kind,
      'conversion_type', p_conversion_type
    ),
    null, now()
  ) returning id into v_notification_id;

  insert into public.user_notifications (
    user_id, notification_id, status, read_at, deleted_at, created_at
  ) values (
    p_user_id, v_notification_id, 'unread', null, null, now()
  ) on conflict (user_id, notification_id) do nothing;
exception
  when others then
    raise warning 'Referral reward notification failed for referral %: %', p_referral_id, sqlerrm;
end;
$$;

create or replace function public.grant_referral_paid_conversion_reward_v1(
  p_user_id uuid,
  p_conversion_type text,
  p_conversion_system_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral public.club_referrals%rowtype;
  v_referrer_user_id uuid;
  v_reward_coins integer;
  v_reward_system_key text;
begin
  if p_user_id is null then return false; end if;
  if p_conversion_type not in ('coin_package','premium') then
    raise exception 'Unsupported referral conversion type: %', p_conversion_type;
  end if;

  select * into v_referral
  from public.club_referrals
  where referred_user_id = p_user_id
    and status <> 'rejected'
  order by created_at asc
  limit 1
  for update;

  if v_referral.id is null then return false; end if;
  if v_referral.reward_granted_at is not null then return false; end if;

  select c.owner_user_id into v_referrer_user_id
  from public.clubs c
  where c.id = v_referral.referrer_club_id
    and c.deleted_at is null
    and c.is_ai = false
    and c.club_type = 'main'
    and c.owner_user_id is not null
  limit 1;

  if v_referrer_user_id is null then
    update public.club_referrals set status = 'rejected' where id = v_referral.id;
    return false;
  end if;

  v_reward_coins := coalesce(v_referral.reward_coins, 40);
  v_reward_system_key := 'referral_paid_reward_' || v_referral.id::text;

  perform public.apply_coin_delta(
    v_referrer_user_id,
    v_reward_coins,
    'referral_reward',
    jsonb_build_object(
      'system_key', v_reward_system_key,
      'club_referral_id', v_referral.id,
      'referred_user_id', p_user_id,
      'conversion_type', p_conversion_type,
      'conversion_system_key', p_conversion_system_key
    )
  );

  update public.club_referrals
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    reward_granted_at = coalesce(reward_granted_at, now()),
    paid_conversion_type = coalesce(paid_conversion_type, p_conversion_type),
    paid_conversion_at = coalesce(paid_conversion_at, now()),
    paid_conversion_system_key = coalesce(paid_conversion_system_key, p_conversion_system_key),
    qualifying_purchase_at = case
      when p_conversion_type = 'coin_package' then coalesce(qualifying_purchase_at, now())
      else qualifying_purchase_at
    end,
    qualifying_purchase_system_key = case
      when p_conversion_type = 'coin_package' then coalesce(qualifying_purchase_system_key, p_conversion_system_key)
      else qualifying_purchase_system_key
    end
  where id = v_referral.id;

  perform public.referral_notify_reward_v1(
    v_referrer_user_id, v_referral.id, v_reward_coins, 'paid', p_conversion_type
  );

  return true;
end;
$$;

create or replace function public.referral_try_paid_conversion_from_history_v1(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coin_at timestamptz;
  v_coin_key text;
  v_premium_at timestamptz;
  v_premium_key text;
begin
  if p_user_id is null then return false; end if;

  if exists (
    select 1 from public.club_referrals r
    where r.referred_user_id = p_user_id
      and r.reward_granted_at is not null
  ) then return false; end if;

  select l.created_at, l.payload_json->>'system_key'
  into v_coin_at, v_coin_key
  from public.user_coin_ledger l
  where l.user_id = p_user_id
    and l.reason = 'purchase'
    and l.delta > 0
  order by l.created_at asc
  limit 1;

  select p.processed_at, 'stripe_invoice_' || p.stripe_invoice_id
  into v_premium_at, v_premium_key
  from public.premium_invoice_payments p
  where p.user_id = p_user_id
    and coalesce(p.amount_paid_cents,0) > 0
  order by p.processed_at asc
  limit 1;

  if v_coin_at is null and v_premium_at is null then return false; end if;

  if v_premium_at is not null and (v_coin_at is null or v_premium_at <= v_coin_at) then
    return public.grant_referral_paid_conversion_reward_v1(p_user_id, 'premium', v_premium_key);
  end if;

  return public.grant_referral_paid_conversion_reward_v1(p_user_id, 'coin_package', v_coin_key);
end;
$$;

create or replace function public.referral_record_activity_day_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral public.club_referrals%rowtype;
  v_today date := (now() at time zone 'UTC')::date;
  v_day_count integer := 0;
  v_referrer_user_id uuid;
  v_month_reward_count integer := 0;
  v_reward_system_key text;
  v_email_confirmed boolean := false;
begin
  select * into v_referral
  from public.club_referrals
  where referred_user_id = p_user_id
    and status <> 'rejected'
  order by created_at asc
  limit 1
  for update;

  if v_referral.id is null then
    return jsonb_build_object('tracked', false, 'reason', 'no_referral');
  end if;

  select (u.email_confirmed_at is not null)
  into v_email_confirmed
  from auth.users u
  where u.id = p_user_id;

  if not coalesce(v_email_confirmed,false)
     or not exists (
       select 1 from public.clubs c
       where c.id = v_referral.referred_club_id
         and c.owner_user_id = p_user_id
         and c.deleted_at is null
         and c.is_ai = false
         and c.club_type = 'main'
     ) then
    update public.club_referrals
    set activity_reward_status = 'ineligible'
    where id = v_referral.id and activity_reward_status = 'pending';
    return jsonb_build_object('tracked', false, 'reason', 'referred_club_not_eligible');
  end if;

  insert into public.referral_activity_days (referral_id, referred_user_id, activity_date)
  values (v_referral.id, p_user_id, v_today)
  on conflict (referral_id, activity_date) do nothing;

  select count(*) into v_day_count
  from public.referral_activity_days d
  where d.referral_id = v_referral.id;

  update public.club_referrals set activity_day_count = v_day_count where id = v_referral.id;

  if v_day_count < 3 or v_referral.activity_reward_status <> 'pending' then
    return jsonb_build_object(
      'tracked', true,
      'activity_days', v_day_count,
      'activity_reward_status', v_referral.activity_reward_status
    );
  end if;

  update public.club_referrals
  set activity_qualified_at = coalesce(activity_qualified_at, now())
  where id = v_referral.id;

  select c.owner_user_id into v_referrer_user_id
  from public.clubs c
  where c.id = v_referral.referrer_club_id
    and c.deleted_at is null
    and c.is_ai = false
    and c.club_type = 'main'
    and c.owner_user_id is not null
  limit 1;

  if v_referrer_user_id is null then
    update public.club_referrals set activity_reward_status = 'ineligible' where id = v_referral.id;
    return jsonb_build_object('tracked', true, 'activity_days', v_day_count, 'activity_reward_status', 'ineligible');
  end if;

  select count(*) into v_month_reward_count
  from public.user_coin_ledger l
  where l.user_id = v_referrer_user_id
    and l.reason = 'referral_activity_reward'
    and l.delta > 0
    and l.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    and l.created_at < (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';

  if v_month_reward_count >= 10 then
    update public.club_referrals set activity_reward_status = 'capped' where id = v_referral.id;
    return jsonb_build_object('tracked', true, 'activity_days', v_day_count, 'activity_reward_status', 'capped');
  end if;

  v_reward_system_key := 'referral_activity_reward_' || v_referral.id::text;

  perform public.apply_coin_delta(
    v_referrer_user_id,
    coalesce(v_referral.activity_reward_coins,2),
    'referral_activity_reward',
    jsonb_build_object(
      'system_key', v_reward_system_key,
      'club_referral_id', v_referral.id,
      'referred_user_id', p_user_id,
      'activity_days', v_day_count,
      'monthly_reward_number', v_month_reward_count + 1
    )
  );

  update public.club_referrals
  set activity_reward_status = 'granted',
      activity_reward_granted_at = coalesce(activity_reward_granted_at, now())
  where id = v_referral.id;

  perform public.referral_notify_reward_v1(
    v_referrer_user_id, v_referral.id, coalesce(v_referral.activity_reward_coins,2), 'activity', null
  );

  return jsonb_build_object('tracked', true, 'activity_days', v_day_count, 'activity_reward_status', 'granted');
end;
$$;

create or replace function public.mark_user_activity_v1(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_caller_id uuid;
  v_club record;
  v_reactivated_count integer := 0;
  v_archived_count integer := 0;
  v_referral_activity jsonb := '{}'::jsonb;
begin
  v_user_id := p_user_id;
  v_caller_id := auth.uid();

  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if v_caller_id is not null and v_caller_id <> v_user_id then
    raise exception 'Cannot mark activity for another user';
  end if;

  update public.profiles p
  set last_seen_at = now(),
      last_login_at = coalesce(p.last_login_at, now()),
      updated_at = now()
  where p.id = v_user_id;

  for v_club in
    select c.id, c.inactivity_status, c.is_active
    from public.clubs c
    where c.owner_user_id = v_user_id
      and c.is_ai = false
      and c.deleted_at is null
      and c.club_type = 'main'
  loop
    if v_club.inactivity_status in ('at_risk','inactive') then
      update public.clubs c
      set is_active = true,
          inactivity_status = 'active',
          inactive_at = null,
          inactivity_reason = null,
          updated_at = now()
      where c.id = v_club.id;

      insert into public.user_team_inactivity_events (
        user_id, club_id, previous_status, new_status, days_inactive, reason, metadata
      ) values (
        v_user_id, v_club.id, v_club.inactivity_status, 'active', null,
        'user_returned', jsonb_build_object('source','mark_user_activity_v1')
      );
      v_reactivated_count := v_reactivated_count + 1;
    elsif v_club.inactivity_status = 'archived' then
      v_archived_count := v_archived_count + 1;
    end if;
  end loop;

  v_referral_activity := public.referral_record_activity_day_v1(v_user_id);
  perform public.referral_try_paid_conversion_from_history_v1(v_user_id);

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'reactivated_count', v_reactivated_count,
    'archived_count', v_archived_count,
    'archived_requires_manual_reactivation', v_archived_count > 0,
    'referral_activity', v_referral_activity
  );
end;
$$;

create or replace function public.apply_club_referral(p_referral_code text, p_referred_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_referrer_club_id uuid;
  v_referrer_owner uuid;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from public.clubs c
    where c.id = p_referred_club_id
      and c.owner_user_id = v_user_id
      and c.deleted_at is null
      and c.is_ai = false
      and c.club_type = 'main'
  ) then
    raise exception 'Referred club does not belong to authenticated user';
  end if;

  select c.id, c.owner_user_id
  into v_referrer_club_id, v_referrer_owner
  from public.clubs c
  where c.referral_code = upper(btrim(p_referral_code))
    and c.deleted_at is null
    and c.is_ai = false
    and c.club_type = 'main'
    and c.owner_user_id is not null
  limit 1;

  if v_referrer_club_id is null then return; end if;
  if v_referrer_owner = v_user_id then return; end if;

  insert into public.club_referrals (
    referrer_club_id, referred_user_id, referred_club_id,
    referral_code_used, status
  ) values (
    v_referrer_club_id, v_user_id, p_referred_club_id,
    upper(btrim(p_referral_code)), 'pending'
  ) on conflict (referred_user_id) do nothing;

  perform public.referral_try_paid_conversion_from_history_v1(v_user_id);
end;
$$;

create or replace function public.try_complete_referral_after_purchase(
  p_user_id uuid,
  p_purchase_system_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_key text;
begin
  select l.payload_json->>'system_key'
  into v_purchase_key
  from public.user_coin_ledger l
  where l.user_id = p_user_id
    and l.reason = 'purchase'
    and l.delta > 0
    and (
      p_purchase_system_key is null
      or l.payload_json->>'system_key' = p_purchase_system_key
    )
  order by l.created_at asc
  limit 1;

  if v_purchase_key is null then return false; end if;

  return public.grant_referral_paid_conversion_reward_v1(
    p_user_id, 'coin_package', v_purchase_key
  );
end;
$$;

create or replace function public.trg_premium_invoice_referral_reward_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.grant_referral_paid_conversion_reward_v1(
      new.user_id, 'premium', 'stripe_invoice_' || new.stripe_invoice_id
    );
  exception
    when others then
      raise warning 'Premium referral reward failed for user % invoice %: %', new.user_id, new.stripe_invoice_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists premium_invoice_referral_reward_v1 on public.premium_invoice_payments;
create trigger premium_invoice_referral_reward_v1
after insert on public.premium_invoice_payments
for each row execute function public.trg_premium_invoice_referral_reward_v1();

revoke execute on function public.apply_club_referral(text,uuid) from public, anon;
grant execute on function public.apply_club_referral(text,uuid) to authenticated, service_role;

revoke execute on function public.mark_user_activity_v1(uuid) from public, anon;
grant execute on function public.mark_user_activity_v1(uuid) to authenticated, service_role;

revoke execute on function public.try_complete_referral_after_purchase(uuid,text) from public, anon, authenticated;
grant execute on function public.try_complete_referral_after_purchase(uuid,text) to service_role;

revoke execute on function public.grant_referral_paid_conversion_reward_v1(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.referral_try_paid_conversion_from_history_v1(uuid) from public, anon, authenticated;
revoke execute on function public.referral_record_activity_day_v1(uuid) from public, anon, authenticated;
revoke execute on function public.referral_notify_reward_v1(uuid,uuid,integer,text,text) from public, anon, authenticated;
grant execute on function public.grant_referral_paid_conversion_reward_v1(uuid,text,text) to service_role;
grant execute on function public.referral_try_paid_conversion_from_history_v1(uuid) to service_role;
grant execute on function public.referral_record_activity_day_v1(uuid) to service_role;
grant execute on function public.referral_notify_reward_v1(uuid,uuid,integer,text,text) to service_role;
