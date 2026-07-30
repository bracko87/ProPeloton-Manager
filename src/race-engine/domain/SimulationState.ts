/**
 * SimulationState.ts
 *
 * Complete immutable runtime state for one deterministic stage simulation.
 *
 * The original StageInput is preserved on the state so all deterministic
 * simulation rules can access stage configuration, terrain profile data,
 * settings, teams, riders, orders, and weather without external dependencies.
 */

import type {
  GroupState,
} from './GroupState'
import type {
  RaceEvent,
} from './RaceEvent'
import type {
  RiderState,
} from './RiderState'
import type {
  StageInput,
} from './StageInput'
import type {
  TeamOrder,
} from './TeamOrder'
import type {
  TeamState,
} from './TeamState'

export interface IndividualCrashRuntimeState {
  readonly enabled: true
  readonly occurrenceIndex: number
  readonly crashCount: number
  readonly maximumCrashesPerStage: number
  readonly globalCooldownSeconds: number
  readonly riderCooldownSeconds: number
  readonly globalCooldownSecondsRemaining: number
  readonly cooldownSecondsRemainingByRiderId:
    Readonly<Record<string, number>>
  readonly crashedRiderIds:
    readonly string[]
}

export type ActiveCrashIncidentKind =
  | 'individual_crash'
  | 'group_crash'

export type ActiveRaceIncidentKind =
  | ActiveCrashIncidentKind
  | 'technical_incident'

/**
 * Shared state-owned runtime for mixed individual/group crash evaluation.
 *
 * It is separate from IndividualCrashRuntimeState so the accepted Phase 8H.2B
 * development wrapper and its deterministic hashes remain unchanged.
 */
export interface CrashIncidentRuntimeState {
  readonly enabled: true

  readonly enabledIncidentKinds:
    readonly ActiveCrashIncidentKind[]

  readonly occurrenceIndex: number
  readonly incidentCount: number
  readonly individualCrashCount: number
  readonly groupCrashCount: number
  readonly maximumIncidentsPerStage: number

  readonly globalCooldownSeconds: number
  readonly riderCooldownSeconds: number

  readonly globalCooldownSecondsRemaining: number
  readonly cooldownSecondsRemainingByRiderId:
    Readonly<Record<string, number>>

  readonly affectedRiderIds:
    readonly string[]
}

/**
 * State-owned runtime for the Phase 8H.5B shared individual/group/technical
 * incident selector.
 *
 * This is separate from CrashIncidentRuntimeState so the accepted Phase 8H.3B
 * wrapper and deterministic references remain unchanged.
 */
export interface RaceIncidentRuntimeState {
  readonly enabled: true

  readonly enabledIncidentKinds:
    readonly ActiveRaceIncidentKind[]

  readonly occurrenceIndex: number
  readonly incidentCount: number
  readonly individualCrashCount: number
  readonly groupCrashCount: number
  readonly technicalIncidentCount: number
  readonly maximumIncidentsPerStage: number

  readonly globalCooldownSeconds: number
  readonly riderCooldownSeconds: number

  readonly globalCooldownSecondsRemaining: number
  readonly cooldownSecondsRemainingByRiderId:
    Readonly<Record<string, number>>

  readonly affectedRiderIds:
    readonly string[]
}

export interface SimulationState {
  readonly input: StageInput

  readonly weatherPerformanceEffectsEnabled?:
    boolean

  /**
   * Enables deterministic group-shelter energy savings.
   *
   * Omitted or false preserves the existing rider-energy calculation exactly.
   * Development and calibrated runners may opt in explicitly before this
   * behavior is considered for authoritative execution.
   */
  readonly groupShelterEnergyEnabled?:
    boolean

  /**
   * Enables deterministic shared-effort pace adjustments for organized groups.
   *
   * Omitted or false preserves the existing movement calculation exactly.
   * Development and calibrated runners may opt in explicitly before this
   * behavior is considered for authoritative execution.
   */
  readonly groupCooperationPaceEnabled?:
    boolean

  /**
   * Enables bounded, terrain-aware attack launch speed.
   *
   * Omitted or false preserves the legacy fixed +4 km/h launch behavior.
   * Development and calibrated runners may opt in explicitly before this
   * behavior becomes authoritative.
   */
  readonly controlledAttackLaunchEnabled?:
    boolean

  /**
   * Enables a bounded peloton effort increase during the final 30% of a stage.
   *
   * Omitted or false preserves the existing movement calculation exactly.
   * Development and calibrated runners may opt in explicitly before this
   * behavior becomes authoritative.
   */
  readonly finalStagePelotonEffortEnabled?:
    boolean

  /**
   * Enables a bounded organized chase-group pace increase on flat and
   * sprint-suitable road stages.
   *
   * Omitted or false preserves the existing movement calculation exactly.
   * Development and calibrated runners may opt in explicitly before this
   * behavior becomes authoritative.
   */
  readonly flatStageChaseEffortEnabled?:
    boolean

  /**
   * Present only for the Phase 8H.2B individual-only development runner.
   */
  readonly individualCrashRuntime?:
    IndividualCrashRuntimeState

  /**
   * Present only for the Phase 8H.3B shared crash development runner.
   */
  readonly crashIncidentRuntime?:
    CrashIncidentRuntimeState

  /**
   * Present only for the Phase 8H.5B shared crash/technical development runner.
   */
  readonly raceIncidentRuntime?:
    RaceIncidentRuntimeState

  readonly raceId: string
  readonly stageId: string
  readonly seed: string

  readonly raceSecond: number
  readonly currentKm: number
  readonly stageDistanceKm: number

  readonly riders:
    Readonly<
      Record<
        string,
        RiderState
      >
    >

  readonly teams:
    Readonly<
      Record<
        string,
        TeamState
      >
    >

  readonly groups:
    Readonly<
      Record<
        string,
        GroupState
      >
    >

  readonly orders:
    Readonly<
      Record<
        string,
        TeamOrder
      >
    >

  readonly events:
    readonly RaceEvent[]

  readonly separationPressureSecondsByRiderId:
    Readonly<
      Record<
        string,
        number
      >
    >

  readonly nextEventSequenceNumber: number
  readonly nextBreakawayNumber: number
  readonly nextChaseNumber: number
  readonly nextDroppedGroupNumber: number

  readonly finalSprintStarted: boolean
  readonly completed: boolean
}