
-- Youth Academy equipment policy v2:
-- 22-item hard cap per durable category, diversified staff buying,
-- Team Car/Bus/Equipment Van caps, and four race-type equipment setups.

create table if not exists public.youth_academy_race_equipment_setups (
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  race_type text not null check(race_type in ('flat','hilly','mountain','time_trial')),
  frame_catalog_item_id uuid references public.equipment_catalog(id),
  wheelset_catalog_item_id uuid references public.equipment_catalog(id),
  tires_catalog_item_id uuid references public.equipment_catalog(id),
  groupset_catalog_item_id uuid references public.equipment_catalog(id),
  helmet_catalog_item_id uuid references public.equipment_catalog(id),
  shoes_catalog_item_id uuid references public.equipment_catalog(id),
  configured_by_staff_id uuid references public.club_staff(id) on delete set null,
  configured_by text not null default 'manager',
  quality_penalty_percent smallint not null default 0
    check(quality_penalty_percent between 0 and 50),
  configured_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(academy_id,race_type)
);

alter table public.youth_academy_race_equipment_setups enable row level security;
revoke all on public.youth_academy_race_equipment_setups
from public,anon,authenticated;

create or replace function private.best_youth_equipment_catalog_for_race_v1(
  p_academy_id uuid,
  p_category text,
  p_race_type text
)
returns uuid
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  select inv.catalog_item_id
  from public.youth_academy_equipment_inventory inv
  join public.equipment_catalog ec on ec.id=inv.catalog_item_id
  where inv.academy_id=p_academy_id
    and inv.equipment_category=p_category
    and inv.status in ('available','in_use')
    and inv.condition_percent>25
  group by inv.catalog_item_id,ec.quality_score,ec.effects
  order by
    (
      case p_race_type
        when 'flat' then
          coalesce((ec.effects->>'flat_bonus_pct')::numeric,0)*5
          +coalesce((ec.effects->>'sprint_bonus_pct')::numeric,0)*2
        when 'hilly' then
          coalesce((ec.effects->>'hilly_bonus_pct')::numeric,0)*6
          +coalesce((ec.effects->>'fatigue_reduction_pct')::numeric,0)*2
        when 'mountain' then
          coalesce((ec.effects->>'mountain_bonus_pct')::numeric,0)*7
          +coalesce((ec.effects->>'hilly_bonus_pct')::numeric,0)*2
        when 'time_trial' then
          coalesce((ec.effects->>'time_trial_bonus_pct')::numeric,0)*8
          +coalesce((ec.effects->>'flat_bonus_pct')::numeric,0)
        else 0
      end
      +ec.quality_score*0.08
      +avg(inv.condition_percent)*0.02
    ) desc,
    count(*) desc,
    inv.catalog_item_id
  limit 1;
$function$;

revoke all on function private.best_youth_equipment_catalog_for_race_v1(uuid,text,text)
from public,anon,authenticated;

