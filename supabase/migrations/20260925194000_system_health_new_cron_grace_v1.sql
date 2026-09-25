begin;

do $$
declare
  v_def text;
  v_old text := 'if latest is null or latest<now()-(p.stale_after_minutes||'' minutes'')::interval then';
  v_new text := 'if (latest is null and now()>p.created_at+(p.stale_after_minutes||'' minutes'')::interval) or (latest is not null and latest<now()-(p.stale_after_minutes||'' minutes'')::interval) then';
begin
  select pg_get_functiondef('public.run_system_health_watchdog_v1()'::regprocedure)
  into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Expected stale-check clause not found in run_system_health_watchdog_v1';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end
$$;

commit;
