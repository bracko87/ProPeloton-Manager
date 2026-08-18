-- Phase 9 production input adapter v3
-- Adds authoritative Stage Plan JSON fallbacks and the real club Default Race Setup.
-- Runtime remains read-only: no resource mutation or race result persistence occurs here.

create or replace function public.race_engine_get_stage_phase9_inputs_v1(
  p_stage_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with
canonical_modifiers as (
  select *
  from public.race_engine_get_stage_rider_preparation_modifiers_v2(p_stage_id)
),
stage_context as (
  select
    stage.id as stage_id,
    lower(
      coalesce(
        nullif(to_jsonb(stage) ->> 'stage_format', ''),
        nullif(to_jsonb(stage) ->> 'stage_type', ''),
        nullif(to_jsonb(stage) ->> 'format', ''),
        'road_race'
      )
    ) as stage_format,
    lower(
      coalesce(
        nullif(to_jsonb(stage) ->> 'terrain_type', ''),
        nullif(to_jsonb(stage) ->> 'profile_type', ''),
        'flat'
      )
    ) as terrain_type
  from public.race_stages stage
  where stage.id = p_stage_id
),
stage_plans as (
  select
    rsp.id as stage_plan_id,
    rsp.race_id,
    rsp.stage_id,
    rsp.race_preparation_id,
    coalesce(rp.participating_club_id, rp.club_id) as team_id,
    rp.status as preparation_status,
    rp.default_equipment_setup_id,
    coalesce(rsp.rider_equipment_json, '{}'::jsonb) as rider_equipment_json,
    coalesce(rsp.rider_supplies_json, '{}'::jsonb) as rider_supplies_json,
    coalesce(rsp.bonus_snapshot_json, '{}'::jsonb) as stage_bonus_snapshot_json,
    rp.validation_snapshot_json,
    rp.engine_payload_json
  from public.race_stage_plans rsp
  join public.race_preparations rp
    on rp.id = rsp.race_preparation_id
  where rsp.stage_id = p_stage_id
    and lower(coalesce(rp.status, '')) in (
      'submitted', 'locked', 'final', 'finalized', 'completed'
    )
),
team_rider_counts as (
  select team_id, count(*)::numeric as rider_count
  from canonical_modifiers
  group by team_id
),
plan_rider_snapshots as (
  select
    sp.stage_plan_id,
    sp.team_id,
    spr.id as stage_plan_rider_id,
    spr.rider_id,
    spr.equipment_setup_id,
    spr.equipment_bonus_snapshot_json,
    spr.final_bonus_snapshot_json,
    spr.rider_stage_snapshot_json
  from stage_plans sp
  join public.race_stage_plan_riders spr
    on spr.race_stage_plan_id = sp.stage_plan_id
),
rider_equipment_sources as (
  select
    modifier.team_id,
    modifier.rider_id,
    sp.stage_plan_id,
    sp.race_preparation_id,
    snapshot.stage_plan_rider_id,
    snapshot.equipment_setup_id as child_equipment_setup_id,
    sp.default_equipment_setup_id as preparation_default_setup_id,
    snapshot.equipment_bonus_snapshot_json,
    snapshot.final_bonus_snapshot_json,
    snapshot.rider_stage_snapshot_json,
    case
      when sp.stage_plan_id is null then null
      when jsonb_typeof(sp.rider_equipment_json -> modifier.rider_id::text) = 'string'
        then nullif(trim(sp.rider_equipment_json ->> modifier.rider_id::text), '')
      when jsonb_typeof(sp.rider_equipment_json -> modifier.rider_id::text) = 'object'
        then coalesce(
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'preset_id', ''),
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'equipment_setup_id', ''),
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'setup_id', ''),
          nullif(sp.rider_equipment_json -> modifier.rider_id::text ->> 'id', '')
        )
      else null
    end as direct_stage_setup_text,
    case
      when sp.stage_plan_id is not null
       and sp.rider_equipment_json ? modifier.rider_id::text
        then true
      else false
    end as has_direct_stage_equipment_assignment
  from canonical_modifiers modifier
  left join stage_plans sp
    on sp.team_id = modifier.team_id
  left join plan_rider_snapshots snapshot
    on snapshot.stage_plan_id = sp.stage_plan_id
   and snapshot.rider_id = modifier.rider_id
),
resolved_rider_setup as (
  select
    source.*,
    case
      when source.child_equipment_setup_id is not null
        then source.child_equipment_setup_id
      when coalesce(source.direct_stage_setup_text, '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then source.direct_stage_setup_text::uuid
      when source.preparation_default_setup_id is not null
        then source.preparation_default_setup_id
      else null
    end as resolved_preset_id,
    case
      when source.child_equipment_setup_id is not null
        then 'race_stage_plan_riders.equipment_setup_id'
      when source.has_direct_stage_equipment_assignment
        then 'race_stage_plans.rider_equipment_json'
      when source.preparation_default_setup_id is not null
        then 'race_preparations.default_equipment_setup_id'
      else 'club_equipment_default_setup'
    end as requested_source
  from rider_equipment_sources source
),
resolved_equipment_catalogs as (
  select
    rider.team_id,
    rider.rider_id,
    rider.stage_plan_id,
    rider.stage_plan_rider_id,
    rider.resolved_preset_id,
    rider.requested_source,
    rider.has_direct_stage_equipment_assignment,
    rider.equipment_bonus_snapshot_json,
    rider.final_bonus_snapshot_json,
    rider.rider_stage_snapshot_json,
    coalesce(preset.frame_catalog_item_id, defaults.frame_catalog_item_id) as frame_catalog_item_id,
    coalesce(preset.wheelset_catalog_item_id, defaults.wheelset_catalog_item_id) as wheelset_catalog_item_id,
    coalesce(preset.tires_catalog_item_id, defaults.tires_catalog_item_id) as tires_catalog_item_id,
    coalesce(preset.groupset_catalog_item_id, defaults.groupset_catalog_item_id) as groupset_catalog_item_id,
    coalesce(preset.helmet_catalog_item_id, defaults.helmet_catalog_item_id) as helmet_catalog_item_id,
    coalesce(preset.shoes_catalog_item_id, defaults.shoes_catalog_item_id) as shoes_catalog_item_id,
    case
      when preset.id is not null then rider.requested_source
      when defaults.club_id is not null then 'club_equipment_default_setup'
      else 'no_equipment_setup_available'
    end as resolved_source
  from resolved_rider_setup rider
  left join public.club_equipment_setup_presets preset
    on preset.id = rider.resolved_preset_id
   and preset.club_id = rider.team_id
  left join public.club_equipment_default_setup defaults
    on defaults.club_id = rider.team_id
),
equipment_preview as (
  select
    catalog.*,
    case
      when catalog.frame_catalog_item_id is null
       and catalog.wheelset_catalog_item_id is null
       and catalog.tires_catalog_item_id is null
       and catalog.groupset_catalog_item_id is null
       and catalog.helmet_catalog_item_id is null
       and catalog.shoes_catalog_item_id is null
        then '{}'::jsonb
      else public.equipment_calculate_catalog_setup_bonus_preview(
        catalog.frame_catalog_item_id,
        catalog.wheelset_catalog_item_id,
        catalog.tires_catalog_item_id,
        catalog.groupset_catalog_item_id,
        catalog.helmet_catalog_item_id,
        catalog.shoes_catalog_item_id
      )
    end as calculated_bonus_preview
  from resolved_equipment_catalogs catalog
),
equipment_effect_source as (
  select
    preview.*,
    coalesce(
      jsonb_path_query_first(
        coalesce(preview.equipment_bonus_snapshot_json, '{}'::jsonb),
        '$.**.weighted_bonuses'
      ),
      jsonb_path_query_first(
        coalesce(preview.final_bonus_snapshot_json, '{}'::jsonb),
        '$.**.weighted_bonuses'
      ),
      preview.calculated_bonus_preview -> 'weighted_bonuses',
      '{}'::jsonb
    ) as weighted_bonuses,
    case
      when context.stage_format ~ '(itt|ttt|time_trial|time trial|prologue)'
        then 'time_trial_bonus_pct'
      when context.terrain_type ~ '(mountain|climb|summit|steep)'
        then 'mountain_bonus_pct'
      when context.terrain_type ~ '(hilly|rolling|undulating)'
        then 'hilly_bonus_pct'
      when context.terrain_type ~ '(cobble|pav[eé])'
        then 'cobble_bonus_pct'
      else 'flat_bonus_pct'
    end as stage_bonus_key
  from equipment_preview preview
  cross join stage_context context
),
rider_equipment_bonus as (
  select
    source.rider_id,
    source.team_id,
    greatest(
      -5::numeric,
      least(
        5::numeric,
        coalesce(
          nullif(source.weighted_bonuses ->> source.stage_bonus_key, '')::numeric,
          0
        ) * 5
      )
    ) as equipment_performance_bonus_points,
    0::numeric as equipment_suitability_bonus_points,
    greatest(
      0::numeric,
      least(
        10::numeric,
        coalesce(
          nullif(source.weighted_bonuses ->> 'fatigue_reduction_pct', '')::numeric,
          0
        ) * 5
      )
    ) as equipment_fatigue_reduction_pct,
    source.stage_bonus_key,
    source.resolved_source as bonus_source
  from equipment_effect_source source
),
equipment_selections as (
  select
    source.stage_plan_id,
    source.team_id,
    source.stage_plan_rider_id,
    source.rider_id,
    source.resolved_preset_id as equipment_setup_id,
    source.resolved_source,
    chosen.equipment_category,
    chosen.catalog_item_id,
    row_number() over (
      partition by
        source.team_id,
        chosen.equipment_category,
        chosen.catalog_item_id
      order by source.rider_id::text
    ) as physical_rank
  from resolved_equipment_catalogs source
  cross join lateral (
    values
      ('frame'::text, source.frame_catalog_item_id),
      ('wheelset'::text, source.wheelset_catalog_item_id),
      ('tires'::text, source.tires_catalog_item_id),
      ('groupset'::text, source.groupset_catalog_item_id),
      ('helmet'::text, source.helmet_catalog_item_id),
      ('shoes'::text, source.shoes_catalog_item_id)
  ) as chosen(equipment_category, catalog_item_id)
  where chosen.catalog_item_id is not null
),
equipment_inventory as (
  select
    inventory.*,
    row_number() over (
      partition by
        inventory.club_id,
        inventory.equipment_category,
        inventory.catalog_item_id
      order by
        inventory.condition_percent desc,
        inventory.id::text
    ) as physical_rank
  from public.club_equipment_inventory inventory
  where lower(coalesce(inventory.status, '')) = 'ready'
    and inventory.condition_percent > 0
    and inventory.sold_game_date is null
    and inventory.discarded_game_date is null
),
allocated_equipment as (
  select
    selection.team_id,
    selection.rider_id,
    selection.stage_plan_rider_id,
    selection.equipment_setup_id,
    selection.resolved_source,
    selection.equipment_category,
    selection.catalog_item_id,
    inventory.id as inventory_id,
    inventory.display_name,
    inventory.quality_score,
    inventory.durability_score,
    inventory.condition_percent
  from equipment_selections selection
  join equipment_inventory inventory
    on inventory.club_id = selection.team_id
   and inventory.equipment_category = selection.equipment_category
   and inventory.catalog_item_id = selection.catalog_item_id
   and inventory.physical_rank = selection.physical_rank
),
equipment_json as (
  select coalesce(
    jsonb_object_agg(
      allocated.inventory_id::text,
      jsonb_build_object(
        'teamId', allocated.team_id,
        'riderId', allocated.rider_id,
        'condition', allocated.condition_percent,
        'intensity', 1,
        'category', allocated.equipment_category,
        'catalogItemId', allocated.catalog_item_id,
        'equipmentSetupId', allocated.equipment_setup_id,
        'displayName', allocated.display_name,
        'qualityScore', allocated.quality_score,
        'durabilityScore', allocated.durability_score,
        'source', allocated.resolved_source
      )
      order by allocated.inventory_id::text
    ),
    '{}'::jsonb
  ) as value
  from allocated_equipment allocated
),
explicit_stage_supply_rows as (
  select
    sp.team_id,
    supply.id as stage_supply_id,
    supply.supply_key,
    greatest(0, supply.quantity_planned) as quantity_planned,
    greatest(0, supply.quantity_consumed) as quantity_consumed,
    supply.supply_snapshot_json,
    supply.bonus_snapshot_json,
    inventory.quantity_available,
    'race_stage_plan_supplies'::text as supply_source
  from stage_plans sp
  join public.race_stage_plan_supplies supply
    on supply.race_stage_plan_id = sp.stage_plan_id
  left join public.club_race_supplies inventory
    on inventory.club_id = sp.team_id
   and inventory.supply_key = supply.supply_key
),
direct_supply_rider_rows as (
  select
    sp.team_id,
    rider_entry.key as rider_id_text,
    rider_entry.value as rider_supplies,
    case
      when coalesce(rider_entry.value ->> 'bidons', rider_entry.value ->> 'bidons_water_bottles', '0') ~ '^[0-9]+$'
        then coalesce(rider_entry.value ->> 'bidons', rider_entry.value ->> 'bidons_water_bottles', '0')::integer
      else 0
    end as bidons,
    case
      when coalesce(rider_entry.value ->> 'gels', rider_entry.value ->> 'energy_gels', '0') ~ '^[0-9]+$'
        then coalesce(rider_entry.value ->> 'gels', rider_entry.value ->> 'energy_gels', '0')::integer
      else 0
    end as energy_gels,
    case
      when coalesce(rider_entry.value ->> 'nutrition_packs', '0') ~ '^[0-9]+$'
        then coalesce(rider_entry.value ->> 'nutrition_packs', '0')::integer
      else 0
    end as nutrition_packs,
    case
      when lower(coalesce(rider_entry.value ->> 'race_jersey_complete', 'false')) in ('true', '1', 'yes') then 1
      when coalesce(rider_entry.value ->> 'race_jersey_complete', '0') ~ '^[0-9]+$'
        then least(1, coalesce(rider_entry.value ->> 'race_jersey_complete', '0')::integer)
      else 0
    end as race_jersey_complete,
    case
      when lower(coalesce(rider_entry.value ->> 'rain_jacket', rider_entry.value ->> 'rain_jackets', 'false')) in ('true', '1', 'yes') then 1
      when coalesce(rider_entry.value ->> 'rain_jacket', rider_entry.value ->> 'rain_jackets', '0') ~ '^[0-9]+$'
        then least(1, coalesce(rider_entry.value ->> 'rain_jacket', rider_entry.value ->> 'rain_jackets', '0')::integer)
      else 0
    end as rain_jackets
  from stage_plans sp
  cross join lateral jsonb_each(coalesce(sp.rider_supplies_json, '{}'::jsonb)) rider_entry
  where jsonb_typeof(rider_entry.value) = 'object'
),
direct_stage_supply_totals as (
  select
    rider.team_id,
    generated.supply_key,
    sum(generated.quantity_planned)::integer as quantity_planned
  from direct_supply_rider_rows rider
  cross join lateral (
    values
      ('bidons_water_bottles'::text, rider.bidons),
      ('energy_gels'::text, rider.energy_gels),
      ('nutrition_packs'::text, rider.nutrition_packs),
      ('race_jersey_complete'::text, rider.race_jersey_complete),
      ('rain_jackets'::text, rider.rain_jackets)
  ) as generated(supply_key, quantity_planned)
  where generated.quantity_planned > 0
  group by rider.team_id, generated.supply_key
),
direct_stage_supply_rows as (
  select
    total.team_id,
    null::uuid as stage_supply_id,
    total.supply_key,
    total.quantity_planned,
    0::integer as quantity_consumed,
    '{}'::jsonb as supply_snapshot_json,
    '{}'::jsonb as bonus_snapshot_json,
    inventory.quantity_available,
    'race_stage_plans.rider_supplies_json'::text as supply_source
  from direct_stage_supply_totals total
  left join public.club_race_supplies inventory
    on inventory.club_id = total.team_id
   and inventory.supply_key = total.supply_key
),
stage_supply_rows as (
  select * from explicit_stage_supply_rows
  union all
  select direct.*
  from direct_stage_supply_rows direct
  where not exists (
    select 1
    from explicit_stage_supply_rows explicit
    where explicit.team_id = direct.team_id
      and explicit.supply_key = direct.supply_key
  )
),
supply_availability_rows as (
  select
    supply.*,
    greatest(
      0::numeric,
      least(
        greatest(0::numeric, coalesce(supply.quantity_planned, 0)),
        greatest(0::numeric, coalesce(supply.quantity_available, 0))
      )
    ) as usable_quantity,
    case
      when greatest(0::numeric, coalesce(supply.quantity_planned, 0)) > 0
        then least(
          1::numeric,
          greatest(0::numeric, coalesce(supply.quantity_available, 0))
          / greatest(1::numeric, coalesce(supply.quantity_planned, 0))
        )
      else 0::numeric
    end as usable_ratio
  from stage_supply_rows supply
),
supply_effect_rows as (
  select
    supply.*,
    greatest(1::numeric, coalesce(team_count.rider_count, 1)) as team_rider_count,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'supplySupportPoints', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'supply_support_points', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'supportPoints', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'energy_gels' then 0.75 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'race_jersey_complete' then 1.5 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_support_points,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'energySavingPct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'energy_saving_pct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'energyCostReductionPct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'energy_cost_reduction_pct', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'bidons_water_bottles' then 0.6 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'energy_gels' then 1.5 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'nutrition_packs' then 3.0 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_energy_saving_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'energyPenaltyPct', '')::numeric,
      nullif(supply.bonus_snapshot_json ->> 'energy_penalty_pct', '')::numeric,
      0
    ) as supply_energy_penalty_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'fatigueReductionPct', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'fatigue_reduction_pct', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'bidons_water_bottles' then 0.6 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        when 'race_jersey_complete' then 0.75 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_fatigue_reduction_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'fatiguePenaltyPct', '')::numeric,
      nullif(supply.bonus_snapshot_json ->> 'fatigue_penalty_pct', '')::numeric,
      case
        when supply.supply_key in ('bidons_water_bottles', 'energy_gels', 'nutrition_packs')
         and greatest(0::numeric, coalesce(supply.quantity_planned, 0))
             > greatest(0::numeric, coalesce(supply.quantity_available, 0))
          then 3
        else 0
      end
    ) as supply_fatigue_penalty_pct,
    coalesce(
      nullif(supply.bonus_snapshot_json ->> 'recoveryBonusPoints', '')::numeric * supply.usable_ratio,
      nullif(supply.bonus_snapshot_json ->> 'recovery_bonus_points', '')::numeric * supply.usable_ratio,
      case supply.supply_key
        when 'nutrition_packs' then 1.5 * supply.usable_quantity / greatest(1::numeric, coalesce(team_count.rider_count, 1))
        else 0
      end
    ) as supply_recovery_bonus_points
  from supply_availability_rows supply
  left join team_rider_counts team_count
    on team_count.team_id = supply.team_id
),
supply_json as (
  select coalesce(
    jsonb_object_agg(
      concat(supply.team_id::text, ':', supply.supply_key),
      jsonb_build_object(
        'teamId', supply.team_id,
        'quantity', greatest(0, coalesce(supply.quantity_available, 0)),
        'selectedQuantity',
          case
            when supply.supply_key in ('bidons_water_bottles', 'energy_gels', 'nutrition_packs')
              then greatest(0, supply.quantity_planned)
            else 0
          end,
        'plannedQuantity', greatest(0, supply.quantity_planned),
        'alreadyConsumed', greatest(0, supply.quantity_consumed),
        'supplyKey', supply.supply_key,
        'source', supply.supply_source
      )
      order by supply.team_id::text, supply.supply_key
    ),
    '{}'::jsonb
  ) as value
  from stage_supply_rows supply
),
supply_team_bonus as (
  select
    supply.team_id,
    sum(supply.supply_support_points) as supply_support_points,
    0::numeric as shortage_penalty_points,
    sum(supply.supply_energy_saving_pct) as supply_energy_saving_pct,
    sum(supply.supply_energy_penalty_pct) as supply_energy_penalty_pct,
    sum(supply.supply_fatigue_reduction_pct) as supply_fatigue_reduction_pct,
    max(supply.supply_fatigue_penalty_pct) as supply_fatigue_penalty_pct,
    sum(supply.supply_recovery_bonus_points) as supply_recovery_bonus_points
  from supply_effect_rows supply
  group by supply.team_id
),
stage_asset_rows as (
  select
    sp.team_id,
    asset.asset_key,
    asset.asset_id,
    asset.asset_snapshot_json,
    asset.effect_snapshot_json,
    asset.metadata,
    coalesce(
      nullif(asset.asset_snapshot_json ->> 'condition_percent', '')::numeric,
      nullif(asset.asset_snapshot_json ->> 'conditionPercent', '')::numeric,
      case
        when asset.asset_key in ('team_car', 'car') then
          (select car.condition_percent from public.club_team_cars car where car.id = asset.asset_id)
        when asset.asset_key in ('team_bus', 'bus') then
          (select bus.condition_percent from public.club_team_buses bus where bus.id = asset.asset_id)
        when asset.asset_key in ('equipment_van', 'van') then
          (select van.condition_percent from public.club_equipment_vans van where van.id = asset.asset_id)
        when asset.asset_key in ('mobile_workshop', 'workshop') then
          (select workshop.condition_percent from public.club_mobile_workshops workshop where workshop.id = asset.asset_id)
        when asset.asset_key in ('medical_van', 'medical') then
          (select medical.condition_percent from public.club_medical_vans medical where medical.id = asset.asset_id)
        else null
      end
    ) as condition_percent,
    coalesce(
      nullif(asset.effect_snapshot_json ->> 'intensity', '')::numeric,
      nullif(asset.metadata ->> 'intensity', '')::numeric,
      1
    ) as intensity
  from stage_plans sp
  join public.race_stage_plan_assets asset
    on asset.race_stage_plan_id = sp.stage_plan_id
),
preparation_asset_rows as (
  select
    coalesce(rp.participating_club_id, rp.club_id) as team_id,
    asset.asset_key,
    asset.asset_id,
    asset.asset_snapshot_json,
    asset.effect_snapshot_json,
    asset.metadata,
    coalesce(
      nullif(asset.asset_snapshot_json ->> 'condition_percent', '')::numeric,
      nullif(asset.asset_snapshot_json ->> 'conditionPercent', '')::numeric,
      case
        when asset.asset_key in ('team_car', 'car') then
          (select car.condition_percent from public.club_team_cars car where car.id = asset.asset_id)
        when asset.asset_key in ('team_bus', 'bus') then
          (select bus.condition_percent from public.club_team_buses bus where bus.id = asset.asset_id)
        when asset.asset_key in ('equipment_van', 'van') then
          (select van.condition_percent from public.club_equipment_vans van where van.id = asset.asset_id)
        when asset.asset_key in ('mobile_workshop', 'workshop') then
          (select workshop.condition_percent from public.club_mobile_workshops workshop where workshop.id = asset.asset_id)
        when asset.asset_key in ('medical_van', 'medical') then
          (select medical.condition_percent from public.club_medical_vans medical where medical.id = asset.asset_id)
        else null
      end
    ) as condition_percent,
    coalesce(
      nullif(asset.effect_snapshot_json ->> 'intensity', '')::numeric,
      nullif(asset.metadata ->> 'intensity', '')::numeric,
      1
    ) as intensity
  from public.race_preparation_assets asset
  join public.race_preparations rp
    on rp.id = asset.race_preparation_id
  join public.race_stages stage
    on stage.race_id = rp.race_id
   and stage.id = p_stage_id
  where lower(coalesce(rp.status, '')) in (
    'submitted', 'locked', 'final', 'finalized', 'completed'
  )
    and not exists (
      select 1
      from stage_asset_rows stage_asset
      where stage_asset.team_id = coalesce(rp.participating_club_id, rp.club_id)
    )
),
all_asset_rows as (
  select * from stage_asset_rows
  union all
  select * from preparation_asset_rows
),
asset_json as (
  select coalesce(
    jsonb_object_agg(
      asset.asset_id::text,
      jsonb_build_object(
        'teamId', asset.team_id,
        'condition', asset.condition_percent,
        'intensity', greatest(0, least(1, asset.intensity)),
        'assetKey', asset.asset_key,
        'source', 'saved_race_asset_selection'
      )
      order by asset.asset_id::text
    ) filter (where asset.asset_id is not null),
    '{}'::jsonb
  ) as value
  from all_asset_rows asset
),
asset_team_bonus as (
  select
    asset.team_id,
    sum(coalesce(
      nullif(asset.effect_snapshot_json ->> 'assetSupportPoints', '')::numeric,
      nullif(asset.effect_snapshot_json ->> 'asset_support_points', '')::numeric,
      nullif(asset.effect_snapshot_json ->> 'supportPoints', '')::numeric,
      nullif(asset.effect_snapshot_json ->> 'support_points', '')::numeric,
      0
    )) as asset_support_points
  from all_asset_rows asset
  group by asset.team_id
),
staff_rows as (
  select
    coalesce(rp.participating_club_id, rp.club_id) as team_id,
    staff.id as preparation_staff_id,
    staff.staff_id,
    staff.role_type,
    staff.staff_snapshot_json,
    staff.effect_snapshot_json
  from public.race_preparation_staff staff
  join public.race_preparations rp
    on rp.id = staff.race_preparation_id
  join public.race_stages stage
    on stage.race_id = rp.race_id
   and stage.id = p_stage_id
  where lower(coalesce(rp.status, '')) in (
    'submitted', 'locked', 'final', 'finalized', 'completed'
  )
),
staff_json as (
  select coalesce(
    jsonb_object_agg(
      staff.preparation_staff_id::text,
      jsonb_build_object(
        'teamId', staff.team_id,
        'staffId', staff.staff_id,
        'role', staff.role_type,
        'source', 'race_preparation_staff'
      )
      order by staff.preparation_staff_id::text
    ),
    '{}'::jsonb
  ) as value
  from staff_rows staff
),
staff_team_bonus as (
  select
    staff.team_id,
    sum(coalesce(
      nullif(staff.effect_snapshot_json ->> 'staffSupportPoints', '')::numeric,
      nullif(staff.effect_snapshot_json ->> 'staff_support_points', '')::numeric,
      nullif(staff.effect_snapshot_json ->> 'supportPoints', '')::numeric,
      0
    )) as staff_support_points
  from staff_rows staff
  group by staff.team_id
),
canonical_team_bonus as (
  select
    modifier.team_id,
    max(coalesce(modifier.non_neutral_command_capability_bonus, 0)) as tactical_support_points,
    greatest(
      0::numeric,
      least(3::numeric, max(coalesce(modifier.mechanical_reliability, 0)) / 10)
    ) as reliability_support_points
  from canonical_modifiers modifier
  group by modifier.team_id
),
team_ids as (
  select distinct modifier.team_id from canonical_modifiers modifier
  union
  select distinct sp.team_id from stage_plans sp
),
team_bonus_json as (
  select coalesce(
    jsonb_object_agg(
      team.team_id::text,
      jsonb_build_object(
        'equipmentPerformanceBonusPoints', 0,
        'equipmentSuitabilityBonusPoints', 0,
        'supplySupportPoints', coalesce(supply.supply_support_points, 0),
        'shortagePenaltyPoints', coalesce(supply.shortage_penalty_points, 0),
        'assetSupportPoints', coalesce(asset.asset_support_points, 0),
        'staffSupportPoints', coalesce(staff.staff_support_points, 0),
        'supplyEnergySavingPct', coalesce(supply.supply_energy_saving_pct, 0),
        'supplyEnergyPenaltyPct', coalesce(supply.supply_energy_penalty_pct, 0),
        'supplyFatigueReductionPct', coalesce(supply.supply_fatigue_reduction_pct, 0),
        'supplyFatiguePenaltyPct', coalesce(supply.supply_fatigue_penalty_pct, 0),
        'supplyRecoveryBonusPoints', coalesce(supply.supply_recovery_bonus_points, 0),
        'tacticalSupportPoints', coalesce(canonical.tactical_support_points, 0),
        'reliabilitySupportPoints', coalesce(canonical.reliability_support_points, 0),
        'source', 'stage_plan_json_plus_saved_snapshots_plus_canonical_readers'
      )
      order by team.team_id::text
    ),
    '{}'::jsonb
  ) as value
  from team_ids team
  left join supply_team_bonus supply on supply.team_id = team.team_id
  left join asset_team_bonus asset on asset.team_id = team.team_id
  left join staff_team_bonus staff on staff.team_id = team.team_id
  left join canonical_team_bonus canonical on canonical.team_id = team.team_id
),
equipment_by_rider as (
  select
    equipment.rider_id,
    jsonb_object_agg(
      equipment.equipment_category,
      jsonb_build_object(
        'inventoryId', equipment.inventory_id,
        'catalogItemId', equipment.catalog_item_id,
        'condition', equipment.condition_percent,
        'qualityScore', equipment.quality_score,
        'durabilityScore', equipment.durability_score,
        'source', equipment.resolved_source
      )
      order by equipment.equipment_category
    ) as selection
  from allocated_equipment equipment
  group by equipment.rider_id
),
supply_by_team as (
  select
    supply.team_id,
    jsonb_object_agg(
      supply.supply_key,
      jsonb_build_object(
        'quantityPlanned', supply.quantity_planned,
        'quantityAvailable', coalesce(supply.quantity_available, 0),
        'source', supply.supply_source
      )
      order by supply.supply_key
    ) as selection
  from stage_supply_rows supply
  group by supply.team_id
),
rider_modifier_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'race_id', modifier.race_id,
        'stage_id', modifier.stage_id,
        'rider_id', modifier.rider_id,
        'team_id', modifier.team_id,
        'preparation_id', modifier.preparation_id,
        'preparation_status', modifier.preparation_status,
        'preparation_applied', modifier.preparation_applied,
        'race_support', modifier.race_support,
        'fatigue_control', modifier.fatigue_control,
        'recovery_support', modifier.recovery_support,
        'health_protection', modifier.health_protection,
        'mechanical_reliability', modifier.mechanical_reliability,
        'in_stage_energy_cost_multiplier', modifier.in_stage_energy_cost_multiplier,
        'non_neutral_command_capability_bonus', modifier.non_neutral_command_capability_bonus,
        'health_incident_risk_multiplier', modifier.health_incident_risk_multiplier,
        'mechanical_incident_risk_multiplier', modifier.mechanical_incident_risk_multiplier,
        'mechanical_time_loss_multiplier', modifier.mechanical_time_loss_multiplier,
        'post_stage_fatigue_multiplier', modifier.post_stage_fatigue_multiplier,
        'post_stage_recovery_bonus_points', modifier.post_stage_recovery_bonus_points,
        'equipment_performance_bonus_points', coalesce(equipment.equipment_performance_bonus_points, 0),
        'equipment_suitability_bonus_points', coalesce(equipment.equipment_suitability_bonus_points, 0),
        'equipment_fatigue_reduction_pct', coalesce(equipment.equipment_fatigue_reduction_pct, 0),
        'equipment_stage_bonus_key', equipment.stage_bonus_key,
        'equipment_bonus_source', equipment.bonus_source,
        'preparation_model_version', modifier.preparation_model_version,
        'equipment_selection', coalesce(equipment_selection.selection, '{}'::jsonb),
        'supply_selection', coalesce(supply_selection.selection, '{}'::jsonb)
      )
      order by modifier.team_id::text, modifier.rider_id::text
    ),
    '[]'::jsonb
  ) as value
  from canonical_modifiers modifier
  left join rider_equipment_bonus equipment
    on equipment.rider_id = modifier.rider_id
   and equipment.team_id = modifier.team_id
  left join equipment_by_rider equipment_selection
    on equipment_selection.rider_id = modifier.rider_id
  left join supply_by_team supply_selection
    on supply_selection.team_id = modifier.team_id
),
diagnostics as (
  select jsonb_build_object(
    'stageId', p_stage_id,
    'canonicalModifierRows', (select count(*) from canonical_modifiers),
    'stagePlanRows', (select count(*) from stage_plans),
    'selectedStaffRows', (select count(*) from staff_rows),
    'selectedAssetRows', (select count(*) from all_asset_rows),
    'explicitStageSupplyRows', (select count(*) from explicit_stage_supply_rows),
    'directStageSupplyRiderRows', (select count(*) from direct_supply_rider_rows),
    'directStageSupplyRows', (select count(*) from direct_stage_supply_rows),
    'plannedSupplyRows', (select count(*) from stage_supply_rows),
    'directStageEquipmentAssignmentRows', (
      select count(*) from rider_equipment_sources source
      where source.has_direct_stage_equipment_assignment
    ),
    'clubDefaultEquipmentRiderRows', (
      select count(*) from resolved_equipment_catalogs source
      where source.resolved_source = 'club_equipment_default_setup'
    ),
    'selectedEquipmentSlots', (select count(*) from equipment_selections),
    'allocatedPhysicalEquipmentRows', (select count(*) from allocated_equipment),
    'equipmentBonusRows', (select count(*) from rider_equipment_bonus),
    'equipmentBonusApplication', 'rider_only_no_team_double_count',
    'equipmentPercentMultiplier', 5,
    'supplyContractSource', 'approved_issue01_supply_contract_engine_after_x3',
    'supplyPositiveEffectsUseUsableQuantity', true,
    'supplyUsableQuantityRule', 'min_planned_and_available',
    'equipmentSourcePrecedence', jsonb_build_array(
      'race_stage_plan_riders.equipment_setup_id',
      'race_stage_plans.rider_equipment_json',
      'race_preparations.default_equipment_setup_id',
      'club_equipment_default_setup'
    ),
    'supplySourcePrecedence', jsonb_build_array(
      'race_stage_plan_supplies',
      'race_stage_plans.rider_supplies_json'
    ),
    'sensitiveSnapshotPayloadsReturned', false,
    'missingPhysicalEquipmentRows',
      greatest(
        0,
        (select count(*) from equipment_selections) -
        (select count(*) from allocated_equipment)
      ),
    'runtimeReadOnly', true,
    'directDatabaseWrites', false,
    'canonicalModifierFunction', 'race_engine_get_stage_rider_preparation_modifiers_v2',
    'canonicalEquipmentBonusFunction', 'equipment_calculate_catalog_setup_bonus_preview',
    'equipmentAllocationOrder', 'condition_percent_desc_inventory_id_asc',
    'modelVersion', 'phase9_production_input_adapter_v3'
  ) as value
)
select jsonb_build_object(
  'source', 'race_engine_get_stage_phase9_inputs_v1',
  'modelVersion', 'phase9_production_input_adapter_v3',
  'riderModifiers', rider_modifier_json.value,
  'preparation', jsonb_build_object(
    'equipment', equipment_json.value,
    'staff', staff_json.value,
    'assets', asset_json.value,
    'raceSupplies', supply_json.value,
    'standardizedBonuses', jsonb_build_object(
      'teams', team_bonus_json.value,
      'source', 'production_stage_plan_json_and_saved_snapshots'
    )
  ),
  'diagnostics', diagnostics.value
)
from rider_modifier_json
cross join equipment_json
cross join staff_json
cross join asset_json
cross join supply_json
cross join team_bonus_json
cross join diagnostics;
$function$;

comment on function public.race_engine_get_stage_phase9_inputs_v1(uuid) is
  'Read-only Phase 9 adapter v3. Uses Stage Plan JSON, saved snapshots, canonical preparation modifiers, canonical equipment bonuses and the real club Default Race Setup. Performs no database writes.';

revoke all on function public.race_engine_get_stage_phase9_inputs_v1(uuid) from public;
grant execute on function public.race_engine_get_stage_phase9_inputs_v1(uuid) to authenticated;
grant execute on function public.race_engine_get_stage_phase9_inputs_v1(uuid) to service_role;
