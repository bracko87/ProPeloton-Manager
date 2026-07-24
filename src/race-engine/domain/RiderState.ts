/**
 * RiderState.ts
 *
 * Canonical rider domain types used by the deterministic race engine.
 *
 * These definitions match the rider state constructed by createInitialState()
 * and consumed by the active simulation modules.
 */

/**
 * Tactical role assigned to a rider for one stage simulation.
 */
export type RiderRole =
  | 'captain'
  | 'sprinter'
  | 'leadout'
  | 'rouleur'
  | 'domestique'
  | 'breakaway'
  | 'free_role'

/**
 * Lifecycle status of a rider during a stage simulation.
 */
export type RiderRaceStatus =
  | 'not_started'
  | 'racing'
  | 'finished'
  | 'dnf'
  | 'dns'

/**
 * Performance attributes consumed by the deterministic engine.
 *
 * climbing, timeTrial, and raceIq are temporarily optional so older isolated
 * synthetic fixtures continue to compile during the attribute-transport
 * migration. The production-shaped source adapter always supplies them and
 * the development diagnostic verifies all live riders receive them.
 */
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

/**
 * Immutable condition snapshot at the start of one stage.
 *
 * startingEnergy is the canonical runtime energy value.
 * fatigueBeforeStage and morale are preserved as source metadata for later
 * calibrated rules. availabilityStatus is transported without changing the
 * current participant-eligibility policy.
 */
export interface RiderStartingCondition {
  readonly startingEnergy: number
  readonly fatigueBeforeStage: number
  readonly morale: number
  readonly availabilityStatus: string
}

/**
 * Runtime state for one rider during a stage simulation.
 */
export interface RiderState {
  readonly riderId: string
  readonly teamId: string
  readonly riderName: string
  readonly teamName: string

  readonly role: RiderRole
  readonly attributes: RiderAttributes

  /**
   * Present for live condition-aware inputs and absent for legacy synthetic
   * fixtures. The object is copied during initial-state creation.
   */
  readonly startingCondition?: RiderStartingCondition

  readonly currentGroupId: string

  readonly distanceKm: number
  readonly speedKmh: number
  readonly energy: number

  readonly attackAttempts: number

  readonly acceptedOrderIds: readonly string[]
  readonly completedOrderIds: readonly string[]

  readonly stageStatus: RiderRaceStatus
  readonly finished: boolean

  readonly finishTimeSeconds: number | null
  readonly finishPosition: number | null
}
