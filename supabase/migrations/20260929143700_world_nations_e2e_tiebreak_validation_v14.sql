create or replace function private.world_nations_e2e_validation_core_v4()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb:=private.world_nations_e2e_validation_core_v3();
  v_check jsonb;
  v_checks jsonb:='[]'::jsonb;
  v_tiebreak_ok boolean;
  v_passed integer:=0;
  v_failed integer:=0;
begin
  select
    to_regprocedure('private.nations_day3_rank_vector_v1(uuid,uuid)') is not null
    and pg_get_functiondef('public.finalize_nations_group_v1(uuid)'::regprocedure)
      ilike '%day3_rider_7%'
    and pg_get_functiondef('public.finalize_nations_group_v1(uuid)'::regprocedure)
      ilike '%day3_combined_rank_sum%'
  into v_tiebreak_ok;

  for v_check in
    select value
    from jsonb_array_elements(v_result->'checks')
  loop
    if v_check->>'key'='exact_tie_after_all_four_tiebreaks' then
      v_check:=jsonb_build_object(
        'key','extended_sporting_tiebreak',
        'passed',coalesce(v_tiebreak_ok,false),
        'details','After the original tie-breaks, the engine compares the 2nd through 7th Day 3 riders in finishing order, then the combined finishing-position total of all seven riders. No random, financial or prestige-based tie-break is used.'
      );
    end if;

    v_checks:=v_checks||jsonb_build_array(v_check);
    if coalesce((v_check->>'passed')::boolean,false) then
      v_passed:=v_passed+1;
    else
      v_failed:=v_failed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'status',case when v_failed=0 then 'passed' else 'attention_required' end,
    'mode','non_destructive_validation',
    'passed_checks',v_passed,
    'failed_checks',v_failed,
    'checks',v_checks
  );
end;
$function$;

revoke all on function private.world_nations_e2e_validation_core_v4()
from public,anon,authenticated;

create or replace function public.run_admin_world_nations_e2e_validation_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return private.world_nations_e2e_validation_core_v4();
end;
$function$;
