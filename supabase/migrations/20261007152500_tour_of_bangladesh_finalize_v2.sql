-- Finalize Tour of Bangladesh with less-rounded race distances and prize money.
-- Keep the already realistic routes, but avoid artificial-looking .0 distances
-- and large round-number economics in the reserve pool.

begin;

update public.race_entry_rules
set
  prize_fund_cash=103000,
  prize_fund_source='manual_override',
  updated_at=now()
where race_id='8b2f3288-dc98-4aa1-b534-9f9d7d6a32f0';

-- Stage 1: exact race-course setup on the Purbachal corridor.
update public.race_stages
set
  distance_km=25.2,
  elevation_gain_m=57,
  notes='Opening team time trial on the broad Purbachal Expressway. The race course uses a 12.6 km measured section from the Dhaka side toward Kanchan and returns on the same corridor.',
  updated_at=now()
where id='72df3f83-2ed9-46db-9497-6228bc499b32';

update public.race_stage_profile_details
set
  distance_km=25.2,
  elevation_gain_m=57,
  stage_summary='A 25.2 km opening team time trial using the Purbachal Expressway as an out-and-back course. The wide road and almost level terrain make pacing, formation and crosswind exposure decisive.',
  profile_points=jsonb_build_array(
    jsonb_build_object('km',0,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',4.1,'elevation',12,'elevation_m',12),
    jsonb_build_object('km',8.2,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',12.6,'elevation',13,'elevation_m',13),
    jsonb_build_object('km',17.0,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',21.1,'elevation',11,'elevation_m',11),
    jsonb_build_object('km',25.2,'elevation',9,'elevation_m',9)
  ),
  route_markers=jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Dhaka'),
    jsonb_build_object('km',12.6,'type','route','label','Turnaround','name','Kanchan Bridge'),
    jsonb_build_object('km',25.2,'type','finish','label','Finish','name','Dhaka')
  ),
  updated_at=now()
where stage_id='72df3f83-2ed9-46db-9497-6228bc499b32';

-- Stage 2 already has the naturally-derived 145.9 km distance.
update public.race_stages
set elevation_gain_m=463,updated_at=now()
where id='6d712804-e45e-4cb7-bb98-3635afaa5bb3';

update public.race_stage_profile_details
set elevation_gain_m=463,updated_at=now()
where stage_id='6d712804-e45e-4cb7-bb98-3635afaa5bb3';

-- Stage 3: measured race-course finish inside Cox's Bazar.
update public.race_stages
set
  distance_km=151.6,
  elevation_gain_m=1235,
  updated_at=now()
where id='a08eaec6-36c3-480e-895a-4b66c0c0f1e0';

update public.race_stage_profile_details
set
  distance_km=151.6,
  elevation_gain_m=1235,
  stage_summary='A rolling 151.6 km transition stage on the N1 corridor from Chattogram through Patiya, Chakaria and Ramu to the finish in Cox''s Bazar.',
  profile_points=jsonb_build_array(
    jsonb_build_object('km',0,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',12.4,'elevation',35,'elevation_m',35),
    jsonb_build_object('km',25.3,'elevation',62,'elevation_m',62),
    jsonb_build_object('km',38.5,'elevation',28,'elevation_m',28),
    jsonb_build_object('km',49.2,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',62.5,'elevation',54,'elevation_m',54),
    jsonb_build_object('km',75.8,'elevation',96,'elevation_m',96),
    jsonb_build_object('km',88.4,'elevation',132,'elevation_m',132),
    jsonb_build_object('km',100.7,'elevation',72,'elevation_m',72),
    jsonb_build_object('km',112.3,'elevation',34,'elevation_m',34),
    jsonb_build_object('km',122.8,'elevation',58,'elevation_m',58),
    jsonb_build_object('km',132.5,'elevation',112,'elevation_m',112),
    jsonb_build_object('km',142.1,'elevation',45,'elevation_m',45),
    jsonb_build_object('km',151.6,'elevation',6,'elevation_m',6)
  ),
  route_markers=jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Chattogram'),
    jsonb_build_object('km',49.2,'type','sprint','label','Sprint 1','name','Patiya sprint'),
    jsonb_build_object('km',88.4,'type','kom','label','Cat 4','name','Lohagara rolling crest'),
    jsonb_build_object('km',112.3,'type','sprint','label','Sprint 2','name','Chakaria sprint'),
    jsonb_build_object('km',132.5,'type','kom','label','Cat 4','name','Ramu approach crest'),
    jsonb_build_object('km',151.6,'type','finish','label','Finish','name','Cox''s Bazar')
  ),
  updated_at=now()
where stage_id='a08eaec6-36c3-480e-895a-4b66c0c0f1e0';

update public.race_stages
set
  intermediate_sprints_json=jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',49.2,'name','Patiya sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',112.3,'name','Chakaria sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  mountain_climbs_json=jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',88.4,'name','Lohagara rolling crest','category','Cat 4',
      'length_km',3.5,'avg_gradient',3.6,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',2,'km',132.5,'name','Ramu approach crest','category','Cat 4',
      'length_km',3.0,'avg_gradient',3.8,
      'points_scheme',jsonb_build_array(3,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  updated_at=now()
where id='a08eaec6-36c3-480e-895a-4b66c0c0f1e0';

update public.race_stage_profile_details
set
  intermediate_sprints=(select intermediate_sprints_json from public.race_stages where id='a08eaec6-36c3-480e-895a-4b66c0c0f1e0'),
  mountain_climbs=(select mountain_climbs_json from public.race_stages where id='a08eaec6-36c3-480e-895a-4b66c0c0f1e0'),
  updated_at=now()
where stage_id='a08eaec6-36c3-480e-895a-4b66c0c0f1e0';

-- Stage 4: Marine Drive out-and-back race setup.
update public.race_stages
set
  distance_km=159.4,
  elevation_gain_m=674,
  intermediate_sprints_json=jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',39.8,'name','Inani sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',2,'km',79.7,'name','Teknaf turnaround sprint',
      'points','standard','points_scheme',jsonb_build_array(10,6,4,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    ),
    jsonb_build_object(
      'number',3,'km',119.6,'name','Inani return sprint',
      'points','standard','points_scheme',jsonb_build_array(8,5,3,2,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  updated_at=now()
where id='00abeef4-df4a-4a34-a294-074865da7b72';

update public.race_stage_profile_details
set
  distance_km=159.4,
  elevation_gain_m=674,
  stage_summary='A 159.4 km coastal out-and-back on the Cox''s Bazar-Teknaf Marine Drive, with gentle undulations near the foothills and strong potential for coastal crosswinds.',
  profile_points=jsonb_build_array(
    jsonb_build_object('km',0,'elevation',6,'elevation_m',6),
    jsonb_build_object('km',12.4,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',23.7,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',39.8,'elevation',22,'elevation_m',22),
    jsonb_build_object('km',54.6,'elevation',34,'elevation_m',34),
    jsonb_build_object('km',67.5,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',79.7,'elevation',8,'elevation_m',8),
    jsonb_build_object('km',91.9,'elevation',18,'elevation_m',18),
    jsonb_build_object('km',104.8,'elevation',34,'elevation_m',34),
    jsonb_build_object('km',119.6,'elevation',22,'elevation_m',22),
    jsonb_build_object('km',135.7,'elevation',15,'elevation_m',15),
    jsonb_build_object('km',147.3,'elevation',9,'elevation_m',9),
    jsonb_build_object('km',159.4,'elevation',6,'elevation_m',6)
  ),
  route_markers=jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Cox''s Bazar'),
    jsonb_build_object('km',39.8,'type','sprint','label','Sprint 1','name','Inani sprint'),
    jsonb_build_object('km',79.7,'type','sprint','label','Sprint 2','name','Teknaf turnaround sprint'),
    jsonb_build_object('km',119.6,'type','sprint','label','Sprint 3','name','Inani return sprint'),
    jsonb_build_object('km',159.4,'type','finish','label','Finish','name','Cox''s Bazar')
  ),
  intermediate_sprints=(select intermediate_sprints_json from public.race_stages where id='00abeef4-df4a-4a34-a294-074865da7b72'),
  updated_at=now()
where stage_id='00abeef4-df4a-4a34-a294-074865da7b72';

-- Stage 5: keep the same Bandarban-Thanchi road identity, with a measured
-- 78.2 km outward competition course and corresponding 156.4 km return.
update public.race_stages
set
  distance_km=156.4,
  elevation_gain_m=2947,
  intermediate_sprints_json=jsonb_build_array(
    jsonb_build_object(
      'number',1,'km',78.2,'name','Thanchi valley sprint',
      'points','standard','points_scheme',jsonb_build_array(12,8,5,3,1),
      'time_bonus_seconds',jsonb_build_array(3,2,1)
    )
  ),
  mountain_climbs_json=jsonb_build_array(
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
      'number',3,'km',111.4,'name','Nilgiri Return','category','Cat 1',
      'length_km',9.5,'avg_gradient',5.8,
      'points_scheme',jsonb_build_array(15,10,7,5,3,1),'time_bonus_seconds','[]'::jsonb
    ),
    jsonb_build_object(
      'number',4,'km',132.2,'name','Chimbuk Return','category','Cat 2',
      'length_km',8.0,'avg_gradient',5.0,
      'points_scheme',jsonb_build_array(10,6,4,2,1),'time_bonus_seconds','[]'::jsonb
    )
  ),
  metadata=jsonb_set(
    metadata,
    '{fairness_check}',
    jsonb_build_object(
      'elevation_gain_m',2947,
      'distance_km',156.4,
      'elevation_gain_per_km',round(2947.0/156.4,2),
      'mountain_pct',34
    ),
    true
  ),
  updated_at=now()
where id='28a4e8c2-7f35-4cb8-8ac2-6445e0752a2d';

update public.race_stage_profile_details
set
  distance_km=156.4,
  elevation_gain_m=2947,
  stage_summary='The queen stage follows Z1811 through the Chittagong Hill Tracts. From Bandarban the race climbs through Chimbuk and Nilgiri, reaches Thanchi at 78.2 km, then reverses the corridor for a 156.4 km return race.',
  profile_points=jsonb_build_array(
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
    jsonb_build_object('km',78.2,'elevation',95,'elevation_m',95),
    jsonb_build_object('km',87.4,'elevation',250,'elevation_m',250),
    jsonb_build_object('km',95.4,'elevation',390,'elevation_m',390),
    jsonb_build_object('km',103.4,'elevation',520,'elevation_m',520),
    jsonb_build_object('km',111.4,'elevation',670,'elevation_m',670),
    jsonb_build_object('km',117.4,'elevation',520,'elevation_m',520),
    jsonb_build_object('km',124.4,'elevation',410,'elevation_m',410),
    jsonb_build_object('km',132.2,'elevation',590,'elevation_m',590),
    jsonb_build_object('km',140.4,'elevation',360,'elevation_m',360),
    jsonb_build_object('km',148.4,'elevation',160,'elevation_m',160),
    jsonb_build_object('km',156.4,'elevation',45,'elevation_m',45)
  ),
  route_markers=jsonb_build_array(
    jsonb_build_object('km',0,'type','start','label','Start','name','Bandarban'),
    jsonb_build_object('km',24.2,'type','kom','label','Cat 2','name','Chimbuk Hill'),
    jsonb_build_object('km',45,'type','kom','label','Cat 1','name','Nilgiri'),
    jsonb_build_object('km',78.2,'type','sprint','label','Sprint 1','name','Thanchi valley sprint'),
    jsonb_build_object('km',111.4,'type','kom','label','Cat 1','name','Nilgiri Return'),
    jsonb_build_object('km',132.2,'type','kom','label','Cat 2','name','Chimbuk Return'),
    jsonb_build_object('km',156.4,'type','finish','label','Finish','name','Bandarban')
  ),
  intermediate_sprints=(select intermediate_sprints_json from public.race_stages where id='28a4e8c2-7f35-4cb8-8ac2-6445e0752a2d'),
  mountain_climbs=(select mountain_climbs_json from public.race_stages where id='28a4e8c2-7f35-4cb8-8ac2-6445e0752a2d'),
  metadata=jsonb_set(
    metadata,
    '{fairness_check}',
    jsonb_build_object(
      'elevation_gain_m',2947,
      'distance_km',156.4,
      'elevation_gain_per_km',round(2947.0/156.4,2),
      'mountain_pct',34
    ),
    true
  ),
  updated_at=now()
where stage_id='28a4e8c2-7f35-4cb8-8ac2-6445e0752a2d';

select public.sync_race_stage_points_from_stage_json_v1(
  '72df3f83-2ed9-46db-9497-6228bc499b32',true
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

commit;
