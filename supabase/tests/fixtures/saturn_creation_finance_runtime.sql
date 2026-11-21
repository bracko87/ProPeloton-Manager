\set ON_ERROR_STOP on
-- Disposable PostgreSQL only: actual Saturn team creation/AI placement and
-- production finance/Premium routine snapshots with synthetic dependencies.
-- Not a production schema clone, not actual Supabase Auth, no network.
do $$ begin
 if current_database()<>'saturn_bootstrap_probe' or to_regclass('public.clubs') is not null then
   raise exception 'Requires fresh disposable Saturn database';
 end if;
end $$;
begin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema private;
create schema finance;
create schema extensions;
create schema fixture;
create function extensions.gen_random_uuid() returns uuid language sql volatile as $$select pg_catalog.gen_random_uuid()$$;
create function fixture.uid(n integer) returns uuid language sql immutable as $$select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid$$;
create function fixture.assert_ok(ok boolean, description text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',description; end if;
 raise notice 'PASS: %',description;
end $$;
create function fixture.expect_error(cmd text, expected text, description text) returns void language plpgsql as $$
begin
 begin
   execute cmd;
 exception when others then
   if position(expected in sqlerrm)=0 then raise; end if;
   raise notice 'PASS: %',description;
   return;
 end;
 raise exception 'FAIL: % (expected error)',description;
end $$;
grant usage on schema auth,fixture to anon,authenticated,service_role;
create table auth.users(id uuid primary key,is_anonymous boolean not null);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.subject',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('role',true)$$;
create type public.club_tier as enum ('worldteam','proteam','continental','amateur');
create table public.clubs(
 id uuid primary key,owner_user_id uuid references auth.users(id),name text not null,country_code text,
 primary_color text,secondary_color text,world_tier smallint,club_tier public.club_tier,amateur_division text,
 tier2_division text,tier3_division text, reputation integer default 0, is_ai boolean not null default false,
 is_active boolean not null default true,club_type text default 'main',season_points numeric default 0,
 deleted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),
 cash_balance numeric not null default 0
);
create table public.club_memberships(club_id uuid references public.clubs(id),user_id uuid references auth.users(id),role text,primary key(club_id,user_id));
create table public.club_settings(club_id uuid primary key references public.clubs(id));
create table public.club_finance_summary(club_id uuid primary key references public.clubs(id),current_balance numeric);
create table public.profiles(id uuid primary key references auth.users(id),username text,has_created_club boolean default false);
create table public.countries(code text primary key,is_selectable boolean);
create table public.race_team_entries(club_id uuid,participating_club_id uuid);
create table public.race_team_applications(team_id uuid);
create table public.race_participant_teams(team_id uuid);
create table public.race_participant_teams_v1(club_id uuid,owner_club_id uuid,participating_club_id uuid);
create table public.premium_welcome_trials_v1(user_id uuid primary key references auth.users(id),account_email_hash text unique,started_at timestamptz,expires_at timestamptz);
create table fixture.paid_premium(user_id uuid primary key);
create table private.ppm_guest_auth_gate_v1(id boolean primary key,enabled boolean,verified_at timestamptz);
insert into private.ppm_guest_auth_gate_v1 values(true,false,null);
create table public.team_tier_balance_profiles(tier_key text primary key,starting_cash_user bigint);
-- Arbitrary TEST value, not a statement of actual game starting budget.
insert into public.team_tier_balance_profiles values('amateur',10000),('continental',20000);
create table public.club_team_policies(club_id uuid primary key,flight_class text,hotel_level text,ground_transport text,logistics_support_level text,team_vehicle_policy text,rider_housing_support text,nutrition_support_level text,recovery_support_level text,staff_equipment_level text,staff_accommodation_level text,rider_bonus_plan text,staff_bonus_plan text,updated_at timestamptz default now());
create table public.club_infrastructure(club_id uuid primary key,hq_level int,training_center_level int,medical_center_level int,scouting_level int,equipment_level int,youth_academy_level int,mechanics_workshop_level int,team_car_fleet_quantity int,team_bus_quantity int,equipment_van_quantity int,logistics_truck_quantity int,mobile_workshop_quantity int,medical_van_quantity int,updated_at timestamptz default now());
create table public.riders(id uuid primary key,country_code text,role text);
create table public.club_riders(club_id uuid,rider_id uuid references public.riders(id),primary key(club_id,rider_id));
create table finance.accounts(id uuid primary key default gen_random_uuid(),club_id uuid,currency text,kind text,system_code text,unique(club_id,currency,kind));
create table finance.transactions(id uuid primary key default gen_random_uuid(),type text,created_by uuid,metadata jsonb,idempotency_key text,created_at timestamptz default now(),unique(created_by,idempotency_key));
create table finance.event_locks(event_type text,club_id uuid,ref_id uuid,transaction_id uuid references finance.transactions(id),primary key(event_type,club_id,ref_id));
create table finance.entries(transaction_id uuid references finance.transactions(id),account_id uuid references finance.accounts(id),amount bigint,memo text);
create table finance.account_balances(account_id uuid primary key,balance numeric);
insert into finance.accounts(system_code,currency,kind) values('TREASURY','CASH','main');
-- Fixture stand-ins for external game services / low-level triggers.
create function finance.is_club_member_or_owner(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.clubs where id=c and owner_user_id=u) or exists(select 1 from public.club_memberships where club_id=c and user_id=u)$$;
create function finance.can_spend_from_club(c uuid,u uuid) returns boolean language sql stable as $$select finance.is_club_member_or_owner(c,u)$$;
create function public.get_current_game_timestamp() returns timestamptz language sql stable as $$select '2000-01-01 00:00 UTC'::timestamptz$$;
create function public.season_from_game_timestamp(ts timestamptz) returns integer language sql stable as $$select 1$$;
create function public.is_national_team_club_v1(c uuid) returns boolean language sql stable as $$select false$$;
create function public.safe_get_amateur_division_for_country(c text) returns text language sql stable as $$select case when c='DE' then 'fixture-eu' when c='FR' then 'fixture-other' end$$;
create function public.user_has_paid_premium_access_v1(u uuid) returns boolean language sql stable security definer as $$select exists(select 1 from fixture.paid_premium where user_id=u)$$;
create table fixture.permanent_allocator(club_id uuid);
create function public.assign_new_club_to_ai_slot(c uuid) returns void language sql as $$insert into fixture.permanent_allocator values(c)$$;
create function public._generate_domestic_roster_for_club(c uuid) returns void language plpgsql as $$
declare r text; rid uuid; cc text;
begin
 select country_code into cc from public.clubs where id=c;
 foreach r in array array['Leader','Sprinter','Climber','All-rounder','All-rounder','All-rounder','Domestique','Domestique','Domestique','Breakaway'] loop
  rid:=gen_random_uuid();
  insert into public.riders values(rid,cc,r);
  insert into public.club_riders values(c,rid);
 end loop;
