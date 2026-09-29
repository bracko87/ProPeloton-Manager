create or replace function public.equipment_get_race_supplies(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_club_id uuid;
  v_items jsonb := '[]'::jsonb;
begin
  v_club_id := public.equipment_assert_club_access(p_club_id);

  with supply_defs(supply_key, display_name, sort_order) as (
    values
      ('bidons_water_bottles', 'Bidons / Water Bottles', 1),
      ('energy_gels', 'Energy Gels', 2),
      ('nutrition_packs', 'Nutrition Packs', 3),
      ('race_jersey_complete', 'Race Jersey Complete', 4),
      ('rain_jackets', 'Rain Jackets', 5)
  ),
  catalog_one as (
    select distinct on (equipment_category)
      equipment_category,
      id as catalog_item_id,
      item_key,
      base_price_cash,
      brand_company_id,
      effects,
      metadata
    from public.equipment_catalog
    where equipment_kind = 'race_supply'
      and is_active = true
    order by equipment_category, base_price_cash asc, display_name asc
  ),
  durable_summary as (
    select *
    from public.get_club_race_supply_unit_summary_v1(v_club_id)
  ),
  rows as (
    select
      sd.supply_key,
      sd.display_name,
      co.catalog_item_id,
      co.item_key,
      co.base_price_cash,
      crs.preferred_brand_company_id,
      coalesce(sc_pref.name, sc_cat.name) as brand_name,
      coalesce(crs.quantity_available, 0) as quantity_available,
      coalesce(crs.total_purchased, 0) as total_purchased,
      coalesce(crs.total_used, 0) as total_used,
      crs.last_purchased_game_date,
      crs.last_used_game_date,
      co.effects,
      co.metadata,

      -- Durable reusable supplies are tracked as physical units. The frontend
      -- already understands these fields; expose the canonical unit summary so
      -- starter stock (which correctly has total_purchased = 0) still has a
      -- real capacity, remaining-life range and usage percentage.
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.total_units, 0) else null end as total_units,
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.usable_units, 0) else null end as usable_units,
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.worn_out_units, 0) else null end as worn_out_units,
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.discarded_units, 0) else null end as discarded_units,
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.avg_uses_remaining, 0) else null end as avg_uses_remaining,
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.min_uses_remaining, 0) else null end as min_uses_remaining,
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.max_uses_remaining, 0) else null end as max_uses_remaining,
      case when sd.supply_key in ('race_jersey_complete', 'rain_jackets')
        then coalesce(ds.max_stage_uses, public._race_supply_unit_max_uses(sd.supply_key)) else null end as max_stage_uses,
      sd.sort_order
    from supply_defs sd
    left join public.club_race_supplies crs
      on crs.club_id = v_club_id
     and crs.supply_key = sd.supply_key
    left join catalog_one co
      on co.equipment_category = sd.supply_key
    left join durable_summary ds
      on ds.supply_key = sd.supply_key
    left join public.sponsor_companies sc_pref
      on sc_pref.id = crs.preferred_brand_company_id
    left join public.sponsor_companies sc_cat
      on sc_cat.id = co.brand_company_id
    order by sd.sort_order
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by sort_order), '[]'::jsonb)
  into v_items
  from rows;

  return jsonb_build_object(
    'club_id', v_club_id,
    'items', v_items
  );
end;
$function$;
