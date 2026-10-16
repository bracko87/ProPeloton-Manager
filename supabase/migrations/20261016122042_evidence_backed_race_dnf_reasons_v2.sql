
-- Make DNF reasons evidence-backed. Reduced fitness can reflect fatigue,
-- so it must not be mislabeled an injury/illness without a matching case.
-- Patch only the future-only v2 decision function; old races are untouched.
DO $patch$
DECLARE
  v_definition text;
  v_revised text;
  v_pattern text :=
    'IF v_rider\.availability=''not_fully_fit'' THEN[[:space:]]*v_reason:=''medical_withdrawal'';[[:space:]]*ELSIF';
BEGIN
  SELECT pg_get_functiondef(
    'private.race_stage_attrition_decision_v2(uuid,uuid,uuid,numeric)'::regprocedure)
  INTO v_definition;
  IF v_definition IS NULL OR NOT v_definition ~ v_pattern THEN
    RAISE EXCEPTION 'Expected v2 medical-reason branch absent; no patch made';
  END IF;
  v_revised:=regexp_replace(v_definition,v_pattern,$replacement$IF v_rider.availability='not_fully_fit'
      AND EXISTS (
        SELECT 1 FROM public.rider_health_cases health
        WHERE health.rider_id=p_rider_id
          AND health.case_type IN ('injury','sickness')
          AND health.started_on<=v_stage.stage_date
          AND coalesce(health.resolved_on,health.recovery_until,'infinity'::date)
              >=v_stage.stage_date
      ) THEN
   v_reason:='medical_withdrawal';
 ELSIF$replacement$);
  v_revised:=replace(v_revised,
    '-- Only attribute medical causes to actual non-fit rider states.',
    '-- Only attribute medical causes when an active health case is recorded.');
  EXECUTE v_revised||';';
END
$patch$;
