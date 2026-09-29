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
    select distinct on (process_key) process_key, status
    from public.system_monitor_runs
    order by process_key, coalesce(finished_at, started_at, created_at) desc
  ) x
  where lower(coalesce(status,'')) not in ('ok','healthy','success','succeeded','completed');

  v_project_status := case
    when v_critical_incidents > 0 then 'critical'
    when v_open_incidents > 0 or v_failed_monitors > 0 then 'warning'
    else 'healthy'
  end;

  v_payload := jsonb_build_object(
    'sourceProjectRef', 'okuravitxocyevkexfgi',
    'projectStatus', v_project_status,
    'metrics', jsonb_build_array(
      jsonb_build_object('key','database_size','label','Database size','used',v_db_size,'total',8589934592,'unit','bytes','status',
        case when v_db_size >= 0.8 * 8589934592 then 'critical' when v_db_size >= 0.6 * 8589934592 then 'warning' else 'healthy' end),
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
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.admin_module_status(p_module_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  v_count integer := 0;
begin
  if p_module_key = 'system-health' then
    select count(*) into v_count
    from public.system_incidents
    where status in ('open','acknowledged') and severity = 'critical';
    if v_count > 0 then return 'critical'; end if;

    select count(*) into v_count
    from public.system_incidents
    where status in ('open','acknowledged');
    return case when v_count > 0 then 'warning' else 'healthy' end;

  elsif p_module_key = 'race-operations' then
    select count(*) into v_count
    from public.race_operations_incidents_v1
    where resolved_at is null and severity = 'critical';
    if v_count > 0 then return 'critical'; end if;

    select count(*) into v_count
    from public.race_operations_incidents_v1
    where resolved_at is null;
    return case when v_count > 0 then 'warning' else 'healthy' end;

  elsif p_module_key = 'migration-process' then
    select count(*) into v_count
    from public.season_transition_engine_runs_v2
    where status = 'failed'
      and created_at >= now() - interval '30 days';
    if v_count > 0 then return 'warning'; end if;

    select count(*) into v_count
    from public.season_transition_component_readiness_v1
    where required and status <> 'ready';
    return case when v_count > 0 then 'warning' else 'healthy' end;
  end if;

  return 'healthy';
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.build_admin_module_snapshot(p_module_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  v_payload jsonb := '{}'::jsonb;
begin
  case p_module_key
    when 'analytics' then
      v_payload := jsonb_build_object(
        'generated_at', now(),
        'daily_visitors', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select * from public.site_analytics_daily_visitors
            order by analytics_date desc limit 45
          ) x
        ), '[]'::jsonb),
        'daily_sessions', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select * from public.site_analytics_daily_sessions
            order by analytics_date desc limit 45
          ) x
        ), '[]'::jsonb),
        'daily_pages', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select * from public.site_analytics_daily_pages
            order by analytics_date desc limit 60
          ) x
        ), '[]'::jsonb)
      );

    when 'system-health' then
      v_payload := jsonb_build_object(
        'generated_at', now(),
        'summary', jsonb_build_object(
          'monitored_processes', (select count(*) from public.system_monitor_processes where is_enabled),
          'active_incidents', (select count(*) from public.system_incidents where status in ('open','acknowledged')),
          'critical_incidents', (select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='critical')
        ),
        'processes', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select
              p.process_key,p.label,p.category,p.description,p.user_sensitive,
              p.expected_interval_minutes,p.stale_after_minutes,p.is_enabled,
              lr.status as latest_status,lr.started_at as latest_started_at,
              lr.finished_at as latest_finished_at,lr.duration_ms as latest_duration_ms,
              lr.summary as latest_summary,lr.error_message as latest_error_message
            from public.system_monitor_processes p
            left join lateral (
              select r.status,r.started_at,r.finished_at,r.duration_ms,r.summary,r.error_message
              from public.system_monitor_runs r
              where r.process_key=p.process_key
              order by r.started_at desc limit 1
            ) lr on true
            where p.is_enabled
            order by p.sort_order,p.label
          ) x
        ), '[]'::jsonb),
        'recent_runs', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select id,process_key,status,started_at,finished_at,duration_ms,summary,error_message
            from public.system_monitor_runs
            order by started_at desc limit 40
          ) x
        ), '[]'::jsonb),
        'incidents', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select id,process_key,severity,status,title,message,first_seen_at,last_seen_at,
                   occurrence_count,acknowledged_at,resolved_at,created_at,updated_at
            from public.system_incidents
            order by coalesce(updated_at,created_at) desc limit 50
          ) x
        ), '[]'::jsonb)
      );

    when 'race-operations' then
      v_payload := jsonb_build_object(
        'generated_at', now(),
        'summary', jsonb_build_object(
          'problem_stages', (select count(*) from public.race_operations_stage_status_v1 where has_problem),
          'open_incidents', (select count(*) from public.race_operations_incidents_v1 where resolved_at is null)
        ),
        'stage_status', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select stage_id,race_id,race_name,race_category,stage_number,stage_name,
                   stage_start_game_at,calculation_status,replay_status,completion_status,
                   results_published,official_outputs_persisted,automation_status,engine_version,
                   survival_phase,last_error,is_cancelled,has_problem,issue_key,issue_severity,
                   issue_message,last_checked_at,updated_at
            from public.race_operations_stage_status_v1
            order by updated_at desc limit 40
          ) x
        ), '[]'::jsonb),
        'incidents', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select id,stage_id,race_id,race_name,stage_number,issue_key,severity,message,
                   detected_game_at,detected_at,last_seen_at,resolved_at,resolution_message,updated_at
            from public.race_operations_incidents_v1
            order by updated_at desc limit 40
          ) x
        ), '[]'::jsonb)
      );

    when 'migration-process' then
      v_payload := jsonb_build_object(
        'generated_at', now(),
        'control', coalesce((select to_jsonb(x) from (
          select id,timeline_id,is_armed,armed_source_season,armed_target_season,armed_at,armed_note,updated_at
          from public.season_transition_control_v1 limit 1
        ) x), '{}'::jsonb),
        'component_readiness', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select component_key,display_order,required,status,details,updated_at
            from public.season_transition_component_readiness_v1
            order by display_order,component_key
          ) x
        ), '[]'::jsonb),
        'runs', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select id,source_season,target_season,mode,status,source_end_date,target_start_date,
                   note,error_message,created_at,source_frozen_at,core_applied_at,completed_at,updated_at
            from public.season_transition_engine_runs_v2
            order by created_at desc limit 15
          ) x
        ), '[]'::jsonb),
        'events', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select id,run_id,phase,event_type,created_at
            from public.season_transition_engine_events_v2
            order by created_at desc limit 40
          ) x
        ), '[]'::jsonb),
        'checkpoints', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select id,label,source_season,source_end_date,restore_method,status,notes,created_at,verified_at,updated_at
            from public.season_transition_lab_checkpoints_v1
            order by created_at desc limit 20
          ) x
        ), '[]'::jsonb)
      );

    when 'bug-reports' then
      v_payload := jsonb_build_object(
        'generated_at', now(),
        'counts', jsonb_build_object(
          'total', (select count(*) from public.bug_reports),
          'open', (select count(*) from public.bug_reports where status='open'),
          'in_progress', (select count(*) from public.bug_reports where status='in_progress'),
          'resolved', (select count(*) from public.bug_reports where status='resolved'),
          'closed', (select count(*) from public.bug_reports where status='closed')
        ),
        'reports', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select * from public.bug_reports order by created_at desc limit 100
          ) x
        ), '[]'::jsonb)
      );

    when 'player-reviews' then
      v_payload := jsonb_build_object(
        'generated_at', now(),
        'counts', jsonb_build_object(
          'total', (select count(*) from public.homepage_player_reviews),
          'pending', (select count(*) from public.homepage_player_reviews where status='pending'),
          'approved', (select count(*) from public.homepage_player_reviews where status='approved'),
          'rejected', (select count(*) from public.homepage_player_reviews where status='rejected')
        ),
        'reviews', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select * from public.homepage_player_reviews order by created_at desc limit 100
          ) x
        ), '[]'::jsonb)
      );

    when 'contact-messages' then
      v_payload := jsonb_build_object(
        'generated_at', now(),
        'counts', jsonb_build_object(
          'total', (select count(*) from public.contact_messages),
          'open', (select count(*) from public.contact_messages where admin_status='open'),
          'archived', (select count(*) from public.contact_messages where admin_status='archived')
        ),
        'messages', coalesce((
          select jsonb_agg(to_jsonb(x)) from (
            select * from public.contact_messages order by created_at desc limit 100
          ) x
        ), '[]'::jsonb)
      );

    else
      raise exception 'Unsupported admin module: %', p_module_key;
  end case;
  return v_payload;
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.push_admin_module_snapshot(p_module_key text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vault', 'control_center_private'
AS $function$
declare
  v_endpoint text;
  v_token text;
  v_request_id bigint;
  v_payload jsonb;
  v_module_payload jsonb;
begin
  select decrypted_secret into v_endpoint from vault.decrypted_secrets
  where name='game_control_center_telemetry_endpoint';
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name='game_control_center_telemetry_token';

  if v_endpoint is null or v_token is null then
    raise exception 'Game Control Center telemetry secrets are missing';
  end if;

  v_module_payload := case
    when p_module_key='race-operations' then control_center_private.build_race_operations_snapshot_v2()
    when p_module_key='migration-process' then control_center_private.build_migration_process_snapshot_v2()
    else control_center_private.build_admin_module_snapshot(p_module_key)
  end;

  v_payload := jsonb_build_object(
    'sourceProjectRef','okuravitxocyevkexfgi',
    'adminModules',jsonb_build_array(jsonb_build_object(
      'moduleKey',p_module_key,
      'status',control_center_private.admin_module_status(p_module_key),
      'payload',v_module_payload
    ))
  );

  select net.http_post(
    url:=v_endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token),
    body:=v_payload,
    timeout_milliseconds:=30000
  ) into v_request_id;

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.notify_admin_module_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  v_seconds integer := 15;
begin
  if array_length(TG_ARGV,1) >= 2 then
    begin
      v_seconds := greatest(0, TG_ARGV[1]::integer);
    exception when others then
      v_seconds := 15;
    end;
  end if;

  begin
    perform control_center_private.request_admin_module_snapshot(TG_ARGV[0], v_seconds);
  exception when others then
    null;
  end;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.request_admin_module_snapshot(p_module_key text, p_min_seconds integer DEFAULT 15)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  v_claimed text;
  v_request_id bigint;
begin
  insert into control_center_private.admin_module_delivery_state(module_key,last_event_at,updated_at)
  values (p_module_key, clock_timestamp(), clock_timestamp())
  on conflict (module_key) do update
    set last_event_at = excluded.last_event_at,
        updated_at = excluded.updated_at;

  update control_center_private.admin_module_delivery_state
  set last_sent_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where module_key = p_module_key
    and (
      last_sent_at is null
      or last_sent_at <= clock_timestamp() - make_interval(secs => greatest(0,coalesce(p_min_seconds,15)))
    )
  returning module_key into v_claimed;

  if v_claimed is null then
    return null;
  end if;

  begin
    v_request_id := control_center_private.push_admin_module_snapshot(p_module_key);
    update control_center_private.admin_module_delivery_state
    set last_request_id = v_request_id,
        updated_at = clock_timestamp()
    where module_key = p_module_key;
    return v_request_id;
  exception when others then
    update control_center_private.admin_module_delivery_state
    set last_sent_at = null,
        updated_at = clock_timestamp()
    where module_key = p_module_key;
    return null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.push_admin_modules_safety()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  v_key text;
begin
  foreach v_key in array array[
    'analytics',
    'system-health',
    'race-operations',
    'migration-process',
    'bug-reports',
    'player-reviews',
    'contact-messages'
  ]
  loop
    begin
      perform control_center_private.request_admin_module_snapshot(v_key, 0);
    exception when others then
      null;
    end;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.build_race_operations_snapshot_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  v_game_now timestamptz := public.get_current_game_timestamp();
begin
  return jsonb_build_object(
    'generated_at',now(),
    'game_now',v_game_now,
    'counts',jsonb_build_object(
      'today_total',(
        select count(*) from public.race_operations_stage_status_v1
        where stage_start_game_at::date=v_game_now::date
      ),
      'today_problems',(
        select count(*) from public.race_operations_stage_status_v1
        where stage_start_game_at::date=v_game_now::date and has_problem
      ),
      'active_problems',(
        select count(*) from public.race_operations_stage_status_v1
        where has_problem
      ),
      'completed_today',(
        select count(*) from public.race_operations_stage_status_v1
        where stage_start_game_at::date=v_game_now::date and completion_status='done'
      )
    ),
    'stage_status',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.stage_start_game_at desc,x.stage_number desc)
      from (
        select
          stage_id,race_id,race_name,race_category,stage_number,stage_name,
          stage_start_game_at,calculation_due_game_at,results_due_game_at,game_now_at_check,
          calculation_status,calculation_completed_at_real,calculation_run_id,calculation_attempt_count,
          replay_status,replay_manifest_ready,replay_opened_game_at,replay_opened_at_real,replay_closed_at_real,
          completion_status,results_published,official_outputs_persisted,stage_result_rows,classification_rows,
          ranking_award_rows,prize_award_rows,paid_prize_award_rows,results_published_at_real,
          automation_status,engine_version,survival_phase,last_error,is_cancelled,has_problem,
          issue_key,issue_severity,issue_message,first_problem_at,resolved_at,last_checked_at,updated_at
        from public.race_operations_stage_status_v1
        where stage_start_game_at::date>=v_game_now::date-6
           or stage_start_game_at::date=v_game_now::date
           or has_problem
        order by stage_start_game_at desc,stage_number desc
        limit 160
      ) x
    ),'[]'::jsonb),
    'incidents',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select
          i.id,i.stage_id,i.race_id,i.race_name,i.stage_number,i.issue_key,i.severity,i.message,
          i.detected_game_at,i.detected_at,i.last_seen_at,i.resolved_at,i.resolution_message,
          i.metadata,i.created_at,i.updated_at,
          case
            when i.issue_key='automatic_recovery_timeout' then true
            when coalesce((i.metadata->>'recovery_timeout_exceeded')::boolean,false) then true
            when lower(coalesce(i.metadata->>'survival_phase',''))='pass2_retry_exhausted' then true
            when lower(coalesce(i.metadata->>'last_error','')) like '%pass 2 retry limit exhausted%' then true
            when lower(coalesce(i.metadata->>'automation_status','')) in ('failed','blocked')
              and lower(coalesce(i.metadata->>'calculation_status',''))='failed' then true
            when i.issue_key='completion_incomplete'
              and i.resolved_at is null
              and i.detected_at<=now()-interval '10 minutes'
              and lower(coalesce(i.metadata->>'last_error','')) like '%retry failed%' then true
            else false
          end as recovery_exhausted
        from public.race_operations_incidents_v1 i
        order by i.updated_at desc
        limit 80
      ) x
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.build_migration_process_snapshot_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
declare
  v_game public.game_state%rowtype;
  v_source integer;
  v_target integer;
  v_source_end date;
  v_target_start date;
  v_control jsonb;
  v_run jsonb;
