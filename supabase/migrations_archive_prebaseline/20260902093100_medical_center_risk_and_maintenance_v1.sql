insert into finance.transaction_types (
  code, name, category, description, is_user_visible, affects_weekly, is_taxable, tax_rate_bps
)
values (
  'medical_center_monthly_maintenance',
  'Medical Center Monthly Maintenance',
  'expense',
  'Monthly maintenance cost for the current Medical Center level.',
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

create or replace function public.finance_process_monthly_medical_center_maintenance_v1()
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
  if v_game_date is null then
    return jsonb_build_object('ok', false, 'reason', 'game_date_missing');
  end if;

  if extract(day from v_game_date)::integer <> 1 then
    return jsonb_build_object(
      'ok', true,
      'did_run', false,
      'reason', 'not_month_start',
      'game_date', v_game_date
    );
  end if;

  v_period_key := to_char(v_game_date, 'YYYY-MM');

  for r in
    select
      c.id as club_id,
      e.medical_center_level,
      e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_medical_center_effects(c.id) e on true
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
    where t.idempotency_key =
      'medical_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    limit 1;

    if v_existing is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_funds := public.finance_ensure_mandatory_funds(
      r.club_id,
      r.monthly_maintenance_cash,
      'medical_center_monthly_maintenance',
      v_period_key,
      'mandatory_funds:medical_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    );

    if coalesce((v_funds->>'ok')::boolean, false) is not true then
      v_failed := v_failed + 1;
      continue;
    end if;

    v_tx := public.finance_spend_from_club(
      r.club_id,
      r.monthly_maintenance_cash,
      'medical_center_monthly_maintenance',
      'SINK',
      'medical_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key,
      jsonb_build_object(
        'club_id', r.club_id,
        'medical_center_level', r.medical_center_level,
        'monthly_maintenance_cash', r.monthly_maintenance_cash,
        'period_key', v_period_key,
        'game_date', v_game_date,
        'source', 'medical_center_monthly_maintenance'
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
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'process_daily_fatigue'
    and pg_get_function_identity_arguments(p.oid) = ''
  limit 1;

  if v_oid is null then
    raise exception 'process_daily_fatigue() not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('health_get_medical_center_risk_multiplier_v1' in v_def) = 0 then
    v_new := replace(
      v_def,
      '* coalesce(v_doctor_risk_multiplier, 1.0)
          * case',
      '* coalesce(v_doctor_risk_multiplier, 1.0)
          * public.health_get_medical_center_risk_multiplier_v1(v_club_id)
          * case'
    );
    if v_new = v_def then
      raise exception 'Could not patch process_daily_fatigue medical-center risk hook';
    end if;
    execute v_new;
  end if;
end;
$block$;

do $block$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'process_daily_training_accidents_v1'
  limit 1;

  if v_oid is null then
    raise exception 'process_daily_training_accidents_v1 not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('health_get_medical_center_risk_multiplier_v1' in v_def) = 0 then
    v_new := replace(
      v_def,
      '* public.training_center_training_risk_multiplier_v1(v_club_id)',
      '* public.training_center_training_risk_multiplier_v1(v_club_id)
          * public.health_get_medical_center_risk_multiplier_v1(v_club_id)'
    );
    if v_new = v_def then
      raise exception 'Could not patch training accident medical-center risk hook';
    end if;
    execute v_new;
  end if;
end;
$block$;

do $block$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_rider_health_case'
  limit 1;

  if v_oid is null then
    raise exception 'create_rider_health_case not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('health_get_medical_center_fatigue_floor_reduction_v1' in v_def) = 0 then
    v_new := replace(
      v_def,
      'coalesce(p_fatigue_floor_on_return, 25)',
      'coalesce(p_fatigue_floor_on_return, 25) - public.health_get_medical_center_fatigue_floor_reduction_v1(public.health_get_medical_center_level_v1(v_club_id))'
    );
    if v_new = v_def then
      raise exception 'Could not patch legacy health-case fatigue floor';
    end if;
    execute v_new;
  end if;
end;
$block$;

do $block$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finance_run_due_monthly_tax_audits'
  limit 1;

  if v_oid is null then
    raise exception 'finance_run_due_monthly_tax_audits not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('finance_process_monthly_medical_center_maintenance_v1' in v_def) = 0 then
    v_new := replace(
      v_def,
      'perform public.finance_process_monthly_training_center_maintenance_v1();',
      'perform public.finance_process_monthly_training_center_maintenance_v1();
  perform public.finance_process_monthly_medical_center_maintenance_v1();'
    );
    if v_new = v_def then
      raise exception 'Could not patch monthly medical-center maintenance hook';
    end if;
    execute v_new;
  end if;
end;
$block$;
