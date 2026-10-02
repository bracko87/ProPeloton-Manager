
create or replace function public.get_my_national_team_race_plan_workspace_v3(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_event public.nations_group_events%rowtype;
  v_stage_plan jsonb := '{}'::jsonb;
  v_equipment jsonb := '{}'::jsonb;
  v_profile_stage_id uuid;
begin
  v_base := public.get_my_national_team_race_plan_workspace_v2(p_event_id);

  select * into v_event
  from public.nations_group_events
  where id = p_event_id;

  if v_event.id is null then
    raise exception 'National Team event not found.';
  end if;

  v_profile_stage_id := coalesce(v_event.source_stage_id, v_event.stage_id);

  select coalesce(
    jsonb_build_object(
      'race_stage_plan_id', sp.id,
      'status', sp.status,
      'team_strategy', sp.team_strategy,
      'team_tactic_json', coalesce(sp.team_tactic_json,'{}'::jsonb),
      'rider_roles_json', coalesce(sp.rider_roles_json,'{}'::jsonb),
      'rider_equipment_json', coalesce(sp.rider_equipment_json,'{}'::jsonb),
      'rider_individual_tactics_json', coalesce(sp.rider_individual_tactics_json,'{}'::jsonb),
      'rider_supplies_json', coalesce(sp.rider_supplies_json,'{}'::jsonb),
      'last_saved_at', sp.last_saved_at,
      'last_saved_game_ts', sp.last_saved_game_ts
    ),
    '{}'::jsonb
  )
  into v_stage_plan
  from public.race_preparations rp
  join public.race_stage_plans sp
    on sp.race_preparation_id = rp.id
   and sp.stage_number = 1
  where rp.id = nullif(v_base->>'race_preparation_id','')::uuid
  limit 1;

  v_equipment := public.get_my_national_team_equipment_presets_v1();

  return v_base || jsonb_build_object(
    'source_stage_id', v_event.source_stage_id,
    'profile_stage_id', v_profile_stage_id,
    'stage_profile',
      case
        when v_profile_stage_id is null then null
        else public.get_race_stage_profile_detail_v1(v_profile_stage_id)
      end,
    'stage_plan', coalesce(v_stage_plan,'{}'::jsonb),
    'equipment_presets', coalesce(v_equipment->'presets','[]'::jsonb),
    'equipment_can_edit', coalesce((v_equipment->>'can_edit')::boolean,false)
  );
end;
$function$;

create or replace function public.get_my_national_championship_race_plan_workspace_v3(
  p_edition_id uuid,
  p_event_type text,
  p_heat_id uuid default null,
  p_preview_rider_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_base jsonb;
  v_club_id uuid;
  v_stage_id uuid;
  v_presets jsonb := '[]'::jsonb;
  v_saved jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  v_base := public.get_my_national_championship_race_plan_workspace_v2(
    p_edition_id,
    p_event_type,
    p_heat_id,
    p_preview_rider_ids
  );

  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id = v_uid
    and c.parent_club_id is null
    and (c.club_type = 'main' or c.club_type is null)
  order by c.created_at
  limit 1;

  v_stage_id := nullif(v_base->>'stage_id','')::uuid;

  if v_club_id is not null then
    v_presets := coalesce(
      public.equipment_get_setup_presets(v_club_id)->'presets',
      '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_object_agg(
      p.rider_id::text,
      jsonb_build_object(
        'equipment_setup_id', p.equipment_setup_id,
        'phase_1_command', p.phase_1_command,
        'phase_2_command', p.phase_2_command,
        'phase_3_command', p.phase_3_command,
        'phase_4_command', p.phase_4_command
      )
    ),
    '{}'::jsonb
  )
  into v_saved
  from public.national_championship_rider_plans p
  where p.edition_id = p_edition_id
    and p.event_type = p_event_type
    and (
      p_event_type <> 'qualification'
      or p_heat_id is null
      or p.heat_id = p_heat_id
    );

  return v_base || jsonb_build_object(
    'profile_stage_id', v_stage_id,
    'stage_profile',
      case
        when v_stage_id is null then null
        else public.get_race_stage_profile_detail_v1(v_stage_id)
      end,
    'equipment_presets', v_presets,
    'saved_rider_plans', v_saved
  );
end;
$function$;

create or replace function public.save_my_national_team_stage_plan_v3(
  p_event_id uuid,
  p_team_plan text,
  p_rider_roles jsonb default '{}'::jsonb,
  p_rider_commands jsonb default '{}'::jsonb,
  p_rider_equipment jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_ctx record;
  v_event public.nations_group_events%rowtype;
  v_team_id uuid;
  v_lineup_id uuid;
  v_stage_plan_id uuid;
  v_base jsonb;
  v_equipment_json jsonb := '{}'::jsonb;
  v_row record;
  v_preset_id uuid;
  v_bonus jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can save National Team Stage Plans.';
  end if;

  select * into v_event
  from public.nations_group_events
  where id = p_event_id;

  if v_event.id is null then
    raise exception 'National Team event not found.';
  end if;

  if jsonb_typeof(coalesce(p_rider_equipment,'{}'::jsonb)) <> 'object' then
    raise exception 'Rider equipment must be a JSON object.';
  end if;

  v_base := public.save_my_national_team_stage_plan_v2(
    p_event_id,
    p_team_plan,
    coalesce(p_rider_roles,'{}'::jsonb),
    coalesce(p_rider_commands,'{}'::jsonb)
  );

  v_team_id := private.ensure_national_association_race_team_v1(v_ctx.association_id);

  select l.id into v_lineup_id
  from public.national_team_squads s
  join public.national_team_lineups l
    on l.squad_id = s.id
   and l.race_day = v_event.race_day
  where s.association_id = v_ctx.association_id
    and s.cycle_key = v_event.cycle_key
    and l.status in ('confirmed','locked')
  order by s.updated_at desc
  limit 1;

  select sp.id into v_stage_plan_id
  from public.race_preparations rp
  join public.race_stage_plans sp
    on sp.race_preparation_id = rp.id
   and sp.stage_number = 1
  where rp.race_id = v_event.race_id
    and rp.club_id = v_team_id
  limit 1;

  if v_stage_plan_id is null then
    raise exception 'National Team stage plan could not be resolved.';
  end if;

  for v_row in
    select lm.rider_id
    from public.national_team_lineup_members lm
    where lm.lineup_id = v_lineup_id
  loop
    v_preset_id := nullif(p_rider_equipment->>v_row.rider_id::text,'')::uuid;

    if v_preset_id is null then
      select p.id into v_preset_id
      from public.club_equipment_setup_presets p
      where p.club_id = v_team_id
        and p.setup_slot = 1
      limit 1;
    end if;

    if v_preset_id is null or not exists (
      select 1
      from public.club_equipment_setup_presets p
      where p.id = v_preset_id
        and p.club_id = v_team_id
        and p.frame_catalog_item_id is not null
        and p.wheelset_catalog_item_id is not null
        and p.tires_catalog_item_id is not null
        and p.groupset_catalog_item_id is not null
        and p.helmet_catalog_item_id is not null
        and p.shoes_catalog_item_id is not null
    ) then
      raise exception 'Every selected National Team rider needs a complete National Team equipment preset.';
    end if;

    select public.equipment_calculate_catalog_setup_bonus_preview(
      p.frame_catalog_item_id,
      p.wheelset_catalog_item_id,
      p.tires_catalog_item_id,
      p.groupset_catalog_item_id,
      p.helmet_catalog_item_id,
      p.shoes_catalog_item_id
    )
    into v_bonus
    from public.club_equipment_setup_presets p
    where p.id = v_preset_id;

    v_equipment_json := jsonb_set(
      v_equipment_json,
      array[v_row.rider_id::text],
      to_jsonb(v_preset_id::text),
      true
    );

    update public.race_stage_plan_riders spr
    set equipment_setup_id = v_preset_id,
        equipment_bonus_snapshot_json = coalesce(v_bonus,'{}'::jsonb),
        final_bonus_snapshot_json = coalesce(v_bonus,'{}'::jsonb),
        metadata = coalesce(spr.metadata,'{}'::jsonb) || jsonb_build_object(
          'national_team_equipment', true,
          'saved_by_national_coach', true
        ),
        updated_at = now()
    where spr.race_stage_plan_id = v_stage_plan_id
      and spr.rider_id = v_row.rider_id;
  end loop;

  update public.race_stage_plans sp
  set rider_equipment_json = v_equipment_json,
      engine_stage_payload_json = coalesce(sp.engine_stage_payload_json,'{}'::jsonb)
        || jsonb_build_object(
          'national_team_equipment_by_rider', v_equipment_json,
          'equipment_editable_by_national_coach', true
        ),
      metadata = coalesce(sp.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'national_team_stage_plan_v3', true,
          'equipment_editable', true,
          'roles_editable', true,
          'individual_tactics_editable', true,
          'supplies_locked', true,
          'final_calculation_locked', true
        ),
      last_saved_at = now(),
      last_saved_game_ts = public.get_current_game_ts_local(),
      updated_at = now()
  where sp.id = v_stage_plan_id;

  return v_base || jsonb_build_object(
    'rider_equipment', v_equipment_json,
    'equipment_editable', true,
    'roles_editable', true,
    'individual_tactics_editable', true,
    'supplies_locked', true,
    'final_calculation_locked', true
  );
end;
$function$;

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
    'final_calculation_locked', true
  );
end;
$function$;
