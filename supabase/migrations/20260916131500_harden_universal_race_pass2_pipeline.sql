-- Generic production hardening for long universal-race calculations.
--
-- Goals:
--   * make hidden-result submission fail fast on a competing stage lock instead
--     of consuming the whole statement timeout;
--   * allow enough bounded time for large replay JSON persistence;
--   * recover a recently failed Pass-2 submit without starting a fresh race run;
--   * prevent the normal runner from competing with a recoverable Pass-2 run;
--   * schedule the dedicated Pass-2 resume Edge worker every minute.

-- Preserve the accepted Phase 11B submit implementation byte-for-byte and put
-- the concurrency/timeout policy in a small stable wrapper.
do $migration$
begin
  if to_regprocedure('public.universal_race_stage_submit_calculation_impl_20260916(uuid,uuid,jsonb,jsonb)') is null then
    alter function public.universal_race_stage_submit_calculation_v1(uuid,uuid,jsonb,jsonb)
      rename to universal_race_stage_submit_calculation_impl_20260916;
  end if;
end
$migration$;

alter function public.universal_race_stage_submit_calculation_impl_20260916(uuid,uuid,jsonb,jsonb)
  set statement_timeout = '180s';
alter function public.universal_race_stage_submit_calculation_impl_20260916(uuid,uuid,jsonb,jsonb)
  set lock_timeout = '5s';

create or replace function public.universal_race_stage_submit_calculation_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_input_snapshot jsonb,
  p_universal_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
set statement_timeout to '190s'
set lock_timeout to '5s'
as $function$
declare
  v_result jsonb;
begin
  if p_stage_id is null or p_simulation_run_id is null then
    raise exception using errcode='22023', message='stage_id and simulation_run_id are required';
  end if;

  -- The implementation also takes this same transaction-level advisory lock.
  -- Acquiring it here with try-lock semantics makes a competing submit retryable
  -- immediately instead of looking like a slow/failed JSON persistence call.
  if not pg_try_advisory_xact_lock(hashtextextended('phase11b_submit:' || p_stage_id::text, 0)) then
    raise exception using
      errcode='55P03',
      message='Universal race stage submit lock is busy; retry later.';
  end if;

  v_result := public.universal_race_stage_submit_calculation_impl_20260916(
    p_stage_id,
    p_simulation_run_id,
    p_input_snapshot,
    p_universal_result
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'submit_wrapper','phase11b_submit_lock_hardening_v1',
    'input_bytes',pg_column_size(p_input_snapshot),
    'output_bytes',pg_column_size(p_universal_result)
  );
end;
$function$;

-- Keep the previously accepted resume selector as the base implementation and
-- add only the missing failed-submit recovery case around it.
do $migration$
begin
  if to_regprocedure('public.universal_race_stage_claim_pass2_resume_base_20260916()') is null then
    alter function public.universal_race_stage_claim_pass2_resume_v1()
      rename to universal_race_stage_claim_pass2_resume_base_20260916;
  end if;
end
$migration$;

create or replace function public.universal_race_stage_claim_pass2_resume_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_run_id uuid;
  v_stage_id uuid;
  v_failed_at timestamptz;
  v_error_message text;
