/**
 * cooperativeGroupMovementCheckpointSequence.ts
 *
 * Applies B1.6 drafting and cooperation advantages to the deterministic B1.5
 * group movement checkpoint collection.
 *
 * Purpose:
 * - Preserve every pre-attack checkpoint unchanged.
 * - Treat each group's B1.5 split speed as its base race-situation speed.
 * - Add deterministic drafting and cooperation advantages at the split.
 * - Recalculate later distances and gaps from the adjusted effective speeds.
 *
 * This step intentionally adds no live energy, attack cost, chase, catch,
 * survival or finish-result logic.
 */

import { Checkpoint, GroupSnapshot } from '../types/checkpoint'
import { StageInput } from '../types/stage'
import {
  calculateGroupCooperationAdvantage,
  GroupCooperationAdvantageResult,
} from './groupCooperationAdvantage'
import {
  MAXIMUM_GROUP_SPEED_KMH,
  MINIMUM_GROUP_SPEED_KMH,
} from './separateGroupMovementCheckpointSequence'

const DISTANCE_PRECISION = 1_000_000
const GAP_PRECISION = 1_000

export interface CooperativeGroupMovementOptions {
  splitCheckpointIndex: number
  cooperationLevelByGroupId: Readonly<Record<string, number>>
}

function roundDistanceKm(value: number): number {
  return Math.round(value * DISTANCE_PRECISION) / DISTANCE_PRECISION
}

function roundGapSeconds(value: number): number {
  return Math.round(value * GAP_PRECISION) / GAP_PRECISION
}

function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return {
    ...checkpoint,
    groups: checkpoint.groups.map((group) => ({
      ...group,
      riderIds: [...group.riderIds],
    })),
    riderSnapshots: checkpoint.riderSnapshots.map((riderSnapshot) => ({
      ...riderSnapshot,
    })),
  }
}

function calculateGapSecondsToLeader(
  leaderDistanceKm: number,
  group: GroupSnapshot,
): number {
  const distanceGapKm = Math.max(0, leaderDistanceKm - group.distanceKm)

  if (distanceGapKm === 0) return 0

  return roundGapSeconds((distanceGapKm / group.speedKmh) * 3600)
}

function applyGroupStateToRiders(
  checkpoint: Checkpoint,
  groups: readonly GroupSnapshot[],
): Checkpoint['riderSnapshots'] {
  const groupById = new Map(groups.map((group) => [group.groupId, group]))

  return checkpoint.riderSnapshots.map((riderSnapshot) => {
    const group = groupById.get(riderSnapshot.currentGroupId)

    if (!group) {
      throw new Error(
        `Rider ${riderSnapshot.riderId} references an unknown cooperation group`,
      )
    }

    return {
      ...riderSnapshot,
      distanceKm: group.distanceKm,
      speedKmh: group.speedKmh,
    }
  })
}

function getCooperationLevel(
  options: CooperativeGroupMovementOptions,
  groupId: string,
): number {
  const cooperationLevel = options.cooperationLevelByGroupId[groupId]

  if (cooperationLevel === undefined) {
    throw new Error(`Missing cooperation level for group: ${groupId}`)
  }

  return cooperationLevel
}

function validateOptions(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  options: CooperativeGroupMovementOptions,
): void {
  if (!Number.isFinite(stage.distanceKm) || stage.distanceKm <= 0) {
    throw new Error('Stage distance must be a positive finite number')
  }

  if (checkpoints.length < 2) {
    throw new Error('Group cooperation requires at least two checkpoints')
  }

  if (!Number.isInteger(options.splitCheckpointIndex)) {
    throw new Error('splitCheckpointIndex must be an integer')
  }

  const splitCheckpoint = checkpoints.find(
    (checkpoint) => checkpoint.checkpointIndex === options.splitCheckpointIndex,
  )

  if (!splitCheckpoint) {
    throw new Error('splitCheckpointIndex was not found in the checkpoint collection')
  }

  if (splitCheckpoint.groups.length < 2) {
    throw new Error('Group cooperation requires at least two groups at the split')
  }

  for (const group of splitCheckpoint.groups) {
    if (!group.active || group.riderIds.length < 1) {
      throw new Error('Every cooperation group must be active and contain riders')
    }

    const performance = calculateGroupCooperationAdvantage({
      baseSpeedKmh: group.speedKmh,
      riderCount: group.riderIds.length,
      cooperationLevel: getCooperationLevel(options, group.groupId),
    })

    if (
      performance.effectiveSpeedKmh < MINIMUM_GROUP_SPEED_KMH ||
      performance.effectiveSpeedKmh > MAXIMUM_GROUP_SPEED_KMH
    ) {
      throw new Error(
        `Effective group speed must remain between ${MINIMUM_GROUP_SPEED_KMH} and ${MAXIMUM_GROUP_SPEED_KMH} km/h`,
      )
    }
  }
}

