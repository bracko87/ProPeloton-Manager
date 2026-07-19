import type { RiderAttributes, RiderRole } from './RiderState'
import type { TeamOrder } from './TeamOrder'

export type StageFormat =
  | 'road_race'
  | 'individual_time_trial'
  | 'team_time_trial'
  | 'pair_time_trial'
  | 'prologue'

export interface StageRiderInput {
  readonly id: string
  readonly participationId: string
  readonly teamId: string
  readonly name: string
  readonly role: RiderRole
  readonly attributes: RiderAttributes
}

export interface StageTeamInput {
  readonly id: string
  readonly name: string
  readonly captainRiderId: string
  readonly riderIds: readonly string[]
}

export interface StageInput {
  readonly raceId: string
  readonly stageId: string
  readonly stageFormat: StageFormat
  readonly name: string
  readonly distanceKm: number
  readonly seed: string
  readonly tickSeconds: number
  readonly snapshotIntervalSeconds: number
  readonly maximumBreakawaySize: number
  readonly riders: readonly StageRiderInput[]
  readonly teams: readonly StageTeamInput[]
  readonly orders: readonly TeamOrder[]
}
