-- Mobile Workshop production balance and event-field-service integration.
-- Existing submitted Race Plans remain frozen: the new field recovery is read
-- only from the saved submitted bonus snapshot, so historical plans resolve to 0.

update public.infrastructure_asset_config
set
  effect_summary = case asset_level
    when 1 then 'Mechanical Reliability +4; Field Equipment Recovery +15%'
    when 2 then 'Mechanical Reliability +8; Field Equipment Recovery +30%'
    else effect_summary
  end,
  unlock_summary = case asset_level
    when 1 then 'Unlocks race-event technical service, mechanic response, and basic between-stage field repairs.'
    when 2 then 'Unlocks professional race-event technical service, stronger mechanic response, and advanced between-stage field repairs.'
    else unlock_summary
  end,
  updated_at = now()
where asset_key = 'mobile_workshop'
  and asset_level in (1,2);

delete from public.race_plan_effect_rules
where source_type='asset' and source_key='mobile_workshop';

insert into public.race_plan_effect_rules (
  source_type, source_key, source_level, effect_key, effect_label,
  effect_unit, effect_value, display_prefix, display_suffix,
  is_positive_good, sort_order, is_active, metadata
)
values
  ('asset','mobile_workshop',1,'mechanic_response_pct','Race mechanic response','percent',2,'+','%',true,10,true,'{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset','mobile_workshop',1,'pre_stage_readiness_pct','Pre-stage technical readiness','percent',2,'+','%',true,20,true,'{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset','mobile_workshop',1,'field_equipment_recovery_pct','Field equipment recovery','percent',15,'+','%',true,30,true,'{"noncanonical":true,"applies_to":["normal_equipment_wear","incident_equipment_damage"]}'::jsonb),
  ('asset','mobile_workshop',2,'mechanic_response_pct','Race mechanic response','percent',4,'+','%',true,10,true,'{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset','mobile_workshop',2,'pre_stage_readiness_pct','Pre-stage technical readiness','percent',4,'+','%',true,20,true,'{"canonical_role":"mechanical_reliability"}'::jsonb),
  ('asset','mobile_workshop',2,'field_equipment_recovery_pct','Field equipment recovery','percent',30,'+','%',true,30,true,'{"noncanonical":true,"applies_to":["normal_equipment_wear","incident_equipment_damage"]}'::jsonb);

create or replace function public.mobile_workshop_condition_factor(p_condition_percent numeric)
returns numeric
language sql
immutable
set search_path=public
as $$
select case
  when coalesce(p_condition_percent,0) >= 90 then 1.00
  when coalesce(p_condition_percent,0) >= 75 then 0.95
  when coalesce(p_condition_percent,0) >= 60 then 0.85
  when coalesce(p_condition_percent,0) >= 45 then 0.70
  when coalesce(p_condition_percent,0) >= 30 then 0.50
  else 0.00
end::numeric;
$$;

create or replace function public.mobile_workshop_level_mechanical_reliability_v1(p_asset_level integer)
returns numeric
language sql
stable
set search_path=public
as $$
select coalesce(sum(abs(r.effect_value)),0)::numeric
from public.race_plan_effect_rules r
where r.source_type='asset'
  and r.source_key='mobile_workshop'
  and r.source_level=p_asset_level
  and r.is_active=true
  and r.effect_key <> 'field_equipment_recovery_pct';
$$;

create or replace function public.mobile_workshop_level_field_recovery_pct_v1(p_asset_level integer)
returns numeric
language sql
stable
set search_path=public
as $$
select coalesce(max(abs(r.effect_value)),0)::numeric
from public.race_plan_effect_rules r
where r.source_type='asset'
  and r.source_key='mobile_workshop'
  and r.source_level=p_asset_level
  and r.is_active=true
  and r.effect_key='field_equipment_recovery_pct';
$$;

create or replace function public.mobile_workshop_condition_loss_for_asset_v1(
  p_asset_id uuid,
  p_asset_snapshot jsonb
)
returns numeric
language sql
stable
set search_path=public
as $$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key='mobile_workshop'
  and cfg.asset_level=coalesce(
    nullif(p_asset_snapshot->>'asset_level','')::integer,
    (select mw.asset_level::integer from public.club_mobile_workshops mw where mw.id=p_asset_id)
  )
