
-- Youth Academy operations follow-up:
-- weekly scouting reset, temporary responsibility cover,
-- real youth assets/race supplies, and conservative delegated purchasing.

create or replace function public.format_youth_game_date_v1(p_date date)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select case
    when p_date is null then '—'
    else 'Season ' || greatest(1,extract(year from p_date)::integer-1999)::text
         || ' · ' || to_char(p_date,'DD Mon')
  end;
$$;

revoke all on function public.format_youth_game_date_v1(date) from public,anon;
grant execute on function public.format_youth_game_date_v1(date) to authenticated,service_role;

create table if not exists public.youth_temporary_responsibility_covers (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  responsibility text not null check (
    responsibility in (
      'recruitment','recruitment_negotiation','race_entry','race_squad',
      'equipment','camp','training'
    )
  ),
  original_role text not null,
  cover_staff_id uuid not null references public.club_staff(id) on delete cascade,
  quality_penalty_percent smallint not null
    check (quality_penalty_percent between 20 and 50),
  assigned_on date not null,
  cleared_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academy_id,responsibility)
);

alter table public.youth_temporary_responsibility_covers enable row level security;
revoke all on public.youth_temporary_responsibility_covers from public,anon,authenticated;
create index if not exists youth_temp_cover_staff_idx
  on public.youth_temporary_responsibility_covers(cover_staff_id)
  where cleared_on is null;

create or replace function private.youth_active_temporary_cover_v1(
  p_academy_id uuid,
  p_responsibility text
)
returns table(
  cover_id uuid,
  staff_id uuid,
  original_role text,
  quality_penalty_percent smallint
)
language sql
stable
security definer
set search_path=public,private,pg_temp
as $$
  with settings as (
    select
      s.*,
      case p_responsibility
        when 'recruitment' then s.recruitment_decider
        when 'recruitment_negotiation' then s.recruitment_negotiation_decider
        when 'race_entry' then s.race_entry_decider
        when 'race_squad' then s.race_squad_decider
        when 'equipment' then s.equipment_decider
        when 'camp' then s.camp_decider
        when 'training' then s.training_decider
        else 'manager'
      end as saved_role
    from public.youth_academy_settings s
    where s.academy_id=p_academy_id
  )
  select c.id,c.cover_staff_id,c.original_role,c.quality_penalty_percent
  from public.youth_temporary_responsibility_covers c
  join settings s on true
  where c.academy_id=p_academy_id
    and c.responsibility=p_responsibility
    and c.cleared_on is null
    and s.saved_role<>'manager'
    and private.youth_available_role_v1(p_academy_id,s.saved_role) is null
    and private.youth_staff_available_v1(c.cover_staff_id)
  limit 1;
$$;

revoke all on function private.youth_active_temporary_cover_v1(uuid,text)
from public,anon,authenticated;

create or replace function public.get_my_youth_temporary_covers_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',x.cover_id,
      'responsibility',c.responsibility,
      'original_role',x.original_role,
      'cover_staff_id',x.staff_id,
      'cover_staff_name',cs.staff_name,
      'cover_staff_role',cs.role_type,
      'quality_penalty_percent',x.quality_penalty_percent,
      'effective_quality_percent',100-x.quality_penalty_percent,
      'assigned_on',c.assigned_on
    ) order by c.responsibility)
    from public.youth_temporary_responsibility_covers c
    join lateral private.youth_active_temporary_cover_v1(
      c.academy_id,c.responsibility
    ) x on x.cover_id=c.id
    join public.club_staff cs on cs.id=x.staff_id
    where c.academy_id=v_academy_id
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.get_my_youth_temporary_covers_v1()
from public,anon;
grant execute on function public.get_my_youth_temporary_covers_v1()
to authenticated;

create or replace function public.set_my_youth_temporary_cover_v1(
  p_responsibility text,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_saved_role text;
  v_staff public.club_staff%rowtype;
  v_base_penalty integer;
  v_penalty integer;
  v_game_date date:=public.get_current_game_date_date();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  if p_responsibility not in (
    'recruitment','recruitment_negotiation','race_entry','race_squad',
    'equipment','camp','training'
  ) then
    raise exception 'Invalid Youth Academy responsibility';
  end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;
  if v_academy.id is null then raise exception 'Youth Academy is not activated'; end if;

  select * into v_settings
  from public.youth_academy_settings
  where academy_id=v_academy.id;

  v_saved_role:=case p_responsibility
    when 'recruitment' then v_settings.recruitment_decider
    when 'recruitment_negotiation' then v_settings.recruitment_negotiation_decider
    when 'race_entry' then v_settings.race_entry_decider
    when 'race_squad' then v_settings.race_squad_decider
    when 'equipment' then v_settings.equipment_decider
    when 'camp' then v_settings.camp_decider
    when 'training' then v_settings.training_decider
  end;

  if p_staff_id is null then
    update public.youth_temporary_responsibility_covers
    set cleared_on=v_game_date,updated_at=now()
    where academy_id=v_academy.id
      and responsibility=p_responsibility
      and cleared_on is null;
    return public.get_my_youth_temporary_covers_v1();
  end if;

  if coalesce(v_saved_role,'manager')='manager' then
    raise exception 'This responsibility is assigned to the manager and does not need temporary cover.';
  end if;

  if private.youth_available_role_v1(v_academy.id,v_saved_role) is not null then
    raise exception 'The originally assigned Youth staff role is available again.';
  end if;

  select cs.* into v_staff
  from public.club_staff cs
  where cs.id=p_staff_id
    and cs.club_id=v_academy.club_id
    and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
    and private.youth_staff_available_v1(cs.id)
  limit 1;

  if v_staff.id is null then
    raise exception 'Choose an available Youth Academy staff member.';
  end if;

  v_base_penalty:=case
    when p_responsibility in ('race_entry','race_squad','training')
         and v_staff.role_type='youth_academy_director' then 24
    when p_responsibility in ('race_entry','race_squad','training')
         and v_staff.role_type='youth_scout' then 44
    when p_responsibility in ('recruitment','recruitment_negotiation','equipment','camp')
         and v_staff.role_type='u16_head_coach' then 29
    when p_responsibility in ('recruitment','recruitment_negotiation','equipment','camp')
         and v_staff.role_type='youth_scout' then 39
    else 34
  end;

  v_penalty:=least(50,greatest(20,
    v_base_penalty+
    floor(private.youth_deterministic_fraction_v1(
      v_academy.id::text||':'||p_responsibility||':'||v_staff.id::text
    )*7)::integer
  ));

  insert into public.youth_temporary_responsibility_covers(
    academy_id,responsibility,original_role,cover_staff_id,
    quality_penalty_percent,assigned_on,cleared_on,metadata
  )
  values(
    v_academy.id,p_responsibility,v_saved_role,v_staff.id,
    v_penalty,v_game_date,null,
    jsonb_build_object('reason','original_staff_unavailable')
  )
  on conflict(academy_id,responsibility) do update
  set original_role=excluded.original_role,
      cover_staff_id=excluded.cover_staff_id,
      quality_penalty_percent=excluded.quality_penalty_percent,
      assigned_on=excluded.assigned_on,
      cleared_on=null,
      metadata=excluded.metadata,
      updated_at=now();

  perform private.notify_youth_staff_v1(
    v_academy.id,
    'YOUTH_STAFF_HANDOVER',
    'Temporary Youth Academy cover assigned',
    format(
      '%s is temporarily covering %s at %s%% effectiveness until the originally assigned staff role is available again.',
      v_staff.staff_name,
      replace(p_responsibility,'_',' '),
      100-v_penalty
    ),
    'youth-temp-cover:'||v_academy.id||':'||p_responsibility||':'||v_staff.id,
    jsonb_build_object(
      'responsibility',p_responsibility,
      'cover_staff_id',v_staff.id,
      'quality_penalty_percent',v_penalty,
      'original_role',v_saved_role
    )
  );

  perform private.run_youth_staff_decisions_v1(
    v_academy.id,v_game_date,p_responsibility||'_decider'
  );

  return public.get_my_youth_temporary_covers_v1();
end;
$$;

revoke all on function public.set_my_youth_temporary_cover_v1(text,uuid)
from public,anon;
grant execute on function public.set_my_youth_temporary_cover_v1(text,uuid)
to authenticated;

create table if not exists public.youth_academy_assets (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  asset_key text not null check(asset_key in ('team_car','team_bus')),
  asset_level smallint not null check(asset_level between 1 and 5),
  asset_name text not null,
  quantity integer not null default 1 check(quantity>=0),
  condition_percent numeric not null default 100 check(condition_percent between 0 and 100),
  purchase_cost_total bigint not null default 0 check(purchase_cost_total>=0),
  purchased_on date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academy_id,asset_key,asset_level)
);

