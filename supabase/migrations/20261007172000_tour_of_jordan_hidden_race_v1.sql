-- Tour of Jordan hidden reserve race.
-- Four stages, category 2.1, $165,000 prize fund.
-- Stages 2 and 3 are designated National Championship source routes.

begin;

insert into public.races(
  id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
  is_stage_race,stage_count,status,description,metadata
) values (
  '5986f35b-d7db-4bc1-8e55-6f9ac25fe387',
  'Tour of Jordan',
  'Tour of Jordan',
  null,null,'JO','Amman','2.1','stage_race',true,4,'draft',
  'Four-stage hidden senior Tour of Jordan using realistic road corridors across Amman, Aqaba, Wadi Rum, Jerash, Ajloun and Petra.',
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'reserve_country_code','JO',
    'future_regular_calendar_eligible',true,
    'national_competition_stage_count',2,
    'national_competition_designated_stage_numbers',jsonb_build_array(2,3),
    'national_competition_stage_types',jsonb_build_array('flat','hilly_mountain'),
    'route_library_version','v1',
    'national_championship_host_eligibility','allowed'
  )
);

-- Stage 1
insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  '8b6872e8-40ed-477d-a1fc-c5317660fb26',
  '5986f35b-d7db-4bc1-8e55-6f9ac25fe387',
  1,null,'Stage 1 · Amman Plateau Circuit',
  'Amman','Amman','Amman','JO',
  132.8,'hilly','flat_finish',false,45,50,5,0,1260,
  '{}'::jsonb,'{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden','reserve_pool',true,
    'route_identity','jordan-amman-plateau-circuit',
    'route_basis','Amman → Madaba road → Amman plateau circuit',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',false
  ),
  'Amman','Amman','all_rounder',
  'Rolling opening stage on the Amman plateau and Madaba road corridor.',
  '[{"number":1,"km":46.2,"name":"Madaba road sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":96.4,"name":"Amman return sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[{"number":1,"km":78.5,"name":"Amman Plateau Rise","category":"Cat 3","length_km":5.4,"avg_gradient":4.1,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]}]'::jsonb,
  'road_race'
);

-- Stage 2: flat NC route
insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  'c6de8d5e-b5ff-48df-9776-5f2d09a24921',
  '5986f35b-d7db-4bc1-8e55-6f9ac25fe387',
  2,null,'Stage 2 · Aqaba to Wadi Rum Desert Circuit',
  'Aqaba','Aqaba','Aqaba','JO',
  158.4,'flat','flat_finish',false,86,14,0,0,690,
  '{}'::jsonb,'{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden','reserve_pool',true,
    'route_identity','jordan-aqaba-wadi-rum-desert-circuit',
    'route_basis','Aqaba → Wadi Rum road → desert return circuit → Aqaba',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',true,
    'national_competition_slot','flat',
    'fairness_check',jsonb_build_object(
      'distance_km',158.4,'elevation_gain_m',690,'elevation_gain_per_km',4.36,'mountain_pct',0
    )
  ),
  'Aqaba','Aqaba','sprinter',
  'Fast desert stage using the Aqaba–Wadi Rum road corridor and a controlled return loop.',
  '[{"number":1,"km":54.7,"name":"Wadi Rum road sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":113.6,"name":"Aqaba approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[]'::jsonb,
  'road_race'
);

-- Stage 3: hilly NC route
insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  '485f6897-9405-4bed-961c-f25630aeeb6f',
  '5986f35b-d7db-4bc1-8e55-6f9ac25fe387',
  3,null,'Stage 3 · Jerash–Ajloun Highlands',
  'Jerash','Irbid','Jerash','JO',
  146.8,'hilly','uphill_finish',false,26,58,16,0,2240,
  '{}'::jsonb,'{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden','reserve_pool',true,
    'route_identity','jordan-jerash-ajloun-highlands',
    'route_basis','Jerash → Ajloun → highland loop → Irbid',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',true,
    'national_competition_slot','hilly_mountain',
    'fairness_check',jsonb_build_object(
      'distance_km',146.8,'elevation_gain_m',2240,'elevation_gain_per_km',15.26,'mountain_pct',16
    )
  ),
  'Jerash','Irbid','puncheur',
  'Northern Jordan highland stage through the Jerash–Ajloun corridor, tuned for National Championship fairness.',
  '[{"number":1,"km":52.8,"name":"Ajloun valley sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":109.4,"name":"Irbid approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[{"number":1,"km":38.5,"name":"Ajloun Forest Rise","category":"Cat 2","length_km":8.1,"avg_gradient":5.0,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]},{"number":2,"km":95.7,"name":"Northern Highlands Rise","category":"Cat 2","length_km":9.2,"avg_gradient":4.8,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]'::jsonb,
  'road_race'
);

