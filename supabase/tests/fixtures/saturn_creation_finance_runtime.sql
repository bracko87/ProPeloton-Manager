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

-- Signature-only stand-ins for extended internal finance EXECUTE tests.
-- The force-transfer body is an actual production read-only snapshot.
create function public.finance_apply_club_house_tax_rebate_v1(uuid,date,date) returns boolean language sql security definer as $fixture$select true$fixture$;
create function public.finance_charge_emergency_loan_weekly_payment(uuid,date) returns boolean language sql security definer as $fixture$select true$fixture$;
create function public.finance_charge_race_cost(uuid,uuid,bigint,jsonb) returns boolean language sql security definer as $fixture$select true$fixture$;
create function public.finance_create_club_house_rebate_v1(uuid,uuid,text,bigint,integer,text) returns boolean language sql security definer as $fixture$select true$fixture$;
create function public.finance_issue_emergency_loan_non_ai_core_v1(uuid,text,text,text) returns boolean language sql security definer as $fixture$select true$fixture$;
create function public.finance_run_monthly_tax_audit_for_club(uuid,date,date,boolean) returns boolean language sql security definer as $fixture$select true$fixture$;
create function public.race_engine_refund_one_day_weather_cancelled_race_v1(uuid) returns boolean language sql security definer as $fixture$select true$fixture$;
create function public.refund_one_day_weather_cancelled_race_v2(uuid) returns boolean language sql security definer as $fixture$select true$fixture$;
CREATE OR REPLACE FUNCTION public.finance_force_transfer_club_to_club(p_from_club_id uuid, p_to_club_id uuid, p_amount bigint, p_currency text DEFAULT 'CASH'::text, p_type text DEFAULT 'rider_transfer_fee_paid'::text, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid;
  v_from_acct uuid;
  v_to_acct uuid;
  v_tx uuid;
  v_from_balance bigint;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  perform public.finance_get_or_create_club_account(p_from_club_id, p_currency, 'main');
  perform public.finance_get_or_create_club_account(p_to_club_id, p_currency, 'main');

  select a.id
  into v_from_acct
  from finance.accounts a
  where a.club_id = p_from_club_id
    and a.currency = p_currency
    and a.kind = 'main';

  select a.id
  into v_to_acct
  from finance.accounts a
  where a.club_id = p_to_club_id
    and a.currency = p_currency
    and a.kind = 'main';

  if v_from_acct is null or v_to_acct is null then
    raise exception 'Could not resolve club finance accounts';
  end if;

  if p_idempotency_key is not null then
    insert into finance.transactions(type, created_by, idempotency_key, metadata)
    values (p_type, v_uid, p_idempotency_key, p_metadata)
    on conflict (created_by, idempotency_key) do nothing
    returning id into v_tx;

    if v_tx is null then
      select t.id
      into v_tx
      from finance.transactions t
      where t.created_by = v_uid
        and t.idempotency_key = p_idempotency_key;

      return v_tx;
    end if;
  else
    insert into finance.transactions(type, created_by, metadata)
    values (p_type, v_uid, p_metadata)
    returning id into v_tx;
  end if;

  insert into finance.account_balances(account_id, balance)
  values (v_from_acct, 0)
  on conflict (account_id) do nothing;

  insert into finance.account_balances(account_id, balance)
  values (v_to_acct, 0)
  on conflict (account_id) do nothing;

  select ab.balance
  into v_from_balance
  from finance.account_balances ab
  where ab.account_id = v_from_acct
  for update;

  if v_from_balance < p_amount then
    raise exception 'Insufficient funds: have %, need %', v_from_balance, p_amount;
  end if;

  insert into finance.entries(transaction_id, account_id, amount, memo)
  values
    (v_tx, v_from_acct, -p_amount, 'rider transfer debit'),
    (v_tx, v_to_acct,    p_amount, 'rider transfer credit');

  return v_tx;
end;
$function$;

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

-- Commit only the synthetic setup so independent test sessions can see it.
commit;
begin;
select fixture.assert_ok(not has_function_privilege('anon','public.saturn_create_test_club_v1(text,text,text,text,text)','EXECUTE'),'creation denied to anon by default');
select fixture.assert_ok(not has_function_privilege('authenticated','public.saturn_create_test_club_v1(text,text,text,text,text)','EXECUTE'),'creation denied to authenticated by default');
select fixture.assert_ok(not has_table_privilege('authenticated','private.saturn_test_club_insert_tickets_v1','INSERT'),'browser cannot forge private ticket');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_grant_new_club_bonus(uuid,bigint)','EXECUTE') and not has_function_privilege('anon','public.finance_grant_new_club_bonus(uuid,bigint)','EXECUTE'),'direct finance bonus denied to browser roles');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)','EXECUTE'),'direct finance credit denied to browser roles');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_setup_new_club(uuid)','EXECUTE') and not has_function_privilege('anon','public.finance_setup_new_club(uuid)','EXECUTE'),'direct finance setup denied to browser roles');
select fixture.assert_ok(not has_function_privilege('authenticated','public.finance_get_or_create_club_account(uuid,text,text)','EXECUTE') and not has_function_privilege('anon','public.finance_get_or_create_club_account(uuid,text,text)','EXECUTE'),'direct account creation denied to browser roles');
select fixture.assert_ok(has_function_privilege('service_role','public.finance_setup_new_club(uuid)','EXECUTE') and has_function_privilege('service_role','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)','EXECUTE') and has_function_privilege('service_role','public.finance_grant_new_club_bonus(uuid,bigint)','EXECUTE') and has_function_privilege('service_role','public.finance_get_or_create_club_account(uuid,text,text)','EXECUTE'),'all four internal finance grants retained for service role');


