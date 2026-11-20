-- SATURN PRE-DEPLOY DATABASE PREFLIGHT (READ-ONLY)
-- Run ONLY against an isolated Supabase staging database before applying
-- any SATURN migrations. All results must be reviewed; failures block rollout.
-- No user data is inserted, updated, or deleted by this script.
-- Expected shape is grounded in live production schema checked 2026-11-20.

with checks(check_id,passed,explanation) as (
  values
    ('auth_anonymous_column',
      exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='is_anonymous'),
      'Supabase Auth contains canonical is_anonymous, never trust raw user metadata'),
    ('guest_auth_gate_exists',
      to_regclass('private.ppm_guest_auth_gate_v1') is not null,
      'Existing independent production anonymous-signup gate must be present'),
    ('clubs_real_table',
      exists(select 1 from pg_class where oid=to_regclass('public.clubs') and relkind='r'),
      'Official clubs is a real base table'),
    ('club_tier_enum_exists',
      to_regtype('public.club_tier') is not null,
      'Creation/AI-swap SQL casts to public.club_tier'),
    ('club_roster_nonupdatable_view',
      exists(select 1 from pg_class where oid=to_regclass('public.club_roster') and relkind='v')
       and coalesce(pg_relation_is_updatable(to_regclass('public.club_roster'),true),0)=0,
      'club_roster must remain a read-only JOIN view'),
    ('club_riders_has_rls',
      exists(select 1 from pg_class where oid=to_regclass('public.club_riders') and relrowsecurity),
      'club_riders base table already uses RLS'),
    ('riders_has_rls',
      exists(select 1 from pg_class where oid=to_regclass('public.riders') and relrowsecurity),
      'riders base table already uses RLS'),
    ('view_owner_context_needs_review',
      exists(select 1 from pg_class where oid=to_regclass('public.club_roster') and (reloptions is null or not (reloptions @> array['security_invoker=true']::text[]))),
      'Current owner-context view requires expected public-visibility review'),
    ('club_memberships_exists',to_regclass('public.club_memberships') is not null,'Real club membership setup exists'),
    ('club_settings_exists',to_regclass('public.club_settings') is not null,'Real club settings setup exists'),
    ('club_finance_summary_exists',to_regclass('public.club_finance_summary') is not null,'Real club finance summary exists'),
    ('premium_welcome_trials_exists',to_regclass('public.premium_welcome_trials_v1') is not null,'Canonical 7-day Premium welcome entitlement exists'),
    ('region_mapper_exists',to_regprocedure('public.safe_get_amateur_division_for_country(text)') is not null,'Use the existing server country-to-amateur-region mapping'),
    ('club_initializer_exists',to_regprocedure('public.finance_setup_new_club(uuid)') is not null,'Use normal account setup function'),
    ('initial_balance_exists',to_regprocedure('public.apply_new_club_creation_balance_v1(uuid,boolean)') is not null,'Use normal club starting financial rules'),
    ('race_entrant_legacy_exists',to_regclass('public.race_participant_teams') is not null,'Historical race history must be protected'),
    ('race_entrant_v1_exists',to_regclass('public.race_participant_teams_v1') is not null,'New race history must also be protected'),
    ('race_application_exists',to_regclass('public.race_team_applications') is not null,'AI candidate cannot have any previous race application'),
    ('guest_owner_guard_exists',to_regprocedure('public.ppm_reject_guest_owned_clubs_v1()') is not null,'Existing guest-ownership trigger must be adapted narrowly'),
    ('ai_swap_trigger_exists',to_regprocedure('public.trg_assign_new_real_club_to_ai_slot()') is not null,'Existing permanent-team AI placement must remain unchanged'),
    ('permanent_team_allocator_exists',to_regprocedure('public.assign_new_club_to_ai_slot(uuid)') is not null,'Original permanent player team allocation remains available')
)
select check_id, passed, explanation
from checks
order by check_id;

-- Staging MUST establish correct 14-day lifecycle DDL and verify role grants
-- separately AFTER migrations are applied, before enabling any rollout gate.
-- On an unmodified copy of production, the below count should be zero.
select count(*) as existing_anonymous_user_count
from auth.users
where is_anonymous is true;
