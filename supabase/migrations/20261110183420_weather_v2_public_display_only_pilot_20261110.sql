
-- Publication of VERIFIED HISTORICAL REFERENCE PREVIEWS only.
-- No weather engine, cancellation, score or stage weather_snapshot writes.
alter table private.weather_v2_stage_candidate
 add column if not exists display_approved boolean not null default false,
 add column if not exists display_approved_at timestamptz;

-- Separate read-only consumer, only staged + individually display-approved.
create or replace function private.weather_v2_published_stage_reference_v1(p_stage_id uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = private,public,pg_temp
as $fn$
declare
 v record;
 v_count_start integer;
 v_count_finish integer;
 v_n integer;
 v_temp numeric;
 v_min numeric;
 v_max numeric;
 v_wind numeric;
 v_precip numeric;
begin
 select c.stage_id,c.historical_date,c.game_season,
        rs.stage_date,rs.planned_start_hour_number::integer as start_hour,
        rs.planned_start_minute::integer as start_minute,
        rs.start_time_region_code,
        a.location_id as start_id,a.name as start_name,a.timezone_iana as start_timezone,
        b.location_id as finish_id,b.name as finish_name,b.timezone_iana as finish_timezone
 into v
 from private.weather_v2_stage_candidate c
 join public.race_stages rs on rs.id=c.stage_id
 join private.weather_v2_stage_point_resolution p_start
   on p_start.stage_id=rs.id and p_start.point_role='start' and p_start.status='verified'
 join private.weather_v2_stage_point_resolution p_finish
   on p_finish.stage_id=rs.id and p_finish.point_role='finish' and p_finish.status='verified'
 join private.weather_v2_locations a
   on a.location_id=p_start.location_id and a.geocode_status='verified'
 join private.weather_v2_locations b
   on b.location_id=p_finish.location_id and b.geocode_status='verified'
 where c.stage_id=p_stage_id and c.display_approved=true and
 c.display_approved_at is not null and c.status in ('in_review','validated');

 if not found then return null; end if;
 -- Honor the existing seven-game-day forecast reveal window.
 if v.stage_date is null or v.stage_date >
     ((public.get_current_game_timestamp() at time zone 'UTC')::date + 7) then
   return null;
 end if;

 -- Do not silently transpose weather across unrelated time zones, or
 -- present a guessed duration / night-time snapshot.
 if v.start_timezone <> v.finish_timezone or v.start_hour not between 5 and 20 then
   return null;
 end if;

 select count(*) into v_count_start
 from private.weather_v2_hourly_archive h
 where h.location_id=v.start_id and h.historical_local_date=v.historical_date
 and h.dataset='NASA_POWER_MERRA2_hourly'
 and h.temperature_c is not null and h.wind_speed_kmh is not null
 and h.precipitation_mm is not null;
 select count(*) into v_count_finish
 from private.weather_v2_hourly_archive h
 where h.location_id=v.finish_id and h.historical_local_date=v.historical_date
 and h.dataset='NASA_POWER_MERRA2_hourly'
 and h.temperature_c is not null and h.wind_speed_kmh is not null
 and h.precipitation_mm is not null;
 if v_count_start<>24 or v_count_finish<>24 then return null; end if;

 -- Four *illustrative* local hours: first two at stage start, last two
 -- at stage finish. Never described or used as actual route-hour forecast.
 select count(*),round(avg(s.temperature_c),1),min(s.temperature_c),
  max(s.temperature_c),round(avg(s.wind_speed_kmh),1),
  round(sum(s.precipitation_mm),1)
 into v_n,v_temp,v_min,v_max,v_wind,v_precip
 from (
  select h.temperature_c,h.wind_speed_kmh,h.precipitation_mm
  from private.weather_v2_hourly_archive h
  where h.location_id=v.start_id and h.historical_local_date=v.historical_date
    and h.dataset='NASA_POWER_MERRA2_hourly'
    and h.historical_local_hour in (v.start_hour,v.start_hour+1)
  union all
  select h.temperature_c,h.wind_speed_kmh,h.precipitation_mm
  from private.weather_v2_hourly_archive h
  where h.location_id=v.finish_id and h.historical_local_date=v.historical_date
    and h.dataset='NASA_POWER_MERRA2_hourly'
    and h.historical_local_hour in (v.start_hour+2,v.start_hour+3)
 ) s;
 if v_n<>4 or v_temp is null or v_wind is null or v_precip is null
 then return null; end if;

 return jsonb_build_object(
  'status','historical_reference_only',
  'condition','historical_reference',
  'source','nasa_power_merra2_city_historical_reference_v2',
  'weather_v2_display_only',true,
  'not_authoritative_for_simulation_or_cancellation',true,
  'historical_date',v.historical_date,
  'game_season',v.game_season,
  'start_city',v.start_name,'finish_city',v.finish_name,
  'start_hour_local',v.start_hour,
  'weather_time_note','Illustrative four-hour local sample; regional game clock not yet verified',
  'model_note','NASA POWER MERRA2 modelled grid, not station observation',
  'avg_temp_c',v_temp,
  'avg_min_temp_c',v_min,
  'avg_max_temp_c',v_max,
  'avg_wind_kmh',v_wind,
  'avg_precip_mm',v_precip,
  'precipitation_kind','sampled_amount_mm_not_probability'
 );
end;
$fn$;

revoke all on function private.weather_v2_published_stage_reference_v1(uuid)
 from public,anon,authenticated;

create or replace function public.get_race_stage_historical_weather_preview_v2(p_stage_id uuid)
returns jsonb
language sql stable security definer
set search_path=private,public,pg_temp
as $fn$
  select private.weather_v2_published_stage_reference_v1(p_stage_id);
$fn$;
revoke all on function public.get_race_stage_historical_weather_preview_v2(uuid)
 from public,anon,authenticated;
grant execute on function public.get_race_stage_historical_weather_preview_v2(uuid)
 to anon,authenticated;

-- Explicit, source-backed pilot publication for an imminent stage.
update private.weather_v2_stage_candidate c
set status='in_review',
    display_approved=true,
    display_approved_at=now(),
    evidence=coalesce(c.evidence,'{}'::jsonb)||jsonb_build_object(
       'published_for','stage_weather_reference_display_only',
       'simulation_approved',false,
       'cancellation_approved',false,
       'location_evidence','Darwin AU GeoNames 2073124; Batchelor NT Government 10677',
       'weather_source','NASA POWER MERRA2 UTC hourly 2025-12-13 through 2025-12-15',
       'stage_time_assumption','planned 07:15 treated as city local for four-hour sample')
where c.stage_id='960a01d6-c12a-4a5c-8950-469ef16a925a'::uuid
  and exists (select 1 from private.weather_v2_stage_point_resolution p
              where p.stage_id=c.stage_id and p.point_role='start' and p.status='verified')
  and exists (select 1 from private.weather_v2_stage_point_resolution p
              where p.stage_id=c.stage_id and p.point_role='finish' and p.status='verified');
