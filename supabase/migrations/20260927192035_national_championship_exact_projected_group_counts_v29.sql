CREATE OR REPLACE FUNCTION public.get_national_championship_event_page_v1(p_edition_id uuid, p_event_type text, p_heat_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  v_user_country text;
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  s public.race_stages%rowtype;
  v_source_stage_id uuid;
  v_race_id uuid;
  v_event_date date;
  v_country_name text;
  v_field_count integer:=0;
  v_qualifying_places integer:=0;
  v_profile_points jsonb:='[]'::jsonb;
  v_route_label text;
  v_summary text;
  v_start_time text;
  v_expected_temp numeric;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select upper(c.country_code)
  into v_user_country
  from public.clubs c
  where c.owner_user_id=v_user
    and c.parent_club_id is null
  order by c.created_at,c.id
  limit 1;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id
    and country_code=v_user_country
    and discipline='road'
  limit 1;

  if e.id is null then
    raise exception 'National Championship event is not available for your club country';
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=e.country_code
  limit 1;
  v_country_name:=coalesce(v_country_name,e.country_code);

  if p_event_type='qualification' then
    if p_heat_number is null or p_heat_number<1 then
      raise exception 'Qualification group number is required';
    end if;

    select * into h
    from public.national_championship_heats
    where edition_id=e.id and heat_number=p_heat_number
    limit 1;

    v_source_stage_id:=e.qualification_source_stage_id;
    v_event_date:=coalesce(h.qualification_date,e.qualification_date+(p_heat_number-1));
    v_race_id:=h.race_id;
    v_qualifying_places:=case
      when h.id is not null then h.qualifying_places
      when coalesce(e.qualification_heat_count,0)>0
        then floor(e.final_field_size::numeric/e.qualification_heat_count)::int
          +case
            when p_heat_number<=mod(e.final_field_size,e.qualification_heat_count) then 1
            else 0
          end
      else 0
    end;
    if h.id is not null and h.assigned_count>0 then
      v_field_count:=h.assigned_count;
    elsif coalesce(e.qualification_heat_count,0)>0 then
      select count(*)::int
      into v_field_count
      from generate_series(1,coalesce(e.eligible_count,0)) g(national_rank)
      where case
        when (floor(((g.national_rank-1)::numeric)/e.qualification_heat_count)::int % 2)=0
          then ((g.national_rank-1)%e.qualification_heat_count)+1
        else e.qualification_heat_count-((g.national_rank-1)%e.qualification_heat_count)
      end=p_heat_number;
    else
      v_field_count:=0;
    end if;
  elsif p_event_type='final' then
    v_source_stage_id:=e.final_source_stage_id;
    v_event_date:=e.final_date;
    v_race_id:=e.final_race_id;
    v_qualifying_places:=0;

    select count(*)::int into v_field_count
    from public.national_championship_entries en
    where en.edition_id=e.id
      and en.entry_status in ('direct_qualified','qualified','finalist')
      and en.participation_decision<>'rejected';

    if v_field_count=0 then
      v_field_count:=least(coalesce(e.eligible_count,0),e.final_field_size);
    end if;
  else
    raise exception 'Invalid National Championship event type';
  end if;

  if v_source_stage_id is null then
    raise exception 'National Championship host route is not ready';
  end if;

  select * into s
  from public.race_stages
  where id=v_source_stage_id;

  if s.id is null then
    raise exception 'National Championship host stage not found';
  end if;

  select
    coalesce(spd.profile_points,'[]'::jsonb),
    coalesce(
      nullif(spd.route_label,''),
      coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start')
        ||' → '||
      coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish')
    ),
    spd.stage_summary
  into v_profile_points,v_route_label,v_summary
  from public.race_stage_profile_details spd
  where spd.stage_id=s.id
  limit 1;

  v_profile_points:=coalesce(
    v_profile_points,
    s.metadata #> '{route_profile_v1,profile_points}',
    s.metadata->'profile_points',
    '[]'::jsonb
  );

  v_route_label:=coalesce(
    v_route_label,
    coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start')
      ||' → '||
    coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish')
  );

  if v_race_id is not null then
    select r.planned_start_time_label
    into v_start_time
    from public.races r
    where r.id=v_race_id;
  end if;

  select w.avg_max_temp_c
  into v_expected_temp
  from public.country_weather_weekly_normals w
  where upper(w.country_code)=coalesce(e.climate_source_country_code,e.country_code)
    and w.week_of_year=extract(week from v_event_date)::int
  limit 1;

  return jsonb_build_object(
    'edition_id',e.id,
    'season_number',e.season_number,
    'country_code',e.country_code,
    'country_name',v_country_name,
    'flag_url','https://flagcdn.com/w320/'||lower(e.country_code)||'.png',
    'event_type',p_event_type,
    'heat_number',case when p_event_type='qualification' then p_heat_number else null end,
    'event_title',case
      when p_event_type='qualification'
        then v_country_name||' National Qualification Group '||p_heat_number
      else v_country_name||' National Championship Final'
    end,
    'event_date',v_event_date,
    'race_id',v_race_id,
    'status',case
      when p_event_type='qualification' then coalesce(h.status,'planned')
      else e.status
    end,
    'field_count',v_field_count,
    'qualifying_places',v_qualifying_places,
    'final_field_size',e.final_field_size,
    'qualification_window_start_date',e.qualification_window_start_date,
    'qualification_window_end_date',e.qualification_window_end_date,
    'final_date',e.final_date,
    'start_time_label',v_start_time,
    'expected_max_temp_c',v_expected_temp,
    'route',jsonb_build_object(
      'stage_id',s.id,
      'route_label',v_route_label,
      'start_city',coalesce(nullif(s.start_city_name,''),nullif(s.start_city,''),'Start'),
      'finish_city',coalesce(nullif(s.finish_city_name,''),nullif(s.finish_city,''),'Finish'),
      'distance_km',s.distance_km,
      'terrain_type',s.terrain_type,
      'profile_type',s.profile_type,
      'elevation_gain_m',s.elevation_gain_m,
      'flat_pct',s.flat_pct,
      'hilly_pct',s.hilly_pct,
      'mountain_pct',s.mountain_pct,
      'cobbled_pct',s.cobbled_pct,
      'summary',coalesce(v_summary,'National Championship host-country terrain profile.'),
      'profile_points',v_profile_points,
      'route_markers',jsonb_build_array(
        jsonb_build_object('type','start','km',0,'label','Start'),
        jsonb_build_object('type','finish','km',s.distance_km,'label','Finish')
      )
    )
  );
end;
$function$;
