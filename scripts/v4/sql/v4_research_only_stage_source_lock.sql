-- V4 private RESEARCH-ONLY immutable source sidecar (not official stage plan lock).
-- Deliberately not scheduled; does not modify races, riders, plans, workers or
-- results. Admin must invoke inside a REPEATABLE READ transaction.
-- No public API grants, no client credentials, no post-hoc race rewriting.

CREATE TABLE IF NOT EXISTS private.v4_research_locked_full_stage_sources_v1 (
  stage_id uuid PRIMARY KEY,
  race_id uuid NOT NULL,
  source_kind text NOT NULL DEFAULT 'v4_research_capture_not_official_production_lock',
  stage_start_game_ts timestamptz NOT NULL,
  lock_cutoff_game_ts timestamptz NOT NULL,
  captured_game_ts timestamptz NOT NULL,
  captured_real_ts timestamptz NOT NULL DEFAULT clock_timestamp(),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_payload jsonb NOT NULL,
  team_count integer NOT NULL CHECK (team_count >= 2),
  rider_count integer NOT NULL CHECK (rider_count >= 2),
  original_submitted_plan_count integer NOT NULL DEFAULT 0,
  CHECK (stage_start_game_ts - lock_cutoff_game_ts = interval '3 hours'),
  CHECK (captured_game_ts >= lock_cutoff_game_ts),
  CHECK (captured_game_ts < stage_start_game_ts),
  CHECK (captured_game_ts <= lock_cutoff_game_ts + interval '15 minutes'),
  CHECK (source_kind = 'v4_research_capture_not_official_production_lock')
);
ALTER TABLE private.v4_research_locked_full_stage_sources_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.v4_research_locked_full_stage_sources_v1
  FROM PUBLIC, anon, authenticated, service_role, v4_live_shadow_read_login;

CREATE OR REPLACE FUNCTION private.v4_research_stage_source_immutable_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',
    MESSAGE='V4 research source snapshots are immutable; updates/deletes forbidden';
END;
$$;
REVOKE ALL ON FUNCTION private.v4_research_stage_source_immutable_guard_v1()
  FROM PUBLIC, anon, authenticated, service_role, v4_live_shadow_read_login;

DROP TRIGGER IF EXISTS v4_research_source_immutable_v1
 ON private.v4_research_locked_full_stage_sources_v1;
CREATE TRIGGER v4_research_source_immutable_v1
BEFORE UPDATE OR DELETE ON private.v4_research_locked_full_stage_sources_v1
FOR EACH ROW EXECUTE FUNCTION private.v4_research_stage_source_immutable_guard_v1();

