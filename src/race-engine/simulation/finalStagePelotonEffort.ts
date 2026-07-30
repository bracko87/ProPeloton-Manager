/**
 * finalStagePelotonEffort.ts
 *
 * Pure deterministic calculation for increased peloton effort during the
 * final 30% of a stage.
 *
 * This helper does not mutate simulation state, calculate terrain movement,
 * consume energy, create groups, or activate authoritative execution.
 */

import type {
  GroupType,
} from '../domain/GroupState'

export interface FinalStagePelotonEffortInput {
  readonly groupType:
    GroupType

  readonly currentDistanceKm:
    number

  readonly stageDistanceKm:
    number

  readonly averageTeamwork:
    number

  readonly averageEnergy:
    number
}

export interface FinalStagePelotonEffortResult {
  readonly groupType:
    GroupType

  readonly currentDistanceKm:
    number

  readonly stageDistanceKm:
    number

  readonly stageProgress:
    number

  readonly finalStageStartProgress:
    number

  readonly finalStageProgress:
    number

  readonly averageTeamwork:
    number

  readonly averageEnergy:
    number

  readonly teamworkFactor:
    number

  readonly energyFactor:
    number

  readonly maximumEffortBonusPercent:
    number

  readonly effortBonusPercent:
    number

  readonly effortMultiplier:
    number
}

const FINAL_STAGE_START_PROGRESS =
  0.7

const MAXIMUM_EFFORT_BONUS_PERCENT =
  3

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateFinalStagePelotonEffort: ${fieldName} must be finite.`,
    )
  }
}

function clamp01(
  value: number,
): number {
  return Math.min(
    1,
    Math.max(
      0,
      value,
    ),
  )
}

/**
 * Calculates a bounded final-stage effort multiplier.
 *
 * Rules:
 * - Only active peloton groups receive the effort increase.
 * - No increase is applied before 70% stage completion.
 * - The increase ramps linearly from 70% to the finish.
 * - Strong teamwork increases the usable effort.
 * - Low remaining energy limits the effort.
 * - The total speed bonus cannot exceed 3%.
 */
export function calculateFinalStagePelotonEffort(
  input:
    FinalStagePelotonEffortInput,
): FinalStagePelotonEffortResult {
  const {
    groupType,
    currentDistanceKm,
    stageDistanceKm,
    averageTeamwork,
    averageEnergy,
  } = input

  assertFinite(
    currentDistanceKm,
    'currentDistanceKm',
  )

  assertFinite(
    stageDistanceKm,
    'stageDistanceKm',
  )

  assertFinite(
    averageTeamwork,
    'averageTeamwork',
  )

  assertFinite(
    averageEnergy,
    'averageEnergy',
  )

  if (stageDistanceKm <= 0) {
    throw new Error(
      'calculateFinalStagePelotonEffort: stageDistanceKm must be greater than 0.',
    )
  }

  if (
    currentDistanceKm < 0 ||
    currentDistanceKm >
      stageDistanceKm
  ) {
    throw new Error(
      'calculateFinalStagePelotonEffort: currentDistanceKm must be between 0 and stageDistanceKm.',
    )
  }

  if (
    averageTeamwork < 0 ||
    averageTeamwork > 100
  ) {
    throw new Error(
      'calculateFinalStagePelotonEffort: averageTeamwork must be between 0 and 100.',
    )
  }

  if (
    averageEnergy < 0 ||
    averageEnergy > 100
  ) {
    throw new Error(
      'calculateFinalStagePelotonEffort: averageEnergy must be between 0 and 100.',
    )
  }

  const stageProgress =
    currentDistanceKm /
    stageDistanceKm

  const finalStageProgress =
    clamp01(
      (
        stageProgress -
        FINAL_STAGE_START_PROGRESS
      ) /
        (
          1 -
          FINAL_STAGE_START_PROGRESS
        ),
    )

  const teamworkFactor =
    0.5 +
    clamp01(
      averageTeamwork /
        100,
    ) *
      0.5

  const energyFactor =
    0.4 +
    clamp01(
      averageEnergy /
        100,
    ) *
      0.6

  const pelotonEligible =
    groupType ===
    'peloton'

  const effortBonusPercent =
    pelotonEligible
      ? MAXIMUM_EFFORT_BONUS_PERCENT *
        finalStageProgress *
        teamworkFactor *
        energyFactor
      : 0

  const effortMultiplier =
    1 +
    effortBonusPercent /
      100

  return {
    groupType,
    currentDistanceKm,
    stageDistanceKm,
    stageProgress,
    finalStageStartProgress:
      FINAL_STAGE_START_PROGRESS,
    finalStageProgress,
    averageTeamwork,
    averageEnergy,
    teamworkFactor,
    energyFactor,
    maximumEffortBonusPercent:
      MAXIMUM_EFFORT_BONUS_PERCENT,
    effortBonusPercent,
    effortMultiplier,
  }
}