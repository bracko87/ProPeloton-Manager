/**
 * terrainAwareMultiGroupMovement.ts
 *
 * Pure deterministic candidate multi-group movement using groupTerrainPace.
 *
 * This is an inactive diagnostic alternative to calculateMultiGroupMovement().
 * It does not mutate SimulationState, create events, apply energy, finish
 * riders, or activate production execution.
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
  MultiGroupMovementProposal,
  MultiGroupMovementResult,
} from './multiGroupMovement'
import {
  calculateGroupTerrainPace,
  type GroupTerrainPaceResult,
} from './groupTerrainPace'
import {
  getStageTerrainSample,
} from './stageProfile'
import type {
  SteepGradientSeverityModel,
} from './steepGradientTerrainSeverity'

export interface TerrainAwareGroupMovementDiagnostic {
  readonly groupId: string
  readonly pace:
    GroupTerrainPaceResult
}

export interface TerrainAwareMultiGroupMovementResult {
  readonly movement:
    MultiGroupMovementResult
  readonly groupDiagnostics:
    readonly TerrainAwareGroupMovementDiagnostic[]
}

export interface TerrainAwareMultiGroupMovementOptions {
  /**
   * Disabled by default. When disabled, movement remains exactly equivalent to
   * the existing Phase 7B.7 terrain-aware calculation.
   */
  readonly steepGradientSeverityEnabled?: boolean
  readonly steepGradientSeverityModel?:
    SteepGradientSeverityModel
}

function getRacingGroupRiders(
  state: SimulationState,
  group: GroupState,
): RiderState[] {
  return group.riderIds
    .slice()
    .sort(
      (left, right) =>
        left.localeCompare(
          right,
        ),
    )
    .map(
      (riderId) => {
        const rider =
          state.riders[
            riderId
          ]

        if (!rider) {
          throw new Error(
            `calculateTerrainAwareMultiGroupMovement: group ${group.groupId} references missing rider ${riderId}.`,
          )
        }

        if (
          rider.currentGroupId !==
          group.groupId
        ) {
          throw new Error(
            `calculateTerrainAwareMultiGroupMovement: rider ${riderId} membership does not match group ${group.groupId}.`,
          )
        }

        return rider
      },
    )
    .filter(
      (rider) =>
        rider.stageStatus ===
        'racing',
    )
}

/**
 * Calculates one candidate movement proposal for every active group.
 *
 * Partial-finish gap semantics match multiGroupMovement:
 * - before a winner exists, gaps use the active leader's speed;
 * - after a winner exists, a trailing group's gap is elapsed time since the
 *   winner finished plus its estimated remaining time to the finish.
 */
