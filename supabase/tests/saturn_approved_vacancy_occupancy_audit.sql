-- Saturn SAT-03: READ-ONLY converted-club vacancy review for STAGING.
-- Run after migration 20261120234500 on an isolated database.
-- This file does not insert, approve, enable or change any leagues.
-- All capacity entries are disabled until an administrator deliberately
-- approves the exact existing category/world-tier/region combination.

with league_occupancy as (
  select c.world_tier,c.club_tier,
    case c.club_tier
      when 'worldteam'::public.club_tier then '-'
      when 'proteam'::public.club_tier then c.tier2_division
      when 'continental'::public.club_tier then c.tier3_division
      when 'amateur'::public.club_tier then c.amateur_division
      else null end as region_code,
    count(*) as active_total,
    count(*) filter (where c.is_ai=true) as active_ai,
    count(*) filter (where c.is_ai=false) as active_human
  from public.clubs c
  where c.is_active=true and c.deleted_at is null and c.club_type='main'
  group by 1,2,3
)
select cap.world_tier,cap.club_tier::text as category,cap.region_code,
  cap.enabled,cap.approved_at,cap.max_teams,
  coalesce(occ.active_total,0) as occupied_teams,
  coalesce(occ.active_ai,0) as ai_teams,
  coalesce(occ.active_human,0) as human_teams,
  case when cap.enabled and cap.approved_at is not null
         and coalesce(occ.active_total,0)>0
    then greatest(0,cap.max_teams-coalesce(occ.active_total,0))
    else 0 end as usable_vacancies,
  case
    when not cap.enabled then 'disabled'
    when cap.approved_at is null then 'not_approved'
    when coalesce(occ.active_total,0)=0 then 'unknown_or_empty_league'
    when occ.active_total>cap.max_teams then 'over_capacity_blocked'
    when occ.active_total=cap.max_teams then 'full'
    else 'vacancy_subject_to_eligibility_and_race_checks'
  end as review_status
from private.saturn_converted_vacancy_caps_v1 cap
left join league_occupancy occ
  on occ.world_tier=cap.world_tier
 and occ.club_tier=cap.club_tier
 and occ.region_code=cap.region_code
order by
  case cap.club_tier
    when 'worldteam'::public.club_tier then 1
    when 'proteam'::public.club_tier then 2
    when 'continental'::public.club_tier then 3
    when 'amateur'::public.club_tier then 4
    else 99 end,
  cap.world_tier,cap.region_code;
