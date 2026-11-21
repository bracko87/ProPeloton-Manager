\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture ONLY. No Supabase Auth/HTTP, production data,
-- network, or full game schema. Actual Saturn migration files are loaded below.
do $$ begin
  if current_database() <> 'saturn_bootstrap_probe'
    or to_regclass('public.clubs') is not null then
    raise exception 'Refusing to run outside fresh disposable test database';
  end if;
end $$;
begin;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema fixture;
create table auth.users(id uuid primary key,is_anonymous boolean not null,email text,email_confirmed_at timestamptz,encrypted_password text);
create table auth.identities(user_id uuid references auth.users(id),provider text);
-- Explicit fixture stand-in for Supabase Auth's JWT subject accessor.
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('fixture.subject', true),'')::uuid
$$;
grant usage on schema auth,fixture to authenticated,anon;
create function fixture.assert_ok(ok boolean, description text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %',description; end if;
  raise notice 'PASS: %',description;
end $$;
create function fixture.uid(n integer) returns uuid language sql immutable as $$
 select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
create table public.clubs(id uuid primary key,owner_user_id uuid references auth.users(id),is_ai boolean default false,is_active boolean default true,club_type text default 'main',name text default 'Fixture');
create table public.club_memberships(club_id uuid references public.clubs(id),user_id uuid references auth.users(id),role text);
create table public.club_equipment_inventory(club_id uuid, marker text);
create table public.club_finance_summary(club_id uuid, marker text);
create table public.club_infrastructure(club_id uuid, marker text);
create table public.club_staff(club_id uuid, marker text);
create table public.rider_regular_training_daily_plans(club_id uuid,marker text);
create table public.rider_regular_training_management(club_id uuid,marker text);
create table public.races(id uuid primary key,status text, national boolean default false);
create table public.race_entry_rules(race_id uuid,applications_status text);
create table public.club_race_commitment_scores(club_id uuid,score integer);
create table public.race_team_entries(id uuid primary key,race_id uuid,club_id uuid,status text,commitment_score_snapshot integer,acceptance_score integer,review_round integer,decision_reason text,reviewed_at timestamptz,final_decision_at timestamptz,withdrawn_at timestamptz,missed_startlist_at timestamptz,created_at timestamptz,updated_at timestamptz);
create function public.get_my_primary_club_id() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.clubs where owner_user_id=auth.uid() and club_type='main' limit 1
$$;
create function public.club_race_application_allowed_v1(p_race_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not national from public.races where id=p_race_id
$$;

-- Deliberately representative, not production, permissive owner policies.
alter table public.clubs enable row level security;
create policy fixture_club_owner on public.clubs for all to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid());
grant select,insert,update,delete on public.clubs to authenticated;
\ir ../../migrations/20261120140000_saturn_14day_full_game_test_account_lifecycle_v1.sql
\ir ../../migrations/20261120170000_saturn_active_test_race_application_guard_v1.sql
\ir ../../migrations/20261120184500_saturn_expired_guest_direct_table_write_rls_v1.sql
\ir ../../migrations/20261120223000_saturn_finalize_same_uuid_email_conversion_v1.sql
\ir ../../migrations/20261120233000_saturn_finalize_same_uuid_google_conversion_v1.sql

-- 1 active guest, 2 exactly expired linked email, 3 expired linked Google,
-- 4 permanent, 5 anonymous before any team, 6 future-dated guest,
-- 7 expired still-anonymous, 8 linked email without credential.
insert into auth.users(id,is_anonymous,email,email_confirmed_at,encrypted_password)
select fixture.uid(n),n in(1,5,6,7),
 case when n in(2,8) then 'fixture@example.invalid' end,
 case when n in(2,8) then now() end,
 case when n=2 then 'fixture-not-a-real-password-hash' end
from generate_series(1,8) n;
insert into auth.identities values(fixture.uid(3),'google');
insert into public.clubs(id,owner_user_id) select fixture.uid(100+n),fixture.uid(n) from generate_series(1,8) n where n<>5;
insert into public.club_memberships select id,owner_user_id,'owner' from public.clubs;
insert into public.saturn_test_accounts_v1(user_id,club_id,started_at,premium_ends_at,expires_at)
select fixture.uid(n),fixture.uid(n+100),s,s+interval '168 hours',s+interval '336 hours'
from (select n,now()+case n when 1 then interval '-24 hours' when 2 then interval '-336 hours' when 6 then interval '1 hour' else interval '-337 hours' end s from (values(1),(2),(3),(6),(7),(8)) x(n)) y;
insert into public.races values(fixture.uid(201),'scheduled',false),(fixture.uid(202),'scheduled',true);
insert into public.race_entry_rules values(fixture.uid(201),'open'),(fixture.uid(202),'open');
-- Use explicit subject only on the disposable server. All access checks below
-- run with the PostgreSQL authenticated role, not the migration owner.
set local role authenticated;
select set_config('fixture.subject',fixture.uid(1)::text,true);
select fixture.assert_ok((select count(*)=1 from public.saturn_test_accounts_v1),'active guest sees only own term');
select fixture.assert_ok((public.apply_for_race_v1(fixture.uid(201),fixture.uid(101))->>'success')::boolean,'active guest enters normal race');
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(104))->>'error'='test_account_ineligible_or_expired','active guest cannot enter another club');
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(202),fixture.uid(101))->>'error'='club_applications_not_allowed','national competition stays blocked');
select fixture.assert_ok((public.cancel_race_application_v1(fixture.uid(201),fixture.uid(101))->>'success')::boolean,'active guest can withdraw own entry');
select fixture.assert_ok(public.cancel_race_application_v1(fixture.uid(201),fixture.uid(104))->>'error'='test_account_ineligible_or_expired','active guest cannot cancel another club entry');
with changed as (update public.clubs set name='Active changed' where id=fixture.uid(101) returning id)
select fixture.assert_ok(count(*)=1,'active guest can update own club') from changed;
do $$ begin
  begin
    update public.saturn_test_accounts_v1 set converted_at=now();
    raise exception 'FAIL: trial clock update unexpectedly allowed';
  exception when insufficient_privilege then raise notice 'PASS: direct term update denied'; end;
  begin
    perform public.saturn_test_account_can_mutate_v1(fixture.uid(101));
    raise exception 'FAIL: private helper unexpectedly executable';
  exception when insufficient_privilege then raise notice 'PASS: private helper not directly executable'; end;
