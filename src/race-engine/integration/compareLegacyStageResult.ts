/**
 * compareLegacyStageResult.ts
 *
 * Pure, read-only comparison between:
 * - preserved legacy rider classification rows
 * - the deterministic TypeScript SimulationOutput
 *
 * This module:
 * - performs no database access
 * - performs no persistence
 * - does not mutate either input
 * - does not treat sporting-result differences as execution failures
 */

import type {
  SimulationOutput,
} from '../domain/SimulationOutput'

export interface LegacyRiderResultInput {
  readonly rider_id: string
  readonly team_id: string
  readonly rank: number | null
  readonly status: string
  readonly elapsed_seconds:
    number | null
}

export interface RiderCoverageDifference {
  readonly riderId: string
}

export interface RiderTeamDifference {
  readonly riderId: string
  readonly legacyTeamId: string
  readonly deterministicTeamId: string
}

export interface RiderStatusDifference {
  readonly riderId: string
  readonly legacyStatus: string
  readonly deterministicStatus: string
}

export interface RiderPositionDifference {
  readonly riderId: string
  readonly legacyPosition: number | null
  readonly deterministicPosition: number | null
  readonly absolutePositionDelta: number | null
}

export interface RiderFinishTimeDifference {
  readonly riderId: string
  readonly legacyTimeSeconds: number | null
  readonly deterministicTimeSeconds: number | null
  readonly deltaSeconds: number | null
  readonly absoluteDeltaSeconds: number | null
}

export interface LegacyStageComparisonReport {
  readonly legacyRiderCount: number
  readonly deterministicRiderCount: number
  readonly matchedRiderCount: number

  readonly missingFromLegacy:
    readonly RiderCoverageDifference[]

  readonly missingFromDeterministic:
    readonly RiderCoverageDifference[]

  readonly teamDifferences:
    readonly RiderTeamDifference[]

  readonly statusDifferences:
    readonly RiderStatusDifference[]

  readonly positionDifferences:
    readonly RiderPositionDifference[]

  readonly finishTimeDifferences:
    readonly RiderFinishTimeDifference[]

  readonly legacyWinnerRiderId:
    string | null

  readonly deterministicWinnerRiderId:
    string | null

  readonly sameWinner: boolean

  readonly exactPositionMatchCount: number
  readonly exactFinishTimeMatchCount: number

  readonly totalAbsolutePositionDelta: number
  readonly maximumAbsolutePositionDelta: number

  readonly totalAbsoluteFinishTimeDeltaSeconds:
    number

  readonly maximumAbsoluteFinishTimeDeltaSeconds:
    number

  readonly fullRiderCoverageMatch: boolean
  readonly allTeamIdsMatch: boolean
  readonly allStatusesMatch: boolean
  readonly allPositionsMatch: boolean
  readonly allFinishTimesMatch: boolean
}

function normalizeLegacyStatus(
  status: string,
): string {
  return status
    .trim()
    .toLowerCase()
}

function normalizeDeterministicStatus(
  status: string,
): string {
  return status
    .trim()
    .toLowerCase()
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
): boolean {
  return left === right
}

function calculateDelta(
  legacyValue: number | null,
  deterministicValue: number | null,
): number | null {
  if (
    legacyValue === null ||
    deterministicValue === null
  ) {
    return null
  }

  return (
    deterministicValue -
    legacyValue
  )
}

function calculateAbsoluteDelta(
  legacyValue: number | null,
  deterministicValue: number | null,
): number | null {
  const delta =
    calculateDelta(
      legacyValue,
      deterministicValue,
    )

  return delta === null
    ? null
    : Math.abs(delta)
}

function getWinnerRiderId(
  rows: readonly {
    readonly riderId: string
    readonly position: number | null
  }[],
): string | null {
  const winner =
    rows.find(
      (row) =>
        row.position === 1,
    )

  return winner?.riderId ?? null
}

