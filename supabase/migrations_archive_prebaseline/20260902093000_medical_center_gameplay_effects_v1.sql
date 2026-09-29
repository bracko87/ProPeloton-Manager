alter table public.infrastructure_facility_upgrade_config
  add column if not exists medical_risk_reduction_bps integer not null default 0,
  add column if not exists medical_recovery_duration_reduction_bps integer not null default 0,
  add column if not exists medical_fatigue_floor_reduction_points smallint not null default 0;

update public.infrastructure_facility_upgrade_config
set
  cost_cash = case target_level
    when 1 then 250000
    when 2 then 600000
    when 3 then 1400000
    when 4 then 3000000
    when 5 then 6500000
    else cost_cash
  end,
  monthly_maintenance_cash = case target_level
    when 1 then 2500
    when 2 then 5000
    when 3 then 8000
    when 4 then 13000
    when 5 then 20000
    else monthly_maintenance_cash
  end,
  medical_risk_reduction_bps = case target_level
    when 1 then 300
    when 2 then 600
    when 3 then 900
    when 4 then 1200
    when 5 then 1500
    else 0
  end,
  medical_recovery_duration_reduction_bps = case target_level
    when 1 then 400
    when 2 then 800
    when 3 then 1200
    when 4 then 1600
    when 5 then 2000
    else 0
  end,
  medical_fatigue_floor_reduction_points = case target_level
    when 1 then 1
    when 2 then 2
    when 3 then 3
    when 4 then 4
    when 5 then 5
    else 0
  end,
  unlock_summary = case target_level
    when 1 then 'Unlocks second Physio slot.'
    when 2 then 'Unlocks Nutritionist slot.'
    when 3 then 'Unlocks second Team Doctor slot and third Physio slot.'
    when 4 then 'Unlocks fourth Physio slot.'
    when 5 then 'Unlocks fifth Physio slot.'
    else unlock_summary
  end,
  effect_summary = case target_level
    when 1 then 'Preventable injury and illness risk -3%; health-case recovery duration -4%; rehabilitation fatigue floor -1 point; applies to First Team and U23 riders.'
    when 2 then 'Preventable injury and illness risk -6%; health-case recovery duration -8%; rehabilitation fatigue floor -2 points; applies to First Team and U23 riders.'
    when 3 then 'Preventable injury and illness risk -9%; health-case recovery duration -12%; rehabilitation fatigue floor -3 points; applies to First Team and U23 riders.'
    when 4 then 'Preventable injury and illness risk -12%; health-case recovery duration -16%; rehabilitation fatigue floor -4 points; applies to First Team and U23 riders.'
    when 5 then 'Preventable injury and illness risk -15%; health-case recovery duration -20%; rehabilitation fatigue floor -5 points; applies to First Team and U23 riders.'
    else effect_summary
  end,
  updated_at = now()
where facility_key = 'medical_center'
  and target_level between 1 and 5;

