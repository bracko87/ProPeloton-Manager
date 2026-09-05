create or replace function public.race_asset_transport_cost_for_club_v2(
  p_club_id uuid,
  p_destination_country_code text,
  p_asset_assignments jsonb,
  p_race_days integer
)
returns bigint
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_origin_country_code text;
  v_distance_km numeric;
  v_effective_distance_km numeric;
  v_freight_multiplier numeric := 1.00;
  v_days integer := greatest(coalesce(p_race_days, 1), 1);
  v_total numeric := 0;
begin
  select upper(
    coalesce(
      case
        when coalesce(c.club_type, 'main') = 'developing'
          then nullif(parent_c.country_code, '')
        else nullif(c.country_code, '')
      end,
      nullif(c.country_code, ''),
      'RS'
    )
  )
  into v_origin_country_code
  from public.clubs c
  left join public.clubs parent_c on parent_c.id = c.parent_club_id
  where c.id = p_club_id
  limit 1;

  if v_origin_country_code is null then
    raise exception 'Club not found for asset transport estimate: %', p_club_id;
  end if;

  v_distance_km := public.travel_country_distance_km_v2(
    v_origin_country_code,
    upper(btrim(coalesce(p_destination_country_code, '')))
  );

  v_effective_distance_km :=
    case
      when upper(btrim(coalesce(p_destination_country_code, ''))) = v_origin_country_code then 250
      when v_distance_km is null then 1500
      else greatest(v_distance_km, 100)
    end;

  v_freight_multiplier :=
    case
      when v_effective_distance_km > 10000 then 1.70
      when v_effective_distance_km > 6000 then 1.45
      when v_effective_distance_km > 3000 then 1.25
      else 1.00
    end;

  select coalesce(sum(
    case coalesce(elem->>'asset_key', '')
      when 'team_bus' then
        500 + (v_effective_distance_km * 2 * 0.18 * v_freight_multiplier) + (80 * v_days)
      when 'equipment_van' then
        350 + (v_effective_distance_km * 2 * 0.14 * v_freight_multiplier) + (60 * v_days)
      when 'mobile_workshop' then
        550 + (v_effective_distance_km * 2 * 0.20 * v_freight_multiplier) + (80 * v_days)
      when 'medical_van' then
        400 + (v_effective_distance_km * 2 * 0.16 * v_freight_multiplier) + (65 * v_days)
      when 'team_car' then
        220 + (v_effective_distance_km * 2 * 0.10 * v_freight_multiplier) + (45 * v_days)
      else
        300 + (v_effective_distance_km * 2 * 0.12 * v_freight_multiplier) + (50 * v_days)
    end
  ), 0)
  into v_total
  from jsonb_array_elements(coalesce(p_asset_assignments, '[]'::jsonb)) elem;

  -- Balance v1: asset transport was dominating the race package economy.
  -- Preserve relative differences by asset type, route distance and race length,
  -- while reducing the final transport charge globally by 50%.
  return round(v_total * 0.50)::bigint;
end;
$function$;