create or replace function private.configure_youth_equipment_setups_v2(
  p_academy_id uuid,
  p_staff_id uuid default null,
  p_quality_penalty_percent integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_type text;
  v_frame uuid;
  v_wheelset uuid;
  v_tires uuid;
  v_groupset uuid;
  v_helmet uuid;
  v_shoes uuid;
  v_actor text:='manager';
  v_game_date date:=public.get_current_game_date_date();
  v_changed integer:=0;
  v_existing public.youth_academy_race_equipment_setups%rowtype;
begin
  if not exists(
    select 1 from public.youth_academies
    where id=p_academy_id and is_active=true
  ) then
    raise exception 'Youth Academy is not active';
  end if;

  if p_staff_id is not null then
    select coalesce(cs.staff_name,'Youth Academy staff') into v_actor
    from public.club_staff cs
    where cs.id=p_staff_id;
    v_actor:=coalesce(v_actor,'Youth Academy staff');
  end if;

  foreach v_type in array array['flat','hilly','mountain','time_trial'] loop
    v_frame:=private.best_youth_equipment_catalog_for_race_v1(p_academy_id,'frame',v_type);
    v_wheelset:=private.best_youth_equipment_catalog_for_race_v1(p_academy_id,'wheelset',v_type);
    v_tires:=private.best_youth_equipment_catalog_for_race_v1(p_academy_id,'tires',v_type);
    v_groupset:=private.best_youth_equipment_catalog_for_race_v1(p_academy_id,'groupset',v_type);
    v_helmet:=private.best_youth_equipment_catalog_for_race_v1(p_academy_id,'helmet',v_type);
    v_shoes:=private.best_youth_equipment_catalog_for_race_v1(p_academy_id,'shoes',v_type);

    select * into v_existing
    from public.youth_academy_race_equipment_setups
    where academy_id=p_academy_id and race_type=v_type;

    if v_existing.academy_id is null
       or v_existing.frame_catalog_item_id is distinct from v_frame
       or v_existing.wheelset_catalog_item_id is distinct from v_wheelset
       or v_existing.tires_catalog_item_id is distinct from v_tires
       or v_existing.groupset_catalog_item_id is distinct from v_groupset
       or v_existing.helmet_catalog_item_id is distinct from v_helmet
       or v_existing.shoes_catalog_item_id is distinct from v_shoes
       or v_existing.configured_by_staff_id is distinct from p_staff_id
       or v_existing.quality_penalty_percent is distinct from greatest(0,least(50,coalesce(p_quality_penalty_percent,0)))
    then
      v_changed:=v_changed+1;
    end if;

    insert into public.youth_academy_race_equipment_setups(
      academy_id,race_type,
      frame_catalog_item_id,wheelset_catalog_item_id,tires_catalog_item_id,
      groupset_catalog_item_id,helmet_catalog_item_id,shoes_catalog_item_id,
      configured_by_staff_id,configured_by,quality_penalty_percent,configured_on
    )
    values(
      p_academy_id,v_type,
      v_frame,v_wheelset,v_tires,v_groupset,v_helmet,v_shoes,
      p_staff_id,v_actor,
      greatest(0,least(50,coalesce(p_quality_penalty_percent,0))),v_game_date
    )
    on conflict(academy_id,race_type) do update
    set frame_catalog_item_id=excluded.frame_catalog_item_id,
        wheelset_catalog_item_id=excluded.wheelset_catalog_item_id,
        tires_catalog_item_id=excluded.tires_catalog_item_id,
        groupset_catalog_item_id=excluded.groupset_catalog_item_id,
        helmet_catalog_item_id=excluded.helmet_catalog_item_id,
        shoes_catalog_item_id=excluded.shoes_catalog_item_id,
        configured_by_staff_id=excluded.configured_by_staff_id,
        configured_by=excluded.configured_by,
        quality_penalty_percent=excluded.quality_penalty_percent,
        configured_on=excluded.configured_on,
        updated_at=now();
  end loop;

  return jsonb_build_object(
    'changed',v_changed,
    'configured_by',v_actor,
    'quality_penalty_percent',greatest(0,least(50,coalesce(p_quality_penalty_percent,0)))
  );
end;
$function$;

revoke all on function private.configure_youth_equipment_setups_v2(uuid,uuid,integer)
from public,anon,authenticated;

-- Hard durable inventory cap.
create or replace function private.purchase_youth_academy_equipment_v1(
  p_academy_id uuid,
  p_catalog_item_id uuid,
  p_require_manager boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_academy public.youth_academies%rowtype;
  v_catalog public.equipment_catalog%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_game_date date:=public.get_current_game_date_date();
  v_decider text:='manager';
  v_item_id uuid;
  v_discount_pct integer:=0;
  v_purchase_cost bigint:=0;
  v_category_count integer:=0;
begin
  select * into v_academy from public.youth_academies
  where id=p_academy_id and is_active=true for update;
  if v_academy.id is null then raise exception 'Youth Academy is not active'; end if;

  select coalesce(s.equipment_decider,'manager') into v_decider
  from private.youth_effective_settings_v1 s where s.academy_id=p_academy_id;
  if p_require_manager and v_decider<>'manager' then
    raise exception 'Equipment purchasing is delegated to Youth Academy staff.';
  end if;

  select * into v_catalog from public.equipment_catalog ec
  where ec.id=p_catalog_item_id and ec.is_active=true
    and ec.equipment_kind='durable' and ec.tier between 1 and 2
    and ec.equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes');
  if v_catalog.id is null then raise exception 'This item is not available to the Youth Academy.'; end if;

  select count(*)::integer into v_category_count
  from public.youth_academy_equipment_inventory inv
  where inv.academy_id=p_academy_id
    and inv.equipment_category=v_catalog.equipment_category
    and inv.status<>'retired';

  if v_category_count>=22 then
    raise exception 'Youth Academy equipment category limit reached: maximum 22 % items.',
      v_catalog.equipment_category;
  end if;

  v_discount_pct:=private.youth_academy_director_discount_pct_v1(v_academy.club_id);
  v_purchase_cost:=greatest(0,round(v_catalog.base_price_cash*(1-v_discount_pct/100.0))::bigint);

  select * into v_budget from public.youth_academy_season_budgets b
  where b.academy_id=p_academy_id and b.season_number=v_season for update;
  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;
  if v_purchase_cost>greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount) then
    raise exception 'Youth Academy budget is too low for this equipment purchase.';
  end if;

  insert into public.youth_academy_equipment_inventory(
    academy_id,season_number,catalog_item_id,equipment_category,display_name,
    quality_score,durability_score,condition_percent,purchase_cost,status,purchased_on,metadata
  )
  values(
    p_academy_id,v_season,v_catalog.id,v_catalog.equipment_category,v_catalog.display_name,
    v_catalog.quality_score,v_catalog.durability_score,100,v_purchase_cost,'available',v_game_date,
    jsonb_build_object(
      'catalog_tier',v_catalog.tier,'catalog_metadata',v_catalog.metadata,
      'catalog_effects',v_catalog.effects,'academy_director_discount_pct',v_discount_pct,
      'catalog_base_price',v_catalog.base_price_cash
    )
  ) returning id into v_item_id;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_purchase_cost,updated_at=now()
  where academy_id=p_academy_id and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  )
  values(
    p_academy_id,v_season,v_game_date,'equipment',
    'Youth Academy equipment: '||v_catalog.display_name,-v_purchase_cost,
    jsonb_build_object(
      'inventory_item_id',v_item_id,'catalog_item_id',v_catalog.id,
      'equipment_category',v_catalog.equipment_category,
      'academy_director_discount_pct',v_discount_pct,
      'category_count_after',v_category_count+1,
      'category_cap',22
    )
  );
  return v_item_id;
