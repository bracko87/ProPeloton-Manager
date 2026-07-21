/**
 * groupHold.ts
 *
 * Pure deterministic rider ability-to-hold-group calculation.
 *
 * This utility compares a rider's fatigue-adjusted capability against the
 * current capability demand of a group. It does not mutate simulation state,
 * move riders, create groups, or emit events.
 */

export type RiderGroupHoldStatus =
  | 'comfortable'
  | 'under_pressure'
  | 'cannot_hold'

export interface RiderGroupHoldInput {
  readonly riderCapabilityScore: number
  readonly groupDemandScore: number
  readonly groupSpeedKmh: number
}

export interface RiderGroupHoldResult {
  readonly riderCapabilityScore: number
  readonly groupDemandScore: number
  readonly groupSpeedKmh: number
  readonly capabilityMargin: number
  readonly capabilityDeficit: number
  readonly status: RiderGroupHoldStatus
  readonly sustainableSpeedMultiplier: number
  readonly sustainableSpeedKmh: number
  readonly speedDeficitKmh: number
  readonly shouldDropFromGroup: boolean
}

const COMFORTABLE_MARGIN = 5
const DROP_MARGIN = -8

const MINIMUM_SUSTAINABLE_SPEED_MULTIPLIER = 0.85
const MAXIMUM_SUSTAINABLE_SPEED_MULTIPLIER = 1

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateRiderGroupHold: ${fieldName} must be finite.`,
    )
  }
}

function validateScore(
  value: number,
  fieldName: string,
): void {
  assertFinite(value, fieldName)

  if (value < 0 || value > 100) {
    throw new Error(
      `calculateRiderGroupHold: ${fieldName} must be between 0 and 100.`,
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
    Math.max(minimum, value),
  )
}

/**
 * Calculates whether a rider can hold the current group pace.
 *
 * Rules:
 *
 * - A capability margin of at least +5 is comfortable.
 * - A margin from below +5 down to -8 is under pressure.
 * - A margin below -8 means the rider cannot hold the group.
 * - Under-pressure riders lose 0.5% sustainable speed per capability point
 *   below the comfortable threshold.
 * - Riders who cannot hold lose an additional 1% sustainable speed per
 *   capability point below the drop threshold.
 * - Sustainable speed is clamped between 85% and 100% of group speed.
 */
export function calculateRiderGroupHold(
  input: RiderGroupHoldInput,
): RiderGroupHoldResult {
  const {
    riderCapabilityScore,
    groupDemandScore,
    groupSpeedKmh,
  } = input

  validateScore(
    riderCapabilityScore,
    'riderCapabilityScore',
  )

  validateScore(
    groupDemandScore,
    'groupDemandScore',
  )

  assertFinite(
    groupSpeedKmh,
    'groupSpeedKmh',
  )

  if (groupSpeedKmh <= 0) {
    throw new Error(
      'calculateRiderGroupHold: groupSpeedKmh must be greater than 0.',
    )
  }

  const capabilityMargin =
    riderCapabilityScore -
    groupDemandScore

  const capabilityDeficit = Math.max(
    0,
    groupDemandScore -
      riderCapabilityScore,
  )

  let status: RiderGroupHoldStatus
  let rawSustainableSpeedMultiplier: number

  if (
    capabilityMargin >=
    COMFORTABLE_MARGIN
  ) {
    status = 'comfortable'
    rawSustainableSpeedMultiplier = 1
  } else if (
    capabilityMargin >=
    DROP_MARGIN
  ) {
    status = 'under_pressure'

    const pressurePoints =
      COMFORTABLE_MARGIN -
      capabilityMargin

    rawSustainableSpeedMultiplier =
      1 -
      pressurePoints * 0.005
  } else {
    status = 'cannot_hold'

    const pressureAtDropThreshold =
      COMFORTABLE_MARGIN -
      DROP_MARGIN

    const additionalDropPoints =
      DROP_MARGIN -
      capabilityMargin

    rawSustainableSpeedMultiplier =
      1 -
      pressureAtDropThreshold * 0.005 -
      additionalDropPoints * 0.01
  }

  const sustainableSpeedMultiplier =
    clamp(
      rawSustainableSpeedMultiplier,
      MINIMUM_SUSTAINABLE_SPEED_MULTIPLIER,
      MAXIMUM_SUSTAINABLE_SPEED_MULTIPLIER,
    )

  const sustainableSpeedKmh =
    groupSpeedKmh *
    sustainableSpeedMultiplier

  const speedDeficitKmh = Math.max(
    0,
    groupSpeedKmh -
      sustainableSpeedKmh,
  )

  return {
    riderCapabilityScore,
    groupDemandScore,
    groupSpeedKmh,
    capabilityMargin,
    capabilityDeficit,
    status,
    sustainableSpeedMultiplier,
    sustainableSpeedKmh,
    speedDeficitKmh,
    shouldDropFromGroup:
      status === 'cannot_hold',
  }
}