end $$;
select set_config('fixture.subject',fixture.uid(2)::text,true);
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(102))->>'error'='test_account_ineligible_or_expired','exact 336h and linked email cannot enter');
select fixture.assert_ok(public.cancel_race_application_v1(fixture.uid(201),fixture.uid(102))->>'error'='test_account_ineligible_or_expired','exact 336h cannot withdraw');
select fixture.assert_ok((select count(*)=1 from public.clubs where id=fixture.uid(102)),'expired club remains readable');
with changed as (update public.clubs set name='Blocked' where id=fixture.uid(102) returning id)
select fixture.assert_ok(count(*)=0,'expired linked identity cannot update club') from changed;
with changed as (delete from public.clubs where id=fixture.uid(102) returning id)
select fixture.assert_ok(count(*)=0,'expired linked identity cannot delete club') from changed;
select fixture.assert_ok((public.saturn_finalize_test_account_email_conversion_v1()->>'converted')::boolean,'verified email finalizer restores original expired account');
select fixture.assert_ok(public.saturn_finalize_test_account_email_conversion_v1()->>'premium_restarted'='false','repeat conversion does not restart Premium');
select fixture.assert_ok((select club_id=fixture.uid(102) and expires_at=now() and premium_ends_at=now()-interval '168 hours' and converted_at is not null from public.saturn_test_accounts_v1),'email conversion preserves UUID club and original dates');
with changed as (update public.clubs set name='Converted changed' where id=fixture.uid(102) returning id)
select fixture.assert_ok(count(*)=1,'converted account can update own club') from changed;
select fixture.assert_ok((public.apply_for_race_v1(fixture.uid(201),fixture.uid(102))->>'success')::boolean,'converted account can enter race');
select set_config('fixture.subject',fixture.uid(3)::text,true);
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(103))->>'error'='test_account_ineligible_or_expired','linked Google identity remains expired before finalization');
select fixture.assert_ok(public.saturn_finalize_test_account_google_conversion_v1()->>'provider'='google','Google canonical identity finalizer succeeds');
select fixture.assert_ok((select club_id=fixture.uid(103) and expires_at=now()-interval '1 hour' and converted_at is not null from public.saturn_test_accounts_v1),'Google conversion preserves original club and deadline');
select fixture.assert_ok((public.apply_for_race_v1(fixture.uid(201),fixture.uid(103))->>'success')::boolean,'Google-converted account can enter race');
select set_config('fixture.subject',fixture.uid(4)::text,true);
select fixture.assert_ok((select count(*)=0 from public.saturn_test_accounts_v1),'ordinary manager cannot read other trial records');
select fixture.assert_ok((public.apply_for_race_v1(fixture.uid(201),fixture.uid(104))->>'success')::boolean,'ordinary manager retains race entry');
with changed as (update public.clubs set name='Ordinary changed' where id=fixture.uid(104) returning id)
select fixture.assert_ok(count(*)=1,'ordinary manager retains existing owner write') from changed;
do $$ begin
  begin
    perform public.saturn_finalize_test_account_email_conversion_v1();
    raise exception 'FAIL: unrelated account finalized trial';
  exception when insufficient_privilege then raise notice 'PASS: unrelated user cannot finalize another trial'; end;
end $$;
select set_config('fixture.subject',fixture.uid(5)::text,true);
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(104))->>'error'='test_account_ineligible_or_expired','anonymous pre-team identity cannot enter another club');
select fixture.assert_ok(public.cancel_race_application_v1(fixture.uid(201),fixture.uid(104))->>'error'='test_account_ineligible_or_expired','anonymous pre-team identity cannot withdraw another club');
select set_config('fixture.subject',fixture.uid(6)::text,true);
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(106))->>'error'='test_account_ineligible_or_expired','future-dated trial is ineligible');
select set_config('fixture.subject',fixture.uid(7)::text,true);
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(107))->>'error'='test_account_ineligible_or_expired','expired anonymous trial cannot enter');
do $$ begin
  begin
    perform public.saturn_finalize_test_account_google_conversion_v1();
    raise exception 'FAIL: anonymous identity finalized Google';
  exception when insufficient_privilege then raise notice 'PASS: anonymous identity cannot finalize Google'; end;
end $$;
select set_config('fixture.subject',fixture.uid(8)::text,true);
do $$ begin
  begin
    perform public.saturn_finalize_test_account_email_conversion_v1();
    raise exception 'FAIL: passwordless email finalized';
  exception when insufficient_privilege then raise notice 'PASS: passwordless linked email cannot finalize'; end;
