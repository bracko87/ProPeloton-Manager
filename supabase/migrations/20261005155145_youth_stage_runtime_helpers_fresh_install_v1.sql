-- Fresh-install-only compatibility for historical Youth stage runtime dependencies.
-- Existing production functions are never replaced.  A future authoritative
-- stage diversification formula may supersede these conservative defaults.
-- The legacy stage results engine uses race terrain and per-stage race distance.

do $bootstrap$
begin
  if to_regprocedure('private.youth_stage_type_v1(uuid,text,integer,integer)') is null then
    execute $function$
      create function private.youth_stage_type_v1(
        p_race_id uuid, p_terrain_type text,
        p_race_days integer, p_stage_number integer
      ) returns text language sql immutable
      as $body$ select coalesce(nullif(p_terrain_type,''),'flat'); $body$;
    $function$;
  end if;

  if to_regprocedure('private.youth_stage_distance_km_v1(uuid,integer,text,integer,integer)') is null then
    execute $function$
      create function private.youth_stage_distance_km_v1(
        p_race_id uuid, p_distance_km integer, p_stage_type text,
        p_stage_number integer, p_race_days integer
      ) returns integer language sql immutable
      as $body$ select greatest(1,coalesce(p_distance_km,1)); $body$;
    $function$;
  end if;
end;
$bootstrap$;

-- Replicate the later authoritative route-city implementation exactly.
-- It is needed before that migration's first season-runtime invocation.
do $bootstrap$
begin
  if to_regprocedure('private.youth_stage_route_city_v1(uuid,integer,text)') is null then
    execute $definition$
create function private.youth_stage_route_city_v1(
  p_race_id uuid,
  p_stage_number integer,
  p_kind text
)
returns text
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_cities text[];
  v_count integer;
  v_seed integer;
  v_index integer;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then return null; end if;

  select array_agg(city_name order by sort_order,city_name)
  into v_cities
  from public.youth_race_host_cities
  where is_active=true and country_code=v_race.host_country_code;

  v_count:=coalesce(array_length(v_cities,1),0);
  if v_count<=1 then return v_race.host_city; end if;

  v_seed:=abs(hashtext(v_race.id::text||':route')) % v_count;
  if lower(coalesce(p_kind,'start'))='start' and p_stage_number=1 then
    return coalesce(v_race.host_city,v_cities[1]);
  end if;

  if lower(coalesce(p_kind,'start'))='start' then
    v_index:=1+mod(v_seed+greatest(p_stage_number,1)-2,v_count);
  else
    v_index:=1+mod(v_seed+greatest(p_stage_number,1)-1,v_count);
  end if;

  return coalesce(v_cities[v_index],v_race.host_city);
end;
$function$;
    $definition$;
  end if;
end;
$bootstrap$;
