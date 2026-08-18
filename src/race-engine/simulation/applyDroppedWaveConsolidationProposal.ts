/**
 * applyDroppedWaveConsolidationProposal.ts
 *
 * Pure deterministic immutable application of one previously calculated
 * dropped-wave consolidation proposal.
 *
 * The moved riders leave the source group and join an existing active dropped
 * group. The target group keeps its existing identity, position, speed, gap,
 * and creation metadata. Moved riders inherit that target movement state.
 *
 * No new group is created and nextDroppedGroupNumber is unchanged.
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
  DroppedWaveConsolidationProposal,
} from './calculateDroppedWaveConsolidationProposal'

export interface ApplyDroppedWaveConsolidationProposalInput {
  readonly state:
    SimulationState
  readonly proposal:
    DroppedWaveConsolidationProposal
}

export interface ApplyDroppedWaveConsolidationProposalResult {
  readonly state:
    SimulationState
  readonly sourceGroupId: string
  readonly targetGroupId: string
  readonly movedRiderIds:
    readonly string[]
  readonly sourceRemainingRiderIds:
    readonly string[]
  readonly targetPreviousRiderIds:
    readonly string[]
  readonly targetCombinedRiderIds:
    readonly string[]
  readonly previousDroppedGroupNumber: number
  readonly nextDroppedGroupNumber: number
  readonly consolidated: true
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

function arraysEqual(
  left:
    readonly string[],
  right:
    readonly string[],
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

/**
 * Applies one consolidation proposal after strict stale-proposal validation.
 */
