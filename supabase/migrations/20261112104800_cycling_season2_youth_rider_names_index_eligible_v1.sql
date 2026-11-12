-- Speed up AI Youth Academy seeding during the atomic season transition.
-- Existing first/last name country_code btree indexes can be used when
-- comparing to upper(parameter); all live master country codes are already
-- uppercase, so selection and randomization rules are unchanged.
DO $patch$
DECLARE v_src text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.first_names_master WHERE country_code IS DISTINCT FROM upper(country_code))
   OR EXISTS(SELECT 1 FROM public.last_names_master WHERE country_code IS DISTINCT FROM upper(country_code))
 THEN RAISE EXCEPTION 'Names master country codes not canonical; do not rewrite predicates'; END IF;
 SELECT pg_get_functiondef('private.create_youth_rider_v1(uuid,text,boolean,boolean)'::regprocedure) INTO v_src;
 IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'where upper(fn.country_code)=upper(p_country_code)','')))/length('where upper(fn.country_code)=upper(p_country_code)')<>1 THEN RAISE EXCEPTION 'Youth rider function differs from baseline'; END IF;
IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'where upper(ln.country_code)=upper(p_country_code)','')))/length('where upper(ln.country_code)=upper(p_country_code)')<>1 THEN RAISE EXCEPTION 'Youth rider function differs from baseline'; END IF;
 v_src:=replace(v_src,'where upper(fn.country_code)=upper(p_country_code)','where fn.country_code=upper(p_country_code)');
v_src:=replace(v_src,'where upper(ln.country_code)=upper(p_country_code)','where ln.country_code=upper(p_country_code)');
 EXECUTE v_src;
END $patch$;