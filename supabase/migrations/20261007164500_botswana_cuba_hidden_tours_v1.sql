-- Hidden senior stage races for Botswana and Cuba.
-- Both are category 2.2 with $70,000 total prize funds.
-- Selected stages are marked as National Championship suitable; other stages remain
-- hidden reserve / future regular-calendar material.

begin;

do $$
declare
  all_data jsonb := '[{"race":{"id":"1a9e68ec-49e7-43f9-84f9-9ab62a6840a1","pool":"f1dc5df1-4095-4457-af6a-59aa07d27e83","cc":"BW","name":"Tour of Botswana","short":"Tour of Botswana","host":"Gaborone","category":"2.2","prize":70000,"designated":[1,2]},"stages":[{"id":"5e6530f3-c34d-42e4-b1ad-19fd6f641f31","n":1,"name":"Stage 1 · Gaborone to Lobatse","start":"Gaborone","finish":"Lobatse","host":"Gaborone","route":"Gaborone → Ramotswa → Otse → Lobatse (A1)","distance":147.2,"terrain":"flat","profile":"sprinter","format":"road_race","finish_type":"flat_finish","gain":560,"flat":82,"hilly":18,"mountain":0,"eligible":true,"slot":"flat","elev":[1014,1005,995,1010,1002,991,985],"profile_points":[{"km":0,"elevation":1014,"elevation_m":1014},{"km":25,"elevation":1005,"elevation_m":1005},{"km":48.6,"elevation":995,"elevation_m":995},{"km":73.6,"elevation":1010,"elevation_m":1010},{"km":98.6,"elevation":1002,"elevation_m":1002},{"km":122.2,"elevation":991,"elevation_m":991},{"km":147.2,"elevation":985,"elevation_m":985}],"sprints":[{"number":1,"km":53,"name":"Gaborone route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":106,"name":"Lobatse approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[],"markers":[{"km":0,"type":"start","label":"Start","name":"Gaborone"},{"km":73.6,"type":"route","label":"Mid-route","name":"Route midpoint"},{"km":147.2,"type":"finish","label":"Finish","name":"Lobatse"}]},{"id":"a6964f0d-1e48-4e6e-a501-45a5ae86bb41","n":2,"name":"Stage 2 · Lobatse to Kanye Highlands","start":"Lobatse","finish":"Kanye","host":"Lobatse","route":"Lobatse → Polokwe → Trans-Kalahari junction → Kanye → extended Kanye highland circuit","distance":143.8,"terrain":"hilly","profile":"puncheur","format":"road_race","finish_type":"uphill_finish","gain":1685,"flat":34,"hilly":56,"mountain":10,"eligible":true,"slot":"hilly_mountain","elev":[1188,1225,1270,1315,1245,1290,1310],"profile_points":[{"km":0,"elevation":1188,"elevation_m":1188},{"km":24.4,"elevation":1225,"elevation_m":1225},{"km":47.5,"elevation":1270,"elevation_m":1270},{"km":71.9,"elevation":1315,"elevation_m":1315},{"km":96.3,"elevation":1245,"elevation_m":1245},{"km":119.4,"elevation":1290,"elevation_m":1290},{"km":143.8,"elevation":1310,"elevation_m":1310}],"sprints":[{"number":1,"km":51.8,"name":"Lobatse route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":103.5,"name":"Kanye approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":60.4,"name":"Kanye route climb 1","category":"Cat 3","length_km":6.2,"avg_gradient":4.5,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":112.2,"name":"Kanye route climb 2","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}],"markers":[{"km":0,"type":"start","label":"Start","name":"Lobatse"},{"km":60.4,"type":"kom","label":"Cat 3","name":"Kanye route climb 1"},{"km":143.8,"type":"finish","label":"Finish","name":"Kanye"}]},{"id":"91d3d9df-62df-4dda-9a11-bfd10d0f6284","n":3,"name":"Stage 3 · Kanye to Gaborone","start":"Kanye","finish":"Gaborone","host":"Kanye","route":"Kanye → Moshupa → Thamaga → Gaborone (A10)","distance":96.7,"terrain":"flat","profile":"sprinter","format":"road_race","finish_type":"flat_finish","gain":510,"flat":76,"hilly":24,"mountain":0,"eligible":false,"slot":null,"elev":[1310,1285,1240,1190,1135,1075,1014],"profile_points":[{"km":0,"elevation":1310,"elevation_m":1310},{"km":16.4,"elevation":1285,"elevation_m":1285},{"km":31.9,"elevation":1240,"elevation_m":1240},{"km":48.4,"elevation":1190,"elevation_m":1190},{"km":64.8,"elevation":1135,"elevation_m":1135},{"km":80.3,"elevation":1075,"elevation_m":1075},{"km":96.7,"elevation":1014,"elevation_m":1014}],"sprints":[{"number":1,"km":34.8,"name":"Kanye route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":69.6,"name":"Gaborone approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[],"markers":[{"km":0,"type":"start","label":"Start","name":"Kanye"},{"km":48.4,"type":"route","label":"Mid-route","name":"Route midpoint"},{"km":96.7,"type":"finish","label":"Finish","name":"Gaborone"}]}]},{"race":{"id":"eb7b19dd-c947-4a52-80dc-e24327ed4435","pool":"4881543a-d50d-4ed5-8563-0ccf23a256ac","cc":"CU","name":"Tour of Cuba","short":"Tour of Cuba","host":"Havana","category":"2.2","prize":70000,"designated":[2,4]},"stages":[{"id":"c5b8714f-a6d2-40dc-a993-37a9252035e4","n":1,"name":"Stage 1 · Havana to Matanzas","start":"Havana","finish":"Matanzas","host":"Havana","route":"Havana → Santa Cruz del Norte → Matanzas coastal corridor","distance":109.6,"terrain":"flat","profile":"sprinter","format":"road_race","finish_type":"flat_finish","gain":540,"flat":80,"hilly":20,"mountain":0,"eligible":false,"slot":null,"elev":[18,28,42,35,31,22,16],"profile_points":[{"km":0,"elevation":18,"elevation_m":18},{"km":18.6,"elevation":28,"elevation_m":28},{"km":36.2,"elevation":42,"elevation_m":42},{"km":54.8,"elevation":35,"elevation_m":35},{"km":73.4,"elevation":31,"elevation_m":31},{"km":91,"elevation":22,"elevation_m":22},{"km":109.6,"elevation":16,"elevation_m":16}],"sprints":[{"number":1,"km":39.5,"name":"Havana route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":78.9,"name":"Matanzas approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[],"markers":[{"km":0,"type":"start","label":"Start","name":"Havana"},{"km":54.8,"type":"route","label":"Mid-route","name":"Route midpoint"},{"km":109.6,"type":"finish","label":"Finish","name":"Matanzas"}]},{"id":"52275de7-5caa-4060-a3b0-21bd251fd3d1","n":2,"name":"Stage 2 · Matanzas to Varadero and Return","start":"Matanzas","finish":"Matanzas","host":"Matanzas","route":"Matanzas → Varadero → Cárdenas → Matanzas","distance":151.8,"terrain":"flat","profile":"sprinter","format":"road_race","finish_type":"flat_finish","gain":430,"flat":88,"hilly":12,"mountain":0,"eligible":true,"slot":"flat","elev":[16,12,8,10,18,24,16],"profile_points":[{"km":0,"elevation":16,"elevation_m":16},{"km":25.8,"elevation":12,"elevation_m":12},{"km":50.1,"elevation":8,"elevation_m":8},{"km":75.9,"elevation":10,"elevation_m":10},{"km":101.7,"elevation":18,"elevation_m":18},{"km":126,"elevation":24,"elevation_m":24},{"km":151.8,"elevation":16,"elevation_m":16}],"sprints":[{"number":1,"km":54.6,"name":"Matanzas route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":109.3,"name":"Matanzas approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[],"markers":[{"km":0,"type":"start","label":"Start","name":"Matanzas"},{"km":75.9,"type":"route","label":"Mid-route","name":"Route midpoint"},{"km":151.8,"type":"finish","label":"Finish","name":"Matanzas"}]},{"id":"839c9b8f-7696-4db2-9bca-527878303aa9","n":3,"name":"Stage 3 · Matanzas to Santa Clara","start":"Matanzas","finish":"Santa Clara","host":"Matanzas","route":"Matanzas → Jovellanos → Colón → Santo Domingo → Santa Clara","distance":174.2,"terrain":"rolling","profile":"all_rounder","format":"road_race","finish_type":"flat_finish","gain":1120,"flat":58,"hilly":42,"mountain":0,"eligible":false,"slot":null,"elev":[16,35,48,62,78,92,112],"profile_points":[{"km":0,"elevation":16,"elevation_m":16},{"km":29.6,"elevation":35,"elevation_m":35},{"km":57.5,"elevation":48,"elevation_m":48},{"km":87.1,"elevation":62,"elevation_m":62},{"km":116.7,"elevation":78,"elevation_m":78},{"km":144.6,"elevation":92,"elevation_m":92},{"km":174.2,"elevation":112,"elevation_m":112}],"sprints":[{"number":1,"km":62.7,"name":"Matanzas route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":125.4,"name":"Santa Clara approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[],"markers":[{"km":0,"type":"start","label":"Start","name":"Matanzas"},{"km":87.1,"type":"route","label":"Mid-route","name":"Route midpoint"},{"km":174.2,"type":"finish","label":"Finish","name":"Santa Clara"}]},{"id":"b83450f3-0902-4f84-ac17-f1b9c2ccf139","n":4,"name":"Stage 4 · Escambray Highlands","start":"Santa Clara","finish":"Trinidad","host":"Santa Clara","route":"Santa Clara → Manicaragua → Topes de Collantes approach → Trinidad","distance":146.7,"terrain":"hilly","profile":"puncheur","format":"road_race","finish_type":"uphill_finish","gain":2490,"flat":22,"hilly":58,"mountain":20,"eligible":true,"slot":"hilly_mountain","elev":[112,165,330,620,760,420,65],"profile_points":[{"km":0,"elevation":112,"elevation_m":112},{"km":24.9,"elevation":165,"elevation_m":165},{"km":48.4,"elevation":330,"elevation_m":330},{"km":73.3,"elevation":620,"elevation_m":620},{"km":98.3,"elevation":760,"elevation_m":760},{"km":121.8,"elevation":420,"elevation_m":420},{"km":146.7,"elevation":65,"elevation_m":65}],"sprints":[{"number":1,"km":52.8,"name":"Santa Clara route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":105.6,"name":"Trinidad approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[{"number":1,"km":61.6,"name":"Trinidad route climb 1","category":"Cat 3","length_km":6.2,"avg_gradient":4.5,"points_scheme":[5,3,2,1],"time_bonus_seconds":[]},{"number":2,"km":114.4,"name":"Trinidad route climb 2","category":"Cat 2","length_km":8.4,"avg_gradient":5,"points_scheme":[10,6,4,2,1],"time_bonus_seconds":[]}],"markers":[{"km":0,"type":"start","label":"Start","name":"Santa Clara"},{"km":61.6,"type":"kom","label":"Cat 3","name":"Trinidad route climb 1"},{"km":146.7,"type":"finish","label":"Finish","name":"Trinidad"}]},{"id":"356dcd15-9754-4d86-b247-0376718cbd5f","n":5,"name":"Stage 5 · Trinidad Coastal Finale","start":"Trinidad","finish":"Cienfuegos","host":"Trinidad","route":"Trinidad → Playa Ancón junction → coastal road → Cienfuegos","distance":119.4,"terrain":"rolling","profile":"all_rounder","format":"road_race","finish_type":"flat_finish","gain":790,"flat":62,"hilly":38,"mountain":0,"eligible":false,"slot":null,"elev":[65,40,28,36,55,48,25],"profile_points":[{"km":0,"elevation":65,"elevation_m":65},{"km":20.3,"elevation":40,"elevation_m":40},{"km":39.4,"elevation":28,"elevation_m":28},{"km":59.7,"elevation":36,"elevation_m":36},{"km":80,"elevation":55,"elevation_m":55},{"km":99.1,"elevation":48,"elevation_m":48},{"km":119.4,"elevation":25,"elevation_m":25}],"sprints":[{"number":1,"km":43,"name":"Trinidad route sprint","points":"standard","points_scheme":[12,8,5,3,1],"time_bonus_seconds":[3,2,1]},{"number":2,"km":86,"name":"Cienfuegos approach sprint","points":"standard","points_scheme":[10,6,4,2,1],"time_bonus_seconds":[3,2,1]}],"climbs":[],"markers":[{"km":0,"type":"start","label":"Start","name":"Trinidad"},{"km":59.7,"type":"route","label":"Mid-route","name":"Route midpoint"},{"km":119.4,"type":"finish","label":"Finish","name":"Cienfuegos"}]}]}]'::jsonb;
  rr jsonb;
  s jsonb;
  rid uuid;
  sid uuid;
  poolid uuid;
  designated jsonb;
