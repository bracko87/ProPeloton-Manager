-- Prepared full Season 1 national championship/Nations reset. No data wipe on migration install.
-- Permanent country target codes captured from the existing 150 Season 2 nations.
-- Runs only through the separately guarded and signed-off world reset.

CREATE TABLE IF NOT EXISTS private.game_world_reset_national_countries_v1 (
 country_code text PRIMARY KEY,
 copied_from_season integer NOT NULL DEFAULT 2,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK(country_code ~ '^[A-Z]{2}$')
);
ALTER TABLE private.game_world_reset_national_countries_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_world_reset_national_countries_v1 FROM PUBLIC,anon,authenticated;
INSERT INTO private.game_world_reset_national_countries_v1(country_code) VALUES
 ('AD'),
 ('AE'),
 ('AL'),
 ('AM'),
 ('AO'),
 ('AR'),
 ('AS'),
 ('AT'),
 ('AU'),
 ('AZ'),
 ('BA'),
 ('BD'),
 ('BE'),
 ('BF'),
 ('BG'),
 ('BH'),
 ('BN'),
 ('BO'),
 ('BR'),
 ('BS'),
 ('BT'),
 ('BW'),
 ('BY'),
 ('CA'),
 ('CD'),
 ('CF'),
 ('CH'),
 ('CL'),
 ('CM'),
 ('CN'),
 ('CO'),
 ('CR'),
 ('CV'),
 ('CY'),
 ('CZ'),
 ('DE'),
 ('DK'),
 ('DM'),
 ('DO'),
 ('DZ'),
 ('EC'),
 ('EE'),
 ('EG'),
 ('ES'),
 ('FI'),
 ('FJ'),
 ('FR'),
 ('GA'),
 ('GB'),
 ('GH'),
 ('GI'),
 ('GN'),
 ('GR'),
 ('GT'),
 ('HK'),
 ('HR'),
 ('HT'),
 ('HU'),
 ('ID'),
 ('IE'),
 ('IL'),
 ('IN'),
 ('IQ'),
 ('IR'),
 ('IS'),
 ('IT'),
 ('JM'),
 ('JO'),
 ('JP'),
 ('KE'),
 ('KG'),
 ('KH'),
 ('KR'),
 ('KW'),
 ('KY'),
 ('KZ'),
 ('LA'),
 ('LK'),
 ('LR'),
 ('LS'),
 ('LT'),
 ('MA'),
 ('MD'),
 ('ME'),
 ('MG'),
 ('MK'),
 ('ML'),
 ('MN'),
 ('MR'),
 ('MU'),
 ('MV'),
 ('MW'),
 ('MX'),
 ('MY'),
 ('MZ'),
 ('NA'),
 ('NC'),
 ('NE'),
 ('NG'),
 ('NL'),
 ('NO'),
 ('NP'),
 ('NZ'),
 ('OM'),
 ('PA'),
 ('PE'),
 ('PF'),
 ('PG'),
 ('PH'),
 ('PK'),
 ('PL'),
 ('PR'),
 ('PT'),
 ('PY'),
 ('QA'),
 ('RO'),
 ('RS'),
 ('RU'),
 ('RW'),
 ('SA'),
 ('SC'),
 ('SE'),
 ('SG'),
 ('SI'),
 ('SK'),
 ('SL'),
 ('SM'),
 ('SN'),
 ('TG'),
 ('TH'),
 ('TJ'),
 ('TM'),
 ('TN'),
 ('TO'),
 ('TR'),
 ('TT'),
 ('TW'),
 ('TZ'),
 ('UA'),
 ('UG'),
 ('US'),
 ('UY'),
 ('UZ'),
 ('VE'),
 ('VN'),
 ('VU'),
 ('WS'),
 ('XK'),
 ('ZA'),
 ('ZW')
ON CONFLICT(country_code) DO NOTHING;

DO $assert$ BEGIN IF (SELECT count(*) FROM private.game_world_reset_national_countries_v1)<>150 THEN RAISE EXCEPTION 'Expected 150 nation targets'; END IF; END $assert$;

