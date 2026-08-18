/**
 * pelotonPace.ts
 *
 * Deterministic calculation of a stable intended peloton base pace.
 *
 * The result is based on the attributes of riders currently racing in the
 * peloton. Terrain adjustment is deliberately excluded and is applied later
 * by calculateTerrainSpeed().
 */

import type { RiderState } from '../domain/RiderState'
import { calculateRiderFatigueModifier } from './fatigueModifier'

export interface PelotonPaceInput {
  readonly riders: readonly RiderState[]
  readonly minimumSpeedKmh: number
  readonly maximumSpeedKmh: number
}

export interface RiderPaceContribution {
  readonly riderId: string
  readonly flatContribution: number
  readonly staminaContribution: number
  readonly resistanceContribution: number
  readonly teamworkContribution: number

  /**
   * Capability before fatigue is applied.
   */
  readonly rawCapabilityScore: number

  /**
   * Multiplier derived from the rider's current energy,
   * resistance, and recovery.
   */
  readonly fatigueMultiplier: number

  /**
   * Final capability after fatigue is applied.
   */
  readonly capabilityScore: number
}

export interface PelotonPaceResult {
  readonly eligibleRiderCount: number
  readonly averageCapabilityScore: number
  readonly speedRangeKmh: number
  readonly speedRangeUsage: number
  readonly baseSpeedKmh: number
  readonly riderContributions: readonly RiderPaceContribution[]
}

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculatePelotonBasePace: ${fieldName} must be finite.`,
    )
  }
}

function validateAttribute(
  value: number,
  fieldName: string,
): void {
  assertFinite(value, fieldName)

  if (value < 0 || value > 100) {
    throw new Error(
      `calculatePelotonBasePace: ${fieldName} must be between 0 and 100.`,
    )
  }
}

/**
 * Calculates a stable intended peloton speed before terrain adjustment.
 *
 * Only riders with stageStatus === 'racing' participate.
 *
 * Attribute weighting:
 * - flat: 45%
 * - stamina: 25%
 * - resistance: 20%
 * - teamwork: 10%
 *
 * The resulting capability uses up to 50% of the configured speed range.
 * This keeps the Phase 3 baseline conservative and leaves later room for
 * tactics, attacks, energy, and race situation modifiers.
 */
export function calculatePelotonBasePace(
  input: PelotonPaceInput,
): PelotonPaceResult {
  const {
    riders,
    minimumSpeedKmh,
    maximumSpeedKmh,
  } = input

  if (!Array.isArray(riders)) {
    throw new Error(
      'calculatePelotonBasePace: riders must be an array.',
    )
  }

  assertFinite(
    minimumSpeedKmh,
    'minimumSpeedKmh',
  )

  assertFinite(
    maximumSpeedKmh,
    'maximumSpeedKmh',
  )

  if (minimumSpeedKmh <= 0) {
    throw new Error(
      'calculatePelotonBasePace: minimumSpeedKmh must be greater than 0.',
    )
  }

  if (maximumSpeedKmh < minimumSpeedKmh) {
    throw new Error(
      'calculatePelotonBasePace: maximumSpeedKmh must be greater than or equal to minimumSpeedKmh.',
    )
  }

  const eligibleRiders = riders
    .filter(
      (rider) =>
        rider.stageStatus === 'racing',
    )
    .sort(
      (riderA, riderB) =>
        riderA.riderId.localeCompare(
          riderB.riderId,
        ),
    )

  if (eligibleRiders.length === 0) {
    throw new Error(
      'calculatePelotonBasePace: at least one racing rider is required.',
    )
  }

  const riderContributions: RiderPaceContribution[] =
    eligibleRiders.map((rider) => {
      const {
        flat,
        stamina,
        resistance,
        teamwork,
      } = rider.attributes

      validateAttribute(
        flat,
        `${rider.riderId}.attributes.flat`,
      )

      validateAttribute(
        stamina,
        `${rider.riderId}.attributes.stamina`,
      )

      validateAttribute(
        resistance,
        `${rider.riderId}.attributes.resistance`,
      )

      validateAttribute(
        teamwork,
        `${rider.riderId}.attributes.teamwork`,
      )

      const flatContribution =
        rider.attributes.flat * 0.45

      const staminaContribution =
        rider.attributes.stamina * 0.25

      const resistanceContribution =
        rider.attributes.resistance * 0.2

      const teamworkContribution =
        rider.attributes.teamwork * 0.1

      const rawCapabilityScore =
        flatContribution +
        staminaContribution +
        resistanceContribution +
        teamworkContribution

      const fatigueResult =
        calculateRiderFatigueModifier({
          currentEnergy: rider.energy,
          resistance:
            rider.attributes.resistance,
          recovery:
            rider.attributes.recovery,
        })

      const fatigueMultiplier =
        fatigueResult.capabilityMultiplier

      const capabilityScore =
        rawCapabilityScore *
        fatigueMultiplier

      return {
        riderId: rider.riderId,
        flatContribution,
        staminaContribution,
        resistanceContribution,
        teamworkContribution,
        rawCapabilityScore,
        fatigueMultiplier,
        capabilityScore,
      }
    })

  const totalCapabilityScore =
    riderContributions.reduce(
      (sum, contribution) =>
        sum + contribution.capabilityScore,
      0,
    )

  const averageCapabilityScore =
    totalCapabilityScore /
    riderContributions.length

  const speedRangeKmh =
    maximumSpeedKmh -
    minimumSpeedKmh

  /*
   * A capability score of 100 uses 50% of the available speed range.
   *
   * Example:
   * minimum 36, maximum 60, capability 80:
   * 36 + (24 × 0.4) = 45.6 km/h
   */
  const speedRangeUsage =
    (averageCapabilityScore / 100) * 0.5

  const unclampedBaseSpeedKmh =
    minimumSpeedKmh +
    speedRangeKmh * speedRangeUsage

  const baseSpeedKmh = Math.min(
    maximumSpeedKmh,
    Math.max(
      minimumSpeedKmh,
      unclampedBaseSpeedKmh,
    ),
  )

  return {
    eligibleRiderCount:
      riderContributions.length,
    averageCapabilityScore,
    speedRangeKmh,
    speedRangeUsage,
    baseSpeedKmh,
    riderContributions,
  }
}