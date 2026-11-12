-- Performance-only, fail-closed repair for Season 1 final ranking snapshot.
-- The canonical international points view is unchanged. Instead of
-- evaluating that expensive view separately for every club, materialize
-- its per-team season rows once and join them to the existing club list.
-- All historical scoring, ordering, and source verification remain intact.
DO $patch$
DECLARE
  v_src text;
  v_cte_old text := '  with base as (';
  v_cte_new text := E'  with season_team_points as materialized (\n    select team_id, international_points\n    from public.team_international_points_by_season_v1\n    where season_year=v_season_year\n  ), base as (';
  v_expr_old text := 'public.team_ranking_get_team_international_points_v1(c.id,v_season_year)::numeric international_points';
  v_expr_new text := 'coalesce(tp.international_points,0)::numeric international_points';
  v_join_old text := E'from public.clubs c\n    where c.deleted_at is null';
  v_join_new text := E'from public.clubs c\n    left join season_team_points tp on tp.team_id=c.id\n    where c.deleted_at is null';
BEGIN
  SELECT pg_get_functiondef('public.snapshot_team_rankings_for_season_v1(integer)'::regprocedure)
    INTO v_src;
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Snapshot function does not exist';
  END IF;
  IF (length(v_src)-length(replace(v_src,v_cte_old,'')))/length(v_cte_old)<>1
     OR (length(v_src)-length(replace(v_src,v_expr_old,'')))/length(v_expr_old)<>1
     OR (length(v_src)-length(replace(v_src,v_join_old,'')))/length(v_join_old)<>1
  THEN
    RAISE EXCEPTION 'Snapshot function differs from audited baseline; aborting safe optimization';
  END IF;
  v_src:=replace(v_src,v_cte_old,v_cte_new);
  v_src:=replace(v_src,v_expr_old,v_expr_new);
  v_src:=replace(v_src,v_join_old,v_join_new);
  EXECUTE v_src;
END
$patch$;