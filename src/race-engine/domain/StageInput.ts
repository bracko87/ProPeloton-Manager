/**
 * StageInput.ts
 *
 * Canonical immutable input contracts for one race-stage simulation.
 *
 * The terrain profile contains raw kilometre/elevation points only.
 * Gradient and terrain effects are derived by simulation rules.
 */

import type {
  RiderAttributes,
  RiderRole,
  RiderStartingCondition,
} from './RiderState'
import type {
  StageRiderEquipmentInput,
} from './RiderEquipment'
import type { TeamOrder } from './TeamOrder'

export type {
  StageRiderEquipmentInput,
} from './RiderEquipment'

/**
 * Stage formats supported by the domain contract.
 *
 * The first isolated engine implementation currently executes road_race only,
 * but the broader contract preserves the planned time-trial formats.
 */
export type StageFormat =
  | 'road_race'
  | 'individual_time_trial'
  | 'team_time_trial'
  | 'pair_time_trial'
  | 'prologue'

/**
 * Fixed simulation settings supplied with the stage.
 */
export interface StageSimulationSettings {
  readonly tickSeconds: number
  readonly replaySnapshotIntervalSeconds: number
  readonly maximumBreakawaySize: number
  readonly minimumSpeedKmh: number
  readonly maximumSpeedKmh: number
}

/**
 * Authority used to create the canonical stage-weather input.
 *
 * The live integration prefers the weather snapshot stored directly on the
 * race stage. Profile-detail weather is a deterministic fallback only when
 * the stage snapshot is absent.
 */
export type StageWeatherAuthority =
  | 'stage_weather_snapshot'
  | 'profile_weather_snapshot'

/**
 * Normalized immutable weather metadata for one stage.
 */
export interface StageWeatherInput {
  readonly authority: StageWeatherAuthority
  readonly source: string
  readonly condition: string
  readonly summary: string | null

  readonly averageTemperatureC: number | null
  readonly minimumTemperatureC: number | null
  readonly maximumTemperatureC: number | null
  readonly windSpeedKmh: number | null
  readonly precipitationMm: number | null

  readonly hostCity: string | null
  readonly countryCode: string | null
}

/**
 * Immutable rider input for one stage.
 *
 * condition and equipment remain optional so historical isolated fixtures
 * preserve their exact canonical shape.
 */
export interface StageRiderInput {
  readonly riderId: string
  readonly teamId: string
  readonly riderName: string
  readonly teamName: string
  readonly role: RiderRole
  readonly attributes: RiderAttributes
  readonly condition?: RiderStartingCondition
  readonly equipment?: StageRiderEquipmentInput
}

/**
 * Immutable team input for one stage.
 */
export interface StageTeamInput {
  readonly teamId: string
  readonly teamName: string
  readonly captainRiderId: string
  readonly riderIds: readonly string[]
}

/**
 * Raw elevation sample at a stage kilometre.
 */
export interface StageProfilePoint {
  readonly kilometre: number
  readonly elevationMetres: number
}

/**
 * Complete immutable input for one stage simulation.
 */
export interface StageInput {
  readonly raceId: string
  readonly stageId: string
  readonly stageName: string
  readonly stageFormat: StageFormat
  readonly distanceKm: number
  readonly seed: string
  readonly settings: StageSimulationSettings
  readonly weather?: StageWeatherInput
  readonly teams: readonly StageTeamInput[]
  readonly riders: readonly StageRiderInput[]
  readonly profilePoints: readonly StageProfilePoint[]
  readonly orders: readonly TeamOrder[]
}
