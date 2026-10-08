-- Prevent the hourly game processor from failing when finalizing youth races.
-- The PL/pgSQL local variable previously had the same name as the temporary
-- result column, so unqualified references raised SQLSTATE 42702.
-- This is idempotent and changes names/qualification only; scoring is unchanged.

create or replace function private.simulate_youth_race_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  r public.youth_races%rowtype;
  x record;
  pos integer:=0; finished integer:=0; dnf integer:=0; dns integer:=0;
  general_pts integer; regional_pts integer; world_pts integer;
  v_gap integer; v_total_time integer; fatigue_delta integer; dev integer;
  sprint_pts integer; mountain_pts integer; tt_pts integer;
  dev_focus text; dev_multiplier numeric:=1.0; dev_chance numeric:=0;
begin
  select * into r from public.youth_races where id=p_race_id for update;
  if r.id is null then raise exception 'Youth race not found'; end if;
  if exists(select 1 from public.youth_race_processing_log where race_id=p_race_id) then
    return (select result from public.youth_race_processing_log where race_id=p_race_id);
  end if;

  if not exists(select 1 from public.youth_race_stages s where s.race_id=p_race_id) then
    perform private.ensure_youth_race_runtime_v1(p_race_id);
  end if;
  if exists(select 1 from public.youth_race_stages s where s.race_id=p_race_id and s.status='scheduled') then
    raise exception 'Youth race still has unfinished stages';
  end if;

  create temporary table if not exists pg_temp.youth_race_final_v2(
    entry_id uuid,academy_id uuid,youth_rider_id uuid,result_status text,
    total_time integer,sprint_points integer,mountain_points integer,time_trial_points integer
  ) on commit drop;
  truncate pg_temp.youth_race_final_v2;

  insert into pg_temp.youth_race_final_v2(
    entry_id,academy_id,youth_rider_id,result_status,total_time,
    sprint_points,mountain_points,time_trial_points
  )
  select
    sr.entry_id,sr.academy_id,sr.youth_rider_id,
    case
      when bool_or(sr.result_status='dns') then 'dns'
      when bool_or(sr.result_status='dnf') or count(*)<greatest(1,r.race_days) then 'dnf'
      else 'finished'
    end,
    case when bool_and(sr.result_status='finished') then sum(sr.time_seconds)::integer else null end,
    sum(sr.sprint_points)::integer,sum(sr.mountain_points)::integer,sum(sr.time_trial_points)::integer
  from public.youth_race_stage_results sr
  where sr.race_id=p_race_id
  group by sr.entry_id,sr.academy_id,sr.youth_rider_id;

  for x in
    select f.* from pg_temp.youth_race_final_v2 f
    order by case f.result_status when 'finished' then 0 when 'dnf' then 1 else 2 end,
             f.total_time nulls last,f.youth_rider_id
  loop
    sprint_pts:=coalesce(x.sprint_points,0);
    mountain_pts:=coalesce(x.mountain_points,0);
    tt_pts:=coalesce(x.time_trial_points,0);

    if x.result_status='finished' then
      pos:=pos+1; finished:=finished+1;
      general_pts:=private.youth_rider_general_points_v1(r.competition_class,pos);
      regional_pts:=case when r.competition_class='regional' then general_pts else 0 end;
      world_pts:=case when r.competition_class='regional' then round(general_pts*0.35)::integer else general_pts end;
      v_total_time:=x.total_time;
      select greatest(0,v_total_time-min(z.total_time))::integer into v_gap
      from pg_temp.youth_race_final_v2 z where z.result_status='finished';
      fatigue_delta:=greatest(0,round(greatest(1,r.race_days)*2.0)::integer);

      dev_focus:=case r.terrain_type
        when 'flat' then 'sprint'
        when 'hilly' then 'climbing'
        when 'mountain' then 'climbing'
        when 'time_trial' then 'time_trial'
        else 'race_iq' end;
      dev_multiplier:=private.youth_u16_infrastructure_development_multiplier_v1(
        x.academy_id,dev_focus,true
      );
      dev_chance:=least(
        0.50,
        (case when pos<=5 then 0.18 else 0.10 end)*dev_multiplier
      );
      dev:=case when private.youth_deterministic_fraction_v1(
        p_race_id::text||x.youth_rider_id::text||':development'
      )<dev_chance then 1 else 0 end;
    elsif x.result_status='dnf' then
      dnf:=dnf+1; general_pts:=0; regional_pts:=0; world_pts:=0;
      v_total_time:=null; v_gap:=null; fatigue_delta:=2; dev:=0;
    else
      dns:=dns+1; general_pts:=0; regional_pts:=0; world_pts:=0;
      v_total_time:=null; v_gap:=null; fatigue_delta:=0; dev:=0;
    end if;

    insert into public.youth_race_results(
      race_id,entry_id,academy_id,youth_rider_id,result_status,finish_position,
      time_seconds,gap_seconds,performance_score,regional_points,world_points,
      fatigue_delta,development_bonus,incident_code,
      general_points,sprint_points,mountain_points,time_trial_points,ranking_points
    )
    values(
      p_race_id,x.entry_id,x.academy_id,x.youth_rider_id,x.result_status,
      case when x.result_status='finished' then pos else null end,
      v_total_time,v_gap,
      case when v_total_time is null then 0 else 1000000.0/greatest(v_total_time,1) end,
      regional_pts,world_pts,fatigue_delta,dev,
      case when x.result_status='dnf' then 'race_incident' else null end,
      general_pts,sprint_pts,mountain_pts,tt_pts,
      general_pts+sprint_pts+mountain_pts+tt_pts
    );

    if dev>0 then
      perform private.apply_youth_attribute_delta_v1(x.youth_rider_id,dev_focus,1);
    end if;
  end loop;

  update public.youth_race_entries set status='completed',updated_at=now()
  where race_id=p_race_id and status='entered';
  update public.youth_races
  set status='completed',results_published_at=now(),updated_at=now()
  where id=p_race_id;

  perform private.pay_youth_race_team_prizes_v1(p_race_id);

  insert into public.youth_race_processing_log(
    race_id,processed_game_date,entry_count,rider_count,result
  )
  values(
    p_race_id,coalesce(r.race_end_date,r.race_date),
    (select count(*) from public.youth_race_entries where race_id=p_race_id and status='completed'),
    finished+dnf+dns,
    jsonb_build_object(
      'race_id',p_race_id,'finished',finished,'dnf',dnf,'dns',dns,
      'results_only',true,'replay_available',false,
      'classification_model','youth_v2_infrastructure_v1'
    )
  );

  return (select result from public.youth_race_processing_log where race_id=p_race_id);
end;
$function$;
