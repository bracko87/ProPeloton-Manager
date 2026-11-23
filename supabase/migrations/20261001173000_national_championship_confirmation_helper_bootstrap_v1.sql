-- Fresh-install ordering repair: the lifecycle overview migration at 17:35
-- invokes this helper before the 19:05 watchdog migration originally defines it.
-- Keep its behavior identical to the later CREATE OR REPLACE definition.
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
