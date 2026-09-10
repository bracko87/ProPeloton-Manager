-- Team Car balance, condition effectiveness, and production engine wear wiring.
-- Scoped to Team Cars only.

update public.infrastructure_asset_config
set
  asset_name = case asset_level
    when 1 then 'Basic Club Car'
    when 2 then 'Reliable Support Car'
    when 3 then 'Professional Team Car'
    when 4 then 'Elite Support Car'
    when 5 then 'World-Class Race Support Car'
    else asset_name
  end,
  cost_cash = case asset_level
    when 1 then 3000
    when 2 then 8000
    when 3 then 13000
    when 4 then 20000
    when 5 then 30000
    else cost_cash
  end,
  effect_summary = case asset_level
    when 1 then 'Race Support Coverage +1%; Feeding Support +1%; Mechanical Response +1%'
    when 2 then 'Race Support Coverage +2%; Feeding Support +1%; Mechanical Response +2%'
    when 3 then 'Race Support Coverage +3%; Tactical Communication +2%; Mechanical Response +3%; Incident Response +1%'
    when 4 then 'Race Support Coverage +4%; Tactical Communication +3%; Mechanical Response +4%; Incident Response +2%; Race Fatigue Protection -1%'
    when 5 then 'Race Support Quality +5%; Tactical Communication +4%; Feeding Support +2%; Mechanical Response +5%; Incident Response +3%; Race Fatigue Protection -1%'
    else effect_summary
  end
where asset_key = 'team_car'
  and asset_level between 1 and 5;

-- Existing active cars should use the current catalogue price for profile/resale logic.
update public.club_team_cars tc
set purchase_cost_cash = cfg.cost_cash
from public.infrastructure_asset_config cfg
where cfg.asset_key = 'team_car'
  and cfg.asset_level = tc.asset_level
  and tc.status <> 'sold'
  and tc.purchase_cost_cash is distinct from cfg.cost_cash;

-- Replace the old irregular Team Car race rules with a monotonic progression.
delete from public.race_plan_effect_rules
where source_type = 'asset'
  and source_key = 'team_car';

insert into public.race_plan_effect_rules
  (source_type, source_key, source_level, effect_key, effect_label, effect_unit,
   effect_value, display_prefix, display_suffix, is_positive_good, sort_order, is_active, metadata)
values
  ('asset','team_car',1,'race_support_coverage_pct','Race support coverage','percent', 1,'+','%',true,10,true,'{}'::jsonb),
  ('asset','team_car',1,'feeding_support_pct','Feeding support','percent', 1,'+','%',true,20,true,'{}'::jsonb),
  ('asset','team_car',1,'mechanical_response_pct','Mechanical response','percent', 1,'+','%',true,30,true,'{}'::jsonb),

  ('asset','team_car',2,'race_support_coverage_pct','Race support coverage','percent', 2,'+','%',true,10,true,'{}'::jsonb),
  ('asset','team_car',2,'feeding_support_pct','Feeding support','percent', 1,'+','%',true,20,true,'{}'::jsonb),
  ('asset','team_car',2,'mechanical_response_pct','Mechanical response','percent', 2,'+','%',true,30,true,'{}'::jsonb),

  ('asset','team_car',3,'race_support_coverage_pct','Race support coverage','percent', 3,'+','%',true,10,true,'{}'::jsonb),
  ('asset','team_car',3,'tactical_communication_pct','Tactical communication','percent', 2,'+','%',true,20,true,'{}'::jsonb),
  ('asset','team_car',3,'mechanical_response_pct','Mechanical response','percent', 3,'+','%',true,30,true,'{}'::jsonb),
  ('asset','team_car',3,'incident_response_pct','Incident response','percent', 1,'+','%',true,40,true,'{}'::jsonb),

  ('asset','team_car',4,'race_support_coverage_pct','Race support coverage','percent', 4,'+','%',true,10,true,'{}'::jsonb),
  ('asset','team_car',4,'tactical_communication_pct','Tactical communication','percent', 3,'+','%',true,20,true,'{}'::jsonb),
  ('asset','team_car',4,'mechanical_response_pct','Mechanical response','percent', 4,'+','%',true,30,true,'{}'::jsonb),
  ('asset','team_car',4,'incident_response_pct','Incident response','percent', 2,'+','%',true,40,true,'{}'::jsonb),
  ('asset','team_car',4,'race_fatigue_protection_pct','Race fatigue protection','percent',-1,'','%',true,50,true,'{}'::jsonb),

  ('asset','team_car',5,'race_support_quality_pct','Race support quality','percent', 5,'+','%',true,10,true,'{}'::jsonb),
  ('asset','team_car',5,'tactical_communication_pct','Tactical communication','percent', 4,'+','%',true,20,true,'{}'::jsonb),
  ('asset','team_car',5,'feeding_support_pct','Feeding support','percent', 2,'+','%',true,30,true,'{}'::jsonb),
  ('asset','team_car',5,'mechanical_response_pct','Mechanical response','percent', 5,'+','%',true,40,true,'{}'::jsonb),
  ('asset','team_car',5,'incident_response_pct','Incident response','percent', 3,'+','%',true,50,true,'{}'::jsonb),
  ('asset','team_car',5,'race_fatigue_protection_pct','Race fatigue protection','percent',-1,'','%',true,60,true,'{}'::jsonb);

