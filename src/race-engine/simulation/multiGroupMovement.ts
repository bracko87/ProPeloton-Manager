/**
 * multiGroupMovement.ts
 *
 * Pure deterministic proposal calculation for moving all active race groups
 * during one simulation tick.
 *
 * This utility does not mutate SimulationState, finish riders, create events,
 * or activate any runtime execution.
 */

import type { GroupState } from '../domain/GroupState'
import type { RiderState } from '../domain/RiderState'
import type { SimulationState } from '../domain/SimulationState'
import { calculatePelotonBasePace } from './pelotonPace'
import { getStageTerrainSample } from './stageProfile'
import { calculateTerrainSpeed } from './terrainSpeed'

export interface MultiGroupMovementProposal {
  readonly groupId: string
  readonly groupType: GroupState['groupType']
  readonly riderIds: readonly string[]
  readonly previousDistanceKm: number
  readonly nextDistanceKm: number
  readonly distanceAdvancedKm: number
  readonly elevationMetres: number
  readonly gradientPercent: number
  readonly baseSpeedKmh: number
  readonly terrainMultiplier: number
  readonly appliedSpeedKmh: number
  readonly gapFromLeaderSeconds: number
  readonly active: boolean
}

export interface MultiGroupMovementResult {
  readonly tickSeconds: number
  readonly leaderGroupId: string
  readonly leaderDistanceKm: number
  readonly proposals:
    readonly MultiGroupMovementProposal[]
}

function assertFinitePositive(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value <= 0) {
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
      (riderIdA, riderIdB) =>
        riderIdA.localeCompare(riderIdB),
    )
    .map((riderId) => {
      const rider = state.riders[riderId]

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
    })
    .filter(
      (rider) =>
        rider.stageStatus === 'racing',
    )
}

/**
 * Calculates proposed movement for every active group in stable group-ID order.
 *
 * Every group receives its own fatigue-adjusted rider capability, base pace,
 * terrain adjustment, distance advance, and gap from the proposed leader.
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
    state.input.settings.tickSeconds

  assertFinitePositive(
    tickSeconds,
    'tickSeconds',
  )

  const activeGroups =
    Object.values(state.groups)
      .filter((group) => group.active)
      .slice()
      .sort(
        (groupA, groupB) =>
          groupA.groupId.localeCompare(
            groupB.groupId,
          ),
      )

  if (activeGroups.length === 0) {
    throw new Error(
      'calculateMultiGroupMovement: at least one active group is required.',
    )
  }

  const preliminary =
    activeGroups.map((group) => {
      const riders =
        getRacingGroupRiders(
          state,
          group,
        )

      if (riders.length === 0) {
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

      const terrainSpeed =
        calculateTerrainSpeed({
          baseSpeedKmh:
            pace.baseSpeedKmh,
          gradientPercent:
            terrainSample
              .gradientPercent,
          minimumSpeedKmh:
            state.input.settings
              .minimumSpeedKmh,
          maximumSpeedKmh:
            state.input.settings
              .maximumSpeedKmh,
        })

      const unclampedNextDistanceKm =
        group.distanceKm +
        terrainSpeed.speedKmh *
          (tickSeconds / 3600)

      const nextDistanceKm = Math.min(
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
    })

  const leaderEntry =
    preliminary
      .slice()
      .sort((entryA, entryB) => {
        if (
          entryA.nextDistanceKm !==
          entryB.nextDistanceKm
        ) {
          return (
            entryB.nextDistanceKm -
            entryA.nextDistanceKm
          )
        }

        return entryA.group.groupId.localeCompare(
          entryB.group.groupId,
        )
      })[0]

  if (!leaderEntry) {
    throw new Error(
      'calculateMultiGroupMovement: could not resolve a leader group.',
    )
  }

  const leaderDistanceKm =
    leaderEntry.nextDistanceKm

  const leaderSpeedKmh = Math.max(
    leaderEntry.terrainSpeed.speedKmh,
    0.000001,
  )

  const proposals:
    MultiGroupMovementProposal[] =
    preliminary.map((entry) => {
      const distanceGapKm = Math.max(
        0,
        leaderDistanceKm -
          entry.nextDistanceKm,
      )

      const gapFromLeaderSeconds =
        distanceGapKm === 0
          ? 0
          : (
              distanceGapKm /
              leaderSpeedKmh
            ) * 3600

      return {
        groupId:
          entry.group.groupId,
        groupType:
          entry.group.groupType,
        riderIds:
          entry.group.riderIds
            .slice()
            .sort(
              (riderIdA, riderIdB) =>
                riderIdA.localeCompare(
                  riderIdB,
                ),
            ),
        previousDistanceKm:
          entry.group.distanceKm,
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
          entry.pace.baseSpeedKmh,
        terrainMultiplier:
          entry.terrainSpeed
            .terrainMultiplier,
        appliedSpeedKmh:
          entry.terrainSpeed.speedKmh,
        gapFromLeaderSeconds,
        active: true,
      }
    })

  return {
    tickSeconds,
    leaderGroupId:
      leaderEntry.group.groupId,
    leaderDistanceKm,
    proposals,
  }
}