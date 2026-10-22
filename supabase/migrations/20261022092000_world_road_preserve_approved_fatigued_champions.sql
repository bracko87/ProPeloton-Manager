-- Distinguish confirmed World Road Championship participation from temporary
-- training fatigue. AI-owned / unowned champion invitations are already
-- auto_approved; this routine must not cancel those approvals merely because
-- the rider currently has availability_status='not_fully_fit'.
-- All hard medical selection blocks remain active. Any previously rejected or
-- withdrawn entries stay rejected/withdrawn.
-- Existing daily competition processing invokes this function; apply this
-- function-only migration before a targeted, separately reviewed reconciliation.
-- No changes to published races, standings, stage results or payouts.
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
      en.id,en.edition_id,en.rider_id,en.participation_decision,
      en.final_participation_decision,en.entry_status,
      e.race_date,
      coalesce(rd.availability_status,'fit') availability_status,
      rd.unavailable_until
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    join public.riders rd on rd.id=en.rider_id
    where e.status in ('planned','ready')
      and en.participation_decision<>'rejected'
      and en.entry_status not in ('rejected','withdrawn')
      and coalesce(en.final_participation_decision,'not_open') not in ('refused','rejected','withdrawn')
  loop
    -- A prior invitation decision remains authoritative: transient fatigue or
    -- "not_fully_fit" readiness is NOT a participation refusal and is not a
    -- medical selection prohibition. The race engine still sees live fatigue.
    -- Actual injury, illness, retirement, a through-race unavailability date,
    -- or an active selection-blocking medical case remain hard blocks.
    if lower(r.availability_status) in ('injured','sick','retired')
       or (r.unavailable_until is not null and r.unavailable_until>=r.race_date)
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
