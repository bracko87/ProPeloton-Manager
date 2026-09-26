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

  if e.route_status='missing_route' then
    raise exception 'No eligible national championship road stage exists for %',e.country_code;
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
    v_date:=e.qualification_date;
    v_name:=v_country_name||' National Championship Qualification — Heat '||h.heat_number;
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
    profile_image_url,description,metadata,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at
  )
  values(
    v_name,
    case when p_event_type='final'
      then e.country_code||' NC'
      else e.country_code||' NCQ H'||h.heat_number
    end,
    v_date,v_date,e.country_code,v_host_city,
    case when p_event_type='final' then 'NC' else 'NCQ' end,
    'one_day',false,1,'scheduled',
    src.profile_image_url,
    case when p_event_type='final'
      then 'National road championship on an existing host-country road route.'
      else 'National championship qualification heat on an existing host-country road route.'
    end,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'heat_id',case when p_event_type='qualification' then h.id else null end,
      'country_code',e.country_code,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
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
      else 'Qualification Heat '||h.heat_number
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
    src.profile_image_url,
    coalesce(src.rules_snapshot,'{}'::jsonb),
    coalesce(src.metadata,'{}'::jsonb)||jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'actual_host_country_code',e.country_code
    ),
    coalesce(src.start_city_name,src.start_city),
    coalesce(src.finish_city_name,src.finish_city),
    src.profile_type,
    'National Championship route cloned from existing stage '||v_source_stage_id::text,
    coalesce(src.intermediate_sprints_json,'[]'::jsonb),
    coalesce(src.mountain_climbs_json,'[]'::jsonb),
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
    coalesce(nullif(spd.route_label,''),v_host_city),
    spd.stage_summary,
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
    coalesce(spd.route_markers,'[]'::jsonb),
    coalesce(spd.intermediate_sprints,src.intermediate_sprints_json,'[]'::jsonb),
    coalesce(spd.mountain_climbs,src.mountain_climbs_json,'[]'::jsonb),
    coalesce(spd.metadata,'{}'::jsonb)||jsonb_build_object(
      'national_championship',true,
      'source_stage_id',v_source_stage_id,
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
      v_stage_id,v_race_id,v_name,v_host_city,
      'National Championship route cloned from an existing host-country stage.',
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
      '[]'::jsonb,
      '[]'::jsonb,
      coalesce(src.intermediate_sprints_json,'[]'::jsonb),
      coalesce(src.mountain_climbs_json,'[]'::jsonb),
      jsonb_build_object(
        'national_championship',true,
        'source_stage_id',v_source_stage_id,
        'cloned_for_event_type',p_event_type
      ),
      (select weather_snapshot from public.race_stages where id=v_stage_id)
    );
  end if;

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
$function$;
