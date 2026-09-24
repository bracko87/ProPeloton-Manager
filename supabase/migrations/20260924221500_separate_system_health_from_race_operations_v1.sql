begin;

-- Keep System Health and Race Operations as two separate administrative domains.
-- Race Operations owns stage calculation, replay readiness, result publication
-- and their watchdog/recovery processes. System Health owns all other services.
with excluded(process_key) as (
  values
    ('cron:universal-race-stage-runner-supabase-v1'),
    ('cron:universal-race-stage-pass1-resume-v1'),
    ('cron:universal-race-stage-pass2-resume-v2'),
    ('cron:universal-race-calculation-survival-v1'),
    ('cron:universal-race-calculation-guard-v1'),
    ('cron:universal-race-release-supervisor-v1'),
    ('cron:universal-race-publication-retry-v1'),
    ('cron:race-engine-due-stage-watchdog-v1'),
    ('cron:race-operations-monitor-v1'),
    ('check:race_operations')
)
update public.system_monitor_processes p
set is_enabled=false,
    updated_at=now()
from excluded e
where p.process_key=e.process_key;

with excluded(process_key) as (
  values
    ('cron:universal-race-stage-runner-supabase-v1'),
    ('cron:universal-race-stage-pass1-resume-v1'),
    ('cron:universal-race-stage-pass2-resume-v2'),
    ('cron:universal-race-calculation-survival-v1'),
    ('cron:universal-race-calculation-guard-v1'),
    ('cron:universal-race-release-supervisor-v1'),
    ('cron:universal-race-publication-retry-v1'),
    ('cron:race-engine-due-stage-watchdog-v1'),
    ('cron:race-operations-monitor-v1'),
    ('check:race_operations')
),
resolved as (
  update public.system_incidents i
  set status='resolved',
      resolved_at=coalesce(i.resolved_at,now()),
      resolution_note='Moved to the dedicated Race Operations monitor.',
      updated_at=now()
  from excluded e
  where i.process_key=e.process_key
    and i.status in ('open','acknowledged')
  returning i.id
)
update public.system_alert_email_outbox o
set status='cancelled',
    last_error='Incident moved to dedicated Race Operations monitoring.',
    updated_at=now()
where o.incident_id in (select id from resolved)
  and o.status in ('pending','failed','sending');

-- Remove the duplicate Race Operations business check from System Health.
do $patch$
declare
  d text;
begin
  select pg_get_functiondef('public.run_system_health_watchdog_v1()'::regprocedure)
  into d;

  if position('check:race_operations' in d)>0 then
    d:=regexp_replace(
      d,
      '  select count\(\*\) into n from public\.race_operations_stage_status_v1 where has_problem;.*?  else perform public\.resolve_system_incident_by_dedupe_v1\(''business:race-operations'',''Race operations are healthy\.'''
      ||'\); end if;[[:space:]]+',
      '',
      'ns'
    );
  end if;

  if position('check:race_operations' in d)>0 then
    raise exception 'Could not remove duplicate Race Operations check from System Health watchdog';
  end if;

  execute d;
end
$patch$;

-- Historical System Health views also hide processes moved to Race Operations.
create or replace function public.get_admin_system_incidents_v1(
  p_status text default 'active',
  p_limit integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  result jsonb;
  s text:=lower(coalesce(p_status,'active'));
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',x.id,'process_key',x.process_key,'process_label',x.label,
        'category',x.category,'severity',x.severity,'status',x.status,
        'title',x.title,'message',x.message,'details',x.details,
        'first_seen_at',x.first_seen_at,'last_seen_at',x.last_seen_at,
        'occurrence_count',x.occurrence_count,'last_emailed_at',x.last_emailed_at,
        'acknowledged_at',x.acknowledged_at,'resolved_at',x.resolved_at,
        'resolution_note',x.resolution_note,
        'is_unread',not exists(
          select 1
          from public.system_incident_admin_reads rr
          where rr.incident_id=x.id and rr.admin_user_id=auth.uid()
        )
      )
      order by x.last_seen_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select i.*,p.label,p.category
    from public.system_incidents i
    join public.system_monitor_processes p on p.process_key=i.process_key
    where p.is_enabled
      and (
        s='all'
        or (s='active' and i.status in ('open','acknowledged'))
        or (s='resolved' and i.status='resolved')
      )
    order by i.last_seen_at desc
    limit greatest(1,least(coalesce(p_limit,300),1000))
  ) x;

  return result;
end;
$function$;

create or replace function public.get_admin_system_runs_v1(
  p_process_key text default null,
  p_limit integer default 400
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',x.id,'process_key',x.process_key,'process_label',x.label,
        'category',x.category,'status',x.status,'started_at',x.started_at,
        'finished_at',x.finished_at,'duration_ms',x.duration_ms,
        'summary',x.summary,'error_message',x.error_message,'details',x.details
      )
      order by x.started_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select r.*,p.label,p.category
    from public.system_monitor_runs r
    join public.system_monitor_processes p on p.process_key=r.process_key
    where p.is_enabled
      and (p_process_key is null or r.process_key=p_process_key)
    order by r.started_at desc
    limit greatest(1,least(coalesce(p_limit,400),1000))
  ) x;

  return result;
end;
$function$;

commit;
