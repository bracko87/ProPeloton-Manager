-- A trial may explore Premium tools but cannot waive any coin purchases
-- for permanent equipment or infrastructure slots, or unlock U16 Academy.
CREATE OR REPLACE FUNCTION public.equipment_current_user_has_premium_v1()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  return public.user_has_paid_premium_access_v1(auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION public.infrastructure_current_user_has_premium_v1()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  return public.user_has_paid_premium_access_v1(auth.uid());
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
      'Youth Academy requires 90 game days from main club creation.';
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