/**
 * applyDroppedTransitionRaceEvent.ts
 *
 * Pure deterministic immutable application of one authoritative race event for
 * an already-applied dropped-group creation or dropped-wave consolidation.
 *
 * Event mapping:
 * - created      -> GROUP_CREATED
 * - consolidated -> GROUP_CAUGHT
 *
 * The transition application remains responsible for membership and counters.
 * This utility only appends one event and increments nextEventSequenceNumber.
 *
 * It does not move riders, create groups, change energy, finish riders, access
 * Supabase, or activate production execution.
 */

import type {
  RaceEvent,
} from '../domain/RaceEvent'
import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  ApplyDroppedGroupTransitionProposalResult,
} from './applyDroppedGroupTransitionProposal'
import type {
  ApplyDroppedWaveConsolidationProposalResult,
} from './applyDroppedWaveConsolidationProposal'
import type {
  DroppedGroupTransitionProposal,
} from './calculateDroppedGroupTransitionProposal'
import type {
  DroppedWaveConsolidationProposal,
} from './calculateDroppedWaveConsolidationProposal'

export type DroppedTransitionEventKind =
  | 'created'
  | 'consolidated'

export interface ApplyCreatedDroppedTransitionRaceEventInput {
  readonly state:
    SimulationState
  readonly transitionKind:
    'created'
  readonly proposal:
    DroppedGroupTransitionProposal
  readonly application:
    ApplyDroppedGroupTransitionProposalResult
}

export interface ApplyConsolidatedDroppedTransitionRaceEventInput {
  readonly state:
    SimulationState
  readonly transitionKind:
    'consolidated'
  readonly proposal:
    DroppedWaveConsolidationProposal
  readonly application:
    ApplyDroppedWaveConsolidationProposalResult
}

export type ApplyDroppedTransitionRaceEventInput =
  | ApplyCreatedDroppedTransitionRaceEventInput
  | ApplyConsolidatedDroppedTransitionRaceEventInput

export interface ApplyDroppedTransitionRaceEventResult {
  readonly state:
    SimulationState
  readonly event:
    RaceEvent
  readonly previousEventSequenceNumber:
    number
  readonly nextEventSequenceNumber:
    number
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
      (
        value,
        index,
      ) =>
        value ===
        right[index],
    )
  )
}

function sortedUnique(
  values:
    readonly string[],
  fieldName: string,
): readonly string[] {
  const sorted =
    values
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

  for (
    let index = 0;
    index < sorted.length;
    index += 1
  ) {
    const value =
      sorted[index]

    if (
      typeof value !==
        'string' ||
      value.trim().length ===
        0
    ) {
      throw new Error(
        `applyDroppedTransitionRaceEvent: ${fieldName}[${index}] must be a non-empty string.`,
      )
    }

    if (
      index > 0 &&
      value ===
        sorted[
          index - 1
        ]
    ) {
      throw new Error(
        `applyDroppedTransitionRaceEvent: ${fieldName} contains duplicate rider ${value}.`,
      )
    }
  }

  return sorted
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
      `applyDroppedTransitionRaceEvent: ${fieldName} must be finite and non-negative.`,
    )
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      `applyDroppedTransitionRaceEvent: ${fieldName} must be a positive integer.`,
    )
  }
}

function validateCommon(
  input:
    ApplyDroppedTransitionRaceEventInput,
): {
  readonly movedRiderIds:
    readonly string[]
  readonly sourceRemainingRiderCount:
    number
  readonly targetRiderCountBefore:
    number
  readonly targetRiderCountAfter:
    number
} {
  const {
    state,
    proposal,
    application,
  } = input

  if (state.completed) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: cannot append a transition event to a completed simulation.',
    )
  }

  assertPositiveInteger(
    state.nextEventSequenceNumber,
    'state.nextEventSequenceNumber',
  )

  if (
    state.nextEventSequenceNumber !==
    state.events.length + 1
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: nextEventSequenceNumber must equal events.length + 1.',
    )
  }

  if (
    proposal.sourceGroupId !==
      application.sourceGroupId ||
    proposal.targetGroupId !==
      application.targetGroupId
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: proposal and application group IDs do not match.',
    )
  }

  const movedRiderIds =
    sortedUnique(
      application.movedRiderIds,
      'application.movedRiderIds',
    )

  if (
    movedRiderIds.length ===
    0
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: at least one moved rider is required.',
    )
  }

  if (
    !arraysEqual(
      movedRiderIds,
      application
        .movedRiderIds,
    ) ||
    !arraysEqual(
      movedRiderIds,
      proposal.movedRiderIds,
    )
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: moved rider ordering does not match proposal and application.',
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

  if (
    !sourceGroup ||
    !targetGroup
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: source and target groups must exist in the applied state.',
    )
  }

  if (
    sourceGroup.riderIds.length !==
    application
      .sourceRemainingRiderIds
      .length
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: source group size does not match the transition application.',
    )
  }

  for (
    const riderId of
    movedRiderIds
  ) {
    const rider =
      state.riders[
        riderId
      ]

    if (
      !rider ||
      rider.currentGroupId !==
        proposal.targetGroupId
    ) {
      throw new Error(
        `applyDroppedTransitionRaceEvent: moved rider ${riderId} is not in target group ${proposal.targetGroupId}.`,
      )
    }
  }

  if (
    proposal.createdAtRaceSecond !==
    state.raceSecond
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: transition raceSecond does not match state.',
    )
  }

  assertFiniteNonNegative(
    proposal.createdAtKm,
    'proposal.createdAtKm',
  )

  if (
    proposal.createdAtKm >
    state.stageDistanceKm
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: transition kilometre exceeds the stage distance.',
    )
  }

  const targetRiderCountBefore =
    input.transitionKind ===
      'created'
      ? 0
      : input.application
          .targetPreviousRiderIds
          .length

  const targetRiderCountAfter =
    input.transitionKind ===
      'created'
      ? input.application
          .movedRiderIds
          .length
      : input.application
          .targetCombinedRiderIds
          .length

  if (
    targetRiderCountAfter !==
    targetRiderCountBefore +
      movedRiderIds.length
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: target rider counts are inconsistent.',
    )
  }

  if (
    targetGroup.riderIds.length !==
    targetRiderCountAfter
  ) {
    throw new Error(
      'applyDroppedTransitionRaceEvent: target group size does not match the transition application.',
    )
  }

  return {
    movedRiderIds,
    sourceRemainingRiderCount:
      application
        .sourceRemainingRiderIds
        .length,
    targetRiderCountBefore,
    targetRiderCountAfter,
  }
}

