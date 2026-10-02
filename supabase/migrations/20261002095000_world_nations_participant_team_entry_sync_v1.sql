-- Keep World Nations/National Association participant rows aligned with the
-- canonical race_team_entries source used by race_participant_teams_v1.
--
-- National Team lineups are synchronized into race_participant_teams and
-- race_participant_riders by sync_nations_group_event_participants_v1().
-- The race-detail page, however, reads team wrappers from race_team_entries.
-- Without this compatibility sync, submitted riders can power favorites while
-- the team card still reports "No riders submitted yet".

create or replace function private.sync_nations_race_team_entry_from_participant_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_nations_race boolean := false;
begin
  select coalesce((r.metadata->>'nations_competition')::boolean,false)
    into v_is_nations_race
  from public.races r
  where r.id = new.race_id;

  if not coalesce(v_is_nations_race,false) then
    return new;
  end if;

  insert into public.race_team_entries(
    race_id,
    club_id,
    participating_club_id,
    status,
    entry_source,
    is_ai_filler,
    reviewed_at,
    final_decision_at,
    decision_reason,
    updated_at
  )
  values(
    new.race_id,
    new.team_id,
    new.team_id,
    new.status,
    'national_team',
    false,
    coalesce(new.accepted_at,new.submitted_at,now()),
    case when new.status='accepted'
      then coalesce(new.accepted_at,new.submitted_at,now())
      else null
    end,
    'World Nations National Team lineup sync.',
    now()
  )
  on conflict(race_id,club_id) do update
  set participating_club_id = excluded.participating_club_id,
      status = excluded.status,
      entry_source = 'national_team',
      is_ai_filler = false,
      reviewed_at = coalesce(public.race_team_entries.reviewed_at,excluded.reviewed_at),
      final_decision_at = case
        when excluded.status='accepted'
          then coalesce(public.race_team_entries.final_decision_at,excluded.final_decision_at)
        else public.race_team_entries.final_decision_at
      end,
      decision_reason = 'World Nations National Team lineup sync.',
      updated_at = now();

  return new;
end;
$function$;

drop trigger if exists sync_nations_race_team_entry_from_participant_v1
  on public.race_participant_teams;

create trigger sync_nations_race_team_entry_from_participant_v1
after insert or update of status,team_id on public.race_participant_teams
for each row
execute function private.sync_nations_race_team_entry_from_participant_v1();

-- Repair already-created World Nations participant teams.
insert into public.race_team_entries(
  race_id,
  club_id,
  participating_club_id,
  status,
  entry_source,
  is_ai_filler,
  reviewed_at,
  final_decision_at,
  decision_reason,
  updated_at
)
select
  rpt.race_id,
  rpt.team_id,
  rpt.team_id,
  rpt.status,
  'national_team',
  false,
  coalesce(rpt.accepted_at,rpt.submitted_at,rpt.created_at,now()),
  case when rpt.status='accepted'
    then coalesce(rpt.accepted_at,rpt.submitted_at,rpt.created_at,now())
    else null
  end,
  'World Nations National Team lineup sync.',
  now()
from public.race_participant_teams rpt
join public.races r on r.id=rpt.race_id
where coalesce((r.metadata->>'nations_competition')::boolean,false)
on conflict(race_id,club_id) do update
set participating_club_id = excluded.participating_club_id,
    status = excluded.status,
    entry_source = 'national_team',
    is_ai_filler = false,
    reviewed_at = coalesce(public.race_team_entries.reviewed_at,excluded.reviewed_at),
    final_decision_at = case
      when excluded.status='accepted'
        then coalesce(public.race_team_entries.final_decision_at,excluded.final_decision_at)
      else public.race_team_entries.final_decision_at
    end,
    decision_reason = 'World Nations National Team lineup sync.',
    updated_at = now();

comment on function private.sync_nations_race_team_entry_from_participant_v1()
is 'Keeps World Nations race_participant_teams aligned with canonical race_team_entries so submitted national riders render in race-detail participant cards.';