create or replace function public.get_medical_center_effects(p_club_id uuid)
returns table(
  infrastructure_club_id uuid,
  medical_center_level integer,
  monthly_maintenance_cash bigint,
  medical_risk_reduction_bps integer,
  medical_recovery_duration_reduction_bps integer,
  medical_fatigue_floor_reduction_points integer
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  with resolved as (
    select coalesce(c.parent_club_id, c.id, p_club_id) as infrastructure_club_id
    from public.clubs c
    where c.id = p_club_id
    union all
    select p_club_id
    where not exists (select 1 from public.clubs c where c.id = p_club_id)
    limit 1
  ),
  infra as (
    select
      r.infrastructure_club_id,
      coalesce(ci.medical_center_level, 0)::integer as medical_center_level
    from resolved r
    left join public.club_infrastructure ci
      on ci.club_id = r.infrastructure_club_id
  )
  select
    i.infrastructure_club_id,
    i.medical_center_level,
    coalesce(cfg.monthly_maintenance_cash, 0)::bigint,
    coalesce(cfg.medical_risk_reduction_bps, 0)::integer,
    coalesce(cfg.medical_recovery_duration_reduction_bps, 0)::integer,
    coalesce(cfg.medical_fatigue_floor_reduction_points, 0)::integer
  from infra i
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key = 'medical_center'
   and cfg.target_level = i.medical_center_level;
$function$;

create or replace function public.health_get_medical_center_level_v1(p_club_id uuid)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $function$
  select coalesce((select e.medical_center_level from public.get_medical_center_effects(p_club_id) e limit 1), 0)::integer;
$function$;

create or replace function public.health_get_medical_center_recovery_bonus_pct_v1(p_medical_center_level integer)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $function$
  select case
    when p_medical_center_level is null then 0::numeric
    when p_medical_center_level >= 5 then 20::numeric
    when p_medical_center_level = 4 then 16::numeric
    when p_medical_center_level = 3 then 12::numeric
    when p_medical_center_level = 2 then 8::numeric
    when p_medical_center_level = 1 then 4::numeric
    else 0::numeric
  end;
$function$;

create or replace function public.health_get_medical_center_risk_reduction_pct_v1(p_medical_center_level integer)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $function$
  select case
    when p_medical_center_level is null then 0::numeric
    when p_medical_center_level >= 5 then 15::numeric
    when p_medical_center_level = 4 then 12::numeric
    when p_medical_center_level = 3 then 9::numeric
    when p_medical_center_level = 2 then 6::numeric
    when p_medical_center_level = 1 then 3::numeric
    else 0::numeric
  end;
$function$;

create or replace function public.health_get_medical_center_risk_multiplier_v1(p_club_id uuid)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $function$
  select round(
    1 - (
      public.health_get_medical_center_risk_reduction_pct_v1(
        public.health_get_medical_center_level_v1(p_club_id)
      ) / 100.0
    ),
    4
  );
$function$;

create or replace function public.health_get_medical_center_fatigue_floor_reduction_v1(p_medical_center_level integer)
returns integer
language sql
stable
security definer
set search_path = 'public'
as $function$
  select case
    when p_medical_center_level is null then 0
    when p_medical_center_level >= 5 then 5
    when p_medical_center_level = 4 then 4
    when p_medical_center_level = 3 then 3
    when p_medical_center_level = 2 then 2
    when p_medical_center_level = 1 then 1
    else 0
  end::integer;
$function$;

create or replace function public.health_calculate_case_recovery_v1(
  p_club_id uuid,
  p_case_code text,
  p_severity text default 'moderate'::text,
  p_started_on date default null::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_case public.health_case_catalogue_v1%rowtype;
  v_started_on date := coalesce(
    p_started_on,
    case
      when to_regprocedure('public.get_current_game_date_date()') is not null
        then public.get_current_game_date_date()
      else current_date
    end
  );
  v_severity text := lower(coalesce(p_severity, 'moderate'));
  v_base_min integer;
  v_base_max integer;
  v_selected_base_days integer;
  v_staff jsonb;
  v_medical_center_level integer;
  v_staff_reduction_pct numeric := 0;
  v_infrastructure_reduction_pct numeric := 0;
  v_infrastructure_risk_reduction_pct numeric := 0;
  v_infrastructure_fatigue_floor_reduction integer := 0;
  v_total_reduction_pct numeric := 0;
  v_final_days integer;
begin
  select cat.*
  into v_case
  from public.health_case_catalogue_v1 cat
  where cat.case_code = lower(trim(p_case_code));

  if not found then
    raise exception 'Unknown health case code: %', p_case_code;
  end if;

  if v_severity not in ('minor', 'moderate', 'major') then
    raise exception 'Invalid severity %. Expected minor/moderate/major.', p_severity;
  end if;

  if v_severity = 'minor' then
    v_base_min := v_case.minor_min_days;
    v_base_max := v_case.minor_max_days;
  elsif v_severity = 'major' then
    v_base_min := v_case.major_min_days;
    v_base_max := v_case.major_max_days;
  else
    v_base_min := v_case.moderate_min_days;
    v_base_max := v_case.moderate_max_days;
  end if;

  v_selected_base_days := ceil((v_base_min + v_base_max) / 2.0)::integer;
  v_staff := public.health_get_medical_staff_support_v1(p_club_id);
  v_medical_center_level := public.health_get_medical_center_level_v1(p_club_id);

  v_staff_reduction_pct := coalesce(nullif(v_staff->>'recovery_duration_reduction_pct', '')::numeric, 0);
  v_infrastructure_reduction_pct := public.health_get_medical_center_recovery_bonus_pct_v1(v_medical_center_level);
  v_infrastructure_risk_reduction_pct := public.health_get_medical_center_risk_reduction_pct_v1(v_medical_center_level);
  v_infrastructure_fatigue_floor_reduction := public.health_get_medical_center_fatigue_floor_reduction_v1(v_medical_center_level);

  v_total_reduction_pct := least(45, greatest(0, v_staff_reduction_pct + v_infrastructure_reduction_pct));
  v_final_days := greatest(1, ceil(v_selected_base_days * (1 - (v_total_reduction_pct / 100.0)))::integer);

  return jsonb_build_object(
    'case_code', v_case.case_code,
    'case_type', v_case.case_type,
    'display_name', v_case.display_name,
    'severity', v_severity,
    'source_contexts', v_case.source_contexts,
    'body_part_required', v_case.body_part_required,
    'default_body_parts', v_case.default_body_parts,
    'base_min_days', v_base_min,
    'base_max_days', v_base_max,
    'selected_base_days', v_selected_base_days,
    'medical_staff', v_staff,
    'medical_staff_reduction_pct', v_staff_reduction_pct,
    'medical_center_level', v_medical_center_level,
    'infrastructure_reduction_pct', v_infrastructure_reduction_pct,
    'infrastructure_risk_reduction_pct', v_infrastructure_risk_reduction_pct,
    'infrastructure_fatigue_floor_reduction', v_infrastructure_fatigue_floor_reduction,
    'total_reduction_pct', v_total_reduction_pct,
    'final_recovery_days', v_final_days,
    'started_on', v_started_on,
    'expected_full_recovery_on', v_started_on + v_final_days,
    'selection_blocked_default', v_case.selection_blocked_default,
    'training_blocked_default', v_case.training_blocked_default,
    'development_blocked_default', v_case.development_blocked_default
  );
end;
$function$;

create or replace function public.health_sync_case_fatigue_floor_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_base_floor integer;
  v_staff_reduction integer;
  v_infrastructure_reduction integer;
  v_final_floor integer;
begin
  v_base_floor :=
    case lower(coalesce(new.severity, 'moderate'))
      when 'minor' then 45
      when 'moderate' then 60
      when 'major' then 75
      else 60
    end;

  v_staff_reduction := coalesce(
    nullif(new.notes #>> '{calculation,medical_staff,fatigue_floor_reduction}', '')::integer,
    0
  );

  v_infrastructure_reduction := coalesce(
    nullif(new.notes #>> '{calculation,infrastructure_fatigue_floor_reduction}', '')::integer,
    0
  );

  v_final_floor := greatest(
    0,
    least(100, v_base_floor - v_staff_reduction - v_infrastructure_reduction)
  );

  update public.rider_health_cases hc
  set fatigue_floor_on_return = v_final_floor::smallint
  where hc.id = new.health_case_id
    and coalesce(hc.fatigue_floor_on_return, 0) = 0;

  return new;
end;
$function$;

create or replace function public.get_club_staff_role_capacity(p_club_id uuid)
returns table(
  role_type text,
  display_name text,
  role_group text,
  assigned_count integer,
  max_absolute integer,
  current_capacity integer,
  open_slots integer,
  is_unlocked boolean,
  locked_reason text,
  facility_key text,
  gameplay_status text
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  with role_rows as (
    select
      rc.role_type,
      rc.display_name,
      rc.role_group,
      rc.max_absolute,
      rc.facility_key,
      rc.requires_developing_team,
      rc.gameplay_status
    from public.staff_role_catalog rc
    where rc.is_market_role = true
  ),
  infra as (
    select
      coalesce(max(ci.hq_level), 0)::integer as hq_level,
      coalesce(max(ci.training_center_level), 0)::integer as training_center_level,
      coalesce(max(ci.medical_center_level), 0)::integer as medical_center_level,
      coalesce(max(ci.scouting_level), 0)::integer as scouting_level,
      coalesce(max(ci.mechanics_workshop_level), 0)::integer as mechanics_workshop_level
    from public.club_infrastructure ci
    where ci.club_id = p_club_id
  ),
  assigned as (
    select cs.role_type, count(*)::integer as assigned_count
    from public.club_staff cs
    where cs.club_id = p_club_id
      and coalesce(cs.is_active, true) = true
    group by cs.role_type
  ),
  developing_status as (
    select exists (
      select 1
      from public.clubs dc
      where dc.parent_club_id = p_club_id
        and coalesce(dc.club_type, '') = 'developing'
        and dc.deleted_at is null
    ) as has_developing_team
  ),
  capacity_calc as (
    select
      rr.role_type,
      rr.display_name,
      rr.role_group,
      rr.max_absolute,
      rr.facility_key,
      rr.requires_developing_team,
      rr.gameplay_status,
      coalesce(a.assigned_count, 0)::integer as assigned_count,
      ds.has_developing_team,
      i.hq_level,
      i.training_center_level,
      i.medical_center_level,
      case
        when rr.role_type = 'trainer' then
          case
            when i.hq_level < 1 then 0
            when i.training_center_level >= 5 then 3
            when i.training_center_level >= 3 then 2
            else 1
          end
        when rr.role_type = 'team_doctor' then
          case
            when i.hq_level < 1 then 0
            when i.medical_center_level >= 3 then 2
            else 1
          end
        when rr.role_type = 'physio' then
          case
            when i.hq_level < 1 then 0
            when i.medical_center_level >= 5 then 5
            when i.medical_center_level >= 4 then 4
            when i.medical_center_level >= 3 then 3
            when i.medical_center_level >= 1 then 2
            else 1
          end
        when rr.role_type = 'nutritionist' then
          case
            when i.hq_level < 1 then 0
            when i.medical_center_level >= 2 then 1
            else 0
          end
        when rr.role_type in ('head_coach', 'mechanic', 'scout_analyst') then
          case when i.hq_level >= 1 then 1 else 0 end
        when rr.role_type = 'u23_head_coach' then
          case when ds.has_developing_team = true then 1 else 0 end
        when rr.role_type = 'sport_director' then
          case
            when i.hq_level >= 4 then 2
            when i.hq_level >= 2 then 1
            else 0
          end
        else 0
      end::integer as raw_current_capacity
    from role_rows rr
    cross join infra i
    cross join developing_status ds
    left join assigned a on a.role_type = rr.role_type
  )
  select
    cc.role_type,
    cc.display_name,
    cc.role_group,
    cc.assigned_count,
    cc.max_absolute,
    least(cc.max_absolute, cc.raw_current_capacity)::integer as current_capacity,
    greatest(least(cc.max_absolute, cc.raw_current_capacity) - cc.assigned_count, 0)::integer as open_slots,
    case
      when cc.requires_developing_team = true and cc.has_developing_team = false then false
      when least(cc.max_absolute, cc.raw_current_capacity) <= 0 then false
      else true
    end as is_unlocked,
    case
      when cc.requires_developing_team = true and cc.has_developing_team = false
        then 'Developing Team is not unlocked.'
      when cc.role_type = 'sport_director' and cc.hq_level < 2
        then 'Club House Lv 2 is required.'
      when cc.role_type = 'trainer' and cc.hq_level < 1
        then 'Club House Lv 1 is required.'
      when cc.role_type = 'nutritionist' and cc.hq_level >= 1 and cc.medical_center_level < 2
        then 'Medical Center Lv 2 is required.'
      when cc.hq_level < 1 and cc.role_type <> 'u23_head_coach'
        then 'Club House Lv 1 is required.'
      else null
    end as locked_reason,
    cc.facility_key,
    cc.gameplay_status
  from capacity_calc cc
  order by
    case cc.role_group
      when 'coaching' then 1
      when 'developing_team' then 2
      when 'medical' then 3
      when 'technical' then 4
      when 'race' then 5
      when 'scouting' then 6
      else 99
    end,
    cc.display_name;
$function$;
