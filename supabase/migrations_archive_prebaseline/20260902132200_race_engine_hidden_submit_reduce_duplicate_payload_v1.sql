do $block$
declare
  v_oid oid;
  v_def text;
  v_marker text := '''universal_result'', p_universal_result -> ''universalResult'',';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='universal_race_stage_submit_calculation_v1'
    and pg_get_function_identity_arguments(p.oid)='p_stage_id uuid, p_simulation_run_id uuid, p_input_snapshot jsonb, p_universal_result jsonb'
  limit 1;

  if v_oid is null then
    raise exception 'universal_race_stage_submit_calculation_v1 not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position(v_marker in v_def)=0 then
    raise exception 'Redundant universal_result storage marker not found';
  end if;

  v_def := replace(v_def, v_marker, '');
  execute v_def;
end;
$block$;