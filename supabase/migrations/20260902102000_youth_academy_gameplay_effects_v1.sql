alter table public.infrastructure_facility_upgrade_config
  add column if not exists youth_regular_training_development_bonus_bps integer not null default 0,
  add column if not exists youth_race_development_bonus_bps integer not null default 0,
  add column if not exists youth_head_coach_development_effectiveness_bonus_bps integer not null default 0,
  add column if not exists youth_off_focus_decay_reduction_bps integer not null default 0;

update public.infrastructure_facility_upgrade_config
set
  cost_cash = case target_level
    when 1 then 400000
    when 2 then 1000000
    else cost_cash
  end,
  duration_game_days = case target_level
    when 1 then 120
    when 2 then 180
    else duration_game_days
  end,
  monthly_maintenance_cash = case target_level
    when 1 then 4000
    when 2 then 9000
    else monthly_maintenance_cash
  end,
  youth_regular_training_development_bonus_bps = case target_level
    when 1 then 600
    when 2 then 1200
    else 0
  end,
  youth_race_development_bonus_bps = case target_level
    when 1 then 500
    when 2 then 1000
    else 0
  end,
  youth_head_coach_development_effectiveness_bonus_bps = case target_level
    when 1 then 0
    when 2 then 1000
    else 0
  end,
  youth_off_focus_decay_reduction_bps = case target_level
    when 1 then 0
    when 2 then 2000
    else 0
  end,
  unlock_summary = case target_level
    when 1 then 'Unlocks U23 Head Coach slot.'
    when 2 then 'Elite academy development program; no additional staff slot.'
    else unlock_summary
  end,
  effect_summary = case target_level
    when 1 then 'U23 regular-training development +6%; U23 race-development progress +5%; applies only to riders in the Developing Team.'
    when 2 then 'U23 regular-training development +12%; U23 race-development progress +10%; U23 Head Coach development effect +10% effectiveness; U23 off-focus training decay -20%; applies only to riders in the Developing Team.'
    else effect_summary
  end,
  updated_at = now()
where facility_key = 'youth_academy'
  and target_level between 1 and 2;

