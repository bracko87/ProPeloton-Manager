-- ProPeloton: keep mobile Game Control Center telemetry accurate
-- during a verified prelaunch hold without hiding genuine active incidents.
-- Live functions applied 19 Nov 2026.
-- NOTE: The five read-only reporting jobs were resumed separately.
-- This migration intentionally does not activate cron or game engine jobs.

CREATE OR REPLACE FUNCTION private.ppm_control_center_verified_launch_hold_v1()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(
   select 1 from private.ppm_december_2026_release_control_v1 ctl
     join public.game_world_reset_runs r on r.id=ctl.reset_run_id
     join public.game_clock_config c on c.id=true
     join public.game_state g on g.id=true
     join cron.job j on j.jobname='ppm-december-2026-release-v1'
   where ctl.id=true and ctl.status='scheduled' and ctl.launched_at is null
     and now()<ctl.release_at and j.active
     and r.status='completed' and coalesce((r.validation_report->>'ok')::boolean,false)
     and (select count(*) from private.game_world_reset_cron_snapshot_v1 s
          where s.reset_run_id=ctl.reset_run_id and s.originally_active)=64
     and c.is_paused and g.is_paused
     and g.season_number=1 and g.month_number=1 and g.day_number=1
     and g.hour_number=1 and g.minute_number=0
 )
$function$;


revoke all on function private.ppm_control_center_verified_launch_hold_v1() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION control_center_private.send_hourly_telemetry()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'storage', 'vault', 'control_center_private'
AS $function$
declare
  v_endpoint text;
  v_token text;
  v_db_size numeric;
  v_storage_size numeric;
  v_active_users numeric;
  v_connections numeric;
  v_max_connections numeric;
  v_cache_hit numeric;
  v_index_cache_hit numeric;
  v_open_incidents integer;
  v_critical_incidents integer;
  v_failed_monitors integer;
  v_project_status text;
  v_payload jsonb;
  v_request_id bigint;