alter table public.youth_academy_assets enable row level security;
revoke all on public.youth_academy_assets from public,anon,authenticated;

create table if not exists public.youth_academy_race_supplies (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  supply_key text not null,
  display_name text not null,
  quantity_available integer not null default 0 check(quantity_available>=0),
  total_purchased integer not null default 0 check(total_purchased>=0),
  total_used integer not null default 0 check(total_used>=0),
  last_purchased_game_date date,
  last_used_game_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academy_id,supply_key)
);

alter table public.youth_academy_race_supplies enable row level security;
revoke all on public.youth_academy_race_supplies from public,anon,authenticated;

create or replace function private.purchase_youth_academy_asset_v1(
  p_academy_id uuid,
  p_asset_key text,
  p_asset_level smallint,
  p_actor text default 'manager'
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_academy public.youth_academies%rowtype;
  v_cfg public.infrastructure_asset_config%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_id uuid;
begin
  if p_asset_key not in ('team_car','team_bus') then
    raise exception 'Youth Academy can purchase only Team Cars and Team Buses.';
  end if;

  select * into v_academy
  from public.youth_academies where id=p_academy_id and is_active
  for update;
  if v_academy.id is null then raise exception 'Youth Academy is not active'; end if;

  select * into v_cfg
  from public.infrastructure_asset_config
  where asset_key=p_asset_key and asset_level=p_asset_level;
  if v_cfg.asset_key is null then raise exception 'Youth asset configuration not found'; end if;

  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_season
  for update;

  if v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount<v_cfg.cost_cash then
    raise exception 'Youth Academy budget is too low for this asset.';
  end if;

  insert into public.youth_academy_assets(
    academy_id,asset_key,asset_level,asset_name,quantity,
    condition_percent,purchase_cost_total,purchased_on,metadata
  )
  values(
    p_academy_id,p_asset_key,p_asset_level,v_cfg.asset_name,1,
    100,v_cfg.cost_cash,v_game_date,
    jsonb_build_object('actor',p_actor,'delivery_game_days',v_cfg.delivery_game_days)
  )
  on conflict(academy_id,asset_key,asset_level) do update
  set quantity=public.youth_academy_assets.quantity+1,
      purchase_cost_total=public.youth_academy_assets.purchase_cost_total+excluded.purchase_cost_total,
      condition_percent=greatest(public.youth_academy_assets.condition_percent,100),
      updated_at=now()
  returning id into v_id;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_cfg.cost_cash,updated_at=now()
  where academy_id=p_academy_id and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  )
  values(
    p_academy_id,v_season,v_game_date,'equipment_asset',
    'Youth Academy asset: '||v_cfg.asset_name,-v_cfg.cost_cash,
    jsonb_build_object(
      'asset_key',p_asset_key,'asset_level',p_asset_level,'actor',p_actor
    )
  );

  return v_id;
end;
$$;

revoke all on function private.purchase_youth_academy_asset_v1(uuid,text,smallint,text)
from public,anon,authenticated;

create or replace function private.purchase_youth_academy_supply_v1(
  p_academy_id uuid,
  p_catalog_item_id uuid,
  p_quantity integer,
  p_actor text default 'manager'
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_item public.equipment_catalog%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_qty integer:=greatest(1,least(500,coalesce(p_quantity,1)));
  v_cost bigint;
  v_id uuid;
begin
  select * into v_item
  from public.equipment_catalog
  where id=p_catalog_item_id
    and is_active=true
    and equipment_kind='race_supply';

  if v_item.id is null then raise exception 'Race supply item not found'; end if;
  v_cost:=v_item.base_price_cash*v_qty;

  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_season
  for update;
  if v_budget.academy_id is null then raise exception 'Youth Academy budget not found'; end if;
  if v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount<v_cost then
    raise exception 'Youth Academy budget is too low for these race supplies.';
  end if;

  insert into public.youth_academy_race_supplies(
    academy_id,supply_key,display_name,quantity_available,total_purchased,
    last_purchased_game_date,metadata
  )
  values(
    p_academy_id,v_item.equipment_category,v_item.display_name,
    v_qty,v_qty,v_game_date,
    jsonb_build_object('catalog_item_id',v_item.id,'actor',p_actor)
  )
  on conflict(academy_id,supply_key) do update
  set quantity_available=public.youth_academy_race_supplies.quantity_available+excluded.quantity_available,
      total_purchased=public.youth_academy_race_supplies.total_purchased+excluded.total_purchased,
      last_purchased_game_date=excluded.last_purchased_game_date,
      updated_at=now()
  returning id into v_id;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_cost,updated_at=now()
  where academy_id=p_academy_id and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  )
  values(
    p_academy_id,v_season,v_game_date,'race_supplies',
    'Youth Academy race supplies: '||v_item.display_name||' × '||v_qty,
    -v_cost,
    jsonb_build_object(
      'catalog_item_id',v_item.id,'supply_key',v_item.equipment_category,
      'quantity',v_qty,'actor',p_actor
    )
  );

  return v_id;
