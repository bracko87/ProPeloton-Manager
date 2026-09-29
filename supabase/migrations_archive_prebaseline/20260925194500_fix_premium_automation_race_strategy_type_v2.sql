begin;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.premium_process_manager_automation_v1()'::regprocedure)
  into v_def;

  if position('t.template_type=''race''' in v_def)>0 then
    v_def:=replace(
      v_def,
      't.template_type=''race''',
      't.template_type=''race_strategy'''
    );
    execute v_def;
  end if;
end
$$;

commit;
