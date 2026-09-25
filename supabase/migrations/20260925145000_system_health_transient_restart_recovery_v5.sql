begin;

-- Keep cron run history accurate without rewriting the full history every
-- watchdog cycle. A run first seen as "running" is updated to its final state.
-- A one-off pg_cron "server restarted" result is treated as an infrastructure
-- interruption with a short recovery grace period, not an immediate app fault.
create or replace function public.sync_system_cron_runs_v1()
returns integer
language plpgsql
security definer
set search_path=public,cron,pg_temp
as $function$
declare
  proc record;
  v_latest record;
  v_previous record;
  v_dedupe_key text;
  v_restart_grace_minutes integer;
  v_is_restart_failure boolean;
  v_inserted integer:=0;
  v_updated integer:=0;
begin
  with src as (
    select
      smp.process_key,
      d.runid,
      d.status as cron_status,
      d.return_message,
      d.start_time,
      d.end_time,
      (
        d.status not in ('succeeded','running')
        and lower(trim(coalesce(d.return_message,'')))='server restarted'
      ) as is_restart_failure
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    join public.system_monitor_processes smp
      on smp.source_kind='cron'
     and smp.is_enabled
     and smp.source_ref=j.jobname
    where d.start_time is not null
      and d.start_time>=now()-interval '6 hours'
  )
  insert into public.system_monitor_runs(
    process_key,source_run_id,status,started_at,finished_at,duration_ms,
    summary,error_message,details
  )
  select
    s.process_key,
    s.runid,
    case
      when s.cron_status='succeeded' then 'success'
      when s.cron_status='running' then 'running'
      when s.is_restart_failure then 'warning'
      else 'error'
    end,
    s.start_time,
    s.end_time,
    case
      when s.end_time is not null
        then greatest(0,(extract(epoch from(s.end_time-s.start_time))*1000)::bigint)
      else null
    end,
    case
      when s.cron_status='succeeded' then coalesce(nullif(s.return_message,''),'Completed')
      when s.cron_status='running' then 'Scheduled process is running.'
      when s.is_restart_failure then 'Transient database restart interrupted this run; awaiting automatic retry.'
      else 'Scheduled process failed.'
    end,
    case
      when s.cron_status in ('succeeded','running') then null
      when s.is_restart_failure then 'Database restart interrupted this run.'
      else coalesce(s.return_message,'Unknown pg_cron failure')
    end,
    jsonb_build_object(
      'cron_status',s.cron_status,
      'return_message',s.return_message,
      'transient_database_restart',s.is_restart_failure
    )
  from src s
  on conflict(process_key,source_run_id)
    where source_run_id is not null
  do nothing;

  get diagnostics v_inserted=row_count;

  with src as (
    select
      smp.process_key,
      d.runid,
      d.status as cron_status,
      d.return_message,
      d.start_time,
      d.end_time,
      (
        d.status not in ('succeeded','running')
        and lower(trim(coalesce(d.return_message,'')))='server restarted'
      ) as is_restart_failure
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    join public.system_monitor_processes smp
      on smp.source_kind='cron'
     and smp.is_enabled
     and smp.source_ref=j.jobname
    where d.start_time is not null
      and d.start_time>=now()-interval '6 hours'
  ),
  normalized as (
    select
      s.*,
      case
        when s.cron_status='succeeded' then 'success'
        when s.cron_status='running' then 'running'
        when s.is_restart_failure then 'warning'
        else 'error'
      end as normalized_status,
      case
        when s.cron_status='succeeded' then coalesce(nullif(s.return_message,''),'Completed')
        when s.cron_status='running' then 'Scheduled process is running.'
        when s.is_restart_failure then 'Transient database restart interrupted this run; awaiting automatic retry.'
        else 'Scheduled process failed.'
      end as normalized_summary,
      case
        when s.cron_status in ('succeeded','running') then null
        when s.is_restart_failure then 'Database restart interrupted this run.'
        else coalesce(s.return_message,'Unknown pg_cron failure')
      end as normalized_error,
      case
        when s.end_time is not null
          then greatest(0,(extract(epoch from(s.end_time-s.start_time))*1000)::bigint)
        else null
      end as normalized_duration,
      jsonb_build_object(
        'cron_status',s.cron_status,
        'return_message',s.return_message,
        'transient_database_restart',s.is_restart_failure
      ) as normalized_details
    from src s
  )
  update public.system_monitor_runs r
  set
    status=n.normalized_status,
    started_at=n.start_time,
    finished_at=n.end_time,
    duration_ms=n.normalized_duration,
    summary=n.normalized_summary,
    error_message=n.normalized_error,
    details=n.normalized_details
  from normalized n
  where r.process_key=n.process_key
    and r.source_run_id=n.runid
    and (
      r.status is distinct from n.normalized_status
      or r.finished_at is distinct from n.end_time
      or r.duration_ms is distinct from n.normalized_duration
      or r.summary is distinct from n.normalized_summary
      or r.error_message is distinct from n.normalized_error
      or r.details is distinct from n.normalized_details
    );

  get diagnostics v_updated=row_count;

  for proc in
    select *
    from public.system_monitor_processes
    where is_enabled
      and source_kind='cron'
  loop
    v_latest:=null;
    v_previous:=null;
    v_dedupe_key:='cron-failure:'||proc.source_ref;

    select d.runid,d.status,d.return_message,d.start_time,d.end_time
    into v_latest
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where j.jobname=proc.source_ref
      and d.start_time is not null
    order by d.start_time desc nulls last
    limit 1;

    if v_latest is null or v_latest.runid is null then
      continue;
    end if;

    if v_latest.status not in ('succeeded','running') then
      v_is_restart_failure :=
        lower(trim(coalesce(v_latest.return_message,'')))='server restarted';

      if v_is_restart_failure then
        select d.runid,d.status,d.return_message,d.start_time,d.end_time
        into v_previous
        from cron.job_run_details d
        join cron.job j on j.jobid=d.jobid
        where j.jobname=proc.source_ref
          and d.start_time is not null
          and d.start_time < v_latest.start_time
        order by d.start_time desc nulls last
        limit 1;

        v_restart_grace_minutes := greatest(
          10,
          least(coalesce(proc.expected_interval_minutes,5) + 5, 30)
        );

        if coalesce(v_previous.status,'')='succeeded'
           and now() < v_latest.start_time + make_interval(mins=>v_restart_grace_minutes)
        then
          continue;
        end if;
      end if;

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
        proc.process_key,
        proc.incident_severity,
        case
          when v_is_restart_failure then 'Scheduled process interrupted by database restart'
          else 'Scheduled process failed'
        end,
        case
          when v_is_restart_failure then format(
            '%s was interrupted at %s because the database restarted. Automatic retry did not recover within the expected grace period.',
            proc.source_ref,
            v_latest.start_time
          )
          else format(
            '%s failed at %s. %s',
            proc.source_ref,
            v_latest.start_time,
            coalesce(v_latest.return_message,'No return message.')
          )
        end,
        v_dedupe_key,
        jsonb_build_object(
          'job_name',proc.source_ref,
          'run_id',v_latest.runid,
          'return_message',v_latest.return_message,
          'started_at',v_latest.start_time,
          'transient_database_restart',v_is_restart_failure
        )
      );
    else
      perform public.resolve_system_incident_by_dedupe_v1(
        v_dedupe_key,
        'The latest scheduled run completed successfully.'
      );
    end if;
  end loop;

  return v_inserted+v_updated;
