-- Restore National Team fixed-package configuration and Nations runtime scheduling.
-- Only the catalog rows referenced by the fixed National Team package are seeded here.

insert into public.country_market_groups
select *
from jsonb_populate_recordset(
  null::public.country_market_groups,
  $groups$
[
  {
    "code": "alpine_italy",
    "name": "Alpine Europe + Italy",
    "created_at": "2026-03-24T19:00:32.249912+00:00",
    "sort_order": 3,
    "updated_at": "2026-03-24T19:00:32.249912+00:00",
    "macro_region": "europe"
  },
  {
    "code": "france_benelux",
    "name": "France & Benelux",
    "created_at": "2026-03-24T19:00:32.249912+00:00",
    "sort_order": 2,
    "updated_at": "2026-03-24T19:00:32.249912+00:00",
    "macro_region": "europe"
  },
  {
    "code": "japan_korea",
    "name": "Japan + Korea",
    "created_at": "2026-03-24T19:00:32.249912+00:00",
    "sort_order": 21,
    "updated_at": "2026-03-24T19:00:32.249912+00:00",
    "macro_region": "asia"
  },
  {
    "code": "nordics_baltics",
    "name": "Nordics + Baltics",
    "created_at": "2026-03-24T19:00:32.249912+00:00",
    "sort_order": 5,
    "updated_at": "2026-03-24T19:00:32.249912+00:00",
    "macro_region": "europe"
  },
  {
    "code": "us_canada",
    "name": "United States + Canada",
    "created_at": "2026-03-24T19:00:32.249912+00:00",
    "sort_order": 32,
    "updated_at": "2026-03-24T19:00:32.249912+00:00",
    "macro_region": "americas"
  }
]
$groups$::jsonb
)
on conflict do nothing;

insert into public.sponsor_companies
select *
from jsonb_populate_recordset(
  null::public.sponsor_companies,
  $companies$
[
  {
    "id": "06942d66-c044-4ec5-b365-fe9d2132bb15",
    "name": "Shemano",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Shemano.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "groupset",
        "wheelset",
        "shoes"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:04:39.562262+00:00",
    "country_code": "JP",
    "sponsor_kind": "technical",
    "home_group_code": "japan_korea",
    "home_macro_region": "asia"
  },
  {
    "id": "087733a3-4894-4253-a07e-bb3f1971f06a",
    "name": "BMX Corp",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/BMX%20Corp.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "frame"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:08:08.450917+00:00",
    "country_code": "CH",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "2eb9b259-2eb3-46d1-8966-604b0ceb00fb",
    "name": "Campagnola",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Campagnola.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "groupset",
        "wheelset"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:08:05.361782+00:00",
    "country_code": "IT",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "340a88a8-a456-4624-8d66-24cffe422a33",
    "name": "DTM",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/DTM.jpeg\r\n",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "equipment_durable_expansion_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "shoes"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-05-15T09:29:57.838831+00:00",
    "updated_at": "2026-05-15T11:07:30.845851+00:00",
    "country_code": "IT",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "5673ac7a-6c9e-42c8-9184-38d857da134d",
    "name": "ENVA",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/ENVA.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "frame",
        "wheelset"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:07:19.218945+00:00",
    "country_code": "US",
    "sponsor_kind": "technical",
    "home_group_code": "us_canada",
    "home_macro_region": "americas"
  },
  {
    "id": "58aed363-e662-47ea-b49b-0f7410a20442",
    "name": "Gira",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Gira.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "equipment_durable_expansion_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "helmet"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-05-15T09:29:57.838831+00:00",
    "updated_at": "2026-05-15T11:06:51.061179+00:00",
    "country_code": "US",
    "sponsor_kind": "technical",
    "home_group_code": "us_canada",
    "home_macro_region": "americas"
  },
  {
    "id": "600b3e26-dc6e-4f5f-a35c-dbe65f7fce87",
    "name": "Pinarella",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Pinarella.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "frame"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:05:59.64725+00:00",
    "country_code": "IT",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "752c890c-e09b-49af-97fd-1e9cbb0239f9",
    "name": "KASQ",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/KASQ.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "equipment_durable_expansion_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "helmet"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-05-15T09:29:57.838831+00:00",
    "updated_at": "2026-05-15T11:06:36.719371+00:00",
    "country_code": "IT",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "91168035-c4be-46dd-a5e1-5428af72c05c",
    "name": "Vittorio",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Vittorio.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "tires"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:04:12.743841+00:00",
    "country_code": "IT",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "9176080c-f07b-4413-a5be-e31de4774bb6",
    "name": "Rovall",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Rovall.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "equipment_durable_expansion_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "wheelset"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-05-15T09:29:57.838831+00:00",
    "updated_at": "2026-05-15T11:05:29.637792+00:00",
    "country_code": "US",
    "sponsor_kind": "technical",
    "home_group_code": "us_canada",
    "home_macro_region": "americas"
  },
  {
    "id": "c07d8dfb-93ce-4d48-8f3d-e8035f20db18",
    "name": "Mavik",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Mavik.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "wheelset"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:06:28.989517+00:00",
    "country_code": "FR",
    "sponsor_kind": "technical",
    "home_group_code": "france_benelux",
    "home_macro_region": "europe"
  },
  {
    "id": "c0e9ded7-c333-43fb-91f9-85aa8a441304",
    "name": "POK",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/POK.jpeg\r\n",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "helmet"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:05:48.255868+00:00",
    "country_code": "SE",
    "sponsor_kind": "technical",
    "home_group_code": "nordics_baltics",
    "home_macro_region": "europe"
  },
  {
    "id": "c84dcf6d-0429-4b8e-82fe-d4a7e194765d",
    "name": "Sida",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Sida.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "equipment_durable_expansion_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "shoes"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-05-15T09:29:57.838831+00:00",
    "updated_at": "2026-05-15T11:04:33.182107+00:00",
    "country_code": "IT",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "ced0b7fb-a026-4b67-8244-1e0bec92b376",
    "name": "SRMA",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/SRMA.jpeg\r\n",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "groupset"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:04:21.361068+00:00",
    "country_code": "US",
    "sponsor_kind": "technical",
    "home_group_code": "us_canada",
    "home_macro_region": "americas"
  },
  {
    "id": "db609feb-3126-4190-8a3b-b201338bb228",
    "name": "Kontinental",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/Kontinental.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "tires"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:07:36.625687+00:00",
    "country_code": "DE",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  },
  {
    "id": "db7fb57f-9711-4355-9311-fc5e237a0a1d",
    "name": "FAS",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/FAS.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "equipment_durable_expansion_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "groupset"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-05-15T09:29:57.838831+00:00",
    "updated_at": "2026-05-15T11:07:02.703819+00:00",
    "country_code": "US",
    "sponsor_kind": "technical",
    "home_group_code": "us_canada",
    "home_macro_region": "americas"
  },
  {
    "id": "f45b885d-2957-4271-9dea-eaf138bd2749",
    "name": "DX Swiss",
    "is_test": true,
    "logo_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Tehnical%20Sponsors/DX%20Swiss.jpeg",
    "metadata": {
      "seed_scope": "worldwide",
      "seed_source": "worldwide_technical_seed_v1",
      "placeholder_branding": true,
      "equipment_market_types": [
        "wheelset"
      ],
      "real_brand_placeholder": true
    },
    "is_active": true,
    "created_at": "2026-03-24T20:21:44.58134+00:00",
    "updated_at": "2026-05-15T11:07:26.308306+00:00",
    "country_code": "CH",
    "sponsor_kind": "technical",
    "home_group_code": "alpine_italy",
    "home_macro_region": "europe"
  }
]
$companies$::jsonb
)
on conflict do nothing;

