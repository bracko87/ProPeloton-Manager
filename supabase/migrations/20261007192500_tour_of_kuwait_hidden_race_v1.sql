-- Tour of Kuwait hidden reserve race.
-- Three stages, category 2.1, $288,000 manually specified prize fund.
-- Stage 1 is an individual time trial. Stage 2 is the designated National
-- Championship road source route.

begin;

insert into public.races(
  id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
  is_stage_race,stage_count,status,description,metadata
) values (
  'e25b77a8-73aa-4a6e-98f6-62f53770ec28',
  'Tour of Kuwait',
  'Tour of Kuwait',
  null,null,'KW','Kuwait City','2.1','stage_race',true,3,'draft',
  'Three-stage hidden senior Tour of Kuwait featuring an opening individual time trial and two desert road stages.',
  jsonb_build_object(
    'calendar_visibility','hidden',
    'reserve_pool',true,
    'reserve_country_code','KW',
    'future_regular_calendar_eligible',true,
    'national_competition_stage_count',1,
    'national_competition_designated_stage_numbers',jsonb_build_array(2),
    'national_competition_stage_types',jsonb_build_array('flat'),
    'route_library_version','v1',
    'national_championship_host_eligibility','allowed'
  )
);

-- Stage 1: ITT
insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  '54412ee6-4f0a-4ec4-b55c-f31b945cd167',
  'e25b77a8-73aa-4a6e-98f6-62f53770ec28',
  1,null,'Stage 1 · Kuwait City Individual Time Trial',
  'Kuwait City','Kuwait City','Kuwait City','KW',
  31.4,'individual_time_trial','time_trial_finish',false,98,2,0,0,72,
  '{}'::jsonb,'{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden','reserve_pool',true,
    'route_identity','kuwait-city-individual-time-trial',
    'route_basis','Kuwait City waterfront → Shuwaikh → Kuwait City',
    'national_championship_host_eligibility','excluded',
    'national_competition_eligible',false
  ),
  'Kuwait City','Kuwait City','time_trial',
  'Flat opening individual time trial on the Kuwait City waterfront and Shuwaikh corridor.',
  '[]'::jsonb,'[]'::jsonb,'individual_time_trial'
);

-- Stage 2: National Championship suitable flat road stage
insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  'e99d18f7-cbbf-43e5-a3cb-0040e45e7d53',
  'e25b77a8-73aa-4a6e-98f6-62f53770ec28',
  2,null,'Stage 2 · Kuwait Desert Grand Stage',
  'Kuwait City','Al Jahra','Kuwait City','KW',
  156.2,'flat','flat_finish',false,92,8,0,0,410,
  '{}'::jsonb,'{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden','reserve_pool',true,
    'route_identity','kuwait-city-al-jahra-desert-championship',
    'route_basis','Kuwait City → Sulaibiya → Al Jahra → northern desert loop → Al Jahra',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',true,
    'national_competition_slot','flat',
    'fairness_check',jsonb_build_object(
      'distance_km',156.2,'elevation_gain_m',410,'elevation_gain_per_km',2.62,'mountain_pct',0
    )
  ),
  'Kuwait City','Al Jahra','sprinter',
  'Long flat desert road stage designed as Kuwait''s National Championship source route.',
  '[{"number":1,"km":54.8,"name":"Sulaibiya sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":113.5,"name":"Al Jahra approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[]'::jsonb,'road_race'
);

-- Stage 3
insert into public.race_stages(
  id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
  distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
  elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
  profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
) values (
  'c6708553-7e68-4c0b-8e09-2451811eef37',
  'e25b77a8-73aa-4a6e-98f6-62f53770ec28',
  3,null,'Stage 3 · Gulf Road Finale',
  'Al Jahra','Kuwait City','Al Jahra','KW',
  138.6,'flat','flat_finish',false,88,12,0,0,455,
  '{}'::jsonb,'{}'::jsonb,
  jsonb_build_object(
    'calendar_visibility','hidden','reserve_pool',true,
    'route_identity','al-jahra-kuwait-city-gulf-road-finale',
    'route_basis','Al Jahra → Doha district → Kuwait Bay → Gulf Road → Kuwait City',
    'national_championship_host_eligibility','allowed',
    'national_competition_eligible',false
  ),
  'Al Jahra','Kuwait City','sprinter',
  'Fast final stage returning to Kuwait City along the bay and Gulf Road corridor.',
  '[{"number":1,"km":47.6,"name":"Kuwait Bay sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":101.2,"name":"Gulf Road sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}]'::jsonb,
  '[]'::jsonb,'road_race'
);

insert into public.race_stage_profile_details(
  stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
  distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
  profile_points,route_markers,intermediate_sprints,mountain_climbs,metadata,weather_snapshot
)
select
  s.id,s.race_id,s.name,
  coalesce(s.metadata->>'route_basis',s.name),
  'Tour of Kuwait stage on a realistic Kuwait road corridor.',
  null,s.distance_km,s.elevation_gain_m,s.terrain_type,s.profile_type,
  jsonb_build_object('flat',s.flat_pct,'hilly',s.hilly_pct,'mountain',s.mountain_pct,'cobbled',s.cobbled_pct),
  case s.stage_number
    when 1 then '[{"km":0,"elevation":8,"elevation_m":8},{"km":5.2,"elevation":10,"elevation_m":10},{"km":10.5,"elevation":12,"elevation_m":12},{"km":15.7,"elevation":9,"elevation_m":9},{"km":20.9,"elevation":11,"elevation_m":11},{"km":26.2,"elevation":10,"elevation_m":10},{"km":31.4,"elevation":8,"elevation_m":8}]'::jsonb
    when 2 then '[{"km":0,"elevation":9,"elevation_m":9},{"km":26,"elevation":18,"elevation_m":18},{"km":52,"elevation":35,"elevation_m":35},{"km":78.1,"elevation":42,"elevation_m":42},{"km":104.1,"elevation":36,"elevation_m":36},{"km":130.2,"elevation":28,"elevation_m":28},{"km":156.2,"elevation":24,"elevation_m":24}]'::jsonb
    else '[{"km":0,"elevation":24,"elevation_m":24},{"km":23.1,"elevation":30,"elevation_m":30},{"km":46.2,"elevation":22,"elevation_m":22},{"km":69.3,"elevation":18,"elevation_m":18},{"km":92.4,"elevation":14,"elevation_m":14},{"km":115.5,"elevation":11,"elevation_m":11},{"km":138.6,"elevation":8,"elevation_m":8}]'::jsonb
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
where s.race_id='e25b77a8-73aa-4a6e-98f6-62f53770ec28';

insert into public.race_reserve_pool(
  id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
) values (
  '49cd9855-a49d-45e8-8802-5c12c20afc9d',
  'e25b77a8-73aa-4a6e-98f6-62f53770ec28',
  'KW','hidden',true,false,
  array['national_championship','qualification','final','general_reserve']::text[],
  'moderate',
  'Three-stage Tour of Kuwait. Stage 2 is the designated National Championship road source route.'
);

select public.initialize_race_entry_rules_v1(
  'e25b77a8-73aa-4a6e-98f6-62f53770ec28'::uuid,
  '2.1',
  null,
  288000
);

select public.sync_race_stage_points_from_stage_json_v1(id,true)
from public.race_stages
where race_id='e25b77a8-73aa-4a6e-98f6-62f53770ec28';

commit;
