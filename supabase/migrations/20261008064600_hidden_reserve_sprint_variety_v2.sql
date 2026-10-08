-- Diversify hidden reserve stage profiles and intermediate sprint layouts.
--
-- Goals:
--   * stop hard-coding exactly two intermediate sprints on almost every stage;
--   * use a stage-aware target of 2-5 sprints when safe flat/gentle sections exist;
--   * never force a sprint onto a steep climb, a meaningful descent, a KOM zone,
--     or the high part of a mountain/uphill-finish profile;
--   * leave sprint-less mountain sections alone when no safe sprint zone exists;
--   * make profiles within the same stage race look less template-like by adding
--     stage-specific intermediate curve points without changing route endpoints
--     or creating artificial major summits;
--   * rebuild chart markers and canonical race-stage points from the new layout.
--
-- Tour of Cuba is used as the reference validation race:
-- stage sprint targets are 3 / 5 / 4 / 2 / 3.

begin;

do $$
declare
  v_stage record;
  v_new_profile jsonb;
begin
  for v_stage in
    select
      s.id as stage_id,
      s.stage_number,
      d.profile_points,
      coalesce(d.metadata, '{}'::jsonb) as detail_metadata
    from public.race_reserve_pool rp
    join public.race_stages s on s.race_id = rp.race_id
    join public.race_stage_profile_details d on d.stage_id = s.id
    where rp.active = true
      and lower(coalesce(s.stage_format, 'road_race')) = 'road_race'
      and jsonb_typeof(d.profile_points) = 'array'
      and jsonb_array_length(d.profile_points) >= 2
    order by s.race_id, s.stage_number
  loop
    if coalesce(v_stage.detail_metadata ->> 'profile_variety_version', '') <> 'hidden_reserve_v2' then
      with raw_points as (
        select
          ordinality::integer as ord,
          point,
          (point ->> 'km')::numeric as km,
          coalesce(
            nullif(point ->> 'elevation', '')::numeric,
            nullif(point ->> 'elevation_m', '')::numeric
          ) as elevation
        from jsonb_array_elements(v_stage.profile_points)
          with ordinality as p(point, ordinality)
      ),
      paired as (
        select
          raw.*,
          lead(raw.km) over (order by raw.ord) as next_km,
          lead(raw.elevation) over (order by raw.ord) as next_elevation
        from raw_points raw
      ),
      expanded as (
        select
          ord * 2 as sort_key,
          point
        from paired

        union all

        select
          ord * 2 + 1 as sort_key,
          jsonb_build_object(
            'km',
            round(
              km + (next_km - km) *
                case mod(v_stage.stage_number + ord, 3)
                  when 0 then 0.42
                  when 1 then 0.50
                  else 0.58
                end,
              1
            ),
            'elevation',
            round(
              elevation
              + (next_elevation - elevation) *
                case mod(v_stage.stage_number + ord, 3)
                  when 0 then 0.42
                  when 1 then 0.50
                  else 0.58
                end
              + case when mod(v_stage.stage_number * 2 + ord, 2) = 0 then 1 else -1 end
                * abs(next_elevation - elevation) * 0.10,
              1
            ),
            'elevation_m',
            round(
              elevation
              + (next_elevation - elevation) *
                case mod(v_stage.stage_number + ord, 3)
                  when 0 then 0.42
                  when 1 then 0.50
                  else 0.58
                end
              + case when mod(v_stage.stage_number * 2 + ord, 2) = 0 then 1 else -1 end
                * abs(next_elevation - elevation) * 0.10,
              1
            )
          ) as point
        from paired
        where next_km is not null
          and next_elevation is not null
          and next_km > km
      )
      select jsonb_agg(point order by sort_key)
      into v_new_profile
      from expanded;

      update public.race_stage_profile_details
      set
        profile_points = v_new_profile,
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'profile_variety_version', 'hidden_reserve_v2',
            'profile_variety_source', 'stage_specific_curve_interpolation'
          )
      where stage_id = v_stage.stage_id;
    end if;
  end loop;
end
$$;

do $$
declare
  v_stage record;
  v_target_count integer;
  v_candidate_count integer;
  v_actual_count integer;
  v_new_sprints jsonb;
  v_route_markers jsonb;
