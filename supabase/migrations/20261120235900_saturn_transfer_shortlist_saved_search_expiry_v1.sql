-- SAT-08 additional player shortlist/search write guards — DRAFT only.
-- Existing transfer view/search endpoints stay readable after test expiry.
-- This migration follows saturn_test_account_requires_guard_v1 migration.
-- Never enable before isolated real database/JWT/finance regression testing.

-- Player transfer shortlist writer: transfer_add_rider_to_shortlist_v2
CREATE OR REPLACE FUNCTION public.transfer_add_rider_to_shortlist_v2(p_club_id uuid, p_rider_id uuid, p_rider_name text, p_source_type text, p_source_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_user_id uuid := auth.uid();
  v_real_date date := (now() at time zone 'UTC')::date;
  v_is_premium boolean := false;
  v_used integer := 0;
  v_active_count integer := 0;
  v_coin_cost integer := 0;
  v_balance integer := 0;
  v_addition_number integer;
  v_existing_daily record;
  v_system_key text;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);
  -- Saturn lifecycle remains unconverted until verified email/Google finalization.
  -- Keep original owner access and independent Premium/Coins checks intact.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    raise exception 'Test account expired or not authorized for transfer shortlist'
      using errcode='42501';
  end if;

  v_is_premium := public.transfer_user_has_premium_v1();

  if p_source_type not in (
    'transfer_list',
    'free_agent',
    'external_profile',
    'scouting'
  ) then
    raise exception 'Unsupported shortlist source type.';
  end if;

  if exists (
    select 1
    from public.transfer_shortlist
    where club_id = v_club_id
      and target_type = 'rider'
      and target_id = p_rider_id
      and removed_at is null
  ) then
    return public.transfer_get_rider_shortlist_status_v2(
      v_club_id,
      p_rider_id
    ) || jsonb_build_object('coin_charged', 0, 'already_shortlisted', true);
  end if;

  select count(*)
  into v_active_count
  from public.transfer_shortlist
  where club_id = v_club_id
    and target_type = 'rider'
    and removed_at is null;

  if v_active_count >= 50 then
    raise exception 'Rider shortlist limit reached (50).';
  end if;

  select *
  into v_existing_daily
  from public.transfer_shortlist_daily_additions
  where user_id = v_user_id
    and club_id = v_club_id
    and rider_id = p_rider_id
    and real_date = v_real_date;

  if found then
    v_coin_cost := 0;
  else
    select count(*)
    into v_used
    from public.transfer_shortlist_daily_additions
    where user_id = v_user_id
      and club_id = v_club_id
      and real_date = v_real_date;

    v_addition_number := v_used + 1;
    v_coin_cost := case
      when v_is_premium then 0
      when v_addition_number <= 2 then 0
      else 1
    end;

    if v_coin_cost > 0 then
      insert into public.user_wallets (user_id, balance)
      values (v_user_id, 0)
      on conflict (user_id) do nothing;

      select balance
      into v_balance
      from public.user_wallets
      where user_id = v_user_id
      for update;

      if coalesce(v_balance, 0) < v_coin_cost then
        raise exception
          'You need 1 coin for this shortlist addition. Current balance: %.',
          coalesce(v_balance, 0);
      end if;

      v_system_key := format(
        'transfer_shortlist_%s_%s_%s',
        v_user_id,
        p_rider_id,
        v_real_date
      );

      if not exists (
        select 1
        from public.user_coin_ledger
        where user_id = v_user_id
          and payload_json ->> 'system_key' = v_system_key
      ) then
        insert into public.user_coin_ledger (
          user_id,
          delta,
          reason,
          payload_json
        )
        values (
          v_user_id,
          -1,
          'transfer_shortlist_addition',
          jsonb_build_object(
            'system_key', v_system_key,
            'club_id', v_club_id,
            'rider_id', p_rider_id,
            'real_date', v_real_date,
            'addition_number', v_addition_number,
            'coin_cost', 1
          )
        );

        update public.user_wallets
        set balance = balance - 1
        where user_id = v_user_id;
      end if;
    end if;

    insert into public.transfer_shortlist_daily_additions (
      user_id,
      club_id,
      rider_id,
      real_date,
      addition_number,
      coin_charged,
      source_type,
      source_id
    )
    values (
      v_user_id,
      v_club_id,
      p_rider_id,
      v_real_date,
      v_addition_number,
      v_coin_cost,
      p_source_type,
      p_source_id
    );
  end if;

  insert into public.transfer_shortlist (
    club_id,
    target_type,
    target_id,
    target_name,
    source_type,
    source_id,
    created_by_user_id,
    created_at,
    updated_at,
    removed_at
  )
  values (
    v_club_id,
    'rider',
    p_rider_id,
    btrim(p_rider_name),
    p_source_type,
    p_source_id,
    v_user_id,
    now(),
    now(),
    null
  )
  on conflict (club_id, target_type, target_id)
  do update set
    target_name = excluded.target_name,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    updated_at = now(),
    removed_at = null;

  return public.transfer_get_rider_shortlist_status_v2(
    v_club_id,
    p_rider_id
  ) || jsonb_build_object(
    'coin_charged', v_coin_cost,
    'already_shortlisted', false
  );
