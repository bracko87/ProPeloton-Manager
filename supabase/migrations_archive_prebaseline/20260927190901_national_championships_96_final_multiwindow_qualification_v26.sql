alter table public.national_championship_editions
  add column if not exists qualification_window_start_date date,
  add column if not exists qualification_window_end_date date,
  add column if not exists final_window_start_date date,
  add column if not exists final_window_end_date date;

alter table public.national_championship_editions
  drop constraint if exists national_championship_editions_route_status_check;

alter table public.national_championship_editions
  add constraint national_championship_editions_route_status_check
  check (route_status = any (array[
    'pending'::text,
    'ready'::text,
    'single_route_only'::text,
    'missing_route'::text,
    'calendar_conflict'::text
  ]));

update public.national_championship_config
set final_field_size=96,
    direct_qualifier_count=0,
    updated_at=now()
where id=true;

create or replace function public.national_championship_population_plan_v1(
  p_eligible_count integer
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select *
    from public.national_championship_config
    where id=true
  ),
  calc as (
    select
      greatest(coalesce(p_eligible_count,0),0)::int eligible_count,
      cfg.final_field_size,
      cfg.qualification_heat_max_size
    from cfg
  )
  select jsonb_build_object(
    'eligible_count',eligible_count,
    'final_field_size',least(eligible_count,final_field_size),
    'direct_qualifiers',case
      when eligible_count<=final_field_size then eligible_count
      else 0
    end,
    'qualification_population',case
      when eligible_count<=final_field_size then 0
      else eligible_count
    end,
    'qualification_places',case
      when eligible_count<=final_field_size then 0
      else final_field_size
    end,
    'heat_count',case
      when eligible_count<=final_field_size then 0
      else ceil(eligible_count::numeric/qualification_heat_max_size)::int
    end
  )
  from calc;
$$;

