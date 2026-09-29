-- Premium fair-play rebalance:
-- 1) gameplay-effecting Team Policy levels are available to all managers;
-- 2) Free users can use the rider shortlist (2 free additions/day, then 1 coin each);
-- 3) Premium shortlist additions never consume coins;
-- 4) Premium includes world-race replay access without coin charges.

create or replace function public.update_club_team_policies(
  p_club_id uuid,
  p_flight_class text,
  p_hotel_level text,
  p_ground_transport text,
  p_logistics_support_level text,
  p_team_vehicle_policy text,
  p_rider_housing_support text,
  p_nutrition_support_level text,
  p_recovery_support_level text,
  p_staff_equipment_level text,
  p_staff_accommodation_level text,
  p_rider_bonus_plan text,
  p_staff_bonus_plan text
)
returns public.club_team_policies
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_row public.club_team_policies;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from (
      values
        ('flight_class', p_flight_class),
        ('hotel_level', p_hotel_level),
        ('ground_transport', p_ground_transport),
        ('logistics_support_level', p_logistics_support_level),
        ('rider_housing_support', p_rider_housing_support),
        ('nutrition_support_level', p_nutrition_support_level),
        ('recovery_support_level', p_recovery_support_level),
        ('staff_equipment_level', p_staff_equipment_level),
        ('staff_accommodation_level', p_staff_accommodation_level),
        ('rider_bonus_plan', p_rider_bonus_plan),
        ('staff_bonus_plan', p_staff_bonus_plan)
    ) as selected(policy_key, option_code)
    where not exists (
      select 1
      from public.team_policy_option_catalog c
      where c.policy_key = selected.policy_key
        and c.option_code = selected.option_code
        and c.is_active = true
    )
  ) then
    raise exception 'One or more selected team-policy options are invalid or inactive.'
      using errcode = '22023';
  end if;

  perform public.ensure_club_team_policies(p_club_id);

  update public.club_team_policies
  set
    flight_class = p_flight_class,
    hotel_level = p_hotel_level,
    ground_transport = p_ground_transport,
    logistics_support_level = p_logistics_support_level,
    team_vehicle_policy = p_team_vehicle_policy,
    rider_housing_support = p_rider_housing_support,
    nutrition_support_level = p_nutrition_support_level,
    recovery_support_level = p_recovery_support_level,
    staff_equipment_level = p_staff_equipment_level,
    staff_accommodation_level = p_staff_accommodation_level,
    rider_bonus_plan = p_rider_bonus_plan,
    staff_bonus_plan = p_staff_bonus_plan,
    updated_at = now()
  where club_id = p_club_id;

  select *
  into v_row
  from public.club_team_policies
  where club_id = p_club_id;

  return v_row;
end;
$$;

