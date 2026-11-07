-- Spread costly control-center health snapshot away from busiest
-- :00/:10/:20/... boundaries and the system watchdog at :03/:13/... .
-- Preserve the 10-minute interval, job ID, SQL command and active state.
do $schedule$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job
  where jobname = 'control-center-system-health-snapshot-v1'
    and command = 'select control_center_private.flush_system_health_snapshot_v1();'
    and active
  limit 1;

  if v_job_id is not null then
    perform cron.alter_job(job_id := v_job_id, schedule := '6-59/10 * * * *');
  end if;
end
$schedule$;
