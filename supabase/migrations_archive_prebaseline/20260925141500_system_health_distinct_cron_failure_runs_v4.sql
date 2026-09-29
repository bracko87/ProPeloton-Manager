begin;

-- A System Health watchdog poll must not be counted as another occurrence of
-- the same pg_cron failure. It also must not reopen a failed source run that
-- has already been verified/recovered and resolved by an administrator.
create or replace function public.sync_system_cron_runs_v1()
returns integer
language plpgsql
security definer
set search_path=public,cron,pg_temp
as $function$
declare
  r record;
  p record;
  v_key text;
  v_count integer:=0;
  v_latest record;
  v_dedupe_key text;
begin
  for r in
    select j.jobname,d.runid,d.status,d.return_message,d.start_time,d.end_time
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where d.start_time is not null
      and d.start_time>=now()-interval '48 hours'
    order by d.start_time
  loop
    v_key:='cron:'||r.jobname;

    if not exists(
      select 1
      from public.system_monitor_processes
      where process_key=v_key
        and is_enabled
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
      case
        when r.end_time is not null
          then greatest(0,(extract(epoch from(r.end_time-r.start_time))*1000)::bigint)
        else null
      end,
      case
        when r.status='succeeded'
          then coalesce(nullif(r.return_message,''),'Completed')
        when r.status='running'
          then 'Scheduled process is running.'
        else 'Scheduled process failed.'
      end,
      case
        when r.status in ('succeeded','running') then null
        else coalesce(r.return_message,'Unknown pg_cron failure')
      end,
      jsonb_build_object(
        'cron_status',r.status,
        'return_message',r.return_message
      )
    )
    on conflict(process_key,source_run_id)
      where source_run_id is not null
    do nothing;

    if found then
      v_count:=v_count+1;
    end if;
  end loop;

  for p in
    select *
    from public.system_monitor_processes
    where is_enabled
      and source_kind='cron'
  loop
    v_latest:=null;
    v_dedupe_key:='cron-failure:'||p.source_ref;

    select d.runid,d.status,d.return_message,d.start_time,d.end_time
    into v_latest
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where j.jobname=p.source_ref
      and d.start_time is not null
    order by d.start_time desc nulls last
    limit 1;

    if v_latest is null or v_latest.runid is null then
      continue;
    end if;

    if v_latest.status not in ('succeeded','running') then
      -- Same source run is not a new occurrence. Resolved source runs stay
      -- resolved until pg_cron produces a different failed run id.
      if exists(
        select 1
        from public.system_incidents i
        where i.dedupe_key=v_dedupe_key
          and (i.details->>'run_id')=v_latest.runid::text
          and i.status in ('open','acknowledged','resolved')
      ) then
        continue;
      end if;

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
        v_dedupe_key,
        jsonb_build_object(
          'job_name',p.source_ref,
          'run_id',v_latest.runid,
          'return_message',v_latest.return_message,
          'started_at',v_latest.start_time
        )
      );
    else
      perform public.resolve_system_incident_by_dedupe_v1(
        v_dedupe_key,
        'The latest scheduled run completed successfully.'
      );
    end if;
  end loop;

  return v_count;
end;
$function$;

commit;
