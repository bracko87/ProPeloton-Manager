-- SAT-08: ADDITIVE restrictive direct-write RLS for transfers and camps.
-- The canonical eligibility helper was defined in the prior nine-table
-- migration. These constraints COMBINE with existing permissive owner checks.
-- SQL does not grant new access. Scheduler / SECURITY DEFINER audit required.
-- Read access stays unchanged for expired test players.

alter table public.rider_transfer_listings enable row level security;
drop policy if exists saturn_trial_rider_transfer_listings_insert_v1 on public.rider_transfer_listings;
create policy saturn_trial_rider_transfer_listings_insert_v1 on public.rider_transfer_listings
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(seller_club_id));
drop policy if exists saturn_trial_rider_transfer_listings_update_v1 on public.rider_transfer_listings;
create policy saturn_trial_rider_transfer_listings_update_v1 on public.rider_transfer_listings
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(seller_club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(seller_club_id));
drop policy if exists saturn_trial_rider_transfer_listings_delete_v1 on public.rider_transfer_listings;
create policy saturn_trial_rider_transfer_listings_delete_v1 on public.rider_transfer_listings
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(seller_club_id));

alter table public.rider_transfer_offers enable row level security;
drop policy if exists saturn_trial_rider_transfer_offers_insert_v1 on public.rider_transfer_offers;
create policy saturn_trial_rider_transfer_offers_insert_v1 on public.rider_transfer_offers
  as restrictive for insert to authenticated
  with check ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));
drop policy if exists saturn_trial_rider_transfer_offers_update_v1 on public.rider_transfer_offers;
create policy saturn_trial_rider_transfer_offers_update_v1 on public.rider_transfer_offers
  as restrictive for update to authenticated
  using ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)))
  with check ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));
drop policy if exists saturn_trial_rider_transfer_offers_delete_v1 on public.rider_transfer_offers;
create policy saturn_trial_rider_transfer_offers_delete_v1 on public.rider_transfer_offers
  as restrictive for delete to authenticated
  using ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));

alter table public.rider_transfer_negotiations enable row level security;
drop policy if exists saturn_trial_rider_transfer_negotiations_insert_v1 on public.rider_transfer_negotiations;
create policy saturn_trial_rider_transfer_negotiations_insert_v1 on public.rider_transfer_negotiations
  as restrictive for insert to authenticated
  with check ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));
drop policy if exists saturn_trial_rider_transfer_negotiations_update_v1 on public.rider_transfer_negotiations;
create policy saturn_trial_rider_transfer_negotiations_update_v1 on public.rider_transfer_negotiations
  as restrictive for update to authenticated
  using ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)))
  with check ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));
drop policy if exists saturn_trial_rider_transfer_negotiations_delete_v1 on public.rider_transfer_negotiations;
create policy saturn_trial_rider_transfer_negotiations_delete_v1 on public.rider_transfer_negotiations
  as restrictive for delete to authenticated
  using ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));

alter table public.rider_unsolicited_transfer_bids enable row level security;
drop policy if exists saturn_trial_rider_unsolicited_transfer_bids_insert_v1 on public.rider_unsolicited_transfer_bids;
create policy saturn_trial_rider_unsolicited_transfer_bids_insert_v1 on public.rider_unsolicited_transfer_bids
  as restrictive for insert to authenticated
  with check ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));
drop policy if exists saturn_trial_rider_unsolicited_transfer_bids_update_v1 on public.rider_unsolicited_transfer_bids;
create policy saturn_trial_rider_unsolicited_transfer_bids_update_v1 on public.rider_unsolicited_transfer_bids
  as restrictive for update to authenticated
  using ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)))
  with check ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));
drop policy if exists saturn_trial_rider_unsolicited_transfer_bids_delete_v1 on public.rider_unsolicited_transfer_bids;
create policy saturn_trial_rider_unsolicited_transfer_bids_delete_v1 on public.rider_unsolicited_transfer_bids
  as restrictive for delete to authenticated
  using ((public.saturn_trial_direct_write_allowed_v1(buyer_club_id) or public.saturn_trial_direct_write_allowed_v1(seller_club_id)));

alter table public.training_camp_bookings enable row level security;
drop policy if exists saturn_trial_training_camp_bookings_insert_v1 on public.training_camp_bookings;
create policy saturn_trial_training_camp_bookings_insert_v1 on public.training_camp_bookings
  as restrictive for insert to authenticated
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_training_camp_bookings_update_v1 on public.training_camp_bookings;
create policy saturn_trial_training_camp_bookings_update_v1 on public.training_camp_bookings
  as restrictive for update to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id))
  with check (public.saturn_trial_direct_write_allowed_v1(club_id));
drop policy if exists saturn_trial_training_camp_bookings_delete_v1 on public.training_camp_bookings;
create policy saturn_trial_training_camp_bookings_delete_v1 on public.training_camp_bookings
  as restrictive for delete to authenticated
  using (public.saturn_trial_direct_write_allowed_v1(club_id));

