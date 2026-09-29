
begin;

create table if not exists public.system_health_config_v1 (
  id boolean primary key default true check(id=true),
  alert_email text not null default 'bracko87@live.com',
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.system_health_config_v1(id,alert_email,email_enabled)
select true,coalesce((select alert_email from public.race_operations_config_v1 where id=true),'bracko87@live.com'),true
on conflict(id) do update set updated_at=now();

create table if not exists public.system_monitor_processes (
  process_key text primary key,
  label text not null,
  category text not null,
  description text not null default '',
  source_kind text not null check(source_kind in ('cron','watchdog','business_check','external')),
  source_ref text,
  user_sensitive boolean not null default false,
  incident_severity text not null default 'high' check(incident_severity in ('warning','high','critical')),
  expected_interval_minutes integer,
  stale_after_minutes integer,
  email_alerts_enabled boolean not null default true,
  is_enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  process_key text not null references public.system_monitor_processes(process_key) on delete cascade,
  source_run_id bigint,
  status text not null check(status in ('running','success','warning','error','stalled')),
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms bigint,
  summary text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists system_monitor_runs_source_uidx
  on public.system_monitor_runs(process_key,source_run_id) where source_run_id is not null;
create index if not exists system_monitor_runs_process_started_idx
  on public.system_monitor_runs(process_key,started_at desc);

create table if not exists public.system_incidents (
  id uuid primary key default gen_random_uuid(),
  process_key text not null references public.system_monitor_processes(process_key) on delete restrict,
  severity text not null check(severity in ('warning','high','critical')),
  status text not null default 'open' check(status in ('open','acknowledged','resolved')),
  title text not null,
  message text not null,
  dedupe_key text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  last_emailed_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists system_incidents_active_dedupe_uidx
  on public.system_incidents(dedupe_key) where status in ('open','acknowledged');

create table if not exists public.system_incident_admin_reads (
  incident_id uuid not null references public.system_incidents(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(incident_id,admin_user_id)
);

create table if not exists public.system_alert_email_outbox (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.system_incidents(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  text_body text not null,
  html_body text not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.system_health_config_v1 enable row level security;
alter table public.system_monitor_processes enable row level security;
alter table public.system_monitor_runs enable row level security;
alter table public.system_incidents enable row level security;
alter table public.system_incident_admin_reads enable row level security;
alter table public.system_alert_email_outbox enable row level security;

drop policy if exists "app admins read system incidents" on public.system_incidents;
create policy "app admins read system incidents" on public.system_incidents
for select to authenticated using(public.is_app_admin_v1());
grant select on public.system_incidents to authenticated;

insert into public.system_monitor_processes(
  process_key,label,category,description,source_kind,source_ref,user_sensitive,
  incident_severity,expected_interval_minutes,stale_after_minutes,email_alerts_enabled,sort_order
)
values
('watchdog:system-health','System health watchdog','Core','Synchronizes scheduler history and evaluates business-state health checks.','watchdog','ppm-system-health-watchdog-v1',true,'critical',5,15,true,1),
('cron:run-daily-tick-every-minute','Daily game processing','Core','Advances daily gameplay processors, rider state, scouting, finance and automation.','cron','run-daily-tick-every-minute',true,'critical',1,8,true,10),
('cron:forward-due-game-events-every-minute','Due game events','Core','Processes infrastructure and equipment jobs that are due in game time.','cron','forward-due-game-events-every-minute',true,'critical',2,10,true,20),
('cron:forward-daily-automation-every-minute','Forward daily automation','Core','Runs retry-safe forward daily processors after game-time progression.','cron','forward-daily-automation-every-minute',true,'critical',30,75,true,30),
('cron:universal-race-stage-runner-supabase-v1','Universal race stage runner','Race Engine','Claims and runs due race stages through the production TypeScript engine.','cron','universal-race-stage-runner-supabase-v1',true,'critical',3,12,true,40),
('cron:universal-race-stage-pass1-resume-v1','Race engine pass 1 resume','Race Engine','Resumes interrupted first-pass race calculations.','cron','universal-race-stage-pass1-resume-v1',true,'critical',3,12,true,50),
('cron:universal-race-stage-pass2-resume-v2','Race engine pass 2 resume','Race Engine','Resumes interrupted second-pass race calculations.','cron','universal-race-stage-pass2-resume-v2',true,'critical',3,12,true,60),
('cron:universal-race-calculation-survival-v1','Race calculation survival','Race Engine','Recovers stalled or orphaned race calculation runs.','cron','universal-race-calculation-survival-v1',true,'critical',5,20,true,70),
('cron:universal-race-calculation-guard-v1','Race calculation guard','Race Engine','Guards duplicate and stuck race calculations.','cron','universal-race-calculation-guard-v1',true,'critical',5,20,true,80),
('cron:universal-race-release-supervisor-v1','Race release supervisor','Race Engine','Supervises replay/result release and publication lifecycle.','cron','universal-race-release-supervisor-v1',true,'critical',2,10,true,90),
('cron:universal-race-publication-retry-v1','Race publication retry','Race Engine','Retries incomplete race result/replay publication.','cron','universal-race-publication-retry-v1',true,'critical',5,20,true,100),
('cron:race-engine-due-stage-watchdog-v1','Due race-stage watchdog','Race Engine','Detects due stages that did not enter normal production processing.','cron','race-engine-due-stage-watchdog-v1',true,'critical',10,30,true,110),
('cron:race-operations-monitor-v1','Race operations monitor','Race Engine','Maintains calculation, replay and result-publication health status.','cron','race-operations-monitor-v1',true,'critical',15,45,true,120),
('cron:race-results-summary-notifications-v2','Race result notifications','Messaging','Creates personalized post-race result notifications.','cron','race-results-summary-notifications-v2',true,'high',30,75,true,130),
('cron:ppm_due_game_notifications_scheduler_v1','Due game notifications','Messaging','Creates time-sensitive game notifications.','cron','ppm_due_game_notifications_scheduler_v1',true,'high',30,75,true,140),
('cron:sponsor-objectives-due-by-game-clock-v1','Sponsor objectives','Finance','Evaluates due sponsor objectives and payouts.','cron','sponsor-objectives-due-by-game-clock-v1',true,'high',10,30,true,150),
('cron:weekly-rider-wages-check','Rider wages','Finance','Posts due rider wage expenses.','cron','weekly-rider-wages-check',true,'critical',720,900,true,160),
('cron:weekly-staff-wages-check','Staff wages','Finance','Posts due staff wage expenses.','cron','weekly-staff-wages-check',true,'critical',720,900,true,170),
('cron:finance_recompute_weekly_summaries_hourly','Finance summaries','Finance','Recomputes weekly finance summary values.','cron','finance_recompute_weekly_summaries_hourly',true,'high',60,150,true,180),
('cron:expire-rider-transfer-market-every-minute','Transfer expiry maintenance','Transfers','Expires transfer listings, offers and negotiation state.','cron','expire-rider-transfer-market-every-minute',true,'high',60,150,true,190),
('cron:free-agent-maintenance-unlimited-every-minute','Free-agent maintenance','Transfers','Maintains free-agent lifecycle and availability.','cron','free-agent-maintenance-unlimited-every-minute',true,'high',15,45,true,200),
('cron:market-ai-hourly-by-game-clock','Transfer market AI','Transfers','Runs AI transfer market behavior.','cron','market-ai-hourly-by-game-clock',false,'warning',15,45,true,210),
('cron:transfer-refresh-market-alerts-v1','Transfer market alerts','Transfers','Refreshes saved-search and transfer market alerts.','cron','transfer-refresh-market-alerts-v1',true,'high',60,150,true,220),
('cron:staff-market-daily-refresh','Staff market refresh','Staff','Refreshes staff-market candidate stock and expiries.','cron','staff-market-daily-refresh',true,'high',1440,1800,true,230),
('cron:staff-advisory-reports-hourly','Staff advisory reports','Staff','Generates due staff advisory reports.','cron','staff-advisory-reports-hourly',true,'high',60,150,true,240),
('cron:weather-cancellations-due-by-game-clock','Weather cancellation processing','Races','Processes weather-related race cancellations.','cron','weather-cancellations-due-by-game-clock',true,'high',15,45,true,250),
('cron:race-startlist-captains-by-game-clock','Race startlist captains','Races','Processes due startlist/captain lifecycle actions.','cron','race-startlist-captains-by-game-clock',true,'critical',15,45,true,260),
('cron:ensure-competition-sizes-hourly','Competition field sizes','Races','Keeps competition fields at configured size.','cron','ensure-competition-sizes-hourly',false,'warning',60,150,true,270),
('cron:refresh-market-values-if-new-game-month','Monthly rider market values','Riders','Refreshes rider market values when the game month changes.','cron','refresh-market-values-if-new-game-month',true,'high',1440,1800,true,280),
('cron:process-team-inactivity-daily-0600-utc','Team inactivity','Accounts','Processes inactive human clubs and lifecycle actions.','cron','process-team-inactivity-daily-0600-utc',true,'high',1440,1800,true,290),
('cron:process-birthday-gifts-daily-1200-utc','Birthday gifts','Accounts','Processes real birthday gifts for users.','cron','process-birthday-gifts-daily-1200-utc',true,'warning',1440,1800,true,300),
('cron:import-cycling-world-news-every-6-hours','Cycling world news','Content','Imports current Cycling World News items.','cron','import-cycling-world-news-every-6-hours',false,'warning',360,540,true,310),
('check:race_operations','Race operations state','Race Engine','Detects active race calculation, replay or publication problems.','business_check',null,true,'critical',5,15,true,400),
('check:sponsor_objectives','Sponsor objective state','Finance','Detects sponsor objectives overdue for evaluation.','business_check',null,true,'high',5,15,true,410),
('check:scouting_tasks','Scouting task completion','Scouting','Detects scouting tasks left open after their completion game time.','business_check',null,true,'high',5,15,true,420),
('check:infrastructure_jobs','Infrastructure jobs','Infrastructure','Detects due upgrades or deliveries not completed.','business_check',null,true,'high',5,15,true,430),
('check:equipment_jobs','Equipment maintenance','Equipment','Detects due maintenance jobs not completed.','business_check',null,true,'high',5,15,true,440),
('check:asset_repairs','Infrastructure asset repairs','Infrastructure','Detects due asset repair jobs not completed.','business_check',null,true,'high',5,15,true,450),
('check:staff_courses','Staff courses','Staff','Detects active staff courses past their completion game date.','business_check',null,true,'high',5,15,true,460),
('check:transfer_negotiations','Transfer negotiations','Transfers','Detects open transfer negotiations past their game-date expiry.','business_check',null,true,'high',5,15,true,470),
('check:game_clock','Game clock sanity','Core','Detects invalid game clock configuration or inconsistent state.','business_check',null,true,'critical',5,15,true,480),
('check:admin_alert_email','Administrator alert email','Core','Detects system-health alert email jobs repeatedly failing or stuck.','business_check',null,true,'critical',5,15,false,490)
on conflict(process_key) do update set
 label=excluded.label,category=excluded.category,description=excluded.description,
 source_kind=excluded.source_kind,source_ref=excluded.source_ref,user_sensitive=excluded.user_sensitive,
 incident_severity=excluded.incident_severity,expected_interval_minutes=excluded.expected_interval_minutes,
 stale_after_minutes=excluded.stale_after_minutes,email_alerts_enabled=excluded.email_alerts_enabled,
 is_enabled=true,sort_order=excluded.sort_order,updated_at=now();

create or replace function public.queue_system_incident_email_v1(p_incident_id uuid)
returns integer
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  i public.system_incidents%rowtype;
  p public.system_monitor_processes%rowtype;
  cfg public.system_health_config_v1%rowtype;
  v_subject text; v_text text; v_html text; v_count integer:=0; v_email text;
begin
  select * into i from public.system_incidents where id=p_incident_id;
  if not found then return 0; end if;
  select * into p from public.system_monitor_processes where process_key=i.process_key;
  if not found or not p.email_alerts_enabled then return 0; end if;
  select * into cfg from public.system_health_config_v1 where id=true;
  if not coalesce(cfg.email_enabled,true) then return 0; end if;

  v_subject:=format('[ProPeloton Manager] %s system incident: %s',upper(i.severity),i.title);
  v_text:=format(E'ProPeloton Manager detected a system problem.\n\nSeverity: %s\nProcess: %s\nCategory: %s\nFirst seen: %s\nLast seen: %s\n\n%s\n\nOpen Administration → System Health for diagnostics.',
    upper(i.severity),p.label,p.category,i.first_seen_at,i.last_seen_at,i.message);
  v_html:=format('<div style="font-family:Arial,sans-serif;color:#111827"><h2>ProPeloton Manager system incident</h2><p><strong>Severity:</strong> %s<br><strong>Process:</strong> %s<br><strong>Category:</strong> %s<br><strong>First seen:</strong> %s<br><strong>Last seen:</strong> %s</p><p>%s</p><p>Open <strong>Administration → System Health</strong> for diagnostics.</p></div>',
    upper(i.severity),p.label,p.category,i.first_seen_at,i.last_seen_at,replace(replace(i.message,'&','&amp;'),'<','&lt;'));

  for v_email in
    select distinct x.email from (
      select nullif(trim(a.email),'') email from public.app_admins a where a.is_active=true
      union all
      select nullif(trim(cfg.alert_email),'')
    ) x where x.email is not null
  loop
    insert into public.system_alert_email_outbox(incident_id,recipient_email,subject,text_body,html_body)
    values(i.id,v_email,v_subject,v_text,v_html);
    v_count:=v_count+1;
  end loop;

  update public.system_incidents set last_emailed_at=now(),updated_at=now() where id=i.id;
  return v_count;
end;
$$;

create or replace function public.raise_system_incident_v1(
  p_process_key text,p_severity text,p_title text,p_message text,p_dedupe_key text,p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_id uuid; v_last_email timestamptz; v_old_severity text;
  v_severity text:=lower(coalesce(p_severity,'high')); v_email boolean:=false;
begin
  if v_severity not in ('warning','high','critical') then v_severity:='high'; end if;
  select id,last_emailed_at,severity into v_id,v_last_email,v_old_severity
  from public.system_incidents
  where dedupe_key=p_dedupe_key and status in ('open','acknowledged')
  order by created_at desc limit 1 for update;

  if v_id is null then
    insert into public.system_incidents(process_key,severity,status,title,message,dedupe_key,details)
    values(p_process_key,v_severity,'open',p_title,p_message,p_dedupe_key,coalesce(p_details,'{}'))
    returning id into v_id;
    v_email:=true;
  else
    update public.system_incidents
    set severity=case when severity='critical' then severity when severity='high' and v_severity='warning' then severity else v_severity end,
        title=p_title,message=p_message,details=coalesce(p_details,'{}'),last_seen_at=now(),
        occurrence_count=occurrence_count+1,updated_at=now()
    where id=v_id;
    v_email:=v_last_email is null
      or v_last_email<now()-interval '6 hours'
      or (v_old_severity='warning' and v_severity in ('high','critical'))
      or (v_old_severity='high' and v_severity='critical');
  end if;
  if v_email then perform public.queue_system_incident_email_v1(v_id); end if;
  return v_id;
end;
$$;

create or replace function public.resolve_system_incident_by_dedupe_v1(p_dedupe_key text,p_note text default 'Recovered automatically.')
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.system_incidents
  set status='resolved',resolved_at=coalesce(resolved_at,now()),resolution_note=coalesce(nullif(p_note,''),'Recovered automatically.'),updated_at=now()
  where dedupe_key=p_dedupe_key and status in ('open','acknowledged');
  get diagnostics n=row_count; return n;
end;
$$;

create or replace function public.sync_system_cron_runs_v1()
returns integer language plpgsql security definer set search_path=public,cron,pg_temp as $$
declare r record; v_key text; n integer:=0;
begin
  for r in
    select j.jobname,d.runid,d.status,d.return_message,d.start_time,d.end_time
    from cron.job_run_details d join cron.job j on j.jobid=d.jobid
    where d.start_time>=now()-interval '48 hours'
    order by d.start_time
  loop
    v_key:='cron:'||r.jobname;
    if not exists(select 1 from public.system_monitor_processes where process_key=v_key and is_enabled) then continue; end if;
    insert into public.system_monitor_runs(process_key,source_run_id,status,started_at,finished_at,duration_ms,summary,error_message,details)
    values(v_key,r.runid,case when r.status='succeeded' then 'success' when r.status='running' then 'running' else 'error' end,
      r.start_time,r.end_time,
      case when r.end_time is not null then greatest(0,(extract(epoch from(r.end_time-r.start_time))*1000)::bigint) end,
      case when r.status='succeeded' then coalesce(nullif(r.return_message,''),'Completed') when r.status='running' then 'Scheduled process is running.' else 'Scheduled process failed.' end,
      case when r.status in ('succeeded','running') then null else coalesce(r.return_message,'Unknown pg_cron failure') end,
      jsonb_build_object('cron_status',r.status,'return_message',r.return_message))
    on conflict(process_key,source_run_id) where source_run_id is not null do nothing;
    if found then n:=n+1; end if;

    if r.status not in ('succeeded','running') then
      perform public.raise_system_incident_v1(v_key,
        (select incident_severity from public.system_monitor_processes where process_key=v_key),
        'Scheduled process failed',
        format('%s failed at %s. %s',r.jobname,r.start_time,coalesce(r.return_message,'No return message.')),
        'cron-failure:'||r.jobname,
        jsonb_build_object('job_name',r.jobname,'run_id',r.runid,'return_message',r.return_message));
    elsif r.status='succeeded' then
      perform public.resolve_system_incident_by_dedupe_v1('cron-failure:'||r.jobname,'A later scheduled run completed successfully.');
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.log_system_business_check_v1(
  p_key text,p_status text,p_summary text,p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare s timestamptz:=clock_timestamp();
begin
  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,details)
  values(p_key,p_status,s,clock_timestamp(),greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),p_summary,coalesce(p_details,'{}'));
end;
$$;

create or replace function public.run_system_health_watchdog_v1()
returns jsonb language plpgsql security definer set search_path=public,cron,pg_temp as $$
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
      if latest is null or latest<now()-(p.stale_after_minutes||' minutes')::interval then
        perform public.raise_system_incident_v1(p.process_key,p.incident_severity,'Scheduled process is overdue',
          format('No run of "%s" has started within the expected %s-minute health window.',p.label,p.stale_after_minutes),
          'cron-stale:'||p.source_ref,jsonb_build_object('job_name',p.source_ref,'last_run_at',latest));
        issues:=issues+1;
      else
        perform public.resolve_system_incident_by_dedupe_v1('cron-stale:'||p.source_ref,'Scheduler cadence is healthy.');
      end if;
    end if;
  end loop;

  select count(*) into n from public.race_operations_stage_status_v1 where has_problem;
  perform public.log_system_business_check_v1('check:race_operations',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s active race operation problem(s).',n) else 'Race calculation, replay and publication state is healthy.' end,
    jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:race_operations','critical','Race operations have active failures',
    format('%s race stage(s) currently require administrator attention.',n),'business:race-operations',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:race-operations','Race operations are healthy.'); end if;

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

  select count(*) into n from public.rider_transfer_negotiations
  where status='open' and expires_on_game_date<game_day;
  perform public.log_system_business_check_v1('check:transfer_negotiations',case when n>0 then 'warning' else 'success' end,
    case when n>0 then format('%s transfer negotiation(s) expired but still open.',n) else 'Transfer negotiation expiry state is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:transfer_negotiations','high','Expired transfer negotiations remain open',
    format('%s transfer negotiation(s) should already be terminal.',n),'business:transfer-negotiations',jsonb_build_object('count',n)); issues:=issues+1;
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
$$;

create or replace function public.get_admin_system_incident_unread_count_v1()
returns integer language sql stable security definer set search_path=public as $$
 select case when auth.uid() is null or not public.is_app_admin_v1() then 0 else (
   select count(*)::integer from public.system_incidents i
   where i.status in ('open','acknowledged')
   and not exists(select 1 from public.system_incident_admin_reads r where r.incident_id=i.id and r.admin_user_id=auth.uid())
 ) end;
$$;

create or replace function public.get_admin_system_health_overview_v1()
returns jsonb language plpgsql stable security definer set search_path=public,cron,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 with pr as (
   select p.*,lr.status latest_status,lr.started_at latest_started_at,lr.finished_at latest_finished_at,
     lr.duration_ms latest_duration_ms,lr.summary latest_summary,lr.error_message latest_error_message,
     cj.active cron_active,
     (select count(*)::int from public.system_incidents i where i.process_key=p.process_key and i.status in ('open','acknowledged')) open_incidents
   from public.system_monitor_processes p
   left join lateral(select * from public.system_monitor_runs r where r.process_key=p.process_key order by r.started_at desc limit 1) lr on true
   left join cron.job cj on p.source_kind='cron' and cj.jobname=p.source_ref
   where p.is_enabled
 )
 select jsonb_build_object(
   'summary',jsonb_build_object(
     'open_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged')),
     'critical_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='critical'),
     'high_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='high'),
     'warning_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='warning'),
     'monitored_processes',(select count(*) from public.system_monitor_processes where is_enabled),
     'user_sensitive_processes',(select count(*) from public.system_monitor_processes where is_enabled and user_sensitive),
     'alert_email',(select alert_email from public.system_health_config_v1 where id=true)
   ),
   'processes',coalesce((select jsonb_agg(jsonb_build_object(
     'process_key',process_key,'label',label,'category',category,'description',description,'source_kind',source_kind,'source_ref',source_ref,
     'user_sensitive',user_sensitive,'incident_severity',incident_severity,'expected_interval_minutes',expected_interval_minutes,
     'stale_after_minutes',stale_after_minutes,'latest_status',latest_status,'latest_started_at',latest_started_at,
     'latest_finished_at',latest_finished_at,'latest_duration_ms',latest_duration_ms,'latest_summary',latest_summary,
     'latest_error_message',latest_error_message,'cron_active',cron_active,'open_incidents',open_incidents
   ) order by sort_order,label) from pr),'[]'::jsonb),
   'incidents',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'process_key',i.process_key,'process_label',p.label,'category',p.category,'severity',i.severity,'status',i.status,
     'title',i.title,'message',i.message,'details',i.details,'first_seen_at',i.first_seen_at,'last_seen_at',i.last_seen_at,
     'occurrence_count',i.occurrence_count,'last_emailed_at',i.last_emailed_at,'acknowledged_at',i.acknowledged_at,
     'resolved_at',i.resolved_at,'resolution_note',i.resolution_note,
     'is_unread',not exists(select 1 from public.system_incident_admin_reads rr where rr.incident_id=i.id and rr.admin_user_id=auth.uid())
   ) order by case i.severity when 'critical' then 1 when 'high' then 2 else 3 end,i.last_seen_at desc)
   from public.system_incidents i join public.system_monitor_processes p on p.process_key=i.process_key
   where i.status in ('open','acknowledged')),'[]'::jsonb)
 ) into result;
 return result;
end;
$$;

create or replace function public.get_admin_system_incidents_v1(p_status text default 'active',p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; s text:=lower(coalesce(p_status,'active'));
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',x.id,'process_key',x.process_key,'process_label',x.label,'category',x.category,'severity',x.severity,'status',x.status,
   'title',x.title,'message',x.message,'details',x.details,'first_seen_at',x.first_seen_at,'last_seen_at',x.last_seen_at,
   'occurrence_count',x.occurrence_count,'last_emailed_at',x.last_emailed_at,'acknowledged_at',x.acknowledged_at,
   'resolved_at',x.resolved_at,'resolution_note',x.resolution_note,
   'is_unread',not exists(select 1 from public.system_incident_admin_reads rr where rr.incident_id=x.id and rr.admin_user_id=auth.uid())
 ) order by x.last_seen_at desc),'[]'::jsonb) into result
 from (
   select i.*,p.label,p.category from public.system_incidents i join public.system_monitor_processes p on p.process_key=i.process_key
   where (s='all' or (s='active' and i.status in ('open','acknowledged')) or (s='resolved' and i.status='resolved'))
   order by i.last_seen_at desc limit greatest(1,least(coalesce(p_limit,300),1000))
 ) x;
 return result;
