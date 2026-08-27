create or replace function public.team_ranking_get_ordered_standings_v1(
  p_season_year integer default null,
  p_club_tier text default null,
  p_division text default null
)
returns table(
  ranking_position integer,
  season_year integer,
  team_id uuid,
  team_name text,
  club_tier text,
  division text,
  international_points numeric,
  completed_race_count integer,
  race_reputation_value numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with target_season as (
    select coalesce(
      p_season_year,
      public.team_ranking_get_current_season_year_v1()
    ) as season_year
  ),
  ranking_clubs as (
    select
      c.id as team_id,
      c.name as team_name,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'worldteam' then 'WORLD'
        when c.club_tier::text = 'proteam' then c.tier2_division::text
        when c.club_tier::text = 'continental' then c.tier3_division::text
        when c.club_tier::text = 'amateur' then c.amateur_division::text
        else null
      end as division,
      coalesce(c.reputation, 0)::numeric as race_reputation_value
    from public.clubs c
    where c.deleted_at is null
      and coalesce(c.club_type, 'main') <> 'developing'
      and c.club_tier::text in ('worldteam', 'proteam', 'continental', 'amateur')
      and (
        p_club_tier is null
        or c.club_tier::text = p_club_tier
      )
      and (
        p_division is null
        or case
            when c.club_tier::text = 'worldteam' then 'WORLD'
            when c.club_tier::text = 'proteam' then c.tier2_division::text
            when c.club_tier::text = 'continental' then c.tier3_division::text
            when c.club_tier::text = 'amateur' then c.amateur_division::text
            else null
          end = p_division
      )
  ),
  points as (
    select
      l.team_id,
      sum(l.team_points)::numeric as international_points
    from public.international_points_awards_ledger_v1 l
    join target_season ts
      on ts.season_year = l.season_year
    where l.team_id is not null
    group by l.team_id
  ),
  completed as (
    select
      rsr.team_id,
      count(distinct rsr.race_id)::integer as completed_race_count
    from public.race_stage_results rsr
    join public.races r
      on r.id = rsr.race_id
    join target_season ts
      on extract(year from r.start_date)::integer = ts.season_year
    group by rsr.team_id
  ),
  base as (
    select
      ts.season_year,
      rc.team_id,
      rc.team_name,
      rc.club_tier,
      rc.division,
      coalesce(p.international_points, 0)::numeric as international_points,
      coalesce(cr.completed_race_count, 0)::integer as completed_race_count,
      rc.race_reputation_value
    from ranking_clubs rc
    cross join target_season ts
    left join points p
      on p.team_id = rc.team_id
    left join completed cr
      on cr.team_id = rc.team_id
  )
  select
    row_number() over (
      order by
        base.international_points desc,
        base.completed_race_count desc,
        base.race_reputation_value desc,
        lower(base.team_name) asc,
        base.team_id asc
    )::integer as ranking_position,
    base.season_year,
    base.team_id,
    base.team_name,
    base.club_tier,
    base.division,
    base.international_points,
    base.completed_race_count,
    base.race_reputation_value
  from base
  order by
    base.international_points desc,
    base.completed_race_count desc,
    base.race_reputation_value desc,
    lower(base.team_name) asc,
    base.team_id asc;
$function$;

comment on function public.team_ranking_get_ordered_standings_v1(integer, text, text)
is 'Returns canonical ordered team standings with set-based scoring. International points are aggregated once from the canonical international points ledger, completed races once from stage results, and reputation directly from clubs. Preserves existing ordering while avoiding per-team helper/view execution.';
