/**
 * riderEnergy.ts
 *
 * Pure deterministic live-energy calculation for B1.7.
 *
 * The model intentionally remains transparent:
 * - normal movement consumes energy according to duration, speed and endurance;
 * - larger and better-organized groups reduce that movement cost through shelter;
 * - configured attackers pay one additional energy cost at the attack checkpoint;
 * - energy is clamped between zero and the rider's starting freshness.
 */

const ENERGY_PRECISION = 1_000
const PERCENT_PRECISION = 1_000_000

export const BASE_MOVEMENT_ENERGY_COST_PER_HOUR = 18
export const ATTACK_ENERGY_COST = 8
export const MAX_SHELTER_SAVING_PERCENT = 0.28
export const SHELTER_PERCENT_PER_LOG2_RIDER = 0.05
export const MAX_COOPERATION_SHELTER_PERCENT = 0.06

export interface RiderEnergyStepInput {
  currentEnergy: number
  freshness: number
  endurance: number
  speedKmh: number
  elapsedSeconds: number
  riderCount: number
  cooperationLevel: number
  attackEnergyCost?: number
}

export interface RiderEnergyStepResult {
  freshness: number
  energyBefore: number
  grossMovementEnergyCost: number
  shelterSavingPercent: number
  shelterEnergySaving: number
  movementEnergyCost: number
  attackEnergyCost: number
  energyCostSincePreviousCheckpoint: number
  energyAfter: number
}

function roundEnergy(value: number): number {
  return Math.round(value * ENERGY_PRECISION) / ENERGY_PRECISION
}

function roundPercent(value: number): number {
  return Math.round(value * PERCENT_PRECISION) / PERCENT_PRECISION
}

function validatePercentage(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${fieldName} must be between 0 and 100`)
  }
}

function validateInput(input: RiderEnergyStepInput): void {
  validatePercentage(input.freshness, 'freshness')
  validatePercentage(input.currentEnergy, 'currentEnergy')
  validatePercentage(input.endurance, 'endurance')

  if (input.currentEnergy > input.freshness) {
    throw new Error('currentEnergy cannot exceed freshness')
  }

  if (!Number.isFinite(input.speedKmh) || input.speedKmh <= 0) {
    throw new Error('speedKmh must be a positive finite number')
  }

  if (!Number.isFinite(input.elapsedSeconds) || input.elapsedSeconds <= 0) {
    throw new Error('elapsedSeconds must be a positive finite number')
  }

  if (!Number.isInteger(input.riderCount) || input.riderCount < 1) {
    throw new Error('riderCount must be a positive integer')
  }

  if (
    !Number.isFinite(input.cooperationLevel) ||
    input.cooperationLevel < 0 ||
    input.cooperationLevel > 1
  ) {
    throw new Error('cooperationLevel must be between 0 and 1')
  }

  const attackEnergyCost = input.attackEnergyCost ?? 0

  if (!Number.isFinite(attackEnergyCost) || attackEnergyCost < 0) {
    throw new Error('attackEnergyCost must be a non-negative finite number')
  }
}

/**
 * Calculate the shelter percentage for one rider in a group.
 */
export function calculateShelterSavingPercent(
  riderCount: number,
  cooperationLevel: number,
): number {
  if (!Number.isInteger(riderCount) || riderCount < 1) {
    throw new Error('riderCount must be a positive integer')
  }

  if (
    !Number.isFinite(cooperationLevel) ||
    cooperationLevel < 0 ||
    cooperationLevel > 1
  ) {
    throw new Error('cooperationLevel must be between 0 and 1')
  }

  if (riderCount === 1) return 0

  const sizeSaving = Math.log2(riderCount) * SHELTER_PERCENT_PER_LOG2_RIDER
  const cooperationSaving =
    cooperationLevel * MAX_COOPERATION_SHELTER_PERCENT

  return roundPercent(
    Math.min(MAX_SHELTER_SAVING_PERCENT, sizeSaving + cooperationSaving),
  )
}

/**
 * Calculate one deterministic rider-energy transition.
 */
export function calculateRiderEnergyStep(
  input: RiderEnergyStepInput,
): RiderEnergyStepResult {
  validateInput(input)

  const elapsedHours = input.elapsedSeconds / 3600
  const speedMultiplier = 0.8 + input.speedKmh / 200
  const enduranceMultiplier = 1.15 - input.endurance * 0.004
  const grossMovementEnergyCost = roundEnergy(
    BASE_MOVEMENT_ENERGY_COST_PER_HOUR *
      elapsedHours *
      speedMultiplier *
      enduranceMultiplier,
  )
  const shelterSavingPercent = calculateShelterSavingPercent(
    input.riderCount,
    input.cooperationLevel,
  )
  const shelterEnergySaving = roundEnergy(
    grossMovementEnergyCost * shelterSavingPercent,
  )
  const movementEnergyCost = roundEnergy(
    Math.max(0, grossMovementEnergyCost - shelterEnergySaving),
  )
  const attackEnergyCost = roundEnergy(input.attackEnergyCost ?? 0)
  const energyCostSincePreviousCheckpoint = roundEnergy(
    movementEnergyCost + attackEnergyCost,
  )
  const energyAfter = roundEnergy(
    Math.max(0, input.currentEnergy - energyCostSincePreviousCheckpoint),
  )

  return {
    freshness: roundEnergy(input.freshness),
    energyBefore: roundEnergy(input.currentEnergy),
    grossMovementEnergyCost,
    shelterSavingPercent,
    shelterEnergySaving,
    movementEnergyCost,
    attackEnergyCost,
    energyCostSincePreviousCheckpoint,
    energyAfter,
  }
}
