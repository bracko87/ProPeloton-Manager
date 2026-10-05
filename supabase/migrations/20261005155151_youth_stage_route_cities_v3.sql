CREATE OR REPLACE FUNCTION private.ensure_youth_race_runtime_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
  v_assignment jsonb;
  v_stage_assignment jsonb;
  v_stage integer;
  v_stage_type text;
  v_distance integer;
  v_created integer:=0;
begin
  select * into v_race
  from public.youth_races
  where id=p_race_id
  for update;

  if v_race.id is null then
    raise exception 'Youth race not found';
  end if;

  if v_race.start_time_region_code is null
     or v_race.planned_start_hour_number is null
     or v_race.planned_start_time_label is null then
    v_assignment:=public.race_start_time_assignment_v1(
      v_race.host_country_code,
      'youth-race:'||v_race.id::text
    );

    update public.youth_races
    set start_time_region_code=v_assignment->>'region_code',
        planned_start_hour_number=(v_assignment->>'start_hour')::smallint,
        planned_start_minute=(v_assignment->>'start_minute')::smallint,
        planned_start_time_label=v_assignment->>'time_label',
        planned_start_assigned_at=now(),
        updated_at=now()
    where id=v_race.id;
  end if;

  if v_race.status='scheduled' then
    for v_stage in 1..greatest(1,coalesce(v_race.race_days,1)) loop
      v_stage_type:=private.youth_stage_type_v1(
        v_race.id,
        v_race.terrain_type,
        greatest(1,coalesce(v_race.race_days,1)),
        v_stage
      );
      v_distance:=private.youth_stage_distance_km_v1(
        v_race.id,
        v_race.distance_km,
        v_stage_type,
        v_stage,
        greatest(1,coalesce(v_race.race_days,1))
      );
      v_stage_assignment:=public.race_start_time_assignment_v1(
        v_race.host_country_code,
        'youth-stage:'||v_race.id::text||':'||v_stage::text
      );

      insert into public.youth_race_stages(
        race_id,stage_number,stage_date,stage_type,distance_km,
        start_city,finish_city,
        start_time_region_code,planned_start_hour_number,planned_start_minute,
        planned_start_time_label,sprint_points_total,mountain_points_total,
        time_trial_points_total,status
      )
      values(
        v_race.id,
        v_stage,
        v_race.race_date+(v_stage-1),
        v_stage_type,
        v_distance,
        private.youth_stage_route_city_v1(v_race.id,v_stage,'start'),
        private.youth_stage_route_city_v1(v_race.id,v_stage,'finish'),
        v_stage_assignment->>'region_code',
        (v_stage_assignment->>'start_hour')::smallint,
        (v_stage_assignment->>'start_minute')::smallint,
        v_stage_assignment->>'time_label',
        case when v_stage_type in ('flat','hilly','mixed') then 65 else 0 end,
        case when v_stage_type in ('hilly','mountain','mixed') then 65 else 0 end,
        case when v_stage_type='time_trial' then 65 else 0 end,
        'scheduled'
      )
      on conflict(race_id,stage_number) do update
      set stage_date=excluded.stage_date,
          stage_type=excluded.stage_type,
          distance_km=excluded.distance_km,
          start_city=excluded.start_city,
          finish_city=excluded.finish_city,
          start_time_region_code=excluded.start_time_region_code,
          planned_start_hour_number=excluded.planned_start_hour_number,
          planned_start_minute=excluded.planned_start_minute,
          planned_start_time_label=excluded.planned_start_time_label,
          sprint_points_total=excluded.sprint_points_total,
          mountain_points_total=excluded.mountain_points_total,
          time_trial_points_total=excluded.time_trial_points_total,
          updated_at=now()
      where public.youth_race_stages.status='scheduled';

      v_created:=v_created+1;
    end loop;
  end if;

  return jsonb_build_object(
    'race_id',v_race.id,
    'stages',v_created
  );
end;
$function$;

select public.ensure_youth_race_runtime_for_season_v1(public.get_current_season_number());
