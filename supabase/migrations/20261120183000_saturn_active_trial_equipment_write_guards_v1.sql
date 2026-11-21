-- SAT-08: proposed guards for 6 EXISTING equipment mutation RPCs.
-- Source-only until real test JWT and RLS staging coverage is complete.
-- Restricts all unconverted Saturn trial identities, including linked non-anonymous Auth users. Permanent registered users
-- continue through their unchanged equipment permissions and pricing logic.
-- Requires public.saturn_test_account_can_mutate_v1(uuid).

CREATE OR REPLACE FUNCTION public.equipment_discard_item(p_club_id uuid, p_inventory_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_owner_user_id uuid;
  v_item public.club_equipment_inventory%rowtype;
  v_current_game_date date;
begin
  -- SAT-08: server clock and exact club check before ANY inventory mutation.
  if public.saturn_test_account_requires_guard_v1()
    and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or cannot change this club equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  select *
  into v_item
  from public.club_equipment_inventory
  where id = p_inventory_item_id
    and club_id = v_club_id;

  if not found then
    raise exception 'Equipment item not found for this club';
  end if;

  if v_item.status = 'sold' then
    raise exception 'Equipment item is already sold';
  elsif v_item.status = 'discarded' then
    raise exception 'Equipment item is already discarded';
  elsif v_item.status = 'assigned' then
    raise exception 'Assigned equipment cannot be discarded';
  elsif v_item.status = 'in_maintenance' then
    raise exception 'Equipment item in maintenance cannot be discarded';
  end if;

  v_current_game_date := public.get_current_game_date_date();

  select owner_user_id
  into v_owner_user_id
  from public.clubs
  where id = v_club_id;

  update public.club_equipment_inventory
  set
    status = 'discarded',
    discarded_game_date = v_current_game_date,
    assigned_rider_id = null,
    current_value_cash = 0,
    metadata = metadata || jsonb_build_object(
      'discarded_at', now(),
      'discarded_game_date', v_current_game_date,
      'discard_reason', 'manual_discard'
    ),
    updated_at = now()
  where id = p_inventory_item_id
    and club_id = v_club_id;

  if v_owner_user_id is not null then
    perform public.create_infrastructure_notification(
      v_owner_user_id,
      'EQUIPMENT_DISCARDED',
      'Equipment Discarded',
      v_item.display_name || ' was discarded.',
      '#/dashboard/equipment',
      jsonb_build_object(
        'club_id', v_club_id,
        'inventory_item_id', p_inventory_item_id
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'inventory_item_id', p_inventory_item_id,
    'discarded_game_date', v_current_game_date
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.equipment_purchase_item(p_club_id uuid, p_catalog_item_id uuid, p_quantity integer DEFAULT 1, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_catalog public.equipment_catalog%rowtype;
  v_current_game_date date;

  v_quantity integer;

  v_sponsor_discount jsonb := '{}'::jsonb;
  v_discount_cash numeric := 0;
  v_discount_pct numeric := 0;
  v_resale_basis_unit_cash numeric := 0;

  v_unit_price_cash numeric := 0;
  v_total_cost_cash numeric := 0;
  v_total_cost_cash_bigint bigint := 0;
  v_finance_tx_id uuid;
  v_idempotency_key text;

  v_inserted_items jsonb := '[]'::jsonb;
  v_existing_items jsonb := '[]'::jsonb;
begin
  -- SAT-08: server clock and exact club check before ANY inventory mutation.
  if public.saturn_test_account_requires_guard_v1()
    and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or cannot change this club equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  v_quantity := least(greatest(coalesce(p_quantity, 1), 1), 20);
  v_idempotency_key := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_idempotency_key is not null then
    select coalesce(jsonb_agg(to_jsonb(cei)), '[]'::jsonb)
    into v_existing_items
    from public.club_equipment_inventory cei
    where cei.club_id = v_club_id
      and cei.metadata->>'purchase_idempotency_key' = v_idempotency_key;

    if jsonb_array_length(v_existing_items) > 0 then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'club_id', v_club_id,
        'items', v_existing_items
      );
    end if;
  end if;

  if v_idempotency_key is null then
    v_idempotency_key := 'equipment_purchase:' || gen_random_uuid()::text;
  end if;

  select *
  into v_catalog
  from public.equipment_catalog
  where id = p_catalog_item_id
    and is_active = true;

  if not found then
    raise exception 'Equipment catalog item not found or inactive';
  end if;

  if v_catalog.equipment_kind <> 'durable' then
    raise exception 'This RPC only purchases durable equipment. Use equipment_purchase_race_supplies for race supplies.';
  end if;

  v_current_game_date := public.get_current_game_date_date();

  /*
    Technical sponsor support is consumed before final club cash cost is calculated.

    Important:
    - v_total_cost_cash is the real cash paid by the club.
    - v_resale_basis_unit_cash is based on what the club actually paid per unit.
    - This prevents buying discounted equipment and selling it later for profit.
  */
  v_sponsor_discount := public.equipment_consume_technical_sponsor_support(
    v_club_id,
    p_catalog_item_id,
    v_quantity,
    v_idempotency_key
  );

  v_total_cost_cash := coalesce(
    (v_sponsor_discount->>'club_pays_total_cash')::numeric,
    round(v_catalog.base_price_cash * v_quantity, 2)
  );

  v_discount_cash := coalesce(
    (v_sponsor_discount->>'discount_cash')::numeric,
    0
  );

  v_discount_pct := coalesce(
    (v_sponsor_discount->>'discount_pct')::numeric,
    0
  );

  v_resale_basis_unit_cash := coalesce(
    (v_sponsor_discount->>'resale_basis_unit_cash')::numeric,
    round(v_total_cost_cash / v_quantity, 2),
    v_catalog.base_price_cash
  );

  v_total_cost_cash_bigint := round(v_total_cost_cash)::bigint;
  v_total_cost_cash := v_total_cost_cash_bigint;
  v_unit_price_cash := round(v_total_cost_cash / v_quantity, 0);
  v_resale_basis_unit_cash := round(v_unit_price_cash, 0);

  if v_total_cost_cash_bigint < 0 then
    raise exception 'Invalid equipment purchase cost';
  end if;

  if v_quantity <= 0 then
    raise exception 'Invalid equipment purchase quantity';
  end if;

  perform set_config('finance.internal', '1', true);

  v_finance_tx_id := public.finance_spend_from_club(
    v_club_id,
    v_total_cost_cash_bigint,
    'equipment_purchase',
    'SINK',
    v_idempotency_key,
    jsonb_build_object(
      'catalog_item_id', v_catalog.id,
      'item_key', v_catalog.item_key,
      'display_name', v_catalog.display_name,
      'equipment_category', v_catalog.equipment_category,
      'quantity', v_quantity,
      'base_price_cash', v_catalog.base_price_cash,
      'unit_price_cash', v_unit_price_cash,
      'total_cost_cash', v_total_cost_cash,
      'resale_basis_unit_cash', v_resale_basis_unit_cash,
      'technical_discount_pct', v_discount_pct,
      'technical_discount_cash', v_discount_cash,
      'technical_sponsor_benefit_id', v_sponsor_discount->>'benefit_id',
      'source', 'equipment_purchase_item'
    )
  );

  with ins as (
    insert into public.club_equipment_inventory (
      club_id,
      catalog_item_id,
      equipment_category,
      display_name,
      brand_company_id,
      quality_score,
      durability_score,
      condition_percent,
      status,
      purchase_cost_cash,
      current_value_cash,
      acquired_game_date,
      metadata
    )
    select
      v_club_id,
      v_catalog.id,
      v_catalog.equipment_category,
      v_catalog.display_name,
      v_catalog.brand_company_id,
      v_catalog.quality_score,
      v_catalog.durability_score,
      100,
      'ready',
      v_unit_price_cash,
      floor(v_resale_basis_unit_cash * (coalesce(v_catalog.resale_pct, 0) / 100.0)),
      v_current_game_date,
      jsonb_build_object(
        'purchase_finance_transaction_id', v_finance_tx_id,
        'purchase_idempotency_key', v_idempotency_key,
        'catalog_item_key', v_catalog.item_key,

        'base_price_cash', v_catalog.base_price_cash,
        'unit_price_cash', v_unit_price_cash,
        'resale_basis_cash', v_resale_basis_unit_cash,
        'technical_discount_pct', v_discount_pct,
        'technical_discount_cash', round(v_discount_cash / v_quantity, 2),
        'technical_sponsor_benefit_id', v_sponsor_discount->>'benefit_id',

        'sponsor_discount_json', v_sponsor_discount,

        'purchased_at', now(),
        'purchased_game_date', v_current_game_date
      )
    from generate_series(1, v_quantity)
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb)
  into v_inserted_items
  from ins;

  -- No notification is created here.
  -- Equipment purchase success should be shown by the Equipment page UI only.

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'catalog_item_id', v_catalog.id,
    'item_key', v_catalog.item_key,
    'display_name', v_catalog.display_name,
    'quantity', v_quantity,
    'unit_price_cash', v_unit_price_cash,
    'total_cost_cash', v_total_cost_cash,
    'resale_basis_unit_cash', v_resale_basis_unit_cash,
    'technical_discount_pct', v_discount_pct,
    'technical_discount_cash', v_discount_cash,
    'technical_sponsor_benefit_id', v_sponsor_discount->>'benefit_id',
    'sponsor_discount', v_sponsor_discount,
    'finance_transaction_id', v_finance_tx_id,
    'items', v_inserted_items
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.equipment_purchase_race_supplies(p_club_id uuid, p_catalog_item_id uuid, p_quantity integer DEFAULT 1, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_catalog public.equipment_catalog%rowtype;
  v_current_game_date date;

  v_quantity integer;
  v_technical_company_id uuid;
  v_technical_sponsor_name text;
  v_technical_discount_pct numeric := 0;

  v_unit_price_cash bigint := 0;
  v_total_cost_cash bigint := 0;
  v_finance_tx_id uuid;
  v_idempotency_key text;

  v_existing_hit boolean := false;
  v_result_row jsonb;
begin
  -- SAT-08: server clock and exact club check before ANY inventory mutation.
  if public.saturn_test_account_requires_guard_v1()
    and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or cannot change this club equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  v_quantity := least(greatest(coalesce(p_quantity, 1), 1), 10000);
  v_idempotency_key := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_idempotency_key is not null then
    select exists (
      select 1
      from public.club_race_supplies crs
      cross join lateral jsonb_array_elements_text(
        coalesce(crs.metadata->'purchase_idempotency_keys', '[]'::jsonb)
      ) k(value)
      where crs.club_id = v_club_id
        and k.value = v_idempotency_key
    )
    into v_existing_hit;

    if v_existing_hit then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'club_id', v_club_id,
        'message', 'Race supplies purchase already processed for this idempotency key'
      );
    end if;
  end if;

  select *
  into v_catalog
  from public.equipment_catalog
  where id = p_catalog_item_id
    and is_active = true;

  if not found then
    raise exception 'Race supply catalog item not found or inactive';
  end if;

  if v_catalog.equipment_kind <> 'race_supply' then
    raise exception 'This RPC only purchases race supplies. Use equipment_purchase_item for durable equipment.';
  end if;

  v_current_game_date := public.get_current_game_date_date();

  select
    cs.company_id,
    coalesce(cs.name, sc.name),
    least(
      greatest(
        coalesce(nullif(to_jsonb(cs)->>'technical_discount_pct', '')::numeric, 0),
        0
      ),
      95
    )
  into
    v_technical_company_id,
    v_technical_sponsor_name,
    v_technical_discount_pct
  from public.club_sponsors cs
  left join public.sponsor_companies sc
    on sc.id = cs.company_id
  where cs.club_id = v_club_id
    and cs.sponsor_kind = 'technical'
    and cs.status = 'active'
  order by cs.created_at desc
  limit 1;

  if v_technical_company_id is null
     or v_catalog.brand_company_id is null
     or v_catalog.brand_company_id <> v_technical_company_id then
    v_technical_discount_pct := 0;
  end if;

  v_unit_price_cash :=
    floor(v_catalog.base_price_cash * (1 - v_technical_discount_pct / 100.0))::bigint;

  v_total_cost_cash := v_unit_price_cash * v_quantity;

  perform set_config('finance.internal', '1', true);

  v_finance_tx_id := public.finance_spend_from_club(
    v_club_id,
    v_total_cost_cash,
    'race_supplies_purchase',
    'SINK',
    coalesce(v_idempotency_key, 'race_supplies_purchase:' || gen_random_uuid()::text),
    jsonb_build_object(
      'catalog_item_id', v_catalog.id,
      'item_key', v_catalog.item_key,
      'display_name', v_catalog.display_name,
      'supply_key', v_catalog.equipment_category,
      'quantity', v_quantity,
      'unit_price_cash', v_unit_price_cash,
      'total_cost_cash', v_total_cost_cash,
      'base_price_cash', v_catalog.base_price_cash,
      'technical_discount_pct', v_technical_discount_pct,
      'technical_sponsor_company_id', v_technical_company_id,
      'technical_sponsor_name', v_technical_sponsor_name,
      'source', 'equipment_purchase_race_supplies'
    )
  );

  insert into public.club_race_supplies (
    club_id,
    supply_key,
    display_name,
    preferred_brand_company_id,
    quantity_available,
    total_purchased,
    total_used,
    last_purchased_game_date,
    metadata
  )
  values (
    v_club_id,
    v_catalog.equipment_category,
    v_catalog.display_name,
    v_catalog.brand_company_id,
    v_quantity,
    v_quantity,
    0,
    v_current_game_date,
    jsonb_build_object(
      'last_purchase_finance_transaction_id', v_finance_tx_id,
      'last_purchase_idempotency_key', v_idempotency_key,
      'purchase_idempotency_keys', case
        when v_idempotency_key is null then '[]'::jsonb
        else jsonb_build_array(v_idempotency_key)
      end,
      'catalog_item_key', v_catalog.item_key,
      'unit_price_cash', v_unit_price_cash,
      'technical_discount_pct', v_technical_discount_pct,
      'technical_sponsor_company_id', v_technical_company_id,
      'technical_sponsor_name', v_technical_sponsor_name,
      'last_purchased_at', now()
    )
  )
  on conflict (club_id, supply_key) do update
  set
    display_name = excluded.display_name,
    preferred_brand_company_id = coalesce(
      excluded.preferred_brand_company_id,
      club_race_supplies.preferred_brand_company_id
    ),
    quantity_available = club_race_supplies.quantity_available + excluded.quantity_available,
    total_purchased = club_race_supplies.total_purchased + excluded.total_purchased,
    last_purchased_game_date = excluded.last_purchased_game_date,
    metadata =
      jsonb_set(
        club_race_supplies.metadata
        || jsonb_build_object(
          'last_purchase_finance_transaction_id', v_finance_tx_id,
          'last_purchase_idempotency_key', v_idempotency_key,
          'catalog_item_key', v_catalog.item_key,
          'unit_price_cash', v_unit_price_cash,
          'technical_discount_pct', v_technical_discount_pct,
          'technical_sponsor_company_id', v_technical_company_id,
          'technical_sponsor_name', v_technical_sponsor_name,
          'last_purchased_at', now()
        ),
        '{purchase_idempotency_keys}',
        case
          when v_idempotency_key is null then
            coalesce(club_race_supplies.metadata->'purchase_idempotency_keys', '[]'::jsonb)
          else
            coalesce(club_race_supplies.metadata->'purchase_idempotency_keys', '[]'::jsonb)
            || jsonb_build_array(v_idempotency_key)
        end,
        true
      ),
    updated_at = now()
  returning to_jsonb(public.club_race_supplies.*)
  into v_result_row;

  -- Intentionally no RACE_SUPPLIES_PURCHASED notification here.
  -- Purchase success should be shown by the Equipment/Race Supplies UI only.
  -- Low-stock warnings are handled separately by RACE_SUPPLIES_LOW.

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'catalog_item_id', v_catalog.id,
    'item_key', v_catalog.item_key,
    'supply_key', v_catalog.equipment_category,
    'display_name', v_catalog.display_name,
    'quantity', v_quantity,
    'unit_price_cash', v_unit_price_cash,
    'total_cost_cash', v_total_cost_cash,
    'technical_discount_pct', v_technical_discount_pct,
    'technical_sponsor_name', v_technical_sponsor_name,
    'finance_transaction_id', v_finance_tx_id,
    'race_supply_row', v_result_row
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.equipment_save_auto_restock_rule_v1(p_club_id uuid, p_supply_key text, p_enabled boolean, p_minimum_stock integer, p_order_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
begin
  -- SAT-08: server clock and exact club check before ANY inventory mutation.
  if public.saturn_test_account_requires_guard_v1()
    and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or cannot change this club equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  if not public.equipment_current_user_has_premium_v1() then
    raise exception 'Premium membership is required for automatic restocking.';
  end if;

  if p_supply_key not in (
    'bidons_water_bottles',
    'energy_gels',
    'nutrition_packs',
    'race_jersey_complete',
    'rain_jackets'
  ) then
    raise exception 'Unsupported race supply key: %.', p_supply_key;
  end if;

  if p_minimum_stock not between 0 and 99999 then
    raise exception 'Minimum stock must be between 0 and 99999.';
  end if;

  if p_order_quantity not between 1 and 999 then
    raise exception 'Order quantity must be between 1 and 999.';
  end if;

  insert into public.equipment_auto_restock_rules (
    club_id,
    supply_key,
    enabled,
    minimum_stock,
    order_quantity,
    updated_by_user_id,
    updated_at
  )
  values (
    v_club_id,
    p_supply_key,
    coalesce(p_enabled, false),
    p_minimum_stock,
    p_order_quantity,
    auth.uid(),
    now()
  )
  on conflict (club_id, supply_key) do update
  set enabled = excluded.enabled,
      minimum_stock = excluded.minimum_stock,
      order_quantity = excluded.order_quantity,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = excluded.updated_at;
end;
$function$;


CREATE OR REPLACE FUNCTION public.equipment_save_default_setup(p_club_id uuid, p_frame_item_id uuid DEFAULT NULL::uuid, p_wheelset_item_id uuid DEFAULT NULL::uuid, p_tires_item_id uuid DEFAULT NULL::uuid, p_groupset_item_id uuid DEFAULT NULL::uuid, p_helmet_item_id uuid DEFAULT NULL::uuid, p_shoes_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_invalid jsonb;
  v_result jsonb;
begin
  -- SAT-08: server clock and exact club check before ANY inventory mutation.
  if public.saturn_test_account_requires_guard_v1()
    and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or cannot change this club equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  with requested(slot_key, item_id, expected_category) as (
    values
      ('frame', p_frame_item_id, 'frame'),
      ('wheelset', p_wheelset_item_id, 'wheelset'),
      ('tires', p_tires_item_id, 'tires'),
      ('groupset', p_groupset_item_id, 'groupset'),
      ('helmet', p_helmet_item_id, 'helmet'),
      ('shoes', p_shoes_item_id, 'shoes')
  ),
  invalid as (
    select
      r.slot_key,
      r.item_id,
      r.expected_category,
      cei.equipment_category as actual_category,
      cei.status
    from requested r
    left join public.club_equipment_inventory cei
      on cei.id = r.item_id
     and cei.club_id = v_club_id
    where r.item_id is not null
      and (
        cei.id is null
        or cei.equipment_category <> r.expected_category
        or cei.status in ('sold', 'discarded', 'in_maintenance')
      )
  )
  select coalesce(jsonb_agg(to_jsonb(invalid)), '[]'::jsonb)
  into v_invalid
  from invalid;

  if jsonb_array_length(v_invalid) > 0 then
    raise exception 'Invalid default setup equipment: %', v_invalid;
  end if;

  insert into public.club_equipment_default_setup (
    club_id,
    setup_name,
    frame_item_id,
    wheelset_item_id,
    tires_item_id,
    groupset_item_id,
    helmet_item_id,
    shoes_item_id,
    metadata
  )
  values (
    v_club_id,
    'Default Race Setup',
    p_frame_item_id,
    p_wheelset_item_id,
    p_tires_item_id,
    p_groupset_item_id,
    p_helmet_item_id,
    p_shoes_item_id,
    jsonb_build_object(
      'updated_by_rpc', 'equipment_save_default_setup',
      'updated_at', now()
    )
  )
  on conflict (club_id) do update
  set
    frame_item_id = excluded.frame_item_id,
    wheelset_item_id = excluded.wheelset_item_id,
    tires_item_id = excluded.tires_item_id,
    groupset_item_id = excluded.groupset_item_id,
    helmet_item_id = excluded.helmet_item_id,
    shoes_item_id = excluded.shoes_item_id,
    metadata = excluded.metadata,
    updated_at = now();

  select public.equipment_get_dashboard(v_club_id)->'default_setup'
  into v_result;

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'default_setup', v_result
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.equipment_save_setup_preset(p_club_id uuid, p_setup_slot smallint, p_setup_name text, p_frame_catalog_item_id uuid DEFAULT NULL::uuid, p_wheelset_catalog_item_id uuid DEFAULT NULL::uuid, p_tires_catalog_item_id uuid DEFAULT NULL::uuid, p_groupset_catalog_item_id uuid DEFAULT NULL::uuid, p_helmet_catalog_item_id uuid DEFAULT NULL::uuid, p_shoes_catalog_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_row public.club_equipment_setup_presets;
begin
  -- SAT-08: server clock and exact club check before ANY inventory mutation.
  if public.saturn_test_account_requires_guard_v1()
    and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or cannot change this club equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  if p_setup_slot < 1 or p_setup_slot > 4 then
    raise exception 'Setup slot must be between 1 and 4';
  end if;

  if nullif(trim(coalesce(p_setup_name, '')), '') is null then
    raise exception 'Setup name is required';
  end if;

  if p_frame_catalog_item_id is null
    or p_wheelset_catalog_item_id is null
    or p_tires_catalog_item_id is null
    or p_groupset_catalog_item_id is null
    or p_helmet_catalog_item_id is null
    or p_shoes_catalog_item_id is null then
    raise exception 'A race setup requires all six equipment types: frame, wheelset, tires, groupset, helmet, and shoes';
  end if;

  if not exists (
    select 1
    from public.club_equipment_inventory
    where club_id = v_club_id
      and equipment_category = 'frame'
      and catalog_item_id = p_frame_catalog_item_id
      and status not in ('sold', 'discarded')
  ) then
    raise exception 'Selected frame type is not owned by this club';
  end if;

  if not exists (
    select 1
    from public.club_equipment_inventory
    where club_id = v_club_id
      and equipment_category = 'wheelset'
      and catalog_item_id = p_wheelset_catalog_item_id
      and status not in ('sold', 'discarded')
  ) then
    raise exception 'Selected wheelset type is not owned by this club';
  end if;

  if not exists (
    select 1
    from public.club_equipment_inventory
    where club_id = v_club_id
      and equipment_category = 'tires'
      and catalog_item_id = p_tires_catalog_item_id
      and status not in ('sold', 'discarded')
  ) then
    raise exception 'Selected tires type is not owned by this club';
  end if;

  if not exists (
    select 1
    from public.club_equipment_inventory
    where club_id = v_club_id
      and equipment_category = 'groupset'
      and catalog_item_id = p_groupset_catalog_item_id
      and status not in ('sold', 'discarded')
  ) then
    raise exception 'Selected groupset type is not owned by this club';
  end if;

  if not exists (
    select 1
    from public.club_equipment_inventory
    where club_id = v_club_id
      and equipment_category = 'helmet'
      and catalog_item_id = p_helmet_catalog_item_id
      and status not in ('sold', 'discarded')
  ) then
    raise exception 'Selected helmet type is not owned by this club';
  end if;

  if not exists (
    select 1
    from public.club_equipment_inventory
    where club_id = v_club_id
      and equipment_category = 'shoes'
      and catalog_item_id = p_shoes_catalog_item_id
      and status not in ('sold', 'discarded')
  ) then
    raise exception 'Selected shoes type is not owned by this club';
  end if;

  insert into public.club_equipment_setup_presets (
    club_id,
    setup_slot,
    setup_name,
    frame_catalog_item_id,
    wheelset_catalog_item_id,
    tires_catalog_item_id,
    groupset_catalog_item_id,
    helmet_catalog_item_id,
    shoes_catalog_item_id,
    metadata,
    updated_at
  )
  values (
    v_club_id,
    p_setup_slot,
    trim(p_setup_name),
    p_frame_catalog_item_id,
    p_wheelset_catalog_item_id,
    p_tires_catalog_item_id,
    p_groupset_catalog_item_id,
    p_helmet_catalog_item_id,
    p_shoes_catalog_item_id,
    jsonb_build_object(
      'saved_by', 'equipment_save_setup_preset',
      'is_complete_setup', true,
      'saved_at', now()
    ),
    now()
  )
  on conflict (club_id, setup_slot) do update
  set
    setup_name = excluded.setup_name,
    frame_catalog_item_id = excluded.frame_catalog_item_id,
    wheelset_catalog_item_id = excluded.wheelset_catalog_item_id,
    tires_catalog_item_id = excluded.tires_catalog_item_id,
    groupset_catalog_item_id = excluded.groupset_catalog_item_id,
    helmet_catalog_item_id = excluded.helmet_catalog_item_id,
    shoes_catalog_item_id = excluded.shoes_catalog_item_id,
    metadata = coalesce(public.club_equipment_setup_presets.metadata, '{}'::jsonb)
      || excluded.metadata,
    updated_at = now()
  returning *
  into v_row;

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'preset', jsonb_build_object(
      'id', v_row.id,
      'setup_slot', v_row.setup_slot,
      'setup_name', v_row.setup_name,
      'selected_catalog_item_ids', jsonb_build_object(
        'frame', v_row.frame_catalog_item_id,
        'wheelset', v_row.wheelset_catalog_item_id,
        'tires', v_row.tires_catalog_item_id,
        'groupset', v_row.groupset_catalog_item_id,
        'helmet', v_row.helmet_catalog_item_id,
        'shoes', v_row.shoes_catalog_item_id
      ),
      'bonus_preview', public.equipment_calculate_catalog_setup_bonus_preview(
        v_row.frame_catalog_item_id,
        v_row.wheelset_catalog_item_id,
        v_row.tires_catalog_item_id,
        v_row.groupset_catalog_item_id,
        v_row.helmet_catalog_item_id,
        v_row.shoes_catalog_item_id
      )
    )
  );
end;
$function$;


