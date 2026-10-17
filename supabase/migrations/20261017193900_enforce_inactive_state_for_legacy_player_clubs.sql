-- The historical-exception path must also deactivate the ownerless former
-- human team, as required by clubs_owner_state_rule_chk.
-- Genuine AI teams retain the original strong prohibition.
create or replace function public.prevent_unapproved_ai_club_retirement_v1()
returns trigger language plpgsql set search_path to 'pg_catalog','public'
as $function$
begin
  if TG_OP='DELETE' then
    if old.is_ai is true then
      raise exception 'AI club % (%) cannot be deleted without explicit owner authorization',old.name,old.id;
    end if;
    return old;
  end if;
  if old.is_ai is true and (
    new.is_ai is distinct from true
    or (old.deleted_at is null and new.deleted_at is not null)
    or (old.is_active is true and new.is_active is false)
  ) then
    if new.is_ai is false and new.is_active is false
       and new.deleted_at is not distinct from old.deleted_at
       and new.owner_user_id is null and old.owner_user_id is null
       and new.inactivity_status='season_end_removal_pending'
       and new.inactivity_season_end_action='replace_with_ai_pool_team'
       and new.name is not distinct from old.name
       and new.club_type is not distinct from old.club_type
       and exists (
         select 1 from public.user_team_inactivity_events e
         where e.club_id=old.id and e.user_id is not null
           and e.new_status='closed' and e.days_inactive>=90
       )
    then return new; end if;
    raise exception 'AI club % (%) cannot be retired, disabled, or converted without explicit owner authorization',old.name,old.id;
  end if;
  return new;
end;
$function$;
