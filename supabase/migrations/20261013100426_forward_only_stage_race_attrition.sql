-- Future-only race attrition policy (effective June 1, Season 1 / year 2000).
-- Legacy and already-running races are excluded by RACE START DATE,
-- not stage date. Never rebuild or rewrite their published classifications.
CREATE TABLE IF NOT EXISTS private.race_attrition_policy_v1 (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  effective_race_start_date date NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO private.race_attrition_policy_v1
  (id,effective_race_start_date,enabled,policy_version)
VALUES (true,date '2000-06-01',true,'forward_stage_race_attrition_20261013_v1')
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON private.race_attrition_policy_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.race_attrition_applies_v1(p_race_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
  SELECT EXISTS (
    SELECT 1
    FROM public.races r CROSS JOIN private.race_attrition_policy_v1 p
    WHERE r.id=p_race_id AND p.id=true AND p.enabled
      AND r.is_stage_race=true
      AND r.start_date>=p.effective_race_start_date
      AND r.status <> 'cancelled'
  );
$f$;

-- One shared, replay-stable decision for both rider-state and published
-- stage-result guards. Probability is per stage, not a forced rider quota.
CREATE OR REPLACE FUNCTION private.race_stage_attrition_decision_v1(
  p_race_id uuid,
  p_stage_id uuid,
  p_rider_id uuid,
  p_fatigue_before numeric
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
DECLARE
  v_race public.races%rowtype;
  v_stage public.race_stages%rowtype;
  v_rider record;
  v_probability numeric;
  v_roll numeric;
  v_fatigue numeric;
  v_recovery numeric;
  v_reason text;
BEGIN
  IF NOT private.race_attrition_applies_v1(p_race_id) THEN
    RETURN jsonb_build_object('eligible',false,'withdraw',false);
  END IF;
  SELECT * INTO v_race FROM public.races WHERE id=p_race_id;
  SELECT * INTO v_stage FROM public.race_stages WHERE id=p_stage_id AND race_id=p_race_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attrition: stage % does not belong to race %',p_stage_id,p_race_id; END IF;
  SELECT coalesce(fatigue,55) as fatigue,
         coalesce(recovery,65) as recovery,
         coalesce(availability_status,'fit') as availability
    INTO v_rider FROM public.riders WHERE id=p_rider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attrition: rider % missing',p_rider_id; END IF;

  v_fatigue:=greatest(0,least(100,coalesce(p_fatigue_before,v_rider.fatigue,55)));
  v_recovery:=greatest(0,least(100,coalesce(v_rider.recovery,65)));

  -- 21 stages: approximately 15-25% cumulative non-completion in a
  -- representative healthy field; shorter events have lower base risk.
  -- Real conditions, fatigue, terrain and recovery adjust every rider.
  v_probability := 0.0015
    + greatest(0,least(21,v_race.stage_count)-1)*0.00030
    + greatest(0,least(21,v_stage.stage_number)-1)*0.00010
    + greatest(0,v_fatigue-55)/45.0*0.0035
    + case
        when lower(coalesce(v_stage.terrain_type,'')) in
          ('mountain','high_mountain','mountainous','hilly','medium_mountain')
          then 0.0010 else 0 end
    + case when coalesce(v_stage.distance_km,0)>180 then 0.0006 else 0 end
    + case when v_rider.availability='not_fully_fit' then 0.0020 else 0 end;
  v_probability := greatest(0.0005,least(0.025,v_probability
    * (1.0-(v_recovery-50)/500.0)));

  v_roll := public.race_engine_hash_roll_v1(
    'forward_stage_race_attrition_20261013_v1:'
    ||p_race_id::text||':'||p_stage_id::text||':'||p_rider_id::text
  );
  v_reason:=case
    when v_rider.availability='not_fully_fit' then 'medical_withdrawal'
    when v_fatigue>=82 then 'exhaustion'
    else 'unable_to_continue'
  end;
  RETURN jsonb_build_object(
    'eligible',true,
    'withdraw',v_roll<v_probability,
    'reason',v_reason,
    'probability',round(v_probability,6),
    'roll',v_roll,
    'policy_version','forward_stage_race_attrition_20261013_v1'
  );
END
$f$;

CREATE OR REPLACE FUNCTION private.race_attrition_prior_elimination_v1(
  p_race_id uuid, p_stage_id uuid, p_rider_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
  SELECT EXISTS (
    SELECT 1
    FROM public.race_stage_results prior
    JOIN public.race_stages st ON st.id=prior.stage_id
    JOIN public.race_stages current_stage ON current_stage.id=p_stage_id
    WHERE prior.race_id=p_race_id AND prior.rider_id=p_rider_id
      AND current_stage.race_id=p_race_id
      AND st.stage_number<current_stage.stage_number
      AND lower(prior.status) IN ('dns','dnf','dsq','otl')
  );
$f$;

-- Change only future race output, at the earliest official rider-state write.
-- We do NOT update existing rows, GC, awards, or any historical stage.
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
  ELSIF NEW.stage_status='finished' THEN
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
  ELSIF NEW.status='finished' THEN
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

DROP TRIGGER IF EXISTS trg_future_race_attrition_state_v1
  ON public.race_stage_rider_states;
CREATE TRIGGER trg_future_race_attrition_state_v1
BEFORE INSERT OR UPDATE ON public.race_stage_rider_states
FOR EACH ROW EXECUTE FUNCTION private.race_attrition_guard_state_v1();

DROP TRIGGER IF EXISTS trg_future_race_attrition_result_v1
  ON public.race_stage_results;
CREATE TRIGGER trg_future_race_attrition_result_v1
BEFORE INSERT OR UPDATE ON public.race_stage_results
FOR EACH ROW EXECUTE FUNCTION private.race_attrition_guard_result_v1();

REVOKE ALL ON FUNCTION private.race_attrition_applies_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.race_stage_attrition_decision_v1(uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.race_attrition_prior_elimination_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.race_attrition_guard_state_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.race_attrition_guard_result_v1() FROM PUBLIC,anon,authenticated;