end;
$$;

revoke all on function private.purchase_youth_academy_supply_v1(uuid,uuid,integer,text)
from public,anon,authenticated;

create or replace function public.purchase_my_youth_academy_asset_v1(
  p_asset_key text,
  p_asset_level smallint
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select a.id,es.equipment_decider
  into v_academy_id,v_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  join private.youth_effective_settings_v1 es on es.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active
  limit 1;
  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if v_decider<>'manager'
     or exists(select 1 from private.youth_active_temporary_cover_v1(v_academy_id,'equipment')) then
    raise exception 'Equipment purchasing is delegated to Youth Academy staff.';
  end if;
  perform private.purchase_youth_academy_asset_v1(
    v_academy_id,p_asset_key,p_asset_level,'manager'
  );
  return public.get_my_youth_academy_equipment_v1();
end;
$$;

revoke all on function public.purchase_my_youth_academy_asset_v1(text,smallint)
from public,anon;
grant execute on function public.purchase_my_youth_academy_asset_v1(text,smallint)
to authenticated;

create or replace function public.purchase_my_youth_academy_race_supply_v1(
  p_catalog_item_id uuid,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select a.id,es.equipment_decider
  into v_academy_id,v_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  join private.youth_effective_settings_v1 es on es.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active
  limit 1;
  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if v_decider<>'manager'
     or exists(select 1 from private.youth_active_temporary_cover_v1(v_academy_id,'equipment')) then
    raise exception 'Equipment purchasing is delegated to Youth Academy staff.';
  end if;
  perform private.purchase_youth_academy_supply_v1(
    v_academy_id,p_catalog_item_id,p_quantity,'manager'
  );
  return public.get_my_youth_academy_equipment_v1();
end;
$$;

revoke all on function public.purchase_my_youth_academy_race_supply_v1(uuid,integer)
from public,anon;
grant execute on function public.purchase_my_youth_academy_race_supply_v1(uuid,integer)
to authenticated;

create or replace function private.manage_youth_equipment_v2(
  p_academy_id uuid,
  p_staff_id uuid,
  p_quality_penalty_percent integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_budget public.youth_academy_season_budgets%rowtype;
  v_item public.equipment_catalog%rowtype;
  v_supply public.equipment_catalog%rowtype;
  v_asset public.infrastructure_asset_config%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_available bigint;
  v_reserve bigint;
  v_spendable bigint;
  v_active_riders integer:=0;
  v_stock integer;
  v_target integer;
  v_qty integer;
  v_actions jsonb:='[]'::jsonb;
  v_actor text:='academy_staff';
  v_id uuid;
begin
  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_season
  for update;
  if v_budget.academy_id is null then return jsonb_build_object('actions',v_actions); end if;

  select count(*)::integer into v_active_riders
  from public.youth_riders
  where academy_id=p_academy_id and status in ('academy','graduating');

  v_available:=greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount);
  v_reserve:=greatest(20000,round(v_budget.season_budget*0.25)::bigint);
  v_spendable:=greatest(0,v_available-v_reserve);

  -- Fill at most one genuinely missing durable-equipment category per decision.
  select ec.* into v_item
  from public.equipment_catalog ec
  where ec.is_active
    and ec.equipment_kind='durable'
    and ec.tier between 1 and 2
    and ec.equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes')
    and ec.base_price_cash<=v_spendable
    and not exists(
      select 1 from public.youth_academy_equipment_inventory inv
      where inv.academy_id=p_academy_id
        and inv.equipment_category=ec.equipment_category
        and inv.status in ('available','in_use')
        and inv.condition_percent>25
    )
  order by
    ec.tier asc,
    (ec.quality_score::numeric/greatest(ec.base_price_cash,1)) desc,
    ec.base_price_cash asc
  limit 1;

  if v_item.id is not null then
    v_id:=private.purchase_youth_academy_equipment_v1(
      p_academy_id,v_item.id,false
    );
    v_spendable:=greatest(0,v_spendable-v_item.base_price_cash);
    v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
      'type','equipment','name',v_item.display_name,'cost',v_item.base_price_cash
    ));
  end if;

  -- Keep a conservative operating stock of the same race-supply categories as the senior team.
  for v_supply in
    select *
    from public.equipment_catalog
    where is_active and equipment_kind='race_supply'
    order by base_price_cash,equipment_category
  loop
    select coalesce(quantity_available,0) into v_stock
    from public.youth_academy_race_supplies
    where academy_id=p_academy_id and supply_key=v_supply.equipment_category;
    v_stock:=coalesce(v_stock,0);

    v_target:=case v_supply.equipment_category
      when 'bidons_water_bottles' then greatest(12,v_active_riders*3)
      when 'energy_gels' then greatest(18,v_active_riders*4)
      when 'nutrition_packs' then greatest(10,v_active_riders*2)
      when 'race_jersey_complete' then greatest(6,v_active_riders)
      when 'rain_jackets' then greatest(4,ceil(v_active_riders/2.0)::integer)
      else greatest(6,v_active_riders)
    end;

    if v_stock<v_target and v_spendable>=v_supply.base_price_cash then
      v_qty:=least(
        v_target-v_stock,
        greatest(1,floor(v_spendable/greatest(v_supply.base_price_cash,1))::integer)
      );
      if v_qty>0 then
        perform private.purchase_youth_academy_supply_v1(
          p_academy_id,v_supply.id,v_qty,v_actor
        );
        v_spendable:=greatest(0,v_spendable-(v_supply.base_price_cash*v_qty));
        v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
          'type','race_supply','name',v_supply.display_name,
          'quantity',v_qty,'cost',v_supply.base_price_cash*v_qty
        ));
      end if;
    end if;
  end loop;

  -- A Youth Academy may own only Team Cars and Team Buses.
  -- Staff buy basic operational assets only when the safety reserve remains intact.
  if v_spendable>0 and not exists(
    select 1 from public.youth_academy_assets
    where academy_id=p_academy_id and asset_key='team_car' and quantity>0
  ) then
    select * into v_asset from public.infrastructure_asset_config
    where asset_key='team_car' and asset_level=1;
    if v_asset.asset_key is not null and v_asset.cost_cash<=v_spendable then
      perform private.purchase_youth_academy_asset_v1(
        p_academy_id,'team_car',1,v_actor
      );
      v_spendable:=greatest(0,v_spendable-v_asset.cost_cash);
      v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
        'type','asset','name',v_asset.asset_name,'cost',v_asset.cost_cash
      ));
    end if;
  end if;

  if v_active_riders>=10 and v_spendable>30000 and not exists(
    select 1 from public.youth_academy_assets
    where academy_id=p_academy_id and asset_key='team_bus' and quantity>0
  ) then
    select * into v_asset from public.infrastructure_asset_config
    where asset_key='team_bus' and asset_level=1;
    if v_asset.asset_key is not null and v_asset.cost_cash<=v_spendable then
      perform private.purchase_youth_academy_asset_v1(
        p_academy_id,'team_bus',1,v_actor
      );
      v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
        'type','asset','name',v_asset.asset_name,'cost',v_asset.cost_cash
      ));
    end if;
  end if;

  return jsonb_build_object(
    'actions',v_actions,
    'quality_penalty_percent',greatest(0,least(50,coalesce(p_quality_penalty_percent,0))),
    'safety_reserve',v_reserve
  );
