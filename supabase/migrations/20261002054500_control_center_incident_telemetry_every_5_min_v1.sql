create or replace function control_center_private.send_incident_telemetry()
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog','public','auth','storage','vault','control_center_private'
as $function$
declare
  v_endpoint text;
  v_token text;
  v_open_incidents integer:=0;
  v_critical_incidents integer:=0;
  v_project_status text;
  v_payload jsonb;
  v_request_id bigint;
begin
  select decrypted_secret into v_endpoint
  from vault.decrypted_secrets
  where name='game_control_center_telemetry_endpoint';

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='game_control_center_telemetry_token';

  if v_endpoint is null or v_token is null then
    raise exception 'Game Control Center telemetry secrets are missing';
  end if;

  select count(*)::int,
         count(*) filter (where severity='critical')::int
    into v_open_incidents,v_critical_incidents
  from public.system_incidents
  where status in ('open','investigating','acknowledged');

  v_project_status:=case
    when v_critical_incidents>0 then 'critical'
    when v_open_incidents>0 then 'warning'
    else 'healthy'
  end;

  v_payload:=jsonb_build_object(
    'sourceProjectRef','okuravitxocyevkexfgi',
    'projectStatus',v_project_status,
    'incidents',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'incidentKey','system:'||coalesce(dedupe_key,id::text),
          'area','System Health',
          'severity',case when severity in ('info','warning','critical') then severity else 'warning' end,
          'status',case when status='resolved' then 'resolved' else 'open' end,
          'title',title,
          'description',message
        ))
        from public.system_incidents
        where status in ('open','investigating','acknowledged')
           or (status='resolved' and resolved_at>=now()-interval '20 minutes')
      ),'[]'::jsonb)
      ||
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'incidentKey','race:'||id::text,
          'area','Race Operations',
          'severity',case when severity in ('info','warning','critical') then severity else 'warning' end,
          'status',case when resolved_at is null then 'open' else 'resolved' end,
          'title',coalesce(race_name,'Race')||' · '||issue_key,
          'description',message
        ))
        from public.race_operations_incidents_v1
        where resolved_at is null
           or resolved_at>=now()-interval '20 minutes'
      ),'[]'::jsonb)
  );

  select net.http_post(
    url:=v_endpoint,
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||v_token
    ),
    body:=v_payload,
    timeout_milliseconds:=30000
  ) into v_request_id;

  return v_request_id;
end;
$function$;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='control-center-incident-telemetry-every-5-min'
  limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'control-center-incident-telemetry-every-5-min',
    '*/5 * * * *',
    'select control_center_private.send_incident_telemetry();'
  );
end $$;
