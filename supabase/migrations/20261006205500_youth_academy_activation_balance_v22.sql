-- Youth Academy activation balance pass.
-- Premium remains required. New Academy activations also require:
--   * 30 real-life days OR 60 in-game days since main-club creation
--   * one-time 50 coin activation fee
-- Existing Academies are grandfathered: no retroactive fee and no reactivation fee.
-- There is intentionally no seasonal coin renewal for Youth Academy because
-- the Academy already has club-cash budgets, staff, scouting, race and operating costs.

create table if not exists public.youth_academy_service_config (
  config_key text primary key,
  activation_coin_cost integer not null check (activation_coin_cost >= 0),
  real_days_required integer not null check (real_days_required >= 0),
  game_days_required integer not null check (game_days_required >= 0),
  updated_at timestamptz not null default now()
);

insert into public.youth_academy_service_config (
  config_key,
  activation_coin_cost,
  real_days_required,
  game_days_required,
  updated_at
)
values ('default', 50, 30, 60, now())
on conflict (config_key) do update
set activation_coin_cost = excluded.activation_coin_cost,
    real_days_required = excluded.real_days_required,
    game_days_required = excluded.game_days_required,
    updated_at = now();

revoke all on table public.youth_academy_service_config from anon, authenticated;

create or replace function public.youth_academy_activation_coin_cost_v1()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select activation_coin_cost
     from public.youth_academy_service_config
     where config_key = 'default'),
    50
  )::integer;
$$;

create or replace function public.get_my_youth_academy_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'auth', 'pg_temp'
as $function$
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

  v_premium:=public.user_has_premium_access_v1(v_user);

  select
    coalesce(cfg.activation_coin_cost,50),
    coalesce(cfg.real_days_required,30),
    coalesce(cfg.game_days_required,60)
  into v_activation_cost,v_real_required,v_game_required
  from public.youth_academy_service_config cfg
  where cfg.config_key='default';

  v_activation_cost:=coalesce(v_activation_cost,50);
  v_real_required:=coalesce(v_real_required,30);
  v_game_required:=coalesce(v_game_required,60);

  v_real_days:=greatest(0,current_date-v_club.created_at::date);
  if v_game_date is not null and v_club.created_game_date is not null then
    v_game_days:=greatest(0,v_game_date-v_club.created_game_date);
  end if;
  v_time_met:=v_real_days>=v_real_required or v_game_days>=v_game_required;

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

create or replace function public.activate_my_youth_academy_v1(
  p_season_budget bigint default 100000
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'auth', 'pg_temp'
as $function$
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
  if not public.user_has_premium_access_v1(v_user) then
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
  v_real_required:=coalesce(v_real_required,30);
  v_game_required:=coalesce(v_game_required,60);

  v_real_days:=greatest(0,current_date-v_club.created_at::date);
  if v_game_date is not null and v_club.created_game_date is not null then
    v_game_days:=greatest(0,v_game_date-v_club.created_game_date);
  end if;

  if not (v_real_days>=v_real_required or v_game_days>=v_game_required) then
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

grant execute on function public.youth_academy_activation_coin_cost_v1() to authenticated;
grant execute on function public.get_my_youth_academy_v1() to authenticated;
grant execute on function public.activate_my_youth_academy_v1(bigint) to authenticated;
