insert into finance.transaction_types (
  code, name, category, description, is_user_visible, affects_weekly, is_taxable, tax_rate_bps
)
values (
  'youth_academy_monthly_maintenance',
  'Youth Academy Monthly Maintenance',
  'expense',
  'Monthly maintenance cost for the current Youth Academy level.',
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

create or replace function public.finance_process_monthly_youth_academy_maintenance_v1()
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
    select c.id as club_id, e.youth_academy_level, e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_youth_academy_effects(c.id) e on true
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
    where t.idempotency_key = 'youth_academy_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    limit 1;

    if v_existing is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_funds := public.finance_ensure_mandatory_funds(
      r.club_id,
      r.monthly_maintenance_cash,
      'youth_academy_monthly_maintenance',
      v_period_key,
      'mandatory_funds:youth_academy_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    );

    if coalesce((v_funds->>'ok')::boolean, false) is not true then
      v_failed := v_failed + 1;
      continue;
    end if;

    v_tx := public.finance_spend_from_club(
      r.club_id,
      r.monthly_maintenance_cash,
      'youth_academy_monthly_maintenance',
      'SINK',
      'youth_academy_monthly_maintenance:' || r.club_id::text || ':' || v_period_key,
      jsonb_build_object(
        'club_id', r.club_id,
        'youth_academy_level', r.youth_academy_level,
        'monthly_maintenance_cash', r.monthly_maintenance_cash,
        'period_key', v_period_key,
        'game_date', v_game_date,
        'source', 'youth_academy_monthly_maintenance'
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
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finance_run_due_monthly_tax_audits'
    and pg_get_function_identity_arguments(p.oid) = 'p_notify boolean'
  limit 1;

  if v_oid is null then raise exception 'finance_run_due_monthly_tax_audits not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position('finance_process_monthly_youth_academy_maintenance_v1' in v_def) = 0 then
    v_new := replace(
      v_def,
      'perform public.finance_process_monthly_medical_center_maintenance_v1();',
      'perform public.finance_process_monthly_medical_center_maintenance_v1();' || chr(10) || '  perform public.finance_process_monthly_youth_academy_maintenance_v1();'
    );
    if v_new = v_def then raise exception 'Could not patch monthly Youth Academy maintenance hook'; end if;
    execute v_new;
  end if;
end;
$block$;

create or replace function public.get_eligible_u23_head_coaches_for_race_v1(p_race_preparation_id uuid)
returns table(
  staff_id uuid,
  staff_name text,
  staff_club_id uuid,
  team_scope text,
  specialization text,
  expertise smallint,
  efficiency smallint,
  potential smallint,
  experience smallint,
  leadership smallint,
  loyalty smallint,
  current_availability_factor numeric,
  contract_expires_at date
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    cs.id as staff_id,
    cs.staff_name,
    cs.club_id as staff_club_id,
    cs.team_scope,
    cs.specialization,
    cs.expertise,
    cs.efficiency,
    cs.potential,
    cs.experience,
    cs.leadership,
    cs.loyalty,
    public.get_staff_assignment_availability_factor(cs.id, public.get_current_game_date_date()) as current_availability_factor,
    cs.contract_expires_at
  from public.race_preparations rp
  join public.clubs participating_club on participating_club.id = rp.participating_club_id
  join public.club_staff cs on cs.club_id in (rp.club_id, rp.participating_club_id)
  where rp.id = p_race_preparation_id
    and participating_club.club_type = 'developing'
    and participating_club.parent_club_id = rp.club_id
    and exists (
      select 1
      from public.get_youth_academy_effects(rp.participating_club_id) academy
      where academy.is_developing_team = true
        and academy.youth_academy_level >= 1
    )
    and cs.role_type = 'u23_head_coach'
    and cs.is_active = true
    and cs.team_scope in ('u23', 'all')
    and (cs.contract_expires_at is null or cs.contract_expires_at >= public.get_current_game_date_date())
  order by
    public.get_staff_assignment_availability_factor(cs.id, public.get_current_game_date_date()) desc,
    cs.expertise desc,
    cs.experience desc,
    cs.id;
$function$;

create or replace function public.set_regular_training_coach_automation_v1(
  p_club_id uuid,
  p_enabled boolean,
  p_manager_staff_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
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

  v_expected_role := case when v_club_type = 'developing' then 'u23_head_coach' else 'head_coach' end;

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

    select cs.id, cs.club_id, cs.staff_name, cs.role_type, cs.team_scope, cs.is_active
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
    v_generation := public.generate_coach_regular_training_plan_v1(p_club_id, public.get_current_game_date_date());
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

    v_generation := jsonb_build_object('ok', true, 'generated', false, 'reason', 'automation_disabled');
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
