
begin;

alter table public.system_alert_email_outbox
  drop constraint if exists system_alert_email_outbox_status_check;
alter table public.system_alert_email_outbox
  add constraint system_alert_email_outbox_status_check
  check(status in ('pending','sending','sent','failed','cancelled'));

update public.system_alert_email_outbox o
set status='cancelled',
    last_error='Incident resolved before email dispatch.',
    updated_at=now()
from public.system_incidents i
where i.id=o.incident_id
  and i.status='resolved'
  and o.status in ('pending','failed');

create or replace function public.sync_system_cron_runs_v1()
returns integer
language plpgsql
security definer
set search_path=public,cron,pg_temp
as $$
declare
  r record;
  p record;
  v_key text;
  v_count integer:=0;
  v_latest record;
begin
  for r in
    select j.jobname,d.runid,d.status,d.return_message,d.start_time,d.end_time
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where d.start_time>=now()-interval '48 hours'
    order by d.start_time
  loop
    v_key:='cron:'||r.jobname;

    if not exists(
      select 1 from public.system_monitor_processes
      where process_key=v_key and is_enabled
    ) then
      continue;
    end if;

    insert into public.system_monitor_runs(
      process_key,source_run_id,status,started_at,finished_at,duration_ms,
      summary,error_message,details
    )
    values(
      v_key,
      r.runid,
      case
        when r.status='succeeded' then 'success'
        when r.status='running' then 'running'
        else 'error'
      end,
      r.start_time,
      r.end_time,
      case when r.end_time is not null
        then greatest(0,(extract(epoch from(r.end_time-r.start_time))*1000)::bigint)
        else null
      end,
      case
        when r.status='succeeded' then coalesce(nullif(r.return_message,''),'Completed')
        when r.status='running' then 'Scheduled process is running.'
        else 'Scheduled process failed.'
      end,
      case when r.status in ('succeeded','running') then null
        else coalesce(r.return_message,'Unknown pg_cron failure')
      end,
      jsonb_build_object('cron_status',r.status,'return_message',r.return_message)
    )
    on conflict(process_key,source_run_id) where source_run_id is not null do nothing;

    if found then v_count:=v_count+1; end if;
  end loop;

  -- Only the latest scheduler state may raise an incident. Historical failures
  -- remain visible in Process Logs but never create an email after a later success.
  for p in
    select *
    from public.system_monitor_processes
    where is_enabled and source_kind='cron'
  loop
    select d.runid,d.status,d.return_message,d.start_time,d.end_time
    into v_latest
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where j.jobname=p.source_ref
    order by d.start_time desc
    limit 1;

    if v_latest.runid is null then
      continue;
    end if;

    if v_latest.status not in ('succeeded','running') then
      perform public.raise_system_incident_v1(
        p.process_key,
        p.incident_severity,
        'Scheduled process failed',
        format(
          '%s failed at %s. %s',
          p.source_ref,
          v_latest.start_time,
          coalesce(v_latest.return_message,'No return message.')
        ),
        'cron-failure:'||p.source_ref,
        jsonb_build_object(
          'job_name',p.source_ref,
          'run_id',v_latest.runid,
          'return_message',v_latest.return_message,
          'started_at',v_latest.start_time
        )
      );
    else
      perform public.resolve_system_incident_by_dedupe_v1(
        'cron-failure:'||p.source_ref,
        'The latest scheduled run completed successfully.'
      );
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.resolve_system_incident_by_dedupe_v1(
  p_dedupe_key text,
  p_note text default 'Recovered automatically.'
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  select coalesce(array_agg(id),'{}'::uuid[])
  into v_ids
  from public.system_incidents
  where dedupe_key=p_dedupe_key
    and status in ('open','acknowledged');

  update public.system_incidents
  set status='resolved',
      resolved_at=coalesce(resolved_at,now()),
      resolution_note=coalesce(nullif(p_note,''),'Recovered automatically.'),
      updated_at=now()
  where id=any(v_ids);

  get diagnostics v_count=row_count;

  update public.system_alert_email_outbox
  set status='cancelled',
      last_error='Incident resolved before email dispatch.',
      updated_at=now()
  where incident_id=any(v_ids)
    and status in ('pending','failed');

  return v_count;
end;
$$;

create or replace function public.claim_system_alert_email_outbox_v1(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare result jsonb;
begin
  with candidates as (
    select o.id
    from public.system_alert_email_outbox o
    join public.system_incidents i on i.id=o.incident_id
    where o.status in ('pending','failed')
      and o.next_attempt_at<=now()
      and o.attempts<10
      and i.status in ('open','acknowledged')
    order by o.created_at
    for update of o skip locked
    limit greatest(1,least(coalesce(p_limit,20),50))
  ), claimed as (
    update public.system_alert_email_outbox o
    set status='sending',
        attempts=o.attempts+1,
        last_attempt_at=now(),
        last_error=null,
        updated_at=now()
    from candidates c
    where o.id=c.id
    returning o.id,o.incident_id,o.recipient_email,o.subject,o.text_body,o.html_body,o.attempts
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb)
  into result
  from claimed;

  return result;
end;
$$;

select public.run_system_health_watchdog_v1();

commit;
