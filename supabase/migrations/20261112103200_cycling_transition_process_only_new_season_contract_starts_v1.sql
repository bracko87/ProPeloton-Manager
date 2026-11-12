-- Prevent the Season 2 rollover from replaying 7,105 older Season 1
-- contracts into already full first squads. Preserve all existing rider
-- contracts and roster assignments; only process contracts starting on
-- the actual target-season opening date in the transition.
-- Normal daily/catch-up handling (null transition_run_id) is unchanged.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.process_due_rider_contract_starts_v1(date,uuid,integer,integer)'::regprocedure) INTO v_src;
 IF v_src IS NULL OR
 (length(v_src)-length(replace(v_src,'and rc.starts_on<=v_date','')))/length('and rc.starts_on<=v_date')<>1
 THEN RAISE EXCEPTION 'Rider contract start function baseline mismatch'; END IF;
 EXECUTE replace(v_src,'and rc.starts_on<=v_date','and rc.starts_on<=v_date
      and (p_transition_run_id is null or rc.starts_on=v_date)');
END $guard$;