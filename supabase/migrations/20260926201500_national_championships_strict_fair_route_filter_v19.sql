create or replace function public.national_championship_pick_source_stage_v1(
  p_country_code text,
  p_season_number integer,
  p_event_key text,
  p_exclude_stage_id uuid default null
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg public.national_championship_config%rowtype;
  v_country text := upper(trim(coalesce(p_country_code,'')));
  v_stage uuid;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  select s.id
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and s.id is distinct from p_exclude_stage_id
    and coalesce(s.mountain_pct,0) <= cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0) <= cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0) <= 0
      or coalesce(s.elevation_gain_m,0)
         <= coalesce(s.distance_km,0) * cfg.preferred_route_elevation_per_km_max
    )
  order by md5(
    s.id::text||':'||v_country||':'||
    p_season_number::text||':'||coalesce(p_event_key,'event')
  )
  limit 1;

  return v_stage;
end;
$$;

revoke execute on function public.national_championship_pick_source_stage_v1(text,integer,text,uuid)
  from anon,authenticated;
