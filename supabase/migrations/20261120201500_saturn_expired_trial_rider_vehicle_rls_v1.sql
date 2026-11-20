-- SAT-08: additional restrictive direct-write RLS on existing RLS-enabled
-- rider contract and club vehicle tables. All five have club_id uuid.
-- Uses existing server-owned 14-day test term helper from prior migration.
-- Do not enable Guest Mode until reviewed live JWT/engine staging tests.
-- No SELECT changes and no new permissive privileges.

drop policy if exists saturn_trial_rider_contracts_insert_v1 on public.rider_contracts;
create policy saturn_trial_rider_contracts_insert_v1 on public.rider_contracts
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_rider_contracts_update_v1 on public.rider_contracts;
create policy saturn_trial_rider_contracts_update_v1 on public.rider_contracts
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_rider_contracts_delete_v1 on public.rider_contracts;
create policy saturn_trial_rider_contracts_delete_v1 on public.rider_contracts
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

drop policy if exists saturn_trial_club_riders_insert_v1 on public.club_riders;
create policy saturn_trial_club_riders_insert_v1 on public.club_riders
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_riders_update_v1 on public.club_riders;
create policy saturn_trial_club_riders_update_v1 on public.club_riders
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_riders_delete_v1 on public.club_riders;
create policy saturn_trial_club_riders_delete_v1 on public.club_riders
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

drop policy if exists saturn_trial_club_team_cars_insert_v1 on public.club_team_cars;
create policy saturn_trial_club_team_cars_insert_v1 on public.club_team_cars
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_team_cars_update_v1 on public.club_team_cars;
create policy saturn_trial_club_team_cars_update_v1 on public.club_team_cars
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_team_cars_delete_v1 on public.club_team_cars;
create policy saturn_trial_club_team_cars_delete_v1 on public.club_team_cars
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

drop policy if exists saturn_trial_club_team_buses_insert_v1 on public.club_team_buses;
create policy saturn_trial_club_team_buses_insert_v1 on public.club_team_buses
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_team_buses_update_v1 on public.club_team_buses;
create policy saturn_trial_club_team_buses_update_v1 on public.club_team_buses
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_team_buses_delete_v1 on public.club_team_buses;
create policy saturn_trial_club_team_buses_delete_v1 on public.club_team_buses
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

drop policy if exists saturn_trial_club_equipment_vans_insert_v1 on public.club_equipment_vans;
create policy saturn_trial_club_equipment_vans_insert_v1 on public.club_equipment_vans
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_equipment_vans_update_v1 on public.club_equipment_vans;
create policy saturn_trial_club_equipment_vans_update_v1 on public.club_equipment_vans
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_club_equipment_vans_delete_v1 on public.club_equipment_vans;
create policy saturn_trial_club_equipment_vans_delete_v1 on public.club_equipment_vans
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

