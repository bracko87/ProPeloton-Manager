-- Project Saturn: ProPeloton Manager ONLY. SAT-01/02/08 phase 1.
-- This migration mirrors verified production guards applied 20 Nov 2026.
-- Guest account creation remains OFF. Existing email signup, user IDs,
-- purchases, clubs, Premium and December 10 release scheduler remain unchanged.
--
-- Safety: Supabase anonymous Auth users have the 'authenticated' SQL role.
-- Do NOT rely on TO authenticated alone to distinguish verified identities.
--
-- This first stage does NOT enable signInAnonymously, Google or identity linking.
-- A reviewed isolated demo, RLS audits, CAPTCHA/rate limits, server-side race
-- eligibility and same-UUID conversion tests are mandatory before enabling it.
--
-- Repeated deployments preserve the guest gate (do not reset enabled status).
create table if not exists private.ppm_guest_auth_gate_v1 (
  id boolean primary key default true check (id = true),
  enabled boolean not null default false,
  verified_at timestamptz,
  reason text not null default 'Guest Mode remains disabled until identity, reward, competition and abuse testing passes',
  updated_at timestamptz not null default clock_timestamp(),
  constraint ppm_guest_mode_requires_verification check (not enabled or verified_at is not null)
);
insert into private.ppm_guest_auth_gate_v1(id,enabled)
  values (true,false) on conflict(id) do nothing;
alter table private.ppm_guest_auth_gate_v1 enable row level security;
revoke all on private.ppm_guest_auth_gate_v1 from PUBLIC,anon,authenticated;

-- The one gate that protects all Auth anonymous user creation:
CREATE OR REPLACE FUNCTION public.ppm_prevent_unverified_guest_signup_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(new.is_anonymous,false) and not exists (
    select 1 from private.ppm_guest_auth_gate_v1 g
    where g.id=true and g.enabled=true and g.verified_at is not null
  ) then
    raise exception using errcode='P0001',
      message='Guest Mode is not available yet. Please use regular registration.';
  end if;
  return new;
end;
$function$;

revoke all on function public.ppm_prevent_unverified_guest_signup_v1() from PUBLIC,anon,authenticated;
drop trigger if exists ppm_prevent_unverified_guest_signup_v1 on auth.users;
create trigger ppm_prevent_unverified_guest_signup_v1
  before insert on auth.users for each row
  execute function public.ppm_prevent_unverified_guest_signup_v1();

-- Existing welcome reward trigger, now blocking anonymous accounts:
CREATE OR REPLACE FUNCTION public.grant_welcome_coins_for_new_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Anonymous users cannot claim welcome coins before verified conversion.
  if exists(select 1 from auth.users au where au.id=NEW.id and au.is_anonymous=true) then
    return NEW;
  end if;

  -- Prevent duplicate welcome coins (same style as welcome notification)
  if exists (
    select 1
    from public.user_coin_ledger l
    where l.user_id = NEW.id
      and (l.payload_json ->> 'system_key') = 'welcome_coins_v1'
  ) then
    return NEW;
  end if;

  -- Grant 20 coins as welcome gift
  perform public.apply_coin_delta(
    NEW.id,
    20,
    'welcome',
    jsonb_build_object(
      'system_key', 'welcome_coins_v1',
      'category', 'welcome',
      'welcome_amount', 20
    )
  );

  return NEW;
end;
$function$;

