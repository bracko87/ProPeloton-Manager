-- Avoid recurring 00/30 minute deadlocks between the National Championship
-- planner (*/15) and the system-health watchdog (*/10).
-- Retain the guarded watchdog and its interval, changing only the offset.
do $migration$
declare v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'ppm-system-health-watchdog-v1'
    and command = 'select public.run_system_health_watchdog_guarded_v2();'
    and active
  limit 1;

  if v_job_id is not null then
    perform cron.alter_job(job_id := v_job_id, schedule := '3-59/10 * * * *');
  end if;
end
$migration$;
