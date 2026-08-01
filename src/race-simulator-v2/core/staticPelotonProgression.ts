/**
 * staticPelotonProgression.ts
 *
 * Pure deterministic progression for the first peloton-only race step.
 *
 * Purpose:
 * - Advance one existing checkpoint by a fixed number of race seconds.
 * - Keep every rider together in the existing peloton.
 * - Use the checkpoint's existing group speed without consuming more RNG.
 * - Clamp all movement at the stage distance.
 *
 * This step intentionally contains no attacks, breakaways, energy,
 * commentary, gaps or other race dynamics.
 */

import { Checkpoint } from '../types/checkpoint'
import { StageInput } from '../types/stage'

const DISTANCE_PRECISION = 1_000_000

/**
 * Round a kilometre value to six decimal places so repeated deterministic
 * calculations return stable checkpoint values.
 */
function roundDistanceKm(value: number): number {
  return Math.round(value * DISTANCE_PRECISION) / DISTANCE_PRECISION
}

/**
 * Advance a single-peloton checkpoint by a fixed duration.
 *
 * All riders remain in their existing group and move to the same distance as
 * that group. The function does not mutate the supplied checkpoint.
 *
 * @param stage - Stage metadata containing the total stage distance
 * @param checkpoint - Existing single-peloton checkpoint
 * @param elapsedSeconds - Positive number of race seconds to advance
 * @returns A new deterministic checkpoint
 */
export function advanceStaticPeloton(
  stage: StageInput,
  checkpoint: Checkpoint,
  elapsedSeconds: number,
): Checkpoint {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    throw new Error('elapsedSeconds must be a positive finite number')
  }

  if (!Number.isInteger(checkpoint.checkpointIndex) || checkpoint.checkpointIndex < 0) {
    throw new Error('checkpointIndex must be a non-negative integer')
  }

  if (checkpoint.groups.length !== 1) {
    throw new Error('Static peloton progression requires exactly one group')
  }

  const sourceGroup = checkpoint.groups[0]

  if (!sourceGroup.active) {
    throw new Error('Static peloton progression requires an active group')
  }

  if (!Number.isFinite(sourceGroup.speedKmh) || sourceGroup.speedKmh < 0) {
    throw new Error('Peloton speed must be a non-negative finite number')
  }

  const distanceDeltaKm = (sourceGroup.speedKmh * elapsedSeconds) / 3600
  const nextDistanceKm = roundDistanceKm(
    Math.min(stage.distanceKm, sourceGroup.distanceKm + distanceDeltaKm),
  )

  return {
    checkpointIndex: checkpoint.checkpointIndex + 1,
    raceSecond: checkpoint.raceSecond + elapsedSeconds,
    currentKm: nextDistanceKm,
    groups: [
      {
        ...sourceGroup,
        riderIds: [...sourceGroup.riderIds],
        distanceKm: nextDistanceKm,
      },
    ],
    riderSnapshots: checkpoint.riderSnapshots.map((riderSnapshot) => ({
      ...riderSnapshot,
      distanceKm: nextDistanceKm,
    })),
  }
}
