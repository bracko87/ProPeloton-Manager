-- Ensure rider names always come from the rider's own nationality pool.
--
-- Root cause:
-- pick_generated_rider_first_name()/pick_generated_rider_last_name() used the
-- legacy generated_rider_* tables, which only contain country-specific rows for
-- 20 countries. Other countries silently fell back to a generic ANY pool.
--
-- This migration:
-- 1. Adds permanent native/culturally appropriate pools for the two rider
--    countries missing from the canonical master catalog (AS and GT).
-- 2. Makes generated rider helpers use the canonical 175-country master pools
--    and fail loudly instead of silently assigning a foreign-country name.
-- 3. Repairs existing riders whose first and/or last name is not in their
--    nationality pool, without changing rider IDs, nationality, stats, team,
--    contracts, or any sporting data.
-- 4. Refreshes stored race/engine rider-name snapshots for repaired riders.
-- 5. Removes the obsolete temporary AS/GT cross-country name seeding from the
--    Season 1 world-reset function, because those pools are now permanent.

-- American Samoa shares the Samoan naming pool used by Samoa (WS).
insert into public.first_names_master (country_code, first_name)
select 'AS', first_name
from public.first_names_master
where upper(country_code) = 'WS'
on conflict (country_code, first_name) do nothing;

insert into public.last_names_master (country_code, last_name)
select 'AS', last_name
from public.last_names_master
where upper(country_code) = 'WS'
on conflict (country_code, last_name) do nothing;

-- Permanent Guatemala pool. Keep the existing project convention of ASCII
-- spellings so generated/display names are consistent across the UI.
insert into public.first_names_master (country_code, first_name)
select 'GT', name
from unnest(array[
  'Jose','Carlos','Luis','Juan','Jorge','Diego','Miguel','Pedro','Mario','Kevin',
  'Marvin','Edwin','Bryan','Cristian','Fernando','Alejandro','Oscar','Sergio',
  'Manuel','Daniel'
]::text[]) as x(name)
on conflict (country_code, first_name) do nothing;

insert into public.last_names_master (country_code, last_name)
select 'GT', name
from unnest(array[
  'Lopez','Garcia','Hernandez','Perez','Morales','Ramirez','Gonzalez','Martinez',
  'Rodriguez','Castillo','Mendez','Vasquez','Caal','Choc','Ical','Tuc','Xicay',
  'Batz','Coyoy','Tzoc'
]::text[]) as x(name)
on conflict (country_code, last_name) do nothing;

