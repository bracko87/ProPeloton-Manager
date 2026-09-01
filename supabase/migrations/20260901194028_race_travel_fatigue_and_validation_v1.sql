-- Race travel fatigue v1
-- Adds real distance/policy-based travel fatigue on the day before a race,
-- exposes the expected impact in Race Plan validation, and keeps the existing
-- race-preparation / fatigue architecture intact.

-- Travel-specific comfort reductions. These keys are additive metadata and do
-- not change the existing general morale/recovery policy effects.
update public.team_policy_option_catalog
set effect_json = coalesce(effect_json, '{}'::jsonb) || jsonb_build_object(
  'travel_fatigue_reduction',
  case option_code
    when 'premium_economy' then 1
    when 'business' then 2
    when 'first' then 3
    else 0
  end
), updated_at = now()
where policy_key = 'flight_class';

update public.team_policy_option_catalog
set effect_json = coalesce(effect_json, '{}'::jsonb) || jsonb_build_object(
  'travel_fatigue_reduction',
  case option_code
    when 'standard' then 1
    when 'premium' then 2
    else 0
  end
), updated_at = now()
where policy_key = 'hotel_level';

update public.team_policy_option_catalog
set effect_json = coalesce(effect_json, '{}'::jsonb) || jsonb_build_object(
  'travel_fatigue_reduction',
  case option_code
    when 'premium_team_cars' then 1
    else 0
  end
), updated_at = now()
where policy_key = 'ground_transport';

