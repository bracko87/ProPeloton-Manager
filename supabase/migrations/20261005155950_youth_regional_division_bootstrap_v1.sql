-- The 16:00 Youth allocation replay uses this helper before the historical
-- 22:45 migration defines it.  Install the exact later implementation early.
-- CREATE OR REPLACE is safe and has identical behavior when replayed later.
create or replace function private.youth_regional_division_for_country_v1(p_country_code text)
returns text
language sql
stable
set search_path=public,private,pg_temp
as $function$
  select public.get_amateur_division_for_country(p_country_code);
$function$;
