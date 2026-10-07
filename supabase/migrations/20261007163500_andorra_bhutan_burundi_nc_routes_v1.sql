-- National Championship reserve routes for Andorra, Bhutan and Burundi.
-- One low-category one-day race per country. Each route is explicitly designed
-- to pass the National Championship fairness filters and may be reused for
-- qualification and final when it is the country's only suitable route.

begin;

-- ---------------------------------------------------------------------------
-- Andorra — Andorra Valleys Classic
-- ---------------------------------------------------------------------------
insert into public.races(
  id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
  is_stage_race,stage_count,status,description,metadata
) values (
  '0b32dca4-0dbe-4ef5-91e6-0b4316b5f5c1',
  'Andorra Valleys Classic',
  'Andorra Valleys',
  null,null,'AD','Andorra la Vella','1.2','one_day',false,1,'draft',
  'A championship-style one-day race using repeated Andorran valley corridors while avoiding the extreme climbing load of the existing Andorra Clàssica.',
  '{"calendar_visibility":"hidden","reserve_pool":true,"reserve_country_code":"AD","future_regular_calendar_eligible":true,"national_competition_stage_count":1,"national_competition_designated_stage_numbers":[1],"national_competition_stage_types":["hilly_mountain"],"route_library_version":"v1","national_championship_host_eligibility":"allowed"}'::jsonb
);

insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  '8ca667d9-a7b4-470c-aeb7-024e920f612d',
  '0b32dca4-0dbe-4ef5-91e6-0b4316b5f5c1',
  1,null,'Andorra Valleys Championship Route',
  'Andorra la Vella','Andorra la Vella','Andorra la Vella','AD',
  128.4,'hilly','uphill_finish',false,17,55,28,0,2470,
  '{}'::jsonb,'{}'::jsonb,
  '{"calendar_visibility":"hidden","reserve_pool":true,"route_identity":"andorra-valleys-championship","route_basis":"Andorra la Vella → La Massana → Ordino → Encamp → Canillo → Andorra la Vella, repeated valley sections","national_championship_host_eligibility":"allowed","national_competition_eligible":true,"national_competition_slot":"hilly_mountain","fairness_check":{"distance_km":128.4,"elevation_gain_m":2470,"elevation_gain_per_km":19.24,"mountain_pct":28}}'::jsonb,
  'Andorra la Vella','Andorra la Vella','puncheur',
  'A controlled highland championship course using Andorra''s main valley network rather than the country''s most extreme summit roads.',
  '[{"number":1,"km":44.8,"name":"Encamp sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[{"number":1,"km":31.6,"name":"Ordino Rise","category":"Cat 3","length_km":5.8,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":78.9,"name":"Canillo Rise","category":"Cat 2","length_km":8.2,"avg_gradient":5.0,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]},{"number":3,"km":113.2,"name":"La Massana Return","category":"Cat 3","length_km":6.4,"avg_gradient":4.4,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]}]'::jsonb,
  'road_race'
);

insert into public.race_stage_profile_details(
  stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,distance_km,elevation_gain_m,
  terrain_type,profile_type,terrain_split,profile_points,route_markers,intermediate_sprints,
  mountain_climbs,metadata,weather_snapshot
) values (
  '8ca667d9-a7b4-470c-aeb7-024e920f612d',
  '0b32dca4-0dbe-4ef5-91e6-0b4316b5f5c1',
  'Andorra Valleys Championship Route',
  'Andorra la Vella → La Massana → Ordino → Encamp → Canillo → Andorra la Vella',
  'A 128.4 km hilly championship circuit through Andorra''s principal valleys. It retains the country''s climbing identity while staying under the National Championship climbing and mountain-percentage limits.',
  null,128.4,2470,'hilly','puncheur',
  '{"flat":17,"hilly":55,"mountain":28,"cobbled":0}'::jsonb,
  '[{"km":0,"elevation":1023,"elevation_m":1023},{"km":10.4,"elevation":1110,"elevation_m":1110},{"km":20.8,"elevation":1235,"elevation_m":1235},{"km":31.6,"elevation":1385,"elevation_m":1385},{"km":41.9,"elevation":1195,"elevation_m":1195},{"km":52.4,"elevation":1260,"elevation_m":1260},{"km":63.2,"elevation":1440,"elevation_m":1440},{"km":73.5,"elevation":1575,"elevation_m":1575},{"km":84.1,"elevation":1320,"elevation_m":1320},{"km":94.8,"elevation":1160,"elevation_m":1160},{"km":105.6,"elevation":1285,"elevation_m":1285},{"km":116.7,"elevation":1150,"elevation_m":1150},{"km":128.4,"elevation":1023,"elevation_m":1023}]'::jsonb,
  '[{"km":0,"type":"start","label":"Start","name":"Andorra la Vella"},{"km":31.6,"type":"kom","label":"Cat 3","name":"Ordino Rise"},{"km":44.8,"type":"sprint","label":"Sprint","name":"Encamp sprint"},{"km":78.9,"type":"kom","label":"Cat 2","name":"Canillo Rise"},{"km":113.2,"type":"kom","label":"Cat 3","name":"La Massana Return"},{"km":128.4,"type":"finish","label":"Finish","name":"Andorra la Vella"}]'::jsonb,
  (select intermediate_sprints_json from public.race_stages where id='8ca667d9-a7b4-470c-aeb7-024e920f612d'),
  (select mountain_climbs_json from public.race_stages where id='8ca667d9-a7b4-470c-aeb7-024e920f612d'),
  '{"reserve_pool":true,"route_identity":"andorra-valleys-championship","unscheduled_template":true,"national_competition_eligible":true,"national_competition_slot":"hilly_mountain","fairness_check":{"distance_km":128.4,"elevation_gain_m":2470,"elevation_gain_per_km":19.24,"mountain_pct":28}}'::jsonb,
  null
);

