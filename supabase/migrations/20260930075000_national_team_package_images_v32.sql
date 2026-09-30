-- Expose the database-backed artwork used by the fixed National Team package.
-- Equipment images come from equipment_catalog.metadata and asset images from
-- infrastructure_asset_config.image_url so the National Association package UI
-- stays in sync with the live catalog instead of hard-coding image URLs.

create or replace function public.get_national_team_standard_package_v1()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'cost_model','system_covered',
    'has_treasury',false,
    'staff',jsonb_build_array('national_coach'),
    'equipment',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'equipment_category',s.equipment_category,
          'specialization',s.specialization,
          'model_count',s.model_count,
          'catalog_item_id',e.id,
          'item_key',e.item_key,
          'display_name',e.display_name,
          'tier',e.tier,
          'quality_score',e.quality_score,
          'durability_score',e.durability_score,
          'effects',e.effects,
          'metadata',e.metadata,
          'image_url',coalesce(
            nullif(e.metadata->>'image_url',''),
            nullif(e.metadata->>'imageUrl','')
          )
        )
        order by s.equipment_category,
          case s.specialization
            when 'flat' then 1
            when 'mountain' then 2
            else 3
          end
      )
      from public.national_team_standard_equipment s
      join public.equipment_catalog e on e.id=s.catalog_item_id
      where s.is_active=true
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'asset_key',a.asset_key,
          'asset_level',a.asset_level,
          'quantity',a.quantity,
          'usage_note',a.usage_note,
          'asset_name',cfg.asset_name,
          'image_url',cfg.image_url
        )
        order by a.asset_key
      )
      from public.national_team_standard_assets a
      left join public.infrastructure_asset_config cfg
        on cfg.asset_key=a.asset_key
       and cfg.asset_level=a.asset_level
      where a.is_active=true
    ),'[]'::jsonb),
    'supplies',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'supply_key',s.supply_key,
          'display_name',s.display_name,
          'quantity',s.quantity,
          'replenishment_scope',s.replenishment_scope
        )
        order by s.supply_key
      )
      from public.national_team_standard_supplies s
      where s.is_active=true
    ),'[]'::jsonb)
  );
$function$;
