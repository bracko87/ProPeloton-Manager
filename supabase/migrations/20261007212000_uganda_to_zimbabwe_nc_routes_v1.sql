-- Final National Championship reserve coverage: Uganda, Uzbekistan,
-- Vanuatu, Yemen and Zimbabwe.

begin;

do $$
declare
  data jsonb := '[{"race_id":"e41a1c41-0001-4ab0-8a01-000000000041","pool_id":"f41a1c41-0001-4ab0-8a01-000000000041","cc":"UG","name":"Tour of Uganda","short":"Tour of Uganda","host":"Kampala","category":"1.2","prize":47000,"stages":[{"id":"e41a1c41-0001-4ab0-8a01-000000000051","n":1,"name":"Tour of Uganda · Kampala–Jinja Classic","start":"Kampala","finish":"Kampala","route":"Kampala → Mukono → Lugazi → Jinja → Kampala via the Kampala–Jinja corridor","distance":160.6,"terrain":"hilly","profile":"all_rounder","gain":1680,"flat":42,"hilly":52,"mountain":6,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[1190,1215,1235,1204,1230,1210,1190],"profile_points":[{"km":0,"elevation":1190,"elevation_m":1190},{"km":27.3,"elevation":1215,"elevation_m":1215},{"km":53,"elevation":1235,"elevation_m":1235},{"km":80.3,"elevation":1204,"elevation_m":1204},{"km":107.6,"elevation":1230,"elevation_m":1230},{"km":133.3,"elevation":1210,"elevation_m":1210},{"km":160.6,"elevation":1190,"elevation_m":1190}],"sprints":[{"number":1,"km":57.8,"name":"Kampala route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":117.2,"name":"Kampala approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":67.5,"name":"Kampala route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":122.1,"name":"Kampala highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"e42a1c42-0001-4ab0-8a01-000000000042","pool_id":"f42a1c42-0001-4ab0-8a01-000000000042","cc":"UZ","name":"Tour of Uzbekistan","short":"Tour of Uzbekistan","host":"Tashkent","category":"2.2","prize":112000,"stages":[{"id":"e42a1c42-0001-4ab0-8a01-000000000052","n":1,"name":"Stage 1 · Tashkent–Chinaz Plains Circuit","start":"Tashkent","finish":"Tashkent","route":"Tashkent → Yangiyul → Chinaz → Tashkent plains return","distance":156.3,"terrain":"flat","profile":"sprinter","gain":610,"flat":82,"hilly":18,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[455,430,400,385,405,435,455],"profile_points":[{"km":0,"elevation":455,"elevation_m":455},{"km":26.6,"elevation":430,"elevation_m":430},{"km":51.6,"elevation":400,"elevation_m":400},{"km":78.2,"elevation":385,"elevation_m":385},{"km":104.7,"elevation":405,"elevation_m":405},{"km":129.7,"elevation":435,"elevation_m":435},{"km":156.3,"elevation":455,"elevation_m":455}],"sprints":[{"number":1,"km":56.3,"name":"Tashkent route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":114.1,"name":"Tashkent approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]},{"id":"e42a1c42-0001-4ab0-8a01-000000000053","n":2,"name":"Stage 2 · Tashkent to Gazalkent","start":"Tashkent","finish":"Gazalkent","route":"Tashkent → Chirchiq → Gazalkent","distance":118.4,"terrain":"hilly","profile":"all_rounder","gain":1340,"flat":40,"hilly":52,"mountain":8,"eligible":false,"slot":null,"finish_type":"uphill_finish","elev":[455,520,610,720,850,930,980],"profile_points":[{"km":0,"elevation":455,"elevation_m":455},{"km":20.1,"elevation":520,"elevation_m":520},{"km":39.1,"elevation":610,"elevation_m":610},{"km":59.2,"elevation":720,"elevation_m":720},{"km":79.3,"elevation":850,"elevation_m":850},{"km":98.3,"elevation":930,"elevation_m":930},{"km":118.4,"elevation":980,"elevation_m":980}],"sprints":[{"number":1,"km":42.6,"name":"Tashkent route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":86.4,"name":"Gazalkent approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":49.7,"name":"Gazalkent route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":90,"name":"Gazalkent highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"e42a1c42-0001-4ab0-8a01-000000000054","n":3,"name":"Stage 3 · Charvak–Chimgan Mountain Stage","start":"Gazalkent","finish":"Chimgan","route":"Gazalkent → Charvak Reservoir → Chimgan highlands","distance":132.8,"terrain":"mountain","profile":"climber","gain":2580,"flat":12,"hilly":56,"mountain":32,"eligible":false,"slot":null,"finish_type":"summit_finish","elev":[980,1100,1280,1500,1650,1750,1620],"profile_points":[{"km":0,"elevation":980,"elevation_m":980},{"km":22.6,"elevation":1100,"elevation_m":1100},{"km":43.8,"elevation":1280,"elevation_m":1280},{"km":66.4,"elevation":1500,"elevation_m":1500},{"km":89,"elevation":1650,"elevation_m":1650},{"km":110.2,"elevation":1750,"elevation_m":1750},{"km":132.8,"elevation":1620,"elevation_m":1620}],"sprints":[{"number":1,"km":47.8,"name":"Gazalkent route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":96.9,"name":"Chimgan approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":55.8,"name":"Chimgan route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":100.9,"name":"Chimgan highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"e42a1c42-0001-4ab0-8a01-000000000055","n":4,"name":"Stage 4 · Samarkand Silk Road Circuit","start":"Samarkand","finish":"Samarkand","route":"Samarkand → Jomboy → Bulungur → Samarkand finishing circuit","distance":146.7,"terrain":"hilly","profile":"all_rounder","gain":1120,"flat":52,"hilly":44,"mountain":4,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[705,690,675,700,730,715,705],"profile_points":[{"km":0,"elevation":705,"elevation_m":705},{"km":24.9,"elevation":690,"elevation_m":690},{"km":48.4,"elevation":675,"elevation_m":675},{"km":73.3,"elevation":700,"elevation_m":700},{"km":98.3,"elevation":730,"elevation_m":730},{"km":121.8,"elevation":715,"elevation_m":715},{"km":146.7,"elevation":705,"elevation_m":705}],"sprints":[{"number":1,"km":52.8,"name":"Samarkand route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":107.1,"name":"Samarkand approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":61.6,"name":"Samarkand route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":111.5,"name":"Samarkand highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"e42a1c42-0001-4ab0-8a01-000000000056","n":5,"name":"Stage 5 · Samarkand to Jizzakh Finale","start":"Samarkand","finish":"Jizzakh","route":"Samarkand → Gallaorol → Jizzakh","distance":101.9,"terrain":"hilly","profile":"all_rounder","gain":980,"flat":48,"hilly":48,"mountain":4,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[705,680,650,620,590,560,570],"profile_points":[{"km":0,"elevation":705,"elevation_m":705},{"km":17.3,"elevation":680,"elevation_m":680},{"km":33.6,"elevation":650,"elevation_m":650},{"km":51,"elevation":620,"elevation_m":620},{"km":68.3,"elevation":590,"elevation_m":590},{"km":84.6,"elevation":560,"elevation_m":560},{"km":101.9,"elevation":570,"elevation_m":570}],"sprints":[{"number":1,"km":36.7,"name":"Samarkand route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":74.4,"name":"Jizzakh approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":42.8,"name":"Jizzakh route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":77.4,"name":"Jizzakh highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"e43a1c43-0001-4ab0-8a01-000000000043","pool_id":"f43a1c43-0001-4ab0-8a01-000000000043","cc":"VU","name":"Vanuatu Island Classic","short":"Vanuatu Classic","host":"Port Vila","category":"1.2","prize":35000,"stages":[{"id":"e43a1c43-0001-4ab0-8a01-000000000057","n":1,"name":"Vanuatu Island Classic","start":"Port Vila","finish":"Port Vila","route":"Port Vila → Efate Ring Road full island lap → Port Vila finishing circuit","distance":146.2,"terrain":"hilly","profile":"all_rounder","gain":1760,"flat":38,"hilly":54,"mountain":8,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[25,55,110,180,125,70,25],"profile_points":[{"km":0,"elevation":25,"elevation_m":25},{"km":24.9,"elevation":55,"elevation_m":55},{"km":48.2,"elevation":110,"elevation_m":110},{"km":73.1,"elevation":180,"elevation_m":180},{"km":98,"elevation":125,"elevation_m":125},{"km":121.3,"elevation":70,"elevation_m":70},{"km":146.2,"elevation":25,"elevation_m":25}],"sprints":[{"number":1,"km":52.6,"name":"Port Vila route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":106.7,"name":"Port Vila approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":61.4,"name":"Port Vila route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":111.1,"name":"Port Vila highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"e44a1c44-0001-4ab0-8a01-000000000044","pool_id":"f44a1c44-0001-4ab0-8a01-000000000044","cc":"YE","name":"Tour of Yemen","short":"Tour of Yemen","host":"Sana''a","category":"2.2","prize":60000,"stages":[{"id":"e44a1c44-0001-4ab0-8a01-000000000058","n":1,"name":"Stage 1 · Sana''a–Amran Highlands","start":"Sana''a","finish":"Sana''a","route":"Sana''a → Amran → al-Bawn plateau → Sana''a","distance":147.8,"terrain":"mountain","profile":"climber","gain":2860,"flat":14,"hilly":54,"mountain":32,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[2250,2330,2450,2550,2460,2350,2250],"profile_points":[{"km":0,"elevation":2250,"elevation_m":2250},{"km":25.1,"elevation":2330,"elevation_m":2330},{"km":48.8,"elevation":2450,"elevation_m":2450},{"km":73.9,"elevation":2550,"elevation_m":2550},{"km":99,"elevation":2460,"elevation_m":2460},{"km":122.7,"elevation":2350,"elevation_m":2350},{"km":147.8,"elevation":2250,"elevation_m":2250}],"sprints":[{"number":1,"km":53.2,"name":"Sana''a route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":107.9,"name":"Sana''a approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":62.1,"name":"Sana''a route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":112.3,"name":"Sana''a highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"e44a1c44-0001-4ab0-8a01-000000000059","n":2,"name":"Stage 2 · Sana''a to Dhamar","start":"Sana''a","finish":"Dhamar","route":"Sana''a → Ma''bar → Dhamar highland road","distance":104.6,"terrain":"hilly","profile":"puncheur","gain":1920,"flat":18,"hilly":58,"mountain":24,"eligible":false,"slot":null,"finish_type":"uphill_finish","elev":[2250,2350,2480,2600,2520,2440,2400],"profile_points":[{"km":0,"elevation":2250,"elevation_m":2250},{"km":17.8,"elevation":2350,"elevation_m":2350},{"km":34.5,"elevation":2480,"elevation_m":2480},{"km":52.3,"elevation":2600,"elevation_m":2600},{"km":70.1,"elevation":2520,"elevation_m":2520},{"km":86.8,"elevation":2440,"elevation_m":2440},{"km":104.6,"elevation":2400,"elevation_m":2400}],"sprints":[{"number":1,"km":37.7,"name":"Sana''a route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":76.4,"name":"Dhamar approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":43.9,"name":"Dhamar route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":79.5,"name":"Dhamar highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"e45a1c45-0001-4ab0-8a01-000000000045","pool_id":"f45a1c45-0001-4ab0-8a01-000000000045","cc":"ZW","name":"Tour of Zimbabwe","short":"Tour of Zimbabwe","host":"Harare","category":"2.2","prize":57000,"stages":[{"id":"e45a1c45-0001-4ab0-8a01-000000000060","n":1,"name":"Stage 1 · Harare–Marondera Championship Circuit","start":"Harare","finish":"Harare","route":"Harare → Ruwa → Marondera → Harare via the A3 corridor","distance":151.8,"terrain":"hilly","profile":"all_rounder","gain":1460,"flat":46,"hilly":50,"mountain":4,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[1490,1510,1560,1650,1590,1530,1490],"profile_points":[{"km":0,"elevation":1490,"elevation_m":1490},{"km":25.8,"elevation":1510,"elevation_m":1510},{"km":50.1,"elevation":1560,"elevation_m":1560},{"km":75.9,"elevation":1650,"elevation_m":1650},{"km":101.7,"elevation":1590,"elevation_m":1590},{"km":126,"elevation":1530,"elevation_m":1530},{"km":151.8,"elevation":1490,"elevation_m":1490}],"sprints":[{"number":1,"km":54.6,"name":"Harare route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":110.8,"name":"Harare approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":63.8,"name":"Harare route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":115.4,"name":"Harare highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"e45a1c45-0001-4ab0-8a01-000000000061","n":2,"name":"Stage 2 · Kwekwe to Gweru","start":"Kwekwe","finish":"Gweru","route":"Kwekwe → Gweru on the A5 corridor with finishing loop","distance":101.7,"terrain":"hilly","profile":"all_rounder","gain":860,"flat":54,"hilly":44,"mountain":2,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[1210,1230,1260,1300,1320,1360,1420],"profile_points":[{"km":0,"elevation":1210,"elevation_m":1210},{"km":17.3,"elevation":1230,"elevation_m":1230},{"km":33.6,"elevation":1260,"elevation_m":1260},{"km":50.9,"elevation":1300,"elevation_m":1300},{"km":68.1,"elevation":1320,"elevation_m":1320},{"km":84.4,"elevation":1360,"elevation_m":1360},{"km":101.7,"elevation":1420,"elevation_m":1420}],"sprints":[{"number":1,"km":36.6,"name":"Kwekwe route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":74.2,"name":"Gweru approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":42.7,"name":"Gweru route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":77.3,"name":"Gweru highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"e45a1c45-0001-4ab0-8a01-000000000062","n":3,"name":"Stage 3 · Bulawayo–Matobo Finale","start":"Bulawayo","finish":"Bulawayo","route":"Bulawayo → Matobo road → Matobo foothills → Bulawayo finishing circuit","distance":139.6,"terrain":"hilly","profile":"puncheur","gain":1740,"flat":34,"hilly":54,"mountain":12,"eligible":false,"slot":null,"finish_type":"uphill_finish","elev":[1350,1420,1500,1600,1530,1440,1350],"profile_points":[{"km":0,"elevation":1350,"elevation_m":1350},{"km":23.7,"elevation":1420,"elevation_m":1420},{"km":46.1,"elevation":1500,"elevation_m":1500},{"km":69.8,"elevation":1600,"elevation_m":1600},{"km":93.5,"elevation":1530,"elevation_m":1530},{"km":115.9,"elevation":1440,"elevation_m":1440},{"km":139.6,"elevation":1350,"elevation_m":1350}],"sprints":[{"number":1,"km":50.3,"name":"Bulawayo route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":101.9,"name":"Bulawayo approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":58.6,"name":"Bulawayo route climb","category":"Cat 3","length_km":6.4,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":106.1,"name":"Bulawayo highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]}]'::jsonb;
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
      jsonb_array_length(r->'stages')>1,
      jsonb_array_length(r->'stages'),
      'draft',
      case
        when r->>'cc'='UG' then 'One-day Tour of Uganda on the Kampala–Jinja corridor.'
        when r->>'cc'='UZ' then 'Five-stage hidden Tour of Uzbekistan across Tashkent, the Charvak/Chimgan highlands and Samarkand.'
        when r->>'cc'='VU' then 'One-day Vanuatu road classic using the Efate ring road.'
        when r->>'cc'='YE' then 'Two-stage hidden Tour of Yemen in the Sana''a and northern highlands.'
        when r->>'cc'='ZW' then 'Three-stage hidden Tour of Zimbabwe using Harare, the A5 corridor and Matobo.'
      end,
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
        (s->>'distance')::numeric,s->>'terrain',s->>'finish_type',
        case when s->>'finish_type'='summit_finish' then true else false end,
        (s->>'flat')::numeric,(s->>'hilly')::numeric,(s->>'mountain')::numeric,0,
        (s->>'gain')::int,'{}'::jsonb,'{}'::jsonb,
        jsonb_build_object(
          'calendar_visibility','hidden',
          'reserve_pool',true,
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
        case
          when r->>'cc'='UZ' then 'Tour of Uzbekistan stage using realistic national road geography.'
          when r->>'cc'='YE' then 'Tour of Yemen stage using the Sana''a highland road network.'
          when r->>'cc'='ZW' then 'Tour of Zimbabwe stage using major Zimbabwean road corridors.'
          else 'National Championship reserve course using realistic national road geography.'
        end,
        null,(s->>'distance')::numeric,(s->>'gain')::int,s->>'terrain',s->>'profile',
        jsonb_build_object(
          'flat',(s->>'flat')::numeric,'hilly',(s->>'hilly')::numeric,
          'mountain',(s->>'mountain')::numeric,'cobbled',0
        ),
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
      case when r->>'cc' in ('YE','ZW') then 'hard' else 'moderate' end,
      (r->>'name')||' hidden reserve race with designated National Championship source stage(s).'
    );

    perform public.initialize_race_entry_rules_v1(
      rid,r->>'category',null,(r->>'prize')::bigint
    );
  end loop;
end
$$;

commit;
