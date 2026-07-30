/**
 * RiderState.ts
 *
 * Canonical rider domain types used by the deterministic race engine.
 */

import type {
  StageRiderEquipmentInput,
} from './RiderEquipment'

export type RiderRole =
  | 'captain'
  | 'sprinter'
  | 'leadout'
  | 'rouleur'
  | 'domestique'
  | 'breakaway'
  | 'free_role'

export type RiderRaceStatus =
  | 'not_started'
  | 'racing'
  | 'finished'
  | 'dnf'
  | 'dns'

export interface RiderAttributes {
  readonly flat: number
  readonly climbing?: number

  readonly sprint: number
  readonly timeTrial?: number
  readonly acceleration: number

  readonly stamina: number
  readonly resistance: number
  readonly recovery: number

  readonly raceIq?: number
  readonly teamwork: number
}

export interface RiderStartingCondition {
  readonly startingEnergy: number
  readonly fatigueBeforeStage: number
  readonly morale: number
  readonly availabilityStatus: string
}

export interface RiderState {
  readonly riderId: string
  readonly teamId: string
  readonly riderName: string
  readonly teamName: string

  readonly role: RiderRole
  readonly attributes: RiderAttributes

  readonly startingCondition?:
    RiderStartingCondition

  /**
   * Immutable start-of-stage equipment snapshot.
   *
   * Phase 8H.4B transports this metadata only. It is not worn down, repaired,
   * damaged, persisted, or used by active stage execution in this phase.
   */
  readonly startingEquipment?:
    StageRiderEquipmentInput

  readonly currentGroupId: string

  readonly distanceKm: number
  readonly speedKmh: number
  readonly energy: number

  readonly runtimeFatigue?: number

  readonly attackAttempts: number

  readonly acceptedOrderIds: readonly string[]
  readonly completedOrderIds: readonly string[]

  readonly stageStatus: RiderRaceStatus
  readonly finished: boolean

  readonly finishTimeSeconds: number | null
  readonly finishPosition: number | null
}
