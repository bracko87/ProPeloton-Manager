-- Read-time normalization shared by primary, fallback and checkpointed race workers.
-- A time-trial timing gate is not a sprint competition. Never touch a stage
-- that actually has a sprint-scoring row or an explicit sprint catalogue.
create or replace function public.normalize_race_stage_route_markers_for_scoring_v1(
  p_stage_id uuid,p_route_markers jsonb
) returns jsonb
language sql stable security invoker
set search_path='public','pg_temp'
as $func$
select case
  when jsonb_typeof(p_route_markers) is distinct from 'array'
    then coalesce(p_route_markers,'[]'::jsonb)
  when exists(
    select 1 from public.race_stage_points p
    where p.stage_id=p_stage_id
      and p.point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
  ) or exists(
    select 1 from public.race_stages s
    where s.id=p_stage_id
      and jsonb_typeof(s.intermediate_sprints_json)='array'
      and jsonb_array_length(s.intermediate_sprints_json)>0
  ) or exists(
    select 1 from public.race_stage_profile_details d
    where d.stage_id=p_stage_id
      and jsonb_typeof(d.intermediate_sprints)='array'
      and jsonb_array_length(d.intermediate_sprints)>0
  ) then p_route_markers
  else coalesce((
    select jsonb_agg(
      case when lower(coalesce(m.value->>'type',m.value->>'point_type','')) like '%sprint%'
        and lower(btrim(coalesce(m.value->>'label',m.value->>'title',''))) ~
          '^((intermediate|mid[ -]?course)[[:space:]]+)?(time[ -]?(check|split|checkpoint)|timing[ -]?(gate|check|split|point))$'
        then jsonb_set(m.value,'{type}',to_jsonb('time_check'::text),true)
        else m.value end
      order by m.ordinality
    )
    from jsonb_array_elements(p_route_markers) with ordinality as m(value,ordinality)
  ),'[]'::jsonb)
end
$func$;

-- Read-only semantics; all existing profile readers retain execute access.
grant execute on function public.normalize_race_stage_route_markers_for_scoring_v1(uuid,jsonb)
  to anon,authenticated,service_role;

-- All engine entry points fetch profile through the same database function.

CREATE OR REPLACE FUNCTION public.get_race_stage_profile_detail_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with stage_row as (
    select
      rs.id,
      rs.race_id,
      rs.stage_number,
      rs.start_city,
      rs.finish_city,
      rs.weather_snapshot,
      rs.metadata
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
          nullif(btrim(s.metadata->>'route_label'),''),
          nullif(btrim(d.metadata->>'route_label'),''),
          nullif(btrim(d.metadata->>'official_route_label'),''),
          d.route_label
        ),
        'official_start_finish_location', nullif(btrim(s.metadata->>'official_start_finish_location'),''),
        'stage_summary', d.stage_summary,
        'weather_summary', d.weather_summary,
        'weather_snapshot', coalesce(d.weather_snapshot, s.weather_snapshot, '{}'::jsonb),
        'distance_km', d.distance_km,
        'elevation_gain_m', d.elevation_gain_m,
        'terrain_type', d.terrain_type,
        'profile_type', d.profile_type,
        'terrain_split', d.terrain_split,
        'profile_points', d.profile_points,
        'route_markers', public.normalize_race_stage_route_markers_for_scoring_v1(s.id,d.route_markers),
        'intermediate_sprints', d.intermediate_sprints,
        'mountain_climbs', d.mountain_climbs,
        'metadata', coalesce(d.metadata,'{}'::jsonb) || jsonb_build_object(
          'stage_metadata', coalesce(s.metadata,'{}'::jsonb)
        ),
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
        'route_label', nullif(btrim(s.metadata->>'route_label'),''),
        'official_start_finish_location', nullif(btrim(s.metadata->>'official_start_finish_location'),''),
        'weather_snapshot', coalesce(s.weather_snapshot, '{}'::jsonb),
        'metadata', coalesce(s.metadata,'{}'::jsonb),
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
$function$
;
