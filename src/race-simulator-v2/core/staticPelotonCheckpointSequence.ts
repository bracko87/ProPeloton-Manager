/**
 * staticPelotonCheckpointSequence.ts
 *
 * Builds a small deterministic collection of peloton-only checkpoints.
 *
 * Purpose:
 * - Keep the already-tested initial checkpoint as checkpoint zero.
 * - Advance the same peloton at a fixed deterministic interval.
 * - Stop at the requested checkpoint count or when the stage finish is reached.
 * - Produce lightweight checkpoints rather than replay animation frames.
 *
 * This step intentionally contains no attacks, breakaways, energy,
 * commentary, gaps or other race dynamics.
 */

import { advanceStaticPeloton } from './staticPelotonProgression'
import { Checkpoint } from '../types/checkpoint'
import { StageInput } from '../types/stage'

export interface StaticPelotonCheckpointSequenceOptions {
  /** Total number of checkpoints, including the supplied initial checkpoint. */
  checkpointCount: number

  /** Fixed race-time interval between consecutive checkpoints. */
  intervalSeconds: number
}

function cloneCheckpoint(checkpoint: Checkpoint): Checkpoint {
  return {
    ...checkpoint,
    groups: checkpoint.groups.map((group) => ({
      ...group,
      riderIds: [...group.riderIds],
    })),
    riderSnapshots: checkpoint.riderSnapshots.map((riderSnapshot) => ({
      ...riderSnapshot,
    })),
  }
}

/**
 * Create a deterministic sequence of single-peloton checkpoints.
 *
 * The returned sequence contains the supplied initial state as its first
 * checkpoint and then repeatedly applies the already-tested B1.2 progression.
 * The source checkpoint is cloned and never mutated.
 */
export function createStaticPelotonCheckpointSequence(
  stage: StageInput,
  initialCheckpoint: Checkpoint,
  options: StaticPelotonCheckpointSequenceOptions,
): Checkpoint[] {
  if (!Number.isInteger(options.checkpointCount) || options.checkpointCount < 2) {
    throw new Error('checkpointCount must be an integer of at least 2')
  }

  if (!Number.isFinite(options.intervalSeconds) || options.intervalSeconds <= 0) {
    throw new Error('intervalSeconds must be a positive finite number')
  }

  if (!Number.isFinite(stage.distanceKm) || stage.distanceKm <= 0) {
    throw new Error('stage.distanceKm must be a positive finite number')
  }

  if (
    !Number.isFinite(initialCheckpoint.currentKm) ||
    initialCheckpoint.currentKm < 0 ||
    initialCheckpoint.currentKm > stage.distanceKm
  ) {
    throw new Error('initial checkpoint distance must be within the stage')
  }

  const checkpoints: Checkpoint[] = [cloneCheckpoint(initialCheckpoint)]

  while (checkpoints.length < options.checkpointCount) {
    const previousCheckpoint = checkpoints[checkpoints.length - 1]

    if (previousCheckpoint.currentKm >= stage.distanceKm) {
      break
    }

    checkpoints.push(
      advanceStaticPeloton(
        stage,
        previousCheckpoint,
        options.intervalSeconds,
      ),
    )
  }

  return checkpoints
}
