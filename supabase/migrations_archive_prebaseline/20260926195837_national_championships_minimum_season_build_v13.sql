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

  /*
   * Week 16 is the earliest championship week. This guarantees that a new
   * season has enough race history before the National Ranking is frozen.
   * Week 48 is the latest permitted championship week so the full 3-day
   * window always stays inside the game season.
   */
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
    and w.week_of_year between 16 and 48
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
      and w.week_of_year between 16 and 48
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
