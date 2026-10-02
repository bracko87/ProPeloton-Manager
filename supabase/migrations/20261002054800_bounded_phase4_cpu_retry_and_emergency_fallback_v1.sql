-- Bound checkpointed Phase 4 retries and hand CPU-exhausted heavy stages to the emergency fallback.
CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_safe_step_v2(p_worker_id text DEFAULT 'safe_edge_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_row public.race_stage_safe_calculation_v1%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select *
    into v_row
  from public.race_stage_safe_calculation_v1 s
  where s.status in ('pending','running')
    and (s.lease_expires_at is null or s.lease_expires_at < clock_timestamp())
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
    )
  order by s.updated_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('status','idle');
  end if;
  if v_row.step=4 and v_row.step_attempt_count >= 3 then
    update public.race_stage_safe_calculation_v1
       set status='failed',
           lease_token=null,
           lease_expires_at=null,
           last_error='Phase 4 CPU retry budget exhausted; handed to emergency fallback.',
           completed_at=clock_timestamp(),
           updated_at=clock_timestamp()
     where stage_id=v_row.stage_id
       and simulation_run_id=v_row.simulation_run_id;

    update public.race_stage_simulation_runs
       set status='failed',
           failed_at=clock_timestamp(),
           error_message='Checkpointed Phase 4 exceeded the Edge CPU retry budget; emergency fallback requested.',
           result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'calculation_status','failed',
                  'survival_phase','safe_step4_cpu_exhausted',
                  'safe_step4_attempt_count',v_row.step_attempt_count,
                  'safe_step4_total_attempt_count',v_row.total_attempt_count,
                  'safe_step4_handoff_at_real',clock_timestamp(),
                  'recovery_policy','bounded_phase4_then_emergency_fallback_v1'
                ),
           updated_at=clock_timestamp()
     where id=v_row.simulation_run_id;

    update public.race_stage_automation_state
       set last_status='recovering',
           last_error='Phase 4 exceeded the Edge CPU retry budget; emergency fallback queued.',
           last_checked_at=clock_timestamp(),
           details=coalesce(details,'{}'::jsonb)
             || jsonb_build_object(
                  'survival_phase','safe_step4_cpu_exhausted',
                  'safe_step4_attempt_count',v_row.step_attempt_count,
                  'recovery_policy','bounded_phase4_then_emergency_fallback_v1',
                  'fallback_queued_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where stage_id=v_row.stage_id
       and simulation_run_id=v_row.simulation_run_id;

    return jsonb_build_object(
      'status','fallback_handoff',
      'stage_id',v_row.stage_id,
      'simulation_run_id',v_row.simulation_run_id,
      'step',v_row.step,
      'step_attempt_count',v_row.step_attempt_count,
      'total_attempt_count',v_row.total_attempt_count,
      'recovery_policy','bounded_phase4_then_emergency_fallback_v1'
    );
  end if;

  update public.race_stage_safe_calculation_v1
     set status='running',
         lease_token=v_token,
         lease_expires_at=clock_timestamp()+interval '90 seconds',
         step_attempt_count=step_attempt_count+1,
         total_attempt_count=total_attempt_count+1,
         updated_at=clock_timestamp()
   where stage_id=v_row.stage_id;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_row.stage_id,
    v_row.simulation_run_id,
    'safe_mode_step_'||v_row.step::text,
    jsonb_build_object(
      'worker_id',coalesce(nullif(p_worker_id,''),'safe_edge_v2'),
      'step',v_row.step,
      'step_attempt_count',v_row.step_attempt_count+1,
      'total_attempt_count',v_row.total_attempt_count+1,
      'workload_score',v_row.workload_score,
      'checkpoint_storage','ordered_json_text_v2',
      'model_version','checkpointed_safe_mode_v2'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_row.stage_id,
    'race_id',v_row.race_id,
    'simulation_run_id',v_row.simulation_run_id,
    'step',v_row.step,
    'checkpoint_text',v_row.checkpoint_text,
    'lease_token',v_token,
    'step_attempt_count',v_row.step_attempt_count+1,
    'total_attempt_count',v_row.total_attempt_count+1,
    'workload_score',v_row.workload_score,
    'trigger_reason',v_row.trigger_reason
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_pass2_resume_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run_id uuid;
  v_stage_id uuid;
  v_phase text;
  v_status text;
  v_failed_at timestamptz;
  v_error_message text;
  v_has_scenario boolean := false;
  v_scenario_mode text := 'none';
  v_attempt_count integer := 0;
  v_max_attempts integer := 3;
  v_heartbeat_at timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('universal_race_pass2_claim_v3_same_input', 0)
  );

  select s.id,
         s.stage_id,
         coalesce(s.result_summary_json->>'survival_phase',''),
         s.status,
         s.failed_at,
         s.error_message,
         exists (
           select 1
           from public.race_engine_scenario_runs sc
           where sc.simulation_run_id=s.id
             and sc.selection_status='reserved'
         ),
         case
           when coalesce(s.result_summary_json->>'pass2_attempt_count','') ~ '^[0-9]+$'
             then (s.result_summary_json->>'pass2_attempt_count')::integer
           else 0
         end,
         coalesce(
           (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
           s.updated_at,s.started_at,s.created_at
         )
    into v_run_id,v_stage_id,v_phase,v_status,v_failed_at,v_error_message,
         v_has_scenario,v_attempt_count,v_heartbeat_at
  from public.race_stage_simulation_runs s
  where coalesce(s.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
    )
    and not exists (
      select 1
      from public.race_stage_safe_calculation_v1 sf
      where sf.stage_id=s.stage_id
        and sf.simulation_run_id=s.id
        and sf.status in ('pending','running')
    )
    and not exists (
      select 1
      from public.race_stage_safe_calculation_v1 sf
      where sf.stage_id=s.stage_id
        and sf.simulation_run_id=s.id
        and sf.status in ('pending','running')
    )
    and coalesce(s.result_summary_json->>'survival_phase','') <> 'pass2_retry_exhausted'
    and (
      exists (
        select 1
        from public.race_engine_scenario_runs sc
        where sc.simulation_run_id=s.id
          and sc.selection_status='reserved'
      )
      or coalesce(s.result_summary_json->>'pass2_scenario_mode','')='none'
      or coalesce(s.result_summary_json->>'survival_phase','')='pass1_ready_no_scenario'
      or (
        s.status='failed'
        and s.failed_at > clock_timestamp()-interval '2 hours'
      )
    )
    and (
      (
        s.status='running'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') in ('scenario_reserved','pass1_ready_no_scenario')
            and coalesce(
              (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
              s.updated_at,s.started_at,s.created_at
            ) < clock_timestamp()-interval '5 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','')='pass2_resume_failed'
            and coalesce(
              (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
              s.updated_at,s.started_at,s.created_at
            ) < clock_timestamp()-interval '10 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','') in (
              'pass2_resume_claimed','pass2_payload_loading',
              'primary_engine_started','fallback_engine_started',
              'primary_engine_finished','fallback_engine_finished','submitting'
            )
            and coalesce(
              (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
              s.updated_at,s.started_at,s.created_at
            ) < clock_timestamp()-interval '90 seconds'
          )
        )
      )
      or (
        s.status='failed'
        and s.failed_at > clock_timestamp()-interval '2 hours'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') in (
              'pass1_resume_claimed','pass1_payload_loading','pass1_started'
            )
            and s.error_message='Race calculation survival watchdog recovered an expired calculation lease.'
          )
          or coalesce(s.result_summary_json->>'survival_phase','') in (
            'pass2_resume_claimed','pass2_payload_loading',
            'primary_engine_started','fallback_engine_started',
            'primary_engine_finished','fallback_engine_finished',
            'submitting','pass2_resume_failed',
            'safe_step4_cpu_exhausted'
          )
        )
      )
    )
  order by coalesce(s.failed_at,s.started_at,s.created_at) asc
  for update of s skip locked
  limit 1;

  if v_run_id is null then
    return jsonb_build_object('status','idle');
  end if;


  if v_phase in ('primary_engine_started','fallback_engine_started')
     and (
       v_status='failed'
       or v_heartbeat_at < clock_timestamp()-interval '45 seconds'
     )
  then
    perform public.universal_race_stage_enable_safe_mode_v1(
      v_stage_id,
      v_run_id,
      'checkpointed_safe_mode_after_first_engine_failure',
      0
    );
    perform public.universal_race_stage_kick_safe_worker_v1();

    return jsonb_build_object(
      'status','safe_mode_activated',
      'stage_id',v_stage_id,
      'simulation_run_id',v_run_id,
      'previous_phase',v_phase,
      'previous_error',v_error_message,
      'recovery_policy','checkpointed_safe_mode_v1'
    );
  end if;

  if v_status='failed'
     and v_phase in (
       'primary_engine_started','fallback_engine_started',
       'primary_engine_finished','fallback_engine_finished',
       'pass2_resume_failed'
     )
  then
    perform public.universal_race_stage_enable_safe_mode_v1(
      v_stage_id,
      v_run_id,
      'checkpointed_safe_mode_after_first_engine_failure',
      0
    );
    perform public.universal_race_stage_kick_safe_worker_v1();

    return jsonb_build_object(
      'status','safe_mode_activated',
      'stage_id',v_stage_id,
      'simulation_run_id',v_run_id,
      'previous_phase',v_phase,
      'previous_error',v_error_message,
      'recovery_policy','checkpointed_safe_mode_v1'
    );
  end if;

  if v_attempt_count >= v_max_attempts then
    update public.race_stage_simulation_runs
       set status='failed',
           failed_at=clock_timestamp(),
           error_message='Pass 2 retry limit exhausted while preserving the full race input/scenario.',
           result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'calculation_status','failed',
                  'survival_phase','pass2_retry_exhausted',
                  'pass2_attempt_count',v_attempt_count,
                  'pass2_retry_exhausted_at_real',clock_timestamp(),
                  'recovery_policy','same_full_input_or_quarantine_v1',
                  'error_details',jsonb_build_object(
                    'reason','pass2_retry_exhausted',
                    'max_attempts',v_max_attempts,
                    'previous_phase',v_phase,
                    'previous_error',v_error_message,
                    'scenario_preserved',v_has_scenario
                  ),
                  'verification_only',false
                ),
           updated_at=clock_timestamp()
     where id=v_run_id;

    update public.race_stage_automation_state
       set last_status='failed',
           last_error='Pass 2 retry limit exhausted while preserving the full race input/scenario.',
           last_checked_at=clock_timestamp(),
           details=coalesce(details,'{}'::jsonb)
             || jsonb_build_object(
                  'survival_phase','pass2_retry_exhausted',
                  'pass2_attempt_count',v_attempt_count,
                  'recovery_policy','same_full_input_or_quarantine_v1',
                  'scenario_preserved',v_has_scenario,
                  'pass2_retry_exhausted_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where stage_id=v_stage_id
       and simulation_run_id=v_run_id;

    insert into public.race_stage_calculation_quarantine_v1(
      stage_id,reason,attempt_count,quarantined_at,details
    )
    values(
      v_stage_id,
      'pass2_retry_exhausted_same_full_input',
      v_attempt_count,
      clock_timestamp(),
      jsonb_build_object(
        'simulation_run_id',v_run_id,
        'previous_phase',v_phase,
        'previous_error',v_error_message,
        'max_attempts',v_max_attempts,
        'scenario_preserved',v_has_scenario,
        'recovery_policy','same_full_input_or_quarantine_v1'
      )
    )
    on conflict(stage_id) do update
      set reason=excluded.reason,
          attempt_count=excluded.attempt_count,
          quarantined_at=excluded.quarantined_at,
          details=excluded.details;

    return jsonb_build_object(
      'status','retry_exhausted',
      'stage_id',v_stage_id,
      'simulation_run_id',v_run_id,
      'pass2_attempt_count',v_attempt_count,
      'max_attempts',v_max_attempts,
      'recovery_policy','same_full_input_or_quarantine_v1'
    );
  end if;

  if v_status='failed' then
    update public.race_stage_simulation_runs
       set status='running',
           failed_at=null,
           error_message=null,
           result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'pass2_resume_recovery',jsonb_build_object(
                    'recovered_from_status',v_status,
                    'watchdog_failed_at_real',v_failed_at,
                    'watchdog_error',v_error_message,
                    'recovered_at_real',clock_timestamp(),
                    'same_full_input',true,
                    'scenario_preserved',v_has_scenario,
                    'emergency_fallback',v_scenario_mode='emergency_fallback'
                  )
                ),
           updated_at=clock_timestamp()
     where id=v_run_id;
  end if;

  v_scenario_mode := case
    when v_phase='safe_step4_cpu_exhausted' then 'emergency_fallback'
    when v_has_scenario then 'reserved'
    else 'none'
  end;
  v_attempt_count := v_attempt_count + 1;

  update public.race_stage_simulation_runs
     set result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
       || jsonb_build_object(
            'pass2_scenario_mode',v_scenario_mode,
            'pass2_attempt_count',v_attempt_count,
            'pass2_last_attempt_at_real',clock_timestamp(),
            'pass2_retry_guard_version','pass2_retry_guard_v3_same_full_input',
            'recovery_policy','same_full_input_or_quarantine_v1'
          ),
         updated_at=clock_timestamp()
   where id=v_run_id;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_stage_id,
    v_run_id,
    'pass2_resume_claimed',
    jsonb_build_object(
      'source','pass2_resume_worker_v19',
      'previous_phase',v_phase,
      'recovered_failed_run',v_status='failed',
      'scenario_mode',v_scenario_mode,
      'scenario_preserved',v_has_scenario,
      'emergency_fallback',v_scenario_mode='emergency_fallback',
      'pass2_attempt_count',v_attempt_count,
      'max_pass2_attempts',v_max_attempts,
      'claim_guard','serialized_stale_lease_v3',
      'recovery_policy','same_full_input_or_quarantine_v1'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_stage_id,
    'simulation_run_id',v_run_id,
    'previous_phase',v_phase,
    'recovered_failed_run',v_status='failed',
    'scenario_mode',v_scenario_mode,
    'scenario_preserved',v_has_scenario,
    'emergency_fallback',v_scenario_mode='emergency_fallback',
    'pass2_attempt_count',v_attempt_count,
    'max_pass2_attempts',v_max_attempts,
    'recovery_policy','same_full_input_or_quarantine_v1'
  );
end;
$function$;