create or replace function public.national_championship_pick_source_stage_for_window_v2(
  p_country_code text,
  p_season_number integer,
  p_event_key text,
  p_window_start date,
  p_window_end date,
  p_exclude_stage_id uuid default null
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
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
$$;

create or replace function public.national_championship_schedule_plan_v2(
  p_country_code text,
  p_season_number integer,
  p_eligible_count integer
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
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
  p jsonb;
  v_eligible integer;
  v_first_event date;
  v_updated integer:=0;
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
    select count(*)::int
    into v_eligible
    from public.preview_national_ranking_v1(
      e.country_code,
      public.get_current_game_date_date()
    );

    p:=public.national_championship_population_plan_v1(v_eligible);
    s:=public.national_championship_schedule_plan_v2(
      e.country_code,e.season_number,v_eligible
    );

    v_first_event:=case
      when coalesce((p->>'heat_count')::int,0)>0
        then nullif(s->>'qualification_window_start_date','')::date
      else nullif(s->>'final_date','')::date
    end;

    update public.national_championship_editions
    set
      eligible_count=v_eligible,
      final_field_size=cfg.final_field_size,
      direct_qualifier_count=coalesce((p->>'direct_qualifiers')::int,0),
      qualification_places=coalesce((p->>'qualification_places')::int,0),
      qualification_heat_count=coalesce((p->>'heat_count')::int,0),
      qualification_window_start_date=nullif(s->>'qualification_window_start_date','')::date,
      qualification_window_end_date=nullif(s->>'qualification_window_end_date','')::date,
      final_window_start_date=nullif(s->>'final_window_start_date','')::date,
      final_window_end_date=nullif(s->>'final_window_end_date','')::date,
      duty_window_start_date=v_first_event,
      duty_window_end_date=case
        when coalesce((p->>'heat_count')::int,0)>0
          then nullif(s->>'qualification_window_end_date','')::date
        else nullif(s->>'final_date','')::date
      end,
      qualification_date=coalesce(
        nullif(s->>'qualification_date','')::date,
        qualification_date
      ),
      final_date=coalesce(
        nullif(s->>'final_date','')::date,
        final_date
      ),
      ranking_snapshot_date=case
        when v_first_event is not null
          then v_first_event-cfg.ranking_freeze_lead_days
        else ranking_snapshot_date
      end,
      participation_decision_deadline=case
        when v_first_event is not null
          then v_first_event-cfg.participation_decision_lead_days
        else participation_decision_deadline
      end,
      climate_source_country_code=s->>'climate_source_country_code',
      climate_week_of_year=nullif(s->>'week_of_year','')::int,
      climate_expected_max_temp_c=nullif(s->>'expected_max_temp_c','')::numeric,
      climate_status=coalesce(s->>'climate_status','weather_data_unavailable'),
      qualification_source_stage_id=nullif(s->>'qualification_source_stage_id','')::uuid,
      final_source_stage_id=nullif(s->>'final_source_stage_id','')::uuid,
      route_status=coalesce(s->>'route_status','pending'),
      updated_at=now()
    where id=e.id;

    v_updated:=v_updated+1;
  end loop;

  return jsonb_build_object(
    'season_number',p_season_number,
    'editions_refreshed',v_updated
  );
end;
$$;

create or replace function public.freeze_national_championship_ranking_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  cfg public.national_championship_config%rowtype;
  v_eligible integer;
  v_direct integer;
  v_qualification_places integer;
  v_heat_count integer;
  v_heat integer;
  v_base_places integer;
  v_remainder integer;
  v_plan jsonb;
  v_schedule jsonb;
  v_first_event date;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status<>'planned' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status',e.status,
      'already_processed',true
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id=true;

  select count(*)::int
  into v_eligible
  from public.preview_national_ranking_v1(
    e.country_code,e.ranking_snapshot_date
  );

  v_plan:=public.national_championship_population_plan_v1(v_eligible);
  v_direct:=coalesce((v_plan->>'direct_qualifiers')::int,0);
  v_qualification_places:=coalesce((v_plan->>'qualification_places')::int,0);
  v_heat_count:=coalesce((v_plan->>'heat_count')::int,0);

  v_schedule:=public.national_championship_schedule_plan_v2(
    e.country_code,e.season_number,v_eligible
  );

  if coalesce(v_schedule->>'climate_status','')<>'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_climate',
      'climate_status',v_schedule->>'climate_status'
    );
  end if;

  if coalesce(v_schedule->>'route_status','')<>'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_routes',
      'route_status',v_schedule->>'route_status'
    );
  end if;

  v_first_event:=case
    when v_heat_count>0
      then (v_schedule->>'qualification_window_start_date')::date
    else (v_schedule->>'final_date')::date
  end;

  update public.national_championship_editions
  set eligible_count=v_eligible,
      final_field_size=least(v_eligible,cfg.final_field_size),
      direct_qualifier_count=v_direct,
      qualification_places=v_qualification_places,
      qualification_heat_count=v_heat_count,
      qualification_window_start_date=nullif(v_schedule->>'qualification_window_start_date','')::date,
      qualification_window_end_date=nullif(v_schedule->>'qualification_window_end_date','')::date,
      final_window_start_date=(v_schedule->>'final_date')::date,
      final_window_end_date=(v_schedule->>'final_date')::date,
      duty_window_start_date=v_first_event,
      duty_window_end_date=case
        when v_heat_count>0
          then (v_schedule->>'qualification_window_end_date')::date
        else (v_schedule->>'final_date')::date
      end,
      qualification_date=(v_schedule->>'qualification_date')::date,
      final_date=(v_schedule->>'final_date')::date,
      ranking_snapshot_date=v_first_event-cfg.ranking_freeze_lead_days,
      participation_decision_deadline=v_first_event-cfg.participation_decision_lead_days,
      climate_source_country_code=v_schedule->>'climate_source_country_code',
      climate_week_of_year=nullif(v_schedule->>'week_of_year','')::int,
      climate_expected_max_temp_c=nullif(v_schedule->>'expected_max_temp_c','')::numeric,
      climate_status='ready',
      route_status='ready',
      qualification_source_stage_id=(v_schedule->>'qualification_source_stage_id')::uuid,
      final_source_stage_id=(v_schedule->>'final_source_stage_id')::uuid,
      updated_at=now()
  where id=e.id
  returning * into e;

  insert into public.national_championship_ranking_snapshots(
    edition_id,rider_id,club_id,national_rank,raw_points,weighted_points,
    best_weighted_result,latest_result_date,overall_snapshot,
    rider_name_snapshot,country_code_snapshot
  )
  select
    e.id,p.rider_id,p.club_id,p.national_rank,p.raw_points,p.weighted_points,
    p.best_weighted_result,p.latest_result_date,p.overall,p.rider_name,p.country_code
  from public.preview_national_ranking_v1(e.country_code,e.ranking_snapshot_date) p;

  if v_heat_count>0 then
    v_base_places:=floor(v_qualification_places::numeric/v_heat_count)::int;
    v_remainder:=mod(v_qualification_places,v_heat_count);

    for v_heat in 1..v_heat_count loop
      insert into public.national_championship_heats(
        edition_id,heat_number,qualification_date,qualifying_places
      )
      values(
        e.id,
        v_heat,
        e.qualification_date+(v_heat-1),
        v_base_places+case when v_heat<=v_remainder then 1 else 0 end
      );
    end loop;
  end if;

  if v_heat_count=0 then
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,s.rider_id,s.club_id,s.national_rank,'direct','direct_qualified',
      s.national_rank,s.rider_name_snapshot,s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    where s.edition_id=e.id
    order by s.national_rank;
  else
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      heat_id,heat_number,seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,
      s.rider_id,
      s.club_id,
      s.national_rank,
      'qualification',
      'qualification_assigned',
      h.id,
      q.heat_number,
      s.national_rank,
      s.rider_name_snapshot,
      s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    cross join lateral(
      select case
        when (floor(((s.national_rank-1)::numeric)/v_heat_count)::int % 2)=0
          then ((s.national_rank-1)%v_heat_count)+1
        else v_heat_count-((s.national_rank-1)%v_heat_count)
      end as heat_number
    ) q
    join public.national_championship_heats h
      on h.edition_id=e.id and h.heat_number=q.heat_number
    where s.edition_id=e.id
    order by s.national_rank;
  end if;

  update public.national_championship_entries en
  set participation_decision=case
      when en.club_id_snapshot is null then 'auto_approved'
      when coalesce(root.is_ai,false) or root.owner_user_id is null
        then 'auto_approved'
      else 'pending'
    end,
    participation_decision_at=case
      when en.club_id_snapshot is null
        or coalesce(root.is_ai,false)
        or root.owner_user_id is null
        then now()
      else null
    end,
    updated_at=now()
  from public.clubs rc
  left join public.clubs root_parent on root_parent.id=rc.parent_club_id
  cross join lateral(
    select
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then coalesce(root_parent.is_ai,false)
        else coalesce(rc.is_ai,false)
      end is_ai,
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then root_parent.owner_user_id
        else rc.owner_user_id
      end owner_user_id
  ) root
  where en.edition_id=e.id
    and en.club_id_snapshot=rc.id;

  update public.national_championship_entries
  set participation_decision='auto_approved',
      participation_decision_at=now(),
      updated_at=now()
  where edition_id=e.id
    and club_id_snapshot is null;

  update public.national_championship_heats h
  set assigned_count=x.assigned_count,updated_at=now()
  from(
    select heat_id,count(*)::int assigned_count
    from public.national_championship_entries
    where edition_id=e.id
      and heat_id is not null
      and entry_status<>'withdrawn'
    group by heat_id
  ) x
  where h.id=x.heat_id;

  insert into public.national_championship_duties(
    edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
    duty_start_date,duty_end_date
  )
  select
    e.id,
    en.rider_id,
    case when v_heat_count=0 then 'final' else 'qualification' end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end,
    en.heat_id,
    'confirmed',
    case
      when v_heat_count=0
        then 'National Duty — '||e.country_code||' National Road Championship'
      else 'National Duty — '||e.country_code||' National Qualification Group '||en.heat_number
    end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end
  from public.national_championship_entries en
  left join public.national_championship_heats h on h.id=en.heat_id
  where en.edition_id=e.id
  on conflict (edition_id,rider_id,duty_type) do update
    set duty_date=excluded.duty_date,
        heat_id=excluded.heat_id,
        label=excluded.label,
        status='confirmed',
        duty_start_date=excluded.duty_start_date,
        duty_end_date=excluded.duty_end_date,
        updated_at=now();

  update public.national_championship_editions
  set status='ranking_frozen',updated_at=now()
  where id=e.id;

  return jsonb_build_object(
    'edition_id',e.id,
    'country_code',e.country_code,
    'eligible_count',v_eligible,
    'direct_qualifiers',v_direct,
    'qualification_population',case when v_heat_count>0 then v_eligible else 0 end,
    'qualification_places',v_qualification_places,
    'heat_count',v_heat_count,
    'qualification_window_start_date',e.qualification_window_start_date,
    'qualification_window_end_date',e.qualification_window_end_date,
    'final_date',e.final_date,
    'decision_deadline',e.participation_decision_deadline,
    'status','ranking_frozen'
  );