end $$;
select set_config('fixture.subject',fixture.uid(999)::text,true);
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(104))->>'error'='test_account_ineligible_or_expired','missing Auth identity denied');
select set_config('fixture.subject','',true);
select fixture.assert_ok(public.apply_for_race_v1(fixture.uid(201),fixture.uid(104))->>'error'='auth_required','missing subject denied');
reset role;
select fixture.assert_ok((select count(*)=4 from public.race_team_entries),'only expected authorized entries exist');
select fixture.assert_ok((select count(*)=6 from public.saturn_test_accounts_v1),'no new terms created by conversion');

-- Youth Academy entitlement fixture. Real production entitlement reader and
-- exact training writer from draft migration; synthetic billing and game date.
reset role;
alter table public.clubs add column deleted_at timestamptz, add column parent_club_id uuid;
create schema private;
create table public.youth_academies(id uuid primary key,club_id uuid,is_active boolean,renewed_through_season integer,activated_season integer);
create table public.youth_academy_settings(academy_id uuid primary key,training_philosophy text,updated_at timestamptz);
create table private.youth_effective_settings_v1(academy_id uuid,training_decider text);
create table fixture.paid_access(user_id uuid primary key);
create function public.user_has_paid_premium_access_v1(p_user_id uuid) returns boolean language sql stable security definer as $$select exists(select 1 from fixture.paid_access where user_id=p_user_id)$$;
create function public.get_current_season_number() returns integer language sql stable as $$select 2$$;
create function public.user_has_youth_academy_access_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
 select p_user_id is not null and exists(select 1 from auth.users u where u.id=p_user_id and u.is_anonymous is false)
 and not exists(select 1 from public.saturn_test_accounts_v1 t where t.user_id=p_user_id and t.converted_at is null)
 and public.user_has_paid_premium_access_v1(p_user_id)
 and exists(select 1 from public.clubs c join public.youth_academies a on a.club_id=c.id and a.is_active=true
 where c.owner_user_id=p_user_id and c.deleted_at is null and c.parent_club_id is null
 and coalesce(c.club_type,'main')<>'developing'
 and coalesce(a.renewed_through_season,a.activated_season,0)>=coalesce(public.get_current_season_number(),1));
$$;
create function public.get_my_youth_academy_v1() returns jsonb language sql stable security definer as $$
 select jsonb_build_object('training_philosophy',s.training_philosophy) from public.youth_academy_settings s join public.youth_academies a on a.id=s.academy_id join public.clubs c on c.id=a.club_id where c.owner_user_id=auth.uid()
$$;
-- Exact snapshot of one draft writer; wider Academy integration remains open.
CREATE OR REPLACE FUNCTION public.update_my_youth_training_philosophy_v1(p_training_philosophy text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- An email/Google-linked but unconverted Saturn identity remains subject
  -- to its original 14-day expiry and own-club restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())
  then
    raise exception 'Test account expired or not authorized for Youth Academy'
      using errcode='42501';
  end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;
  if p_training_philosophy not in ('freshness','balanced','development') then
    raise exception 'Invalid Youth Academy training philosophy';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  if exists(select 1 from private.youth_effective_settings_v1 where academy_id=v_academy_id and training_decider<>'manager') then raise exception 'Training is delegated to the U16 Head Coach'; end if;

  update public.youth_academy_settings
  set training_philosophy=p_training_philosophy,
      updated_at=now()
  where academy_id=v_academy_id;

  return public.get_my_youth_academy_v1();
end;
$function$;


insert into public.youth_academies select fixture.uid(500+n),fixture.uid(100+n),true,2,1 from unnest(array[1,2,4,7,8]) n;
insert into public.youth_academy_settings select id,'balanced',now() from public.youth_academies;
insert into private.youth_effective_settings_v1 select id,'manager' from public.youth_academies;
insert into fixture.paid_access select fixture.uid(n) from unnest(array[2,4,7,8]) n;
select fixture.assert_ok(not public.user_has_youth_academy_access_v1(fixture.uid(1)),'active guest with welcome Premium but no paid entitlement cannot access Academy');
select fixture.assert_ok(public.user_has_youth_academy_access_v1(fixture.uid(4)),'ordinary paid licensed manager retains Academy access');
update public.youth_academies set renewed_through_season=1 where id=fixture.uid(504);
select fixture.assert_ok(not public.user_has_youth_academy_access_v1(fixture.uid(4)),'expired Academy licence denies access even with paid Premium');
update public.youth_academies set renewed_through_season=2 where id=fixture.uid(504);
set local role authenticated;
select set_config('fixture.subject',fixture.uid(1)::text,true);
do $$ begin
 perform public.update_my_youth_training_philosophy_v1('development');
 raise exception 'FAIL: welcome-only manager modified Academy';
exception when others then
 if sqlerrm not like 'Premium membership is required%' then raise; end if;
 raise notice 'PASS: welcome-only guest cannot modify Academy';
end $$;
reset role;
insert into fixture.paid_access values(fixture.uid(1));
set local role authenticated;
do $$ begin
 perform public.update_my_youth_training_philosophy_v1('development');
 raise exception 'FAIL: unconverted paid guest modified Academy';
exception when others then
 if sqlerrm not like 'Premium membership is required%' then raise; end if;
 raise notice 'PASS: active paid unconverted guest cannot modify Academy';
