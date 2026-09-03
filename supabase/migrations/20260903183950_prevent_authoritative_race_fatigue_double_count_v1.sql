create or replace function public.process_daily_fatigue()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_game_date date;
  v_processed_date date;
  r record;
  v_club_id uuid;
  v_explicit_load integer;
  v_implicit_legacy_load integer;
  v_total_load integer;
  v_fatigue_load_to_apply integer;
  v_total_recovery_bonus integer;
  v_travel_fatigue_delta integer;
  v_had_heavy_load boolean;
  v_consecutive_heavy_days integer;
  v_consecutive_heavy_bonus integer;
  v_age_years integer;
  v_rested boolean;
  v_training_camp_today boolean;
  v_daily_recovery integer;
  v_new_fatigue integer;
  v_overload_score numeric;
  v_outcome text;
  v_roll numeric;
  v_downtime_roll numeric;
  v_recovery_modifier integer;
  v_open_case_id uuid;
  v_open_case_status text;
  v_case_code text;
  v_severity text;
  v_active_days integer;
  v_recovery_days integer;
  v_fatigue_floor integer;
  v_legacy_status text;
  v_coach_overload_risk_multiplier numeric := 1.0;
  v_doctor_risk_multiplier numeric := 1.0;
  v_doctor_recovery_duration_multiplier numeric := 1.0;
  v_doctor_daily_recovery_bonus integer := 0;
  v_doctor_fatigue_floor_reduction integer := 0;
