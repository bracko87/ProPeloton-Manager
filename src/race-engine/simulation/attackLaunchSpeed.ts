/**
 * attackLaunchSpeed.ts
 *
 * Pure deterministic calculation for the initial speed of an attacking rider.
 *
 * This helper does not mutate simulation state, create groups, emit events,
 * consume energy, or activate production execution.
 */

export interface AttackLaunchSpeedInput {
  readonly sourceSpeedKmh: number
  readonly maximumSpeedKmh: number
  readonly gradientPercent: number
  readonly acceleration: number
  readonly currentEnergy: number
}

export interface AttackLaunchSpeedResult {
  readonly sourceSpeedKmh: number
  readonly maximumSpeedKmh: number
  readonly gradientPercent: number
  readonly acceleration: number
  readonly currentEnergy: number

  readonly baseLaunchBonusKmh: number
  readonly accelerationFactor: number
  readonly energyFactor: number
  readonly terrainFactor: number
  readonly speedHeadroomFactor: number

  readonly launchBonusKmh: number
  readonly unclampedLaunchSpeedKmh: number
  readonly launchSpeedKmh: number
}

const MAXIMUM_BASE_LAUNCH_BONUS_KMH =
  4

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateAttackLaunchSpeed: ${fieldName} must be finite.`,
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
 * Calculates a controlled initial attack speed.
 *
 * Rules:
 * - The legacy maximum launch bonus remains 4 km/h.
 * - Acceleration below 100 progressively limits the bonus.
 * - Low energy progressively limits the bonus.
 * - Uphill and downhill terrain both reduce explosive launch advantage.
 * - The bonus fades as the source group approaches maximum speed.
 * - Final speed never exceeds maximumSpeedKmh.
 */
export function calculateAttackLaunchSpeed(
  input: AttackLaunchSpeedInput,
): AttackLaunchSpeedResult {
  const {
    sourceSpeedKmh,
    maximumSpeedKmh,
    gradientPercent,
    acceleration,
    currentEnergy,
  } = input

  assertFinite(
    sourceSpeedKmh,
    'sourceSpeedKmh',
  )

  assertFinite(
    maximumSpeedKmh,
    'maximumSpeedKmh',
  )

  assertFinite(
    gradientPercent,
    'gradientPercent',
  )

  assertFinite(
    acceleration,
    'acceleration',
  )

  assertFinite(
    currentEnergy,
    'currentEnergy',
  )

  if (sourceSpeedKmh < 0) {
    throw new Error(
      'calculateAttackLaunchSpeed: sourceSpeedKmh must be non-negative.',
    )
  }

  if (maximumSpeedKmh <= 0) {
    throw new Error(
      'calculateAttackLaunchSpeed: maximumSpeedKmh must be greater than 0.',
    )
  }

  if (sourceSpeedKmh > maximumSpeedKmh) {
    throw new Error(
      'calculateAttackLaunchSpeed: sourceSpeedKmh cannot exceed maximumSpeedKmh.',
    )
  }

  if (
    gradientPercent < -30 ||
    gradientPercent > 30
  ) {
    throw new Error(
      'calculateAttackLaunchSpeed: gradientPercent must be between -30 and 30.',
    )
  }

  if (
    acceleration < 0 ||
    acceleration > 100
  ) {
    throw new Error(
      'calculateAttackLaunchSpeed: acceleration must be between 0 and 100.',
    )
  }

  if (
    currentEnergy < 0 ||
    currentEnergy > 100
  ) {
    throw new Error(
      'calculateAttackLaunchSpeed: currentEnergy must be between 0 and 100.',
    )
  }

  const accelerationFactor =
    0.5 +
    clamp01(
      acceleration / 100,
    ) *
      0.5

  const energyFactor =
    0.4 +
    clamp01(
      currentEnergy / 100,
    ) *
      0.6

  const absoluteGradient =
    Math.abs(
      gradientPercent,
    )

  const terrainFactor =
    1 -
    clamp01(
      absoluteGradient / 12,
    ) *
      0.5

  const availableHeadroomKmh =
    maximumSpeedKmh -
    sourceSpeedKmh

  const speedHeadroomFactor =
    clamp01(
      availableHeadroomKmh /
        MAXIMUM_BASE_LAUNCH_BONUS_KMH,
    )

  const launchBonusKmh =
    MAXIMUM_BASE_LAUNCH_BONUS_KMH *
    accelerationFactor *
    energyFactor *
    terrainFactor *
    speedHeadroomFactor

  const unclampedLaunchSpeedKmh =
    sourceSpeedKmh +
    launchBonusKmh

  const launchSpeedKmh =
    Math.min(
      maximumSpeedKmh,
      unclampedLaunchSpeedKmh,
    )

  return {
    sourceSpeedKmh,
    maximumSpeedKmh,
    gradientPercent,
    acceleration,
    currentEnergy,

    baseLaunchBonusKmh:
      MAXIMUM_BASE_LAUNCH_BONUS_KMH,
    accelerationFactor,
    energyFactor,
    terrainFactor,
    speedHeadroomFactor,

    launchBonusKmh,
    unclampedLaunchSpeedKmh,
    launchSpeedKmh,
  }
}