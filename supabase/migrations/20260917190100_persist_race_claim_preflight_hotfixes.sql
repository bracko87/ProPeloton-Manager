-- Persist the production claim/preflight hotfixes applied during the 2026-09-17 incident.
-- Previous-stage readiness is based on an authoritative completed run, not a large JSON publication flag.

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_previous_stage_id uuid;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_existing_run public.race_stage_simulation_runs%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_run_id uuid;
  v_payload jsonb;
  v_startlist_readiness jsonb;
  v_startlist_reconciliation jsonb;
  v_sporting_readiness jsonb;
  v_sporting_reconciliation jsonb;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||p_stage_id::text,0));

  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or v_control.active_engine<>'typescript_v1' or not v_control.typescript_execution_enabled or v_control.legacy_execution_enabled
     or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','reason','phase11b_lifecycle_not_enabled');
  end if;
  if v_control.typescript_activation_game_at is null then return jsonb_build_object('status','disabled','reason','production_activation_game_boundary_missing'); end if;

  select stage.id,stage.race_id,stage.stage_number,stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,
    lower(coalesce(stage.stage_format,'road_race')) as stage_format,coalesce(stage.weather_cancelled,false) as weather_cancelled
  into v_stage from public.race_stages stage where stage.id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;
  if v_stage.weather_cancelled then return jsonb_build_object('status','skipped','reason','weather_cancelled','stage_id',p_stage_id); end if;

  v_stage_start_game_at := v_stage.stage_date::timestamp + make_interval(hours=>coalesce(v_stage.planned_start_hour_number,12),mins=>coalesce(v_stage.planned_start_minute,0));
  v_calculation_due_game_at := v_stage_start_game_at - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  if v_stage_start_game_at<v_control.typescript_activation_game_at then
    return jsonb_build_object('status','blocked','reason','before_phase11b_activation_boundary','stage_id',p_stage_id,'stage_start_game_at',v_stage_start_game_at,'activation_game_at',v_control.typescript_activation_game_at);
  end if;
  if v_current_game_at<v_calculation_due_game_at then
    return jsonb_build_object('status','not_due','stage_id',p_stage_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at);
  end if;

  v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
    v_sporting_reconciliation := public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id);
    v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
    if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
      return jsonb_build_object('status','blocked','reason','stage_sporting_points_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,
        'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation);
    end if;
  else
    v_sporting_reconciliation := jsonb_build_object('status','not_needed','stage_id',p_stage_id);
  end if;

  v_startlist_readiness := public.race_startlist_engine_readiness_v1(v_stage.race_id);
  if not coalesce((v_startlist_readiness->>'ready')::boolean,false) then
    return jsonb_build_object('status','blocked','reason','race_startlist_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,'startlist_readiness',v_startlist_readiness);
  end if;
  v_startlist_reconciliation := public.reconcile_race_startlist_engine_readiness_v1(v_stage.race_id);

  select previous.id into v_previous_stage_id from public.race_stages previous
  where previous.race_id=v_stage.race_id and previous.stage_number<v_stage.stage_number and not coalesce(previous.weather_cancelled,false)
  order by previous.stage_number desc limit 1;
  if v_previous_stage_id is not null and not exists(
    select 1 from public.race_stage_authoritative_runs authority
    join public.race_stage_simulation_runs previous_run on previous_run.id=authority.simulation_run_id
    where authority.stage_id=v_previous_stage_id and authority.engine_version='race_engine_ts_v1'
      and authority.simulation_mode='deterministic_road_race_v1' and previous_run.status='completed'
  ) then
    return jsonb_build_object('status','blocked','reason','previous_stage_not_published','stage_id',p_stage_id,'previous_stage_id',v_previous_stage_id);
  end if;

  select run.* into v_existing_run from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed') and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
  order by run.updated_at desc,run.created_at desc,run.id desc limit 1;
  if found then
    return jsonb_build_object('status',case when coalesce(v_existing_run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1' then 'already_calculated' else 'already_claimed' end,
      'stage_id',p_stage_id,'simulation_run_id',v_existing_run.id,'run_status',v_existing_run.status);
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);
  insert into public.race_stage_simulation_runs(race_id,stage_id,status,engine_version,simulation_mode,started_at,input_snapshot_json,result_summary_json)
  values(v_stage.race_id,p_stage_id,'running','race_engine_ts_v1','deterministic_road_race_v1',clock_timestamp(),'{}'::jsonb,
    jsonb_build_object('calculation_contract','phase11b_claim_pending_v1','calculation_status','claimed','claimed_at_real',clock_timestamp(),
      'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,'official_outputs_persisted',false,
      'phase11_persistence_applied',false,'results_published',false,'verification_only',false,'startlist_readiness',v_startlist_readiness,
      'startlist_reconciliation',v_startlist_reconciliation,'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation))
  returning id into v_run_id;

  insert into public.race_stage_automation_state(stage_id,race_id,scheduled_game_at,last_status,simulation_run_id,attempt_count,last_checked_at,last_started_at,last_error,details,updated_at)
  values(p_stage_id,v_stage.race_id,v_stage_start_game_at,'calculating',v_run_id,1,clock_timestamp(),clock_timestamp(),null,
    jsonb_build_object('contract','phase11b_universal_production_lifecycle_v1','calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
      'replay_duration_real_seconds',coalesce(v_control.typescript_replay_duration_real_seconds,900),'worker_version','netlify_phase11b_v1','verification_only',false,
      'startlist_readiness_model','snapshot_invariants_v1','sporting_point_readiness_model','profile_catalogue_counts_v1'),clock_timestamp())
  on conflict(stage_id) do update set race_id=excluded.race_id,scheduled_game_at=excluded.scheduled_game_at,last_status=excluded.last_status,
    simulation_run_id=excluded.simulation_run_id,attempt_count=public.race_stage_automation_state.attempt_count+1,last_checked_at=excluded.last_checked_at,
    last_started_at=excluded.last_started_at,last_error=null,details=coalesce(public.race_stage_automation_state.details,'{}'::jsonb)||excluded.details,updated_at=excluded.updated_at;

  v_payload := public.universal_race_stage_get_calculation_payload_v1(p_stage_id);
  return jsonb_build_object('status','claimed','contract','universal_race_stage_calculation_claim_v2_phase11b','stage_id',p_stage_id,'race_id',v_stage.race_id,
    'simulation_run_id',v_run_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'stage_format',v_stage.stage_format,'startlist_readiness',v_startlist_readiness,'sporting_point_readiness',v_sporting_readiness,
    'sporting_point_reconciliation',v_sporting_reconciliation,'payload',v_payload);
end;
$function$;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v2_impl(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_previous_stage_id uuid;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_existing_run public.race_stage_simulation_runs%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_run_id uuid;
  v_startlist_readiness jsonb;
  v_startlist_reconciliation jsonb;
  v_sporting_readiness jsonb;
  v_sporting_reconciliation jsonb;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||p_stage_id::text,0));

  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or v_control.active_engine<>'typescript_v1' or not v_control.typescript_execution_enabled or v_control.legacy_execution_enabled
     or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','reason','phase11b_lifecycle_not_enabled');
  end if;
  if v_control.typescript_activation_game_at is null then return jsonb_build_object('status','disabled','reason','production_activation_game_boundary_missing'); end if;

  select stage.id,stage.race_id,stage.stage_number,stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,
    lower(coalesce(stage.stage_format,'road_race')) as stage_format,coalesce(stage.weather_cancelled,false) as weather_cancelled
  into v_stage from public.race_stages stage where stage.id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;
  if v_stage.weather_cancelled then return jsonb_build_object('status','skipped','reason','weather_cancelled','stage_id',p_stage_id); end if;

  v_stage_start_game_at := v_stage.stage_date::timestamp + make_interval(hours=>coalesce(v_stage.planned_start_hour_number,12),mins=>coalesce(v_stage.planned_start_minute,0));
  v_calculation_due_game_at := v_stage_start_game_at - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  if v_stage_start_game_at<v_control.typescript_activation_game_at then
    return jsonb_build_object('status','blocked','reason','before_phase11b_activation_boundary','stage_id',p_stage_id,'stage_start_game_at',v_stage_start_game_at,'activation_game_at',v_control.typescript_activation_game_at);
  end if;
  if v_current_game_at<v_calculation_due_game_at then
    return jsonb_build_object('status','not_due','stage_id',p_stage_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at);
  end if;

  v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
    v_sporting_reconciliation := public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id);
    v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
    if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
      return jsonb_build_object('status','blocked','reason','stage_sporting_points_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,
        'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation);
    end if;
  else
    v_sporting_reconciliation := jsonb_build_object('status','not_needed','stage_id',p_stage_id);
  end if;

  v_startlist_readiness := public.race_startlist_engine_readiness_v1(v_stage.race_id);
  if not coalesce((v_startlist_readiness->>'ready')::boolean,false) then
    return jsonb_build_object('status','blocked','reason','race_startlist_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,'startlist_readiness',v_startlist_readiness);
  end if;
  v_startlist_reconciliation := public.reconcile_race_startlist_engine_readiness_v1(v_stage.race_id);

  select previous.id into v_previous_stage_id from public.race_stages previous
  where previous.race_id=v_stage.race_id and previous.stage_number<v_stage.stage_number and not coalesce(previous.weather_cancelled,false)
  order by previous.stage_number desc limit 1;
  if v_previous_stage_id is not null and not exists(
    select 1 from public.race_stage_authoritative_runs authority
    join public.race_stage_simulation_runs previous_run on previous_run.id=authority.simulation_run_id
    where authority.stage_id=v_previous_stage_id and authority.engine_version='race_engine_ts_v1'
      and authority.simulation_mode='deterministic_road_race_v1' and previous_run.status='completed'
  ) then
    return jsonb_build_object('status','blocked','reason','previous_stage_not_published','stage_id',p_stage_id,'previous_stage_id',v_previous_stage_id);
  end if;

  select run.* into v_existing_run from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed') and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
  order by run.updated_at desc,run.created_at desc,run.id desc limit 1;
  if found then
    return jsonb_build_object('status',case when coalesce(v_existing_run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1' then 'already_calculated' else 'already_claimed' end,
      'stage_id',p_stage_id,'simulation_run_id',v_existing_run.id,'run_status',v_existing_run.status);
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);
  insert into public.race_stage_simulation_runs(race_id,stage_id,status,engine_version,simulation_mode,started_at,input_snapshot_json,result_summary_json)
  values(v_stage.race_id,p_stage_id,'running','race_engine_ts_v1','deterministic_road_race_v1',clock_timestamp(),'{}'::jsonb,
    jsonb_build_object('calculation_contract','phase11b_claim_pending_v1','calculation_status','claimed','claimed_at_real',clock_timestamp(),
      'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,'official_outputs_persisted',false,
      'phase11_persistence_applied',false,'results_published',false,'verification_only',false,'startlist_readiness',v_startlist_readiness,
      'startlist_reconciliation',v_startlist_reconciliation,'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation))
  returning id into v_run_id;

  insert into public.race_stage_automation_state(stage_id,race_id,scheduled_game_at,last_status,simulation_run_id,attempt_count,last_checked_at,last_started_at,last_error,details,updated_at)
  values(p_stage_id,v_stage.race_id,v_stage_start_game_at,'calculating',v_run_id,1,clock_timestamp(),clock_timestamp(),null,
    jsonb_build_object('contract','phase11b_universal_production_lifecycle_v2_split_payload','calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
      'replay_duration_real_seconds',coalesce(v_control.typescript_replay_duration_real_seconds,900),'worker_version','supabase_edge_phase11b_split_payload_v2','verification_only',false,
      'startlist_readiness_model','snapshot_invariants_v1','sporting_point_readiness_model','profile_catalogue_counts_v1'),clock_timestamp())
  on conflict(stage_id) do update set race_id=excluded.race_id,scheduled_game_at=excluded.scheduled_game_at,last_status=excluded.last_status,
    simulation_run_id=excluded.simulation_run_id,attempt_count=public.race_stage_automation_state.attempt_count+1,last_checked_at=excluded.last_checked_at,
    last_started_at=excluded.last_started_at,last_error=null,details=coalesce(public.race_stage_automation_state.details,'{}'::jsonb)||excluded.details,updated_at=excluded.updated_at;

  return jsonb_build_object('status','claimed','contract','universal_race_stage_calculation_claim_v3_split_payload','stage_id',p_stage_id,'race_id',v_stage.race_id,
    'simulation_run_id',v_run_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'stage_format',v_stage.stage_format,'startlist_readiness',v_startlist_readiness,'sporting_point_readiness',v_sporting_readiness,
    'sporting_point_reconciliation',v_sporting_reconciliation,'payload_deferred',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.universal_race_stage_preflight_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_previous_stage_id uuid;
  v_previous_stage_published boolean := true;
  v_startlist jsonb := '{}'::jsonb;
  v_sporting_points jsonb := '{}'::jsonb;
  v_authoritative_count integer := 0;
  v_active_run_count integer := 0;
  v_recent_failed_count integer := 0;
  v_status text;
  v_reason text;
begin
  if p_stage_id is null then
    return jsonb_build_object('status','BLOCKED','reason','stage_id_required');
  end if;

  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;

  select s.id,s.race_id,s.stage_number,s.stage_date,s.name,
    s.planned_start_hour_number,s.planned_start_minute,
    coalesce(s.weather_cancelled,false) as weather_cancelled,
    r.name as race_name,r.status as race_status
  into v_stage
  from public.race_stages s join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if not found then return jsonb_build_object('status','BLOCKED','reason','stage_not_found','stage_id',p_stage_id); end if;

  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  v_stage_start_game_at := v_stage.stage_date::timestamp + make_interval(hours=>coalesce(v_stage.planned_start_hour_number,12),mins=>coalesce(v_stage.planned_start_minute,0));
  v_calculation_due_game_at := v_stage_start_game_at - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  v_startlist := public.race_startlist_engine_readiness_v1(v_stage.race_id);
  v_sporting_points := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);

  select p.id into v_previous_stage_id from public.race_stages p
  where p.race_id=v_stage.race_id and p.stage_number<v_stage.stage_number and not coalesce(p.weather_cancelled,false)
  order by p.stage_number desc limit 1;

  if v_previous_stage_id is not null then
    select exists(
      select 1 from public.race_stage_authoritative_runs a
      join public.race_stage_simulation_runs run on run.id=a.simulation_run_id
      where a.stage_id=v_previous_stage_id and a.engine_version='race_engine_ts_v1'
        and a.simulation_mode='deterministic_road_race_v1' and run.status='completed'
    ) into v_previous_stage_published;
  end if;

  select count(*)::integer into v_authoritative_count from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id;
  select count(*)::integer into v_active_run_count from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed') and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1');
  select count(*)::integer into v_recent_failed_count from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status='failed' and run.failed_at is not null and run.failed_at>clock_timestamp()-interval '10 minutes';

  if v_stage.weather_cancelled then v_status:='SKIPPED'; v_reason:='weather_cancelled';
  elsif v_control.singleton_id is null or v_control.active_engine<>'typescript_v1' or not coalesce(v_control.typescript_execution_enabled,false)
     or not coalesce(v_control.typescript_lifecycle_enabled,false) or coalesce(v_control.legacy_execution_enabled,false) then
    v_status:='BLOCKED'; v_reason:='universal_engine_control_disabled';
  elsif v_stage_start_game_at<v_control.typescript_activation_game_at then v_status:='BLOCKED'; v_reason:='before_activation_boundary';
  elsif v_authoritative_count>0 then v_status:='DONE'; v_reason:='authoritative_run_exists';
  elsif v_active_run_count>0 then v_status:='IN_PROGRESS'; v_reason:='universal_run_exists';
  elsif not coalesce((v_sporting_points->>'ready')::boolean,false) then v_status:='BLOCKED'; v_reason:='sporting_points_'||coalesce(v_sporting_points->>'reason','not_ready');
  elsif v_recent_failed_count>0 then v_status:='RETRY_COOLDOWN'; v_reason:='recent_failed_run';
  elsif not coalesce((v_startlist->>'ready')::boolean,false) then
    if v_current_game_at<v_calculation_due_game_at then v_status:='NORMAL_PENDING'; v_reason:=coalesce(v_startlist->>'reason','startlist_pending');
    else v_status:='BLOCKED'; v_reason:='startlist_'||coalesce(v_startlist->>'reason','not_ready'); end if;
  elsif v_previous_stage_id is not null and not v_previous_stage_published then
    if v_current_game_at<v_calculation_due_game_at then v_status:='NORMAL_PENDING'; v_reason:='waiting_previous_stage';
    else v_status:='BLOCKED'; v_reason:='previous_stage_not_published'; end if;
  elsif v_current_game_at<v_calculation_due_game_at then v_status:='READY'; v_reason:='ready_when_due';
  else v_status:='READY'; v_reason:='ready_to_claim'; end if;

  return jsonb_build_object(
    'status',v_status,'reason',v_reason,'stage_id',p_stage_id,'race_id',v_stage.race_id,'race_name',v_stage.race_name,
    'stage_number',v_stage.stage_number,'stage_name',v_stage.name,'race_status',v_stage.race_status,
    'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'previous_stage_id',v_previous_stage_id,'previous_stage_published',v_previous_stage_published,
    'startlist_readiness',v_startlist,'sporting_point_readiness',v_sporting_points,
    'authoritative_runs',v_authoritative_count,'active_universal_runs',v_active_run_count,'recent_failed_runs',v_recent_failed_count
  );
end;
$function$;
