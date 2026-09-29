update public.races
set metadata =
  jsonb_set(
    jsonb_set(
      coalesce(metadata,'{}'::jsonb),
      '{national_championship_host_eligibility}',
      '"excluded"'::jsonb,
      true
    ),
    '{national_championship_host_exclusion_reason}',
    '"multi_country_or_cross_border_race_confirmed_by_admin"'::jsonb,
    true
  ),
  updated_at=now()
where name in (
  'Zrenjanin–Timișoara Two-Days Classic',
  'Croatia-Slovenia Classic',
  'GP Brda-Collio Classic',
  'Trebinje-Dubrovnik',
  'Sofia – Thessaloniki Tour',
  'Benelux Road Tour',
  'Settimana Internazionale Coppa e Bartali'
);


CREATE OR REPLACE FUNCTION public.national_championship_pick_source_stage_for_window_v2(p_country_code text, p_season_number integer, p_event_key text, p_window_start date, p_window_end date, p_exclude_stage_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_stage uuid;
  v_week_start date;
  v_week_end date;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_week_start:=date_trunc('week',p_window_start::timestamp)::date;
  v_week_end:=date_trunc('week',p_window_end::timestamp)::date+6;

  select s.id
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and s.id is distinct from p_exclude_stage_id
    and coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0)<=0
      or coalesce(s.elevation_gain_m,0)
         <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    )
    and not (
      coalesce(r.end_date,r.start_date)>=v_week_start
      and r.start_date<=v_week_end
    )
  order by md5(
    s.id::text||':'||v_country||':'||p_season_number::text||':'||
    coalesce(p_event_key,'event')||':'||p_window_start::text
  )
  limit 1;

  return v_stage;
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_schedule_plan_v2(p_country_code text, p_season_number integer, p_eligible_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_source text;
  v_year integer:=1999+p_season_number;
  v_plan jsonb;
  v_heat_count integer:=0;
  v_route_candidates integer:=0;
  q record;
  f record;
  v_q_start date;
  v_q_end date;
  v_final date;
  v_q_stage uuid;
  v_f_stage uuid;
  v_q_temp numeric;
  v_final_temp numeric;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_plan:=public.national_championship_population_plan_v1(p_eligible_count);
  v_heat_count:=coalesce((v_plan->>'heat_count')::integer,0);
  v_source:=public.national_championship_climate_source_country_v1(v_country);

  if v_source is null then
    return jsonb_build_object(
      'status','weather_data_unavailable',
      'climate_status','weather_data_unavailable',
      'route_status','pending',
      'country_code',v_country
    );
  end if;

  if not exists(
    select 1
    from public.country_weather_weekly_normals w
    where upper(w.country_code)=v_source
      and w.week_of_year between 16 and 48
      and w.avg_max_temp_c>cfg.climate_target_temp_c
  ) then
    return jsonb_build_object(
      'status','temperature_target_unavailable',
      'climate_status','temperature_target_unavailable',
      'route_status','pending',
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'expected_max_temp_c',(
        select max(w.avg_max_temp_c)
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between 16 and 48
      )
    );
  end if;

  select count(*)::int
  into v_route_candidates
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0)<=0
      or coalesce(s.elevation_gain_m,0)
         <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    );

  if v_route_candidates<2 then
    return jsonb_build_object(
      'status','route_unavailable',
      'climate_status','ready',
      'route_status',case when v_route_candidates=0 then 'missing_route' else 'single_route_only' end,
      'country_code',v_country,
      'climate_source_country_code',v_source,
      'heat_count',v_heat_count
    );
  end if;

  if v_heat_count=0 then
    for f in
      select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between 16 and 48
        and w.avg_max_temp_c>cfg.climate_target_temp_c
      order by
        abs(w.avg_max_temp_c-26)
        +coalesce(w.p_heavy_rain,0)*8
        +coalesce(w.p_thunderstorm,0)*7
        +coalesce(w.p_rain,0)*2
        +greatest(coalesce(w.avg_wind_kmh,0)-20,0)*0.10
        +(abs(pg_catalog.hashtextextended(
          v_country||':'||p_season_number::text||':final:'||w.week_of_year::text,47
        ))%100)::numeric/10000.0,
        w.week_of_year
    loop
      v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
      v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'final',v_final,v_final,null
      );
      if v_f_stage is null then continue; end if;

      v_q_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'reserve-route',v_final,v_final,v_f_stage
      );
      if v_q_stage is null then continue; end if;

      return jsonb_build_object(
        'status','ready',
        'climate_status','ready',
        'route_status','ready',
        'country_code',v_country,
        'climate_source_country_code',v_source,
        'heat_count',0,
        'qualification_window_start_date',null,
        'qualification_window_end_date',null,
        'qualification_date',v_final-1,
        'final_window_start_date',v_final,
        'final_window_end_date',v_final,
        'final_date',v_final,
        'qualification_source_stage_id',v_q_stage,
        'final_source_stage_id',v_f_stage,
        'final_week_of_year',f.week_of_year,
        'week_of_year',f.week_of_year,
        'expected_max_temp_c',f.avg_max_temp_c,
        'final_expected_max_temp_c',f.avg_max_temp_c,
        'temperature_target_c',cfg.climate_target_temp_c
      );
    end loop;
  else
    for q in
      select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between 16 and 44
        and w.avg_max_temp_c>cfg.climate_target_temp_c
      order by
        abs(w.avg_max_temp_c-26)
        +coalesce(w.p_heavy_rain,0)*8
        +coalesce(w.p_thunderstorm,0)*7
        +coalesce(w.p_rain,0)*2
        +(abs(pg_catalog.hashtextextended(
          v_country||':'||p_season_number::text||':qualification:'||w.week_of_year::text,47
        ))%100)::numeric/10000.0,
        w.week_of_year
    loop
      v_q_start:=to_date(v_year::text||lpad(q.week_of_year::text,2,'0')||'1','IYYYIWID');
      v_q_end:=v_q_start+(v_heat_count-1);

      if exists(
        select 1
        from generate_series(v_q_start,v_q_end,interval '1 day') d(day_value)
        left join public.country_weather_weekly_normals w
          on upper(w.country_code)=v_source
         and w.week_of_year=extract(week from d.day_value)::int
        where w.week_of_year is null
           or w.avg_max_temp_c<=cfg.climate_target_temp_c
      ) then
        continue;
      end if;

      v_q_stage:=public.national_championship_pick_source_stage_for_window_v2(
        v_country,p_season_number,'qualification',v_q_start,v_q_end,null
      );
      if v_q_stage is null then continue; end if;

      select min(w.avg_max_temp_c)
      into v_q_temp
      from public.country_weather_weekly_normals w
      where upper(w.country_code)=v_source
        and w.week_of_year between q.week_of_year
            and q.week_of_year+ceil(greatest(v_heat_count-1,0)::numeric/7)::int;

      for f in
        select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between q.week_of_year+4 and least(q.week_of_year+8,48)
          and w.avg_max_temp_c>cfg.climate_target_temp_c
        order by
          abs(w.week_of_year-(q.week_of_year+6)),
          abs(w.avg_max_temp_c-26),
          w.week_of_year
      loop
        v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
        if v_final<=v_q_end then continue; end if;

        v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
          v_country,p_season_number,'final',v_final,v_final,v_q_stage
        );
        if v_f_stage is null then continue; end if;

        v_final_temp:=f.avg_max_temp_c;

        return jsonb_build_object(
          'status','ready',
          'climate_status','ready',
          'route_status','ready',
          'country_code',v_country,
          'climate_source_country_code',v_source,
          'heat_count',v_heat_count,
          'qualification_window_start_date',v_q_start,
          'qualification_window_end_date',v_q_end,
          'qualification_date',v_q_start,
          'final_window_start_date',v_final,
          'final_window_end_date',v_final,
          'final_date',v_final,
          'qualification_source_stage_id',v_q_stage,
          'final_source_stage_id',v_f_stage,
          'qualification_week_of_year',q.week_of_year,
          'final_week_of_year',f.week_of_year,
          'week_of_year',q.week_of_year,
          'expected_max_temp_c',v_q_temp,
          'final_expected_max_temp_c',v_final_temp,
          'temperature_target_c',cfg.climate_target_temp_c
        );
      end loop;

      for f in
        select w.week_of_year::int,w.avg_max_temp_c,w.avg_temp_c
        from public.country_weather_weekly_normals w
        where upper(w.country_code)=v_source
          and w.week_of_year between q.week_of_year+3 and least(q.week_of_year+10,48)
          and w.avg_max_temp_c>cfg.climate_target_temp_c
        order by
          abs(w.week_of_year-(q.week_of_year+6)),
          abs(w.avg_max_temp_c-26),
          w.week_of_year
      loop
        v_final:=to_date(v_year::text||lpad(f.week_of_year::text,2,'0')||'1','IYYYIWID')+6;
        if v_final<=v_q_end then continue; end if;

        v_f_stage:=public.national_championship_pick_source_stage_for_window_v2(
          v_country,p_season_number,'final-fallback',v_final,v_final,v_q_stage
        );
        if v_f_stage is null then continue; end if;

        return jsonb_build_object(
          'status','ready',
          'climate_status','ready',
          'route_status','ready',
          'country_code',v_country,
          'climate_source_country_code',v_source,
          'heat_count',v_heat_count,
          'qualification_window_start_date',v_q_start,
          'qualification_window_end_date',v_q_end,
          'qualification_date',v_q_start,
          'final_window_start_date',v_final,
          'final_window_end_date',v_final,
          'final_date',v_final,
          'qualification_source_stage_id',v_q_stage,
          'final_source_stage_id',v_f_stage,
          'qualification_week_of_year',q.week_of_year,
          'final_week_of_year',f.week_of_year,
          'week_of_year',q.week_of_year,
          'expected_max_temp_c',coalesce(v_q_temp,q.avg_max_temp_c),
          'final_expected_max_temp_c',f.avg_max_temp_c,
          'temperature_target_c',cfg.climate_target_temp_c
        );
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'status','route_calendar_conflict',
    'climate_status','ready',
    'route_status','calendar_conflict',
    'country_code',v_country,
    'climate_source_country_code',v_source,
    'heat_count',v_heat_count
  );
end;
$function$;