begin
  select decrypted_secret into v_endpoint
  from vault.decrypted_secrets where name = 'game_control_center_telemetry_endpoint';

  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'game_control_center_telemetry_token';

  if v_endpoint is null or v_token is null then
    raise exception 'Game Control Center telemetry secrets are missing';
  end if;

  select pg_database_size(current_database())::numeric into v_db_size;

  select coalesce(sum(
    case when (metadata->>'size') ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end
  ),0)
  into v_storage_size
  from storage.objects;

  select count(*)::numeric into v_active_users
  from auth.users
  where last_sign_in_at >= now() - interval '30 days';

  select count(*)::numeric into v_connections
  from pg_stat_activity
  where datname = current_database();

  select current_setting('max_connections')::numeric into v_max_connections;

  select case when (blks_hit + blks_read) > 0
         then round((100.0 * blks_hit / (blks_hit + blks_read))::numeric,2)
         else 100 end
  into v_cache_hit
  from pg_stat_database
  where datname = current_database();

  select case when sum(idx_blks_hit + idx_blks_read) > 0
         then round((100.0 * sum(idx_blks_hit) / sum(idx_blks_hit + idx_blks_read))::numeric,2)
         else 100 end
  into v_index_cache_hit
  from pg_statio_user_indexes;

  select count(*)::int,
         count(*) filter (where severity = 'critical')::int
    into v_open_incidents, v_critical_incidents
  from public.system_incidents
  where status in ('open','investigating','acknowledged');

  select count(*)::int into v_failed_monitors
  from (
    select distinct on (process_key) process_key, status, started_at
    from public.system_monitor_runs
    order by process_key, coalesce(finished_at, started_at, created_at) desc
  ) x
  where lower(coalesce(status,'')) not in ('ok','healthy','success','succeeded','completed')
      and not (private.ppm_control_center_verified_launch_hold_v1()
        and process_key='cron:run-daily-tick-every-minute'
        and status='running'
        and started_at<= (select r.completed_at
           from private.ppm_december_2026_release_control_v1 ctl
           join public.game_world_reset_runs r on r.id=ctl.reset_run_id
           where ctl.id=true));

  v_project_status := case
    when v_critical_incidents > 0 then 'critical'
    when v_open_incidents > 0 or v_failed_monitors > 0 then 'warning'
    else 'healthy'
  end;

  v_payload := jsonb_build_object(
    'sourceProjectRef', 'okuravitxocyevkexfgi',
    'projectStatus', v_project_status,
    'metrics', jsonb_build_array(
      jsonb_build_object('key','database_size','label','Database size','used',v_db_size,'total',public.control_center_disk_capacity_bytes_v1(),'unit','bytes','status',
        case when v_db_size >= 0.8 * public.control_center_disk_capacity_bytes_v1() then 'critical' when v_db_size >= 0.6 * public.control_center_disk_capacity_bytes_v1() then 'warning' else 'healthy' end),
      jsonb_build_object('key','storage_usage','label','Object storage','used',v_storage_size,'total',107374182400,'unit','bytes','status',
        case when v_storage_size >= 0.8 * 107374182400 then 'critical' when v_storage_size >= 0.6 * 107374182400 then 'warning' else 'healthy' end),
      jsonb_build_object('key','monthly_active_users','label','Monthly active users','used',v_active_users,'total',100000,'unit','users','status',
        case when v_active_users >= 80000 then 'critical' when v_active_users >= 60000 then 'warning' else 'healthy' end),
      jsonb_build_object('key','database_connections','label','DB connections','used',v_connections,'total',v_max_connections,'unit','connections','status',
        case when v_max_connections > 0 and v_connections / v_max_connections >= 0.85 then 'critical'
             when v_max_connections > 0 and v_connections / v_max_connections >= 0.65 then 'warning'
             else 'healthy' end),
      jsonb_build_object('key','database_cache_hit','label','DB cache hit','used',v_cache_hit,'total',100,'unit','%','status',
        case when v_cache_hit < 90 then 'critical' when v_cache_hit < 95 then 'warning' else 'healthy' end),
      jsonb_build_object('key','index_cache_hit','label','Index cache hit','used',v_index_cache_hit,'total',100,'unit','%','status',
        case when v_index_cache_hit < 90 then 'critical' when v_index_cache_hit < 95 then 'warning' else 'healthy' end)
    ),
    'healthChecks', jsonb_build_array(
      jsonb_build_object('area','System Health','key','database_connectivity','label','Database connectivity','status','healthy','text','Online','message','Postgres responded to hourly telemetry collector'),
      jsonb_build_object('area','System Health','key','system_monitoring','label','System monitoring','status',
        case when v_failed_monitors > 0 then 'warning' else 'healthy' end,
        'value',v_failed_monitors,'unit','failing','message',v_failed_monitors || ' latest monitor runs are non-success'),
      jsonb_build_object('area','Race Operations','key','hourly_processor','label','Hourly game processor','status',
        case when exists(select 1 from public.hourly_game_processor_runs where success = false and created_at >= now()-interval '6 hours') then 'warning' else 'healthy' end,
        'message','Recent hourly processor history checked'),
      jsonb_build_object('area','System Health','key','incident_count','label','Open system incidents','status',
        case when v_critical_incidents > 0 then 'critical' when v_open_incidents > 0 then 'warning' else 'healthy' end,
        'value',v_open_incidents,'unit','incidents')
    ),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'incidentKey','system:' || coalesce(dedupe_key,id::text),
        'area','System Health',
        'severity',case when severity in ('info','warning','critical') then severity else 'warning' end,
        'status',case when status='resolved' then 'resolved' else 'open' end,
        'title',title,
        'description',message
      ))
      from public.system_incidents
      where status in ('open','investigating','acknowledged')
    ), '[]'::jsonb) || coalesce((
      select jsonb_agg(jsonb_build_object(
        'incidentKey','race:' || id::text,
        'area','Race Operations',
        'severity',case when severity in ('info','warning','critical') then severity else 'warning' end,
        'status',case when resolved_at is null then 'open' else 'resolved' end,
        'title',coalesce(race_name,'Race') || ' · ' || issue_key,
        'description',message
      ))
      from public.race_operations_incidents_v1
      where resolved_at is null
    ), '[]'::jsonb)
  );

  select net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_token
    ),
    body := v_payload,
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$function$;


CREATE OR REPLACE FUNCTION control_center_private.build_admin_module_snapshot(p_module_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_module_key='world-nations-hosts' then
    return control_center_private.build_world_nations_hosts_snapshot_v1();
  end if;

  if p_module_key='system-health' then
    return control_center_private.build_admin_module_snapshot_legacy_v48(p_module_key)
      || jsonb_build_object(
        'national_championship_lifecycle',
        public.national_championship_lifecycle_overview_v1(),
        'release_hold',jsonb_build_object(
           'active',private.ppm_control_center_verified_launch_hold_v1(),
           'mode','scheduled_prelaunch_hold',
           'release_at',(select release_at from private.ppm_december_2026_release_control_v1 where id=true)
        )
      );
  end if;

  return control_center_private.build_admin_module_snapshot_legacy_v48(p_module_key);
end;
$function$;


revoke all on function control_center_private.build_admin_module_snapshot(text) from public,anon,authenticated;
