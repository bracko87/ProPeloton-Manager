-- National Championship hidden one-day races for Eritrea, Eswatini,
-- The Gambia and Guinea-Bissau.
-- All are category 1.2 with prize funds between $30,000 and $40,000.

begin;

do $$
declare
  data jsonb := '[{"cc":"ER","race_id":"b5ea0f3e-9840-49d6-9cb8-246c27af09b2","stage_id":"ac7d5db0-0dc6-4e86-b6fc-83a1dd2344b1","pool_id":"1b3f8fd8-2eb8-4a2e-9bc8-b30b2d3b1452","name":"Grand Prix of Asmara","short":"GP Asmara","host":"Asmara","prize":39000,"stage_name":"Asmara Highlands Grand Prix","start":"Asmara","finish":"Asmara","route":"Asmara → Dekemhare → Adi Keyh road junction → Asmara highland circuit","distance":151.6,"terrain":"hilly","profile":"puncheur","finish_type":"uphill_finish","gain":2560,"flat":18,"hilly":58,"mountain":24,"elev":[2325,2240,2160,2280,2410,2360,2325],"sprint_km":58.4,"sprint_name":"Dekemhare sprint","climbs":[{"number":1,"km":37.6,"name":"Dekemhare Rise","category":"Cat 3","length_km":6.8,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":108.9,"name":"Asmara Plateau Return","category":"Cat 2","length_km":8.7,"avg_gradient":5.1,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}],"profile_points":[{"km":0,"elevation":2325,"elevation_m":2325},{"km":25.8,"elevation":2240,"elevation_m":2240},{"km":50,"elevation":2160,"elevation_m":2160},{"km":75.8,"elevation":2280,"elevation_m":2280},{"km":101.6,"elevation":2410,"elevation_m":2410},{"km":125.8,"elevation":2360,"elevation_m":2360},{"km":151.6,"elevation":2325,"elevation_m":2325}],"sprints":[{"number":1,"km":58.4,"name":"Dekemhare sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":118.2,"name":"Asmara approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"markers":[{"km":0,"type":"start","label":"Start","name":"Asmara"},{"km":37.6,"type":"kom","label":"Cat 3","name":"Dekemhare Rise"},{"km":108.9,"type":"kom","label":"Cat 2","name":"Asmara Plateau Return"},{"km":151.6,"type":"finish","label":"Finish","name":"Asmara"}]},{"cc":"SZ","race_id":"6f2774f1-202b-4a4c-b1f0-44744b41db87","stage_id":"cab84803-2241-4126-8e28-d7764b8b9462","pool_id":"d89fa7e3-429a-46c9-9d55-4cb89f4e28c6","name":"Eswatini Highlands Classic","short":"Eswatini Classic","host":"Mbabane","prize":36500,"stage_name":"Mbabane–Manzini Highlands Classic","start":"Mbabane","finish":"Manzini","route":"Mbabane → Ezulwini → Lobamba → Malkerns → Manzini with highland finishing loop","distance":146.9,"terrain":"hilly","profile":"puncheur","finish_type":"uphill_finish","gain":2210,"flat":24,"hilly":60,"mountain":16,"elev":[1240,1050,760,680,720,790,760],"sprint_km":66.2,"sprint_name":"Malkerns sprint","climbs":[{"number":1,"km":29.4,"name":"Ezulwini Ridge","category":"Cat 3","length_km":6,"avg_gradient":4.7,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":119.1,"name":"Manzini Highlands Rise","category":"Cat 2","length_km":8.2,"avg_gradient":4.9,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}],"profile_points":[{"km":0,"elevation":1240,"elevation_m":1240},{"km":25,"elevation":1050,"elevation_m":1050},{"km":48.5,"elevation":760,"elevation_m":760},{"km":73.5,"elevation":680,"elevation_m":680},{"km":98.4,"elevation":720,"elevation_m":720},{"km":121.9,"elevation":790,"elevation_m":790},{"km":146.9,"elevation":760,"elevation_m":760}],"sprints":[{"number":1,"km":66.2,"name":"Malkerns sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":114.6,"name":"Manzini approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"markers":[{"km":0,"type":"start","label":"Start","name":"Mbabane"},{"km":29.4,"type":"kom","label":"Cat 3","name":"Ezulwini Ridge"},{"km":119.1,"type":"kom","label":"Cat 2","name":"Manzini Highlands Rise"},{"km":146.9,"type":"finish","label":"Finish","name":"Manzini"}]},{"cc":"GM","race_id":"eb3b7466-32b5-4a49-a0a0-9ff39d240649","stage_id":"ee6c6966-4e6d-4ad4-b5a7-886ff2cfe970","pool_id":"6ee6261f-4d4f-4e3d-a61c-b3b9f0e413f7","name":"Grand Prix of The Gambia","short":"GP Gambia","host":"Banjul","prize":32000,"stage_name":"Banjul–Brikama Coastal Grand Prix","start":"Banjul","finish":"Banjul","route":"Banjul → Serekunda → Brikama → Tanji → Banjul coastal loop","distance":148.3,"terrain":"flat","profile":"sprinter","finish_type":"flat_finish","gain":340,"flat":91,"hilly":9,"mountain":0,"elev":[6,12,18,14,10,8,6],"sprint_km":52.6,"sprint_name":"Brikama sprint","climbs":[],"profile_points":[{"km":0,"elevation":6,"elevation_m":6},{"km":25.2,"elevation":12,"elevation_m":12},{"km":48.9,"elevation":18,"elevation_m":18},{"km":74.2,"elevation":14,"elevation_m":14},{"km":99.4,"elevation":10,"elevation_m":10},{"km":123.1,"elevation":8,"elevation_m":8},{"km":148.3,"elevation":6,"elevation_m":6}],"sprints":[{"number":1,"km":52.6,"name":"Brikama sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":115.7,"name":"Banjul approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"markers":[{"km":0,"type":"start","label":"Start","name":"Banjul"},{"km":52.6,"type":"sprint","label":"Sprint","name":"Brikama sprint"},{"km":148.3,"type":"finish","label":"Finish","name":"Banjul"}]},{"cc":"GW","race_id":"7a1df351-1ba4-4a6a-ae05-cc3ba08f5b21","stage_id":"d4e17ef4-67c7-4992-b304-d538b24b1141","pool_id":"8ad21c8a-4eb6-47fe-8a51-40b6b5caa902","name":"Guinea-Bissau Independence Classic","short":"Bissau Classic","host":"Bissau","prize":34000,"stage_name":"Bissau–Bafatá Independence Classic","start":"Bissau","finish":"Bissau","route":"Bissau → Safim → Mansôa → Bafatá corridor → Bissau return circuit","distance":156.7,"terrain":"flat","profile":"sprinter","finish_type":"flat_finish","gain":520,"flat":86,"hilly":14,"mountain":0,"elev":[8,14,22,28,35,20,8],"sprint_km":63.4,"sprint_name":"Mansôa sprint","climbs":[],"profile_points":[{"km":0,"elevation":8,"elevation_m":8},{"km":26.6,"elevation":14,"elevation_m":14},{"km":51.7,"elevation":22,"elevation_m":22},{"km":78.3,"elevation":28,"elevation_m":28},{"km":105,"elevation":35,"elevation_m":35},{"km":130.1,"elevation":20,"elevation_m":20},{"km":156.7,"elevation":8,"elevation_m":8}],"sprints":[{"number":1,"km":63.4,"name":"Mansôa sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":122.2,"name":"Bissau approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"markers":[{"km":0,"type":"start","label":"Start","name":"Bissau"},{"km":63.4,"type":"sprint","label":"Sprint","name":"Mansôa sprint"},{"km":156.7,"type":"finish","label":"Finish","name":"Bissau"}]}]'::jsonb;
  r jsonb;
  rid uuid;
  sid uuid;
  poolid uuid;