end;
$$;

revoke all on function private.manage_youth_equipment_v2(uuid,uuid,integer)
from public,anon,authenticated;

create or replace function public.get_my_youth_academy_equipment_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_decider text:='manager';
  v_cover jsonb:=null;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
  limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'activated',false,'catalog','[]'::jsonb,'inventory','[]'::jsonb,
      'assets','[]'::jsonb,'asset_catalog','[]'::jsonb,
      'race_supplies','[]'::jsonb,'race_supply_catalog','[]'::jsonb
    );
  end if;

  select coalesce(s.equipment_decider,'manager')
  into v_decider
  from private.youth_effective_settings_v1 s
  where s.academy_id=v_academy.id;

  select jsonb_build_object(
    'cover_staff_id',x.staff_id,
    'cover_staff_name',cs.staff_name,
    'cover_staff_role',cs.role_type,
    'quality_penalty_percent',x.quality_penalty_percent
  )
  into v_cover
  from private.youth_active_temporary_cover_v1(v_academy.id,'equipment') x
  join public.club_staff cs on cs.id=x.staff_id
  limit 1;

  return jsonb_build_object(
    'activated',true,
    'equipment_decider',coalesce(v_decider,'manager'),
    'temporary_cover',v_cover,
    'catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ec.id,'display_name',ec.display_name,
        'equipment_category',ec.equipment_category,'tier',ec.tier,
        'quality_score',ec.quality_score,'durability_score',ec.durability_score,
        'price',ec.base_price_cash,'effects',ec.effects,'metadata',ec.metadata
      ) order by ec.equipment_category,ec.base_price_cash,ec.quality_score desc)
      from public.equipment_catalog ec
      where ec.is_active=true
        and ec.equipment_kind='durable'
        and ec.tier between 1 and 2
        and ec.equipment_category in (
          'frame','wheelset','tires','groupset','helmet','shoes'
        )
    ),'[]'::jsonb),
    'inventory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'catalog_item_id',e.catalog_item_id,
        'display_name',e.display_name,'equipment_category',e.equipment_category,
        'quality_score',e.quality_score,'durability_score',e.durability_score,
        'condition_percent',e.condition_percent,'purchase_cost',e.purchase_cost,
        'status',e.status,'purchased_on',e.purchased_on,'metadata',e.metadata
      ) order by e.equipment_category,e.purchased_on desc,e.created_at desc)
      from public.youth_academy_equipment_inventory e
      where e.academy_id=v_academy.id and e.status<>'retired'
    ),'[]'::jsonb),
    'asset_catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'asset_key',c.asset_key,'asset_level',c.asset_level,
        'asset_name',c.asset_name,'cost',c.cost_cash,
        'delivery_game_days',c.delivery_game_days,
        'support_value',c.support_value,'max_total_quantity',c.max_total_quantity
      ) order by c.asset_key,c.asset_level)
      from public.infrastructure_asset_config c
      where c.asset_key in ('team_car','team_bus') and c.asset_level between 1 and 2
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'asset_key',a.asset_key,'asset_level',a.asset_level,
        'asset_name',a.asset_name,'quantity',a.quantity,
        'condition_percent',a.condition_percent,
        'purchase_cost_total',a.purchase_cost_total,
        'purchased_on',a.purchased_on
      ) order by a.asset_key,a.asset_level)
      from public.youth_academy_assets a
      where a.academy_id=v_academy.id and a.quantity>0
    ),'[]'::jsonb),
    'race_supply_catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ec.id,'display_name',ec.display_name,
        'supply_key',ec.equipment_category,'price',ec.base_price_cash,
        'metadata',ec.metadata
      ) order by ec.base_price_cash,ec.display_name)
      from public.equipment_catalog ec
      where ec.is_active and ec.equipment_kind='race_supply'
    ),'[]'::jsonb),
    'race_supplies',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',coalesce(s.id,ec.id),
        'catalog_item_id',ec.id,
        'supply_key',ec.equipment_category,
        'display_name',ec.display_name,
        'quantity_available',coalesce(s.quantity_available,0),
        'total_purchased',coalesce(s.total_purchased,0),
        'total_used',coalesce(s.total_used,0),
        'unit_price',ec.base_price_cash,
        'last_purchased_game_date',s.last_purchased_game_date,
        'metadata',ec.metadata
      ) order by ec.base_price_cash,ec.display_name)
      from public.equipment_catalog ec
      left join public.youth_academy_race_supplies s
        on s.academy_id=v_academy.id and s.supply_key=ec.equipment_category
      where ec.is_active and ec.equipment_kind='race_supply'
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function private.reset_youth_scouting_week_v1(p_game_date date)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_week date:=date_trunc('week',p_game_date)::date;
  v_count integer:=0;
begin
  if extract(isodow from p_game_date)::integer<>1 then return 0; end if;

  update public.youth_scouting_reports
  set status='expired',
      expires_on=least(expires_on,p_game_date-1),
      updated_at=now()
  where discovered_on<v_week
    and status in ('new','shortlisted','approached');
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function private.reset_youth_scouting_week_v1(date)
from public,anon,authenticated;