begin
  -- A submit can finish its full Pass 2 calculation and then lose only the
  -- large persistence transaction. Reuse that same reserved scenario/run for a
  -- bounded 30-minute recovery window instead of creating a new simulation.
  select s.id,s.stage_id,s.failed_at,s.error_message
    into v_run_id,v_stage_id,v_failed_at,v_error_message
  from public.race_stage_simulation_runs s
  join public.race_engine_scenario_runs sc
    on sc.simulation_run_id=s.id
   and sc.selection_status='reserved'
  where s.status='failed'
    and coalesce(s.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and coalesce(s.result_summary_json->>'survival_phase','')='pass2_resume_failed'
    and s.failed_at > clock_timestamp() - interval '30 minutes'
    and (
      coalesce(s.result_summary_json #>> '{survival_details,error}','') ilike '%universal_race_stage_submit_calculation_v1%statement timeout%'
      or coalesce(s.result_summary_json #>> '{survival_details,error}','') ilike '%submit lock is busy%'
      or coalesce(s.result_summary_json #>> '{survival_details,error}','') ilike '%lock timeout%'
    )
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
    )
  order by s.failed_at desc
  for update of s skip locked
  limit 1;

  if v_run_id is null then
    return public.universal_race_stage_claim_pass2_resume_base_20260916();
  end if;

  update public.race_stage_simulation_runs
     set status='running',
         failed_at=null,
         error_message=null,
         result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
           || jsonb_build_object(
                'pass2_resume_recovery',jsonb_build_object(
                  'recovered_from_status','failed',
                  'watchdog_failed_at_real',v_failed_at,
                  'watchdog_error',v_error_message,
                  'recovered_at_real',clock_timestamp(),
                  'recovery_reason','transient_submit_failure'
                )
              )
   where id=v_run_id;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_stage_id,
    v_run_id,
    'pass2_resume_claimed',
    jsonb_build_object(
      'source','pass2_resume_worker_v2',
      'previous_phase','pass2_resume_failed',
      'recovered_failed_run',true,
      'recovery_reason','transient_submit_failure'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_stage_id,
    'simulation_run_id',v_run_id,
    'previous_phase','pass2_resume_failed',
    'recovered_failed_run',true,
    'recovery_reason','transient_submit_failure'
  );
end;
$function$;

-- Preserve the current single-active-worker claim policy, but do not allow a
-- fresh simulation to race a recently failed Pass-2 persistence recovery.
do $migration$
begin
  if to_regprocedure('public.universal_race_stage_claim_next_due_v2_base_20260916(text)') is null then
    alter function public.universal_race_stage_claim_next_due_v2(text)
      rename to universal_race_stage_claim_next_due_v2_base_20260916;
  end if;
end
$migration$;

create or replace function public.universal_race_stage_claim_next_due_v2(
  p_worker_id text default 'supabase_edge_phase11b_split_payload_v2'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_resume record;
begin
  select s.id as simulation_run_id,
         s.stage_id,
         s.race_id,
         s.failed_at,
         coalesce(s.result_summary_json->>'survival_phase','') as survival_phase
    into v_resume
  from public.race_stage_simulation_runs s
  join public.race_engine_scenario_runs sc
    on sc.simulation_run_id=s.id
   and sc.selection_status='reserved'
  where s.status='failed'
    and coalesce(s.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and s.failed_at > clock_timestamp() - interval '30 minutes'
    and (
      coalesce(s.result_summary_json->>'survival_phase','') in ('payload_loaded','scenario_reserved')
      or (
        coalesce(s.result_summary_json->>'survival_phase','')='pass2_resume_failed'
        and (
          coalesce(s.result_summary_json #>> '{survival_details,error}','') ilike '%universal_race_stage_submit_calculation_v1%statement timeout%'
          or coalesce(s.result_summary_json #>> '{survival_details,error}','') ilike '%submit lock is busy%'
          or coalesce(s.result_summary_json #>> '{survival_details,error}','') ilike '%lock timeout%'
        )
      )
    )
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
    )
  order by s.failed_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','worker_busy',
      'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
      'active_stage_id',v_resume.stage_id,
      'active_race_id',v_resume.race_id,
      'active_simulation_run_id',v_resume.simulation_run_id,
      'active_survival_phase',v_resume.survival_phase,
      'recovery_required','pass2_resume',
      'failed_at',v_resume.failed_at,
      'worker_model','single_active_universal_race_worker_pass2_priority_v1'
    );
  end if;

  return public.universal_race_stage_claim_next_due_v2_base_20260916(p_worker_id);
end;
$function$;

-- Ensure there is exactly one minute-level scheduler for the dedicated resume
-- worker. The secret remains inside Vault and is never persisted in this file.
do $migration$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='universal-race-stage-pass2-resume-v1'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end
$migration$;

select cron.schedule(
  'universal-race-stage-pass2-resume-v1',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-universal-race-worker-secret',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='universal_race_worker_secret_v1'
          limit 1
        )
      ),
      body := '{"action":"resume"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
