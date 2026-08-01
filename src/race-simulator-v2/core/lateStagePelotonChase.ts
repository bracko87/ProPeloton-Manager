/**
 * lateStagePelotonChase.ts
 *
 * Pure deterministic late-stage chase decision and speed calculation for B1.8.
 *
 * The chase activates only when:
 * - a breakaway remains ahead;
 * - the race has reached the configured late-stage progress threshold;
 * - the stage has not already finished.
 */

const SPEED_PRECISION = 1_000
const PROGRESS_PRECISION = 1_000_000

export interface LateStagePelotonChaseInput {
  stageDistanceKm: number
  currentKm: number
  breakawayAhead: boolean
  pelotonBaseSpeedKmh: number
  chaseStartProgress: number
  pelotonChaseSpeedBonusKmh: number
}

export interface LateStagePelotonChaseResult {
  chaseActive: boolean
  stageProgress: number
  chaseStartProgress: number
  baseSpeedKmh: number
  chaseSpeedBonusKmh: number
  effectiveSpeedKmh: number
}

function roundSpeedKmh(value: number): number {
  return Math.round(value * SPEED_PRECISION) / SPEED_PRECISION
}

function roundProgress(value: number): number {
  return Math.round(value * PROGRESS_PRECISION) / PROGRESS_PRECISION
}

function validateInput(input: LateStagePelotonChaseInput): void {
  if (!Number.isFinite(input.stageDistanceKm) || input.stageDistanceKm <= 0) {
    throw new Error('stageDistanceKm must be a positive finite number')
  }

  if (
    !Number.isFinite(input.currentKm) ||
    input.currentKm < 0 ||
    input.currentKm > input.stageDistanceKm
  ) {
    throw new Error('currentKm must be within the stage distance')
  }

  if (!Number.isFinite(input.pelotonBaseSpeedKmh) || input.pelotonBaseSpeedKmh <= 0) {
    throw new Error('pelotonBaseSpeedKmh must be a positive finite number')
  }

  if (
    !Number.isFinite(input.chaseStartProgress) ||
    input.chaseStartProgress <= 0 ||
    input.chaseStartProgress >= 1
  ) {
    throw new Error('chaseStartProgress must be between zero and one')
  }

  if (
    !Number.isFinite(input.pelotonChaseSpeedBonusKmh) ||
    input.pelotonChaseSpeedBonusKmh <= 0
  ) {
    throw new Error('pelotonChaseSpeedBonusKmh must be a positive finite number')
  }
}

/**
 * Decide whether the late-stage chase is active and return the resulting
 * peloton speed. The function has no side effects and consumes no RNG values.
 */
export function calculateLateStagePelotonChase(
  input: LateStagePelotonChaseInput,
): LateStagePelotonChaseResult {
  validateInput(input)

  const stageProgress = roundProgress(input.currentKm / input.stageDistanceKm)
  const chaseActive =
    input.breakawayAhead &&
    stageProgress >= input.chaseStartProgress &&
    input.currentKm < input.stageDistanceKm
  const chaseSpeedBonusKmh = chaseActive
    ? roundSpeedKmh(input.pelotonChaseSpeedBonusKmh)
    : 0

  return {
    chaseActive,
    stageProgress,
    chaseStartProgress: input.chaseStartProgress,
    baseSpeedKmh: roundSpeedKmh(input.pelotonBaseSpeedKmh),
    chaseSpeedBonusKmh,
    effectiveSpeedKmh: roundSpeedKmh(
      input.pelotonBaseSpeedKmh + chaseSpeedBonusKmh,
    ),
  }
}