end $$;
create function public.rebalance_new_club_starter_market_values_v1(c uuid) returns jsonb language sql as $$select '{"fixture":true}'::jsonb$$;
create function fixture.apply_ledger_entry() returns trigger language plpgsql as $$
begin
 insert into finance.account_balances(account_id,balance) values(new.account_id,new.amount)
 on conflict(account_id) do update set balance=finance.account_balances.balance+excluded.balance;
 update public.clubs c set cash_balance=b.balance
 from finance.accounts a join finance.account_balances b on b.account_id=a.id
 where a.id=new.account_id and c.id=a.club_id;
 return new;
end $$;
create trigger fixture_ledger AFTER INSERT ON finance.entries FOR EACH ROW execute function fixture.apply_ledger_entry();

-- Actual routine definitions, captured read-only and loaded only in test.
\ir saturn_creation_finance_source.sql
\ir ../../migrations/20261120140000_saturn_14day_full_game_test_account_lifecycle_v1.sql
\ir ../../migrations/20261120153000_saturn_fail_closed_real_test_team_creation_v1.sql
\ir ../../migrations/20261120160000_saturn_test_team_lowest_tier_ai_swap_v1.sql
\ir ../../migrations/20261120235000_saturn_internal_finance_privilege_hardening_v1.sql

insert into auth.users select fixture.uid(n),n<>6 from generate_series(1,8) n;
insert into public.profiles(id) select fixture.uid(n) from generate_series(1,8) n where n<>2;
insert into public.countries values('DE',true),('FR',true);
-- Two eligible AI slots, four historical exclusion variants, unrelated region.
insert into public.clubs(id,name,country_code,world_tier,club_tier,amateur_division,is_ai,season_points)
select fixture.uid(n),'AI '||n,'DE',10,'amateur','fixture-eu',true,
 case when n in(201,203) then 10 else 0 end from generate_series(201,206) n;