end;
$function$;

revoke all on function private.purchase_youth_academy_equipment_v1(uuid,uuid,boolean)
from public,anon,authenticated;

-- Correct any legacy over-purchasing above the new 22-per-category cap and refund it.
create temporary table youth_excess_equipment_v2 on commit drop as
with ranked as (
  select
    inv.id,inv.academy_id,inv.season_number,inv.equipment_category,
    inv.purchase_cost,
    row_number() over(
      partition by inv.academy_id,inv.equipment_category
      order by inv.condition_percent desc,inv.quality_score desc,inv.created_at asc,inv.id
    ) as rn
  from public.youth_academy_equipment_inventory inv
  where inv.status<>'retired'
)
select * from ranked where rn>22;

update public.youth_academy_equipment_inventory inv
set status='retired',
    metadata=coalesce(inv.metadata,'{}'::jsonb)||jsonb_build_object(
      'retired_reason','category_cap_v2',
      'retired_at',now()
    ),
    updated_at=now()
where inv.id in (select id from youth_excess_equipment_v2);

with refunds as (
  select academy_id,season_number,sum(purchase_cost)::bigint amount
  from youth_excess_equipment_v2
  group by academy_id,season_number
)
update public.youth_academy_season_budgets b
set spent_amount=greatest(0,b.spent_amount-r.amount),
    updated_at=now()
from refunds r
where b.academy_id=r.academy_id and b.season_number=r.season_number;

insert into public.youth_academy_ledger(
  academy_id,season_number,game_date,category,description,amount,metadata
)
select
  e.academy_id,e.season_number,public.get_current_game_date_date(),
  'equipment_correction',
  'Youth equipment cap correction: excess stock refunded',
  sum(e.purchase_cost)::bigint,
  jsonb_build_object(
    'reason','category_cap_v2',
    'retired_items',count(*),
    'category_cap',22
  )
from youth_excess_equipment_v2 e
group by e.academy_id,e.season_number
having count(*)>0;

-- Youth transport assets: maximum 3 cars, 1 bus and 1 Equipment Van.
alter table public.youth_academy_assets
  drop constraint if exists youth_academy_assets_asset_key_check;
alter table public.youth_academy_assets
  add constraint youth_academy_assets_asset_key_v2_check
  check(asset_key in ('team_car','team_bus','equipment_van'));

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
as $function$
declare
  v_academy public.youth_academies%rowtype;
  v_cfg public.infrastructure_asset_config%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_id uuid;
  v_owned integer:=0;
  v_cap integer:=0;
