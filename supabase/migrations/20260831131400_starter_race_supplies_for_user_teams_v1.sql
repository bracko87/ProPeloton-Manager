create or replace function public.equipment_ensure_starter_race_supplies_for_club_v1(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_club record;
  v_game_date date;
  v_supply record;
  v_catalog record;
  v_current integer;
  v_delta integer;
  v_total_granted integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  select c.id,c.owner_user_id,coalesce(c.is_ai,false) as is_ai,
         coalesce(c.club_type,'main') as club_type,c.deleted_at
  into v_club
  from public.clubs c
  where c.id=p_club_id;

  if not found then
    raise exception 'Club not found: %',p_club_id;
  end if;

  -- Starter race-supply stock belongs only to active user-owned main teams.
  -- Developing teams use the main-team resource pool; AI teams keep their own policy.
  if v_club.deleted_at is not null
     or v_club.owner_user_id is null
     or v_club.is_ai
     or v_club.club_type <> 'main' then
    return jsonb_build_object(
      'ok',true,
      'club_id',p_club_id,
      'eligible',false,
      'total_granted',0
    );
  end if;

  v_game_date := public.get_current_game_date_date();

  for v_supply in
    select * from (values
      ('bidons_water_bottles'::text,50::integer),
      ('energy_gels'::text,50::integer),
      ('nutrition_packs'::text,30::integer),
      ('race_jersey_complete'::text,10::integer),
      ('rain_jackets'::text,10::integer)
    ) as x(supply_key,baseline_quantity)
  loop
    select ec.display_name,ec.brand_company_id,ec.item_key
    into v_catalog
    from public.equipment_catalog ec
    where ec.equipment_kind='race_supply'
      and ec.equipment_category=v_supply.supply_key
      and ec.is_active=true
    order by ec.base_price_cash asc,ec.display_name asc
    limit 1;

    if v_catalog.display_name is null then
      raise exception 'Active race supply catalog item missing for %',v_supply.supply_key;
    end if;

    select crs.quantity_available
    into v_current
    from public.club_race_supplies crs
    where crs.club_id=p_club_id
      and crs.supply_key=v_supply.supply_key
    for update;

    if not found then
      v_current := 0;
      v_delta := v_supply.baseline_quantity;

      insert into public.club_race_supplies(
        club_id,supply_key,display_name,preferred_brand_company_id,
        quantity_available,total_purchased,total_used,
        last_purchased_game_date,last_used_game_date,metadata
      ) values (
        p_club_id,v_supply.supply_key,v_catalog.display_name,v_catalog.brand_company_id,
        v_supply.baseline_quantity,0,0,
        null,null,
        jsonb_build_object(
          'starter_race_supply',true,
          'starter_race_supply_version','starter_race_supplies_v1',
          'starter_baseline_quantity',v_supply.baseline_quantity,
          'starter_granted_quantity_total',v_delta,
          'starter_last_grant_delta',v_delta,
          'starter_granted_game_date',v_game_date,
          'starter_granted_at',now(),
          'catalog_item_key',v_catalog.item_key,
          'grant_cost_cash',0
        )
      );
    else
      v_delta := greatest(v_supply.baseline_quantity-coalesce(v_current,0),0);

      if v_delta>0 then
        update public.club_race_supplies crs
        set quantity_available=v_supply.baseline_quantity,
            display_name=v_catalog.display_name,
            preferred_brand_company_id=coalesce(crs.preferred_brand_company_id,v_catalog.brand_company_id),
            metadata=coalesce(crs.metadata,'{}'::jsonb) || jsonb_build_object(
              'starter_race_supply',true,
              'starter_race_supply_version','starter_race_supplies_v1',
              'starter_baseline_quantity',v_supply.baseline_quantity,
              'starter_granted_quantity_total',
                coalesce(nullif(crs.metadata->>'starter_granted_quantity_total','')::integer,0)+v_delta,
              'starter_last_grant_delta',v_delta,
              'starter_granted_game_date',v_game_date,
              'starter_granted_at',now(),
              'catalog_item_key',v_catalog.item_key,
              'grant_cost_cash',0
            ),
            updated_at=now()
        where crs.club_id=p_club_id
          and crs.supply_key=v_supply.supply_key;
      end if;
    end if;

    v_total_granted := v_total_granted+v_delta;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'supply_key',v_supply.supply_key,
      'baseline_quantity',v_supply.baseline_quantity,
      'quantity_before',v_current,
      'granted_quantity',v_delta,
      'quantity_after',greatest(coalesce(v_current,0),v_supply.baseline_quantity)
    ));
  end loop;

  perform 1
  from public.sync_race_supply_units_from_summary_v1(p_club_id);

  return jsonb_build_object(
    'ok',true,
    'club_id',p_club_id,
    'eligible',true,
    'starter_version','starter_race_supplies_v1',
    'total_granted',v_total_granted,
    'items',v_items
  );
end;
$function$;

create or replace function public.create_new_club_race_supplies_low_notification_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_key text;
  v_is_low boolean := false;
begin
  if coalesce(new.is_ai,false)=true
     or new.owner_user_id is null
     or coalesce(new.club_type,'main') <> 'main' then
    return new;
  end if;

  perform public.equipment_ensure_starter_race_supplies_for_club_v1(new.id);

  select exists (
    with expected_supplies(supply_key,threshold_quantity) as (
      values
        ('bidons_water_bottles'::text,10::integer),
        ('energy_gels'::text,10::integer),
        ('nutrition_packs'::text,20::integer),
        ('race_jersey_complete'::text,3::integer),
        ('rain_jackets'::text,3::integer)
    )
    select 1
    from expected_supplies e
    left join public.club_race_supplies s
      on s.club_id=new.id and s.supply_key=e.supply_key
    where coalesce(s.quantity_available,0) <= e.threshold_quantity
  ) into v_is_low;

  if not v_is_low then
    return new;
  end if;

  if not exists (
    select 1 from public.notification_types nt
    where nt.code='RACE_SUPPLIES_LOW' and nt.is_active is true
  ) then
    return new;
  end if;

  v_event_key := 'new_club_race_supplies_low:' || new.id::text;

  perform public.ppm_create_user_notification_direct_v1(
    new.owner_user_id,
    'RACE_SUPPLIES_LOW',
    'Race supplies critically low',
    'Your new team has not stocked enough race supplies yet. Open Race Supplies and prepare bidons, gels, nutrition packs, jerseys and weather gear before the first race.',
    '/dashboard/equipment?tab=race-supplies',
    jsonb_build_object(
      'source','new_club_setup_v2_with_starter_supplies',
      'event_type','new_club_race_supplies_low',
      'club_id',new.id,
      'club_name',new.name,
      'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Supplies%20low.png',
      'race_supplies_path','/dashboard/equipment?tab=race-supplies',
      'equipment_path','/dashboard/equipment',
      'first_day_warning',true,
      'recommended_action','stock_race_supplies'
    ),
    v_event_key
  );

  return new;
end;
$function$;

do $block$
declare
  r record;
begin
  for r in
    select c.id
    from public.clubs c
    where c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and coalesce(c.club_type,'main')='main'
    order by c.created_at,c.id
  loop
    perform public.equipment_ensure_starter_race_supplies_for_club_v1(r.id);
  end loop;
end;
$block$;