insert into public.equipment_catalog
select *
from jsonb_populate_recordset(
  null::public.equipment_catalog,
  $catalog$
[
  {
    "id": "105cff18-9b10-48fa-bc35-7afcd365f52f",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": -1,
      "hilly_bonus_pct": 2,
      "sprint_bonus_pct": -2,
      "mountain_bonus_pct": 4
    },
    "item_key": "groupset_db7fb57f_summitshift_pro",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/FAS%20SummitGear%20Pro%20880.png",
      "item_unit": "complete_groupset",
      "renamed_at": "2026-05-20T13:46:12.460379+00:00",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "climbing",
      "seed_source": "groupset_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "climbing",
      "quality_label": "super",
      "rename_reason": "Groupset names made more unique and less similar to other equipment categories",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T07:22:50.653678+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "groupset_sponsor_slot": 2,
      "previous_display_name": "SummitShift Pro",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T15:39:58.012594+00:00",
    "resale_pct": 30,
    "updated_at": "2026-05-21T07:22:50.653678+00:00",
    "display_name": "SummitGear Pro 880",
    "quality_score": 82,
    "equipment_kind": "durable",
    "base_price_cash": 2700,
    "brand_company_id": "db7fb57f-9711-4355-9311-fc5e237a0a1d",
    "durability_score": 64,
    "equipment_category": "groupset",
    "condition_loss_per_race_day": 1.85,
    "maintenance_points_per_game_day": 30,
    "maintenance_cost_per_condition_point": 40
  },
  {
    "id": "1b9fd2ed-1aa5-4a71-9a57-9d09d7e7073e",
    "tier": 2,
    "effects": {
      "flat_bonus_pct": 3,
      "cobble_bonus_pct": -1,
      "sprint_bonus_pct": 2,
      "mountain_bonus_pct": -1
    },
    "item_key": "tires_91168035_strada_blitz",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Vittorio%20Strada%20Blitz.png",
      "item_unit": "bike_tire_set",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "aero_flat",
      "seed_source": "tires_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "aero_flat",
      "quality_label": "good",
      "fake_model_name": true,
      "image_updated_at": "2026-05-20T11:20:49.199681+00:00",
      "tire_sponsor_slot": 7,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T15:29:26.267785+00:00",
    "resale_pct": 11,
    "updated_at": "2026-05-20T11:20:49.199681+00:00",
    "display_name": "Strada Blitz",
    "quality_score": 72,
    "equipment_kind": "durable",
    "base_price_cash": 215,
    "brand_company_id": "91168035-c4be-46dd-a5e1-5428af72c05c",
    "durability_score": 65,
    "equipment_category": "tires",
    "condition_loss_per_race_day": 7.3,
    "maintenance_points_per_game_day": 33,
    "maintenance_cost_per_condition_point": 8
  },
  {
    "id": "403ad434-b161-4dca-987b-5e9db93d301e",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 2,
      "cobble_bonus_pct": -1,
      "mountain_bonus_pct": -2,
      "time_trial_bonus_pct": 4
    },
    "item_key": "shoes_340a88a8_chronolock_zero",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/DTM%20ChronoLock%20Zero.png",
      "item_unit": "cycling_shoes_pair",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "time_trial",
      "seed_source": "shoes_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "time_trial",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T08:30:20.632119+00:00",
      "shoes_sponsor_slot": 1,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-19T18:02:18.564645+00:00",
    "resale_pct": 28,
    "updated_at": "2026-05-21T08:30:20.632119+00:00",
    "display_name": "ChronoLock Zero",
    "quality_score": 85,
    "equipment_kind": "durable",
    "base_price_cash": 480,
    "brand_company_id": "340a88a8-a456-4624-8d66-24cffe422a33",
    "durability_score": 62,
    "equipment_category": "shoes",
    "condition_loss_per_race_day": 1.45,
    "maintenance_points_per_game_day": 27,
    "maintenance_cost_per_condition_point": 24
  },
  {
    "id": "5999fc72-5c20-45dd-8afc-a5b00ca21bac",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": -1,
      "hilly_bonus_pct": 2,
      "sprint_bonus_pct": -2,
      "mountain_bonus_pct": 4
    },
    "item_key": "enva_summitflow_e2_frame",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/ENVA%20Scala%20Vento.png",
      "renamed_at": "2026-05-18T11:02:17.553101+00:00",
      "bonus_model": "race_type_bonus_model_v3",
      "market_role": "climbing",
      "price_model": "realistic_frame_only_price",
      "seed_source": "frame_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "climbing",
      "quality_label": "super",
      "rebalanced_at": "2026-05-18T11:07:54.019774+00:00",
      "fake_model_name": true,
      "image_updated_at": "2026-05-18T13:51:25.345357+00:00",
      "bonus_model_notes": "Only race-type bonuses plus optional fatigue reduction",
      "rebalance_version": "frame_catalog_rebalance_v2",
      "bonus_rebalanced_at": "2026-05-18T14:15:21.000584+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T10:52:16.799822+00:00",
    "resale_pct": 30,
    "updated_at": "2026-05-19T20:04:14.270198+00:00",
    "display_name": "Scala Vento",
    "quality_score": 80,
    "equipment_kind": "durable",
    "base_price_cash": 4500,
    "brand_company_id": "5673ac7a-6c9e-42c8-9184-38d857da134d",
    "durability_score": 67,
    "equipment_category": "frame",
    "condition_loss_per_race_day": 2.6,
    "maintenance_points_per_game_day": 32,
    "maintenance_cost_per_condition_point": 41
  },
  {
    "id": "63958568-bd71-4482-8aeb-28e3e09526c8",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 4,
      "cobble_bonus_pct": -1,
      "sprint_bonus_pct": 2,
      "mountain_bonus_pct": -2
    },
    "item_key": "groupset_ced0b7fb_velocity_sync_pro",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/SRMA%20VelocityMech%20Pro%20800.png",
      "item_unit": "complete_groupset",
      "renamed_at": "2026-05-20T13:46:12.460379+00:00",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "aero_flat",
      "seed_source": "groupset_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "aero_flat",
      "quality_label": "super",
      "rename_reason": "Groupset names made more unique and less similar to other equipment categories",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T07:22:50.653678+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "groupset_sponsor_slot": 6,
      "previous_display_name": "Velocity Sync Pro",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T15:39:58.012594+00:00",
    "resale_pct": 30,
    "updated_at": "2026-05-21T07:22:50.653678+00:00",
    "display_name": "VelocityMech Pro 800",
    "quality_score": 83,
    "equipment_kind": "durable",
    "base_price_cash": 2800,
    "brand_company_id": "ced0b7fb-a026-4b67-8244-1e0bec92b376",
    "durability_score": 66,
    "equipment_category": "groupset",
    "condition_loss_per_race_day": 1.75,
    "maintenance_points_per_game_day": 30,
    "maintenance_cost_per_condition_point": 40
  },
  {
    "id": "68b0a8c4-492b-4585-8366-fa6a6e08abb7",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": -1,
      "hilly_bonus_pct": 2,
      "sprint_bonus_pct": -2,
      "mountain_bonus_pct": 4
    },
    "item_key": "shoes_c84dcf6d_summitlite_carbon",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Sida%20SummitLite%20Carbon.png",
      "item_unit": "cycling_shoes_pair",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "climbing",
      "seed_source": "shoes_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "climbing",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T08:30:20.632119+00:00",
      "shoes_sponsor_slot": 5,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-19T18:02:18.564645+00:00",
    "resale_pct": 26,
    "updated_at": "2026-05-21T08:30:20.632119+00:00",
    "display_name": "SummitLite Carbon",
    "quality_score": 81,
    "equipment_kind": "durable",
    "base_price_cash": 430,
    "brand_company_id": "c84dcf6d-0429-4b8e-82fe-d4a7e194765d",
    "durability_score": 64,
    "equipment_category": "shoes",
    "condition_loss_per_race_day": 1.34,
    "maintenance_points_per_game_day": 30,
    "maintenance_cost_per_condition_point": 22
  },
  {
    "id": "6b482063-4e65-4357-baef-0b45328ec12d",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 2,
      "cobble_bonus_pct": -1,
      "mountain_bonus_pct": -2,
      "time_trial_bonus_pct": 4
    },
    "item_key": "helmet_gira_chronocrown_core",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Gira%20ChronoCrown%20Core.png",
      "item_unit": "race_helmet",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "time_trial",
      "seed_source": "equipment_catalog_expansion_20260914_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "time_trial",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-09-14T18:15:16.699331+00:00",
      "helmet_sponsor_slot": 1,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "catalog_extension_version": "equipment_catalog_expansion_20260914_v1",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-09-14T12:15:03.589278+00:00",
    "resale_pct": 25,
    "updated_at": "2026-09-14T18:15:16.699331+00:00",
    "display_name": "ChronoCrown Core",
    "quality_score": 84,
    "equipment_kind": "durable",
    "base_price_cash": 400,
    "brand_company_id": "58aed363-e662-47ea-b49b-0f7410a20442",
    "durability_score": 64,
    "equipment_category": "helmet",
    "condition_loss_per_race_day": 1.34,
    "maintenance_points_per_game_day": 28,
    "maintenance_cost_per_condition_point": 22
  },
  {
    "id": "6c7b0fbd-079e-440a-9717-9f5b3e4f2661",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": -1,
      "hilly_bonus_pct": 2,
      "sprint_bonus_pct": -2,
      "mountain_bonus_pct": 4
    },
    "item_key": "tires_91168035_peakline_mx",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Vittorio%20PeakLine%20MX.png",
      "item_unit": "bike_tire_set",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "climbing",
      "seed_source": "tires_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "climbing",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-05-20T11:20:49.199681+00:00",
      "tire_sponsor_slot": 7,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T15:29:26.267785+00:00",
    "resale_pct": 13,
    "updated_at": "2026-05-20T11:20:49.199681+00:00",
    "display_name": "PeakLine MX",
    "quality_score": 80,
    "equipment_kind": "durable",
    "base_price_cash": 300,
    "brand_company_id": "91168035-c4be-46dd-a5e1-5428af72c05c",
    "durability_score": 61,
    "equipment_category": "tires",
    "condition_loss_per_race_day": 8,
    "maintenance_points_per_game_day": 31,
    "maintenance_cost_per_condition_point": 11
  },
  {
    "id": "7756a625-e0d2-42cd-bd94-0a19383a986d",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 4,
      "cobble_bonus_pct": -1,
      "sprint_bonus_pct": 3,
      "mountain_bonus_pct": -2
    },
    "item_key": "shoes_06942d66_ventosprint_pro",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Shemano%20VentoSprint%20Pro.png",
      "item_unit": "cycling_shoes_pair",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "aero_flat",
      "seed_source": "shoes_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "aero_flat",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T08:30:20.632119+00:00",
      "shoes_sponsor_slot": 4,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-19T18:02:18.564645+00:00",
    "resale_pct": 27,
    "updated_at": "2026-05-21T08:30:20.632119+00:00",
    "display_name": "VentoSprint Pro",
    "quality_score": 83,
    "equipment_kind": "durable",
    "base_price_cash": 460,
    "brand_company_id": "06942d66-c044-4ec5-b365-fe9d2132bb15",
    "durability_score": 63,
    "equipment_category": "shoes",
    "condition_loss_per_race_day": 1.4,
    "maintenance_points_per_game_day": 29,
    "maintenance_cost_per_condition_point": 23
  },
  {
    "id": "7a6b9de4-0c03-4be5-890a-c8cd1a651680",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 4,
      "cobble_bonus_pct": -1,
      "sprint_bonus_pct": 2,
      "mountain_bonus_pct": -2
    },
    "item_key": "helmet_752c890c_velox_blade_pro",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/KASQ%20Velox%20Blade%20Pro.png\r\n",
      "item_unit": "race_helmet",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "aero_flat",
      "seed_source": "helmet_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "aero_flat",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T08:18:15.007683+00:00",
      "helmet_sponsor_slot": 2,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-19T17:53:10.803223+00:00",
    "resale_pct": 25,
    "updated_at": "2026-05-21T08:18:15.007683+00:00",
    "display_name": "Velox Blade Pro",
    "quality_score": 82,
    "equipment_kind": "durable",
    "base_price_cash": 360,
    "brand_company_id": "752c890c-e09b-49af-97fd-1e9cbb0239f9",
    "durability_score": 68,
    "equipment_category": "helmet",
    "condition_loss_per_race_day": 1.25,
    "maintenance_points_per_game_day": 30,
    "maintenance_cost_per_condition_point": 20
  },
  {
    "id": "7c98c369-9a39-4171-bdad-1cb12c862828",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 2,
      "cobble_bonus_pct": -1,
      "mountain_bonus_pct": -2,
      "time_trial_bonus_pct": 4
    },
    "item_key": "tires_db609feb_aerovail_tt",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Kontinental%20AeroVail%20TT.png",
      "item_unit": "bike_tire_set",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "time_trial",
      "seed_source": "tires_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "time_trial",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-05-20T11:20:49.199681+00:00",
      "tire_sponsor_slot": 2,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T15:29:26.267785+00:00",
    "resale_pct": 13,
    "updated_at": "2026-05-20T11:20:49.199681+00:00",
    "display_name": "AeroVail TT",
    "quality_score": 82,
    "equipment_kind": "durable",
    "base_price_cash": 325,
    "brand_company_id": "db609feb-3126-4190-8a3b-b201338bb228",
    "durability_score": 60,
    "equipment_category": "tires",
    "condition_loss_per_race_day": 8.6,
    "maintenance_points_per_game_day": 28,
    "maintenance_cost_per_condition_point": 12
  },
  {
    "id": "7d9579a8-61e9-4abd-9c1a-23da77effffb",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 4,
      "cobble_bonus_pct": -1,
      "sprint_bonus_pct": 2,
      "mountain_bonus_pct": -2
    },
    "item_key": "pinarella_regale_corsa_frame",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Pinarella%20Regale%20Corsab.png",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "aero_flat",
      "seed_source": "equipment_catalog_expansion_20260914_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "aero_flat",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-09-14 16:47:14.953593+00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "catalog_extension_version": "equipment_catalog_expansion_20260914_v1",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-09-14T12:14:43.381544+00:00",
    "resale_pct": 31,
    "updated_at": "2026-09-14T16:47:14.953593+00:00",
    "display_name": "Regale Corsa",
    "quality_score": 84,
    "equipment_kind": "durable",
    "base_price_cash": 5650,
    "brand_company_id": "600b3e26-dc6e-4f5f-a35c-dbe65f7fce87",
    "durability_score": 68,
    "equipment_category": "frame",
    "condition_loss_per_race_day": 2.75,
    "maintenance_points_per_game_day": 31,
    "maintenance_cost_per_condition_point": 46
  },
  {
    "id": "7e05c71a-8497-43c8-8782-2952fd254291",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 2,
      "cobble_bonus_pct": -1,
      "mountain_bonus_pct": -2,
      "time_trial_bonus_pct": 4
    },
    "item_key": "bmx_corp_chrono_t1_frame",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/BMX%20Corp%20Velocron%20TT-900b.png",
      "renamed_at": "2026-05-18T11:02:17.553101+00:00",
      "bonus_model": "race_type_bonus_model_v3",
      "market_role": "time_trial",
      "price_model": "realistic_frame_only_price",
      "seed_source": "frame_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "time_trial",
      "quality_label": "super",
      "rebalanced_at": "2026-05-18T11:07:54.019774+00:00",
      "fake_model_name": true,
      "image_updated_at": "2026-05-18T13:51:25.345357+00:00",
      "bonus_model_notes": "Only race-type bonuses plus optional fatigue reduction",
      "rebalance_version": "frame_catalog_rebalance_v2",
      "bonus_rebalanced_at": "2026-05-18T14:15:21.000584+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T10:52:16.799822+00:00",
    "resale_pct": 30,
    "updated_at": "2026-07-30T09:57:10.221335+00:00",
    "display_name": "Velocron TT-900",
    "quality_score": 82,
    "equipment_kind": "durable",
    "base_price_cash": 5200,
    "brand_company_id": "087733a3-4894-4253-a07e-bb3f1971f06a",
    "durability_score": 66,
    "equipment_category": "frame",
    "condition_loss_per_race_day": 2.8,
    "maintenance_points_per_game_day": 31,
    "maintenance_cost_per_condition_point": 44
  },
  {
    "id": "97c6dfa1-1e3d-4157-bbf6-06fca7a4e68e",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": -1,
      "hilly_bonus_pct": 2,
      "sprint_bonus_pct": -2,
      "mountain_bonus_pct": 4
    },
    "item_key": "wheelset_f45b885d_summit_lite_30",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/DX%20Swiss%20Altura%20SLX.png",
      "bonus_model": "race_type_bonus_model_v3",
      "market_role": "climbing",
      "seed_source": "wheelset_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "climbing",
      "quality_label": "super",
      "rebalanced_at": "2026-05-18T14:05:36.815873+00:00",
      "fake_model_name": true,
      "image_updated_at": "2026-05-20T07:39:41.3839+00:00",
      "bonus_model_notes": "Only race-type bonuses plus optional fatigue reduction",
      "rebalance_version": "wheelset_catalog_rebalance_v2",
      "bonus_rebalanced_at": "2026-05-18T14:15:21.000584+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "wheelset_sponsor_slot": 2,
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T13:58:41.697035+00:00",
    "resale_pct": 30,
    "updated_at": "2026-05-20T07:39:41.3839+00:00",
    "display_name": "Altura SLX",
    "quality_score": 80,
    "equipment_kind": "durable",
    "base_price_cash": 3400,
    "brand_company_id": "f45b885d-2957-4271-9dea-eaf138bd2749",
    "durability_score": 66,
    "equipment_category": "wheelset",
    "condition_loss_per_race_day": 2.5,
    "maintenance_points_per_game_day": 32,
    "maintenance_cost_per_condition_point": 38
  },
  {
    "id": "a8f6cb1b-d6e6-4891-b915-b66e4dfd4e94",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 2,
      "cobble_bonus_pct": -1,
      "mountain_bonus_pct": -2,
      "time_trial_bonus_pct": 4
    },
    "item_key": "wheelset_c07d8dfb_aero_storm_75",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Mavik%20StormDrive%20TT.png",
      "bonus_model": "race_type_bonus_model_v3",
      "market_role": "time_trial",
      "seed_source": "wheelset_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "time_trial",
      "quality_label": "super",
      "rebalanced_at": "2026-05-18T14:05:36.815873+00:00",
      "fake_model_name": true,
      "image_updated_at": "2026-05-20T07:39:41.3839+00:00",
      "bonus_model_notes": "Only race-type bonuses plus optional fatigue reduction",
      "rebalance_version": "wheelset_catalog_rebalance_v2",
      "bonus_rebalanced_at": "2026-05-18T14:15:21.000584+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "wheelset_sponsor_slot": 5,
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T13:58:41.697035+00:00",
    "resale_pct": 31,
    "updated_at": "2026-05-20T07:39:41.3839+00:00",
    "display_name": "StormDrive TT",
    "quality_score": 83,
    "equipment_kind": "durable",
    "base_price_cash": 4100,
    "brand_company_id": "c07d8dfb-93ce-4d48-8f3d-e8035f20db18",
    "durability_score": 65,
    "equipment_category": "wheelset",
    "condition_loss_per_race_day": 2.7,
    "maintenance_points_per_game_day": 30,
    "maintenance_cost_per_condition_point": 44
  },
  {
    "id": "c48f00fd-2434-411f-a905-181470e5e91d",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 2,
      "cobble_bonus_pct": -1,
      "mountain_bonus_pct": -2,
      "time_trial_bonus_pct": 4
    },
    "item_key": "groupset_2eb9b259_chronosync_xr",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Campagnola%20ChronoMech%20XR-900.png",
      "item_unit": "complete_groupset",
      "renamed_at": "2026-05-20T13:46:12.460379+00:00",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "time_trial",
      "seed_source": "groupset_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "time_trial",
      "quality_label": "super",
      "rename_reason": "Groupset names made more unique and less similar to other equipment categories",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T07:22:50.653678+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "groupset_sponsor_slot": 1,
      "previous_display_name": "ChronoSync XR",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T15:39:58.012594+00:00",
    "resale_pct": 30,
    "updated_at": "2026-05-21T07:22:50.653678+00:00",
    "display_name": "ChronoMech XR-900",
    "quality_score": 84,
    "equipment_kind": "durable",
    "base_price_cash": 2850,
    "brand_company_id": "2eb9b259-2eb3-46d1-8966-604b0ceb00fb",
    "durability_score": 66,
    "equipment_category": "groupset",
    "condition_loss_per_race_day": 1.8,
    "maintenance_points_per_game_day": 30,
    "maintenance_cost_per_condition_point": 42
  },
  {
    "id": "c78ad647-7016-4b32-b7d6-7d9dfe5bb818",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": 4,
      "cobble_bonus_pct": -1,
      "sprint_bonus_pct": 2,
      "mountain_bonus_pct": -2
    },
    "item_key": "wheelset_9176080c_velocity_deep_64",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/Rovall%20Velora%20Deep%20X.png",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "aero_flat",
      "seed_source": "wheelset_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "aero_flat",
      "quality_label": "super",
      "rebalanced_at": "2026-05-18T14:05:36.815873+00:00",
      "fake_model_name": true,
      "image_updated_at": "2026-05-20T07:39:41.3839+00:00",
      "bonus_model_notes": "Only race-type bonuses, sprint bonus, plus optional fatigue reduction",
      "rebalance_version": "wheelset_catalog_rebalance_v2",
      "sprint_bonus_added": true,
      "bonus_rebalanced_at": "2026-05-18T14:17:41.821403+00:00",
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "wheelset_sponsor_slot": 6,
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "renamed_for_market_clarity": true,
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-18T13:58:41.697035+00:00",
    "resale_pct": 30,
    "updated_at": "2026-05-20T07:39:41.3839+00:00",
    "display_name": "Velora Deep X",
    "quality_score": 81,
    "equipment_kind": "durable",
    "base_price_cash": 3700,
    "brand_company_id": "9176080c-f07b-4413-a5be-e31de4774bb6",
    "durability_score": 67,
    "equipment_category": "wheelset",
    "condition_loss_per_race_day": 2.6,
    "maintenance_points_per_game_day": 31,
    "maintenance_cost_per_condition_point": 40
  },
  {
    "id": "e48bdd84-d710-4cc0-ba9e-697280965775",
    "tier": 3,
    "effects": {
      "flat_bonus_pct": -1,
      "hilly_bonus_pct": 2,
      "sprint_bonus_pct": -2,
      "mountain_bonus_pct": 4
    },
    "item_key": "helmet_c0e9ded7_montecrest_pro",
    "metadata": {
      "image_url": "https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Equipment/POK%20MonteCrest%20Pro.png",
      "item_unit": "race_helmet",
      "bonus_model": "race_type_bonus_model_v4",
      "market_role": "climbing",
      "seed_source": "helmet_catalog_seed_v1",
      "image_source": "supabase_storage_admin_staff_equipment",
      "terrain_role": "climbing",
      "quality_label": "super",
      "fake_model_name": true,
      "image_updated_at": "2026-05-21T08:18:15.007683+00:00",
      "helmet_sponsor_slot": 4,
      "negative_bonus_model": "specialist_tradeoffs_v2",
      "negative_bonus_notes": "Only specialist super items receive small -1% trade-offs. Maximum two negative bonuses per item.",
      "negative_bonus_updated_at": "2026-05-19T20:04:14.270198+00:00",
      "uses_current_fake_sponsor_name": true
    },
    "is_active": true,
    "created_at": "2026-05-19T17:53:10.803223+00:00",
    "resale_pct": 25,
    "updated_at": "2026-05-21T08:18:15.007683+00:00",
    "display_name": "MonteCrest Pro",
    "quality_score": 81,
    "equipment_kind": "durable",
    "base_price_cash": 330,
    "brand_company_id": "c0e9ded7-c333-43fb-91f9-85aa8a441304",
    "durability_score": 66,
    "equipment_category": "helmet",
    "condition_loss_per_race_day": 1.3,
    "maintenance_points_per_game_day": 30,
    "maintenance_cost_per_condition_point": 20
  }
]
$catalog$::jsonb
)
on conflict do nothing;

