
create or replace function public.get_race_plan_bonus_preview_v1(
  p_club_id uuid,
  p_staff_ids uuid[] default '{}'::uuid[],
  p_asset_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff_preview jsonb := '[]'::jsonb;
  v_asset_preview jsonb := '[]'::jsonb;
  v_policy_preview jsonb := '[]'::jsonb;
  v_medical jsonb := '[]'::jsonb;
  v_policy record;
begin
  if p_club_id is null then
    raise exception 'club_id is required';
  end if;

  if not public.can_read_club_v1(p_club_id) then
    raise exception 'Not allowed to read this club';
  end if;

  -- Use the dated medical-staff resolver because it returns the actual
  -- primary medical staff id. The legacy undated overload returns NULL
  -- for staff_id, which made selected Team Doctor bonuses disappear when
  -- this preview filtered by p_staff_ids.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_type', 'staff',
        'source_key', 'medical_staff',
        'source_label', 'Medical Staff: ' || staff_name,
        'effects', jsonb_build_array(
          jsonb_build_object(
            'effect_key', 'injury_illness_risk',
            'label', 'Injury / illness risk',
            'value', '-' || round((1 - risk_multiplier) * 100, 1)::text || '%'
          ),
          jsonb_build_object(
            'effect_key', 'recovery_duration',
            'label', 'Recovery duration',
            'value', '-' || round((1 - recovery_duration_multiplier) * 100, 1)::text || '%'
          ),
          jsonb_build_object(
            'effect_key', 'daily_recovery_bonus',
            'label', 'Daily recovery bonus',
            'value', '+' || daily_recovery_bonus::text
          ),
          jsonb_build_object(
            'effect_key', 'fatigue_floor_reduction',
            'label', 'Fatigue floor reduction',
            'value', '-' || fatigue_floor_reduction::text
          )
        )
      )
    ),
    '[]'::jsonb
  )
  into v_medical
  from public.get_team_doctor_effects(
    p_club_id,
    public.get_current_game_date_date()
  )
  where staff_id = any (coalesce(p_staff_ids, '{}'::uuid[]));

  v_staff_preview := v_staff_preview || v_medical;

  -- Selected staff with exact passive race formulas.
  -- Mechanic is connected here; roles without a defined passive race formula
  -- remain explicitly advisory/automation only instead of receiving invented points.
  select v_staff_preview || coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_type', 'staff',
        'source_key', cs.role_type,
        'source_label',
          case cs.role_type
            when 'sport_director' then 'Sport Director: ' || cs.staff_name
            when 'mechanic' then 'Mechanic: ' || cs.staff_name
            when 'physio' then 'Physio: ' || cs.staff_name
            when 'team_doctor' then 'Team Doctor: ' || cs.staff_name
            else cs.role_type || ': ' || cs.staff_name
          end,
        'effects',
          case
            when cs.role_type in ('team_doctor', 'physio') then '[]'::jsonb
            when cs.role_type = 'mechanic' then jsonb_build_array(
              jsonb_build_object(
                'effect_key', 'setup_quality_bonus',
                'label', 'Setup quality',
                'value', '+' || coalesce((public.equipment_get_mechanic_effects_v1(p_club_id, array[cs.id])->>'setup_quality_bonus'), '0')
              ),
              jsonb_build_object(
                'effect_key', 'mechanical_risk_reduction',
                'label', 'Mechanical risk',
                'value', '-' || coalesce((public.equipment_get_mechanic_effects_v1(p_club_id, array[cs.id])->>'mechanical_risk_reduction_pct'), '0') || '%'
              ),
              jsonb_build_object(
                'effect_key', 'equipment_condition_loss',
                'label', 'Equipment condition loss',
                'value', '-' || coalesce((public.equipment_get_mechanic_effects_v1(p_club_id, array[cs.id])->>'condition_loss_reduction_pct'), '0') || '%'
              ),
              jsonb_build_object(
                'effect_key', 'maintenance_support',
                'label', 'Maintenance support',
                'value',
                  '+' || coalesce((public.equipment_get_mechanic_effects_v1(p_club_id, array[cs.id])->>'maintenance_speed_bonus_pct'), '0') || '% speed / -'
                  || coalesce((public.equipment_get_mechanic_effects_v1(p_club_id, array[cs.id])->>'maintenance_cost_discount_pct'), '0') || '% cost'
              )
            )
            else jsonb_build_array(
              jsonb_build_object(
                'effect_key', 'not_connected',
                'label', 'Race engine effect',
                'value', 'Not connected yet'
              )
            )
          end
      )
    ) filter (
      where cs.role_type not in ('team_doctor', 'physio')
    ),
    '[]'::jsonb
  )
  into v_staff_preview
  from public.club_staff cs
  where cs.club_id = p_club_id
    and cs.id = any (coalesce(p_staff_ids, '{}'::uuid[]));

  -- Asset exact effect rows from mapping table.
  with selected_assets as (
    select
      elem->>'asset_key' as asset_key,
      coalesce(nullif(elem->>'asset_slot_key', ''), elem->>'asset_key') as asset_slot_key,
      nullif(elem->>'asset_id', '')::uuid as asset_id
    from jsonb_array_elements(coalesce(p_asset_assignments, '[]'::jsonb)) elem
  ),
  asset_rows as (
    select
      sa.asset_key,
      sa.asset_slot_key,
      sa.asset_id,
      coalesce(
        tc.display_name,
        tb.display_name,
        ev.display_name,
        mw.display_name,
        mv.display_name
      ) as display_name,
      coalesce(
        tc.asset_level::int,
        tb.asset_level::int,
        ev.asset_level::int,
        mw.asset_level::int,
        mv.asset_level::int
      ) as asset_level,
      coalesce(
        tc.condition_percent,
        tb.condition_percent,
        ev.condition_percent,
        mw.condition_percent,
        mv.condition_percent,
        100
      ) as condition_percent
    from selected_assets sa
    left join public.club_team_cars tc
      on sa.asset_key = 'team_car'
     and tc.id = sa.asset_id
     and tc.club_id = p_club_id
    left join public.club_team_buses tb
      on sa.asset_key = 'team_bus'
     and tb.id = sa.asset_id
     and tb.club_id = p_club_id
    left join public.club_equipment_vans ev
      on sa.asset_key = 'equipment_van'
     and ev.id = sa.asset_id
     and ev.club_id = p_club_id
    left join public.club_mobile_workshops mw
      on sa.asset_key = 'mobile_workshop'
     and mw.id = sa.asset_id
     and mw.club_id = p_club_id
    left join public.club_medical_vans mv
      on sa.asset_key = 'medical_van'
     and mv.id = sa.asset_id
     and mv.club_id = p_club_id
  ),
  grouped_assets as (
    select
      ar.asset_key,
      ar.asset_slot_key,
      ar.display_name,
      ar.asset_level,
      jsonb_agg(
        jsonb_build_object(
          'effect_key', r.effect_key,
          'label', r.effect_label,
          'value',
            case
              when r.effect_value is null then ''
              when public.race_plan_asset_effective_value_v1(ar.asset_key, ar.condition_percent, r.effect_value) > 0 and r.display_prefix = ''
                then '+' || public.race_plan_asset_effective_value_v1(ar.asset_key, ar.condition_percent, r.effect_value)::text || r.display_suffix
              else r.display_prefix || public.race_plan_asset_effective_value_v1(ar.asset_key, ar.condition_percent, r.effect_value)::text || r.display_suffix
            end
        )
        order by r.sort_order
      ) as effects
    from asset_rows ar
    join public.race_plan_effect_rules r
      on r.source_type = 'asset'
     and r.source_key = ar.asset_key
     and r.source_level = ar.asset_level
     and r.is_active = true
    where ar.display_name is not null
    group by
      ar.asset_key,
      ar.asset_slot_key,
      ar.display_name,
      ar.asset_level,
      ar.condition_percent
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_type', 'asset',
        'source_key', asset_key,
        'source_slot_key', asset_slot_key,
        'source_label',
          case asset_slot_key
            when 'team_bus' then 'Team Bus: '
            when 'equipment_van' then 'Equipment Van: '
            when 'mobile_workshop' then 'Mobile Workshop: '
            when 'medical_van' then 'Medical Van: '
            when 'team_car_1' then 'Team Car 1: '
            when 'team_car_2' then 'Team Car 2: '
            when 'team_car_3' then 'Team Car 3: '
            else ''
          end || display_name,
        'effects', effects
      )
      order by asset_slot_key
    ),
    '[]'::jsonb
  )
  into v_asset_preview
  from grouped_assets;

  select *
  into v_policy
  from public.get_club_team_policy_quote_effects(p_club_id)
  limit 1;

  if v_policy.club_id is not null then
    v_policy_preview := jsonb_build_array(
      jsonb_build_object(
        'source_type', 'team_policy',
        'source_key', 'team_policies',
        'source_label', 'Team Policies & Operations',
        'effects',
          (
            select coalesce(jsonb_agg(effect), '[]'::jsonb)
            from (
              select jsonb_build_object(
                'effect_key', 'travel_morale_bonus',
                'label', 'Travel morale bonus',
                'value', '+' || v_policy.travel_morale_bonus::text
              ) as effect
              where coalesce(v_policy.travel_morale_bonus, 0) <> 0

              union all

              select jsonb_build_object(
                'effect_key', 'recovery_bonus',
                'label', 'Recovery bonus',
                'value', '+' || v_policy.recovery_bonus::text
              )
              where coalesce(v_policy.recovery_bonus, 0) <> 0

              union all

              select jsonb_build_object(
                'effect_key', 'logistics_bonus',
                'label', 'Logistics bonus',
                'value', '+' || v_policy.logistics_bonus::text
              )
              where coalesce(v_policy.logistics_bonus, 0) <> 0
            ) x
          )
      )
    );
  end if;

  return jsonb_build_object(
    'staff', v_staff_preview,
    'assets', v_asset_preview,
    'policies', v_policy_preview
  );
end;
$function$;
