-- National squads cannot own active U16 academies or start U16 races.
-- Preserve all historical race results, all senior club records, and all AI clubs.
create or replace function private.is_national_squad_club_v1(p_club_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select coalesce((
    select
      c.club_type in ('national', 'national_team', 'national_squad')
      or c.name ~* '(^|[[:space:]])national[[:space:]]+team([[:space:]]|$)'
      or c.name ~* '(^|[[:space:]])nacional[[:space:]]+team([[:space:]]|$)'
      or c.name ~* '(^|[[:space:]])team[[:space:]]+.+[[:space:]]national([[:space:]]|$)'
    from public.clubs c where c.id=p_club_id
  ),false);
$function$;

create or replace function private.keep_national_squads_out_of_youth_academies_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if private.is_national_squad_club_v1(new.club_id) then
    new.is_active:=false;
  end if;
  return new;
end;
$function$;

drop trigger if exists youth_exclude_national_squads_v1 on public.youth_academies;
create trigger youth_exclude_national_squads_v1
before insert or update of club_id,is_active on public.youth_academies
for each row execute function private.keep_national_squads_out_of_youth_academies_v1();

-- Deactivate the U16 *academy* only. Never deactivate, delete, or reassign its senior parent club.
update public.youth_academies a set is_active=false,updated_at=now()
where a.is_active and private.is_national_squad_club_v1(a.club_id);

-- Existing future U16 entries must not become starting teams. Keep historical entries/results untouched.
update public.youth_race_entries e set status='withdrawn',updated_at=now()
from public.youth_races r,public.youth_academies a
where e.race_id=r.id and e.academy_id=a.id
  and private.is_national_squad_club_v1(a.club_id)
  and r.status='scheduled' and r.race_date>public.get_current_game_date_date()
  and e.status='entered';

update public.youth_race_invitations i set status='declined',updated_at=now()
from public.youth_races r,public.youth_academies a
where i.race_id=r.id and i.academy_id=a.id
  and private.is_national_squad_club_v1(a.club_id)
  and r.status='scheduled' and r.race_date>public.get_current_game_date_date()
  and i.status in ('pending','accepted');

-- Historical membership/results remain, but active-season U16 tables exclude national squads.
delete from public.youth_academy_competition_memberships m
using public.youth_academies a
where m.academy_id=a.id and m.season_number>=public.get_current_season_number()
  and private.is_national_squad_club_v1(a.club_id);

-- Defense in depth against future invitations/automation paths that bypass eligibility checks.
create or replace function private.reject_national_team_youth_race_entry_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_club_id uuid;v_race_date date;
begin
  if new.status not in ('entered','completed') then return new; end if;
  select a.club_id into v_club_id from public.youth_academies a where a.id=new.academy_id;
  if not private.is_national_squad_club_v1(v_club_id) then return new; end if;
  select r.race_date into v_race_date from public.youth_races r where r.id=new.race_id;
  if v_race_date>=public.get_current_game_date_date() then
    raise exception 'National teams are not eligible for U16 youth races';
  end if;
  return new;
end;
$function$;

drop trigger if exists youth_block_national_race_entry_v1 on public.youth_race_entries;
create trigger youth_block_national_race_entry_v1
before insert or update of academy_id,status on public.youth_race_entries
for each row execute function private.reject_national_team_youth_race_entry_v1();