end;
$$;

create or replace function public.get_admin_system_runs_v1(p_process_key text default null,p_limit integer default 400)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',x.id,'process_key',x.process_key,'process_label',x.label,'category',x.category,'status',x.status,
   'started_at',x.started_at,'finished_at',x.finished_at,'duration_ms',x.duration_ms,'summary',x.summary,
   'error_message',x.error_message,'details',x.details
 ) order by x.started_at desc),'[]'::jsonb) into result
 from (
   select r.*,p.label,p.category from public.system_monitor_runs r join public.system_monitor_processes p on p.process_key=r.process_key
   where p_process_key is null or r.process_key=p_process_key
   order by r.started_at desc limit greatest(1,least(coalesce(p_limit,400),1000))
 ) x;
 return result;
end;
$$;

create or replace function public.mark_admin_system_incident_read_v1(p_incident_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 insert into public.system_incident_admin_reads(incident_id,admin_user_id,read_at)
 values(p_incident_id,auth.uid(),now())
 on conflict(incident_id,admin_user_id) do update set read_at=excluded.read_at;
end;
$$;

create or replace function public.admin_update_system_incident_v1(p_incident_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a text:=lower(trim(coalesce(p_action,'')));
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if a='acknowledge' then
   update public.system_incidents set status='acknowledged',acknowledged_at=now(),acknowledged_by=auth.uid(),updated_at=now()
   where id=p_incident_id and status='open';
 elsif a='resolve' then
   update public.system_incidents set status='resolved',resolved_at=now(),resolved_by=auth.uid(),
     resolution_note=coalesce(nullif(trim(p_note),''),'Resolved by administrator.'),updated_at=now()
   where id=p_incident_id and status in ('open','acknowledged');
 elsif a='reopen' then
   update public.system_incidents set status='open',resolved_at=null,resolved_by=null,resolution_note=null,updated_at=now()
   where id=p_incident_id and status='resolved';
 else raise exception 'Invalid incident action.'; end if;
 if not found then raise exception 'Incident not found or action is invalid for its current status.'; end if;
 perform public.mark_admin_system_incident_read_v1(p_incident_id);
 return jsonb_build_object('id',p_incident_id,'action',a);
end;
$$;

create or replace function public.claim_system_alert_email_outbox_v1(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 with candidates as (
   select id from public.system_alert_email_outbox
   where status in ('pending','failed') and next_attempt_at<=now() and attempts<10
   order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,20),50))
 ), claimed as (
   update public.system_alert_email_outbox o set status='sending',attempts=o.attempts+1,last_attempt_at=now(),last_error=null,updated_at=now()
   from candidates c where o.id=c.id
   returning o.id,o.incident_id,o.recipient_email,o.subject,o.text_body,o.html_body,o.attempts
 )
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
 return result;
