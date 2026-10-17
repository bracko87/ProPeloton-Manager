-- A former human-owned club must never be repurposed as an AI club.
-- Replacements come from separate existing AI-pool identities at season transition.
create or replace function private.prevent_former_player_club_ai_conversion_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if coalesce(new.is_ai,false) and not coalesce(old.is_ai,false)
     and (
       old.owner_user_id is not null
       or exists (
         select 1 from public.user_team_inactivity_events e
         where e.club_id=old.id and e.user_id is not null
       )
     )
  then
    raise exception 'Former player-created club may not be reassigned to AI. Archive it and use a separate AI pool team.';
  end if;
  return new;
end;
$function$;

drop trigger if exists clubs_prevent_former_player_ai_conversion_v1 on public.clubs;
create trigger clubs_prevent_former_player_ai_conversion_v1
before update of is_ai, owner_user_id on public.clubs
for each row execute function private.prevent_former_player_club_ai_conversion_v1();

-- Two historical exceptions (Decathlon Van Rysel and Kola) were restored as AI clubs
-- despite having a recorded human-owner closure. Put their own identities back
-- into the safe season-end removal lifecycle, without deleting riders/results
-- or repurposing the original club as another AI.
with legacy as (
  select c.id, max(e.days_inactive) as closed_inactivity_days
  from public.clubs c
  join public.user_team_inactivity_events e on e.club_id=c.id
  where c.deleted_at is null and c.is_ai=true and c.owner_user_id is null
    and c.club_type='main'
    and e.user_id is not null
    and e.new_status='closed'
  group by c.id
)
update public.clubs c
set is_ai=false,
    is_active=false,
    inactivity_status='season_end_removal_pending',
    season_end_transition_pending=true,
    inactivity_season_end_action='replace_with_ai_pool_team',
    inactivity_reason='legacy_human_club_reclassified_as_ai',
    inactivity_days_snapshot=greatest(coalesce(c.inactivity_days_snapshot,0),legacy.closed_inactivity_days),
    inactivity_effective_season=public.get_current_season_number(),
    archived_at=coalesce(c.archived_at,now()),
    updated_at=now()
from legacy where c.id=legacy.id;

-- This migration intentionally does NOT delete clubs, AI teams, race results,
-- historical U16 academy records, rider contracts or historic race starts.
-- The existing season-end transition handles these records atomically and
-- the established structural rebalance uses existing unassigned AI pool teams.
