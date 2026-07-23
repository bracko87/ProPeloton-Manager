/**
 * riderTerrainCapability.ts
 *
 * Pure deterministic rider capability calculation for one terrain gradient.
 *
 * This utility is currently inactive. It is used only by the Phase 7B.3
 * development diagnostic and is not connected to movement, group transitions,
 * energy application, race events, persistence, or production execution.
 */

import type {
  RiderAttributes,
} from '../domain/RiderState'
import {
  calculateRiderFatigueModifier,
} from './fatigueModifier'

export type TerrainCapabilityBand =
  | 'descent'
  | 'flat'
  | 'rolling'
  | 'climb'

export interface TerrainCapabilityWeights {
  readonly flat: number
  readonly climbing: number
  readonly timeTrial: number
  readonly stamina: number
  readonly resistance: number
  readonly recovery: number
  readonly raceIq: number
}

export interface RiderTerrainCapabilityInput {
  readonly riderId: string
  readonly attributes: RiderAttributes
  readonly currentEnergy: number
  readonly gradientPercent: number
}

export interface RiderTerrainCapabilityResult {
  readonly riderId: string
  readonly gradientPercent: number
  readonly terrainBand: TerrainCapabilityBand
  readonly weights: TerrainCapabilityWeights

  readonly flatContribution: number
  readonly climbingContribution: number
  readonly timeTrialContribution: number
  readonly staminaContribution: number
  readonly resistanceContribution: number
  readonly recoveryContribution: number
  readonly raceIqContribution: number

  readonly rawCapabilityScore: number
  readonly fatigueMultiplier: number
  readonly capabilityScore: number
}

const FLAT_WEIGHTS:
  TerrainCapabilityWeights = {
    flat: 0.4,
    climbing: 0,
    timeTrial: 0.2,
    stamina: 0.15,
    resistance: 0.1,
    recovery: 0.05,
    raceIq: 0.1,
  }

const CLIMB_WEIGHTS:
  TerrainCapabilityWeights = {
    flat: 0,
    climbing: 0.5,
    timeTrial: 0,
    stamina: 0.2,
    resistance: 0.15,
    recovery: 0.1,
    raceIq: 0.05,
  }

