-- SAT-13 (stage 1): add an authenticated ADMIN-ONLY entry point for
-- youth competition health checks used by the Control Center UI.
-- The original public monitor stays available until the new frontend is
-- deployed and legacy browser bundles are no longer active.
-- The monitor writes health receipts/incidents; this migration DOES NOT call it.
do $preflight$
begin
  if to_regprocedure('public.admin_monitor_youth_competition_health_v1()') is not null then
    raise exception 'SAT13 admin wrapper already exists';
  end if;
  if to_regprocedure('public.monitor_youth_competition_health_v1()') is null
     or to_regprocedure('public.is_app_admin_v1()') is null then
    raise exception 'SAT13 required monitor/admin authorization helper missing';
  end if;
end;
$preflight$;

create function public.admin_monitor_youth_competition_health_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return public.monitor_youth_competition_health_v1();
end;
$function$;

revoke all on function public.admin_monitor_youth_competition_health_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_monitor_youth_competition_health_v1()
  to authenticated;

comment on function public.admin_monitor_youth_competition_health_v1()
  is 'Control Center admin-only wrapper. After frontend cutover, revoke player access on the old monitor; keep internal cron and definer callers operational.';