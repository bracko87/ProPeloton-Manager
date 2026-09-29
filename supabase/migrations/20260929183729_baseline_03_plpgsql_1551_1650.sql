CREATE OR REPLACE FUNCTION public.universal_race_stage_get_calculation_payload_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payload jsonb;
  v_phase9 jsonb;
begin
  v_payload := public.universal_race_stage_get_calculation_payload_v1(p_stage_id);
  v_phase9 := public.universal_race_stage_compact_phase9_for_engine_v1(v_payload->'phase9_inputs');

  return jsonb_set(
    v_payload || jsonb_build_object('contract','universal_race_calculation_payload_v4_compact_phase9'),
    '{phase9_inputs}',
    coalesce(v_phase9,'{}'::jsonb),
    true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_get_calculation_payload_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '45s'
 SET lock_timeout TO '5s'
AS $function$
declare
  v_payload jsonb;
  v_preparation jsonb;
  v_modifiers jsonb;
  v_simulation_run_id uuid;
begin
  select r.id
    into v_simulation_run_id
  from public.race_stage_simulation_runs r
  where r.stage_id = p_stage_id
    and r.status = 'running'
  order by r.started_at desc nulls last, r.created_at desc
  limit 1;

  if v_simulation_run_id is not null then
    begin
      perform public.universal_race_stage_survival_heartbeat_v1(
        p_stage_id,
        v_simulation_run_id,
        'payload_loading',
        jsonb_build_object('source', 'calculation_payload_rpc')
      );
    exception when others then
      null;
    end;
  end if;

  v_payload := public.universal_race_stage_get_calculation_payload_full_v1(p_stage_id);

  -- The race engine consumes the already-computed Phase 9 numeric modifiers.
  -- Do not send the large duplicated equipment catalog/snapshot blocks across
  -- the Edge/PostgREST boundary for every calculation.
  v_preparation := v_payload #> '{phase9_inputs,preparation}';
  if jsonb_typeof(v_preparation) = 'object' then
    v_payload := jsonb_set(
      v_payload,
      '{phase9_inputs,preparation}',
      v_preparation - 'equipment',
      false
    );
  end if;

  v_modifiers := v_payload #> '{phase9_inputs,riderModifiers}';
  if jsonb_typeof(v_modifiers) = 'array' then
    v_payload := jsonb_set(
      v_payload,
      '{phase9_inputs,riderModifiers}',
      coalesce(
        (
          select jsonb_agg(value - 'equipment_selection' order by ordinality)
          from jsonb_array_elements(v_modifiers) with ordinality as e(value, ordinality)
        ),
        '[]'::jsonb
      ),
      false
    );
  end if;

  v_modifiers := v_payload #> '{phase9_inputs,rider_modifiers}';
  if jsonb_typeof(v_modifiers) = 'array' then
    v_payload := jsonb_set(
      v_payload,
      '{phase9_inputs,rider_modifiers}',
      coalesce(
        (
          select jsonb_agg(value - 'equipment_selection' order by ordinality)
          from jsonb_array_elements(v_modifiers) with ordinality as e(value, ordinality)
        ),
        '[]'::jsonb
      ),
      false
    );
  end if;

  if v_simulation_run_id is not null then
    begin
      perform public.universal_race_stage_survival_heartbeat_v1(
        p_stage_id,
        v_simulation_run_id,
        'payload_loaded',
        jsonb_build_object(
          'source', 'calculation_payload_rpc',
          'payload_bytes', pg_column_size(v_payload)
        )
      );
    exception when others then
      null;
    end;
  end if;

  return v_payload;
end;
$function$
;

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
            'submitting','pass2_resume_failed'
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
                    'emergency_fallback',false
                  )
                ),
           updated_at=clock_timestamp()
     where id=v_run_id;
  end if;

  v_scenario_mode := case when v_has_scenario then 'reserved' else 'none' end;
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
      'emergency_fallback',false,
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
    'emergency_fallback',false,
    'pass2_attempt_count',v_attempt_count,
    'max_pass2_attempts',v_max_attempts,
    'recovery_policy','same_full_input_or_quarantine_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_pass1_resume_v1()
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
begin
  select s.id,
         s.stage_id,
         coalesce(s.result_summary_json->>'survival_phase',''),
         s.status,
         s.failed_at,
         s.error_message
    into v_run_id, v_stage_id, v_phase, v_status, v_failed_at, v_error_message
  from public.race_stage_simulation_runs s
  where coalesce(s.result_summary_json->>'calculation_contract','') = 'phase11b_claim_pending_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id = s.stage_id
    )
    and not exists (
      select 1 from public.race_engine_scenario_runs sc
      where sc.simulation_run_id = s.id and sc.selection_status = 'reserved'
    )
    and (
      (
        s.status = 'running'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') in ('pass1_pending','payload_loaded')
            and coalesce((s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz, s.started_at, s.created_at)
                < clock_timestamp() - interval '5 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','') = 'pass1_resume_failed'
            and coalesce((s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz, s.started_at, s.created_at)
                < clock_timestamp() - interval '10 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','') in ('pass1_resume_claimed','pass1_payload_loading','pass1_started')
            and coalesce((s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz, s.started_at, s.created_at)
                < clock_timestamp() - interval '5 minutes'
          )
        )
      )
      or (
        s.status = 'failed'
        and coalesce(s.result_summary_json->>'survival_phase','') in (
          'pass1_pending','payload_loaded','pass1_resume_failed','pass1_resume_claimed','pass1_payload_loading','pass1_started'
        )
        and s.failed_at > clock_timestamp() - interval '2 hours'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') = 'pass1_resume_failed'
            and coalesce(s.result_summary_json#>>'{error_details,reason}','') <> 'pass1_engine_exception'
          )
          or (
            s.error_message = 'Race calculation survival watchdog recovered an expired calculation lease.'
            and coalesce(s.result_summary_json->>'survival_phase','') in ('pass1_pending','payload_loaded')
          )
        )
      )
    )
  order by coalesce(s.failed_at, s.started_at, s.created_at) asc
  for update of s skip locked
  limit 1;

  if v_run_id is null then
    return jsonb_build_object('status','idle');
  end if;

  if v_status = 'failed' then
    update public.race_stage_simulation_runs
       set status = 'running',
           failed_at = null,
           error_message = null,
           result_summary_json = coalesce(result_summary_json, '{}'::jsonb)
             || jsonb_build_object(
                  'pass1_resume_recovery', jsonb_build_object(
                    'recovered_from_status', v_status,
                    'watchdog_failed_at_real', v_failed_at,
                    'watchdog_error', v_error_message,
                    'recovered_at_real', clock_timestamp()
                  )
                ),
           updated_at = clock_timestamp()
     where id = v_run_id;
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_stage_id,
    v_run_id,
    'pass1_resume_claimed',
    jsonb_build_object(
      'source','pass1_resume_worker',
      'previous_phase',v_phase,
      'recovered_failed_run',v_status = 'failed'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_stage_id,
    'simulation_run_id',v_run_id,
    'previous_phase',v_phase,
    'recovered_failed_run',v_status = 'failed'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_ready_scenarios_v1(p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row record;
  v_result jsonb;
  v_classification jsonb;
  v_checkpoints jsonb;
  v_outcome jsonb;
  v_finalize jsonb;
  v_results jsonb := '[]'::jsonb;
  v_finalized integer := 0;
  v_failed integer := 0;
  v_same_time integer;
  v_max_gap numeric;
begin
  for v_row in
    select s.stage_id, s.simulation_run_id,
           r.result_summary_json #> '{output_snapshot,universalResult}' as universal_result
    from public.race_engine_scenario_runs s
    join public.race_stage_simulation_runs r
      on r.id = s.simulation_run_id
     and r.stage_id = s.stage_id
    where s.selection_status = 'reserved'
      and jsonb_typeof(r.result_summary_json #> '{output_snapshot,universalResult}') = 'object'
      and jsonb_typeof(r.result_summary_json #> '{output_snapshot,universalResult,finishResolution,classification}') = 'array'
      and jsonb_array_length(r.result_summary_json #> '{output_snapshot,universalResult,finishResolution,classification}') > 0
    order by r.updated_at asc
    limit greatest(1, least(coalesce(p_limit,8), 32))
  loop
    begin
      v_result := v_row.universal_result;
      v_classification := coalesce(v_result #> '{finishResolution,classification}', '[]'::jsonb);
      v_checkpoints := case
        when jsonb_typeof(v_result #> '{replayTimeline,checkpoints}') = 'array'
          then v_result #> '{replayTimeline,checkpoints}'
        else '[]'::jsonb
      end;

      select count(*) filter (
               where coalesce(
                 nullif(e->>'gapSeconds','')::numeric,
                 nullif(e->>'officialGapSeconds','')::numeric,
                 0
               ) <= 0.5
             ),
             coalesce(max(coalesce(
               nullif(e->>'gapSeconds','')::numeric,
               nullif(e->>'officialGapSeconds','')::numeric,
               0
             )),0)
      into v_same_time, v_max_gap
      from jsonb_array_elements(v_classification) e;

      v_outcome := jsonb_build_object(
        'winner_rider_id', v_classification -> 0 ->> 'riderId',
        'classification_rider_count', jsonb_array_length(v_classification),
        'same_time_rider_count', coalesce(v_same_time,0),
        'max_gap_seconds', coalesce(v_max_gap,0),
        'replay_checkpoint_count', jsonb_array_length(v_checkpoints),
        'finalization_source', 'persisted_result_lifecycle_v1'
      );

      v_finalize := public.universal_race_stage_finalize_scenario_v1(
        v_row.stage_id,
        v_row.simulation_run_id,
        v_outcome,
        '[]'::jsonb
      );

      if coalesce(v_finalize->>'status','') = 'completed' then
        v_finalized := v_finalized + 1;
      else
        v_failed := v_failed + 1;
      end if;
      v_results := v_results || jsonb_build_array(v_finalize);
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status','failed',
        'stage_id',v_row.stage_id,
        'simulation_run_id',v_row.simulation_run_id,
        'error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'finalized_count',v_finalized,
    'failed_count',v_failed,
    'results',v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempts integer := 0;
  v_has_authority boolean := false;
begin
  if p_stage_id is null then
    return jsonb_build_object('status','blocked','reason','stage_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_circuit_breaker:'||p_stage_id::text,0));

  if exists (
    select 1 from public.race_stage_calculation_quarantine_v1 q where q.stage_id=p_stage_id
  ) then
    return jsonb_build_object(
      'status','blocked','reason','stage_auto_quarantined','stage_id',p_stage_id,
      'worker_model','per_stage_circuit_breaker_v1'
    );
  end if;

  select count(*)::integer into v_attempts
  from public.race_stage_simulation_runs s
  where s.stage_id=p_stage_id
    and s.engine_version='race_engine_ts_v1'
    and s.simulation_mode='deterministic_road_race_v1';

  select exists(
    select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id
  ) into v_has_authority;

  if not v_has_authority and v_attempts >= 12 then
    insert into public.race_stage_calculation_quarantine_v1(stage_id,reason,attempt_count,details)
    values(
      p_stage_id,
      'automatic_attempt_limit_exceeded',
      v_attempts,
      jsonb_build_object(
        'threshold',12,
        'model','per_stage_circuit_breaker_v1',
        'quarantined_at_real',clock_timestamp()
      )
    )
    on conflict(stage_id) do update
      set reason=excluded.reason,
          attempt_count=excluded.attempt_count,
          quarantined_at=clock_timestamp(),
          details=excluded.details;

    update public.race_stage_simulation_runs s
       set status='failed',
           failed_at=coalesce(s.failed_at,clock_timestamp()),
           error_message='Automatic calculation quarantined after excessive attempts; unrelated stages remain eligible.',
           result_summary_json=coalesce(s.result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'survival_phase','auto_quarantined_excessive_attempts',
                  'calculation_status','quarantined',
                  'auto_quarantine_model','per_stage_circuit_breaker_v1',
                  'auto_quarantine_attempt_count',v_attempts,
                  'auto_quarantined_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where s.stage_id=p_stage_id
       and s.engine_version='race_engine_ts_v1'
       and s.simulation_mode='deterministic_road_race_v1'
       and s.status in ('running','failed')
       and not exists (
         select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
       );

    return jsonb_build_object(
      'status','blocked','reason','stage_auto_quarantined','stage_id',p_stage_id,
      'attempt_count',v_attempts,'attempt_limit',12,
      'worker_model','per_stage_circuit_breaker_v1'
    );
  end if;

  return public.universal_race_stage_claim_calculation_v2_impl(p_stage_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_stage_replay_availability_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_calculation_lead_hours integer := 3;

  v_state_run_id uuid;
  v_state_status text;
  v_state_error text;
  v_state_details jsonb := '{}'::jsonb;

  v_run_id uuid;
  v_run_race_id uuid;
  v_run_status text;

  v_calculated boolean := false;
  v_replay_closes_at_real timestamptz;
  v_results_published boolean := false;
  v_replay_window_elapsed boolean := false;
  v_results_visible boolean := false;
begin
  select coalesce(control.typescript_calculation_lead_hours, 3)::integer
  into v_calculation_lead_hours
  from public.race_engine_runtime_control_v1 control
  where control.singleton_id = true;

  select
    stage.stage_date::timestamp
      + make_interval(
          hours => coalesce(stage.planned_start_hour_number, 12),
          mins => coalesce(stage.planned_start_minute, 0)
        )
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_start_game_at is null then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', 'stage_not_found_or_unscheduled',
      'stage_id', p_stage_id,
      'calculated', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_calculation_lead_hours, 3));

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select
    state.simulation_run_id,
    state.last_status,
    state.last_error,
    coalesce(state.details, '{}'::jsonb)
  into
    v_state_run_id,
    v_state_status,
    v_state_error,
    v_state_details
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id;

  if v_state_run_id is not null then
    select
      run.id,
      run.race_id,
      run.status
    into
      v_run_id,
      v_run_race_id,
      v_run_status
    from public.race_stage_simulation_runs run
    where run.id = v_state_run_id
      and run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status in ('running', 'completed')
    limit 1;
  end if;

  if v_run_id is null then
    select
      run.id,
      run.race_id,
      run.status
    into
      v_run_id,
      v_run_race_id,
      v_run_status
    from public.race_stage_simulation_runs run
    where run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status = 'completed'
    order by run.updated_at desc, run.created_at desc, run.id desc
    limit 1;
  end if;

  v_calculated :=
    v_run_id is not null
    and (
      v_run_status = 'completed'
      or coalesce(v_state_status, '') in (
        'calculated_hidden',
        'replay_live',
        'published'
      )
    );

  if not v_calculated then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case
        when v_current_game_at < v_calculation_due_game_at
          then 'awaiting_calculation_window'
        else 'awaiting_backend_calculation'
      end,
      'stage_id', p_stage_id,
      'calculated', false,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  if v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'race_id', v_run_race_id,
      'calculated', true,
      'simulation_run_id', v_run_id,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_visible', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_replay_closes_at_real := nullif(
    v_state_details ->> 'replay_closes_at_real',
    ''
  )::timestamptz;

  v_results_published :=
    v_run_status = 'completed'
    or coalesce(v_state_status, '') = 'published';

  v_replay_window_elapsed :=
    v_replay_closes_at_real is not null
    and now() >= v_replay_closes_at_real;

  v_results_visible := v_results_published or v_replay_window_elapsed;

  return jsonb_build_object(
    'status', 'available',
    'stage_id', p_stage_id,
    'race_id', v_run_race_id,
    'calculated', true,
    'simulation_run_id', v_run_id,
    'replay_opens_game_at', v_stage_start_game_at,
    'results_visible', v_results_visible,
    'publication_pending',
      v_replay_window_elapsed and not v_results_published,
    'publication_error', v_state_error,
    'browser_calculation_allowed', false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inbox_send_admin_season_message_to_user_v1(p_user_id uuid, p_season_number integer, p_subject text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conversation_id uuid;
begin
  if p_season_number is null or p_season_number < 1 then
    raise exception 'Valid season number is required';
  end if;

  if coalesce(length(trim(p_subject)), 0) = 0 then
    raise exception 'Subject is required';
  end if;

  if coalesce(length(trim(p_body)), 0) = 0 then
    raise exception 'Message body is required';
  end if;

  v_conversation_id := public.inbox_get_or_create_admin_conversation(p_user_id);

  update public.inbox_conversations
  set subject = trim(p_subject)
  where id = v_conversation_id;

  insert into public.inbox_messages (
    conversation_id,
    sender_user_id,
    sender_kind,
    sender_label,
    body,
    game_season_number
  )
  values (
    v_conversation_id,
    null,
    'admin',
    'Admin',
    trim(p_body),
    p_season_number
  );

  return v_conversation_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inbox_clear_future_season_system_state_v1(p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_affected_conversations uuid[] := array[]::uuid[];
  v_deleted_messages integer := 0;
  v_deleted_guard_rows integer := 0;
  v_deleted_empty_conversations integer := 0;
begin
  if p_target_season is null or p_target_season < 1 then
    raise exception 'Valid target season is required';
  end if;

  select coalesce(array_agg(distinct m.conversation_id), array[]::uuid[])
  into v_affected_conversations
  from public.inbox_messages m
  join public.inbox_conversations c
    on c.id = m.conversation_id
  where c.conversation_type = 'admin_direct'
    and m.sender_kind = 'admin'
    and (
      coalesce(m.game_season_number, 0) > p_target_season
      or coalesce(
        nullif(
          substring(
            m.body
            from 'refreshed for Season ([0-9]+)\.'
          ),
          ''
        )::integer,
        0
      ) > p_target_season
      or (
        p_target_season = 1
        and m.body =
          'Welcome to the new season. Seasonal standings have been refreshed. Open the game to review your club status, new objectives, and current competition.'
      )
    );

  delete from public.inbox_messages m
  using public.inbox_conversations c
  where c.id = m.conversation_id
    and c.conversation_type = 'admin_direct'
    and m.sender_kind = 'admin'
    and (
      coalesce(m.game_season_number, 0) > p_target_season
      or coalesce(
        nullif(
          substring(
            m.body
            from 'refreshed for Season ([0-9]+)\.'
          ),
          ''
        )::integer,
        0
      ) > p_target_season
      or (
        p_target_season = 1
        and m.body =
          'Welcome to the new season. Seasonal standings have been refreshed. Open the game to review your club status, new objectives, and current competition.'
      )
    );

  get diagnostics v_deleted_messages = row_count;

  delete from public.inbox_season_start_guard
  where season_number > p_target_season;

  get diagnostics v_deleted_guard_rows = row_count;

  if cardinality(v_affected_conversations) > 0 then
    update public.inbox_conversations c
    set
      subject = 'Admin',
      last_message_at = (
        select max(m.created_at)
        from public.inbox_messages m
        where m.conversation_id = c.id
      ),
      updated_at = clock_timestamp()
    where c.id = any(v_affected_conversations)
      and exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = c.id
      );

    delete from public.inbox_conversation_participants cp
    where cp.conversation_id = any(v_affected_conversations)
      and not exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = cp.conversation_id
      );

    delete from public.inbox_conversations c
    where c.id = any(v_affected_conversations)
      and not exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = c.id
      );

    get diagnostics v_deleted_empty_conversations = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'target_season', p_target_season,
    'deleted_messages', v_deleted_messages,
    'deleted_guard_rows', v_deleted_guard_rows,
    'deleted_empty_admin_conversations', v_deleted_empty_conversations
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_app_admin_v1()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then
    return false;
  end if;

  select lower(trim(coalesce(u.email, '')))
  into v_email
  from auth.users u
  where u.id = v_user_id;

  if coalesce(v_email, '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.app_admins a
    where a.is_active = true
      and (
        a.user_id = v_user_id
        or lower(a.email) = v_email
      )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_site_analytics_event_v1(p_visitor_id uuid, p_session_id uuid, p_path text, p_country_code text, p_device_type text, p_referrer_host text DEFAULT NULL::text, p_hostname text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_date date := (clock_timestamp() at time zone 'UTC')::date;
  v_user_id uuid := auth.uid();
  v_path text;
  v_country text;
  v_device text;
  v_referrer text;
  v_hostname text;
begin
  v_hostname := lower(trim(coalesce(p_hostname, '')));

  -- Production site only. Preview deployments, localhost and staging are rejected.
  if v_hostname not in ('propelotonmanager.com', 'www.propelotonmanager.com') then
    return false;
  end if;

  if p_visitor_id is null or p_session_id is null then
    return false;
  end if;

  v_path := split_part(trim(coalesce(p_path, '/')), '?', 1);
  v_path := split_part(v_path, '#', 1);

  if v_path = '' then
    v_path := '/';
  end if;

  if left(v_path, 1) <> '/' then
    v_path := '/' || v_path;
  end if;

  v_path := left(v_path, 300);

  -- Never count administrators opening the analytics dashboard itself.
  if v_path = '/dashboard/admin/analytics'
     or v_path like '/dashboard/admin/analytics/%' then
    return false;
  end if;

  v_country := upper(trim(coalesce(p_country_code, 'XX')));
  if v_country !~ '^[A-Z]{2}$' then
    v_country := 'XX';
  end if;

  v_device := lower(trim(coalesce(p_device_type, '')));
  if v_device not in ('desktop','tablet','mobile') then
    v_device := 'desktop';
  end if;

  v_referrer := lower(trim(coalesce(p_referrer_host, '')));
  if v_referrer = '' or v_referrer = v_hostname
     or v_referrer in ('propelotonmanager.com','www.propelotonmanager.com') then
    v_referrer := null;
  else
    v_referrer := left(v_referrer, 255);
  end if;

  insert into public.site_analytics_daily_visitors (
    analytics_date,
    visitor_id,
    user_id,
    country_code,
    device_type,
    first_seen_at,
    last_seen_at,
    pageview_count
  )
  values (
    v_date,
    p_visitor_id,
    v_user_id,
    v_country,
    v_device,
    v_now,
    v_now,
    1
  )
  on conflict (analytics_date, visitor_id) do update
  set
    user_id = coalesce(excluded.user_id, public.site_analytics_daily_visitors.user_id),
    country_code = case
      when excluded.country_code <> 'XX' then excluded.country_code
      else public.site_analytics_daily_visitors.country_code
    end,
    device_type = excluded.device_type,
    first_seen_at = least(public.site_analytics_daily_visitors.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.site_analytics_daily_visitors.last_seen_at, excluded.last_seen_at),
    pageview_count = public.site_analytics_daily_visitors.pageview_count + 1;

  insert into public.site_analytics_daily_sessions (
    analytics_date,
    session_id,
    visitor_id,
    user_id,
    country_code,
    device_type,
    referrer_host,
    started_at,
    last_seen_at,
    pageview_count
  )
  values (
    v_date,
    p_session_id,
    p_visitor_id,
    v_user_id,
    v_country,
    v_device,
    v_referrer,
    v_now,
    v_now,
    1
  )
  on conflict (analytics_date, session_id) do update
  set
    visitor_id = excluded.visitor_id,
    user_id = coalesce(excluded.user_id, public.site_analytics_daily_sessions.user_id),
    country_code = case
      when excluded.country_code <> 'XX' then excluded.country_code
      else public.site_analytics_daily_sessions.country_code
    end,
    device_type = excluded.device_type,
    referrer_host = coalesce(public.site_analytics_daily_sessions.referrer_host, excluded.referrer_host),
    started_at = least(public.site_analytics_daily_sessions.started_at, excluded.started_at),
    last_seen_at = greatest(public.site_analytics_daily_sessions.last_seen_at, excluded.last_seen_at),
    pageview_count = public.site_analytics_daily_sessions.pageview_count + 1;

  insert into public.site_analytics_daily_pages (
    analytics_date,
    visitor_id,
    path,
    pageview_count,
    first_seen_at,
    last_seen_at
  )
  values (
    v_date,
    p_visitor_id,
    v_path,
    1,
    v_now,
    v_now
  )
  on conflict (analytics_date, visitor_id, path) do update
  set
    pageview_count = public.site_analytics_daily_pages.pageview_count + 1,
    first_seen_at = least(public.site_analytics_daily_pages.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.site_analytics_daily_pages.last_seen_at, excluded.last_seen_at);

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_dashboard_v1(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_end_date date := (clock_timestamp() at time zone 'UTC')::date;
  v_start_date date;
  v_days integer := coalesce(p_days, 30);
  v_result jsonb;
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_days not in (0, 7, 30, 90, 365) then
    raise exception 'Unsupported analytics period. Use 7, 30, 90, 365 or 0 for all time.';
  end if;

  if v_days = 0 then
    select least(
      coalesce(
        (select min(v.analytics_date) from public.site_analytics_daily_visitors v),
        v_end_date
      ),
      coalesce(
        (
          select min((u.created_at at time zone 'UTC')::date)
          from auth.users u
          where u.deleted_at is null
            and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
        ),
        v_end_date
      )
    )
    into v_start_date;
  else
    v_start_date := v_end_date - (v_days - 1);
  end if;

  select jsonb_build_object(
    'timezone', 'UTC',
    'start_date', v_start_date,
    'end_date', v_end_date,
    'days', v_days,
    'summary', jsonb_build_object(
      'unique_visitors', (
        select count(distinct v.visitor_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
      ),
      'pageviews', (
        select coalesce(sum(v.pageview_count),0)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
      ),
      'sessions', (
        select count(distinct s.session_id)
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
      ),
      'registered_active_users', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
          and v.user_id is not null
      ),
      'anonymous_visitors', (
        select count(distinct v.visitor_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
          and v.user_id is null
          and not exists (
            select 1
            from public.site_analytics_daily_visitors vr
            where vr.analytics_date between v_start_date and v_end_date
              and vr.visitor_id = v.visitor_id
              and vr.user_id is not null
          )
      ),
      'new_registrations', (
        select count(*)
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
          and (u.created_at at time zone 'UTC')::date
              between v_start_date and v_end_date
      ),
      'total_registered_accounts', (
        select count(*)
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
      ),
      'dau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date = v_end_date
          and v.user_id is not null
      ),
      'wau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_end_date - 6 and v_end_date
          and v.user_id is not null
      ),
      'mau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_end_date - 29 and v_end_date
          and v.user_id is not null
      )
    ),
    'daily', (
      with calendar as (
        select generate_series(
          v_start_date::timestamp,
          v_end_date::timestamp,
          interval '1 day'
        )::date as analytics_date
      ),
      visitors as (
        select
          v.analytics_date,
          count(distinct v.visitor_id) as unique_visitors,
          coalesce(sum(v.pageview_count),0) as pageviews,
          count(distinct v.user_id) filter (where v.user_id is not null)
            as active_registered_users
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
        group by v.analytics_date
      ),
      sessions as (
        select
          s.analytics_date,
          count(distinct s.session_id) as sessions
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
        group by s.analytics_date
      ),
      registrations as (
        select
          (u.created_at at time zone 'UTC')::date as analytics_date,
          count(*) as new_registrations
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
          and (u.created_at at time zone 'UTC')::date
              between v_start_date and v_end_date
        group by 1
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', c.analytics_date,
            'unique_visitors', coalesce(v.unique_visitors,0),
            'pageviews', coalesce(v.pageviews,0),
            'sessions', coalesce(s.sessions,0),
            'active_registered_users', coalesce(v.active_registered_users,0),
            'new_registrations', coalesce(r.new_registrations,0)
          )
          order by c.analytics_date
        ),
        '[]'::jsonb
      )
      from calendar c
      left join visitors v using (analytics_date)
      left join sessions s using (analytics_date)
      left join registrations r using (analytics_date)
    ),
    'countries', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'country_code', q.country_code,
            'country_name', q.country_name,
            'unique_visitors', q.unique_visitors,
            'pageviews', q.pageviews
          )
          order by q.unique_visitors desc, q.pageviews desc, q.country_code
        ),
        '[]'::jsonb
      )
      from (
        select
          v.country_code,
          coalesce(c.name, case when v.country_code='XX' then 'Unknown' else v.country_code end)
            as country_name,
          count(distinct v.visitor_id) as unique_visitors,
          coalesce(sum(v.pageview_count),0) as pageviews
        from public.site_analytics_daily_visitors v
        left join public.countries c on c.code = v.country_code
        where v.analytics_date between v_start_date and v_end_date
        group by v.country_code, c.name
        order by unique_visitors desc, pageviews desc
        limit 100
      ) q
    ),
    'top_pages', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'path', q.path,
            'pageviews', q.pageviews,
            'unique_visitors', q.unique_visitors
          )
          order by q.pageviews desc, q.unique_visitors desc, q.path
        ),
        '[]'::jsonb
      )
      from (
        select
          p.path,
          coalesce(sum(p.pageview_count),0) as pageviews,
          count(distinct p.visitor_id) as unique_visitors
        from public.site_analytics_daily_pages p
        where p.analytics_date between v_start_date and v_end_date
        group by p.path
        order by pageviews desc, unique_visitors desc
        limit 50
      ) q
    ),
    'devices', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_type', q.device_type,
            'visitors', q.visitors,
            'pageviews', q.pageviews
          )
          order by q.visitors desc, q.device_type
        ),
        '[]'::jsonb
      )
      from (
        select
          v.device_type,
          count(distinct v.visitor_id) as visitors,
          coalesce(sum(v.pageview_count),0) as pageviews
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
        group by v.device_type
      ) q
    ),
    'traffic_sources', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'referrer_host', q.referrer_host,
            'sessions', q.sessions,
            'unique_visitors', q.unique_visitors
          )
          order by q.sessions desc, q.unique_visitors desc, q.referrer_host
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(nullif(s.referrer_host,''), 'Direct') as referrer_host,
          count(distinct s.session_id) as sessions,
          count(distinct s.visitor_id) as unique_visitors
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
        group by coalesce(nullif(s.referrer_host,''), 'Direct')
        order by sessions desc, unique_visitors desc
        limit 50
      ) q
    )
  )
  into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_bug_report_unread_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.bug_reports br
  where not exists (
    select 1
    from public.bug_report_admin_reads r
    where r.bug_report_id = br.id
      and r.admin_user_id = v_admin_user_id
  );

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_bug_reports_v1(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if p_status is not null
     and p_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Invalid bug report status'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'counts',
    jsonb_build_object(
      'total', count(*)::integer,
      'unread', count(*) filter (
        where not exists (
          select 1
          from public.bug_report_admin_reads rr
          where rr.bug_report_id = br.id
            and rr.admin_user_id = v_admin_user_id
        )
      )::integer,
      'open', count(*) filter (where br.status = 'open')::integer,
      'in_progress', count(*) filter (where br.status = 'in_progress')::integer,
      'resolved', count(*) filter (where br.status = 'resolved')::integer,
      'closed', count(*) filter (where br.status = 'closed')::integer
    ),
    'reports',
    coalesce(
      (
        select jsonb_agg(to_jsonb(report_row) order by report_row.created_at desc)
        from (
          select
            b.id,
            b.created_at,
            b.updated_at,
            b.user_id,
            b.page_label,
            b.page_path,
            b.page_url,
            b.description,
            b.severity,
            b.browser,
            b.viewport,
            b.reported_from,
            b.status,
            b.priority,
            b.assigned_admin_id,
            b.resolved_at,
            b.bug_type,
            b.expected_result,
            b.actual_result,
            b.steps_to_reproduce,
            b.screenshot_path,
            b.screenshot_url,
            p.username as reporter_username,
            p.email as reporter_email,
            nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as reporter_full_name,
            c.id as club_id,
            c.name as club_name,
            not exists (
              select 1
              from public.bug_report_admin_reads r
              where r.bug_report_id = b.id
                and r.admin_user_id = v_admin_user_id
            ) as is_unread
          from public.bug_reports b
          left join public.profiles p
            on p.id = b.user_id
          left join lateral (
            select club.id, club.name
            from public.clubs club
            where club.owner_user_id = b.user_id
              and club.deleted_at is null
            order by
              case when club.club_type = 'main' then 0 else 1 end,
              club.created_at asc
            limit 1
          ) c on true
          where p_status is null or b.status = p_status
          order by b.created_at desc
          limit v_limit
        ) report_row
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.bug_reports br;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_admin_bug_report_read_v1(p_report_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.bug_reports
    where id = p_report_id
  ) then
    return false;
  end if;

  insert into public.bug_report_admin_reads (
    bug_report_id,
    admin_user_id,
    read_at
  )
  values (
    p_report_id,
    v_admin_user_id,
    now()
  )
  on conflict (bug_report_id, admin_user_id)
  do update set read_at = excluded.read_at;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_bug_report_notes_v1(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'bug_report_id', n.bug_report_id,
        'admin_user_id', n.admin_user_id,
        'author', coalesce(p.username, p.email, 'Administrator'),
        'note', n.note,
        'created_at', n.created_at
      )
      order by n.created_at asc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.bug_report_notes n
  left join public.profiles p
    on p.id = n.admin_user_id
  where n.bug_report_id = p_report_id;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_add_bug_report_note_v1(p_report_id uuid, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_note_id uuid;
  v_note text := trim(coalesce(p_note, ''));
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_note = '' then
    raise exception 'Note cannot be empty'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.bug_reports
    where id = p_report_id
  ) then
    raise exception 'Bug report not found'
      using errcode = 'P0002';
  end if;

  insert into public.bug_report_notes (
    bug_report_id,
    admin_user_id,
    note
  )
  values (
    p_report_id,
    v_admin_user_id,
    v_note
  )
  returning id into v_note_id;

  return v_note_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_bug_report_v1(p_report_id uuid, p_status text, p_priority text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_status text := coalesce(nullif(trim(p_status), ''), 'open');
  v_priority text := coalesce(nullif(trim(p_priority), ''), 'normal');
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Invalid bug report status'
      using errcode = '22023';
  end if;

  if v_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid bug report priority'
      using errcode = '22023';
  end if;

  update public.bug_reports
  set
    status = v_status,
    priority = v_priority,
    updated_at = now(),
    resolved_at = case
      when v_status in ('resolved', 'closed') then coalesce(resolved_at, now())
      else null
    end
  where id = p_report_id;

  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_homepage_review_pending_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.homepage_player_reviews
  where status = 'pending';

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_enforce_parent_start_time_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hour integer;
  v_minute integer;
begin
  select r.planned_start_hour_number, coalesce(r.planned_start_minute,0)
    into v_hour, v_minute
  from public.races r
  where r.id = new.race_id;

  if found and v_hour is not null then
    new.planned_start_hour_number := v_hour;
    new.planned_start_minute := v_minute;
    new.planned_start_time_label :=
      lpad(v_hour::text,2,'0') || ':' || lpad(v_minute::text,2,'0');
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_propagate_start_time_to_stages_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_label text;
begin
  if new.planned_start_hour_number is distinct from old.planned_start_hour_number
     or coalesce(new.planned_start_minute,0) is distinct from coalesce(old.planned_start_minute,0)
     or new.planned_start_time_label is distinct from old.planned_start_time_label
  then
    if new.planned_start_hour_number is not null then
      v_label :=
        lpad(new.planned_start_hour_number::text,2,'0')
        || ':'
        || lpad(coalesce(new.planned_start_minute,0)::text,2,'0');
    else
      v_label := new.planned_start_time_label;
    end if;

    update public.race_stages stage
       set planned_start_hour_number = new.planned_start_hour_number,
           planned_start_minute = coalesce(new.planned_start_minute,0),
           planned_start_time_label = v_label,
           updated_at = clock_timestamp()
     where stage.race_id = new.id
       and not exists (
         select 1
         from public.race_stage_authoritative_runs authority
         where authority.stage_id = stage.id
       );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_contact_message_unread_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.contact_messages m
  where m.admin_status = 'open'
    and not exists (
      select 1
      from public.contact_message_admin_reads r
      where r.contact_message_id = m.id
        and r.admin_user_id = v_admin_user_id
    );

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_contact_messages_v1(p_view text DEFAULT 'open'::text, p_limit integer DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_view text := lower(trim(coalesce(p_view, 'open')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_view not in ('open','archived','all') then
    raise exception 'Invalid contact message view'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'counts',
    jsonb_build_object(
      'total', count(*)::integer,
      'open', count(*) filter (where m.admin_status = 'open')::integer,
      'archived', count(*) filter (where m.admin_status = 'archived')::integer,
      'unread', count(*) filter (
        where m.admin_status = 'open'
          and not exists (
            select 1
            from public.contact_message_admin_reads rr
            where rr.contact_message_id = m.id
              and rr.admin_user_id = v_admin_user_id
          )
      )::integer,
      'failed_email', count(*) filter (where m.email_status = 'failed')::integer
    ),
    'messages',
    coalesce(
      (
        select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
        from (
          select
            cm.id,
            cm.user_id,
            cm.sender_name,
            cm.sender_email,
            cm.message,
            cm.source,
            cm.email_status,
            cm.resend_email_id,
            cm.delivery_error,
            cm.email_sent_at,
            cm.admin_status,
            cm.archived_at,
            cm.archived_by,
            cm.created_at,
            cm.updated_at,
            not exists (
              select 1
              from public.contact_message_admin_reads r
              where r.contact_message_id = cm.id
                and r.admin_user_id = v_admin_user_id
            ) as is_unread
          from public.contact_messages cm
          where
            v_view = 'all'
            or (v_view = 'open' and cm.admin_status = 'open')
            or (v_view = 'archived' and cm.admin_status = 'archived')
          order by cm.created_at desc
          limit v_limit
        ) row_data
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.contact_messages m;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_admin_contact_message_read_v1(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.contact_messages where id = p_message_id
  ) then
    return false;
  end if;

  insert into public.contact_message_admin_reads (
    contact_message_id,
    admin_user_id,
    read_at
  )
  values (
    p_message_id,
    v_admin_user_id,
    now()
  )
  on conflict (contact_message_id, admin_user_id)
  do update set read_at = excluded.read_at;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_archive_contact_message_v1(p_message_id uuid, p_archived boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  update public.contact_messages
  set
    admin_status = case when p_archived then 'archived' else 'open' end,
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then v_admin_user_id else null end,
    updated_at = now()
  where id = p_message_id;

  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_operations_refresh_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game_now timestamptz;
  v_history_days integer;
  v_calc_grace integer;
  v_replay_grace integer;
  v_completion_grace integer;
  v_problem_count integer;
  v_row_count integer;
begin
  select
    public.get_current_game_timestamp(),
    history_game_days,
    calculation_grace_game_minutes,
    replay_grace_game_minutes,
    completion_grace_game_minutes
  into
    v_game_now,
    v_history_days,
    v_calc_grace,
    v_replay_grace,
    v_completion_grace
  from public.race_operations_config_v1
  where id = true;

  if v_game_now is null then
    raise exception 'Current game timestamp is unavailable';
  end if;

  with candidates as (
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      r.category as race_category,
      (coalesce(cr.prize_fund_min_cash, 0) > 0) as prizes_expected,
      coalesce(cr.ranking_points_enabled, true) as ranking_points_enabled,
      s.stage_number,
      s.name as stage_name,
      public.race_stage_planned_start_game_at_v1(s.id) as stage_start_game_at,
      coalesce(s.weather_cancelled, false) as stage_weather_cancelled,
      lower(coalesce(r.status, '')) in ('cancelled','canceled') as race_cancelled
    from public.race_stages s
    join public.races r on r.id = s.race_id
    left join public.race_category_rules cr
      on cr.race_class_code = r.category
    where s.stage_date between
      (v_game_now::date - v_history_days)
      and
      (v_game_now::date + 1)
  ),
  metrics as (
    select
      c.*,
      a.last_status as automation_status,
      a.simulation_run_id,
      coalesce(a.attempt_count, 0) as attempt_count,
      a.last_error,
      a.details,
      sr.status as simulation_run_status,
      sr.engine_version,
      coalesce(
        nullif(a.details->>'calculation_due_game_at', '')::timestamptz,
        case
          when w.calculation_due_game_at is not null
            then w.calculation_due_game_at at time zone 'UTC'
          else c.stage_start_game_at - interval '3 hours'
        end
      ) as calculation_due_game_at,
      coalesce(
        nullif(a.details->>'official_results_reveal_game_at', '')::timestamptz,
        c.stage_start_game_at + interval '30 minutes'
      ) as results_due_game_at,
      nullif(a.details->>'calculated_at_real', '')::timestamptz
        as calculation_completed_at_real,
      coalesce((a.details->>'manifest_ready')::boolean, false)
        as replay_manifest_ready,
      nullif(a.details->>'replay_opened_game_at', '')::timestamptz
        as replay_opened_game_at,
      nullif(a.details->>'replay_opened_at_real', '')::timestamptz
        as replay_opened_at_real,
      nullif(a.details->>'replay_closes_at_real', '')::timestamptz
        as replay_closed_at_real,
      coalesce((a.details->>'results_published')::boolean, false)
        as results_published,
      coalesce((a.details->>'official_outputs_persisted')::boolean, false)
        as official_outputs_persisted,
      nullif(a.details->>'results_published_at_real', '')::timestamptz
        as results_published_at_real,
      nullif(a.details->>'survival_phase', '') as survival_phase,
      coalesce(res.result_rows, 0) as stage_result_rows,
      coalesce(cls.classification_rows, 0) as classification_rows,
      coalesce(rankings.ranking_award_rows, 0) as ranking_award_rows,
      coalesce(prizes.prize_award_rows, 0) as prize_award_rows,
      coalesce(prizes.paid_prize_award_rows, 0) as paid_prize_award_rows
    from candidates c
    left join public.race_stage_automation_state a
      on a.stage_id = c.stage_id
    left join public.race_engine_due_stage_watchdog_v1 w
      on w.stage_id = c.stage_id
    left join public.race_stage_simulation_runs sr
      on sr.id = a.simulation_run_id
    left join lateral (
      select count(*)::integer as result_rows
      from public.race_stage_results x
      where x.stage_id = c.stage_id
    ) res on true
    left join lateral (
      select count(*)::integer as classification_rows
      from public.race_classification_standings x
      where x.after_stage_id = c.stage_id
    ) cls on true
    left join lateral (
      select count(*)::integer as ranking_award_rows
      from public.race_ranking_point_awards x
      where x.stage_id = c.stage_id
    ) rankings on true
    left join lateral (
      select
        count(*)::integer as prize_award_rows,
        count(*) filter (where x.status = 'paid')::integer
          as paid_prize_award_rows
      from public.race_prize_awards x
      where x.stage_id = c.stage_id
    ) prizes on true
    where c.stage_start_game_at is not null
  ),
  derived as (
    select
      m.*,
      (m.stage_weather_cancelled or m.race_cancelled) as is_cancelled,
      (
        m.calculation_completed_at_real is not null
        or m.replay_manifest_ready
        or m.automation_status in (
          'calculated_hidden','replay_live','published','completed'
        )
        or m.stage_result_rows > 0
        or m.simulation_run_status = 'completed'
      ) as calculation_done,
      (
        m.replay_manifest_ready
        or m.automation_status in ('replay_live','published','completed')
        or m.results_published
      ) as replay_ready,
      (
        m.automation_status = 'published'
        and m.results_published
        and m.official_outputs_persisted
        and m.stage_result_rows > 0
        and m.classification_rows > 0
        and (
          not m.prizes_expected
          or (
            m.prize_award_rows > 0
            and m.paid_prize_award_rows = m.prize_award_rows
          )
        )
        and (
          not m.ranking_points_enabled
          or m.ranking_award_rows > 0
        )
      ) as completion_done
    from metrics m
  ),
  evaluated as (
    select
      d.*,
      case
        when d.is_cancelled then 'cancelled'
        when d.calculation_done then 'done'
        /* An active worker is progress, not an overdue failure. Evaluate this
         * before deadline/failed presentation so recovery and long-running
         * calculations are shown truthfully in Race Operations. */
        when d.automation_status = 'calculating'
          or d.simulation_run_status = 'running' then 'running'
        when d.automation_status = 'failed'
          or d.simulation_run_status = 'failed' then
          case
            when v_game_now < d.stage_start_game_at - interval '15 minutes'
              then 'running'
            else 'failed'
          end
        when v_game_now >= d.calculation_due_game_at
             + make_interval(mins => v_calc_grace) then 'overdue'
        else 'waiting'
      end as calculation_status,
      case
        when d.is_cancelled then 'cancelled'
        when d.replay_ready then 'ready'
        when not d.calculation_done then 'blocked'
        when v_game_now >= d.stage_start_game_at
             + make_interval(mins => v_replay_grace) then 'overdue'
        else 'waiting'
      end as replay_status,
      case
        when d.is_cancelled then 'cancelled'
        when d.completion_done then 'done'
        when not d.calculation_done or not d.replay_ready then 'blocked'
        when v_game_now >= d.results_due_game_at
             + make_interval(mins => v_completion_grace) then 'overdue'
        else 'waiting'
      end as completion_status
    from derived d
  ),
  final_rows as (
    select
      e.*,
      case
        when e.is_cancelled or e.completion_done then false
        when e.calculation_status in ('failed','overdue') then true
        when e.replay_status = 'overdue' then true
        when e.completion_status = 'overdue' then true
        else false
      end as has_problem,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed' then 'engine_failed'
        when e.calculation_status = 'overdue' then 'calculation_overdue'
        when e.replay_status = 'overdue' then 'replay_not_ready'
        when e.completion_status = 'overdue' then 'completion_incomplete'
        else null
      end as issue_key,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed' then 'critical'
        when e.calculation_status = 'overdue' then 'critical'
        when e.replay_status = 'overdue' then 'high'
        when e.completion_status = 'overdue' then 'high'
        else null
      end as issue_severity,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed'
          then coalesce(
            nullif(e.last_error, ''),
            'The production race-engine run exhausted its automatic recovery window.'
          )
        when e.calculation_status = 'overdue'
          then 'The stage calculation deadline passed without a completed calculation.'
        when e.replay_status = 'overdue'
          then 'The stage reached race time but the replay package is not ready.'
        when e.completion_status = 'overdue'
          then 'The replay/result window passed but official results or post-race processing are incomplete.'
        else null
      end as issue_message
    from evaluated e
  )
  insert into public.race_operations_stage_status_v1 (
    stage_id, race_id, race_name, race_category, stage_number, stage_name,
    stage_start_game_at, calculation_due_game_at, results_due_game_at,
    game_now_at_check, calculation_status, calculation_completed_at_real,
    calculation_run_id, calculation_attempt_count, replay_status,
    replay_manifest_ready, replay_opened_game_at, replay_opened_at_real,
    replay_closed_at_real, completion_status, results_published,
    official_outputs_persisted, stage_result_rows, classification_rows,
    ranking_award_rows, prize_award_rows, paid_prize_award_rows,
    results_published_at_real, automation_status, engine_version,
    survival_phase, last_error, is_cancelled, has_problem, issue_key,
    issue_severity, issue_message, first_problem_at, resolved_at,
    last_checked_at, updated_at
  )
  select
    f.stage_id, f.race_id, f.race_name, f.race_category, f.stage_number,
    f.stage_name, f.stage_start_game_at, f.calculation_due_game_at,
    f.results_due_game_at, v_game_now, f.calculation_status,
    f.calculation_completed_at_real, f.simulation_run_id, f.attempt_count,
    f.replay_status, f.replay_manifest_ready, f.replay_opened_game_at,
    f.replay_opened_at_real, f.replay_closed_at_real, f.completion_status,
    f.results_published, f.official_outputs_persisted, f.stage_result_rows,
    f.classification_rows, f.ranking_award_rows, f.prize_award_rows,
    f.paid_prize_award_rows, f.results_published_at_real,
    f.automation_status, f.engine_version, f.survival_phase, f.last_error,
    f.is_cancelled, f.has_problem, f.issue_key, f.issue_severity,
    f.issue_message, case when f.has_problem then now() else null end,
    null, now(), now()
  from final_rows f
  on conflict (stage_id) do update
  set
    race_id = excluded.race_id,
    race_name = excluded.race_name,
    race_category = excluded.race_category,
    stage_number = excluded.stage_number,
    stage_name = excluded.stage_name,
    stage_start_game_at = excluded.stage_start_game_at,
    calculation_due_game_at = excluded.calculation_due_game_at,
    results_due_game_at = excluded.results_due_game_at,
    game_now_at_check = excluded.game_now_at_check,
    calculation_status = excluded.calculation_status,
    calculation_completed_at_real = excluded.calculation_completed_at_real,
    calculation_run_id = excluded.calculation_run_id,
    calculation_attempt_count = excluded.calculation_attempt_count,
    replay_status = excluded.replay_status,
    replay_manifest_ready = excluded.replay_manifest_ready,
    replay_opened_game_at = excluded.replay_opened_game_at,
    replay_opened_at_real = excluded.replay_opened_at_real,
    replay_closed_at_real = excluded.replay_closed_at_real,
    completion_status = excluded.completion_status,
    results_published = excluded.results_published,
    official_outputs_persisted = excluded.official_outputs_persisted,
    stage_result_rows = excluded.stage_result_rows,
    classification_rows = excluded.classification_rows,
    ranking_award_rows = excluded.ranking_award_rows,
    prize_award_rows = excluded.prize_award_rows,
    paid_prize_award_rows = excluded.paid_prize_award_rows,
    results_published_at_real = excluded.results_published_at_real,
    automation_status = excluded.automation_status,
    engine_version = excluded.engine_version,
    survival_phase = excluded.survival_phase,
    last_error = excluded.last_error,
    is_cancelled = excluded.is_cancelled,
    has_problem = excluded.has_problem,
    issue_key = excluded.issue_key,
    issue_severity = excluded.issue_severity,
    issue_message = excluded.issue_message,
    first_problem_at = case
      when excluded.has_problem then
        case
          when public.race_operations_stage_status_v1.has_problem
               and public.race_operations_stage_status_v1.issue_key
                   is not distinct from excluded.issue_key
          then coalesce(
            public.race_operations_stage_status_v1.first_problem_at,
            excluded.first_problem_at
          )
          else excluded.first_problem_at
        end
      else null
    end,
    resolved_at = case
      when excluded.has_problem then null
      when public.race_operations_stage_status_v1.has_problem then now()
      else public.race_operations_stage_status_v1.resolved_at
    end,
    last_checked_at = now(),
    updated_at = now();

  update public.race_operations_incidents_v1 i
  set
    resolved_at = now(),
    resolution_message = 'The monitor no longer detects this problem.',
    last_seen_at = now(),
    updated_at = now()
  where i.resolved_at is null
    and exists (
      select 1
      from public.race_operations_stage_status_v1 s
      where s.stage_id = i.stage_id
        and (
          not s.has_problem
          or s.issue_key is distinct from i.issue_key
        )
    );

  insert into public.race_operations_incidents_v1 (
    stage_id, race_id, race_name, stage_number, issue_key, severity,
    message, stage_start_game_at, detected_game_at, detected_at,
    last_seen_at, metadata
  )
  select
    s.stage_id, s.race_id, s.race_name, s.stage_number, s.issue_key,
    s.issue_severity, s.issue_message, s.stage_start_game_at,
    s.game_now_at_check, now(), now(),
    jsonb_build_object(
      'calculation_status', s.calculation_status,
      'replay_status', s.replay_status,
      'completion_status', s.completion_status,
      'automation_status', s.automation_status,
      'engine_version', s.engine_version,
      'survival_phase', s.survival_phase,
      'last_error', s.last_error,
      'calculation_due_game_at', s.calculation_due_game_at,
      'results_due_game_at', s.results_due_game_at
    )
  from public.race_operations_stage_status_v1 s
  where s.has_problem
    and s.issue_key is not null
    and not exists (
      select 1
      from public.race_operations_incidents_v1 i
      where i.stage_id = s.stage_id
        and i.issue_key = s.issue_key
        and i.resolved_at is null
    );

  update public.race_operations_incidents_v1 i
  set
    last_seen_at = now(),
    message = s.issue_message,
    severity = s.issue_severity,
    updated_at = now()
  from public.race_operations_stage_status_v1 s
  where i.stage_id = s.stage_id
    and i.issue_key = s.issue_key
    and i.resolved_at is null
    and s.has_problem;

  delete from public.race_operations_stage_status_v1 s
  where s.stage_start_game_at < v_game_now - make_interval(days => v_history_days)
    and not s.has_problem;

  delete from public.race_operations_incidents_v1 i
  where i.resolved_at is not null
    and i.stage_start_game_at < v_game_now - make_interval(days => v_history_days);

  select count(*)::integer into v_problem_count
  from public.race_operations_stage_status_v1
  where has_problem;

  select count(*)::integer into v_row_count
  from public.race_operations_stage_status_v1;

  return jsonb_build_object(
    'ok', true,
    'game_now', v_game_now,
    'rows', v_row_count,
    'problems', v_problem_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_race_operations_problem_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer into v_count
  from public.race_operations_stage_status_v1
  where has_problem;

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_race_operations_v1(p_view text DEFAULT 'today'::text, p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game_now timestamptz;
  v_view text := lower(trim(coalesce(p_view, 'today')));
  v_days integer := greatest(1, least(coalesce(p_days, 7), 30));
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_view not in ('today','problems','history') then
    raise exception 'Invalid race operations view'
      using errcode = '22023';
  end if;

  v_game_now := public.get_current_game_timestamp();

  select jsonb_build_object(
    'game_now', v_game_now,
    'alert_email', (
      select alert_email from public.race_operations_config_v1 where id = true
    ),
    'email_enabled', (
      select email_enabled from public.race_operations_config_v1 where id = true
    ),
    'counts', jsonb_build_object(
      'today_total', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
      )::integer,
      'today_problems', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
          and s.has_problem
      )::integer,
      'active_problems', count(*) filter (
        where s.has_problem
      )::integer,
      'completed_today', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
          and s.completion_status = 'done'
      )::integer
    ),
    'rows', coalesce(
      (
        select jsonb_agg(
          to_jsonb(row_data)
          order by row_data.stage_start_game_at desc
        )
        from (
          select
            s.*,
            i.id as incident_id,
            i.detected_at as incident_detected_at,
            i.email_sent_at as incident_email_sent_at,
            i.email_attempt_count as incident_email_attempt_count,
            i.email_last_error as incident_email_last_error
          from public.race_operations_stage_status_v1 s
          left join lateral (
            select ii.*
            from public.race_operations_incidents_v1 ii
            where ii.stage_id = s.stage_id
              and ii.resolved_at is null
            order by ii.detected_at desc
            limit 1
          ) i on true
          where
            (
              v_view = 'today'
              and s.stage_start_game_at::date = v_game_now::date
            )
            or (
              v_view = 'problems'
              and s.has_problem
            )
            or (
              v_view = 'history'
              and s.stage_start_game_at >= v_game_now - make_interval(days => v_days)
              and s.stage_start_game_at <= v_game_now + interval '1 day'
            )
          order by s.stage_start_game_at desc
        ) row_data
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.race_operations_stage_status_v1 s;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_refresh_race_operations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return public.race_operations_refresh_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_race_stage_terrain_split_v1(p_split jsonb, p_terrain_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_flat numeric := greatest(0, coalesce(nullif(p_split->>'flat','')::numeric, 0));
  v_hilly numeric := greatest(0, coalesce(nullif(p_split->>'hilly','')::numeric, 0));
  v_mountain numeric := greatest(0, coalesce(nullif(p_split->>'mountain','')::numeric, 0));
  v_cobbled numeric := greatest(0, coalesce(nullif(p_split->>'cobbled','')::numeric, 0));
  v_total numeric;
  n_flat numeric;
  n_hilly numeric;
  n_mountain numeric;
  n_cobbled numeric;
begin
  v_total := v_flat + v_hilly + v_mountain + v_cobbled;

  if v_total <= 0 then
    v_flat := case when p_terrain_type='flat' then 100 else 0 end;
    v_hilly := case when p_terrain_type='hilly' then 100 else 0 end;
    v_mountain := case when p_terrain_type='mountain' then 100 else 0 end;
    v_cobbled := case when p_terrain_type='cobbled' then 100 else 0 end;
    v_total := 100;
  end if;

  n_hilly := round((v_hilly / v_total) * 100, 6);
  n_mountain := round((v_mountain / v_total) * 100, 6);
  n_cobbled := round((v_cobbled / v_total) * 100, 6);
  n_flat := round(100 - n_hilly - n_mountain - n_cobbled, 6);

  return jsonb_build_object(
    'flat', n_flat,
    'hilly', n_hilly,
    'mountain', n_mountain,
    'cobbled', n_cobbled
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_race_stage_profile_metadata_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_summit_finish boolean := false;
  v_split jsonb;
  v_terrain_type text;
begin
  v_terrain_type := case
    when new.terrain_type is null then null
    else lower(trim(new.terrain_type))
  end;

  v_split := public.normalize_race_stage_terrain_split_v1(
    new.terrain_split,
    v_terrain_type
  );

  v_summit_finish :=
    coalesce(v_terrain_type, '') = 'mountain'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(new.mountain_climbs, '[]'::jsonb)) climb
      where abs(
        coalesce(nullif(climb->>'km','')::numeric, -999999)
        - coalesce(new.distance_km, 0)
      ) <= 0.25
      and upper(
        regexp_replace(
          coalesce(climb->>'category', climb->>'kom_category', ''),
          '^CAT(EGORY)?[[:space:]]*',
          '',
          'i'
        )
      ) in ('HC','1','2')
    );

  update public.race_stages stage
  set
    terrain_type = coalesce(v_terrain_type, stage.terrain_type),
    profile_type = coalesce(new.profile_type, stage.profile_type),
    flat_pct = (v_split->>'flat')::numeric,
    hilly_pct = (v_split->>'hilly')::numeric,
    mountain_pct = (v_split->>'mountain')::numeric,
    cobbled_pct = (v_split->>'cobbled')::numeric,
    elevation_gain_m = coalesce(new.elevation_gain_m, stage.elevation_gain_m),
    finish_type = case when v_summit_finish then 'summit_finish' else stage.finish_type end,
    is_summit_finish = case when v_summit_finish then true else stage.is_summit_finish end,
    updated_at = clock_timestamp()
  where stage.id = new.stage_id
    and not exists (
      select 1
      from public.race_stage_authoritative_runs authority
      where authority.stage_id = stage.id
    );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_assert_manager_access_v1(p_club_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.' using errcode='22023';
  end if;

  if not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed.' using errcode='42501';
  end if;

  if not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required.' using errcode='42501';
  end if;

  return p_club_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_get_command_center_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_game_ts timestamptz;
  v_game_date date;
  v_balance bigint := 0;
  v_weekly_income bigint := 0;
  v_weekly_expenses bigint := 0;
  v_wage_total bigint := 0;
  v_staff_wages bigint := 0;
  v_sponsor_monthly bigint := 0;
  v_policy_30d bigint := 0;
begin
  v_club_id := public.premium_assert_manager_access_v1(p_club_id);
  v_game_ts := public.get_current_game_timestamp();
  v_game_date := v_game_ts::date;

  select
    coalesce(current_balance,0),
    coalesce(weekly_income,0),
    coalesce(weekly_expenses,0),
    coalesce(wage_total,0)
  into
    v_balance,
    v_weekly_income,
    v_weekly_expenses,
    v_wage_total
  from public.club_finance_summary
  where club_id = v_club_id;

  select coalesce(sum(cs.salary_weekly),0)::bigint
  into v_staff_wages
  from public.club_staff cs
  where cs.club_id=v_club_id and cs.is_active=true;

  select coalesce(sum(cs.monthly_amount),0)::bigint
  into v_sponsor_monthly
  from public.club_sponsors cs
  where cs.club_id=v_club_id and cs.status='active';

  begin
    select coalesce(total_policy_cost,0)
    into v_policy_30d
    from public.finance_get_team_policy_cost_summary(
      v_club_id,
      v_game_date - 30,
      v_game_date
    )
    limit 1;
  exception when others then
    v_policy_30d := 0;
  end;

  return jsonb_build_object(
    'scope_note',
      'Premium Command Center is a deterministic management workspace built from information the manager already owns. It does not replace Staff Briefing Centre, does not create role-specific advisor reports, and is not influenced by staff advisory skill.',
    'game_now', v_game_ts,
    'club', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'cash_balance', v_balance
      )
      from public.clubs c
      where c.id=v_club_id
    ),
    'summary', jsonb_build_object(
      'weekly_income', v_weekly_income,
      'weekly_expenses', v_weekly_expenses,
      'weekly_net', v_weekly_income-v_weekly_expenses,
      'rider_wages_weekly', v_wage_total,
      'staff_wages_weekly', v_staff_wages,
      'active_sponsor_monthly_income', v_sponsor_monthly,
      'policy_cost_last_30_game_days', v_policy_30d,
      'upcoming_races_60d', (
        select count(*)::integer
        from public.race_preparations rp
        join public.races r on r.id=rp.race_id
        where rp.club_id=v_club_id
          and r.start_date between v_game_date and v_game_date+60
          and lower(coalesce(rp.status,'')) not in ('withdrawn','cancelled','canceled')
      ),
      'unread_transfer_alerts', (
        select count(*)::integer
        from public.transfer_market_alerts a
        where a.club_id=v_club_id and not a.is_read
      ),
      'shortlist_count', (
        select count(*)::integer
        from public.transfer_shortlist s
        where s.club_id=v_club_id
          and s.target_type='rider'
          and s.removed_at is null
      ),
      'active_sponsor_objectives', (
        select count(*)::integer
        from public.club_sponsor_objectives o
        join public.club_sponsors cs on cs.id=o.club_sponsor_id
        where cs.club_id=v_club_id
          and lower(coalesce(o.status,'')) not in ('completed','failed','cancelled','canceled','paid')
      )
    ),
    'season_planner', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.start_date, x.race_name)
      from (
        select
          rp.id as race_preparation_id,
          r.id as race_id,
          r.name as race_name,
          r.category,
          r.race_type,
          r.start_date,
          r.end_date,
          rp.status as preparation_status,
          rp.startlist_status,
          rp.rider_submission_deadline_on,
          rp.setup_window_opens_on,
          coalesce(stage_count.total_stages,0) as total_stages,
          coalesce(plan_count.saved_stage_plans,0) as saved_stage_plans,
          coalesce(obj_count.sponsor_target_count,0) as sponsor_target_count,
          case
            when rp.rider_submission_deadline_on is not null
                 and rp.rider_submission_deadline_on <= v_game_date + 2
                 and coalesce(rp.startlist_status,'') not in ('submitted','locked')
              then 'deadline_close'
            when coalesce(plan_count.saved_stage_plans,0) < coalesce(stage_count.total_stages,0)
              then 'planning_incomplete'
            else 'on_track'
          end as planning_state
        from public.race_preparations rp
        join public.races r on r.id=rp.race_id
        left join lateral (
          select count(*)::integer as total_stages
          from public.race_stages st
          where st.race_id=r.id
        ) stage_count on true
        left join lateral (
          select count(*) filter (where sp.last_saved_at is not null or sp.submitted_at is not null)::integer
            as saved_stage_plans
          from public.race_stage_plans sp
          where sp.race_preparation_id=rp.id
        ) plan_count on true
        left join lateral (
          select count(*)::integer as sponsor_target_count
          from public.club_sponsor_objectives o
          join public.club_sponsors cs on cs.id=o.club_sponsor_id
          where cs.club_id=v_club_id
            and o.target_race_id=r.id
            and lower(coalesce(o.status,'')) not in ('failed','cancelled','canceled')
        ) obj_count on true
        where rp.club_id=v_club_id
          and r.start_date between v_game_date and v_game_date+60
          and lower(coalesce(rp.status,'')) not in ('withdrawn','cancelled','canceled')
        order by r.start_date, r.name
        limit 30
      ) x
    ), '[]'::jsonb),
    'transfer_command', jsonb_build_object(
      'shortlist', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.added_at desc)
        from public.transfer_list_rider_shortlist_v2(v_club_id) s
      ), '[]'::jsonb),
      'saved_searches', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.updated_at desc)
        from public.transfer_list_saved_searches_v1(v_club_id) s
      ), '[]'::jsonb),
      'alerts', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from public.transfer_list_market_alerts_v1(v_club_id,20) a
      ), '[]'::jsonb),
      'pipeline', jsonb_build_object(
        'open_transfer_offers', (
          select count(*)::integer
          from public.rider_transfer_offers o
          where o.buyer_club_id=v_club_id
            and o.status in ('open','club_accepted')
        ),
        'open_transfer_negotiations', (
          select count(*)::integer
          from public.rider_transfer_negotiations n
          where n.buyer_club_id=v_club_id
            and n.status in ('draft','open','pending','countered','club_accepted')
        ),
        'open_free_agent_negotiations', (
          select count(*)::integer
          from public.rider_free_agent_negotiations n
          where n.club_id=v_club_id
            and n.status in ('draft','open','pending','countered')
        )
      )
    ),
    'finance', jsonb_build_object(
      'balance', v_balance,
      'weekly_income', v_weekly_income,
      'weekly_expenses', v_weekly_expenses,
      'weekly_net', v_weekly_income-v_weekly_expenses,
      'rider_wages_weekly', v_wage_total,
      'staff_wages_weekly', v_staff_wages,
      'active_sponsor_monthly_income', v_sponsor_monthly,
      'policy_cost_last_30_game_days', v_policy_30d,
      'cashflow', coalesce((
        select jsonb_agg(to_jsonb(cf) order by cf.bucket_date)
        from public.finance_get_club_cashflow_series(v_club_id,30) cf
      ), '[]'::jsonb)
    ),
    'sponsor_intelligence', coalesce((
      select jsonb_agg(
        to_jsonb(s) ||
        jsonb_build_object(
          'remaining_value', greatest(0,coalesce(s.target_value,0)-coalesce(s.current_value,0)),
          'progress_pct', case
            when coalesce(s.target_value,0) <= 0 then 0
            else least(100,round(100.0*coalesce(s.current_value,0)/s.target_value))
          end,
          'risk_band', case
            when lower(coalesce(s.objective_result_state,s.objective_status,'')) in ('completed','success','paid') then 'completed'
            when lower(coalesce(s.objective_result_state,s.objective_status,'')) in ('failed','failure') then 'failed'
            when coalesce(s.current_value,0) >= coalesce(s.target_value,0) and coalesce(s.target_value,0)>0 then 'target_met'
            when coalesce(s.target_check_game_date,s.eligible_to_game_date) is not null
                 and coalesce(s.target_check_game_date,s.eligible_to_game_date) <= v_game_date+7 then 'high'
            when coalesce(s.target_check_game_date,s.eligible_to_game_date) is not null
                 and coalesce(s.target_check_game_date,s.eligible_to_game_date) <= v_game_date+14 then 'medium'
            else 'normal'
          end
        )
        order by
          coalesce(s.target_check_game_date,s.eligible_to_game_date,'9999-12-31'::date),
          s.objective_title
      )
      from public.get_club_sponsor_objectives_ui_v1(v_club_id) s
    ), '[]'::jsonb),
    'rider_development', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.development_8w desc, x.display_name)
      from (
        select
          r.id as rider_id,
          coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),r.display_name,r.id::text) as display_name,
          r.country_code,
          r.role,
          r.birth_date,
          r.overall,
          r.potential,
          r.fatigue,
          r.morale,
          r.availability_status,
          latest.week_start_date,
          latest.week_end_date,
          latest.total_net_change as latest_net_change,
          latest.overall_delta as latest_overall_delta,
          latest.ui_state,
          latest.ui_label,
          coalesce(dev.development_8w,0) as development_8w,
          coalesce(dev.overall_delta_8w,0) as overall_delta_8w,
          coalesce(dev.weeks_recorded,0) as weeks_recorded
        from public.club_riders cr
        join public.riders r on r.id=cr.rider_id
        left join public.rider_latest_weekly_development_v latest on latest.rider_id=r.id
        left join lateral (
          select
            coalesce(sum(s.total_net_change),0)::numeric as development_8w,
            coalesce(sum(s.overall_delta),0)::numeric as overall_delta_8w,
            count(*)::integer as weeks_recorded
          from public.rider_weekly_development_summaries s
          where s.rider_id=r.id
            and s.week_end_date >= v_game_date-56
        ) dev on true
        where cr.club_id=v_club_id
      ) x
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_get_race_strategy_lab_v1(p_race_preparation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_race_id uuid;
begin
  select rp.club_id, rp.race_id
  into v_club_id, v_race_id
  from public.race_preparations rp
  where rp.id=p_race_preparation_id;

  if v_club_id is null then
    raise exception 'Race preparation not found.' using errcode='P0002';
  end if;

  perform public.premium_assert_manager_access_v1(v_club_id);

  return jsonb_build_object(
    'scope_note',
      'Strategy Lab is an on-demand scenario comparison using visible rider, fatigue and race-profile data. It is separate from the coin-based Sports Director advisory and does not create advisor recommendations or change the race engine.',
    'race', (
      select jsonb_build_object(
        'race_preparation_id', rp.id,
        'race_id', r.id,
        'race_name', r.name,
        'category', r.category,
        'race_type', r.race_type,
        'start_date', r.start_date,
        'end_date', r.end_date,
        'preparation_status', rp.status,
        'startlist_status', rp.startlist_status
      )
      from public.race_preparations rp
      join public.races r on r.id=rp.race_id
      where rp.id=p_race_preparation_id
    ),
    'stages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_id', st.id,
          'stage_number', st.stage_number,
          'stage_name', st.name,
          'stage_date', st.stage_date,
          'terrain_type', st.terrain_type,
          'profile_type', st.profile_type,
          'stage_format', st.stage_format,
          'distance_km', st.distance_km,
          'elevation_gain_m', st.elevation_gain_m,
          'current_plan', case when sp.id is null then null else jsonb_build_object(
            'stage_plan_id', sp.id,
            'status', sp.status,
            'stage_objective', sp.stage_objective,
            'team_strategy', sp.team_strategy,
            'risk_level', sp.risk_level,
            'last_saved_at', sp.last_saved_at
          ) end,
          'top_candidates', coalesce((
            select jsonb_agg(to_jsonb(cand) order by cand.suitability_score desc, cand.display_name)
            from (
              select
                r.id as rider_id,
                coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),r.display_name,r.id::text) as display_name,
                r.country_code,
                r.role,
                r.overall,
                r.potential,
                r.fatigue,
                r.morale,
                exists (
                  select 1
                  from public.race_stage_plan_riders spr
                  where spr.race_stage_plan_id=sp.id
                    and spr.rider_id=r.id
                ) as currently_selected,
                greatest(0,least(100,round(
                  case
                    when lower(coalesce(st.stage_format,'')) in ('itt','tt','time_trial','individual_time_trial')
                      or lower(coalesce(st.terrain_type,'')) like '%time%'
                      then (
                        coalesce(r.time_trial,50)*0.40 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.flat,50)*0.15 +
                        coalesce(r.race_iq,50)*0.15 +
                        coalesce(r.recovery,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%mountain%'
                      then (
                        coalesce(r.climbing,50)*0.35 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.recovery,50)*0.15 +
                        coalesce(r.resistance,50)*0.10 +
                        coalesce(r.race_iq,50)*0.10 +
                        coalesce(r.teamwork,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%hill%'
                      then (
                        coalesce(r.climbing,50)*0.25 +
                        coalesce(r.flat,50)*0.15 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.recovery,50)*0.10 +
                        coalesce(r.resistance,50)*0.10 +
                        coalesce(r.race_iq,50)*0.10 +
                        coalesce(r.teamwork,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%cobbl%'
                      then (
                        coalesce(r.flat,50)*0.20 +
                        coalesce(r.resistance,50)*0.20 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.race_iq,50)*0.15 +
                        coalesce(r.teamwork,50)*0.10 +
                        coalesce(r.sprint,50)*0.10 +
                        coalesce(r.recovery,50)*0.05
                      )
                    else (
                      coalesce(r.flat,50)*0.25 +
                      coalesce(r.sprint,50)*0.25 +
                      coalesce(r.endurance,50)*0.20 +
                      coalesce(r.race_iq,50)*0.15 +
                      coalesce(r.teamwork,50)*0.10 +
                      coalesce(r.recovery,50)*0.05
                    )
                  end
                  - coalesce(r.fatigue,0)*0.25
                  + (coalesce(r.morale,50)-50)*0.08
                )))::integer as suitability_score
              from public.club_riders cr
              join public.riders r on r.id=cr.rider_id
              where cr.club_id=v_club_id
                and coalesce(r.availability_status,'fit') <> 'injured'
              order by suitability_score desc, display_name
              limit 8
            ) cand
          ), '[]'::jsonb)
        )
        order by st.stage_number
      )
      from public.race_stages st
      left join public.race_stage_plans sp
        on sp.race_preparation_id=p_race_preparation_id
       and sp.stage_id=st.id
      where st.race_id=v_race_id
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_list_templates_v1(p_club_id uuid, p_template_type text DEFAULT NULL::text)
 RETURNS SETOF premium_manager_templates_v1
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  return query
  select t.*
  from public.premium_manager_templates_v1 t
  where t.club_id=p_club_id
    and t.user_id=auth.uid()
    and (p_template_type is null or t.template_type=p_template_type)
  order by t.template_type, t.is_default desc, t.updated_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_save_template_v1(p_club_id uuid, p_template_id uuid, p_template_type text, p_name text, p_payload_json jsonb, p_is_default boolean DEFAULT false)
 RETURNS premium_manager_templates_v1
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_row public.premium_manager_templates_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_template_type not in ('race_strategy','training','equipment','financial_scenario','season_plan') then
    raise exception 'Unsupported template type.' using errcode='22023';
  end if;

  if nullif(btrim(p_name),'') is null then
    raise exception 'Template name is required.' using errcode='22023';
  end if;

  if coalesce(p_is_default,false) then
    update public.premium_manager_templates_v1
    set is_default=false, updated_at=now()
    where club_id=p_club_id
      and user_id=auth.uid()
      and template_type=p_template_type;
  end if;

  if p_template_id is null then
    insert into public.premium_manager_templates_v1(
      club_id,user_id,template_type,name,payload_json,is_default
    )
    values(
      p_club_id,auth.uid(),p_template_type,btrim(p_name),
      coalesce(p_payload_json,'{}'::jsonb),coalesce(p_is_default,false)
    )
    returning id into v_id;
  else
    update public.premium_manager_templates_v1
    set
      template_type=p_template_type,
      name=btrim(p_name),
      payload_json=coalesce(p_payload_json,'{}'::jsonb),
      is_default=coalesce(p_is_default,false),
      updated_at=now()
    where id=p_template_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Template not found.' using errcode='P0002';
    end if;
  end if;

  select * into v_row
  from public.premium_manager_templates_v1
  where id=v_id;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_delete_template_v1(p_club_id uuid, p_template_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  delete from public.premium_manager_templates_v1
  where id=p_template_id
    and club_id=p_club_id
    and user_id=auth.uid();

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_list_automation_rules_v1(p_club_id uuid)
 RETURNS TABLE(id uuid, club_id uuid, user_id uuid, rule_type text, name text, template_id uuid, template_name text, template_type text, match_json jsonb, is_enabled boolean, last_matched_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  return query
  select
    r.id,r.club_id,r.user_id,r.rule_type,r.name,r.template_id,
    t.name,t.template_type,r.match_json,r.is_enabled,r.last_matched_at,
    r.created_at,r.updated_at
  from public.premium_manager_automation_rules_v1 r
  join public.premium_manager_templates_v1 t on t.id=r.template_id
  where r.club_id=p_club_id
    and r.user_id=auth.uid()
  order by r.is_enabled desc,r.updated_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_save_automation_rule_v1(p_club_id uuid, p_rule_id uuid, p_rule_type text, p_name text, p_template_id uuid, p_match_json jsonb, p_is_enabled boolean DEFAULT true)
 RETURNS premium_manager_automation_rules_v1
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_template_type text;
  v_row public.premium_manager_automation_rules_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_rule_type not in ('strategy_prefill','training_prefill') then
    raise exception 'Unsupported automation rule type.' using errcode='22023';
  end if;

  select t.template_type
  into v_template_type
  from public.premium_manager_templates_v1 t
  where t.id=p_template_id
    and t.club_id=p_club_id
    and t.user_id=auth.uid();

  if v_template_type is null then
    raise exception 'Template not found.' using errcode='P0002';
  end if;

  if (p_rule_type='strategy_prefill' and v_template_type<>'race_strategy')
     or (p_rule_type='training_prefill' and v_template_type<>'training')
      then
    raise exception 'Automation rule and template type do not match.' using errcode='22023';
  end if;

  if p_rule_id is null then
    insert into public.premium_manager_automation_rules_v1(
      club_id,user_id,rule_type,name,template_id,match_json,is_enabled
    )
    values(
      p_club_id,auth.uid(),p_rule_type,btrim(p_name),p_template_id,
      coalesce(p_match_json,'{}'::jsonb),coalesce(p_is_enabled,true)
    )
    returning id into v_id;
  else
    update public.premium_manager_automation_rules_v1
    set
      rule_type=p_rule_type,
      name=btrim(p_name),
      template_id=p_template_id,
      match_json=coalesce(p_match_json,'{}'::jsonb),
      is_enabled=coalesce(p_is_enabled,true),
      updated_at=now()
    where id=p_rule_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Automation rule not found.' using errcode='P0002';
    end if;
  end if;

  select * into v_row
  from public.premium_manager_automation_rules_v1
  where id=v_id;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_delete_automation_rule_v1(p_club_id uuid, p_rule_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  delete from public.premium_manager_automation_rules_v1
  where id=p_rule_id
    and club_id=p_club_id
    and user_id=auth.uid();

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_match_automation_template_v1(p_club_id uuid, p_rule_type text, p_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_rule record;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  select
    r.*,
    t.name as template_name,
    t.template_type,
    t.payload_json
  into v_rule
  from public.premium_manager_automation_rules_v1 r
  join public.premium_manager_templates_v1 t on t.id=r.template_id
  where r.club_id=p_club_id
    and r.user_id=auth.uid()
    and r.rule_type=p_rule_type
    and r.is_enabled
    and not exists (
      select 1
      from jsonb_each_text(coalesce(r.match_json,'{}'::jsonb)) m
      where coalesce(p_context->>m.key,'') <> m.value
    )
  order by jsonb_object_length(coalesce(r.match_json,'{}'::jsonb)) desc,
           r.updated_at desc
  limit 1;

  if v_rule.id is null then
    return jsonb_build_object('matched',false);
  end if;

  update public.premium_manager_automation_rules_v1
  set last_matched_at=now()
  where id=v_rule.id;

  return jsonb_build_object(
    'matched',true,
    'rule_id',v_rule.id,
    'rule_name',v_rule.name,
    'template_id',v_rule.template_id,
    'template_name',v_rule.template_name,
    'template_type',v_rule.template_type,
    'payload_json',v_rule.payload_json,
    'match_json',v_rule.match_json
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_squad_season_dashboard_v1(p_club_id uuid, p_season_year integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb;
  v_is_premium boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.' using errcode = '22023';
  end if;

  if not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  v_payload := public._get_club_squad_season_dashboard_v1_internal(
    p_club_id,
    p_season_year
  );

  select coalesce(status.is_premium, false)
  into v_is_premium
  from public.get_my_premium_status() status
  limit 1;

  if v_is_premium then
    return v_payload;
  end if;

  return jsonb_build_object(
    'seasonTrend', '[]'::jsonb,
    'podiumChart', '[]'::jsonb,
    'summary', jsonb_build_object(
      'wins', 0,
      'podiums', 0,
      'top10s', 0,
      'bestGC', 0
    ),
    'lastTeamRace', coalesce(v_payload -> 'lastTeamRace', '{}'::jsonb),
    'nextRaceSelection', coalesce(v_payload -> 'nextRaceSelection', '{}'::jsonb),
    'raceTypeSnapshot', '[]'::jsonb
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_calculation_guard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game_now timestamp without time zone := public.get_current_game_timestamp()::timestamp without time zone;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_stage record;
  v_latest record;
  v_checked integer := 0;
  v_healthy integer := 0;
  v_recovery_needed integer := 0;
  v_runner_kicks integer := 0;
  v_pass1_kicks integer := 0;
  v_pass2_kicks integer := 0;
  v_survival jsonb := '{}'::jsonb;
  v_secret text;
begin
  if not pg_try_advisory_xact_lock(hashtext('universal_race_calculation_guard_v1')::bigint) then
    return jsonb_build_object('status','already_running');
  end if;

  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='universal_race_worker_secret_v1'
  limit 1;

  begin
    perform public.race_engine_due_stage_watchdog_run_v1();
  exception when others then
    null;
  end;

  begin
    v_survival := public.universal_race_stage_survival_recover_v1();
  exception when others then
    v_survival := jsonb_build_object('status','error','message',sqlerrm);
  end;

  for v_stage in
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      s.stage_number,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone as stage_start_game_at,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
        - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3)) as calculation_due_game_at
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where coalesce(s.stage_format,'road_race')='road_race'
      and not coalesce(s.weather_cancelled,false)
      and public.race_stage_planned_start_game_at_v1(s.id) is not null
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            >= v_control.typescript_activation_game_at
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))
            + interval '15 minutes' <= v_game_now
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            + interval '30 minutes' >= v_game_now
      and not exists (
        select 1 from public.race_stage_authoritative_runs a
        where a.stage_id=s.id
      )
    order by calculation_due_game_at, s.id
    limit 100
  loop
    v_checked := v_checked + 1;

    select sr.id, sr.status, sr.updated_at, sr.started_at, sr.created_at,
           coalesce(sr.result_summary_json->>'calculation_contract','') as calculation_contract,
           coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
           coalesce(sr.result_summary_json->>'pass2_scenario_mode','') as pass2_scenario_mode
    into v_latest
    from public.race_stage_simulation_runs sr
    where sr.stage_id=v_stage.stage_id
    order by sr.created_at desc, sr.id
    limit 1;

    if exists (
      select 1
      from public.race_stage_automation_state a
      where a.stage_id=v_stage.stage_id
        and (
          a.last_status in ('calculated_hidden','replay_live','published','completed')
          or coalesce((a.details->>'manifest_ready')::boolean,false)
        )
    ) then
      v_healthy := v_healthy + 1;
      continue;
    end if;

    v_recovery_needed := v_recovery_needed + 1;

    perform net.http_post(
      url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-runner',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-universal-race-worker-secret',v_secret
      ),
      body := '{"action":"tick"}'::jsonb,
      timeout_milliseconds := 30000
    );
    v_runner_kicks := v_runner_kicks + 1;

    if v_latest.id is not null and (
      v_latest.status='failed'
      or v_latest.survival_phase in (
        'pass1_pending','pass1_resume_claimed','pass1_payload_loading',
        'pass1_started','pass1_resume_failed','pass1_ready_no_scenario'
      )
    ) then
      perform net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass1-resume',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-universal-race-worker-secret',v_secret
        ),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
      v_pass1_kicks := v_pass1_kicks + 1;
    end if;

    if v_latest.id is not null then
      perform net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-universal-race-worker-secret',v_secret
        ),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
      v_pass2_kicks := v_pass2_kicks + 1;

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      )
      values (
        v_stage.stage_id,
        v_stage.race_id,
        v_latest.id,
        'deadline_guard_recovery_kick',
        'calculation_not_ready_15_game_minutes_after_due_time',
        jsonb_build_object(
          'race_name',v_stage.race_name,
          'stage_number',v_stage.stage_number,
          'calculation_due_game_at',v_stage.calculation_due_game_at,
          'current_game_at',v_game_now,
          'run_status',v_latest.status,
          'survival_phase',v_latest.survival_phase,
          'calculation_contract',v_latest.calculation_contract,
          'pass2_scenario_mode',v_latest.pass2_scenario_mode
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_game_now,
    'checked',v_checked,
    'healthy',v_healthy,
    'recovery_needed',v_recovery_needed,
    'runner_kicks',v_runner_kicks,
    'pass1_kicks',v_pass1_kicks,
    'pass2_kicks',v_pass2_kicks,
    'survival_recovery',v_survival,
    'model_version','universal_race_calculation_guard_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_release_supervisor_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lock bigint := hashtext('universal_race_release_supervisor_v1')::bigint;
  v_watchdog jsonb := '{}'::jsonb;
  v_survival jsonb := '{}'::jsonb;
  v_publication jsonb := '{}'::jsonb;
  v_ops jsonb := '{}'::jsonb;
  v_runner_request bigint;
  v_pass1_request bigint;
  v_pass2_request bigint;
  v_secret text;
begin
  if not pg_try_advisory_xact_lock(v_lock) then
    return jsonb_build_object('status','already_running');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='universal_race_worker_secret_v1'
  limit 1;

  begin
    v_watchdog := public.race_engine_due_stage_watchdog_run_v1();
  exception when others then
    v_watchdog := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  begin
    v_survival := public.universal_race_stage_survival_recover_v1();
  exception when others then
    v_survival := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  if v_secret is not null then
    begin
      v_runner_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-runner',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;

    begin
      v_pass1_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass1-resume',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;

    begin
      v_pass2_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;
  end if;

  begin
    v_publication := public.universal_race_stage_retry_due_publications_v1(20);
  exception when others then
    v_publication := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  begin
    v_ops := public.race_operations_refresh_v1();
  exception when others then
    v_ops := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  return jsonb_build_object(
    'status','completed',
    'watchdog',v_watchdog,
    'survival',v_survival,
    'publication',v_publication,
    'operations',v_ops,
    'runner_request_id',v_runner_request,
    'pass1_request_id',v_pass1_request,
    'pass2_request_id',v_pass2_request,
    'model_version','universal_race_release_supervisor_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_missing_stage_equipment_wear_v2(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_stage_distance_km numeric := 0;
  v_stage_date date;
  v_phase9 jsonb;
  v_equipment jsonb := '{}'::jsonb;
  v_entry record;
  v_inventory record;
  v_loss numeric;
  v_condition_after numeric;
  v_log_id uuid;
  v_candidates integer := 0;
  v_user_candidates integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  select rr.stage_id, rr.race_id, coalesce(rs.distance_km,0), rs.stage_date
  into v_stage_id, v_race_id, v_stage_distance_km, v_stage_date
  from public.race_stage_simulation_runs rr
  join public.race_stages rs on rs.id = rr.stage_id
  where rr.id = p_simulation_run_id;

  if not found then
    raise exception 'Simulation run % not found', p_simulation_run_id;
  end if;

  if exists (
    select 1
    from public.race_engine_stage_wear_applications w
    where w.simulation_run_id = p_simulation_run_id
      and w.target_type = 'equipment'
      and w.target_table = 'club_equipment_inventory'
  ) then
    return jsonb_build_object(
      'ok', true,
      'status', 'canonical_equipment_wear_present',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  select public.race_engine_get_stage_phase9_inputs_v1(v_stage_id)
  into v_phase9;

  v_equipment := coalesce(v_phase9 -> 'preparation' -> 'equipment', '{}'::jsonb);

  for v_entry in
    select key, value
    from jsonb_each(v_equipment)
    order by key
  loop
    v_candidates := v_candidates + 1;

    select
      cei.id,
      cei.club_id,
      cei.equipment_category,
      cei.condition_percent
    into v_inventory
    from public.club_equipment_inventory cei
    join public.clubs c on c.id = cei.club_id
    where cei.id = v_entry.key::uuid
      and not coalesce(c.is_ai,false)
    for update of cei;

    if not found then
      continue;
    end if;

    v_user_candidates := v_user_candidates + 1;
    v_loss := greatest(0, (v_stage_distance_km / 100.0) * 0.35);
    v_condition_after := greatest(
      0,
      least(100, coalesce(v_inventory.condition_percent,100) - v_loss)
    );

    v_log_id := null;

    insert into public.race_engine_stage_wear_applications (
      simulation_run_id,
      race_id,
      stage_id,
      target_type,
      target_table,
      target_id,
      club_id,
      target_key,
      condition_loss,
      applied_game_date,
      metadata
    )
    values (
      p_simulation_run_id,
      v_race_id,
      v_stage_id,
      'equipment',
      'club_equipment_inventory',
      v_inventory.id,
      v_inventory.club_id,
      v_inventory.equipment_category,
      v_loss,
      v_stage_date,
      jsonb_build_object(
        'source', 'phase11_equipment_wear_compat_v2',
        'reason', 'canonical application manifest omitted user equipment resources',
        'phase9_resource', v_entry.value,
        'stage_distance_km', v_stage_distance_km,
        'condition_before_apply', v_inventory.condition_percent,
        'condition_after_apply', v_condition_after
      )
    )
    on conflict (simulation_run_id, target_type, target_table, target_id)
    do nothing
    returning id into v_log_id;

    if v_log_id is not null then
      v_inserted := v_inserted + 1;

      update public.club_equipment_inventory cei
      set
        condition_percent = v_condition_after,
        last_used_game_date = coalesce(v_stage_date, cei.last_used_game_date),
        total_distance_km = coalesce(cei.total_distance_km,0) + v_stage_distance_km,
        total_race_days = coalesce(cei.total_race_days,0) + 1,
        updated_at = clock_timestamp()
      where cei.id = v_inventory.id;

      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', case
      when v_candidates = 0 then 'no_equipment_candidates'
      when v_user_candidates = 0 then 'no_user_equipment_candidates'
      else 'processed'
    end,
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'equipment_candidate_count', v_candidates,
    'user_equipment_candidate_count', v_user_candidates,
    'equipment_log_inserted_count', v_inserted,
    'equipment_updated_count', v_updated
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_race_schedule_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_date date;
  v_upcoming_schedule jsonb := '[]'::jsonb;
  v_today_races jsonb := '[]'::jsonb;
begin
  if p_club_id is null then
    return jsonb_build_object(
      'upcomingSchedule', '[]'::jsonb,
      'todayRaces', '[]'::jsonb
    );
  end if;

  v_current_game_date := public.get_current_game_date_date();

  if v_current_game_date is null then
    v_current_game_date := make_date(
      1999 + coalesce(public.get_current_season_number(), 1),
      1,
      1
    );
  end if;

  with club_scope as (
    select p_club_id::text as club_id
    union all
    select c.id::text
    from public.clubs c
    where c.parent_club_id = p_club_id
      and c.club_type = 'developing'
      and c.deleted_at is null
  ),
  accepted_races as (
    select distinct on (r.id)
      r.id as race_id,
      r.name as race_name,
      coalesce(
        nullif(to_jsonb(r)->>'race_category', ''),
        nullif(to_jsonb(r)->>'category', ''),
        nullif(to_jsonb(r)->>'class', ''),
        nullif(to_jsonb(r)->>'race_class', '')
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', ''),
        case
          when lower(r.name) like '%black river gorges%' then 'MU'
          when lower(r.name) like '%mauritius%' then 'MU'
          when lower(r.name) like '%guadeloupe%' then 'GP'
          when lower(r.name) like '%namib%' then 'NA'
          when lower(r.name) like '%faso%' then 'BF'
          when lower(r.name) like '%israel%' then 'IL'
          else null
        end
      ) as race_country_code,
      (
        select min(stage.stage_date)
        from public.race_stages stage
        where stage.race_id = r.id
          and stage.stage_date >= v_current_game_date
      ) as next_stage_date,
      rp.updated_at
    from public.race_preparations rp
    join public.races r
      on r.id = rp.race_id
    where (
      nullif(to_jsonb(rp)->>'participating_club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'owner_club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'team_id', '') in (
        select club_id from club_scope
      )
    )
      and lower(coalesce(to_jsonb(rp)->>'status', '')) not in (
        'declined','rejected','cancelled','canceled','withdrawn'
      )
      and lower(coalesce(to_jsonb(rp)->>'startlist_status', '')) not in (
        'declined','rejected','cancelled','canceled','withdrawn'
      )
      and lower(coalesce(r.status::text, '')) not in (
        'completed','cancelled','canceled'
      )
      and exists (
        select 1
        from public.race_stages stage
        where stage.race_id = r.id
          and stage.stage_date >= v_current_game_date
      )
    order by r.id, rp.updated_at desc nulls last
  ),
  upcoming as (
    select
      ar.race_id,
      ar.race_name,
      ar.race_category,
      ar.race_country_code,
      stage.stage_number,
      stage.stage_date,
      coalesce(to_jsonb(stage)->>'route_label', '') as route_label,
      (
        select count(*)::integer
        from public.race_stages count_stage
        where count_stage.race_id = ar.race_id
      ) as stage_count
    from accepted_races ar
    join public.race_stages stage
      on stage.race_id = ar.race_id
     and stage.stage_date = ar.next_stage_date
    where ar.next_stage_date is not null
    order by stage.stage_date asc, ar.race_name asc
    limit 5
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_id::text,
        'dateLabel', to_char(stage_date, 'Mon DD'),
        'title', race_name,
        'countryCode', race_country_code,
        'subtitle', concat_ws(
          ' · ',
          nullif(race_category, ''),
          'Stage ' || stage_number::text,
          case
            when stage_count > 1 then stage_count::text || ' stages'
            else null
          end,
          nullif(route_label, '')
        ),
        'href', '#/dashboard/races/' || race_id::text
      )
      order by stage_date asc, race_name asc
    ),
    '[]'::jsonb
  )
  into v_upcoming_schedule
  from upcoming;

  with today as (
    select
      r.id as race_id,
      r.name as race_name,
      coalesce(
        nullif(to_jsonb(r)->>'race_category', ''),
        nullif(to_jsonb(r)->>'category', ''),
        nullif(to_jsonb(r)->>'class', ''),
        nullif(to_jsonb(r)->>'race_class', '')
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', ''),
        case
          when lower(r.name) like '%black river gorges%' then 'MU'
          when lower(r.name) like '%mauritius%' then 'MU'
          when lower(r.name) like '%guadeloupe%' then 'GP'
          when lower(r.name) like '%namib%' then 'NA'
          when lower(r.name) like '%faso%' then 'BF'
          when lower(r.name) like '%israel%' then 'IL'
          else null
        end
      ) as race_country_code,
      stage.stage_number,
      stage.stage_date,
      coalesce(
        nullif(to_jsonb(stage)->>'stage_format', ''),
        nullif(to_jsonb(stage)->>'terrain_type', ''),
        'road_race'
      ) as stage_format,
      coalesce(to_jsonb(stage)->>'route_label', '') as route_label
    from public.race_stages stage
    join public.races r
      on r.id = stage.race_id
    where stage.stage_date = v_current_game_date
      and lower(coalesce(r.status::text, '')) not in ('cancelled','canceled')
    order by r.name asc, stage.stage_number asc
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_id::text || ':' || stage_number::text,
        'timeLabel', 'Today',
        'title', race_name,
        'countryCode', race_country_code,
        'subtitle', concat_ws(
          ' ',
          'Stage ' || stage_number::text ||
            case
              when nullif(race_category, '') is not null
                then ' of this ' || race_category || ' race'
              else ''
            end || ' is scheduled today.',
          case
            when nullif(stage_format, '') is not null
              then 'Race type: ' || initcap(replace(stage_format, '_', ' ')) || '.'
            else null
          end,
          case
            when nullif(route_label, '') is not null
              then 'Route: ' || route_label || '.'
            else null
          end
        ),
        'href', '#/dashboard/races/' || race_id::text
      )
      order by race_name asc, stage_number asc
    ),
    '[]'::jsonb
  )
  into v_today_races
  from today;

  return jsonb_build_object(
    'upcomingSchedule', v_upcoming_schedule,
    'todayRaces', v_today_races
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_contiguous_race_stage_calendar_v1(p_race_id uuid, p_force boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_start_date date;
  v_end_date date;
  v_stage_count integer;
  v_race_metadata jsonb;
  v_row_count integer;
  v_distinct_stage_numbers integer;
  v_min_stage_number integer;
  v_max_stage_number integer;
  v_changed integer := 0;
begin
  select
    r.start_date::date,
    r.end_date::date,
    r.stage_count,
    coalesce(r.metadata, '{}'::jsonb)
  into
    v_start_date,
    v_end_date,
    v_stage_count,
    v_race_metadata
  from public.races r
  where r.id = p_race_id;

  if not found
     or v_start_date is null
     or v_end_date is null
     or coalesce(v_stage_count, 0) <= 1
  then
    return 0;
  end if;

  -- Only normalize races whose published span means exactly one stage per day.
  -- Date arithmetic is intentionally used so leap days such as 2000-02-29
  -- are handled by PostgreSQL rather than hand-built month/day logic.
  if v_stage_count <> (v_end_date - v_start_date + 1) then
    return 0;
  end if;

  -- Explicit escape hatch for a deliberately unusual split-stage calendar.
  if lower(coalesce(v_race_metadata->>'allow_same_day_stages', 'false'))
       in ('true', '1', 'yes', 'on')
  then
    return 0;
  end if;

  select
    count(*)::integer,
    count(distinct s.stage_number)::integer,
    min(s.stage_number),
    max(s.stage_number)
  into
    v_row_count,
    v_distinct_stage_numbers,
    v_min_stage_number,
    v_max_stage_number
  from public.race_stages s
  where s.race_id = p_race_id;

  if v_row_count <> v_stage_count
     or v_distinct_stage_numbers <> v_stage_count
     or v_min_stage_number <> 1
     or v_max_stage_number <> v_stage_count
  then
    return 0;
  end if;

  -- For normal future imports, do not rewrite a race once authoritative
  -- calculations exist. Existing bad schedules can be repaired explicitly
  -- with p_force=true.
  if not p_force
     and exists (
       select 1
       from public.race_stage_authoritative_runs authority
       join public.race_stages stage on stage.id = authority.stage_id
       where stage.race_id = p_race_id
     )
  then
    return 0;
  end if;

  update public.race_stages stage
  set
    stage_date = v_start_date + (stage.stage_number - 1),
    metadata = jsonb_set(
      coalesce(stage.metadata, '{}'::jsonb),
      '{actual_stage_date}',
      to_jsonb(
        format(
          'S%s %s',
          extract(year from (v_start_date + (stage.stage_number - 1)))::integer - 1999,
          to_char(v_start_date + (stage.stage_number - 1), 'MM.DD')
        )
      ),
      true
    ),
    updated_at = clock_timestamp()
  where stage.race_id = p_race_id
    and (
      stage.stage_date is distinct from (v_start_date + (stage.stage_number - 1))
      or coalesce(stage.metadata->>'actual_stage_date', '') is distinct from
         format(
           'S%s %s',
           extract(year from (v_start_date + (stage.stage_number - 1)))::integer - 1999,
           to_char(v_start_date + (stage.stage_number - 1), 'MM.DD')
         )
    );

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_normalize_contiguous_calendar_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.normalize_contiguous_race_stage_calendar_v1(new.race_id, false);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_normalize_contiguous_stage_calendar_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.normalize_contiguous_race_stage_calendar_v1(new.id, false);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_recent_race_results_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_today date;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  v_today := public.get_current_game_date_date();

  if v_today is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage_id', row_data.stage_id,
        'race_id', row_data.race_id,
        'race_name', row_data.race_name,
        'country_code', row_data.country_code,
        'stage_number', row_data.stage_number,
        'stage_count', row_data.stage_count,
        'stage_date', row_data.stage_date,
        'stage_name', row_data.stage_name,
        'start_city', row_data.start_city,
        'finish_city', row_data.finish_city,

        'winner_rider_id', row_data.winner_rider_id,
        'winner_name', row_data.winner_name,
        'winner_team_id', row_data.winner_team_id,
        'winner_team_name', row_data.winner_team_name,

        'gc_rider_id', row_data.gc_rider_id,
        'gc_name', row_data.gc_name,
        'gc_team_id', row_data.gc_team_id,
        'gc_team_name', row_data.gc_team_name,

        'mountain_rider_id', row_data.mountain_rider_id,
        'mountain_name', row_data.mountain_name,
        'mountain_team_id', row_data.mountain_team_id,
        'mountain_team_name', row_data.mountain_team_name,
        'mountain_points', row_data.mountain_points,

        'points_rider_id', row_data.points_rider_id,
        'points_name', row_data.points_name,
        'points_team_id', row_data.points_team_id,
        'points_team_name', row_data.points_team_name,
        'points_total', row_data.points_total
      )
      order by row_data.stage_date desc, row_data.race_name, row_data.stage_number
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      stage.id as stage_id,
      race.id as race_id,
      race.name as race_name,
      nullif(
        coalesce(
          to_jsonb(race)->>'country_code',
          to_jsonb(race)->>'host_country_code',
          to_jsonb(race)->>'country_iso2',
          to_jsonb(race)->>'country_iso'
        ),
        ''
      ) as country_code,
      stage.stage_number,
      coalesce(race.stage_count, 1) as stage_count,
      stage.stage_date::date as stage_date,
      nullif(stage.name, '') as stage_name,
      nullif(coalesce(stage.start_city_name, stage.start_city), '') as start_city,
      nullif(coalesce(stage.finish_city_name, stage.finish_city), '') as finish_city,

      winner.rider_id as winner_rider_id,
      coalesce(
        nullif(winner.rider_name_snapshot, ''),
        nullif(to_jsonb(winner_rider)->>'display_name', ''),
        nullif(to_jsonb(winner_rider)->>'full_name', ''),
        nullif(trim(concat_ws(' ', to_jsonb(winner_rider)->>'first_name', to_jsonb(winner_rider)->>'last_name')), ''),
        winner.rider_id::text
      ) as winner_name,
      winner.team_id as winner_team_id,
      nullif(winner.team_name_snapshot, '') as winner_team_name,

      gc.rider_id as gc_rider_id,
      nullif(gc.display_name_snapshot, '') as gc_name,
      gc.team_id as gc_team_id,
      nullif(gc.team_name_snapshot, '') as gc_team_name,

      mountain.rider_id as mountain_rider_id,
      nullif(mountain.display_name_snapshot, '') as mountain_name,
      mountain.team_id as mountain_team_id,
      nullif(mountain.team_name_snapshot, '') as mountain_team_name,
      mountain.points as mountain_points,

      points.rider_id as points_rider_id,
      nullif(points.display_name_snapshot, '') as points_name,
      points.team_id as points_team_id,
      nullif(points.team_name_snapshot, '') as points_team_name,
      points.points as points_total
    from public.race_stages stage
    join public.races race on race.id = stage.race_id
    join public.race_stage_results winner
      on winner.stage_id = stage.id
     and winner.rank = 1
    left join public.riders winner_rider on winner_rider.id = winner.rider_id
    left join public.race_classification_standings gc
      on gc.race_id = race.id
     and gc.after_stage_id = stage.id
     and gc.classification_type = 'general'
     and gc.entity_type = 'rider'
     and gc.rank = 1
    left join public.race_classification_standings mountain
      on mountain.race_id = race.id
     and mountain.after_stage_id = stage.id
     and mountain.classification_type = 'mountain'
     and mountain.entity_type = 'rider'
     and mountain.rank = 1
    left join public.race_classification_standings points
      on points.race_id = race.id
     and points.after_stage_id = stage.id
     and points.classification_type = 'points'
     and points.entity_type = 'rider'
     and points.rank = 1
    where stage.stage_date::date between v_today - 1 and v_today
  ) row_data;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_race_ai_teams_hierarchy_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race record;
  v_rules record;
  v_current_count integer := 0;
  v_target_count integer := 0;
  v_needed integer := 0;
  v_inserted integer := 0;
  v_after_count integer := 0;
  v_assignment jsonb := '{}'::jsonb;
  v_added_by_tier jsonb := '{}'::jsonb;
