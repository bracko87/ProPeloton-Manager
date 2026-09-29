create or replace function public.national_championship_climate_source_country_v1(
  p_country_code text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_country text := upper(trim(coalesce(p_country_code,'')));
  v_source text;
  v_lat numeric;
  v_lon numeric;
begin
  if exists(
    select 1
    from public.country_weather_weekly_normals w
    where upper(w.country_code)=v_country
  ) then
    return v_country;
  end if;

  select g.latitude,g.longitude
  into v_lat,v_lon
  from public.travel_country_geography_v1 g
  where upper(g.country_code)=v_country
  limit 1;

  if v_lat is null or v_lon is null then
    return null;
  end if;

  select w.country_code
  into v_source
  from (
    select distinct upper(country_code) as country_code
    from public.country_weather_weekly_normals
  ) w
  join public.travel_country_geography_v1 g
    on upper(g.country_code)=w.country_code
  order by
    power(g.latitude-v_lat,2)+power(g.longitude-v_lon,2),
    w.country_code
  limit 1;

  return v_source;
end;
$$;

create or replace function public.national_championship_schedule_v1(
  p_country_code text,
  p_season_number integer
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg public.national_championship_config%rowtype;
  v_country text := upper(trim(coalesce(p_country_code,'')));
  v_source text;
  v_week integer;
  v_expected_max numeric;
  v_expected_avg numeric;
  v_year integer := 1999 + p_season_number;
  v_monday date;
  v_start date;
  v_final date;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_source := public.national_championship_climate_source_country_v1(v_country);

  if v_source is null then
    return jsonb_build_object(
      'status','weather_data_unavailable',
      'country_code',v_country,
      'climate_source_country_code',null
    );
  end if;

  select
    w.week_of_year::integer,
    w.avg_max_temp_c,
    w.avg_temp_c
  into
    v_week,
    v_expected_max,
    v_expected_avg
  from public.country_weather_weekly_normals w
  where upper(w.country_code)=v_source
    and w.avg_max_temp_c > cfg.climate_target_temp_c
  order by
    abs(w.avg_max_temp_c - 26)
      + coalesce(w.p_heavy_rain,0)*8
      + coalesce(w.p_thunderstorm,0)*7
      + coalesce(w.p_rain,0)*2
      + greatest(coalesce(w.avg_wind_kmh,0)-20,0)*0.10
      + (
          abs(
            pg_catalog.hashtextextended(
              v_country||':'||p_season_number::text||':'||w.week_of_year::text,
              47
            )
          ) % 100
        )::numeric / 10000.0,
    w.week_of_year
  limit 1;

  if v_week is null then
    select
      w.week_of_year::integer,
      w.avg_max_temp_c,
      w.avg_temp_c
    into
      v_week,
      v_expected_max,
      v_expected_avg
    from public.country_weather_weekly_normals w
    where upper(w.country_code)=v_source
    order by w.avg_max_temp_c desc,w.week_of_year
    limit 1;

    return jsonb_build_object(
      'status','temperature_target_unavailable',
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'week_of_year',v_week,
      'expected_max_temp_c',v_expected_max,
      'expected_avg_temp_c',v_expected_avg
    );
  end if;

  v_monday := to_date(
    v_year::text||lpad(v_week::text,2,'0')||'1',
    'IYYYIWID'
  );

  v_start := v_monday + 4;
  v_final := v_monday + 6;

  return jsonb_build_object(
    'status','ready',
    'country_code',v_country,
    'climate_source_country_code',v_source,
    'week_of_year',v_week,
    'expected_max_temp_c',v_expected_max,
    'expected_avg_temp_c',v_expected_avg,
    'duty_window_start_date',v_start,
    'qualification_date',v_start,
    'duty_window_end_date',v_final,
    'final_date',v_final,
    'temperature_target_c',cfg.climate_target_temp_c
  );
end;
$$;

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

  with candidates as (
    select
      s.id,
      coalesce(s.mountain_pct,0) as mountain_pct,
      coalesce(s.elevation_gain_m,0) as elevation_gain_m,
      coalesce(s.distance_km,0) as distance_km
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
  ),
  preferred as (
    select c.id
    from candidates c
    where c.mountain_pct <= cfg.preferred_route_mountain_pct_max
      and c.elevation_gain_m <= cfg.preferred_route_elevation_gain_max
      and (
        c.distance_km <= 0
        or c.elevation_gain_m <= c.distance_km * cfg.preferred_route_elevation_per_km_max
      )
    order by md5(
      c.id::text||':'||v_country||':'||p_season_number::text||':'||coalesce(p_event_key,'event')
    )
    limit 1
  )
  select id into v_stage from preferred;

  if v_stage is not null then
    return v_stage;
  end if;

  with candidates as (
    select
      s.id,
      coalesce(s.mountain_pct,0) as mountain_pct,
      coalesce(s.elevation_gain_m,0) as elevation_gain_m,
      coalesce(s.distance_km,0) as distance_km
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
      and coalesce(s.mountain_pct,0) < 55
      and coalesce(s.elevation_gain_m,0) <= greatest(
        3200,
        coalesce(s.distance_km,0) * 22
      )
  )
  select c.id
  into v_stage
  from candidates c
  order by md5(
    c.id::text||':'||v_country||':'||p_season_number::text||':'||coalesce(p_event_key,'event')||':fallback'
  )
  limit 1;

  return v_stage;
end;
$$;

create or replace function public.national_championship_refresh_planned_editions_v1(
  p_season_number integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  cfg public.national_championship_config%rowtype;
  e record;
  s jsonb;
  v_q_stage uuid;
  v_f_stage uuid;
  v_route_status text;
  v_updated integer := 0;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  for e in
    select id,country_code,season_number
    from public.national_championship_editions
    where season_number=p_season_number
      and discipline='road'
      and status='planned'
    order by country_code
  loop
    s := public.national_championship_schedule_v1(e.country_code,e.season_number);

    v_q_stage := public.national_championship_pick_source_stage_v1(
      e.country_code,e.season_number,'qualification',null
    );
    v_f_stage := public.national_championship_pick_source_stage_v1(
      e.country_code,e.season_number,'final',v_q_stage
    );

    if v_q_stage is null then
      v_q_stage := public.national_championship_pick_source_stage_v1(
        e.country_code,e.season_number,'qualification-fallback',null
      );
    end if;

    if v_f_stage is null then
      v_f_stage := v_q_stage;
    end if;

    v_route_status := case
      when v_q_stage is null and v_f_stage is null then 'missing_route'
      when v_q_stage is not null and v_f_stage = v_q_stage then 'single_route_only'
      else 'ready'
    end;

    update public.national_championship_editions
    set
      duty_window_start_date=case
        when s->>'status'='ready' then (s->>'duty_window_start_date')::date
        else duty_window_start_date
      end,
      qualification_date=case
        when s->>'status'='ready' then (s->>'qualification_date')::date
        else qualification_date
      end,
      duty_window_end_date=case
        when s->>'status'='ready' then (s->>'duty_window_end_date')::date
        else duty_window_end_date
      end,
      final_date=case
        when s->>'status'='ready' then (s->>'final_date')::date
        else final_date
      end,
      ranking_snapshot_date=case
        when s->>'status'='ready'
          then (s->>'duty_window_start_date')::date - cfg.ranking_freeze_lead_days
        else ranking_snapshot_date
      end,
      participation_decision_deadline=case
        when s->>'status'='ready'
          then (s->>'duty_window_start_date')::date - cfg.participation_decision_lead_days
        else participation_decision_deadline
      end,
      climate_source_country_code=s->>'climate_source_country_code',
      climate_week_of_year=nullif(s->>'week_of_year','')::integer,
      climate_expected_max_temp_c=nullif(s->>'expected_max_temp_c','')::numeric,
      climate_status=coalesce(s->>'status','weather_data_unavailable'),
      qualification_source_stage_id=v_q_stage,
      final_source_stage_id=v_f_stage,
      route_status=v_route_status,
      updated_at=now()
    where id=e.id;

    v_updated := v_updated+1;
  end loop;

  return jsonb_build_object(
    'season_number',p_season_number,
    'editions_refreshed',v_updated
  );
end;
$$;

create or replace function public.national_championship_final_date_v1(
  p_country_code text,
  p_season_number integer
)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  s jsonb;
begin
  s := public.national_championship_schedule_v1(p_country_code,p_season_number);
  if s->>'status'='ready' then
    return (s->>'final_date')::date;
  end if;

  return make_date(1999+p_season_number,7,1);
end;
$$;

create or replace function public.ensure_national_championship_editions_for_season_v1(
  p_season_number integer
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  cfg public.national_championship_config%rowtype;
  inserted_count integer := 0;
  s jsonb;
  x record;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  for x in
    select distinct upper(country_code) as country_code
    from public.riders
    where nullif(trim(country_code),'') is not null
    order by 1
  loop
    s := public.national_championship_schedule_v1(x.country_code,p_season_number);

    insert into public.national_championship_editions(
      season_number,
      country_code,
      discipline,
      ranking_snapshot_date,
      qualification_date,
      final_date,
      final_field_size,
      duty_window_start_date,
      duty_window_end_date,
      participation_decision_deadline,
      climate_source_country_code,
      climate_week_of_year,
      climate_expected_max_temp_c,
      climate_status
    )
    values(
      p_season_number,
      x.country_code,
      'road',
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date-cfg.ranking_freeze_lead_days
        else make_date(1999+p_season_number,7,1)-cfg.ranking_freeze_lead_days
      end,
      case when s->>'status'='ready'
        then (s->>'qualification_date')::date
        else make_date(1999+p_season_number,7,1)
      end,
      case when s->>'status'='ready'
        then (s->>'final_date')::date
        else make_date(1999+p_season_number,7,3)
      end,
      cfg.final_field_size,
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date
        else null
      end,
      case when s->>'status'='ready'
        then (s->>'duty_window_end_date')::date
        else null
      end,
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date-cfg.participation_decision_lead_days
        else null
      end,
      s->>'climate_source_country_code',
      nullif(s->>'week_of_year','')::integer,
      nullif(s->>'expected_max_temp_c','')::numeric,
      coalesce(s->>'status','weather_data_unavailable')
    )
    on conflict (season_number,country_code,discipline) do nothing;

    if found then
      inserted_count:=inserted_count+1;
    end if;
  end loop;

  perform public.national_championship_refresh_planned_editions_v1(p_season_number);

  return inserted_count;
end;
$$;

revoke execute on function public.national_championship_climate_source_country_v1(text)
  from anon,authenticated;
revoke execute on function public.national_championship_schedule_v1(text,integer)
  from anon,authenticated;
revoke execute on function public.national_championship_pick_source_stage_v1(text,integer,text,uuid)
  from anon,authenticated;
revoke execute on function public.national_championship_refresh_planned_editions_v1(integer)
  from anon,authenticated;
