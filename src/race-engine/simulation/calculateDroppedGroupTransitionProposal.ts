/**
 * calculateDroppedGroupTransitionProposal.ts
 *
 * Pure deterministic proposal calculation for moving sustainedly unable riders
 * from one active source group into one new dropped group.
 *
 * This file does not mutate SimulationState, create events, apply movement,
 * access Supabase, or activate production execution.
 */

import type {
  GroupType,
} from '../domain/GroupState'
import type {
  SimulationState,
} from '../domain/SimulationState'

export interface CalculateDroppedGroupTransitionProposalInput {
  readonly state: SimulationState
  readonly sourceGroupId: string
  readonly eligibleRiderIds:
    readonly string[]
}

export interface DroppedGroupTransitionProposal {
  readonly sourceGroupId: string
  readonly sourceGroupType: GroupType

  readonly targetGroupId: string
  readonly targetGroupType: 'dropped'

  readonly movedRiderIds:
    readonly string[]
  readonly sourceRemainingRiderIds:
    readonly string[]

  readonly distanceKm: number
  readonly speedKmh: number
  readonly gapFromLeaderSeconds: number

  readonly createdAtRaceSecond: number
  readonly createdAtKm: number

  readonly droppedGroupNumber: number
}

function assertNonBlank(
  value: string,
  fieldName: string,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `calculateDroppedGroupTransitionProposal: ${fieldName} must be a non-empty string.`,
    )
  }
}

function sortUniqueRiderIds(
  riderIds:
    readonly string[],
): readonly string[] {
  if (!Array.isArray(riderIds)) {
    throw new Error(
      'calculateDroppedGroupTransitionProposal: eligibleRiderIds must be an array.',
    )
  }

  const sorted =
    riderIds
      .slice()
      .sort(
        (left, right) =>
          left.localeCompare(
            right,
          ),
      )

  for (
    let index = 0;
    index < sorted.length;
    index += 1
  ) {
    const riderId =
      sorted[index]

    assertNonBlank(
      riderId,
      `eligibleRiderIds[${index}]`,
    )

    if (
      index > 0 &&
      riderId ===
        sorted[index - 1]
    ) {
      throw new Error(
        `calculateDroppedGroupTransitionProposal: duplicate eligible rider ${riderId}.`,
      )
    }
  }

  return sorted
}

function createDroppedGroupId(
  droppedGroupNumber: number,
): string {
  return (
    `dropped_${droppedGroupNumber}`
  )
}

/**
 * Calculates one immutable transition proposal.
 *
 * Returns null when no rider is eligible.
 *
 * The first implementation deliberately allows a dropped group to be created
 * only from an active peloton, breakaway, or chase group. Splitting an already
 * dropped group is deferred until later calibration.
 */
export function calculateDroppedGroupTransitionProposal(
  input:
    CalculateDroppedGroupTransitionProposalInput,
): DroppedGroupTransitionProposal | null {
  const {
    state,
    sourceGroupId,
  } = input

  if (state.completed) {
    throw new Error(
      'calculateDroppedGroupTransitionProposal: cannot propose a transition for a completed simulation.',
    )
  }

  assertNonBlank(
    sourceGroupId,
    'sourceGroupId',
  )

  const sourceGroup =
    state.groups[
      sourceGroupId
    ]

  if (!sourceGroup) {
    throw new Error(
      `calculateDroppedGroupTransitionProposal: source group ${sourceGroupId} does not exist.`,
    )
  }

  if (!sourceGroup.active) {
    throw new Error(
      `calculateDroppedGroupTransitionProposal: source group ${sourceGroupId} must be active.`,
    )
  }

  if (
    sourceGroup.groupType ===
      'finished' ||
    sourceGroup.groupType ===
      'dropped'
  ) {
    throw new Error(
      `calculateDroppedGroupTransitionProposal: source group type ${sourceGroup.groupType} is not eligible for the first dropped-group transition.`,
    )
  }

  const movedRiderIds =
    sortUniqueRiderIds(
      input.eligibleRiderIds,
    )

  if (
    movedRiderIds.length === 0
  ) {
    return null
  }

  const sourceMembership =
    new Set(
      sourceGroup.riderIds,
    )

  for (
    const riderId of
    movedRiderIds
  ) {
    if (
      !sourceMembership.has(
        riderId,
      )
    ) {
      throw new Error(
        `calculateDroppedGroupTransitionProposal: rider ${riderId} is not a member of source group ${sourceGroupId}.`,
      )
    }

    const rider =
      state.riders[
        riderId
      ]

    if (!rider) {
      throw new Error(
        `calculateDroppedGroupTransitionProposal: rider ${riderId} does not exist.`,
      )
    }

    if (
      rider.currentGroupId !==
      sourceGroupId
    ) {
      throw new Error(
        `calculateDroppedGroupTransitionProposal: rider ${riderId} currentGroupId does not match source group ${sourceGroupId}.`,
      )
    }

    if (
      rider.stageStatus !==
      'racing'
    ) {
      throw new Error(
        `calculateDroppedGroupTransitionProposal: rider ${riderId} must be racing.`,
      )
    }
  }

  const movedSet =
    new Set(
      movedRiderIds,
    )

  const sourceRemainingRiderIds =
    sourceGroup.riderIds
      .filter(
        (riderId) =>
          !movedSet.has(
            riderId,
          ),
      )
      .slice()
      .sort(
        (left, right) =>
          left.localeCompare(
            right,
          ),
      )

  if (
    sourceRemainingRiderIds.length ===
    0
  ) {
    throw new Error(
      'calculateDroppedGroupTransitionProposal: transition may not empty the source group.',
    )
  }

  const droppedGroupNumber =
    state.nextDroppedGroupNumber

  if (
    !Number.isInteger(
      droppedGroupNumber,
    ) ||
    droppedGroupNumber <= 0
  ) {
    throw new Error(
      'calculateDroppedGroupTransitionProposal: nextDroppedGroupNumber must be a positive integer.',
    )
  }

  const targetGroupId =
    createDroppedGroupId(
      droppedGroupNumber,
    )

  if (
    state.groups[
      targetGroupId
    ]
  ) {
    throw new Error(
      `calculateDroppedGroupTransitionProposal: target group ${targetGroupId} already exists.`,
    )
  }

  return {
    sourceGroupId,
    sourceGroupType:
      sourceGroup.groupType,

    targetGroupId,
    targetGroupType:
      'dropped',

    movedRiderIds,
    sourceRemainingRiderIds,

    distanceKm:
      sourceGroup.distanceKm,
    speedKmh:
      sourceGroup.speedKmh,
    gapFromLeaderSeconds:
      sourceGroup
        .gapFromLeaderSeconds,

    createdAtRaceSecond:
      state.raceSecond,
    createdAtKm:
      sourceGroup.distanceKm,

    droppedGroupNumber,
  }
}