-- private.game_world_reset_national_readiness_v1()
CREATE OR REPLACE FUNCTION private.game_world_reset_national_readiness_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH desired AS (
 SELECT country_code FROM private.game_world_reset_national_countries_v1
), candidate AS (
 SELECT upper(coalesce(nullif(s.host_country_code,''),r.country_code)) AS cc,
  count(*) FILTER(WHERE (r.start_date IS NULL OR r.start_date < DATE '2001-01-01')
   AND r.category NOT IN ('NC','NCQ','WRC','WNF','WNQ')
   AND coalesce(r.metadata->>'national_championship','false')<>'true') AS persistent_stages,
  count(*) FILTER(WHERE r.start_date IS NULL AND rp.active=true
   AND rp.is_calendar_public=false
   AND 'national_championship'=ANY(rp.intended_uses)) AS hidden_stages
 FROM public.race_stages s
 JOIN public.races r ON r.id=s.race_id
 LEFT JOIN public.race_reserve_pool rp ON rp.race_id=r.id
 WHERE r.start_date IS NULL OR r.start_date<DATE '2001-01-01'
 GROUP BY 1
), eligible AS (
 SELECT d.country_code,coalesce(c.persistent_stages,0) persistent,
   coalesce(c.hidden_stages,0) hidden,
   EXISTS (SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b WHERE upper(b.country_code)=d.country_code) as roster_country
 FROM desired d LEFT JOIN candidate c ON c.cc=d.country_code
)
SELECT jsonb_build_object(
 'read_only',true,
 'reset_not_executed',true,
 'required_nations',(SELECT count(*) FROM desired),
 'permanent_route_nations',(SELECT count(*) FROM eligible WHERE persistent>0),
 'hidden_route_nations',(SELECT count(*) FROM eligible WHERE hidden>0),
 'missing_route_nations',coalesce((SELECT jsonb_agg(country_code ORDER BY country_code) FROM eligible WHERE persistent=0),'[]'::jsonb),
 'roster_baseline_nations',(SELECT count(*) FROM eligible WHERE roster_country),
 'requires_new_starter_riders',coalesce((SELECT jsonb_agg(country_code ORDER BY country_code) FROM eligible WHERE NOT roster_country),'[]'::jsonb),
 'legacy_s1_national_races',(SELECT count(*) FROM public.races WHERE start_date>=DATE '2000-01-01' AND start_date<DATE '2001-01-01' AND category IN ('NC','NCQ','WRC','WNF','WNQ')),
 'completed_s1_nations_editions',(SELECT count(*) FROM public.nations_competition_editions WHERE season_number=1 AND status='completed'),
 'status', CASE WHEN (SELECT count(*) FROM desired)=150
   AND (SELECT count(*) FROM eligible WHERE persistent>0)=150
   THEN 'routes_preserved_but_reset_blocked' ELSE 'national_route_preflight_failed' END
);
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_national_readiness_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_national_readiness_v1() TO service_role;

-- private.game_world_reset_seed_national_starters_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_seed_national_starters_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_cc text;
 v_missing text[];
 v_created int:=0;
 v_first text;
 v_last text;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.game_world_reset_runs r
  WHERE r.id=p_reset_run_id AND r.status='source_frozen'
 ) THEN
  RAISE EXCEPTION 'Cannot seed national riders outside a frozen reset run';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.game_state g JOIN public.game_clock_config c ON c.id=true
  WHERE g.id=true AND g.season_number=1 AND g.month_number=1
    AND g.day_number=1 AND g.is_paused=true
    AND c.is_paused=true AND c.base_season=1
 ) THEN
  RAISE EXCEPTION 'National rider seeding requires a paused Season 1 fresh start';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.race_stage_results sr
  JOIN public.race_stages st ON st.id=sr.stage_id
  WHERE st.stage_date>=DATE '2000-01-01' AND st.stage_date<DATE '2001-01-01'
  LIMIT 1
 ) THEN
  RAISE EXCEPTION 'Cannot seed on top of existing Season 1 race results';
 END IF;

 SELECT coalesce(array_agg(t.country_code ORDER BY t.country_code),array[]::text[])
 INTO v_missing
 FROM private.game_world_reset_national_countries_v1 t
 WHERE NOT EXISTS (SELECT 1 FROM public.riders rd WHERE upper(rd.country_code)=t.country_code);
 IF (SELECT count(*) FROM private.game_world_reset_national_countries_v1)<>150 THEN
  RAISE EXCEPTION 'Nation target table no longer contains 150 countries';
 END IF;
 -- Fail closed if a wider or unexpected country gap is present.
 IF EXISTS(SELECT 1 FROM unnest(v_missing) cc WHERE cc NOT IN('BT','BW')) THEN
  RAISE EXCEPTION 'Unexpected missing nation(s): %; fix roster seeding first',v_missing;
 END IF;

 FOREACH v_cc IN ARRAY v_missing LOOP
  v_first:=public.pick_generated_rider_first_name(v_cc);
  v_last:=public.pick_generated_rider_last_name(v_cc);
  IF nullif(btrim(v_first),'') IS NULL OR nullif(btrim(v_last),'') IS NULL THEN
    RAISE EXCEPTION 'National name pool unavailable for %',v_cc;
  END IF;
  INSERT INTO public.riders(
    country_code,first_name,last_name,role,
    sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
    morale,potential,birth_date,salary,market_value,
    fatigue,fatigue_updated_on,consecutive_heavy_days,availability_status
  ) VALUES (
    v_cc,v_first,v_last,'All-rounder'::public.rider_role,
    54,53,53,55,54,53,53,52,52,
    80,63,DATE '1978-03-12',0,0,
    0,DATE '2000-01-01',0,'fit'
  );
  v_created:=v_created+1;
 END LOOP;

 IF EXISTS (
  SELECT 1 FROM private.game_world_reset_national_countries_v1 t
  WHERE NOT EXISTS (SELECT 1 FROM public.riders rd WHERE upper(rd.country_code)=t.country_code)
 ) THEN
  RAISE EXCEPTION 'National rider seeding incomplete; rolling back';
 END IF;
 RETURN jsonb_build_object(
  'ok',true,'new_national_riders',v_created,'countries_seeded',to_jsonb(v_missing),
  'country_target',150,'run_id',p_reset_run_id
 );
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_seed_national_starters_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_seed_national_starters_v1(uuid) TO service_role;

