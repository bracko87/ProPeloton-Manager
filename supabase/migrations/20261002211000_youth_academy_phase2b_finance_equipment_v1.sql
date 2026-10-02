-- Premium Youth Academy / U16 - Phase 2B
-- Academy finance visibility + separate Youth equipment inventory.
-- Youth equipment reuses the existing equipment catalogue, limited to lower-cost
-- tier 1-2 durable models. Purchases are paid from the Academy season budget,
-- never from the professional club cash balance.

create table if not exists public.youth_academy_equipment_inventory(
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  season_number integer not null,
  catalog_item_id uuid not null references public.equipment_catalog(id),
  equipment_category text not null
    check(equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes')),
  display_name text not null,
  quality_score smallint not null check(quality_score between 1 and 100),
  durability_score smallint not null check(durability_score between 1 and 100),
  condition_percent numeric(6,2) not null default 100
    check(condition_percent between 0 and 100),
  purchase_cost bigint not null check(purchase_cost>=0),
  status text not null default 'available'
    check(status in ('available','in_use','retired')),
  purchased_on date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youth_academy_equipment_academy_status_idx
on public.youth_academy_equipment_inventory(academy_id,status,equipment_category);

alter table public.youth_academy_equipment_inventory enable row level security;

create or replace function public.get_my_youth_academy_finances_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_rider_weekly bigint:=0;
  v_staff_weekly bigint:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
  limit 1;

  if v_academy.id is null then
    return jsonb_build_object('activated',false);
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id
    and b.season_number=v_season;

  select coalesce(sum(a.stipend_weekly+a.accommodation_weekly),0)
  into v_rider_weekly
  from public.youth_rider_agreements a
  where a.academy_id=v_academy.id
    and a.status='active';

  select coalesce(sum(cs.salary_weekly),0)
  into v_staff_weekly
  from public.club_staff cs
  where cs.club_id=v_academy.club_id
    and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  return jsonb_build_object(
    'activated',true,
    'season_number',v_season,
    'season_budget',coalesce(v_budget.season_budget,0),
    'spent_amount',coalesce(v_budget.spent_amount,0),
    'committed_amount',coalesce(v_budget.committed_amount,0),
    'available_amount',greatest(
      0,
      coalesce(v_budget.season_budget,0)
      -coalesce(v_budget.spent_amount,0)
      -coalesce(v_budget.committed_amount,0)
    ),
    'weekly_rider_support',v_rider_weekly,
    'weekly_staff_salary',v_staff_weekly,
    'weekly_operating_commitment',v_rider_weekly+v_staff_weekly,
    'equipment_spend',coalesce((
      select sum(e.purchase_cost)
      from public.youth_academy_equipment_inventory e
      where e.academy_id=v_academy.id
        and e.season_number=v_season
    ),0),
    'ledger',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,
        'game_date',x.game_date,
        'category',x.category,
        'description',x.description,
        'amount',x.amount
      ) order by x.game_date desc,x.created_at desc)
      from (
        select l.*
        from public.youth_academy_ledger l
        where l.academy_id=v_academy.id
          and l.season_number=v_season
        order by l.game_date desc,l.created_at desc
        limit 50
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_youth_academy_finances_v1()
from public,anon;
grant execute on function public.get_my_youth_academy_finances_v1()
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
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
  limit 1;

  if v_academy.id is null then
    return jsonb_build_object('activated',false,'catalog','[]'::jsonb,'inventory','[]'::jsonb);
  end if;

  select coalesce(s.equipment_decider,'manager')
  into v_decider
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  return jsonb_build_object(
    'activated',true,
    'equipment_decider',coalesce(v_decider,'manager'),
    'catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ec.id,
        'display_name',ec.display_name,
        'equipment_category',ec.equipment_category,
        'tier',ec.tier,
        'quality_score',ec.quality_score,
        'durability_score',ec.durability_score,
        'price',ec.base_price_cash,
        'effects',ec.effects,
        'metadata',ec.metadata
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
        'id',e.id,
        'catalog_item_id',e.catalog_item_id,
        'display_name',e.display_name,
        'equipment_category',e.equipment_category,
        'quality_score',e.quality_score,
        'durability_score',e.durability_score,
        'condition_percent',e.condition_percent,
        'purchase_cost',e.purchase_cost,
        'status',e.status,
        'purchased_on',e.purchased_on,
        'metadata',e.metadata
      ) order by e.equipment_category,e.purchased_on desc,e.created_at desc)
      from public.youth_academy_equipment_inventory e
      where e.academy_id=v_academy.id
        and e.status<>'retired'
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_youth_academy_equipment_v1()
from public,anon;
grant execute on function public.get_my_youth_academy_equipment_v1()
to authenticated;

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
begin
  select * into v_academy
  from public.youth_academies
  where id=p_academy_id
    and is_active=true
  for update;

  if v_academy.id is null then raise exception 'Youth Academy is not active'; end if;

  select coalesce(s.equipment_decider,'manager')
  into v_decider
  from public.youth_academy_settings s
  where s.academy_id=p_academy_id;

  if p_require_manager and v_decider<>'manager' then
    raise exception 'Equipment purchasing is delegated to the Youth Academy Director.';
  end if;

  select * into v_catalog
  from public.equipment_catalog ec
  where ec.id=p_catalog_item_id
    and ec.is_active=true
    and ec.equipment_kind='durable'
    and ec.tier between 1 and 2
    and ec.equipment_category in (
      'frame','wheelset','tires','groupset','helmet','shoes'
    );

  if v_catalog.id is null then
    raise exception 'This item is not available to the Youth Academy.';
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=p_academy_id
    and b.season_number=v_season
  for update;

  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;

  if v_catalog.base_price_cash >
     greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount) then
    raise exception 'Youth Academy budget is too low for this equipment purchase.';
  end if;

  insert into public.youth_academy_equipment_inventory(
    academy_id,season_number,catalog_item_id,equipment_category,display_name,
    quality_score,durability_score,condition_percent,purchase_cost,status,
    purchased_on,metadata
  )
  values(
    p_academy_id,v_season,v_catalog.id,v_catalog.equipment_category,
    v_catalog.display_name,v_catalog.quality_score,v_catalog.durability_score,
    100,v_catalog.base_price_cash,'available',v_game_date,
    jsonb_build_object(
      'catalog_tier',v_catalog.tier,
      'catalog_metadata',v_catalog.metadata,
      'catalog_effects',v_catalog.effects
    )
  )
  returning id into v_item_id;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_catalog.base_price_cash,
      updated_at=now()
  where academy_id=p_academy_id
    and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  )
  values(
    p_academy_id,v_season,v_game_date,'equipment',
    'Youth Academy equipment: '||v_catalog.display_name,
    -v_catalog.base_price_cash,
    jsonb_build_object(
      'inventory_item_id',v_item_id,
      'catalog_item_id',v_catalog.id,
      'equipment_category',v_catalog.equipment_category
    )
  );

  return v_item_id;