export function calculateTerrainAwareMultiGroupMovement(
  state: SimulationState,
  terrainCapabilityInfluence: number,
  options:
    TerrainAwareMultiGroupMovementOptions = {},
): TerrainAwareMultiGroupMovementResult {
  if (state.completed) {
    throw new Error(
      'calculateTerrainAwareMultiGroupMovement: cannot calculate movement for a completed simulation.',
    )
  }

  const tickSeconds =
    state.input.settings
      .tickSeconds

  if (
    !Number.isInteger(
      tickSeconds,
    ) ||
    tickSeconds <= 0
  ) {
    throw new Error(
      'calculateTerrainAwareMultiGroupMovement: tickSeconds must be a positive integer.',
    )
  }

  const activeGroups =
    Object.values(
      state.groups,
    )
      .filter(
        (group) =>
          group.active,
      )
      .slice()
      .sort(
        (left, right) =>
          left.groupId.localeCompare(
            right.groupId,
          ),
      )

  if (
    activeGroups.length === 0
  ) {
    throw new Error(
      'calculateTerrainAwareMultiGroupMovement: at least one active group is required.',
    )
  }

  const preliminary =
    activeGroups.map(
      (group) => {
        const riders =
          getRacingGroupRiders(
            state,
            group,
          )

        if (
          riders.length === 0
        ) {
          throw new Error(
            `calculateTerrainAwareMultiGroupMovement: active group ${group.groupId} has no racing riders.`,
          )
        }

        const terrainSample =
          getStageTerrainSample(
            state.input,
            group.distanceKm,
          )

        const pace =
          calculateGroupTerrainPace({
            riders,
            gradientPercent:
              terrainSample
                .gradientPercent,
            minimumSpeedKmh:
              state.input.settings
                .minimumSpeedKmh,
            maximumSpeedKmh:
              state.input.settings
                .maximumSpeedKmh,
            terrainCapabilityInfluence,
            groupType:
              group.groupType,
            steepGradientSeverityEnabled:
              options
                .steepGradientSeverityEnabled,
            steepGradientSeverityModel:
              options
                .steepGradientSeverityModel,
          })

        const unclampedNextDistanceKm =
          group.distanceKm +
          pace.appliedSpeedKmh *
            (
              tickSeconds /
              3600
            )

        const nextDistanceKm =
          Math.min(
            state.stageDistanceKm,
            unclampedNextDistanceKm,
          )

        return {
          group,
          terrainSample,
          pace,
          nextDistanceKm,
          distanceAdvancedKm:
            nextDistanceKm -
            group.distanceKm,
        }
      },
    )

  const leaderEntry =
    preliminary
      .slice()
      .sort(
        (left, right) => {
          if (
            left.nextDistanceKm !==
            right.nextDistanceKm
          ) {
            return (
              right.nextDistanceKm -
              left.nextDistanceKm
            )
          }

          return left.group.groupId
            .localeCompare(
              right.group.groupId,
            )
        },
      )[0]

  if (!leaderEntry) {
    throw new Error(
      'calculateTerrainAwareMultiGroupMovement: could not resolve a leader.',
    )
  }

  const activeLeaderDistanceKm =
    leaderEntry
      .nextDistanceKm

  const raceLeaderDistanceKm =
    Math.max(
      state.currentKm,
      activeLeaderDistanceKm,
    )

  const activeLeaderSpeedKmh =
    Math.max(
      leaderEntry
        .pace
        .appliedSpeedKmh,
      0.000001,
    )

  const finishedLeaderIsAhead =
    raceLeaderDistanceKm >
    activeLeaderDistanceKm

  const existingFinishTimes =
    Object.values(state.riders)
      .filter(
        (rider) =>
          rider.stageStatus ===
            'finished' &&
          typeof rider.finishTimeSeconds ===
            'number',
      )
      .map(
        (rider) =>
          rider.finishTimeSeconds as number,
      )

  const winnerFinishTimeSeconds =
    existingFinishTimes.length > 0
      ? Math.min(
          ...existingFinishTimes,
        )
      : null

  const predictedRaceSecond =
    state.raceSecond +
    tickSeconds

  const proposals:
    MultiGroupMovementProposal[] =
    preliminary.map(
      (entry) => {
        const distanceGapKm =
          Math.max(
            0,
            raceLeaderDistanceKm -
              entry.nextDistanceKm,
          )

        const gapReferenceSpeedKmh =
          finishedLeaderIsAhead
            ? Math.max(
                entry.pace
                  .appliedSpeedKmh,
                0.000001,
              )
            : activeLeaderSpeedKmh

        const remainingTimeToLeaderSeconds =
          distanceGapKm === 0
            ? 0
            : (
                distanceGapKm /
                gapReferenceSpeedKmh
              ) *
              3600

        const elapsedSinceWinnerSeconds =
          finishedLeaderIsAhead &&
          winnerFinishTimeSeconds !== null
            ? Math.max(
                0,
                predictedRaceSecond -
                  winnerFinishTimeSeconds,
              )
            : 0

        const gapFromLeaderSeconds =
          remainingTimeToLeaderSeconds +
          elapsedSinceWinnerSeconds

        return {
          groupId:
            entry.group.groupId,
          groupType:
            entry.group.groupType,
          riderIds:
            entry.group.riderIds
              .slice()
              .sort(
                (left, right) =>
                  left.localeCompare(
                    right,
                  ),
              ),
          previousDistanceKm:
            entry.group.distanceKm,
          nextDistanceKm:
            entry.nextDistanceKm,
          distanceAdvancedKm:
            entry
              .distanceAdvancedKm,
          elevationMetres:
            entry.terrainSample
              .elevationMetres,
          gradientPercent:
            entry.terrainSample
              .gradientPercent,
          baseSpeedKmh:
            entry.pace
              .adjustedBaseSpeedKmh,
          terrainMultiplier:
            entry.pace
              .terrainMultiplier,
          appliedSpeedKmh:
            entry.pace
              .appliedSpeedKmh,
          gapFromLeaderSeconds,
          active: true,
        }
      },
    )

  return {
    movement: {
      tickSeconds,
      leaderGroupId:
        leaderEntry.group.groupId,
      leaderDistanceKm:
        activeLeaderDistanceKm,
      proposals,
    },
    groupDiagnostics:
      preliminary.map(
        (entry) => ({
          groupId:
            entry.group.groupId,
          pace:
            entry.pace,
        }),
      ),
  }
}
