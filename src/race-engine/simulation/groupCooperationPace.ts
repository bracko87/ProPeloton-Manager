/**
 * groupCooperationPace.ts
 *
 * Pure deterministic shared-effort pace modifier for an organized race group.
 *
 * This helper does not mutate state or move riders. It remains inactive until
 * an explicit movement feature flag connects it to calculateMultiGroupMovement.
 */

import type {
  GroupType,
} from '../domain/GroupState'

export interface GroupCooperationPaceInput {
  readonly groupType: GroupType
  readonly groupSize: number
  readonly averageTeamwork: number
  readonly gradientPercent: number
}

export interface GroupCooperationPaceResult {
  readonly groupType: GroupType
  readonly groupSize: number
  readonly averageTeamwork: number
  readonly gradientPercent: number

  readonly maximumPaceBonusPercent:
    number
  readonly sizeFactor: number
  readonly teamworkFactor: number
  readonly terrainFactor: number
  readonly groupTypeFactor: number

  readonly paceBonusPercent: number
  readonly paceMultiplier: number
}

const MAXIMUM_PACE_BONUS_PERCENT =
  3

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateGroupCooperationPace: ${fieldName} must be finite.`,
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

function getGroupTypeFactor(
  groupType: GroupType,
): number {
  if (groupType === 'chase') {
    return 1
  }

  if (groupType === 'peloton') {
    return 0.9
  }

  if (groupType === 'breakaway') {
    return 0.75
  }

  if (groupType === 'dropped') {
    return 0.4
  }

  return 0
}

/**
 * Calculates a small capped pace benefit from organized shared effort.
 *
 * Rules:
 * - Solo riders receive no cooperation bonus.
 * - The group-size contribution reaches its maximum at eight riders.
 * - Teamwork below 40 produces no organized pace benefit.
 * - Maximum teamwork contribution is reached at 100.
 * - Uphill gradients reduce the benefit.
 * - At +8% and above, only 25% of the flat-road benefit remains.
 * - Descents cannot provide more cooperation benefit than flat terrain.
 * - Chase groups receive the strongest shared-effort factor.
 * - The absolute pace increase is capped at 3%.
 */
export function calculateGroupCooperationPace(
  input:
    GroupCooperationPaceInput,
): GroupCooperationPaceResult {
  const {
    groupType,
    groupSize,
    averageTeamwork,
    gradientPercent,
  } = input

  if (
    !Number.isInteger(
      groupSize,
    ) ||
    groupSize <= 0
  ) {
    throw new Error(
      'calculateGroupCooperationPace: groupSize must be a positive integer.',
    )
  }

  assertFinite(
    averageTeamwork,
    'averageTeamwork',
  )

  assertFinite(
    gradientPercent,
    'gradientPercent',
  )

  if (
    averageTeamwork < 0 ||
    averageTeamwork > 100
  ) {
    throw new Error(
      'calculateGroupCooperationPace: averageTeamwork must be between 0 and 100.',
    )
  }

  if (
    gradientPercent < -30 ||
    gradientPercent > 30
  ) {
    throw new Error(
      'calculateGroupCooperationPace: gradientPercent must be between -30 and 30.',
    )
  }

  const sizeFactor =
    groupSize === 1
      ? 0
      : clamp01(
          Math.log2(
            groupSize,
          ) /
            Math.log2(8),
        )

  const teamworkFactor =
    clamp01(
      (
        averageTeamwork -
        40
      ) /
        60,
    )

  const uphillFactor =
    clamp01(
      gradientPercent /
        8,
    )

  const terrainFactor =
    1 -
    uphillFactor *
      0.75

  const groupTypeFactor =
    getGroupTypeFactor(
      groupType,
    )

  const paceBonusPercent =
    MAXIMUM_PACE_BONUS_PERCENT *
    sizeFactor *
    teamworkFactor *
    terrainFactor *
    groupTypeFactor

  return {
    groupType,
    groupSize,
    averageTeamwork,
    gradientPercent,

    maximumPaceBonusPercent:
      MAXIMUM_PACE_BONUS_PERCENT,
    sizeFactor,
    teamworkFactor,
    terrainFactor,
    groupTypeFactor,

    paceBonusPercent,
    paceMultiplier:
      1 +
      paceBonusPercent /
        100,
  }
}