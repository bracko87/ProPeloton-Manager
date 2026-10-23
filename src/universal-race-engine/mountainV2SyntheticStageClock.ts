/**
 * Mountain V2 synthetic-only stage clock.
 *
 * Reconstructs the absolute elapsed-time axis from physical segment speeds.
 * This does not use official results or write to a race/replay checkpoint.
 */
import type { MountainV2Segment, MountainV2Simulation } from './mountainContactPhysicsV2.ts'
import { reconcileMountainV2SyntheticTime, type MountainV2TimedCheckpoint } from './mountainV2TimeReconciliation.ts'

export function buildMountainV2SyntheticStageClock(
  segments: readonly MountainV2Segment[],
  simulation: MountainV2Simulation,
): readonly MountainV2TimedCheckpoint[] {
  if (!segments.length || segments.length !== simulation.checkpoints.length) {
    throw new Error('Mountain V2 synthetic segment/checkpoint mismatch')
  }
  let precedingLeaderClock = 0
  let precedingGap = new Map<string, number>()
  let precedingIds: Set<string> | null = null
  const clocks: number[] = []
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    const checkpoint = simulation.checkpoints[index]
    if (!Number.isFinite(segment.lengthKm) || segment.lengthKm <= 0) {
      throw new Error('Mountain V2 invalid segment distance')
    }
    const ids = new Set(checkpoint.riders.map(r => r.riderId))
    if (!checkpoint.riders.length || ids.size !== checkpoint.riders.length ||
      (precedingIds !== null && (ids.size !== precedingIds.size ||
        [...ids].some(id => !precedingIds!.has(id))))) {
      throw new Error('Mountain V2 synthetic rider membership changed')
    }
    const arrivals = checkpoint.riders.map(rider => {
      if (!Number.isFinite(rider.speedKmh) || rider.speedKmh <= 0) {
        throw new Error('Mountain V2 invalid checkpoint speed')
      }
      return precedingLeaderClock + (precedingGap.get(rider.riderId) ?? 0) +
        3600 * segment.lengthKm / rider.speedKmh
    })
    const nextLeaderClock = Math.min(...arrivals)
    if (!Number.isFinite(nextLeaderClock) || nextLeaderClock <= precedingLeaderClock) {
      throw new Error('Mountain V2 synthetic leader clock invalid')
    }
    for (let i = 0; i < arrivals.length; i++) {
      const computedGap = arrivals[i] - nextLeaderClock
      if (Math.abs(computedGap - checkpoint.riders[i].gapSeconds) > 0.0001) {
        throw new Error('Mountain V2 physical rider gap and computed arrival disagree')
      }
    }
    clocks.push(nextLeaderClock)
    precedingLeaderClock = nextLeaderClock
    precedingGap = new Map(checkpoint.riders.map(r => [r.riderId, r.gapSeconds]))
    precedingIds = ids
  }
  return reconcileMountainV2SyntheticTime(simulation.checkpoints, clocks)
}
