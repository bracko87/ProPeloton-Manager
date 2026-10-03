-- Hourly expiry maintenance lagged behind the five-minute business watchdog.
-- Keep the existing processor and permissions; stagger maintenance before health.
select cron.schedule(
  'expire-rider-transfer-market-every-minute',
  '4-59/5 * * * *',
  'select public.expire_rider_transfer_market_state();'
);
update public.system_monitor_processes
set expected_interval_minutes=5, stale_after_minutes=15
where source_ref='expire-rider-transfer-market-every-minute';

CREATE OR REPLACE FUNCTION public.run_system_health_watchdog_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  s timestamptz:=clock_timestamp(); p record; latest timestamptz; n integer; issues integer:=0; synced integer:=0;
  game_day date:=public.get_current_game_date_date(); game_ts timestamp:=public.get_current_game_timestamp();
  cfg record; details jsonb;
begin
  synced:=public.sync_system_cron_runs_v1();

  for p in select * from public.system_monitor_processes where is_enabled and source_kind='cron'
  loop
    if not exists(select 1 from cron.job j where j.jobname=p.source_ref and j.active) then
      perform public.raise_system_incident_v1(p.process_key,p.incident_severity,'Scheduled job missing or disabled',
        format('Required pg_cron job "%s" is missing or disabled.',p.source_ref),'cron-disabled:'||p.source_ref,
        jsonb_build_object('job_name',p.source_ref));
      issues:=issues+1; continue;
    else
      perform public.resolve_system_incident_by_dedupe_v1('cron-disabled:'||p.source_ref,'The scheduled job is active again.');
    end if;

    if p.stale_after_minutes is not null then
      select max(d.start_time) into latest
      from cron.job_run_details d join cron.job j on j.jobid=d.jobid
      where j.jobname=p.source_ref;
      if (latest is null and now()>p.created_at+(p.stale_after_minutes||' minutes')::interval) or (latest is not null and latest<now()-(p.stale_after_minutes||' minutes')::interval) then
        perform public.raise_system_incident_v1(p.process_key,p.incident_severity,'Scheduled process is overdue',
          format('No run of "%s" has started within the expected %s-minute health window.',p.label,p.stale_after_minutes),
          'cron-stale:'||p.source_ref,jsonb_build_object('job_name',p.source_ref,'last_run_at',latest));
        issues:=issues+1;
      else
        perform public.resolve_system_incident_by_dedupe_v1('cron-stale:'||p.source_ref,'Scheduler cadence is healthy.');
      end if;
    end if;
  end loop;


  select count(*) into n from public.club_sponsor_objectives o
  where o.status='active' and o.objective_result_state='pending'
    and o.target_check_game_date is not null and o.target_check_game_date<game_day;
  perform public.log_system_business_check_v1('check:sponsor_objectives',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s sponsor objective(s) overdue for evaluation.',n) else 'Sponsor objective processing is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:sponsor_objectives','high','Sponsor objectives are overdue',
    format('%s sponsor objective(s) remain pending past their check date.',n),'business:sponsor-objectives',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:sponsor-objectives','Sponsor objective processing is current.'); end if;

  select count(*) into n from public.rider_scout_tasks
  where status in ('queued','in_progress') and completes_at_game_ts<game_ts-interval '1 hour';
  perform public.log_system_business_check_v1('check:scouting_tasks',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s scouting task(s) overdue.',n) else 'Scouting task completion is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:scouting_tasks','high','Scouting tasks are overdue',
    format('%s scouting task(s) are still open after their completion time.',n),'business:scouting-tasks',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:scouting-tasks','Scouting tasks are current.'); end if;

  select count(*) into n from public.club_infrastructure_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:infrastructure_jobs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s infrastructure job(s) overdue.',n) else 'Infrastructure jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:infrastructure_jobs','high','Infrastructure jobs are overdue',
    format('%s infrastructure job(s) remain open after their completion date.',n),'business:infrastructure-jobs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:infrastructure-jobs','Infrastructure jobs are current.'); end if;

  select count(*) into n from public.club_equipment_maintenance_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:equipment_jobs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s equipment maintenance job(s) overdue.',n) else 'Equipment maintenance jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:equipment_jobs','high','Equipment maintenance is overdue',
    format('%s equipment maintenance job(s) remain open after their completion date.',n),'business:equipment-jobs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:equipment-jobs','Equipment maintenance is current.'); end if;

  select count(*) into n from public.club_infrastructure_asset_repair_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:asset_repairs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s infrastructure asset repair(s) overdue.',n) else 'Infrastructure asset repair jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:asset_repairs','high','Infrastructure asset repairs are overdue',
    format('%s repair job(s) remain open after their completion date.',n),'business:asset-repairs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:asset-repairs','Infrastructure asset repairs are current.'); end if;

  select count(*) into n from public.staff_courses
  where status='active' and completes_on_game_date<game_day;
  perform public.log_system_business_check_v1('check:staff_courses',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s staff course(s) overdue.',n) else 'Staff course completion is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:staff_courses','high','Staff courses are overdue',
    format('%s active staff course(s) remain open after their completion date.',n),'business:staff-courses',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:staff-courses','Staff courses are current.'); end if;

  -- Recover using the game's authoritative processor before escalating.
  -- A failed recovery remains visible and does not skip the other health checks.
  details := '{}'::jsonb;
  if exists (
    select 1 from public.rider_transfer_negotiations
    where status='open' and expires_on_game_date<game_day
  ) then
    begin
      perform public.expire_rider_transfer_market_state();
      details := jsonb_build_object('recovery_attempted', true);
    exception when others then
      details := jsonb_build_object(
        'recovery_attempted', true, 'recovery_error', sqlerrm, 'recovery_sqlstate', sqlstate
      );
    end;
  end if;

  select count(*) into n from public.rider_transfer_negotiations
  where status='open' and expires_on_game_date<game_day;
  details := details || jsonb_build_object('count',n);
  perform public.log_system_business_check_v1('check:transfer_negotiations',case when n>0 then 'warning' else 'success' end,
    case when n>0 then format('%s transfer negotiation(s) expired but still open after recovery.',n) else 'Transfer negotiation expiry state is current.' end,details);
  if n>0 then perform public.raise_system_incident_v1('check:transfer_negotiations','high','Expired transfer negotiations remain open',
    format('%s transfer negotiation(s) should already be terminal after recovery.',n),'business:transfer-negotiations',details); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:transfer-negotiations','Transfer negotiation expiry state is current.'); end if;

  select gc.speed_multiplier,gc.base_real_at,gc.base_game_at,gc.is_paused,gs.last_advanced_at,gs.is_paused state_paused
  into cfg
  from public.game_clock_config gc cross join public.game_state gs
  where gc.id=true and gs.id=true;
  details:=jsonb_build_object('speed_multiplier',cfg.speed_multiplier,'base_real_at',cfg.base_real_at,'base_game_at',cfg.base_game_at,
    'clock_paused',cfg.is_paused,'state_paused',cfg.state_paused,'last_advanced_at',cfg.last_advanced_at);
  n:=case when cfg.speed_multiplier is null or cfg.speed_multiplier<=0 or cfg.base_real_at>now()+interval '5 minutes' then 1 else 0 end;
  perform public.log_system_business_check_v1('check:game_clock',case when n>0 then 'error' else 'success' end,
    case when n>0 then 'Game clock configuration is invalid.' else 'Game clock configuration is valid.' end,details);
  if n>0 then perform public.raise_system_incident_v1('check:game_clock','critical','Game clock configuration is invalid',
    'The game clock has an invalid speed or a future real-time anchor.','business:game-clock',details); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:game-clock','Game clock configuration is valid.'); end if;

  select count(*) into n from public.system_alert_email_outbox
  where (status='failed' and attempts>=3) or (status='sending' and last_attempt_at<now()-interval '20 minutes');
  perform public.log_system_business_check_v1('check:admin_alert_email',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s administrator alert email job(s) repeatedly failing/stuck.',n) else 'Administrator alert email channel is healthy.' end,jsonb_build_object('count',n));
  if n>0 then
    perform public.raise_system_incident_v1('check:admin_alert_email','critical','Administrator alert email channel is failing',
      format('%s system-health alert email job(s) are repeatedly failing or stuck.',n),'business:admin-alert-email',jsonb_build_object('count',n));
    issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:admin-alert-email','Administrator alert email channel is healthy.'); end if;

  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,details)
  values('watchdog:system-health',case when issues>0 then 'warning' else 'success' end,s,clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),
    format('Watchdog completed: %s cron runs synchronized, %s active issue(s).',synced,issues),
    jsonb_build_object('cron_runs_synced',synced,'issues',issues,'game_date',game_day,'game_timestamp',game_ts));
  perform public.resolve_system_incident_by_dedupe_v1('watchdog:self-failure','System health watchdog completed successfully.');
  return jsonb_build_object('status','completed','cron_runs_synced',synced,'active_checks_failed',issues);
exception when others then
  perform public.raise_system_incident_v1('watchdog:system-health','critical','System health watchdog failed',sqlerrm,
    'watchdog:self-failure',jsonb_build_object('sqlstate',sqlstate));
  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,error_message)
  values('watchdog:system-health','error',s,clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),'System health watchdog failed.',sqlerrm);
  return jsonb_build_object('status','error','error',sqlerrm);
end;
$function$
;
