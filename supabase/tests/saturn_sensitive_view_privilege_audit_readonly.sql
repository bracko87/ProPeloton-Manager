-- Project Saturn: **READ ONLY** sensitive-view exposure audit.
-- Safe to execute against production; returns aggregate counts ONLY, no account
-- IDs, personal data, rider names or exact stats.
-- This runs without a user JWT; real-user/guest JWT isolation must be tested
-- separately in a cost-approved staging environment.
--
-- An exposed view leaking a protected column even if the UI hides it is a
-- security defect. Expected after remediation: all *exposed sensitive* counts
-- must be zero under both roles. Do not turn this into a destructive migration.
begin read only;
set local role anon;
select current_user as effective_role,
  (select count(*) from public.club_profile_popup_view
    where club_cash_balance is not null)::integer as rival_club_balance_rows,
  (select count(*) from public.club_profile_popup_view
    where weekly_income is not null)::integer as rival_weekly_income_rows,
  (select count(*) from public.rider_statistics_page_international_v1
    where sprint is not null)::integer as exact_sprint_rows,
  (select count(*) from public.rider_statistics_page_view
    where potential is not null)::integer as exact_potential_rows,
  (select count(*) from public.rider_statistics_view
    where salary is not null)::integer as rider_salary_rows,
  (select count(*) from public.v_rider_modal_skill_ui
    where current_value is not null)::integer as modal_skill_rows,
  (select count(*) from public.v_rider_skill_card_deltas
    where current_value is not null)::integer as card_skill_rows,
  (select count(*) from public.v_rider_latest_weekly_visible_deltas_ui)::integer as weekly_delta_rows,
  (select count(*) from public.club_finance_summary)::integer as directly_readable_finance_rows,
  (select count(*) from public.riders)::integer as directly_readable_rider_rows;
rollback;

begin read only;
set local role authenticated;
-- No request.jwt.claim.sub is set; these queries should never return exact
-- owner-only data merely because the session has the authenticated role.
select current_user as effective_role,
  (select count(*) from public.club_profile_popup_view
    where club_cash_balance is not null)::integer as rival_club_balance_rows,
  (select count(*) from public.rider_statistics_page_international_v1
    where sprint is not null)::integer as exact_sprint_rows,
  (select count(*) from public.v_rider_modal_skill_ui
    where current_value is not null)::integer as modal_skill_rows,
  (select count(*) from public.clubs)::integer as directly_readable_club_rows,
  (select count(*) from public.riders)::integer as directly_readable_rider_rows;
rollback;

-- Metadata-only: list any public view which can run under its owner's
-- privileges. This is a triage list, not a proof all its rows are private.
select c.relname as view_name,
  coalesce(array_to_string(c.reloptions,','),'default_owner_privileges') as security_options,
  has_table_privilege('anon',c.oid,'SELECT') as anon_can_select,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_can_select
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='v'
  and (c.reloptions is null
       or not ('security_invoker=true'=any(c.reloptions)))
  and (has_table_privilege('anon',c.oid,'SELECT')
       or has_table_privilege('authenticated',c.oid,'SELECT'))
order by c.relname;