end $$;
select set_config('fixture.subject',fixture.uid(7)::text,true);
do $$ begin
 perform public.update_my_youth_training_philosophy_v1('development');
 raise exception 'FAIL: expired guest modified Academy';
exception when insufficient_privilege then
 if sqlerrm not like 'Test account expired%' then raise; end if;
 raise notice 'PASS: expired anonymous paid manager cannot modify Academy';
end $$;
select fixture.assert_ok(public.get_my_youth_academy_v1()->>'training_philosophy'='balanced','expired guest retains fixture Academy read access');
select set_config('fixture.subject',fixture.uid(8)::text,true);
do $$ begin
 perform public.update_my_youth_training_philosophy_v1('development');
 raise exception 'FAIL: expired linked manager modified Academy';
exception when insufficient_privilege then
 if sqlerrm not like 'Test account expired%' then raise; end if;
 raise notice 'PASS: expired linked unconverted paid manager cannot modify Academy';
end $$;
select set_config('fixture.subject',fixture.uid(2)::text,true);
select fixture.assert_ok(public.update_my_youth_training_philosophy_v1('freshness')->>'training_philosophy'='freshness','converted paid licensed manager retains Academy write');
select set_config('fixture.subject',fixture.uid(4)::text,true);
select fixture.assert_ok(public.update_my_youth_training_philosophy_v1('development')->>'training_philosophy'='development','ordinary paid licensed manager retains Academy write');
reset role;
select fixture.assert_ok((select count(*)=3 from public.youth_academy_settings where training_philosophy='balanced'),'expired managers did not change Academy settings');


-- Runtime verification of the exact registration rules from the draft migration.
-- Existing welcome reward routine captured read-only from production; minimal
-- synthetic wallet/ledger schema. No payments, real user records or network.
create table public.user_wallets(user_id uuid primary key,balance integer not null,updated_at timestamptz);
create table public.user_coin_ledger(user_id uuid,delta integer,reason text,payload_json jsonb);
create function fixture.expect_registration_denial(cmd text, description text) returns void language plpgsql as $fixture$
begin
  begin
    execute cmd;
  exception when insufficient_privilege then
    if sqlerrm not like 'Complete registration%' then raise; end if;
    raise notice 'PASS: %',description;
    return;
  end;
  raise exception 'FAIL: %',description;
end;
$fixture$;

CREATE OR REPLACE FUNCTION public.apply_coin_delta(p_user_id uuid, p_delta integer, p_reason text, p_payload_json jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload jsonb;
  v_system_key text;
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_delta IS NULL THEN
    RAISE EXCEPTION 'p_delta is required';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'p_reason is required';
  END IF;

  v_payload := COALESCE(
    p_payload_json,
    '{}'::jsonb
  );

  v_system_key := NULLIF(
    btrim(
      COALESCE(
        v_payload ->> 'system_key',
        ''
      )
    ),
    ''
  );

  /*
   * Ensure the wallet exists before locking it.
   */
  INSERT INTO public.user_wallets (
    user_id,
    balance
  )
  VALUES (
    p_user_id,
    0
  )
  ON CONFLICT (user_id) DO NOTHING;

  /*
   * Serialize all wallet changes for this user.
   */
  SELECT w.balance
  INTO v_current_balance
  FROM public.user_wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Wallet could not be loaded for user %.',
      p_user_id;
  END IF;

  /*
   * Automated transactions carrying the same system key are idempotent.
   * A repeated Stripe webhook or Premium invoice does nothing.
   */
  IF v_system_key IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.user_coin_ledger l
       WHERE l.user_id = p_user_id
         AND l.payload_json ->> 'system_key' =
           v_system_key
     )
  THEN
    RETURN;
  END IF;

  v_new_balance :=
    v_current_balance + p_delta;

  /*
   * Never silently clamp an insufficient debit to zero.
   */
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION
      'Insufficient coins. Current balance: %, requested delta: %.',
      v_current_balance,
      p_delta
      USING ERRCODE = 'P0001';
  END IF;

  /*
   * Insert the exact applied delta.
   * If this insert fails, the wallet is not changed.
   */
  INSERT INTO public.user_coin_ledger (
    user_id,
    delta,
    reason,
    payload_json
  )
  VALUES (
    p_user_id,
    p_delta,
    btrim(p_reason),
    v_payload
  );

  UPDATE public.user_wallets
  SET balance = v_new_balance
  WHERE user_id = p_user_id;

  RETURN;
END;
$function$;

-- Registration rules snapshot kept identical to migration by node test.
-- Updated Saturn product decision: no Coins, payments, U16 Academy or U23
-- Developing Team before verified registration. Welcome Premium may still
-- expose included non-paid tools. All restrictions survive identity linking.
-- This is still an unshipped draft migration.
create or replace function private.saturn_is_permanently_registered_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $saturn$
  select p_user_id is not null
    and exists(select 1 from auth.users u where u.id=p_user_id and u.is_anonymous is false)
    and not exists(select 1 from public.saturn_test_accounts_v1 t
      where t.user_id=p_user_id and t.converted_at is null);
$saturn$;
revoke all on function private.saturn_is_permanently_registered_v1(uuid) from public,anon,authenticated;

