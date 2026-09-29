-- Recover orphaned universal-production runner attempts that predate the
-- calculation_contract marker used by the survival watchdog.
--
-- The legacy/current runner writes phase11b_contract + support_contract before
-- calculation. If it dies after that write but before calculation_contract is
-- populated, the previous watchdog predicate never sees the stale run and the
-- stage can remain blocked indefinitely.

create or replace function public.universal_race_stage_survival_recover_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_current_game_at timestamp without time zone;
  v_run record;
  v_stage_start_game_at timestamp without time zone;
  v_deadline_reached boolean;
  v_stale_after interval;
  v_age interval;
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
    v_stale_after := case when v_deadline_reached then interval '45 seconds' else interval '2 minutes' end;
    v_age := clock_timestamp() - coalesce(v_run.updated_at,v_run.started_at,v_run.created_at);

    if v_age >= v_stale_after then
      perform public.universal_race_stage_fail_calculation_v1(
        v_run.stage_id,
        v_run.simulation_run_id,
        'Race calculation survival watchdog recovered an orphaned running claim.',
        jsonb_build_object(
          'recovery_model','race_calculation_survival_legacy_runner_recovery_v1',
          'reason','stale_universal_production_run_without_authoritative_result',
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
        'recover_stale_claim',
        'stale_universal_production_run_without_authoritative_result',
        jsonb_build_object(
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
    'normal_stale_after_seconds',120,
    'deadline_stale_after_seconds',45,
    'mandatory_ready_lead_minutes',15,
    'model_version','race_calculation_survival_legacy_runner_recovery_v1'
  );
end;
$function$;
