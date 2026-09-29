-- Team Bus balance + production engine alignment
-- Approved prices: 15k / 30k / 70k

update public.infrastructure_asset_config
set
  cost_cash = case asset_level
    when 1 then 15000
    when 2 then 30000
    when 3 then 70000
    else cost_cash
  end,
  delivery_game_days = case asset_level
    when 1 then 7
    when 2 then 10
    when 3 then 14
    else delivery_game_days
  end,
  repair_cost_per_condition_point = case asset_level
    when 1 then 60
    when 2 then 100
    when 3 then 180
    else repair_cost_per_condition_point
  end,
  effect_summary = case asset_level
    when 1 then 'Tour Fatigue Protection -2%; Recovery Comfort +1%'
    when 2 then 'Tour Fatigue Protection -4%; Recovery Comfort +2%'
    when 3 then 'Tour Fatigue Protection -7%; Recovery Comfort +4%'
    else effect_summary
  end,
  unlock_summary = case asset_level
    when 1 then 'Adds basic team transport with fatigue protection and recovery comfort.'
    when 2 then 'Adds professional recovery-focused team transport for race programs and tours.'
    when 3 then 'Adds elite tour transport with maximum fatigue protection and recovery comfort.'
    else unlock_summary
  end,
  updated_at = now()
where asset_key = 'team_bus'
  and asset_level in (1,2,3);

-- Keep the existing effect key for compatibility, but give Travel Comfort its intended
-- canonical role: recovery support instead of duplicate fatigue control.
update public.race_bonus_effect_map
set
  canonical_bonus_key = 'recovery_support',
  display_label = 'Recovery comfort',
  point_mode = 'positive',
  point_multiplier = 1,
  max_points_per_effect = 10,
  notes = 'Team Bus recovery comfort contributes to Recovery Support.'
where effect_key = 'travel_comfort_pct';

update public.race_bonus_effect_map
set
  display_label = 'Tour fatigue protection',
  notes = 'Team Bus tour fatigue protection contributes to Fatigue Control.'
where effect_key = 'tour_fatigue_reduction_pct';

update public.race_plan_effect_rules
set
  effect_label = 'Tour Fatigue Protection',
  effect_value = case source_level
    when 1 then -2
    when 2 then -4
    when 3 then -7
    else effect_value
  end,
  updated_at = now()
where source_type = 'asset'
  and source_key = 'team_bus'
  and effect_key = 'tour_fatigue_reduction_pct'
  and source_level in (1,2,3);

update public.race_plan_effect_rules
set
  effect_label = 'Recovery Comfort',
  effect_value = case source_level
    when 1 then 1
    when 2 then 2
    when 3 then 4
    else effect_value
  end,
  updated_at = now()
where source_type = 'asset'
  and source_key = 'team_bus'
  and effect_key = 'travel_comfort_pct'
  and source_level in (1,2,3);

-- Team Bus condition must scale the actual Race Plan effects, not only garage display values.
create or replace function public.race_plan_asset_effective_value_v1(
  p_asset_key text,
  p_condition_percent numeric,
  p_effect_value numeric
)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
select case
  when p_effect_value is null then null::numeric
  when lower(coalesce(p_asset_key, '')) in ('team_car', 'car') then round(
    p_effect_value * public.team_car_condition_factor(p_condition_percent),
    2
  )
  when lower(coalesce(p_asset_key, '')) in ('team_bus', 'bus') then round(
    p_effect_value * public.team_bus_condition_factor(p_condition_percent),
    2
  )
  else p_effect_value
end;
$function$;

-- Resolve configured Team Bus level wear for the universal stage engine.
create or replace function public.team_bus_condition_loss_for_asset_v1(
  p_asset_id uuid,
  p_asset_snapshot jsonb
)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key = 'team_bus'
  and cfg.asset_level = coalesce(
    nullif(p_asset_snapshot ->> 'asset_level', '')::integer,
    (select tb.asset_level::integer from public.club_team_buses tb where tb.id = p_asset_id)
  )
limit 1;
$function$;

-- Patch the production Phase 9 input adapter in place so Team Bus uses its configured
-- 0.50 / 0.40 / 0.30 base wear rather than the universal fallback.
do $patch$
declare
  v_def text;
  v_old text := $old$when asset.asset_key in ('team_car', 'car') then
              public.team_car_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null$old$;
  v_new text := $new$when asset.asset_key in ('team_car', 'car') then
              public.team_car_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            when asset.asset_key in ('team_bus', 'bus') then
              public.team_bus_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null$new$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'race_engine_get_stage_phase9_inputs_v1'
  limit 1;

  if v_def is null then
    raise exception 'race_engine_get_stage_phase9_inputs_v1 not found';
  end if;

  if position(v_old in v_def) = 0 then
    if position('team_bus_condition_loss_for_asset_v1' in v_def) > 0 then
      return;
    end if;
    raise exception 'Expected Team Car wear fragment not found in Phase 9 function';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end;
