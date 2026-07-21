/**
 * energyCost.ts
 *
 * Pure deterministic rider energy-cost calculation.
 *
 * This utility calculates how much energy a rider spends during one
 * simulation tick. It does not mutate RiderState and does not change groups,
 * movement, race events, or simulation state.
 */

export interface RiderEnergyCostInput {
  readonly currentEnergy: number
  readonly speedKmh: number
  readonly baseSpeedKmh: number
  readonly gradientPercent: number
  readonly tickSeconds: number
  readonly stamina: number
  readonly resistance: number
  readonly recovery: number
}

export interface RiderEnergyCostResult {
  readonly currentEnergy: number
  readonly durationMinutes: number
  readonly speedRatio: number
  readonly baseCost: number
  readonly speedCost: number
  readonly uphillCost: number
  readonly downhillRelief: number
  readonly attributeScore: number
  readonly efficiencyMultiplier: number
  readonly grossEnergyCost: number
  readonly energyCost: number
  readonly nextEnergy: number
}

function assertFinite(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      'calculateRiderEnergyCost: ' +
        fieldName +
        ' must be finite.',
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
      'calculateRiderEnergyCost: ' +
        fieldName +
        ' must be between 0 and 100.',
    )
  }
}

/**
 * Calculates deterministic energy usage for one rider during one tick.
 *
 * Attribute weighting:
 * - stamina: 50%
 * - resistance: 30%
 * - recovery: 20%
 *
 * Stronger riders spend less energy for the same effort.
 */
export function calculateRiderEnergyCost(
  input: RiderEnergyCostInput,
): RiderEnergyCostResult {
  const {
    currentEnergy,
    speedKmh,
    baseSpeedKmh,
    gradientPercent,
    tickSeconds,
    stamina,
    resistance,
    recovery,
  } = input

  assertFinite(currentEnergy, 'currentEnergy')
  assertFinite(speedKmh, 'speedKmh')
  assertFinite(baseSpeedKmh, 'baseSpeedKmh')
  assertFinite(gradientPercent, 'gradientPercent')
  assertFinite(tickSeconds, 'tickSeconds')

  validateAttribute(stamina, 'stamina')
  validateAttribute(resistance, 'resistance')
  validateAttribute(recovery, 'recovery')

  if (currentEnergy < 0 || currentEnergy > 100) {
    throw new Error(
      'calculateRiderEnergyCost: currentEnergy must be between 0 and 100.',
    )
  }

  if (speedKmh < 0) {
    throw new Error(
      'calculateRiderEnergyCost: speedKmh must be greater than or equal to 0.',
    )
  }

  if (baseSpeedKmh <= 0) {
    throw new Error(
      'calculateRiderEnergyCost: baseSpeedKmh must be greater than 0.',
    )
  }

  if (
    !Number.isInteger(tickSeconds) ||
    tickSeconds <= 0
  ) {
    throw new Error(
      'calculateRiderEnergyCost: tickSeconds must be a positive integer.',
    )
  }

  if (
    gradientPercent < -30 ||
    gradientPercent > 30
  ) {
    throw new Error(
      'calculateRiderEnergyCost: gradientPercent must be between -30 and 30 inclusive.',
    )
  }

  const durationMinutes =
    tickSeconds / 60

  const speedRatio =
    speedKmh / baseSpeedKmh

  const baseCost =
    durationMinutes * 0.1

  const speedCost =
    durationMinutes *
    Math.max(0, speedRatio - 0.5) *
    0.2

  const uphillCost =
    durationMinutes *
    Math.max(0, gradientPercent) *
    0.03

  const downhillRelief =
    durationMinutes *
    Math.min(
      Math.max(0, -gradientPercent),
      10,
    ) *
    0.01

  const attributeScore =
    stamina * 0.5 +
    resistance * 0.3 +
    recovery * 0.2

  const efficiencyMultiplier =
    1 - (attributeScore / 100) * 0.4

  const grossEnergyCost = Math.max(
    0,
    baseCost +
      speedCost +
      uphillCost -
      downhillRelief,
  )

  const energyCost =
    grossEnergyCost *
    efficiencyMultiplier

  const nextEnergy = Math.max(
    0,
    currentEnergy - energyCost,
  )

  return {
    currentEnergy,
    durationMinutes,
    speedRatio,
    baseCost,
    speedCost,
    uphillCost,
    downhillRelief,
    attributeScore,
    efficiencyMultiplier,
    grossEnergyCost,
    energyCost,
    nextEnergy,
  }
}