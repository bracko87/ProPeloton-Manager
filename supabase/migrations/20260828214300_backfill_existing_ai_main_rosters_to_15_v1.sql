do $do$
declare
  r record;
begin
  for r in
    select c.id
    from public.clubs c
    where c.deleted_at is null
      and c.is_active=true
      and c.is_ai=true
      and c.owner_user_id is null
      and c.club_type='main'
    order by c.id
  loop
    perform public._generate_domestic_roster_for_club(r.id);
    perform public.initialize_club_rider_contracts(r.id);
  end loop;
end;
$do$;