-- Existing entitlement semantics retained for permanently registered users.
create or replace function public.user_has_youth_academy_access_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $saturn$
  select private.saturn_is_permanently_registered_v1(p_user_id)
    and public.user_has_paid_premium_access_v1(p_user_id)
    and exists(select 1 from public.clubs c
      join public.youth_academies a on a.club_id=c.id and a.is_active=true
      where c.owner_user_id=p_user_id and c.deleted_at is null
      and c.parent_club_id is null and coalesce(c.club_type,'main')<>'developing'
      and coalesce(a.renewed_through_season,a.activated_season,0)>=coalesce(public.get_current_season_number(),1));
$saturn$;

-- Enforce the no-Coins rule even when an internal reward/purchase routine,
-- service or overlooked browser endpoint attempts to bypass UI controls.
-- Zero-balance wallet initialization remains allowed.
create or replace function private.saturn_guard_coin_ledger_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if not private.saturn_is_permanently_registered_v1(new.user_id) then
    raise exception 'Complete registration before receiving or spending Coins' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_coin_ledger_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_coin_ledger_v1 on public.user_coin_ledger;
create trigger saturn_guard_coin_ledger_v1 before insert or update on public.user_coin_ledger
for each row execute function private.saturn_guard_coin_ledger_v1();
create or replace function private.saturn_guard_wallet_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if coalesce(new.balance,0)<>0 and not private.saturn_is_permanently_registered_v1(new.user_id) then
    raise exception 'Complete registration before receiving or spending Coins' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_wallet_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_wallet_v1 on public.user_wallets;
create trigger saturn_guard_wallet_v1 before insert or update on public.user_wallets
for each row execute function private.saturn_guard_wallet_v1();

-- Prevent creation through alternate SQL paths, not just paywall buttons.
-- Existing ordinary senior club creation and AI clubs are unaffected.
create or replace function private.saturn_guard_developing_club_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if new.club_type='developing' and new.owner_user_id is not null
      and not private.saturn_is_permanently_registered_v1(new.owner_user_id) then
    raise exception 'Complete registration before developing-team activation' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_developing_club_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_developing_club_v1 on public.clubs;
create trigger saturn_guard_developing_club_v1 before insert or update of club_type,owner_user_id on public.clubs
for each row execute function private.saturn_guard_developing_club_v1();
create or replace function private.saturn_guard_youth_academy_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if exists(select 1 from public.clubs c where c.id=new.club_id and c.owner_user_id is not null
    and not private.saturn_is_permanently_registered_v1(c.owner_user_id)) then
    raise exception 'Complete registration before Youth Academy activation' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_youth_academy_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_youth_academy_v1 on public.youth_academies;
create trigger saturn_guard_youth_academy_v1 before insert or update of club_id,is_active on public.youth_academies
for each row execute function private.saturn_guard_youth_academy_v1();

-- The usual 20-Coin gift is deferred until successful permanent conversion,
-- not awarded at anonymous signup or identity linking. Same existing
-- idempotency key as permanent registration; retries cannot award twice.
create or replace function private.saturn_grant_deferred_welcome_coins_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if old.converted_at is null and new.converted_at is not null then
    if not private.saturn_is_permanently_registered_v1(new.user_id) then
      raise exception 'Permanent registration is not verified' using errcode='42501';
    end if;
    perform public.apply_coin_delta(new.user_id,20,'welcome',
      jsonb_build_object('system_key','welcome_coins_v1','category','welcome','welcome_amount',20));
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_grant_deferred_welcome_coins_v1() from public,anon,authenticated;
drop trigger if exists saturn_grant_deferred_welcome_coins_v1 on public.saturn_test_accounts_v1;
create trigger saturn_grant_deferred_welcome_coins_v1 after update of converted_at on public.saturn_test_accounts_v1
for each row execute function private.saturn_grant_deferred_welcome_coins_v1();
-- END SATURN REGISTRATION RULES SNAPSHOT

