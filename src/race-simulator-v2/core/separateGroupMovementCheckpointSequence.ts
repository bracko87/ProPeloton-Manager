/**
 * separateGroupMovementCheckpointSequence.ts
 *
 * Applies deterministic separate movement to the controlled B1.4 breakaway and
 * peloton checkpoint collection.
 *
 * Purpose:
 * - Preserve the single-peloton checkpoints before the controlled attack.
 * - Assign distinct deterministic speeds when the split becomes visible.
 * - Move the breakaway and peloton independently at later checkpoints.
 * - Calculate a real time gap from the physical distance between the groups.
 *
 * This B1.5 step intentionally contains no drafting, energy, chase, catch,
 * commentary or finish-result logic.
 */

import { Checkpoint, GroupSnapshot } from '../types/checkpoint'
import { StageInput } from '../types/stage'

const DISTANCE_PRECISION = 1_000_000
const SPEED_PRECISION = 1_000
const GAP_PRECISION = 1_000

export const MINIMUM_GROUP_SPEED_KMH = 20
export const MAXIMUM_GROUP_SPEED_KMH = 70

export interface SeparateGroupMovementOptions {
  /** Checkpoint index at which the B1.4 split first exists. */
  splitCheckpointIndex: number

  /** Stable group identifiers created by the controlled attack. */
  breakawayGroupId: string
  pelotonGroupId: string

  /** Deterministic offsets applied to the shared B1.4 group speed. */
  breakawaySpeedOffsetKmh: number
  pelotonSpeedOffsetKmh: number
}

function roundDistanceKm(value: number): number {
  return Math.round(value * DISTANCE_PRECISION) / DISTANCE_PRECISION
}

function roundSpeedKmh(value: number): number {
  return Math.round(value * SPEED_PRECISION) / SPEED_PRECISION
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

function findGroup(
  checkpoint: Checkpoint,
  groupId: string,
): GroupSnapshot {
  const group = checkpoint.groups.find((candidate) => candidate.groupId === groupId)

  if (!group) {
    throw new Error(`Required group was not found: ${groupId}`)
  }

  return group
}

function validateOptions(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  options: SeparateGroupMovementOptions,
): void {
  if (!Number.isFinite(stage.distanceKm) || stage.distanceKm <= 0) {
    throw new Error('Stage distance must be a positive finite number')
  }

  if (checkpoints.length < 2) {
    throw new Error('Separate group movement requires at least two checkpoints')
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

  const breakawayGroupId = options.breakawayGroupId.trim()
  const pelotonGroupId = options.pelotonGroupId.trim()

  if (!breakawayGroupId || !pelotonGroupId) {
    throw new Error('Group ids must be non-empty strings')
  }

  if (breakawayGroupId === pelotonGroupId) {
    throw new Error('Breakaway and peloton group ids must differ')
  }

  if (
    !Number.isFinite(options.breakawaySpeedOffsetKmh) ||
    !Number.isFinite(options.pelotonSpeedOffsetKmh)
  ) {
    throw new Error('Group speed offsets must be finite numbers')
  }

  if (options.breakawaySpeedOffsetKmh === options.pelotonSpeedOffsetKmh) {
    throw new Error('Group speed offsets must create distinct speeds')
  }

  if (splitCheckpoint.groups.length !== 2) {
    throw new Error('Split checkpoint must contain exactly two groups')
  }

  const breakaway = findGroup(splitCheckpoint, breakawayGroupId)
  const peloton = findGroup(splitCheckpoint, pelotonGroupId)

  if (!breakaway.active || !peloton.active) {
    throw new Error('Separate group movement requires two active groups')
  }

  if (breakaway.riderIds.length === 0 || peloton.riderIds.length === 0) {
    throw new Error('Both movement groups must contain at least one rider')
  }

  if (breakaway.distanceKm !== peloton.distanceKm) {
    throw new Error('B1.5 expects both groups to start from the same split distance')
  }

  const baseSpeedKmh = peloton.speedKmh
  const breakawaySpeedKmh = roundSpeedKmh(
    baseSpeedKmh + options.breakawaySpeedOffsetKmh,
  )
  const pelotonSpeedKmh = roundSpeedKmh(
    baseSpeedKmh + options.pelotonSpeedOffsetKmh,
  )

  for (const speedKmh of [breakawaySpeedKmh, pelotonSpeedKmh]) {
    if (
      speedKmh < MINIMUM_GROUP_SPEED_KMH ||
      speedKmh > MAXIMUM_GROUP_SPEED_KMH
    ) {
      throw new Error(
        `Derived group speed must remain between ${MINIMUM_GROUP_SPEED_KMH} and ${MAXIMUM_GROUP_SPEED_KMH} km/h`,
      )
    }
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
        `Rider ${riderSnapshot.riderId} references an unknown movement group`,
      )
    }

    return {
      ...riderSnapshot,
      distanceKm: group.distanceKm,
      speedKmh: group.speedKmh,
    }
  })
}