begin
  v_current_game_date := public.get_current_game_date_date();
  if v_current_game_date is null then
    raise exception 'process_daily_fatigue: could not resolve current game date';
  end if;
  v_processed_date := (v_current_game_date - interval '1 day')::date;

  for r in
    select
      rd.id,
      rd.birth_date,
      coalesce(rd.fatigue, 0) as fatigue,
      rd.fatigue_updated_on,
      coalesce(rd.consecutive_heavy_days, 0) as consecutive_heavy_days,
      rd.unavailable_until,
      rd.unavailable_reason,
      coalesce(rd.recovery, 50) as recovery_stat,
      coalesce(rd.resistance, 50) as resistance_stat,
      coalesce(rd.morale, 50) as morale_value,
      coalesce(rd.availability_status, 'fit') as availability_status,
      club_link.club_id,
      a.participated,
      a.source as activity_source,
      a.source_id as activity_source_id,
      a.activity_type,
      a.intensity,
      coalesce(a.fatigue_load, 0) as fatigue_load,
      coalesce(a.recovery_bonus, 0) as recovery_bonus,
      coalesce(travel.travel_fatigue_delta, 0) as travel_fatigue_delta,
      case
        when a.source = 'race' and a.source_id is not null then exists (
          select 1
          from public.race_stage_authoritative_runs authority
          join public.race_stage_rider_states rider_state
            on rider_state.simulation_run_id = authority.simulation_run_id
           and rider_state.rider_id = rd.id
           and rider_state.stage_status in ('finished', 'dnf', 'otl')
          where authority.stage_id = a.source_id
        )
        else false
      end as authoritative_race_fatigue_applied
    from public.riders rd
    left join lateral (
      select cr.club_id
      from public.club_riders cr
      where cr.rider_id = rd.id
      limit 1
    ) as club_link on true
    left join public.rider_daily_activity a
      on a.rider_id = rd.id
     and a.activity_date = v_processed_date
    left join public.get_rider_travel_fatigue_impacts_for_date_v1(v_processed_date) travel
      on travel.rider_id = rd.id
  loop
    if r.fatigue_updated_on = v_processed_date then
      continue;
    end if;

    v_club_id := r.club_id;
    v_coach_overload_risk_multiplier := 1.0;
    v_doctor_risk_multiplier := 1.0;
    v_doctor_recovery_duration_multiplier := 1.0;
    v_doctor_daily_recovery_bonus := 0;
    v_doctor_fatigue_floor_reduction := 0;

    if v_club_id is not null then
      select overload_risk_multiplier
      into v_coach_overload_risk_multiplier
      from public.get_head_coach_effects(v_club_id);

      select risk_multiplier, recovery_duration_multiplier, daily_recovery_bonus, fatigue_floor_reduction
      into v_doctor_risk_multiplier, v_doctor_recovery_duration_multiplier,
           v_doctor_daily_recovery_bonus, v_doctor_fatigue_floor_reduction
      from public.get_team_doctor_effects(v_club_id);
    end if;

    select hc.id, hc.status
    into v_open_case_id, v_open_case_status
    from public.rider_health_cases hc
    where hc.rider_id = r.id
      and hc.status in ('active', 'recovering')
    order by hc.created_at desc
    limit 1;

    v_explicit_load := coalesce(r.fatigue_load, 0);
    if coalesce(r.participated, false) = true and v_explicit_load = 0 then
      v_implicit_legacy_load := 12;
    else
      v_implicit_legacy_load := 0;
    end if;

    v_total_load := v_explicit_load + v_implicit_legacy_load;

    -- The authoritative Universal finalizer already persists fatigue_after_stage.
    -- Preserve race workload semantics but do not add the same race load twice.
    if coalesce(r.authoritative_race_fatigue_applied, false) then
      v_fatigue_load_to_apply := 0;
    else
      v_fatigue_load_to_apply := v_total_load;
    end if;

    v_total_recovery_bonus := coalesce(r.recovery_bonus, 0);
    v_travel_fatigue_delta := coalesce(r.travel_fatigue_delta, 0);
    v_had_heavy_load := v_total_load >= 13;

    if v_had_heavy_load then
      v_consecutive_heavy_days := coalesce(r.consecutive_heavy_days, 0) + 1;
    else
      v_consecutive_heavy_days := 0;
    end if;

    if v_consecutive_heavy_days <= 1 then
      v_consecutive_heavy_bonus := 0;
    elsif v_consecutive_heavy_days = 2 then
      v_consecutive_heavy_bonus := 3;
    elsif v_consecutive_heavy_days = 3 then
      v_consecutive_heavy_bonus := 6;
    else
      v_consecutive_heavy_bonus := 9;
    end if;

    if r.birth_date is not null then
      v_age_years := extract(year from age(v_processed_date, r.birth_date))::int;
    else
      v_age_years := null;
    end if;

    -- An authoritative race day is still an activity day, never a rest day.
    v_rested := v_total_load = 0;
    v_training_camp_today := r.activity_type = 'training_camp';

    v_daily_recovery := round(
      6
      + (least(greatest(r.recovery_stat, 0), 100) * 0.1)
      + case when v_rested then 2 else 0 end
      + case when r.morale_value >= 80 then 1 else 0 end
      - case when r.morale_value < 40 then 1 else 0 end
      - case when coalesce(v_age_years, 25) >= 31 then 1 else 0 end
      - case when v_training_camp_today then 1 else 0 end
    )::int;

    v_daily_recovery := greatest(3, v_daily_recovery)
      + v_total_recovery_bonus
      + coalesce(v_doctor_daily_recovery_bonus, 0);

    v_new_fatigue := greatest(
      0,
      least(
        100,
        round(
          coalesce(r.fatigue, 0)
          + v_fatigue_load_to_apply
          + v_consecutive_heavy_bonus
          - v_daily_recovery
        )::int
      )
    );

    if v_travel_fatigue_delta > 0 then
      v_new_fatigue := greatest(0, least(100, v_new_fatigue + v_travel_fatigue_delta));
    end if;

    v_outcome := 'none';
    if v_open_case_id is null then
      -- Acute workload remains part of overload risk even though its direct
      -- fatigue increment is already represented by the race engine output.
      v_overload_score := v_new_fatigue
        + v_total_load
        + v_consecutive_heavy_bonus
        - (r.resistance_stat * 0.15)
        - (r.recovery_stat * 0.10);

      v_overload_score := round(
        v_overload_score
        * coalesce(v_coach_overload_risk_multiplier, 1.0)
        * coalesce(v_doctor_risk_multiplier, 1.0)
        * public.health_get_medical_center_risk_multiplier_v1(v_club_id)
        * case
            when r.activity_type = 'training' then public.training_center_training_risk_multiplier_v1(v_club_id)
            else 1.0
          end
      )::int;

      v_roll := random() * 10.0;
      if v_overload_score >= 90 and v_overload_score < 105 then
        if v_roll < 0.01 then v_outcome := 'injury';
        elsif v_roll < 0.02 then v_outcome := 'sickness'; end if;
      elsif v_overload_score >= 105 and v_overload_score < 120 then
        if v_roll < 0.025 then v_outcome := 'injury';
        elsif v_roll < 0.045 then v_outcome := 'sickness'; end if;
      elsif v_overload_score >= 120 then
        if v_roll < 0.05 then v_outcome := 'injury';
        elsif v_roll < 0.08 then v_outcome := 'sickness'; end if;
      end if;
    end if;

    if v_open_case_id is not null then
      update public.riders
      set fatigue = v_new_fatigue,
          fatigue_updated_on = v_processed_date,
          consecutive_heavy_days = v_consecutive_heavy_days
      where id = r.id;

    elsif v_outcome <> 'none' then
      v_downtime_roll := random();
      if r.recovery_stat >= 80 then v_recovery_modifier := -1;
      elsif r.recovery_stat <= 35 then v_recovery_modifier := 1;
      else v_recovery_modifier := 0; end if;

      if v_outcome = 'sickness' then
        if v_downtime_roll < 0.70 then
          v_case_code := 'cold'; v_severity := 'minor';
          v_active_days := greatest(2, 3 + v_recovery_modifier); v_recovery_days := 1; v_fatigue_floor := 20;
        elsif v_downtime_roll < 0.95 then
          v_case_code := 'flu'; v_severity := 'moderate';
          v_active_days := greatest(2, 5 + v_recovery_modifier); v_recovery_days := 2; v_fatigue_floor := 30;
        else
          v_case_code := 'viral_illness'; v_severity := 'major';
          v_active_days := greatest(3, 8 + v_recovery_modifier); v_recovery_days := 3; v_fatigue_floor := 35;
        end if;
      else
        if v_downtime_roll < 0.60 then
          v_case_code := 'minor_strain'; v_severity := 'minor';
          v_active_days := greatest(3, 4 + v_recovery_modifier); v_recovery_days := 2; v_fatigue_floor := 25;
        elsif v_downtime_roll < 0.90 then
          v_case_code := 'muscle_strain'; v_severity := 'moderate';
          v_active_days := greatest(4, 8 + v_recovery_modifier); v_recovery_days := 3; v_fatigue_floor := 30;
        else
          v_case_code := 'fracture'; v_severity := 'major';
          v_active_days := greatest(6, 15 + v_recovery_modifier); v_recovery_days := 5; v_fatigue_floor := 40;
        end if;
      end if;

      v_active_days := greatest(1, ceil(v_active_days * coalesce(v_doctor_recovery_duration_multiplier, 1.0))::int);
      v_recovery_days := greatest(0, ceil(v_recovery_days * coalesce(v_doctor_recovery_duration_multiplier, 1.0))::int);
      v_fatigue_floor := greatest(0, v_fatigue_floor - coalesce(v_doctor_fatigue_floor_reduction, 0));

      perform public.create_rider_health_case(
        r.id, v_outcome, v_case_code, v_severity, 'fatigue_overload',
        v_current_game_date, v_active_days, v_recovery_days, v_fatigue_floor::smallint
      );

      update public.riders
      set fatigue = v_new_fatigue,
          fatigue_updated_on = v_processed_date,
          consecutive_heavy_days = v_consecutive_heavy_days
      where id = r.id;

    else
      if r.unavailable_until is not null
         and r.unavailable_reason is not null
         and r.unavailable_until >= v_current_game_date then
        v_legacy_status := case
          when r.unavailable_reason = 'injury' then 'injured'
          when r.unavailable_reason = 'sickness' then 'sick'
          else 'fit'
        end;

        update public.riders
        set fatigue = v_new_fatigue,
            fatigue_updated_on = v_processed_date,
            consecutive_heavy_days = v_consecutive_heavy_days,
            availability_status = v_legacy_status
        where id = r.id;
      else
        v_legacy_status := case when v_new_fatigue >= 60 then 'not_fully_fit' else 'fit' end;
        update public.riders
        set fatigue = v_new_fatigue,
            fatigue_updated_on = v_processed_date,
            consecutive_heavy_days = v_consecutive_heavy_days,
            availability_status = v_legacy_status,
            unavailable_until = null,
            unavailable_reason = null
        where id = r.id;
      end if;
    end if;
  end loop;

  return;
