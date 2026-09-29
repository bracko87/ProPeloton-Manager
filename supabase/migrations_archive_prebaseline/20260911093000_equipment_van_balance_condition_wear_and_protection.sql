-- Equipment Van approved production balance and engine integration.
-- Existing submitted Race Plans remain frozen because physical equipment protection
-- is read from the submitted validation snapshot. Historical snapshots do not
-- contain the new equipment_wear_protection_pct effect key and therefore resolve to 0.

update public.infrastructure_asset_config
set
  cost_cash = case asset_level
    when 1 then 10000
    when 2 then 18000
    when 3 then 30000
    else cost_cash
  end,
  delivery_game_days = case asset_level
    when 1 then 5
    when 2 then 7
    when 3 then 10
    else delivery_game_days
  end,
  effect_summary = case asset_level
    when 1 then 'Mechanical Reliability +2; Equipment Protection +2%'
    when 2 then 'Mechanical Reliability +5; Equipment Protection +5%'
    when 3 then 'Mechanical Reliability +8; Equipment Protection +10%'
    else effect_summary
  end,
  unlock_summary = case asset_level
    when 1 then 'Basic spare-bike and race-equipment logistics support.'
    when 2 then 'Improved spare-bike response, race readiness, and equipment protection.'
    when 3 then 'Elite race-equipment logistics, mechanical readiness, and equipment protection.'
    else unlock_summary
  end,
  updated_at = now()
where asset_key = 'equipment_van'
  and asset_level in (1, 2, 3);

-- Replace the old overlapping effect set with a clean Mechanical Reliability
-- progression plus a separate non-canonical physical equipment protection effect.
delete from public.race_plan_effect_rules
where source_type = 'asset'
  and source_key = 'equipment_van';

insert into public.race_plan_effect_rules (
  source_type,
  source_key,
  source_level,
  effect_key,
  effect_label,
  effect_unit,
  effect_value,
  display_prefix,
  display_suffix,
  is_positive_good,
  sort_order,
  is_active,
  metadata
)
values
  ('asset', 'equipment_van', 1, 'pre_stage_readiness_pct', 'Pre-stage equipment readiness', 'percent',  1, '+', '%', true, 10, true, '{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset', 'equipment_van', 1, 'mechanical_time_loss_reduction_pct', 'Mechanical incident time-loss reduction', 'percent', -1, '', '%', true, 20, true, '{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset', 'equipment_van', 1, 'equipment_wear_protection_pct', 'Physical race-equipment protection', 'percent', 2, '+', '%', true, 30, true, '{"noncanonical":true,"applies_to":["normal_equipment_wear","incident_equipment_damage"]}'::jsonb),

  ('asset', 'equipment_van', 2, 'spare_bike_response_pct', 'Spare-bike response', 'percent', 2, '+', '%', true, 10, true, '{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset', 'equipment_van', 2, 'pre_stage_readiness_pct', 'Pre-stage equipment readiness', 'percent', 3, '+', '%', true, 20, true, '{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset', 'equipment_van', 2, 'equipment_wear_protection_pct', 'Physical race-equipment protection', 'percent', 5, '+', '%', true, 30, true, '{"noncanonical":true,"applies_to":["normal_equipment_wear","incident_equipment_damage"]}'::jsonb),

  ('asset', 'equipment_van', 3, 'spare_bike_response_pct', 'Spare-bike response', 'percent', 3, '+', '%', true, 10, true, '{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset', 'equipment_van', 3, 'wheel_change_support_pct', 'Wheel-change support', 'percent', 3, '+', '%', true, 20, true, '{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset', 'equipment_van', 3, 'pre_stage_readiness_pct', 'Pre-stage equipment readiness', 'percent', 2, '+', '%', true, 30, true, '{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset', 'equipment_van', 3, 'equipment_wear_protection_pct', 'Physical race-equipment protection', 'percent', 10, '+', '%', true, 40, true, '{"noncanonical":true,"applies_to":["normal_equipment_wear","incident_equipment_damage"]}'::jsonb);

