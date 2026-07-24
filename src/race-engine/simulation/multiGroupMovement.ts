/**
 * multiGroupMovement.ts
 *
 * Pure deterministic proposal calculation for moving all active race groups
 * during one simulation tick.
 *
 * This utility does not mutate SimulationState, finish riders, create events,
 * or activate any runtime execution.
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
  calculatePelotonBasePace,
} from './pelotonPace'
import {
  getStageTerrainSample,
} from './stageProfile'
import {
  calculateTerrainSpeed,
} from './terrainSpeed'

export interface MultiGroupMovementProposal {
  readonly groupId: string
  readonly groupType:
    GroupState['groupType']
  readonly riderIds:
    readonly string[]
  readonly previousDistanceKm:
    number
  readonly nextDistanceKm:
    number
  readonly distanceAdvancedKm:
    number
  readonly elevationMetres:
    number
  readonly gradientPercent:
    number
  readonly baseSpeedKmh:
    number
  readonly terrainMultiplier:
    number
  readonly appliedSpeedKmh:
    number
  readonly gapFromLeaderSeconds:
    number
  readonly active: boolean
}

export interface MultiGroupMovementResult {
  readonly tickSeconds: number
  readonly leaderGroupId: string
  readonly leaderDistanceKm:
    number
  readonly proposals:
    readonly MultiGroupMovementProposal[]
}

function assertFinitePositive(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `calculateMultiGroupMovement: ${fieldName} must be finite and greater than 0.`,
    )
  }
}

function getRacingGroupRiders(
  state: SimulationState,
  group: GroupState,
): RiderState[] {
  return group.riderIds
    .slice()
    .sort(
      (
        riderIdA,
        riderIdB,
      ) =>
        riderIdA.localeCompare(
          riderIdB,
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
            `calculateMultiGroupMovement: group ${group.groupId} references missing rider ${riderId}.`,
          )
        }

        if (
          rider.currentGroupId !==
          group.groupId
        ) {
          throw new Error(
            `calculateMultiGroupMovement: rider ${riderId} membership does not match group ${group.groupId}.`,
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
 * Calculates proposed movement for every active group in stable group-ID order.
 *
 * Every group receives its own fatigue-adjusted rider capability, base pace,
 * terrain adjustment and distance advance.
 *
 * Gap semantics:
 * - gapFromLeaderSeconds is a physical replay gap;
 * - every active group in the same tick uses one common reference speed;
 * - therefore groups ordered by distance always have non-decreasing leader gaps;
 * - after the winner finishes, elapsed time since the winner is added equally
 *   to every active trailing group.
 *
 * Using each trailing group's own speed after the winner finished produced
 * predicted finish deficits rather than physical replay gaps. A physically
 * closer but slower group could then receive a larger gap than a group behind
 * it, breaking the authoritative group-order contract.
 */
