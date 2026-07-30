/**
 * stagingDualRunComparison.ts
 *
 * Pure comparison contract for one legacy/new-engine staging dual run.
 *
 * It compares already-produced summaries only. It does not execute either
 * engine and does not write any result.
 */

export interface DualRunRiderClassification {
  readonly riderId: string
  readonly finishPosition:
    number | null
  readonly finishTimeSeconds:
    number | null
  readonly finished: boolean
}

export interface DualRunEventSummary {
  readonly eventType: string
  readonly raceSecond: number
  readonly actorRiderId:
    string | null
  readonly relatedRiderIds:
    readonly string[]
}

export interface StageRunComparisonInput {
  readonly runId: string
  readonly stageId: string
  readonly sourceBundleHash: string
  readonly riderCount: number
  readonly classifications:
    readonly DualRunRiderClassification[]
  readonly events:
    readonly DualRunEventSummary[]
  readonly replayValid: boolean
  readonly runtimeDurationMs: number
  readonly writerCallCount: number
}

export interface DualRunComparisonTolerance {
  readonly maximumFinishTimeDifferenceSeconds:
    number
  readonly requireExactFinishOrder:
    boolean
  readonly requireExactEventCount:
    boolean
}

export interface RiderDifference {
  readonly riderId: string
  readonly legacyPosition:
    number | null
  readonly deterministicPosition:
    number | null
  readonly legacyTimeSeconds:
    number | null
  readonly deterministicTimeSeconds:
    number | null
  readonly absoluteTimeDifferenceSeconds:
    number | null
}

export interface DualRunComparisonReport {
  readonly passed: boolean
  readonly sourceBundleMatches:
    boolean
  readonly stageMatches: boolean
  readonly riderCoverageMatches:
    boolean
  readonly finishOrderMatches:
    boolean
  readonly finishTimeTolerancePassed:
    boolean
  readonly eventCountMatches:
    boolean
  readonly deterministicReplayValid:
    boolean
  readonly legacyWriterOnly:
    boolean
  readonly riderDifferences:
    readonly RiderDifference[]
  readonly issues:
    readonly string[]
}

function assertNonNegativeFinite(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `compareStagingDualRun: ${fieldName} must be a non-negative finite number.`,
    )
  }
}

function classificationMap(
  classifications:
    readonly DualRunRiderClassification[],
): Readonly<
  Map<
    string,
    DualRunRiderClassification
  >
> {
  const map =
    new Map<
      string,
      DualRunRiderClassification
    >()

  for (
    const classification of
    classifications
  ) {
    if (
      !classification
        .riderId
        .trim()
    ) {
      throw new Error(
        'compareStagingDualRun: riderId must be non-empty.',
      )
    }

    if (
      map.has(
        classification.riderId,
      )
    ) {
      throw new Error(
        `compareStagingDualRun: duplicate rider ${classification.riderId}.`,
      )
    }

    map.set(
      classification.riderId,
      classification,
    )
  }

  return map
}

function sortedFinishOrder(
  classifications:
    readonly DualRunRiderClassification[],
): readonly string[] {
  return classifications
    .filter(
      (classification) =>
        classification.finished &&
        classification
          .finishPosition !==
          null,
    )
    .slice()
    .sort(
      (
        left,
        right,
      ) =>
        (
          left.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) -
        (
          right.finishPosition ??
          Number.MAX_SAFE_INTEGER
        ) ||
        left.riderId.localeCompare(
          right.riderId,
        ),
    )
    .map(
      (classification) =>
        classification.riderId,
    )
}

