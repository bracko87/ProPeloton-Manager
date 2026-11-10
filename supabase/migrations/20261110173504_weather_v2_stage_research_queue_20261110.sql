-- Build a read-only research queue from existing stage names and season references.
-- Does not modify race_stages, existing weather snapshots, or cancellation decisions.
insert into private.weather_v2_stage_candidate
  (stage_id, game_season, historical_date, start_location_id, finish_location_id, status)
select s.id, d.game_season, d.historical_date, a.location_id, b.location_id, 'unresolved'
from public.race_stages s
join public.races r on r.id=s.race_id
join lateral private.weather_v2_reference_date(s.stage_date) d on true
left join private.weather_v2_locations a
  on a.country_code = coalesce(nullif(upper(btrim(s.host_country_code)),''),upper(btrim(r.country_code)))
 and a.name_key = lower(regexp_replace(btrim(s.start_city),'[[:space:]]+',' ','g'))
left join private.weather_v2_locations b
  on b.country_code = coalesce(nullif(upper(btrim(s.host_country_code)),''),upper(btrim(r.country_code)))
 and b.name_key = lower(regexp_replace(btrim(s.finish_city),'[[:space:]]+',' ','g'))
on conflict (stage_id) do nothing;