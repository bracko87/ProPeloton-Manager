-- PRE-GUEST rollback only. Explicit operator action; never part of deployment.
-- Keep all public signup switches OFF and prior frontend/Edge version restored.
-- This does NOT remove game records or reopen old insecure finance grants.
-- Do not use this after guest creation, or if other releases changed these
-- objects after Saturn; review current definitions before using.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $rollback$
declare
  v_payload jsonb;
  v_hash text;
  v_row record;
  v_r record;
  v_opt text;
  v_guest_count bigint;
begin
  if current_user<>'postgres' then raise exception 'Requires database owner'; end if;
  if coalesce((select enabled from private.ppm_guest_auth_gate_v1 where id=true),true)
     or exists(select 1 from auth.users where is_anonymous is true)
  then raise exception 'Close signup and verify zero anonymous identities before rollback'; end if;
  if to_regclass('public.saturn_test_accounts_v1') is not null then
    execute 'select count(*) from public.saturn_test_accounts_v1' into v_guest_count;
    if v_guest_count<>0 then raise exception 'Guest history exists; targeted pre-guest rollback is not safe'; end if;
  end if;
  if to_regclass('private.saturn_test_club_rollout_v1') is not null then
    execute 'select count(*) from private.saturn_test_club_rollout_v1 where enabled or public_signup' into v_guest_count;
    if v_guest_count<>0 then raise exception 'Close the official creation gates first'; end if;
  end if;
  select payload,payload_md5 into strict v_payload,v_hash
  from private.saturn_predeploy_schema_backup_v1 where release_key='saturn-20261121-02579b8';
  if v_hash<>md5(v_payload::text) or jsonb_array_length(v_payload->'functions')<>83
     or jsonb_array_length(v_payload->'relations')<>24
  then raise exception 'Rollback snapshot integrity check failed'; end if;
  -- Only drop newly introduced Saturn policies on known baseline relations.
  for v_row in select p.tablename,p.policyname from pg_policies p
    where p.schemaname='public' and (p.policyname like 'saturn_trial_%')
      and exists(select 1 from jsonb_array_elements(v_payload->'relations') r where r->>'name'=p.tablename)
      and not exists(select 1 from jsonb_array_elements(v_payload->'policies') r where r->>'tablename'=p.tablename and r->>'policyname'=p.policyname)
  loop
    execute format('drop policy %I on public.%I',v_row.policyname,v_row.tablename);
  end loop;
  -- New registration triggers only. Existing trigger definitions untouched.
  for v_row in select c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and c.relnamespace='public'::regnamespace
      and t.tgname in ('saturn_guard_coin_ledger_v1','saturn_guard_wallet_v1','saturn_guard_developing_club_v1','saturn_guard_youth_academy_v1','saturn_grant_deferred_welcome_coins_v1')
  loop
    execute format('drop trigger %I on public.%I',v_row.tgname,v_row.relname);
  end loop;
  -- Restore roster invoker option only, never alter the view columns/query.
  select value into strict v_r from jsonb_array_elements(v_payload->'relations') where value->>'name'='club_roster';
  select value into v_opt from jsonb_array_elements_text(
    case when jsonb_typeof(v_r.value->'options')='array' then v_r.value->'options' else '[]'::jsonb end)
    where value like 'security_invoker=%';
  if v_opt is null then execute 'alter view public.club_roster reset (security_invoker)';
  elsif v_opt='security_invoker=true' then execute 'alter view public.club_roster set (security_invoker=true)';
  elsif v_opt='security_invoker=false' then execute 'alter view public.club_roster set (security_invoker=false)';
  else raise exception 'Unexpected view security_invoker option'; end if;
  -- Restore exact old routine definitions; CREATE OR REPLACE preserves owner
  -- and current grants. Retain hardened finance permissions intentionally.
  for v_row in select value from jsonb_array_elements(v_payload->'functions')
  loop
    if to_regprocedure(v_row.value->>'signature') is null then raise exception 'Baseline routine missing'; end if;
    if pg_get_functiondef(to_regprocedure(v_row.value->>'signature'))<>(v_row.value->>'definition') then
      execute v_row.value->>'definition';
    end if;
  end loop;
  -- Keep new lifecycle/approval tables intact and inaccessible. No CASCADE.
  -- Explicitly revoke any browser entry point created by Saturn.
  for v_row in select format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('saturn_create_test_club_v1','saturn_finalize_test_account_email_conversion_v1','saturn_finalize_test_account_google_conversion_v1','saturn_place_converted_test_team_v1')
  loop
    execute format('revoke all on function %s from PUBLIC,anon,authenticated',v_row.signature);
  end loop;
end;
$rollback$;
commit;
-- Check regular manager flows with the restored frontend. The private audit
-- snapshot remains available for separate, authorized grant comparison.
