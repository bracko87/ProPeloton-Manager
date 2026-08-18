/**
 * flatStageChaseEffort.ts
 *
 * Pure deterministic calculation for stronger organized chase-group pace on
 * flat and sprint-suitable road stages.
 *
 * This helper does not mutate simulation state, calculate terrain movement,
 * consume energy, create groups, or activate authoritative execution.
 */

import type {
  GroupType,
} from '../domain/GroupState'
import type {
  StageProfileCategory,
} from './stageProfileCategory'

export interface FlatStageChaseEffortInput {
  readonly groupType:
    GroupType

  readonly profileCategory:
    StageProfileCategory

  readonly currentDistanceKm:
    number

  readonly stageDistanceKm:
    number

  readonly gapFromLeaderSeconds:
    number

  readonly groupSize:
    number

  readonly averageTeamwork:
    number

  readonly averageEnergy:
    number
}

export interface FlatStageChaseEffortResult {
  readonly groupType:
    GroupType

  readonly profileCategory:
    StageProfileCategory

  readonly currentDistanceKm:
    number

  readonly stageDistanceKm:
    number

  readonly stageProgress:
    number

  readonly gapFromLeaderSeconds:
    number

  readonly groupSize:
    number

  readonly averageTeamwork:
    number

  readonly averageEnergy:
    number

  readonly stageProgressFactor:
    number

  readonly gapUrgencyFactor:
    number

  readonly groupSizeFactor:
    number

  readonly teamworkFactor:
    number

  readonly energyFactor:
    number

  readonly maximumChaseBonusPercent:
    number

  readonly chaseBonusPercent:
    number

  readonly chaseMultiplier:
    number
}

const MAXIMUM_CHASE_BONUS_PERCENT =
  4

const MINIMUM_CHASE_GAP_SECONDS =
  5

const FULL_URGENCY_GAP_SECONDS =
  120

const FULL_GROUP_SIZE =
  6

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateFlatStageChaseEffort: ${fieldName} must be finite.`,
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
 * Calculates a bounded organized-chase pace modifier.
 *
 * Rules:
 * - Only chase groups are eligible.
 * - Only flat profiles are eligible.
 * - Groups within five seconds of the leader receive no chase bonus.
 * - Urgency reaches its full value at a 120-second gap.
 * - Larger chase groups cooperate more effectively, capped at six riders.
 * - Teamwork and remaining energy limit the usable bonus.
 * - The bonus grows gradually as the stage progresses.
 * - The maximum total chase bonus is 4%.
 */
export function calculateFlatStageChaseEffort(
  input:
    FlatStageChaseEffortInput,
): FlatStageChaseEffortResult {
  const {
    groupType,
    profileCategory,
    currentDistanceKm,
    stageDistanceKm,
    gapFromLeaderSeconds,
    groupSize,
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
    gapFromLeaderSeconds,
    'gapFromLeaderSeconds',
  )

  assertFinite(
    groupSize,
    'groupSize',
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
      'calculateFlatStageChaseEffort: stageDistanceKm must be greater than 0.',
    )
  }

  if (
    currentDistanceKm < 0 ||
    currentDistanceKm >
      stageDistanceKm
  ) {
    throw new Error(
      'calculateFlatStageChaseEffort: currentDistanceKm must be between 0 and stageDistanceKm.',
    )
  }

  if (gapFromLeaderSeconds < 0) {
    throw new Error(
      'calculateFlatStageChaseEffort: gapFromLeaderSeconds must not be negative.',
    )
  }

  if (
    !Number.isInteger(
      groupSize,
    ) ||
    groupSize <= 0
  ) {
    throw new Error(
      'calculateFlatStageChaseEffort: groupSize must be a positive integer.',
    )
  }

  if (
    averageTeamwork < 0 ||
    averageTeamwork > 100
  ) {
    throw new Error(
      'calculateFlatStageChaseEffort: averageTeamwork must be between 0 and 100.',
    )
  }

  if (
    averageEnergy < 0 ||
    averageEnergy > 100
  ) {
    throw new Error(
      'calculateFlatStageChaseEffort: averageEnergy must be between 0 and 100.',
    )
  }

  const stageProgress =
    currentDistanceKm /
    stageDistanceKm

  /*
   * Chases remain controlled early in the race and become progressively more
   * committed as the stage advances.
   *
   * This factor ranges from 0.5 at the start to 1 at the finish.
   */
  const stageProgressFactor =
    0.5 +
    stageProgress *
      0.5

  const gapUrgencyFactor =
    gapFromLeaderSeconds <=
    MINIMUM_CHASE_GAP_SECONDS
      ? 0
      : clamp01(
          (
            gapFromLeaderSeconds -
            MINIMUM_CHASE_GAP_SECONDS
          ) /
            (
              FULL_URGENCY_GAP_SECONDS -
              MINIMUM_CHASE_GAP_SECONDS
            ),
        )

  const groupSizeFactor =
    clamp01(
      groupSize /
        FULL_GROUP_SIZE,
    )

  /*
   * Even weaker cooperation retains only a limited usable chase effect.
   * Strong teamwork can unlock the full cooperation contribution.
   */
  const teamworkFactor =
    0.4 +
    clamp01(
      averageTeamwork /
        100,
    ) *
      0.6

  /*
   * A low-energy chase can still organize briefly, but it cannot sustain the
   * same pace bonus as a fresh chase group.
   */
  const energyFactor =
    0.3 +
    clamp01(
      averageEnergy /
        100,
    ) *
      0.7

  const eligible =
    groupType ===
      'chase' &&
    profileCategory ===
      'flat'

  const chaseBonusPercent =
    eligible
      ? MAXIMUM_CHASE_BONUS_PERCENT *
        stageProgressFactor *
        gapUrgencyFactor *
        groupSizeFactor *
        teamworkFactor *
        energyFactor
      : 0

  const chaseMultiplier =
    1 +
    chaseBonusPercent /
      100

  return {
    groupType,
    profileCategory,
    currentDistanceKm,
    stageDistanceKm,
    stageProgress,
    gapFromLeaderSeconds,
    groupSize,
    averageTeamwork,
    averageEnergy,
    stageProgressFactor,
    gapUrgencyFactor,
    groupSizeFactor,
    teamworkFactor,
    energyFactor,
    maximumChaseBonusPercent:
      MAXIMUM_CHASE_BONUS_PERCENT,
    chaseBonusPercent,
    chaseMultiplier,
  }
}