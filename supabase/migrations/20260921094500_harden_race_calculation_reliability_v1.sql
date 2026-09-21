-- Release hardening for the universal race calculation pipeline.
-- 1) Start hidden calculations five game hours before race time so the
--    single-active worker model has enough runway for dense schedules.
-- 2) Run survival recovery independently every five real minutes.
-- 3) Recover stale Pass 1/2 loading leases after five minutes.
-- 4) Serialize the global active-check + claim transaction so concurrent
--    dispatchers cannot create orphaned duplicate active runs.

update public.race_engine_runtime_control_v1
set typescript_calculation_lead_hours = 5
where singleton_id = true;

select cron.alter_job(
  61,
  schedule := '*/5 * * * *',
  active := true
);

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_recover_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_run record;
  v_stage_start_game_at timestamp without time zone;
  v_deadline_reached boolean;
  v_stale_after interval;
  v_age interval;
  v_phase text;
  v_recovered integer := 0;
  v_checked integer := 0;
begin
  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  for v_run in
    select sr.id as simulation_run_id,
           sr.stage_id,
           sr.race_id,
           sr.started_at,
           sr.updated_at,
           sr.created_at,
           coalesce(nullif(sr.result_summary_json->>'survival_phase',''),'claimed') as survival_phase,
           s.stage_date,
           s.planned_start_hour_number,
           s.planned_start_minute
    from public.race_stage_simulation_runs sr
    join public.race_stages s on s.id=sr.stage_id
    where sr.engine_version='race_engine_ts_v1'
      and sr.simulation_mode='deterministic_road_race_v1'
      and sr.status='running'
      and (
        coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
        or (
          coalesce(sr.result_summary_json->>'calculation_contract','')=''
          and coalesce(sr.result_summary_json->>'phase11b_contract','')='universal_production_engine_v2'
          and coalesce(sr.result_summary_json->>'support_contract','')='supabase_race_calculation_survival_v1'
        )
      )
      and not exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
      )
    order by coalesce(sr.updated_at,sr.started_at,sr.created_at)
    limit 200
  loop
    v_checked := v_checked + 1;
    v_stage_start_game_at := v_run.stage_date::timestamp
      + make_interval(hours=>coalesce(v_run.planned_start_hour_number,12),
                      mins=>coalesce(v_run.planned_start_minute,0));
    v_deadline_reached := v_current_game_at >= v_stage_start_game_at - interval '15 minutes';
    v_phase := coalesce(nullif(v_run.survival_phase,''),'claimed');

    v_stale_after := case
      when v_phase in ('primary_engine_started','fallback_engine_started') then interval '15 minutes'
      when v_phase in ('pass1_resume_claimed','pass1_payload_loading','pass1_started',
                       'pass2_resume_claimed','pass2_payload_loading') then interval '5 minutes'
      when v_phase in ('primary_engine_finished','fallback_engine_finished','output_ready','submitting','scenario_reserved') then interval '5 minutes'
      when v_phase in ('claimed','payload_loading','payload_loaded','pass1_pending','pass1_ready_no_scenario') then interval '5 minutes'
      else interval '5 minutes'
    end;

    v_age := clock_timestamp() - coalesce(v_run.updated_at,v_run.started_at,v_run.created_at);

    if v_age >= v_stale_after then
      perform public.universal_race_stage_fail_calculation_v1(
        v_run.stage_id,
        v_run.simulation_run_id,
        'Race calculation survival watchdog recovered an expired calculation lease.',
        jsonb_build_object(
          'recovery_model','race_calculation_survival_phase_aware_lease_v2',
          'reason','expired_phase_aware_calculation_lease_without_authoritative_result',
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at,
          'mandatory_ready_deadline_game_at',v_stage_start_game_at - interval '15 minutes'
        )
      );

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      ) values (
        v_run.stage_id,
        v_run.race_id,
        v_run.simulation_run_id,
        'recover_expired_phase_lease',
        'expired_phase_aware_calculation_lease_without_authoritative_result',
        jsonb_build_object(
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );
      v_recovered := v_recovered + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'checked_running_claims',v_checked,
    'recovered_stale_claims',v_recovered,
    'claimed_or_payload_lease_seconds',300,
    'engine_lease_seconds',900,
    'post_engine_lease_seconds',300,
    'mandatory_ready_lead_minutes',15,
    'deadline_shortening_disabled',true,
    'model_version','race_calculation_survival_phase_aware_lease_v2'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_next_due_v2(p_worker_id text DEFAULT 'supabase_edge_phase11b_split_payload_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_survival jsonb;
  v_result jsonb;
  v_active record;
  v_recovery_pending record;
begin
  /*
   * Serialize the active-pipeline check and the following claim as one atomic
   * database critical section. Without this lock, two runner invocations can
   * both observe "no active calculation" and create two runs at the same
   * instant. Pass 1 then services only one while the other becomes an orphaned
   * claimed run and is later killed by the survival watchdog.
   */
  perform pg_advisory_xact_lock(
    hashtextextended('universal_race_single_active_calculation_v2', 0)
  );

  -- Recover genuinely stale work before deciding whether another calculation may start.
  v_survival := public.universal_race_stage_survival_recover_v1();

  -- Production runs on a small database instance. Keep at most one unfinished
  -- calculation pipeline active at a time so payload/submit work cannot overlap
  -- and starve login/API queries.
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

  -- A watchdog-expired active pass-1 calculation is intentionally recovered by
  -- the pass-2 emergency fallback worker. Do not create a second run for the
  -- same stage in the dispatcher/pass2 handoff window.
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
$function$

