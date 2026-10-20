-- Forward-only reconciliation of Issue #139 without reverting existing live v2
-- medical/policy attrition guards. The 2026-10-20 production baseline already
-- uses race_attrition_new_policy_applies_v2 and race_stage_attrition_decision_v2;
-- preserve those pathways, terminal statuses, health reasons, and historical data.
-- Skip legacy SQL DNF lottery only where the universal engine has already
-- authoritatively adjudicated the incident model and official finish outcome.
-- No race result UPDATE/DELETE, no payout rewrites, no historical replay edits.

CREATE OR REPLACE FUNCTION private.race_attrition_authoritative_universal_v2(
  p_simulation_run_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
  SELECT EXISTS (
    SELECT 1
    FROM public.race_stage_simulation_runs sr
    WHERE sr.id = p_simulation_run_id
      AND sr.result_summary_json->>'engineKey' = 'ppm_universal_race_v1'
      AND sr.input_snapshot_json->'incidentModel'->>'enabled' = 'true'
  );
$f$;

CREATE OR REPLACE FUNCTION private.race_attrition_guard_state_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
AS $function$
DECLARE
 v_decision jsonb;
 v_reason text;
 v_version text;
 v_case_code text;
 v_stage_date date;
 v_new boolean;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'race_stage_rider_states'
    OR TG_OP NOT IN ('INSERT','UPDATE') THEN
   RAISE EXCEPTION 'Attrition state trigger called outside rider states';
 END IF;
 IF NOT private.race_attrition_applies_v1(NEW.race_id) THEN RETURN NEW; END IF;
 v_new:=private.race_attrition_new_policy_applies_v2(NEW.race_id);
 IF TG_OP='UPDATE' AND OLD.stage_status IN ('dnf','dns','otl')
     AND NEW.stage_status NOT IN ('dnf','dns','otl') THEN
   NEW.stage_status:=OLD.stage_status;
 END IF;
 IF NEW.stage_status NOT IN ('finished','dnf','dns','otl') THEN
   RETURN NEW;
 END IF;
 IF private.race_attrition_prior_elimination_v1(
   NEW.race_id,NEW.stage_id,NEW.rider_id) THEN
   NEW.stage_status:='dns';
   v_reason:='previous_stage_elimination';
 ELSIF TG_OP='UPDATE' AND OLD.stage_status IN ('dnf','dns','otl') THEN
   NEW.stage_status:=OLD.stage_status;
   v_reason:=coalesce(OLD.metadata->>'forward_attrition_reason',
                     'terminal_status_is_permanent');
   v_decision:=OLD.metadata->'forward_attrition_decision';
 ELSIF NEW.stage_status='finished'
    AND NOT private.race_attrition_authoritative_universal_v2(NEW.simulation_run_id) THEN
   IF v_new THEN
     v_decision:=private.race_stage_attrition_decision_v2(
       NEW.race_id,NEW.stage_id,NEW.rider_id,NEW.fatigue_before_stage);
   ELSE
     v_decision:=private.race_stage_attrition_decision_v1(
       NEW.race_id,NEW.stage_id,NEW.rider_id,NEW.fatigue_before_stage);
   END IF;
   IF coalesce((v_decision->>'withdraw')::boolean,false) THEN
     NEW.stage_status:='dnf';
     v_reason:=v_decision->>'reason';
   END IF;
 ELSIF v_new AND NEW.stage_status='dns' THEN
   SELECT stage_date INTO v_stage_date FROM public.race_stages
     WHERE id=NEW.stage_id;
   SELECT h.case_code INTO v_case_code
   FROM public.rider_health_cases h
   WHERE h.rider_id=NEW.rider_id AND h.selection_blocked
     AND h.started_on<=v_stage_date
     AND coalesce(h.resolved_on,h.recovery_until,'infinity'::date)>=v_stage_date
   ORDER BY h.started_on DESC LIMIT 1;
   v_reason:=case when v_case_code IS NOT NULL
      then 'medical_non_start' else 'non_start_unspecified' end;
 END IF;
 IF v_reason IS NOT NULL THEN
   NEW.finish_position:=null;
   NEW.finish_time_seconds:=null;
   NEW.gap_seconds:=null;
   v_version:=case when v_new then '20261016_v2' else '20261013_v1' end;
   NEW.metadata:=coalesce(NEW.metadata,'{}'::jsonb)
     || jsonb_build_object('forward_attrition_version',v_version,
           'forward_attrition_reason',v_reason,
           'forward_attrition_decision',coalesce(v_decision,'{}'::jsonb))
     || case when v_case_code IS NOT NULL
         then jsonb_build_object('forward_attrition_health_case_code',v_case_code)
         else '{}'::jsonb end;
 END IF;
 RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.race_attrition_guard_result_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
AS $function$
DECLARE
 v_decision jsonb;
 v_fatigue numeric;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'race_stage_results'
   OR TG_OP NOT IN ('INSERT','UPDATE') THEN
   RAISE EXCEPTION 'Attrition result trigger called outside stage results';
 END IF;
 IF NOT private.race_attrition_applies_v1(NEW.race_id) THEN RETURN NEW; END IF;
 IF private.race_attrition_prior_elimination_v1(
   NEW.race_id,NEW.stage_id,NEW.rider_id) THEN
   NEW.status:='dns';
 ELSIF TG_OP='UPDATE' AND OLD.status IN ('dns','dnf','dsq','otl') THEN
   NEW.status:=OLD.status;
 ELSIF NEW.status='finished'
    AND NOT private.race_attrition_authoritative_universal_v2(NEW.simulation_run_id) THEN
   SELECT st.fatigue_before_stage INTO v_fatigue
   FROM public.race_stage_rider_states st
   WHERE st.simulation_run_id=NEW.simulation_run_id
     AND st.rider_id=NEW.rider_id LIMIT 1;
   IF private.race_attrition_new_policy_applies_v2(NEW.race_id) THEN
     v_decision:=private.race_stage_attrition_decision_v2(
        NEW.race_id,NEW.stage_id,NEW.rider_id,v_fatigue);
   ELSE
     v_decision:=private.race_stage_attrition_decision_v1(
        NEW.race_id,NEW.stage_id,NEW.rider_id,v_fatigue);
   END IF;
   IF coalesce((v_decision->>'withdraw')::boolean,false) THEN
     NEW.status:='dnf';
   END IF;
 END IF;
 IF NEW.status IN ('dns','dnf','dsq','otl') THEN
   NEW.rank:=null;
   NEW.elapsed_seconds:=null;
   NEW.gap_seconds:=null;
   NEW.bonus_seconds:=0;
   NEW.finish_points:=0;
   NEW.sprint_points:=0;
   NEW.mountain_points:=0;
 END IF;
 RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION private.race_attrition_authoritative_universal_v2(uuid)
  FROM PUBLIC,anon,authenticated;
