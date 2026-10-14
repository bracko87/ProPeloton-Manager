-- Prevent time-trial checkpoints from being interpreted as bonus/sprint competitions.
-- Changes only future-generation logic plus one explicitly validated future stage.

CREATE OR REPLACE FUNCTION public.sync_stage_points_from_profile_json_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_inserted integer := 0;
begin
  with stage_data as (
    select
      rs.id as stage_id,
      rs.distance_km::numeric as distance_km,
      coalesce(to_jsonb(rs.intermediate_sprints_json), '[]'::jsonb) as sprint_json,
      coalesce(to_jsonb(rs.mountain_climbs_json), '[]'::jsonb) as climb_json,
      coalesce(
        rs.metadata #> '{route_profile_v1,route_markers}',
        rs.metadata -> 'route_markers',
        '[]'::jsonb
      ) as marker_json
    from public.race_stages rs
    where rs.id = p_stage_id
  ),
  sprint_points as (
    select
      sd.stage_id,
      'INTERMEDIATE_SPRINT'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'name', ''),
        'Intermediate sprint'
      ) as name,
      null::text as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.sprint_json) item(value)
    where lower(coalesce(item.value->>'points',item.value->>'point_type','')) not in
      ('time_check','time_split','timing_gate','timing_check','time_checkpoint')
      and lower(coalesce(item.value->>'name','')) !~ '(time[ -]?(check|split|checkpoint)|timing[ -]?(gate|check|split|point))'

    union all

    select
      sd.stage_id,
      'INTERMEDIATE_SPRINT'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'label', ''),
        nullif(item.value ->> 'name', ''),
        'Intermediate sprint'
      ) as name,
      null::text as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.marker_json) item(value)
    where lower(coalesce(item.value ->> 'type', item.value ->> 'point_type', '')) in
      ('sprint', 'intermediate_sprint')
      and lower(btrim(coalesce(item.value->>'label',item.value->>'name',''))) !~
        '(time[ -]?(check|split|checkpoint)|timing[ -]?(gate|check|split|point))'
  ),
  kom_points as (
    select
      sd.stage_id,
      'KOM'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'name', ''),
        'KOM'
      ) as name,
      nullif(coalesce(item.value ->> 'category', item.value ->> 'kom_category'), '') as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.climb_json) item(value)

    union all

    select
      sd.stage_id,
      'KOM'::text as point_type,
      coalesce(
        nullif(item.value ->> 'km', '')::numeric,
        nullif(item.value ->> 'km_from_start', '')::numeric
      ) as km_from_start,
      coalesce(
        nullif(item.value ->> 'label', ''),
        nullif(item.value ->> 'name', ''),
        'KOM'
      ) as name,
      nullif(coalesce(item.value ->> 'category', item.value ->> 'kom_category'), '') as kom_category,
      false as is_finish_point
    from stage_data sd
    cross join lateral jsonb_array_elements(sd.marker_json) item(value)
    where lower(coalesce(item.value ->> 'type', item.value ->> 'point_type', '')) in
      ('kom', 'climb', 'mountain_climb')
  ),
  finish_points as (
    select
      sd.stage_id,
      'FINISH'::text as point_type,
      sd.distance_km as km_from_start,
      'Finish sprint'::text as name,
      null::text as kom_category,
      true as is_finish_point
    from stage_data sd
  ),
  all_points as (
    select * from sprint_points
    union all
    select * from kom_points
    union all
    select * from finish_points
  ),
  clean_points as (
    select distinct on (stage_id, point_type, round(km_from_start::numeric, 1))
      stage_id,
      point_type,
      km_from_start,
      name,
      kom_category,
      is_finish_point
    from all_points
    where km_from_start is not null
      and km_from_start >= 0
    order by stage_id, point_type, round(km_from_start::numeric, 1), name
  ),
  inserted as (
    insert into public.race_stage_points (
      id,
      stage_id,
      point_type,
      km_from_start,
      name,
      kom_category,
      points_scheme,
      time_bonus_seconds,
      is_finish_point,
      sort_order,
      metadata
    )
    select
      gen_random_uuid(),
      cp.stage_id,
      cp.point_type,
      cp.km_from_start,
      cp.name,
      cp.kom_category,
      case
        when cp.point_type = 'INTERMEDIATE_SPRINT' then '[20,17,15,13,11,10,9,8,7,6]'::jsonb
        when cp.point_type = 'KOM' then '[5,3,2,1]'::jsonb
        when cp.point_type = 'FINISH' then '[25,20,16,14,12,10,8,6,4,2]'::jsonb
        else '[]'::jsonb
      end,
      case
        when cp.point_type = 'FINISH' then '[10,6,4]'::jsonb
        else '[]'::jsonb
      end,
      cp.is_finish_point,
      row_number() over (order by cp.km_from_start, cp.point_type),
      jsonb_build_object(
        'created_by', 'sync_stage_points_from_profile_json_v1',
        'synced_at', now()
      )
    from clean_points cp
    where not exists (
      select 1
      from public.race_stage_points existing
      where existing.stage_id = cp.stage_id
        and existing.point_type = cp.point_type
        and abs(existing.km_from_start::numeric - cp.km_from_start::numeric) < 0.05
    )
    returning 1
  )
  select count(*)
  into v_inserted
  from inserted;

  return jsonb_build_object(
    'status', 'completed',
    'mode', 'sync_stage_points_from_profile_json_v1',
    'stage_id', p_stage_id,
    'inserted_points', v_inserted
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_race_stage_points_from_stage_json_v1(p_stage_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_inserted_count integer := 0;
begin
  select
    stage.id,
    stage.distance_km::numeric as distance_km,
    lower(coalesce(stage.terrain_type, '')) as terrain_type,

    coalesce(
      stage.intermediate_sprints_json,
      '[]'::jsonb
    ) as intermediate_sprints,

    coalesce(
      stage.mountain_climbs_json,
      '[]'::jsonb
    ) as mountain_climbs

  into v_stage

  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage.id is null then
    raise exception
      'Race stage % was not found.',
      p_stage_id;
  end if;

  /*
   * Preserve manually configured canonical definitions unless a
   * forced rebuild was explicitly requested.
   */
  if not p_force
     and exists (
       select 1
       from public.race_stage_points stage_point
       where stage_point.stage_id = p_stage_id
         and upper(stage_point.point_type) <> 'START'
     )
  then
    return jsonb_build_object(
      'status',
      'already_present',
      'stage_id',
      p_stage_id,
      'competition_point_count',
      (
        select count(*)
        from public.race_stage_points stage_point
        where stage_point.stage_id = p_stage_id
          and upper(stage_point.point_type) <> 'START'
      )
    );
  end if;

  /*
   * Point results reference point definitions, so delete them first.
   */
  delete from public.race_stage_point_results
  where stage_id = p_stage_id;

  delete from public.race_stage_points
  where stage_id = p_stage_id;

  with source_points as (
    /*
     * Stage start.
     */
    select
      'START'::text as point_type,
      0::numeric as km_from_start,
      'Stage start'::text as point_name,
      null::text as kom_category,
      '[]'::jsonb as points_scheme,
      '[]'::jsonb as time_bonus_seconds,
      false as is_finish_point,
      0 as type_order,
      jsonb_build_object(
        'source',
        'stage_json_sync_v1'
      ) as metadata

    union all

    /*
     * Intermediate and bonus sprints stored on race_stages.
     */
    select
      case
        when upper(
          coalesce(sprint.item ->> 'point_type', '')
        ) = 'BONUS_SPRINT'
          then 'BONUS_SPRINT'
        else 'INTERMEDIATE_SPRINT'
      end as point_type,

      (sprint.item ->> 'km')::numeric
        as km_from_start,

      coalesce(
        nullif(sprint.item ->> 'name', ''),
        'Intermediate sprint ' ||
          sprint.ordinal_number::text
      ) as point_name,

      null::text as kom_category,

      case
        when jsonb_typeof(
          sprint.item -> 'points_scheme'
        ) = 'array'
          then sprint.item -> 'points_scheme'
        else '[]'::jsonb
      end as points_scheme,

      case
        when jsonb_typeof(
          sprint.item -> 'time_bonus_seconds'
        ) = 'array'
          then sprint.item -> 'time_bonus_seconds'
        else '[]'::jsonb
      end as time_bonus_seconds,

      false as is_finish_point,
      10 as type_order,

      jsonb_build_object(
        'source',
        'stage_json_sync_v1',
        'source_type',
        'intermediate_sprints_json',
        'source_number',
        coalesce(
          sprint.item ->> 'number',
          sprint.ordinal_number::text
        )
      ) as metadata

    from jsonb_array_elements(
      v_stage.intermediate_sprints
    ) with ordinality as sprint(
      item,
      ordinal_number
    )

    where nullif(
      sprint.item ->> 'km',
      ''
    ) is not null
      and lower(coalesce(sprint.item->>'points',sprint.item->>'point_type','')) not in
        ('time_check','time_split','timing_gate','timing_check','time_checkpoint')
      and lower(coalesce(sprint.item->>'name','')) !~ '(time[ -]?(check|split|checkpoint)|timing[ -]?(gate|check|split|point))'

    union all

    /*
     * KOM definitions stored on race_stages.
     */
    select
      'KOM'::text as point_type,

      (climb.item ->> 'km')::numeric
        as km_from_start,

      coalesce(
        nullif(climb.item ->> 'name', ''),
        'KOM ' || climb.ordinal_number::text
      ) as point_name,

      nullif(
        regexp_replace(
          coalesce(
            climb.item ->> 'category',
            ''
          ),
          '^Cat[[:space:]]*',
          '',
          'i'
        ),
        ''
      ) as kom_category,

      case
        when jsonb_typeof(
          climb.item -> 'points_scheme'
        ) = 'array'
          then climb.item -> 'points_scheme'
        else '[]'::jsonb
      end as points_scheme,

      case
        when jsonb_typeof(
          climb.item -> 'time_bonus_seconds'
        ) = 'array'
          then climb.item -> 'time_bonus_seconds'
        else '[]'::jsonb
      end as time_bonus_seconds,

      false as is_finish_point,
      20 as type_order,

      jsonb_build_object(
        'source',
        'stage_json_sync_v1',
        'source_type',
        'mountain_climbs_json',
        'source_number',
        coalesce(
          climb.item ->> 'number',
          climb.ordinal_number::text
        ),
        'length_km',
        nullif(
          climb.item ->> 'length_km',
          ''
        )::numeric,
        'avg_gradient',
        nullif(
          climb.item ->> 'avg_gradient',
          ''
        )::numeric
      ) as metadata

    from jsonb_array_elements(
      v_stage.mountain_climbs
    ) with ordinality as climb(
      item,
      ordinal_number
    )

    where nullif(
      climb.item ->> 'km',
      ''
    ) is not null

    union all

    /*
     * Standard stage finish.
     *
     * Time trials do not receive normal road-stage GC bonuses.
     */
    select
      'FINISH'::text as point_type,
      v_stage.distance_km as km_from_start,
      'Finish sprint'::text as point_name,
      null::text as kom_category,

      '[25,20,16,14,12,10,8,6,4,2]'::jsonb
        as points_scheme,

      case
        when v_stage.terrain_type in (
          'individual_time_trial',
          'team_time_trial',
          'prologue'
        )
          then '[]'::jsonb
        else '[10,6,4]'::jsonb
      end as time_bonus_seconds,

      true as is_finish_point,
      30 as type_order,

      jsonb_build_object(
        'source',
        'stage_json_sync_v1',
        'source_type',
        'stage_finish'
      ) as metadata
  ),

  ordered_points as (
    select
      source_point.*,

      (
        row_number() over (
          order by
            source_point.km_from_start,
            source_point.type_order,
            source_point.point_name
        ) - 1
      )::integer * 10 as sort_order

    from source_points source_point
  )

  insert into public.race_stage_points (
    stage_id,
    point_type,
    km_from_start,
    name,
    kom_category,
    points_scheme,
    time_bonus_seconds,
    is_finish_point,
    sort_order,
    metadata
  )
  select
    p_stage_id,
    ordered.point_type,
    ordered.km_from_start,
    ordered.point_name,
    ordered.kom_category,
    ordered.points_scheme,
    ordered.time_bonus_seconds,
    ordered.is_finish_point,
    ordered.sort_order,
    ordered.metadata

  from ordered_points ordered

  order by
    ordered.sort_order;

  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'status',
    'completed',
    'stage_id',
    p_stage_id,
    'inserted_point_count',
    v_inserted_count
  );
end;
$function$



CREATE OR REPLACE FUNCTION public.normalize_race_stage_route_markers_for_scoring_v1(
  p_stage_id uuid, p_route_markers jsonb
) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_route_markers) IS DISTINCT FROM 'array'
    THEN coalesce(p_route_markers,'[]'::jsonb)
    ELSE coalesce((
      SELECT jsonb_agg(
        CASE WHEN lower(coalesce(m.value->>'type',m.value->>'point_type','')) LIKE '%sprint%'
            AND lower(btrim(coalesce(m.value->>'label',m.value->>'title',m.value->>'name',''))) ~
                '(time[ -]?(check|split|checkpoint)|timing[ -]?(gate|check|split|point))'
          THEN jsonb_set(m.value,'{type}',to_jsonb('time_check'::text),true)
          ELSE m.value END ORDER BY m.ordinality
      )
      FROM jsonb_array_elements(p_route_markers) WITH ORDINALITY AS m(value,ordinality)
    ), '[]'::jsonb)
  END;
