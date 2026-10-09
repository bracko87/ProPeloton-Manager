-- Prevent generic AI team filling from touching rider-only events such as
-- National Championship qualification heats.
--
-- The NC lifecycle owns these start lists. The generic race filler interpreted
-- max_riders_per_team = 120 as 120 riders for every AI team, even though 120
-- is the event field size and each entry represents one rider.

create or replace function private.normalize_individual_race_entry_rule_v1()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $function$
begin
  if coalesce((new.metadata ->> 'individual_riders_only')::boolean, false) then
    new.min_riders_per_team := 1;
    new.max_riders_per_team := 1;
  end if;

  return new;
end;
$function$;

revoke all on function private.normalize_individual_race_entry_rule_v1()
  from public, anon, authenticated;

drop trigger if exists trg_normalize_individual_race_entry_rule_v1
  on public.race_entry_rules;

create trigger trg_normalize_individual_race_entry_rule_v1
before insert or update of
  race_id,
  metadata,
  min_riders_per_team,
  max_riders_per_team
on public.race_entry_rules
for each row
execute function private.normalize_individual_race_entry_rule_v1();

create or replace function private.prevent_individual_race_ai_team_fill_v1()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $function$
begin
  if (
    coalesce(new.is_ai_filler, false)
    or lower(coalesce(new.entry_source::text, '')) in (
      'ai',
      'ai_fill',
      'ai_filler'
    )
  )
  and exists (
    select 1
    from public.race_entry_rules rule
    where rule.race_id = new.race_id
      and coalesce(
        (rule.metadata ->> 'individual_riders_only')::boolean,
        false
      )
  ) then
    -- Individual-event participants are synchronized by their dedicated
    -- lifecycle. Silently ignore generic AI filler inserts/updates.
    return null;
  end if;

  return new;
end;
$function$;

revoke all on function private.prevent_individual_race_ai_team_fill_v1()
  from public, anon, authenticated;

drop trigger if exists trg_prevent_individual_race_ai_team_fill_v1
  on public.race_team_entries;

create trigger trg_prevent_individual_race_ai_team_fill_v1
before insert or update of
  race_id,
  entry_source,
  is_ai_filler
on public.race_team_entries
for each row
execute function private.prevent_individual_race_ai_team_fill_v1();

-- Correct existing future individual-event rules. Completed/published races
-- and historical rows are intentionally excluded.
update public.race_entry_rules rule
set
  min_riders_per_team = 1,
  max_riders_per_team = 1,
  updated_at = now()
from public.races race
where race.id = rule.race_id
  and race.status = 'scheduled'
  and race.start_date > public.get_current_game_timestamp()::date
  and coalesce(
    (rule.metadata ->> 'individual_riders_only')::boolean,
    false
  )
  and (
    rule.min_riders_per_team is distinct from 1
    or rule.max_riders_per_team is distinct from 1
  );

-- Remove only generic AI-filler riders from future individual-event start
-- lists. Dedicated NC lifecycle riders do not use these AI team entries and
-- remain untouched.
with invalid_ai_entries as materialized (
  select
    entry.race_id,
    coalesce(entry.participating_club_id, entry.club_id) as team_id
  from public.race_team_entries entry
  join public.races race
    on race.id = entry.race_id
  join public.race_entry_rules rule
    on rule.race_id = race.id
  where race.status = 'scheduled'
    and race.start_date > public.get_current_game_timestamp()::date
    and coalesce(
      (rule.metadata ->> 'individual_riders_only')::boolean,
      false
    )
    and (
      coalesce(entry.is_ai_filler, false)
      or lower(coalesce(entry.entry_source::text, '')) in (
        'ai',
        'ai_fill',
        'ai_filler'
      )
    )
)
delete from public.race_participant_riders participant
using invalid_ai_entries invalid
where participant.race_id = invalid.race_id
  and participant.team_id = invalid.team_id;

with invalid_ai_entries as materialized (
  select
    entry.race_id,
    coalesce(entry.participating_club_id, entry.club_id) as team_id
  from public.race_team_entries entry
  join public.races race
    on race.id = entry.race_id
  join public.race_entry_rules rule
    on rule.race_id = race.id
  where race.status = 'scheduled'
    and race.start_date > public.get_current_game_timestamp()::date
    and coalesce(
      (rule.metadata ->> 'individual_riders_only')::boolean,
      false
    )
    and (
      coalesce(entry.is_ai_filler, false)
      or lower(coalesce(entry.entry_source::text, '')) in (
        'ai',
        'ai_fill',
        'ai_filler'
      )
    )
)
delete from public.race_participant_teams participant
using invalid_ai_entries invalid
where participant.race_id = invalid.race_id
  and participant.team_id = invalid.team_id;

delete from public.race_team_entries entry
using public.races race, public.race_entry_rules rule
where race.id = entry.race_id
  and rule.race_id = race.id
  and race.status = 'scheduled'
  and race.start_date > public.get_current_game_timestamp()::date
  and coalesce(
    (rule.metadata ->> 'individual_riders_only')::boolean,
    false
  )
  and (
    coalesce(entry.is_ai_filler, false)
    or lower(coalesce(entry.entry_source::text, '')) in (
      'ai',
      'ai_fill',
      'ai_filler'
    )
  );
