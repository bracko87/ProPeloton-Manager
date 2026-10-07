
begin;

insert into public.races(
  id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
  is_stage_race,stage_count,status,description,metadata
) values(
  'b6d9f3ab-3ab8-4c90-9a0e-3af67afc9421',
  'Tour of India',
  'Tour of India',
  null,null,'IN','Bengaluru','2.1','stage_race',true,7,'draft',
  'Seven-stage hidden senior Tour of India across Karnataka and Kerala, including a stage-four team time trial and a decisive Western Ghats mountain stage.',
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'reserve_country_code','IN',
    'future_regular_calendar_eligible',true,
    'national_competition_stage_count',3,
    'national_competition_designated_stage_numbers',jsonb_build_array(1,4,6),
    'national_competition_stage_types',jsonb_build_array('flat','team_time_trial','hilly_mountain'),
    'route_library_version','v1',
    'national_championship_host_eligibility','allowed'
  )
);

do $$
declare
  j jsonb := '[{"n":1,"key":"india-1-bengaluru-mysuru","name":"Stage 1 · Bengaluru to Mysuru","start":"Bengaluru","finish":"Mysuru","host":"Bengaluru","route":"Bengaluru → Ramanagara → Mandya → Mysuru (NH275)","distance":142.6,"terrain":"flat","profile":"sprinter","format":"road_race","finish_type":"flat_finish","gain":620,"flat":78,"hilly":22,"mountain":0,"eligible":true,"slot":"flat","elev":[920,890,845,810,790,775,770],"profile_points":[{"km":0,"elevation":920,"elevation_m":920},{"km":24.2,"elevation":890,"elevation_m":890},{"km":47.1,"elevation":845,"elevation_m":845},{"km":71.3,"elevation":810,"elevation_m":810},{"km":95.5,"elevation":790,"elevation_m":790},{"km":118.4,"elevation":775,"elevation_m":775},{"km":142.6,"elevation":770,"elevation_m":770}],"route_markers":[{"km":0,"type":"start","label":"Start","name":"Bengaluru"},{"km":71.3,"type":"route","label":"Mid-route","name":"Mandya"},{"km":142.6,"type":"finish","label":"Finish","name":"Mysuru"}],"sprints":[{"number":1,"km":49.9,"name":"Bengaluru route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":102.7,"name":"Mysuru approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]},{"n":2,"key":"india-2-mysuru-madikeri","name":"Stage 2 · Mysuru to Madikeri","start":"Mysuru","finish":"Madikeri","host":"Mysuru","route":"Mysuru → Hunsur → Kushalnagar → Madikeri (NH275)","distance":121.4,"terrain":"hilly","profile":"puncheur","format":"road_race","finish_type":"uphill_finish","gain":1655,"flat":28,"hilly":60,"mountain":12,"eligible":false,"slot":null,"elev":[770,745,705,830,980,1090,1150],"profile_points":[{"km":0,"elevation":770,"elevation_m":770},{"km":20.6,"elevation":745,"elevation_m":745},{"km":40.1,"elevation":705,"elevation_m":705},{"km":60.7,"elevation":830,"elevation_m":830},{"km":81.3,"elevation":980,"elevation_m":980},{"km":100.8,"elevation":1090,"elevation_m":1090},{"km":121.4,"elevation":1150,"elevation_m":1150}],"route_markers":[{"km":0,"type":"start","label":"Start","name":"Mysuru"},{"km":60.7,"type":"route","label":"Mid-route","name":"Kushalnagar"},{"km":121.4,"type":"finish","label":"Finish","name":"Madikeri"}],"sprints":[{"number":1,"km":42.5,"name":"Mysuru route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":87.4,"name":"Madikeri approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":51,"name":"Madikeri route climb 1","category":"Cat 3","length_km":5.2,"avg_gradient":4.2,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":94.7,"name":"Madikeri route climb 2","category":"Cat 3","length_km":5.8,"avg_gradient":4.4,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]}]},{"n":3,"key":"india-3-madikeri-mangaluru","name":"Stage 3 · Madikeri to Mangaluru","start":"Madikeri","finish":"Mangaluru","host":"Madikeri","route":"Madikeri → Sampaje → Puttur → Bantwal → Mangaluru","distance":136.3,"terrain":"hilly","profile":"climber","format":"road_race","finish_type":"flat_finish","gain":2285,"flat":22,"hilly":58,"mountain":20,"eligible":false,"slot":null,"elev":[1150,980,720,360,180,65,22],"profile_points":[{"km":0,"elevation":1150,"elevation_m":1150},{"km":23.2,"elevation":980,"elevation_m":980},{"km":45,"elevation":720,"elevation_m":720},{"km":68.2,"elevation":360,"elevation_m":360},{"km":91.3,"elevation":180,"elevation_m":180},{"km":113.1,"elevation":65,"elevation_m":65},{"km":136.3,"elevation":22,"elevation_m":22}],"route_markers":[{"km":0,"type":"start","label":"Start","name":"Madikeri"},{"km":68.2,"type":"route","label":"Mid-route","name":"Puttur"},{"km":136.3,"type":"finish","label":"Finish","name":"Mangaluru"}],"sprints":[{"number":1,"km":47.7,"name":"Madikeri route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":98.1,"name":"Mangaluru approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":57.2,"name":"Mangaluru route climb 1","category":"Cat 3","length_km":5.2,"avg_gradient":4.2,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":106.3,"name":"Mangaluru route climb 2","category":"Cat 3","length_km":5.8,"avg_gradient":4.4,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]}]},{"n":4,"key":"india-4-mangaluru-ttt","name":"Stage 4 · Mangaluru Coastal Team Time Trial","start":"Mangaluru","finish":"Mangaluru","host":"Mangaluru","route":"Mangaluru → Panambur → Surathkal → Mangaluru coastal circuit","distance":31.8,"terrain":"flat","profile":"team_time_trial","format":"team_time_trial","finish_type":"team_time_trial_finish","gain":96,"flat":96,"hilly":4,"mountain":0,"eligible":true,"slot":"team_time_trial","elev":[18,22,15,26,19,23,18],"profile_points":[{"km":0,"elevation":18,"elevation_m":18},{"km":5.4,"elevation":22,"elevation_m":22},{"km":10.5,"elevation":15,"elevation_m":15},{"km":15.9,"elevation":26,"elevation_m":26},{"km":21.3,"elevation":19,"elevation_m":19},{"km":26.4,"elevation":23,"elevation_m":23},{"km":31.8,"elevation":18,"elevation_m":18}],"route_markers":[{"km":0,"type":"start","label":"Start","name":"Mangaluru"},{"km":15.9,"type":"route","label":"Mid-route","name":"Surathkal"},{"km":31.8,"type":"finish","label":"Finish","name":"Mangaluru"}],"sprints":[],"climbs":[]},{"n":5,"key":"india-5-mangaluru-kundapura","name":"Stage 5 · Mangaluru to Kundapura","start":"Mangaluru","finish":"Kundapura","host":"Mangaluru","route":"Mangaluru → Surathkal → Udupi → Kundapura (NH66)","distance":94.6,"terrain":"flat","profile":"sprinter","format":"road_race","finish_type":"flat_finish","gain":408,"flat":84,"hilly":16,"mountain":0,"eligible":false,"slot":null,"elev":[22,18,26,12,20,15,9],"profile_points":[{"km":0,"elevation":22,"elevation_m":22},{"km":16.1,"elevation":18,"elevation_m":18},{"km":31.2,"elevation":26,"elevation_m":26},{"km":47.3,"elevation":12,"elevation_m":12},{"km":63.4,"elevation":20,"elevation_m":20},{"km":78.5,"elevation":15,"elevation_m":15},{"km":94.6,"elevation":9,"elevation_m":9}],"route_markers":[{"km":0,"type":"start","label":"Start","name":"Mangaluru"},{"km":47.3,"type":"route","label":"Mid-route","name":"Udupi"},{"km":94.6,"type":"finish","label":"Finish","name":"Kundapura"}],"sprints":[{"number":1,"km":33.1,"name":"Mangaluru route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":68.1,"name":"Kundapura approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]},{"n":6,"key":"india-6-kochi-munnar","name":"Stage 6 · Kochi to Munnar","start":"Kochi","finish":"Munnar","host":"Kochi","route":"Kochi → Muvattupuzha → Kothamangalam → Neriamangalam → Adimali → Munnar (NH85)","distance":140.7,"terrain":"mountain","profile":"climber","format":"road_race","finish_type":"summit_finish","gain":2765,"flat":18,"hilly":50,"mountain":32,"eligible":true,"slot":"hilly_mountain","elev":[5,24,48,95,420,930,1532],"profile_points":[{"km":0,"elevation":5,"elevation_m":5},{"km":23.9,"elevation":24,"elevation_m":24},{"km":46.4,"elevation":48,"elevation_m":48},{"km":70.3,"elevation":95,"elevation_m":95},{"km":94.3,"elevation":420,"elevation_m":420},{"km":116.8,"elevation":930,"elevation_m":930},{"km":140.7,"elevation":1532,"elevation_m":1532}],"route_markers":[{"km":0,"type":"start","label":"Start","name":"Kochi"},{"km":70.3,"type":"route","label":"Mid-route","name":"Neriamangalam"},{"km":140.7,"type":"finish","label":"Finish","name":"Munnar"}],"sprints":[{"number":1,"km":49.2,"name":"Kochi route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":101.3,"name":"Munnar approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":59.1,"name":"Munnar route climb 1","category":"Cat 2","length_km":8.4,"avg_gradient":5.4,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]},{"number":2,"km":109.7,"name":"Munnar route climb 2","category":"Cat 2","length_km":9.1,"avg_gradient":5.7,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"n":7,"key":"india-7-munnar-thekkady","name":"Stage 7 · Munnar to Thekkady","start":"Munnar","finish":"Thekkady","host":"Munnar","route":"Munnar → Devikulam → Pooppara → Ramakkalmedu → Kumily / Thekkady","distance":101.8,"terrain":"hilly","profile":"puncheur","format":"road_race","finish_type":"uphill_finish","gain":2045,"flat":12,"hilly":64,"mountain":24,"eligible":false,"slot":null,"elev":[1532,1670,1450,1260,980,1120,900],"profile_points":[{"km":0,"elevation":1532,"elevation_m":1532},{"km":17.3,"elevation":1670,"elevation_m":1670},{"km":33.6,"elevation":1450,"elevation_m":1450},{"km":50.9,"elevation":1260,"elevation_m":1260},{"km":68.2,"elevation":980,"elevation_m":980},{"km":84.5,"elevation":1120,"elevation_m":1120},{"km":101.8,"elevation":900,"elevation_m":900}],"route_markers":[{"km":0,"type":"start","label":"Start","name":"Munnar"},{"km":50.9,"type":"route","label":"Mid-route","name":"Pooppara"},{"km":101.8,"type":"finish","label":"Finish","name":"Thekkady"}],"sprints":[{"number":1,"km":35.6,"name":"Munnar route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":73.3,"name":"Thekkady approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":42.8,"name":"Thekkady route climb 1","category":"Cat 3","length_km":5.2,"avg_gradient":4.2,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":79.4,"name":"Thekkady route climb 2","category":"Cat 3","length_km":5.8,"avg_gradient":4.4,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]}]}]'::jsonb;
  s jsonb;
  v_stage_id uuid;
