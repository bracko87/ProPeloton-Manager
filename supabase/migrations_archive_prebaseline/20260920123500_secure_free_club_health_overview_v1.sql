-- Health overview is now part of the Free core squad experience.
-- Keep the RPC ownership-safe now that it is intentionally loaded for Free users.

create or replace function public.get_club_health_overview(p_club_id uuid)
returns table(
  rider_id uuid,
  display_name text,
  country_code text,
  overall smallint,
  fatigue smallint,
  availability_status text,
  unavailable_until date,
  unavailable_reason text,
  health_case_id uuid,
  case_type text,
  case_code text,
  severity text,
  source text,
  case_status text,
  started_on date,
  active_until date,
  recovery_until date,
  expected_full_recovery_on date,
  source_type text,
  source_id uuid,
  body_part text,
  base_min_days integer,
  base_max_days integer,
  selected_base_days integer,
  medical_staff_reduction_pct numeric,
  infrastructure_reduction_pct numeric,
  total_reduction_pct numeric,
  final_recovery_days integer,
  health_notes jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id=p_club_id
      and (
        c.owner_user_id=auth.uid()
        or exists (
          select 1
          from public.club_memberships cm
          where cm.club_id=c.id and cm.user_id=auth.uid()
        )
      )
  ) then
    raise exception 'Not allowed to read this club health overview.'
      using errcode='42501';
  end if;

  return query
  select
    r.id,r.display_name,r.country_code,r.overall,
    coalesce(r.fatigue,0)::smallint,
    coalesce(r.availability_status,'fit'),
    r.unavailable_until,r.unavailable_reason,
    hc.id,hc.case_type,hc.case_code,hc.severity,hc.source,hc.status,
    hc.started_on,hc.active_until,hc.recovery_until,
    coalesce(ctx.expected_full_recovery_on,hc.recovery_until,hc.active_until),
    ctx.source_type,ctx.source_id,ctx.body_part,ctx.base_min_days,ctx.base_max_days,
    ctx.selected_base_days,ctx.medical_staff_reduction_pct,
    ctx.infrastructure_reduction_pct,ctx.total_reduction_pct,
    ctx.final_recovery_days,coalesce(ctx.notes,'{}'::jsonb)
  from public.club_riders cr
  join public.riders r on r.id=cr.rider_id
  left join public.rider_health_cases hc
    on hc.rider_id=r.id and hc.status in ('active','recovering')
  left join public.rider_health_case_context_v1 ctx
    on ctx.health_case_id=hc.id
  where cr.club_id=p_club_id
    and (
      coalesce(r.availability_status,'fit') <> 'fit'
      or hc.id is not null
    )
  order by
    case
      when coalesce(r.availability_status,'fit')='injured' then 1
      when coalesce(r.availability_status,'fit')='sick' then 2
      when coalesce(r.availability_status,'fit')='not_fully_fit' then 3
      else 4
    end,
    coalesce(
      ctx.expected_full_recovery_on,
      hc.recovery_until,
      hc.active_until,
      r.unavailable_until
    ) asc nulls last,
    r.display_name asc;
end;
$$;
