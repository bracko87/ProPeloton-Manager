-- Match the race calculation scheduler to the accelerated 12x game clock.
-- The due-stage claim queue is fresh for 20 game minutes (100 real seconds at 12x).
-- A ten-minute watchdog and three-minute runner can miss that window.
-- Keep the cron commands and job identities intact; only tighten the cadence.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid, jobname
    from cron.job
    where jobname in (
      'race-engine-due-stage-watchdog-v1',
      'universal-race-stage-runner-supabase-v1'
    )
      and active
  loop
    perform cron.alter_job(
      job_id => v_job.jobid,
      schedule => '* * * * *'
    );
  end loop;

  -- Isolated fresh installations have neither legacy cron identity.
  -- Do not create a fake runner that points to a production Edge Function or
  -- requires production Vault secrets. Scheduler setup belongs to isolated staging.
  -- Fail closed when only part of an existing scheduler pair is configured.
  if (select count(*) from cron.job
      where jobname in (
        'race-engine-due-stage-watchdog-v1',
        'universal-race-stage-runner-supabase-v1'
      )) = 0 then
    raise notice 'Race scheduler cron cadence deferred: no legacy jobs on fresh install';
  elsif (select count(*) from cron.job
      where jobname in (
        'race-engine-due-stage-watchdog-v1',
        'universal-race-stage-runner-supabase-v1'
      ) and active) <> 2 then
    raise exception 'Both active race scheduler jobs are required';
  end if;
end;
$$;