begin
  if p_race_id is null then
    return jsonb_build_object('success',false,'error','race_id_required');
  end if;

  perform pg_advisory_xact_lock(
    hashtext('fill_race_ai_teams_hierarchy_v1'),
    hashtext(p_race_id::text)
  );

  select * into v_race
  from public.races
  where id=p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  select * into v_rules
  from public.race_entry_rules
  where race_id=p_race_id
  limit 1;

  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  select count(*)::integer
  into v_current_count
  from public.race_team_entries e
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  /*
   * Normal race-specific policy has already had first choice before this helper.
   * The hierarchy only fills a shortage. Aim for target_teams, but never exceed
   * max_teams, and never settle below min_teams when candidates exist.
   */
  v_target_count := least(
    greatest(
      coalesce(v_rules.target_teams,0),
      coalesce(v_rules.min_teams,0),
      v_current_count
    ),
    greatest(
      coalesce(v_rules.max_teams,v_rules.target_teams,v_rules.min_teams,v_current_count),
      v_current_count
    )
  );

  v_needed := greatest(v_target_count-v_current_count,0);

  if v_needed = 0 then
    return jsonb_build_object(
      'success',true,
      'race_id',p_race_id,
      'policy','universal_tier_hierarchy_v1',
      'current_teams',v_current_count,
      'target_teams',v_target_count,
      'teams_added',0,
      'added_by_tier','{}'::jsonb,
      'message','Field already meets the target size.'
    );
  end if;

  create temporary table if not exists pg_temp.race_hierarchy_candidates_v1(
    club_id uuid primary key,
    club_name text,
    club_tier text,
    tier_rank integer,
    world_tier integer,
    reputation numeric,
    geographic_priority integer,
    available_riders integer
  ) on commit drop;

  truncate table pg_temp.race_hierarchy_candidates_v1;

  insert into pg_temp.race_hierarchy_candidates_v1(
    club_id,club_name,club_tier,tier_rank,world_tier,reputation,
    geographic_priority,available_riders
  )
  select
    pool.id,
    pool.name,
    pool.club_tier::text,
    case pool.club_tier::text
      when 'worldteam' then 1
      when 'proteam' then 2
      when 'continental' then 3
      when 'amateur' then 4
      else 99
    end,
    pool.world_tier,
    pool.reputation,
    public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code),
    available.available_riders
  from public.ai_competition_filler_club_pool_v1 pool
  cross join lateral (
    select count(*)::integer as available_riders
    from public.club_roster cr
    where cr.club_id=pool.id
      and public.roster_status_allows_race_selection_v1(cr.availability_status)

      /* Same rider may not be used twice in the same race. */
      and not exists (
        select 1
        from public.race_participant_riders same_race
        where same_race.race_id=p_race_id
          and same_race.rider_id=cr.rider_id
      )

      /*
       * A club MAY race simultaneously with separate squads.
       * Only riders already selected in another overlapping race are excluded.
       */
      and not exists (
        select 1
        from public.race_participant_riders other_participation
        join public.races other_race
          on other_race.id=other_participation.race_id
        where other_participation.rider_id=cr.rider_id
          and other_participation.race_id<>p_race_id
          and daterange(
                other_race.start_date,
                coalesce(other_race.end_date,other_race.start_date)+1,
                '[)'
              )
              &&
              daterange(
                v_race.start_date,
                coalesce(v_race.end_date,v_race.start_date)+1,
                '[)'
              )
      )

      /* Protect riders already chosen in a human race plan for this race. */
      and not exists (
        select 1
        from public.race_preparation_riders pr
        join public.race_preparations prep
          on prep.id=pr.race_preparation_id
        where prep.race_id=p_race_id
          and pr.rider_id=cr.rider_id
      )
  ) available
  where coalesce(pool.is_active,true)=true
    and coalesce(pool.is_ai,true)=true
    and coalesce(pool.logo_path,'')<>''
    and pool.club_tier::text in ('worldteam','proteam','continental','amateur')
    and available.available_riders >= coalesce(v_rules.min_riders_per_team,4)

    /* Do not duplicate or resurrect an existing entry row for this race. */
    and not exists (
      select 1
      from public.race_team_entries existing
      where existing.race_id=p_race_id
        and (
          existing.club_id=pool.id
          or existing.participating_club_id=pool.id
        )
    );

  with picked as (
    select c.*
    from pg_temp.race_hierarchy_candidates_v1 c
    order by
      c.tier_rank asc,
      coalesce(c.world_tier,99) asc,
      c.available_riders desc,
      coalesce(c.reputation,0) desc,
      c.geographic_priority asc,
      c.club_id
    limit v_needed
  ),
  inserted as (
    insert into public.race_team_entries(
      id,race_id,club_id,participating_club_id,status,entry_source,
      is_ai_filler,auto_filled_at,commitment_score_snapshot,acceptance_score,
      review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
    )
    select
      gen_random_uuid(),
      p_race_id,
      p.club_id,
      p.club_id,
      'accepted',
      'ai_fill',
      true,
      now(),
      null,
      null,
      1,
      'AI fallback team added by universal tier hierarchy: WorldTeam -> ProTeam -> Continental -> Amateur. Club overlap is allowed when distinct riders are available.',
      now(),now(),now(),now()
    from picked p
    on conflict (race_id,club_id) do nothing
    returning club_id
  )
  select count(*)::integer
  into v_inserted
  from inserted;

  /*
   * Populate the newly accepted teams. This routine independently enforces the
   * rider-level overlap rule, so simultaneous club squads cannot share riders.
   */
  select public.assign_ai_riders_to_race_v1(p_race_id)
  into v_assignment;

  select count(*)::integer
  into v_after_count
  from public.race_team_entries e
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  select coalesce(
    jsonb_object_agg(tier,team_count),
    '{}'::jsonb
  )
  into v_added_by_tier
  from (
    select c.club_tier as tier,count(*)::integer as team_count
    from pg_temp.race_hierarchy_candidates_v1 c
    join public.race_team_entries e
      on e.race_id=p_race_id
     and e.club_id=c.club_id
     and e.status in ('accepted','confirmed')
     and e.decision_reason like 'AI fallback team added by universal tier hierarchy:%'
    group by c.club_tier
  ) x;

  update public.races r
  set metadata=coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
        'universal_ai_hierarchy_fill_checked_at',now(),
        'universal_ai_hierarchy_fill_policy','worldteam_proteam_continental_amateur_v1',
        'universal_ai_hierarchy_teams_before',v_current_count,
        'universal_ai_hierarchy_teams_after',v_after_count,
        'universal_ai_hierarchy_target_teams',v_target_count
      ),
      updated_at=now()
  where r.id=p_race_id;

  return jsonb_build_object(
    'success',v_after_count >= coalesce(v_rules.min_teams,0),
    'race_id',p_race_id,
    'race_name',v_race.name,
    'policy','universal_tier_hierarchy_v1',
    'hierarchy',jsonb_build_array('worldteam','proteam','continental','amateur'),
    'club_overlap_allowed_with_distinct_riders',true,
    'minimum_teams',coalesce(v_rules.min_teams,0),
    'target_teams',v_target_count,
    'teams_before',v_current_count,
    'teams_added',v_inserted,
    'teams_after',v_after_count,
    'added_by_tier',v_added_by_tier,
    'rider_assignment_result',v_assignment
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_prior_same_team_jersey_reservations_v1(p_stage_id uuid, p_sporting_team_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_date date;
  v_stage_order_ts timestamp without time zone;
  v_reserved integer := 0;
  v_one integer := 0;
  x record;
begin
  if p_stage_id is null or p_sporting_team_id is null then
    return 0;
  end if;

  select
    s.stage_date::date,
    s.stage_date::timestamp
      + make_interval(
          hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
          mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
        )
  into v_stage_date, v_stage_order_ts
  from public.race_stages s
  where s.id = p_stage_id;

  if v_stage_date is null or v_stage_order_ts is null then
    return 0;
  end if;

  for x in
    select
      s.id as stage_id,
      s.race_id,
      s.stage_number,
      s.stage_date::timestamp
        + make_interval(
            hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
            mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
          ) as stage_order_ts
    from public.race_stages s
    join public.races r
      on r.id = s.race_id
    join public.race_participant_teams_v1 t
      on t.race_id = s.race_id
     and t.club_id = p_sporting_team_id
    where s.stage_date::date = v_stage_date
      and s.id <> p_stage_id
      and lower(coalesce(r.status, 'scheduled')) in ('scheduled', 'active')
      and not coalesce(s.weather_cancelled, false)
      and lower(coalesce(t.status, 'accepted')) = 'accepted'
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = s.id
      )
      and not public.universal_race_team_disqualified_for_stage_v1(
        s.race_id,
        p_sporting_team_id,
        s.stage_number
      )
      and (
        (
          s.stage_date::timestamp
            + make_interval(
                hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
                mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
              )
        ) < v_stage_order_ts
        or (
          (
            s.stage_date::timestamp
              + make_interval(
                  hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
                  mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
                )
          ) = v_stage_order_ts
          and s.id::text < p_stage_id::text
        )
      )
    order by stage_order_ts, s.id
  loop
    v_one := public.universal_race_team_required_jerseys_v1(
      x.race_id,
      p_sporting_team_id
    );
    v_reserved := v_reserved + greatest(coalesce(v_one, 0), 0);
  end loop;

  return greatest(v_reserved, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_season_migration_process_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game public.game_state%rowtype;
  v_game_date date;
  v_game_ts timestamptz;
  v_next_source integer;
  v_next_target integer;
  v_source integer;
  v_target integer;
  v_source_end date;
  v_target_start date;
  v_readiness jsonb;
  v_persistence jsonb;
  v_control public.season_transition_control_v1%rowtype;
  v_run public.season_transition_engine_runs_v2%rowtype;
  v_active_run_found boolean := false;
  v_pair_run_found boolean := false;
  v_blocking_components integer := 0;
  v_required_components integer := 0;
  v_ready_components integer := 0;
  v_exact_pair_armed boolean := false;
  v_wrong_pair_armed boolean := false;
  v_events jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_checkpoints jsonb := '[]'::jsonb;
  v_backlog jsonb := null;
  v_checklist jsonb := '[]'::jsonb;
  v_overall_status text := 'waiting';
  v_problem_count integer := 0;
  v_run_status text := null;
  v_run_error text := null;
  v_core_done boolean := false;
  v_rewards_done boolean := false;
  v_comms_done boolean := false;
  v_final_done boolean := false;
  v_resumed boolean := false;
  v_at_source_end boolean := false;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select *
  into v_game
  from public.game_state
  where id = true;

  if not found then
    raise exception 'game_state is not initialized';
  end if;

  v_game_date := public.get_current_game_date_date();
  v_game_ts := public.get_current_game_timestamp();
  v_next_source := v_game.season_number;
  v_next_target := v_next_source + 1;

  /*
   * Prefer an unfinished production run, because that is the migration an
   * administrator must currently diagnose. Otherwise the page becomes the
   * checklist for the next N -> N+1 transition.
   */
  select *
  into v_run
  from public.season_transition_engine_runs_v2 r
  where r.mode = 'production'
    and r.status <> 'completed'
  order by r.created_at desc
  limit 1;

  v_active_run_found := found;

  if v_active_run_found then
    v_source := v_run.source_season;
    v_target := v_run.target_season;
    v_pair_run_found := true;
  else
    v_source := v_next_source;
    v_target := v_next_target;
    /*
     * Completed production runs belong to History, not to the live checklist.
     * This matters after rollback/lab verification: an old successful run must
     * never make the next real transition appear partially completed.
     */
    v_pair_run_found := false;
  end if;

  v_source_end := public.get_game_date_for_season_end(v_source);
  v_target_start := public.get_game_date_for_season_start(v_target);
  v_at_source_end := v_game.season_number = v_source and v_game_date = v_source_end;

  v_readiness := public.get_season_transition_preflight_v1();
  v_persistence := public.get_season_transition_persistence_guard_status_v1();

  v_required_components :=
    coalesce((v_readiness ->> 'required_components')::integer, 0);
  v_ready_components :=
    coalesce((v_readiness ->> 'ready_components')::integer, 0);
  v_blocking_components :=
    coalesce((v_readiness ->> 'blocking_components')::integer, 0);

  select *
  into v_control
  from public.season_transition_control_v1
  where id = true;

  if found then
    v_exact_pair_armed :=
      coalesce(v_control.is_armed, false)
      and v_control.armed_source_season = v_source
      and v_control.armed_target_season = v_target;

    v_wrong_pair_armed :=
      coalesce(v_control.is_armed, false)
      and not v_exact_pair_armed;
  end if;

  if v_pair_run_found then
    v_run_status := v_run.status;
    v_run_error := v_run.error_message;

    v_core_done := v_run.status in (
      'core_validated','rewards_applied','communication_pending',
      'communication_done','final_validated','completed'
    );
    v_rewards_done := v_run.status in (
      'rewards_applied','communication_pending','communication_done',
      'final_validated','completed'
    );
    v_comms_done := v_run.status in (
      'communication_done','final_validated','completed'
    );
    v_final_done := v_run.status = 'completed';
    v_resumed :=
      v_run.status = 'completed'
      and nullif(v_run.metadata ->> 'resumed_at', '') is not null;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'phase', e.phase,
          'event_type', e.event_type,
          'payload', e.payload,
          'created_at', e.created_at
        )
        order by e.id desc
      ),
      '[]'::jsonb
    )
    into v_events
    from (
      select *
      from public.season_transition_engine_events_v2
      where run_id = v_run.id
      order by id desc
      limit 100
    ) e;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(h) order by h.created_at desc),
    '[]'::jsonb
  )
  into v_history
  from (
    select
      r.id,
      r.source_season,
      r.target_season,
      r.mode,
      r.status,
      r.source_end_date,
      r.target_start_date,
      r.error_message,
      r.created_at,
      r.source_frozen_at,
      r.core_applied_at,
      r.completed_at,
      r.updated_at,
      nullif(r.metadata ->> 'resumed_at', '') as resumed_at
    from public.season_transition_engine_runs_v2 r
    where r.mode = 'production'
    order by r.created_at desc
    limit 10
  ) h;

  select coalesce(
    jsonb_agg(to_jsonb(c) order by c.created_at desc),
    '[]'::jsonb
  )
  into v_checkpoints
  from (
    select
      cp.id,
      cp.label,
      cp.source_season,
      cp.source_end_date,
      cp.restore_method,
      cp.status,
      cp.notes,
      cp.created_at,
      cp.verified_at,
      cp.updated_at
    from public.season_transition_lab_checkpoints_v1 cp
    order by cp.created_at desc
    limit 10
  ) c;

  select to_jsonb(b)
  into v_backlog
  from (
    select
      d.id,
      d.current_game_date,
      d.season_number,
      d.month_number,
      d.day_number,
      d.status,
      d.attempts,
      d.source,
      d.last_error,
      d.processed_at,
      d.created_at,
      d.updated_at
    from public.game_daily_tick_backlog_v1 d
    where d.current_game_date = v_target_start
    order by d.created_at desc
    limit 1
  ) b;

  /*
   * Permanent operational checklist.
   * "blocked" always means the game should remain paused / the transition
   * should not advance until the displayed problem is repaired.
   */
  v_checklist := jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'key', 'component_readiness',
      'title', 'Preflight readiness',
      'description', 'All required season-transition components must be certified before the boundary can be armed.',
      'status', case
        when v_blocking_components = 0 and v_required_components > 0 then 'ready'
        else 'blocked'
      end,
      'detail', format('%s/%s required components ready', v_ready_components, v_required_components),
      'problem', case
        when v_blocking_components > 0
          then format('%s required component(s) are not ready.', v_blocking_components)
        else null
      end,
      'remediation', case
        when v_blocking_components > 0
          then 'Open the readiness checklist below, repair every non-ready required component, then refresh this page. Do not force the boundary.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 2,
      'key', 'arm_pair',
      'title', 'Arm exact season pair',
      'description', format('The transition control must be armed for Season %s -> Season %s. The boundary controller can auto-arm only when all readiness checks are green.', v_source, v_target),
      'status', case
        when v_exact_pair_armed then 'done'
        when v_wrong_pair_armed then 'blocked'
        when v_blocking_components > 0 then 'blocked'
        else 'waiting'
      end,
      'detail', case
        when v_exact_pair_armed then 'Exact source/target pair is armed.'
        when v_wrong_pair_armed then format('Control is armed for Season %s -> Season %s.', v_control.armed_source_season, v_control.armed_target_season)
        else 'Not armed yet; automatic arming is allowed only with a green readiness gate.'
      end,
      'problem', case
        when v_wrong_pair_armed then 'A different season pair is armed.'
        when v_blocking_components > 0 then 'Readiness gate is not fully green.'
        else null
      end,
      'remediation', case
        when v_wrong_pair_armed then 'Disarm the incorrect pair, verify the source/target seasons, and arm only the exact pair after readiness is green.'
        when v_blocking_components > 0 then 'Resolve the blocking readiness components first.'
        else 'No manual action is required before the boundary unless an administrator intentionally pre-arms the pair.'
      end
    ),
    jsonb_build_object(
      'order', 3,
      'key', 'boundary_pause',
      'title', 'Pause at Dec 31 -> Jan 1 boundary',
      'description', 'The ordinary game clock must not write Jan 1 directly. The v2 boundary controller takes ownership, pauses both clock/state, and fails closed on any error.',
      'status', case
        when v_pair_run_found and (
          v_run.status in (
            'source_frozen','core_applied','core_validated','rewards_applied',
            'communication_pending','communication_done','final_validated','completed'
          )
          or (v_run.status = 'failed' and coalesce(v_game.is_paused,false))
        ) then 'done'
        when v_at_source_end and coalesce(v_game.is_paused,false) then 'running'
        else 'waiting'
      end,
      'detail', case
        when coalesce(v_game.is_paused,false) then 'Game is currently paused.'
        else format('Automatic trigger is the exact game-date boundary %s -> %s.', v_source_end, v_target_start)
      end,
      'problem', null,
      'remediation', 'If the boundary controller fails, keep the game paused and diagnose the run error before retrying.'
    ),
    jsonb_build_object(
      'order', 4,
      'key', 'freeze_source',
      'title', 'Freeze source season',
      'description', 'Snapshot final standings, reconcile the canonical source snapshot, and verify division winners before any target-season mutations.',
      'status', case
        when v_pair_run_found and v_run.status = 'failed' then 'blocked'
        when v_pair_run_found and v_run.status in (
          'source_frozen','core_applied','core_validated','rewards_applied',
          'communication_pending','communication_done','final_validated','completed'
        ) then 'done'
        when v_pair_run_found and v_run.status = 'created' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_pair_run_found and v_run.source_frozen_at is not null
          then format('Source frozen at %s.', v_run.source_frozen_at)
        else 'Waiting for the exact season boundary.'
      end,
      'problem', case when v_pair_run_found and v_run.status = 'failed' then v_run.error_message else null end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'failed'
          then 'Repair the source snapshot/date/pause invariant shown by the error. Do not advance the clock. Start a new controlled run only after the cause is understood.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 5,
      'key', 'target_boundary',
      'title', 'Move to target Jan 1 while paused',
      'description', 'After source freeze succeeds, set the game to Season N+1, Jan 1, 00:00 while the game remains paused and queue Jan 1 daily processing.',
      'status', case
        when v_pair_run_found
         and v_game.season_number = v_target
         and v_game_date = v_target_start then 'done'
        else 'waiting'
      end,
      'detail', case
        when v_game.season_number = v_target and v_game_date = v_target_start
          then format('Game is at Season %s · Jan 1%s.', v_target, case when v_game.is_paused then ' and paused' else '' end)
        else format('Target boundary is Season %s · Jan 1.', v_target)
      end,
      'problem', case
        when v_pair_run_found
         and v_run.status in ('source_frozen','core_applied','core_validated','rewards_applied','communication_pending','communication_done')
         and not (v_game.season_number = v_target and v_game_date = v_target_start)
          then 'Transition run exists but the live game is not at its target Jan 1 boundary.'
        else null
      end,
      'remediation', 'The live game must remain at the target Jan 1 boundary until the transition completes.'
    ),
    jsonb_build_object(
      'order', 6,
      'key', 'core_transition',
      'title', 'Atomic core migration',
      'description', 'Calendar, ranking/history snapshot, retirements, competition/inactive clubs, rider and staff contracts, stale negotiations, AI rosters, sponsors, Developing Team and target-state verification run as the core transition.',
      'status', case
        when v_core_done then 'done'
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status in ('source_frozen','core_applied') then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_core_done then 'Core migration committed and target fresh-state validation passed.'
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then 'A core attempt failed and was rolled back atomically; the source freeze remains available for retry.'
        else 'Waiting for source freeze and target-boundary handoff.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then 'Fix the exact invariant named in the run error, then retry continuation. The failed core mutation was rolled back; do not manually reapply completed-looking partial data.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 7,
      'key', 'rewards',
      'title', 'Apply season rewards',
      'description', 'Apply the guarded, idempotent reward grants only after core validation succeeds.',
      'status', case
        when v_rewards_done then 'done'
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status = 'core_validated' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_rewards_done then 'Season rewards applied.'
        else 'Rewards remain separated from the core transition and are safe to retry.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null
          then 'Repair the reward invariant or ledger issue, then retry continuation. Core sporting state is already validated and must not be rerun manually.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 8,
      'key', 'communications',
      'title', 'Dispatch season communications',
      'description', 'Send season-start, movement and contract-expiry communications with idempotent event keys.',
      'status', case
        when v_comms_done then 'done'
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status in ('rewards_applied','communication_pending') then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_comms_done then 'Post-transition communications completed.'
        else 'Communication failure never rolls back successful sporting state.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null
          then 'Fix the notification/inbox error and retry communications. Do not rerun the sporting transition.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 9,
      'key', 'final_validation',
      'title', 'Final invariant validation',
      'description', 'Recheck source snapshot, target fresh state, persistence guards, reward guard/grants and the completed transition bridge before declaring success.',
      'status', case
        when v_final_done then 'done'
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status = 'communication_done' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_final_done then 'Final validation passed; transition is completed.'
        else 'Game remains paused until this check passes.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null
          then 'Repair only the failed final invariant, then retry finalization. Core/rewards/communications are already committed by design.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 10,
      'key', 'resume',
      'title', 'Resume game at Jan 1',
      'description', 'Resume only after the transition is completed and the game is still exactly at target Jan 1.',
      'status', case
        when v_resumed then 'done'
        when v_final_done and coalesce(v_game.is_paused,false) then 'ready'
        when v_final_done and not coalesce(v_game.is_paused,false) then 'done'
        else 'waiting'
      end,
      'detail', case
        when v_resumed or (v_final_done and not coalesce(v_game.is_paused,false))
          then 'Game clock resumed after successful transition.'
        when v_final_done then 'Transition completed; resume is the final controlled action.'
        else 'Resume is forbidden before completion.'
      end,
      'problem', null,
      'remediation', 'Never unpause a failed or incomplete season transition.'
    ),
    jsonb_build_object(
      'order', 11,
      'key', 'jan1_daily_backlog',
      'title', 'Process Jan 1 daily automation',
      'description', 'The Jan 1 daily tick is intentionally queued during migration and processed by forward daily automation only after the transition boundary is safely handled.',
      'status', case
        when v_backlog is null then 'waiting'
        when v_backlog ->> 'status' = 'processed' then 'done'
        when nullif(v_backlog ->> 'last_error','') is not null then 'blocked'
        else 'waiting'
      end,
      'detail', case
        when v_backlog is null then 'Jan 1 backlog row does not exist yet.'
        when v_backlog ->> 'status' = 'processed' then 'Jan 1 daily automation processed successfully.'
        else format('Jan 1 daily automation status: %s.', coalesce(v_backlog ->> 'status','unknown'))
      end,
      'problem', nullif(v_backlog ->> 'last_error',''),
      'remediation', case
        when nullif(v_backlog ->> 'last_error','') is not null
          then 'Keep the backlog pending, fix the reported daily processor error and let the retry-safe forward automation process it again.'
        else 'No action required.'
      end
    )
  );

  v_problem_count := v_blocking_components;
  if v_wrong_pair_armed then
    v_problem_count := v_problem_count + 1;
  end if;
  if v_pair_run_found and (
    v_run.status = 'failed'
    or (v_run.status <> 'completed' and nullif(v_run.error_message,'') is not null)
  ) then
    v_problem_count := v_problem_count + 1;
  end if;
  if nullif(v_backlog ->> 'last_error','') is not null then
    v_problem_count := v_problem_count + 1;
  end if;

  v_overall_status := case
    when v_problem_count > 0 then 'needs_attention'
    when v_pair_run_found and v_run.status = 'completed' then 'completed'
    when v_pair_run_found then 'in_progress'
    when v_exact_pair_armed then 'armed'
    when v_blocking_components = 0 then 'ready'
    else 'blocked'
  end;

  return jsonb_build_object(
    'overall_status', v_overall_status,
    'problem_count', v_problem_count,
    'game', jsonb_build_object(
      'season', v_game.season_number,
      'month', v_game.month_number,
      'day', v_game.day_number,
      'hour', v_game.hour_number,
      'minute', v_game.minute_number,
      'paused', v_game.is_paused,
      'game_date', v_game_date,
      'game_timestamp', v_game_ts
    ),
    'pair', jsonb_build_object(
      'source_season', v_source,
      'target_season', v_target,
      'source_end_date', v_source_end,
      'target_start_date', v_target_start,
      'using_active_run_pair', v_active_run_found
    ),
    'timing_policy', jsonb_build_object(
      'trigger', 'exact_dec31_to_jan1_game_date_boundary',
      'automatic_controller', 'season_transition_boundary_controller_v2',
      'game_pauses_before_mutation', true,
      'target_boundary_time', 'Jan 1 00:00 game time',
      'fail_closed', true,
      'resume_only_after_completed', true,
      'jan1_daily_processing_deferred', true
    ),
    'readiness', v_readiness,
    'persistence', v_persistence,
    'control', case when v_control.id is null then null else to_jsonb(v_control) end,
    'run', case
      when not v_pair_run_found then null
      else jsonb_build_object(
        'id', v_run.id,
        'source_season', v_run.source_season,
        'target_season', v_run.target_season,
        'mode', v_run.mode,
        'status', v_run.status,
        'source_end_date', v_run.source_end_date,
        'target_start_date', v_run.target_start_date,
        'error_message', v_run.error_message,
        'created_at', v_run.created_at,
        'source_frozen_at', v_run.source_frozen_at,
        'core_applied_at', v_run.core_applied_at,
        'completed_at', v_run.completed_at,
        'updated_at', v_run.updated_at,
        'resumed_at', nullif(v_run.metadata ->> 'resumed_at',''),
        'core_report', v_run.core_report,
        'reward_report', v_run.reward_report,
        'communication_report', v_run.communication_report,
        'validation_report', v_run.validation_report
      )
    end,
    'checklist', v_checklist,
    'events', v_events,
    'jan1_backlog', v_backlog,
    'history', v_history,
    'lab_checkpoints', v_checkpoints
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_season_migration_problem_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_readiness jsonb;
  v_count integer := 0;
  v_run public.season_transition_engine_runs_v2%rowtype;
  v_control public.season_transition_control_v1%rowtype;
  v_current_season integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  v_readiness := public.get_season_transition_preflight_v1();
  v_count := coalesce((v_readiness ->> 'blocking_components')::integer, 0);

  select *
  into v_run
  from public.season_transition_engine_runs_v2 r
  where r.mode = 'production'
    and r.status <> 'completed'
  order by r.created_at desc
  limit 1;

  if found and (
    v_run.status = 'failed'
    or nullif(v_run.error_message,'') is not null
  ) then
    v_count := v_count + 1;
  end if;

  v_current_season := public.get_current_season_number();

  select *
  into v_control
  from public.season_transition_control_v1
  where id = true;

  if found
     and coalesce(v_control.is_armed,false)
     and (
       v_control.armed_source_season is distinct from v_current_season
       or v_control.armed_target_season is distinct from v_current_season + 1
     )
  then
    v_count := v_count + 1;
  end if;

  if exists (
    select 1
    from public.game_daily_tick_backlog_v1 b
    where nullif(b.last_error,'') is not null
      and b.current_game_date >= public.get_game_date_for_season_start(v_current_season)
      and b.current_game_date <= public.get_current_game_date_date()
      and b.status <> 'processed'
  ) then
    v_count := v_count + 1;
  end if;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_race_result_morale_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_delta integer := 0;
  v_before integer;
  v_after integer;
  v_status text := lower(coalesce(new.finish_status,''));
  v_is_national_championship boolean := false;
  v_participation_bonus integer := 0;
begin
  if v_status in ('dnf','abandoned','did_not_finish','otl') then
    v_delta := -1;
  elsif new.finish_rank=1 then
    v_delta := 3;
  elsif new.finish_rank between 2 and 3 then
    v_delta := 2;
  elsif new.finish_rank between 4 and 10 then
    v_delta := 1;
  else
    v_delta := 0;
  end if;

  select coalesce((r.metadata->>'national_championship')::boolean,false)
  into v_is_national_championship
  from public.races r
  where r.id=new.race_id;

  if coalesce(v_is_national_championship,false)
     and v_status in ('finished','ok','completed')
  then
    select coalesce(c.participation_morale_bonus,1)
    into v_participation_bonus
    from public.national_championship_config c
    where c.id=true;

    v_participation_bonus:=coalesce(v_participation_bonus,1);
    v_delta:=v_delta+v_participation_bonus;
  end if;

  if v_delta=0 then
    return new;
  end if;

  select coalesce(r.morale,50)
  into v_before
  from public.riders r
  where r.id=new.rider_id
  for update;

  if not found then
    return new;
  end if;

  v_after:=greatest(0,least(100,v_before+v_delta));

  update public.riders
  set
    morale=v_after,
    morale_updated_on=case
      when new.stage_date is null then morale_updated_on
      else greatest(coalesce(morale_updated_on,new.stage_date),new.stage_date)
    end
  where id=new.rider_id;

  update public.rider_race_development_events
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'result_morale_rule_version','race_result_morale_v2',
    'result_morale_delta',v_delta,
    'result_morale_before',v_before,
    'result_morale_after',v_after,
    'national_championship',coalesce(v_is_national_championship,false),
    'national_championship_participation_bonus',v_participation_bonus
  )
  where id=new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_plan_bonus_preview_v2(p_club_id uuid, p_staff_ids uuid[] DEFAULT '{}'::uuid[], p_asset_assignments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_staff jsonb:='[]'::jsonb;
  v_live_staff jsonb:='[]'::jsonb;
begin
  v_base:=public.get_race_plan_bonus_preview_v1(
    p_club_id,
    coalesce(p_staff_ids,'{}'::uuid[]),
    coalesce(p_asset_assignments,'[]'::jsonb)
  );

  select coalesce(jsonb_agg(value),'[]'::jsonb)
  into v_staff
  from jsonb_array_elements(coalesce(v_base->'staff','[]'::jsonb))
  where coalesce(value->>'source_key','')
        not in('sport_director','u23_head_coach','nutritionist');

  with sport_directors as (
    select
      cs.id,cs.role_type,cs.staff_name,
      greatest(0,least(100,
        coalesce(cs.expertise,50)*.35+
        coalesce(cs.experience,50)*.15+
        coalesce(cs.potential,50)*.10+
        coalesce(cs.leadership,50)*.20+
        (coalesce(cs.efficiency,50)+public.team_policy_staff_quality_bonus_v1(p_club_id))*.15+
        coalesce(cs.loyalty,50)*.05
      )) as quality,
      public.get_staff_assignment_availability_factor(
        cs.id,public.get_current_game_date_date()
      ) as availability
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.id=any(coalesce(p_staff_ids,'{}'::uuid[]))
      and cs.is_active=true
      and cs.role_type='sport_director'
  ),
  best_nutritionist as (
    select
      cs.id,cs.role_type,cs.staff_name,
      greatest(0,least(100,
        coalesce(cs.expertise,50)*.35+
        coalesce(cs.experience,50)*.10+
        coalesce(cs.potential,50)*.10+
        coalesce(cs.leadership,50)*.10+
        (coalesce(cs.efficiency,50)+public.team_policy_staff_quality_bonus_v1(p_club_id))*.25+
        coalesce(cs.loyalty,50)*.10
      )) as quality,
      public.get_staff_assignment_availability_factor(
        cs.id,public.get_current_game_date_date()
      ) as availability
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.is_active=true
      and cs.role_type='nutritionist'
    order by quality desc,cs.id
    limit 1
  ),
  candidates as (
    select * from sport_directors
    union all
    select * from best_nutritionist
  ),
  rows as (
    select case
      when role_type='sport_director' then
        jsonb_build_object(
          'source_type','staff',
          'source_key','sport_director',
          'source_label','Sport Director: '||staff_name,
          'effects',jsonb_build_array(
            jsonb_build_object(
              'effect_key','tactical_support_pct',
              'label','Race tactics & execution',
              'value','+'||
                round(
                  greatest(0,least(8,(quality-35)*.12))
                  *greatest(0,least(1,availability)),
                  1
                )::text||'%'
            )
          )
        )
      when role_type='nutritionist' then
        jsonb_build_object(
          'source_type','staff',
          'source_key','nutritionist',
          'source_label','Nutritionist: '||staff_name,
          'effects',jsonb_build_array(
            jsonb_build_object(
              'effect_key','feeding_support_pct',
              'label','Race feeding support',
              'value','+'||round(
                greatest(0,least(3.5,(quality-35)*.055))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','hydration_support_bonus_pct',
              'label','Hydration / fatigue control',
              'value','+'||round(
                greatest(0,least(4,(quality-35)*.065))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','recovery_comfort_bonus_pct',
              'label','Post-stage nutrition recovery',
              'value','+'||round(
                greatest(0,least(4,(quality-35)*.065))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','minor_injury_risk_reduction_pct',
              'label','Health protection',
              'value','-'||round(
                greatest(0,least(2.5,(quality-35)*.040))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            )
          )
        )
      else null
    end as row_json
    from candidates
  )
  select coalesce(
    jsonb_agg(row_json) filter(where row_json is not null),
    '[]'::jsonb
  )
  into v_live_staff
  from rows;

  return jsonb_set(
    coalesce(v_base,'{}'::jsonb),
    '{staff}',
    v_staff||v_live_staff,
    true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_u23_stage_plan_on_race_plan_submit_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_id uuid;
  v_result jsonb;
begin
  if lower(coalesce(new.status,'')) not in
       ('submitted','locked','final','finalized','completed')
     or lower(coalesce(old.status,'')) in
       ('submitted','locked','final','finalized','completed')
  then
    return new;
  end if;

  if not exists (
    select 1
    from public.race_preparation_stage_plan_automation a
    where a.race_preparation_id=new.id
      and a.is_enabled=true
      and a.planner_role='u23_head_coach'
      and a.planner_staff_id is not null
  ) then
    return new;
  end if;

  select rsp.stage_id
  into v_stage_id
  from public.race_stage_plans rsp
  where rsp.race_preparation_id=new.id
    and rsp.status='draft'
    and rsp.locked_at is null
    and rsp.submitted_at is null
    and rsp.stage_id is not null
    and rsp.stage_date >= public.get_current_game_date_date()
  order by rsp.stage_number, rsp.stage_date, rsp.id
  limit 1;

  if v_stage_id is null then
    return new;
  end if;

  begin
    v_result := public.apply_u23_stage_plan_automation_v1(
      new.id,
      v_stage_id,
      'race_plan_submitted'
    );

    update public.race_preparation_stage_plan_automation
    set
      last_generation_status =
        coalesce(v_result->>'status','race_plan_submitted_processed'),
      last_generation_summary = coalesce(v_result,'{}'::jsonb),
      metadata = coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'race_plan_submit_hook_installed', true,
          'last_race_plan_submit_hook_at', clock_timestamp()
        ),
      updated_at=now()
    where race_preparation_id=new.id;
  exception when others then
    update public.race_preparation_stage_plan_automation
    set
      last_generation_status='race_plan_submit_hook_error',
      last_generation_summary=jsonb_build_object(
        'status','error',
        'message',sqlerrm,
        'stage_id',v_stage_id
      ),
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'race_plan_submit_hook_installed', true,
          'last_race_plan_submit_hook_at', clock_timestamp()
        ),
      updated_at=now()
    where race_preparation_id=new.id;
  end;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_mark_u23_submit_hook_installed_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.metadata :=
    coalesce(new.metadata,'{}'::jsonb)
    || jsonb_build_object('race_plan_submit_hook_installed', true);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_team_policy_rider_support_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_date date:=coalesce(p_game_date,public.get_current_game_date_date());
  v_recovery_rows integer:=0;
  v_morale_rows integer:=0;
begin
  if v_date is null then
    return jsonb_build_object('success',false,'reason','game_date_unavailable');
  end if;

  with candidates as (
    select cr.rider_id,cr.club_id,
           coalesce(e.recovery_bonus,0)+coalesce(e.fatigue_reduction_bonus,0) as recovery_points
    from public.club_riders cr
    cross join lateral public.get_club_team_policy_live_effects_v1(cr.club_id) e
    where coalesce(e.recovery_bonus,0)+coalesce(e.fatigue_reduction_bonus,0)>0
  ),
  ins as (
    insert into public.team_policy_rider_effect_log_v1(
      rider_id,club_id,effect_date,effect_kind,effect_value
    )
    select rider_id,club_id,v_date,'recovery_fatigue',recovery_points
    from candidates
    on conflict do nothing
    returning rider_id,effect_value
  )
  update public.riders r
  set fatigue=greatest(0,coalesce(r.fatigue,0)-ins.effect_value)
  from ins
  where r.id=ins.rider_id;

  get diagnostics v_recovery_rows=row_count;

  if mod(extract(doy from v_date)::integer-1,7)=0 then
    with candidates as (
      select cr.rider_id,cr.club_id,least(4,greatest(0,coalesce(e.morale_delta,0))) as morale_points
      from public.club_riders cr
      cross join lateral public.get_club_team_policy_live_effects_v1(cr.club_id) e
      where coalesce(e.morale_delta,0)>0
    ),
    ins as (
      insert into public.team_policy_rider_effect_log_v1(
        rider_id,club_id,effect_date,effect_kind,effect_value
      )
      select rider_id,club_id,v_date,'morale',morale_points
      from candidates
      on conflict do nothing
      returning rider_id,effect_value
    )
    update public.riders r
    set morale=least(100,coalesce(r.morale,50)+ins.effect_value)
    from ins
    where r.id=ins.rider_id;

    get diagnostics v_morale_rows=row_count;
  end if;

  return jsonb_build_object(
    'success',true,
    'game_date',v_date,
    'recovery_riders',v_recovery_rows,
    'morale_riders',v_morale_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_sync_team_policy_nonrecurring_costs_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_policy public.club_team_policies%rowtype;
  v_season integer;
  v_item record;
  v_scope_season integer;
  v_target bigint;
  v_paid bigint;
  v_delta bigint;
  v_tx uuid;
  v_results jsonb:='[]'::jsonb;
begin
  select season_number into v_season from public.game_state where id=true;
  select * into v_policy from public.club_team_policies where club_id=p_club_id;
  if not found then
    return jsonb_build_object('success',true,'club_id',p_club_id,'skipped',true,'reason','no_policy_row');
  end if;

  for v_item in
    select *
    from (
      values
        ('staff_equipment_level'::text, v_policy.staff_equipment_level::text, 'one_time'::text),
        ('rider_bonus_plan'::text, v_policy.rider_bonus_plan::text, 'seasonal'::text),
        ('staff_bonus_plan'::text, v_policy.staff_bonus_plan::text, 'seasonal'::text)
    ) x(policy_key,option_code,expected_cost_type)
  loop
    select coalesce(c.base_cost,0)::bigint
    into v_target
    from public.team_policy_option_catalog c
    where c.policy_key=v_item.policy_key
      and c.option_code=v_item.option_code
      and c.is_active=true
      and c.cost_type=v_item.expected_cost_type
    limit 1;

    v_target:=coalesce(v_target,0);
    v_scope_season:=case when v_item.expected_cost_type='one_time' then 0 else coalesce(v_season,1) end;

    select charged_amount into v_paid
    from public.team_policy_nonrecurring_charge_state_v1 s
    where s.club_id=p_club_id
      and s.policy_key=v_item.policy_key
      and s.season_number=v_scope_season
    for update;

    v_paid:=coalesce(v_paid,0);
    v_delta:=greatest(0,v_target-v_paid);

    if v_delta>0 then
      v_tx:=public.finance_spend_from_club(
        p_club_id,
        v_delta,
        case
          when v_item.expected_cost_type='one_time' then 'team_policy_one_time_cost'
          else 'team_policy_seasonal_cost'
        end,
        'SINK',
        format('team_policy_nonrecurring:%s:%s:%s:%s',p_club_id,v_item.policy_key,v_scope_season,v_target),
        jsonb_build_object(
          'source','team_policies',
          'policy_key',v_item.policy_key,
          'option_code',v_item.option_code,
          'cost_type',v_item.expected_cost_type,
          'season_number',v_scope_season,
          'charged_before',v_paid,
          'target_cost',v_target,
          'delta_charged',v_delta
        )
      );
    else
      v_tx:=null;
    end if;

    insert into public.team_policy_nonrecurring_charge_state_v1(
      club_id,policy_key,season_number,charged_amount,updated_at
    )
    values(p_club_id,v_item.policy_key,v_scope_season,greatest(v_paid,v_target),now())
    on conflict(club_id,policy_key,season_number) do update
    set charged_amount=greatest(public.team_policy_nonrecurring_charge_state_v1.charged_amount,excluded.charged_amount),
        updated_at=now();

    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'policy_key',v_item.policy_key,
      'option_code',v_item.option_code,
      'cost_type',v_item.expected_cost_type,
      'season_number',v_scope_season,
      'target_cost',v_target,
      'previously_charged',v_paid,
      'delta_charged',v_delta,
      'transaction_id',v_tx
    ));
  end loop;

  return jsonb_build_object('success',true,'club_id',p_club_id,'season_number',v_season,'charges',v_results);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_team_policy_nonrecurring_costs_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  c record;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_ok integer:=0;
  v_failed integer:=0;
begin
  for c in
    select p.club_id
    from public.club_team_policies p
    join public.clubs cl on cl.id=p.club_id
    where cl.deleted_at is null
  loop
    begin
      v_result:=public.finance_sync_team_policy_nonrecurring_costs_v1(c.club_id);
      v_ok:=v_ok+1;
      v_results:=v_results||jsonb_build_array(v_result);
    exception when others then
      v_failed:=v_failed+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'success',false,'club_id',c.club_id,'error',sqlerrm
      ));
    end;
  end loop;
  return jsonb_build_object('success',v_failed=0,'processed',v_ok,'failed',v_failed,'results',v_results);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_system_incident_email_v1(p_incident_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  i public.system_incidents%rowtype;
  p public.system_monitor_processes%rowtype;
  cfg public.system_health_config_v1%rowtype;
  v_subject text; v_text text; v_html text; v_count integer:=0; v_email text;
begin
  select * into i from public.system_incidents where id=p_incident_id;
  if not found then return 0; end if;
  select * into p from public.system_monitor_processes where process_key=i.process_key;
  if not found or not p.email_alerts_enabled then return 0; end if;
  select * into cfg from public.system_health_config_v1 where id=true;
  if not coalesce(cfg.email_enabled,true) then return 0; end if;

  v_subject:=format('[ProPeloton Manager] %s system incident: %s',upper(i.severity),i.title);
  v_text:=format(E'ProPeloton Manager detected a system problem.\n\nSeverity: %s\nProcess: %s\nCategory: %s\nFirst seen: %s\nLast seen: %s\n\n%s\n\nOpen Administration → System Health for diagnostics.',
    upper(i.severity),p.label,p.category,i.first_seen_at,i.last_seen_at,i.message);
  v_html:=format('<div style="font-family:Arial,sans-serif;color:#111827"><h2>ProPeloton Manager system incident</h2><p><strong>Severity:</strong> %s<br><strong>Process:</strong> %s<br><strong>Category:</strong> %s<br><strong>First seen:</strong> %s<br><strong>Last seen:</strong> %s</p><p>%s</p><p>Open <strong>Administration → System Health</strong> for diagnostics.</p></div>',
    upper(i.severity),p.label,p.category,i.first_seen_at,i.last_seen_at,replace(replace(i.message,'&','&amp;'),'<','&lt;'));

  for v_email in
    select distinct x.email from (
      select nullif(trim(a.email),'') email from public.app_admins a where a.is_active=true
      union all
      select nullif(trim(cfg.alert_email),'')
    ) x where x.email is not null
  loop
    insert into public.system_alert_email_outbox(incident_id,recipient_email,subject,text_body,html_body)
    values(i.id,v_email,v_subject,v_text,v_html);
    v_count:=v_count+1;
  end loop;

  update public.system_incidents set last_emailed_at=now(),updated_at=now() where id=i.id;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.raise_system_incident_v1(p_process_key text, p_severity text, p_title text, p_message text, p_dedupe_key text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid; v_last_email timestamptz; v_old_severity text;
  v_severity text:=lower(coalesce(p_severity,'high')); v_email boolean:=false;
begin
  if v_severity not in ('warning','high','critical') then v_severity:='high'; end if;
  select id,last_emailed_at,severity into v_id,v_last_email,v_old_severity
  from public.system_incidents
  where dedupe_key=p_dedupe_key and status in ('open','acknowledged')
  order by created_at desc limit 1 for update;

  if v_id is null then
    insert into public.system_incidents(process_key,severity,status,title,message,dedupe_key,details)
    values(p_process_key,v_severity,'open',p_title,p_message,p_dedupe_key,coalesce(p_details,'{}'))
    returning id into v_id;
    v_email:=true;
  else
    update public.system_incidents
    set severity=case when severity='critical' then severity when severity='high' and v_severity='warning' then severity else v_severity end,
        title=p_title,message=p_message,details=coalesce(p_details,'{}'),last_seen_at=now(),
        occurrence_count=occurrence_count+1,updated_at=now()
    where id=v_id;
    v_email:=v_last_email is null
      or v_last_email<now()-interval '6 hours'
      or (v_old_severity='warning' and v_severity in ('high','critical'))
      or (v_old_severity='high' and v_severity='critical');
  end if;
  if v_email then perform public.queue_system_incident_email_v1(v_id); end if;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_system_incident_by_dedupe_v1(p_dedupe_key text, p_note text DEFAULT 'Recovered automatically.'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_count integer;
begin
  select coalesce(array_agg(id),'{}'::uuid[])
  into v_ids
  from public.system_incidents
  where dedupe_key=p_dedupe_key
    and status in ('open','acknowledged');

  update public.system_incidents
  set status='resolved',
      resolved_at=coalesce(resolved_at,now()),
      resolution_note=coalesce(nullif(p_note,''),'Recovered automatically.'),
      updated_at=now()
  where id=any(v_ids);

  get diagnostics v_count=row_count;

  update public.system_alert_email_outbox
  set status='cancelled',
      last_error='Incident resolved before email dispatch.',
      updated_at=now()
  where incident_id=any(v_ids)
    and status in ('pending','failed');

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_system_cron_runs_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  proc record;
  v_latest record;
  v_previous record;
  v_dedupe_key text;
  v_restart_grace_minutes integer;
  v_is_restart_failure boolean;
  v_inserted integer:=0;
  v_updated integer:=0;
begin
  with src as (
    select
      smp.process_key,
      d.runid,
      d.status as cron_status,
      d.return_message,
      d.start_time,
      d.end_time,
      (
        d.status not in ('succeeded','running')
        and lower(trim(coalesce(d.return_message,'')))='server restarted'
      ) as is_restart_failure
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    join public.system_monitor_processes smp
      on smp.source_kind='cron'
     and smp.is_enabled
     and smp.source_ref=j.jobname
    where d.start_time is not null
      and d.start_time>=now()-interval '6 hours'
  )
  insert into public.system_monitor_runs(
    process_key,source_run_id,status,started_at,finished_at,duration_ms,
    summary,error_message,details
  )
  select
    s.process_key,
    s.runid,
    case
      when s.cron_status='succeeded' then 'success'
      when s.cron_status='running' then 'running'
      when s.is_restart_failure then 'warning'
      else 'error'
    end,
    s.start_time,
    s.end_time,
    case
      when s.end_time is not null
        then greatest(0,(extract(epoch from(s.end_time-s.start_time))*1000)::bigint)
      else null
    end,
    case
      when s.cron_status='succeeded' then coalesce(nullif(s.return_message,''),'Completed')
      when s.cron_status='running' then 'Scheduled process is running.'
      when s.is_restart_failure then 'Transient database restart interrupted this run; awaiting automatic retry.'
      else 'Scheduled process failed.'
    end,
    case
      when s.cron_status in ('succeeded','running') then null
      when s.is_restart_failure then 'Database restart interrupted this run.'
      else coalesce(s.return_message,'Unknown pg_cron failure')
    end,
    jsonb_build_object(
      'cron_status',s.cron_status,
      'return_message',s.return_message,
      'transient_database_restart',s.is_restart_failure
    )
  from src s
  on conflict(process_key,source_run_id)
    where source_run_id is not null
  do nothing;

  get diagnostics v_inserted=row_count;

  with src as (
    select
      smp.process_key,
      d.runid,
      d.status as cron_status,
      d.return_message,
      d.start_time,
      d.end_time,
      (
        d.status not in ('succeeded','running')
        and lower(trim(coalesce(d.return_message,'')))='server restarted'
      ) as is_restart_failure
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    join public.system_monitor_processes smp
      on smp.source_kind='cron'
     and smp.is_enabled
     and smp.source_ref=j.jobname
    where d.start_time is not null
      and d.start_time>=now()-interval '6 hours'
  ),
  normalized as (
    select
      s.*,
      case
        when s.cron_status='succeeded' then 'success'
        when s.cron_status='running' then 'running'
        when s.is_restart_failure then 'warning'
        else 'error'
      end as normalized_status,
      case
        when s.cron_status='succeeded' then coalesce(nullif(s.return_message,''),'Completed')
        when s.cron_status='running' then 'Scheduled process is running.'
        when s.is_restart_failure then 'Transient database restart interrupted this run; awaiting automatic retry.'
        else 'Scheduled process failed.'
      end as normalized_summary,
      case
        when s.cron_status in ('succeeded','running') then null
        when s.is_restart_failure then 'Database restart interrupted this run.'
        else coalesce(s.return_message,'Unknown pg_cron failure')
      end as normalized_error,
      case
        when s.end_time is not null
          then greatest(0,(extract(epoch from(s.end_time-s.start_time))*1000)::bigint)
        else null
      end as normalized_duration,
      jsonb_build_object(
        'cron_status',s.cron_status,
        'return_message',s.return_message,
        'transient_database_restart',s.is_restart_failure
      ) as normalized_details
    from src s
  )
  update public.system_monitor_runs r
  set
    status=n.normalized_status,
    started_at=n.start_time,
    finished_at=n.end_time,
    duration_ms=n.normalized_duration,
    summary=n.normalized_summary,
    error_message=n.normalized_error,
    details=n.normalized_details
  from normalized n
  where r.process_key=n.process_key
    and r.source_run_id=n.runid
    and (
      r.status is distinct from n.normalized_status
      or r.finished_at is distinct from n.end_time
      or r.duration_ms is distinct from n.normalized_duration
      or r.summary is distinct from n.normalized_summary
      or r.error_message is distinct from n.normalized_error
      or r.details is distinct from n.normalized_details
    );

  get diagnostics v_updated=row_count;

  for proc in
    select *
    from public.system_monitor_processes
    where is_enabled
      and source_kind='cron'
  loop
    v_latest:=null;
    v_previous:=null;
    v_dedupe_key:='cron-failure:'||proc.source_ref;

    select d.runid,d.status,d.return_message,d.start_time,d.end_time
    into v_latest
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where j.jobname=proc.source_ref
      and d.start_time is not null
    order by d.start_time desc nulls last
    limit 1;

    if v_latest is null or v_latest.runid is null then
      continue;
    end if;

    if v_latest.status not in ('succeeded','running') then
      v_is_restart_failure :=
        lower(trim(coalesce(v_latest.return_message,'')))='server restarted';

      if v_is_restart_failure then
        select d.runid,d.status,d.return_message,d.start_time,d.end_time
        into v_previous
        from cron.job_run_details d
        join cron.job j on j.jobid=d.jobid
        where j.jobname=proc.source_ref
          and d.start_time is not null
          and d.start_time < v_latest.start_time
        order by d.start_time desc nulls last
        limit 1;

        v_restart_grace_minutes := greatest(
          10,
          least(coalesce(proc.expected_interval_minutes,5) + 5, 30)
        );

        if coalesce(v_previous.status,'')='succeeded'
           and now() < v_latest.start_time + make_interval(mins=>v_restart_grace_minutes)
        then
          continue;
        end if;
      end if;

      if exists(
        select 1
        from public.system_incidents i
        where i.dedupe_key=v_dedupe_key
          and (i.details->>'run_id')=v_latest.runid::text
          and i.status in ('open','acknowledged','resolved')
      ) then
        continue;
      end if;

      perform public.raise_system_incident_v1(
        proc.process_key,
        proc.incident_severity,
        case
          when v_is_restart_failure then 'Scheduled process interrupted by database restart'
          else 'Scheduled process failed'
        end,
        case
          when v_is_restart_failure then format(
            '%s was interrupted at %s because the database restarted. Automatic retry did not recover within the expected grace period.',
            proc.source_ref,
            v_latest.start_time
          )
          else format(
            '%s failed at %s. %s',
            proc.source_ref,
            v_latest.start_time,
            coalesce(v_latest.return_message,'No return message.')
          )
        end,
        v_dedupe_key,
        jsonb_build_object(
          'job_name',proc.source_ref,
          'run_id',v_latest.runid,
          'return_message',v_latest.return_message,
          'started_at',v_latest.start_time,
          'transient_database_restart',v_is_restart_failure
        )
      );
    else
      perform public.resolve_system_incident_by_dedupe_v1(
        v_dedupe_key,
        'The latest scheduled run completed successfully.'
      );
    end if;
  end loop;

  return v_inserted+v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_system_business_check_v1(p_key text, p_status text, p_summary text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s timestamptz:=clock_timestamp();
begin
  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,details)
  values(p_key,p_status,s,clock_timestamp(),greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),p_summary,coalesce(p_details,'{}'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_system_health_watchdog_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  s timestamptz:=clock_timestamp(); p record; latest timestamptz; n integer; issues integer:=0; synced integer:=0;
  game_day date:=public.get_current_game_date_date(); game_ts timestamp:=public.get_current_game_timestamp();
  cfg record; details jsonb;
begin
  synced:=public.sync_system_cron_runs_v1();

  for p in select * from public.system_monitor_processes where is_enabled and source_kind='cron'
  loop
    if not exists(select 1 from cron.job j where j.jobname=p.source_ref and j.active) then
      perform public.raise_system_incident_v1(p.process_key,p.incident_severity,'Scheduled job missing or disabled',
        format('Required pg_cron job "%s" is missing or disabled.',p.source_ref),'cron-disabled:'||p.source_ref,
        jsonb_build_object('job_name',p.source_ref));
      issues:=issues+1; continue;
    else
      perform public.resolve_system_incident_by_dedupe_v1('cron-disabled:'||p.source_ref,'The scheduled job is active again.');
    end if;

    if p.stale_after_minutes is not null then
      select max(d.start_time) into latest
      from cron.job_run_details d join cron.job j on j.jobid=d.jobid
      where j.jobname=p.source_ref;
      if (latest is null and now()>p.created_at+(p.stale_after_minutes||' minutes')::interval) or (latest is not null and latest<now()-(p.stale_after_minutes||' minutes')::interval) then
        perform public.raise_system_incident_v1(p.process_key,p.incident_severity,'Scheduled process is overdue',
          format('No run of "%s" has started within the expected %s-minute health window.',p.label,p.stale_after_minutes),
          'cron-stale:'||p.source_ref,jsonb_build_object('job_name',p.source_ref,'last_run_at',latest));
        issues:=issues+1;
      else
        perform public.resolve_system_incident_by_dedupe_v1('cron-stale:'||p.source_ref,'Scheduler cadence is healthy.');
      end if;
    end if;
  end loop;


  select count(*) into n from public.club_sponsor_objectives o
  where o.status='active' and o.objective_result_state='pending'
    and o.target_check_game_date is not null and o.target_check_game_date<game_day;
  perform public.log_system_business_check_v1('check:sponsor_objectives',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s sponsor objective(s) overdue for evaluation.',n) else 'Sponsor objective processing is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:sponsor_objectives','high','Sponsor objectives are overdue',
    format('%s sponsor objective(s) remain pending past their check date.',n),'business:sponsor-objectives',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:sponsor-objectives','Sponsor objective processing is current.'); end if;

  select count(*) into n from public.rider_scout_tasks
  where status in ('queued','in_progress') and completes_at_game_ts<game_ts-interval '1 hour';
  perform public.log_system_business_check_v1('check:scouting_tasks',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s scouting task(s) overdue.',n) else 'Scouting task completion is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:scouting_tasks','high','Scouting tasks are overdue',
    format('%s scouting task(s) are still open after their completion time.',n),'business:scouting-tasks',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:scouting-tasks','Scouting tasks are current.'); end if;

  select count(*) into n from public.club_infrastructure_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:infrastructure_jobs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s infrastructure job(s) overdue.',n) else 'Infrastructure jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:infrastructure_jobs','high','Infrastructure jobs are overdue',
    format('%s infrastructure job(s) remain open after their completion date.',n),'business:infrastructure-jobs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:infrastructure-jobs','Infrastructure jobs are current.'); end if;

  select count(*) into n from public.club_equipment_maintenance_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:equipment_jobs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s equipment maintenance job(s) overdue.',n) else 'Equipment maintenance jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:equipment_jobs','high','Equipment maintenance is overdue',
    format('%s equipment maintenance job(s) remain open after their completion date.',n),'business:equipment-jobs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:equipment-jobs','Equipment maintenance is current.'); end if;

  select count(*) into n from public.club_infrastructure_asset_repair_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:asset_repairs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s infrastructure asset repair(s) overdue.',n) else 'Infrastructure asset repair jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:asset_repairs','high','Infrastructure asset repairs are overdue',
    format('%s repair job(s) remain open after their completion date.',n),'business:asset-repairs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:asset-repairs','Infrastructure asset repairs are current.'); end if;

  select count(*) into n from public.staff_courses
  where status='active' and completes_on_game_date<game_day;
  perform public.log_system_business_check_v1('check:staff_courses',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s staff course(s) overdue.',n) else 'Staff course completion is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:staff_courses','high','Staff courses are overdue',
    format('%s active staff course(s) remain open after their completion date.',n),'business:staff-courses',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:staff-courses','Staff courses are current.'); end if;

  select count(*) into n from public.rider_transfer_negotiations
  where status='open' and expires_on_game_date<game_day;
  perform public.log_system_business_check_v1('check:transfer_negotiations',case when n>0 then 'warning' else 'success' end,
    case when n>0 then format('%s transfer negotiation(s) expired but still open.',n) else 'Transfer negotiation expiry state is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:transfer_negotiations','high','Expired transfer negotiations remain open',
    format('%s transfer negotiation(s) should already be terminal.',n),'business:transfer-negotiations',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:transfer-negotiations','Transfer negotiation expiry state is current.'); end if;

  select gc.speed_multiplier,gc.base_real_at,gc.base_game_at,gc.is_paused,gs.last_advanced_at,gs.is_paused state_paused
  into cfg
  from public.game_clock_config gc cross join public.game_state gs
  where gc.id=true and gs.id=true;
  details:=jsonb_build_object('speed_multiplier',cfg.speed_multiplier,'base_real_at',cfg.base_real_at,'base_game_at',cfg.base_game_at,
    'clock_paused',cfg.is_paused,'state_paused',cfg.state_paused,'last_advanced_at',cfg.last_advanced_at);
  n:=case when cfg.speed_multiplier is null or cfg.speed_multiplier<=0 or cfg.base_real_at>now()+interval '5 minutes' then 1 else 0 end;
  perform public.log_system_business_check_v1('check:game_clock',case when n>0 then 'error' else 'success' end,
    case when n>0 then 'Game clock configuration is invalid.' else 'Game clock configuration is valid.' end,details);
  if n>0 then perform public.raise_system_incident_v1('check:game_clock','critical','Game clock configuration is invalid',
    'The game clock has an invalid speed or a future real-time anchor.','business:game-clock',details); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:game-clock','Game clock configuration is valid.'); end if;

  select count(*) into n from public.system_alert_email_outbox
  where (status='failed' and attempts>=3) or (status='sending' and last_attempt_at<now()-interval '20 minutes');
  perform public.log_system_business_check_v1('check:admin_alert_email',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s administrator alert email job(s) repeatedly failing/stuck.',n) else 'Administrator alert email channel is healthy.' end,jsonb_build_object('count',n));
  if n>0 then
    perform public.raise_system_incident_v1('check:admin_alert_email','critical','Administrator alert email channel is failing',
      format('%s system-health alert email job(s) are repeatedly failing or stuck.',n),'business:admin-alert-email',jsonb_build_object('count',n));
    issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:admin-alert-email','Administrator alert email channel is healthy.'); end if;

  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,details)
  values('watchdog:system-health',case when issues>0 then 'warning' else 'success' end,s,clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),
    format('Watchdog completed: %s cron runs synchronized, %s active issue(s).',synced,issues),
    jsonb_build_object('cron_runs_synced',synced,'issues',issues,'game_date',game_day,'game_timestamp',game_ts));
  perform public.resolve_system_incident_by_dedupe_v1('watchdog:self-failure','System health watchdog completed successfully.');
  return jsonb_build_object('status','completed','cron_runs_synced',synced,'active_checks_failed',issues);
exception when others then
  perform public.raise_system_incident_v1('watchdog:system-health','critical','System health watchdog failed',sqlerrm,
    'watchdog:self-failure',jsonb_build_object('sqlstate',sqlstate));
  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,error_message)
  values('watchdog:system-health','error',s,clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),'System health watchdog failed.',sqlerrm);
  return jsonb_build_object('status','error','error',sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_system_health_overview_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 with pr as (
   select p.*,lr.status latest_status,lr.started_at latest_started_at,lr.finished_at latest_finished_at,
     lr.duration_ms latest_duration_ms,lr.summary latest_summary,lr.error_message latest_error_message,
     cj.active cron_active,
     (select count(*)::int from public.system_incidents i where i.process_key=p.process_key and i.status in ('open','acknowledged')) open_incidents
   from public.system_monitor_processes p
   left join lateral(select * from public.system_monitor_runs r where r.process_key=p.process_key order by r.started_at desc limit 1) lr on true
   left join cron.job cj on p.source_kind='cron' and cj.jobname=p.source_ref
   where p.is_enabled
 )
 select jsonb_build_object(
   'summary',jsonb_build_object(
     'open_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged')),
     'critical_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='critical'),
     'high_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='high'),
     'warning_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='warning'),
     'monitored_processes',(select count(*) from public.system_monitor_processes where is_enabled),
     'user_sensitive_processes',(select count(*) from public.system_monitor_processes where is_enabled and user_sensitive),
     'alert_email',(select alert_email from public.system_health_config_v1 where id=true)
   ),
   'processes',coalesce((select jsonb_agg(jsonb_build_object(
     'process_key',process_key,'label',label,'category',category,'description',description,'source_kind',source_kind,'source_ref',source_ref,
     'user_sensitive',user_sensitive,'incident_severity',incident_severity,'expected_interval_minutes',expected_interval_minutes,
     'stale_after_minutes',stale_after_minutes,'latest_status',latest_status,'latest_started_at',latest_started_at,
     'latest_finished_at',latest_finished_at,'latest_duration_ms',latest_duration_ms,'latest_summary',latest_summary,
     'latest_error_message',latest_error_message,'cron_active',cron_active,'open_incidents',open_incidents
   ) order by sort_order,label) from pr),'[]'::jsonb),
   'incidents',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'process_key',i.process_key,'process_label',p.label,'category',p.category,'severity',i.severity,'status',i.status,
     'title',i.title,'message',i.message,'details',i.details,'first_seen_at',i.first_seen_at,'last_seen_at',i.last_seen_at,
     'occurrence_count',i.occurrence_count,'last_emailed_at',i.last_emailed_at,'acknowledged_at',i.acknowledged_at,
     'resolved_at',i.resolved_at,'resolution_note',i.resolution_note,
     'is_unread',not exists(select 1 from public.system_incident_admin_reads rr where rr.incident_id=i.id and rr.admin_user_id=auth.uid())
   ) order by case i.severity when 'critical' then 1 when 'high' then 2 else 3 end,i.last_seen_at desc)
   from public.system_incidents i join public.system_monitor_processes p on p.process_key=i.process_key
   where i.status in ('open','acknowledged')),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_system_incidents_v1(p_status text DEFAULT 'active'::text, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  s text:=lower(coalesce(p_status,'active'));
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',x.id,
        'process_key',x.process_key,
        'process_label',x.label,
        'category',x.category,
        'severity',x.severity,
        'status',x.status,
        'title',x.title,
        'message',x.message,
        'details',x.details,
        'first_seen_at',x.first_seen_at,
        'last_seen_at',x.last_seen_at,
        'occurrence_count',x.occurrence_count,
        'last_emailed_at',x.last_emailed_at,
        'acknowledged_at',x.acknowledged_at,
        'resolved_at',x.resolved_at,
        'resolution_note',x.resolution_note,
        'is_unread',not exists(
          select 1
          from public.system_incident_admin_reads rr
          where rr.incident_id=x.id
            and rr.admin_user_id=auth.uid()
        )
      )
      order by x.last_seen_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select i.*,p.label,p.category
    from public.system_incidents i
    join public.system_monitor_processes p
      on p.process_key=i.process_key
    where p.is_enabled
      and (
        s='all'
        or (s='active' and i.status in ('open','acknowledged'))
        or (s='resolved' and i.status='resolved')
      )
    order by i.last_seen_at desc
    limit greatest(1,least(coalesce(p_limit,300),1000))
  ) x;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_system_runs_v1(p_process_key text DEFAULT NULL::text, p_limit integer DEFAULT 400)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',x.id,
        'process_key',x.process_key,
        'process_label',x.label,
        'category',x.category,
        'status',x.status,
        'started_at',x.started_at,
        'finished_at',x.finished_at,
        'duration_ms',x.duration_ms,
        'summary',x.summary,
        'error_message',x.error_message,
        'details',x.details
      )
      order by x.started_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select r.*,p.label,p.category
    from public.system_monitor_runs r
    join public.system_monitor_processes p
      on p.process_key=r.process_key
    where p.is_enabled
      and (p_process_key is null or r.process_key=p_process_key)
    order by r.started_at desc
    limit greatest(1,least(coalesce(p_limit,400),1000))
  ) x;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_admin_system_incident_read_v1(p_incident_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 insert into public.system_incident_admin_reads(incident_id,admin_user_id,read_at)
 values(p_incident_id,auth.uid(),now())
 on conflict(incident_id,admin_user_id) do update set read_at=excluded.read_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_system_incident_v1(p_incident_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a text:=lower(trim(coalesce(p_action,'')));
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if a='acknowledge' then
   update public.system_incidents set status='acknowledged',acknowledged_at=now(),acknowledged_by=auth.uid(),updated_at=now()
   where id=p_incident_id and status='open';
 elsif a='resolve' then
   update public.system_incidents set status='resolved',resolved_at=now(),resolved_by=auth.uid(),
     resolution_note=coalesce(nullif(trim(p_note),''),'Resolved by administrator.'),updated_at=now()
   where id=p_incident_id and status in ('open','acknowledged');
 elsif a='reopen' then
   update public.system_incidents set status='open',resolved_at=null,resolved_by=null,resolution_note=null,updated_at=now()
   where id=p_incident_id and status='resolved';
 else raise exception 'Invalid incident action.'; end if;
 if not found then raise exception 'Incident not found or action is invalid for its current status.'; end if;
 perform public.mark_admin_system_incident_read_v1(p_incident_id);
 return jsonb_build_object('id',p_incident_id,'action',a);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_system_alert_email_outbox_v1(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare result jsonb;
begin
  with candidates as (
    select o.id
    from public.system_alert_email_outbox o
    join public.system_incidents i on i.id=o.incident_id
    where o.status in ('pending','failed')
      and o.next_attempt_at<=now()
      and o.attempts<10
      and i.status in ('open','acknowledged')
    order by o.created_at
    for update of o skip locked
    limit greatest(1,least(coalesce(p_limit,20),50))
  ), claimed as (
    update public.system_alert_email_outbox o
    set status='sending',
        attempts=o.attempts+1,
        last_attempt_at=now(),
        last_error=null,
        updated_at=now()
    from candidates c
    where o.id=c.id
    returning o.id,o.incident_id,o.recipient_email,o.subject,o.text_body,o.html_body,o.attempts
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb)
  into result
  from claimed;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_reopen_replay_quarantine_after_engine_upgrade_v1(p_source_commit text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_commit text := nullif(btrim(coalesce(p_source_commit,'')), '');
  v_row record;
  v_reopened integer := 0;
  v_stage_ids uuid[] := array[]::uuid[];
  v_run_id uuid;
  v_previous_commit text;
begin
  if v_commit is null then
    return jsonb_build_object(
      'status','blocked',
      'reason','source_commit_required',
      'reopened',0
    );
  end if;

  /*
   * A deterministic replay-validation bug must not spin forever on the same
   * engine build. Quarantine remains fail-closed. The only automatic reopen is
   * after production is running a DIFFERENT engine commit, and only for a
   * replay-synchronization quarantine whose full sporting scenario was
   * preserved.
   *
   * One run is auto-reopened at most once per source commit. If the new build
   * still fails, normal retry/quarantine protection takes over again.
   */
  for v_row in
    select
      q.stage_id,
      q.details,
      q.quarantined_at
    from public.race_stage_calculation_quarantine_v1 q
    where q.reason = 'pass2_retry_exhausted_same_full_input'
      and coalesce(q.details->>'scenario_preserved','false')::boolean = true
      and coalesce(q.details->>'previous_error','')
            like 'Universal replay synchronization failed:%'
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = q.stage_id
      )
    order by q.quarantined_at
    limit 5
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'universal_race_replay_quarantine_upgrade:' || v_row.stage_id::text,
        0
      )
    );

    v_run_id := nullif(v_row.details->>'simulation_run_id','')::uuid;
    if v_run_id is null then
      continue;
    end if;

    select
      coalesce(
        s.result_summary_json #>> '{survival_details,source_commit}',
        s.result_summary_json #>> '{error_details,source_commit}',
        ''
      )
    into v_previous_commit
    from public.race_stage_simulation_runs s
    where s.id = v_run_id
      and s.stage_id = v_row.stage_id
      and s.status = 'failed';

    if not found then
      continue;
    end if;

    if v_previous_commit = v_commit then
      continue;
    end if;

    if exists (
      select 1
      from public.race_stage_simulation_runs s
      where s.id = v_run_id
        and coalesce(
          s.result_summary_json->>'last_auto_reopen_source_commit',
          ''
        ) = v_commit
    ) then
      continue;
    end if;

    update public.race_stage_simulation_runs s
       set status = 'failed',
           failed_at = clock_timestamp(),
           error_message = coalesce(
             nullif(v_row.details->>'previous_error',''),
             s.error_message
           ),
           result_summary_json =
             (
               coalesce(s.result_summary_json,'{}'::jsonb)
               - 'pass2_retry_exhausted_at_real'
             )
             || jsonb_build_object(
                  'survival_phase','pass2_resume_failed',
                  'pass2_attempt_count',0,
                  'calculation_status','failed',
                  'last_auto_reopen_source_commit',v_commit,
                  'auto_reopen_previous_source_commit',nullif(v_previous_commit,''),
                  'auto_reopen_reason','engine_build_changed_after_replay_sync_quarantine',
                  'auto_reopened_at_real',clock_timestamp(),
                  'recovery_policy','same_full_input_engine_upgrade_auto_reopen_v1'
                ),
           updated_at = clock_timestamp()
     where s.id = v_run_id
       and s.stage_id = v_row.stage_id;

    delete from public.race_stage_calculation_quarantine_v1 q
    where q.stage_id = v_row.stage_id
      and q.reason = 'pass2_retry_exhausted_same_full_input';

    insert into public.race_engine_calculation_survival_audit_v1(
      stage_id,
      race_id,
      simulation_run_id,
      action,
      reason,
      details
    )
    select
      s.stage_id,
      s.race_id,
      s.id,
      'auto_reopen_replay_quarantine',
      'engine_build_changed_after_replay_sync_quarantine',
      jsonb_build_object(
        'previous_source_commit',nullif(v_previous_commit,''),
        'new_source_commit',v_commit,
        'scenario_preserved',true,
        'retry_attempt_count_reset_to',0,
        'policy','same_full_input_engine_upgrade_auto_reopen_v1'
      )
    from public.race_stage_simulation_runs s
    where s.id = v_run_id;

    v_reopened := v_reopened + 1;
    v_stage_ids := array_append(v_stage_ids, v_row.stage_id);
  end loop;

  return jsonb_build_object(
    'status','completed',
    'source_commit',v_commit,
    'reopened',v_reopened,
    'stage_ids',to_jsonb(v_stage_ids),
    'policy','same_full_input_engine_upgrade_auto_reopen_v1'
  );
end;
$function$
;

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

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_safe_step_v1(p_worker_id text DEFAULT 'safe_edge_v1'::text)
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
      'worker_id',coalesce(nullif(p_worker_id,''),'safe_edge_v1'),
      'step',v_row.step,
      'step_attempt_count',v_row.step_attempt_count+1,
      'total_attempt_count',v_row.total_attempt_count+1,
      'workload_score',v_row.workload_score,
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_row.stage_id,
    'race_id',v_row.race_id,
    'simulation_run_id',v_row.simulation_run_id,
    'step',v_row.step,
    'checkpoint',v_row.checkpoint_json,
    'lease_token',v_token,
    'step_attempt_count',v_row.step_attempt_count+1,
    'total_attempt_count',v_row.total_attempt_count+1,
    'workload_score',v_row.workload_score,
    'trigger_reason',v_row.trigger_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_save_safe_step_v1(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid, p_next_step integer, p_checkpoint jsonb, p_phase text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_safe_calculation_v1
     set step=greatest(0,p_next_step),
         checkpoint_json=coalesce(p_checkpoint,'{}'::jsonb),
         status='pending',
         lease_token=null,
         lease_expires_at=null,
         step_attempt_count=0,
         last_error=null,
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    p_stage_id,p_simulation_run_id,
    coalesce(nullif(p_phase,''),'safe_mode_step_saved_'||p_next_step::text),
    jsonb_build_object(
      'next_step',p_next_step,
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  perform public.universal_race_stage_kick_safe_worker_v1();

  return jsonb_build_object('status','saved','next_step',p_next_step);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_fail_safe_step_v1(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_attempt integer;
begin
  update public.race_stage_safe_calculation_v1
     set status='pending',
         lease_token=null,
         lease_expires_at=null,
         last_error=left(coalesce(p_error,'Unknown safe-step error'),10000),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running'
  returning step_attempt_count into v_attempt;

  if v_attempt is null then
    return jsonb_build_object('status','stale_lease');
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    p_stage_id,p_simulation_run_id,'safe_mode_step_failed',
    jsonb_build_object(
      'error',left(coalesce(p_error,'Unknown safe-step error'),10000),
      'step_attempt_count',v_attempt,
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  return jsonb_build_object('status','retry_pending','step_attempt_count',v_attempt);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_complete_safe_mode_v1(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_safe_calculation_v1
     set status='completed',
         lease_token=null,
         lease_expires_at=null,
         checkpoint_json='{}'::jsonb,
         completed_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  return jsonb_build_object('status','completed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_kick_safe_worker_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-safe-resume',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-universal-race-worker-secret',(
        select decrypted_secret
        from vault.decrypted_secrets
        where name='universal_race_worker_secret_v1'
        limit 1
      )
    ),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;

  return jsonb_build_object('status','queued','request_id',v_request_id);
exception when others then
  return jsonb_build_object('status','kick_failed','error',sqlerrm);
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_save_safe_step_v2(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid, p_next_step integer, p_checkpoint_text text, p_phase text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  if p_checkpoint_text is null or length(p_checkpoint_text)=0 then
    raise exception 'Safe checkpoint text cannot be empty';
  end if;

  update public.race_stage_safe_calculation_v1
     set step=greatest(0,p_next_step),
         checkpoint_text=p_checkpoint_text,
         checkpoint_json='{}'::jsonb,
         status='pending',
         lease_token=null,
         lease_expires_at=null,
         step_attempt_count=0,
         last_error=null,
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    p_stage_id,p_simulation_run_id,
    coalesce(nullif(p_phase,''),'safe_mode_step_saved_'||p_next_step::text),
    jsonb_build_object(
      'next_step',p_next_step,
      'checkpoint_storage','ordered_json_text_v2',
      'checkpoint_bytes',octet_length(p_checkpoint_text),
      'model_version','checkpointed_safe_mode_v2'
    )
  );

  perform public.universal_race_stage_kick_safe_worker_v1();

  return jsonb_build_object(
    'status','saved',
    'next_step',p_next_step,
    'checkpoint_bytes',octet_length(p_checkpoint_text)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_complete_safe_mode_v2(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_safe_calculation_v1
     set status='completed',
         lease_token=null,
         lease_expires_at=null,
         checkpoint_text='{}',
         checkpoint_json='{}'::jsonb,
         completed_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  return jsonb_build_object('status','completed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_fast_safe_guard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run record;
  v_switched integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('universal_race_fast_safe_guard_v1',0));

  for v_run in
    select
      sr.id as simulation_run_id,
      sr.stage_id,
      sr.race_id,
      coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
      coalesce(
        (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
        sr.updated_at,
        sr.started_at,
        sr.created_at
      ) as heartbeat_at
    from public.race_stage_simulation_runs sr
    where sr.engine_version='race_engine_ts_v1'
      and sr.simulation_mode='deterministic_road_race_v1'
      and sr.status='running'
      and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
      and coalesce(sr.result_summary_json->>'survival_phase','')
            in ('primary_engine_started','fallback_engine_started')
      and coalesce(
            (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
            sr.updated_at,
            sr.started_at,
            sr.created_at
          ) < clock_timestamp()-interval '45 seconds'
      and not exists (
        select 1 from public.race_stage_authoritative_runs a
        where a.stage_id=sr.stage_id
      )
      and not exists (
        select 1
        from public.race_stage_safe_calculation_v1 sf
        where sf.stage_id=sr.stage_id
          and sf.simulation_run_id=sr.id
          and sf.status in ('pending','running')
      )
    order by coalesce(sr.updated_at,sr.started_at,sr.created_at)
    limit 20
  loop
    perform public.universal_race_stage_enable_safe_mode_v1(
      v_run.stage_id,
      v_run.simulation_run_id,
      'fast_switch_after_primary_engine_stall',
      0
    );

    insert into public.race_engine_calculation_survival_audit_v1(
      stage_id,race_id,simulation_run_id,action,reason,details
    )
    values(
      v_run.stage_id,
      v_run.race_id,
      v_run.simulation_run_id,
      'fast_switch_to_checkpointed_safe_mode',
      'primary_engine_no_progress_45_seconds',
      jsonb_build_object(
        'previous_phase',v_run.survival_phase,
        'heartbeat_at',v_run.heartbeat_at,
        'stale_seconds',extract(epoch from (clock_timestamp()-v_run.heartbeat_at)),
        'recovery_policy','checkpointed_safe_mode_v2'
      )
    );

    v_switched := v_switched + 1;
  end loop;

  if v_switched > 0 then
    perform public.universal_race_stage_kick_safe_worker_v1();
  end if;

  return jsonb_build_object(
    'status','completed',
    'switched_to_safe_mode',v_switched,
    'stall_threshold_seconds',45,
    'model_version','fast_checkpointed_safe_guard_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_system_health_watchdog_guarded_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_lock_key bigint := hashtextextended('run_system_health_watchdog_guarded_v2',0);
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'status','skipped_watchdog_already_running',
      'success',true
    );
  end if;

  return public.run_system_health_watchdog_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_safe_mode_watchdog_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run record;
  v_switched integer := 0;
  v_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended('universal_race_safe_mode_watchdog_v1',0));

  for v_run in
    select
      s.id as simulation_run_id,
      s.stage_id,
      s.status,
      coalesce(s.result_summary_json->>'survival_phase','') as survival_phase,
      coalesce(
        (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
        s.updated_at,s.started_at,s.created_at
      ) as heartbeat_at
    from public.race_stage_simulation_runs s
    where s.engine_version='race_engine_ts_v1'
      and s.simulation_mode='deterministic_road_race_v1'
      and coalesce(s.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
      and not exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
      )
      and not exists (
        select 1
        from public.race_stage_safe_calculation_v1 sf
        where sf.stage_id=s.stage_id
          and sf.simulation_run_id=s.id
          and sf.status in ('pending','running','completed')
      )
      and (
        (
          s.status='failed'
          and coalesce(s.result_summary_json->>'survival_phase','') in (
            'pass1_started','pass1_payload_loading','pass1_resume_failed',
            'primary_engine_started','fallback_engine_started',
            'primary_engine_finished','fallback_engine_finished',
            'pass2_resume_failed'
          )
        )
        or
        (
          s.status='running'
          and coalesce(s.result_summary_json->>'survival_phase','') in (
            'pass1_started','pass1_payload_loading',
            'primary_engine_started','fallback_engine_started'
          )
          and coalesce(
            (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
            s.updated_at,s.started_at,s.created_at
          ) < clock_timestamp()-interval '60 seconds'
        )
      )
    order by coalesce(s.failed_at,s.updated_at,s.started_at,s.created_at)
    for update of s skip locked
    limit 10
  loop
    v_reason := case
      when v_run.status='failed' then 'first_calculation_failure'
      else 'first_calculation_worker_stopped'
    end;

    perform public.universal_race_stage_enable_safe_mode_v1(
      v_run.stage_id,
      v_run.simulation_run_id,
      v_reason,
      0
    );

    insert into public.race_engine_calculation_survival_audit_v1(
      stage_id,race_id,simulation_run_id,action,reason,details
    )
    select
      s.stage_id,s.race_id,s.id,
      'switch_to_checkpointed_safe_mode',
      v_reason,
      jsonb_build_object(
        'previous_status',v_run.status,
        'previous_phase',v_run.survival_phase,
        'heartbeat_at',v_run.heartbeat_at,
        'watchdog_version','universal_race_safe_mode_watchdog_v1'
      )
    from public.race_stage_simulation_runs s
    where s.id=v_run.simulation_run_id;

    v_switched := v_switched+1;
  end loop;

  if v_switched>0 then
    perform public.universal_race_stage_kick_safe_worker_v1();
  end if;

  return jsonb_build_object(
    'status','completed',
    'switched_to_safe_mode',v_switched,
    'stale_after_seconds',60,
    'model_version','universal_race_safe_mode_watchdog_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_process_maintenance_reminders_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_created integer := 0;
  v_reset integer := 0;
  v_game_date date := coalesce(public.get_current_game_date_date(), current_date);
  v_event_key text;
begin
  -- Re-arm reminders after equipment has been repaired above the configured threshold.
  update public.club_equipment_inventory ei
  set metadata = jsonb_set(
        coalesce(ei.metadata,'{}'::jsonb),
        '{maintenance_reminder_active}',
        'false'::jsonb,
        true
      ),
      updated_at = now()
  from public.equipment_premium_preferences pref
  join public.clubs c on c.id=pref.club_id
  where ei.club_id=pref.club_id
    and public.user_has_premium_access_v1(c.owner_user_id)
    and coalesce((ei.metadata->>'maintenance_reminder_active')::boolean,false)=true
    and ei.condition_percent > pref.maintenance_reminder_threshold;

  get diagnostics v_reset = row_count;

  for r in
    select
      ei.id as equipment_id,
      ei.club_id,
      ei.display_name,
      ei.equipment_category,
      ei.condition_percent,
      pref.maintenance_reminder_threshold,
      c.owner_user_id
    from public.club_equipment_inventory ei
    join public.equipment_premium_preferences pref on pref.club_id=ei.club_id
    join public.clubs c on c.id=ei.club_id
    where c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and public.user_has_premium_access_v1(c.owner_user_id)
      and ei.sold_game_date is null
      and ei.discarded_game_date is null
      and lower(coalesce(ei.status,'ready'))='ready'
      and ei.condition_percent <= pref.maintenance_reminder_threshold
      and coalesce((ei.metadata->>'maintenance_reminder_active')::boolean,false)=false
    order by ei.club_id,ei.condition_percent,ei.id
    for update of ei skip locked
  loop
    v_event_key := format(
      'equipment_maintenance_reminder:%s:%s:%s',
      r.equipment_id,
      v_game_date,
      floor(r.condition_percent)::int
    );

    perform public.create_user_game_notification_v1(
      r.owner_user_id,
      'EQUIPMENT_MAINTENANCE_REMINDER',
      'Equipment needs maintenance',
      format(
        '%s is at %s%% condition, below your %s%% maintenance reminder threshold.',
        coalesce(r.display_name,'Equipment'),
        round(r.condition_percent,1),
        r.maintenance_reminder_threshold
      ),
      '/dashboard/equipment?tab=maintenance',
      jsonb_build_object(
        'equipment_id',r.equipment_id,
        'club_id',r.club_id,
        'display_name',r.display_name,
        'equipment_category',r.equipment_category,
        'condition_percent',r.condition_percent,
        'threshold',r.maintenance_reminder_threshold,
        'game_date',v_game_date
      ),
      v_event_key,
      null
    );

    update public.club_equipment_inventory
    set metadata = coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object(
            'maintenance_reminder_active',true,
            'maintenance_reminder_last_game_date',v_game_date,
            'maintenance_reminder_last_condition',r.condition_percent,
            'maintenance_reminder_threshold',r.maintenance_reminder_threshold
          ),
        updated_at=now()
    where id=r.equipment_id;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'notifications_created',v_created,
    'reminders_rearmed',v_reset,
    'game_date',v_game_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_get_scout_analyst_intelligence_v1(p_club_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_report record;
  v_analyst record;
  v_quality numeric := 0;
  v_confidence numeric := 20;
  v_tier text := 'basic';
  v_confidence_label text;
begin
  select sr.precision_score,sr.precision_tier,sr.report_json,sr.scout_staff_id
  into v_report
  from public.rider_scout_reports sr
  where sr.club_id=p_club_id and sr.rider_id=p_rider_id
  order by sr.created_at_game_ts desc nulls last,sr.created_at desc
  limit 1;

  select cs.id,cs.staff_name,
         greatest(0,least(100,
           coalesce(cs.expertise,50)*0.35+
           coalesce(cs.experience,50)*0.20+
           coalesce(cs.efficiency,50)*0.25+
           coalesce(cs.potential,50)*0.10+
           coalesce(cs.leadership,50)*0.05+
           coalesce(cs.loyalty,50)*0.05
         )) as quality
  into v_analyst
  from public.club_staff cs
  where cs.club_id=p_club_id
    and cs.role_type='scout_analyst'
    and coalesce(cs.is_active,false)=true
  order by
    (coalesce(cs.expertise,50)*0.35+
     coalesce(cs.experience,50)*0.20+
     coalesce(cs.efficiency,50)*0.25+
     coalesce(cs.potential,50)*0.10+
     coalesce(cs.leadership,50)*0.05+
     coalesce(cs.loyalty,50)*0.05) desc,
    cs.id
  limit 1;

  v_quality:=coalesce(v_analyst.quality,0);
  if v_report.precision_score is not null then
    v_confidence:=v_report.precision_score;
    v_tier:=coalesce(v_report.precision_tier,'basic');
  elsif v_analyst.id is not null then
    v_confidence:=35 + greatest(-5,least(15,(v_quality-50)*0.30));
    v_tier:=case
      when v_quality>=85 then 'elite'
      when v_quality>=70 then 'strong'
      when v_quality>=55 then 'solid'
      else 'basic'
    end;
  end if;

  if v_analyst.id is not null and v_report.precision_score is not null then
    v_confidence:=v_confidence + greatest(-4,least(8,(v_quality-50)*0.16));
  end if;

  v_confidence:=round(greatest(0,least(100,v_confidence)),1);
  v_confidence_label:=case
    when v_confidence>=90 then 'elite'
    when v_confidence>=75 then 'strong'
    when v_confidence>=60 then 'good'
    when v_confidence>=40 then 'fair'
    else 'limited'
  end;

  return jsonb_build_object(
    'has_scout_report',v_report.precision_score is not null,
    'precision_score',v_report.precision_score,
    'precision_tier',coalesce(v_report.precision_tier,v_tier),
    'overall_label',v_report.report_json->'overall'->>'label',
    'potential_label',v_report.report_json->'potential'->>'label',
    'analyst_staff_id',v_analyst.id,
    'analyst_name',v_analyst.staff_name,
    'analyst_quality',case when v_analyst.id is null then null else round(v_quality,1) end,
    'analysis_confidence_pct',v_confidence,
    'analysis_confidence_label',v_confidence_label
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_purchase_race_supplies_system_v1(p_club_id uuid, p_catalog_item_id uuid, p_quantity integer, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_catalog public.equipment_catalog%rowtype;
  v_current_game_date date := coalesce(public.get_current_game_date_date(),current_date);
  v_quantity integer := least(greatest(coalesce(p_quantity,1),1),10000);
  v_existing_hit boolean := false;
  v_technical_company_id uuid;
  v_technical_sponsor_name text;
  v_technical_discount_pct numeric := 0;
  v_unit_price_cash bigint := 0;
  v_total_cost_cash bigint := 0;
  v_finance_tx_id uuid;
  v_result_row jsonb;
begin
  if p_club_id is null or p_catalog_item_id is null then
    raise exception 'Club and catalog item are required.';
  end if;

  if not exists(
    select 1 from public.clubs c
    where c.id=p_club_id and c.deleted_at is null
      and c.owner_user_id is not null and coalesce(c.is_ai,false)=false
  ) then
    raise exception 'Eligible user club not found.';
  end if;

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'Background purchases require an idempotency key.';
  end if;

  select exists(
    select 1
    from public.club_race_supplies crs
    cross join lateral jsonb_array_elements_text(
      coalesce(crs.metadata->'purchase_idempotency_keys','[]'::jsonb)
    ) k(value)
    where crs.club_id=p_club_id and k.value=p_idempotency_key
  ) into v_existing_hit;

  if v_existing_hit then
    return jsonb_build_object('ok',true,'idempotent',true,'club_id',p_club_id);
  end if;

  select * into v_catalog
  from public.equipment_catalog
  where id=p_catalog_item_id and is_active=true
  limit 1;

  if not found or v_catalog.equipment_kind<>'race_supply' then
    raise exception 'Race supply catalog item not found or inactive.';
  end if;

  select
    cs.company_id,
    coalesce(cs.name,sc.name),
    least(greatest(coalesce(nullif(to_jsonb(cs)->>'technical_discount_pct','')::numeric,0),0),95)
  into v_technical_company_id,v_technical_sponsor_name,v_technical_discount_pct
  from public.club_sponsors cs
  left join public.sponsor_companies sc on sc.id=cs.company_id
  where cs.club_id=p_club_id
    and cs.sponsor_kind='technical'
    and cs.status='active'
  order by cs.created_at desc
  limit 1;

  if v_technical_company_id is null
     or v_catalog.brand_company_id is null
     or v_catalog.brand_company_id<>v_technical_company_id
  then
    v_technical_discount_pct:=0;
  end if;

  v_unit_price_cash:=floor(v_catalog.base_price_cash*(1-v_technical_discount_pct/100.0))::bigint;
  v_total_cost_cash:=v_unit_price_cash*v_quantity;

  perform set_config('finance.internal','1',true);

  v_finance_tx_id:=public.finance_spend_from_club(
    p_club_id,
    v_total_cost_cash,
    'race_supplies_purchase',
    'SINK',
    p_idempotency_key,
    jsonb_build_object(
      'catalog_item_id',v_catalog.id,
      'item_key',v_catalog.item_key,
      'display_name',v_catalog.display_name,
      'supply_key',v_catalog.equipment_category,
      'quantity',v_quantity,
      'unit_price_cash',v_unit_price_cash,
      'total_cost_cash',v_total_cost_cash,
      'base_price_cash',v_catalog.base_price_cash,
      'technical_discount_pct',v_technical_discount_pct,
      'technical_sponsor_company_id',v_technical_company_id,
      'technical_sponsor_name',v_technical_sponsor_name,
      'source','equipment_auto_restock_backend'
    )
  );

  insert into public.club_race_supplies(
    club_id,supply_key,display_name,preferred_brand_company_id,
    quantity_available,total_purchased,total_used,last_purchased_game_date,metadata
  )
  values(
    p_club_id,v_catalog.equipment_category,v_catalog.display_name,v_catalog.brand_company_id,
    v_quantity,v_quantity,0,v_current_game_date,
    jsonb_build_object(
      'last_purchase_finance_transaction_id',v_finance_tx_id,
      'last_purchase_idempotency_key',p_idempotency_key,
      'purchase_idempotency_keys',jsonb_build_array(p_idempotency_key),
      'catalog_item_key',v_catalog.item_key,
      'unit_price_cash',v_unit_price_cash,
      'technical_discount_pct',v_technical_discount_pct,
      'technical_sponsor_company_id',v_technical_company_id,
      'technical_sponsor_name',v_technical_sponsor_name,
      'last_purchased_at',now(),
      'last_purchase_source','automatic_restock'
    )
  )
  on conflict(club_id,supply_key) do update
  set display_name=excluded.display_name,
      preferred_brand_company_id=coalesce(excluded.preferred_brand_company_id,club_race_supplies.preferred_brand_company_id),
      quantity_available=club_race_supplies.quantity_available+excluded.quantity_available,
      total_purchased=club_race_supplies.total_purchased+excluded.total_purchased,
      last_purchased_game_date=excluded.last_purchased_game_date,
      metadata=jsonb_set(
        coalesce(club_race_supplies.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'last_purchase_finance_transaction_id',v_finance_tx_id,
          'last_purchase_idempotency_key',p_idempotency_key,
          'catalog_item_key',v_catalog.item_key,
          'unit_price_cash',v_unit_price_cash,
          'technical_discount_pct',v_technical_discount_pct,
          'technical_sponsor_company_id',v_technical_company_id,
          'technical_sponsor_name',v_technical_sponsor_name,
          'last_purchased_at',now(),
          'last_purchase_source','automatic_restock'
        ),
        '{purchase_idempotency_keys}',
        coalesce(club_race_supplies.metadata->'purchase_idempotency_keys','[]'::jsonb)
          || jsonb_build_array(p_idempotency_key),
        true
      ),
      updated_at=now()
  returning to_jsonb(public.club_race_supplies.*) into v_result_row;

  return jsonb_build_object(
    'ok',true,
    'club_id',p_club_id,
    'supply_key',v_catalog.equipment_category,
    'quantity',v_quantity,
    'total_cost_cash',v_total_cost_cash,
    'finance_transaction_id',v_finance_tx_id,
    'race_supply_row',v_result_row
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_process_auto_restock_rules_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_catalog_id uuid;
  v_current_stock integer;
  v_total_used integer;
  v_game_date date := coalesce(public.get_current_game_date_date(),current_date);
  v_key text;
  v_result jsonb;
  v_attempted integer:=0;
  v_purchased integer:=0;
  v_failed integer:=0;
begin
  for r in
    select
      ar.club_id,ar.supply_key,ar.minimum_stock,ar.order_quantity,
      ar.updated_at as rule_updated_at,c.owner_user_id
    from public.equipment_auto_restock_rules ar
    join public.clubs c on c.id=ar.club_id
    where ar.enabled=true
      and c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and public.user_has_premium_access_v1(c.owner_user_id)
    order by ar.club_id,ar.supply_key
    for update of ar skip locked
  loop
    select coalesce(crs.quantity_available,0),coalesce(crs.total_used,0)
    into v_current_stock,v_total_used
    from public.club_race_supplies crs
    where crs.club_id=r.club_id and crs.supply_key=r.supply_key;

    v_current_stock:=coalesce(v_current_stock,0);
    v_total_used:=coalesce(v_total_used,0);

    if v_current_stock>=r.minimum_stock then
      continue;
    end if;

    select ec.id
    into v_catalog_id
    from public.equipment_catalog ec
    left join public.club_race_supplies crs
      on crs.club_id=r.club_id and crs.supply_key=r.supply_key
    left join lateral(
      select cs.company_id
      from public.club_sponsors cs
      where cs.club_id=r.club_id
        and cs.sponsor_kind='technical'
        and cs.status='active'
      order by cs.created_at desc
      limit 1
    ) sponsor on true
    where ec.is_active=true
      and ec.equipment_kind='race_supply'
      and ec.equipment_category=r.supply_key
    order by
      case when crs.preferred_brand_company_id is not null
                 and ec.brand_company_id=crs.preferred_brand_company_id then 0 else 1 end,
      case when sponsor.company_id is not null
                 and ec.brand_company_id=sponsor.company_id then 0 else 1 end,
      ec.base_price_cash asc,
      ec.id
    limit 1;

    if v_catalog_id is null then
      v_failed:=v_failed+1;
      continue;
    end if;

    v_attempted:=v_attempted+1;
    v_key:=format(
      'race_supplies_auto_restock:%s:%s:%s:%s:%s',
      r.club_id,r.supply_key,v_game_date,v_total_used,v_current_stock
    );

    begin
      v_result:=public.equipment_purchase_race_supplies_system_v1(
        r.club_id,v_catalog_id,greatest(1,r.order_quantity),v_key
      );

      if coalesce((v_result->>'ok')::boolean,false) then
        v_purchased:=v_purchased+1;
      end if;
    exception when others then
      v_failed:=v_failed+1;

      perform public.create_user_game_notification_v1(
        r.owner_user_id,
        'RACE_SUPPLIES_LOW',
        'Automatic restock could not complete',
        format(
          '%s is below your automatic restock threshold (%s < %s), but the purchase could not be completed.',
          replace(initcap(replace(r.supply_key,'_',' ')),'  ',' '),
          v_current_stock,
          r.minimum_stock
        ),
        '/dashboard/equipment?tab=supplies',
        jsonb_build_object(
          'club_id',r.club_id,
          'supply_key',r.supply_key,
          'current_stock',v_current_stock,
          'minimum_stock',r.minimum_stock,
          'order_quantity',r.order_quantity,
          'automatic_restock',true,
          'error',sqlerrm,
          'game_date',v_game_date
        ),
        format('auto_restock_failed:%s:%s:%s',r.club_id,r.supply_key,v_game_date),
        null
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'attempted',v_attempted,
    'purchased',v_purchased,
    'failed',v_failed,
    'game_date',v_game_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_process_manager_automation_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rr record;
  rp record;
  v_context jsonb;
  v_focus text;
  v_intensity text;
  v_objective text;
  v_strategy text;
  v_risk text;
  v_training_applied integer:=0;
  v_strategy_applied integer:=0;
  v_today date:=coalesce(public.get_current_game_date_date(),current_date);
begin
  -- Training prefill: only riders with no explicit plan, and never compete with
  -- active Head Coach/U23 coach training automation for that sporting club.
  for rr in
    select
      rule.id as rule_id,
      rule.club_id as manager_club_id,
      rule.user_id,
      rule.match_json,
      t.payload_json,
      cr.club_id as rider_club_id,
      cr.rider_id,
      coalesce(cr.assigned_role::text,r.role::text,'') as role,
      coalesce(r.availability_status,'') as availability_status
    from public.premium_manager_automation_rules_v1 rule
    join public.premium_manager_templates_v1 t
      on t.id=rule.template_id
     and t.club_id=rule.club_id
     and t.user_id=rule.user_id
    join public.clubs main on main.id=rule.club_id
    join public.club_riders cr
      on cr.club_id=rule.club_id
      or cr.club_id in (
        select child.id from public.clubs child
        where child.parent_club_id=rule.club_id and child.deleted_at is null
      )
    join public.riders r on r.id=cr.rider_id
    where rule.is_enabled=true
      and rule.rule_type='training_prefill'
      and t.template_type='training'
      and main.owner_user_id=rule.user_id
      and public.user_has_premium_access_v1(rule.user_id)
      and not exists(
        select 1 from public.rider_regular_training_plans p
        where p.rider_id=cr.rider_id
      )
      and not exists(
        select 1 from public.club_regular_training_automation a
        where a.club_id=cr.club_id and a.is_enabled=true
      )
    order by rule.club_id,cr.rider_id,
             jsonb_object_length(coalesce(rule.match_json,'{}'::jsonb)) desc,
             rule.updated_at desc
  loop
    v_context:=jsonb_build_object(
      'availability_status',rr.availability_status,
      'role',rr.role
    );

    if exists(
      select 1
      from jsonb_each_text(coalesce(rr.match_json,'{}'::jsonb)) m
      where coalesce(v_context->>m.key,'')<>m.value
    ) then
      continue;
    end if;

    -- Only the first/best matching rule per rider should apply.
    if exists(
      select 1 from public.rider_regular_training_plans p where p.rider_id=rr.rider_id
    ) then
      continue;
    end if;

    v_focus:=coalesce(nullif(rr.payload_json->>'focus_code',''),'general');
    if v_focus not in ('general','endurance','sprint','climbing','flat','time_trial','recovery','day_off')
    then v_focus:='general'; end if;

    v_intensity:=coalesce(nullif(rr.payload_json->>'intensity',''),'normal');
    if v_intensity not in ('recovery','light','normal','hard')
    then v_intensity:='normal'; end if;

    if v_focus in ('recovery','day_off') and v_intensity='hard' then
      v_intensity:='recovery';
    end if;

    insert into public.rider_regular_training_plans(
      rider_id,club_id,focus_code,intensity,is_active,auto_when_free,preferred_days,updated_at
    )
    values(rr.rider_id,rr.rider_club_id,v_focus,v_intensity,true,true,null,now())
    on conflict(rider_id) do nothing;

    if found then
      update public.premium_manager_automation_rules_v1
      set last_matched_at=now(),updated_at=now()
      where id=rr.rule_id;
      v_training_applied:=v_training_applied+1;
    end if;
  end loop;

  -- Race strategy prefill: only untouched draft stage plans. Never mark them as
  -- saved/submitted and never compete with U23 managed stage-plan automation.
  for rp in
    select
      rule.id as rule_id,
      rule.club_id as manager_club_id,
      rule.user_id,
      rule.match_json,
      t.payload_json,
      rsp.id as stage_plan_id,
      rsp.race_preparation_id,
      rsp.stage_id,
      coalesce(nullif(to_jsonb(rs)->>'terrain_type',''),
               nullif(to_jsonb(rs)->>'profile_type',''),'') as terrain_type,
      coalesce(nullif(to_jsonb(rs)->>'profile_type',''),
               nullif(to_jsonb(rs)->>'terrain_type',''),'') as profile_type,
      coalesce(nullif(to_jsonb(rs)->>'stage_format',''),
               nullif(to_jsonb(rs)->>'stage_type',''),
               nullif(to_jsonb(rs)->>'format',''),'road_race') as stage_format
    from public.premium_manager_automation_rules_v1 rule
    join public.premium_manager_templates_v1 t
      on t.id=rule.template_id
     and t.club_id=rule.club_id
     and t.user_id=rule.user_id
    join public.clubs main on main.id=rule.club_id
    join public.race_preparations prep
      on (
        prep.club_id=rule.club_id
        or prep.participating_club_id=rule.club_id
        or prep.club_id in (
          select child.id from public.clubs child
          where child.parent_club_id=rule.club_id and child.deleted_at is null
        )
        or prep.participating_club_id in (
          select child.id from public.clubs child
          where child.parent_club_id=rule.club_id and child.deleted_at is null
        )
      )
    join public.race_stage_plans rsp on rsp.race_preparation_id=prep.id
    join public.race_stages rs on rs.id=rsp.stage_id
    where rule.is_enabled=true
      and rule.rule_type='strategy_prefill'
      and t.template_type='race_strategy'
      and main.owner_user_id=rule.user_id
      and public.user_has_premium_access_v1(rule.user_id)
      and rsp.status='draft'
      and rsp.last_saved_at is null
      and (rsp.opens_on_game_date is null or rsp.opens_on_game_date<=v_today)
      and (rsp.locks_on_game_date is null or rsp.locks_on_game_date>v_today)
      and not exists(
        select 1
        from public.race_preparation_stage_plan_automation a
        where a.race_preparation_id=prep.id and coalesce(a.is_enabled,false)=true
      )
    order by rsp.id,
             jsonb_object_length(coalesce(rule.match_json,'{}'::jsonb)) desc,
             rule.updated_at desc
  loop
    v_context:=jsonb_build_object(
      'terrain_type',rp.terrain_type,
      'profile_type',rp.profile_type,
      'stage_format',rp.stage_format
    );

    if exists(
      select 1
      from jsonb_each_text(coalesce(rp.match_json,'{}'::jsonb)) m
      where coalesce(v_context->>m.key,'')<>m.value
    ) then
      continue;
    end if;

    -- Only apply once per untouched plan.
    if exists(
      select 1
      from public.race_stage_plans rsp
      where rsp.id=rp.stage_plan_id
        and coalesce(rsp.metadata->>'premium_automation_prefilled','false')='true'
    ) then
      continue;
    end if;

    v_objective:=coalesce(nullif(rp.payload_json->>'stage_objective',''),'balanced');
    if v_objective not in ('balanced','protect_gc','stage_win','sprint','kom','breakaway','safe_finish','recovery_day')
    then v_objective:='balanced'; end if;

    v_strategy:=coalesce(nullif(rp.payload_json->>'team_strategy',''),'balanced');
    if v_strategy not in ('balanced','aggressive','defensive','conservative','sprint_control','breakaway','gc_protection','climber_support','tt_balanced_pace','tt_fast_start','tt_negative_split','tt_all_out')
    then v_strategy:='balanced'; end if;

    v_risk:=coalesce(nullif(rp.payload_json->>'risk_level',''),'normal');
    if v_risk not in ('safe','normal','high') then v_risk:='normal'; end if;

    update public.race_stage_plans
    set stage_objective=v_objective,
        team_strategy=v_strategy,
        risk_level=v_risk,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'premium_automation_prefilled',true,
          'premium_automation_rule_id',rp.rule_id,
          'premium_automation_applied_at',now()
        ),
        updated_at=now()
    where id=rp.stage_plan_id
      and status='draft'
      and last_saved_at is null;

    if found then
      update public.premium_manager_automation_rules_v1
      set last_matched_at=now(),updated_at=now()
      where id=rp.rule_id;
      v_strategy_applied:=v_strategy_applied+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'training_prefills_applied',v_training_applied,
    'strategy_prefills_applied',v_strategy_applied,
    'game_date',v_today
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_apply_future_flat_sprint_layout_v1(p_source_season integer, p_target_season integer, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer := 1999 + p_source_season;
  v_target_year integer := 1999 + p_target_season;
  rec record;
  sync_rec record;
  v_seed bytea;
  v_target_count integer;
  v_slot integer;
  v_distance numeric;
  v_desired_km numeric;
  v_pick_km numeric;
  v_spacing numeric;
  v_kms numeric[];
  v_sprints jsonb;
  v_markers jsonb;
  v_route_markers jsonb;
  v_assignments jsonb := '[]'::jsonb;
  v_randomized integer := 0;
  v_sync_repairs integer := 0;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1';
  end if;

  /*
   * Randomize only the historical one-sprint group identified from the
   * SOURCE relational point definitions. This intentionally does not mutate
   * completed source-season sporting history.
   */
  for rec in
    select
      sr.name as race_name,
      ss.id as source_stage_id,
      ss.stage_number,
      ss.distance_km::numeric as distance_km,
      ts.id as target_stage_id,
      ts.race_id as target_race_id,
      ts.terrain_type,
      ts.profile_type,
      ts.stage_format,
      coalesce(ts.metadata,'{}'::jsonb) as target_metadata,
      coalesce(td.route_markers,'[]'::jsonb) as route_markers
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    left join public.race_stage_profile_details td on td.stage_id=ts.id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(month from ss.stage_date)::integer in (1,2)
      and lower(coalesce(ss.terrain_type,''))='flat'
      and lower(coalesce(ss.profile_type,'')) not like '%time_trial%'
      and lower(coalesce(ss.stage_format,'')) not in (
        'individual_time_trial','team_time_trial','time_trial','prologue'
      )
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      )=1
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
    order by sr.start_date,sr.name,ss.stage_number
  loop
    if exists (
      select 1 from public.race_stage_results x where x.stage_id=rec.target_stage_id
      union all
      select 1 from public.race_stage_point_results x where x.stage_id=rec.target_stage_id
      union all
      select 1 from public.race_stage_simulation_runs x where x.stage_id=rec.target_stage_id
    ) then
      raise exception
        'Refusing to alter sprint layout for target stage % because sporting output already exists',
        rec.target_stage_id;
    end if;

    v_distance := rec.distance_km;
    v_seed := decode(
      md5(rec.source_stage_id::text||'|season|'||p_target_season::text||'|flat-sprints-v1'),
      'hex'
    );
    v_target_count := 2 + (get_byte(v_seed,0) % 3);
    v_spacing := greatest(8::numeric, v_distance * 0.07);
    v_kms := array[]::numeric[];

    for v_slot in 1..v_target_count loop
      v_desired_km :=
        (
          (v_slot::numeric / (v_target_count + 1)::numeric)
          + (((get_byte(v_seed,least(15,v_slot))::numeric / 255) - 0.5) * 0.08)
        ) * v_distance;

      select round(((seg.km_start+seg.km_end)/2.0)::numeric,1)
      into v_pick_km
      from public.race_engine_get_stage_segments_v1(rec.target_stage_id) seg
      where seg.terrain_type='flat'
        and ((seg.km_start+seg.km_end)/2.0)
              between greatest(8::numeric,v_distance*0.08)
                  and least(v_distance-8::numeric,v_distance*0.92)
        and not exists (
          select 1
          from unnest(v_kms) already(km)
          where abs(((seg.km_start+seg.km_end)/2.0)-already.km) < v_spacing
        )
        and not exists (
          select 1
          from public.race_stage_points existing
          where existing.stage_id=rec.target_stage_id
            and upper(coalesce(existing.point_type,''))='KOM'
            and abs(existing.km_from_start::numeric-((seg.km_start+seg.km_end)/2.0)) < 2
        )
      order by
        abs(((seg.km_start+seg.km_end)/2.0)-v_desired_km),
        seg.segment_order
      limit 1;

      if v_pick_km is null then
        select round(((seg.km_start+seg.km_end)/2.0)::numeric,1)
        into v_pick_km
        from public.race_engine_get_stage_segments_v1(rec.target_stage_id) seg
        where seg.terrain_type='flat'
          and ((seg.km_start+seg.km_end)/2.0)
                between greatest(5::numeric,v_distance*0.05)
                    and least(v_distance-5::numeric,v_distance*0.95)
          and not (((seg.km_start+seg.km_end)/2.0)=any(v_kms))
        order by
          abs(((seg.km_start+seg.km_end)/2.0)-v_desired_km),
          seg.segment_order
        limit 1;
      end if;

      if v_pick_km is null then
        raise exception
          'No distinct flat segment available for sprint %/% on target stage %',
          v_slot,v_target_count,rec.target_stage_id;
      end if;

      v_kms := array_append(v_kms,v_pick_km);
    end loop;

    select array_agg(km order by km)
    into v_kms
    from unnest(v_kms) u(km);

    select jsonb_agg(
      jsonb_build_object(
        'km',u.km,
        'number',u.ordinal_number,
        'points','standard',
        'points_scheme','[12,8,5,3,1]'::jsonb,
        'time_bonus_seconds','[3,2,1]'::jsonb
      )
      order by u.km
    )
    into v_sprints
    from unnest(v_kms) with ordinality u(km,ordinal_number);

    select coalesce(
      jsonb_agg(marker order by marker_km, marker_order, marker_label),
      '[]'::jsonb
    )
    into v_markers
    from (
      select
        m.value as marker,
        coalesce(nullif(m.value->>'km','')::numeric,0) as marker_km,
        case lower(coalesce(m.value->>'type',''))
          when 'start' then 0
          when 'finish' then 30
          else 20
        end as marker_order,
        coalesce(m.value->>'label',m.value->>'name','') as marker_label
      from jsonb_array_elements(rec.route_markers) m(value)
      where lower(coalesce(m.value->>'type',m.value->>'point_type',''))
        not in ('sprint','intermediate_sprint','bonus_sprint')

      union all

      select
        jsonb_build_object(
          'km',u.km,
          'type','sprint',
          'label','Sprint '||u.ordinal_number::text
        ),
        u.km,
        10,
        'Sprint '||u.ordinal_number::text
      from unnest(v_kms) with ordinality u(km,ordinal_number)
    ) marker_rows;

    v_assignments := v_assignments || jsonb_build_array(
      jsonb_build_object(
        'race',rec.race_name,
        'stage',rec.stage_number,
        'source_stage_id',rec.source_stage_id,
        'target_stage_id',rec.target_stage_id,
        'sprint_count',v_target_count,
        'sprint_km',to_jsonb(v_kms)
      )
    );
    v_randomized := v_randomized + 1;

    if p_dry_run then
      continue;
    end if;

    update public.race_stages
    set intermediate_sprints_json=v_sprints,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_layout_policy_version','flat_random_2_4_v1',
          'sprint_layout_source_stage_id',rec.source_stage_id,
          'sprint_layout_source_season',p_source_season,
          'sprint_layout_target_season',p_target_season,
          'sprint_layout_count',v_target_count
        )
    where id=rec.target_stage_id;

    update public.race_stage_profile_details
    set intermediate_sprints=v_sprints,
        route_markers=v_markers,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_layout_policy_version','flat_random_2_4_v1'
        )
    where stage_id=rec.target_stage_id;

    if not found then
      raise exception 'Target profile row missing for stage %',rec.target_stage_id;
    end if;

    delete from public.race_stage_points
    where stage_id=rec.target_stage_id
      and upper(coalesce(point_type,'')) in (
        'INTERMEDIATE_SPRINT','BONUS_SPRINT'
      );

    insert into public.race_stage_points(
      stage_id,
      point_type,
      km_from_start,
      name,
      kom_category,
      points_scheme,
      time_bonus_seconds,
      is_finish_point,
      sort_order,
      metadata
    )
    select
      rec.target_stage_id,
      'INTERMEDIATE_SPRINT',
      u.km,
      'Intermediate sprint '||u.ordinal_number::text,
      null,
      '[12,8,5,3,1]'::jsonb,
      '[3,2,1]'::jsonb,
      false,
      (u.ordinal_number::integer)*10,
      jsonb_build_object(
        'source','flat_random_2_4_v1',
        'source_stage_id',rec.source_stage_id,
        'target_season',p_target_season
      )
    from unnest(v_kms) with ordinality u(km,ordinal_number);

    with ranked as (
      select
        id,
        ((row_number() over(
          order by km_from_start,
                   case upper(coalesce(point_type,''))
                     when 'START' then 0
                     when 'INTERMEDIATE_SPRINT' then 10
                     when 'BONUS_SPRINT' then 10
                     when 'KOM' then 20
                     when 'FINISH' then 30
                     else 25
                   end,
                   id
        )-1)*10)::integer as new_sort_order
      from public.race_stage_points
      where stage_id=rec.target_stage_id
    )
    update public.race_stage_points p
    set sort_order=r.new_sort_order
    from ranked r
    where p.id=r.id
      and p.sort_order is distinct from r.new_sort_order;
  end loop;

  /*
   * Repair copied future definitions when the source relational sprint rows
   * already contain the correct multi-sprint logic but stage/profile JSON do
   * not. This preserves sporting logic and only synchronizes the future copy.
   */
  for sync_rec in
    select
      sr.name as race_name,
      ss.id as source_stage_id,
      ss.stage_number,
      ts.id as target_stage_id,
      coalesce(td.route_markers,'[]'::jsonb) as route_markers
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    left join public.race_stage_profile_details td on td.stage_id=ts.id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(month from ss.stage_date)::integer in (1,2)
      and lower(coalesce(ss.terrain_type,''))='flat'
      and lower(coalesce(ss.profile_type,'')) not like '%time_trial%'
      and lower(coalesce(ss.stage_format,'')) not in (
        'individual_time_trial','team_time_trial','time_trial','prologue'
      )
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      ) >= 2
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      ) <> jsonb_array_length(coalesce(ss.intermediate_sprints_json,'[]'::jsonb))
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
      and coalesce(ts.metadata->>'sprint_sync_repair_version','')
          <> 'source_points_v1'
  loop
    select jsonb_agg(
      jsonb_build_object(
        'km',p.km_from_start::numeric,
        'number',row_number_value,
        'name',p.name,
        'point_type',upper(p.point_type),
        'points','standard',
        'points_scheme',coalesce(p.points_scheme,'[]'::jsonb),
        'time_bonus_seconds',coalesce(p.time_bonus_seconds,'[]'::jsonb)
      )
      order by p.km_from_start
    )
    into v_sprints
    from (
      select
        p.*,
        row_number() over(order by p.km_from_start,p.id) as row_number_value
      from public.race_stage_points p
      where p.stage_id=sync_rec.source_stage_id
        and upper(coalesce(p.point_type,'')) in (
          'INTERMEDIATE_SPRINT','BONUS_SPRINT'
        )
    ) p;

    select coalesce(
      jsonb_agg(marker order by marker_km, marker_order, marker_label),
      '[]'::jsonb
    )
    into v_markers
    from (
      select
        m.value as marker,
        coalesce(nullif(m.value->>'km','')::numeric,0) as marker_km,
        case lower(coalesce(m.value->>'type',''))
          when 'start' then 0
          when 'finish' then 30
          else 20
        end as marker_order,
        coalesce(m.value->>'label',m.value->>'name','') as marker_label
      from jsonb_array_elements(sync_rec.route_markers) m(value)
      where lower(coalesce(m.value->>'type',m.value->>'point_type',''))
        not in ('sprint','intermediate_sprint','bonus_sprint')

      union all

      select
        jsonb_build_object(
          'km',(s.item->>'km')::numeric,
          'type','sprint',
          'label','Sprint '||s.ordinal_number::text
        ),
        (s.item->>'km')::numeric,
        10,
        'Sprint '||s.ordinal_number::text
      from jsonb_array_elements(v_sprints) with ordinality s(item,ordinal_number)
    ) marker_rows;

    v_sync_repairs := v_sync_repairs + 1;

    if p_dry_run then
      continue;
    end if;

    update public.race_stages
    set intermediate_sprints_json=v_sprints,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_sync_repair_version','source_points_v1',
          'sprint_sync_source_stage_id',sync_rec.source_stage_id
        )
    where id=sync_rec.target_stage_id;

    update public.race_stage_profile_details
    set intermediate_sprints=v_sprints,
        route_markers=v_markers,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_sync_repair_version','source_points_v1'
        )
    where stage_id=sync_rec.target_stage_id;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'policy_version','flat_random_2_4_v1',
    'source_season',p_source_season,
    'target_season',p_target_season,
    'dry_run',p_dry_run,
    'randomized_stages',v_randomized,
    'future_sync_repairs',v_sync_repairs,
    'assignments',v_assignments
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_season_calendar_stage_point_reconciliation_v3(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_source_year integer := 1999+p_source_season;
  v_target_year integer := 1999+p_target_season;
  v_unexplained integer := 0;
  v_invalid_policy integer := 0;
  v_policy_stages integer := 0;
  v_orphans integer := 0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  v_base := public.validate_season_calendar_stage_point_reconciliation_v2(
    p_source_season,p_target_season
  );

  if coalesce((v_base->>'ok')::boolean,false) then
    return v_base || jsonb_build_object(
      'validator_version','v3',
      'sprint_policy_stages',0,
      'sprint_policy_invalid',0,
      'unexplained_point_divergence_stages',0
    );
  end if;

  v_orphans := coalesce((v_base->>'orphan_target_points')::integer,0);

  with paired as (
    select
      ss.id source_stage_id,
      ts.id target_stage_id,
      coalesce(ts.metadata->>'sprint_layout_policy_version','') policy_version,
      (select count(*) from public.race_stage_points sp where sp.stage_id=ss.id) source_count,
      (select count(*) from public.race_stage_points tp where tp.stage_id=ts.id) target_count
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
  )
  select count(*)::integer
  into v_unexplained
  from paired
  where source_count<>target_count
    and policy_version<>'flat_random_2_4_v1';

  select count(*)::integer
  into v_policy_stages
  from public.race_stages ts
  join public.races tr on tr.id=ts.race_id
  where extract(year from tr.start_date)::integer=v_target_year
    and tr.metadata->>'calendar_source_season'=p_source_season::text
    and ts.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1';

  select count(*)::integer
  into v_invalid_policy
  from public.race_stages ts
  join public.races tr on tr.id=ts.race_id
  left join public.race_stage_profile_details d on d.stage_id=ts.id
  where extract(year from tr.start_date)::integer=v_target_year
    and tr.metadata->>'calendar_source_season'=p_source_season::text
    and ts.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1'
    and (
      jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) not between 2 and 4
      or jsonb_array_length(coalesce(d.intermediate_sprints,'[]'::jsonb))
           <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or (
        select count(*)
        from public.race_stage_points p
        where p.stage_id=ts.id
          and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
      ) <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or (
        select count(*)
        from jsonb_array_elements(coalesce(d.route_markers,'[]'::jsonb)) m
        where lower(coalesce(m->>'type',m->>'point_type',''))
              in ('sprint','intermediate_sprint','bonus_sprint')
      ) <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or exists (
        (
          select round((j->>'km')::numeric,1)
          from jsonb_array_elements(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) j
          except
          select round(p.km_from_start::numeric,1)
          from public.race_stage_points p
          where p.stage_id=ts.id
            and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
        )
        union all
        (
          select round(p.km_from_start::numeric,1)
          from public.race_stage_points p
          where p.stage_id=ts.id
            and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
          except
          select round((j->>'km')::numeric,1)
          from jsonb_array_elements(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) j
        )
      )
      or exists (
        select 1
        from public.race_stage_points p
        where p.stage_id=ts.id
          and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
          and not exists (
            select 1
            from public.race_engine_get_stage_segments_v1(ts.id) seg
            where seg.terrain_type='flat'
              and p.km_from_start::numeric between seg.km_start and seg.km_end
          )
      )
      or exists(select 1 from public.race_stage_results x where x.stage_id=ts.id)
      or exists(select 1 from public.race_stage_point_results x where x.stage_id=ts.id)
      or exists(select 1 from public.race_stage_simulation_runs x where x.stage_id=ts.id)
    );

  if v_orphans=0 and v_unexplained=0 and v_invalid_policy=0 and v_policy_stages>0 then
    return v_base || jsonb_build_object(
      'ok',true,
      'validator_version','v3',
      'base_validator_ok',false,
      'sprint_policy_stages',v_policy_stages,
      'sprint_policy_invalid',v_invalid_policy,
      'unexplained_point_divergence_stages',v_unexplained,
      'policy','Target point-count divergence is allowed only for synchronized flat_random_2_4_v1 future stages whose sprint JSON, profile markers, relational points, flat-segment placement, and no-sporting-output invariants all validate.'
    );
  end if;

  return v_base || jsonb_build_object(
    'ok',false,
    'validator_version','v3',
    'base_validator_ok',coalesce((v_base->>'ok')::boolean,false),
    'sprint_policy_stages',v_policy_stages,
    'sprint_policy_invalid',v_invalid_policy,
    'unexplained_point_divergence_stages',v_unexplained
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_future_flat_sprint_layout_v1(p_source_season integer DEFAULT 1, p_target_season integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_before integer;
  v_after integer;
  v_first jsonb;
  v_second jsonb;
  v_validate_first jsonb;
  v_validate_second jsonb;
  v_points_first integer;
  v_points_second integer;
  v_policy_stages integer;
  v_ok boolean := false;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select count(*)::integer
  into v_before
  from public.races
  where extract(year from start_date)::integer=1999+p_target_season;

  begin
    v_first := public.prepare_next_season_race_calendar_v1(
      p_source_season,p_target_season,true
    );

    v_validate_first :=
      public.validate_season_calendar_stage_point_reconciliation_v3(
        p_source_season,p_target_season
      );

    select count(*)::integer
    into v_points_first
    from public.race_stage_points p
    join public.race_stages s on s.id=p.stage_id
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text;

    v_second := public.prepare_next_season_race_calendar_v1(
      p_source_season,p_target_season,true
    );

    v_validate_second :=
      public.validate_season_calendar_stage_point_reconciliation_v3(
        p_source_season,p_target_season
      );

    select count(*)::integer
    into v_points_second
    from public.race_stage_points p
    join public.race_stages s on s.id=p.stage_id
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text;

    select count(*)::integer
    into v_policy_stages
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text
      and s.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1';

    v_ok :=
      coalesce((v_first->>'ok')::boolean,false)
      and coalesce((v_second->>'ok')::boolean,false)
      and coalesce((v_validate_first->>'ok')::boolean,false)
      and coalesce((v_validate_second->>'ok')::boolean,false)
      and coalesce((v_validate_first->>'sprint_policy_invalid')::integer,-1)=0
      and coalesce((v_validate_second->>'sprint_policy_invalid')::integer,-1)=0
      and coalesce((v_first->'flat_sprint_layout'->>'randomized_stages')::integer,-1)=25
      and coalesce((v_second->'flat_sprint_layout'->>'randomized_stages')::integer,-1)=25
      and coalesce((v_first->'flat_sprint_layout'->>'future_sync_repairs')::integer,-1)=1
      and v_policy_stages=25
      and v_points_first=v_points_second;

    raise exception '__ROLLBACK_FLAT_SPRINT_LAYOUT_DRY_RUN__';
  exception when others then
    if sqlerrm<>'__ROLLBACK_FLAT_SPRINT_LAYOUT_DRY_RUN__' then
      raise;
    end if;
  end;

  select count(*)::integer
  into v_after
  from public.races
  where extract(year from start_date)::integer=1999+p_target_season;

  v_ok := v_ok and v_after=v_before;

  return jsonb_build_object(
    'ok',v_ok,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'first_prepare',v_first->'flat_sprint_layout',
    'first_validation',v_validate_first,
    'second_prepare',v_second->'flat_sprint_layout',
    'second_validation',v_validate_second,
    'points_after_first',v_points_first,
    'points_after_second',v_points_second,
    'policy_stages',v_policy_stages,
    'target_races_before',v_before,
    'target_races_after_rollback',v_after
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_final_date_v1(p_country_code text, p_season_number integer)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  s jsonb;
begin
  s := public.national_championship_schedule_v1(p_country_code,p_season_number);
  if s->>'status'='ready' then
    return (s->>'final_date')::date;
  end if;

  return make_date(1999+p_season_number,7,1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_national_championship_editions_for_season_v1(p_season_number integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  inserted_count integer := 0;
  s jsonb;
  x record;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  for x in
    select distinct upper(country_code) as country_code
    from public.riders
    where nullif(trim(country_code),'') is not null
    order by 1
  loop
    s := public.national_championship_schedule_v1(x.country_code,p_season_number);

    insert into public.national_championship_editions(
      season_number,
      country_code,
      discipline,
      ranking_snapshot_date,
      qualification_date,
      final_date,
      final_field_size,
      duty_window_start_date,
      duty_window_end_date,
      participation_decision_deadline,
      climate_source_country_code,
      climate_week_of_year,
      climate_expected_max_temp_c,
      climate_status
    )
    values(
      p_season_number,
      x.country_code,
      'road',
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date-cfg.ranking_freeze_lead_days
        else make_date(1999+p_season_number,7,1)-cfg.ranking_freeze_lead_days
      end,
      case when s->>'status'='ready'
        then (s->>'qualification_date')::date
        else make_date(1999+p_season_number,7,1)
      end,
      case when s->>'status'='ready'
        then (s->>'final_date')::date
        else make_date(1999+p_season_number,7,3)
      end,
      cfg.final_field_size,
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date
        else null
      end,
      case when s->>'status'='ready'
        then (s->>'duty_window_end_date')::date
        else null
      end,
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date-cfg.participation_decision_lead_days
        else null
      end,
      s->>'climate_source_country_code',
      nullif(s->>'week_of_year','')::integer,
      nullif(s->>'expected_max_temp_c','')::numeric,
      coalesce(s->>'status','weather_data_unavailable')
    )
    on conflict (season_number,country_code,discipline) do nothing;

    if found then
      inserted_count:=inserted_count+1;
    end if;
  end loop;

  perform public.national_championship_refresh_planned_editions_v1(p_season_number);

  perform public.ensure_world_road_championship_for_season_v1(p_season_number);

  return inserted_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.freeze_national_championship_ranking_base_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  cfg public.national_championship_config%rowtype;
  v_eligible integer;
  v_direct integer;
  v_qualification_places integer;
  v_heat_count integer;
  v_heat integer;
  v_base_places integer;
  v_remainder integer;
  v_plan jsonb;
  v_schedule jsonb;
  v_first_event date;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status<>'planned' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status',e.status,
      'already_processed',true
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id=true;

  select count(*)::int
  into v_eligible
  from public.preview_national_ranking_v1(
    e.country_code,e.ranking_snapshot_date
  );

  v_plan:=public.national_championship_population_plan_v1(v_eligible);

  if coalesce(e.schedule_draw_status,'pending')='locked' then
    v_direct:=coalesce(e.direct_qualifier_count,(v_plan->>'direct_qualifiers')::int,0);
    v_qualification_places:=coalesce(e.qualification_places,(v_plan->>'qualification_places')::int,0);
    v_heat_count:=coalesce(e.qualification_heat_count,(v_plan->>'heat_count')::int,0);

    v_schedule:=jsonb_build_object(
      'climate_status',e.climate_status,
      'route_status',e.route_status,
      'qualification_window_start_date',e.qualification_window_start_date,
      'qualification_window_end_date',e.qualification_window_end_date,
      'qualification_date',e.qualification_date,
      'final_date',e.final_date,
      'qualification_source_stage_id',e.qualification_source_stage_id,
      'final_source_stage_id',e.final_source_stage_id,
      'climate_source_country_code',e.climate_source_country_code,
      'week_of_year',e.climate_week_of_year,
      'expected_max_temp_c',e.climate_expected_max_temp_c
    );
  else
    v_direct:=coalesce((v_plan->>'direct_qualifiers')::int,0);
    v_qualification_places:=coalesce((v_plan->>'qualification_places')::int,0);
    v_heat_count:=coalesce((v_plan->>'heat_count')::int,0);

    v_schedule:=public.national_championship_schedule_plan_v2(
      e.country_code,e.season_number,v_eligible
    );
  end if;

  if coalesce(v_schedule->>'climate_status','')<>'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_climate',
      'climate_status',v_schedule->>'climate_status'
    );
  end if;

  if coalesce(v_schedule->>'route_status','')<>'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_routes',
      'route_status',v_schedule->>'route_status'
    );
  end if;

  v_first_event:=case
    when v_heat_count>0
      then (v_schedule->>'qualification_window_start_date')::date
    else (v_schedule->>'final_date')::date
  end;

  update public.national_championship_editions
  set eligible_count=v_eligible,
      final_field_size=least(v_eligible,cfg.final_field_size),
      direct_qualifier_count=v_direct,
      qualification_places=v_qualification_places,
      qualification_heat_count=v_heat_count,
      qualification_window_start_date=nullif(v_schedule->>'qualification_window_start_date','')::date,
      qualification_window_end_date=nullif(v_schedule->>'qualification_window_end_date','')::date,
      final_window_start_date=(v_schedule->>'final_date')::date,
      final_window_end_date=(v_schedule->>'final_date')::date,
      duty_window_start_date=v_first_event,
      duty_window_end_date=case
        when v_heat_count>0
          then (v_schedule->>'qualification_window_end_date')::date
        else (v_schedule->>'final_date')::date
      end,
      qualification_date=(v_schedule->>'qualification_date')::date,
      final_date=(v_schedule->>'final_date')::date,
      ranking_snapshot_date=v_first_event-cfg.ranking_freeze_lead_days,
      participation_decision_deadline=v_first_event-cfg.participation_decision_lead_days,
      climate_source_country_code=v_schedule->>'climate_source_country_code',
      climate_week_of_year=nullif(v_schedule->>'week_of_year','')::int,
      climate_expected_max_temp_c=nullif(v_schedule->>'expected_max_temp_c','')::numeric,
      climate_status='ready',
      route_status='ready',
      qualification_source_stage_id=(v_schedule->>'qualification_source_stage_id')::uuid,
      final_source_stage_id=(v_schedule->>'final_source_stage_id')::uuid,
      updated_at=now()
  where id=e.id
  returning * into e;

  insert into public.national_championship_ranking_snapshots(
    edition_id,rider_id,club_id,national_rank,raw_points,weighted_points,
    best_weighted_result,latest_result_date,overall_snapshot,
    rider_name_snapshot,country_code_snapshot
  )
  select
    e.id,p.rider_id,p.club_id,p.national_rank,p.raw_points,p.weighted_points,
    p.best_weighted_result,p.latest_result_date,p.overall,p.rider_name,p.country_code
  from public.preview_national_ranking_v1(e.country_code,e.ranking_snapshot_date) p;

  if v_heat_count>0 then
    v_base_places:=floor(v_qualification_places::numeric/v_heat_count)::int;
    v_remainder:=mod(v_qualification_places,v_heat_count);

    for v_heat in 1..v_heat_count loop
      insert into public.national_championship_heats(
        edition_id,heat_number,qualification_date,qualifying_places
      )
      values(
        e.id,
        v_heat,
        e.qualification_date+(v_heat-1),
        v_base_places+case when v_heat<=v_remainder then 1 else 0 end
      );
    end loop;
  end if;

  if v_heat_count=0 then
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,s.rider_id,s.club_id,s.national_rank,'direct','direct_qualified',
      s.national_rank,s.rider_name_snapshot,s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    where s.edition_id=e.id
    order by s.national_rank;
  else
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      heat_id,heat_number,seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,
      s.rider_id,
      s.club_id,
      s.national_rank,
      'qualification',
      'qualification_assigned',
      h.id,
      q.heat_number,
      s.national_rank,
      s.rider_name_snapshot,
      s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    cross join lateral(
      select case
        when (floor(((s.national_rank-1)::numeric)/v_heat_count)::int % 2)=0
          then ((s.national_rank-1)%v_heat_count)+1
        else v_heat_count-((s.national_rank-1)%v_heat_count)
      end as heat_number
    ) q
    join public.national_championship_heats h
      on h.edition_id=e.id and h.heat_number=q.heat_number
    where s.edition_id=e.id
    order by s.national_rank;
  end if;

  update public.national_championship_entries en
  set participation_decision=case
      when en.club_id_snapshot is null then 'auto_approved'
      when coalesce(root.is_ai,false) or root.owner_user_id is null
        then 'auto_approved'
      else 'pending'
    end,
    participation_decision_at=case
      when en.club_id_snapshot is null
        or coalesce(root.is_ai,false)
        or root.owner_user_id is null
        then now()
      else null
    end,
    updated_at=now()
  from public.clubs rc
  left join public.clubs root_parent on root_parent.id=rc.parent_club_id
  cross join lateral(
    select
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then coalesce(root_parent.is_ai,false)
        else coalesce(rc.is_ai,false)
      end is_ai,
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then root_parent.owner_user_id
        else rc.owner_user_id
      end owner_user_id
  ) root
  where en.edition_id=e.id
    and en.club_id_snapshot=rc.id;

  update public.national_championship_entries
  set participation_decision='auto_approved',
      participation_decision_at=now(),
      updated_at=now()
  where edition_id=e.id
    and club_id_snapshot is null;

  update public.national_championship_heats h
  set assigned_count=x.assigned_count,updated_at=now()
  from(
    select heat_id,count(*)::int assigned_count
    from public.national_championship_entries
    where edition_id=e.id
      and heat_id is not null
      and entry_status<>'withdrawn'
    group by heat_id
  ) x
  where h.id=x.heat_id;

  insert into public.national_championship_duties(
    edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
    duty_start_date,duty_end_date
  )
  select
    e.id,
    en.rider_id,
    case when v_heat_count=0 then 'final' else 'qualification' end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end,
    en.heat_id,
    'confirmed',
    case
      when v_heat_count=0
        then 'National Duty — '||e.country_code||' National Road Championship'
      else 'National Duty — '||e.country_code||' National Qualification Group '||en.heat_number
    end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end
  from public.national_championship_entries en
  left join public.national_championship_heats h on h.id=en.heat_id
  where en.edition_id=e.id
  on conflict (edition_id,rider_id,duty_type) do update
    set duty_date=excluded.duty_date,
        heat_id=excluded.heat_id,
        label=excluded.label,
        status='confirmed',
        duty_start_date=excluded.duty_start_date,
        duty_end_date=excluded.duty_end_date,
        updated_at=now();

  update public.national_championship_editions
  set status='ranking_frozen',updated_at=now()
  where id=e.id;

  return jsonb_build_object(
    'edition_id',e.id,
    'country_code',e.country_code,
    'eligible_count',v_eligible,
    'direct_qualifiers',v_direct,
    'qualification_population',case when v_heat_count>0 then v_eligible else 0 end,
    'qualification_places',v_qualification_places,
    'heat_count',v_heat_count,
    'qualification_window_start_date',e.qualification_window_start_date,
    'qualification_window_end_date',e.qualification_window_end_date,
    'final_date',e.final_date,
    'decision_deadline',e.participation_decision_deadline,
    'status','ranking_frozen'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_championship_planning_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_inserted integer := 0;
  v_frozen integer := 0;
  r record;
begin
  select gs.season_number,
         public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id = true;

  v_inserted := public.ensure_national_championship_editions_for_season_v1(v_season);

  for r in
    select id
    from public.national_championship_editions
    where season_number = v_season
      and discipline = 'road'
      and status = 'planned'
      and ranking_snapshot_date <= v_game_date
    order by ranking_snapshot_date,country_code
  loop
    perform public.freeze_national_championship_ranking_v1(r.id);
    v_frozen := v_frozen + 1;
  end loop;

  return jsonb_build_object(
    'season_number',v_season,
    'game_date',v_game_date,
    'editions_created',v_inserted,
    'rankings_frozen',v_frozen
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_sync_race_participants_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer := 0;
  v_team_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id = p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  if p_event_type = 'qualification' then
    select * into h
    from public.national_championship_heats
    where id = p_heat_id and edition_id = e.id;

    if h.id is null or h.race_id is null then
      raise exception 'Qualification heat/race not found for edition %', p_edition_id;
    end if;

    v_race_id := h.race_id;
  elsif p_event_type = 'final' then
    v_race_id := e.final_race_id;
    if v_race_id is null then
      raise exception 'Final race is not created for edition %', p_edition_id;
    end if;
  else
    raise exception 'Invalid national championship event type: %', p_event_type;
  end if;

  select s.id into v_stage_id
  from public.race_stages s
  where s.race_id = v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship race % has no stage', v_race_id;
  end if;

  if exists (
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id = v_stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'race_id',v_race_id,
      'stage_id',v_stage_id
    );
  end if;

  /*
   * Create a zero-cost, organizer-managed preparation shell for each real club
   * represented in the event. No staff, assets or club supplies are attached.
   * The shell exists only so the universal race engine can read rider equipment
   * and rider-specific tactics through its normal stage-plan adapters.
   */
  insert into public.race_preparations (
    race_id,
    club_id,
    status,
    startlist_status,
    setup_window_opens_on,
    rider_submission_deadline_on,
    submitted_at,
    rider_count,
    staff_count,
    participation_cost_cash,
    travel_cost_cash,
    staff_travel_cost_cash,
    asset_transport_cost_cash,
    supplies_cost_cash,
    operations_cost_cash,
    total_cost_cash,
    cost_breakdown_json,
    team_policies_snapshot_json,
    validation_snapshot_json,
    engine_payload_json,
    metadata,
    participating_club_id
  )
  select
    v_race_id,
    x.club_id,
    'submitted',
    'submitted',
    e.ranking_snapshot_date,
    case when p_event_type='qualification' then e.qualification_date else e.final_date end,
    now(),
    x.rider_count,
    0,
    0,0,0,0,0,0,0,
    jsonb_build_object('national_championship',true,'organizer_paid',true),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'standardized_bonus_totals',jsonb_build_object(
        'race_support',0,
        'fatigue_control',0,
        'recovery_support',0,
        'health_protection',0,
        'mechanical_reliability',0
      )
    ),
    jsonb_build_object(
      'national_championship',true,
      'participating_club_id',x.club_id
    ),
    jsonb_build_object(
      'national_championship',true,
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
    ),
    x.club_id
  from (
    select
      en.club_id_snapshot as club_id,
      count(*)::int as rider_count
    from public.national_championship_entries en
    where en.edition_id = e.id
      and en.club_id_snapshot is not null
      and (
        (p_event_type='qualification'
          and en.heat_id = p_heat_id
          and en.entry_status='qualification_assigned')
        or
        (p_event_type='final'
          and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
      )
    group by en.club_id_snapshot
  ) x
  on conflict (race_id,club_id) do update
    set rider_count=excluded.rider_count,
        participating_club_id=excluded.participating_club_id,
        metadata=public.race_preparations.metadata || excluded.metadata,
        engine_payload_json=public.race_preparations.engine_payload_json || excluded.engine_payload_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        updated_at=now();

  /*
   * The universal race engine expects canonical selected riders on each
   * preparation. National Championships use the club only as a technical
   * preparation owner; sporting identity stays rider-only.
   */
  delete from public.race_preparation_riders selected
  using public.race_preparations rp
  where selected.race_preparation_id = rp.id
    and rp.race_id = v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
    and not exists (
      select 1
      from public.national_championship_entries en
      where en.edition_id=e.id
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and (
          (p_event_type='qualification'
            and en.heat_id=p_heat_id
            and en.entry_status='qualification_assigned')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
        )
    );

  insert into public.race_preparation_riders (
    race_preparation_id,
    rider_id,
    start_number,
    race_role,
    default_equipment_setup_id,
    availability_snapshot_json,
    rider_snapshot_json,
    bonus_snapshot_json,
    metadata
  )
  select
    rp.id,
    en.rider_id,
    en.national_rank,
    'free_role',
    plan.equipment_setup_id,
    jsonb_build_object(
      'availability_status',r.availability_status,
      'unavailable_until',r.unavailable_until,
      'unavailable_reason',r.unavailable_reason
    ),
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'national_rank',en.national_rank,
      'overall',r.overall,
      'role',r.role
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'event_type',p_event_type
    )
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_preparation_id,rider_id) do update
    set start_number=excluded.start_number,
        race_role='free_role',
        default_equipment_setup_id=excluded.default_equipment_setup_id,
        availability_snapshot_json=excluded.availability_snapshot_json,
        rider_snapshot_json=excluded.rider_snapshot_json,
        bonus_snapshot_json=excluded.bonus_snapshot_json,
        metadata=public.race_preparation_riders.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plans (
    race_preparation_id,
    race_id,
    stage_id,
    stage_number,
    stage_date,
    status,
    opens_on_game_date,
    locks_on_game_date,
    submitted_at,
    stage_objective,
    team_strategy,
    risk_level,
    stage_profile_snapshot_json,
    bonus_snapshot_json,
    engine_stage_payload_json,
    metadata,
    rider_equipment_json,
    rider_roles_json,
    team_tactic_json,
    rider_supplies_json,
    rider_individual_tactics_json,
    last_saved_at,
    last_saved_game_ts
  )
  select
    rp.id,
    v_race_id,
    v_stage_id,
    1,
    s.stage_date,
    'submitted',
    e.ranking_snapshot_date,
    s.stage_date,
    now(),
    'balanced',
    'balanced',
    'normal',
    to_jsonb(s),
    '{}'::jsonb,
    jsonb_build_object('national_championship',true),
    jsonb_build_object(
      'national_championship',true,
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('plan','balanced','notes','National Championship: individual tactics only'),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    public.get_current_game_ts_local()
  from public.race_preparations rp
  join public.race_stages s on s.id=v_stage_id
  where rp.race_id=v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
  on conflict (race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        team_tactic_json=excluded.team_tactic_json,
        metadata=public.race_stage_plans.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plan_riders (
    race_stage_plan_id,
    rider_id,
    stage_role,
    tactic,
    risk_level,
    effort_level,
    equipment_setup_id,
    rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,
    final_bonus_snapshot_json,
    metadata
  )
  select
    sp.id,
    en.rider_id,
    'free_role',
    'balanced',
    'normal',
    'normal',
    plan.equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'national_rank',en.national_rank,
      'event_type',p_event_type
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('national_championship',true)
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        equipment_setup_id=excluded.equipment_setup_id,
        rider_stage_snapshot_json=public.race_stage_plan_riders.rider_stage_snapshot_json || excluded.rider_stage_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata || excluded.metadata,
        updated_at=now();

  /*
   * Apply saved per-rider commands to the universal stage-plan JSON.
   */
  update public.race_stage_plans sp
  set rider_individual_tactics_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',coalesce(plan.phase_1_command,'ride_naturally')),
            'phase_2',jsonb_build_object('command',coalesce(plan.phase_2_command,'ride_naturally')),
            'phase_3',jsonb_build_object('command',coalesce(plan.phase_3_command,'ride_naturally')),
            'phase_4',jsonb_build_object('command',coalesce(plan.phase_4_command,'ride_naturally'))
          )
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_roles_json = coalesce((
        select jsonb_object_agg(en.rider_id::text,to_jsonb('free_role'::text))
        from public.national_championship_entries en
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_equipment_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          case when plan.equipment_setup_id is null then 'null'::jsonb
               else to_jsonb(plan.equipment_setup_id::text) end
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object('source','organizer','standardized',true)
        )
        from public.national_championship_entries en
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      metadata=coalesce(sp.metadata,'{}'::jsonb) || jsonb_build_object(
        'national_championship',true,
        'individual_only',true,
        'team_commands_enabled',false
      ),
      updated_at=now()
  from public.race_preparations rp
  where sp.race_preparation_id=rp.id
    and rp.race_id=v_race_id
    and sp.stage_id=v_stage_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false);

  /*
   * Rebuild the canonical participant snapshot after preparation triggers.
   */
  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams (
    race_id,
    team_id,
    status,
    team_name_snapshot,
    logo_url_snapshot,
    country_code_snapshot,
    ranking_snapshot,
    submitted_at,
    accepted_at
  )
  select
    v_race_id,
    en.rider_id,
    'accepted',
    en.rider_name_snapshot,
    null,
    en.country_code_snapshot,
    en.national_rank,
    now(),
    now()
  from public.national_championship_entries en
  where en.edition_id=e.id
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  insert into public.race_participant_riders (
    race_id,
    team_id,
    rider_id,
    rider_name_snapshot,
    team_name_snapshot,
    country_code_snapshot,
    age_snapshot,
    is_young_rider,
    start_number,
    role_snapshot,
    overall_snapshot,
    can_view_exact_overall,
    overall_range_label
  )
  select
    v_race_id,
    en.rider_id,
    en.rider_id,
    en.rider_name_snapshot,
    en.rider_name_snapshot,
    en.country_code_snapshot,
    greatest(
      0,
      extract(year from age(
        case when p_event_type='qualification' then e.qualification_date else e.final_date end,
        r.birth_date
      ))::int
    ),
    extract(year from age(
      case when p_event_type='qualification' then e.qualification_date else e.final_date end,
      r.birth_date
    ))::int <= 21,
    en.national_rank,
    r.role::text,
    r.overall,
    true,
    null
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=e.id
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  select count(*)::int,count(distinct team_id)::int
  into v_rider_count,v_team_count
  from public.race_participant_riders
  where race_id=v_race_id;

  return jsonb_build_object(
    'status','participants_synced',
    'edition_id',e.id,
    'event_type',p_event_type,
    'heat_id',p_heat_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count,
    'team_count',v_team_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_ensure_event_race_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  src public.race_stages%rowtype;
  v_source_stage_id uuid;
  v_source_race_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_date date;
  v_country_name text;
  v_name text;
  v_region text;
  v_hour integer;
  v_minute integer := 0;
  v_host_city text;
  v_daytime_temp numeric;
  v_avg_temp numeric;
  v_max_temp numeric;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.climate_status<>'ready' then
    raise exception 'National championship climate window is not ready for %',e.country_code;
  end if;

  if e.route_status<>'ready' then
    raise exception 'National championship requires two suitable road stages for % (route_status=%)',e.country_code,e.route_status;
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where c.code=e.country_code;
  v_country_name:=coalesce(v_country_name,e.country_code);

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where id=p_heat_id and edition_id=e.id
    for update;

    if h.id is null then
      raise exception 'Qualification heat not found: %',p_heat_id;
    end if;

    if h.race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'qualification',h.id);
      return h.race_id;
    end if;

    v_source_stage_id:=e.qualification_source_stage_id;
    v_date:=h.qualification_date;
    v_name:=v_country_name||' National Qualification — Group '||h.heat_number;
  elsif p_event_type='final' then
    if e.final_race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
      return e.final_race_id;
    end if;

    v_source_stage_id:=e.final_source_stage_id;
    v_date:=e.final_date;
    v_name:=v_country_name||' National Road Championship';
  else
    raise exception 'Invalid national championship event type: %',p_event_type;
  end if;

  if v_source_stage_id is null then
    raise exception 'No source stage selected for % national championship %',e.country_code,p_event_type;
  end if;

  select * into src
  from public.race_stages
  where id=v_source_stage_id;

  if src.id is null then
    raise exception 'Source stage not found: %',v_source_stage_id;
  end if;

  v_source_race_id:=src.race_id;
  v_host_city:=coalesce(
    nullif(src.host_city,''),
    nullif(src.start_city_name,''),
    nullif(src.start_city,''),
    nullif(src.finish_city_name,''),
    nullif(src.finish_city,''),
    v_country_name
  );

  v_region:=public.race_start_region_code_v1(e.country_code);
  v_hour:=case v_region
    when 'apac' then 7
    when 'americas' then 17
    else 13
  end;

  if p_event_type='qualification' then
    v_hour:=v_hour+((h.heat_number-1)/2);
    v_minute:=case when mod(h.heat_number-1,2)=0 then 0 else 30 end;
  end if;

  insert into public.races(
    name,short_name,start_date,end_date,country_code,host_city,
    category,race_type,is_stage_race,stage_count,status,
    profile_image_url,logo_url,description,metadata,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at
  )
  values(
    v_name,
    case when p_event_type='final'
      then e.country_code||' NC'
      else e.country_code||' NCQ G'||h.heat_number
    end,
    v_date,v_date,e.country_code,v_host_city,
    case when p_event_type='final' then 'NC' else 'NCQ' end,
    'one_day',false,1,'scheduled',
    null::text,
    'https://flagcdn.com/w320/'||lower(e.country_code)||'.png',
    case when p_event_type='final'
      then 'National road championship on an existing host-country road route.'
      else 'National championship qualification heat on an existing host-country road route.'
    end,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'heat_id',case when p_event_type='qualification' then h.id else null end,
      'heat_number',case when p_event_type='qualification' then h.heat_number else null end,
      'country_code',e.country_code,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'display_logo_mode','country_flag',
      'display_country_flag_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'climate_week_of_year',e.climate_week_of_year,
      'climate_expected_max_temp_c',e.climate_expected_max_temp_c,
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'individual_only',true,
      'team_commands_enabled',false,
      'staff_assets_supplies_locked',true,
      'team_cost_cash',0,
      'team_cost_coins',0
    ),
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now()
  )
  returning id into v_race_id;

  /*
   * Insert first with the climate-source country so the normal weather trigger
   * generates from a populated weekly-normal dataset. Then restore the real
   * host country and retain the climate source explicitly in the snapshot.
   */
  insert into public.race_stages(
    race_id,stage_number,stage_date,name,start_city,finish_city,host_city,
    host_country_code,distance_km,terrain_type,finish_type,is_summit_finish,
    flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
    profile_image_url,rules_snapshot,metadata,start_city_name,finish_city_name,
    profile_type,notes,intermediate_sprints_json,mountain_climbs_json,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at,stage_format
  )
  values(
    v_race_id,1,v_date,
    case when p_event_type='final'
      then 'National Championship'
      else v_country_name||' National Qualification Group '||h.heat_number
    end,
    coalesce(src.start_city,src.start_city_name),
    coalesce(src.finish_city,src.finish_city_name),
    v_host_city,
    coalesce(e.climate_source_country_code,e.country_code),
    src.distance_km,
    src.terrain_type,
    src.finish_type,
    coalesce(src.is_summit_finish,false),
    src.flat_pct,src.hilly_pct,src.mountain_pct,src.cobbled_pct,
    src.elevation_gain_m,
    null::text,
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'actual_host_country_code',e.country_code
    ),
    coalesce(src.start_city_name,src.start_city),
    coalesce(src.finish_city_name,src.finish_city),
    src.profile_type,
    'National Championship route using a host-country terrain profile.',
    '[]'::jsonb,
    '[]'::jsonb,
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now(),
    'road_race'
  )
  returning id into v_stage_id;

  select
    nullif(src2.weather_snapshot->>'avg_temp_c','')::numeric,
    nullif(src2.weather_snapshot->>'avg_max_temp_c','')::numeric
  into v_avg_temp,v_max_temp
  from public.race_stages src2
  where src2.id=v_stage_id;

  v_max_temp:=coalesce(v_max_temp,e.climate_expected_max_temp_c,20.1);
  v_avg_temp:=coalesce(v_avg_temp,greatest(20.1,v_max_temp-5));

  /*
   * These races start in the warm local daytime slot. Represent the start-time
   * temperature between the weekly mean and mean daily high, with a strict
   * >20 C floor only for championship races whose climate window passed.
   */
  v_daytime_temp:=greatest(
    20.1,
    least(
      greatest(v_max_temp,20.1),
      v_avg_temp+(greatest(v_max_temp-v_avg_temp,0)*0.72)
    )
  );

  update public.race_stages
  set
    host_country_code=e.country_code,
    weather_snapshot=coalesce(weather_snapshot,'{}'::jsonb)||jsonb_build_object(
      'country_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'national_championship',true,
      'warm_daytime_start',true,
      'race_start_temp_c',round(v_daytime_temp,1),
      'avg_temp_c',round(v_daytime_temp,1)
    ),
    updated_at=now()
  where id=v_stage_id;

  insert into public.race_stage_profile_details(
    stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
    distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
    profile_points,route_markers,intermediate_sprints,mountain_climbs,
    metadata,weather_snapshot
  )
  select
    v_stage_id,
    v_race_id,
    v_name,
    coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ||' → '||
    coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
    case
      when lower(coalesce(src.terrain_type,'flat'))='flat'
        then 'National Championship road race on a fast host-country terrain profile.'
      when lower(coalesce(src.terrain_type,'flat'))='hilly'
        then 'National Championship road race on a selective rolling host-country terrain profile.'
      else 'National Championship road race on a balanced host-country terrain profile.'
    end,
    null,
    coalesce(spd.distance_km,src.distance_km),
    coalesce(spd.elevation_gain_m,src.elevation_gain_m,0),
    coalesce(spd.terrain_type,src.terrain_type,'flat'),
    coalesce(spd.profile_type,src.profile_type,'sprinter'),
    coalesce(spd.terrain_split,jsonb_build_object(
      'flat',coalesce(src.flat_pct,0),
      'hilly',coalesce(src.hilly_pct,0),
      'mountain',coalesce(src.mountain_pct,0),
      'cobbled',coalesce(src.cobbled_pct,0)
    )),
    coalesce(spd.profile_points,'[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object(
        'km',0,
        'type','start',
        'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ),
      jsonb_build_object(
        'km',src.distance_km,
        'type','finish',
        'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'source_stage_id',v_source_stage_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'cloned_for_event_type',p_event_type
    ),
    (select weather_snapshot from public.race_stages where id=v_stage_id)
  from public.race_stage_profile_details spd
  where spd.stage_id=v_source_stage_id
  on conflict (stage_id) do nothing;

  if not exists(
    select 1 from public.race_stage_profile_details where stage_id=v_stage_id
  ) then
    insert into public.race_stage_profile_details(
      stage_id,race_id,stage_title,route_label,stage_summary,
      distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
      profile_points,route_markers,intermediate_sprints,mountain_climbs,
      metadata,weather_snapshot
    )
    values(
      v_stage_id,v_race_id,v_name,
      coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ||' → '||
      coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
      'National Championship road race using a host-country terrain profile.',
      coalesce(src.distance_km,0),
      coalesce(src.elevation_gain_m,0),
      coalesce(src.terrain_type,'flat'),
      coalesce(src.profile_type,'sprinter'),
      jsonb_build_object(
        'flat',coalesce(src.flat_pct,0),
        'hilly',coalesce(src.hilly_pct,0),
        'mountain',coalesce(src.mountain_pct,0),
        'cobbled',coalesce(src.cobbled_pct,0)
      ),
      coalesce(
        src.metadata #> '{route_profile_v1,profile_points}',
        src.metadata -> 'profile_points',
        '[]'::jsonb
      ),
      jsonb_build_array(
        jsonb_build_object(
          'km',0,
          'type','start',
          'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ),
        jsonb_build_object(
          'km',src.distance_km,
          'type','finish',
          'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_object(
        'national_championship',true,
        'source_stage_id',v_source_stage_id,
        'source_competition_identity_hidden',true,
        'only_start_and_finish_points',true,
        'cloned_for_event_type',p_event_type
      ),
      (select weather_snapshot from public.race_stages where id=v_stage_id)
    );
  end if;

  perform public.sync_race_stage_points_from_stage_json_v1(v_stage_id,true);

  delete from public.race_stage_points
  where stage_id=v_stage_id
    and upper(point_type) not in ('START','FINISH');

  update public.race_stage_points
  set name=case when upper(point_type)='START' then 'Start' else 'Finish' end,
      points_scheme='[]'::jsonb,
      time_bonus_seconds='[]'::jsonb,
      kom_category=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'national_championship',true,
        'only_start_and_finish_points',true
      )
  where stage_id=v_stage_id;

  insert into public.race_entry_rules(
    race_id,race_class_code,target_teams,min_teams,max_teams,
    min_riders_per_team,max_riders_per_team,
    applications_open_game_date,applications_close_game_date,
    applications_status,auto_close_when_full,allow_waitlist,
    prize_fund_cash,prize_fund_source,metadata,
    race_season_number,race_start_month_number,race_start_day_number,
    application_window_policy,rider_submission_deadline
  )
  values(
    v_race_id,'1.1',200,1,200,1,120,
    v_date-1,v_date-1,'closed',true,false,
    0,'manual_override',
    jsonb_build_object(
      'national_championship',true,
      'applications_disabled',true,
      'automatic_entry',true,
      'no_team_cost',true,
      'individual_riders_only',true
    ),
    e.season_number,
    extract(month from v_date)::int,
    extract(day from v_date)::int,
    'standard_90_3',
    v_date
  );

  if p_event_type='qualification' then
    update public.national_championship_heats
    set race_id=v_race_id,status='ready',updated_at=now()
    where id=h.id;
  else
    update public.national_championship_editions
    set final_race_id=v_race_id,updated_at=now()
    where id=e.id;
  end if;

  perform public.national_championship_sync_race_participants_v1(
    e.id,
    p_event_type,
    case when p_event_type='qualification' then h.id else null end
  );

  return v_race_id;
end;
$function$
;

