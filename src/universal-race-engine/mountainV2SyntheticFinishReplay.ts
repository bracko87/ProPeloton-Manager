/** Synthetic-only Mountain V2 finish and replay checkpoint consistency.
 * Never persists, ranks official results, or changes the universal engine.
 */
import type { MountainV2TimedCheckpoint } from './mountainV2TimeReconciliation.ts'

export interface MountainV2SyntheticFinish {
  readonly riderId: string
  readonly rank: number
  readonly elapsedSeconds: number
  readonly gapSeconds: number
}
export interface MountainV2SyntheticReplayFrame {
  readonly km: number
  readonly riderElapsedSeconds: Readonly<Record<string, number>>
  readonly groupRiderIds: readonly (readonly string[])[]
}
export interface MountainV2SyntheticFinishReplay {
  readonly authority: 'synthetic_only'
  readonly finish: readonly MountainV2SyntheticFinish[]
  readonly replay: readonly MountainV2SyntheticReplayFrame[]
}
/** Synthetic equal times receive the same rank. Do not treat this as the game's
 * official photo-finish, bonuses, incidents or classification contract. */
export function buildMountainV2SyntheticFinishReplay(
  checkpoints: readonly MountainV2TimedCheckpoint[],
): MountainV2SyntheticFinishReplay {
  if (!checkpoints.length) throw new Error('No synthetic mountain checkpoints')
  const ids = Object.keys(checkpoints[0].riderElapsedSeconds)
  if (!ids.length) throw new Error('No synthetic mountain riders')
  const idSet = new Set(ids)
  let previousKm = -1
  const previousTimes = new Map<string, number>()
  const replay = checkpoints.map(cp => {
    if (!Number.isFinite(cp.km) || cp.km <= previousKm) {
      throw new Error('Invalid replay checkpoint order')
    }
    const cpIds = Object.keys(cp.riderElapsedSeconds)
    if (cpIds.length !== idSet.size || cpIds.some(id => !idSet.has(id))) {
      throw new Error('Replay rider membership mismatch')
    }
    const groups = cp.groups.map(g => [...g.riderIds])
    const members = groups.flat()
    if (members.length !== cpIds.length ||
        new Set(members).size !== idSet.size ||
        members.some(id => !idSet.has(id))) {
      throw new Error('Replay groups do not partition riders')
    }
    for (const id of cpIds) {
      const t = cp.riderElapsedSeconds[id]
      if (!Number.isFinite(t) || t < 0 ||
          (previousTimes.has(id) && t <= previousTimes.get(id)!)) {
        throw new Error('Invalid rider replay elapsed time')
      }
      previousTimes.set(id, t)
    }
    for (const group of cp.groups) {
      if (!Number.isFinite(group.leaderElapsedSeconds) ||
          Math.abs(group.leaderElapsedSeconds -
            Math.min(...group.riderIds.map(id => cp.riderElapsedSeconds[id]))) > 0.00001) {
        throw new Error('Replay group clock mismatch')
      }
    }
    if (Math.abs(cp.leaderElapsedSeconds -
      Math.min(...Object.values(cp.riderElapsedSeconds))) > 0.00001) {
      throw new Error('Replay leader clock mismatch')
    }
    previousKm = cp.km
    return {km: cp.km, riderElapsedSeconds: {...cp.riderElapsedSeconds}, groupRiderIds: groups}
  })
  const last = checkpoints[checkpoints.length - 1]
  const sorted = ids.map(riderId => ({
    riderId, elapsedSeconds: last.riderElapsedSeconds[riderId],
  })).sort((a,b) => a.elapsedSeconds - b.elapsedSeconds ||
    a.riderId.localeCompare(b.riderId))
  const best = sorted[0].elapsedSeconds
  const finish = sorted.map((rider, index) => ({
    riderId: rider.riderId,
    rank: index > 0 && Math.abs(rider.elapsedSeconds - sorted[index-1].elapsedSeconds) < 0.000001
      ? 0 : index + 1,
    elapsedSeconds: rider.elapsedSeconds,
    gapSeconds: rider.elapsedSeconds - best,
  }))
  for (let i = 0; i < finish.length; i++) {
    if (finish[i].rank === 0) {
      let j = i-1
      while (j >= 0 && finish[j].rank === 0) j--
      finish[i] = {...finish[i], rank: finish[j].rank}
    }
  }
  return {authority:'synthetic_only',finish,replay}
}