end;
$function$;

-- One-time guarded correction of the already-processed previous game day.
-- It executes only at the observed Season 1 / Jan 08 boundary, and only if
-- the rider still exactly matches the old duplicate-load formula.
do $repair$
declare
  v_game_date date := public.get_current_game_date_date();
  v_processed_date date;
  v_repaired integer := 0;
begin
  if v_game_date is distinct from date '2000-01-08' then
    raise notice 'Skipping authoritative fatigue repair: current game date is %, expected 2000-01-08.', v_game_date;
    return;
  end if;

  v_processed_date := v_game_date - 1;

  with affected as (
    select
      rd.id as rider_id,
      rd.fatigue as current_fatigue,
      rd.consecutive_heavy_days,
      rd.recovery,
      rd.morale,
      rd.birth_date,
      rd.availability_status,
      a.participated,
      coalesce(a.fatigue_load, 0)::integer as explicit_load,
      coalesce(a.recovery_bonus, 0)::integer as recovery_bonus,
      rider_state.fatigue_after_stage,
      club_link.club_id,
      coalesce(travel.travel_fatigue_delta, 0)::integer as travel_fatigue_delta
    from public.riders rd
    join public.rider_daily_activity a
      on a.rider_id = rd.id
     and a.activity_date = v_processed_date
     and a.source = 'race'
     and a.source_id is not null
    join public.race_stage_authoritative_runs authority
      on authority.stage_id = a.source_id
    join public.race_stage_rider_states rider_state
      on rider_state.simulation_run_id = authority.simulation_run_id
     and rider_state.rider_id = rd.id
     and rider_state.stage_status in ('finished', 'dnf', 'otl')
    left join lateral (
      select cr.club_id from public.club_riders cr where cr.rider_id = rd.id limit 1
    ) club_link on true
    left join public.get_rider_travel_fatigue_impacts_for_date_v1(v_processed_date) travel
      on travel.rider_id = rd.id
    where rd.fatigue_updated_on = v_processed_date
  ), workload as (
    select a.*,
      case when coalesce(a.participated, false) and a.explicit_load = 0 then 12 else a.explicit_load end as total_load
    from affected a
  ), calculated as (
    select
      w.*,
      case
        when w.consecutive_heavy_days <= 1 then 0
        when w.consecutive_heavy_days = 2 then 3
        when w.consecutive_heavy_days = 3 then 6
        else 9
      end as heavy_bonus,
      greatest(
        3,
        round(
          6
          + (least(greatest(w.recovery, 0), 100) * 0.1)
          + case when w.total_load = 0 then 2 else 0 end
          + case when w.morale >= 80 then 1 else 0 end
          - case when w.morale < 40 then 1 else 0 end
          - case
              when coalesce(
                case when w.birth_date is not null then extract(year from age(v_processed_date, w.birth_date))::int end,
                25
              ) >= 31 then 1 else 0
            end
        )::int
      )
      + w.recovery_bonus
      + coalesce((select daily_recovery_bonus from public.get_team_doctor_effects(w.club_id)), 0) as daily_recovery
    from workload w
  ), expected as (
    select
      c.*,
      greatest(0, least(100,
        greatest(0, least(100,
          c.fatigue_after_stage::integer + c.total_load + c.heavy_bonus - c.daily_recovery
        )) + c.travel_fatigue_delta
      ))::integer as old_duplicate_expected,
      greatest(0, least(100,
        greatest(0, least(100,
          c.fatigue_after_stage::integer + c.heavy_bonus - c.daily_recovery
        )) + c.travel_fatigue_delta
      ))::integer as corrected_fatigue
    from calculated c
  ), repaired as (
    update public.riders rd
    set fatigue = e.corrected_fatigue::smallint,
        availability_status = case
          when rd.availability_status in ('fit', 'not_fully_fit') then
            case when e.corrected_fatigue >= 60 then 'not_fully_fit' else 'fit' end
          else rd.availability_status
        end
    from expected e
    where rd.id = e.rider_id
      and rd.fatigue_updated_on = v_processed_date
      and rd.fatigue = e.old_duplicate_expected
      and e.corrected_fatigue is distinct from e.old_duplicate_expected
    returning rd.id
  )
  select count(*) into v_repaired from repaired;

  raise notice 'Repaired % riders from authoritative race fatigue double-counting on %.', v_repaired, v_processed_date;
end;
$repair$;
