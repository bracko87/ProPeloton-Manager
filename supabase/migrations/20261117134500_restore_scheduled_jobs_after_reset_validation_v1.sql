-- Preserve each cron job's original active/inactive state during the world reset.
-- Restore ONLY after successful new Season 1 validation; leave the game
-- clock paused and the public maintenance lock intact until separately approved.
CREATE OR REPLACE FUNCTION private.game_world_reset_restore_cron_after_validation_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_job record;
 v_enabled integer:=0;
 v_expected integer;
 v_total integer;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.game_world_reset_runs r
   WHERE r.id=p_reset_run_id
     AND r.status='completed'
     AND coalesce((r.validation_report->>'ok')::boolean,false)=true
 ) THEN
   RAISE EXCEPTION 'Cron jobs cannot resume until world reset completed with passing validation';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM private.game_world_reset_maintenance_gate_v1 g
   WHERE g.id=true AND g.locked=true AND g.reset_run_id=p_reset_run_id
 ) OR NOT EXISTS (
   SELECT 1 FROM public.game_state gs
    JOIN public.game_clock_config cfg ON cfg.id=true
   WHERE gs.id=true AND gs.season_number=1 AND gs.is_paused=true
     AND cfg.base_season=1 AND cfg.is_paused=true
 ) THEN
   RAISE EXCEPTION 'Cron resume requires locked maintenance and paused fresh Season 1';
 END IF;
 IF coalesce((public.game_world_reset_validate_v2()->>'ok')::boolean,false)<>true THEN
   RAISE EXCEPTION 'Fresh Season 1 validation no longer passes; refusing cron resume';
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtext('game_world_reset_cron_quiescence_v1')::bigint);
 SELECT count(*),count(*) FILTER(WHERE originally_active)
   INTO v_total,v_expected
 FROM private.game_world_reset_cron_snapshot_v1
 WHERE reset_run_id=p_reset_run_id;

 IF v_total=0 OR EXISTS (
   SELECT 1 FROM private.game_world_reset_cron_snapshot_v1 s
   LEFT JOIN cron.job j ON j.jobid=s.job_id
   WHERE s.reset_run_id=p_reset_run_id
     AND (j.jobid IS NULL OR j.jobname IS DISTINCT FROM s.job_name)
 ) THEN
   RAISE EXCEPTION 'Cron restore snapshot missing or job names changed; refusing resume';
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE active=true) THEN
   RAISE EXCEPTION 'Cron restore starts only from fully suspended jobs';
 END IF;

 FOR v_job IN
   SELECT job_id FROM private.game_world_reset_cron_snapshot_v1
   WHERE reset_run_id=p_reset_run_id AND originally_active=true
   ORDER BY job_id
 LOOP
   PERFORM cron.alter_job(job_id:=v_job.job_id,active:=true);
   v_enabled:=v_enabled+1;
 END LOOP;

 IF v_enabled<>v_expected
  OR (SELECT count(*) FROM cron.job WHERE active=true)<>v_expected THEN
   RAISE EXCEPTION 'Cron restore mismatch: restored %, expected %; rolling back',v_enabled,v_expected;
 END IF;

 RETURN jsonb_build_object(
  'ok',true,'reset_run_id',p_reset_run_id,
  'jobs_originally_active',v_expected,'jobs_restored',v_enabled,
  'originally_inactive_left_disabled',v_total-v_expected,
  'game_clock_paused',true,'maintenance_locked',true,
  'note','No game clock resume or public reopening was performed'
 );
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_restore_cron_after_validation_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_restore_cron_after_validation_v1(uuid) TO service_role;
