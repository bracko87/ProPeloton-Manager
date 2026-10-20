-- Prevent a random generated staff profile from failing an entire daily
-- market refresh when an expired or available candidate already owns the
-- (role_type,staff_name,specialization,salary_weekly) unique profile.
-- Preserve all existing staff candidates and the UNIQUE index; retry at most
-- 20 full profile+identity generations and fail explicitly only on exhaustion.
--
-- Safe to rerun: CREATE OR REPLACE FUNCTION, no historic row updates.
CREATE OR REPLACE FUNCTION public.insert_generated_staff_candidate(p_role_type text, p_country_code text, p_quality_tier text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile record;
  v_identity record;
  v_candidate_id uuid;
  v_now_game_ts timestamp;
  v_birth_date date;
  v_lifetime_hours integer:=72;
  v_attempt integer;
  v_max_attempts constant integer:=20;
begin
  v_now_game_ts:=public.get_current_game_date_timestamp();
  v_birth_date:=public.generate_staff_birth_date_v1(
    p_role_type,v_now_game_ts::date
  );

  -- Profiles remain unique across all candidates, including expired listings.
  -- A random identity/profile may duplicate an earlier candidate; re-roll a
  -- bounded number of times rather than aborting the entire daily market refresh.
  for v_attempt in 1..v_max_attempts loop
    v_candidate_id:=null;

    select * into v_profile
    from public.generate_staff_candidate_profile(
      p_role_type,p_country_code,p_quality_tier
    );

    select * into v_identity
    from public.generate_staff_identity(p_country_code);

    insert into public.staff_candidates(
    role_type,specialization,staff_name,country_code,
    expertise,experience,potential,leadership,efficiency,loyalty,
    salary_weekly,is_available,notes,first_name,last_name,
    listed_at_game_ts,expires_at_game_ts,birth_date,market_region,
    created_at,updated_at
  )
  values(
    p_role_type,v_profile.specialization,
    concat_ws(' ',v_identity.first_name,v_identity.last_name),
    p_country_code,v_profile.expertise,v_profile.experience,
    v_profile.potential,v_profile.leadership,v_profile.efficiency,
    v_profile.loyalty,v_profile.salary_weekly,true,
    coalesce(v_profile.notes,'{}'::jsonb) || jsonb_build_object(
      'birth_date_source','generated_v1'
    ),
    v_identity.first_name,v_identity.last_name,
    v_now_game_ts,v_now_game_ts+make_interval(hours=>v_lifetime_hours),
    v_birth_date,public.staff_market_region_from_country(p_country_code),
    now(),now()
  )
  on conflict (role_type,staff_name,specialization,salary_weekly)
  do nothing
  returning id into v_candidate_id;

    if v_candidate_id is not null then
      return v_candidate_id;
    end if;
  end loop;

  -- Keep unexpected exhaustion visible: do not incorrectly claim a refill
  -- succeeded, relax the constraint, or silently under-fill the staff market.
  raise exception using
    errcode='P0001',
    message=format(
      'Staff candidate generation exhausted %s unique-profile attempts for role %s, country %s.',
      v_max_attempts,p_role_type,p_country_code
    );
end;
$function$;
