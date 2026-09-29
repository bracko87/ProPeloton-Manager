create or replace function public.generate_staff_birth_date_v1(
  p_role_type text,
  p_reference_date date default null
)
returns date
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reference_date date := coalesce(p_reference_date, public.get_current_game_date_date());
  v_role text := lower(coalesce(trim(p_role_type), ''));
  v_min_age integer;
  v_max_age integer;
  v_age integer;
  v_day_offset integer;
begin
  if v_reference_date is null then
    return null;
  end if;

  case v_role
    when 'head_coach' then
      v_min_age := 32;
      v_max_age := 64;
    when 'sport_director' then
      v_min_age := 32;
      v_max_age := 64;
    when 'team_doctor' then
      v_min_age := 30;
      v_max_age := 64;
    when 'u23_head_coach' then
      v_min_age := 28;
      v_max_age := 58;
    when 'trainer' then
      v_min_age := 27;
      v_max_age := 60;
    when 'physio' then
      v_min_age := 27;
      v_max_age := 60;
    when 'nutritionist' then
      v_min_age := 27;
      v_max_age := 60;
    when 'mechanic' then
      v_min_age := 27;
      v_max_age := 62;
    when 'scout_analyst' then
      v_min_age := 27;
      v_max_age := 62;
    else
      v_min_age := 27;
      v_max_age := 62;
  end case;

  v_age := v_min_age + floor(random() * (v_max_age - v_min_age + 1))::integer;
  v_day_offset := floor(random() * 365)::integer;

  return (
    v_reference_date
    - make_interval(years => v_age)
    - make_interval(days => v_day_offset)
  )::date;
end;
$function$;

comment on function public.generate_staff_birth_date_v1(text, date)
is 'Generates a game-world staff birth date for new/generated staff. Birth date is the source of truth; UI age is derived from the current game date.';

-- Recover any existing birth dates from linked employment/market rows before
-- generating values for genuinely missing legacy/generated rows.
update public.staff_candidates sc
set birth_date = cs.birth_date,
    updated_at = now(),
    notes = coalesce(sc.notes, '{}'::jsonb) || jsonb_build_object(
      'birth_date_source', 'linked_club_staff'
    )
from public.club_staff cs
where sc.birth_date is null
  and cs.birth_date is not null
  and coalesce(sc.notes->>'former_club_staff_id', '') = cs.id::text;

update public.club_staff cs
set birth_date = sc.birth_date,
    updated_at = now(),
    notes = coalesce(cs.notes, '{}'::jsonb) || jsonb_build_object(
      'birth_date_source', 'hired_staff_candidate'
    )
from public.staff_candidates sc
where cs.birth_date is null
  and sc.birth_date is not null
  and coalesce(cs.notes->>'hired_from_candidate_id', '') = sc.id::text;

-- Existing generated market candidates were created without birth_date because
-- insert_generated_staff_candidate did not populate the column.
update public.staff_candidates sc
set birth_date = public.generate_staff_birth_date_v1(
      sc.role_type,
      public.get_current_game_date_date()
    ),
    updated_at = now(),
    notes = coalesce(sc.notes, '{}'::jsonb) || jsonb_build_object(
      'birth_date_source', 'generated_backfill_v1'
    )
where sc.birth_date is null;

-- Copy the now-restored candidate DOB into hired staff wherever a candidate link
-- exists, then safely backfill only any remaining legacy club_staff rows.
update public.club_staff cs
set birth_date = sc.birth_date,
    updated_at = now(),
    notes = coalesce(cs.notes, '{}'::jsonb) || jsonb_build_object(
      'birth_date_source', 'hired_staff_candidate'
    )
from public.staff_candidates sc
where cs.birth_date is null
  and sc.birth_date is not null
  and coalesce(cs.notes->>'hired_from_candidate_id', '') = sc.id::text;

update public.club_staff cs
set birth_date = public.generate_staff_birth_date_v1(
      cs.role_type,
      public.get_current_game_date_date()
    ),
    updated_at = now(),
    notes = coalesce(cs.notes, '{}'::jsonb) || jsonb_build_object(
      'birth_date_source', 'generated_legacy_backfill_v1'
    )
where cs.birth_date is null;

-- If a former employee is already represented in the market, employment identity
-- wins so the same person keeps the same DOB across Staff and Transfers.
update public.staff_candidates sc
set birth_date = cs.birth_date,
    updated_at = now(),
    notes = coalesce(sc.notes, '{}'::jsonb) || jsonb_build_object(
      'birth_date_source', 'former_club_staff'
    )
from public.club_staff cs
where cs.birth_date is not null
  and coalesce(sc.notes->>'former_club_staff_id', '') = cs.id::text
  and sc.birth_date is distinct from cs.birth_date;

create or replace function public.insert_generated_staff_candidate(
  p_role_type text,
  p_country_code text,
  p_quality_tier text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_profile record;
  v_identity record;
  v_candidate_id uuid;
  v_now_game_ts timestamp;
  v_birth_date date;
  v_lifetime_hours integer := 72;
begin
  select *
  into v_profile
  from public.generate_staff_candidate_profile(
    p_role_type,
    p_country_code,
    p_quality_tier
  );

  select *
  into v_identity
  from public.generate_staff_identity(p_country_code);

  v_now_game_ts := public.get_current_game_date_timestamp();
  v_birth_date := public.generate_staff_birth_date_v1(
    p_role_type,
    v_now_game_ts::date
  );

  insert into public.staff_candidates (
    role_type,
    specialization,
    staff_name,
    country_code,
    expertise,
    experience,
    potential,
    leadership,
    efficiency,
    loyalty,
    salary_weekly,
    is_available,
    notes,
    first_name,
    last_name,
    listed_at_game_ts,
    expires_at_game_ts,
    birth_date,
    market_region,
    created_at,
    updated_at
  )
  values (
    p_role_type,
    v_profile.specialization,
    concat_ws(' ', v_identity.first_name, v_identity.last_name),
    p_country_code,
    v_profile.expertise,
    v_profile.experience,
    v_profile.potential,
    v_profile.leadership,
    v_profile.efficiency,
    v_profile.loyalty,
    v_profile.salary_weekly,
    true,
    jsonb_build_object(
      'quality_tier', coalesce(p_quality_tier, 'mixed'),
      'profile_version', 'new_staff_roles_v1',
      'generated_reason', 'staff_market_daily_refresh_v2',
      'generated_for_market', true,
      'birth_date_source', 'generated_v1'
    ),
    v_identity.first_name,
    v_identity.last_name,
    v_now_game_ts,
    v_now_game_ts + make_interval(hours => v_lifetime_hours),
    v_birth_date,
    public.staff_market_region_from_country(p_country_code),
    now(),
    now()
  )
  returning id into v_candidate_id;

  return v_candidate_id;
end;
$function$;

comment on function public.insert_generated_staff_candidate(text, text, text)
is 'Creates a generated staff-market candidate including birth_date so Transfers, Staff and Staff Profile can derive age from the current game date.';