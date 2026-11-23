-- SAT-10B: stop anonymous and ordinary-authenticated users calling
-- global clock advancement, stage weather generation and race scheduler RPCs.
-- Active pg_cron jobs run as postgres, and recorded internal callers are
-- SECURITY DEFINER owned by postgres. Service-role access remains explicit.
-- No game clock tick, competition process or user data is run or modified.
do $check$
declare
  v_signature text;
  v_oid oid;
  v_is_definer boolean;
  v_invoker_callers integer;
begin
  for v_signature in
    select x.signature from (values
      ('public.advance_game_state_one_hour_manual()'),
      ('public.advance_game_state_one_hour()'),
      ('public.advance_game_state_one_minute_v1()'),
      ('public.run_game_tick_if_unpaused()'),
      ('public.run_game_minute_tick_if_unpaused_v1()'),
      ('public.run_daily_game_processors_v1(boolean)'),
      ('public.run_hourly_game_processors_v1(boolean)'),
      ('public.process_due_race_days_v1()'),
      ('public.process_one_backlog_game_processor_child_step_v1(date,text,integer)'),
      ('public.auto_fill_race_ai_team_applications_season_v1(uuid,text,integer,integer,integer)'),
      ('public.generate_race_weather_for_race_v1(uuid)')
    ) as x(signature)
  loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Required scheduler RPC missing: %',v_signature;
    end if;
    select p.prosecdef into v_is_definer from pg_proc p where p.oid=v_oid;
    if v_is_definer is distinct from true then
      raise exception 'Scheduler RPC is no longer SECURITY DEFINER: %',v_signature;
    end if;
    select count(*)::int into v_invoker_callers
    from pg_proc c
    where c.oid<>v_oid
      and not c.prosecdef
      and c.prosrc ilike '%'||(select p.proname from pg_proc p where p.oid=v_oid)||'%';
    if v_invoker_callers<>0 then
      raise exception 'Unreviewed invoker RPC caller: %, count %',v_signature,v_invoker_callers;
    end if;
  end loop;
end;
$check$;

revoke execute on function public.advance_game_state_one_hour_manual() from public, anon, authenticated;
revoke execute on function public.advance_game_state_one_hour() from public, anon, authenticated;
revoke execute on function public.advance_game_state_one_minute_v1() from public, anon, authenticated;
revoke execute on function public.run_game_tick_if_unpaused() from public, anon, authenticated;
revoke execute on function public.run_game_minute_tick_if_unpaused_v1() from public, anon, authenticated;
revoke execute on function public.run_daily_game_processors_v1(boolean) from public, anon, authenticated;
revoke execute on function public.run_hourly_game_processors_v1(boolean) from public, anon, authenticated;
revoke execute on function public.process_due_race_days_v1() from public, anon, authenticated;
revoke execute on function public.process_one_backlog_game_processor_child_step_v1(date,text,integer) from public, anon, authenticated;
revoke execute on function public.auto_fill_race_ai_team_applications_season_v1(uuid,text,integer,integer,integer) from public, anon, authenticated;
revoke execute on function public.generate_race_weather_for_race_v1(uuid) from public, anon, authenticated;

grant execute on function public.advance_game_state_one_hour_manual() to service_role;
grant execute on function public.advance_game_state_one_hour() to service_role;
grant execute on function public.advance_game_state_one_minute_v1() to service_role;
grant execute on function public.run_game_tick_if_unpaused() to service_role;
grant execute on function public.run_game_minute_tick_if_unpaused_v1() to service_role;
grant execute on function public.run_daily_game_processors_v1(boolean) to service_role;
grant execute on function public.run_hourly_game_processors_v1(boolean) to service_role;
grant execute on function public.process_due_race_days_v1() to service_role;
grant execute on function public.process_one_backlog_game_processor_child_step_v1(date,text,integer) to service_role;
grant execute on function public.auto_fill_race_ai_team_applications_season_v1(uuid,text,integer,integer,integer) to service_role;
grant execute on function public.generate_race_weather_for_race_v1(uuid) to service_role;
