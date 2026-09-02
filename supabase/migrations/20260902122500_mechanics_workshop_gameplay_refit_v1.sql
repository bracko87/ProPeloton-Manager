alter table public.infrastructure_facility_upgrade_config
  add column if not exists workshop_repair_speed_bonus_bps integer not null default 0,
  add column if not exists workshop_repair_cost_discount_bps integer not null default 0,
  add column if not exists workshop_condition_loss_reduction_bps integer not null default 0,
  add column if not exists workshop_mechanical_risk_reduction_bps integer not null default 0;

update public.infrastructure_facility_upgrade_config
set
  cost_cash = case target_level
    when 1 then 250000
    when 2 then 600000
    when 3 then 1400000
    when 4 then 3000000
    else cost_cash
  end,
  duration_game_days = case target_level
    when 1 then 60
    when 2 then 120
    when 3 then 180
    when 4 then 270
    else duration_game_days
  end,
  monthly_maintenance_cash = case target_level
    when 1 then 2500
    when 2 then 5000
    when 3 then 9000
    when 4 then 15000
    else monthly_maintenance_cash
  end,
  workshop_repair_speed_bonus_bps = case target_level
    when 1 then 500
    when 2 then 1200
    when 3 then 2200
    when 4 then 3500
    else 0
  end,
  workshop_repair_cost_discount_bps = case target_level
    when 1 then 0
    when 2 then 800
    when 3 then 1600
    when 4 then 2500
    else 0
  end,
  workshop_condition_loss_reduction_bps = case target_level
    when 1 then 300
    when 2 then 600
    when 3 then 1000
    when 4 then 1500
    else 0
  end,
  workshop_mechanical_risk_reduction_bps = case target_level
    when 1 then 200
    when 2 then 400
    when 3 then 700
    when 4 then 1000
    else 0
  end,
  unlock_summary = case target_level
    when 1 then 'Unlocks second Mechanic slot.'
    when 2 then 'Unlocks third Mechanic slot.'
    when 3 then 'Unlocks fourth Mechanic slot.'
    when 4 then 'Unlocks fifth Mechanic slot.'
    else unlock_summary
  end,
  effect_summary = case target_level
    when 1 then 'Mechanic capacity 2; equipment repair speed +5%; equipment condition loss -3%; mechanical risk -2%; applies club-wide to First Team and U23.'
    when 2 then 'Mechanic capacity 3; equipment repair speed +12%; equipment repair cost -8%; equipment condition loss -6%; mechanical risk -4%; applies club-wide to First Team and U23.'
    when 3 then 'Mechanic capacity 4; equipment repair speed +22%; equipment repair cost -16%; equipment condition loss -10%; mechanical risk -7%; applies club-wide to First Team and U23.'
    when 4 then 'Mechanic capacity 5; equipment repair speed +35%; equipment repair cost -25%; equipment condition loss -15%; mechanical risk -10%; applies club-wide to First Team and U23.'
    else effect_summary
  end,
  updated_at = now()
where facility_key = 'mechanics_workshop'
  and target_level between 1 and 4;

create or replace function public.get_mechanics_workshop_effects(p_club_id uuid)
returns table(
  infrastructure_club_id uuid,
  is_developing_team boolean,
  mechanics_workshop_level integer,
  monthly_maintenance_cash bigint,
  workshop_repair_speed_bonus_bps integer,
  workshop_repair_cost_discount_bps integer,
  workshop_condition_loss_reduction_bps integer,
  workshop_mechanical_risk_reduction_bps integer
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
      coalesce(ci.mechanics_workshop_level, 0)::integer as mechanics_workshop_level
    from resolved r
    left join public.club_infrastructure ci
      on ci.club_id = r.infrastructure_club_id
  )
  select
    i.infrastructure_club_id,
    i.is_developing_team,
    i.mechanics_workshop_level,
    coalesce(cfg.monthly_maintenance_cash, 0)::bigint,
    coalesce(cfg.workshop_repair_speed_bonus_bps, 0)::integer,
    coalesce(cfg.workshop_repair_cost_discount_bps, 0)::integer,
    coalesce(cfg.workshop_condition_loss_reduction_bps, 0)::integer,
    coalesce(cfg.workshop_mechanical_risk_reduction_bps, 0)::integer
  from infra i
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key = 'mechanics_workshop'
   and cfg.target_level = i.mechanics_workshop_level;
