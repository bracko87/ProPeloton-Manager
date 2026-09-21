-- Keep Pass 1 recovery fair and aligned with the release survival policy.
-- Oldest eligible work is resumed first and stale loading/engine leases use
-- the five-minute recovery threshold.

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

