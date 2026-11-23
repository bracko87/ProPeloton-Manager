-- Hidden National Championship reserve races:
-- Liechtenstein, Madagascar, Maldives, Mauritania, Mongolia, Myanmar, Nepal and Niger.

begin;

do $$
declare
  data jsonb := '[{"race_id":"74574dbc-0c27-46ce-bd0b-03bbdf22dd67","pool_id":"f143e0cc-4dc2-4ef0-ab08-2c9428bd5f0e","cc":"LI","name":"Grand Prix Vaduz","short":"GP Vaduz","host":"Vaduz","category":"1.2","prize":88000,"stages":[{"id":"47b88d16-c6ae-442d-b655-c6f75b742047","n":1,"name":"Grand Prix Vaduz","start":"Vaduz","finish":"Vaduz","route":"Vaduz → Schaan → Bendern → Ruggell → Balzers → Triesen → Vaduz, repeated Rhine Valley championship circuit","distance":147.6,"terrain":"hilly","profile":"puncheur","gain":2100,"flat":38,"hilly":50,"mountain":12,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[455,470,500,540,620,525,455],"profile_points":[{"km":0,"elevation":455,"elevation_m":455},{"km":25.1,"elevation":470,"elevation_m":470},{"km":48.7,"elevation":500,"elevation_m":500},{"km":73.8,"elevation":540,"elevation_m":540},{"km":98.9,"elevation":620,"elevation_m":620},{"km":122.5,"elevation":525,"elevation_m":525},{"km":147.6,"elevation":455,"elevation_m":455}],"sprints":[{"number":1,"km":53.1,"name":"Vaduz route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":107.7,"name":"Vaduz approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":62,"name":"Vaduz route climb","category":"Cat 3","length_km":6.5,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":112.2,"name":"Vaduz highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"755d1a36-cf4d-409c-899d-4dc7b5ca2750","pool_id":"914fbe2d-e4bb-49d7-a453-c9a6b0e65a2a","cc":"MG","name":"Tour of Madagascar","short":"Tour of Madagascar","host":"Antananarivo","category":"2.2","prize":77000,"stages":[{"id":"5f15240d-a658-4dd6-9034-fce3cc8195f0","n":1,"name":"Stage 1 · Antananarivo to Antsirabe","start":"Antananarivo","finish":"Antsirabe","route":"Antananarivo → Behenjy → Ambatolampy → Antsirabe on RN7","distance":166.4,"terrain":"hilly","profile":"all_rounder","gain":2200,"flat":34,"hilly":54,"mountain":12,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[1280,1410,1540,1680,1580,1490,1500],"profile_points":[{"km":0,"elevation":1280,"elevation_m":1280},{"km":28.3,"elevation":1410,"elevation_m":1410},{"km":54.9,"elevation":1540,"elevation_m":1540},{"km":83.2,"elevation":1680,"elevation_m":1680},{"km":111.5,"elevation":1580,"elevation_m":1580},{"km":138.1,"elevation":1490,"elevation_m":1490},{"km":166.4,"elevation":1500,"elevation_m":1500}],"sprints":[{"number":1,"km":59.9,"name":"Antananarivo route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":121.5,"name":"Antsirabe approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":69.9,"name":"Antsirabe route climb","category":"Cat 3","length_km":6.5,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":126.5,"name":"Antsirabe highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"2f24e391-834d-45e7-a36d-3b3dd43712fd","n":2,"name":"Stage 2 · Antsirabe to Ambositra","start":"Antsirabe","finish":"Ambositra","route":"Antsirabe → RN7 southern highlands → Ambositra","distance":93.1,"terrain":"hilly","profile":"puncheur","gain":1480,"flat":28,"hilly":58,"mountain":14,"eligible":false,"slot":null,"finish_type":"uphill_finish","elev":[1500,1570,1630,1490,1420,1390,1340],"profile_points":[{"km":0,"elevation":1500,"elevation_m":1500},{"km":15.8,"elevation":1570,"elevation_m":1570},{"km":30.7,"elevation":1630,"elevation_m":1630},{"km":46.5,"elevation":1490,"elevation_m":1490},{"km":62.4,"elevation":1420,"elevation_m":1420},{"km":77.3,"elevation":1390,"elevation_m":1390},{"km":93.1,"elevation":1340,"elevation_m":1340}],"sprints":[{"number":1,"km":33.5,"name":"Antsirabe route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":68,"name":"Ambositra approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":39.1,"name":"Ambositra route climb","category":"Cat 3","length_km":6.5,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":70.8,"name":"Ambositra highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]},{"id":"b3af9620-47f6-4308-bbd0-b5c7bc9dfe96","n":3,"name":"Stage 3 · Ambositra to Fianarantsoa","start":"Ambositra","finish":"Fianarantsoa","route":"Ambositra → Ambohimahasoa → Fianarantsoa on RN7","distance":149.9,"terrain":"hilly","profile":"all_rounder","gain":2180,"flat":26,"hilly":58,"mountain":16,"eligible":false,"slot":null,"finish_type":"uphill_finish","elev":[1340,1450,1560,1490,1370,1280,1200],"profile_points":[{"km":0,"elevation":1340,"elevation_m":1340},{"km":25.5,"elevation":1450,"elevation_m":1450},{"km":49.5,"elevation":1560,"elevation_m":1560},{"km":75,"elevation":1490,"elevation_m":1490},{"km":100.4,"elevation":1370,"elevation_m":1370},{"km":124.4,"elevation":1280,"elevation_m":1280},{"km":149.9,"elevation":1200,"elevation_m":1200}],"sprints":[{"number":1,"km":54,"name":"Ambositra route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":109.4,"name":"Fianarantsoa approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":63,"name":"Fianarantsoa route climb","category":"Cat 3","length_km":6.5,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":113.9,"name":"Fianarantsoa highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"f48a8908-c0b5-472e-9b9a-d2bba582134a","pool_id":"ba3aeb66-f4c3-48c4-8a12-51b2865393b6","cc":"MV","name":"Tour of Maldives","short":"Tour of Maldives","host":"Hulhumalé","category":"2.2","prize":95000,"stages":[{"id":"4d8f130b-880a-481c-9e84-c4c4132dfaa5","n":1,"name":"Stage 1 · Hulhumalé Opening Circuit","start":"Hulhumalé","finish":"Hulhumalé","route":"Hulhumalé Central Park → Phase 1 waterfront → Phase 2 perimeter → Central Park, repeated road circuit","distance":82.6,"terrain":"flat","profile":"sprinter","gain":110,"flat":98,"hilly":2,"mountain":0,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[3,4,5,4,3,4,3],"profile_points":[{"km":0,"elevation":3,"elevation_m":3},{"km":14,"elevation":4,"elevation_m":4},{"km":27.3,"elevation":5,"elevation_m":5},{"km":41.3,"elevation":4,"elevation_m":4},{"km":55.3,"elevation":3,"elevation_m":3},{"km":68.6,"elevation":4,"elevation_m":4},{"km":82.6,"elevation":3,"elevation_m":3}],"sprints":[{"number":1,"km":29.7,"name":"Hulhumalé route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":60.3,"name":"Hulhumalé approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]},{"id":"67430736-1268-4c78-97c4-e6964258f552","n":2,"name":"Stage 2 · Greater Malé Championship Circuit","start":"Hulhumalé","finish":"Hulhumalé","route":"Hulhumalé Phase 1 and Phase 2 perimeter roads, repeated championship laps around the reclaimed-island road network","distance":145.2,"terrain":"flat","profile":"sprinter","gain":190,"flat":98,"hilly":2,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[3,5,4,6,4,5,3],"profile_points":[{"km":0,"elevation":3,"elevation_m":3},{"km":24.7,"elevation":5,"elevation_m":5},{"km":47.9,"elevation":4,"elevation_m":4},{"km":72.6,"elevation":6,"elevation_m":6},{"km":97.3,"elevation":4,"elevation_m":4},{"km":120.5,"elevation":5,"elevation_m":5},{"km":145.2,"elevation":3,"elevation_m":3}],"sprints":[{"number":1,"km":52.3,"name":"Hulhumalé route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":106,"name":"Hulhumalé approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]},{"id":"6cda692f-e2e9-4af9-9297-6c1838161dd5","n":3,"name":"Stage 3 · Hulhumalé Lagoon Circuit","start":"Hulhumalé","finish":"Hulhumalé","route":"Hulhumalé lagoon-side avenues and northern perimeter, repeated circuit","distance":96.4,"terrain":"flat","profile":"sprinter","gain":125,"flat":99,"hilly":1,"mountain":0,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[3,4,4,5,4,3,3],"profile_points":[{"km":0,"elevation":3,"elevation_m":3},{"km":16.4,"elevation":4,"elevation_m":4},{"km":31.8,"elevation":4,"elevation_m":4},{"km":48.2,"elevation":5,"elevation_m":5},{"km":64.6,"elevation":4,"elevation_m":4},{"km":80,"elevation":3,"elevation_m":3},{"km":96.4,"elevation":3,"elevation_m":3}],"sprints":[{"number":1,"km":34.7,"name":"Hulhumalé route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":70.4,"name":"Hulhumalé approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]},{"id":"98e41a78-bd13-4f37-997f-19e160c42b27","n":4,"name":"Stage 4 · Hulhumalé Finale","start":"Hulhumalé","finish":"Hulhumalé","route":"Hulhumalé Central Park and waterfront finishing circuit","distance":74.8,"terrain":"flat","profile":"sprinter","gain":95,"flat":99,"hilly":1,"mountain":0,"eligible":false,"slot":null,"finish_type":"flat_finish","elev":[3,4,5,4,4,3,3],"profile_points":[{"km":0,"elevation":3,"elevation_m":3},{"km":12.7,"elevation":4,"elevation_m":4},{"km":24.7,"elevation":5,"elevation_m":5},{"km":37.4,"elevation":4,"elevation_m":4},{"km":50.1,"elevation":4,"elevation_m":4},{"km":62.1,"elevation":3,"elevation_m":3},{"km":74.8,"elevation":3,"elevation_m":3}],"sprints":[{"number":1,"km":26.9,"name":"Hulhumalé route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":54.6,"name":"Hulhumalé approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]},{"race_id":"a4a4e719-7721-4190-9b2d-bc68c43ca6ca","pool_id":"bd523bb0-12af-4e2f-844e-b445bb9886dd","cc":"MR","name":"Grand Prix de Nouakchott","short":"GP Nouakchott","host":"Nouakchott","category":"1.2","prize":41000,"stages":[{"id":"296449dc-61d6-4ace-b9fa-7cc70c757ec1","n":1,"name":"Grand Prix de Nouakchott","start":"Nouakchott","finish":"Nouakchott","route":"Nouakchott → RN2 southbound desert corridor → Trarza turning circuit → Nouakchott","distance":152.7,"terrain":"flat","profile":"sprinter","gain":360,"flat":91,"hilly":9,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[7,12,20,25,18,13,7],"profile_points":[{"km":0,"elevation":7,"elevation_m":7},{"km":26,"elevation":12,"elevation_m":12},{"km":50.4,"elevation":20,"elevation_m":20},{"km":76.3,"elevation":25,"elevation_m":25},{"km":102.3,"elevation":18,"elevation_m":18},{"km":126.7,"elevation":13,"elevation_m":13},{"km":152.7,"elevation":7,"elevation_m":7}],"sprints":[{"number":1,"km":55,"name":"Nouakchott route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":111.5,"name":"Nouakchott approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]},{"race_id":"1197a03f-dd33-477f-8f38-d809557ec3c4","pool_id":"b98d3cdc-bf6b-4d7a-aacd-c91a4f60aa69","cc":"MN","name":"Ulaanbaatar Steppe Classic","short":"Steppe Classic","host":"Ulaanbaatar","category":"1.2","prize":56000,"stages":[{"id":"bfce70bc-e831-4afb-8504-23406dd99df3","n":1,"name":"Ulaanbaatar Steppe Classic","start":"Ulaanbaatar","finish":"Ulaanbaatar","route":"Ulaanbaatar → Nalaikh → Terelj approach → Nalaikh → Ulaanbaatar","distance":157.8,"terrain":"hilly","profile":"puncheur","gain":2410,"flat":24,"hilly":56,"mountain":20,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[1350,1420,1510,1650,1540,1430,1350],"profile_points":[{"km":0,"elevation":1350,"elevation_m":1350},{"km":26.8,"elevation":1420,"elevation_m":1420},{"km":52.1,"elevation":1510,"elevation_m":1510},{"km":78.9,"elevation":1650,"elevation_m":1650},{"km":105.7,"elevation":1540,"elevation_m":1540},{"km":131,"elevation":1430,"elevation_m":1430},{"km":157.8,"elevation":1350,"elevation_m":1350}],"sprints":[{"number":1,"km":56.8,"name":"Ulaanbaatar route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":115.2,"name":"Ulaanbaatar approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":66.3,"name":"Ulaanbaatar route climb","category":"Cat 3","length_km":6.5,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":119.9,"name":"Ulaanbaatar highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"73f12dde-1ee9-40ed-90e5-c8b14a9af8f8","pool_id":"83293de8-b0e3-4426-b460-d3e1f28cf1da","cc":"MM","name":"Naypyidaw Grand Prix","short":"GP Naypyidaw","host":"Naypyidaw","category":"1.2","prize":47500,"stages":[{"id":"2b4b7c6c-96c2-48b5-a059-357de9c17a3b","n":1,"name":"Naypyidaw Grand Prix","start":"Naypyidaw","finish":"Naypyidaw","route":"Naypyidaw → Yamethin road corridor → return via Naypyidaw boulevard circuit","distance":148.4,"terrain":"flat","profile":"sprinter","gain":520,"flat":82,"hilly":18,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[115,125,145,180,165,135,115],"profile_points":[{"km":0,"elevation":115,"elevation_m":115},{"km":25.2,"elevation":125,"elevation_m":125},{"km":49,"elevation":145,"elevation_m":145},{"km":74.2,"elevation":180,"elevation_m":180},{"km":99.4,"elevation":165,"elevation_m":165},{"km":123.2,"elevation":135,"elevation_m":135},{"km":148.4,"elevation":115,"elevation_m":115}],"sprints":[{"number":1,"km":53.4,"name":"Naypyidaw route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":108.3,"name":"Naypyidaw approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]},{"race_id":"4f94833c-acde-4769-8863-c0b2f5e31dda","pool_id":"8f87864c-e43a-4110-aa1a-6eaa13c07695","cc":"NP","name":"Kathmandu Valley Classic","short":"Kathmandu Classic","host":"Kathmandu","category":"1.2","prize":59000,"stages":[{"id":"a0ca50e6-a4b7-46a7-af27-f1098d1eaf5e","n":1,"name":"Kathmandu Valley Classic","start":"Kathmandu","finish":"Kathmandu","route":"Kathmandu → Bhaktapur → Sanga → Nagarkot → Dhulikhel → Bhaktapur → Kathmandu","distance":149.2,"terrain":"mountain","profile":"climber","gain":2840,"flat":16,"hilly":52,"mountain":32,"eligible":true,"slot":"hilly_mountain","finish_type":"uphill_finish","elev":[1400,1350,1600,2175,1550,1420,1400],"profile_points":[{"km":0,"elevation":1400,"elevation_m":1400},{"km":25.4,"elevation":1350,"elevation_m":1350},{"km":49.2,"elevation":1600,"elevation_m":1600},{"km":74.6,"elevation":2175,"elevation_m":2175},{"km":100,"elevation":1550,"elevation_m":1550},{"km":123.8,"elevation":1420,"elevation_m":1420},{"km":149.2,"elevation":1400,"elevation_m":1400}],"sprints":[{"number":1,"km":53.7,"name":"Kathmandu route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":108.9,"name":"Kathmandu approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":62.7,"name":"Kathmandu route climb","category":"Cat 3","length_km":6.5,"avg_gradient":4.6,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":113.4,"name":"Kathmandu highland rise","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}]}]},{"race_id":"5377bf29-29c7-43f7-b979-e8cb2e0cb8a3","pool_id":"c3fb098c-7f31-44c7-9478-c5fcd088b366","cc":"NE","name":"Grand Prix de Niamey","short":"GP Niamey","host":"Niamey","category":"1.2","prize":33500,"stages":[{"id":"80f5ca9e-d564-4a49-88db-9258a6bebcd4","n":1,"name":"Grand Prix de Niamey","start":"Niamey","finish":"Niamey","route":"Niamey → Kollo road corridor → Niger River plains circuit → Niamey","distance":151.9,"terrain":"flat","profile":"sprinter","gain":310,"flat":93,"hilly":7,"mountain":0,"eligible":true,"slot":"flat","finish_type":"flat_finish","elev":[205,210,215,220,215,208,205],"profile_points":[{"km":0,"elevation":205,"elevation_m":205},{"km":25.8,"elevation":210,"elevation_m":210},{"km":50.1,"elevation":215,"elevation_m":215},{"km":76,"elevation":220,"elevation_m":220},{"km":101.8,"elevation":215,"elevation_m":215},{"km":126.1,"elevation":208,"elevation_m":208},{"km":151.9,"elevation":205,"elevation_m":205}],"sprints":[{"number":1,"km":54.7,"name":"Niamey route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":110.9,"name":"Niamey approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[]}]}]'::jsonb;
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
        when r->>'cc'='MG' then 'Three-stage hidden Tour of Madagascar built around the RN7 highland corridor.'
        when r->>'cc'='MV' then 'Four-stage hidden Tour of Maldives using repeated road circuits in Hulhumalé.'
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
        case
          when r->>'cc'='MG' then 'Tour of Madagascar stage following the central RN7 highland corridor.'
          when r->>'cc'='MV' then 'Tour of Maldives stage on the Hulhumalé urban road network using repeated race circuits.'
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
      case when r->>'cc' in ('LI','MG','MN','NP') then 'hard' else 'moderate' end,
      (r->>'name')||' hidden reserve race with designated National Championship source stage(s).'
    );

    perform public.initialize_race_entry_rules_v1(
      rid,r->>'category',null,(r->>'prize')::bigint
    );
  end loop;
end
$$;

commit;