-- Actual rejected invocations under both browser roles, not merely catalog
-- has_function_privilege checks. Synthetic club UUIDs only. Each call must
-- fail at PostgreSQL EXECUTE authorization before entering the function.
set local role anon;
select fixture.expect_error($q$select public.finance_grant_new_club_bonus(fixture.uid(201),1)$q$,'permission denied for function','anon cannot execute initial bonus');
select fixture.expect_error($q$select public.finance_setup_new_club(fixture.uid(201))$q$,'permission denied for function','anon cannot execute finance setup');
select fixture.expect_error($q$select public.finance_credit_to_club(fixture.uid(201),1,'fixture','TREASURY','fixture-denied','{}'::jsonb)$q$,'permission denied for function','anon cannot execute internal credit');
select fixture.expect_error($q$select public.finance_get_or_create_club_account(fixture.uid(201),'CASH','main')$q$,'permission denied for function','anon cannot execute internal account creation');
reset role;
set local role authenticated;
select set_config('fixture.subject',fixture.uid(1)::text,true);
select fixture.expect_error($q$select public.finance_grant_new_club_bonus(fixture.uid(201),1)$q$,'permission denied for function','authenticated cannot execute initial bonus');
select fixture.expect_error($q$select public.finance_setup_new_club(fixture.uid(201))$q$,'permission denied for function','authenticated cannot execute finance setup');
select fixture.expect_error($q$select public.finance_credit_to_club(fixture.uid(201),1,'fixture','TREASURY','fixture-denied','{}'::jsonb)$q$,'permission denied for function','authenticated cannot execute internal credit');
select fixture.expect_error($q$select public.finance_get_or_create_club_account(fixture.uid(201),'CASH','main')$q$,'permission denied for function','authenticated cannot execute internal account creation');
reset role;
select fixture.assert_ok((select count(*)=0 from finance.transactions) and (select count(*)=0 from finance.entries) and (select count(*)=0 from finance.accounts where club_id is not null),'rejected browser invocations leave no finance state');

