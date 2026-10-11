-- Both main and U23 Head Coach automation require live Premium access.
-- Expired trials disable future generated plans, leaving manual training intact.
CREATE OR REPLACE FUNCTION public.generate_coach_regular_training_plan_v1(p_club_id uuid, p_anchor_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_anchor_date date;
  v_through_date date;

  v_setting public.club_regular_training_automation%rowtype;
  v_club_type text;
  v_parent_club_id uuid;
  v_expected_role text;

  v_staff public.club_staff%rowtype;
  v_staff_factor numeric;
  v_has_active_course boolean;

  v_generated integer := 0;
  v_skipped integer := 0;
  v_manual_preserved integer := 0;
  v_manual_riders integer := 0;
  v_managed_riders integer := 0;

  r record;

  v_management_mode text;
  v_plan_date date;
  v_day_offset integer;
  v_existing_source text;
  v_existing_focus text;
  v_existing_intensity text;

  v_age integer;
  v_quality numeric;
  v_training_score numeric;
  v_recovery_planning_score numeric;
  v_youth_score numeric;
  v_experience_score numeric;
  v_leadership_score numeric;
  v_loyalty_score numeric;

  v_specialization_focus text;
  v_preferred_focus text;
  v_focus_candidates text[];
  v_primary_focus text;
  v_target_focus text;
  v_focus_code text;
  v_intensity text;

  v_status text;
  v_block_reason text;
  v_has_existing_activity boolean;
  v_has_health_block boolean;
  v_has_training_camp boolean;
  v_has_race_commitment boolean;
  v_has_upcoming_race boolean;
  v_previous_external_load boolean := false;

  v_projected_fatigue integer;
  v_projected_after integer;
  v_fatigue_load integer;
  v_recovery_bonus integer;
  v_daily_recovery integer;
  v_projected_heavy_days integer;
  v_heavy_bonus integer;
  v_hard_used boolean;

  v_reason jsonb;
begin
  v_anchor_date :=
    coalesce(
      p_anchor_date,
      public.get_current_game_date_date()
    );

  if v_anchor_date is null then
    raise exception
      'generate_coach_regular_training_plan_v1: game date is missing';
  end if;

  v_through_date := v_anchor_date + 2;

  select
    a.*
  into v_setting
  from public.club_regular_training_automation a
  where a.club_id = p_club_id;

  if not found
     or coalesce(v_setting.is_enabled, false) = false then
    return jsonb_build_object(
      'ok', true,
      'generated', false,
      'reason', 'automation_disabled',
      'club_id', p_club_id,
      'anchor_date', v_anchor_date,
      'through_date', v_through_date
    );
  end if;

  select
    c.club_type,
    c.parent_club_id
  into
    v_club_type,
    v_parent_club_id
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null;

  if not found then
    raise exception 'Club not found.';
  end if;

  v_expected_role :=
    case
      when v_club_type = 'developing'
        then 'u23_head_coach'
      else 'head_coach'
    end;

  if not public.user_has_premium_access_v1(
       (
         select owner_club.owner_user_id
         from public.clubs owner_club
         where owner_club.id = coalesce(v_parent_club_id, p_club_id)
       )
     ) then
    update public.club_regular_training_automation
    set
      is_enabled = false,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'premium_access_required', true,
          'disabled_reason', 'premium_trial_or_membership_expired',
          'disabled_at', now()
        ),
      updated_at = now()
    where club_id = p_club_id;

    update public.rider_regular_training_daily_plans
    set
      status = 'superseded',
      decision_reason_json = coalesce(decision_reason_json, '{}'::jsonb)
        || jsonb_build_object(
          'superseded_reason', 'premium_trial_or_membership_expired',
          'superseded_at', now()
        ),
      updated_at = now()
    where club_id = p_club_id
      and plan_date >= v_anchor_date
      and source_type in ('u23_head_coach', 'head_coach')
      and status = 'planned';

    return jsonb_build_object(
      'ok', false,
      'generated', false,
      'reason', 'premium_required',
      'club_id', p_club_id,
      'expected_role', v_expected_role
    );
  end if;

  if v_setting.manager_role <> v_expected_role then
    raise exception
      'Configured manager role % does not match expected role %.',
      v_setting.manager_role,
      v_expected_role;
  end if;

  select
    cs.*
  into v_staff
  from public.club_staff cs
  where cs.id = v_setting.manager_staff_id
    and cs.is_active = true
    and cs.role_type = v_expected_role
    and cs.club_id in (
      p_club_id,
      coalesce(v_parent_club_id, p_club_id)
    )
    and (
      (
        v_expected_role = 'head_coach'
        and cs.team_scope in ('first_team', 'all')
      )
      or
      (
        v_expected_role = 'u23_head_coach'
        and cs.team_scope in ('u23', 'all')
      )
    )
  limit 1;

  if not found then
    update public.club_regular_training_automation
    set
      last_generated_game_date = v_anchor_date,
      last_generated_through = v_through_date,
      last_generation_summary = jsonb_build_object(
        'ok', false,
        'reason', 'active_manager_not_found',
        'expected_role', v_expected_role
      ),
      updated_at = now()
    where club_id = p_club_id;

    return jsonb_build_object(
      'ok', false,
      'generated', false,
      'reason', 'active_manager_not_found',
      'expected_role', v_expected_role
    );
  end if;

  -- Old automatic forecasts outside the new rolling window are obsolete.
  update public.rider_regular_training_daily_plans p
  set
    status = 'superseded',
    decision_reason_json =
      coalesce(p.decision_reason_json, '{}'::jsonb)
      || jsonb_build_object(
        'superseded_reason', 'outside_new_rolling_window',
        'superseded_at', now()
      ),
    updated_at = now()
  where p.club_id = p_club_id
    and p.plan_date > v_through_date
    and p.source_type in ('head_coach', 'u23_head_coach')
    and p.status = 'planned';

  for r in
    select
      rd.id as rider_id,
      rd.birth_date,
      coalesce(rd.availability_status, 'fit') as availability_status,
      greatest(0, least(100, coalesce(rd.fatigue, 0)))::integer as fatigue,
      greatest(0, least(100, coalesce(rd.recovery, 50)))::integer as recovery_stat,
      greatest(0, least(100, coalesce(rd.morale, 50)))::integer as morale_value,
      greatest(0, coalesce(rd.consecutive_heavy_days, 0))::integer
        as consecutive_heavy_days,

      greatest(0, least(100, coalesce(rd.sprint, 50)))::integer as sprint,
      greatest(0, least(100, coalesce(rd.climbing, 50)))::integer as climbing,
      greatest(0, least(100, coalesce(rd.flat, 50)))::integer as flat,
      greatest(0, least(100, coalesce(rd.time_trial, 50)))::integer as time_trial,
      greatest(0, least(100, coalesce(rd.endurance, 50)))::integer as endurance,
      greatest(0, least(100, coalesce(rd.resistance, 50)))::integer as resistance,
      greatest(0, least(100, coalesce(rd.race_iq, 50)))::integer as race_iq,
      greatest(0, least(100, coalesce(rd.teamwork, 50)))::integer as teamwork,

      cr.assigned_role::text as assigned_role,

      rp.focus_code as preferred_focus_code
    from public.club_riders cr
    join public.riders rd
      on rd.id = cr.rider_id
    left join lateral (
      select
        p.focus_code
      from public.rider_regular_training_plans p
      where p.club_id = p_club_id
        and p.rider_id = rd.id
        and coalesce(p.is_active, true) = true
      order by
        p.updated_at desc nulls last,
        p.created_at desc nulls last
      limit 1
    ) rp on true
    where cr.club_id = p_club_id
    order by rd.id
  loop
    select
      m.management_mode
    into v_management_mode
    from public.rider_regular_training_management m
    where m.club_id = p_club_id
      and m.rider_id = r.rider_id;

    v_management_mode :=
      coalesce(v_management_mode, 'inherit');

    if v_management_mode = 'manual' then
      v_manual_riders := v_manual_riders + 1;

      update public.rider_regular_training_daily_plans p
      set
        status = 'superseded',
        decision_reason_json =
          coalesce(p.decision_reason_json, '{}'::jsonb)
          || jsonb_build_object(
            'superseded_reason', 'rider_is_manually_managed',
            'superseded_at', now()
          ),
        updated_at = now()
      where p.club_id = p_club_id
        and p.rider_id = r.rider_id
        and p.plan_date between v_anchor_date and v_through_date
        and p.source_type in ('head_coach', 'u23_head_coach')
        and p.status = 'planned';

      continue;
    end if;

    v_managed_riders := v_managed_riders + 1;
    v_projected_fatigue := r.fatigue;
    v_projected_heavy_days := r.consecutive_heavy_days;
    v_hard_used := false;
    v_previous_external_load := false;

    v_age :=
      case
        when r.birth_date is null then 25
        else extract(
          year from age(v_anchor_date, r.birth_date)
        )::integer
      end;

    v_preferred_focus :=
      case
        when r.preferred_focus_code in (
          'general',
          'sprint',
          'climbing',
          'flat',
          'time_trial',
          'endurance',
          'resistance',
          'race_iq',
          'teamwork'
        )
        then r.preferred_focus_code
        else null
      end;

    v_specialization_focus :=
      case
        when lower(coalesce(v_staff.specialization, '')) like '%sprint%'
          then 'sprint'
        when lower(coalesce(v_staff.specialization, '')) like '%climb%'
          or lower(coalesce(v_staff.specialization, '')) like '%mountain%'
          then 'climbing'
        when lower(coalesce(v_staff.specialization, '')) like '%time trial%'
          or lower(coalesce(v_staff.specialization, '')) like '%tt%'
          then 'time_trial'
        when lower(coalesce(v_staff.specialization, '')) like '%endurance%'
          then 'endurance'
        when lower(coalesce(v_staff.specialization, '')) like '%flat%'
          then 'flat'
        when lower(coalesce(v_staff.specialization, '')) like '%team%'
          then 'teamwork'
        else null
      end;

    for v_day_offset in 0..2
    loop
      v_plan_date := v_anchor_date + v_day_offset;

      v_existing_source := null;
      v_existing_focus := null;
      v_existing_intensity := null;

      select
        p.source_type,
        p.focus_code,
        p.intensity
      into
        v_existing_source,
        v_existing_focus,
        v_existing_intensity
      from public.rider_regular_training_daily_plans p
      where p.club_id = p_club_id
        and p.rider_id = r.rider_id
        and p.plan_date = v_plan_date;


      v_has_existing_activity := exists (
        select 1
        from public.rider_daily_activity a
        where a.rider_id = r.rider_id
          and a.activity_date = v_plan_date
      );

      v_has_health_block := exists (
        select 1
        from public.rider_health_cases hc
        where hc.rider_id = r.rider_id
          and hc.status in ('active', 'recovering')
          and hc.training_blocked = true
          and v_plan_date between
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
        where tcp.rider_id = r.rider_id
          and tcb.status in ('planned', 'active')
          and v_plan_date between
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
        where rpr.rider_id = r.rider_id
          and rp.participating_club_id = p_club_id
          and rp.status in ('submitted', 'locked')
          and v_plan_date between rr.start_date and rr.end_date
          and exists (
            select 1
            from public.race_stages rs
            where rs.race_id = rr.id
              and coalesce(rs.weather_cancelled, false) = false
          )
      );

      v_has_upcoming_race := exists (
        select 1
        from public.race_preparation_riders rpr
        join public.race_preparations rp
          on rp.id = rpr.race_preparation_id
        join public.races rr
          on rr.id = rp.race_id
        where rpr.rider_id = r.rider_id
          and rp.participating_club_id = p_club_id
          and rp.status in ('submitted', 'locked')
          and rr.start_date between
            v_plan_date
            and v_plan_date + 2
          and exists (
            select 1
            from public.race_stages rs
            where rs.race_id = rr.id
              and coalesce(rs.weather_cancelled, false) = false
          )
      );

      v_status := 'planned';
      v_block_reason := null;
      v_focus_code := null;
      v_intensity := null;

      if v_has_existing_activity then
        v_status := 'skipped';
        v_block_reason := 'activity_already_exists';

      elsif v_day_offset = 0
        and r.availability_status in ('injured', 'sick') then
        v_status := 'skipped';
        v_block_reason := 'rider_unavailable';

      elsif v_has_health_block then
        v_status := 'skipped';
        v_block_reason := 'health_case_blocks_training';

      elsif v_has_training_camp then
        v_status := 'skipped';
        v_block_reason := 'training_camp_controls_activity';

      elsif v_has_race_commitment then
        v_status := 'skipped';
        v_block_reason := 'race_commitment_controls_activity';
      end if;


      if v_existing_source = 'manual_override' then
        if v_status <> 'planned' then
          update public.rider_regular_training_daily_plans p
          set
            status = 'skipped',
            decision_reason_json =
              coalesce(p.decision_reason_json, '{}'::jsonb)
              || jsonb_build_object(
                'blocked_after_override',
                  true,
                'block_reason',
                  v_block_reason,
                'blocked_at',
                  now()
              ),
            updated_at = now()
          where p.club_id = p_club_id
            and p.rider_id = r.rider_id
            and p.plan_date = v_plan_date
            and p.source_type = 'manual_override';

          v_skipped := v_skipped + 1;

          if v_block_reason in (
            'training_camp_controls_activity',
            'race_commitment_controls_activity',
            'activity_already_exists'
          ) then
            v_previous_external_load := true;
          end if;

          continue;
        end if;

        v_manual_preserved := v_manual_preserved + 1;

        if v_existing_focus = 'day_off' then
          v_fatigue_load := 0;
          v_recovery_bonus := 3;

        elsif v_existing_focus = 'recovery' then
          v_fatigue_load := 0;
          v_recovery_bonus := 2;

        elsif v_existing_intensity = 'light' then
          v_fatigue_load := 6;
          v_recovery_bonus := 0;

        elsif v_existing_intensity = 'hard' then
          v_fatigue_load := 14;
          v_recovery_bonus := 0;
          v_hard_used := true;

        else
          v_fatigue_load := 10;
          v_recovery_bonus := 0;
        end if;

        if v_fatigue_load >= 13 then
          v_projected_heavy_days :=
            v_projected_heavy_days + 1;
        else
          v_projected_heavy_days := 0;
        end if;

        v_heavy_bonus :=
          case
            when v_projected_heavy_days <= 1 then 0
            when v_projected_heavy_days = 2 then 3
            when v_projected_heavy_days = 3 then 6
            else 9
          end;

        v_daily_recovery := round(
          6
          + (r.recovery_stat * 0.1)
          + case
              when v_fatigue_load = 0 then 2
              else 0
            end
          + case
              when r.morale_value >= 80 then 1
              else 0
            end
          - case
              when r.morale_value < 40 then 1
              else 0
            end
          - case
              when v_age >= 31 then 1
              else 0
            end
        )::integer;

        v_daily_recovery :=
          greatest(3, v_daily_recovery)
          + v_recovery_bonus;

        v_projected_fatigue :=
          greatest(
            0,
            least(
              100,
              round(
                v_projected_fatigue
                + v_fatigue_load
                + v_heavy_bonus
                - v_daily_recovery
              )::integer
            )
          );

        v_previous_external_load := false;
        continue;
      end if;

      v_staff_factor :=
        coalesce(
          public.get_staff_assignment_availability_factor(
            v_staff.id,
            v_plan_date
          ),
          1.0
        );

      select exists (
        select 1
        from public.staff_courses sc
        where sc.staff_id = v_staff.id
          and sc.status = 'active'
          and sc.started_game_date <= v_plan_date
          and sc.completes_on_game_date >= v_plan_date
      )
      into v_has_active_course;

      if v_has_active_course then
        v_staff_factor := 0;
      end if;

      v_staff_factor :=
        greatest(
          0,
          least(1, v_staff_factor)
        );

      if v_status = 'planned'
         and v_staff_factor <= 0 then
        v_status := 'skipped';
        v_block_reason := 'head_coach_unavailable';
      end if;

      v_training_score :=
        greatest(0, least(100, v_staff.expertise));
      v_recovery_planning_score :=
        greatest(0, least(100, v_staff.efficiency));
      v_youth_score :=
        greatest(0, least(100, v_staff.potential));
      v_experience_score :=
        greatest(0, least(100, v_staff.experience));
      v_leadership_score :=
        greatest(0, least(100, v_staff.leadership));
      v_loyalty_score :=
        greatest(0, least(100, v_staff.loyalty));

      if v_age <= 23 then
        v_quality := round(
          (
            v_training_score * 0.30
            + v_recovery_planning_score * 0.25
            + v_youth_score * 0.20
            + v_experience_score * 0.10
            + v_leadership_score * 0.10
            + v_loyalty_score * 0.05
          )
          * v_staff_factor,
          2
        );
      else
        v_quality := round(
          (
            v_training_score * 0.35
            + v_recovery_planning_score * 0.25
            + v_experience_score * 0.20
            + v_leadership_score * 0.15
            + v_loyalty_score * 0.05
          )
          * v_staff_factor,
          2
        );
      end if;

      v_primary_focus :=
        case r.assigned_role
          when 'Leader' then 'climbing'
          when 'Sprinter' then 'sprint'
          when 'Climber' then 'climbing'
          when 'TT' then 'time_trial'
          when 'Domestique' then 'teamwork'
          when 'Breakaway' then 'endurance'
          else 'general'
        end;

      v_focus_candidates :=
        case r.assigned_role
          when 'Leader' then
            array[
              'climbing',
              'endurance',
              'resistance',
              'race_iq',
              'time_trial'
            ]
          when 'Sprinter' then
            array[
              'sprint',
              'flat',
              'teamwork',
              'endurance',
              'resistance'
            ]
          when 'Climber' then
            array[
              'climbing',
              'endurance',
              'resistance',
              'race_iq'
            ]
          when 'TT' then
            array[
              'time_trial',
              'flat',
              'endurance',
              'resistance'
            ]
          when 'Domestique' then
            array[
              'teamwork',
              'endurance',
              'flat',
              'resistance',
              'race_iq'
            ]
          when 'Breakaway' then
            array[
              'endurance',
              'resistance',
              'flat',
              'race_iq',
              'climbing'
            ]
          else
            array[
              'sprint',
              'climbing',
              'flat',
              'time_trial',
              'endurance',
              'resistance',
              'race_iq',
              'teamwork'
            ]
        end;

      if v_preferred_focus is not null then
        v_target_focus := v_preferred_focus;

      elsif v_quality < 45 then
        v_target_focus := 'general';

      elsif v_quality < 65 then
        if v_specialization_focus = any(v_focus_candidates) then
          v_target_focus := v_specialization_focus;
        else
          v_target_focus := v_primary_focus;
        end if;

      else
        select
          x.focus_code
        into v_target_focus
        from (
          values
            ('sprint', r.sprint),
            ('climbing', r.climbing),
            ('flat', r.flat),
            ('time_trial', r.time_trial),
            ('endurance', r.endurance),
            ('resistance', r.resistance),
            ('race_iq', r.race_iq),
            ('teamwork', r.teamwork)
        ) as x(focus_code, skill_value)
        where x.focus_code = any(v_focus_candidates)
        order by
          x.skill_value asc,
          case
            when x.focus_code = v_specialization_focus then 0
            else 1
          end,
          x.focus_code
        limit 1;
      end if;

      if v_status = 'planned' then
        if v_projected_fatigue >= 70 then
          v_focus_code := 'day_off';
          v_intensity := 'normal';

        elsif v_projected_fatigue >= 60 then
          v_focus_code := 'recovery';
          v_intensity := 'normal';

        elsif v_previous_external_load then
          v_focus_code := 'recovery';
          v_intensity := 'normal';

        elsif v_has_upcoming_race
          and v_projected_fatigue >= 35 then
          v_focus_code := 'recovery';
          v_intensity := 'normal';

        elsif v_has_upcoming_race then
          v_focus_code :=
            coalesce(v_target_focus, 'general');
          v_intensity := 'light';

        elsif v_projected_fatigue >= 50
          and v_recovery_planning_score >= 65 then
          v_focus_code := 'recovery';
          v_intensity := 'normal';

        elsif v_projected_fatigue >= 45 then
          v_focus_code :=
            coalesce(v_target_focus, 'general');
          v_intensity := 'light';

        elsif
          v_quality >= 85
          and v_recovery_planning_score >= 80
          and v_training_score >= 75
          and v_projected_fatigue <= 15
          and v_staff_factor >= 0.75
          and v_hard_used = false
        then
          v_focus_code :=
            coalesce(v_target_focus, 'general');
          v_intensity := 'hard';
          v_hard_used := true;

        else
          v_focus_code :=
            coalesce(v_target_focus, 'general');
          v_intensity := 'normal';
        end if;

        if v_focus_code = 'day_off' then
          v_fatigue_load := 0;
          v_recovery_bonus := 3;

        elsif v_focus_code = 'recovery' then
          v_fatigue_load := 0;
          v_recovery_bonus := 2;

        elsif v_intensity = 'light' then
          v_fatigue_load := 6;
          v_recovery_bonus := 0;

        elsif v_intensity = 'normal' then
          v_fatigue_load := 10;
          v_recovery_bonus := 0;

        else
          v_fatigue_load := 14;
          v_recovery_bonus := 0;
        end if;

        if v_fatigue_load >= 13 then
          v_projected_heavy_days :=
            v_projected_heavy_days + 1;
        else
          v_projected_heavy_days := 0;
        end if;

        v_heavy_bonus :=
          case
            when v_projected_heavy_days <= 1 then 0
            when v_projected_heavy_days = 2 then 3
            when v_projected_heavy_days = 3 then 6
            else 9
          end;

        v_daily_recovery := round(
          6
          + (r.recovery_stat * 0.1)
          + case
              when v_fatigue_load = 0 then 2
              else 0
            end
          + case
              when r.morale_value >= 80 then 1
              else 0
            end
          - case
              when r.morale_value < 40 then 1
              else 0
            end
          - case
              when v_age >= 31 then 1
              else 0
            end
        )::integer;

        v_daily_recovery :=
          greatest(3, v_daily_recovery)
          + v_recovery_bonus;

        v_projected_after :=
          greatest(
            0,
            least(
              100,
              round(
                v_projected_fatigue
                + v_fatigue_load
                + v_heavy_bonus
                - v_daily_recovery
              )::integer
            )
          );

        v_previous_external_load := false;
      else
        v_projected_after := v_projected_fatigue;

        if v_block_reason in (
          'training_camp_controls_activity',
          'race_commitment_controls_activity',
          'activity_already_exists'
        ) then
          v_previous_external_load := true;
        end if;
      end if;

      v_reason := jsonb_build_object(
        'version',
          'head_coach_three_day_generator_v1',
        'rolling_horizon_days',
          3,
        'day_offset',
          v_day_offset,
        'management_mode',
          v_management_mode,
        'block_reason',
          v_block_reason,
        'assigned_role',
          r.assigned_role,
        'coach_specialization',
          v_staff.specialization,
        'specialization_focus',
          v_specialization_focus,
        'preferred_focus',
          v_preferred_focus,
        'selected_focus',
          v_focus_code,
        'selected_intensity',
          v_intensity,
        'upcoming_race_within_two_days',
          v_has_upcoming_race,
        'previous_external_load',
          v_previous_external_load,
        'fatigue_before',
          v_projected_fatigue,
        'fatigue_after_estimate',
          v_projected_after,
        'coach_scores',
          jsonb_build_object(
            'training',
              v_training_score,
            'recovery_planning',
              v_recovery_planning_score,
            'youth_development',
              v_youth_score,
            'experience',
              v_experience_score,
            'leadership',
              v_leadership_score,
            'loyalty',
              v_loyalty_score,
            'availability_factor',
              v_staff_factor,
            'decision_quality',
              v_quality
          ),
        'forecast_notice',
          'Tomorrow and Day +2 are forecasts and are recalculated every game day.'
      );

      insert into public.rider_regular_training_daily_plans (
        club_id,
        rider_id,
        plan_date,
        focus_code,
        intensity,
        source_type,
        source_staff_id,
        status,
        decision_quality_score,
        coach_availability_factor,
        fatigue_snapshot,
        availability_status_snapshot,
        projected_fatigue_after,
        decision_reason_json,
        generated_on_game_date,
        generated_at,
        consumed_at,
        updated_at
      )
      values (
        p_club_id,
        r.rider_id,
        v_plan_date,
        v_focus_code,
        v_intensity,
        v_expected_role,
        v_staff.id,
        v_status,
        v_quality,
        v_staff_factor,
        v_projected_fatigue::smallint,
        r.availability_status,
        v_projected_after::smallint,
        v_reason,
        v_anchor_date,
        now(),
        null,
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
        source_type = excluded.source_type,
        source_staff_id = excluded.source_staff_id,
        status = excluded.status,
        decision_quality_score =
          excluded.decision_quality_score,
        coach_availability_factor =
          excluded.coach_availability_factor,
        fatigue_snapshot =
          excluded.fatigue_snapshot,
        availability_status_snapshot =
          excluded.availability_status_snapshot,
        projected_fatigue_after =
          excluded.projected_fatigue_after,
        decision_reason_json =
          excluded.decision_reason_json,
        generated_on_game_date =
          excluded.generated_on_game_date,
        generated_at =
          excluded.generated_at,
        consumed_at = null,
        updated_at = now()
      where
        public.rider_regular_training_daily_plans.source_type
          <> 'manual_override';

      if v_status = 'planned' then
        v_generated := v_generated + 1;
        v_projected_fatigue := v_projected_after;
      else
        v_skipped := v_skipped + 1;
      end if;
    end loop;
  end loop;

  update public.club_regular_training_automation
  set
    last_generated_game_date = v_anchor_date,
    last_generated_through = v_through_date,
    last_generation_summary = jsonb_build_object(
      'ok', true,
      'version', 'head_coach_three_day_generator_v1',
      'manager_staff_id', v_staff.id,
      'manager_staff_name', v_staff.staff_name,
      'manager_role', v_expected_role,
      'managed_riders', v_managed_riders,
      'manual_riders', v_manual_riders,
      'planned_rows', v_generated,
      'skipped_rows', v_skipped,
      'manual_overrides_preserved', v_manual_preserved,
      'anchor_date', v_anchor_date,
      'through_date', v_through_date
    ),
    metadata =
      coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'generator_version',
          'head_coach_three_day_generator_v1',
        'generator_installed',
          true
      ),
    updated_at = now()
  where club_id = p_club_id;

  return jsonb_build_object(
    'ok', true,
    'generated', true,
    'version', 'head_coach_three_day_generator_v1',
    'club_id', p_club_id,
    'manager_staff_id', v_staff.id,
    'manager_staff_name', v_staff.staff_name,
    'manager_role', v_expected_role,
    'managed_riders', v_managed_riders,
    'manual_riders', v_manual_riders,
    'planned_rows', v_generated,
    'skipped_rows', v_skipped,
    'manual_overrides_preserved', v_manual_preserved,
    'anchor_date', v_anchor_date,
    'through_date', v_through_date
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