$function$;

update public.staff_role_catalog
set
  max_absolute = 5,
  facility_key = 'mechanics_workshop_level',
  gameplay_status = 'live_gameplay'
where role_type = 'mechanic';

create or replace function public.equipment_get_mechanic_effects_v1(
  p_club_id uuid,
  p_staff_ids uuid[] default null::uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $function$
  with workshop as (
    select *
    from public.get_mechanics_workshop_effects(p_club_id)
    limit 1
  ),
  selected_mechanics as (
    select
      cs.id,
      cs.staff_name,
      cs.expertise::numeric as expertise,
      cs.experience::numeric as experience,
      cs.potential::numeric as potential,
      cs.leadership::numeric as leadership,
      cs.efficiency::numeric as efficiency,
      cs.loyalty::numeric as loyalty
    from public.club_staff cs
    join workshop w on w.infrastructure_club_id = cs.club_id
    where cs.is_active = true
      and cs.role_type = 'mechanic'
      and (
        p_staff_ids is null
        or cardinality(p_staff_ids) = 0
        or cs.id = any(p_staff_ids)
      )
  ),
  agg as (
    select
      count(*)::integer as mechanic_count,
      coalesce(round(avg(expertise), 2), 0)::numeric as avg_expertise,
      coalesce(round(avg(experience), 2), 0)::numeric as avg_experience,
      coalesce(round(avg(potential), 2), 0)::numeric as avg_potential,
      coalesce(round(avg(leadership), 2), 0)::numeric as avg_leadership,
      coalesce(round(avg(efficiency), 2), 0)::numeric as avg_efficiency,
      coalesce(round(avg(loyalty), 2), 0)::numeric as avg_loyalty
    from selected_mechanics
  ),
  scored as (
    select
      a.*,
      coalesce(w.infrastructure_club_id, p_club_id) as infrastructure_club_id,
      coalesce(w.is_developing_team, false) as is_developing_team,
      coalesce(w.mechanics_workshop_level, 0)::integer as mechanics_workshop_level,
      coalesce(w.workshop_repair_speed_bonus_bps, 0)::numeric / 100.0 as workshop_maintenance_speed_bonus_pct,
      coalesce(w.workshop_repair_cost_discount_bps, 0)::numeric / 100.0 as workshop_maintenance_cost_discount_pct,
      coalesce(w.workshop_condition_loss_reduction_bps, 0)::numeric / 100.0 as workshop_condition_loss_reduction_pct,
      coalesce(w.workshop_mechanical_risk_reduction_bps, 0)::numeric / 100.0 as workshop_mechanical_risk_reduction_pct,
      case
        when a.mechanic_count <= 0 then 0::numeric
        else round(
          a.avg_expertise * 0.35
          + a.avg_efficiency * 0.30
          + a.avg_experience * 0.20
          + a.avg_leadership * 0.10
          + a.avg_loyalty * 0.05,
          2
        )
      end as mechanic_score
    from agg a
    cross join workshop w
  ),
  effects as (
    select
      s.*,
      case when mechanic_count <= 0 then 0
        else least(20, round(greatest(0, mechanic_score - 40) / 3.0 + greatest(mechanic_count - 1, 0) * 1.5, 1))
      end::numeric as staff_maintenance_speed_bonus_pct,
      case when mechanic_count <= 0 then 0
        else least(15, round(greatest(0, mechanic_score - 50) / 4.0 + greatest(mechanic_count - 1, 0) * 0.75, 1))
      end::numeric as staff_maintenance_cost_discount_pct,
      case when mechanic_count <= 0 then 0
        else least(10, round(greatest(0, mechanic_score - 35) / 6.0 + greatest(mechanic_count - 1, 0) * 0.60, 1))
      end::numeric as staff_mechanical_risk_reduction_pct,
      case when mechanic_count <= 0 then 0
        else least(12, round(greatest(0, mechanic_score - 35) / 6.0 + greatest(mechanic_count - 1, 0) * 0.70, 1))
      end::numeric as staff_condition_loss_reduction_pct,
      least(
        12,
        round(
          case
            when mechanic_count <= 0 then mechanics_workshop_level * 0.5
            else mechanic_score / 12.0 + greatest(mechanic_count - 1, 0) * 0.5 + mechanics_workshop_level * 0.5
          end,
          1
        )
      )::numeric as setup_quality_bonus
    from scored s
  )
  select jsonb_build_object(
    'infrastructure_club_id', infrastructure_club_id,
    'is_developing_team', is_developing_team,
    'mechanic_count', mechanic_count,
    'mechanic_score', mechanic_score,
    'avg_expertise', avg_expertise,
    'avg_experience', avg_experience,
    'avg_potential', avg_potential,
    'avg_leadership', avg_leadership,
    'avg_efficiency', avg_efficiency,
    'avg_loyalty', avg_loyalty,
    'mechanics_workshop_level', mechanics_workshop_level,
    'workshop_maintenance_speed_bonus_pct', workshop_maintenance_speed_bonus_pct,
    'workshop_maintenance_cost_discount_pct', workshop_maintenance_cost_discount_pct,
    'workshop_mechanical_risk_reduction_pct', workshop_mechanical_risk_reduction_pct,
    'workshop_condition_loss_reduction_pct', workshop_condition_loss_reduction_pct,
    'staff_maintenance_speed_bonus_pct', staff_maintenance_speed_bonus_pct,
    'staff_maintenance_cost_discount_pct', staff_maintenance_cost_discount_pct,
    'staff_mechanical_risk_reduction_pct', staff_mechanical_risk_reduction_pct,
    'staff_condition_loss_reduction_pct', staff_condition_loss_reduction_pct,
    'maintenance_speed_bonus_pct', least(45, workshop_maintenance_speed_bonus_pct + staff_maintenance_speed_bonus_pct),
    'maintenance_cost_discount_pct', least(40, workshop_maintenance_cost_discount_pct + staff_maintenance_cost_discount_pct),
    'mechanical_risk_reduction_pct', least(15, workshop_mechanical_risk_reduction_pct + staff_mechanical_risk_reduction_pct),
    'condition_loss_reduction_pct', least(18, workshop_condition_loss_reduction_pct + staff_condition_loss_reduction_pct),
    'setup_quality_bonus', setup_quality_bonus,
    'summary', case
      when mechanic_count <= 0 and mechanics_workshop_level <= 0 then 'No active mechanic support.'
      when mechanic_count <= 0 then 'Mechanics Workshop support active, but no active mechanic assigned.'
      else 'Active Mechanics Workshop and mechanic gameplay support is live.'
    end
  )
  from effects;
$function$;

do $block$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_club_staff_role_capacity'
    and pg_get_function_identity_arguments(p.oid) = 'p_club_id uuid'
  limit 1;

  if v_oid is null then
    raise exception 'get_club_staff_role_capacity(uuid) not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_old := $needle$
        when rr.role_type in ('head_coach', 'mechanic', 'scout_analyst') then
          case when i.hq_level >= 1 then 1 else 0 end
$needle$;
  v_new := $replacement$
        when rr.role_type in ('head_coach', 'scout_analyst') then
          case when i.hq_level >= 1 then 1 else 0 end
        when rr.role_type = 'mechanic' then
          case
            when i.hq_level < 1 then 0
            when i.mechanics_workshop_level >= 4 then 5
            when i.mechanics_workshop_level >= 3 then 4
            when i.mechanics_workshop_level >= 2 then 3
            when i.mechanics_workshop_level >= 1 then 2
            else 1
          end
$replacement$;

  if position(v_old in v_def) = 0 then
    raise exception 'Could not find expected mechanic capacity block in get_club_staff_role_capacity';
  end if;

  execute replace(v_def, v_old, v_new);
end;
$block$;

insert into finance.transaction_types (
  code, name, category, description, is_user_visible, affects_weekly, is_taxable, tax_rate_bps
)
values (
  'mechanics_workshop_monthly_maintenance',
  'Mechanics Workshop Monthly Maintenance',
  'expense',
  'Monthly maintenance cost for the current Mechanics Workshop level.',
  true,
  true,
  false,
  0
)
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_user_visible = excluded.is_user_visible,
  affects_weekly = excluded.affects_weekly,
  is_taxable = excluded.is_taxable,
  tax_rate_bps = excluded.tax_rate_bps,
  updated_at = now();

create or replace function public.finance_process_monthly_mechanics_workshop_maintenance_v1()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'finance', 'pg_temp'
as $function$
declare
  v_game_date date;
  v_period_key text;
  r record;
  v_existing uuid;
  v_tx uuid;
  v_funds jsonb;
  v_processed integer := 0;
  v_charged integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_total bigint := 0;
begin
  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then return jsonb_build_object('ok', false, 'reason', 'game_date_missing'); end if;
  if extract(day from v_game_date)::integer <> 1 then
    return jsonb_build_object('ok', true, 'did_run', false, 'reason', 'not_month_start', 'game_date', v_game_date);
  end if;

  v_period_key := to_char(v_game_date, 'YYYY-MM');

  for r in
    select c.id as club_id, e.mechanics_workshop_level, e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_mechanics_workshop_effects(c.id) e on true
    where c.club_type = 'main'
      and c.deleted_at is null
      and coalesce(c.is_active, true) = true
      and c.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
      and coalesce(e.monthly_maintenance_cash, 0) > 0
  loop
    v_processed := v_processed + 1;

    select t.id into v_existing
    from finance.transactions t
    where t.idempotency_key = 'mechanics_workshop_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    limit 1;

    if v_existing is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_funds := public.finance_ensure_mandatory_funds(
      r.club_id,
      r.monthly_maintenance_cash,
      'mechanics_workshop_monthly_maintenance',
      v_period_key,
      'mandatory_funds:mechanics_workshop_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    );

    if coalesce((v_funds->>'ok')::boolean, false) is not true then
      v_failed := v_failed + 1;
      continue;
    end if;

    v_tx := public.finance_spend_from_club(
      r.club_id,
      r.monthly_maintenance_cash,
      'mechanics_workshop_monthly_maintenance',
      'SINK',
      'mechanics_workshop_monthly_maintenance:' || r.club_id::text || ':' || v_period_key,
      jsonb_build_object(
        'club_id', r.club_id,
        'mechanics_workshop_level', r.mechanics_workshop_level,
        'monthly_maintenance_cash', r.monthly_maintenance_cash,
        'period_key', v_period_key,
        'game_date', v_game_date,
        'source', 'mechanics_workshop_monthly_maintenance'
      )
    );

    v_charged := v_charged + 1;
    v_total := v_total + r.monthly_maintenance_cash;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'did_run', true,
    'game_date', v_game_date,
    'period_key', v_period_key,
    'processed', v_processed,
    'charged', v_charged,
    'skipped', v_skipped,
    'failed', v_failed,
    'total_charged', v_total
  );
end;
$function$;

do $block$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finance_run_due_monthly_tax_audits'
    and pg_get_function_identity_arguments(p.oid) = 'p_notify boolean'
  limit 1;

  if v_oid is null then
    raise exception 'finance_run_due_monthly_tax_audits(boolean) not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('finance_process_monthly_mechanics_workshop_maintenance_v1' in v_def) = 0 then
    v_old := 'perform public.finance_process_monthly_youth_academy_maintenance_v1();';
    v_new := v_old || E'\n  perform public.finance_process_monthly_mechanics_workshop_maintenance_v1();';
    if position(v_old in v_def) = 0 then
      raise exception 'Could not find Youth Academy monthly hook in finance_run_due_monthly_tax_audits';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end;
$block$;