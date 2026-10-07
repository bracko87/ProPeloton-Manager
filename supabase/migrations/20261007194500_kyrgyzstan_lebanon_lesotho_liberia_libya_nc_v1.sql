-- Hidden reserve races for Kyrgyzstan, Lebanon, Lesotho, Liberia and Libya.
-- Tour of Kyrgyzstan: four stages, category 2.2, $125,000 prize fund.
-- Lebanon/Lesotho/Liberia/Libya: one-day category 1.2 races.

begin;

do $$
declare
  data jsonb := '[{"race_id":"8db0acfa-5cd2-42c4-9ef2-0669c810bf34","pool_id":"d6ca1e8e-458a-4ab4-94b4-cfe5102f39e4","cc":"KG","name":"Tour of Kyrgyzstan","short":"Tour of Kyrgyzstan","host":"Bishkek","category":"2.2","prize":125000,"stages":[{"id":"37841c66-1c9f-4db2-bb68-5d85f210a134","n":1,"name":"Stage 1 · Bishkek–Kemin Valley","start":"Bishkek","finish":"Kemin","route":"Bishkek → Tokmok → Kemin via the Chüy Valley","distance":151.2,"terrain":"hilly","profile":"all_rounder","gain":970,"flat":54,"hilly":38,"mountain":8,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[800,760,730,760,820,900,980],"profile_points":[{"km":0,"elevation":800,"elevation_m":800},{"km":25.7,"elevation":760,"elevation_m":760},{"km":49.9,"elevation":730,"elevation_m":730},{"km":75.6,"elevation":760,"elevation_m":760},{"km":101.3,"elevation":820,"elevation_m":820},{"km":125.5,"elevation":900,"elevation_m":900},{"km":151.2,"elevation":980,"elevation_m":980}],"sprints":[{"number":1,"km":54.4,"name":"Bishkek route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":110.4,"name":"Kemin approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":62,"name":"Kemin route climb","category":"Cat 3","length_km":6.6,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":116.4,"name":"Kemin highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"e8a3ef73-acde-49e0-9370-1a147a019441","n":2,"name":"Stage 2 · Kemin to Balykchy","start":"Kemin","finish":"Balykchy","route":"Kemin → Boom Gorge → Balykchy","distance":128.7,"terrain":"hilly","profile":"puncheur","gain":1880,"flat":24,"hilly":60,"mountain":16,"eligible":false,"slot":null,"finish_type":"uphill_finish","elev":[980,1100,1250,1450,1600,1650,1610],"profile_points":[{"km":0,"elevation":980,"elevation_m":980},{"km":21.9,"elevation":1100,"elevation_m":1100},{"km":42.5,"elevation":1250,"elevation_m":1250},{"km":64.3,"elevation":1450,"elevation_m":1450},{"km":86.2,"elevation":1600,"elevation_m":1600},{"km":106.8,"elevation":1650,"elevation_m":1650},{"km":128.7,"elevation":1610,"elevation_m":1610}],"sprints":[{"number":1,"km":46.3,"name":"Kemin route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":94,"name":"Balykchy approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":52.8,"name":"Balykchy route climb","category":"Cat 3","length_km":6.6,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":99.1,"name":"Balykchy highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"f7e1af58-4aa9-4b52-89d8-2cf851b0e775","n":3,"name":"Stage 3 · Issyk-Kul North Shore","start":"Balykchy","finish":"Cholpon-Ata","route":"Balykchy → Tamchy → Cholpon-Ata along Issyk-Kul north shore","distance":137.4,"terrain":"hilly","profile":"all_rounder","gain":1240,"flat":46,"hilly":48,"mountain":6,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[1610,1605,1610,1620,1630,1620,1615],"profile_points":[{"km":0,"elevation":1610,"elevation_m":1610},{"km":23.4,"elevation":1605,"elevation_m":1605},{"km":45.3,"elevation":1610,"elevation_m":1610},{"km":68.7,"elevation":1620,"elevation_m":1620},{"km":92.1,"elevation":1630,"elevation_m":1630},{"km":114,"elevation":1620,"elevation_m":1620},{"km":137.4,"elevation":1615,"elevation_m":1615}],"sprints":[{"number":1,"km":49.5,"name":"Balykchy route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":100.3,"name":"Cholpon-Ata approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":56.3,"name":"Cholpon-Ata route climb","category":"Cat 3","length_km":6.6,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":105.8,"name":"Cholpon-Ata highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"3c2940bc-fd79-4d95-97dc-cbfbdccaeabc","n":4,"name":"Stage 4 · Karakol Highlands Finale","start":"Cholpon-Ata","finish":"Karakol","route":"Cholpon-Ata → Tyup → Karakol with eastern Issyk-Kul highland sectors","distance":164.3,"terrain":"mountain","profile":"climber","gain":2960,"flat":18,"hilly":52,"mountain":30,"eligible":false,"slot":null,"finish_type":"uphill_finish","elev":[1615,1650,1700,1820,1950,1850,1760],"profile_points":[{"km":0,"elevation":1615,"elevation_m":1615},{"km":27.9,"elevation":1650,"elevation_m":1650},{"km":54.2,"elevation":1700,"elevation_m":1700},{"km":82.2,"elevation":1820,"elevation_m":1820},{"km":110.1,"elevation":1950,"elevation_m":1950},{"km":136.4,"elevation":1850,"elevation_m":1850},{"km":164.3,"elevation":1760,"elevation_m":1760}],"sprints":[{"number":1,"km":59.1,"name":"Cholpon-Ata route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":119.9,"name":"Karakol approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":67.4,"name":"Karakol route climb","category":"Cat 3","length_km":6.6,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":126.5,"name":"Karakol highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"74c3ad92-1426-417c-87ce-803b89e20b71","pool_id":"bc7072ec-1ee5-43b5-9198-a51afc70fd2c","cc":"LB","name":"Grand Prix of Mount Lebanon","short":"GP Mount Lebanon","host":"Beirut","category":"1.2","prize":58000,"stages":[{"id":"93cb8364-478c-450a-9034-67e2d7c97f78","n":1,"name":"Grand Prix of Mount Lebanon","start":"Beirut","finish":"Batroun","route":"Beirut → Dbayeh → Jounieh → Byblos → Batroun with inland highland loop","distance":153.8,"terrain":"hilly","profile":"puncheur","gain":2380,"flat":28,"hilly":55,"mountain":17,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[20,45,110,320,540,260,25],"profile_points":[{"km":0,"elevation":20,"elevation_m":20},{"km":26.1,"elevation":45,"elevation_m":45},{"km":50.8,"elevation":110,"elevation_m":110},{"km":76.9,"elevation":320,"elevation_m":320},{"km":103,"elevation":540,"elevation_m":540},{"km":127.7,"elevation":260,"elevation_m":260},{"km":153.8,"elevation":25,"elevation_m":25}],"sprints":[{"number":1,"km":55.4,"name":"Beirut route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":112.3,"name":"Batroun approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":63.1,"name":"Batroun route climb","category":"Cat 3","length_km":6.6,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":118.4,"name":"Batroun highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"eb18d4ee-acde-4f52-96f1-6c27091135bc","pool_id":"61dc61f4-ad09-4c9a-93fe-78f994f95b05","cc":"LS","name":"Maseru Highlands Classic","short":"Maseru Classic","host":"Maseru","category":"1.2","prize":45000,"stages":[{"id":"13803104-d566-433c-a948-b7bc0b8e965c","n":1,"name":"Maseru Highlands Classic","start":"Maseru","finish":"Maseru","route":"Maseru → Roma → Morija → Maseru highland circuit","distance":146.4,"terrain":"hilly","profile":"puncheur","gain":2640,"flat":18,"hilly":54,"mountain":28,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[1550,1660,1780,1900,1810,1690,1550],"profile_points":[{"km":0,"elevation":1550,"elevation_m":1550},{"km":24.9,"elevation":1660,"elevation_m":1660},{"km":48.3,"elevation":1780,"elevation_m":1780},{"km":73.2,"elevation":1900,"elevation_m":1900},{"km":98.1,"elevation":1810,"elevation_m":1810},{"km":121.5,"elevation":1690,"elevation_m":1690},{"km":146.4,"elevation":1550,"elevation_m":1550}],"sprints":[{"number":1,"km":52.7,"name":"Maseru route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":106.9,"name":"Maseru approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":60,"name":"Maseru route climb","category":"Cat 3","length_km":6.6,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":112.7,"name":"Maseru highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"cc7184a5-4db9-47c8-b74f-2e54030f4787","pool_id":"fd1d5536-24d0-4632-9f8e-3f67519f9e1d","cc":"LR","name":"Liberia Classic","short":"Liberia Classic","host":"Monrovia","category":"1.2","prize":38000,"stages":[{"id":"3708747d-c7d8-4596-83ef-af68f70e4d96","n":1,"name":"Liberia Classic","start":"Monrovia","finish":"Monrovia","route":"Monrovia → Kakata corridor → Careysburg → Monrovia","distance":152.6,"terrain":"hilly","profile":"all_rounder","gain":1180,"flat":57,"hilly":43,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[10,35,80,120,95,55,10],"profile_points":[{"km":0,"elevation":10,"elevation_m":10},{"km":25.9,"elevation":35,"elevation_m":35},{"km":50.4,"elevation":80,"elevation_m":80},{"km":76.3,"elevation":120,"elevation_m":120},{"km":102.2,"elevation":95,"elevation_m":95},{"km":126.7,"elevation":55,"elevation_m":55},{"km":152.6,"elevation":10,"elevation_m":10}],"sprints":[{"number":1,"km":54.9,"name":"Monrovia route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":111.4,"name":"Monrovia approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":62.6,"name":"Monrovia route climb","category":"Cat 3","length_km":6.6,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":117.5,"name":"Monrovia highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"c114d7cd-3bd2-41ca-9e20-6591c08315ce","pool_id":"7924d663-bd0e-4f19-a0cb-b7bf2b126ec2","cc":"LY","name":"Grand Prix of Tripolitania","short":"GP Tripolitania","host":"Tripoli","category":"1.2","prize":52000,"stages":[{"id":"533fa524-d1a7-47d2-a812-229cd6fdf7f4","n":1,"name":"Tripoli–Leptis Magna Classic","start":"Tripoli","finish":"Al-Khums","route":"Tripoli → coastal highway → Al-Khums (Leptis Magna)","distance":145,"terrain":"flat","profile":"sprinter","gain":400,"flat":90,"hilly":10,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[15,22,18,30,25,20,15],"profile_points":[{"km":0,"elevation":15,"elevation_m":15},{"km":24.7,"elevation":22,"elevation_m":22},{"km":47.9,"elevation":18,"elevation_m":18},{"km":72.5,"elevation":30,"elevation_m":30},{"km":97.2,"elevation":25,"elevation_m":25},{"km":120.3,"elevation":20,"elevation_m":20},{"km":145,"elevation":15,"elevation_m":15}],"sprints":[{"number":1,"km":52.2,"name":"Tripoli route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":105.8,"name":"Al-Khums approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]}]'::jsonb;
  r jsonb;
  s jsonb;
  rid uuid;
  sid uuid;
  poolid uuid;
  designated jsonb;
