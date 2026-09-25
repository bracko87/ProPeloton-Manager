-- Make hidden race submissions idempotent under duplicate Pass-2 workers.
-- A late worker can no longer turn an accepted synchronized calculation back
-- into a failed stage. The immutable input/output hashes are compared before
-- a duplicate submission is accepted as a no-op.

CREATE OR REPLACE FUNCTION public.universal_race_stage_fail_calculation_v1(p_stage_id uuid, p_simulation_run_id uuid, p_error_message text, p_error_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
begin
  perform set_config('app.race_engine_writer_family', 'typescript', true);
  perform pg_advisory_xact_lock(hashtextextended('phase11b_submit:' || p_stage_id::text, 0));

  select * into v_run
  from public.race_stage_simulation_runs r
  where r.id=p_simulation_run_id and r.stage_id=p_stage_id
    and r.engine_version='race_engine_ts_v1'
    and r.simulation_mode='deterministic_road_race_v1'
  for update;

  if not found then
    return jsonb_build_object('status','ignored_missing_run','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;

  -- A late duplicate worker may not overwrite an accepted hidden/authoritative result.
  if exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id)
     or coalesce(v_run.result_summary_json->>'calculation_contract','') =
          'universal_phase11b_calculated_hidden_v1'
  then
    if coalesce(v_run.result_summary_json->>'calculation_contract','') =
         'universal_phase11b_calculated_hidden_v1'
       and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id)
    then
      update public.race_stage_simulation_runs
         set status='running', failed_at=null, error_message=null,
             result_summary_json =
               (coalesce(result_summary_json,'{}'::jsonb)-'failed_at_real'-'error_details')
               || jsonb_build_object(
                    'calculation_status','calculated_hidden',
                    'late_failure_ignored_at_real',clock_timestamp()
                  ),
             updated_at=clock_timestamp()
       where id=p_simulation_run_id;

      update public.race_stage_automation_state
         set last_status='calculated_hidden', last_error=null,
             last_checked_at=clock_timestamp(),
             details=coalesce(details,'{}'::jsonb)
               || jsonb_build_object(
                    'late_failure_ignored_at_real',clock_timestamp(),
                    'late_failure_message',left(coalesce(p_error_message,'Unknown error'),10000)
                  ),
             updated_at=clock_timestamp()
       where stage_id=p_stage_id and simulation_run_id=p_simulation_run_id;
    end if;

    return jsonb_build_object('status','ignored_already_calculated','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;


  update public.race_stage_simulation_runs
  set status = 'failed',
      failed_at = clock_timestamp(),
      error_message = left(coalesce(p_error_message, 'Unknown error'), 10000),
      result_summary_json = coalesce(result_summary_json, '{}'::jsonb) || jsonb_build_object(
        'calculation_status', 'failed',
        'failed_at_real', clock_timestamp(),
        'error_details', coalesce(p_error_details, '{}'::jsonb),
        'verification_only', false
      ),
      updated_at = clock_timestamp()
  where id = p_simulation_run_id
    and stage_id = p_stage_id
    and engine_version = 'race_engine_ts_v1'
    and simulation_mode = 'deterministic_road_race_v1';

  update public.race_stage_automation_state
  set last_status = 'failed',
      last_error = left(coalesce(p_error_message, 'Unknown error'), 10000),
      last_checked_at = clock_timestamp(),
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'failed_at_real', clock_timestamp(),
        'error_details', coalesce(p_error_details, '{}'::jsonb)
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and simulation_run_id = p_simulation_run_id;

  return jsonb_build_object('status', 'failed_recorded', 'stage_id', p_stage_id, 'simulation_run_id', p_simulation_run_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.universal_race_stage_submit_calculation_v1(p_stage_id uuid, p_simulation_run_id uuid, p_input_snapshot jsonb, p_universal_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '110s'
 SET lock_timeout TO '5s'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_input_hash text;
  v_output_hash text;
  v_stage_start_game_at timestamp without time zone;
begin
  if p_stage_id is null or p_simulation_run_id is null or p_input_snapshot is null or p_universal_result is null then
    raise exception using errcode = '22023', message = 'stage_id, simulation_run_id, input_snapshot and universal output are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_submit:' || p_stage_id::text, 0));
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
  for update;

  if not found then raise exception 'Claimed Phase 11B run was not found.'; end if;

  -- Idempotent duplicate submission guard. The first identical hidden result wins.
  if coalesce(v_run.result_summary_json ->> 'calculation_contract', '') =
       'universal_phase11b_calculated_hidden_v1'
  then
    v_input_hash := md5(p_input_snapshot::text);
    v_output_hash := md5(p_universal_result::text);

    if coalesce(v_run.result_summary_json ->> 'input_hash_md5','') <> v_input_hash
       or coalesce(v_run.result_summary_json ->> 'output_hash_md5','') <> v_output_hash
    then
      raise exception 'Run % already has a different calculated hidden output.', p_simulation_run_id;
    end if;

    update public.race_stage_simulation_runs
       set status='running', failed_at=null, error_message=null,
           result_summary_json =
             (coalesce(result_summary_json,'{}'::jsonb)-'failed_at_real'-'error_details')
             || jsonb_build_object(
                  'calculation_status','calculated_hidden',
                  'duplicate_submit_reconciled_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where id=p_simulation_run_id;

    update public.race_stage_automation_state
       set last_status='calculated_hidden', last_error=null,
           last_checked_at=clock_timestamp(),
           details=coalesce(details,'{}'::jsonb)
             || jsonb_build_object(
                  'duplicate_submit_reconciled_at_real',clock_timestamp(),
                  'manifest_ready',true
                ),
           updated_at=clock_timestamp()
     where stage_id=p_stage_id and simulation_run_id=p_simulation_run_id;

    return jsonb_build_object(
      'status','calculated_hidden',
      'contract','universal_phase11b_calculated_hidden_v1',
      'stage_id',p_stage_id,
      'race_id',v_run.race_id,
      'simulation_run_id',p_simulation_run_id,
      'input_hash_md5',v_input_hash,
      'output_hash_md5',v_output_hash,
      'phase11_manifest_ready',true,
      'idempotent_duplicate_submit',true
    );
  end if;

  if v_run.status <> 'running' then raise exception 'Run % is not running.', p_simulation_run_id; end if;
  if coalesce(v_run.result_summary_json ->> 'calculation_contract', '') <> 'phase11b_claim_pending_v1' then
    raise exception 'Run % is not a Phase 11B pending claim.', p_simulation_run_id;
  end if;

  if coalesce(p_input_snapshot #>> '{engine,engineKey}', '') <> 'ppm_universal_race_v1'
     or coalesce(p_input_snapshot #>> '{engine,engineVersion}', '') <> '1'
     or coalesce(p_input_snapshot #>> '{stage,stageId}', '') <> p_stage_id::text
     or coalesce(p_input_snapshot #>> '{race,raceId}', '') <> v_run.race_id::text
  then
    raise exception 'Universal input identity does not match the claimed run.';
  end if;

  if coalesce(p_universal_result ->> 'contractVersion', '') <> 'universal_race_stage_output_v1'
     or coalesce(p_universal_result ->> 'engineKey', '') <> 'ppm_universal_race_v1'
     or coalesce(p_universal_result ->> 'engineVersion', '') <> '1'
     or coalesce(p_universal_result ->> 'stageId', '') <> p_stage_id::text
     or coalesce(p_universal_result ->> 'raceId', '') <> v_run.race_id::text
     or coalesce(p_universal_result #>> '{universalResult,validationPassed}', '') <> 'true'
  then
    raise exception 'Universal output identity/contract is invalid.';
  end if;

  v_manifest := coalesce(p_universal_result -> 'applicationManifest', '{}'::jsonb);
  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1'
     or not coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
     or coalesce((v_manifest ->> 'persistenceApplied')::boolean, true)
  then
    raise exception 'Phase 11 application manifest is missing, invalid, or already applied.';
  end if;

  if jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) = 0 then
    raise exception 'Phase 11 application manifest contains no rider-state rows.';
  end if;

  select stage.stage_date::timestamp
      + make_interval(hours => coalesce(stage.planned_start_hour_number, 12), mins => coalesce(stage.planned_start_minute, 0))
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  v_input_hash := md5(p_input_snapshot::text);
  v_output_hash := md5(p_universal_result::text);

  update public.race_stage_simulation_runs
  set input_snapshot_json = p_input_snapshot,
      result_summary_json = jsonb_build_object(
        'calculation_contract', 'universal_phase11b_calculated_hidden_v1',
        'contractVersion', p_universal_result ->> 'contractVersion',
        'engineKey', p_universal_result ->> 'engineKey',
        'engineVersion', p_universal_result ->> 'engineVersion',
        'raceId', p_universal_result ->> 'raceId',
        'stageId', p_universal_result ->> 'stageId',
        'calculation_status', 'calculated_hidden',
        'calculated_at_real', clock_timestamp(),
        'stage_start_game_at', v_stage_start_game_at,
        'input_hash_md5', v_input_hash,
        'output_hash_md5', v_output_hash,
        'output_snapshot', p_universal_result,
        
        'application_manifest', v_manifest,
        'official_outputs_persisted', false,
        'phase11_persistence_applied', false,
        'results_published', false,
        'verification_only', false
      ),
      error_message = null,
      failed_at = null,
      updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  update public.race_stage_automation_state
  set last_status = 'calculated_hidden',
      last_checked_at = clock_timestamp(),
      last_error = null,
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'calculated_at_real', clock_timestamp(),
        'input_hash_md5', v_input_hash,
        'output_hash_md5', v_output_hash,
        'manifest_ready', true,
        'verification_only', false
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and simulation_run_id = p_simulation_run_id;

  return jsonb_build_object(
    'status', 'calculated_hidden',
    'contract', 'universal_phase11b_calculated_hidden_v1',
    'stage_id', p_stage_id,
    'race_id', v_run.race_id,
    'simulation_run_id', p_simulation_run_id,
    'input_hash_md5', v_input_hash,
    'output_hash_md5', v_output_hash,
    'phase11_manifest_ready', true,
    'official_outputs_persisted', false,
    'phase11_persistence_applied', false,
    'results_published', false
  );
end;
$function$;


-- Repair a historical state produced by a late duplicate worker after a valid
-- hidden output had already been accepted. Sporting output is never changed.
update public.race_stage_simulation_runs r
set status='running',
    failed_at=null,
    error_message=null,
    result_summary_json =
      (coalesce(r.result_summary_json,'{}'::jsonb)-'failed_at_real'-'error_details')
      || jsonb_build_object(
           'calculation_status','calculated_hidden',
           'late_failure_state_repaired_at_real',clock_timestamp()
         ),
    updated_at=clock_timestamp()
where r.status='failed'
  and coalesce(r.result_summary_json->>'calculation_contract','') =
      'universal_phase11b_calculated_hidden_v1'
  and r.result_summary_json ? 'output_snapshot'
  and not exists (
    select 1 from public.race_stage_authoritative_runs a
    where a.stage_id=r.stage_id
  );

update public.race_stage_automation_state s
set last_status='calculated_hidden',
    last_error=null,
    last_checked_at=clock_timestamp(),
    details=coalesce(s.details,'{}'::jsonb)
      || jsonb_build_object(
           'late_failure_state_repaired_at_real',clock_timestamp(),
           'manifest_ready',true
         ),
    updated_at=clock_timestamp()
from public.race_stage_simulation_runs r
where r.id=s.simulation_run_id
  and r.stage_id=s.stage_id
  and r.status='running'
  and coalesce(r.result_summary_json->>'calculation_contract','') =
      'universal_phase11b_calculated_hidden_v1'
  and not exists (
    select 1 from public.race_stage_authoritative_runs a
    where a.stage_id=r.stage_id
  );