create or replace function public.get_youth_academy_effects(p_club_id uuid)
returns table(
  infrastructure_club_id uuid,
  is_developing_team boolean,
  youth_academy_level integer,
  monthly_maintenance_cash bigint,
  youth_regular_training_development_bonus_bps integer,
  youth_race_development_bonus_bps integer,
  youth_head_coach_development_effectiveness_bonus_bps integer,
  youth_off_focus_decay_reduction_bps integer
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  with resolved as (
    select
      coalesce(c.parent_club_id, c.id, p_club_id) as infrastructure_club_id,
      (coalesce(c.club_type, 'main') = 'developing') as is_developing_team
    from public.clubs c
    where c.id = p_club_id
    union all
    select p_club_id, false
    where not exists (select 1 from public.clubs c where c.id = p_club_id)
    limit 1
  ),
  infra as (
    select
      r.infrastructure_club_id,
      r.is_developing_team,
      coalesce(ci.youth_academy_level, 0)::integer as youth_academy_level
    from resolved r
    left join public.club_infrastructure ci on ci.club_id = r.infrastructure_club_id
  )
  select
    i.infrastructure_club_id,
    i.is_developing_team,
    i.youth_academy_level,
    coalesce(cfg.monthly_maintenance_cash, 0)::bigint,
    coalesce(cfg.youth_regular_training_development_bonus_bps, 0)::integer,
    coalesce(cfg.youth_race_development_bonus_bps, 0)::integer,
    coalesce(cfg.youth_head_coach_development_effectiveness_bonus_bps, 0)::integer,
    coalesce(cfg.youth_off_focus_decay_reduction_bps, 0)::integer
  from infra i
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key = 'youth_academy'
   and cfg.target_level = i.youth_academy_level;
$function$;

create or replace function public.youth_academy_u23_head_coach_development_multiplier_v1(p_club_id uuid)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $function$
  select case
    when coalesce(e.is_developing_team, false) is not true then 1.0000::numeric
    else round(1 + coalesce(e.youth_head_coach_development_effectiveness_bonus_bps, 0)::numeric / 10000.0, 4)
  end
  from public.get_youth_academy_effects(p_club_id) e
  limit 1;
$function$;

create or replace function public.get_head_coach_effects(p_club_id uuid, p_effective_date date)
returns table(
  staff_id uuid,
  staff_name text,
  specialization text,
  training_efficiency_multiplier numeric,
  development_multiplier numeric,
  overload_risk_multiplier numeric,
  youth_dev_multiplier numeric
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  v_effective_date date := p_effective_date;
  v_club_type text := 'main';
  v_parent_club_id uuid := null;
  v_staff_club_id uuid := p_club_id;
  v_expected_head_role text := 'head_coach';
  v_expected_scope text := 'first_team';
  v_staff record;
  v_primary_staff_id uuid := null;
  v_primary_staff_name text := null;
  v_primary_specialization text := null;
  v_available_trainer_count integer := 0;
  v_training_output_pct numeric := 0;
  v_development_support_pct numeric := 0;
  v_overload_risk_reduction_pct numeric := 0;
  v_raw_training_pct numeric := 0;
  v_raw_development_pct numeric := 0;
  v_raw_overload_pct numeric := 0;
  v_assignment_factor numeric := 1.0;
  v_availability_factor numeric := 1.0;
  v_has_active_course boolean := false;
begin
  if p_club_id is null then return; end if;
  if v_effective_date is null then v_effective_date := public.get_current_game_date_date(); end if;
  if v_effective_date is null then return; end if;

  select coalesce(c.club_type, 'main'), c.parent_club_id
  into v_club_type, v_parent_club_id
  from public.clubs c where c.id = p_club_id limit 1;

  if v_club_type = 'developing' then
    v_staff_club_id := coalesce(v_parent_club_id, p_club_id);
    v_expected_head_role := 'u23_head_coach';
    v_expected_scope := 'u23';
  else
    v_staff_club_id := p_club_id;
    v_expected_head_role := 'head_coach';
    v_expected_scope := 'first_team';
  end if;

  for v_staff in
    select cs.id, cs.staff_name, cs.specialization, cs.role_type, cs.team_scope,
           cs.expertise, cs.experience, cs.potential, cs.leadership, cs.efficiency, cs.loyalty
    from public.club_staff cs
    where cs.club_id in (p_club_id, v_staff_club_id)
      and cs.role_type in (v_expected_head_role, 'trainer')
      and coalesce(cs.is_active, false) = true
      and cs.team_scope::text in (v_expected_scope, 'all')
    order by
      case when cs.role_type = v_expected_head_role then 0 else 1 end,
      case when cs.team_scope::text = 'all' then 0 else 1 end,
      cs.staff_name
  loop
    if v_primary_staff_id is null then
      v_primary_staff_id := v_staff.id;
      v_primary_staff_name := v_staff.staff_name;
      v_primary_specialization := v_staff.specialization;
    end if;

    v_assignment_factor := coalesce(public.get_staff_assignment_availability_factor(v_staff.id, v_effective_date), 1.0);
    select exists (
      select 1 from public.staff_courses sc
      where sc.staff_id = v_staff.id
        and sc.status = 'active'
        and sc.started_game_date <= v_effective_date
        and sc.completes_on_game_date >= v_effective_date
    ) into v_has_active_course;

    if v_has_active_course then v_assignment_factor := 0; end if;
    v_availability_factor := least(1.0, greatest(0.0, coalesce(v_assignment_factor, 1.0)));

    if v_staff.role_type = v_expected_head_role then
      v_raw_training_pct := least(10, greatest(0, round(coalesce(v_staff.expertise, 0)::numeric / 10.0)));
      v_raw_development_pct := least(10, greatest(0, round(coalesce(v_staff.potential, 0)::numeric / 20.0)));
      if v_club_type = 'developing' then
        v_raw_development_pct := round(
          v_raw_development_pct * public.youth_academy_u23_head_coach_development_multiplier_v1(p_club_id),
          2
        );
      end if;
      v_raw_overload_pct := least(10, greatest(0, round(coalesce(v_staff.efficiency, 0)::numeric / 20.0)));
    elsif v_staff.role_type = 'trainer' then
      v_raw_training_pct := least(5, greatest(0, round(coalesce(v_staff.expertise, 0)::numeric / 25.0)));
      v_raw_development_pct := least(5, greatest(0, round(coalesce(v_staff.potential, 0)::numeric / 25.0)));
      v_raw_overload_pct := least(5, greatest(0, round(coalesce(v_staff.efficiency, 0)::numeric / 40.0)));
      if v_availability_factor > 0 then v_available_trainer_count := v_available_trainer_count + 1; end if;
    end if;

    v_training_output_pct := v_training_output_pct + (v_raw_training_pct * v_availability_factor);
    v_development_support_pct := v_development_support_pct + (v_raw_development_pct * v_availability_factor);
    v_overload_risk_reduction_pct := v_overload_risk_reduction_pct + (v_raw_overload_pct * v_availability_factor);
  end loop;

  if v_primary_staff_id is null then return; end if;

  staff_id := v_primary_staff_id;
  staff_name := case
    when v_available_trainer_count > 0 then v_primary_staff_name || ' + ' || v_available_trainer_count::text || ' Trainer'
    else v_primary_staff_name
  end;
  specialization := case
    when v_available_trainer_count > 0 then 'Coaching Staff'
    else coalesce(v_primary_specialization, 'Coaching Staff')
  end;
  training_efficiency_multiplier := round(1 + (v_training_output_pct / 100.0), 4);
  development_multiplier := round(1 + (v_development_support_pct / 100.0), 4);
  overload_risk_multiplier := round(1 - (v_overload_risk_reduction_pct / 100.0), 4);
  youth_dev_multiplier := 1.0000;
  return next;
end;
$function$;

create or replace function public.trg_apply_youth_academy_regular_training_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_club_id uuid;
  v_effect record;
  v_before numeric := 0;
  v_after numeric := 0;
begin
  if new.source is distinct from 'regular_training'
     or coalesce(new.activity_type, '') <> 'training'
     or coalesce(new.participated, false) = false then return new; end if;
  if lower(coalesce(new.metadata->>'development_eligible', 'true')) in ('false', '0', 'no') then return new; end if;
  if lower(coalesce(new.metadata->>'youth_academy_effect_applied', 'false')) in ('true', '1', 'yes') then return new; end if;

  select cr.club_id into v_club_id
  from public.club_riders cr
  join public.clubs c on c.id = cr.club_id and c.deleted_at is null
  where cr.rider_id = new.rider_id limit 1;
  if v_club_id is null then return new; end if;

  select * into v_effect from public.get_youth_academy_effects(v_club_id) limit 1;
  if not found or coalesce(v_effect.is_developing_team, false) is not true then return new; end if;
  if coalesce(v_effect.youth_regular_training_development_bonus_bps, 0) <= 0 then return new; end if;

  v_before := coalesce(nullif(new.metadata->>'development_value_base', '')::numeric, 0);
  if v_before <= 0 then return new; end if;
  v_after := round(v_before * (1 + v_effect.youth_regular_training_development_bonus_bps::numeric / 10000.0), 4);

  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'youth_academy_level', v_effect.youth_academy_level,
    'youth_academy_regular_training_bonus_bps', v_effect.youth_regular_training_development_bonus_bps,
    'youth_academy_race_development_bonus_bps', v_effect.youth_race_development_bonus_bps,
    'youth_academy_head_coach_development_effectiveness_bonus_bps', v_effect.youth_head_coach_development_effectiveness_bonus_bps,
    'youth_academy_off_focus_decay_reduction_bps', v_effect.youth_off_focus_decay_reduction_bps,
    'development_before_youth_academy', round(v_before, 4),
    'development_value_base', v_after,
    'youth_academy_effect_applied', true,
    'youth_academy_effect_version', 'youth_academy_gameplay_v1'
  );
  return new;
end;
$function$;

drop trigger if exists trg_zzzzzz_youth_academy_regular_training_v1 on public.rider_daily_activity;
create trigger trg_zzzzzz_youth_academy_regular_training_v1
before insert or update on public.rider_daily_activity
for each row execute function public.trg_apply_youth_academy_regular_training_v1();

create or replace function public.trg_apply_youth_academy_race_development_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_effect record;
  v_multiplier numeric := 1.0;
  v_progress jsonb;
  v_key text;
  v_value numeric;
  v_before_total numeric := 0;
  v_after_total numeric := 0;
  v_keys text[] := array['sprint','climbing','time_trial','endurance','flat','recovery','resistance','race_iq','teamwork'];
begin
  if new.team_id is null or new.progress_json is null then return new; end if;
  if lower(coalesce(new.metadata->>'youth_academy_race_development_applied', 'false')) in ('true', '1', 'yes') then return new; end if;

  select * into v_effect from public.get_youth_academy_effects(new.team_id) limit 1;
  if not found or coalesce(v_effect.is_developing_team, false) is not true then return new; end if;
  if coalesce(v_effect.youth_race_development_bonus_bps, 0) <= 0 then return new; end if;

  v_multiplier := 1 + v_effect.youth_race_development_bonus_bps::numeric / 10000.0;
  v_progress := coalesce(new.progress_json, '{}'::jsonb);
  v_before_total := coalesce(new.total_progress_points, 0);

  foreach v_key in array v_keys loop
    if jsonb_typeof(v_progress -> v_key) = 'number' then
      v_value := coalesce((v_progress ->> v_key)::numeric, 0);
      v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(round(v_value * v_multiplier, 4)), true);
    end if;
  end loop;

  select coalesce(sum((value #>> '{}')::numeric), 0)
  into v_after_total
  from jsonb_each(v_progress)
  where jsonb_typeof(value) = 'number';

  new.progress_json := v_progress;
  new.total_progress_points := round(v_after_total, 4);
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'youth_academy_level', v_effect.youth_academy_level,
    'youth_academy_race_development_bonus_bps', v_effect.youth_race_development_bonus_bps,
    'race_development_total_before_youth_academy', round(v_before_total, 4),
    'race_development_total_after_youth_academy', round(v_after_total, 4),
    'youth_academy_race_development_applied', true,
    'youth_academy_effect_version', 'youth_academy_gameplay_v1'
  );
  return new;
end;
$function$;

drop trigger if exists trg_youth_academy_race_development_v1 on public.rider_race_development_events;
create trigger trg_youth_academy_race_development_v1
before insert on public.rider_race_development_events
for each row execute function public.trg_apply_youth_academy_race_development_v1();

create or replace function public.apply_regular_training_off_focus_decay(p_rider_id uuid, p_focus_code text, p_training_days integer)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_factor numeric;
  v_decay_multiplier numeric := 1.0;
  v_club_id uuid;
  v_effect record;
begin
  if coalesce(p_training_days, 0) <= 0 then return; end if;
  if p_training_days <= 2 then return; end if;
  v_factor := (p_training_days::numeric - 2.0) / 5.0;

  select cr.club_id into v_club_id
  from public.club_riders cr
  join public.clubs c on c.id = cr.club_id and c.deleted_at is null
  where cr.rider_id = p_rider_id limit 1;

  if v_club_id is not null then
    select * into v_effect from public.get_youth_academy_effects(v_club_id) limit 1;
    if found and coalesce(v_effect.is_developing_team, false) is true then
      v_decay_multiplier := greatest(0, 1 - coalesce(v_effect.youth_off_focus_decay_reduction_bps, 0)::numeric / 10000.0);
    end if;
  end if;

  case coalesce(lower(p_focus_code), 'general')
    when 'sprint' then
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'climbing',    -0.008 * v_factor * v_decay_multiplier);
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'time_trial', -0.004 * v_factor * v_decay_multiplier);
    when 'climbing' then
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'sprint',     -0.010 * v_factor * v_decay_multiplier);
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'flat',       -0.005 * v_factor * v_decay_multiplier);
    when 'flat' then
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'climbing',   -0.007 * v_factor * v_decay_multiplier);
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'time_trial', -0.003 * v_factor * v_decay_multiplier);
    when 'time_trial' then
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'sprint',     -0.005 * v_factor * v_decay_multiplier);
      perform public.add_rider_attribute_progress_delta(p_rider_id, 'climbing',   -0.005 * v_factor * v_decay_multiplier);
    else return;
  end case;