insert into public.national_team_standard_equipment
select *
from jsonb_populate_recordset(
  null::public.national_team_standard_equipment,
  $equipment$
[
  {
    "id": "56cecd7b-d8ba-4368-9142-633235c4d8e9",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "flat",
    "catalog_item_id": "7d9579a8-61e9-4abd-9c1a-23da77effffb",
    "equipment_category": "frame"
  },
  {
    "id": "a9d52663-10f5-4259-8e65-f06016b38b83",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "mountain",
    "catalog_item_id": "5999fc72-5c20-45dd-8afc-a5b00ca21bac",
    "equipment_category": "frame"
  },
  {
    "id": "78dbad33-8ac0-4bc1-a7da-cc986c318dc7",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "time_trial",
    "catalog_item_id": "7e05c71a-8497-43c8-8782-2952fd254291",
    "equipment_category": "frame"
  },
  {
    "id": "939f88b0-8608-4ff8-b7c5-7909c59b23c0",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "flat",
    "catalog_item_id": "63958568-bd71-4482-8aeb-28e3e09526c8",
    "equipment_category": "groupset"
  },
  {
    "id": "a8d532b6-5529-4a19-89b5-83fa76f2ad84",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "mountain",
    "catalog_item_id": "105cff18-9b10-48fa-bc35-7afcd365f52f",
    "equipment_category": "groupset"
  },
  {
    "id": "af7bfccc-97e8-4dc1-860b-c47107dc6443",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "time_trial",
    "catalog_item_id": "c48f00fd-2434-411f-a905-181470e5e91d",
    "equipment_category": "groupset"
  },
  {
    "id": "03b330b7-4be5-4a9e-9a1d-c6eeaae2d43a",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "flat",
    "catalog_item_id": "7a6b9de4-0c03-4be5-890a-c8cd1a651680",
    "equipment_category": "helmet"
  },
  {
    "id": "4dc043ca-c84b-484c-a0f4-f00135b7a526",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "mountain",
    "catalog_item_id": "e48bdd84-d710-4cc0-ba9e-697280965775",
    "equipment_category": "helmet"
  },
  {
    "id": "6a04d19c-43dc-4ff9-99f9-0e01c9b931e4",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "time_trial",
    "catalog_item_id": "6b482063-4e65-4357-baef-0b45328ec12d",
    "equipment_category": "helmet"
  },
  {
    "id": "a599791d-8310-4f7f-a2da-624df2f92328",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "flat",
    "catalog_item_id": "7756a625-e0d2-42cd-bd94-0a19383a986d",
    "equipment_category": "shoes"
  },
  {
    "id": "fb1512ee-6303-42fe-87ba-9f4114c81750",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "mountain",
    "catalog_item_id": "68b0a8c4-492b-4585-8366-fa6a6e08abb7",
    "equipment_category": "shoes"
  },
  {
    "id": "6e69b1ec-2b5b-4aa6-9f81-f02d92f18664",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "time_trial",
    "catalog_item_id": "403ad434-b161-4dca-987b-5e9db93d301e",
    "equipment_category": "shoes"
  },
  {
    "id": "64c93f57-2a48-40f4-bcc2-bbb794f44e60",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "flat",
    "catalog_item_id": "1b9fd2ed-1aa5-4a71-9a57-9d09d7e7073e",
    "equipment_category": "tires"
  },
  {
    "id": "46a36e43-fd0a-4aad-916f-4bbad2dd2a8f",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "mountain",
    "catalog_item_id": "6c7b0fbd-079e-440a-9717-9f5b3e4f2661",
    "equipment_category": "tires"
  },
  {
    "id": "d6068c66-3c64-4ed9-8039-f1a6440f3be3",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "time_trial",
    "catalog_item_id": "7c98c369-9a39-4171-bdad-1cb12c862828",
    "equipment_category": "tires"
  },
  {
    "id": "c96b1b8c-6c95-4c8a-a501-41d62c1cbff8",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "flat",
    "catalog_item_id": "c78ad647-7016-4b32-b7d6-7d9dfe5bb818",
    "equipment_category": "wheelset"
  },
  {
    "id": "f059612b-febe-4982-97b3-8ccb8fbe1c87",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "mountain",
    "catalog_item_id": "97c6dfa1-1e3d-4157-bbf6-06fca7a4e68e",
    "equipment_category": "wheelset"
  },
  {
    "id": "ca4b42aa-56fb-45ff-8c23-af4d0a4f4b5b",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "model_count": 1,
    "specialization": "time_trial",
    "catalog_item_id": "a8f6cb1b-d6e6-4891-b915-b66e4dfd4e94",
    "equipment_category": "wheelset"
  }
]
$equipment$::jsonb
)
on conflict do nothing;

