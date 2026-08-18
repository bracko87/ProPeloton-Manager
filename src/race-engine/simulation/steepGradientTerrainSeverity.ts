/**
 * steepGradientTerrainSeverity.ts
 *
 * Pure deterministic candidate severity extension for gradients above +8%.
 *
 * Existing behaviour from -30% through +8% is preserved exactly. Above +8%,
 * candidate models may:
 * - continue reducing aerodynamic shelter;
 * - apply a rider-specific steep-climb capability penalty; and
 * - add a small common group-demand premium.
 *
 * This module is inactive. It does not mutate SimulationState, move groups,
 * create transitions, emit events, access Supabase, or alter production
 * execution.
 */

import type {
  GroupType,
} from '../domain/GroupState'
import type {
  RiderAttributes,
} from '../domain/RiderState'
import {
  calculateGroupShelter,
  type GroupShelterResult,
} from './groupShelter'
import {
  calculateRiderTerrainCapability,
  type RiderTerrainCapabilityResult,
} from './riderTerrainCapability'

export type SteepGradientSeverityModel =
  | 'current_saturated'
  | 'shelter_extension'
  | 'progressive_resilience'

export interface SteepGradientTerrainSeverityInput {
  readonly riderId: string
  readonly attributes:
    RiderAttributes
  readonly currentEnergy: number
  readonly groupType: GroupType
  readonly groupSize: number
  readonly gradientPercent: number
  readonly model:
    SteepGradientSeverityModel
}

export interface SteepGradientTerrainSeverityResult {
  readonly riderId: string
  readonly model:
    SteepGradientSeverityModel
  readonly gradientPercent: number

  /**
   * 0 at +8% and below, 1 at +15% and above.
   */
  readonly steepnessFactor: number

  readonly baseCapability:
    RiderTerrainCapabilityResult
  readonly steepResilienceScore: number
  readonly capabilityPenaltyPoints: number
  readonly adjustedCapabilityScore: number

  readonly baseShelter:
    GroupShelterResult
  readonly shelterRetentionMultiplier: number
  readonly adjustedShelterBonus: number
  readonly shelterReductionPoints: number

  readonly additionalDemandPoints: number
  readonly effectiveCapabilityScore: number
}

const STEEP_START_GRADIENT_PERCENT =
  8

const FULL_STEEP_GRADIENT_PERCENT =
  15

const MINIMUM_SHELTER_RETENTION_AT_FULL_STEEP =
  0.2

