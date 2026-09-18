create or replace function public.universal_race_stage_claim_next_due_v2(
  p_worker_id text default 'supabase_edge_phase11b_split_payload_v2'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_survival jsonb;
  v_result jsonb;
  v_active record;
  v_recovery_pending record;
begin
  v_survival := public.universal_race_stage_survival_recover_v1();

  select sr.stage_id,
         sr.id as simulation_run_id,
         coalesce(nullif(sr.result_summary_json->>'survival_phase',''),'claimed') as survival_phase,
         coalesce((sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
                  sr.updated_at, sr.started_at, sr.created_at) as heartbeat_at
    into v_active
  from public.race_stage_simulation_runs sr
  where sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='running'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
    )
  order by coalesce((sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
                    sr.updated_at, sr.started_at, sr.created_at) desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','worker_busy',
      'reason','single_active_calculation_guard',
      'active_stage_id',v_active.stage_id,
      'active_simulation_run_id',v_active.simulation_run_id,
      'active_phase',v_active.survival_phase,
      'active_heartbeat_at_real',v_active.heartbeat_at,
      'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
      'worker_model','single_active_calculation_v1',
      'global_worker_lock',true,
      'survival',v_survival
    );
  end if;

  select sr.stage_id,
         sr.id as simulation_run_id,
         coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
         sr.failed_at
    into v_recovery_pending
  from public.race_stage_simulation_runs sr
  where sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed'
    and sr.failed_at > clock_timestamp() - interval '2 hours'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and coalesce(sr.result_summary_json->>'survival_phase','')
        in ('pass1_resume_claimed','pass1_payload_loading','pass1_started')
    and sr.error_message='Race calculation survival watchdog recovered an expired calculation lease.'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
    )
  order by sr.failed_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','worker_busy',
      'reason','pass1_emergency_fallback_pending',
      'active_stage_id',v_recovery_pending.stage_id,
      'active_simulation_run_id',v_recovery_pending.simulation_run_id,
      'active_phase',v_recovery_pending.survival_phase,
      'active_heartbeat_at_real',v_recovery_pending.failed_at,
      'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
      'worker_model','single_active_calculation_v1',
      'global_worker_lock',true,
      'survival',v_survival
    );
  end if;

  v_result := public.universal_race_stage_claim_next_due_v2_impl(p_worker_id);

  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object(
      'worker_model','single_active_calculation_v1',
      'global_worker_lock',true,
      'survival',coalesce(v_result->'survival',v_survival)
    );
end;
$function$;

comment on function public.universal_race_stage_claim_next_due_v2(text)
is 'Single-active race dispatcher. It blocks new claims while a running calculation exists and while a watchdog-expired pass-1 run is waiting for the pass-2 emergency fallback worker, preventing duplicate runs for the same stage.';
