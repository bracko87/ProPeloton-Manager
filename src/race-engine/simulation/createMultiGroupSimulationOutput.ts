/**
 * createMultiGroupSimulationOutput.ts
 *
 * Pure adapter from the isolated full-stage multi-group runner result to the
 * authoritative SimulationOutput domain contract.
 */

import type {
  ReplaySnapshot as OutputReplaySnapshot,
  SimulationOutput,
} from '../domain/SimulationOutput'
import type { GroupState } from '../domain/GroupState'
import type { RiderState } from '../domain/RiderState'
import type { RunMultiGroupStageResult } from './runMultiGroupStage'

/**
 * compareGroups
 *
 * Compare two GroupState entries for ordering in replay snapshots.
 * Orders primarily by distance (descending), then gapFromLeaderSeconds
 * (ascending), and finally by groupId.
 */
function compareGroups(
  groupA: GroupState,
  groupB: GroupState,
): number {
  if (groupA.distanceKm !== groupB.distanceKm) {
    return groupB.distanceKm - groupA.distanceKm
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

  return groupA.groupId.localeCompare(
    groupB.groupId,
  )
}

/**
 * compareFinalRiders
 *
 * Compare two RiderState entries for final ordering in the output.
 * Orders by finishPosition when present, otherwise falls back to riderId.
 */
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

  if (positionA !== positionB) {
    return positionA - positionB
  }

  return riderA.riderId.localeCompare(
    riderB.riderId,
  )
}

/**
 * createOutputReplaySnapshot
 *
 * Build an output-facing replay snapshot object from the stage runner's
 * internal ReplaySnapshot at the provided index.
 *
 * Throws if the requested snapshot index is missing.
 */
function createOutputReplaySnapshot(
  stage: RunMultiGroupStageResult,
  snapshotIndex: number,
): OutputReplaySnapshot {
  const snapshot =
    stage.replaySnapshots[snapshotIndex]

  if (!snapshot) {
    throw new Error(
      `createMultiGroupSimulationOutput: missing replay snapshot at index ${snapshotIndex}.`,
    )
  }

  const orderedGroups =
    Object.values(snapshot.groups)
      .slice()
      .sort(compareGroups)

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
        (sequenceA, sequenceB) =>
          sequenceA - sequenceB,
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

/**
 * createMultiGroupSimulationOutput
 *
 * Convert a completed RunMultiGroupStageResult into the canonical
 * SimulationOutput contract. Validates completion and identifier stability.
 */
export function createMultiGroupSimulationOutput(
  stage: RunMultiGroupStageResult,
): SimulationOutput {
  if (
    stage.completed !== true ||
    stage.finalState.completed !== true
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

  const snapshots =
    stage.replaySnapshots.map(
      (_snapshot, snapshotIndex) =>
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
      .sort(compareFinalRiders)

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