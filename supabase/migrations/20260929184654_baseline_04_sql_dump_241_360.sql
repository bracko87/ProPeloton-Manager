set check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.race_engine_get_stage_attack_launch_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9, p_candidate_score_threshold numeric DEFAULT 60, p_max_candidates_per_step integer DEFAULT 12, p_opportunity_window_km numeric DEFAULT 5, p_rider_cooldown_km numeric DEFAULT 20, p_team_cooldown_km numeric DEFAULT 12, p_max_stage_attempts integer DEFAULT 6, p_max_team_attempts integer DEFAULT 2, p_max_attempts_per_window integer DEFAULT 3)
 RETURNS TABLE(race_id uuid, stage_id uuid, attack_attempt_event_key text, attack_launch_event_key text, attack_wave_number integer, attack_wave_size integer, successful_riders_in_wave integer, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, rider_attempt_sequence integer, raw_successful_attempt_sequence integer, prior_successful_attempt_count integer, team_attempt_sequence integer, stage_attempt_rank integer, selected_step_order integer, selected_phase_number integer, selected_km_end numeric, attack_intent_score numeric, attack_execution_skill_score numeric, attack_success_probability numeric, deterministic_outcome_roll numeric, raw_attack_succeeded boolean, is_physically_valid_attempt boolean, is_accepted_escape_launch boolean, requires_catch_before_future_attempt boolean, accepted_launch_rank integer, accepted_launch_wave_number integer, accepted_launch_wave_size integer, projected_burst_speed_multiplier numeric, projected_burst_duration_seconds numeric, projected_speed_advantage_fraction numeric, raw_projected_initial_gap_seconds numeric, effective_projected_initial_gap_seconds numeric, initial_separation_band text, projected_attack_energy_cost_pct numeric, energy_after_step numeric, raw_projected_energy_after_attempt numeric, effective_projected_energy_after_attempt numeric, attack_effort_applied boolean, attack_launch_state_code text, attack_launch_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with

outcome_rows as materialized (
  select *
  from public.race_engine_get_stage_attack_outcome_preview_v2(
    p_stage_id,

    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds,

    p_candidate_score_threshold,
    p_max_candidates_per_step,

    p_opportunity_window_km,
    p_rider_cooldown_km,
    p_team_cooldown_km,

    p_max_stage_attempts,
    p_max_team_attempts,
    p_max_attempts_per_window
  )
),

/*
 * Count successful outcomes before and through each rider attempt.
 *
 * Once a rider has successfully escaped, every later attempt is suppressed
 * until a later phase explicitly determines that the rider was caught.
 */
sequenced_rows as (
  select
    outcome.*,

    count(*) filter (
      where outcome.attack_succeeded
    ) over (
      partition by outcome.rider_id

      order by
        outcome.selected_step_order,
        outcome.stage_attempt_rank,
        outcome.attack_attempt_event_key

      rows between unbounded preceding
        and current row
    )::integer as successful_attempt_count_through_row,

    count(*) filter (
      where outcome.attack_succeeded
    ) over (
      partition by outcome.rider_id

      order by
        outcome.selected_step_order,
        outcome.stage_attempt_rank,
        outcome.attack_attempt_event_key

      rows between unbounded preceding
        and 1 preceding
    )::integer as prior_successful_attempt_count_raw

  from outcome_rows outcome
),

state_rows as (
  select
    sequenced.*,

    coalesce(
      sequenced.prior_successful_attempt_count_raw,
      0
    )::integer as prior_successful_attempt_count,

    (
      coalesce(
        sequenced.prior_successful_attempt_count_raw,
        0
      ) = 0
    ) as is_physically_valid_attempt,

    (
      sequenced.attack_succeeded

      and coalesce(
        sequenced.prior_successful_attempt_count_raw,
        0
      ) = 0
    ) as is_accepted_escape_launch,

    (
      coalesce(
        sequenced.prior_successful_attempt_count_raw,
        0
      ) > 0
    ) as requires_catch_before_future_attempt,

    case
      when sequenced.attack_succeeded
      then sequenced.successful_attempt_count_through_row

      else null::integer
    end as raw_successful_attempt_sequence

  from sequenced_rows sequenced
),

accepted_rows as (
  select
    state.attack_attempt_event_key,
    state.selected_step_order,

    row_number() over (
      order by
        state.selected_step_order,
        state.stage_attempt_rank,
        state.rider_id
    )::integer as accepted_launch_rank,

    dense_rank() over (
      order by state.selected_step_order
    )::integer as accepted_launch_wave_number

  from state_rows state

  where state.is_accepted_escape_launch
),

accepted_wave_sizes as (
  select
    accepted.accepted_launch_wave_number,

    count(*)::integer
      as accepted_launch_wave_size

  from accepted_rows accepted

  group by accepted.accepted_launch_wave_number
),

enriched_rows as (
  select
    state.*,

    accepted.accepted_launch_rank,
    accepted.accepted_launch_wave_number,

    wave_size.accepted_launch_wave_size,

    md5(
      state.attack_attempt_event_key
      || '|stateful_escape_launch_v2'
    ) as attack_launch_event_key

  from state_rows state

  left join accepted_rows accepted
    on accepted.attack_attempt_event_key =
      state.attack_attempt_event_key

  left join accepted_wave_sizes wave_size
    on wave_size.accepted_launch_wave_number =
      accepted.accepted_launch_wave_number
),

projected_rows as (
  select
    enriched.*,

    projection.normalized_burst_speed_multiplier,
    projection.normalized_burst_duration_seconds,

    projection.projected_speed_advantage_fraction,

    projection.raw_projected_initial_gap_seconds,
    projection.effective_projected_initial_gap_seconds,

    projection.raw_projected_energy_after_attempt,
    projection.effective_projected_energy_after_attempt,

    projection.attack_effort_applied,
    projection.initial_separation_band

  from enriched_rows enriched

  cross join lateral
    public.race_engine_calculate_attack_launch_components_v2(
      enriched.is_physically_valid_attempt,
      enriched.attack_succeeded,
      enriched.is_accepted_escape_launch,

      enriched.projected_burst_speed_multiplier,
      enriched.projected_burst_duration_seconds,

      enriched.projected_attack_energy_cost_pct,
      enriched.energy_after_step
    ) projection
)

select
  projected.race_id,
  projected.stage_id,

  projected.attack_attempt_event_key,
  projected.attack_launch_event_key,

  projected.attack_wave_number,
  projected.attack_wave_size,
  projected.successful_riders_in_wave,

  projected.rider_id,
  projected.team_id,
  projected.rider_name,
  projected.team_name,
  projected.role_code,

  projected.rider_attempt_sequence,
  projected.raw_successful_attempt_sequence,
  projected.prior_successful_attempt_count,

  projected.team_attempt_sequence,
  projected.stage_attempt_rank,

  projected.selected_step_order,
  projected.selected_phase_number,
  projected.selected_km_end,

  projected.attack_intent_score,
  projected.attack_execution_skill_score,

  projected.attack_success_probability,
  projected.deterministic_outcome_roll,

  projected.attack_succeeded
    as raw_attack_succeeded,

  projected.is_physically_valid_attempt,
  projected.is_accepted_escape_launch,
  projected.requires_catch_before_future_attempt,

  projected.accepted_launch_rank,
  projected.accepted_launch_wave_number,
  projected.accepted_launch_wave_size,

  projected.normalized_burst_speed_multiplier
    as projected_burst_speed_multiplier,

  projected.normalized_burst_duration_seconds
    as projected_burst_duration_seconds,

  projected.projected_speed_advantage_fraction,

  projected.raw_projected_initial_gap_seconds,
  projected.effective_projected_initial_gap_seconds,
  projected.initial_separation_band,

  projected.projected_attack_energy_cost_pct,
  projected.energy_after_step,

  projected.raw_projected_energy_after_attempt,
  projected.effective_projected_energy_after_attempt,
  projected.attack_effort_applied,

  case
    when projected.requires_catch_before_future_attempt
    then 'suppressed_pending_catch_resolution'

    when projected.is_accepted_escape_launch
    then 'accepted_escape_launch'

    when projected.is_physically_valid_attempt
     and not projected.attack_succeeded
    then 'valid_attack_failed'

    else 'not_applied'
  end::text as attack_launch_state_code,

  'stateful_escape_launch_preview_v2_2026_07'::text
    as attack_launch_model_version

from projected_rows projected

order by
  projected.selected_step_order,
  projected.stage_attempt_rank,
  projected.rider_name,
  projected.rider_id;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_escape_step_components_v2(p_distance_km numeric, p_baseline_peloton_pace_kmh numeric, p_rider_free_speed_kmh numeric, p_peloton_response_speed_multiplier numeric, p_attack_energy_cost_pct numeric)
 RETURNS TABLE(normalized_distance_km numeric, normalized_peloton_response_speed_multiplier numeric, post_attack_speed_penalty_fraction numeric, post_attack_rider_speed_multiplier numeric, effective_peloton_pace_kmh numeric, effective_escape_rider_pace_kmh numeric, effective_peloton_step_seconds numeric, effective_escape_rider_step_seconds numeric, projected_gap_delta_seconds numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    greatest(
      0.001::numeric,
      coalesce(
        p_distance_km,
        0.5::numeric
      )
    ) as distance_km,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_baseline_peloton_pace_kmh,
          40::numeric
        )
      )
    ) as baseline_peloton_pace_kmh,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_rider_free_speed_kmh,
          38::numeric
        )
      )
    ) as rider_free_speed_kmh,

    greatest(
      0.85::numeric,
      least(
        1.05::numeric,
        coalesce(
          p_peloton_response_speed_multiplier,
          1::numeric
        )
      )
    ) as peloton_response_speed_multiplier,

    greatest(
      0::numeric,
      least(
        30::numeric,
        coalesce(
          p_attack_energy_cost_pct,
          0::numeric
        )
      )
    ) as attack_energy_cost_pct
),

adjusted as (
  select
    normalized.*,

    least(
      0.03::numeric,

      normalized.attack_energy_cost_pct
      * 0.002::numeric
    ) as post_attack_speed_penalty_fraction

  from normalized
),

speed_rows as (
  select
    adjusted.*,

    greatest(
      0.90::numeric,

      1::numeric
      - adjusted.post_attack_speed_penalty_fraction
    ) as post_attack_rider_speed_multiplier,

    adjusted.baseline_peloton_pace_kmh
    * adjusted.peloton_response_speed_multiplier
      as effective_peloton_pace_kmh,

    adjusted.rider_free_speed_kmh
    *
    greatest(
      0.90::numeric,

      1::numeric
      - adjusted.post_attack_speed_penalty_fraction
    ) as effective_escape_rider_pace_kmh

  from adjusted
),

time_rows as (
  select
    speed.*,

    (
      speed.distance_km
      /
      nullif(
        speed.effective_peloton_pace_kmh,
        0::numeric
      )
      * 3600::numeric
    ) as effective_peloton_step_seconds,

    (
      speed.distance_km
      /
      nullif(
        speed.effective_escape_rider_pace_kmh,
        0::numeric
      )
      * 3600::numeric
    ) as effective_escape_rider_step_seconds

  from speed_rows speed
)

select
  round(
    time_row.distance_km,
    6
  ) as normalized_distance_km,

  round(
    time_row.peloton_response_speed_multiplier,
    6
  ) as normalized_peloton_response_speed_multiplier,

  round(
    time_row.post_attack_speed_penalty_fraction,
    6
  ) as post_attack_speed_penalty_fraction,

  round(
    time_row.post_attack_rider_speed_multiplier,
    6
  ) as post_attack_rider_speed_multiplier,

  round(
    time_row.effective_peloton_pace_kmh,
    6
  ) as effective_peloton_pace_kmh,

  round(
    time_row.effective_escape_rider_pace_kmh,
    6
  ) as effective_escape_rider_pace_kmh,

  round(
    time_row.effective_peloton_step_seconds,
    6
  ) as effective_peloton_step_seconds,

  round(
    time_row.effective_escape_rider_step_seconds,
    6
  ) as effective_escape_rider_step_seconds,

  round(
    time_row.effective_peloton_step_seconds
    - time_row.effective_escape_rider_step_seconds,
    6
  ) as projected_gap_delta_seconds

from time_rows time_row;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_escape_survival_preview_v2(p_stage_id uuid, p_target_step_km numeric DEFAULT 0.5, p_assumed_peloton_exposure_fraction numeric DEFAULT 0.25, p_neutral_km numeric DEFAULT 12, p_group_gap_threshold_seconds numeric DEFAULT 9, p_candidate_score_threshold numeric DEFAULT 60, p_max_candidates_per_step integer DEFAULT 12, p_opportunity_window_km numeric DEFAULT 5, p_rider_cooldown_km numeric DEFAULT 20, p_team_cooldown_km numeric DEFAULT 12, p_max_stage_attempts integer DEFAULT 6, p_max_team_attempts integer DEFAULT 2, p_max_attempts_per_window integer DEFAULT 3, p_catch_threshold_seconds numeric DEFAULT 0.5, p_full_pursuit_multiplier numeric DEFAULT 1, p_controlled_response_multiplier numeric DEFAULT 0.985, p_release_response_multiplier numeric DEFAULT 0.97)
 RETURNS TABLE(race_id uuid, stage_id uuid, attack_launch_event_key text, accepted_launch_rank integer, rider_id uuid, team_id uuid, rider_name text, team_name text, role_code text, launch_step_order integer, launch_km numeric, initial_gap_seconds numeric, attack_energy_cost_pct numeric, response_scenario_code text, response_scenario_rank integer, peloton_response_speed_multiplier numeric, step_order integer, km_end numeric, distance_km numeric, terrain_type text, slope_percent numeric, baseline_peloton_pace_kmh numeric, rider_free_speed_kmh numeric, post_attack_speed_penalty_fraction numeric, post_attack_rider_speed_multiplier numeric, effective_peloton_pace_kmh numeric, effective_escape_rider_pace_kmh numeric, effective_peloton_step_seconds numeric, effective_escape_rider_step_seconds numeric, projected_gap_delta_seconds numeric, raw_projected_gap_seconds numeric, effective_projected_gap_seconds numeric, catch_threshold_seconds numeric, projected_catch_step_order integer, projected_catch_km numeric, projected_escape_duration_km numeric, is_escape_active boolean, is_projected_catch_step boolean, survived_to_finish boolean, escape_survival_model_version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with

parameters as (
  select
    greatest(
      0::numeric,
      coalesce(
        p_catch_threshold_seconds,
        0.5::numeric
      )
    ) as catch_threshold_seconds
),

scenario_rows as (
  select
    scenario_value.scenario_code,
    scenario_value.scenario_rank,

    greatest(
      0.85::numeric,
      least(
        1.05::numeric,
        scenario_value.scenario_multiplier
      )
    ) as peloton_response_speed_multiplier

  from (
    values
      (
        'full_pursuit'::text,
        1::integer,
        coalesce(
          p_full_pursuit_multiplier,
          1::numeric
        )
      ),

      (
        'controlled_response'::text,
        2::integer,
        coalesce(
          p_controlled_response_multiplier,
          0.985::numeric
        )
      ),

      (
        'release_response'::text,
        3::integer,
        coalesce(
          p_release_response_multiplier,
          0.97::numeric
        )
      )
  ) as scenario_value (
    scenario_code,
    scenario_rank,
    scenario_multiplier
  )
),

accepted_launches as materialized (
  select
    launch.*

  from public.race_engine_get_stage_attack_launch_preview_v2(
    p_stage_id,

    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds,

    p_candidate_score_threshold,
    p_max_candidates_per_step,

    p_opportunity_window_km,
    p_rider_cooldown_km,
    p_team_cooldown_km,

    p_max_stage_attempts,
    p_max_team_attempts,
    p_max_attempts_per_window
  ) as launch

  where launch.is_accepted_escape_launch
),

pace_rows as materialized (
  select
    pace.*

  from public.race_engine_get_stage_live_group_pace_preview_v2(
    p_stage_id,
    p_target_step_km,
    p_assumed_peloton_exposure_fraction,
    p_neutral_km,
    p_group_gap_threshold_seconds
  ) as pace
),

peloton_step_rows as (
  select
    pace.step_order,

    min(
      pace.km_end
    ) as km_end,

    min(
      pace.distance_km
    ) as distance_km,

    min(
      pace.live_group_pace_kmh
    ) as baseline_peloton_pace_kmh

  from pace_rows as pace

  where pace.live_group_code =
    'main_peloton'

  group by pace.step_order
),

launch_step_rows as (
  select
    launch.race_id,
    launch.stage_id,

    launch.attack_launch_event_key,
    launch.accepted_launch_rank,

    launch.rider_id,
    launch.team_id,
    launch.rider_name,
    launch.team_name,
    launch.role_code,

    launch.selected_step_order
      as launch_step_order,

    launch.selected_km_end
      as launch_km,

    launch.effective_projected_initial_gap_seconds
      as initial_gap_seconds,

    launch.projected_attack_energy_cost_pct
      as attack_energy_cost_pct,

    pace.step_order,
    pace.km_end,
    pace.distance_km,

    pace.terrain_type,
    pace.slope_percent,

    peloton.baseline_peloton_pace_kmh,

    pace.rider_free_speed_kmh

  from accepted_launches as launch

  join pace_rows as pace
    on pace.rider_id =
      launch.rider_id

   and pace.step_order >=
      launch.selected_step_order

  join peloton_step_rows as peloton
    on peloton.step_order =
      pace.step_order
),

scenario_step_rows as (
  select
    launch_step.*,

    scenario.scenario_code,
    scenario.scenario_rank,
    scenario.peloton_response_speed_multiplier

  from launch_step_rows as launch_step

  cross join scenario_rows as scenario
),

component_rows as (
  select
    scenario_step.*,

    component.post_attack_speed_penalty_fraction,
    component.post_attack_rider_speed_multiplier,

    component.effective_peloton_pace_kmh,
    component.effective_escape_rider_pace_kmh,

    component.effective_peloton_step_seconds,
    component.effective_escape_rider_step_seconds,

    component.projected_gap_delta_seconds

  from scenario_step_rows as scenario_step

  cross join lateral
    public.race_engine_calculate_escape_step_components_v2(
      scenario_step.distance_km::numeric,

      scenario_step.baseline_peloton_pace_kmh::numeric,
      scenario_step.rider_free_speed_kmh::numeric,

      scenario_step.peloton_response_speed_multiplier::numeric,
      scenario_step.attack_energy_cost_pct::numeric
    ) as component
),

raw_trajectory_rows as (
  select
    component.*,

    (
      component.initial_gap_seconds

      +
      sum(
        case
          /*
           * The launch-step gap already represents the attack burst.
           * Normal escape development begins with the following route step.
           */
          when component.step_order >
            component.launch_step_order
          then component.projected_gap_delta_seconds

          else 0::numeric
        end
      ) over (
        partition by
          component.attack_launch_event_key,
          component.scenario_code

        order by component.step_order

        rows between unbounded preceding
          and current row
      )
    ) as raw_projected_gap_seconds

  from component_rows as component
),

catch_rows as (
  select
    trajectory.attack_launch_event_key,
    trajectory.scenario_code,

    min(
      trajectory.step_order
    ) filter (
      where trajectory.step_order >
          trajectory.launch_step_order

        and trajectory.raw_projected_gap_seconds <=
          parameters.catch_threshold_seconds
    )::integer as projected_catch_step_order

  from raw_trajectory_rows as trajectory

  cross join parameters

  group by
    trajectory.attack_launch_event_key,
    trajectory.scenario_code
),

catch_locations as (
  select
    catch_state.attack_launch_event_key,
    catch_state.scenario_code,
    catch_state.projected_catch_step_order,

    catch_trajectory.km_end
      as projected_catch_km

  from catch_rows as catch_state

  left join raw_trajectory_rows as catch_trajectory
    on catch_trajectory.attack_launch_event_key =
      catch_state.attack_launch_event_key

   and catch_trajectory.scenario_code =
      catch_state.scenario_code

   and catch_trajectory.step_order =
      catch_state.projected_catch_step_order
),

final_rows as (
  select
    trajectory.*,

    catch_location.projected_catch_step_order,
    catch_location.projected_catch_km,

    (
      catch_location.projected_catch_step_order
        is null

      or trajectory.step_order <
        catch_location.projected_catch_step_order
    ) as is_escape_active,

    (
      catch_location.projected_catch_step_order
        is not null

      and trajectory.step_order =
        catch_location.projected_catch_step_order
    ) as is_projected_catch_step,

    (
      catch_location.projected_catch_step_order
        is null
    ) as survived_to_finish

  from raw_trajectory_rows as trajectory

  left join catch_locations as catch_location
    on catch_location.attack_launch_event_key =
      trajectory.attack_launch_event_key

   and catch_location.scenario_code =
      trajectory.scenario_code
)

select
  final_row.race_id,
  final_row.stage_id,

  final_row.attack_launch_event_key,
  final_row.accepted_launch_rank,

  final_row.rider_id,
  final_row.team_id,
  final_row.rider_name,
  final_row.team_name,
  final_row.role_code,

  final_row.launch_step_order,

  round(
    final_row.launch_km,
    6
  ) as launch_km,

  round(
    final_row.initial_gap_seconds,
    6
  ) as initial_gap_seconds,

  round(
    final_row.attack_energy_cost_pct,
    6
  ) as attack_energy_cost_pct,

  final_row.scenario_code
    as response_scenario_code,

  final_row.scenario_rank
    as response_scenario_rank,

  round(
    final_row.peloton_response_speed_multiplier,
    6
  ) as peloton_response_speed_multiplier,

  final_row.step_order,

  round(
    final_row.km_end,
    6
  ) as km_end,

  round(
    final_row.distance_km,
    6
  ) as distance_km,

  final_row.terrain_type,

  round(
    final_row.slope_percent,
    6
  ) as slope_percent,

  round(
    final_row.baseline_peloton_pace_kmh,
    6
  ) as baseline_peloton_pace_kmh,

  round(
    final_row.rider_free_speed_kmh,
    6
  ) as rider_free_speed_kmh,

  final_row.post_attack_speed_penalty_fraction,
  final_row.post_attack_rider_speed_multiplier,

  final_row.effective_peloton_pace_kmh,
  final_row.effective_escape_rider_pace_kmh,

  final_row.effective_peloton_step_seconds,
  final_row.effective_escape_rider_step_seconds,
  final_row.projected_gap_delta_seconds,

  round(
    final_row.raw_projected_gap_seconds,
    6
  ) as raw_projected_gap_seconds,

  round(
    case
      when final_row.is_escape_active
      then greatest(
        0::numeric,
        final_row.raw_projected_gap_seconds
      )

      else 0::numeric
    end,
    6
  ) as effective_projected_gap_seconds,

  parameters.catch_threshold_seconds,

  final_row.projected_catch_step_order,

  round(
    final_row.projected_catch_km,
    6
  ) as projected_catch_km,

  round(
    case
      when final_row.projected_catch_km
        is not null
      then greatest(
        0::numeric,

        final_row.projected_catch_km
        - final_row.launch_km
      )

      else greatest(
        0::numeric,

        max(
          final_row.km_end
        ) over (
          partition by
            final_row.attack_launch_event_key,
            final_row.scenario_code
        )
        - final_row.launch_km
      )
    end,
    6
  ) as projected_escape_duration_km,

  final_row.is_escape_active,
  final_row.is_projected_catch_step,
  final_row.survived_to_finish,

  'escape_survival_envelope_v2_2026_07_corrected'::text
    as escape_survival_model_version

from final_rows as final_row

cross join parameters

order by
  final_row.accepted_launch_rank,
  final_row.scenario_rank,
  final_row.step_order;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_peloton_response_components_v2(p_stage_progress_fraction numeric, p_remaining_km numeric, p_current_gap_seconds numeric, p_escape_rider_count integer, p_escape_team_count integer, p_chasing_team_count integer, p_available_chase_assets integer, p_total_sprint_assets integer, p_total_protected_assets integer, p_baseline_peloton_pace_kmh numeric, p_escape_pace_kmh numeric, p_is_point_gate_near boolean DEFAULT false, p_is_finish_near boolean DEFAULT false)
 RETURNS TABLE(normalized_stage_progress_fraction numeric, normalized_remaining_km numeric, normalized_current_gap_seconds numeric, normalized_escape_rider_count integer, normalized_escape_team_count integer, normalized_chasing_team_count integer, normalized_available_chase_assets integer, chase_interest_score numeric, chase_capacity_score numeric, coordination_factor numeric, target_gap_lower_seconds numeric, target_gap_upper_seconds numeric, required_hold_multiplier numeric, maximum_pursuit_multiplier numeric, selected_response_multiplier numeric, chase_urgency_score numeric, peloton_work_intensity_fraction numeric, response_mode text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(
          p_stage_progress_fraction,
          0::numeric
        )
      )
    ) as stage_progress_fraction,

    greatest(
      0::numeric,
      coalesce(
        p_remaining_km,
        0::numeric
      )
    ) as remaining_km,

    greatest(
      0::numeric,
      coalesce(
        p_current_gap_seconds,
        0::numeric
      )
    ) as current_gap_seconds,

    greatest(
      1,
      coalesce(
        p_escape_rider_count,
        1
      )
    )::integer as escape_rider_count,

    greatest(
      1,
      coalesce(
        p_escape_team_count,
        1
      )
    )::integer as escape_team_count,

    greatest(
      0,
      coalesce(
        p_chasing_team_count,
        0
      )
    )::integer as chasing_team_count,

    greatest(
      0,
      coalesce(
        p_available_chase_assets,
        0
      )
    )::integer as available_chase_assets,

    greatest(
      0,
      coalesce(
        p_total_sprint_assets,
        0
      )
    )::integer as total_sprint_assets,

    greatest(
      0,
      coalesce(
        p_total_protected_assets,
        0
      )
    )::integer as total_protected_assets,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_baseline_peloton_pace_kmh,
          40::numeric
        )
      )
    ) as baseline_peloton_pace_kmh,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_escape_pace_kmh,
          40::numeric
        )
      )
    ) as escape_pace_kmh,

    coalesce(
      p_is_point_gate_near,
      false
    ) as is_point_gate_near,

    coalesce(
      p_is_finish_near,
      false
    ) as is_finish_near
),

interest_components as (
  select
    normalized.*,

    least(
      1::numeric,
      normalized.chasing_team_count::numeric
      / 4::numeric
    ) as chasing_team_interest_fraction,

    least(
      1::numeric,
      normalized.available_chase_assets::numeric
      / 12::numeric
    ) as chase_asset_fraction,

    least(
      1::numeric,
      normalized.total_sprint_assets::numeric
      / 8::numeric
    ) as sprint_interest_fraction,

    least(
      1::numeric,
      normalized.total_protected_assets::numeric
      / 6::numeric
    ) as protected_interest_fraction

  from normalized
),

interest_rows as (
  select
    component.*,

    greatest(
      0::numeric,
      least(
        1::numeric,

        component.chasing_team_interest_fraction
          * 0.35::numeric

        + component.sprint_interest_fraction
          * 0.40::numeric

        + component.protected_interest_fraction
          * 0.15::numeric

        + case
            when component.is_point_gate_near
            then 0.10::numeric
            else 0::numeric
          end

        + case
            when component.is_finish_near
            then 0.20::numeric
            else 0::numeric
          end
      )
    ) as chase_interest_score,

    greatest(
      0::numeric,
      least(
        1::numeric,

        component.chase_asset_fraction
          * 0.65::numeric

        + component.chasing_team_interest_fraction
          * 0.35::numeric
      )
    ) as chase_capacity_score,

    greatest(
      0::numeric,
      least(
        1::numeric,

        component.chasing_team_interest_fraction
        *
        (
          0.65::numeric
          + component.chase_asset_fraction
            * 0.35::numeric
        )
      )
    ) as coordination_factor

  from interest_components as component
),

base_target_rows as (
  select
    interest.*,

    case
      when interest.is_finish_near
        or interest.remaining_km <= 5::numeric
      then 0::numeric

      when interest.remaining_km <= 10::numeric
      then interest.remaining_km
        * 1.5::numeric

      when interest.remaining_km <= 20::numeric
      then 20::numeric
        + interest.remaining_km
          * 1.5::numeric

      when interest.stage_progress_fraction < 0.20::numeric
      then
        210::numeric

        + greatest(
            0,
            interest.escape_rider_count - 1
          )::numeric
          * 25::numeric

        + greatest(
            0,
            interest.escape_team_count - 1
          )::numeric
          * 10::numeric

      when interest.stage_progress_fraction < 0.50::numeric
      then
        150::numeric

        + greatest(
            0,
            interest.escape_rider_count - 1
          )::numeric
          * 20::numeric

        + greatest(
            0,
            interest.escape_team_count - 1
          )::numeric
          * 8::numeric

      when interest.stage_progress_fraction < 0.75::numeric
      then
        90::numeric

        + greatest(
            0,
            interest.escape_rider_count - 1
          )::numeric
          * 15::numeric

        + greatest(
            0,
            interest.escape_team_count - 1
          )::numeric
          * 6::numeric

      when interest.stage_progress_fraction < 0.90::numeric
      then
        45::numeric

        + greatest(
            0,
            interest.escape_rider_count - 1
          )::numeric
          * 10::numeric

      else
        greatest(
          8::numeric,
          interest.remaining_km
          * 1.25::numeric
        )
    end as base_target_gap_upper_seconds,

    greatest(
      0.85::numeric,
      least(
        1.15::numeric,

        interest.escape_pace_kmh
        /
        nullif(
          interest.baseline_peloton_pace_kmh,
          0::numeric
        )
      )
    ) as required_hold_multiplier

  from interest_rows as interest
),

target_rows as (
  select
    base_target.*,

    greatest(
      0::numeric,

      base_target.base_target_gap_upper_seconds

      *
      (
        1::numeric
        - base_target.chase_interest_score
          * 0.25::numeric
      )

      *
      case
        when base_target.is_point_gate_near
        then 0.70::numeric
        else 1::numeric
      end
    ) as target_gap_upper_seconds,

    least(
      1.05::numeric,

      1::numeric

      + 0.05::numeric
        * base_target.chase_interest_score
        * base_target.chase_capacity_score
    ) as maximum_pursuit_multiplier

  from base_target_rows as base_target
),

gap_rows as (
  select
    target.*,

    target.target_gap_upper_seconds
      * 0.65::numeric
        as target_gap_lower_seconds,

    case
      when target.target_gap_upper_seconds <= 0::numeric
      then
        case
          when target.current_gap_seconds > 0.5::numeric
          then 1::numeric
          else 0::numeric
        end

      when target.current_gap_seconds <=
        target.target_gap_upper_seconds
          * 0.65::numeric
      then 0::numeric

      when target.current_gap_seconds <
        target.target_gap_upper_seconds
      then
        least(
          0.40::numeric,

          (
            target.current_gap_seconds
            - target.target_gap_upper_seconds
              * 0.65::numeric
          )
          /
          nullif(
            target.target_gap_upper_seconds
            * 0.35::numeric,
            0::numeric
          )
          * 0.40::numeric
        )

      else
        least(
          1::numeric,

          0.50::numeric

          +
          (
            target.current_gap_seconds
            - target.target_gap_upper_seconds
          )
          /
          greatest(
            30::numeric,
            target.target_gap_upper_seconds
          )
          * 0.50::numeric
        )
    end as gap_urgency_fraction,

    case
      when target.remaining_km <= 10::numeric
      then 1::numeric

      when target.remaining_km <= 25::numeric
      then 0.75::numeric

      when target.remaining_km <= 50::numeric
      then 0.45::numeric

      else least(
        0.35::numeric,
        target.stage_progress_fraction
          * 0.35::numeric
      )
    end as distance_urgency_fraction,

    least(
      1::numeric,

      greatest(
        0::numeric,

        target.required_hold_multiplier
        - 1::numeric
      )
      * 20::numeric
    ) as escape_strength_urgency_fraction

  from target_rows as target
),

urgency_rows as (
  select
    gap.*,

    greatest(
      0::numeric,
      least(
        1::numeric,

        gap.gap_urgency_fraction
          * 0.45::numeric

        + gap.distance_urgency_fraction
          * 0.30::numeric

        + gap.escape_strength_urgency_fraction
          * 0.15::numeric

        + case
            when gap.is_point_gate_near
            then 0.10::numeric
            else 0::numeric
          end

        + case
            when gap.is_finish_near
            then 0.30::numeric
            else 0::numeric
          end
      )
    ) as chase_urgency_score

  from gap_rows as gap
),

decision_rows as (
  select
    urgency.*,

    case
      when urgency.current_gap_seconds <=
        0.5::numeric
      then 'no_active_escape'::text

      when urgency.is_finish_near
        or urgency.remaining_km <= 5::numeric
      then 'emergency_chase'::text

      when urgency.current_gap_seconds <
          urgency.target_gap_lower_seconds

        and urgency.remaining_km > 20::numeric

        and not urgency.is_point_gate_near
      then 'release_escape'::text

      when urgency.current_gap_seconds <=
        urgency.target_gap_upper_seconds
      then 'control_gap'::text

      else 'organized_chase'::text
    end as response_mode

  from urgency_rows as urgency
),

selected_rows as (
  select
    decision.*,

    case decision.response_mode
      when 'no_active_escape'
      then 1::numeric

      when 'release_escape'
      then greatest(
        0.90::numeric,

        least(
          0.995::numeric,

          decision.required_hold_multiplier

          -
          (
            0.006::numeric

            + (
                1::numeric
                - decision.stage_progress_fraction
              )
              * 0.010::numeric
          )
        )
      )

      when 'control_gap'
      then greatest(
        0.92::numeric,

        least(
          decision.maximum_pursuit_multiplier,

          decision.required_hold_multiplier

          +
          case
            when decision.target_gap_upper_seconds <=
              0::numeric
            then 0::numeric

            else
              (
                decision.current_gap_seconds

                -
                (
                  decision.target_gap_lower_seconds
                  + decision.target_gap_upper_seconds
                )
                / 2::numeric
              )

              /
              greatest(
                30::numeric,
                decision.target_gap_upper_seconds
              )

              * 0.010::numeric
          end
        )
      )

      when 'organized_chase'
      then greatest(
        0.97::numeric,

        least(
          decision.maximum_pursuit_multiplier,

          decision.required_hold_multiplier

          + 0.006::numeric

          + decision.chase_urgency_score
            * 0.024::numeric
        )
      )

      when 'emergency_chase'
      then decision.maximum_pursuit_multiplier

      else 1::numeric
    end as selected_response_multiplier

  from decision_rows as decision
)

