-- Medical Van balance and production wiring.
-- Existing submitted race-preparation snapshots are intentionally not rewritten.

update public.race_plan_effect_rules
set effect_value = case
  when source_level = 1 and effect_key = 'medical_response_bonus_pct' then 2
  when source_level = 1 and effect_key = 'minor_injury_risk_reduction_pct' then -1
  when source_level = 1 and effect_key = 'post_stage_recovery_bonus_pct' then 1

  when source_level = 2 and effect_key = 'medical_response_bonus_pct' then 3
  when source_level = 2 and effect_key = 'minor_injury_risk_reduction_pct' then -2
  when source_level = 2 and effect_key = 'hydration_support_bonus_pct' then 2
  when source_level = 2 and effect_key = 'post_stage_recovery_bonus_pct' then 2

  when source_level = 3 and effect_key = 'medical_response_bonus_pct' then 4
  when source_level = 3 and effect_key = 'minor_injury_risk_reduction_pct' then -4
  when source_level = 3 and effect_key = 'hydration_support_bonus_pct' then 4
  when source_level = 3 and effect_key = 'post_stage_recovery_bonus_pct' then 4
  else effect_value
end,
updated_at = clock_timestamp()
where source_type = 'asset'
  and source_key = 'medical_van'
  and source_level in (1,2,3)
  and effect_key in (
    'medical_response_bonus_pct',
    'minor_injury_risk_reduction_pct',
    'hydration_support_bonus_pct',
    'post_stage_recovery_bonus_pct'
  );

update public.infrastructure_asset_config
set effect_summary = case asset_level
  when 1 then 'Health Protection +3 and Recovery Support +1. Reduces lasting health consequences from eligible race incidents and aids post-stage recovery.'
  when 2 then 'Health Protection +5, Fatigue Control +2 and Recovery Support +2. Stronger medical response plus hydration and recovery support.'
  when 3 then 'Health Protection +8, Fatigue Control +4 and Recovery Support +4. Elite race-side medical, hydration and recovery support.'
  else effect_summary
end,
updated_at = clock_timestamp()
where asset_key = 'medical_van'
  and asset_level in (1,2,3);

create or replace function public.medical_van_condition_factor(p_condition_percent numeric)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
select case
  when coalesce(p_condition_percent,0) >= 90 then 1.00
  when coalesce(p_condition_percent,0) >= 75 then 0.95
  when coalesce(p_condition_percent,0) >= 60 then 0.85
  when coalesce(p_condition_percent,0) >= 45 then 0.70
  when coalesce(p_condition_percent,0) >= 30 then 0.50
  else 0.00
end::numeric;
$function$;

create or replace function public.medical_van_condition_loss_for_asset_v1(
  p_asset_id uuid,
  p_asset_snapshot jsonb default '{}'::jsonb
)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
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
$function$;

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
$function$;

-- Patch the Phase 9 input adapter without rewriting its unrelated equipment,
-- supply and staff logic. Fail the migration if the expected source call is absent.
do $do$
declare
  v_def text;
  v_needle text := 'public.mobile_workshop_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)';
  v_replacement text := 'public.mobile_workshop_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)' || chr(10) ||
    '            when asset.asset_key in (''medical_van'', ''medical'') then' || chr(10) ||
    '              public.medical_van_condition_loss_for_asset_v1(asset.asset_id, asset.asset_snapshot_json)';
begin
  select pg_get_functiondef('public.race_engine_get_stage_phase9_inputs_v1(uuid)'::regprocedure)
  into v_def;

  if strpos(v_def, v_needle) = 0 then
    raise exception 'Expected Mobile Workshop Phase 9 wear call was not found.';
  end if;
  if strpos(v_def, 'medical_van_condition_loss_for_asset_v1') > 0 then
    raise exception 'Medical Van Phase 9 wear call already exists unexpectedly.';
  end if;

  execute replace(v_def, v_needle, v_replacement);
end
$do$;

-- Align the legacy hard-coded standardizer with the authoritative DB mapping:
-- hydration belongs to Fatigue Control, not Health Protection.
do $do$
declare
  v_def text;
  v_before text;
begin
  select pg_get_functiondef('public.standardize_race_plan_bonus_preview_v1(jsonb)'::regprocedure)
  into v_def;
  v_before := v_def;

  v_def := regexp_replace(
    v_def,
    $regex$'medical_response_bonus_pct',[[:space:]]*'hydration_support_pct',[[:space:]]*'hydration_support_bonus_pct',[[:space:]]*'heat_hydration_support_pct'$regex$,
    $replacement$'medical_response_bonus_pct'$replacement$,
    'g'
  );

  v_def := replace(
    v_def,
    $needle$'travel_morale_bonus'$needle$,
    $replacement$'travel_morale_bonus',
        'hydration_support_pct',
        'hydration_support_bonus_pct',
        'heat_hydration_support_pct'$replacement$
  );

  if v_def = v_before then
    raise exception 'Legacy bonus standardizer hydration mapping was not patched.';
  end if;

  execute v_def;
