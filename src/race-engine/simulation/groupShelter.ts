/**
 * groupShelter.ts
 *
 * Pure deterministic shelter bonus calculation for a rider inside a race
 * group.
 *
 * This utility is currently inactive. It is used only by the Phase 7B.3
 * development diagnostic and does not change movement or group membership.
 */

import type {
  GroupType,
} from '../domain/GroupState'

export interface GroupShelterInput {
  readonly groupType: GroupType
  readonly groupSize: number
  readonly gradientPercent: number
}

export interface GroupShelterResult {
  readonly groupType: GroupType
  readonly groupSize: number
  readonly gradientPercent: number
  readonly maximumShelterBonus: number
  readonly sizeFactor: number
  readonly terrainFactor: number
  readonly groupTypeFactor: number
  readonly shelterBonus: number
}

const MAXIMUM_SHELTER_BONUS =
  10

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateGroupShelter: ${fieldName} must be finite.`,
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
  if (groupType === 'peloton') {
    return 1
  }

  if (groupType === 'chase') {
    return 0.8
  }

  if (groupType === 'dropped') {
    return 0.65
  }

  if (groupType === 'breakaway') {
    return 0.45
  }

  return 0
}

/**
 * Diagnostic shelter rules:
 *
 * - A solo rider receives no shelter.
 * - Shelter grows with group size and reaches its maximum by 32 riders.
 * - Uphill gradients progressively reduce shelter.
 * - At +8% and above, only 25% of flat-road shelter remains.
 * - Pelotons provide the most shelter; small tactical groups provide less.
 */
export function calculateGroupShelter(
  input: GroupShelterInput,
): GroupShelterResult {
  const {
    groupType,
    groupSize,
    gradientPercent,
  } = input

  if (
    !Number.isInteger(
      groupSize,
    ) ||
    groupSize <= 0
  ) {
    throw new Error(
      'calculateGroupShelter: groupSize must be a positive integer.',
    )
  }

  assertFinite(
    gradientPercent,
    'gradientPercent',
  )

  if (
    gradientPercent < -30 ||
    gradientPercent > 30
  ) {
    throw new Error(
      'calculateGroupShelter: gradientPercent must be between -30 and 30.',
    )
  }

  const sizeFactor =
    groupSize === 1
      ? 0
      : clamp01(
          Math.log2(
            groupSize,
          ) /
            Math.log2(32),
        )

  const uphillFactor =
    clamp01(
      gradientPercent / 8,
    )

  const terrainFactor =
    1 -
    uphillFactor * 0.75

  const groupTypeFactor =
    getGroupTypeFactor(
      groupType,
    )

  const shelterBonus =
    MAXIMUM_SHELTER_BONUS *
    sizeFactor *
    terrainFactor *
    groupTypeFactor

  return {
    groupType,
    groupSize,
    gradientPercent,
    maximumShelterBonus:
      MAXIMUM_SHELTER_BONUS,
    sizeFactor,
    terrainFactor,
    groupTypeFactor,
    shelterBonus,
  }
}