limit 1;
$$;

create or replace function public.race_plan_mobile_workshop_field_recovery_pct_from_snapshot_v1(
  p_validation_snapshot jsonb
)
returns numeric
language sql
immutable
set search_path=public
as $$
with preview_assets as (
  select value as asset
  from jsonb_array_elements(
    coalesce(
      p_validation_snapshot->'bonus_preview'->'assets',
      p_validation_snapshot->'submitted_quote'->'bonus_preview'->'assets',
      p_validation_snapshot->'quote'->'bonus_preview'->'assets',
      '[]'::jsonb
    )
  )
), effects as (
  select effect
  from preview_assets a
  cross join lateral jsonb_array_elements(coalesce(a.asset->'effects','[]'::jsonb)) effect
  where a.asset->>'source_key'='mobile_workshop'
)
select least(
  50::numeric,
  coalesce(max(abs(public.race_bonus_parse_numeric_v1(effect->'value'))),0)
)
from effects
where effect->>'effect_key'='field_equipment_recovery_pct';
$$;

create or replace function public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(
  p_stage_id uuid,
  p_team_id uuid
)
returns numeric
language sql
stable
set search_path=public
as $$
select coalesce(
  (
    select public.race_plan_mobile_workshop_field_recovery_pct_from_snapshot_v1(rp.validation_snapshot_json)
    from public.race_preparations rp
    join public.race_stages s on s.race_id=rp.race_id
    where s.id=p_stage_id
      and coalesce(rp.participating_club_id,rp.club_id)=p_team_id
      and lower(coalesce(rp.status,'')) in ('submitted','locked','final','finalized','completed')
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
set search_path=public
as $$
select case
  when p_effect_value is null then null::numeric
  when lower(coalesce(p_asset_key,'')) in ('team_car','car') then round(
    p_effect_value * public.team_car_condition_factor(p_condition_percent),2
  )
  when lower(coalesce(p_asset_key,'')) in ('team_bus','bus') then round(
    p_effect_value * public.team_bus_condition_factor(p_condition_percent),2
  )
  when lower(coalesce(p_asset_key,'')) in ('equipment_van','van') then round(
    p_effect_value * public.equipment_van_condition_factor(p_condition_percent),2
  )
  when lower(coalesce(p_asset_key,'')) in ('mobile_workshop','workshop') then round(
    p_effect_value * public.mobile_workshop_condition_factor(p_condition_percent),2
  )
  else p_effect_value
end;
$$;

create or replace function public.get_club_mobile_workshop_roster(p_club_id uuid)
returns table(
  workshop_id uuid, club_id uuid, garage_slot integer, display_name text,
  asset_level smallint, asset_name text, purchase_cost_cash bigint,
  support_value numeric, condition_percent numeric, condition_status text,
  condition_factor numeric, effective_support_value numeric, status text,
  total_race_days integer, total_distance_km numeric, last_used_game_date date,
  acquired_game_date date, current_assignment_type text, current_assignment_id uuid,
  current_assignment_label text, assignment_locked boolean,
  assignment_start_game_date date, assignment_end_game_date date,
  condition_loss_per_race_day numeric, repair_cost_per_condition_point integer,
  repair_points_per_game_day numeric, min_assign_condition_percent numeric,
  max_assigned_per_event integer
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_uid uuid;
begin
  v_uid:=coalesce(auth.uid(),nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.clubs c
    left join public.club_memberships cm on cm.club_id=c.id and cm.user_id=v_uid
    where c.id=p_club_id and (c.owner_user_id=v_uid or cm.user_id is not null)
  ) then raise exception 'Not allowed to view mobile workshops for this club'; end if;

  return query
  select mw.id,mw.club_id,mw.garage_slot,mw.display_name,mw.asset_level,
    coalesce(cfg.asset_name,mw.metadata->>'asset_name',format('Mobile Workshop Lv %s',mw.asset_level))::text,
    mw.purchase_cost_cash,mw.support_value,mw.condition_percent,
    case when mw.condition_percent>=90 then 'Excellent'
         when mw.condition_percent>=75 then 'Good'
         when mw.condition_percent>=60 then 'Worn'
         when mw.condition_percent>=45 then 'Poor'
         when mw.condition_percent>=30 then 'Critical'
         else 'Unsafe' end::text,
    public.mobile_workshop_condition_factor(mw.condition_percent),
    round(mw.support_value*public.mobile_workshop_condition_factor(mw.condition_percent),2),
    mw.status,mw.total_race_days,mw.total_distance_km,mw.last_used_game_date,mw.acquired_game_date,
    mw.current_assignment_type,mw.current_assignment_id,mw.current_assignment_label,mw.assignment_locked,
    mw.assignment_start_game_date,mw.assignment_end_game_date,
    coalesce(cfg.condition_loss_per_race_day,0)::numeric,
    coalesce(cfg.repair_cost_per_condition_point,0)::integer,
    coalesce(cfg.repair_points_per_game_day,1)::numeric,
    coalesce(cfg.min_assign_condition_percent,30)::numeric,
    coalesce(cfg.max_assigned_per_event,1)::integer
  from public.club_mobile_workshops mw
  left join public.infrastructure_asset_config cfg
    on cfg.asset_key=mw.asset_key and cfg.asset_level=mw.asset_level
  where mw.club_id=p_club_id and mw.status<>'sold'
  order by mw.garage_slot,mw.created_at;
end;
$$;

create or replace function public.get_club_mobile_workshop_garage_summary(p_club_id uuid)
returns table(
  club_id uuid, total_workshops integer, max_total_workshops integer,
  available_workshops integer, assigned_workshops integer, in_repair_workshops integer,
  pending_delivery_workshops integer, best_available_support_score numeric,
  max_event_support_score numeric, best_available_support_ratio numeric,
  support_tier text, asset_repair_speed_bonus_pct numeric,
  asset_repair_cost_reduction_pct numeric, mechanical_service_response_bonus_pct numeric,
  daily_condition_recovery_pct numeric, mechanic_staff_support_label text,
  max_assigned_per_event integer
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid; v_max_total integer:=3; v_max_assigned integer:=1; v_max_support numeric:=2;
  v_total integer:=0; v_available integer:=0; v_assigned integer:=0; v_in_repair integer:=0; v_pending integer:=0;
  v_best_support numeric:=0; v_best_mr numeric:=0; v_best_recovery numeric:=0; v_ratio numeric:=0;
begin
  v_uid:=coalesce(auth.uid(),nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.clubs c
    left join public.club_memberships cm on cm.club_id=c.id and cm.user_id=v_uid
    where c.id=p_club_id and (c.owner_user_id=v_uid or cm.user_id is not null)
  ) then raise exception 'Not allowed to view mobile workshop summary for this club'; end if;

  select coalesce(max(cfg.max_total_quantity),3),coalesce(max(cfg.max_assigned_per_event),1),coalesce(max(cfg.support_value),2)
  into v_max_total,v_max_assigned,v_max_support
  from public.infrastructure_asset_config cfg where cfg.asset_key='mobile_workshop';

  select count(*) filter(where mw.status<>'sold'),count(*) filter(where mw.status='available'),
         count(*) filter(where mw.status='assigned'),count(*) filter(where mw.status='in_repair')
  into v_total,v_available,v_assigned,v_in_repair
  from public.club_mobile_workshops mw where mw.club_id=p_club_id;

  select coalesce(sum(coalesce(j.asset_quantity,1)),0)::integer into v_pending
  from public.club_infrastructure_jobs j
  where j.club_id=p_club_id and j.job_type='asset_delivery' and j.target_key='mobile_workshop' and j.status='pending';

  select
    round(mw.support_value*public.mobile_workshop_condition_factor(mw.condition_percent),2),
    round(public.mobile_workshop_level_mechanical_reliability_v1(mw.asset_level)*public.mobile_workshop_condition_factor(mw.condition_percent),2),
    round(public.mobile_workshop_level_field_recovery_pct_v1(mw.asset_level)*public.mobile_workshop_condition_factor(mw.condition_percent),2)
  into v_best_support,v_best_mr,v_best_recovery
  from public.club_mobile_workshops mw
  where mw.club_id=p_club_id and mw.status='available'
  order by public.mobile_workshop_level_mechanical_reliability_v1(mw.asset_level)*public.mobile_workshop_condition_factor(mw.condition_percent) desc,
           mw.condition_percent desc,mw.id
  limit 1;

  v_best_support:=coalesce(v_best_support,0); v_best_mr:=coalesce(v_best_mr,0); v_best_recovery:=coalesce(v_best_recovery,0);
  v_ratio:=least(v_best_mr/8.0,1);

  return query select p_club_id,v_total,v_max_total,v_available,v_assigned,v_in_repair,v_pending,
    round(v_best_support,2),round(v_max_support*v_max_assigned,2),round(v_ratio,4),
    case when v_best_mr<=0 then 'None' when v_best_mr<4 then 'Basic' when v_best_mr<8 then 'Solid' else 'Strong' end::text,
    round(v_best_mr,2),
    round(v_best_recovery,2),
    round(v_best_mr,2),
    round(v_best_recovery,2),
    case when v_best_mr<=0 then 'None' when v_best_mr<4 then 'Basic' when v_best_mr<8 then 'Solid' else 'Strong' end::text,
    v_max_assigned;
end;
$$;

do $$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='standardize_race_plan_bonus_preview_v1' order by p.oid limit 1;
  if v_oid is null then raise exception 'standardize_race_plan_bonus_preview_v1 not found'; end if;
  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');
  v_new:=replace(v_def,
    $old$where canonical_bonus_key is null
    and effect_key <> 'equipment_wear_protection_pct'$old$,
    $new$where canonical_bonus_key is null
    and effect_key not in ('equipment_wear_protection_pct','field_equipment_recovery_pct')$new$
  );
  if v_new=v_def then raise exception 'standardizer Mobile Workshop patch point not found'; end if;
  execute v_new;
end $$;

do $$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='race_engine_get_stage_phase9_inputs_v1' order by p.oid limit 1;
  if v_oid is null then raise exception 'race_engine_get_stage_phase9_inputs_v1 not found'; end if;
  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');

  v_new:=replace(v_def,
    $old$'intensity', greatest(
          0::numeric,
          1::numeric - least(
            30::numeric,
            public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id)
          ) / 100.0
        ),
        'equipmentVanProtectionPct', public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id),$old$,
    $new$'intensity', greatest(
          0::numeric,
          (1::numeric - least(
            30::numeric,
            public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id)
          ) / 100.0)
          *
          (1::numeric - least(
            50::numeric,
            public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(p_stage_id, allocated.team_id)
          ) / 100.0)
        ),
        'equipmentVanProtectionPct', public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id, allocated.team_id),
        'mobileWorkshopFieldRecoveryPct', public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(p_stage_id, allocated.team_id),$new$
  );
  if v_new=v_def then raise exception 'Phase9 equipment field recovery patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(v_def,
    $old$when asset.asset_key in ('equipment_van', 'van') then
              public.equipment_van_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null$old$,
    $new$when asset.asset_key in ('equipment_van', 'van') then
              public.equipment_van_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            when asset.asset_key in ('mobile_workshop', 'workshop') then
              public.mobile_workshop_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)
            else null$new$
  );
  if v_new=v_def then raise exception 'Phase9 Mobile Workshop own-wear patch point not found'; end if;
  execute v_new;
end $$;

do $$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='race_engine_apply_incident_equipment_damage_v1' order by p.oid limit 1;
  if v_oid is null then raise exception 'race_engine_apply_incident_equipment_damage_v1 not found'; end if;
  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');
  v_new:=replace(v_def,
    $old$        * (
          1
          - least(
              30,
              public.race_plan_equipment_van_protection_pct_for_stage_v1(c.stage_id, c.club_id)
            ) / 100.0
        )
      )::numeric(10,3) as damage_loss$old$,
    $new$        * (
          1
          - least(
              30,
              public.race_plan_equipment_van_protection_pct_for_stage_v1(c.stage_id, c.club_id)
            ) / 100.0
        )
        * (
          1
          - least(
              50,
              public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(c.stage_id, c.club_id)
            ) / 100.0
        )
      )::numeric(10,3) as damage_loss$new$
  );
  if v_new=v_def then raise exception 'incident Mobile Workshop recovery patch point not found'; end if;
  execute v_new;
end $$;

revoke execute on function public.start_club_asset_delivery(uuid,text,integer) from public, anon, authenticated;
revoke execute on function public.acquire_club_asset(uuid,text,integer) from public, anon, authenticated;