select fixture.assert_ok(not private.saturn_is_permanently_registered_v1(fixture.uid(1)) and not private.saturn_is_permanently_registered_v1(fixture.uid(8)) and not private.saturn_is_permanently_registered_v1(fixture.uid(5)),'anonymous, linked-unconverted and pre-team users denied paid services');
select fixture.assert_ok(private.saturn_is_permanently_registered_v1(fixture.uid(2)) and private.saturn_is_permanently_registered_v1(fixture.uid(4)),'converted and ordinary users eligible for paid services');
select fixture.assert_ok(not private.saturn_is_permanently_registered_v1(fixture.uid(999)) and not private.saturn_is_permanently_registered_v1(null),'missing identity cannot receive paid services');
select fixture.assert_ok(not has_function_privilege('authenticated','private.saturn_is_permanently_registered_v1(uuid)','EXECUTE'),'browser cannot execute private registration helper');
insert into public.user_wallets(user_id,balance) values(fixture.uid(1),0),(fixture.uid(8),0),(fixture.uid(5),0);
select fixture.expect_registration_denial($q$select public.apply_coin_delta(fixture.uid(1),20,'welcome','{"system_key":"welcome_coins_v1"}')$q$,'guest cannot receive welcome coins even via privileged reward routine');
select fixture.expect_registration_denial($q$select public.apply_coin_delta(fixture.uid(8),20,'welcome','{"system_key":"welcome_coins_v1"}')$q$,'linked unconverted manager cannot receive welcome coins');
select fixture.expect_registration_denial($q$insert into public.user_coin_ledger values(fixture.uid(1),-1,'purchase','{}')$q$,'guest cannot insert spending ledger entry via privileged path');
select fixture.expect_registration_denial($q$update public.user_wallets set balance=1 where user_id=fixture.uid(1)$q$,'guest cannot obtain coins via direct wallet update');
select fixture.expect_registration_denial($q$insert into public.user_wallets(user_id,balance) values(fixture.uid(7),20)$q$,'expired guest cannot be assigned a funded wallet');
select fixture.expect_registration_denial($q$insert into public.clubs(id,owner_user_id,club_type) values(fixture.uid(701),fixture.uid(1),'developing')$q$,'guest cannot create developing club via privileged path');
select fixture.expect_registration_denial($q$update public.clubs set club_type='developing' where id=fixture.uid(108)$q$,'linked unconverted manager cannot change senior club into developing club');
select fixture.expect_registration_denial($q$insert into public.youth_academies values(fixture.uid(701),fixture.uid(101),true,2,2)$q$,'guest cannot create Academy via privileged path');
select fixture.expect_registration_denial($q$update public.youth_academies set is_active=true where id=fixture.uid(508)$q$,'linked unconverted manager cannot activate Academy');
select fixture.assert_ok((select count(*)=0 from public.user_coin_ledger) and (select sum(balance)=0 from public.user_wallets),'all rejected coin operations leave zero balances and no ledger rows');
-- Link the existing identity using synthetic verified Auth data; call the actual
-- finalizers under the browser role and exercise the deferred reward trigger.
update auth.users set encrypted_password='fixture-password-hash' where id=fixture.uid(8);
update auth.users set is_anonymous=false where id=fixture.uid(1);
insert into auth.identities values(fixture.uid(1),'google');
set local role authenticated;
select set_config('fixture.subject',fixture.uid(8)::text,true);
select fixture.assert_ok((public.saturn_finalize_test_account_email_conversion_v1()->>'converted')::boolean,'email conversion with deferred welcome reward succeeds');
select fixture.assert_ok((public.saturn_finalize_test_account_email_conversion_v1()->>'converted')::boolean,'email conversion retry succeeds');
select set_config('fixture.subject',fixture.uid(1)::text,true);
select fixture.assert_ok((public.saturn_finalize_test_account_google_conversion_v1()->>'converted')::boolean,'Google conversion with deferred welcome reward succeeds');
select fixture.assert_ok((public.saturn_finalize_test_account_google_conversion_v1()->>'converted')::boolean,'Google conversion retry succeeds');
reset role;
select fixture.assert_ok((select count(*)=2 from public.user_coin_ledger where delta=20 and reason='welcome' and payload_json->>'system_key'='welcome_coins_v1') and (select sum(balance)=40 from public.user_wallets),'exactly one 20-Coin welcome reward per converted identity');
select fixture.assert_ok((select count(*)=2 from public.saturn_test_accounts_v1 where (user_id=fixture.uid(1) and club_id=fixture.uid(101) or user_id=fixture.uid(8) and club_id=fixture.uid(108)) and converted_at is not null and expires_at=started_at+interval '336 hours' and premium_ends_at=started_at+interval '168 hours'),'conversion preserves original club and trial periods');
select public.apply_coin_delta(fixture.uid(1),-5,'fixture_paid_action','{"system_key":"fixture_spend"}');
select public.apply_coin_delta(fixture.uid(4),20,'welcome','{"system_key":"welcome_coins_v1"}');
select fixture.assert_ok((select balance=15 from public.user_wallets where user_id=fixture.uid(1)) and (select balance=20 from public.user_wallets where user_id=fixture.uid(4)),'converted user can spend and ordinary user can receive coins');
select fixture.expect_registration_denial($q$update public.user_coin_ledger set user_id=fixture.uid(7) where user_id=fixture.uid(4)$q$,'cannot reassign an existing ledger credit to an unregistered user');
insert into public.clubs(id,owner_user_id,club_type) values(fixture.uid(702),fixture.uid(1),'developing');
insert into public.youth_academies values(fixture.uid(702),fixture.uid(108),true,2,2);
select fixture.assert_ok(exists(select 1 from public.clubs where id=fixture.uid(702)) and exists(select 1 from public.youth_academies where id=fixture.uid(702)),'registration guard permits existing licensed activation pathways after conversion');


-- Season-reward scheduler fixture: actual patched coordinator, synthetic ranking,
-- finance, notification and reward destinations. No real season is advanced.
create role service_role nologin;
grant usage on schema fixture,auth to service_role;
create function auth.role() returns text language sql stable as $$select current_setting('role',true)$$;
create table public.team_ranking_season_snapshots(season_number integer);
insert into public.team_ranking_season_snapshots values(1);
create table public.season_reward_guard(source_season integer primary key,granted_at timestamptz);
create table public.club_season_reward_grants(id uuid primary key default gen_random_uuid(),source_season integer,granted_in_season integer,club_id uuid,club_tier text,division_name text,final_position integer,cash_total bigint,coin_total integer,reward_details jsonb,finance_transaction_id uuid,coin_transaction_id uuid,notification_id bigint);
create table public.season_reward_runs(source_season integer,started_at timestamptz,finished_at timestamptz,success boolean,message text,awards_created_count integer,total_cash bigint,total_coins integer);
create table fixture.cash_award(id uuid primary key default gen_random_uuid(),club_id uuid,cash bigint,metadata jsonb);
create table fixture.reward_notice(id bigint generated always as identity,user_id uuid,cash bigint,coins integer,details jsonb);
create function public.run_competition_rewards_v2(p_source_season integer,p_preview boolean)
returns table(club_id uuid,club_name text,division text,snapshot_tier text,final_position integer,cash_total bigint,coin_total integer,reward_details jsonb,owner_user_id uuid)
language sql stable as $$
 select fixture.uid(100+n), 'Fixture '||n, 'Fixture division','amateur',n,1000::bigint,5,
 '[{"code":"base","cash":1000,"coins":5},{"code":"other","cash":0,"coins":0}]'::jsonb, fixture.uid(n)
 from unnest(array[4,6,7,8]) n
