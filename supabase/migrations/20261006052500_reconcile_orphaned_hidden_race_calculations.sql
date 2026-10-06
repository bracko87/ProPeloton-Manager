-- Keep safe-mode recovery tied to the current stage run and recover one valid hidden output.
CREATE OR REPLACE FUNCTION public.universal_race_stage_enable_safe_mode_v1(p_stage_id uuid, p_simulation_run_id uuid, p_reason text, p_workload_score numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
begin
  -- Serialize recovery with new claims for this stage.
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||p_stage_id::text,0));

  if exists (
    select 1 from public.race_stage_automation_state a
    where a.stage_id=p_stage_id
      and a.simulation_run_id is distinct from p_simulation_run_id
  ) then
    return jsonb_build_object('status','stale_run','stage_id',p_stage_id,
      'simulation_run_id',p_simulation_run_id);
  end if;

  if exists (
    select 1 from public.race_stage_simulation_runs r
    where r.stage_id=p_stage_id and r.id<>p_simulation_run_id
      and r.status='running'
      and r.result_summary_json->>'calculation_contract'='universal_phase11b_calculated_hidden_v1'
  ) then
    return jsonb_build_object('status','other_run_already_calculated','stage_id',p_stage_id,
      'simulation_run_id',p_simulation_run_id);
  end if;

  select r.race_id into v_race_id
  from public.race_stage_simulation_runs r
  where r.id=p_simulation_run_id
    and r.stage_id=p_stage_id
    and r.engine_version='race_engine_ts_v1'
    and r.simulation_mode='deterministic_road_race_v1'
  for update;

  if v_race_id is null then
    return jsonb_build_object('status','missing_run','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;

  if exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id) then
    return jsonb_build_object('status','already_authoritative','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;

  insert into public.race_stage_safe_calculation_v1(
    stage_id,race_id,simulation_run_id,status,step,workload_score,trigger_reason,
    checkpoint_json,lease_token,lease_expires_at,step_attempt_count,total_attempt_count,last_error,
    created_at,updated_at,completed_at
  )
  values(
    p_stage_id,v_race_id,p_simulation_run_id,'pending',0,coalesce(p_workload_score,0),
    coalesce(nullif(p_reason,''),'safe_mode_requested'),
    '{}'::jsonb,null,null,0,0,null,clock_timestamp(),clock_timestamp(),null
  )
  on conflict(stage_id) do update
    set race_id=excluded.race_id,
        simulation_run_id=excluded.simulation_run_id,
        status=case
          when public.race_stage_safe_calculation_v1.simulation_run_id=excluded.simulation_run_id
            and public.race_stage_safe_calculation_v1.status='completed' then 'completed'
          else 'pending' end,
        step=case when public.race_stage_safe_calculation_v1.simulation_run_id=excluded.simulation_run_id
          then public.race_stage_safe_calculation_v1.step else 0 end,
        checkpoint_json=case when public.race_stage_safe_calculation_v1.simulation_run_id=excluded.simulation_run_id
          then public.race_stage_safe_calculation_v1.checkpoint_json else '{}'::jsonb end,
        checkpoint_text=case when public.race_stage_safe_calculation_v1.simulation_run_id=excluded.simulation_run_id
          then public.race_stage_safe_calculation_v1.checkpoint_text else '{}' end,
        step_attempt_count=case when public.race_stage_safe_calculation_v1.simulation_run_id=excluded.simulation_run_id
          then public.race_stage_safe_calculation_v1.step_attempt_count else 0 end,
        total_attempt_count=case when public.race_stage_safe_calculation_v1.simulation_run_id=excluded.simulation_run_id
          then public.race_stage_safe_calculation_v1.total_attempt_count else 0 end,
        workload_score=greatest(public.race_stage_safe_calculation_v1.workload_score,excluded.workload_score),
        trigger_reason=excluded.trigger_reason,
        lease_token=null,
        lease_expires_at=null,
        last_error=null,
        updated_at=clock_timestamp(),
        completed_at=case when public.race_stage_safe_calculation_v1.simulation_run_id=excluded.simulation_run_id
                            and public.race_stage_safe_calculation_v1.status='completed'
                          then public.race_stage_safe_calculation_v1.completed_at else null end;

  update public.race_stage_simulation_runs
     set status='running',
         started_at=case
           when coalesce((
             select sf.total_attempt_count
             from public.race_stage_safe_calculation_v1 sf
             where sf.stage_id=p_stage_id
               and sf.simulation_run_id=p_simulation_run_id
             limit 1
           ),0)=0 then clock_timestamp()
           else started_at
         end,
         failed_at=null,
         error_message=null,
         result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
           || jsonb_build_object(
                'survival_phase','safe_mode_pending',
                'safe_mode_enabled',true,
                'safe_mode_reason',coalesce(nullif(p_reason,''),'safe_mode_requested'),
                'safe_mode_workload_score',coalesce(p_workload_score,0),
                'safe_mode_enabled_at_real',clock_timestamp(),
                'recovery_policy','checkpointed_safe_mode_v1'
              ),
         updated_at=clock_timestamp()
   where id=p_simulation_run_id and stage_id=p_stage_id;

  update public.race_stage_automation_state
     set last_status='running',
         last_error=null,
         last_checked_at=clock_timestamp(),
         details=coalesce(details,'{}'::jsonb)
           || jsonb_build_object(
                'survival_phase','safe_mode_pending',
                'safe_mode_enabled',true,
                'safe_mode_reason',coalesce(nullif(p_reason,''),'safe_mode_requested'),
                'safe_mode_workload_score',coalesce(p_workload_score,0),
                'recovery_policy','checkpointed_safe_mode_v1'
              ),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id and simulation_run_id=p_simulation_run_id;

  delete from public.race_stage_calculation_quarantine_v1 where stage_id=p_stage_id;

  insert into public.race_engine_calculation_survival_audit_v1(
    stage_id,race_id,simulation_run_id,action,reason,details
  )
  values(
    p_stage_id,v_race_id,p_simulation_run_id,'enable_checkpointed_safe_mode',
    coalesce(nullif(p_reason,''),'safe_mode_requested'),
    jsonb_build_object(
      'workload_score',coalesce(p_workload_score,0),
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  return jsonb_build_object(
    'status','safe_mode_enabled',
    'stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id,
    'workload_score',coalesce(p_workload_score,0),
    'reason',coalesce(nullif(p_reason,''),'safe_mode_requested')
  );
end;
$function$
;
create or replace function public.universal_race_stage_reconcile_hidden_orphans_v1()
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_stage record;
  v_hidden record;
  v_count integer := 0;
  v_repaired jsonb := '[]'::jsonb;
begin
  for v_stage in
    select a.stage_id
    from public.race_stage_automation_state a
    where a.last_status in ('failed','recovering','calculating')
      and exists (
        select 1 from public.race_stage_simulation_runs r
        where r.stage_id=a.stage_id and r.id<>a.simulation_run_id
          and r.status='running'
          and r.result_summary_json->>'calculation_contract'='universal_phase11b_calculated_hidden_v1'
      )
    order by a.updated_at
    limit 10
  loop
    perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||v_stage.stage_id::text,0));
    perform pg_advisory_xact_lock(hashtextextended('phase11b_submit:'||v_stage.stage_id::text,0));

    select r.id,r.result_summary_json
      into v_hidden
    from public.race_stage_simulation_runs r
    where r.stage_id=v_stage.stage_id
      and r.status='running'
      and r.engine_version='race_engine_ts_v1'
      and r.simulation_mode='deterministic_road_race_v1'
      and r.result_summary_json->>'calculation_contract'='universal_phase11b_calculated_hidden_v1'
      and r.result_summary_json->'application_manifest'->>'readyForApplication'='true'
      and r.result_summary_json->'output_snapshot'->>'contractVersion'='universal_race_stage_output_v1'
      and r.result_summary_json->'output_snapshot'->>'stageId'=v_stage.stage_id::text
      and r.result_summary_json->>'output_hash_md5'=md5((r.result_summary_json->'output_snapshot')::text)
    order by r.updated_at desc;
    if not found then continue; end if;
    if (select count(*) from public.race_stage_simulation_runs r
        where r.stage_id=v_stage.stage_id and r.status='running'
          and r.result_summary_json->>'calculation_contract'='universal_phase11b_calculated_hidden_v1')<>1
       or exists(select 1 from public.race_stage_authoritative_runs x where x.stage_id=v_stage.stage_id)
       or exists(select 1 from public.race_stage_results x where x.stage_id=v_stage.stage_id)
       or exists(select 1 from public.race_stage_point_results x where x.stage_id=v_stage.stage_id)
    then continue; end if;

    update public.race_stage_automation_state a
    set simulation_run_id=v_hidden.id,
        last_status='calculated_hidden',
        last_error=null,
        last_checked_at=clock_timestamp(),
        details=(coalesce(a.details,'{}'::jsonb)
          - 'failed_at_real' - 'error_details'
          - 'replay_opened_at_real' - 'replay_opened_game_at' - 'replay_closes_at_real')
          || jsonb_build_object(
            'manifest_ready',true,
            'calculated_at_real',v_hidden.result_summary_json->>'calculated_at_real',
            'orphaned_hidden_run_reconciled_at_real',clock_timestamp(),
            'orphaned_hidden_run_previous_id',a.simulation_run_id
          ),
        updated_at=clock_timestamp()
    where a.stage_id=v_stage.stage_id
      and a.simulation_run_id<>v_hidden.id
      and a.last_status in ('failed','recovering','calculating');

    if found then
      v_count:=v_count+1;
      v_repaired:=v_repaired||jsonb_build_array(
        jsonb_build_object('stage_id',v_stage.stage_id,'simulation_run_id',v_hidden.id));
    end if;
  end loop;

  return jsonb_build_object('status','completed','repaired_count',v_count,'repaired',v_repaired);
end;
$function$;
revoke all on function public.universal_race_stage_reconcile_hidden_orphans_v1() from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.universal_race_stage_process_lifecycle_v1(p_max_publications integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pass jsonb;
  v_current_game_at timestamp without time zone;
  v_fast_forwarded integer := 0;
  v_published integer := 0;
  v_scenario_finalization jsonb;
  v_hidden_repair jsonb;
begin
  v_hidden_repair := public.universal_race_stage_reconcile_hidden_orphans_v1();
  v_pass := public.universal_race_stage_process_lifecycle_core_v1(1);
  v_scenario_finalization := public.universal_race_stage_finalize_ready_scenarios_v1(8);

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  update public.race_stage_automation_state state
  set details = coalesce(state.details,'{}'::jsonb) || jsonb_build_object(
        'replay_closes_at_real', clock_timestamp(),
        'historical_catchup_replay_fast_forwarded', true,
        'historical_catchup_fast_forwarded_at_real', clock_timestamp(),
        'historical_catchup_current_game_at', v_current_game_at,
        'historical_catchup_rule','replay_first_opened_at_least_30_game_minutes_late_v2'
      ),
      last_checked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  from public.race_stage_simulation_runs run
  where run.id = state.simulation_run_id
    and state.last_status = 'replay_live'
    and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes' <= v_current_game_at
    and coalesce(
        nullif(state.details ->> 'replay_opened_game_at', '')::timestamp,
        public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone
      )
        >= public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes'
    and run.status = 'running'
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11b_calculated_hidden_v1'
    and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id = state.stage_id)
    and (nullif(state.details ->> 'replay_closes_at_real', '') is null
      or (state.details ->> 'replay_closes_at_real')::timestamptz > clock_timestamp());
  get diagnostics v_fast_forwarded = row_count;

  v_published := coalesce(nullif(v_pass ->> 'published_count', '')::integer, 0);

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'historical_catchup_fast_forwarded_count',v_fast_forwarded,
    'published_count',v_published,
    'pass',v_pass,
    'hidden_run_repair',v_hidden_repair,
    'scenario_finalization',v_scenario_finalization,
    'historical_catchup_rule','replay_first_opened_at_least_30_game_minutes_late_v2',
    'official_result_reveal_rule','not_before_stage_start_plus_30_game_minutes_v1',
    'publication_budget_per_lifecycle_call',1
  );
end;
$function$
;
