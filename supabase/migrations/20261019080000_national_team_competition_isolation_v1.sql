-- Separate National Association selections from AI-managed national pool clubs
-- by competition and entry source. Reused pool club IDs remain valid for ordinary
-- races; no completed results, team IDs, squads, or existing entries are rewritten.
create or replace function public.guard_national_race_entry_scope_v1()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_is_association_event boolean;
  v_is_hidden_technical boolean;
  v_club record;
  v_source text := lower(coalesce(new.entry_source,''));
  v_club_id uuid := coalesce(new.participating_club_id,new.club_id);
begin
  select exists (
    select 1 from public.nations_group_events nge where nge.race_id = new.race_id
  ) into v_is_association_event;

  if v_is_association_event then
    -- Association rounds select riders from other teams; their entries must not
    -- be created through ordinary club / AI-fill entry routes.
    if v_source in ('ai_fill','club','manager_application') then
      raise exception 'National Association events require association-selected lineups';
    end if;
    return new;
  end if;

  if v_source in ('national_team','national_association','association_team') then
    raise exception 'National Association selection cannot enter an ordinary race';
  end if;

  select exists(
    select 1 from public.national_association_race_team_identities i
    where i.technical_club_id = v_club_id
      and i.identity_source = 'generated_hidden_national_team'
  ) into v_is_hidden_technical;

  if v_is_hidden_technical then
    raise exception 'Hidden National Association technical identity cannot enter ordinary races';
  end if;

  select c.name,c.is_ai,c.is_active into v_club
  from public.clubs c where c.id=v_club_id;
  if found
     and v_club.name ~* 'national[[:space:]]+team'
     and (v_club.is_ai is not true or v_club.is_active is not true) then
    raise exception 'Ordinary national-team entry requires an active AI-managed club';
  end if;

  return new;
end $$;

drop trigger if exists guard_national_race_entry_scope_v1 on public.race_team_entries;
create trigger guard_national_race_entry_scope_v1
before insert or update of race_id,club_id,participating_club_id,entry_source
on public.race_team_entries
for each row execute function public.guard_national_race_entry_scope_v1();

comment on function public.guard_national_race_entry_scope_v1() is
  'Forward-only isolation: national association entry source is association-only; AI national pool clubs remain eligible for regular races.';
