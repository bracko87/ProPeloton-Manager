-- National Team standard equipment / assets / supplies v1
-- All National Associations receive the same package.
-- There is no treasury, purchase flow, maintenance payment or competitive upgrade.

create table if not exists public.national_team_standard_equipment (
  id uuid primary key default gen_random_uuid(),
  equipment_category text not null,
  specialization text not null
    check (specialization in ('flat','mountain','time_trial')),
  catalog_item_id uuid not null references public.equipment_catalog(id) on delete restrict,
  model_count smallint not null default 1 check (model_count = 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(equipment_category,specialization)
);

create table if not exists public.national_team_standard_assets (
  asset_key text primary key,
  asset_level smallint not null check (asset_level > 0),
  quantity integer not null check (quantity > 0),
  usage_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.national_team_standard_supplies (
  supply_key text primary key,
  display_name text not null,
  quantity integer not null check (quantity > 0),
  replenishment_scope text not null default 'competition_window'
    check (replenishment_scope in ('competition_window','event','season')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists national_team_standard_equipment_set_updated_at
  on public.national_team_standard_equipment;
create trigger national_team_standard_equipment_set_updated_at
before update on public.national_team_standard_equipment
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_team_standard_assets_set_updated_at
  on public.national_team_standard_assets;
create trigger national_team_standard_assets_set_updated_at
before update on public.national_team_standard_assets
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_team_standard_supplies_set_updated_at
  on public.national_team_standard_supplies;
create trigger national_team_standard_supplies_set_updated_at
before update on public.national_team_standard_supplies
for each row execute function private.ppm_set_updated_at_v1();

-- The chosen models are intentionally strong but not the absolute best items
-- in the catalogue. Every nation receives exactly the same models.
with selected(equipment_category,specialization,item_key) as (
  values
    ('frame','flat','pinarella_regale_corsa_frame'),
    ('frame','mountain','enva_summitflow_e2_frame'),
    ('frame','time_trial','bmx_corp_chrono_t1_frame'),

    ('wheelset','flat','wheelset_9176080c_velocity_deep_64'),
    ('wheelset','mountain','wheelset_f45b885d_summit_lite_30'),
    ('wheelset','time_trial','wheelset_c07d8dfb_aero_storm_75'),

    ('helmet','flat','helmet_752c890c_velox_blade_pro'),
    ('helmet','mountain','helmet_c0e9ded7_montecrest_pro'),
    ('helmet','time_trial','helmet_gira_chronocrown_core'),

    ('shoes','flat','shoes_06942d66_ventosprint_pro'),
    ('shoes','mountain','shoes_c84dcf6d_summitlite_carbon'),
    ('shoes','time_trial','shoes_340a88a8_chronolock_zero'),

    ('groupset','flat','groupset_ced0b7fb_velocity_sync_pro'),
    ('groupset','mountain','groupset_db7fb57f_summitshift_pro'),
    ('groupset','time_trial','groupset_2eb9b259_chronosync_xr'),

    ('tires','flat','tires_91168035_strada_blitz'),
    ('tires','mountain','tires_91168035_peakline_mx'),
    ('tires','time_trial','tires_db609feb_aerovail_tt')
)
insert into public.national_team_standard_equipment(
  equipment_category,specialization,catalog_item_id,model_count,is_active
)
select
  s.equipment_category,
  s.specialization,
  e.id,
  1,
  true
from selected s
join public.equipment_catalog e
  on e.item_key=s.item_key
 and e.is_active=true
on conflict(equipment_category,specialization) do update
set catalog_item_id=excluded.catalog_item_id,
    model_count=1,
    is_active=true,
    updated_at=now();

-- Race/support cars: use the maximum catalogue quantity and highest available
-- level. This is a global standard, not an Association-owned purchase.
insert into public.national_team_standard_assets(
  asset_key,asset_level,quantity,usage_note,is_active
)
select
  c.asset_key,
  max(c.asset_level)::smallint,
  max(c.max_total_quantity)::integer,
  'System-provided National Team race/support cars; no purchase or maintenance cost.',
  true
from public.infrastructure_asset_config c
where c.asset_key='team_car'
group by c.asset_key
on conflict(asset_key) do update
set asset_level=excluded.asset_level,
    quantity=excluded.quantity,
    usage_note=excluded.usage_note,
    is_active=true,
    updated_at=now();

insert into public.national_team_standard_supplies(
  supply_key,display_name,quantity,replenishment_scope,is_active
)
values
  ('energy_gels','Energy Gels',250,'competition_window',true),
  ('bidons_water_bottles','Water / Bidons',250,'competition_window',true),
  ('nutrition_packs','Nutrition Packs',250,'competition_window',true),
  ('race_jersey_complete','National Team Race Jerseys',50,'competition_window',true),
  ('rain_jackets','National Team Rain Jackets',50,'competition_window',true)
on conflict(supply_key) do update
set display_name=excluded.display_name,
    quantity=excluded.quantity,
    replenishment_scope=excluded.replenishment_scope,
    is_active=true,
    updated_at=now();

create or replace function public.get_national_team_standard_package_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

alter table public.national_team_standard_equipment enable row level security;
alter table public.national_team_standard_assets enable row level security;
alter table public.national_team_standard_supplies enable row level security;

revoke all on public.national_team_standard_equipment from anon,authenticated;
revoke all on public.national_team_standard_assets from anon,authenticated;
revoke all on public.national_team_standard_supplies from anon,authenticated;

revoke all on function public.get_national_team_standard_package_v1()
from public,anon,authenticated;
grant execute on function public.get_national_team_standard_package_v1()
to authenticated,service_role;