set local role anon;
select fixture.expect_error($q$select public.finance_apply_club_house_tax_rebate_v1(fixture.uid(201),'2000-01-01'::date,'2000-01-01'::date)$q$,'permission denied for function','anon cannot execute finance_apply_club_house_tax_rebate_v1');
select fixture.expect_error($q$select public.finance_charge_emergency_loan_weekly_payment(fixture.uid(201),'2000-01-01'::date)$q$,'permission denied for function','anon cannot execute finance_charge_emergency_loan_weekly_payment');
select fixture.expect_error($q$select public.finance_charge_race_cost(fixture.uid(201),fixture.uid(201),1::bigint,'{}'::jsonb)$q$,'permission denied for function','anon cannot execute finance_charge_race_cost');
select fixture.expect_error($q$select public.finance_create_club_house_rebate_v1(fixture.uid(201),fixture.uid(201),'fixture'::text,1::bigint,1,'fixture'::text)$q$,'permission denied for function','anon cannot execute finance_create_club_house_rebate_v1');
select fixture.expect_error($q$select public.finance_force_transfer_club_to_club(fixture.uid(201),fixture.uid(201),1::bigint,'fixture'::text,'fixture'::text,'fixture'::text,'{}'::jsonb)$q$,'permission denied for function','anon cannot execute finance_force_transfer_club_to_club');
select fixture.expect_error($q$select public.finance_issue_emergency_loan_non_ai_core_v1(fixture.uid(201),'fixture'::text,'fixture'::text,'fixture'::text)$q$,'permission denied for function','anon cannot execute finance_issue_emergency_loan_non_ai_core_v1');
select fixture.expect_error($q$select public.finance_run_monthly_tax_audit_for_club(fixture.uid(201),'2000-01-01'::date,'2000-01-01'::date,false)$q$,'permission denied for function','anon cannot execute finance_run_monthly_tax_audit_for_club');
select fixture.expect_error($q$select public.race_engine_refund_one_day_weather_cancelled_race_v1(fixture.uid(201))$q$,'permission denied for function','anon cannot execute race_engine_refund_one_day_weather_cancelled_race_v1');
select fixture.expect_error($q$select public.refund_one_day_weather_cancelled_race_v2(fixture.uid(201))$q$,'permission denied for function','anon cannot execute refund_one_day_weather_cancelled_race_v2');
reset role;
set local role authenticated;
select fixture.expect_error($q$select public.finance_apply_club_house_tax_rebate_v1(fixture.uid(201),'2000-01-01'::date,'2000-01-01'::date)$q$,'permission denied for function','authenticated cannot execute finance_apply_club_house_tax_rebate_v1');
select fixture.expect_error($q$select public.finance_charge_emergency_loan_weekly_payment(fixture.uid(201),'2000-01-01'::date)$q$,'permission denied for function','authenticated cannot execute finance_charge_emergency_loan_weekly_payment');
select fixture.expect_error($q$select public.finance_charge_race_cost(fixture.uid(201),fixture.uid(201),1::bigint,'{}'::jsonb)$q$,'permission denied for function','authenticated cannot execute finance_charge_race_cost');
select fixture.expect_error($q$select public.finance_create_club_house_rebate_v1(fixture.uid(201),fixture.uid(201),'fixture'::text,1::bigint,1,'fixture'::text)$q$,'permission denied for function','authenticated cannot execute finance_create_club_house_rebate_v1');
select fixture.expect_error($q$select public.finance_force_transfer_club_to_club(fixture.uid(201),fixture.uid(201),1::bigint,'fixture'::text,'fixture'::text,'fixture'::text,'{}'::jsonb)$q$,'permission denied for function','authenticated cannot execute finance_force_transfer_club_to_club');
select fixture.expect_error($q$select public.finance_issue_emergency_loan_non_ai_core_v1(fixture.uid(201),'fixture'::text,'fixture'::text,'fixture'::text)$q$,'permission denied for function','authenticated cannot execute finance_issue_emergency_loan_non_ai_core_v1');
select fixture.expect_error($q$select public.finance_run_monthly_tax_audit_for_club(fixture.uid(201),'2000-01-01'::date,'2000-01-01'::date,false)$q$,'permission denied for function','authenticated cannot execute finance_run_monthly_tax_audit_for_club');
select fixture.expect_error($q$select public.race_engine_refund_one_day_weather_cancelled_race_v1(fixture.uid(201))$q$,'permission denied for function','authenticated cannot execute race_engine_refund_one_day_weather_cancelled_race_v1');
select fixture.expect_error($q$select public.refund_one_day_weather_cancelled_race_v2(fixture.uid(201))$q$,'permission denied for function','authenticated cannot execute refund_one_day_weather_cancelled_race_v2');
reset role;
select fixture.assert_ok(has_function_privilege('service_role','public.finance_apply_club_house_tax_rebate_v1(uuid,date,date)','EXECUTE') and has_function_privilege('service_role','public.finance_charge_emergency_loan_weekly_payment(uuid,date)','EXECUTE') and has_function_privilege('service_role','public.finance_charge_race_cost(uuid,uuid,bigint,jsonb)','EXECUTE') and has_function_privilege('service_role','public.finance_create_club_house_rebate_v1(uuid,uuid,text,bigint,integer,text)','EXECUTE') and has_function_privilege('service_role','public.finance_force_transfer_club_to_club(uuid,uuid,bigint,text,text,text,jsonb)','EXECUTE') and has_function_privilege('service_role','public.finance_issue_emergency_loan_non_ai_core_v1(uuid,text,text,text)','EXECUTE') and has_function_privilege('service_role','public.finance_run_monthly_tax_audit_for_club(uuid,date,date,boolean)','EXECUTE') and has_function_privilege('service_role','public.race_engine_refund_one_day_weather_cancelled_race_v1(uuid)','EXECUTE') and has_function_privilege('service_role','public.refund_one_day_weather_cancelled_race_v2(uuid)','EXECUTE'),'service role retains all nine extended internal finance grants');
select fixture.assert_ok((select count(*)=0 from finance.transactions) and (select count(*)=0 from finance.entries),'extended denied calls leave finance unchanged');

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


