/**
 * racePreparationTypes.ts
 * Shared TypeScript types for Race Preparation.
 *
 * Main concept:
 * - Accepted Races = all confirmed participations.
 * - Race Plan = whole-race startlist, staff, logistics, assets, cost.
 * - Stage Plans = per-stage tactics, team car and stage supply usage.
 *
 * Write rule:
 * UI Button → Supabase Edge Function → SQL RPC → Database.
 */

export type UUID = string

export type RacePreparationTab =
  | 'acceptedRaces'
  | 'racePackage'
  | 'stagePlans'

export type RacePrepAssetKey =
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'
  | 'team_car_1'
  | 'team_car_2'
  | 'team_car_3'

export type RacePrepAssetInventoryKey =
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'
  | 'team_car'

export type RacePrepAssetLookupKey =
  | RacePrepAssetKey
  | RacePrepAssetInventoryKey

export type RaceSupplyKey =
  | 'bidons_water_bottles'
  | 'energy_gels'
  | 'nutrition_packs'
  | 'race_jersey_complete'
  | 'rain_jackets'

export type JsonRecord = Record<string, unknown>

export interface RacePreparationRace {
  id: UUID
  name: string
  short_name?: string | null
  start_date?: string | null
  end_date?: string | null
  stage_count?: number | null
  category?: string | null
  race_type?: string | null
  race_class_code?: string | null
  logo_url?: string | null
  status?: string | null
  [key: string]: unknown
}

export interface RacePreparationTarget {
  has_target: boolean
  current_game_date?: string
  current_game_timestamp?: string
  message?: string
  race?: RacePreparationRace | JsonRecord | null
  entry?: JsonRecord | null
  entry_rules?: JsonRecord | null
  preparation?: JsonRecord | null
  stages?: JsonRecord[]
  stage_plans?: JsonRecord[]
  setup_window_opens_on?: string
  rider_submission_deadline_on?: string
  race_package_status?: string
  startlist_status?: string
}

export interface AcceptedRacePreparationRow {
  race_team_entry_id: UUID
  race_id: UUID
  club_id: UUID
  entry_status: string
  race: RacePreparationRace
  entry_rules?: JsonRecord | null
  preparation?: JsonRecord | null
  stage_count: number
  setup_window_opens_on?: string | null
  rider_submission_deadline_on?: string | null
  race_package_status: string
  startlist_status: string
}

export interface RacePreparationSquadOption {
  id: UUID
  name: string
  club_type: string
  parent_club_id?: UUID | null
  country_code?: string | null
  logo_url?: string | null
  is_default: boolean
  label: string
}

export interface RacePreparationAssetAssignment {
  asset_key: RacePrepAssetInventoryKey
  asset_slot_key?: RacePrepAssetKey
  asset_id: UUID
}

export type RacePreparationSupplyReservations = Partial<
  Record<RaceSupplyKey, number>
>

export interface RacePreparationPayload {
  race_id: UUID
  club_id: UUID
  participating_club_id?: UUID | null
  rider_ids?: UUID[]
  staff_ids?: UUID[]
  asset_assignments?: RacePreparationAssetAssignment[]
  supply_reservations?: RacePreparationSupplyReservations
  default_equipment_setup_id?: UUID | null
}

export interface RacePreparationQuote {
  is_valid: boolean
  current_game_date?: string
  race_id?: UUID
  club_id?: UUID
  entry?: JsonRecord | null
  race?: JsonRecord | null
  entry_rules?: JsonRecord | null
  race_window?: JsonRecord
  rider_rules?: {
    min_riders?: number
    max_riders?: number
    selected_riders?: number
  }
  rider_validation?: JsonRecord[]
  staff_validation?: JsonRecord[]
  asset_validation?: JsonRecord[]
  supply_validation?: JsonRecord[]
  team_policies_snapshot?: JsonRecord
  cost_breakdown?: Record<string, number>
  bonus_preview?: JsonRecord | null
  standardized_bonus?: JsonRecord | null
  errors?: string[]
  warnings?: string[]
}

export interface RacePreparationSubmitResult {
  success?: boolean
  race_preparation_id?: UUID
  race_id?: UUID
  club_id?: UUID
  race_name?: string
  status?: string
  startlist_status?: string
  current_game_date?: string
  rider_submission_deadline_on?: string
  rider_count?: number
  staff_count?: number
  stage_plan_count?: number
  total_cost_cash?: number
  finance_transaction_id?: UUID | null
  cost_breakdown?: Record<string, number>
  message?: string
  [key: string]: unknown
}

