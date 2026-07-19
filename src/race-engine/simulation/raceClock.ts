/**
 * raceClock.ts
 *
 * Deterministic race-clock utilities for advancing the simulation time.
 * No wall-clock interaction or randomness is used here.
 */

/**
 * RaceClockAdvance
 * Describes a single deterministic advancement of the race clock.
 */
export interface RaceClockAdvance {
  readonly previousRaceSecond: number
  readonly nextRaceSecond: number
  readonly elapsedSeconds: number
}

/**
 * advanceRaceClock
 * Advances the discrete race clock by a fixed tick size (in seconds).
 *
 * Validation:
 * - currentRaceSecond must be a non-negative integer.
 * - tickSeconds must be a positive integer.
 * - Throws RangeError for invalid values.
 */
export function advanceRaceClock(
  currentRaceSecond: number,
  tickSeconds: number,
): RaceClockAdvance {
  if (!Number.isInteger(currentRaceSecond) || currentRaceSecond < 0) {
    throw new RangeError(
      'advanceRaceClock: currentRaceSecond must be a non-negative integer.',
    )
  }

  if (!Number.isInteger(tickSeconds) || tickSeconds <= 0) {
    throw new RangeError(
      'advanceRaceClock: tickSeconds must be a positive integer.',
    )
  }

  const nextRaceSecond = currentRaceSecond + tickSeconds

  return {
    previousRaceSecond: currentRaceSecond,
    nextRaceSecond,
    elapsedSeconds: tickSeconds,
  }
}