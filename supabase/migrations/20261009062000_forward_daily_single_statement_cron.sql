-- The forward backlog function already sets its own 300s timeout.
-- Use one cron statement so the processor result is actually executed and logged.
do $$
declare v_jobid bigint;
begin
  -- Local fresh installs may carry this job in an inactive state.
  -- Do not activate it: the scheduler must remain under release control.
  select jobid into v_jobid
  from cron.job
  where jobname='forward-daily-automation-every-minute';
  if v_jobid is not null then
    perform cron.alter_job(
      job_id=>v_jobid,
      schedule=>'*/5 * * * *',
      command=>'select public.process_forward_daily_automation_safe_v2();'
    );
  end if;
end;
$$;