-- 2026-10-23: INACTIVE current-season standing policy
-- Preserve season archives, race results and the international points ledger.
-- Inactive/season-end-pending human clubs (or disabled clubs) remain on the
-- standings with zero EFFECTIVE points, zero tie-breakers, and below active
-- competitors. Historical years preserve their earned points.
-- No club transfer, AI-pool reassignment or account closure is performed.
-- AI pool is already assigned to divisions; no unallocated reserve is known.
-- Existing season-boundary transitions remain unchanged.

CREATE OR REPLACE FUNCTION public.get_club_ranking_summary(p_club_id uuid)
 RETURNS TABLE(competition_label text, rank_position integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH current_season AS MATERIALIZED (
    SELECT public.team_ranking_get_current_season_year_v1()::integer AS season_year
  ),
  requested_club AS MATERIALIZED (
    SELECT
      trv.id,
      trv.club_tier::text AS club_tier,
      CASE
        WHEN trv.club_tier::text = 'worldteam' THEN 'WORLD'
        WHEN trv.club_tier::text = 'proteam' THEN trv.tier2_division::text
        WHEN trv.club_tier::text = 'continental' THEN trv.tier3_division::text
        WHEN trv.club_tier::text = 'amateur' THEN trv.amateur_division::text
      END AS division_key
    FROM public.team_rankings_view trv
    WHERE trv.id = p_club_id
      AND coalesce(trv.is_active, true) = true
      AND trv.club_tier::text IN ('worldteam','proteam','continental','amateur')
  ),
  cohort AS MATERIALIZED (
    SELECT trv.id, trv.name, trv.club_tier::text AS club_tier,
      CASE
        WHEN trv.club_tier::text = 'worldteam' THEN 'WORLD'
        WHEN trv.club_tier::text = 'proteam' THEN trv.tier2_division::text
        WHEN trv.club_tier::text = 'continental' THEN trv.tier3_division::text
        WHEN trv.club_tier::text = 'amateur' THEN trv.amateur_division::text
      END AS division_key,
      (coalesce(active_status.is_active, true) = false OR
        (coalesce(active_status.is_ai, false) = false AND active_status.inactivity_status IN ('inactive','season_end_removal_pending'))
      ) AS inactive_for_standings
    FROM public.team_rankings_view trv
    JOIN public.clubs active_status ON active_status.id = trv.id
    JOIN requested_club mine ON mine.club_tier = trv.club_tier::text
    WHERE coalesce(trv.is_active, true) = true
      AND (
        CASE
          WHEN trv.club_tier::text = 'worldteam' THEN 'WORLD'
          WHEN trv.club_tier::text = 'proteam' THEN trv.tier2_division::text
          WHEN trv.club_tier::text = 'continental' THEN trv.tier3_division::text
          WHEN trv.club_tier::text = 'amateur' THEN trv.amateur_division::text
        END
      ) = mine.division_key
      AND mine.division_key IS NOT NULL
  ),
  points AS (
    SELECT a.team_id,
           coalesce(sum(coalesce(a.team_points, 0)), 0)::numeric AS international_points,
           count(DISTINCT a.race_id)::integer AS scoring_races
    FROM cohort c
    JOIN public.race_ranking_point_awards a ON a.team_id = c.id
    LEFT JOIN public.races r ON r.id = a.race_id
    LEFT JOIN public.race_stages s ON s.id = a.stage_id
    CROSS JOIN current_season cs
    WHERE extract(year from coalesce(r.start_date, s.stage_date))::integer = cs.season_year
    GROUP BY a.team_id
  ),
  ranked AS (
    SELECT c.id, c.name, c.club_tier, c.division_key,
      row_number() OVER (
        ORDER BY c.inactive_for_standings ASC,
                 CASE WHEN c.inactive_for_standings THEN 0 ELSE coalesce(p.international_points, 0) END DESC,
                 CASE WHEN c.inactive_for_standings THEN 0 ELSE coalesce(p.scoring_races, 0) END DESC,
                 lower(c.name) ASC, c.id ASC
      )::integer AS calculated_rank_position
    FROM cohort c LEFT JOIN points p ON p.team_id = c.id
  ),
  target AS (
    SELECT ranked.*, CASE
      WHEN division_key = 'SOUTHERN_BALKAN_EUROPE' THEN 'Southern & Balkan Europe'
      WHEN division_key = 'EAST_SOUTHEAST_ASIA' THEN 'East & Southeast Asia'
      WHEN division_key = 'NORTH_CENTRAL_AMERICA' THEN 'North & Central America'
      WHEN division_key = 'CENTRAL_EASTERN_EUROPE' THEN 'Central & Eastern Europe'
      WHEN division_key = 'NORTH_WESTERN_EUROPE' THEN 'North & Western Europe'
      WHEN division_key = 'PRO_WEST' THEN 'West'
      WHEN division_key = 'PRO_EAST' THEN 'East'
      ELSE initcap(replace(regexp_replace(division_key, '^(PRO_|CONTINENTAL_)', ''), '_', ' '))
    END AS division_label
    FROM ranked WHERE ranked.id = p_club_id
  )
  SELECT CASE
      WHEN t.club_tier='worldteam' THEN 'WorldTeam'
      WHEN t.club_tier='proteam' THEN 'ProTeam: ' || t.division_label
      WHEN t.club_tier='continental' THEN 'Continental: ' || t.division_label
      WHEN t.club_tier='amateur' THEN 'Amateur: ' || t.division_label
      ELSE initcap(t.club_tier)
    END AS competition_label,
    t.calculated_rank_position AS rank_position
  FROM target t LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.team_ranking_get_ordered_standings_v1(p_season_year integer DEFAULT NULL::integer, p_club_tier text DEFAULT NULL::text, p_division text DEFAULT NULL::text)
 RETURNS TABLE(ranking_position integer, season_year integer, team_id uuid, team_name text, club_tier text, division text, international_points numeric, completed_race_count integer, race_reputation_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with target_season as materialized (
    select coalesce(p_season_year, public.team_ranking_get_current_season_year_v1()) as season_year
  ),
  ranking_clubs as materialized (
    select c.id as team_id, c.name as team_name, c.club_tier::text as club_tier,
      case when c.club_tier::text='worldteam' then 'WORLD'
           when c.club_tier::text='proteam' then c.tier2_division::text
           when c.club_tier::text='continental' then c.tier3_division::text
           when c.club_tier::text='amateur' then c.amateur_division::text
           else null end as division,
      coalesce(c.reputation,0)::numeric as race_reputation_value,
      (coalesce(c.is_active,true)=false OR
       (coalesce(c.is_ai,false)=false AND c.inactivity_status IN ('inactive','season_end_removal_pending'))) AS inactive_for_standings
    from public.clubs c
    where c.deleted_at is null and not public.is_nonclub_national_ranking_identity_v1(c.id) and coalesce(c.club_type,'main') <> 'developing'
      and c.club_tier::text in ('worldteam','proteam','continental','amateur')
      and (p_club_tier is null or c.club_tier::text=p_club_tier)
      and (p_division is null or case
        when c.club_tier::text='worldteam' then 'WORLD'
        when c.club_tier::text='proteam' then c.tier2_division::text
        when c.club_tier::text='continental' then c.tier3_division::text
        when c.club_tier::text='amateur' then c.amateur_division::text
        else null end=p_division)
  ),
  points as materialized (
    select l.team_id, sum(l.team_points)::numeric as international_points
    from public.international_points_awards_ledger_v1 l
    join target_season ts on ts.season_year=l.season_year
    where l.team_id is not null group by l.team_id
  ),
  completed as materialized (
    select rsr.team_id, count(distinct rsr.race_id)::integer as completed_race_count
    from public.race_stage_results rsr
    join public.races r on r.id=rsr.race_id
    join target_season ts on extract(year from r.start_date)::integer=ts.season_year
    group by rsr.team_id
  ),
  base as materialized (
    select ts.season_year,rc.team_id,rc.team_name,rc.club_tier,rc.division,
      CASE WHEN ts.season_year=public.team_ranking_get_current_season_year_v1() AND rc.inactive_for_standings
           THEN 0::numeric ELSE coalesce(p.international_points,0)::numeric END international_points,
      CASE WHEN ts.season_year=public.team_ranking_get_current_season_year_v1() AND rc.inactive_for_standings
           THEN 0::integer ELSE coalesce(cr.completed_race_count,0)::integer END completed_race_count,
      CASE WHEN ts.season_year=public.team_ranking_get_current_season_year_v1() AND rc.inactive_for_standings
           THEN 0::numeric ELSE rc.race_reputation_value END race_reputation_value,
      (ts.season_year=public.team_ranking_get_current_season_year_v1() AND rc.inactive_for_standings)
        AS inactive_for_standings
    from ranking_clubs rc cross join target_season ts
    left join points p on p.team_id=rc.team_id
    left join completed cr on cr.team_id=rc.team_id
  )
  select row_number() over (
    order by base.inactive_for_standings asc,base.international_points desc,base.completed_race_count desc,
      base.race_reputation_value desc,lower(base.team_name) asc,base.team_id asc
    )::integer,
    base.season_year,base.team_id,base.team_name,base.club_tier,base.division,
    base.international_points,base.completed_race_count,base.race_reputation_value
  from base order by base.inactive_for_standings asc,base.international_points desc,base.completed_race_count desc,
    base.race_reputation_value desc,lower(base.team_name) asc,base.team_id asc;
$function$;