const MAXIMUM_COMMON_DEMAND_POINTS =
  2

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateSteepGradientTerrainSeverity: ${fieldName} must be finite.`,
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
      `calculateSteepGradientTerrainSeverity: ${fieldName} must be between 0 and 100.`,
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

function calculateSteepnessFactor(
  gradientPercent: number,
): number {
  return clamp01(
    (
      gradientPercent -
      STEEP_START_GRADIENT_PERCENT
    ) /
      (
        FULL_STEEP_GRADIENT_PERCENT -
        STEEP_START_GRADIENT_PERCENT
      ),
  )
}

/**
 * Steep resilience deliberately uses only confirmed rider attributes.
 *
 * Climbing dominates, while stamina, resistance, and recovery determine how
 * well that climbing ability can be sustained on very steep gradients.
 */
function calculateSteepResilienceScore(
  attributes:
    RiderAttributes,
  riderId: string,
): number {
  const climbing =
    requireAttribute(
      attributes.climbing,
      `${riderId}.attributes.climbing`,
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

  return (
    climbing * 0.55 +
    stamina * 0.2 +
    resistance * 0.15 +
    recovery * 0.1
  )
}

/**
 * Candidate penalty at +15%:
 * - elite steep resilience around 80 receives about 6.4 points;
 * - average resilience around 60 receives about 8.8 points;
 * - weaker resilience around 50 receives about 10 points.
 *
 * The penalty is zero through +8% and rises linearly to +15%.
 */
function calculateCapabilityPenaltyPoints(
  model:
    SteepGradientSeverityModel,
  steepnessFactor: number,
  steepResilienceScore: number,
): number {
  if (
    model !==
    'progressive_resilience'
  ) {
    return 0
  }

  const fullSteepPenaltyPoints =
    4 +
    (
      100 -
      steepResilienceScore
    ) *
      0.12

  return (
    fullSteepPenaltyPoints *
    steepnessFactor
  )
}

function calculateShelterRetentionMultiplier(
  model:
    SteepGradientSeverityModel,
  steepnessFactor: number,
): number {
  if (
    model ===
    'current_saturated'
  ) {
    return 1
  }

  return (
    1 -
    (
      1 -
      MINIMUM_SHELTER_RETENTION_AT_FULL_STEEP
    ) *
      steepnessFactor
  )
}

function calculateAdditionalDemandPoints(
  model:
    SteepGradientSeverityModel,
  steepnessFactor: number,
): number {
  if (
    model !==
    'progressive_resilience'
  ) {
    return 0
  }

  return (
    MAXIMUM_COMMON_DEMAND_POINTS *
    steepnessFactor
  )
}

/**
 * Calculates one rider's candidate steep-gradient values.
 *
 * Important:
 * At +8% and below every candidate adjustment is exactly zero, so capability,
 * shelter, effective capability, and group demand remain unchanged.
 */
export function calculateSteepGradientTerrainSeverity(
  input:
    SteepGradientTerrainSeverityInput,
): SteepGradientTerrainSeverityResult {
  const {
    riderId,
    attributes,
    currentEnergy,
    groupType,
    groupSize,
    gradientPercent,
    model,
  } = input

  if (
    typeof riderId !== 'string' ||
    riderId.trim().length === 0
  ) {
    throw new Error(
      'calculateSteepGradientTerrainSeverity: riderId must be a non-empty string.',
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
      'calculateSteepGradientTerrainSeverity: gradientPercent must be between -30 and 30.',
    )
  }

  if (
    !Number.isInteger(
      groupSize,
    ) ||
    groupSize <= 0
  ) {
    throw new Error(
      'calculateSteepGradientTerrainSeverity: groupSize must be a positive integer.',
    )
  }

  const steepnessFactor =
    calculateSteepnessFactor(
      gradientPercent,
    )

  const baseCapability =
    calculateRiderTerrainCapability({
      riderId,
      attributes,
      currentEnergy,
      gradientPercent,
    })

  const steepResilienceScore =
    calculateSteepResilienceScore(
      attributes,
      riderId,
    )

  const capabilityPenaltyPoints =
    calculateCapabilityPenaltyPoints(
      model,
      steepnessFactor,
      steepResilienceScore,
    )

  const adjustedCapabilityScore =
    Math.max(
      0,
      baseCapability
        .capabilityScore -
        capabilityPenaltyPoints,
    )

  const baseShelter =
    calculateGroupShelter({
      groupType,
      groupSize,
      gradientPercent,
    })

  const shelterRetentionMultiplier =
    calculateShelterRetentionMultiplier(
      model,
      steepnessFactor,
    )

  const adjustedShelterBonus =
    baseShelter.shelterBonus *
    shelterRetentionMultiplier

  const shelterReductionPoints =
    baseShelter.shelterBonus -
    adjustedShelterBonus

  const additionalDemandPoints =
    calculateAdditionalDemandPoints(
      model,
      steepnessFactor,
    )

  const effectiveCapabilityScore =
    Math.min(
      100,
      adjustedCapabilityScore +
      adjustedShelterBonus,
    )

  return {
    riderId,
    model,
    gradientPercent,
    steepnessFactor,

    baseCapability,
    steepResilienceScore,
    capabilityPenaltyPoints,
    adjustedCapabilityScore,

    baseShelter,
    shelterRetentionMultiplier,
    adjustedShelterBonus,
    shelterReductionPoints,

    additionalDemandPoints,
    effectiveCapabilityScore,
  }
}
