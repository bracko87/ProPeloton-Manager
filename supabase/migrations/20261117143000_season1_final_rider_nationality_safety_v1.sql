-- Keep all selected S1 restart clubs within the 150-country game universe;
-- the general national helper seeds missing national riders (BT, BW, CF in
-- the verified 2026-11-17 reset snapshot) and creates fresh S1 championships.
CREATE OR REPLACE FUNCTION private.game_world_reset_restore_s1_national_world_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE
 v_country text;
 v_idx integer;
 v_count integer;
 v_existing integer;
 v_created integer:=0;
 v_added_editions integer;
 v_edition_count integer;
 v_route_eligible integer;
 v_rider_countries integer;
 v_preflight jsonb;
BEGIN
 -- Run ONLY inside the frozen full-world reset. Never from a live S2 session.
 IF NOT EXISTS (
    SELECT 1 FROM public.game_state gs
    JOIN public.game_clock_config gc ON gc.id=true
    WHERE gs.id=true AND gs.season_number=1 AND gs.day_number=1
      AND gs.month_number=1 AND gs.is_paused AND gc.is_paused
 ) THEN
   RAISE EXCEPTION 'National rebuild is only permitted inside a paused Season 1 reset';
 END IF;

 SELECT count(*),count(*) FILTER(
    WHERE public.national_championship_source_stage_eligible_v1(source_stage_id,country_code)
 ) INTO v_count,v_route_eligible
 FROM private.game_world_reset_s1_national_route_baseline_v1;
 IF v_count<>150 OR v_route_eligible<>150 THEN
   RAISE EXCEPTION 'Cannot rebuild nations: % mapped; % eligible',v_count,v_route_eligible;
 END IF;

 -- Populate every country not represented by the newly rebuilt club rosters.
 -- All such riders are unattached national candidates, never fictitious clubs.
 -- This naturally includes Bhutan, Botswana and any country whose prior
 -- player-created test club was archived rather than improperly revived as AI.
 FOR v_country IN
   SELECT t.country_code
   FROM private.game_world_reset_national_countries_v1 t
   WHERE NOT EXISTS(
     SELECT 1 FROM public.riders rd WHERE upper(rd.country_code)=t.country_code
   )
   ORDER BY t.country_code
 LOOP
   SELECT count(*) INTO v_existing FROM public.riders WHERE upper(country_code)=v_country;
   IF v_existing<>0 THEN
     RAISE EXCEPTION 'Unexpected surviving % riders during full reset: %',v_country,v_existing;
   END IF;
   FOR v_idx IN 1..10 LOOP
     INSERT INTO public.riders (
      country_code,first_name,last_name,role,
      sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
      morale,potential,birth_date,salary,release_requested,
      market_value,fatigue,fatigue_updated_on,consecutive_heavy_days,availability_status
     ) VALUES (
      v_country,
      public.pick_generated_rider_first_name(v_country),
      public.pick_generated_rider_last_name(v_country),
      'Domestique'::public.rider_role,
      55,55,55,58,55,57,57,56,58,
      60,63,(date '1973-01-01'+(v_idx*113)),750,false,
      65000,0,date '2000-01-01',0,'fit'
     );
     v_created:=v_created+1;
   END LOOP;
 END LOOP;

 SELECT count(DISTINCT upper(country_code)) INTO v_rider_countries
 FROM public.riders WHERE nullif(trim(country_code),'') IS NOT NULL;
 IF v_rider_countries<>150 THEN
   RAISE EXCEPTION 'Fresh national roster covers % countries, expected 150',v_rider_countries;
 END IF;

 -- Recreate new S1 edition records and WRC from the new rider population.
 -- The route source mapping is then corrected to guaranteed persistent
 -- S1/hidden stages; never allow routes which the reset deletes.
 v_added_editions:=public.ensure_national_championship_editions_for_season_v1(1);

 UPDATE public.national_championship_editions n
 SET final_source_stage_id=m.source_stage_id,
     route_status='ready',updated_at=clock_timestamp()
 FROM private.game_world_reset_s1_national_route_baseline_v1 m
 WHERE n.season_number=1 AND n.country_code=m.country_code AND n.discipline='road'
   AND n.status='planned';

 SELECT count(*) INTO v_edition_count
 FROM public.national_championship_editions WHERE season_number=1 AND discipline='road';
 IF v_edition_count<>150 THEN
   RAISE EXCEPTION 'Fresh S1 national editions: %, expected 150',v_edition_count;
 END IF;

 v_preflight:=public.national_championship_route_preflight_v1(1);
 IF coalesce((v_preflight->>'ok')::boolean,false) IS NOT TRUE
   OR coalesce((v_preflight->>'expected_countries')::integer,0)<>150
   OR coalesce((v_preflight->>'ready_countries')::integer,0)<>150
 THEN
   RAISE EXCEPTION 'Fresh S1 championship route validation failed: %',v_preflight;
 END IF;

 RETURN jsonb_build_object(
   'ok',true,'added_country_only_riders',v_created,
   'rider_countries',v_rider_countries,
   'national_editions',v_edition_count,
   'new_edition_rows',v_added_editions,
   'route_validation',v_preflight
 );
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_restore_s1_national_world_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_restore_s1_national_world_v1() TO service_role;

-- Fail closed if the S1 baseline contains any archived club, ownerless ex-player
-- club, unapproved nationality or missing live owned club.
DO $check$
BEGIN
 IF (SELECT count(*) FROM public.game_world_reset_s1_competition_baseline_v1)<>499
 OR EXISTS(SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b JOIN public.clubs c ON c.id=b.club_id WHERE c.deleted_at IS NOT NULL OR (c.owner_user_id IS NULL AND c.is_ai=false))
 OR EXISTS(SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b WHERE NOT EXISTS(SELECT 1 FROM private.game_world_reset_national_countries_v1 t WHERE t.country_code=b.country_code))
 OR EXISTS(SELECT 1 FROM public.clubs c WHERE c.owner_user_id IS NOT NULL AND c.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b WHERE b.club_id=c.id))
 THEN RAISE EXCEPTION 'The full S1 restart club baseline is not safe'; END IF;
END $check$;
