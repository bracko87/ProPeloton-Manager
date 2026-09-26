CREATE OR REPLACE FUNCTION public.freeze_national_championship_ranking_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  cfg public.national_championship_config%rowtype;
  v_eligible integer;
  v_direct integer;
  v_qualification_places integer;
  v_qualification_population integer;
  v_heat_count integer;
  v_heat integer;
  v_base_places integer;
  v_remainder integer;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status <> 'planned' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status',e.status,
      'already_processed',true
    );
  end if;

  if e.climate_status <> 'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_climate',
      'climate_status',e.climate_status
    );
  end if;

  if e.route_status<>'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_two_routes',
      'route_status',e.route_status
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id=true;

  insert into public.national_championship_ranking_snapshots(
    edition_id,rider_id,club_id,national_rank,raw_points,weighted_points,
    best_weighted_result,latest_result_date,overall_snapshot,
    rider_name_snapshot,country_code_snapshot
  )
  select
    e.id,p.rider_id,p.club_id,p.national_rank,p.raw_points,p.weighted_points,
    p.best_weighted_result,p.latest_result_date,p.overall,p.rider_name,p.country_code
  from public.preview_national_ranking_v1(e.country_code,e.ranking_snapshot_date) p;

  select count(*)::int into v_eligible
  from public.national_championship_ranking_snapshots
  where edition_id=e.id;

  if v_eligible <= cfg.final_field_size then
    v_direct:=v_eligible;
    v_qualification_places:=0;
    v_qualification_population:=0;
    v_heat_count:=0;
  else
    v_direct:=least(cfg.direct_qualifier_count,cfg.final_field_size);
    v_qualification_places:=cfg.final_field_size-v_direct;
    v_qualification_population:=v_eligible-v_direct;
    v_heat_count:=ceil(v_qualification_population::numeric/cfg.qualification_heat_max_size)::int;
  end if;

  if v_heat_count>0 then
    v_base_places:=floor(v_qualification_places::numeric/v_heat_count)::int;
    v_remainder:=mod(v_qualification_places,v_heat_count);

    for v_heat in 1..v_heat_count loop
      insert into public.national_championship_heats(
        edition_id,heat_number,qualification_date,qualifying_places
      )
      values(
        e.id,v_heat,e.qualification_date,
        v_base_places+case when v_heat<=v_remainder then 1 else 0 end
      );
    end loop;
  end if;

  if v_eligible <= cfg.final_field_size then
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,s.rider_id,s.club_id,s.national_rank,'direct','direct_qualified',
      s.national_rank,s.rider_name_snapshot,s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    where s.edition_id=e.id
    order by s.national_rank;
  else
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      heat_id,heat_number,seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,
      s.rider_id,
      s.club_id,
      s.national_rank,
      case when s.national_rank<=v_direct then 'direct' else 'qualification' end,
      case when s.national_rank<=v_direct then 'direct_qualified' else 'qualification_assigned' end,
      h.id,
      case when s.national_rank<=v_direct then null else q.heat_number end,
      s.national_rank,
      s.rider_name_snapshot,
      s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    left join lateral(
      select case
        when s.national_rank<=v_direct then null::integer
        else case
          when (floor(((s.national_rank-v_direct-1)::numeric)/v_heat_count)::int % 2)=0
            then ((s.national_rank-v_direct-1)%v_heat_count)+1
          else v_heat_count-((s.national_rank-v_direct-1)%v_heat_count)
        end
      end as heat_number
    ) q on true
    left join public.national_championship_heats h
      on h.edition_id=e.id and h.heat_number=q.heat_number
    where s.edition_id=e.id
    order by s.national_rank;
  end if;

  update public.national_championship_entries en
  set
    participation_decision=case
      when en.club_id_snapshot is null then 'auto_approved'
      when coalesce(root.is_ai,false)
        or root.owner_user_id is null
        then 'auto_approved'
      else 'pending'
    end,
    participation_decision_at=case
      when en.club_id_snapshot is null
        or coalesce(root.is_ai,false)
        or root.owner_user_id is null
        then now()
      else null
    end,
    updated_at=now()
  from public.clubs rc
  left join public.clubs root_parent
    on root_parent.id=rc.parent_club_id
  cross join lateral(
    select
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then coalesce(root_parent.is_ai,false)
        else coalesce(rc.is_ai,false)
      end as is_ai,
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then root_parent.owner_user_id
        else rc.owner_user_id
      end as owner_user_id
  ) root
  where en.edition_id=e.id
    and en.club_id_snapshot=rc.id;

  update public.national_championship_entries
  set participation_decision='auto_approved',
      participation_decision_at=now(),
      updated_at=now()
  where edition_id=e.id
    and club_id_snapshot is null;

  update public.national_championship_heats h
  set assigned_count=x.assigned_count,updated_at=now()
  from(
    select heat_id,count(*)::int assigned_count
    from public.national_championship_entries
    where edition_id=e.id and heat_id is not null
      and entry_status<>'withdrawn'
    group by heat_id
  ) x
  where h.id=x.heat_id;

  insert into public.national_championship_duties(
    edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
    duty_start_date,duty_end_date
  )
  select
    e.id,
    en.rider_id,
    case when en.entry_path='direct' then 'final' else 'qualification' end,
    case when en.entry_path='direct' then e.final_date else e.qualification_date end,
    en.heat_id,
    'confirmed',
    case
      when en.entry_path='direct'
        then 'National Duty — '||e.country_code||' National Road Championship'
      else 'National Duty — '||e.country_code||' National Championship Qualification'
    end,
    e.duty_window_start_date,
    e.duty_window_end_date
  from public.national_championship_entries en
  where en.edition_id=e.id
  on conflict (edition_id,rider_id,duty_type) do update
    set duty_date=excluded.duty_date,
        heat_id=excluded.heat_id,
        label=excluded.label,
        status='confirmed',
        duty_start_date=excluded.duty_start_date,
        duty_end_date=excluded.duty_end_date,
        updated_at=now();

  update public.national_championship_editions
  set status='ranking_frozen',
      eligible_count=v_eligible,
      direct_qualifier_count=v_direct,
      qualification_places=v_qualification_places,
      qualification_heat_count=v_heat_count,
      updated_at=now()
  where id=e.id;

  return jsonb_build_object(
    'edition_id',e.id,
    'country_code',e.country_code,
    'eligible_count',v_eligible,
    'direct_qualifiers',v_direct,
    'qualification_population',v_qualification_population,
    'qualification_places',v_qualification_places,
    'heat_count',v_heat_count,
    'duty_window_start_date',e.duty_window_start_date,
    'duty_window_end_date',e.duty_window_end_date,
    'decision_deadline',e.participation_decision_deadline,
    'status','ranking_frozen'
  );
