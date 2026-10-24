-- Reconstitute two existing National Championship helper definitions that were
-- absent from the exported repository baseline, before the v1 lifecycle SQL
-- function requires them. Source: read-only current production catalog.
-- No historical race, championship, club, rider or game data is modified.
-- These SECURITY DEFINER signatures/search paths mirror existing production
-- functions and are created ONLY when not already present.
do $restore_national_prereqs$
begin
  if to_regprocedure('public.national_championship_rider_available_for_event_v1(uuid,date)') is null then
    execute $canonical_definition$
CREATE OR REPLACE FUNCTION public.national_championship_rider_available_for_event_v1(p_rider_id uuid, p_event_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select
      case
        when lower(coalesce(r.availability_status::text,'fit')) = 'retired' then false
        when lower(coalesce(r.availability_status::text,'fit')) in ('injured','sick')
             and (r.unavailable_until is null or r.unavailable_until >= p_event_date)
          then false
        when exists (
          select 1
          from public.rider_health_cases hc
          where hc.rider_id=r.id
            and hc.status in ('active','recovering')
            and hc.selection_blocked is true
            and (
              coalesce(hc.recovery_until,hc.active_until) is null
              or coalesce(hc.recovery_until,hc.active_until) >= p_event_date
            )
        ) then false
        else true
      end
    from public.riders r
    where r.id=p_rider_id
  ),false);
$function$;
    $canonical_definition$;
  end if;
  if to_regprocedure('public.national_championship_entry_confirmed_for_event_v1(uuid,text,uuid)') is null then
    execute $canonical_definition$
CREATE OR REPLACE FUNCTION public.national_championship_entry_confirmed_for_event_v1(p_entry_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select case
      when p_event_type='qualification' then
        en.heat_id=p_heat_id and en.entry_status='qualification_assigned'
        and en.participation_decision in ('approved','auto_approved')
        and public.national_championship_rider_available_for_event_v1(en.rider_id,h.qualification_date)
      when p_event_type='final' and en.entry_path='direct' then
        en.entry_status in ('direct_qualified','finalist')
        and en.participation_decision in ('approved','auto_approved')
        and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date)
      when p_event_type='final' and en.entry_path='qualification' then
        en.entry_status in ('qualified','finalist')
        and en.final_participation_decision in ('approved','auto_approved')
        and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date)
      else false end
    from public.national_championship_entries en
    join public.national_championship_editions e on e.id=en.edition_id
    left join public.national_championship_heats h on h.id=en.heat_id
    where en.id=p_entry_id
  ),false);
$function$;
    $canonical_definition$;
  end if;
end;
$restore_national_prereqs$;
