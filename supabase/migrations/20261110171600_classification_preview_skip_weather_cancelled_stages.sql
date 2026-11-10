-- Exclude weather-cancelled stages from cumulative GC, points, young and team eligibility.
-- Non-cancelled stages still require real results; no cancelled result is invented.
CREATE OR REPLACE FUNCTION public.race_engine_preview_cumulative_classifications_v2(p_race_id uuid, p_through_stage_number integer DEFAULT NULL::integer)
 RETURNS TABLE(classification_type text, entity_type text, rider_id uuid, team_id uuid, classification_rank integer, total_time_seconds bigint, gap_seconds bigint, points integer, display_name_snapshot text, team_name_snapshot text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$

with resolved_stage as (
  select
    coalesce(
      p_through_stage_number,
      (
        select max(stage.stage_number)
        from public.race_stages stage
        where stage.race_id = p_race_id
          and exists (
            select 1
            from public.race_stage_results stage_result
            where stage_result.stage_id = stage.id
              and stage_result.race_id = p_race_id
          )
      )
    )::integer as through_stage_number
),

stage_scope as (
  select
    stage.id as stage_id,
    stage.stage_number
  from public.race_stages stage
  cross join resolved_stage
  where stage.race_id = p_race_id
    and stage.stage_number
      <= resolved_stage.through_stage_number
    and not coalesce(stage.weather_cancelled,false)
),

stage_count as (
  select count(*)::integer as included_stage_count
  from stage_scope
),

canonical_stage_bonuses as (
  select
    point_result.stage_id,
    point_result.rider_id,

    sum(
      coalesce(
        point_result.bonus_seconds_awarded,
        0
      )
    )::bigint as bonus_seconds

  from public.race_stage_point_results point_result

  join stage_scope
    on stage_scope.stage_id = point_result.stage_id

  where point_result.race_id = p_race_id

  group by
    point_result.stage_id,
    point_result.rider_id
),

canonical_point_totals as (
  select *
  from public.race_engine_get_canonical_rider_point_totals_v2(
    p_race_id,
    (
      select through_stage_number
      from resolved_stage
    )
  )
),

eligible_riders as (
  select
    stage_result.rider_id,

    (
      array_agg(
        stage_result.team_id
        order by
          stage_scope.stage_number desc,
          stage_result.rank nulls last,
          stage_result.rider_id
      )
    )[1] as team_id,

    (
      array_agg(
        stage_result.rider_name_snapshot
        order by
          stage_scope.stage_number desc,
          stage_result.rank nulls last,
          stage_result.rider_id
      )
    )[1] as rider_name_snapshot,

    (
      array_agg(
        stage_result.team_name_snapshot
        order by
          stage_scope.stage_number desc,
          stage_result.rank nulls last,
          stage_result.rider_id
      )
    )[1] as team_name_snapshot,

    sum(
      greatest(
        coalesce(stage_result.elapsed_seconds, 0)
        + coalesce(stage_result.penalty_seconds, 0),
        0
      )
    )::bigint as raw_total_time_seconds,

    sum(
      coalesce(stage_result.rank, 9999)
    )::bigint as stage_rank_tiebreak,

    count(
      distinct stage_result.stage_id
    )::integer as completed_stage_count

  from public.race_stage_results stage_result

  join stage_scope
    on stage_scope.stage_id = stage_result.stage_id

  where stage_result.race_id = p_race_id
    and lower(
      coalesce(
        stage_result.status,
        'finished'
      )
    ) = 'finished'

  group by stage_result.rider_id

  having count(
    distinct stage_result.stage_id
  ) = (
    select included_stage_count
    from stage_count
  )
),

general_totals as (
  select
    eligible.rider_id,
    eligible.team_id,
    eligible.rider_name_snapshot,
    eligible.team_name_snapshot,
    eligible.stage_rank_tiebreak,

    greatest(
      eligible.raw_total_time_seconds
      - coalesce(
          canonical_points.bonus_seconds,
          0
        ),
      0
    )::bigint as total_time_seconds

  from eligible_riders eligible

  left join canonical_point_totals canonical_points
    on canonical_points.rider_id = eligible.rider_id
),

general_ranked as (
  select
    general_total.*,

    row_number() over (
      order by
        general_total.total_time_seconds,
        general_total.stage_rank_tiebreak,
        general_total.rider_id
    )::integer as classification_rank,

    min(
      general_total.total_time_seconds
    ) over () as best_total_time

  from general_totals general_total
),

points_totals as (
  select
    eligible.rider_id,
    eligible.team_id,
    eligible.rider_name_snapshot,
    eligible.team_name_snapshot,

    canonical_points.points_classification_points
      as total_points

  from eligible_riders eligible

  join canonical_point_totals canonical_points
    on canonical_points.rider_id = eligible.rider_id

  where canonical_points.points_classification_points > 0
),

points_ranked as (
  select
    points_total.*,

    row_number() over (
      order by
        points_total.total_points desc,
        points_total.rider_id
    )::integer as classification_rank

  from points_totals points_total
),

mountain_totals as (
  select
    eligible.rider_id,
    eligible.team_id,
    eligible.rider_name_snapshot,
    eligible.team_name_snapshot,

    canonical_points.mountain_points
      as total_points

  from eligible_riders eligible

  join canonical_point_totals canonical_points
    on canonical_points.rider_id = eligible.rider_id

  where canonical_points.mountain_points > 0
),

mountain_ranked as (
  select
    mountain_total.*,

    row_number() over (
      order by
        mountain_total.total_points desc,
        mountain_total.rider_id
    )::integer as classification_rank

  from mountain_totals mountain_total
),

young_ranked as (
  select
    general_ranking.rider_id,
    general_ranking.team_id,
    general_ranking.rider_name_snapshot,
    general_ranking.team_name_snapshot,
    general_ranking.total_time_seconds,

    row_number() over (
      order by
        general_ranking.total_time_seconds,
        general_ranking.classification_rank,
        general_ranking.rider_id
    )::integer as classification_rank,

    min(
      general_ranking.total_time_seconds
    ) over () as best_young_time

  from general_ranked general_ranking

  join public.race_participant_riders participant
    on participant.race_id = p_race_id
   and participant.rider_id = general_ranking.rider_id
   and participant.is_young_rider is true
),

stage_rider_times as (
  select
    stage_result.stage_id,
    stage_scope.stage_number,
    stage_result.rider_id,
    stage_result.team_id,
    stage_result.team_name_snapshot,

    greatest(
      coalesce(stage_result.elapsed_seconds, 0)
      - coalesce(stage_bonus.bonus_seconds, 0)
      + coalesce(stage_result.penalty_seconds, 0),
      0
    )::bigint as adjusted_time_seconds,

    row_number() over (
      partition by
        stage_result.stage_id,
        stage_result.team_id
      order by
        greatest(
          coalesce(stage_result.elapsed_seconds, 0)
          - coalesce(stage_bonus.bonus_seconds, 0)
          + coalesce(stage_result.penalty_seconds, 0),
          0
        ),
        stage_result.rank nulls last,
        stage_result.rider_id
    )::integer as team_rider_rank

  from public.race_stage_results stage_result

  join stage_scope
    on stage_scope.stage_id = stage_result.stage_id

  left join canonical_stage_bonuses stage_bonus
    on stage_bonus.stage_id = stage_result.stage_id
   and stage_bonus.rider_id = stage_result.rider_id

  where stage_result.race_id = p_race_id
    and stage_result.team_id is not null
    and lower(
      coalesce(
        stage_result.status,
        'finished'
      )
    ) = 'finished'
),

stage_team_times as (
  select
    stage_rider_time.stage_id,
    stage_rider_time.stage_number,
    stage_rider_time.team_id,

    (
      array_agg(
        stage_rider_time.team_name_snapshot
        order by stage_rider_time.team_rider_rank
      )
    )[1] as team_name_snapshot,

    sum(
      stage_rider_time.adjusted_time_seconds
    )::bigint as stage_team_time_seconds

  from stage_rider_times stage_rider_time

  where stage_rider_time.team_rider_rank <= 3

  group by
    stage_rider_time.stage_id,
    stage_rider_time.stage_number,
    stage_rider_time.team_id

  having count(*) = 3
),

team_totals as (
  select
    stage_team_time.team_id,

    (
      array_agg(
        stage_team_time.team_name_snapshot
        order by stage_team_time.stage_number desc
      )
    )[1] as team_name_snapshot,

    sum(
      stage_team_time.stage_team_time_seconds
    )::bigint as total_time_seconds,

    count(
      distinct stage_team_time.stage_id
    )::integer as completed_stage_count

  from stage_team_times stage_team_time

  group by stage_team_time.team_id

  having count(
    distinct stage_team_time.stage_id
  ) = (
    select included_stage_count
    from stage_count
  )
),

team_ranked as (
  select
    team_total.*,

    row_number() over (
      order by
        team_total.total_time_seconds,
        team_total.team_id
    )::integer as classification_rank,

    min(
      team_total.total_time_seconds
    ) over () as best_team_time

  from team_totals team_total
),

combined_classifications as (
  select
    'general'::text as classification_type,
    'rider'::text as entity_type,
    general_ranking.rider_id,
    general_ranking.team_id,
    general_ranking.classification_rank,
    general_ranking.total_time_seconds,
    (
      general_ranking.total_time_seconds
      - general_ranking.best_total_time
    )::bigint as gap_seconds,
    null::integer as points,
    general_ranking.rider_name_snapshot
      as display_name_snapshot,
    general_ranking.team_name_snapshot

  from general_ranked general_ranking

  union all

  select
    'points',
    'rider',
    points_ranking.rider_id,
    points_ranking.team_id,
    points_ranking.classification_rank,
    null::bigint,
    null::bigint,
    points_ranking.total_points,
    points_ranking.rider_name_snapshot,
    points_ranking.team_name_snapshot

  from points_ranked points_ranking

  union all

  select
    'mountain',
    'rider',
    mountain_ranking.rider_id,
    mountain_ranking.team_id,
    mountain_ranking.classification_rank,
    null::bigint,
    null::bigint,
    mountain_ranking.total_points,
    mountain_ranking.rider_name_snapshot,
    mountain_ranking.team_name_snapshot

  from mountain_ranked mountain_ranking

  union all

  select
    'young',
    'rider',
    young_ranking.rider_id,
    young_ranking.team_id,
    young_ranking.classification_rank,
    young_ranking.total_time_seconds,
    (
      young_ranking.total_time_seconds
      - young_ranking.best_young_time
    )::bigint,
    null::integer,
    young_ranking.rider_name_snapshot,
    young_ranking.team_name_snapshot

  from young_ranked young_ranking

  union all

  select
    'team',
    'team',
    null::uuid,
    team_ranking.team_id,
    team_ranking.classification_rank,
    team_ranking.total_time_seconds,
    (
      team_ranking.total_time_seconds
      - team_ranking.best_team_time
    )::bigint,
    null::integer,
    team_ranking.team_name_snapshot,
    team_ranking.team_name_snapshot

  from team_ranked team_ranking
)

select
  combined.classification_type,
  combined.entity_type,
  combined.rider_id,
  combined.team_id,
  combined.classification_rank,
  combined.total_time_seconds,
  combined.gap_seconds,
  combined.points,
  combined.display_name_snapshot,
  combined.team_name_snapshot

from combined_classifications combined

order by
  case combined.classification_type
    when 'general' then 1
    when 'points' then 2
    when 'mountain' then 3
    when 'young' then 4
    when 'team' then 5
    else 99
  end,
  combined.classification_rank,
  combined.rider_id,
  combined.team_id;

$function$