begin
  for s in select value from jsonb_array_elements(j)
  loop
    v_stage_id := md5('tour-of-india-stage:'||(s->>'n'))::uuid;

    insert into public.race_stages(
      id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
      distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
      elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
      profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
    ) values(
      v_stage_id,'b6d9f3ab-3ab8-4c90-9a0e-3af67afc9421',(s->>'n')::int,null,
      s->>'name',s->>'start',s->>'finish',s->>'host','IN',
      (s->>'distance')::numeric,s->>'terrain',s->>'finish_type',
      (s->>'finish_type')='summit_finish',
      (s->>'flat')::numeric,(s->>'hilly')::numeric,(s->>'mountain')::numeric,0,
      (s->>'gain')::int,'{}'::jsonb,'{}'::jsonb,
      jsonb_build_object(
        'calendar_visibility','hidden',
        'reserve_pool',true,
        'route_identity',s->>'key',
        'route_basis',s->>'route',
        'national_championship_host_eligibility',
          case when s->>'format'='team_time_trial' then 'excluded' else 'allowed' end,
        'national_association_route_type',
          case when s->>'slot' is not null then s->>'slot' else 'general_reserve' end,
        'national_competition_eligible',(s->>'eligible')::boolean,
        'national_competition_slot',s->>'slot'
      ),
      s->>'start',s->>'finish',s->>'profile',
      'Tour of India route: '||(s->>'route')||'.',
      coalesce(s->'sprints','[]'::jsonb),
      coalesce(s->'climbs','[]'::jsonb),
      s->>'format'
    );

    insert into public.race_stage_profile_details(
      stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
      distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
      profile_points,route_markers,intermediate_sprints,mountain_climbs,metadata,weather_snapshot
    ) values(
      v_stage_id,'b6d9f3ab-3ab8-4c90-9a0e-3af67afc9421',
      s->>'name',s->>'route',
      'Tour of India stage on a realistic South India road corridor: '||(s->>'route')||'.',
      null,(s->>'distance')::numeric,(s->>'gain')::int,s->>'terrain',s->>'profile',
      jsonb_build_object('flat',(s->>'flat')::numeric,'hilly',(s->>'hilly')::numeric,'mountain',(s->>'mountain')::numeric,'cobbled',0),
      s->'profile_points',s->'route_markers',coalesce(s->'sprints','[]'::jsonb),coalesce(s->'climbs','[]'::jsonb),
      jsonb_build_object(
        'reserve_pool',true,
        'route_identity',s->>'key',
        'unscheduled_template',true,
        'national_competition_eligible',(s->>'eligible')::boolean,
        'national_competition_slot',s->>'slot'
      ),
      null
    );

    perform public.sync_race_stage_points_from_stage_json_v1(v_stage_id,true);
  end loop;
end
$$;

insert into public.race_reserve_pool(
  id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
) values(
  '9fbd72b4-5e84-4ac8-8b14-0a577fecc39f',
  'b6d9f3ab-3ab8-4c90-9a0e-3af67afc9421',
  'IN','hidden',true,false,
  array['national_championship','qualification','final','national_association','general_reserve']::text[],
  'hard',
  'Seven-stage Tour of India. National competition uses Stage 1 flat, Stage 4 team time trial and Stage 6 hilly/mountain; other stages remain senior-calendar backups.'
);

select public.initialize_race_entry_rules_v1(
  'b6d9f3ab-3ab8-4c90-9a0e-3af67afc9421'::uuid,
  '2.1',
  null,
  220000
);

commit;
