-- Replace temporary placeholder artwork for the 13 new helmet catalogue items.
-- This migration only updates helmet image metadata.

with helmet_images(item_key, image_url) as (
  values
    ('helmet_gira_aerolite_vx', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Gira%20AeroLite%20VX.png'),
    ('helmet_oaklea_basecap_elite', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Oaklea%20BaseCap%20Elite.png'),
    ('helmet_gira_chronocrown_core', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Gira%20ChronoCrown%20Core.png'),
    ('helmet_spacialized_chronoskin_relay', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Spacialized%20%20ChronoSkin%20Relay.png'),
    ('helmet_skott_cobbleguard_pro', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Skott%20CobbleGuard%20Pro.png'),
    ('helmet_pok_montecrest_air', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/POK%20%20MonteCrest%20Air.png'),
    ('helmet_kasq_pavehalo_ultra', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/KASQ%20PaveHalo%20CX.png'),
    ('helmet_kasq_roadguard_vector', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/KASQ%20RoadGuard%20Vector.png'),
    ('helmet_trex_skyline_halo_x', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Trex%20Skyline%20Halo%20X.png'),
    ('helmet_spacialized_sprintveil_core', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Spacialized%20%20SprintVeil%20Core.png'),
    ('helmet_pok_strada_flow_pro', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/POK%20Strada%20Flow%20Pro.png'),
    ('helmet_oaklea_tempus_stream', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Oaklea%20Tempus%20Stream.png'),
    ('helmet_trex_trailroad_shield', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Trex%20TrailRoad%20Shield.png')
)
update public.equipment_catalog ec
set metadata =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(ec.metadata, '{}'::jsonb)
          - 'temporary_image'
          - 'image_status'
          - 'image_source_item_key',
        '{image_url}',
        to_jsonb(hi.image_url),
        true
      ),
      '{image_source}',
      to_jsonb('supabase_storage_admin_staff_equipment'::text),
      true
    ),
    '{image_updated_at}',
    to_jsonb(now()),
    true
  )
from helmet_images hi
where ec.item_key = hi.item_key
  and ec.equipment_category = 'helmet';
