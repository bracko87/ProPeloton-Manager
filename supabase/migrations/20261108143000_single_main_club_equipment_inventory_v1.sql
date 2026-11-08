-- A developing squad shares the main club's physical equipment, but may keep its own sporting preset.
-- Existing duplicate starter rows are archived for audit; no paid or used gear is discarded.
CREATE OR REPLACE FUNCTION public.equipment_assert_club_access(p_club_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_claim_sub text;
  v_claims jsonb;
begin
  v_uid := auth.uid();

  if v_uid is null then
    v_claim_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

    if v_claim_sub is not null then
      v_uid := v_claim_sub::uuid;
    end if;
  end if;

  if v_uid is null then
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;

    if v_claims ? 'sub' then
      v_uid := (v_claims->>'sub')::uuid;
    end if;
  end if;

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = v_uid
      and c.deleted_at is null
  ) then
    raise exception 'Club access denied';
  end if;

  return coalesce((
    select p.id
    from public.clubs d join public.clubs p on p.id=d.parent_club_id
    where d.id=p_club_id and d.club_type='developing'
      and d.deleted_at is null and p.deleted_at is null
      and d.owner_user_id=v_uid and p.owner_user_id=v_uid
  ),p_club_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.equipment_seed_starter_inventory_for_club(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date;
  v_missing_items jsonb;
  v_inserted_rows integer := 0;
  v_starter_catalog jsonb;
begin
  if exists (
    select 1
    from public.club_equipment_starter_seed_log
    where club_id = p_club_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_seeded', true,
      'club_id', p_club_id
    );
  end if;

  if exists(select 1 from public.clubs c where c.id=p_club_id
    and c.club_type='developing' and c.parent_club_id is not null
    and not coalesce(c.is_ai,false)) then
    return jsonb_build_object('ok',true,'club_id',p_club_id,
      'shared_inventory',true,'inserted_inventory_rows',0);
  end if;
  v_game_date := public.get_current_game_date_date();

  with starter_def as (
    select *
    from (
      values
        ('frame'::text, 'Cannondalea'::text, 'Meridian Core'::text, 10),
        ('wheelset'::text, 'Fulcram'::text, 'NeraCore F40'::text, 10),
        ('tires'::text, 'Spacialized'::text, 'BaseWay Road'::text, 10),
        ('groupset'::text, 'Campagnola'::text, 'Axiom Gearset 120'::text, 10),
        ('helmet'::text, 'Skott'::text, 'CityRace Comp'::text, 10),
        ('shoes'::text, 'Spacialized'::text, 'BaseLock Road'::text, 10)
    ) as v(equipment_category, brand_name, display_name, required_count)
  ),
  starter_catalog as (
    select
      sd.equipment_category,
      sd.brand_name,
      sd.display_name,
      sd.required_count,
      ec.id as catalog_item_id
    from starter_def sd
    left join public.sponsor_companies sc
      on lower(sc.name) = lower(sd.brand_name)
    left join public.equipment_catalog ec
      on ec.brand_company_id = sc.id
     and ec.equipment_kind = 'durable'
     and ec.equipment_category = sd.equipment_category
     and ec.display_name = sd.display_name
     and ec.is_active is true
  )
  select jsonb_agg(
    jsonb_build_object(
      'equipment_category', equipment_category,
      'brand_name', brand_name,
      'display_name', display_name
    )
  )
  into v_missing_items
  from starter_catalog
  where catalog_item_id is null;

  if v_missing_items is not null then
    raise exception 'Starter equipment catalog item(s) missing: %', v_missing_items;
  end if;

  with starter_def as (
    select *
    from (
      values
        ('frame'::text, 'Cannondalea'::text, 'Meridian Core'::text, 10),
        ('wheelset'::text, 'Fulcram'::text, 'NeraCore F40'::text, 10),
        ('tires'::text, 'Spacialized'::text, 'BaseWay Road'::text, 10),
        ('groupset'::text, 'Campagnola'::text, 'Axiom Gearset 120'::text, 10),
        ('helmet'::text, 'Skott'::text, 'CityRace Comp'::text, 10),
        ('shoes'::text, 'Spacialized'::text, 'BaseLock Road'::text, 10)
    ) as v(equipment_category, brand_name, display_name, required_count)
  ),
  starter_catalog as (
    select
      sd.equipment_category as starter_equipment_category,
      sd.brand_name as starter_brand_name,
      sd.display_name as starter_display_name,
      sd.required_count,
      ec.id as catalog_item_id,
      ec.display_name as catalog_display_name,
      ec.brand_company_id,
      ec.quality_score,
      ec.durability_score,
      ec.base_price_cash
    from starter_def sd
    join public.sponsor_companies sc
      on lower(sc.name) = lower(sd.brand_name)
    join public.equipment_catalog ec
      on ec.brand_company_id = sc.id
     and ec.equipment_kind = 'durable'
     and ec.equipment_category = sd.equipment_category
     and ec.display_name = sd.display_name
     and ec.is_active is true
  ),
  existing_counts as (
    select
      starter_catalog.catalog_item_id,
      count(cei.id)::integer as existing_count
    from starter_catalog
    left join public.club_equipment_inventory cei
      on cei.club_id = p_club_id
     and cei.catalog_item_id = starter_catalog.catalog_item_id
     and cei.status not in ('sold', 'discarded')
    group by starter_catalog.catalog_item_id
  ),
  rows_to_insert as (
    select
      starter_catalog.*,
      generate_series(
        1,
        greatest(starter_catalog.required_count - coalesce(existing_counts.existing_count, 0), 0)
      ) as unit_number
    from starter_catalog
    left join existing_counts
      on existing_counts.catalog_item_id = starter_catalog.catalog_item_id
  ),
  inserted as (
    insert into public.club_equipment_inventory (
      club_id,
      catalog_item_id,
      display_name,
      equipment_category,
      brand_company_id,
      status,
      quality_score,
      durability_score,
      condition_percent,
      purchase_cost_cash,
      current_value_cash,
      total_race_days,
      total_distance_km,
      acquired_game_date,
      metadata,
      created_at,
      updated_at
    )
    select
      p_club_id,
      rti.catalog_item_id,
      rti.catalog_display_name,
      rti.starter_equipment_category,
      rti.brand_company_id,
      'ready',
      rti.quality_score,
      rti.durability_score,
      100,
      0,
      0,
      0,
      0,
      v_game_date,
      jsonb_build_object(
        'starter_equipment', true,
        'starter_seed_version', 'starter_equipment_v1',
        'starter_required_count', rti.required_count,
        'starter_unit_number', rti.unit_number,
        'granted_at', now(),
        'granted_game_date', v_game_date,
        'base_price_cash', rti.base_price_cash,
        'unit_price_cash', 0,
        'purchase_cost_cash', 0,
        'current_value_cash', 0,
        'no_resale_value', true
      ),
      now(),
      now()
    from rows_to_insert rti
    returning 1
  )
  select count(*)
  into v_inserted_rows
  from inserted;

  with starter_def as (
    select *
    from (
      values
        ('frame'::text, 'Cannondalea'::text, 'Meridian Core'::text, 10),
        ('wheelset'::text, 'Fulcram'::text, 'NeraCore F40'::text, 10),
        ('tires'::text, 'Spacialized'::text, 'BaseWay Road'::text, 10),
        ('groupset'::text, 'Campagnola'::text, 'Axiom Gearset 120'::text, 10),
        ('helmet'::text, 'Skott'::text, 'CityRace Comp'::text, 10),
        ('shoes'::text, 'Spacialized'::text, 'BaseLock Road'::text, 10)
    ) as v(equipment_category, brand_name, display_name, required_count)
  ),
  starter_catalog as (
    select
      sd.equipment_category,
      sd.brand_name,
      sd.display_name,
      sd.required_count,
      ec.id as catalog_item_id
    from starter_def sd
    join public.sponsor_companies sc
      on lower(sc.name) = lower(sd.brand_name)
    join public.equipment_catalog ec
      on ec.brand_company_id = sc.id
     and ec.equipment_kind = 'durable'
     and ec.equipment_category = sd.equipment_category
     and ec.display_name = sd.display_name
     and ec.is_active is true
  )
  select jsonb_object_agg(
    equipment_category,
    jsonb_build_object(
      'brand_name', brand_name,
      'display_name', display_name,
      'catalog_item_id', catalog_item_id,
      'starter_quantity', required_count
    )
  )
  into v_starter_catalog
  from starter_catalog;

  insert into public.club_equipment_default_setup (
    club_id,
    setup_name,
    frame_catalog_item_id,
    wheelset_catalog_item_id,
    tires_catalog_item_id,
    groupset_catalog_item_id,
    helmet_catalog_item_id,
    shoes_catalog_item_id,
    metadata,
    created_at,
    updated_at
  )
  values (
    p_club_id,
    'Default Race Setup',
    (v_starter_catalog->'frame'->>'catalog_item_id')::uuid,
    (v_starter_catalog->'wheelset'->>'catalog_item_id')::uuid,
    (v_starter_catalog->'tires'->>'catalog_item_id')::uuid,
    (v_starter_catalog->'groupset'->>'catalog_item_id')::uuid,
    (v_starter_catalog->'helmet'->>'catalog_item_id')::uuid,
    (v_starter_catalog->'shoes'->>'catalog_item_id')::uuid,
    jsonb_build_object(
      'starter_default_setup', true,
      'starter_seed_version', 'starter_equipment_v1',
      'assigned_at', now()
    ),
    now(),
    now()
  )
  on conflict (club_id) do update
  set
    setup_name = coalesce(public.club_equipment_default_setup.setup_name, excluded.setup_name),
    frame_catalog_item_id = coalesce(public.club_equipment_default_setup.frame_catalog_item_id, excluded.frame_catalog_item_id),
    wheelset_catalog_item_id = coalesce(public.club_equipment_default_setup.wheelset_catalog_item_id, excluded.wheelset_catalog_item_id),
    tires_catalog_item_id = coalesce(public.club_equipment_default_setup.tires_catalog_item_id, excluded.tires_catalog_item_id),
    groupset_catalog_item_id = coalesce(public.club_equipment_default_setup.groupset_catalog_item_id, excluded.groupset_catalog_item_id),
    helmet_catalog_item_id = coalesce(public.club_equipment_default_setup.helmet_catalog_item_id, excluded.helmet_catalog_item_id),
    shoes_catalog_item_id = coalesce(public.club_equipment_default_setup.shoes_catalog_item_id, excluded.shoes_catalog_item_id),
    metadata = coalesce(public.club_equipment_default_setup.metadata, '{}'::jsonb)
      || excluded.metadata,
    updated_at = now();

  insert into public.club_equipment_starter_seed_log (
    club_id,
    seed_version,
    starter_catalog,
    inserted_inventory_rows,
    seeded_at
  )
  values (
    p_club_id,
    'starter_equipment_v1',
    v_starter_catalog,
    v_inserted_rows,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'already_seeded', false,
    'club_id', p_club_id,
    'inserted_inventory_rows', v_inserted_rows,
    'starter_catalog', v_starter_catalog
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.equipment_seed_starter_inventory_for_club_safe(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_ai boolean := false;
  v_seed_result jsonb;
  v_setup_result jsonb;
  v_ai_policy_result jsonb := null;
begin
  select coalesce(c.is_ai, false)
  into v_is_ai
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null;

  if not found then
    raise exception 'Club not found: %', p_club_id;
  end if;

  if exists(select 1 from public.clubs c where c.id=p_club_id
    and c.club_type='developing' and c.parent_club_id is not null
    and not coalesce(c.is_ai,false)) then
    v_setup_result:=public.equipment_ensure_starter_setup_for_club(p_club_id);
    return jsonb_build_object('ok',true,'club_id',p_club_id,
      'shared_inventory',true,'inserted_inventory_rows',0,
      'setup_result',v_setup_result);
  end if;
  /*
    Needed so AI clubs can receive only the approved starter equipment.
    The AI inventory guard should block market equipment, but not starter seeding.
  */
  perform set_config('equipment.ai_policy_job', '1', true);

  v_seed_result := public.equipment_seed_starter_inventory_for_club(p_club_id);
  v_setup_result := public.equipment_ensure_starter_setup_for_club(p_club_id);

  if v_is_ai then
    v_ai_policy_result := public.equipment_apply_ai_equipment_policy(p_club_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'is_ai', v_is_ai,
    'seed_result', v_seed_result,
    'setup_result', v_setup_result,
    'ai_policy_result', v_ai_policy_result
  );
end;
$function$;
create table if not exists private.developing_equipment_legacy_archive_v1 (
  inventory_id uuid primary key,
  archived_at timestamptz not null default clock_timestamp(),
  inventory_snapshot jsonb not null
);
revoke all on private.developing_equipment_legacy_archive_v1 from public, anon, authenticated;

do $safety$
begin
  if exists(
    select 1 from public.club_equipment_inventory e
    join public.clubs c on c.id=e.club_id
    where c.club_type='developing' and c.parent_club_id is not null and not coalesce(c.is_ai,false)
      and (coalesce(e.purchase_cost_cash,0)<>0
        or coalesce(e.total_race_days,0)<>0
        or coalesce(e.total_distance_km,0)<>0
        or e.last_used_game_date is not null
        or coalesce(e.metadata->>'starter_equipment','false')<>'true')
  ) then raise exception 'Developing equipment contains paid, used, or nonstarter units. Review before consolidation.'; end if;
  if exists(
    select 1 from public.club_equipment_inventory e
    join public.clubs c on c.id=e.club_id
    where c.club_type='developing' and c.parent_club_id is not null and not coalesce(c.is_ai,false)
      and (exists(select 1 from public.club_equipment_maintenance_jobs j where j.inventory_item_id=e.id)
      or exists(select 1 from public.club_equipment_default_setup ds
          where e.id in (ds.frame_item_id,ds.wheelset_item_id,ds.tires_item_id,
                         ds.groupset_item_id,ds.helmet_item_id,ds.shoes_item_id))
      or exists(select 1 from public.race_engine_stage_wear_applications w where w.target_id=e.id))
  ) then raise exception 'Developing equipment has operational references; review before consolidation.'; end if;
end $safety$;

insert into private.developing_equipment_legacy_archive_v1(inventory_id,inventory_snapshot)
select e.id,to_jsonb(e) from public.club_equipment_inventory e
join public.clubs c on c.id=e.club_id
where c.club_type='developing' and c.parent_club_id is not null and not coalesce(c.is_ai,false)
on conflict(inventory_id) do nothing;

delete from public.club_equipment_inventory e
using private.developing_equipment_legacy_archive_v1 a
where e.id=a.inventory_id
  and exists(select 1 from public.clubs c where c.id=e.club_id
    and c.club_type='developing' and c.parent_club_id is not null and not coalesce(c.is_ai,false));

create or replace function public.equipment_block_developing_inventory_v1()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $body$
begin
  if exists(select 1 from public.clubs c where c.id=new.club_id
    and c.club_type='developing' and c.parent_club_id is not null
    and not coalesce(c.is_ai,false)) then
    raise exception 'The U23 squad uses the parent club physical equipment inventory.';
  end if;
  return new;
end $body$;
drop trigger if exists trg_equipment_block_developing_inventory_v1 on public.club_equipment_inventory;
create trigger trg_equipment_block_developing_inventory_v1
  before insert or update of club_id on public.club_equipment_inventory
  for each row execute function public.equipment_block_developing_inventory_v1();
revoke all on function public.equipment_block_developing_inventory_v1() from public,anon,authenticated;
