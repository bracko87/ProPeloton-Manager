-- Read-only, non-authoritative proof of location-specific historical weather.
-- No cancelled-stage decision, production stage snapshot or engine write is allowed.
create or replace function private.weather_v2_preview_stage_v1(p_stage_id uuid)
returns jsonb
language sql stable
set search_path=private,public,pg_temp
as $function$
with stage as (
  select c.stage_id,c.game_season,c.historical_date,rs.stage_date,rs.stage_number,
         rs.planned_start_time_label,rs.distance_km,r.name as race_name
  from private.weather_v2_stage_candidate c
  join public.race_stages rs on rs.id=c.stage_id
  join public.races r on r.id=rs.race_id
  where c.stage_id=p_stage_id
), hourly_summary as (
  select pr.stage_id,pr.point_role,l.name,l.country_code,l.admin1_code,
         l.geonames_id,l.timezone_iana,
         count(h.historical_utc) as complete_hours,
         round(avg(h.temperature_c),1) as local_daily_mean_c,
         min(h.temperature_c) as local_daily_min_c,
         max(h.temperature_c) as local_daily_max_c,
         round(avg(h.temperature_c) filter
           (where h.historical_local_hour between 6 and 8),1) as local_morning_6_8_c,
         round(avg(h.temperature_c) filter
           (where h.historical_local_hour between 15 and 17),1) as local_afternoon_15_17_c,
         round(sum(h.precipitation_mm),2) as local_daily_precip_mm,
         round(avg(h.wind_speed_kmh),1) as local_daily_mean_wind_kmh,
         min(h.dataset) as source_dataset,
         min(h.dataset_version) as source_version
  from stage s
  join private.weather_v2_stage_point_resolution pr
    on pr.stage_id=s.stage_id and pr.status='verified'
  join private.weather_v2_locations l
    on l.location_id=pr.location_id and l.geocode_status='verified'
  left join private.weather_v2_hourly_archive h
    on h.location_id=l.location_id
   and h.historical_local_date=s.historical_date
   and h.dataset='NASA_POWER_MERRA2_hourly'
  group by pr.stage_id,pr.point_role,l.name,l.country_code,l.admin1_code,
           l.geonames_id,l.timezone_iana
)
select coalesce((
  select jsonb_build_object(
     'status','research_preview_only',
     'stage_id',s.stage_id,
     'race_name',s.race_name,
     'game_season',s.game_season,
     'game_stage_date',s.stage_date,
     'historical_date',s.historical_date,
     'start_city',to_jsonb(start_point),
     'finish_city',to_jsonb(finish_point),
     'weather_data_source','NASA POWER MERRA2 modelled historical grid data',
     'location_evidence','GeoNames CC BY 4.0, stage-specific city review',
     'known_limitations',jsonb_build_array(
       '15-17 local sampling is an illustration, NOT yet aligned with the game race clock',
       'Source is coarse-grid historical reanalysis, not a city weather station',
       'Only route endpoints are sampled; mountain and crosswind corridor remain untested',
       'Daily precipitation is not the probability of precipitation',
       'Snowfall / visibility observations are not available in this pilot',
       'No stage simulation or weather cancellation may consume this preview'),
     'automatic_cancellation_permitted',false)
  from stage s
  join hourly_summary start_point
    on start_point.stage_id=s.stage_id
   and start_point.point_role='start' and start_point.complete_hours=24
  join hourly_summary finish_point
    on finish_point.stage_id=s.stage_id
   and finish_point.point_role='finish' and finish_point.complete_hours=24
),jsonb_build_object(
  'status','not_ready',
  'stage_id',p_stage_id,
  'reason','Unverified route location or incomplete historical 24h coverage',
  'automatic_cancellation_permitted',false));
$function$;
revoke all on function private.weather_v2_preview_stage_v1(uuid)
from public,anon,authenticated;