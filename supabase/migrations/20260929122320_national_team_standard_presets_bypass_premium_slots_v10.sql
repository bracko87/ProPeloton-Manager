-- Technical National Team equipment is system-provided and must not depend on user Premium/coin slot unlocks.

create or replace function public.equipment_enforce_setup_slot_access_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
begin
  if new.setup_slot not in (3,4) then
    return new;
  end if;

  if public.is_national_team_club_v1(new.club_id) then
    return new;
  end if;

  if new.frame_catalog_item_id is null
     and new.wheelset_catalog_item_id is null
     and new.tires_catalog_item_id is null
     and new.groupset_catalog_item_id is null
     and new.helmet_catalog_item_id is null
     and new.shoes_catalog_item_id is null then
    return new;
  end if;

  if auth.role()='service_role' then
    return new;
  end if;

  if public.equipment_current_user_has_premium_v1() then
    return new;
  end if;

  if exists(
    select 1
    from public.equipment_setup_slot_unlocks u
    where u.club_id=new.club_id
      and u.setup_slot=new.setup_slot
  ) then
    return new;
  end if;

  raise exception 'Setup slot % requires Premium or a permanent coin unlock.',new.setup_slot;
end;
$function$;
