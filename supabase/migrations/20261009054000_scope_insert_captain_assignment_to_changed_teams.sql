-- Assign captains only for participant teams changed by this insert.
-- The scheduled team-list finalizer retains its full-race validation.
-- This bounds work during AI rider fill under the accelerated game clock.

CREATE OR REPLACE FUNCTION public.trg_assign_race_captains_after_participant_insert_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race record;
  v_metadata jsonb;
begin
  for v_race in
    select distinct inserted.race_id, inserted.team_id
    from new_participant_rows inserted
    where inserted.race_id is not null
      and inserted.team_id is not null
  loop
    select coalesce(race.metadata, '{}'::jsonb)
    into v_metadata
    from public.races race
    where race.id = v_race.race_id;

    if lower(
      coalesce(
        v_metadata ->> 'race_startlist_captains_finalized',
        'false'
      )
    ) in ('true', '1', 'yes') then
      continue;
    end if;

    perform public.race_assign_team_captains_v1(
      v_race.race_id,
      v_race.team_id,
      true
    );
  end loop;

  return null;
end;
$function$
