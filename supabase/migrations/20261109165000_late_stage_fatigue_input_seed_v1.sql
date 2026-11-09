-- Derive race-day recovery for a stage whose previous official stage was
-- published AFTER the normal daily recovery tick. No rider or result writes.
create or replace function private.recover_late_stage_fatigue_payload_v1(
  p_stage_id uuid, p_payload jsonb
)
returns jsonb language plpgsql stable security definer
set search_path='pg_catalog','public','private','pg_temp'
as $body$
declare
  v_stage record;
  v_prev record;
  v_receipt_at timestamptz;
  v_rider_inputs jsonb;
  v_row jsonb;
  v_output jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_rider_id uuid;
  v_prev_end numeric;
  v_rec_stat numeric;
  v_morale numeric;
  v_club_id uuid;
  v_doctor_bonus integer;
  v_activity_bonus integer;
  v_travel_map jsonb := '{}'::jsonb;
  v_travel_delta integer;
  v_recovery_points integer;
  v_seed integer;
  v_original_fatigue numeric;
  v_original_stamina numeric;
  v_new_stamina numeric;
begin
  if p_stage_id is null then
    raise exception 'late stage recovery: stage ID required';
  end if;
  select s.race_id,s.stage_date,s.stage_number into v_stage
  from public.race_stages s where s.id=p_stage_id;
  if not found then raise exception 'late stage recovery: stage not found'; end if;
  if v_stage.stage_number<=1 then return p_payload; end if;

  select s.id as stage_id,s.stage_date,a.simulation_run_id,
         a.created_at as published_at,r.completed_at
  into v_prev
  from public.race_stages s
  join public.race_stage_authoritative_runs a on a.stage_id=s.id
  join public.race_stage_simulation_runs r on r.id=a.simulation_run_id
  where s.race_id=v_stage.race_id
    and s.stage_number<v_stage.stage_number
    and not coalesce(s.weather_cancelled,false)
    and r.status='completed'
  order by s.stage_number desc limit 1;

  if v_prev.stage_id is null then
    raise exception 'late stage recovery: preceding official stage is missing for %',p_stage_id;
  end if;
  if v_prev.stage_date>=v_stage.stage_date then
    return p_payload; -- Same calendar day: no overnight recovery.
  end if;

  select t.ran_at into v_receipt_at
  from public.game_daily_tick_log t
  where t.season_number=public.season_from_game_date(v_stage.stage_date)
    and t.month_number=extract(month from v_stage.stage_date)::smallint
    and t.day_number=extract(day from v_stage.stage_date)::smallint
  order by t.ran_at desc limit 1;
  if v_receipt_at is null then
    raise exception 'late stage recovery: nightly receipt missing for %',v_stage.stage_date;
  end if;
  if greatest(v_prev.published_at,v_prev.completed_at)<=v_receipt_at then
    return p_payload; -- The normal nightly calculation included the race.
  end if;
  if v_stage.stage_date<>v_prev.stage_date+1 then
    raise exception 'late stage recovery: multi-day gap requires special audit (%,%)',
      v_prev.stage_date,v_stage.stage_date;
  end if;

  v_rider_inputs:=p_payload->'rider_inputs';
  if jsonb_typeof(v_rider_inputs) is distinct from 'array' then
    raise exception 'late stage recovery: rider inputs missing for %',p_stage_id;
  end if;

  select coalesce(jsonb_object_agg(t.rider_id::text,t.travel_fatigue_delta),'{}'::jsonb)
  into v_travel_map
  from public.get_rider_travel_fatigue_impacts_for_date_v1(v_prev.stage_date) t;

  for v_row in select x.value from jsonb_array_elements(v_rider_inputs) x loop
    v_rider_id:=nullif(v_row->>'rider_id','')::uuid;
    v_prev_end:=null;
    if v_rider_id is not null then
      select rs.fatigue_after_stage into v_prev_end
      from public.race_stage_rider_states rs
      where rs.simulation_run_id=v_prev.simulation_run_id
        and rs.rider_id=v_rider_id
        and rs.stage_status in ('finished','dnf','otl')
      order by rs.created_at desc limit 1;
    end if;
    if v_prev_end is null then
      v_output:=v_output||jsonb_build_array(v_row);
      continue;
    end if;

    select cr.club_id into v_club_id
    from public.club_riders cr where cr.rider_id=v_rider_id limit 1;
    select d.daily_recovery_bonus into v_doctor_bonus
    from public.get_team_doctor_effects(v_club_id) d limit 1;
    select a.recovery_bonus into v_activity_bonus
    from public.rider_daily_activity a
    where a.rider_id=v_rider_id and a.activity_date=v_prev.stage_date limit 1;

    v_rec_stat:=coalesce((v_row->>'recovery')::numeric,50);
    v_morale:=coalesce((v_row->>'morale')::numeric,50);
    v_recovery_points:=greatest(3,round(
      4+least(greatest(v_rec_stat,0),100)*0.07
      +case when v_morale>=80 then 1 when v_morale<40 then -1 else 0 end
    )::integer)+coalesce(v_activity_bonus,0)+coalesce(v_doctor_bonus,0);

    if coalesce(public.team_residential_campus_active_v1(v_club_id),false)
       and exists (select 1 from public.clubs c
                   where c.id=v_club_id and c.club_type='developing') then
      v_recovery_points:=round(v_recovery_points*1.05)::integer;
    end if;

    v_travel_delta:=coalesce((v_travel_map->>v_rider_id::text)::integer,0);
    v_seed:=greatest(0,least(100,
      v_prev_end::integer-v_recovery_points+greatest(0,v_travel_delta)));
    v_original_fatigue:=coalesce((v_row->>'fatigue_before_stage')::numeric,
                                  (v_row->>'fatigue')::numeric,0);
    v_original_stamina:=coalesce((v_row->>'start_stamina')::numeric,
                                 greatest(1,least(100,100-v_original_fatigue*0.45)));
    v_new_stamina:=greatest(1,least(100,
      v_original_stamina+(v_original_fatigue-v_seed)*0.45));
    v_row:=v_row||jsonb_build_object(
      'fatigue',v_seed,'fatigue_before_stage',v_seed,
      'start_stamina',v_new_stamina);
    v_output:=v_output||jsonb_build_array(v_row);
    v_count:=v_count+1;
  end loop;

  return jsonb_set(p_payload,'{rider_inputs}',v_output,false)
    ||jsonb_build_object('late_stage_recovery_audit',jsonb_build_object(
      'rule','previous_stage_post_tick_recovery_v1',
      'previous_stage_id',v_prev.stage_id,
      'previous_stage_published_at',v_prev.published_at,
      'daily_receipt_at',v_receipt_at,
      'corrected_riders',v_count));
end;
$body$;

revoke all on function private.recover_late_stage_fatigue_payload_v1(uuid,jsonb)
from public,anon,authenticated;
