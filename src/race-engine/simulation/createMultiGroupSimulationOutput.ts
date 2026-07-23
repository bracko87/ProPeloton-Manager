/**
 * createMultiGroupSimulationOutput.ts
 *
 * Pure adapter from a completed multi-group stage source to the authoritative
 * SimulationOutput domain contract.
 *
 * The accepted source is intentionally structural so both:
 * - the existing runMultiGroupStage result; and
 * - the calibrated terrain-separation stage result
 *
 * can use the same output mapping without casts or duplicated replay logic.
 */

import type {
  ReplaySnapshot as OutputReplaySnapshot,
  SimulationOutput,
} from '../domain/SimulationOutput'
import type {
  GroupState,
} from '../domain/GroupState'
import type {
  RaceEvent,
} from '../domain/RaceEvent'
import type {
  RiderState,
} from '../domain/RiderState'
import type {
  SimulationState,
} from '../domain/SimulationState'
import type {
  ReplaySnapshot,
} from './replaySnapshots'

export interface MultiGroupSimulationOutputSource {
  readonly initialState:
    SimulationState
  readonly finalState:
    SimulationState
  readonly completed: boolean
  readonly events:
    readonly RaceEvent[]
  readonly replaySnapshots:
    readonly ReplaySnapshot[]
}

function compareGroups(
  groupA: GroupState,
  groupB: GroupState,
): number {
  if (
    groupA.distanceKm !==
    groupB.distanceKm
  ) {
    return (
      groupB.distanceKm -
      groupA.distanceKm
    )
  }

  if (
    groupA.gapFromLeaderSeconds !==
    groupB.gapFromLeaderSeconds
  ) {
    return (
      groupA.gapFromLeaderSeconds -
      groupB.gapFromLeaderSeconds
    )
  }

  return groupA.groupId
    .localeCompare(
      groupB.groupId,
    )
}

function compareFinalRiders(
  riderA: RiderState,
  riderB: RiderState,
): number {
  const positionA =
    riderA.finishPosition ??
    Number.POSITIVE_INFINITY

  const positionB =
    riderB.finishPosition ??
    Number.POSITIVE_INFINITY

  if (
    positionA !==
    positionB
  ) {
    return (
      positionA -
      positionB
    )
  }

  return riderA.riderId
    .localeCompare(
      riderB.riderId,
    )
}

function createOutputReplaySnapshot(
  stage:
    MultiGroupSimulationOutputSource,
  snapshotIndex: number,
): OutputReplaySnapshot {
  const snapshot =
    stage.replaySnapshots[
      snapshotIndex
    ]

  if (!snapshot) {
    throw new Error(
      `createMultiGroupSimulationOutput: missing replay snapshot at index ${snapshotIndex}.`,
    )
  }

  const orderedGroups =
    Object.values(
      snapshot.groups,
    )
      .slice()
      .sort(
        compareGroups,
      )

  const eventSequenceNumbers =
    stage.events
      .filter(
        (event) =>
          event.raceSecond <=
          snapshot.raceSecond,
      )
      .map(
        (event) =>
          event.sequenceNumber,
      )
      .sort(
        (
          sequenceA,
          sequenceB,
        ) =>
          sequenceA -
          sequenceB,
      )

  return {
    frameNumber:
      snapshot.sequenceNumber,
    raceSecond:
      snapshot.raceSecond,
    km:
      snapshot.currentKm,
    groupOrder:
      orderedGroups.map(
        (group) =>
          group.groupId,
      ),
    groups:
      orderedGroups,
    eventSequenceNumbers,
  }
}

export function createMultiGroupSimulationOutput(
  stage:
    MultiGroupSimulationOutputSource,
): SimulationOutput {
  if (
    stage.completed !== true ||
    stage.finalState.completed !==
      true
  ) {
    throw new Error(
      'createMultiGroupSimulationOutput: the full-stage run must be completed.',
    )
  }

  if (
    stage.finalState.raceId !==
      stage.initialState.raceId ||
    stage.finalState.stageId !==
      stage.initialState.stageId ||
    stage.finalState.seed !==
      stage.initialState.seed
  ) {
    throw new Error(
      'createMultiGroupSimulationOutput: stage identifiers changed during execution.',
    )
  }

  if (
    stage.events !==
    stage.finalState.events &&
    JSON.stringify(
      stage.events,
    ) !==
    JSON.stringify(
      stage.finalState.events,
    )
  ) {
    throw new Error(
      'createMultiGroupSimulationOutput: stage events do not match finalState.events.',
    )
  }

  const snapshots =
    stage.replaySnapshots.map(
      (
        _snapshot,
        snapshotIndex,
      ) =>
        createOutputReplaySnapshot(
          stage,
          snapshotIndex,
        ),
    )

  const finalRiderStates =
    Object.values(
      stage.finalState.riders,
    )
      .slice()
      .sort(
        compareFinalRiders,
      )

  return {
    raceId:
      stage.finalState.raceId,
    stageId:
      stage.finalState.stageId,
    engineVersion:
      'race_engine_ts_v1',
    simulationMode:
      'deterministic_road_race_v1',
    seed:
      stage.finalState.seed,
    events:
      stage.events.slice(),
    snapshots,
    finalRiderStates,
  }
}
