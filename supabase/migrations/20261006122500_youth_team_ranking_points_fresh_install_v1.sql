-- Restore exact Youth team ranking contracts from READ-ONLY introspection
-- of the existing ProPeloton Manager database. A live variant is retained.
-- The authoritative rider finish points helper exists in the Oct 02 foundation.

do $bootstrap$
begin
  if to_regprocedure('private.youth_class_multiplier_v1(text)') is null then
    execute $ddl$
CREATE OR REPLACE FUNCTION private.youth_class_multiplier_v1(p_competition_class text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_temp'
AS $function$
  select case lower(coalesce(p_competition_class,'regional'))
    when 'world' then 2.50
    when 'continental' then 1.50
    else 1.00
  end::numeric;
$function$

    $ddl$;
  end if;
end;
$bootstrap$;

do $bootstrap$
begin
  if to_regprocedure('private.youth_team_ranking_points_v1(text,integer)') is null then
    execute $ddl$
CREATE OR REPLACE FUNCTION private.youth_team_ranking_points_v1(p_competition_class text, p_position integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select round(
    private.youth_race_base_points_v1(p_position)
    * private.youth_class_multiplier_v1(p_competition_class)
  )::integer;
$function$

    $ddl$;
  end if;
end;
$bootstrap$;

