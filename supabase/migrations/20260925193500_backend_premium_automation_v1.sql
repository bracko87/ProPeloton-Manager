begin;

create or replace function public.jsonb_object_length(p_value jsonb)
returns integer
language sql
immutable
parallel safe
as $function$
  select count(*)::integer
  from jsonb_object_keys(coalesce(p_value,'{}'::jsonb));
$function$;

grant execute on function public.jsonb_object_length(jsonb) to anon,authenticated,service_role;

create or replace function public.equipment_purchase_race_supplies_system_v1(
  p_club_id uuid,
  p_catalog_item_id uuid,
  p_quantity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_catalog public.equipment_catalog%rowtype;
  v_current_game_date date:=coalesce(public.get_current_game_date_date(),current_date);
  v_quantity integer:=least(greatest(coalesce(p_quantity,1),1),10000);
  v_existing_hit boolean:=false;
  v_technical_company_id uuid;
  v_technical_sponsor_name text;
  v_technical_discount_pct numeric:=0;
  v_unit_price_cash bigint:=0;
  v_total_cost_cash bigint:=0;
  v_finance_tx_id uuid;
  v_result_row jsonb;
begin
  if p_club_id is null or p_catalog_item_id is null then
    raise exception 'Club and catalog item are required.';
  end if;

  if not exists(
    select 1 from public.clubs c
    where c.id=p_club_id and c.deleted_at is null
      and c.owner_user_id is not null and coalesce(c.is_ai,false)=false
  ) then
    raise exception 'Eligible user club not found.';
  end if;

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'Background purchases require an idempotency key.';
  end if;

  select exists(
    select 1
    from public.club_race_supplies crs
    cross join lateral jsonb_array_elements_text(
      coalesce(crs.metadata->'purchase_idempotency_keys','[]'::jsonb)
    ) k(value)
    where crs.club_id=p_club_id and k.value=p_idempotency_key
  ) into v_existing_hit;

  if v_existing_hit then
    return jsonb_build_object('ok',true,'idempotent',true,'club_id',p_club_id);
  end if;

  select * into v_catalog
  from public.equipment_catalog
  where id=p_catalog_item_id and is_active=true
  limit 1;

  if not found or v_catalog.equipment_kind<>'race_supply' then
    raise exception 'Race supply catalog item not found or inactive.';
  end if;

  select
    cs.company_id,
    coalesce(cs.name,sc.name),
    least(greatest(coalesce(nullif(to_jsonb(cs)->>'technical_discount_pct','')::numeric,0),0),95)
  into v_technical_company_id,v_technical_sponsor_name,v_technical_discount_pct
  from public.club_sponsors cs
  left join public.sponsor_companies sc on sc.id=cs.company_id
  where cs.club_id=p_club_id
    and cs.sponsor_kind='technical'
    and cs.status='active'
  order by cs.created_at desc
  limit 1;

  if v_technical_company_id is null
     or v_catalog.brand_company_id is null
     or v_catalog.brand_company_id<>v_technical_company_id
  then
    v_technical_discount_pct:=0;
  end if;

  v_unit_price_cash:=floor(v_catalog.base_price_cash*(1-v_technical_discount_pct/100.0))::bigint;
  v_total_cost_cash:=v_unit_price_cash*v_quantity;

  perform set_config('finance.internal','1',true);

  v_finance_tx_id:=public.finance_spend_from_club(
    p_club_id,v_total_cost_cash,'race_supplies_purchase','SINK',p_idempotency_key,
    jsonb_build_object(
      'catalog_item_id',v_catalog.id,'item_key',v_catalog.item_key,
      'display_name',v_catalog.display_name,'supply_key',v_catalog.equipment_category,
      'quantity',v_quantity,'unit_price_cash',v_unit_price_cash,
      'total_cost_cash',v_total_cost_cash,'base_price_cash',v_catalog.base_price_cash,
      'technical_discount_pct',v_technical_discount_pct,
      'technical_sponsor_company_id',v_technical_company_id,
      'technical_sponsor_name',v_technical_sponsor_name,
      'source','equipment_auto_restock_backend'
    )
  );

  insert into public.club_race_supplies(
    club_id,supply_key,display_name,preferred_brand_company_id,
    quantity_available,total_purchased,total_used,last_purchased_game_date,metadata
  )
  values(
    p_club_id,v_catalog.equipment_category,v_catalog.display_name,v_catalog.brand_company_id,
    v_quantity,v_quantity,0,v_current_game_date,
    jsonb_build_object(
      'last_purchase_finance_transaction_id',v_finance_tx_id,
      'last_purchase_idempotency_key',p_idempotency_key,
      'purchase_idempotency_keys',jsonb_build_array(p_idempotency_key),
      'catalog_item_key',v_catalog.item_key,'unit_price_cash',v_unit_price_cash,
      'technical_discount_pct',v_technical_discount_pct,
      'technical_sponsor_company_id',v_technical_company_id,
      'technical_sponsor_name',v_technical_sponsor_name,
      'last_purchased_at',now(),'last_purchase_source','automatic_restock'
    )
  )
  on conflict(club_id,supply_key) do update
  set display_name=excluded.display_name,
      preferred_brand_company_id=coalesce(excluded.preferred_brand_company_id,club_race_supplies.preferred_brand_company_id),
      quantity_available=club_race_supplies.quantity_available+excluded.quantity_available,
      total_purchased=club_race_supplies.total_purchased+excluded.total_purchased,
      last_purchased_game_date=excluded.last_purchased_game_date,
      metadata=jsonb_set(
        coalesce(club_race_supplies.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'last_purchase_finance_transaction_id',v_finance_tx_id,
          'last_purchase_idempotency_key',p_idempotency_key,
          'catalog_item_key',v_catalog.item_key,'unit_price_cash',v_unit_price_cash,
          'technical_discount_pct',v_technical_discount_pct,
          'technical_sponsor_company_id',v_technical_company_id,
          'technical_sponsor_name',v_technical_sponsor_name,
          'last_purchased_at',now(),'last_purchase_source','automatic_restock'
        ),
        '{purchase_idempotency_keys}',
        coalesce(club_race_supplies.metadata->'purchase_idempotency_keys','[]'::jsonb)
          || jsonb_build_array(p_idempotency_key),
        true
      ),
      updated_at=now()
  returning to_jsonb(public.club_race_supplies.*) into v_result_row;

  return jsonb_build_object(
    'ok',true,'club_id',p_club_id,'supply_key',v_catalog.equipment_category,
    'quantity',v_quantity,'total_cost_cash',v_total_cost_cash,
    'finance_transaction_id',v_finance_tx_id,'race_supply_row',v_result_row
  );
end;
$function$;

revoke all on function public.equipment_purchase_race_supplies_system_v1(uuid,uuid,integer,text)
from public,anon,authenticated;
grant execute on function public.equipment_purchase_race_supplies_system_v1(uuid,uuid,integer,text)
to service_role;

create or replace function public.equipment_process_auto_restock_rules_v1()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  r record;
  v_catalog_id uuid;
  v_current_stock integer;
  v_total_used integer;
  v_game_date date:=coalesce(public.get_current_game_date_date(),current_date);
  v_key text;
  v_result jsonb;
  v_attempted integer:=0;
  v_purchased integer:=0;
  v_failed integer:=0;
begin
  for r in
    select ar.club_id,ar.supply_key,ar.minimum_stock,ar.order_quantity,
           ar.updated_at rule_updated_at,c.owner_user_id
    from public.equipment_auto_restock_rules ar
    join public.clubs c on c.id=ar.club_id
    where ar.enabled=true
      and c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and public.user_has_premium_access_v1(c.owner_user_id)
    order by ar.club_id,ar.supply_key
    for update of ar skip locked
  loop
    select coalesce(crs.quantity_available,0),coalesce(crs.total_used,0)
    into v_current_stock,v_total_used
    from public.club_race_supplies crs
    where crs.club_id=r.club_id and crs.supply_key=r.supply_key;

    v_current_stock:=coalesce(v_current_stock,0);
    v_total_used:=coalesce(v_total_used,0);
    if v_current_stock>=r.minimum_stock then continue; end if;

    select ec.id into v_catalog_id
    from public.equipment_catalog ec
    left join public.club_race_supplies crs
      on crs.club_id=r.club_id and crs.supply_key=r.supply_key
    left join lateral(
      select cs.company_id
      from public.club_sponsors cs
      where cs.club_id=r.club_id and cs.sponsor_kind='technical' and cs.status='active'
      order by cs.created_at desc limit 1
    ) sponsor on true
    where ec.is_active=true
      and ec.equipment_kind='race_supply'
      and ec.equipment_category=r.supply_key
    order by
      case when crs.preferred_brand_company_id is not null
                 and ec.brand_company_id=crs.preferred_brand_company_id then 0 else 1 end,
      case when sponsor.company_id is not null
                 and ec.brand_company_id=sponsor.company_id then 0 else 1 end,
      ec.base_price_cash asc,ec.id
    limit 1;

    if v_catalog_id is null then
      v_failed:=v_failed+1;
      continue;
    end if;

    v_attempted:=v_attempted+1;
    v_key:=format(
      'race_supplies_auto_restock:%s:%s:%s:%s:%s',
      r.club_id,r.supply_key,v_game_date,v_total_used,v_current_stock
    );

    begin
      v_result:=public.equipment_purchase_race_supplies_system_v1(
        r.club_id,v_catalog_id,greatest(1,r.order_quantity),v_key
      );
      if coalesce((v_result->>'ok')::boolean,false) then
        v_purchased:=v_purchased+1;
      end if;
    exception when others then
      v_failed:=v_failed+1;
      perform public.create_user_game_notification_v1(
        r.owner_user_id,'RACE_SUPPLIES_LOW','Automatic restock could not complete',
        format('%s is below your automatic restock threshold (%s < %s), but the purchase could not be completed.',
               replace(initcap(replace(r.supply_key,'_',' ')),'  ',' '),
               v_current_stock,r.minimum_stock),
        '/dashboard/equipment?tab=supplies',
        jsonb_build_object(
          'club_id',r.club_id,'supply_key',r.supply_key,'current_stock',v_current_stock,
          'minimum_stock',r.minimum_stock,'order_quantity',r.order_quantity,
          'automatic_restock',true,'error',sqlerrm,'game_date',v_game_date
        ),
        format('auto_restock_failed:%s:%s:%s',r.club_id,r.supply_key,v_game_date),
        null
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok',true,'attempted',v_attempted,'purchased',v_purchased,'failed',v_failed,'game_date',v_game_date
  );
end;
$function$;

revoke all on function public.equipment_process_auto_restock_rules_v1()
from public,anon,authenticated;
grant execute on function public.equipment_process_auto_restock_rules_v1() to service_role;

do $$
begin
  if not exists(select 1 from cron.job where jobname='equipment-auto-restock-v1') then
    perform cron.schedule(
      'equipment-auto-restock-v1',
      '12,27,42,57 * * * *',
      'select public.equipment_process_auto_restock_rules_v1();'
    );
  end if;
end
$$;

create or replace function public.premium_process_manager_automation_v1()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  rr record;
  rp record;
  v_context jsonb;
  v_focus text;
  v_intensity text;
  v_objective text;
  v_strategy text;
  v_risk text;
  v_training_applied integer:=0;
  v_strategy_applied integer:=0;
  v_today date:=coalesce(public.get_current_game_date_date(),current_date);
begin
  for rr in
    select
      rule.id rule_id,rule.club_id manager_club_id,rule.user_id,rule.match_json,
      t.payload_json,cr.club_id rider_club_id,cr.rider_id,
      coalesce(cr.assigned_role::text,r.role::text,'') role,
      coalesce(r.availability_status,'') availability_status
    from public.premium_manager_automation_rules_v1 rule
    join public.premium_manager_templates_v1 t
      on t.id=rule.template_id and t.club_id=rule.club_id and t.user_id=rule.user_id
    join public.clubs main on main.id=rule.club_id
    join public.club_riders cr
      on cr.club_id=rule.club_id
      or cr.club_id in (
        select child.id from public.clubs child
        where child.parent_club_id=rule.club_id and child.deleted_at is null
      )
    join public.riders r on r.id=cr.rider_id
    where rule.is_enabled=true
      and rule.rule_type='training_prefill'
      and t.template_type='training'
      and main.owner_user_id=rule.user_id
      and public.user_has_premium_access_v1(rule.user_id)
      and not exists(select 1 from public.rider_regular_training_plans p where p.rider_id=cr.rider_id)
      and not exists(
        select 1 from public.club_regular_training_automation a
        where a.club_id=cr.club_id and a.is_enabled=true
      )
    order by rule.club_id,cr.rider_id,
             public.jsonb_object_length(coalesce(rule.match_json,'{}'::jsonb)) desc,
             rule.updated_at desc
  loop
    v_context:=jsonb_build_object('availability_status',rr.availability_status,'role',rr.role);

    if exists(
      select 1 from jsonb_each_text(coalesce(rr.match_json,'{}'::jsonb)) m
      where coalesce(v_context->>m.key,'')<>m.value
    ) then continue; end if;

    if exists(select 1 from public.rider_regular_training_plans p where p.rider_id=rr.rider_id)
    then continue; end if;

    v_focus:=coalesce(nullif(rr.payload_json->>'focus_code',''),'general');
    if v_focus not in ('general','endurance','sprint','climbing','flat','time_trial','recovery','day_off')
    then v_focus:='general'; end if;

    v_intensity:=coalesce(nullif(rr.payload_json->>'intensity',''),'normal');
    if v_intensity not in ('recovery','light','normal','hard') then v_intensity:='normal'; end if;
    if v_focus in ('recovery','day_off') and v_intensity='hard' then v_intensity:='recovery'; end if;

    insert into public.rider_regular_training_plans(
      rider_id,club_id,focus_code,intensity,is_active,auto_when_free,preferred_days,updated_at
    )
    values(rr.rider_id,rr.rider_club_id,v_focus,v_intensity,true,true,null,now())
    on conflict(rider_id) do nothing;

    if found then
      update public.premium_manager_automation_rules_v1
      set last_matched_at=now(),updated_at=now()
      where id=rr.rule_id;
      v_training_applied:=v_training_applied+1;
    end if;
  end loop;

  for rp in
    select
      rule.id rule_id,rule.club_id manager_club_id,rule.user_id,rule.match_json,t.payload_json,
      rsp.id stage_plan_id,rsp.race_preparation_id,rsp.stage_id,
      coalesce(nullif(to_jsonb(rs)->>'terrain_type',''),
               nullif(to_jsonb(rs)->>'profile_type',''),'') terrain_type,
      coalesce(nullif(to_jsonb(rs)->>'profile_type',''),
               nullif(to_jsonb(rs)->>'terrain_type',''),'') profile_type,
      coalesce(nullif(to_jsonb(rs)->>'stage_format',''),
               nullif(to_jsonb(rs)->>'stage_type',''),
               nullif(to_jsonb(rs)->>'format',''),'road_race') stage_format
    from public.premium_manager_automation_rules_v1 rule
    join public.premium_manager_templates_v1 t
      on t.id=rule.template_id and t.club_id=rule.club_id and t.user_id=rule.user_id
    join public.clubs main on main.id=rule.club_id
    join public.race_preparations prep
      on (
        prep.club_id=rule.club_id
        or prep.participating_club_id=rule.club_id
        or prep.club_id in (
          select child.id from public.clubs child
          where child.parent_club_id=rule.club_id and child.deleted_at is null
        )
        or prep.participating_club_id in (
          select child.id from public.clubs child
          where child.parent_club_id=rule.club_id and child.deleted_at is null
        )
      )
    join public.race_stage_plans rsp on rsp.race_preparation_id=prep.id
    join public.race_stages rs on rs.id=rsp.stage_id
    where rule.is_enabled=true
      and rule.rule_type='strategy_prefill'
      and t.template_type='race'
      and main.owner_user_id=rule.user_id
      and public.user_has_premium_access_v1(rule.user_id)
      and rsp.status='draft'
      and rsp.last_saved_at is null
      and (rsp.opens_on_game_date is null or rsp.opens_on_game_date<=v_today)
      and (rsp.locks_on_game_date is null or rsp.locks_on_game_date>v_today)
      and not exists(
        select 1 from public.race_preparation_stage_plan_automation a
        where a.race_preparation_id=prep.id and coalesce(a.is_enabled,false)=true
      )
    order by rsp.id,
             public.jsonb_object_length(coalesce(rule.match_json,'{}'::jsonb)) desc,
             rule.updated_at desc
  loop
    v_context:=jsonb_build_object(
      'terrain_type',rp.terrain_type,'profile_type',rp.profile_type,'stage_format',rp.stage_format
    );

    if exists(
      select 1 from jsonb_each_text(coalesce(rp.match_json,'{}'::jsonb)) m
      where coalesce(v_context->>m.key,'')<>m.value
    ) then continue; end if;

    if exists(
      select 1 from public.race_stage_plans rsp
      where rsp.id=rp.stage_plan_id
        and coalesce(rsp.metadata->>'premium_automation_prefilled','false')='true'
    ) then continue; end if;

    v_objective:=coalesce(nullif(rp.payload_json->>'stage_objective',''),'balanced');
    if v_objective not in ('balanced','protect_gc','stage_win','sprint','kom','breakaway','safe_finish','recovery_day')
    then v_objective:='balanced'; end if;

    v_strategy:=coalesce(nullif(rp.payload_json->>'team_strategy',''),'balanced');
    if v_strategy not in ('balanced','aggressive','defensive','conservative','sprint_control',
                          'breakaway','gc_protection','climber_support','tt_balanced_pace',
                          'tt_fast_start','tt_negative_split','tt_all_out')
    then v_strategy:='balanced'; end if;

    v_risk:=coalesce(nullif(rp.payload_json->>'risk_level',''),'normal');
    if v_risk not in ('safe','normal','high') then v_risk:='normal'; end if;

    update public.race_stage_plans
    set stage_objective=v_objective,
        team_strategy=v_strategy,
        risk_level=v_risk,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'premium_automation_prefilled',true,
          'premium_automation_rule_id',rp.rule_id,
          'premium_automation_applied_at',now()
        ),
        updated_at=now()
    where id=rp.stage_plan_id and status='draft' and last_saved_at is null;

    if found then
      update public.premium_manager_automation_rules_v1
      set last_matched_at=now(),updated_at=now()
      where id=rp.rule_id;
      v_strategy_applied:=v_strategy_applied+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'training_prefills_applied',v_training_applied,
    'strategy_prefills_applied',v_strategy_applied,'game_date',v_today
  );
