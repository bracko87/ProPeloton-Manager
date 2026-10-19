-- Ordinary AI national clubs use contracted club_riders, not the national
-- association call-up pool. Historic completed race results remain frozen.
do $migration$
declare
  v_body text;
  v_before text;
begin
  select pg_get_functiondef('public.assign_ai_riders_to_race_v1(uuid)'::regprocedure)
    into v_body;
  if v_body is null then raise exception 'AI rider assignment function missing'; end if;

  v_before := v_body;
  v_body := replace(v_body,
    'where roster.rider_id = participant.rider_id',
    'where roster.club_id = v_team.team_id and roster.rider_id = participant.rider_id');
  if v_before = v_body then raise exception 'Existing national rider cleanup pattern changed'; end if;

  v_before := v_body;
  v_body := replace(v_body,
    'and upper(coalesce(roster.country_code, ''''))',
    'and roster.club_id = v_team.team_id and upper(coalesce(roster.country_code, ''''))');
  if (length(v_before)-length(replace(v_before,
    'and upper(coalesce(roster.country_code, ''''))', '')))
     /length('and upper(coalesce(roster.country_code, ''''))') <> 2 then
    raise exception 'Expected exactly two nationality checks';
  end if;

  v_body := replace(v_body, 'global_same_country_pool_v2',
                         'own_national_ai_roster_v3');
  execute v_body;
end $migration$;

-- Assert eligibility at the storage boundary, independent of which AI filler
-- (standard, hierarchy, replacement or delayed processing) writes the list.
create or replace function public.guard_ai_ordinary_race_rider_roster_v1()
returns trigger language plpgsql security definer set search_path='public','pg_temp'
as $fn$
declare
  v_is_ai_entry boolean;
  v_is_association_event boolean;
begin
  select exists(
    select 1 from public.race_team_entries e
    where e.race_id=new.race_id
      and coalesce(e.participating_club_id,e.club_id)=new.team_id
      and e.status in ('accepted','confirmed')
      and e.is_ai_filler is true
      and e.entry_source='ai_fill'
  ) into v_is_ai_entry;
  if not v_is_ai_entry then return new; end if;

  select exists(select 1 from public.nations_group_events n
                where n.race_id=new.race_id)
    into v_is_association_event;
  if v_is_association_event then return new; end if;

  if not exists(select 1 from public.club_riders cr
                where cr.club_id=new.team_id and cr.rider_id=new.rider_id) then
    raise exception 'AI team rider % does not belong to club % in ordinary race %',
                    new.rider_id,new.team_id,new.race_id;
  end if;
  return new;
end $fn$;
drop trigger if exists guard_ai_ordinary_race_rider_roster_v1
  on public.race_participant_riders;
create trigger guard_ai_ordinary_race_rider_roster_v1
before insert or update of race_id,team_id,rider_id
on public.race_participant_riders
for each row execute function public.guard_ai_ordinary_race_rider_roster_v1();
comment on function public.guard_ai_ordinary_race_rider_roster_v1() is
  'Prevent national-association callups and other out-of-club riders being selected under ordinary AI club race entries.';
