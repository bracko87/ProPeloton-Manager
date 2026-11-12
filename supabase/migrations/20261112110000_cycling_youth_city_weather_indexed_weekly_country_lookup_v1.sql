-- Youth Academy climate checks: existing country-weather PK index can be
-- used when its canonical uppercase country_code column is compared directly.
-- All live weekly-weather countries are uppercase, so temperature/date gates
-- are unchanged. This avoids repeated full scans for each youth race/day.
DO $guard$
DECLARE v_src text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.country_weather_weekly_normals WHERE country_code IS DISTINCT FROM upper(country_code))
 THEN RAISE EXCEPTION 'Country weather codes not canonical'; END IF;
 SELECT pg_get_functiondef('private.youth_race_city_weather_eligible_v9(text,text,date,date)'::regprocedure) INTO v_src;
 IF v_src IS NULL OR
 (length(v_src)-length(replace(v_src,'upper(n.country_code)=upper(p_country_code)','')))/length('upper(n.country_code)=upper(p_country_code)')<>1
 THEN RAISE EXCEPTION 'Youth city climate function baseline mismatch'; END IF;
 EXECUTE replace(v_src,'upper(n.country_code)=upper(p_country_code)','n.country_code=upper(p_country_code)');
END $guard$;