-- Team Car effectiveness bands.
create or replace function public.team_car_condition_factor(p_condition_percent numeric)
returns numeric
language sql
immutable
set search_path = public
as $function$
select case
  when coalesce(p_condition_percent, 0) >= 80 then 1.00
  when coalesce(p_condition_percent, 0) >= 60 then 0.90
  when coalesce(p_condition_percent, 0) >= 40 then 0.75
  when coalesce(p_condition_percent, 0) >= 30 then 0.60
  else 0.00
end::numeric;
$function$;

-- Apply Team Car condition to the exact effect values before standardization.
create or replace function public.race_plan_asset_effective_value_v1(
  p_asset_key text,
  p_condition_percent numeric,
  p_effect_value numeric
)
returns numeric
language sql
immutable
set search_path = public
as $function$
select case
  when p_effect_value is null then null::numeric
  when p_asset_key = 'team_car' then round(
    p_effect_value * public.team_car_condition_factor(p_condition_percent),
    2
  )
  else p_effect_value
end;
$function$;

-- Keep every existing caller on the canonical Race Plan preview function while
-- scaling Team Car values before the table-driven standardizer sees them.
do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.get_race_plan_bonus_preview_v1(uuid,uuid[],jsonb)'::regprocedure)
  into v_def;

  if position('race_plan_asset_effective_value_v1' in v_def) = 0 then
    if position('r.effect_value > 0' in v_def) = 0
       or position('r.effect_value::text' in v_def) = 0 then
      raise exception 'Expected Team Car preview effect-value markers were not found.';
    end if;

    v_new := replace(
      v_def,
      'r.effect_value > 0',
      'public.race_plan_asset_effective_value_v1(ar.asset_key, ar.condition_percent, r.effect_value) > 0'
    );
    v_new := replace(
      v_new,
      'r.effect_value::text',
      'public.race_plan_asset_effective_value_v1(ar.asset_key, ar.condition_percent, r.effect_value)::text'
    );

    execute v_new;
  end if;
end;
$migration$;

-- Resolve configured Team Car wear from the saved asset level, falling back to
-- the live row only if an older snapshot does not contain asset_level.
create or replace function public.team_car_condition_loss_for_asset_v1(
  p_asset_id uuid,
  p_asset_snapshot jsonb
)
returns numeric
language sql
stable
set search_path = public
as $function$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key = 'team_car'
  and cfg.asset_level = coalesce(
    nullif(p_asset_snapshot ->> 'asset_level', '')::integer,
    (select tc.asset_level::integer from public.club_team_cars tc where tc.id = p_asset_id)
  )
limit 1;
$function$;

-- The universal TypeScript engine already consumes conditionLossPerRaceDay.
-- Production Phase 9 previously omitted it, forcing assets to the generic fallback.
-- Wire the configured value for Team Cars only; later asset reviews remain isolated.
do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.race_engine_get_stage_phase9_inputs_v1(uuid)'::regprocedure)
  into v_def;

  if position('conditionLossPerRaceDay' in v_def) = 0 then
    if position('''assetKey'', asset.asset_key,' in v_def) = 0 then
      raise exception 'Expected Phase 9 assetKey marker was not found.';
    end if;

    v_new := replace(
      v_def,
      '''assetKey'', asset.asset_key,',
      '''assetKey'', asset.asset_key,
        ''conditionLossPerRaceDay'',
          case
            when asset.asset_key in (''team_car'', ''car'') then
              public.team_car_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null
          end,'
    );

    execute v_new;
  end if;
end;
$migration$;

-- Align roster condition labels with the effectiveness bands shown in the UI.
do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.get_club_team_car_roster(uuid)'::regprocedure)
  into v_def;

  if position('tc.condition_percent >= 80' in v_def) = 0 then
    v_new := replace(v_def, 'tc.condition_percent >= 90', 'tc.condition_percent >= 80');
    v_new := replace(v_new, 'tc.condition_percent >= 70', 'tc.condition_percent >= 60');
    v_new := replace(v_new, 'tc.condition_percent >= 50', 'tc.condition_percent >= 40');

    if v_new = v_def then
      raise exception 'Expected Team Car roster condition thresholds were not found.';
    end if;

    execute v_new;
  end if;
end;
$migration$;
