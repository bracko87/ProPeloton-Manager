-- SAT-08: additive source review only — five more player-facing equipment
-- mutations enforce the original 14-day Saturn lifecycle. Do not deploy
-- until isolated staging tests verify full equipment/read-only behavior.
-- We deliberately DO NOT change shared equipment_assert_club_access because
-- it is also called by inventory/market/dashboard READ functions. Expired
-- test players must retain their existing authorized read access.

-- Reviewed equipment writer: equipment_save_default_setup_types
CREATE OR REPLACE FUNCTION public.equipment_save_default_setup_types(p_club_id uuid, p_frame_catalog_item_id uuid DEFAULT NULL::uuid, p_wheelset_catalog_item_id uuid DEFAULT NULL::uuid, p_tires_catalog_item_id uuid DEFAULT NULL::uuid, p_groupset_catalog_item_id uuid DEFAULT NULL::uuid, p_helmet_catalog_item_id uuid DEFAULT NULL::uuid, p_shoes_catalog_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_invalid jsonb;
begin
  -- Saturn unconverted lifecycle guard: run BEFORE equipment, finance,
  -- Coins or any other player-initiated mutation; preserve regular account
  -- behavior, including completed original-UUID email/Google conversion.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  with requested(slot_key, catalog_item_id, expected_category) as (
    values
      ('frame', p_frame_catalog_item_id, 'frame'),
      ('wheelset', p_wheelset_catalog_item_id, 'wheelset'),
      ('tires', p_tires_catalog_item_id, 'tires'),
      ('groupset', p_groupset_catalog_item_id, 'groupset'),
      ('helmet', p_helmet_catalog_item_id, 'helmet'),
      ('shoes', p_shoes_catalog_item_id, 'shoes')
  ),
  invalid as (
    select
      r.slot_key,
      r.catalog_item_id,
      r.expected_category,
      ec.equipment_category as actual_category,
      ec.display_name
    from requested r
    left join public.equipment_catalog ec
      on ec.id = r.catalog_item_id
    where r.catalog_item_id is not null
      and (
        ec.id is null
        or ec.equipment_kind <> 'durable'
        or ec.equipment_category <> r.expected_category
        or ec.is_active is not true
        or not exists (
          select 1
          from public.club_equipment_inventory cei
          where cei.club_id = v_club_id
            and cei.catalog_item_id = r.catalog_item_id
            and cei.status not in ('sold', 'discarded')
        )
      )
  )
  select coalesce(jsonb_agg(to_jsonb(invalid)), '[]'::jsonb)
  into v_invalid
  from invalid;

  if jsonb_array_length(v_invalid) > 0 then
    raise exception 'Invalid default setup equipment types: %', v_invalid;
  end if;

  insert into public.club_equipment_default_setup (
    club_id,
    setup_name,
    frame_catalog_item_id,
    wheelset_catalog_item_id,
    tires_catalog_item_id,
    groupset_catalog_item_id,
    helmet_catalog_item_id,
    shoes_catalog_item_id,
    metadata
  )
  values (
    v_club_id,
    'Default Race Setup',
    p_frame_catalog_item_id,
    p_wheelset_catalog_item_id,
    p_tires_catalog_item_id,
    p_groupset_catalog_item_id,
    p_helmet_catalog_item_id,
    p_shoes_catalog_item_id,
    jsonb_build_object(
      'setup_model', 'catalog_type_preference',
      'updated_by_rpc', 'equipment_save_default_setup_types',
      'updated_at', now()
    )
  )
  on conflict (club_id) do update
  set
    frame_catalog_item_id = excluded.frame_catalog_item_id,
    wheelset_catalog_item_id = excluded.wheelset_catalog_item_id,
    tires_catalog_item_id = excluded.tires_catalog_item_id,
    groupset_catalog_item_id = excluded.groupset_catalog_item_id,
    helmet_catalog_item_id = excluded.helmet_catalog_item_id,
    shoes_catalog_item_id = excluded.shoes_catalog_item_id,

    /* Keep old exact item columns empty because setup is now by type. */
    frame_item_id = null,
    wheelset_item_id = null,
    tires_item_id = null,
    groupset_item_id = null,
    helmet_item_id = null,
    shoes_item_id = null,

    metadata = coalesce(club_equipment_default_setup.metadata, '{}'::jsonb)
      || excluded.metadata,
    updated_at = now();

  return public.equipment_get_default_setup_options(v_club_id);
end;
$function$;

-- Reviewed equipment writer: equipment_save_maintenance_reminder_v1
CREATE OR REPLACE FUNCTION public.equipment_save_maintenance_reminder_v1(p_club_id uuid, p_condition_threshold integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
begin
  -- Saturn unconverted lifecycle guard: run BEFORE equipment, finance,
  -- Coins or any other player-initiated mutation; preserve regular account
  -- behavior, including completed original-UUID email/Google conversion.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  if not public.equipment_current_user_has_premium_v1() then
    raise exception 'Premium membership is required for maintenance reminders.';
  end if;

  if p_condition_threshold not between 1 and 100 then
    raise exception 'Condition threshold must be between 1 and 100.';
  end if;

  insert into public.equipment_premium_preferences (
    club_id,
    maintenance_reminder_threshold,
    updated_by_user_id,
    updated_at
  )
  values (
    v_club_id,
    p_condition_threshold,
    auth.uid(),
    now()
  )
  on conflict (club_id) do update
  set maintenance_reminder_threshold = excluded.maintenance_reminder_threshold,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = excluded.updated_at;
end;
$function$;

-- Reviewed equipment writer: equipment_sell_item
CREATE OR REPLACE FUNCTION public.equipment_sell_item(p_club_id uuid, p_inventory_item_id uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_owner_user_id uuid;
  v_quote jsonb;
  v_sale_value_cash bigint;
  v_finance_tx_id uuid;
  v_current_game_date date;
  v_idempotency_key text;
  v_existing_item jsonb;
begin
  -- Saturn unconverted lifecycle guard: run BEFORE equipment, finance,
  -- Coins or any other player-initiated mutation; preserve regular account
  -- behavior, including completed original-UUID email/Google conversion.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);
  v_idempotency_key := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_idempotency_key is not null then
    select to_jsonb(cei)
    into v_existing_item
    from public.club_equipment_inventory cei
    where cei.club_id = v_club_id
      and cei.id = p_inventory_item_id
      and cei.metadata->>'sale_idempotency_key' = v_idempotency_key
    limit 1;

    if v_existing_item is not null then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'club_id', v_club_id,
        'item', v_existing_item
      );
    end if;
  end if;

  v_quote := public.equipment_quote_sale(v_club_id, p_inventory_item_id);

  if coalesce((v_quote->>'can_sell')::boolean, false) is not true then
    raise exception 'Cannot sell equipment: %', coalesce(v_quote->>'reason', 'unknown reason');
  end if;

  v_sale_value_cash := (v_quote->>'sale_value_cash')::bigint;
  v_current_game_date := public.get_current_game_date_date();

  select owner_user_id
  into v_owner_user_id
  from public.clubs
  where id = v_club_id;

  perform set_config('finance.internal', '1', true);

  v_finance_tx_id := public.finance_credit_to_club(
    v_club_id,
    v_sale_value_cash,
    'equipment_sale',
    'SINK',
    coalesce(v_idempotency_key, 'equipment_sale:' || p_inventory_item_id::text || ':' || gen_random_uuid()::text),
    jsonb_build_object(
      'inventory_item_id', p_inventory_item_id,
      'quote', v_quote,
      'source', 'equipment_sell_item'
    )
  );

  update public.club_equipment_inventory
  set
    status = 'sold',
    sold_game_date = v_current_game_date,
    assigned_rider_id = null,
    current_value_cash = 0,
    metadata = metadata || jsonb_build_object(
      'sale_idempotency_key', v_idempotency_key,
      'sale_value_cash', v_sale_value_cash,
      'sale_finance_transaction_id', v_finance_tx_id,
      'sold_at', now(),
      'sold_game_date', v_current_game_date
    ),
    updated_at = now()
  where id = p_inventory_item_id
    and club_id = v_club_id;

  if v_owner_user_id is not null then
    perform public.create_infrastructure_notification(
      v_owner_user_id,
      'EQUIPMENT_SOLD',
      'Equipment Sold',
      coalesce(v_quote->>'display_name', 'Equipment') || ' sold.',
      '#/dashboard/equipment',
      jsonb_build_object(
        'club_id', v_club_id,
        'inventory_item_id', p_inventory_item_id,
        'sale_value_cash', v_sale_value_cash,
        'finance_transaction_id', v_finance_tx_id
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'inventory_item_id', p_inventory_item_id,
    'sale_value_cash', v_sale_value_cash,
    'finance_transaction_id', v_finance_tx_id,
    'sold_game_date', v_current_game_date,
    'quote', v_quote
  );
end;
$function$;

-- Reviewed equipment writer: equipment_start_maintenance
CREATE OR REPLACE FUNCTION public.equipment_start_maintenance(p_club_id uuid, p_inventory_item_id uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_owner_user_id uuid;
  v_quote jsonb;
  v_current_game_date date;
  v_complete_game_date date;

  v_cost_cash bigint;
  v_duration_game_days integer;
  v_condition_before numeric;
  v_condition_after numeric := 100;

  v_finance_tx_id uuid;
  v_job_id uuid;
  v_idempotency_key text;
  v_existing_job jsonb;
begin
  -- Saturn unconverted lifecycle guard: run BEFORE equipment, finance,
  -- Coins or any other player-initiated mutation; preserve regular account
  -- behavior, including completed original-UUID email/Google conversion.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);
  v_idempotency_key := nullif(trim(coalesce(p_idempotency_key, '')), '');

  if v_idempotency_key is not null then
    select to_jsonb(j)
    into v_existing_job
    from public.club_equipment_maintenance_jobs j
    where j.club_id = v_club_id
      and j.metadata->>'maintenance_idempotency_key' = v_idempotency_key
    order by j.created_at desc
    limit 1;

    if v_existing_job is not null then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'club_id', v_club_id,
        'maintenance_job', v_existing_job
      );
    end if;
  end if;

  v_quote := public.equipment_quote_maintenance(v_club_id, p_inventory_item_id);

  if coalesce((v_quote->>'can_maintain')::boolean, false) is not true then
    raise exception 'Cannot maintain equipment: %', coalesce(v_quote->>'reason', 'unknown reason');
  end if;

  v_cost_cash := (v_quote->>'maintenance_cost_cash')::bigint;
  v_duration_game_days := (v_quote->>'duration_game_days')::integer;
  v_condition_before := (v_quote->>'condition_percent')::numeric;
  v_condition_after := (v_quote->>'condition_after')::numeric;

  v_current_game_date := public.get_current_game_date_date();
  v_complete_game_date := v_current_game_date + v_duration_game_days;

  select owner_user_id
  into v_owner_user_id
  from public.clubs
  where id = v_club_id;

  perform set_config('finance.internal', '1', true);

  v_finance_tx_id := public.finance_spend_from_club(
    v_club_id,
    v_cost_cash,
    'equipment_maintenance',
    'SINK',
    coalesce(v_idempotency_key, 'equipment_maintenance:' || p_inventory_item_id::text || ':' || gen_random_uuid()::text),
    jsonb_build_object(
      'inventory_item_id', p_inventory_item_id,
      'quote', v_quote,
      'source', 'equipment_start_maintenance'
    )
  );

  insert into public.club_equipment_maintenance_jobs (
    club_id,
    inventory_item_id,
    status,
    condition_before,
    condition_after,
    cost_cash,
    finance_transaction_id,
    started_game_date,
    complete_game_date,
    metadata
  )
  values (
    v_club_id,
    p_inventory_item_id,
    'pending',
    v_condition_before,
    v_condition_after,
    v_cost_cash,
    v_finance_tx_id,
    v_current_game_date,
    v_complete_game_date,
    jsonb_build_object(
      'maintenance_idempotency_key', v_idempotency_key,
      'quote', v_quote,
      'started_at', now(),
      'started_game_date', v_current_game_date,
      'complete_game_date', v_complete_game_date
    )
  )
  returning id
  into v_job_id;

  update public.club_equipment_inventory
  set
    status = 'in_maintenance',
    metadata = metadata || jsonb_build_object(
      'active_maintenance_job_id', v_job_id,
      'maintenance_started_game_date', v_current_game_date,
      'maintenance_complete_game_date', v_complete_game_date,
      'maintenance_finance_transaction_id', v_finance_tx_id
    ),
    updated_at = now()
  where id = p_inventory_item_id
    and club_id = v_club_id;

  if v_owner_user_id is not null then
    perform public.create_infrastructure_notification(
      v_owner_user_id,
      'EQUIPMENT_MAINTENANCE_STARTED',
      'Equipment Maintenance Started',
      coalesce(v_quote->>'display_name', 'Equipment') || ' maintenance started.',
      '#/dashboard/equipment',
      jsonb_build_object(
        'club_id', v_club_id,
        'inventory_item_id', p_inventory_item_id,
        'maintenance_job_id', v_job_id,
        'cost_cash', v_cost_cash,
        'complete_game_date', v_complete_game_date,
        'finance_transaction_id', v_finance_tx_id
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'inventory_item_id', p_inventory_item_id,
    'maintenance_job_id', v_job_id,
    'cost_cash', v_cost_cash,
    'finance_transaction_id', v_finance_tx_id,
    'started_game_date', v_current_game_date,
    'complete_game_date', v_complete_game_date,
    'quote', v_quote
  );
end;
$function$;

-- Reviewed equipment writer: equipment_unlock_setup_slot_v1
CREATE OR REPLACE FUNCTION public.equipment_unlock_setup_slot_v1(p_club_id uuid, p_setup_slot smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_user_id uuid := auth.uid();
  v_balance integer;
  v_coin_cost integer := 10;
  v_system_key text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  -- Saturn unconverted lifecycle guard: run BEFORE equipment, finance,
  -- Coins or any other player-initiated mutation; preserve regular account
  -- behavior, including completed original-UUID email/Google conversion.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for equipment'
      using errcode='42501';
  end if;

  v_club_id := public.equipment_assert_club_access(p_club_id);

  if p_setup_slot not in (3, 4) then
    raise exception 'Only setup slots 3 and 4 can be unlocked.';
  end if;

  if public.equipment_current_user_has_premium_v1() then
    return public.equipment_get_premium_features_v1(v_club_id);
  end if;

  if exists (
    select 1
    from public.equipment_setup_slot_unlocks u
    where u.club_id = v_club_id
      and u.setup_slot = p_setup_slot
  ) then
    return public.equipment_get_premium_features_v1(v_club_id);
  end if;

  insert into public.user_wallets (user_id, balance)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance
  into v_balance
  from public.user_wallets w
  where w.user_id = v_user_id
  for update;

  -- Recheck after locking the wallet so concurrent requests cannot double-charge.
  if exists (
    select 1
    from public.equipment_setup_slot_unlocks u
    where u.club_id = v_club_id
      and u.setup_slot = p_setup_slot
  ) then
    return public.equipment_get_premium_features_v1(v_club_id);
  end if;

  if coalesce(v_balance, 0) < v_coin_cost then
    raise exception 'You need % coins to unlock this setup slot. Current balance: %.',
      v_coin_cost,
      coalesce(v_balance, 0);
  end if;

  v_system_key := format(
    'equipment_setup_slot_unlock_%s_%s',
    v_club_id::text,
    p_setup_slot::text
  );

  if exists (
    select 1
    from public.user_coin_ledger l
    where l.user_id = v_user_id
      and l.payload_json ->> 'system_key' = v_system_key
  ) then
    insert into public.equipment_setup_slot_unlocks (
      club_id,
      setup_slot,
      unlocked_with,
      coin_cost,
      unlocked_by_user_id
    )
    values (
      v_club_id,
      p_setup_slot,
      'coins',
      v_coin_cost,
      v_user_id
    )
    on conflict (club_id, setup_slot) do nothing;

    return public.equipment_get_premium_features_v1(v_club_id);
  end if;

  insert into public.user_coin_ledger (
    user_id,
    delta,
    reason,
    payload_json
  )
  values (
    v_user_id,
    -v_coin_cost,
    'equipment_setup_slot_unlock',
    jsonb_build_object(
      'system_key', v_system_key,
      'category', 'equipment',
      'club_id', v_club_id,
      'setup_slot', p_setup_slot,
      'coin_cost', v_coin_cost,
      'permanent_unlock', true
    )
  );

  update public.user_wallets
  set balance = balance - v_coin_cost
  where user_id = v_user_id;

  insert into public.equipment_setup_slot_unlocks (
    club_id,
    setup_slot,
    unlocked_with,
    coin_cost,
    unlocked_by_user_id
  )
  values (
    v_club_id,
    p_setup_slot,
    'coins',
    v_coin_cost,
    v_user_id
  );

  return public.equipment_get_premium_features_v1(v_club_id);
end;
$function$;

