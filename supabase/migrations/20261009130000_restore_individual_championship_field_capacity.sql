-- Individual national-championship races contain rider entries grouped under
-- their owning club preparation. The rule capacity is therefore the event
-- field ceiling, not one rider per club. Generic AI filler remains blocked by
-- private.prevent_individual_race_ai_team_fill_v1().

create or replace function private.normalize_individual_race_entry_rule_v1()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $function$
begin
  if coalesce((new.metadata ->> 'individual_riders_only')::boolean, false) then
    new.min_riders_per_team := 1;
    if coalesce((new.metadata ->> 'national_championship')::boolean, false) then
      new.max_riders_per_team := 120;
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.normalize_individual_race_entry_rule_v1()
from public, anon, authenticated;

update public.race_entry_rules rule
set min_riders_per_team=1,
    max_riders_per_team=120,
    updated_at=now()
from public.races race
where race.id=rule.race_id
  and race.status='scheduled'
  and coalesce((rule.metadata->>'individual_riders_only')::boolean,false)
  and coalesce((rule.metadata->>'national_championship')::boolean,false)
  and (rule.min_riders_per_team is distinct from 1
       or rule.max_riders_per_team is distinct from 120);