insert into public.national_team_standard_assets
select *
from jsonb_populate_recordset(
  null::public.national_team_standard_assets,
  $assets$
[
  {
    "quantity": 10,
    "asset_key": "team_car",
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "usage_note": "System-provided National Team race/support cars; no purchase or maintenance cost.",
    "asset_level": 5
  }
]
$assets$::jsonb
)
on conflict do nothing;

insert into public.national_team_standard_supplies
select *
from jsonb_populate_recordset(
  null::public.national_team_standard_supplies,
  $supplies$
[
  {
    "quantity": 250,
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "supply_key": "bidons_water_bottles",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "display_name": "Water / Bidons",
    "replenishment_scope": "competition_window"
  },
  {
    "quantity": 250,
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "supply_key": "energy_gels",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "display_name": "Energy Gels",
    "replenishment_scope": "competition_window"
  },
  {
    "quantity": 250,
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "supply_key": "nutrition_packs",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "display_name": "Nutrition Packs",
    "replenishment_scope": "competition_window"
  },
  {
    "quantity": 50,
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "supply_key": "race_jersey_complete",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "display_name": "National Team Race Jerseys",
    "replenishment_scope": "competition_window"
  },
  {
    "quantity": 50,
    "is_active": true,
    "created_at": "2026-09-29T10:16:32.112877+00:00",
    "supply_key": "rain_jackets",
    "updated_at": "2026-09-29T10:16:32.112877+00:00",
    "display_name": "National Team Rain Jackets",
    "replenishment_scope": "competition_window"
  }
]
$supplies$::jsonb
)
on conflict do nothing;

do $$
begin
  if exists (
    select 1 from cron.job where jobname='national-association-nations-runtime-v1'
  ) then
    update cron.job
    set schedule='*/15 * * * *',
        command='select public.process_national_association_nations_runtime_v4();',
        active=true
    where jobname='national-association-nations-runtime-v1';
  else
    perform cron.schedule(
      'national-association-nations-runtime-v1',
      '*/15 * * * *',
      'select public.process_national_association_nations_runtime_v4();'
    );
  end if;
end
$$;