insert into public.race_reserve_pool(
  id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
) values (
  'c40d77c1-1a27-4e42-babc-86ea45b0fc41',
  '0b32dca4-0dbe-4ef5-91e6-0b4316b5f5c1','AD','hidden',true,false,
  array['national_championship','qualification','final','general_reserve']::text[],
  'hard',
  'Primary Andorra National Championship reserve route. Reusable for qualification and final.'
);
select public.initialize_race_entry_rules_v1('0b32dca4-0dbe-4ef5-91e6-0b4316b5f5c1'::uuid,'1.2',null,39500);
select public.sync_race_stage_points_from_stage_json_v1('8ca667d9-a7b4-470c-aeb7-024e920f612d',true);

-- ---------------------------------------------------------------------------
-- Bhutan — Dochula Highlands Classic
-- ---------------------------------------------------------------------------
insert into public.races(
  id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
  is_stage_race,stage_count,status,description,metadata
) values (
  '73e1cb60-5f01-46e2-8f73-018ee45bc902',
  'Dochula Highlands Classic',
  'Dochula Classic',
  null,null,'BT','Thimphu','1.2','one_day',false,1,'draft',
  'A Bhutanese highland one-day race built around the Thimphu–Dochula–Wangdue corridor, tuned to remain fair for National Championship use.',
  '{"calendar_visibility":"hidden","reserve_pool":true,"reserve_country_code":"BT","future_regular_calendar_eligible":true,"national_competition_stage_count":1,"national_competition_designated_stage_numbers":[1],"national_competition_stage_types":["hilly_mountain"],"route_library_version":"v1","national_championship_host_eligibility":"allowed"}'::jsonb
);

insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  'e4038b04-79a6-4de0-bfca-bfd6426e2976',
  '73e1cb60-5f01-46e2-8f73-018ee45bc902',
  1,null,'Dochula Highlands Championship Route',
  'Thimphu','Wangdue Phodrang','Thimphu','BT',
  142.8,'mountain','uphill_finish',false,14,55,31,0,2785,
  '{}'::jsonb,'{}'::jsonb,
  '{"calendar_visibility":"hidden","reserve_pool":true,"route_identity":"thimphu-dochula-wangdue-championship","route_basis":"Thimphu → Dochula → Wangdue Phodrang with extended valley race loop","national_championship_host_eligibility":"allowed","national_competition_eligible":true,"national_competition_slot":"hilly_mountain","fairness_check":{"distance_km":142.8,"elevation_gain_m":2785,"elevation_gain_per_km":19.50,"mountain_pct":31}}'::jsonb,
  'Thimphu','Wangdue Phodrang','climber',
  'A sustained Bhutanese highland route using the real Dochula–Wangdue road corridor with a controlled total climbing load.',
  '[{"number":1,"km":91.4,"name":"Punakha Valley sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[{"number":1,"km":37.8,"name":"Dochula Pass","category":"Cat 1","length_km":15.5,"avg_gradient":5.1,"points_scheme":[15,10,7,5,3,1],"time_bonus_seconds":[]},{"number":2,"km":119.6,"name":"Wangdue Return Rise","category":"Cat 2","length_km":9.0,"avg_gradient":4.8,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]'::jsonb,
  'road_race'
);