export interface ClubRiderOption {
  club_rider_id: UUID
  rider_id: UUID
  assigned_role?: string | null
  rider?: JsonRecord
}

export interface StaffOption {
  id: UUID
  role_type: string
  staff_name: string
  expertise?: number
  experience?: number
  leadership?: number
  efficiency?: number
  salary_weekly?: number
}

export interface AssetOption {
  id: UUID
  asset_key: RacePrepAssetInventoryKey
  display_name: string
  asset_level?: number
  condition_percent?: number
  support_value?: number
  status?: string
  assignment_locked?: boolean
  current_assignment_type?: string | null
  current_assignment_id?: UUID | null
  current_assignment_label?: string | null
  assignment_start_game_date?: string | null
  assignment_end_game_date?: string | null
  metadata?: JsonRecord
}

export interface RaceSupplyOption {
  id: UUID
  supply_key: RaceSupplyKey
  display_name: string
  quantity_available: number
}

export interface EquipmentSetupPresetOption {
  id: UUID
  setup_slot?: number | null
  setup_name: string
  label: string
  bonus_preview?: JsonRecord | null
  selected_catalog_item_ids?: JsonRecord | null
  selected_items?: unknown
  weighted_bonuses?: JsonRecord | null
  raw_weighted_bonuses?: JsonRecord | null
  caps?: JsonRecord | null
  bonus_model?: JsonRecord | null

  /**
   * Maximum number of riders that can use this setup in the same stage.
   * Calculated from the lowest available equipment type inside the setup.
   *
   * Example:
   * frame 7/7, wheelset 10/10, tires 1/1, groupset 10/10,
   * helmet 10/10, shoes 10/10
   * => max_assignments = 1, limiting item = tires / RoadPulse Evo.
   */
  setup_capacity?: JsonRecord | null
  max_assignments?: number | null
  limiting_item_label?: string | null
  limiting_equipment_category?: string | null
  is_default_setup?: boolean
  is_virtual_default?: boolean
}

export type StageRiderRoleCode =
  | 'team_leader_gc'
  | 'sprinter'
  | 'lead_out_rider'
  | 'sprint_train_rider'
  | 'climber'
  | 'mountain_domestique'
  | 'helper_domestique'
  | 'breakaway_rider'
  | 'breakaway_chaser'
  | 'rouleur'
  | 'protected_rider'
  | 'free_role'

export interface RaceStagePlanSavePayload {
  club_id: UUID
  race_preparation_id: UUID
  race_id: UUID
  stage_id?: UUID | null
  stage_number: number
  team_tactic_json: JsonRecord
  rider_roles_json: Record<
    string,
    StageRiderRoleCode | string
  >
  rider_equipment_json: Record<string, UUID | string>
  rider_supplies_json: JsonRecord
}

export interface RaceStagePlanSaveResult {
  success?: boolean
  race_stage_plan_id?: UUID
  race_preparation_id?: UUID
  race_id?: UUID
  stage_id?: UUID | null
  stage_number?: number
  status?: string
  locked?: boolean
  lock_game_ts?: string | null
  last_saved_at?: string | null
  last_saved_game_ts?: string | null
  message?: string
  [key: string]: unknown
}

export interface BlockedRacePreparationResource {
  resource_type: 'rider' | 'staff' | 'asset'
  resource_id: UUID
  asset_key?: string | null
  asset_slot_key?: string | null
  blocking_race_preparation_id: UUID
  blocking_race_id: UUID
  blocking_race_name: string
  blocking_start_date: string
  blocking_end_date: string
}

export interface RacePreparationSelectableData {
  riders: ClubRiderOption[]
  staff: StaffOption[]
  assets: Record<string, AssetOption[]>
  supplies: RaceSupplyOption[]
  equipmentPresets: EquipmentSetupPresetOption[]
  blockedResources: BlockedRacePreparationResource[]
}

export interface ExistingRacePreparationDraft {
  riderIds: UUID[]
  staffIds: UUID[]
  assetAssignments: Record<
    RacePrepAssetKey,
    UUID | ''
  >
  supplyReservations: Record<string, number>
}