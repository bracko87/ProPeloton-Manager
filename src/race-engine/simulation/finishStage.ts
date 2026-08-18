/**
 * finishStage.ts
 *
 * Deterministic basic stage-finish logic for the Phase 2 single-peloton simulation.
 *
 * Responsibilities:
 * - Validate the incoming SimulationState.
 * - Ensure peloton_main is the sole racing group and is active at finish.
 * - Rank all racing riders deterministically using core attributes.
 * - Mark those riders finished, deactivate peloton_main, and emit finish events.
 * - Build a StageResult list including terminal non-finishers appended after finishers.
 */

import type { SimulationState } from '../domain/SimulationState'
import type { RiderState } from '../domain/RiderState'
import type { GroupState } from '../domain/GroupState'
import type { RaceEvent } from '../domain/RaceEvent'
import type { StageResult } from '../domain/SimulationOutput'
import { validateSimulationState } from '../validation/validateSimulationState'
import { INITIAL_PELOTON_GROUP_ID } from './createInitialState'

/**
 * terminalStageStatuses
 * Set of terminal rider stage statuses.
 */
const terminalStageStatuses: ReadonlySet<string> = new Set([
  'finished',
  'dnf',
  'dns',
  'otl',
])

/**
 * FinishStageResult
 * Result of completing the basic peloton stage:
 * - state: fully-updated, validated SimulationState.
 * - results: final StageResult list in deterministic order.
 */
export interface FinishStageResult {
  readonly state: SimulationState
  readonly results: readonly StageResult[]
}

/**
 * finishBasicPelotonStage
 * Completes a basic single-peloton stage:
 * - Validates input state.
 * - Requires the stage distance to be reached and peloton_main to be active.
 * - Ranks all racing riders deterministically.
 * - Marks those riders finished, deactivates peloton_main, emits finish events.
 * - Returns the completed SimulationState together with StageResult[].
 */
