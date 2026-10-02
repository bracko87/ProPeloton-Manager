
-- Normalize legacy National Team Stage Plan data created before editable equipment
-- and role/pacing support was introduced. Valid coach selections are preserved.

with plans as (
  select
    sp.id as stage_plan_id,
    rp.club_id,
    coalesce(r.metadata->>'race_type', rs.metadata->>'race_type', '') as national_race_type
  from public.race_stage_plans sp
  join public.race_preparations rp on rp.id = sp.race_preparation_id
  join public.races r on r.id = sp.race_id
  left join public.race_stages rs on rs.id = sp.stage_id
  where coalesce(r.metadata->>'nations_competition','false') = 'true'
),
defaults as (
  select
    p.stage_plan_id,
    p.club_id,
    p.national_race_type,
    (
      select ep.id
      from public.club_equipment_setup_presets ep
      where ep.club_id = p.club_id
        and ep.frame_catalog_item_id is not null
        and ep.wheelset_catalog_item_id is not null
        and ep.tires_catalog_item_id is not null
        and ep.groupset_catalog_item_id is not null
        and ep.helmet_catalog_item_id is not null
        and ep.shoes_catalog_item_id is not null
      order by ep.setup_slot, ep.id
      limit 1
    ) as default_preset_id
  from plans p
),
normalized_equipment as (
  select
    d.stage_plan_id,
    d.default_preset_id,
    coalesce(
      jsonb_object_agg(
        kv.key,
        to_jsonb(
          case
            when exists (
              select 1
              from public.club_equipment_setup_presets ep
              where ep.id = nullif(kv.value #>> '{}','')::uuid
                and ep.club_id = d.club_id
                and ep.frame_catalog_item_id is not null
                and ep.wheelset_catalog_item_id is not null
                and ep.tires_catalog_item_id is not null
                and ep.groupset_catalog_item_id is not null
                and ep.helmet_catalog_item_id is not null
                and ep.shoes_catalog_item_id is not null
            )
            then kv.value #>> '{}'
            else d.default_preset_id::text
          end
        )
      ),
      '{}'::jsonb
    ) as equipment_json
  from defaults d
  join public.race_stage_plans sp on sp.id = d.stage_plan_id
  left join lateral jsonb_each(coalesce(sp.rider_equipment_json,'{}'::jsonb)) kv on true
  where d.default_preset_id is not null
  group by d.stage_plan_id, d.default_preset_id
)
update public.race_stage_plans sp
set rider_equipment_json = ne.equipment_json,
    updated_at = now()
from normalized_equipment ne
where sp.id = ne.stage_plan_id
  and ne.equipment_json <> '{}'::jsonb;

with plans as (
  select
    sp.id as stage_plan_id,
    rp.club_id,
    coalesce(r.metadata->>'race_type', rs.metadata->>'race_type', '') as national_race_type
  from public.race_stage_plans sp
  join public.race_preparations rp on rp.id = sp.race_preparation_id
  join public.races r on r.id = sp.race_id
  left join public.race_stages rs on rs.id = sp.stage_id
  where coalesce(r.metadata->>'nations_competition','false') = 'true'
),
defaults as (
  select
    p.*,
    (
      select ep.id
      from public.club_equipment_setup_presets ep
      where ep.club_id = p.club_id
        and ep.frame_catalog_item_id is not null
        and ep.wheelset_catalog_item_id is not null
        and ep.tires_catalog_item_id is not null
        and ep.groupset_catalog_item_id is not null
        and ep.helmet_catalog_item_id is not null
        and ep.shoes_catalog_item_id is not null
      order by ep.setup_slot, ep.id
      limit 1
    ) as default_preset_id
  from plans p
)
update public.race_stage_plan_riders spr
set equipment_setup_id = d.default_preset_id,
    equipment_bonus_snapshot_json = public.equipment_calculate_catalog_setup_bonus_preview(
      ep.frame_catalog_item_id,
      ep.wheelset_catalog_item_id,
      ep.tires_catalog_item_id,
      ep.groupset_catalog_item_id,
      ep.helmet_catalog_item_id,
      ep.shoes_catalog_item_id
    ),
    final_bonus_snapshot_json = public.equipment_calculate_catalog_setup_bonus_preview(
      ep.frame_catalog_item_id,
      ep.wheelset_catalog_item_id,
      ep.tires_catalog_item_id,
      ep.groupset_catalog_item_id,
      ep.helmet_catalog_item_id,
      ep.shoes_catalog_item_id
    ),
    metadata = coalesce(spr.metadata,'{}'::jsonb) || jsonb_build_object(
      'national_team_equipment_default_repaired', true
    ),
    updated_at = now()
from defaults d
join public.club_equipment_setup_presets ep on ep.id = d.default_preset_id
where spr.race_stage_plan_id = d.stage_plan_id
  and d.default_preset_id is not null
  and not exists (
    select 1
    from public.club_equipment_setup_presets current_ep
    where current_ep.id = spr.equipment_setup_id
      and current_ep.club_id = d.club_id
      and current_ep.frame_catalog_item_id is not null
      and current_ep.wheelset_catalog_item_id is not null
      and current_ep.tires_catalog_item_id is not null
      and current_ep.groupset_catalog_item_id is not null
      and current_ep.helmet_catalog_item_id is not null
      and current_ep.shoes_catalog_item_id is not null
  );

with plans as (
  select
    sp.id,
    coalesce(r.metadata->>'race_type', rs.metadata->>'race_type', '') as national_race_type
  from public.race_stage_plans sp
  join public.races r on r.id = sp.race_id
  left join public.race_stages rs on rs.id = sp.stage_id
  where coalesce(r.metadata->>'nations_competition','false') = 'true'
)
update public.race_stage_plans sp
set team_strategy = case
      when p.national_race_type = 'team_time_trial'
        and coalesce(sp.team_strategy,'') not in (
          'tt_balanced_pace','tt_fast_start','tt_negative_split','tt_all_out'
        )
        then 'tt_balanced_pace'
      when p.national_race_type <> 'team_time_trial'
        and coalesce(sp.team_strategy,'') not in (
          'balanced','aggressive','sprint_control','breakaway','gc_protection'
        )
        then 'balanced'
      else sp.team_strategy
    end,
    team_tactic_json = case
      when p.national_race_type = 'team_time_trial'
        and coalesce(sp.team_strategy,'') not in (
          'tt_balanced_pace','tt_fast_start','tt_negative_split','tt_all_out'
        )
        then coalesce(sp.team_tactic_json,'{}'::jsonb)
          || jsonb_build_object('plan','tt_balanced_pace','national_team',true)
      else coalesce(sp.team_tactic_json,'{}'::jsonb)
    end,
    rider_roles_json = coalesce((
      select jsonb_object_agg(
        roles.key,
        to_jsonb(
          case
            when roles.value = 'domestique' then 'helper_domestique'
            when roles.value = 'leader' then 'team_leader_gc'
            when roles.value in (
              'team_time_trial_rider','team_leader_gc','sprinter','lead_out_rider',
              'sprint_train_rider','climber','mountain_domestique','helper_domestique',
              'breakaway_rider','breakaway_chaser','rouleur','protected_rider','free_role'
            ) then roles.value
            when p.national_race_type = 'team_time_trial' then 'team_time_trial_rider'
            else 'free_role'
          end
        )
      )
      from jsonb_each_text(coalesce(sp.rider_roles_json,'{}'::jsonb)) roles
    ), '{}'::jsonb),
    updated_at = now()
from plans p
where sp.id = p.id;

with plans as (
  select
    sp.id,
    coalesce(r.metadata->>'race_type', rs.metadata->>'race_type', '') as national_race_type
  from public.race_stage_plans sp
  join public.races r on r.id = sp.race_id
  left join public.race_stages rs on rs.id = sp.stage_id
  where coalesce(r.metadata->>'nations_competition','false') = 'true'
)
update public.race_stage_plan_riders spr
set stage_role = case
      -- race_stage_plan_riders still uses the legacy engine-role vocabulary.
      -- Rich National Team roles stay in race_stage_plans.rider_roles_json.
      when spr.stage_role in (
        'team_leader','protected_rider','sprinter','climber','domestique',
        'leadout','breakaway','road_captain','free_role'
      ) then spr.stage_role
      else 'free_role'
    end,
    updated_at = now()
from plans p
where spr.race_stage_plan_id = p.id;
