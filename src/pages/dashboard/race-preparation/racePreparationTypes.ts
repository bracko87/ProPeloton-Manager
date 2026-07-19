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

export type UUID = string;

export type RacePreparationTab = "acceptedRaces" | "racePackage" | "stagePlans";

export type RacePreparationTacticalPlannerChoice =
  "sport_director" | "u23_head_coach" | "none" | "conflict";

export type RacePrepAssetKey =
  | "team_bus"
  | "equipment_van"
  | "mobile_workshop"
  | "medical_van"
  | "team_car_1"
  | "team_car_2"
  | "team_car_3";

export type RacePrepAssetInventoryKey =
  "team_bus" | "equipment_van" | "mobile_workshop" | "medical_van" | "team_car";

export type RacePrepAssetLookupKey =
  RacePrepAssetKey | RacePrepAssetInventoryKey;

export type RaceSupplyKey =
  | "bidons_water_bottles"
  | "energy_gels"
  | "nutrition_packs"
  | "race_jersey_complete"
  | "rain_jackets";

export type JsonRecord = Record<string, unknown>;

export interface RacePreparationRace {
  id: UUID;
  name: string;
  short_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  stage_count?: number | null;
  category?: string | null;
  race_type?: string | null;
  race_class_code?: string | null;
  logo_url?: string | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface RacePreparationTarget {
  has_target: boolean;
  current_game_date?: string;
  current_game_timestamp?: string;
  message?: string;
  race?: RacePreparationRace | JsonRecord | null;
  entry?: JsonRecord | null;
  entry_rules?: JsonRecord | null;
  preparation?: JsonRecord | null;
  stages?: JsonRecord[];
  stage_plans?: JsonRecord[];
  setup_window_opens_on?: string;
  rider_submission_deadline_on?: string;
  race_package_status?: string;
  startlist_status?: string;
}

export interface AcceptedRacePreparationRow {
  race_team_entry_id: UUID;
  race_id: UUID;
  club_id: UUID;
  entry_status: string;
  race: RacePreparationRace;
  entry_rules?: JsonRecord | null;
  preparation?: JsonRecord | null;
  stage_count: number;
  setup_window_opens_on?: string | null;
  rider_submission_deadline_on?: string | null;
  race_package_status: string;
  startlist_status: string;
}

export interface RacePreparationSquadOption {
  id: UUID;
  name: string;
  club_type: string;
  parent_club_id?: UUID | null;
  country_code?: string | null;
  logo_url?: string | null;
  is_default: boolean;
  label: string;
}

export interface RacePreparationAssetAssignment {
  asset_key: RacePrepAssetInventoryKey;
  asset_slot_key?: RacePrepAssetKey;
  asset_id: UUID;
}

export type RacePreparationSupplyReservations = Partial<
  Record<RaceSupplyKey, number>
>;

export interface RacePreparationPayload {
  race_id: UUID;
  club_id: UUID;
  participating_club_id?: UUID | null;
  rider_ids?: UUID[];
  staff_ids?: UUID[];
  asset_assignments?: RacePreparationAssetAssignment[];
  supply_reservations?: RacePreparationSupplyReservations;
  default_equipment_setup_id?: UUID | null;
}

export interface RacePreparationQuote {
  is_valid: boolean;
  current_game_date?: string;
  race_id?: UUID;
  club_id?: UUID;
  entry?: JsonRecord | null;
  race?: JsonRecord | null;
  entry_rules?: JsonRecord | null;
  race_window?: JsonRecord;
  rider_rules?: {
    min_riders?: number;
    max_riders?: number;
    selected_riders?: number;
  };
  rider_validation?: JsonRecord[];
  staff_validation?: JsonRecord[];
  asset_validation?: JsonRecord[];
  supply_validation?: JsonRecord[];
  team_policies_snapshot?: JsonRecord;
  cost_breakdown?: Record<string, number>;
  bonus_preview?: JsonRecord | null;
  standardized_bonus?: JsonRecord | null;
  errors?: string[];
  warnings?: string[];
}

export interface RacePreparationSubmitResult {
  success?: boolean;
  race_preparation_id?: UUID;
  race_id?: UUID;
  club_id?: UUID;
  race_name?: string;
  status?: string;
  startlist_status?: string;
  current_game_date?: string;
  rider_submission_deadline_on?: string;
  rider_count?: number;
  staff_count?: number;
  stage_plan_count?: number;
  total_cost_cash?: number;
  finance_transaction_id?: UUID | null;
  cost_breakdown?: Record<string, number>;
  message?: string;
  [key: string]: unknown;
}

export interface ClubRiderOption {
  club_rider_id: UUID;
  rider_id: UUID;
  assigned_role?: string | null;
  rider?: JsonRecord;
}

export interface StaffOption {
  id: UUID;
  role_type: string;
  staff_name: string;
  expertise?: number;
  experience?: number;
  leadership?: number;
  efficiency?: number;
  potential?: number;
  loyalty?: number;
  salary_weekly?: number;
  specialization?: string | null;
  team_scope?: string | null;
  contract_expires_at?: string | null;
  current_availability_factor?: number;
}

export interface U23HeadCoachOption extends StaffOption {
  staff_id: UUID;
  staff_club_id?: UUID;
  current_availability_factor?: number;
}

export interface AssetOption {
  id: UUID;
  asset_key: RacePrepAssetInventoryKey;
  display_name: string;
  asset_level?: number;
  condition_percent?: number;
  support_value?: number;
  status?: string;
  assignment_locked?: boolean;
  current_assignment_type?: string | null;
  current_assignment_id?: UUID | null;
  current_assignment_label?: string | null;
  assignment_start_game_date?: string | null;
  assignment_end_game_date?: string | null;
  metadata?: JsonRecord;
}

export interface RaceSupplyOption {
  id: UUID;
  supply_key: RaceSupplyKey;
  display_name: string;
  quantity_available: number;
}

export interface EquipmentSetupPresetOption {
  id: UUID;
  setup_slot?: number | null;
  setup_name: string;
  label: string;
  bonus_preview?: JsonRecord | null;
  selected_catalog_item_ids?: JsonRecord | null;
  selected_items?: unknown;
  weighted_bonuses?: JsonRecord | null;
  raw_weighted_bonuses?: JsonRecord | null;
  caps?: JsonRecord | null;
  bonus_model?: JsonRecord | null;

