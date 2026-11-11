-- ProPeloton Manager: protected 24h migration + 24h paused-preseason window.
-- S1 and current clock remain unchanged when this migration is installed.
-- At Dec 31 23:59:59 the regular clock is held, then the existing v2
-- migration engine runs once without resuming game time. After >=24 real
-- hours AND verified completed migration, allow 24 real hours of Jan 1
-- preparation. Resume at 2x only after the second full real-day window.
-- A failed migration never auto-unlocks.
CREATE TABLE IF NOT EXISTS public.cycling_season_window_v1 (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  phase text NOT NULL DEFAULT 'off'
    CHECK (phase IN ('off','migration','delayed','preparation')),
  source_season integer,
  target_season integer,
  boundary_started_at timestamptz,
  migration_until_at timestamptz,
  preparation_started_at timestamptz,
  resume_at timestamptz,
  resumed_at timestamptz,
  run_id uuid REFERENCES public.season_transition_engine_runs_v2(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (phase='off' OR (
    source_season>=1 AND target_season=source_season+1
    AND boundary_started_at IS NOT NULL AND migration_until_at IS NOT NULL
  ))
);
ALTER TABLE public.cycling_season_window_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cycling_season_window_v1 FROM public,anon,authenticated;
INSERT INTO public.cycling_season_window_v1(id,phase)
VALUES(true,'off') ON CONFLICT(id) DO NOTHING;

-- Only safe, non-sensitive countdown fields are exposed to browsers.
CREATE OR REPLACE FUNCTION public.get_cycling_public_season_window_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $public_state$
SELECT jsonb_build_object(
  'phase',w.phase,
  'locked',w.phase IN ('migration','delayed'),
  'preparation_active',w.phase='preparation',
  'game_clock_paused',w.phase IN ('migration','delayed','preparation'),
  'source_season',CASE WHEN w.phase='off' THEN null ELSE w.source_season END,
  'target_season',CASE WHEN w.phase='off' THEN null ELSE w.target_season END,
  'migration_started_at',CASE WHEN w.phase='off' THEN null ELSE w.boundary_started_at END,
  'migration_reopen_at',CASE WHEN w.phase='off' THEN null ELSE w.migration_until_at END,
  'preparation_started_at',CASE WHEN w.phase='preparation' THEN w.preparation_started_at ELSE null END,
  'resume_at',CASE WHEN w.phase='preparation' THEN w.resume_at ELSE null END,
  'delayed',w.phase='delayed',
  'checked_at',now()
)
FROM public.cycling_season_window_v1 w WHERE w.id=true;
$public_state$;
REVOKE ALL ON FUNCTION public.get_cycling_public_season_window_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cycling_public_season_window_v1() TO anon,authenticated;

-- The clock calls this wrapper only at a Dec31->Jan1 crossing. It must
-- COMMIT the access lock before the migration engine begins expensive work.
CREATE OR REPLACE FUNCTION public.cycling_season_boundary_hold_v1(p_old_date date,p_new_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $start_window$
DECLARE
  v_source integer:=public.season_from_game_date(p_old_date);
  v_target integer:=public.season_from_game_date(p_new_date);
  v_game public.game_state%rowtype;
  v_window public.cycling_season_window_v1%rowtype;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cycling-season-two-day-window',0));
  SELECT * INTO v_game FROM public.game_state WHERE id=true FOR UPDATE;
  SELECT * INTO v_window FROM public.cycling_season_window_v1 WHERE id=true FOR UPDATE;
  IF p_old_date<>public.get_game_date_for_season_end(v_source)
     OR p_new_date<>public.get_game_date_for_season_start(v_target)
     OR v_target<>v_source+1 OR v_game.season_number<>v_source
     OR v_game.month_number<>12 OR v_game.day_number<>31
  THEN
    RETURN jsonb_build_object('ok',false,'error','Unexpected season boundary; stopped');
  END IF;
  IF v_window.phase<>'off' THEN
    RETURN jsonb_build_object('ok',false,'error','Existing protected transition window');
  END IF;

  UPDATE public.game_state SET is_paused=true,hour_number=23,minute_number=59,
    last_advanced_at=clock_timestamp() WHERE id=true;
  UPDATE public.game_clock_config SET is_paused=true,base_real_at=clock_timestamp()
    WHERE id=true;

  UPDATE public.cycling_season_window_v1
  SET phase='migration',source_season=v_source,target_season=v_target,
      boundary_started_at=now(),migration_until_at=now()+interval '24 hours',
      preparation_started_at=null,resume_at=null,resumed_at=null,run_id=null,
      updated_at=now() WHERE id=true;

  RETURN jsonb_build_object('ok',true,'phase','migration','held_at','Dec 31 23:59:59',
    'source_season',v_source,'target_season',v_target,
    'migration_reopen_at',now()+interval '24 hours');
END $start_window$;
REVOKE ALL ON FUNCTION public.cycling_season_boundary_hold_v1(date,date)
FROM PUBLIC,anon,authenticated;

-- Process each stage with a single lock. This is the ONLY scheduler that may
-- invoke the existing migration controller during the protected window.
CREATE OR REPLACE FUNCTION public.tick_cycling_season_window_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $tick$
DECLARE
  w public.cycling_season_window_v1%rowtype;
  g public.game_state%rowtype;
  r public.season_transition_engine_runs_v2%rowtype;
  v_result jsonb;
  v_verified boolean:=false;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('cycling-season-two-day-window',0)) THEN
    RETURN jsonb_build_object('phase','busy');
  END IF;
  SELECT * INTO w FROM public.cycling_season_window_v1 WHERE id=true FOR UPDATE;
  IF w.phase='off' THEN RETURN jsonb_build_object('phase','off'); END IF;
  SELECT * INTO g FROM public.game_state WHERE id=true FOR UPDATE;

  -- Production migration is started once AFTER the lock becomes visible.
  IF w.phase IN ('migration','delayed') AND w.run_id IS NULL THEN
    IF g.season_number=w.source_season AND g.month_number=12 AND
       g.day_number=31 AND g.hour_number=23 AND g.minute_number=59
    THEN
      BEGIN
        v_result:=public.season_transition_boundary_controller_v2(
          public.get_game_date_for_season_end(w.source_season),
          public.get_game_date_for_season_start(w.target_season),false
        );
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.game_state SET is_paused=true WHERE id=true;
        UPDATE public.game_clock_config SET is_paused=true WHERE id=true;
        UPDATE public.cycling_season_window_v1 SET phase='delayed',updated_at=now() WHERE id=true;
        RETURN jsonb_build_object('phase','delayed','reason','migration_exception');
      END;
      UPDATE public.cycling_season_window_v1 SET
        run_id=NULLIF(v_result->>'run_id','')::uuid,
        phase=CASE WHEN now()>=w.migration_until_at AND
                         NOT coalesce((v_result->>'ok')::boolean,false)
                   THEN 'delayed' ELSE 'migration' END,
        updated_at=now() WHERE id=true;
      RETURN jsonb_build_object('phase','migration','result',v_result->>'ok');
    END IF;
    RETURN jsonb_build_object('phase','delayed','reason','migration_start_requires_operator_review');
  END IF;

  IF w.phase IN ('migration','delayed') THEN
    SELECT * INTO r FROM public.season_transition_engine_runs_v2
    WHERE id=w.run_id AND mode='production' AND source_season=w.source_season
      AND target_season=w.target_season;
    v_verified:=r.id IS NOT NULL AND r.status='completed'
      AND coalesce((r.validation_report->'final'->>'ok')::boolean,false)
      AND EXISTS (
        SELECT 1 FROM public.season_transition_runs_v1 lr
        WHERE lr.source_season=w.source_season AND lr.target_season=w.target_season
          AND lr.status='completed'
      )
      AND g.season_number=w.target_season AND g.month_number=1
      AND g.day_number=1 AND g.hour_number=0 AND g.minute_number=0
      AND g.is_paused;
    IF now()<w.migration_until_at THEN
      RETURN jsonb_build_object('phase','migration','verified',v_verified);
    END IF;
    IF NOT v_verified THEN
      UPDATE public.cycling_season_window_v1
        SET phase='delayed',updated_at=now() WHERE id=true AND phase<>'delayed';
      RETURN jsonb_build_object('phase','delayed','verified',false);
    END IF;

    -- The user gets a FULL 24h regardless of how late migration finished.
    UPDATE public.game_clock_config SET is_paused=true,speed_multiplier=2 WHERE id=true;
    UPDATE public.cycling_season_window_v1
      SET phase='preparation',preparation_started_at=now(),
        resume_at=now()+interval '24 hours',updated_at=now()
      WHERE id=true;
    RETURN jsonb_build_object('phase','preparation','resume_at',now()+interval '24 hours');
  END IF;

  IF w.phase='preparation' THEN
    IF now()<w.resume_at THEN
      RETURN jsonb_build_object('phase','preparation','resume_at',w.resume_at);
    END IF;
    SELECT * INTO r FROM public.season_transition_engine_runs_v2 WHERE id=w.run_id;
    IF r.id IS NULL OR r.status<>'completed'
       OR NOT coalesce((r.validation_report->'final'->>'ok')::boolean,false)
       OR g.season_number<>w.target_season OR g.month_number<>1 OR g.day_number<>1
       OR g.hour_number<>0 OR g.minute_number<>0 OR NOT g.is_paused THEN
      -- Never resume unexpectedly if the game clock or validation changed.
      RETURN jsonb_build_object('phase','preparation','resume_blocked',true);
    END IF;
    UPDATE public.game_clock_config SET speed_multiplier=2,is_paused=true WHERE id=true;
    v_result:=public.season_transition_engine_resume_completed_v2(w.run_id);
    IF NOT coalesce((v_result->>'ok')::boolean,false) THEN
      RETURN jsonb_build_object('phase','preparation','resume_blocked',true);
    END IF;
    UPDATE public.cycling_season_window_v1
    SET phase='off',resumed_at=now(),updated_at=now() WHERE id=true;
    RETURN jsonb_build_object('phase','off','resumed',true,'speed_multiplier',2);
  END IF;
  RETURN jsonb_build_object('phase',w.phase);
END $tick$;
REVOKE ALL ON FUNCTION public.tick_cycling_season_window_v1()
FROM PUBLIC,anon,authenticated;

-- Preserve the current authoritative minute clock and v2 transition engine,
-- substituting ONLY the old immediate boundary invocation. That ensures
-- migrating never unlocks before the complete two-day protocol.
DO $wire_boundary$
DECLARE
  v_src text;
  v_old text:=E'v_boundary:=public.season_transition_boundary_controller_v2(\n      v_old_date,\n      v_new_date,\n      true\n    );';
  v_new text:=E'v_boundary:=public.cycling_season_boundary_hold_v1(\n      v_old_date,\n      v_new_date\n    );';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='run_daily_tick_if_needed'
    AND pg_get_function_identity_arguments(p.oid)='';
  IF v_src IS NULL THEN RAISE EXCEPTION 'Authoritative game clock procedure not found'; END IF;
  IF strpos(v_src,v_new)>0 THEN RETURN; END IF;
  IF (length(v_src)-length(replace(v_src,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Unexpected clock boundary function; refusing unsafe replacement';
  END IF;
  EXECUTE replace(v_src,v_old,v_new);
END $wire_boundary$;

SELECT cron.schedule('cycling-season-two-day-tick-v1','* * * * *',
  'select public.tick_cycling_season_window_v1();');

COMMENT ON FUNCTION public.tick_cycling_season_window_v1() IS
'After Dec31 hold, run verified v2 migration locked >=24 real hours; open 24h paused January signup; then auto-resume at 2x.';