create or replace function public.pick_generated_rider_first_name(p_country_code text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_country_code text := upper(nullif(btrim(coalesce(p_country_code, '')), ''));
  v_name text;
begin
  if v_country_code is null then
    raise exception 'Cannot generate rider first name without country_code';
  end if;

  select fn.first_name
  into v_name
  from public.first_names_master fn
  where fn.country_code = v_country_code
  order by random()
  limit 1;

  if v_name is null then
    raise exception 'Missing rider first-name master pool for country_code=%', v_country_code;
  end if;

  return v_name;
end;
$function$;

create or replace function public.pick_generated_rider_last_name(p_country_code text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_country_code text := upper(nullif(btrim(coalesce(p_country_code, '')), ''));
  v_name text;
begin
  if v_country_code is null then
    raise exception 'Cannot generate rider last name without country_code';
  end if;

  select ln.last_name
  into v_name
  from public.last_names_master ln
  where ln.country_code = v_country_code
  order by random()
  limit 1;

  if v_name is null then
    raise exception 'Missing rider last-name master pool for country_code=%', v_country_code;
  end if;

  return v_name;
end;
$function$;

-- Capture only riders that actually require a nationality/name correction.
create temporary table rider_name_country_repair_targets_v1
on commit drop
as
select r.id
from public.riders r
where not exists (
        select 1
        from public.first_names_master fn
        where fn.country_code = upper(r.country_code)
          and lower(fn.first_name) = lower(r.first_name)
      )
   or not exists (
        select 1
        from public.last_names_master ln
        where ln.country_code = upper(r.country_code)
          and lower(ln.last_name) = lower(r.last_name)
      );

create unique index on rider_name_country_repair_targets_v1 (id);

-- Every repair target must now have both canonical country pools.
do $block$
begin
  if exists (
    select 1
    from public.riders r
    join rider_name_country_repair_targets_v1 t on t.id = r.id
    where not exists (
            select 1 from public.first_names_master fn
            where fn.country_code = upper(r.country_code)
          )
       or not exists (
            select 1 from public.last_names_master ln
            where ln.country_code = upper(r.country_code)
          )
  ) then
    raise exception 'Rider name repair aborted: at least one rider country still lacks a canonical name pool';
  end if;
end;
$block$;

-- Repair first and last name in a single rider update. Existing valid name parts
-- are preserved. Invalid parts are reassigned deterministically and evenly from
-- the correct country pool so the migration is repeatable and balanced.
with target_rows as (
  select
    r.id,
    upper(r.country_code) as country_code,
    r.first_name,
    r.last_name,
    exists (
      select 1 from public.first_names_master fn
      where fn.country_code = upper(r.country_code)
        and lower(fn.first_name) = lower(r.first_name)
    ) as first_is_valid,
    exists (
      select 1 from public.last_names_master ln
      where ln.country_code = upper(r.country_code)
        and lower(ln.last_name) = lower(r.last_name)
    ) as last_is_valid,
    row_number() over (
      partition by upper(r.country_code)
      order by r.id
    ) as first_pick_no,
    row_number() over (
      partition by upper(r.country_code)
      order by md5(r.id::text)
    ) as last_pick_no
  from public.riders r
  join rider_name_country_repair_targets_v1 t on t.id = r.id
), first_pool as (
  select
    fn.country_code,
    fn.first_name,
    row_number() over (
      partition by fn.country_code
      order by lower(fn.first_name), fn.id
    ) as pool_no,
    count(*) over (partition by fn.country_code) as pool_count
  from public.first_names_master fn
), last_pool as (
  select
    ln.country_code,
    ln.last_name,
    row_number() over (
      partition by ln.country_code
      order by lower(ln.last_name), ln.id
    ) as pool_no,
    count(*) over (partition by ln.country_code) as pool_count
  from public.last_names_master ln
), choices as (
  select
    tr.id,
    tr.first_is_valid,
    tr.last_is_valid,
    tr.first_name as old_first_name,
    tr.last_name as old_last_name,
    fp.first_name as replacement_first_name,
    lp.last_name as replacement_last_name
  from target_rows tr
  join first_pool fp
    on fp.country_code = tr.country_code
   and fp.pool_no = 1 + mod(tr.first_pick_no - 1, fp.pool_count)
  join last_pool lp
    on lp.country_code = tr.country_code
   and lp.pool_no = 1 + mod(tr.last_pick_no - 1, lp.pool_count)
)
update public.riders r
set
  first_name = case when c.first_is_valid then c.old_first_name else c.replacement_first_name end,
  last_name = case when c.last_is_valid then c.old_last_name else c.replacement_last_name end
from choices c
where r.id = c.id;

-- Keep all direct rider-name snapshot/cache columns synchronized when the table
-- has a canonical rider_id -> rider_name/rider_name_snapshot relationship.
do $block$
declare
  v_row record;
begin
  for v_row in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name in ('rider_name', 'rider_name_snapshot')
      and c.is_generated = 'NEVER'
      and exists (
        select 1
        from information_schema.columns rid
        where rid.table_schema = c.table_schema
          and rid.table_name = c.table_name
          and rid.column_name = 'rider_id'
      )
  loop
    execute format(
      'update public.%I x
       set %I = r.first_name || '' '' || r.last_name
       from public.riders r
       join pg_temp.rider_name_country_repair_targets_v1 rt on rt.id = r.id
       where x.rider_id = r.id',
      v_row.table_name,
      v_row.column_name
    );
  end loop;
end;
$block$;

-- Replay frames persist rider ids and display names as parallel arrays. Rebuild
-- only frames containing a repaired rider, preserving array order and any entry
-- whose rider row no longer exists.
update public.race_stage_replay_frames f
set rider_names = (
  select array_agg(
           coalesce(r.first_name || ' ' || r.last_name, u.old_name)
           order by u.ord
         )
  from unnest(f.rider_ids, f.rider_names) with ordinality
       as u(rider_id, old_name, ord)
  left join public.riders r on r.id = u.rider_id
)
where f.rider_ids && coalesce(
  (select array_agg(rt.id) from rider_name_country_repair_targets_v1 rt),
  array[]::uuid[]
);

-- The world-reset function previously created temporary AS names from the US
-- pool and GT names from the MX pool, then deleted them. Those pools are now
-- permanent and country-specific, so remove only that obsolete insertion block.
do $block$
declare
  v_definition text;
  v_start integer;
  v_finish integer;
  v_start_marker text := '    -- Temporary DISPLAY-NAME fallback pools only. Rider nationality remains AS/GT and triggers enforce it.';
  v_finish_marker text := '    -- Main-team rosters use the existing canonical domestic generator, then canonical contracts.';
begin
  select pg_get_functiondef(
    'public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure
  ) into v_definition;

  v_start := strpos(v_definition, v_start_marker);
  v_finish := strpos(v_definition, v_finish_marker);

  if v_start = 0 or v_finish = 0 or v_finish <= v_start then
    raise exception 'Could not locate temporary AS/GT name-pool block in game_world_reset_execute_core_v1';
  end if;

  v_definition :=
    substr(v_definition, 1, v_start - 1)
    || '    -- Rider name pools are permanent and country-specific; no temporary cross-country fallback seeding is required.'
    || E'\n\n'
    || substr(v_definition, v_finish);

  execute v_definition;
end;
$block$;
