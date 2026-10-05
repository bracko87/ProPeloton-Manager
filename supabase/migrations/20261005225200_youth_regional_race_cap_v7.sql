-- Keep Regional Youth race capacity aligned with the reduced 10-team field target.

create or replace function private.enforce_youth_regional_race_cap_v1()
returns trigger
language plpgsql
set search_path=public,private,pg_temp
as $function$
begin
  if new.status='scheduled' and new.competition_class='regional' then
    new.team_limit:=least(coalesce(new.team_limit,10),10);
    new.target_teams:=least(coalesce(new.target_teams,10),10);
  end if;
  return new;
end;
$function$;

drop trigger if exists youth_regional_race_cap_v1 on public.youth_races;
create trigger youth_regional_race_cap_v1
before insert or update of competition_class,status,team_limit,target_teams
on public.youth_races
for each row
execute function private.enforce_youth_regional_race_cap_v1();

update public.youth_races
set team_limit=least(team_limit,10),
    target_teams=least(coalesce(target_teams,10),10),
    updated_at=now()
where season_number=public.get_current_season_number()
  and status='scheduled'
  and race_date>public.get_current_game_date_date()
  and competition_class='regional';