begin
  for v_stage in
    select
      r.name as race_name,
      r.is_stage_race,
      s.id as stage_id,
      s.race_id,
      s.stage_number,
      s.distance_km::numeric as distance_km,
      lower(coalesce(s.terrain_type, 'flat')) as terrain_type,
      lower(coalesce(s.finish_type, 'flat_finish')) as finish_type,
      coalesce(nullif(s.start_city_name, ''), nullif(s.start_city, ''), 'Start') as start_name,
      coalesce(nullif(s.finish_city_name, ''), nullif(s.finish_city, ''), 'Finish') as finish_name,
      coalesce(s.mountain_climbs_json, '[]'::jsonb) as climbs,
      d.profile_points
    from public.race_reserve_pool rp
    join public.races r on r.id = rp.race_id
    join public.race_stages s on s.race_id = rp.race_id
    join public.race_stage_profile_details d on d.stage_id = s.id
    where rp.active = true
      and lower(coalesce(s.stage_format, 'road_race')) = 'road_race'
      and jsonb_typeof(d.profile_points) = 'array'
      and jsonb_array_length(d.profile_points) >= 2
    order by s.race_id, s.stage_number
  loop
    v_target_count :=
      case
        when v_stage.race_name = 'Tour of Cuba' then
          case v_stage.stage_number
            when 1 then 3
            when 2 then 5
            when 3 then 4
            when 4 then 2
            when 5 then 3
            else 2
          end
        when v_stage.terrain_type = 'flat' and v_stage.distance_km < 95 then
          2 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 2)
        when v_stage.terrain_type = 'flat' and v_stage.distance_km < 140 then
          3 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 2)
        when v_stage.terrain_type = 'flat' and v_stage.distance_km < 180 then
          3 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 3)
        when v_stage.terrain_type = 'flat' then
          4 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 2)
        when v_stage.terrain_type = 'mountain' then
          2 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 2)
        when v_stage.distance_km < 110 then
          2 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 2)
        when v_stage.distance_km < 160 then
          2 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 3)
        else
          3 + mod(v_stage.stage_number + floor(v_stage.distance_km)::integer, 2)
      end;

    with raw_points as (
      select
        ordinality::integer as ord,
        (point ->> 'km')::numeric as km,
        coalesce(
          nullif(point ->> 'elevation', '')::numeric,
          nullif(point ->> 'elevation_m', '')::numeric
        ) as elevation
      from jsonb_array_elements(v_stage.profile_points)
        with ordinality as p(point, ordinality)
    ),
    profile_points as (
      select
        raw.*,
        lag(raw.km) over (order by raw.ord) as previous_km,
        lag(raw.elevation) over (order by raw.ord) as previous_elevation,
        min(raw.elevation) over () as min_elevation,
        max(raw.elevation) over () as max_elevation
      from raw_points raw
    ),
    candidates as (
      select
        round((previous_km + km) / 2.0, 1) as sprint_km
      from profile_points
      where previous_km is not null
        and km > previous_km
        and (elevation - previous_elevation)
          / nullif((km - previous_km) * 10.0, 0)
          between -0.50 and 1.00
        and (previous_km + km) / 2.0 >= v_stage.distance_km * 0.06
        and (previous_km + km) / 2.0 <= v_stage.distance_km * 0.94
        and (
          v_stage.terrain_type = 'flat'
          or (
            v_stage.finish_type in ('uphill_finish', 'summit_finish')
            and (previous_elevation + elevation) / 2.0
              <= min_elevation + (max_elevation - min_elevation) * 0.55
          )
          or (
            v_stage.terrain_type = 'mountain'
            and (previous_elevation + elevation) / 2.0
              <= min_elevation + (max_elevation - min_elevation) * 0.65
          )
          or (
            v_stage.terrain_type = 'hilly'
            and (previous_elevation + elevation) / 2.0
              <= min_elevation + (max_elevation - min_elevation) * 0.75
          )
        )
        and not exists (
          select 1
          from jsonb_array_elements(v_stage.climbs) climb
          where nullif(climb ->> 'km', '') is not null
            and abs(
              (previous_km + km) / 2.0
              - nullif(climb ->> 'km', '')::numeric
            ) < 8.0
        )
    )
    select count(*)
    into v_candidate_count
    from candidates;

    v_actual_count := least(v_target_count, v_candidate_count);

    if v_actual_count <= 0 then
      v_new_sprints := '[]'::jsonb;
    else
      with raw_points as (
        select
          ordinality::integer as ord,
          (point ->> 'km')::numeric as km,
          coalesce(
            nullif(point ->> 'elevation', '')::numeric,
            nullif(point ->> 'elevation_m', '')::numeric
          ) as elevation
        from jsonb_array_elements(v_stage.profile_points)
          with ordinality as p(point, ordinality)
      ),
      profile_points as (
        select
          raw.*,
          lag(raw.km) over (order by raw.ord) as previous_km,
          lag(raw.elevation) over (order by raw.ord) as previous_elevation,
          min(raw.elevation) over () as min_elevation,
          max(raw.elevation) over () as max_elevation
        from raw_points raw
      ),
      candidates as (
        select
          round((previous_km + km) / 2.0, 1) as sprint_km,
          abs(
            (elevation - previous_elevation)
            / nullif((km - previous_km) * 10.0, 0)
          ) as abs_slope
        from profile_points
        where previous_km is not null
          and km > previous_km
          and (elevation - previous_elevation)
            / nullif((km - previous_km) * 10.0, 0)
            between -0.50 and 1.00
          and (previous_km + km) / 2.0 >= v_stage.distance_km * 0.06
          and (previous_km + km) / 2.0 <= v_stage.distance_km * 0.94
          and (
            v_stage.terrain_type = 'flat'
            or (
              v_stage.finish_type in ('uphill_finish', 'summit_finish')
              and (previous_elevation + elevation) / 2.0
                <= min_elevation + (max_elevation - min_elevation) * 0.55
            )
            or (
              v_stage.terrain_type = 'mountain'
              and (previous_elevation + elevation) / 2.0
                <= min_elevation + (max_elevation - min_elevation) * 0.65
            )
            or (
              v_stage.terrain_type = 'hilly'
              and (previous_elevation + elevation) / 2.0
                <= min_elevation + (max_elevation - min_elevation) * 0.75
            )
          )
          and not exists (
            select 1
            from jsonb_array_elements(v_stage.climbs) climb
            where nullif(climb ->> 'km', '') is not null
              and abs(
                (previous_km + km) / 2.0
                - nullif(climb ->> 'km', '')::numeric
              ) < 8.0
          )
      ),
      bucketed as (
        select
          candidates.*,
          ntile(v_actual_count) over (order by sprint_km) as bucket
        from candidates
      ),
      picked as (
        select distinct on (bucket)
          bucket,
          sprint_km,
          abs_slope
        from bucketed
        order by
          bucket,
          abs(
            sprint_km
            - v_stage.distance_km * bucket / (v_actual_count + 1.0)
          ),
          abs_slope,
          sprint_km
      ),
      numbered as (
        select
          sprint_km,
          row_number() over (order by sprint_km)::integer as sprint_number
        from picked
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'number', sprint_number,
            'km', sprint_km,
            'name', 'Intermediate sprint ' || sprint_number,
            'points', 'standard',
            'points_scheme',
              case
                when sprint_number = 1
                  then jsonb_build_array(12, 8, 5, 3, 1)
                else jsonb_build_array(10, 6, 4, 2, 1)
              end,
            'time_bonus_seconds', jsonb_build_array(3, 2, 1)
          )
          order by sprint_km
        ),
        '[]'::jsonb
      )
      into v_new_sprints
      from numbered;
    end if;

    with marker_rows as (
      select
        0::numeric as km,
        0::integer as marker_order,
        jsonb_build_object(
          'km', 0,
          'name', v_stage.start_name,
          'type', 'start',
          'label', 'Start'
        ) as marker

      union all

      select
        nullif(sprint ->> 'km', '')::numeric,
        10::integer,
        jsonb_build_object(
          'km', nullif(sprint ->> 'km', '')::numeric,
          'name', coalesce(nullif(sprint ->> 'name', ''), 'Intermediate sprint'),
          'type', 'sprint',
          'label', 'Sprint'
        )
      from jsonb_array_elements(v_new_sprints) sprint
      where nullif(sprint ->> 'km', '') is not null

      union all

      select
        nullif(climb ->> 'km', '')::numeric,
        20::integer,
        jsonb_build_object(
          'km', nullif(climb ->> 'km', '')::numeric,
          'name', coalesce(nullif(climb ->> 'name', ''), 'KOM'),
          'type', 'kom',
          'label', coalesce(nullif(climb ->> 'category', ''), 'KOM'),
          'category', nullif(climb ->> 'category', '')
        )
      from jsonb_array_elements(v_stage.climbs) climb
      where nullif(climb ->> 'km', '') is not null
        and abs(
          nullif(climb ->> 'km', '')::numeric - v_stage.distance_km
        ) > 0.2

      union all

      select
        v_stage.distance_km,
        30::integer,
        jsonb_build_object(
          'km', v_stage.distance_km,
          'name', v_stage.finish_name,
          'type', 'finish',
          'label', 'Finish'
        )
    )
    select coalesce(
      jsonb_agg(marker order by km, marker_order),
      '[]'::jsonb
    )
    into v_route_markers
    from marker_rows;

    update public.race_stages
    set
      intermediate_sprints_json = v_new_sprints,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'sprint_layout_version', 'hidden_reserve_v2',
          'sprint_target_count', v_target_count,
          'sprint_actual_count', jsonb_array_length(v_new_sprints),
          'sprint_placement_rule', 'gentle_lowland_no_climb_or_descent'
        )
    where id = v_stage.stage_id;

    update public.race_stage_profile_details
    set
      intermediate_sprints = v_new_sprints,
      route_markers = v_route_markers,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'sprint_layout_version', 'hidden_reserve_v2',
          'sprint_target_count', v_target_count,
          'sprint_actual_count', jsonb_array_length(v_new_sprints),
          'sprint_placement_rule', 'gentle_lowland_no_climb_or_descent'
        )
    where stage_id = v_stage.stage_id;

    perform public.sync_race_stage_points_from_stage_json_v1(
      v_stage.stage_id,
      true
    );
  end loop;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.race_reserve_pool rp
    join public.race_stages s on s.race_id = rp.race_id
    where rp.active = true
      and jsonb_array_length(coalesce(s.intermediate_sprints_json, '[]'::jsonb)) > 5
  ) then
    raise exception 'Hidden reserve sprint layout produced more than five sprints on a stage';
  end if;
end
$$;

commit;
