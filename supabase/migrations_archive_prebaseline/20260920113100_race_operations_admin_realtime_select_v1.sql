drop policy if exists "app admins can read race operations status"
on public.race_operations_stage_status_v1;

create policy "app admins can read race operations status"
on public.race_operations_stage_status_v1
for select
to authenticated
using (public.is_app_admin_v1());

drop policy if exists "app admins can read race operations incidents"
on public.race_operations_incidents_v1;

create policy "app admins can read race operations incidents"
on public.race_operations_incidents_v1
for select
to authenticated
using (public.is_app_admin_v1());

grant select on public.race_operations_stage_status_v1 to authenticated;
grant select on public.race_operations_incidents_v1 to authenticated;
