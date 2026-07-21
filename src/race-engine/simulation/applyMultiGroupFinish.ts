/**
 * applyMultiGroupFinish.ts
 *
 * Immutable deterministic application of previously detected multi-group
 * finish candidates.
 *
 * This utility marks only the supplied candidates as finished, creates their
 * finish events, and deactivates groups that no longer contain racing riders.
 * Unfinished groups and riders remain active. The simulation is completed only
 * when no racing riders remain.
 */

import type { GroupState } from '../domain/GroupState'
import type { RaceEvent } from '../domain/RaceEvent'
import type { RiderState } from '../domain/RiderState'
import type { SimulationState } from '../domain/SimulationState'
import type { StageResult } from '../domain/SimulationOutput'
import type {
  MultiGroupFinishCandidate,
  MultiGroupFinishCandidateResult,
} from './multiGroupFinishCandidates'

export interface ApplyMultiGroupFinishInput {
  readonly state: SimulationState
  readonly detection: MultiGroupFinishCandidateResult
}

export interface ApplyMultiGroupFinishResult {
  readonly state: SimulationState
  readonly newlyFinishedRiderIds: readonly string[]
  readonly newlyFinishedGroupIds: readonly string[]
  readonly newEvents: readonly RaceEvent[]
  readonly newResults: readonly StageResult[]
  readonly completedThisApplication: boolean
}

/**
 * getExistingMaximumFinishPosition
 *
 * Returns the highest numeric finishPosition already present on riders, or 0
 * if no riders have a numeric finishPosition.
 *
 * @param state - current simulation state
 * @returns maximum finish position number found
 */
function getExistingMaximumFinishPosition(
  state: SimulationState,
): number {
  let maximum = 0

  for (const rider of Object.values(state.riders)) {
    if (
      typeof rider.finishPosition === 'number' &&
      rider.finishPosition > maximum
    ) {
      maximum = rider.finishPosition
    }
  }

  return maximum
}

/**
 * getWinnerFinishTimeSeconds
 *
 * Determines the reference winner finish time for gap calculation. If any
 * riders are already finished, use the minimum existing finish time. Otherwise
 * use the raceSecond from the first candidate (caller must supply at least one).
 *
 * @param state - current simulation state
 * @param candidates - ordered finish candidates
 * @returns winner finish time in seconds
 */
function getWinnerFinishTimeSeconds(
  state: SimulationState,
  candidates: readonly MultiGroupFinishCandidate[],
): number {
  const existingFinishTimes =
    Object.values(state.riders)
      .filter(
        (rider) =>
          rider.stageStatus === 'finished' &&
          typeof rider.finishTimeSeconds === 'number',
      )
      .map(
        (rider) =>
          rider.finishTimeSeconds as number,
      )

  if (existingFinishTimes.length > 0) {
    return Math.min(...existingFinishTimes)
  }

  if (candidates.length === 0) {
    throw new Error(
      'applyMultiGroupFinish: cannot resolve winner time without existing finishers or candidates.',
    )
  }

  return candidates[0].raceSecond
}

/**
 * validateCandidate
 *
 * Validate an individual finish candidate against the provided state. Throws
 * if any invariant does not hold.
 *
 * @param state - current simulation state
 * @param candidate - finish candidate to validate
 */
function validateCandidate(
  state: SimulationState,
  candidate: MultiGroupFinishCandidate,
): void {
  const rider =
    state.riders[candidate.riderId]

  if (!rider) {
    throw new Error(
      `applyMultiGroupFinish: missing candidate rider ${candidate.riderId}.`,
    )
  }

  if (rider.stageStatus !== 'racing') {
    throw new Error(
      `applyMultiGroupFinish: candidate rider ${candidate.riderId} is not racing.`,
    )
  }

  if (
    rider.currentGroupId !==
    candidate.groupId
  ) {
    throw new Error(
      `applyMultiGroupFinish: candidate rider ${candidate.riderId} group mismatch.`,
    )
  }

  const group =
    state.groups[candidate.groupId]

  if (!group || !group.active) {
    throw new Error(
      `applyMultiGroupFinish: candidate group ${candidate.groupId} is missing or inactive.`,
    )
  }

  if (
    group.distanceKm <
    state.stageDistanceKm
  ) {
    throw new Error(
      `applyMultiGroupFinish: candidate group ${candidate.groupId} has not reached the finish.`,
    )
  }

  if (
    candidate.raceSecond !==
    state.raceSecond
  ) {
    throw new Error(
      `applyMultiGroupFinish: candidate ${candidate.riderId} race second does not match state.`,
    )
  }
}

