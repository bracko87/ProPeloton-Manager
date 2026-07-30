/**
 * groupCrashOutcome.ts
 *
 * Pure deterministic group-crash outcome.
 *
 * Responsibilities:
 * - validate the source group;
 * - select an input-order-independent affected rider subset;
 * - calculate deterministic severity-bounded shared time loss;
 * - calculate shared physical distance and gap loss;
 * - produce stable incident and selection hashes.
 *
 * No SimulationState mutation, replay event creation, persistence, injury,
 * database access, or production execution occurs here.
 */

import {
  createCanonicalHashedValue,
} from './canonicalSerialization'

export type GroupCrashSeverity =
  | 'minor'
  | 'moderate'
  | 'serious'

export interface GroupCrashOutcomeInput {
  readonly raceId: string
  readonly stageId: string
  readonly seed: string
  readonly occurrenceIndex: number

  readonly sourceGroupId: string
  readonly sourceRiderIds:
    readonly string[]

  readonly raceSecond: number
  readonly sourceDistanceKm: number
  readonly sourceGapFromLeaderSeconds: number
  readonly sourceSpeedKmh: number

  readonly severity:
    GroupCrashSeverity
}

export interface GroupCrashOutcome {
  readonly incidentId: string
  readonly deterministicHash: string
  readonly selectionHash: string
  readonly timeLossHash: string

  readonly severity:
    GroupCrashSeverity

  readonly sourceRiderCount: number
  readonly minimumAffectedRiderCount: number
  readonly maximumAffectedRiderCount: number
  readonly affectedRiderCount: number
  readonly affectedRiderIds:
    readonly string[]

  readonly affectedCountRoll: number
  readonly timeLossRoll: number

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

const MINIMUM_SOURCE_GROUP_SIZE =
  6

const MINIMUM_AFFECTED_RIDER_COUNT =
  2

const ABSOLUTE_MAXIMUM_AFFECTED_RIDER_COUNT =
  6

const SEVERITY_RANGES:
  Readonly<
    Record<
      GroupCrashSeverity,
      SeverityRange
    >
  > = {
    minor: {
      minimum: 20,
      maximum: 45,
    },
    moderate: {
      minimum: 46,
      maximum: 100,
    },
    serious: {
      minimum: 101,
      maximum: 210,
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
      `calculateGroupCrashOutcome: ${fieldName} must be a non-empty string.`,
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
      `calculateGroupCrashOutcome: ${fieldName} must be finite and between ${minimum} and ${maximum}.`,
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

function rollFromHash(
  hash: string,
): number {
  const numerator =
    Number.parseInt(
      hash.slice(0, 13),
      16,
    )

  return roundValue(
    numerator /
      0x10000000000000,
    12,
  )
}

function stableUniqueRiderIds(
  riderIds:
    readonly string[],
): readonly string[] {
  const normalized =
    riderIds.map(
      (riderId) => {
        assertNonEmpty(
          riderId,
          'sourceRiderIds[]',
        )

        return riderId
      },
    )

  const unique =
    Array.from(
      new Set(
        normalized,
      ),
    )

  if (
    unique.length !==
    normalized.length
  ) {
    throw new Error(
      'calculateGroupCrashOutcome: sourceRiderIds must not contain duplicates.',
    )
  }

  return unique.sort(
    (left, right) =>
      left.localeCompare(
        right,
      ),
  )
}

function integerFromRoll(
  minimum: number,
  maximum: number,
  roll: number,
): number {
  const optionCount =
    maximum -
    minimum +
    1

  return Math.min(
    maximum,
    minimum +
      Math.floor(
        roll *
          optionCount,
      ),
  )
}

function selectAffectedRiderIds(
  riderIds:
    readonly string[],
  incidentHash: string,
  affectedRiderCount: number,
): readonly string[] {
  return riderIds
    .map(
      (riderId) => ({
        riderId,
        rankingHash:
          createCanonicalHashedValue({
            contract:
              'group_crash_rider_ranking_v1',
            incidentHash,
            riderId,
          }).hash,
      }),
    )
    .sort(
      (left, right) =>
        left.rankingHash.localeCompare(
          right.rankingHash,
        ) ||
        left.riderId.localeCompare(
          right.riderId,
        ),
    )
    .slice(
      0,
      affectedRiderCount,
    )
    .map(
      (entry) =>
        entry.riderId,
    )
    .sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )
}

/**
 * Calculate one deterministic shared group-crash outcome.
 */
export function calculateGroupCrashOutcome(
  input:
    GroupCrashOutcomeInput,
): GroupCrashOutcome {
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
      'calculateGroupCrashOutcome: occurrenceIndex must be a non-negative integer.',
    )
  }