create or replace function public.get_my_youth_scouting_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_scout public.club_staff%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_cycle_month date:=date_trunc('month',v_game_date)::date;
  v_cycle_week date:=date_trunc('week',v_game_date)::date;
  v_cycle public.youth_scouting_cycles%rowtype;
  v_week_runs integer:=0;
  v_next_coin_cost integer:=0;
  v_coin_balance integer:=0;
  v_scout_score integer:=0;
  v_report_quota integer:=0;
  v_premium boolean:=false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at
  limit 1;
  if v_club.id is null then raise exception 'Main club not found'; end if;

  v_premium:=public.user_has_premium_access_v1(v_user);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id and a.is_active=true
  limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'activated',false,'premium',v_premium,
      'reports','[]'::jsonb,'offers','[]'::jsonb
    );
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select * into v_settings
  from private.youth_effective_settings_v1 s
  where s.academy_id=v_academy.id;

  select * into v_scout
  from public.club_staff cs
  where cs.club_id=v_club.id
    and cs.is_active=true and private.youth_staff_available_v1(cs.id)
    and cs.role_type='youth_scout'
  order by
    (cs.expertise*0.45+cs.experience*0.20+cs.efficiency*0.25+cs.potential*0.10) desc,
    cs.id
  limit 1;

  if v_scout.id is not null then
    v_scout_score:=private.youth_scout_score_v1(v_club.id);
    v_report_quota:=case
      when v_scout_score>=90 then 6
      when v_scout_score>=75 then 5
      when v_scout_score>=60 then 4
      when v_scout_score>=45 then 3
      when v_scout_score>=30 then 2
      else 1
    end;
  end if;

  select count(*)::integer into v_week_runs
  from public.youth_scouting_cycles c
  where c.academy_id=v_academy.id and c.cycle_week=v_cycle_week;

  select * into v_cycle
  from public.youth_scouting_cycles c
  where c.academy_id=v_academy.id and c.cycle_week=v_cycle_week
  order by c.run_number desc
  limit 1;

  v_next_coin_cost:=case coalesce(v_budget.scouting_range,'local')
    when 'local' then 2
    when 'regional' then 5
    when 'continental' then 8
    else 12
  end;

  select coalesce(w.balance,0)::integer into v_coin_balance
  from public.user_wallets w where w.user_id=v_user;
  v_coin_balance:=coalesce(v_coin_balance,0);

  return jsonb_build_object(
    'activated',true,'premium',v_premium,'read_only',not v_premium,
    'game_date',v_game_date,
    'cycle_month',v_cycle_month,
    'cycle_week',v_cycle_week,
    'next_reset_on',v_cycle_week+7,
    'weekly_runs_used',v_week_runs,
    'weekly_run_limit',4,
    'free_runs_remaining',case when v_week_runs=0 then 1 else 0 end,
    'boost_runs_remaining',greatest(0,4-v_week_runs),
    'next_run_coin_cost',case when v_week_runs=0 then 0 else v_next_coin_cost end,
    'boost_coin_cost',v_next_coin_cost,
    'coin_balance',v_coin_balance,
    'scouting_range',coalesce(v_budget.scouting_range,'local'),
    'scouting_budget',coalesce(v_budget.scouting_budget,0),
    'scouting_committed_amount',coalesce(v_budget.scouting_committed_amount,0),
    'scout',case when v_scout.id is null then null else jsonb_build_object(
      'id',v_scout.id,'name',v_scout.staff_name,'country_code',v_scout.country_code,
      'expertise',v_scout.expertise,'experience',v_scout.experience,
      'efficiency',v_scout.efficiency,'score',v_scout_score,
      'monthly_report_quota',v_report_quota,'reports_per_search',v_report_quota
    ) end,
    'current_cycle',case when v_cycle.id is null then null else jsonb_build_object(
      'id',v_cycle.id,'cycle_month',v_cycle.cycle_month,'cycle_week',v_cycle.cycle_week,
      'run_number',v_cycle.run_number,'coin_cost',v_cycle.coin_cost,
      'is_coin_boost',v_cycle.is_coin_boost,'range',v_cycle.scouting_range,
      'scout_score',v_cycle.scout_score,'reports_created',v_cycle.reports_created
    ) end,
    'can_run',v_premium and v_scout.id is not null and v_week_runs<4,
    'can_run_free',v_premium and v_scout.id is not null and v_week_runs=0,
    'can_run_coin',v_premium and v_scout.id is not null and v_week_runs between 1 and 3,
    'director_mode',v_settings.recruitment_decider='academy_director',
    'auto_rules',jsonb_build_object(
      'min_band',v_settings.auto_recruit_min_band,
      'max_stipend_weekly',v_settings.auto_recruit_max_stipend_weekly,
      'max_compensation',v_settings.auto_recruit_max_compensation,
      'min_free_slots',v_settings.auto_recruit_min_free_slots
    ),
    'reports',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,'target_kind',r.target_kind,
        'display_name',trim(r.first_name||' '||r.last_name),
        'country_code',r.country_code,
        'age',private.youth_academy_age_v1(r.birth_date),
        'role',r.role,'assessment_band',r.assessment_band,
        'confidence',r.confidence,
        'strengths',private.youth_strengths_v1(
          r.sprint,r.climbing,r.time_trial,r.endurance,r.flat,
          r.recovery,r.resistance,r.race_iq,r.teamwork,r.confidence
        ),
        'expected_stipend_weekly',r.expected_stipend_weekly,
        'suggested_accommodation_weekly',r.suggested_accommodation_weekly,
        'suggested_compensation',r.suggested_compensation,
        'relocation_difficulty',r.relocation_difficulty,
        'source_academy_id',r.source_academy_id,
        'source_academy_name',source_club.name,
        'status',r.status,'discovered_on',r.discovered_on,
        'expires_on',least(r.expires_on,v_cycle_week+6),
        'visible_until',v_cycle_week+6,
        'latest_offer',case when offer.id is null then null else jsonb_build_object(
          'id',offer.id,'status',offer.status,
          'stipend_weekly',offer.stipend_weekly,
          'accommodation_weekly',offer.accommodation_weekly,
          'compensation_offer',offer.compensation_offer,
          'source_academy_decision',offer.source_academy_decision,
          'rider_decision',offer.rider_decision,
          'rejection_reason',offer.rejection_reason,
          'submitted_on',offer.submitted_on
        ) end
      ) order by r.discovered_on desc,r.created_at desc),'[]'::jsonb)
      from public.youth_scouting_reports r
      left join public.youth_academies source_a on source_a.id=r.source_academy_id
      left join public.clubs source_club on source_club.id=source_a.club_id
      left join lateral (
        select o.* from public.youth_recruitment_offers o
        where o.report_id=r.id
        order by o.created_at desc limit 1
      ) offer on true
      where r.academy_id=v_academy.id
        and r.discovered_on>=v_cycle_week
        and r.expires_on>=v_game_date
        and r.status not in ('expired','signed')
    )
  );
