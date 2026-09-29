create or replace view public.international_points_awards_ledger_v1 as  SELECT a.race_id,
    r.name AS race_name,
    r.category AS race_category,
    r.status AS race_status,
    a.stage_id,
    s.stage_number,
    s.stage_format,
    s.stage_date,
    EXTRACT(year FROM COALESCE(r.start_date, s.stage_date))::integer AS season_year,
    a.source_type,
    a.classification_type,
    a.rank,
    a.rider_id,
    a.team_id,
    a.display_name_snapshot AS rider_name_snapshot,
    club_current_display_name_v1(a.team_id, a.team_name_snapshot) AS team_name_snapshot,
    COALESCE(a.rider_points, 0)::numeric AS rider_points,
    COALESCE(a.team_points, 0)::numeric AS team_points,
    a.metadata
   FROM race_ranking_point_awards a
     LEFT JOIN races r ON r.id = a.race_id
     LEFT JOIN race_stages s ON s.id = a.stage_id;;