end;
$$;

create or replace function public.national_championship_process_qualification_results_v1()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  h record;
  v_stage_id uuid;
  v_result_count integer;
  v_processed integer:=0;
  v_completed_editions uuid[]:='{}'::uuid[];
  q record;
begin
  for h in
    select
      heat.*,
      e.country_code,
      e.final_date,
      e.final_race_id,
      e.status edition_status
    from public.national_championship_heats heat
    join public.national_championship_editions e on e.id=heat.edition_id
    where heat.status='ready'
      and heat.race_id is not null
      and e.status in ('qualification_pending','qualification_completed','final_ready')
    order by heat.qualification_date,heat.edition_id,heat.heat_number
  loop
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id=h.race_id
    order by s.stage_number
    limit 1;

    if v_stage_id is null then continue; end if;

    if not exists(
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_stage_id and sr.status='completed'
    ) then
      continue;
    end if;

    select count(*)::int into v_result_count
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id and rs.rider_id is not null;

    if v_result_count=0 then continue; end if;

    insert into public.national_championship_result_history(
      edition_id,event_type,heat_id,rider_id,club_id_snapshot,rank,status,
      rider_name_snapshot,club_name_snapshot,country_code_snapshot,race_id
    )
    select
      h.edition_id,'qualification',h.id,rs.rider_id,en.club_id_snapshot,
      coalesce(rs.rank,9999),rs.status,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name),
      coalesce(c.name,rs.team_name_snapshot),
      en.country_code_snapshot,h.race_id
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=h.edition_id
     and en.rider_id=rs.rider_id
     and en.heat_id=h.id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    where rs.stage_id=v_stage_id
    on conflict do nothing;

    with finished as (
      select
        rs.rider_id,
        row_number() over(order by rs.rank nulls last,rs.id) finish_order
      from public.race_stage_results rs
      where rs.stage_id=v_stage_id
        and rs.rider_id is not null
        and lower(coalesce(rs.status,'finished'))='finished'
    )
    update public.national_championship_entries en
    set entry_status=case
          when f.finish_order is not null
           and f.finish_order<=h.qualifying_places
            then 'qualified'
          else 'eliminated'
        end,
        updated_at=now()
    from public.race_stage_results rs
    left join finished f on f.rider_id=rs.rider_id
    where en.edition_id=h.edition_id
      and en.heat_id=h.id
      and en.rider_id=rs.rider_id
      and rs.stage_id=v_stage_id
      and en.entry_status='qualification_assigned';

    update public.national_championship_duties
    set status='completed',updated_at=now()
    where edition_id=h.edition_id
      and heat_id=h.id
      and duty_type='qualification'
      and status='confirmed';

    insert into public.national_championship_rider_plans(
      edition_id,rider_id,event_type,heat_id,equipment_setup_id,
      phase_1_command,phase_2_command,phase_3_command,phase_4_command,
      updated_by_user_id
    )
    select
      qp.edition_id,qp.rider_id,'final',null,qp.equipment_setup_id,
      qp.phase_1_command,qp.phase_2_command,qp.phase_3_command,qp.phase_4_command,
      qp.updated_by_user_id
    from public.national_championship_rider_plans qp
    join public.national_championship_entries en
      on en.edition_id=qp.edition_id
     and en.rider_id=qp.rider_id
     and en.entry_status='qualified'
    where qp.edition_id=h.edition_id
      and qp.event_type='qualification'
      and en.heat_id=h.id
    on conflict (edition_id,rider_id,event_type) do nothing;

    update public.national_championship_heats
    set status='completed',updated_at=now()
    where id=h.id;

    for q in
      select
        en.rider_id,en.rider_name_snapshot,root.owner_user_id
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=h.edition_id
        and en.heat_id=h.id
        and en.entry_status='qualified'
        and root.owner_user_id is not null
    loop
      perform public.ppm_create_user_notification_direct_v1(
        q.owner_user_id,
        'NATIONAL_CHAMPIONSHIP_QUALIFIED',
        q.rider_name_snapshot||' qualified for the National Championship final',
        q.rider_name_snapshot||' finished inside the qualifying places in National Qualification Group '||
          h.heat_number||' and will race the '||h.country_code||
          ' National Championship final on '||h.final_date||'.',
        '/dashboard/national-ranking?tab=duty',
        jsonb_build_object(
          'edition_id',h.edition_id,
          'country_code',h.country_code,
          'rider_id',q.rider_id,
          'rider_name',q.rider_name_snapshot,
          'heat_number',h.heat_number,
          'final_date',h.final_date,
          'action_path','/dashboard/national-ranking?tab=duty'
        ),
        'national-championship-qualified:'||h.edition_id::text||':'||q.rider_id::text
      );
    end loop;

    if not exists(
      select 1
      from public.national_championship_heats pending
      where pending.edition_id=h.edition_id
        and pending.status<>'completed'
    ) then
      update public.national_championship_entries
      set entry_status='finalist',updated_at=now()
      where edition_id=h.edition_id
        and entry_status='qualified';

      insert into public.national_championship_duties(
        edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
        duty_start_date,duty_end_date
      )
      select
        en.edition_id,en.rider_id,'final',h.final_date,null,'confirmed',
        'National Duty — '||h.country_code||' National Championship Final',
        h.final_date,h.final_date
      from public.national_championship_entries en
      where en.edition_id=h.edition_id
        and en.entry_status='finalist'
        and en.participation_decision in ('approved','auto_approved')
      on conflict (edition_id,rider_id,duty_type) do update
        set duty_date=excluded.duty_date,
            heat_id=null,
            status='confirmed',
            label=excluded.label,
            duty_start_date=excluded.duty_start_date,
            duty_end_date=excluded.duty_end_date,
            updated_at=now();

      update public.national_championship_editions
      set status='final_ready',updated_at=now()
      where id=h.edition_id
        and status in ('qualification_pending','qualification_completed');

      perform public.national_championship_sync_race_participants_v1(
        h.edition_id,'final',null
      );

      v_completed_editions:=array_append(v_completed_editions,h.edition_id);
    end if;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'qualification_heats_processed',v_processed,
    'finals_unlocked_for_editions',to_jsonb(v_completed_editions)
  );
