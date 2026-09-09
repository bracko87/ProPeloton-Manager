create or replace function public.race_startlist_engine_self_heal_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_readiness_before jsonb;
  v_readiness_after jsonb;
  v_team_list_repair jsonb := null;
  v_startlist_repair jsonb := null;
  v_current_game_at timestamp without time zone;
  v_rider_deadline timestamp without time zone;
  v_team_list_attempted boolean := false;
  v_startlist_attempted boolean := false;
  v_team_list_error text := null;
  v_startlist_error text := null;
begin
  if p_race_id is null then
    return jsonb_build_object(
      'ready', false,
      'reason', 'race_id_required',
      'readiness_before', jsonb_build_object('ready',false,'reason','race_id_required'),
      'readiness_after', jsonb_build_object('ready',false,'reason','race_id_required')
    );
  end if;

  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;
  v_readiness_before := public.race_startlist_engine_readiness_v1(p_race_id);
  v_readiness_after := v_readiness_before;

  /*
   * By the time a stage enters the TypeScript calculation lead window, the
   * official team list must already exist. Do not let a missed lifecycle tick
   * silently block race calculation: run the canonical team-list finalizer and
   * re-evaluate readiness.
   */
  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','') = 'team_list_not_finalized'
  then
    v_team_list_attempted := true;
    begin
      v_team_list_repair := public.finalize_race_team_list_announcement_v1(p_race_id);
    exception when others then
      v_team_list_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  begin
    v_rider_deadline := nullif(v_readiness_after->>'rider_deadline_game_at','')::timestamp without time zone;
  exception when others then
    v_rider_deadline := null;
  end;

  /*
   * Once the rider deadline has passed, all snapshot/number/captain/replacement
   * defects are repairable by the canonical startlist finalizer. Previously the
   * race worker only self-healed invalid captains; other transient startlist
   * defects (notably stale participant rows after missed-startlist replacement)
   * caused the stage to be skipped every minute with no player-facing error.
   */
  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','') not in (
       'rider_deadline_not_reached',
       'race_or_entry_rules_not_found',
       'race_id_required'
     )
     and (v_rider_deadline is null or v_current_game_at >= v_rider_deadline)
  then
    v_startlist_attempted := true;
    begin
      v_startlist_repair := public.finalize_race_startlist_captains_v1(p_race_id);
    exception when others then
      v_startlist_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  return jsonb_build_object(
    'race_id', p_race_id,
    'ready', coalesce((v_readiness_after->>'ready')::boolean,false),
    'reason', coalesce(v_readiness_after->>'reason','unknown'),
    'current_game_at', v_current_game_at,
    'rider_deadline_game_at', v_rider_deadline,
    'readiness_before', v_readiness_before,
    'readiness_after', v_readiness_after,
    'team_list_repair_attempted', v_team_list_attempted,
    'team_list_repair_result', v_team_list_repair,
    'team_list_repair_error', v_team_list_error,
    'startlist_repair_attempted', v_startlist_attempted,
    'startlist_repair_result', v_startlist_repair,
    'startlist_repair_error', v_startlist_error
  );
end;
$function$;

create or replace function public.universal_race_stage_claim_next_due_v1(p_worker_id text default 'netlify_phase11b_v1'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage record;
  v_claim jsonb;
  v_readiness jsonb;
  v_repair jsonb;
  v_blocked jsonb := '[]'::jsonb;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id=true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  for v_stage in
    select
      stage.id as stage_id,
      stage.race_id,
      race.name as race_name,
      stage.stage_number,
      stage.stage_date,
      stage.planned_start_hour_number,
      stage.planned_start_minute
    from public.race_stages stage
    join public.races race on race.id=stage.race_id
    where not coalesce(stage.weather_cancelled,false)
      and stage.planned_start_hour_number is not null
      and (
        stage.stage_date::timestamp
          + make_interval(
              hours=>coalesce(stage.planned_start_hour_number,12),
              mins=>coalesce(stage.planned_start_minute,0)
            )
      ) >= v_control.typescript_activation_game_at
      and (
        stage.stage_date::timestamp
          + make_interval(
              hours=>coalesce(stage.planned_start_hour_number,12),
              mins=>coalesce(stage.planned_start_minute,0)
            )
          - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))
      ) <= v_current_game_at
      and not exists (
        select 1
        from public.race_stage_authoritative_runs authority
        where authority.stage_id=stage.id
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs run
        where run.stage_id=stage.id
          and run.engine_version='race_engine_ts_v1'
          and run.simulation_mode='deterministic_road_race_v1'
          and run.status in ('running','completed')
          and coalesce(run.result_summary_json->>'calculation_contract','') in (
            'phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1'
          )
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs failed_run
        where failed_run.stage_id=stage.id
          and failed_run.engine_version='race_engine_ts_v1'
          and failed_run.simulation_mode='deterministic_road_race_v1'
          and failed_run.status='failed'
          and failed_run.failed_at is not null
          and failed_run.failed_at > clock_timestamp()-interval '10 minutes'
      )
    order by stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,stage.race_id,stage.stage_number
    limit 100
  loop
    /*
     * Production reliability guard: repair the complete startlist lifecycle,
     * not only invalid captains. This removes the dependency on the slower
     * captain-finalization cron and prevents due stages from being silently
     * skipped after missed-startlist / AI-replacement transitions.
     */
    v_repair := public.race_startlist_engine_self_heal_v1(v_stage.race_id);
    v_readiness := coalesce(v_repair->'readiness_after', public.race_startlist_engine_readiness_v1(v_stage.race_id));

    if coalesce((v_readiness->>'ready')::boolean,false) is not true then
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object(
          'stage_id',v_stage.stage_id,
          'race_id',v_stage.race_id,
          'race_name',v_stage.race_name,
          'stage_number',v_stage.stage_number,
          'reason','startlist_engine_not_ready',
          'readiness',v_readiness,
          'repair_result',v_repair
        )
      );
      continue;
    end if;

    begin
      v_claim := public.universal_race_stage_claim_calculation_v1(v_stage.stage_id);
    exception when others then
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object(
          'stage_id', v_stage.stage_id,
          'race_id',v_stage.race_id,
          'race_name',v_stage.race_name,
          'stage_number',v_stage.stage_number,
          'reason','claim_exception',
          'sqlstate', sqlstate,
          'message', sqlerrm,
          'repair_result',v_repair
        )
      );
      continue;
    end;

    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object(
        'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_v1'),
        'scheduler_skipped_blocks',v_blocked,
        'startlist_self_heal_applied',
          coalesce((v_repair->>'team_list_repair_attempted')::boolean,false)
          or coalesce((v_repair->>'startlist_repair_attempted')::boolean,false),
        'startlist_self_heal_result',v_repair
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status','no_due_stage',
    'current_game_at',v_current_game_at,
    'scheduler_skipped_blocks',v_blocked
  );
end;
$function$;