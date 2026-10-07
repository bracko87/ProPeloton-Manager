-- Bahamas hidden reserve races.
--
-- Two separate backup races, exactly three stages total for National Competition use:
--   1) Nassau Coastal Time Trial (1.2) — one individual time trial.
--   2) Bahamas Islands Tour (2.2) — one flat road stage + one rolling/hilly road stage.
--
-- Route basis:
--   - New Providence cycling routes use West Bay Street, JFK Drive, Old Fort Bay,
--     Lyford Cay, Clifton Pier, South Ocean Blvd, Adelaide Road, Coral Harbour
--     and the airport corridor.
--   - Eleuthera rolling route uses Queen's Highway from Rock Sound north through
--     Governor's Harbour / Gregory Town to Glass Window Bridge, then returns south
--     to Governor's Harbour.
--
-- Both races remain unscheduled and hidden until explicitly assigned or promoted.

begin;

-- ---------------------------------------------------------------------------
-- Race A: Nassau Coastal Time Trial (one-day 1.2, one ITT stage)
-- ---------------------------------------------------------------------------

insert into public.races (
  id,name,short_name,start_date,end_date,country_code,host_city,
  category,race_type,is_stage_race,stage_count,status,description,metadata
)
values (
  '1c7d0f0d-6ea8-49ec-b9b7-0fc4a1d4f9c2',
  'Nassau Coastal Time Trial',
  'Nassau ITT',
  null,
  null,
  'BS',
  'Nassau',
  '1.2',
  'one_day',
  false,
  1,
  'draft',
  'A flat individual time trial on New Providence using the established western Nassau cycling corridor. Hidden reserve edition for National Competition use and possible future regular-calendar promotion.',
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'reserve_country_code','BS',
    'future_regular_calendar_eligible',true,
    'national_competition_stage_count',1,
    'national_competition_stage_types',jsonb_build_array('individual_time_trial'),
    'route_library_version','v1',
    'island','New Providence',
    'national_championship_host_eligibility','excluded'
  )
)
on conflict (id) do update
set
  name=excluded.name,
  short_name=excluded.short_name,
  start_date=null,
  end_date=null,
  country_code=excluded.country_code,
  host_city=excluded.host_city,
  category=excluded.category,
  race_type=excluded.race_type,
  is_stage_race=excluded.is_stage_race,
  stage_count=excluded.stage_count,
  status=excluded.status,
  description=excluded.description,
  metadata=excluded.metadata,
  updated_at=now();

insert into public.race_stages (
  id,race_id,stage_number,stage_date,name,
  start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,
  flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
  weather_snapshot,rules_snapshot,metadata,
  start_city_name,finish_city_name,profile_type,notes,
  intermediate_sprints_json,mountain_climbs_json,stage_format
)
values (
  '6bb8a5b6-4974-4a3f-8c63-f8c39d9f1a21',
  '1c7d0f0d-6ea8-49ec-b9b7-0fc4a1d4f9c2',
  1,
  null,
  'Nassau West Coast Individual Time Trial',
  'Nassau',
  'Nassau',
  'Nassau',
  'BS',
  38.6,
  'flat',
  'time_trial_finish',
  false,
  96,4,0,0,
  85,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','nassau-west-coast-individual-time-trial',
    'route_basis','West Bay Street -> Clifton / airport corridor -> JFK Drive -> Blake Road -> West Bay Street',
    'national_championship_host_eligibility','excluded',
    'national_association_route_type','individual_time_trial',
    'national_competition_slot','individual_time_trial'
  ),
  'Nassau',
  'Nassau',
  'time_trial',
  'Flat individual time trial using the western New Providence road circuit around West Bay Street, Clifton, the airport corridor, JFK Drive and Blake Road.',
  '[]'::jsonb,
  '[]'::jsonb,
  'individual_time_trial'
)
on conflict (id) do update
set
  race_id=excluded.race_id,
  stage_number=excluded.stage_number,
  stage_date=null,
  name=excluded.name,
  start_city=excluded.start_city,
  finish_city=excluded.finish_city,
  host_city=excluded.host_city,
  host_country_code=excluded.host_country_code,
  distance_km=excluded.distance_km,
  terrain_type=excluded.terrain_type,
  finish_type=excluded.finish_type,
  is_summit_finish=excluded.is_summit_finish,
  flat_pct=excluded.flat_pct,
  hilly_pct=excluded.hilly_pct,
  mountain_pct=excluded.mountain_pct,
  cobbled_pct=excluded.cobbled_pct,
  elevation_gain_m=excluded.elevation_gain_m,
  weather_snapshot='{}'::jsonb,
  rules_snapshot=excluded.rules_snapshot,
  metadata=excluded.metadata,
  start_city_name=excluded.start_city_name,
  finish_city_name=excluded.finish_city_name,
  profile_type=excluded.profile_type,
  notes=excluded.notes,
  intermediate_sprints_json=excluded.intermediate_sprints_json,
  mountain_climbs_json=excluded.mountain_climbs_json,
  stage_format=excluded.stage_format,
  updated_at=now();

