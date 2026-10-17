-- Narrow, verified exception to the no-AI-retirement guard.
-- Only historical user-owned clubs that were incorrectly revived as AI may
-- be returned to the proper season-end replacement lifecycle.
create or replace function public.prevent_unapproved_ai_club_retirement_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
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
    if new.is_ai is false
       and new.is_active is not distinct from old.is_active
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
    then
      return new;
    end if;
    raise exception 'AI club % (%) cannot be retired, disabled, or converted without explicit owner authorization',old.name,old.id;
  end if;
  return new;
end;
$function$;

-- Pending archival of an ownerless *former human team* must not consume
-- a new human club place or force a tier rebalance.
create or replace function public.trg_rebalance_top3_overflow_ai_to_pool_v1()
returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.club_type = 'main'
     and coalesce(new.is_ai,false)=false
     and new.owner_user_id is not null
     and new.deleted_at is null
     and coalesce(new.inactivity_status,'active') <> 'season_end_removal_pending'
     and new.club_tier in ('worldteam','proteam','continental')
  then
    perform public.rebalance_top3_overflow_ai_to_pool_v1('real_club_top3_trigger_guard');
  end if;
  return new;
end;
$function$;
