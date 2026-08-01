/**
 * initialCheckpoint.ts
 *
 * Pure function producing the initial checkpoint for a stage using deterministic RNG.
 *
 * Purpose:
 * - Place all riders into a single peloton group at km 0.
 * - Assign deterministic speeds derived from rider.flat and the seeded RNG.
 * - Return a Checkpoint that is stable across identical seeds.
 *
 * Notes:
 * - The logic intentionally remains minimal and avoids any race dynamics.
 */

import { DeterministicConfig, RNG } from '../types/deterministic'
import { createRng } from '../utils/seededRng'
import { StageInput } from '../types/stage'
import { RiderInput } from '../types/rider'
import { Checkpoint, GroupSnapshot, RiderSnapshot } from '../types/checkpoint'

/**
 * createInitialCheckpoint
 *
 * Generate an initial checkpoint for the provided stage and riders using the
 * deterministic configuration. All riders start in a single group at distance 0.
 *
 * @param config - DeterministicConfig containing the seed
 * @param stage - StageInput for context (not heavily used in this slice)
 * @param riders - list of RiderInput
 * @returns Checkpoint - deterministic snapshot at raceSecond 0
 */
export function createInitialCheckpoint(
  config: DeterministicConfig,
  stage: StageInput,
  riders: RiderInput[],
): Checkpoint {
  void stage

  // Create the RNG from the provided seed
  const rng: RNG = createRng(config.seed)

  // Deterministically compute a base speed contribution from rider.flat
  // Formula (intentional simplicity):
  // baseSpeed = 43 km/h + (flat - 60) * 0.12
  // variability = rng * 0.5 km/h (small deterministic jitter)
  const riderSnapshots: RiderSnapshot[] = riders.map((r) => {
    const base = 43 + (r.flat - 60) * 0.12
    const jitter = (rng.next() - 0.5) * 0.5 // -> [-0.25, 0.25]
    const speedKmh = Math.max(28, +(base + jitter).toFixed(3)) // floor for sanity
    return {
      riderId: r.riderId,
      distanceKm: 0,
      speedKmh,
      currentGroupId: 'peloton-1',
      freshness: r.startingFreshness,
      energy: r.startingFreshness,
      movementEnergyCost: 0,
      attackEnergyCost: 0,
      shelterEnergySaving: 0,
      energyCostSincePreviousCheckpoint: 0,
    }
  })

  // Single peloton group containing all riders in deterministic order:
  const group: GroupSnapshot = {
    groupId: 'peloton-1',
    riderIds: riders.map((r) => r.riderId),
    distanceKm: 0,
    // group speed is simple mean of rider speeds (deterministic)
    speedKmh:
      Math.round(
        (riderSnapshots.reduce((s, rs) => s + rs.speedKmh, 0) / riderSnapshots.length) *
          1000,
      ) / 1000,
    gapSecondsToLeader: 0,
    active: true,
  }

  const checkpoint: Checkpoint = {
    checkpointIndex: 0,
    raceSecond: 0,
    currentKm: 0,
    groups: [group],
    riderSnapshots,
  }

  return checkpoint
}
