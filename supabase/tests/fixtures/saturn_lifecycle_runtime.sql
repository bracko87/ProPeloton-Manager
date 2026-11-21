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
rollback;
\echo 'SATURN FIXTURE RUNTIME PASSED (not real Supabase Auth or full game)'