end;
$$;

-- Staff-decision runner: use an active temporary cover when the saved role
-- is unavailable. The cover works at a deterministic 20-50% quality loss.
create or replace function private.run_youth_staff_decisions_v1(
  p_academy_id uuid,
  p_game_date date,
  p_only text default null
)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
 a public.youth_academies%rowtype;
 s public.youth_academy_settings%rowtype;
 s_saved public.youth_academy_settings%rowtype;
 b public.youth_academy_season_budgets%rowtype;
 v_role text; v_saved_role text; v_staff public.club_staff%rowtype; v_key text;
 v_resp text; v_report public.youth_scouting_reports%rowtype;
 v_race record; v_id uuid; v_count integer:=0; v_summary text; v_meta jsonb;
 v_score integer; v_available bigint; v_slots integer; v_stipend integer;
 v_comp bigint; v_focus text; v_avg_fatigue numeric;
 v_cover record; v_penalty integer:=0; v_is_cover boolean:=false;
 v_equipment jsonb; v_actions integer:=0; v_actor text;
begin
 select * into a
 from public.youth_academies
 where id=p_academy_id and is_active and not is_ai
 for update;
 if a.id is null or not exists(
   select 1 from public.clubs c
   where c.id=a.club_id and c.deleted_at is null
     and public.user_has_premium_access_v1(c.owner_user_id)
 ) then return 0; end if;

 select * into s from private.youth_effective_settings_v1 where academy_id=a.id;
 select * into s_saved from public.youth_academy_settings where academy_id=a.id;

 foreach v_key in array array[
   'recruitment_decider','recruitment_negotiation_decider',
   'race_entry_decider','race_squad_decider','equipment_decider',
   'camp_decider','training_decider'
 ] loop
   if p_only is not null and p_only<>v_key then continue; end if;

   v_resp:=replace(v_key,'_decider','');
   v_role:=to_jsonb(s)->>v_key;
   v_saved_role:=to_jsonb(s_saved)->>v_key;
   v_is_cover:=false;
   v_penalty:=0;
   v_staff:=null;

   if coalesce(v_role,'manager')='manager'
      and coalesce(v_saved_role,'manager')<>'manager' then
     select * into v_cover
     from private.youth_active_temporary_cover_v1(a.id,v_resp)
     limit 1;
     if v_cover.staff_id is not null then
       select * into v_staff from public.club_staff where id=v_cover.staff_id;
       v_penalty:=v_cover.quality_penalty_percent;
       v_is_cover:=true;
     else
       continue;
     end if;
   elsif coalesce(v_role,'manager')='manager' then
     continue;
   else
     select * into v_staff
     from public.club_staff
     where id=private.youth_available_role_v1(a.id,v_role);
   end if;

   if v_staff.id is null then continue; end if;
   if exists(
     select 1 from public.youth_staff_decisions
     where academy_id=a.id and game_date=p_game_date and responsibility=v_key
   ) then continue; end if;

   v_score:=private.youth_staff_quality_score_v1(
     v_staff.role_type,v_staff.expertise,v_staff.experience,v_staff.potential,
     v_staff.leadership,v_staff.efficiency,v_staff.loyalty
   );
   v_score:=greatest(1,round(v_score*(100-v_penalty)/100.0)::integer);
   v_actor:=case when v_is_cover then 'temporary_staff' else v_role end;
   v_summary:=null;
   v_meta:=jsonb_build_object(
     'staff_score_used',v_score,
     'temporary_cover',v_is_cover,
     'quality_penalty_percent',v_penalty
   );

   select * into b
   from public.youth_academy_season_budgets
   where academy_id=a.id and season_number=public.get_current_season_number();
   v_available:=greatest(0,b.season_budget-b.spent_amount-b.committed_amount);
   select 16-count(*) into v_slots
   from public.youth_riders
   where academy_id=a.id and status in ('academy','graduating');

   begin
     if v_key='recruitment_decider' then
       select * into v_report
       from public.youth_scouting_reports r
       where r.academy_id=a.id and r.status='new'
         and r.discovered_on>=date_trunc('week',p_game_date)::date
         and r.expires_on>=p_game_date
         and private.youth_band_rank_v1(r.assessment_band)>=
             private.youth_band_rank_v1(s.auto_recruit_min_band)
       order by
         private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+
         r.confidence*v_score/100.0+
         private.youth_deterministic_fraction_v1(r.id::text||':director')*
           (100-v_score) desc,r.id
       limit 1;
       if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
         update public.youth_scouting_reports
         set status='shortlisted',updated_at=now() where id=v_report.id;
         v_summary:=format(
           '%s shortlisted %s %s for recruitment.',
           v_staff.staff_name,v_report.first_name,v_report.last_name
         );
         v_meta:=v_meta||jsonb_build_object('report_id',v_report.id);
       end if;

     elsif v_key='recruitment_negotiation_decider' then
       select * into v_report
       from public.youth_scouting_reports r
       where r.academy_id=a.id and r.status='shortlisted'
         and r.discovered_on>=date_trunc('week',p_game_date)::date
         and r.expires_on>=p_game_date
         and r.expected_stipend_weekly<=s.auto_recruit_max_stipend_weekly
         and r.suggested_compensation<=s.auto_recruit_max_compensation
         and not exists(
           select 1 from public.youth_recruitment_offers o where o.report_id=r.id
         )
       order by private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+
                r.confidence desc,r.id
       limit 1;
       if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
         v_stipend:=least(
           s.auto_recruit_max_stipend_weekly,
           greatest(50,round(
             v_report.expected_stipend_weekly*(1+(100-v_score)/500.0)
           )::integer)
         );
         v_comp:=case when v_report.target_kind='unattached' then 0 else
           least(
             s.auto_recruit_max_compensation,
             round(v_report.suggested_compensation*(1+(100-v_score)/400.0))::bigint
           )
         end;
         v_id:=private.process_youth_recruitment_offer_v1(
           a.id,v_report.id,v_stipend,v_report.suggested_accommodation_weekly,
           v_comp,v_actor
         );
         v_summary:=format(
           '%s negotiated with %s %s: %s per week in support, %s one-time compensation. Decision: %s.',
           v_staff.staff_name,v_report.first_name,v_report.last_name,
           v_stipend+v_report.suggested_accommodation_weekly,v_comp,
           (select status from public.youth_recruitment_offers where id=v_id)
         );
         v_meta:=v_meta||jsonb_build_object('offer_id',v_id);
       end if;

     elsif v_key='equipment_decider' then
       v_equipment:=private.manage_youth_equipment_v2(
         a.id,v_staff.id,v_penalty
       );
       v_actions:=jsonb_array_length(coalesce(v_equipment->'actions','[]'::jsonb));
       if v_actions>0 then
         v_summary:=format(
           '%s reviewed Youth equipment and completed %s necessary purchase action(s)%s.',
           v_staff.staff_name,v_actions,
           case when v_is_cover then
             format(' at %s%% temporary-cover effectiveness',100-v_penalty)
           else '' end
         );
         v_meta:=v_meta||jsonb_build_object(
           'equipment_actions',v_equipment->'actions',
           'safety_reserve',v_equipment->'safety_reserve'
         );
       end if;

     elsif v_key='race_entry_decider' then
       for v_race in
         select r.*
         from public.youth_races r
         join public.youth_race_invitations i on i.race_id=r.id
         where i.academy_id=a.id and i.status='pending'
           and r.status='scheduled' and r.race_date>p_game_date
           and r.race_date<=p_game_date+21
           and (
             r.invitation_response_deadline is null
             or r.invitation_response_deadline>=p_game_date
             or i.invitation_type<>'world_class'
           )
           and private.youth_race_academy_qualified_v1(a.id,r.id)
           and not exists(
             select 1 from public.youth_race_entries e
             where e.race_id=r.id and e.academy_id=a.id
           )
         order by r.invitation_response_deadline nulls last,
           r.entry_cost*v_score/100.0+
           private.youth_deterministic_fraction_v1(
             r.id::text||a.id::text
           )*(100-v_score)*30,
           r.race_date
         limit 20
       loop
         perform private.ensure_youth_monthly_race_plan_v1(
           a.id,v_race.season_number,
           extract(month from v_race.race_date)::integer
         );
         update public.youth_monthly_race_plans
         set approved=true,approved_at=coalesce(approved_at,now())
         where academy_id=a.id
           and season_number=v_race.season_number
           and month_number=extract(month from v_race.race_date)::integer
           and not approved;
         begin
           v_id:=private.enter_youth_race_v1(
             a.id,v_race.id,v_actor,
             case
               when v_score>=70 then 'balanced'
               when v_score<40 then 'conservative'
               else 'balanced'
             end
           );
           v_summary:=format(
             '%s entered %s on %s within the approved race and budget limits.',
             v_staff.staff_name,v_race.race_name,
             public.format_youth_game_date_v1(v_race.race_date)
           );
           v_meta:=v_meta||jsonb_build_object(
             'race_id',v_race.id,'entry_id',v_id
           );
           exit;
         exception when raise_exception then
           continue;
         end;
       end loop;

     elsif v_key='race_squad_decider' then
       select e.id,r.race_name,r.race_date
       into v_race
       from public.youth_race_entries e
       join public.youth_races r on r.id=e.race_id
       where e.academy_id=a.id and e.status='entered'
         and r.status='scheduled' and r.race_date>p_game_date
         and not exists(
           select 1 from public.youth_staff_decisions d
           where d.academy_id=a.id
             and d.responsibility=v_key
             and d.metadata->>'entry_id'=e.id::text
         )
       order by r.race_date,e.id
       limit 1;
       if v_race.id is not null then
         perform private.select_youth_race_lineup_v1(v_race.id,v_actor);
         v_summary:=format(
           '%s selected the Youth squad for %s.',
           v_staff.staff_name,v_race.race_name
         );
         v_meta:=v_meta||jsonb_build_object('entry_id',v_race.id);
       end if;

     elsif v_key='camp_decider' then
       if not exists(
         select 1 from public.youth_training_camps
         where academy_id=a.id and status<>'cancelled'
           and starts_on>=p_game_date-28
       ) and v_available>=2000 then
         select avg(fatigue) into v_avg_fatigue
         from public.youth_riders
         where academy_id=a.id and status='academy';
         v_focus:=case
           when v_avg_fatigue>35 and v_score>=50 then 'freshness'
           when v_score>=65 then 'balanced'
           else 'development'
         end;
         v_id:=private.book_youth_camp_v1(a.id,v_focus,v_actor);
         v_summary:=format(
           '%s booked a three-day %s camp starting %s.',
           v_staff.staff_name,v_focus,
           public.format_youth_game_date_v1(p_game_date+3)
         );
         v_meta:=v_meta||jsonb_build_object('camp_id',v_id);
       end if;

     elsif v_key='training_decider' then
       if not exists(
         select 1 from public.youth_staff_decisions
         where academy_id=a.id and responsibility=v_key
           and game_date>p_game_date-7
       ) then
         select avg(fatigue) into v_avg_fatigue
         from public.youth_riders
         where academy_id=a.id and status='academy';
         v_focus:=case
           when v_avg_fatigue>case when v_score>=60 then 30 else 55 end
             then 'freshness'
           when v_avg_fatigue<20 then 'development'
           else 'balanced'
         end;
         update public.youth_academy_settings
         set training_philosophy=v_focus,updated_at=now()
         where academy_id=a.id;
         update public.youth_riders
         set development_focus=case
           when v_score>=60 then private.youth_focus_for_role_v1(role,'balanced')
           else 'balanced'
         end
         where academy_id=a.id and status='academy';
         v_summary:=format(
           '%s set the Youth training plan to %s after reviewing rider fatigue.',
           v_staff.staff_name,v_focus
         );
       end if;
     end if;

     if v_summary is not null then
       insert into public.youth_staff_decisions(
         academy_id,staff_id,game_date,responsibility,summary,metadata
       )
       values(a.id,v_staff.id,p_game_date,v_key,v_summary,v_meta);

       perform private.notify_youth_staff_v1(
         a.id,'YOUTH_STAFF_DECISION','Youth Academy staff decision',v_summary,
         'youth-decision:'||a.id||':'||p_game_date||':'||v_key,
         v_meta||jsonb_build_object(
           'staff_id',v_staff.id,'responsibility',v_key
         )
       );
       v_count:=v_count+1;
     end if;
   exception when raise_exception then
     null;
   end;
 end loop;
 return v_count;
