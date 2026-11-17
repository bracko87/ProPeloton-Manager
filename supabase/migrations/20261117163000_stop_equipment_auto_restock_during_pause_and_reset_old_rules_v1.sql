-- Stop automatic supply purchases while game is paused or maintenance locked.
-- Historical test-season auto-restock rules are disposable world state and must
-- be cleared by the reset core (the old cleanup used a non-existent table name).
do $patch$
declare
  v text; c text;
  v_find text := E'begin\n  for r in';
  v_guard text := E'begin\n  -- Automatic purchases must never run during paused Season 1 setup or maintenance.\n  if not exists (\n    select 1 from public.game_state g\n    join public.game_clock_config clock on clock.id=true\n    join private.game_world_reset_maintenance_gate_v1 m on m.id=true\n    where g.id=true and g.is_paused=false and clock.is_paused=false and m.locked=false\n  ) then\n    return jsonb_build_object(''ok'',true,''skipped'',true,''reason'',''game_paused_or_maintenance'',\n      ''attempted'',0,''purchased'',0,''failed'',0,''game_date'',v_game_date);\n  end if;\n  for r in';
  c_find text := 'perform public.game_world_reset_truncate_if_exists_v1(''public'',''club_equipment_auto_restock_rules'');';
begin
 select pg_get_functiondef('public.equipment_process_auto_restock_rules_v1()'::regprocedure) into v;
 if strpos(v,'game_paused_or_maintenance')=0 then
   if strpos(v,v_find)=0 then raise exception 'Restock loop entry missing';end if;
   execute replace(v,v_find,v_guard);
 end if;
 select pg_get_functiondef('public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure) into c;
 if strpos(c,'delete from public.equipment_auto_restock_rules;')=0 then
   if strpos(c,c_find)=0 then raise exception 'Reset restock cleanup insert point missing';end if;
   c:=replace(c,c_find,c_find||E'\n    -- These real auto-restock settings are disposable test-world configuration.\n    delete from public.equipment_auto_restock_rules;');
   execute c;
 end if;
end $patch$;