begin
  for r in select value from jsonb_array_elements(data)
  loop
    rid := (r->>'race_id')::uuid;
    sid := (r->>'stage_id')::uuid;
    poolid := (r->>'pool_id')::uuid;

    insert into public.races(
      id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
      is_stage_race,stage_count,status,description,metadata
    ) values (
      rid,r->>'name',r->>'short',null,null,r->>'cc',r->>'host','1.2','one_day',
      false,1,'draft',
      'Hidden one-day senior race designed as a realistic National Championship source route.',
      jsonb_build_object(
        'calendar_visibility','hidden',
        'reserve_pool',true,
        'reserve_country_code',r->>'cc',
        'future_regular_calendar_eligible',true,
        'national_competition_stage_count',1,
        'national_competition_designated_stage_numbers',jsonb_build_array(1),
        'national_competition_stage_types',jsonb_build_array(
          case when r->>'terrain'='flat' then 'flat' else 'hilly_mountain' end
        ),
        'route_library_version','v1',
        'national_championship_host_eligibility','allowed'
      )
    );

    insert into public.race_stages(
      id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
      distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
      elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
      profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
    ) values (
      sid,rid,1,null,r->>'stage_name',r->>'start',r->>'finish',r->>'host',r->>'cc',
      (r->>'distance')::numeric,r->>'terrain',r->>'finish_type',false,
      (r->>'flat')::numeric,(r->>'hilly')::numeric,(r->>'mountain')::numeric,0,
      (r->>'gain')::int,'{}'::jsonb,'{}'::jsonb,
      jsonb_build_object(
        'calendar_visibility','hidden',
        'reserve_pool',true,
        'route_identity',lower(replace(r->>'stage_name',' ','-')),
        'route_basis',r->>'route',
        'national_championship_host_eligibility','allowed',
        'national_competition_eligible',true,
        'national_competition_slot',case when r->>'terrain'='flat' then 'flat' else 'hilly_mountain' end,
        'fairness_check',jsonb_build_object(
          'distance_km',(r->>'distance')::numeric,
          'elevation_gain_m',(r->>'gain')::int,
          'elevation_gain_per_km',round((r->>'gain')::numeric/(r->>'distance')::numeric,2),
          'mountain_pct',(r->>'mountain')::numeric
        )
      ),
      r->>'start',r->>'finish',r->>'profile',
      'National Championship reserve route: '||(r->>'route')||'.',
      r->'sprints',r->'climbs','road_race'
    );

    insert into public.race_stage_profile_details(
      stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
      distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
      profile_points,route_markers,intermediate_sprints,mountain_climbs,metadata,weather_snapshot
    ) values (
      sid,rid,r->>'stage_name',r->>'route',
      'One-day National Championship reserve course using realistic national road geography.',
      null,(r->>'distance')::numeric,(r->>'gain')::int,r->>'terrain',r->>'profile',
      jsonb_build_object('flat',(r->>'flat')::numeric,'hilly',(r->>'hilly')::numeric,'mountain',(r->>'mountain')::numeric,'cobbled',0),
      r->'profile_points',r->'markers',r->'sprints',r->'climbs',
      jsonb_build_object(
        'reserve_pool',true,
        'unscheduled_template',true,
        'national_competition_eligible',true,
        'national_competition_slot',case when r->>'terrain'='flat' then 'flat' else 'hilly_mountain' end
      ),
      null
    );

    insert into public.race_reserve_pool(
      id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
    ) values (
      poolid,rid,r->>'cc','hidden',true,false,
      array['national_championship','qualification','final','general_reserve']::text[],
      case when r->>'terrain'='flat' then 'moderate' else 'hard' end,
      'Primary National Championship reserve route. Reusable for qualification and final.'
    );

    perform public.initialize_race_entry_rules_v1(rid,'1.2',null,(r->>'prize')::bigint);
    perform public.sync_race_stage_points_from_stage_json_v1(sid,true);
  end loop;
end
$$;

commit;