end;
$$;

create or replace function public.process_youth_academy_game_day_v1(p_game_date date)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_dev jsonb;
  v_academy record;
  v_camp record;
  v_races jsonb;
  v_payroll jsonb;
  v_rider record;
  v_ai_graduated integer:=0;
  v_ai_released integer:=0;
  v_human_pending integer:=0;
  v_pathway_expired integer:=0;
  v_can_develop boolean;
  v_scouting_reset integer:=0;
begin
  perform public.process_staff_courses();

  -- Monday is the hard Youth scouting reset. Signed riders are already in
  -- the Academy squad and are never retained in the report browser.
  v_scouting_reset:=private.reset_youth_scouting_week_v1(p_game_date);

  -- End temporary covers automatically when the originally assigned role returns.
  update public.youth_temporary_responsibility_covers c
  set cleared_on=p_game_date,updated_at=now()
  where c.cleared_on is null
    and private.youth_available_role_v1(c.academy_id,c.original_role) is not null;

  for v_academy in
    select id from public.youth_academies where is_active and not is_ai
  loop
    perform private.run_youth_staff_decisions_v1(v_academy.id,p_game_date);
  end loop;

  for v_camp in
    select * from public.youth_training_camps
    where status='scheduled' and ends_on<=p_game_date
    for update
  loop
    update public.youth_riders
    set fatigue=greatest(0,least(100,fatigue+
          case v_camp.focus when 'freshness' then -8 when 'development' then 4 else -3 end)),
        readiness=least(100,readiness+case when v_camp.staff_score>=65 then 4 else 2 end),
        updated_at=now()
    where academy_id=v_camp.academy_id and id=any(v_camp.rider_ids)
      and status='academy';
    update public.youth_training_camps
    set status='completed' where id=v_camp.id;
  end loop;

  v_payroll:=private.process_youth_academy_weekly_payroll_v1(p_game_date);
  v_dev:=private.process_youth_development_week_v1(p_game_date);
  v_races:=public.process_youth_race_day_v1(p_game_date);

  for v_rider in
    select r.id,r.academy_id,a.is_ai,a.club_id,r.hidden_potential
    from public.youth_riders r
    join public.youth_academies a on a.id=r.academy_id
    where r.status='academy'
      and extract(year from age(p_game_date,r.birth_date))::integer>=16
      and not exists(
        select 1 from public.youth_graduation_records g
        where g.youth_rider_id=r.id
      )
  loop
    insert into public.youth_graduation_records(
      youth_rider_id,academy_id,main_club_id,became_eligible_on,decision
    )
    values(v_rider.id,v_rider.academy_id,v_rider.club_id,p_game_date,'pending');
    update public.youth_riders
    set status='graduating',updated_at=now()
    where id=v_rider.id;

    if v_rider.is_ai then
      select exists(
        select 1 from public.clubs d
        where d.parent_club_id=v_rider.club_id
          and d.club_type='developing'
          and d.deleted_at is null
          and public.is_developing_team_access_active_v1(d.id)
          and (select count(*) from public.club_riders cr where cr.club_id=d.id)<8
      ) into v_can_develop;
      if v_can_develop and v_rider.hidden_potential>=64 then
        perform private.complete_youth_graduation_v1(
          v_rider.id,'developing_team',p_game_date,'ai_academy'
        );
        v_ai_graduated:=v_ai_graduated+1;
      else
        perform private.complete_youth_graduation_v1(
          v_rider.id,'release',p_game_date,'ai_academy'
        );
        v_ai_released:=v_ai_released+1;
      end if;
    else
      v_human_pending:=v_human_pending+1;
    end if;
  end loop;

  for v_rider in
    select g.youth_rider_id
    from public.youth_graduation_records g
    join public.youth_academies a on a.id=g.academy_id
    where g.decision='pathway' and g.completed_on is null
      and g.pathway_expires_on is not null
      and g.pathway_expires_on<=p_game_date
      and a.is_ai=false
  loop
    perform private.complete_youth_graduation_v1(
      v_rider.youth_rider_id,'release',p_game_date,'pathway_expiry'
    );
    v_pathway_expired:=v_pathway_expired+1;
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,'scouting_reports_reset',v_scouting_reset,
    'payroll',v_payroll,'development',v_dev,'races',v_races,
    'ai_graduated_to_developing',v_ai_graduated,
    'ai_released',v_ai_released,
    'human_graduation_decisions_created',v_human_pending,
    'expired_pathways_released',v_pathway_expired
  );
