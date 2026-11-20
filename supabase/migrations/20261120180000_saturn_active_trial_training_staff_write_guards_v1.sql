-- SAT-08: drafted read-only source snapshot of six existing player-facing
-- mutation RPCs with a new strict anonymous/expired test player guard.
-- Do not deploy until staging test and full game mutation audit complete.
-- Normal permanent user behavior is preserved.
-- Requires saturn_test_account_can_mutate_v1(uuid) from earlier migration.

CREATE OR REPLACE FUNCTION public.clear_rider_daily_training_override_v1(p_club_id uuid, p_rider_id uuid, p_plan_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted_rows integer;
  v_generation jsonb;
begin
  -- SAT-08: protect state-changing rider/coach settings at the server.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not eligible for this club'
      using errcode='42501';
  end if;
  if not public.can_manage_club_training_v1(p_club_id) then
    raise exception
      'You do not have permission to manage training for this team.';
  end if;

  delete from public.rider_regular_training_daily_plans
  where club_id = p_club_id
    and rider_id = p_rider_id
    and plan_date = p_plan_date
    and source_type = 'manual_override';

  get diagnostics v_deleted_rows = row_count;

  v_generation :=
    public.generate_coach_regular_training_plan_v1(
      p_club_id,
      public.get_current_game_date_date()
    );

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'rider_id', p_rider_id,
    'plan_date', p_plan_date,
    'deleted_override_rows', v_deleted_rows,
    'generation', v_generation
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.hire_staff_candidate(p_candidate_id uuid, p_contract_days integer DEFAULT 0)
 RETURNS TABLE(staff_id uuid, club_id uuid, role_type text, staff_name text, salary_weekly integer, contract_expires_at date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare
  v_user_id uuid;
  v_club_id uuid;
  v_candidate public.staff_candidates%rowtype;
  v_staff_id uuid;
  v_contract_expires_at date;

  v_limit_count integer;
  v_active_count integer;
  v_can_hire boolean;

  v_team_scope text;
  v_current_season integer;
  v_target_season integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if p_contract_days is null or p_contract_days not in (0, 1) then
    raise exception 'Contract term must be 0 (current season end) or 1 (next season end).';
  end if;

  select gs.season_number
  into v_current_season
  from public.game_state gs
  where gs.id = true
  limit 1;

  if v_current_season is null then
    raise exception 'Current game season not found.';
  end if;

  select c.id
  into v_club_id
  from public.clubs c
  where c.owner_user_id = v_user_id
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type, 'main') <> 'developing'
  order by c.created_at asc
  limit 1;

  if v_club_id is null then
    raise exception 'Main club not found.';
  end if;

  -- SAT-08: no staff/finance mutations after a test account expires.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    raise exception 'Test account expired or not eligible for this club'
      using errcode='42501';
  end if;

  select *
  into v_candidate
  from public.staff_candidates sc
  where sc.id = p_candidate_id
    and sc.is_available = true
  for update;

  if not found then
    raise exception 'Candidate not found or no longer available.';
  end if;

  if v_candidate.role_type in ('youth_academy_director','u16_head_coach','youth_scout') then
    if not public.current_user_has_youth_academy_access_v1() then
      raise exception 'Active Premium membership and current-season Youth Academy renewal are required to hire Youth Academy staff.';
    end if;

    if not exists(
      select 1 from public.youth_academies ya
      where ya.club_id=v_club_id and ya.is_active=true
    ) then
      raise exception 'Activate Youth Academy before hiring Youth Academy staff.';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('hire_staff:' || v_club_id::text || ':' || v_candidate.role_type)
  );

  select
    g.limit_count,
    g.active_count,
    g.can_hire
  into
    v_limit_count,
    v_active_count,
    v_can_hire
  from public.get_staff_role_capacity_overview_for_club(v_club_id) g
  where g.role_type = v_candidate.role_type
  limit 1;

  if v_limit_count is null then
    raise exception 'Unsupported staff role: %', v_candidate.role_type;
  end if;

  if not coalesce(v_can_hire, false) then
    raise exception '% staff limit reached (%/% active).',
      v_candidate.role_type,
      v_active_count,
      v_limit_count;
  end if;

  v_team_scope :=
    case coalesce(v_candidate.notes ->> 'team_scope_hint', 'all')
      when 'first_team' then 'first_team'
      when 'u23' then 'u23'
      when 'youth' then 'youth'
      else 'all'
    end;

  v_target_season := v_current_season + p_contract_days;

  v_contract_expires_at := make_date(
    1999 + v_target_season,
    12,
    31
  );

  insert into public.club_staff (
    club_id,
    role_type,
    specialization,
    team_scope,
    staff_name,
    first_name,
    last_name,
    country_code,
    expertise,
    experience,
    potential,
    leadership,
    efficiency,
    loyalty,
    salary_weekly,
    contract_expires_at,
    birth_date,
    is_active,
    notes
  )
  values (
    v_club_id,
    v_candidate.role_type,
    v_candidate.specialization,
    v_team_scope,
    v_candidate.staff_name,
    v_candidate.first_name,
    v_candidate.last_name,
    v_candidate.country_code,
    v_candidate.expertise,
    v_candidate.experience,
    v_candidate.potential,
    v_candidate.leadership,
    v_candidate.efficiency,
    v_candidate.loyalty,
    v_candidate.salary_weekly,
    v_contract_expires_at,
    v_candidate.birth_date,
    true,
    coalesce(v_candidate.notes, '{}'::jsonb) || jsonb_build_object(
      'hired_from_candidate_id', v_candidate.id,
      'hired_at', now(),
      'contract_term_mode', case
        when p_contract_days = 0 then 'current_season_end'
        else 'next_season_end'
      end
    )
  )
  returning id into v_staff_id;

  update public.staff_candidates
  set is_available = false
  where id = v_candidate.id;

  perform public.create_game_notification_for_user_checked(
    v_user_id,
    'STAFF_HIRED',
    'Staff hired: ' || v_candidate.staff_name,
    v_candidate.staff_name || ' has joined your club as ' || replace(v_candidate.role_type::text, '_', ' ') || '.',
    '/dashboard/staff',
    jsonb_build_object(
      'staff_id', v_staff_id,
      'candidate_id', v_candidate.id,
      'club_id', v_club_id,
      'staff_name', v_candidate.staff_name,
      'role_type', v_candidate.role_type,
      'birth_date', v_candidate.birth_date,
      'salary_weekly', v_candidate.salary_weekly,
      'contract_expires_at', v_contract_expires_at
    )
  );

  return query
  select
    v_staff_id,
    v_club_id,
    v_candidate.role_type,
    v_candidate.staff_name,
    v_candidate.salary_weekly,
    v_contract_expires_at;
