create or replace function public.race_stage_enforce_parent_start_time_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_hour integer;
  v_minute integer;
begin
  select r.planned_start_hour_number, r.planned_start_minute
    into v_hour, v_minute
  from public.races r
  where r.id = new.race_id;

  if found and v_hour is not null then
    new.planned_start_hour_number := v_hour;
    new.planned_start_minute := coalesce(v_minute, 0);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_race_stage_enforce_parent_start_time_v1
  on public.race_stages;

create trigger trg_race_stage_enforce_parent_start_time_v1
before insert or update of race_id, planned_start_hour_number, planned_start_minute
on public.race_stages
for each row
execute function public.race_stage_enforce_parent_start_time_v1();

create or replace function public.race_propagate_start_time_to_stages_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if new.planned_start_hour_number is distinct from old.planned_start_hour_number
     or coalesce(new.planned_start_minute, 0) is distinct from coalesce(old.planned_start_minute, 0)
  then
    update public.race_stages stage
       set planned_start_hour_number = new.planned_start_hour_number,
           planned_start_minute = coalesce(new.planned_start_minute, 0),
           updated_at = clock_timestamp()
     where stage.race_id = new.id
       and not exists (
         select 1
         from public.race_stage_authoritative_runs authority
         where authority.stage_id = stage.id
       );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_race_propagate_start_time_to_stages_v1
  on public.races;

create trigger trg_race_propagate_start_time_to_stages_v1
after update of planned_start_hour_number, planned_start_minute
on public.races
for each row
execute function public.race_propagate_start_time_to_stages_v1();

update public.race_stages stage
   set planned_start_hour_number = race.planned_start_hour_number,
       planned_start_minute = coalesce(race.planned_start_minute, 0),
       updated_at = clock_timestamp()
  from public.races race
 where race.id = stage.race_id
   and race.planned_start_hour_number is not null
   and not exists (
     select 1
     from public.race_stage_authoritative_runs authority
     where authority.stage_id = stage.id
   )
   and (
     stage.planned_start_hour_number is distinct from race.planned_start_hour_number
     or coalesce(stage.planned_start_minute, 0) is distinct from coalesce(race.planned_start_minute, 0)
   );

comment on function public.race_stage_enforce_parent_start_time_v1() is
'Keeps non-authoritative stage schedule rows aligned to the parent race start time, which is the canonical race schedule used by the UI and production lifecycle.';

comment on function public.race_propagate_start_time_to_stages_v1() is
'Propagates parent race start-time edits to non-authoritative stages so scheduler, replay gates and UI use one canonical time.';
