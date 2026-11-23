-- A source route is cloned into a distinct event race and stage for each
-- qualification heat and final. Reusing its source ID across events is safe.
-- Prefer separate eligible routes when available, but do not require them.
CREATE OR REPLACE FUNCTION public.national_championship_schedule_plan_v2(p_country_code text, p_season_number integer, p_eligible_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_source text;
  v_year integer:=1999+p_season_number;
  v_plan jsonb;
  v_heat_count integer:=0;
  v_route_candidates integer:=0;
  q record;
  f record;
  v_q_start date;
  v_q_end date;
  v_final date;
  v_q_stage uuid;
  v_f_stage uuid;
  v_q_temp numeric;
  v_final_temp numeric;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_plan:=public.national_championship_population_plan_v1(p_eligible_count);
  v_heat_count:=coalesce((v_plan->>'heat_count')::integer,0);
  v_source:=public.national_championship_climate_source_country_v1(v_country);

  if v_source is null then
    return jsonb_build_object(
      'status','weather_data_unavailable',
      'climate_status','weather_data_unavailable',
      'route_status','pending',
      'country_code',v_country
    );
  end if;

  if not exists(
    select 1
    from public.country_weather_weekly_normals w
    where upper(w.country_code)=v_source
      and w.week_of_year between 16 and 48
      and w.avg_max_temp_c>cfg.climate_target_temp_c
  ) then
    return jsonb_build_object(
      'status','temperature_target_unavailable',
      'climate_status','temperature_target_unavailable',
      'route_status','pending',
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'expected_max_temp_c',(
        select max(w.avg_max_temp_c)
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between 16 and 48
      )
    );
  end if;

  select count(*)::int
  into v_route_candidates
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0)<=0
      or coalesce(s.elevation_gain_m,0)
         <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    );

  if v_route_candidates<1 then
    return jsonb_build_object(
      'status','route_unavailable',
      'climate_status','ready',
      'route_status','missing_route',
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'heat_count',v_heat_count
    );
  end if;

  if v_heat_count=0 then
    for f in
      select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between 16 and 48
        and w.avg_max_temp_c>cfg.climate_target_temp_c
      order by
        abs(w.avg_max_temp_c-26)
        +coalesce(w.p_heavy_rain,0)*8
        +coalesce(w.p_thunderstorm,0)*7
        +coalesce(w.p_rain,0)*2
        +greatest(coalesce(w.avg_wind_kmh,0)-20,0)*0.10
        +(abs(pg_catalog.hashtextextended(
          v_country||':'||p_season_number::text||':final:'||w.week_of_year::text,47
        ))%100)::numeric/10000.0,
        w.week_of_year
    loop
      v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
      v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'final',v_final,v_final,null
      );
      if v_f_stage is null then continue; end if;

      v_q_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'reserve-route',v_final,v_final,v_f_stage
      );
      if v_q_stage is null then v_q_stage:=v_f_stage; end if;

      return jsonb_build_object(
        'status','ready',
        'climate_status','ready',
        'route_status','ready',
        'country_code',v_country,
        'climate_source_country_code',v_source,
        'heat_count',0,
        'qualification_window_start_date',null,
        'qualification_window_end_date',null,
        'qualification_date',v_final-1,
        'final_window_start_date',v_final,
        'final_window_end_date',v_final,
        'final_date',v_final,
        'qualification_source_stage_id',v_q_stage,
        'final_source_stage_id',v_f_stage,
        'final_week_of_year',f.week_of_year,
        'week_of_year',f.week_of_year,
        'expected_max_temp_c',f.avg_max_temp_c,
        'final_expected_max_temp_c',f.avg_max_temp_c,
        'temperature_target_c',cfg.climate_target_temp_c
      );
    end loop;
  else
    for q in
      select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between 16 and 44
        and w.avg_max_temp_c>cfg.climate_target_temp_c
      order by
        abs(w.avg_max_temp_c-26)
        +coalesce(w.p_heavy_rain,0)*8
        +coalesce(w.p_thunderstorm,0)*7
        +coalesce(w.p_rain,0)*2
        +(abs(pg_catalog.hashtextextended(
          v_country||':'||p_season_number::text||':qualification:'||w.week_of_year::text,47
        ))%100)::numeric/10000.0,
        w.week_of_year
    loop
      v_q_start:=to_date(v_year::text||lpad(q.week_of_year::text,2,'0')||'1','IYYYIWID');
      v_q_end:=v_q_start+(v_heat_count-1);

      if exists(
        select 1
        from generate_series(v_q_start,v_q_end,interval '1 day') d(day_value)
        left join public.country_weather_weekly_normals w
          on upper(w.country_code)=v_source
         and w.week_of_year=extract(week from d.day_value)::int
        where w.week_of_year is null
           or w.avg_max_temp_c<=cfg.climate_target_temp_c
      ) then
        continue;
      end if;

      v_q_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'qualification',v_q_start,v_q_end,null
      );
      if v_q_stage is null then continue; end if;

      select min(w.avg_max_temp_c)
      into v_q_temp
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between q.week_of_year
            and q.week_of_year+ceil(greatest(v_heat_count-1,0)::numeric/7)::int;

      for f in
        select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between q.week_of_year+4 and least(q.week_of_year+8,48)
          and w.avg_max_temp_c>cfg.climate_target_temp_c
        order by
          abs(w.week_of_year-(q.week_of_year+6)),
          abs(w.avg_max_temp_c-26),
          w.week_of_year
      loop
        v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
        if v_final<=v_q_end then continue; end if;

        v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
          v_country,p_season_number,'final',v_final,v_final,v_q_stage
        );
        if v_f_stage is null then
          v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
            v_country,p_season_number,'final',v_final,v_final,null
          );
        end if;
        if v_f_stage is null then continue; end if;

        v_final_temp:=f.avg_max_temp_c;

        return jsonb_build_object(
          'status','ready',
          'climate_status','ready',
          'route_status','ready',
          'country_code',v_country,
          'climate_source_country_code',v_source,
          'heat_count',v_heat_count,
          'qualification_window_start_date',v_q_start,
          'qualification_window_end_date',v_q_end,
          'qualification_date',v_q_start,
          'final_window_start_date',v_final,
          'final_window_end_date',v_final,
          'final_date',v_final,
          'qualification_source_stage_id',v_q_stage,
          'final_source_stage_id',v_f_stage,
          'qualification_week_of_year',q.week_of_year,
          'final_week_of_year',f.week_of_year,
          'week_of_year',q.week_of_year,
          'expected_max_temp_c',v_q_temp,
          'final_expected_max_temp_c',v_final_temp,
          'temperature_target_c',cfg.climate_target_temp_c
        );
      end loop;

      for f in
        select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between q.week_of_year+3 and least(q.week_of_year+10,48)
          and w.avg_max_temp_c>cfg.climate_target_temp_c
        order by
          abs(w.week_of_year-(q.week_of_year+6)),
          abs(w.avg_max_temp_c-26),
          w.week_of_year
      loop
        v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
        if v_final<=v_q_end then continue; end if;

        v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
          v_country,p_season_number,'final-fallback',v_final,v_final,v_q_stage
        );
        if v_f_stage is null then
          v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
            v_country,p_season_number,'final',v_final,v_final,null
          );
        end if;
        if v_f_stage is null then continue; end if;

        return jsonb_build_object(
          'status','ready',
          'climate_status','ready',
          'route_status','ready',
          'country_code',v_country,
          'climate_source_country_code',v_source,
          'heat_count',v_heat_count,
          'qualification_window_start_date',v_q_start,
          'qualification_window_end_date',v_q_end,
          'qualification_date',v_q_start,
          'final_window_start_date',v_final,
          'final_window_end_date',v_final,
          'final_date',v_final,
          'qualification_source_stage_id',v_q_stage,
          'final_source_stage_id',v_f_stage,
          'qualification_week_of_year',q.week_of_year,
          'final_week_of_year',f.week_of_year,
          'week_of_year',q.week_of_year,
          'expected_max_temp_c',coalesce(v_q_temp,q.avg_max_temp_c),
          'final_expected_max_temp_c',f.avg_max_temp_c,
          'temperature_target_c',cfg.climate_target_temp_c
        );
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'status','route_calendar_conflict',
    'climate_status','ready',
    'route_status','calendar_conflict',
    'country_code',v_country,
    'climate_source_country_code',v_source,
    'heat_count',v_heat_count
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.national_championship_ensure_event_race_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  src public.race_stages%rowtype;
  v_source_stage_id uuid;
  v_source_race_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_date date;
  v_country_name text;
  v_name text;
  v_region text;
  v_hour integer;
  v_minute integer := 0;
  v_host_city text;
  v_daytime_temp numeric;
  v_avg_temp numeric;
  v_max_temp numeric;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.climate_status<>'ready' then
    raise exception 'National championship climate window is not ready for %',e.country_code;
  end if;

  if e.route_status<>'ready' then
    raise exception 'National championship requires a suitable road stage for % (route_status=%)',e.country_code,e.route_status;
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where c.code=e.country_code;
  v_country_name:=coalesce(v_country_name,e.country_code);

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where id=p_heat_id and edition_id=e.id
    for update;

    if h.id is null then
      raise exception 'Qualification heat not found: %',p_heat_id;
    end if;

    if h.race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'qualification',h.id);
      return h.race_id;
    end if;

    v_source_stage_id:=e.qualification_source_stage_id;
    v_date:=h.qualification_date;
    v_name:=v_country_name||' National Qualification — Group '||h.heat_number;
  elsif p_event_type='final' then
    if e.final_race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
      return e.final_race_id;
    end if;

    v_source_stage_id:=e.final_source_stage_id;
    v_date:=e.final_date;
    v_name:=v_country_name||' National Road Championship';
  else
    raise exception 'Invalid national championship event type: %',p_event_type;
  end if;

  if v_source_stage_id is null then
    raise exception 'No source stage selected for % national championship %',e.country_code,p_event_type;
  end if;

  select * into src
  from public.race_stages
  where id=v_source_stage_id;

  if src.id is null then
    raise exception 'Source stage not found: %',v_source_stage_id;
  end if;

  v_source_race_id:=src.race_id;
  v_host_city:=coalesce(
    nullif(src.host_city,''),
    nullif(src.start_city_name,''),
    nullif(src.start_city,''),
    nullif(src.finish_city_name,''),
    nullif(src.finish_city,''),
    v_country_name
  );

  v_region:=public.race_start_region_code_v1(e.country_code);
  v_hour:=case v_region
    when 'apac' then 7
    when 'americas' then 17
    else 13
  end;

  if p_event_type='qualification' then
    v_hour:=v_hour+((h.heat_number-1)/2);
    v_minute:=case when mod(h.heat_number-1,2)=0 then 0 else 30 end;
  end if;

  insert into public.races(
    name,short_name,start_date,end_date,country_code,host_city,
    category,race_type,is_stage_race,stage_count,status,
    profile_image_url,logo_url,description,metadata,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at
  )
  values(
    v_name,
    case when p_event_type='final'
      then e.country_code||' NC'
      else e.country_code||' NCQ G'||h.heat_number
    end,
    v_date,v_date,e.country_code,v_host_city,
    case when p_event_type='final' then 'NC' else 'NCQ' end,
    'one_day',false,1,'scheduled',
    null::text,
    'https://flagcdn.com/w320/'||lower(e.country_code)||'.png',
    case when p_event_type='final'
      then 'National road championship on an existing host-country road route.'
      else 'National championship qualification heat on an existing host-country road route.'
    end,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'heat_id',case when p_event_type='qualification' then h.id else null end,
      'heat_number',case when p_event_type='qualification' then h.heat_number else null end,
      'country_code',e.country_code,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'display_logo_mode','country_flag',
      'display_country_flag_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'climate_week_of_year',e.climate_week_of_year,
      'climate_expected_max_temp_c',e.climate_expected_max_temp_c,
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'individual_only',true,
      'team_commands_enabled',false,
      'staff_assets_supplies_locked',true,
      'team_cost_cash',0,
      'team_cost_coins',0
    ),
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now()
  )
  returning id into v_race_id;

  /*
   * Insert first with the climate-source country so the normal weather trigger
   * generates from a populated weekly-normal dataset. Then restore the real
   * host country and retain the climate source explicitly in the snapshot.
   */
  insert into public.race_stages(
    race_id,stage_number,stage_date,name,start_city,finish_city,host_city,
    host_country_code,distance_km,terrain_type,finish_type,is_summit_finish,
    flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
    profile_image_url,rules_snapshot,metadata,start_city_name,finish_city_name,
    profile_type,notes,intermediate_sprints_json,mountain_climbs_json,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at,stage_format
  )
  values(
    v_race_id,1,v_date,
    case when p_event_type='final'
      then 'National Championship'
      else v_country_name||' National Qualification Group '||h.heat_number
    end,
    coalesce(src.start_city,src.start_city_name),
    coalesce(src.finish_city,src.finish_city_name),
    v_host_city,
    coalesce(e.climate_source_country_code,e.country_code),
    src.distance_km,
    src.terrain_type,
    src.finish_type,
    coalesce(src.is_summit_finish,false),
    src.flat_pct,src.hilly_pct,src.mountain_pct,src.cobbled_pct,
    src.elevation_gain_m,
    null::text,
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'actual_host_country_code',e.country_code
    ),
    coalesce(src.start_city_name,src.start_city),
    coalesce(src.finish_city_name,src.finish_city),
    src.profile_type,
    'National Championship route using a host-country terrain profile.',
    '[]'::jsonb,
    '[]'::jsonb,
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now(),
    'road_race'
  )
  returning id into v_stage_id;

  select
    nullif(src2.weather_snapshot->>'avg_temp_c','')::numeric,
    nullif(src2.weather_snapshot->>'avg_max_temp_c','')::numeric
  into v_avg_temp,v_max_temp
  from public.race_stages src2
  where src2.id=v_stage_id;

  v_max_temp:=coalesce(v_max_temp,e.climate_expected_max_temp_c,20.1);
  v_avg_temp:=coalesce(v_avg_temp,greatest(20.1,v_max_temp-5));

  /*
   * These races start in the warm local daytime slot. Represent the start-time
   * temperature between the weekly mean and mean daily high, with a strict
   * >20 C floor only for championship races whose climate window passed.
   */
  v_daytime_temp:=greatest(
    20.1,
    least(
      greatest(v_max_temp,20.1),
      v_avg_temp+(greatest(v_max_temp-v_avg_temp,0)*0.72)
    )
  );

  update public.race_stages
  set
    host_country_code=e.country_code,
    weather_snapshot=coalesce(weather_snapshot,'{}'::jsonb)||jsonb_build_object(
      'country_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'national_championship',true,
      'warm_daytime_start',true,
      'race_start_temp_c',round(v_daytime_temp,1),
      'avg_temp_c',round(v_daytime_temp,1)
    ),
    updated_at=now()
  where id=v_stage_id;

  insert into public.race_stage_profile_details(
    stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
    distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
    profile_points,route_markers,intermediate_sprints,mountain_climbs,
    metadata,weather_snapshot
  )
  select
    v_stage_id,
    v_race_id,
    v_name,
    coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ||' → '||
    coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
    case
      when lower(coalesce(src.terrain_type,'flat'))='flat'
        then 'National Championship road race on a fast host-country terrain profile.'
      when lower(coalesce(src.terrain_type,'flat'))='hilly'
        then 'National Championship road race on a selective rolling host-country terrain profile.'
      else 'National Championship road race on a balanced host-country terrain profile.'
    end,
    null,
    coalesce(spd.distance_km,src.distance_km),
    coalesce(spd.elevation_gain_m,src.elevation_gain_m,0),
    coalesce(spd.terrain_type,src.terrain_type,'flat'),
    coalesce(spd.profile_type,src.profile_type,'sprinter'),
    coalesce(spd.terrain_split,jsonb_build_object(
      'flat',coalesce(src.flat_pct,0),
      'hilly',coalesce(src.hilly_pct,0),
      'mountain',coalesce(src.mountain_pct,0),
      'cobbled',coalesce(src.cobbled_pct,0)
    )),
    coalesce(spd.profile_points,'[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object(
        'km',0,
        'type','start',
        'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ),
      jsonb_build_object(
        'km',src.distance_km,
        'type','finish',
        'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'source_stage_id',v_source_stage_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'cloned_for_event_type',p_event_type
    ),
    (select weather_snapshot from public.race_stages where id=v_stage_id)
  from public.race_stage_profile_details spd
  where spd.stage_id=v_source_stage_id
  on conflict (stage_id) do nothing;

  if not exists(
    select 1 from public.race_stage_profile_details where stage_id=v_stage_id
  ) then
    insert into public.race_stage_profile_details(
      stage_id,race_id,stage_title,route_label,stage_summary,
      distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
      profile_points,route_markers,intermediate_sprints,mountain_climbs,
      metadata,weather_snapshot
    )
    values(
      v_stage_id,v_race_id,v_name,
      coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ||' → '||
      coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
      'National Championship road race using a host-country terrain profile.',
      coalesce(src.distance_km,0),
      coalesce(src.elevation_gain_m,0),
      coalesce(src.terrain_type,'flat'),
      coalesce(src.profile_type,'sprinter'),
      jsonb_build_object(
        'flat',coalesce(src.flat_pct,0),
        'hilly',coalesce(src.hilly_pct,0),
        'mountain',coalesce(src.mountain_pct,0),
        'cobbled',coalesce(src.cobbled_pct,0)
      ),
      coalesce(
        src.metadata #> '{route_profile_v1,profile_points}',
        src.metadata -> 'profile_points',
        '[]'::jsonb
      ),
      jsonb_build_array(
        jsonb_build_object(
          'km',0,
          'type','start',
          'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ),
        jsonb_build_object(
          'km',src.distance_km,
          'type','finish',
          'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_object(
        'national_championship',true,
        'source_stage_id',v_source_stage_id,
        'source_competition_identity_hidden',true,
        'only_start_and_finish_points',true,
        'cloned_for_event_type',p_event_type
      ),
      (select weather_snapshot from public.race_stages where id=v_stage_id)
    );
  end if;

  perform public.sync_race_stage_points_from_stage_json_v1(v_stage_id,true);

  delete from public.race_stage_points
  where stage_id=v_stage_id
    and upper(point_type) not in ('START','FINISH');

  update public.race_stage_points
  set name=case when upper(point_type)='START' then 'Start' else 'Finish' end,
      points_scheme='[]'::jsonb,
      time_bonus_seconds='[]'::jsonb,
      kom_category=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'national_championship',true,
        'only_start_and_finish_points',true
      )
  where stage_id=v_stage_id;

  insert into public.race_entry_rules(
    race_id,race_class_code,target_teams,min_teams,max_teams,
    min_riders_per_team,max_riders_per_team,
    applications_open_game_date,applications_close_game_date,
    applications_status,auto_close_when_full,allow_waitlist,
    prize_fund_cash,prize_fund_source,metadata,
    race_season_number,race_start_month_number,race_start_day_number,
    application_window_policy,rider_submission_deadline
  )
  values(
    v_race_id,'1.1',200,1,200,1,120,
    v_date-1,v_date-1,'closed',true,false,
    0,'manual_override',
    jsonb_build_object(
      'national_championship',true,
      'applications_disabled',true,
      'automatic_entry',true,
      'no_team_cost',true,
      'individual_riders_only',true
    ),
    e.season_number,
    extract(month from v_date)::int,
    extract(day from v_date)::int,
    'standard_90_3',
    v_date
  );

  if p_event_type='qualification' then
    update public.national_championship_heats
    set race_id=v_race_id,status='ready',updated_at=now()
    where id=h.id;
  else
    update public.national_championship_editions
    set final_race_id=v_race_id,updated_at=now()
    where id=e.id;
  end if;

  perform public.national_championship_sync_race_participants_v1(
    e.id,
    p_event_type,
    case when p_event_type='qualification' then h.id else null end
  );

  return v_race_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.national_championship_ensure_races_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h record;
  v_final uuid;
  v_heat_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status='planned' then
    return jsonb_build_object('status','waiting_for_ranking_freeze','edition_id',e.id);
  end if;

  if e.climate_status<>'ready' then
    return jsonb_build_object(
      'status','waiting_for_climate',
      'edition_id',e.id,
      'climate_status',e.climate_status
    );
  end if;

  if e.route_status<>'ready' then
    return jsonb_build_object(
      'status','waiting_for_route',
      'edition_id',e.id,
      'route_status',e.route_status
    );
  end if;

  for h in
    select id
    from public.national_championship_heats
    where edition_id=e.id
    order by heat_number
  loop
    perform public.national_championship_ensure_event_race_v1(
      e.id,'qualification',h.id
    );
    v_heat_count:=v_heat_count+1;
  end loop;

  v_final:=public.national_championship_ensure_event_race_v1(
    e.id,'final',null
  );

  update public.national_championship_editions
  set status=case
        when qualification_heat_count>0 then 'qualification_pending'
        else 'final_ready'
      end,
      updated_at=now()
  where id=e.id
    and status='ranking_frozen';

  return jsonb_build_object(
    'status','races_ready',
    'edition_id',e.id,
    'qualification_races',v_heat_count,
    'final_race_id',v_final,
    'qualification_source_stage_id',e.qualification_source_stage_id,
    'final_source_stage_id',e.final_source_stage_id
  );
end;
$function$
;
