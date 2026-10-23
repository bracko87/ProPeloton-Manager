-- Include disabled/pending competition members in header rank calculations
-- so header rank matches the live canonical table. No club data changes.
-- Their effective points remain zero and they remain below active clubs.

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
    WHERE (
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
