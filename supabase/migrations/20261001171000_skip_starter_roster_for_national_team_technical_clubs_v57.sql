create or replace function public._clubs_after_insert_new_team_setup_v1()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
begin
  -- Hidden National Team clubs are technical race-engine identities only.
  -- They must never receive a generated domestic starter roster.
  if public.is_national_team_club_v1(new.id) then
    return new;
  end if;

  perform public.apply_new_club_creation_balance_v1(new.id, false);
  return new;
end;
$function$;