create or replace function public.transfer_get_shortlist_access_v2(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_club_id uuid;
  v_is_premium boolean;
  v_used integer := 0;
  v_balance integer := 0;
  v_active_count integer := 0;
begin
  v_club_id := public.transfer_assert_owned_main_club_v1(p_club_id);
  v_is_premium := public.transfer_user_has_premium_v1();

  select count(*)
  into v_used
  from public.transfer_shortlist_daily_additions
  where user_id = auth.uid()
    and club_id = v_club_id
    and real_date = (now() at time zone 'UTC')::date;

  select coalesce(balance, 0)
  into v_balance
  from public.user_wallets
  where user_id = auth.uid();

  select count(*)
  into v_active_count
  from public.transfer_shortlist
  where club_id = v_club_id
    and target_type = 'rider'
    and removed_at is null;

  return jsonb_build_object(
    'is_premium', v_is_premium,
    'free_additions_per_day', 2,
    'premium_unlimited_additions', v_is_premium,
    'additions_used_today', v_used,
    'free_additions_left_today',
      case when v_is_premium then 2 else greatest(0, 2 - v_used) end,
    'next_addition_coin_cost',
      case
        when v_is_premium then 0
        when v_used >= 2 then 1
        else 0
      end,
    'coin_balance', coalesce(v_balance, 0),
    'active_shortlist_count', v_active_count,
    'active_shortlist_limit', 50,
    'real_date_utc', (now() at time zone 'UTC')::date
  );
end;
$$;

create or replace function public.transfer_add_rider_to_shortlist_v2(
  p_club_id uuid,
  p_rider_id uuid,
  p_rider_name text,
  p_source_type text,
  p_source_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
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
  v_is_premium := public.transfer_user_has_premium_v1();

  if p_source_type not in ('transfer_list','free_agent','external_profile','scouting') then
    raise exception 'Unsupported shortlist source type.';
  end if;

  if exists (
    select 1 from public.transfer_shortlist
    where club_id = v_club_id
      and target_type = 'rider'
      and target_id = p_rider_id
      and removed_at is null
  ) then
    return public.transfer_get_rider_shortlist_status_v2(v_club_id,p_rider_id)
      || jsonb_build_object('coin_charged',0,'already_shortlisted',true);
  end if;

  select count(*) into v_active_count
  from public.transfer_shortlist
  where club_id = v_club_id and target_type='rider' and removed_at is null;

  if v_active_count >= 50 then
    raise exception 'Rider shortlist limit reached (50).';
  end if;

  select * into v_existing_daily
  from public.transfer_shortlist_daily_additions
  where user_id=v_user_id and club_id=v_club_id
    and rider_id=p_rider_id and real_date=v_real_date;

  if found then
    v_coin_cost := 0;
  else
    select count(*) into v_used
    from public.transfer_shortlist_daily_additions
    where user_id=v_user_id and club_id=v_club_id and real_date=v_real_date;

    v_addition_number := v_used + 1;
    v_coin_cost := case
      when v_is_premium then 0
      when v_addition_number <= 2 then 0
      else 1
    end;

    if v_coin_cost > 0 then
      insert into public.user_wallets(user_id,balance)
      values(v_user_id,0) on conflict(user_id) do nothing;

      select balance into v_balance
      from public.user_wallets where user_id=v_user_id for update;

      if coalesce(v_balance,0) < v_coin_cost then
        raise exception 'You need 1 coin for this shortlist addition. Current balance: %.',
          coalesce(v_balance,0);
      end if;

      v_system_key := format('transfer_shortlist_%s_%s_%s',v_user_id,p_rider_id,v_real_date);

      if not exists (
        select 1 from public.user_coin_ledger
        where user_id=v_user_id and payload_json->>'system_key'=v_system_key
      ) then
        insert into public.user_coin_ledger(user_id,delta,reason,payload_json)
        values(
          v_user_id,-1,'transfer_shortlist_addition',
          jsonb_build_object(
            'system_key',v_system_key,'club_id',v_club_id,'rider_id',p_rider_id,
            'real_date',v_real_date,'addition_number',v_addition_number,'coin_cost',1
          )
        );

        update public.user_wallets set balance=balance-1 where user_id=v_user_id;
      end if;
    end if;

    insert into public.transfer_shortlist_daily_additions(
      user_id,club_id,rider_id,real_date,addition_number,coin_charged,source_type,source_id
    )
    values(
      v_user_id,v_club_id,p_rider_id,v_real_date,v_addition_number,v_coin_cost,p_source_type,p_source_id
    );
  end if;

  insert into public.transfer_shortlist(
    club_id,target_type,target_id,target_name,source_type,source_id,
    created_by_user_id,created_at,updated_at,removed_at
  )
  values(
    v_club_id,'rider',p_rider_id,btrim(p_rider_name),p_source_type,p_source_id,
    v_user_id,now(),now(),null
  )
  on conflict(club_id,target_type,target_id)
  do update set
    target_name=excluded.target_name,
    source_type=excluded.source_type,
    source_id=excluded.source_id,
    updated_at=now(),
    removed_at=null;

  return public.transfer_get_rider_shortlist_status_v2(v_club_id,p_rider_id)
    || jsonb_build_object('coin_charged',v_coin_cost,'already_shortlisted',false);
end;
$$;

create or replace function public.get_race_replay_coin_access_v1(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance integer := 0;
  v_coin_unlocked boolean := false;
  v_is_premium boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;
  if p_race_id is null then raise exception 'Race id is required.'; end if;

  select coalesce(w.balance,0) into v_balance
  from public.user_wallets w where w.user_id=v_user_id;

  select exists(
    select 1 from public.race_replay_coin_unlocks u
    where u.user_id=v_user_id and u.race_id=p_race_id
  ) into v_coin_unlocked;

  v_is_premium := public.current_user_has_premium_v1();

  return jsonb_build_object(
    'race_id',p_race_id,
    'coin_cost',case when v_is_premium then 0 else 2 end,
    'coin_balance',coalesce(v_balance,0),
    'has_coin_unlock',v_coin_unlocked,
    'has_premium_access',v_is_premium,
    'has_replay_access',v_coin_unlocked or v_is_premium
  );
end;
$$;

create or replace function public.purchase_race_replay_access_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance integer := 0;
  v_system_key text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;
  if p_race_id is null then raise exception 'Race id is required.'; end if;

  if public.current_user_has_premium_v1() then
    return public.get_race_replay_coin_access_v1(p_race_id);
  end if;

  if exists(
    select 1 from public.race_replay_coin_unlocks u
    where u.user_id=v_user_id and u.race_id=p_race_id
  ) then
    return public.get_race_replay_coin_access_v1(p_race_id);
  end if;

  insert into public.user_wallets(user_id,balance)
  values(v_user_id,0) on conflict(user_id) do nothing;

  select w.balance into v_balance
  from public.user_wallets w where w.user_id=v_user_id for update;

  if coalesce(v_balance,0) < 2 then
    raise exception 'You need 2 coins to unlock this race replay. Current balance: %.',
      coalesce(v_balance,0);
  end if;

  v_system_key := format('race_replay_unlock_%s_%s',v_user_id::text,p_race_id::text);

  if not exists(
    select 1 from public.user_coin_ledger l
    where l.user_id=v_user_id and l.payload_json->>'system_key'=v_system_key
  ) then
    insert into public.user_coin_ledger(user_id,delta,reason,payload_json)
    values(
      v_user_id,-2,'race_replay_unlock',
      jsonb_build_object(
        'system_key',v_system_key,'category','race_replay','race_id',p_race_id,
        'coin_cost',2,'permanent_unlock',true
      )
    );

    update public.user_wallets set balance=balance-2 where user_id=v_user_id;
  end if;

  insert into public.race_replay_coin_unlocks(user_id,race_id,coin_cost)
  values(v_user_id,p_race_id,2)
  on conflict(user_id,race_id) do nothing;

  return public.get_race_replay_coin_access_v1(p_race_id);
end;
$$;
