-- Fix rider nationality/name generation.
--
-- The legacy generated_rider_* tables contain country-specific pools for only a
-- small subset of countries. Their ANY fallback could therefore assign names
-- from a different nationality to otherwise correctly-nationalized riders.
-- Canonical rider generation now uses first_names_master/last_names_master only.

-- American Samoa uses the Samoan naming pool.
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

-- Permanent Guatemala rider-name pool.
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

-- game_world_reset_execute_core_v1 previously inserted temporary AS names from
-- US and GT names from MX and then removed them. Remove that obsolete block now
-- that AS/GT have permanent country-specific master pools.
do $block$
declare
  v_definition text;
  v_start integer;
  v_finish integer;
  v_start_marker text := '    -- Temporary DISPLAY-NAME fallback pools only. Rider nationality remains AS/GT and triggers enforce it.';
  v_finish_marker text := '    -- Main-team rosters use the existing canonical domestic generator, then canonical contracts.';
begin
  select pg_get_functiondef('public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure)
  into v_definition;

  v_start := strpos(v_definition, v_start_marker);
  v_finish := strpos(v_definition, v_finish_marker);

  if v_start = 0 or v_finish = 0 or v_finish <= v_start then
    raise exception 'Could not locate temporary AS/GT name-pool block in game_world_reset_execute_core_v1';
  end if;

  v_definition := substr(v_definition, 1, v_start - 1)
    || '    -- Rider name pools are permanent and country-specific; no temporary cross-country fallback seeding is required.'
    || E'\n\n'
    || substr(v_definition, v_finish);

  execute v_definition;
end;
$block$;
