update public.infrastructure_facility_upgrade_config
set
  cost_cash = case target_level when 1 then 200000 when 2 then 500000 when 3 then 1200000 when 4 then 2800000 else cost_cash end,
  duration_game_days = case target_level when 1 then 45 when 2 then 90 when 3 then 150 when 4 then 240 else duration_game_days end,
  monthly_maintenance_cash = case target_level when 1 then 2000 when 2 then 4500 when 3 then 8000 when 4 then 13000 else monthly_maintenance_cash end,
  unlock_summary = case target_level
    when 1 then 'Unlocks second Scout / Analyst slot.'
    when 2 then 'Unlocks third Scout / Analyst slot plus Solid report quality.'
    when 3 then 'Unlocks fourth Scout / Analyst slot plus Strong report quality.'
    when 4 then 'Unlocks fifth Scout / Analyst slot plus Elite report quality.'
    else unlock_summary end,
  effect_summary = case target_level
    when 1 then 'Scout capacity 2; Basic report-quality cap; attributes are shown in approximately 10-point ranges; applies club-wide to First Team and U23.'
    when 2 then 'Scout capacity 3; Solid report-quality cap; attributes are shown in approximately 5-point ranges; applies club-wide to First Team and U23.'
    when 3 then 'Scout capacity 4; Strong report-quality cap; attributes are shown in approximately 3-point ranges; applies club-wide to First Team and U23.'
    when 4 then 'Scout capacity 5; Elite report-quality cap; elite-quality scouts can reveal exact values; applies club-wide to First Team and U23.'
    else effect_summary end,
  updated_at = now()
where facility_key = 'scouting_office' and target_level between 1 and 4;