export function calculateMultiGroupMovement(
  state: SimulationState,
): MultiGroupMovementResult {
  if (state.completed) {
    throw new Error(
      'calculateMultiGroupMovement: cannot calculate movement for a completed simulation.',
    )
  }

  const tickSeconds =
    state.input.settings
      .tickSeconds

  assertFinitePositive(
    tickSeconds,
    'tickSeconds',
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
        (
          groupA,
          groupB,
        ) =>
          groupA.groupId
            .localeCompare(
              groupB.groupId,
            ),
      )

  if (
    activeGroups.length ===
    0
  ) {
    throw new Error(
      'calculateMultiGroupMovement: at least one active group is required.',
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
          riders.length ===
          0
        ) {
          throw new Error(
            `calculateMultiGroupMovement: active group ${group.groupId} has no racing riders.`,
          )
        }

        const pace =
          calculatePelotonBasePace({
            riders,
            minimumSpeedKmh:
              state.input.settings
                .minimumSpeedKmh,
            maximumSpeedKmh:
              state.input.settings
                .maximumSpeedKmh,
          })

        const terrainSample =
          getStageTerrainSample(
            state.input,
            group.distanceKm,
          )

        const terrainMinimumSpeedKmh =
          Math.max(
            1,
            pace.baseSpeedKmh *
              0.35,
          )

        const terrainSpeed =
          calculateTerrainSpeed({
            baseSpeedKmh:
              pace.baseSpeedKmh,
            gradientPercent:
              terrainSample
                .gradientPercent,
            minimumSpeedKmh:
              terrainMinimumSpeedKmh,
            maximumSpeedKmh:
              state.input.settings
                .maximumSpeedKmh,
          })

        const unclampedNextDistanceKm =
          group.distanceKm +
          terrainSpeed.speedKmh *
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
          terrainSpeed,
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
        (
          entryA,
          entryB,
        ) => {
          if (
            entryA.nextDistanceKm !==
            entryB.nextDistanceKm
          ) {
            return (
              entryB.nextDistanceKm -
              entryA.nextDistanceKm
            )
          }

          return entryA.group
            .groupId
            .localeCompare(
              entryB.group
                .groupId,
            )
        },
      )[0]

  if (!leaderEntry) {
    throw new Error(
      'calculateMultiGroupMovement: could not resolve a leader group.',
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
        .terrainSpeed
        .speedKmh,
      0.000001,
    )

  const finishedLeaderIsAhead =
    raceLeaderDistanceKm >
    activeLeaderDistanceKm

  const existingFinishTimes =
    Object.values(
      state.riders,
    )
      .filter(
        (rider) =>
          rider.stageStatus ===
            'finished' &&
          typeof rider
            .finishTimeSeconds ===
            'number',
      )
      .map(
        (rider) =>
          rider
            .finishTimeSeconds as number,
      )

  const winnerFinishTimeSeconds =
    existingFinishTimes.length >
    0
      ? Math.min(
          ...existingFinishTimes,
        )
      : null

  const predictedRaceSecond =
    state.raceSecond +
    tickSeconds

  const elapsedSinceWinnerSeconds =
    finishedLeaderIsAhead &&
    winnerFinishTimeSeconds !==
      null
      ? Math.max(
          0,
          predictedRaceSecond -
          winnerFinishTimeSeconds,
        )
      : 0

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
         * A single common speed converts physical distance differences into
         * physical replay gaps. This guarantees that sorting groups by
         * distance also sorts them by non-decreasing gapFromLeaderSeconds.
         *
         * After the winner has finished, elapsedSinceWinnerSeconds is added
         * equally to all remaining groups. The distance component still uses
         * the foremost active group's speed, not each group's individual speed.
         */
        const remainingPhysicalGapSeconds =
          distanceGapKm ===
          0
            ? 0
            : (
                distanceGapKm /
                commonGapReferenceSpeedKmh
              ) *
              3600

        const gapFromLeaderSeconds =
          remainingPhysicalGapSeconds +
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
                (
                  riderIdA,
                  riderIdB,
                ) =>
                  riderIdA
                    .localeCompare(
                      riderIdB,
                    ),
              ),
          previousDistanceKm:
            entry.group
              .distanceKm,
          nextDistanceKm:
            entry.nextDistanceKm,
          distanceAdvancedKm:
            entry.distanceAdvancedKm,
          elevationMetres:
            entry.terrainSample
              .elevationMetres,
          gradientPercent:
            entry.terrainSample
              .gradientPercent,
          baseSpeedKmh:
            entry.pace
              .baseSpeedKmh,
          terrainMultiplier:
            entry.terrainSpeed
              .terrainMultiplier,
          appliedSpeedKmh:
            entry.terrainSpeed
              .speedKmh,
          gapFromLeaderSeconds,
          active: true,
        }
      },
    )

  return {
    tickSeconds,
    leaderGroupId:
      leaderEntry.group
        .groupId,
    leaderDistanceKm:
      activeLeaderDistanceKm,
    proposals,
  }
}
