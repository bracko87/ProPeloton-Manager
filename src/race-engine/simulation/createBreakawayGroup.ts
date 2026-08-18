/**
 * createBreakawayGroup.ts
 *
 * Pure deterministic transformation for moving riders from an existing active
 * group into a newly-created breakaway group.
 *
 * This utility:
 * - does not advance the race clock;
 * - does not move either group forward;
 * - does not emit race events;
 * - does not mutate the input SimulationState;
 * - does not persist or activate production execution.
 */

import type {
  GroupState,
} from '../domain/GroupState'
import type {
  RiderState,
} from '../domain/RiderState'
import type {
  SimulationState,
} from '../domain/SimulationState'
import {
  validateSimulationState,
} from '../validation/validateSimulationState'

export interface CreateBreakawayGroupInput {
  readonly state:
    SimulationState

  readonly sourceGroupId:
    string

  readonly riderIds:
    readonly string[]

  readonly speedKmh:
    number

  readonly initialGapSeconds?:
    number
}

export interface CreateBreakawayGroupResult {
  readonly state:
    SimulationState

  readonly sourceGroupId:
    string

  readonly breakawayGroupId:
    string

  readonly movedRiderIds:
    readonly string[]

  readonly sourceGroup:
    GroupState

  readonly breakawayGroup:
    GroupState
}

function assertNonBlank(
  value: string,
  fieldName: string,
): void {
  if (
    value.trim() ===
    ''
  ) {
    throw new Error(
      `createBreakawayGroup: ${fieldName} must not be blank.`,
    )
  }
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(
      value,
    ) ||
    value < 0
  ) {
    throw new Error(
      `createBreakawayGroup: ${fieldName} must be finite and non-negative.`,
    )
  }
}

function getBreakawayGroupId(
  state:
    SimulationState,
): string {
  let nextNumber =
    1

  while (
    state.groups[
      `breakaway_${nextNumber}`
    ]
  ) {
    nextNumber +=
      1
  }

  return `breakaway_${nextNumber}`
}

/**
 * Creates one deterministic breakaway group from riders currently belonging
 * to a common active source group.
 *
 * The breakaway begins at the source group's current distance plus any
 * configured initial launch gap. The launch distance is capped at the stage
 * finish, and later movement ticks continue from the supplied initial speed
 * and rider capabilities.
 */
export function createBreakawayGroup(
  input:
    CreateBreakawayGroupInput,
): CreateBreakawayGroupResult {
  const {
    state,
    sourceGroupId,
    riderIds,
    speedKmh,
    initialGapSeconds = 0,
  } = input

  validateSimulationState(
    state,
  )

  if (
    state.completed
  ) {
    throw new Error(
      'createBreakawayGroup: cannot transform a completed simulation.',
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

  assertFiniteNonNegative(
    initialGapSeconds,
    'initialGapSeconds',
  )

  if (
    riderIds.length ===
    0
  ) {
    throw new Error(
      'createBreakawayGroup: riderIds must contain at least one rider.',
    )
  }

  const sourceGroup =
    state.groups[
      sourceGroupId
    ]

  if (
    !sourceGroup
  ) {
    throw new Error(
      `createBreakawayGroup: source group ${sourceGroupId} does not exist.`,
    )
  }

  if (
    !sourceGroup.active
  ) {
    throw new Error(
      `createBreakawayGroup: source group ${sourceGroupId} must be active.`,
    )
  }

  const uniqueSortedRiderIds =
    [
      ...new Set(
        riderIds,
      ),
    ].sort(
      (
        left,
        right,
      ) =>
        left.localeCompare(
          right,
        ),
    )

  if (
    uniqueSortedRiderIds.length !==
    riderIds.length
  ) {
    throw new Error(
      'createBreakawayGroup: riderIds must not contain duplicates.',
    )
  }

  const sourceRiderIdSet =
    new Set(
      sourceGroup.riderIds,
    )

  for (
    const riderId of
    uniqueSortedRiderIds
  ) {
    assertNonBlank(
      riderId,
      'riderId',
    )

    if (
      !sourceRiderIdSet.has(
        riderId,
      )
    ) {
      throw new Error(
        `createBreakawayGroup: rider ${riderId} is not in source group ${sourceGroupId}.`,
      )
    }

    const rider =
      state.riders[
        riderId
      ]

    if (
      !rider
    ) {
      throw new Error(
        `createBreakawayGroup: rider ${riderId} does not exist.`,
      )
    }

    if (
      rider.currentGroupId !==
      sourceGroupId
    ) {
      throw new Error(
        `createBreakawayGroup: rider ${riderId} currentGroupId does not match ${sourceGroupId}.`,
      )
    }

    if (
      rider.stageStatus !==
      'racing'
    ) {
      throw new Error(
        `createBreakawayGroup: rider ${riderId} must have stageStatus "racing".`,
      )
    }
  }

  if (
    uniqueSortedRiderIds.length >=
    sourceGroup.riderIds.length
  ) {
    throw new Error(
      'createBreakawayGroup: at least one rider must remain in the source group.',
    )
  }

  const breakawayGroupId =
    getBreakawayGroupId(
      state,
    )

  const movedRiderIdSet =
    new Set(
      uniqueSortedRiderIds,
    )

  const remainingSourceRiderIds =
    sourceGroup.riderIds
      .filter(
        (riderId) =>
          !movedRiderIdSet.has(
            riderId,
          ),
      )
      .slice()
      .sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      )

  const nextSourceGroup:
    GroupState = {
      ...sourceGroup,
      riderIds:
        remainingSourceRiderIds,
  }

  const initialGapKm =
    speedKmh *
    (
      initialGapSeconds /
      3600
    )

  const breakawayDistanceKm =
    Math.min(
      state.stageDistanceKm,
      sourceGroup.distanceKm +
        initialGapKm,
    )

  const breakawayGroup:
    GroupState = {
      groupId:
        breakawayGroupId,
      groupType:
        'breakaway',
      riderIds:
        uniqueSortedRiderIds,
      distanceKm:
        breakawayDistanceKm,
      speedKmh,
      gapFromLeaderSeconds:
        sourceGroup
          .gapFromLeaderSeconds,
      active: true,
      createdAtRaceSecond:
        state.raceSecond,
      createdAtKm:
        breakawayDistanceKm,
    }

  const nextRidersEntries:
    Array<
      [
        string,
        RiderState,
      ]
    > =
    Object.entries(
      state.riders,
    ).map(
      (
        [
          riderId,
          rider,
        ],
      ) => {
        if (
          !movedRiderIdSet.has(
            riderId,
          )
        ) {
          return [
            riderId,
            rider,
          ]
        }

        return [
          riderId,
          {
            ...rider,
            currentGroupId:
              breakawayGroupId,
            distanceKm:
              breakawayDistanceKm,
            speedKmh,
          },
        ]
      },
    )

  const nextState:
    SimulationState = {
      ...state,
      riders:
        Object.fromEntries(
          nextRidersEntries,
        ),
      groups: {
        ...state.groups,
        [sourceGroupId]:
          nextSourceGroup,
        [breakawayGroupId]:
          breakawayGroup,
      },
  }

  validateSimulationState(
    nextState,
  )

  return {
    state:
      nextState,
    sourceGroupId,
    breakawayGroupId,
    movedRiderIds:
      uniqueSortedRiderIds,
    sourceGroup:
      nextSourceGroup,
    breakawayGroup,
  }
}