/**
 * Create a new checkpoint collection with separate deterministic group movement.
 */
export function createSeparateGroupMovementCheckpointSequence(
  stage: StageInput,
  checkpoints: readonly Checkpoint[],
  options: SeparateGroupMovementOptions,
): Checkpoint[] {
  validateOptions(stage, checkpoints, options)

  const breakawayGroupId = options.breakawayGroupId.trim()
  const pelotonGroupId = options.pelotonGroupId.trim()
  const output: Checkpoint[] = []

  for (const sourceCheckpoint of checkpoints) {
    if (sourceCheckpoint.checkpointIndex < options.splitCheckpointIndex) {
      output.push(cloneCheckpoint(sourceCheckpoint))
      continue
    }

    const sourceBreakaway = findGroup(sourceCheckpoint, breakawayGroupId)
    const sourcePeloton = findGroup(sourceCheckpoint, pelotonGroupId)

    let breakawayGroup: GroupSnapshot
    let pelotonGroup: GroupSnapshot

    if (sourceCheckpoint.checkpointIndex === options.splitCheckpointIndex) {
      const baseSpeedKmh = sourcePeloton.speedKmh

      breakawayGroup = {
        ...sourceBreakaway,
        riderIds: [...sourceBreakaway.riderIds],
        speedKmh: roundSpeedKmh(
          baseSpeedKmh + options.breakawaySpeedOffsetKmh,
        ),
        gapSecondsToLeader: 0,
      }

      pelotonGroup = {
        ...sourcePeloton,
        riderIds: [...sourcePeloton.riderIds],
        speedKmh: roundSpeedKmh(
          baseSpeedKmh + options.pelotonSpeedOffsetKmh,
        ),
        gapSecondsToLeader: 0,
      }
    } else {
      const previousCheckpoint = output[output.length - 1]
      const previousBreakaway = findGroup(previousCheckpoint, breakawayGroupId)
      const previousPeloton = findGroup(previousCheckpoint, pelotonGroupId)
      const elapsedSeconds =
        sourceCheckpoint.raceSecond - previousCheckpoint.raceSecond

      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
        throw new Error('Race time must increase between movement checkpoints')
      }

      breakawayGroup = {
        ...previousBreakaway,
        riderIds: [...previousBreakaway.riderIds],
        distanceKm: roundDistanceKm(
          Math.min(
            stage.distanceKm,
            previousBreakaway.distanceKm +
              (previousBreakaway.speedKmh * elapsedSeconds) / 3600,
          ),
        ),
      }

      pelotonGroup = {
        ...previousPeloton,
        riderIds: [...previousPeloton.riderIds],
        distanceKm: roundDistanceKm(
          Math.min(
            stage.distanceKm,
            previousPeloton.distanceKm +
              (previousPeloton.speedKmh * elapsedSeconds) / 3600,
          ),
        ),
      }
    }

    const groupsBeforeGap = [breakawayGroup, pelotonGroup]
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
