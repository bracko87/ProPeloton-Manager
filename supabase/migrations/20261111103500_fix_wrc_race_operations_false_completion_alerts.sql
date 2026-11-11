-- Monitoring-only fix for completed World Road Championships.
-- Race Operations' generic completion gate previously assumed every WRC race
-- must have rows in race_ranking_point_awards. World championships use a
-- separate championship champion/podium-honours posting process instead.
-- This was creating a "completion_incomplete" incident every minute, immediately
-- resolved by championship_race_operations_reconcile_v1, each with a new push.
-- Leave strict core publishing and championship reconciliation checks intact.
-- Do not rewrite results, honours, rankings, payments, or push preferences.
DO $race_ops_fix$
DECLARE
  v_source text;
  v_needle text := 'case when r.category in (''WNQ'',''WNF'') then false else coalesce(cr.ranking_points_enabled, true) end as ranking_points_enabled';
  v_corrected text := 'case when r.category in (''WNQ'',''WNF'',''WRC'') then false else coalesce(cr.ranking_points_enabled, true) end as ranking_points_enabled';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_source
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='race_operations_refresh_base_v1'
    AND pg_get_function_identity_arguments(p.oid)='';

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Race Operations base refresh function is missing';
  END IF;
  IF strpos(v_source,v_corrected)>0 THEN
    RETURN;
  END IF;
  IF strpos(v_source,v_needle)=0
    OR (length(v_source)-length(replace(v_source,v_needle,'')))/length(v_needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected Race Operations function version. Review required before changing live monitoring.';
  END IF;

  EXECUTE replace(v_source,v_needle,v_corrected);
END
$race_ops_fix$;