end;
$function$;


CREATE OR REPLACE FUNCTION public.save_training_camp_day_training_plans(p_booking_id uuid, p_plans jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_current_game_date date;
  v_booking record;
  v_plan record;
  v_saved_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_booking_id is null then
    raise exception 'Missing booking id';
  end if;

  if p_plans is null or jsonb_typeof(p_plans) <> 'array' then
    raise exception 'Plans must be a JSON array';
  end if;

  v_club_id := public.get_my_club_id();
  -- SAT-08: only active test-account owners may mutate training camp plans.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    raise exception 'Test account expired or not eligible for this club'
      using errcode='42501';
  end if;
  v_current_game_date := public.get_current_game_date_date();

  if v_current_game_date is null then
    raise exception 'Current game date not found';
  end if;

  select
    b.id,
    b.club_id,
    b.start_date,
    b.end_date,
    b.status
  into v_booking
  from public.training_camp_bookings b
  where b.id = p_booking_id
    and b.club_id = v_club_id
  limit 1;

  if not found then
    raise exception 'Training camp booking not found';
  end if;

  for v_plan in
    select *
    from jsonb_to_recordset(p_plans) as x(
      rider_id uuid,
      plan_date date,
      intensity text
    )
  loop
    if v_plan.rider_id is null or v_plan.plan_date is null then
      raise exception 'Invalid training plan row';
    end if;

    if v_plan.intensity not in ('day_off', 'light', 'normal', 'hard') then
      raise exception 'Invalid intensity: %', v_plan.intensity;
    end if;

    if v_plan.plan_date <= v_current_game_date then
      raise exception 'Training plan for % is already locked', v_plan.plan_date;
    end if;

    if v_plan.plan_date > (v_current_game_date + interval '3 days')::date then
      raise exception 'Only the next 3 days can be planned';
    end if;

    if v_plan.plan_date < v_booking.start_date or v_plan.plan_date > v_booking.end_date then
      raise exception 'Plan date % is outside this training camp', v_plan.plan_date;
    end if;

    insert into public.training_camp_day_training_plans (
      booking_id,
      rider_id,
      plan_date,
      intensity,
      created_by,
      updated_by,
      updated_at
    )
    values (
      p_booking_id,
      v_plan.rider_id,
      v_plan.plan_date,
      v_plan.intensity,
      auth.uid(),
      auth.uid(),
      now()
    )
    on conflict (booking_id, rider_id, plan_date)
    do update set
      intensity = excluded.intensity,
      updated_by = auth.uid(),
      updated_at = now();

    v_saved_count := v_saved_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'saved_count', v_saved_count
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.set_regular_training_coach_automation_v1(p_club_id uuid, p_enabled boolean, p_manager_staff_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_type text;
  v_parent_club_id uuid;
  v_expected_role text;
  v_staff record;
  v_generation jsonb;
  v_academy_level integer := 0;
begin
  -- SAT-08: protect state-changing rider/coach settings at the server.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not eligible for this club'
      using errcode='42501';
  end if;
  if not public.can_manage_club_training_v1(p_club_id) then
    raise exception 'You do not have permission to manage training for this team.';
  end if;

  select c.club_type, c.parent_club_id
  into v_club_type, v_parent_club_id
  from public.clubs c
  where c.id = p_club_id;

  if not found then raise exception 'Club not found.'; end if;

  v_expected_role := case
    when v_club_type = 'developing' then 'u23_head_coach'
    else 'head_coach'
  end;

  if coalesce(p_enabled,false)
     and not public.user_has_premium_access_v1(
       (select owner_club.owner_user_id
        from public.clubs owner_club
        where owner_club.id=coalesce(v_parent_club_id,p_club_id))
     ) then
    raise exception 'Active Premium access is required for Head Coach automation.';
  end if;

  if v_club_type = 'developing' then
    select coalesce(e.youth_academy_level, 0)
    into v_academy_level
    from public.get_youth_academy_effects(p_club_id) e
    limit 1;
  end if;

  if coalesce(p_enabled, false) and v_expected_role = 'u23_head_coach' and coalesce(v_academy_level, 0) < 1 then
    raise exception 'Youth Academy Lv 1 is required before U23 Head Coach training automation can be enabled.';
  end if;

  if coalesce(p_enabled, false) then
    if p_manager_staff_id is null then
      raise exception 'Select an active % before enabling automation.', replace(v_expected_role, '_', ' ');
    end if;

    select
      cs.id, cs.club_id, cs.staff_name, cs.role_type, cs.team_scope, cs.is_active
    into v_staff
    from public.club_staff cs
    where cs.id = p_manager_staff_id
      and cs.is_active = true
      and cs.role_type = v_expected_role
      and cs.club_id in (p_club_id, coalesce(v_parent_club_id, p_club_id))
      and (
        (v_expected_role = 'head_coach' and cs.team_scope in ('first_team', 'all'))
        or
        (v_expected_role = 'u23_head_coach' and cs.team_scope in ('u23', 'all'))
      )
    limit 1;

    if not found then
      raise exception 'The selected staff member is not an active % available for this team.', replace(v_expected_role, '_', ' ');
    end if;
  end if;

  insert into public.club_regular_training_automation (
    club_id, manager_staff_id, manager_role, is_enabled, planning_mode,
    horizon_days, metadata, created_at, updated_at
  )
  values (
    p_club_id,
    p_manager_staff_id,
    v_expected_role,
    coalesce(p_enabled, false),
    'rolling_daily',
    3,
    jsonb_build_object(
      'configured_by_user_id', auth.uid(),
      'configured_at', now(),
      'generator_version', 'head_coach_three_day_generator_v1',
      'generator_installed', true
    ),
    now(),
    now()
  )
  on conflict (club_id)
  do update set
    manager_staff_id = excluded.manager_staff_id,
    manager_role = excluded.manager_role,
    is_enabled = excluded.is_enabled,
    planning_mode = 'rolling_daily',
    horizon_days = 3,
    metadata = public.club_regular_training_automation.metadata || excluded.metadata,
    updated_at = now();

  if coalesce(p_enabled, false) then
    v_generation := public.generate_coach_regular_training_plan_v1(
      p_club_id,
      public.get_current_game_date_date()
    );
  else
    update public.rider_regular_training_daily_plans
    set
      status = 'superseded',
      decision_reason_json = coalesce(decision_reason_json, '{}'::jsonb) || jsonb_build_object(
        'superseded_reason', 'automation_disabled',
        'superseded_at', now()
      ),
      updated_at = now()
    where club_id = p_club_id
      and plan_date >= public.get_current_game_date_date()
      and source_type in ('head_coach', 'u23_head_coach')
      and status = 'planned';

    v_generation := jsonb_build_object(
      'ok', true,
      'generated', false,
      'reason', 'automation_disabled'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'is_enabled', coalesce(p_enabled, false),
    'manager_staff_id', p_manager_staff_id,
    'manager_role', v_expected_role,
    'planning_mode', 'rolling_daily',
    'horizon_days', 3,
    'generator_installed', true,
    'generation', v_generation
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.set_rider_daily_training_override_v1(p_club_id uuid, p_rider_id uuid, p_plan_date date, p_focus_code text, p_intensity text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date;
  v_saved_intensity text;
  v_generation jsonb;

  v_availability_status text;
  v_has_existing_activity boolean;
  v_has_health_block boolean;
  v_has_training_camp boolean;
  v_has_race_commitment boolean;
begin
  -- SAT-08: protect state-changing rider/coach settings at the server.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not eligible for this club'
      using errcode='42501';
  end if;
  if not public.can_manage_club_training_v1(p_club_id) then
    raise exception
      'You do not have permission to manage training for this team.';
  end if;

  if not exists (
    select 1
    from public.club_riders cr
    where cr.club_id = p_club_id
      and cr.rider_id = p_rider_id
  ) then
    raise exception 'Rider does not belong to this team.';
  end if;

  v_today := public.get_current_game_date_date();

  if v_today is null then
    raise exception 'Current game date could not be resolved.';
  end if;

  if p_plan_date < v_today
     or p_plan_date > v_today + 2 then
    raise exception
      'A one-day override must be inside Today, Tomorrow or Day +2.';
  end if;

  if p_focus_code not in (
    'general',
    'recovery',
    'sprint',
    'climbing',
    'flat',
    'time_trial',
    'endurance',
    'resistance',
    'race_iq',
    'teamwork',
    'day_off'
  ) then
    raise exception 'Invalid regular-training focus.';
  end if;

  if p_intensity not in (
    'recovery',
    'light',
    'normal',
    'hard'
  ) then
    raise exception 'Invalid regular-training intensity.';
  end if;

  select
    coalesce(r.availability_status, 'fit')
  into v_availability_status
  from public.riders r
  where r.id = p_rider_id;

  v_has_existing_activity := exists (
    select 1
    from public.rider_daily_activity a
    where a.rider_id = p_rider_id
      and a.activity_date = p_plan_date
  );

  v_has_health_block := exists (
    select 1
    from public.rider_health_cases hc
    where hc.rider_id = p_rider_id
      and hc.status in ('active', 'recovering')
      and hc.training_blocked = true
      and p_plan_date between
        hc.started_on
        and coalesce(
          hc.recovery_until,
          hc.active_until
        )
  );

  v_has_training_camp := exists (
    select 1
    from public.training_camp_participants tcp
    join public.training_camp_bookings tcb
      on tcb.id = tcp.booking_id
    where tcp.rider_id = p_rider_id
      and tcb.status in ('planned', 'active')
      and p_plan_date between
        tcb.start_date
        and tcb.end_date
  );

  v_has_race_commitment := exists (
    select 1
    from public.race_preparation_riders rpr
    join public.race_preparations rp
      on rp.id = rpr.race_preparation_id
    join public.races rr
      on rr.id = rp.race_id
    where rpr.rider_id = p_rider_id
      and rp.participating_club_id = p_club_id
      and rp.status in ('submitted', 'locked')
      and p_plan_date between rr.start_date and rr.end_date
      and exists (
        select 1
        from public.race_stages rs
        where rs.race_id = rr.id
          and coalesce(rs.weather_cancelled, false) = false
      )
  );

  if v_has_existing_activity then
    raise exception
      'This rider already has an activity on the selected game date.';
  end if;

  if p_plan_date = v_today
     and v_availability_status in ('injured', 'sick') then
    raise exception
      'This rider is currently unavailable for regular training.';
  end if;

  if v_has_health_block then
    raise exception
      'A health case blocks regular training on the selected game date.';
  end if;

  if v_has_training_camp then
    raise exception
      'Training camp controls this rider on the selected game date.';
  end if;

  if v_has_race_commitment then
    raise exception
      'Race commitment controls this rider on the selected game date.';
  end if;

  v_saved_intensity :=
    case
      when p_focus_code = 'day_off'
        then 'normal'
      when p_focus_code = 'recovery'
           and p_intensity = 'hard'
        then 'normal'
      else p_intensity
    end;

  insert into public.rider_regular_training_daily_plans (
    club_id,
    rider_id,
    plan_date,
    focus_code,
    intensity,
    source_type,
    source_staff_id,
    status,
    decision_reason_json,
    generated_on_game_date,
    generated_at,
    updated_at
  )
  values (
    p_club_id,
    p_rider_id,
    p_plan_date,
    p_focus_code,
    v_saved_intensity,
    'manual_override',
    null,
    'planned',
    jsonb_build_object(
      'version', 'manual_one_day_override_v1',
      'entered_by_user_id', auth.uid(),
      'entered_at', now(),
      'coach_resumes_after_date', p_plan_date + 1
    ),
    v_today,
    now(),
    now()
  )
  on conflict (
    club_id,
    rider_id,
    plan_date
  )
  do update
  set
    focus_code = excluded.focus_code,
    intensity = excluded.intensity,
    source_type = 'manual_override',
    source_staff_id = null,
    status = 'planned',
    decision_quality_score = null,
    coach_availability_factor = null,
    fatigue_snapshot = null,
    availability_status_snapshot = null,
    projected_fatigue_after = null,
    decision_reason_json = excluded.decision_reason_json,
    generated_on_game_date = excluded.generated_on_game_date,
    generated_at = excluded.generated_at,
    consumed_at = null,
    updated_at = now();

  v_generation :=
    public.generate_coach_regular_training_plan_v1(
      p_club_id,
      v_today
    );

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'rider_id', p_rider_id,
    'plan_date', p_plan_date,
    'focus_code', p_focus_code,
    'intensity', v_saved_intensity,
    'source_type', 'manual_override',
    'coach_resumes_after_date', p_plan_date + 1,
    'generation', v_generation
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.set_rider_regular_training_management_v1(p_club_id uuid, p_rider_id uuid, p_management_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_generation jsonb;
begin
  -- SAT-08: protect state-changing rider/coach settings at the server.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(p_club_id) then
    raise exception 'Test account expired or not eligible for this club'
      using errcode='42501';
  end if;
  if not public.can_manage_club_training_v1(p_club_id) then
    raise exception
      'You do not have permission to manage training for this team.';
  end if;

  if p_management_mode not in (
    'inherit',
    'coach',
    'manual'
  ) then
    raise exception 'Invalid management mode.';
  end if;

  if not exists (
    select 1
    from public.club_riders cr
    where cr.club_id = p_club_id
      and cr.rider_id = p_rider_id
  ) then
    raise exception 'Rider does not belong to this team.';
  end if;

  insert into public.rider_regular_training_management (
    club_id,
    rider_id,
    management_mode,
    updated_by_user_id,
    metadata,
    created_at,
    updated_at
  )
  values (
    p_club_id,
    p_rider_id,
    p_management_mode,
    auth.uid(),
    jsonb_build_object(
      'changed_at', now()
    ),
    now(),
    now()
  )
  on conflict (club_id, rider_id)
  do update
  set
    management_mode = excluded.management_mode,
    updated_by_user_id = excluded.updated_by_user_id,
    metadata =
      public.rider_regular_training_management.metadata
      || excluded.metadata,
    updated_at = now();

  if p_management_mode = 'manual' then
    update public.rider_regular_training_daily_plans
    set
      status = 'superseded',
      decision_reason_json =
        coalesce(decision_reason_json, '{}'::jsonb)
        || jsonb_build_object(
          'superseded_reason', 'rider_is_manually_managed',
          'superseded_at', now()
        ),
      updated_at = now()
    where club_id = p_club_id
      and rider_id = p_rider_id
      and plan_date >= public.get_current_game_date_date()
      and source_type in ('head_coach', 'u23_head_coach')
      and status = 'planned';

    v_generation := jsonb_build_object(
      'ok', true,
      'generated', false,
      'reason', 'rider_is_manually_managed'
    );
  else
    v_generation :=
      public.generate_coach_regular_training_plan_v1(
        p_club_id,
        public.get_current_game_date_date()
      );
  end if;

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'rider_id', p_rider_id,
    'management_mode', p_management_mode,
    'generation', v_generation
  );
end;
$function$;


