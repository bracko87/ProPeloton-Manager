/**
 * applyDroppedGroupTransitionProposal.ts
 *
 * Pure deterministic immutable application of one previously calculated
 * dropped-group transition proposal.
 *
 * This file updates group membership and the next dropped-group counter only.
 * It does not emit events, calculate movement, change energy, access Supabase,
 * or activate production execution.
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
import type {
  DroppedGroupTransitionProposal,
} from './calculateDroppedGroupTransitionProposal'

export interface ApplyDroppedGroupTransitionProposalInput {
  readonly state: SimulationState
  readonly proposal:
    DroppedGroupTransitionProposal
}

export interface ApplyDroppedGroupTransitionProposalResult {
  readonly state: SimulationState
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly movedRiderIds:
    readonly string[]
  readonly sourceRemainingRiderIds:
    readonly string[]
  readonly previousDroppedGroupNumber: number
  readonly nextDroppedGroupNumber: number
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length ===
      right.length &&
    left.every(
      (value, index) =>
        value === right[index],
    )
  )
}

function sorted(
  values:
    readonly string[],
): readonly string[] {
  return values
    .slice()
    .sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )
}

/**
 * Applies one transition proposal after re-validating it against the current
 * state so a stale or manually altered proposal cannot be applied.
 */
export function applyDroppedGroupTransitionProposal(
  input:
    ApplyDroppedGroupTransitionProposalInput,
): ApplyDroppedGroupTransitionProposalResult {
  const {
    state,
    proposal,
  } = input

  if (state.completed) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: cannot apply a transition to a completed simulation.',
    )
  }

  const sourceGroup =
    state.groups[
      proposal.sourceGroupId
    ]

  if (!sourceGroup) {
    throw new Error(
      `applyDroppedGroupTransitionProposal: source group ${proposal.sourceGroupId} does not exist.`,
    )
  }

  if (!sourceGroup.active) {
    throw new Error(
      `applyDroppedGroupTransitionProposal: source group ${proposal.sourceGroupId} must be active.`,
    )
  }

  if (
    sourceGroup.groupType !==
    proposal.sourceGroupType
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: source group type has changed since proposal calculation.',
    )
  }

  if (
    proposal.targetGroupType !==
    'dropped'
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: target group type must be dropped.',
    )
  }

  if (
    state.groups[
      proposal.targetGroupId
    ]
  ) {
    throw new Error(
      `applyDroppedGroupTransitionProposal: target group ${proposal.targetGroupId} already exists.`,
    )
  }

  if (
    proposal.droppedGroupNumber !==
    state.nextDroppedGroupNumber
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: dropped-group counter has changed since proposal calculation.',
    )
  }

  if (
    proposal.createdAtRaceSecond !==
    state.raceSecond
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: raceSecond has changed since proposal calculation.',
    )
  }

  if (
    proposal.distanceKm !==
      sourceGroup.distanceKm ||
    proposal.createdAtKm !==
      sourceGroup.distanceKm ||
    proposal.speedKmh !==
      sourceGroup.speedKmh ||
    proposal.gapFromLeaderSeconds !==
      sourceGroup
        .gapFromLeaderSeconds
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: source group movement fields have changed since proposal calculation.',
    )
  }

  const movedRiderIds =
    sorted(
      proposal.movedRiderIds,
    )

  if (
    movedRiderIds.length === 0
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: proposal must move at least one rider.',
    )
  }

  if (
    !arraysEqual(
      movedRiderIds,
      proposal.movedRiderIds,
    )
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: moved rider IDs must be sorted.',
    )
  }

  const movedSet =
    new Set<string>()

  for (
    const riderId of
    movedRiderIds
  ) {
    if (
      movedSet.has(
        riderId,
      )
    ) {
      throw new Error(
        `applyDroppedGroupTransitionProposal: duplicate moved rider ${riderId}.`,
      )
    }

    movedSet.add(
      riderId,
    )

    if (
      !sourceGroup.riderIds
        .includes(
          riderId,
        )
    ) {
      throw new Error(
        `applyDroppedGroupTransitionProposal: rider ${riderId} is no longer in source group ${sourceGroup.groupId}.`,
      )
    }

    const rider =
      state.riders[
        riderId
      ]

    if (
      !rider ||
      rider.currentGroupId !==
        sourceGroup.groupId ||
      rider.stageStatus !==
        'racing'
    ) {
      throw new Error(
        `applyDroppedGroupTransitionProposal: rider ${riderId} is no longer eligible for this transition.`,
      )
    }
  }

  const expectedRemaining =
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
    expectedRemaining.length ===
    0
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: transition may not empty the source group.',
    )
  }

  if (
    !arraysEqual(
      expectedRemaining,
      proposal
        .sourceRemainingRiderIds,
    )
  ) {
    throw new Error(
      'applyDroppedGroupTransitionProposal: source remaining membership no longer matches the proposal.',
    )
  }

  const nextSourceGroup:
    GroupState = {
      ...sourceGroup,
      riderIds:
        expectedRemaining,
    }

  const droppedGroup:
    GroupState = {
      groupId:
        proposal.targetGroupId,
      groupType:
        'dropped',
      riderIds:
        movedRiderIds,

      distanceKm:
        proposal.distanceKm,
      speedKmh:
        proposal.speedKmh,
      gapFromLeaderSeconds:
        proposal
          .gapFromLeaderSeconds,

      createdAtRaceSecond:
        proposal
          .createdAtRaceSecond,
      createdAtKm:
        proposal.createdAtKm,

      active: true,
    }

  const nextGroups:
    Record<
      string,
      GroupState
    > = {
      ...state.groups,
      [sourceGroup.groupId]:
        nextSourceGroup,
      [droppedGroup.groupId]:
        droppedGroup,
    }

  const nextRiders:
    Record<
      string,
      RiderState
    > = {}

  for (
    const [
      riderId,
      rider,
    ] of
    Object.entries(
      state.riders,
    )
  ) {
    nextRiders[riderId] =
      movedSet.has(
        riderId,
      )
        ? {
            ...rider,
            currentGroupId:
              droppedGroup.groupId,
          }
        : rider
  }

  const previousDroppedGroupNumber =
    state.nextDroppedGroupNumber

  const nextDroppedGroupNumber =
    previousDroppedGroupNumber +
    1

  const nextState:
    SimulationState = {
      ...state,
      groups:
        nextGroups,
      riders:
        nextRiders,
      nextDroppedGroupNumber,
    }

  return {
    state:
      nextState,
    sourceGroupId:
      sourceGroup.groupId,
    targetGroupId:
      droppedGroup.groupId,
    movedRiderIds,
    sourceRemainingRiderIds:
      expectedRemaining,
    previousDroppedGroupNumber,
    nextDroppedGroupNumber,
  }
}