end;
$function$;

-- Player transfer shortlist writer: transfer_add_shortlist_target_v1
CREATE OR REPLACE FUNCTION public.transfer_add_shortlist_target_v1(p_club_id uuid, p_target_type text, p_target_id uuid, p_target_name text, p_notes text)
 RETURNS transfer_shortlist
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_count integer;
  v_row public.transfer_shortlist;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);
  -- Saturn lifecycle remains unconverted until verified email/Google finalization.
  -- Keep original owner access and independent Premium/Coins checks intact.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    raise exception 'Test account expired or not authorized for transfer shortlist'
      using errcode='42501';
  end if;


  if not public.transfer_user_has_premium_v1() then
    raise exception 'Premium is required for the transfer shortlist.'
      using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.transfer_shortlist
  where club_id = v_club_id;

  if v_count >= 30 and not exists (
    select 1
    from public.transfer_shortlist
    where club_id = v_club_id
      and target_type = p_target_type
      and target_id = p_target_id
  ) then
    raise exception 'Premium shortlist limit reached (30).';
  end if;

  insert into public.transfer_shortlist (
    club_id,
    target_type,
    target_id,
    target_name,
    notes,
    created_by_user_id
  )
  values (
    v_club_id,
    p_target_type,
    p_target_id,
    btrim(p_target_name),
    nullif(btrim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  on conflict (club_id, target_type, target_id)
  do update set
    target_name = excluded.target_name,
    notes = excluded.notes
  returning * into v_row;

  return v_row;
end;
$function$;

-- Player transfer shortlist writer: transfer_delete_saved_search_v1
CREATE OR REPLACE FUNCTION public.transfer_delete_saved_search_v1(p_saved_search_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_count integer;
begin
  -- Trial expiry applies after email/Google linking until verified conversion.
  -- Direct saved search deletion is a write; read-only searches stay open.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id()) then
    raise exception 'Test account expired or not authorized for transfer shortlist'
      using errcode='42501';
  end if;

  delete from public.transfer_saved_searches s
  using public.clubs c
  where s.id = p_saved_search_id
    and c.id = s.club_id
    and c.owner_user_id = auth.uid();

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

-- Player transfer shortlist writer: transfer_remove_rider_from_shortlist_v2
CREATE OR REPLACE FUNCTION public.transfer_remove_rider_from_shortlist_v2(p_club_id uuid, p_rider_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_count integer;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);
  -- Saturn lifecycle remains unconverted until verified email/Google finalization.
  -- Keep original owner access and independent Premium/Coins checks intact.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    raise exception 'Test account expired or not authorized for transfer shortlist'
      using errcode='42501';
  end if;


  update public.transfer_shortlist
  set
    removed_at = now(),
    updated_at = now()
  where club_id = v_club_id
    and target_type = 'rider'
    and target_id = p_rider_id
    and removed_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

-- Player transfer shortlist writer: transfer_save_market_search_v1
CREATE OR REPLACE FUNCTION public.transfer_save_market_search_v1(p_club_id uuid, p_slot_number smallint, p_search_name text, p_market_type text, p_criteria_json jsonb, p_alerts_enabled boolean)
 RETURNS transfer_saved_searches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_row public.transfer_saved_searches;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);
  -- Saturn lifecycle remains unconverted until verified email/Google finalization.
  -- Keep original owner access and independent Premium/Coins checks intact.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    raise exception 'Test account expired or not authorized for transfer shortlist'
      using errcode='42501';
  end if;


  if not public.transfer_user_has_premium_v1() then
    raise exception 'Premium is required for saved transfer searches.'
      using errcode = '42501';
  end if;

  if p_slot_number < 1 or p_slot_number > 10 then
    raise exception 'Premium saved-search slots are limited to 10.';
  end if;

  insert into public.transfer_saved_searches (
    club_id,
    slot_number,
    search_name,
    market_type,
    criteria_json,
    alerts_enabled,
    created_by_user_id
  )
  values (
    v_club_id,
    p_slot_number,
    btrim(p_search_name),
    p_market_type,
    coalesce(p_criteria_json, '{}'::jsonb),
    true,
    auth.uid()
  )
  on conflict (club_id, slot_number)
  do update set
    search_name = excluded.search_name,
    market_type = excluded.market_type,
    criteria_json = excluded.criteria_json,
    alerts_enabled = true,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$function$;

