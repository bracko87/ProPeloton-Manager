create or replace function private.youth_stage_route_city_v1(
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

update public.youth_race_stages s
set start_city=private.youth_stage_route_city_v1(s.race_id,s.stage_number,'start'),
    finish_city=private.youth_stage_route_city_v1(s.race_id,s.stage_number,'finish'),
    updated_at=now()
from public.youth_races r
where r.id=s.race_id and r.status='scheduled';
