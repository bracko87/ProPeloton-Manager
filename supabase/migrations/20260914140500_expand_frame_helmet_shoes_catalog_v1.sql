-- Expand the durable equipment market with 35 additional products.
-- Production rollout: 12 frames, 13 helmets, 10 shoes.
-- Existing Race Preparations and inventory are intentionally untouched.
-- Temporary role-matched catalogue images are reused until final artwork is supplied.

with new_items(
  item_key, display_name, equipment_category, brand_name,
  tier, quality_score, durability_score, base_price_cash,
  condition_loss_per_race_day, maintenance_cost_per_condition_point,
  maintenance_points_per_game_day, resale_pct,
  terrain_role, effects_json, image_source_item_key, sponsor_slot
) as (
  values
    ('trex_altura_base_frame','Altura Base','frame','Trex',2,67,72,1950,2.25,33,37.00,25.00,'climbing','{"flat_bonus_pct":-1,"hilly_bonus_pct":1,"sprint_bonus_pct":-1,"mountain_bonus_pct":2}','cannondalea_climblite_c2_frame',null),
    ('cannondalea_tempoline_entry_frame','TempoLine Entry','frame','Cannondalea',1,57,78,1150,2.00,29,40.00,22.00,'all_round','{"flat_bonus_pct":1,"hilly_bonus_pct":1,"time_trial_bonus_pct":-1}','cannondalea_rapidroad_c1_frame',null),
    ('bmx_corp_velocron_tt_420_frame','Velocron TT-420','frame','BMX Corp',3,83,66,5400,2.75,44,31.00,30.00,'time_trial','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"mountain_bonus_pct":-2,"time_trial_bonus_pct":4}','bmx_corp_chrono_t1_frame',null),
    ('pinarella_cronovento_s_frame','CronoVento S','frame','Pinarella',3,87,64,6000,2.92,49,30.00,32.00,'time_trial','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"mountain_bonus_pct":-2,"time_trial_bonus_pct":4}','bmx_corp_chrono_t1_frame',null),
    ('spacialized_primeroad_alloy_frame','PrimeRoad Alloy','frame','Spacialized',2,71,74,2750,2.15,35,36.00,26.00,'all_round','{"flat_bonus_pct":2,"hilly_bonus_pct":1,"time_trial_bonus_pct":-1}','trex_rapidrace_t1_frame',null),
    ('enva_meridian_flux_frame','Meridian Flux','frame','ENVA',2,69,72,2250,2.28,34,35.00,26.00,'aero_flat','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"sprint_bonus_pct":1,"mountain_bonus_pct":-1}','bmx_corp_aeroline_a1_frame',null),
    ('pinarella_regale_corsa_frame','Regale Corsa','frame','Pinarella',3,84,68,5650,2.75,46,31.00,31.00,'aero_flat','{"flat_bonus_pct":4,"cobble_bonus_pct":-1,"sprint_bonus_pct":2,"mountain_bonus_pct":-2}','cervella_aerostream_s1_frame',null),
    ('cervella_veloce_pulse_frame','Veloce Pulse','frame','Cervella',2,73,70,3100,2.35,37,34.00,28.00,'climbing','{"flat_bonus_pct":-1,"hilly_bonus_pct":1,"sprint_bonus_pct":-1,"mountain_bonus_pct":2}','cannondalea_climblite_c2_frame',null),
    ('skott_vento_edge_frame','Vento Edge','frame','Skott',3,86,67,5900,2.85,48,30.00,32.00,'aero_flat','{"flat_bonus_pct":4,"cobble_bonus_pct":-1,"sprint_bonus_pct":2,"mountain_bonus_pct":-2}','cervella_aerostream_s1_frame',null),
    ('cannondalea_pavelo_tour_frame','Pavelo Tour','frame','Cannondalea',2,66,84,1850,1.85,30,41.00,25.00,'endurance_cobble','{"cobble_bonus_pct":2,"sprint_bonus_pct":-1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":1}','skott_endurance_line_s3_frame',null),
    ('trex_domanis_shield_frame','Domanis Shield','frame','Trex',1,57,85,1050,1.80,28,42.00,22.00,'endurance_cobble','{"cobble_bonus_pct":1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":1}','trex_comfortroad_t3_frame',null),
    ('enva_terracontrol_pro_frame','TerraControl Pro','frame','ENVA',2,73,73,3200,2.35,37,35.00,27.00,'all_round','{"flat_bonus_pct":2,"hilly_bonus_pct":1,"time_trial_bonus_pct":-1}','trex_rapidrace_t1_frame',null),

    ('helmet_gira_chronocrown_core','ChronoCrown Core','helmet','Gira',3,84,64,400,1.34,22,28.00,25.00,'time_trial','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"mountain_bonus_pct":-2,"time_trial_bonus_pct":4}','helmet_58aed363_chrono_crown_vr',1),
    ('helmet_oaklea_tempus_stream','Tempus Stream','helmet','Oaklea',3,86,63,430,1.40,24,27.00,26.00,'time_trial','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"mountain_bonus_pct":-2,"time_trial_bonus_pct":4}','helmet_58aed363_chrono_crown_vr',3),
    ('helmet_spacialized_chronoskin_relay','ChronoSkin Relay','helmet','Spacialized',3,87,62,450,1.44,25,26.00,27.00,'time_trial','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"mountain_bonus_pct":-2,"time_trial_bonus_pct":4}','helmet_58aed363_chrono_crown_vr',6),
    ('helmet_pok_strada_flow_pro','Strada Flow Pro','helmet','POK',2,72,70,220,1.12,15,35.00,21.00,'aero_flat','{"flat_bonus_pct":3,"cobble_bonus_pct":-1,"sprint_bonus_pct":1,"mountain_bonus_pct":-1}','helmet_6d7f38d5_ventora_sprint',4),
    ('helmet_kasq_roadguard_vector','RoadGuard Vector','helmet','KASQ',1,58,80,105,0.88,9,41.00,16.00,'all_round','{"flat_bonus_pct":1,"hilly_bonus_pct":1,"time_trial_bonus_pct":-1}','helmet_b0ca66a4_cityrace_comp',2),
    ('helmet_oaklea_basecap_elite','BaseCap Elite','helmet','Oaklea',1,57,82,95,0.84,9,42.00,15.00,'all_round','{"flat_bonus_pct":1,"hilly_bonus_pct":1,"time_trial_bonus_pct":-1}','helmet_b0ca66a4_cityrace_comp',3),
    ('helmet_trex_trailroad_shield','TrailRoad Shield','helmet','Trex',2,67,89,160,0.75,12,45.00,20.00,'endurance_cobble','{"cobble_bonus_pct":2,"sprint_bonus_pct":-1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":2}','helmet_b0ca66a4_cobbleguard_xl',7),
    ('helmet_skott_cobbleguard_pro','CobbleGuard Pro','helmet','Skott',2,69,87,180,0.82,13,43.00,20.00,'endurance_cobble','{"cobble_bonus_pct":2,"sprint_bonus_pct":-1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":2}','helmet_b0ca66a4_cobbleguard_xl',5),
    ('helmet_kasq_pavehalo_ultra','PavéHalo Ultra','helmet','KASQ',2,71,86,200,0.88,14,42.00,21.00,'endurance_cobble','{"cobble_bonus_pct":2,"sprint_bonus_pct":-1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":2}','helmet_b0ca66a4_cobbleguard_xl',2),
    ('helmet_pok_montecrest_air','MonteCrest Air','helmet','POK',2,71,71,205,1.10,14,35.00,21.00,'climbing','{"flat_bonus_pct":-1,"hilly_bonus_pct":1,"sprint_bonus_pct":-1,"mountain_bonus_pct":2}','helmet_58aed363_summit_shell_mx',4),
    ('helmet_trex_skyline_halo_x','Skyline Halo X','helmet','Trex',3,82,65,350,1.32,21,29.00,26.00,'climbing','{"flat_bonus_pct":-1,"hilly_bonus_pct":2,"sprint_bonus_pct":-2,"mountain_bonus_pct":4}','helmet_c0e9ded7_montecrest_pro',7),
    ('helmet_spacialized_sprintveil_core','SprintVeil Core','helmet','Spacialized',2,72,69,230,1.18,15,34.00,22.00,'aero_flat','{"flat_bonus_pct":3,"cobble_bonus_pct":-1,"sprint_bonus_pct":1,"mountain_bonus_pct":-1}','helmet_6d7f38d5_ventora_sprint',6),
    ('helmet_gira_aerolite_vx','AeroLite VX','helmet','Gira',3,84,66,390,1.35,23,28.00,26.00,'aero_flat','{"flat_bonus_pct":4,"cobble_bonus_pct":-1,"sprint_bonus_pct":2,"mountain_bonus_pct":-2}','helmet_752c890c_velox_blade_pro',1),

    ('shoes_dtm_velolace_core','VeloLace Core','shoes','DTM',2,69,70,200,1.15,13,35.00,20.00,'aero_flat','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"sprint_bonus_pct":2,"mountain_bonus_pct":-1}','shoes_340a88a8_velolace_sprint',1),
    ('shoes_northway_sprintmesh_pro','SprintMesh Pro','shoes','Northway',3,85,63,470,1.42,24,28.00,28.00,'aero_flat','{"flat_bonus_pct":4,"cobble_bonus_pct":-1,"sprint_bonus_pct":2,"mountain_bonus_pct":-2}','shoes_41bb9dda_aerolatch_vx',3),
    ('shoes_shemano_ascenda_core','Ascenda Core','shoes','Shemano',2,70,66,220,1.22,14,34.00,21.00,'climbing','{"flat_bonus_pct":-1,"hilly_bonus_pct":2,"sprint_bonus_pct":-1,"mountain_bonus_pct":3}','shoes_06942d66_ascenda_knit',4),
    ('shoes_dtm_alpinestep_pro','AlpineStep Pro','shoes','DTM',3,83,63,440,1.38,23,29.00,27.00,'climbing','{"flat_bonus_pct":-1,"hilly_bonus_pct":2,"sprint_bonus_pct":-2,"mountain_bonus_pct":4}','shoes_41bb9dda_climbweave_pro',1),
    ('shoes_spacialized_chronospire_core','ChronoSpire Core','shoes','Spacialized',3,86,61,500,1.47,25,27.00,28.00,'time_trial','{"flat_bonus_pct":2,"cobble_bonus_pct":-1,"mountain_bonus_pct":-2,"time_trial_bonus_pct":4}','shoes_340a88a8_chronolock_zero',6),
    ('shoes_northway_tempoglide_comp','TempoGlide Comp','shoes','Northway',1,57,80,100,0.90,8,43.00,15.00,'all_round','{"flat_bonus_pct":1,"hilly_bonus_pct":1,"time_trial_bonus_pct":-1}','shoes_f0935f89_baselock_road',3),
    ('shoes_sida_stradapulse_pro','StradaPulse Pro','shoes','Sida',2,73,75,250,1.12,15,37.00,22.00,'all_round','{"flat_bonus_pct":2,"hilly_bonus_pct":2,"time_trial_bonus_pct":-1}','shoes_c84dcf6d_stradapulse',5),
    ('shoes_fiziq_roadfit_elite','RoadFit Elite','shoes','Fiziq',2,69,87,195,0.85,13,45.00,20.00,'endurance_cobble','{"cobble_bonus_pct":2,"sprint_bonus_pct":-1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":1}','shoes_41bb9dda_cobblegrip_cx',2),
    ('shoes_northway_tourstride_flex','TourStride Flex','shoes','Northway',1,58,83,105,0.84,9,43.00,16.00,'endurance_cobble','{"cobble_bonus_pct":1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":1}','shoes_09980a5f_tourstride_base',3),
    ('shoes_sida_paveride_pro','PavéRide Pro','shoes','Sida',2,70,86,210,0.90,14,44.00,21.00,'endurance_cobble','{"cobble_bonus_pct":2,"sprint_bonus_pct":-1,"time_trial_bonus_pct":-1,"fatigue_reduction_pct":1}','shoes_41bb9dda_cobblegrip_cx',5)
),
resolved as (
  select
    n.*,
    sc.id as brand_company_id,
    src.metadata->>'image_url' as placeholder_image_url
  from new_items n
  join public.sponsor_companies sc
    on sc.name = n.brand_name
   and sc.sponsor_kind = 'technical'
   and sc.is_active = true
  join public.equipment_catalog src
    on src.item_key = n.image_source_item_key
   and src.is_active = true
)
insert into public.equipment_catalog (
  item_key, display_name, equipment_kind, equipment_category,
  brand_company_id, tier, quality_score, durability_score,
  base_price_cash, condition_loss_per_race_day,
  maintenance_cost_per_condition_point, maintenance_points_per_game_day,
  resale_pct, effects, metadata, is_active
)
select
  r.item_key,
  r.display_name,
  'durable',
  r.equipment_category,
  r.brand_company_id,
  r.tier,
  r.quality_score,
  r.durability_score,
  r.base_price_cash,
  r.condition_loss_per_race_day,
  r.maintenance_cost_per_condition_point,
  r.maintenance_points_per_game_day,
  r.resale_pct,
  r.effects_json::jsonb,
  jsonb_build_object(
    'image_url', r.placeholder_image_url,
    'image_source', 'temporary_existing_catalog_placeholder',
    'image_status', 'temporary_placeholder',
    'temporary_image', true,
    'image_source_item_key', r.image_source_item_key,
    'bonus_model', 'race_type_bonus_model_v4',
    'market_role', r.terrain_role,
    'terrain_role', r.terrain_role,
    'quality_label', case r.tier when 1 then 'basic' when 2 then 'good' else 'super' end,
    'seed_source', 'equipment_catalog_expansion_20260914_v1',
    'catalog_extension_version', 'equipment_catalog_expansion_20260914_v1',
    'fake_model_name', true,
    'negative_bonus_model', 'specialist_tradeoffs_v2',
    'uses_current_fake_sponsor_name', true
  )
  || case
       when r.equipment_category = 'helmet'
         then jsonb_build_object('item_unit','race_helmet','helmet_sponsor_slot',r.sponsor_slot)
       when r.equipment_category = 'shoes'
         then jsonb_build_object('item_unit','cycling_shoes_pair','shoes_sponsor_slot',r.sponsor_slot)
       else '{}'::jsonb
     end,
  true
from resolved r
on conflict (item_key) do nothing;