create or replace function public.equipment_van_condition_factor(p_condition_percent numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
select case
  when coalesce(p_condition_percent, 0) >= 90 then 1.00
  when coalesce(p_condition_percent, 0) >= 75 then 0.95
  when coalesce(p_condition_percent, 0) >= 60 then 0.85
  when coalesce(p_condition_percent, 0) >= 45 then 0.70
  when coalesce(p_condition_percent, 0) >= 30 then 0.50
  else 0.00
end::numeric;
$$;

create or replace function public.equipment_van_level_mechanical_reliability_v1(p_asset_level integer)
returns numeric
language sql
stable
set search_path = public
as $$
select coalesce(sum(abs(r.effect_value)), 0)::numeric
from public.race_plan_effect_rules r
where r.source_type = 'asset'
  and r.source_key = 'equipment_van'
  and r.source_level = p_asset_level
  and r.is_active = true
  and r.effect_key <> 'equipment_wear_protection_pct';
$$;

create or replace function public.equipment_van_level_equipment_protection_pct_v1(p_asset_level integer)
returns numeric
language sql
stable
set search_path = public
as $$
select coalesce(max(abs(r.effect_value)), 0)::numeric
from public.race_plan_effect_rules r
where r.source_type = 'asset'
  and r.source_key = 'equipment_van'
  and r.source_level = p_asset_level
  and r.is_active = true
  and r.effect_key = 'equipment_wear_protection_pct';
$$;

create or replace function public.equipment_van_condition_loss_for_asset_v1(
  p_asset_id uuid,
  p_asset_snapshot jsonb
)
returns numeric
language sql
stable
set search_path = public
as $$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key = 'equipment_van'
  and cfg.asset_level = coalesce(
    nullif(p_asset_snapshot ->> 'asset_level', '')::integer,
    (
      select ev.asset_level::integer
      from public.club_equipment_vans ev
      where ev.id = p_asset_id
    )
  )
limit 1;
$$;

create or replace function public.race_plan_equipment_van_protection_pct_from_snapshot_v1(
  p_validation_snapshot jsonb
)
returns numeric
language sql
immutable
set search_path = public
as $$
with preview_assets as (
  select value as asset
  from jsonb_array_elements(
    coalesce(
      p_validation_snapshot -> 'bonus_preview' -> 'assets',
      p_validation_snapshot -> 'submitted_quote' -> 'bonus_preview' -> 'assets',
      p_validation_snapshot -> 'quote' -> 'bonus_preview' -> 'assets',
      '[]'::jsonb
    )
  )
), effects as (
  select effect
  from preview_assets a
  cross join lateral jsonb_array_elements(coalesce(a.asset -> 'effects', '[]'::jsonb)) effect
  where a.asset ->> 'source_key' = 'equipment_van'
)
select least(
  30::numeric,
  coalesce(max(abs(public.race_bonus_parse_numeric_v1(effect -> 'value'))), 0)
)
from effects
where effect ->> 'effect_key' = 'equipment_wear_protection_pct';
$$;

create or replace function public.race_plan_equipment_van_protection_pct_for_stage_v1(
  p_stage_id uuid,
  p_team_id uuid
)
returns numeric
language sql
stable
set search_path = public
as $$
select coalesce(
  (
    select public.race_plan_equipment_van_protection_pct_from_snapshot_v1(rp.validation_snapshot_json)
    from public.race_preparations rp
    join public.race_stages s
      on s.race_id = rp.race_id
    where s.id = p_stage_id
      and coalesce(rp.participating_club_id, rp.club_id) = p_team_id
      and lower(coalesce(rp.status, '')) in ('submitted', 'locked', 'final', 'finalized', 'completed')
    order by rp.updated_at desc, rp.id
    limit 1
  ),
  0::numeric
);
$$;

create or replace function public.race_plan_asset_effective_value_v1(
  p_asset_key text,
  p_condition_percent numeric,
  p_effect_value numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
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
  when lower(coalesce(p_asset_key, '')) in ('equipment_van', 'van') then round(
    p_effect_value * public.equipment_van_condition_factor(p_condition_percent),
    2
  )
  else p_effect_value
end;
$$;

-- Roster condition reporting must match Race Plan effectiveness exactly.
create or replace function public.get_club_equipment_van_roster(p_club_id uuid)
returns table(
  van_id uuid,
  club_id uuid,
  garage_slot integer,
  display_name text,
  asset_level smallint,
  asset_name text,
  purchase_cost_cash bigint,
  support_value numeric,
  condition_percent numeric,
  condition_status text,
  condition_factor numeric,
  effective_support_value numeric,
  status text,
  total_race_days integer,
  total_distance_km numeric,
  last_used_game_date date,
  acquired_game_date date,
  current_assignment_type text,
  current_assignment_id uuid,
  current_assignment_label text,
  assignment_locked boolean,
  assignment_start_game_date date,
  assignment_end_game_date date,
  condition_loss_per_race_day numeric,
  repair_cost_per_condition_point integer,
  repair_points_per_game_day numeric,
  min_assign_condition_percent numeric,
  max_assigned_per_event integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
begin
  v_uid := coalesce(
    auth.uid(),
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.clubs c
    left join public.club_memberships cm
      on cm.club_id = c.id
     and cm.user_id = v_uid
    where c.id = p_club_id
      and (c.owner_user_id = v_uid or cm.user_id is not null)
  ) then
    raise exception 'Not allowed to view equipment vans for this club';
  end if;

  return query
  select
    ev.id,
    ev.club_id,
    ev.garage_slot,
    ev.display_name,
    ev.asset_level,
    coalesce(
      cfg.asset_name,
      ev.metadata ->> 'asset_name',
      format('Equipment Van Lv %s', ev.asset_level)
    )::text,
    ev.purchase_cost_cash,
    ev.support_value,
    ev.condition_percent,
    case
      when ev.condition_percent >= 90 then 'Excellent'
      when ev.condition_percent >= 75 then 'Good'
      when ev.condition_percent >= 60 then 'Worn'
      when ev.condition_percent >= 45 then 'Poor'
      when ev.condition_percent >= 30 then 'Critical'
      else 'Unsafe'
    end::text,
    public.equipment_van_condition_factor(ev.condition_percent),
    round(
      ev.support_value * public.equipment_van_condition_factor(ev.condition_percent),
      2
    ),
    ev.status,
    ev.total_race_days,
    ev.total_distance_km,
    ev.last_used_game_date,
    ev.acquired_game_date,
    ev.current_assignment_type,
    ev.current_assignment_id,
    ev.current_assignment_label,
    ev.assignment_locked,
    ev.assignment_start_game_date,
    ev.assignment_end_game_date,
    coalesce(cfg.condition_loss_per_race_day, 0)::numeric,
    coalesce(cfg.repair_cost_per_condition_point, 0)::integer,
    coalesce(cfg.repair_points_per_game_day, 1)::numeric,
    coalesce(cfg.min_assign_condition_percent, 30)::numeric,
    coalesce(cfg.max_assigned_per_event, 1)::integer
  from public.club_equipment_vans ev
  left join public.infrastructure_asset_config cfg
    on cfg.asset_key = ev.asset_key
   and cfg.asset_level = ev.asset_level
  where ev.club_id = p_club_id
    and ev.status <> 'sold'
  order by ev.garage_slot asc, ev.created_at asc;
end;
$$;

-- Retain the legacy summary return signature for frontend compatibility, but
-- derive the displayed values from the actual best available van.
create or replace function public.get_club_equipment_van_garage_summary(p_club_id uuid)
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
  mechanical_time_loss_reduction_pct numeric,
  spare_bike_response_bonus_pct numeric,
  equipment_condition_loss_reduction_pct numeric,
  pre_stage_readiness_bonus_pct numeric,
  missing_spare_equipment_risk_reduction_pct numeric,
  max_assigned_per_event integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_max_total integer := 3;
  v_max_assigned integer := 1;
  v_max_support numeric := 3;
  v_total integer := 0;
  v_available integer := 0;
  v_assigned integer := 0;
  v_in_repair integer := 0;
  v_pending integer := 0;
  v_best numeric := 0;
  v_ratio numeric := 0;
  v_best_mr numeric := 0;
  v_best_protection numeric := 0;
begin
  v_uid := coalesce(
    auth.uid(),
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.clubs c
    left join public.club_memberships cm
      on cm.club_id = c.id
     and cm.user_id = v_uid
    where c.id = p_club_id
      and (c.owner_user_id = v_uid or cm.user_id is not null)
  ) then
    raise exception 'Not allowed to view equipment van summary for this club';
  end if;

  select
    coalesce(max(cfg.max_total_quantity), 3),
    coalesce(max(cfg.max_assigned_per_event), 1),
    coalesce(max(cfg.support_value), 3)
  into
    v_max_total,
    v_max_assigned,
    v_max_support
  from public.infrastructure_asset_config cfg
  where cfg.asset_key = 'equipment_van';

  select
    count(*) filter (where ev.status <> 'sold'),
    count(*) filter (where ev.status = 'available'),
    count(*) filter (where ev.status = 'assigned'),
    count(*) filter (where ev.status = 'in_repair')
  into
    v_total,
    v_available,
    v_assigned,
    v_in_repair
  from public.club_equipment_vans ev
  where ev.club_id = p_club_id;

  select coalesce(sum(coalesce(j.asset_quantity, 1)), 0)::integer
  into v_pending
  from public.club_infrastructure_jobs j
  where j.club_id = p_club_id
    and j.job_type = 'asset_delivery'
    and j.target_key = 'equipment_van'
    and j.status = 'pending';

  select
    coalesce(
      round(ev.support_value * public.equipment_van_condition_factor(ev.condition_percent), 2),
      0
    ),
    coalesce(
      round(
        public.equipment_van_level_mechanical_reliability_v1(ev.asset_level)
          * public.equipment_van_condition_factor(ev.condition_percent),
        2
      ),
      0
    ),
    coalesce(
      round(
        public.equipment_van_level_equipment_protection_pct_v1(ev.asset_level)
          * public.equipment_van_condition_factor(ev.condition_percent),
        2
      ),
      0
    )
  into
    v_best,
    v_best_mr,
    v_best_protection
  from public.club_equipment_vans ev
  where ev.club_id = p_club_id
    and ev.status = 'available'
  order by
    public.equipment_van_level_mechanical_reliability_v1(ev.asset_level)
      * public.equipment_van_condition_factor(ev.condition_percent) desc,
    ev.condition_percent desc,
    ev.id
  limit 1;

  v_best := coalesce(v_best, 0);
  v_best_mr := coalesce(v_best_mr, 0);
  v_best_protection := coalesce(v_best_protection, 0);
  v_ratio := least(v_best_mr / 8.0, 1);

  return query
  select
    p_club_id,
    v_total,
    v_max_total,
    v_available,
    v_assigned,
    v_in_repair,
    v_pending,
    round(v_best, 2),
    round(v_max_support * v_max_assigned, 2),
    round(v_ratio, 4),
    case
      when v_best_mr <= 0 then 'None'
      when v_best_mr < 3 then 'Basic'
      when v_best_mr < 7 then 'Solid'
      else 'Strong'
    end::text,
    round(v_best_mr, 2),
    round(v_best_mr, 2),
    round(v_best_protection, 2),
    round(v_best_mr, 2),
    round(v_best_protection, 2),
    v_max_assigned;
end;
$$;

-- Keep the physical protection effect out of canonical bonus totals and out of
-- the unmapped-effect warning list. It is consumed directly by equipment wear.
do $$
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
    and p.proname = 'standardize_race_plan_bonus_preview_v1'
  order by p.oid
  limit 1;

  if v_oid is null then
    raise exception 'standardize_race_plan_bonus_preview_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$from mapped
  where canonical_bonus_key is null
)$old$,
    $new$from mapped
  where canonical_bonus_key is null
    and effect_key <> 'equipment_wear_protection_pct'
)$new$
  );

  if v_new = v_def then
    raise exception 'standardizer patch point not found';
  end if;

  execute v_new;