CREATE OR REPLACE FUNCTION private.v4_capture_research_locked_stage_source_v1(
 p_stage_id uuid,
 p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
SET statement_timeout TO '45s'
AS $$
DECLARE
  v_stage public.race_stages%ROWTYPE;
  v_race public.races%ROWTYPE;
  v_clock record;
  v_now timestamptz;
  v_start timestamptz;
  v_cutoff timestamptz;
  v_teams jsonb := '[]'::jsonb;
  v_riders jsonb := '[]'::jsonb;
  v_inputs jsonb := '[]'::jsonb;
  v_commands jsonb := '[]'::jsonb;
  v_plans jsonb := '[]'::jsonb;
  v_points jsonb := '[]'::jsonb;
  v_profile jsonb := '{}'::jsonb;
  v_phase9 jsonb := '{}'::jsonb;
  v_leaders jsonb := '[]'::jsonb;
  v_standings jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_hash text;
  v_teams_count integer;
  v_riders_count integer;
  v_original_submitted integer;
  v_inserted boolean := false;
BEGIN
  -- This is an intentional private research-table INSERT, never an official write.
  IF current_user <> 'postgres' OR session_user <> 'postgres' OR
     current_setting('transaction_isolation') NOT IN ('repeatable read','serializable') OR
     current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='V4 private capture requires admin repeatable-read read-write transaction';
  END IF;
  IF p_stage_id IS NULL THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_STAGE_REQUIRED','research_writes',0);
  END IF;
  IF EXISTS (SELECT 1 FROM private.v4_research_locked_full_stage_sources_v1
             WHERE stage_id=p_stage_id) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_SNAPSHOT_ALREADY_IMMUTABLE','research_writes',0);
  END IF;

  SELECT * INTO v_stage FROM public.race_stages WHERE id=p_stage_id;
  IF NOT FOUND OR v_stage.stage_date IS NULL OR
     v_stage.planned_start_hour_number IS NULL OR
     v_stage.planned_start_hour_number NOT BETWEEN 0 AND 23 OR
     coalesce(v_stage.planned_start_minute,0) NOT BETWEEN 0 AND 59 OR
     v_stage.stage_format <> 'road_race' OR
     v_stage.terrain_type NOT IN ('flat','hilly','mountain','cobbled') THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_STAGE_UNSUPPORTED','research_writes',0);
  END IF;
  SELECT * INTO v_race FROM public.races WHERE id=v_stage.race_id;
  IF NOT FOUND OR coalesce((v_race.metadata->>'national_championship')::boolean,false)
     OR coalesce((v_race.metadata->>'world_road_championship')::boolean,false) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_COMPETITION_UNSUPPORTED','research_writes',0);
  END IF;
  v_start := (v_stage.stage_date::timestamp +
    make_interval(hours=>v_stage.planned_start_hour_number,
                  mins=>coalesce(v_stage.planned_start_minute,0))) AT TIME ZONE 'UTC';
  v_cutoff := v_start - interval '3 hours';

  SELECT season_number,month_number,day_number,hour_number,minute_number,is_paused
    INTO v_clock FROM public.game_state WHERE id=true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_CLOCK_MISSING','research_writes',0);
  END IF;
  v_now := make_timestamptz(1999+v_clock.season_number,
    v_clock.month_number,v_clock.day_number,
    coalesce(v_clock.hour_number,0),coalesce(v_clock.minute_number,0),0,'UTC');
  IF coalesce(v_clock.is_paused,true) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_CLOCK_PAUSED','research_writes',0);
  END IF;
  IF v_now<v_cutoff THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_BEFORE_CUTOFF','research_writes',0);
  END IF;
  IF v_now>v_cutoff+interval '15 minutes' OR v_now>=v_start THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_LOCK_WINDOW_MISSED','research_writes',0);
  END IF;
  IF EXISTS (SELECT 1 FROM public.race_stage_simulation_runs r
             WHERE r.stage_id=p_stage_id AND r.status='completed') THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_COMPLETED_STAGE_FORBIDDEN','research_writes',0);
  END IF;
  IF EXISTS (SELECT 1 FROM public.race_team_stage_disqualifications d
             WHERE d.race_id=v_stage.race_id
               AND d.from_stage_number<=v_stage.stage_number) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_DISQUALIFIED_STAGE_UNSUPPORTED','research_writes',0);
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.race_team_entry_id),'[]'::jsonb)
    INTO v_teams
  FROM public.race_participant_teams_v1 t
  WHERE t.race_id=v_stage.race_id
    AND lower(coalesce(t.status,'accepted'))='accepted';
  v_teams_count := jsonb_array_length(v_teams);
  IF (SELECT count(DISTINCT t->>'race_team_entry_id')
      FROM jsonb_array_elements(v_teams) t) <> v_teams_count OR
     (SELECT count(DISTINCT t->>'participating_club_id')
      FROM jsonb_array_elements(v_teams) t) <> v_teams_count THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_DUPLICATE_TEAM_OWNERSHIP','research_writes',0);
  END IF;
  IF v_teams_count<2 OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_teams) t
     WHERE nullif(t->>'race_team_entry_id','') IS NULL OR
           nullif(t->>'participating_club_id','') IS NULL
  ) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_TEAM_OWNERSHIP_UNAVAILABLE','research_writes',0);
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.start_number NULLS LAST,t.rider_id),'[]'::jsonb)
    INTO v_riders
  FROM public.race_participant_riders_v1 t WHERE t.race_id=v_stage.race_id;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.team_id,x.rider_id),'[]'::jsonb)
    INTO v_inputs FROM public.race_engine_get_stage_rider_inputs_v1(p_stage_id) x;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.team_id,x.rider_id),'[]'::jsonb)
    INTO v_commands FROM public.race_engine_get_stage_phase_commands_v1(p_stage_id) x;
  v_riders_count := jsonb_array_length(v_riders);
  IF (SELECT count(DISTINCT r->>'rider_id') FROM jsonb_array_elements(v_riders) r)
       <>v_riders_count OR
     (SELECT count(DISTINCT r->>'rider_id') FROM jsonb_array_elements(v_inputs) r)
       <>jsonb_array_length(v_inputs) OR
     (SELECT count(DISTINCT r->>'rider_id') FROM jsonb_array_elements(v_commands) r)
       <>jsonb_array_length(v_commands) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_DUPLICATE_RIDER_OWNERSHIP','research_writes',0);
  END IF;
  IF v_riders_count<2 OR jsonb_array_length(v_inputs)<2 OR
     jsonb_array_length(v_inputs)<>v_riders_count OR
     jsonb_array_length(v_commands)<>v_riders_count THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_RIDER_COMMANDS_INCOMPLETE','research_writes',0);
  END IF;

  SELECT coalesce(jsonb_agg(
    to_jsonb(p)||jsonb_build_object(
      'team_id',coalesce(rp.participating_club_id,rp.club_id),
      'club_id',rp.club_id,'participating_club_id',rp.participating_club_id)
    ORDER BY p.id),'[]'::jsonb)
  INTO v_plans
  FROM public.race_stage_plans p
  JOIN public.race_preparations rp ON rp.id=p.race_preparation_id
  WHERE p.stage_id=p_stage_id;
  SELECT count(*) INTO v_original_submitted
    FROM jsonb_array_elements(v_plans) x WHERE x->>'status'='submitted';

  -- Every human team must have an accepted submitted/locked saved team plan;
  -- AI teams may have none, and V4 templates will supply research AI plans.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_teams) t
    WHERE NOT (coalesce((t->>'is_ai_filler')::boolean,false)
          OR lower(coalesce(t->>'entry_source','')) IN ('ai','ai_fill','ai_filler'))
      AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_plans) p
       WHERE p->>'team_id'=t->>'participating_club_id'
         AND p->>'status' IN ('submitted','locked')
      )
  ) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_HUMAN_PLAN_MISSING','research_writes',0);
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sort_order,x.km_from_start,x.id),'[]'::jsonb)
    INTO v_points FROM public.race_stage_points x WHERE x.stage_id=p_stage_id;
  v_profile := public.get_race_stage_profile_detail_v1(p_stage_id);
  v_phase9 := public.universal_race_stage_filter_phase9_eligible_v1(
   p_stage_id,public.race_engine_get_stage_phase9_inputs_v1(p_stage_id));
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    INTO v_leaders FROM public.get_race_stage_pre_stage_leaders_v1(p_stage_id) x;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    INTO v_standings FROM public.get_race_stage_pre_stage_standings_v1(p_stage_id) x;
  IF jsonb_typeof(v_profile) IS DISTINCT FROM 'object' OR
     jsonb_typeof(v_phase9) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_SOURCE_INCOMPLETE','research_writes',0);
  END IF;
  v_payload := jsonb_build_object(
   'sourceKind','v4_research_capture_not_official_production_lock',
   'sourceVersion','v4_private_stage_source_v1',
   'stage',to_jsonb(v_stage),'race',to_jsonb(v_race),'profile',v_profile,
   'stagePoints',v_points,'participantTeams',v_teams,
   'participantRiders',v_riders,'riderInputRows',v_inputs,
   'phaseCommandRows',v_commands,'lockedPlanRows',v_plans,
   'phase9Payload',v_phase9,'preStageLeaders',v_leaders,
   'preStageStandings',v_standings,
   'originalPlanStatusesPreserved',true,'researchOnly',true);
  IF octet_length(v_payload::text)>15*1024*1024 THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_SOURCE_SIZE_REJECTED','research_writes',0);
  END IF;
  v_hash := encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  IF coalesce(p_dry_run,true) THEN
    RETURN jsonb_build_object('status','V4_RESEARCH_CAPTURE_DRY_RUN_READY',
       'research_writes',0,'team_count',v_teams_count,
       'rider_count',v_riders_count,'submitted_plan_count',v_original_submitted,
       'snapshot_game_ts',v_now,'lock_cutoff_game_ts',v_cutoff);
  END IF;

  INSERT INTO private.v4_research_locked_full_stage_sources_v1 (
    stage_id,race_id,stage_start_game_ts,lock_cutoff_game_ts,
    captured_game_ts,source_sha256,source_payload,
    team_count,rider_count,original_submitted_plan_count
  ) VALUES (
    p_stage_id,v_stage.race_id,v_start,v_cutoff,
    v_now,v_hash,v_payload,v_teams_count,v_riders_count,v_original_submitted
  ) ON CONFLICT (stage_id) DO NOTHING
  RETURNING true INTO v_inserted;
  RETURN jsonb_build_object(
    'status',CASE WHEN v_inserted THEN 'V4_RESEARCH_IMMUTABLE_SOURCE_CAPTURED'
      ELSE 'V4_RESEARCH_SNAPSHOT_ALREADY_IMMUTABLE' END,
    'research_writes',CASE WHEN v_inserted THEN 1 ELSE 0 END,
    'official_writes',0,
    'stage_start_game_ts',v_start,'lock_cutoff_game_ts',v_cutoff,
    'captured_game_ts',v_now,'source_sha256',v_hash,
    'team_count',v_teams_count,'rider_count',v_riders_count,
    'original_submitted_plan_count',v_original_submitted,
    'production_source_parity_verified',false);
END;
$$;
REVOKE ALL ON FUNCTION private.v4_capture_research_locked_stage_source_v1(uuid,boolean)
 FROM PUBLIC, anon, authenticated, service_role, v4_live_shadow_read_login;

COMMENT ON TABLE private.v4_research_locked_full_stage_sources_v1 IS
 'V4 research only. Immutable independently captured full-stage sources, not authoritative live-worker snapshots. Do not change official races.';
COMMENT ON FUNCTION private.v4_capture_research_locked_stage_source_v1(uuid,boolean) IS
 'Manual admin-only forward cutoff capture. Invoke in REPEATABLE READ. No sporting writes, no worker schedule or game-clock changes.';
