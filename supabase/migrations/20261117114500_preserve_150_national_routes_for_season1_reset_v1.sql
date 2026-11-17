-- Preserve exactly one season-independent usable national route per country
-- before the S2 calendar is deleted. The 150 selected stages are either
-- S1 dated stages or hidden undated stages that survive a restart.
CREATE TABLE IF NOT EXISTS private.game_world_reset_s1_national_route_baseline_v1 (
 country_code text PRIMARY KEY,
 source_stage_id uuid NOT NULL,
 source_race_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN ('season1','hidden')),
 from_edition_season integer NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.game_world_reset_s1_national_route_baseline_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_world_reset_s1_national_route_baseline_v1 FROM PUBLIC,anon,authenticated;

WITH candidates AS (
 SELECT n2.country_code,
   CASE WHEN s1.id IS NOT NULL AND r1.start_date>=date '2000-01-01'
     AND r1.start_date<date '2001-01-01' THEN s1.id
     WHEN s2.id IS NOT NULL AND r2.start_date IS NULL AND s2.stage_date IS NULL
       THEN s2.id END stage_id,
   CASE WHEN s1.id IS NOT NULL AND r1.start_date>=date '2000-01-01'
     AND r1.start_date<date '2001-01-01' THEN 'season1'
     WHEN s2.id IS NOT NULL AND r2.start_date IS NULL AND s2.stage_date IS NULL
       THEN 'hidden' END source_kind,
   CASE WHEN s1.id IS NOT NULL AND r1.start_date>=date '2000-01-01'
     AND r1.start_date<date '2001-01-01' THEN 1 ELSE 2 END edition_season
 FROM public.national_championship_editions n2
 LEFT JOIN public.national_championship_editions n1
   ON n1.country_code=n2.country_code AND n1.season_number=1
 LEFT JOIN public.race_stages s1 ON s1.id=n1.final_source_stage_id
 LEFT JOIN public.races r1 ON r1.id=s1.race_id
 LEFT JOIN public.race_stages s2 ON s2.id=n2.final_source_stage_id
 LEFT JOIN public.races r2 ON r2.id=s2.race_id
 WHERE n2.season_number=2 AND n2.route_status='ready'
), mapped AS (
 SELECT c.country_code,c.stage_id,s.race_id,c.source_kind,c.edition_season
 FROM candidates c JOIN public.race_stages s ON s.id=c.stage_id
 JOIN public.races r ON r.id=s.race_id
 WHERE (c.source_kind='season1' AND r.start_date<date '2001-01-01')
    OR (c.source_kind='hidden' AND r.start_date IS NULL AND s.stage_date IS NULL)
)
INSERT INTO private.game_world_reset_s1_national_route_baseline_v1(
 country_code,source_stage_id,source_race_id,source_kind,from_edition_season
)
SELECT country_code,stage_id,race_id,source_kind,edition_season FROM mapped
ON CONFLICT (country_code) DO NOTHING;

DO $verify$
DECLARE n int; valid_n int;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE
   public.national_championship_source_stage_eligible_v1(source_stage_id,country_code))
 INTO n,valid_n
 FROM private.game_world_reset_s1_national_route_baseline_v1;
 IF n<>150 OR valid_n<>150 THEN
   RAISE EXCEPTION 'Season 1 national source map incomplete: %, eligible %',n,valid_n;
 END IF;
END $verify$;

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

 -- Two national teams have no club in the 499-club roster baseline. Provide
 -- ten new domestic, unattached riders each, so national ranking and
 -- championships remain possible without making fake club teams.
 FOR v_country IN SELECT code FROM public.countries WHERE code IN ('BT','BW') ORDER BY code
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

REVOKE ALL ON FUNCTION private.game_world_reset_restore_s1_national_world_v1()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_restore_s1_national_world_v1()
 TO service_role;

-- Full-world core must already include the independent fail-closed execution
-- guard from the preceding migration. Abort if that guard is absent.
DO $patch$
DECLARE
 v_source text;
 v_anchor text:=E'    -- Fresh staff market: repeat the canonical capped refill';
BEGIN
 SELECT pg_get_functiondef('public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure)
 INTO v_source;
 IF position('private.game_world_reset_execute_guard_v1(p_reset_run_id)' IN v_source)=0
 THEN RAISE EXCEPTION 'Missing backup and player safety guard; abort national hook'; END IF;

 IF strpos(v_source,'private.game_world_reset_restore_s1_national_world_v1()')=0 THEN
   IF (length(v_source)-length(replace(v_source,v_anchor,'')))/length(v_anchor)<>1
   THEN RAISE EXCEPTION 'Core reset changed; abort national rebuild hook'; END IF;
   v_source:=replace(v_source,v_anchor,
      E'    -- Rebuild and validate all 150 S1 national championships.\n    perform private.game_world_reset_restore_s1_national_world_v1();\n\n'||v_anchor);
   EXECUTE v_source;
 END IF;
END $patch$;
