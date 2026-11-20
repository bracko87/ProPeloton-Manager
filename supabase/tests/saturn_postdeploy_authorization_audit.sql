-- SATURN POST-MIGRATION AUTHORIZATION AUDIT (READ-ONLY)
-- Run only on isolated staging AFTER draft migrations are applied.
-- This script never enables rollout, calls mutations or creates fake users.
with checks(check_id, passed, explanation) as (
  values
  ('lifecycle_table_exists',
    to_regclass('public.saturn_test_accounts_v1') is not null,
    '14-day lifecycle table was created'),
  ('lifecycle_rls_enabled',
    exists(select 1 from pg_class where oid=to_regclass('public.saturn_test_accounts_v1') and relrowsecurity),
    'Lifetime rows are governed by RLS for browser callers'),
  ('lifecycle_does_not_force_owner_rls',
    exists(select 1 from pg_class where oid=to_regclass('public.saturn_test_accounts_v1') and not relforcerowsecurity),
    'A privileged SECURITY DEFINER server procedure can create term records'),
  ('anonymous_cannot_insert_lifecycle',
    not coalesce(has_table_privilege('anon',to_regclass('public.saturn_test_accounts_v1'),'INSERT'),false),
    'No direct guest insert of dates'),
  ('authenticated_cannot_insert_lifecycle',
    not coalesce(has_table_privilege('authenticated',to_regclass('public.saturn_test_accounts_v1'),'INSERT'),false),
    'No direct signed-in insert of dates'),
  ('authenticated_cannot_update_lifecycle',
    not coalesce(has_table_privilege('authenticated',to_regclass('public.saturn_test_accounts_v1'),'UPDATE'),false),
    'No extensions by forged UPDATE'),
  ('authenticated_cannot_delete_lifecycle',
    not coalesce(has_table_privilege('authenticated',to_regclass('public.saturn_test_accounts_v1'),'DELETE'),false),
    'No delete-and-recreate first-week trial'),
  ('authenticated_may_read_lifecycle',
    coalesce(has_table_privilege('authenticated',to_regclass('public.saturn_test_accounts_v1'),'SELECT'),false),
    'Own account status will be protected by self-read policy'),
  ('self_read_policy_exists',
    exists(select 1 from pg_policies where schemaname='public'
      and tablename='saturn_test_accounts_v1'
      and policyname='saturn_test_accounts_read_self_v1'
      and cmd='SELECT'),
    'Trial status is readable by exact canonical owner'),
  ('creation_rpc_exists',
    to_regprocedure('public.saturn_create_test_club_v1(text,text,text,text,text)') is not null,
    'Dedicated real-club creation function compiled'),
  ('creation_rpc_denied_to_anon',
    not coalesce(has_function_privilege('anon',
      to_regprocedure('public.saturn_create_test_club_v1(text,text,text,text,text)'),'EXECUTE'),false),
    'Test club is still blocked before verified launch'),
  ('creation_rpc_denied_to_authenticated',
    not coalesce(has_function_privilege('authenticated',
      to_regprocedure('public.saturn_create_test_club_v1(text,text,text,text,text)'),'EXECUTE'),false),
    'No game account can launch a guest team without staged authorization'),
  ('trial_write_helper_exists',
    to_regprocedure('public.saturn_trial_direct_write_allowed_v1(uuid)') is not null,
    'Restrictive direct-write policies use canonical helper'),
  ('guest_auth_gate_still_off',
    coalesce((select not enabled from private.ppm_guest_auth_gate_v1 where id=true),false),
    'Never open guest signup until full test and anti-farming checks pass'),
  ('test_club_gate_still_off',
    coalesce((select not enabled from private.saturn_test_club_rollout_v1 where id=true),false),
    'Real test team creation gate remains disabled after SQL deployment')
)
select check_id,passed,explanation from checks order by check_id;

-- Verify new restrictive policy counts without changing any data.
select tablename,cmd,count(*) as restrictive_policy_count
from pg_policies
where schemaname='public'
  and policyname like 'saturn_trial_%'
  and permissive='RESTRICTIVE'
group by tablename,cmd order by tablename,cmd;

-- Check roster visibility after changing to invoker context.
select c.relkind,c.reloptions
from pg_class c where c.oid=to_regclass('public.club_roster');