export function finishBasicPelotonStage(
  state: SimulationState,
): FinishStageResult {
  // 1. Validate the incoming state before any mutation-like work.
  validateSimulationState(state)

  const previousRaceSecond = state.raceSecond
  const previousCurrentKm = state.currentKm
  const previousEventCount = state.events.length
  const previousSimulationCompletedEvents = state.events.filter(
    (event) => event.eventType === 'SIMULATION_COMPLETED',
  ).length

  // 2. Reject invalid preconditions for finishing.
  if (state.completed) {
    throw new Error(
      'finishBasicPelotonStage: simulation is already completed.',
    )
  }

  if (state.currentKm < state.stageDistanceKm) {
    throw new Error(
      'finishBasicPelotonStage: cannot finish stage before reaching stageDistanceKm.',
    )
  }

  const peloton = state.groups[INITIAL_PELOTON_GROUP_ID]

  if (!peloton) {
    throw new Error(
      'finishBasicPelotonStage: peloton_main group is missing from state.groups.',
    )
  }

  if (!peloton.active) {
    throw new Error(
      'finishBasicPelotonStage: peloton_main group must be active when finishing the stage.',
    )
  }

  if (peloton.groupType !== 'peloton') {
    throw new Error(
      'finishBasicPelotonStage: peloton_main group must have groupType "peloton".',
    )
  }

  // 3. Determine finishing riders: only stageStatus = racing and all must be in peloton_main.
  const pelotonRiderSet = new Set(peloton.riderIds)
  const allRidersArray: readonly RiderState[] = Object.values(state.riders)

  const racingRiders: RiderState[] = []
  const nonFinishedTerminalRiders: RiderState[] = []

  for (const rider of allRidersArray) {
    if (rider.stageStatus === 'racing') {
      if (rider.currentGroupId !== INITIAL_PELOTON_GROUP_ID) {
        throw new Error(
          `finishBasicPelotonStage: racing rider ${rider.riderId} is not in peloton_main (currentGroupId mismatch).`,
        )
      }
      if (!pelotonRiderSet.has(rider.riderId)) {
        throw new Error(
          `finishBasicPelotonStage: racing rider ${rider.riderId} is not listed in peloton_main.riderIds.`,
        )
      }
      racingRiders.push(rider)
    } else if (terminalStageStatuses.has(rider.stageStatus)) {
      // Track existing terminal riders except already-finished ones;
      // they will be appended to results after the new finishers.
      if (rider.stageStatus !== 'finished') {
        nonFinishedTerminalRiders.push(rider)
      }
    }
  }

  // FIX: Reject finishing when there are zero racing riders.
  if (racingRiders.length === 0) {
    throw new Error(
      'finishBasicPelotonStage: at least one racing rider is required to finish the stage.',
    )
  }

  // 4. Deterministic ranking for racing riders using attributes.
  const finishingRiders: RiderState[] = [...racingRiders].sort((a, b) => {
    if (b.attributes.sprint !== a.attributes.sprint) {
      return b.attributes.sprint - a.attributes.sprint
    }
    if (b.attributes.acceleration !== a.attributes.acceleration) {
      return b.attributes.acceleration - a.attributes.acceleration
    }
    if (b.attributes.stamina !== a.attributes.stamina) {
      return b.attributes.stamina - a.attributes.stamina
    }
    if (b.attributes.resistance !== a.attributes.resistance) {
      return b.attributes.resistance - a.attributes.resistance
    }
    return a.riderId.localeCompare(b.riderId)
  })

  const rankingByRiderId = new Map<string, number>()
  finishingRiders.forEach((rider, index) => {
    rankingByRiderId.set(rider.riderId, index + 1)
  })

  const finishTimeSeconds = state.raceSecond

  // 5. Update riders immutably: mark all racing riders as finished.
  const nextRidersEntries: Array<[string, RiderState]> = []

  for (const [riderId, rider] of Object.entries(state.riders)) {
    if (rider.stageStatus === 'racing') {
      const rank = rankingByRiderId.get(riderId)
      if (typeof rank !== 'number' || rank <= 0) {
        throw new Error(
          `finishBasicPelotonStage: missing or invalid finish rank for racing rider ${riderId}.`,
        )
      }

      const updatedRider: RiderState = {
        ...rider,
        stageStatus: 'finished',
        finished: true,
        finishPosition: rank,
        finishTimeSeconds,
        distanceKm: state.stageDistanceKm,
        speedKmh: 0,
      }

      nextRidersEntries.push([riderId, updatedRider])
    } else {
      // Preserve non-racing riders exactly as they are.
      nextRidersEntries.push([riderId, rider])
    }
  }

  const nextRiders: Readonly<Record<string, RiderState>> =
    Object.fromEntries(nextRidersEntries)

  // 6. Update peloton_main group immutably and keep other groups unchanged.
  const updatedPeloton: GroupState = {
    ...peloton,
    distanceKm: state.stageDistanceKm,
    speedKmh: 0,
    gapFromLeaderSeconds: 0,
    active: false,
  }

  const nextGroups: Readonly<Record<string, GroupState>> = {
    ...state.groups,
    [INITIAL_PELOTON_GROUP_ID]: updatedPeloton,
  }

  // 7. Build StageResult list in deterministic order.
  const results: StageResult[] = []
  let resultRank = 1

  // First, all newly finished (racing) riders in finish order.
  for (const rider of finishingRiders) {
    const stageResult: StageResult = {
      rank: resultRank,
      riderId: rider.riderId,
      teamId: rider.teamId,
      status: 'finished',
      elapsedSeconds: finishTimeSeconds,
      gapSeconds: 0,
    }
    results.push(stageResult)
    resultRank += 1
  }

  // Then, existing terminal non-finishers in riderId ascending order.
  const terminalRidersSorted: RiderState[] = [...nonFinishedTerminalRiders].sort(
    (a, b) => a.riderId.localeCompare(b.riderId),
  )

  for (const rider of terminalRidersSorted) {
    const stageResult: StageResult = {
      rank: resultRank,
      riderId: rider.riderId,
      teamId: rider.teamId,
      status: rider.stageStatus as 'dnf' | 'dns' | 'otl',
      elapsedSeconds: null,
      gapSeconds: null,
    }
    results.push(stageResult)
    resultRank += 1
  }

  const finishedRiderIds: readonly string[] = finishingRiders.map(
    (rider) => rider.riderId,
  )

  // 8. Create finish events (RIDER_FINISHED + SIMULATION_COMPLETED).
  const newEvents: RaceEvent[] = []
  let nextSequenceNumber = state.nextEventSequenceNumber

  for (const rider of finishingRiders) {
    const rank = rankingByRiderId.get(rider.riderId)!

    const finishEvent: RaceEvent = {
      sequenceNumber: nextSequenceNumber,
      eventType: 'RIDER_FINISHED',
      raceSecond: finishTimeSeconds,
      kmMarker: state.stageDistanceKm,
      actorRiderId: rider.riderId,
      teamId: rider.teamId,
      sourceGroupId: INITIAL_PELOTON_GROUP_ID,
      targetGroupId: null,
      relatedRiderIds: [rider.riderId],
      payload: {
        rank,
        elapsedSeconds: finishTimeSeconds,
        gapSeconds: 0,
        temporaryFinishRule: 'basic_attribute_tiebreak_v1',
      },
      commentaryText: null,
    }

    newEvents.push(finishEvent)
    nextSequenceNumber += 1
  }

  const simulationCompletedEvent: RaceEvent = {
    sequenceNumber: nextSequenceNumber,
    eventType: 'SIMULATION_COMPLETED',
    raceSecond: finishTimeSeconds,
    kmMarker: state.stageDistanceKm,
    actorRiderId: null,
    teamId: null,
    sourceGroupId: INITIAL_PELOTON_GROUP_ID,
    targetGroupId: null,
    relatedRiderIds: finishedRiderIds,
    payload: {
      finishedRiderCount: finishingRiders.length,
      resultCount: results.length,
      temporaryFinishRule: 'basic_attribute_tiebreak_v1',
    },
    commentaryText: null,
  }

  newEvents.push(simulationCompletedEvent)

  const nextEvents: readonly RaceEvent[] = [
    ...state.events,
    ...newEvents,
  ]

  // 9. Assemble next completed SimulationState.
  const nextState: SimulationState = {
    ...state,
    currentKm: state.stageDistanceKm,
    riders: nextRiders,
    groups: nextGroups,
    events: nextEvents,
    nextEventSequenceNumber: nextEvents.length + 1,
    completed: true,
  }

  // 10. Validate the new state structurally and logically.
  validateSimulationState(nextState)

  // 11. Additional finish-specific invariants.

  // raceSecond must not change during finish.
  if (nextState.raceSecond !== previousRaceSecond) {
    throw new Error(
      'finishBasicPelotonStage invariant: raceSecond changed during finishing.',
    )
  }

  // currentKm must equal stageDistanceKm in the completed state.
  if (nextState.currentKm !== nextState.stageDistanceKm) {
    throw new Error(
      'finishBasicPelotonStage invariant: currentKm does not equal stageDistanceKm after completion.',
    )
  }

  // completed flag must be true.
  if (!nextState.completed) {
    throw new Error(
      'finishBasicPelotonStage invariant: completed flag is not true after finishing.',
    )
  }

  // All previously racing riders must now be finished.
  for (const rider of finishingRiders) {
    const updatedRider = nextState.riders[rider.riderId]
    if (!updatedRider) {
      throw new Error(
        `finishBasicPelotonStage invariant: finished rider ${rider.riderId} is missing from nextState.riders.`,
      )
    }
    if (updatedRider.stageStatus !== 'finished' || !updatedRider.finished) {
      throw new Error(
        `finishBasicPelotonStage invariant: finished rider ${rider.riderId} does not have finished status in next state.`,
      )
    }
  }

  // Every newly finished rider must have exactly one contiguous finish position.
  const finishPositions = new Set<number>()
  for (const rider of finishingRiders) {
    const updatedRider = nextState.riders[rider.riderId]
    const position = updatedRider.finishPosition
    if (typeof position !== 'number' || position <= 0) {
      throw new Error(
        `finishBasicPelotonStage invariant: invalid finishPosition for rider ${rider.riderId}.`,
      )
    }
    finishPositions.add(position)
    if (updatedRider.finishTimeSeconds !== finishTimeSeconds) {
      throw new Error(
        `finishBasicPelotonStage invariant: inconsistent finishTimeSeconds for rider ${rider.riderId}.`,
      )
    }
  }

  if (finishPositions.size !== finishingRiders.length) {
    throw new Error(
      'finishBasicPelotonStage invariant: duplicate or missing finish positions among newly finished riders.',
    )
  }

  const maxFinishPosition = Math.max(...finishPositions)
  if (maxFinishPosition !== finishingRiders.length) {
    throw new Error(
      'finishBasicPelotonStage invariant: finish positions are not contiguous starting at 1.',
    )
  }

  // Result order must match finish-position order for newly finished riders.
  for (let index = 0; index < finishingRiders.length; index += 1) {
    const rider = finishingRiders[index]
    const result = results[index]
    if (!result || result.riderId !== rider.riderId) {
      throw new Error(
        'finishBasicPelotonStage invariant: StageResult order does not match finish-position order.',
      )
    }
    if (result.rank !== index + 1) {
      throw new Error(
        'finishBasicPelotonStage invariant: StageResult rank does not match expected contiguous ordering.',
      )
    }
  }

  // Event sequence numbers must remain contiguous starting from 1.
  for (let index = 0; index < nextState.events.length; index += 1) {
    const expected = index + 1
    const actual = nextState.events[index].sequenceNumber
    if (actual !== expected) {
      throw new Error(
        `finishBasicPelotonStage invariant: event sequence numbers are not contiguous (expected ${expected}, got ${actual}).`,
      )
    }
  }

  // Exactly one new SIMULATION_COMPLETED event must have been added.
  const totalSimulationCompletedEvents = nextState.events.filter(
    (event) => event.eventType === 'SIMULATION_COMPLETED',
  ).length

  if (totalSimulationCompletedEvents !== previousSimulationCompletedEvents + 1) {
    throw new Error(
      'finishBasicPelotonStage invariant: exactly one SIMULATION_COMPLETED event must be added.',
    )
  }

  // No team or order records may change.
  if (nextState.teams !== state.teams) {
    throw new Error(
      'finishBasicPelotonStage invariant: teams reference changed, which is not allowed in finish logic.',
    )
  }

  if (nextState.orders !== state.orders) {
    throw new Error(
      'finishBasicPelotonStage invariant: orders reference changed, which is not allowed in finish logic.',
    )
  }

  // No new group IDs may be created; peloton_main must be inactive.
  const previousGroupIds = Object.keys(state.groups).sort()
  const nextGroupIds = Object.keys(nextState.groups).sort()

  if (previousGroupIds.length !== nextGroupIds.length) {
    throw new Error(
      'finishBasicPelotonStage invariant: group count changed during finish.',
    )
  }

  for (let i = 0; i < previousGroupIds.length; i += 1) {
    if (previousGroupIds[i] !== nextGroupIds[i]) {
      throw new Error(
        'finishBasicPelotonStage invariant: group identifiers changed during finish.',
      )
    }
  }

  const pelotonAfter = nextState.groups[INITIAL_PELOTON_GROUP_ID]
  if (!pelotonAfter) {
    throw new Error(
      'finishBasicPelotonStage invariant: peloton_main group is missing after finish.',
    )
  }
  if (pelotonAfter.active) {
    throw new Error(
      'finishBasicPelotonStage invariant: peloton_main must be inactive after finish.',
    )
  }

  // Input state object must not be reused as the next state.
  if (nextState === state) {
    throw new Error(
      'finishBasicPelotonStage invariant: nextState must be a new object distinct from input state.',
    )
  }

  // Basic monotonic kilometre invariant at finish.
  if (previousCurrentKm > nextState.currentKm) {
    throw new Error(
      'finishBasicPelotonStage invariant: currentKm moved backward during finish.',
    )
  }

  // Event count must increase by at least one (finish events).
  if (nextState.events.length <= previousEventCount) {
    throw new Error(
      'finishBasicPelotonStage invariant: no new events were added during finish.',
    )
  }

  return {
    state: nextState,
    results,
  }
}
