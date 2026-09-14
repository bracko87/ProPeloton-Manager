-- Scenario deviation audit v1
-- Audit-only change: this migration does not alter race calculation, template
-- selection, commands, probabilities, gaps, winners, or persistence of sporting
-- results. It derives diagnostic metadata after the authoritative calculation
-- has already been submitted.

create or replace function public.universal_race_stage_scenario_audit_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_actual_outcome jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_scenario public.race_engine_scenario_runs%rowtype;
  v_result jsonb;
  v_rr jsonb;
  v_generated jsonb;
  v_break jsonb;

  v_distance_km numeric;
  v_planned_formation_pct numeric;
  v_planned_formation_km numeric;
  v_planned_size numeric;
  v_planned_peak_gap_sec numeric;
  v_planned_chase_start_pct numeric;
  v_planned_chase_start_km numeric;
  v_planned_catch_km_remaining numeric;
  v_planned_catch_km numeric;
  v_planned_survival_sec numeric;
  v_target_front_group numeric;
  v_fragmentation_pressure numeric;

  v_p1_break_size integer := 0;
  v_max_break_size integer := 0;
  v_peak_gap_sec numeric := 0;
  v_first_positive_gap_km numeric;
  v_catch_km numeric;
  v_breakaway_caught boolean := false;
  v_breakaway_survived boolean := false;
  v_same_time_count integer := 0;
  v_classification_count integer := 0;

  v_deviations jsonb := '[]'::jsonb;
  v_metrics jsonb;
  v_tolerance_km numeric;
