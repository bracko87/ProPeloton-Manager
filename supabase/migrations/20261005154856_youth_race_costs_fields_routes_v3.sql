alter table public.youth_races
  add column if not exists min_teams smallint not null default 6,
  add column if not exists target_teams smallint;

alter table public.youth_race_stages
  add column if not exists start_city text,
  add column if not exists finish_city text;

alter table public.youth_race_entries
  add column if not exists entry_fee bigint not null default 0,
  add column if not exists travel_cost_total bigint not null default 0,
  add column if not exists accommodation_cost_total bigint not null default 0,
  add column if not exists logistics_cost_total bigint not null default 0,
  add column if not exists staff_accommodation_cost_total bigint not null default 0,
  add column if not exists equipment_support_cost_total bigint not null default 0,
  add column if not exists total_participation_cost bigint not null default 0;

update public.youth_races
set entry_cost=500,
    min_teams=6,
    target_teams=case competition_class
      when 'world' then least(team_limit,16)
      when 'continental' then least(team_limit,12)
      else least(team_limit,10)
    end,
    updated_at=now()
where status='scheduled'
  and race_date>public.get_current_game_date_date();

create or replace function private.youth_race_target_teams_v1(
  p_competition_class text,
  p_team_limit integer
)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select greatest(
    6,
    least(
      greatest(coalesce(p_team_limit,6),6),
      case lower(coalesce(p_competition_class,'regional'))
        when 'world' then 16
        when 'continental' then 12
        else 10
      end
    )
  );
$function$;

create or replace function private.youth_race_local_market_v1(
  p_academy_id uuid,
  p_race_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  select coalesce(
    public.get_amateur_division_for_country(c.country_code)
      = public.get_amateur_division_for_country(r.host_country_code),
    false
  )
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  cross join public.youth_races r
  where a.id=p_academy_id and r.id=p_race_id
  limit 1;
$function$;

create or replace function private.youth_race_cost_breakdown_v1(
  p_academy_id uuid,
  p_race_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_club_id uuid;
  v_estimate record;
  v_rider_count integer;
  v_staff_count integer:=2;
  v_days integer;
  v_entry_fee bigint;
  v_equipment bigint;
  v_total bigint;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  select club_id into v_club_id from public.youth_academies where id=p_academy_id;

  if v_race.id is null or v_club_id is null then
    return jsonb_build_object('available',false);
  end if;

  v_rider_count:=greatest(coalesce(v_race.lineup_size,5),1);
  v_days:=greatest(coalesce(v_race.race_days,1),1);
  v_entry_fee:=greatest(coalesce(v_race.entry_cost,500),500);

  select * into v_estimate
  from public.get_team_policy_trip_cost_estimate(
    v_club_id,
    v_race.host_country_code,
    public.get_amateur_division_for_country(v_race.host_country_code),
    v_days,
    v_rider_count,
    v_staff_count
  )
  limit 1;

  -- Small Youth-specific equipment/support pack: bottles, food, spare clothing,
  -- race consumables and basic mechanic support. The senior travel engine
  -- remains the source of truth for transport and accommodation.
  v_equipment:=150 + (25 * v_rider_count * v_days);

  v_total:=v_entry_fee
    +coalesce(v_estimate.travel_cost_total,0)
    +coalesce(v_estimate.accommodation_cost_total,0)
    +coalesce(v_estimate.logistics_cost_total,0)
    +coalesce(v_estimate.staff_accommodation_cost_total,0)
    +v_equipment;

  return jsonb_build_object(
    'available',true,
    'entry_fee',v_entry_fee,
    'rider_count',v_rider_count,
    'staff_count',v_staff_count,
    'race_days',v_days,
    'travel_cost_total',coalesce(v_estimate.travel_cost_total,0),
    'accommodation_cost_total',coalesce(v_estimate.accommodation_cost_total,0),
    'logistics_cost_total',coalesce(v_estimate.logistics_cost_total,0),
    'staff_accommodation_cost_total',coalesce(v_estimate.staff_accommodation_cost_total,0),
    'equipment_support_cost_total',v_equipment,
    'total_cost',v_total,
    'is_local_market',private.youth_race_local_market_v1(p_academy_id,p_race_id)
  );
end;
$function$;

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
  v_market text;
  v_cities text[];
  v_count integer;
  v_seed integer;
  v_index integer;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then return null; end if;

  v_market:=public.get_amateur_division_for_country(v_race.host_country_code);
  select array_agg(city_name order by sort_order,city_name)
  into v_cities
  from public.youth_race_host_cities
  where is_active=true and division_code=v_market;

  v_count:=coalesce(array_length(v_cities,1),0);
  if v_count=0 then return v_race.host_city; end if;

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