  if (
    !Number.isInteger(
      input.raceSecond,
    ) ||
    input.raceSecond < 0
  ) {
    throw new Error(
      'calculateGroupCrashOutcome: raceSecond must be a non-negative integer.',
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

  const sourceRiderIds =
    stableUniqueRiderIds(
      input.sourceRiderIds,
    )

  if (
    sourceRiderIds.length <
    MINIMUM_SOURCE_GROUP_SIZE
  ) {
    throw new Error(
      `calculateGroupCrashOutcome: source group must contain at least ${MINIMUM_SOURCE_GROUP_SIZE} riders.`,
    )
  }

  const maximumAffectedRiderCount =
    Math.min(
      ABSOLUTE_MAXIMUM_AFFECTED_RIDER_COUNT,
      sourceRiderIds.length -
        1,
    )

  const deterministic =
    createCanonicalHashedValue({
      contract:
        'group_crash_outcome_v1',
      raceId:
        input.raceId,
      stageId:
        input.stageId,
      seed:
        input.seed,
      occurrenceIndex:
        input.occurrenceIndex,
      sourceGroupId:
        input.sourceGroupId,
      sourceRiderIds,
      raceSecond:
        input.raceSecond,
      severity:
        input.severity,
    })

  const countValue =
    createCanonicalHashedValue({
      contract:
        'group_crash_affected_count_v1',
      incidentHash:
        deterministic.hash,
    })

  const affectedCountRoll =
    rollFromHash(
      countValue.hash,
    )

  const affectedRiderCount =
    integerFromRoll(
      MINIMUM_AFFECTED_RIDER_COUNT,
      maximumAffectedRiderCount,
      affectedCountRoll,
    )

  const affectedRiderIds =
    selectAffectedRiderIds(
      sourceRiderIds,
      deterministic.hash,
      affectedRiderCount,
    )

  const selectionValue =
    createCanonicalHashedValue({
      contract:
        'group_crash_selection_v1',
      incidentHash:
        deterministic.hash,
      affectedRiderIds,
    })

  const range =
    SEVERITY_RANGES[
      input.severity
    ]

  const timeLossValue =
    createCanonicalHashedValue({
      contract:
        'group_crash_time_loss_v1',
      incidentHash:
        deterministic.hash,
      severity:
        input.severity,
      affectedRiderIds,
    })

  const timeLossRoll =
    rollFromHash(
      timeLossValue.hash,
    )

  const timeLossSeconds =
    integerFromRoll(
      range.minimum,
      range.maximum,
      timeLossRoll,
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
        'group_crash',
        deterministic.hash,
      ].join(':'),

    deterministicHash:
      deterministic.hash,
    selectionHash:
      selectionValue.hash,
    timeLossHash:
      timeLossValue.hash,

    severity:
      input.severity,

    sourceRiderCount:
      sourceRiderIds.length,
    minimumAffectedRiderCount:
      MINIMUM_AFFECTED_RIDER_COUNT,
    maximumAffectedRiderCount,
    affectedRiderCount,
    affectedRiderIds,

    affectedCountRoll,
    timeLossRoll,

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
