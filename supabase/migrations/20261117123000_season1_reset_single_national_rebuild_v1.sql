-- Season 1 reset builder: avoid duplicate nations and do not reject fresh WRC fixtures.
CREATE OR REPLACE FUNCTION private.game_world_reset_rebuild_national_competitions_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_seed jsonb;
 v_created integer;
 v_total integer;
 v_ready integer;
 v_missing integer;
 v_world integer;
 v_nations jsonb;
 v_nations_schedule jsonb;
 v_result jsonb;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.game_world_reset_runs r WHERE r.id=p_reset_run_id AND r.status='source_frozen'
 ) OR NOT EXISTS (
   SELECT 1 FROM public.game_state g JOIN public.game_clock_config c ON c.id=true
   WHERE g.id=true AND g.season_number=1 AND g.month_number=1 AND g.day_number=1
     AND g.is_paused AND c.is_paused AND c.base_season=1
 ) THEN RAISE EXCEPTION 'Competition rebuild is restricted to frozen Season 1 world reset'; END IF;

 -- The earlier S1 bootstrap already created a NEW WRC race. Do not mistake
 -- that freshly generated race for historic test data. Verify that every
 -- current special S1 race is a pristine planned fixture with no result rows.
 IF EXISTS(
  SELECT 1 FROM public.races r
  WHERE r.start_date>=DATE '2000-01-01' AND r.start_date<DATE '2001-01-01'
    AND r.category IN ('NC','NCQ','WRC','WNF','WNQ')
    AND (r.status <> 'scheduled'
      OR EXISTS(SELECT 1 FROM public.race_stage_results rr WHERE rr.race_id=r.id))
 ) THEN RAISE EXCEPTION 'A non-pristine historical S1 championship race survived cleanup'; END IF;

 IF EXISTS(SELECT 1 FROM public.nations_competition_editions) THEN
   RAISE EXCEPTION 'Old World Nations competition edition must be cleared before rebuild';
 END IF;

 -- Fresh rider seeding, all 150 championship routes and WRC are already
 -- created by the earlier private.game_world_reset_restore_s1_national_world_v1().
 -- Do not regenerate a second time; instead validate and build Nations only.
 v_seed:=jsonb_build_object('status','completed_in_earlier_s1_bootstrap');
 v_created:=0;
 SELECT count(*),count(*) FILTER (WHERE route_status='ready' AND climate_status='ready'
     AND final_source_stage_id IS NOT NULL AND status='planned')
 INTO v_total,v_ready
 FROM public.national_championship_editions
 WHERE season_number=1 AND discipline='road';

 SELECT count(*) INTO v_missing
 FROM private.game_world_reset_national_countries_v1 n
 WHERE NOT EXISTS(
   SELECT 1 FROM public.national_championship_editions e
   WHERE e.season_number=1 AND e.discipline='road' AND upper(e.country_code)=n.country_code
 );
 IF (SELECT COUNT(DISTINCT upper(country_code)) FROM public.riders)<>150 THEN
  RAISE EXCEPTION 'Fresh S1 rider population does not cover all 150 countries';
 END IF;
 IF COALESCE((public.national_championship_route_preflight_v1(1)->>'ok')::boolean,false) IS NOT TRUE THEN
  RAISE EXCEPTION 'Fresh S1 national route preflight failed';
 END IF;
 IF v_total<>150 OR v_ready<>150 OR v_missing<>0 THEN
   RAISE EXCEPTION 'Season 1 championships not fully ready: rows %, route-ready %, missing nations %',
    v_total,v_ready,v_missing;
 END IF;

 SELECT count(*) INTO v_world
 FROM public.world_road_championship_editions e
 WHERE e.season_number=1 AND e.route_status='ready' AND e.race_id IS NOT NULL
   AND e.status IN ('planned','ready');
 IF v_world<>1 THEN
   RAISE EXCEPTION 'World Road Championship was not recreated for fresh Season 1';
 END IF;

 v_nations:=public.create_nations_competition_edition_v1(1);
 IF v_nations->>'status'<>'created' OR (v_nations->>'edition_id') IS NULL THEN
   RAISE EXCEPTION 'Fresh Nations championship edition not created: %',v_nations;
 END IF;
 v_nations_schedule:=public.schedule_nations_edition_v1((v_nations->>'edition_id')::uuid);
 IF coalesce((v_nations_schedule->>'scheduled_groups')::integer,0)<1 THEN
   RAISE EXCEPTION 'Fresh Nations championship groups were not scheduled: %',v_nations_schedule;
 END IF;

 v_result:=jsonb_build_object(
  'ok',true,'national_road_editions',v_total,'national_routes_ready',v_ready,
  'new_national_editions',v_created,'special_nation_rider_seed',v_seed,
  'world_road_championship_editions',v_world,
  'world_nations',v_nations,
  'world_nations_scheduled_groups',v_nations_schedule->'scheduled_groups'
 );
 INSERT INTO public.game_world_reset_checkpoints(reset_run_id,phase,checkpoint_type,payload)
 VALUES(p_reset_run_id,'competition_rebuilt','fresh_s1_national_nations_competitions',v_result);
 RETURN v_result;
END;
$function$;
