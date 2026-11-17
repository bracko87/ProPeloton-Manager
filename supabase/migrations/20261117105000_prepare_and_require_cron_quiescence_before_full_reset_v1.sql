-- Cron maintenance is PREPARED, not active.  The runtime uses this only after
-- a verified backup and fresh Season 1 reset approvals, with both game clocks paused.
-- This stores job IDs/names/flags, never job commands or secrets.

CREATE TABLE IF NOT EXISTS private.game_world_reset_cron_snapshot_v1(
 reset_run_id uuid NOT NULL REFERENCES public.game_world_reset_runs(id) ON DELETE RESTRICT,
 job_id bigint NOT NULL,
 job_name text NOT NULL,
 originally_active boolean NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(reset_run_id,job_id)
);
ALTER TABLE private.game_world_reset_cron_snapshot_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_world_reset_cron_snapshot_v1 FROM PUBLIC,anon,authenticated;

-- private.game_world_reset_quiesce_cron_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_quiesce_cron_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_job record;
 v_active_before int;
 v_changed int:=0;
 v_total int;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.game_world_reset_runs r
   WHERE r.id=p_reset_run_id AND r.status='source_frozen'
 ) OR NOT EXISTS(
   SELECT 1 FROM public.game_state g JOIN public.game_clock_config c ON c.id=true
   WHERE g.id=true AND g.is_paused=true AND c.is_paused=true
 ) THEN
   RAISE EXCEPTION 'Cron quiescence requires a frozen reset run and paused game clock';
 END IF;

 IF NOT EXISTS (
   SELECT 1 FROM private.game_world_reset_execution_signoffs_v1 s
   WHERE s.reset_run_id=p_reset_run_id AND s.backup_verified=true
     AND length(btrim(coalesce(s.backup_reference,'')))>5
     AND s.player_clubs_preserved AND s.national_calendar_rebuild_verified
     AND s.reset_validator_updated AND s.signed_off_at IS NOT NULL
 ) THEN
   RAISE EXCEPTION 'Cron quiescence blocked until all backup and restart protections are verified';
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('game_world_reset_cron_quiescence_v1')::bigint);
 SELECT count(*) INTO v_active_before FROM cron.job WHERE active=true;

 IF NOT EXISTS(
   SELECT 1 FROM private.game_world_reset_cron_snapshot_v1
   WHERE reset_run_id=p_reset_run_id
 ) THEN
   INSERT INTO private.game_world_reset_cron_snapshot_v1(
    reset_run_id,job_id,job_name,originally_active
   )
   SELECT p_reset_run_id,jobid,jobname,active FROM cron.job;
 END IF;

 FOR v_job IN SELECT jobid FROM cron.job WHERE active=true ORDER BY jobid
 LOOP
   PERFORM cron.alter_job(job_id:=v_job.jobid,active:=false);
   v_changed:=v_changed+1;
 END LOOP;

 IF EXISTS(SELECT 1 FROM cron.job WHERE active=true) THEN
   RAISE EXCEPTION 'Could not suspend all cron jobs; changes rolled back';
 END IF;

 SELECT count(*) INTO v_total FROM private.game_world_reset_cron_snapshot_v1
 WHERE reset_run_id=p_reset_run_id;
 RETURN jsonb_build_object(
   'ok',true,'cron_jobs_snapshotted',v_total,
   'previously_active_jobs',v_active_before,'jobs_disabled_now',v_changed,
   'jobs_still_active',0,'note','In-flight jobs and remote endpoints must also be drained/blocked before executing reset'
 );
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_quiesce_cron_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_quiesce_cron_v1(uuid) TO service_role;

-- private.game_world_reset_cron_quiescence_status_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_cron_quiescence_status_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
SELECT jsonb_build_object(
 'read_only',true,
 'reset_run_id',p_reset_run_id,
 'job_snapshot_rows',(SELECT count(*) FROM private.game_world_reset_cron_snapshot_v1 s WHERE s.reset_run_id=p_reset_run_id),
 'originally_active',(SELECT count(*) FROM private.game_world_reset_cron_snapshot_v1 s WHERE s.reset_run_id=p_reset_run_id AND s.originally_active),
 'currently_active',(SELECT count(*) FROM cron.job WHERE active=true),
 'recently_running_jobs',(SELECT count(*) FROM cron.job_run_details d
   WHERE d.status='running' AND d.start_time>now()-interval '20 minutes'),
 'quiesced',(SELECT COUNT(*)>0 FROM private.game_world_reset_cron_snapshot_v1 s
   WHERE s.reset_run_id=p_reset_run_id)
   AND NOT EXISTS(SELECT 1 FROM cron.job WHERE active=true)
   AND NOT EXISTS(SELECT 1 FROM cron.job_run_details d
     WHERE d.status='running' AND d.start_time>now()-interval '20 minutes')
);
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_cron_quiescence_status_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_cron_quiescence_status_v1(uuid) TO service_role;

-- private.game_world_reset_execute_guard_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_execute_guard_v1(p_reset_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_missing_player_clubs int;
BEGIN
  SELECT COUNT(*) INTO v_missing_player_clubs
  FROM public.clubs c
  WHERE c.deleted_at IS NULL
    AND c.owner_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b
      WHERE b.club_id=c.id
    );
  IF v_missing_player_clubs>0 THEN
    RAISE EXCEPTION 'World reset blocked: % player-owned clubs excluded from Season 1 baseline', v_missing_player_clubs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM private.game_world_reset_execution_signoffs_v1 s
    WHERE s.reset_run_id=p_reset_run_id
      AND s.backup_verified=true
      AND length(btrim(coalesce(s.backup_reference,'')))>5
      AND s.player_clubs_preserved=true
      AND s.national_calendar_rebuild_verified=true
      AND s.reset_validator_updated=true
      AND s.signed_off_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'World reset blocked: verified backup, club preservation, national calendar rebuild and validation signoffs required';
  END IF;

  -- The backup signoff alone is insufficient: background game engines must
  -- be suspended and their previous cron settings retained for safe recovery.
  IF NOT EXISTS (
    SELECT 1 FROM private.game_world_reset_cron_snapshot_v1 snap
    WHERE snap.reset_run_id=p_reset_run_id
  ) OR EXISTS (
    SELECT 1 FROM cron.job WHERE active=true
  ) OR EXISTS (
    SELECT 1 FROM cron.job_run_details d
    WHERE d.status='running' AND d.start_time>now()-interval '20 minutes'
  ) THEN
    RAISE EXCEPTION 'World reset blocked: cron jobs must be snapshotted, suspended, and drained';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_execute_guard_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_execute_guard_v1(uuid) TO service_role;
