/**
 * Pure timing contract for Mountain V2. Experimental diagnostics only.
 * An authoritative finish clock is deliberately required from the caller:
 * relative gaps alone cannot establish elapsed race time.
 */
import type { MountainV2Checkpoint } from './mountainContactPhysicsV2.ts'

export interface MountainV2TimedGroup {
  readonly groupId: string
  readonly riderIds: readonly string[]
  readonly leaderElapsedSeconds: number
}
export interface MountainV2TimedCheckpoint {
  readonly km: number
  readonly leaderElapsedSeconds: number
  readonly riderElapsedSeconds: Readonly<Record<string, number>>
  readonly groups: readonly MountainV2TimedGroup[]
}

/**
 * Reconcile physical contacts to a separately supplied *synthetic* leader
 * clock. No official finish, ranking, payout or replay is mutated.
 * Fail closed if checkpoint membership, positions or clocks disagree.
 */
export function reconcileMountainV2SyntheticTime(
  checkpoints: readonly MountainV2Checkpoint[],
  leaderElapsedSeconds: readonly number[],
): readonly MountainV2TimedCheckpoint[] {
  if (!checkpoints.length || checkpoints.length !== leaderElapsedSeconds.length) {
    throw new Error('Mountain V2 checkpoint/clock count mismatch')
  }
  let previousKm = -1
  let previousLeader = -1
  let expectedIds: Set<string> | null = null
  let previousElapsed = new Map<string, number>()
  return checkpoints.map((checkpoint, index) => {
    const leaderClock = leaderElapsedSeconds[index]
    if (!Number.isFinite(leaderClock) || leaderClock < 0 ||
        leaderClock <= previousLeader || checkpoint.km <= previousKm ||
        !Number.isFinite(checkpoint.km)) {
      throw new Error('Mountain V2 nonmonotonic checkpoint geometry or clock')
    }
    const ids = checkpoint.riders.map(r => r.riderId)
    const idSet = new Set(ids)
    if (!ids.length || idSet.size !== ids.length ||
        (expectedIds !== null &&
         (idSet.size !== expectedIds.size ||
          ids.some(id => !expectedIds!.has(id))))) {
      throw new Error('Mountain V2 rider membership changed')
    }
    expectedIds = idSet
    const riderElapsedSeconds: Record<string, number> = {}
    for (const rider of checkpoint.riders) {
      if (!Number.isFinite(rider.gapSeconds) || rider.gapSeconds < 0) {
        throw new Error('Mountain V2 invalid rider gap')
      }
      const elapsed = leaderClock + rider.gapSeconds
      if (previousElapsed.has(rider.riderId) &&
          elapsed <= previousElapsed.get(rider.riderId)!) {
        throw new Error('Mountain V2 rider time moved backwards')
      }
      riderElapsedSeconds[rider.riderId] = elapsed
    }
    if (Math.min(...Object.values(riderElapsedSeconds)) !== leaderClock) {
      throw new Error('Mountain V2 leader gap is not zero')
    }
    const groupIds = checkpoint.groups.flatMap(g => g.riderIds)
    if (groupIds.length !== ids.length ||
        new Set(groupIds).size !== ids.length ||
        groupIds.some(id => !idSet.has(id))) {
      throw new Error('Mountain V2 groups do not partition riders')
    }
    let priorGroupGap = -1
    const groups = checkpoint.groups.map(group => {
      if (!group.riderIds.length ||
          !Number.isFinite(group.leaderGapSeconds) ||
          group.leaderGapSeconds < priorGroupGap) {
        throw new Error('Mountain V2 group ordering invalid')
      }
      const earliest = Math.min(...group.riderIds.map(id => riderElapsedSeconds[id]))
      if (Math.abs(earliest - (leaderClock + group.leaderGapSeconds)) > 0.00001) {
        throw new Error('Mountain V2 group gap contradicts rider times')
      }
      priorGroupGap = group.leaderGapSeconds
      return {
        groupId: group.groupId,
        riderIds: [...group.riderIds],
        leaderElapsedSeconds: earliest,
      }
    })
    previousKm = checkpoint.km
    previousLeader = leaderClock
    previousElapsed = new Map(Object.entries(riderElapsedSeconds))
    return {km: checkpoint.km, leaderElapsedSeconds: leaderClock, riderElapsedSeconds, groups}
  })
}
