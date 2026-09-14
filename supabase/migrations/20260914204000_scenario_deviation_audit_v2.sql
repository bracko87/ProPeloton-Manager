-- Scenario deviation audit v2
-- Audit-only change. This function runs after the sporting calculation has been
-- submitted and only derives diagnostic metadata. It does not alter template
-- selection, race calculation, commands, tactics, rider abilities, energy,
-- incidents, probabilities, gaps, finishing order, or winners.
--
-- The detector is terrain-agnostic and consumes the common generated scenario
-- contract used by Flat, Hilly, Mountain and Cobbled V1 templates.

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
  v_same_time_share numeric := 0;
  v_fragmented_share numeric := 0;

  v_deviations jsonb := '[]'::jsonb;
  v_metrics jsonb;
  v_tolerance_km numeric;
  v_break_low_threshold numeric;
  v_break_high_threshold numeric;
  v_front_low_threshold numeric;
  v_front_high_threshold numeric;
  v_expected_catch boolean := false;
begin
  select *
  into v_scenario
  from public.race_engine_scenario_runs
  where stage_id = p_stage_id;

  if not found then
    return jsonb_build_object(
      'status', 'scenario_not_found',
      'deviations', '[]'::jsonb,
      'metrics', jsonb_build_object('audit_version', 'scenario_deviation_audit_v2')
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
    -- Intentionally broad: the scenario is a director, not an exact script.
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

  if v_classification_count > 0 then
    v_same_time_share := least(1, greatest(0, v_same_time_count::numeric / v_classification_count::numeric));
    v_fragmented_share := 1 - v_same_time_share;
  end if;

  if v_planned_size is not null then
    v_break_low_threshold := greatest(1, floor(v_planned_size * 0.60));
    v_break_high_threshold := greatest(v_planned_size + 2, ceil(v_planned_size * 1.50));
  end if;

  if v_target_front_group is not null then
    v_front_low_threshold := greatest(1, floor(v_target_front_group * 0.50));
    v_front_high_threshold := greatest(v_target_front_group + 8, ceil(v_target_front_group * 1.75));
  end if;

  v_expected_catch := v_planned_catch_km is not null
    or (v_planned_chase_start_km is not null and coalesce(v_planned_survival_sec, 0) <= 0);

  -- Break formation: failure includes no physical break or a materially late one.
  if v_planned_size is not null and v_planned_size >= 2
     and (v_first_positive_gap_km is null
       or (v_planned_formation_km is not null
         and v_first_positive_gap_km > v_planned_formation_km + v_tolerance_km)) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'early_break_failed',
      'severity', 'major',
      'expected', jsonb_build_object(
        'preferred_size', v_planned_size,
        'formation_km', case when v_planned_formation_km is null then null else round(v_planned_formation_km, 1) end
      ),
      'actual', jsonb_build_object(
        'max_break_size', v_max_break_size,
        'first_positive_gap_km', case when v_first_positive_gap_km is null then null else round(v_first_positive_gap_km, 1) end
      ),
      'explanation', case when v_first_positive_gap_km is null
        then 'The scenario called for an early break, but no positive physical breakaway gap was established.'
        else 'A physical breakaway formed materially later than the scenario formation target.' end
    ));
  end if;

  if v_planned_size is not null and v_planned_size >= 2 and v_max_break_size < v_break_low_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'break_size_below_target',
      'severity', 'major',
      'expected', jsonb_build_object('preferred_size', v_planned_size, 'material_floor', v_break_low_threshold),
      'actual', jsonb_build_object('max_break_size', v_max_break_size),
      'explanation', 'The largest observed breakaway was materially smaller than the generated scenario target.'
    ));
  elsif v_planned_size is not null and v_planned_size >= 2 and v_max_break_size > v_break_high_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'break_size_above_target',
      'severity', 'moderate',
      'expected', jsonb_build_object('preferred_size', v_planned_size, 'material_ceiling', v_break_high_threshold),
      'actual', jsonb_build_object('max_break_size', v_max_break_size),
      'explanation', 'The largest observed breakaway was materially larger than the generated scenario target.'
    ));
  end if;

  if v_planned_peak_gap_sec is not null and v_planned_peak_gap_sec > 0
     and v_peak_gap_sec < v_planned_peak_gap_sec * 0.60 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'peak_gap_undershot',
      'severity', 'major',
      'expected', jsonb_build_object('target_peak_gap_sec', round(v_planned_peak_gap_sec, 1)),
      'actual', jsonb_build_object('peak_physical_gap_sec', round(v_peak_gap_sec, 1)),
      'explanation', 'The breakaway never built the material advantage targeted by the scenario.'
    ));
  elsif v_planned_peak_gap_sec is not null and v_planned_peak_gap_sec > 0
     and v_peak_gap_sec > v_planned_peak_gap_sec * 1.60 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'peak_gap_overshot',
      'severity', 'moderate',
      'expected', jsonb_build_object('target_peak_gap_sec', round(v_planned_peak_gap_sec, 1)),
      'actual', jsonb_build_object('peak_physical_gap_sec', round(v_peak_gap_sec, 1)),
      'explanation', 'The breakaway gained a materially larger maximum advantage than the scenario target.'
    ));
  end if;

  if v_catch_km is not null and (
       (v_planned_chase_start_km is not null
         and v_catch_km < v_planned_chase_start_km - greatest(5, v_tolerance_km * 0.50))
       or
       (v_planned_catch_km is not null
         and v_catch_km < v_planned_catch_km - v_tolerance_km)
     ) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'break_caught_early',
      'severity', 'major',
      'expected', jsonb_build_object(
        'planned_chase_start_km', case when v_planned_chase_start_km is null then null else round(v_planned_chase_start_km, 1) end,
        'planned_catch_km', case when v_planned_catch_km is null then null else round(v_planned_catch_km, 1) end
      ),
      'actual', jsonb_build_object('physical_catch_km', round(v_catch_km, 1)),
      'explanation', 'The breakaway was physically caught materially earlier than the planned chase/catch story.'
    ));
  end if;

  if v_breakaway_survived and v_expected_catch then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'break_survived_unexpectedly',
      'severity', 'major',
      'expected', jsonb_build_object(
        'planned_catch_km', case when v_planned_catch_km is null then null else round(v_planned_catch_km, 1) end,
        'survival_target_sec', v_planned_survival_sec
      ),
      'actual', jsonb_build_object('breakaway_survived', true, 'breakaway_caught', v_breakaway_caught),
      'explanation', 'The scenario expected the break to be caught, but the physical breakaway survived the finish phase.'
    ));
  end if;

  -- Front-group checks use the official same-time group as the stable generic
  -- post-race proxy available for every terrain type.
  if v_target_front_group is not null and v_target_front_group > 0
     and v_same_time_count > v_front_high_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'front_group_larger_than_target',
      'severity', 'major',
      'expected', jsonb_build_object('target_front_group', v_target_front_group, 'material_ceiling', v_front_high_threshold),
      'actual', jsonb_build_object('same_time_rider_count', v_same_time_count, 'classification_rider_count', v_classification_count),
      'explanation', 'The official front same-time group was materially larger than the scenario target.'
    ));
  elsif v_target_front_group is not null and v_target_front_group >= 6
     and v_same_time_count < v_front_low_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'front_group_smaller_than_target',
      'severity', 'moderate',
      'expected', jsonb_build_object('target_front_group', v_target_front_group, 'material_floor', v_front_low_threshold),
      'actual', jsonb_build_object('same_time_rider_count', v_same_time_count, 'classification_rider_count', v_classification_count),
      'explanation', 'The official front same-time group was materially smaller than the scenario target.'
    ));
  end if;

  if v_fragmentation_pressure is not null and v_classification_count > 0
     and v_fragmentation_pressure >= 0.50
     and v_fragmented_share < greatest(0.08, v_fragmentation_pressure * 0.30) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'fragmentation_below_target',
      'severity', 'moderate',
      'expected', jsonb_build_object('fragmentation_pressure', round(v_fragmentation_pressure, 4)),
      'actual', jsonb_build_object('fragmented_share', round(v_fragmented_share, 4), 'same_time_share', round(v_same_time_share, 4)),
      'explanation', 'The field remained materially more compact than the scenario fragmentation pressure called for.'
    ));
  elsif v_fragmentation_pressure is not null and v_classification_count > 0
     and v_fragmentation_pressure <= 0.50
     and v_fragmented_share > least(0.80, v_fragmentation_pressure + 0.35) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'fragmentation_above_target',
      'severity', 'moderate',
      'expected', jsonb_build_object('fragmentation_pressure', round(v_fragmentation_pressure, 4)),
      'actual', jsonb_build_object('fragmented_share', round(v_fragmented_share, 4), 'same_time_share', round(v_same_time_share, 4)),
      'explanation', 'The field split materially more than the scenario fragmentation pressure called for.'
    ));
  end if;

  if v_classification_count > 0
     and v_target_front_group is not null
     and v_target_front_group <= 30
     and v_same_time_count >= greatest(40, ceil(v_classification_count * 0.60))
     and not v_breakaway_survived then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'finale_converted_to_large_group_sprint',
      'severity', 'major',
      'expected', jsonb_build_object('target_front_group', v_target_front_group, 'template_family', v_scenario.template_family),
      'actual', jsonb_build_object('same_time_rider_count', v_same_time_count, 'same_time_share', round(v_same_time_share, 4), 'breakaway_survived', false),
      'explanation', 'A scenario targeting a selective finale resolved as a large same-time group finish.'
    ));
  end if;

  if v_breakaway_survived
     and lower(coalesce(v_scenario.template_family, '')) <> 'breakaway'
     and coalesce(v_planned_survival_sec, 0) <= 0 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object(
      'code', 'finale_converted_to_breakaway',
      'severity', 'major',
      'expected', jsonb_build_object('template_family', v_scenario.template_family, 'survival_target_sec', v_planned_survival_sec),
      'actual', jsonb_build_object('breakaway_survived', true, 'same_time_rider_count', v_same_time_count),
      'explanation', 'A scenario not targeting a surviving breakaway ended with the physical break still alive in the finish phase.'
    ));
  end if;

  v_metrics := jsonb_build_object(
    'audit_version', 'scenario_deviation_audit_v2',
    'template_id', v_scenario.template_id,
    'scenario_type', v_scenario.scenario_type,
    'template_family', v_scenario.template_family,
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
      'classification_rider_count', v_classification_count,
      'same_time_share', round(v_same_time_share, 4),
      'fragmented_share', round(v_fragmented_share, 4)
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

comment on function public.universal_race_stage_scenario_audit_v1(uuid, uuid, jsonb) is
  'Audit-only deterministic scenario deviation detector v2. Reads completed universal result data and generated scenario targets for Flat/Hilly/Mountain/Cobbled; never changes sporting behavior.';
