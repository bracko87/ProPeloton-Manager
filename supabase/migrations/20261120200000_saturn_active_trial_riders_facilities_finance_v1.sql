-- SAT-08: additional player-initiated rider, infrastructure and finance
-- mutations. Keep production gate disabled until staging JWT validation.
-- Preserve normal registered-user behavior and scheduler calls without a
-- canonical anonymous Auth identity; guard runs only for anonymous owners.

CREATE OR REPLACE FUNCTION public.finance_issue_emergency_loan(p_club_id uuid, p_reason text, p_ref_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);
  -- SAT-08: canonical temporary manager may modify only its own active
  -- 14-day team. Registered managers retain original ownership checks.
  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_finance_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;



  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds',
      'club_id',v_finance_club_id,
      'loan_issued',false,
      'reason','AI clubs do not use insolvency or emergency loans.'
    );
  end if;

  return public.finance_issue_emergency_loan_non_ai_core_v1(
    p_club_id,p_reason,p_ref_id,p_idempotency_key
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.purchase_race_replay_access_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_balance integer := 0;
  v_system_key text;
  v_access jsonb;
begin
  if v_user_id is null then raise exception 'Not authenticated.' using errcode='28000'; end if;
  if p_race_id is null then raise exception 'Race id is required.'; end if;
  -- SAT-08: canonical temporary manager may modify only its own active
  -- 14-day team. Registered managers retain original ownership checks.
  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id()) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;



  v_access := private.current_user_race_replay_access_v1(p_race_id);
  if coalesce((v_access->>'allowed')::boolean,false) then
    return public.get_race_replay_coin_access_v1(p_race_id);
  end if;

  insert into public.user_wallets(user_id,balance) values(v_user_id,0)
  on conflict(user_id) do nothing;

  select w.balance into v_balance
  from public.user_wallets w where w.user_id=v_user_id for update;

  if coalesce(v_balance,0)<2 then
    raise exception 'You need 2 coins to unlock this race replay. Current balance: %.',coalesce(v_balance,0);
  end if;

  v_system_key:=format('race_replay_unlock_%s_%s',v_user_id::text,p_race_id::text);

  if not exists(
    select 1 from public.user_coin_ledger l
    where l.user_id=v_user_id and l.payload_json->>'system_key'=v_system_key
  ) then
    insert into public.user_coin_ledger(user_id,delta,reason,payload_json)
    values(v_user_id,-2,'race_replay_unlock',jsonb_build_object(
      'system_key',v_system_key,'category','race_replay','race_id',p_race_id,
      'coin_cost',2,'permanent_unlock',true
    ));
    update public.user_wallets set balance=balance-2 where user_id=v_user_id;
  end if;

  insert into public.race_replay_coin_unlocks(user_id,race_id,coin_cost)
  values(v_user_id,p_race_id,2)
  on conflict(user_id,race_id) do nothing;

  return public.get_race_replay_coin_access_v1(p_race_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.release_club_staff(p_staff_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_staff public.club_staff%rowtype;
  v_owner_user_id uuid;
  v_release_cost integer;
  v_idempotency_key text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'release_club_staff: user not authenticated';
  end if;

  select *
  into v_staff
  from public.club_staff
  where id = p_staff_id
    and is_active = true
  limit 1;

  if v_staff.id is null then
    raise exception 'release_club_staff: active staff member not found';
  end if;

  select c.owner_user_id
  into v_owner_user_id
  from public.clubs c
  where c.id = v_staff.club_id
  limit 1;

  if v_owner_user_id is distinct from v_user_id then
    raise exception 'release_club_staff: staff member does not belong to current user';
  end if;

  v_release_cost := greatest(0, coalesce(v_staff.salary_weekly, 0) * 6);
  -- SAT-08: canonical temporary manager may modify only its own active
  -- 14-day team. Registered managers retain original ownership checks.
  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_staff.club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;


  v_idempotency_key := 'staff_release_cost:' || v_staff.id::text;

  if v_release_cost > 0 then
    perform set_config('finance.internal', '1', true);

    perform public.finance_spend_from_club(
      v_staff.club_id,
      v_release_cost,
      'staff_release_cost',
      'SINK',
      v_idempotency_key,
      jsonb_build_object(
        'staff_id', v_staff.id,
        'staff_name', v_staff.staff_name,
        'role_type', v_staff.role_type,
        'weeks_paid', 6
      )
    );
  end if;

  update public.club_staff
  set
    is_active = false,
    updated_at = now()
  where id = v_staff.id;

  return;
end;
$function$


CREATE OR REPLACE FUNCTION public.release_owned_rider(p_rider_id uuid)
 RETURNS TABLE(free_agent_id uuid, rider_id uuid, released_from_club_id uuid, release_cost bigint, remaining_weeks integer, remaining_salary bigint, expires_on_game_date date, finance_transaction_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_main_club_id uuid;
  v_game_date date;

  v_contract public.rider_contracts%rowtype;
  v_listing_id uuid;

  v_season_end date;
  v_days_until_end_of_season integer;
  v_remaining_days integer;
  v_remaining_weeks integer;
  v_remaining_salary bigint;
  v_release_cost bigint;
  v_finance_tx uuid;
  v_idempotency_key text;

  v_market_value bigint;

  v_result_free_agent_id uuid;
  v_result_rider_id uuid;
  v_result_expires_on_game_date date;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_main_club_id := public._get_owned_main_club_id(v_uid);
  -- SAT-08: canonical temporary manager may modify only its own active
  -- 14-day team. Registered managers retain original ownership checks.
  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_main_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;



  if v_main_club_id is null then
    raise exception 'Main club not found';
  end if;

  v_game_date := public.get_current_game_date_date();

  if v_game_date is null then
    raise exception 'Game date is not available';
  end if;

  if not exists (
    select 1
    from public.club_riders cr
    where cr.club_id = v_main_club_id
      and cr.rider_id = p_rider_id
  ) then
    raise exception 'Rider does not belong to your main club';
  end if;

  select rc.*
  into v_contract
  from public.rider_contracts rc
  where rc.rider_id = p_rider_id
    and rc.club_id = v_main_club_id
    and rc.status = 'active'
  order by rc.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Active rider contract not found';
  end if;

  select l.id
  into v_listing_id
  from public.rider_transfer_listings l
  where l.rider_id = p_rider_id
    and l.status in ('listed', 'active', 'open')
  order by l.created_at desc nulls last, l.listed_on_game_date desc nulls last
  limit 1
  for update;

  if v_listing_id is not null then
    raise exception 'Rider is currently on the transfer list. Cancel the transfer listing before releasing him';
  end if;

  begin
    select public.calculate_rider_market_value(p_rider_id)::bigint
    into v_market_value;
  exception
    when others then
      v_market_value := null;
  end;

  v_remaining_days :=
    greatest(0, coalesce(v_contract.expires_on, v_game_date) - v_game_date);

  v_remaining_weeks :=
    case
      when v_remaining_days <= 0 then 0
      else ceil(v_remaining_days / 7.0)::integer
    end;

  v_remaining_salary :=
    coalesce(v_contract.salary_weekly, 0)::bigint * v_remaining_weeks::bigint;

  v_release_cost :=
    ceil(v_remaining_salary::numeric * 0.20)::bigint;

  begin
    if v_release_cost > 0 then
      v_idempotency_key :=
        format('release-rider:%s:%s:%s', v_main_club_id, p_rider_id, v_game_date);

      v_finance_tx := public.finance_spend_from_club(
        p_club_id => v_main_club_id,
        p_amount => v_release_cost,
        p_type => 'rider_release_compensation',
        p_sink_code => 'SINK',
        p_idempotency_key => v_idempotency_key,
        p_metadata => jsonb_build_object(
          'rider_id', p_rider_id,
          'contract_id', v_contract.id,
          'salary_weekly', v_contract.salary_weekly,
          'contract_expires_on', v_contract.expires_on,
          'remaining_weeks', v_remaining_weeks,
          'remaining_salary', v_remaining_salary,
          'release_cost', v_release_cost,
          'paid_to_rider_pct', 20
        )
      );
    else
      v_finance_tx := null;
    end if;
  exception
    when others then
      raise exception 'release_owned_rider.finance_spend_from_club failed: [%] %', SQLSTATE, SQLERRM;
  end;

  v_season_end :=
    public.get_game_date_for_season_end(public.season_from_game_date(v_game_date));

  if v_season_end is null then
    raise exception 'Season end date is not available';
  end if;

  v_days_until_end_of_season :=
    greatest(1, v_season_end - v_game_date);

  begin
    select
      fa.free_agent_id,
      fa.rider_id,
      fa.expires_on_game_date
    into
      v_result_free_agent_id,
      v_result_rider_id,
      v_result_expires_on_game_date
    from public.release_rider_to_free_agents(
      p_rider_id => p_rider_id,
      p_expires_in_days => v_days_until_end_of_season
    ) fa
    limit 1;
  exception
    when others then
      raise exception 'release_owned_rider.release_rider_to_free_agents failed: [%] %', SQLSTATE, SQLERRM;
  end;

  perform public.create_rider_released_to_free_agents_notification(
    p_rider_id => p_rider_id,
    p_club_id => v_main_club_id,
    p_free_agent_id => v_result_free_agent_id,
    p_release_game_date => v_game_date,
    p_release_cost => v_release_cost,
    p_salary_weekly => v_contract.salary_weekly::bigint,
    p_market_value => v_market_value
  );

  return query
  select
    v_result_free_agent_id,
    v_result_rider_id,
    v_main_club_id,
    v_release_cost,
    v_remaining_weeks,
    v_remaining_salary,
    v_result_expires_on_game_date,
    v_finance_tx;
end;
$function$


CREATE OR REPLACE FUNCTION public.release_rider_to_free_agents(p_rider_id uuid, p_expires_in_days integer DEFAULT 14)
 RETURNS TABLE(free_agent_id uuid, rider_id uuid, source_type text, source_club_id uuid, desired_tier text, expected_salary_weekly integer, min_acceptable_salary_weekly integer, preferred_duration_seasons smallint, available_from_game_date date, expires_on_game_date date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_actor_club_id uuid;
  v_game_date date;

  v_current_salary integer;
  v_age_years integer;
  v_overall smallint;
  v_potential smallint;
  v_role public.rider_role;
  v_current_morale smallint;
  v_club_tier_text text;

  v_desired_tier text;
  v_expected_salary integer;
  v_min_acceptable_salary integer;
  v_preferred_duration smallint;
  v_expires_on_game_date date;

  v_active_contract_id uuid;
  v_free_agent_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_actor_club_id := public._get_owned_main_club_id(v_uid);
  -- SAT-08: canonical temporary manager may modify only its own active
  -- 14-day team. Registered managers retain original ownership checks.
  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_actor_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;


  if v_actor_club_id is null then
    raise exception 'Main club not found';
  end if;

  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then
    raise exception 'Game date is not available';
  end if;

  if coalesce(p_expires_in_days, 0) < 1 then
    raise exception 'p_expires_in_days must be at least 1';
  end if;

  select
    r.salary,
    public.get_age_years_on_game_date(r.birth_date),
    r.overall,
    r.potential,
    r.role,
    r.morale,
    c.club_tier::text
  into
    v_current_salary,
    v_age_years,
    v_overall,
    v_potential,
    v_role,
    v_current_morale,
    v_club_tier_text
  from public.riders r
  join public.club_riders cr
    on cr.rider_id = r.id
  join public.clubs c
    on c.id = cr.club_id
  where r.id = p_rider_id
    and cr.club_id = v_actor_club_id
  for update of r, cr, c;

  if not found then
    raise exception 'Rider is not assigned to your main club';
  end if;

  if exists (
    select 1
    from public.rider_transfer_listings l
    where l.rider_id = p_rider_id
      and l.status in ('listed', 'active', 'open')
  ) then
    raise exception 'Rider is currently listed on the transfer market';
  end if;

  select rc.id
  into v_active_contract_id
  from public.rider_contracts rc
  where rc.rider_id = p_rider_id
    and rc.club_id = v_actor_club_id
    and rc.status = 'active'
  limit 1
  for update;

  if v_active_contract_id is null then
    raise exception 'Active rider contract not found';
  end if;

  v_desired_tier :=
    case coalesce(v_club_tier_text, 'proteam')
      when 'amateur' then 'amateur'
      when 'continental' then 'continental'
      else 'proteam'
    end;

  v_expected_salary := greatest(coalesce(v_current_salary, 0), 250);
  v_min_acceptable_salary := greatest(floor(v_expected_salary * 0.90)::integer, 100);
  v_preferred_duration := public.suggest_initial_contract_seasons(
    coalesce(v_age_years, 25),
    coalesce(v_overall, 50)::smallint,
    coalesce(v_potential, 50)::smallint
  );

  v_expires_on_game_date := v_game_date + p_expires_in_days;

  update public.rider_contracts rc
  set
    status = 'released',
    notes_json = coalesce(rc.notes_json, '{}'::jsonb)
      || jsonb_build_object(
           'released_to_free_agents_at', now(),
           'released_from_club_id', v_actor_club_id,
           'released_on_game_date', v_game_date,
           'released_by_user_id', v_uid
         )
  where rc.id = v_active_contract_id;

  delete from public.club_riders cr
  where cr.club_id = v_actor_club_id
    and cr.rider_id = p_rider_id;

  insert into public.rider_free_agents (
    rider_id,
    source_type,
    source_club_id,
    desired_tier,
    expected_salary_weekly,
    min_acceptable_salary_weekly,
    preferred_duration_seasons,
    available_from_game_date,
    expires_on_game_date,
    status
  )
  values (
    p_rider_id,
    'released',
    v_actor_club_id,
    v_desired_tier,
    v_expected_salary,
    v_min_acceptable_salary,
    v_preferred_duration,
    v_game_date,
    v_expires_on_game_date,
    'available'
  )
  on conflict on constraint rider_free_agents_rider_id_key
  do update set
    source_type = excluded.source_type,
    source_club_id = excluded.source_club_id,
    desired_tier = excluded.desired_tier,
    expected_salary_weekly = excluded.expected_salary_weekly,
    min_acceptable_salary_weekly = excluded.min_acceptable_salary_weekly,
    preferred_duration_seasons = excluded.preferred_duration_seasons,
    available_from_game_date = excluded.available_from_game_date,
    expires_on_game_date = excluded.expires_on_game_date,
    status = 'available';

  select rfa.id
  into v_free_agent_id
  from public.rider_free_agents rfa
  where rfa.rider_id = p_rider_id
  limit 1;

  delete from public.rider_free_agent_negotiations rfan
  where rfan.free_agent_id = v_free_agent_id;

  update public.riders r
  set
    release_requested = false,
    asking_price = null,
    asking_price_manual = false,
    asking_price_updated_at = now()
  where r.id = p_rider_id;

  return query
  select
    fa.id as free_agent_id,
    fa.rider_id,
    fa.source_type,
    fa.source_club_id,
    fa.desired_tier,
    fa.expected_salary_weekly,
    fa.min_acceptable_salary_weekly,
    fa.preferred_duration_seasons,
    fa.available_from_game_date,
    fa.expires_on_game_date,
    fa.status
  from public.rider_free_agents fa
  where fa.id = v_free_agent_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.sell_infrastructure_asset(p_asset_key text, p_asset_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_quote record;
  v_current_game_date date;
  v_tx_id uuid;
begin
  select *
  into v_quote
  from public.quote_infrastructure_asset_sale(p_asset_key, p_asset_id);

  if not coalesce(v_quote.can_sell, false) then
    raise exception '%', v_quote.reason;
  end if;

  v_current_game_date := public.get_current_game_date_date();
  -- SAT-08: canonical temporary manager may modify only its own active
  -- 14-day team. Registered managers retain original ownership checks.
  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_quote.club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;



  if v_current_game_date is null then
    raise exception 'sell_infrastructure_asset: could not resolve current game date';
  end if;

  perform set_config('finance.internal', '1', true);

  v_tx_id := public.finance_credit_to_club(
    p_club_id := v_quote.club_id,
    p_amount := v_quote.sale_value_cash,
    p_type := 'infrastructure_asset_sale',
    p_source_code := 'SINK',
    p_idempotency_key := 'asset_sale:' || v_quote.asset_key || ':' || v_quote.asset_id::text,
    p_metadata := jsonb_build_object(
      'asset_key', v_quote.asset_key,
      'asset_id', v_quote.asset_id,
      'display_name', v_quote.display_name,
      'asset_level', v_quote.asset_level,
      'purchase_cost_cash', v_quote.purchase_cost_cash,
      'condition_percent', v_quote.condition_percent,
      'sale_value_cash', v_quote.sale_value_cash
    )
  );

  if v_quote.asset_key = 'team_car' then
    update public.club_team_cars
    set
      status = 'sold',
      sold_game_date = v_current_game_date,
      current_assignment_type = null,
      current_assignment_id = null,
      current_assignment_label = null,
      assignment_locked = false,
      assignment_start_game_date = null,
      assignment_end_game_date = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'sold_transaction_id', v_tx_id,
        'sold_game_date', v_current_game_date,
        'sale_value_cash', v_quote.sale_value_cash
      )
    where id = v_quote.asset_id;

    update public.club_infrastructure
    set team_car_fleet_quantity = greatest(team_car_fleet_quantity - 1, 0)
    where club_id = v_quote.club_id;

  elsif v_quote.asset_key = 'team_bus' then
    update public.club_team_buses
    set
      status = 'sold',
      sold_game_date = v_current_game_date,
      current_assignment_type = null,
      current_assignment_id = null,
      current_assignment_label = null,
      assignment_locked = false,
      assignment_start_game_date = null,
      assignment_end_game_date = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'sold_transaction_id', v_tx_id,
        'sold_game_date', v_current_game_date,
        'sale_value_cash', v_quote.sale_value_cash
      )
    where id = v_quote.asset_id;

    update public.club_infrastructure
    set team_bus_quantity = greatest(team_bus_quantity - 1, 0)
    where club_id = v_quote.club_id;

  elsif v_quote.asset_key = 'equipment_van' then
    update public.club_equipment_vans
    set
      status = 'sold',
      sold_game_date = v_current_game_date,
      current_assignment_type = null,
      current_assignment_id = null,
      current_assignment_label = null,
      assignment_locked = false,
      assignment_start_game_date = null,
      assignment_end_game_date = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'sold_transaction_id', v_tx_id,
        'sold_game_date', v_current_game_date,
        'sale_value_cash', v_quote.sale_value_cash
      )
    where id = v_quote.asset_id;

    update public.club_infrastructure
    set equipment_van_quantity = greatest(equipment_van_quantity - 1, 0)
    where club_id = v_quote.club_id;

  elsif v_quote.asset_key = 'mobile_workshop' then
    update public.club_mobile_workshops
    set
      status = 'sold',
      sold_game_date = v_current_game_date,
      current_assignment_type = null,
      current_assignment_id = null,
      current_assignment_label = null,
      assignment_locked = false,
      assignment_start_game_date = null,
      assignment_end_game_date = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'sold_transaction_id', v_tx_id,
        'sold_game_date', v_current_game_date,
        'sale_value_cash', v_quote.sale_value_cash
      )
    where id = v_quote.asset_id;

    update public.club_infrastructure
    set mobile_workshop_quantity = greatest(mobile_workshop_quantity - 1, 0)
    where club_id = v_quote.club_id;

  elsif v_quote.asset_key = 'medical_van' then
    update public.club_medical_vans
    set
      status = 'sold',
      sold_game_date = v_current_game_date,
      current_assignment_type = null,
      current_assignment_id = null,
      current_assignment_label = null,
      assignment_locked = false,
      assignment_start_game_date = null,
      assignment_end_game_date = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'sold_transaction_id', v_tx_id,
        'sold_game_date', v_current_game_date,
        'sale_value_cash', v_quote.sale_value_cash
      )
    where id = v_quote.asset_id;

    update public.club_infrastructure
    set medical_van_quantity = greatest(medical_van_quantity - 1, 0)
    where club_id = v_quote.club_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'asset_key', v_quote.asset_key,
    'asset_id', v_quote.asset_id,
    'display_name', v_quote.display_name,
    'sale_value_cash', v_quote.sale_value_cash,
    'finance_transaction_id', v_tx_id
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.upgrade_club_facility(p_club_id uuid, p_facility text)
 RETURNS club_infrastructure
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.club_infrastructure;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = auth.uid()
  ) then
    raise exception 'You do not own this club';
  end if;

  insert into public.club_infrastructure (
  -- SAT-08: canonical temporary manager may modify only its own active
  -- 14-day team. Registered managers retain original ownership checks.
  if exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not authorized for this club'
      using errcode='42501';
  end if;


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
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (club_id) do nothing;

  case p_facility
    when 'club_house' then
      update public.club_infrastructure
      set hq_level = hq_level + 1,
          updated_at = now()
      where club_id = p_club_id
        and hq_level < 5
      returning * into v_row;

    when 'training_center' then
      update public.club_infrastructure
      set training_center_level = training_center_level + 1,
          updated_at = now()
      where club_id = p_club_id
        and training_center_level < 5
      returning * into v_row;

    when 'medical_center' then
      update public.club_infrastructure
      set medical_center_level = medical_center_level + 1,
          updated_at = now()
      where club_id = p_club_id
        and medical_center_level < 5
      returning * into v_row;

    when 'youth_academy' then
      update public.club_infrastructure
      set youth_academy_level = youth_academy_level + 1,
          updated_at = now()
      where club_id = p_club_id
        and youth_academy_level < 5
      returning * into v_row;

    when 'mechanics_workshop' then
      update public.club_infrastructure
      set mechanics_workshop_level = mechanics_workshop_level + 1,
          updated_at = now()
      where club_id = p_club_id
        and mechanics_workshop_level < 5
      returning * into v_row;

    when 'scouting_office' then
      update public.club_infrastructure
      set scouting_level = scouting_level + 1,
          updated_at = now()
      where club_id = p_club_id
        and scouting_level < 5
      returning * into v_row;

    else
      raise exception 'Unknown facility: %', p_facility;
  end case;

  if v_row.club_id is null then
    raise exception 'Facility is already at max level';
  end if;

  return v_row;
end;
$function$