-- Real parallel sessions against the same disposable fixture. The serial
-- assertions above were rolled back, so both eligible AI slots are available.
create extension dblink;
update private.ppm_guest_auth_gate_v1 set enabled=true,verified_at=now();
update private.saturn_test_club_rollout_v1 set enabled=true,verified_at=now();
insert into private.saturn_test_division_capacity_v1 values(10,'fixture-eu',6,now());
grant execute on function public.saturn_create_test_club_v1(text,text,text,text,text) to authenticated;

-- INVOKER helper returns the actual RPC outcome, including the actual error.
create function fixture.concurrent_create(team_name text) returns text
language plpgsql security invoker as $$
begin
 return public.saturn_create_test_club_v1('Manager',team_name,'DE','#111111','#222222')::text;
exception when others then
 return 'ERROR: ' || sqlerrm;
end $$;

-- Require evidence of a genuinely blocked concurrent query, not merely
-- two sequential submissions. Fail after a bounded five-second wait.
create function fixture.await_advisory_wait(peer text) returns boolean
language plpgsql volatile as $$
declare i integer;
begin
 for i in 1..100 loop
  perform pg_stat_clear_snapshot();
  if exists(select 1 from pg_stat_activity where datname=current_database()
      and application_name=peer and wait_event_type='Lock' and wait_event='advisory') then
   return true;
  end if;
  perform pg_sleep(0.05);
 end loop;
 return false;
end $$;