select
  round(
    selected.stage_progress_fraction,
    6
  ) as normalized_stage_progress_fraction,

  round(
    selected.remaining_km,
    6
  ) as normalized_remaining_km,

  round(
    selected.current_gap_seconds,
    6
  ) as normalized_current_gap_seconds,

  selected.escape_rider_count
    as normalized_escape_rider_count,

  selected.escape_team_count
    as normalized_escape_team_count,

  selected.chasing_team_count
    as normalized_chasing_team_count,

  selected.available_chase_assets
    as normalized_available_chase_assets,

  round(
    selected.chase_interest_score,
    6
  ) as chase_interest_score,

  round(
    selected.chase_capacity_score,
    6
  ) as chase_capacity_score,

  round(
    selected.coordination_factor,
    6
  ) as coordination_factor,

  round(
    selected.target_gap_lower_seconds,
    6
  ) as target_gap_lower_seconds,

  round(
    selected.target_gap_upper_seconds,
    6
  ) as target_gap_upper_seconds,

  round(
    selected.required_hold_multiplier,
    6
  ) as required_hold_multiplier,

  round(
    selected.maximum_pursuit_multiplier,
    6
  ) as maximum_pursuit_multiplier,

  round(
    selected.selected_response_multiplier,
    6
  ) as selected_response_multiplier,

  round(
    selected.chase_urgency_score,
    6
  ) as chase_urgency_score,

  round(
    greatest(
      0::numeric,
      least(
        1::numeric,

        (
          selected.selected_response_multiplier
          - 0.97::numeric
        )
        /
        0.08::numeric
      )
    ),
    6
  ) as peloton_work_intensity_fraction,

  selected.response_mode

from selected_rows as selected;

$function$
;

CREATE OR REPLACE FUNCTION public.race_role_is_captain_v1(p_role text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    lower(trim(coalesce(p_role, ''))) = any (
      array[
        'leader',
        'team leader',
        'team_leader',
        'team_leader_gc',
        'gc leader',
        'gc_leader',
        'captain',
        'race captain',
        'race_captain',
        'road captain',
        'road_captain'
      ]::text[]
    )
    or lower(trim(coalesce(p_role, ''))) like '%leader%'
    or lower(trim(coalesce(p_role, ''))) like '%captain%';
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_resolve_peloton_response_state_v2(p_previous_response_mode text, p_previous_mode_age_steps integer, p_candidate_response_mode text, p_stage_progress_fraction numeric, p_current_gap_seconds numeric, p_target_gap_lower_seconds numeric, p_target_gap_upper_seconds numeric, p_required_hold_multiplier numeric, p_maximum_pursuit_multiplier numeric, p_chase_urgency_score numeric, p_is_escape_active boolean, p_is_finish_near boolean)
 RETURNS TABLE(candidate_response_mode text, selected_response_mode text, normalized_previous_mode_age_steps integer, minimum_hold_steps integer, lower_hysteresis_seconds numeric, upper_hysteresis_seconds numeric, mode_change_allowed boolean, response_mode_changed boolean, selected_response_multiplier numeric, state_decision_reason text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized as (
  select
    case
      when p_previous_response_mode in (
        'no_active_escape',
        'release_escape',
        'control_gap',
        'organized_chase',
        'emergency_chase'
      )
      then p_previous_response_mode

      else null
    end as previous_response_mode,

    greatest(
      0,
      coalesce(
        p_previous_mode_age_steps,
        0
      )
    )::integer as previous_mode_age_steps,

    case
      when p_candidate_response_mode in (
        'no_active_escape',
        'release_escape',
        'control_gap',
        'organized_chase',
        'emergency_chase'
      )
      then p_candidate_response_mode

      else 'control_gap'::text
    end as candidate_response_mode,

    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(
          p_stage_progress_fraction,
          0::numeric
        )
      )
    ) as stage_progress_fraction,

    greatest(
      0::numeric,
      coalesce(
        p_current_gap_seconds,
        0::numeric
      )
    ) as current_gap_seconds,

    greatest(
      0::numeric,
      coalesce(
        p_target_gap_lower_seconds,
        0::numeric
      )
    ) as target_gap_lower_seconds,

    greatest(
      0::numeric,
      coalesce(
        p_target_gap_upper_seconds,
        0::numeric
      )
    ) as target_gap_upper_seconds,

    greatest(
      0.85::numeric,
      least(
        1.15::numeric,
        coalesce(
          p_required_hold_multiplier,
          1::numeric
        )
      )
    ) as required_hold_multiplier,

    greatest(
      1::numeric,
      least(
        1.05::numeric,
        coalesce(
          p_maximum_pursuit_multiplier,
          1::numeric
        )
      )
    ) as maximum_pursuit_multiplier,

    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(
          p_chase_urgency_score,
          0::numeric
        )
      )
    ) as chase_urgency_score,

    coalesce(
      p_is_escape_active,
      false
    ) as is_escape_active,

    coalesce(
      p_is_finish_near,
      false
    ) as is_finish_near
),

boundary_rows as (
  select
    normalized.*,

    greatest(
      0::numeric,

      normalized.target_gap_upper_seconds
      - normalized.target_gap_lower_seconds
    ) as target_gap_band_width,

    /*
     * One second is the minimum separation between entering and leaving
     * control mode. Wider target bands receive proportionally more buffer.
     */
    greatest(
      1::numeric,

      (
        normalized.target_gap_upper_seconds
        - normalized.target_gap_lower_seconds
      )
      * 0.04::numeric
    ) as lower_hysteresis_seconds,

    greatest(
      3::numeric,

      (
        normalized.target_gap_upper_seconds
        - normalized.target_gap_lower_seconds
      )
      * 0.08::numeric
    ) as upper_hysteresis_seconds,

    case normalized.previous_response_mode
      when 'release_escape'
      then 6

      when 'control_gap'
      then 8

      when 'organized_chase'
      then 10

      when 'emergency_chase'
      then 999999

      else 0
    end::integer as minimum_hold_steps

  from normalized
),

decision_rows as (
  select
    boundary.*,

    case
      /*
       * A caught escape immediately terminates all chase state.
       */
      when not boundary.is_escape_active
      then 'no_active_escape'::text

      /*
       * The finish emergency always overrides hysteresis and hold duration.
       */
      when boundary.is_finish_near
        or boundary.candidate_response_mode =
          'emergency_chase'
      then 'emergency_chase'::text

      /*
       * The first active step uses the normal controller decision.
       */
      when boundary.previous_response_mode is null
        or boundary.previous_response_mode =
          'no_active_escape'
      then boundary.candidate_response_mode

      /*
       * Once emergency chase starts, it remains active until the catch.
       */
      when boundary.previous_response_mode =
        'emergency_chase'
      then 'emergency_chase'::text

      /*
       * A clearly excessive gap may trigger organized chase immediately,
       * even if the preceding mode has not reached its minimum duration.
       */
      when boundary.candidate_response_mode =
          'organized_chase'

        and boundary.current_gap_seconds >=
          boundary.target_gap_upper_seconds
          + boundary.upper_hysteresis_seconds
      then 'organized_chase'::text

      /*
       * Release mode:
       * - retain it for at least 3 km at a 0.5 km step size;
       * - enter control only after moving clearly above the lower boundary.
       */
      when boundary.previous_response_mode =
        'release_escape'
      then
        case
          when boundary.previous_mode_age_steps <
            boundary.minimum_hold_steps
          then 'release_escape'::text

          when boundary.current_gap_seconds >=
            boundary.target_gap_lower_seconds
            + boundary.lower_hysteresis_seconds
          then 'control_gap'::text

          else 'release_escape'::text
        end

      /*
       * Control mode:
       * - retain it for at least 4 km;
       * - return to release only after moving clearly below the lower band;
       * - do not switch merely because the gap moved by a fraction of a
       *   second around the target boundary.
       */
      when boundary.previous_response_mode =
        'control_gap'
      then
        case
          when boundary.previous_mode_age_steps <
            boundary.minimum_hold_steps
          then 'control_gap'::text

          when boundary.candidate_response_mode =
              'release_escape'

            and boundary.current_gap_seconds <=
              greatest(
                0::numeric,

                boundary.target_gap_lower_seconds
                - boundary.lower_hysteresis_seconds
              )
          then 'release_escape'::text

          else 'control_gap'::text
        end

      /*
       * Organized chase:
       * - retain it for at least 5 km;
       * - downgrade only after the gap is safely back inside the control
       *   region rather than exactly touching its upper boundary.
       */
      when boundary.previous_response_mode =
        'organized_chase'
      then
        case
          when boundary.previous_mode_age_steps <
            boundary.minimum_hold_steps
          then 'organized_chase'::text

          when boundary.current_gap_seconds <=
            greatest(
              boundary.target_gap_lower_seconds,

              boundary.target_gap_upper_seconds
              - boundary.upper_hysteresis_seconds
            )
          then 'control_gap'::text

          else 'organized_chase'::text
        end

      else boundary.candidate_response_mode
    end as selected_response_mode

  from boundary_rows as boundary
),

multiplier_rows as (
  select
    decision.*,

    greatest(
      0.90::numeric,
      least(
        1.05::numeric,

        case decision.selected_response_mode
          when 'no_active_escape'
          then 1::numeric

          when 'release_escape'
          then greatest(
            0.90::numeric,

            least(
              0.995::numeric,

              decision.required_hold_multiplier

              -
              (
                0.006::numeric

                +
                (
                  1::numeric
                  - decision.stage_progress_fraction
                )
                * 0.010::numeric
              )
            )
          )

          when 'control_gap'
          then greatest(
            0.92::numeric,

            least(
              decision.maximum_pursuit_multiplier,

              decision.required_hold_multiplier

              +
              case
                when decision.target_gap_upper_seconds <=
                  0::numeric
                then 0::numeric

                else
                  (
                    decision.current_gap_seconds

                    -
                    (
                      decision.target_gap_lower_seconds
                      + decision.target_gap_upper_seconds
                    )
                    / 2::numeric
                  )

                  /
                  greatest(
                    30::numeric,
                    decision.target_gap_upper_seconds
                  )

                  * 0.010::numeric
              end
            )
          )

          when 'organized_chase'
          then greatest(
            0.97::numeric,

            least(
              decision.maximum_pursuit_multiplier,

              decision.required_hold_multiplier

              + 0.006::numeric

              + decision.chase_urgency_score
                * 0.024::numeric
            )
          )

          when 'emergency_chase'
          then decision.maximum_pursuit_multiplier

          else 1::numeric
        end
      )
    ) as selected_response_multiplier

  from decision_rows as decision
)

select
  multiplier.candidate_response_mode,

  multiplier.selected_response_mode,

  multiplier.previous_mode_age_steps
    as normalized_previous_mode_age_steps,

  multiplier.minimum_hold_steps,

  round(
    multiplier.lower_hysteresis_seconds,
    6
  ) as lower_hysteresis_seconds,

  round(
    multiplier.upper_hysteresis_seconds,
    6
  ) as upper_hysteresis_seconds,

  (
    multiplier.selected_response_mode is distinct from
      multiplier.previous_response_mode

    or multiplier.previous_response_mode is null
  ) as mode_change_allowed,

  (
    multiplier.previous_response_mode is not null

    and multiplier.selected_response_mode is distinct from
      multiplier.previous_response_mode
  ) as response_mode_changed,

  round(
    multiplier.selected_response_multiplier,
    6
  ) as selected_response_multiplier,

  case
    when not multiplier.is_escape_active
    then 'escape_not_active'

    when multiplier.is_finish_near
      or multiplier.candidate_response_mode =
        'emergency_chase'
    then 'finish_emergency_override'

    when multiplier.previous_response_mode is null
      or multiplier.previous_response_mode =
        'no_active_escape'
    then 'initial_active_response'

    when multiplier.previous_response_mode =
        'emergency_chase'
    then 'emergency_held_until_catch'

    when multiplier.selected_response_mode =
        'organized_chase'

      and multiplier.previous_response_mode <>
        'organized_chase'
    then 'excess_gap_immediate_escalation'

    when multiplier.selected_response_mode =
        multiplier.previous_response_mode

      and multiplier.previous_mode_age_steps <
        multiplier.minimum_hold_steps
    then 'minimum_mode_duration'

    when multiplier.previous_response_mode =
        'release_escape'

      and multiplier.selected_response_mode =
        'release_escape'
    then 'inside_release_hysteresis'

    when multiplier.previous_response_mode =
        'release_escape'

      and multiplier.selected_response_mode =
        'control_gap'
    then 'crossed_control_entry_boundary'

    when multiplier.previous_response_mode =
        'control_gap'

      and multiplier.selected_response_mode =
        'control_gap'
    then 'inside_control_hysteresis'

    when multiplier.previous_response_mode =
        'control_gap'

      and multiplier.selected_response_mode =
        'release_escape'
    then 'crossed_release_reentry_boundary'

    when multiplier.previous_response_mode =
        'organized_chase'

      and multiplier.selected_response_mode =
        'organized_chase'
    then 'organized_chase_sustained'

    when multiplier.previous_response_mode =
        'organized_chase'

      and multiplier.selected_response_mode =
        'control_gap'
    then 'gap_returned_to_control_band'

    else 'candidate_response_accepted'
  end::text as state_decision_reason

from multiplier_rows as multiplier;

$function$
;

CREATE OR REPLACE FUNCTION public.backfill_due_team_list_captain_finalizations_v1(p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.process_due_race_startlist_captain_finalizations_v1(
    p_limit
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_calculate_escape_group_pace_components_v2(p_group_size integer, p_distinct_team_count integer, p_fastest_rider_free_speed_kmh numeric, p_average_rider_free_speed_kmh numeric, p_slowest_rider_free_speed_kmh numeric, p_cooperation_willingness_fraction numeric, p_is_chase_group boolean DEFAULT false, p_stage_progress_fraction numeric DEFAULT 0)
 RETURNS TABLE(normalized_group_size integer, normalized_distinct_team_count integer, normalized_cooperation_willingness_fraction numeric, normalized_fastest_rider_speed_kmh numeric, normalized_average_rider_speed_kmh numeric, normalized_slowest_rider_speed_kmh numeric, strength_blend_speed_kmh numeric, size_drafting_bonus_fraction numeric, cooperation_multiplier numeric, multi_team_coordination_penalty_fraction numeric, chase_purpose_bonus_fraction numeric, maximum_allowed_group_pace_kmh numeric, effective_group_pace_kmh numeric, group_work_intensity_fraction numeric)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$

with normalized_inputs as (
  select
    greatest(
      1,
      least(
        20,
        coalesce(
          p_group_size,
          1
        )
      )
    )::integer as group_size,

    greatest(
      1,
      least(
        greatest(
          1,
          least(
            20,
            coalesce(
              p_group_size,
              1
            )
          )
        ),

        coalesce(
          p_distinct_team_count,
          1
        )
      )
    )::integer as distinct_team_count,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_fastest_rider_free_speed_kmh,
          40::numeric
        )
      )
    ) as supplied_fastest_speed_kmh,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_average_rider_free_speed_kmh,
          40::numeric
        )
      )
    ) as supplied_average_speed_kmh,

    greatest(
      5::numeric,
      least(
        100::numeric,
        coalesce(
          p_slowest_rider_free_speed_kmh,
          40::numeric
        )
      )
    ) as supplied_slowest_speed_kmh,

    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(
          p_cooperation_willingness_fraction,
          0.75::numeric
        )
      )
    ) as cooperation_willingness_fraction,

    coalesce(
      p_is_chase_group,
      false
    ) as is_chase_group,

    greatest(
      0::numeric,
      least(
        1::numeric,
        coalesce(
          p_stage_progress_fraction,
          0::numeric
        )
      )
    ) as stage_progress_fraction
),

ordered_speeds as (
  select
    normalized.*,

    greatest(
      normalized.supplied_fastest_speed_kmh,
      normalized.supplied_average_speed_kmh,
      normalized.supplied_slowest_speed_kmh
    ) as fastest_rider_speed_kmh,

    least(
      normalized.supplied_fastest_speed_kmh,
      normalized.supplied_average_speed_kmh,
      normalized.supplied_slowest_speed_kmh
    ) as slowest_rider_speed_kmh

  from normalized_inputs as normalized
),

bounded_speeds as (
  select
    ordered.*,

    least(
      ordered.fastest_rider_speed_kmh,

      greatest(
        ordered.slowest_rider_speed_kmh,
        ordered.supplied_average_speed_kmh
      )
    ) as average_rider_speed_kmh

  from ordered_speeds as ordered
),

component_rows as (
  select
    speed.*,

    (
      speed.average_rider_speed_kmh
        * 0.70::numeric

      + speed.fastest_rider_speed_kmh
        * 0.25::numeric

      + speed.slowest_rider_speed_kmh
        * 0.05::numeric
    ) as strength_blend_speed_kmh,

    case
      when speed.group_size <= 1
      then 0::numeric

      when speed.group_size = 2
      then 0.006::numeric

      when speed.group_size = 3
      then 0.010::numeric

      when speed.group_size = 4
      then 0.013::numeric

      else least(
        0.025::numeric,

        0.013::numeric
        + (
            speed.group_size - 4
          )::numeric
          * 0.002::numeric
      )
    end as size_drafting_bonus_fraction,

    case
      when speed.group_size <= 1
      then 1::numeric

      else
        0.965::numeric
        + speed.cooperation_willingness_fraction
          * 0.035::numeric
    end as cooperation_multiplier,

    case
      when speed.group_size <= 1
        or speed.distinct_team_count <= 1
      then 0::numeric

      else least(
        0.012::numeric,

        (
          speed.distinct_team_count - 1
        )::numeric

        * 0.0025::numeric

        *
        (
          1::numeric
          - speed.cooperation_willingness_fraction
            * 0.50::numeric
        )
      )
    end as multi_team_coordination_penalty_fraction,

    case
      when speed.group_size <= 1
        or not speed.is_chase_group
      then 0::numeric

      else
        0.002::numeric
        + speed.stage_progress_fraction
          * 0.004::numeric
    end as chase_purpose_bonus_fraction

  from bounded_speeds as speed
),

pace_rows as (
  select
    component.*,

    component.fastest_rider_speed_kmh
      * 1.04::numeric
        as maximum_allowed_group_pace_kmh,

    (
      component.strength_blend_speed_kmh

      *
      (
        1::numeric
        + component.size_drafting_bonus_fraction
        + component.chase_purpose_bonus_fraction
      )

      * component.cooperation_multiplier

      *
      (
        1::numeric
        - component.multi_team_coordination_penalty_fraction
      )
    ) as unbounded_group_pace_kmh

  from component_rows as component
),

final_rows as (
  select
    pace.*,

    greatest(
      pace.slowest_rider_speed_kmh
        * 0.98::numeric,

      least(
        pace.maximum_allowed_group_pace_kmh,
        pace.unbounded_group_pace_kmh
      )
    ) as effective_group_pace_kmh,

    case
      when pace.group_size <= 1
      then 1::numeric

      else greatest(
        0.60::numeric,
        least(
          1::numeric,

          0.70::numeric

          + pace.cooperation_willingness_fraction
            * 0.25::numeric

          + (
              1::numeric
              - least(
                  1::numeric,

                  pace.multi_team_coordination_penalty_fraction
                  / 0.012::numeric
                )
            )
            * 0.05::numeric
        )
      )
    end as group_work_intensity_fraction

  from pace_rows as pace
)

select
  final.group_size
    as normalized_group_size,

  final.distinct_team_count
    as normalized_distinct_team_count,

  round(
    final.cooperation_willingness_fraction,
    6
  ) as normalized_cooperation_willingness_fraction,

  round(
    final.fastest_rider_speed_kmh,
    6
  ) as normalized_fastest_rider_speed_kmh,

  round(
    final.average_rider_speed_kmh,
    6
  ) as normalized_average_rider_speed_kmh,

  round(
    final.slowest_rider_speed_kmh,
    6
  ) as normalized_slowest_rider_speed_kmh,

  round(
    final.strength_blend_speed_kmh,
    6
  ) as strength_blend_speed_kmh,

  round(
    final.size_drafting_bonus_fraction,
    6
  ) as size_drafting_bonus_fraction,

  round(
    final.cooperation_multiplier,
    6
  ) as cooperation_multiplier,

  round(
    final.multi_team_coordination_penalty_fraction,
    6
  ) as multi_team_coordination_penalty_fraction,

  round(
    final.chase_purpose_bonus_fraction,
    6
  ) as chase_purpose_bonus_fraction,

  round(
    final.maximum_allowed_group_pace_kmh,
    6
  ) as maximum_allowed_group_pace_kmh,

  round(
    final.effective_group_pace_kmh,
    6
  ) as effective_group_pace_kmh,

  round(
    final.group_work_intensity_fraction,
    6
  ) as group_work_intensity_fraction

from final_rows as final;

$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_gate_deterministic_unit_roll_v1(p_stage_id uuid, p_point_id uuid, p_rider_id uuid, p_channel text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
  with hash_value as (
    select decode(
      md5(
        concat_ws(
          '|',
          p_stage_id::text,
          p_point_id::text,
          p_rider_id::text,
          p_channel
        )
      ),
      'hex'
    ) as bytes
  )

  select round(
    (
      get_byte(bytes, 0)::numeric * 16777216::numeric
      + get_byte(bytes, 1)::numeric * 65536::numeric
      + get_byte(bytes, 2)::numeric * 256::numeric
      + get_byte(bytes, 3)::numeric
    )
    / 4294967295::numeric,
    12
  )

  from hash_value;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_ranking_award_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_rows as
(
  select ranking_award.*
  from public.race_ranking_point_awards ranking_award
  where ranking_award.stage_id = p_stage_id
),

summary as
(
  select
    count(*)::integer
      as row_count,

    count(*) filter
    (
      where source_type in
            (
              'stage_finish',
              'leader_day',
              'oneday_finish'
            )
    )::integer
      as stage_scoped_writer_row_count,

    count(*) filter
    (
      where source_type =
            'final_gc'
    )::integer
      as final_gc_row_count,

    coalesce(
      sum(rider_points),
      0
    )::bigint
      as total_rider_points,

    coalesce(
      sum(team_points),
      0
    )::bigint
      as total_team_points,

    md5(
      coalesce(
        string_agg(
          to_jsonb(stage_rows)::text,
          '|'
          order by id
        ),
        ''
      )
    ) as identity_hash,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(stage_rows)
            - 'id'
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            source_type,
            rank,
            coalesce(rider_id::text, ''),
            coalesce(team_id::text, ''),
            coalesce(classification_type, '')
        ),
        ''
      )
    ) as semantic_hash

  from stage_rows
),

duplicates as
(
  select count(*)::integer
    as duplicate_natural_key_count

  from
  (
    select
      race_id,
      stage_id,
      source_type,
      rank,
      team_id,
      rider_id

    from stage_rows

    group by
      race_id,
      stage_id,
      source_type,
      rank,
      team_id,
      rider_id

    having count(*) > 1
  ) duplicate_keys
)

select jsonb_build_object(
  'stage_id',
    p_stage_id,

  'row_count',
    summary.row_count,

  'stage_scoped_writer_row_count',
    summary.stage_scoped_writer_row_count,

  'final_gc_row_count',
    summary.final_gc_row_count,

  'total_rider_points',
    summary.total_rider_points,

  'total_team_points',
    summary.total_team_points,

  'identity_hash',
    summary.identity_hash,

  'semantic_hash',
    summary.semantic_hash,

  'duplicate_natural_key_count',
    duplicates.duplicate_natural_key_count,

  'rows',
    coalesce(
      (
        select jsonb_agg(
                 (
                   to_jsonb(stage_row)
                   - 'created_at'
                   - 'updated_at'
                 )
                 order by
                   stage_row.source_type,
                   stage_row.rank,
                   stage_row.rider_id,
                   stage_row.team_id
               )
        from stage_rows stage_row
      ),
      '[]'::jsonb
    )
)

from summary
cross join duplicates;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_ranking_source_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_identity as
(
  select
    stage_row.id as stage_id,
    stage_row.race_id,

    public.race_engine_get_stage_process_plan_v2(
      stage_row.id
    ) as process_plan

  from public.race_stages stage_row

  where stage_row.id =
        p_stage_id
),

result_evidence as
(
  select
    count(*)::integer
      as row_count,

    count(
      distinct result_row.rider_id
    )::integer
      as distinct_rider_count,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(result_row)
            - 'id'
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            result_row.rank,
            result_row.rider_id::text
        ),
        ''
      )
    ) as semantic_hash

  from public.race_stage_results result_row

  where result_row.stage_id =
        p_stage_id
),

classification_evidence as
(
  select
    count(*)::integer
      as row_count,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(classification)
            - 'id'
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            classification.classification_type,
            classification.rank,
            coalesce(
              classification.rider_id::text,
              classification.team_id::text,
              ''
            )
        ),
        ''
      )
    ) as semantic_hash

  from public.race_classification_standings classification

  where classification.after_stage_id =
        p_stage_id
),

combined as
(
  select
    stage_identity.stage_id,
    stage_identity.race_id,

    stage_identity.process_plan
      -> 'stage'
      ->> 'route_format'
      as route_format,

    stage_identity.process_plan
      ->> 'status'
      as stage_process_status,

    result_evidence.row_count
      as stage_result_rows,

    result_evidence.distinct_rider_count
      as stage_result_distinct_riders,

    result_evidence.semantic_hash
      as stage_result_semantic_hash,

    classification_evidence.row_count
      as classification_rows,

    classification_evidence.semantic_hash
      as classification_semantic_hash,

    md5(
      coalesce(
        result_evidence.semantic_hash,
        ''
      )
      ||
      ':'
      ||
      coalesce(
        classification_evidence.semantic_hash,
        ''
      )
    ) as source_payload_hash

  from stage_identity
  cross join result_evidence
  cross join classification_evidence
)

select jsonb_build_object(
  'evidence_version',
    'ranking_source_semantic_v1',

  'status',
    case
      when combined.stage_id is null
        then 'stage_not_found'

      when combined.stage_result_rows = 0
        then 'source_not_ready_no_stage_results'

      else 'source_evidence_ready'
    end,

  'stage_id',
    combined.stage_id,

  'race_id',
    combined.race_id,

  'route_format',
    combined.route_format,

  'stage_process_status',
    combined.stage_process_status,

  'stage_result_rows',
    combined.stage_result_rows,

  'stage_result_distinct_riders',
    combined.stage_result_distinct_riders,

  'stage_result_semantic_hash',
    combined.stage_result_semantic_hash,

  'classification_rows',
    combined.classification_rows,

  'classification_semantic_hash',
    combined.classification_semantic_hash,

  'source_payload_hash',
    combined.source_payload_hash,

  'volatile_fields_excluded',
    jsonb_build_array(
      'id',
      'created_at',
      'updated_at'
    )
)

from combined

union all

select jsonb_build_object(
  'evidence_version',
    'ranking_source_semantic_v1',

  'status',
    'stage_not_found',

  'stage_id',
    p_stage_id
)

where not exists
(
  select 1
  from stage_identity
)

limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_ranking_output_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_rows as
(
  select ranking_award.*
  from public.race_ranking_point_awards ranking_award
  where ranking_award.stage_id =
        p_stage_id
),

summary as
(
  select
    count(*)::integer
      as row_count,

    count(*) filter
    (
      where source_type in
            (
              'stage_finish',
              'leader_day',
              'oneday_finish'
            )
    )::integer
      as stage_scoped_writer_row_count,

    count(*) filter
    (
      where source_type =
            'final_gc'
    )::integer
      as final_gc_row_count,

    coalesce(
      sum(rider_points),
      0
    )::bigint
      as total_rider_points,

    coalesce(
      sum(team_points),
      0
    )::bigint
      as total_team_points,

    md5(
      coalesce(
        string_agg(
          to_jsonb(stage_rows)::text,
          '|'
          order by id
        ),
        ''
      )
    ) as identity_hash,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(stage_rows)
            - 'id'
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            source_type,
            rank,
            coalesce(rider_id::text, ''),
            coalesce(team_id::text, ''),
            coalesce(classification_type, '')
        ),
        ''
      )
    ) as semantic_hash

  from stage_rows
),

duplicates as
(
  select count(*)::integer
    as duplicate_natural_key_count

  from
  (
    select
      race_id,
      stage_id,
      source_type,
      rank,
      team_id,
      rider_id

    from stage_rows

    group by
      race_id,
      stage_id,
      source_type,
      rank,
      team_id,
      rider_id

    having count(*) > 1
  ) duplicate_keys
)

select jsonb_build_object(
  'evidence_version',
    'ranking_output_semantic_v1',

  'status',
    'output_evidence_ready',

  'stage_id',
    p_stage_id,

  'row_count',
    summary.row_count,

  'stage_scoped_writer_row_count',
    summary.stage_scoped_writer_row_count,

  'final_gc_row_count',
    summary.final_gc_row_count,

  'total_rider_points',
    summary.total_rider_points,

  'total_team_points',
    summary.total_team_points,

  'identity_hash',
    summary.identity_hash,

  'semantic_hash',
    summary.semantic_hash,

  'duplicate_natural_key_count',
    duplicates.duplicate_natural_key_count,

  'semantic_hash_excludes',
    jsonb_build_array(
      'id',
      'created_at',
      'updated_at'
    ),

  'identity_hash_is_evidence_only',
    true,

  'identity_hash_must_not_be_used_for_rerun_equivalence',
    true
)

from summary
cross join duplicates;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_prize_award_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
with
stage_rows as
(
  select prize_award.*
  from public.race_prize_awards prize_award
  where prize_award.stage_id = p_stage_id
),

summary as
(
  select
    count(*)::integer as row_count,

    count(*) filter
    (
      where lower(coalesce(status, '')) = 'paid'
         or paid_at is not null
    )::integer as paid_row_count,

    count(*) filter
    (
      where lower(coalesce(status, '')) = 'pending'
        and paid_at is null
    )::integer as pending_row_count,

    coalesce(sum(amount_cash), 0)::bigint
      as total_amount_cash,

    coalesce(
      sum(amount_cash) filter
      (
        where lower(coalesce(status, '')) = 'paid'
           or paid_at is not null
      ),
      0
    )::bigint as paid_amount_cash,

    md5(
      coalesce(
        string_agg(
          to_jsonb(stage_rows)::text,
          '|'
          order by id
        ),
        ''
      )
    ) as identity_hash,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(stage_rows)
            - 'id'
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            bucket_key,
            rank,
            recipient_type,
            team_id::text,
            coalesce(rider_id::text, '')
        ),
        ''
      )
    ) as semantic_hash

  from stage_rows
),

duplicates as
(
  select count(*)::integer
    as duplicate_natural_key_count
  from
  (
    select
      race_id,
      stage_id,
      bucket_key,
      rank,
      recipient_type,
      team_id,
      rider_id
    from stage_rows
    group by
      race_id,
      stage_id,
      bucket_key,
      rank,
      recipient_type,
      team_id,
      rider_id
    having count(*) > 1
  ) duplicate_rows
),

finance_evidence as
(
  select
    count(*)::integer
      as event_lock_count,

    count(distinct event_lock.transaction_id)::integer
      as linked_transaction_count,

    md5(
      coalesce(
        string_agg(
          to_jsonb(event_lock)::text
          ||
          ':'
          ||
          coalesce(to_jsonb(transaction_row)::text, ''),
          '|'
          order by
            event_lock.event_type,
            event_lock.club_id,
            event_lock.ref_id
        ),
        ''
      )
    ) as finance_identity_hash

  from finance.event_locks event_lock

  left join finance.transactions transaction_row
    on transaction_row.id =
       event_lock.transaction_id

  where event_lock.ref_id in
        (
          select stage_row.id
          from stage_rows stage_row
        )
)

select jsonb_build_object(
  'evidence_version',
    'prize_output_semantic_v1',

  'stage_id',
    p_stage_id,

  'row_count',
    summary.row_count,

  'pending_row_count',
    summary.pending_row_count,

  'paid_row_count',
    summary.paid_row_count,

  'total_amount_cash',
    summary.total_amount_cash,

  'paid_amount_cash',
    summary.paid_amount_cash,

  'identity_hash',
    summary.identity_hash,

  'semantic_hash',
    summary.semantic_hash,

  'duplicate_natural_key_count',
    duplicates.duplicate_natural_key_count,

  'finance_event_lock_count',
    finance_evidence.event_lock_count,

  'linked_finance_transaction_count',
    finance_evidence.linked_transaction_count,

  'finance_identity_hash',
    finance_evidence.finance_identity_hash,

  'semantic_hash_excludes',
    jsonb_build_array(
      'id',
      'created_at',
      'updated_at'
    ),

  'semantic_hash_retains_payment_state',
    true
)

from summary
cross join duplicates
cross join finance_evidence;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_prize_source_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_identity as
(
  select
    stage_row.id as stage_id,
    stage_row.race_id,
    stage_row.stage_number,

    not exists
    (
      select 1
      from public.race_stages later_stage
      where later_stage.race_id =
            stage_row.race_id
        and later_stage.stage_number >
            stage_row.stage_number
    ) as is_final_stage,

    public.race_engine_get_stage_process_plan_v2(
      stage_row.id
    ) as process_plan

  from public.race_stages stage_row
  where stage_row.id = p_stage_id
),

result_evidence as
(
  select
    count(*)::integer as row_count,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(result_row)
            - 'id'
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            result_row.rank,
            result_row.rider_id::text
        ),
        ''
      )
    ) as semantic_hash

  from public.race_stage_results result_row
  where result_row.stage_id = p_stage_id
),

classification_evidence as
(
  select
    count(*)::integer as row_count,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(classification)
            - 'id'
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            classification.classification_type,
            classification.rank,
            coalesce(
              classification.rider_id::text,
              classification.team_id::text,
              ''
            )
        ),
        ''
      )
    ) as semantic_hash

  from public.race_classification_standings classification
  where classification.after_stage_id = p_stage_id
),

prize_rule_evidence as
(
  select
    count(*)::integer as row_count,

    md5(
      coalesce(
        string_agg(
          (
            to_jsonb(bucket_rule)
            - 'created_at'
            - 'updated_at'
          )::text,
          '|'
          order by
            bucket_rule.race_class_code,
            bucket_rule.bucket_key
        ),
        ''
      )
    ) as semantic_hash

  from public.race_prize_bucket_rules bucket_rule
),

combined as
(
  select
    stage_identity.stage_id,
    stage_identity.race_id,
    stage_identity.stage_number,
    stage_identity.is_final_stage,

    stage_identity.process_plan
      -> 'stage'
      ->> 'route_format'
      as route_format,

    stage_identity.process_plan
      ->> 'status'
      as stage_process_status,

    result_evidence.row_count
      as stage_result_rows,

    result_evidence.semantic_hash
      as stage_result_semantic_hash,

    classification_evidence.row_count
      as classification_rows,

    classification_evidence.semantic_hash
      as classification_semantic_hash,

    prize_rule_evidence.row_count
      as prize_rule_rows,

    prize_rule_evidence.semantic_hash
      as prize_rule_semantic_hash,

    md5(
      coalesce(
        result_evidence.semantic_hash,
        ''
      )
      ||
      ':'
      ||
      coalesce(
        classification_evidence.semantic_hash,
        ''
      )
      ||
      ':'
      ||
      coalesce(
        prize_rule_evidence.semantic_hash,
        ''
      )
      ||
      ':'
      ||
      stage_identity.is_final_stage::text
      ||
      ':'
      ||
      stage_identity.race_id::text
      ||
      ':'
      ||
      stage_identity.stage_id::text
    ) as source_payload_hash

  from stage_identity
  cross join result_evidence
  cross join classification_evidence
  cross join prize_rule_evidence
)

