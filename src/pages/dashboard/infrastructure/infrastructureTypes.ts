/**
 * infrastructureTypes.ts
 *
 * Shared type definitions for the Infrastructure dashboard domain.
 * Centralizes all facility, asset, job, and staff-related types so that
 * Infrastructure.tsx and its subcomponents can reuse them.
 */

export type TabKey = 'facilities' | 'assets'

export type AssetSubTabKey =
  | 'team_cars'
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

export type InfrastructureAssetRpcKey =
  | 'team_car'
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

export type ClubInfrastructureRow = {
  club_id: string
  hq_level: number
  training_center_level: number
  medical_center_level: number
  scouting_level: number
  youth_academy_level: number
  mechanics_workshop_level: number
  team_car_fleet_quantity: number
  team_bus_quantity: number
  equipment_van_quantity: number
  mobile_workshop_quantity: number
  medical_van_quantity: number
}

export type InfrastructureJobType = 'facility_upgrade' | 'asset_delivery'

export type InfrastructureJobRow = {
  id: string
  club_id: string
  job_type: InfrastructureJobType
  target_key: string
  status: 'pending' | 'completed' | 'cancelled' | 'failed'
  facility_target_level: number | null
  asset_level?: number | null
  asset_quantity: number | null
  cost_cash: number
  finance_transaction_id: string | null
  started_at: string
  complete_at: string
  completed_at: string | null
  created_at: string
  duration_game_days: number | null
  started_game_date: string | null
  complete_game_date: string | null
  metadata?: Record<string, unknown> | null
}

export type FacilityJobCapacityRow = {
  club_id: string
  active_facility_jobs: number
  max_active_facility_jobs: number
  open_facility_job_slots: number
  can_start_facility_job: boolean
}

export type InfrastructureCancellationQuoteRow = {
  job_id: string
  club_id: string
  job_type: string
  target_key: string
  status: string
  cost_cash: number
  duration_game_days: number
  started_game_date: string | null
  current_game_date: string | null
  complete_game_date: string | null
  elapsed_game_days: number
  free_refund_days: number
  refund_percent: string | number
  refund_cash: number
  cancellation_cost_cash: number
  can_cancel: boolean
  reason: string
}

export type InfrastructureAssetActionTarget = {
  assetKey: InfrastructureAssetRpcKey
  assetId: string
  displayName: string
  assetName: string
  assetLevel: number
  conditionPercent: string | number
  status: string
}

export type InfrastructureAssetRepairQuoteRow = {
  asset_key: InfrastructureAssetRpcKey
  asset_id: string
  club_id: string
  display_name: string
  asset_level: number
  status: string
  assignment_locked: boolean
  condition_percent: string | number
  missing_condition: string | number
  repair_cost_cash: number
  duration_game_days: number
  can_repair: boolean
  reason: string
}

export type InfrastructureAssetSaleQuoteRow = {
  asset_key: InfrastructureAssetRpcKey
  asset_id: string
  club_id: string
  display_name: string
  asset_level: number
  status: string
  assignment_locked: boolean
  purchase_cost_cash: number
  condition_percent: string | number
  sale_value_cash: number
  can_sell: boolean
  reason: string
}

export type AssetActionAlert = {
  clubId: string
  assetKey?: InfrastructureAssetRpcKey
  code?: string
  title: string
  message: string
}

export type AssetDeliveryResponse = {
  ok?: boolean
  code?: string
  message?: string
  title?: string
  required_amount?: number
  current_balance?: number
  shortfall?: number
  emergency_loan_available?: boolean
  technical_message?: string
  job?: InfrastructureJobRow
}

export type FacilityKey =
  | 'club_house'
  | 'training_center'
  | 'medical_center'
  | 'scouting_office'
  | 'youth_academy'
  | 'mechanics_workshop'

export type AssetKey =
  | 'team_car_fleet'
  | 'team_bus'
  | 'equipment_van'
  | 'mobile_workshop'
  | 'medical_van'

