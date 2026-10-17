create or replace function public.save_my_youth_race_lineup_v1(
  p_race_id uuid,p_rider_ids uuid[],p_strategy text default 'balanced'
) returns jsonb language plpgsql security definer
set search_path to 'public','private','auth','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_squad_decider text;
  v_rider_id uuid;
  v_slot integer:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.race_squad_decider into v_academy_id,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if coalesce(v_squad_decider,'u16_head_coach')<>'manager' then
    raise exception 'Race squad selection is delegated to the U16 Head Coach';
  end if;

  select * into v_entry from public.youth_race_entries
  where race_id=p_race_id and academy_id=v_academy_id and status='entered'
  for update;
  select * into v_race from public.youth_races where id=p_race_id;

  if v_entry.id is null then raise exception 'Enter the race before selecting a lineup'; end if;
  if cardinality(p_rider_ids)<4 or cardinality(p_rider_ids)>v_race.lineup_size then
    raise exception 'Youth race lineup must contain between 4 and % riders',v_race.lineup_size;
  end if;

  delete from public.youth_race_lineups where entry_id=v_entry.id;
  foreach v_rider_id in array p_rider_ids loop
    if not exists(select 1 from public.youth_riders yr
      where yr.id=v_rider_id and yr.academy_id=v_academy_id
        and private.youth_rider_available_for_race_v1(yr.id,p_race_id))
    then raise exception 'One or more selected Youth Riders are not eligible or are booked in an overlapping race';
    end if;
    v_slot:=v_slot+1;
    insert into public.youth_race_lineups(entry_id,youth_rider_id,slot_no,selected_by)
    values(v_entry.id,v_rider_id,v_slot,'manager');
  end loop;

  update public.youth_race_entries
  set strategy=case when p_strategy in ('conservative','balanced','aggressive')
    then p_strategy else 'balanced' end,updated_at=now()
  where id=v_entry.id;
  return public.get_my_youth_race_calendar_v1();
end;
$function$;
