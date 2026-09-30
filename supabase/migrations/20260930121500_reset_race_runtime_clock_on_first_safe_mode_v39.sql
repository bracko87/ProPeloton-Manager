-- Give checkpointed safe mode its own hard-runtime window on first activation.
CREATE OR REPLACE FUNCTION public.universal_race_stage_enable_safe_mode_v1(p_stage_id uuid, p_simulation_run_id uuid, p_reason text, p_workload_score numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
begin
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
        status=case when public.race_stage_safe_calculation_v1.status='completed' then 'completed' else 'pending' end,
        workload_score=greatest(public.race_stage_safe_calculation_v1.workload_score,excluded.workload_score),
        trigger_reason=excluded.trigger_reason,
        lease_token=null,
        lease_expires_at=null,
        last_error=null,
        updated_at=clock_timestamp(),
        completed_at=case when public.race_stage_safe_calculation_v1.status='completed'
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