insert into public.race_stage_profile_details (
  stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
  distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
  profile_points,route_markers,intermediate_sprints,mountain_climbs,
  metadata,weather_snapshot
)
values (
  '6bb8a5b6-4974-4a3f-8c63-f8c39d9f1a21',
  '1c7d0f0d-6ea8-49ec-b9b7-0fc4a1d4f9c2',
  'Nassau West Coast Individual Time Trial',
  'Nassau · West Bay Street → Clifton corridor → JFK Drive → Nassau',
  'A fast 38.6 km individual time trial inspired by the established 24-mile western New Providence cycling loop. The route is almost entirely flat, with wind exposure and roundabout exits providing the main technical challenge.',
  null,
  38.6,
  85,
  'flat',
  'time_trial',
  jsonb_build_object('flat',96,'hilly',4,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',7,'elevation_m',7),
    jsonb_build_object('km',5,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',10,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',15,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',20,'elevation',11,'elevation_m',11),
    jsonb_build_object('km',25,'elevation',7,'elevation_m',7),
    jsonb_build_object('km',30,'elevation',10,'elevation_m',10),
    jsonb_build_object('km',34.5,'elevation',6,'elevation_m',6),
    jsonb_build_object('km',38.6,'elevation',7,'elevation_m',7)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Nassau'),
    jsonb_build_object('km',15.5,'type','route','label','Clifton sector','name','Clifton'),
    jsonb_build_object('km',27.5,'type','route','label','JFK Drive','name','Nassau'),
    jsonb_build_object('km',38.6,'type','finish','label','Finish','name','Nassau')
  ),
  '[]'::jsonb,
  '[]'::jsonb,
  jsonb_build_object(
    'reserve_pool',true,
    'route_identity','nassau-west-coast-individual-time-trial',
    'unscheduled_template',true,
    'national_competition_slot','individual_time_trial'
  ),
  null
)
on conflict (stage_id) do update
set
  race_id=excluded.race_id,
  stage_title=excluded.stage_title,
  route_label=excluded.route_label,
  stage_summary=excluded.stage_summary,
  weather_summary=null,
  distance_km=excluded.distance_km,
  elevation_gain_m=excluded.elevation_gain_m,
  terrain_type=excluded.terrain_type,
  profile_type=excluded.profile_type,
  terrain_split=excluded.terrain_split,
  profile_points=excluded.profile_points,
  route_markers=excluded.route_markers,
  intermediate_sprints=excluded.intermediate_sprints,
  mountain_climbs=excluded.mountain_climbs,
  metadata=excluded.metadata,
  weather_snapshot=null,
  updated_at=now();

insert into public.race_reserve_pool (
  id,race_id,country_code,pool_key,active,is_calendar_public,
  intended_uses,difficulty,notes
)
values (
  '77f1fd20-2b7d-40a0-8e33-bce6c41f7f3d',
  '1c7d0f0d-6ea8-49ec-b9b7-0fc4a1d4f9c2',
  'BS',
  'hidden',
  true,
  false,
  array['national_association','general_reserve']::text[],
  'moderate',
  'Bahamas ITT reserve race. Exactly one individual time-trial stage for the National Competition three-stage package; not a National Championship road-route source.'
)
on conflict (race_id) do update
set
  country_code=excluded.country_code,
  pool_key=excluded.pool_key,
  active=excluded.active,
  is_calendar_public=excluded.is_calendar_public,
  intended_uses=excluded.intended_uses,
  difficulty=excluded.difficulty,
  notes=excluded.notes,
  updated_at=now();

select public.initialize_race_entry_rules_v1(
  '1c7d0f0d-6ea8-49ec-b9b7-0fc4a1d4f9c2'::uuid,
  '1.2',
  null,
  30000
);

select public.sync_race_stage_points_from_stage_json_v1(
  '6bb8a5b6-4974-4a3f-8c63-f8c39d9f1a21',
  true
);

-- ---------------------------------------------------------------------------
-- Race B: Bahamas Islands Tour (2.2, two road stages)
-- ---------------------------------------------------------------------------

insert into public.races (
  id,name,short_name,start_date,end_date,country_code,host_city,
  category,race_type,is_stage_race,stage_count,status,description,metadata
)
values (
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b',
  'Bahamas Islands Tour',
  'Bahamas Tour',
  null,
  null,
  'BS',
  'Nassau',
  '2.2',
  'stage_race',
  true,
  2,
  'draft',
  'A two-stage reserve race combining a flat New Providence circuit and a rolling Eleuthera road stage. Hidden until explicitly assigned or promoted to the senior calendar.',
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'reserve_country_code','BS',
    'future_regular_calendar_eligible',true,
    'national_competition_stage_count',2,
    'national_competition_stage_types',jsonb_build_array('flat','rolling_hilly'),
    'route_library_version','v1',
    'islands',jsonb_build_array('New Providence','Eleuthera'),
    'national_championship_host_eligibility','allowed'
  )
)
on conflict (id) do update
set
  name=excluded.name,
  short_name=excluded.short_name,
  start_date=null,
  end_date=null,
  country_code=excluded.country_code,
  host_city=excluded.host_city,
  category=excluded.category,
  race_type=excluded.race_type,
  is_stage_race=excluded.is_stage_race,
  stage_count=excluded.stage_count,
  status=excluded.status,
  description=excluded.description,
  metadata=excluded.metadata,
  updated_at=now();

