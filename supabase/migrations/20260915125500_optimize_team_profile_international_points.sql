-- Optimize the team-profile international points lookup.
--
-- Root cause:
-- get_team_international_points_summary_v1 previously read
-- team_international_points_by_season_v1 -> international_points_awards_ledger_v1.
-- That ledger resolves club_current_display_name_v1() once per award row, which
-- made a single team-profile lookup take ~10 seconds in production.
--
-- This function preserves the same ranking/points/name semantics, but resolves
-- sponsor display identities set-wise once per club and aggregates directly from
-- race_ranking_point_awards. It also preserves the nullable p_season_year contract.

create or replace function public.get_team_international_points_summary_v1(
  p_team_id uuid,
  p_season_year integer default null
)
returns table(
  international_rank bigint,
  season_year integer,
  team_id uuid,
  team_name_snapshot text,
  international_points numeric,
  oneday_finish_points numeric,
  stage_finish_points numeric,
  leader_day_points numeric,
  final_gc_points numeric,
  scoring_rows bigint,
  scoring_races bigint,
  scoring_stages bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
with params as (
  select
    public.team_ranking_get_current_season_year_v1() as current_season_year,
    public.get_current_game_date_date() as current_game_date
),
active_identity as (
  select distinct on (csi.club_id)
    csi.club_id,
    nullif(csi.display_name, '') as display_name
  from public.club_season_identities csi
  join public.club_sponsors cs
    on cs.id = csi.source_sponsor_id
   and cs.club_id = csi.club_id
  cross join params p
  where cs.status = 'active'
    and cs.sponsor_kind = 'main'
    and coalesce(csi.is_active, false) = true
    and nullif(csi.display_name, '') is not null
    and (
      p.current_game_date is null
      or (
        (csi.starts_game_date is null or csi.starts_game_date <= p.current_game_date)
        and (csi.ends_game_date is null or csi.ends_game_date >= p.current_game_date)
      )
    )
  order by
    csi.club_id,
    csi.season_number desc,
    csi.updated_at desc nulls last,
    csi.created_at desc nulls last
),
display_names as (
  select
    c.id as team_id,
    case
      when c.club_type = 'developing'
       and parent_identity.display_name is not null
        then parent_identity.display_name || ' U23'
      else coalesce(own_identity.display_name, c.name, 'Team')
    end as team_name_snapshot
  from public.clubs c
  left join active_identity own_identity
    on own_identity.club_id = c.id
  left join active_identity parent_identity
    on parent_identity.club_id = c.parent_club_id
),
season_awards as (
  select
    extract(year from coalesce(r.start_date, s.stage_date))::integer as season_year,
    a.race_id,
    a.stage_id,
    a.source_type,
    a.team_id,
    a.team_name_snapshot,
    coalesce(a.team_points, 0)::numeric as team_points
  from public.race_ranking_point_awards a
  left join public.races r
    on r.id = a.race_id
  left join public.race_stages s
    on s.id = a.stage_id
  where a.team_id is not null
    and coalesce(r.start_date, s.stage_date) is not null
    and (
      p_season_year is null
      or extract(year from coalesce(r.start_date, s.stage_date))::integer = p_season_year
    )
),
totals as (
  select
    a.season_year,
    a.team_id,
    coalesce(dn.team_name_snapshot, max(a.team_name_snapshot), 'Team') as team_name_snapshot,
    sum(a.team_points) as international_points,
    sum(a.team_points) filter (where a.source_type = 'oneday_finish') as oneday_finish_points,
    sum(a.team_points) filter (where a.source_type = 'stage_finish') as stage_finish_points,
    sum(a.team_points) filter (where a.source_type = 'leader_day') as leader_day_points,
    sum(a.team_points) filter (where a.source_type = 'final_gc') as final_gc_points,
    count(*) as scoring_rows,
    count(distinct a.race_id) as scoring_races,
    count(distinct a.stage_id) as scoring_stages
  from season_awards a
  left join display_names dn
    on dn.team_id = a.team_id
  group by
    a.season_year,
    a.team_id,
    dn.team_name_snapshot
),
current_teams as (
  select
    p.current_season_year as season_year,
    c.id as team_id,
    coalesce(dn.team_name_snapshot, c.name, 'Team') as team_name_snapshot
  from params p
  join public.clubs c
    on p_season_year is null
    or p.current_season_year = p_season_year
  left join display_names dn
    on dn.team_id = c.id
  where c.deleted_at is null
    and coalesce(c.club_type, 'main') <> 'developing'
    and c.club_tier::text = any (
      array['worldteam','proteam','continental','amateur']::text[]
    )
),
combined as (
  select
    t.season_year,
    t.team_id,
    t.team_name_snapshot,
    coalesce(t.international_points, 0::numeric) as international_points,
    coalesce(t.oneday_finish_points, 0::numeric) as oneday_finish_points,
    coalesce(t.stage_finish_points, 0::numeric) as stage_finish_points,
    coalesce(t.leader_day_points, 0::numeric) as leader_day_points,
    coalesce(t.final_gc_points, 0::numeric) as final_gc_points,
    t.scoring_rows,
    t.scoring_races,
    t.scoring_stages
  from totals t

  union all

  select
    ct.season_year,
    ct.team_id,
    ct.team_name_snapshot,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::bigint,
    0::bigint,
    0::bigint
  from current_teams ct
  where not exists (
    select 1
    from totals t
    where t.season_year = ct.season_year
      and t.team_id = ct.team_id
  )
),
ranked as (
  select
    rank() over (
      partition by c.season_year
      order by c.international_points desc, c.team_name_snapshot, c.team_id
    ) as international_rank,
    c.*
  from combined c
)
select
  r.international_rank,
  r.season_year,
  r.team_id,
  r.team_name_snapshot,
  r.international_points,
  r.oneday_finish_points,
  r.stage_finish_points,
  r.leader_day_points,
  r.final_gc_points,
  r.scoring_rows,
  r.scoring_races,
  r.scoring_stages
from ranked r
where r.team_id = p_team_id
  and (p_season_year is null or r.season_year = p_season_year)
order by r.season_year desc;
$function$;

comment on function public.get_team_international_points_summary_v1(uuid, integer) is
  'Fast team-profile international points summary. Uses set-based club display identity resolution and direct award aggregation to avoid per-award display-name function calls.';