function createPayload(
  input:
    ApplyDroppedTransitionRaceEventInput,
  counts: {
    readonly movedRiderIds:
      readonly string[]
    readonly sourceRemainingRiderCount:
      number
    readonly targetRiderCountBefore:
      number
    readonly targetRiderCountAfter:
      number
  },
): Readonly<
  Record<
    string,
    unknown
  >
> {
  const {
    proposal,
    application,
    transitionKind,
  } = input

  const common = {
    transitionKind,
    movedRiderCount:
      counts
        .movedRiderIds
        .length,
    sourceRemainingRiderCount:
      counts
        .sourceRemainingRiderCount,
    targetRiderCountBefore:
      counts
        .targetRiderCountBefore,
    targetRiderCountAfter:
      counts
        .targetRiderCountAfter,

    previousDroppedGroupNumber:
      application
        .previousDroppedGroupNumber,
    nextDroppedGroupNumber:
      application
        .nextDroppedGroupNumber,

    sourceGroupType:
      proposal.sourceGroupType,
    targetGroupType:
      proposal.targetGroupType,

    createdAtRaceSecond:
      proposal
        .createdAtRaceSecond,
    createdAtKm:
      proposal.createdAtKm,
  }

  if (
    transitionKind ===
    'created'
  ) {
    return {
      ...common,

      sourceDistanceKm:
        proposal.distanceKm,
      targetDistanceKm:
        proposal.distanceKm,
      sourceSpeedKmh:
        proposal.speedKmh,
      targetSpeedKmh:
        proposal.speedKmh,
      sourceGapFromLeaderSeconds:
        proposal
          .gapFromLeaderSeconds,
      targetGapFromLeaderSeconds:
        proposal
          .gapFromLeaderSeconds,

      distanceBetweenKm: null,
      distanceBetweenMetres: null,
      gapDifferenceSeconds: null,
      estimatedTimeBetweenSeconds: null,
      maximumTimeBetweenSeconds: null,
      maximumGapDifferenceSeconds: null,

      temporaryTransitionRule:
        'dropped_group_created_v1',
    }
  }

  return {
    ...common,

    sourceDistanceKm:
      proposal
        .sourceDistanceKm,
    targetDistanceKm:
      proposal
        .targetDistanceKm,
    sourceSpeedKmh:
      proposal.sourceSpeedKmh,
    targetSpeedKmh:
      proposal.targetSpeedKmh,
    sourceGapFromLeaderSeconds:
      proposal
        .sourceGapFromLeaderSeconds,
    targetGapFromLeaderSeconds:
      proposal
        .targetGapFromLeaderSeconds,

    distanceBetweenKm:
      proposal
        .distanceBetweenKm,
    distanceBetweenMetres:
      proposal
        .distanceBetweenMetres,
    gapDifferenceSeconds:
      proposal
        .gapDifferenceSeconds,
    estimatedTimeBetweenSeconds:
      proposal
        .estimatedTimeBetweenSeconds,
    maximumTimeBetweenSeconds:
      proposal
        .maximumTimeBetweenSeconds,
    maximumGapDifferenceSeconds:
      proposal
        .maximumGapDifferenceSeconds,

    temporaryTransitionRule:
      'dropped_wave_consolidated_v1',
  }
}

/**
 * Appends one deterministic transition event to an already-applied transition
 * state.
 */
export function applyDroppedTransitionRaceEvent(
  input:
    ApplyDroppedTransitionRaceEventInput,
): ApplyDroppedTransitionRaceEventResult {
  const counts =
    validateCommon(
      input,
    )

  const previousEventSequenceNumber =
    input.state
      .nextEventSequenceNumber

  const event:
    RaceEvent = {
      sequenceNumber:
        previousEventSequenceNumber,
      eventType:
        input.transitionKind ===
          'created'
          ? 'GROUP_CREATED'
          : 'GROUP_CAUGHT',
      raceSecond:
        input.state
          .raceSecond,
      kmMarker:
        input.proposal
          .createdAtKm,
      actorRiderId: null,
      teamId: null,
      sourceGroupId:
        input.proposal
          .sourceGroupId,
      targetGroupId:
        input.proposal
          .targetGroupId,
      relatedRiderIds:
        counts
          .movedRiderIds
          .slice(),
      payload:
        createPayload(
          input,
          counts,
        ),
      commentaryText: null,
    }

  const nextEventSequenceNumber =
    previousEventSequenceNumber +
    1

  const nextState:
    SimulationState = {
      ...input.state,
      events: [
        ...input.state.events,
        event,
      ],
      nextEventSequenceNumber,
    }

  return {
    state:
      nextState,
    event,
    previousEventSequenceNumber,
    nextEventSequenceNumber,
  }
}
