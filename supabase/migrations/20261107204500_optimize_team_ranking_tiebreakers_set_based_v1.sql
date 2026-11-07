-- Make current-season team standings set-based rather than executing
-- expensive award and race-history functions once for every club.
-- Existing reward data, rankings, and season boundaries are unchanged.
create or replace view public.team_ranking_tiebreakers_by_season_v1 as
with seasons as materialized (
  select public.team_ranking_get_current_season_year_v1() as season_year
),
ranking_clubs as materialized (
  select c.id as team_id,
         c.name as team_name,
         c.club_tier::text as club_tier,
         c.tier2_division,
         c.tier3_division,
         c.amateur_division,
         c.reputation
  from public.clubs c
  where c.deleted_at is null
    and not public.is_nonclub_national_ranking_identity_v1(c.id)
    and not exists (
      select 1
      from public.national_association_race_team_identities n
      where n.technical_club_id = c.id
        and n.identity_source = 'generated_hidden_national_team'
    )
    and coalesce(c.club_type, 'main') <> 'developing'
    and c.club_tier::text = any (
      array['worldteam','proteam','continental','amateur']::text[]
    )
),
points as materialized (
  select a.team_id, sum(coalesce(a.team_points, 0))::numeric as international_points
  from public.race_ranking_point_awards a
  join public.races r on r.id = a.race_id
  left join public.race_stages st on st.id = a.stage_id
  cross join seasons y
  where extract(year from coalesce(r.start_date, st.stage_date))::integer = y.season_year
  group by a.team_id
),
completed_races as materialized (
  select rs.team_id,
         count(distinct rs.race_id)::integer as completed_race_count
  from public.race_stage_results rs
  join public.races r on r.id = rs.race_id
  cross join seasons y
  where extract(year from r.start_date)::integer = y.season_year
  group by rs.team_id
)
select y.season_year,
       rc.team_id,
       rc.team_name,
       rc.club_tier,
       rc.tier2_division,
       rc.tier3_division,
       rc.amateur_division,
       coalesce(p.international_points, 0)::numeric as international_points,
       coalesce(cr.completed_race_count, 0)::integer as completed_race_count,
       coalesce(rc.reputation, 0)::numeric as race_reputation_value
from seasons y
cross join ranking_clubs rc
left join points p on p.team_id = rc.team_id
left join completed_races cr on cr.team_id = rc.team_id;
