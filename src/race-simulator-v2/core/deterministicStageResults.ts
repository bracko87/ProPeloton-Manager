/**
 * deterministicStageResults.ts
 *
 * Creates final deterministic rider result rows from a completed B1.9 catch or
 * survival checkpoint sequence.
 *
 * Purpose:
 * - create exactly one final row for every controlled rider;
 * - calculate the physical finishing time for every finishing group;
 * - keep riders in the same finishing group on the same elapsed time;
 * - assign contiguous ranks using an explicit stable tie-break order;
 * - calculate deterministic gaps from the stage winner;
 * - remain pure and persistence-free.
 */

import type {
  BreakawayOutcomeCheckpointSequenceResult,
} from './breakawayOutcomeCheckpointSequence'
import type { GroupSnapshot } from '../types/checkpoint'
import type { RiderInput } from '../types/rider'
import type { StageInput } from '../types/stage'
import type {
  DeterministicStageResults,
  RiderStageResult,
  StageResultTieBreakAttribute,
} from '../types/stageResult'

const RESULT_TIME_PRECISION = 1_000
const RESULT_GAP_PRECISION = 1_000
const FINISH_DISTANCE_TOLERANCE_KM = 0.000001

export interface DeterministicStageResultsOptions {
  tieBreakAttributeOrder: readonly StageResultTieBreakAttribute[]
}

type FinishingGroup = {
  group: GroupSnapshot
  finishTimeSeconds: number
}

function roundResultTime(value: number): number {
  return Math.round(value * RESULT_TIME_PRECISION) / RESULT_TIME_PRECISION
}

function roundResultGap(value: number): number {
  return Math.round(value * RESULT_GAP_PRECISION) / RESULT_GAP_PRECISION
}

function validateTieBreakAttributes(
  attributes: readonly StageResultTieBreakAttribute[],
): void {
  if (attributes.length === 0) {
    throw new Error('B1.10 requires at least one tie-break attribute')
  }

  if (new Set(attributes).size !== attributes.length) {
    throw new Error('B1.10 tie-break attributes must be unique')
  }
}

function validateRiders(riders: readonly RiderInput[]): Map<string, RiderInput> {
  if (riders.length === 0) {
    throw new Error('B1.10 requires riders')
  }

  const riderById = new Map<string, RiderInput>()

  for (const rider of riders) {
    if (!rider.riderId.trim()) {
      throw new Error('Every B1.10 rider requires a riderId')
    }

    if (riderById.has(rider.riderId)) {
      throw new Error(`Duplicate B1.10 rider: ${rider.riderId}`)
    }

    riderById.set(rider.riderId, rider)
  }

  return riderById
}

function calculateGroupFinishTimeSeconds(
  stage: StageInput,
  checkpointRaceSecond: number,
  group: GroupSnapshot,
): number {
  if (!Number.isFinite(group.distanceKm) || group.distanceKm < 0) {
    throw new Error(`Invalid B1.10 group distance: ${group.groupId}`)
  }

  if (group.distanceKm > stage.distanceKm + FINISH_DISTANCE_TOLERANCE_KM) {
    throw new Error(`B1.10 group exceeds stage distance: ${group.groupId}`)
  }

  if (group.distanceKm >= stage.distanceKm - FINISH_DISTANCE_TOLERANCE_KM) {
    return roundResultTime(checkpointRaceSecond)
  }

  if (!Number.isFinite(group.speedKmh) || group.speedKmh <= 0) {
    throw new Error(`Unfinished B1.10 group requires positive speed: ${group.groupId}`)
  }

  const remainingSeconds =
    ((stage.distanceKm - group.distanceKm) / group.speedKmh) * 3600

  return roundResultTime(checkpointRaceSecond + remainingSeconds)
}

function compareRiders(
  first: RiderInput,
  second: RiderInput,
  tieBreakAttributeOrder: readonly StageResultTieBreakAttribute[],
): number {
  for (const attribute of tieBreakAttributeOrder) {
    const difference = second[attribute] - first[attribute]

    if (difference !== 0) return difference
  }

  return first.riderId.localeCompare(second.riderId)
}

