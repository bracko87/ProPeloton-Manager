-- SAT-08: correct view-versus-table classification and restrict rider
-- UPDATE by anonymous expired test players, source-only review migration.
--
-- Verified: public.club_roster is a JOIN VIEW (relkind=v) joining club_riders
-- with riders. It has NO INSTEAD OF triggers and is not directly updatable
-- (pg_relation_is_updatable = 0). RLS cannot be enabled on this view.
--
-- Real issue: its current security_invoker=false causes the view owner to
-- determine underlying RLS behavior. This proposed change uses invoker
-- privileges, so club_riders/riders SELECT RLS applies to real player queries.
-- Needs full staging regression for public/national/team pages BEFORE deploy.
-- Current view definition and column list are NOT modified.
alter view public.club_roster set (security_invoker = true);

-- The real 'riders' table is RLS enabled and has an existing
-- authenticated UPDATE owner policy. Add a RESTRICTIVE test-account expiry
-- condition without modifying that permissive policy.
-- Players with permanent accounts keep their original update checks.
drop policy if exists saturn_trial_riders_update_v1 on public.riders;
create policy saturn_trial_riders_update_v1 on public.riders
  as restrictive for update to authenticated
  using (
    exists (
      select 1 from public.club_riders cr
      where cr.rider_id = riders.id
        and public.saturn_trial_direct_write_allowed_v1(cr.club_id)
    )
  )
  with check (
    exists (
      select 1 from public.club_riders cr
      where cr.rider_id = riders.id
        and public.saturn_trial_direct_write_allowed_v1(cr.club_id)
    )
  );

-- No new INSERT/DELETE policies on riders: those operations require a
-- separate analysis of season reset and game-engine actor permissions.
-- Current public guest feature flag and server rollout gates remain OFF.
