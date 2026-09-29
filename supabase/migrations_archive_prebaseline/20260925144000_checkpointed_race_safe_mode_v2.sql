-- Checkpointed race calculation safe mode v2
-- Keeps heavy race calculations resumable and switches stalled full calculations
-- into smaller checkpointed steps without changing official race rules/results.

create table if not exists public.race_stage_safe_calculation_v1 (
  stage_id uuid primary key references public.race_stages(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  simulation_run_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed')),
  step integer not null default 0 check (step >= 0),
  workload_score numeric not null default 0,
  trigger_reason text not null,
  checkpoint_json jsonb not null default '{}'::jsonb,
  checkpoint_text text not null default '{}',
  lease_token uuid,
  lease_expires_at timestamptz,
  step_attempt_count integer not null default 0,
  total_attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

alter table public.race_stage_safe_calculation_v1
  add column if not exists checkpoint_text text not null default '{}';

create index if not exists race_stage_safe_calculation_status_idx
  on public.race_stage_safe_calculation_v1(status, lease_expires_at, updated_at);

revoke all on public.race_stage_safe_calculation_v1 from anon, authenticated;
grant select, insert, update, delete on public.race_stage_safe_calculation_v1 to service_role;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

revoke all on function public.universal_race_stage_enable_safe_mode_v1(uuid,uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.universal_race_stage_claim_safe_step_v2(text) from public,anon,authenticated;
revoke all on function public.universal_race_stage_save_safe_step_v2(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.universal_race_stage_fail_safe_step_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.universal_race_stage_complete_safe_mode_v2(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.universal_race_stage_kick_safe_worker_v1() from public,anon,authenticated;
revoke all on function public.universal_race_stage_fast_safe_guard_v1() from public,anon,authenticated;

grant execute on function public.universal_race_stage_enable_safe_mode_v1(uuid,uuid,text,numeric) to service_role;
grant execute on function public.universal_race_stage_claim_safe_step_v2(text) to service_role;
grant execute on function public.universal_race_stage_save_safe_step_v2(uuid,uuid,uuid,integer,text,text) to service_role;
grant execute on function public.universal_race_stage_fail_safe_step_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.universal_race_stage_complete_safe_mode_v2(uuid,uuid,uuid) to service_role;
grant execute on function public.universal_race_stage_kick_safe_worker_v1() to service_role;
grant execute on function public.universal_race_stage_fast_safe_guard_v1() to service_role;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job
    where jobname in ('universal-race-stage-safe-resume-v1','universal-race-fast-safe-guard-v1')
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(
    'universal-race-stage-safe-resume-v1',
    '* * * * *',
    $cron$
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
      );
    $cron$
  );

  perform cron.schedule(
    'universal-race-fast-safe-guard-v1',
    '* * * * *',
    'select public.universal_race_stage_fast_safe_guard_v1();'
  );
end $$;