/**
 * applyMultiGroupFinish
 *
 * Apply a previously-detected set of multi-group finish candidates. Returns a
 * new state with riders marked finished, groups deactivated if empty of racing
 * riders, appended events, and metadata about the application.
 *
 * @param input - state and detection result
 * @returns application result with updated state and artifacts
 */
export function applyMultiGroupFinish(
  input: ApplyMultiGroupFinishInput,
): ApplyMultiGroupFinishResult {
  const {
    state,
    detection,
  } = input

  if (state.completed) {
    throw new Error(
      'applyMultiGroupFinish: cannot finish riders in a completed simulation.',
    )
  }

  if (
    detection.raceSecond !==
    state.raceSecond
  ) {
    throw new Error(
      'applyMultiGroupFinish: detection race second does not match state.',
    )
  }

  if (
    detection.stageDistanceKm !==
    state.stageDistanceKm
  ) {
    throw new Error(
      'applyMultiGroupFinish: detection stage distance does not match state.',
    )
  }

  if (detection.candidates.length === 0) {
    throw new Error(
      'applyMultiGroupFinish: at least one finish candidate is required.',
    )
  }

  if (
    JSON.stringify(
      detection.candidateRiderIds,
    ) !==
    JSON.stringify(
      detection.candidates.map(
        (candidate) =>
          candidate.riderId,
      ),
    )
  ) {
    throw new Error(
      'applyMultiGroupFinish: candidateRiderIds do not match candidate ordering.',
    )
  }

  const uniqueCandidateIds =
    new Set(
      detection.candidateRiderIds,
    )

  if (
    uniqueCandidateIds.size !==
    detection.candidateRiderIds.length
  ) {
    throw new Error(
      'applyMultiGroupFinish: duplicate finish candidate rider IDs.',
    )
  }

  for (
    const candidate of
    detection.candidates
  ) {
    validateCandidate(
      state,
      candidate,
    )
  }

  const previousMaximumPosition =
    getExistingMaximumFinishPosition(
      state,
    )

  const winnerFinishTimeSeconds =
    getWinnerFinishTimeSeconds(
      state,
      detection.candidates,
    )

  const rankByRiderId =
    new Map<string, number>()

  detection.candidates.forEach(
    (candidate, index) => {
      rankByRiderId.set(
        candidate.riderId,
        previousMaximumPosition +
          index +
          1,
      )
    },
  )

  const nextRidersEntries:
    Array<[string, RiderState]> = []

  for (
    const [riderId, rider] of
    Object.entries(state.riders)
  ) {
    const rank =
      rankByRiderId.get(riderId)

    if (rank === undefined) {
      nextRidersEntries.push([
        riderId,
        rider,
      ])
      continue
    }

    nextRidersEntries.push([
      riderId,
      {
        ...rider,
        stageStatus: 'finished',
        finished: true,
        finishPosition: rank,
        finishTimeSeconds:
          state.raceSecond,
        distanceKm:
          state.stageDistanceKm,
        speedKmh: 0,
      },
    ])
  }

  const nextRiders =
    Object.fromEntries(
      nextRidersEntries,
    )

  const newlyFinishedGroupIds:
    string[] = []

  const nextGroupsEntries:
    Array<[string, GroupState]> = []

  for (
    const [groupId, group] of
    Object.entries(state.groups)
  ) {
    const hasRacingRider =
      group.riderIds.some(
        (riderId) =>
          nextRiders[riderId]
            ?.stageStatus ===
          'racing',
      )

    if (
      group.active &&
      !hasRacingRider
    ) {
      newlyFinishedGroupIds.push(
        groupId,
      )

      nextGroupsEntries.push([
        groupId,
        {
          ...group,
          distanceKm:
            Math.min(
              group.distanceKm,
              state.stageDistanceKm,
            ),
          speedKmh: 0,
          active: false,
        },
      ])
      continue
    }

    nextGroupsEntries.push([
      groupId,
      group,
    ])
  }

  newlyFinishedGroupIds.sort(
    (groupIdA, groupIdB) =>
      groupIdA.localeCompare(
        groupIdB,
      ),
  )

  const newEvents:
    RaceEvent[] = []

  const newResults:
    StageResult[] = []

  let nextSequenceNumber =
    state.nextEventSequenceNumber

  for (
    const candidate of
    detection.candidates
  ) {
    const rank =
      rankByRiderId.get(
        candidate.riderId,
      )

    if (rank === undefined) {
      throw new Error(
        `applyMultiGroupFinish: missing rank for ${candidate.riderId}.`,
      )
    }

    const gapSeconds =
      state.raceSecond -
      winnerFinishTimeSeconds

    newResults.push({
      rank,
      riderId:
        candidate.riderId,
      teamId:
        candidate.teamId,
      status: 'finished',
      elapsedSeconds:
        state.raceSecond,
      gapSeconds,
    })

    newEvents.push({
      sequenceNumber:
        nextSequenceNumber,
      eventType:
        'RIDER_FINISHED',
      raceSecond:
        state.raceSecond,
      kmMarker:
        state.stageDistanceKm,
      actorRiderId:
        candidate.riderId,
      teamId:
        candidate.teamId,
      sourceGroupId:
        candidate.groupId,
      targetGroupId: null,
      relatedRiderIds: [
        candidate.riderId,
      ],
      payload: {
        rank,
        elapsedSeconds:
          state.raceSecond,
        gapSeconds,
        temporaryFinishRule:
          'multi_group_finish_candidates_v1',
      },
      commentaryText: null,
    })

    nextSequenceNumber += 1
  }

  const racingRiderCount =
    Object.values(nextRiders)
      .filter(
        (rider) =>
          rider.stageStatus ===
          'racing',
      )
      .length

  const completedThisApplication =
    racingRiderCount === 0

  if (completedThisApplication) {
    newEvents.push({
      sequenceNumber:
        nextSequenceNumber,
      eventType:
        'SIMULATION_COMPLETED',
      raceSecond:
        state.raceSecond,
      kmMarker:
        state.stageDistanceKm,
      actorRiderId: null,
      teamId: null,
      sourceGroupId: null,
      targetGroupId: null,
      relatedRiderIds:
        detection
          .candidateRiderIds
          .slice(),
      payload: {
        newlyFinishedRiderCount:
          detection.candidates
            .length,
        totalFinishedRiderCount:
          Object.values(
            nextRiders,
          ).filter(
            (rider) =>
              rider.stageStatus ===
              'finished',
          ).length,
        temporaryFinishRule:
          'multi_group_finish_candidates_v1',
      },
      commentaryText: null,
    })

    nextSequenceNumber += 1
  }

  const nextEvents = [
    ...state.events,
    ...newEvents,
  ]

  return {
    state: {
      ...state,
      riders:
        nextRiders,
      groups:
        Object.fromEntries(
          nextGroupsEntries,
        ),
      events: nextEvents,
      nextEventSequenceNumber:
        nextSequenceNumber,
      completed: completedThisApplication,
    },
    newlyFinishedRiderIds:
      detection.candidateRiderIds.slice(),
    newlyFinishedGroupIds:
      newlyFinishedGroupIds.slice(),
    newEvents,
    newResults,
    completedThisApplication,
  }
}