function validateFinalMembership(
  groups: readonly GroupSnapshot[],
  riderById: ReadonlyMap<string, RiderInput>,
): void {
  if (groups.length === 0) {
    throw new Error('B1.10 requires at least one finishing group')
  }

  const groupedRiderIds = groups.flatMap((group) => group.riderIds)

  if (groupedRiderIds.length !== riderById.size) {
    throw new Error('B1.10 finishing groups must contain every rider exactly once')
  }

  if (new Set(groupedRiderIds).size !== groupedRiderIds.length) {
    throw new Error('B1.10 finishing groups contain duplicate riders')
  }

  for (const riderId of groupedRiderIds) {
    if (!riderById.has(riderId)) {
      throw new Error(`Unknown B1.10 finishing rider: ${riderId}`)
    }
  }
}

/**
 * Build deterministic final stage results from the completed B1.9 scenario.
 */
export function createDeterministicStageResults(
  stage: StageInput,
  riders: readonly RiderInput[],
  outcomeSequence: BreakawayOutcomeCheckpointSequenceResult,
  options: DeterministicStageResultsOptions,
): DeterministicStageResults {
  if (!stage.stageId.trim() || !stage.raceId.trim()) {
    throw new Error('B1.10 requires stageId and raceId')
  }

  if (!Number.isFinite(stage.distanceKm) || stage.distanceKm <= 0) {
    throw new Error('B1.10 stage distance must be positive')
  }

  validateTieBreakAttributes(options.tieBreakAttributeOrder)
  const riderById = validateRiders(riders)
  const finishCheckpoint =
    outcomeSequence.checkpoints[outcomeSequence.finishCheckpointIndex]

  if (!finishCheckpoint) {
    throw new Error('B1.10 finish checkpoint was not found')
  }

  if (finishCheckpoint.currentKm < stage.distanceKm - FINISH_DISTANCE_TOLERANCE_KM) {
    throw new Error('B1.10 finish checkpoint must contain a stage-finishing leader')
  }

  validateFinalMembership(finishCheckpoint.groups, riderById)

  const finishingGroups: FinishingGroup[] = finishCheckpoint.groups
    .map((group) => ({
      group,
      finishTimeSeconds: calculateGroupFinishTimeSeconds(
        stage,
        finishCheckpoint.raceSecond,
        group,
      ),
    }))
    .sort(
      (first, second) =>
        first.finishTimeSeconds - second.finishTimeSeconds ||
        first.group.groupId.localeCompare(second.group.groupId),
    )

  const winnerFinishTimeSeconds = finishingGroups[0].finishTimeSeconds
  const results: RiderStageResult[] = []

  finishingGroups.forEach((finishingGroup, groupIndex) => {
    const groupRiders = finishingGroup.group.riderIds.map((riderId) => {
      const rider = riderById.get(riderId)

      if (!rider) {
        throw new Error(`Missing B1.10 rider input: ${riderId}`)
      }

      return rider
    })

    groupRiders.sort((first, second) =>
      compareRiders(first, second, options.tieBreakAttributeOrder),
    )

    for (const rider of groupRiders) {
      results.push({
        rank: results.length + 1,
        riderId: rider.riderId,
        displayName: rider.displayName,
        status: 'finished',
        finishTimeSeconds: finishingGroup.finishTimeSeconds,
        gapSecondsToWinner: roundResultGap(
          finishingGroup.finishTimeSeconds - winnerFinishTimeSeconds,
        ),
        finishingGroupId: finishingGroup.group.groupId,
        finishingGroupRank: groupIndex + 1,
      })
    }
  })

  if (results.length !== riders.length) {
    throw new Error('B1.10 failed to create exactly one result row per rider')
  }

  return {
    stageId: stage.stageId,
    raceId: stage.raceId,
    outcome: outcomeSequence.outcome,
    winnerRiderId: results[0].riderId,
    winnerFinishTimeSeconds,
    results,
  }
}
