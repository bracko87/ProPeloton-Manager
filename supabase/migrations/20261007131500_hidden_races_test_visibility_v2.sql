-- Temporary testing access for the Hidden Races page.
-- The underlying reserve-pool table remains protected by RLS; signed-in users
-- only receive the read-only projection returned by this RPC.

create or replace function public.get_hidden_reserve_races_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pool_id', p.id,
        'race_id', r.id,
        'name', r.name,
        'short_name', r.short_name,
        'country_code', coalesce(p.country_code,r.country_code),
        'country_name', c.name,
        'host_city', r.host_city,
        'category', r.category,
        'race_type', r.race_type,
        'stage_count', r.stage_count,
        'status', r.status,
        'active', p.active,
        'is_calendar_public', p.is_calendar_public,
        'pool_key', p.pool_key,
        'intended_uses', to_jsonb(p.intended_uses),
        'difficulty', p.difficulty,
        'pool_notes', p.notes,
        'start_date', r.start_date,
        'end_date', r.end_date,
        'stage_id', s.id,
        'stage_name', s.name,
        'stage_number', s.stage_number,
        'start_city', coalesce(s.start_city_name,s.start_city),
        'finish_city', coalesce(s.finish_city_name,s.finish_city),
        'distance_km', s.distance_km,
        'terrain_type', s.terrain_type,
        'profile_type', s.profile_type,
        'stage_format', s.stage_format,
        'elevation_gain_m', s.elevation_gain_m,
        'flat_pct', s.flat_pct,
        'hilly_pct', s.hilly_pct,
        'mountain_pct', s.mountain_pct,
        'route_label', d.route_label,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      order by coalesce(c.name,coalesce(p.country_code,r.country_code)), r.name, r.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.race_reserve_pool p
  join public.races r on r.id=p.race_id
  left join public.countries c
    on c.code=coalesce(p.country_code,r.country_code)
  left join lateral (
    select stage.*
    from public.race_stages stage
    where stage.race_id=r.id
    order by stage.stage_number
    limit 1
  ) s on true
  left join public.race_stage_profile_details d on d.stage_id=s.id;

  return v_result;
end;
$$;

revoke all on function public.get_hidden_reserve_races_v1() from public;
grant execute on function public.get_hidden_reserve_races_v1() to authenticated;