end;
$$;

-- Course notices should use Season + day/month, never a real-world year.
create or replace function private.youth_course_handover_v1()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  a record;
  v_keys text[];
  v_name text;
  v_role text;
  v_start boolean;
  v_return_label text;
begin
  if TG_OP='UPDATE' and new.status is not distinct from old.status then return new; end if;

  select cs.staff_name,
         case cs.role_type
           when 'youth_academy_director' then 'academy_director'
           else cs.role_type
         end
  into v_name,v_role
  from public.club_staff cs
  where cs.id=new.staff_id;

  if v_role not in ('academy_director','u16_head_coach','youth_scout') then
    return new;
  end if;

  v_start:=new.status='active';
  v_return_label:=public.format_youth_game_date_v1(new.completes_on_game_date);

  for a in
    select ya.id,s.*
    from public.youth_academies ya
    join public.youth_academy_settings s on s.academy_id=ya.id
    where ya.club_id=new.club_id and ya.is_active
  loop
    select array_agg(replace(k.key,'_decider',''))
    into v_keys
    from jsonb_each_text(to_jsonb(a)) k
    where k.key like '%_decider' and k.value=v_role;

    if coalesce(cardinality(v_keys),0)=0 then continue; end if;
    if v_start and private.youth_available_role_v1(a.id,v_role) is not null then
      continue;
    end if;

    if not v_start then
      update public.youth_temporary_responsibility_covers c
      set cleared_on=public.get_current_game_date_date(),updated_at=now()
      where c.academy_id=a.id
        and c.original_role=v_role
        and c.cleared_on is null;
    end if;

    perform private.notify_youth_staff_v1(
      a.id,'YOUTH_STAFF_HANDOVER',
      case
        when v_start then 'Youth Academy responsibilities transferred to you'
        else 'Youth Academy staff responsibilities resumed'
      end,
      case
        when v_start then format(
          '%s is attending %s until %s. You now handle: %s. You may assign another available Youth staff member as temporary cover; their work quality will be reduced until the original role returns.',
          v_name,new.course_title,v_return_label,array_to_string(v_keys,', ')
        )
        else format(
          '%s has returned. The saved staff assignments now resume: %s.',
          v_name,array_to_string(v_keys,', ')
        )
      end,
      'youth-course:'||new.id||':'||new.status,
      jsonb_build_object(
        'staff_id',new.staff_id,'course_title',new.course_title,
        'returns_on',new.completes_on_game_date,
        'returns_on_label',v_return_label,'responsibilities',v_keys
      )
    );
  end loop;
  return new;
end;
$$;

revoke all on function private.youth_course_handover_v1()
from public,anon,authenticated;
