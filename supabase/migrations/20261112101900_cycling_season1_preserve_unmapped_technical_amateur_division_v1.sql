-- Keep a valid pre-existing division for non-club national technical identities
-- whose country has no normal amateur region mapping. This avoids assigning
-- an invented league or nulling a required division during the S1→S2 rebalance.
-- For every properly mapped country, the existing country-based normalization
-- remains unchanged.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.rebalance_competition_structure_for_transition_v1(uuid,integer,integer)'::regprocedure)
 INTO v_src;
 IF v_src IS NULL OR
   (length(v_src)-length(replace(v_src,'amateur_division=public.safe_get_amateur_division_for_country(c.country_code)','')))/length('amateur_division=public.safe_get_amateur_division_for_country(c.country_code)')<>1
 THEN RAISE EXCEPTION 'Rebalance function baseline differs; refusing replacement'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.clubs c
  WHERE c.id='6add0111-bec8-4ca6-b379-3fd8cb45f322'::uuid
  AND c.club_tier='amateur' AND c.amateur_division='INTERNATIONAL'
  AND public.is_nonclub_national_ranking_identity_v1(c.id)
  AND public.safe_get_amateur_division_for_country(c.country_code) IS NULL
 ) THEN RAISE EXCEPTION 'Expected unmapped technical national team not found'; END IF;
 EXECUTE replace(v_src,'amateur_division=public.safe_get_amateur_division_for_country(c.country_code)','amateur_division=coalesce(public.safe_get_amateur_division_for_country(c.country_code),c.amateur_division)');
END $guard$;