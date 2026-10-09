-- Individual-only race results use rider IDs as participant-unit IDs. Ranking
-- awards, however, credit team points to real clubs and enforce a clubs FK.
-- Normalize only the explicit individual-only representation before that FK:
-- map contracted riders to their current club; keep rider points but set no team
-- recipient/points for unattached riders. Ordinary team-race awards are unchanged.

alter table public.race_ranking_point_awards
  alter column team_id drop not null;

create or replace function public.race_ranking_point_awards_normalize_individual_team_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_individual_only boolean := false;
  v_club_id uuid;
  v_club_name text;
  v_participant_unit_id uuid;
begin
  if new.team_id is null
     or exists (select 1 from public.clubs c where c.id=new.team_id)
  then
    return new;
  end if;

  select lower(coalesce(r.metadata->>'individual_only','false')) in ('true','1','yes')
  into v_individual_only
  from public.races r
  where r.id=new.race_id;

  if not coalesce(v_individual_only,false)
     or new.rider_id is null
     or new.team_id is distinct from new.rider_id
     or not exists (
       select 1
       from public.race_participant_riders participant
       where participant.race_id=new.race_id
         and participant.rider_id=new.rider_id
         and participant.team_id=new.team_id
     )
  then
    return new;
  end if;

  v_participant_unit_id := new.team_id;

  select cr.club_id,c.name
  into v_club_id,v_club_name
  from public.club_riders cr
  join public.clubs c on c.id=cr.club_id
  where cr.rider_id=new.rider_id
  limit 1;

  new.team_id := v_club_id;
  new.team_points := case when v_club_id is null then 0 else new.team_points end;
  new.team_name_snapshot := v_club_name;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'individual_participant_unit_id',v_participant_unit_id,
    'individual_team_credit_model','current_club_or_unattached_v1'
  );

  return new;
end;
$function$;

drop trigger if exists race_ranking_point_awards_normalize_individual_team_v1
  on public.race_ranking_point_awards;

create trigger race_ranking_point_awards_normalize_individual_team_v1
before insert or update of race_id, rider_id, team_id, team_points
on public.race_ranking_point_awards
for each row
execute function public.race_ranking_point_awards_normalize_individual_team_v1();

comment on function public.race_ranking_point_awards_normalize_individual_team_v1()
is 'Maps rider-based participant units to real club recipients for individual-only race ranking awards; unattached riders retain rider points with zero team points.';
