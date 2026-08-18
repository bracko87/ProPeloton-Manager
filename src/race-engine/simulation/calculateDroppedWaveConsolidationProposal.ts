/**
 * calculateDroppedWaveConsolidationProposal.ts
 *
 * Pure deterministic proposal calculation for moving a newly eligible dropped
 * wave into one already-existing active dropped group.
 *
 * Candidate rule:
 * - target must be an active dropped group behind or level with the source;
 * - estimated time between groups must be within the configured threshold;
 * - absolute gap difference must be within the configured threshold;
 * - ties resolve by estimated time, physical distance, then groupId.
 *
 * This file does not mutate SimulationState, emit events, move groups, access
 * Supabase, or activate production execution.
 */

import type {
  GroupType,
} from '../domain/GroupState'
import type {
  SimulationState,
} from '../domain/SimulationState'

export interface CalculateDroppedWaveConsolidationProposalInput {
  readonly state:
    SimulationState
  readonly sourceGroupId: string
  readonly eligibleRiderIds:
    readonly string[]
  readonly maximumTimeBetweenSeconds: number
  readonly maximumGapDifferenceSeconds: number
}

export interface DroppedWaveConsolidationCandidate {
  readonly targetGroupId: string
  readonly targetRiderCount: number
  readonly targetDistanceKm: number
  readonly targetSpeedKmh: number
  readonly targetGapFromLeaderSeconds: number
  readonly targetCreatedAtRaceSecond: number
  readonly targetCreatedAtKm: number
  readonly distanceBetweenKm: number
  readonly distanceBetweenMetres: number
  readonly gapDifferenceSeconds: number
  readonly estimatedTimeBetweenSeconds: number
}

export interface DroppedWaveConsolidationProposal {
  readonly sourceGroupId: string
  readonly sourceGroupType:
    GroupType

  readonly targetGroupId: string
  readonly targetGroupType:
    'dropped'

  readonly movedRiderIds:
    readonly string[]
  readonly sourceRemainingRiderIds:
    readonly string[]
  readonly targetExistingRiderIds:
    readonly string[]
  readonly targetCombinedRiderIds:
    readonly string[]

  readonly sourceDistanceKm: number
  readonly sourceSpeedKmh: number
  readonly sourceGapFromLeaderSeconds: number

  readonly targetDistanceKm: number
  readonly targetSpeedKmh: number
  readonly targetGapFromLeaderSeconds: number
  readonly targetCreatedAtRaceSecond: number
  readonly targetCreatedAtKm: number

  /**
   * Common movement fields describe the position inherited by moved riders.
   */
  readonly distanceKm: number
  readonly speedKmh: number
  readonly gapFromLeaderSeconds: number

  /**
   * Transition time and the source-wave kilometre where consolidation was
   * selected.
   */
  readonly createdAtRaceSecond: number
  readonly createdAtKm: number

  readonly distanceBetweenKm: number
  readonly distanceBetweenMetres: number
  readonly gapDifferenceSeconds: number
  readonly estimatedTimeBetweenSeconds: number

  readonly maximumTimeBetweenSeconds: number
  readonly maximumGapDifferenceSeconds: number

  /**
   * Consolidation must preserve this counter.
   */
  readonly droppedGroupNumber: number

  readonly candidates:
    readonly DroppedWaveConsolidationCandidate[]
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
      `calculateDroppedWaveConsolidationProposal: ${fieldName} must be a non-empty string.`,
    )
  }
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `calculateDroppedWaveConsolidationProposal: ${fieldName} must be finite and non-negative.`,
    )
  }
}

function sortUniqueRiderIds(
  riderIds:
    readonly string[],
): readonly string[] {
  if (!Array.isArray(riderIds)) {
    throw new Error(
      'calculateDroppedWaveConsolidationProposal: eligibleRiderIds must be an array.',
    )
  }

  const values =
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
    index < values.length;
    index += 1
  ) {
    const riderId =
      values[index]

    assertNonBlank(
      riderId,
      `eligibleRiderIds[${index}]`,
    )

    if (
      index > 0 &&
      riderId ===
        values[index - 1]
    ) {
      throw new Error(
        `calculateDroppedWaveConsolidationProposal: duplicate eligible rider ${riderId}.`,
      )
    }
  }

  return values
}