end;
$$;

create or replace function public.national_championship_notify_selection_v1(
  p_edition_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer:=0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then return 0; end if;

  for x in
    select
      en.rider_id,en.rider_name_snapshot,en.entry_path,en.heat_number,
      en.participation_decision,h.qualification_date,
      root.owner_user_id
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root
      on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null
          then rc.parent_club_id
        else rc.id
      end
    where en.edition_id=e.id
      and root.owner_user_id is not null
  loop
    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_name_snapshot||' selected for National Duty',
      x.rider_name_snapshot||' is selected for the '||e.country_code||
        ' National Championship. '||
        case
          when x.entry_path='qualification'
            then 'Qualification Group '||coalesce(x.heat_number,1)||
                 ' races on '||x.qualification_date||
                 '. If the rider qualifies, the final is on '||e.final_date||'. '
          else 'No qualification is required; the final is on '||e.final_date||'. '
        end||
        'Open My National Duty to approve or refuse participation before '||
        e.participation_decision_deadline||'.',
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'edition_id',e.id,
        'country_code',e.country_code,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'entry_path',x.entry_path,
        'heat_number',x.heat_number,
        'qualification_date',x.qualification_date,
        'qualification_window_start_date',e.qualification_window_start_date,
        'qualification_window_end_date',e.qualification_window_end_date,
        'final_date',e.final_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'participation_decision',x.participation_decision,
        'action_path','/dashboard/national-ranking?tab=duty'
      ),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;


