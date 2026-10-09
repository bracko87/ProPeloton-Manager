-- race_stage_rider_states.team_id historically referenced clubs, but
-- individual-only races deliberately use the rider ID as the participant-unit ID.
-- Replace the stale single-type FK with an equally strict polymorphic guard:
-- ordinary rows must reference a club; individual-only rows may use the exact
-- rider participant unit frozen in race_participant_riders.

create or replace function public.race_stage_rider_states_validate_team_id_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_individual_only boolean := false;
begin
  if new.team_id is null then
    raise exception using
      errcode='23502',
      message='race_stage_rider_states.team_id may not be null';
  end if;

  if exists (
    select 1
    from public.clubs c
    where c.id=new.team_id
  ) then
    return new;
  end if;

  select lower(coalesce(r.metadata->>'individual_only','false')) in ('true','1','yes')
  into v_individual_only
  from public.races r
  where r.id=new.race_id;

  if coalesce(v_individual_only,false)
     and new.team_id=new.rider_id
     and exists (
       select 1
       from public.race_participant_riders participant
       where participant.race_id=new.race_id
         and participant.rider_id=new.rider_id
         and participant.team_id=new.team_id
     )
  then
    return new;
  end if;

  raise exception using
    errcode='23503',
    message=format(
      'race_stage_rider_states team_id %s is neither a club nor the exact participant unit for individual-only race %s',
      new.team_id,
      new.race_id
    ),
    constraint='race_stage_rider_states_team_id_valid_v1';
end;
$function$;

alter table public.race_stage_rider_states
  drop constraint if exists race_stage_rider_states_team_id_fkey;

drop trigger if exists race_stage_rider_states_team_id_valid_v1
  on public.race_stage_rider_states;

create trigger race_stage_rider_states_team_id_valid_v1
before insert or update of team_id, rider_id, race_id
on public.race_stage_rider_states
for each row
execute function public.race_stage_rider_states_validate_team_id_v1();

comment on function public.race_stage_rider_states_validate_team_id_v1()
is 'Allows club-backed teams normally and exact rider participant units only for races explicitly marked individual_only.';
