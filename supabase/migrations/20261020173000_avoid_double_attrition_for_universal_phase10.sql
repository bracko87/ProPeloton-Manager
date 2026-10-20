-- Forward-only reconciliation of race-engine Phase 10 and legacy SQL attrition.
-- Database version of Issue #139; do not rewrite historical classifications.
-- The old probability remains active for genuinely legacy race runs.
-- Universally adjudicated stages must never acquire a second random DNF on
-- INSERT/UPDATE after the official engine and physical replay are finalized.
--
-- Existing policies, terminal-status permanence, previous-stage elimination,
-- public privileges and RLS remain unchanged.
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
DECLARE
  v_decision jsonb;
  v_reason text;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'race_stage_rider_states'
     OR TG_OP NOT IN ('INSERT','UPDATE') THEN
    RAISE EXCEPTION 'Race attrition trigger called outside rider states';
  END IF;
  IF NOT private.race_attrition_applies_v1(NEW.race_id) THEN RETURN NEW; END IF;
  IF NEW.stage_status NOT IN ('finished','dnf','dns','otl') THEN RETURN NEW; END IF;

  IF private.race_attrition_prior_elimination_v1(
      NEW.race_id,NEW.stage_id,NEW.rider_id) THEN
    NEW.stage_status:='dns';
    v_reason:='previous_stage_elimination';
  ELSIF TG_OP='UPDATE' AND OLD.stage_status IN ('dnf','dns','otl') THEN
    NEW.stage_status:=OLD.stage_status;
    v_reason:='terminal_status_is_permanent';
  ELSIF NEW.stage_status='finished'
    AND NOT private.race_attrition_authoritative_universal_v2(NEW.simulation_run_id) THEN
    v_decision:=private.race_stage_attrition_decision_v1(
      NEW.race_id,NEW.stage_id,NEW.rider_id,NEW.fatigue_before_stage);
    IF coalesce((v_decision->>'withdraw')::boolean,false) THEN
      NEW.stage_status:='dnf';
      v_reason:=v_decision->>'reason';
    END IF;
  END IF;
  IF v_reason IS NOT NULL THEN
    NEW.finish_position:=null;
    NEW.finish_time_seconds:=null;
    NEW.gap_seconds:=null;
    NEW.metadata:=coalesce(NEW.metadata,'{}'::jsonb)
      ||jsonb_build_object('forward_attrition_version','20261013_v1',
        'forward_attrition_reason',v_reason,
        'forward_attrition_decision',coalesce(v_decision,'{}'::jsonb));
  END IF;
  RETURN NEW;
END
$f$;

-- Second-line invariant in the published official result table. This also
-- protects non-rider-state writer paths and later replay retries.
CREATE OR REPLACE FUNCTION private.race_attrition_guard_result_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
DECLARE
  v_decision jsonb;
  v_fatigue numeric;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'race_stage_results'
     OR TG_OP NOT IN ('INSERT','UPDATE') THEN
    RAISE EXCEPTION 'Race attrition trigger called outside stage results';
  END IF;
  IF NOT private.race_attrition_applies_v1(NEW.race_id) THEN RETURN NEW; END IF;

  IF private.race_attrition_prior_elimination_v1(
      NEW.race_id,NEW.stage_id,NEW.rider_id) THEN
    NEW.status:='dns';
  ELSIF TG_OP='UPDATE' AND OLD.status IN ('dns','dnf','dsq','otl') THEN
    NEW.status:=OLD.status;
  ELSIF NEW.status='finished'
    AND NOT private.race_attrition_authoritative_universal_v2(NEW.simulation_run_id) THEN
    SELECT rs.fatigue_before_stage INTO v_fatigue
    FROM public.race_stage_rider_states rs
    WHERE rs.simulation_run_id=NEW.simulation_run_id
      AND rs.rider_id=NEW.rider_id LIMIT 1;
    v_decision:=private.race_stage_attrition_decision_v1(
      NEW.race_id,NEW.stage_id,NEW.rider_id,v_fatigue);
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
$f$;


REVOKE ALL ON FUNCTION private.race_attrition_authoritative_universal_v2(uuid)
  FROM PUBLIC,anon,authenticated;
-- No UPDATE of any existing rider state, stage result or GC row.
