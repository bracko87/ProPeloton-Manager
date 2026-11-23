-- Keep a rider's terminal status even if a retry tries to reset a
-- current-stage rider-state row back to 'racing' or 'not_started'.
DO $patch$
DECLARE v_original text; v_revised text;
BEGIN
  SELECT pg_get_functiondef(
      'private.race_attrition_guard_state_v1()'::regprocedure)
    INTO v_original;
  IF position('IF NEW.stage_status NOT IN (''finished'',''dnf'',''dns'',''otl'') THEN RETURN NEW; END IF;' in v_original)=0 THEN
    RAISE EXCEPTION 'Expected state guard not found; aborting retry-protection patch';
  END IF;
  v_revised:=replace(v_original,
    'IF NEW.stage_status NOT IN (''finished'',''dnf'',''dns'',''otl'') THEN RETURN NEW; END IF;',
    $guard$IF TG_OP='UPDATE'
       AND OLD.stage_status IN ('dnf','dns','otl')
       AND NEW.stage_status NOT IN ('dnf','dns','otl') THEN
      NEW.stage_status:=OLD.stage_status;
    END IF;
    IF NEW.stage_status NOT IN ('finished','dnf','dns','otl') THEN RETURN NEW; END IF;$guard$
  );
  EXECUTE v_revised;
END
$patch$;

INSERT INTO public.system_monitor_processes
  (process_key,label,category,description,source_kind,user_sensitive,
   incident_severity,expected_interval_minutes,stale_after_minutes,
   email_alerts_enabled,is_enabled,sort_order)
VALUES
  ('check:race_attrition','Future stage-race sporting integrity','Race Engine',
   'Checks forward-only stage races for riders returning after DNF/DNS, ineligible GC entries, and implausibly high Grand Tour completion rates.',
   'business_check',true,'high',10,30,true,true,402)
ON CONFLICT (process_key) DO UPDATE
 SET expected_interval_minutes=excluded.expected_interval_minutes,
     stale_after_minutes=excluded.stale_after_minutes,
     description=excluded.description,
     is_enabled=true;

CREATE OR REPLACE FUNCTION private.audit_forward_race_attrition_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','private','public','pg_temp'
AS $f$
DECLARE
 v_cutoff date;
 v_date date:=public.get_current_game_date_date();
 v_returned integer:=0;
 v_bad_gc integer:=0;
 v_grand_tour_outliers integer:=0;
 v_grand_tour_count integer:=0;
 v_details jsonb:='{}'::jsonb;
 v_total integer;
BEGIN
 SELECT effective_race_start_date INTO v_cutoff
 FROM private.race_attrition_policy_v1 WHERE id=true AND enabled=true;
 IF v_cutoff IS NULL THEN
  RETURN jsonb_build_object('status','disabled');
 END IF;

 -- Only recent or ongoing forward-only races; stage timestamps are in GAME time.
 -- A previous DNF from much earlier in a Grand Tour still counts.
 SELECT count(*) INTO v_returned
 FROM public.race_stage_results later
 JOIN public.race_stages later_st ON later_st.id=later.stage_id
 JOIN public.races race ON race.id=later.race_id
 WHERE race.is_stage_race
   AND race.start_date>=v_cutoff AND race.start_date<=v_date
   AND race.end_date>=v_date-8
   AND later_st.stage_date>=v_date-8
   AND later.status='finished'
   AND EXISTS (
     SELECT 1 FROM public.race_stage_results earlier
     JOIN public.race_stages earlier_st ON earlier_st.id=earlier.stage_id
     WHERE earlier.race_id=later.race_id AND earlier.rider_id=later.rider_id
       AND earlier_st.stage_number<later_st.stage_number
       AND earlier.status IN ('dnf','dns','dsq','otl')
   );

 -- GC must never restore riders eliminated at this or any prior stage.
 SELECT count(*) INTO v_bad_gc
 FROM public.race_classification_standings gc
 JOIN public.race_stages gc_st ON gc_st.id=gc.after_stage_id
 JOIN public.races race ON race.id=gc.race_id
 WHERE gc.classification_type='general'
   AND gc.entity_type='rider'
   AND race.is_stage_race AND race.start_date>=v_cutoff
   AND race.start_date<=v_date AND race.end_date>=v_date-8
   AND gc_st.stage_date>=v_date-8
   AND EXISTS (
     SELECT 1 FROM public.race_stage_results failure
     JOIN public.race_stages fail_st ON fail_st.id=failure.stage_id
     WHERE failure.race_id=gc.race_id AND failure.rider_id=gc.rider_id
       AND fail_st.stage_number<=gc_st.stage_number
       AND failure.status IN ('dnf','dns','dsq','otl')
   );

 -- Flag implausible future Grand Tour survival, not a strict quota.
 -- Only consider a completed race with 16+ stages and a published last GC.
 SELECT count(*),count(*) FILTER (WHERE (initial_riders-final_gc_riders)::numeric/
                                         nullif(initial_riders,0)<0.05)
   INTO v_grand_tour_count,v_grand_tour_outliers
 FROM (
   SELECT race.id,
     (SELECT count(*) FROM public.race_participant_riders_v1 entry
      WHERE entry.race_id=race.id) initial_riders,
     (SELECT count(*) FROM public.race_classification_standings c
      JOIN public.race_stages st ON st.id=c.after_stage_id
      WHERE c.race_id=race.id AND c.classification_type='general'
        AND st.stage_number=race.stage_count) final_gc_riders
   FROM public.races race
   WHERE race.is_stage_race AND race.stage_count>=16
     AND race.status='completed'
     AND race.start_date>=v_cutoff AND race.end_date>=v_date-8
     AND race.end_date<=v_date
 ) x
 WHERE initial_riders>=50 AND final_gc_riders>0;

 v_total:=v_returned+v_bad_gc+v_grand_tour_outliers;
 v_details:=jsonb_build_object(
   'policy_start_date',v_cutoff,'game_date',v_date,
   'returned_after_elimination_rows',v_returned,
   'ineligible_gc_rows',v_bad_gc,
   'grand_tours_checked',v_grand_tour_count,
   'grand_tour_survival_outliers',v_grand_tour_outliers
 );
 PERFORM public.log_system_business_check_v1(
   'check:race_attrition',
   CASE WHEN v_total>0 THEN 'error' ELSE 'success' END,
   CASE WHEN v_total>0
     THEN format('%s forward-only race attrition integrity issue(s).',v_total)
     ELSE 'Future race elimination and GC integrity checks passed.' END,
   v_details
 );
 IF v_total>0 THEN
   PERFORM public.raise_system_incident_v1(
     'check:race_attrition','high',
     'Future stage-race elimination integrity',
     format('%s return-after-elimination, GC eligibility, or survival-rate problem(s) detected in future races.',v_total),
     'business:forward-race-attrition',v_details
   );
 ELSE
   PERFORM public.resolve_system_incident_by_dedupe_v1(
     'business:forward-race-attrition',
     'Forward-only stage-race eligibility and survival checks passed.'
   );
 END IF;
 RETURN jsonb_build_object('status',CASE WHEN v_total=0 THEN 'healthy' ELSE 'attention_required' END,
    'issues',v_total,'details',v_details);
END
$f$;
REVOKE ALL ON FUNCTION private.audit_forward_race_attrition_v1()
  FROM PUBLIC,anon,authenticated;

SELECT cron.schedule(
 'ppm-future-race-attrition-health-v1','9-59/10 * * * *',
 $cmd$SELECT private.audit_forward_race_attrition_v1();$cmd$
);