end;
$$;

create or replace function public.system_health_validate_alert_secret_v1(p_secret text)
returns boolean language sql stable security definer set search_path=public,vault,pg_temp as $$
 select exists(select 1 from vault.decrypted_secrets where name='system_health_alert_worker_secret_v1' and decrypted_secret=p_secret);
$$;

revoke all on function public.queue_system_incident_email_v1(uuid) from public,anon,authenticated;
revoke all on function public.raise_system_incident_v1(text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.resolve_system_incident_by_dedupe_v1(text,text) from public,anon,authenticated;
revoke all on function public.sync_system_cron_runs_v1() from public,anon,authenticated;
revoke all on function public.run_system_health_watchdog_v1() from public,anon,authenticated;
revoke all on function public.claim_system_alert_email_outbox_v1(integer) from public,anon,authenticated;
revoke all on function public.system_health_validate_alert_secret_v1(text) from public,anon,authenticated;

grant execute on function public.get_admin_system_incident_unread_count_v1() to authenticated;
grant execute on function public.get_admin_system_health_overview_v1() to authenticated;
grant execute on function public.get_admin_system_incidents_v1(text,integer) to authenticated;
grant execute on function public.get_admin_system_runs_v1(text,integer) to authenticated;
grant execute on function public.mark_admin_system_incident_read_v1(uuid) to authenticated;
grant execute on function public.admin_update_system_incident_v1(uuid,text,text) to authenticated;
grant execute on function public.claim_system_alert_email_outbox_v1(integer) to service_role;
grant execute on function public.system_health_validate_alert_secret_v1(text) to service_role;

do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='system_health_alert_worker_secret_v1') then
   perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'system_health_alert_worker_secret_v1','ProPeloton Manager System Health email worker secret');
 end if;
end $$;

do $$
declare id bigint;
begin
 select jobid into id from cron.job where jobname='ppm-system-health-watchdog-v1' limit 1;
 if id is not null then perform cron.unschedule(id); end if;
 perform cron.schedule('ppm-system-health-watchdog-v1','*/5 * * * *','select public.run_system_health_watchdog_v1();');
end $$;

do $$
declare id bigint;
begin
 select jobid into id from cron.job where jobname='ppm-system-health-alert-email-dispatch-v1' limit 1;
 if id is not null then perform cron.unschedule(id); end if;
 perform cron.schedule(
   'ppm-system-health-alert-email-dispatch-v1','*/2 * * * *',
   $cron$select net.http_post(
     url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/send-system-health-alerts',
     headers := jsonb_build_object(
       'Content-Type','application/json',
       'x-system-health-secret',(select decrypted_secret from vault.decrypted_secrets where name='system_health_alert_worker_secret_v1' limit 1)
     ),
     body := '{"action":"send_pending"}'::jsonb,
     timeout_milliseconds := 30000
   );$cron$
 );
end $$;

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='system_incidents') then
   alter publication supabase_realtime add table public.system_incidents;
 end if;
end $$;

select public.run_system_health_watchdog_v1();
commit;