end;
$function$;

update public.staff_role_catalog
set facility_key = 'youth_academy_level', gameplay_status = 'live'
where role_type = 'u23_head_coach';

create or replace function public.get_club_staff_role_capacity(p_club_id uuid)
returns table(
  role_type text, display_name text, role_group text, assigned_count integer,
  max_absolute integer, current_capacity integer, open_slots integer,
  is_unlocked boolean, locked_reason text, facility_key text, gameplay_status text
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  with role_rows as (
    select rc.role_type, rc.display_name, rc.role_group, rc.max_absolute,
           rc.facility_key, rc.requires_developing_team, rc.gameplay_status
    from public.staff_role_catalog rc where rc.is_market_role = true
  ),
  infra as (
    select
      coalesce(max(ci.hq_level), 0)::integer as hq_level,
      coalesce(max(ci.training_center_level), 0)::integer as training_center_level,
      coalesce(max(ci.medical_center_level), 0)::integer as medical_center_level,
      coalesce(max(ci.youth_academy_level), 0)::integer as youth_academy_level,
      coalesce(max(ci.scouting_level), 0)::integer as scouting_level,
      coalesce(max(ci.mechanics_workshop_level), 0)::integer as mechanics_workshop_level
    from public.club_infrastructure ci where ci.club_id = p_club_id
  ),
  assigned as (
    select cs.role_type, count(*)::integer as assigned_count
    from public.club_staff cs
    where cs.club_id = p_club_id and coalesce(cs.is_active, true) = true
    group by cs.role_type
  ),
  developing_status as (
    select exists (
      select 1 from public.clubs dc
      where dc.parent_club_id = p_club_id
        and coalesce(dc.club_type, '') = 'developing'
        and dc.deleted_at is null
    ) as has_developing_team
  ),
  capacity_calc as (
    select
      rr.role_type, rr.display_name, rr.role_group, rr.max_absolute,
      rr.facility_key, rr.requires_developing_team, rr.gameplay_status,
      coalesce(a.assigned_count, 0)::integer as assigned_count,
      ds.has_developing_team,
      i.hq_level, i.training_center_level, i.medical_center_level, i.youth_academy_level,
      case
        when rr.role_type = 'trainer' then case
          when i.hq_level < 1 then 0 when i.training_center_level >= 5 then 3
          when i.training_center_level >= 3 then 2 else 1 end
        when rr.role_type = 'team_doctor' then case
          when i.hq_level < 1 then 0 when i.medical_center_level >= 3 then 2 else 1 end
        when rr.role_type = 'physio' then case
          when i.hq_level < 1 then 0 when i.medical_center_level >= 5 then 5
          when i.medical_center_level >= 4 then 4 when i.medical_center_level >= 3 then 3
          when i.medical_center_level >= 1 then 2 else 1 end
        when rr.role_type = 'nutritionist' then case
          when i.hq_level < 1 then 0 when i.medical_center_level >= 2 then 1 else 0 end
        when rr.role_type in ('head_coach', 'mechanic', 'scout_analyst') then case when i.hq_level >= 1 then 1 else 0 end
        when rr.role_type = 'u23_head_coach' then case
          when ds.has_developing_team = true and i.youth_academy_level >= 1 then 1 else 0 end
        when rr.role_type = 'sport_director' then case
          when i.hq_level >= 4 then 2 when i.hq_level >= 2 then 1 else 0 end
        else 0
      end::integer as raw_current_capacity
    from role_rows rr
    cross join infra i
    cross join developing_status ds
    left join assigned a on a.role_type = rr.role_type
  )
  select
    cc.role_type, cc.display_name, cc.role_group, cc.assigned_count, cc.max_absolute,
    least(cc.max_absolute, cc.raw_current_capacity)::integer as current_capacity,
    greatest(least(cc.max_absolute, cc.raw_current_capacity) - cc.assigned_count, 0)::integer as open_slots,
    case
      when cc.requires_developing_team = true and cc.has_developing_team = false then false
      when least(cc.max_absolute, cc.raw_current_capacity) <= 0 then false else true end as is_unlocked,
    case
      when cc.requires_developing_team = true and cc.has_developing_team = false then 'Developing Team is not unlocked.'
      when cc.role_type = 'u23_head_coach' and cc.youth_academy_level < 1 then 'Youth Academy Lv 1 is required.'
      when cc.role_type = 'sport_director' and cc.hq_level < 2 then 'Club House Lv 2 is required.'
      when cc.role_type = 'trainer' and cc.hq_level < 1 then 'Club House Lv 1 is required.'
      when cc.role_type = 'nutritionist' and cc.hq_level >= 1 and cc.medical_center_level < 2 then 'Medical Center Lv 2 is required.'
      when cc.hq_level < 1 and cc.role_type <> 'u23_head_coach' then 'Club House Lv 1 is required.'
      else null end as locked_reason,
    cc.facility_key,
    cc.gameplay_status
  from capacity_calc cc
  order by
    case cc.role_group when 'coaching' then 1 when 'developing_team' then 2 when 'medical' then 3
      when 'technical' then 4 when 'race' then 5 when 'scouting' then 6 else 99 end,
    cc.display_name;
$function$;