begin
  if p_asset_key not in ('team_car','team_bus','equipment_van') then
    raise exception 'Youth Academy can purchase only Team Cars, Team Buses and Equipment Vans.';
  end if;

  v_cap:=case p_asset_key
    when 'team_car' then 3
    when 'team_bus' then 1
    when 'equipment_van' then 1
  end;

  select coalesce(sum(quantity),0)::integer into v_owned
  from public.youth_academy_assets
  where academy_id=p_academy_id and asset_key=p_asset_key;

  if v_owned>=v_cap then
    raise exception 'Youth Academy asset limit reached for %: maximum %.',p_asset_key,v_cap;
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
      'asset_key',p_asset_key,'asset_level',p_asset_level,'actor',p_actor,
      'owned_after',v_owned+1,'asset_cap',v_cap
    )
  );

  return v_id;
end;
$function$;

revoke all on function private.purchase_youth_academy_asset_v1(uuid,text,smallint,text)
from public,anon,authenticated;

create or replace function private.purchase_youth_academy_asset_v1(
  p_academy_id uuid,
  p_asset_key text,
  p_asset_level integer,
  p_actor text
)
returns uuid
language sql
security definer
set search_path=public,private,pg_temp
as $function$
  select private.purchase_youth_academy_asset_v1(
    p_academy_id,p_asset_key,p_asset_level::smallint,p_actor
  );
$function$;

revoke all on function private.purchase_youth_academy_asset_v1(uuid,text,integer,text)
from public,anon,authenticated;