export function applyDroppedWaveConsolidationProposal(
  input:
    ApplyDroppedWaveConsolidationProposalInput,
): ApplyDroppedWaveConsolidationProposalResult {
  const {
    state,
    proposal,
  } = input

  if (state.completed) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: cannot consolidate a completed simulation.',
    )
  }

  const sourceGroup =
    state.groups[
      proposal.sourceGroupId
    ]

  const targetGroup =
    state.groups[
      proposal.targetGroupId
    ]

  if (!sourceGroup) {
    throw new Error(
      `applyDroppedWaveConsolidationProposal: source group ${proposal.sourceGroupId} does not exist.`,
    )
  }

  if (!targetGroup) {
    throw new Error(
      `applyDroppedWaveConsolidationProposal: target group ${proposal.targetGroupId} does not exist.`,
    )
  }

  if (
    sourceGroup.groupId ===
    targetGroup.groupId
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: source and target groups must differ.',
    )
  }

  if (
    !sourceGroup.active ||
    !targetGroup.active
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: source and target groups must remain active.',
    )
  }

  if (
    sourceGroup.groupType !==
    proposal.sourceGroupType
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: source group type has changed.',
    )
  }

  if (
    targetGroup.groupType !==
      'dropped' ||
    proposal.targetGroupType !==
      'dropped'
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: target group must remain dropped.',
    )
  }

  if (
    proposal.createdAtRaceSecond !==
    state.raceSecond
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: raceSecond has changed since proposal calculation.',
    )
  }

  if (
    proposal.droppedGroupNumber !==
    state.nextDroppedGroupNumber
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: dropped-group counter has changed since proposal calculation.',
    )
  }

  if (
    sourceGroup.distanceKm !==
      proposal.sourceDistanceKm ||
    sourceGroup.speedKmh !==
      proposal.sourceSpeedKmh ||
    sourceGroup.gapFromLeaderSeconds !==
      proposal
        .sourceGapFromLeaderSeconds ||
    proposal.createdAtKm !==
      sourceGroup.distanceKm
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: source group movement fields have changed.',
    )
  }

  if (
    targetGroup.distanceKm !==
      proposal.targetDistanceKm ||
    targetGroup.speedKmh !==
      proposal.targetSpeedKmh ||
    targetGroup.gapFromLeaderSeconds !==
      proposal
        .targetGapFromLeaderSeconds ||
    targetGroup.createdAtRaceSecond !==
      proposal
        .targetCreatedAtRaceSecond ||
    targetGroup.createdAtKm !==
      proposal.targetCreatedAtKm ||
    proposal.distanceKm !==
      targetGroup.distanceKm ||
    proposal.speedKmh !==
      targetGroup.speedKmh ||
    proposal.gapFromLeaderSeconds !==
      targetGroup
        .gapFromLeaderSeconds
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: target group movement fields have changed.',
    )
  }

  const movedRiderIds =
    sorted(
      proposal.movedRiderIds,
    )

  if (
    movedRiderIds.length ===
    0
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: proposal must move at least one rider.',
    )
  }

  if (
    !arraysEqual(
      movedRiderIds,
      proposal.movedRiderIds,
    )
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: moved rider IDs must be sorted.',
    )
  }

  if (
    new Set(
      movedRiderIds,
    ).size !==
    movedRiderIds.length
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: moved rider IDs must be unique.',
    )
  }

  const movedSet =
    new Set(
      movedRiderIds,
    )

  for (
    const riderId of
    movedRiderIds
  ) {
    if (
      !sourceGroup.riderIds
        .includes(
          riderId,
        )
    ) {
      throw new Error(
        `applyDroppedWaveConsolidationProposal: rider ${riderId} is no longer in source group ${sourceGroup.groupId}.`,
      )
    }

    if (
      targetGroup.riderIds
        .includes(
          riderId,
        )
    ) {
      throw new Error(
        `applyDroppedWaveConsolidationProposal: rider ${riderId} is already in target group ${targetGroup.groupId}.`,
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
        `applyDroppedWaveConsolidationProposal: rider ${riderId} is no longer eligible.`,
      )
    }
  }

  const expectedSourceRemaining =
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
    expectedSourceRemaining.length ===
    0
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: consolidation may not empty the source group.',
    )
  }

  if (
    !arraysEqual(
      expectedSourceRemaining,
      proposal
        .sourceRemainingRiderIds,
    )
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: source membership no longer matches the proposal.',
    )
  }

  const targetPreviousRiderIds =
    sorted(
      targetGroup.riderIds,
    )

  if (
    !arraysEqual(
      targetPreviousRiderIds,
      proposal
        .targetExistingRiderIds,
    )
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: target membership has changed since proposal calculation.',
    )
  }

  const expectedTargetCombined = [
    ...targetPreviousRiderIds,
    ...movedRiderIds,
  ].sort(
    (left, right) =>
      left.localeCompare(
        right,
      ),
  )

  if (
    new Set(
      expectedTargetCombined,
    ).size !==
    expectedTargetCombined.length
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: combined target membership contains duplicates.',
    )
  }

  if (
    !arraysEqual(
      expectedTargetCombined,
      proposal
        .targetCombinedRiderIds,
    )
  ) {
    throw new Error(
      'applyDroppedWaveConsolidationProposal: combined target membership no longer matches the proposal.',
    )
  }

  const nextSourceGroup:
    GroupState = {
      ...sourceGroup,
      riderIds:
        expectedSourceRemaining,
    }

  const nextTargetGroup:
    GroupState = {
      ...targetGroup,
      riderIds:
        expectedTargetCombined,
    }

  const nextGroups:
    Record<
      string,
      GroupState
    > = {
      ...state.groups,
      [sourceGroup.groupId]:
        nextSourceGroup,
      [targetGroup.groupId]:
        nextTargetGroup,
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
              targetGroup.groupId,
            distanceKm:
              targetGroup.distanceKm,
            speedKmh:
              targetGroup.speedKmh,
          }
        : rider
  }

  const previousDroppedGroupNumber =
    state.nextDroppedGroupNumber

  const nextDroppedGroupNumber =
    previousDroppedGroupNumber

  return {
    state: {
      ...state,
      groups:
        nextGroups,
      riders:
        nextRiders,
      nextDroppedGroupNumber,
    },
    sourceGroupId:
      sourceGroup.groupId,
    targetGroupId:
      targetGroup.groupId,
    movedRiderIds,
    sourceRemainingRiderIds:
      expectedSourceRemaining,
    targetPreviousRiderIds,
    targetCombinedRiderIds:
      expectedTargetCombined,
    previousDroppedGroupNumber,
    nextDroppedGroupNumber,
    consolidated: true,
  }
}
