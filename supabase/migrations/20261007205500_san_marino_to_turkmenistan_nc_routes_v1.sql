-- Hidden National Championship reserve races for San Marino through Turkmenistan.
-- One-day races are category 1.2; Tour of Turkmenistan is category 2.2.

begin;

do $$
declare
  data jsonb := '[{"race_id":"b31a1c31-0001-4ab0-8a01-000000000031","pool_id":"c31a1c31-0001-4ab0-8a01-000000000031","cc":"SM","name":"Grand Prix of San Marino","short":"GP San Marino","host":"San Marino","category":"1.2","prize":55000,"stages":[{"id":"d31a1c31-0001-4ab0-8a01-000000000031","n":1,"name":"Grand Prix of San Marino","start":"San Marino","finish":"San Marino","route":"San Marino City → Borgo Maggiore → Serravalle → Dogana → Faetano → Fiorentino → San Marino City, repeated national circuit","distance":146.8,"terrain":"hilly","profile":"puncheur","gain":2470,"flat":20,"hilly":58,"mountain":22,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[675,520,240,110,250,430,675],"profile_points":[{"km":0,"elevation":675,"elevation_m":675},{"km":25,"elevation":520,"elevation_m":520},{"km":48.4,"elevation":240,"elevation_m":240},{"km":73.4,"elevation":110,"elevation_m":110},{"km":98.4,"elevation":250,"elevation_m":250},{"km":121.8,"elevation":430,"elevation_m":430},{"km":146.8,"elevation":675,"elevation_m":675}],"sprints":[{"number":1,"km":52.8,"name":"San Marino route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":107.2,"name":"San Marino approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":61.7,"name":"San Marino route climb","category":"Cat 3","length_km":6.3,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":111.6,"name":"San Marino highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"b32a1c32-0001-4ab0-8a01-000000000032","pool_id":"c32a1c32-0001-4ab0-8a01-000000000032","cc":"SL","name":"Sierra Leone Classic","short":"Sierra Leone Classic","host":"Freetown","category":"1.2","prize":35000,"stages":[{"id":"d32a1c32-0001-4ab0-8a01-000000000032","n":1,"name":"Sierra Leone Classic","start":"Freetown","finish":"Freetown","route":"Freetown → Hastings → Waterloo → Masiaka corridor → Waterloo → Freetown","distance":151.4,"terrain":"hilly","profile":"all_rounder","gain":1460,"flat":45,"hilly":49,"mountain":6,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[20,85,120,150,115,70,20],"profile_points":[{"km":0,"elevation":20,"elevation_m":20},{"km":25.7,"elevation":85,"elevation_m":85},{"km":50,"elevation":120,"elevation_m":120},{"km":75.7,"elevation":150,"elevation_m":150},{"km":101.4,"elevation":115,"elevation_m":115},{"km":125.7,"elevation":70,"elevation_m":70},{"km":151.4,"elevation":20,"elevation_m":20}],"sprints":[{"number":1,"km":54.5,"name":"Freetown route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":110.5,"name":"Freetown approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":63.6,"name":"Freetown route climb","category":"Cat 3","length_km":6.3,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":115.1,"name":"Freetown highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"b33a1c33-0001-4ab0-8a01-000000000033","pool_id":"c33a1c33-0001-4ab0-8a01-000000000033","cc":"SS","name":"South Sudan Classic","short":"South Sudan Classic","host":"Juba","category":"1.2","prize":31000,"stages":[{"id":"d33a1c33-0001-4ab0-8a01-000000000033","n":1,"name":"South Sudan Classic","start":"Juba","finish":"Nimule","route":"Juba → Nimule Highway (A43) → Nimule","distance":193,"terrain":"hilly","profile":"all_rounder","gain":1180,"flat":56,"hilly":40,"mountain":4,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[500,520,560,610,650,690,705],"profile_points":[{"km":0,"elevation":500,"elevation_m":500},{"km":32.8,"elevation":520,"elevation_m":520},{"km":63.7,"elevation":560,"elevation_m":560},{"km":96.5,"elevation":610,"elevation_m":610},{"km":129.3,"elevation":650,"elevation_m":650},{"km":160.2,"elevation":690,"elevation_m":690},{"km":193,"elevation":705,"elevation_m":705}],"sprints":[{"number":1,"km":69.5,"name":"Juba route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":140.9,"name":"Nimule approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":81.1,"name":"Nimule route climb","category":"Cat 3","length_km":6.3,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":146.7,"name":"Nimule highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"b34a1c34-0001-4ab0-8a01-000000000034","pool_id":"c34a1c34-0001-4ab0-8a01-000000000034","cc":"SD","name":"Khartoum–Wad Madani Classic","short":"Sudan Classic","host":"Khartoum","category":"1.2","prize":40000,"stages":[{"id":"d34a1c34-0001-4ab0-8a01-000000000034","n":1,"name":"Khartoum–Wad Madani Classic","start":"Khartoum","finish":"Wad Madani","route":"Khartoum → Al Kamlin → Wad Madani on the national Khartoum–Madani corridor","distance":181.6,"terrain":"flat","profile":"sprinter","gain":420,"flat":92,"hilly":8,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[380,385,390,395,400,405,410],"profile_points":[{"km":0,"elevation":380,"elevation_m":380},{"km":30.9,"elevation":385,"elevation_m":385},{"km":59.9,"elevation":390,"elevation_m":390},{"km":90.8,"elevation":395,"elevation_m":395},{"km":121.7,"elevation":400,"elevation_m":400},{"km":150.7,"elevation":405,"elevation_m":405},{"km":181.6,"elevation":410,"elevation_m":410}],"sprints":[{"number":1,"km":65.4,"name":"Khartoum route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":132.6,"name":"Wad Madani approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]},{"race_id":"b35a1c35-0001-4ab0-8a01-000000000035","pool_id":"c35a1c35-0001-4ab0-8a01-000000000035","cc":"SY","name":"Tour of Syria","short":"Tour of Syria","host":"Damascus","category":"1.2","prize":30000,"stages":[{"id":"d35a1c35-0001-4ab0-8a01-000000000035","n":1,"name":"Damascus–Homs Classic","start":"Damascus","finish":"Homs","route":"Damascus → an-Nabk → al-Qusayr corridor → Homs","distance":164.7,"terrain":"hilly","profile":"all_rounder","gain":1540,"flat":42,"hilly":50,"mountain":8,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[680,760,850,920,780,650,500],"profile_points":[{"km":0,"elevation":680,"elevation_m":680},{"km":28,"elevation":760,"elevation_m":760},{"km":54.4,"elevation":850,"elevation_m":850},{"km":82.3,"elevation":920,"elevation_m":920},{"km":110.3,"elevation":780,"elevation_m":780},{"km":136.7,"elevation":650,"elevation_m":650},{"km":164.7,"elevation":500,"elevation_m":500}],"sprints":[{"number":1,"km":59.3,"name":"Damascus route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":120.2,"name":"Homs approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":69.2,"name":"Homs route climb","category":"Cat 3","length_km":6.3,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":125.2,"name":"Homs highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"b36a1c36-0001-4ab0-8a01-000000000036","pool_id":"c36a1c36-0001-4ab0-8a01-000000000036","cc":"TJ","name":"Grand Prix of Tajikistan","short":"GP Tajikistan","host":"Dushanbe","category":"1.2","prize":57000,"stages":[{"id":"d36a1c36-0001-4ab0-8a01-000000000036","n":1,"name":"Dushanbe–Varzob Highlands Grand Prix","start":"Dushanbe","finish":"Dushanbe","route":"Dushanbe → Varzob Gorge → northern turning circuit → Hisor Valley → Dushanbe","distance":149.6,"terrain":"mountain","profile":"climber","gain":2690,"flat":14,"hilly":56,"mountain":30,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[800,980,1240,1520,1300,980,800],"profile_points":[{"km":0,"elevation":800,"elevation_m":800},{"km":25.4,"elevation":980,"elevation_m":980},{"km":49.4,"elevation":1240,"elevation_m":1240},{"km":74.8,"elevation":1520,"elevation_m":1520},{"km":100.2,"elevation":1300,"elevation_m":1300},{"km":124.2,"elevation":980,"elevation_m":980},{"km":149.6,"elevation":800,"elevation_m":800}],"sprints":[{"number":1,"km":53.9,"name":"Dushanbe route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":109.2,"name":"Dushanbe approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":62.8,"name":"Dushanbe route climb","category":"Cat 3","length_km":6.3,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":113.7,"name":"Dushanbe highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"b37a1c37-0001-4ab0-8a01-000000000037","pool_id":"c37a1c37-0001-4ab0-8a01-000000000037","cc":"TG","name":"Togo Classic","short":"Togo Classic","host":"Lomé","category":"1.2","prize":41000,"stages":[{"id":"d37a1c37-0001-4ab0-8a01-000000000037","n":1,"name":"Togo Classic","start":"Lomé","finish":"Lomé","route":"Lomé → Aného → Tsévié corridor → Lomé finishing circuit","distance":153.4,"terrain":"flat","profile":"sprinter","gain":480,"flat":86,"hilly":14,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[12,18,25,45,60,35,12],"profile_points":[{"km":0,"elevation":12,"elevation_m":12},{"km":26.1,"elevation":18,"elevation_m":18},{"km":50.6,"elevation":25,"elevation_m":25},{"km":76.7,"elevation":45,"elevation_m":45},{"km":102.8,"elevation":60,"elevation_m":60},{"km":127.3,"elevation":35,"elevation_m":35},{"km":153.4,"elevation":12,"elevation_m":12}],"sprints":[{"number":1,"km":55.2,"name":"Lomé route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":112,"name":"Lomé approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]},{"race_id":"b38a1c38-0001-4ab0-8a01-000000000038","pool_id":"c38a1c38-0001-4ab0-8a01-000000000038","cc":"TO","name":"Kingdom of Tonga Classic","short":"Tonga Classic","host":"Nukuʻalofa","category":"1.2","prize":35000,"stages":[{"id":"d38a1c38-0001-4ab0-8a01-000000000038","n":1,"name":"Kingdom of Tonga Classic","start":"Nukuʻalofa","finish":"Nukuʻalofa","route":"Nukuʻalofa → eastern Tongatapu coastal roads → Lapaha → western Tongatapu → Nukuʻalofa, repeated island circuit","distance":148.6,"terrain":"flat","profile":"sprinter","gain":290,"flat":94,"hilly":6,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[8,15,25,35,22,14,8],"profile_points":[{"km":0,"elevation":8,"elevation_m":8},{"km":25.3,"elevation":15,"elevation_m":15},{"km":49,"elevation":25,"elevation_m":25},{"km":74.3,"elevation":35,"elevation_m":35},{"km":99.6,"elevation":22,"elevation_m":22},{"km":123.3,"elevation":14,"elevation_m":14},{"km":148.6,"elevation":8,"elevation_m":8}],"sprints":[{"number":1,"km":53.5,"name":"Nukuʻalofa route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":108.5,"name":"Nukuʻalofa approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]},{"race_id":"b39a1c39-0001-4ab0-8a01-000000000039","pool_id":"c39a1c39-0001-4ab0-8a01-000000000039","cc":"TT","name":"Trinidad & Tobago Classic","short":"T&T Classic","host":"Port of Spain","category":"1.2","prize":41000,"stages":[{"id":"d39a1c39-0001-4ab0-8a01-000000000039","n":1,"name":"Trinidad & Tobago Classic","start":"Port of Spain","finish":"Port of Spain","route":"Port of Spain → Chaguanas → Couva → San Fernando → central Trinidad return → Port of Spain","distance":158.9,"terrain":"hilly","profile":"all_rounder","gain":1390,"flat":48,"hilly":48,"mountain":4,"eligible":true,"slot":"hilly_mountain","finish_type":"flat_finish","elev":[20,35,55,80,65,40,20],"profile_points":[{"km":0,"elevation":20,"elevation_m":20},{"km":27,"elevation":35,"elevation_m":35},{"km":52.4,"elevation":55,"elevation_m":55},{"km":79.5,"elevation":80,"elevation_m":80},{"km":106.5,"elevation":65,"elevation_m":65},{"km":131.9,"elevation":40,"elevation_m":40},{"km":158.9,"elevation":20,"elevation_m":20}],"sprints":[{"number":1,"km":57.2,"name":"Port of Spain route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":116,"name":"Port of Spain approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":66.7,"name":"Port of Spain route climb","category":"Cat 3","length_km":6.3,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":120.8,"name":"Port of Spain highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"b40a1c40-0001-4ab0-8a01-000000000040","pool_id":"c40a1c40-0001-4ab0-8a01-000000000040","cc":"TM","name":"Tour of Turkmenistan","short":"Tour of Turkmenistan","host":"Ashgabat","category":"2.2","prize":81000,"stages":[{"id":"d40a1c40-0001-4ab0-8a01-000000000041","n":1,"name":"Stage 1 · Ashgabat Desert Circuit","start":"Ashgabat","finish":"Ashgabat","route":"Ashgabat → northern desert roads → Gökdepe corridor → Ashgabat","distance":152.8,"terrain":"flat","profile":"sprinter","gain":620,"flat":82,"hilly":18,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[220,240,270,310,285,250,220],"profile_points":[{"km":0,"elevation":220,"elevation_m":220},{"km":26,"elevation":240,"elevation_m":240},{"km":50.4,"elevation":270,"elevation_m":270},{"km":76.4,"elevation":310,"elevation_m":310},{"km":102.4,"elevation":285,"elevation_m":285},{"km":126.8,"elevation":250,"elevation_m":250},{"km":152.8,"elevation":220,"elevation_m":220}],"sprints":[{"number":1,"km":55,"name":"Ashgabat route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":111.5,"name":"Ashgabat approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]},{"id":"d40a1c40-0001-4ab0-8a01-000000000042","n":2,"name":"Stage 2 · Ashgabat to Bäherden","start":"Ashgabat","finish":"Bäherden","route":"Ashgabat → Gökdepe → Bäherden along the Kopet Dag foothill corridor","distance":132.4,"terrain":"hilly","profile":"all_rounder","gain":1340,"flat":42,"hilly":50,"mountain":8,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[220,260,320,390,360,300,260],"profile_points":[{"km":0,"elevation":220,"elevation_m":220},{"km":22.5,"elevation":260,"elevation_m":260},{"km":43.7,"elevation":320,"elevation_m":320},{"km":66.2,"elevation":390,"elevation_m":390},{"km":88.7,"elevation":360,"elevation_m":360},{"km":109.9,"elevation":300,"elevation_m":300},{"km":132.4,"elevation":260,"elevation_m":260}],"sprints":[{"number":1,"km":47.7,"name":"Ashgabat route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":96.7,"name":"Bäherden approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":55.6,"name":"Bäherden route climb","category":"Cat 3","length_km":6.3,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":100.6,"name":"Bäherden highland rise","category":"Cat 2","length_km":8.5,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"d40a1c40-0001-4ab0-8a01-000000000043","n":3,"name":"Stage 3 · Mary Finale","start":"Mary","finish":"Mary","route":"Mary → Bayramaly → Merv corridor → Mary finishing circuit","distance":146.7,"terrain":"flat","profile":"sprinter","gain":390,"flat":90,"hilly":10,"mountain":0,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[225,230,235,240,235,230,225],"profile_points":[{"km":0,"elevation":225,"elevation_m":225},{"km":24.9,"elevation":230,"elevation_m":230},{"km":48.4,"elevation":235,"elevation_m":235},{"km":73.3,"elevation":240,"elevation_m":240},{"km":98.3,"elevation":235,"elevation_m":235},{"km":121.8,"elevation":230,"elevation_m":230},{"km":146.7,"elevation":225,"elevation_m":225}],"sprints":[{"number":1,"km":52.8,"name":"Mary route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":107.1,"name":"Mary approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]}]'::jsonb;
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
      case when r->>'cc'='TM'
        then 'Three-stage hidden Tour of Turkmenistan using Ashgabat, Kopet Dag foothill and Mary road corridors.'
        else 'Hidden one-day senior road race designed as a National Championship source route.'
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
        (s->>'distance')::numeric,s->>'terrain',s->>'finish_type',false,
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
        case when r->>'cc'='TM'
          then 'Tour of Turkmenistan stage using realistic national road corridors.'
          else 'One-day National Championship reserve course using realistic national road geography.'
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
      case when r->>'cc' in ('SM','TJ','TM') then 'hard' else 'moderate' end,
      (r->>'name')||' hidden reserve race with designated National Championship source stage(s).'
    );

    perform public.initialize_race_entry_rules_v1(
      rid,r->>'category',null,(r->>'prize')::bigint
    );
  end loop;
end
$$;

commit;