insert into public.race_stages (
  id,race_id,stage_number,stage_date,name,
  start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,
  flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
  weather_snapshot,rules_snapshot,metadata,
  start_city_name,finish_city_name,profile_type,notes,
  intermediate_sprints_json,mountain_climbs_json,stage_format
)
values
(
  '4e2c4716-4aef-4e8f-994f-c340eed40799',
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b',
  1,
  null,
  'Stage 1 · Nassau West Coast Circuit',
  'Nassau',
  'Nassau',
  'Nassau',
  'BS',
  148.0,
  'flat',
  'flat_finish',
  false,
  94,6,0,0,
  220,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','nassau-west-coast-two-lap-road-race',
    'route_basis','Two laps of the established New Providence west-coast road-racing circuit',
    'national_championship_host_eligibility','allowed',
    'national_association_route_type','flat',
    'national_competition_slot','flat'
  ),
  'Nassau',
  'Nassau',
  'sprinter',
  'Two laps of the established western New Providence circuit through West Bay Street, JFK Drive, Old Fort Bay, Lyford Cay, Clifton, South Ocean, Adelaide, Coral Harbour and the airport corridor.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',74.0,'name','Nassau lap sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',124.0,'name','Coral Harbour sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  'road_race'
),
(
  '939ef6a8-367c-4f8c-8dda-fd777c4ed9d0',
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b',
  2,
  null,
  'Stage 2 · Rock Sound to Governor''s Harbour via Glass Window',
  'Rock Sound',
  'Governor''s Harbour',
  'Rock Sound',
  'BS',
  146.5,
  'hilly',
  'flat_finish',
  false,
  45,55,0,0,
  720,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','rock-sound-glass-window-governors-harbour',
    'route_basis','Queen''s Highway north from Rock Sound to Glass Window Bridge, turnaround, south to Governor''s Harbour',
    'national_championship_host_eligibility','allowed',
    'national_association_route_type','hilly_mountain',
    'national_competition_slot','rolling_hilly'
  ),
  'Rock Sound',
  'Governor''s Harbour',
  'puncheur',
  'Rolling Eleuthera road stage on Queen''s Highway, including the more selective Gregory Town / Glass Window sector before the return to Governor''s Harbour.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',51.5,'name','Governor''s Harbour sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',127.0,'name','James Cistern return sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',91.5,'name','Gregory Town Hill North','category','Cat 4',
      'length_km',1.8,'avg_gradient',4.6,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',106.5,'name','Gregory Town Hill South','category','Cat 4',
      'length_km',1.7,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  'road_race'
)
on conflict (id) do update
set
  race_id=excluded.race_id,
  stage_number=excluded.stage_number,
  stage_date=null,
  name=excluded.name,
  start_city=excluded.start_city,
  finish_city=excluded.finish_city,
  host_city=excluded.host_city,
  host_country_code=excluded.host_country_code,
  distance_km=excluded.distance_km,
  terrain_type=excluded.terrain_type,
  finish_type=excluded.finish_type,
  is_summit_finish=excluded.is_summit_finish,
  flat_pct=excluded.flat_pct,
  hilly_pct=excluded.hilly_pct,
  mountain_pct=excluded.mountain_pct,
  cobbled_pct=excluded.cobbled_pct,
  elevation_gain_m=excluded.elevation_gain_m,
  weather_snapshot='{}'::jsonb,
  rules_snapshot=excluded.rules_snapshot,
  metadata=excluded.metadata,
  start_city_name=excluded.start_city_name,
  finish_city_name=excluded.finish_city_name,
  profile_type=excluded.profile_type,
  notes=excluded.notes,
  intermediate_sprints_json=excluded.intermediate_sprints_json,
  mountain_climbs_json=excluded.mountain_climbs_json,
  stage_format=excluded.stage_format,
  updated_at=now();