-- private.game_world_reset_cleanup_national_competitions_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_cleanup_national_competitions_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_old_race_count integer;
  v_nations_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.game_world_reset_runs r WHERE r.id=p_reset_run_id AND r.status='source_frozen'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.game_state g JOIN public.game_clock_config c ON c.id=true
    WHERE g.id=true AND g.season_number=1 AND g.is_paused AND c.is_paused AND c.base_season=1
  ) THEN RAISE EXCEPTION 'Only a paused, frozen Season 1 restart may clear championship and nations history'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.race_stage_results sr JOIN public.race_stages s ON s.id=sr.stage_id
    WHERE s.stage_date>=DATE '2000-01-01' AND s.stage_date<DATE '2001-01-01' LIMIT 1
  ) THEN RAISE EXCEPTION 'Race results must be cleared before championship race cleanup'; END IF;

  SELECT count(*) INTO v_nations_count FROM public.nations_competition_editions;
  -- A full world reset clears these Season 1 sporting competition results,
  -- not persistent association identities or player login entitlements.
  TRUNCATE TABLE public.nations_competition_editions CASCADE;
  TRUNCATE TABLE public.nations_team_standing_history;
  TRUNCATE TABLE public.national_team_selection_cycles CASCADE;
  TRUNCATE TABLE public.national_team_squads CASCADE;
  TRUNCATE TABLE public.nations_host_route_requests;

  SELECT count(*) INTO v_old_race_count
  FROM public.races r
  WHERE r.start_date>=DATE '2000-01-01' AND r.start_date<DATE '2001-01-01'
    AND r.category IN ('NC','NCQ','WRC','WNF','WNQ');

  DELETE FROM public.races r
  WHERE r.start_date>=DATE '2000-01-01' AND r.start_date<DATE '2001-01-01'
    AND r.category IN ('NC','NCQ','WRC','WNF','WNQ');

  IF EXISTS(
    SELECT 1 FROM public.races WHERE start_date>=DATE '2000-01-01'
      AND start_date<DATE '2001-01-01' AND category IN ('NC','NCQ','WRC','WNF','WNQ')
  ) OR EXISTS (SELECT 1 FROM public.nations_competition_editions)
  THEN RAISE EXCEPTION 'Old national/nations competition runtime survived cleanup'; END IF;

  RETURN jsonb_build_object(
    'ok',true,'previous_nations_editions',v_nations_count,
    'removed_old_championship_nations_races',v_old_race_count,
    'persistent_undated_reserve_routes_preserved',true,
    'player_accounts_unmodified',true
  );
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_cleanup_national_competitions_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_cleanup_national_competitions_v1(uuid) TO service_role;

-- private.game_world_reset_rebuild_national_competitions_v1(uuid)
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

 IF EXISTS(
  SELECT 1 FROM public.races r
  WHERE r.start_date>=DATE '2000-01-01' AND r.start_date<DATE '2001-01-01'
    AND r.category IN ('NC','NCQ','WRC','WNF','WNQ')
 ) THEN RAISE EXCEPTION 'Old Season 1 championship fixtures must be cleared before rebuild'; END IF;

 IF EXISTS(SELECT 1 FROM public.nations_competition_editions) THEN
   RAISE EXCEPTION 'Old World Nations competition edition must be cleared before rebuild';
 END IF;

 v_seed:=private.game_world_reset_seed_national_starters_v1(p_reset_run_id);

 SELECT public.ensure_national_championship_editions_for_season_v1(1) INTO v_created;
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
REVOKE ALL ON FUNCTION private.game_world_reset_rebuild_national_competitions_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_rebuild_national_competitions_v1(uuid) TO service_role;
