/**
 * replayTypes.ts
 *
 * Generic, presentation-facing replay contracts.
 *
 * These types intentionally do not import React, Supabase, database row types,
 * Rio fixtures, or deterministic race-engine modules. A later pure adapter may
 * map authoritative SimulationOutput data into this model.
 *
 * Important rule:
 * - Values that are unavailable from the authoritative source remain null.
 * - The UI must not invent rider state, group membership, gaps, rankings,
 *   stamina, fatigue, or finish information.
 */

/**
 * ReplayStageFormat
 *
 * Stage formats supported by the generic replay view model.
 */
export type ReplayStageFormat =
  | 'road_race'
  | 'individual_time_trial'
  | 'team_time_trial'
  | 'pair_time_trial'
  | 'prologue'

/**
 * ReplayRiderStatus
 *
 * Lifecycle state of one rider at a replay frame or in the final result.
 */
export type ReplayRiderStatus =
  | 'not_started'
  | 'racing'
  | 'finished'
  | 'dnf'
  | 'dns'

/**
 * ReplayGroupType
 *
 * Semantic group identity supplied by the authoritative replay source.
 */
export type ReplayGroupType =
  | 'peloton'
  | 'breakaway'
  | 'chase'
  | 'dropped'
  | 'finished'
  | 'time_trial'

/**
 * ReplayPlaybackSpeed
 *
 * User-selectable presentation speed. The controller should interpret these
 * values literally unless product design explicitly documents otherwise.
 */
export type ReplayPlaybackSpeed = 1 | 2 | 4 | 8

/**
 * ReplayProfilePoint
 *
 * Immutable elevation sample used only to draw the stage profile.
 */
export interface ReplayProfilePoint {
  readonly kilometre: number
  readonly elevationMetres: number
}

/**
 * ReplayRiderFrame
 *
 * Authoritative rider state at one replay frame.
 *
 * Nullable metrics are intentionally explicit. An adapter must preserve null
 * when the source output does not provide the value.
 */
export interface ReplayRiderFrame {
  readonly riderId: string
  readonly teamId: string
  readonly riderName: string
  readonly teamName: string

  readonly status: ReplayRiderStatus
  readonly groupId: string | null

  readonly distanceKm: number
  readonly speedKmh: number | null

  readonly gapToLeaderSeconds: number | null
  readonly gapToPreviousRiderSeconds: number | null

  readonly position: number | null

  readonly staminaPercent: number | null
  readonly fatiguePercent: number | null

  readonly finishTimeSeconds: number | null
  readonly finishPosition: number | null
}

/**
 * ReplayGroupFrame
 *
 * Authoritative group state at one replay frame.
 */
export interface ReplayGroupFrame {
  readonly groupId: string
  readonly type: ReplayGroupType
  readonly label: string
  readonly order: number

  readonly riderIds: readonly string[]

  readonly distanceKm: number
  readonly speedKmh: number | null
  readonly gapToLeaderSeconds: number
  readonly gapToPreviousGroupSeconds: number | null

  readonly active: boolean
}

/**
 * ReplayFrame
 *
 * Complete presentation snapshot at one simulated race time.
 */
export interface ReplayFrame {
  readonly frameNumber: number
  readonly raceSecond: number
  readonly progress: number
  readonly leaderDistanceKm: number

  readonly riders: readonly ReplayRiderFrame[]
  readonly groups: readonly ReplayGroupFrame[]

  readonly eventSequenceNumbers: readonly number[]
}

/**
 * ReplayEvent
 *
 * Deterministic race event plus optional presentation copy.
 *
 * title and description are allowed only as display text. Sporting meaning
 * remains in type, identifiers, timing, distance, and payload.
 */
export interface ReplayEvent {
  readonly id: string
  readonly sequenceNumber: number
  readonly type: string

  readonly raceSecond: number
  readonly kilometre: number

  readonly actorRiderId: string | null
  readonly teamId: string | null
  readonly sourceGroupId: string | null
  readonly targetGroupId: string | null
  readonly riderIds: readonly string[]

  readonly title: string | null
  readonly description: string | null

  readonly payload: Readonly<Record<string, unknown>>
}

/**
 * ReplayFinalResult
 *
 * Authoritative final outcome for one rider.
 */
export interface ReplayFinalResult {
  readonly riderId: string
  readonly teamId: string
  readonly riderName: string
  readonly teamName: string

  readonly status: ReplayRiderStatus
  readonly finishTimeSeconds: number | null
  readonly finishPosition: number | null
}

/**
 * ReplayStageModel
 *
 * Generic replay model consumed by the future replay UI.
 */
export interface ReplayStageModel {
  readonly contractVersion: 'race_replay_view_model_v1'

  readonly raceId: string
  readonly stageId: string
  readonly stageName: string
  readonly stageFormat: ReplayStageFormat
  readonly distanceKm: number

  readonly engineVersion: string
  readonly simulationMode: string
  readonly seed: string

  readonly durationSeconds: number
  readonly profilePoints: readonly ReplayProfilePoint[]

  readonly frames: readonly ReplayFrame[]
  readonly events: readonly ReplayEvent[]
  readonly finalResults: readonly ReplayFinalResult[]
}

/**
 * ReplayPlaybackState
 *
 * Presentation-only controller state. It contains no sporting calculations.
 */
export interface ReplayPlaybackState {
  readonly playing: boolean
  readonly speed: ReplayPlaybackSpeed
  readonly currentFrameIndex: number
  readonly currentRaceSecond: number
  readonly progress: number
  readonly completed: boolean
}

/**
 * ReplayValidationIssue
 *
 * One runtime validation failure with a stable machine-readable code.
 */
export interface ReplayValidationIssue {
  readonly code: string
  readonly path: string
  readonly message: string
}

/**
 * ReplayValidationResult
 *
 * Result returned by validateReplayStageModel().
 */
export interface ReplayValidationResult {
  readonly valid: boolean
  readonly issues: readonly ReplayValidationIssue[]
}
