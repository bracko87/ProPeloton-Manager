-- The forward backlog processor used to skip whenever the minute clock tick held
-- the shared lock. At 12x this left entire game days pending and withheld weekly
-- youth development and payroll. Wait for the tick, then use the existing
-- snapshot/restore processor; do not advance or rewrite live game time.
create or replace function public.process_forward_daily_automation_safe_v2()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '300s'
as $function$
declare
  v_activation public.automation_forward_activation_v1%rowtype;
  v_live_date date;
begin
  select * into v_activation from public.automation_forward_activation_v1 where id=true;
  if not found then
    return jsonb_build_object('status','blocked_missing_forward_activation','success',false);
  end if;

  select public.get_current_game_date_date() into v_live_date;
  if not exists (
    select 1 from public.game_daily_tick_backlog_v1 b
    where b.status='pending'
      and b.current_game_date >= v_activation.daily_processing_starts_on
      and b.current_game_date <= v_live_date
  ) then
    return jsonb_build_object(
      'status','no_due_live_daily_backlog','success',true,
      'live_game_date',v_live_date,
      'daily_processing_starts_on',v_activation.daily_processing_starts_on
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtext('public.run_daily_tick_if_needed')::bigint
  );
  return public.process_forward_daily_automation_v1();
end;
$function$;

do $$
declare v_jobid bigint;
begin
  select jobid into strict v_jobid
  from cron.job
  where jobname='forward-daily-automation-every-minute'
    and active;
  perform cron.alter_job(job_id=>v_jobid,schedule=>'*/5 * * * *');
end;
$$;