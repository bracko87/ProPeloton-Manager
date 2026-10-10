-- Long-term progression unlocks are game-days ONLY, independent of clock speed.
-- U23 requires 60 game days; U16 requires 90 game days and PAID Premium.
-- Previously activated squads remain intact.
update public.youth_academy_service_config
set game_days_required=90, real_days_required=0, updated_at=now()
where config_key='default';

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
        and coalesce(v_access.expires_after_season, 0) >= v_current_season then
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
    ),
    (
      v_team_exists
      and not v_active
      and v_time_met
      and v_balance >= v_renewal_cost
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
    );
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.get_my_youth_academy_base_v23()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_premium boolean:=false;
  v_budget jsonb;
  v_settings jsonb;
  v_riders jsonb;
  v_staff jsonb;
  v_game_date date:=public.get_current_game_date_date();
  v_real_days integer:=0;
  v_game_days integer:=0;
  v_real_required integer:=30;
  v_game_required integer:=60;
  v_time_met boolean:=false;
  v_activation_cost integer:=50;
  v_coin_balance integer:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at asc limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  v_premium:=public.user_has_paid_premium_access_v1(v_user);

  select
    coalesce(cfg.activation_coin_cost,50),
    coalesce(cfg.real_days_required,30),
    coalesce(cfg.game_days_required,60)
  into v_activation_cost,v_real_required,v_game_required
  from public.youth_academy_service_config cfg
  where cfg.config_key='default';

  v_activation_cost:=coalesce(v_activation_cost,50);
  v_real_required:=0;
  v_game_required:=90;

  v_real_days:=greatest(0,current_date-v_club.created_at::date);
  if v_game_date is not null and v_club.created_game_date is not null then
    v_game_days:=greatest(0,v_game_date-v_club.created_game_date);
  end if;
  v_time_met:=v_game_days>=90;

  select coalesce(w.balance,0)::integer into v_coin_balance
  from public.user_wallets w
  where w.user_id=v_user;
  v_coin_balance:=coalesce(v_coin_balance,0);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'premium',v_premium,
      'activated',false,
      'club_id',v_club.id,
      'club_name',v_club.name,
      'country_code',v_club.country_code,
      'capacity',16,
      'starter_riders',6,
      'default_season_budget',100000,
      'default_scouting_range','local',
      'default_scouting_cost',5000,
      'activation_coin_cost',v_activation_cost,
      'renewal_coin_cost',0,
      'coin_balance',v_coin_balance,
      'real_days_played',v_real_days,
      'game_days_played',v_game_days,
      'unlock_real_days_required',v_real_required,
      'unlock_game_days_required',v_game_required,
      'time_requirement_met',v_time_met,
      'can_activate',v_premium and v_time_met and v_coin_balance>=v_activation_cost
    );
  end if;

  select to_jsonb(b) into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select to_jsonb(s) into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'display_name',r.display_name,'country_code',r.country_code,
    'age',private.youth_academy_age_v1(r.birth_date),'role',r.role,
    'assessment_band',private.youth_potential_band_v1(r.hidden_potential),
    'development_focus',r.development_focus,'workload',r.workload,
    'readiness',r.readiness,'fatigue',r.fatigue,'status',r.status,
    'stipend_weekly',coalesce(agr.stipend_weekly,0)
  ) order by r.birth_date),'[]'::jsonb)
  into v_riders
  from public.youth_riders r
  left join public.youth_rider_agreements agr
    on agr.youth_rider_id=r.id and agr.status='active'
  where r.academy_id=v_academy.id
    and r.status in ('academy','graduating');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cs.id,'role_type',cs.role_type,'specialization',cs.specialization,
    'team_scope',cs.team_scope,'staff_name',cs.staff_name,
    'first_name',cs.first_name,'last_name',cs.last_name,
    'country_code',cs.country_code,'birth_date',cs.birth_date,
    'expertise',cs.expertise,'experience',cs.experience,
    'potential',cs.potential,'leadership',cs.leadership,
    'efficiency',cs.efficiency,'loyalty',cs.loyalty,
    'salary_weekly',cs.salary_weekly,
    'contract_expires_at',cs.contract_expires_at,
    'available',private.youth_staff_available_v1(cs.id),
    'active_course',(select jsonb_build_object('id',sc.id,'title',sc.course_title,'returns_on',sc.completes_on_game_date)
      from public.staff_courses sc
      where sc.staff_id=cs.id and sc.status='active'
      order by sc.created_at desc limit 1)
  ) order by
    case cs.role_type
      when 'youth_academy_director' then 1
      when 'u16_head_coach' then 2
      when 'youth_scout' then 3 else 9 end,
    cs.staff_name
  ),'[]'::jsonb)
  into v_staff
  from public.club_staff cs
  where cs.club_id=v_club.id and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  return jsonb_build_object(
    'premium',v_premium,
    'activated',true,
    'read_only',not v_premium,
    'club_id',v_club.id,
    'club_name',v_club.name,
    'country_code',v_club.country_code,
    'capacity',16,
    'starter_riders',6,
    'default_season_budget',100000,
    'default_scouting_range','local',
    'default_scouting_cost',5000,
    'activation_coin_cost',v_activation_cost,
    'renewal_coin_cost',0,
    'coin_balance',v_coin_balance,
    'real_days_played',v_real_days,
    'game_days_played',v_game_days,
    'unlock_real_days_required',v_real_required,
    'unlock_game_days_required',v_game_required,
    'time_requirement_met',v_time_met,
    'can_activate',false,
    'academy',jsonb_build_object(
      'id',v_academy.id,'capacity',16,
      'active_riders',jsonb_array_length(v_riders),
      'reputation',v_academy.reputation,
      'activated_season',v_academy.activated_season
    ),
    'budget',coalesce(v_budget,'{}'::jsonb),
    'settings',coalesce(v_settings,'{}'::jsonb),
    'effective_settings',(select to_jsonb(es) from private.youth_effective_settings_v1 es where es.academy_id=v_academy.id),
    'staff_decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from (select * from public.youth_staff_decisions
            where academy_id=v_academy.id
            order by created_at desc limit 20) d),'[]'::jsonb),
    'training_camps',coalesce((select jsonb_agg(to_jsonb(tc) order by tc.starts_on desc)
      from public.youth_training_camps tc
      where tc.academy_id=v_academy.id),'[]'::jsonb),
    'riders',v_riders,
    'staff',v_staff,
    'scouting_programs',(
      select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order),'[]'::jsonb)
      from public.youth_academy_scouting_programs p where p.is_active=true
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_my_youth_academy_v1(p_season_budget bigint DEFAULT 100000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_i integer;
  v_created boolean:=false;
  v_allocation bigint:=greatest(coalesce(p_season_budget,100000),5000);
  v_game_date date:=public.get_current_game_date_date();
  v_real_days integer:=0;
  v_game_days integer:=0;
  v_real_required integer:=30;
  v_game_required integer:=60;
  v_activation_cost integer:=50;
  v_coin_balance integer:=0;
  v_coin_debited boolean:=false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_paid_premium_access_v1(v_user) then
    raise exception 'Youth Academy is available only to Premium members.';
  end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at asc limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  perform pg_advisory_xact_lock(hashtext('youth_academy_activate:'||v_club.id::text));

  select a.id into v_academy_id
  from public.youth_academies a where a.club_id=v_club.id limit 1;

  -- Existing Academy: no reactivation charge and no retroactive wait rule.
  if v_academy_id is not null then
    return public.get_my_youth_academy_v1();
  end if;

  select
    coalesce(cfg.activation_coin_cost,50),
    coalesce(cfg.real_days_required,30),
    coalesce(cfg.game_days_required,60)
  into v_activation_cost,v_real_required,v_game_required
  from public.youth_academy_service_config cfg
  where cfg.config_key='default';

  v_activation_cost:=coalesce(v_activation_cost,50);
  v_real_required:=0;
  v_game_required:=90;

  v_real_days:=greatest(0,current_date-v_club.created_at::date);
  if v_game_date is not null and v_club.created_game_date is not null then
    v_game_days:=greatest(0,v_game_date-v_club.created_game_date);
  end if;

  if v_game_days < 90 then
    raise exception
      'Youth Academy requires % real-life days or % in-game days.',
      v_real_required,
      v_game_required;
  end if;

  select coalesce(w.balance,0)::integer into v_coin_balance
  from public.user_wallets w
  where w.user_id=v_user;
  v_coin_balance:=coalesce(v_coin_balance,0);

  if v_coin_balance < v_activation_cost then
    raise exception
      'Not enough coins. % coins are required; current balance is %.',
      v_activation_cost,
      v_coin_balance;
  end if;

  v_coin_debited:=public.debit_user_coins_idempotent_v1(
    v_user,
    v_activation_cost,
    'youth_academy_activation',
    'youth_academy_activation:'||v_club.id::text,
    jsonb_build_object(
      'category','youth_academy',
      'club_id',v_club.id,
      'coin_cost',v_activation_cost,
      'season_number',v_season,
      'one_time_activation',true
    )
  );

  if not v_coin_debited then
    raise exception 'Youth Academy activation has already been processed.';
  end if;

  perform public.finance_spend_from_club(
    v_club.id,v_allocation,'youth_academy_initial_allocation','SINK',
    'youth-academy-activation:'||v_club.id::text||':'||v_season::text,
    jsonb_build_object(
      'purpose','youth_academy_initial_allocation',
      'season_number',v_season
    )
  );

  insert into public.youth_academies(
    club_id,is_ai,is_active,activated_season,capacity
  )
  values(v_club.id,false,true,v_season,16)
  returning id into v_academy_id;

  v_created:=true;

  insert into public.youth_academy_settings(academy_id)
  values(v_academy_id);

  for v_i in 1..6 loop
    perform private.create_youth_rider_v1(
      v_academy_id,v_club.country_code,true,false
    );
  end loop;

  perform private.create_youth_academy_staff_v1(
    v_club.id,v_club.country_code,'youth_academy_director'
  );
  perform private.create_youth_academy_staff_v1(
    v_club.id,v_club.country_code,'u16_head_coach'
  );

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,initial_allocation,
    committed_amount,scouting_range,scouting_budget,scouting_committed_amount
  )
  values(
    v_academy_id,v_season,v_allocation,v_allocation,
    5000,'local',5000,5000
  )
  on conflict(academy_id,season_number) do nothing;

  if v_created then
    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      v_academy_id,v_season,v_game_date,'budget_transfer_in',
      'Initial Youth Academy allocation',v_allocation,
      jsonb_build_object('source','senior_team','initial_allocation',true)
    );

    perform public.create_user_game_notification_v1(
      v_user,'YOUTH_ACADEMY_STARTED',
      'Your Youth Academy is ready',
      'Your U16 programme is active with six riders and its starter staff. Set responsibilities, scouting, race participation and the Academy budget before the first events.',
      '/dashboard/manual?section=youth-academy',
      jsonb_build_object(
        'academy_id',v_academy_id,
        'club_id',v_club.id,
        'manual_section','youth-academy',
        'academy_url','/dashboard/youth-academy',
        'manual_url','/dashboard/manual?section=youth-academy',
        'season_number',v_season,
        'activation_coin_cost',v_activation_cost
      ),
      'youth-academy-started:'||v_academy_id::text,
      null
    );
  end if;

  return public.get_my_youth_academy_v1();
