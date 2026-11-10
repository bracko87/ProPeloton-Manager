-- Safely enable V2 cumulative classifications after verified weather cancellations.
-- Preserves all previous safeguards: completed simulation, nonempty GC preview,
-- valid 32-bit values, explicit write confirmation and transactional replacement.
-- The preview excludes weather-cancelled stages (prior migration).
CREATE OR REPLACE FUNCTION public.race_engine_write_cumulative_classifications_v2(p_simulation_run_id uuid, p_dry_run boolean DEFAULT true, p_confirmation_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
declare
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_number integer;
  v_previous_standing_stage_id uuid;

  v_preview_row_count integer := 0;
  v_general_row_count integer := 0;
  v_points_row_count integer := 0;
  v_mountain_row_count integer := 0;
  v_young_row_count integer := 0;
  v_team_row_count integer := 0;

  v_invalid_integer_rows integer := 0;
  v_weather_cancelled_stage_count integer := 0;

  v_deleted_rows integer := 0;
  v_inserted_rows integer := 0;

  v_preview_summary jsonb := '[]'::jsonb;
  v_current_summary jsonb := '[]'::jsonb;
  v_top_points jsonb := '[]'::jsonb;
begin
  /*
   * Resolve the completed simulation run.
   */
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
    and lower(
      coalesce(
        simulation_run.status,
        ''
      )
    ) = 'completed'
  limit 1;

  if v_race_id is null
     or v_stage_id is null
     or v_stage_number is null
  then
    raise exception
      'Completed simulation run % was not found.',
      p_simulation_run_id;
  end if;

  /*
   * Temporary safety guard:
   *
   * The current preview has been validated for ordinary completed stages.
   * Weather-cancelled stages contain no ordinary result rows and require a
   * separate classification-scope hardening before this writer is routed
   * globally.
   */
  select count(*)::integer
  into v_weather_cancelled_stage_count
  from public.race_stages stage
  where stage.race_id = v_race_id
    and stage.stage_number <= v_stage_number
    and coalesce(stage.weather_cancelled, false) = true;

  /*
   * Find the latest earlier stage that actually has a classification snapshot.
   *
   * This is safer than assuming the immediately previous scheduled stage has
   * standings.
   */
  select previous_snapshot.after_stage_id
  into v_previous_standing_stage_id
  from (
    select
      standing.after_stage_id,
      previous_stage.stage_number
    from public.race_classification_standings standing
    join public.race_stages previous_stage
      on previous_stage.id = standing.after_stage_id
    where standing.race_id = v_race_id
      and previous_stage.stage_number < v_stage_number
    group by
      standing.after_stage_id,
      previous_stage.stage_number
    order by previous_stage.stage_number desc
    limit 1
  ) previous_snapshot;

  /*
   * Inspect the preview.
   */
  select
    count(*)::integer,

    count(*) filter (
      where preview.classification_type = 'general'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'points'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'mountain'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'young'
    )::integer,

    count(*) filter (
      where preview.classification_type = 'team'
    )::integer

  into
    v_preview_row_count,
    v_general_row_count,
    v_points_row_count,
    v_mountain_row_count,
    v_young_row_count,
    v_team_row_count

  from public.race_engine_preview_cumulative_classifications_v2(
    v_race_id,
    v_stage_number
  ) preview;

  if v_preview_row_count = 0 then
    raise exception
      'Classification preview returned zero rows for race %, stage number %.',
      v_race_id,
      v_stage_number;
  end if;

  if v_general_row_count = 0 then
    raise exception
      'Classification preview returned no general-classification riders.';
  end if;

  /*
   * race_classification_standings stores time values as integer.
   * Refuse the write instead of silently overflowing or truncating.
   */
  select count(*)::integer
  into v_invalid_integer_rows
  from public.race_engine_preview_cumulative_classifications_v2(
    v_race_id,
    v_stage_number
  ) preview
  where (
      preview.total_time_seconds is not null
      and (
        preview.total_time_seconds > 2147483647
        or preview.total_time_seconds < -2147483648
      )
    )
    or (
      preview.gap_seconds is not null
      and (
        preview.gap_seconds > 2147483647
        or preview.gap_seconds < -2147483648
      )
    );

  if v_invalid_integer_rows > 0 then
    raise exception
      '% preview rows contain time values outside the integer range.',
      v_invalid_integer_rows;
  end if;

  /*
   * Compact preview summary.
   */
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classification_type',
          preview_group.classification_type,
        'row_count',
          preview_group.row_count,
        'total_points',
          preview_group.total_points
      )
      order by preview_group.sort_order
    ),
    '[]'::jsonb
  )
  into v_preview_summary
  from (
    select
      preview.classification_type,
      count(*)::integer as row_count,
      sum(coalesce(preview.points, 0))::integer
        as total_points,

      case preview.classification_type
        when 'general' then 1
        when 'points' then 2
        when 'mountain' then 3
        when 'young' then 4
        when 'team' then 5
        else 99
      end as sort_order

    from public.race_engine_preview_cumulative_classifications_v2(
      v_race_id,
      v_stage_number
    ) preview

    group by preview.classification_type
  ) preview_group;

  /*
   * Current stored snapshot summary.
   */
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'classification_type',
          current_group.classification_type,
        'row_count',
          current_group.row_count,
        'total_points',
          current_group.total_points
      )
      order by current_group.sort_order
    ),
    '[]'::jsonb
  )
  into v_current_summary
  from (
    select
      standing.classification_type,
      count(*)::integer as row_count,
      sum(coalesce(standing.points, 0))::integer
        as total_points,

      case standing.classification_type
        when 'general' then 1
        when 'points' then 2
        when 'mountain' then 3
        when 'young' then 4
        when 'team' then 5
        else 99
      end as sort_order

    from public.race_classification_standings standing

    where standing.race_id = v_race_id
      and standing.after_stage_id = v_stage_id
      and standing.classification_type in (
        'general',
        'points',
        'mountain',
        'young',
        'team'
      )

    group by standing.classification_type
  ) current_group;

  /*
   * Top canonical points riders for audit output.
   */
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank',
          point_preview.classification_rank,
        'rider_id',
          point_preview.rider_id,
        'rider_name',
          point_preview.display_name_snapshot,
        'team_name',
          point_preview.team_name_snapshot,
        'points',
          point_preview.points
      )
      order by point_preview.classification_rank
    ),
    '[]'::jsonb
  )
  into v_top_points
  from (
    select preview.*
    from public.race_engine_preview_cumulative_classifications_v2(
      v_race_id,
      v_stage_number
    ) preview
    where preview.classification_type = 'points'
    order by preview.classification_rank
    limit 10
  ) point_preview;

  /*
   * Dry-run finishes here.
   */
  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'status',
        'dry_run',
      'write_performed',
        false,
      'simulation_run_id',
        p_simulation_run_id,
      'race_id',
        v_race_id,
      'stage_id',
        v_stage_id,
      'stage_number',
        v_stage_number,
      'previous_standing_stage_id',
        v_previous_standing_stage_id,
      'weather_cancelled_stage_count_in_scope',
        v_weather_cancelled_stage_count,
      'preview_row_count',
        v_preview_row_count,
      'preview_summary',
        v_preview_summary,
      'current_summary',
        v_current_summary,
      'top_points',
        v_top_points,
      'confirmation_required_for_write',
        'CONFIRM_CANONICAL_CLASSIFICATIONS_V2'
    );
  end if;

  /*
   * Actual-write guards.
   */
  if p_confirmation_token is distinct from
    'CONFIRM_CANONICAL_CLASSIFICATIONS_V2'
  then
    raise exception
      'Actual classification write requires confirmation token %.',
      'CONFIRM_CANONICAL_CLASSIFICATIONS_V2';
  end if;

  -- Weather cancellations have no classification rows. Allow writing only
  -- when all cancelled stages truly have no race results or official run,
  -- all earlier non-cancelled stages have official results, and the current
  -- completed simulation is the authoritative one. Never manufacture data.
  if v_weather_cancelled_stage_count > 0 then
    if exists (
      select 1 from public.race_stages cancelled
      where cancelled.race_id=v_race_id
        and cancelled.stage_number<=v_stage_number
        and coalesce(cancelled.weather_cancelled,false)
        and (
          exists (select 1 from public.race_stage_results r
                  where r.stage_id=cancelled.id)
          or exists (select 1 from public.race_stage_authoritative_runs a
                     where a.stage_id=cancelled.id)
        )
    ) then
      raise exception 'Cancelled-stage classification scope has official outputs, refusing to rebuild';
    end if;

    if exists (
      select 1 from public.race_stages prior_stage
      where prior_stage.race_id=v_race_id
        and prior_stage.stage_number<v_stage_number
        and not coalesce(prior_stage.weather_cancelled,false)
        and (
          not exists (
            select 1 from public.race_stage_authoritative_runs a
            join public.race_stage_simulation_runs sr
              on sr.id=a.simulation_run_id and sr.status='completed'
            where a.stage_id=prior_stage.id
          )
          or not exists (
            select 1 from public.race_stage_results rr
            where rr.stage_id=prior_stage.id
          )
        )
    ) then
      raise exception 'Earlier non-cancelled stage has no official results, refusing classification rebuild';
    end if;

    if not exists (
      select 1 from public.race_stage_authoritative_runs a
      join public.race_stage_simulation_runs sr
        on sr.id=a.simulation_run_id and sr.status='completed'
      where a.stage_id=v_stage_id
        and a.simulation_run_id=p_simulation_run_id
    ) then
      raise exception 'Current completed run is not official, refusing classification rebuild';
    end if;
  end if;

  /*
   * Replace only this stage's classification snapshot.
   *
   * If insertion fails, PostgreSQL rolls the deletion back automatically.
   */
  delete from public.race_classification_standings standing
  where standing.race_id = v_race_id
    and standing.after_stage_id = v_stage_id
    and standing.classification_type in (
      'general',
      'points',
      'mountain',
      'young',
      'team'
    );

  get diagnostics v_deleted_rows = row_count;

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
    preview.classification_type,
    preview.entity_type,
    preview.rider_id,
    preview.team_id,
    preview.classification_rank,

    previous_standing.rank,

    case
      when preview.total_time_seconds is null
        then null
      else preview.total_time_seconds::integer
    end,

    case
      when preview.gap_seconds is null
        then null
      else preview.gap_seconds::integer
    end,

    preview.points,
    preview.display_name_snapshot,
    preview.team_name_snapshot

  from public.race_engine_preview_cumulative_classifications_v2(
    v_race_id,
    v_stage_number
  ) preview

  left join public.race_classification_standings previous_standing
    on previous_standing.race_id = v_race_id
   and previous_standing.after_stage_id =
      v_previous_standing_stage_id
   and previous_standing.classification_type =
      preview.classification_type
   and previous_standing.entity_type =
      preview.entity_type
   and (
     (
       preview.entity_type = 'rider'
       and previous_standing.rider_id =
         preview.rider_id
     )
     or
     (
       preview.entity_type = 'team'
       and previous_standing.team_id =
         preview.team_id
     )
   )

  order by
    case preview.classification_type
      when 'general' then 1
      when 'points' then 2
      when 'mountain' then 3
      when 'young' then 4
      when 'team' then 5
      else 99
    end,
    preview.classification_rank;

  get diagnostics v_inserted_rows = row_count;

  return jsonb_build_object(
    'status',
      'completed',
    'write_performed',
      true,
    'writer_version',
      'cumulative_classifications_v2_canonical_points',
    'simulation_run_id',
      p_simulation_run_id,
    'race_id',
      v_race_id,
    'stage_id',
      v_stage_id,
    'stage_number',
      v_stage_number,
    'previous_standing_stage_id',
      v_previous_standing_stage_id,
    'deleted_rows',
      v_deleted_rows,
    'inserted_rows',
      v_inserted_rows,
    'general_rows',
      v_general_row_count,
    'points_rows',
      v_points_row_count,
    'mountain_rows',
      v_mountain_row_count,
    'young_rows',
      v_young_row_count,
    'team_rows',
      v_team_row_count,
    'preview_summary',
      v_preview_summary,
    'top_points',
      v_top_points
  );
end;
$function$

