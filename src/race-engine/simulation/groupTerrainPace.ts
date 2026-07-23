/**
 * groupTerrainPace.ts
 *
 * Pure deterministic candidate group-pace calculation that blends the current
 * conservative peloton base pace with the group's relative terrain capability.
 *
 * This utility is inactive. It is used only by development diagnostics and is
 * not connected to calculateMultiGroupMovement() or simulateMultiGroupTick().
 */

import type {
  RiderState,
} from '../domain/RiderState'
import {
  calculatePelotonBasePace,
} from './pelotonPace'
import {
  calculateRiderTerrainCapability,
} from './riderTerrainCapability'
import {
  calculateTerrainSpeed,
} from './terrainSpeed'

export interface GroupTerrainPaceInput {
  readonly riders:
    readonly RiderState[]
  readonly gradientPercent: number
  readonly minimumSpeedKmh: number
  readonly maximumSpeedKmh: number

  /**
   * 0 preserves the current movement calculation.
   * 1 applies the full relative terrain-capability ratio.
   */
  readonly terrainCapabilityInfluence: number
}

export interface GroupTerrainPaceResult {
  readonly eligibleRiderCount: number
  readonly gradientPercent: number
  readonly terrainCapabilityInfluence: number

  readonly currentBaseSpeedKmh: number
  readonly averageFlatCapabilityScore: number
  readonly averageTerrainCapabilityScore: number

  readonly rawCapabilityRatio: number
  readonly clampedCapabilityRatio: number
  readonly terrainAdjustmentMultiplier: number

  readonly adjustedBaseSpeedKmh: number
  readonly terrainMultiplier: number
  readonly unclampedAppliedSpeedKmh: number
  readonly appliedSpeedKmh: number
}

const MINIMUM_CAPABILITY_RATIO =
  0.8

const MAXIMUM_CAPABILITY_RATIO =
  1.2

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateGroupTerrainPace: ${fieldName} must be finite.`,
    )
  }
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  )
}

function average(
  values: readonly number[],
): number {
  if (values.length === 0) {
    throw new Error(
      'calculateGroupTerrainPace: at least one capability value is required.',
    )
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0,
  ) / values.length
}

/**
 * Calculates a candidate terrain-aware group speed.
 *
 * The current flat-road behaviour is preserved exactly:
 * - at 0% gradient, current and flat terrain capability are identical;
 * - the capability ratio is therefore 1;
 * - every influence value produces the existing base and applied speed.
 *
 * On non-flat terrain:
 * - each rider is evaluated at 0% and at the current gradient;
 * - the group's average current/flat capability ratio is calculated;
 * - the ratio is safely clamped to 0.8–1.2;
 * - terrainCapabilityInfluence blends between no adjustment and full ratio;
 * - the existing terrainSpeed multiplier is still applied afterward.
 */
export function calculateGroupTerrainPace(
  input:
    GroupTerrainPaceInput,
): GroupTerrainPaceResult {
  const {
    riders,
    gradientPercent,
    minimumSpeedKmh,
    maximumSpeedKmh,
    terrainCapabilityInfluence,
  } = input

  if (!Array.isArray(riders)) {
    throw new Error(
      'calculateGroupTerrainPace: riders must be an array.',
    )
  }

  assertFinite(
    gradientPercent,
    'gradientPercent',
  )

  assertFinite(
    terrainCapabilityInfluence,
    'terrainCapabilityInfluence',
  )

  if (
    terrainCapabilityInfluence < 0 ||
    terrainCapabilityInfluence > 1
  ) {
    throw new Error(
      'calculateGroupTerrainPace: terrainCapabilityInfluence must be between 0 and 1.',
    )
  }

  const racingRiders =
    riders
      .filter(
        (rider) =>
          rider.stageStatus ===
          'racing',
      )
      .slice()
      .sort(
        (left, right) =>
          left.riderId.localeCompare(
            right.riderId,
          ),
      )

  if (racingRiders.length === 0) {
    throw new Error(
      'calculateGroupTerrainPace: at least one racing rider is required.',
    )
  }

  const currentPace =
    calculatePelotonBasePace({
      riders:
        racingRiders,
      minimumSpeedKmh,
      maximumSpeedKmh,
    })

  const flatCapabilities =
    racingRiders.map(
      (rider) =>
        calculateRiderTerrainCapability({
          riderId:
            rider.riderId,
          attributes:
            rider.attributes,
          currentEnergy:
            rider.energy,
          gradientPercent: 0,
        }).capabilityScore,
    )

  const terrainCapabilities =
    racingRiders.map(
      (rider) =>
        calculateRiderTerrainCapability({
          riderId:
            rider.riderId,
          attributes:
            rider.attributes,
          currentEnergy:
            rider.energy,
          gradientPercent,
        }).capabilityScore,
    )

  const averageFlatCapabilityScore =
    average(
      flatCapabilities,
    )

  const averageTerrainCapabilityScore =
    average(
      terrainCapabilities,
    )

  if (
    averageFlatCapabilityScore <= 0
  ) {
    throw new Error(
      'calculateGroupTerrainPace: average flat capability must be greater than 0.',
    )
  }

  const rawCapabilityRatio =
    averageTerrainCapabilityScore /
    averageFlatCapabilityScore

  const clampedCapabilityRatio =
    clamp(
      rawCapabilityRatio,
      MINIMUM_CAPABILITY_RATIO,
      MAXIMUM_CAPABILITY_RATIO,
    )

  const terrainAdjustmentMultiplier =
    1 +
    (
      clampedCapabilityRatio -
      1
    ) *
      terrainCapabilityInfluence

  const adjustedBaseSpeedKmh =
    currentPace.baseSpeedKmh *
    terrainAdjustmentMultiplier

  const terrainMinimumSpeedKmh =
    Math.max(
      1,
      adjustedBaseSpeedKmh *
        0.35,
    )

  const terrainSpeed =
    calculateTerrainSpeed({
      baseSpeedKmh:
        adjustedBaseSpeedKmh,
      gradientPercent,
      minimumSpeedKmh:
        terrainMinimumSpeedKmh,
      maximumSpeedKmh,
    })

  return {
    eligibleRiderCount:
      racingRiders.length,
    gradientPercent,
    terrainCapabilityInfluence,

    currentBaseSpeedKmh:
      currentPace.baseSpeedKmh,
    averageFlatCapabilityScore,
    averageTerrainCapabilityScore,

    rawCapabilityRatio,
    clampedCapabilityRatio,
    terrainAdjustmentMultiplier,

    adjustedBaseSpeedKmh,
    terrainMultiplier:
      terrainSpeed
        .terrainMultiplier,
    unclampedAppliedSpeedKmh:
      terrainSpeed
        .unclampedSpeedKmh,
    appliedSpeedKmh:
      terrainSpeed.speedKmh,
  }
}