-- Existing Premium onboarding RPC, now guest-ineligible:
CREATE OR REPLACE FUNCTION public.get_my_premium_trial_onboarding_v1(p_action text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  v_created timestamptz;
  v_email text;
  v_hash text;
  v_trial public.premium_welcome_trials_v1%rowtype;
  v_now timestamptz:=now();
  v_launch timestamptz;
  v_action text:=coalesce(p_action,'');
  v_started boolean:=false;
  v_claimed integer:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- Supabase anonymous users share the authenticated database role:
  -- verify the canonical auth.users flag, never user-editable metadata.
  if exists(select 1 from auth.users au where au.id=v_user and au.is_anonymous=true) then
    return jsonb_build_object('state','ineligible','reason','guest_account',
      'is_premium',false,'show_welcome',false,'show_expired',false);
  end if;

  select p.created_at, coalesce(nullif(trim(p.email),''),u.email)
  into v_created,v_email
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=v_user;
  if v_created is null then return jsonb_build_object('state','not_ready'); end if;
  select launched_at into v_launch from public.premium_trial_launch_v1 where id=true;
  v_hash:=md5(lower(trim(coalesce(v_email,v_user::text))));

  perform pg_advisory_xact_lock(hashtext('premium_welcome:'||v_user::text));
  select * into v_trial from public.premium_welcome_trials_v1 where user_id=v_user;

  if v_trial.user_id is null
    and not public.user_has_paid_premium_access_v1(v_user)
  then
    -- Retain only an irreversible-ish hash to limit repeated claims after
    -- deleting/re-registering the same email. No raw email is persisted here.
    insert into public.premium_trial_claim_history_v1(email_hash)
    values (v_hash) on conflict do nothing;
    get diagnostics v_claimed = row_count;
    if v_claimed=1 then
      insert into public.premium_welcome_trials_v1
        (user_id,account_email_hash,started_at,expires_at)
      values (v_user,v_hash,(case when v_created < v_launch then v_launch else v_now end),(case when v_created < v_launch then v_launch else v_now end)+interval '7 days')
      on conflict do nothing
      returning * into v_trial;
      v_started:=v_trial.user_id is not null;
    end if;
  end if;

  if v_trial.user_id is null then
    return jsonb_build_object('state','ineligible','is_premium',public.user_has_premium_access_v1(v_user));
  end if;

  if v_action='dismiss_welcome' then
    update public.premium_welcome_trials_v1
      set welcome_dismissed_at=coalesce(welcome_dismissed_at,v_now)
    where user_id=v_user;
  elsif v_action='dismiss_expired' then
    update public.premium_welcome_trials_v1
      set expiry_dismissed_at=coalesce(expiry_dismissed_at,v_now)
    where user_id=v_user and expires_at<=v_now;
  elsif v_action not in ('','status') then
    raise exception 'Unsupported onboarding action';
  end if;

  select * into v_trial from public.premium_welcome_trials_v1 where user_id=v_user;

  -- A subsequent paid subscription supersedes any promotional trial.
  -- Never display an expiry popup or send an expiry message to a payer.
  if public.user_has_paid_premium_access_v1(v_user) then
    return jsonb_build_object('state','subscribed','show_welcome',false,'show_expired',false);
  end if;

  if v_trial.expires_at <= v_now and v_trial.expiry_notified_at is null then
    perform public.create_user_game_notification_v1(
      v_user,'WELCOME_MESSAGE','Your Premium trial has ended',
      'Thanks for playing ProPeloton Manager! Your free Premium trial has ended. Your team and progress are safe. You can continue for free or explore Premium plans.',
      '/dashboard/pro',
      jsonb_build_object('system_key','premium_trial_expired_v1','category','premium_trial','kind','expired'),
      'premium_trial_expired:'||v_user::text
    );
    update public.premium_welcome_trials_v1 set expiry_notified_at=v_now where user_id=v_user;
  elsif v_trial.expires_at>v_now
     and v_trial.expires_at<=v_now+interval '24 hours'
     and v_trial.reminder_notified_at is null then
    perform public.create_user_game_notification_v1(
      v_user,'WELCOME_MESSAGE','Your Premium trial ends soon',
      'Your seven-day Premium trial ends within 24 hours. Enjoy your remaining access, or visit the Pro Package page to continue.',
      '/dashboard/pro',
      jsonb_build_object('system_key','premium_trial_reminder_v1','category','premium_trial','kind','reminder'),
      'premium_trial_reminder:'||v_user::text
    );
    update public.premium_welcome_trials_v1 set reminder_notified_at=v_now where user_id=v_user;
  end if;

  return jsonb_build_object(
    'state',case when v_trial.expires_at>v_now then 'active' else 'expired' end,
    'trial_started',v_started,
    'started_at',v_trial.started_at,'expires_at',v_trial.expires_at,
    'seconds_left',greatest(0,ceil(extract(epoch from v_trial.expires_at-greatest(v_now,v_trial.started_at)))),
    'show_welcome',v_trial.welcome_dismissed_at is null and v_trial.expires_at>v_now,
    'show_expired',v_trial.expiry_dismissed_at is null and v_trial.expires_at<=v_now
  );
end;
$function$;

-- Existing club creation RPC, now blocking anonymous official clubs:
CREATE OR REPLACE FUNCTION public.create_club(p_name text, p_country_code text, p_primary_color text, p_secondary_color text, p_logo_path text DEFAULT NULL::text, p_motto text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_existing_club uuid;
  v_club_id uuid;

  v_name text;
  v_country_code text;
  v_primary_color text;
  v_secondary_color text;
  v_logo_path text;
  v_motto text;

  v_final_cash_balance numeric := 0;

  v_stage text := 'start';
  v_msg text;
  v_detail text;
  v_hint text;
  v_constraint text;
  v_table text;
begin
  v_stage := 'auth.uid';
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be authenticated to create a club.';
  end if;

  -- Guest sessions may preview game mechanics but cannot own
  -- official multiplayer clubs without converting to a verified identity.
  if exists(select 1 from auth.users au where au.id=v_user_id and au.is_anonymous=true) then
    raise exception 'Guest players cannot create an official club until they convert to a verified account.';
  end if;

  v_stage := 'lock profile';
  perform 1
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found for authenticated user.';
  end if;

  v_stage := 'club creation gate';
  if not public.is_current_user_club_creation_exception_v1() then
    raise exception 'New club creation is temporarily disabled.';
  end if;

  v_stage := 'check existing club';
  select c.id
  into v_existing_club
  from public.clubs c
  where c.owner_user_id = v_user_id
  limit 1;

  if v_existing_club is not null then
    raise exception 'This account already owns a club.';
  end if;

  v_stage := 'normalize inputs';
  v_name := btrim(coalesce(p_name, ''));
  v_country_code := upper(btrim(coalesce(p_country_code, '')));
  v_primary_color := btrim(coalesce(p_primary_color, ''));
  v_secondary_color := btrim(coalesce(p_secondary_color, ''));
  v_logo_path := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_motto := nullif(btrim(coalesce(p_motto, '')), '');

  if v_name = '' or char_length(v_name) < 3 or char_length(v_name) > 40 then
    raise exception 'Club name must be between 3 and 40 characters.';
  end if;

  if v_country_code = '' then
    raise exception 'Country code is required.';
  end if;

  if v_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Primary color must be a hex color like #F3C623.';
  end if;

  if v_secondary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Secondary color must be a hex color like #111216.';
  end if;

  if lower(v_primary_color) = lower(v_secondary_color) then
    raise exception 'Primary and secondary colors must be different.';
  end if;

  v_stage := 'validate country';
  if not exists (
    select 1
    from public.countries
    where code = v_country_code
      and is_selectable = true
  ) then
    raise exception 'Invalid or unavailable country code.';
  end if;

  v_stage := 'insert clubs';

  insert into public.clubs (
    owner_user_id,
    name,
    country_code,
    primary_color,
    secondary_color,
    logo_path,
    motto,
    world_tier,
    club_tier,
    tier2_division,
    reputation,
    is_ai,
    is_active,
    club_type
  )
  values (
    v_user_id,
    v_name,
    v_country_code,
    v_primary_color,
    v_secondary_color,
    v_logo_path,
    v_motto,
    3,
    'proteam'::public.club_tier,
    'PRO_EAST',
    0,
    false,
    true,
    'main'
  )
  returning id into v_club_id;

  v_stage := 'insert club_memberships';
  insert into public.club_memberships (club_id, user_id, role)
  values (v_club_id, v_user_id, 'owner')
  on conflict do nothing;

  v_stage := 'insert club_settings';
  insert into public.club_settings (club_id)
  values (v_club_id)
  on conflict (club_id) do nothing;

  v_stage := 'finance_setup_new_club';
  if to_regprocedure('public.finance_setup_new_club(uuid)') is not null then
    perform public.finance_setup_new_club(v_club_id);
  end if;

  v_stage := 'final new club balance setup';
  perform public.apply_new_club_creation_balance_v1(v_club_id, true);

  -- Extra safety: sync finance summary after finalizer.
  v_stage := 'sync club_finance_summary';
  select coalesce(c.cash_balance, 0)
  into v_final_cash_balance
  from public.clubs c
  where c.id = v_club_id;

  insert into public.club_finance_summary (club_id, current_balance)
  values (v_club_id, v_final_cash_balance)
  on conflict (club_id) do update
  set current_balance = excluded.current_balance;

  v_stage := 'update profiles';
  update public.profiles
  set has_created_club = true
  where id = v_user_id;

  return v_club_id;

exception
  when others then
    get stacked diagnostics
      v_msg = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint,
      v_constraint = constraint_name,
      v_table = table_name;

    raise exception
      'create_club failed at stage=% | sqlstate=% | msg=% | table=% | constraint=% | detail=% | hint=%',
      v_stage,
      SQLSTATE,
      coalesce(v_msg, '?'),
      coalesce(v_table, '?'),
      coalesce(v_constraint, '?'),
      coalesce(v_detail, '?'),
      coalesce(v_hint, '?');
end;
$function$;


-- Deliberately never enable the gate in migrations. Sign-off on a separate
-- rollout after production-to-staging behavioral and abuse tests.