create or replace function public.get_team_travel_fatigue_profile_v1(
  p_club_id uuid,
  p_destination_country_code text
)
returns table(
  policy_club_id uuid,
  origin_country_code text,
  destination_country_code text,
  distance_km numeric,
  route_band text,
  base_travel_fatigue integer,
  flight_class text,
  flight_fatigue_reduction integer,
  hotel_level text,
  hotel_fatigue_reduction integer,
  ground_transport text,
  ground_fatigue_reduction integer,
  total_comfort_reduction integer,
  net_travel_fatigue integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_policy_club_id uuid;
  v_origin_country_code text;
  v_destination_country_code text := upper(btrim(coalesce(p_destination_country_code, '')));
  v_distance numeric;
  v_route_band text;
  v_route_multiplier numeric;
  v_flight_class text := 'economy';
  v_hotel_level text := 'budget';
  v_ground_transport text := 'standard_vans';
  v_flight_reduction integer := 0;
  v_hotel_reduction integer := 0;
  v_ground_reduction integer := 0;
  v_base_fatigue integer := 0;
  v_total_reduction integer := 0;
  v_net_fatigue integer := 0;
begin
  select
    case
      when coalesce(c.club_type, 'main') = 'developing' then coalesce(c.parent_club_id, c.id)
      else c.id
    end,
    upper(
      coalesce(
        case
          when coalesce(c.club_type, 'main') = 'developing' then nullif(parent_c.country_code, '')
          else nullif(c.country_code, '')
        end,
        nullif(c.country_code, ''),
        'RS'
      )
    )
  into v_policy_club_id, v_origin_country_code
  from public.clubs c
  left join public.clubs parent_c on parent_c.id = c.parent_club_id
  where c.id = p_club_id
  limit 1;

  if v_policy_club_id is null or v_origin_country_code is null then
    raise exception 'Club not found for travel fatigue profile: %', p_club_id;
  end if;

  select
    coalesce(ctp.flight_class, 'economy'),
    coalesce(ctp.hotel_level, 'budget'),
    coalesce(ctp.ground_transport, 'standard_vans')
  into v_flight_class, v_hotel_level, v_ground_transport
  from public.club_team_policies ctp
  where ctp.club_id = v_policy_club_id
  limit 1;

  v_flight_class := coalesce(v_flight_class, 'economy');
  v_hotel_level := coalesce(v_hotel_level, 'budget');
  v_ground_transport := coalesce(v_ground_transport, 'standard_vans');

  v_distance := public.travel_country_distance_km_v2(
    v_origin_country_code,
    v_destination_country_code
  );

  select rb.route_band, rb.route_multiplier
  into v_route_band, v_route_multiplier
  from public.travel_route_band_multiplier_v1(
    v_origin_country_code,
    v_destination_country_code
  ) rb
  limit 1;

  v_route_band := coalesce(v_route_band, 'unknown_route');

  v_base_fatigue :=
    case
      when v_origin_country_code = v_destination_country_code then 0
      when v_distance is null then greatest(2, least(10, round(coalesce(v_route_multiplier, 2.0) * 2.0)::integer))
      when v_distance <= 300 then 1
      when v_distance <= 800 then 2
      when v_distance <= 1500 then 3
      when v_distance <= 3000 then 4
      when v_distance <= 6000 then 6
      when v_distance <= 10000 then 8
      else 10
    end;

  select coalesce((t.effect_json->>'travel_fatigue_reduction')::integer, 0)
  into v_flight_reduction
  from public.team_policy_option_catalog t
  where t.policy_key = 'flight_class'
    and t.option_code = v_flight_class
    and t.is_active = true
  limit 1;

  select coalesce((t.effect_json->>'travel_fatigue_reduction')::integer, 0)
  into v_hotel_reduction
  from public.team_policy_option_catalog t
  where t.policy_key = 'hotel_level'
    and t.option_code = v_hotel_level
    and t.is_active = true
  limit 1;

  select coalesce((t.effect_json->>'travel_fatigue_reduction')::integer, 0)
  into v_ground_reduction
  from public.team_policy_option_catalog t
  where t.policy_key = 'ground_transport'
    and t.option_code = v_ground_transport
    and t.is_active = true
  limit 1;

  v_flight_reduction := coalesce(v_flight_reduction, 0);
  v_hotel_reduction := coalesce(v_hotel_reduction, 0);
  v_ground_reduction := coalesce(v_ground_reduction, 0);
  v_total_reduction := v_flight_reduction + v_hotel_reduction + v_ground_reduction;
  v_net_fatigue := greatest(0, v_base_fatigue - v_total_reduction);

  return query
  select
    v_policy_club_id,
    v_origin_country_code,
    v_destination_country_code,
    v_distance,
    v_route_band,
    v_base_fatigue,
    v_flight_class,
    v_flight_reduction,
    v_hotel_level,
    v_hotel_reduction,
    v_ground_transport,
    v_ground_reduction,
    v_total_reduction,
    v_net_fatigue;
end;
$function$;

create or replace function public.get_race_travel_fatigue_preview_v1(
  p_race_id uuid,
  p_club_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_race_name text;
  v_destination_country_code text;
  v_race_start date;
  v_travel_date date;
  v_profile record;
  v_travel_date_label text;
  v_route_label text;
  v_message text;
begin
  select
    r.name,
    nullif(coalesce(to_jsonb(r)->>'country_code', to_jsonb(r)->>'host_country_code'), ''),
    r.start_date
  into v_race_name, v_destination_country_code, v_race_start
  from public.races r
  where r.id = p_race_id
  limit 1;

  if v_race_start is null then
    return jsonb_build_object('available', false, 'reason', 'race_not_found');
  end if;

  if v_destination_country_code is null then
    return jsonb_build_object('available', false, 'reason', 'race_country_missing');
  end if;

  select * into v_profile
  from public.get_team_travel_fatigue_profile_v1(
    p_club_id,
    v_destination_country_code
  )
  limit 1;

  v_travel_date := v_race_start - 1;
  v_travel_date_label := format(
    'Season %s - %s %s',
    extract(year from v_travel_date)::integer - 1999,
    to_char(v_travel_date, 'FMMonth'),
    to_char(v_travel_date, 'DD')
  );
  v_route_label := initcap(replace(coalesce(v_profile.route_band, 'unknown route'), '_', ' '));

  v_message := format(
    'Travel fatigue: %s km %s trip. With %s flight, %s hotel and %s, each selected rider is expected to receive +%s fatigue on %s (travel day). Better flight class, accommodation or premium ground transport can reduce this.',
    coalesce(round(v_profile.distance_km)::text, 'unknown-distance'),
    lower(v_route_label),
    initcap(replace(v_profile.flight_class, '_', ' ')),
    initcap(replace(v_profile.hotel_level, '_', ' ')),
    initcap(replace(v_profile.ground_transport, '_', ' ')),
    v_profile.net_travel_fatigue,
    v_travel_date_label
  );

  return jsonb_build_object(
    'available', true,
    'race_id', p_race_id,
    'race_name', v_race_name,
    'origin_country_code', v_profile.origin_country_code,
    'destination_country_code', v_profile.destination_country_code,
    'distance_km', v_profile.distance_km,
    'route_band', v_profile.route_band,
    'base_travel_fatigue', v_profile.base_travel_fatigue,
    'flight_class', v_profile.flight_class,
    'flight_fatigue_reduction', v_profile.flight_fatigue_reduction,
    'hotel_level', v_profile.hotel_level,
    'hotel_fatigue_reduction', v_profile.hotel_fatigue_reduction,
    'ground_transport', v_profile.ground_transport,
    'ground_fatigue_reduction', v_profile.ground_fatigue_reduction,
    'total_comfort_reduction', v_profile.total_comfort_reduction,
    'net_travel_fatigue', v_profile.net_travel_fatigue,
    'travel_date', v_travel_date,
    'travel_date_label', v_travel_date_label,
    'message', v_message
  );
end;
$function$;

create or replace function public.get_rider_travel_fatigue_impacts_for_date_v1(
  p_travel_date date
)
returns table(
  rider_id uuid,
  travel_fatigue_delta integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with due_riders as (
    select
      rpr.rider_id,
      rp.club_id,
      nullif(coalesce(to_jsonb(r)->>'country_code', to_jsonb(r)->>'host_country_code'), '') as destination_country_code
    from public.race_preparations rp
    join public.races r on r.id = rp.race_id
    join public.race_preparation_riders rpr on rpr.race_preparation_id = rp.id
    where rp.status in ('submitted', 'locked', 'auto_defaulted', 'sent_to_engine')
      and r.start_date = p_travel_date + 1
      and coalesce(r.status, '') not in ('cancelled', 'weather_cancelled')
  ), impacts as (
    select
      d.rider_id,
      p.net_travel_fatigue
    from due_riders d
    cross join lateral public.get_team_travel_fatigue_profile_v1(
      d.club_id,
      d.destination_country_code
    ) p
  )
  select
    i.rider_id,
    coalesce(max(i.net_travel_fatigue), 0)::integer as travel_fatigue_delta
  from impacts i
  group by i.rider_id;
$function$;

-- Attach the structured preview and a human-readable warning to the existing
-- race quote. The UI already renders quote warnings in the Validation card, so
-- this makes the impact visible without introducing a parallel frontend path.
create or replace function public.quote_race_preparation_with_bonus_v1(
  p_race_id uuid,
  p_club_id uuid,
  p_rider_ids uuid[] default '{}'::uuid[],
  p_staff_ids uuid[] default '{}'::uuid[],
  p_asset_assignments jsonb default '[]'::jsonb,
  p_supply_reservations jsonb default '{}'::jsonb,
  p_default_equipment_setup_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote jsonb;
  v_bonus_preview jsonb;
  v_travel_fatigue_preview jsonb;
  v_travel_warning text;
begin
  v_quote := public.quote_race_preparation_v1(
    p_race_id,
    p_club_id,
    coalesce(p_rider_ids, '{}'::uuid[]),
    coalesce(p_staff_ids, '{}'::uuid[]),
    coalesce(p_asset_assignments, '[]'::jsonb),
    coalesce(p_supply_reservations, '{}'::jsonb),
    p_default_equipment_setup_id
  );

  v_travel_fatigue_preview := public.get_race_travel_fatigue_preview_v1(
    p_race_id,
    p_club_id
  );

  v_quote := coalesce(v_quote, '{}'::jsonb)
    || jsonb_build_object(
      'travel_fatigue_preview', coalesce(v_travel_fatigue_preview, '{}'::jsonb)
    );

  if coalesce((v_travel_fatigue_preview->>'available')::boolean, false)
     and coalesce((v_travel_fatigue_preview->>'net_travel_fatigue')::integer, 0) > 0
  then
    v_travel_warning := nullif(v_travel_fatigue_preview->>'message', '');
    if v_travel_warning is not null then
      v_quote := jsonb_set(
        v_quote,
        '{warnings}',
        coalesce(v_quote->'warnings', '[]'::jsonb) || jsonb_build_array(v_travel_warning),
        true
      );
    end if;
  end if;

  v_bonus_preview := public.get_race_plan_bonus_preview_v1(
    p_club_id,
    coalesce(p_staff_ids, '{}'::uuid[]),
    coalesce(p_asset_assignments, '[]'::jsonb)
  );

  v_quote := coalesce(v_quote, '{}'::jsonb)
    || jsonb_build_object(
      'bonus_preview', coalesce(v_bonus_preview, '{}'::jsonb)
    );

  v_quote := public.race_quote_attach_standardized_bonus_v1(v_quote);

  return v_quote;
end;
$function$;

-- Add travel fatigue to the canonical daily fatigue processor. It is added
-- after the day's normal recovery calculation, so an intercontinental flight
-- produces a visible fatigue increase instead of being silently absorbed by
-- ordinary rest recovery. The existing fatigue_updated_on guard keeps this
-- idempotent for the processed date.
do $patch_daily_fatigue$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'process_daily_fatigue'
    and pg_get_function_identity_arguments(p.oid) = ''
  limit 1;

  if v_oid is null then
    raise exception 'process_daily_fatigue() not found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('get_rider_travel_fatigue_impacts_for_date_v1' in v_def) > 0 then
    return;
  end if;

  if position('  v_total_recovery_bonus integer;' in v_def) = 0 then
    raise exception 'process_daily_fatigue declaration patch point not found';
  end if;
  v_def := replace(
    v_def,
    '  v_total_recovery_bonus integer;',
    '  v_total_recovery_bonus integer;' || E'\n  v_travel_fatigue_delta integer;'
  );

  if position('      coalesce(a.recovery_bonus, 0) as recovery_bonus' in v_def) = 0 then
    raise exception 'process_daily_fatigue select patch point not found';
  end if;
  v_def := replace(
    v_def,
    '      coalesce(a.recovery_bonus, 0) as recovery_bonus',
    '      coalesce(a.recovery_bonus, 0) as recovery_bonus,' || E'\n      coalesce(travel.travel_fatigue_delta, 0) as travel_fatigue_delta'
  );

  if position('     and a.activity_date = v_processed_date' in v_def) = 0 then
    raise exception 'process_daily_fatigue join patch point not found';
  end if;
  v_def := replace(
    v_def,
    '     and a.activity_date = v_processed_date',
    '     and a.activity_date = v_processed_date' || E'\n    left join public.get_rider_travel_fatigue_impacts_for_date_v1(v_processed_date) travel' || E'\n      on travel.rider_id = rd.id'
  );

  if position('    v_total_recovery_bonus := coalesce(r.recovery_bonus, 0);' in v_def) = 0 then
    raise exception 'process_daily_fatigue assignment patch point not found';
  end if;
  v_def := replace(
    v_def,
    '    v_total_recovery_bonus := coalesce(r.recovery_bonus, 0);',
    '    v_total_recovery_bonus := coalesce(r.recovery_bonus, 0);' || E'\n    v_travel_fatigue_delta := coalesce(r.travel_fatigue_delta, 0);'
  );

  if position('    v_outcome := ''none'';' in v_def) = 0 then
    raise exception 'process_daily_fatigue final fatigue patch point not found';
  end if;
  v_def := replace(
    v_def,
    '    v_outcome := ''none'';',
    '    if v_travel_fatigue_delta > 0 then' || E'\n      v_new_fatigue := greatest(0, least(100, v_new_fatigue + v_travel_fatigue_delta));' || E'\n    end if;' || E'\n\n    v_outcome := ''none'';'
  );

  execute v_def;
end;
$patch_daily_fatigue$;