end;
$function$;

revoke all on function public.premium_process_manager_automation_v1()
from public,anon,authenticated;
grant execute on function public.premium_process_manager_automation_v1() to service_role;

do $$
begin
  if not exists(select 1 from cron.job where jobname='premium-manager-automation-v1') then
    perform cron.schedule(
      'premium-manager-automation-v1',
      '9,39 * * * *',
      'select public.premium_process_manager_automation_v1();'
    );
  end if;
end
$$;

insert into public.system_monitor_processes(
  process_key,label,category,description,source_kind,source_ref,
  user_sensitive,incident_severity,expected_interval_minutes,stale_after_minutes,
  email_alerts_enabled,is_enabled,sort_order,created_at,updated_at
)
values
('cron:equipment-maintenance-reminders-v1','Equipment maintenance reminders','Equipment',
 'Checks Premium maintenance thresholds and creates due equipment reminders.',
 'cron','equipment-maintenance-reminders-v1',true,'high',30,90,true,true,205,now(),now()),
('cron:equipment-auto-restock-v1','Equipment auto-restock','Equipment',
 'Executes Premium race-supply auto-restock rules in the backend.',
 'cron','equipment-auto-restock-v1',true,'high',15,60,true,true,206,now(),now()),
('cron:premium-manager-automation-v1','Premium manager automation','Premium',
 'Applies safe Premium training and race-strategy prefills to untouched drafts.',
 'cron','premium-manager-automation-v1',true,'high',30,90,true,true,207,now(),now()),
('cron:transfer-refresh-market-alerts-v1','Transfer market alerts','Transfers',
 'Refreshes Premium saved-search alerts for transfer riders, free agents and staff.',
 'cron','transfer-refresh-market-alerts-v1',true,'high',60,150,true,true,208,now(),now())
on conflict(process_key) do update
set label=excluded.label,category=excluded.category,description=excluded.description,
    source_kind=excluded.source_kind,source_ref=excluded.source_ref,
    user_sensitive=excluded.user_sensitive,incident_severity=excluded.incident_severity,
    expected_interval_minutes=excluded.expected_interval_minutes,
    stale_after_minutes=excluded.stale_after_minutes,
    email_alerts_enabled=excluded.email_alerts_enabled,is_enabled=excluded.is_enabled,
    sort_order=excluded.sort_order,updated_at=now();

commit;
