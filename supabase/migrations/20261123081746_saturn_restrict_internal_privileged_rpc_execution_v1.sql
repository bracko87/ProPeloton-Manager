-- SAT-10: shut direct untrusted RPC access to selected internal privileged helpers.
-- This deliberately does not change function bodies or any game/player records.
-- All seven are SECURITY DEFINER, owned by postgres, and have only SECURITY
-- DEFINER callers in the audited function call graph as of 23 Nov 2026.
do $check$
declare
  v_signature text;
  v_oid oid;
  v_is_definer boolean;
  v_invoker_callers integer;
begin
  for v_signature in
    select x.signature from (values
      ('public.race_get_rider_numeric_skill_value_v1(uuid,text[],numeric)'),
      ('public.race_calculate_rider_favorite_score_v1(uuid,numeric,text,text,integer)'),
      ('public.finance_transfer_club_to_club_internal(uuid,uuid,bigint,text,text,text,jsonb)'),
      ('public.finance_get_or_create_system_account(text,text,text)'),
      ('public.generate_race_stage_weather_v1(uuid,boolean)'),
      ('public.finance_process_weekly_rider_wages()'),
      ('public._finance_process_weekly_rider_wages_core_v1()')
    ) as x(signature)
  loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Required internal RPC missing: %', v_signature;
    end if;
    select p.prosecdef into v_is_definer from pg_proc p where p.oid=v_oid;
    if v_is_definer is distinct from true then
      raise exception 'Internal RPC lost security definer contract: %', v_signature;
    end if;
    select count(*)::int into v_invoker_callers
    from pg_proc caller
    where caller.oid<>v_oid
      and not caller.prosecdef
      and caller.prosrc ilike '%'||(select p.proname from pg_proc p where p.oid=v_oid)||'%';
    if v_invoker_callers<>0 then
      raise exception 'Unreviewed invoker caller for % (% callers)', v_signature,v_invoker_callers;
    end if;
  end loop;
end;
$check$;

revoke execute on function public.race_get_rider_numeric_skill_value_v1(uuid,text[],numeric)
  from public, anon, authenticated;
revoke execute on function public.race_calculate_rider_favorite_score_v1(uuid,numeric,text,text,integer)
  from public, anon, authenticated;
revoke execute on function public.finance_transfer_club_to_club_internal(uuid,uuid,bigint,text,text,text,jsonb)
  from public, anon, authenticated;
revoke execute on function public.finance_get_or_create_system_account(text,text,text)
  from public, anon, authenticated;
revoke execute on function public.generate_race_stage_weather_v1(uuid,boolean)
  from public, anon, authenticated;
revoke execute on function public.finance_process_weekly_rider_wages()
  from public, anon, authenticated;
revoke execute on function public._finance_process_weekly_rider_wages_core_v1()
  from public, anon, authenticated;

grant execute on function public.race_get_rider_numeric_skill_value_v1(uuid,text[],numeric)
  to service_role;
grant execute on function public.race_calculate_rider_favorite_score_v1(uuid,numeric,text,text,integer)
  to service_role;
grant execute on function public.finance_transfer_club_to_club_internal(uuid,uuid,bigint,text,text,text,jsonb)
  to service_role;
grant execute on function public.finance_get_or_create_system_account(text,text,text)
  to service_role;
grant execute on function public.generate_race_stage_weather_v1(uuid,boolean)
  to service_role;
grant execute on function public.finance_process_weekly_rider_wages()
  to service_role;
grant execute on function public._finance_process_weekly_rider_wages_core_v1()
  to service_role;

-- Important: separate publicly callable daily/hourly processors remain under
-- review; this is a targeted fix, not a global RPC permission reset.