-- These credentials belong ONLY to the throwaway PostgreSQL CI service.
select dblink_connect('a','host=127.0.0.1 port=5432 dbname=saturn_bootstrap_probe user=postgres password=disposable-ci-only application_name=saturn-concurrency-a');
select dblink_connect('b','host=127.0.0.1 port=5432 dbname=saturn_bootstrap_probe user=postgres password=disposable-ci-only application_name=saturn-concurrency-b');
select dblink_exec('a','set statement_timeout = 20000');
select dblink_exec('b','set statement_timeout = 20000');
select dblink_exec('a','set role authenticated');
select dblink_exec('b','set role authenticated');
select dblink_exec('a',format('set fixture.subject = %L',fixture.uid(1)::text));
select dblink_exec('b',format('set fixture.subject = %L',fixture.uid(1)::text));

-- Same owner: one session holds the result uncommitted; the competing
-- request must wait for its owner advisory lock, then reject the duplicate.
select dblink_exec('a','begin');
select outcome as first_outcome from dblink('a',$q$select fixture.concurrent_create('Parallel First')$q$) as t(outcome text) \gset
select fixture.assert_ok(:'first_outcome' ~ '^[0-9a-f-]{36}$','parallel owner first request created club');
select fixture.assert_ok(dblink_send_query('b',$q$select fixture.concurrent_create('Parallel Duplicate')$q$)=1,'parallel duplicate query submitted');
select fixture.assert_ok(fixture.await_advisory_wait('saturn-concurrency-b'),'parallel duplicate actually waited on advisory lock');
select dblink_exec('a','commit');
select outcome as duplicate_outcome from dblink_get_result('b') as t(outcome text) \gset
select fixture.assert_ok(:'duplicate_outcome'='ERROR: This player already has a team','parallel duplicate rejected after first commit');
select * from dblink_get_result('b') as t(outcome text);
select fixture.assert_ok((select count(*)=1 from public.clubs where owner_user_id=fixture.uid(1)) and (select count(*)=1 from public.saturn_test_accounts_v1 where user_id=fixture.uid(1)) and (select count(*)=1 from public.premium_welcome_trials_v1 where user_id=fixture.uid(1)) and (select count(*)=1 from finance.transactions),'parallel owner has exactly one club, lifecycle, Premium and ledger transaction');

-- Different owners race for the last eligible AI slot in the same division.
select dblink_exec('a',format('set fixture.subject = %L',fixture.uid(4)::text));
select dblink_exec('b',format('set fixture.subject = %L',fixture.uid(5)::text));
select dblink_exec('a','begin');
select outcome as final_slot from dblink('a',$q$select fixture.concurrent_create('Final Safe Slot')$q$) as t(outcome text) \gset
select fixture.assert_ok(:'final_slot' ~ '^[0-9a-f-]{36}$','last safe slot assigned by first transaction');
select fixture.assert_ok(dblink_send_query('b',$q$select fixture.concurrent_create('Competing Slot')$q$)=1,'competing regional signup submitted');
select fixture.assert_ok(fixture.await_advisory_wait('saturn-concurrency-b'),'competing regional signup actually waited on advisory lock');
select dblink_exec('a','commit');
select outcome as no_slot from dblink_get_result('b') as t(outcome text) \gset
select fixture.assert_ok(:'no_slot'='ERROR: No competition-safe AI slot available in the requested lowest amateur division','competing owner rejected when no eligible slot remains');
select * from dblink_get_result('b') as t(outcome text);
select dblink_disconnect('a');
select dblink_disconnect('b');
select fixture.assert_ok((select count(*)=2 from public.saturn_test_accounts_v1) and (select count(*)=2 from public.premium_welcome_trials_v1) and (select count(*)=2 from finance.transactions) and (select count(*)=4 and sum(amount)=0 from finance.entries),'parallel allocation grants exactly two balanced starter transactions and two trials');
select fixture.assert_ok((select count(*)=0 from public.clubs where owner_user_id=fixture.uid(5)) and (select count(*)=0 from public.saturn_test_accounts_v1 where user_id=fixture.uid(5)) and (select count(*)=0 from public.premium_welcome_trials_v1 where user_id=fixture.uid(5)),'unsuccessful concurrent player gets no partial club or entitlement');
select fixture.assert_ok((select count(*)=6 from public.clubs where world_tier=10 and amateur_division='fixture-eu' and is_active) and (select count(*)=2 from public.clubs where id in(fixture.uid(201),fixture.uid(203)) and tier3_division='ai_pool' and is_active and is_ai) and (select count(*)=4 from public.clubs where id in(fixture.uid(202),fixture.uid(204),fixture.uid(205),fixture.uid(206)) and world_tier=10),'parallel allocation preserves division cap, active reserve AI and historical AI slots');
select fixture.assert_ok((select count(*)=0 from private.saturn_test_club_insert_tickets_v1),'no leaked transaction tickets after concurrent requests');
\echo 'SATURN CONCURRENCY FIXTURE PASSED (real concurrent PostgreSQL sessions; synthetic Auth and dependencies)'


