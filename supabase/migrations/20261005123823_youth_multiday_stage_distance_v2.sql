CREATE OR REPLACE FUNCTION private.process_youth_race_stages_v1(p_game_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare race public.youth_races%rowtype; stage integer; v_date date;
begin
 for race in select * from public.youth_races where status='scheduled' and race_days>1 and race_date<=p_game_date for update loop
 for stage in 1..least(race.race_days,p_game_date-race.race_date+1) loop
 v_date:=race.race_date+stage-1;
 if exists(select 1 from public.youth_race_stage_results where race_id=race.id and stage_number=stage) then continue; end if;
 insert into public.youth_race_stage_results(race_id,stage_number,stage_date,entry_id,academy_id,youth_rider_id,result_status,finish_position,time_seconds,gap_seconds,performance_score)
 with scores as (
 select e.id entry_id,e.academy_id,r.id rider_id,
 case when r.status<>'academy' or r.academy_id<>e.academy_id or not private.youth_race_rider_eligible_v1(r.id,race.race_date) then 'dns'
 when exists(select 1 from public.youth_race_stage_results prev where prev.race_id=race.id and prev.youth_rider_id=r.id and prev.result_status<>'finished') then 'dnf'
 when private.youth_deterministic_fraction_v1(race.id::text||r.id::text||stage::text||':incident')<0.01 then 'dnf' else 'finished' end status,
 private.youth_race_capability_v1(r,race.terrain_type)+r.readiness*0.10-r.fatigue*0.14
 +case e.strategy when 'aggressive' then 1.4 when 'conservative' then -0.4 else 0 end
 +(private.youth_deterministic_fraction_v1(race.id::text||r.id::text||stage::text||':form')-0.5)*8.0 score
 from public.youth_race_entries e join public.youth_race_lineups l on l.entry_id=e.id join public.youth_riders r on r.id=l.youth_rider_id
 where e.race_id=race.id and e.status='entered'
 ), timed as (select *,case when status='finished' then greatest(1,round(race.distance_km::numeric*85+(100-score)*3)::integer) end elapsed from scores),
 ranked as (select *,row_number() over(order by case status when 'finished' then 0 when 'dnf' then 1 else 2 end,elapsed nulls last,rider_id) pos,min(elapsed) over() winning_time from timed)
 select race.id,stage,v_date,entry_id,academy_id,rider_id,status,case when status='finished' then pos end,elapsed,case when status='finished' then elapsed-winning_time end,score from ranked;
 end loop;
 end loop;
end; $function$;

revoke all on function private.process_youth_race_stages_v1(date)
from public,anon,authenticated;
