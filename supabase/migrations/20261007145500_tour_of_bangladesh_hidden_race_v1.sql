-- Bangladesh hidden reserve race: Tour of Bangladesh.
--
-- Five-stage senior race designed as a reusable hidden calendar race.
-- Only three stages are explicitly designated for the three-stage National
-- Competition package:
--   Stage 1 = team time trial
--   Stage 2 = flat road race
--   Stage 5 = hilly/mountain road race
-- Stages 3 and 4 are additional senior-calendar / reserve stages.
--
-- Route research:
--   * Purbachal Expressway (N301) is about 12.5 km between Kuril and Kanchan.
--   * RHD distance tool gives Jatrabari -> Bhanga as 72.934 km.
--   * Chattogram -> Cox's Bazar is about 150 km via N1.
--   * Cox's Bazar -> Teknaf Marine Drive is about 80 km one way.
--   * Z1811 starts in Bandarban; official RHD markers place Nilgiri about
--     45-47 km from Bandarban and Thanchi about 78 km from the start.
--
-- Race is unscheduled and hidden until explicitly assigned or promoted.

begin;

insert into public.races (
  id,name,short_name,start_date,end_date,country_code,host_city,
  category,race_type,is_stage_race,stage_count,status,description,metadata
)
values (
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  'Tour of Bangladesh',
  'Bangladesh Tour',
  null,
  null,
  'BD',
  'Dhaka',
  '2.2',
  'stage_race',
  true,
  5,
  'draft',
  'A five-stage Tour of Bangladesh linking Dhaka, the south-eastern coast and the Chittagong Hill Tracts. This hidden reserve edition can later be promoted to the regular senior calendar while supplying the required National Competition route types.',
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'reserve_country_code','BD',
    'future_regular_calendar_eligible',true,
    'national_competition_stage_count',3,
    'national_competition_designated_stage_numbers',jsonb_build_array(1,2,5),
    'national_competition_stage_types',jsonb_build_array(
      'team_time_trial','flat','hilly_mountain'
    ),
    'route_library_version','v1',
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
  '72df3f83-2ed9-46db-9497-6228bc499b32',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  1,null,
  'Stage 1 · Dhaka Purbachal Team Time Trial',
  'Dhaka','Dhaka','Dhaka','BD',
  25.0,
  'flat',
  'team_time_trial_finish',
  false,
  95,5,0,0,
  55,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','dhaka-purbachal-team-time-trial',
    'route_basis','Purbachal Expressway / N301 out-and-back between Kuril and Kanchan Bridge',
    'national_championship_host_eligibility','excluded',
    'national_association_route_type','team_time_trial',
    'national_competition_eligible',true,
    'national_competition_slot','team_time_trial'
  ),
  'Dhaka','Dhaka',
  'team_time_trial',
  'Opening team time trial on the broad Purbachal Expressway, using the approximately 12.5 km Kuril-to-Kanchan corridor as an out-and-back course.',
  '[]'::jsonb,
  '[]'::jsonb,
  'team_time_trial'
),
(
  '6d712804-e45e-4cb7-bb98-3635afaa5bb3',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  2,null,
  'Stage 2 · Dhaka to Bhanga and Return',
  'Dhaka','Dhaka','Dhaka','BD',
  145.9,
  'flat',
  'flat_finish',
  false,
  88,12,0,0,
  460,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','dhaka-bhanga-dhaka-n8',
    'route_basis','N8 / Dhaka-Bhanga corridor, turnaround at Bhanga',
    'national_championship_host_eligibility','allowed',
    'national_association_route_type','flat',
    'national_competition_eligible',true,
    'national_competition_slot','flat'
  ),
  'Dhaka','Dhaka',
  'sprinter',
  'Flat championship-length road stage from Jatrabari toward Bhanga on N8, crossing the Padma corridor before turning at Bhanga and returning to Dhaka.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',54.0,'name','Mawa sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',112.0,'name','Mawa return sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  'road_race'
),
(
  'a08eaec6-36c3-480e-895a-4b66c0c0f1e0',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  3,null,
  'Stage 3 · Chattogram to Cox''s Bazar',
  'Chattogram','Cox''s Bazar','Chattogram','BD',
  150.0,
  'hilly',
  'flat_finish',
  false,
  40,52,8,0,
  1220,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','chattogram-coxs-bazar-n1',
    'route_basis','N1 south via Patiya, Chakaria and Ramu',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',false,
    'reserve_role','future_regular_calendar_or_backup'
  ),
  'Chattogram','Cox''s Bazar',
  'puncheur',
  'A rolling southbound stage on N1 from Chattogram through Patiya, Chakaria and Ramu to the coast at Cox''s Bazar.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',49.0,'name','Patiya sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',112.0,'name','Chakaria sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',88.0,'name','Lohagara rolling crest','category','Cat 4',
      'length_km',3.5,'avg_gradient',3.6,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',132.0,'name','Ramu approach crest','category','Cat 4',
      'length_km',3.0,'avg_gradient',3.8,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  'road_race'
),
(
  '00abeef4-df4a-4a34-a294-074865da7b72',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  4,null,
  'Stage 4 · Cox''s Bazar Marine Drive',
  'Cox''s Bazar','Cox''s Bazar','Cox''s Bazar','BD',
  160.0,
  'flat',
  'flat_finish',
  false,
  78,22,0,0,
  680,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','coxs-bazar-teknaf-coxs-bazar-marine-drive',
    'route_basis','Z1098 Cox''s Bazar-Teknaf Marine Drive out-and-back',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',false,
    'reserve_role','future_regular_calendar_or_backup'
  ),
  'Cox''s Bazar','Cox''s Bazar',
  'sprinter',
  'Exposed coastal stage from Cox''s Bazar to Teknaf on the Marine Drive and back, with only gentle rolling sections between beach and foothills.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',40.0,'name','Inani sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',80.0,'name','Teknaf turnaround sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',3,'km',120.0,'name','Inani return sprint',
      'points','standard','points_scheme',jsonb_build_array(8,5,3,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  'road_race'
),
(
  '28a4e8c2-7f35-4cb8-8ac2-6445e0752a2d',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  5,null,
  'Stage 5 · Bandarban to Thanchi and Return',
  'Bandarban','Bandarban','Bandarban','BD',
  156.0,
  'mountain',
  'flat_finish',
  false,
  12,54,34,0,
  2940,
  '{}'::jsonb,
  '{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'route_identity','bandarban-thanchi-bandarban-z1811',
    'route_basis','Z1811 via Chimbuk and Nilgiri to Thanchi, then return',
    'national_championship_host_eligibility','allowed',
    'national_association_route_type','hilly_mountain',
    'national_competition_eligible',true,
    'national_competition_slot','hilly_mountain'
  ),
  'Bandarban','Bandarban',
  'climber',
  'Queen stage on Z1811 from Bandarban through Chimbuk and Nilgiri to Thanchi, then back over the same hill-tract corridor. The profile is difficult but kept inside National Championship fairness limits.',
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',78.0,'name','Thanchi valley sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',24.2,'name','Chimbuk Hill','category','Cat 2',
      'length_km',9.0,'avg_gradient',5.2,
      'points_scheme',jsonb_build_array(10,6,4,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',45.0,'name','Nilgiri','category','Cat 1',
      'length_km',8.5,'avg_gradient',6.0,
      'points_scheme',jsonb_build_array(15,10,7,5,3,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',3,'km',111.0,'name','Nilgiri Return','category','Cat 1',
      'length_km',9.5,'avg_gradient',5.8,
      'points_scheme',jsonb_build_array(15,10,7,5,3,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',4,'km',131.8,'name','Chimbuk Return','category','Cat 2',
      'length_km',8.0,'avg_gradient',5.0,
      'points_scheme',jsonb_build_array(10,6,4,2,1),'time_bonus_seconds','[]'::jsonb
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
  '72df3f83-2ed9-46db-9497-6228bc499b32',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  'Stage 1 · Dhaka Purbachal Team Time Trial',
  'Dhaka · Kuril → Kanchan Bridge → Kuril (Purbachal Expressway)',
  'A 25 km opening team time trial using the Purbachal Expressway as an out-and-back course. The wide road and almost level terrain make pacing, formation and crosswind exposure the decisive factors.',
  null,
  25.0,55,'flat','team_time_trial',
  jsonb_build_object('flat',95,'hilly',5,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',4,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',8,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',12.5,'elevation',13,'elevation_m',13),
    jsonb_build_object('km',17,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',21,'elevation',11,'elevation_m',11),
    jsonb_build_object('km',25,'elevation',9,'elevation_m',9)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Dhaka'),
    jsonb_build_object('km',12.5,'type','route','label','Turnaround','name','Kanchan Bridge'),
    jsonb_build_object('km',25,'type','finish','label','Finish','name','Dhaka')
  ),
  '[]'::jsonb,'[]'::jsonb,
  jsonb_build_object(
    'reserve_pool',true,
    'national_competition_eligible',true,
    'national_competition_slot','team_time_trial',
    'unscheduled_template',true
  ),
  null
),
(
  '6d712804-e45e-4cb7-bb98-3635afaa5bb3',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  'Stage 2 · Dhaka to Bhanga and Return',
  'Dhaka → Mawa → Bhanga → Mawa → Dhaka (N8)',
  'The first road stage follows N8 from Dhaka through the Mawa and Padma corridor to Bhanga, then reverses the same broad highway for a fast return to Dhaka.',
  null,
  145.9,460,'flat','sprinter',
  jsonb_build_object('flat',88,'hilly',12,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',12,'elevation',11,'elevation_m',11),
    jsonb_build_object('km',24,'elevation',14,'elevation_m',14),
    jsonb_build_object('km',36,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',50,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',60,'elevation',16,'elevation_m',16),
    jsonb_build_object('km',72.95,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',86,'elevation',16,'elevation_m',16),
    jsonb_build_object('km',98,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',112,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',124,'elevation',14,'elevation_m',14),
    jsonb_build_object('km',136,'elevation',11,'elevation_m',11),
    jsonb_build_object('km',145.9,'elevation',8,'elevation_m',8)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Dhaka'),
    jsonb_build_object('km',54,'type','sprint','label','Sprint 1','name','Mawa sprint'),
    jsonb_build_object('km',72.95,'type','route','label','Turnaround','name','Bhanga'),
    jsonb_build_object('km',112,'type','sprint','label','Sprint 2','name','Mawa return sprint'),
    jsonb_build_object('km',145.9,'type','finish','label','Finish','name','Dhaka')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',54.0,'name','Mawa sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',112.0,'name','Mawa return sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  jsonb_build_object(
    'reserve_pool',true,
    'national_competition_eligible',true,
    'national_competition_slot','flat',
    'unscheduled_template',true
  ),
  null
),
(
  'a08eaec6-36c3-480e-895a-4b66c0c0f1e0',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  'Stage 3 · Chattogram to Cox''s Bazar',
  'Chattogram → Patiya → Chakaria → Ramu → Cox''s Bazar (N1)',
  'A rolling 150 km transition stage on the N1 corridor from Chattogram to Cox''s Bazar. The road becomes more selective toward the south but avoids high-mountain terrain.',
  null,
  150.0,1220,'hilly','puncheur',
  jsonb_build_object('flat',40,'hilly',52,'mountain',8,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',12,'elevation',35,'elevation_m',35),
    jsonb_build_object('km',25,'elevation',62,'elevation_m',62),
    jsonb_build_object('km',38,'elevation',28,'elevation_m',28),
    jsonb_build_object('km',49,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',62,'elevation',54,'elevation_m',54),
    jsonb_build_object('km',75,'elevation',96,'elevation_m',96),
    jsonb_build_object('km',88,'elevation',132,'elevation_m',132),
    jsonb_build_object('km',100,'elevation',72,'elevation_m',72),
    jsonb_build_object('km',112,'elevation',34,'elevation_m',34),
    jsonb_build_object('km',122,'elevation',58,'elevation_m',58),
    jsonb_build_object('km',132,'elevation',112,'elevation_m',112),
    jsonb_build_object('km',141,'elevation',45,'elevation_m',45),
    jsonb_build_object('km',150,'elevation',6,'elevation_m',6)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Chattogram'),
    jsonb_build_object('km',49,'type','sprint','label','Sprint 1','name','Patiya sprint'),
    jsonb_build_object('km',88,'type','kom','label','Cat 4','name','Lohagara rolling crest'),
    jsonb_build_object('km',112,'type','sprint','label','Sprint 2','name','Chakaria sprint'),
    jsonb_build_object('km',132,'type','kom','label','Cat 4','name','Ramu approach crest'),
    jsonb_build_object('km',150,'type','finish','label','Finish','name','Cox''s Bazar')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',49.0,'name','Patiya sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',112.0,'name','Chakaria sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',88.0,'name','Lohagara rolling crest','category','Cat 4',
      'length_km',3.5,'avg_gradient',3.6,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',132.0,'name','Ramu approach crest','category','Cat 4',
      'length_km',3.0,'avg_gradient',3.8,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  jsonb_build_object(
    'reserve_pool',true,
    'national_competition_eligible',false,
    'reserve_role','future_regular_calendar_or_backup',
    'unscheduled_template',true
  ),
  null
),
(
  '00abeef4-df4a-4a34-a294-074865da7b72',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  'Stage 4 · Cox''s Bazar Marine Drive',
  'Cox''s Bazar → Inani → Teknaf → Inani → Cox''s Bazar',
  'A 160 km coastal out-and-back on the Cox''s Bazar-Teknaf Marine Drive. The road stays close to sea level, with gentle undulations near the foothills and strong potential for coastal crosswinds.',
  null,
  160.0,680,'flat','sprinter',
  jsonb_build_object('flat',78,'hilly',22,'mountain',0,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',6,'elevation_m',6),
    jsonb_build_object('km',12,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',23,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',40,'elevation',22,'elevation_m',22),
    jsonb_build_object('km',55,'elevation',34,'elevation_m',34),
    jsonb_build_object('km',68,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',80,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',92,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',105,'elevation',34,'elevation_m',34),
    jsonb_build_object('km',120,'elevation',22,'elevation_m',22),
    jsonb_build_object('km',137,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',148,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',160,'elevation',6,'elevation_m',6)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Cox''s Bazar'),
    jsonb_build_object('km',40,'type','sprint','label','Sprint 1','name','Inani sprint'),
    jsonb_build_object('km',80,'type','sprint','label','Sprint 2','name','Teknaf turnaround sprint'),
    jsonb_build_object('km',120,'type','sprint','label','Sprint 3','name','Inani return sprint'),
    jsonb_build_object('km',160,'type','finish','label','Finish','name','Cox''s Bazar')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',40.0,'name','Inani sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',80.0,'name','Teknaf turnaround sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',3,'km',120.0,'name','Inani return sprint',
      'points','standard','points_scheme',jsonb_build_array(8,5,3,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  '[]'::jsonb,
  jsonb_build_object(
    'reserve_pool',true,
    'national_competition_eligible',false,
    'reserve_role','future_regular_calendar_or_backup',
    'unscheduled_template',true
  ),
  null
),
(
  '28a4e8c2-7f35-4cb8-8ac2-6445e0752a2d',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  'Stage 5 · Bandarban to Thanchi and Return',
  'Bandarban → Chimbuk → Nilgiri → Thanchi → Nilgiri → Chimbuk → Bandarban',
  'The queen stage follows Z1811 through the Chittagong Hill Tracts. From Bandarban the race climbs through Chimbuk and Nilgiri, descends toward Thanchi, then reverses the route for a difficult but fair return to Bandarban.',
  null,
  156.0,2940,'mountain','climber',
  jsonb_build_object('flat',12,'hilly',54,'mountain',34,'cobbled',0),
  jsonb_build_array(
    jsonb_build_object('km',0,'elevation',45,'elevation_m',45),
    jsonb_build_object('km',8,'elevation',160,'elevation_m',160),
    jsonb_build_object('km',16,'elevation',360,'elevation_m',360),
    jsonb_build_object('km',24.2,'elevation',590,'elevation_m',590),
    jsonb_build_object('km',32,'elevation',410,'elevation_m',410),
    jsonb_build_object('km',39,'elevation',520,'elevation_m',520),
    jsonb_build_object('km',45,'elevation',670,'elevation_m',670),
    jsonb_build_object('km',53,'elevation',520,'elevation_m',520),
    jsonb_build_object('km',61,'elevation',390,'elevation_m',390),
    jsonb_build_object('km',69,'elevation',250,'elevation_m',250),
    jsonb_build_object('km',78,'elevation',95,'elevation_m',95),
    jsonb_build_object('km',87,'elevation',250,'elevation_m',250),
    jsonb_build_object('km',95,'elevation',390,'elevation_m',390),
    jsonb_build_object('km',103,'elevation',520,'elevation_m',520),
    jsonb_build_object('km',111,'elevation',670,'elevation_m',670),
    jsonb_build_object('km',117,'elevation',520,'elevation_m',520),
    jsonb_build_object('km',124,'elevation',410,'elevation_m',410),
    jsonb_build_object('km',131.8,'elevation',590,'elevation_m',590),
    jsonb_build_object('km',140,'elevation',360,'elevation_m',360),
    jsonb_build_object('km',148,'elevation',160,'elevation_m',160),
    jsonb_build_object('km',156,'elevation',45,'elevation_m',45)
  ),
  jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Bandarban'),
    jsonb_build_object('km',24.2,'type','kom','label','Cat 2','name','Chimbuk Hill'),
    jsonb_build_object('km',45,'type','kom','label','Cat 1','name','Nilgiri'),
    jsonb_build_object('km',78,'type','sprint','label','Sprint 1','name','Thanchi valley sprint'),
    jsonb_build_object('km',111,'type','kom','label','Cat 1','name','Nilgiri Return'),
    jsonb_build_object('km',131.8,'type','kom','label','Cat 2','name','Chimbuk Return'),
    jsonb_build_object('km',156,'type','finish','label','Finish','name','Bandarban')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',78.0,'name','Thanchi valley sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',24.2,'name','Chimbuk Hill','category','Cat 2',
      'length_km',9.0,'avg_gradient',5.2,
      'points_scheme',jsonb_build_array(10,6,4,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',45.0,'name','Nilgiri','category','Cat 1',
      'length_km',8.5,'avg_gradient',6.0,
      'points_scheme',jsonb_build_array(15,10,7,5,3,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',3,'km',111.0,'name','Nilgiri Return','category','Cat 1',
      'length_km',9.5,'avg_gradient',5.8,
      'points_scheme',jsonb_build_array(15,10,7,5,3,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',4,'km',131.8,'name','Chimbuk Return','category','Cat 2',
      'length_km',8.0,'avg_gradient',5.0,
      'points_scheme',jsonb_build_array(10,6,4,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  jsonb_build_object(
    'reserve_pool',true,
    'national_competition_eligible',true,
    'national_competition_slot','hilly_mountain',
    'unscheduled_template',true,
    'fairness_check',jsonb_build_object(
      'elevation_gain_m',2940,
      'distance_km',156.0,
      'elevation_gain_per_km',18.85,
      'mountain_pct',34
    )
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
  '7b0be933-4ef4-4a89-8367-939ee7c87a20',
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0',
  'BD',
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
  'Bangladesh five-stage reserve race. National Competition package is explicitly Stage 1 TTT, Stage 2 flat road race and Stage 5 hilly/mountain road race; Stages 3-4 remain additional senior-calendar / backup routes.'
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
  '8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0'::uuid,
  '2.2',
  null,
  110000
);

select public.sync_race_stage_points_from_stage_json_v1(
  '72df3f83-2ed9-46db-9497-6228bc499b32',true
);
select public.sync_race_stage_points_from_stage_json_v1(
  '6d712804-e45e-4cb7-bb98-3635afaa5bb3',true
);
select public.sync_race_stage_points_from_stage_json_v1(
  'a08eaec6-36c3-480e-895a-4b66c0c0f1e0',true
);
select public.sync_race_stage_points_from_stage_json_v1(
  '00abeef4-df4a-4a34-a294-074865da7b72',true
);
select public.sync_race_stage_points_from_stage_json_v1(
  '28a4e8c2-7f35-4cb8-8ac2-6445e0752a2d',true
);

update public.races
set start_date=null,end_date=null,stage_count=5,is_stage_race=true,updated_at=now()
where id='8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0';

update public.race_stages
set stage_date=null,weather_snapshot='{}'::jsonb,weather_summary=null,updated_at=now()
where race_id='8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0';

commit;
