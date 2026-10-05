
-- Consolidate National Championship rider selection notices and remove legacy per-rider notices.
update public.user_notifications un
set deleted_at=coalesce(un.deleted_at,now())
from public.notifications n
where un.notification_id=n.id
  and n.payload_json ? 'rider_id'
  and (
    n.title ilike '%selected for National Championship%'
    or upper(coalesce(n.type_code,'')) in (
      'CHAMPIONSHIP_PARTICIPATION_REQUIRED',
      'NATIONAL_CHAMPIONSHIP_SELECTED'
    )
  );

do $block$
declare x record;
begin
  for x in
    select distinct e.id
    from public.national_championship_editions e
    join public.national_championship_entries en on en.edition_id=e.id
    where en.participation_decision='pending'
      and e.season_number=public.get_current_season_number()
  loop
    perform public.national_championship_notify_selection_v1(x.id);
  end loop;
end;
$block$;

-- Keep the current Youth calendar to one visible host-city occurrence per season.
select private.deduplicate_future_youth_host_cities_v1(
  public.get_current_season_number(),
  public.get_current_game_date_date()
);

-- Re-assert the intended current-season competition sizes without changing World membership.
select public.rebalance_youth_competition_memberships_v2(
  public.get_current_season_number(),
  true
);