-- Staff buyer: one durable item per decision, diversify model ownership,
-- never exceed 22/category, maintain sensible supplies, and buy transport gradually.
create or replace function private.manage_youth_equipment_v2(
  p_academy_id uuid,
  p_staff_id uuid,
  p_quality_penalty_percent integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
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
  v_durable_target integer;
  v_qty integer;
  v_actions jsonb:='[]'::jsonb;
  v_actor text:='academy_staff';
  v_id uuid;
  v_owned_cars integer:=0;
  v_owned_buses integer:=0;
  v_owned_vans integer:=0;
  v_car_target integer:=1;
  v_setup_result jsonb;
begin
  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_season
  for update;
  if v_budget.academy_id is null then
    return jsonb_build_object('actions',v_actions);
  end if;

  select count(*)::integer into v_active_riders
  from public.youth_riders
  where academy_id=p_academy_id and status in ('academy','graduating');

  v_available:=greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount);
  v_reserve:=greatest(25000,round(v_budget.season_budget*0.30)::bigint);
  if coalesce(p_quality_penalty_percent,0)>=35 then
    v_reserve:=greatest(v_reserve,round(v_budget.season_budget*0.38)::bigint);
  end if;
  v_spendable:=greatest(0,v_available-v_reserve);

  -- Enough stock for the squad plus a small testing/backup pool, never more than 22.
  v_durable_target:=least(
    22,
    greatest(6,ceil(greatest(v_active_riders,1)*1.25)::integer)
  );

  select ec.* into v_item
  from public.equipment_catalog ec
  where ec.is_active
    and ec.equipment_kind='durable'
    and ec.tier between 1 and 2
    and ec.equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes')
    and ec.base_price_cash<=v_spendable
    and (
      select count(*)
      from public.youth_academy_equipment_inventory inv
      where inv.academy_id=p_academy_id
        and inv.equipment_category=ec.equipment_category
        and inv.status<>'retired'
    )<v_durable_target
  order by
    (
      select count(*)
      from public.youth_academy_equipment_inventory inv
      where inv.academy_id=p_academy_id
        and inv.equipment_category=ec.equipment_category
        and inv.status<>'retired'
    ) asc,
    (
      select count(*)
      from public.youth_academy_equipment_inventory inv
      where inv.academy_id=p_academy_id
        and inv.catalog_item_id=ec.id
        and inv.status<>'retired'
    ) asc,
    -- rotate terrain roles so the Academy gets different configurations
    mod(
      abs(hashtext(
        public.get_current_game_date_date()::text||':'||
        ec.equipment_category||':'||coalesce(ec.metadata->>'terrain_role','all_round')
      )),
      17
    ) asc,
    (ec.quality_score::numeric/greatest(ec.base_price_cash,1)) desc,
    ec.base_price_cash asc
  limit 1;

  if v_item.id is not null then
    v_id:=private.purchase_youth_academy_equipment_v1(
      p_academy_id,v_item.id,false
    );
    v_spendable:=greatest(0,v_spendable-v_item.base_price_cash);
    v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
      'type','equipment','name',v_item.display_name,'cost',v_item.base_price_cash,
      'category',v_item.equipment_category,'category_cap',22,
      'stock_target',v_durable_target
    ));
  end if;

  -- Conservative race-supply stock.
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

  select coalesce(sum(quantity),0)::integer into v_owned_cars
  from public.youth_academy_assets
  where academy_id=p_academy_id and asset_key='team_car';
  select coalesce(sum(quantity),0)::integer into v_owned_buses
  from public.youth_academy_assets
  where academy_id=p_academy_id and asset_key='team_bus';
  select coalesce(sum(quantity),0)::integer into v_owned_vans
  from public.youth_academy_assets
  where academy_id=p_academy_id and asset_key='equipment_van';

  v_car_target:=least(3,greatest(1,ceil(greatest(v_active_riders,1)/5.0)::integer));

  if v_owned_cars<v_car_target and v_spendable>0 then
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

  if v_active_riders>=6 and v_owned_vans<1 and v_spendable>0 then
    select * into v_asset from public.infrastructure_asset_config
    where asset_key='equipment_van' and asset_level=1;
    if v_asset.asset_key is not null and v_asset.cost_cash<=v_spendable then
      perform private.purchase_youth_academy_asset_v1(
        p_academy_id,'equipment_van',1,v_actor
      );
      v_spendable:=greatest(0,v_spendable-v_asset.cost_cash);
      v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
        'type','asset','name',v_asset.asset_name,'cost',v_asset.cost_cash
      ));
    end if;
  end if;

  if v_active_riders>=10 and v_owned_buses<1 and v_spendable>30000 then
    select * into v_asset from public.infrastructure_asset_config
    where asset_key='team_bus' and asset_level=1;
    if v_asset.asset_key is not null and v_asset.cost_cash<=v_spendable then
      perform private.purchase_youth_academy_asset_v1(
        p_academy_id,'team_bus',1,v_actor
      );
      v_spendable:=greatest(0,v_spendable-v_asset.cost_cash);
      v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
        'type','asset','name',v_asset.asset_name,'cost',v_asset.cost_cash
      ));
    end if;
  end if;

  v_setup_result:=private.configure_youth_equipment_setups_v2(
    p_academy_id,p_staff_id,p_quality_penalty_percent
  );

  if coalesce((v_setup_result->>'changed')::integer,0)>0 then
    v_actions:=v_actions||jsonb_build_array(jsonb_build_object(
      'type','race_setups',
      'configured',v_setup_result->>'changed',
      'configured_by',v_setup_result->>'configured_by'
    ));
  end if;

  return jsonb_build_object(
    'actions',v_actions,
    'quality_penalty_percent',greatest(0,least(50,coalesce(p_quality_penalty_percent,0))),
    'safety_reserve',v_reserve,
    'durable_category_cap',22,
    'durable_target_per_category',v_durable_target,
    'asset_caps',jsonb_build_object('team_car',3,'team_bus',1,'equipment_van',1),
    'setup_result',v_setup_result
  );
end;
$function$;

revoke all on function private.manage_youth_equipment_v2(uuid,uuid,integer)
from public,anon,authenticated;

create or replace function public.configure_my_youth_equipment_setups_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
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
    raise exception 'Race equipment configuration is delegated to Youth Academy staff.';
  end if;

  perform private.configure_youth_equipment_setups_v2(v_academy_id,null,0);
  return public.get_my_youth_academy_equipment_v1();
end;
$function$;

revoke all on function public.configure_my_youth_equipment_setups_v1()
from public,anon;
grant execute on function public.configure_my_youth_equipment_setups_v1()
to authenticated;