  /**
   * Maximum number of riders that can use this setup in the same stage.
   * Calculated from the lowest available equipment type inside the setup.
   */
  setup_capacity?: JsonRecord | null;
  max_assignments?: number | null;
  limiting_item_label?: string | null;
  limiting_equipment_category?: string | null;
  is_default_setup?: boolean;
  is_virtual_default?: boolean;
}

export type StageRiderRoleCode =
  | "team_leader_gc"
  | "sprinter"
  | "lead_out_rider"
  | "sprint_train_rider"
  | "climber"
  | "mountain_domestique"
  | "helper_domestique"
  | "breakaway_rider"
  | "breakaway_chaser"
  | "rouleur"
  | "protected_rider"
  | "free_role";

export interface RaceStagePlanSavePayload {
  club_id: UUID;
  race_preparation_id: UUID;
  race_id: UUID;
  stage_id?: UUID | null;
  stage_number: number;
  team_tactic_json: JsonRecord;
  rider_roles_json: Record<string, StageRiderRoleCode | string>;
  rider_equipment_json: Record<string, UUID | string>;
  rider_individual_tactics_json: JsonRecord;
  rider_supplies_json: JsonRecord;
}

export interface RaceStagePlanSaveResult {
  success?: boolean;
  race_stage_plan_id?: UUID;
  race_preparation_id?: UUID;
  race_id?: UUID;
  stage_id?: UUID | null;
  stage_number?: number;
  status?: string;
  locked?: boolean;
  lock_game_ts?: string | null;
  last_saved_at?: string | null;
  last_saved_game_ts?: string | null;
  message?: string;
  [key: string]: unknown;
}

export interface BlockedRacePreparationResource {
  resource_type: "rider" | "staff" | "asset";
  resource_id: UUID;
  asset_key?: string | null;
  asset_slot_key?: string | null;
  blocking_race_preparation_id: UUID;
  blocking_race_id: UUID;
  blocking_race_name: string;
  blocking_start_date: string;
  blocking_end_date: string;
}

export interface RacePreparationSelectableData {
  riders: ClubRiderOption[];
  staff: StaffOption[];
  assets: Record<string, AssetOption[]>;
  supplies: RaceSupplyOption[];
  equipmentPresets: EquipmentSetupPresetOption[];
  blockedResources: BlockedRacePreparationResource[];
}

export interface ExistingRacePreparationDraft {
  riderIds: UUID[];
  staffIds: UUID[];
  assetAssignments: Record<RacePrepAssetKey, UUID | "">;
  supplyReservations: Record<string, number>;
  tacticalPlannerChoice: RacePreparationTacticalPlannerChoice;
  u23HeadCoachId: UUID | null;
  u23AutomationEnabled: boolean;
}

export interface RacePreparationTacticalPlannerResponse {
  status: string;
  code?: string;
  message?: string;
  version?: string;
  race_preparation_id?: UUID;
  race_id?: UUID;
  owner_club_id?: UUID;
  participating_club_id?: UUID;
  participating_club_name?: string;
  participating_club_type?: string;
  is_owner_developing_team?: boolean;
  planner_choice: RacePreparationTacticalPlannerChoice;
  sport_director?: {
    staff_id: UUID;
    staff_name?: string | null;
  } | null;
  u23_head_coach?: {
    staff_id: UUID;
    staff_name?: string | null;
    automation_enabled?: boolean;
  } | null;
  both_allowed?: boolean;
}

export interface U23StagePlanAutomationSetting extends JsonRecord {
  race_preparation_id?: UUID;
  owner_club_id?: UUID;
  participating_club_id?: UUID;
  planner_role?: "u23_head_coach";
  planner_staff_id?: UUID | null;
  is_enabled?: boolean;
  automation_mode?: string;
  resume_after_manual_stage?: boolean;
  last_generated_stage_id?: UUID | null;
  last_source_stage_id?: UUID | null;
  last_generated_at?: string | null;
  last_generation_status?: string | null;
  last_generation_summary?: JsonRecord;
  metadata?: JsonRecord;
}

export interface U23StagePlanManagement extends JsonRecord {
  race_stage_plan_id?: UUID;
  race_preparation_id?: UUID;
  race_id?: UUID;
  stage_id?: UUID;
  management_mode?: "coach" | "manual";
  source_type?: "u23_head_coach" | "sport_director" | "manual";
  planner_role?: "u23_head_coach" | "sport_director" | null;
  planner_staff_id?: UUID | null;
  based_on_stage_id?: UUID | null;
  generation_version?: string | null;
  decision_quality_score?: number | string | null;
  generated_at?: string | null;
  manually_overridden_at?: string | null;
  source_snapshot_json?: JsonRecord;
  decision_summary_json?: JsonRecord;
  metadata?: JsonRecord;
}

export interface U23StagePlanDashboardStage extends JsonRecord {
  race_stage_plan_id?: UUID;
  stage_id?: UUID;
  stage_number?: number;
  stage_date?: string;
  stage_plan_status?: string;
  last_saved_at?: string | null;
  weather_cancelled?: boolean;
  weather_cancellation_reason?: string | null;
  management?: U23StagePlanManagement | null;
}

export interface U23StagePlanAutomationDashboard extends JsonRecord {
  status?: string;
  version?: string;
  race_preparation_id?: UUID;
  race_id?: UUID;
  race_preparation_status?: string;
  startlist_status?: string;
  owner_club_id?: UUID;
  owner_club_name?: string;
  participating_club_id?: UUID;
  participating_club_name?: string;
  participating_club_type?: string;
  is_developing_team?: boolean;
  automation_eligible?: boolean;
  setting?: U23StagePlanAutomationSetting | null;
  eligible_u23_head_coaches?: U23HeadCoachOption[] | JsonRecord[];
  stages?: U23StagePlanDashboardStage[];
  generation_history?: JsonRecord[];
  generator_installed?: boolean;
  save_integration_installed?: boolean;
  automatic_writer_installed?: boolean;
  initial_stage_invocation_installed?: boolean;
  post_stage_hook_installed?: boolean;
}

export interface U23StagePlanAutomationSetResult extends JsonRecord {
  ok?: boolean;
  status?: string;
  code?: string;
  message?: string;
  version?: string;
  race_preparation_id?: UUID;
  race_id?: UUID;
  owner_club_id?: UUID;
  participating_club_id?: UUID;
  participating_club_name?: string;
  is_enabled?: boolean;
  planner_role?: "u23_head_coach";
  planner_staff_id?: UUID | null;
  planner_staff_name?: string | null;
  planner_choice?: RacePreparationTacticalPlannerChoice;
  current_availability_factor?: number | string | null;
  automation_mode?: string;
  resume_after_manual_stage?: boolean;
  sport_director_assignment_removed?: boolean;
  removed_sport_director_assignment_count?: number;
  initial_target?: JsonRecord | null;
  initial_generation?: U23StagePlanApplyResult | JsonRecord;
}

export interface U23StagePlanApplyResult extends JsonRecord {
  status?: string;
  code?: string;
  message?: string;
  applied?: boolean;
  version?: string;
  race_preparation_id?: UUID;
  race_stage_plan_id?: UUID;
  race_id?: UUID;
  stage_id?: UUID;
  stage_number?: number;
  stage_date?: string;
  owner_club_id?: UUID;
  participating_club_id?: UUID;
  participating_club_name?: string;
  planner_staff_id?: UUID;
  quality_score?: number | string;
  quality_tier?: string;
  management?: JsonRecord;
  counts?: JsonRecord;
  save_result?: RaceStagePlanSaveResult | JsonRecord;
}
