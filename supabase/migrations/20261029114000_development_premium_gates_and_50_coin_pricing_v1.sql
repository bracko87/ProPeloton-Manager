alter table public.developing_team_season_access add column if not exists grandfathered_through_season integer;
update public.developing_team_season_access a
set grandfathered_through_season=a.active_season
from public.clubs m
where m.id=a.main_club_id and a.access_status='active'
 and a.active_season=public.get_current_season_number()
 and not public.user_has_paid_premium_access_v1(m.owner_user_id);
update public.developing_team_service_config set activation_coin_cost=50,renewal_coin_cost=50,updated_at=now()
 where config_key='default';
CREATE OR REPLACE FUNCTION public.create_developing_team_and_charge_activation_v1()
 RETURNS TABLE(developing_club_id uuid, developing_club_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare
  v_user_id uuid := auth.uid();
  v_main_club record;
  v_existing_developing_club record;
  v_current_game_date date;
  v_real_days integer := 0;
  v_game_days integer := 0;
  v_coin_balance integer := 0;
  v_amateur_division text := null;
  v_new_club_id uuid := null;
  v_new_club_name text := null;
  v_system_key text := null;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to purchase a Developing Team.';
  end if;

  if not public.user_has_paid_premium_access_v1(v_user_id) then
    raise exception 'Paid Premium is required for Developing Team activation.';
  end if;
  select
    c.id,
    c.name,
    c.country_code,
    c.owner_user_id,
    c.created_at,
    c.created_game_date,
    c.primary_color,
    c.secondary_color
  into v_main_club
  from public.clubs c
  where c.owner_user_id = v_user_id
    and coalesce(c.club_type, 'main') = 'main'
  order by c.created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'No main club found for current user.';
  end if;

  select
    c.id,
    c.name
  into v_existing_developing_club
  from public.clubs c
  where c.parent_club_id = v_main_club.id
    and c.club_type = 'developing'
  order by c.created_at asc
  limit 1;

  if v_existing_developing_club.id is not null then
    raise exception 'Developing Team already exists for this club.';
  end if;

  select make_date(
    1999 + g.season_number,
    g.month_number,
    g.day_number
  )
  into v_current_game_date
  from public.get_current_game_date() g
  limit 1;

  v_real_days := greatest(0, current_date - (v_main_club.created_at::date));

  if v_main_club.created_game_date is not null then
    v_game_days := greatest(0, v_current_game_date - v_main_club.created_game_date);
  end if;

  if v_game_days < 60 then
    raise exception 'Unlock requires 60 in-game days.';
  end if;

  select coalesce(w.balance, 0)
  into v_coin_balance
  from public.user_wallets w
  where w.user_id = v_user_id;

  v_coin_balance := coalesce(v_coin_balance, 0);

  if v_coin_balance < public.developing_team_activation_coin_cost_v1() then
    raise exception 'Not enough coins. The configured Developing Team activation coin balance is required.';
  end if;

  v_system_key := 'developing_team_unlock_' || v_main_club.id::text;

  if exists (
    select 1
    from public.user_coin_ledger l
    where l.user_id = v_user_id
      and l.reason = 'developing_team_season_activation'
      and coalesce(l.payload_json ->> 'system_key', '') = v_system_key
  ) then
    raise exception 'Developing Team purchase has already been processed.';
  end if;

  v_amateur_division := public.safe_get_amateur_division_for_country(v_main_club.country_code);

  if v_amateur_division is null then
    raise exception 'Could not resolve amateur division for country %.', v_main_club.country_code;
  end if;

  perform public.apply_coin_delta(
    v_user_id,
    -public.developing_team_activation_coin_cost_v1(),
    'developing_team_season_activation',
    jsonb_build_object(
      'system_key', v_system_key,
      'main_club_id', v_main_club.id,
      'cost', public.developing_team_activation_coin_cost_v1()
    )
  );

  v_new_club_name := v_main_club.name || ' U23';

  insert into public.clubs (
    owner_user_id,
    name,
    country_code,
    primary_color,
    secondary_color,
    club_tier,
    tier2_division,
    tier3_division,
    amateur_division,
    season_points,
    is_ai,
    is_active,
    club_type,
    parent_club_id,
    max_promotion_tier,
    created_game_date
  )
  values (
    v_main_club.owner_user_id,
    v_new_club_name,
    v_main_club.country_code,
    v_main_club.primary_color,
    v_main_club.secondary_color,
    'amateur'::public.club_tier,
    null,
    null,
    v_amateur_division,
    0,
    false,
    true,
    'developing',
    v_main_club.id,
    'Continental',
    v_current_game_date
  )
  returning id, name
  into v_new_club_id, v_new_club_name;

  perform public.seed_developing_team_roster(
    v_new_club_id,
    v_main_club.country_code,
    6
  );

  return query
  select v_new_club_id, v_new_club_name;
end;$function$;

CREATE OR REPLACE FUNCTION public.activate_developing_team_for_season_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_status record;
  v_created record;
  v_result jsonb;
  v_cost integer;
  v_system_key text;
  v_developing_club_id uuid;
begin
  if v_user_id is null then
    raise exception
      'You must be signed in to activate a Developing Team.';
  end if;

  if not public.user_has_paid_premium_access_v1(v_user_id) then
    raise exception 'Paid Premium is required for Developing Team activation or renewal.';
  end if;
  perform pg_advisory_xact_lock(
    hashtext('developing_team_activation:' || v_user_id::text)
  );

  select *
  into v_status
  from public.get_developing_team_status()
  limit 1;

  if v_status.main_club_id is null then
    raise exception 'No main club found for current user.';
  end if;

  if v_status.is_active then
    select to_jsonb(current_status)
    into v_result
    from public.get_developing_team_status() current_status
    limit 1;

    return v_result;
  end if;

  if not v_status.time_requirement_met then
    raise exception
      'Developing Team requires 30 real-life days or 60 in-game days.';
  end if;

  if not v_status.team_exists then
    v_cost := v_status.activation_coin_cost;

    if v_status.coin_balance < v_cost then
      raise exception
        'Not enough coins. % coins are required; current balance is %.',
        v_cost,
        v_status.coin_balance;
    end if;

    /* Existing production creation/seed function, now configured at 200. */
    select *
    into v_created
    from public.create_developing_team_and_charge_activation_v1()
    limit 1;

    v_developing_club_id := v_created.developing_club_id;
  else
    v_cost := v_status.renewal_coin_cost;
    v_system_key :=
      'developing_team_reactivation:'
      || v_status.main_club_id::text
      || ':season:'
      || v_status.current_season::text;

    perform public.debit_user_coins_idempotent_v1(
      v_user_id,
      v_cost,
      'developing_team_season_reactivation',
      v_system_key,
      jsonb_build_object(
        'category', 'developing_team',
        'main_club_id', v_status.main_club_id,
        'developing_club_id', v_status.developing_club_id,
        'season', v_status.current_season,
        'auto_renew', true,
        'coin_cost', v_cost
      )
    );

    v_developing_club_id := v_status.developing_club_id;
  end if;

  insert into public.developing_team_season_access (
    main_club_id,
    developing_club_id,
    access_status,
    active_season,
    expires_after_season,
    auto_renew,
    activated_at,
    renewed_at,
    updated_at
  )
  values (
    v_status.main_club_id,
    v_developing_club_id,
    'active',
    v_status.current_season,
    v_status.current_season,
    true,
    now(),
    case when v_status.team_exists then now() else null end,
    now()
  )
  on conflict (main_club_id)
  do update set
    developing_club_id = excluded.developing_club_id,
    access_status = 'active',
    active_season = excluded.active_season,
    expires_after_season = excluded.expires_after_season,
    auto_renew = true,
    activated_at = coalesce(
      public.developing_team_season_access.activated_at,
      excluded.activated_at
    ),
    renewed_at = case
      when public.developing_team_season_access.active_season
        is distinct from excluded.active_season
        then now()
      else public.developing_team_season_access.renewed_at
    end,
    updated_at = now();

  update public.clubs set is_active=true,updated_at=now() where id=v_developing_club_id;
  if not exists(select 1 from public.club_riders where club_id=v_developing_club_id) then
    perform public.seed_developing_team_roster(v_developing_club_id,
      (select country_code from public.clubs where id=v_developing_club_id),6);
  end if;
  select to_jsonb(final_status)
  into v_result
  from public.get_developing_team_status() final_status
  limit 1;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_developing_team_status_base_v9()
 RETURNS TABLE(main_club_id uuid, main_club_name text, developing_club_id uuid, developing_club_name text, team_exists boolean, access_status text, is_active boolean, is_read_only boolean, current_season integer, active_season integer, expires_after_season integer, next_renewal_season integer, auto_renew boolean, activation_coin_cost integer, renewal_coin_cost integer, coin_balance integer, coin_requirement_met boolean, activation_coin_requirement_met boolean, renewal_coin_requirement_met boolean, real_days_played integer, game_days_played integer, time_requirement_met boolean, can_activate boolean, can_reactivate boolean, can_change_auto_renew boolean, movement_window_open boolean, current_window_label text, next_window_label text, current_competition_name text, current_competition_place integer, current_competition_total_teams integer, is_purchased boolean, coin_cost integer, can_purchase boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_main public.clubs%rowtype;
  v_developing public.clubs%rowtype;
  v_access public.developing_team_season_access%rowtype;

  v_game_date date;
  v_current_season integer := 1;
  v_month integer := 1;
  v_day integer := 1;

  v_real_days integer := 0;
  v_game_days integer := 0;
  v_time_met boolean := false;
  v_paid_premium boolean := public.user_has_paid_premium_access_v1(auth.uid());

  v_balance integer := 0;
  v_activation_cost integer :=
    public.developing_team_activation_coin_cost_v1();
  v_renewal_cost integer :=
    public.developing_team_renewal_coin_cost_v1();

  v_team_exists boolean := false;
  v_effective_status text := 'not_activated';
  v_active boolean := false;
  v_read_only boolean := false;
  v_action_cost integer := 0;

  v_window_open boolean := false;
  v_current_window text := null;
  v_next_window text := null;

  v_competition_name text := null;
  v_competition_place integer := null;
  v_competition_total_teams integer := null;
begin
  if v_user_id is null then
    raise exception
      'You must be signed in to view Developing Team status.';
  end if;

  select main_club.*
  into v_main
  from public.clubs main_club
  where main_club.owner_user_id = v_user_id
    and coalesce(main_club.club_type, 'main') = 'main'
  order by main_club.created_at asc
  limit 1;

  if v_main.id is null then
    return;
  end if;

  v_game_date := public.get_current_game_date_date();

  v_current_season := coalesce(
    public.get_current_season_number(),
    public.get_current_game_season_number_safe_v1(),
    case
      when v_game_date is not null
        then extract(year from v_game_date)::integer - 1999
      else 1
    end,
    1
  );

  if v_game_date is not null then
    v_month := extract(month from v_game_date)::integer;
    v_day := extract(day from v_game_date)::integer;
  end if;

  v_real_days := greatest(0, current_date - v_main.created_at::date);

  if v_game_date is not null
     and v_main.created_game_date is not null then
    v_game_days := greatest(0, v_game_date - v_main.created_game_date);
  end if;

  v_time_met := v_game_days >= 60;

  select coalesce(
    (
      select wallet.balance
      from public.user_wallets wallet
      where wallet.user_id = v_user_id
      limit 1
    ),
    0
  )
  into v_balance;

  select developing.*
  into v_developing
  from public.clubs developing
  where developing.parent_club_id = v_main.id
    and developing.club_type = 'developing'
  order by developing.created_at asc
  limit 1;

  v_team_exists := v_developing.id is not null;

  if v_team_exists then
    select access_row.*
    into v_access
    from public.developing_team_season_access access_row
    where access_row.main_club_id = v_main.id
    limit 1;
  end if;

  if not v_team_exists then
    v_effective_status := 'not_activated';
    v_active := false;
    v_read_only := false;
  elsif v_access.main_club_id is null then
    v_effective_status := 'expired';
    v_active := false;
    v_read_only := true;
  elsif v_access.access_status = 'active'
        and coalesce(v_access.active_season, 0) = v_current_season
        and coalesce(v_access.expires_after_season, 0) >= v_current_season
        and (v_paid_premium or coalesce(v_access.grandfathered_through_season,0)>=v_current_season)
        and coalesce(v_developing.is_active,false) then
    v_effective_status := 'active';
    v_active := true;
    v_read_only := false;
  else
    v_effective_status := 'expired';
    v_active := false;
    v_read_only := true;
  end if;

  v_action_cost := case
    when v_effective_status = 'expired' then v_renewal_cost
    else v_activation_cost
  end;

  v_window_open :=
    v_month in (1, 4, 7, 10)
    and v_day between 1 and 14;

  if v_window_open then
    v_current_window := case v_month
      when 1 then 'January 1–14'
      when 4 then 'April 1–14'
      when 7 then 'July 1–14'
      when 10 then 'October 1–14'
    end;
  end if;

  v_next_window := case
    when v_month = 1 and v_day <= 14 then 'January 1–14'
    when v_month < 4 or (v_month = 1 and v_day > 14) then 'April 1–14'
    when v_month = 4 and v_day <= 14 then 'April 1–14'
    when v_month < 7 or (v_month = 4 and v_day > 14) then 'July 1–14'
    when v_month = 7 and v_day <= 14 then 'July 1–14'
    when v_month < 10 or (v_month = 7 and v_day > 14) then 'October 1–14'
    when v_month = 10 and v_day <= 14 then 'October 1–14'
    else format('Season %s · January 1–14', v_current_season + 1)
  end;

  /*
    Competition ranking is intentionally loaded through the separate
    get_club_current_ranking_position_v1() RPC. Keeping it out of this
    access/status RPC prevents ranking work from locking Squad navigation.
  */

  return query
  select
    v_main.id,
    v_main.name,
    v_developing.id,
    v_developing.name,

    v_team_exists,
    v_effective_status,
    v_active,
    v_read_only,

    v_current_season,
    v_access.active_season,
    v_access.expires_after_season,
    v_current_season + 1,

    coalesce(v_access.auto_renew, false),
    v_activation_cost,
    v_renewal_cost,

    v_balance,
    v_balance >= v_action_cost,
    v_balance >= v_activation_cost,
    v_balance >= v_renewal_cost,

    v_real_days,
    v_game_days,
    v_time_met,

    (
      not v_team_exists
      and v_time_met
      and v_balance >= v_activation_cost
      and v_paid_premium
    ),
    (
      v_team_exists
      and not v_active
      and v_time_met
      and v_balance >= v_renewal_cost
      and v_paid_premium
    ),
    (v_team_exists and v_active),

    v_window_open,
    v_current_window,
    v_next_window,

    v_competition_name,
    v_competition_place,
    v_competition_total_teams,

    v_team_exists,
    v_action_cost,
    (
      not v_team_exists
      and v_time_met
      and v_balance >= v_activation_cost
      and v_paid_premium
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_developing_team_access_active_v1(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with resolved_main as (
    select
      main_club.id as main_club_id
    from public.clubs requested_club
    join public.clubs main_club
      on main_club.id = case
        when requested_club.club_type = 'developing'
          then requested_club.parent_club_id
        else requested_club.id
      end
    where requested_club.id = p_club_id
    limit 1
  ),
  current_season as (
    select coalesce(
      public.get_current_season_number(),
      public.get_current_game_season_number_safe_v1(),
      1
    )::integer as season_number
  )
  select coalesce(
    exists (
      select 1
      from resolved_main main_ref
      cross join current_season season_ref
      join public.developing_team_season_access access_row
        on access_row.main_club_id = main_ref.main_club_id
      where access_row.access_status = 'active'
        and access_row.active_season = season_ref.season_number
        and access_row.expires_after_season >= season_ref.season_number
        and exists(select 1 from public.clubs main_c
           join public.clubs dev on dev.id=access_row.developing_club_id
           where main_c.id=access_row.main_club_id and dev.is_active
             and (public.user_has_paid_premium_access_v1(main_c.owner_user_id)
               or coalesce(access_row.grandfathered_through_season,0)>=season_ref.season_number))
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.move_rider_between_main_and_developing_legacy_v1(p_rider_id uuid, p_target_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_target_club record;
  v_source_assignment record;
  v_main_club record;
  v_developing_club record;
  v_game_date date;
  v_month integer;
  v_day integer;
  v_target_count integer;
  v_age integer;
  v_main_avg_overall integer;
  v_rider_overall integer;
  v_dev_overall_cap integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into v_main_club
  from public.clubs c
  where c.owner_user_id = v_user_id
    and coalesce(c.club_type, 'main') = 'main'
  limit 1;

  if not found then
    raise exception 'Main club not found.';
  end if;

  select *
  into v_developing_club
  from public.clubs c
  where c.parent_club_id = v_main_club.id
    and c.club_type = 'developing'
  limit 1;

  if not found then
    raise exception 'Developing Team not found.';
  end if;

  select *
  into v_target_club
  from public.clubs c
  where c.id = p_target_club_id
    and c.id in (v_main_club.id, v_developing_club.id)
  limit 1;

  if not found then
    raise exception 'Target club is invalid.';
  end if;

  select
    cr.id as club_rider_id,
    cr.club_id,
    cr.rider_id,
    cr.assigned_role
  into v_source_assignment
  from public.club_riders cr
  where cr.rider_id = p_rider_id
    and cr.club_id in (v_main_club.id, v_developing_club.id)
  limit 1
  for update;

  if not found then
    raise exception 'Rider is not assigned to your main/developing team structure.';
  end if;

  if v_source_assignment.club_id = p_target_club_id then
    raise exception 'Rider is already in that team.';
  end if;

  select make_date(
    1999 + g.season_number,
    g.month_number,
    g.day_number
  )
  into v_game_date
  from public.get_current_game_date() g
  limit 1;

  v_month := extract(month from v_game_date);
  v_day := extract(day from v_game_date);

  if not (
    (v_month = 1  and v_day between 1 and 14) or
    (v_month = 4  and v_day between 1 and 14) or
    (v_month = 7  and v_day between 1 and 14) or
    (v_month = 10 and v_day between 1 and 14)
  ) then
    raise exception 'Movement window is closed.';
  end if;

  select count(*)
  into v_target_count
  from public.club_riders cr
  where cr.club_id = p_target_club_id;

  if p_target_club_id = v_developing_club.id and v_target_count >= 10 then
    raise exception 'Developing Team is full (10 riders max).';
  end if;

  if p_target_club_id = v_main_club.id and v_target_count >= 18 then
    raise exception 'First Squad is full (18 riders max).';
  end if;

  if p_target_club_id = v_developing_club.id then
    select
      extract(year from age(v_game_date, r.birth_date))::int,
      coalesce(r.overall, 0)
    into
      v_age,
      v_rider_overall
    from public.riders r
    where r.id = p_rider_id;

    if v_age is null then
      raise exception 'Could not determine rider age.';
    end if;

    if v_age > 23 then
      raise exception 'Only riders aged 23 or younger can join the Developing Team.';
    end if;

    select round(avg(coalesce(r.overall, 0)))::int
    into v_main_avg_overall
    from public.club_riders cr
    join public.riders r
      on r.id = cr.rider_id
    where cr.club_id = v_main_club.id;

    v_dev_overall_cap := least(
      64,
      greatest(45, coalesce(v_main_avg_overall, 55) - 2)
    );

    if coalesce(v_rider_overall, 0) > v_dev_overall_cap then
      raise exception
        'Rider is too strong for the Developing Team. Rider overall: %, allowed max: %.',
        v_rider_overall,
        v_dev_overall_cap;
    end if;
  end if;

  update public.club_riders cr
  set club_id = p_target_club_id
  where cr.id = v_source_assignment.club_rider_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_developing_team_season_renewals_v1(p_target_season integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
  v_target_season integer := coalesce(p_target_season, public.get_current_season_number(), public.get_current_game_season_number_safe_v1(), 1);
  v_cost integer := public.developing_team_renewal_coin_cost_v1();
  v_row record;
  v_balance integer := 0;
  v_system_key text;
  v_renewed integer := 0;
  v_expired_disabled integer := 0;
  v_expired_insufficient integer := 0;
  v_expired_unavailable integer := 0;
  v_already_processed integer := 0;
begin
  if v_target_season <= 0 then
    raise exception 'Target season must be a positive integer.';
  end if;

  -- Removed/ownerless clubs or deleted Developing Teams never renew and never charge coins.
  update public.developing_team_season_access a
  set access_status='expired', updated_at=now()
  where coalesce(a.expires_after_season,0) < v_target_season
    and a.access_status <> 'expired'
    and exists (
      select 1
      from public.clubs m
      left join public.clubs d on d.id=a.developing_club_id
      where m.id=a.main_club_id
        and (m.deleted_at is not null or m.owner_user_id is null or d.id is null or d.deleted_at is not null)
    );
  get diagnostics v_expired_unavailable=row_count;

  update public.developing_team_season_access a
  set access_status='expired', updated_at=now()
  where coalesce(a.expires_after_season,0) < v_target_season
    and a.auto_renew=false
    and a.access_status <> 'expired';
  get diagnostics v_expired_disabled=row_count;

  update public.developing_team_season_access a set access_status='expired',updated_at=now()
  where coalesce(a.expires_after_season,0)<v_target_season and a.access_status<>'expired'
    and exists(select 1 from public.clubs m where m.id=a.main_club_id
      and not public.user_has_paid_premium_access_v1(m.owner_user_id));
  for v_row in
    select a.main_club_id,a.developing_club_id,m.owner_user_id
    from public.developing_team_season_access a
    join public.clubs m on m.id=a.main_club_id
    join public.clubs d on d.id=a.developing_club_id
    where coalesce(a.expires_after_season,0) < v_target_season
      and a.auto_renew=true
      and public.user_has_paid_premium_access_v1(m.owner_user_id)
      and m.deleted_at is null
      and m.owner_user_id is not null
      and d.deleted_at is null
    for update of a
  loop
    perform pg_advisory_xact_lock(hashtext('developing_team_renewal:'||v_row.main_club_id::text||':season:'||v_target_season::text));
    v_system_key := 'developing_team_renewal:'||v_row.main_club_id::text||':season:'||v_target_season::text;

    if exists (
      select 1 from public.user_coin_ledger l
      where l.user_id=v_row.owner_user_id and l.payload_json->>'system_key'=v_system_key
    ) then
      update public.developing_team_season_access
      set access_status='active',active_season=v_target_season,expires_after_season=v_target_season,renewed_at=coalesce(renewed_at,now()),updated_at=now()
      where main_club_id=v_row.main_club_id;
      v_already_processed:=v_already_processed+1;
      continue;
    end if;

    insert into public.user_wallets(user_id,balance) values(v_row.owner_user_id,0) on conflict(user_id) do nothing;
    select coalesce(w.balance,0) into v_balance from public.user_wallets w where w.user_id=v_row.owner_user_id for update;

    if v_balance >= v_cost then
      perform public.debit_user_coins_idempotent_v1(
        v_row.owner_user_id,v_cost,'developing_team_season_renewal',v_system_key,
        jsonb_build_object('category','developing_team','main_club_id',v_row.main_club_id,'developing_club_id',v_row.developing_club_id,'season',v_target_season,'auto_renew',true,'coin_cost',v_cost)
      );
      update public.developing_team_season_access
      set access_status='active',active_season=v_target_season,expires_after_season=v_target_season,renewed_at=now(),updated_at=now()
      where main_club_id=v_row.main_club_id;
      v_renewed:=v_renewed+1;
    else
      update public.developing_team_season_access
      set access_status='expired',updated_at=now()
      where main_club_id=v_row.main_club_id;
      v_expired_insufficient:=v_expired_insufficient+1;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'target_season',v_target_season,'renewal_coin_cost',v_cost,'renewed',v_renewed,
    'expired_auto_renew_disabled',v_expired_disabled,'expired_insufficient_balance',v_expired_insufficient,
    'expired_unavailable_club',v_expired_unavailable,'already_processed',v_already_processed);
end;
$function$;

create or replace function public.move_rider_between_main_and_developing(p_rider_id uuid,p_target_club_id uuid)
returns void language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $move$
declare v_user uuid:=auth.uid();v_main uuid;v_dev uuid;v_season integer:=public.get_current_season_number();
begin
 if v_user is null then raise exception 'Not authenticated'; end if;
 select m.id,d.id into v_main,v_dev from public.clubs m
 join public.clubs d on d.parent_club_id=m.id and d.club_type='developing'
 where m.owner_user_id=v_user and coalesce(m.club_type,'main')='main' and m.deleted_at is null limit 1;
 if v_dev is null then raise exception 'Developing Team not found'; end if;
 if p_target_club_id not in(v_main,v_dev) then raise exception 'Invalid destination club'; end if;
 if not exists(select 1 from public.club_riders where rider_id=p_rider_id and club_id in(v_main,v_dev))
  then raise exception 'Rider does not belong to your club hierarchy'; end if;
 if not exists(select 1 from public.developing_team_season_access a join public.clubs d on d.id=a.developing_club_id
  where a.main_club_id=v_main and a.developing_club_id=v_dev and a.access_status='active'
  and a.active_season=v_season and a.expires_after_season>=v_season and d.is_active)
  then raise exception 'Developing Team season has closed; rider movements are unavailable'; end if;
 -- The already-paid season retains BOTH movement directions after Premium expires.
 perform public.move_rider_between_main_and_developing_legacy_v1(p_rider_id,p_target_club_id);
end; $move$;