-- Prevent championship scheduler aborts when a rider is currently injured
-- but is expected to recover before the future World Road Championship.
-- Keep their approved decision; defer their entry/start-list materialization
-- until the rider is actually selectable. Do not change rider health or
-- official race results. Existing 15-minute planner restores eligibility.
CREATE OR REPLACE FUNCTION public.world_road_championship_refresh_availability_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  v_count integer:=0;
begin
  for r in
    select
      en.id,en.edition_id,en.rider_id,en.participation_decision,en.entry_status,
      e.race_date,
      coalesce(rd.availability_status,'fit') availability_status,
      rd.unavailable_until
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    join public.riders rd on rd.id=en.rider_id
    where e.status in ('planned','ready')
      and en.participation_decision<>'rejected'
  loop
    -- Preparation triggers inspect CURRENT health, not predicted race-day
    -- recovery. Do not create a preparation row while selection is blocked.
    if (r.availability_status<>'fit'
        and (r.unavailable_until is null or r.unavailable_until>=r.race_date))
       or lower(r.availability_status) in ('injured','sick','retired')
       or exists (
         select 1 from public.rider_health_cases hc
         where hc.rider_id=r.rider_id
           and hc.status in ('active','recovering')
           and hc.selection_blocked is true
       )
    then
      if r.entry_status<>'unavailable' then
        update public.world_road_championship_entries
        set entry_status='unavailable',updated_at=now()
        where id=r.id;

        update public.world_road_championship_duties
        set status='cancelled',updated_at=now()
        where edition_id=r.edition_id and rider_id=r.rider_id;

        v_count:=v_count+1;
      end if;
    else
      if r.entry_status='unavailable' then
        update public.world_road_championship_entries
        set entry_status=case
              when r.participation_decision in ('approved','auto_approved')
                then 'confirmed'
              else 'invited'
            end,
            updated_at=now()
        where id=r.id;

        update public.world_road_championship_duties
        set status='confirmed',updated_at=now()
        where edition_id=r.edition_id and rider_id=r.rider_id;

        v_count:=v_count+1;
      end if;
    end if;
  end loop;

  for r in
    select id
    from public.world_road_championship_editions
    where status in ('planned','ready')
      and race_id is not null
  loop
    perform public.world_road_championship_sync_participants_v1(r.id);
  end loop;

  return v_count;
end;
$function$;
