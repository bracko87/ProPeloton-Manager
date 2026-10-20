-- Optimize the read-only global rider statistics page without rewriting race
-- results, point awards or any rider / club records.
--
-- The previous view joined rider_season_overview_v1, which expands the same
-- season ledgers multiple times. Its points view also resolves team display
-- identities for each award, although the statistics page only needs points.
-- This fast path aggregates award points exactly once, then joins the existing
-- achievements and podiums season summaries once each.
--
-- In-place CREATE OR REPLACE retains all 43 columns, downstream view
-- dependencies, ownership, existing grants and the security_invoker setting.
-- The view intentionally continues to expose the current game season only.
CREATE OR REPLACE VIEW public.rider_statistics_page_international_v1
WITH (security_invoker = false)
AS
WITH current_season AS MATERIALIZED (
  SELECT public.team_ranking_get_current_season_year_v1() AS season_year
),
current_rider_club AS MATERIALIZED (
  SELECT DISTINCT ON (cr.rider_id) cr.rider_id, cr.club_id
  FROM public.club_riders cr
  JOIN public.clubs c1 ON c1.id = cr.club_id
  WHERE c1.deleted_at IS NULL
  ORDER BY cr.rider_id, cr.created_at DESC NULLS LAST, cr.club_id
),
points AS MATERIALIZED (
  SELECT
    a.rider_id,
    SUM(COALESCE(a.rider_points, 0::numeric)) AS points,
    SUM(COALESCE(a.rider_points, 0::numeric))
      FILTER (WHERE a.source_type = 'oneday_finish') AS oneday_finish_points,
    SUM(COALESCE(a.rider_points, 0::numeric))
      FILTER (WHERE a.source_type = 'stage_finish') AS stage_finish_points,
    SUM(COALESCE(a.rider_points, 0::numeric))
      FILTER (WHERE a.source_type = 'leader_day') AS leader_day_points,
    SUM(COALESCE(a.rider_points, 0::numeric))
      FILTER (WHERE a.source_type = 'final_gc') AS final_gc_points
  FROM public.race_ranking_point_awards a
  LEFT JOIN public.races race ON race.id = a.race_id
  LEFT JOIN public.race_stages stage ON stage.id = a.stage_id
  CROSS JOIN current_season cs
  WHERE a.rider_id IS NOT NULL
    -- Same season attribution as international_points_awards_ledger_v1.
    AND EXTRACT(YEAR FROM COALESCE(race.start_date, stage.stage_date))::integer = cs.season_year
  GROUP BY a.rider_id
),
achievements AS MATERIALIZED (
  SELECT a.rider_id, a.stage_wins, a.final_jerseys
  FROM public.rider_season_achievements_by_season_v1 a
  JOIN current_season cs ON a.season_year = cs.season_year
),
podiums AS MATERIALIZED (
  SELECT p.rider_id, p.stage_podiums, p.stage_wins_from_results
  FROM public.rider_stage_podiums_by_season_v1 p
  JOIN current_season cs ON p.season_year = cs.season_year
)
SELECT
  r.id,
  r.id AS rider_id,
  cs.season_year,
  COALESCE(
    NULLIF(concat_ws(' ', NULLIF(r.first_name, ''), NULLIF(r.last_name, '')), ''),
    NULLIF(r.display_name, ''),
    r.id::text
  ) AS display_name,
  r.country_code,
  COALESCE(r.role::text, '—'::text) AS role,
  r.overall,
  r.potential,
  r.sprint,
  r.climbing,
  r.time_trial,
  r.endurance,
  r.flat,
  r.recovery,
  r.resistance,
  r.race_iq,
  r.teamwork,
  r.morale,
  r.birth_date,
  r.market_value,
  r.salary,
  r.contract_expires_season,
  r.availability_status,
  r.fatigue,
  r.image_url,
  c.id AS club_id,
  public.club_current_display_name_v1(c.id, c.name) AS club_name,
  c.country_code AS club_country_code,
  c.club_tier::text AS club_tier,
  c.is_ai AS club_is_ai,
  c.is_active AS club_is_active,
  COALESCE(p.points, 0::numeric) AS international_points,
  COALESCE(p.points, 0::numeric) AS season_points_overall,
  COALESCE(p.stage_finish_points, 0::numeric) AS season_points_sprint,
  COALESCE(p.final_gc_points, 0::numeric)
    + COALESCE(p.oneday_finish_points, 0::numeric)
    + COALESCE(p.leader_day_points, 0::numeric) AS season_points_climbing,
  COALESCE(pd.stage_podiums, 0) AS podiums,
  COALESCE(a.final_jerseys, 0) AS jerseys,
  COALESCE(a.stage_wins, pd.stage_wins_from_results, 0) AS stage_wins,
  COALESCE(a.final_jerseys, 0) AS final_jerseys,
  COALESCE(p.oneday_finish_points, 0::numeric) AS oneday_finish_points,
  COALESCE(p.stage_finish_points, 0::numeric) AS stage_finish_points,
  COALESCE(p.leader_day_points, 0::numeric) AS leader_day_points,
  COALESCE(p.final_gc_points, 0::numeric) AS final_gc_points
FROM public.riders r
CROSS JOIN current_season cs
LEFT JOIN points p ON p.rider_id = r.id
LEFT JOIN achievements a ON a.rider_id = r.id
LEFT JOIN podiums pd ON pd.rider_id = r.id
LEFT JOIN current_rider_club crc ON crc.rider_id = r.id
LEFT JOIN public.clubs c ON c.id = crc.club_id
ORDER BY COALESCE(p.points, 0::numeric) DESC, r.id;