$function$;



-- Targeted correction is limited to the unstarted future Stage 8 ITT.
-- A time check remains visible in route markers but must never award sprint points.
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.race_stages WHERE id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid AND stage_date > public.get_current_game_date_date() AND stage_format='individual_time_trial')
    OR EXISTS (SELECT 1 FROM public.race_stage_authoritative_runs WHERE stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid)
    OR EXISTS (SELECT 1 FROM public.race_stage_simulation_runs WHERE stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid)
    OR EXISTS (SELECT 1 FROM public.race_stage_point_results WHERE stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid)
 THEN
    RAISE EXCEPTION 'Poyang Stage 8 is missing, already started, or no longer in the future; refusing to change race data';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.race_stage_points
                WHERE id='dcfd287e-3bf2-4b3e-8b00-72089b0c9c16'::uuid
                  AND stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid
                  AND point_type='INTERMEDIATE_SPRINT' AND km_from_start=7)
 THEN
    RAISE EXCEPTION 'The expected false Poyang ITT sprint scoring point was not found; refusing partial repair';
 END IF;
END $guard$;

UPDATE public.race_stages
SET intermediate_sprints_json='[]'::jsonb
WHERE id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid;

UPDATE public.race_stage_profile_details d
SET intermediate_sprints='[]'::jsonb,
    route_markers=(
      SELECT jsonb_agg(
        CASE WHEN m.value->>'type'='sprint' AND m.value->>'label'='Time check'
                  AND (m.value->>'km')::numeric=7
             THEN jsonb_set(m.value,'{type}',to_jsonb('time_check'::text),true)
             ELSE m.value END
        ORDER BY m.ordinality)
      FROM jsonb_array_elements(d.route_markers) WITH ORDINALITY AS m(value,ordinality))
WHERE d.stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid;

DELETE FROM public.race_stage_points
WHERE id='dcfd287e-3bf2-4b3e-8b00-72089b0c9c16'::uuid
  AND stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid;

DO $verify$
BEGIN
 IF EXISTS (SELECT 1 FROM public.race_stage_points WHERE stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid
               AND point_type IN ('INTERMEDIATE_SPRINT','BONUS_SPRINT'))
 OR EXISTS (SELECT 1 FROM public.race_stage_profile_details d
            WHERE d.stage_id='89dd20b4-9d3c-46bd-a16d-5e9e9768d028'::uuid
              AND (jsonb_array_length(d.intermediate_sprints)<>0 OR EXISTS
                   (SELECT 1 FROM jsonb_array_elements(d.route_markers) m
                     WHERE m->>'label'='Time check' AND m->>'type'<>'time_check')))
 THEN RAISE EXCEPTION 'Post-correction Poyang Stage 8 scorepoint/marker verification failed'; END IF;
END $verify$;
