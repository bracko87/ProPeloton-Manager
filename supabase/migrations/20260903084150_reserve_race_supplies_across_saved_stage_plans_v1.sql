create or replace function public.universal_race_stage_planned_supplies_v1(
  p_stage_id uuid,
  p_team_id uuid
)
returns table(supply_key text, required_quantity integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with stage_plans as (
    select
      rsp.id as stage_plan_id,
      coalesce(rsp.rider_supplies_json, '{}'::jsonb) as rider_supplies_json
    from public.race_stage_plans rsp
    join public.race_preparations rp
      on rp.id = rsp.race_preparation_id
    where rsp.stage_id = p_stage_id
      and coalesce(rp.participating_club_id, rp.club_id) = p_team_id
      and rsp.last_saved_at is not null
      and lower(coalesce(rp.status, '')) in (
        'submitted', 'locked', 'sent_to_engine', 'final', 'finalized',
        'completed', 'auto_defaulted'
      )
  ),
  explicit_rows as (
    select
      s.supply_key,
      sum(greatest(coalesce(s.quantity_planned, 0), 0))::integer as required_quantity
    from stage_plans p
    join public.race_stage_plan_supplies s
      on s.race_stage_plan_id = p.stage_plan_id
    group by s.supply_key
  ),
  direct_rider_rows as (
    select
      generated.supply_key,
      generated.required_quantity
    from stage_plans p
    cross join lateral jsonb_each(p.rider_supplies_json) rider_entry
    cross join lateral (
      values
        (
          'bidons_water_bottles'::text,
          case
            when coalesce(
              rider_entry.value ->> 'bidons',
              rider_entry.value ->> 'bidons_water_bottles',
              '0'
            ) ~ '^[0-9]+$'
            then coalesce(
              rider_entry.value ->> 'bidons',
              rider_entry.value ->> 'bidons_water_bottles',
              '0'
            )::integer
            else 0
          end
        ),
        (
          'energy_gels'::text,
          case
            when coalesce(
              rider_entry.value ->> 'gels',
              rider_entry.value ->> 'energy_gels',
              '0'
            ) ~ '^[0-9]+$'
            then coalesce(
              rider_entry.value ->> 'gels',
              rider_entry.value ->> 'energy_gels',
              '0'
            )::integer
            else 0
          end
        ),
        (
          'nutrition_packs'::text,
          case
            when coalesce(rider_entry.value ->> 'nutrition_packs', '0') ~ '^[0-9]+$'
            then coalesce(rider_entry.value ->> 'nutrition_packs', '0')::integer
            else 0
          end
        ),
        (
          'race_jersey_complete'::text,
          case
            when lower(coalesce(rider_entry.value ->> 'race_jersey_complete', 'false'))
                 in ('true', '1', 'yes')
              then 1
            when coalesce(rider_entry.value ->> 'race_jersey_complete', '0') ~ '^[0-9]+$'
              then least(1, coalesce(rider_entry.value ->> 'race_jersey_complete', '0')::integer)
            else 0
          end
        ),
        (
          'rain_jackets'::text,
          case
            when lower(coalesce(
              rider_entry.value ->> 'rain_jacket',
              rider_entry.value ->> 'rain_jackets',
              'false'
            )) in ('true', '1', 'yes')
              then 1
            when coalesce(
              rider_entry.value ->> 'rain_jacket',
              rider_entry.value ->> 'rain_jackets',
              '0'
            ) ~ '^[0-9]+$'
              then least(1, coalesce(
                rider_entry.value ->> 'rain_jacket',
                rider_entry.value ->> 'rain_jackets',
                '0'
              )::integer)
            else 0
          end
        )
    ) generated(supply_key, required_quantity)
    where jsonb_typeof(rider_entry.value) = 'object'
      and generated.required_quantity > 0
  ),
  direct_totals as (
    select supply_key, sum(required_quantity)::integer as required_quantity
    from direct_rider_rows
    group by supply_key
  )
  select e.supply_key, e.required_quantity
  from explicit_rows e
  union all
  select d.supply_key, d.required_quantity
  from direct_totals d
  where not exists (
    select 1
    from explicit_rows e
    where e.supply_key = d.supply_key
  );
$function$;

create or replace function public.universal_race_stage_other_supply_reservations_v1(
  p_stage_id uuid,
  p_team_id uuid,
  p_supply_key text
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_owner uuid;
  v_stage_date date;
  v_reserved integer := 0;
  v_one integer := 0;
  x record;
begin
  select
    public.universal_race_resource_owner_club_v1(p_team_id),
    s.stage_date::date
  into v_owner, v_stage_date
  from public.race_stages s
  where s.id = p_stage_id;

  if v_owner is null or v_stage_date is null then
    return 0;
  end if;

  for x in
    select distinct
      rsp.stage_id,
      coalesce(rp.participating_club_id, rp.club_id) as sporting_team_id
    from public.race_stage_plans rsp
    join public.race_preparations rp
      on rp.id = rsp.race_preparation_id
    join public.race_stages s
      on s.id = rsp.stage_id
    join public.races r
      on r.id = rsp.race_id
    where rsp.stage_id is not null
      and rsp.stage_id <> p_stage_id
      and rsp.last_saved_at is not null
      and lower(coalesce(rp.status, '')) in (
        'submitted', 'locked', 'sent_to_engine', 'final', 'finalized',
        'completed', 'auto_defaulted'
      )
      and public.universal_race_resource_owner_club_v1(
            coalesce(rp.participating_club_id, rp.club_id)
          ) = v_owner
      and lower(coalesce(r.status, 'scheduled')) in ('scheduled', 'active')
      and not coalesce(s.weather_cancelled, false)
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = rsp.stage_id
      )
      and (
        p_supply_key not in ('race_jersey_complete', 'rain_jackets')
        or s.stage_date::date = v_stage_date
      )
    order by rsp.stage_id
  loop
    select coalesce(max(req.required_quantity), 0)
    into v_one
    from public.universal_race_stage_planned_supplies_v1(
      x.stage_id,
      x.sporting_team_id
    ) req
    where req.supply_key = p_supply_key;

    v_reserved := v_reserved + greatest(coalesce(v_one, 0), 0);
  end loop;

  return greatest(v_reserved, 0);
end;
$function$;

create or replace function public.universal_race_stage_effective_supply_available_v1(
  p_stage_id uuid,
  p_team_id uuid,
  p_supply_key text
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_owner uuid;
  v_stage_date date;
  v_available integer := 0;
  v_reserved integer := 0;
begin
  select
    public.universal_race_resource_owner_club_v1(p_team_id),
    s.stage_date::date
  into v_owner, v_stage_date
  from public.race_stages s
  where s.id = p_stage_id;

  if v_owner is null or v_stage_date is null then
    return 0;
  end if;

  if p_supply_key in ('race_jersey_complete', 'rain_jackets') then
    select count(*)::integer
    into v_available
    from public.club_race_supply_units u
    where u.club_id = v_owner
      and u.supply_key = p_supply_key
      and u.status in ('ready', 'assigned')
      and u.stage_uses_remaining > 0
      and (
        u.last_used_game_date is null
        or u.last_used_game_date <> v_stage_date
      );
  else
    select coalesce(s.quantity_available, 0)
    into v_available
    from public.club_race_supplies s
    where s.club_id = v_owner
      and s.supply_key = p_supply_key;

    if not found then
      v_available := 0;
    end if;
  end if;

  v_reserved := public.universal_race_stage_other_supply_reservations_v1(
    p_stage_id,
    p_team_id,
    p_supply_key
  );

  return greatest(v_available - v_reserved, 0);
end;
$function$;

create or replace function public.get_race_stage_supply_availability_v1(
  p_stage_id uuid,
  p_team_id uuid
)
returns table(
  supply_key text,
  physical_quantity integer,
  reserved_elsewhere integer,
  quantity_available integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with keys(supply_key) as (
    values
      ('bidons_water_bottles'::text),
      ('energy_gels'::text),
      ('nutrition_packs'::text),
      ('race_jersey_complete'::text),
      ('rain_jackets'::text)
  ),
  owner_ctx as (
    select
      public.universal_race_resource_owner_club_v1(p_team_id) as owner_id,
      s.stage_date::date as stage_date
    from public.race_stages s
    where s.id = p_stage_id
  )
  select
    k.supply_key,
    case
      when k.supply_key in ('race_jersey_complete', 'rain_jackets') then (
        select count(*)::integer
        from public.club_race_supply_units u, owner_ctx o
        where u.club_id = o.owner_id
          and u.supply_key = k.supply_key
          and u.status in ('ready', 'assigned')
          and u.stage_uses_remaining > 0
          and (u.last_used_game_date is null or u.last_used_game_date <> o.stage_date)
      )
      else coalesce((
        select s.quantity_available
        from public.club_race_supplies s, owner_ctx o
        where s.club_id = o.owner_id
          and s.supply_key = k.supply_key
      ), 0)
    end::integer as physical_quantity,
    public.universal_race_stage_other_supply_reservations_v1(
      p_stage_id, p_team_id, k.supply_key
    )::integer as reserved_elsewhere,
    public.universal_race_stage_effective_supply_available_v1(
      p_stage_id, p_team_id, k.supply_key
    )::integer as quantity_available
  from keys k;
$function$;

grant execute on function public.get_race_stage_supply_availability_v1(uuid, uuid) to authenticated;
grant execute on function public.universal_race_stage_effective_supply_available_v1(uuid, uuid, text) to authenticated;

create or replace function public.validate_race_stage_supply_reservation_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_team_id uuid;
  v_stage_format text;
  v_requested integer;
  v_available integer;
  v_key text;
  v_label text;
begin
  if new.stage_id is null or new.last_saved_at is null then
    return new;
  end if;

  select
    coalesce(rp.participating_club_id, rp.club_id),
    s.stage_format
  into v_team_id, v_stage_format
  from public.race_preparations rp
  join public.race_stages s on s.id = new.stage_id
  where rp.id = new.race_preparation_id;

  if v_team_id is null then
    return new;
  end if;

  if v_stage_format in ('prologue', 'individual_time_trial', 'team_time_trial') then
    return new;
  end if;

  foreach v_key in array array[
    'bidons_water_bottles',
    'energy_gels',
    'nutrition_packs',
    'race_jersey_complete',
    'rain_jackets'
  ]
  loop
    select coalesce(sum(
      case v_key
        when 'bidons_water_bottles' then
          case when coalesce(e.value->>'bidons', e.value->>'bidons_water_bottles', '0') ~ '^[0-9]+$'
            then coalesce(e.value->>'bidons', e.value->>'bidons_water_bottles', '0')::integer else 0 end
        when 'energy_gels' then
          case when coalesce(e.value->>'gels', e.value->>'energy_gels', '0') ~ '^[0-9]+$'
            then coalesce(e.value->>'gels', e.value->>'energy_gels', '0')::integer else 0 end
        when 'nutrition_packs' then
          case when coalesce(e.value->>'nutrition_packs', '0') ~ '^[0-9]+$'
            then coalesce(e.value->>'nutrition_packs', '0')::integer else 0 end
        when 'race_jersey_complete' then
          case
            when lower(coalesce(e.value->>'race_jersey_complete', e.value->>'race_jersey', 'false')) in ('true','t','1','yes','y','all') then 1
            when coalesce(e.value->>'race_jersey_complete', e.value->>'race_jersey', '0') ~ '^[0-9]+$'
              then least(coalesce(e.value->>'race_jersey_complete', e.value->>'race_jersey', '0')::integer, 1)
            else 0
          end
        when 'rain_jackets' then
          case
            when lower(coalesce(e.value->>'rain_jacket', e.value->>'rain_jackets', 'false')) in ('true','t','1','yes','y','all') then 1
            when coalesce(e.value->>'rain_jacket', e.value->>'rain_jackets', '0') ~ '^[0-9]+$'
              then least(coalesce(e.value->>'rain_jacket', e.value->>'rain_jackets', '0')::integer, 1)
            else 0
          end
        else 0
      end
    ), 0)::integer
    into v_requested
    from jsonb_each(coalesce(new.rider_supplies_json, '{}'::jsonb)) e
    where jsonb_typeof(e.value) = 'object';

    if v_requested <= 0 then
      continue;
    end if;

    v_available := public.universal_race_stage_effective_supply_available_v1(
      new.stage_id,
      v_team_id,
      v_key
    );

    if v_requested > v_available then
      v_label := case v_key
        when 'bidons_water_bottles' then 'Bidons / Water Bottles'
        when 'energy_gels' then 'Energy Gels'
        when 'nutrition_packs' then 'Nutrition Packs'
        when 'race_jersey_complete' then 'Race Jersey Complete'
        when 'rain_jackets' then 'Rain Jackets'
        else v_key
      end;

      raise exception
        'Race supply reservation exceeds available unreserved stock for %: % requested, % available after other saved Stage Plans.',
        v_label, v_requested, v_available;
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_validate_race_stage_supply_reservation_v1
  on public.race_stage_plans;

create trigger trg_validate_race_stage_supply_reservation_v1
before insert or update of rider_supplies_json, last_saved_at
on public.race_stage_plans
for each row
execute function public.validate_race_stage_supply_reservation_v1();