insert into public.clubs(id,name,country_code,world_tier,club_tier,amateur_division,is_ai)
values(fixture.uid(207),'Other region','FR',10,'amateur','fixture-other',true),
(fixture.uid(208),'Higher tier','DE',9,'amateur','fixture-eu',true);
insert into public.race_team_entries values(null,fixture.uid(202));
insert into public.race_team_applications values(fixture.uid(204));
insert into public.race_participant_teams values(fixture.uid(205));
insert into public.race_participant_teams_v1 values(null,fixture.uid(206),null);
create trigger ppm_reject_guest_owned_clubs_v1 before insert or update of owner_user_id on public.clubs for each row execute function public.ppm_reject_guest_owned_clubs_v1();
create trigger trg_assign_new_real_club_to_ai_slot after insert on public.clubs for each row when(new.is_ai=false) execute function public.trg_assign_new_real_club_to_ai_slot();
create trigger trg_new_club_creation_setup_v1 after insert on public.clubs for each row execute function public._clubs_after_insert_new_team_setup_v1();

select fixture.assert_ok(not has_function_privilege('anon','public.saturn_create_test_club_v1(text,text,text,text,text)','EXECUTE'),'creation denied to anon by default');
select fixture.assert_ok(not has_function_privilege('authenticated','public.saturn_create_test_club_v1(text,text,text,text,text)','EXECUTE'),'creation denied to authenticated by default');
select fixture.assert_ok(not has_table_privilege('authenticated','private.saturn_test_club_insert_tickets_v1','INSERT'),'browser cannot forge private ticket');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_grant_new_club_bonus(uuid,bigint)','EXECUTE') and not has_function_privilege('anon','public.finance_grant_new_club_bonus(uuid,bigint)','EXECUTE'),'direct finance bonus denied to browser roles');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)','EXECUTE'),'direct finance credit denied to browser roles');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_setup_new_club(uuid)','EXECUTE') and not has_function_privilege('anon','public.finance_setup_new_club(uuid)','EXECUTE'),'direct finance setup denied to browser roles');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_get_or_create_club_account(uuid,text,text)','EXECUTE') and not has_function_privilege('anon','public.finance_get_or_create_club_account(uuid,text,text)','EXECUTE'),'direct account creation denied to browser roles');
select fixture.assert_ok(has_function_privilege('service_role','public.finance_setup_new_club(uuid)','EXECUTE') and has_function_privilege('service_role','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)','EXECUTE') and has_function_privilege('service_role','public.finance_grant_new_club_bonus(uuid,bigint)','EXECUTE') and has_function_privilege('service_role','public.finance_get_or_create_club_account(uuid,text,text)','EXECUTE'),'all four internal finance grants retained for service role');

