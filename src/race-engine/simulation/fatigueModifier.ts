/**
 * fatigueModifier.ts
 *
 * Pure deterministic fatigue modifier for rider capability and pace.
 *
 * This utility converts current rider energy into a conservative multiplier.
 * It does not mutate state and does not yet change simulation movement.
 */

export interface RiderFatigueModifierInput {
  readonly currentEnergy: number
  readonly resistance: number
  readonly recovery: number
}

export interface RiderFatigueModifierResult {
  readonly currentEnergy: number
  readonly fatigueThreshold: number
  readonly energyDeficit: number
  readonly normalizedDeficit: number
  readonly protectionScore: number
  readonly protectionFactor: number
  readonly effectiveDeficit: number
  readonly rawPaceMultiplier: number
  readonly paceMultiplier: number
  readonly capabilityMultiplier: number
  readonly fatigued: boolean
}

const FATIGUE_THRESHOLD = 70
const MAXIMUM_PACE_REDUCTION = 0.15
const MAXIMUM_ATTRIBUTE_PROTECTION = 0.5
const MINIMUM_PACE_MULTIPLIER = 0.85
const MAXIMUM_PACE_MULTIPLIER = 1

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `calculateRiderFatigueModifier: ${fieldName} must be finite.`,
    )
  }
}

function validatePercentage(
  value: number,
  fieldName: string,
): void {
  assertFinite(value, fieldName)

  if (value < 0 || value > 100) {
    throw new Error(
      `calculateRiderFatigueModifier: ${fieldName} must be between 0 and 100.`,
    )
  }
}

/**
 * Calculates a deterministic fatigue multiplier.
 *
 * Rules:
 *
 * - Energy from 70 to 100 produces no fatigue penalty.
 * - Energy below 70 gradually reduces capability and pace.
 * - Resistance contributes 60% of fatigue protection.
 * - Recovery contributes 40% of fatigue protection.
 * - Strong attributes can reduce the fatigue effect by up to 50%.
 * - The final multiplier is clamped between 0.85 and 1.0.
 *
 * The maximum baseline penalty at zero energy is therefore 15%.
 * This is intentionally conservative for the first fatigue implementation.
 */
export function calculateRiderFatigueModifier(
  input: RiderFatigueModifierInput,
): RiderFatigueModifierResult {
  const {
    currentEnergy,
    resistance,
    recovery,
  } = input

  validatePercentage(
    currentEnergy,
    'currentEnergy',
  )

  validatePercentage(
    resistance,
    'resistance',
  )

  validatePercentage(
    recovery,
    'recovery',
  )

  const energyDeficit = Math.max(
    0,
    FATIGUE_THRESHOLD - currentEnergy,
  )

  const normalizedDeficit =
    energyDeficit / FATIGUE_THRESHOLD

  const protectionScore =
    resistance * 0.6 +
    recovery * 0.4

  const protectionFactor =
    (protectionScore / 100) *
    MAXIMUM_ATTRIBUTE_PROTECTION

  const effectiveDeficit =
    normalizedDeficit *
    (1 - protectionFactor)

  const rawPaceMultiplier =
    1 -
    effectiveDeficit *
      MAXIMUM_PACE_REDUCTION

  const paceMultiplier = Math.min(
    MAXIMUM_PACE_MULTIPLIER,
    Math.max(
      MINIMUM_PACE_MULTIPLIER,
      rawPaceMultiplier,
    ),
  )

  return {
    currentEnergy,
    fatigueThreshold: FATIGUE_THRESHOLD,
    energyDeficit,
    normalizedDeficit,
    protectionScore,
    protectionFactor,
    effectiveDeficit,
    rawPaceMultiplier,
    paceMultiplier,
    capabilityMultiplier:
      paceMultiplier,
    fatigued:
      currentEnergy < FATIGUE_THRESHOLD,
  }
}
