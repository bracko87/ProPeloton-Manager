-- Repair all hidden reserve road-stage gates so chart markers, stage JSON
-- and canonical race calculation points share the same kilometres.
--
-- Rules:
--   * intermediate sprints must sit on <= 2% profile segments;
--   * KOM points must sit on authoritative profile summits;
--   * invalid KOMs with no real summit are removed rather than left on slopes;
--   * route_markers are rebuilt from the repaired sprint/KOM definitions;
--   * race_stage_points are force-synchronized from race_stages JSON.
--
-- Applies to every active race in race_reserve_pool, including the older
-- Bahamas/Bolivia/Cambodia/etc. reserve races as well as the newer 45-country set.

begin;

do $$
declare
  v_stage record;
  v_old_sprints jsonb;
  v_old_climbs jsonb;
  v_new_sprints jsonb;
  v_new_climbs jsonb;
  v_route_markers jsonb;
  v_fallback_peak record;
begin
  for v_stage in
    select
      s.id as stage_id,
      s.race_id,
      s.stage_number,
      s.distance_km::numeric as distance_km,
      lower(coalesce(s.terrain_type, 'flat')) as terrain_type,
      lower(coalesce(s.finish_type, 'flat_finish')) as finish_type,
      coalesce(nullif(s.start_city_name, ''), nullif(s.start_city, ''), 'Start') as start_name,
      coalesce(nullif(s.finish_city_name, ''), nullif(s.finish_city, ''), 'Finish') as finish_name,
      coalesce(s.intermediate_sprints_json, '[]'::jsonb) as intermediate_sprints_json,
      coalesce(s.mountain_climbs_json, '[]'::jsonb) as mountain_climbs_json,
      d.profile_points
    from public.race_reserve_pool rp
    join public.race_stages s
      on s.race_id = rp.race_id
    join public.race_stage_profile_details d
      on d.stage_id = s.id
    where rp.active = true
      and lower(coalesce(s.stage_format, 'road_race')) = 'road_race'
      and jsonb_typeof(d.profile_points) = 'array'
      and jsonb_array_length(d.profile_points) >= 2
    order by s.race_id, s.stage_number
  loop
    v_old_sprints := v_stage.intermediate_sprints_json;
    v_old_climbs := v_stage.mountain_climbs_json;

    /*
     * 1) Snap existing KOM definitions to the nearest real summit in the
     * authoritative profile. A summit is an interior local maximum. An uphill
     * or summit finish can also be a summit when the final anchor is not lower
     * than the previous anchor.
     */
    with raw_points as (
      select
        ordinality::integer as ord,
        jsonb_array_length(v_stage.profile_points) as point_count,
        (point ->> 'km')::numeric as km,
        coalesce(
          nullif(point ->> 'elevation', '')::numeric,
          nullif(point ->> 'elevation_m', '')::numeric
        ) as elevation
      from jsonb_array_elements(v_stage.profile_points)
        with ordinality as p(point, ordinality)
      where nullif(point ->> 'km', '') is not null
        and (
          nullif(point ->> 'elevation', '') is not null
          or nullif(point ->> 'elevation_m', '') is not null
        )
    ),
    profile_points as (
      select
        raw.*,
        lag(raw.elevation) over (order by raw.ord) as previous_elevation,
        lead(raw.elevation) over (order by raw.ord) as next_elevation
      from raw_points raw
    ),
    summit_candidates as (
      select
        km,
        elevation
      from profile_points
      where (
        previous_elevation is not null
        and next_elevation is not null
        and elevation >= previous_elevation
        and elevation >= next_elevation
        and (
          elevation > previous_elevation
          or elevation > next_elevation
        )
      )
      or (
        ord = point_count
        and v_stage.finish_type in ('uphill_finish', 'summit_finish')
        and previous_elevation is not null
        and elevation >= previous_elevation
      )
    ),
    climb_items as (
      select
        item,
        ordinality::integer as ord,
        nullif(item ->> 'km', '')::numeric as old_km
      from jsonb_array_elements(v_old_climbs)
        with ordinality as c(item, ordinality)
    ),
    mapped_climbs as (
      select
        climb.item,
        climb.ord,
        climb.old_km,
        (
          select summit.km
          from summit_candidates summit
          order by
            abs(summit.km - coalesce(climb.old_km, summit.km)),
            summit.elevation desc,
            summit.km
          limit 1
        ) as new_km
      from climb_items climb
    ),
    unique_climbs as (
      select distinct on (mapped.new_km)
        mapped.item,
        mapped.ord,
        mapped.old_km,
        mapped.new_km
      from mapped_climbs mapped
      where mapped.new_km is not null
      order by
        mapped.new_km,
        abs(coalesce(mapped.old_km, mapped.new_km) - mapped.new_km),
        mapped.ord
    ),
    numbered_climbs as (
      select
        unique_climbs.*,
        row_number() over (order by unique_climbs.new_km, unique_climbs.ord) as new_number
      from unique_climbs
    )
    select coalesce(
      jsonb_agg(
        numbered.item
        || jsonb_build_object(
          'km', round(numbered.new_km, 1),
          'number', numbered.new_number,
          'is_finish_climb',
            abs(numbered.new_km - v_stage.distance_km) <= 0.2
        )
        order by numbered.new_km, numbered.new_number
      ),
      '[]'::jsonb
    )
    into v_new_climbs
    from numbered_climbs numbered;

    /*
     * If a hilly/mountain road stage had no configured KOM at all, only add
     * one when the profile has a meaningful summit (>=20 m above both adjacent
     * anchors). We do not manufacture KOMs on monotonic or effectively flat
     * profiles.
     */
    if jsonb_array_length(v_new_climbs) = 0
       and jsonb_array_length(v_old_climbs) = 0
       and v_stage.terrain_type in ('hilly', 'mountain')
    then
      v_fallback_peak := null;

      with raw_points as (
        select
          ordinality::integer as ord,
          jsonb_array_length(v_stage.profile_points) as point_count,
          (point ->> 'km')::numeric as km,
          coalesce(
            nullif(point ->> 'elevation', '')::numeric,
            nullif(point ->> 'elevation_m', '')::numeric
          ) as elevation
        from jsonb_array_elements(v_stage.profile_points)
          with ordinality as p(point, ordinality)
        where nullif(point ->> 'km', '') is not null
          and (
            nullif(point ->> 'elevation', '') is not null
            or nullif(point ->> 'elevation_m', '') is not null
          )
      ),
      profile_points as (
        select
          raw.*,
          lag(raw.elevation) over (order by raw.ord) as previous_elevation,
          lead(raw.elevation) over (order by raw.ord) as next_elevation
        from raw_points raw
      )
      select
        km,
        elevation,
        greatest(
          0,
          elevation - greatest(previous_elevation, next_elevation)
        ) as prominence
      into v_fallback_peak
      from profile_points
      where previous_elevation is not null
        and next_elevation is not null
        and elevation >= previous_elevation
        and elevation >= next_elevation
        and (
          elevation > previous_elevation
          or elevation > next_elevation
        )
        and elevation - greatest(previous_elevation, next_elevation) >= 20
      order by
        elevation - greatest(previous_elevation, next_elevation) desc,
        elevation desc,
        km
      limit 1;

      if v_fallback_peak.km is not null then
        v_new_climbs := jsonb_build_array(
          jsonb_build_object(
            'number', 1,
            'km', round(v_fallback_peak.km::numeric, 1),
            'name', v_stage.finish_name || ' summit',
            'category',
              case
                when v_stage.terrain_type = 'mountain' then 'Cat 2'
                else 'Cat 3'
              end,
            'length_km',
              case
                when v_stage.terrain_type = 'mountain' then 8.0
                else 5.0
              end,
            'avg_gradient',
              case
                when v_stage.terrain_type = 'mountain' then 5.2
                else 4.5
              end,
            'points_scheme',
              case
                when v_stage.terrain_type = 'mountain'
                  then jsonb_build_array(10, 6, 4, 2, 1)
                else jsonb_build_array(5, 3, 2, 1)
              end,
            'time_bonus_seconds', '[]'::jsonb,
            'is_finish_climb', false
          )
        );
      end if;
    end if;

    /*
     * 2) Keep already-correct sprint kilometres. Any sprint currently sitting
     * on >2% terrain (or within 4 km of a repaired KOM) is moved to the nearest
     * <=2% profile segment midpoint. Every hidden road stage currently has at
     * least one such flat segment.
     */
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
      where nullif(point ->> 'km', '') is not null
        and (
          nullif(point ->> 'elevation', '') is not null
          or nullif(point ->> 'elevation_m', '') is not null
        )
    ),
    profile_points as (
      select
        raw.*,
        lag(raw.km) over (order by raw.ord) as previous_km,
        lag(raw.elevation) over (order by raw.ord) as previous_elevation
      from raw_points raw
    ),
    flat_segments as (
      select
        previous_km as start_km,
        km as end_km,
        round((previous_km + km) / 2.0, 1) as midpoint_km,
        abs(elevation - previous_elevation)
          / nullif((km - previous_km) * 10.0, 0) as slope_pct
      from profile_points
      where previous_km is not null
        and km > previous_km
        and abs(elevation - previous_elevation)
          / nullif((km - previous_km) * 10.0, 0) <= 2.0
        and (previous_km + km) / 2.0 >= v_stage.distance_km * 0.06
        and (previous_km + km) / 2.0 <= v_stage.distance_km * 0.94
    ),
    sprint_items as (
      select
        item,
        ordinality::integer as ord,
        nullif(item ->> 'km', '')::numeric as old_km
      from jsonb_array_elements(v_old_sprints)
        with ordinality as s(item, ordinality)
    ),
    mapped_sprints as (
      select
        sprint.item,
        sprint.ord,
        sprint.old_km,
        coalesce(
          case
            when sprint.old_km is not null
             and exists (
               select 1
               from flat_segments flat
               where sprint.old_km between flat.start_km and flat.end_km
             )
             and not exists (
               select 1
               from jsonb_array_elements(v_new_climbs) climb
               where abs(
                 sprint.old_km - nullif(climb ->> 'km', '')::numeric
               ) < 4.0
             )
            then round(sprint.old_km, 1)
            else null
          end,
          (
            select flat.midpoint_km
            from flat_segments flat
            where not exists (
              select 1
              from jsonb_array_elements(v_new_climbs) climb
              where abs(
                flat.midpoint_km - nullif(climb ->> 'km', '')::numeric
              ) < 4.0
            )
            order by
              abs(flat.midpoint_km - coalesce(
                sprint.old_km,
                v_stage.distance_km * sprint.ord
                  / (jsonb_array_length(v_old_sprints) + 1.0)
              )),
              flat.slope_pct,
              flat.midpoint_km
            limit 1
          ),
          (
            select flat.midpoint_km
            from flat_segments flat
            order by
              abs(flat.midpoint_km - coalesce(
                sprint.old_km,
                v_stage.distance_km * sprint.ord
                  / (jsonb_array_length(v_old_sprints) + 1.0)
              )),
              flat.slope_pct,
              flat.midpoint_km
            limit 1
          ),
          round(sprint.old_km, 1)
        ) as new_km
      from sprint_items sprint
    ),
    unique_sprints as (
      select distinct on (mapped.new_km)
        mapped.item,
        mapped.ord,
        mapped.old_km,
        mapped.new_km
      from mapped_sprints mapped
      where mapped.new_km is not null
      order by
        mapped.new_km,
        abs(coalesce(mapped.old_km, mapped.new_km) - mapped.new_km),
        mapped.ord
    ),
    numbered_sprints as (
      select
        unique_sprints.*,
        row_number() over (order by unique_sprints.new_km, unique_sprints.ord) as new_number
      from unique_sprints
    )
    select coalesce(
      jsonb_agg(
        numbered.item
        || jsonb_build_object(
          'km', round(numbered.new_km, 1),
          'number', numbered.new_number
        )
        order by numbered.new_km, numbered.new_number
      ),
      '[]'::jsonb
    )
    into v_new_sprints
    from numbered_sprints numbered;

    /*
     * 3) Rebuild the chart markers from the authoritative repaired definitions.
     * Finish KOMs remain in mountain_climbs/race_stage_points but are not drawn
     * as a second marker on top of the Finish badge.
     */
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
        nullif(sprint ->> 'km', '')::numeric as km,
        10::integer as marker_order,
        jsonb_build_object(
          'km', nullif(sprint ->> 'km', '')::numeric,
          'name', coalesce(
            nullif(sprint ->> 'name', ''),
            'Intermediate sprint'
          ),
          'type', 'sprint',
          'label', 'Sprint'
        ) as marker
      from jsonb_array_elements(v_new_sprints) sprint
      where nullif(sprint ->> 'km', '') is not null

      union all

      select
        nullif(climb ->> 'km', '')::numeric as km,
        20::integer as marker_order,
        jsonb_build_object(
          'km', nullif(climb ->> 'km', '')::numeric,
          'name', coalesce(
            nullif(climb ->> 'name', ''),
            'KOM'
          ),
          'type', 'kom',
          'label', coalesce(
            nullif(climb ->> 'category', ''),
            'KOM'
          ),
          'category', nullif(climb ->> 'category', '')
        ) as marker
      from jsonb_array_elements(v_new_climbs) climb
      where nullif(climb ->> 'km', '') is not null
        and abs(
          nullif(climb ->> 'km', '')::numeric - v_stage.distance_km
        ) > 0.2

      union all

      select
        v_stage.distance_km as km,
        30::integer as marker_order,
        jsonb_build_object(
          'km', v_stage.distance_km,
          'name', v_stage.finish_name,
          'type', 'finish',
          'label', 'Finish'
        ) as marker
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
      mountain_climbs_json = v_new_climbs,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gate_alignment', 'summit_and_flat_v1',
          'gate_alignment_source', 'hidden_reserve_full_audit'
        )
    where id = v_stage.stage_id;

    update public.race_stage_profile_details
    set
      intermediate_sprints = v_new_sprints,
      mountain_climbs = v_new_climbs,
      route_markers = v_route_markers,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'gate_alignment', 'summit_and_flat_v1',
          'gate_alignment_source', 'hidden_reserve_full_audit'
        )
    where stage_id = v_stage.stage_id;

    perform public.sync_race_stage_points_from_stage_json_v1(
      v_stage.stage_id,
      true
    );
  end loop;
end
$$;

commit;
