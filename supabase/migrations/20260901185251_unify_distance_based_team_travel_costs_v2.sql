-- Distance-based canonical team travel costs v2.
-- Unifies race preparation, finance trip forecasts and trip charging around the
-- same country-distance model. Does not touch season transition/reset logic.

create table if not exists public.travel_country_geography_v1 (
  country_code text primary key,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  source_label text not null default 'country_reference_centroid_v1',
  updated_at timestamptz not null default now(),
  constraint travel_country_geography_v1_country_code_chk
    check (country_code = upper(country_code) and char_length(country_code) = 2)
);

comment on table public.travel_country_geography_v1 is
  'Reference country coordinates used for approximate great-circle team travel distance and race logistics pricing.';

insert into public.travel_country_geography_v1(country_code, latitude, longitude, source_label)
values
  ('AD', 42.506300, 1.521800, 'country_reference_centroid_v1'),
  ('AE', 24.000000, 54.000000, 'country_reference_centroid_v1'),
  ('AL', 41.000000, 20.000000, 'country_reference_centroid_v1'),
  ('AM', 40.000000, 45.000000, 'country_reference_centroid_v1'),
  ('AO', -12.500000, 18.500000, 'country_reference_centroid_v1'),
  ('AR', -34.000000, -64.000000, 'country_reference_centroid_v1'),
  ('AS', -14.333333, -170.000000, 'country_reference_centroid_v1'),
  ('AT', 47.333333, 13.333333, 'country_reference_centroid_v1'),
  ('AU', -27.000000, 133.000000, 'country_reference_centroid_v1'),
  ('AW', 12.500000, -69.966667, 'country_reference_centroid_v1'),
  ('AZ', 40.500000, 47.500000, 'country_reference_centroid_v1'),
  ('BA', 44.000000, 18.000000, 'country_reference_centroid_v1'),
  ('BB', 13.166667, -59.533333, 'country_reference_centroid_v1'),
  ('BD', 24.000000, 90.000000, 'country_reference_centroid_v1'),
  ('BE', 50.833333, 4.000000, 'country_reference_centroid_v1'),
  ('BF', 13.000000, -2.000000, 'country_reference_centroid_v1'),
  ('BG', 43.000000, 25.000000, 'country_reference_centroid_v1'),
  ('BH', 26.000000, 50.550000, 'country_reference_centroid_v1'),
  ('BJ', 9.500000, 2.250000, 'country_reference_centroid_v1'),
  ('BN', 4.500000, 114.666667, 'country_reference_centroid_v1'),
  ('BO', -17.000000, -65.000000, 'country_reference_centroid_v1'),
  ('BR', -10.000000, -55.000000, 'country_reference_centroid_v1'),
  ('BS', 24.250000, -76.000000, 'country_reference_centroid_v1'),
  ('BW', -22.000000, 24.000000, 'country_reference_centroid_v1'),
  ('BY', 53.000000, 28.000000, 'country_reference_centroid_v1'),
  ('BZ', 17.250000, -88.750000, 'country_reference_centroid_v1'),
  ('CA', 60.000000, -95.000000, 'country_reference_centroid_v1'),
  ('CD', 0.000000, 25.000000, 'country_reference_centroid_v1'),
  ('CF', 7.000000, 21.000000, 'country_reference_centroid_v1'),
  ('CH', 47.000000, 8.000000, 'country_reference_centroid_v1'),
  ('CI', 8.000000, -5.000000, 'country_reference_centroid_v1'),
  ('CL', -30.000000, -71.000000, 'country_reference_centroid_v1'),
  ('CM', 6.000000, 12.000000, 'country_reference_centroid_v1'),
  ('CN', 35.000000, 105.000000, 'country_reference_centroid_v1'),
  ('CO', 4.000000, -72.000000, 'country_reference_centroid_v1'),
  ('CR', 10.000000, -84.000000, 'country_reference_centroid_v1'),
  ('CU', 21.500000, -80.000000, 'country_reference_centroid_v1'),
  ('CV', 16.000000, -24.000000, 'country_reference_centroid_v1'),
  ('CW', 12.169600, -68.990000, 'country_reference_centroid_v1'),
  ('CY', 35.000000, 33.000000, 'country_reference_centroid_v1'),
  ('CZ', 49.750000, 15.500000, 'country_reference_centroid_v1'),
  ('DE', 51.000000, 9.000000, 'country_reference_centroid_v1'),
  ('DJ', 11.500000, 43.000000, 'country_reference_centroid_v1'),
  ('DK', 56.000000, 10.000000, 'country_reference_centroid_v1'),
  ('DM', 15.416667, -61.333333, 'country_reference_centroid_v1'),
  ('DO', 19.000000, -70.666667, 'country_reference_centroid_v1'),
  ('DZ', 28.000000, 3.000000, 'country_reference_centroid_v1'),
  ('EC', -2.000000, -77.500000, 'country_reference_centroid_v1'),
  ('EE', 59.000000, 26.000000, 'country_reference_centroid_v1'),
  ('EG', 27.000000, 30.000000, 'country_reference_centroid_v1'),
  ('EH', 24.500000, -13.000000, 'country_reference_centroid_v1'),
  ('ER', 15.000000, 39.000000, 'country_reference_centroid_v1'),
  ('ES', 40.000000, -4.000000, 'country_reference_centroid_v1'),
  ('ET', 8.000000, 38.000000, 'country_reference_centroid_v1'),
  ('FI', 64.000000, 26.000000, 'country_reference_centroid_v1'),
  ('FJ', -18.000000, 175.000000, 'country_reference_centroid_v1'),
  ('FR', 46.000000, 2.000000, 'country_reference_centroid_v1'),
  ('GA', -1.000000, 11.750000, 'country_reference_centroid_v1'),
  ('GB', 54.000000, -2.000000, 'country_reference_centroid_v1'),
  ('GE', 42.000000, 43.500000, 'country_reference_centroid_v1'),
  ('GH', 8.000000, -2.000000, 'country_reference_centroid_v1'),
  ('GI', 36.133333, -5.350000, 'country_reference_centroid_v1'),
  ('GN', 11.000000, -10.000000, 'country_reference_centroid_v1'),
  ('GP', 16.250000, -61.583333, 'country_reference_centroid_v1'),
  ('GR', 39.000000, 22.000000, 'country_reference_centroid_v1'),
  ('GT', 15.500000, -90.250000, 'country_reference_centroid_v1'),
  ('HK', 22.250000, 114.166667, 'country_reference_centroid_v1'),
  ('HR', 45.166667, 15.500000, 'country_reference_centroid_v1'),
  ('HT', 19.000000, -72.416667, 'country_reference_centroid_v1'),
  ('HU', 47.000000, 20.000000, 'country_reference_centroid_v1'),
  ('ID', -5.000000, 120.000000, 'country_reference_centroid_v1'),
  ('IE', 53.000000, -8.000000, 'country_reference_centroid_v1'),
  ('IL', 31.500000, 34.750000, 'country_reference_centroid_v1'),
  ('IN', 20.000000, 77.000000, 'country_reference_centroid_v1'),
  ('IQ', 33.000000, 44.000000, 'country_reference_centroid_v1'),
  ('IR', 32.000000, 53.000000, 'country_reference_centroid_v1'),
  ('IS', 65.000000, -18.000000, 'country_reference_centroid_v1'),
  ('IT', 42.833333, 12.833333, 'country_reference_centroid_v1'),
  ('JM', 18.250000, -77.500000, 'country_reference_centroid_v1'),
  ('JO', 31.000000, 36.000000, 'country_reference_centroid_v1'),
  ('JP', 36.000000, 138.000000, 'country_reference_centroid_v1'),
  ('KE', 1.000000, 38.000000, 'country_reference_centroid_v1'),
  ('KG', 41.000000, 75.000000, 'country_reference_centroid_v1'),
  ('KH', 13.000000, 105.000000, 'country_reference_centroid_v1'),
  ('KR', 37.000000, 127.500000, 'country_reference_centroid_v1'),
  ('KW', 29.500000, 45.750000, 'country_reference_centroid_v1'),
  ('KY', 19.500000, -80.500000, 'country_reference_centroid_v1'),
  ('KZ', 48.000000, 68.000000, 'country_reference_centroid_v1'),
  ('LA', 18.000000, 105.000000, 'country_reference_centroid_v1'),
  ('LI', 47.266667, 9.533333, 'country_reference_centroid_v1'),
  ('LK', 7.000000, 81.000000, 'country_reference_centroid_v1'),
  ('LR', 6.500000, -9.500000, 'country_reference_centroid_v1'),
  ('LS', -29.500000, 28.500000, 'country_reference_centroid_v1'),
  ('LT', 56.000000, 24.000000, 'country_reference_centroid_v1'),
  ('LU', 49.750000, 6.166667, 'country_reference_centroid_v1'),
  ('LV', 57.000000, 25.000000, 'country_reference_centroid_v1'),
  ('MA', 32.000000, -5.000000, 'country_reference_centroid_v1'),
  ('MD', 47.000000, 29.000000, 'country_reference_centroid_v1'),
  ('ME', 42.708700, 19.374400, 'country_reference_centroid_v1'),
  ('MG', -20.000000, 47.000000, 'country_reference_centroid_v1'),
  ('MK', 41.608600, 21.745300, 'country_reference_centroid_v1'),
  ('ML', 17.000000, -4.000000, 'country_reference_centroid_v1'),
  ('MM', 21.916200, 95.956000, 'country_reference_centroid_v1'),
  ('MN', 46.000000, 105.000000, 'country_reference_centroid_v1'),
  ('MR', 20.000000, -12.000000, 'country_reference_centroid_v1'),
  ('MT', 35.833333, 14.583333, 'country_reference_centroid_v1'),
  ('MU', -20.283333, 57.550000, 'country_reference_centroid_v1'),
  ('MV', 3.250000, 73.000000, 'country_reference_centroid_v1'),
  ('MW', -13.500000, 34.000000, 'country_reference_centroid_v1'),
  ('MX', 23.000000, -102.000000, 'country_reference_centroid_v1'),
  ('MY', 2.500000, 112.500000, 'country_reference_centroid_v1'),
  ('MZ', -18.250000, 35.000000, 'country_reference_centroid_v1'),
  ('NA', -22.000000, 17.000000, 'country_reference_centroid_v1'),
  ('NC', -21.500000, 165.500000, 'country_reference_centroid_v1'),
  ('NE', 16.000000, 8.000000, 'country_reference_centroid_v1'),
  ('NG', 10.000000, 8.000000, 'country_reference_centroid_v1'),
  ('NL', 52.500000, 5.750000, 'country_reference_centroid_v1'),
  ('NO', 62.000000, 10.000000, 'country_reference_centroid_v1'),
  ('NP', 28.000000, 84.000000, 'country_reference_centroid_v1'),
  ('NZ', -41.000000, 174.000000, 'country_reference_centroid_v1'),
  ('OM', 21.000000, 57.000000, 'country_reference_centroid_v1'),
  ('PA', 9.000000, -80.000000, 'country_reference_centroid_v1'),
  ('PE', -10.000000, -76.000000, 'country_reference_centroid_v1'),
  ('PF', -15.000000, -140.000000, 'country_reference_centroid_v1'),
  ('PG', -6.000000, 147.000000, 'country_reference_centroid_v1'),
  ('PH', 13.000000, 122.000000, 'country_reference_centroid_v1'),
  ('PK', 30.000000, 70.000000, 'country_reference_centroid_v1'),
  ('PL', 52.000000, 20.000000, 'country_reference_centroid_v1'),
  ('PR', 18.250000, -66.500000, 'country_reference_centroid_v1'),
  ('PT', 39.500000, -8.000000, 'country_reference_centroid_v1'),
  ('PY', -23.000000, -58.000000, 'country_reference_centroid_v1'),
  ('QA', 25.500000, 51.250000, 'country_reference_centroid_v1'),
  ('RO', 46.000000, 25.000000, 'country_reference_centroid_v1'),
  ('RS', 44.016500, 21.005900, 'country_reference_centroid_v1'),
  ('RU', 60.000000, 100.000000, 'country_reference_centroid_v1'),
  ('RW', -2.000000, 30.000000, 'country_reference_centroid_v1'),
  ('SA', 25.000000, 45.000000, 'country_reference_centroid_v1'),
  ('SC', -4.583333, 55.666667, 'country_reference_centroid_v1'),
  ('SE', 62.000000, 15.000000, 'country_reference_centroid_v1'),
  ('SG', 1.366667, 103.800000, 'country_reference_centroid_v1'),
  ('SI', 46.116667, 14.816667, 'country_reference_centroid_v1'),
  ('SK', 48.666667, 19.500000, 'country_reference_centroid_v1'),
  ('SL', 8.500000, -11.500000, 'country_reference_centroid_v1'),
  ('SM', 43.766667, 12.416667, 'country_reference_centroid_v1'),
  ('SN', 14.000000, -14.000000, 'country_reference_centroid_v1'),
  ('SZ', -26.500000, 31.500000, 'country_reference_centroid_v1'),
  ('TG', 8.000000, 1.166667, 'country_reference_centroid_v1'),
  ('TH', 15.000000, 100.000000, 'country_reference_centroid_v1'),
  ('TJ', 39.000000, 71.000000, 'country_reference_centroid_v1'),
  ('TM', 40.000000, 60.000000, 'country_reference_centroid_v1'),
  ('TN', 34.000000, 9.000000, 'country_reference_centroid_v1'),
  ('TO', -20.000000, -175.000000, 'country_reference_centroid_v1'),
  ('TR', 38.963700, 35.243300, 'country_reference_centroid_v1'),
  ('TT', 11.000000, -61.000000, 'country_reference_centroid_v1'),
  ('TW', 23.500000, 121.000000, 'country_reference_centroid_v1'),
  ('TZ', -6.000000, 35.000000, 'country_reference_centroid_v1'),
  ('UA', 49.000000, 32.000000, 'country_reference_centroid_v1'),
  ('UG', 1.000000, 32.000000, 'country_reference_centroid_v1'),
  ('US', 38.000000, -97.000000, 'country_reference_centroid_v1'),
  ('UY', -33.000000, -56.000000, 'country_reference_centroid_v1'),
  ('UZ', 41.000000, 64.000000, 'country_reference_centroid_v1'),
  ('VE', 8.000000, -66.000000, 'country_reference_centroid_v1'),
  ('VN', 16.166667, 107.833333, 'country_reference_centroid_v1'),
  ('VU', -16.000000, 167.000000, 'country_reference_centroid_v1'),
  ('WS', -13.583333, -172.333333, 'country_reference_centroid_v1'),
  ('XK', 42.602600, 20.903000, 'country_reference_centroid_v1'),
  ('ZA', -29.000000, 24.000000, 'country_reference_centroid_v1'),
  ('ZM', -15.000000, 30.000000, 'country_reference_centroid_v1'),
  ('ZW', -20.000000, 30.000000, 'country_reference_centroid_v1')
