/**
 * src/features/squad/types.ts
 *
 * Shared squad-related domain and UI types used by:
 * - Squad page
 * - Developing Team page
 * - Staff-adjacent squad widgets/modals
 * - Shared squad helpers/components
 */

export type RiderRole =
  | 'Leader'
  | 'Sprinter'
  | 'Climber'
  | 'TT'
  | 'Domestique'
  | 'Breakaway'
  | 'All-rounder'

export type MoraleUiLabel = 'Bad' | 'Low' | 'Okay' | 'Good' | 'Great'

export type PotentialUiLabel = 'Limited' | 'Average' | 'Promising' | 'High' | 'Elite'

export type FatigueUiLabel = 'Fresh' | 'Normal' | 'Tired' | 'Very Tired' | 'Exhausted'

/**
 * UI/backend rider availability status.
 *
 * Keep the full union shared across pages so Squad and Developing Team
 * do not drift into incompatible versions.
 */
export type RiderAvailabilityStatus = 'fit' | 'not_fully_fit' | 'injured' | 'sick'

export type TeamType = 'first' | 'developing'

/**
 * Minimal row returned from public.club_roster, optionally enriched in UI
 * with rider birth date / fatigue / availability data.
 */
export type ClubRosterRow = {
  club_id: string
  rider_id: string
  display_name: string
  country_code: string
  assigned_role: RiderRole
  age_years: number
  overall: number
  availability_status?: RiderAvailabilityStatus | null
  fatigue?: number | null
  birth_date?: string | null
}

/**
 * Current active/recovering health case for a rider.
 * Returned by get_rider_current_health_case().
 */
export type RiderCurrentHealthCase = {
  rider_id: string
  availability_status: RiderAvailabilityStatus
  fatigue: number
  unavailable_until: string | null
  unavailable_reason: string | null
  health_case_id: string | null
  case_type: 'injury' | 'sickness' | null
  case_code: string | null
  severity: 'minor' | 'moderate' | 'major' | null
  source: string | null
  case_status: 'active' | 'recovering' | 'resolved' | null
  started_on: string | null
  active_until: string | null
  recovery_until: string | null
  resolved_on: string | null
  selection_blocked: boolean | null
  training_blocked: boolean | null
  development_blocked: boolean | null
  expected_full_recovery_on: string | null
}

/**
 * Row returned by get_club_health_overview().
 */
export type ClubHealthOverviewRow = {
  rider_id: string
  display_name: string
  country_code: string
  overall: number
  fatigue: number
  availability_status: RiderAvailabilityStatus
  unavailable_until: string | null
  unavailable_reason: string | null
  health_case_id: string | null
  case_type: 'injury' | 'sickness' | null
  case_code: string | null
  severity: 'minor' | 'moderate' | 'major' | null
  source: string | null
  case_status: 'active' | 'recovering' | 'resolved' | null
  started_on: string | null
  active_until: string | null
  recovery_until: string | null
  expected_full_recovery_on: string | null
}

/**
 * Detailed rider payload loaded from public.riders.
 */
export type RiderDetails = {
  id: string
  country_code: string
  first_name: string
  last_name: string
  display_name: string
  role: RiderRole
  sprint: number
  climbing: number
  time_trial: number
  endurance: number
  flat: number
  recovery: number
  resistance: number
  race_iq: number
  teamwork: number
  morale: number
  potential: number
  fatigue?: number | null
  overall: number
  birth_date: string
  image_url?: string | null
  salary?: number | null
  contract_expires_at?: string | null
  contract_expires_season?: number | null
  market_value?: number | null
  asking_price?: number | null
  asking_price_manual?: boolean | null
  availability_status?: RiderAvailabilityStatus | null
  unavailable_until?: string | null
  unavailable_reason?: string | null
}

/**
 * Developing Team unlock/purchase/status payload.
 * Returned by get_developing_team_status().
 */
export type DevelopingTeamStatus = {
  main_club_id: string | null
  main_club_name: string | null
  developing_club_id: string | null
  developing_club_name: string | null
  is_purchased: boolean
  real_days_played: number
  game_days_played: number
  time_requirement_met: boolean
  coin_balance: number
  coin_cost: number
  coin_requirement_met: boolean
  can_purchase: boolean
  movement_window_open: boolean
  current_window_label: string | null
  next_window_label: string | null
}

/**
 * Exact payload used by backend contract renewal negotiation flow.
 */
export type ContractRenewalNegotiation = {
  negotiation_id: string
  rider_id: string
  club_id: string
  current_salary_weekly: number
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  current_contract_end_season: number
  current_contract_expires_at?: string | null
  requested_extension_seasons: number
  proposed_new_end_season: number
  attempt_count: number
  max_attempts: number
}

/**
 * UI-normalized renewal negotiation data used in the renewal modal.
 */
export type RenewalNegotiationData = {
  negotiation_id: string
  rider_id: string
  club_id: string
  current_salary_weekly: number
  expected_salary_weekly: number
  min_acceptable_salary_weekly: number
  current_contract_end_season: number
  requested_extension_seasons: number
  current_contract_expires_at?: string | null
  attempt_count: number
  max_attempts: number
  cooldown_until?: string | null
}

/**
 * Generic chart point used by lightweight SVG widgets.
 */
export type ChartPoint = {
  label: string
  value: number
}

/**
 * Derived movement window info based on current game date.
 */
export type MovementWindowInfo = {
  isOpen: boolean
  currentWindowLabel: string | null
  nextWindowLabel: string
}
