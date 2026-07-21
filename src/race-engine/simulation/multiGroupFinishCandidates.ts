/**
 * multiGroupFinishCandidates.ts
 *
 * Pure deterministic detection of riders whose current group has reached the
 * stage finish.
 *
 * This utility does not mutate SimulationState, mark riders as finished,
 * create events, create final results, or complete the race.
 */

import type { GroupState } from '../domain/GroupState'
import type { RiderState } from '../domain/RiderState'
import type { SimulationState } from '../domain/SimulationState'

export interface MultiGroupFinishCandidate {
  readonly riderId: string
  readonly riderName: string
  readonly teamId: string
  readonly teamName: string
  readonly groupId: string
  readonly groupType: GroupState['groupType']
  readonly groupDistanceKm: number
  readonly groupGapFromLeaderSeconds: number
  readonly raceSecond: number
  readonly sprintScore: number
  readonly accelerationScore: number
  readonly energy: number
}

export interface MultiGroupFinishCandidateResult {
  readonly stageDistanceKm: number
  readonly raceSecond: number
  readonly finishedGroupIds: readonly string[]
  readonly candidateRiderIds: readonly string[]
  readonly candidates: readonly MultiGroupFinishCandidate[]
}

/**
 * compareCandidates
 *
 * Ordering used to determine finish candidate precedence:
 * - farther group distance wins
 * - smaller gap from leader wins
 * - stable groupId tiebreak
 * - higher sprint, then acceleration, then energy
 * - finally rider id lexical order
 *
 * @param candidateA - left candidate
 * @param candidateB - right candidate
 * @returns sort order number
 */
function compareCandidates(
  candidateA: MultiGroupFinishCandidate,
  candidateB: MultiGroupFinishCandidate,
): number {
  if (
    candidateA.groupDistanceKm !==
    candidateB.groupDistanceKm
  ) {
    return (
      candidateB.groupDistanceKm -
      candidateA.groupDistanceKm
    )
  }

  if (
    candidateA.groupGapFromLeaderSeconds !==
    candidateB.groupGapFromLeaderSeconds
  ) {
    return (
      candidateA.groupGapFromLeaderSeconds -
      candidateB.groupGapFromLeaderSeconds
    )
  }

  if (
    candidateA.groupId !==
    candidateB.groupId
  ) {
    return candidateA.groupId.localeCompare(
      candidateB.groupId,
    )
  }

  if (
    candidateA.sprintScore !==
    candidateB.sprintScore
  ) {
    return (
      candidateB.sprintScore -
      candidateA.sprintScore
    )
  }

  if (
    candidateA.accelerationScore !==
    candidateB.accelerationScore
  ) {
    return (
      candidateB.accelerationScore -
      candidateA.accelerationScore
    )
  }

  if (
    candidateA.energy !==
    candidateB.energy
  ) {
    return (
      candidateB.energy -
      candidateA.energy
    )
  }

  return candidateA.riderId.localeCompare(
    candidateB.riderId,
  )
}

/**
 * getRacingRider
 *
 * Retrieve a rider by id and validate that they are racing and belong to the
 * provided group. Returns null for non-racing riders.
 *
 * @param state - simulation state
 * @param group - group containing the rider
 * @param riderId - rider id to lookup
 * @returns RiderState or null
 */
function getRacingRider(
  state: SimulationState,
  group: GroupState,
  riderId: string,
): RiderState | null {
  const rider = state.riders[riderId]

  if (!rider) {
    throw new Error(
      `detectMultiGroupFinishCandidates: group ${group.groupId} references missing rider ${riderId}.`,
    )
  }

  if (
    rider.currentGroupId !==
    group.groupId
  ) {
    throw new Error(
      `detectMultiGroupFinishCandidates: rider ${riderId} membership does not match group ${group.groupId}.`,
    )
  }

  if (
    rider.stageStatus !== 'racing'
  ) {
    return null
  }

  return rider
}

/**
 * Detects currently racing riders whose active group reached the finish line.
 */
export function detectMultiGroupFinishCandidates(
  state: SimulationState,
): MultiGroupFinishCandidateResult {
  if (
    !Number.isFinite(
      state.stageDistanceKm,
    ) ||
    state.stageDistanceKm <= 0
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: stage distance must be finite and greater than 0.',
    )
  }

  if (
    !Number.isFinite(
      state.raceSecond,
    ) ||
    state.raceSecond < 0
  ) {
    throw new Error(
      'detectMultiGroupFinishCandidates: raceSecond must be finite and non-negative.',
    )
  }

  const finishedGroups =
    Object.values(state.groups)
      .filter(
        (group) =>
          group.active &&
          group.distanceKm >=
            state.stageDistanceKm,
      )
      .slice()
      .sort(
        (groupA, groupB) =>
          groupA.groupId.localeCompare(
            groupB.groupId,
          ),
      )

  const candidates:
    MultiGroupFinishCandidate[] =
    []

  for (
    const group of finishedGroups
  ) {
    const riderIds =
      group.riderIds
        .slice()
        .sort(
          (riderIdA, riderIdB) =>
            riderIdA.localeCompare(
              riderIdB,
            ),
        )

    for (
      const riderId of riderIds
    ) {
      const rider =
        getRacingRider(
          state,
          group,
          riderId,
        )

      if (!rider) {
        continue
      }

      candidates.push({
        riderId:
          rider.riderId,
        riderName:
          rider.riderName,
        teamId:
          rider.teamId,
        teamName:
          rider.teamName,
        groupId:
          group.groupId,
        groupType:
          group.groupType,
        groupDistanceKm:
          group.distanceKm,
        groupGapFromLeaderSeconds:
          group.gapFromLeaderSeconds,
        raceSecond:
          state.raceSecond,
        sprintScore:
          rider.attributes.sprint,
        accelerationScore:
          rider.attributes
            .acceleration,
        energy:
          rider.energy,
      })
    }
  }

  candidates.sort(compareCandidates)

  return {
    stageDistanceKm:
      state.stageDistanceKm,
    raceSecond:
      state.raceSecond,
    finishedGroupIds:
      finishedGroups.map(
        (group) => group.groupId,
      ),
    candidateRiderIds:
      candidates.map(
        (candidate) =>
          candidate.riderId,
      ),
    candidates,
  }
}