-- SAT-08 (DRAFT): restrictive RLS for direct player-initiated table writes.
-- This is an additional barrier, not a substitute for reviewing SECURITY
-- DEFINER procedures (which can bypass table RLS).
-- Do not deploy until integration tests confirm normal registered-player,
-- anonymous test-player, expiry and game-engine paths. Production gate OFF.

create or replace function public.saturn_trial_direct_write_allowed_v1(p_club_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $saturn$
  select case
    when auth.uid() is null or p_club_id is null then false
    -- CHECK LIFECYCLE BEFORE THE AUTH LABEL. Linking an email or Google
    -- identity can make is_anonymous=false without finalizing Saturn's
    -- verified conversion. An unconverted expired trial remains read-only.
    when public.saturn_test_account_requires_guard_v1() then
      public.saturn_test_account_can_mutate_v1(p_club_id)
    -- The ordinary registered-user path is unchanged, including a fully
    -- verified converted trial (converted_at IS NOT NULL). Existing
    -- permissive club ownership policies still apply independently.
    when exists (
      select 1 from auth.users u
      where u.id=auth.uid() and u.is_anonymous is false
    ) then true
    else false
  end;
$saturn$;
revoke all on function public.saturn_trial_direct_write_allowed_v1(uuid)
  from public, anon, authenticated;
-- Required by the RLS policies, reveals only whether this caller may modify
-- their OWN club. A true result never bypasses any existing RLS permit policy.
grant execute on function public.saturn_trial_direct_write_allowed_v1(uuid)
  to authenticated;

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.clubs enable row level security;
drop policy if exists saturn_trial_clubs_insert_v1 on public.clubs;
create policy saturn_trial_clubs_insert_v1 on public.clubs
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(id));
drop policy if exists saturn_trial_clubs_update_v1 on public.clubs;
create policy saturn_trial_clubs_update_v1 on public.clubs
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(id))
  with check (public.saturn_trial_direct_write_allowed_v1(id));
drop policy if exists saturn_trial_clubs_delete_v1 on public.clubs;
create policy saturn_trial_clubs_delete_v1 on public.clubs
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.club_memberships enable row level security;
drop policy if exists saturn_trial_club_memberships_insert_v1 on public.club_memberships;
create policy saturn_trial_club_memberships_insert_v1 on public.club_memberships
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_memberships_update_v1 on public.club_memberships;
create policy saturn_trial_club_memberships_update_v1 on public.club_memberships
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_memberships_delete_v1 on public.club_memberships;
create policy saturn_trial_club_memberships_delete_v1 on public.club_memberships
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.club_equipment_inventory enable row level security;
drop policy if exists saturn_trial_club_equipment_inventory_insert_v1 on public.club_equipment_inventory;
create policy saturn_trial_club_equipment_inventory_insert_v1 on public.club_equipment_inventory
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_equipment_inventory_update_v1 on public.club_equipment_inventory;
create policy saturn_trial_club_equipment_inventory_update_v1 on public.club_equipment_inventory
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_equipment_inventory_delete_v1 on public.club_equipment_inventory;
create policy saturn_trial_club_equipment_inventory_delete_v1 on public.club_equipment_inventory
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.club_finance_summary enable row level security;
drop policy if exists saturn_trial_club_finance_summary_insert_v1 on public.club_finance_summary;
create policy saturn_trial_club_finance_summary_insert_v1 on public.club_finance_summary
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_finance_summary_update_v1 on public.club_finance_summary;
create policy saturn_trial_club_finance_summary_update_v1 on public.club_finance_summary
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_finance_summary_delete_v1 on public.club_finance_summary;
create policy saturn_trial_club_finance_summary_delete_v1 on public.club_finance_summary
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.club_infrastructure enable row level security;
drop policy if exists saturn_trial_club_infrastructure_insert_v1 on public.club_infrastructure;
create policy saturn_trial_club_infrastructure_insert_v1 on public.club_infrastructure
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_infrastructure_update_v1 on public.club_infrastructure;
create policy saturn_trial_club_infrastructure_update_v1 on public.club_infrastructure
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_infrastructure_delete_v1 on public.club_infrastructure;
create policy saturn_trial_club_infrastructure_delete_v1 on public.club_infrastructure
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.club_staff enable row level security;
drop policy if exists saturn_trial_club_staff_insert_v1 on public.club_staff;
create policy saturn_trial_club_staff_insert_v1 on public.club_staff
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_staff_update_v1 on public.club_staff;
create policy saturn_trial_club_staff_update_v1 on public.club_staff
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_staff_delete_v1 on public.club_staff;
create policy saturn_trial_club_staff_delete_v1 on public.club_staff
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.race_team_entries enable row level security;
drop policy if exists saturn_trial_race_team_entries_insert_v1 on public.race_team_entries;
create policy saturn_trial_race_team_entries_insert_v1 on public.race_team_entries
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_race_team_entries_update_v1 on public.race_team_entries;
create policy saturn_trial_race_team_entries_update_v1 on public.race_team_entries
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_race_team_entries_delete_v1 on public.race_team_entries;
create policy saturn_trial_race_team_entries_delete_v1 on public.race_team_entries
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.rider_regular_training_daily_plans enable row level security;
drop policy if exists saturn_trial_rider_regular_training_daily_plans_insert_v1 on public.rider_regular_training_daily_plans;
create policy saturn_trial_rider_regular_training_daily_plans_insert_v1 on public.rider_regular_training_daily_plans
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_rider_regular_training_daily_plans_update_v1 on public.rider_regular_training_daily_plans;
create policy saturn_trial_rider_regular_training_daily_plans_update_v1 on public.rider_regular_training_daily_plans
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_rider_regular_training_daily_plans_delete_v1 on public.rider_regular_training_daily_plans;
create policy saturn_trial_rider_regular_training_daily_plans_delete_v1 on public.rider_regular_training_daily_plans
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

-- Direct writes only: SELECT remains readable after account expiration.
alter table public.rider_regular_training_management enable row level security;
drop policy if exists saturn_trial_rider_regular_training_management_insert_v1 on public.rider_regular_training_management;
create policy saturn_trial_rider_regular_training_management_insert_v1 on public.rider_regular_training_management
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_rider_regular_training_management_update_v1 on public.rider_regular_training_management;
create policy saturn_trial_rider_regular_training_management_update_v1 on public.rider_regular_training_management
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_rider_regular_training_management_delete_v1 on public.rider_regular_training_management;
create policy saturn_trial_rider_regular_training_management_delete_v1 on public.rider_regular_training_management
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

