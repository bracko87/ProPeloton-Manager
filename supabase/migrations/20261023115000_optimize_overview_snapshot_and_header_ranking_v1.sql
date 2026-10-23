-- ProPeloton Manager | 2026-10-23 | Forward-only RPC optimization.
-- Replaces the two expensive Overview read functions without touching game data.
-- Same signatures, security mode, season and points/ranking rules.
-- For club BK Novi Beograd: verified before/after rank 20, season 2000:
-- races 27, stages 82, wins 25, podiums 71, top10 158,
-- jerseys 47, bestGc 1, internationalPoints 3800.
-- Production definitions were applied and verified independently.

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
      END AS division_key
    FROM public.team_rankings_view trv
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
        ORDER BY coalesce(p.international_points, 0) DESC,
                 coalesce(p.scoring_races, 0) DESC,
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

CREATE OR REPLACE FUNCTION public.get_overview_season_snapshot_v1(p_club_id uuid, p_season_year integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_game_date date;
  v_start_date date;
  v_end_date date;
  v_result jsonb;
BEGIN
  SELECT public.get_current_game_date_date() INTO v_current_game_date;
  IF v_current_game_date IS NULL THEN
    v_current_game_date := current_date;
  END IF;

  v_start_date := make_date(coalesce(p_season_year, 2000), 1, 1);
  v_end_date := (v_start_date + interval '1 year')::date;

  WITH club_scope AS MATERIALIZED (
    SELECT p_club_id AS club_id
    UNION
    SELECT c.id
    FROM public.clubs c
    WHERE c.parent_club_id = p_club_id
      AND c.club_type = 'developing'
  ),
  team_riders AS MATERIALIZED (
    SELECT DISTINCT cr.rider_id
    FROM public.club_riders cr
    JOIN club_scope cs ON cs.club_id = cr.club_id
  ),
  stage_stats AS (
    SELECT
      count(DISTINCT r.id)::integer AS races,
      count(DISTINCT s.id)::integer AS stages,
      count(*) FILTER (WHERE rsr.rank = 1)::integer AS wins,
      count(*) FILTER (WHERE rsr.rank BETWEEN 1 AND 3)::integer AS podiums,
      count(*) FILTER (WHERE rsr.rank BETWEEN 1 AND 10)::integer AS top10s
    FROM team_riders tr
    JOIN public.race_stage_results rsr ON rsr.rider_id = tr.rider_id
    JOIN public.race_stages s ON s.id = rsr.stage_id
    JOIN public.races r ON r.id = s.race_id
    WHERE s.stage_date >= v_start_date
      AND s.stage_date < v_end_date
      AND s.stage_date <= v_current_game_date
  ),
  award_stats AS (
    SELECT coalesce(sum(coalesce(a.rider_points, a.team_points)), 0)::integer AS international_points
    FROM public.race_ranking_point_awards a
    LEFT JOIN public.race_stages s ON s.id = a.stage_id
    WHERE (
      a.rider_id IN (SELECT rider_id FROM team_riders)
      OR a.team_id IN (SELECT club_id FROM club_scope)
    )
    AND (
      s.stage_date IS NULL
      OR (
        s.stage_date >= v_start_date
        AND s.stage_date < v_end_date
        AND s.stage_date <= v_current_game_date
      )
    )
  ),
  classification_stats AS (
    SELECT
      count(*) FILTER (
        WHERE rcs.rank = 1
          AND lower(rcs.classification_type) NOT IN ('general', 'gc', 'overall')
      )::integer AS jerseys,
      min(rcs.rank) FILTER (
        WHERE lower(rcs.classification_type) IN ('general', 'gc', 'overall')
      )::integer AS best_gc
    FROM team_riders tr
    JOIN public.race_classification_standings rcs ON rcs.rider_id = tr.rider_id
    JOIN public.race_stages s ON s.id = rcs.after_stage_id
    WHERE s.stage_date >= v_start_date
      AND s.stage_date < v_end_date
      AND s.stage_date <= v_current_game_date
  )
  SELECT jsonb_build_object(
    'races', coalesce(ss.races, 0),
    'stages', coalesce(ss.stages, 0),
    'internationalPoints', coalesce(aw.international_points, 0),
    'wins', coalesce(ss.wins, 0),
    'podiums', coalesce(ss.podiums, 0),
    'top10s', coalesce(ss.top10s, 0),
    'jerseys', coalesce(cs.jerseys, 0),
    'bestGc', cs.best_gc
  )
  INTO v_result
  FROM stage_stats ss CROSS JOIN award_stats aw CROSS JOIN classification_stats cs;

  RETURN coalesce(v_result, jsonb_build_object(
    'races', 0,
    'stages', 0,
    'internationalPoints', 0,
    'wins', 0,
    'podiums', 0,
    'top10s', 0,
    'jerseys', 0,
    'bestGc', NULL
  ));
END;
$function$;