export function compareLegacyStageResult(
  legacyResults:
    readonly LegacyRiderResultInput[],
  deterministicOutput:
    SimulationOutput,
): LegacyStageComparisonReport {
  const legacyByRiderId =
    new Map<
      string,
      LegacyRiderResultInput
    >()

  for (const result of legacyResults) {
    if (
      legacyByRiderId.has(
        result.rider_id,
      )
    ) {
      throw new Error(
        `Duplicate legacy rider result: ${result.rider_id}.`,
      )
    }

    legacyByRiderId.set(
      result.rider_id,
      result,
    )
  }

  const deterministicByRiderId =
    new Map(
      deterministicOutput
        .finalRiderStates
        .map(
          (rider) => [
            rider.riderId,
            rider,
          ] as const,
        ),
    )

  if (
    deterministicByRiderId.size !==
    deterministicOutput
      .finalRiderStates
      .length
  ) {
    throw new Error(
      'The deterministic output contains duplicate rider IDs.',
    )
  }

  const missingFromLegacy =
    deterministicOutput
      .finalRiderStates
      .filter(
        (rider) =>
          !legacyByRiderId.has(
            rider.riderId,
          ),
      )
      .map(
        (rider) => ({
          riderId: rider.riderId,
        }),
      )
      .sort(
        (left, right) =>
          left.riderId.localeCompare(
            right.riderId,
          ),
      )

  const missingFromDeterministic =
    legacyResults
      .filter(
        (result) =>
          !deterministicByRiderId.has(
            result.rider_id,
          ),
      )
      .map(
        (result) => ({
          riderId: result.rider_id,
        }),
      )
      .sort(
        (left, right) =>
          left.riderId.localeCompare(
            right.riderId,
          ),
      )

  const matchedRiderIds =
    [...legacyByRiderId.keys()]
      .filter(
        (riderId) =>
          deterministicByRiderId.has(
            riderId,
          ),
      )
      .sort(
        (left, right) =>
          left.localeCompare(right),
      )

  const teamDifferences:
    RiderTeamDifference[] = []

  const statusDifferences:
    RiderStatusDifference[] = []

  const positionDifferences:
    RiderPositionDifference[] = []

  const finishTimeDifferences:
    RiderFinishTimeDifference[] = []

  let exactPositionMatchCount = 0
  let exactFinishTimeMatchCount = 0

  let totalAbsolutePositionDelta = 0
  let maximumAbsolutePositionDelta = 0

  let totalAbsoluteFinishTimeDeltaSeconds =
    0

  let maximumAbsoluteFinishTimeDeltaSeconds =
    0

  for (
    const riderId of
    matchedRiderIds
  ) {
    const legacy =
      legacyByRiderId.get(
        riderId,
      )

    const deterministic =
      deterministicByRiderId.get(
        riderId,
      )

    if (
      !legacy ||
      !deterministic
    ) {
      throw new Error(
        `Matched rider lookup failed: ${riderId}.`,
      )
    }

    if (
      legacy.team_id !==
      deterministic.teamId
    ) {
      teamDifferences.push({
        riderId,
        legacyTeamId:
          legacy.team_id,
        deterministicTeamId:
          deterministic.teamId,
      })
    }

    const legacyStatus =
      normalizeLegacyStatus(
        legacy.status,
      )

    const deterministicStatus =
      normalizeDeterministicStatus(
        deterministic.stageStatus,
      )

    if (
      legacyStatus !==
      deterministicStatus
    ) {
      statusDifferences.push({
        riderId,
        legacyStatus,
        deterministicStatus,
      })
    }

    const legacyPosition =
      legacy.rank

    const deterministicPosition =
      deterministic.finishPosition

    if (
      compareNullableNumbers(
        legacyPosition,
        deterministicPosition,
      )
    ) {
      exactPositionMatchCount += 1
    } else {
      const absolutePositionDelta =
        calculateAbsoluteDelta(
          legacyPosition,
          deterministicPosition,
        )

      positionDifferences.push({
        riderId,
        legacyPosition,
        deterministicPosition,
        absolutePositionDelta,
      })

      if (
        absolutePositionDelta !==
        null
      ) {
        totalAbsolutePositionDelta +=
          absolutePositionDelta

        maximumAbsolutePositionDelta =
          Math.max(
            maximumAbsolutePositionDelta,
            absolutePositionDelta,
          )
      }
    }

    const legacyTimeSeconds =
      legacy.elapsed_seconds

    const deterministicTimeSeconds =
      deterministic
        .finishTimeSeconds

    if (
      compareNullableNumbers(
        legacyTimeSeconds,
        deterministicTimeSeconds,
      )
    ) {
      exactFinishTimeMatchCount += 1
    } else {
      const deltaSeconds =
        calculateDelta(
          legacyTimeSeconds,
          deterministicTimeSeconds,
        )

      const absoluteDeltaSeconds =
        calculateAbsoluteDelta(
          legacyTimeSeconds,
          deterministicTimeSeconds,
        )

      finishTimeDifferences.push({
        riderId,
        legacyTimeSeconds,
        deterministicTimeSeconds,
        deltaSeconds,
        absoluteDeltaSeconds,
      })

      if (
        absoluteDeltaSeconds !==
        null
      ) {
        totalAbsoluteFinishTimeDeltaSeconds +=
          absoluteDeltaSeconds

        maximumAbsoluteFinishTimeDeltaSeconds =
          Math.max(
            maximumAbsoluteFinishTimeDeltaSeconds,
            absoluteDeltaSeconds,
          )
      }
    }
  }

  const legacyWinnerRiderId =
    getWinnerRiderId(
      legacyResults.map(
        (result) => ({
          riderId:
            result.rider_id,
          position:
            result.rank,
        }),
      ),
    )

  const deterministicWinnerRiderId =
    getWinnerRiderId(
      deterministicOutput
        .finalRiderStates
        .map(
          (rider) => ({
            riderId:
              rider.riderId,
            position:
              rider.finishPosition,
          }),
        ),
    )

  const fullRiderCoverageMatch =
    missingFromLegacy.length === 0 &&
    missingFromDeterministic.length === 0

  return {
    legacyRiderCount:
      legacyResults.length,

    deterministicRiderCount:
      deterministicOutput
        .finalRiderStates
        .length,

    matchedRiderCount:
      matchedRiderIds.length,

    missingFromLegacy,
    missingFromDeterministic,

    teamDifferences,
    statusDifferences,
    positionDifferences,
    finishTimeDifferences,

    legacyWinnerRiderId,
    deterministicWinnerRiderId,

    sameWinner:
      legacyWinnerRiderId !==
        null &&
      legacyWinnerRiderId ===
        deterministicWinnerRiderId,

    exactPositionMatchCount,
    exactFinishTimeMatchCount,

    totalAbsolutePositionDelta,
    maximumAbsolutePositionDelta,

    totalAbsoluteFinishTimeDeltaSeconds,
    maximumAbsoluteFinishTimeDeltaSeconds,

    fullRiderCoverageMatch,

    allTeamIdsMatch:
      teamDifferences.length === 0,

    allStatusesMatch:
      statusDifferences.length === 0,

    allPositionsMatch:
      positionDifferences.length === 0,

    allFinishTimesMatch:
      finishTimeDifferences.length === 0,
  }
}