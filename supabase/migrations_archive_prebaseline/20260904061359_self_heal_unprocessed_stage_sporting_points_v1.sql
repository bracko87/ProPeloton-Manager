create or replace function public.race_stage_sporting_point_profile_readiness_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_profile_found boolean := false;
  v_stage_sprint_count integer := 0;
  v_stage_kom_count integer := 0;
  v_profile_sprint_count integer := 0;
  v_profile_kom_count integer := 0;
  v_canonical_sprint_count integer := 0;
  v_canonical_kom_count integer := 0;
  v_start_count integer := 0;
  v_finish_count integer := 0;
  v_visible_sources_match boolean := false;
  v_catalogue_counts_match boolean := false;
  v_ready boolean := false;
  v_reason text;
begin
  if p_stage_id is null then
    return jsonb_build_object('ready',false,'reason','stage_id_required');
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then
    return jsonb_build_object('ready',false,'reason','stage_not_found','stage_id',p_stage_id);
  end if;

  select * into v_profile
  from public.race_stage_profile_details
  where stage_id=p_stage_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;
  v_profile_found := found;

  v_stage_sprint_count := case
    when jsonb_typeof(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))='array'
      then jsonb_array_length(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))
    else 0 end;
  v_stage_kom_count := case
    when jsonb_typeof(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))='array'
      then jsonb_array_length(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))
    else 0 end;

  if v_profile_found then
    v_profile_sprint_count := case
      when jsonb_typeof(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))='array'
        then jsonb_array_length(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))
      else 0 end;
    v_profile_kom_count := case
      when jsonb_typeof(coalesce(v_profile.mountain_climbs,'[]'::jsonb))='array'
        then jsonb_array_length(coalesce(v_profile.mountain_climbs,'[]'::jsonb))
      else 0 end;
  else
    v_profile_sprint_count := v_stage_sprint_count;
    v_profile_kom_count := v_stage_kom_count;
  end if;

  select
    count(*) filter (where point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT'))::integer,
    count(*) filter (where point_type='KOM')::integer,
    count(*) filter (where point_type='START')::integer,
    count(*) filter (where point_type='FINISH' or is_finish_point)::integer
  into v_canonical_sprint_count,v_canonical_kom_count,v_start_count,v_finish_count
  from public.race_stage_points
  where stage_id=p_stage_id;

  v_visible_sources_match :=
    (not v_profile_found)
    or (v_stage_sprint_count=v_profile_sprint_count and v_stage_kom_count=v_profile_kom_count);

  v_catalogue_counts_match :=
    v_canonical_sprint_count=v_profile_sprint_count
    and v_canonical_kom_count=v_profile_kom_count
    and v_start_count=1
    and v_finish_count=1;

  v_ready := v_visible_sources_match and v_catalogue_counts_match;
  v_reason := case
    when not v_visible_sources_match then 'stage_json_profile_marker_count_mismatch'
    when v_start_count<>1 then 'canonical_start_count_mismatch'
    when v_finish_count<>1 then 'canonical_finish_count_mismatch'
    when v_canonical_sprint_count<>v_profile_sprint_count then 'canonical_sprint_count_mismatch'
    when v_canonical_kom_count<>v_profile_kom_count then 'canonical_kom_count_mismatch'
    else 'ready'
  end;

  return jsonb_build_object(
    'ready',v_ready,'reason',v_reason,'stage_id',p_stage_id,'profile_found',v_profile_found,
    'stage_json_sprint_count',v_stage_sprint_count,'stage_json_kom_count',v_stage_kom_count,
    'profile_sprint_count',v_profile_sprint_count,'profile_kom_count',v_profile_kom_count,
    'canonical_sprint_count',v_canonical_sprint_count,'canonical_kom_count',v_canonical_kom_count,
    'canonical_start_count',v_start_count,'canonical_finish_count',v_finish_count,
    'visible_sources_match',v_visible_sources_match,'catalogue_counts_match',v_catalogue_counts_match
  );
end;
$$;

create or replace function public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_profile_found boolean := false;
  v_readiness jsonb;
  v_stage_sprints jsonb;
  v_stage_koms jsonb;
  v_profile_sprints jsonb;
  v_profile_koms jsonb;
  v_stage_sprint_count integer := 0;
  v_stage_kom_count integer := 0;
  v_profile_sprint_count integer := 0;
  v_profile_kom_count integer := 0;
  v_marker jsonb;
  v_scoring jsonb;
  v_points jsonb;
  v_bonus jsonb;
  v_idx integer;
  v_sort integer := 20;
  v_km numeric;
  v_category text;
  v_name text;
begin
  if p_stage_id is null then
    return jsonb_build_object('status','blocked','reason','stage_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stage_point_reconcile:'||p_stage_id::text,0));

  if exists (select 1 from public.race_stage_authoritative_runs where stage_id=p_stage_id) then
    return jsonb_build_object('status','not_modified','reason','authoritative_run_exists','stage_id',p_stage_id);
  end if;
  if exists (select 1 from public.race_stage_point_results where stage_id=p_stage_id) then
    return jsonb_build_object('status','blocked','reason','official_point_results_exist','stage_id',p_stage_id);
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then
    return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id);
  end if;

  select * into v_profile
  from public.race_stage_profile_details
  where stage_id=p_stage_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;
  v_profile_found := found;

  v_stage_sprints := case when jsonb_typeof(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))='array'
    then coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb) else '[]'::jsonb end;
  v_stage_koms := case when jsonb_typeof(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))='array'
    then coalesce(v_stage.mountain_climbs_json,'[]'::jsonb) else '[]'::jsonb end;
  v_stage_sprint_count := jsonb_array_length(v_stage_sprints);
  v_stage_kom_count := jsonb_array_length(v_stage_koms);

  if v_profile_found then
    v_profile_sprints := case when jsonb_typeof(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))='array'
      then coalesce(v_profile.intermediate_sprints,'[]'::jsonb) else '[]'::jsonb end;
    v_profile_koms := case when jsonb_typeof(coalesce(v_profile.mountain_climbs,'[]'::jsonb))='array'
      then coalesce(v_profile.mountain_climbs,'[]'::jsonb) else '[]'::jsonb end;
  else
    v_profile_sprints := v_stage_sprints;
    v_profile_koms := v_stage_koms;
  end if;

  v_profile_sprint_count := jsonb_array_length(v_profile_sprints);
  v_profile_kom_count := jsonb_array_length(v_profile_koms);

  if v_stage_sprint_count<>v_profile_sprint_count or v_stage_kom_count<>v_profile_kom_count then
    return jsonb_build_object(
      'status','blocked','reason','stage_json_profile_marker_count_mismatch','stage_id',p_stage_id,
      'stage_json_sprint_count',v_stage_sprint_count,'profile_sprint_count',v_profile_sprint_count,
      'stage_json_kom_count',v_stage_kom_count,'profile_kom_count',v_profile_kom_count
    );
  end if;

  if (select count(*) from public.race_stage_points where stage_id=p_stage_id and point_type='START')<>1 then
    return jsonb_build_object('status','blocked','reason','canonical_start_count_mismatch','stage_id',p_stage_id);
  end if;
  if (select count(*) from public.race_stage_points where stage_id=p_stage_id and (point_type='FINISH' or is_finish_point))<>1 then
    return jsonb_build_object('status','blocked','reason','canonical_finish_count_mismatch','stage_id',p_stage_id);
  end if;

  delete from public.race_stage_points
  where stage_id=p_stage_id and point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT','KOM');

  for v_idx in 0..greatest(v_profile_sprint_count-1,-1) loop
    exit when v_profile_sprint_count=0;
    v_marker := v_profile_sprints->v_idx;
    v_scoring := v_stage_sprints->v_idx;
    v_km := coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_points := coalesce(v_scoring->'points_scheme',v_marker->'points_scheme','[]'::jsonb);
    v_bonus := coalesce(v_scoring->'time_bonus_seconds',v_marker->'time_bonus_seconds','[]'::jsonb);
    if v_km is null or jsonb_typeof(v_points)<>'array' or jsonb_array_length(v_points)=0 then
      raise exception 'Cannot reconcile sprint marker % for stage %: km/points scheme missing.',v_idx+1,p_stage_id;
    end if;
    v_name := coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Sprint '||(v_idx+1)::text);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'INTERMEDIATE_SPRINT',v_km,v_name,null,v_points,v_bonus,false,v_sort,
      jsonb_build_object('source','profile_stage_json_reconciliation_v1','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort := v_sort+10;
  end loop;

  for v_idx in 0..greatest(v_profile_kom_count-1,-1) loop
    exit when v_profile_kom_count=0;
    v_marker := v_profile_koms->v_idx;
    v_scoring := v_stage_koms->v_idx;
    v_km := coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_points := coalesce(v_scoring->'points_scheme',v_marker->'points_scheme','[]'::jsonb);
    v_bonus := coalesce(v_scoring->'time_bonus_seconds',v_marker->'time_bonus_seconds','[]'::jsonb);
    v_category := upper(regexp_replace(coalesce(nullif(v_marker->>'category',''),nullif(v_marker->>'kom_category',''),nullif(v_scoring->>'category',''),nullif(v_scoring->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i'));
    if v_category not in ('HC','1','2','3','4') then v_category:='4'; end if;
    if v_km is null or jsonb_typeof(v_points)<>'array' or jsonb_array_length(v_points)=0 then
      raise exception 'Cannot reconcile KOM marker % for stage %: km/points scheme missing.',v_idx+1,p_stage_id;
    end if;
    v_name := coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Cat '||v_category);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'KOM',v_km,v_name,v_category,v_points,v_bonus,false,v_sort,
      jsonb_build_object('source','profile_stage_json_reconciliation_v1','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort := v_sort+10;
  end loop;

  update public.race_stage_points set sort_order=10,updated_at=clock_timestamp()
  where stage_id=p_stage_id and point_type='START';
  update public.race_stage_points set sort_order=v_sort+10,updated_at=clock_timestamp()
  where stage_id=p_stage_id and (point_type='FINISH' or is_finish_point);

  v_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  return jsonb_build_object(
    'status',case when coalesce((v_readiness->>'ready')::boolean,false) then 'reconciled' else 'blocked' end,
    'reason',coalesce(v_readiness->>'reason','unknown'),'stage_id',p_stage_id,'readiness',v_readiness
  );
exception when others then
  return jsonb_build_object('status','blocked','reason','reconciliation_error','stage_id',p_stage_id,'error',sqlerrm);
end;
$$;

create or replace function public.universal_race_stage_preflight_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
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
  if p_stage_id is null then return jsonb_build_object('status','BLOCKED','reason','stage_id_required'); end if;
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  select s.id,s.race_id,s.stage_number,s.stage_date,s.name,s.planned_start_hour_number,s.planned_start_minute,
    coalesce(s.weather_cancelled,false) as weather_cancelled,r.name as race_name,r.status as race_status
  into v_stage from public.race_stages s join public.races r on r.id=s.race_id where s.id=p_stage_id;
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
    select exists(select 1 from public.race_stage_authoritative_runs a join public.race_stage_simulation_runs run on run.id=a.simulation_run_id
      where a.stage_id=v_previous_stage_id and a.engine_version='race_engine_ts_v1' and a.simulation_mode='deterministic_road_race_v1'
        and run.status='completed' and coalesce((run.result_summary_json->>'results_published')::boolean,false)) into v_previous_stage_published;
  end if;

  select count(*)::integer into v_authoritative_count from public.race_stage_authoritative_runs where stage_id=p_stage_id;
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
    'stage_number',v_stage.stage_number,'stage_name',v_stage.name,'race_status',v_stage.race_status,'current_game_at',v_current_game_at,
    'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,'previous_stage_id',v_previous_stage_id,
    'previous_stage_published',v_previous_stage_published,'startlist_readiness',v_startlist,'sporting_point_readiness',v_sporting_points,
    'authoritative_runs',v_authoritative_count,'active_universal_runs',v_active_run_count,'recent_failed_runs',v_recent_failed_count
  );
end;
$$;

create or replace function public.universal_race_stage_claim_calculation_v1(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
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
    select 1 from public.race_stage_authoritative_runs authority join public.race_stage_simulation_runs previous_run on previous_run.id=authority.simulation_run_id
    where authority.stage_id=v_previous_stage_id and authority.engine_version='race_engine_ts_v1' and authority.simulation_mode='deterministic_road_race_v1'
      and previous_run.status='completed' and coalesce((previous_run.result_summary_json->>'results_published')::boolean,false)
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
$$;

do $$
declare
  v_stage_id uuid;
  v_result jsonb;
begin
  select s.id into v_stage_id
  from public.race_stages s join public.races r on r.id=s.race_id
  where r.name='Tour del Solis' and s.stage_number=3
  order by s.stage_date desc,s.id
  limit 1;

  if v_stage_id is not null
     and not exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=v_stage_id)
     and not exists(select 1 from public.race_stage_point_results pr where pr.stage_id=v_stage_id)
  then
    v_result := public.reconcile_unprocessed_stage_sporting_points_v1(v_stage_id);
    if coalesce(v_result->>'status','')<>'reconciled' and coalesce(v_result->>'status','')<>'not_modified' then
      raise exception 'Tour del Solis Stage 3 point reconciliation failed: %',v_result;
    end if;
  end if;
end;
$$;
