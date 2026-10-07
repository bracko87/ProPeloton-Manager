-- American Samoa hidden reserve race package.
-- Race: Tour of Tutuila
-- Research basis:
--   AS001 runs Poloa -> Pago Pago -> Onenoa and is about 57.7 km end-to-end.
--   AS005 connects Pago Pago with Fagasa and is about 8.0 km.
--   AS006 connects Aua with Vatia and is about 8.7 km.
-- The reserve race has no calendar dates and can later be cloned into
-- National Championships, National Association / World Nations events,
-- or promoted into the regular senior calendar.

begin;

insert into public.races (
  id,
  name,
  short_name,
  start_date,
  end_date,
  country_code,
  host_city,
  category,
  race_type,
  is_stage_race,
  stage_count,
  status,
  description,
  metadata
)
values (
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  'Tour of Tutuila',
  'Tutuila Tour',
  null,
  null,
  'AS',
  'Pago Pago',
  '2.2',
  'stage_race',
  true,
  3,
  'draft',
  'A three-stage Tour of Tutuila using the island''s real territorial road network. This reserve edition has no scheduled date and can be used as a source for National Championships, National Association competitions, or a future regular senior calendar slot.',
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'reserve_country_code','AS',
    'future_regular_calendar_eligible',true,
    'route_library_version','v1',
    'island','Tutuila',
    'national_championship_host_eligibility','allowed',
    'route_research',jsonb_build_object(
      'as001_endpoints','Poloa to Onenoa via Pago Pago',
      'as001_distance_km',57.7,
      'as005_endpoints','Pago Pago to Fagasa',
      'as005_distance_km',8.0,
      'as006_endpoints','Aua to Vatia',
      'as006_distance_km',8.7
    )
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
  intermediate_sprints_json,mountain_climbs_json,
  stage_format
)
values
(
  '3279c6e9-83f9-4c6c-98a9-1d4e82865397',
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  1,
  null,
  'Stage 1 · Tafuna to Pago Pago Team Time Trial',
  'Tafuna',
  'Pago Pago',
  'Tafuna',
  'AS',
  31.0,
  'flat',
  'flat_finish',
  false,
  88,12,0,0,
  240,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','tafuna-leone-pago-pago-ttt',
    'road_basis','AS001',
    'route_note','Tafuna west to Leone, turnaround, then east along AS001 through Tafuna and Nuuuli to Pago Pago.',
    'national_championship_host_eligibility','excluded',
    'national_association_route_type','team_time_trial'
  ),
  'Tafuna',
  'Pago Pago',
  'team_time_trial',
  'Opening team time trial on the southern Route 001 corridor: Tafuna to Leone, turnaround, then east to Pago Pago.',
  '[]'::jsonb,
  '[]'::jsonb,
  'team_time_trial'
),
(
  'f8ac702f-a395-4381-8e39-401da0a717ea',
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  2,
  null,
  'Stage 2 · Poloa to Pago Pago',
  'Poloa',
  'Pago Pago',
  'Poloa',
  'AS',
  146.0,
  'flat',
  'flat_finish',
  false,
  76,24,0,0,
  1360,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','poloa-onenoa-poloa-pago-pago',
    'road_basis','AS001',
    'route_note','Full AS001 crossing from Poloa to Onenoa, return to Poloa, then final eastbound run to Pago Pago.',
    'national_championship_host_eligibility','allowed',
    'national_association_route_type','flat'
  ),
  'Poloa',
  'Pago Pago',
  'sprinter',
  'Long coastal road stage using AS001 end-to-end before returning west and finishing in Pago Pago.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',57.7,'name','Onenoa turnaround sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',127.0,'name','Leone coast sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  'road_race'
),
(
  '6813d409-18ae-41aa-a5b3-3a7b684e416c',
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  3,
  null,
  'Stage 3 · Pago Pago Rainforest Circuit',
  'Pago Pago',
  'Pago Pago',
  'Pago Pago',
  'AS',
  136.2,
  'hilly',
  'flat_finish',
  false,
  30,58,12,0,
  2380,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','pago-pago-fagasa-vatia-rainforest-circuit',
    'road_basis','AS005 + AS001 + AS006',
    'route_note','Three central Tutuila circuits linking Pago Pago with Fagasa via Fagasa Pass and Vatia via Aua and Afono Pass, followed by a short harbor-side finish loop.',
    'national_championship_host_eligibility','allowed',
    'national_association_route_type','hilly_mountain'
  ),
  'Pago Pago',
  'Pago Pago',
  'puncheur',
  'Selective rainforest circuit with repeated crossings of Fagasa Pass and Afono Pass, designed for puncheurs and strong climbers without becoming a high-mountain stage.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',42.4,'name','Pago Pago lap sprint 1',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',84.8,'name','Pago Pago lap sprint 2',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',3,'km',127.2,'name','Pago Pago lap sprint 3',
      'points','standard','points_scheme',jsonb_build_array(8,5,3,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',8.0,'name','Fagasa Pass I','category','Cat 3',
      'length_km',4.0,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',29.0,'name','Afono Pass I','category','Cat 3',
      'length_km',3.5,'avg_gradient',4.8,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',3,'km',50.4,'name','Fagasa Pass II','category','Cat 3',
      'length_km',4.0,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',4,'km',71.4,'name','Afono Pass II','category','Cat 3',
      'length_km',3.5,'avg_gradient',4.8,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',5,'km',92.8,'name','Fagasa Pass III','category','Cat 3',
      'length_km',4.0,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',6,'km',113.8,'name','Afono Pass III','category','Cat 3',
      'length_km',3.5,'avg_gradient',4.8,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
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
  '3279c6e9-83f9-4c6c-98a9-1d4e82865397',
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  'Stage 1 · Tafuna to Pago Pago Team Time Trial',
  'Tafuna → Leone turnaround → Pago Pago (AS001)',
  'A fast but gently rolling team time trial. Teams leave Tafuna, ride west on Route 001 to Leone, turn around, and race east through the main southern settlements to the finish in Pago Pago.',
  null,
  31.0,
  240,
  'flat',
  'team_time_trial',
  jsonb_build_object('flat',88,'hilly',12,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',13,'elevation_m',13),
    jsonb_build_object('km',4,'elevation',20,'elevation_m',20),
    jsonb_build_object('km',8,'elevation',28,'elevation_m',28),
    jsonb_build_object('km',10.2,'elevation',21,'elevation_m',21),
    jsonb_build_object('km',14,'elevation',31,'elevation_m',31),
    jsonb_build_object('km',18,'elevation',19,'elevation_m',19),
    jsonb_build_object('km',22,'elevation',36,'elevation_m',36),
    jsonb_build_object('km',26,'elevation',24,'elevation_m',24),
    jsonb_build_object('km',31,'elevation',8,'elevation_m',8)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Tafuna'),
    jsonb_build_object('km',10.2,'type','route','label','Turnaround','name','Leone'),
    jsonb_build_object('km',31,'type','finish','label','Finish','name','Pago Pago')
  ),
  '[]'::jsonb,
  '[]'::jsonb,
  jsonb_build_object(
    'reserve_pool',true,
    'route_identity','tafuna-leone-pago-pago-ttt',
    'road_basis','AS001',
    'unscheduled_template',true
  ),
  null
),
(
  'f8ac702f-a395-4381-8e39-401da0a717ea',
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  'Stage 2 · Poloa to Pago Pago',
  'Poloa → Onenoa → Poloa → Pago Pago (AS001)',
  'The race uses the complete east-west Route 001 corridor. From Poloa the peloton crosses Tutuila to the eastern road end at Onenoa, returns all the way to Poloa, then heads east again for a fast finish in Pago Pago.',
  null,
  146.0,
  1360,
  'flat',
  'sprinter',
  jsonb_build_object('flat',76,'hilly',24,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',22,'elevation_m',22),
    jsonb_build_object('km',10,'elevation',55,'elevation_m',55),
    jsonb_build_object('km',20,'elevation',28,'elevation_m',28),
    jsonb_build_object('km',30.6,'elevation',10,'elevation_m',10),
    jsonb_build_object('km',40,'elevation',62,'elevation_m',62),
    jsonb_build_object('km',50,'elevation',34,'elevation_m',34),
    jsonb_build_object('km',57.7,'elevation',6,'elevation_m',6),
    jsonb_build_object('km',68,'elevation',44,'elevation_m',44),
    jsonb_build_object('km',78,'elevation',25,'elevation_m',25),
    jsonb_build_object('km',88,'elevation',67,'elevation_m',67),
    jsonb_build_object('km',98,'elevation',26,'elevation_m',26),
    jsonb_build_object('km',108,'elevation',52,'elevation_m',52),
    jsonb_build_object('km',115.4,'elevation',22,'elevation_m',22),
    jsonb_build_object('km',126,'elevation',58,'elevation_m',58),
    jsonb_build_object('km',136,'elevation',27,'elevation_m',27),
    jsonb_build_object('km',146,'elevation',8,'elevation_m',8)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Poloa'),
    jsonb_build_object('km',57.7,'type','sprint','label','Sprint 1','name','Onenoa turnaround sprint'),
    jsonb_build_object('km',127,'type','sprint','label','Sprint 2','name','Leone coast sprint'),
    jsonb_build_object('km',146,'type','finish','label','Finish','name','Pago Pago')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',57.7,'name','Onenoa turnaround sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',127.0,'name','Leone coast sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  jsonb_build_object(
    'reserve_pool',true,
    'route_identity','poloa-onenoa-poloa-pago-pago',
    'road_basis','AS001',
    'unscheduled_template',true
  ),
  null
),
(
  '6813d409-18ae-41aa-a5b3-3a7b684e416c',
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  'Stage 3 · Pago Pago Rainforest Circuit',
  'Pago Pago → Fagasa → Pago Pago → Aua → Vatia → Pago Pago · 3 circuits',
  'Three selective circuits across central Tutuila. Each lap climbs from Pago Pago to Fagasa Pass, descends to Fagasa, returns over the pass, then crosses from Aua over Afono Pass toward Vatia before returning to Pago Pago. A short harbor-side extension completes the race distance.',
  null,
  136.2,
  2380,
  'hilly',
  'puncheur',
  jsonb_build_object('flat',30,'hilly',58,'mountain',12,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',4,'elevation',92,'elevation_m',92),
    jsonb_build_object('km',8,'elevation',185,'elevation_m',185),
    jsonb_build_object('km',12,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',16,'elevation',185,'elevation_m',185),
    jsonb_build_object('km',20,'elevation',10,'elevation_m',10),
    jsonb_build_object('km',25,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',29,'elevation',175,'elevation_m',175),
    jsonb_build_object('km',33,'elevation',26,'elevation_m',26),
    jsonb_build_object('km',36,'elevation',65,'elevation_m',65),
    jsonb_build_object('km',39.5,'elevation',175,'elevation_m',175),
    jsonb_build_object('km',42.4,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',46.4,'elevation',92,'elevation_m',92),
    jsonb_build_object('km',50.4,'elevation',185,'elevation_m',185),
    jsonb_build_object('km',54.4,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',58.4,'elevation',185,'elevation_m',185),
    jsonb_build_object('km',62.4,'elevation',10,'elevation_m',10),
    jsonb_build_object('km',67.4,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',71.4,'elevation',175,'elevation_m',175),
    jsonb_build_object('km',75.4,'elevation',26,'elevation_m',26),
    jsonb_build_object('km',78.4,'elevation',65,'elevation_m',65),
    jsonb_build_object('km',81.9,'elevation',175,'elevation_m',175),
    jsonb_build_object('km',84.8,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',88.8,'elevation',92,'elevation_m',92),
    jsonb_build_object('km',92.8,'elevation',185,'elevation_m',185),
    jsonb_build_object('km',96.8,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',100.8,'elevation',185,'elevation_m',185),
    jsonb_build_object('km',104.8,'elevation',10,'elevation_m',10),
    jsonb_build_object('km',109.8,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',113.8,'elevation',175,'elevation_m',175),
    jsonb_build_object('km',117.8,'elevation',26,'elevation_m',26),
    jsonb_build_object('km',120.8,'elevation',65,'elevation_m',65),
    jsonb_build_object('km',124.3,'elevation',175,'elevation_m',175),
    jsonb_build_object('km',127.2,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',132,'elevation',24,'elevation_m',24),
    jsonb_build_object('km',136.2,'elevation',8,'elevation_m',8)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Pago Pago'),
    jsonb_build_object('km',8,'type','kom','label','Cat 3','name','Fagasa Pass I'),
    jsonb_build_object('km',29,'type','kom','label','Cat 3','name','Afono Pass I'),
    jsonb_build_object('km',42.4,'type','sprint','label','Sprint 1','name','Pago Pago lap sprint 1'),
    jsonb_build_object('km',50.4,'type','kom','label','Cat 3','name','Fagasa Pass II'),
    jsonb_build_object('km',71.4,'type','kom','label','Cat 3','name','Afono Pass II'),
    jsonb_build_object('km',84.8,'type','sprint','label','Sprint 2','name','Pago Pago lap sprint 2'),
    jsonb_build_object('km',92.8,'type','kom','label','Cat 3','name','Fagasa Pass III'),
    jsonb_build_object('km',113.8,'type','kom','label','Cat 3','name','Afono Pass III'),
    jsonb_build_object('km',127.2,'type','sprint','label','Sprint 3','name','Pago Pago lap sprint 3'),
    jsonb_build_object('km',136.2,'type','finish','label','Finish','name','Pago Pago')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',42.4,'name','Pago Pago lap sprint 1',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',84.8,'name','Pago Pago lap sprint 2',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',3,'km',127.2,'name','Pago Pago lap sprint 3',
      'points','standard','points_scheme',jsonb_build_array(8,5,3,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',8.0,'name','Fagasa Pass I','category','Cat 3',
      'length_km',4.0,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',29.0,'name','Afono Pass I','category','Cat 3',
      'length_km',3.5,'avg_gradient',4.8,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',3,'km',50.4,'name','Fagasa Pass II','category','Cat 3',
      'length_km',4.0,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',4,'km',71.4,'name','Afono Pass II','category','Cat 3',
      'length_km',3.5,'avg_gradient',4.8,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',5,'km',92.8,'name','Fagasa Pass III','category','Cat 3',
      'length_km',4.0,'avg_gradient',4.4,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',6,'km',113.8,'name','Afono Pass III','category','Cat 3',
      'length_km',3.5,'avg_gradient',4.8,
      'points_scheme',jsonb_build_array(5,3,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  jsonb_build_object(
    'reserve_pool',true,
    'route_identity','pago-pago-fagasa-vatia-rainforest-circuit',
    'road_basis','AS005 + AS001 + AS006',
    'unscheduled_template',true,
    'pass_elevations_m',jsonb_build_object('Fagasa Pass',185,'Afono Pass',175)
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
  '34109e8d-4660-4067-8f5b-057fb2721915',
  '99b98873-60e6-4643-879d-7d2bd5a9edea',
  'AS',
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
  'hard',
  'American Samoa reserve route bundle: TTT, flat road race and hilly road race. Suitable for National Championship source selection, National Association / World Nations hosting and possible later regular-calendar promotion.'
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

select public.sync_race_stage_points_from_stage_json_v1(
  '3279c6e9-83f9-4c6c-98a9-1d4e82865397',
  true
);
select public.sync_race_stage_points_from_stage_json_v1(
  'f8ac702f-a395-4381-8e39-401da0a717ea',
  true
);
select public.sync_race_stage_points_from_stage_json_v1(
  '6813d409-18ae-41aa-a5b3-3a7b684e416c',
  true
);

update public.races
set start_date=null,end_date=null,stage_count=3,is_stage_race=true,updated_at=now()
where id='99b98873-60e6-4643-879d-7d2bd5a9edea';

update public.race_stages
set stage_date=null,weather_snapshot='{}'::jsonb,weather_summary=null,updated_at=now()
where race_id='99b98873-60e6-4643-879d-7d2bd5a9edea';

commit;