$$;
create function public.finance_grant_competition_reward(p_club_id uuid,p_cash bigint,p_source_season integer,p_grant_id uuid,p_metadata jsonb) returns uuid language sql as $$
 insert into fixture.cash_award(club_id,cash,metadata) values(p_club_id,p_cash,p_metadata) returning id
$$;
create function public.grant_competition_reward_coins_v1(p_user_id uuid,p_coin_total integer,p_reward_grant_id uuid,p_source_season integer,p_metadata jsonb) returns uuid language plpgsql as $$
begin
 perform public.apply_coin_delta(p_user_id,p_coin_total,'competition_reward_coins',jsonb_build_object('system_key','fixture-season:'||p_reward_grant_id));
 return gen_random_uuid();
end;
$$;
create function public.create_competition_reward_notification_v1(p_user_id uuid,p_reward_grant_id uuid,p_source_season integer,p_granted_in_season integer,p_club_id uuid,p_club_name text,p_division text,p_snapshot_tier text,p_final_position integer,p_cash_total bigint,p_coin_total integer,p_reward_details jsonb)
returns bigint language sql as $$
 insert into fixture.reward_notice(user_id,cash,coins,details) values(p_user_id,p_cash_total,p_coin_total,p_reward_details) returning id
$$;
-- BEGIN SATURN SEASON AWARD FUNCTION SNAPSHOT

