
-- Forward-only DNF realism v2. Never recalculate completed stages or races
-- already underway at the 2000-07-07 game-day rollout.
CREATE TABLE IF NOT EXISTS private.race_attrition_calibration_v2 (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  effective_race_start_date date NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  one_day_base_probability numeric NOT NULL CHECK (one_day_base_probability BETWEEN 0 AND 0.1),
  stage_base_probability numeric NOT NULL CHECK (stage_base_probability BETWEEN 0 AND 0.1),
  model_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.race_attrition_calibration_v2
  (id,effective_race_start_date,enabled,one_day_base_probability,stage_base_probability,model_version)
VALUES (true,date '2000-07-08',true,0.018,0.008,'sporting_attrition_20261016_v2')
ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON private.race_attrition_calibration_v2 FROM PUBLIC, anon, authenticated;

-- Codes and descriptions can be reused by a future, access-controlled results UI.
-- No speculative fractures, crashes or mechanical failures are generated here.
CREATE TABLE IF NOT EXISTS private.race_dnf_reason_catalog_v2 (
  reason_code text PRIMARY KEY,
  display_label text NOT NULL,
  explanation text NOT NULL,
  reason_kind text NOT NULL CHECK (reason_kind IN ('sporting','medical','administrative')),
  active boolean NOT NULL DEFAULT true
);
INSERT INTO private.race_dnf_reason_catalog_v2
  (reason_code,display_label,explanation,reason_kind)
VALUES
 ('exhaustion','Exhaustion','The rider could no longer sustain the physical effort.','sporting'),
 ('unable_to_hold_pace','Unable to hold the race pace','The rider lost contact and abandoned after struggling with the race tempo.','sporting'),
 ('endurance_limit','Endurance limit','The race distance and cumulative effort exceeded the rider’s endurance.','sporting'),
 ('climbing_difficulty','Climbing difficulty','The rider was unable to sustain the pace on demanding climbs.','sporting'),
 ('unable_to_continue','Unable to continue','The rider abandoned without a confirmed medical or equipment incident.','sporting'),
 ('medical_withdrawal','Medical withdrawal','The rider withdrew because of a recorded reduced-fitness status.','medical'),
 ('medical_non_start','Unable to start: medical','A selection-blocking injury or illness prevented the rider from starting.','medical'),
 ('non_start_unspecified','Did not start: reason unavailable','The race engine recorded a non-start without a specific confirmed cause.','administrative'),
 ('previous_stage_elimination','Eliminated in an earlier stage','The rider previously withdrew and was not eligible to start this stage.','administrative')
ON CONFLICT (reason_code) DO UPDATE
  SET display_label=excluded.display_label, explanation=excluded.explanation,
      reason_kind=excluded.reason_kind;
REVOKE ALL ON private.race_dnf_reason_catalog_v2 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.race_attrition_new_policy_applies_v2(p_race_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
 SELECT EXISTS (
  SELECT 1 FROM public.races r
  JOIN private.race_attrition_calibration_v2 cfg ON cfg.id=true
  WHERE r.id=p_race_id AND cfg.enabled
    AND r.start_date>=cfg.effective_race_start_date
    AND r.status IS DISTINCT FROM 'cancelled'
 );
$f$;
REVOKE ALL ON FUNCTION private.race_attrition_new_policy_applies_v2(uuid)
 FROM PUBLIC, anon, authenticated;

-- Keep the June 1 stage-race policy unchanged for races begun before July 8;
-- include one-day races ONLY from the new cutoff onward.
CREATE OR REPLACE FUNCTION private.race_attrition_applies_v1(p_race_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
 SELECT EXISTS (
  SELECT 1 FROM public.races r CROSS JOIN private.race_attrition_policy_v1 old
  WHERE r.id=p_race_id AND old.id=true AND old.enabled
    AND r.status IS DISTINCT FROM 'cancelled'
    AND r.is_stage_race AND r.start_date>=old.effective_race_start_date
 )
 OR private.race_attrition_new_policy_applies_v2(p_race_id);
$f$;

-- Deterministic, probabilistic non-medical attrition: no minimum quota.
-- Race start date (not stage date) gates all new behavior.
CREATE OR REPLACE FUNCTION private.race_stage_attrition_decision_v2(
 p_race_id uuid,p_stage_id uuid,p_rider_id uuid,p_fatigue_before numeric
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
DECLARE
 v_race public.races%rowtype;
 v_stage public.race_stages%rowtype;
 v_cfg private.race_attrition_calibration_v2%rowtype;
 v_rider record;
 v_fatigue numeric;
 v_distance numeric;
 v_distance_factor numeric;
 v_terrain_factor numeric;
 v_format_factor numeric;
 v_probability numeric;
 v_roll numeric;
 v_reason_roll numeric;
 v_reason text;
 v_label text;
 v_description text;
BEGIN
 IF NOT private.race_attrition_new_policy_applies_v2(p_race_id) THEN
   RETURN jsonb_build_object('eligible',false,'withdraw',false);
 END IF;
 SELECT * INTO v_race FROM public.races WHERE id=p_race_id;
 SELECT * INTO v_stage FROM public.race_stages
  WHERE id=p_stage_id AND race_id=p_race_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attrition v2: stage not in race'; END IF;
 SELECT * INTO v_cfg FROM private.race_attrition_calibration_v2 WHERE id=true;
 SELECT coalesce(fatigue,0) as fatigue,coalesce(recovery,58) as recovery,
        coalesce(endurance,58) as endurance,coalesce(resistance,58) as resistance,
        coalesce(climbing,58) as climbing,
        coalesce(availability_status,'fit') as availability
 INTO v_rider FROM public.riders WHERE id=p_rider_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attrition v2: rider not found'; END IF;
 v_fatigue:=greatest(0,least(100,coalesce(p_fatigue_before,v_rider.fatigue,0)));
 v_distance:=coalesce(v_stage.distance_km,0);
 v_distance_factor:=case
   when v_distance<25 then 0.18
   when v_distance<75 then 0.40
   when v_distance<110 then 0.65
   when v_distance<140 then 0.85
   when v_distance<170 then 1.00
   when v_distance<200 then 1.18
   when v_distance<225 then 1.40
   when v_distance<250 then 1.75
   else 2.20 end;
 v_terrain_factor:=case
   when lower(coalesce(v_stage.terrain_type,'')) in ('mountain','high_mountain','mountainous')
     then 1.52
   when lower(coalesce(v_stage.terrain_type,'')) in ('hilly','medium_mountain')
     then 1.22
   when lower(coalesce(v_stage.terrain_type,'')) like '%cobbl%'
     then 1.65
   else 1.00 end;
 v_format_factor:=case
   when lower(coalesce(v_stage.stage_format,'')) in
     ('individual_time_trial','team_time_trial','prologue','itt','ttt')
     then 0.25
   else 1.0 end;
 v_probability := (
    case when v_race.is_stage_race
      then v_cfg.stage_base_probability
      else v_cfg.one_day_base_probability end
   ) * v_distance_factor*v_terrain_factor*v_format_factor
   * case when v_race.is_stage_race
       then 1+least(20,greatest(0,v_race.stage_count-1))*0.008
       else 1 end
   * case when v_race.is_stage_race
       then 1+least(20,greatest(0,v_stage.stage_number-1))*0.018
       else 1 end
   * case when v_fatigue<30 then 0.91
       else 1+greatest(0,v_fatigue-45)/55.0*0.60 end
   * greatest(0.73,least(1.30,1+(65-v_rider.recovery)*0.008))
   * greatest(0.75,least(1.28,1+(65-v_rider.endurance)*0.008))
   * greatest(0.78,least(1.25,1+(65-v_rider.resistance)*0.005))
   * case when lower(coalesce(v_stage.terrain_type,''))='mountain'
           and v_rider.climbing<60 then 1.13 else 1 end
   * case when not v_race.is_stage_race
           and v_race.category in ('1.UWT','1.Pro') then 1.25 else 1 end;
 IF v_rider.availability='not_fully_fit' THEN
   v_probability:=v_probability*1.15;
 END IF;
 -- TT/prologue risk remains low; hard road races can be appreciably higher.
 v_probability:=greatest(0.0002,least(0.11,v_probability));
 v_roll:=public.race_engine_hash_roll_v1(
  v_cfg.model_version||':withdraw:'||p_race_id::text||':'||
  p_stage_id::text||':'||p_rider_id::text);
 v_reason_roll:=public.race_engine_hash_roll_v1(
  v_cfg.model_version||':reason:'||p_race_id::text||':'||
  p_stage_id::text||':'||p_rider_id::text);

 -- Only attribute medical causes to actual non-fit rider states.
 IF v_rider.availability='not_fully_fit' THEN
   v_reason:='medical_withdrawal';
 ELSIF v_fatigue>=78 OR (v_fatigue>=65 AND v_reason_roll<0.55) THEN
   v_reason:='exhaustion';
 ELSIF lower(coalesce(v_stage.terrain_type,'')) IN
   ('mountain','high_mountain','mountainous')
   AND v_rider.climbing<65 AND v_reason_roll<0.65 THEN
   v_reason:='climbing_difficulty';
 ELSIF (v_distance>=145 AND v_rider.endurance<65 AND v_reason_roll<0.70)
   OR (v_distance>=210 AND v_reason_roll<0.42) THEN
   v_reason:='endurance_limit';
 ELSIF v_reason_roll<0.75 OR v_rider.resistance<56 THEN
   v_reason:='unable_to_hold_pace';
 ELSE
   v_reason:='unable_to_continue';
 END IF;
 SELECT c.display_label,c.explanation INTO v_label,v_description
 FROM private.race_dnf_reason_catalog_v2 c WHERE c.reason_code=v_reason;
 RETURN jsonb_build_object(
  'eligible',true,'withdraw',v_roll<v_probability,
  'reason',v_reason,'reason_label',v_label,'reason_description',v_description,
  'probability',round(v_probability,6),'roll',v_roll,
  'policy_version',v_cfg.model_version,'non_medical',
  v_reason<>'medical_withdrawal');
END
$f$;
REVOKE ALL ON FUNCTION private.race_stage_attrition_decision_v2(uuid,uuid,uuid,numeric)
 FROM PUBLIC, anon, authenticated;

-- Single decision on official state and official result; both reuse the
-- same deterministic seed. Earlier-started races keep the original decision.
CREATE OR REPLACE FUNCTION private.race_attrition_guard_state_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
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
 ELSIF NEW.stage_status='finished' THEN
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
$f$;

CREATE OR REPLACE FUNCTION private.race_attrition_guard_result_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
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
 ELSIF NEW.status='finished' THEN
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
$f$;