insert into public.race_stage_profile_details(
  stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,distance_km,elevation_gain_m,
  terrain_type,profile_type,terrain_split,profile_points,route_markers,intermediate_sprints,
  mountain_climbs,metadata,weather_snapshot
) values (
  'e4038b04-79a6-4de0-bfca-bfd6426e2976',
  '73e1cb60-5f01-46e2-8f73-018ee45bc902',
  'Dochula Highlands Championship Route',
  'Thimphu → Dochula → Wangdue Phodrang',
  'A 142.8 km mountain championship route centered on the real Dochula–Wangdue corridor. The profile features long continuous climbing and descending rather than artificial repeated spikes.',
  null,142.8,2785,'mountain','climber',
  '{"flat":14,"hilly":55,"mountain":31,"cobbled":0}'::jsonb,
  '[{"km":0,"elevation":2330,"elevation_m":2330},{"km":12.1,"elevation":2460,"elevation_m":2460},{"km":24.0,"elevation":2730,"elevation_m":2730},{"km":37.8,"elevation":3150,"elevation_m":3150},{"km":50.2,"elevation":2700,"elevation_m":2700},{"km":62.9,"elevation":2220,"elevation_m":2220},{"km":75.5,"elevation":1700,"elevation_m":1700},{"km":88.1,"elevation":1260,"elevation_m":1260},{"km":100.8,"elevation":1410,"elevation_m":1410},{"km":112.6,"elevation":1610,"elevation_m":1610},{"km":124.2,"elevation":1450,"elevation_m":1450},{"km":134.1,"elevation":1320,"elevation_m":1320},{"km":142.8,"elevation":1200,"elevation_m":1200}]'::jsonb,
  '[{"km":0,"type":"start","label":"Start","name":"Thimphu"},{"km":37.8,"type":"kom","label":"Cat 1","name":"Dochula Pass"},{"km":91.4,"type":"sprint","label":"Sprint","name":"Punakha Valley sprint"},{"km":119.6,"type":"kom","label":"Cat 2","name":"Wangdue Return Rise"},{"km":142.8,"type":"finish","label":"Finish","name":"Wangdue Phodrang"}]'::jsonb,
  (select intermediate_sprints_json from public.race_stages where id='e4038b04-79a6-4de0-bfca-bfd6426e2976'),
  (select mountain_climbs_json from public.race_stages where id='e4038b04-79a6-4de0-bfca-bfd6426e2976'),
  '{"reserve_pool":true,"route_identity":"thimphu-dochula-wangdue-championship","unscheduled_template":true,"national_competition_eligible":true,"national_competition_slot":"hilly_mountain","fairness_check":{"distance_km":142.8,"elevation_gain_m":2785,"elevation_gain_per_km":19.50,"mountain_pct":31}}'::jsonb,
  null
);

insert into public.race_reserve_pool(
  id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
) values (
  '0cc916d4-1f0a-464e-817f-2868f6982584',
  '73e1cb60-5f01-46e2-8f73-018ee45bc902','BT','hidden',true,false,
  array['national_championship','qualification','final','general_reserve']::text[],
  'hard',
  'Primary Bhutan National Championship reserve route. Reusable for qualification and final.'
);
select public.initialize_race_entry_rules_v1('73e1cb60-5f01-46e2-8f73-018ee45bc902'::uuid,'1.2',null,42000);
select public.sync_race_stage_points_from_stage_json_v1('e4038b04-79a6-4de0-bfca-bfd6426e2976',true);

-- ---------------------------------------------------------------------------
-- Burundi — Burundi Highlands Classic
-- ---------------------------------------------------------------------------
insert into public.races(
  id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
  is_stage_race,stage_count,status,description,metadata
) values (
  'eedcc3c4-e64c-42a3-adbb-b015cd9e7515',
  'Burundi Highlands Classic',
  'Burundi Highlands',
  null,null,'BI','Bujumbura','1.2','one_day',false,1,'draft',
  'A one-day championship race from Bujumbura into Burundi''s central highlands via Muramvya, with a finishing circuit around Gitega.',
  '{"calendar_visibility":"hidden","reserve_pool":true,"reserve_country_code":"BI","future_regular_calendar_eligible":true,"national_competition_stage_count":1,"national_competition_designated_stage_numbers":[1],"national_competition_stage_types":["hilly_mountain"],"route_library_version":"v1","national_championship_host_eligibility":"allowed"}'::jsonb
);

insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  '6bc92f88-e7be-4ad2-b7ce-3be6d313289d',
  'eedcc3c4-e64c-42a3-adbb-b015cd9e7515',
  1,null,'Bujumbura to Gitega Highlands Championship',
  'Bujumbura','Gitega','Bujumbura','BI',
  149.6,'hilly','uphill_finish',false,24,60,16,0,2235,
  '{}'::jsonb,'{}'::jsonb,
  '{"calendar_visibility":"hidden","reserve_pool":true,"route_identity":"bujumbura-muramvya-gitega-championship","route_basis":"Bujumbura → Muramvya → Gitega with Gitega finishing circuit","national_championship_host_eligibility":"allowed","national_competition_eligible":true,"national_competition_slot":"hilly_mountain","fairness_check":{"distance_km":149.6,"elevation_gain_m":2235,"elevation_gain_per_km":14.94,"mountain_pct":16}}'::jsonb,
  'Bujumbura','Gitega','puncheur',
  'A realistic central-highland championship course using the Bujumbura–Muramvya–Gitega corridor and an extended finishing circuit.',
  '[{"number":1,"km":53.0,"name":"Muramvya sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":118.4,"name":"Gitega circuit sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[{"number":1,"km":39.2,"name":"Mugongo Rise","category":"Cat 3","length_km":6.3,"avg_gradient":4.4,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":86.7,"name":"Muramvya Highlands","category":"Cat 2","length_km":9.4,"avg_gradient":4.9,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]'::jsonb,
  'road_race'
);

insert into public.race_stage_profile_details(
  stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,distance_km,elevation_gain_m,
  terrain_type,profile_type,terrain_split,profile_points,route_markers,intermediate_sprints,
  mountain_climbs,metadata,weather_snapshot
) values (
  '6bc92f88-e7be-4ad2-b7ce-3be6d313289d',
  'eedcc3c4-e64c-42a3-adbb-b015cd9e7515',
  'Bujumbura to Gitega Highlands Championship',
  'Bujumbura → Muramvya → Gitega',
  'A 149.6 km hilly championship race from Lake Tanganyika into Burundi''s central highlands. The route builds gradually rather than using unrealistic repeated micro-climbs.',
  null,149.6,2235,'hilly','puncheur',
  '{"flat":24,"hilly":60,"mountain":16,"cobbled":0}'::jsonb,
  '[{"km":0,"elevation":780,"elevation_m":780},{"km":12.6,"elevation":910,"elevation_m":910},{"km":25.4,"elevation":1120,"elevation_m":1120},{"km":39.2,"elevation":1460,"elevation_m":1460},{"km":53.0,"elevation":1880,"elevation_m":1880},{"km":66.8,"elevation":1760,"elevation_m":1760},{"km":80.6,"elevation":1950,"elevation_m":1950},{"km":94.3,"elevation":1840,"elevation_m":1840},{"km":107.9,"elevation":1690,"elevation_m":1690},{"km":121.5,"elevation":1580,"elevation_m":1580},{"km":132.8,"elevation":1640,"elevation_m":1640},{"km":141.8,"elevation":1695,"elevation_m":1695},{"km":149.6,"elevation":1725,"elevation_m":1725}]'::jsonb,
  '[{"km":0,"type":"start","label":"Start","name":"Bujumbura"},{"km":39.2,"type":"kom","label":"Cat 3","name":"Mugongo Rise"},{"km":53.0,"type":"sprint","label":"Sprint 1","name":"Muramvya sprint"},{"km":86.7,"type":"kom","label":"Cat 2","name":"Muramvya Highlands"},{"km":118.4,"type":"sprint","label":"Sprint 2","name":"Gitega circuit sprint"},{"km":149.6,"type":"finish","label":"Finish","name":"Gitega"}]'::jsonb,
  (select intermediate_sprints_json from public.race_stages where id='6bc92f88-e7be-4ad2-b7ce-3be6d313289d'),
  (select mountain_climbs_json from public.race_stages where id='6bc92f88-e7be-4ad2-b7ce-3be6d313289d'),
  '{"reserve_pool":true,"route_identity":"bujumbura-muramvya-gitega-championship","unscheduled_template":true,"national_competition_eligible":true,"national_competition_slot":"hilly_mountain","fairness_check":{"distance_km":149.6,"elevation_gain_m":2235,"elevation_gain_per_km":14.94,"mountain_pct":16}}'::jsonb,
  null
);

insert into public.race_reserve_pool(
  id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
) values (
  'a68b6448-4457-4b32-bd67-3594df183c77',
  'eedcc3c4-e64c-42a3-adbb-b015cd9e7515','BI','hidden',true,false,
  array['national_championship','qualification','final','general_reserve']::text[],
  'hard',
  'Primary Burundi National Championship reserve route. Reusable for qualification and final.'
);
select public.initialize_race_entry_rules_v1('eedcc3c4-e64c-42a3-adbb-b015cd9e7515'::uuid,'1.2',null,34500);
select public.sync_race_stage_points_from_stage_json_v1('6bc92f88-e7be-4ad2-b7ce-3be6d313289d',true);

commit;
