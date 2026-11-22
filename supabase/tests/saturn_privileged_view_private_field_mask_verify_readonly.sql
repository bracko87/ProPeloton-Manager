-- SAT-09 read-only verification: no private exact values for either API role
-- without a verified player JWT. Do not mutate or impersonate players here.
-- Before migration, nonzero values in first columns establish the leak.
-- After migration, every masked count must be ZERO, while the public-row
-- counts should remain nonzero and direct base-table RLS should remain intact.

begin read only;
set local role anon;
select 'anon'::text as tested_role,
 (select count(*) from public.club_profile_popup_view)::int as public_teams,
 (select count(*) from public.club_profile_popup_view where club_cash_balance is not null)::int as exposed_club_cash,
 (select count(*) from public.club_profile_popup_view where weekly_income is not null)::int as exposed_income,
 (select count(*) from public.club_profile_popup_view where owner_display_name is not null)::int as exposed_real_names,
 (select count(*) from public.rider_statistics_page_international_v1)::int as public_rider_stat_rows,
 (select count(*) from public.rider_statistics_page_international_v1 where sprint is not null)::int as exact_sprint,
 (select count(*) from public.rider_statistics_page_international_v1 where potential is not null)::int as exact_potential,
 (select count(*) from public.rider_statistics_view where salary is not null)::int as exact_salary,
 (select count(*) from public.v_rider_modal_skill_ui where current_value is not null)::int as exact_modal_skills,
 (select count(*) from public.v_rider_skill_card_deltas where current_value is not null)::int as exact_skill_cards,
 (select count(*) from public.riders)::int as base_rider_rows;
rollback;

begin read only;
set local role authenticated;
-- No authenticated identity claim; the SQL role alone must grant no ownership.
select 'authenticated_without_jwt'::text as tested_role,
 (select count(*) from public.club_profile_popup_view where club_cash_balance is not null)::int as exposed_club_cash,
 (select count(*) from public.rider_statistics_page_international_v1 where sprint is not null)::int as exact_sprint,
 (select count(*) from public.v_rider_modal_skill_ui where current_value is not null)::int as exact_skills,
 (select count(*) from public.clubs)::int as base_clubs,
 (select count(*) from public.riders)::int as base_riders;
rollback;
