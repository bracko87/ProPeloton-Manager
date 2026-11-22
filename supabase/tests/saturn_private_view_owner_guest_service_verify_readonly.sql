-- SAT-09 read-only role/claim simulation for regression diagnostics.
-- This simulates the Postgres request settings; it is NOT an end-to-end
-- test of a cryptographically verified browser JWT.
-- No account identifiers, balance values, rider skills or other PII are output.

begin read only;
select set_config('request.jwt.claim.sub',
  (select c.owner_user_id::text from public.clubs c
    where c.owner_user_id is not null and c.deleted_at is null
      and exists(select 1 from public.club_riders cr where cr.club_id=c.id)
    order by c.created_at desc limit 1), true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select 'simulated_owner' as test,
  auth.uid() is not null as owner_found,
  (select count(*) from public.club_profile_popup_view p
    where p.owner_user_id=auth.uid() and p.club_cash_balance is not null)::int as own_club_balance_rows,
  (select count(*) from public.rider_statistics_page_international_v1
    where sprint is not null)::int as own_riders_with_exact_skills,
  (select count(*) from public.club_profile_popup_view p
    where p.owner_user_id is distinct from auth.uid() and p.club_cash_balance is not null)::int as rivals_with_exact_balances;
rollback;

begin read only;
select set_config('request.jwt.claim.sub',
  (select t.user_id::text from public.saturn_test_accounts_v1 t
    join auth.users a on a.id=t.user_id
    where t.converted_at is null and a.is_anonymous
    limit 1),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select 'simulated_guest' as test,
  auth.uid() is not null as guest_found,
  (select count(*) from public.club_profile_popup_view p
    where p.owner_user_id=auth.uid() and p.club_cash_balance is not null)::int as own_guest_balance_rows,
  (select count(*) from public.club_profile_popup_view p
    where p.owner_user_id is distinct from auth.uid() and p.club_cash_balance is not null)::int as rival_balances_exposed,
  (select count(*) from public.rider_statistics_page_international_v1 r
    where r.sprint is not null and r.club_id not in
      (select c.id from public.clubs c where c.owner_user_id=auth.uid()))::int as rival_skills_exposed;
rollback;

begin read only;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select 'simulated_service_role' as test,
  auth.jwt()->>'role' as claim_role,
  (select count(*) from public.rider_statistics_page_international_v1 where sprint is not null)::int as backend_exact_riders,
  (select count(*) from public.club_profile_popup_view where club_cash_balance is not null)::int as backend_exact_clubs;
rollback;
