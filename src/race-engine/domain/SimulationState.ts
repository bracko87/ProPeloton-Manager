/**
 * SimulationState.ts
 *
 * Complete immutable runtime state for one deterministic stage simulation.
 *
 * The original StageInput is preserved on the state so all deterministic
 * simulation rules can access stage configuration, terrain profile data,
 * settings, teams, riders, and orders without external dependencies.
 */

import type { GroupState } from './GroupState'
import type { RaceEvent } from './RaceEvent'
import type { RiderState } from './RiderState'
import type { StageInput } from './StageInput'
import type { TeamOrder } from './TeamOrder'
import type { TeamState } from './TeamState'

export interface SimulationState {
  /**
   * Complete immutable input used to construct this simulation.
   */
  readonly input: StageInput

  readonly raceId: string
  readonly stageId: string
  readonly seed: string

  readonly raceSecond: number
  readonly currentKm: number
  readonly stageDistanceKm: number

  readonly riders: Readonly<Record<string, RiderState>>
  readonly teams: Readonly<Record<string, TeamState>>
  readonly groups: Readonly<Record<string, GroupState>>
  readonly orders: Readonly<Record<string, TeamOrder>>
  readonly events: readonly RaceEvent[]

  readonly nextEventSequenceNumber: number
  readonly nextBreakawayNumber: number
  readonly nextChaseNumber: number
  readonly nextDroppedGroupNumber: number

  readonly finalSprintStarted: boolean
  readonly completed: boolean
}