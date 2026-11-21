-- Test-only snapshot of 10 production routine definitions, read-only 2026-11-21.
-- Never deploy; lower-level external dependencies are fixture implementations.
CREATE OR REPLACE FUNCTION public._get_club_balance_tier_key(p_club_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier text;
  v_club_type text;
begin
  select
    lower(coalesce(c.club_tier::text, 'amateur')),
    lower(coalesce(c.club_type::text, 'main'))
  into v_tier, v_club_type
  from public.clubs c
  where c.id = p_club_id;

  if v_club_type = 'developing' then
    return 'developing_u23';
  end if;

  if v_tier in ('worldteam', 'world_team', 'world') then
    return 'worldteam';
  elsif v_tier in ('proteam', 'pro_team', 'pro') then
    return 'proteam';
  elsif v_tier in ('continental') then
    return 'continental';
  else
    return 'amateur';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_club_starting_cash_v1(p_club_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_amount bigint;
begin
  select case
    when coalesce(c.is_ai,false) = true
      or c.owner_user_id is null
      or coalesce(c.club_type,'main') = 'developing'
      then 0::bigint
    else coalesce(tbp.starting_cash_user,0)::bigint
  end
  into v_amount
  from public.clubs c
  left join public.team_tier_balance_profiles tbp
    on tbp.tier_key = public._get_club_balance_tier_key(c.id)
  where c.id = p_club_id;

  if not found then
    raise exception 'Club not found: %', p_club_id;
  end if;

  return coalesce(v_amount,0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_or_create_club_account(p_club_id uuid, p_currency text DEFAULT 'CASH'::text, p_kind text DEFAULT 'main'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account_id uuid;
begin
  if p_club_id is null then
    raise exception 'p_club_id is required';
  end if;

  if p_currency is null or btrim(p_currency) = '' then
    raise exception 'p_currency is required';
  end if;

  if p_kind is null or btrim(p_kind) = '' then
    raise exception 'p_kind is required';
  end if;

  -- Allow SQL editor / cron / service_role runs.
  -- Only enforce membership when there is a real authenticated user.
  if auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'You are not allowed to access finance account for this club';
  end if;

  insert into finance.accounts (club_id, currency, kind)
  values (p_club_id, p_currency, p_kind)
  on conflict (club_id, currency, kind) do nothing;

  select a.id
  into v_account_id
  from finance.accounts a
  where a.club_id = p_club_id
    and a.currency = p_currency
    and a.kind = p_kind
  limit 1;

  if v_account_id is null then
    raise exception 'Could not get or create club account for club %, currency %, kind %',
      p_club_id, p_currency, p_kind;
  end if;

  return v_account_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_grant_new_club_bonus(p_club_id uuid, p_amount bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_amount bigint;
  v_tx uuid;
  v_club_acct uuid;
  v_treasury uuid;
  v_derived boolean := p_amount is null;
begin
  if p_club_id is null then
    raise exception 'p_club_id is required';
  end if;

  if v_derived then
    v_amount := public.get_club_starting_cash_v1(p_club_id);
    -- AI/developing clubs intentionally use no real starting finance.
    if coalesce(v_amount,0) <= 0 then
      return null;
    end if;
  else
    v_amount := p_amount;
    if v_amount <= 0 then
      raise exception 'Bonus amount must be > 0';
    end if;
  end if;

  insert into finance.accounts(club_id, currency, kind)
  values (p_club_id, 'CASH', 'main')
  on conflict (club_id, currency, kind) do nothing;

  select id into v_club_acct
  from finance.accounts
  where club_id=p_club_id and currency='CASH' and kind='main';

  select id into v_treasury
  from finance.accounts
  where system_code='TREASURY' and currency='CASH' and kind='main';

  if v_treasury is null then
    raise exception 'TREASURY cash account not found';
  end if;

  v_tx := extensions.gen_random_uuid();

  begin
    insert into finance.transactions(id, type, created_by, metadata)
    values (
      v_tx,
      'new_club_bonus',
      auth.uid(),
      jsonb_build_object(
        'club_id', p_club_id,
        'amount', v_amount,
        'source', case when v_derived then 'team_tier_balance_profiles' else 'explicit_amount' end
      )
    );

    insert into finance.event_locks(event_type, club_id, ref_id, transaction_id)
    values ('new_club_bonus', p_club_id, p_club_id, v_tx);
  exception when unique_violation then
    select transaction_id into v_tx
    from finance.event_locks
    where event_type='new_club_bonus' and club_id=p_club_id and ref_id=p_club_id;
    return v_tx;
  end;

  insert into finance.entries(transaction_id, account_id, amount, memo)
  values
    (v_tx, v_treasury, -v_amount, 'new club starting cash debit'),
    (v_tx, v_club_acct, v_amount, 'new club starting cash credit');

  return v_tx;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_credit_to_club(p_club_id uuid, p_amount bigint, p_type text DEFAULT 'income'::text, p_source_code text DEFAULT 'SINK'::text, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid;
  v_role text;
  v_internal boolean := coalesce(current_setting('finance.internal', true), '') = '1';

  v_club_acct uuid;
  v_source_acct uuid;
  v_tx uuid;

  v_game_ts timestamptz;
  v_game_metadata jsonb;
  v_metadata jsonb;
begin
  v_uid := auth.uid();
  v_role := current_setting('request.jwt.claim.role', true);

  if v_internal and v_uid is null then
    select c.owner_user_id
    into v_uid
    from public.clubs c
    where c.id = p_club_id
    limit 1;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  if v_uid is not null and coalesce(v_role, '') <> 'service_role' and not v_internal then
    if not finance.can_spend_from_club(p_club_id, v_uid) then
      raise exception 'Not allowed to credit this club';
    end if;
  end if;

  v_game_ts := public.get_current_game_timestamp();

  v_game_metadata := jsonb_build_object(
    'game_date',
    jsonb_build_object(
      'season', public.season_from_game_timestamp(v_game_ts),
      'month', extract(month from v_game_ts at time zone 'UTC')::int,
      'day', extract(day from v_game_ts at time zone 'UTC')::int,
      'hour', extract(hour from v_game_ts at time zone 'UTC')::int,
      'minute', extract(minute from v_game_ts at time zone 'UTC')::int
    )
  );

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || v_game_metadata;

  perform public.finance_get_or_create_club_account(p_club_id, 'CASH', 'main');

  select a.id
  into v_club_acct
  from finance.accounts a
  where a.club_id = p_club_id
    and a.currency = 'CASH'
    and a.kind = 'main';

  select a.id
  into v_source_acct
  from finance.accounts a
  where a.system_code = p_source_code
    and a.currency = 'CASH'
    and a.kind = 'main';

  if v_source_acct is null then
    raise exception 'Unknown source_code: %', p_source_code;
  end if;

  if p_idempotency_key is not null then
    insert into finance.transactions(type, created_by, idempotency_key, metadata)
    values (p_type, v_uid, p_idempotency_key, v_metadata)
    on conflict (created_by, idempotency_key) do nothing
    returning id into v_tx;

    if v_tx is null then
      select t.id
      into v_tx
      from finance.transactions t
      where t.created_by is not distinct from v_uid
        and t.idempotency_key = p_idempotency_key
      order by t.created_at desc
      limit 1;

      if v_tx is not null then
        return v_tx;
      end if;

      select t.id
      into v_tx
      from finance.transactions t
      where t.idempotency_key = p_idempotency_key
      order by t.created_at desc
      limit 1;

      if v_tx is not null then
        return v_tx;
      end if;
    end if;
  else
    insert into finance.transactions(type, created_by, metadata)
    values (p_type, v_uid, v_metadata)
    returning id into v_tx;
  end if;

  insert into finance.account_balances(account_id, balance)
  values (v_club_acct, 0)
  on conflict (account_id) do nothing;

  insert into finance.account_balances(account_id, balance)
  values (v_source_acct, 0)
  on conflict (account_id) do nothing;

  insert into finance.entries(transaction_id, account_id, amount, memo)
  values
    (v_tx, v_source_acct, -p_amount, 'income source debit'),
    (v_tx, v_club_acct,    p_amount, 'income club credit');

  return v_tx;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_setup_new_club(p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
begin
  perform public.finance_get_or_create_club_account(p_club_id, 'CASH', 'main');
  perform public.finance_grant_new_club_bonus(p_club_id, null);
end;
$function$;

CREATE OR REPLACE FUNCTION public._apply_new_club_starting_cash_v1(p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_ai boolean;
  v_owner_user_id uuid;
  v_tier_key text;
  v_starting_cash bigint := 0;
  v_current_cash numeric := 0;
  v_missing_amount bigint := 0;
  v_tx uuid;
begin
  select
    coalesce(c.is_ai, false),
    c.owner_user_id,
    coalesce(c.cash_balance, 0)
  into
    v_is_ai,
    v_owner_user_id,
    v_current_cash
  from public.clubs c
  where c.id = p_club_id;

  -- AI teams do not receive real finance starting capital.
  if v_is_ai = true or v_owner_user_id is null then
    return;
  end if;

  v_tier_key := public._get_club_balance_tier_key(p_club_id);

  select coalesce(tbp.starting_cash_user, 0)
  into v_starting_cash
  from public.team_tier_balance_profiles tbp
  where tbp.tier_key = v_tier_key;

  v_missing_amount := greatest(0, v_starting_cash - floor(v_current_cash)::bigint);

  if v_missing_amount <= 0 then
    return;
  end if;

  if to_regprocedure('public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)') is null then
    raise exception 'Missing required finance helper public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb).';
  end if;

  /*
    Mark this as internal finance operation for SECURITY DEFINER flow.
    finance_credit_to_club then resolves the club owner as created_by.
  */
  perform set_config('finance.internal', '1', true);

  select public.finance_credit_to_club(
    p_club_id,
    v_missing_amount,
    'new_club_bonus',
    'TREASURY',
    'new_club_starting_cash_delta_v1:' || p_club_id::text || ':' || v_tier_key || ':' || v_starting_cash::text,
    jsonb_build_object(
      'reason', 'new_club_starting_cash_delta',
      'club_id', p_club_id,
      'tier_key', v_tier_key,
      'expected_starting_cash', v_starting_cash,
      'cash_before_delta', v_current_cash,
      'delta_amount', v_missing_amount
    )
  )
  into v_tx;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_new_club_creation_balance_v1(p_club_id uuid, p_apply_cash boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tier_key text;
  v_starting_cash bigint := 0;
  v_cash_balance numeric := 0;
  v_generated_riders int := 0;
  v_domestic_riders int := 0;
  v_country_code text;
  v_roles jsonb := '{}'::jsonb;
  v_role_ok boolean := false;
  v_roster_ok boolean := false;
  v_detached_riders int := 0;
  v_roster_action text := 'kept_existing_roster';
  v_market_result jsonb := '{}'::jsonb;
begin
  select c.country_code
  into v_country_code
  from public.clubs c
  where c.id = p_club_id;

  if v_country_code is null then
    raise exception 'Club % not found or has no country_code.', p_club_id;
  end if;

  v_tier_key := public._get_club_balance_tier_key(p_club_id);

  select coalesce(tbp.starting_cash_user, 0)
  into v_starting_cash
  from public.team_tier_balance_profiles tbp
  where tbp.tier_key = v_tier_key;

  -- Cash is applied only through the finance ledger.
  if p_apply_cash then
    perform public._apply_new_club_starting_cash_v1(p_club_id);
  end if;

  -- Minimum valid policy defaults.
  insert into public.club_team_policies (
    club_id,
    flight_class,
    hotel_level,
    ground_transport,
    logistics_support_level,
    team_vehicle_policy,
    rider_housing_support,
    nutrition_support_level,
    recovery_support_level,
    staff_equipment_level,
    staff_accommodation_level,
    rider_bonus_plan,
    staff_bonus_plan
  )
  values (
    p_club_id,
    'economy',
    'budget',
    'standard_vans',
    'none',
    'none',
    'none',
    'none',
    'none',
    'basic',
    'shared',
    'none',
    'none'
  )
  on conflict (club_id) do update
  set
    flight_class = excluded.flight_class,
    hotel_level = excluded.hotel_level,
    ground_transport = excluded.ground_transport,
    logistics_support_level = excluded.logistics_support_level,
    team_vehicle_policy = excluded.team_vehicle_policy,
    rider_housing_support = excluded.rider_housing_support,
    nutrition_support_level = excluded.nutrition_support_level,
    recovery_support_level = excluded.recovery_support_level,
    staff_equipment_level = excluded.staff_equipment_level,
    staff_accommodation_level = excluded.staff_accommodation_level,
    rider_bonus_plan = excluded.rider_bonus_plan,
    staff_bonus_plan = excluded.staff_bonus_plan,
    updated_at = now();

  -- Club House / HQ Level 1 only.
  insert into public.club_infrastructure (
    club_id,
    hq_level,
    training_center_level,
    medical_center_level,
    scouting_level,
    equipment_level,
    youth_academy_level,
    mechanics_workshop_level,
    team_car_fleet_quantity,
    team_bus_quantity,
    equipment_van_quantity,
    logistics_truck_quantity,
    mobile_workshop_quantity,
    medical_van_quantity
  )
  values (
    p_club_id,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (club_id) do update
  set
    hq_level = excluded.hq_level,
    training_center_level = excluded.training_center_level,
    medical_center_level = excluded.medical_center_level,
    scouting_level = excluded.scouting_level,
    equipment_level = excluded.equipment_level,
    youth_academy_level = excluded.youth_academy_level,
    mechanics_workshop_level = excluded.mechanics_workshop_level,
    team_car_fleet_quantity = excluded.team_car_fleet_quantity,
    team_bus_quantity = excluded.team_bus_quantity,
    equipment_van_quantity = excluded.equipment_van_quantity,
    logistics_truck_quantity = excluded.logistics_truck_quantity,
    mobile_workshop_quantity = excluded.mobile_workshop_quantity,
    medical_van_quantity = excluded.medical_van_quantity,
    updated_at = now();

  -- Current roster check.
  select
    count(cr.rider_id),
    count(*) filter (where r.country_code = c.country_code)
  into
    v_generated_riders,
    v_domestic_riders
  from public.clubs c
  left join public.club_riders cr on cr.club_id = c.id
  left join public.riders r on r.id = cr.rider_id
  where c.id = p_club_id
  group by c.id;

  select coalesce(jsonb_object_agg(role_name, rider_count), '{}'::jsonb)
  into v_roles
  from (
    select
      r.role::text as role_name,
      count(*) as rider_count
    from public.club_riders cr
    join public.riders r on r.id = cr.rider_id
    where cr.club_id = p_club_id
    group by r.role::text
  ) x;

  v_role_ok :=
    coalesce((v_roles->>'Leader')::int, 0) = 1
    and coalesce((v_roles->>'Sprinter')::int, 0) = 1
    and coalesce((v_roles->>'Climber')::int, 0) = 1
    and coalesce((v_roles->>'All-rounder')::int, 0) = 3
    and coalesce((v_roles->>'Domestique')::int, 0) = 3
    and coalesce((v_roles->>'Breakaway')::int, 0) = 1;

  v_roster_ok :=
    coalesce(v_generated_riders, 0) = 10
    and coalesce(v_domestic_riders, 0) = 10
    and v_role_ok;

  if not v_roster_ok then
    delete from public.club_riders
    where club_id = p_club_id;

    get diagnostics v_detached_riders = row_count;

    perform public._generate_domestic_roster_for_club(p_club_id);

    v_roster_action := 'detached_old_riders_and_generated_new_roster';
  end if;

  -- Market-value balance for final starter riders.
  v_market_result := public.rebalance_new_club_starter_market_values_v1(p_club_id);

  -- Read final cash after all ledger actions.
  select coalesce(c.cash_balance, 0)
  into v_cash_balance
  from public.clubs c
  where c.id = p_club_id;

  -- Ensure club_finance_summary exists and matches final cash.
  insert into public.club_finance_summary (club_id, current_balance)
  values (p_club_id, v_cash_balance)
  on conflict (club_id) do update
  set current_balance = excluded.current_balance;

  -- Final rider count.
  select
    count(cr.rider_id),
    count(*) filter (where r.country_code = c.country_code)
  into
    v_generated_riders,
    v_domestic_riders
  from public.clubs c
  left join public.club_riders cr on cr.club_id = c.id
  left join public.riders r on r.id = cr.rider_id
  where c.id = p_club_id
  group by c.id;

  return jsonb_build_object(
    'status', 'completed',
    'club_id', p_club_id,
    'tier_key', v_tier_key,
    'apply_cash', p_apply_cash,
    'expected_starting_cash', v_starting_cash,
    'cash_balance', v_cash_balance,
    'generated_riders', coalesce(v_generated_riders, 0),
    'domestic_riders', coalesce(v_domestic_riders, 0),
    'roster_action', v_roster_action,
    'detached_old_riders', v_detached_riders,
    'market_value_balance', v_market_result,
    'finance_summary_synced', true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public._clubs_after_insert_new_team_setup_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Hidden National Team clubs are technical race-engine identities only.
  -- They must never receive a generated domestic starter roster.
  if public.is_national_team_club_v1(new.id) then
    return new;
  end if;

  perform public.apply_new_club_creation_balance_v1(new.id, false);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.user_has_premium_access_v1(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.user_has_paid_premium_access_v1(p_user_id)
    or exists (
      select 1 from public.premium_welcome_trials_v1 trial
      where trial.user_id=p_user_id and trial.expires_at>now()
    );
$function$;
