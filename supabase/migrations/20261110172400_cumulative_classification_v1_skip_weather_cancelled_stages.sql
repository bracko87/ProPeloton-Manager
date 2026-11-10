-- Only stages actually raced count toward cumulative rider/team eligibility.
-- Weather-cancelled stages have no results and must not disqualify riders.
-- This repairs the legacy classification writer used by some postprocessors.
CREATE OR REPLACE FUNCTION public.race_engine_write_cumulative_classifications_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_number integer;
  v_previous_stage_id uuid;
  v_stage_count integer;

  v_general_rows integer := 0;
  v_points_rows integer := 0;
  v_mountain_rows integer := 0;
  v_young_rows integer := 0;
  v_team_rows integer := 0;
begin
  select
    simulation_run.race_id,
    simulation_run.stage_id,
    stage.stage_number
  into
    v_race_id,
    v_stage_id,
    v_stage_number
  from public.race_stage_simulation_runs simulation_run
  join public.race_stages stage
    on stage.id = simulation_run.stage_id
  where simulation_run.id = p_simulation_run_id
    and simulation_run.status = 'completed';

  if v_race_id is null or v_stage_id is null then
    raise exception
      'Completed simulation run % was not found.',
      p_simulation_run_id;
  end if;

  select stage.id
  into v_previous_stage_id
  from public.race_stages stage
  where stage.race_id = v_race_id
    and stage.stage_number < v_stage_number
    and not coalesce(stage.weather_cancelled,false)
  order by stage.stage_number desc
  limit 1;

  select count(*)::integer
  into v_stage_count
  from public.race_stages stage
  where stage.race_id = v_race_id
    and stage.stage_number <= v_stage_number
      and not coalesce(stage.weather_cancelled,false);

  /*
   * Rebuild every classification snapshot after this stage.
   */
  delete from public.race_classification_standings
  where race_id = v_race_id
    and after_stage_id = v_stage_id
    and classification_type in (
      'general',
      'points',
      'mountain',
      'young',
      'team'
    );

  /*
   * GENERAL CLASSIFICATION
   *
   * Sum adjusted elapsed time from every completed stage up to and
   * including the current stage.
   */
  with stage_scope as (
    select
      stage.id,
      stage.stage_number
    from public.race_stages stage
    where stage.race_id = v_race_id
      and stage.stage_number <= v_stage_number
      and not coalesce(stage.weather_cancelled,false)
  ),
  rider_totals as (
    select
      stage_result.rider_id,

      (
        array_agg(
          stage_result.team_id
          order by stage_scope.stage_number desc
        )
      )[1] as team_id,

      (
        array_agg(
          stage_result.rider_name_snapshot
          order by stage_scope.stage_number desc
        )
      )[1] as rider_name_snapshot,

      (
        array_agg(
          stage_result.team_name_snapshot
          order by stage_scope.stage_number desc
        )
      )[1] as team_name_snapshot,

      sum(
        greatest(
          coalesce(stage_result.elapsed_seconds, 0)
          - coalesce(stage_result.bonus_seconds, 0)
          + coalesce(stage_result.penalty_seconds, 0),
          0
        )
      )::bigint as total_time_seconds,

      sum(coalesce(stage_result.rank, 9999))::bigint
        as stage_rank_tiebreak,

      count(distinct stage_result.stage_id)::integer
        as completed_stage_count

    from public.race_stage_results stage_result
    join stage_scope
      on stage_scope.id = stage_result.stage_id

    where stage_result.race_id = v_race_id
      and lower(coalesce(stage_result.status, 'finished')) =
        'finished'

    group by stage_result.rider_id

    having count(distinct stage_result.stage_id) =
      v_stage_count
  ),
  ranked as (
    select
      rider_total.*,

      row_number() over (
        order by
          rider_total.total_time_seconds,
          rider_total.stage_rank_tiebreak,
          rider_total.rider_id
      )::integer as classification_rank,

      min(rider_total.total_time_seconds) over ()
        as best_total_time

    from rider_totals rider_total
  )
  insert into public.race_classification_standings (
    race_id,
    after_stage_id,
    classification_type,
    entity_type,
    rider_id,
    team_id,
    rank,
    previous_rank,
    total_time_seconds,
    gap_seconds,
    points,
    display_name_snapshot,
    team_name_snapshot
  )
  select
    v_race_id,
    v_stage_id,
    'general',
    'rider',
    ranked.rider_id,
    ranked.team_id,
    ranked.classification_rank,
    previous_standing.rank,
    ranked.total_time_seconds,
    ranked.total_time_seconds - ranked.best_total_time,
    null,

    coalesce(
      nullif(
        trim(
          concat_ws(
            ' ',
            nullif(rider.first_name, ''),
            nullif(rider.last_name, '')
          )
        ),
        ''
      ),
      nullif(rider.display_name, ''),
      ranked.rider_name_snapshot,
      'Rider'
    ),

    ranked.team_name_snapshot

  from ranked

  left join public.riders rider
    on rider.id = ranked.rider_id

  left join public.race_classification_standings previous_standing
    on previous_standing.race_id = v_race_id
   and previous_standing.after_stage_id =
      v_previous_stage_id
   and previous_standing.classification_type = 'general'
   and previous_standing.entity_type = 'rider'
   and previous_standing.rider_id = ranked.rider_id

  order by ranked.classification_rank;

  get diagnostics v_general_rows = row_count;

  /*
   * POINTS CLASSIFICATION
   *
   * Stage-point synchronization already places canonical finish and
   * sprint values into race_stage_results.
   */
  with stage_scope as (
    select stage.id, stage.stage_number
    from public.race_stages stage
    where stage.race_id = v_race_id
      and stage.stage_number <= v_stage_number
      and not coalesce(stage.weather_cancelled,false)
  ),
  rider_totals as (
    select
      stage_result.rider_id,

      (
        array_agg(
          stage_result.team_id
          order by stage_scope.stage_number desc
        )
      )[1] as team_id,

      (
        array_agg(
          stage_result.rider_name_snapshot
          order by stage_scope.stage_number desc
        )
      )[1] as rider_name_snapshot,

      (
        array_agg(
          stage_result.team_name_snapshot
          order by stage_scope.stage_number desc
        )
      )[1] as team_name_snapshot,

      sum(
        coalesce(stage_result.finish_points, 0)
        + coalesce(stage_result.sprint_points, 0)
      )::integer as total_points,

      count(distinct stage_result.stage_id)::integer
        as completed_stage_count

    from public.race_stage_results stage_result
    join stage_scope
      on stage_scope.id = stage_result.stage_id

    where stage_result.race_id = v_race_id
      and lower(coalesce(stage_result.status, 'finished')) =
        'finished'

    group by stage_result.rider_id

    having count(distinct stage_result.stage_id) =
      v_stage_count
  ),
  ranked as (
    select
      rider_total.*,

      row_number() over (
        order by
          rider_total.total_points desc,
          rider_total.rider_id
      )::integer as classification_rank

    from rider_totals rider_total
    where rider_total.total_points > 0
  )
  insert into public.race_classification_standings (
    race_id,
    after_stage_id,
    classification_type,
    entity_type,
    rider_id,
    team_id,
    rank,
    previous_rank,
    total_time_seconds,
    gap_seconds,
    points,
    display_name_snapshot,
    team_name_snapshot
  )
  select
    v_race_id,
    v_stage_id,
    'points',
    'rider',
    ranked.rider_id,
    ranked.team_id,
    ranked.classification_rank,
    previous_standing.rank,
    null,
    null,
    ranked.total_points,

    coalesce(
      nullif(
        trim(
          concat_ws(
            ' ',
            nullif(rider.first_name, ''),
            nullif(rider.last_name, '')
          )
        ),
        ''
      ),
      nullif(rider.display_name, ''),
      ranked.rider_name_snapshot,
      'Rider'
    ),

    ranked.team_name_snapshot

  from ranked

  left join public.riders rider
    on rider.id = ranked.rider_id

  left join public.race_classification_standings previous_standing
    on previous_standing.race_id = v_race_id
   and previous_standing.after_stage_id =
      v_previous_stage_id
   and previous_standing.classification_type = 'points'
   and previous_standing.entity_type = 'rider'
   and previous_standing.rider_id = ranked.rider_id

  order by ranked.classification_rank;

  get diagnostics v_points_rows = row_count;

  /*
   * MOUNTAIN CLASSIFICATION
   *
   * Sum only the real KOM points synchronized from
   * race_stage_point_results.
   */
  with stage_scope as (
    select stage.id, stage.stage_number
    from public.race_stages stage
    where stage.race_id = v_race_id
      and stage.stage_number <= v_stage_number
      and not coalesce(stage.weather_cancelled,false)
  ),
  rider_totals as (
    select
      stage_result.rider_id,

      (
        array_agg(
          stage_result.team_id
          order by stage_scope.stage_number desc
        )
      )[1] as team_id,

      (
        array_agg(
          stage_result.rider_name_snapshot
          order by stage_scope.stage_number desc
        )
      )[1] as rider_name_snapshot,

      (
        array_agg(
          stage_result.team_name_snapshot
          order by stage_scope.stage_number desc
        )
      )[1] as team_name_snapshot,

      sum(
        coalesce(stage_result.mountain_points, 0)
      )::integer as total_points,

      count(distinct stage_result.stage_id)::integer
        as completed_stage_count

    from public.race_stage_results stage_result
    join stage_scope
      on stage_scope.id = stage_result.stage_id

    where stage_result.race_id = v_race_id
      and lower(coalesce(stage_result.status, 'finished')) =
        'finished'

    group by stage_result.rider_id

    having count(distinct stage_result.stage_id) =
      v_stage_count
  ),
  ranked as (
    select
      rider_total.*,

      row_number() over (
        order by
          rider_total.total_points desc,
          rider_total.rider_id
      )::integer as classification_rank

    from rider_totals rider_total
    where rider_total.total_points > 0
  )
  insert into public.race_classification_standings (
    race_id,
    after_stage_id,
    classification_type,
    entity_type,
    rider_id,
    team_id,
    rank,
    previous_rank,
    total_time_seconds,
    gap_seconds,
    points,
    display_name_snapshot,
    team_name_snapshot
  )
  select
    v_race_id,
    v_stage_id,
    'mountain',
    'rider',
    ranked.rider_id,
    ranked.team_id,
    ranked.classification_rank,
    previous_standing.rank,
    null,
    null,
    ranked.total_points,

    coalesce(
      nullif(
        trim(
          concat_ws(
            ' ',
            nullif(rider.first_name, ''),
            nullif(rider.last_name, '')
          )
        ),
        ''
      ),
      nullif(rider.display_name, ''),
      ranked.rider_name_snapshot,
      'Rider'
    ),

    ranked.team_name_snapshot

  from ranked

  left join public.riders rider
    on rider.id = ranked.rider_id

  left join public.race_classification_standings previous_standing
    on previous_standing.race_id = v_race_id
   and previous_standing.after_stage_id =
      v_previous_stage_id
   and previous_standing.classification_type = 'mountain'
   and previous_standing.entity_type = 'rider'
   and previous_standing.rider_id = ranked.rider_id

  order by ranked.classification_rank;

  get diagnostics v_mountain_rows = row_count;

  /*
   * YOUNG RIDER CLASSIFICATION
   *
   * Rank eligible young riders using the already-generated
   * cumulative general classification.
   */
  with young_general as (
    select
      general_standing.*,

      min(general_standing.total_time_seconds) over ()
        as best_young_time

    from public.race_classification_standings general_standing

    join public.race_participant_riders participant
      on participant.race_id = general_standing.race_id
     and participant.rider_id = general_standing.rider_id
     and participant.is_young_rider = true

    where general_standing.race_id = v_race_id
      and general_standing.after_stage_id = v_stage_id
      and general_standing.classification_type = 'general'
      and general_standing.entity_type = 'rider'
  ),
  ranked as (
    select
      young_general.*,

      row_number() over (
        order by
          young_general.total_time_seconds,
          young_general.rank,
          young_general.rider_id
      )::integer as young_rank

    from young_general
  )
  insert into public.race_classification_standings (
    race_id,
    after_stage_id,
    classification_type,
    entity_type,
    rider_id,
    team_id,
    rank,
    previous_rank,
    total_time_seconds,
    gap_seconds,
    points,
    display_name_snapshot,
    team_name_snapshot
  )
  select
    v_race_id,
    v_stage_id,
    'young',
    'rider',
    ranked.rider_id,
    ranked.team_id,
    ranked.young_rank,
    previous_standing.rank,
    ranked.total_time_seconds,
    ranked.total_time_seconds - ranked.best_young_time,
    null,
    ranked.display_name_snapshot,
    ranked.team_name_snapshot

  from ranked

  left join public.race_classification_standings previous_standing
    on previous_standing.race_id = v_race_id
   and previous_standing.after_stage_id =
      v_previous_stage_id
   and previous_standing.classification_type = 'young'
   and previous_standing.entity_type = 'rider'
   and previous_standing.rider_id = ranked.rider_id

  order by ranked.young_rank;

  get diagnostics v_young_rows = row_count;

  /*
   * TEAM CLASSIFICATION
   *
   * For every included stage, take each team's best three adjusted
   * rider times. Then sum those stage team times cumulatively.
   */
  with stage_scope as (
    select stage.id, stage.stage_number
    from public.race_stages stage
    where stage.race_id = v_race_id
      and stage.stage_number <= v_stage_number
      and not coalesce(stage.weather_cancelled,false)
  ),
  stage_rider_times as (
    select
      stage_result.stage_id,
      stage_scope.stage_number,
      stage_result.team_id,
      stage_result.team_name_snapshot,

      greatest(
        coalesce(stage_result.elapsed_seconds, 0)
        - coalesce(stage_result.bonus_seconds, 0)
        + coalesce(stage_result.penalty_seconds, 0),
        0
      )::bigint as adjusted_time,

      row_number() over (
        partition by
          stage_result.stage_id,
          stage_result.team_id
        order by
          greatest(
            coalesce(stage_result.elapsed_seconds, 0)
            - coalesce(stage_result.bonus_seconds, 0)
            + coalesce(stage_result.penalty_seconds, 0),
            0
          ),
          stage_result.rank,
          stage_result.rider_id
      ) as team_rider_rank

    from public.race_stage_results stage_result
    join stage_scope
      on stage_scope.id = stage_result.stage_id

    where stage_result.race_id = v_race_id
      and stage_result.team_id is not null
      and lower(coalesce(stage_result.status, 'finished')) =
        'finished'
  ),
  stage_team_times as (
    select
      stage_id,
      stage_number,
      team_id,

      (
        array_agg(
          team_name_snapshot
          order by team_rider_rank
        )
      )[1] as team_name_snapshot,

      sum(adjusted_time)::bigint as stage_team_time

    from stage_rider_times
    where team_rider_rank <= 3

    group by
      stage_id,
      stage_number,
      team_id

    having count(*) = 3
  ),
  cumulative_team_times as (
    select
      team_id,

      (
        array_agg(
          team_name_snapshot
          order by stage_number desc
        )
      )[1] as team_name_snapshot,

      sum(stage_team_time)::bigint as total_time_seconds,

      count(distinct stage_id)::integer
        as completed_stage_count

    from stage_team_times

    group by team_id

    having count(distinct stage_id) =
      v_stage_count
  ),
  ranked as (
    select
      team_total.*,

      row_number() over (
        order by
          team_total.total_time_seconds,
          team_total.team_id
      )::integer as team_rank,

      min(team_total.total_time_seconds) over ()
        as best_team_time

    from cumulative_team_times team_total
  )
  insert into public.race_classification_standings (
    race_id,
    after_stage_id,
    classification_type,
    entity_type,
    rider_id,
    team_id,
    rank,
    previous_rank,
    total_time_seconds,
    gap_seconds,
    points,
    display_name_snapshot,
    team_name_snapshot
  )
  select
    v_race_id,
    v_stage_id,
    'team',
    'team',
    null,
    ranked.team_id,
    ranked.team_rank,
    previous_standing.rank,
    ranked.total_time_seconds,
    ranked.total_time_seconds - ranked.best_team_time,
    null,
    ranked.team_name_snapshot,
    ranked.team_name_snapshot

  from ranked

  left join public.race_classification_standings previous_standing
    on previous_standing.race_id = v_race_id
   and previous_standing.after_stage_id =
      v_previous_stage_id
   and previous_standing.classification_type = 'team'
   and previous_standing.entity_type = 'team'
   and previous_standing.team_id = ranked.team_id

  order by ranked.team_rank;

  get diagnostics v_team_rows = row_count;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'race_id', v_race_id,
    'stage_id', v_stage_id,
    'stage_number', v_stage_number,
    'included_stage_count', v_stage_count,
    'general_rows', v_general_rows,
    'points_rows', v_points_rows,
    'mountain_rows', v_mountain_rows,
    'young_rows', v_young_rows,
    'team_rows', v_team_rows
  );
end;
$function$