end;
$function$;

revoke all on function private.purchase_youth_academy_equipment_v1(uuid,uuid,boolean)
from public,anon,authenticated;

create or replace function public.purchase_my_youth_academy_equipment_v1(
  p_catalog_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  perform private.purchase_youth_academy_equipment_v1(
    v_academy_id,p_catalog_item_id,true
  );

  return public.get_my_youth_academy_equipment_v1();
end;
$function$;

revoke all on function public.purchase_my_youth_academy_equipment_v1(uuid)
from public,anon;
grant execute on function public.purchase_my_youth_academy_equipment_v1(uuid)
to authenticated;

create or replace function public.run_my_youth_academy_equipment_director_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_decider text;
  v_category text;
  v_catalog_id uuid;
  v_available bigint;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.equipment_decider
  into v_academy_id,v_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  join public.youth_academy_settings s on s.academy_id=a.id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if v_decider<>'academy_director' then
    raise exception 'Equipment responsibility is currently assigned to the manager.';
  end if;

  foreach v_category in array array[
    'frame','wheelset','tires','groupset','helmet','shoes'
  ]
  loop
    if not exists(
      select 1
      from public.youth_academy_equipment_inventory e
      where e.academy_id=v_academy_id
        and e.equipment_category=v_category
        and e.status in ('available','in_use')
    ) then
      select greatest(
        0,b.season_budget-b.spent_amount-b.committed_amount
      )
      into v_available
      from public.youth_academy_season_budgets b
      where b.academy_id=v_academy_id
        and b.season_number=coalesce(public.get_current_season_number(),1);

      select ec.id into v_catalog_id
      from public.equipment_catalog ec
      where ec.is_active=true
        and ec.equipment_kind='durable'
        and ec.tier between 1 and 2
        and ec.equipment_category=v_category
        and ec.base_price_cash<=coalesce(v_available,0)
      order by ec.base_price_cash asc,ec.quality_score desc
      limit 1;

      if v_catalog_id is not null then
        perform private.purchase_youth_academy_equipment_v1(
          v_academy_id,v_catalog_id,false
        );
      end if;
    end if;
  end loop;

  return public.get_my_youth_academy_equipment_v1();
end;
$function$;

revoke all on function public.run_my_youth_academy_equipment_director_v1()
from public,anon;
grant execute on function public.run_my_youth_academy_equipment_director_v1()
to authenticated;

-- RLS stays deny-by-default for the new inventory table. All user access is
-- intentionally through owner-scoped SECURITY DEFINER RPCs above.