create or replace function public.get_my_youth_academy_equipment_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
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
      'race_supplies','[]'::jsonb,'race_supply_catalog','[]'::jsonb,
      'race_setups','[]'::jsonb
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
    'durable_category_cap',22,
    'asset_caps',jsonb_build_object('team_car',3,'team_bus',1,'equipment_van',1),
    'catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ec.id,'item_key',ec.item_key,'display_name',ec.display_name,
        'equipment_category',ec.equipment_category,'tier',ec.tier,
        'quality_score',ec.quality_score,'durability_score',ec.durability_score,
        'price',ec.base_price_cash,'effects',ec.effects,'metadata',ec.metadata,
        'image_url',ec.metadata->>'image_url',
        'terrain_role',coalesce(ec.metadata->>'terrain_role',ec.metadata->>'market_role'),
        'brand_name',sc.name,'brand_logo_url',sc.logo_url,
        'owned_count',(
          select count(*) from public.youth_academy_equipment_inventory inv
          where inv.academy_id=v_academy.id and inv.catalog_item_id=ec.id
            and inv.status<>'retired'
        ),
        'category_owned_count',(
          select count(*) from public.youth_academy_equipment_inventory inv
          where inv.academy_id=v_academy.id and inv.equipment_category=ec.equipment_category
            and inv.status<>'retired'
        ),
        'category_cap',22
      ) order by ec.equipment_category,ec.base_price_cash,ec.quality_score desc)
      from public.equipment_catalog ec
      left join public.sponsor_companies sc on sc.id=ec.brand_company_id
      where ec.is_active=true
        and ec.equipment_kind='durable'
        and ec.tier between 1 and 2
        and ec.equipment_category in(
          'frame','wheelset','tires','groupset','helmet','shoes'
        )
    ),'[]'::jsonb),
    'inventory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'catalog_item_id',e.catalog_item_id,
        'item_key',ec.item_key,
        'display_name',e.display_name,'equipment_category',e.equipment_category,
        'quality_score',e.quality_score,'durability_score',e.durability_score,
        'condition_percent',e.condition_percent,'purchase_cost',e.purchase_cost,
        'status',e.status,'purchased_on',e.purchased_on,'metadata',e.metadata,
        'effects',ec.effects,
        'image_url',coalesce(ec.metadata->>'image_url',e.metadata#>>'{catalog_metadata,image_url}'),
        'terrain_role',coalesce(ec.metadata->>'terrain_role',ec.metadata->>'market_role'),
        'brand_name',sc.name,'brand_logo_url',sc.logo_url
      ) order by e.equipment_category,e.purchased_on desc,e.created_at desc)
      from public.youth_academy_equipment_inventory e
      left join public.equipment_catalog ec on ec.id=e.catalog_item_id
      left join public.sponsor_companies sc on sc.id=ec.brand_company_id
      where e.academy_id=v_academy.id and e.status<>'retired'
    ),'[]'::jsonb),
    'asset_catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'asset_key',c.asset_key,'asset_level',c.asset_level,
        'asset_name',c.asset_name,'cost',c.cost_cash,
        'delivery_game_days',c.delivery_game_days,
        'support_value',c.support_value,'max_total_quantity',
          case c.asset_key when 'team_car' then 3 else 1 end
      ) order by c.asset_key,c.asset_level)
      from public.infrastructure_asset_config c
      where c.asset_key in ('team_car','team_bus','equipment_van')
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
        'metadata',ec.metadata,'image_url',ec.metadata->>'image_url'
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
        'metadata',ec.metadata,'image_url',ec.metadata->>'image_url'
      ) order by ec.base_price_cash,ec.display_name)
      from public.equipment_catalog ec
      left join public.youth_academy_race_supplies s
        on s.academy_id=v_academy.id and s.supply_key=ec.equipment_category
      where ec.is_active and ec.equipment_kind='race_supply'
    ),'[]'::jsonb),
    'race_setups',coalesce((
      select jsonb_agg(jsonb_build_object(
        'race_type',s.race_type,
        'frame_catalog_item_id',s.frame_catalog_item_id,
        'wheelset_catalog_item_id',s.wheelset_catalog_item_id,
        'tires_catalog_item_id',s.tires_catalog_item_id,
        'groupset_catalog_item_id',s.groupset_catalog_item_id,
        'helmet_catalog_item_id',s.helmet_catalog_item_id,
        'shoes_catalog_item_id',s.shoes_catalog_item_id,
        'configured_by_staff_id',s.configured_by_staff_id,
        'configured_by',s.configured_by,
        'quality_penalty_percent',s.quality_penalty_percent,
        'configured_on',s.configured_on
      ) order by array_position(array['flat','hilly','mountain','time_trial'],s.race_type))
      from public.youth_academy_race_equipment_setups s
      where s.academy_id=v_academy.id
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_youth_academy_equipment_v1()
from public,anon;
grant execute on function public.get_my_youth_academy_equipment_v1()
to authenticated;

-- Seed initial setups from whatever the Academy already owns.
do $block$
declare a record;
begin
  for a in select id from public.youth_academies where is_active loop
    perform private.configure_youth_equipment_setups_v2(a.id,null,0);
  end loop;
end;
$block$;