begin
  for r in select value from jsonb_array_elements(data)
  loop
    rid := (r->>'race_id')::uuid;
    poolid := (r->>'pool_id')::uuid;

    select coalesce(jsonb_agg((x->>'n')::int order by (x->>'n')::int),'[]'::jsonb)
    into designated
    from jsonb_array_elements(r->'stages') x
    where coalesce((x->>'eligible')::boolean,false)=true;

    insert into public.races(
      id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
      is_stage_race,stage_count,status,description,metadata
    ) values (
      rid,r->>'name',r->>'short',null,null,r->>'cc',r->>'host',r->>'category',
      case when jsonb_array_length(r->'stages')>1 then 'stage_race' else 'one_day' end,
      jsonb_array_length(r->'stages')>1,jsonb_array_length(r->'stages'),'draft',
      case when r->>'cc'='KG'
           then 'Four-stage hidden Tour of Kyrgyzstan using the Chüy Valley, Boom Gorge and Issyk-Kul corridors.'
           else 'Hidden one-day senior road race designed as a National Championship source route.' end,
      jsonb_build_object(
        'calendar_visibility','hidden',
        'reserve_pool',true,
        'reserve_country_code',r->>'cc',
        'future_regular_calendar_eligible',true,
        'national_competition_stage_count',jsonb_array_length(designated),
        'national_competition_designated_stage_numbers',designated,
        'route_library_version','v1',
        'national_championship_host_eligibility','allowed'
      )
    );

    for s in select value from jsonb_array_elements(r->'stages')
    loop
      sid := (s->>'id')::uuid;

      insert into public.race_stages(
        id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
        distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
        elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
        profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
      ) values (
        sid,rid,(s->>'n')::int,null,s->>'name',s->>'start',s->>'finish',r->>'host',r->>'cc',
        (s->>'distance')::numeric,s->>'terrain',s->>'finish_type',false,
        (s->>'flat')::numeric,(s->>'hilly')::numeric,(s->>'mountain')::numeric,0,
        (s->>'gain')::int,'{}'::jsonb,'{}'::jsonb,
        jsonb_build_object(
          'calendar_visibility','hidden','reserve_pool',true,
          'route_identity',lower(replace(s->>'name',' ','-')),
          'route_basis',s->>'route',
          'national_championship_host_eligibility','allowed',
          'national_competition_eligible',(s->>'eligible')::boolean,
          'national_competition_slot',s->>'slot',
          'fairness_check',jsonb_build_object(
            'distance_km',(s->>'distance')::numeric,
            'elevation_gain_m',(s->>'gain')::int,
            'elevation_gain_per_km',round((s->>'gain')::numeric/(s->>'distance')::numeric,2),
            'mountain_pct',(s->>'mountain')::numeric
          )
        ),
        s->>'start',s->>'finish',s->>'profile',
        'Reserve race route: '||(s->>'route')||'.',
        s->'sprints',s->'climbs','road_race'
      );

      insert into public.race_stage_profile_details(
        stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
        distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
        profile_points,route_markers,intermediate_sprints,mountain_climbs,metadata,weather_snapshot
      ) values (
        sid,rid,s->>'name',s->>'route',
        case when r->>'cc'='KG' then 'Tour of Kyrgyzstan stage on a realistic national road corridor.'
             else 'One-day National Championship reserve course using realistic national road geography.' end,
        null,(s->>'distance')::numeric,(s->>'gain')::int,s->>'terrain',s->>'profile',
        jsonb_build_object('flat',(s->>'flat')::numeric,'hilly',(s->>'hilly')::numeric,'mountain',(s->>'mountain')::numeric,'cobbled',0),
        s->'profile_points',
        jsonb_build_array(
          jsonb_build_object('km',0,'type','start','label','Start','name',s->>'start'),
          jsonb_build_object('km',round(((s->>'distance')::numeric/2),1),'type','route','label','Mid-route','name','Route midpoint'),
          jsonb_build_object('km',(s->>'distance')::numeric,'type','finish','label','Finish','name',s->>'finish')
        ),
        s->'sprints',s->'climbs',
        jsonb_build_object(
          'reserve_pool',true,
          'unscheduled_template',true,
          'national_competition_eligible',(s->>'eligible')::boolean,
          'national_competition_slot',s->>'slot'
        ),
        null
      );

      perform public.sync_race_stage_points_from_stage_json_v1(sid,true);
    end loop;

    insert into public.race_reserve_pool(
      id,race_id,country_code,pool_key,active,is_calendar_public,intended_uses,difficulty,notes
    ) values (
      poolid,rid,r->>'cc','hidden',true,false,
      array['national_championship','qualification','final','general_reserve']::text[],
      case when r->>'cc' in ('KG','LS','LB') then 'hard' else 'moderate' end,
      (r->>'name')||' hidden reserve race with designated National Championship source stage(s).'
    );

    perform public.initialize_race_entry_rules_v1(rid,r->>'category',null,(r->>'prize')::bigint);
  end loop;
end
$$;

commit;
