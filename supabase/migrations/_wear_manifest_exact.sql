CREATE OR REPLACE FUNCTION public.race_engine_apply_stage_equipment_asset_wear_v1(p_simulation_run_id uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_stage_distance_km numeric := 0;
  v_applied_game_date date;
  v_updated_equipment_count integer := 0;
  v_inserted_equipment_log_count integer := 0;
  v_result jsonb;
  v_inserted_plan_rows integer := 0;
  v_inserted_direct_plan_rows integer := 0;
  v_inserted_prep_plan_rows integer := 0;
  v_categories text[] := array['frame', 'wheelset', 'groupset', 'tires', 'helmet', 'shoes'];
  -- Phase 11B universal-manifest exact application branch.
  v_manifest jsonb;
  v_resource_updates jsonb;
  v_resource_row jsonb;
  v_resource_id uuid;
  v_resource_type text;
  v_team_id uuid;
  v_condition_before numeric;
  v_condition_after numeric;
  v_condition_used numeric;
  v_current_condition numeric;
  v_asset_key text;
  v_asset_table text;
  v_universal_candidate_count integer := 0;
  v_universal_equipment_updated integer := 0;
  v_universal_asset_updated integer := 0;
  v_universal_log_inserted integer := 0;
  v_universal_already_applied integer := 0;
  v_universal_sql text;
begin
  if p_simulation_run_id is null then
    raise exception 'p_simulation_run_id is required';
  end if;

  -- Resolve the stage from whichever simulation-run table exists.
  if to_regclass('public.race_stage_simulation_runs') is not null then
    execute 'select stage_id from public.race_stage_simulation_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null and to_regclass('public.race_simulation_runs') is not null then
    execute 'select stage_id from public.race_simulation_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null and to_regclass('public.race_stage_runs') is not null then
    execute 'select stage_id from public.race_stage_runs where id = $1 limit 1'
      into v_stage_id
      using p_simulation_run_id;
  end if;

  if v_stage_id is null then
    raise exception 'Could not resolve stage_id for simulation_run_id %', p_simulation_run_id;
  end if;

  execute 'select race_id, coalesce(distance_km, 0)::numeric from public.race_stages where id = $1 limit 1'
    into v_race_id, v_stage_distance_km
    using v_stage_id;

  -- Best-effort applied game date. Keep nullable if no game-state table exists.
  if to_regclass('public.game_state') is not null then
    begin
      execute 'select current_game_date::date from public.game_state order by updated_at desc nulls last limit 1'
        into v_applied_game_date;
    exception when others then
      v_applied_game_date := null;
    end;
  end if;

  if v_applied_game_date is null then
    begin
      execute 'select coalesce(stage_date::date, race_date::date) from public.race_stages where id = $1 limit 1'
        into v_applied_game_date
        using v_stage_id;
    exception when others then
      v_applied_game_date := null;
    end;
  end if;

  /* ------------------------------------------------------------------
     Phase 11B universal-manifest path.

     Phase 9 owns resource calculations. For universal runs this writer does
     NOT recompute wear from mutable plans or staff. It applies the exact
     phase9ResourceUpdates already stored in the immutable application manifest.
     The existing race_engine_stage_wear_applications ledger remains the
     exact-once guard for equipment and assets.
     ------------------------------------------------------------------ */
  select coalesce(run.result_summary_json -> 'application_manifest', '{}'::jsonb)
  into v_manifest
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1';

  if coalesce(v_manifest ->> 'contractVersion', '') = 'universal_phase11_application_manifest_v1'
     and coalesce((v_manifest ->> 'readyForApplication')::boolean, false)
  then
    v_resource_updates := coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb);

    if jsonb_typeof(v_resource_updates) <> 'array' then
      raise exception 'Universal Phase 9 resource updates are not an array for run %', p_simulation_run_id;
    end if;

    select count(*)::integer
    into v_universal_candidate_count
    from jsonb_array_elements(v_resource_updates) item
    where item ->> 'resourceType' in ('equipment', 'asset');

    if p_dry_run then
      return jsonb_build_object(
        'status', 'ok',
        'version', 'phase11b_manifest_exact_v1',
        'dry_run', true,
        'simulation_run_id', p_simulation_run_id,
        'stage_id', v_stage_id,
        'race_id', v_race_id,
        'stage_distance_km', v_stage_distance_km,
        'manifest_resource_candidate_count', v_universal_candidate_count,
        'resource_updates', (
          select coalesce(jsonb_agg(item), '[]'::jsonb)
          from jsonb_array_elements(v_resource_updates) item
          where item ->> 'resourceType' in ('equipment', 'asset')
        )
      );
    end if;

    for v_resource_row in
      select item
      from jsonb_array_elements(v_resource_updates) item
      where item ->> 'resourceType' in ('equipment', 'asset')
      order by item ->> 'resourceType', item ->> 'resourceId'
    loop
      v_resource_type := v_resource_row ->> 'resourceType';
      v_resource_id := nullif(v_resource_row ->> 'resourceId', '')::uuid;
      v_team_id := nullif(v_resource_row ->> 'teamId', '')::uuid;
      v_condition_before := nullif(v_resource_row ->> 'conditionBefore', '')::numeric;
      v_condition_after := nullif(v_resource_row ->> 'conditionAfter', '')::numeric;
      v_condition_used := coalesce(
        nullif(v_resource_row ->> 'conditionUsed', '')::numeric,
        greatest(coalesce(v_condition_before, 0) - coalesce(v_condition_after, 0), 0)
      );

      if v_resource_id is null or v_condition_before is null or v_condition_after is null then
        raise exception 'Universal Phase 9 % resource row is incomplete: %', v_resource_type, v_resource_row;
      end if;

      if exists (
        select 1
        from public.race_engine_stage_wear_applications log
        where log.simulation_run_id = p_simulation_run_id
          and log.target_type = v_resource_type
          and log.target_id = v_resource_id
      ) then
        v_universal_already_applied := v_universal_already_applied + 1;
        continue;
      end if;

      if v_resource_type = 'equipment' then
        select inventory.condition_percent
        into v_current_condition
        from public.club_equipment_inventory inventory
        where inventory.id = v_resource_id
        for update;

        if not found then
          raise exception 'Phase 11B equipment resource % was not found.', v_resource_id;
        end if;

        if abs(coalesce(v_current_condition, 100) - v_condition_before) > 0.02 then
          raise exception 'Phase 11B equipment condition drift for %: current %, manifest before %.',
            v_resource_id, v_current_condition, v_condition_before;
        end if;

        insert into public.race_engine_stage_wear_applications (
          simulation_run_id, stage_id, race_id, club_id, target_type,
          target_table, target_id, target_key, condition_loss,
          applied_game_date, metadata
        ) values (
          p_simulation_run_id, v_stage_id, v_race_id, v_team_id, 'equipment',
          'club_equipment_inventory', v_resource_id,
          coalesce(
            (select inventory.equipment_category from public.club_equipment_inventory inventory where inventory.id = v_resource_id),
            'equipment'
          ),
          greatest(v_condition_used, 0), v_applied_game_date,
          jsonb_build_object(
            'source', 'phase11b_universal_application_manifest',
            'condition_before', v_condition_before,
            'condition_after', v_condition_after,
            'stage_distance_km', v_stage_distance_km,
            'resource_update', v_resource_row
          )
        ) on conflict do nothing;

        if found then
          v_universal_log_inserted := v_universal_log_inserted + 1;

          update public.club_equipment_inventory inventory
          set
            condition_percent = greatest(0, least(100, v_condition_after)),
            last_used_game_date = coalesce(v_applied_game_date, inventory.last_used_game_date),
            total_distance_km = coalesce(inventory.total_distance_km, 0) + v_stage_distance_km,
            total_race_days = coalesce(inventory.total_race_days, 0) + 1
          where inventory.id = v_resource_id;

          v_universal_equipment_updated := v_universal_equipment_updated + 1;
        else
          v_universal_already_applied := v_universal_already_applied + 1;
        end if;
      else
        v_asset_key := coalesce(
          (select run.input_snapshot_json #>> array['preparation','assets',v_resource_id::text,'assetKey']
           from public.race_stage_simulation_runs run where run.id = p_simulation_run_id),
          ''
        );

        v_asset_table := case lower(v_asset_key)
          when 'team_car' then 'club_team_cars'
          when 'car' then 'club_team_cars'
          when 'team_bus' then 'club_team_buses'
          when 'bus' then 'club_team_buses'
          when 'equipment_van' then 'club_equipment_vans'
          when 'van' then 'club_equipment_vans'
          when 'mobile_workshop' then 'club_mobile_workshops'
          when 'workshop' then 'club_mobile_workshops'
          when 'medical_van' then 'club_medical_vans'
          when 'medical' then 'club_medical_vans'
          else null
        end;

        if v_asset_table is null then
          raise exception 'Phase 11B asset % has unsupported asset key %.', v_resource_id, v_asset_key;
        end if;

        execute format('select condition_percent from public.%I where id = $1 for update', v_asset_table)
          into v_current_condition
          using v_resource_id;

        if not found then
          raise exception 'Phase 11B asset % was not found in %.', v_resource_id, v_asset_table;
        end if;

        if abs(coalesce(v_current_condition, 100) - v_condition_before) > 0.02 then
          raise exception 'Phase 11B asset condition drift for %: current %, manifest before %.',
            v_resource_id, v_current_condition, v_condition_before;
        end if;

        insert into public.race_engine_stage_wear_applications (
          simulation_run_id, stage_id, race_id, club_id, target_type,
          target_table, target_id, target_key, condition_loss,
          applied_game_date, metadata
        ) values (
          p_simulation_run_id, v_stage_id, v_race_id, v_team_id, 'asset',
          v_asset_table, v_resource_id, v_asset_key,
          greatest(v_condition_used, 0), v_applied_game_date,
          jsonb_build_object(
            'source', 'phase11b_universal_application_manifest',
            'condition_before', v_condition_before,
            'condition_after', v_condition_after,
            'stage_distance_km', v_stage_distance_km,
            'resource_update', v_resource_row
          )
        ) on conflict do nothing;

        if found then
          v_universal_log_inserted := v_universal_log_inserted + 1;
          v_universal_sql := format(
            'update public.%I set condition_percent = greatest(0, least(100, $1)), last_used_game_date = coalesce($2, last_used_game_date), total_distance_km = coalesce(total_distance_km, 0) + $3, total_race_days = coalesce(total_race_days, 0) + 1, updated_at = clock_timestamp() where id = $4',
            v_asset_table
          );
          execute v_universal_sql
            using v_condition_after, v_applied_game_date, v_stage_distance_km, v_resource_id;
          v_universal_asset_updated := v_universal_asset_updated + 1;
        else
          v_universal_already_applied := v_universal_already_applied + 1;
        end if;
      end if;
    end loop;

    return jsonb_build_object(
      'status', 'ok',
      'version', 'phase11b_manifest_exact_v1',
      'dry_run', false,
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id,
      'race_id', v_race_id,
      'manifest_resource_candidate_count', v_universal_candidate_count,
      'equipment_updated_count', v_universal_equipment_updated,
      'asset_updated_count', v_universal_asset_updated,
      'wear_log_inserted_count', v_universal_log_inserted,
      'already_applied_count', v_universal_already_applied
    );
  end if;

  -- v8.4: if a previous failed function call left this temp table in the
  -- same SQL editor/session transaction, recreate it cleanly.
  drop table if exists pg_temp.tmp_stage_equipment_plan_sources;

  create temp table tmp_stage_equipment_plan_sources (
    club_id uuid not null,
    rider_id uuid null,
    source_value_id uuid null,
    source_kind text not null
  ) on commit drop;

  -- -------------------------------------------------------------------
  -- Stage-plan source, schema-safe.
  -- Important: do not reference rsp.club_id or rsp.rider_id directly.
  -- row_to_json(rsp) returns only real columns, so missing fields become NULL.
  -- -------------------------------------------------------------------
  insert into tmp_stage_equipment_plan_sources (club_id, rider_id, source_value_id, source_kind)
  select distinct
    resolved.club_id,
    resolved.rider_id,
    resolved.source_value_id,
    'stage_plan_json'::text
  from public.race_stage_plans rsp
  cross join lateral (select row_to_json(rsp)::jsonb as rspj) rsp_json
  cross join lateral (
    select
      coalesce(
        nullif(rsp_json.rspj->>'race_preparation_id', ''),
        nullif(rsp_json.rspj->>'preparation_id', ''),
        nullif(rsp_json.rspj->>'race_plan_id', ''),
        nullif(rsp_json.rspj->>'race_preparation', '')
      ) as preparation_id_text,
      coalesce(
        nullif(rsp_json.rspj->>'rider_id', ''),
        nullif(rsp_json.rspj->>'selected_rider_id', ''),
        nullif(rsp_json.rspj->>'club_rider_id', '')
      ) as rider_id_text,
      coalesce(
        nullif(rsp_json.rspj #>> '{rider_equipment_json,id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,setup_id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,preset_id}', ''),
        nullif(rsp_json.rspj #>> '{rider_equipment_json,equipment_setup_id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_json,id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_json,setup_id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_setup_json,id}', ''),
        nullif(rsp_json.rspj #>> '{equipment_preset_json,id}', '')
      ) as source_value_text
  ) raw_values
  left join public.race_preparations rp
    on row_to_json(rp)::jsonb->>'id' = raw_values.preparation_id_text
  cross join lateral (
    select
      coalesce(
        nullif(rsp_json.rspj->>'club_id', ''),
        nullif(rsp_json.rspj->>'team_id', ''),
        nullif(row_to_json(rp)::jsonb->>'club_id', ''),
        nullif(row_to_json(rp)::jsonb #>> '{metadata,participating_club_id}', '')
      ) as club_id_text
  ) club_source
  cross join lateral (
    select
      case
        when club_source.club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then club_source.club_id_text::uuid
        else null
      end as club_id,
      case
        when raw_values.rider_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then raw_values.rider_id_text::uuid
        else null
      end as rider_id,
      case
        when raw_values.source_value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then raw_values.source_value_text::uuid
        else null
      end as source_value_id
  ) resolved
  where rsp.stage_id = v_stage_id
    and resolved.club_id is not null
    and (
      resolved.rider_id is not null
      or resolved.source_value_id is not null
      or rsp_json.rspj ? 'rider_equipment_json'
      or rsp_json.rspj ? 'equipment_json'
      or rsp_json.rspj ? 'equipment_setup_json'
      or rsp_json.rspj ? 'equipment_preset_json'
    );

  get diagnostics v_inserted_direct_plan_rows = row_count;

  -- -------------------------------------------------------------------
  -- Race-preparation source, schema-safe.
  -- Important: do not reference rpr.rider_id directly. Use row_to_json.
  -- This fallback is necessary because the current race_stage_plans table is
  -- not one-row-per-rider in this DB.
  -- -------------------------------------------------------------------
  if to_regclass('public.race_preparation_riders') is not null then
    insert into tmp_stage_equipment_plan_sources (club_id, rider_id, source_value_id, source_kind)
    select distinct
      resolved.club_id,
      resolved.rider_id,
      resolved.source_value_id,
      'race_preparation_riders'::text
    from public.race_preparation_riders rpr
    cross join lateral (select row_to_json(rpr)::jsonb as rprj) rpr_json
    join public.race_preparations rp
      on row_to_json(rp)::jsonb->>'id' = coalesce(
        nullif(rpr_json.rprj->>'race_preparation_id', ''),
        nullif(rpr_json.rprj->>'preparation_id', ''),
        nullif(rpr_json.rprj->>'race_plan_id', '')
      )
    cross join lateral (select row_to_json(rp)::jsonb as rpj) rp_json
    cross join lateral (
      select
        coalesce(
          nullif(rp_json.rpj->>'club_id', ''),
          nullif(rp_json.rpj #>> '{metadata,participating_club_id}', '')
        ) as club_id_text,
        coalesce(
          nullif(rpr_json.rprj->>'rider_id', ''),
          nullif(rpr_json.rprj->>'selected_rider_id', ''),
          nullif(rpr_json.rprj->>'club_rider_id', '')
        ) as rider_id_text,
        coalesce(
          nullif(rpr_json.rprj #>> '{rider_equipment_json,id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,setup_id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,preset_id}', ''),
          nullif(rpr_json.rprj #>> '{rider_equipment_json,equipment_setup_id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_json,id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_json,setup_id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_setup_json,id}', ''),
          nullif(rpr_json.rprj #>> '{equipment_preset_json,id}', '')
        ) as source_value_text
    ) raw_values
    cross join lateral (
      select
        case
          when raw_values.club_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.club_id_text::uuid
          else null
        end as club_id,
        case
          when raw_values.rider_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.rider_id_text::uuid
          else null
        end as rider_id,
        case
          when raw_values.source_value_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then raw_values.source_value_text::uuid
          else null
        end as source_value_id
    ) resolved
    where rp_json.rpj->>'race_id' = v_race_id::text
      and resolved.club_id is not null
      and resolved.rider_id is not null;

    get diagnostics v_inserted_prep_plan_rows = row_count;
  end if;

  select count(*) into v_inserted_plan_rows from tmp_stage_equipment_plan_sources;

  -- v8.4: same safety for the candidate temp table.
  drop table if exists pg_temp.tmp_stage_equipment_wear_candidates;

  create temp table tmp_stage_equipment_wear_candidates (
    inventory_item_id uuid primary key,
    club_id uuid,
    catalog_item_id uuid,
    equipment_category text,
    display_name text,
    rider_use_count integer,
    allocated_physical_use_count integer,
    planned_loss numeric,
    already_applied boolean,
    pending_loss numeric,
    match_type text,
    source_value_id uuid
  ) on commit drop;

  -- -------------------------------------------------------------------
  -- Equipment matching strategy v8.5:
  -- 1) Count planned riders per club from schema-safe plan sources.
  -- 2) If equipment wear was already logged for this simulation run, treat
  --    those logged physical inventory rows as the fixed candidate set.
  --    This prevents a post-apply dry-run from selecting different equipment
  --    after condition_percent changed.
  -- 3) Only fill missing slots per club/category from unlogged inventory.
  -- 4) Limit setup/preset equipment matching to one physical item per rider
  --    per category.
  -- -------------------------------------------------------------------
  insert into tmp_stage_equipment_wear_candidates (
    inventory_item_id,
    club_id,
    catalog_item_id,
    equipment_category,
    display_name,
    rider_use_count,
    allocated_physical_use_count,
    planned_loss,
    already_applied,
    pending_loss,
    match_type,
    source_value_id
  )
  with planned_riders as (
    select
      club_id,
      greatest(1, count(distinct rider_id))::integer as rider_count,
      (array_agg(source_value_id order by source_value_id::text nulls last))[1] as source_value_id
    from tmp_stage_equipment_plan_sources
    where club_id is not null
      and rider_id is not null
    group by club_id
  ),
  required_categories as (
    select
      pr.club_id,
      pr.rider_count,
      pr.source_value_id,
      c.equipment_category
    from planned_riders pr
    cross join unnest(v_categories) as c(equipment_category)
  ),
  equipment_catalog_rows as (
    select
      ec.id as catalog_item_id,
      lower(coalesce(
        nullif(ecj->>'equipment_category', ''),
        nullif(ecj->>'category', ''),
        nullif(ecj->>'item_category', ''),
        nullif(ecj->>'type', '')
      )) as equipment_category,
      coalesce(
        nullif(ecj->>'display_name', ''),
        nullif(ecj->>'name', ''),
        nullif(ecj->>'item_name', ''),
        nullif(ecj->>'model_name', ''),
        nullif(ecj->>'model', ''),
        nullif(ecj->>'brand', ''),
        ec.id::text
      ) as display_name,
      case
        when coalesce(
          nullif(ecj->>'condition_loss_per_race_day', ''),
          nullif(ecj->>'wear_per_race_day', ''),
          nullif(ecj->>'condition_loss', ''),
          nullif(ecj->>'race_day_condition_loss', '')
        ) ~ '^[0-9]+(\.[0-9]+)?$'
        then coalesce(
          nullif(ecj->>'condition_loss_per_race_day', ''),
          nullif(ecj->>'wear_per_race_day', ''),
          nullif(ecj->>'condition_loss', ''),
          nullif(ecj->>'race_day_condition_loss', '')
        )::numeric
        else 0::numeric
      end as condition_loss_per_race_day
    from public.equipment_catalog ec
    cross join lateral (select row_to_json(ec)::jsonb as ecj) j
  ),
  logged_equipment as (
    select
      wea.target_id as inventory_item_id,
      coalesce(wea.club_id, cei.club_id) as club_id,
      cei.catalog_item_id,
      lower(coalesce(cei.equipment_category, ecr.equipment_category, wea.target_key)) as equipment_category,
      coalesce(nullif(cei.display_name, ''), ecr.display_name, wea.target_id::text) as display_name,
      rc.rider_count as rider_use_count,
      rc.rider_count as allocated_physical_use_count,
      coalesce(wea.condition_loss, 0)::numeric(10,3) as planned_loss,
      'setup_preset_limited'::text as match_type,
      rc.source_value_id,
      true as already_applied,
      0::numeric(10,3) as pending_loss,
      0 as source_priority
    from public.race_engine_stage_wear_applications wea
    join public.club_equipment_inventory cei
      on cei.id = wea.target_id
    left join equipment_catalog_rows ecr
      on ecr.catalog_item_id = cei.catalog_item_id
    join required_categories rc
      on rc.club_id = coalesce(wea.club_id, cei.club_id)
     and rc.equipment_category = lower(coalesce(cei.equipment_category, ecr.equipment_category, wea.target_key))
    where wea.simulation_run_id = p_simulation_run_id
      and wea.target_type = 'equipment'
      and wea.target_table = 'club_equipment_inventory'
  ),
  logged_counts as (
    select
      club_id,
      equipment_category,
      count(*)::integer as logged_count
    from logged_equipment
    group by club_id, equipment_category
  ),
  ranked_unlogged_inventory as (
    select
      cei.id as inventory_item_id,
      cei.club_id,
      cei.catalog_item_id,
      lower(coalesce(cei.equipment_category, ecr.equipment_category)) as equipment_category,
      coalesce(nullif(cei.display_name, ''), ecr.display_name, cei.id::text) as display_name,
      ecr.condition_loss_per_race_day,
      row_number() over (
        partition by cei.club_id, lower(coalesce(cei.equipment_category, ecr.equipment_category))
        order by
          coalesce(cei.condition_percent, 100) desc,
          cei.id::text asc
      ) as physical_rank
    from public.club_equipment_inventory cei
    join equipment_catalog_rows ecr on ecr.catalog_item_id = cei.catalog_item_id
    left join public.race_engine_stage_wear_applications existing_log
      on existing_log.simulation_run_id = p_simulation_run_id
     and existing_log.target_type = 'equipment'
     and existing_log.target_table = 'club_equipment_inventory'
     and existing_log.target_id = cei.id
    where cei.club_id in (select club_id from planned_riders)
      and lower(coalesce(cei.equipment_category, ecr.equipment_category)) = any(v_categories)
      and coalesce(cei.condition_percent, 100) > 0
      and existing_log.id is null
  ),
  fill_candidates as (
    select
      rui.inventory_item_id,
      rui.club_id,
      rui.catalog_item_id,
      rui.equipment_category,
      rui.display_name,
      rc.rider_count as rider_use_count,
      rc.rider_count as allocated_physical_use_count,
      greatest(
        0,
        (v_stage_distance_km / 100.0)
        * coalesce(nullif(rui.condition_loss_per_race_day, 0), 0.35)
        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(rui.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,3) as planned_loss,
      'setup_preset_limited'::text as match_type,
      rc.source_value_id,
      false as already_applied,
      greatest(
        0,
        (v_stage_distance_km / 100.0)
        * coalesce(nullif(rui.condition_loss_per_race_day, 0), 0.35)
        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(rui.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,3) as pending_loss,
      1 as source_priority
    from required_categories rc
    join ranked_unlogged_inventory rui
      on rui.club_id = rc.club_id
     and rui.equipment_category = rc.equipment_category
    left join logged_counts lc
      on lc.club_id = rc.club_id
     and lc.equipment_category = rc.equipment_category
    where rui.physical_rank <= greatest(0, rc.rider_count - coalesce(lc.logged_count, 0))
  ),
  raw_candidates as (
    select * from logged_equipment
    union all
    select * from fill_candidates
  ),
  consolidated as (
    select distinct on (rc.inventory_item_id)
      rc.inventory_item_id,
      rc.club_id,
      rc.catalog_item_id,
      rc.equipment_category,
      rc.display_name,
      rc.rider_use_count,
      rc.allocated_physical_use_count,
      rc.planned_loss,
      rc.already_applied,
      rc.pending_loss,
      rc.match_type,
      rc.source_value_id
    from raw_candidates rc
    order by rc.inventory_item_id, rc.source_priority, rc.equipment_category
  )
  select
    c.inventory_item_id,
    c.club_id,
    c.catalog_item_id,
    c.equipment_category,
    c.display_name,
    c.rider_use_count,
    c.allocated_physical_use_count,
    c.planned_loss,
    c.already_applied,
    c.pending_loss,
    c.match_type,
    c.source_value_id
  from consolidated c;

  -- p_dry_run=true is the safe/default path and performs no writes.
  if not p_dry_run then
    insert into public.race_engine_stage_wear_applications (
      simulation_run_id,
      stage_id,
      race_id,
      club_id,
      target_type,
      target_table,
      target_id,
      target_key,
      condition_loss,
      applied_game_date,
      metadata
    )
    select
      p_simulation_run_id,
      v_stage_id,
      v_race_id,
      c.club_id,
      'equipment',
      'club_equipment_inventory',
      c.inventory_item_id,
      c.equipment_category,
      c.pending_loss,
      v_applied_game_date,
      jsonb_build_object(
        'source', 'race_engine_stage_interactions_v8_5',
        'match_type', c.match_type,
        'catalog_item_id', c.catalog_item_id,
        'source_value_id', c.source_value_id,
        'display_name', c.display_name,
        'stage_distance_km', v_stage_distance_km,
        'rider_use_count', c.rider_use_count,
        'allocated_physical_use_count', c.allocated_physical_use_count
      )
    from tmp_stage_equipment_wear_candidates c
    where c.pending_loss > 0
      and c.already_applied = false
    on conflict (simulation_run_id, target_type, target_table, target_id) do nothing;

    get diagnostics v_inserted_equipment_log_count = row_count;

    update public.club_equipment_inventory cei
    set
      condition_percent = greatest(0, coalesce(cei.condition_percent, 100) - c.pending_loss),
      last_used_game_date = coalesce(v_applied_game_date, cei.last_used_game_date),
      total_distance_km = coalesce(cei.total_distance_km, 0) + v_stage_distance_km,
      total_race_days = coalesce(cei.total_race_days, 0) + 1
    from tmp_stage_equipment_wear_candidates c
    join public.race_engine_stage_wear_applications wea
      on wea.simulation_run_id = p_simulation_run_id
     and wea.target_type = 'equipment'
     and wea.target_table = 'club_equipment_inventory'
     and wea.target_id = c.inventory_item_id
     and wea.metadata->>'source' = 'race_engine_stage_interactions_v8_5'
    where cei.id = c.inventory_item_id
      and c.pending_loss > 0
      and c.already_applied = false;

    get diagnostics v_updated_equipment_count = row_count;
  end if;

  v_result := jsonb_build_object(
    'status', 'ok',
    'version', 'v8_5_log_locked_equipment_candidates',
    'dry_run', p_dry_run,
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'race_id', v_race_id,
    'stage_distance_km', v_stage_distance_km,
    'plan_source_rows', v_inserted_plan_rows,
    'plan_source_rows_from_stage_plan_json', v_inserted_direct_plan_rows,
    'plan_source_rows_from_race_preparation_riders', v_inserted_prep_plan_rows,
    'plan_sources_by_kind', coalesce((
      select jsonb_agg(jsonb_build_object('source_kind', source_kind, 'rows', rows, 'riders', riders) order by source_kind)
      from (
        select source_kind, count(*) as rows, count(distinct rider_id) as riders
        from tmp_stage_equipment_plan_sources
        group by source_kind
      ) s
    ), '[]'::jsonb),
    'planned_riders_by_club', coalesce((
      select jsonb_agg(jsonb_build_object('club_id', club_id, 'rider_count', rider_count) order by club_id::text)
      from (
        select club_id, count(distinct rider_id) as rider_count
        from tmp_stage_equipment_plan_sources
        where rider_id is not null
        group by club_id
      ) pr
    ), '[]'::jsonb),
    'equipment_candidate_count', (select count(*) from tmp_stage_equipment_wear_candidates),
    'equipment_pending_count', (select count(*) from tmp_stage_equipment_wear_candidates where pending_loss > 0),
    'equipment_already_applied_count', (select count(*) from tmp_stage_equipment_wear_candidates where already_applied),
    'equipment_updated_count', v_updated_equipment_count,
    'equipment_log_inserted_count', v_inserted_equipment_log_count,
    'asset_existing_log_count', (
      select count(*)
      from public.race_engine_stage_wear_applications wea
      where wea.simulation_run_id = p_simulation_run_id
        and wea.target_type = 'asset'
    ),
    'asset_existing_logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'target_table', wea.target_table,
          'target_id', wea.target_id,
          'target_key', wea.target_key,
          'condition_loss', wea.condition_loss,
          'already_applied', true,
          'pending_loss', 0,
          'applied_game_date', wea.applied_game_date,
          'metadata', wea.metadata
        )
        order by wea.target_table, wea.target_key, wea.target_id::text
      )
      from public.race_engine_stage_wear_applications wea
      where wea.simulation_run_id = p_simulation_run_id
        and wea.target_type = 'asset'
    ), '[]'::jsonb),
    'equipment_candidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'inventory_item_id', c.inventory_item_id,
          'club_id', c.club_id,
          'catalog_item_id', c.catalog_item_id,
          'equipment_category', c.equipment_category,
          'display_name', c.display_name,
          'rider_use_count', c.rider_use_count,
          'allocated_physical_use_count', c.allocated_physical_use_count,
          'planned_loss', c.planned_loss,
          'already_applied', c.already_applied,
          'pending_loss', c.pending_loss,
          'match_type', c.match_type,
          'source_value_id', c.source_value_id
        )
        order by c.club_id::text, c.equipment_category, c.display_name, c.inventory_item_id::text
      )
      from tmp_stage_equipment_wear_candidates c
    ), '[]'::jsonb),
    'debug_schema_columns', coalesce((
      select jsonb_object_agg(table_name, columns)
      from (
        select
          table_name,
          jsonb_agg(column_name order by ordinal_position) as columns
        from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            'race_stage_plans',
            'race_preparation_riders',
            'race_preparations',
            'club_equipment_inventory',
            'equipment_catalog'
          )
        group by table_name
      ) c
    ), '{}'::jsonb)
  );

  return v_result;
end;
$function$