select jsonb_build_object(
  'evidence_version',
    'prize_source_semantic_v1',

  'status',
    case
      when combined.stage_result_rows = 0
        then 'source_not_ready_no_stage_results'
      else 'source_evidence_ready'
    end,

  'stage_id',
    combined.stage_id,

  'race_id',
    combined.race_id,

  'stage_number',
    combined.stage_number,

  'is_final_stage',
    combined.is_final_stage,

  'route_format',
    combined.route_format,

  'stage_process_status',
    combined.stage_process_status,

  'stage_result_rows',
    combined.stage_result_rows,

  'stage_result_semantic_hash',
    combined.stage_result_semantic_hash,

  'classification_rows',
    combined.classification_rows,

  'classification_semantic_hash',
    combined.classification_semantic_hash,

  'prize_rule_rows',
    combined.prize_rule_rows,

  'prize_rule_semantic_hash',
    combined.prize_rule_semantic_hash,

  'source_payload_hash',
    combined.source_payload_hash,

  'volatile_fields_excluded',
    jsonb_build_array(
      'id',
      'created_at',
      'updated_at'
    )
)

from combined

union all

select jsonb_build_object(
  'evidence_version',
    'prize_source_semantic_v1',

  'status',
    'stage_not_found',

  'stage_id',
    p_stage_id
)

where not exists
(
  select 1
  from stage_identity
)

limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_prize_payment_source_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_identity as
(
  select
    stage_row.id as stage_id,
    stage_row.race_id,

    public.race_engine_get_stage_process_plan_v2(
      stage_row.id
    ) as process_plan

  from public.race_stages stage_row
  where stage_row.id = p_stage_id
),

award_rows as
(
  select
    prize_award.id as prize_award_id,
    prize_award.race_id,
    prize_award.stage_id,

    prize_award.bucket_key,
    prize_award.source_type,
    prize_award.classification_type,
    prize_award.rank,

    prize_award.recipient_type,
    prize_award.rider_id,
    prize_award.team_id as participating_club_id,

    case
      when club.club_type = 'developing'
           and club.parent_club_id is not null
        then club.parent_club_id
      else prize_award.team_id
    end as expected_payment_club_id,

    prize_award.amount_cash,
    lower(coalesce(prize_award.status, '')) as payment_status,
    prize_award.paid_at,

    prize_award.metadata

  from public.race_prize_awards prize_award

  left join public.clubs club
    on club.id = prize_award.team_id

  where prize_award.stage_id = p_stage_id
),

summary as
(
  select
    count(*)::integer as award_row_count,

    count(*) filter
    (
      where payment_status = 'pending'
        and paid_at is null
        and amount_cash > 0
    )::integer as payable_pending_row_count,

    count(*) filter
    (
      where payment_status = 'paid'
         or paid_at is not null
    )::integer as paid_row_count,

    count(*) filter
    (
      where expected_payment_club_id is null
    )::integer as missing_payment_club_count,

    count(*) filter
    (
      where amount_cash <= 0
    )::integer as nonpositive_amount_count,

    coalesce(sum(amount_cash), 0)::bigint
      as total_amount_cash,

    md5(
      coalesce(
        string_agg(
          jsonb_build_object(
            'prize_award_id',
              prize_award_id,

            'race_id',
              race_id,

            'stage_id',
              stage_id,

            'bucket_key',
              bucket_key,

            'source_type',
              source_type,

            'classification_type',
              classification_type,

            'rank',
              rank,

            'recipient_type',
              recipient_type,

            'rider_id',
              rider_id,

            'participating_club_id',
              participating_club_id,

            'expected_payment_club_id',
              expected_payment_club_id,

            'amount_cash',
              amount_cash,

            'payment_status',
              payment_status,

            'paid_at',
              paid_at
          )::text,
          '|'
          order by prize_award_id
        ),
        ''
      )
    ) as source_payload_hash,

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'prize_award_id',
            prize_award_id,

          'bucket_key',
            bucket_key,

          'rank',
            rank,

          'participating_club_id',
            participating_club_id,

          'expected_payment_club_id',
            expected_payment_club_id,

          'amount_cash',
            amount_cash,

          'payment_status',
            payment_status,

          'paid_at',
            paid_at
        )
        order by prize_award_id
      ),
      '[]'::jsonb
    ) as awards

  from award_rows
)

select jsonb_build_object(
  'evidence_version',
    'prize_payment_source_physical_v1',

  'status',
    case
      when stage_identity.stage_id is null
        then 'stage_not_found'

      when summary.award_row_count = 0
        then 'source_not_ready_no_prize_awards'

      when summary.missing_payment_club_count > 0
        then 'source_invalid_missing_payment_club'

      when summary.nonpositive_amount_count > 0
        then 'source_invalid_nonpositive_prize_amount'

      when summary.payable_pending_row_count =
           summary.award_row_count
        then 'source_ready_all_pending'

      when summary.paid_row_count =
           summary.award_row_count
        then 'source_historical_all_paid'

      else 'source_mixed_payment_state'
    end,

  'stage_id',
    stage_identity.stage_id,

  'race_id',
    stage_identity.race_id,

  'route_format',
    stage_identity.process_plan
      -> 'stage'
      ->> 'route_format',

  'stage_process_status',
    stage_identity.process_plan
      ->> 'status',

  'award_row_count',
    summary.award_row_count,

  'payable_pending_row_count',
    summary.payable_pending_row_count,

  'paid_row_count',
    summary.paid_row_count,

  'missing_payment_club_count',
    summary.missing_payment_club_count,

  'nonpositive_amount_count',
    summary.nonpositive_amount_count,

  'total_amount_cash',
    summary.total_amount_cash,

  'source_payload_hash',
    summary.source_payload_hash,

  'physical_award_id_retained',
    true,

  'physical_award_id_reason',
    'finance event-lock ref_id is the prize-award ID',

  'awards',
    summary.awards
)

from stage_identity
cross join summary

union all

select jsonb_build_object(
  'evidence_version',
    'prize_payment_source_physical_v1',

  'status',
    'stage_not_found',

  'stage_id',
    p_stage_id
)

where not exists
(
  select 1
  from stage_identity
)

limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_prize_payment_output_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
with
award_rows as
(
  select
    prize_award.id as prize_award_id,
    prize_award.race_id,
    prize_award.stage_id,
    prize_award.team_id as participating_club_id,

    case
      when club.club_type = 'developing'
           and club.parent_club_id is not null
        then club.parent_club_id
      else prize_award.team_id
    end as expected_payment_club_id,

    prize_award.amount_cash,
    lower(coalesce(prize_award.status, '')) as payment_status,
    prize_award.paid_at,
    prize_award.metadata as prize_metadata

  from public.race_prize_awards prize_award

  left join public.clubs club
    on club.id = prize_award.team_id

  where prize_award.stage_id = p_stage_id
),

lock_rows as
(
  select
    award.prize_award_id,

    event_lock.event_type,
    event_lock.club_id as payment_club_id,
    event_lock.ref_id,
    event_lock.transaction_id,

    transaction_row.type as transaction_type,
    transaction_row.metadata as transaction_metadata,

    count(entry_row.id)::integer as transaction_entry_count,
    coalesce(sum(entry_row.amount), 0)::bigint
      as transaction_entry_balance,

    coalesce(
      sum(entry_row.amount)
      filter
      (
        where entry_row.amount > 0
      ),
      0
    )::bigint as gross_positive_entries,

    coalesce(
      -sum(entry_row.amount)
      filter
      (
        where entry_row.amount < 0
      ),
      0
    )::bigint as gross_negative_entries

  from award_rows award

  left join finance.event_locks event_lock
    on event_lock.event_type = 'race_prize'
   and event_lock.ref_id = award.prize_award_id

  left join finance.transactions transaction_row
    on transaction_row.id =
       event_lock.transaction_id

  left join finance.entries entry_row
    on entry_row.transaction_id =
       transaction_row.id

  group by
    award.prize_award_id,
    event_lock.event_type,
    event_lock.club_id,
    event_lock.ref_id,
    event_lock.transaction_id,
    transaction_row.type,
    transaction_row.metadata
),

per_award as
(
  select
    award.prize_award_id,
    award.race_id,
    award.stage_id,

    award.participating_club_id,
    award.expected_payment_club_id,

    award.amount_cash,
    award.payment_status,
    award.paid_at,

    count(lock_row.transaction_id)::integer
      as matching_lock_count,

    count(distinct lock_row.transaction_id)::integer
      as distinct_prize_transaction_count,

    bool_and(
      lock_row.payment_club_id
      is not distinct from
      award.expected_payment_club_id
    )
    filter
    (
      where lock_row.transaction_id is not null
    ) as payment_club_matches_expected,

    bool_and(
      lock_row.transaction_type =
      'race_prize'
    )
    filter
    (
      where lock_row.transaction_id is not null
    ) as transaction_type_valid,

    bool_and(
      lock_row.transaction_entry_count >= 2
      and lock_row.transaction_entry_balance = 0
      and lock_row.gross_positive_entries =
          award.amount_cash
      and lock_row.gross_negative_entries =
          award.amount_cash
    )
    filter
    (
      where lock_row.transaction_id is not null
    ) as gross_entries_valid,

    bool_and(
      lock_row.transaction_metadata
        ->> 'race_prize_award_id'
      =
      award.prize_award_id::text
    )
    filter
    (
      where lock_row.transaction_id is not null
    ) as transaction_metadata_award_id_valid,

    (
      array_agg(
        lock_row.payment_club_id
        order by lock_row.payment_club_id::text
      )
      filter
      (
        where lock_row.payment_club_id is not null
      )
    )[1]
      as actual_payment_club_id,

    (
      array_agg(
        lock_row.transaction_id
        order by lock_row.transaction_id::text
      )
      filter
      (
        where lock_row.transaction_id is not null
      )
    )[1]
      as prize_transaction_id,

    max(lock_row.transaction_entry_count)
      as transaction_entry_count,

    max(lock_row.transaction_entry_balance)
      as transaction_entry_balance,

    max(lock_row.gross_positive_entries)
      as gross_positive_entries,

    max(lock_row.gross_negative_entries)
      as gross_negative_entries

  from award_rows award

  left join lock_rows lock_row
    on lock_row.prize_award_id =
       award.prize_award_id

  group by
    award.prize_award_id,
    award.race_id,
    award.stage_id,
    award.participating_club_id,
    award.expected_payment_club_id,
    award.amount_cash,
    award.payment_status,
    award.paid_at
),

tax_evidence as
(
  select
    count(*)::integer
      as linked_tax_transaction_count,

    md5(
      coalesce(
        string_agg(
          to_jsonb(tax_transaction)::text,
          '|'
          order by tax_transaction.id
        ),
        ''
      )
    ) as linked_tax_transaction_hash

  from finance.transactions tax_transaction

  where tax_transaction.metadata
        ->> 'source_transaction_id'
        in
        (
          select per_award.prize_transaction_id::text
          from per_award
          where per_award.prize_transaction_id
                is not null
        )
),

summary as
(
  select
    count(*)::integer
      as award_row_count,

    count(*) filter
    (
      where payment_status = 'paid'
         or paid_at is not null
    )::integer
      as paid_row_count,

    count(*) filter
    (
      where matching_lock_count = 1
    )::integer
      as exactly_one_lock_count,

    count(*) filter
    (
      where matching_lock_count > 1
    )::integer
      as duplicate_lock_count,

    count(*) filter
    (
      where prize_transaction_id is not null
    )::integer
      as linked_prize_transaction_count,

    count(*) filter
    (
      where payment_club_matches_expected
        and transaction_type_valid
        and gross_entries_valid
        and transaction_metadata_award_id_valid
        and matching_lock_count = 1
    )::integer
      as fully_valid_finance_row_count,

    count(*) filter
    (
      where not
      (
        payment_club_matches_expected
        and transaction_type_valid
        and gross_entries_valid
        and transaction_metadata_award_id_valid
        and matching_lock_count = 1
      )
    )::integer
      as invalid_finance_row_count,

    coalesce(sum(amount_cash), 0)::bigint
      as total_prize_amount_cash,

    coalesce(
      sum(amount_cash)
      filter
      (
        where payment_status = 'paid'
           or paid_at is not null
      ),
      0
    )::bigint
      as total_paid_amount_cash,

    coalesce(
      sum(gross_positive_entries),
      0
    )::bigint
      as total_gross_finance_credit,

    md5(
      coalesce(
        string_agg(
          jsonb_build_object(
            'prize_award_id',
              prize_award_id,

            'participating_club_id',
              participating_club_id,

            'expected_payment_club_id',
              expected_payment_club_id,

            'actual_payment_club_id',
              actual_payment_club_id,

            'amount_cash',
              amount_cash,

            'payment_status',
              payment_status,

            'paid_at',
              paid_at,

            'matching_lock_count',
              matching_lock_count,

            'prize_transaction_id',
              prize_transaction_id,

            'transaction_entry_count',
              transaction_entry_count,

            'transaction_entry_balance',
              transaction_entry_balance,

            'gross_positive_entries',
              gross_positive_entries,

            'gross_negative_entries',
              gross_negative_entries,

            'payment_club_matches_expected',
              payment_club_matches_expected,

            'transaction_type_valid',
              transaction_type_valid,

            'gross_entries_valid',
              gross_entries_valid,

            'transaction_metadata_award_id_valid',
              transaction_metadata_award_id_valid
          )::text,
          '|'
          order by prize_award_id
        ),
        ''
      )
      ||
      ':tax:'
      ||
      coalesce(
        (
          select tax_evidence.linked_tax_transaction_hash
          from tax_evidence
        ),
        ''
      )
    ) as finance_evidence_hash,

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'prize_award_id',
            prize_award_id,

          'participating_club_id',
            participating_club_id,

          'expected_payment_club_id',
            expected_payment_club_id,

          'actual_payment_club_id',
            actual_payment_club_id,

          'amount_cash',
            amount_cash,

          'payment_status',
            payment_status,

          'paid_at',
            paid_at,

          'matching_lock_count',
            matching_lock_count,

          'prize_transaction_id',
            prize_transaction_id,

          'transaction_entry_count',
            transaction_entry_count,

          'transaction_entry_balance',
            transaction_entry_balance,

          'gross_positive_entries',
            gross_positive_entries,

          'gross_negative_entries',
            gross_negative_entries,

          'payment_club_matches_expected',
            payment_club_matches_expected,

          'transaction_type_valid',
            transaction_type_valid,

          'gross_entries_valid',
            gross_entries_valid,

          'transaction_metadata_award_id_valid',
            transaction_metadata_award_id_valid
        )
        order by prize_award_id
      ),
      '[]'::jsonb
    ) as award_finance_rows

  from per_award
)

select jsonb_build_object(
  'evidence_version',
    'prize_payment_finance_identity_v1',

  'stage_id',
    p_stage_id,

  'status',
    case
      when summary.award_row_count = 0
        then 'no_prize_awards'

      when summary.paid_row_count =
           summary.award_row_count
       and summary.fully_valid_finance_row_count =
           summary.award_row_count
       and summary.invalid_finance_row_count = 0
       and summary.total_paid_amount_cash =
           summary.total_prize_amount_cash
       and summary.total_gross_finance_credit =
           summary.total_prize_amount_cash
        then 'paid_finance_evidence_complete'

      when summary.paid_row_count = 0
       and summary.exactly_one_lock_count = 0
       and summary.linked_prize_transaction_count = 0
        then 'unpaid_no_finance_evidence'

      else 'payment_finance_evidence_incomplete'
    end,

  'award_row_count',
    summary.award_row_count,

  'paid_row_count',
    summary.paid_row_count,

  'exactly_one_lock_count',
    summary.exactly_one_lock_count,

  'duplicate_lock_count',
    summary.duplicate_lock_count,

  'linked_prize_transaction_count',
    summary.linked_prize_transaction_count,

  'fully_valid_finance_row_count',
    summary.fully_valid_finance_row_count,

  'invalid_finance_row_count',
    summary.invalid_finance_row_count,

  'total_prize_amount_cash',
    summary.total_prize_amount_cash,

  'total_paid_amount_cash',
    summary.total_paid_amount_cash,

  'total_gross_finance_credit',
    summary.total_gross_finance_credit,

  'linked_tax_transaction_count',
    tax_evidence.linked_tax_transaction_count,

  'linked_tax_transaction_hash',
    tax_evidence.linked_tax_transaction_hash,

  'finance_evidence_hash',
    summary.finance_evidence_hash,

  'physical_award_id_is_finance_identity',
    true,

  'award_finance_rows',
    summary.award_finance_rows
)

from summary
cross join tax_evidence;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_development_trigger_ownership_v2()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with rows as
(
  select
    t.tgname as trigger_name,
    t.tgenabled as enabled_code,
    tn.nspname as table_schema,
    c.relname as table_name,
    p.oid::regprocedure::text as function_signature,
    md5(pg_get_functiondef(p.oid)) as function_hash,
    md5(pg_get_triggerdef(t.oid,true)) as trigger_hash,
    pg_get_triggerdef(t.oid,true) as trigger_definition,
    t.tgname in (
      'trg_award_race_development_on_rider_state_v1',
      'trg_award_race_development_on_run_completed_v1'
    ) as is_producer,
    t.tgname='trg_apply_race_development_progress_bank_v1' as is_bank
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace tn on tn.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  where not t.tgisinternal
    and t.tgname in (
      'trg_award_race_development_on_rider_state_v1',
      'trg_award_race_development_on_run_completed_v1',
      'trg_apply_race_development_progress_bank_v1'
    )
),
s as
(
  select
    count(*)::integer as trigger_count,
    count(*) filter(where is_producer and enabled_code in('O','A'))::integer
      as enabled_producers,
    count(*) filter(where is_bank and enabled_code in('O','A'))::integer
      as enabled_bank,
    md5(coalesce(string_agg(
      trigger_name||':'||enabled_code::text||':'||function_hash||':'||trigger_hash,
      '|' order by trigger_name
    ),'')) as ownership_hash,
    jsonb_agg(jsonb_build_object(
      'trigger_name',trigger_name,
      'table_schema',table_schema,
      'table_name',table_name,
      'enabled_code',enabled_code,
      'is_enabled',enabled_code in('O','A'),
      'is_legacy_producer',is_producer,
      'is_downstream_progress_bank',is_bank,
      'function_signature',function_signature,
      'function_definition_hash',function_hash,
      'trigger_definition_hash',trigger_hash,
      'trigger_definition',trigger_definition
    ) order by trigger_name) as triggers
  from rows
)
select jsonb_build_object(
  'ownership_version','phase3ab_b12_development_trigger_ownership_v1',
  'status',case
    when trigger_count<>3 then 'trigger_contract_incomplete'
    when enabled_producers=2 and enabled_bank=1
      then 'dual_legacy_producer_ownership_active'
    when enabled_producers=0 and enabled_bank=1
      then 'ready_for_v2_adapter_owner'
    else 'unexpected_trigger_ownership_state'
  end,
  'canonical_future_owner','universal_stage_processor_v2',
  'trigger_row_count',trigger_count,
  'enabled_legacy_producer_count',enabled_producers,
  'enabled_progress_bank_count',enabled_bank,
  'ownership_hash',ownership_hash,
  'production_cutover_ready',enabled_producers=0 and enabled_bank=1,
  'b12_cutover_allowed',false,
  'triggers',triggers
)
from s;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_development_source_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with st as
(
  select
    s.id stage_id, s.race_id, run.id simulation_run_id,
    lower(coalesce(run.status,'not_created')) simulation_status,
    public.race_engine_get_stage_process_plan_v2(s.id) process_plan
  from public.race_stages s
  left join public.race_stage_simulation_runs run on run.stage_id=s.id
  where s.id=p_stage_id
),
rs as
(
  select
    count(*)::integer rider_state_rows,
    count(*) filter(where x.stage_status in('finished','dnf'))::integer eligible_rows,
    count(distinct x.rider_id)::integer distinct_riders,
    md5(coalesce(string_agg(
      (to_jsonb(x)-'id'-'created_at'-'updated_at')::text,
      '|' order by x.rider_id
    ),'')) state_hash
  from public.race_stage_rider_states x
  join st on st.simulation_run_id=x.simulation_run_id
),
rr as
(
  select
    count(*)::integer result_rows,
    md5(coalesce(string_agg(
      (to_jsonb(x)-'id'-'created_at'-'updated_at')::text,
      '|' order by x.rank,x.rider_id
    ),'')) result_hash
  from public.race_stage_results x
  where x.stage_id=p_stage_id
)
select jsonb_build_object(
  'evidence_version','development_source_semantic_v1',
  'status',case
    when st.stage_id is null then 'stage_not_found'
    when st.simulation_status<>'completed' then 'source_not_ready_run_not_completed'
    when rs.rider_state_rows=0 then 'source_not_ready_no_rider_states'
    when rs.eligible_rows=0 then 'source_not_ready_no_eligible_rider_states'
    else 'source_evidence_ready'
  end,
  'stage_id',st.stage_id,
  'race_id',st.race_id,
  'simulation_run_id',st.simulation_run_id,
  'simulation_status',st.simulation_status,
  'route_format',st.process_plan->'stage'->>'route_format',
  'stage_process_status',st.process_plan->>'status',
  'rider_state_rows',rs.rider_state_rows,
  'eligible_state_rows',rs.eligible_rows,
  'distinct_rider_count',rs.distinct_riders,
  'stage_result_rows',rr.result_rows,
  'rider_state_semantic_hash',rs.state_hash,
  'stage_result_semantic_hash',rr.result_hash,
  'source_payload_hash',md5(
    coalesce(rs.state_hash,'')||':'||coalesce(rr.result_hash,'')||':'||
    coalesce(st.simulation_run_id::text,'')
  )
)
from st cross join rs cross join rr
union all
select jsonb_build_object(
  'evidence_version','development_source_semantic_v1',
  'status','stage_not_found','stage_id',p_stage_id
)
where not exists(select 1 from st)
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_development_output_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with st as
(
  select s.id stage_id, run.id simulation_run_id
  from public.race_stages s
  left join public.race_stage_simulation_runs run on run.stage_id=s.id
  where s.id=p_stage_id
),
targets as
(
  select x.rider_id
  from public.race_stage_rider_states x
  join st on st.simulation_run_id=x.simulation_run_id
  where x.stage_status in('finished','dnf')
),
ev as
(
  select
    count(*)::integer event_rows,
    count(distinct e.rider_id)::integer event_riders,
    count(*) filter(where e.applied_to_condition)::integer condition_applied,
    count(*) filter(where e.applied_to_progress_bank)::integer bank_applied,
    count(*)::integer-count(distinct (e.simulation_run_id,e.rider_id))::integer
      as duplicates,
    coalesce(sum(e.total_progress_points),0)::numeric total_progress,
    md5(coalesce(string_agg(
      (to_jsonb(e)-'id'-'created_at'-'updated_at'-'progress_bank_applied_at')::text,
      '|' order by e.rider_id
    ),'')) event_semantic_hash,
    md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by e.id),''))
      event_identity_hash
  from public.rider_race_development_events e
  join st on st.simulation_run_id=e.simulation_run_id
),
cond as
(
  select count(*)::integer rows,
    md5(coalesce(string_agg(
      (to_jsonb(c)-'updated_at')::text,'|' order by c.rider_id
    ),'')) hash
  from public.rider_race_condition c join targets t on t.rider_id=c.rider_id
),
bank as
(
  select count(*)::integer rows,
    md5(coalesce(string_agg(
      (to_jsonb(b)-'created_at'-'updated_at')::text,
      '|' order by to_jsonb(b)::text
    ),'')) hash
  from public.rider_attribute_progress_bank b
  join targets t on t.rider_id=b.rider_id
),
rider as
(
  select count(*)::integer rows,
    md5(coalesce(string_agg(
      (to_jsonb(r)-'created_at'-'updated_at')::text,'|' order by r.id
    ),'')) hash
  from public.riders r join targets t on t.rider_id=r.id
),
n as (select count(*)::integer eligible from targets)
select jsonb_build_object(
  'evidence_version','development_output_semantic_v1',
  'stage_id',st.stage_id,
  'simulation_run_id',st.simulation_run_id,
  'status',case
    when st.stage_id is null then 'stage_not_found'
    when n.eligible=0 then 'no_eligible_riders'
    when ev.event_rows=0 then 'no_development_events'
    when ev.event_rows=n.eligible and ev.event_riders=n.eligible
      and ev.condition_applied=ev.event_rows
      and ev.bank_applied=ev.event_rows
      and ev.duplicates=0
      then 'development_output_complete'
    else 'development_output_incomplete'
  end,
  'eligible_rider_count',n.eligible,
  'event_row_count',ev.event_rows,
  'distinct_event_rider_count',ev.event_riders,
  'applied_to_condition_count',ev.condition_applied,
  'applied_to_progress_bank_count',ev.bank_applied,
  'duplicate_run_rider_count',ev.duplicates,
  'total_progress_points',ev.total_progress,
  'condition_row_count',cond.rows,
  'progress_bank_row_count',bank.rows,
  'rider_row_count',rider.rows,
  'event_semantic_hash',ev.event_semantic_hash,
  'event_identity_hash',ev.event_identity_hash,
  'condition_semantic_hash',cond.hash,
  'progress_bank_semantic_hash',bank.hash,
  'rider_semantic_hash',rider.hash,
  'combined_output_hash',md5(
    coalesce(ev.event_semantic_hash,'')||':'||coalesce(cond.hash,'')||':'||
    coalesce(bank.hash,'')||':'||coalesce(rider.hash,'')
  ),
  'event_identity_hash_is_audit_only',true,
  'unique_event_contract','simulation_run_id,rider_id'
)
from st cross join ev cross join cond cross join bank cross join rider cross join n
union all
select jsonb_build_object(
  'evidence_version','development_output_semantic_v1',
  'status','stage_not_found','stage_id',p_stage_id
)
where not exists(select 1 from st)
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_fatigue_source_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_identity as
(
  select
    stage_row.id as stage_id,
    stage_row.race_id,
    simulation_row.id as simulation_run_id,
    lower(coalesce(simulation_row.status, 'not_created')) as simulation_status,
    public.race_engine_get_stage_process_plan_v2(stage_row.id) as process_plan
  from public.race_stages stage_row
  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id = stage_row.id
  where stage_row.id = p_stage_id
),

eligible_rows as
(
  select
    state_row.rider_id,
    state_row.stage_status,
    state_row.fatigue_before_stage,
    state_row.fatigue_gain,
    state_row.fatigue_after_stage,
    least(
      100,
      greatest(
        0,
        state_row.fatigue_after_stage::integer
      )
    ) as target_fatigue
  from public.race_stage_rider_states state_row
  join stage_identity stage_row
    on stage_row.simulation_run_id = state_row.simulation_run_id
  where state_row.stage_status in ('finished', 'dnf')
),

summary as
(
  select
    count(*)::integer as eligible_rider_count,
    count(distinct rider_id)::integer as distinct_rider_count,
    count(*) filter
    (
      where fatigue_after_stage is null
    )::integer as null_target_count,
    count(*) filter
    (
      where fatigue_after_stage < 0
         or fatigue_after_stage > 100
    )::integer as out_of_range_target_count,
    min(target_fatigue)::integer as minimum_target_fatigue,
    max(target_fatigue)::integer as maximum_target_fatigue,
    avg(target_fatigue)::numeric as average_target_fatigue,

    md5(
      coalesce(
        string_agg(
          jsonb_build_object(
            'rider_id', rider_id,
            'stage_status', stage_status,
            'fatigue_before_stage', fatigue_before_stage,
            'fatigue_gain', fatigue_gain,
            'fatigue_after_stage', fatigue_after_stage,
            'target_fatigue', target_fatigue
          )::text,
          '|'
          order by rider_id
        ),
        ''
      )
    ) as source_payload_hash,

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rider_id', rider_id,
          'stage_status', stage_status,
          'fatigue_before_stage', fatigue_before_stage,
          'fatigue_gain', fatigue_gain,
          'fatigue_after_stage', fatigue_after_stage,
          'target_fatigue', target_fatigue
        )
        order by rider_id
      ),
      '[]'::jsonb
    ) as target_rows
  from eligible_rows
)

select jsonb_build_object(
  'evidence_version', 'fatigue_source_semantic_v1',

  'status',
    case
      when stage_identity.stage_id is null
        then 'stage_not_found'
      when stage_identity.simulation_status <> 'completed'
        then 'source_not_ready_run_not_completed'
      when summary.eligible_rider_count = 0
        then 'source_not_ready_no_eligible_rider_states'
      when summary.null_target_count > 0
        then 'source_invalid_null_fatigue_target'
      else 'source_evidence_ready'
    end,

  'stage_id', stage_identity.stage_id,
  'race_id', stage_identity.race_id,
  'simulation_run_id', stage_identity.simulation_run_id,
  'simulation_status', stage_identity.simulation_status,
  'route_format', stage_identity.process_plan -> 'stage' ->> 'route_format',
  'stage_process_status', stage_identity.process_plan ->> 'status',

  'eligible_rider_count', summary.eligible_rider_count,
  'distinct_rider_count', summary.distinct_rider_count,
  'null_target_count', summary.null_target_count,
  'out_of_range_target_count', summary.out_of_range_target_count,
  'minimum_target_fatigue', summary.minimum_target_fatigue,
  'maximum_target_fatigue', summary.maximum_target_fatigue,
  'average_target_fatigue', summary.average_target_fatigue,
  'source_payload_hash', summary.source_payload_hash,
  'target_rows', summary.target_rows,

  'target_clamp_rule', 'least(100,greatest(0,fatigue_after_stage::integer))'
)
from stage_identity
cross join summary

union all

select jsonb_build_object(
  'evidence_version', 'fatigue_source_semantic_v1',
  'status', 'stage_not_found',
  'stage_id', p_stage_id
)
where not exists
(
  select 1
  from stage_identity
)
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_fatigue_output_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_identity as
(
  select
    stage_row.id as stage_id,
    simulation_row.id as simulation_run_id
  from public.race_stages stage_row
  left join public.race_stage_simulation_runs simulation_row
    on simulation_row.stage_id = stage_row.id
  where stage_row.id = p_stage_id
),

comparison_rows as
(
  select
    state_row.rider_id,
    rider_row.fatigue as current_fatigue,
    state_row.fatigue_before_stage,
    state_row.fatigue_gain,
    state_row.fatigue_after_stage,
    least(
      100,
      greatest(
        0,
        state_row.fatigue_after_stage::integer
      )
    ) as target_fatigue,

    rider_row.fatigue is not distinct from
    least(
      100,
      greatest(
        0,
        state_row.fatigue_after_stage::integer
      )
    ) as target_matches_current

  from public.race_stage_rider_states state_row

  join stage_identity stage_row
    on stage_row.simulation_run_id = state_row.simulation_run_id

  join public.riders rider_row
    on rider_row.id = state_row.rider_id

  where state_row.stage_status in ('finished', 'dnf')
),

summary as
(
  select
    count(*)::integer as eligible_rider_count,

    count(*) filter
    (
      where target_matches_current
    )::integer as matching_rider_count,

    count(*) filter
    (
      where not target_matches_current
    )::integer as mismatching_rider_count,

    max(
      abs(
        coalesce(current_fatigue, 0)
        -
        coalesce(target_fatigue, 0)
      )
    )::integer as maximum_absolute_difference,

    md5(
      coalesce(
        string_agg(
          jsonb_build_object(
            'rider_id', rider_id,
            'current_fatigue', current_fatigue,
            'target_fatigue', target_fatigue,
            'target_matches_current', target_matches_current
          )::text,
          '|'
          order by rider_id
        ),
        ''
      )
    ) as current_vs_target_hash,

    md5(
      coalesce(
        string_agg(
          jsonb_build_object(
            'rider_id', rider_id,
            'target_fatigue', target_fatigue
          )::text,
          '|'
          order by rider_id
        ),
        ''
      )
    ) as target_only_hash,

    md5(
      coalesce(
        string_agg(
          jsonb_build_object(
            'rider_id', rider_id,
            'current_fatigue', current_fatigue
          )::text,
          '|'
          order by rider_id
        ),
        ''
      )
    ) as current_only_hash,

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rider_id', rider_id,
          'current_fatigue', current_fatigue,
          'target_fatigue', target_fatigue,
          'target_matches_current', target_matches_current
        )
        order by rider_id
      ),
      '[]'::jsonb
    ) as comparison_rows

  from comparison_rows
)

select jsonb_build_object(
  'evidence_version', 'fatigue_output_current_vs_target_v1',
  'stage_id', stage_identity.stage_id,
  'simulation_run_id', stage_identity.simulation_run_id,

  'status',
    case
      when stage_identity.stage_id is null
        then 'stage_not_found'
      when summary.eligible_rider_count = 0
        then 'no_eligible_riders'
      when summary.mismatching_rider_count = 0
        then 'fatigue_output_matches_stage_target'
      else 'fatigue_output_differs_from_stage_target'
    end,

  'eligible_rider_count', summary.eligible_rider_count,
  'matching_rider_count', summary.matching_rider_count,
  'mismatching_rider_count', summary.mismatching_rider_count,
  'maximum_absolute_difference', summary.maximum_absolute_difference,

  'current_vs_target_hash', summary.current_vs_target_hash,
  'target_only_hash', summary.target_only_hash,
  'current_only_hash', summary.current_only_hash,

  'historical_reapply_safe', false,
  'historical_reapply_risk',
    'An old stage target can overwrite fatigue produced by later game activity.',

  'comparison_rows', summary.comparison_rows
)
from stage_identity
cross join summary

union all