begin
  select *
  into v_scenario
  from public.race_engine_scenario_runs
  where stage_id = p_stage_id;

  if not found then
    return jsonb_build_object(
      'status', 'scenario_not_found',
      'deviations', '[]'::jsonb,
      'metrics', jsonb_build_object('audit_version', 'scenario_deviation_audit_v1')
    );
  end if;

  select sr.result_summary_json #> '{output_snapshot,universalResult}'
  into v_result
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
    and sr.stage_id = p_stage_id
  limit 1;

  v_generated := coalesce(v_scenario.generated_parameters_json, '{}'::jsonb);
  v_break := coalesce(v_generated -> 'breakaways' -> 0, '{}'::jsonb);
  v_rr := coalesce(v_result -> 'roadRaceResolution', '{}'::jsonb);

  v_distance_km := nullif(v_scenario.context_snapshot_json #>> '{profile,distanceKm}', '')::numeric;
  v_planned_formation_pct := nullif(v_break ->> 'formationPct', '')::numeric;
  v_planned_size := nullif(v_break ->> 'preferredSize', '')::numeric;
  v_planned_peak_gap_sec := nullif(v_break ->> 'targetPeakGapSec', '')::numeric;
  v_planned_chase_start_pct := nullif(v_break ->> 'chaseStartPct', '')::numeric;
  v_planned_catch_km_remaining := nullif(v_break ->> 'catchKmRemaining', '')::numeric;
  v_planned_survival_sec := nullif(v_break ->> 'survivalTargetSec', '')::numeric;
  v_target_front_group := nullif(v_generated ->> 'targetFrontGroup', '')::numeric;
  v_fragmentation_pressure := nullif(v_generated ->> 'fragmentationPressure', '')::numeric;

  if v_distance_km is not null then
    if v_planned_formation_pct is not null then
      v_planned_formation_km := v_distance_km * v_planned_formation_pct;
    end if;
    if v_planned_chase_start_pct is not null then
      v_planned_chase_start_km := v_distance_km * v_planned_chase_start_pct;
    end if;
    if v_planned_catch_km_remaining is not null then
      v_planned_catch_km := greatest(0, v_distance_km - v_planned_catch_km_remaining);
    end if;
    v_tolerance_km := greatest(10, v_distance_km * 0.10);
  else
    v_tolerance_km := 12;
  end if;

  v_p1_break_size := case
    when jsonb_typeof(v_rr #> '{phase1Opening,breakawayRiderIds}') = 'array'
      then jsonb_array_length(v_rr #> '{phase1Opening,breakawayRiderIds}')
    else 0
  end;

  v_max_break_size := greatest(
    v_p1_break_size,
    case when jsonb_typeof(v_rr #> '{phase2Development,breakawayRiderIdsAtStart}') = 'array'
      then jsonb_array_length(v_rr #> '{phase2Development,breakawayRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase2Development,breakawayRiderIdsAtEnd}') = 'array'
      then jsonb_array_length(v_rr #> '{phase2Development,breakawayRiderIdsAtEnd}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtStart}') = 'array'
      then jsonb_array_length(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtEnd}') = 'array'
      then jsonb_array_length(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtEnd}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase4Finish,escapeRiderIdsAtStart}') = 'array'
      then jsonb_array_length(v_rr #> '{phase4Finish,escapeRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase4Finish,frontRiderIdsAfterBridges}') = 'array'
      then jsonb_array_length(v_rr #> '{phase4Finish,frontRiderIdsAfterBridges}') else 0 end
  );

  select
    coalesce(max(q.gap_seconds), 0),
    min(q.km_from_start) filter (where q.gap_seconds > 0)
  into v_peak_gap_sec, v_first_positive_gap_km
  from (
    select
      nullif(e ->> 'gapSeconds', '')::numeric as gap_seconds,
      nullif(e ->> 'kmFromStart', '')::numeric as km_from_start
    from jsonb_array_elements(
      case when jsonb_typeof(v_rr #> '{phase1Opening,physicalGapTrajectory}') = 'array'
        then v_rr #> '{phase1Opening,physicalGapTrajectory}' else '[]'::jsonb end
    ) e
    union all
    select
      nullif(e ->> 'gapSeconds', '')::numeric,
      nullif(e ->> 'kmFromStart', '')::numeric
    from jsonb_array_elements(
      case when jsonb_typeof(v_rr #> '{phase2Development,physicalGapTrajectory}') = 'array'
        then v_rr #> '{phase2Development,physicalGapTrajectory}' else '[]'::jsonb end
    ) e
    union all
    select
      nullif(e ->> 'gapSeconds', '')::numeric,
      nullif(e ->> 'kmFromStart', '')::numeric
    from jsonb_array_elements(
      case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalGapTrajectory}') = 'array'
        then v_rr #> '{phase3Decisive,physicalGapTrajectory}' else '[]'::jsonb end
    ) e
  ) q;

  v_peak_gap_sec := greatest(
    coalesce(v_peak_gap_sec, 0),
    coalesce(nullif(v_rr #>> '{phase4Finish,startGapSeconds}', '')::numeric, 0),
    coalesce(nullif(v_rr #>> '{phase4Finish,endGapSeconds}', '')::numeric, 0)
  );

  v_catch_km := coalesce(
    nullif(v_rr #>> '{phase2Development,breakawayCatchKm}', '')::numeric,
    nullif(v_rr #>> '{phase3Decisive,physicalCatchKm}', '')::numeric
  );
  v_breakaway_caught := coalesce(nullif(v_rr #>> '{phase4Finish,breakawayCaught}', '')::boolean, false);
  v_breakaway_survived := coalesce(nullif(v_rr #>> '{phase4Finish,breakawaySurvived}', '')::boolean, false);
  v_same_time_count := coalesce(nullif(p_actual_outcome ->> 'same_time_rider_count', '')::integer, 0);
  v_classification_count := coalesce(nullif(p_actual_outcome ->> 'classification_rider_count', '')::integer, 0);

  -- The following checks are deliberately broad. Templates direct the macro story;
  -- they do not force an exact script. We record only material divergences.
  if v_planned_size is not null and v_planned_size >= 2 and v_first_positive_gap_km is null then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'planned_break_not_formed',
      'severity', 'major',
      'expected', jsonb_build_object('preferred_size', v_planned_size, 'formation_km', round(v_planned_formation_km, 1)),
      'actual', jsonb_build_object('max_break_size', v_max_break_size, 'first_positive_gap_km', null)
    ));
  elsif v_planned_formation_km is not null
    and v_first_positive_gap_km is not null
    and v_first_positive_gap_km > v_planned_formation_km + v_tolerance_km then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'break_formed_late',
      'severity', 'major',
      'expected', jsonb_build_object('formation_km', round(v_planned_formation_km, 1)),
      'actual', jsonb_build_object('first_positive_gap_km', round(v_first_positive_gap_km, 1))
    ));
  end if;

  if v_planned_size is not null
    and v_planned_size >= 2
    and v_max_break_size < greatest(1, floor(v_planned_size * 0.50)) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'break_size_below_plan',
      'severity', 'major',
      'expected', jsonb_build_object('preferred_size', v_planned_size),
      'actual', jsonb_build_object('max_break_size', v_max_break_size)
    ));
  end if;

  if v_planned_peak_gap_sec is not null
    and v_planned_peak_gap_sec > 0
    and v_peak_gap_sec < v_planned_peak_gap_sec * 0.50 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'peak_gap_below_plan',
      'severity', 'major',
      'expected', jsonb_build_object('target_peak_gap_sec', round(v_planned_peak_gap_sec, 1)),
      'actual', jsonb_build_object('peak_physical_gap_sec', round(v_peak_gap_sec, 1))
    ));
  elsif v_planned_peak_gap_sec is not null
    and v_planned_peak_gap_sec > 0
    and v_peak_gap_sec > v_planned_peak_gap_sec * 1.75 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'peak_gap_above_plan',
      'severity', 'moderate',
      'expected', jsonb_build_object('target_peak_gap_sec', round(v_planned_peak_gap_sec, 1)),
      'actual', jsonb_build_object('peak_physical_gap_sec', round(v_peak_gap_sec, 1))
    ));
  end if;

  if v_catch_km is not null
    and v_planned_chase_start_km is not null
    and v_catch_km < v_planned_chase_start_km - greatest(5, v_tolerance_km * 0.50) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'break_caught_before_planned_chase_window',
      'severity', 'major',
      'expected', jsonb_build_object('planned_chase_start_km', round(v_planned_chase_start_km, 1)),
      'actual', jsonb_build_object('physical_catch_km', round(v_catch_km, 1))
    ));
  end if;

  if v_catch_km is not null
    and v_planned_catch_km is not null
    and abs(v_catch_km - v_planned_catch_km) > v_tolerance_km then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'catch_timing_outside_plan',
      'severity', 'moderate',
      'expected', jsonb_build_object('planned_catch_km', round(v_planned_catch_km, 1)),
      'actual', jsonb_build_object('physical_catch_km', round(v_catch_km, 1))
    ));
  end if;

  if v_planned_survival_sec is not null
    and v_planned_survival_sec > 0
    and not v_breakaway_survived then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'planned_break_did_not_survive',
      'severity', 'major',
      'expected', jsonb_build_object('survival_target_sec', v_planned_survival_sec),
      'actual', jsonb_build_object('breakaway_survived', false, 'breakaway_caught', v_breakaway_caught)
    ));
  end if;

  if v_target_front_group is not null
    and v_target_front_group > 0
    and v_same_time_count > greatest(v_target_front_group * 3, v_target_front_group + 12) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'front_group_much_larger_than_plan',
      'severity', 'major',
      'expected', jsonb_build_object('target_front_group', v_target_front_group),
      'actual', jsonb_build_object('same_time_rider_count', v_same_time_count, 'classification_rider_count', v_classification_count)
    ));
  end if;

  if v_fragmentation_pressure is not null
    and v_fragmentation_pressure >= 0.70
    and v_classification_count > 0
    and v_same_time_count::numeric / v_classification_count::numeric >= 0.75 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'fragmentation_below_plan',
      'severity', 'moderate',
      'expected', jsonb_build_object('fragmentation_pressure', v_fragmentation_pressure),
      'actual', jsonb_build_object('same_time_share', round(v_same_time_count::numeric / v_classification_count::numeric, 3))
    ));
  end if;

  v_metrics := jsonb_build_object(
    'audit_version', 'scenario_deviation_audit_v1',
    'template_id', v_scenario.template_id,
    'scenario_type', v_scenario.scenario_type,
    'planned', jsonb_build_object(
      'formation_km', case when v_planned_formation_km is null then null else round(v_planned_formation_km, 1) end,
      'preferred_break_size', v_planned_size,
      'target_peak_gap_sec', v_planned_peak_gap_sec,
      'planned_chase_start_km', case when v_planned_chase_start_km is null then null else round(v_planned_chase_start_km, 1) end,
      'planned_catch_km', case when v_planned_catch_km is null then null else round(v_planned_catch_km, 1) end,
      'survival_target_sec', v_planned_survival_sec,
      'target_front_group', v_target_front_group,
      'fragmentation_pressure', v_fragmentation_pressure
    ),
    'actual', jsonb_build_object(
      'phase1_break_size', v_p1_break_size,
      'max_break_size', v_max_break_size,
      'first_positive_gap_km', case when v_first_positive_gap_km is null then null else round(v_first_positive_gap_km, 1) end,
      'peak_physical_gap_sec', round(v_peak_gap_sec, 1),
      'physical_catch_km', case when v_catch_km is null then null else round(v_catch_km, 1) end,
      'breakaway_caught', v_breakaway_caught,
      'breakaway_survived', v_breakaway_survived,
      'same_time_rider_count', v_same_time_count,
      'classification_rider_count', v_classification_count
    ),
    'deviation_count', jsonb_array_length(v_deviations)
  );

  return jsonb_build_object(
    'status', 'completed',
    'deviations', v_deviations,
    'metrics', v_metrics
  );