export function compareStagingDualRun(
  input: {
    readonly legacy:
      StageRunComparisonInput
    readonly deterministic:
      StageRunComparisonInput
    readonly tolerance:
      DualRunComparisonTolerance
  },
): DualRunComparisonReport {
  assertNonNegativeFinite(
    input
      .tolerance
      .maximumFinishTimeDifferenceSeconds,
    'maximumFinishTimeDifferenceSeconds',
  )

  assertNonNegativeFinite(
    input
      .legacy
      .runtimeDurationMs,
    'legacy.runtimeDurationMs',
  )

  assertNonNegativeFinite(
    input
      .deterministic
      .runtimeDurationMs,
    'deterministic.runtimeDurationMs',
  )

  if (
    !Number.isInteger(
      input.legacy.writerCallCount,
    ) ||
    input.legacy.writerCallCount <
      0 ||
    !Number.isInteger(
      input
        .deterministic
        .writerCallCount,
    ) ||
    input
      .deterministic
      .writerCallCount <
      0
  ) {
    throw new Error(
      'compareStagingDualRun: writerCallCount must be a non-negative integer.',
    )
  }

  const legacyMap =
    classificationMap(
      input
        .legacy
        .classifications,
    )

  const deterministicMap =
    classificationMap(
      input
        .deterministic
        .classifications,
    )

  const allRiderIds =
    Array.from(
      new Set([
        ...legacyMap.keys(),
        ...deterministicMap.keys(),
      ]),
    ).sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )

  const riderDifferences:
    RiderDifference[] =
      allRiderIds.map(
        (riderId) => {
          const legacy =
            legacyMap.get(
              riderId,
            )

          const deterministic =
            deterministicMap.get(
              riderId,
            )

          const legacyTime =
            legacy
              ?.finishTimeSeconds ??
            null

          const deterministicTime =
            deterministic
              ?.finishTimeSeconds ??
            null

          return {
            riderId,

            legacyPosition:
              legacy
                ?.finishPosition ??
              null,

            deterministicPosition:
              deterministic
                ?.finishPosition ??
              null,

            legacyTimeSeconds:
              legacyTime,

            deterministicTimeSeconds:
              deterministicTime,

            absoluteTimeDifferenceSeconds:
              legacyTime !==
                null &&
              deterministicTime !==
                null
                ? Math.abs(
                    legacyTime -
                    deterministicTime,
                  )
                : null,
          }
        },
      )

  const sourceBundleMatches =
    input
      .legacy
      .sourceBundleHash ===
    input
      .deterministic
      .sourceBundleHash

  const stageMatches =
    input.legacy.stageId ===
    input
      .deterministic
      .stageId

  const riderCoverageMatches =
    input.legacy.riderCount ===
      input
        .deterministic
        .riderCount &&
    legacyMap.size ===
      deterministicMap.size &&
    allRiderIds.every(
      (riderId) =>
        legacyMap.has(
          riderId,
        ) &&
        deterministicMap.has(
          riderId,
        ),
    )

  const finishOrderMatches =
    JSON.stringify(
      sortedFinishOrder(
        input
          .legacy
          .classifications,
      ),
    ) ===
    JSON.stringify(
      sortedFinishOrder(
        input
          .deterministic
          .classifications,
      ),
    )

  const finishTimeTolerancePassed =
    riderDifferences.every(
      (difference) =>
        difference
          .absoluteTimeDifferenceSeconds ===
          null ||
        difference
          .absoluteTimeDifferenceSeconds <=
          input
            .tolerance
            .maximumFinishTimeDifferenceSeconds,
    )

  const eventCountMatches =
    input.legacy.events.length ===
    input
      .deterministic
      .events
      .length

  const deterministicReplayValid =
    input
      .deterministic
      .replayValid

  const legacyWriterOnly =
    input.legacy.writerCallCount >=
      0 &&
    input
      .deterministic
      .writerCallCount ===
      0

  const issues:
    string[] = []

  if (!sourceBundleMatches) {
    issues.push(
      'Legacy and deterministic runs do not use the same source bundle hash.',
    )
  }

  if (!stageMatches) {
    issues.push(
      'Legacy and deterministic runs do not target the same stage.',
    )
  }

  if (!riderCoverageMatches) {
    issues.push(
      'Legacy and deterministic rider coverage differs.',
    )
  }

  if (
    input
      .tolerance
      .requireExactFinishOrder &&
    !finishOrderMatches
  ) {
    issues.push(
      'Finish order differs while exact finish order is required.',
    )
  }

  if (!finishTimeTolerancePassed) {
    issues.push(
      'At least one rider exceeds the configured finish-time tolerance.',
    )
  }

  if (
    input
      .tolerance
      .requireExactEventCount &&
    !eventCountMatches
  ) {
    issues.push(
      'Event count differs while exact event count is required.',
    )
  }

  if (!deterministicReplayValid) {
    issues.push(
      'Deterministic replay validation failed.',
    )
  }

  if (!legacyWriterOnly) {
    issues.push(
      'Shadow mode must keep deterministic writerCallCount at zero.',
    )
  }

  return {
    passed:
      issues.length ===
      0,

    sourceBundleMatches,
    stageMatches,
    riderCoverageMatches,
    finishOrderMatches,
    finishTimeTolerancePassed,
    eventCountMatches,
    deterministicReplayValid,
    legacyWriterOnly,
    riderDifferences,
    issues,
  }
}
