/**
 * droppedGroup.ts
 *
 * Pure deterministic transformation for moving riders from an existing group
 * into a newly-created dropped group.
 *
 * This utility:
 * - Does not advance the race clock.
 * - Does not move any group.
 * - Does not emit race events.
 * - Does not mutate the input SimulationState.
 * - Does not activate production execution.
 */

import type { GroupState } from '../domain/GroupState'
import type { RiderState } from '../domain/RiderState'
import type { SimulationState } from '../domain/SimulationState'
import { validateSimulationState } from '../validation/validateSimulationState'

export interface CreateDroppedGroupInput {
  readonly state: SimulationState
  readonly sourceGroupId: string
  readonly riderIds: readonly string[]
  readonly speedKmh: number
}

export interface CreateDroppedGroupResult {
  readonly state: SimulationState
  readonly sourceGroupId: string
  readonly droppedGroupId: string
  readonly movedRiderIds: readonly string[]
  readonly sourceGroup: GroupState
  readonly droppedGroup: GroupState
}

function assertNonBlank(
  value: string,
  fieldName: string,
): void {
  if (value.trim() === '') {
    throw new Error(
      `createDroppedGroup: ${fieldName} must not be blank.`,
    )
  }
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `createDroppedGroup: ${fieldName} must be finite and non-negative.`,
    )
  }
}

function getDroppedGroupId(
  nextDroppedGroupNumber: number,
): string {
  return `dropped_${nextDroppedGroupNumber}`
}

/**
 * Creates one deterministic dropped group from riders currently in a source
 * group. Rider IDs are sorted lexicographically in the new group.
 */
export function createDroppedGroup(
  input: CreateDroppedGroupInput,
): CreateDroppedGroupResult {
  const {
    state,
    sourceGroupId,
    riderIds,
    speedKmh,
  } = input

  validateSimulationState(state)

  if (state.completed) {
    throw new Error(
      'createDroppedGroup: cannot transform a completed simulation.',
    )
  }

  assertNonBlank(
    sourceGroupId,
    'sourceGroupId',
  )

  assertFiniteNonNegative(
    speedKmh,
    'speedKmh',
  )

  if (riderIds.length === 0) {
    throw new Error(
      'createDroppedGroup: riderIds must contain at least one rider.',
    )
  }

  const sourceGroup =
    state.groups[sourceGroupId]

  if (!sourceGroup) {
    throw new Error(
      `createDroppedGroup: source group ${sourceGroupId} does not exist.`,
    )
  }

  if (!sourceGroup.active) {
    throw new Error(
      `createDroppedGroup: source group ${sourceGroupId} must be active.`,
    )
  }

  const uniqueSortedRiderIds =
    [...new Set(riderIds)].sort(
      (riderIdA, riderIdB) =>
        riderIdA.localeCompare(riderIdB),
    )

  if (
    uniqueSortedRiderIds.length !==
    riderIds.length
  ) {
    throw new Error(
      'createDroppedGroup: riderIds must not contain duplicates.',
    )
  }

  const sourceRiderIdSet = new Set(
    sourceGroup.riderIds,
  )

  for (const riderId of uniqueSortedRiderIds) {
    assertNonBlank(
      riderId,
      'riderId',
    )

    if (!sourceRiderIdSet.has(riderId)) {
      throw new Error(
        `createDroppedGroup: rider ${riderId} is not in source group ${sourceGroupId}.`,
      )
    }

    const rider = state.riders[riderId]

    if (!rider) {
      throw new Error(
        `createDroppedGroup: rider ${riderId} does not exist.`,
      )
    }

    if (
      rider.currentGroupId !==
      sourceGroupId
    ) {
      throw new Error(
        `createDroppedGroup: rider ${riderId} currentGroupId does not match ${sourceGroupId}.`,
      )
    }

    if (
      rider.stageStatus !== 'racing'
    ) {
      throw new Error(
        `createDroppedGroup: rider ${riderId} must have stageStatus "racing".`,
      )
    }
  }

  if (
    uniqueSortedRiderIds.length >=
    sourceGroup.riderIds.length
  ) {
    throw new Error(
      'createDroppedGroup: at least one rider must remain in the source group.',
    )
  }

  const droppedGroupId =
    getDroppedGroupId(
      state.nextDroppedGroupNumber,
    )

  if (state.groups[droppedGroupId]) {
    throw new Error(
      `createDroppedGroup: generated group ID ${droppedGroupId} already exists.`,
    )
  }

  const movedRiderIdSet = new Set(
    uniqueSortedRiderIds,
  )

  const remainingSourceRiderIds =
    sourceGroup.riderIds
      .filter(
        (riderId) =>
          !movedRiderIdSet.has(riderId),
      )
      .slice()
      .sort(
        (riderIdA, riderIdB) =>
          riderIdA.localeCompare(riderIdB),
      )

  const nextSourceGroup: GroupState = {
    ...sourceGroup,
    riderIds:
      remainingSourceRiderIds,
  }

  const droppedGroup: GroupState = {
    groupId: droppedGroupId,
    groupType: 'dropped',
    riderIds:
      uniqueSortedRiderIds,
    distanceKm:
      sourceGroup.distanceKm,
    speedKmh,
    gapFromLeaderSeconds:
      sourceGroup.gapFromLeaderSeconds,
    active: true,
    createdAtRaceSecond:
      state.raceSecond,
    createdAtKm:
      sourceGroup.distanceKm,
  }

  const nextRidersEntries:
    Array<[string, RiderState]> =
    Object.entries(state.riders).map(
      ([riderId, rider]) => {
        if (
          !movedRiderIdSet.has(riderId)
        ) {
          return [riderId, rider]
        }

        return [
          riderId,
          {
            ...rider,
            currentGroupId:
              droppedGroupId,
            speedKmh,
          },
        ]
      },
    )

  const nextState: SimulationState = {
    ...state,
    riders:
      Object.fromEntries(
        nextRidersEntries,
      ),
    groups: {
      ...state.groups,
      [sourceGroupId]:
        nextSourceGroup,
      [droppedGroupId]:
        droppedGroup,
    },
    nextDroppedGroupNumber:
      state.nextDroppedGroupNumber + 1,
  }

  validateSimulationState(nextState)

  return {
    state: nextState,
    sourceGroupId,
    droppedGroupId,
    movedRiderIds:
      uniqueSortedRiderIds,
    sourceGroup:
      nextSourceGroup,
    droppedGroup,
  }
}
