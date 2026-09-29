do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='race_engine_apply_power_gel_energy_boost_v1'
  limit 1;

  if v_oid is null then
    raise exception 'race_engine_apply_power_gel_energy_boost_v1 not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);

  v_def:=replace(
    v_def,
    'create temp table pg_temp.rider_gel_allowance',
    'drop table if exists pg_temp.rider_gel_allowance; create temp table pg_temp.rider_gel_allowance'
  );

  v_def:=replace(
    v_def,
    'create temp table pg_temp.power_gel_frame_boosts',
    'drop table if exists pg_temp.power_gel_frame_boosts; create temp table pg_temp.power_gel_frame_boosts'
  );

  execute v_def;
end
$$;
