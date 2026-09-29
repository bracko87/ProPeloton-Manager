set check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.get_mechanics_workshop_effects(p_club_id uuid)
 RETURNS TABLE(infrastructure_club_id uuid, is_developing_team boolean, mechanics_workshop_level integer, monthly_maintenance_cash bigint, workshop_repair_speed_bonus_bps integer, workshop_repair_cost_discount_bps integer, workshop_condition_loss_reduction_bps integer, workshop_mechanical_risk_reduction_bps integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_scouting_office_effects(p_club_id uuid)
 RETURNS TABLE(infrastructure_club_id uuid, is_developing_team boolean, scouting_level integer, monthly_maintenance_cash bigint, scout_capacity integer, report_quality_cap text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_stage_supply_availability_v1(p_stage_id uuid, p_team_id uuid)
 RETURNS TABLE(supply_key text, physical_quantity integer, reserved_elsewhere integer, quantity_available integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with keys(supply_key) as (
    values
      ('bidons_water_bottles'::text),
      ('energy_gels'::text),
      ('nutrition_packs'::text),
      ('race_jersey_complete'::text),
      ('rain_jackets'::text)
  ),
  owner_ctx as (
    select
      public.universal_race_resource_owner_club_v1(p_team_id) as owner_id,
      s.stage_date::date as stage_date
    from public.race_stages s
    where s.id = p_stage_id
  )
  select
    k.supply_key,
    case
      when k.supply_key in ('race_jersey_complete', 'rain_jackets') then (
        select count(*)::integer
        from public.club_race_supply_units u, owner_ctx o
        where u.club_id = o.owner_id
          and u.supply_key = k.supply_key
          and u.status in ('ready', 'assigned')
          and u.stage_uses_remaining > 0
          and (u.last_used_game_date is null or u.last_used_game_date <> o.stage_date)
      )
      else coalesce((
        select s.quantity_available
        from public.club_race_supplies s, owner_ctx o
        where s.club_id = o.owner_id
          and s.supply_key = k.supply_key
      ), 0)
    end::integer as physical_quantity,
    public.universal_race_stage_other_supply_reservations_v1(
      p_stage_id, p_team_id, k.supply_key
    )::integer as reserved_elsewhere,
    public.universal_race_stage_effective_supply_available_v1(
      p_stage_id, p_team_id, k.supply_key
    )::integer as quantity_available
  from keys k;
$function$
;

CREATE OR REPLACE FUNCTION public.race_startlist_engine_ready_v1(p_race_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (public.race_startlist_engine_readiness_v1(p_race_id)->>'ready')::boolean,
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.verify_universal_race_worker_secret_v1(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    length(p_secret) > 0
    and exists (
      select 1
      from vault.decrypted_secrets s
      where s.name = 'universal_race_worker_secret_v1'
        and s.decrypted_secret = p_secret
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_game_date_label_v1(p_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_date is null then 'Season —'
    else format(
      'Season %s · %s %s',
      greatest(1, extract(year from p_date)::integer - 1999),
      (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from p_date)::integer],
      extract(day from p_date)::integer
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_effective_training_window_v1(p_club_id uuid, p_start_date date, p_days integer DEFAULT 3)
 RETURNS TABLE(scheduled_rider_days integer, manual_override_rider_days integer, race_rider_days integer, camp_rider_days integer, health_block_rider_days integer, unavailable_rider_days integer, covered_rider_days integer, uncovered_rider_days integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with day_window as (
  select d::date as plan_date
  from generate_series(
    p_start_date::timestamp,
    (p_start_date + greatest(0, coalesce(p_days, 3) - 1))::timestamp,
    interval '1 day'
  ) d
), rider_base as (
  select
    cr.rider_id,
    coalesce(r.availability_status, 'fit') as availability_status,
    case
      when coalesce(c.club_type, 'main') = 'developing' then 'u23'
      else 'first_team'
    end as team_scope
  from public.club_riders cr
  join public.riders r on r.id = cr.rider_id
  join public.clubs c on c.id = cr.club_id and c.deleted_at is null
  where cr.club_id = p_club_id
), grid as (
  select
    rb.*,
    dw.plan_date,
    extract(isodow from dw.plan_date)::integer as iso_dow
  from rider_base rb
  cross join day_window dw
), resolved as (
  select
    g.*,
    dp.id as daily_plan_id,
    dp.source_type as daily_source_type,
    dp.status as daily_status,
    dp.focus_code as daily_focus,
    dp.intensity as daily_intensity,
    rtp.rider_id as rider_plan_id,
    rtp.focus_code as rider_focus,
    rtp.intensity as rider_intensity,
    rtp.auto_when_free as rider_auto_when_free,
    rtp.preferred_days as rider_preferred_days,
    ctd.club_id as club_default_id,
    ctd.focus_code as club_focus,
    ctd.intensity as club_intensity,
    ctd.auto_when_free as club_auto_when_free,
    exists (
      select 1
      from public.rider_daily_activity a
      where a.rider_id = g.rider_id
        and a.activity_date = g.plan_date
    ) as activity_day,
    exists (
      select 1
      from public.race_preparation_riders rpr
      join public.race_preparations rp on rp.id = rpr.race_preparation_id
      join public.races rr on rr.id = rp.race_id
      where rpr.rider_id = g.rider_id
        and rp.participating_club_id = p_club_id
        and rp.status in ('submitted', 'locked')
        and g.plan_date between rr.start_date and rr.end_date
        and exists (
          select 1
          from public.race_stages rs
          where rs.race_id = rr.id
            and rs.stage_date = g.plan_date
            and coalesce(rs.weather_cancelled, false) = false
        )
    ) as race_day,
    exists (
      select 1
      from public.training_camp_participants tcp
      join public.training_camp_bookings tcb on tcb.id = tcp.booking_id
      where tcp.rider_id = g.rider_id
        and tcb.status in ('planned', 'active')
        and g.plan_date between tcb.start_date and tcb.end_date
    ) as camp_day,
    exists (
      select 1
      from public.rider_health_cases hc
      where hc.rider_id = g.rider_id
        and hc.status in ('active', 'recovering')
        and hc.training_blocked = true
        and g.plan_date between hc.started_on and coalesce(hc.recovery_until, hc.active_until)
    ) as health_block,
    g.availability_status in ('injured', 'sick') as unavailable
  from grid g
  left join lateral (
    select p.*
    from public.rider_regular_training_daily_plans p
    where p.club_id = p_club_id
      and p.rider_id = g.rider_id
      and p.plan_date = g.plan_date
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1
  ) dp on true
  left join lateral (
    select p.*
    from public.rider_regular_training_plans p
    where p.club_id = p_club_id
      and p.rider_id = g.rider_id
      and coalesce(p.is_active, true) = true
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1
  ) rtp on true
  left join lateral (
    select d.*
    from public.club_regular_training_defaults d
    where d.club_id = p_club_id
      and d.team_scope in (g.team_scope, 'all')
    order by
      case when d.team_scope = g.team_scope then 0 else 1 end,
      d.updated_at desc nulls last,
      d.created_at desc nulls last
    limit 1
  ) ctd on true
), chosen as (
  select
    r.*,
    case
      when r.daily_plan_id is not null
        and r.daily_status = 'planned'
        and r.daily_focus is not null
        and r.daily_intensity is not null
        then r.daily_focus
      when r.daily_plan_id is not null then null
      when r.rider_plan_id is not null
        and coalesce(r.rider_auto_when_free, false)
        and r.rider_focus is not null
        and r.rider_intensity is not null
        and (
          r.rider_preferred_days is null
          or array_length(r.rider_preferred_days, 1) is null
          or r.iso_dow = any(r.rider_preferred_days)
        )
        then r.rider_focus
      when r.rider_plan_id is not null then null
      when r.club_default_id is not null
        and coalesce(r.club_auto_when_free, false)
        and r.club_focus is not null
        and r.club_intensity is not null
        then r.club_focus
      else null
    end as effective_focus,
    case
      when r.daily_plan_id is not null
        and r.daily_status = 'planned'
        and r.daily_focus is not null
        and r.daily_intensity is not null
        then r.daily_source_type
      when r.daily_plan_id is not null then null
      when r.rider_plan_id is not null
        and coalesce(r.rider_auto_when_free, false)
        and r.rider_focus is not null
        and r.rider_intensity is not null
        and (
          r.rider_preferred_days is null
          or array_length(r.rider_preferred_days, 1) is null
          or r.iso_dow = any(r.rider_preferred_days)
        )
        then 'rider_plan'
      when r.rider_plan_id is not null then null
      when r.club_default_id is not null
        and coalesce(r.club_auto_when_free, false)
        and r.club_focus is not null
        and r.club_intensity is not null
        then 'club_default'
      else null
    end as effective_source
  from resolved r
), classified as (
  select
    c.*,
    (
      not c.activity_day
      and not c.race_day
      and not c.camp_day
      and not c.health_block
      and not c.unavailable
      and c.effective_focus is not null
      and c.effective_focus <> 'day_off'
    ) as scheduled,
    (
      c.activity_day
      or c.race_day
      or c.camp_day
      or c.health_block
      or c.unavailable
      or c.effective_focus is not null
    ) as covered
  from chosen c
)
select
  count(*) filter (where scheduled)::integer,
  count(*) filter (
    where not activity_day
      and not race_day
      and not camp_day
      and not health_block
      and not unavailable
      and effective_focus is not null
      and effective_source = 'manual_override'
  )::integer,
  count(*) filter (where race_day)::integer,
  count(*) filter (where camp_day)::integer,
  count(*) filter (where health_block)::integer,
  count(*) filter (where unavailable)::integer,
  count(*) filter (where covered)::integer,
  count(*) filter (where not covered)::integer
from classified;
$function$
;

CREATE OR REPLACE FUNCTION public.uwt_race_team_eligible_v1(p_race_id uuid, p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select case
        when r.category not in ('1.UWT','2.UWT') then true
        when c.club_tier::text = 'worldteam' then true
        when c.club_tier::text = 'proteam'
          and public.race_ai_geographic_priority_v1(r.country_code, c.country_code) <= 2
          then true
        else false
      end
      from public.races r
      join public.clubs c on c.id = p_club_id
      where r.id = p_race_id
      limit 1
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.notification_canonical_type_code_v2(p_type_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case upper(btrim(coalesce(p_type_code,'')))
    when 'RACE_APPLICATION_WINDOW_OPEN' then null
    when 'RACE_APPLICATION_CLOSING_SOON' then null
    when 'RACE_PLAN_OPEN' then null
    when 'RACE_PLAN_NEEDS_ATTENTION' then null
    when 'RACE_PLAN_FINALISED' then null
    when 'RACE_PLAN_DEADLINE_REMINDER' then null
    when 'STAGE_PLANS_OPEN' then null
    when 'STAGE_PLAN_LOCK_REMINDER' then null
    when 'STAGE_PLAN_LOCKED' then null
    when 'STAGE_PLAN_MISSING_AT_LOCK' then null
    when 'STAGE_PLAN_MISSING_REMINDER' then null
    when 'RIDER_INJURED' then null
    when 'RIDER_SICK' then null
    when 'RIDER_NOT_FULLY_FIT' then null
    when 'RIDER_FIT_AGAIN' then null
    when 'RACE_SUPPLIES_LOW_STOCK' then 'RACE_SUPPLIES_LOW'
    when 'CLUB_LIQUIDATED_INSOLVENCY' then 'FINANCE_CLUB_LIQUIDATED'
    else nullif(btrim(p_type_code),'')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_notification_game_date_label_v1(p_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select format('Season %s, %s', extract(year from p_date)::int - 1999, to_char(p_date, 'DD.MM'));
$function$
;

CREATE OR REPLACE FUNCTION public.race_plan_asset_effective_value_v1(p_asset_key text, p_condition_percent numeric, p_effect_value numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
  when lower(coalesce(p_asset_key,'')) in ('medical_van','medical') then round(
    p_effect_value * public.medical_van_condition_factor(p_condition_percent),2
  )
  else p_effect_value
end;
$function$
;

CREATE OR REPLACE FUNCTION public.team_car_condition_loss_for_asset_v1(p_asset_id uuid, p_asset_snapshot jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key = 'team_car'
  and cfg.asset_level = coalesce(
    nullif(p_asset_snapshot ->> 'asset_level', '')::integer,
    (select tc.asset_level::integer from public.club_team_cars tc where tc.id = p_asset_id)
  )
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_result_duration_label_v1(p_seconds integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_seconds is null then null
    when p_seconds < 0 then null
    when p_seconds >= 3600 then
      (p_seconds / 3600)::text || ':' ||
      lpad(((p_seconds % 3600) / 60)::text, 2, '0') || ':' ||
      lpad((p_seconds % 60)::text, 2, '0')
    else
      ((p_seconds % 3600) / 60)::text || ':' ||
      lpad((p_seconds % 60)::text, 2, '0')
  end
$function$
;

CREATE OR REPLACE FUNCTION public.team_bus_condition_loss_for_asset_v1(p_asset_id uuid, p_asset_snapshot jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key = 'team_bus'
  and cfg.asset_level = coalesce(
    nullif(p_asset_snapshot ->> 'asset_level', '')::integer,
    (select tb.asset_level::integer from public.club_team_buses tb where tb.id = p_asset_id)
  )
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_van_condition_factor(p_condition_percent numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
select case
  when coalesce(p_condition_percent,0) >= 90 then 1.00
  when coalesce(p_condition_percent,0) >= 75 then 0.95
  when coalesce(p_condition_percent,0) >= 60 then 0.85
  when coalesce(p_condition_percent,0) >= 45 then 0.70
  when coalesce(p_condition_percent,0) >= 30 then 0.50
  else 0.00
end::numeric;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_van_level_mechanical_reliability_v1(p_asset_level integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select coalesce(sum(abs(r.effect_value)),0)::numeric
from public.race_plan_effect_rules r
where r.source_type='asset'
  and r.source_key='equipment_van'
  and r.source_level=p_asset_level
  and r.is_active=true
  and r.effect_key <> 'equipment_wear_protection_pct';
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_van_level_equipment_protection_pct_v1(p_asset_level integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select coalesce(max(abs(r.effect_value)),0)::numeric
from public.race_plan_effect_rules r
where r.source_type='asset'
  and r.source_key='equipment_van'
  and r.source_level=p_asset_level
  and r.is_active=true
  and r.effect_key='equipment_wear_protection_pct';
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_van_condition_loss_for_asset_v1(p_asset_id uuid, p_asset_snapshot jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key='equipment_van'
  and cfg.asset_level = coalesce(
    nullif(p_asset_snapshot->>'asset_level','')::integer,
    (select ev.asset_level::integer from public.club_equipment_vans ev where ev.id=p_asset_id)
  )
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_plan_equipment_van_protection_pct_from_snapshot_v1(p_validation_snapshot jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
  where a.asset->>'source_key'='equipment_van'
)
select least(
  30::numeric,
  coalesce(max(abs(public.race_bonus_parse_numeric_v1(effect->'value'))),0)
)
from effects
where effect->>'effect_key'='equipment_wear_protection_pct';
$function$
;

CREATE OR REPLACE FUNCTION public.race_plan_equipment_van_protection_pct_for_stage_v1(p_stage_id uuid, p_team_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select coalesce(
  (
    select public.race_plan_equipment_van_protection_pct_from_snapshot_v1(rp.validation_snapshot_json)
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
$function$
;

CREATE OR REPLACE FUNCTION public.mobile_workshop_condition_factor(p_condition_percent numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
select case
  when coalesce(p_condition_percent,0) >= 90 then 1.00
  when coalesce(p_condition_percent,0) >= 75 then 0.95
  when coalesce(p_condition_percent,0) >= 60 then 0.85
  when coalesce(p_condition_percent,0) >= 45 then 0.70
  when coalesce(p_condition_percent,0) >= 30 then 0.50
  else 0.00
end::numeric;
$function$
;

CREATE OR REPLACE FUNCTION public.mobile_workshop_level_mechanical_reliability_v1(p_asset_level integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select coalesce(sum(abs(r.effect_value)),0)::numeric
from public.race_plan_effect_rules r
where r.source_type='asset'
  and r.source_key='mobile_workshop'
  and r.source_level=p_asset_level
  and r.is_active=true
  and r.effect_key <> 'field_equipment_recovery_pct';
$function$
;

CREATE OR REPLACE FUNCTION public.mobile_workshop_level_field_recovery_pct_v1(p_asset_level integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select coalesce(max(abs(r.effect_value)),0)::numeric
from public.race_plan_effect_rules r
where r.source_type='asset'
  and r.source_key='mobile_workshop'
  and r.source_level=p_asset_level
  and r.is_active=true
  and r.effect_key='field_equipment_recovery_pct';
$function$
;

CREATE OR REPLACE FUNCTION public.mobile_workshop_condition_loss_for_asset_v1(p_asset_id uuid, p_asset_snapshot jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key='mobile_workshop'
  and cfg.asset_level=coalesce(
    nullif(p_asset_snapshot->>'asset_level','')::integer,
    (select mw.asset_level::integer from public.club_mobile_workshops mw where mw.id=p_asset_id)
  )
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_plan_mobile_workshop_field_recovery_pct_from_snapshot_v1(p_validation_snapshot jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.race_plan_mobile_workshop_field_recovery_pct_for_stage_v1(p_stage_id uuid, p_team_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.medical_van_condition_factor(p_condition_percent numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
select case
  when coalesce(p_condition_percent,0) >= 90 then 1.00
  when coalesce(p_condition_percent,0) >= 75 then 0.95
  when coalesce(p_condition_percent,0) >= 60 then 0.85
  when coalesce(p_condition_percent,0) >= 45 then 0.70
  when coalesce(p_condition_percent,0) >= 30 then 0.50
  else 0.00
end::numeric;
$function$
;

CREATE OR REPLACE FUNCTION public.medical_van_condition_loss_for_asset_v1(p_asset_id uuid, p_asset_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select cfg.condition_loss_per_race_day
from public.infrastructure_asset_config cfg
where cfg.asset_key='medical_van'
  and cfg.asset_level=coalesce(
    nullif(p_asset_snapshot->>'asset_level','')::integer,
    (select medical.asset_level::integer
     from public.club_medical_vans medical
     where medical.id=p_asset_id)
  )
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.race_team_stage_jersey_shortage_penalty_v1(p_stage_id uuid, p_team_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with stage_context as (
    select coalesce(r.metadata,'{}'::jsonb) as race_metadata
    from public.race_stages s
    join public.races r on r.id = s.race_id
    where s.id = p_stage_id
  )
  select case
    when coalesce((select (race_metadata->>'national_championship')::boolean from stage_context),false)
      then jsonb_build_object(
        'applies',false,
        'required_jersey_units',0,
        'available_jersey_units',0,
        'missing_jersey_units',0,
        'shortage_ratio',0,
        'preparation_bonus_reduction_pct',0,
        'energy_cost_penalty_pct',0,
        'post_stage_fatigue_penalty_pct',0,
        'rule','national_championship_organizer_kit_v1'
      )
    else (
      select jsonb_build_object(
        'applies',coalesce((e->>'missing_jersey_units')::integer,0)>0,
        'required_jersey_units',coalesce((e->>'required_jersey_units')::integer,0),
        'available_jersey_units',coalesce((e->>'effective_available_jersey_units')::integer,0),
        'missing_jersey_units',coalesce((e->>'missing_jersey_units')::integer,0),
        'shortage_ratio',coalesce((e->>'jersey_shortage_ratio')::numeric,0),
        'preparation_bonus_reduction_pct',coalesce((e->>'preparation_bonus_reduction_pct')::numeric,0),
        'energy_cost_penalty_pct',coalesce((e->>'energy_cost_penalty_pct')::numeric,0),
        'post_stage_fatigue_penalty_pct',coalesce((e->>'post_stage_fatigue_penalty_pct')::numeric,0),
        'rule','optional_race_jersey_performance_penalty_v1'
      )
      from (select public.race_team_stage_eligibility_v1(p_stage_id,p_team_id) e) x
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_full_race_standings_v1(p_race_id uuid, p_after_stage_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with selected_stage as (
  select
    rs.id as stage_id,
    rs.stage_number
  from public.race_stages rs
  where rs.race_id = p_race_id
    and rs.id = coalesce(
      p_after_stage_id,
      (
        select standings.after_stage_id
        from public.race_classification_standings standings
        join public.race_stages classified_stage
          on classified_stage.id = standings.after_stage_id
         and classified_stage.race_id = standings.race_id
        where standings.race_id = p_race_id
          and standings.classification_type = 'general'
          and standings.entity_type = 'rider'
        group by standings.after_stage_id, classified_stage.stage_number
        order by classified_stage.stage_number desc
        limit 1
      )
    )
  limit 1
),
roster as (
  select
    participant.id,
    participant.race_id,
    participant.team_id,
    participant.club_id,
    participant.rider_id,
    participant.rider_name_snapshot,
    participant.team_name_snapshot,
    participant.country_code_snapshot,
    participant.start_number
  from public.race_participant_riders_v1 participant
  where participant.race_id = p_race_id
),
current_general as (
  select standing.*
  from public.race_classification_standings standing
  join selected_stage selected
    on selected.stage_id = standing.after_stage_id
  where standing.race_id = p_race_id
    and standing.classification_type = 'general'
    and standing.entity_type = 'rider'
),
effective_team_disqualifications as (
  select distinct on (disqualification.team_id)
    disqualification.team_id,
    disqualification.from_stage_id,
    disqualification.from_stage_number,
    disqualification.reason_code,
    disqualification.required_jersey_units,
    disqualification.available_jersey_units,
    disqualification.missing_jersey_units
  from public.race_team_stage_disqualifications disqualification
  cross join selected_stage selected
  where disqualification.race_id = p_race_id
    and disqualification.from_stage_number <= selected.stage_number
  order by
    disqualification.team_id,
    disqualification.from_stage_number asc,
    disqualification.created_at asc
),
last_stage_results as (
  select distinct on (result.rider_id)
    result.rider_id,
    result.stage_id,
    stage.stage_number,
    result.rank,
    result.status,
    result.elapsed_seconds,
    result.gap_seconds
  from public.race_stage_results result
  join public.race_stages stage
    on stage.id = result.stage_id
   and stage.race_id = result.race_id
  cross join selected_stage selected
  where result.race_id = p_race_id
    and stage.stage_number <= selected.stage_number
  order by
    result.rider_id,
    stage.stage_number desc,
    result.created_at desc
),
standing_rows as (
  select
    roster.rider_id,
    roster.team_id,
    roster.rider_name_snapshot,
    roster.team_name_snapshot,
    roster.country_code_snapshot,
    roster.start_number,
    current_general.rank,
    current_general.previous_rank,
    current_general.total_time_seconds,
    current_general.gap_seconds,
    case
      when disqualification.team_id is not null then 'dsq'
      when last_result.status in ('dnf', 'dns', 'otl', 'dsq') then last_result.status
      when current_general.rider_id is not null then 'active'
      else 'not_classified'
    end as status,
    case
      when disqualification.team_id is not null then disqualification.from_stage_number
      when last_result.status in ('dnf', 'dns', 'otl', 'dsq') then last_result.stage_number
      else null
    end as status_from_stage_number,
    disqualification.reason_code as status_reason_code,
    disqualification.required_jersey_units,
    disqualification.available_jersey_units,
    disqualification.missing_jersey_units,
    last_result.stage_number as last_result_stage_number,
    last_result.rank as last_result_rank,
    last_result.status as last_result_status,
    last_result.elapsed_seconds as last_result_elapsed_seconds,
    last_result.gap_seconds as last_result_gap_seconds
  from roster
  cross join selected_stage selected
  left join current_general
    on current_general.rider_id = roster.rider_id
  left join effective_team_disqualifications disqualification
    on disqualification.team_id = roster.team_id
  left join last_stage_results last_result
    on last_result.rider_id = roster.rider_id
),
rows_payload as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rider_id', row_data.rider_id,
        'team_id', row_data.team_id,
        'rider_name_snapshot', row_data.rider_name_snapshot,
        'team_name_snapshot', row_data.team_name_snapshot,
        'country_code_snapshot', row_data.country_code_snapshot,
        'start_number', row_data.start_number,
        'rank', row_data.rank,
        'previous_rank', row_data.previous_rank,
        'total_time_seconds', row_data.total_time_seconds,
        'gap_seconds', row_data.gap_seconds,
        'status', row_data.status,
        'status_from_stage_number', row_data.status_from_stage_number,
        'status_reason_code', row_data.status_reason_code,
        'required_jersey_units', row_data.required_jersey_units,
        'available_jersey_units', row_data.available_jersey_units,
        'missing_jersey_units', row_data.missing_jersey_units,
        'last_result_stage_number', row_data.last_result_stage_number,
        'last_result_rank', row_data.last_result_rank,
        'last_result_status', row_data.last_result_status,
        'last_result_elapsed_seconds', row_data.last_result_elapsed_seconds,
        'last_result_gap_seconds', row_data.last_result_gap_seconds
      )
      order by
        case when row_data.status = 'active' then 0 else 1 end,
        case when row_data.status = 'active' then row_data.rank end nulls last,
        row_data.status_from_stage_number nulls last,
        row_data.start_number nulls last,
        row_data.rider_name_snapshot nulls last,
        row_data.rider_id
    ),
    '[]'::jsonb
  ) as rows
  from standing_rows row_data
),
summary_payload as (
  select jsonb_build_object(
    'started', count(*),
    'active', count(*) filter (where status = 'active'),
    'dsq', count(*) filter (where status = 'dsq'),
    'dnf', count(*) filter (where status = 'dnf'),
    'dns', count(*) filter (where status = 'dns'),
    'otl', count(*) filter (where status = 'otl'),
    'not_classified', count(*) filter (where status = 'not_classified')
  ) as summary
  from standing_rows
)
select jsonb_build_object(
  'race_id', p_race_id,
  'stage_id', selected.stage_id,
  'stage_number', selected.stage_number,
  'rows', rows_payload.rows,
  'summary', summary_payload.summary
)
from selected_stage selected
cross join rows_payload
cross join summary_payload;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_scenario_history_v1(p_race_id uuid, p_game_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'raceId', scenario.race_id,
        'stageId', scenario.stage_id,
        'gameDate', scenario.game_date,
        'scenarioType', scenario.scenario_type,
        'templateId', scenario.template_id,
        'family', scenario.template_family,
        'status', scenario.selection_status
      )
      order by scenario.game_date, scenario.selected_at, scenario.stage_id
    ),
    '[]'::jsonb
  )
  from public.race_engine_scenario_runs scenario
  where scenario.selection_status in ('reserved','completed')
    and (
      scenario.race_id = p_race_id
      or (p_game_date is not null and scenario.game_date = p_game_date)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_compact_phase9_for_engine_v1(p_phase9 jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p_phase9 is null or jsonb_typeof(p_phase9) <> 'object' then coalesce(p_phase9, '{}'::jsonb)
    else jsonb_set(
      p_phase9,
      '{riderModifiers}',
      coalesce((
        select jsonb_agg(
          coalesce((
            select jsonb_object_agg(e.key, e.value)
            from jsonb_each(rm.value) e
            where jsonb_typeof(e.value) in ('string','number','boolean','null')
          ), '{}'::jsonb)
          order by rm.ordinality
        )
        from jsonb_array_elements(coalesce(p_phase9->'riderModifiers','[]'::jsonb)) with ordinality as rm(value, ordinality)
      ), '[]'::jsonb),
      true
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_operations_validate_alert_secret_v1(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'race_operations_alert_worker_secret_v1'
      and s.decrypted_secret = p_secret
  );
$function$
;

CREATE OR REPLACE FUNCTION public.user_has_premium_access_v1(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select
        coalesce(s.access_until > now(), false)
        and (
          coalesce(s.stripe_status, 'free') not in ('canceled', 'incomplete_expired')
          or lower(coalesce(s.metadata ->> 'manual_test_access', 'false')) in ('true', '1', 'yes')
        )
      from public.user_premium_subscriptions s
      where s.user_id = p_user_id
      limit 1
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rider_potential_headroom_multiplier_v1(p_rider_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with rider as (
  select
    r.id,
    coalesce(r.overall,0)::numeric as overall,
    r.potential::numeric as potential,
    least(
      96::numeric,
      greatest(
        60::numeric,
        round(50::numeric + coalesce(r.potential,65)::numeric * 0.50)
      )
    ) as projected_ceiling
  from public.riders r
  where r.id=p_rider_id
)
select case
  when rider.id is null or rider.potential is null then 1.0000::numeric
  when rider.overall <= rider.projected_ceiling-15 then 1.0000
  when rider.overall <= rider.projected_ceiling-10 then 0.9000
  when rider.overall <= rider.projected_ceiling-6  then 0.7500
  when rider.overall <= rider.projected_ceiling-3  then 0.5500
  when rider.overall <= rider.projected_ceiling    then 0.3500
  when rider.overall <= rider.projected_ceiling+3  then 0.1800
  when rider.overall <= rider.projected_ceiling+6  then 0.0800
  else 0.0300
end::numeric
from rider
union all
select 1.0000::numeric
where not exists(select 1 from rider)
limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_team_policy_live_effects_v1(p_club_id uuid)
 RETURNS TABLE(recovery_bonus integer, fatigue_reduction_bonus integer, morale_delta integer, contract_happiness_bonus integer, staff_efficiency_bonus integer, staff_morale_delta integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with p as (
  select *
  from public.club_team_policies
  where club_id=p_club_id
  limit 1
),
selected as (
  select c.effect_json
  from p
  cross join lateral (
    values
      ('rider_housing_support', p.rider_housing_support::text),
      ('nutrition_support_level', p.nutrition_support_level::text),
      ('recovery_support_level', p.recovery_support_level::text),
      ('staff_equipment_level', p.staff_equipment_level::text),
      ('rider_bonus_plan', p.rider_bonus_plan::text),
      ('staff_bonus_plan', p.staff_bonus_plan::text)
  ) s(policy_key,option_code)
  join public.team_policy_option_catalog c
    on c.policy_key=s.policy_key
   and c.option_code=s.option_code
   and c.is_active=true
)
select
  coalesce(sum(coalesce((effect_json->>'recovery_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'fatigue_reduction_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'morale_delta')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'contract_happiness_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'staff_efficiency_bonus')::integer,0)),0)::integer,
  coalesce(sum(coalesce((effect_json->>'staff_morale_delta')::integer,0)),0)::integer
from selected;
$function$
;

CREATE OR REPLACE FUNCTION public.team_policy_staff_quality_bonus_v1(p_club_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select least(
    8::numeric,
    greatest(
      0::numeric,
      coalesce(e.staff_efficiency_bonus,0)::numeric
      + coalesce(e.staff_morale_delta,0)::numeric * 0.5
    )
  )
  from public.get_club_team_policy_live_effects_v1(p_club_id) e;
$function$
;

CREATE OR REPLACE FUNCTION public.team_policy_contract_happiness_bonus_v1(p_club_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select least(6,greatest(0,coalesce(e.contract_happiness_bonus,0)*3))
  from public.get_club_team_policy_live_effects_v1(p_club_id) e;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_system_incident_unread_count_v1()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select case when auth.uid() is null or not public.is_app_admin_v1() then 0 else (
   select count(*)::integer from public.system_incidents i
   where i.status in ('open','acknowledged')
   and not exists(select 1 from public.system_incident_admin_reads r where r.incident_id=i.id and r.admin_user_id=auth.uid())
 ) end;
$function$
;

CREATE OR REPLACE FUNCTION public.system_health_validate_alert_secret_v1(p_secret text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
 select exists(select 1 from vault.decrypted_secrets where name='system_health_alert_worker_secret_v1' and decrypted_secret=p_secret);
$function$
;

CREATE OR REPLACE FUNCTION public.control_center_resource_metrics_v1()
 RETURNS TABLE(metric_key text, metric_label text, used_value numeric, total_value numeric, unit text, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'auth', 'storage'
AS $function$
with
db as (
  select pg_database_size(current_database())::numeric db_bytes,
         coalesce((select sum(size)::numeric from pg_ls_waldir()),0) wal_bytes
),
st as (
  select coalesce(sum((metadata->>'size')::numeric),0) storage_bytes
  from storage.objects where metadata ? 'size'
),
au as (
  select
    count(*) filter(where last_sign_in_at>=date_trunc('month',now()))::numeric mau,
    (select count(*)::numeric from auth.sessions where created_at>=now()-interval '24 hours') auth24
  from auth.users
),
conn as (
  select (select count(*)::numeric from pg_stat_activity where datname=current_database()) conns,
         current_setting('max_connections')::numeric maxc
),
ds as (
  select coalesce(round(100.0*blks_hit/nullif(blks_hit+blks_read,0),2),100)::numeric cache_hit,
         coalesce(round(100.0*xact_commit/nullif(xact_commit+xact_rollback,0),2),100)::numeric tx_success
  from pg_stat_database where datname=current_database()
),
traffic as (
  select coalesce(sum(pageview_count),0)::numeric pageviews
  from public.site_analytics_daily_sessions
  where last_seen_at>=now()-interval '24 hours'
),
latest as (
  select distinct on(p.process_key)
    p.process_key,p.stale_after_minutes,r.status,
    coalesce(r.finished_at,r.started_at,r.created_at) observed_at
  from public.system_monitor_processes p
  left join public.system_monitor_runs r on r.process_key=p.process_key
  where p.is_enabled=true
  order by p.process_key,coalesce(r.finished_at,r.started_at,r.created_at) desc nulls last
),
ph as (
  select count(*)::numeric total,
         count(*) filter(where status in('success','running') and (stale_after_minutes is null or observed_at is null or observed_at>=now()-make_interval(mins=>stale_after_minutes)))::numeric healthy
  from latest
),
rh as (
  select count(*)::numeric total,count(*) filter(where status='success')::numeric good
  from public.system_monitor_runs where created_at>=now()-interval '24 hours'
),
inci as (
  select count(*) filter(where status<>'resolved')::numeric open_count,
         count(*) filter(where status<>'resolved' and lower(severity) in('critical','error'))::numeric critical_count
  from public.system_incidents
)
select 'database_size','Database size',db_bytes,8589934592,'bytes',
       case when db_bytes/8589934592>=.90 then 'critical' when db_bytes/8589934592>=.75 then 'warning' else 'healthy' end from db
union all
select 'disk_usage','Disk (DB + WAL)',db_bytes+wal_bytes,8589934592,'bytes',
       case when (db_bytes+wal_bytes)/8589934592>=.90 then 'critical' when (db_bytes+wal_bytes)/8589934592>=.75 then 'warning' else 'healthy' end from db
union all
select 'storage_usage','Object storage',storage_bytes,107374182400,'bytes',
       case when storage_bytes/107374182400>=.90 then 'critical' when storage_bytes/107374182400>=.75 then 'warning' else 'healthy' end from st
union all
select 'monthly_active_users','Monthly active users',mau,100000,'users',
       case when mau>=90000 then 'critical' when mau>=75000 then 'warning' else 'healthy' end from au
union all
select 'database_connections','DB connections',conns,maxc,'connections',
       case when conns/maxc>=.90 then 'critical' when conns/maxc>=.75 then 'warning' else 'healthy' end from conn
union all
select 'cache_hit_rate','Cache hit rate',cache_hit,100,'% ',
       case when cache_hit<70 then 'critical' when cache_hit<90 then 'warning' else 'healthy' end from ds
union all
select 'transaction_success','Transaction success',tx_success,100,'%',
       case when tx_success<85 then 'critical' when tx_success<90 then 'warning' else 'healthy' end from ds
union all
select 'system_process_health','Process health',case when total=0 then 0 else round(100*healthy/total,2) end,100,'%',
       case when total=0 or 100*healthy/nullif(total,0)<70 then 'critical' when 100*healthy/nullif(total,0)<95 then 'warning' else 'healthy' end from ph
union all
select 'monitor_run_success','Monitor run success',case when total=0 then 100 else round(100*good/total,2) end,100,'%',
       case when total>0 and 100*good/nullif(total,0)<80 then 'critical' when total>0 and 100*good/nullif(total,0)<95 then 'warning' else 'healthy' end from rh
union all
select 'pageviews_24h','Pageviews (24h)',pageviews,null,'pageviews','healthy' from traffic
union all
select 'auth_activity_24h','Auth sessions (24h)',auth24,null,'sessions','healthy' from au
union all
select 'open_incidents','Open incidents',open_count,null,'incidents',
       case when critical_count>0 then 'critical' when open_count>0 then 'warning' else 'healthy' end from inci;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_control_center_platform_collector(p_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'vault', 'extensions'
AS $function$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name='control_center_platform_collector_secret'
      and encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') = encode(extensions.digest(decrypted_secret,'sha256'),'hex')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.jsonb_object_length(p_value jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select count(*)::integer
  from jsonb_object_keys(coalesce(p_value,'{}'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_population_plan_v1(p_eligible_count integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cfg as (
    select *
    from public.national_championship_config
    where id=true
  ),
  calc as (
    select
      greatest(coalesce(p_eligible_count,0),0)::int eligible_count,
      cfg.final_field_size,
      cfg.qualification_heat_max_size
    from cfg
  )
  select jsonb_build_object(
    'eligible_count',eligible_count,
    'final_field_size',least(eligible_count,final_field_size),
    'direct_qualifiers',case
      when eligible_count<=final_field_size then eligible_count
      else 0
    end,
    'qualification_population',case
      when eligible_count<=final_field_size then 0
      else eligible_count
    end,
    'qualification_places',case
      when eligible_count<=final_field_size then 0
      else final_field_size
    end,
    'heat_count',case
      when eligible_count<=final_field_size then 0
      else ceil(eligible_count::numeric/qualification_heat_max_size)::int
    end
  )
  from calc;
$function$
;

CREATE OR REPLACE FUNCTION public.preview_national_ranking_v1(p_country_code text, p_snapshot_date date)
 RETURNS TABLE(national_rank integer, rider_id uuid, club_id uuid, rider_name text, country_code text, raw_points integer, weighted_points numeric, best_weighted_result numeric, latest_result_date date, overall integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cfg as (
    select *
    from public.national_championship_config
    where id = true
  ),
  award_events as (
    select
      a.rider_id,
      a.rider_points::integer as rider_points,
      coalesce(rs.stage_date, rr.end_date) as performance_date
    from public.race_ranking_point_awards a
    join public.races rr on rr.id = a.race_id
    left join public.race_stages rs on rs.id = a.stage_id
    where a.rider_id is not null
      and a.rider_points > 0

    union all

    select
      b.rider_id,
      b.points::integer,
      b.award_date
    from public.national_championship_ranking_bonus_awards b
    where b.points > 0
  ),
  perf as (
    select
      ae.rider_id,
      coalesce(sum(ae.rider_points),0)::int as raw_points,
      coalesce(sum(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as weighted_points,
      coalesce(max(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as best_weighted_result,
      max(ae.performance_date) as latest_result_date
    from award_events ae
    cross join cfg
    where ae.performance_date <= p_snapshot_date
      and ae.performance_date > p_snapshot_date - cfg.ranking_window_days
    group by ae.rider_id
  ),
  base as (
    select
      r.id as rider_id,
      club.club_id,
      coalesce(nullif(trim(r.first_name || ' ' || r.last_name),''), r.display_name, r.id::text) as rider_name,
      upper(r.country_code) as country_code,
      coalesce(perf.raw_points,0)::int as raw_points,
      coalesce(perf.weighted_points,0)::numeric(14,3) as weighted_points,
      coalesce(perf.best_weighted_result,0)::numeric(14,3) as best_weighted_result,
      perf.latest_result_date,
      coalesce(r.overall,0)::int as overall
    from public.riders r
    left join perf on perf.rider_id = r.id
    left join lateral (
      select cr.club_id
      from public.club_riders cr
      where cr.rider_id = r.id
      order by cr.created_at desc, cr.id desc
      limit 1
    ) club on true
    where upper(r.country_code) = upper(trim(p_country_code))
  )
  select
    row_number() over (
      order by
        weighted_points desc,
        best_weighted_result desc,
        latest_result_date desc nulls last,
        overall desc,
        rider_id
    )::int as national_rank,
    rider_id,
    club_id,
    rider_name,
    country_code,
    raw_points,
    weighted_points,
    best_weighted_result,
    latest_result_date,
    overall
  from base
  order by national_rank;
$function$
;

CREATE OR REPLACE FUNCTION public.get_national_championship_overview_v1(p_country_code text, p_season_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with target as (
    select e.*
    from public.national_championship_editions e
    where e.country_code = upper(trim(p_country_code))
      and e.discipline = 'road'
      and e.season_number = coalesce(
        p_season_number,
        (select gs.season_number from public.game_state gs where gs.id = true)
      )
    limit 1
  )
  select jsonb_build_object(
    'edition',to_jsonb(t),
    'heats',coalesce((
      select jsonb_agg(to_jsonb(h) order by h.heat_number)
      from public.national_championship_heats h
      where h.edition_id = t.id
    ),'[]'::jsonb),
    'ranking_top_20',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select
          s.national_rank,s.rider_id,s.club_id,s.rider_name_snapshot,
          s.weighted_points,s.raw_points,s.latest_result_date,s.overall_snapshot
        from public.national_championship_ranking_snapshots s
        where s.edition_id = t.id
        order by s.national_rank
        limit 20
      ) r
    ),'[]'::jsonb)
  )
  from target t;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_profile_kind_v1(p_country_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when ((pg_catalog.hashtextextended(upper(trim(coalesce(p_country_code,''))), 17) % 3) + 3) % 3 = 0
      then 'flat'
    when ((pg_catalog.hashtextextended(upper(trim(coalesce(p_country_code,''))), 17) % 3) + 3) % 3 = 1
      then 'hilly'
    else 'mountain'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_profile_points_v1(p_distance_km numeric, p_profile_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case lower(coalesce(p_profile_kind,'hilly'))
    when 'flat' then jsonb_build_array(
      jsonb_build_object('km',0,'elevation_m',90),
      jsonb_build_object('km',round(p_distance_km*0.10,1),'elevation_m',115),
      jsonb_build_object('km',round(p_distance_km*0.20,1),'elevation_m',85),
      jsonb_build_object('km',round(p_distance_km*0.30,1),'elevation_m',150),
      jsonb_build_object('km',round(p_distance_km*0.40,1),'elevation_m',105),
      jsonb_build_object('km',round(p_distance_km*0.50,1),'elevation_m',165),
      jsonb_build_object('km',round(p_distance_km*0.60,1),'elevation_m',100),
      jsonb_build_object('km',round(p_distance_km*0.70,1),'elevation_m',175),
      jsonb_build_object('km',round(p_distance_km*0.80,1),'elevation_m',105),
      jsonb_build_object('km',round(p_distance_km*0.90,1),'elevation_m',135),
      jsonb_build_object('km',p_distance_km,'elevation_m',100)
    )
    when 'mountain' then jsonb_build_array(
      jsonb_build_object('km',0,'elevation_m',240),
      jsonb_build_object('km',round(p_distance_km*0.10,1),'elevation_m',420),
      jsonb_build_object('km',round(p_distance_km*0.20,1),'elevation_m',980),
      jsonb_build_object('km',round(p_distance_km*0.30,1),'elevation_m',510),
      jsonb_build_object('km',round(p_distance_km*0.40,1),'elevation_m',1380),
      jsonb_build_object('km',round(p_distance_km*0.50,1),'elevation_m',620),
      jsonb_build_object('km',round(p_distance_km*0.60,1),'elevation_m',1720),
      jsonb_build_object('km',round(p_distance_km*0.70,1),'elevation_m',850),
      jsonb_build_object('km',round(p_distance_km*0.80,1),'elevation_m',1940),
      jsonb_build_object('km',round(p_distance_km*0.90,1),'elevation_m',1180),
      jsonb_build_object('km',p_distance_km,'elevation_m',720)
    )
    else jsonb_build_array(
      jsonb_build_object('km',0,'elevation_m',120),
      jsonb_build_object('km',round(p_distance_km*0.10,1),'elevation_m',280),
      jsonb_build_object('km',round(p_distance_km*0.20,1),'elevation_m',155),
      jsonb_build_object('km',round(p_distance_km*0.30,1),'elevation_m',470),
      jsonb_build_object('km',round(p_distance_km*0.40,1),'elevation_m',210),
      jsonb_build_object('km',round(p_distance_km*0.50,1),'elevation_m',610),
      jsonb_build_object('km',round(p_distance_km*0.60,1),'elevation_m',260),
      jsonb_build_object('km',round(p_distance_km*0.70,1),'elevation_m',720),
      jsonb_build_object('km',round(p_distance_km*0.80,1),'elevation_m',320),
      jsonb_build_object('km',round(p_distance_km*0.90,1),'elevation_m',560),
      jsonb_build_object('km',p_distance_km,'elevation_m',190)
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_sanitize_individual_command_v1(p_command text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case lower(trim(coalesce(p_command,'')))
    when 'ride_naturally' then 'ride_naturally'
    when 'conserve_energy' then 'conserve_energy'
    when 'stay_near_front' then 'stay_near_front'
    when 'join_breakaway' then 'join_breakaway'
    when 'attack' then 'attack'
    when 'chase_breakaway' then 'chase_breakaway'
    when 'climb_hard' then 'climb_hard'
    when 'sprint' then 'sprint'
    when 'avoid_risks' then 'avoid_risks'
    else 'ride_naturally'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.world_road_championship_race_date_v1(p_season_number integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (
    make_date(1999+p_season_number,12,14)
    + (
        (7 - extract(dow from make_date(1999+p_season_number,12,14))::integer)
        % 7
      )
  )::date;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_rider_available_for_event_v1(p_rider_id uuid, p_event_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select
      case
        when lower(coalesce(r.availability_status::text,'fit')) = 'retired' then false
        when lower(coalesce(r.availability_status::text,'fit')) in ('injured','sick')
             and (r.unavailable_until is null or r.unavailable_until >= p_event_date)
          then false
        when exists (
          select 1
          from public.rider_health_cases hc
          where hc.rider_id=r.id
            and hc.status in ('active','recovering')
            and hc.selection_blocked is true
            and (
              coalesce(hc.recovery_until,hc.active_until) is null
              or coalesce(hc.recovery_until,hc.active_until) >= p_event_date
            )
        ) then false
        else true
      end
    from public.riders r
    where r.id=p_rider_id
  ),false);
$function$
;

CREATE OR REPLACE FUNCTION public.get_national_team_standard_package_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'cost_model','system_covered',
    'has_treasury',false,
    'staff',jsonb_build_array('national_coach'),
    'equipment',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'equipment_category',s.equipment_category,
          'specialization',s.specialization,
          'model_count',s.model_count,
          'catalog_item_id',e.id,
          'item_key',e.item_key,
          'display_name',e.display_name,
          'tier',e.tier,
          'quality_score',e.quality_score,
          'durability_score',e.durability_score,
          'effects',e.effects,
          'metadata',e.metadata
        )
        order by s.equipment_category,
          case s.specialization
            when 'flat' then 1
            when 'mountain' then 2
            else 3
          end
      )
      from public.national_team_standard_equipment s
      join public.equipment_catalog e on e.id=s.catalog_item_id
      where s.is_active=true
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'asset_key',a.asset_key,
          'asset_level',a.asset_level,
          'quantity',a.quantity,
          'usage_note',a.usage_note
        )
        order by a.asset_key
      )
      from public.national_team_standard_assets a
      where a.is_active=true
    ),'[]'::jsonb),
    'supplies',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'supply_key',s.supply_key,
          'display_name',s.display_name,
          'quantity',s.quantity,
          'replenishment_scope',s.replenishment_scope
        )
        order by s.supply_key
      )
      from public.national_team_standard_supplies s
      where s.is_active=true
    ),'[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.nations_ttt_points_v1(p_finishing_position integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select c.points
    from public.nations_points_curve c
    where c.race_type='team_time_trial'
      and c.version=1
      and c.is_active=true
      and c.finishing_position=p_finishing_position
  ),0);
$function$
;

CREATE OR REPLACE FUNCTION public.nations_road_rider_points_v1(p_finishing_position integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select c.points
    from public.nations_points_curve c
    where c.race_type='road_race'
      and c.version=1
      and c.is_active=true
      and c.finishing_position=p_finishing_position
  ),0);
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_nation_road_race_points_v1(p_finish_positions integer[])
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(x.points),0)::integer
  from (
    select public.nations_road_rider_points_v1(pos) as points
    from unnest(coalesce(p_finish_positions,array[]::integer[])) pos
    where pos is not null and pos>0
    order by public.nations_road_rider_points_v1(pos) desc,pos
    limit 3
  ) x;
$function$
;

CREATE OR REPLACE FUNCTION public.get_nations_competition_event_schedule_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'round_id',r.id,
        'round_index',r.round_index,
        'round_type',r.round_type,
        'round_label',r.round_label,
        'group_id',g.id,
        'group_number',g.group_number,
        'group_label',g.group_label,
        'event_id',e.id,
        'race_day',e.race_day,
        'race_type',e.race_type,
        'cycle_key',e.cycle_key,
        'event_date',e.event_date,
        'race_id',e.race_id,
        'stage_id',e.stage_id,
        'source_stage_id',e.source_stage_id,
        'status',e.status
      )
      order by r.round_index,g.group_number,e.race_day
    ),
    '[]'::jsonb
  )
  from public.nations_competition_rounds r
  join public.nations_competition_groups g on g.round_id=r.id
  join public.nations_group_events e on e.group_id=g.id
  where r.edition_id=p_edition_id;
$function$
;

