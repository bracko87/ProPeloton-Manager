do $$
declare
  v_oid oid;
  v_def text;
  v_patched text;
begin
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'run_race_stage_road_race_v1',
        'run_race_stage_individual_time_trial_v1',
        'run_race_stage_team_time_trial_v1'
      )
  loop
    v_def:=pg_get_functiondef(v_oid);

    v_patched:=regexp_replace(
      v_def,
      'on conflict[[:space:]]*\\([[:space:]]*stage_id[[:space:]]*\\)[[:space:]]*do update set(.|\\n|\\r)*?returning id[[:space:]]+into v_run_id;',
      'returning id into v_run_id;',
      'i'
    );

    if v_patched=v_def then
      raise exception 'Legacy race runner patch did not match function OID %.',v_oid;
    end if;

    execute v_patched;
  end loop;
end
$$;