CREATE OR REPLACE FUNCTION public.national_championship_ensure_event_race_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  src public.race_stages%rowtype;
  v_source_stage_id uuid;
  v_source_race_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_date date;
  v_country_name text;
  v_name text;
  v_region text;
  v_hour integer;
  v_minute integer := 0;
  v_host_city text;
  v_daytime_temp numeric;
  v_avg_temp numeric;
  v_max_temp numeric;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.climate_status<>'ready' then
    raise exception 'National championship climate window is not ready for %',e.country_code;
  end if;

  if e.route_status<>'ready' then
    raise exception 'National championship requires two suitable road stages for % (route_status=%)',e.country_code,e.route_status;
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where c.code=e.country_code;
  v_country_name:=coalesce(v_country_name,e.country_code);

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where id=p_heat_id and edition_id=e.id
    for update;

    if h.id is null then
      raise exception 'Qualification heat not found: %',p_heat_id;
    end if;

    if h.race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'qualification',h.id);
      return h.race_id;
    end if;

    v_source_stage_id:=e.qualification_source_stage_id;
    v_date:=h.qualification_date;
    v_name:=v_country_name||' National Qualification — Group '||h.heat_number;
  elsif p_event_type='final' then
    if e.final_race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
      return e.final_race_id;
    end if;

    v_source_stage_id:=e.final_source_stage_id;
    v_date:=e.final_date;
    v_name:=v_country_name||' National Road Championship';
  else
    raise exception 'Invalid national championship event type: %',p_event_type;
  end if;

  if v_source_stage_id is null then
    raise exception 'No source stage selected for % national championship %',e.country_code,p_event_type;
  end if;

  select * into src
  from public.race_stages
  where id=v_source_stage_id;

  if src.id is null then
    raise exception 'Source stage not found: %',v_source_stage_id;
  end if;

  v_source_race_id:=src.race_id;
  v_host_city:=coalesce(
    nullif(src.host_city,''),
    nullif(src.start_city_name,''),
    nullif(src.start_city,''),
    nullif(src.finish_city_name,''),
    nullif(src.finish_city,''),
    v_country_name
  );

  v_region:=public.race_start_region_code_v1(e.country_code);
  v_hour:=case v_region
    when 'apac' then 7
    when 'americas' then 17
    else 13
  end;

  if p_event_type='qualification' then
    v_hour:=v_hour+((h.heat_number-1)/2);
    v_minute:=case when mod(h.heat_number-1,2)=0 then 0 else 30 end;
  end if;

  insert into public.races(
    name,short_name,start_date,end_date,country_code,host_city,
    category,race_type,is_stage_race,stage_count,status,
    profile_image_url,logo_url,description,metadata,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at
  )
  values(
    v_name,
    case when p_event_type='final'
      then e.country_code||' NC'
      else e.country_code||' NCQ G'||h.heat_number
    end,
    v_date,v_date,e.country_code,v_host_city,
    case when p_event_type='final' then 'NC' else 'NCQ' end,
    'one_day',false,1,'scheduled',
    null::text,
    'https://flagcdn.com/w320/'||lower(e.country_code)||'.png',
    case when p_event_type='final'
      then 'National road championship on an existing host-country road route.'
      else 'National championship qualification heat on an existing host-country road route.'
    end,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'heat_id',case when p_event_type='qualification' then h.id else null end,
      'country_code',e.country_code,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'display_logo_mode','country_flag',
      'display_country_flag_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'climate_week_of_year',e.climate_week_of_year,
      'climate_expected_max_temp_c',e.climate_expected_max_temp_c,
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'individual_only',true,
      'team_commands_enabled',false,
      'staff_assets_supplies_locked',true,
      'team_cost_cash',0,
      'team_cost_coins',0
    ),
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now()
  )
  returning id into v_race_id;

  /*
   * Insert first with the climate-source country so the normal weather trigger
   * generates from a populated weekly-normal dataset. Then restore the real
   * host country and retain the climate source explicitly in the snapshot.
   */
  insert into public.race_stages(
    race_id,stage_number,stage_date,name,start_city,finish_city,host_city,
    host_country_code,distance_km,terrain_type,finish_type,is_summit_finish,
    flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
    profile_image_url,rules_snapshot,metadata,start_city_name,finish_city_name,
    profile_type,notes,intermediate_sprints_json,mountain_climbs_json,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at,stage_format
  )
  values(
    v_race_id,1,v_date,
    case when p_event_type='final'
      then 'National Championship'
      else v_country_name||' National Qualification Group '||h.heat_number
    end,
    coalesce(src.start_city,src.start_city_name),
    coalesce(src.finish_city,src.finish_city_name),
    v_host_city,
    coalesce(e.climate_source_country_code,e.country_code),
    src.distance_km,
    src.terrain_type,
    src.finish_type,
    coalesce(src.is_summit_finish,false),
    src.flat_pct,src.hilly_pct,src.mountain_pct,src.cobbled_pct,
    src.elevation_gain_m,
    null::text,
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'actual_host_country_code',e.country_code
    ),
    coalesce(src.start_city_name,src.start_city),
    coalesce(src.finish_city_name,src.finish_city),
    src.profile_type,
    'National Championship route using a host-country terrain profile.',
    '[]'::jsonb,
    '[]'::jsonb,
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now(),
    'road_race'
  )
  returning id into v_stage_id;

  select
    nullif(src2.weather_snapshot->>'avg_temp_c','')::numeric,
    nullif(src2.weather_snapshot->>'avg_max_temp_c','')::numeric
  into v_avg_temp,v_max_temp
  from public.race_stages src2
  where src2.id=v_stage_id;

  v_max_temp:=coalesce(v_max_temp,e.climate_expected_max_temp_c,20.1);
  v_avg_temp:=coalesce(v_avg_temp,greatest(20.1,v_max_temp-5));

  /*
   * These races start in the warm local daytime slot. Represent the start-time
   * temperature between the weekly mean and mean daily high, with a strict
   * >20 C floor only for championship races whose climate window passed.
   */
  v_daytime_temp:=greatest(
    20.1,
    least(
      greatest(v_max_temp,20.1),
      v_avg_temp+(greatest(v_max_temp-v_avg_temp,0)*0.72)
    )
  );

  update public.race_stages
  set
    host_country_code=e.country_code,
    weather_snapshot=coalesce(weather_snapshot,'{}'::jsonb)||jsonb_build_object(
      'country_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'national_championship',true,
      'warm_daytime_start',true,
      'race_start_temp_c',round(v_daytime_temp,1),
      'avg_temp_c',round(v_daytime_temp,1)
    ),
    updated_at=now()
  where id=v_stage_id;

  insert into public.race_stage_profile_details(
    stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
    distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
    profile_points,route_markers,intermediate_sprints,mountain_climbs,
    metadata,weather_snapshot
  )
  select
    v_stage_id,
    v_race_id,
    v_name,
    coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ||' → '||
    coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
    case
      when lower(coalesce(src.terrain_type,'flat'))='flat'
        then 'National Championship road race on a fast host-country terrain profile.'
      when lower(coalesce(src.terrain_type,'flat'))='hilly'
        then 'National Championship road race on a selective rolling host-country terrain profile.'
      else 'National Championship road race on a balanced host-country terrain profile.'
    end,
    null,
    coalesce(spd.distance_km,src.distance_km),
    coalesce(spd.elevation_gain_m,src.elevation_gain_m,0),
    coalesce(spd.terrain_type,src.terrain_type,'flat'),
    coalesce(spd.profile_type,src.profile_type,'sprinter'),
    coalesce(spd.terrain_split,jsonb_build_object(
      'flat',coalesce(src.flat_pct,0),
      'hilly',coalesce(src.hilly_pct,0),
      'mountain',coalesce(src.mountain_pct,0),
      'cobbled',coalesce(src.cobbled_pct,0)
    )),
    coalesce(spd.profile_points,'[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object(
        'km',0,
        'type','start',
        'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ),
      jsonb_build_object(
        'km',src.distance_km,
        'type','finish',
        'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'source_stage_id',v_source_stage_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'cloned_for_event_type',p_event_type
    ),
    (select weather_snapshot from public.race_stages where id=v_stage_id)
  from public.race_stage_profile_details spd
  where spd.stage_id=v_source_stage_id
  on conflict (stage_id) do nothing;

  if not exists(
    select 1 from public.race_stage_profile_details where stage_id=v_stage_id
  ) then
    insert into public.race_stage_profile_details(
      stage_id,race_id,stage_title,route_label,stage_summary,
      distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
      profile_points,route_markers,intermediate_sprints,mountain_climbs,
      metadata,weather_snapshot
    )
    values(
      v_stage_id,v_race_id,v_name,
      coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ||' → '||
      coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
      'National Championship road race using a host-country terrain profile.',
      coalesce(src.distance_km,0),
      coalesce(src.elevation_gain_m,0),
      coalesce(src.terrain_type,'flat'),
      coalesce(src.profile_type,'sprinter'),
      jsonb_build_object(
        'flat',coalesce(src.flat_pct,0),
        'hilly',coalesce(src.hilly_pct,0),
        'mountain',coalesce(src.mountain_pct,0),
        'cobbled',coalesce(src.cobbled_pct,0)
      ),
      coalesce(
        src.metadata #> '{route_profile_v1,profile_points}',
        src.metadata -> 'profile_points',
        '[]'::jsonb
      ),
      jsonb_build_array(
        jsonb_build_object(
          'km',0,
          'type','start',
          'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ),
        jsonb_build_object(
          'km',src.distance_km,
          'type','finish',
          'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_object(
        'national_championship',true,
        'source_stage_id',v_source_stage_id,
        'source_competition_identity_hidden',true,
        'only_start_and_finish_points',true,
        'cloned_for_event_type',p_event_type
      ),
      (select weather_snapshot from public.race_stages where id=v_stage_id)
    );
  end if;

  perform public.sync_race_stage_points_from_stage_json_v1(v_stage_id,true);

  delete from public.race_stage_points
  where stage_id=v_stage_id
    and upper(point_type) not in ('START','FINISH');

  update public.race_stage_points
  set name=case when upper(point_type)='START' then 'Start' else 'Finish' end,
      points_scheme='[]'::jsonb,
      time_bonus_seconds='[]'::jsonb,
      kom_category=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'national_championship',true,
        'only_start_and_finish_points',true
      )
  where stage_id=v_stage_id;

  insert into public.race_entry_rules(
    race_id,race_class_code,target_teams,min_teams,max_teams,
    min_riders_per_team,max_riders_per_team,
    applications_open_game_date,applications_close_game_date,
    applications_status,auto_close_when_full,allow_waitlist,
    prize_fund_cash,prize_fund_source,metadata,
    race_season_number,race_start_month_number,race_start_day_number,
    application_window_policy,rider_submission_deadline
  )
  values(
    v_race_id,'1.1',200,1,200,1,120,
    v_date-1,v_date-1,'closed',true,false,
    0,'manual_override',
    jsonb_build_object(
      'national_championship',true,
      'applications_disabled',true,
      'automatic_entry',true,
      'no_team_cost',true,
      'individual_riders_only',true
    ),
    e.season_number,
    extract(month from v_date)::int,
    extract(day from v_date)::int,
    'standard_90_3',
    v_date
  );

  if p_event_type='qualification' then
    update public.national_championship_heats
    set race_id=v_race_id,status='ready',updated_at=now()
    where id=h.id;
  else
    update public.national_championship_editions
    set final_race_id=v_race_id,updated_at=now()
    where id=e.id;
  end if;

  perform public.national_championship_sync_race_participants_v1(
    e.id,
    p_event_type,
    case when p_event_type='qualification' then h.id else null end
  );

  return v_race_id;
end;
$function$;
