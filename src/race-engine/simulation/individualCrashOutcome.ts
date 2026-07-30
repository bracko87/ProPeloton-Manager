/**
 * individualCrashOutcome.ts
 *
 * Pure deterministic individual-rider crash outcome.
 *
 * This file calculates the incident identity, severity-bounded time loss,
 * physical distance loss, and post-crash group position. It does not mutate
 * race state, create database records, persist injuries, or activate
 * production execution.
 */

import {
  createCanonicalHashedValue,
} from './canonicalSerialization'

export type IndividualCrashSeverity =
  | 'minor'
  | 'moderate'
  | 'serious'

export interface IndividualCrashOutcomeInput {
  readonly raceId: string
  readonly stageId: string
  readonly seed: string
  readonly occurrenceIndex: number

  readonly riderId: string
  readonly sourceGroupId: string

  readonly raceSecond: number
  readonly sourceDistanceKm: number
  readonly sourceGapFromLeaderSeconds: number
  readonly sourceSpeedKmh: number

  readonly severity:
    IndividualCrashSeverity
}

export interface IndividualCrashOutcome {
  readonly incidentId: string
  readonly deterministicHash: string
  readonly deterministicRoll: number

  readonly severity:
    IndividualCrashSeverity

  readonly minimumTimeLossSeconds: number
  readonly maximumTimeLossSeconds: number
  readonly timeLossSeconds: number

  readonly sourceDistanceKm: number
  readonly targetDistanceKm: number
  readonly distanceLossKm: number

  readonly sourceGapFromLeaderSeconds: number
  readonly targetGapFromLeaderSeconds: number
}

interface SeverityRange {
  readonly minimum: number
  readonly maximum: number
}

const SEVERITY_RANGES:
  Readonly<
    Record<
      IndividualCrashSeverity,
      SeverityRange
    >
  > = {
    minor: {
      minimum: 15,
      maximum: 35,
    },
    moderate: {
      minimum: 36,
      maximum: 90,
    },
    serious: {
      minimum: 91,
      maximum: 180,
    },
  }

function assertNonEmpty(
  value: string,
  fieldName: string,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `calculateIndividualCrashOutcome: ${fieldName} must be a non-empty string.`,
    )
  }
}

function assertFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `calculateIndividualCrashOutcome: ${fieldName} must be finite and between ${minimum} and ${maximum}.`,
    )
  }
}

function roundValue(
  value: number,
  digits = 9,
): number {
  return Number(
    value.toFixed(digits),
  )
}

function probabilityRollFromHash(
  hash: string,
): number {
  const numerator =
    Number.parseInt(
      hash.slice(0, 13),
      16,
    )

  const denominator =
    0x10000000000000

  return roundValue(
    numerator /
      denominator,
    12,
  )
}

function timeLossFromRoll(
  range: SeverityRange,
  roll: number,
): number {
  const outcomeCount =
    range.maximum -
    range.minimum +
    1

  return Math.min(
    range.maximum,
    range.minimum +
      Math.floor(
        roll *
          outcomeCount,
      ),
  )
}

/**
 * Calculate one deterministic individual-crash outcome.
 */
export function calculateIndividualCrashOutcome(
  input:
    IndividualCrashOutcomeInput,
): IndividualCrashOutcome {
  assertNonEmpty(
    input.raceId,
    'raceId',
  )
  assertNonEmpty(
    input.stageId,
    'stageId',
  )
  assertNonEmpty(
    input.seed,
    'seed',
  )
  assertNonEmpty(
    input.riderId,
    'riderId',
  )
  assertNonEmpty(
    input.sourceGroupId,
    'sourceGroupId',
  )

  if (
    !Number.isInteger(
      input.occurrenceIndex,
    ) ||
    input.occurrenceIndex < 0
  ) {
    throw new Error(
      'calculateIndividualCrashOutcome: occurrenceIndex must be a non-negative integer.',
    )
  }

  if (
    !Number.isInteger(
      input.raceSecond,
    ) ||
    input.raceSecond < 0
  ) {
    throw new Error(
      'calculateIndividualCrashOutcome: raceSecond must be a non-negative integer.',
    )
  }

  assertFiniteRange(
    input.sourceDistanceKm,
    0,
    1000,
    'sourceDistanceKm',
  )
  assertFiniteRange(
    input.sourceGapFromLeaderSeconds,
    0,
    1_000_000,
    'sourceGapFromLeaderSeconds',
  )
  assertFiniteRange(
    input.sourceSpeedKmh,
    0,
    200,
    'sourceSpeedKmh',
  )

  const range =
    SEVERITY_RANGES[
      input.severity
    ]

  const deterministic =
    createCanonicalHashedValue({
      contract:
        'individual_rider_crash_outcome_v1',
      raceId:
        input.raceId,
      stageId:
        input.stageId,
      seed:
        input.seed,
      occurrenceIndex:
        input.occurrenceIndex,
      riderId:
        input.riderId,
      sourceGroupId:
        input.sourceGroupId,
      raceSecond:
        input.raceSecond,
      severity:
        input.severity,
    })

  const deterministicRoll =
    probabilityRollFromHash(
      deterministic.hash,
    )

  const timeLossSeconds =
    timeLossFromRoll(
      range,
      deterministicRoll,
    )

  const unboundedDistanceLossKm =
    input.sourceSpeedKmh *
    (
      timeLossSeconds /
      3600
    )

  const targetDistanceKm =
    roundValue(
      Math.max(
        0,
        input.sourceDistanceKm -
          unboundedDistanceLossKm,
      ),
    )

  const distanceLossKm =
    roundValue(
      input.sourceDistanceKm -
      targetDistanceKm,
    )

  return {
    incidentId:
      [
        input.raceId,
        input.stageId,
        'individual_crash',
        deterministic.hash,
      ].join(':'),

    deterministicHash:
      deterministic.hash,
    deterministicRoll,

    severity:
      input.severity,

    minimumTimeLossSeconds:
      range.minimum,
    maximumTimeLossSeconds:
      range.maximum,
    timeLossSeconds,

    sourceDistanceKm:
      input.sourceDistanceKm,
    targetDistanceKm,
    distanceLossKm,

    sourceGapFromLeaderSeconds:
      input
        .sourceGapFromLeaderSeconds,
    targetGapFromLeaderSeconds:
      roundValue(
        input
          .sourceGapFromLeaderSeconds +
        timeLossSeconds,
      ),
  }
}
