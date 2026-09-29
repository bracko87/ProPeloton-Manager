-- Persist the production finalizer hotfix applied during the 2026-09-17 incident.
-- This keeps authority/classifications/points/prizes intact while avoiding the
-- expensive rewrite of the multi-megabyte result_summary_json at publication.

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_core_survival_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_manifest jsonb;
  v_output jsonb;
  v_row jsonb;
  v_stage_result_count integer := 0;
  v_point_result_count integer := 0;
  v_report_event_count integer := 0;
  v_removed_setup_report_event_count integer := 0;
  v_rider_state_count integer := 0;
  v_fatigue_result jsonb;
  v_supply_result jsonb;
  v_wear_result jsonb;
  v_health_result jsonb;
  v_classification_result jsonb;
  v_prize_payment_result jsonb;
  v_is_final_stage boolean := false;
  v_role_code text;
  v_stage_status text;
  v_start_stamina numeric;
begin
  if p_stage_id is null then raise exception 'p_stage_id is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_finalize:' || p_stage_id::text, 0));
  perform set_config('app.race_engine_writer_family', 'typescript', true);

  select * into v_state
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id
  for update;
  if not found then raise exception 'Phase 11B lifecycle state for stage % was not found.', p_stage_id; end if;

  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = v_state.simulation_run_id
    and run.stage_id = p_stage_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
  for update;
  if not found then raise exception 'Phase 11B simulation run for stage % was not found.', p_stage_id; end if;

  if v_run.status = 'completed'
     and (
       v_state.last_status = 'published'
       or exists (
         select 1
         from public.race_stage_authoritative_runs authority
         where authority.stage_id = p_stage_id
           and authority.simulation_run_id = v_run.id
       )
     )
  then
    return jsonb_build_object(
      'status', 'already_published',
      'stage_id', p_stage_id,
      'simulation_run_id', v_run.id
    );
  end if;

  if v_run.status <> 'running'
     or coalesce(v_run.result_summary_json ->> 'calculation_contract', '') <> 'universal_phase11b_calculated_hidden_v1'
  then
    raise exception 'Stage % does not have a running hidden Phase 11B calculation.', p_stage_id;
  end if;

  if v_state.last_status <> 'replay_live' then
    raise exception 'Stage % replay is not live/closable; current lifecycle status is %.', p_stage_id, v_state.last_status;
  end if;

  if nullif(v_state.details ->> 'replay_closes_at_real', '') is null
     or clock_timestamp() < (v_state.details ->> 'replay_closes_at_real')::timestamptz
  then
    raise exception 'Stage % replay window has not closed.', p_stage_id;
  end if;

  v_manifest := coalesce(v_run.result_summary_json -> 'application_manifest', '{}'::jsonb);
  v_output := coalesce(v_run.result_summary_json -> 'output_snapshot', '{}'::jsonb);

  if coalesce(v_manifest ->> 'contractVersion', '') <> 'universal_phase11_application_manifest_v1'
     or not coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
     or coalesce((v_manifest ->> 'persistenceApplied')::boolean, true)
     or coalesce(v_output ->> 'contractVersion', '') <> 'universal_race_stage_output_v1'
  then
    raise exception 'Stage % has no unapplied valid Phase 11 manifest/output.', p_stage_id;
  end if;

  delete from public.race_stage_report_events report_event
  where report_event.stage_id = p_stage_id
    and nullif(report_event.metadata ->> 'simulation_run_id', '') is null
    and coalesce(report_event.metadata ->> 'output_contract', '') <> 'universal_race_stage_output_v1';
  get diagnostics v_removed_setup_report_event_count = row_count;

  if exists (select 1 from public.race_stage_results result where result.stage_id = p_stage_id)
     or exists (select 1 from public.race_stage_point_results point_result where point_result.stage_id = p_stage_id)
     or exists (
       select 1
       from public.race_stage_report_events report_event
       where report_event.stage_id = p_stage_id
         and (
           nullif(report_event.metadata ->> 'simulation_run_id', '') is not null
           or report_event.metadata ->> 'output_contract' = 'universal_race_stage_output_v1'
         )
     )
     or exists (select 1 from public.race_stage_authoritative_runs authority where authority.stage_id = p_stage_id)
  then
    raise exception 'Stage % already has official output/authority; Phase 11B refuses to overwrite it.', p_stage_id;
  end if;

  if exists (select 1 from public.race_stage_rider_states state_row where state_row.simulation_run_id = v_run.id)
     or exists (select 1 from public.race_engine_stage_wear_applications wear where wear.simulation_run_id = v_run.id)
     or exists (
       select 1 from public.race_stage_supply_usage_events event
       where coalesce(event.idempotency_key, '') like 'phase11b:' || v_run.id::text || ':%'
     )
     or exists (
       select 1 from public.rider_health_case_context_v1 context
       where coalesce(context.notes ->> 'phase11_simulation_run_id', '') = v_run.id::text
     )
  then
    raise exception 'Stage % already has partial Phase 11B persistence; refusing non-atomic finalization.', p_stage_id;
  end if;

  for v_row in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) item
    order by item ->> 'riderId'
  loop
    select plan_rider ->> 'stageRole'
    into v_role_code
    from jsonb_array_elements(coalesce(v_run.input_snapshot_json -> 'stagePlans', '[]'::jsonb)) team_plan,
         jsonb_array_elements(coalesce(team_plan -> 'riders', '[]'::jsonb)) plan_rider
    where plan_rider ->> 'riderId' = v_row ->> 'riderId'
    limit 1;

    v_role_code := coalesce(nullif(v_role_code, ''), 'free_role');
    v_stage_status := case lower(coalesce(v_row ->> 'finishStatus', 'finished'))
      when 'dns' then 'dns'
      when 'dnf' then 'dnf'
      when 'otl' then 'otl'
      else 'finished'
    end;
    v_start_stamina := least(
      100::numeric,
      greatest(
        0::numeric,
        coalesce(nullif(v_row ->> 'finishStamina', '')::numeric, 0)
          + coalesce(nullif(v_row ->> 'staminaSpent', '')::numeric, 0)
      )
    );

    insert into public.race_stage_rider_states (
      simulation_run_id, race_id, stage_id, rider_id, team_id, role_code,
      start_stamina, finish_stamina, stamina_spent,
      fatigue_before_stage, fatigue_gain, fatigue_after_stage,
      stage_status, finish_position, finish_time_seconds, gap_seconds, metadata
    ) values (
      v_run.id,
      v_run.race_id,
      v_run.stage_id,
      nullif(v_row ->> 'riderId', '')::uuid,
      nullif(v_row ->> 'teamId', '')::uuid,
      v_role_code,
      v_start_stamina,
      coalesce(nullif(v_row ->> 'finishStamina', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'staminaSpent', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueBeforeStage', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueGain', '')::numeric, 0),
      coalesce(nullif(v_row ->> 'fatigueAfterStage', '')::numeric, 0),
      v_stage_status,
      nullif(v_row ->> 'finishPosition', '')::integer,
      nullif(v_row ->> 'finishTimeSeconds', '')::integer,
      nullif(v_row ->> 'gapSeconds', '')::integer,
      jsonb_build_object(
        'source', 'phase11b_universal_application_manifest',
        'manifest_write_key', v_row ->> 'writeKey',
        'official_finish_status', lower(coalesce(v_row ->> 'finishStatus', 'finished')),
        'universal_engine_key', 'ppm_universal_race_v1',
        'universal_engine_version', '1'
      )
    )
    on conflict (simulation_run_id, rider_id) do update
    set team_id = excluded.team_id,
        role_code = excluded.role_code,
        start_stamina = excluded.start_stamina,
        finish_stamina = excluded.finish_stamina,
        stamina_spent = excluded.stamina_spent,
        fatigue_before_stage = excluded.fatigue_before_stage,
        fatigue_gain = excluded.fatigue_gain,
        fatigue_after_stage = excluded.fatigue_after_stage,
        stage_status = excluded.stage_status,
        finish_position = excluded.finish_position,
        finish_time_seconds = excluded.finish_time_seconds,
        gap_seconds = excluded.gap_seconds,
        metadata = excluded.metadata;
  end loop;

  select count(*)::integer into v_rider_state_count
  from public.race_stage_rider_states state_row
  where state_row.simulation_run_id = v_run.id;

  if v_rider_state_count <> jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb)) then
    raise exception 'Phase 11B rider-state persistence count mismatch: % stored vs % manifest.',
      v_rider_state_count,
      jsonb_array_length(coalesce(v_manifest -> 'riderStateRows', '[]'::jsonb));
  end if;

  v_fatigue_result := public.race_engine_apply_stage_fatigue_v1(v_run.id);
  v_supply_result := public.universal_race_stage_apply_phase9_supplies_v1(v_run.id);
  v_wear_result := public.race_engine_apply_stage_equipment_asset_wear_v1(v_run.id, false);
  v_health_result := public.universal_race_stage_apply_health_candidates_v1(v_run.id);

  insert into public.race_stage_results (
    race_id, stage_id, rider_id, team_id, rank, status,
    elapsed_seconds, gap_seconds, bonus_seconds, penalty_seconds,
    finish_points, sprint_points, mountain_points,
    rider_name_snapshot, team_name_snapshot,
    simulation_run_id, output_contract, created_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    nullif(row ->> 'rank', '')::integer,
    lower(coalesce(row ->> 'status', 'finished')),
    nullif(row ->> 'elapsedSeconds', '')::numeric::integer,
    nullif(row ->> 'gapSeconds', '')::numeric::integer,
    coalesce(nullif(row ->> 'bonusSeconds', '')::numeric::integer, 0),
    coalesce(nullif(row ->> 'penaltySeconds', '')::numeric::integer, 0),
    coalesce(nullif(row ->> 'finishPoints', '')::integer, 0),
    coalesce(nullif(row ->> 'sprintPoints', '')::integer, 0),
    coalesce(nullif(row ->> 'mountainPoints', '')::integer, 0),
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    v_run.id,
    'run_scoped_v1',
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,stageResults}', '[]'::jsonb)) row;
  get diagnostics v_stage_result_count = row_count;

  if v_stage_result_count = 0 then raise exception 'Phase 11B publication produced no stage result rows.'; end if;

  insert into public.race_stage_point_results (
    race_id, stage_id, point_id, rider_id, team_id, rank,
    points_awarded, bonus_seconds_awarded,
    rider_name_snapshot, team_name_snapshot, created_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'pointId', '')::uuid,
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    nullif(row ->> 'rank', '')::integer,
    coalesce(nullif(row ->> 'pointsAwarded', '')::integer, 0),
    coalesce(nullif(row ->> 'bonusSecondsAwarded', '')::integer, 0),
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,pointResults}', '[]'::jsonb)) row
  where coalesce(nullif(row ->> 'pointsAwarded', '')::integer, 0) <> 0
     or coalesce(nullif(row ->> 'bonusSecondsAwarded', '')::integer, 0) <> 0;
  get diagnostics v_point_result_count = row_count;

  insert into public.race_stage_report_events (
    race_id, stage_id, event_order, km_marker, race_time_label,
    event_type, title, description, rider_id, team_id,
    rider_name_snapshot, team_name_snapshot, metadata,
    created_at, updated_at
  )
  select
    v_run.race_id,
    v_run.stage_id,
    nullif(row ->> 'eventOrder', '')::integer,
    nullif(row ->> 'kmMarker', '')::numeric,
    null,
    case row ->> 'eventType'
      when 'race_start' then 'start'
      when 'phase_end' then 'summary'
      when 'finish_preparation' then 'summary'
      when 'race_status' then 'summary'
      when 'breakaway_formation' then 'breakaway'
      when 'peloton_control' then 'tactical_tempo'
      when 'group_split' then 'split'
      when 'late_chase' then 'tactical_chase'
      when 'bridge_attack' then 'tactical_attack'
      when 'bridge_progress' then 'tactical_chase'
      when 'bridge_merge' then 'catch'
      when 'incident' then 'tactical_incident_warning'
      when 'group_merge' then 'catch'
      else case
        when row ->> 'eventType' in (
          'attack', 'breakaway', 'catch', 'crash', 'finish', 'kom',
          'mechanical', 'neutral_start', 'split', 'sprint', 'start', 'summary',
          'tactical_attack', 'tactical_breakaway_attempt', 'tactical_chase',
          'tactical_command', 'tactical_equipment_wear',
          'tactical_incident_warning', 'tactical_leadout',
          'tactical_positioning', 'tactical_protection', 'tactical_safety',
          'tactical_sprint', 'tactical_tempo', 'weather'
        ) then row ->> 'eventType'
        else 'summary'
      end
    end,
    row ->> 'title',
    row ->> 'description',
    nullif(row ->> 'riderId', '')::uuid,
    nullif(row ->> 'teamId', '')::uuid,
    row ->> 'riderNameSnapshot',
    row ->> 'teamNameSnapshot',
    coalesce(row -> 'metadata', '{}'::jsonb) || jsonb_build_object(
      'simulation_run_id', v_run.id,
      'output_contract', 'universal_race_stage_output_v1',
      'universal_event_type', row ->> 'eventType'
    ),
    clock_timestamp(),
    clock_timestamp()
  from jsonb_array_elements(coalesce(v_output #> '{publication,reportEvents}', '[]'::jsonb)) row;
  get diagnostics v_report_event_count = row_count;

  update public.race_stage_simulation_runs
  set status = 'completed',
      completed_at = coalesce(completed_at, clock_timestamp()),
      failed_at = null,
      error_message = null,
      updated_at = clock_timestamp()
  where id = v_run.id;

  insert into public.race_stage_authoritative_runs (
    stage_id,
    simulation_run_id,
    race_id,
    engine_version,
    simulation_mode,
    authority_kind,
    approved_at,
    activated_at,
    approved_by,
    contract_version,
    metadata,
    created_at,
    updated_at
  ) values (
    v_run.stage_id,
    v_run.id,
    v_run.race_id,
    'race_engine_ts_v1',
    'deterministic_road_race_v1',
    'typescript_activation',
    clock_timestamp(),
    clock_timestamp(),
    current_user,
    'race_stage_authoritative_run_v1',
    jsonb_build_object(
      'universal_engine_key', 'ppm_universal_race_v1',
      'universal_engine_version', '1',
      'universal_output_contract', 'universal_race_stage_output_v1',
      'input_hash_md5', v_run.result_summary_json ->> 'input_hash_md5',
      'output_hash_md5', v_run.result_summary_json ->> 'output_hash_md5',
      'worker_version', 'netlify_phase11b_v1',
      'legacy_calculation_used', false,
      'legacy_replay_used', false,
      'legacy_commentary_used', false,
      'phase11_persistence_applied', true
    ),
    clock_timestamp(),
    clock_timestamp()
  );

  v_classification_result := public.race_engine_write_cumulative_classifications_v1(v_run.id);

  select not exists (
    select 1
    from public.race_stages later
    where later.race_id = v_run.race_id
      and later.stage_number > (
        select current_stage.stage_number
        from public.race_stages current_stage
        where current_stage.id = v_run.stage_id
      )
      and not coalesce(later.weather_cancelled, false)
  )
  into v_is_final_stage;

  perform public.race_engine_apply_international_points_after_stage_v1(v_run.stage_id);

  perform public.generate_race_prize_awards_v1(
    v_run.race_id,
    v_run.stage_id,
    v_is_final_stage
  );

  v_prize_payment_result := public.race_engine_pay_prize_awards_v1(
    v_run.race_id,
    v_run.stage_id
  );

  if v_is_final_stage then
    update public.races
    set status = 'completed',
        updated_at = clock_timestamp()
    where id = v_run.race_id;

    update public.race_entry_rules
    set applications_status = 'race_finished',
        updated_at = clock_timestamp()
    where race_id = v_run.race_id;
  end if;

  update public.race_stage_automation_state
  set last_status = 'published',
      last_published_at = clock_timestamp(),
      last_checked_at = clock_timestamp(),
      last_error = null,
      details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
        'results_published', true,
        'results_published_at_real', clock_timestamp(),
        'phase11_persistence_applied', true,
        'official_outputs_persisted', true,
        'stage_result_count', v_stage_result_count,
        'point_result_count', v_point_result_count,
        'report_event_count', v_report_event_count,
        'removed_setup_report_event_count', v_removed_setup_report_event_count,
        'rider_state_count', v_rider_state_count,
        'is_final_stage', v_is_final_stage
      ),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id;

  return jsonb_build_object(
    'status', 'published',
    'race_id', v_run.race_id,
    'stage_id', p_stage_id,
    'simulation_run_id', v_run.id,
    'stage_result_count', v_stage_result_count,
    'point_result_count', v_point_result_count,
    'report_event_count', v_report_event_count,
    'removed_setup_report_event_count', v_removed_setup_report_event_count,
    'rider_state_count', v_rider_state_count,
    'fatigue_result', v_fatigue_result,
    'supply_result', v_supply_result,
    'wear_result', v_wear_result,
    'health_result', v_health_result,
    'classification_result', v_classification_result,
    'is_final_stage', v_is_final_stage,
    'prize_payment_result', v_prize_payment_result
  );
end;
$function$;
