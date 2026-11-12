-- ProPeloton Manager: retain precise diagnostics for a protected season-transition
-- freshness failure. No validation is bypassed, no player data is modified.
-- Idempotent because this change may already exist in production.
CREATE OR REPLACE FUNCTION private.migration_freshness_diagnostics_v1(p_target_season integer)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO 'public','private','pg_temp'
AS $diag$
WITH grouped AS (
 SELECT c.club_tier::text tier,
  CASE WHEN c.club_tier::text='worldteam' THEN 'WORLD'
       WHEN c.club_tier::text='proteam' THEN c.tier2_division::text
       WHEN c.club_tier::text='continental' THEN c.tier3_division::text
       WHEN c.club_tier::text='amateur' THEN c.amateur_division::text END division,
  COUNT(*) n, COUNT(*) FILTER(WHERE c.is_active) active,
  COUNT(*) FILTER(WHERE c.is_ai) ai
 FROM public.clubs c
 WHERE c.deleted_at IS NULL
   AND c.club_tier::text IN ('worldteam','proteam','continental','amateur')
   AND NOT public.is_nonclub_national_ranking_identity_v1(c.id)
 GROUP BY 1,2
), bad_groups AS (
 SELECT tier,division,n,active,ai FROM grouped
 WHERE division IS NULL
   OR (tier='worldteam' AND n<>25)
   OR (tier='proteam' AND n NOT BETWEEN 20 AND 25)
   OR (tier='continental' AND n NOT BETWEEN 20 AND 25)
   OR (tier='amateur' AND n<10)
), bad_jan AS (
 SELECT r.id,r.name,r.start_date::date race_date,
 e.race_id IS NOT NULL has_entry_rules,
 e.race_season_number rule_season,
 jsonb_build_array(e.applications_open_season_number,e.applications_open_month_number,e.applications_open_day_number) as open_parts,
 public.make_game_rule_date_v1(e.applications_close_season_number,e.applications_close_month_number,e.applications_close_day_number) as close_date,
 public.make_game_rule_date_v1(e.team_list_announcement_season_number,e.team_list_announcement_month_number,e.team_list_announcement_day_number) as announcement_date,
 public.make_game_rule_date_v1(e.rider_submission_deadline_season_number,e.rider_submission_deadline_month_number,e.rider_submission_deadline_day_number) as rider_deadline_date,
 public.make_game_rule_date_v1(e.ai_fill_deadline_season_number,e.ai_fill_deadline_month_number,e.ai_fill_deadline_day_number) as ai_fill_date,
 e.application_window_policy,e.application_deadline_policy
 FROM public.races r LEFT JOIN public.race_entry_rules e ON e.race_id=r.id
 WHERE EXTRACT(YEAR FROM r.start_date)::integer=1999+p_target_season
   AND EXTRACT(MONTH FROM r.start_date)::integer=1
   AND EXTRACT(DAY FROM r.start_date)::integer<=15
   AND r.status<>'archived'
   AND (e.race_id IS NULL
      OR e.applications_open_season_number<>p_target_season
      OR e.applications_open_month_number<>1
      OR e.applications_open_day_number<>1
      OR public.make_game_rule_date_v1(e.applications_close_season_number,e.applications_close_month_number,e.applications_close_day_number)<>r.start_date::date-1
      OR public.make_game_rule_date_v1(e.team_list_announcement_season_number,e.team_list_announcement_month_number,e.team_list_announcement_day_number)<>r.start_date::date-1
      OR public.make_game_rule_date_v1(e.rider_submission_deadline_season_number,e.rider_submission_deadline_month_number,e.rider_submission_deadline_day_number)<>r.start_date::date
      OR public.make_game_rule_date_v1(e.ai_fill_deadline_season_number,e.ai_fill_deadline_month_number,e.ai_fill_deadline_day_number)<>r.start_date::date-1)
)
SELECT jsonb_build_object(
 'bad_groups',(SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM (SELECT * FROM bad_groups ORDER BY tier,division LIMIT 25) a),
 'bad_january',(SELECT COALESCE(jsonb_agg(to_jsonb(b)),'[]'::jsonb) FROM (SELECT * FROM bad_jan ORDER BY race_date,name LIMIT 20) b)
);
$diag$;

REVOKE ALL ON FUNCTION private.migration_freshness_diagnostics_v1(integer) FROM PUBLIC,anon,authenticated;

DO $add_diagnostics$
DECLARE
 v_src text;
 v_old_message text := 'bad_january %, stale_contract_negotiations %''';
 v_new_message text := 'bad_january %, stale_contract_negotiations %, diagnostics %''';
 v_old_tail text := E'v_stale_contract_negotiations;\n  end if;';
 v_new_tail text := E'v_stale_contract_negotiations,\n      private.migration_freshness_diagnostics_v1(p_target_season)::text;\n  end if;';
BEGIN
 SELECT pg_get_functiondef('public.verify_new_season_fresh_state_v1(integer,integer)'::regprocedure) INTO v_src;
 IF v_src IS NULL THEN
   RAISE EXCEPTION 'Freshness validator missing; refusing patch';
 END IF;
 -- A previously applied patch remains unchanged on repeated deployments.
 IF strpos(v_src,v_new_message)>0
    AND strpos(v_src,'private.migration_freshness_diagnostics_v1(p_target_season)::text')>0
 THEN
   RETURN;
 END IF;
 IF (length(v_src)-length(replace(v_src,v_old_message,'')))/length(v_old_message)<>1
    OR (length(v_src)-length(replace(v_src,v_old_tail,'')))/length(v_old_tail)<>1
 THEN
   RAISE EXCEPTION 'Freshness validator source changed; refusing patch';
 END IF;
 v_src := replace(replace(v_src,v_old_message,v_new_message),v_old_tail,v_new_tail);
 EXECUTE v_src;
END
$add_diagnostics$;