end;
$function$;

create or replace function public.universal_race_stage_finalize_scenario_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_actual_outcome jsonb default '{}'::jsonb,
  p_deviations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_updated public.race_engine_scenario_runs%rowtype;
  v_audit jsonb;
  v_computed_deviations jsonb := '[]'::jsonb;
  v_effective_deviations jsonb := '[]'::jsonb;
  v_effective_outcome jsonb := coalesce(p_actual_outcome, '{}'::jsonb);
begin
  v_audit := public.universal_race_stage_scenario_audit_v1(
    p_stage_id,
    p_simulation_run_id,
    coalesce(p_actual_outcome, '{}'::jsonb)
  );

  if jsonb_typeof(v_audit -> 'deviations') = 'array' then
    v_computed_deviations := v_audit -> 'deviations';
  end if;

  -- Preserve explicitly supplied deviations from a future runner version.
  -- Today the runner passes [], so the database-derived audit is used.
  if p_deviations is null or p_deviations = '[]'::jsonb then
    v_effective_deviations := v_computed_deviations;
  else
    v_effective_deviations := p_deviations;
  end if;

  v_effective_outcome := v_effective_outcome || jsonb_build_object(
    'scenario_audit_v1', coalesce(v_audit -> 'metrics', '{}'::jsonb)
  );

  update public.race_engine_scenario_runs
  set simulation_run_id = p_simulation_run_id,
      selection_status = 'completed',
      actual_outcome_json = v_effective_outcome,
      scenario_deviations_json = v_effective_deviations,
      completed_at = coalesce(completed_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status', 'not_found', 'stage_id', p_stage_id);
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'stage_id', p_stage_id,
    'template_id', v_updated.template_id,
    'deviation_count', jsonb_array_length(v_effective_deviations),
    'audit_version', 'scenario_deviation_audit_v1'
  );
end;
$function$;

comment on function public.universal_race_stage_scenario_audit_v1(uuid, uuid, jsonb)
is 'Post-calculation diagnostic only. Compares persisted scenario targets with authoritative physical race output and does not alter sporting results.';

comment on function public.universal_race_stage_finalize_scenario_v1(uuid, uuid, jsonb, jsonb)
is 'Finalizes scenario audit metadata. If runner supplies no deviations, derives material deviations from authoritative race output; no sporting calculation is changed.';