begin
  select * into v_game from public.game_state where id=true;
  v_source := v_game.season_number;
  v_target := v_source + 1;
  v_source_end := public.get_game_date_for_season_end(v_source);
  v_target_start := public.get_game_date_for_season_start(v_target);

  select to_jsonb(x) into v_control from (
    select id,timeline_id,is_armed,armed_source_season,armed_target_season,armed_at,armed_note,updated_at
    from public.season_transition_control_v1 where id=true
  ) x;

  select to_jsonb(x) into v_run from (
    select id,source_season,target_season,mode,status,source_end_date,target_start_date,note,error_message,
           created_at,source_frozen_at,core_applied_at,completed_at,updated_at
    from public.season_transition_engine_runs_v2
    where mode='production' and status <> 'completed'
    order by created_at desc limit 1
  ) x;

  return jsonb_build_object(
    'generated_at', now(),
    'game', jsonb_build_object(
      'season',v_game.season_number,'month',v_game.month_number,'day',v_game.day_number,
      'hour',v_game.hour_number,'minute',v_game.minute_number,'paused',v_game.is_paused,
      'game_date',public.get_current_game_date_date(),'game_timestamp',public.get_current_game_timestamp()
    ),
    'pair', jsonb_build_object(
      'source_season',v_source,'target_season',v_target,
      'source_end_date',v_source_end,'target_start_date',v_target_start
    ),
    'timing_policy', jsonb_build_object(
      'trigger','exact_dec31_to_jan1_game_date_boundary',
      'automatic_controller','season_transition_boundary_controller_v2',
      'game_pauses_before_mutation',true,
      'target_boundary_time','Jan 1 00:00 game time',
      'fail_closed',true,
      'resume_only_after_completed',true,
      'jan1_daily_processing_deferred',true
    ),
    'control', coalesce(v_control,'{}'::jsonb),
    'run', v_run,
    'readiness', public.get_season_transition_preflight_v1(),
    'persistence', public.get_season_transition_persistence_guard_status_v1(),
    'component_readiness', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.display_order,x.component_key)
      from (
        select component_key,display_order,required,status,details,updated_at
        from public.season_transition_component_readiness_v1
      ) x
    ),'[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id,source_season,target_season,mode,status,source_end_date,target_start_date,
               note,error_message,created_at,source_frozen_at,core_applied_at,completed_at,updated_at
        from public.season_transition_engine_runs_v2
        where mode='production'
        order by created_at desc limit 15
      ) x
    ),'[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id,run_id,phase,event_type,created_at
        from public.season_transition_engine_events_v2
        order by created_at desc limit 60
      ) x
    ),'[]'::jsonb),
    'checkpoints', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id,label,source_season,source_end_date,restore_method,status,notes,created_at,verified_at,updated_at
        from public.season_transition_lab_checkpoints_v1
        order by created_at desc limit 20
      ) x
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.request_platform_metrics()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vault'
AS $function$
declare
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='control_center_platform_collector_secret';

  if v_token is null then raise exception 'collector secret missing'; end if;

  select net.http_post(
    url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/control-center-platform-metrics',
    headers := jsonb_build_object('Content-Type','application/json','x-control-collector',v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION control_center_private.send_platform_telemetry()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vault', 'control_center_private'
AS $function$
declare
  v_endpoint text;
  v_token text;
  v_cache public.control_center_platform_metrics_cache%rowtype;
  v_payload jsonb;
  v_request_id bigint;
begin
  select decrypted_secret into v_endpoint from vault.decrypted_secrets where name='game_control_center_telemetry_endpoint';
  select decrypted_secret into v_token from vault.decrypted_secrets where name='game_control_center_telemetry_token';
  if v_endpoint is null or v_token is null then raise exception 'Game Control Center telemetry secrets are missing'; end if;

  select * into v_cache from public.control_center_platform_metrics_cache where id=1;
  if v_cache.id is null then raise exception 'Platform metrics cache is empty'; end if;

  v_payload := jsonb_build_object(
    'sourceProjectRef','okuravitxocyevkexfgi',
    'metrics',jsonb_build_array(
      jsonb_build_object('key','cpu_usage','label','CPU','used',v_cache.cpu_percent,'total',100,'unit','%','status',case when v_cache.cpu_percent is null then 'pending' when v_cache.cpu_percent >= 90 then 'critical' when v_cache.cpu_percent >= 75 then 'warning' else 'healthy' end),
      jsonb_build_object('key','ram_usage','label','RAM','used',v_cache.ram_percent,'total',100,'unit','%','status',case when v_cache.ram_percent is null then 'pending' when v_cache.ram_percent >= 90 then 'critical' when v_cache.ram_percent >= 75 then 'warning' else 'healthy' end),
      jsonb_build_object('key','platform_disk_usage','label','Disk','used',v_cache.disk_percent,'total',100,'unit','%','status',case when v_cache.disk_percent is null then 'pending' when v_cache.disk_percent >= 90 then 'critical' when v_cache.disk_percent >= 75 then 'warning' else 'healthy' end)
    ),
    'healthChecks',jsonb_build_array(
      jsonb_build_object('area','System Health','key','platform_metrics','label','Supabase platform metrics','status','healthy','text','Connected','message','CPU, RAM and disk collected from Supabase Metrics API'),
      jsonb_build_object('area','System Health','key','compute_size','label','Compute size','status','healthy','text',coalesce(v_cache.compute_size,'Unknown'),'value',v_cache.max_connections,'unit','max DB connections','message','Compute tier inferred from the current database connection limit'),
      jsonb_build_object('area','System Health','key','database_platform_status','label','Database status','status',case when v_cache.database_status='healthy' then 'healthy' else 'warning' end,'text',case when v_cache.database_status='healthy' then 'Active & healthy' else initcap(coalesce(v_cache.database_status,'unknown')) end,'message','Supabase platform database status'),
      jsonb_build_object('area','System Health','key','project_region','label','Region','status','healthy','text','Central Europe (Zurich)','message','Supabase project region'),
      jsonb_build_object('area','System Health','key','backup_policy','label','Backup','status','healthy','text',initcap(coalesce(v_cache.backup_policy,'daily')),'message','Supabase-managed daily backup policy. Exact latest backup timestamp requires Management API backup access.')
    )
  );

  select net.http_post(url := v_endpoint, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token), body := v_payload, timeout_milliseconds := 30000)
  into v_request_id;
  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION finance._immutable_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  raise exception 'Ledger tables are immutable';
end;
$function$
;

CREATE OR REPLACE FUNCTION finance._apply_entry_to_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into finance.account_balances(account_id, balance, updated_at)
  values (new.account_id, new.amount, now())
  on conflict (account_id) do update
    set balance = finance.account_balances.balance + excluded.balance,
        updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION finance._check_tx_balanced()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare s bigint;
begin
  select coalesce(sum(amount),0) into s
  from finance.entries
  where transaction_id = new.transaction_id;

  if s <> 0 then
    raise exception 'Transaction % not balanced (sum=%)', new.transaction_id, s;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION finance._sync_club_balances_from_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_club_id uuid;
  v_balance bigint;
begin
  perform set_config('finance.internal', '1', true);

  select a.club_id into v_club_id
  from finance.accounts a
  where a.id = new.account_id
    and a.club_id is not null
    and a.currency='CASH'
    and a.kind='main';

  if v_club_id is null then return new; end if;

  select b.balance into v_balance
  from finance.account_balances b
  where b.account_id = new.account_id;

  update public.club_finance_summary
    set current_balance = v_balance::numeric,
        updated_at = now()
  where club_id = v_club_id;

  update public.clubs
    set cash_balance = v_balance::numeric,
        updated_at = now()
  where id = v_club_id;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION finance._bump_weekly_from_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_club_id uuid;
  v_created_at timestamptz;
  v_type text;
  v_income_add numeric := 0;
  v_expense_add numeric := 0;
begin
  perform set_config('finance.internal', '1', true);

  select a.club_id
  into v_club_id
  from finance.accounts a
  where a.id = new.account_id
    and a.club_id is not null
    and a.currency = 'CASH'
    and a.kind = 'main';

  if v_club_id is null then
    return new;
  end if;

  select t.created_at, t.type
  into v_created_at, v_type
  from finance.transactions t
  where t.id = new.transaction_id;

  if v_type = 'opening_balance' then
    return new;
  end if;

  if v_created_at < now() - interval '7 days' then
    return new;
  end if;

  if new.amount > 0 then
    v_income_add := new.amount::numeric;
  else
    v_expense_add := (-new.amount)::numeric;
  end if;

  update public.club_finance_summary
  set weekly_income = weekly_income + v_income_add,
      weekly_expenses = weekly_expenses + v_expense_add,
      updated_at = now()
  where club_id = v_club_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION finance.ensure_main_club_account(p_club_id uuid, p_currency text DEFAULT 'CASH'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_account_id uuid;
begin
  if p_club_id is null then
    raise exception 'Club id is required';
  end if;

  select a.id
  into v_account_id
  from finance.accounts a
  where a.club_id = p_club_id
    and a.currency = p_currency
    and a.kind = 'main'
  limit 1;

  if v_account_id is null then
    insert into finance.accounts (club_id, currency, kind)
    values (p_club_id, p_currency, 'main')
    returning id into v_account_id;
  end if;

  insert into finance.account_balances (account_id, balance)
  values (v_account_id, 0)
  on conflict (account_id) do nothing;

  return v_account_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION finance.set_transaction_game_date_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_month integer;
  v_day integer;
  v_hour integer;
  v_minute integer;
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  -- Do not overwrite game_date if the writer explicitly provided it.
  if new.metadata ? 'game_date' then
    return new;
  end if;

  select
    gs.season_number,
    gs.month_number,
    gs.day_number,
    gs.hour_number,
    gs.minute_number
  into
    v_season,
    v_month,
    v_day,
    v_hour,
    v_minute
  from public.game_state gs
  where gs.id = true
  limit 1;

  if v_season is null or v_month is null or v_day is null then
    raise exception 'Cannot create finance transaction: game_state date is missing.';
  end if;

  new.metadata :=
    new.metadata ||
    jsonb_build_object(
      'game_date',
      jsonb_build_object(
        'season', v_season,
        'month', v_month,
        'day', v_day,
        'hour', coalesce(v_hour, 0),
        'minute', coalesce(v_minute, 0)
      )
    );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION finance._sync_club_balances_from_entry_ai_safe_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_balance bigint;
  v_is_ai boolean := false;
  v_mirror_balance numeric;
begin
  perform set_config('finance.internal','1',true);

  select a.club_id,coalesce(c.is_ai,false)
    into v_club_id,v_is_ai
  from finance.accounts a
  join public.clubs c on c.id=a.club_id
  where a.id=new.account_id
    and a.club_id is not null
    and a.currency='CASH'
    and a.kind='main';

  if v_club_id is null then
    return new;
  end if;

  select b.balance
    into v_balance
  from finance.account_balances b
  where b.account_id=new.account_id;

  v_mirror_balance := case
    when v_is_ai then greatest(coalesce(v_balance,0),0)::numeric
    else coalesce(v_balance,0)::numeric
  end;

  update public.club_finance_summary
  set current_balance=v_mirror_balance,
      updated_at=now()
  where club_id=v_club_id;

  update public.clubs
  set cash_balance=v_mirror_balance,
      updated_at=now()
  where id=v_club_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ppm_set_updated_at_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.national_coach_masked_overall_bounds_v1(p_rider_id uuid, p_overall integer, p_season_number integer)
 RETURNS int4range
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_span integer;
  v_offset integer;
  v_low integer;
  v_high integer;
  v_hash bigint;
begin
  if p_overall is null then
    return null;
  end if;

  select masked_overall_span::integer
  into v_span
  from public.national_association_config
  where id=true;

  v_span:=greatest(1,coalesce(v_span,3));

  -- Deterministic by rider + season: refreshing cannot reveal the true value.
  v_hash:=('x'||substr(md5(p_rider_id::text||':'||p_season_number::text),1,8))::bit(32)::bigint;
  v_offset:=(v_hash % (v_span+1))::integer;

  v_low:=greatest(1,p_overall-v_offset);
  v_high:=least(99,v_low+v_span);

  if p_overall>v_high then
    v_high:=least(99,p_overall);
    v_low:=greatest(1,v_high-v_span);
  elsif p_overall<v_low then
    v_low:=greatest(1,p_overall);
    v_high:=least(99,v_low+v_span);
  end if;

  return int4range(v_low,v_high+1,'[)');
end;
$function$
;

CREATE OR REPLACE FUNCTION private.national_association_run_game_day_maintenance_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_result jsonb:='{}'::jsonb;
  v_task jsonb;
  v_expired integer;
begin
  begin
    v_task:=public.refresh_national_association_statuses_v1();
    v_result:=v_result||jsonb_build_object('association_statuses',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'association_statuses','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'association_statuses','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('association_statuses_error',sqlerrm);
  end;

  begin
    v_task:=public.process_national_coach_elections_v1();
    v_result:=v_result||jsonb_build_object('coach_elections',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'coach_elections','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'coach_elections','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('coach_elections_error',sqlerrm);
  end;

  begin
    v_expired:=public.expire_national_team_callups_v1();
    v_task:=jsonb_build_object('expired',v_expired);
    v_result:=v_result||jsonb_build_object('callup_expiry',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'callup_expiry','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'callup_expiry','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('callup_expiry_error',sqlerrm);
  end;

  begin
    v_task:=public.refresh_national_team_duty_status_v1();
    v_result:=v_result||jsonb_build_object('national_duty',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'national_duty','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'national_duty','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('national_duty_error',sqlerrm);
  end;

  begin
    v_task:=public.process_nations_competition_planning_v1();
    v_result:=v_result||jsonb_build_object('nations_competition',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'nations_competition','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'nations_competition','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('nations_competition_error',sqlerrm);
  end;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.national_association_game_state_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old_date date;
  v_new_date date;
begin
  v_old_date:=public.game_date_from_parts(
    old.season_number,
    old.month_number,
    old.day_number
  );
  v_new_date:=public.game_date_from_parts(
    new.season_number,
    new.month_number,
    new.day_number
  );

  if v_old_date is distinct from v_new_date then
    -- AFTER UPDATE: all game-date helpers already see NEW state.
    perform private.national_association_run_game_day_maintenance_v1();
  end if;

  return new;
exception when others then
  -- Never block the main game clock because of this subsystem.
  begin
    insert into public.national_association_maintenance_log(
      game_date,task_key,status,details
    )
    values(
      v_new_date,
      'game_state_trigger',
      'error',
      jsonb_build_object('message',sqlerrm)
    );
  exception when others then
    null;
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.nations_distribute_group_counts_v1(p_entrants integer, p_groups integer, p_advancers integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_group integer;
  v_base_size integer;
  v_size_remainder integer;
  v_base_advance integer;
  v_advance_remainder integer;
  v_arr jsonb:='[]'::jsonb;
begin
  if p_groups<=0 then
    return '[]'::jsonb;
  end if;

  v_base_size:=p_entrants/p_groups;
  v_size_remainder:=p_entrants%p_groups;
  v_base_advance:=p_advancers/p_groups;
  v_advance_remainder:=p_advancers%p_groups;

  for v_group in 1..p_groups loop
    v_arr:=v_arr||jsonb_build_array(jsonb_build_object(
      'group_number',v_group,
      'entrant_count',v_base_size+case when v_group<=v_size_remainder then 1 else 0 end,
      'advance_count',v_base_advance+case when v_group<=v_advance_remainder then 1 else 0 end
    ));
  end loop;

  return v_arr;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_national_association_members_v1(p_association_id uuid, p_type_code text, p_title text, p_message text, p_action_url text, p_payload jsonb, p_event_key_prefix text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_member record;
  v_count integer:=0;
begin
  if p_association_id is null then
    return 0;
  end if;

  for v_member in
    select distinct m.user_id
    from public.national_association_memberships m
    where m.association_id=p_association_id
      and m.status='active'
  loop
    perform public.create_user_game_notification_v1(
      v_member.user_id,
      p_type_code,
      p_title,
      p_message,
      p_action_url,
      coalesce(p_payload,'{}'::jsonb)||jsonb_build_object(
        'association_id',p_association_id
      ),
      case
        when p_event_key_prefix is null then null
        else p_event_key_prefix||':'||v_member.user_id::text
      end,
      null
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_national_association_status_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_country_name text;
begin
  if new.status='active'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select coalesce(c.name,new.country_code)
    into v_country_name
    from public.countries c
    where upper(c.code)=upper(new.country_code)
    limit 1;

    perform private.notify_national_association_members_v1(
      new.id,
      'NATIONAL_ASSOCIATION_ACTIVATED',
      coalesce(v_country_name,new.country_code)||' National Association activated',
      'Your National Association is active. Members can now participate in the National Coach election and the World Nations Championship system.',
      '/dashboard/national-association',
      jsonb_build_object(
        'country_code',new.country_code,
        'association_name',new.name
      ),
      'national-association-activated:'||new.id::text
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_national_coach_election_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_title text;
  v_message text;
  v_type text;
  v_key text;
  v_winner_name text;
begin
  if tg_op='INSERT' and new.status='candidate_registration' then
    v_type:='NATIONAL_COACH_ELECTION_OPEN';
    v_title:='National Coach candidature is open';
    v_message:='Eligible Association members can submit their National Coach candidature before the registration deadline.';
    v_key:='national-coach-election-open:'||new.id::text;
  elsif tg_op='UPDATE'
    and new.status='voting'
    and old.status is distinct from new.status then
    v_type:='NATIONAL_COACH_VOTING_OPEN';
    v_title:='National Coach voting is open';
    v_message:='The first-round National Coach vote is now open. Each eligible Association member has one final vote for this round.';
    v_key:='national-coach-voting-open:'||new.id::text||':'||new.current_round::text;
  elsif tg_op='UPDATE'
    and new.status='runoff'
    and (
      old.status is distinct from new.status
      or old.current_round is distinct from new.current_round
    ) then
    v_type:='NATIONAL_COACH_RUNOFF_OPEN';
    v_title:='National Coach runoff is open';
    v_message:='No unique winner was produced. A new runoff round is open; each eligible member receives one new vote.';
    v_key:='national-coach-runoff-open:'||new.id::text||':'||new.current_round::text;
  elsif tg_op='UPDATE'
    and new.status='completed'
    and old.status is distinct from new.status
    and new.winning_candidate_id is not null then
    select coalesce(cl.name,'The winning manager')
    into v_winner_name
    from public.national_coach_candidates c
    left join public.clubs cl on cl.id=c.club_id
    where c.id=new.winning_candidate_id;

    v_type:='NATIONAL_COACH_ELECTED';
    v_title:='National Coach elected';
    v_message:=coalesce(v_winner_name,'The winning manager')||' has been elected National Coach for this season.';
    v_key:='national-coach-elected:'||new.id::text;
  else
    return new;
  end if;

  perform private.notify_national_association_members_v1(
    new.association_id,
    v_type,
    v_title,
    v_message,
    '/dashboard/national-association',
    jsonb_build_object(
      'election_id',new.id,
      'season_number',new.season_number,
      'round_number',new.current_round,
      'status',new.status,
      'registration_close_date',new.registration_close_date,
      'round_close_date',new.current_round_close_date,
      'winning_candidate_id',new.winning_candidate_id
    ),
    v_key
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_national_team_callup_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_association_name text;
  v_coach_user_id uuid;
begin
  select a.name into v_association_name
  from public.national_associations a
  where a.id=new.association_id;

  if tg_op='INSERT'
     and new.status='pending'
     and new.club_owner_user_id_snapshot is not null then
    perform public.create_user_game_notification_v1(
      new.club_owner_user_id_snapshot,
      'NATIONAL_TEAM_CALLUP_RECEIVED',
      new.rider_name_snapshot||' called up for the National Team',
      coalesce(v_association_name,'The National Association')||
        ' has called up '||new.rider_name_snapshot||
        '. Accept or decline before '||coalesce(new.response_deadline::text,'the response deadline')||'.',
      '/dashboard/national-association',
      jsonb_build_object(
        'callup_id',new.id,
        'association_id',new.association_id,
        'association_name',v_association_name,
        'rider_id',new.rider_id,
        'rider_name',new.rider_name_snapshot,
        'club_id',new.club_id_snapshot,
        'club_name',new.club_name_snapshot,
        'response_deadline',new.response_deadline
      ),
      'national-team-callup:'||new.id::text,
      null
    );
  elsif tg_op='UPDATE'
    and old.status='pending'
    and new.status in ('accepted','declined','expired') then
    select t.user_id
    into v_coach_user_id
    from public.national_coach_terms t
    where t.association_id=new.association_id
      and t.season_number=new.season_number
      and t.status='active'
    order by t.created_at desc
    limit 1;

    if v_coach_user_id is not null then
      perform public.create_user_game_notification_v1(
        v_coach_user_id,
        'NATIONAL_TEAM_CALLUP_RESPONSE',
        new.rider_name_snapshot||' call-up: '||replace(initcap(new.status),'_',' '),
        new.rider_name_snapshot||'''s National Team call-up is now '||replace(new.status,'_',' ')||'.',
        '/dashboard/national-association',
        jsonb_build_object(
          'callup_id',new.id,
          'association_id',new.association_id,
          'rider_id',new.rider_id,
          'rider_name',new.rider_name_snapshot,
          'status',new.status,
          'responded_on',new.responded_on_game_date
        ),
        'national-team-callup-response:'||new.id::text||':'||new.status,
        null
      );
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_national_team_squad_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner record;
begin
  if new.status='confirmed'
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.confirmed_on_game_date is distinct from new.confirmed_on_game_date
     ) then
    for v_owner in
      select distinct c.club_owner_user_id_snapshot as user_id
      from public.national_team_squad_members sm
      join public.national_team_callups c on c.id=sm.callup_id
      where sm.squad_id=new.id
        and c.club_owner_user_id_snapshot is not null
    loop
      perform public.create_user_game_notification_v1(
        v_owner.user_id,
        'NATIONAL_TEAM_SQUAD_CONFIRMED',
        'National Team squad confirmed',
        'The final 10-rider National Team squad has been confirmed. Selected riders will enter National Duty for the competition window.',
        '/dashboard/national-association',
        jsonb_build_object(
          'squad_id',new.id,
          'association_id',new.association_id,
          'season_number',new.season_number,
          'cycle_key',new.cycle_key,
          'squad_size',new.squad_size
        ),
        'national-team-squad-confirmed:'||new.id::text||':'||v_owner.user_id::text,
        null
      );
    end loop;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_nations_round_draw_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item record;
begin
  if new.status='drawn'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    for v_item in
      select distinct
        ce.association_id,
        ce.country_code,
        g.group_label,
        g.planned_advance_count
      from public.nations_competition_groups g
      join public.nations_group_entries nge on nge.group_id=g.id
      join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
      where g.round_id=new.id
    loop
      perform private.notify_national_association_members_v1(
        v_item.association_id,
        'NATIONS_QUALIFICATION_DRAW',
        new.round_label||' draw confirmed',
        v_item.country_code||' has been drawn into '||v_item.group_label||
          '. '||v_item.planned_advance_count||' nation(s) advance from this group.',
        '/dashboard/world-nations',
        jsonb_build_object(
          'round_id',new.id,
          'round_label',new.round_label,
          'round_type',new.round_type,
          'group_label',v_item.group_label,
          'country_code',v_item.country_code,
          'advance_count',v_item.planned_advance_count
        ),
        'nations-draw:'||new.id::text||':'||v_item.association_id::text
      );
    end loop;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_nations_group_entry_outcome_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_round record;
  v_entry record;
  v_type text;
  v_title text;
  v_message text;
begin
  if tg_op<>'UPDATE'
     or old.status is not distinct from new.status
     or new.status not in ('advanced','eliminated') then
    return new;
  end if;

  select r.round_type,r.round_label,g.group_label
  into v_round
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  where g.id=new.group_id;

  if v_round.round_type='world_final' then
    return new;
  end if;

  select ce.association_id,ce.country_code,a.name as association_name
  into v_entry
  from public.nations_competition_entries ce
  join public.national_associations a on a.id=ce.association_id
  where ce.id=new.competition_entry_id;

  if new.status='advanced' and v_round.round_type='final_qualification' then
    v_type:='NATIONS_WORLD_FINAL_QUALIFIED';
    v_title:='Qualified for the World Nations Final';
    v_message:=v_entry.country_code||' has qualified for the 16-nation World Nations Final.';
  elsif new.status='advanced' then
    v_type:='NATIONS_ADVANCED';
    v_title:='Advanced in the World Nations Championship';
    v_message:=v_entry.country_code||' has advanced from '||v_round.round_label||'.';
  else
    v_type:='NATIONS_ELIMINATED';
    v_title:='World Nations Championship run ended';
    v_message:=v_entry.country_code||' has been eliminated in '||v_round.round_label||'.';
  end if;

  perform private.notify_national_association_members_v1(
    v_entry.association_id,
    v_type,
    v_title,
    v_message,
    '/dashboard/world-nations',
    jsonb_build_object(
      'group_entry_id',new.id,
      'round_type',v_round.round_type,
      'round_label',v_round.round_label,
      'group_label',v_round.group_label,
      'country_code',v_entry.country_code,
      'final_group_rank',new.final_group_rank,
      'total_points',new.total_points,
      'ttt_points',new.ttt_points,
      'flat_points',new.flat_points,
      'mountain_points',new.mountain_points
    ),
    'nations-outcome:'||new.id::text||':'||new.status
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_nations_edition_milestone_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assoc record;
begin
  if new.host_association_id is not null
     and (
       tg_op='INSERT'
       or old.host_association_id is distinct from new.host_association_id
     ) then
    for v_assoc in
      select distinct e.association_id
      from public.nations_competition_entries e
      where e.edition_id=new.id
    loop
      perform private.notify_national_association_members_v1(
        v_assoc.association_id,
        'NATIONS_HOST_SELECTED',
        'World Nations Final host selected',
        coalesce(new.host_country_code,'The selected nation')||
          ' will host this season''s World Nations Final.',
        '/dashboard/world-nations',
        jsonb_build_object(
          'edition_id',new.id,
          'season_number',new.season_number,
          'host_association_id',new.host_association_id,
          'host_country_code',new.host_country_code
        ),
        'nations-host-selected:'||new.id::text||':'||v_assoc.association_id::text
      );
    end loop;
  end if;

  if new.champion_association_id is not null
     and (
       tg_op='INSERT'
       or old.champion_association_id is distinct from new.champion_association_id
     ) then
    for v_assoc in
      select distinct e.association_id
      from public.nations_competition_entries e
      where e.edition_id=new.id
    loop
      perform private.notify_national_association_members_v1(
        v_assoc.association_id,
        'NATIONS_CHAMPION',
        'World Nations Champion',
        coalesce(new.champion_country_code,'The winning nation')||
          ' has won the World Nations Championship.',
        '/dashboard/world-nations',
        jsonb_build_object(
          'edition_id',new.id,
          'season_number',new.season_number,
          'champion_association_id',new.champion_association_id,
          'champion_country_code',new.champion_country_code
        ),
        'nations-champion:'||new.id::text||':'||v_assoc.association_id::text
      );
    end loop;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_national_association_race_team_v1(p_association_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assoc public.national_associations%rowtype;
  v_existing public.national_association_race_team_identities%rowtype;
  v_club_id uuid;
  v_division text;
  v_name text;
  v_generated boolean:=false;
begin
  if p_association_id is null then
    raise exception 'Association ID is required.';
  end if;

  select * into v_existing
  from public.national_association_race_team_identities
  where association_id=p_association_id;

  if v_existing.technical_club_id is not null then
    perform private.ensure_national_team_standard_presets_v1(
      v_existing.technical_club_id
    );
    perform private.ensure_national_team_standard_cars_v1(
      v_existing.technical_club_id
    );
    return v_existing.technical_club_id;
  end if;

  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null then
    raise exception 'National Association not found.';
  end if;

  select c.id into v_club_id
  from public.clubs c
  where upper(c.country_code)=upper(v_assoc.country_code)
    and c.is_ai=true
    and c.deleted_at is null
    and public.is_national_team_club_v1(c.id)
  order by
    case
      when lower(c.name)=lower(v_assoc.country_code||' National Team') then 0
      when lower(c.name) like '%national team%' then 1
      else 2
    end,
    c.is_active desc,
    c.created_at
  limit 1;

  if v_club_id is null then
    v_division:=coalesce(
      public.safe_get_amateur_division_for_country(v_assoc.country_code),
      'INTERNATIONAL'
    );
    v_name:=upper(v_assoc.country_code)||' National Team';

    insert into public.clubs(
      owner_user_id,name,country_code,primary_color,secondary_color,logo_path,
      motto,crest_style,world_tier,reputation,cash_balance,club_tier,
      amateur_division,season_points,is_ai,is_active,club_type,
      created_game_date,inactivity_status,inactive_ai_controlled
    )
    values(
      null,v_name,upper(v_assoc.country_code),'#1D4ED8','#FACC15',
      'https://flagcdn.com/w160/'||lower(v_assoc.country_code)||'.png',
      'National Team',null,3,0,0,'amateur'::public.club_tier,
      v_division,0,true,false,'main',public.get_current_game_date_date(),
      'active',false
    )
    returning id into v_club_id;

    v_generated:=true;
  end if;

  insert into public.national_association_race_team_identities(
    association_id,country_code,technical_club_id,identity_source
  )
  values(
    v_assoc.id,upper(v_assoc.country_code),v_club_id,
    case when v_generated
      then 'generated_hidden_national_team'
      else 'existing_national_team_pool'
    end
  )
  on conflict(association_id) do update
  set country_code=excluded.country_code,
      technical_club_id=excluded.technical_club_id,
      identity_source=excluded.identity_source,
      updated_at=now();

  perform private.ensure_national_team_standard_presets_v1(v_club_id);
  perform private.ensure_national_team_standard_cars_v1(v_club_id);

  return v_club_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_nations_group_runtime_v1(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group public.nations_competition_groups%rowtype;
  v_entry record;
  v_cycle_key text;
  v_team_count integer:=0;
begin
  select * into v_group
  from public.nations_competition_groups
  where id=p_group_id;

  if v_group.id is null then
    raise exception 'Nations group not found.';
  end if;

  v_cycle_key:='nations:'||v_group.id::text;

  insert into public.nations_group_events(
    group_id,race_day,race_type,cycle_key,status,metadata
  )
  values
    (v_group.id,1,'team_time_trial',v_cycle_key,'planned',
      jsonb_build_object('standard_package',true,'team_cost_cash',0,'team_cost_coins',0)),
    (v_group.id,2,'flat_road_race',v_cycle_key,'planned',
      jsonb_build_object('standard_package',true,'team_cost_cash',0,'team_cost_coins',0)),
    (v_group.id,3,'hilly_mountain_road_race',v_cycle_key,'planned',
      jsonb_build_object('standard_package',true,'team_cost_cash',0,'team_cost_coins',0))
  on conflict(group_id,race_day) do update
  set cycle_key=excluded.cycle_key,
      race_type=excluded.race_type,
      metadata=public.nations_group_events.metadata||excluded.metadata,
      updated_at=now();

  for v_entry in
    select distinct ce.association_id
    from public.nations_group_entries nge
    join public.nations_competition_entries ce
      on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
  loop
    perform private.ensure_national_association_race_team_v1(v_entry.association_id);
    v_team_count:=v_team_count+1;
  end loop;

  return jsonb_build_object(
    'group_id',v_group.id,
    'cycle_key',v_cycle_key,
    'event_count',3,
    'technical_team_count',v_team_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_ensure_nations_group_runtime_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status='drawn'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.ensure_nations_group_runtime_v1(new.id);
  end if;
  return new;
exception when others then
  insert into public.national_association_maintenance_log(
    game_date,task_key,status,details
  )
  values(
    public.get_current_game_date_date(),
    'nations_group_runtime',
    'error',
    jsonb_build_object(
      'group_id',new.id,
      'message',sqlerrm
    )
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_sync_nations_squad_duty_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
  v_start date;
  v_end date;
  v_count integer;
  v_members integer;
begin
  -- set_national_team_duty_window_v1 updates the squad status itself. Avoid
  -- recursive re-entry, and ignore no-op status updates.
  if pg_trigger_depth()>1 then
    return new;
  end if;

  if tg_op='UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status not in ('confirmed','on_duty')
     or new.cycle_key not like 'nations:%' then
    return new;
  end if;

  select count(*)::integer
  into v_members
  from public.national_team_squad_members sm
  where sm.squad_id=new.id;

  -- confirm_national_team_squad_v1 creates/updates the squad row before it
  -- replaces the 10 members. Never attempt National Duty on an incomplete row.
  if v_members<>new.squad_size then
    return new;
  end if;

  begin
    v_group_id:=substring(new.cycle_key from 9)::uuid;
  exception when others then
    return new;
  end;

  select min(event_date),max(event_date),count(*) filter(where event_date is not null)
  into v_start,v_end,v_count
  from public.nations_group_events
  where group_id=v_group_id;

  if v_count=3 and v_start is not null and v_end is not null then
    perform public.set_national_team_duty_window_v1(new.id,v_start,v_end);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_national_team_standard_presets_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  if p_club_id is null then
    raise exception 'Technical National Team club ID is required.';
  end if;

  with specs(slot_no,specialization,setup_name) as (
    values
      (1::smallint,'flat'::text,'National Team · Flat'),
      (2::smallint,'mountain'::text,'National Team · Mountain'),
      (3::smallint,'time_trial'::text,'National Team · Time Trial')
  ),
  pivoted as (
    select
      s.slot_no,s.specialization,s.setup_name,
      max(e.catalog_item_id::text) filter(where e.equipment_category='frame')::uuid as frame_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='wheelset')::uuid as wheelset_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='tires')::uuid as tires_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='groupset')::uuid as groupset_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='helmet')::uuid as helmet_id,
      max(e.catalog_item_id::text) filter(where e.equipment_category='shoes')::uuid as shoes_id
    from specs s
    left join public.national_team_standard_equipment e
      on e.specialization=s.specialization and e.is_active=true
    group by s.slot_no,s.specialization,s.setup_name
  )
  insert into public.club_equipment_setup_presets(
    club_id,setup_slot,setup_name,
    frame_catalog_item_id,wheelset_catalog_item_id,tires_catalog_item_id,
    groupset_catalog_item_id,helmet_catalog_item_id,shoes_catalog_item_id,
    metadata
  )
  select
    p_club_id,p.slot_no,p.setup_name,
    p.frame_id,p.wheelset_id,p.tires_id,p.groupset_id,p.helmet_id,p.shoes_id,
    jsonb_build_object(
      'national_team_standard',true,
      'system_provided',true,
      'specialization',p.specialization,
      'cost_model','system_covered'
    )
  from pivoted p
  on conflict(club_id,setup_slot) do update
  set setup_name=excluded.setup_name,
      frame_catalog_item_id=excluded.frame_catalog_item_id,
      wheelset_catalog_item_id=excluded.wheelset_catalog_item_id,
      tires_catalog_item_id=excluded.tires_catalog_item_id,
      groupset_catalog_item_id=excluded.groupset_catalog_item_id,
      helmet_catalog_item_id=excluded.helmet_catalog_item_id,
      shoes_catalog_item_id=excluded.shoes_catalog_item_id,
      metadata=public.club_equipment_setup_presets.metadata||excluded.metadata,
      updated_at=now();

  get diagnostics v_count=row_count;

  return jsonb_build_object(
    'club_id',p_club_id,
    'preset_count',v_count,
    'slots',jsonb_build_array(1,2,3)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_national_team_standard_cars_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cfg public.infrastructure_asset_config%rowtype;
  v_slot integer;
  v_count integer:=0;
begin
  if p_club_id is null then
    raise exception 'Technical National Team club ID is required.';
  end if;

  select * into v_cfg
  from public.infrastructure_asset_config
  where asset_key='team_car'
  order by asset_level desc
  limit 1;

  if v_cfg.asset_level is null then
    raise exception 'Team car asset configuration is missing.';
  end if;

  for v_slot in 1..coalesce(v_cfg.max_total_quantity,10)
  loop
    insert into public.club_team_cars(
      club_id,garage_slot,asset_key,asset_level,display_name,
      purchase_cost_cash,support_value,condition_percent,status,
      total_race_days,total_distance_km,acquired_game_date,
      current_assignment_type,current_assignment_id,current_assignment_label,
      assignment_locked,assignment_start_game_date,assignment_end_game_date,
      metadata
    )
    values(
      p_club_id,
      v_slot,
      'team_car',
      v_cfg.asset_level,
      'National Team Car #'||v_slot,
      0,
      v_cfg.support_value,
      100,
      'available',
      0,
      0,
      public.get_current_game_date_date(),
      null,null,null,false,null,null,
      jsonb_build_object(
        'national_team_standard',true,
        'system_provided',true,
        'cost_model','system_covered',
        'asset_config_level',v_cfg.asset_level
      )
    )
    on conflict(club_id,garage_slot) where status<>'sold'
    do update
    set asset_level=excluded.asset_level,
        display_name=excluded.display_name,
        purchase_cost_cash=0,
        support_value=excluded.support_value,
        condition_percent=100,
        status='available',
        current_assignment_type=null,
        current_assignment_id=null,
        current_assignment_label=null,
        assignment_locked=false,
        assignment_start_game_date=null,
        assignment_end_game_date=null,
        metadata=public.club_team_cars.metadata||excluded.metadata,
        updated_at=now();

    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'club_id',p_club_id,
    'asset_key','team_car',
    'asset_level',v_cfg.asset_level,
    'fleet_quantity',v_count,
    'max_assigned_per_event',v_cfg.max_assigned_per_event,
    'support_value',v_cfg.support_value
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.pick_nations_source_stage_v1(p_race_type text, p_seed text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stage_id uuid;
begin
  select s.id
  into v_stage_id
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where
    coalesce((r.metadata->>'nations_competition')::boolean,false)=false
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
    and case
      when p_race_type='team_time_trial' then
        s.stage_format='team_time_trial'
        and s.distance_km between 18 and 48
      when p_race_type='flat_road_race' then
        s.stage_format='road_race'
        and s.terrain_type='flat'
        and s.distance_km between 140 and 220
      when p_race_type='hilly_mountain_road_race' then
        s.stage_format='road_race'
        and s.terrain_type in ('hilly','mountain')
        and s.distance_km between 135 and 220
      else false
    end
  order by
    md5(coalesce(p_seed,'')||':'||s.id::text)
  limit 1;

  if v_stage_id is null then
    raise exception 'No suitable source stage is available for Nations race type %.',p_race_type;
  end if;

  return v_stage_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.block_nations_competition_prize_award_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(
    select 1
    from public.races r
    where r.id=new.race_id
      and coalesce((r.metadata->>'nations_competition')::boolean,false)
  ) then
    return null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.block_nations_competition_ranking_award_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(
    select 1
    from public.races r
    where r.id=new.race_id
      and coalesce((r.metadata->>'nations_competition')::boolean,false)
  ) then
    return null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_nations_event_result_v1(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event public.nations_group_events%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_entry record;
  v_team_id uuid;
  v_team_rank integer;
  v_positions integer[];
  v_event_points integer;
  v_best_rank integer;
  v_top_three jsonb;
  v_race_label text;
  v_message text;
  v_count integer:=0;
begin
  select * into v_event
  from public.nations_group_events
  where id=p_event_id;

  if v_event.id is null or v_event.status<>'completed' or v_event.stage_id is null then
    return 0;
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=v_event.group_id;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  v_race_label:=case v_event.race_type
    when 'team_time_trial' then 'Team Time Trial'
    when 'flat_road_race' then 'Flat Road Race'
    else 'Hilly / Mountain Road Race'
  end;

  for v_entry in
    select
      nge.id as group_entry_id,
      ce.association_id,
      ce.country_code,
      a.name as association_name
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    join public.national_associations a on a.id=ce.association_id
    where nge.group_id=v_group.id
      and nge.status<>'withdrawn'
    order by ce.country_code
  loop
    select technical_club_id
    into v_team_id
    from public.national_association_race_team_identities
    where association_id=v_entry.association_id;

    v_team_rank:=null;
    v_positions:='{}'::integer[];
    v_event_points:=0;
    v_best_rank:=null;
    v_top_three:='[]'::jsonb;

    if v_event.race_type='team_time_trial' then
      select ts.team_rank
      into v_team_rank
      from public.race_stage_team_states ts
      join public.race_stage_simulation_runs sr on sr.id=ts.simulation_run_id
      where ts.stage_id=v_event.stage_id
        and ts.team_id=v_team_id
        and sr.status='completed'
      order by sr.created_at desc
      limit 1;

      v_event_points:=public.nations_ttt_points_v1(coalesce(v_team_rank,999));
      v_best_rank:=v_team_rank;
      v_message:=v_entry.country_code||' finished '||
        case when v_team_rank is null then 'without a classified team result'
             else '#'||v_team_rank::text end||
        ' in the '||v_race_label||' and earned '||v_event_points::text||
        ' Nations point(s).';
    else
      select coalesce(array_agg(x.rank order by x.rank),'{}'::integer[])
      into v_positions
      from (
        select r.rank
        from public.race_stage_results r
        where r.stage_id=v_event.stage_id
          and r.team_id=v_team_id
          and r.status='finished'
          and r.rank is not null
        order by r.rank
      ) x;

      select min(x.rank)
      into v_best_rank
      from unnest(v_positions) x(rank);

      select coalesce(jsonb_agg(
        jsonb_build_object(
          'rank',x.rank,
          'rider_id',x.rider_id,
          'rider_name',x.rider_name_snapshot
        ) order by x.rank
      ),'[]'::jsonb)
      into v_top_three
      from (
        select r.rank,r.rider_id,r.rider_name_snapshot
        from public.race_stage_results r
        where r.stage_id=v_event.stage_id
          and r.team_id=v_team_id
          and r.status='finished'
          and r.rank is not null
        order by r.rank
        limit 3
      ) x;

      v_event_points:=public.calculate_nation_road_race_points_v1(v_positions);
      v_message:=v_entry.country_code||' earned '||v_event_points::text||
        ' Nations point(s) in the '||v_race_label||
        '. The best three riders count toward the nation score.';
    end if;

    perform private.notify_national_association_members_v1(
      v_entry.association_id,
      'NATIONS_RACE_RESULT',
      v_round.round_label||' · Day '||v_event.race_day::text||' completed',
      v_message,
      case when v_event.race_id is not null
        then '/dashboard/races/'||v_event.race_id::text
        else '/dashboard/world-nations'
      end,
      jsonb_build_object(
        'event_id',v_event.id,
        'race_id',v_event.race_id,
        'stage_id',v_event.stage_id,
        'race_day',v_event.race_day,
        'race_type',v_event.race_type,
        'race_label',v_race_label,
        'event_date',v_event.event_date,
        'round_id',v_round.id,
        'round_type',v_round.round_type,
        'round_label',v_round.round_label,
        'group_id',v_group.id,
        'group_label',v_group.group_label,
        'association_id',v_entry.association_id,
        'association_name',v_entry.association_name,
        'country_code',v_entry.country_code,
        'event_points',v_event_points,
        'nation_race_rank',v_team_rank,
        'best_rider_rank',v_best_rank,
        'top_three_riders',v_top_three,
        'world_nations_path','/dashboard/world-nations'
      ),
      'nations-race-result:'||v_event.id::text||':'||v_entry.association_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_nations_event_result_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status='completed'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.refresh_nations_group_partial_scores_v1(new.group_id);
    perform private.notify_nations_event_result_v1(new.id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_nations_final_result_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ctx record;
begin
  if tg_op<>'UPDATE'
     or old.status is not distinct from new.status
     or new.status not in ('winner','eliminated') then
    return new;
  end if;

  select
    r.round_type,
    r.round_label,
    g.group_label,
    ce.association_id,
    ce.country_code,
    a.name as association_name
  into v_ctx
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_entries ce on ce.id=new.competition_entry_id
  join public.national_associations a on a.id=ce.association_id
  where g.id=new.group_id;

  if v_ctx.round_type<>'world_final' then
    return new;
  end if;

  perform private.notify_national_association_members_v1(
    v_ctx.association_id,
    'NATIONS_FINAL_RESULT',
    'World Nations Final completed',
    v_ctx.country_code||' finished '||
      case when new.final_group_rank is null then 'the World Nations Final'
           else '#'||new.final_group_rank::text||' in the World Nations Final' end||
      ' with '||coalesce(new.total_points,0)::text||' point(s).',
    '/dashboard/world-nations',
    jsonb_build_object(
      'group_entry_id',new.id,
      'association_id',v_ctx.association_id,
      'association_name',v_ctx.association_name,
      'country_code',v_ctx.country_code,
      'round_label',v_ctx.round_label,
      'group_label',v_ctx.group_label,
      'final_group_rank',new.final_group_rank,
      'total_points',new.total_points,
      'ttt_points',new.ttt_points,
      'flat_points',new.flat_points,
      'mountain_points',new.mountain_points,
      'race_wins',new.race_wins,
      'podium_finishes',new.podium_finishes,
      'status',new.status
    ),
    'nations-final-result:'||new.id::text
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.trg_notify_national_team_duty_status_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_member record;
  v_assoc record;
  v_type text;
  v_title text;
  v_message text;
begin
  if old.status is not distinct from new.status
     or new.status not in ('active','completed') then
    return new;
  end if;

  select a.name,a.country_code
  into v_assoc
  from public.national_associations a
  where a.id=new.association_id;

  if new.status='active' then
    v_type:='NATIONAL_TEAM_DUTY_STARTED';
  else
    v_type:='NATIONAL_TEAM_DUTY_COMPLETED';
  end if;

  for v_member in
    select
      sm.rider_id,
      coalesce(c.rider_name_snapshot,r.display_name,sm.rider_id::text) as rider_name,
      c.club_owner_user_id_snapshot as user_id
    from public.national_team_squad_members sm
    left join public.national_team_callups c on c.id=sm.callup_id
    left join public.riders r on r.id=sm.rider_id
    where sm.squad_id=new.squad_id
      and c.club_owner_user_id_snapshot is not null
  loop
    if new.status='active' then
      v_title:='National Duty started for '||v_member.rider_name;
      v_message:=v_member.rider_name||
        ' is now on National Duty with '||coalesce(v_assoc.name,'the National Team')||
        ' from '||new.start_date::text||' through '||new.end_date::text||
        ' and is unavailable for overlapping club races.';
    else
      v_title:='National Duty completed for '||v_member.rider_name;
      v_message:=v_member.rider_name||
        ' has completed National Duty with '||coalesce(v_assoc.name,'the National Team')||
        ' and is available to the club again, subject to normal health and race availability.';
    end if;

    perform public.create_user_game_notification_v1(
      v_member.user_id,
      v_type,
      v_title,
      v_message,
      '/dashboard/national-association',
      jsonb_build_object(
        'duty_id',new.id,
        'squad_id',new.squad_id,
        'association_id',new.association_id,
        'association_name',v_assoc.name,
        'country_code',v_assoc.country_code,
        'season_number',new.season_number,
        'cycle_key',new.cycle_key,
        'rider_id',v_member.rider_id,
        'rider_name',v_member.rider_name,
        'start_date',new.start_date,
        'end_date',new.end_date,
        'status',new.status
      ),
      'national-team-duty:'||new.id::text||':'||v_member.rider_id::text||':'||new.status,
      null
    );
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.run_nations_e2e_validation_core_v1(p_association_count integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer:=greatest(1,least(coalesce(p_association_count,48),128));
  v_plan jsonb;
  v_plan_100 jsonb;
  v_final_qualification jsonb;
  v_world_final jsonb;
  v_preliminary_count integer:=0;
  v_preliminary_100_count integer:=0;
  v_cfg public.national_association_config%rowtype;
  v_sched public.nations_competition_schedule_config%rowtype;
  v_pkg jsonb;
  v_mask_1 int4range;
  v_mask_2 int4range;
  v_ttt_winner integer:=0;
  v_road_top3 integer:=0;
  v_road_crash_case integer:=0;
  v_required_notifications integer:=0;
  v_cron_ok boolean:=false;
  v_no_treasury boolean:=false;
  v_runtime_gate_ok boolean:=false;
  v_lineup_rule_ok boolean:=false;
  v_checks jsonb:='[]'::jsonb;
  v_failures integer:=0;
  v_warnings integer:=0;
  v_pass boolean;
  v_health jsonb;
begin
  select * into v_cfg from public.national_association_config where id=true;
  select * into v_sched from public.nations_competition_schedule_config where id=true;

  v_plan:=public.nations_qualification_plan_v1(v_count);
  v_plan_100:=public.nations_qualification_plan_v1(100);

  select value into v_final_qualification
  from jsonb_array_elements(coalesce(v_plan->'rounds','[]'::jsonb))
  where value->>'round_type'='final_qualification'
  order by (value->>'round_index')::integer
  limit 1;

  select value into v_world_final
  from jsonb_array_elements(coalesce(v_plan->'rounds','[]'::jsonb))
  where value->>'round_type'='world_final'
  order by (value->>'round_index')::integer
  limit 1;

  select count(*)::integer into v_preliminary_count
  from jsonb_array_elements(coalesce(v_plan->'rounds','[]'::jsonb))
  where value->>'round_type'='preliminary';

  select count(*)::integer into v_preliminary_100_count
  from jsonb_array_elements(coalesce(v_plan_100->'rounds','[]'::jsonb))
  where value->>'round_type'='preliminary';

  v_pass :=
    v_cfg.minimum_active_members=5
    and v_cfg.annual_registration_start_month=1
    and v_cfg.annual_registration_start_day=1
    and v_cfg.annual_registration_close_month=1
    and v_cfg.annual_registration_close_day=10
    and v_cfg.annual_round1_close_month=1
    and v_cfg.annual_round1_close_day=20
    and v_cfg.annual_round2_close_month=1
    and v_cfg.annual_round2_close_day=27
    and v_cfg.repeated_runoff_days=7
    and v_cfg.national_squad_size=10
    and v_cfg.national_lineup_size=7
    and v_cfg.max_lineup_changes=3
    and v_cfg.masked_overall_span=3
    and v_cfg.max_active_callups=15
    and v_cfg.callup_response_days=7;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','core_config',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'minimum_members',v_cfg.minimum_active_members,
      'registration','Jan 1-10',
      'round1','Jan 10-20',
      'round2','Jan 20-27',
      'repeated_runoff_days',v_cfg.repeated_runoff_days,
      'squad_size',v_cfg.national_squad_size,
      'lineup_size',v_cfg.national_lineup_size,
      'max_lineup_changes',v_cfg.max_lineup_changes,
      'masked_overall_span',v_cfg.masked_overall_span,
      'max_active_callups',v_cfg.max_active_callups,
      'callup_response_days',v_cfg.callup_response_days
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select not exists(
    select 1
    from information_schema.tables t
    where t.table_schema='public'
      and (
        t.table_name ilike '%national_association%treasury%'
        or t.table_name ilike '%national_association%contribution%'
      )
  ) into v_no_treasury;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','no_treasury',
    'status',case when v_no_treasury then 'pass' else 'fail' end,
    'detail','National Associations have no treasury/contribution tables.'
  ));
  if not v_no_treasury then v_failures:=v_failures+1; end if;

  v_pass :=
    (v_plan->>'active_associations')::integer=v_count
    and v_final_qualification is not null
    and v_world_final is not null
    and (
      v_count<32
      or (
        (v_final_qualification->>'entrants_target')::integer=32
        and (v_final_qualification->>'advance_target')::integer=16
        and (v_final_qualification->>'group_count')::integer=4
      )
    )
    and (
      v_count<16
      or (
        (v_world_final->>'entrants_target')::integer=16
        and (v_world_final->>'advance_target')::integer=1
      )
    )
    and (v_count<=32 or v_preliminary_count>=1);

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_stress_'||v_count::text,
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',v_plan
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_pass :=
    v_preliminary_100_count>=2
    and exists(
      select 1
      from jsonb_array_elements(v_plan_100->'rounds') e
      where e->>'round_type'='final_qualification'
        and (e->>'entrants_target')::integer=32
        and (e->>'advance_target')::integer=16
        and (e->>'group_count')::integer=4
    )
    and exists(
      select 1
      from jsonb_array_elements(v_plan_100->'rounds') e
      where e->>'round_type'='world_final'
        and (e->>'entrants_target')::integer=16
        and (e->>'advance_target')::integer=1
    );

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_scale_100',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',v_plan_100
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_pass :=
    v_sched.final_month=11
    and v_sched.final_day=24
    and v_sched.final_qualification_gap_days=42
    and v_sched.preliminary_gap_days>0
    and v_sched.host_selection_days_before_final>0;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','calendar_anchors',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'world_final',format('%s-%s',v_sched.final_month,v_sched.final_day),
      'final_qualification_gap_days',v_sched.final_qualification_gap_days,
      'preliminary_gap_days',v_sched.preliminary_gap_days,
      'earliest_preliminary',format('%s-%s',v_sched.earliest_preliminary_month,v_sched.earliest_preliminary_day),
      'host_selection_days_before_final',v_sched.host_selection_days_before_final
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_pkg:=public.get_national_team_standard_package_v1();
  v_pass :=
    coalesce((
      select sum((x->>'quantity')::integer)
      from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
      where x->>'asset_key'='team_car'
    ),0)=10
    and coalesce((
      select max((x->>'asset_level')::integer)
      from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
      where x->>'asset_key'='team_car'
    ),0)=5
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='energy_gels' and (x->>'quantity')::integer=250
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='bidons_water_bottles' and (x->>'quantity')::integer=250
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='nutrition_packs' and (x->>'quantity')::integer=250
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='race_jersey_complete' and (x->>'quantity')::integer=50
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(v_pkg->'supplies','[]'::jsonb)) x
      where x->>'supply_key'='rain_jackets' and (x->>'quantity')::integer=50
    )
    and coalesce(jsonb_array_length(v_pkg->'staff'),0)=1
    and (v_pkg->'staff'->>0)='national_coach'
    and coalesce((v_pkg->>'has_treasury')::boolean,false)=false
    and coalesce(v_pkg->>'cost_model','')='system_covered';

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','standard_package',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'team_cars',(
        select coalesce(sum((x->>'quantity')::integer),0)
        from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
        where x->>'asset_key'='team_car'
      ),
      'team_car_level',(
        select coalesce(max((x->>'asset_level')::integer),0)
        from jsonb_array_elements(coalesce(v_pkg->'assets','[]'::jsonb)) x
        where x->>'asset_key'='team_car'
      ),
      'equipment_models',jsonb_array_length(coalesce(v_pkg->'equipment','[]'::jsonb)),
      'supplies',v_pkg->'supplies',
      'staff',v_pkg->'staff',
      'has_treasury',v_pkg->'has_treasury',
      'cost_model',v_pkg->'cost_model'
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  v_mask_1:=private.national_coach_masked_overall_bounds_v1(
    '00000000-0000-0000-0000-000000000082'::uuid,82,1
  );
  v_mask_2:=private.national_coach_masked_overall_bounds_v1(
    '00000000-0000-0000-0000-000000000082'::uuid,82,1
  );
  v_pass :=
    v_mask_1=v_mask_2
    and 82<@v_mask_1
    and upper(v_mask_1)-lower(v_mask_1)=4;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','masked_overall_stability',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'actual_overall',82,
      'range_low',lower(v_mask_1),
      'range_high',upper(v_mask_1)-1,
      'stable',v_mask_1=v_mask_2
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select coalesce(max(points) filter(where race_type='team_time_trial' and finishing_position=1),0)
  into v_ttt_winner
  from public.nations_points_curve
  where is_active=true;

  select coalesce(sum(points),0)
  into v_road_top3
  from public.nations_points_curve
  where is_active=true
    and race_type='road_race'
    and finishing_position in (1,2,3);

  select coalesce(sum(points),0)
  into v_road_crash_case
  from public.nations_points_curve
  where is_active=true
    and race_type='road_race'
    and finishing_position in (1,2,4);

  v_pass :=
    v_ttt_winner>0
    and v_road_top3>v_ttt_winner
    and (v_road_top3*2)>v_ttt_winner
    and v_road_crash_case>=floor(v_road_top3*0.90);

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','points_balance',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'ttt_win_points',v_ttt_winner,
      'road_best_three_1_2_3',v_road_top3,
      'road_best_three_1_2_4',v_road_crash_case,
      'crash_case_retention_pct',round(100.0*v_road_crash_case/nullif(v_road_top3,0),1)
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select
    pg_get_functiondef('public.submit_national_team_lineup_v1(uuid,integer,uuid[])'::regprocedure)
      ilike '%maximum of % lineup changes%'
    and pg_get_functiondef('public.submit_national_team_lineup_v1(uuid,integer,uuid[])'::regprocedure)
      ilike '%national_lineup_size%'
    and pg_get_functiondef('public.submit_national_team_lineup_v1(uuid,integer,uuid[])'::regprocedure)
      ilike '%max_lineup_changes%'
  into v_lineup_rule_ok;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','lineup_contract',
    'status',case when v_lineup_rule_ok then 'pass' else 'fail' end,
    'detail','Exactly 7 starters; previous day required; maximum 3 changes sourced from config.'
  ));
  if not v_lineup_rule_ok then v_failures:=v_failures+1; end if;

  select
    pg_get_functiondef('public.process_nations_race_runtime_v2()'::regprocedure)
      ilike '%v_valid_teams=v_expected%'
    and pg_get_functiondef('public.process_nations_race_runtime_v2()'::regprocedure)
      ilike '%min_riders_per_team=7%'
    and pg_get_functiondef('public.process_nations_race_runtime_v2()'::regprocedure)
      ilike '%max_riders_per_team=7%'
  into v_runtime_gate_ok;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','complete_field_race_gate',
    'status',case when v_runtime_gate_ok then 'pass' else 'fail' end,
    'detail','Every nation in the group must provide a valid 7-rider startlist before the Nations race can become scheduled.'
  ));
  if not v_runtime_gate_ok then v_failures:=v_failures+1; end if;

  select count(*)::integer
  into v_required_notifications
  from public.notification_types
  where is_active=true
    and code=any(array[
      'NATIONAL_ASSOCIATION_ACTIVATED',
      'NATIONAL_COACH_ELECTION_OPEN',
      'NATIONAL_COACH_ELECTED',
      'NATIONAL_TEAM_CALLUP_RECEIVED',
      'NATIONAL_TEAM_SQUAD_CONFIRMED',
      'NATIONAL_TEAM_DUTY_STARTED',
      'NATIONAL_TEAM_DUTY_COMPLETED',
      'NATIONS_QUALIFICATION_DRAW',
      'NATIONS_RACE_RESULT',
      'NATIONS_ADVANCED',
      'NATIONS_ELIMINATED',
      'NATIONS_WORLD_FINAL_QUALIFIED',
      'NATIONS_HOST_SELECTED',
      'NATIONS_FINAL_RESULT',
      'NATIONS_CHAMPION'
    ]);

  v_pass:=v_required_notifications=15;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','notification_lifecycle',
    'status',case when v_pass then 'pass' else 'fail' end,
    'detail',jsonb_build_object(
      'required',15,
      'present_active',v_required_notifications
    )
  ));
  if not v_pass then v_failures:=v_failures+1; end if;

  select exists(
    select 1
    from cron.job j
    where j.jobname='national-association-nations-runtime-v1'
      and j.active=true
      and j.schedule='*/15 * * * *'
      and j.command ilike '%process_national_association_nations_runtime_v4%'
  ) into v_cron_ok;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','automatic_runtime',
    'status',case when v_cron_ok then 'pass' else 'fail' end,
    'detail','15-minute National Association / World Nations maintenance job uses runtime v4.'
  ));
  if not v_cron_ok then v_failures:=v_failures+1; end if;

  v_health:=public.check_nations_operations_health_v1();
  v_pass:=coalesce(v_health->>'status','error')='success';

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','current_operations_health',
    'status',case when v_pass then 'pass' else 'warning' end,
    'detail',v_health
  ));
  if not v_pass then v_warnings:=v_warnings+1; end if;

  return jsonb_build_object(
    'status',case when v_failures=0 then 'pass' else 'fail' end,
    'association_count_tested',v_count,
    'failures',v_failures,
    'warnings',v_warnings,
    'checks',v_checks,
    'summary',case
      when v_failures=0 and v_warnings=0 then
        format('World Nations E2E contract validation passed for %s-association stress field.',v_count)
      when v_failures=0 then
        format('World Nations E2E contract validation passed with %s warning(s).',v_warnings)
      else
        format('World Nations E2E contract validation found %s failure(s) and %s warning(s).',v_failures,v_warnings)
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.run_nations_e2e_fixture_core_v1(p_association_count integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer:=greatest(16,least(coalesce(p_association_count,48),64));
  v_season integer;
  v_live_associations integer;
  v_live_edition integer;
  v_available_countries integer;
  v_fixture_token text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);
  v_created jsonb;
  v_schedule jsonb;
  v_host jsonb;
  v_race_runtime jsonb;
  v_edition_id uuid;
  v_first_round_id uuid;
  v_first_round_start date;
  v_round record;
  v_group record;
  v_round_result jsonb;
  v_group_result jsonb;
  v_round_entry_count integer;
  v_expected integer;
  v_history_count integer:=0;
  v_champion_count integer:=0;
  v_host_count integer:=0;
  v_fake_notifications integer:=0;
  v_member_min integer:=0;
  v_member_max integer:=0;
  v_scheduled_group_count integer:=0;
  v_total_group_count integer:=0;
  v_three_event_groups integer:=0;
  v_race_gate_blocked integer:=0;
  v_unsafe_scheduled integer:=0;
  v_report jsonb:='{}'::jsonb;
  v_error text;
  v_error_detail text;
  v_error_hint text;
  v_error_context text;
  v_leaked_users integer:=0;
  v_leaked_associations integer:=0;

  -- One Association is also taken through the real manager-facing
  -- election/call-up/squad/lineup/National Duty RPC lifecycle.
  v_original_game_date date;
  v_team_assoc_id uuid;
  v_team_country text;
  v_election_id uuid;
  v_candidate1 uuid;
  v_candidate2 uuid;
  v_candidate1_user uuid;
  v_candidate2_user uuid;
  v_election_result jsonb;
  v_coach_terms integer:=0;
  v_cycle text:='e2e-team-lifecycle';
  v_callup_result jsonb;
  v_squad_result jsonb;
  v_squad_id uuid;
  v_squad_riders uuid[];
  v_day1 uuid[];
  v_day2 uuid[];
  v_day3 uuid[];
  v_lineup1 jsonb;
  v_lineup2 jsonb;
  v_lineup3 jsonb;
  v_duty_id uuid;
  v_duty_start_result jsonb;
  v_duty_end_result jsonb;
  v_team_rider_count integer:=0;
  v_team_lifecycle jsonb:='{}'::jsonb;

  -- One real World Nations group is populated with synthetic national squads
  -- backed by real riders and sent through the actual race simulator for all
  -- three event days. Everything remains inside the rollback subtransaction.
  v_actual_group_id uuid;
  v_actual_cycle_key text;
  v_actual_group_team_count integer:=0;
  v_actual_races_completed integer:=0;
  v_actual_scored_nations integer:=0;
  v_engine_result jsonb;
  v_actual_race_runtime jsonb;
  v_actual_group_result jsonb:='{}'::jsonb;
begin
  select
    season_number,
    public.get_current_game_date_date()
  into v_season,v_original_game_date
  from public.game_state
  where id=true;

  select count(*)::integer into v_live_associations
  from public.national_associations;

  select count(*)::integer into v_live_edition
  from public.nations_competition_editions
  where season_number=v_season;

  if v_live_associations>0 or v_live_edition>0 then
    return jsonb_build_object(
      'status','skipped',
      'reason','fixture_requires_empty_live_nations_state',
      'live_associations',v_live_associations,
      'live_current_season_editions',v_live_edition,
      'note','Use the read-only E2E stress validator once live Associations exist, or run this fixture on a Supabase development branch.'
    );
  end if;

  -- The rollback fixture reuses existing AI clubs rather than creating hundreds
  -- of new human clubs. This avoids triggering the normal new-club roster,
  -- AI-slot replacement and division-rebalance workflows, which are unrelated
  -- to World Nations. Each fixture Association still gets five genuine main
  -- clubs that are temporarily converted to human ownership inside the rollback
  -- subtransaction.
  select count(*)::integer
  into v_available_countries
  from (
    select c.country_code
    from public.clubs c
    where c.deleted_at is null
      and c.club_type='main'
      and c.is_ai=true
      and c.is_active=true
      and not public.is_national_team_club_v1(c.id)
    group by c.country_code
    having count(*)>=5
  ) eligible_countries;

  if v_available_countries<16 then
    return jsonb_build_object(
      'status','skipped',
      'reason','not_enough_existing_ai_club_pools_for_safe_fixture',
      'requested',v_count,
      'available_fixture_countries',v_available_countries,
      'minimum_required',16
    );
  end if;

  v_count:=least(v_count,v_available_countries);

  begin

    create temporary table pg_temp._e2e_associations(
      id uuid primary key,
      idx integer not null,
      country_code text not null
    ) on commit drop;

    insert into pg_temp._e2e_associations(id,idx,country_code)
    select
      gen_random_uuid(),
      row_number() over(order by x.country_code)::integer,
      upper(x.country_code)
    from (
      select c.country_code,count(*)::integer as ai_clubs
      from public.clubs c
      where c.deleted_at is null
        and c.club_type='main'
        and c.is_ai=true
        and c.is_active=true
        and not public.is_national_team_club_v1(c.id)
      group by c.country_code
      having count(*)>=5
      order by c.country_code
      limit v_count
    ) x;

    create temporary table pg_temp._e2e_members(
      association_id uuid not null,
      association_idx integer not null,
      country_code text not null,
      member_no integer not null,
      user_id uuid not null,
      club_id uuid not null
    ) on commit drop;

    insert into pg_temp._e2e_members(
      association_id,association_idx,country_code,member_no,user_id,club_id
    )
    select
      a.id,
      a.idx,
      a.country_code,
      picked.member_no,
      gen_random_uuid(),
      picked.club_id
    from pg_temp._e2e_associations a
    cross join lateral (
      select
        c.id as club_id,
        row_number() over(order by c.club_tier,c.name,c.id)::integer as member_no
      from public.clubs c
      where upper(c.country_code)=a.country_code
        and c.deleted_at is null
        and c.club_type='main'
        and c.is_ai=true
        and c.is_active=true
        and not public.is_national_team_club_v1(c.id)
      order by c.club_tier,c.name,c.id
      limit 5
    ) picked;

    insert into auth.users(
      id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
      is_sso_user,is_anonymous
    )
    select
      m.user_id,
      'authenticated',
      'authenticated',
      'ppm-e2e-'||v_fixture_token||'-'||m.association_idx||'-'||m.member_no||'@example.invalid',
      '',
      now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('username','e2e_'||m.association_idx||'_'||m.member_no),
      now(),now(),false,false
    from pg_temp._e2e_members m;

    -- Temporarily turn five pre-existing AI main clubs per country into
    -- human-controlled clubs. The savepoint/subtransaction rollback below
    -- restores every original club row before this function returns.
    update public.clubs c
    set owner_user_id=m.user_id,
        is_ai=false,
        is_active=true,
        inactivity_status='active',
        updated_at=now()
    from pg_temp._e2e_members m
    where c.id=m.club_id;

    insert into public.national_associations(
      id,country_code,name,status,created_by_user_id,
      created_on_game_date,activated_on_game_date,last_status_change_on_game_date
    )
    select
      a.id,
      a.country_code,
      left('E2E '||v_fixture_token||' '||a.country_code||' National Association',80),
      'active',
      (
        select m.user_id
        from pg_temp._e2e_members m
        where m.association_id=a.id
        order by m.member_no
        limit 1
      ),
      public.get_current_game_date_date(),
      public.get_current_game_date_date(),
      public.get_current_game_date_date()
    from pg_temp._e2e_associations a;

    insert into public.national_association_memberships(
      association_id,user_id,club_id,status,coach_eligible,joined_on_game_date
    )
    select
      m.association_id,m.user_id,m.club_id,'active',true,public.get_current_game_date_date()
    from pg_temp._e2e_members m;

    -- Prefer the real hidden National Team club for the same country whenever
    -- one already exists. Remaining fixture Associations receive any unused
    -- technical identity only for non-race structural checks.
    insert into public.national_association_race_team_identities(
      association_id,country_code,technical_club_id,identity_source
    )
    select
      a.id,
      a.country_code,
      nt.id,
      'existing_national_team_pool'
    from pg_temp._e2e_associations a
    join lateral (
      select c.id
      from public.clubs c
      where upper(c.country_code)=a.country_code
        and c.is_ai=true
        and c.deleted_at is null
        and public.is_national_team_club_v1(c.id)
      order by c.id
      limit 1
    ) nt on true;

    with remaining_assocs as (
      select
        a.id,
        a.country_code,
        row_number() over(order by a.idx)::integer as rn
      from pg_temp._e2e_associations a
      where not exists(
        select 1
        from public.national_association_race_team_identities i
        where i.association_id=a.id
      )
    ),
    unused_technical as (
      select
        c.id,
        row_number() over(order by upper(c.country_code),c.id)::integer as rn
      from public.clubs c
      where c.is_ai=true
        and c.deleted_at is null
        and public.is_national_team_club_v1(c.id)
        and not exists(
          select 1
          from public.national_association_race_team_identities i
          where i.technical_club_id=c.id
        )
    )
    insert into public.national_association_race_team_identities(
      association_id,country_code,technical_club_id,identity_source
    )
    select
      a.id,a.country_code,t.id,'existing_national_team_pool'
    from remaining_assocs a
    join unused_technical t on t.rn=a.rn;

    select min(private.national_association_active_member_count_v1(a.id)),
           max(private.national_association_active_member_count_v1(a.id))
    into v_member_min,v_member_max
    from pg_temp._e2e_associations a;

    if v_member_min<>5 or v_member_max<>5 then
      raise exception 'Fixture membership activation failed: min %, max %.',v_member_min,v_member_max;
    end if;

    -- ---------------------------------------------------------------------
    -- Real National Coach + National Team manager workflow
    -- ---------------------------------------------------------------------
    -- Prefer France because the fixture has a deep real rider/club pool there.
    select a.id,a.country_code
    into v_team_assoc_id,v_team_country
    from pg_temp._e2e_associations a
    order by case when a.country_code='FR' then 0 else 1 end,a.idx
    limit 1;

    -- Fixed January election: candidature closes Jan 10, tied Round 1 closes
    -- Jan 20, runoff closes Jan 27.
    update public.game_state
    set month_number=1,day_number=1,hour_number=12,minute_number=0
    where id=true;

    v_election_id:=public.ensure_national_coach_election_v1(v_team_assoc_id,v_season);

    if not exists(
      select 1
      from public.national_coach_elections e
      where e.id=v_election_id
        and e.election_kind='annual'
        and e.registration_open_date=public.game_date_from_parts(v_season,1,1)
        and e.registration_close_date=public.game_date_from_parts(v_season,1,10)
        and e.round1_open_date=public.game_date_from_parts(v_season,1,10)
        and e.round1_close_date=public.game_date_from_parts(v_season,1,20)
    ) then
      raise exception 'First-activation January election did not use the fixed Jan 1-10 / Jan 10-20 window.';
    end if;

    select m.user_id into v_candidate1_user
    from pg_temp._e2e_members m
    where m.association_id=v_team_assoc_id and m.member_no=1;

    select m.user_id into v_candidate2_user
    from pg_temp._e2e_members m
    where m.association_id=v_team_assoc_id and m.member_no=2;

    perform set_config('request.jwt.claim.sub',v_candidate1_user::text,true);
    v_candidate1:=public.register_national_coach_candidate_v1(
      v_election_id,
      'E2E candidate one: balanced national-team selection and lineups.'
    );

    perform set_config('request.jwt.claim.sub',v_candidate2_user::text,true);
    v_candidate2:=public.register_national_coach_candidate_v1(
      v_election_id,
      'E2E candidate two: results-led national-team selection and lineups.'
    );

    update public.game_state
    set month_number=1,day_number=10,hour_number=12,minute_number=0
    where id=true;

    perform public.process_national_coach_election_v1(v_election_id);

    -- Round 1: deliberate 2-2 tie, fifth member abstains.
    for v_group in
      select m.member_no,m.user_id
      from pg_temp._e2e_members m
      where m.association_id=v_team_assoc_id
        and m.member_no<=4
      order by m.member_no
    loop
      perform set_config('request.jwt.claim.sub',v_group.user_id::text,true);
      perform public.cast_national_coach_vote_v1(
        v_election_id,
        case when v_group.member_no in (1,3) then v_candidate1 else v_candidate2 end
      );
    end loop;

    update public.game_state
    set month_number=1,day_number=20,hour_number=12,minute_number=0
    where id=true;

    v_election_result:=public.process_national_coach_election_v1(v_election_id);

    if coalesce(v_election_result->>'status','')<>'runoff'
       or coalesce((v_election_result->>'round')::integer,0)<>2
       or (v_election_result->>'opens_on')::date<>public.game_date_from_parts(v_season,1,20)
       or (v_election_result->>'closes_on')::date<>public.game_date_from_parts(v_season,1,27) then
      raise exception 'Tied Round 1 did not create the fixed Jan 20-27 runoff: %',v_election_result::text;
    end if;

    -- Round 2: candidate one wins 3-2.
    for v_group in
      select m.member_no,m.user_id
      from pg_temp._e2e_members m
      where m.association_id=v_team_assoc_id
      order by m.member_no
    loop
      perform set_config('request.jwt.claim.sub',v_group.user_id::text,true);
      perform public.cast_national_coach_vote_v1(
        v_election_id,
        case when v_group.member_no in (1,3,5) then v_candidate1 else v_candidate2 end
      );
    end loop;

    update public.game_state
    set month_number=1,day_number=27,hour_number=12,minute_number=0
    where id=true;

    v_election_result:=public.process_national_coach_election_v1(v_election_id);

    if coalesce(v_election_result->>'status','')<>'completed'
       or (v_election_result->>'winner_user_id')::uuid<>v_candidate1_user then
      raise exception 'Jan 27 runoff did not elect candidate one: %',v_election_result::text;
    end if;

    select count(*)::integer into v_coach_terms
    from public.national_coach_terms t
    where t.association_id=v_team_assoc_id
      and t.season_number=v_season
      and t.status='active'
      and t.user_id=v_candidate1_user;

    if v_coach_terms<>1 then
      raise exception 'Expected exactly one active elected National Coach term.';
    end if;

    -- Two riders from each of the five human-controlled fixture clubs gives
    -- exactly ten pending club call-ups and exercises Accept on every manager.
    create temporary table pg_temp._e2e_team_riders(
      seq integer primary key,
      rider_id uuid not null,
      owner_user_id uuid not null,
      club_id uuid not null,
      callup_id uuid
    ) on commit drop;

    insert into pg_temp._e2e_team_riders(seq,rider_id,owner_user_id,club_id)
    select
      row_number() over(order by m.member_no,picked.rider_id)::integer,
      picked.rider_id,
      m.user_id,
      m.club_id
    from pg_temp._e2e_members m
    cross join lateral (
      select r.id as rider_id
      from public.rider_statistics_page_view r
      where r.club_id=m.club_id
        and upper(r.country_code)=v_team_country
      order by r.id
      limit 2
    ) picked
    where m.association_id=v_team_assoc_id
    order by m.member_no,picked.rider_id;

    select count(*)::integer into v_team_rider_count
    from pg_temp._e2e_team_riders;

    if v_team_rider_count<>10 then
      raise exception 'Team lifecycle fixture expected 10 riders from the five member clubs, found %.',v_team_rider_count;
    end if;

    perform set_config('request.jwt.claim.sub',v_candidate1_user::text,true);

    for v_group in
      select seq,rider_id
      from pg_temp._e2e_team_riders
      order by seq
    loop
      v_callup_result:=public.send_national_team_callup_v1(
        v_group.rider_id,
        v_cycle
      );

      if coalesce(v_callup_result->>'status','')<>'pending' then
        raise exception 'Human-club rider call-up was not pending: %',v_callup_result::text;
      end if;

      update pg_temp._e2e_team_riders
      set callup_id=(v_callup_result->>'callup_id')::uuid
      where seq=v_group.seq;
    end loop;

    for v_group in
      select seq,callup_id,owner_user_id
      from pg_temp._e2e_team_riders
      order by seq
    loop
      perform set_config('request.jwt.claim.sub',v_group.owner_user_id::text,true);
      v_callup_result:=public.respond_to_national_team_callup_v1(
        v_group.callup_id,true,'E2E accepted'
      );
      if coalesce(v_callup_result->>'status','')<>'accepted' then
        raise exception 'Club acceptance failed: %',v_callup_result::text;
      end if;
    end loop;

    select array_agg(rider_id order by seq)
    into v_squad_riders
    from pg_temp._e2e_team_riders;

    perform set_config('request.jwt.claim.sub',v_candidate1_user::text,true);
    v_squad_result:=public.confirm_national_team_squad_v1(v_cycle,v_squad_riders);
    v_squad_id:=(v_squad_result->>'squad_id')::uuid;

    if coalesce((v_squad_result->>'squad_size')::integer,0)<>10 then
      raise exception 'Final National Team squad did not contain 10 riders: %',v_squad_result::text;
    end if;

    select array_agg(rider_id order by seq)
    into v_day1
    from pg_temp._e2e_team_riders
    where seq between 1 and 7;

    select array_agg(rider_id order by seq)
    into v_day2
    from pg_temp._e2e_team_riders
    where seq in (1,2,3,4,8,9,10);

    select array_agg(rider_id order by seq)
    into v_day3
    from pg_temp._e2e_team_riders
    where seq in (1,2,3,4,5,8,9);

    v_lineup1:=public.submit_national_team_lineup_v1(v_squad_id,1,v_day1);
    v_lineup2:=public.submit_national_team_lineup_v1(v_squad_id,2,v_day2);
    v_lineup3:=public.submit_national_team_lineup_v1(v_squad_id,3,v_day3);

    if coalesce((v_lineup1->>'lineup_size')::integer,0)<>7
       or coalesce((v_lineup2->>'changes_from_previous_day')::integer,-1)<>3
       or coalesce((v_lineup3->>'changes_from_previous_day')::integer,-1)<>1 then
      raise exception 'National Team lineup lifecycle failed: day1 %, day2 %, day3 %.',
        v_lineup1::text,v_lineup2::text,v_lineup3::text;
    end if;

    v_duty_id:=public.set_national_team_duty_window_v1(
      v_squad_id,
      public.game_date_from_parts(v_season,1,30),
      public.game_date_from_parts(v_season,2,1)
    );

    update public.game_state
    set month_number=1,day_number=30,hour_number=12,minute_number=0
    where id=true;

    v_duty_start_result:=public.refresh_national_team_duty_status_v1();

    if not exists(
      select 1
      from public.national_team_duties d
      where d.id=v_duty_id and d.status='active'
    ) then
      raise exception 'National Duty did not become active on its start date.';
    end if;

    update public.game_state
    set month_number=2,day_number=2,hour_number=12,minute_number=0
    where id=true;

    v_duty_end_result:=public.refresh_national_team_duty_status_v1();

    if not exists(
      select 1
      from public.national_team_duties d
      where d.id=v_duty_id and d.status='completed'
    ) then
      raise exception 'National Duty did not complete after its end date.';
    end if;

    v_team_lifecycle:=jsonb_build_object(
      'association_id',v_team_assoc_id,
      'country_code',v_team_country,
      'election',jsonb_build_object(
        'first_round','2-2 tie',
        'runoff_window','Jan 20-27',
        'winner_user_id',v_candidate1_user,
        'active_coach_terms',v_coach_terms
      ),
      'callups',jsonb_build_object(
        'sent',10,
        'accepted',10
      ),
      'squad_size',10,
      'lineups',jsonb_build_array(v_lineup1,v_lineup2,v_lineup3),
      'national_duty',jsonb_build_object(
        'duty_id',v_duty_id,
        'started',v_duty_start_result,
        'completed',v_duty_end_result
      )
    );

    -- Restore the original game date before the competition-wide fixture.
    update public.game_state
    set month_number=extract(month from v_original_game_date)::integer,
        day_number=extract(day from v_original_game_date)::integer,
        hour_number=12,
        minute_number=0
    where id=true;

    v_created:=public.create_nations_competition_edition_v1(v_season);
    if coalesce(v_created->>'status','') not in ('created','existing') then
      raise exception 'Edition generation failed: %',v_created::text;
    end if;

    -- Moving the rollback fixture clock through Jan 28+ intentionally exercises
    -- the real game-state maintenance trigger. It may therefore have generated
    -- the edition before this explicit call, in which case "existing" is the
    -- expected idempotent result.
    v_edition_id:=(v_created->>'edition_id')::uuid;

    select id,starts_on_game_date
    into v_first_round_id,v_first_round_start
    from public.nations_competition_rounds
    where edition_id=v_edition_id
      and round_index=1;

    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);

    select starts_on_game_date
    into v_first_round_start
    from public.nations_competition_rounds
    where id=v_first_round_id;

    select count(*)::integer,
           count(*) filter(
             where (
               select count(*)
               from public.nations_group_events e
               where e.group_id=g.id and e.event_date is not null
             )=3
           )::integer
    into v_total_group_count,v_three_event_groups
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id;

    if v_total_group_count=0 or v_three_event_groups<>v_total_group_count then
      raise exception 'Competition schedule did not create exactly three dated events for every group.';
    end if;

    -- Host rotation must be independent of money. Three equal candidates are enough
    -- to exercise the real host selector.
    insert into public.nations_host_applications(
      edition_id,association_id,submitted_by_user_id,statement,status,submitted_on_game_date
    )
    select
      v_edition_id,
      a.id,
      (
        select m.user_id
        from pg_temp._e2e_members m
        where m.association_id=a.id
        order by m.member_no
        limit 1
      ),
      'E2E host application',
      'submitted',
      public.get_current_game_date_date()
    from pg_temp._e2e_associations a
    where a.idx<=3;

    v_host:=public.select_nations_host_v1(v_edition_id);
    if coalesce(v_host->>'status','')<>'selected'
       or coalesce(v_host->>'selection_basis','')<>'rotation_not_spending' then
      raise exception 'Host selection failed: %',v_host::text;
    end if;

    select count(*)::integer into v_host_count
    from public.nations_host_applications
    where edition_id=v_edition_id and status='selected';

    if v_host_count<>1 then
      raise exception 'Fixture must select exactly one World Nations host.';
    end if;

    -- Force eight Associations with country-correct technical National Team
    -- clubs into Group 1. The production draw algorithm itself is unchanged;
    -- this fixture only controls seed_score so the actual race-engine group
    -- can satisfy the national-team country-lock invariant.
    create temporary table pg_temp._e2e_seed_positions(
      association_id uuid primary key,
      desired_position integer not null
    ) on commit drop;

    with matched as (
      select
        a.id,
        row_number() over(order by a.country_code)::integer as rn
      from pg_temp._e2e_associations a
      join public.national_association_race_team_identities i
        on i.association_id=a.id
      join public.clubs c on c.id=i.technical_club_id
      where upper(c.country_code)=a.country_code
      order by a.country_code
      limit 8
    )
    insert into pg_temp._e2e_seed_positions(association_id,desired_position)
    select
      m.id,
      (array[1,8,9,16,17,24,25,32])[m.rn]
    from matched m;

    if (select count(*) from pg_temp._e2e_seed_positions)<>8 then
      raise exception 'Actual race fixture requires eight country-correct technical National Team identities.';
    end if;

    with unused_positions as (
      select
        p,
        row_number() over(order by p)::integer as rn
      from generate_series(1,v_count) p
      where p not in (1,8,9,16,17,24,25,32)
    ),
    remaining as (
      select
        a.id,
        row_number() over(order by a.country_code)::integer as rn
      from pg_temp._e2e_associations a
      where not exists(
        select 1
        from pg_temp._e2e_seed_positions s
        where s.association_id=a.id
      )
    )
    insert into pg_temp._e2e_seed_positions(association_id,desired_position)
    select r.id,p.p
    from remaining r
    join unused_positions p on p.rn=r.rn;

    update public.nations_competition_entries e
    set seed_score=100000-s.desired_position,
        updated_at=now()
    from pg_temp._e2e_seed_positions s
    where e.edition_id=v_edition_id
      and e.association_id=s.association_id;

    perform public.draw_nations_round_v1(v_first_round_id);

    select count(*)::integer into v_round_entry_count
    from public.nations_group_entries nge
    join public.nations_competition_groups g on g.id=nge.group_id
    where g.round_id=v_first_round_id;

    if v_round_entry_count<>v_count then
      raise exception 'First-round draw expected % entries but created %.',v_count,v_round_entry_count;
    end if;

    -- Move the fixture game clock close to Round 1. The surrounding subtransaction
    -- is always rolled back, so the live game clock never changes for other sessions.
    update public.game_state
    set month_number=extract(month from (v_first_round_start-5))::integer,
        day_number=extract(day from (v_first_round_start-5))::integer,
        hour_number=12,
        minute_number=0
    where id=true;

    v_race_runtime:=public.process_nations_race_runtime_v2();
    v_race_gate_blocked:=coalesce((v_race_runtime->>'race_gates_blocked')::integer,0);

    if v_race_gate_blocked<=0 then
      raise exception 'Missing-lineup race gate was not exercised by the fixture: %',v_race_runtime::text;
    end if;

    select count(*)::integer
    into v_unsafe_scheduled
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    join public.races rr on rr.id=e.race_id
    where r.edition_id=v_edition_id
      and rr.status in ('scheduled','active')
      and e.status='waiting_for_lineups';

    if v_unsafe_scheduled<>0 then
      raise exception 'One or more World Nations races were scheduled despite missing lineups.';
    end if;

    -- ---------------------------------------------------------------------
    -- Actual three-day race-engine integration for one complete group
    -- ---------------------------------------------------------------------
    select g.id,min(e.cycle_key)
    into v_actual_group_id,v_actual_cycle_key
    from public.nations_competition_groups g
    join public.nations_group_events e on e.group_id=g.id
    where g.round_id=v_first_round_id
    group by g.id,g.group_number
    order by g.group_number
    limit 1;

    create temporary table pg_temp._e2e_group_teams(
      association_id uuid primary key,
      country_code text not null,
      manager_user_id uuid not null,
      squad_id uuid not null
    ) on commit drop;

    insert into pg_temp._e2e_group_teams(
      association_id,country_code,manager_user_id,squad_id
    )
    select
      ce.association_id,
      upper(ce.country_code),
      (
        select m.user_id
        from pg_temp._e2e_members m
        where m.association_id=ce.association_id
        order by m.member_no
        limit 1
      ),
      gen_random_uuid()
    from public.nations_group_entries nge
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where nge.group_id=v_actual_group_id
      and nge.status<>'withdrawn';

    select count(*)::integer into v_actual_group_team_count
    from pg_temp._e2e_group_teams;

    if v_actual_group_team_count<2 then
      raise exception 'Actual race-engine fixture needs at least two nations in the test group.';
    end if;

    create temporary table pg_temp._e2e_group_riders(
      association_id uuid not null,
      squad_id uuid not null,
      manager_user_id uuid not null,
      country_code text not null,
      seq integer not null,
      rider_id uuid not null,
      rider_name text not null,
      club_id uuid,
      club_name text,
      callup_id uuid not null,
      primary key(association_id,seq)
    ) on commit drop;

    insert into pg_temp._e2e_group_riders(
      association_id,squad_id,manager_user_id,country_code,seq,
      rider_id,rider_name,club_id,club_name,callup_id
    )
    select
      t.association_id,
      t.squad_id,
      t.manager_user_id,
      t.country_code,
      picked.seq,
      picked.rider_id,
      picked.rider_name,
      picked.club_id,
      picked.club_name,
      gen_random_uuid()
    from pg_temp._e2e_group_teams t
    cross join lateral (
      select
        row_number() over(
          order by
            case when coalesce(r.availability_status,'fit')='fit' then 0 else 1 end,
            r.overall desc nulls last,
            r.id
        )::integer as seq,
        r.id as rider_id,
        coalesce(r.display_name,r.id::text) as rider_name,
        r.club_id,
        r.club_name
      from public.rider_statistics_page_view r
      where upper(r.country_code)=t.country_code
      order by
        case when coalesce(r.availability_status,'fit')='fit' then 0 else 1 end,
        r.overall desc nulls last,
        r.id
      limit 10
    ) picked;

    if exists(
      select 1
      from pg_temp._e2e_group_teams t
      where (
        select count(*)
        from pg_temp._e2e_group_riders r
        where r.association_id=t.association_id
      )<>10
    ) then
      raise exception 'At least one actual-race fixture nation could not supply 10 riders.';
    end if;

    insert into public.national_team_callups(
      id,association_id,season_number,cycle_key,
      rider_id,rider_name_snapshot,country_code,
      club_id_snapshot,club_name_snapshot,club_owner_user_id_snapshot,
      sent_by_user_id,status,sent_on_game_date,
      response_deadline,responded_on_game_date,responded_by_user_id
    )
    select
      r.callup_id,
      r.association_id,
      v_season,
      v_actual_cycle_key,
      r.rider_id,
      r.rider_name,
      r.country_code,
      r.club_id,
      r.club_name,
      null,
      r.manager_user_id,
      'auto_accepted',
      public.get_current_game_date_date(),
      null,
      public.get_current_game_date_date(),
      null
    from pg_temp._e2e_group_riders r;

    insert into public.national_team_squads(
      id,association_id,season_number,cycle_key,status,squad_size,
      confirmed_by_user_id,confirmed_on_game_date
    )
    select
      t.squad_id,
      t.association_id,
      v_season,
      v_actual_cycle_key,
      'confirmed',
      10,
      t.manager_user_id,
      public.get_current_game_date_date()
    from pg_temp._e2e_group_teams t;

    insert into public.national_team_squad_members(
      squad_id,callup_id,rider_id,rider_name_snapshot,
      club_id_snapshot,club_name_snapshot,squad_role
    )
    select
      r.squad_id,r.callup_id,r.rider_id,r.rider_name,
      r.club_id,r.club_name,'squad'
    from pg_temp._e2e_group_riders r;

    create temporary table pg_temp._e2e_group_lineups(
      association_id uuid not null,
      squad_id uuid not null,
      race_day integer not null,
      lineup_id uuid not null,
      primary key(association_id,race_day)
    ) on commit drop;

    insert into pg_temp._e2e_group_lineups(
      association_id,squad_id,race_day,lineup_id
    )
    select t.association_id,t.squad_id,d.race_day,gen_random_uuid()
    from pg_temp._e2e_group_teams t
    cross join generate_series(1,3) as d(race_day);

    insert into public.national_team_lineups(
      id,squad_id,race_day,race_type,status,
      submitted_by_user_id,submitted_on_game_date
    )
    select
      l.lineup_id,
      l.squad_id,
      l.race_day,
      private.national_team_race_type_for_day_v1(l.race_day),
      'confirmed',
      t.manager_user_id,
      public.get_current_game_date_date()
    from pg_temp._e2e_group_lineups l
    join pg_temp._e2e_group_teams t on t.association_id=l.association_id;

    insert into public.national_team_lineup_members(
      lineup_id,squad_member_id,rider_id
    )
    select
      l.lineup_id,
      sm.id,
      r.rider_id
    from pg_temp._e2e_group_lineups l
    join pg_temp._e2e_group_riders r
      on r.association_id=l.association_id
     and r.seq<=7
    join public.national_team_squad_members sm
      on sm.squad_id=l.squad_id
     and sm.rider_id=r.rider_id;

    -- Re-run the real Nations runtime. The selected group must now have all
    -- three race days ready while other groups remain safely blocked.
    v_actual_race_runtime:=public.process_nations_race_runtime_v2();

    if (
      select count(*)
      from public.nations_group_events e
      where e.group_id=v_actual_group_id
        and e.status='ready'
    )<>3 then
      select jsonb_agg(
        jsonb_build_object(
          'event_id',e.id,
          'day',e.race_day,
          'status',e.status,
          'cycle_key',e.cycle_key,
          'squads',(
            select count(*)
            from public.national_team_squads s
            join public.nations_group_entries nge on nge.group_id=e.group_id
            join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
            where s.association_id=ce.association_id
              and s.season_number=v_season
              and s.cycle_key=e.cycle_key
              and s.status in ('confirmed','on_duty')
          ),
          'valid_lineups',(
            select count(*)
            from public.national_team_squads s
            join public.nations_group_entries nge on nge.group_id=e.group_id
            join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
            join public.national_team_lineups l
              on l.squad_id=s.id
             and l.race_day=e.race_day
             and l.status in ('confirmed','locked','completed')
            where s.association_id=ce.association_id
              and s.season_number=v_season
              and s.cycle_key=e.cycle_key
              and (
                select count(*)
                from public.national_team_lineup_members lm
                where lm.lineup_id=l.id
              )=7
          ),
          'participant_teams',(
            select count(distinct rpr.team_id)
            from public.race_participant_riders rpr
            where rpr.race_id=e.race_id
          ),
          'lineup_member_rows',(
            select count(*)
            from public.national_team_squads s
            join public.nations_group_entries nge on nge.group_id=e.group_id
            join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
            join public.national_team_lineups l
              on l.squad_id=s.id and l.race_day=e.race_day
            join public.national_team_lineup_members lm on lm.lineup_id=l.id
            where s.association_id=ce.association_id
              and s.season_number=v_season
              and s.cycle_key=e.cycle_key
          ),
          'lineup_riders_joined',(
            select count(*)
            from public.national_team_squads s
            join public.nations_group_entries nge on nge.group_id=e.group_id
            join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
            join public.national_team_lineups l
              on l.squad_id=s.id and l.race_day=e.race_day
            join public.national_team_lineup_members lm on lm.lineup_id=l.id
            join public.riders rr on rr.id=lm.rider_id
            where s.association_id=ce.association_id
              and s.season_number=v_season
              and s.cycle_key=e.cycle_key
          ),
          'metadata',e.metadata
        )
        order by e.race_day
      )
      into v_engine_result
      from public.nations_group_events e
      where e.group_id=v_actual_group_id;

      raise exception 'Complete test group did not become ready. Runtime: %. Diagnostics: %',
        v_actual_race_runtime::text,v_engine_result::text;
    end if;

    for v_group in
      select e.id,e.race_day,e.race_type,e.race_id,e.stage_id,e.event_date
      from public.nations_group_events e
      where e.group_id=v_actual_group_id
      order by e.race_day
    loop
      v_engine_result:=public.run_race_stage_simulation_v1(v_group.stage_id);

      if not exists(
        select 1
        from public.race_stage_simulation_runs sr
        where sr.stage_id=v_group.stage_id
          and sr.status='completed'
      ) then
        raise exception 'Race engine did not complete World Nations Day % (%): %',
          v_group.race_day,v_group.race_type,v_engine_result::text;
      end if;

      v_actual_races_completed:=v_actual_races_completed+1;

      -- Synchronize event status, partial Nations score and notifications.
      v_actual_race_runtime:=public.process_nations_race_runtime_v2();
    end loop;

    if v_actual_races_completed<>3 then
      raise exception 'Actual World Nations group completed % race days instead of 3.',
        v_actual_races_completed;
    end if;

    if not exists(
      select 1
      from public.nations_competition_groups g
      where g.id=v_actual_group_id
        and g.status='completed'
    ) then
      raise exception 'Actual World Nations group was not finalized after all three race simulations.';
    end if;

    select count(*)::integer
    into v_actual_scored_nations
    from public.nations_group_entries nge
    where nge.group_id=v_actual_group_id
      and nge.total_points is not null;

    if v_actual_scored_nations<>v_actual_group_team_count then
      raise exception 'Actual group scored % nations but expected %.',
        v_actual_scored_nations,v_actual_group_team_count;
    end if;

    v_actual_group_result:=jsonb_build_object(
      'group_id',v_actual_group_id,
      'teams',v_actual_group_team_count,
      'races_completed',v_actual_races_completed,
      'scored_nations',v_actual_scored_nations,
      'event_statuses',(
        select jsonb_agg(
          jsonb_build_object(
            'race_day',e.race_day,
            'race_type',e.race_type,
            'status',e.status,
            'race_id',e.race_id,
            'stage_id',e.stage_id
          )
          order by e.race_day
        )
        from public.nations_group_events e
        where e.group_id=v_actual_group_id
      )
    );

    -- Complete every remaining group/round with deterministic, non-tied
    -- synthetic scores. The already completed real-race group is preserved.
    for v_round in
      select *
      from public.nations_competition_rounds
      where edition_id=v_edition_id
      order by round_index
    loop
      if v_round.round_index>1 then
        perform public.draw_nations_round_v1(v_round.id);
      end if;

      select count(*)::integer into v_round_entry_count
      from public.nations_group_entries nge
      join public.nations_competition_groups g on g.id=nge.group_id
      where g.round_id=v_round.id;

      v_expected:=v_round.entrants_target;
      if v_round_entry_count<>v_expected then
        raise exception 'Round % expected % entries but drew %.',
          v_round.round_index,v_expected,v_round_entry_count;
      end if;

      for v_group in
        select *
        from public.nations_competition_groups
        where round_id=v_round.id
          and status<>'completed'
        order by group_number
      loop
        with ranked as (
          select
            nge.id,
            row_number() over(order by nge.seed_position,nge.id)::integer as rn
          from public.nations_group_entries nge
          where nge.group_id=v_group.id
            and nge.status<>'withdrawn'
        )
        update public.nations_group_entries nge
        set ttt_points=300-r.rn,
            flat_points=400-r.rn,
            mountain_points=300-r.rn,
            total_points=1000-(3*r.rn),
            race_wins=case when r.rn=1 then 2 when r.rn=2 then 1 else 0 end,
            podium_finishes=greatest(0,4-r.rn),
            ttt_rank=r.rn,
            best_day3_rider_rank=r.rn,
            updated_at=now()
        from ranked r
        where nge.id=r.id;

        v_group_result:=public.finalize_nations_group_v1(v_group.id);
        if coalesce(v_group_result->>'status','')<>'completed' then
          raise exception 'Group finalization failed: %',v_group_result::text;
        end if;
      end loop;

      v_round_result:=public.finalize_nations_round_v1(v_round.id);

      if v_round.round_type='world_final' then
        if coalesce(v_round_result->>'status','')<>'edition_completed' then
          raise exception 'World Nations Final did not complete the edition: %',v_round_result::text;
        end if;
      elsif coalesce(v_round_result->>'status','')<>'completed' then
        raise exception 'Round finalization failed: %',v_round_result::text;
      end if;
    end loop;

    select count(*)::integer into v_champion_count
    from public.nations_competition_entries
    where edition_id=v_edition_id and status='champion';

    select count(*)::integer into v_history_count
    from public.nations_competition_history
    where edition_id=v_edition_id;

    if v_champion_count<>1 then
      raise exception 'World Nations fixture resolved % champions instead of one.',v_champion_count;
    end if;

    if v_history_count<>least(16,v_count) then
      raise exception 'World Nations history expected % final rows but stored %.',
        least(16,v_count),v_history_count;
    end if;

    select count(*)::integer into v_fake_notifications
    from public.user_notifications un
    join pg_temp._e2e_members m on m.user_id=un.user_id;

    if v_fake_notifications<=0 then
      raise exception 'Competition lifecycle generated no member notifications.';
    end if;

    v_report:=jsonb_build_object(
      'status','pass',
      'association_count',v_count,
      'member_count',v_count*5,
      'active_member_min',v_member_min,
      'active_member_max',v_member_max,
      'edition_id',v_edition_id,
      'round_count',(
        select count(*) from public.nations_competition_rounds where edition_id=v_edition_id
      ),
      'group_count',v_total_group_count,
      'groups_with_three_scheduled_events',v_three_event_groups,
      'host_selection',v_host,
      'national_team_lifecycle',v_team_lifecycle,
      'actual_race_engine_group',v_actual_group_result,
      'race_gate_test',jsonb_build_object(
        'blocked_events',v_race_gate_blocked,
        'unsafe_scheduled_events',v_unsafe_scheduled,
        'runtime',v_race_runtime
      ),
      'champion_count',v_champion_count,
      'history_rows',v_history_count,
      'member_notifications_generated',v_fake_notifications,
      'rollback_mode',true,
      'summary',format(
        'Synthetic %s-association World Nations lifecycle reached one champion and %s final-history rows; all fixture writes will now be rolled back.',
        v_count,v_history_count
      )
    );

    raise exception using
      errcode='Z0001',
      message='WORLD_NATIONS_E2E_FIXTURE_ROLLBACK';
  exception
    when sqlstate 'Z0001' then
      null;
    when others then
      v_error:=sqlerrm;
      get stacked diagnostics
        v_error_detail=PG_EXCEPTION_DETAIL,
        v_error_hint=PG_EXCEPTION_HINT,
        v_error_context=PG_EXCEPTION_CONTEXT;
      v_report:=jsonb_build_object(
        'status','fail',
        'association_count',v_count,
        'error',v_error,
        'error_detail',v_error_detail,
        'error_hint',v_error_hint,
        'error_context',v_error_context,
        'rollback_mode',true,
        'summary','Synthetic World Nations fixture failed; all fixture writes were rolled back.'
      );
  end;

  select count(*)::integer into v_leaked_users
  from auth.users
  where email like 'ppm-e2e-'||v_fixture_token||'-%@example.invalid';

  select count(*)::integer into v_leaked_associations
  from public.national_associations
  where name like 'E2E '||v_fixture_token||' %';

  if v_leaked_users<>0 or v_leaked_associations<>0 then
    return v_report||jsonb_build_object(
      'status','fail',
      'cleanup_check',jsonb_build_object(
        'leaked_users',v_leaked_users,
        'leaked_associations',v_leaked_associations
      ),
      'summary','Fixture cleanup check failed.'
    );
  end if;

  return v_report||jsonb_build_object(
    'cleanup_check',jsonb_build_object(
      'leaked_users',0,
      'leaked_associations',0
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.world_nations_e2e_validation_core_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_checks jsonb:='[]'::jsonb;
  v_plan jsonb;
  v_mask1 int4range;
  v_mask2 int4range;
  v_passed integer:=0;
  v_failed integer:=0;
  v_condition boolean;
  v_health jsonb;
begin
  v_plan:=public.nations_qualification_plan_v1(50);
  v_condition :=
    jsonb_array_length(coalesce(v_plan->'rounds','[]'::jsonb))=3
    and (v_plan#>>'{rounds,0,entrants_target}')::integer=50
    and (v_plan#>>'{rounds,0,advance_target}')::integer=32
    and (v_plan#>>'{rounds,1,entrants_target}')::integer=32
    and (v_plan#>>'{rounds,1,advance_target}')::integer=16
    and (v_plan#>>'{rounds,2,entrants_target}')::integer=16
    and (v_plan#>>'{rounds,2,advance_target}')::integer=1;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_50_to_32_to_16',
    'passed',v_condition,
    'details',v_plan
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select bool_and(
    coalesce((p->>'finalist_target')::integer,0)=least(n,16)
    and jsonb_array_length(coalesce(p->'rounds','[]'::jsonb))>=2
    and (p#>>array['rounds',(jsonb_array_length(p->'rounds')-1)::text,'round_type'])='world_final'
    and (p#>>array['rounds',(jsonb_array_length(p->'rounds')-1)::text,'entrants_target'])::integer=least(n,16)
  )
  into v_condition
  from (
    select n,public.nations_qualification_plan_v1(n) p
    from unnest(array[5,16,17,25,32,33,40,50,64,65,80,100,128]) n
  ) q;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_scalability_5_to_128',
    'passed',coalesce(v_condition,false),
    'details','Validated representative field sizes from 5 through 128 active Associations.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
    public.calculate_nation_road_race_points_v1(array[1,2,3,4,5])=106
    and public.calculate_nation_road_race_points_v1(array[1])=40;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','road_points_best_three_only',
    'passed',v_condition,
    'details',jsonb_build_object(
      'positions_1_to_5',public.calculate_nation_road_race_points_v1(array[1,2,3,4,5]),
      'expected',106
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
    public.nations_ttt_points_v1(1)=70
    and public.nations_ttt_points_v1(16)=4
    and public.nations_ttt_points_v1(17)=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','ttt_points_curve',
    'passed',v_condition,
    'details',jsonb_build_object(
      'first',public.nations_ttt_points_v1(1),
      'sixteenth',public.nations_ttt_points_v1(16),
      'outside_curve',public.nations_ttt_points_v1(17)
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_mask1:=private.national_coach_masked_overall_bounds_v1(
    '11111111-1111-1111-1111-111111111111'::uuid,82,1
  );
  v_mask2:=private.national_coach_masked_overall_bounds_v1(
    '11111111-1111-1111-1111-111111111111'::uuid,82,1
  );
  v_condition :=
    v_mask1=v_mask2
    and v_mask1 @> 82
    and (upper(v_mask1)-lower(v_mask1)-1)<=3;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','masked_overall_stable_and_narrow',
    'passed',v_condition,
    'details',jsonb_build_object(
      'first_call',v_mask1::text,
      'second_call',v_mask2::text,
      'true_overall',82
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select
    exists(select 1 from public.national_association_config where id=true and has_treasury=false)
    and exists(select 1 from public.national_team_standard_assets where asset_key='team_car' and asset_level=5 and quantity=10 and is_active)
    and (select count(*) from public.national_team_standard_equipment where is_active)>=18
    and exists(select 1 from public.national_team_standard_supplies where supply_key='energy_gel' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='water_bottle' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='nutrition_pack' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='race_jersey_complete' and quantity=50 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='rain_jacket' and quantity=50 and is_active)
  into v_condition;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','standard_package_no_treasury',
    'passed',coalesce(v_condition,false),
    'details','No Association treasury; fixed National Team assets, equipment and supplies are system-provided.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select
    candidate_registration_open_month=1
    and candidate_registration_open_day=1
    and candidate_registration_close_month=1
    and candidate_registration_close_day=10
    and round1_open_month=1
    and round1_open_day=10
    and round1_close_month=1
    and round1_close_day=20
    and runoff_open_month=1
    and runoff_open_day=20
    and runoff_close_month=1
    and runoff_close_day=27
    and repeat_runoff_days=7
  into v_condition
  from public.national_association_config
  where id=true;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','january_election_calendar',
    'passed',coalesce(v_condition,false),
    'details','Candidature 1-10 Jan; first vote 10-20 Jan; runoff 20-27 Jan; repeated 7-day runoff if needed.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select
    to_regprocedure('public.ensure_nations_group_event_race_v1(uuid)') is not null
    and to_regprocedure('public.sync_nations_group_event_participants_v1(uuid)') is not null
    and to_regprocedure('public.process_nations_group_results_v1(uuid)') is not null
    and to_regprocedure('public.refresh_nations_group_partial_scores_v1(uuid)') is not null
    and exists(
      select 1 from cron.job
      where jobname='national-association-nations-runtime-v1'
        and active
        and command ilike '%process_national_association_nations_runtime_v4%'
    )
  into v_condition;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','race_runtime_wiring',
    'passed',coalesce(v_condition,false),
    'details','Race creation, participant sync, result processing, live score refresh and 15-minute runtime v4 are installed.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select count(*)=17
  into v_condition
  from public.notification_types
  where code in (
    'NATIONAL_ASSOCIATION_ACTIVATED',
    'NATIONAL_COACH_ELECTION_OPEN',
    'NATIONAL_COACH_VOTING_OPEN',
    'NATIONAL_COACH_RUNOFF_OPEN',
    'NATIONAL_COACH_ELECTED',
    'NATIONAL_TEAM_CALLUP_RECEIVED',
    'NATIONAL_TEAM_CALLUP_RESPONSE',
    'NATIONAL_TEAM_SQUAD_CONFIRMED',
    'NATIONAL_TEAM_DUTY_STARTED',
    'NATIONAL_TEAM_DUTY_COMPLETED',
    'NATIONS_QUALIFICATION_DRAW',
    'NATIONS_RACE_RESULT',
    'NATIONS_ADVANCED',
    'NATIONS_ELIMINATED',
    'NATIONS_WORLD_FINAL_QUALIFIED',
    'NATIONS_FINAL_RESULT',
    'NATIONS_CHAMPION'
  ) and is_active;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','notification_lifecycle',
    'passed',coalesce(v_condition,false),
    'details','Association, election, call-up, National Duty, race-day, advancement and final-result notification types are active.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_health:=public.check_nations_operations_health_v1();
  v_condition:=coalesce(v_health->>'status','error')='success';
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','current_runtime_health',
    'passed',v_condition,
    'details',v_health
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','exact_tie_after_all_four_tiebreaks',
    'passed',false,
    'severity','design_decision_required',
    'details','If nations remain exactly tied after total points, race wins, podiums, TTT placing and best Day 3 rider placing, finalize_nations_group_v1 returns unresolved_tie_at_cutoff. A final sporting fallback rule is still required.'
  ));
  v_failed:=v_failed+1;

  return jsonb_build_object(
    'status',case when v_failed=0 then 'passed' else 'attention_required' end,
    'mode','non_destructive_validation',
    'passed_checks',v_passed,
    'failed_checks',v_failed,
    'checks',v_checks
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.world_nations_e2e_validation_core_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_checks jsonb:='[]'::jsonb;
  v_plan jsonb;
  v_mask1 int4range;
  v_mask2 int4range;
  v_passed integer:=0;
  v_failed integer:=0;
  v_condition boolean;
  v_health jsonb;
  v_cfg public.national_association_config%rowtype;
begin
  select * into v_cfg
  from public.national_association_config
  where id=true;

  v_plan:=public.nations_qualification_plan_v1(50);
  v_condition :=
    jsonb_array_length(coalesce(v_plan->'rounds','[]'::jsonb))=3
    and (v_plan#>>'{rounds,0,entrants_target}')::integer=50
    and (v_plan#>>'{rounds,0,advance_target}')::integer=32
    and (v_plan#>>'{rounds,1,entrants_target}')::integer=32
    and (v_plan#>>'{rounds,1,advance_target}')::integer=16
    and (v_plan#>>'{rounds,2,entrants_target}')::integer=16
    and (v_plan#>>'{rounds,2,advance_target}')::integer=1;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_50_to_32_to_16',
    'passed',v_condition,
    'details',v_plan
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select bool_and(
    coalesce((p->>'finalist_target')::integer,0)=least(n,16)
    and jsonb_array_length(coalesce(p->'rounds','[]'::jsonb))>=2
    and (p#>>array['rounds',(jsonb_array_length(p->'rounds')-1)::text,'round_type'])='world_final'
    and (p#>>array['rounds',(jsonb_array_length(p->'rounds')-1)::text,'entrants_target'])::integer=least(n,16)
  )
  into v_condition
  from (
    select n,public.nations_qualification_plan_v1(n) p
    from unnest(array[5,16,17,25,32,33,40,50,64,65,80,100,128]) n
  ) q;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','qualification_scalability_5_to_128',
    'passed',coalesce(v_condition,false),
    'details','Representative field sizes from 5 through 128 preserve the dynamic qualification pyramid and World Final target.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
    public.calculate_nation_road_race_points_v1(array[1,2,3,4,5])=106
    and public.calculate_nation_road_race_points_v1(array[1])=40;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','road_points_best_three_only',
    'passed',v_condition,
    'details',jsonb_build_object(
      'positions_1_to_5',public.calculate_nation_road_race_points_v1(array[1,2,3,4,5]),
      'expected',106
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
    public.nations_ttt_points_v1(1)=70
    and public.nations_ttt_points_v1(16)=4
    and public.nations_ttt_points_v1(17)=0;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','ttt_points_curve',
    'passed',v_condition,
    'details',jsonb_build_object(
      'first',public.nations_ttt_points_v1(1),
      'sixteenth',public.nations_ttt_points_v1(16),
      'outside_curve',public.nations_ttt_points_v1(17)
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_mask1:=private.national_coach_masked_overall_bounds_v1(
    '11111111-1111-1111-1111-111111111111'::uuid,82,1
  );
  v_mask2:=private.national_coach_masked_overall_bounds_v1(
    '11111111-1111-1111-1111-111111111111'::uuid,82,1
  );
  v_condition :=
    v_mask1=v_mask2
    and v_mask1 @> 82
    and (upper(v_mask1)-lower(v_mask1)-1)<=v_cfg.masked_overall_span;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','masked_overall_stable_and_narrow',
    'passed',v_condition,
    'details',jsonb_build_object(
      'first_call',v_mask1::text,
      'second_call',v_mask2::text,
      'true_overall',82,
      'configured_span',v_cfg.masked_overall_span
    )
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select
    not exists(
      select 1
      from information_schema.tables
      where table_schema='public'
        and table_name ilike 'national_association%treasury%'
    )
    and exists(
      select 1 from public.national_team_standard_assets
      where asset_key='team_car' and asset_level=5 and quantity=10 and is_active
    )
    and (select count(*) from public.national_team_standard_equipment where is_active)=18
    and exists(select 1 from public.national_team_standard_supplies where supply_key='energy_gel' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='water_bottle' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='nutrition_pack' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='race_jersey_complete' and quantity=50 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='rain_jacket' and quantity=50 and is_active)
  into v_condition;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','standard_package_no_treasury',
    'passed',coalesce(v_condition,false),
    'details','No Association treasury table exists; the fixed National Team package is system-provided.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_condition :=
    v_cfg.minimum_active_members=5
    and v_cfg.annual_registration_start_month=1
    and v_cfg.annual_registration_start_day=1
    and v_cfg.annual_registration_close_month=1
    and v_cfg.annual_registration_close_day=10
    and v_cfg.annual_round1_close_month=1
    and v_cfg.annual_round1_close_day=20
    and v_cfg.annual_round2_close_month=1
    and v_cfg.annual_round2_close_day=27
    and v_cfg.repeated_runoff_days=7
    and v_cfg.national_squad_size=10
    and v_cfg.national_lineup_size=7
    and v_cfg.max_lineup_changes=3
    and v_cfg.max_active_callups=15
    and v_cfg.callup_response_days=7;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','association_election_and_team_config',
    'passed',coalesce(v_condition,false),
    'details',jsonb_build_object(
      'minimum_members',v_cfg.minimum_active_members,
      'registration','Jan 1-10',
      'round1','Jan 10-20',
      'round2','Jan 20-27',
      'repeat_runoff_days',v_cfg.repeated_runoff_days,
      'squad_size',v_cfg.national_squad_size,
      'lineup_size',v_cfg.national_lineup_size,
      'max_lineup_changes',v_cfg.max_lineup_changes
    )
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select
    to_regprocedure('public.ensure_nations_group_event_race_v1(uuid)') is not null
    and to_regprocedure('public.sync_nations_group_event_participants_v1(uuid)') is not null
    and to_regprocedure('public.process_nations_group_results_v1(uuid)') is not null
    and to_regprocedure('public.refresh_nations_group_partial_scores_v1(uuid)') is not null
    and exists(
      select 1 from cron.job
      where jobname='national-association-nations-runtime-v1'
        and active
        and command ilike '%process_national_association_nations_runtime_v4%'
    )
  into v_condition;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','race_runtime_wiring',
    'passed',coalesce(v_condition,false),
    'details','Race creation, participant sync, result processing, live score refresh and runtime v4 are installed.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  select count(*)=17
  into v_condition
  from public.notification_types
  where code in (
    'NATIONAL_ASSOCIATION_ACTIVATED',
    'NATIONAL_COACH_ELECTION_OPEN',
    'NATIONAL_COACH_VOTING_OPEN',
    'NATIONAL_COACH_RUNOFF_OPEN',
    'NATIONAL_COACH_ELECTED',
    'NATIONAL_TEAM_CALLUP_RECEIVED',
    'NATIONAL_TEAM_CALLUP_RESPONSE',
    'NATIONAL_TEAM_SQUAD_CONFIRMED',
    'NATIONAL_TEAM_DUTY_STARTED',
    'NATIONAL_TEAM_DUTY_COMPLETED',
    'NATIONS_QUALIFICATION_DRAW',
    'NATIONS_RACE_RESULT',
    'NATIONS_ADVANCED',
    'NATIONS_ELIMINATED',
    'NATIONS_WORLD_FINAL_QUALIFIED',
    'NATIONS_FINAL_RESULT',
    'NATIONS_CHAMPION'
  ) and is_active;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','notification_lifecycle',
    'passed',coalesce(v_condition,false),
    'details','Association, election, call-up, National Duty, race-day, advancement and final-result notification types are active.'
  ));
  if coalesce(v_condition,false) then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_health:=public.check_nations_operations_health_v1();
  v_condition:=coalesce(v_health->>'status','error')='success';
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','current_runtime_health',
    'passed',v_condition,
    'details',v_health
  ));
  if v_condition then v_passed:=v_passed+1; else v_failed:=v_failed+1; end if;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'key','exact_tie_after_all_four_tiebreaks',
    'passed',false,
    'severity','design_decision_required',
    'details','An exact tie after total points, race wins, podiums, TTT placing and best Day 3 rider placing still returns unresolved_tie_at_cutoff. A final sporting fallback rule is still required.'
  ));
  v_failed:=v_failed+1;

  return jsonb_build_object(
    'status',case when v_failed=0 then 'passed' else 'attention_required' end,
    'mode','non_destructive_validation',
    'passed_checks',v_passed,
    'failed_checks',v_failed,
    'checks',v_checks
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.world_nations_e2e_validation_core_v3()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb:=private.world_nations_e2e_validation_core_v2();
  v_check jsonb;
  v_checks jsonb:='[]'::jsonb;
  v_package_ok boolean;
  v_passed integer:=0;
  v_failed integer:=0;
begin
  select
    not exists(
      select 1
      from information_schema.tables
      where table_schema='public'
        and table_name ilike 'national_association%treasury%'
    )
    and exists(
      select 1 from public.national_team_standard_assets
      where asset_key='team_car' and asset_level=5 and quantity=10 and is_active
    )
    and (select count(*) from public.national_team_standard_equipment where is_active)=18
    and exists(select 1 from public.national_team_standard_supplies where supply_key='energy_gels' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='bidons_water_bottles' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='nutrition_packs' and quantity=250 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='race_jersey_complete' and quantity=50 and is_active)
    and exists(select 1 from public.national_team_standard_supplies where supply_key='rain_jackets' and quantity=50 and is_active)
  into v_package_ok;

  for v_check in
    select value from jsonb_array_elements(v_result->'checks')
  loop
    if v_check->>'key'='standard_package_no_treasury' then
      v_check:=jsonb_set(v_check,'{passed}',to_jsonb(coalesce(v_package_ok,false)));
      v_check:=jsonb_set(
        v_check,
        '{details}',
        to_jsonb('No Association treasury exists. 10 level-5 team cars, 18 fixed equipment models, 250 bidons, 250 gels, 250 nutrition packs, 50 jerseys and 50 rain jackets are system-provided.'::text)
      );
    end if;

    v_checks:=v_checks||jsonb_build_array(v_check);
    if coalesce((v_check->>'passed')::boolean,false) then
      v_passed:=v_passed+1;
    else
      v_failed:=v_failed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'status',case when v_failed=0 then 'passed' else 'attention_required' end,
    'mode','non_destructive_validation',
    'passed_checks',v_passed,
    'failed_checks',v_failed,
    'checks',v_checks
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.nations_day3_rank_vector_v1(p_group_id uuid, p_association_id uuid)
 RETURNS integer[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stage_id uuid;
  v_team_id uuid;
  v_vector integer[];
begin
  select e.stage_id
  into v_stage_id
  from public.nations_group_events e
  where e.group_id=p_group_id
    and e.status='completed'
    and (e.race_day=3 or e.race_type='mountain_road_race')
    and e.stage_id is not null
  order by
    case when e.race_day=3 then 0 else 1 end,
    e.race_day desc
  limit 1;

  select i.technical_club_id
  into v_team_id
  from public.national_association_race_team_identities i
  where i.association_id=p_association_id
  limit 1;

  if v_stage_id is null or v_team_id is null then
    return array_fill(999999,array[7]);
  end if;

  with ranked as (
    select
      r.rank,
      row_number() over(order by r.rank,r.rider_id)::integer as rn
    from public.race_stage_results r
    where r.stage_id=v_stage_id
      and r.team_id=v_team_id
      and r.status='finished'
      and r.rank is not null
  ),
  slots as (
    select generate_series(1,7)::integer as rn
  )
  select array_agg(coalesce(r.rank,999999) order by s.rn)
  into v_vector
  from slots s
  left join ranked r on r.rn=s.rn;

  return coalesce(v_vector,array_fill(999999,array[7]));
end;
$function$
;

CREATE OR REPLACE FUNCTION private.world_nations_e2e_validation_core_v4()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb:=private.world_nations_e2e_validation_core_v3();
  v_check jsonb;
  v_checks jsonb:='[]'::jsonb;
  v_tiebreak_ok boolean;
  v_passed integer:=0;
  v_failed integer:=0;
begin
  select
    to_regprocedure('private.nations_day3_rank_vector_v1(uuid,uuid)') is not null
    and pg_get_functiondef('public.finalize_nations_group_v1(uuid)'::regprocedure)
      ilike '%day3_rider_7%'
    and pg_get_functiondef('public.finalize_nations_group_v1(uuid)'::regprocedure)
      ilike '%day3_combined_rank_sum%'
  into v_tiebreak_ok;

  for v_check in
    select value
    from jsonb_array_elements(v_result->'checks')
  loop
    if v_check->>'key'='exact_tie_after_all_four_tiebreaks' then
      v_check:=jsonb_build_object(
        'key','extended_sporting_tiebreak',
        'passed',coalesce(v_tiebreak_ok,false),
        'details','After the original tie-breaks, the engine compares the 2nd through 7th Day 3 riders in finishing order, then the combined finishing-position total of all seven riders. No random, financial or prestige-based tie-break is used.'
      );
    end if;

    v_checks:=v_checks||jsonb_build_array(v_check);
    if coalesce((v_check->>'passed')::boolean,false) then
      v_passed:=v_passed+1;
    else
      v_failed:=v_failed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'status',case when v_failed=0 then 'passed' else 'attention_required' end,
    'mode','non_destructive_validation',
    'passed_checks',v_passed,
    'failed_checks',v_failed,
    'checks',v_checks
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.run_nations_e2e_fixture_legacy_sim_v2(p_association_count integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_report jsonb:='{}'::jsonb;
begin
  select to_jsonb(c)
  into v_before
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id=true;

  begin
    update public.race_engine_runtime_control_v1
    set active_engine='legacy_sql',
        legacy_execution_enabled=true,
        typescript_execution_enabled=false,
        typescript_lifecycle_enabled=false,
        updated_at=now(),
        updated_by='world_nations_e2e_fixture',
        notes=coalesce(notes,'')||E'\nTemporary rollback-only World Nations E2E simulation mode.'
    where singleton_id=true;

    perform set_config('app.race_engine_writer_family','legacy',true);

    v_report:=private.run_nations_e2e_fixture_core_v1(p_association_count);

    raise exception using
      errcode='Z0002',
      message='WORLD_NATIONS_OUTER_FIXTURE_ROLLBACK';
  exception
    when sqlstate 'Z0002' then
      null;
  end;

  select to_jsonb(c)
  into v_after
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id=true;

  return coalesce(v_report,'{}'::jsonb)
    || jsonb_build_object(
      'engine_fixture_mode','rollback_only_legacy_sql_simulator',
      'runtime_control_restored',v_after=v_before
    );
end;
$function$
;

