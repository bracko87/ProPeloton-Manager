create or replace view public.team_international_points_by_season_v1 as  WITH current_season AS MATERIALIZED (
         SELECT team_ranking_get_current_season_year_v1() AS season_year
        ), totals AS MATERIALIZED (
         SELECT l.season_year,
            l.team_id,
            max(l.team_name_snapshot) AS team_name_snapshot,
            sum(l.team_points) AS international_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'oneday_finish'::text) AS oneday_finish_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'stage_finish'::text) AS stage_finish_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'leader_day'::text) AS leader_day_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'final_gc'::text) AS final_gc_points,
            count(*) AS scoring_rows,
            count(DISTINCT l.race_id) AS scoring_races,
            count(DISTINCT l.stage_id) AS scoring_stages
           FROM international_points_awards_ledger_v1 l
          WHERE l.team_id IS NOT NULL AND l.season_year IS NOT NULL
          GROUP BY l.season_year, l.team_id
        ), current_teams AS MATERIALIZED (
         SELECT c.id AS team_id,
            c.name AS team_name_snapshot
           FROM clubs c
          WHERE c.deleted_at IS NULL AND COALESCE(c.club_type, 'main'::text) <> 'developing'::text AND (c.club_tier::text = ANY (ARRAY['worldteam'::text, 'proteam'::text, 'continental'::text, 'amateur'::text]))
        ), combined AS (
         SELECT t.season_year,
            t.team_id,
            t.team_name_snapshot,
            COALESCE(t.international_points, 0::numeric) AS international_points,
            COALESCE(t.oneday_finish_points, 0::numeric) AS oneday_finish_points,
            COALESCE(t.stage_finish_points, 0::numeric) AS stage_finish_points,
            COALESCE(t.leader_day_points, 0::numeric) AS leader_day_points,
            COALESCE(t.final_gc_points, 0::numeric) AS final_gc_points,
            t.scoring_rows,
            t.scoring_races,
            t.scoring_stages
           FROM totals t
        UNION ALL
         SELECT cs.season_year,
            ct.team_id,
            ct.team_name_snapshot,
            0::numeric AS international_points,
            0::numeric AS oneday_finish_points,
            0::numeric AS stage_finish_points,
            0::numeric AS leader_day_points,
            0::numeric AS final_gc_points,
            0::bigint AS scoring_rows,
            0::bigint AS scoring_races,
            0::bigint AS scoring_stages
           FROM current_season cs
             CROSS JOIN current_teams ct
             LEFT JOIN totals t ON t.season_year = cs.season_year AND t.team_id = ct.team_id
          WHERE t.team_id IS NULL
        )
 SELECT rank() OVER (PARTITION BY season_year ORDER BY international_points DESC, team_name_snapshot, team_id) AS international_rank,
    season_year,
    team_id,
    team_name_snapshot,
    international_points,
    oneday_finish_points,
    stage_finish_points,
    leader_day_points,
    final_gc_points,
    scoring_rows,
    scoring_races,
    scoring_stages
   FROM combined;;