$patch$;

-- Preserve the legacy summary return shape for compatibility, but remove fake
-- one-day/short-tour/long-tour multipliers from the underlying values.
create or replace function public.get_club_team_bus_garage_summary(p_club_id uuid)
returns table(
  club_id uuid,
  total_buses integer,
  max_total_buses integer,
  available_buses integer,
  assigned_buses integer,
  in_repair_buses integer,
  pending_delivery_buses integer,
  best_available_support_score numeric,
  max_event_support_score numeric,
  best_available_support_ratio numeric,
  support_tier text,
  one_day_fatigue_reduction_pct numeric,
  short_tour_fatigue_reduction_pct numeric,
  long_tour_fatigue_reduction_pct numeric,
  recovery_comfort_bonus_pct numeric,
  max_assigned_per_event integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (c.owner_user_id = auth.uid() or cm.user_id is not null)
  limit 1
),
cfg as (
  select
    max(max_total_quantity)::integer as max_total_buses,
    max(max_assigned_per_event)::integer as max_assigned_per_event,
    max(support_value)::numeric as best_support_value
  from public.infrastructure_asset_config
  where asset_key = 'team_bus'
),
counts as (
  select
    count(*) filter (where status <> 'sold')::integer as total_buses,
    count(*) filter (where status = 'available')::integer as available_buses,
    count(*) filter (where status = 'assigned')::integer as assigned_buses,
    count(*) filter (where status = 'in_repair')::integer as in_repair_buses
  from public.club_team_buses
  where club_id = p_club_id
),
pending as (
  select coalesce(sum(asset_quantity), 0)::integer as pending_delivery_buses
  from public.club_infrastructure_jobs
  where club_id = p_club_id
    and job_type = 'asset_delivery'
    and target_key = 'team_bus'
    and status = 'pending'
),
best_available as (
  select
    tb.asset_level,
    public.team_bus_condition_factor(tb.condition_percent) as condition_factor,
    round(tb.support_value * public.team_bus_condition_factor(tb.condition_percent), 2) as effective_support_value
  from public.club_team_buses tb
  where tb.club_id = p_club_id
    and tb.status = 'available'
    and tb.condition_percent >= 30
  order by
    (case tb.asset_level when 1 then 3 when 2 then 6 when 3 then 11 else 0 end)
      * public.team_bus_condition_factor(tb.condition_percent) desc,
    tb.asset_level desc,
    tb.condition_percent desc
  limit 1
),
score as (
  select
    p_club_id as club_id,
    coalesce(counts.total_buses, 0) as total_buses,
    coalesce(cfg.max_total_buses, 3) as max_total_buses,
    coalesce(counts.available_buses, 0) as available_buses,
    coalesce(counts.assigned_buses, 0) as assigned_buses,
    coalesce(counts.in_repair_buses, 0) as in_repair_buses,
    coalesce(pending.pending_delivery_buses, 0) as pending_delivery_buses,
    coalesce(best_available.effective_support_value, 0)::numeric as best_available_support_score,
    coalesce(cfg.best_support_value, 3.00)::numeric as max_event_support_score,
    coalesce(cfg.max_assigned_per_event, 1) as max_assigned_per_event,
    coalesce(best_available.asset_level, 0)::integer as best_level,
    coalesce(best_available.condition_factor, 0)::numeric as condition_factor
  from counts
  cross join pending
  cross join cfg
  left join best_available on true
)
select
  score.club_id,
  score.total_buses,
  score.max_total_buses,
  score.available_buses,
  score.assigned_buses,
  score.in_repair_buses,
  score.pending_delivery_buses,
  round(score.best_available_support_score, 2),
  round(score.max_event_support_score, 2),
  round(least(score.best_available_support_score / nullif(score.max_event_support_score, 0), 1), 4),
  case
    when score.best_level <= 0 then 'None'
    when score.best_level = 1 then 'Basic'
    when score.best_level = 2 then 'Strong'
    else 'Elite'
  end,
  round((case score.best_level when 1 then 2 when 2 then 4 when 3 then 7 else 0 end) * score.condition_factor, 2),
  round((case score.best_level when 1 then 2 when 2 then 4 when 3 then 7 else 0 end) * score.condition_factor, 2),
  round((case score.best_level when 1 then 2 when 2 then 4 when 3 then 7 else 0 end) * score.condition_factor, 2),
  round((case score.best_level when 1 then 1 when 2 then 2 when 3 then 4 else 0 end) * score.condition_factor, 2),
  score.max_assigned_per_event
from score
where exists (select 1 from allowed);
$function$;