create or replace function public.get_scouting_office_effects(p_club_id uuid)
returns table(
  infrastructure_club_id uuid,
  is_developing_team boolean,
  scouting_level integer,
  monthly_maintenance_cash bigint,
  scout_capacity integer,
  report_quality_cap text
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  with resolved as (
    select coalesce(c.parent_club_id, c.id, p_club_id) as infrastructure_club_id,
           (coalesce(c.club_type, 'main') = 'developing') as is_developing_team
    from public.clubs c where c.id = p_club_id
    union all
    select p_club_id, false
    where not exists (select 1 from public.clubs c where c.id = p_club_id)
    limit 1
  ), infra as (
    select r.infrastructure_club_id, r.is_developing_team,
           coalesce(ci.scouting_level, 0)::integer as scouting_level
    from resolved r
    left join public.club_infrastructure ci on ci.club_id = r.infrastructure_club_id
  )
  select i.infrastructure_club_id,
         i.is_developing_team,
         i.scouting_level,
         coalesce(cfg.monthly_maintenance_cash, 0)::bigint,
         case when i.scouting_level >= 4 then 5 when i.scouting_level >= 3 then 4 when i.scouting_level >= 2 then 3 when i.scouting_level >= 1 then 2 else 1 end::integer,
         case when i.scouting_level >= 4 then 'elite' when i.scouting_level >= 3 then 'strong' when i.scouting_level >= 2 then 'solid' else 'basic' end::text
  from infra i
  left join public.infrastructure_facility_upgrade_config cfg
    on cfg.facility_key = 'scouting_office' and cfg.target_level = i.scouting_level;
$function$;

do $block$
declare v_oid oid; v_def text; v_old text; v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_club_staff_role_capacity'
    and pg_get_function_identity_arguments(p.oid)='p_club_id uuid' limit 1;
  if v_oid is null then raise exception 'get_club_staff_role_capacity(uuid) not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  v_old := $needle$
        when rr.role_type in ('head_coach', 'scout_analyst') then
          case when i.hq_level >= 1 then 1 else 0 end
$needle$;
  v_new := $replacement$
        when rr.role_type = 'head_coach' then
          case when i.hq_level >= 1 then 1 else 0 end
        when rr.role_type = 'scout_analyst' then
          case
            when i.hq_level < 1 then 0
            when i.scouting_level >= 4 then 5
            when i.scouting_level >= 3 then 4
            when i.scouting_level >= 2 then 3
            when i.scouting_level >= 1 then 2
            else 1
          end
$replacement$;
  if position(v_old in v_def)=0 then raise exception 'Could not find expected Scout / Analyst capacity block'; end if;
  execute replace(v_def,v_old,v_new);
end;
$block$;

create or replace function public.build_scout_metric_json(p_exact numeric, p_precision_tier text)
returns jsonb
language plpgsql
immutable
as $function$
declare
  v_step integer; v_exact integer; v_bucket_index integer; v_bucket_count integer;
  v_lower integer; v_upper integer; v_label text;
  v_tier text := lower(trim(coalesce(p_precision_tier, 'basic')));
begin
  if p_exact is null then return jsonb_build_object('label', null, 'exact', null); end if;
  v_exact := greatest(0, least(100, round(p_exact)::integer));
  v_step := public.scout_metric_bucket_step(v_tier);
  if v_step <= 1 then
    v_label := v_exact::text;
  else
    v_bucket_count := 100 / v_step;
    v_bucket_index := least(floor(v_exact::numeric / v_step)::integer, v_bucket_count - 1);
    v_lower := v_bucket_index * v_step;
    v_upper := least(100, v_lower + v_step);
    v_label := format('%s-%s', v_lower, v_upper);
  end if;
  return jsonb_build_object('label', v_label, 'exact', case when v_tier='elite' then v_exact else null end);
end;
$function$;

create or replace function public.scout_metric_label_midpoint_v1(p_label text)
returns numeric
language plpgsql
immutable
as $function$
declare v_label text := trim(coalesce(p_label,'')); v_match text[];
begin
  if v_label='' then return null; end if;
  if v_label ~ '^\d+(\.\d+)?$' then return v_label::numeric; end if;
  v_match := regexp_match(v_label, '^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$');
  if v_match is null then return null; end if;
  return (v_match[1]::numeric + v_match[2]::numeric) / 2.0;
end;
$function$;

create or replace function public.get_my_scouting_reports_overview()
returns table(report_id uuid, rider_id uuid, rider_name text, rider_country_code text, scout_staff_id uuid, scout_name text, completed_at timestamp without time zone, overall_label text, potential_label text, strengths text[], notes text, status text)
language sql
security definer
set search_path='public'
as $function$
  select rsr.id,
    rsr.rider_id,
    coalesce(nullif(r.display_name,''),nullif(trim(concat_ws(' ',r.first_name,r.last_name)),''),nullif(rsr.report_json->>'rider_name',''),'Unknown rider')::text,
    r.country_code::text,
    rsr.scout_staff_id,
    coalesce(cs.staff_name,'Scout')::text,
    coalesce(rsr.created_at_game_ts,rsr.scouted_on_game_date::timestamp)::timestamp without time zone,
    coalesce(rsr.report_json #>> '{overall,label}','—')::text,
    case
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 80 then 'Elite'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 65 then 'High'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 45 then 'Medium'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') >= 25 then 'Low'
      when public.scout_metric_label_midpoint_v1(rsr.report_json #>> '{potential,label}') is not null then 'Very Low'
      else '—'
    end::text,
    (select coalesce(array_agg(label order by val desc nulls last),array[]::text[])
     from (select initcap(replace(key,'_',' ')) as label,
                  public.scout_metric_label_midpoint_v1(value->>'label') as val
           from jsonb_each(coalesce(rsr.report_json->'attributes','{}'::jsonb))
           where public.scout_metric_label_midpoint_v1(value->>'label') is not null
           order by public.scout_metric_label_midpoint_v1(value->>'label') desc limit 3) s),
    nullif(rsr.report_json->>'notes','')::text,
    coalesce(rsr.report_json->>'status','new')::text
  from public.rider_scout_reports rsr
  left join public.riders r on r.id=rsr.rider_id
  left join public.club_staff cs on cs.id=rsr.scout_staff_id
  where rsr.club_id=public.resolve_main_club_id_for_user(auth.uid())
  order by coalesce(rsr.created_at_game_ts,rsr.scouted_on_game_date::timestamp) desc nulls last;
$function$;

do $block$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='start_rider_scout_task_v1'
    and pg_get_function_identity_arguments(p.oid)='p_rider_id uuid, p_scout_staff_id uuid, p_requesting_user_id uuid' limit 1;
  if v_oid is null then raise exception 'start_rider_scout_task_v1 not found'; end if;
  v_def := pg_get_functiondef(v_oid);

  if position('if v_wallet_balance < 1 then' in v_def)=0 then raise exception 'Expected scout wallet check not found'; end if;
  v_def := replace(v_def,'if v_wallet_balance < 1 then','if v_wallet_balance < v_coin_cost then');

  if position('free_reports_used = sdu.free_reports_used + case when v_coin_cost = 0 then 3 else 0 end' in v_def)=0 then raise exception 'Expected free-report usage increment not found'; end if;
  v_def := replace(v_def,'free_reports_used = sdu.free_reports_used + case when v_coin_cost = 0 then 3 else 0 end','free_reports_used = sdu.free_reports_used + case when v_coin_cost = 0 then 1 else 0 end');

  if position('paid_reports_used = sdu.paid_reports_used + case when v_coin_cost > 0 then 3 else 0 end' in v_def)=0 then raise exception 'Expected paid-report usage increment not found'; end if;
  v_def := replace(v_def,'paid_reports_used = sdu.paid_reports_used + case when v_coin_cost > 0 then 3 else 0 end','paid_reports_used = sdu.paid_reports_used + case when v_coin_cost > 0 then 1 else 0 end');

  if v_def !~ E'-1,\\s*''scout_report_extra''' then raise exception 'Expected scout coin ledger delta not found'; end if;
  v_def := regexp_replace(v_def,E'-1,(\\s*''scout_report_extra'')',E'-v_coin_cost,\\1');

  if position('''cost'', 1' in v_def)=0 then raise exception 'Expected scout ledger cost payload not found'; end if;
  v_def := replace(v_def,'''cost'', 1','''cost'', v_coin_cost');

  if position('set balance = balance - 1' in v_def)=0 then raise exception 'Expected scout wallet deduction not found'; end if;
  v_def := replace(v_def,'set balance = balance - 1','set balance = balance - v_coin_cost');

  if position('v_wallet_balance := v_wallet_balance - 1;' in v_def)=0 then raise exception 'Expected local wallet deduction not found'; end if;
  v_def := replace(v_def,'v_wallet_balance := v_wallet_balance - 1;','v_wallet_balance := v_wallet_balance - v_coin_cost;');

  if position('case when v_is_paid then 0 else 3 end' in v_def)=0 then raise exception 'Expected free-report-left calculation not found'; end if;
  v_def := replace(v_def,'case when v_is_paid then 0 else 3 end','case when v_is_paid then 0 else 1 end');

  execute v_def;
end;
$block$;

insert into finance.transaction_types(code,name,category,description,is_user_visible,affects_weekly,is_taxable,tax_rate_bps)
values('scouting_office_monthly_maintenance','Scouting Office Monthly Maintenance','expense','Monthly maintenance cost for the current Scouting Office level.',true,true,false,0)
on conflict(code) do update set name=excluded.name,category=excluded.category,description=excluded.description,is_user_visible=excluded.is_user_visible,affects_weekly=excluded.affects_weekly,is_taxable=excluded.is_taxable,tax_rate_bps=excluded.tax_rate_bps,updated_at=now();

create or replace function public.finance_process_monthly_scouting_office_maintenance_v1()
returns jsonb
language plpgsql
security definer
set search_path='public','finance','pg_temp'
as $function$
declare
  v_game_date date; v_period_key text; r record; v_existing uuid; v_tx uuid; v_funds jsonb;
  v_processed integer:=0; v_charged integer:=0; v_skipped integer:=0; v_failed integer:=0; v_total bigint:=0;
begin
  v_game_date:=public.get_current_game_date_date();
  if v_game_date is null then return jsonb_build_object('ok',false,'reason','game_date_missing'); end if;
  if extract(day from v_game_date)::integer<>1 then return jsonb_build_object('ok',true,'did_run',false,'reason','not_month_start','game_date',v_game_date); end if;
  v_period_key:=to_char(v_game_date,'YYYY-MM');
  for r in
    select c.id as club_id,e.scouting_level,e.monthly_maintenance_cash
    from public.clubs c join lateral public.get_scouting_office_effects(c.id) e on true
    where c.club_type='main' and c.deleted_at is null and coalesce(c.is_active,true)=true
      and c.owner_user_id is not null and coalesce(c.is_ai,false)=false
      and coalesce(e.monthly_maintenance_cash,0)>0
  loop
    v_processed:=v_processed+1;
    select t.id into v_existing from finance.transactions t
    where t.idempotency_key='scouting_office_monthly_maintenance:'||r.club_id::text||':'||v_period_key limit 1;
    if v_existing is not null then v_skipped:=v_skipped+1; continue; end if;
    v_funds:=public.finance_ensure_mandatory_funds(r.club_id,r.monthly_maintenance_cash,'scouting_office_monthly_maintenance',v_period_key,'mandatory_funds:scouting_office_monthly_maintenance:'||r.club_id::text||':'||v_period_key);
    if coalesce((v_funds->>'ok')::boolean,false) is not true then v_failed:=v_failed+1; continue; end if;
    v_tx:=public.finance_spend_from_club(r.club_id,r.monthly_maintenance_cash,'scouting_office_monthly_maintenance','SINK','scouting_office_monthly_maintenance:'||r.club_id::text||':'||v_period_key,
      jsonb_build_object('club_id',r.club_id,'scouting_level',r.scouting_level,'monthly_maintenance_cash',r.monthly_maintenance_cash,'period_key',v_period_key,'game_date',v_game_date,'source','scouting_office_monthly_maintenance'));
    v_charged:=v_charged+1; v_total:=v_total+r.monthly_maintenance_cash;
  end loop;
  return jsonb_build_object('ok',v_failed=0,'did_run',true,'game_date',v_game_date,'period_key',v_period_key,'processed',v_processed,'charged',v_charged,'skipped',v_skipped,'failed',v_failed,'total_charged',v_total);
end;
$function$;

do $block$
declare v_oid oid; v_def text; v_old text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='finance_run_due_monthly_tax_audits' and pg_get_function_identity_arguments(p.oid)='p_notify boolean' limit 1;
  if v_oid is null then raise exception 'finance_run_due_monthly_tax_audits(boolean) not found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  if position('finance_process_monthly_scouting_office_maintenance_v1' in v_def)=0 then
    v_old:='perform public.finance_process_monthly_mechanics_workshop_maintenance_v1();';
    if position(v_old in v_def)=0 then raise exception 'Mechanics Workshop monthly hook not found'; end if;
    v_def:=replace(v_def,v_old,v_old||E'\n  perform public.finance_process_monthly_scouting_office_maintenance_v1();');
    execute v_def;
  end if;
end;
$block$;