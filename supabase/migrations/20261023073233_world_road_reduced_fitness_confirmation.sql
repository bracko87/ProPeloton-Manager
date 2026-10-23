-- World Road Championship: reduced fitness (fatigue) is not a medical selection block.
-- Preserve the existing injury/sickness/retirement and rider-health-case exclusions,
-- keep manual decisions for human-owned clubs, and leave history and rider fitness unchanged.
-- Resolves #169. Re-run the normal championship availability refresh only after
-- this forward-only migration has been reviewed and released.
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
    select en.id,en.edition_id,en.rider_id,en.participation_decision,en.entry_status,
           e.race_date,
           coalesce(rd.availability_status,'fit') availability_status,
           rd.unavailable_until
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    join public.riders rd on rd.id=en.rider_id
    where e.status in ('planned','ready')
      and en.participation_decision<>'rejected'
  loop
    -- 'not_fully_fit' means fatigued / reduced readiness, not medically unavailable.
    -- Hard medical states and explicitly selection-blocking health cases remain excluded.
    if (lower(r.availability_status) not in ('fit','not_fully_fit')
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
    where status in ('planned','ready') and race_id is not null
  loop
    perform public.world_road_championship_sync_participants_v1(r.id);
  end loop;
  return v_count;
end;
$function$;

-- Surface a precise, safe reason to the read-only Championship field UI.
-- An active selection-blocking health case is reported only as a Boolean.
CREATE OR REPLACE FUNCTION public.get_world_road_championship_expected_field_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'country_code',nc.country_code,
      'national_final_date',nc.final_date,
      'champion_rider_id',nc.champion_rider_id,
      'champion_name',nc.champion_name_snapshot,
      'champion_club_id',nc.champion_club_id,
      'champion_club_name',nc.champion_club_name_snapshot,
      'champion_jersey_url',case
        when nc.champion_club_id is not null
          then public.club_jersey_url_v1(nc.champion_club_id)
        else null end,
      'entry_status',we.entry_status,
      'participation_decision',we.participation_decision,
      'final_participation_decision',we.final_participation_decision,
      'national_status',nc.status,
      'rider_availability_status',rd.availability_status,
      'medical_selection_blocked',exists (
        select 1 from public.rider_health_cases hc
        where hc.rider_id=nc.champion_rider_id
          and hc.status in ('active','recovering')
          and hc.selection_blocked is true
      )
    ) order by nc.country_code
  ),'[]'::jsonb)
  from public.world_road_championship_editions wc
  join public.national_championship_editions nc
    on nc.season_number=wc.season_number and nc.discipline='road'
  left join public.world_road_championship_entries we
    on we.edition_id=wc.id and we.source_national_edition_id=nc.id
  left join public.riders rd on rd.id=nc.champion_rider_id
  where wc.race_id=p_race_id
    and exists (
      select 1 from public.races r
      where r.id=p_race_id
        and (r.metadata->>'world_road_championship'='true'
             or r.name='World Road Championship Grand Finale')
    );
$function$;
