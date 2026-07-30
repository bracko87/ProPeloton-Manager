/**
 * terrainAwareMultiGroupMovement.ts
 *
 * Pure deterministic candidate multi-group movement using groupTerrainPace.
 *
 * This is the terrain-aware movement calculator used by the calibrated
 * deterministic runner.
 *
 * It does not mutate SimulationState, create events, apply rider energy,
 * finish riders, or persist production output.
 *
 * When the calibrated wrapper enables weather performance, the final
 * terrain-aware applied speed is multiplied directly by the canonical weather
 * speed multiplier. The terrain pace calculation, steep-gradient severity,
 * group-type handling, physical gap ordering, and finish-gap semantics remain
 * unchanged. A multiplier of exactly 1 preserves the original speed value.
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
import {
  calculateWeatherPerformanceEffects,
} from './weatherPerformanceEffects'
import type {
  SteepGradientSeverityModel,
} from './steepGradientTerrainSeverity'

export const TERRAIN_AWARE_MULTI_GROUP_MOVEMENT_VERSION =
  'phase_8g5c_latest_weather_direct_v1'

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
 * Physical replay-gap semantics:
 * - every active group in the same tick uses one common reference speed;
 * - groups ordered by distance therefore have non-decreasing leader gaps;
 * - after a winner exists, elapsed time since the winner is added equally to
 *   every remaining active group.
 *
 * Using each trailing group's own speed after the winner finished produced
 * predicted finish deficits rather than physical replay gaps. A closer but
 * slower group could receive a larger gap than a group physically behind it,
 * which violated the authoritative replay group-order contract.
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

  const weatherEffects =
    state
      .weatherPerformanceEffectsEnabled ===
      true
      ? calculateWeatherPerformanceEffects(
          state.input.weather,
        )
      : calculateWeatherPerformanceEffects(
          undefined,
        )

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

        const weatherAdjustedAppliedSpeedKmh =
          weatherEffects
            .speedMultiplier ===
            1
            ? pace.appliedSpeedKmh
            : Number(
                (
                  pace.appliedSpeedKmh *
                  weatherEffects
                    .speedMultiplier
                ).toFixed(6),
              )

        const unclampedNextDistanceKm =
          group.distanceKm +
          weatherAdjustedAppliedSpeedKmh *
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
          weatherAdjustedAppliedSpeedKmh,
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

  const commonGapReferenceSpeedKmh =
    Math.max(
      leaderEntry
        .weatherAdjustedAppliedSpeedKmh,
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

        /*
         * Use one common speed for every active group in this tick.
         *
         * This converts physical distance differences into physical replay
         * gaps and guarantees that groups ordered by distance also have
         * non-decreasing gapFromLeaderSeconds values.
         *
         * After the winner has finished, elapsedSinceWinnerSeconds is added
         * equally to all trailing groups below.
         */
        const remainingTimeToLeaderSeconds =
          distanceGapKm === 0
            ? 0
            : (
                distanceGapKm /
                commonGapReferenceSpeedKmh
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
            entry
              .weatherAdjustedAppliedSpeedKmh,
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