function applyPerformanceToGroup(
  group: GroupSnapshot,
  performance: GroupCooperationAdvantageResult,
): GroupSnapshot {
  return {
    ...group,
    riderIds: [...group.riderIds],
    speedKmh: performance.effectiveSpeedKmh,
    baseSpeedBeforeGroupAdvantageKmh: performance.baseSpeedKmh,
    draftingBonusKmh: performance.draftingBonusKmh,
    cooperationBonusKmh: performance.cooperationBonusKmh,
    totalGroupAdvantageKmh: performance.totalBonusKmh,
    cooperationLevel: performance.cooperationLevel,
    gapSecondsToLeader: 0,
  }
}

/**
 * Create a new checkpoint collection with deterministic drafting and group
 * cooperation advantages.
 */
export function createCooperativeGroupMovementCheckpointSequence(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  options: CooperativeGroupMovementOptions,
): Checkpoint[] {
  validateOptions(stage, checkpoints, options)

  const output: Checkpoint[] = []

  for (const sourceCheckpoint of checkpoints) {
    if (sourceCheckpoint.checkpointIndex < options.splitCheckpointIndex) {
      output.push(cloneCheckpoint(sourceCheckpoint))
      continue
    }

    let groupsBeforeGap: GroupSnapshot[]

    if (sourceCheckpoint.checkpointIndex === options.splitCheckpointIndex) {
      groupsBeforeGap = sourceCheckpoint.groups.map((group) => {
        const performance = calculateGroupCooperationAdvantage({
          baseSpeedKmh: group.speedKmh,
          riderCount: group.riderIds.length,
          cooperationLevel: getCooperationLevel(options, group.groupId),
        })

        return applyPerformanceToGroup(group, performance)
      })
    } else {
      const previousCheckpoint = output[output.length - 1]
      const elapsedSeconds =
        sourceCheckpoint.raceSecond - previousCheckpoint.raceSecond

      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
        throw new Error('Race time must increase between cooperation checkpoints')
      }

      const previousGroupById = new Map(
        previousCheckpoint.groups.map((group) => [group.groupId, group]),
      )

      groupsBeforeGap = sourceCheckpoint.groups.map((sourceGroup) => {
        const previousGroup = previousGroupById.get(sourceGroup.groupId)

        if (!previousGroup) {
          throw new Error(`Previous cooperation group was not found: ${sourceGroup.groupId}`)
        }

        return {
          ...previousGroup,
          riderIds: [...previousGroup.riderIds],
          distanceKm: roundDistanceKm(
            Math.min(
              stage.distanceKm,
              previousGroup.distanceKm +
                (previousGroup.speedKmh * elapsedSeconds) / 3600,
            ),
          ),
        }
      })
    }

    const leaderDistanceKm = Math.max(
      ...groupsBeforeGap.map((group) => group.distanceKm),
    )
    const groups = groupsBeforeGap
      .map((group) => ({
        ...group,
        gapSecondsToLeader: calculateGapSecondsToLeader(
          leaderDistanceKm,
          group,
        ),
      }))
      .sort((left, right) => {
        if (right.distanceKm !== left.distanceKm) {
          return right.distanceKm - left.distanceKm
        }

        return left.groupId.localeCompare(right.groupId)
      })

    output.push({
      ...sourceCheckpoint,
      currentKm: roundDistanceKm(leaderDistanceKm),
      groups,
      riderSnapshots: applyGroupStateToRiders(sourceCheckpoint, groups),
    })
  }

  return output
}