select jsonb_build_object(
  'evidence_version', 'fatigue_output_current_vs_target_v1',
  'status', 'stage_not_found',
  'stage_id', p_stage_id
)
where not exists
(
  select 1
  from stage_identity
)
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_weather_exposure_source_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_identity as
(
  select
    s.id stage_id,
    s.race_id,
    s.stage_date,
    coalesce(s.weather_cancelled,false) weather_cancelled,
    run.id simulation_run_id,
    lower(coalesce(run.status,'not_created')) simulation_status,
    public.race_engine_get_stage_process_plan_v2(s.id) process_plan,
    public.race_engine_stage_rain_jacket_requirement_v1(s.id)
      weather_requirement
  from public.race_stages s
  left join public.race_stage_simulation_runs run on run.stage_id=s.id
  where s.id=p_stage_id
),
state_summary as
(
  select
    count(*)::integer rider_state_count,
    count(*) filter(where x.stage_status='finished')::integer finished_count,
    count(*) filter(where x.stage_status='dnf')::integer dnf_count,
    count(distinct x.rider_id)::integer distinct_riders,
    md5(coalesce(string_agg(
      jsonb_build_object(
        'rider_id',x.rider_id,
        'team_id',x.team_id,
        'stage_status',x.stage_status,
        'race_id',x.race_id,
        'stage_id',x.stage_id,
        'simulation_run_id',x.simulation_run_id
      )::text,
      '|' order by x.rider_id
    ),'')) state_hash
  from public.race_stage_rider_states x
  join stage_identity st on st.simulation_run_id=x.simulation_run_id
),
preparation_summary as
(
  select
    count(*)::integer preparation_count,
    md5(coalesce(string_agg(
      (to_jsonb(p)-'created_at'-'updated_at')::text,
      '|' order by p.id
    ),'')) preparation_hash
  from public.race_preparations p
  join stage_identity st on st.race_id=p.race_id
),
plan_summary as
(
  select
    count(*)::integer plan_count,
    md5(coalesce(string_agg(
      jsonb_build_object(
        'plan_id',sp.id,
        'race_preparation_id',sp.race_preparation_id,
        'stage_id',sp.stage_id,
        'rider_supplies_json',coalesce(sp.rider_supplies_json,'{}'::jsonb)
      )::text,
      '|' order by sp.id
    ),'')) plan_hash
  from public.race_stage_plans sp
  join public.race_preparations p on p.id=sp.race_preparation_id
  join stage_identity st on st.race_id=p.race_id
  where sp.stage_id=st.stage_id
)
select jsonb_build_object(
  'evidence_version','weather_exposure_source_semantic_v1',
  'status',case
    when st.stage_id is null then 'stage_not_found'
    when st.weather_cancelled then 'route_skipped_weather_cancelled'
    when st.simulation_status<>'completed'
      then 'source_not_ready_run_not_completed'
    when ss.rider_state_count=0
      then 'source_not_ready_no_rider_states'
    when st.process_plan->'stage'->>'route_format'<>'road_race'
      then 'source_route_not_validated_for_v1'
    else 'source_evidence_ready'
  end,
  'stage_id',st.stage_id,
  'race_id',st.race_id,
  'stage_date',st.stage_date,
  'simulation_run_id',st.simulation_run_id,
  'simulation_status',st.simulation_status,
  'route_format',st.process_plan->'stage'->>'route_format',
  'stage_process_status',st.process_plan->>'status',
  'weather_cancelled',st.weather_cancelled,
  'weather_requirement',st.weather_requirement,
  'rain_jacket_required',
    coalesce((st.weather_requirement->>'rain_jacket_required')::boolean,false),
  'weather_reason',coalesce(st.weather_requirement->>'reason','not required'),
  'rider_state_count',ss.rider_state_count,
  'finished_rider_count',ss.finished_count,
  'dnf_rider_count',ss.dnf_count,
  'distinct_rider_count',ss.distinct_riders,
  'preparation_row_count',ps.preparation_count,
  'stage_plan_row_count',pls.plan_count,
  'rider_state_source_hash',ss.state_hash,
  'preparation_hash',ps.preparation_hash,
  'stage_plan_hash',pls.plan_hash,
  'source_payload_hash',md5(
    coalesce(st.weather_requirement::text,'')||':'||
    coalesce(ss.state_hash,'')||':'||
    coalesce(ps.preparation_hash,'')||':'||
    coalesce(pls.plan_hash,'')||':'||
    coalesce(st.simulation_run_id::text,'')
  )
)
from stage_identity st
cross join state_summary ss
cross join preparation_summary ps
cross join plan_summary pls

union all

select jsonb_build_object(
  'evidence_version','weather_exposure_source_semantic_v1',
  'status','stage_not_found',
  'stage_id',p_stage_id
)
where not exists(select 1 from stage_identity)
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_weather_exposure_output_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
src as
(
  select public.race_engine_get_stage_weather_exposure_source_evidence_v2(
    p_stage_id
  ) evidence
),
identity_row as
(
  select
    nullif(evidence->>'simulation_run_id','')::uuid simulation_run_id,
    coalesce((evidence->>'rain_jacket_required')::boolean,false) required,
    coalesce((evidence->>'rider_state_count')::integer,0) state_count,
    coalesce((evidence->>'finished_rider_count')::integer,0) finished_count
  from src
),
exposure_summary as
(
  select
    count(*)::integer exposure_count,
    count(distinct e.rider_id)::integer exposure_riders,
    count(*) filter(where e.rain_jacket_required)::integer required_rows,
    count(*) filter(where e.rain_jacket_used)::integer used_rows,
    count(*) filter(
      where e.rain_jacket_required and not e.rain_jacket_used
    )::integer missing_rows,
    count(*) filter(where e.illness_case_created)::integer illness_created,
    count(*) filter(where e.illness_case_result is not null)::integer
      illness_results,
    md5(coalesce(string_agg(
      (to_jsonb(e)-'created_at'-'updated_at')::text,
      '|' order by e.rider_id
    ),'')) semantic_hash,
    md5(coalesce(string_agg(
      to_jsonb(e)::text,
      '|' order by e.id
    ),'')) identity_hash
  from public.race_stage_weather_exposure_events e
  join identity_row i on i.simulation_run_id=e.simulation_run_id
  where e.stage_id=p_stage_id
),
state_summary as
(
  select
    count(*)::integer state_rows,
    count(*) filter(
      where coalesce((s.metadata->>'rain_jacket_required')::boolean,false)
            = i.required
    )::integer requirement_matches,
    count(*) filter(
      where i.required
        and s.stage_status='finished'
        and s.metadata?'weather_exposure_event_id'
    )::integer event_id_rows,
    count(*) filter(
      where not i.required
        and coalesce((s.metadata->>'rain_jacket_required')::boolean,true)=false
    )::integer not_required_rows,
    md5(coalesce(string_agg(
      jsonb_build_object(
        'rider_id',s.rider_id,
        'stage_status',s.stage_status,
        'rain_jacket_required',s.metadata->'rain_jacket_required',
        'rain_jacket_used',s.metadata->'rain_jacket_used',
        'rain_jacket_weather_reason',s.metadata->'rain_jacket_weather_reason',
        'rain_jacket_illness_risk_score',
          s.metadata->'rain_jacket_illness_risk_score',
        'rain_jacket_model',s.metadata->'rain_jacket_model',
        'weather_exposure_event_id',s.metadata->'weather_exposure_event_id'
      )::text,
      '|' order by s.rider_id
    ),'')) metadata_hash
  from public.race_stage_rider_states s
  join identity_row i on i.simulation_run_id=s.simulation_run_id
)
select jsonb_build_object(
  'evidence_version','weather_exposure_output_semantic_v1',
  'stage_id',p_stage_id,
  'simulation_run_id',i.simulation_run_id,
  'rain_jacket_required',i.required,
  'status',case
    when i.simulation_run_id is null
      then 'stage_or_simulation_run_not_found'
    when not i.required
      and sm.state_rows=i.state_count
      and sm.not_required_rows=i.state_count
      and es.exposure_count=0
      then 'weather_exposure_skipped_not_required_complete'
    when i.required
      and es.exposure_count=i.finished_count
      and es.exposure_riders=i.finished_count
      and es.required_rows=i.finished_count
      and sm.event_id_rows=i.finished_count
      then 'weather_exposure_output_complete'
    when i.required then 'weather_exposure_output_incomplete'
    else 'weather_exposure_not_required_output_incomplete'
  end,
  'rider_state_count',i.state_count,
  'finished_rider_count',i.finished_count,
  'exposure_row_count',es.exposure_count,
  'distinct_exposure_rider_count',es.exposure_riders,
  'jacket_required_row_count',es.required_rows,
  'jacket_used_row_count',es.used_rows,
  'jacket_missing_row_count',es.missing_rows,
  'illness_case_created_count',es.illness_created,
  'illness_case_result_count',es.illness_results,
  'requirement_metadata_match_count',sm.requirement_matches,
  'event_id_metadata_count',sm.event_id_rows,
  'not_required_metadata_count',sm.not_required_rows,
  'exposure_semantic_hash',es.semantic_hash,
  'exposure_identity_hash',es.identity_hash,
  'rider_state_weather_metadata_hash',sm.metadata_hash,
  'combined_output_hash',md5(
    coalesce(es.semantic_hash,'')||':'||coalesce(sm.metadata_hash,'')
  ),
  'physical_event_identity_retained',true,
  'health_case_rerun_safety_assumed',false
)
from identity_row i
cross join exposure_summary es
cross join state_summary sm;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_daily_activity_trigger_ownership_v2()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select jsonb_build_object(
  'ownership_version','phase3ab_b15_daily_activity_trigger_ownership_v1',
  'status',case
    when count(*) filter(where t.tgenabled in('O','A'))=1
      and bool_and(md5(pg_get_functiondef(p.oid))
        ='d5f22c81b3ef6238c596a994dcafb7d9')
      and bool_and(md5(pg_get_triggerdef(t.oid,true))
        ='a48f8dee1df7134b3aa592739cfadbb1')
      then 'legacy_result_insert_trigger_active'
    else 'unexpected_daily_activity_trigger_state'
  end,
  'enabled_trigger_count',
    count(*) filter(where t.tgenabled in('O','A')),
  'future_owner','explicit_v2_stage_daily_activity_adapter',
  'cutover_allowed_in_b15',false,
  'current_identity','rider_id,activity_date',
  'same_day_source_replacement_currently_possible',true,
  'triggers',coalesce(jsonb_agg(jsonb_build_object(
    'trigger_name',t.tgname,
    'table_schema',n.nspname,
    'table_name',c.relname,
    'enabled_code',t.tgenabled,
    'trigger_definition',pg_get_triggerdef(t.oid,true),
    'trigger_definition_hash',md5(pg_get_triggerdef(t.oid,true)),
    'function_signature',p.oid::regprocedure::text,
    'function_definition_hash',md5(pg_get_functiondef(p.oid))
  ) order by t.tgname),'[]'::jsonb)
)
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal
  and n.nspname='public'
  and c.relname='race_stage_results'
  and t.tgname='trg_race_stage_results_upsert_daily_activity_v1';
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_daily_activity_projection_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
stage_row as
(
  select
    s.id stage_id,s.race_id,s.stage_date,s.stage_number,s.name stage_name,
    s.distance_km,s.terrain_type,s.stage_format,s.elevation_gain_m,
    s.hilly_pct,s.mountain_pct,
    r.name race_name,r.category race_category,r.race_type,
    r.is_stage_race,
    public.race_engine_get_stage_process_plan_v2(s.id) process_plan
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id
),
projected as
(
  select
    sr.rider_id,
    st.stage_date activity_date,
    true participated,
    'race'::text source,
    'race'::text activity_type,
    case
      when lower(coalesce(st.stage_format,'')) in
           ('individual_time_trial','team_time_trial','time_trial','prologue')
        then 'hard'
      when lower(coalesce(st.terrain_type,'')) like '%mountain%'
        or coalesce(st.mountain_pct,0)>=25
        or coalesce(st.elevation_gain_m,0)>=2500
        then 'hard'
      when lower(coalesce(st.terrain_type,'')) like '%hilly%'
        or coalesce(st.hilly_pct,0)>=35
        or coalesce(st.distance_km,0)>=180
        then 'hard'
      else 'normal'
    end intensity,
    case
      when lower(coalesce(st.stage_format,'')) in
           ('individual_time_trial','team_time_trial','time_trial','prologue')
        then 20
      when lower(coalesce(st.terrain_type,'')) like '%mountain%'
        or coalesce(st.mountain_pct,0)>=25
        or coalesce(st.elevation_gain_m,0)>=2500
        then 30
      when lower(coalesce(st.terrain_type,'')) like '%hilly%'
        or coalesce(st.hilly_pct,0)>=35
        or coalesce(st.distance_km,0)>=180
        then 24
      else 16
    end::smallint fatigue_load,
    0::smallint recovery_bonus,
    sr.stage_id source_id,
    jsonb_build_object(
      'race_id',sr.race_id,
      'stage_id',sr.stage_id,
      'team_id',sr.team_id,
      'race_name',coalesce(st.race_name,''),
      'race_category',coalesce(st.race_category,''),
      'race_type',coalesce(st.race_type,''),
      'is_stage_race',coalesce(st.is_stage_race,false),
      'stage_number',st.stage_number,
      'stage_name',coalesce(st.stage_name,''),
      'stage_format',coalesce(st.stage_format,''),
      'terrain_type',coalesce(st.terrain_type,''),
      'distance_km',st.distance_km,
      'elevation_gain_m',st.elevation_gain_m,
      'result_status',sr.status,
      'result_rank',sr.rank,
      'elapsed_seconds',sr.elapsed_seconds,
      'gap_seconds',sr.gap_seconds,
      'source','race_stage_results_trigger'
    ) metadata
  from public.race_stage_results sr
  join stage_row st on st.stage_id=sr.stage_id
  join public.riders rider on rider.id=sr.rider_id
  where lower(coalesce(sr.status,'finished')) not in
        (
          'dns','did_not_start','not_started',
          'not_selected','withdrawn_before_start'
        )
),
summary as
(
  select
    count(*)::integer projected_rows,
    count(distinct rider_id)::integer projected_riders,
    count(*) filter(where intensity='hard')::integer hard_rows,
    count(*) filter(where intensity='normal')::integer normal_rows,
    min(fatigue_load)::integer min_load,
    max(fatigue_load)::integer max_load,
    md5(coalesce(string_agg(
      jsonb_build_object(
        'rider_id',rider_id,
        'activity_date',activity_date,
        'participated',participated,
        'source',source,
        'activity_type',activity_type,
        'intensity',intensity,
        'fatigue_load',fatigue_load,
        'recovery_bonus',recovery_bonus,
        'source_id',source_id,
        'metadata',metadata
      )::text,
      '|' order by rider_id
    ),'')) projection_hash,
    coalesce(jsonb_agg(jsonb_build_object(
      'rider_id',rider_id,
      'activity_date',activity_date,
      'participated',participated,
      'source',source,
      'activity_type',activity_type,
      'intensity',intensity,
      'fatigue_load',fatigue_load,
      'recovery_bonus',recovery_bonus,
      'source_id',source_id,
      'metadata',metadata
    ) order by rider_id),'[]'::jsonb) projected_rows_json
  from projected
)
select jsonb_build_object(
  'projection_version','daily_activity_projection_source_v1',
  'status',case
    when st.stage_id is null then 'stage_not_found'
    when st.stage_date is null then 'projection_not_ready_missing_stage_date'
    when s.projected_rows=0 then 'projection_not_ready_no_participating_results'
    else 'projection_ready'
  end,
  'stage_id',st.stage_id,
  'race_id',st.race_id,
  'activity_date',st.stage_date,
  'route_format',st.process_plan->'stage'->>'route_format',
  'stage_process_status',st.process_plan->>'status',
  'projected_row_count',s.projected_rows,
  'projected_rider_count',s.projected_riders,
  'hard_intensity_count',s.hard_rows,
  'normal_intensity_count',s.normal_rows,
  'minimum_fatigue_load',s.min_load,
  'maximum_fatigue_load',s.max_load,
  'activity_identity','rider_id,activity_date',
  'same_day_merge_policy','race_overwrites_source/type/source_id; hard and maximum fatigue load win; metadata merges',
  'projection_hash',s.projection_hash,
  'projected_rows',s.projected_rows_json
)
from stage_row st
cross join summary s

union all