function estimateTimeBetweenSeconds(
  distanceBetweenKm: number,
  sourceSpeedKmh: number,
  targetSpeedKmh: number,
): number {
  if (
    distanceBetweenKm <= 0
  ) {
    return 0
  }

  const referenceSpeedKmh =
    Math.max(
      0.000001,
      (
        sourceSpeedKmh +
        targetSpeedKmh
      ) /
        2,
    )

  return (
    distanceBetweenKm /
    referenceSpeedKmh
  ) *
    3600
}

/**
 * Calculates an immutable consolidation proposal.
 *
 * Returns null when:
 * - no rider is eligible; or
 * - no active dropped group satisfies both configured thresholds.
 */
export function calculateDroppedWaveConsolidationProposal(
  input:
    CalculateDroppedWaveConsolidationProposalInput,
): DroppedWaveConsolidationProposal | null {
  const {
    state,
    sourceGroupId,
    maximumTimeBetweenSeconds,
    maximumGapDifferenceSeconds,
  } = input

  if (state.completed) {
    throw new Error(
      'calculateDroppedWaveConsolidationProposal: cannot propose consolidation for a completed simulation.',
    )
  }

  assertNonBlank(
    sourceGroupId,
    'sourceGroupId',
  )

  assertFiniteNonNegative(
    maximumTimeBetweenSeconds,
    'maximumTimeBetweenSeconds',
  )

  assertFiniteNonNegative(
    maximumGapDifferenceSeconds,
    'maximumGapDifferenceSeconds',
  )

  const sourceGroup =
    state.groups[
      sourceGroupId
    ]

  if (!sourceGroup) {
    throw new Error(
      `calculateDroppedWaveConsolidationProposal: source group ${sourceGroupId} does not exist.`,
    )
  }

  if (!sourceGroup.active) {
    throw new Error(
      `calculateDroppedWaveConsolidationProposal: source group ${sourceGroupId} must be active.`,
    )
  }

  if (
    sourceGroup.groupType ===
      'finished' ||
    sourceGroup.groupType ===
      'dropped'
  ) {
    throw new Error(
      `calculateDroppedWaveConsolidationProposal: source group type ${sourceGroup.groupType} is not eligible.`,
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
        `calculateDroppedWaveConsolidationProposal: rider ${riderId} is not in source group ${sourceGroupId}.`,
      )
    }

    const rider =
      state.riders[
        riderId
      ]

    if (!rider) {
      throw new Error(
        `calculateDroppedWaveConsolidationProposal: rider ${riderId} does not exist.`,
      )
    }

    if (
      rider.currentGroupId !==
      sourceGroupId ||
      rider.stageStatus !==
        'racing'
    ) {
      throw new Error(
        `calculateDroppedWaveConsolidationProposal: rider ${riderId} is no longer eligible in source group ${sourceGroupId}.`,
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
      'calculateDroppedWaveConsolidationProposal: consolidation may not empty the source group.',
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
      'calculateDroppedWaveConsolidationProposal: nextDroppedGroupNumber must be a positive integer.',
    )
  }

  const candidates:
    DroppedWaveConsolidationCandidate[] =
    Object.values(
      state.groups,
    )
      .filter(
        (group) =>
          group.active &&
          group.groupType ===
            'dropped' &&
          group.groupId !==
            sourceGroupId &&
          group.distanceKm <=
            sourceGroup.distanceKm &&
          group.riderIds.some(
            (riderId) =>
              state.riders[
                riderId
              ]?.stageStatus ===
              'racing',
          ),
      )
      .map(
        (targetGroup) => {
          const distanceBetweenKm =
            Math.max(
              0,
              sourceGroup.distanceKm -
                targetGroup.distanceKm,
            )

          const gapDifferenceSeconds =
            Math.abs(
              sourceGroup
                .gapFromLeaderSeconds -
                targetGroup
                  .gapFromLeaderSeconds,
            )

          return {
            targetGroupId:
              targetGroup.groupId,
            targetRiderCount:
              targetGroup
                .riderIds.length,
            targetDistanceKm:
              targetGroup.distanceKm,
            targetSpeedKmh:
              targetGroup.speedKmh,
            targetGapFromLeaderSeconds:
              targetGroup
                .gapFromLeaderSeconds,
            targetCreatedAtRaceSecond:
              targetGroup
                .createdAtRaceSecond,
            targetCreatedAtKm:
              targetGroup
                .createdAtKm,
            distanceBetweenKm,
            distanceBetweenMetres:
              distanceBetweenKm *
              1000,
            gapDifferenceSeconds,
            estimatedTimeBetweenSeconds:
              estimateTimeBetweenSeconds(
                distanceBetweenKm,
                sourceGroup.speedKmh,
                targetGroup.speedKmh,
              ),
          }
        },
      )
      .sort(
        (left, right) => {
          if (
            left.estimatedTimeBetweenSeconds !==
            right.estimatedTimeBetweenSeconds
          ) {
            return (
              left.estimatedTimeBetweenSeconds -
              right.estimatedTimeBetweenSeconds
            )
          }

          if (
            left.distanceBetweenKm !==
            right.distanceBetweenKm
          ) {
            return (
              left.distanceBetweenKm -
              right.distanceBetweenKm
            )
          }

          return left.targetGroupId
            .localeCompare(
              right.targetGroupId,
            )
        },
      )

  const selected =
    candidates.find(
      (candidate) =>
        candidate
          .estimatedTimeBetweenSeconds <=
          maximumTimeBetweenSeconds &&
        candidate
          .gapDifferenceSeconds <=
          maximumGapDifferenceSeconds,
    )

  if (!selected) {
    return null
  }

  const targetGroup =
    state.groups[
      selected.targetGroupId
    ]

  if (!targetGroup) {
    throw new Error(
      `calculateDroppedWaveConsolidationProposal: selected target ${selected.targetGroupId} disappeared.`,
    )
  }

  const targetExistingRiderIds =
    targetGroup.riderIds
      .slice()
      .sort(
        (left, right) =>
          left.localeCompare(
            right,
          ),
      )

  const targetCombinedRiderIds = [
    ...targetExistingRiderIds,
    ...movedRiderIds,
  ].sort(
    (left, right) =>
      left.localeCompare(
        right,
      ),
  )

  if (
    new Set(
      targetCombinedRiderIds,
    ).size !==
    targetCombinedRiderIds.length
  ) {
    throw new Error(
      'calculateDroppedWaveConsolidationProposal: source and target rider memberships overlap.',
    )
  }

  return {
    sourceGroupId,
    sourceGroupType:
      sourceGroup.groupType,

    targetGroupId:
      targetGroup.groupId,
    targetGroupType:
      'dropped',

    movedRiderIds,
    sourceRemainingRiderIds,
    targetExistingRiderIds,
    targetCombinedRiderIds,

    sourceDistanceKm:
      sourceGroup.distanceKm,
    sourceSpeedKmh:
      sourceGroup.speedKmh,
    sourceGapFromLeaderSeconds:
      sourceGroup
        .gapFromLeaderSeconds,

    targetDistanceKm:
      targetGroup.distanceKm,
    targetSpeedKmh:
      targetGroup.speedKmh,
    targetGapFromLeaderSeconds:
      targetGroup
        .gapFromLeaderSeconds,
    targetCreatedAtRaceSecond:
      targetGroup
        .createdAtRaceSecond,
    targetCreatedAtKm:
      targetGroup.createdAtKm,

    distanceKm:
      targetGroup.distanceKm,
    speedKmh:
      targetGroup.speedKmh,
    gapFromLeaderSeconds:
      targetGroup
        .gapFromLeaderSeconds,

    createdAtRaceSecond:
      state.raceSecond,
    createdAtKm:
      sourceGroup.distanceKm,

    distanceBetweenKm:
      selected.distanceBetweenKm,
    distanceBetweenMetres:
      selected
        .distanceBetweenMetres,
    gapDifferenceSeconds:
      selected
        .gapDifferenceSeconds,
    estimatedTimeBetweenSeconds:
      selected
        .estimatedTimeBetweenSeconds,

    maximumTimeBetweenSeconds,
    maximumGapDifferenceSeconds,

    droppedGroupNumber,

    candidates,
  }
}