begin
  for rr in select value from jsonb_array_elements(all_data)
  loop
    rid := (rr->'race'->>'id')::uuid;
    poolid := (rr->'race'->>'pool')::uuid;
    designated := rr->'race'->'designated';

    insert into public.races(
      id,name,short_name,start_date,end_date,country_code,host_city,category,race_type,
      is_stage_race,stage_count,status,description,metadata
    ) values (
      rid,
      rr->'race'->>'name',
      rr->'race'->>'short',
      null,null,
      rr->'race'->>'cc',
      rr->'race'->>'host',
      '2.2','stage_race',true,
      jsonb_array_length(rr->'stages'),
      'draft',
      case when rr->'race'->>'cc'='BW'
           then 'Three-day Tour of Botswana using the Gaborone–Lobatse–Kanye road network.'
           else 'Five-stage Tour of Cuba linking Havana, Matanzas, Varadero, Santa Clara, Trinidad and Cienfuegos.' end,
      jsonb_build_object(
        'calendar_visibility','hidden',
        'reserve_pool',true,
        'reserve_country_code',rr->'race'->>'cc',
        'future_regular_calendar_eligible',true,
        'national_competition_stage_count',jsonb_array_length(designated),
        'national_competition_designated_stage_numbers',designated,
        'route_library_version','v1',
        'national_championship_host_eligibility','allowed'
      )
    );

    for s in select value from jsonb_array_elements(rr->'stages')
    loop
      sid := (s->>'id')::uuid;

      insert into public.race_stages(
        id,race_id,stage_number,stage_date,name,start_city,finish_city,host_city,host_country_code,
        distance_km,terrain_type,finish_type,is_summit_finish,flat_pct,hilly_pct,mountain_pct,cobbled_pct,
        elevation_gain_m,weather_snapshot,rules_snapshot,metadata,start_city_name,finish_city_name,
        profile_type,notes,intermediate_sprints_json,mountain_climbs_json,stage_format
      ) values (
        sid,rid,(s->>'n')::int,null,s->>'name',s->>'start',s->>'finish',s->>'host',rr->'race'->>'cc',
        (s->>'distance')::numeric,
        case when s->>'terrain'='rolling' then 'hilly' else s->>'terrain' end,
        s->>'finish_type',false,
        (s->>'flat')::numeric,(s->>'hilly')::numeric,(s->>'mountain')::numeric,0,
        (s->>'gain')::int,'{}'::jsonb,'{}'::jsonb,
        jsonb_build_object(
          'calendar_visibility','hidden',
          'reserve_pool',true,
          'route_identity',lower(replace(s->>'name',' ','-')),
          'route_basis',s->>'route',
          'national_championship_host_eligibility','allowed',
          'national_competition_eligible',(s->>'eligible')::boolean,
          'national_competition_slot',s->>'slot'
        ),
        s->>'start',s->>'finish',s->>'profile',
        (rr->'race'->>'name')||' route: '||(s->>'route')||'.',
        coalesce(s->'sprints','[]'::jsonb),
        coalesce(s->'climbs','[]'::jsonb),
        s->>'format'
      );

      insert into public.race_stage_profile_details(
        stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
        distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
        profile_points,route_markers,intermediate_sprints,mountain_climbs,metadata,weather_snapshot
      ) values (
        sid,rid,s->>'name',s->>'route',
        (rr->'race'->>'name')||' stage on a realistic national road corridor: '||(s->>'route')||'.',
        null,(s->>'distance')::numeric,(s->>'gain')::int,
        case when s->>'terrain'='rolling' then 'hilly' else s->>'terrain' end,
        s->>'profile',
        jsonb_build_object('flat',(s->>'flat')::numeric,'hilly',(s->>'hilly')::numeric,'mountain',(s->>'mountain')::numeric,'cobbled',0),
        s->'profile_points',s->'markers',coalesce(s->'sprints','[]'::jsonb),coalesce(s->'climbs','[]'::jsonb),
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
      poolid,rid,rr->'race'->>'cc','hidden',true,false,
      array['national_championship','qualification','final','general_reserve']::text[],
      'moderate',
      (rr->'race'->>'name')||' hidden reserve stage race. Designated stages may be reused for National Championship qualification/final.'
    );

    perform public.initialize_race_entry_rules_v1(rid,'2.2',null,70000);
  end loop;
end
$$;

commit;