select jsonb_build_object(
  'projection_version','daily_activity_projection_source_v1',
  'status','stage_not_found',
  'stage_id',p_stage_id
)
where not exists(select 1 from stage_row)
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_daily_activity_output_evidence_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
projection as
(
  select public.race_engine_get_stage_daily_activity_projection_v2(
    p_stage_id
  ) p
),
projected as
(
  select
    (x->>'rider_id')::uuid rider_id,
    (x->>'activity_date')::date activity_date,
    x projected_json
  from projection
  cross join lateral jsonb_array_elements(p->'projected_rows') x
),
comparison as
(
  select
    p.rider_id,
    p.activity_date,
    a.rider_id is not null activity_found,
    a.source,
    a.activity_type,
    a.intensity,
    a.fatigue_load,
    a.recovery_bonus,
    a.source_id,
    a.metadata,
    (
      a.rider_id is not null
      and a.participated
      and a.source='race'
      and a.activity_type='race'
      and a.source_id=p_stage_id
      and a.intensity=(p.projected_json->>'intensity')
      and a.fatigue_load=(p.projected_json->>'fatigue_load')::smallint
      and coalesce(a.recovery_bonus,0)=0
      and a.metadata->>'stage_id'=p_stage_id::text
    ) exact_stage_projection_match,
    (
      a.rider_id is not null
      and a.source<>'race'
    ) same_day_non_race_source_present
  from projected p
  left join public.rider_daily_activity a
    on a.rider_id=p.rider_id
   and a.activity_date=p.activity_date
),
summary as
(
  select
    count(*)::integer projected_rows,
    count(*) filter(where activity_found)::integer found_rows,
    count(*) filter(where exact_stage_projection_match)::integer exact_rows,
    count(*) filter(where same_day_non_race_source_present)::integer
      non_race_rows,
    md5(coalesce(string_agg(
      jsonb_build_object(
        'rider_id',rider_id,
        'activity_date',activity_date,
        'activity_found',activity_found,
        'source',source,
        'activity_type',activity_type,
        'intensity',intensity,
        'fatigue_load',fatigue_load,
        'recovery_bonus',recovery_bonus,
        'source_id',source_id,
        'metadata',metadata,
        'exact_stage_projection_match',exact_stage_projection_match,
        'same_day_non_race_source_present',same_day_non_race_source_present
      )::text,
      '|' order by rider_id
    ),'')) comparison_hash
  from comparison
)
select jsonb_build_object(
  'evidence_version','daily_activity_projection_output_v1',
  'status',case
    when pr.p->>'status'<>'projection_ready'
      then 'projection_not_ready'
    when s.exact_rows=s.projected_rows
      then 'daily_activity_projection_complete'
    when s.found_rows=s.projected_rows
      then 'daily_activity_rows_present_but_projection_differs'
    else 'daily_activity_projection_incomplete'
  end,
  'stage_id',p_stage_id,
  'activity_date',pr.p->>'activity_date',
  'projected_row_count',s.projected_rows,
  'activity_row_found_count',s.found_rows,
  'exact_stage_projection_match_count',s.exact_rows,
  'same_day_non_race_source_count',s.non_race_rows,
  'missing_activity_row_count',s.projected_rows-s.found_rows,
  'differing_activity_row_count',s.found_rows-s.exact_rows,
  'projection_hash',pr.p->>'projection_hash',
  'comparison_hash',s.comparison_hash,
  'historical_reprojection_allowed',false,
  'same_day_source_replacement_allowed',false
)
from projection pr
cross join summary s;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_weather_closeout_trigger_ownership_v2()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with trigger_row as
  (
    select
      n.nspname table_schema,
      c.relname table_name,
      t.tgname trigger_name,
      t.tgenabled enabled_code,
      pg_get_triggerdef(t.oid,true) trigger_definition,
      md5(pg_get_triggerdef(t.oid,true)) trigger_definition_hash,
      p.oid::regprocedure::text function_signature,
      md5(pg_get_functiondef(p.oid))
        function_definition_hash
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal
      and n.nspname='public'
      and c.relname='race_stage_simulation_runs'
      and t.tgname=
        'trg_race_engine_auto_finalize_weather_race_state_from_run_v1'
  )
  select jsonb_build_object(
    'ownership_version',
      'phase3ab_b16_weather_closeout_trigger_ownership_v1',

    'status',
      case
        when count(*) filter(where enabled_code in('O','A'))=1
          then 'legacy_simulation_run_trigger_active'
        else 'legacy_trigger_contract_not_exact'
      end,

    'current_owner',
      'simulation_run_completion_trigger',

    'future_owner',
      'explicit_v2_weather_closeout_adapter',

    'cutover_action',
      'retain_for_v1_then_disable_at_v2_scheduler_cutover',

    'cutover_allowed_in_b16',
      false,

    'enabled_trigger_count',
      count(*) filter(where enabled_code in('O','A')),

    'writer_signature',
      'race_engine_finalize_weather_cancelled_race_state_v1(uuid)',

    'trigger_rows',
      coalesce(
        jsonb_agg(
          to_jsonb(trigger_row)
          order by trigger_name
        ),
        '[]'::jsonb
      ),

    'cutover_prerequisites',
      jsonb_build_array(
        'weather-closeout adapter claims ledger row',
        'all-stage weather decision evidence verified',
        'weather-cancelled regression matrix passes',
        'V2 scheduler owns the stage transaction'
      )
  )
  from trigger_row;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_closeout_contract_v3()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'contract_version',
      'phase3ab_b18_stage_closeout_contract_v1',

    'status',
      'legacy_closeout_contract_verified_with_v2_gaps',

    'legacy_writer_signature',
      'race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)',

    'legacy_writer_definition_hash',
      md5(
        pg_get_functiondef(
          'public.race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)'
          ::regprocedure
        )
      ),

    'readiness_helper_definition_hash',
      md5(
        pg_get_functiondef(
          'public.race_engine_get_stage_closeout_readiness_v2(uuid)'
          ::regprocedure
        )
      ),

    'legacy_writer_backend_only',
      not has_function_privilege(
        'public',
        'public.race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)',
        'execute'
      ),

    'legacy_writer_has_advisory_lock',
      lower(
        pg_get_functiondef(
          'public.race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)'
          ::regprocedure
        )
      ) like '%pg_advisory%',

    'legacy_writer_reads_v2_effect_ledger',
      lower(
        pg_get_functiondef(
          'public.race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)'
          ::regprocedure
        )
      ) like '%race_engine_stage_effect_ledger_v2%',

    'legacy_writer_has_already_closed_branch',
      lower(
        pg_get_functiondef(
          'public.race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)'
          ::regprocedure
        )
      ) like '%already_closed%'
      or lower(
           pg_get_functiondef(
             'public.race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)'
             ::regprocedure
           )
         ) like '%already completed%',

    'legacy_writer_marks_stage_or_run_immutable',
      false,

    'legacy_writer_records_processing_attempt_marker',
      lower(
        pg_get_functiondef(
          'public.race_engine_closeout_stage_after_tail_v1(uuid,boolean,text,boolean,integer,integer)'
          ::regprocedure
        )
      ) like '%stage_closeout_completed%',

    'known_contract_gaps',
      jsonb_build_array(
        'legacy writer does not require complete V2 dependency ledger',
        'legacy writer has no advisory lock',
        'legacy writer has no explicit already-closed idempotency branch',
        'legacy writer records closeout only in processing-attempt JSON',
        'legacy writer does not atomically mark stage and run immutable'
      ),

    'production_execution_enabled',
      false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_closeout_mutation_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with stage_row as
  (
    select s.race_id
    from public.race_stages s
    where s.id=p_stage_id
  )
  select jsonb_build_object(
    'stage',
      (
        select md5(coalesce(to_jsonb(s)::text,''))
        from public.race_stages s
        where s.id=p_stage_id
      ),

    'race',
      (
        select md5(coalesce(to_jsonb(r)::text,''))
        from public.races r
        where r.id=(select race_id from stage_row)
      ),

    'simulation_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(run)::text,
              '|'
              order by to_jsonb(run)::text
            ),
            ''
          )
        )
        from public.race_stage_simulation_runs run
        where run.stage_id=p_stage_id
      ),

    'processing_attempts',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(a)::text,
              '|'
              order by to_jsonb(a)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_processing_attempts_v1 a
        where a.stage_id=p_stage_id
      ),

    'effect_ledger',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(l)::text,
              '|'
              order by to_jsonb(l)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_effect_ledger_v2 l
        where l.stage_id=p_stage_id
      ),

    'replay_frames',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(f)::text,
              '|'
              order by to_jsonb(f)::text
            ),
            ''
          )
        )
        from public.race_stage_replay_frames f
        where f.stage_id=p_stage_id
      ),

    'stage_results',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(sr)::text,
              '|'
              order by to_jsonb(sr)::text
            ),
            ''
          )
        )
        from public.race_stage_results sr
        where sr.stage_id=p_stage_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_atomic_stage_processor_contract_v2()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'contract_version',
      'phase3ac_a3_atomic_stage_processor_contract_v1',

    'status',
      'atomic_contract_foundation_execution_disabled',

    'existing_entry_point',
      'race_engine_process_stage_once_v2(uuid,boolean,text)',

    'existing_entry_point_hash',
      md5(
        pg_get_functiondef(
          'public.race_engine_process_stage_once_v2(uuid,boolean,text)'
          ::regprocedure
        )
      ),

    'existing_entry_point_role',
      'backend_only_stage_locking_dry_run_shell',

    'active_scheduler_owner',
      'race_engine_admin_scheduler_tick_v1 via cron job 42',

    'immutable_state_relation',
      'public.race_engine_stage_immutable_state_v2',

    'immutable_state_policy',
      'one stage row, one optional process run, one simulation run at immutable completion, permanent update/delete guard after immutable status',

    'duplicate_call_policy',
      'immutable stage returns saved evidence and never re-enters runner or effect writers',

    'historical_policy',
      'historical completed, weather-cancelled and golden stages remain verify-only with no retroactive immutable claim',

    'failure_policy',
      'future production processor must rollback runner, effects and immutable closeout atomically and leave stage retryable',

    'required_route_matrix',
      jsonb_build_array(
        'road_race',
        'individual_time_trial',
        'team_time_trial',
        'weather_cancelled'
      ),

    'production_execution_enabled',false,
    'scheduler_cutover_enabled',false,
    'existing_v2_shell_replacement_enabled',false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_simulation_run_claim_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with stage_row as
  (
    select s.race_id
    from public.race_stages s
    where s.id=p_stage_id
  )
  select jsonb_build_object(
    'stage',
      (
        select md5(coalesce(to_jsonb(s)::text,''))
        from public.race_stages s
        where s.id=p_stage_id
      ),

    'race',
      (
        select md5(coalesce(to_jsonb(r)::text,''))
        from public.races r
        where r.id=(select race_id from stage_row)
      ),

    'simulation_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(run)::text,
              '|'
              order by to_jsonb(run)::text
            ),
            ''
          )
        )
        from public.race_stage_simulation_runs run
        where run.stage_id=p_stage_id
      ),

    'immutable_state',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(i)::text,
              '|'
              order by to_jsonb(i)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_immutable_state_v2 i
        where i.stage_id=p_stage_id
      ),

    'effect_ledger',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(l)::text,
              '|'
              order by to_jsonb(l)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_effect_ledger_v2 l
        where l.stage_id=p_stage_id
      ),

    'process_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(pr)::text,
              '|'
              order by to_jsonb(pr)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_runs_v2 pr
        where pr.stage_id=p_stage_id
      ),

    'processing_attempts',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(a)::text,
              '|'
              order by to_jsonb(a)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_processing_attempts_v1 a
        where a.stage_id=p_stage_id
      ),

    'report_events',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(e)::text,
              '|'
              order by to_jsonb(e)::text
            ),
            ''
          )
        )
        from public.race_stage_report_events e
        where e.stage_id=p_stage_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_process_run_identity_contract_v2()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'status',
      'process_run_identity_contract_execution_disabled',

    'contract_version',
      'phase3ac_a6_process_run_identity_contract_v1',

    'existing_process_run_relation',
      'public.race_engine_stage_process_runs_v2',

    'existing_relation_role',
      'append_only_invocation_audit',

    'existing_process_run_writer',
      'race_engine_process_stage_once_v2(uuid,boolean,text)',

    'existing_writer_hash',
      md5(
        pg_get_functiondef(
          'public.race_engine_process_stage_once_v2(uuid,boolean,text)'
          ::regprocedure
        )
      ),

    'current_process_run_row_count',
      (
        select count(*)
        from public.race_engine_stage_process_runs_v2
      ),

    'current_unfinished_process_run_count',
      (
        select count(*)
        from public.race_engine_stage_process_runs_v2
        where status='started'
           or finished_at is null
      ),

    'one_process_run_per_stage',
      false,

    'retry_policy',
      'append new process_run_id; never rewrite terminal process-run row',

    'active_claim_relation',
      'public.race_engine_stage_process_claim_v2',

    'active_claim_identity',
      'one mutable lease row per stage with active and predecessor process-run IDs',

    'default_stale_after',
      (
        select default_stale_after::text
        from public.race_engine_process_run_recovery_config_v2
        where config_key='process_run_recovery'
      ),

    'stale_recovery_requirements',
      jsonb_build_array(
        'heartbeat and expiry both stale',
        'no matching live backend',
        'no matching stage advisory lock',
        'stage not immutable',
        'retry appends a new process-run identity',
        'predecessor process-run remains unchanged'
      ),

    'production_claim_enabled',false,
    'production_recovery_enabled',false,
    'scheduler_cutover_enabled',false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_process_run_recovery_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'process_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(pr)::text,
              '|'
              order by to_jsonb(pr)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_runs_v2 pr
        where pr.stage_id=p_stage_id
      ),

    'process_claim',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(c)::text,
              '|'
              order by to_jsonb(c)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_claim_v2 c
        where c.stage_id=p_stage_id
      ),

    'simulation_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(run)::text,
              '|'
              order by to_jsonb(run)::text
            ),
            ''
          )
        )
        from public.race_stage_simulation_runs run
        where run.stage_id=p_stage_id
      ),

    'immutable_state',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(i)::text,
              '|'
              order by to_jsonb(i)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_immutable_state_v2 i
        where i.stage_id=p_stage_id
      ),

    'effect_ledger',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(l)::text,
              '|'
              order by to_jsonb(l)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_effect_ledger_v2 l
        where l.stage_id=p_stage_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_atomic_orchestrator_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with stage_row as
  (
    select s.race_id
    from public.race_stages s
    where s.id=p_stage_id
  )
  select jsonb_build_object(
    'stage',
      (
        select md5(coalesce(to_jsonb(s)::text,''))
        from public.race_stages s
        where s.id=p_stage_id
      ),

    'race',
      (
        select md5(coalesce(to_jsonb(r)::text,''))
        from public.races r
        where r.id=(select race_id from stage_row)
      ),

    'process_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(pr)::text,
              '|'
              order by to_jsonb(pr)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_runs_v2 pr
        where pr.stage_id=p_stage_id
      ),

    'process_claims',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(c)::text,
              '|'
              order by to_jsonb(c)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_claim_v2 c
        where c.stage_id=p_stage_id
      ),

    'simulation_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(run)::text,
              '|'
              order by to_jsonb(run)::text
            ),
            ''
          )
        )
        from public.race_stage_simulation_runs run
        where run.stage_id=p_stage_id
      ),

    'immutable_state',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(i)::text,
              '|'
              order by to_jsonb(i)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_immutable_state_v2 i
        where i.stage_id=p_stage_id
      ),

    'effect_ledger',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(l)::text,
              '|'
              order by to_jsonb(l)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_effect_ledger_v2 l
        where l.stage_id=p_stage_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_process_claim_history_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with ordered as
  (
    select
      h.*,
      lag(h.event_hash)
      over
      (
        partition by h.stage_id
        order by h.event_sequence
      ) prior_event_hash
    from public.race_engine_stage_process_claim_history_v2 h
    where h.stage_id=p_stage_id
  )
  select jsonb_build_object(
    'stage_id',p_stage_id,
    'event_count',count(*),
    'first_event_hash',
      (
        array_agg(event_hash order by event_sequence)
      )[1],
    'head_event_hash',
      (
        array_agg(event_hash order by event_sequence desc)
      )[1],
    'chain_valid',
      coalesce(
        bool_and(
          (
            event_sequence=1
            and previous_event_hash is null
            and prior_event_hash is null
          )
          or
          (
            event_sequence>1
            and previous_event_hash=prior_event_hash
          )
        ),
        true
      ),
    'events',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'claim_history_id',claim_history_id,
            'event_sequence',event_sequence,
            'event_type',event_type,
            'claim_generation',claim_generation,
            'claim_status_before',claim_status_before,
            'claim_status_after',claim_status_after,
            'active_process_run_id',active_process_run_id,
            'predecessor_process_run_id',
              predecessor_process_run_id,
            'claim_row_hash',claim_row_hash,
            'previous_event_hash',previous_event_hash,
            'event_hash',event_hash,
            'recorded_at',recorded_at
          )
          order by event_sequence
        ),
        '[]'::jsonb
      ),
    'history_version',
      'phase3ac_a8_append_only_claim_history_v1'
  )
  from ordered;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_claim_history_contract_snapshot_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'process_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(pr)::text,
              '|'
              order by to_jsonb(pr)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_runs_v2 pr
        where pr.stage_id=p_stage_id
      ),
    'process_claims',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(c)::text,
              '|'
              order by to_jsonb(c)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_claim_v2 c
        where c.stage_id=p_stage_id
      ),
    'claim_history',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(h)::text,
              '|'
              order by to_jsonb(h)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_process_claim_history_v2 h
        where h.stage_id=p_stage_id
      ),
    'simulation_runs',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(run)::text,
              '|'
              order by to_jsonb(run)::text
            ),
            ''
          )
        )
        from public.race_stage_simulation_runs run
        where run.stage_id=p_stage_id
      ),
    'immutable_state',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(i)::text,
              '|'
              order by to_jsonb(i)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_immutable_state_v2 i
        where i.stage_id=p_stage_id
      ),
    'effect_ledger',
      (
        select md5(
          coalesce(
            string_agg(
              to_jsonb(l)::text,
              '|'
              order by to_jsonb(l)::text
            ),
            ''
          )
        )
        from public.race_engine_stage_effect_ledger_v2 l
        where l.stage_id=p_stage_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_runner_handoff_history_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with ordered as
  (
    select
      h.*,
      lag(h.event_hash)
      over
      (
        partition by h.handoff_id
        order by h.event_sequence
      ) prior_event_hash
    from public.race_engine_stage_runner_handoff_history_v2 h
    where h.stage_id=p_stage_id
  )
  select jsonb_build_object(
    'stage_id',p_stage_id,
    'event_count',count(*),
    'chain_valid',
      coalesce(
        bool_and(
          (
            event_sequence=1
            and previous_event_hash is null
            and prior_event_hash is null
          )
          or
          (
            event_sequence>1
            and previous_event_hash=prior_event_hash
          )
        ),
        true
      ),
    'events',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'event_sequence',event_sequence,
            'event_type',event_type,
            'status_before',status_before,
            'status_after',status_after,
            'simulation_run_id',simulation_run_id,
            'previous_event_hash',previous_event_hash,
            'event_hash',event_hash
          )
          order by event_sequence
        ),
        '[]'::jsonb
      )
  )
  from ordered;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_weather_exposure_ordered_adapter_v2(p_stage_id uuid, p_process_run_id uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select
  public.race_engine_apply_non_destructive_stage_effect_v2(
    p_stage_id,
    p_process_run_id,
    'weather_exposure',
    p_execute,
    p_confirmation_text
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_fatigue_ordered_adapter_v2(p_stage_id uuid, p_process_run_id uuid, p_execute boolean DEFAULT false, p_confirmation_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select
  public.race_engine_apply_non_destructive_stage_effect_v2(
    p_stage_id,
    p_process_run_id,
    'fatigue',
    p_execute,
    p_confirmation_text
  );
$function$
;

CREATE OR REPLACE FUNCTION public.market_ai_club_rider_country_eligible_v1(p_club_id uuid, p_rider_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists (
    select 1
    from public.club_roster_country_rules rule
    join public.riders rider
      on rider.id = p_rider_id
    where rule.club_id = p_club_id
      and rule.rule_key = 'national_team_country_lock_v1'
      and rule.is_active = true
      and rider.country_code is distinct from rule.allowed_country_code
  );
$function$
;

CREATE OR REPLACE FUNCTION public.market_ai_is_skippable_roster_exception_v1(p_sqlstate text, p_error_message text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (
      p_sqlstate = '23514'
      and coalesce(p_error_message, '')
          like 'First squad limit reached:%'
    )
    or coalesce(p_error_message, '')
         like 'National team country lock violation%';
$function$
;

CREATE OR REPLACE FUNCTION public.get_transfer_market_listing_count_v1()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer
  from public.rider_transfer_listings listing_row
  join public.clubs club
    on club.id = listing_row.seller_club_id
  where listing_row.status = 'listed'
    and club.deleted_at is null
    and listing_row.listed_on_game_date
          <= public.get_current_game_date_date()
    and (
      listing_row.expires_on_game_date is null
      or listing_row.expires_on_game_date
           >= public.get_current_game_date_date()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_club_training_v1(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.clubs c
    left join public.clubs parent_club
      on parent_club.id = c.parent_club_id
    where c.id = p_club_id
      and (
        c.owner_user_id = auth.uid()
        or parent_club.owner_user_id = auth.uid()
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_regular_training_manager_role_v1(p_club_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    case
      when c.club_type = 'developing'
        then 'u23_head_coach'
      else 'head_coach'
    end
  from public.clubs c
  where c.id = p_club_id;
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_race_preparation_v1(p_race_preparation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.race_preparations rp
    join public.clubs owner_club
      on owner_club.id = rp.club_id
    where rp.id = p_race_preparation_id
      and owner_club.owner_user_id = auth.uid()
      and owner_club.deleted_at is null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_eligible_u23_head_coaches_for_race_v1(p_race_preparation_id uuid)
 RETURNS TABLE(staff_id uuid, staff_name text, staff_club_id uuid, team_scope text, specialization text, expertise smallint, efficiency smallint, potential smallint, experience smallint, leadership smallint, loyalty smallint, current_availability_factor numeric, contract_expires_at date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    cs.id,
    cs.staff_name,
    cs.club_id,
    cs.team_scope,
    cs.specialization,
    cs.expertise,
    cs.efficiency,
    cs.potential,
    cs.experience,
    cs.leadership,
    cs.loyalty,
    public.get_staff_assignment_availability_factor(cs.id,public.get_current_game_date_date()),
    cs.contract_expires_at
  from public.race_preparations rp
  join public.clubs owner_club on owner_club.id=rp.club_id
  join public.clubs participating_club on participating_club.id=rp.participating_club_id
  join public.club_staff cs on cs.club_id in (rp.club_id,rp.participating_club_id)
  where rp.id=p_race_preparation_id
    and public.user_has_premium_access_v1(owner_club.owner_user_id)
    and public.is_developing_team_access_active_v1(participating_club.id)
    and participating_club.club_type='developing'
    and participating_club.parent_club_id=rp.club_id
    and exists (
      select 1
      from public.get_youth_academy_effects(rp.participating_club_id) academy
      where academy.is_developing_team=true
        and academy.youth_academy_level>=1
    )
    and cs.role_type='u23_head_coach'
    and cs.is_active=true
    and cs.team_scope in ('u23','all')
    and (cs.contract_expires_at is null or cs.contract_expires_at>=public.get_current_game_date_date())
  order by
    public.get_staff_assignment_availability_factor(cs.id,public.get_current_game_date_date()) desc,
    cs.expertise desc, cs.experience desc, cs.id;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_resolve_stage_rider_equipment_condition_v1(p_simulation_run_id uuid)
 RETURNS TABLE(simulation_run_id uuid, race_id uuid, stage_id uuid, rider_id uuid, team_id uuid, race_stage_plan_rider_id uuid, equipment_setup_id uuid, selected_component_count integer, matched_component_count integer, complete_source boolean, minimum_condition_percent numeric, effective_condition_percent numeric, missing_component_categories text[], component_evidence jsonb, source_evidence jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with
simulation as (
  select
    sr.id as simulation_run_id,
    sr.race_id,
    sr.stage_id
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id
),
canonical_riders as (
  select
    s.simulation_run_id,
    i.race_id,
    i.stage_id,
    i.rider_id,
    i.team_id,
    i.race_stage_plan_rider_id
  from simulation s
  cross join lateral public.race_engine_get_stage_rider_inputs_v1(s.stage_id) i
),
selected_setup as (
  select
    cr.*,
    rspr.equipment_setup_id,
    preset.club_id as preset_club_id,
    preset.frame_catalog_item_id,
    preset.wheelset_catalog_item_id,
    preset.tires_catalog_item_id,
    preset.groupset_catalog_item_id,
    preset.helmet_catalog_item_id,
    preset.shoes_catalog_item_id
  from canonical_riders cr
  left join public.race_stage_plan_riders rspr
    on rspr.id = cr.race_stage_plan_rider_id
  left join public.club_equipment_setup_presets preset
    on preset.id = rspr.equipment_setup_id
   and preset.club_id = cr.team_id
),
selected_components as (
  select
    ss.simulation_run_id,
    ss.race_id,
    ss.stage_id,
    ss.rider_id,
    ss.team_id,
    ss.race_stage_plan_rider_id,
    ss.equipment_setup_id,
    c.equipment_category,
    c.catalog_item_id
  from selected_setup ss
  cross join lateral (
    values
      ('frame'::text, ss.frame_catalog_item_id),
      ('wheelset'::text, ss.wheelset_catalog_item_id),
      ('tires'::text, ss.tires_catalog_item_id),
      ('groupset'::text, ss.groupset_catalog_item_id),
      ('helmet'::text, ss.helmet_catalog_item_id),
      ('shoes'::text, ss.shoes_catalog_item_id)
  ) c(equipment_category, catalog_item_id)
  where c.catalog_item_id is not null
),
ranked_riders as (
  select
    sc.*,
    row_number() over (
      partition by
        sc.simulation_run_id,
        sc.team_id,
        sc.equipment_category,
        sc.catalog_item_id
      order by
        sc.rider_id::text asc,
        sc.race_stage_plan_rider_id::text asc
    ) as rider_rank
  from selected_components sc
),
logged_targets as (
  select distinct
    p_simulation_run_id as simulation_run_id,
    cei.club_id as team_id,
    cei.equipment_category,
    cei.catalog_item_id,
    cei.id as inventory_id,
    cei.condition_percent,
    row_number() over (
      partition by
        cei.club_id,
        cei.equipment_category,
        cei.catalog_item_id
      order by cei.id::text asc
    ) as physical_rank
  from public.race_engine_stage_wear_applications wa
  join public.club_equipment_inventory cei
    on cei.id = wa.target_id
  where wa.target_table = 'club_equipment_inventory'
    and coalesce(
      nullif(to_jsonb(wa)->>'simulation_run_id','')::uuid,
      nullif(to_jsonb(wa)->>'source_id','')::uuid
    ) = p_simulation_run_id
),
unlogged_targets as (
  select
    p_simulation_run_id as simulation_run_id,
    cei.club_id as team_id,
    cei.equipment_category,
    cei.catalog_item_id,
    cei.id as inventory_id,
    cei.condition_percent,
    row_number() over (
      partition by
        cei.club_id,
        cei.equipment_category,
        cei.catalog_item_id
      order by
        cei.condition_percent desc,
        cei.id::text asc
    ) as unlogged_rank
  from public.club_equipment_inventory cei
  where cei.status = 'ready'
    and cei.condition_percent > 0
    and not exists (
      select 1
      from public.race_engine_stage_wear_applications wa
      where wa.target_table = 'club_equipment_inventory'
        and wa.target_id = cei.id
        and coalesce(
          nullif(to_jsonb(wa)->>'simulation_run_id','')::uuid,
          nullif(to_jsonb(wa)->>'source_id','')::uuid
        ) = p_simulation_run_id
    )
),
physical_candidates as (
  select
    lt.simulation_run_id,
    lt.team_id,
    lt.equipment_category,
    lt.catalog_item_id,
    lt.inventory_id,
    lt.condition_percent,
    0::integer as source_priority,
    lt.physical_rank,
    true as used_logged_target
  from logged_targets lt

  union all

  select
    ut.simulation_run_id,
    ut.team_id,
    ut.equipment_category,
    ut.catalog_item_id,
    ut.inventory_id,
    ut.condition_percent,
    1::integer as source_priority,
    (
      coalesce((
        select count(*)
        from logged_targets lt
        where lt.simulation_run_id = ut.simulation_run_id
          and lt.team_id = ut.team_id
          and lt.equipment_category = ut.equipment_category
          and lt.catalog_item_id = ut.catalog_item_id
      ),0) + ut.unlogged_rank
    )::bigint as physical_rank,
    false as used_logged_target
  from unlogged_targets ut
),
paired as (
  select
    rr.*,
    pc.inventory_id,
    pc.condition_percent,
    pc.used_logged_target
  from ranked_riders rr
  left join physical_candidates pc
    on pc.simulation_run_id = rr.simulation_run_id
   and pc.team_id = rr.team_id
   and pc.equipment_category = rr.equipment_category
   and pc.catalog_item_id = rr.catalog_item_id
   and pc.physical_rank = rr.rider_rank
),
per_rider as (
  select
    ss.simulation_run_id,
    ss.race_id,
    ss.stage_id,
    ss.rider_id,
    ss.team_id,
    ss.race_stage_plan_rider_id,
    ss.equipment_setup_id,
    count(p.catalog_item_id)::integer as selected_component_count,
    count(p.inventory_id)::integer as matched_component_count,
    coalesce(
      array_agg(p.equipment_category order by p.equipment_category)
        filter (where p.catalog_item_id is not null and p.inventory_id is null),
      array[]::text[]
    ) as missing_component_categories,
    min(p.condition_percent) filter (where p.inventory_id is not null) as minimum_condition_percent,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'equipment_category', p.equipment_category,
          'catalog_item_id', p.catalog_item_id,
          'inventory_id', p.inventory_id,
          'condition_percent', p.condition_percent,
          'used_logged_target', coalesce(p.used_logged_target,false),
          'matched', p.inventory_id is not null
        )
        order by p.equipment_category
      ) filter (where p.catalog_item_id is not null),
      '[]'::jsonb
    ) as component_evidence
  from selected_setup ss
  left join paired p
    on p.simulation_run_id = ss.simulation_run_id
   and p.rider_id = ss.rider_id
   and p.race_stage_plan_rider_id = ss.race_stage_plan_rider_id
  group by
    ss.simulation_run_id,
    ss.race_id,
    ss.stage_id,
    ss.rider_id,
    ss.team_id,
    ss.race_stage_plan_rider_id,
    ss.equipment_setup_id
)
select
  pr.simulation_run_id,
  pr.race_id,
  pr.stage_id,
  pr.rider_id,
  pr.team_id,
  pr.race_stage_plan_rider_id,
  pr.equipment_setup_id,
  pr.selected_component_count,
  pr.matched_component_count,
  (
    pr.selected_component_count > 0
    and pr.matched_component_count = pr.selected_component_count
  ) as complete_source,
  pr.minimum_condition_percent,
  case
    when pr.selected_component_count > 0
     and pr.matched_component_count = pr.selected_component_count
      then pr.minimum_condition_percent
    else 100::numeric
  end as effective_condition_percent,
  pr.missing_component_categories,
  pr.component_evidence,
  jsonb_build_object(
    'source_version','phase3ad_stage_rider_equipment_condition_reader_v1',
    'missing_source_policy','neutral_condition_100_with_explicit_evidence',
    'assigned_rider_fallback_used',false,
    'modulo_reuse_used',false,
    'persistent_writes',false
  ) as source_evidence
from per_rider pr
order by pr.team_id::text, pr.rider_id::text;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_external_cycling_news_v1(p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, source_name text, article_url text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    n.id,
    n.title,
    n.source_name,
    n.article_url,
    n.published_at
  from public.cycling_world_news n
  join public.cycling_news_sources s
    on s.id = n.source_id
  where n.is_visible = true
    and s.is_active = true
    and n.published_at >= now() - interval '45 days'
  order by
    n.published_at desc,
    s.source_priority asc,
    n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_top_historical_results_v1(p_club_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(id text, achievement_id text, season_year integer, season_label text, date_label text, result_date date, race_id uuid, stage_id uuid, race_name text, race_country_code text, race_category text, achievement_type text, achievement_label text, rider_id uuid, rider_name text, result_position integer, prestige_score integer, href text, race_href text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with normalized_limit as (
  select greatest(1, least(coalesce(p_limit, 5), 100))::integer as value
),
eligible_results as (
  select
    rsr.id as result_id,
    rsr.race_id,
    rsr.stage_id,
    rsr.rider_id,
    rsr.team_id,
    rsr.rank::integer as result_position,
    coalesce(
      nullif(btrim(rsr.rider_name_snapshot), ''),
      nullif(btrim(r.display_name), ''),
      nullif(btrim(concat_ws(' ', r.first_name, r.last_name)), ''),
      'Unknown rider'
    ) as rider_name,
    st.stage_number::integer,
    st.stage_date,
    race.name as race_name,
    race.country_code as race_country_code,
    race.category as race_category,
    race.is_stage_race,
    race.stage_count,
    row_number() over (
      partition by rsr.team_id, rsr.stage_id
      order by rsr.rank asc nulls last, rsr.elapsed_seconds asc nulls last, rsr.id
    ) as team_stage_result_order
  from public.race_stage_results rsr
  join public.race_stages st
    on st.id = rsr.stage_id
   and st.race_id = rsr.race_id
  join public.races race
    on race.id = rsr.race_id
  left join public.riders r
    on r.id = rsr.rider_id
  where rsr.team_id = p_club_id
    and rsr.rank between 1 and 10
    and lower(coalesce(rsr.status, '')) not in (
      'dnf',
      'dns',
      'dsq',
      'disqualified',
      'outside_time_limit',
      'otl'
    )
    and lower(coalesce(race.status, '')) not in (
      'cancelled',
      'canceled',
      'weather_cancelled',
      'cancelled_by_weather',
      'race_cancelled',
      'race_canceled'
    )
),
best_team_result_per_stage as (
  select *
  from eligible_results
  where team_stage_result_order = 1
),
scored as (
  select
    result_id,
    race_id,
    stage_id,
    rider_id,
    rider_name,
    result_position,
    stage_number,
    stage_date,
    race_name,
    race_country_code,
    race_category,
    is_stage_race,
    stage_count,

    case
      when not is_stage_race or coalesce(stage_count, 1) <= 1 then 'one_day_result'
      else 'stage_result'
    end as achievement_type,

    case
      when not is_stage_race or coalesce(stage_count, 1) <= 1 then
        case result_position
          when 1 then 'Race Winner'
          when 2 then '2nd Place'
          when 3 then '3rd Place'
          else result_position::text || 'th Place'
        end
      else
        case result_position
          when 1 then 'Stage ' || stage_number::text || ' Winner'
          when 2 then 'Stage ' || stage_number::text || ' – 2nd Place'
          when 3 then 'Stage ' || stage_number::text || ' – 3rd Place'
          else 'Stage ' || stage_number::text || ' – ' || result_position::text || 'th Place'
        end
    end as achievement_label,

    (
      -- Race-category prestige.
      case upper(coalesce(race_category, ''))
        when '1.UWT' then 6000
        when '2.UWT' then 5900
        when 'WC' then 6200
        when 'OG' then 6300
        when '1.PRO' then 4600
        when '2.PRO' then 4500
        when '1.HC' then 4400
        when '2.HC' then 4300
        when '1.1' then 3400
        when '2.1' then 3300
        when '1.2' then 2400
        when '2.2' then 2300
        when 'NC' then 2600
        else 1500
      end

      -- One-day wins represent the full race; stage-race rows are stage honours.
      + case
          when not is_stage_race or coalesce(stage_count, 1) <= 1 then 900
          else 0
        end

      -- Placing value.
      + case result_position
          when 1 then 1000
          when 2 then 700
          when 3 then 500
          when 4 then 350
          when 5 then 280
          when 6 then 220
          when 7 then 170
          when 8 then 130
          when 9 then 100
          when 10 then 80
          else 0
        end
    )::integer as prestige_score
  from best_team_result_per_stage
),
ranked as (
  select
    *,
    row_number() over (
      order by
        prestige_score desc,
        result_position asc,
        stage_date desc,
        race_name asc,
        stage_number asc,
        result_id
    ) as honour_order
  from scored
)
select
  result_id::text as id,
  result_id::text as achievement_id,
  extract(year from stage_date)::integer as season_year,
  'Season ' || greatest(1, extract(year from stage_date)::integer - 1999)::text
    as season_label,
  to_char(stage_date, 'Mon DD') as date_label,
  stage_date as result_date,
  race_id,
  stage_id,
  race_name,
  race_country_code,
  race_category,
  achievement_type,
  achievement_label,
  rider_id,
  rider_name,
  result_position,
  prestige_score,
  '#/dashboard/races/' || race_id::text as href,
  '#/dashboard/races/' || race_id::text as race_href
from ranked
cross join normalized_limit
where honour_order <= normalized_limit.value
order by honour_order;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_top_historical_results_v1(p_rider_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(id text, achievement_id text, season_year integer, season_label text, date_label text, result_date date, race_id uuid, stage_id uuid, race_name text, race_country_code text, race_category text, achievement_type text, achievement_label text, rider_id uuid, rider_name text, result_position integer, prestige_score integer, href text, race_href text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with normalized_limit as (
  select greatest(1, least(coalesce(p_limit, 5), 20))::integer as value
),
eligible_results as (
  select
    rsr.id as result_id,
    rsr.race_id,
    rsr.stage_id,
    rsr.rider_id,
    rsr.rank::integer as result_position,
    coalesce(
      nullif(btrim(rsr.rider_name_snapshot), ''),
      nullif(btrim(r.display_name), ''),
      nullif(btrim(concat_ws(' ', r.first_name, r.last_name)), ''),
      'Unknown rider'
    ) as rider_name,
    st.stage_number::integer,
    st.stage_date,
    race.name as race_name,
    race.country_code as race_country_code,
    race.category as race_category,
    race.is_stage_race,
    race.stage_count
  from public.race_stage_results rsr
  join public.race_stages st
    on st.id = rsr.stage_id
   and st.race_id = rsr.race_id
  join public.races race
    on race.id = rsr.race_id
  left join public.riders r
    on r.id = rsr.rider_id
  where rsr.rider_id = p_rider_id
    and rsr.rank between 1 and 10
    and lower(coalesce(rsr.status, '')) not in (
      'dnf', 'dns', 'dsq', 'disqualified', 'outside_time_limit', 'otl'
    )
    and lower(coalesce(race.status, '')) not in (
      'cancelled', 'canceled', 'weather_cancelled',
      'cancelled_by_weather', 'race_cancelled', 'race_canceled'
    )
),
scored as (
  select
    result_id,
    race_id,
    stage_id,
    rider_id,
    rider_name,
    result_position,
    stage_number,
    stage_date,
    race_name,
    race_country_code,
    race_category,
    is_stage_race,
    stage_count,
    case
      when not is_stage_race or coalesce(stage_count, 1) <= 1
        then 'one_day_result'
      else 'stage_result'
    end as achievement_type,
    case
      when not is_stage_race or coalesce(stage_count, 1) <= 1 then
        case result_position
          when 1 then 'Race Winner'
          when 2 then '2nd Place'
          when 3 then '3rd Place'
          else result_position::text || 'th Place'
        end
      else
        case result_position
          when 1 then 'Stage ' || stage_number::text || ' Winner'
          when 2 then 'Stage ' || stage_number::text || ' – 2nd Place'
          when 3 then 'Stage ' || stage_number::text || ' – 3rd Place'
          else 'Stage ' || stage_number::text || ' – ' ||
            result_position::text || 'th Place'
        end
    end as achievement_label,
    (
      case upper(coalesce(race_category, ''))
        when 'OG' then 6300
        when 'WC' then 6200
        when '1.UWT' then 6000
        when '2.UWT' then 5900
        when '1.PRO' then 4600
        when '2.PRO' then 4500
        when '1.HC' then 4400
        when '2.HC' then 4300
        when '1.1' then 3400
        when '2.1' then 3300
        when 'NC' then 2600
        when '1.2' then 2400
        when '2.2' then 2300
        else 1500
      end
      + case
          when not is_stage_race or coalesce(stage_count, 1) <= 1 then 900
          else 0
        end
      + case result_position
          when 1 then 1000
          when 2 then 700
          when 3 then 500
          when 4 then 350
          when 5 then 280
          when 6 then 220
          when 7 then 170
          when 8 then 130
          when 9 then 100
          when 10 then 80
          else 0
        end
    )::integer as prestige_score
  from eligible_results
),
ranked as (
  select *,
    row_number() over (
      order by
        prestige_score desc,
        result_position asc,
        stage_date desc,
        race_name asc,
        stage_number asc,
        result_id
    ) as honour_order
  from scored
)
select
  result_id::text,
  result_id::text,
  extract(year from stage_date)::integer,
  'Season ' || greatest(1, extract(year from stage_date)::integer - 1999)::text,
  to_char(stage_date, 'Mon DD'),
  stage_date,
  race_id,
  stage_id,
  race_name,
  race_country_code,
  race_category,
  achievement_type,
  achievement_label,
  rider_id,
  rider_name,
  result_position,
  prestige_score,
  '#/dashboard/races/' || race_id::text,
  '#/dashboard/races/' || race_id::text
from ranked
cross join normalized_limit
where honour_order <= normalized_limit.value
order by honour_order;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_engine_runtime_control_v1()
 RETURNS race_engine_runtime_control_v1
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.*
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id = true;
$function$
;

CREATE OR REPLACE FUNCTION public.get_authoritative_race_stage_run_v1(p_stage_id uuid)
 RETURNS TABLE(stage_id uuid, race_id uuid, simulation_run_id uuid, engine_version text, simulation_mode text, run_status text, authority_kind text, approved_at timestamp with time zone, activated_at timestamp with time zone, contract_version text, metadata jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    a.stage_id,
    a.race_id,
    a.simulation_run_id,
    a.engine_version,
    a.simulation_mode,
    r.status,
    a.authority_kind,
    a.approved_at,
    a.activated_at,
    a.contract_version,
    a.metadata
  from public.race_stage_authoritative_runs a
  join public.race_stage_simulation_runs r
    on r.id = a.simulation_run_id
  where a.stage_id = p_stage_id;
$function$
;

CREATE OR REPLACE FUNCTION public.weather_cancellation_reason_label_v1(p_reason text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select case p_reason
    when 'snow' then 'snow'
    when 'temperature_below_5c' then 'temperature below 5°C'
    when 'extreme_heat' then 'extreme heat'
    when 'heavy_rain' then 'heavy rain'
    when 'storm' then 'storm conditions'
    when 'high_wind' then 'high wind'
    when 'unsafe_weather' then 'unsafe weather'
    else coalesce(nullif(replace(p_reason, '_', ' '), ''), 'unsafe weather conditions')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_premium_status()
 RETURNS TABLE(access_tier text, is_premium boolean, plan_code text, plan_name text, stripe_status text, access_until timestamp with time zone, cancel_at_period_end boolean, current_period_end timestamp with time zone, coins_per_paid_invoice integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with premium_state as (
    select
      s.*,
      (
        coalesce(s.access_until > now(), false)
        and (
          coalesce(s.stripe_status, 'free') not in (
            'canceled',
            'incomplete_expired'
          )
          or lower(
            coalesce(
              s.metadata ->> 'manual_test_access',
              'false'
            )
          ) in ('true', '1', 'yes')
        )
      ) as has_premium_access
    from (
      select auth.uid() as user_id
    ) me
    left join public.user_premium_subscriptions s
      on s.user_id = me.user_id
  )
  select
    case
      when coalesce(s.has_premium_access, false)
        then 'premium'
      else 'free'
    end as access_tier,
    coalesce(s.has_premium_access, false) as is_premium,
    s.plan_code,
    p.name as plan_name,
    coalesce(s.stripe_status, 'free') as stripe_status,
    s.access_until,
    coalesce(s.cancel_at_period_end, false) as cancel_at_period_end,
    s.current_period_end,
    coalesce(p.coins_per_paid_invoice, 0) as coins_per_paid_invoice
  from premium_state s
  left join public.premium_plans p
    on p.code = s.plan_code;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_premium_invoice_history()
 RETURNS TABLE(stripe_invoice_id text, plan_code text, billing_reason text, amount_paid_cents bigint, currency text, coins_granted integer, period_start timestamp with time zone, period_end timestamp with time zone, processed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.stripe_invoice_id,
    p.plan_code,
    p.billing_reason,
    p.amount_paid_cents,
    p.currency,
    p.coins_granted,
    p.period_start,
    p.period_end,
    p.processed_at
  FROM public.premium_invoice_payments p
  WHERE p.user_id = auth.uid()
  ORDER BY p.processed_at DESC
  LIMIT 100;
$function$
;

CREATE OR REPLACE FUNCTION public.get_developing_team_service_prices_v1()
 RETURNS TABLE(activation_coin_cost integer, renewal_coin_cost integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    cfg.activation_coin_cost,
    cfg.renewal_coin_cost
  from public.developing_team_service_config cfg
  where cfg.config_key = 'default'
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.developing_team_activation_coin_cost_v1()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select cfg.activation_coin_cost
      from public.developing_team_service_config cfg
      where cfg.config_key = 'default'
      limit 1
    ),
    100
  );
$function$
;

CREATE OR REPLACE FUNCTION public.developing_team_renewal_coin_cost_v1()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select cfg.renewal_coin_cost
      from public.developing_team_service_config cfg
      where cfg.config_key = 'default'
      limit 1
    ),
    100
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_developing_team_access_active_v1(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with resolved_main as (
    select
      main_club.id as main_club_id,
      main_club.owner_user_id
    from public.clubs requested_club
    join public.clubs main_club
      on main_club.id = case
        when requested_club.club_type = 'developing'
          then requested_club.parent_club_id
        else requested_club.id
      end
    where requested_club.id = p_club_id
    limit 1
  ),
  current_season as (
    select coalesce(
      public.get_current_season_number(),
      public.get_current_game_season_number_safe_v1(),
      1
    )::integer as season_number
  )
  select coalesce(
    exists (
      select 1
      from resolved_main main_ref
      cross join current_season season_ref
      join public.developing_team_season_access access_row
        on access_row.main_club_id = main_ref.main_club_id
      where public.user_has_premium_access_v1(main_ref.owner_user_id)
        and access_row.access_status = 'active'
        and access_row.active_season = season_ref.season_number
        and access_row.expires_after_season >= season_ref.season_number
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.team_ranking_format_competition_label_v1(p_club_tier text, p_division_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case lower(coalesce(p_club_tier, ''))
    when 'worldteam' then 'WorldTeam'
    when 'proteam' then
      'ProTeam - ' ||
      initcap(
        replace(
          regexp_replace(coalesce(p_division_key, ''), '^PRO_', ''),
          '_',
          ' '
        )
      )
    when 'continental' then
      'Continental - ' ||
      initcap(
        replace(
          regexp_replace(coalesce(p_division_key, ''), '^CONTINENTAL_', ''),
          '_',
          ' '
        )
      )
    when 'amateur' then
      'Amateur: ' ||
      initcap(replace(coalesce(p_division_key, ''), '_', ' '))
    else initcap(coalesce(p_club_tier, 'Unknown'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_current_ranking_position_v1(p_club_id uuid)
 RETURNS TABLE(club_id uuid, club_name text, club_type text, club_tier text, division_key text, competition_label text, season_year integer, rank_position integer, total_teams integer, international_points numeric, completed_race_count integer, race_reputation_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with season as (
    select
      public.team_ranking_get_current_season_year_v1()::integer
        as season_year
  ),
  target_club as (
    select
      c.id as club_id,
      c.name as club_name,
      coalesce(c.club_type::text, 'main') as club_type,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'proteam'
          then coalesce(c.tier2_division::text, '')
        when c.club_tier::text = 'continental'
          then coalesce(c.tier3_division::text, '')
        when c.club_tier::text = 'amateur'
          then coalesce(c.amateur_division::text, '')
        else 'WORLD'
      end as division_key
    from public.clubs c
    where c.id = p_club_id
      and c.deleted_at is null
    limit 1
  ),
  competition_pool as (
    select
      c.id as club_id,
      c.name as club_name,
      coalesce(c.club_type::text, 'main') as club_type,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'proteam'
          then coalesce(c.tier2_division::text, '')
        when c.club_tier::text = 'continental'
          then coalesce(c.tier3_division::text, '')
        when c.club_tier::text = 'amateur'
          then coalesce(c.amateur_division::text, '')
        else 'WORLD'
      end as division_key,
      s.season_year,
      coalesce(ip.international_points, 0)::numeric
        as international_points
    from public.clubs c
    cross join season s
    join target_club target
      on c.club_tier::text = target.club_tier
     and (
       case
         when c.club_tier::text = 'proteam'
           then coalesce(c.tier2_division::text, '')
         when c.club_tier::text = 'continental'
           then coalesce(c.tier3_division::text, '')
         when c.club_tier::text = 'amateur'
           then coalesce(c.amateur_division::text, '')
         else 'WORLD'
       end
     ) = target.division_key
    left join public.team_international_points_by_season_v1 ip
      on ip.team_id = c.id
     and ip.season_year = s.season_year
    where c.deleted_at is null
      and c.club_tier::text in (
        'worldteam',
        'proteam',
        'continental',
        'amateur'
      )
  ),
  ranked as (
    select
      pool.*,
      row_number() over (
        order by
          pool.international_points desc,
          pool.club_name asc,
          pool.club_id asc
      )::integer as rank_position,
      count(*) over ()::integer as total_teams
    from competition_pool pool
  )
  select
    ranked.club_id,
    ranked.club_name,
    ranked.club_type,
    ranked.club_tier,
    ranked.division_key,
    public.team_ranking_format_competition_label_v1(
      ranked.club_tier,
      ranked.division_key
    ) as competition_label,
    ranked.season_year,
    ranked.rank_position,
    ranked.total_teams,
    ranked.international_points,
    0::integer as completed_race_count,
    0::numeric as race_reputation_value
  from ranked
  where ranked.club_id = p_club_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_developing_team_competition_by_club_v1(p_developing_club_id uuid)
 RETURNS TABLE(developing_club_id uuid, developing_club_name text, competition_name text, current_place integer, total_teams integer, season_year integer, international_points numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with season as (
    select
      public.team_ranking_get_current_season_year_v1()::integer
        as season_year
  ),

  target as (
    select
      c.id,
      c.name,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'proteam'
          then coalesce(c.tier2_division::text, '')
        when c.club_tier::text = 'continental'
          then coalesce(c.tier3_division::text, '')
        when c.club_tier::text = 'amateur'
          then coalesce(c.amateur_division::text, '')
        else 'WORLD'
      end as division_key
    from public.clubs c
    where c.id = p_developing_club_id
      and c.club_type = 'developing'
      and c.deleted_at is null
    limit 1
  ),

  competition_pool as (
    select
      c.id,
      c.name,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'proteam'
          then coalesce(c.tier2_division::text, '')
        when c.club_tier::text = 'continental'
          then coalesce(c.tier3_division::text, '')
        when c.club_tier::text = 'amateur'
          then coalesce(c.amateur_division::text, '')
        else 'WORLD'
      end as division_key,
      s.season_year,
      coalesce(points.international_points, 0)::numeric
        as international_points
    from public.clubs c
    cross join season s
    join target t
      on c.club_tier::text = t.club_tier
     and (
       case
         when c.club_tier::text = 'proteam'
           then coalesce(c.tier2_division::text, '')
         when c.club_tier::text = 'continental'
           then coalesce(c.tier3_division::text, '')
         when c.club_tier::text = 'amateur'
           then coalesce(c.amateur_division::text, '')
         else 'WORLD'
       end
     ) = t.division_key
    left join public.team_international_points_by_season_v1 points
      on points.team_id = c.id
     and points.season_year = s.season_year
    where c.deleted_at is null
  ),

  ranked as (
    select
      pool.*,
      row_number() over (
        order by
          pool.international_points desc,
          pool.name asc,
          pool.id asc
      )::integer as current_place,
      count(*) over ()::integer as total_teams
    from competition_pool pool
  )

  select
    ranked.id as developing_club_id,
    ranked.name as developing_club_name,

    case ranked.club_tier
      when 'worldteam' then
        'WorldTeam'

      when 'proteam' then
        'ProTeam - ' ||
        initcap(
          replace(
            regexp_replace(
              ranked.division_key,
              '^PRO_',
              ''
            ),
            '_',
            ' '
          )
        )

      when 'continental' then
        'Continental - ' ||
        initcap(
          replace(
            regexp_replace(
              ranked.division_key,
              '^CONTINENTAL_',
              ''
            ),
            '_',
            ' '
          )
        )

      when 'amateur' then
        'Amateur: ' ||
        replace(
          initcap(
            replace(
              ranked.division_key,
              '_',
              ' '
            )
          ),
          'Southern Balkan Europe',
          'Southern & Balkan Europe'
        )

      else
        initcap(ranked.club_tier)
    end as competition_name,

    ranked.current_place,
    ranked.total_teams,
    ranked.season_year,
    ranked.international_points

  from ranked
  where ranked.id = p_developing_club_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_developing_team_competition_v1()
 RETURNS TABLE(developing_club_id uuid, developing_club_name text, competition_name text, current_place integer, total_teams integer, season_year integer, international_points numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with my_developing_team as (
    select
      developing.id
    from public.clubs developing
    where developing.owner_user_id = auth.uid()
      and developing.club_type = 'developing'
      and developing.deleted_at is null
    order by developing.created_at asc nulls last
    limit 1
  )

  select competition.*
  from my_developing_team developing
  cross join lateral
    public.get_developing_team_competition_by_club_v1(
      developing.id
    ) competition;
$function$
;

CREATE OR REPLACE FUNCTION public.get_developing_team_status()
 RETURNS TABLE(main_club_id uuid, main_club_name text, developing_club_id uuid, developing_club_name text, team_exists boolean, access_status text, is_active boolean, is_read_only boolean, current_season integer, active_season integer, expires_after_season integer, next_renewal_season integer, auto_renew boolean, activation_coin_cost integer, renewal_coin_cost integer, coin_balance integer, coin_requirement_met boolean, activation_coin_requirement_met boolean, renewal_coin_requirement_met boolean, real_days_played integer, game_days_played integer, time_requirement_met boolean, can_activate boolean, can_reactivate boolean, can_change_auto_renew boolean, movement_window_open boolean, current_window_label text, next_window_label text, current_competition_name text, current_competition_place integer, current_competition_total_teams integer, is_purchased boolean, coin_cost integer, can_purchase boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
  with status_base as (
    select *
    from public.get_developing_team_status_base_v9()
  ),
  premium as (
    select public.current_user_has_premium_v1() as is_premium
  )
  select
    b.main_club_id,
    b.main_club_name,
    b.developing_club_id,
    b.developing_club_name,
    b.team_exists,
    case
      when p.is_premium then b.access_status
      when b.team_exists then 'expired'::text
      else 'not_activated'::text
    end,
    (b.is_active and p.is_premium),
    (b.is_read_only or (b.team_exists and not p.is_premium)),
    b.current_season,
    b.active_season,
    b.expires_after_season,
    b.next_renewal_season,
    (b.auto_renew and p.is_premium),
    b.activation_coin_cost,
    b.renewal_coin_cost,
    b.coin_balance,
    b.coin_requirement_met,
    b.activation_coin_requirement_met,
    b.renewal_coin_requirement_met,
    b.real_days_played,
    b.game_days_played,
    b.time_requirement_met,
    (b.can_activate and p.is_premium),
    (b.can_reactivate and p.is_premium),
    (b.can_change_auto_renew and p.is_premium),
    (b.movement_window_open and b.is_active and p.is_premium),
    b.current_window_label,
    b.next_window_label,
    b.current_competition_name,
    b.current_competition_place,
    b.current_competition_total_teams,
    (b.is_purchased and p.is_premium),
    b.coin_cost,
    (b.can_purchase and p.is_premium)
  from status_base b
  cross join premium p;
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_has_premium_v1()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select public.user_has_premium_access_v1(auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.get_scout_report_coin_cost_v1(p_reports_used_today integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when greatest(coalesce(p_reports_used_today, 0), 0) = 0 then 0
    else 3
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.infrastructure_asset_slot_limits_v1(p_asset_key text)
 RETURNS TABLE(free_slots integer, premium_slots integer, absolute_max_slots integer)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select
    case when p_asset_key = 'team_car' then 3 else 1 end,
    case when p_asset_key = 'team_car' then 5 else 2 end,
    case when p_asset_key = 'team_car' then 10 else 3 end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_first_free_policy_option_v1(p_policy_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.option_code
  from public.team_policy_option_catalog c
  where c.policy_key = p_policy_key
    and c.is_active = true
    and not (
      p_policy_key in (
        'staff_equipment_level',
        'staff_accommodation_level'
      )
      and c.option_code = 'none'
    )
  order by c.sort_order, c.option_code
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_current_season_v1()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select greatest(
    1,
    extract(year from coalesce(public.get_current_game_date_date(), current_date))::integer - 1999
  );
$function$
;

CREATE OR REPLACE FUNCTION public.customize_team_wallet_balance_v1()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select coalesce(
    (select w.balance from public.user_wallets w where w.user_id = auth.uid()),
    0
  )::integer;
$function$
;

CREATE OR REPLACE FUNCTION public.is_universal_race_integration_test_admin_v1()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    current_user in ('postgres', 'service_role')
    or exists (
      select 1
      from public.universal_race_integration_test_settings setting_row
      where setting_row.singleton_id = true
        and setting_row.enabled = true
        and lower(setting_row.admin_email) =
          lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_integration_test_hash_v1(p_payload jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select encode(
    extensions.digest(
      convert_to(coalesce(p_payload, 'null'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_integration_test_state_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with state_row as (
    select
      state.*,
      run.input_hash,
      run.output_hash,
      run.calculated_at as run_calculated_at,
      run.published_at as run_published_at
    from public.universal_race_integration_test_stage_state state
    left join public.universal_race_integration_test_runs run
      on run.id = state.current_run_id
    where state.stage_id = p_stage_id
  ),
  next_state as (
    select next_stage.*
    from state_row current_state
    join public.universal_race_integration_test_stage_state next_stage
      on next_stage.race_id = current_state.race_id
     and next_stage.stage_number = current_state.stage_number + 1
  )
  select coalesce(
    (
      select jsonb_build_object(
        'stage_id', state_row.stage_id,
        'race_id', state_row.race_id,
        'stage_number', state_row.stage_number,
        'unlocked', state_row.unlocked,
        'status', state_row.status,
        'current_run_id', state_row.current_run_id,
        'input_hash', state_row.input_hash,
        'output_hash', state_row.output_hash,
        'calculated_at',
          coalesce(state_row.calculated_at, state_row.run_calculated_at),
        'published_at',
          coalesce(state_row.published_at, state_row.run_published_at),
        'next_stage_id', next_state.stage_id,
        'next_stage_number', next_state.stage_number,
        'next_stage_unlocked', coalesce(next_state.unlocked, false)
      )
      from state_row
      left join next_state on true
    ),
    '{}'::jsonb
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_integration_test_published_stage_ids_v1(p_race_id uuid)
 RETURNS TABLE(stage_id uuid, stage_number integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    state.stage_id,
    state.stage_number
  from public.universal_race_integration_test_stage_state state
  where state.race_id = p_race_id
    and state.status = 'published'
  order by state.stage_number;
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_integration_test_race_view_v1(p_race_id uuid, p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with selected_run as (
    select run.*
    from public.universal_race_integration_test_stage_state state
    join public.universal_race_integration_test_runs run
      on run.id = state.current_run_id
    where state.race_id = p_race_id
      and state.stage_id = p_stage_id
      and state.status = 'published'
      and run.status = 'published'
  ),
  general_leader as (
    select classification
    from selected_run run
    cross join lateral jsonb_array_elements(
      run.cumulative_classifications_payload
    ) classification
    where classification ->> 'classification_type' = 'general'
      and classification ->> 'entity_type' = 'rider'
      and classification ->> 'rank' = '1'
    limit 1
  ),
  points_leader as (
    select classification
    from selected_run run
    cross join lateral jsonb_array_elements(
      run.cumulative_classifications_payload
    ) classification
    where classification ->> 'classification_type' = 'points'
      and classification ->> 'entity_type' = 'rider'
      and classification ->> 'rank' = '1'
    limit 1
  ),
  mountain_leader as (
    select classification
    from selected_run run
    cross join lateral jsonb_array_elements(
      run.cumulative_classifications_payload
    ) classification
    where classification ->> 'classification_type' = 'mountain'
      and classification ->> 'entity_type' = 'rider'
      and classification ->> 'rank' = '1'
    limit 1
  ),
  young_leader as (
    select classification
    from selected_run run
    cross join lateral jsonb_array_elements(
      run.cumulative_classifications_payload
    ) classification
    where classification ->> 'classification_type' = 'young'
      and classification ->> 'entity_type' = 'rider'
      and classification ->> 'rank' = '1'
    limit 1
  ),
  team_leader as (
    select classification
    from selected_run run
    cross join lateral jsonb_array_elements(
      run.cumulative_classifications_payload
    ) classification
    where classification ->> 'classification_type' = 'team'
      and classification ->> 'entity_type' = 'team'
      and classification ->> 'rank' = '1'
    limit 1
  )
  select coalesce(
    (
      select jsonb_build_object(
        'race_id', run.race_id,
        'stage_id', run.stage_id,
        'stage_number', run.stage_number,
        'status', run.status,
        'published', true,
        'run_id', run.id,
        'stage_results', run.stage_results_payload,
        'point_results', run.point_results_payload,
        'classifications', run.cumulative_classifications_payload,
        'leader_snapshot', jsonb_build_object(
          'general', jsonb_build_object(
            'name', coalesce(general_leader.classification ->> 'display_name_snapshot', ''),
            'team', coalesce(general_leader.classification ->> 'team_name_snapshot', ''),
            'value', ''
          ),
          'sprinter', jsonb_build_object(
            'name', coalesce(points_leader.classification ->> 'display_name_snapshot', ''),
            'team', coalesce(points_leader.classification ->> 'team_name_snapshot', ''),
            'value', coalesce(points_leader.classification ->> 'points', '')
          ),
          'mountain', jsonb_build_object(
            'name', coalesce(mountain_leader.classification ->> 'display_name_snapshot', ''),
            'team', coalesce(mountain_leader.classification ->> 'team_name_snapshot', ''),
            'value', coalesce(mountain_leader.classification ->> 'points', '')
          ),
          'young', jsonb_build_object(
            'name', coalesce(young_leader.classification ->> 'display_name_snapshot', ''),
            'team', coalesce(young_leader.classification ->> 'team_name_snapshot', ''),
            'value', ''
          ),
          'team', jsonb_build_object(
            'name', coalesce(team_leader.classification ->> 'display_name_snapshot', ''),
            'team', coalesce(team_leader.classification ->> 'team_name_snapshot', ''),
            'value', ''
          )
        )
      )
      from selected_run run
      left join general_leader on true
      left join points_leader on true
      left join mountain_leader on true
      left join young_leader on true
      left join team_leader on true
    ),
    '{}'::jsonb
  );
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_get_stage_phase9_inputs_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
canonical_modifiers as (
  select *
  from public.race_engine_get_stage_rider_preparation_modifiers_v2(p_stage_id)
),
stage_context as (
  select
    stage.id as stage_id,
    lower(
      coalesce(
        nullif(to_jsonb(stage) ->> 'stage_format', ''),
        nullif(to_jsonb(stage) ->> 'stage_type', ''),
        nullif(to_jsonb(stage) ->> 'format', ''),
        'road_race'
      )
    ) as stage_format,
    lower(
      coalesce(
        nullif(to_jsonb(stage) ->> 'terrain_type', ''),
        nullif(to_jsonb(stage) ->> 'profile_type', ''),
        'flat'
      )
    ) as terrain_type
  from public.race_stages stage
  where stage.id = p_stage_id
),
stage_plans as (
  select
    rsp.id as stage_plan_id,
    rsp.race_id,
    rsp.stage_id,
    rsp.race_preparation_id,
    coalesce(rp.participating_club_id, rp.club_id) as team_id,
    rp.status as preparation_status,
    rp.default_equipment_setup_id,
    coalesce(rsp.rider_equipment_json, '{}'::jsonb) as rider_equipment_json,
    coalesce(rsp.rider_supplies_json, '{}'::jsonb) as rider_supplies_json,
    coalesce(rsp.bonus_snapshot_json, '{}'::jsonb) as stage_bonus_snapshot_json,
    rp.validation_snapshot_json,
    rp.engine_payload_json
  from public.race_stage_plans rsp
  join public.race_preparations rp
    on rp.id = rsp.race_preparation_id
  where rsp.stage_id = p_stage_id
    and lower(coalesce(rp.status, '')) in (
      'submitted', 'locked', 'final', 'finalized', 'completed'
    )
),
team_rider_counts as (
  select team_id, count(*)::numeric as rider_count
  from canonical_modifiers
  group by team_id
),
plan_rider_snapshots as (
  select
    sp.stage_plan_id,
    sp.team_id,
    spr.id as stage_plan_rider_id,
    spr.rider_id,
    spr.equipment_setup_id,
    spr.equipment_bonus_snapshot_json,
    spr.final_bonus_snapshot_json,
    spr.rider_stage_snapshot_json
  from stage_plans sp
  join public.race_stage_plan_riders spr
    on spr.race_stage_plan_id = sp.stage_plan_id
),
rider_equipment_sources as (
  select
    modifier.team_id,
    modifier.rider_id,
    sp.stage_plan_id,
    sp.race_preparation_id,
    snapshot.stage_plan_rider_id,
    snapshot.equipment_setup_id as child_equipment_setup_id,
    sp.default_equipment_setup_id as preparation_default_setup_id,
    snapshot.equipment_bonus_snapshot_json,
    snapshot.final_bonus_snapshot_json,
    snapshot.rider_stage_snapshot_json,
    case
      when sp.stage_plan_id is null then null
      when jsonb_typeof(sp.rider_equipment_json -> modifier.rider_id::text) = 'string'
        then nullif(trim(sp.rider_equipment_json ->> modifier.rider_id::text), '')
      when jsonb_typeof(sp.rider_equipment_json -> modifier.rider_id::text) = 'object'
        then coalesce(
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'preset_id', ''),
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'equipment_setup_id', ''),
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'setup_id', ''),
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'id', '')
        )
      else null
    end as direct_stage_setup_text,
    case
      when sp.stage_plan_id is not null
       and sp.rider_equipment_json ? modifier.rider_id::text
        then true
      else false
    end as has_direct_stage_equipment_assignment
  from canonical_modifiers modifier
  left join stage_plans sp
    on sp.team_id = modifier.team_id
  left join plan_rider_snapshots snapshot
    on snapshot.stage_plan_id = sp.stage_plan_id
   and snapshot.rider_id = modifier.rider_id
),
resolved_rider_setup as (
  select
    source.*,
    case
      when source.child_equipment_setup_id is not null
        then source.child_equipment_setup_id
      when coalesce(source.direct_stage_setup_text, '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then source.direct_stage_setup_text::uuid
      when source.preparation_default_setup_id is not null
        then source.preparation_default_setup_id
      else null
    end as resolved_preset_id,
    case
      when source.child_equipment_setup_id is not null
        then 'race_stage_plan_riders.equipment_setup_id'
      when source.has_direct_stage_equipment_assignment
        then 'race_stage_plans.rider_equipment_json'
      when source.preparation_default_setup_id is not null
        then 'race_preparations.default_equipment_setup_id'
      else 'club_equipment_default_setup'
    end as requested_source
  from rider_equipment_sources source
),
resolved_equipment_catalogs as (
  select
    rider.team_id,
    rider.rider_id,
    rider.stage_plan_id,
    rider.stage_plan_rider_id,
    rider.resolved_preset_id,
    rider.requested_source,
    rider.has_direct_stage_equipment_assignment,
    rider.equipment_bonus_snapshot_json,
    rider.final_bonus_snapshot_json,
    rider.rider_stage_snapshot_json,
    coalesce(preset.frame_catalog_item_id, defaults.frame_catalog_item_id) as frame_catalog_item_id,
    coalesce(preset.wheelset_catalog_item_id, defaults.wheelset_catalog_item_id) as wheelset_catalog_item_id,
    coalesce(preset.tires_catalog_item_id, defaults.tires_catalog_item_id) as tires_catalog_item_id,
    coalesce(preset.groupset_catalog_item_id, defaults.groupset_catalog_item_id) as groupset_catalog_item_id,
    coalesce(preset.helmet_catalog_item_id, defaults.helmet_catalog_item_id) as helmet_catalog_item_id,
    coalesce(preset.shoes_catalog_item_id, defaults.shoes_catalog_item_id) as shoes_catalog_item_id,
    case
      when preset.id is not null then rider.requested_source
      when defaults.club_id is not null then 'club_equipment_default_setup'
      else 'no_equipment_setup_available'
    end as resolved_source
  from resolved_rider_setup rider
  left join public.club_equipment_setup_presets preset
    on preset.id = rider.resolved_preset_id
   and preset.club_id = rider.team_id
  left join public.club_equipment_default_setup defaults
    on defaults.club_id = rider.team_id
),
equipment_preview as (
  select
    catalog.*,
    case
      when catalog.frame_catalog_item_id is null
       and catalog.wheelset_catalog_item_id is null
       and catalog.tires_catalog_item_id is null
       and catalog.groupset_catalog_item_id is null
       and catalog.helmet_catalog_item_id is null
       and catalog.shoes_catalog_item_id is null
        then '{}'::jsonb
      else public.equipment_calculate_catalog_setup_bonus_preview(
        catalog.frame_catalog_item_id,
        catalog.wheelset_catalog_item_id,
        catalog.tires_catalog_item_id,
        catalog.groupset_catalog_item_id,
        catalog.helmet_catalog_item_id,
        catalog.shoes_catalog_item_id
      )
    end as calculated_bonus_preview
  from resolved_equipment_catalogs catalog
),
equipment_effect_source as (
  select
    preview.*,
    coalesce(
      jsonb_path_query_first(
        coalesce(preview.equipment_bonus_snapshot_json, '{}'::jsonb),
        '$.**.weighted_bonuses'
      ),
      jsonb_path_query_first(
        coalesce(preview.final_bonus_snapshot_json, '{}'::jsonb),
        '$.**.weighted_bonuses'
      ),
      preview.calculated_bonus_preview -> 'weighted_bonuses',
      '{}'::jsonb
    ) as weighted_bonuses,
    case
      when context.stage_format ~ '(itt|ttt|time_trial|time trial|prologue)'
        then 'time_trial_bonus_pct'
      when context.terrain_type ~ '(mountain|climb|summit|steep)'
        then 'mountain_bonus_pct'
      when context.terrain_type ~ '(hilly|rolling|undulating)'
        then 'hilly_bonus_pct'
      when context.terrain_type ~ '(cobble|pav[eé])'
        then 'cobble_bonus_pct'
      else 'flat_bonus_pct'
    end as stage_bonus_key
  from equipment_preview preview
  cross join stage_context context
),
rider_equipment_bonus as (
  select
    source.rider_id,
    source.team_id,
    case
      when source.stage_bonus_key = 'time_trial_bonus_pct'
       and exists (
         select 1
         from public.clubs club
         where club.id = source.team_id
           and coalesce(club.is_ai, false)
       )
      then greatest(
        0::numeric,
        greatest(
          -5::numeric,
          least(
            5::numeric,
            coalesce(
              nullif(source.weighted_bonuses ->> source.stage_bonus_key, '')::numeric,
              0
            ) * 5
          )
        )
      )
      else greatest(
        -5::numeric,
        least(
          5::numeric,
          coalesce(
            nullif(source.weighted_bonuses ->> source.stage_bonus_key, '')::numeric,
            0
          ) * 5
        )
      )
    end as equipment_performance_bonus_points,
    0::numeric as equipment_suitability_bonus_points,
    greatest(
      0::numeric,
      least(
        10::numeric,
        coalesce(
          nullif(source.weighted_bonuses ->> 'fatigue_reduction_pct', '')::numeric,
          0
        ) * 5
      )
    ) as equipment_fatigue_reduction_pct,
    source.stage_bonus_key,
    source.resolved_source as bonus_source
  from equipment_effect_source source
),
equipment_selections as (
  select
    source.stage_plan_id,
    source.team_id,
    source.stage_plan_rider_id,
    source.rider_id,
    source.resolved_preset_id as equipment_setup_id,
    source.resolved_source,
    chosen.equipment_category,
    chosen.catalog_item_id,
    row_number() over (
      partition by
        source.team_id,
        chosen.equipment_category,
        chosen.catalog_item_id
      order by source.rider_id::text
    ) as physical_rank
  from resolved_equipment_catalogs source
  cross join lateral (
    values
      ('frame'::text, source.frame_catalog_item_id),
      ('wheelset'::text, source.wheelset_catalog_item_id),
      ('tires'::text, source.tires_catalog_item_id),
      ('groupset'::text, source.groupset_catalog_item_id),
      ('helmet'::text, source.helmet_catalog_item_id),
      ('shoes'::text, source.shoes_catalog_item_id)
  ) as chosen(equipment_category, catalog_item_id)
  where chosen.catalog_item_id is not null
),
equipment_inventory as (
  select
    inventory.*,
    row_number() over (
      partition by
        inventory.club_id,
        inventory.equipment_category,
        inventory.catalog_item_id
      order by
        inventory.condition_percent desc,
        inventory.id::text
    ) as physical_rank
  from public.club_equipment_inventory inventory
  where lower(coalesce(inventory.status, '')) = 'ready'
    and inventory.condition_percent > 0
    and inventory.sold_game_date is null
    and inventory.discarded_game_date is null
),
allocated_equipment as (
  select
    selection.team_id,
    selection.rider_id,
    selection.stage_plan_rider_id,
    selection.equipment_setup_id,
    selection.resolved_source,
    selection.equipment_category,
    selection.catalog_item_id,
    inventory.id as inventory_id,
    inventory.display_name,
    inventory.quality_score,
    inventory.durability_score,
    inventory.condition_percent
  from equipment_selections selection
  join equipment_inventory inventory
    on inventory.club_id = public.universal_race_resource_owner_club_v1(selection.team_id)
   and inventory.equipment_category = selection.equipment_category
   and inventory.catalog_item_id = selection.catalog_item_id
   and inventory.physical_rank = selection.physical_rank
),
equipment_json as (
  select coalesce(
    jsonb_object_agg(
      allocated.inventory_id::text,
      jsonb_build_object(
        'teamId', public.universal_race_resource_owner_club_v1(allocated.team_id),
        'sportingTeamId', allocated.team_id,
        'riderId', allocated.rider_id,
        'condition', allocated.condition_percent,
        'intensity', greatest(
          0::numeric,
          (1::numeric - least(
            30::numeric,
            public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id)
          ) / 100.0)
          *
          (1::numeric - least(
            50::numeric,
            public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(p_stage_id, allocated.team_id)
          ) / 100.0)
        ),
        'equipmentVanProtectionPct', public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id),
        'mobileWorkshopFieldRecoveryPct', public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(p_stage_id, allocated.team_id),
        'category', allocated.equipment_category,
        'catalogItemId', allocated.catalog_item_id,
        'equipmentSetupId', allocated.equipment_setup_id,
        'displayName', allocated.display_name,
        'qualityScore', allocated.quality_score,
        'durabilityScore', allocated.durability_score,
        'source', allocated.resolved_source
      )
      order by allocated.inventory_id::text
    ),
    '{}'::jsonb
  ) as value
  from allocated_equipment allocated
),
explicit_stage_supply_rows as (
  select
    sp.team_id,
    supply.id as stage_supply_id,
    supply.supply_key,
    greatest(0, supply.quantity_planned) as quantity_planned,
    greatest(0, supply.quantity_consumed) as quantity_consumed,
    supply.supply_snapshot_json,
    supply.bonus_snapshot_json,
    inventory.quantity_available,
    'race_stage_plan_supplies'::text as supply_source
  from stage_plans sp
  join public.race_stage_plan_supplies supply
    on supply.race_stage_plan_id = sp.stage_plan_id
  left join public.club_race_supplies inventory
    on inventory.club_id = public.universal_race_resource_owner_club_v1(sp.team_id)
   and inventory.supply_key = supply.supply_key
),
direct_supply_rider_rows as (
  select
    sp.team_id,
    rider_entry.key as rider_id_text,
    rider_entry.value as rider_supplies,
    case
      when coalesce(rider_entry.value ->> 'bidons', rider_entry.value ->> 'bidons_water_bottles', '0') ~ '^[0-9]+$'
        then coalesce(rider_entry.value ->> 'bidons', rider_entry.value ->> 'bidons_water_bottles', '0')::integer
      else 0
    end as bidons,
    case
      when coalesce(rider_entry.value ->> 'gels', rider_entry.value ->> 'energy_gels', '0') ~ '^[0-9]+$'
        then coalesce(rider_entry.value ->> 'gels', rider_entry.value ->> 'energy_gels', '0')::integer
      else 0
    end as energy_gels,
    case
      when coalesce(rider_entry.value ->> 'nutrition_packs', '0') ~ '^[0-9]+$'
        then coalesce(rider_entry.value ->> 'nutrition_packs', '0')::integer
      else 0
    end as nutrition_packs,
    case
      when lower(coalesce(rider_entry.value ->> 'race_jersey_complete', 'false')) in ('true', '1', 'yes') then 1
      when coalesce(rider_entry.value ->> 'race_jersey_complete', '0') ~ '^[0-9]+$'
        then least(1, coalesce(rider_entry.value ->> 'race_jersey_complete', '0')::integer)
      else 0
    end as race_jersey_complete,
    case
      when lower(coalesce(rider_entry.value ->> 'rain_jacket', rider_entry.value ->> 'rain_jackets', 'false')) in ('true', '1', 'yes') then 1
      when coalesce(rider_entry.value ->> 'rain_jacket', rider_entry.value ->> 'rain_jackets', '0') ~ '^[0-9]+$'
        then least(1, coalesce(rider_entry.value ->> 'rain_jacket', rider_entry.value ->> 'rain_jackets', '0')::integer)
      else 0
    end as rain_jackets
  from stage_plans sp
  cross join lateral jsonb_each(coalesce(sp.rider_supplies_json, '{}'::jsonb)) rider_entry
  where jsonb_typeof(rider_entry.value) = 'object'
),
direct_stage_supply_totals as (
  select
    rider.team_id,
    generated.supply_key,
    sum(generated.quantity_planned)::integer as quantity_planned
  from direct_supply_rider_rows rider
  cross join lateral (
    values
      ('bidons_water_bottles'::text, rider.bidons),
      ('energy_gels'::text, rider.energy_gels),
      ('nutrition_packs'::text, rider.nutrition_packs),
      ('race_jersey_complete'::text, rider.race_jersey_complete),
      ('rain_jackets'::text, rider.rain_jackets)
  ) as generated(supply_key, quantity_planned)
  where generated.quantity_planned > 0
  group by rider.team_id, generated.supply_key
),
direct_stage_supply_rows as (
  select
    total.team_id,
    null::uuid as stage_supply_id,
    total.supply_key,
    total.quantity_planned,
    0::integer as quantity_consumed,
    '{}'::jsonb as supply_snapshot_json,
    '{}'::jsonb as bonus_snapshot_json,
    inventory.quantity_available,
    'race_stage_plans.rider_supplies_json'::text as supply_source
  from direct_stage_supply_totals total
  left join public.club_race_supplies inventory
    on inventory.club_id = public.universal_race_resource_owner_club_v1(total.team_id)
   and inventory.supply_key = total.supply_key
),
stage_supply_rows as (
  select * from explicit_stage_supply_rows
  union all
  select direct.*
  from direct_stage_supply_rows direct
  where not exists (
    select 1
    from explicit_stage_supply_rows explicit
    where explicit.team_id = direct.team_id
      and explicit.supply_key = direct.supply_key
  )
),
supply_availability_rows as (
  select
    supply.*,
    greatest(
      0::numeric,
      least(
        greatest(0::numeric, coalesce(supply.quantity_planned, 0)),
        greatest(0::numeric, coalesce(supply.quantity_available, 0))
      )
    ) as usable_quantity,
    case
      when greatest(0::numeric, coalesce(supply.quantity_planned, 0)) > 0
        then least(
          1::numeric,
          greatest(0::numeric, coalesce(supply.quantity_available, 0))
          / greatest(1::numeric, coalesce(supply.quantity_planned, 0))
        )
      else 0::numeric
    end as usable_ratio
  from stage_supply_rows supply
),
supply_effect_rows as (
  select
    supply.*,
    greatest(1::numeric, coalesce(team_count.rider_count, 1)) as team_rider_count,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'supplySupportPoints', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'supply_support_points', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'supportPoints', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'energy_gels' then 0.75 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'race_jersey_complete' then 1.5 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_support_points,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'energySavingPct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'energy_saving_pct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'energyCostReductionPct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'energy_cost_reduction_pct', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'bidons_water_bottles' then 0.6 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'energy_gels' then 1.5 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'nutrition_packs' then 3.0 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_energy_saving_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'energyPenaltyPct', '')::numeric,
      nullif(supply.bonus_snapshot_json ->> 'energy_penalty_pct', '')::numeric,
      0
    ) as supply_energy_penalty_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'fatigueReductionPct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'fatigue_reduction_pct', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'bidons_water_bottles' then 0.6 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'race_jersey_complete' then 0.75 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_fatigue_reduction_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'fatiguePenaltyPct', '')::numeric,
      nullif(supply.bonus_snapshot_json ->> 'fatigue_penalty_pct', '')::numeric,
      case
        when supply.supply_key in ('bidons_water_bottles', 'energy_gels', 'nutrition_packs')
         and greatest(0::numeric, coalesce(supply.quantity_planned, 0))
             > greatest(0::numeric, coalesce(supply.quantity_available, 0))
          then 3
        else 0
      end
    ) as supply_fatigue_penalty_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'recoveryBonusPoints', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'recovery_bonus_points', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'nutrition_packs' then 1.5 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_recovery_bonus_points
  from supply_availability_rows supply
  left join team_rider_counts team_count
    on team_count.team_id = supply.team_id
),
supply_json as (
  select coalesce(
    jsonb_object_agg(
      concat(supply.team_id::text, ':', supply.supply_key),
      jsonb_build_object(
        'teamId', public.universal_race_resource_owner_club_v1(supply.team_id),
        'sportingTeamId', supply.team_id,
        'resourceKind',
          case
            when supply.supply_key in (
              'bidons_water_bottles',
              'energy_gels',
              'nutrition_packs'
            )
              then 'consumable_supply'
            else 'summary_supply'
          end,
        'quantity', greatest(0, coalesce(supply.quantity_available, 0)),
        'selectedQuantity',
          case
            when supply.supply_key in ('bidons_water_bottles', 'energy_gels', 'nutrition_packs')
              then greatest(0, supply.quantity_planned)
            else 0
          end,
        'plannedQuantity', greatest(0, supply.quantity_planned),
        'alreadyConsumed', greatest(0, supply.quantity_consumed),
        'supplyKey', supply.supply_key,
        'source', supply.supply_source
      )
      order by supply.team_id::text, supply.supply_key
    ),
    '{}'::jsonb
  ) as value
  from stage_supply_rows supply
),
supply_team_bonus as (
  select
    supply.team_id,
    sum(supply.supply_support_points) as supply_support_points,
    0::numeric as shortage_penalty_points,
    sum(supply.supply_energy_saving_pct) as supply_energy_saving_pct,
    sum(supply.supply_energy_penalty_pct) as supply_energy_penalty_pct,
    sum(supply.supply_fatigue_reduction_pct) as supply_fatigue_reduction_pct,
    max(supply.supply_fatigue_penalty_pct) as supply_fatigue_penalty_pct,
    sum(supply.supply_recovery_bonus_points) as supply_recovery_bonus_points
  from supply_effect_rows supply
  group by supply.team_id
),
stage_asset_rows as (
  select
    sp.team_id,
    asset.asset_key,
    asset.asset_id,
    asset.asset_snapshot_json,
    asset.effect_snapshot_json,
    asset.metadata,
    coalesce(
      nullif(asset.asset_snapshot_json ->> 'condition_percent', '')::numeric,
      nullif(asset.asset_snapshot_json ->> 'conditionPercent', '')::numeric,
      case
        when asset.asset_key in ('team_car', 'car') then
          (select car.condition_percent from public.club_team_cars car where car.id = asset.asset_id)
        when asset.asset_key in ('team_bus', 'bus') then
          (select bus.condition_percent from public.club_team_buses bus where bus.id = asset.asset_id)
        when asset.asset_key in ('equipment_van', 'van') then
          (select van.condition_percent from public.club_equipment_vans van where van.id = asset.asset_id)
        when asset.asset_key in ('mobile_workshop', 'workshop') then
          (select workshop.condition_percent from public.club_mobile_workshops workshop where workshop.id = asset.asset_id)
        when asset.asset_key in ('medical_van', 'medical') then
          (select medical.condition_percent from public.club_medical_vans medical where medical.id = asset.asset_id)
        else null
      end
    ) as condition_percent,
    coalesce(
      nullif(asset.effect_snapshot_json ->> 'intensity', '')::numeric,
      nullif(asset.metadata ->> 'intensity', '')::numeric,
      1
    ) as intensity
  from stage_plans sp
  join public.race_stage_plan_assets asset
    on asset.race_stage_plan_id = sp.stage_plan_id
),
preparation_asset_rows as (
  select
    coalesce(rp.participating_club_id, rp.club_id) as team_id,
    asset.asset_key,
    asset.asset_id,
    asset.asset_snapshot_json,
    asset.effect_snapshot_json,
    asset.metadata,
    coalesce(
      nullif(asset.asset_snapshot_json ->> 'condition_percent', '')::numeric,
      nullif(asset.asset_snapshot_json ->> 'conditionPercent', '')::numeric,
      case
        when asset.asset_key in ('team_car', 'car') then
          (select car.condition_percent from public.club_team_cars car where car.id = asset.asset_id)
        when asset.asset_key in ('team_bus', 'bus') then
          (select bus.condition_percent from public.club_team_buses bus where bus.id = asset.asset_id)
        when asset.asset_key in ('equipment_van', 'van') then
          (select van.condition_percent from public.club_equipment_vans van where van.id = asset.asset_id)
        when asset.asset_key in ('mobile_workshop', 'workshop') then
          (select workshop.condition_percent from public.club_mobile_workshops workshop where workshop.id = asset.asset_id)
        when asset.asset_key in ('medical_van', 'medical') then
          (select medical.condition_percent from public.club_medical_vans medical where medical.id = asset.asset_id)
        else null
      end
    ) as condition_percent,
    coalesce(
      nullif(asset.effect_snapshot_json ->> 'intensity', '')::numeric,
      nullif(asset.metadata ->> 'intensity', '')::numeric,
      1
    ) as intensity
  from public.race_preparation_assets asset
  join public.race_preparations rp
    on rp.id = asset.race_preparation_id
  join public.race_stages stage
    on stage.race_id = rp.race_id
   and stage.id = p_stage_id
  where lower(coalesce(rp.status, '')) in (
    'submitted', 'locked', 'final', 'finalized', 'completed'
  )
    and not exists (
      select 1
      from stage_asset_rows stage_asset
      where stage_asset.team_id = coalesce(rp.participating_club_id, rp.club_id)
    )
),
all_asset_rows as (
  select * from stage_asset_rows
  union all
  select * from preparation_asset_rows
),
asset_json as (
  select coalesce(
    jsonb_object_agg(
      asset.asset_id::text,
      jsonb_build_object(
        'teamId', public.universal_race_resource_owner_club_v1(asset.team_id),
        'sportingTeamId', asset.team_id,
        'condition', asset.condition_percent,
        'intensity', greatest(0, least(1, asset.intensity)),
        'assetKey', asset.asset_key,
        'conditionLossPerRaceDay',
          case
            when asset.asset_key in ('team_car', 'car') then
              public.team_car_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            when asset.asset_key in ('team_bus', 'bus') then
              public.team_bus_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            when asset.asset_key in ('equipment_van', 'van') then
              public.equipment_van_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            when asset.asset_key in ('mobile_workshop', 'workshop') then
              public.mobile_workshop_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            when asset.asset_key in ('medical_van', 'medical') then
              public.medical_van_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null
          end,
        'source', 'saved_race_asset_selection'
      )
      order by asset.asset_id::text
    ) filter (where asset.asset_id is not null),
    '{}'::jsonb
  ) as value
  from all_asset_rows asset
),
asset_team_bonus as (
  select
    asset.team_id,
    sum(coalesce(
      nullif(asset.effect_snapshot_json ->> 'assetSupportPoints', '')::numeric,
      nullif(asset.effect_snapshot_json ->> 'asset_support_points', '')::numeric,
      nullif(asset.effect_snapshot_json ->> 'supportPoints', '')::numeric,
      nullif(asset.effect_snapshot_json ->> 'support_points', '')::numeric,
      0
    )) as asset_support_points
  from all_asset_rows asset
  group by asset.team_id
),
staff_rows as (
  select
    coalesce(rp.participating_club_id, rp.club_id) as team_id,
    staff.id as preparation_staff_id,
    staff.staff_id,
    staff.role_type,
    staff.staff_snapshot_json,
    staff.effect_snapshot_json
  from public.race_preparation_staff staff
  join public.race_preparations rp
    on rp.id = staff.race_preparation_id
  join public.race_stages stage
    on stage.race_id = rp.race_id
   and stage.id = p_stage_id
  where lower(coalesce(rp.status, '')) in (
    'submitted', 'locked', 'final', 'finalized', 'completed'
  )
),
staff_json as (
  select coalesce(
    jsonb_object_agg(
      staff.preparation_staff_id::text,
      jsonb_build_object(
        'teamId', staff.team_id,
        'staffId', staff.staff_id,
        'role', staff.role_type,
        'source', 'race_preparation_staff'
      )
      order by staff.preparation_staff_id::text
    ),
    '{}'::jsonb
  ) as value
  from staff_rows staff
),
staff_team_bonus as (
  select
    staff.team_id,
    sum(coalesce(
      nullif(staff.effect_snapshot_json ->> 'staffSupportPoints', '')::numeric,
      nullif(staff.effect_snapshot_json ->> 'staff_support_points', '')::numeric,
      nullif(staff.effect_snapshot_json ->> 'supportPoints', '')::numeric,
      0
    )) as staff_support_points
  from staff_rows staff
  group by staff.team_id
),
canonical_team_bonus as (
  select
    modifier.team_id,
    max(coalesce(modifier.non_neutral_command_capability_bonus, 0)) as tactical_support_points,
    greatest(
      0::numeric,
      least(3::numeric, max(coalesce(modifier.mechanical_reliability, 0)) / 10)
    ) as reliability_support_points
  from canonical_modifiers modifier
  group by modifier.team_id
),
team_ids as (
  select distinct modifier.team_id from canonical_modifiers modifier
  union
  select distinct sp.team_id from stage_plans sp
),
team_bonus_json as (
  select coalesce(
    jsonb_object_agg(
      team.team_id::text,
      jsonb_build_object(
        'equipmentPerformanceBonusPoints', 0,
        'equipmentSuitabilityBonusPoints', 0,
        'supplySupportPoints', coalesce(supply.supply_support_points, 0),
        'shortagePenaltyPoints', coalesce(supply.shortage_penalty_points, 0),
        'assetSupportPoints', coalesce(asset.asset_support_points, 0),
        'staffSupportPoints', coalesce(staff.staff_support_points, 0),
        'supplyEnergySavingPct', coalesce(supply.supply_energy_saving_pct, 0),
        'supplyEnergyPenaltyPct', coalesce(supply.supply_energy_penalty_pct, 0),
        'supplyFatigueReductionPct', coalesce(supply.supply_fatigue_reduction_pct, 0),
        'supplyFatiguePenaltyPct', coalesce(supply.supply_fatigue_penalty_pct, 0),
        'supplyRecoveryBonusPoints', coalesce(supply.supply_recovery_bonus_points, 0),
        'tacticalSupportPoints', coalesce(canonical.tactical_support_points, 0),
        'reliabilitySupportPoints', coalesce(canonical.reliability_support_points, 0),
        'source', 'stage_plan_json_plus_saved_snapshots_plus_canonical_readers'
      )
      order by team.team_id::text
    ),
    '{}'::jsonb
  ) as value
  from team_ids team
  left join supply_team_bonus supply on supply.team_id = team.team_id
  left join asset_team_bonus asset on asset.team_id = team.team_id
  left join staff_team_bonus staff on staff.team_id = team.team_id
  left join canonical_team_bonus canonical on canonical.team_id = team.team_id
),
equipment_by_rider as (
  select
    equipment.rider_id,
    jsonb_object_agg(
      equipment.equipment_category,
      jsonb_build_object(
        'inventoryId', equipment.inventory_id,
        'catalogItemId', equipment.catalog_item_id,
        'condition', equipment.condition_percent,
        'qualityScore', equipment.quality_score,
        'durabilityScore', equipment.durability_score,
        'source', equipment.resolved_source
      )
      order by equipment.equipment_category
    ) as selection
  from allocated_equipment equipment
  group by equipment.rider_id
),
supply_by_team as (
  select
    supply.team_id,
    jsonb_object_agg(
      supply.supply_key,
      jsonb_build_object(
        'quantityPlanned', supply.quantity_planned,
        'quantityAvailable', coalesce(supply.quantity_available, 0),
        'source', supply.supply_source
      )
      order by supply.supply_key
    ) as selection
  from stage_supply_rows supply
  group by supply.team_id
),
rider_modifier_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'race_id', modifier.race_id,
        'stage_id', modifier.stage_id,
        'rider_id', modifier.rider_id,
        'team_id', modifier.team_id,
        'preparation_id', modifier.preparation_id,
        'preparation_status', modifier.preparation_status,
        'preparation_applied', modifier.preparation_applied,
        'race_support', modifier.race_support,
        'fatigue_control', modifier.fatigue_control,
        'recovery_support', modifier.recovery_support,
        'health_protection', modifier.health_protection,
        'mechanical_reliability', modifier.mechanical_reliability,
        'in_stage_energy_cost_multiplier', modifier.in_stage_energy_cost_multiplier,
        'non_neutral_command_capability_bonus', modifier.non_neutral_command_capability_bonus,
        'health_incident_risk_multiplier', modifier.health_incident_risk_multiplier,
        'mechanical_incident_risk_multiplier', modifier.mechanical_incident_risk_multiplier,
        'mechanical_time_loss_multiplier', modifier.mechanical_time_loss_multiplier,
        'post_stage_fatigue_multiplier', modifier.post_stage_fatigue_multiplier,
        'post_stage_recovery_bonus_points', modifier.post_stage_recovery_bonus_points,
        'equipment_performance_bonus_points', coalesce(equipment.equipment_performance_bonus_points, 0),
        'equipment_suitability_bonus_points', coalesce(equipment.equipment_suitability_bonus_points, 0),
        'equipment_fatigue_reduction_pct', coalesce(equipment.equipment_fatigue_reduction_pct, 0),
        'equipment_stage_bonus_key', equipment.stage_bonus_key,
        'equipment_bonus_source', equipment.bonus_source,
        'preparation_model_version', modifier.preparation_model_version,
        'equipment_selection', coalesce(equipment_selection.selection, '{}'::jsonb),
        'supply_selection', coalesce(supply_selection.selection, '{}'::jsonb)
      )
      order by modifier.team_id::text, modifier.rider_id::text
    ),
    '[]'::jsonb
  ) as value
  from canonical_modifiers modifier
  left join rider_equipment_bonus equipment
    on equipment.rider_id = modifier.rider_id
   and equipment.team_id = modifier.team_id
  left join equipment_by_rider equipment_selection
    on equipment_selection.rider_id = modifier.rider_id
  left join supply_by_team supply_selection
    on supply_selection.team_id = modifier.team_id
),
diagnostics as (
  select jsonb_build_object(
    'stageId', p_stage_id,
    'canonicalModifierRows', (select count(*) from canonical_modifiers),
    'stagePlanRows', (select count(*) from stage_plans),
    'selectedStaffRows', (select count(*) from staff_rows),
    'selectedAssetRows', (select count(*) from all_asset_rows),
    'explicitStageSupplyRows', (select count(*) from explicit_stage_supply_rows),
    'directStageSupplyRiderRows', (select count(*) from direct_supply_rider_rows),
    'directStageSupplyRows', (select count(*) from direct_stage_supply_rows),
    'plannedSupplyRows', (select count(*) from stage_supply_rows),
    'directStageEquipmentAssignmentRows', (
      select count(*) from rider_equipment_sources source
      where source.has_direct_stage_equipment_assignment
    ),
    'clubDefaultEquipmentRiderRows', (
      select count(*) from resolved_equipment_catalogs source
      where source.resolved_source = 'club_equipment_default_setup'
    ),
    'selectedEquipmentSlots', (select count(*) from equipment_selections),
    'allocatedPhysicalEquipmentRows', (select count(*) from allocated_equipment),
    'equipmentBonusRows', (select count(*) from rider_equipment_bonus),
    'equipmentBonusApplication', 'rider_only_no_team_double_count',
    'equipmentPercentMultiplier', 5,
    'supplyContractSource', 'approved_issue01_supply_contract_engine_after_x3',
    'supplyPositiveEffectsUseUsableQuantity', true,
    'supplyUsableQuantityRule', 'min_planned_and_available',
    'equipmentSourcePrecedence', jsonb_build_array(
      'race_stage_plan_riders.equipment_setup_id',
      'race_stage_plans.rider_equipment_json',
      'race_preparations.default_equipment_setup_id',
      'club_equipment_default_setup'
    ),
    'supplySourcePrecedence', jsonb_build_array(
      'race_stage_plan_supplies',
      'race_stage_plans.rider_supplies_json'
    ),
    'sensitiveSnapshotPayloadsReturned', false,
    'missingPhysicalEquipmentRows',
      greatest(
        0,
        (select count(*) from equipment_selections) -
        (select count(*) from allocated_equipment)
      ),
    'runtimeReadOnly', true,
    'directDatabaseWrites', false,
    'canonicalModifierFunction', 'race_engine_get_stage_rider_preparation_modifiers_v2',
    'canonicalEquipmentBonusFunction', 'equipment_calculate_catalog_setup_bonus_preview',
    'equipmentAllocationOrder', 'condition_percent_desc_inventory_id_asc',
    'modelVersion', 'phase9_production_input_adapter_v3'
  ) as value
)
select jsonb_build_object(
  'source', 'race_engine_get_stage_phase9_inputs_v1',
  'modelVersion', 'phase9_production_input_adapter_v3',
  'riderModifiers', rider_modifier_json.value,
  'preparation', jsonb_build_object(
    'equipment', equipment_json.value,
    'staff', staff_json.value,
    'assets', asset_json.value,
    'raceSupplies', supply_json.value,
    'standardizedBonuses', jsonb_build_object(
      'teams', team_bonus_json.value,
      'source', 'production_stage_plan_json_and_saved_snapshots'
    )
  ),
  'diagnostics', diagnostics.value
)
from rider_modifier_json
cross join equipment_json
cross join staff_json
cross join asset_json
cross join supply_json
cross join team_bonus_json
cross join diagnostics;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_is_active_v1(p_user_id uuid, p_club_id uuid, p_staff_id uuid, p_role_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from public.staff_advisory_access a
    join public.club_staff s on s.id=a.staff_id and s.club_id=a.club_id
    where a.user_id=p_user_id and a.club_id=p_club_id and a.staff_id=p_staff_id and a.role_type=p_role_type
      and a.entitlement_state='active'
      and a.expires_at>public.staff_advisory_game_now_v1()
      and s.is_active=true and s.role_type::text=p_role_type
  );
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_get_overview_v1(p_club_id uuid)
 RETURNS TABLE(role_type text, eligible_staff_count integer, advisor_staff_id uuid, advisor_staff_name text, advisor_country_code text, advisor_expertise integer, advisor_experience integer, advisor_potential integer, advisor_leadership integer, advisor_efficiency integer, advisor_loyalty integer, advisory_status text, advisory_expires_at timestamp with time zone, advisor_notification_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with game_clock as (
    select public.staff_advisory_game_now_v1() as game_now
  ),
  supported(role_type,sort_order) as (
    values ('head_coach'::text,1),('sport_director'::text,2),('team_doctor'::text,3),('mechanic'::text,4),('scout_analyst'::text,5)
  ),
  eligible as (
    select s.role_type::text role_type,count(*)::integer eligible_staff_count
    from public.club_staff s join supported sr on sr.role_type=s.role_type::text
    where s.club_id=p_club_id and s.is_active=true group by s.role_type::text
  ),
  access_rows as (
    select a.id access_id,a.role_type,a.staff_id,a.last_staff_id,a.expires_at,a.entitlement_state,a.remaining_paid_seconds,a.resumed_at,
           s.staff_name,s.country_code,s.expertise,s.experience,s.potential,s.leadership,s.efficiency,s.loyalty,s.is_active
    from public.staff_advisory_access a left join public.club_staff s on s.id=a.staff_id and s.club_id=a.club_id
    where a.user_id=auth.uid() and a.club_id=p_club_id
  ),
  unread_counts as (
    select coalesce(n.payload_json->>'advisor_staff_id','') advisor_staff_id_text,count(*)::integer unread_count
    from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id
    where un.user_id=auth.uid() and un.deleted_at is null and un.status='unread' and nt.preference_group='staffAdvisory'
      and coalesce(n.payload_json->>'advisor_report','false')='true'
    group by coalesce(n.payload_json->>'advisor_staff_id','')
  )
  select sr.role_type,coalesce(e.eligible_staff_count,0)::integer,
    case when ar.is_active=true then ar.staff_id else null end,
    case when ar.is_active=true then ar.staff_name::text else null end,
    case when ar.is_active=true then ar.country_code::text else null end,
    case when ar.is_active=true then ar.expertise::integer else null end,
    case when ar.is_active=true then ar.experience::integer else null end,
    case when ar.is_active=true then ar.potential::integer else null end,
    case when ar.is_active=true then ar.leadership::integer else null end,
    case when ar.is_active=true then ar.efficiency::integer else null end,
    case when ar.is_active=true then ar.loyalty::integer else null end,
    case
      when ar.access_id is null then case when coalesce(e.eligible_staff_count,0)=0 then 'no_staff' else 'unassigned' end
      when ar.entitlement_state='paused' and ar.remaining_paid_seconds>0 then 'paused'
      when ar.entitlement_state='active' and ar.is_active=true and ar.expires_at>gc.game_now and ar.resumed_at is not null and ar.last_staff_id is distinct from ar.staff_id then 'resumed'
      when ar.entitlement_state='active' and ar.is_active=true and ar.expires_at>gc.game_now then 'active'
      when ar.entitlement_state='expired' or (ar.entitlement_state='active' and (ar.expires_at is null or ar.expires_at<=gc.game_now)) then 'expired'
      when ar.remaining_paid_seconds>0 and coalesce(e.eligible_staff_count,0)=0 then 'paused'
      else case when coalesce(e.eligible_staff_count,0)=0 then 'no_staff' else 'unassigned' end
    end,
    case
      when ar.entitlement_state='active' and ar.is_active=true and ar.expires_at>gc.game_now then ar.expires_at
      when ar.entitlement_state='paused' and ar.remaining_paid_seconds>0 then gc.game_now+make_interval(secs=>ar.remaining_paid_seconds::double precision)
      else null
    end,
    coalesce(uc.unread_count,0)::integer
  from supported sr cross join game_clock gc
  left join eligible e on e.role_type=sr.role_type
  left join access_rows ar on ar.role_type=sr.role_type
  left join unread_counts uc on uc.advisor_staff_id_text=coalesce(ar.staff_id,ar.last_staff_id)::text
  where exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=auth.uid() and c.deleted_at is null)
  order by sr.sort_order;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_notification_type_v1(p_role_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_role_type
    when 'head_coach' then 'ADVISOR_HEAD_COACH_REPORT'
    when 'sport_director' then 'ADVISOR_SPORT_DIRECTOR_REPORT'
    when 'team_doctor' then 'ADVISOR_TEAM_DOCTOR_REPORT'
    when 'mechanic' then 'ADVISOR_CHIEF_MECHANIC_REPORT'
    when 'scout_analyst' then 'ADVISOR_SCOUT_REPORT'
    else null
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_advisor_notifications_v1(p_advisor_staff_id uuid, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_notification_id bigint, status text, read_at timestamp with time zone, assigned_at timestamp with time zone, notification_id bigint, title text, message text, action_url text, payload_json jsonb, notification_created_at timestamp with time zone, type_code text, advisor_role text, advisor_staff_id uuid, advisor_staff_name text, report_code text, report_period_key text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    un.id,
    un.status::text,
    un.read_at,
    un.created_at,
    n.id,
    n.title::text,
    n.message,
    n.action_url::text,
    n.payload_json,
    n.created_at,
    nt.code::text,
    n.payload_json->>'advisor_role',
    nullif(n.payload_json->>'advisor_staff_id', '')::uuid,
    n.payload_json->>'advisor_staff_name',
    n.payload_json->>'report_code',
    n.payload_json->>'report_period_key'
  from public.user_notifications un
  join public.notifications n
    on n.id = un.notification_id
  join public.notification_types nt
    on nt.id = n.type_id
  where un.user_id = auth.uid()
    and un.deleted_at is null
    and nt.preference_group = 'staffAdvisory'
    and coalesce(n.payload_json->>'advisor_report', 'false') = 'true'
    and nullif(n.payload_json->>'advisor_staff_id', '')::uuid = p_advisor_staff_id
    and (
      p_status is null
      or p_status = ''
      or un.status = p_status
    )
    and (n.expires_at is null or n.expires_at > now())
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(coalesce(p_offset, 0), 0);
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_staff_advisory_reports_v1(p_advisor_staff_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, staff_id uuid, role_type text, report_code text, report_period_key text, title text, summary text, report_json jsonb, notification_id bigint, generated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    r.id,
    r.staff_id,
    r.role_type,
    r.report_code,
    r.report_period_key,
    r.title,
    r.summary,
    r.report_json,
    r.notification_id,
    r.generated_at
  from public.staff_advisory_reports r
  where r.user_id = auth.uid()
    and (
      p_advisor_staff_id is null
      or r.staff_id = p_advisor_staff_id
    )
  order by r.generated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_sport_director_missing_stage_details_v1(p_race_preparation_id uuid, p_race_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ctx as (
    select coalesce(public.get_current_game_date_date(), current_date)::date as today
  ),
  missing as (
    select
      s.id as stage_id,
      s.stage_number,
      s.stage_date::date as stage_date,
      coalesce(
        nullif(to_jsonb(s)->>'planned_start_time_label', ''),
        nullif(to_jsonb(s)->>'start_time_label', ''),
        'unknown'
      ) as stage_start_time_label,
      rsp.id as stage_plan_id,
      nullif(lower(coalesce(rsp.status::text, '')), '') as stage_plan_status,
      rsp.last_saved_at,
      rsp.last_saved_game_ts,
      case
        when s.stage_date::date < ctx.today then 'past'
        when s.stage_date::date = ctx.today then 'today'
        when s.stage_date::date = ctx.today + 1 then 'tomorrow'
        else 'future'
      end as urgency,
      case
        when s.stage_date::date < ctx.today then 4
        when s.stage_date::date = ctx.today then 1
        when s.stage_date::date = ctx.today + 1 then 2
        else 3
      end as urgency_order
    from public.race_stages s
    cross join ctx
    left join public.race_stage_plans rsp
      on rsp.race_preparation_id = p_race_preparation_id
     and rsp.stage_id = s.id
    where s.race_id = p_race_id
      and (
        rsp.id is null
        or (
          rsp.last_saved_at is null
          and lower(coalesce(rsp.status::text, '')) not in (
            'saved',
            'submitted',
            'locked',
            'finalised',
            'finalized'
          )
        )
      )
  ),
  ordered as (
    select *
    from missing
    order by urgency_order, stage_date, stage_number
  ),
  future_actionable as (
    select *
    from ordered
    where urgency <> 'past'
  ),
  next_missing as (
    select *
    from future_actionable
    order by urgency_order, stage_date, stage_number
    limit 1
  )
  select jsonb_build_object(
    'missing_stage_count', (select count(*)::integer from missing),
    'actionable_missing_stage_count', (select count(*)::integer from future_actionable),
    'past_missing_stage_count', (
      select count(*)::integer from missing where urgency = 'past'
    ),
    'today_missing_stage_count', (
      select count(*)::integer from missing where urgency = 'today'
    ),
    'tomorrow_missing_stage_count', (
      select count(*)::integer from missing where urgency = 'tomorrow'
    ),
    'future_missing_stage_count', (
      select count(*)::integer from missing where urgency = 'future'
    ),
    'next_missing_stage', coalesce(
      (
        select jsonb_build_object(
          'stage_id', n.stage_id,
          'stage_number', n.stage_number,
          'stage_date', n.stage_date,
          'stage_start_time_label', n.stage_start_time_label,
          'urgency', n.urgency,
          'stage_plan_id', n.stage_plan_id,
          'stage_plan_status', n.stage_plan_status
        )
        from next_missing n
      ),
      'null'::jsonb
    ),
    'missing_stages', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'stage_id', o.stage_id,
            'stage_number', o.stage_number,
            'stage_date', o.stage_date,
            'stage_start_time_label', o.stage_start_time_label,
            'urgency', o.urgency,
            'stage_plan_id', o.stage_plan_id,
            'stage_plan_status', o.stage_plan_status,
            'last_saved_at', o.last_saved_at,
            'last_saved_game_ts', o.last_saved_game_ts
          )
          order by o.urgency_order, o.stage_date, o.stage_number
        )
        from ordered o
      ),
      '[]'::jsonb
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.preview_competition_transition_v1(p_source_season integer, p_use_snapshot boolean DEFAULT false)
 RETURNS TABLE(club_id uuid, club_name text, country_code text, source_tier text, source_division text, source_position integer, source_total integer, international_points numeric, completed_race_count integer, race_reputation_value numeric, is_ai boolean, is_active boolean, movement_type text, playoff_pool text, playoff_pool_rank integer, playoff_winner boolean, target_tier text, target_division text, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with base as (
  select b.*,
         coalesce(c.club_type,'main') as club_type,
         lower(coalesce(c.max_promotion_tier,'')) as max_promotion_tier
  from public.preview_competition_transition_uncapped_v1(p_source_season,p_use_snapshot) b
  left join public.clubs c on c.id=b.club_id
), blocked as (
  select b.*
  from base b
  where b.club_type='developing'
    and b.max_promotion_tier='continental'
    and b.movement_type in ('direct_promotion','playoff_promotion')
    and b.target_tier in ('proteam','worldteam')
), direct_block_counts as (
  select source_tier,source_division,target_tier,count(*)::integer as needed
  from blocked
  where movement_type='direct_promotion'
  group by source_tier,source_division,target_tier
), direct_candidate_ranked as (
  select b.club_id,bc.target_tier,
         row_number() over(partition by bc.source_tier,bc.source_division,bc.target_tier order by b.source_position,b.international_points desc,b.completed_race_count desc,b.race_reputation_value desc,lower(b.club_name),b.club_id)::integer as rn,
         bc.needed
  from direct_block_counts bc
  join base b on b.source_tier=bc.source_tier and b.source_division=bc.source_division
  where b.club_type<>'developing'
    and b.movement_type not in ('direct_promotion','playoff_promotion','relegated')
), direct_replacements as (
  select club_id,target_tier,'direct_cap_reallocation'::text as replacement_kind
  from direct_candidate_ranked
  where rn<=needed
), playoff_block_counts as (
  select playoff_pool,target_tier,count(*)::integer as needed
  from blocked
  where movement_type='playoff_promotion' and playoff_pool is not null
  group by playoff_pool,target_tier
), playoff_candidate_ranked as (
  select b.club_id,bc.target_tier,
         row_number() over(partition by bc.playoff_pool,bc.target_tier order by b.playoff_pool_rank,b.international_points desc,b.completed_race_count desc,b.race_reputation_value desc,lower(b.club_name),b.club_id)::integer as rn,
         bc.needed
  from playoff_block_counts bc
  join base b on b.playoff_pool=bc.playoff_pool
  where b.club_type<>'developing'
    and b.movement_type='playoff_not_promoted'
    and not exists(select 1 from direct_replacements dr where dr.club_id=b.club_id)
), playoff_replacements as (
  select club_id,target_tier,'playoff_cap_reallocation'::text as replacement_kind
  from playoff_candidate_ranked
  where rn<=needed
), replacements as (
  select * from direct_replacements
  union all
  select * from playoff_replacements
)
select
  b.club_id,b.club_name,b.country_code,b.source_tier,b.source_division,b.source_position,b.source_total,
  b.international_points,b.completed_race_count,b.race_reputation_value,b.is_ai,b.is_active,
  case
    when bl.club_id is not null then 'promotion_blocked_by_developing_cap'
    when rp.club_id is not null then 'cap_reallocation_promotion'
    else b.movement_type
  end as movement_type,
  b.playoff_pool,b.playoff_pool_rank,
  case
    when bl.club_id is not null then false
    when rp.replacement_kind='playoff_cap_reallocation' then true
    else b.playoff_winner
  end as playoff_winner,
  case
    when bl.club_id is not null then b.source_tier
    when rp.club_id is not null then rp.target_tier
    else b.target_tier
  end as target_tier,
  case
    when bl.club_id is not null then b.source_division
    when rp.club_id is not null and rp.target_tier='worldteam' then 'WORLD'
    when rp.club_id is not null and rp.target_tier='proteam' then public.get_expected_tier2_division_for_country(b.country_code)
    when rp.club_id is not null and rp.target_tier='continental' then public.get_expected_tier3_division_for_country(b.country_code)
    else b.target_division
  end as target_division,
  case
    when bl.club_id is not null then 'Developing Team promotion blocked by Continental maximum tier'
    when rp.replacement_kind='direct_cap_reallocation' then 'Promotion reallocated because a Developing Team is capped at Continental'
    when rp.replacement_kind='playoff_cap_reallocation' then 'Playoff promotion reallocated because a Developing Team is capped at Continental'
    else b.reason
  end as reason
from base b
left join blocked bl on bl.club_id=b.club_id
left join replacements rp on rp.club_id=b.club_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_season_transition_preflight_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'transition_status',public.get_season_transition_status_v1(),
    'required_components',count(*) filter(where required),
    'ready_components',count(*) filter(where required and status='ready'),
    'blocking_components',count(*) filter(where required and status<>'ready'),
    'ready_for_arming',count(*) filter(where required and status<>'ready')=0,
    'components',jsonb_agg(
      jsonb_build_object(
        'key',component_key,
        'order',display_order,
        'required',required,
        'status',status,
        'details',details,
        'updated_at',updated_at
      ) order by display_order
    )
  )
  from public.season_transition_component_readiness_v1;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_team_disqualified_for_stage_v1(p_race_id uuid, p_team_id uuid, p_stage_number integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists(
    select 1
    from public.race_team_stage_disqualifications d
    where d.race_id=p_race_id
      and d.team_id=p_team_id
      and d.from_stage_number<=p_stage_number
      and d.reason_code <> 'mandatory_race_jersey_shortage'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_team_required_jerseys_v1(p_race_id uuid, p_team_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.race_participant_riders r
  where r.race_id=p_race_id and r.team_id=p_team_id;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_team_usable_jerseys_v1(p_team_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.club_race_supply_units u
  where u.club_id = public.universal_race_resource_owner_club_v1(p_team_id)
    and u.supply_key = 'race_jersey_complete'
    and u.status in ('ready', 'assigned')
    and u.stage_uses_remaining > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.create_race_team_jersey_disqualification_notification_v1(p_user_id uuid, p_race_id uuid, p_stage_id uuid, p_team_id uuid, p_required integer, p_available integer)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.create_race_team_jersey_shortage_penalty_notification_v1(
    p_user_id,p_race_id,p_stage_id,p_team_id,p_required,p_available
  );
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_enforce_mandatory_jerseys_precanonical_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.universal_race_stage_enforce_mandatory_jerseys_v1(p_stage_id);
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_resource_owner_club_v1(p_team_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when c.club_type = 'developing' and c.parent_club_id is not null
      then c.parent_club_id
    else c.id
  end
  from public.clubs c
  where c.id = p_team_id;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_planned_supplies_v1(p_stage_id uuid, p_team_id uuid)
 RETURNS TABLE(supply_key text, required_quantity integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with stage_plans as (
    select
      rsp.id as stage_plan_id,
      coalesce(rsp.rider_supplies_json, '{}'::jsonb) as rider_supplies_json
    from public.race_stage_plans rsp
    join public.race_preparations rp
      on rp.id = rsp.race_preparation_id
    where rsp.stage_id = p_stage_id
      and coalesce(rp.participating_club_id, rp.club_id) = p_team_id
      and rsp.last_saved_at is not null
      and lower(coalesce(rp.status, '')) in (
        'submitted', 'locked', 'sent_to_engine', 'final', 'finalized',
        'completed', 'auto_defaulted'
      )
  ),
  explicit_rows as (
    select
      s.supply_key,
      sum(greatest(coalesce(s.quantity_planned, 0), 0))::integer as required_quantity
    from stage_plans p
    join public.race_stage_plan_supplies s
      on s.race_stage_plan_id = p.stage_plan_id
    group by s.supply_key
  ),
  direct_rider_rows as (
    select
      generated.supply_key,
      generated.required_quantity
    from stage_plans p
    cross join lateral jsonb_each(p.rider_supplies_json) rider_entry
    cross join lateral (
      values
        (
          'bidons_water_bottles'::text,
          case
            when coalesce(
              rider_entry.value ->> 'bidons',
              rider_entry.value ->> 'bidons_water_bottles',
              '0'
            ) ~ '^[0-9]+$'
            then coalesce(
              rider_entry.value ->> 'bidons',
              rider_entry.value ->> 'bidons_water_bottles',
              '0'
            )::integer
            else 0
          end
        ),
        (
          'energy_gels'::text,
          case
            when coalesce(
              rider_entry.value ->> 'gels',
              rider_entry.value ->> 'energy_gels',
              '0'
            ) ~ '^[0-9]+$'
            then coalesce(
              rider_entry.value ->> 'gels',
              rider_entry.value ->> 'energy_gels',
              '0'
            )::integer
            else 0
          end
        ),
        (
          'nutrition_packs'::text,
          case
            when coalesce(rider_entry.value ->> 'nutrition_packs', '0') ~ '^[0-9]+$'
            then coalesce(rider_entry.value ->> 'nutrition_packs', '0')::integer
            else 0
          end
        ),
        (
          'race_jersey_complete'::text,
          case
            when lower(coalesce(rider_entry.value ->> 'race_jersey_complete', 'false'))
                 in ('true', '1', 'yes')
              then 1
            when coalesce(rider_entry.value ->> 'race_jersey_complete', '0') ~ '^[0-9]+$'
              then least(1, coalesce(rider_entry.value ->> 'race_jersey_complete', '0')::integer)
            else 0
          end
        ),
        (
          'rain_jackets'::text,
          case
            when lower(coalesce(
              rider_entry.value ->> 'rain_jacket',
              rider_entry.value ->> 'rain_jackets',
              'false'
            )) in ('true', '1', 'yes')
              then 1
            when coalesce(
              rider_entry.value ->> 'rain_jacket',
              rider_entry.value ->> 'rain_jackets',
              '0'
            ) ~ '^[0-9]+$'
              then least(1, coalesce(
                rider_entry.value ->> 'rain_jacket',
                rider_entry.value ->> 'rain_jackets',
                '0'
              )::integer)
            else 0
          end
        )
    ) generated(supply_key, required_quantity)
    where jsonb_typeof(rider_entry.value) = 'object'
      and generated.required_quantity > 0
  ),
  direct_totals as (
    select supply_key, sum(required_quantity)::integer as required_quantity
    from direct_rider_rows
    group by supply_key
  )
  select e.supply_key, e.required_quantity
  from explicit_rows e
  union all
  select d.supply_key, d.required_quantity
  from direct_totals d
  where not exists (
    select 1
    from explicit_rows e
    where e.supply_key = d.supply_key
  );
$function$
;

CREATE OR REPLACE FUNCTION public.preview_competition_transition_uncapped_v1(p_source_season integer, p_use_snapshot boolean DEFAULT false)
 RETURNS TABLE(club_id uuid, club_name text, country_code text, source_tier text, source_division text, source_position integer, source_total integer, international_points numeric, completed_race_count integer, race_reputation_value numeric, is_ai boolean, is_active boolean, movement_type text, playoff_pool text, playoff_pool_rank integer, playoff_winner boolean, target_tier text, target_division text, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with params as (
  select p_source_season as season_number, 1999 + p_source_season as season_year
), live_base as (
  select
    c.id as club_id,
    c.name as club_name,
    c.country_code,
    c.club_tier::text as source_tier,
    case
      when c.club_tier::text='worldteam' then 'WORLD'
      when c.club_tier::text='proteam' then c.tier2_division::text
      when c.club_tier::text='continental' then c.tier3_division::text
      when c.club_tier::text='amateur' then c.amateur_division::text
    end as source_division,
    coalesce(tb.international_points,0)::numeric as international_points,
    coalesce(tb.completed_race_count,0)::integer as completed_race_count,
    coalesce(tb.race_reputation_value,0)::numeric as race_reputation_value,
    coalesce(c.is_ai,false) as is_ai,
    coalesce(c.is_active,true) as is_active
  from public.clubs c
  join params p on true
  left join public.team_ranking_tiebreakers_by_season_v1 tb
    on tb.team_id=c.id and tb.season_year=p.season_year
  where c.deleted_at is null
    and c.club_tier::text in ('worldteam','proteam','continental','amateur')
), live_ranked as (
  select
    b.club_id,b.club_name,b.country_code,b.source_tier,b.source_division,
    row_number() over (
      partition by b.source_tier,b.source_division
      order by b.international_points desc,b.completed_race_count desc,b.race_reputation_value desc,lower(b.club_name),b.club_id
    )::integer as source_position,
    count(*) over (partition by b.source_tier,b.source_division)::integer as source_total,
    b.international_points,b.completed_race_count,b.race_reputation_value,b.is_ai,b.is_active
  from live_base b
), snapshot_base as (
  select
    s.club_id,s.club_name,s.country_code,s.club_tier as source_tier,s.division as source_division,
    s.final_position as source_position,
    count(*) over (partition by s.club_tier,s.division)::integer as source_total,
    coalesce(s.international_points,s.points::numeric,0)::numeric as international_points,
    coalesce(s.completed_race_count,0)::integer as completed_race_count,
    coalesce(s.race_reputation_value,0)::numeric as race_reputation_value,
    s.is_ai,s.is_active
  from public.team_ranking_season_snapshots s
  where s.season_number=p_source_season
), standings as (
  select
    s.club_id,s.club_name,s.country_code,s.source_tier,s.source_division,
    s.source_position,s.source_total,s.international_points,s.completed_race_count,
    s.race_reputation_value,s.is_ai,s.is_active
  from snapshot_base s where p_use_snapshot
  union all
  select
    l.club_id,l.club_name,l.country_code,l.source_tier,l.source_division,
    l.source_position,l.source_total,l.international_points,l.completed_race_count,
    l.race_reputation_value,l.is_ai,l.is_active
  from live_ranked l where not p_use_snapshot
), marked as (
  select
    s.*,
    case
      when s.source_tier='proteam' and s.source_position between 2 and 4 then 'WORLD_PLAYOFF'
      when s.source_tier='continental' and s.source_division in ('CONTINENTAL_EUROPE','CONTINENTAL_AMERICA') and s.source_position between 2 and 4 then 'PRO_WEST_PLAYOFF'
      when s.source_tier='continental' and s.source_division in ('CONTINENTAL_ASIA','CONTINENTAL_AFRICA','CONTINENTAL_OCEANIA') and s.source_position between 2 and 4 then 'PRO_EAST_PLAYOFF'
      when s.source_tier='amateur' and s.source_division in ('WESTERN_EUROPE','CENTRAL_EUROPE','SOUTHERN_BALKAN_EUROPE','NORTHERN_EASTERN_EUROPE') and s.source_position between 2 and 3 then 'CONTINENTAL_EUROPE_PLAYOFF'
      when s.source_tier='amateur' and s.source_division in ('NORTH_AMERICA','SOUTH_AMERICA') and s.source_position between 2 and 4 then 'CONTINENTAL_AMERICA_PLAYOFF'
      when s.source_tier='amateur' and s.source_division in ('WEST_NORTH_AFRICA','CENTRAL_SOUTH_AFRICA') and s.source_position between 2 and 4 then 'CONTINENTAL_AFRICA_PLAYOFF'
      when s.source_tier='amateur' and s.source_division in ('WEST_CENTRAL_ASIA','SOUTH_ASIA','EAST_SOUTHEAST_ASIA') and s.source_position between 2 and 4 then 'CONTINENTAL_ASIA_PLAYOFF'
      else null
    end as playoff_pool
  from standings s
), playoff_ranked as (
  select
    m.*,
    case when m.playoff_pool is null then null else
      row_number() over (
        partition by m.playoff_pool
        order by m.international_points desc,m.completed_race_count desc,m.race_reputation_value desc,lower(m.club_name),m.club_id
      )::integer
    end as playoff_pool_rank
  from marked m
), resolved as (
  select
    p.*,
    case
      when p.playoff_pool='WORLD_PLAYOFF' and p.playoff_pool_rank<=3 then true
      when p.playoff_pool='PRO_WEST_PLAYOFF' and p.playoff_pool_rank<=3 then true
      when p.playoff_pool='PRO_EAST_PLAYOFF' and p.playoff_pool_rank<=2 then true
      when p.playoff_pool='CONTINENTAL_EUROPE_PLAYOFF' and p.playoff_pool_rank<=2 then true
      when p.playoff_pool='CONTINENTAL_AMERICA_PLAYOFF' and p.playoff_pool_rank<=3 then true
      when p.playoff_pool='CONTINENTAL_AFRICA_PLAYOFF' and p.playoff_pool_rank<=3 then true
      when p.playoff_pool='CONTINENTAL_ASIA_PLAYOFF' and p.playoff_pool_rank<=3 then true
      else false
    end as playoff_winner
  from playoff_ranked p
)
select
  r.club_id,r.club_name,r.country_code,r.source_tier,r.source_division,
  r.source_position,r.source_total,r.international_points,r.completed_race_count,
  r.race_reputation_value,r.is_ai,r.is_active,
  case
    when r.source_tier='worldteam' and r.source_position > greatest(r.source_total-5,0) then 'relegated'
    when r.source_tier='proteam' and r.source_position=1 then 'direct_promotion'
    when r.source_tier='proteam' and r.playoff_winner then 'playoff_promotion'
    when r.source_tier='proteam' and r.source_position > greatest(r.source_total-5,0) then 'relegated'
    when r.source_tier='continental' and r.source_position=1 then 'direct_promotion'
    when r.source_tier='continental' and r.playoff_winner then 'playoff_promotion'
    when r.source_tier='continental' and (
      (r.source_division='CONTINENTAL_EUROPE' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AMERICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_ASIA' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AFRICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_OCEANIA' and r.source_position > greatest(r.source_total-3,0))
    ) then 'relegated'
    when r.source_tier='amateur' and r.source_division='OCEANIA' and r.source_position between 1 and 3 then 'direct_promotion'
    when r.source_tier='amateur' and r.source_division<>'OCEANIA' and r.source_position=1 then 'direct_promotion'
    when r.source_tier='amateur' and r.playoff_winner then 'playoff_promotion'
    when r.playoff_pool is not null then 'playoff_not_promoted'
    else 'stay'
  end as movement_type,
  r.playoff_pool,r.playoff_pool_rank,r.playoff_winner,
  case
    when r.source_tier='worldteam' and r.source_position > greatest(r.source_total-5,0) then 'proteam'
    when r.source_tier='proteam' and (r.source_position=1 or r.playoff_winner) then 'worldteam'
    when r.source_tier='proteam' and r.source_position > greatest(r.source_total-5,0) then 'continental'
    when r.source_tier='continental' and (r.source_position=1 or r.playoff_winner) then 'proteam'
    when r.source_tier='continental' and (
      (r.source_division='CONTINENTAL_EUROPE' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AMERICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_ASIA' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AFRICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_OCEANIA' and r.source_position > greatest(r.source_total-3,0))
    ) then 'amateur'
    when r.source_tier='amateur' and (
      (r.source_division='OCEANIA' and r.source_position between 1 and 3) or
      (r.source_division<>'OCEANIA' and r.source_position=1) or r.playoff_winner
    ) then 'continental'
    else r.source_tier
  end as target_tier,
  case
    when r.source_tier='worldteam' and r.source_position > greatest(r.source_total-5,0) then public.get_expected_tier2_division_for_country(r.country_code)
    when r.source_tier='proteam' and (r.source_position=1 or r.playoff_winner) then 'WORLD'
    when r.source_tier='proteam' and r.source_position > greatest(r.source_total-5,0) then public.get_expected_tier3_division_for_country(r.country_code)
    when r.source_tier='continental' and (r.source_position=1 or r.playoff_winner) then public.get_expected_tier2_division_for_country(r.country_code)
    when r.source_tier='continental' and (
      (r.source_division='CONTINENTAL_EUROPE' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AMERICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_ASIA' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AFRICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_OCEANIA' and r.source_position > greatest(r.source_total-3,0))
    ) then public.safe_get_amateur_division_for_country(r.country_code)
    when r.source_tier='amateur' and (
      (r.source_division='OCEANIA' and r.source_position between 1 and 3) or
      (r.source_division<>'OCEANIA' and r.source_position=1) or r.playoff_winner
    ) then public.get_expected_tier3_division_for_country(r.country_code)
    else r.source_division
  end as target_division,
  case
    when r.source_tier='worldteam' and r.source_position > greatest(r.source_total-5,0) then 'WorldTeam bottom 5'
    when r.source_tier='proteam' and r.source_position=1 then 'Pro division winner'
    when r.source_tier='proteam' and r.playoff_winner then 'World playoff winner'
    when r.source_tier='proteam' and r.source_position > greatest(r.source_total-5,0) then 'Pro division bottom 5'
    when r.source_tier='continental' and r.source_position=1 then 'Continental division winner'
    when r.source_tier='continental' and r.playoff_winner then 'Pro regional playoff winner'
    when r.source_tier='continental' and (
      (r.source_division='CONTINENTAL_EUROPE' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AMERICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_ASIA' and r.source_position > greatest(r.source_total-6,0)) or
      (r.source_division='CONTINENTAL_AFRICA' and r.source_position > greatest(r.source_total-5,0)) or
      (r.source_division='CONTINENTAL_OCEANIA' and r.source_position > greatest(r.source_total-3,0))
    ) then 'Continental division relegation cutoff'
    when r.source_tier='amateur' and r.source_division='OCEANIA' and r.source_position between 1 and 3 then 'Amateur Oceania top 3 direct'
    when r.source_tier='amateur' and r.source_division<>'OCEANIA' and r.source_position=1 then 'Amateur division winner'
    when r.source_tier='amateur' and r.playoff_winner then 'Amateur regional playoff winner'
    when r.playoff_pool is not null then 'Qualified for playoff but not in promotion slots'
    else 'No tier movement'
  end as reason
from resolved r;
$function$
;

CREATE OR REPLACE FUNCTION public.season_calendar_deterministic_uuid_v1(p_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-'||substr(h,13,4)||'-'||substr(h,17,4)||'-'||substr(h,21,12))::uuid
  from (select md5(p_key) h) x;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_root_rider_full_name_v1(p_payload jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(
    nullif(trim(p_payload->>'rider_full_name'), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          nullif(trim(p_payload->>'rider_first_name'), ''),
          nullif(trim(p_payload->>'rider_last_name'), '')
        )
      ),
      ''
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_guard_active_v1()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(current_setting('app.season_transition_active',true),'0')='1';
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_staff_advisory_notification_mutes_v1()
 RETURNS TABLE(report_code text, is_muted boolean, muted_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    m.report_code,
    m.is_muted,
    m.muted_at,
    m.updated_at
  from public.staff_advisory_notification_mutes m
  where m.user_id = auth.uid()
  order by m.report_code;
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff_advisory_notification_muted_v1(p_user_id uuid, p_report_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.staff_advisory_notification_mutes m
    where m.user_id = p_user_id
      and m.report_code = lower(btrim(coalesce(p_report_code, '')))
      and m.is_muted = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_notification_category_codes_v1(p_category_code text)
 RETURNS TABLE(report_code text)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select code from unnest(
    case p_category_code
      when 'trainingReadiness' then array['weekly_training_readiness','hc_high_fatigue_alert','hc_fatigue_watch','hc_rider_availability','hc_training_schedule_gap','hc_squad_readiness','hc_rider_skill_change']::text[]
      when 'raceProgrammePreparation' then array['weekly_race_programme','sd_race_programme_gap','sd_race_programme_continuity_gap','sd_race_preparation_missing','sd_race_preparation_ready']::text[]
      when 'startlistStagePlans' then array['sd_startlist_deadline_alert','sd_stage_plans_missing','sd_stage_plans_incomplete','sd_race_eligibility_critical']::text[]
      when 'medicalRecovery' then array['weekly_medical_treatment','daily_health_recovery','td_injury_treatment_plan','td_sickness_treatment_plan','td_recovery_setback','td_recovery_improvement','td_medical_clearance']::text[]
      when 'equipmentWorkshopSupplies' then array['weekly_equipment_workshop_review','weekly_equipment_review','mechanic_equipment_condition_priority','mechanic_workshop_readiness_restored','mechanic_race_supply_eligibility_critical']::text[]
      when 'scoutingRecruitment' then array['weekly_recruitment_review','scout_priority_prospect']::text[]
      else array[]::text[]
    end
  ) as code;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_staff_advisory_notification_categories_v1()
 RETURNS TABLE(category_code text, is_enabled boolean, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with categories(category_code) as (
    values
      ('trainingReadiness'::text),
      ('raceProgrammePreparation'),
      ('startlistStagePlans'),
      ('medicalRecovery'),
      ('equipmentWorkshopSupplies'),
      ('scoutingRecruitment')
  )
  select
    c.category_code,
    coalesce(p.is_enabled, true) as is_enabled,
    p.updated_at
  from categories c
  left join public.staff_advisory_notification_category_preferences p
    on p.user_id = auth.uid()
   and p.category_code = c.category_code
  order by c.category_code;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_pre_stage_standings_v1(p_stage_id uuid)
 RETURNS TABLE(classification_type text, rider_id uuid, team_id uuid, rank integer, gap_seconds integer, points integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with stage_context as (
  select s.race_id, s.stage_number
  from public.race_stages s
  where s.id = p_stage_id
),
previous_stage as (
  select s.id
  from stage_context ctx
  join public.race_stages s
    on s.race_id = ctx.race_id
   and s.stage_number < ctx.stage_number
  where exists (
    select 1
    from public.race_classification_standings standing
    where standing.race_id = ctx.race_id
      and standing.after_stage_id = s.id
      and standing.entity_type = 'rider'
      and standing.classification_type = 'general'
  )
  order by s.stage_number desc, s.id
  limit 1
)
select
  standing.classification_type,
  standing.rider_id,
  standing.team_id,
  standing.rank,
  standing.gap_seconds,
  standing.points
from stage_context ctx
join previous_stage previous on true
join public.race_classification_standings standing
  on standing.race_id = ctx.race_id
 and standing.after_stage_id = previous.id
where standing.entity_type = 'rider'
  and standing.rider_id is not null
  and standing.team_id is not null
  and standing.classification_type in ('general', 'points', 'mountain')
order by
  case standing.classification_type
    when 'general' then 1
    when 'points' then 2
    when 'mountain' then 3
    else 4
  end,
  standing.rank,
  standing.rider_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_career_history(p_rider_id uuid)
 RETURNS TABLE(season_number integer, season_year integer, team_id uuid, team_name text, points numeric, podiums integer, jerseys integer, is_current boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cs as (
    select public.get_current_season_number()::integer as season_number,
           public.team_ranking_get_current_season_year_v1()::integer as season_year
  ), contract_seasons as (
    select distinct gs::integer as season_number
    from public.rider_contracts rc
    cross join lateral generate_series(
      greatest(coalesce(rc.start_season_number,extract(year from rc.starts_on)::integer-1999),1),
      greatest(coalesce(rc.end_season_number,extract(year from rc.expires_on)::integer-1999),
               coalesce(rc.start_season_number,extract(year from rc.starts_on)::integer-1999),1)
    ) gs
    where rc.rider_id=p_rider_id
  ), result_seasons as (
    select distinct (v.season_year-1999)::integer as season_number
    from public.rider_season_overview_v1 v
    where v.rider_id=p_rider_id
  ), seasons as (
    select season_number from contract_seasons
    union select season_number from result_seasons
    union select season_number from cs
  ), base as (
    select s.season_number,(1999+s.season_number)::integer as season_year,
           (s.season_number=(select season_number from cs)) as is_current
    from seasons s
    where s.season_number>=1
      and s.season_number <= (select season_number from cs)
  )
  select b.season_number,b.season_year,
    coalesce(case when b.is_current then cur.club_id end,hist.club_id) as team_id,
    coalesce(case when b.is_current then cur.club_name end,hist.club_name,ip.latest_team_name_snapshot) as team_name,
    coalesce(ov.points,0)::numeric as points,
    coalesce(ov.podiums,0)::integer as podiums,
    coalesce(ov.jerseys,0)::integer as jerseys,
    b.is_current
  from base b
  left join public.rider_season_overview_v1 ov
    on ov.rider_id=p_rider_id and ov.season_year=b.season_year
  left join public.rider_international_points_by_season_v1 ip
    on ip.rider_id=p_rider_id and ip.season_year=b.season_year
  left join lateral (
    select cr.club_id,c.name as club_name
    from public.club_riders cr join public.clubs c on c.id=cr.club_id
    where cr.rider_id=p_rider_id and c.deleted_at is null
    order by cr.created_at desc nulls last limit 1
  ) cur on true
  left join lateral (
    select rc.club_id,c.name as club_name
    from public.rider_contracts rc join public.clubs c on c.id=rc.club_id
    where rc.rider_id=p_rider_id
      and coalesce(rc.start_season_number,extract(year from rc.starts_on)::integer-1999)<=b.season_number
      and coalesce(rc.end_season_number,extract(year from rc.expires_on)::integer-1999)>=b.season_number
    order by rc.starts_on desc nulls last,rc.created_at desc limit 1
  ) hist on true
  order by b.season_number desc;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_fingerprint_v1(p_source_season integer, p_target_season integer, p_transition_run_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'source_season', p_source_season,
    'target_season', p_target_season,

    'snapshot', (
      select jsonb_build_object(
        'rows', count(*),
        'fingerprint', md5(coalesce(string_agg(
          division::text || '|' || club_id::text || '|' ||
          coalesce(points,0)::text || '|' || final_position::text,
          E'\n' order by division::text, final_position, club_id::text
        ),''))
      )
      from public.team_ranking_season_snapshots
      where season_number = p_source_season
    ),

    'past_winners', (
      select jsonb_build_object(
        'rows', count(*),
        'fingerprint', md5(coalesce(string_agg(
          division::text || '|' || club_id::text || '|' || coalesce(points,0)::text,
          E'\n' order by division::text, club_id::text
        ),''))
      )
      from public.team_ranking_past_winners
      where season_number = p_source_season
    ),

    'competition_movements', (
      select jsonb_build_object(
        'rows', count(*),
        'fingerprint', md5(coalesce(string_agg(
          club_id::text || '|' || phase || '|' || movement_type || '|' ||
          coalesce(source_division,'') || '|' || coalesce(target_division,''),
          E'\n' order by club_id::text, phase, movement_type,
          coalesce(source_division,''),coalesce(target_division,'')
        ),''))
      )
      from public.competition_transition_movements_v1
      where transition_run_id = p_transition_run_id
    ),

    'rider_contract_actions', (
      select jsonb_build_object(
        'rows', count(*),
        'fingerprint', md5(coalesce(string_agg(
          rider_id::text || '|' || club_id::text || '|' || action,
          E'\n' order by rider_id::text, club_id::text, action
        ),''))
      )
      from public.rider_contract_transition_audit_v1
      where transition_run_id = p_transition_run_id
    ),

    'staff_contract_actions', (
      select jsonb_build_object(
        'rows', count(*),
        'fingerprint', md5(coalesce(string_agg(
          club_id::text || '|' || coalesce(staff_id::text,'') || '|' || action,
          E'\n' order by club_id::text, coalesce(staff_id::text,''), action
        ),''))
      )
      from public.staff_contract_transition_audit_v1
      where transition_run_id = p_transition_run_id
    ),

    'ai_roster_summary', (
      select jsonb_build_object(
        'actions', count(*),
        'by_action', coalesce(jsonb_object_agg(action,cnt),'{}'::jsonb)
      )
      from (
        select action, count(*) cnt
        from public.ai_roster_transition_audit_v1
        where transition_run_id = p_transition_run_id
        group by action
      ) s
    ),

    'sponsor_summary', (
      select jsonb_build_object(
        'actions', count(*),
        'fingerprint', md5(coalesce(string_agg(
          coalesce(club_id::text,'') || '|' || action,
          E'\n' order by coalesce(club_id::text,''), action
        ),''))
      )
      from public.sponsor_transition_audit_v1
      where transition_run_id = p_transition_run_id
    ),

    'reward_grants', (
      select jsonb_build_object(
        'rows', count(*),
        'fingerprint', md5(coalesce(string_agg(
          club_id::text || '|' || coalesce(division_name,'') || '|' ||
          coalesce(final_position,0)::text || '|' || coalesce(cash_total,0)::text || '|' ||
          coalesce(coin_total,0)::text,
          E'\n' order by club_id::text
        ),''))
      )
      from public.club_season_reward_grants
      where source_season = p_source_season
    ),

    'target_zero_state', public.verify_new_season_fresh_state_v1(
      p_source_season,p_target_season
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_legacy_run_id_v2(p_run_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nullif(r.metadata->>'legacy_transition_run_id','')::uuid
  from public.season_transition_engine_runs_v2 r
  where r.id=p_run_id
$function$
;

CREATE OR REPLACE FUNCTION public.get_season_rollover_status_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with gs as (
  select season_number, month_number, day_number, hour_number, minute_number, is_paused
  from public.game_state
  limit 1
), ctrl as (
  select timeline_id, is_armed, armed_source_season, armed_target_season, armed_at
  from public.season_transition_control_v1
  limit 1
), matching_run as (
  select r.*
  from public.season_transition_engine_runs_v2 r
  cross join ctrl c
  where r.mode = 'production'
    and c.is_armed = true
    and r.source_season = c.armed_source_season
    and r.target_season = c.armed_target_season
  order by r.created_at desc
  limit 1
), state as (
  select
    g.*,
    c.timeline_id,
    c.is_armed,
    c.armed_source_season,
    c.armed_target_season,
    c.armed_at,
    r.id as run_id,
    r.status as run_status,
    r.created_at as run_created_at,
    r.updated_at as run_updated_at,
    r.error_message,
    (
      c.is_armed = true
      and g.is_paused = true
      and g.season_number = c.armed_target_season
      and g.month_number = 1
      and g.day_number = 1
      and g.hour_number = 0
    ) as rollover_active
  from gs g
  cross join ctrl c
  left join matching_run r on true
)
select jsonb_build_object(
  'active', rollover_active,
  'phase', case when rollover_active then coalesce(run_status, 'starting') else null end,
  'source_season', case when is_armed then armed_source_season else null end,
  'target_season', case when is_armed then armed_target_season else null end,
  'run_id', case when rollover_active then run_id else null end,
  'game', jsonb_build_object(
    'season', season_number,
    'month', month_number,
    'day', day_number,
    'hour', hour_number,
    'minute', minute_number,
    'paused', is_paused
  ),
  'started_at', case when rollover_active then coalesce(run_created_at, armed_at) else null end,
  'updated_at', case when rollover_active then run_updated_at else null end,
  'delayed', case
    when rollover_active and (
      error_message is not null
      or coalesce(run_created_at, armed_at) <= now() - interval '10 minutes'
    ) then true
    else false
  end
)
from state;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_stale_contract_negotiations_v1(p_source_season integer)
 RETURNS TABLE(negotiation_id uuid, stale_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with open_negs as (
    select
      n.id,
      n.rider_id,
      n.club_id,
      n.current_contract_end_season,
      n.current_salary_weekly,
      (c.id is not null and c.deleted_at is null and coalesce(c.is_active,false)) as club_live,
      exists (
        select 1
        from public.club_riders cr
        join public.clubs roster_club on roster_club.id=cr.club_id
        where cr.rider_id=n.rider_id
          and roster_club.deleted_at is null
          and (
            cr.club_id=n.club_id
            or roster_club.parent_club_id=n.club_id
          )
      ) as in_club_family,
      rc.id as active_contract_id,
      coalesce(
        rc.end_season_number,
        case when rc.expires_on is not null then public.season_from_game_date(rc.expires_on) end
      ) as active_end_season,
      rc.salary_weekly as active_salary_weekly
    from public.rider_contract_negotiations n
    left join public.clubs c on c.id=n.club_id
    left join lateral (
      select rc.*
      from public.rider_contracts rc
      where rc.rider_id=n.rider_id
        and rc.club_id=n.club_id
        and rc.status='active'
      order by rc.created_at desc
      limit 1
    ) rc on true
    where n.status='open'
      and coalesce(n.opened_in_season,p_source_season) <= p_source_season
  )
  select
    o.id,
    case
      when not o.club_live then 'club_not_live'
      when not o.in_club_family then 'rider_not_in_club_family'
      when o.active_contract_id is null then 'active_contract_missing'
      when o.current_contract_end_season is distinct from o.active_end_season then 'contract_end_changed'
      when o.current_salary_weekly is distinct from o.active_salary_weekly then 'contract_salary_changed'
      else 'unknown'
    end
  from open_negs o
  where not o.club_live
     or not o.in_club_family
     or o.active_contract_id is null
     or o.current_contract_end_season is distinct from o.active_end_season
     or o.current_salary_weekly is distinct from o.active_salary_weekly;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_game_now_v1()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.get_current_game_timestamp();
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_add_game_months_v1(p_game_timestamp timestamp with time zone, p_months integer)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
  select (
    ((p_game_timestamp at time zone 'UTC') + make_interval(months => p_months))
    at time zone 'UTC'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_get_overview_v2(p_club_id uuid)
 RETURNS TABLE(role_type text, eligible_staff_count integer, advisor_staff_id uuid, advisor_staff_name text, advisor_country_code text, advisor_expertise integer, advisor_experience integer, advisor_potential integer, advisor_leadership integer, advisor_efficiency integer, advisor_loyalty integer, advisory_status text, advisory_expires_at timestamp with time zone, remaining_game_seconds bigint, advisor_notification_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with game_clock as (select public.staff_advisory_game_now_v1() game_now),
  base as (select * from public.staff_advisory_get_overview_v1(p_club_id)),
  access_rows as (
    select a.role_type,a.entitlement_state,a.expires_at,a.remaining_paid_seconds
    from public.staff_advisory_access a where a.user_id=auth.uid() and a.club_id=p_club_id
  )
  select b.role_type,b.eligible_staff_count,b.advisor_staff_id,b.advisor_staff_name,b.advisor_country_code,
         b.advisor_expertise,b.advisor_experience,b.advisor_potential,b.advisor_leadership,b.advisor_efficiency,b.advisor_loyalty,
         b.advisory_status,b.advisory_expires_at,
         case
           when a.entitlement_state='paused' then greatest(0,a.remaining_paid_seconds)
           when a.entitlement_state='active' and a.expires_at>g.game_now then greatest(0,ceil(extract(epoch from (a.expires_at-g.game_now)))::bigint)
           else 0::bigint
         end as remaining_game_seconds,
         b.advisor_notification_count
  from base b cross join game_clock g left join access_rows a on a.role_type=b.role_type;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_secondary_full_guaranteed_bounds_v2(p_club_tier text)
 RETURNS TABLE(min_amount bigint, max_amount bigint)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select
    case lower(coalesce(p_club_tier,''))
      when 'amateur' then 5000::bigint
      when 'continental' then 8000::bigint
      when 'proteam' then 20000::bigint
      when 'worldteam' then 50000::bigint
      else 0::bigint
    end,
    case lower(coalesce(p_club_tier,''))
      when 'amateur' then 12000::bigint
      when 'continental' then 20000::bigint
      when 'proteam' then 45000::bigint
      when 'worldteam' then 120000::bigint
      else 0::bigint
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_house_finance_effects(p_club_id uuid)
 RETURNS TABLE(finance_club_id uuid, club_house_level integer, monthly_maintenance_cash bigint, staff_payroll_discount_bps integer, rider_payroll_discount_bps integer, operating_cost_rebate_bps integer, tax_rebate_bps integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with resolved as (
    select case when c.club_type='developing' then c.parent_club_id else c.id end as finance_club_id
    from public.clubs c
    where c.id=p_club_id
    limit 1
  ), level_row as (
    select r.finance_club_id, coalesce(ci.hq_level,0)::integer as level
    from resolved r
    left join public.club_infrastructure ci on ci.club_id=r.finance_club_id
  )
  select
    lr.finance_club_id,
    lr.level,
    coalesce(cfg.monthly_maintenance_cash,0)::bigint,
    coalesce(cfg.staff_payroll_discount_bps,0)::integer,
    coalesce(cfg.rider_payroll_discount_bps,0)::integer,
    coalesce(cfg.operating_cost_rebate_bps,0)::integer,
    coalesce(cfg.tax_rebate_bps,0)::integer
  from level_row lr
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key='club_house' and cfg.target_level=lr.level;
$function$
;

CREATE OR REPLACE FUNCTION public.get_training_center_effects(p_club_id uuid)
 RETURNS TABLE(infrastructure_club_id uuid, training_center_level integer, monthly_maintenance_cash bigint, training_development_bonus_bps integer, coaching_effectiveness_bonus_bps integer, training_fatigue_reduction_points integer, training_risk_reduction_bps integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with resolved as (
    select
      case
        when c.club_type = 'developing' then coalesce(c.parent_club_id, c.id)
        else c.id
      end as infrastructure_club_id
    from public.clubs c
    where c.id = p_club_id
    limit 1
  ), level_row as (
    select
      r.infrastructure_club_id,
      coalesce(ci.training_center_level, 0)::integer as level
    from resolved r
    left join public.club_infrastructure ci
      on ci.club_id = r.infrastructure_club_id
  )
  select
    lr.infrastructure_club_id,
    lr.level,
    coalesce(cfg.monthly_maintenance_cash, 0)::bigint,
    coalesce(cfg.training_development_bonus_bps, 0)::integer,
    coalesce(cfg.coaching_effectiveness_bonus_bps, 0)::integer,
    coalesce(cfg.training_fatigue_reduction_points, 0)::integer,
    coalesce(cfg.training_risk_reduction_bps, 0)::integer
  from level_row lr
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key = 'training_center'
   and cfg.target_level = lr.level;
$function$
;

CREATE OR REPLACE FUNCTION public.training_center_training_risk_multiplier_v1(p_club_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select greatest(
    0.0,
    least(
      1.0,
      1.0 - (coalesce(e.training_risk_reduction_bps, 0)::numeric / 10000.0)
    )
  )
  from public.get_training_center_effects(p_club_id) e;
$function$
;

CREATE OR REPLACE FUNCTION public.travel_country_distance_km_v2(p_origin_country_code text, p_destination_country_code text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with origin as (
    select g.country_code, g.latitude::double precision as lat, g.longitude::double precision as lon
    from public.travel_country_geography_v1 g
    where g.country_code = upper(btrim(coalesce(p_origin_country_code, '')))
  ),
  destination as (
    select g.country_code, g.latitude::double precision as lat, g.longitude::double precision as lon
    from public.travel_country_geography_v1 g
    where g.country_code = upper(btrim(coalesce(p_destination_country_code, '')))
  ),
  calc as (
    select
      o.country_code as origin_code,
      d.country_code as destination_code,
      sin(radians(d.lat - o.lat) / 2.0) * sin(radians(d.lat - o.lat) / 2.0)
      + cos(radians(o.lat)) * cos(radians(d.lat))
        * sin(radians(d.lon - o.lon) / 2.0) * sin(radians(d.lon - o.lon) / 2.0) as a
    from origin o
    cross join destination d
  )
  select
    case
      when origin_code = destination_code then 0::numeric
      else round(
        (
          6371.0
          * 2.0
          * asin(sqrt(least(1.0, greatest(0.0, a))))
        )::numeric,
        0
      )
    end
  from calc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_travel_fatigue_impacts_for_date_v1(p_travel_date date)
 RETURNS TABLE(rider_id uuid, travel_fatigue_delta integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with due_riders as (
    select
      rpr.rider_id,
      rp.club_id,
      nullif(coalesce(to_jsonb(r)->>'country_code', to_jsonb(r)->>'host_country_code'), '') as destination_country_code
    from public.race_preparations rp
    join public.races r on r.id = rp.race_id
    join public.race_preparation_riders rpr on rpr.race_preparation_id = rp.id
    where rp.status in ('submitted', 'locked', 'auto_defaulted', 'sent_to_engine')
      and r.start_date = p_travel_date + 1
      and coalesce(r.status, '') not in ('cancelled', 'weather_cancelled')
  ), impacts as (
    select
      d.rider_id,
      p.net_travel_fatigue
    from due_riders d
    cross join lateral public.get_team_travel_fatigue_profile_v1(
      d.club_id,
      d.destination_country_code
    ) p
  )
  select
    i.rider_id,
    coalesce(max(i.net_travel_fatigue), 0)::integer as travel_fatigue_delta
  from impacts i
  group by i.rider_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_medical_center_effects(p_club_id uuid)
 RETURNS TABLE(infrastructure_club_id uuid, medical_center_level integer, monthly_maintenance_cash bigint, medical_risk_reduction_bps integer, medical_recovery_duration_reduction_bps integer, medical_fatigue_floor_reduction_points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with resolved as (
    select coalesce(c.parent_club_id, c.id, p_club_id) as infrastructure_club_id
    from public.clubs c
    where c.id = p_club_id
    union all
    select p_club_id
    where not exists (select 1 from public.clubs c where c.id = p_club_id)
    limit 1
  ),
  infra as (
    select
      r.infrastructure_club_id,
      coalesce(ci.medical_center_level, 0)::integer as medical_center_level
    from resolved r
    left join public.club_infrastructure ci
      on ci.club_id = r.infrastructure_club_id
  )
  select
    i.infrastructure_club_id,
    i.medical_center_level,
    coalesce(cfg.monthly_maintenance_cash, 0)::bigint,
    coalesce(cfg.medical_risk_reduction_bps, 0)::integer,
    coalesce(cfg.medical_recovery_duration_reduction_bps, 0)::integer,
    coalesce(cfg.medical_fatigue_floor_reduction_points, 0)::integer
  from infra i
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key = 'medical_center'
   and cfg.target_level = i.medical_center_level;
$function$
;

CREATE OR REPLACE FUNCTION public.health_get_medical_center_risk_reduction_pct_v1(p_medical_center_level integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_medical_center_level is null then 0::numeric
    when p_medical_center_level >= 5 then 15::numeric
    when p_medical_center_level = 4 then 12::numeric
    when p_medical_center_level = 3 then 9::numeric
    when p_medical_center_level = 2 then 6::numeric
    when p_medical_center_level = 1 then 3::numeric
    else 0::numeric
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.health_get_medical_center_risk_multiplier_v1(p_club_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select round(
    1 - (
      public.health_get_medical_center_risk_reduction_pct_v1(
        public.health_get_medical_center_level_v1(p_club_id)
      ) / 100.0
    ),
    4
  );
$function$
;

CREATE OR REPLACE FUNCTION public.health_get_medical_center_fatigue_floor_reduction_v1(p_medical_center_level integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_medical_center_level is null then 0
    when p_medical_center_level >= 5 then 5
    when p_medical_center_level = 4 then 4
    when p_medical_center_level = 3 then 3
    when p_medical_center_level = 2 then 2
    when p_medical_center_level = 1 then 1
    else 0
  end::integer;
$function$
;

CREATE OR REPLACE FUNCTION public.get_youth_academy_effects(p_club_id uuid)
 RETURNS TABLE(infrastructure_club_id uuid, is_developing_team boolean, youth_academy_level integer, monthly_maintenance_cash bigint, youth_regular_training_development_bonus_bps integer, youth_race_development_bonus_bps integer, youth_head_coach_development_effectiveness_bonus_bps integer, youth_off_focus_decay_reduction_bps integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with resolved as (
    select
      coalesce(c.parent_club_id, c.id, p_club_id) as infrastructure_club_id,
      (coalesce(c.club_type, 'main') = 'developing') as is_developing_team
    from public.clubs c
    where c.id = p_club_id

    union all

    select p_club_id, false
    where not exists (
      select 1 from public.clubs c where c.id = p_club_id
    )
    limit 1
  ),
  infra as (
    select
      r.infrastructure_club_id,
      r.is_developing_team,
      coalesce(ci.youth_academy_level, 0)::integer as youth_academy_level
    from resolved r
    left join public.club_infrastructure ci
      on ci.club_id = r.infrastructure_club_id
  )
  select
    i.infrastructure_club_id,
    i.is_developing_team,
    i.youth_academy_level,
    coalesce(cfg.monthly_maintenance_cash, 0)::bigint,
    coalesce(cfg.youth_regular_training_development_bonus_bps, 0)::integer,
    coalesce(cfg.youth_race_development_bonus_bps, 0)::integer,
    coalesce(cfg.youth_head_coach_development_effectiveness_bonus_bps, 0)::integer,
    coalesce(cfg.youth_off_focus_decay_reduction_bps, 0)::integer
  from infra i
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key = 'youth_academy'
   and cfg.target_level = i.youth_academy_level;
$function$
;

CREATE OR REPLACE FUNCTION public.youth_academy_u23_head_coach_development_multiplier_v1(p_club_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(e.is_developing_team, false) is not true then 1.0000::numeric
    else round(1 + coalesce(e.youth_head_coach_development_effectiveness_bonus_bps, 0)::numeric / 10000.0, 4)
  end
  from public.get_youth_academy_effects(p_club_id) e
  limit 1;
$function$
;

