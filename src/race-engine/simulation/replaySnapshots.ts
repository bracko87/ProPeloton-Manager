/**
 * replaySnapshots.ts
 *
 * Utilities for creating replay snapshots of simulation state and determining
 * when snapshots should be captured. Designed to be dependency-free and
 * portable between environments.
 */

import type { SimulationState } from '../domain/SimulationState'
import {
  createCanonicalHashedValue,
  type CanonicalHashedValue,
} from './canonicalSerialization'

/**
 * ReplaySnapshot
 *
 * A compact snapshot of the simulation suitable for deterministic replay
 * comparisons. Includes both the canonical JSON representation and the
 * deterministic FNV-1a hash of that canonical JSON.
 */
export interface ReplaySnapshot {
  readonly sequenceNumber: number
  readonly raceSecond: number
  readonly currentKm: number
  readonly completed: boolean
  readonly riderCount: number
  readonly groupCount: number
  readonly activeGroupCount: number
  readonly eventCount: number
  readonly riders: SimulationState['riders']
  readonly groups: SimulationState['groups']
  readonly canonicalJson: string
  readonly deterministicHash: string
}

/**
 * CreateReplaySnapshotInput
 *
 * Input parameters required to produce a ReplaySnapshot.
 */
export interface CreateReplaySnapshotInput {
  readonly state: SimulationState
  readonly sequenceNumber: number
}

/**
 * ReplaySnapshotPayload
 *
 * Internal payload that is canonicalized and hashed. Mirrors the public
 * ReplaySnapshot shape minus the canonicalJson/hash fields.
 */
interface ReplaySnapshotPayload {
  readonly sequenceNumber: number
  readonly raceSecond: number
  readonly currentKm: number
  readonly completed: boolean
  readonly riderCount: number
  readonly groupCount: number
  readonly activeGroupCount: number
  readonly eventCount: number
  readonly riders: SimulationState['riders']
  readonly groups: SimulationState['groups']
}

/**
 * createReplaySnapshot
 *
 * Create a ReplaySnapshot for the provided simulation state.
 *
 * Validation:
 * - sequenceNumber must be a positive integer.
 *
 * The function builds a plain payload, creates a canonical JSON string and a
 * deterministic hash using createCanonicalHashedValue, and returns the full
 * ReplaySnapshot.
 */
export function createReplaySnapshot(
  input: CreateReplaySnapshotInput,
): ReplaySnapshot {
  const { state, sequenceNumber } = input

  if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
    throw new RangeError('sequenceNumber must be a positive integer')
  }

  const riderCount = Object.keys(state.riders).length
  const groupCount = Object.keys(state.groups).length
  const activeGroupCount = Object.values(state.groups).filter(
    (group) => group.active,
  ).length
  const eventCount = state.events.length

  const payload: ReplaySnapshotPayload = {
    sequenceNumber,
    raceSecond: state.raceSecond,
    currentKm: state.currentKm,
    completed: state.completed,
    riderCount,
    groupCount,
    activeGroupCount,
    eventCount,
    riders: state.riders,
    groups: state.groups,
  }

  const hashed: CanonicalHashedValue = createCanonicalHashedValue(payload)

  return {
    ...payload,
    canonicalJson: hashed.canonicalJson,
    deterministicHash: hashed.hash,
  }
}

/**
 * getReplaySnapshotBoundarySeconds
 *
 * Given a previous and current race second and an interval in seconds,
 * return all interval boundary seconds that are strictly greater than
 * previousRaceSecond and less than or equal to currentRaceSecond.
 *
 * Validation:
 * - previousRaceSecond and currentRaceSecond must be non-negative integers.
 * - currentRaceSecond must be >= previousRaceSecond.
 * - intervalSeconds must be a positive integer.
 *
 * Examples:
 * - 0 to 30, interval 30 => [30]
 * - 0 to 90, interval 30 => [30, 60, 90]
 * - 30 to 60, interval 30 => [60]
 * - 29 to 61, interval 30 => [30, 60]
 * - 0 to 29, interval 30 => []
 */