const DESCENT_WEIGHTS:
  TerrainCapabilityWeights = {
    flat: 0.25,
    climbing: 0.05,
    timeTrial: 0.2,
    stamina: 0.05,
    resistance: 0.2,
    recovery: 0.1,
    raceIq: 0.15,
  }

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateRiderTerrainCapability: ${fieldName} must be finite.`,
    )
  }
}

function requireAttribute(
  value: number | undefined,
  fieldName: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new Error(
      `calculateRiderTerrainCapability: ${fieldName} must be between 0 and 100.`,
    )
  }

  return value
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

function interpolate(
  start: number,
  end: number,
  factor: number,
): number {
  return (
    start +
    (end - start) *
      factor
  )
}

function interpolateWeights(
  start:
    TerrainCapabilityWeights,
  end:
    TerrainCapabilityWeights,
  factor: number,
): TerrainCapabilityWeights {
  return {
    flat:
      interpolate(
        start.flat,
        end.flat,
        factor,
      ),
    climbing:
      interpolate(
        start.climbing,
        end.climbing,
        factor,
      ),
    timeTrial:
      interpolate(
        start.timeTrial,
        end.timeTrial,
        factor,
      ),
    stamina:
      interpolate(
        start.stamina,
        end.stamina,
        factor,
      ),
    resistance:
      interpolate(
        start.resistance,
        end.resistance,
        factor,
      ),
    recovery:
      interpolate(
        start.recovery,
        end.recovery,
        factor,
      ),
    raceIq:
      interpolate(
        start.raceIq,
        end.raceIq,
        factor,
      ),
  }
}

/**
 * Returns deterministic terrain weights.
 *
 * Rules used by the diagnostic:
 *
 * - Flat terrain uses flat and time-trial ability most strongly.
 * - Uphill terrain progressively transfers weight to climbing.
 * - Full climb weighting is reached at +8%.
 * - Descents favour flat handling, sustained speed, resistance, and race IQ.
 *
 * The weights always total 1.
 */
export function getTerrainCapabilityWeights(
  gradientPercent: number,
): TerrainCapabilityWeights {
  assertFinite(
    gradientPercent,
    'gradientPercent',
  )

  if (
    gradientPercent < -30 ||
    gradientPercent > 30
  ) {
    throw new Error(
      'calculateRiderTerrainCapability: gradientPercent must be between -30 and 30.',
    )
  }

  if (gradientPercent >= 0) {
    const uphillFactor =
      clamp01(
        gradientPercent / 8,
      )

    return interpolateWeights(
      FLAT_WEIGHTS,
      CLIMB_WEIGHTS,
      uphillFactor,
    )
  }

  const downhillFactor =
    clamp01(
      Math.abs(
        gradientPercent,
      ) / 8,
    )

  return interpolateWeights(
    FLAT_WEIGHTS,
    DESCENT_WEIGHTS,
    downhillFactor,
  )
}

function getTerrainBand(
  gradientPercent: number,
): TerrainCapabilityBand {
  if (gradientPercent <= -2) {
    return 'descent'
  }

  if (gradientPercent < 2) {
    return 'flat'
  }

  if (gradientPercent < 6) {
    return 'rolling'
  }

  return 'climb'
}

/**
 * Calculates rider-specific capability for one gradient.
 *
 * Teamwork is deliberately excluded because this result represents the
 * rider's individual ability to sustain terrain demand. Teamwork can remain
 * part of a separate group-pace calculation.
 */
export function calculateRiderTerrainCapability(
  input:
    RiderTerrainCapabilityInput,
): RiderTerrainCapabilityResult {
  const {
    riderId,
    attributes,
    currentEnergy,
    gradientPercent,
  } = input

  if (
    typeof riderId !== 'string' ||
    riderId.trim().length === 0
  ) {
    throw new Error(
      'calculateRiderTerrainCapability: riderId must be a non-empty string.',
    )
  }

  const flat =
    requireAttribute(
      attributes.flat,
      `${riderId}.attributes.flat`,
    )

  const climbing =
    requireAttribute(
      attributes.climbing,
      `${riderId}.attributes.climbing`,
    )

  const timeTrial =
    requireAttribute(
      attributes.timeTrial,
      `${riderId}.attributes.timeTrial`,
    )

  const stamina =
    requireAttribute(
      attributes.stamina,
      `${riderId}.attributes.stamina`,
    )

  const resistance =
    requireAttribute(
      attributes.resistance,
      `${riderId}.attributes.resistance`,
    )

  const recovery =
    requireAttribute(
      attributes.recovery,
      `${riderId}.attributes.recovery`,
    )

  const raceIq =
    requireAttribute(
      attributes.raceIq,
      `${riderId}.attributes.raceIq`,
    )

  const weights =
    getTerrainCapabilityWeights(
      gradientPercent,
    )

  const flatContribution =
    flat * weights.flat

  const climbingContribution =
    climbing *
    weights.climbing

  const timeTrialContribution =
    timeTrial *
    weights.timeTrial

  const staminaContribution =
    stamina *
    weights.stamina

  const resistanceContribution =
    resistance *
    weights.resistance

  const recoveryContribution =
    recovery *
    weights.recovery

  const raceIqContribution =
    raceIq *
    weights.raceIq

  const rawCapabilityScore =
    flatContribution +
    climbingContribution +
    timeTrialContribution +
    staminaContribution +
    resistanceContribution +
    recoveryContribution +
    raceIqContribution

  const fatigue =
    calculateRiderFatigueModifier({
      currentEnergy,
      resistance,
      recovery,
    })

  const fatigueMultiplier =
    fatigue.capabilityMultiplier

  const capabilityScore =
    rawCapabilityScore *
    fatigueMultiplier

  return {
    riderId,
    gradientPercent,
    terrainBand:
      getTerrainBand(
        gradientPercent,
      ),
    weights,

    flatContribution,
    climbingContribution,
    timeTrialContribution,
    staminaContribution,
    resistanceContribution,
    recoveryContribution,
    raceIqContribution,

    rawCapabilityScore,
    fatigueMultiplier,
    capabilityScore,
  }
}