export type StaffRole =
  | 'head_coach'
  | 'trainer'
  | 'u23_head_coach'
  | 'team_doctor'
  | 'physio'
  | 'nutritionist'
  | 'mechanic'
  | 'sport_director'
  | 'scout_analyst'

export type StaffCapacityRow = {
  role_type: StaffRole
  limit_count?: number
  current_capacity?: number
  active_count?: number
  assigned_count?: number
  open_slots?: number
  can_hire?: boolean
  is_hireable?: boolean
  locked_reason?: string | null
  gameplay_status?: string | null
}

export type CoachingEffectRow = {
  staff_id: string | null
  staff_name: string | null
  specialization: string | null
  training_efficiency_multiplier: string | number | null
  development_multiplier: string | number | null
  overload_risk_multiplier: string | number | null
  youth_dev_multiplier: string | number | null
}

export type MedicalEffectRow = {
  staff_id: string | null
  staff_name: string | null
  specialization: string | null
  risk_multiplier: string | number | null
  recovery_duration_multiplier: string | number | null
  daily_recovery_bonus: number | null
  fatigue_floor_reduction: number | null
}

export type FacilityUpgradeConfigRow = {
  facility_key: FacilityKey
  target_level: number
  cost_cash: number
  duration_game_days: number
  unlock_summary: string
  effect_summary: string
}

export type InfrastructureAssetConfigRow = {
  asset_key: InfrastructureAssetRpcKey
  asset_level: number
  asset_name: string
  cost_cash: number
  delivery_game_days: number
  support_value: string | number
  max_total_quantity: number
  unlock_summary: string
  effect_summary: string
  condition_loss_per_race_day?: string | number
  repair_cost_per_condition_point?: number
  repair_points_per_game_day?: string | number
  min_assign_condition_percent?: string | number
  max_assigned_per_event?: number
}

export type TeamCarGarageSummaryRow = {
  club_id: string
  total_cars: number
  max_total_cars: number
  available_cars: number
  assigned_cars: number
  in_repair_cars: number
  pending_delivery_cars: number
  best_available_support_score: string | number
  max_race_support_score: string | number
  best_available_support_ratio: string | number
  support_tier: string
  mechanical_response_bonus_pct: string | number
  feeding_support_bonus_pct: string | number
  tactical_communication_bonus_pct: string | number
  incident_time_loss_reduction_pct: string | number
  race_fatigue_reduction_pct: string | number
  max_assigned_per_event: number
}

export type TeamCarRosterRow = {
  car_id: string
  club_id: string
  garage_slot: number
  display_name: string
  asset_level: number
  asset_name: string
  purchase_cost_cash: number
  support_value: string | number
  condition_percent: string | number
  condition_status: string
  condition_factor: string | number
  effective_support_value: string | number
  status: 'available' | 'assigned' | 'in_repair' | 'sold'
  total_race_days: number
  total_distance_km: string | number
  last_used_game_date: string | null
  acquired_game_date: string | null
  current_assignment_type: string | null
  current_assignment_id: string | null
  current_assignment_label: string | null
  assignment_locked: boolean
  assignment_start_game_date: string | null
  assignment_end_game_date: string | null
  repair_started_game_date?: string | null
  repair_complete_game_date?: string | null
  repair_duration_game_days?: number | null
  metadata?: Record<string, unknown> | null
  condition_loss_per_race_day: string | number
  repair_cost_per_condition_point: number
  repair_points_per_game_day: string | number
  min_assign_condition_percent: string | number
  max_assigned_per_event: number
}

export type TeamBusGarageSummaryRow = {
  club_id: string
  total_buses: number
  max_total_buses: number
  available_buses: number
  assigned_buses: number
  in_repair_buses: number
  pending_delivery_buses: number
  best_available_support_score: string | number
  max_event_support_score: string | number
  best_available_support_ratio: string | number
  support_tier: string
  one_day_fatigue_reduction_pct: string | number
  short_tour_fatigue_reduction_pct: string | number
  long_tour_fatigue_reduction_pct: string | number
  recovery_comfort_bonus_pct: string | number
  max_assigned_per_event: number
}

