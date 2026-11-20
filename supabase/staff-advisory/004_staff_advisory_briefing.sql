-- Staff Briefing Centre read model
-- Returns every supported hired employee plus one synthetic vacant row for any
-- supported role that currently has no active employee.

create or replace function public.staff_advisory_get_briefing_v1(p_club_id uuid)
returns table (
  staff_id uuid,
  staff_name text,
  role_type text,
  employment_status text,
  advisory_status text,
  expires_at timestamptz,
  is_pinned boolean,
  pin_order smallint
)
language sql
security definer
set search_path = public
as $$
  with supported(role_type, role_order) as (
    values
      ('head_coach'::text, 1),
      ('sport_director'::text, 2),
      ('team_doctor'::text, 3),
      ('mechanic'::text, 4),
      ('scout_analyst'::text, 5),
      ('u23_head_coach'::text, 6)
  ),
  hired as (
    select
      s.id as staff_id,
      s.staff_name::text as staff_name,
      s.role_type::text as role_type,
      'hired'::text as employment_status,
      case
        when a.expires_at is null then 'inactive'::text
        when a.expires_at > now() then 'active'::text
        else 'expired'::text
      end as advisory_status,
      a.expires_at,
      (p.staff_id is not null) as is_pinned,
      p.sort_order as pin_order,
      sr.role_order
    from public.club_staff s
    join supported sr on sr.role_type = s.role_type::text
    left join public.staff_advisory_access a
      on a.club_id = s.club_id
     and a.staff_id = s.id
     and a.user_id = auth.uid()
    left join public.staff_advisory_pins p
      on p.club_id = s.club_id
     and p.staff_id = s.id
     and p.user_id = auth.uid()
    where s.club_id = p_club_id
      and s.is_active = true
  ),
  vacant as (
    select
      null::uuid as staff_id,
      null::text as staff_name,
      sr.role_type,
      'vacant'::text as employment_status,
      'not_applicable'::text as advisory_status,
      null::timestamptz as expires_at,
      false as is_pinned,
      null::smallint as pin_order,
      sr.role_order
    from supported sr
    where not exists (
      select 1
      from hired h
      where h.role_type = sr.role_type
    )
  )
  select
    x.staff_id,
    x.staff_name,
    x.role_type,
    x.employment_status,
    x.advisory_status,
    x.expires_at,
    x.is_pinned,
    x.pin_order
  from (
    select * from hired
    union all
    select * from vacant
  ) x
  where public.get_my_club_id() = p_club_id
  order by
    case when x.is_pinned then 0 else 1 end,
    coalesce(x.pin_order, 99),
    x.role_order,
    coalesce(x.staff_name, '');
$$;

revoke all on function public.staff_advisory_get_briefing_v1(uuid) from public;
grant execute on function public.staff_advisory_get_briefing_v1(uuid) to authenticated;
