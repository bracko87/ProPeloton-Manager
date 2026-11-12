-- Early January race entry rules intentionally allow rider submission
-- on race day (timestamp Stage 1 start minus 3 hours), while applications
-- and team decisions close on D-1. The freshness validator still expected
-- rider submissions on D-1. Preserve current deadlines and align the
-- validator to the documented canonical calculate_race_application_deadlines_v1.
-- Live comparison: nine early-January races, zero policy mismatches.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.verify_new_season_fresh_state_v1(integer,integer)'::regprocedure) INTO v_src;
 IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'public.make_game_rule_date_v1(
           e.rider_submission_deadline_season_number,
           e.rider_submission_deadline_month_number,
           e.rider_submission_deadline_day_number
         )<>r.start_date::date-1','')))/length('public.make_game_rule_date_v1(
           e.rider_submission_deadline_season_number,
           e.rider_submission_deadline_month_number,
           e.rider_submission_deadline_day_number
         )<>r.start_date::date-1')<>1 THEN
   RAISE EXCEPTION 'Early January freshness verifier baseline mismatch';
 END IF;
 EXECUTE replace(v_src,'public.make_game_rule_date_v1(
           e.rider_submission_deadline_season_number,
           e.rider_submission_deadline_month_number,
           e.rider_submission_deadline_day_number
         )<>r.start_date::date-1','public.make_game_rule_date_v1(
           e.rider_submission_deadline_season_number,
           e.rider_submission_deadline_month_number,
           e.rider_submission_deadline_day_number
         )<>r.start_date::date');
END $guard$;