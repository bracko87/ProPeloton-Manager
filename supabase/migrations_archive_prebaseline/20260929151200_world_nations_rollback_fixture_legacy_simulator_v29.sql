create or replace function private.run_nations_e2e_fixture_legacy_sim_v2(
  p_association_count integer default 48
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_report jsonb:='{}'::jsonb;
begin
  select to_jsonb(c)
  into v_before
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id=true;

  begin
    update public.race_engine_runtime_control_v1
    set active_engine='legacy_sql',
        legacy_execution_enabled=true,
        typescript_execution_enabled=false,
        typescript_lifecycle_enabled=false,
        updated_at=now(),
        updated_by='world_nations_e2e_fixture',
        notes=coalesce(notes,'')||E'\nTemporary rollback-only World Nations E2E simulation mode.'
    where singleton_id=true;

    perform set_config('app.race_engine_writer_family','legacy',true);

    v_report:=private.run_nations_e2e_fixture_core_v1(p_association_count);

    raise exception using
      errcode='Z0002',
      message='WORLD_NATIONS_OUTER_FIXTURE_ROLLBACK';
  exception
    when sqlstate 'Z0002' then
      null;
  end;

  select to_jsonb(c)
  into v_after
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id=true;

  return coalesce(v_report,'{}'::jsonb)
    || jsonb_build_object(
      'engine_fixture_mode','rollback_only_legacy_sql_simulator',
      'runtime_control_restored',v_after=v_before
    );
end;
$function$;

revoke all on function private.run_nations_e2e_fixture_legacy_sim_v2(integer)
from public,anon,authenticated;
