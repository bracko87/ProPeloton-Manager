-- Youth Academy Phase 2A guardrails:
-- 1) do not stack multiple pending human-Academy offers for the same report;
-- 2) do not surface human Academy riders whose owner no longer has Premium.

create unique index if not exists youth_recruitment_one_pending_source_offer_uidx
on public.youth_recruitment_offers(report_id)
where source_academy_decision='pending' and status='submitted';

create or replace function public.submit_youth_recruitment_offer_v1(
  p_report_id uuid,
  p_stipend_weekly integer,
  p_accommodation_weekly integer default 0,
  p_compensation_offer bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_offer_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to recruit Youth riders.';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  if exists(
    select 1
    from public.youth_recruitment_offers o
    join public.youth_scouting_reports r on r.id=o.report_id
    where o.report_id=p_report_id
      and r.academy_id=v_academy_id
      and o.source_academy_decision='pending'
      and o.status='submitted'
  ) then
    raise exception 'An offer is already waiting for the current Academy manager.';
  end if;

  v_offer_id:=private.process_youth_recruitment_offer_v1(
    v_academy_id,p_report_id,
    greatest(50,coalesce(p_stipend_weekly,50)),
    greatest(0,coalesce(p_accommodation_weekly,0)),
    greatest(0,coalesce(p_compensation_offer,0)),
    'manager'
  );

  return public.get_my_youth_scouting_v1()
    || jsonb_build_object('submitted_offer_id',v_offer_id);
end;
$function$;

revoke all on function public.submit_youth_recruitment_offer_v1(
  uuid,integer,integer,bigint
) from public,anon;
grant execute on function public.submit_youth_recruitment_offer_v1(
  uuid,integer,integer,bigint
) to authenticated;

-- Add the Premium-owner rule to the external-Academy candidate scan.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='run_my_youth_scouting_cycle_v1'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'run_my_youth_scouting_cycle_v1 not found'; end if;
  v_def:=pg_get_functiondef(v_oid);

  v_new:=replace(
    v_def,
    $old$        and a.is_active=true
        and r.status='academy'
        and private.youth_academy_age_v1(r.birth_date) between 12 and 16$old$,
    $new$        and a.is_active=true
        and (a.is_ai or public.user_has_premium_access_v1(c.owner_user_id))
        and r.status='academy'
        and private.youth_academy_age_v1(r.birth_date) between 12 and 16$new$
  );

  if v_new=v_def then
    raise exception 'Youth external Academy Premium-owner patch point not found';
  end if;

  execute v_new;
end $$;
