do $$
declare
  v_edition_id uuid;
begin
  select e.id
  into v_edition_id
  from public.nations_competition_editions e
  join public.game_state gs on gs.id=true
  where e.season_number=gs.season_number
  limit 1;

  if v_edition_id is not null then
    perform private.rebuild_planned_nations_structure_v1(v_edition_id);
    perform private.sync_nations_open_field_draw_v1(v_edition_id);
    perform public.schedule_nations_edition_v1(v_edition_id);
    perform public.assign_nations_event_hosts_v1(v_edition_id);
  end if;
end;
$$;
