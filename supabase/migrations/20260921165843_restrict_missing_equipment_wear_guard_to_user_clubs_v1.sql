create or replace function public.race_engine_apply_missing_stage_equipment_wear_v2(
  p_simulation_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_stage_distance_km numeric := 0;
  v_stage_date date;
  v_phase9 jsonb;
  v_equipment jsonb := '{}'::jsonb;
  v_entry record;
  v_inventory record;
  v_loss numeric;
  v_condition_after numeric;
  v_log_id uuid;
  v_candidates integer := 0;
  v_user_candidates integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  select rr.stage_id, rr.race_id, coalesce(rs.distance_km,0), rs.stage_date
  into v_stage_id, v_race_id, v_stage_distance_km, v_stage_date
  from public.race_stage_simulation_runs rr
  join public.race_stages rs on rs.id = rr.stage_id
  where rr.id = p_simulation_run_id;

  if not found then
    raise exception 'Simulation run % not found', p_simulation_run_id;
  end if;

  if exists (
    select 1
    from public.race_engine_stage_wear_applications w
    where w.simulation_run_id = p_simulation_run_id
      and w.target_type = 'equipment'
      and w.target_table = 'club_equipment_inventory'
  ) then
    return jsonb_build_object(
      'ok', true,
      'status', 'canonical_equipment_wear_present',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  select public.race_engine_get_stage_phase9_inputs_v1(v_stage_id)
  into v_phase9;

  v_equipment := coalesce(v_phase9 -> 'preparation' -> 'equipment', '{}'::jsonb);

  for v_entry in
    select key, value
    from jsonb_each(v_equipment)
    order by key
  loop
    v_candidates := v_candidates + 1;

    select
      cei.id,
      cei.club_id,
      cei.equipment_category,
      cei.condition_percent
    into v_inventory
    from public.club_equipment_inventory cei
    join public.clubs c on c.id = cei.club_id
    where cei.id = v_entry.key::uuid
      and not coalesce(c.is_ai,false)
    for update of cei;

    if not found then
      continue;
    end if;

    v_user_candidates := v_user_candidates + 1;
    v_loss := greatest(0, (v_stage_distance_km / 100.0) * 0.35);
    v_condition_after := greatest(
      0,
      least(100, coalesce(v_inventory.condition_percent,100) - v_loss)
    );

    v_log_id := null;

    insert into public.race_engine_stage_wear_applications (
      simulation_run_id,
      race_id,
      stage_id,
      target_type,
      target_table,
      target_id,
      club_id,
      target_key,
      condition_loss,
      applied_game_date,
      metadata
    )
    values (
      p_simulation_run_id,
      v_race_id,
      v_stage_id,
      'equipment',
      'club_equipment_inventory',
      v_inventory.id,
      v_inventory.club_id,
      v_inventory.equipment_category,
      v_loss,
      v_stage_date,
      jsonb_build_object(
        'source', 'phase11_equipment_wear_compat_v2',
        'reason', 'canonical application manifest omitted user equipment resources',
        'phase9_resource', v_entry.value,
        'stage_distance_km', v_stage_distance_km,
        'condition_before_apply', v_inventory.condition_percent,
        'condition_after_apply', v_condition_after
      )
    )
    on conflict (simulation_run_id, target_type, target_table, target_id)
    do nothing
    returning id into v_log_id;

    if v_log_id is not null then
      v_inserted := v_inserted + 1;

      update public.club_equipment_inventory cei
      set
        condition_percent = v_condition_after,
        last_used_game_date = coalesce(v_stage_date, cei.last_used_game_date),
        total_distance_km = coalesce(cei.total_distance_km,0) + v_stage_distance_km,
        total_race_days = coalesce(cei.total_race_days,0) + 1,
        updated_at = clock_timestamp()
      where cei.id = v_inventory.id;

      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', case
      when v_candidates = 0 then 'no_equipment_candidates'
      when v_user_candidates = 0 then 'no_user_equipment_candidates'
      else 'processed'
    end,
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'equipment_candidate_count', v_candidates,
    'user_equipment_candidate_count', v_user_candidates,
    'equipment_log_inserted_count', v_inserted,
    'equipment_updated_count', v_updated
  );
end;
$function$;