-- Converted-team placement: execute the actual SAT-03 migration on the
-- disposable committed creation fixture. Synthetic region, season and legacy
-- rebalancer dependencies; no production schema or Auth parity claimed.
begin;
alter table public.clubs add column inactivity_status text default 'active';
create table public.races(id uuid primary key,status text);
alter table public.race_team_entries add column race_id uuid;
alter table public.race_team_applications add column race_id uuid;
alter table public.race_participant_teams add column race_id uuid;
alter table public.race_participant_teams_v1 add column race_id uuid;
create table public.season_transition_control_v1(id boolean primary key,is_armed boolean);
insert into public.season_transition_control_v1 values(true,false);
create function public.season_transition_guard_active_v1() returns boolean language sql stable as $$select false$$;
create function public.get_expected_tier2_division_for_country(c text) returns text language sql stable as $$select 'fixture-pro'::text$$;
create function public.get_expected_tier3_division_for_country(c text) returns text language sql stable as $$select 'fixture-cont'::text$$;
create table fixture.legacy_rebalance(reason text);
create function public.rebalance_top3_overflow_ai_to_pool_v1(reason text) returns void language sql as $$insert into fixture.legacy_rebalance values(reason)$$;
\ir ../../migrations/20261120234500_saturn_converted_team_approved_vacancy_v1.sql
create trigger trg_rebalance_top3_overflow_ai_to_pool_v1 after insert or update of club_tier,world_tier,tier2_division,tier3_division on public.clubs for each row execute function public.trg_rebalance_top3_overflow_ai_to_pool_v1();
select fixture.assert_ok(not has_function_privilege('anon','public.saturn_place_converted_test_team_v1()','EXECUTE') and has_function_privilege('authenticated','public.saturn_place_converted_test_team_v1()','EXECUTE'),'placement callable only by authenticated browser role');
select fixture.assert_ok(not has_table_privilege('authenticated','private.saturn_converted_team_update_tickets_v1','INSERT') and not has_table_privilege('authenticated','private.saturn_converted_vacancy_caps_v1','UPDATE'),'browser cannot forge placement tickets or capacities');
set local role authenticated;
select set_config('fixture.subject',fixture.uid(1)::text,true);
select fixture.expect_error($q$select public.saturn_place_converted_test_team_v1()$q$,'Verify your permanent account first','anonymous test manager cannot promote');
reset role;
update auth.users set is_anonymous=false where id in(fixture.uid(1),fixture.uid(4));
set local role authenticated;
select fixture.expect_error($q$select public.saturn_place_converted_test_team_v1()$q$,'Original trial has not been permanently converted','permanent Auth alone is not enough without conversion finalization');
reset role;
-- These are test-only stand-ins for already verified conversion finalizers.
update public.saturn_test_accounts_v1 set converted_at=now() where user_id in(fixture.uid(1),fixture.uid(4));
select club_id as original_club from public.saturn_test_accounts_v1 where user_id=fixture.uid(1) \gset
select club_id as second_club from public.saturn_test_accounts_v1 where user_id=fixture.uid(4) \gset
set local role authenticated;
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='no_approved_higher_vacancy','no approved capacity leaves original club unchanged');
select set_config('fixture.subject',fixture.uid(6)::text,true);
select fixture.expect_error($q$select public.saturn_place_converted_test_team_v1()$q$,'Original trial has not been permanently converted','unrelated registered user has no placement');
reset role;
insert into public.clubs(id,name,country_code,world_tier,club_tier,is_ai,tier2_division,tier3_division)
select fixture.uid(n),'World AI '||n,'DE',case when n=301 then 1 else 2 end,'worldteam',true,null,null from generate_series(301,325) n;
insert into public.clubs(id,name,country_code,world_tier,club_tier,is_ai,tier2_division,tier3_division)
values(fixture.uid(330),'Pro AI','DE',2,'proteam',true,'fixture-pro',null),
(fixture.uid(331),'Cont AI','DE',3,'continental',true,null,'fixture-cont'),
(fixture.uid(332),'Other Cont AI','FR',2,'continental',true,null,'wrong-region');
insert into private.saturn_converted_vacancy_caps_v1(world_tier,club_tier,region_code,max_teams,approved_at,enabled) values
(1,'worldteam','-',2,now(),true),
(1,'proteam','fixture-pro',5,now(),true),
(2,'proteam','fixture-pro',1,now(),true),
(2,'continental','wrong-region',8,now(),true),
(3,'continental','fixture-cont',3,now(),true);
update public.season_transition_control_v1 set is_armed=true;
set local role authenticated;
select set_config('fixture.subject',fixture.uid(1)::text,true);
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='season_transition_pending','armed season blocks placement');
reset role;
update public.season_transition_control_v1 set is_armed=false;
insert into public.races values(fixture.uid(350),'in_progress'),(fixture.uid(351),'completed');
insert into public.race_team_entries(club_id,participating_club_id,race_id) values(null,:'original_club'::uuid,fixture.uid(350));
set local role authenticated;
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='race_commitment_pending','active entry blocks placement by participating club');
reset role;
update public.race_team_entries set race_id=fixture.uid(351) where participating_club_id=:'original_club'::uuid;
insert into public.race_team_applications(team_id,race_id) values(:'original_club'::uuid,fixture.uid(350));
set local role authenticated;
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='race_commitment_pending','active application blocks placement');
reset role;
update public.race_team_applications set race_id=fixture.uid(351) where team_id=:'original_club'::uuid;
insert into public.race_participant_teams(team_id,race_id) values(:'original_club'::uuid,fixture.uid(350));
set local role authenticated;
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='race_commitment_pending','active legacy participation blocks placement');
reset role;
update public.race_participant_teams set race_id=fixture.uid(351) where team_id=:'original_club'::uuid;
insert into public.race_participant_teams_v1(club_id,owner_club_id,participating_club_id,race_id) values(null,:'original_club'::uuid,null,fixture.uid(350));
set local role authenticated;
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='race_commitment_pending','active v1 participation blocks placement');
reset role;
update public.race_participant_teams_v1 set race_id=fixture.uid(351) where owner_club_id=:'original_club'::uuid;
-- Snapshot the complete protected rows in synthetic test data.
create temp table before_move as select id,owner_user_id,cash_balance,season_points from public.clubs;
create temp table before_trial as select * from public.saturn_test_accounts_v1;
create temp table before_premium as select * from public.premium_welcome_trials_v1;
create temp table before_roster as select * from public.club_riders;
set local role authenticated;
select public.saturn_place_converted_test_team_v1() as placement \gset
select fixture.assert_ok(:'placement'::jsonb->>'status'='moved_to_approved_vacancy' and :'placement'::jsonb->>'club_id'=:'original_club' and :'placement'::jsonb->>'club_tier'='continental' and :'placement'::jsonb->>'world_tier'='3','highest valid vacancy selected; over-cap global, nonexistent, full and incorrect-region alternatives skipped');
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='already_placed','placement retry cannot promote again');
reset role;
select fixture.assert_ok((select count(*)=1 from private.saturn_converted_team_placements_v1 where user_id=fixture.uid(1) and club_id=:'original_club'::uuid),'one durable original club placement audit');
select fixture.assert_ok((select count(*)=0 from fixture.legacy_rebalance),'exact conversion update bypasses legacy overflow trigger');
select fixture.assert_ok((select count(*)=25 from public.clubs where club_tier='worldteam') and (select count(*)=1 from public.clubs where id=fixture.uid(330) and is_ai and is_active and club_tier='proteam') and (select count(*)=2 from public.clubs where club_tier='continental' and tier3_division='fixture-cont'),'no incumbent displaced by conversion');
select fixture.assert_ok(not exists(select * from before_move except select id,owner_user_id,cash_balance,season_points from public.clubs) and not exists(select * from before_trial except select * from public.saturn_test_accounts_v1) and not exists(select * from before_premium except select * from public.premium_welcome_trials_v1) and not exists(select * from before_roster except select * from public.club_riders),'owner, cash, season points, Premium, original trial and roster remain unchanged');
select fixture.assert_ok((select count(*)=1 from public.race_team_entries where participating_club_id=:'original_club'::uuid and race_id=fixture.uid(351)) and (select count(*)=1 from public.race_team_applications where team_id=:'original_club'::uuid and race_id=fixture.uid(351)) and (select count(*)=1 from public.race_participant_teams where team_id=:'original_club'::uuid and race_id=fixture.uid(351)) and (select count(*)=1 from public.race_participant_teams_v1 where owner_club_id=:'original_club'::uuid and race_id=fixture.uid(351)),'all four completed race records preserved');
-- Force late audit failure and verify that placement and private ticket roll back.
create function fixture.fail_placement_audit() returns trigger language plpgsql as $$begin raise exception 'fixture forced placement audit failure'; end$$;
create trigger fixture_fail_placement before insert on private.saturn_converted_team_placements_v1 for each row execute function fixture.fail_placement_audit();
set local role authenticated;
select set_config('fixture.subject',fixture.uid(4)::text,true);
select fixture.expect_error($q$select public.saturn_place_converted_test_team_v1()$q$,'fixture forced placement audit failure','late audit error rejects conversion placement');
reset role;
select fixture.assert_ok((select club_tier='amateur' and world_tier=10 from public.clubs where id=:'second_club'::uuid) and (select count(*)=0 from private.saturn_converted_team_placements_v1 where user_id=fixture.uid(4)) and (select count(*)=0 from private.saturn_converted_team_update_tickets_v1),'late failure rolls back tier, audit and private ticket');
drop trigger fixture_fail_placement on private.saturn_converted_team_placements_v1;
update private.saturn_converted_vacancy_caps_v1 set enabled=false where club_tier='continental' and region_code='fixture-cont';
set local role authenticated;
select fixture.assert_ok(public.saturn_place_converted_test_team_v1()->>'status'='no_approved_higher_vacancy','disabled eligible capacity prevents placement');
reset role;
-- An ordinary non-ticketed human update still invokes the legacy routine.
update public.clubs set club_tier='continental',world_tier=3,tier3_division='fixture-cont',amateur_division=null where id=:'second_club'::uuid;
select fixture.assert_ok((select count(*)=1 from fixture.legacy_rebalance),'ordinary human tier update still invokes legacy rebalance');
select fixture.assert_ok((select count(*)=0 from private.saturn_converted_team_update_tickets_v1),'no placement tickets remain');
rollback;
\echo 'SATURN CONVERTED PLACEMENT FIXTURE PASSED (synthetic league/season/legacy trigger dependencies)'