end;
$function$;

CREATE OR REPLACE FUNCTION public.user_has_youth_academy_access_v1(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    p_user_id is not null
    and public.user_has_paid_premium_access_v1(p_user_id)
    and exists (
      select 1
      from public.clubs c
      join public.youth_academies a
        on a.club_id = c.id
       and a.is_active = true
      where c.owner_user_id = p_user_id
        and c.deleted_at is null
        and c.parent_club_id is null
        and coalesce(c.club_type, 'main') <> 'developing'
        and coalesce(a.renewed_through_season, a.activated_season, 0)
            >= coalesce(public.get_current_season_number(), 1)
    );
$function$;

CREATE OR REPLACE FUNCTION public.renew_my_youth_academy_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_club_id uuid;
  v_academy_id uuid;
  v_current_season integer := coalesce(public.get_current_season_number(), 1);
  v_renewal_cost integer := public.youth_academy_renewal_coin_cost_v1();
  v_balance integer := 0;
  v_renewed_through integer := 0;
  v_debited boolean := false;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if not public.user_has_paid_premium_access_v1(v_user) then
    raise exception 'Youth Academy renewal requires an active Premium membership.';
  end if;

  select c.id
  into v_club_id
  from public.clubs c
  where c.owner_user_id = v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type, 'main') <> 'developing'
  order by c.created_at asc
  limit 1;

  if v_club_id is null then
    raise exception 'Main club not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('youth_academy_renew:' || v_club_id::text || ':' || v_current_season::text)
  );

  select a.id, coalesce(a.renewed_through_season, a.activated_season, 0)
  into v_academy_id, v_renewed_through
  from public.youth_academies a
  where a.club_id = v_club_id
    and a.is_active = true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated.';
  end if;

  if v_renewed_through >= v_current_season then
    return public.get_my_youth_academy_v1();
  end if;

  select coalesce(w.balance, 0)::integer
  into v_balance
  from public.user_wallets w
  where w.user_id = v_user;

  v_balance := coalesce(v_balance, 0);

  if v_balance < v_renewal_cost then
    raise exception
      'Not enough coins. % coins are required for Youth Academy renewal; current balance is %.',
      v_renewal_cost,
      v_balance;
  end if;

  v_debited := public.debit_user_coins_idempotent_v1(
    v_user,
    v_renewal_cost,
    'youth_academy_season_renewal',
    'youth_academy_renewal:' || v_academy_id::text || ':season:' || v_current_season::text,
    jsonb_build_object(
      'category', 'youth_academy',
      'academy_id', v_academy_id,
      'club_id', v_club_id,
      'coin_cost', v_renewal_cost,
      'season_number', v_current_season,
      'seasonal_renewal', true
    )
  );

  if not v_debited then
    raise exception 'Youth Academy renewal has already been processed for this season.';
  end if;

  update public.youth_academies
  set renewed_through_season = v_current_season
  where id = v_academy_id;

  return public.get_my_youth_academy_v1();
end;
$function$;
