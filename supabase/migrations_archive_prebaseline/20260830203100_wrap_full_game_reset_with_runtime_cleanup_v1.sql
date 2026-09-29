alter function public.game_world_reset_execute_v1(uuid,text)
rename to game_world_reset_execute_core_v1;

create or replace function public.game_world_reset_execute_v1(p_reset_run_id uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','finance','auth','pg_temp'
as $function$
declare
  v_result jsonb;
  v_cleanup jsonb := '{}'::jsonb;
  v_validation jsonb;
begin
  v_result := public.game_world_reset_execute_core_v1(p_reset_run_id,p_confirm);

  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;

  v_cleanup := public.game_world_reset_clear_runtime_execution_state_v1();

  v_validation := public.game_world_reset_validate_v2();
  if coalesce((v_validation->>'ok')::boolean,false) is not true then
    raise exception 'Post-runtime-cleanup reset validation failed: %',v_validation;
  end if;

  update public.game_world_reset_runs
  set execution_report = coalesce(execution_report,'{}'::jsonb)
        || jsonb_build_object('runtime_cleanup',v_cleanup,'runtime_cleanup_atomic',true),
      validation_report = v_validation,
      updated_at = clock_timestamp()
  where id=p_reset_run_id;

  return v_result
    || jsonb_build_object(
      'runtime_cleanup',v_cleanup,
      'post_runtime_cleanup_validation',v_validation
    );
end;
$function$;

grant execute on function public.game_world_reset_execute_v1(uuid,text) to public, anon, authenticated, service_role;