export type TeamBusRosterRow = {
  bus_id: string
  club_id: string
  garage_slot: number
  display_name: string
  asset_level: number
  asset_name: string
  purchase_cost_cash: number
  support_value: string | number
  condition_percent: string | number
  condition_status: string
  condition_factor: string | number
  effective_support_value: string | number
  status: 'available' | 'assigned' | 'in_repair' | 'sold'
  total_race_days: number
  total_distance_km: string | number
  last_used_game_date: string | null
  acquired_game_date: string | null
  current_assignment_type: string | null
  current_assignment_id: string | null
  current_assignment_label: string | null
  assignment_locked: boolean
  assignment_start_game_date: string | null
  assignment_end_game_date: string | null
  repair_started_game_date?: string | null
  repair_complete_game_date?: string | null
  repair_duration_game_days?: number | null
  metadata?: Record<string, unknown> | null
  condition_loss_per_race_day: string | number
  repair_cost_per_condition_point: number
  repair_points_per_game_day: string | number
  min_assign_condition_percent: string | number
  max_assigned_per_event: number
}

export type MedicalVanGarageSummaryRow = {
  club_id: string
  total_vans: number
  max_total_vans: number
  available_vans: number
  assigned_vans: number
  in_repair_vans: number
  pending_delivery_vans: number
  best_available_support_score: string | number
  max_event_support_score: string | number
  best_available_support_ratio: string | number
  support_tier: string
  medical_response_bonus_pct: string | number
  minor_injury_risk_reduction_pct: string | number
  hydration_support_bonus_pct: string | number
  post_stage_recovery_bonus_pct: string | number
  max_assigned_per_event: number
}

export type MedicalVanRosterRow = {
  van_id: string
  club_id: string
  garage_slot: number
  display_name: string
  asset_level: number
  asset_name: string
  purchase_cost_cash: number
  support_value: string | number
  condition_percent: string | number
  condition_status: string
  condition_factor: string | number
  effective_support_value: string | number
  status: 'available' | 'assigned' | 'in_repair' | 'sold'
  total_race_days: number
  total_distance_km: string | number
  last_used_game_date: string | null
  acquired_game_date: string | null
  current_assignment_type: string | null
  current_assignment_id: string | null
  current_assignment_label: string | null
  assignment_locked: boolean
  assignment_start_game_date: string | null
  assignment_end_game_date: string | null
  condition_loss_per_race_day: string | number
  repair_cost_per_condition_point: number
  repair_points_per_game_day: string | number
  min_assign_condition_percent: string | number
  max_assigned_per_event: number
}

export type FacilityImpactKind =
  | 'club'
  | 'coaching'
  | 'medical'
  | 'scouting'
  | 'youth'
  | 'mechanics'

export type InfrastructureItem = {
  type: 'facility' | 'asset'
  id: FacilityKey | AssetKey
  name: string
  description: string
  longDescription?: string
  imageUrl?: string | null
  currentValue: number
  maxValue?: number
  owned: boolean
  canAct: boolean
  actionLabel: string
  badgeLabel: string
  valueLabel: string
  pendingJob: InfrastructureJobRow | null
  pendingSummary: string | null
  previewCostCash: number | null
  previewDurationGameDays: number | null
  previewCompleteGameDate: string | null
  nextValueLabel: string | null
  unlockSummary?: string | null
  effectSummary?: string | null
  impactKind?: FacilityImpactKind
  impactLines?: string[]
}

export type ActiveJobView = {
  id: string
  name: string
  summary: string
  completeAt: string
  completeGameDate: string | null
  durationGameDays: number | null
  costCash: number
  type: InfrastructureJobType
}