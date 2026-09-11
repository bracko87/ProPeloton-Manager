create or replace function public.get_club_medical_van_garage_summary(p_club_id uuid)
returns table(
  club_id uuid,
  total_vans integer,
  max_total_vans integer,
  available_vans integer,
  assigned_vans integer,
  in_repair_vans integer,
  pending_delivery_vans integer,
  best_available_support_score numeric,
  max_event_support_score numeric,
  best_available_support_ratio numeric,
  support_tier text,
  medical_response_bonus_pct numeric,
  minor_injury_risk_reduction_pct numeric,
  hydration_support_bonus_pct numeric,
  post_stage_recovery_bonus_pct numeric,
  max_assigned_per_event integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_max_total_vans integer := 3;
  v_max_assigned_per_event integer := 1;
  v_max_support numeric := 3;

  v_total_vans integer := 0;
  v_available_vans integer := 0;
  v_assigned_vans integer := 0;
  v_in_repair_vans integer := 0;
  v_pending_delivery_vans integer := 0;

  v_best_support numeric := 0;
  v_ratio numeric := 0;
  v_support_tier text := 'None';
  v_best_level integer;
  v_best_condition numeric;
  v_factor numeric := 0;
  v_medical numeric := 0;
  v_injury numeric := 0;
  v_hydration numeric := 0;
  v_recovery numeric := 0;
begin
  select
    coalesce(max(cfg.max_total_quantity), 3),
    coalesce(max(cfg.max_assigned_per_event), 1),
    coalesce(max(cfg.support_value), 3)
  into v_max_total_vans, v_max_assigned_per_event, v_max_support
  from public.infrastructure_asset_config cfg
  where cfg.asset_key = 'medical_van';

  select
    count(*)::integer,
    count(*) filter (where mv.status = 'available')::integer,
    count(*) filter (where mv.status = 'assigned')::integer,
    count(*) filter (where mv.status = 'in_repair')::integer
  into v_total_vans, v_available_vans, v_assigned_vans, v_in_repair_vans
  from public.club_medical_vans mv
  where mv.club_id = p_club_id
    and mv.status <> 'sold';

  select coalesce(sum(coalesce(j.asset_quantity, 1)), 0)::integer
  into v_pending_delivery_vans
  from public.club_infrastructure_jobs j
  where j.club_id = p_club_id
    and j.job_type = 'asset_delivery'
    and j.target_key = 'medical_van'
    and j.status = 'pending';

  select mv.asset_level::integer, mv.condition_percent
  into v_best_level, v_best_condition
  from public.club_medical_vans mv
  join public.infrastructure_asset_config cfg
    on cfg.asset_key = 'medical_van'
   and cfg.asset_level = mv.asset_level
  where mv.club_id = p_club_id
    and mv.status = 'available'
    and coalesce(mv.assignment_locked, false) = false
    and mv.condition_percent >= coalesce(cfg.min_assign_condition_percent, 30)
  order by
    (mv.support_value * public.medical_van_condition_factor(mv.condition_percent)) desc,
    mv.asset_level desc,
    mv.condition_percent desc,
    mv.id
  limit 1;

  if v_best_level is not null then
    v_factor := public.medical_van_condition_factor(v_best_condition);

    select
      coalesce(max(r.effect_value) filter (where r.effect_key in ('medical_response_pct','medical_response_bonus_pct')), 0),
      coalesce(min(r.effect_value) filter (where r.effect_key = 'minor_injury_risk_reduction_pct'), 0),
      coalesce(max(r.effect_value) filter (where r.effect_key in ('hydration_support_pct','hydration_support_bonus_pct','heat_hydration_support_pct')), 0),
      coalesce(max(r.effect_value) filter (where r.effect_key in ('post_stage_recovery_pct','post_stage_recovery_bonus_pct')), 0)
    into v_medical, v_injury, v_hydration, v_recovery
    from public.race_plan_effect_rules r
    where r.source_type = 'asset'
      and r.source_key = 'medical_van'
      and r.source_level = v_best_level
      and r.is_active;

    v_medical := round(v_medical * v_factor, 2);
    v_injury := round(v_injury * v_factor, 2);
    v_hydration := round(v_hydration * v_factor, 2);
    v_recovery := round(v_recovery * v_factor, 2);

    select round((mv.support_value * v_factor)::numeric, 2)
    into v_best_support
    from public.club_medical_vans mv
    where mv.club_id = p_club_id
      and mv.asset_level = v_best_level
      and mv.condition_percent = v_best_condition
      and mv.status = 'available'
    order by mv.id
    limit 1;
  end if;

  v_best_support := coalesce(v_best_support, 0);
  v_ratio := case when v_max_support > 0 then least(v_best_support / v_max_support, 1) else 0 end;

  v_support_tier := case
    when v_best_support <= 0 then 'None'
    when v_best_support < 1.5 then 'Basic'
    when v_best_support < 2.5 then 'Solid'
    else 'Strong'
  end;

  return query
  select
    p_club_id,
    v_total_vans,
    v_max_total_vans,
    v_available_vans,
    v_assigned_vans,
    v_in_repair_vans,
    v_pending_delivery_vans,
    v_best_support,
    v_max_support,
    round(v_ratio, 4),
    v_support_tier,
    v_medical,
    v_injury,
    v_hydration,
    v_recovery,
    v_max_assigned_per_event;
end;
$function$;