-- Prevent National Team invitations from being sent months before their event.
-- Draft planning may happen earlier, but locking/sending call-ups opens two
-- response windows before Race Day 1.

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='lock_my_national_team_selection_v1'
  limit 1;

  if v_definition is null then
    raise exception 'lock_my_national_team_selection_v1 not found';
  end if;

  v_definition := replace(
    v_definition,
    E'  if v_row.status=\'confirmed\' then\n    raise exception \'The final National Team squad is already confirmed.\';\n  end if;\n\n  v_count:=coalesce(cardinality(v_row.selected_rider_ids),0);',
    E'  if v_row.status=\'confirmed\' then\n    raise exception \'The final National Team squad is already confirmed.\';\n  end if;\n\n  if v_row.target_event_date is not null\n     and public.get_current_game_date_date() < (v_row.target_event_date - 14) then\n    raise exception \'National Team invitations open on %. You can prepare the 10-rider draft now, but invitations cannot be sent earlier.\', (v_row.target_event_date - 14);\n  end if;\n\n  v_count:=coalesce(cardinality(v_row.selected_rider_ids),0);'
  );

  execute v_definition;
end
$migration$;