end;
$function$;

-- Prevent overlapping watchdog executions from deadlocking on incident/run rows.
create or replace function public.run_system_health_watchdog_guarded_v2()
returns jsonb
language plpgsql
security definer
set search_path=public,cron,pg_temp
as $function$
declare
  v_lock_key bigint := hashtextextended('run_system_health_watchdog_guarded_v2',0);
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'status','skipped_watchdog_already_running',
      'success',true
    );
  end if;

  return public.run_system_health_watchdog_v1();
end;
$function$;

-- Race-result notification processing is already retry-safe and internally
-- deduplicated, and its own return payload targets a 5-minute schedule.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='race-results-summary-notifications-v2'),
  schedule := '*/5 * * * *'
);

update public.system_monitor_processes
set expected_interval_minutes=5,
    stale_after_minutes=15,
    updated_at=now()
where process_key='cron:race-results-summary-notifications-v2';

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname='ppm-system-health-watchdog-v1'),
  command := 'select public.run_system_health_watchdog_guarded_v2();'
);

-- Historical restart interruptions remain visible in logs, but as warnings
-- rather than application errors.
update public.system_monitor_runs
set status='warning',
    summary='Transient database restart interrupted this run; scheduler recovered.',
    error_message='Database restart interrupted this run.',
    details=coalesce(details,'{}'::jsonb) || jsonb_build_object('transient_database_restart',true)
where lower(trim(coalesce(error_message,'')))='server restarted';

revoke all on function public.sync_system_cron_runs_v1() from public,anon,authenticated;
revoke all on function public.run_system_health_watchdog_guarded_v2() from public,anon,authenticated;
grant execute on function public.sync_system_cron_runs_v1() to service_role;
grant execute on function public.run_system_health_watchdog_guarded_v2() to service_role;

commit;