export function getReplaySnapshotBoundarySeconds(
  previousRaceSecond: number,
  currentRaceSecond: number,
  intervalSeconds: number,
): readonly number[] {
  if (
    !Number.isInteger(previousRaceSecond) ||
    previousRaceSecond < 0 ||
    !Number.isInteger(currentRaceSecond) ||
    currentRaceSecond < 0
  ) {
    throw new RangeError(
      'previousRaceSecond and currentRaceSecond must be non-negative integers',
    )
  }

  if (currentRaceSecond < previousRaceSecond) {
    throw new RangeError(
      'currentRaceSecond must not be below previousRaceSecond',
    )
  }

  if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) {
    throw new RangeError('intervalSeconds must be a positive integer')
  }

  const results: number[] = []

  const firstBoundary =
    (Math.floor(previousRaceSecond / intervalSeconds) + 1) * intervalSeconds

  let boundary = firstBoundary
  while (boundary <= currentRaceSecond) {
    results.push(boundary)
    boundary += intervalSeconds
  }

  return results
}

/**
 * shouldCaptureReplaySnapshot
 *
 * Convenience wrapper that returns true if there is at least one interval
 * boundary between previousRaceSecond (exclusive) and currentRaceSecond (inclusive).
 */
export function shouldCaptureReplaySnapshot(
  previousRaceSecond: number,
  currentRaceSecond: number,
  intervalSeconds: number,
): boolean {
  return (
    getReplaySnapshotBoundarySeconds(
      previousRaceSecond,
      currentRaceSecond,
      intervalSeconds,
    ).length > 0
  )
}

/**
 * ReplaySnapshotCollection
 *
 * A collection of ReplaySnapshot items with a single canonical JSON + hash
 * for the whole collection.
 */
export interface ReplaySnapshotCollection {
  readonly snapshots: readonly ReplaySnapshot[]
  readonly canonicalJson: string
  readonly deterministicHash: string
}

/**
 * createReplaySnapshotCollection
 *
 * Validate and create a canonicalized collection from an array of snapshots.
 *
 * Validations:
 * - snapshots must not be empty
 * - sequenceNumber must start at 1 and increment by 1 for each snapshot
 * - raceSecond values must be monotonically non-decreasing
 * - each deterministicHash must match /^[0-9a-f]{16}$/
 *
 * The canonical payload omits the per-snapshot canonicalJson fields to keep the
 * collection payload compact.
 */
export function createReplaySnapshotCollection(
  snapshots: readonly ReplaySnapshot[],
): ReplaySnapshotCollection {
  if (snapshots.length === 0) {
    throw new Error(
      'createReplaySnapshotCollection: at least one snapshot is required.',
    )
  }

  // Validate sequence numbers and raceSecond ordering
  for (let i = 0; i < snapshots.length; i += 1) {
    const snapshot = snapshots[i]
    const expectedSequenceNumber = i + 1

    if (snapshot.sequenceNumber !== expectedSequenceNumber) {
      throw new Error(
        `createReplaySnapshotCollection: expected sequence ${expectedSequenceNumber}, received ${snapshot.sequenceNumber}.`,
      )
    }

    if (i > 0) {
      const prev = snapshots[i - 1]
      if (snapshot.raceSecond < prev.raceSecond) {
        throw new Error(
          'createReplaySnapshotCollection: raceSecond values must be monotonically non-decreasing.',
        )
      }
    }

    // Validate deterministic hash format (16 lowercase hex chars)
    if (!/^[0-9a-f]{16}$/.test(snapshot.deterministicHash)) {
      throw new Error(
        `createReplaySnapshotCollection: snapshot ${snapshot.sequenceNumber} has invalid deterministicHash.`,
      )
    }
  }

  const payload = {
    snapshots: snapshots.map((snapshot) => ({
      sequenceNumber: snapshot.sequenceNumber,
      raceSecond: snapshot.raceSecond,
      currentKm: snapshot.currentKm,
      completed: snapshot.completed,
      riderCount: snapshot.riderCount,
      groupCount: snapshot.groupCount,
      activeGroupCount: snapshot.activeGroupCount,
      eventCount: snapshot.eventCount,
      riders: snapshot.riders,
      groups: snapshot.groups,
      deterministicHash: snapshot.deterministicHash,
    })),
  }

  const hashed = createCanonicalHashedValue(payload)

  return {
    snapshots,
    canonicalJson: hashed.canonicalJson,
    deterministicHash: hashed.hash,
  }
}
