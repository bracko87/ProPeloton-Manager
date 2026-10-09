-- Staff Advisory Support — runtime guards

-- The report generator Edge Function uses a service-role client to call the
-- backend-only report storage RPC after it has authenticated and validated the
-- requesting user through the user-scoped client.
grant execute on function public.staff_advisory_store_report_v1(
  uuid, uuid, uuid, text, timestamptz, timestamptz, text, text, jsonb, text
) to service_role;

create or replace function public.staff_advisory_reports_enabled_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  select c.reports_enabled
    into v_enabled
    from public.staff_advisory_config c
   where c.config_key = 'default';

  if coalesce(v_enabled, false) is not true then
    raise exception 'staff_advisory_reports_disabled';
  end if;

  return new;
end;
$$;

revoke all on function public.staff_advisory_reports_enabled_guard_v1() from public;

drop trigger if exists trg_staff_advisory_reports_enabled_guard
  on public.staff_advisory_reports;

create trigger trg_staff_advisory_reports_enabled_guard
before insert on public.staff_advisory_reports
for each row
execute function public.staff_advisory_reports_enabled_guard_v1();
