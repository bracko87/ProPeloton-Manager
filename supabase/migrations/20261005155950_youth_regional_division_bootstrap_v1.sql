-- Install the precise division and quota helpers from the later 22:45 Youth
-- migration before the historical 16:00 allocation replay invokes them.
-- Each definition is identical to its later CREATE OR REPLACE version.

create or replace function private.youth_regional_division_for_country_v1(p_country_code text)
returns text
language sql
stable
set search_path=public,private,pg_temp
as $function$
  select public.get_amateur_division_for_country(p_country_code);
$function$;

create or replace function private.youth_continental_division_for_regional_v1(p_regional_division text)
returns text
language sql
immutable
set search_path=pg_temp
as $function$
  select case upper(coalesce(p_regional_division,''))
    when 'NORTH_AMERICA' then 'CONTINENTAL_WEST'
    when 'SOUTH_AMERICA' then 'CONTINENTAL_WEST'
    when 'WESTERN_EUROPE' then 'CONTINENTAL_WEST'
    when 'CENTRAL_EUROPE' then 'CONTINENTAL_WEST'
    when 'SOUTHERN_BALKAN_EUROPE' then 'CONTINENTAL_WEST'
    when 'NORTHERN_EASTERN_EUROPE' then 'CONTINENTAL_WEST'
    when 'WEST_NORTH_AFRICA' then 'CONTINENTAL_EAST'
    when 'CENTRAL_SOUTH_AFRICA' then 'CONTINENTAL_EAST'
    when 'WEST_CENTRAL_ASIA' then 'CONTINENTAL_EAST'
    when 'SOUTH_ASIA' then 'CONTINENTAL_EAST'
    when 'EAST_SOUTHEAST_ASIA' then 'CONTINENTAL_EAST'
    when 'OCEANIA' then 'CONTINENTAL_EAST'
    else null
  end;
$function$;

create or replace function private.youth_continental_division_for_country_v1(p_country_code text)
returns text
language sql
stable
set search_path=public,private,pg_temp
as $function$
  select private.youth_continental_division_for_regional_v1(
    public.get_amateur_division_for_country(p_country_code)
  );
$function$;

create or replace function private.youth_regional_ai_target_v1(p_division_code text)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case upper(coalesce(p_division_code,''))
    when 'NORTH_AMERICA' then 2
    when 'SOUTH_AMERICA' then 2
    when 'WESTERN_EUROPE' then 2
    when 'CENTRAL_EUROPE' then 2
    when 'SOUTHERN_BALKAN_EUROPE' then 2
    when 'NORTHERN_EASTERN_EUROPE' then 2
    when 'WEST_NORTH_AFRICA' then 2
    when 'CENTRAL_SOUTH_AFRICA' then 2
    when 'WEST_CENTRAL_ASIA' then 2
    when 'SOUTH_ASIA' then 2
    when 'EAST_SOUTHEAST_ASIA' then 2
    when 'OCEANIA' then 2
    else 0
  end;
$function$;

create or replace function private.youth_regional_feed_count_v1(p_continental_division text)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case upper(coalesce(p_continental_division,''))
    when 'CONTINENTAL_WEST' then 6
    when 'CONTINENTAL_EAST' then 6
    else 0
  end;
$function$;
