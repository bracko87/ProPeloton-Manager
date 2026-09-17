-- Keep the live staff market populated at the intended role-specific stock level.
--
-- Previously staff_market_refill_available_candidates() capped every refresh to
-- staff_market_daily_refill_cap() (5-10 candidates per role). Once older market
-- rows expired, the visible market collapsed to roughly that cap even though
-- the configured target was much higher.
--
-- All roles now target at least 50 available candidates, and a refresh fills the
-- complete deficit back to target. Existing visibility rules remain unchanged.

create or replace function public.staff_market_target_available_count(
  p_role_type text
)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select case p_role_type
    when 'head_coach' then 70
    when 'trainer' then 60
    when 'team_doctor' then 50
    when 'physio' then 60
    when 'mechanic' then 70
    when 'scout_analyst' then 90
    when 'nutritionist' then 50
    when 'sport_director' then 50
    when 'u23_head_coach' then 50
    else 50
  end;
$function$;

create or replace function public.staff_market_refill_available_candidates(
  p_role_type text default null::text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_target integer;
  v_current integer;
  v_missing integer;
  v_to_generate integer;
  v_i integer;
  v_country_code text;
  v_generated integer := 0;
  v_roles text[];
begin
  v_roles := array[
    'head_coach',
    'trainer',
    'team_doctor',
    'physio',
    'mechanic',
    'scout_analyst',
    'nutritionist',
    'sport_director',
    'u23_head_coach'
  ];

  if p_role_type is not null then
    if not (p_role_type = any(v_roles)) then
      raise exception 'Unknown staff role: %', p_role_type;
    end if;

    v_roles := array[p_role_type];
  end if;

  foreach v_role in array v_roles
  loop
    v_target := public.staff_market_target_available_count(v_role);

    select count(*)::integer
      into v_current
    from public.staff_candidates sc
    where sc.role_type = v_role
      and coalesce(sc.is_available, false) = true;

    v_missing := greatest(v_target - coalesce(v_current, 0), 0);

    -- Fill the entire deficit. The former per-refresh cap was the reason the
    -- market could contain only 5-10 candidates even with a 50-90 target.
    v_to_generate := v_missing;

    if v_to_generate > 0 then
      for v_i in 1..v_to_generate loop
        v_country_code := public.staff_market_pick_country_for_generation();

        perform public.insert_generated_staff_candidate(
          v_role,
          v_country_code,
          null
        );

        v_generated := v_generated + 1;
      end loop;
    end if;
  end loop;

  return v_generated;
end;
$function$;

comment on function public.staff_market_target_available_count(text)
is 'Target number of globally available staff-market candidates per role; all supported roles are kept between 50 and 90.';

comment on function public.staff_market_refill_available_candidates(text)
is 'Refills each requested staff role all the way to its configured available-candidate target.';
