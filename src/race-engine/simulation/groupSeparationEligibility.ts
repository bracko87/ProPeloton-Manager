/**
 * groupSeparationEligibility.ts
 *
 * Pure deterministic sustained-separation eligibility tracking.
 *
 * This utility converts one rider's current group-hold classification into a
 * consecutive cannot-hold duration and reports which configured duration
 * thresholds have been reached.
 *
 * It does not mutate SimulationState, move riders, create groups, emit events,
 * access Supabase, or activate production execution.
 */

import type {
  RiderGroupHoldStatus,
} from './groupHold'

export const DEFAULT_SEPARATION_WINDOWS_SECONDS =
  [60, 120, 180] as const

export interface RiderSeparationEligibilityInput {
  readonly riderId: string
  readonly holdStatus: RiderGroupHoldStatus
  readonly previousConsecutiveCannotHoldSeconds: number
  readonly tickSeconds: number
  readonly eligibilityWindowsSeconds?:
    readonly number[]
}

export interface RiderSeparationEligibilityResult {
  readonly riderId: string
  readonly holdStatus: RiderGroupHoldStatus
  readonly previousConsecutiveCannotHoldSeconds: number
  readonly nextConsecutiveCannotHoldSeconds: number
  readonly resetThisTick: boolean
  readonly eligibleWindowsSeconds:
    readonly number[]
  readonly newlyReachedWindowsSeconds:
    readonly number[]
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `calculateRiderSeparationEligibility: ${fieldName} must be finite and non-negative.`,
    )
  }
}

function normalizeWindows(
  windows:
    readonly number[],
): readonly number[] {
  const normalized =
    windows
      .slice()
      .sort(
        (left, right) =>
          left - right,
      )

  const unique:
    number[] = []

  for (const window of normalized) {
    if (
      !Number.isInteger(window) ||
      window <= 0
    ) {
      throw new Error(
        'calculateRiderSeparationEligibility: every eligibility window must be a positive integer.',
      )
    }

    if (
      unique[
        unique.length - 1
      ] !== window
    ) {
      unique.push(window)
    }
  }

  if (unique.length === 0) {
    throw new Error(
      'calculateRiderSeparationEligibility: at least one eligibility window is required.',
    )
  }

  return unique
}

/**
 * Updates one rider's sustained cannot-hold duration.
 *
 * Rules:
 * - cannot_hold adds exactly tickSeconds;
 * - comfortable or under_pressure resets the duration to zero;
 * - crossing a window is reported once through newlyReachedWindowsSeconds;
 * - being at or above a window is reported through eligibleWindowsSeconds.
 */
export function calculateRiderSeparationEligibility(
  input:
    RiderSeparationEligibilityInput,
): RiderSeparationEligibilityResult {
  const {
    riderId,
    holdStatus,
    previousConsecutiveCannotHoldSeconds,
    tickSeconds,
  } = input

  if (
    typeof riderId !== 'string' ||
    riderId.trim().length === 0
  ) {
    throw new Error(
      'calculateRiderSeparationEligibility: riderId must be a non-empty string.',
    )
  }

  assertFiniteNonNegative(
    previousConsecutiveCannotHoldSeconds,
    'previousConsecutiveCannotHoldSeconds',
  )

  if (
    !Number.isInteger(
      previousConsecutiveCannotHoldSeconds,
    )
  ) {
    throw new Error(
      'calculateRiderSeparationEligibility: previous duration must be an integer.',
    )
  }

  if (
    !Number.isInteger(
      tickSeconds,
    ) ||
    tickSeconds <= 0
  ) {
    throw new Error(
      'calculateRiderSeparationEligibility: tickSeconds must be a positive integer.',
    )
  }

  const windows =
    normalizeWindows(
      input
        .eligibilityWindowsSeconds ??
      DEFAULT_SEPARATION_WINDOWS_SECONDS,
    )

  const cannotHold =
    holdStatus ===
    'cannot_hold'

  const nextConsecutiveCannotHoldSeconds =
    cannotHold
      ? previousConsecutiveCannotHoldSeconds +
        tickSeconds
      : 0

  const eligibleWindowsSeconds =
    windows.filter(
      (window) =>
        nextConsecutiveCannotHoldSeconds >=
        window,
    )

  const newlyReachedWindowsSeconds =
    windows.filter(
      (window) =>
        previousConsecutiveCannotHoldSeconds <
          window &&
        nextConsecutiveCannotHoldSeconds >=
          window,
    )

  return {
    riderId,
    holdStatus,
    previousConsecutiveCannotHoldSeconds,
    nextConsecutiveCannotHoldSeconds,
    resetThisTick:
      !cannotHold &&
      previousConsecutiveCannotHoldSeconds >
        0,
    eligibleWindowsSeconds,
    newlyReachedWindowsSeconds,
  }
}