-- Controlled test-only grant. Never authorize this in production here.
grant execute on function public.saturn_create_test_club_v1(text,text,text,text,text) to authenticated;
set local role authenticated;
select set_config('fixture.subject',fixture.uid(1)::text,true);
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Test Club','DE','#111111','#222222')$q$,'Test-team creation is not enabled','both rollout gates remain closed');
reset role;
update private.ppm_guest_auth_gate_v1 set enabled=true,verified_at=now();
set local role authenticated;
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Test Club','DE','#111111','#222222')$q$,'Test-team creation is not enabled','Auth gate alone is insufficient');
reset role;
update private.saturn_test_club_rollout_v1 set enabled=true,verified_at=now();
set local role authenticated;
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Test Club','DE','#111111','#111111')$q$,'Invalid nickname','duplicate colors rejected');
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Test Club','ZZ','#111111','#222222')$q$,'Unknown or unavailable country','invalid country rejected');
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Test Club','DE','#111111','#222222')$q$,'capacity has not been approved','unapproved regional capacity blocks creation');
reset role;
insert into private.saturn_test_division_capacity_v1 values(10,'fixture-eu',6,now()),(10,'fixture-other',1,now());
grant insert on public.clubs to authenticated;
set local role authenticated;
select fixture.expect_error($q$insert into public.clubs(id,owner_user_id,name,country_code,world_tier,club_tier,amateur_division) values(fixture.uid(901),fixture.uid(1),'Bypass','DE',10,'amateur','fixture-eu')$q$,'approved test-team creation transaction','direct guest team insert denied');
select public.saturn_create_test_club_v1('Manager','Test Club','DE','#111111','#222222') as created_id \gset
select fixture.assert_ok(public.user_has_premium_access_v1(fixture.uid(1)),'actual Premium reader recognizes new welcome entitlement');
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Duplicate','DE','#111111','#222222')$q$,'already has a team','repeat creation cannot award duplicate benefits');
reset role;
select fixture.assert_ok((select count(*)=1 from public.clubs where owner_user_id=fixture.uid(1)),'exactly one original club created');
select fixture.assert_ok((select world_tier=10 and club_tier='amateur' and amateur_division='fixture-eu' and cash_balance=10000 from public.clubs where id=:'created_id'::uuid),'correct lowest-tier region and fixture starting cash');
select fixture.assert_ok((select count(*)=6 from public.clubs where world_tier=10 and amateur_division='fixture-eu' and is_active),'regional occupancy unchanged');
select fixture.assert_ok((select world_tier=3 and tier3_division='ai_pool' and is_active and is_ai from public.clubs where id=fixture.uid(201)),'eligible AI retained active in reserve');
select fixture.assert_ok((select count(*)=4 from public.clubs where id in(fixture.uid(202),fixture.uid(204),fixture.uid(205),fixture.uid(206)) and world_tier=10),'all historical AI slots preserved');
select fixture.assert_ok((select count(*)=2 from public.clubs where id in(fixture.uid(207),fixture.uid(208)) and world_tier in(9,10)),'other region/higher tier not used');
select fixture.assert_ok((select count(*)=1 from public.club_memberships where club_id=:'created_id'::uuid and user_id=fixture.uid(1) and role='owner'),'owner membership initialized');
select fixture.assert_ok((select count(*)=1 from public.club_settings where club_id=:'created_id'::uuid),'club settings initialized');
select fixture.assert_ok((select current_balance=10000 from public.club_finance_summary where club_id=:'created_id'::uuid),'financial summary matches cash');
select fixture.assert_ok((select count(*)=10 from public.club_riders cr join public.riders r on r.id=cr.rider_id where cr.club_id=:'created_id'::uuid and r.country_code='DE'),'starter roster initialized via fixture generator');
select fixture.assert_ok((select hq_level=1 and youth_academy_level=0 from public.club_infrastructure where club_id=:'created_id'::uuid),'HQ set to level 1; no academy level granted');
select fixture.assert_ok((select username='Manager' and has_created_club from public.profiles where id=fixture.uid(1)),'profile set exactly once');
select fixture.assert_ok((select t.club_id=:'created_id'::uuid and t.expires_at=t.started_at+interval '336 hours' and t.premium_ends_at=t.started_at+interval '168 hours' and p.started_at=t.started_at and p.expires_at=t.premium_ends_at from public.saturn_test_accounts_v1 t join public.premium_welcome_trials_v1 p using(user_id) where t.user_id=fixture.uid(1)),'canonical 14-day lifecycle and seven-day Premium align');
select fixture.assert_ok((select count(*)=0 from private.saturn_test_club_insert_tickets_v1),'transaction ticket removed');
select fixture.assert_ok((select count(*)=1 from finance.transactions),'one starting transaction after repeated team request');
select fixture.assert_ok((select count(*)=2 and sum(amount)=0 from finance.entries),'balanced double-entry starting cash');
-- Replaying the internal finance setup must not give a second bonus.
select public.finance_setup_new_club(:'created_id'::uuid);
select fixture.assert_ok((select count(*)=1 from finance.transactions),'replayed finance setup is idempotent');
select fixture.assert_ok((select cash_balance=10000 from public.clubs where id=:'created_id'::uuid),'no double starting balance');

-- Missing profile fails after AI move, roster and finance operations.
set local role authenticated;
select set_config('fixture.subject',fixture.uid(2)::text,true);
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Bad Profile','DE','#111111','#222222')$q$,'profile could not be initialized','missing profile triggers late rollback');
reset role;
select fixture.assert_ok((select count(*)=0 from public.clubs where owner_user_id=fixture.uid(2)) and (select count(*)=1 from finance.transactions) and (select count(*)=10 from public.riders),'failed creation rolls back team, roster and finance');
select fixture.assert_ok((select world_tier=10 and amateur_division='fixture-eu' from public.clubs where id=fixture.uid(203)) and (select count(*)=0 from private.saturn_test_club_insert_tickets_v1),'failed creation rolls back AI move and ticket');

