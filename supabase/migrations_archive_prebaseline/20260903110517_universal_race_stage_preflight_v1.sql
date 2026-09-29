create or replace function public.universal_race_stage_preflight_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_stage record;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_previous_stage_id uuid;
  v_previous_stage_published boolean := true;
  v_startlist jsonb := '{}'::jsonb;
  v_authoritative_count integer := 0;
  v_active_run_count integer := 0;
  v_recent_failed_count integer := 0;
  v_status text;
  v_reason text;
begin
  if p_stage_id is null then
    return jsonb_build_object('status','BLOCKED','reason','stage_id_required');
  end if;

  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id=true;

  select s.id,s.race_id,s.stage_number,s.stage_date,s.name,
         s.planned_start_hour_number,s.planned_start_minute,
         coalesce(s.weather_cancelled,false) as weather_cancelled,
         r.name as race_name,r.status as race_status
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if not found then
    return jsonb_build_object('status','BLOCKED','reason','stage_not_found','stage_id',p_stage_id);
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  v_stage_start_game_at:=v_stage.stage_date::timestamp
    +make_interval(hours=>coalesce(v_stage.planned_start_hour_number,12),mins=>coalesce(v_stage.planned_start_minute,0));
  v_calculation_due_game_at:=v_stage_start_game_at
    -make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));

  v_startlist:=public.race_startlist_engine_readiness_v1(v_stage.race_id);

  select p.id into v_previous_stage_id
  from public.race_stages p
  where p.race_id=v_stage.race_id
    and p.stage_number<v_stage.stage_number
    and not coalesce(p.weather_cancelled,false)
  order by p.stage_number desc limit 1;

  if v_previous_stage_id is not null then
    select exists(
      select 1
      from public.race_stage_authoritative_runs a
      join public.race_stage_simulation_runs run on run.id=a.simulation_run_id
      where a.stage_id=v_previous_stage_id
        and a.engine_version='race_engine_ts_v1'
        and a.simulation_mode='deterministic_road_race_v1'
        and run.status='completed'
        and coalesce((run.result_summary_json->>'results_published')::boolean,false)
    ) into v_previous_stage_published;
  end if;

  select count(*)::integer into v_authoritative_count
  from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id;

  select count(*)::integer into v_active_run_count
  from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id
    and run.engine_version='race_engine_ts_v1'
    and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed')
    and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1');

  select count(*)::integer into v_recent_failed_count
  from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id
    and run.engine_version='race_engine_ts_v1'
    and run.simulation_mode='deterministic_road_race_v1'
    and run.status='failed'
    and run.failed_at is not null
    and run.failed_at>clock_timestamp()-interval '10 minutes';

  if v_stage.weather_cancelled then
    v_status:='SKIPPED'; v_reason:='weather_cancelled';
  elsif v_control.singleton_id is null
     or v_control.active_engine<>'typescript_v1'
     or not coalesce(v_control.typescript_execution_enabled,false)
     or not coalesce(v_control.typescript_lifecycle_enabled,false)
     or coalesce(v_control.legacy_execution_enabled,false) then
    v_status:='BLOCKED'; v_reason:='universal_engine_control_disabled';
  elsif v_stage_start_game_at<v_control.typescript_activation_game_at then
    v_status:='BLOCKED'; v_reason:='before_activation_boundary';
  elsif v_authoritative_count>0 then
    v_status:='DONE'; v_reason:='authoritative_run_exists';
  elsif v_active_run_count>0 then
    v_status:='IN_PROGRESS'; v_reason:='universal_run_exists';
  elsif v_recent_failed_count>0 then
    v_status:='RETRY_COOLDOWN'; v_reason:='recent_failed_run';
  elsif not coalesce((v_startlist->>'ready')::boolean,false) then
    if v_current_game_at<v_calculation_due_game_at then
      v_status:='NORMAL_PENDING'; v_reason:=coalesce(v_startlist->>'reason','startlist_pending');
    else
      v_status:='BLOCKED'; v_reason:='startlist_'||coalesce(v_startlist->>'reason','not_ready');
    end if;
  elsif v_previous_stage_id is not null and not v_previous_stage_published then
    if v_current_game_at<v_calculation_due_game_at then
      v_status:='NORMAL_PENDING'; v_reason:='waiting_previous_stage';
    else
      v_status:='BLOCKED'; v_reason:='previous_stage_not_published';
    end if;
  elsif v_current_game_at<v_calculation_due_game_at then
    v_status:='READY'; v_reason:='ready_when_due';
  else
    v_status:='READY'; v_reason:='ready_to_claim';
  end if;

  return jsonb_build_object(
    'status',v_status,'reason',v_reason,'stage_id',p_stage_id,'race_id',v_stage.race_id,
    'race_name',v_stage.race_name,'stage_number',v_stage.stage_number,'stage_name',v_stage.name,
    'race_status',v_stage.race_status,'current_game_at',v_current_game_at,
    'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'previous_stage_id',v_previous_stage_id,'previous_stage_published',v_previous_stage_published,
    'startlist_readiness',v_startlist,'authoritative_runs',v_authoritative_count,
    'active_universal_runs',v_active_run_count,'recent_failed_runs',v_recent_failed_count
  );
end;
$function$;

grant execute on function public.universal_race_stage_preflight_v1(uuid) to service_role;