CREATE OR REPLACE FUNCTION public.apply_competition_rewards_v1(p_source_season integer)
 RETURNS TABLE(reward_grant_id uuid, club_id uuid, club_name text, division text, snapshot_tier text, final_position integer, cash_total bigint, coin_total integer, finance_transaction_id uuid, owner_user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_season integer;
  v_granted_in_season integer;
  v_started_at timestamptz := now();
  v_awards_created_count integer := 0;
  v_total_cash bigint := 0;
  v_total_coins integer := 0;
  v_reward_grant_id uuid;
  v_finance_transaction_id uuid;
  v_coin_transaction_id uuid;
  v_notification_id bigint;
  v_metadata jsonb;
  r record;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service_role can apply competition rewards';
  end if;

  if p_source_season is null or p_source_season <= 0 then
    raise exception 'p_source_season must be a positive integer';
  end if;

  if not exists (
    select 1
    from public.team_ranking_season_snapshots s
    where s.season_number = p_source_season
  ) then
    raise exception 'No team ranking snapshot exists for season %', p_source_season;
  end if;

  if exists (
    select 1
    from public.season_reward_guard g
    where g.source_season = p_source_season
  ) then
    raise exception 'Competition rewards already applied for source season %', p_source_season;
  end if;

  if exists (
    select 1
    from public.club_season_reward_grants g
    where g.source_season = p_source_season
  ) then
    raise exception 'Reward grant rows already exist for source season %', p_source_season;
  end if;

  select public.get_current_season_number()
  into v_current_season;

  v_granted_in_season := greatest(coalesce(v_current_season, 0), p_source_season + 1);

  if v_granted_in_season <= p_source_season then
    raise exception
      'Live reward apply requires current season to be after source season (source %, current/granted %)',
      p_source_season,
      v_granted_in_season;
  end if;

  for r in
    select *
    from public.run_competition_rewards_v2(p_source_season, true)
    order by division, final_position, club_name
  loop
    -- A temporary manager may still earn all normal senior-team cash awards.
    -- Suppress only Coins, including the award details, notification and totals.
    if r.owner_user_id is not null and not private.saturn_is_permanently_registered_v1(r.owner_user_id) then
      r.coin_total := 0;
      select coalesce(jsonb_agg(jsonb_set(d.value,'{coins}','0'::jsonb,true) order by d.ordinality),'[]'::jsonb)
        into r.reward_details
      from jsonb_array_elements(coalesce(r.reward_details,'[]'::jsonb)) with ordinality as d(value,ordinality);
    end if;
    v_reward_grant_id := null;
    v_finance_transaction_id := null;
    v_coin_transaction_id := null;
    v_notification_id := null;

    insert into public.club_season_reward_grants (
      source_season,
      granted_in_season,
      club_id,
      club_tier,
      division_name,
      final_position,
      cash_total,
      coin_total,
      reward_details
    )
    values (
      p_source_season,
      v_granted_in_season,
      r.club_id,
      r.snapshot_tier,
      r.division,
      r.final_position,
      r.cash_total,
      r.coin_total,
      r.reward_details
    )
    returning id into v_reward_grant_id;

    v_metadata :=
      jsonb_build_object(
        'source_season', p_source_season,
        'granted_in_season', v_granted_in_season,
        'reward_grant_id', v_reward_grant_id,
        'club_id', r.club_id,
        'club_name', r.club_name,
        'division', r.division,
        'snapshot_tier', r.snapshot_tier,
        'final_position', r.final_position,
        'cash_total', r.cash_total,
        'coin_total', r.coin_total,
        'reward_details', r.reward_details
      );

    if r.cash_total > 0 then
      v_finance_transaction_id :=
        public.finance_grant_competition_reward(
          r.club_id,
          r.cash_total,
          p_source_season,
          v_reward_grant_id,
          v_metadata
        );
    end if;

    if r.coin_total > 0 and r.owner_user_id is not null then
      v_coin_transaction_id :=
        public.grant_competition_reward_coins_v1(
          r.owner_user_id,
          r.coin_total,
          v_reward_grant_id,
          p_source_season,
          v_metadata
        );
    end if;

    if r.owner_user_id is not null then
      v_notification_id :=
        public.create_competition_reward_notification_v1(
          r.owner_user_id,
          v_reward_grant_id,
          p_source_season,
          v_granted_in_season,
          r.club_id,
          r.club_name,
          r.division,
          r.snapshot_tier,
          r.final_position,
          r.cash_total,
          r.coin_total,
          r.reward_details
        );
    end if;

    update public.club_season_reward_grants g
    set
      finance_transaction_id = v_finance_transaction_id,
      coin_transaction_id = v_coin_transaction_id,
      notification_id = v_notification_id
    where g.id = v_reward_grant_id;

    v_awards_created_count := v_awards_created_count + 1;
    v_total_cash := v_total_cash + r.cash_total;

    if r.owner_user_id is not null then
      v_total_coins := v_total_coins + r.coin_total;
    end if;

    reward_grant_id := v_reward_grant_id;
    club_id := r.club_id;
    club_name := r.club_name;
    division := r.division;
    snapshot_tier := r.snapshot_tier;
    final_position := r.final_position;
    cash_total := r.cash_total;
    coin_total := r.coin_total;
    finance_transaction_id := v_finance_transaction_id;
    owner_user_id := r.owner_user_id;

    return next;
  end loop;

  insert into public.season_reward_guard (
    source_season,
    granted_at
  )
  values (
    p_source_season,
    now()
  );

  insert into public.season_reward_runs (
    source_season,
    started_at,
    finished_at,
    success,
    message,
    awards_created_count,
    total_cash,
    total_coins
  )
  values (
    p_source_season,
    v_started_at,
    now(),
    true,
    format('Competition rewards applied for season %s', p_source_season),
    v_awards_created_count,
    v_total_cash,
    v_total_coins
  );

  return;
end;
$function$;

-- END SATURN SEASON AWARD FUNCTION SNAPSHOT
set local role authenticated;
do $$ begin
 perform public.apply_competition_rewards_v1(1);
 raise exception 'FAIL: unauthorized season reward execution';
exception when others then
 if sqlerrm <> 'Only service_role can apply competition rewards' then raise; end if;
 raise notice 'PASS: browser cannot execute season rewards';
end $$;
reset role;
set local role service_role;
select fixture.assert_ok(count(*)=4 and sum(cash_total)=4000 and sum(coin_total)=10,'mixed registration season rewards finish with full cash and eligible Coins only') from public.apply_competition_rewards_v1(1);
reset role;
select fixture.assert_ok((select count(*)=4 and sum(cash)=4000 from fixture.cash_award),'all four clubs obtain normal senior cash rewards');
select fixture.assert_ok((select count(*)=2 and sum(coin_total)=0 and bool_and(coin_transaction_id is null) from public.club_season_reward_grants where club_id in(fixture.uid(106),fixture.uid(107))),'unconverted and expired guests record cash awards but no Coin transaction');
select fixture.assert_ok((select count(*)=2 and sum(coin_total)=10 and bool_and(coin_transaction_id is not null) from public.club_season_reward_grants where club_id in(fixture.uid(104),fixture.uid(108))),'ordinary and converted managers retain full competition Coins');
select fixture.assert_ok((select count(*)=2 and bool_and((reward_details->0->>'coins')::int=0) and bool_and((reward_details->0->>'cash')::int=1000) and bool_and(reward_details->1->>'code'='other') from public.club_season_reward_grants where club_id in(fixture.uid(106),fixture.uid(107))),'guest award details suppress Coins but keep cash and order');
select fixture.assert_ok((select count(*)=2 and bool_and(coins=0 and cash=1000 and (details->0->>'coins')::int=0) from fixture.reward_notice where user_id in(fixture.uid(6),fixture.uid(7))),'guest notifications describe cash and zero Coins');
select fixture.assert_ok((select count(*)=2 and sum(delta)=10 from public.user_coin_ledger where reason='competition_reward_coins'),'only eligible managers have actual competition Coin ledger entries');
select fixture.assert_ok((select count(*)=1 from public.season_reward_guard where source_season=1) and (select count(*)=1 from public.season_reward_runs where success and total_cash=4000 and total_coins=10 and awards_created_count=4),'scheduler records successful season reward totals and completion guard');
set local role service_role;
do $$ begin
 perform public.apply_competition_rewards_v1(1);
 raise exception 'FAIL: duplicate season reward execution';
exception when others then
 if sqlerrm <> 'Competition rewards already applied for source season 1' then raise; end if;
 raise notice 'PASS: repeated season processing cannot duplicate rewards';
end $$;
reset role;
select fixture.assert_ok((select count(*)=4 from fixture.cash_award) and (select count(*)=2 from public.user_coin_ledger where reason='competition_reward_coins'),'failed replay leaves cash and Coins unchanged');

rollback;
\echo 'SATURN FIXTURE RUNTIME PASSED (not real Supabase Auth or full game)'