-- An earlier Premium claim must never restart. Force late rollback.
insert into public.premium_welcome_trials_v1 values(fixture.uid(3),'prior',now()-interval '200 hours',now()-interval '32 hours');
set local role authenticated;
select set_config('fixture.subject',fixture.uid(3)::text,true);
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Prior Trial','DE','#111111','#222222')$q$,'Existing Premium trial cannot be restarted','prior Premium claim blocks a second trial');
reset role;
select fixture.assert_ok((select count(*)=0 from public.clubs where owner_user_id=fixture.uid(3)) and (select count(*)=0 from public.saturn_test_accounts_v1 where user_id=fixture.uid(3)) and (select count(*)=1 from finance.transactions),'prior claim rollback removes club/lifecycle/ledger');
select fixture.assert_ok((select expires_at=now()-interval '32 hours' from public.premium_welcome_trials_v1 where user_id=fixture.uid(3)),'prior entitlement unchanged');

-- At precisely seven days the real entitlement reader denies welcome access.
insert into public.premium_welcome_trials_v1 values(fixture.uid(7),'boundary',now()-interval '168 hours',now()),(fixture.uid(8),'before-boundary',now()-interval '167 hours 59 minutes',now()+interval '1 minute');
select fixture.assert_ok(not public.user_has_premium_access_v1(fixture.uid(7)),'Premium expires at exactly 168 hours');
select fixture.assert_ok(public.user_has_premium_access_v1(fixture.uid(8)),'Premium active immediately before 168 hours');
insert into fixture.paid_premium values(fixture.uid(7));
select fixture.assert_ok(public.user_has_premium_access_v1(fixture.uid(7)),'paid Premium unaffected when welcome term expires');

set local role authenticated;
select set_config('fixture.subject',fixture.uid(4)::text,true);
select public.saturn_create_test_club_v1('Manager','Second Club','DE','#111111','#222222') as second_id \gset
select set_config('fixture.subject',fixture.uid(5)::text,true);
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','No Slot','DE','#111111','#222222')$q$,'No competition-safe AI slot available','no safe AI vacancy blocks third team');
select set_config('fixture.subject',fixture.uid(6)::text,true);
select fixture.expect_error($q$select public.saturn_create_test_club_v1('Manager','Registered','DE','#111111','#222222')$q$,'Only verified temporary Auth identities','normal registration cannot call guest creation');
reset role;
select fixture.assert_ok((select count(*)=2 from public.saturn_test_accounts_v1) and (select count(*)=2 from finance.transactions),'only two successful trial teams and two ledger transactions');
select fixture.assert_ok((select count(*)=6 from public.clubs where world_tier=10 and amateur_division='fixture-eu'),'division cap remains constant after all attempts');
select fixture.assert_ok((select count(*)=0 from fixture.permanent_allocator),'guest creation never invokes permanent allocator');
select fixture.assert_ok((select count(*)=0 from private.saturn_test_club_insert_tickets_v1),'no residual tickets after all failed and successful calls');

-- Normal permanent creation continues to dispatch its old (fixture) allocator.
select set_config('fixture.subject',fixture.uid(6)::text,true);
insert into public.clubs(id,owner_user_id,name,country_code,world_tier,club_tier,amateur_division) values(fixture.uid(906),fixture.uid(6),'Normal Club','DE',9,'amateur','fixture-eu');
select fixture.assert_ok((select count(*)=1 from fixture.permanent_allocator where club_id=fixture.uid(906)),'normal club still invokes ordinary allocator');

-- Internal finance routines still callable by backend after revocation.
select set_config('fixture.subject','',true);
set local role service_role;
select public.finance_setup_new_club(:'created_id'::uuid);
reset role;
select fixture.assert_ok((select count(*)=2 from finance.transactions),'service-role setup remains callable and idempotent');
rollback;
\echo 'SATURN CREATION FINANCE FIXTURE PASSED (synthetic roster/ledger dependencies; not full game)'
