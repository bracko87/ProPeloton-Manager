-- The forward backlog function already sets its own 300s timeout.
-- Use one cron statement so the processor result is actually executed and logged.
do $$
declare v_jobid bigint;
begin
  select jobid into strict v_jobid
  from cron.job
  where jobname='forward-daily-automation-every-minute'
    and active;
  perform cron.alter_job(
    job_id=>v_jobid,
    schedule=>'*/5 * * * *',
    command=>'select public.process_forward_daily_automation_safe_v2();'
  );
end;
$$;