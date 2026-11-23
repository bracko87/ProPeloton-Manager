-- Fresh-install repair using function definitions verified READ-ONLY from the
-- existing ProPeloton Manager database. Do not overwrite an installed variant.
-- The original stage terrain and distance algorithms are preserved.

do $bootstrap$
begin
  if to_regprocedure('private.youth_stage_distance_km_v1(uuid,integer,text,integer,integer)') is null then
    execute $ddl$
CREATE OR REPLACE FUNCTION private.youth_stage_distance_km_v1(p_race_id uuid, p_base_distance integer, p_stage_type text, p_stage_number integer, p_race_days integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_temp'
AS $function$
declare
  v_hash integer:=mod(
    abs(hashtext(coalesce(p_race_id::text,'race')||':'||coalesce(p_stage_number,1)::text||':distance')),
    25
  );
  v_base integer:=greatest(35,least(130,coalesce(p_base_distance,75)));
begin
  if coalesce(p_race_days,1)<=1 then
    return v_base;
  end if;

  if p_stage_type='time_trial' then
    return 18+mod(v_hash,18);
  elsif p_stage_type='mountain' then
    return greatest(55,least(95,v_base-8+(v_hash-12)));
  elsif p_stage_type='hilly' then
    return greatest(60,least(105,v_base-4+(v_hash-12)));
  elsif p_stage_type='flat' then
    return greatest(65,least(115,v_base+5+(v_hash-12)));
  end if;

  return greatest(60,least(110,v_base+(v_hash-12)));
end;
$function$

    $ddl$;
  end if;
end;
$bootstrap$;

do $bootstrap$
begin
  if to_regprocedure('private.youth_stage_route_city_v1(uuid,integer,text)') is null then
    execute $ddl$
CREATE OR REPLACE FUNCTION private.youth_stage_route_city_v1(p_race_id uuid, p_stage_number integer, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
$function$

    $ddl$;
  end if;
end;
$bootstrap$;

do $bootstrap$
begin
  if to_regprocedure('private.youth_stage_type_v1(uuid,text,integer,integer)') is null then
    execute $ddl$
CREATE OR REPLACE FUNCTION private.youth_stage_type_v1(p_race_id uuid, p_base_type text, p_race_days integer, p_stage_number integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_temp'
AS $function$
declare
  v_days integer:=greatest(1,coalesce(p_race_days,1));
  v_stage integer:=greatest(1,coalesce(p_stage_number,1));
  v_base text:=case lower(coalesce(p_base_type,'mixed'))
    when 'flat' then 'flat'
    when 'hilly' then 'hilly'
    when 'mountain' then 'mountain'
    when 'time_trial' then 'time_trial'
    else 'mixed'
  end;
  v_optional_tt boolean:=false;
begin
  if v_days=1 then return v_base; end if;

  if v_days>=6 and v_stage=3 then
    return 'time_trial';
  end if;

  v_optional_tt:=
    v_days between 4 and 5
    and mod(abs(hashtext(coalesce(p_race_id::text,'race')||':tt')),4)=0;

  if v_optional_tt and v_stage=3 then return 'time_trial'; end if;

  if v_days=2 then
    if v_stage=1 then return case when v_base='time_trial' then 'flat' else 'flat' end; end if;
    return case when v_base='time_trial' then 'time_trial' else v_base end;
  end if;

  if v_days=3 then
    return case v_stage
      when 1 then 'flat'
      when 2 then case when v_base in ('hilly','mountain','mixed','time_trial') then v_base else 'hilly' end
      else case when v_base='flat' then 'mixed' when v_base='time_trial' then 'hilly' else v_base end
    end;
  end if;

  return (array['flat','hilly','mountain','mixed','flat','hilly','mountain'])
    [1+mod(v_stage-1,7)];
end;
$function$

    $ddl$;
  end if;
end;
$bootstrap$;