-- Stage 4
insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  'c958e815-9cbc-424d-8b54-90664cd3ea51',
  '5986f35b-d7db-4bc1-8e55-6f9ac25fe387',
  4,null,'Stage 4 · Petra–Shobak Finale',
  'Petra','Petra','Petra','JO',
  124.9,'mountain','uphill_finish',false,14,56,30,0,2445,
  '{}'::jsonb,'{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden','reserve_pool',true,
    'route_identity','jordan-petra-shobak-finale',
    'route_basis','Petra → Shobak → King’s Highway highland return → Petra',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',false
  ),
  'Petra','Petra','climber',
  'Mountain finale on the Petra–Shobak highland corridor.',
  '[{"number":1,"km":43.7,"name":"Shobak road sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[{"number":1,"km":35.2,"name":"Shobak Rise","category":"Cat 2","length_km":8.8,"avg_gradient":5.3,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]},{"number":2,"km":91.5,"name":"Petra Highlands","category":"Cat 2","length_km":9.1,"avg_gradient":5.1,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]'::jsonb,
  'road_race'
);

-- Detailed profiles
insert into public.race_stage_profile_details(
  stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
  distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
  profile_points,route_markers,intermediate_sprints,mountain_climbs,metadata,weather_snapshot
)
select
  s.id,s.race_id,s.name,
  coalesce(s.metadata->>'route_basis',s.name),
  'Tour of Jordan stage using a realistic Jordanian road corridor.',
  null,s.distance_km,s.elevation_gain_m,s.terrain_type,s.profile_type,
  jsonb_build_object('flat',s.flat_pct,'hilly',s.hilly_pct,'mountain',s.mountain_pct,'cobbled',s.cobbled_pct),
  case s.stage_number
    when 1 then '[{"km":0,"elevation":900,"elevation_m":900},{"km":22,"elevation":820,"elevation_m":820},{"km":44,"elevation":760,"elevation_m":760},{"km":66,"elevation":805,"elevation_m":805},{"km":88,"elevation":845,"elevation_m":845},{"km":110,"elevation":880,"elevation_m":880},{"km":132.8,"elevation":900,"elevation_m":900}]'::jsonb
    when 2 then '[{"km":0,"elevation":20,"elevation_m":20},{"km":26.4,"elevation":180,"elevation_m":180},{"km":52.8,"elevation":510,"elevation_m":510},{"km":79.2,"elevation":690,"elevation_m":690},{"km":105.6,"elevation":420,"elevation_m":420},{"km":132,"elevation":160,"elevation_m":160},{"km":158.4,"elevation":20,"elevation_m":20}]'::jsonb
    when 3 then '[{"km":0,"elevation":575,"elevation_m":575},{"km":24.5,"elevation":760,"elevation_m":760},{"km":49,"elevation":1080,"elevation_m":1080},{"km":73.4,"elevation":860,"elevation_m":860},{"km":97.9,"elevation":1010,"elevation_m":1010},{"km":122.3,"elevation":720,"elevation_m":720},{"km":146.8,"elevation":620,"elevation_m":620}]'::jsonb
    else '[{"km":0,"elevation":810,"elevation_m":810},{"km":20.8,"elevation":960,"elevation_m":960},{"km":41.6,"elevation":1280,"elevation_m":1280},{"km":62.5,"elevation":1120,"elevation_m":1120},{"km":83.3,"elevation":1380,"elevation_m":1380},{"km":104.1,"elevation":1050,"elevation_m":1050},{"km":124.9,"elevation":810,"elevation_m":810}]'::jsonb
  end,
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name',s.start_city),
    jsonb_build_object('km',round((s.distance_km/2)::numeric,1),'type','route','label','Mid-route','name','Route midpoint'),
    jsonb_build_object('km',s.distance_km,'type','finish','label','Finish','name',s.finish_city)
  ),
  s.intermediate_sprints_json,s.mountain_climbs_json,
  jsonb_build_object(
    'reserve_pool',true,
    'unscheduled_template',true,
    'national_competition_eligible',coalesce((s.metadata->>'national_competition_eligible')::boolean,false),
    'national_competition_slot',s.metadata->>'national_competition_slot'
  ),
  null
from public.race_stages s
where s.race_id='5986f35b-d7db-4bc1-8e55-6f9ac25fe387';

insert into public.race_reserve_pool(
  id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
) values (
  '005e6ad3-d39e-4e86-a387-6025623ac60d',
  '5986f35b-d7db-4bc1-8e55-6f9ac25fe387',
  'JO','hidden',true,false,
  array['national_championship','qualification','final','general_reserve']::text[],
  'hard',
  'Four-stage Tour of Jordan. Stage 2 flat and Stage 3 hilly are designated National Championship source routes.'
);

select public.initialize_race_entry_rules_v1(
  '5986f35b-d7db-4bc1-8e55-6f9ac25fe387'::uuid,'2.1',null,165000
);

select public.sync_race_stage_points_from_stage_json_v1(id,true)
from public.race_stages
where race_id='5986f35b-d7db-4bc1-8e55-6f9ac25fe387';

commit;
