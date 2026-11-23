-- Historical October 8 migration alters this job but the fresh baseline may
-- omit it. Restore the verified CURRENT production schedule and inactive state.
-- Read-only production catalog: */5 minutes, inactive, safe processor v2.
-- Never alter an existing job in this bootstrap migration.
do $migration$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job
  where jobname='forward-daily-automation-every-minute';

  if v_id is null then
    v_id:=cron.schedule(
      'forward-daily-automation-every-minute',
      '*/5 * * * *',
      'select public.process_forward_daily_automation_safe_v2();'
    );
    -- The production job is inactive. Preserve that state in the local
    -- fresh-install database and prevent unintended game-clock processing.
    perform cron.alter_job(v_id, active := false);
  end if;
end;
$migration$;
