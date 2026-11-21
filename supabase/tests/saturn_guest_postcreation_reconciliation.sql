-- Project Saturn: read-only staging reconciliation AFTER enabling isolated
-- guest onboarding and creating isolated TEST fixtures. Never mutate teams.
-- Run against isolated staging after the Saturn lifecycle migrations.
-- Detects missing roster, owner membership, divergent finance summary,
-- incorrect 168h premium and 336h guest periods or missing official identity.
with memberships as (
  select m.club_id, m.user_id,
    count(*) filter (where m.role='owner') as owner_memberships
  from public.club_memberships m
  group by m.club_id,m.user_id
), roster as (
  select cr.club_id,
    count(*) as rider_count,
    count(*) filter (where r.country_code=c.country_code) as domestic_riders
  from public.club_riders cr
  join public.riders r on r.id=cr.rider_id
  join public.clubs c on c.id=cr.club_id
  group by cr.club_id
), premium as (
  select p.user_id,count(*) as trial_rows,
    min(p.started_at) as premium_start,
    max(p.expires_at) as premium_expires_at
  from public.premium_welcome_trials_v1 p
  group by p.user_id
)
select t.user_id,t.club_id,
 c.club_tier::text as category,c.world_tier,c.amateur_division,
 coalesce(m.owner_memberships,0) as owner_memberships,
 coalesce(ro.rider_count,0) as roster_riders,
 coalesce(ro.domestic_riders,0) as domestic_riders,
 c.cash_balance as authoritative_cash,
 f.current_balance as finance_summary_cash,
 coalesce(pr.trial_rows,0) as premium_entitlements,
 t.started_at,t.premium_ends_at,t.expires_at,t.converted_at,
 array_remove(array[
   case when c.id is null or c.owner_user_id is distinct from t.user_id
         or c.is_ai is distinct from false or c.club_type is distinct from 'main'
     then 'incorrect_club_identity' end,
   case when coalesce(m.owner_memberships,0)<>1
     then 'incorrect_owner_membership' end,
   case when coalesce(ro.rider_count,0)<>10
     then 'incorrect_starter_roster' end,
   case when coalesce(ro.domestic_riders,0)<>10
     then 'incorrect_domestic_roster' end,
   case when f.club_id is null or f.current_balance is distinct from c.cash_balance
     then 'finance_balance_mismatch' end,
   case when coalesce(pr.trial_rows,0)<>1
     then 'missing_or_duplicate_premium_trial' end,
   case when pr.premium_start is distinct from t.started_at
          or pr.premium_expires_at is distinct from t.premium_ends_at
     then 'premium_window_mismatch' end,
   case when t.expires_at is distinct from t.started_at+interval '336 hours'
          or t.premium_ends_at is distinct from t.started_at+interval '168 hours'
     then 'invalid_trial_clock' end,
   case when c.club_tier is distinct from 'amateur'::public.club_tier
          and t.converted_at is null
     then 'unconverted_club_left_amateur' end
 ],null) as integrity_issues
from public.saturn_test_accounts_v1 t
left join public.clubs c on c.id=t.club_id
left join memberships m on m.club_id=t.club_id and m.user_id=t.user_id
left join roster ro on ro.club_id=t.club_id
left join public.club_finance_summary f on f.club_id=t.club_id
left join premium pr on pr.user_id=t.user_id
order by t.started_at,t.user_id;
