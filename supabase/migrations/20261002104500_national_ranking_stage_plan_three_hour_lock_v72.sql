create or replace function public.save_my_national_championship_stage_plan_v3(
  p_edition_id uuid,
  p_event_type text,
  p_heat_id uuid default null,
  p_rider_id uuid default null,
  p_equipment_setup_id uuid default null,
  p_phase_1_command text default 'ride_naturally',
  p_phase_2_command text default 'ride_naturally',
  p_phase_3_command text default 'ride_naturally',
  p_phase_4_command text default 'ride_naturally'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_club_id uuid;
  v_real_entry boolean := false;
  v_event_key text;
  v_result jsonb;
  v_race_id uuid;
  v_stage_start timestamp without time zone;
  v_stage_lock timestamp without time zone;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_rider_id is null then
    raise exception 'Rider is required.';
  end if;

  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id = v_uid
    and c.parent_club_id is null
    and (c.club_type = 'main' or c.club_type is null)
  order by c.created_at
  limit 1;

  if v_club_id is null then
    raise exception 'Main club not found.';
  end if;

  if p_equipment_setup_id is not null and not exists (
    select 1
    from public.club_equipment_setup_presets p
    where p.id = p_equipment_setup_id
      and p.club_id = v_club_id
      and p.frame_catalog_item_id is not null
      and p.wheelset_catalog_item_id is not null
      and p.tires_catalog_item_id is not null
      and p.groupset_catalog_item_id is not null
      and p.helmet_catalog_item_id is not null
      and p.shoes_catalog_item_id is not null
  ) then
    raise exception 'Equipment preset does not belong to your club or is incomplete.';
  end if;

  if p_event_type='qualification' then
    select h.race_id into v_race_id
    from public.national_championship_heats h
    where h.id=p_heat_id;
  else
    select e.final_race_id into v_race_id
    from public.national_championship_editions e
    where e.id=p_edition_id;
  end if;

  if v_race_id is not null then
    select
      rs.stage_date::timestamp
        + make_interval(
            hours=>coalesce(rs.planned_start_hour_number,r.planned_start_hour_number,12),
            mins=>coalesce(rs.planned_start_minute,r.planned_start_minute,0)
          )
    into v_stage_start
    from public.race_stages rs
    join public.races r on r.id=rs.race_id
    where rs.race_id=v_race_id
    order by rs.stage_number
    limit 1;

    if v_stage_start is not null then
      v_stage_lock:=v_stage_start-interval '3 hours';

      if public.get_current_game_ts_local()>=v_stage_lock then
        raise exception 'Stage Plan is locked from %.',v_stage_lock;
      end if;
    end if;
  end if;

  select exists(
    select 1
    from public.national_championship_entries en
    where en.edition_id = p_edition_id
      and en.rider_id = p_rider_id
      and public.universal_race_resource_owner_club_v1(en.club_id_snapshot) = v_club_id
  )
  into v_real_entry;

  if v_real_entry then
    v_result := public.save_my_national_championship_rider_plan_v1(
      p_edition_id,
      p_event_type,
      p_rider_id,
      p_equipment_setup_id,
      p_phase_1_command,
      p_phase_2_command,
      p_phase_3_command,
      p_phase_4_command
    );
  else
    v_result := public.save_my_national_championship_stage_plan_v2(
      p_edition_id,
      p_event_type,
      p_heat_id,
      p_rider_id,
      p_phase_1_command,
      p_phase_2_command,
      p_phase_3_command,
      p_phase_4_command
    );

    v_event_key := case
      when p_event_type = 'qualification'
        then p_edition_id::text || ':qualification:' || coalesce(p_heat_id::text,'')
      else p_edition_id::text || ':final'
    end;

    update public.national_special_race_plans p
    set metadata = jsonb_set(
          coalesce(p.metadata,'{}'::jsonb),
          array['preview_equipment_by_rider',p_rider_id::text],
          coalesce(to_jsonb(p_equipment_setup_id::text),'null'::jsonb),
          true
        ),
        updated_at = now(),
        updated_by_user_id = v_uid
    where p.plan_kind = 'national_ranking'
      and p.event_key = v_event_key
      and p.owner_scope_key = 'club:' || v_club_id::text;
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'equipment_setup_id', p_equipment_setup_id,
    'equipment_editable', true,
    'roles_editable', false,
    'individual_tactics_editable', true,
    'supplies_locked', true,
    'final_calculation_locked', true,
    'stage_start_game_ts', v_stage_start,
    'stage_lock_game_ts', v_stage_lock
  );
end;
$function$;
