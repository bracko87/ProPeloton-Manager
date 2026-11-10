CREATE OR REPLACE FUNCTION public.get_race_release_detail_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb;
  v_stages jsonb;
begin
  select public.get_race_release_detail_v1_before_stage_date_patch(p_race_id)::jsonb
  into v_payload;

  select coalesce(
    jsonb_agg(
      stage_item.stage_json
      || jsonb_build_object(
        'stage_date', rs.stage_date,
        'date', rs.stage_date,
        'stage_date_display', to_char(rs.stage_date, 'Mon DD'),
        'game_date_display', 'S1 ' || to_char(rs.stage_date, 'MM.DD'),
        'is_rest_day_after_stage', rs.stage_number in (8, 16),
        'weather_v2_reference', public.get_race_stage_historical_weather_preview_v2(rs.id),
        'points', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', rsp.id,
                'stage_id', rsp.stage_id,
                'point_type', rsp.point_type,
                'km_from_start', rsp.km_from_start,
                'name', rsp.name,
                'kom_category', rsp.kom_category,
                'points_scheme', coalesce(rsp.points_scheme, '[]'::jsonb),
                'time_bonus_seconds', coalesce(rsp.time_bonus_seconds, '[]'::jsonb),
                'is_finish_point', rsp.is_finish_point,
                'sort_order', rsp.sort_order,
                'metadata', coalesce(rsp.metadata, '{}'::jsonb)
              )
              order by rsp.sort_order, rsp.km_from_start, rsp.id
            )
            from public.race_stage_points rsp
            where rsp.stage_id = rs.id
          ),
          '[]'::jsonb
        )
      )
      order by rs.stage_number
    ),
    '[]'::jsonb
  )
  into v_stages
  from jsonb_array_elements(coalesce(v_payload->'stages', '[]'::jsonb)) as stage_item(stage_json)
  join public.race_stages rs
    on rs.id = (stage_item.stage_json->>'id')::uuid
  where rs.race_id = p_race_id;

  return jsonb_set(
    v_payload,
    '{stages}',
    v_stages,
    true
  );
end;
$function$