end
$do$;

-- Apply Health Protection only at the lasting health-consequence handoff.
-- This intentionally does NOT alter crash/puncture/mechanical incident occurrence.
-- Minor incidents remain transient; moderate/major persistent consequences are
-- deterministically gated by the frozen preparation health multiplier.
do $do$
declare
  v_def text;
  v_original text;
  v_gate text;
begin
  select pg_get_functiondef('public.universal_race_stage_apply_health_candidates_v1(uuid)'::regprocedure)
  into v_def;
  v_original := v_def;

  if strpos(v_def, 'health_consequence_prevented_by_preparation') > 0 then
    raise exception 'Health-protection consequence gate already exists unexpectedly.';
  end if;

  v_def := replace(
    v_def,
    'v_nonblocking integer := 0;',
    'v_nonblocking integer := 0;' || chr(10) ||
    '  v_prevented_by_health_protection integer := 0;' || chr(10) ||
    '  v_health_incident_risk_multiplier numeric := 1;' || chr(10) ||
    '  v_health_consequence_roll numeric := 0;'
  );

  v_gate :=
    'select coalesce(min(modifier.health_incident_risk_multiplier), 1::numeric)' || chr(10) ||
    '    into v_health_incident_risk_multiplier' || chr(10) ||
    '    from public.race_engine_get_stage_rider_preparation_modifiers_v2(v_run.stage_id) modifier' || chr(10) ||
    '    where modifier.rider_id = v_rider_id' || chr(10) ||
    '      and modifier.team_id = v_team_id;' || chr(10) || chr(10) ||
    '    v_health_incident_risk_multiplier := greatest(0.78::numeric, least(1::numeric, coalesce(v_health_incident_risk_multiplier, 1::numeric)));' || chr(10) ||
    '    v_health_consequence_roll := public.race_engine_hash_roll_v1(' || chr(10) ||
    '      p_simulation_run_id::text || '':'' || v_rider_id::text || '':'' || v_incident_id || '':health_consequence''' || chr(10) ||
    '    );' || chr(10) || chr(10) ||
    '    if v_health_incident_risk_multiplier < 1::numeric' || chr(10) ||
    '       and v_health_consequence_roll >= v_health_incident_risk_multiplier then' || chr(10) ||
    '      v_results := v_results || jsonb_build_array(' || chr(10) ||
    '        jsonb_build_object(' || chr(10) ||
    '          ''status'', ''health_consequence_prevented_by_preparation'',' || chr(10) ||
    '          ''rider_id'', v_rider_id,' || chr(10) ||
    '          ''team_id'', v_team_id,' || chr(10) ||
    '          ''case_code'', v_case_code,' || chr(10) ||
    '          ''severity'', v_severity,' || chr(10) ||
    '          ''stage_id'', v_run.stage_id,' || chr(10) ||
    '          ''incident_id'', v_incident_id,' || chr(10) ||
    '          ''health_incident_risk_multiplier'', v_health_incident_risk_multiplier,' || chr(10) ||
    '          ''health_consequence_roll'', v_health_consequence_roll,' || chr(10) ||
    '          ''persistent_health_case_created'', false,' || chr(10) ||
    '          ''next_stage_selection_blocked'', false,' || chr(10) ||
    '          ''medical_health_protection_live'', true' || chr(10) ||
    '        )' || chr(10) ||
    '      );' || chr(10) ||
    '      v_prevented_by_health_protection := v_prevented_by_health_protection + 1;' || chr(10) ||
    '      continue;' || chr(10) ||
    '    end if;' || chr(10) || chr(10) ||
    '    v_result := public.health_create_rider_case_v1(';

  v_def := replace(
    v_def,
    'v_result := public.health_create_rider_case_v1(',
    v_gate
  );

  v_def := replace(
    v_def,
    $needle$'transient_minor_count', v_transient,$needle$,
    $replacement$'transient_minor_count', v_transient,
    'prevented_by_health_protection_count', v_prevented_by_health_protection,$replacement$
  );

  v_def := replace(
    v_def,
    $needle$'balance_version', 'phase11e_stage_race_attrition_balance_v1'$needle$,
    $replacement$'balance_version', 'phase11f_medical_health_protection_v1'$replacement$
  );

  if v_def = v_original
     or strpos(v_def, 'health_consequence_prevented_by_preparation') = 0
     or strpos(v_def, 'prevented_by_health_protection_count') = 0 then
    raise exception 'Health-protection consequence gate patch was incomplete.';
  end if;

  execute v_def;
end
$do$;