on conflict (country_code) do update
set latitude = excluded.latitude,
    longitude = excluded.longitude,
    source_label = excluded.source_label,
    updated_at = now();

create or replace function public.travel_country_distance_km_v2(
  p_origin_country_code text,
  p_destination_country_code text
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  with origin as (
    select g.country_code, g.latitude::double precision as lat, g.longitude::double precision as lon
    from public.travel_country_geography_v1 g
    where g.country_code = upper(btrim(coalesce(p_origin_country_code, '')))
  ),
  destination as (
    select g.country_code, g.latitude::double precision as lat, g.longitude::double precision as lon
    from public.travel_country_geography_v1 g
    where g.country_code = upper(btrim(coalesce(p_destination_country_code, '')))
  ),
  calc as (
    select
      o.country_code as origin_code,
      d.country_code as destination_code,
      sin(radians(d.lat - o.lat) / 2.0) * sin(radians(d.lat - o.lat) / 2.0)
      + cos(radians(o.lat)) * cos(radians(d.lat))
        * sin(radians(d.lon - o.lon) / 2.0) * sin(radians(d.lon - o.lon) / 2.0) as a
    from origin o
    cross join destination d
  )
  select
    case
      when origin_code = destination_code then 0::numeric
      else round(
        (
          6371.0
          * 2.0
          * asin(sqrt(least(1.0, greatest(0.0, a))))
        )::numeric,
        0
      )
    end
  from calc;
$function$;

comment on function public.travel_country_distance_km_v2(text,text) is
  'Approximate great-circle distance in km between country reference coordinates. Returns 0 for domestic routes and NULL when coordinates are unknown.';

create or replace function public.travel_route_band_multiplier_v1(
  p_origin_country_code text,
  p_destination_country_code text
)
returns table(route_band text, route_multiplier numeric)
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_origin text := upper(btrim(coalesce(p_origin_country_code, '')));
  v_dest text := upper(btrim(coalesce(p_destination_country_code, '')));
  v_distance numeric;
  v_origin_region text;
  v_dest_region text;
  v_band text := 'unknown_route';
  v_multiplier numeric := 2.00;
begin
  if v_origin = '' or v_dest = '' then
    return query select v_band, v_multiplier;
    return;
  end if;

  if v_origin = v_dest then
    return query select 'domestic'::text, 0.35::numeric;
    return;
  end if;

  v_distance := public.travel_country_distance_km_v2(v_origin, v_dest);

  if v_distance is not null then
    if v_distance <= 300 then
      v_band := 'nearby';
      v_multiplier := 0.50 + (v_distance / 3000.0);
    elsif v_distance <= 800 then
      v_band := 'short_haul';
      v_multiplier := 0.60 + ((v_distance - 300.0) * 0.0004);
    elsif v_distance <= 1500 then
      v_band := 'regional';
      v_multiplier := 0.80 + ((v_distance - 800.0) * 0.0003);
    elsif v_distance <= 3000 then
      v_band := 'medium_haul';
      v_multiplier := 1.01 + ((v_distance - 1500.0) * 0.0003);
    elsif v_distance <= 6000 then
      v_band := 'long_haul';
      v_multiplier := 1.46 + ((v_distance - 3000.0) * 0.00027);
    elsif v_distance <= 10000 then
      v_band := 'intercontinental';
      v_multiplier := 2.27 + ((v_distance - 6000.0) * 0.00024);
    else
      v_band := 'ultra_long_haul';
      v_multiplier := least(4.50, 3.23 + ((v_distance - 10000.0) * 0.00018));
    end if;

    return query select v_band, round(v_multiplier, 3);
    return;
  end if;

  v_origin_region := public.travel_region_from_country_v1(v_origin);
  v_dest_region := public.travel_region_from_country_v1(v_dest);

  if v_origin_region = v_dest_region and v_origin_region not in ('unknown', 'other') then
    v_band := 'same_region_fallback';
    v_multiplier := 1.00;
  elsif (v_origin_region = 'oceania' or v_dest_region = 'oceania') then
    v_band := 'oceania_fallback';
    v_multiplier := 4.00;
  elsif v_origin_region in ('north_america','south_america','asia')
     or v_dest_region in ('north_america','south_america','asia') then
    v_band := 'longhaul_fallback';
    v_multiplier := 3.00;
  else
    v_band := 'international_fallback';
    v_multiplier := 2.00;
  end if;

  return query select v_band, v_multiplier;
end;
$function$;

create or replace function public.get_team_policy_trip_cost_estimate(
  p_club_id uuid,
  p_destination_country_code text,
  p_destination_region_name text,
  p_days integer,
  p_rider_count integer,
  p_staff_count integer
)
returns table(
  club_id uuid,
  rider_count integer,
  staff_count integer,
  days_count integer,
  travel_cost_total integer,
  accommodation_cost_total integer,
  logistics_cost_total integer,
  staff_accommodation_cost_total integer,
  total_cost integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_origin_country_code text;
  v_destination_country_code text := upper(btrim(coalesce(p_destination_country_code, '')));
  v_flight_class text := 'economy';
  v_hotel_level text := 'standard';
  v_ground_transport text := 'standard_vans';
  v_logistics_support_level text := 'none';
  v_staff_accommodation_level text := 'shared';
  v_flight_base integer;
  v_hotel_base integer;
  v_ground_base integer;
  v_logistics_base integer;
  v_staff_accommodation_base integer;
  v_route_band text;
  v_route_multiplier numeric := 2.00;
  v_travel_people integer := 0;
  v_travel_total integer := 0;
  v_accommodation_total integer := 0;
  v_logistics_total integer := 0;
  v_staff_accommodation_total integer := 0;
  v_days integer := greatest(coalesce(p_days, 0), 0);
begin
  select upper(
    coalesce(
      case when coalesce(c.club_type, 'main') = 'developing'
        then nullif(parent_c.country_code, '') else nullif(c.country_code, '') end,
      nullif(c.country_code, ''), 'RS'
    )
  ) into v_origin_country_code
  from public.clubs c
  left join public.clubs parent_c on parent_c.id = c.parent_club_id
  where c.id = p_club_id limit 1;

  if v_origin_country_code is null then
    raise exception 'Club not found for trip estimate: %', p_club_id;
  end if;

  select coalesce(ctp.flight_class, 'economy'), coalesce(ctp.hotel_level, 'standard'),
         coalesce(ctp.ground_transport, 'standard_vans'), coalesce(ctp.logistics_support_level, 'none'),
         coalesce(ctp.staff_accommodation_level, 'shared')
  into v_flight_class, v_hotel_level, v_ground_transport, v_logistics_support_level, v_staff_accommodation_level
  from public.club_team_policies ctp where ctp.club_id = p_club_id limit 1;

  v_flight_class := coalesce(v_flight_class, 'economy');
  v_hotel_level := coalesce(v_hotel_level, 'standard');
  v_ground_transport := coalesce(v_ground_transport, 'standard_vans');
  v_logistics_support_level := coalesce(v_logistics_support_level, 'none');
  v_staff_accommodation_level := coalesce(v_staff_accommodation_level, 'shared');

  select round(coalesce(t.base_cost,0))::integer into v_flight_base from public.team_policy_option_catalog t where t.policy_key='flight_class' and t.option_code=v_flight_class and t.is_active=true limit 1;
  select round(coalesce(t.base_cost,0))::integer into v_hotel_base from public.team_policy_option_catalog t where t.policy_key='hotel_level' and t.option_code=v_hotel_level and t.is_active=true limit 1;
  select round(coalesce(t.base_cost,0))::integer into v_ground_base from public.team_policy_option_catalog t where t.policy_key='ground_transport' and t.option_code=v_ground_transport and t.is_active=true limit 1;
  select round(coalesce(t.base_cost,0))::integer into v_logistics_base from public.team_policy_option_catalog t where t.policy_key='logistics_support_level' and t.option_code=v_logistics_support_level and t.is_active=true limit 1;
  select round(coalesce(t.base_cost,0))::integer into v_staff_accommodation_base from public.team_policy_option_catalog t where t.policy_key='staff_accommodation_level' and t.option_code=v_staff_accommodation_level and t.is_active=true limit 1;

  v_flight_base := coalesce(v_flight_base, case v_flight_class when 'first' then 700 when 'business' then 500 when 'premium_economy' then 300 else 200 end);
  v_hotel_base := coalesce(v_hotel_base, case v_hotel_level when 'premium' then 400 when 'standard' then 200 else 100 end);
  v_ground_base := coalesce(v_ground_base, case v_ground_transport when 'premium_team_cars' then 100 when 'rental_cars' then 60 when 'team_bus' then 80 else 30 end);
  v_logistics_base := coalesce(v_logistics_base, case v_logistics_support_level when 'advanced' then 2000 when 'standard' then 1200 when 'basic' then 600 else 0 end);
  v_staff_accommodation_base := coalesce(v_staff_accommodation_base, case v_staff_accommodation_level when 'private_premium' then 400 when 'private_standard' then 200 when 'shared' then 100 else 0 end);

  select rb.route_band, rb.route_multiplier into v_route_band, v_route_multiplier
  from public.travel_route_band_multiplier_v1(v_origin_country_code, v_destination_country_code) rb limit 1;
  v_route_multiplier := coalesce(v_route_multiplier,2.00);
  v_travel_people := greatest(coalesce(p_rider_count,0),0)+greatest(coalesce(p_staff_count,0),0);
  v_travel_total := round(((coalesce(v_flight_base,0)::numeric*v_route_multiplier)+coalesce(v_ground_base,0)::numeric)*greatest(v_travel_people,0))::integer;
  v_accommodation_total := round(coalesce(v_hotel_base,0)::numeric*v_days*greatest(coalesce(p_rider_count,0),0))::integer;
  v_staff_accommodation_total := round(coalesce(v_staff_accommodation_base,0)::numeric*v_days*greatest(coalesce(p_staff_count,0),0))::integer;
  v_logistics_total := coalesce(v_logistics_base,0);

  return query select p_club_id,coalesce(p_rider_count,0),coalesce(p_staff_count,0),v_days,
    coalesce(v_travel_total,0),coalesce(v_accommodation_total,0),coalesce(v_logistics_total,0),coalesce(v_staff_accommodation_total,0),
    coalesce(v_travel_total,0)+coalesce(v_accommodation_total,0)+coalesce(v_logistics_total,0)+coalesce(v_staff_accommodation_total,0);
end;
$function$;

create or replace function public.calculate_team_trip_cost_forecast(
  p_club_id uuid, p_source_type text, p_source_id uuid, p_destination_country_code text,
  p_destination_region_name text, p_start_date date, p_end_date date,
  p_rider_count integer, p_staff_count integer
)
returns table(club_id uuid, source_type text, source_id uuid, rider_count integer, staff_count integer,
  trip_days integer, travel_cost_total integer, accommodation_cost_total integer, logistics_cost_total integer,
  staff_accommodation_cost_total integer, total_cost integer, warnings jsonb)
language plpgsql security definer set search_path=''
as $function$
declare
  v_estimate record; v_policy record; v_days integer; v_warnings jsonb := '[]'::jsonb;
begin
  if p_start_date is null or p_end_date is null then raise exception 'Start and end dates are required'; end if;
  v_days := greatest((p_end_date-p_start_date)+1,1);
  select * into v_estimate from public.get_team_policy_trip_cost_estimate(p_club_id,p_destination_country_code,p_destination_region_name,v_days,p_rider_count,p_staff_count);
  select * into v_policy from public.get_club_team_policy_quote_effects(p_club_id) limit 1;
  if coalesce(v_policy.flight_class,'economy')<>'economy' then v_warnings:=v_warnings||jsonb_build_array(format('Flight policy (%s) increased trip travel cost.',initcap(replace(v_policy.flight_class,'_',' ')))); end if;
  if coalesce(v_policy.hotel_level,'budget')<>'budget' then v_warnings:=v_warnings||jsonb_build_array(format('Accommodation policy (%s) increased rider lodging cost.',initcap(replace(v_policy.hotel_level,'_',' ')))); end if;
  if coalesce(v_policy.staff_accommodation_level,'none')<>'none' then v_warnings:=v_warnings||jsonb_build_array('Staff travel accommodation policy increased trip support cost.'); end if;
  if coalesce(v_policy.ground_transport,'standard_vans')<>'standard_vans' or coalesce(v_policy.logistics_support_level,'none')<>'none' or coalesce(v_policy.team_vehicle_policy,'none')<>'none' then v_warnings:=v_warnings||jsonb_build_array('Ground transport, logistics support, or vehicle policy increased trip operations cost.'); end if;
  return query select p_club_id,p_source_type,p_source_id,coalesce(p_rider_count,0),coalesce(p_staff_count,0),v_days,
    coalesce(v_estimate.travel_cost_total,0)::integer,coalesce(v_estimate.accommodation_cost_total,0)::integer,
    coalesce(v_estimate.logistics_cost_total,0)::integer,coalesce(v_estimate.staff_accommodation_cost_total,0)::integer,
    coalesce(v_estimate.total_cost,0)::integer,v_warnings;
end;
$function$;

create or replace function public.race_asset_transport_cost_for_club_v2(
  p_club_id uuid, p_destination_country_code text, p_asset_assignments jsonb, p_race_days integer
)
returns bigint language plpgsql stable security definer set search_path=''
as $function$
declare
  v_origin_country_code text; v_distance_km numeric; v_effective_distance_km numeric;
  v_freight_multiplier numeric:=1.00; v_days integer:=greatest(coalesce(p_race_days,1),1); v_total numeric:=0;
begin
  select upper(coalesce(case when coalesce(c.club_type,'main')='developing' then nullif(parent_c.country_code,'') else nullif(c.country_code,'') end,nullif(c.country_code,''),'RS'))
  into v_origin_country_code from public.clubs c left join public.clubs parent_c on parent_c.id=c.parent_club_id where c.id=p_club_id limit 1;
  if v_origin_country_code is null then raise exception 'Club not found for asset transport estimate: %',p_club_id; end if;
  v_distance_km:=public.travel_country_distance_km_v2(v_origin_country_code,upper(btrim(coalesce(p_destination_country_code,''))));
  v_effective_distance_km:=case when upper(btrim(coalesce(p_destination_country_code,'')))=v_origin_country_code then 250 when v_distance_km is null then 1500 else greatest(v_distance_km,100) end;
  v_freight_multiplier:=case when v_effective_distance_km>10000 then 1.70 when v_effective_distance_km>6000 then 1.45 when v_effective_distance_km>3000 then 1.25 else 1.00 end;
  select coalesce(sum(case coalesce(elem->>'asset_key','')
    when 'team_bus' then 500+(v_effective_distance_km*2*0.18*v_freight_multiplier)+(80*v_days)
    when 'equipment_van' then 350+(v_effective_distance_km*2*0.14*v_freight_multiplier)+(60*v_days)
    when 'mobile_workshop' then 550+(v_effective_distance_km*2*0.20*v_freight_multiplier)+(80*v_days)
    when 'medical_van' then 400+(v_effective_distance_km*2*0.16*v_freight_multiplier)+(65*v_days)
    when 'team_car' then 220+(v_effective_distance_km*2*0.10*v_freight_multiplier)+(45*v_days)
    else 300+(v_effective_distance_km*2*0.12*v_freight_multiplier)+(50*v_days) end),0)
  into v_total from jsonb_array_elements(coalesce(p_asset_assignments,'[]'::jsonb)) elem;
  return round(v_total)::bigint;
end;
$function$;

-- Guarded patch of the legacy flat asset transport expression only.
do $migration_patch$
declare v_oid oid; v_def text; v_new_def text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='quote_race_preparation_v1'
    and pg_get_function_identity_arguments(p.oid)='p_race_id uuid, p_club_id uuid, p_rider_ids uuid[], p_staff_ids uuid[], p_asset_assignments jsonb, p_supply_reservations jsonb, p_default_equipment_setup_id uuid' limit 1;
  if v_oid is null then raise exception 'quote_race_preparation_v1 canonical signature not found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  if v_def !~ 'v_asset_transport_cost[[:space:]]*:=[[:space:]]*greatest\(v_asset_count,[[:space:]]*0\)[[:space:]]*\*[[:space:]]*\([[:space:]]*250[[:space:]]*\+[[:space:]]*\(75[[:space:]]*\*[[:space:]]*v_race_days\)[[:space:]]*\)[[:space:]]*;' then
    raise exception 'quote_race_preparation_v1 flat asset transport block has drifted; migration aborted';
  end if;
  v_new_def:=regexp_replace(v_def,
    'v_asset_transport_cost[[:space:]]*:=[[:space:]]*greatest\(v_asset_count,[[:space:]]*0\)[[:space:]]*\*[[:space:]]*\([[:space:]]*250[[:space:]]*\+[[:space:]]*\(75[[:space:]]*\*[[:space:]]*v_race_days\)[[:space:]]*\)[[:space:]]*;',
    'v_asset_transport_cost := public.race_asset_transport_cost_for_club_v2('||'p_club_id, coalesce(v_destination_country_code, ''''), '||'coalesce(p_asset_assignments, ''[]''::jsonb), v_race_days);');
  if v_new_def=v_def then raise exception 'quote_race_preparation_v1 asset transport replacement did not change function definition'; end if;
  execute v_new_def;
end;
$migration_patch$;
