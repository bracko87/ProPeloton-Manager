do $$
declare
  v_oid oid;
  v_def text;
  v_patched text;
begin
  -- These helpers are invoked more than once inside the rollback-only
  -- multi-stage Nations fixture. Their ON COMMIT DROP tables otherwise survive
  -- until the outer fixture transaction ends.
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='race_engine_apply_early_active_live_energy_floor_v1'
  limit 1;

  if v_oid is not null then
    v_def:=pg_get_functiondef(v_oid);
    v_patched:=replace(
      v_def,
      'create temp table pg_temp.early_energy_floor_rows',
      'drop table if exists pg_temp.early_energy_floor_rows; create temp table pg_temp.early_energy_floor_rows'
    );
    if v_patched<>v_def then execute v_patched; end if;
  end if;

  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='race_engine_apply_low_energy_crack_v1'
  limit 1;

  if v_oid is not null then
    v_def:=pg_get_functiondef(v_oid);
    v_patched:=replace(
      v_def,
      'create temp table pg_temp.low_energy_crack_members',
      'drop table if exists pg_temp.low_energy_crack_members; create temp table pg_temp.low_energy_crack_members'
    );
    if v_patched<>v_def then execute v_patched; end if;
  end if;
end
$$;
