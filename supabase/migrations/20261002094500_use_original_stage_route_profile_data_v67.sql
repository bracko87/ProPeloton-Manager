create or replace function public.get_race_stage_profile_detail_v1(p_stage_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with stage_row as (
    select
      rs.id,
      rs.race_id,
      rs.stage_number,
      rs.start_city,
      rs.finish_city,
      rs.weather_snapshot
    from public.race_stages rs
    where rs.id = p_stage_id
    limit 1
  ),
  detail_row as (
    select *
    from public.race_stage_profile_details d
    where d.stage_id = p_stage_id
    limit 1
  )
  select coalesce(
    (
      select jsonb_build_object(
        'stage_id', s.id,
        'race_id', s.race_id,
        'stage_number', s.stage_number,
        'start_city', s.start_city,
        'finish_city', s.finish_city,
        'stage_title', d.stage_title,
        'route_label', coalesce(
          nullif(btrim(d.metadata->>'route_label'),''),
          nullif(btrim(d.metadata->>'official_route_label'),''),
          d.route_label
        ),
        'stage_summary', d.stage_summary,
        'weather_summary', d.weather_summary,
        'weather_snapshot', coalesce(d.weather_snapshot, s.weather_snapshot, '{}'::jsonb),
        'distance_km', d.distance_km,
        'elevation_gain_m', d.elevation_gain_m,
        'terrain_type', d.terrain_type,
        'profile_type', d.profile_type,
        'terrain_split', d.terrain_split,
        'profile_points', d.profile_points,
        'route_markers', d.route_markers,
        'intermediate_sprints', d.intermediate_sprints,
        'mountain_climbs', d.mountain_climbs,
        'metadata', d.metadata,
        'has_profile', true
      )
      from stage_row s
      join detail_row d on d.stage_id = s.id
    ),
    (
      select jsonb_build_object(
        'stage_id', s.id,
        'race_id', s.race_id,
        'stage_number', s.stage_number,
        'start_city', s.start_city,
        'finish_city', s.finish_city,
        'weather_snapshot', coalesce(s.weather_snapshot, '{}'::jsonb),
        'has_profile', false,
        'profile_points', '[]'::jsonb,
        'route_markers', '[]'::jsonb,
        'intermediate_sprints', '[]'::jsonb,
        'mountain_climbs', '[]'::jsonb,
        'terrain_split', jsonb_build_object(
          'flat', 0,
          'hilly', 0,
          'mountain', 0,
          'cobbled', 0
        )
      )
      from stage_row s
    ),
    '{}'::jsonb
  );
$function$;

update public.race_stage_profile_details d
set route_label = coalesce(
      nullif(btrim(d.metadata->>'route_label'),''),
      nullif(btrim(d.metadata->>'official_route_label'),''),
      d.route_label
    ),
    updated_at = now()
where coalesce(d.metadata->>'nations_competition','false')='true'
   or d.metadata ? 'source_stage_id';