insert into public.race_stage_profile_details (
  stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
  distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
  profile_points,route_markers,intermediate_sprints,mountain_climbs,
  metadata,weather_snapshot
)
values
(
  '4e2c4716-4aef-4e8f-994f-c340eed40799',
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b',
  'Stage 1 · Nassau West Coast Circuit',
  'Nassau → Clifton / South Ocean / Coral Harbour circuit → Nassau · 2 laps',
  'A 148 km flat road race built from two laps of the established 46-mile New Providence racing circuit. Wind, exposed coastal roads and positioning are more important than climbing.',
  null,
  148.0,
  220,
  'flat',
  'sprinter',
  jsonb_build_object('flat',94,'hilly',6,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',7,'elevation_m',7),
    jsonb_build_object('km',12,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',24,'elevation',13,'elevation_m',13),
    jsonb_build_object('km',36,'elevation',6,'elevation_m',6),
    jsonb_build_object('km',50,'elevation',11,'elevation_m',11),
    jsonb_build_object('km',62,'elevation',5,'elevation_m',5),
    jsonb_build_object('km',74,'elevation',7,'elevation_m',7),
    jsonb_build_object('km',86,'elevation',10,'elevation_m',10),
    jsonb_build_object('km',98,'elevation',14,'elevation_m',14),
    jsonb_build_object('km',110,'elevation',6,'elevation_m',6),
    jsonb_build_object('km',124,'elevation',10,'elevation_m',10),
    jsonb_build_object('km',136,'elevation',5,'elevation_m',5),
    jsonb_build_object('km',148,'elevation',7,'elevation_m',7)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Nassau'),
    jsonb_build_object('km',37,'type','route','label','Clifton sector','name','Clifton'),
    jsonb_build_object('km',74,'type','sprint','label','Sprint 1','name','Nassau lap sprint'),
    jsonb_build_object('km',111,'type','route','label','Clifton sector','name','Clifton'),
    jsonb_build_object('km',124,'type','sprint','label','Sprint 2','name','Coral Harbour sprint'),
    jsonb_build_object('km',148,'type','finish','label','Finish','name','Nassau')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',74.0,'name','Nassau lap sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',124.0,'name','Coral Harbour sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  jsonb_build_object(
    'reserve_pool',true,
    'route_identity','nassau-west-coast-two-lap-road-race',
    'unscheduled_template',true,
    'national_competition_slot','flat'
  ),
  null
),
(
  '939ef6a8-367c-4f8c-8dda-fd777c4ed9d0',
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b',
  'Stage 2 · Rock Sound to Governor''s Harbour via Glass Window',
  'Rock Sound → Governor''s Harbour → Gregory Town → Glass Window Bridge → Governor''s Harbour',
  'A 146.5 km rolling Queen''s Highway stage on Eleuthera. Riders travel north from Rock Sound through Governor''s Harbour and Gregory Town to the Glass Window Bridge, turn there, and return south to finish in Governor''s Harbour.',
  null,
  146.5,
  720,
  'hilly',
  'puncheur',
  jsonb_build_object('flat',45,'hilly',55,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',14.5,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',28,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',40,'elevation',24,'elevation_m',24),
    jsonb_build_object('km',51.5,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',64,'elevation',16,'elevation_m',16),
    jsonb_build_object('km',76,'elevation',24,'elevation_m',24),
    jsonb_build_object('km',86,'elevation',31,'elevation_m',31),
    jsonb_build_object('km',91.5,'elevation',43,'elevation_m',43),
    jsonb_build_object('km',99,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',106.5,'elevation',42,'elevation_m',42),
    jsonb_build_object('km',116,'elevation',25,'elevation_m',25),
    jsonb_build_object('km',127,'elevation',17,'elevation_m',17),
    jsonb_build_object('km',137,'elevation',23,'elevation_m',23),
    jsonb_build_object('km',146.5,'elevation',9,'elevation_m',9)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Rock Sound'),
    jsonb_build_object('km',51.5,'type','sprint','label','Sprint 1','name','Governor''s Harbour sprint'),
    jsonb_build_object('km',91.5,'type','kom','label','Cat 4','name','Gregory Town Hill North'),
    jsonb_build_object('km',99,'type','route','label','Turnaround','name','Glass Window Bridge'),
    jsonb_build_object('km',106.5,'type','kom','label','Cat 4','name','Gregory Town Hill South'),
    jsonb_build_object('km',127,'type','sprint','label','Sprint 2','name','James Cistern return sprint'),
    jsonb_build_object('km',146.5,'type','finish','label','Finish','name','Governor''s Harbour')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',51.5,'name','Governor''s Harbour sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',127.0,'name','James Cistern return sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',91.5,'name','Gregory Town Hill North','category','Cat 4',
      'length_km',1.8,'avg_gradient',4.6,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',106.5,'name','Gregory Town Hill South','category','Cat 4',
      'length_km',1.7,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  jsonb_build_object(
    'reserve_pool',true,
    'route_identity','rock-sound-glass-window-governors-harbour',
    'unscheduled_template',true,
    'national_competition_slot','rolling_hilly'
  ),
  null
)
on conflict (stage_id) do update
set
  race_id=excluded.race_id,
  stage_title=excluded.stage_title,
  route_label=excluded.route_label,
  stage_summary=excluded.stage_summary,
  weather_summary=null,
  distance_km=excluded.distance_km,
  elevation_gain_m=excluded.elevation_gain_m,
  terrain_type=excluded.terrain_type,
  profile_type=excluded.profile_type,
  terrain_split=excluded.terrain_split,
  profile_points=excluded.profile_points,
  route_markers=excluded.route_markers,
  intermediate_sprints=excluded.intermediate_sprints,
  mountain_climbs=excluded.mountain_climbs,
  metadata=excluded.metadata,
  weather_snapshot=null,
  updated_at=now();

insert into public.race_reserve_pool (
  id,race_id,country_code,pool_key,active,is_calendar_public,
  intended_uses,difficulty,notes
)
values (
  '49c4dd8f-8f6b-4a28-aaf2-3666458f4112',
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b',
  'BS',
  'hidden',
  true,
  false,
  array[
    'national_championship',
    'qualification',
    'final',
    'national_association',
    'general_reserve'
  ]::text[],
  'moderate',
  'Bahamas two-stage road reserve race. Exactly two road stages for the National Competition three-stage package: one flat and one rolling/hilly. Both are eligible as National Championship road sources.'
)
on conflict (race_id) do update
set
  country_code=excluded.country_code,
  pool_key=excluded.pool_key,
  active=excluded.active,
  is_calendar_public=excluded.is_calendar_public,
  intended_uses=excluded.intended_uses,
  difficulty=excluded.difficulty,
  notes=excluded.notes,
  updated_at=now();

select public.initialize_race_entry_rules_v1(
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b'::uuid,
  '2.2',
  null,
  90000
);

select public.sync_race_stage_points_from_stage_json_v1(
  '4e2c4716-4aef-4e8f-994f-c340eed40799',
  true
);

select public.sync_race_stage_points_from_stage_json_v1(
  '939ef6a8-367c-4f8c-8dda-fd777c4ed9d0',
  true
);

update public.races
set start_date=null,end_date=null,updated_at=now()
where id in (
  '1c7d0f0d-6ea8-49ec-b9b7-0fc4a1d4f9c2',
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b'
);

update public.race_stages
set stage_date=null,weather_snapshot='{}'::jsonb,weather_summary=null,updated_at=now()
where race_id in (
  '1c7d0f0d-6ea8-49ec-b9b7-0fc4a1d4f9c2',
  '2fb6c477-5014-409e-b7f3-04c9d3c52c0b'
);

commit;