end $$;

-- Phase 9: normal durable-equipment wear receives the frozen submitted Equipment
-- Van protection through resource intensity, and the van itself receives its
-- configured 0.75 / 0.60 / 0.45 wear rather than universal fallback 0.25.
do $$
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
    and p.proname = 'race_engine_get_stage_phase9_inputs_v1'
  order by p.oid
  limit 1;

  if v_oid is null then
    raise exception 'race_engine_get_stage_phase9_inputs_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  v_new := replace(
    v_def,
    $old$'condition', allocated.condition_percent,
        'intensity', 1,
        'category', allocated.equipment_category,$old$,
    $new$'condition', allocated.condition_percent,
        'intensity', greatest(
          0::numeric,
          1::numeric - least(
            30::numeric,
            public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id)
          ) / 100.0
        ),
        'equipmentVanProtectionPct', public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id),
        'category', allocated.equipment_category,$new$
  );

  if v_new = v_def then
    raise exception 'Phase9 equipment intensity patch point not found';
  end if;

  v_def := v_new;
  v_new := replace(
    v_def,
    $old$when asset.asset_key in ('team_bus', 'bus') then
              public.team_bus_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null$old$,
    $new$when asset.asset_key in ('team_bus', 'bus') then
              public.team_bus_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            when asset.asset_key in ('equipment_van', 'van') then
              public.equipment_van_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null$new$
  );

  if v_new = v_def then
    raise exception 'Phase9 Equipment Van wear patch point not found';
  end if;

  execute v_new;
end $$;

-- Incident/mechanical equipment damage receives the same frozen submitted
-- Equipment Van protection in addition to the existing mechanic protection.
do $$
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
    and p.proname = 'race_engine_apply_incident_equipment_damage_v1'
  order by p.oid
  limit 1;

  if v_oid is null then
    raise exception 'race_engine_apply_incident_equipment_damage_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(c.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
      )::numeric(10,3) as damage_loss$old$,
    $new$        * (
          1
          - least(
              30,
              coalesce(
                (public.equipment_get_mechanic_effects_v1(c.club_id, null::uuid[])->>'condition_loss_reduction_pct')::numeric,
                0
              )
            ) / 100.0
        )
        * (
          1
          - least(
              30,
              public.race_plan_equipment_van_protection_pct_for_stage_v1(c.stage_id, c.club_id)
            ) / 100.0
        )
      )::numeric(10,3) as damage_loss$new$
  );

  if v_new = v_def then
    raise exception 'incident Equipment Van protection patch point not found';
  end if;

  execute v_new;
end $$;