end;
$function$;

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
      'status','waiting_for_two_routes',
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
$function$;

CREATE OR REPLACE FUNCTION public.process_national_championship_runtime_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_created integer := 0;
  v_frozen integer := 0;
  v_races_ready integer := 0;
  v_auto_approved integer := 0;
  r record;
  q jsonb;
  f jsonb;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  v_created:=public.ensure_national_championship_editions_for_season_v1(v_season);
  perform public.national_championship_refresh_planned_editions_v1(v_season);
  v_auto_approved:=public.national_championship_auto_approve_pending_v1();

  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and status='planned'
      and climate_status='ready'
      and route_status='ready'
      and ranking_snapshot_date<=v_game_date
    order by ranking_snapshot_date,country_code
  loop
    perform public.freeze_national_championship_ranking_v1(r.id);
    perform public.national_championship_ensure_races_v1(r.id);
    perform public.national_championship_notify_selection_v1(r.id);
    v_frozen:=v_frozen+1;
    v_races_ready:=v_races_ready+1;
  end loop;

  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and climate_status='ready'
      and route_status='ready'
      and status in ('ranking_frozen','qualification_pending','final_ready')
      and (
        final_race_id is null
        or exists(
          select 1
          from public.national_championship_heats h
          where h.edition_id=national_championship_editions.id
            and h.race_id is null
        )
      )
    order by country_code
  loop
    perform public.national_championship_ensure_races_v1(r.id);
    v_races_ready:=v_races_ready+1;
  end loop;

  q:=public.national_championship_process_qualification_results_v1();
  f:=public.national_championship_process_final_results_v1();

  return jsonb_build_object(
    'status','ok',
    'season_number',v_season,
    'game_date',v_game_date,
    'editions_created',v_created,
    'pending_entries_auto_approved',v_auto_approved,
    'rankings_frozen',v_frozen,
    'race_sets_ensured',v_races_ready,
    'qualification_processing',q,
    'final_processing',f
  );
end;
$function$;

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
    raise exception 'National championship requires two suitable road stages for % (route_status=%)',e.country_code,e.route_status;
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
    profile_image_url,logo_url,description,metadata,
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
$function$;

comment on function public.national_championship_ensure_event_race_v1(uuid,text,uuid) is
'Creates National Championship races only when two distinct suitable host-country routes exist. Uses the national flag as event logo, preserves terrain profile, strips source competition identity and all KOM/intermediate sprint gates, and exposes only start and finish points.';
