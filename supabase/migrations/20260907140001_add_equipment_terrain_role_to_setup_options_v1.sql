create or replace function public.equipment_get_default_setup_options(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_club_id uuid;
  v_categories jsonb := '[]'::jsonb;
begin
  v_club_id := public.equipment_assert_club_access(p_club_id);

  with cats(category, label, sort_order) as (
    values
      ('frame', 'Frame', 1),
      ('wheelset', 'Wheelset', 2),
      ('tires', 'Tires', 3),
      ('groupset', 'Groupset', 4),
      ('helmet', 'Helmet', 5),
      ('shoes', 'Shoes', 6)
  ),
  ds as (
    select *
    from public.club_equipment_default_setup
    where club_id = v_club_id
    limit 1
  ),
  selected as (
    select
      c.category,
      case c.category
        when 'frame' then coalesce(
          ds.frame_catalog_item_id,
          (select catalog_item_id from public.club_equipment_inventory where id = ds.frame_item_id)
        )
        when 'wheelset' then coalesce(
          ds.wheelset_catalog_item_id,
          (select catalog_item_id from public.club_equipment_inventory where id = ds.wheelset_item_id)
        )
        when 'tires' then coalesce(
          ds.tires_catalog_item_id,
          (select catalog_item_id from public.club_equipment_inventory where id = ds.tires_item_id)
        )
        when 'groupset' then coalesce(
          ds.groupset_catalog_item_id,
          (select catalog_item_id from public.club_equipment_inventory where id = ds.groupset_item_id)
        )
        when 'helmet' then coalesce(
          ds.helmet_catalog_item_id,
          (select catalog_item_id from public.club_equipment_inventory where id = ds.helmet_item_id)
        )
        when 'shoes' then coalesce(
          ds.shoes_catalog_item_id,
          (select catalog_item_id from public.club_equipment_inventory where id = ds.shoes_item_id)
        )
      end as selected_catalog_item_id
    from cats c
    left join ds on true
  ),
  owned_types as (
    select
      cei.equipment_category,
      cei.catalog_item_id,
      ec.display_name,
      ec.item_key,
      sc.name as brand_name,
      ec.quality_score,
      ec.effects,
      ec.metadata,
      coalesce(
        nullif(ec.metadata->>'terrain_role', ''),
        nullif(ec.metadata->>'market_role', '')
      ) as terrain_role,
      count(*) filter (
        where cei.status not in ('sold', 'discarded')
      )::integer as owned_count,
      count(*) filter (
        where cei.status in ('ready', 'worn')
      )::integer as available_count,
      count(*) filter (
        where cei.status in ('assigned', 'in_maintenance')
      )::integer as unavailable_count,
      coalesce(round(avg(cei.condition_percent), 2), 0) as avg_condition
    from public.club_equipment_inventory cei
    join public.equipment_catalog ec
      on ec.id = cei.catalog_item_id
    left join public.sponsor_companies sc
      on sc.id = cei.brand_company_id
    where cei.club_id = v_club_id
      and cei.status not in ('sold', 'discarded')
    group by
      cei.equipment_category,
      cei.catalog_item_id,
      ec.display_name,
      ec.item_key,
      sc.name,
      ec.quality_score,
      ec.effects,
      ec.metadata,
      coalesce(
        nullif(ec.metadata->>'terrain_role', ''),
        nullif(ec.metadata->>'market_role', '')
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'equipment_category', c.category,
        'label', c.label,
        'selected_catalog_item_id', s.selected_catalog_item_id,
        'recommended_catalog_item_id', (
          select ot.catalog_item_id
          from owned_types ot
          where ot.equipment_category = c.category
          order by
            ot.available_count desc,
            ot.quality_score desc,
            ot.avg_condition desc,
            ot.display_name asc
          limit 1
        ),
        'options', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'catalog_item_id', ot.catalog_item_id,
                'item_key', ot.item_key,
                'display_name', ot.display_name,
                'brand_name', ot.brand_name,
                'quality_score', ot.quality_score,
                'owned_count', ot.owned_count,
                'available_count', ot.available_count,
                'unavailable_count', ot.unavailable_count,
                'avg_condition', ot.avg_condition,
                'terrain_role', ot.terrain_role,
                'effects', coalesce(ot.effects, '{}'::jsonb),
                'metadata', coalesce(ot.metadata, '{}'::jsonb),
                'label', ot.display_name || ' (' || ot.available_count || ' available / ' || ot.owned_count || ' owned)'
              )
              order by
                ot.available_count desc,
                ot.quality_score desc,
                ot.avg_condition desc,
                ot.display_name asc
            )
            from owned_types ot
            where ot.equipment_category = c.category
          ),
          '[]'::jsonb
        )
      )
      order by c.sort_order
    ),
    '[]'::jsonb
  )
  into v_categories
  from cats c
  left join selected s
    on s.category = c.category;

  return jsonb_build_object(
    'club_id', v_club_id,
    'categories', v_categories
  );
end;
$function$;
