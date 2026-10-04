
-- Youth Academy follow-up hardening and compatibility v1.

create or replace function public.run_my_youth_scouting_cycle_v1()
returns jsonb
language sql
security definer
set search_path=public,auth,pg_temp
as $function$
  select public.run_my_youth_scouting_search_v2(false);
$function$;

revoke all on function public.run_my_youth_scouting_cycle_v1()
from public,anon;
grant execute on function public.run_my_youth_scouting_cycle_v1()
to authenticated;

revoke all on function public.get_club_staff_weekly_wages(uuid)
from public,anon,authenticated;
grant execute on function public.get_club_staff_weekly_wages(uuid)
to service_role;

update public.club_staff cs
set salary_weekly=public.calculate_staff_weekly_salary(
  cs.role_type,cs.expertise,cs.experience,cs.potential,
  cs.leadership,cs.efficiency,cs.loyalty,'youth'
),
updated_at=now()
where cs.is_active=true
  and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
  and cs.salary_weekly is distinct from public.calculate_staff_weekly_salary(
    cs.role_type,cs.expertise,cs.experience,cs.potential,
    cs.leadership,cs.efficiency,cs.loyalty,'youth'
  );

create index if not exists youth_academy_ledger_academy_id_idx
on public.youth_academy_ledger(academy_id);

create index if not exists youth_academy_equipment_catalog_item_idx
on public.youth_academy_equipment_inventory(catalog_item_id);

create index if not exists youth_scouting_cycles_scout_staff_id_idx
on public.youth_scouting_cycles(scout_staff_id)
where scout_staff_id is not null;
