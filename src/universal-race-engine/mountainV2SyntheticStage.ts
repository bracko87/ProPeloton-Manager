/**
 * One-way, synthetic-only Mountain V2 stage pipeline.
 *
 * It does NOT import the legacy engine, persist results, replace authoritative
 * group/time resolution, or determine prizes/GC/points. Integration contract
 * checks ensure all physical states, stage clocks and replay frames agree.
 */
import {
  simulateMountainV2Contacts,
  type MountainV2Rider,
  type MountainV2Segment,
} from './mountainContactPhysicsV2.ts'
import { buildMountainV2SyntheticStageClock } from './mountainV2SyntheticStageClock.ts'
import { buildMountainV2SyntheticFinishReplay } from './mountainV2SyntheticFinishReplay.ts'

export function runMountainV2SyntheticStage(
  riders: readonly MountainV2Rider[],
  segments: readonly MountainV2Segment[],
) {
  if (!segments.length) throw new Error('Synthetic Mountain V2 stage requires segments')
  const physics = simulateMountainV2Contacts(riders, segments)
  const timed = buildMountainV2SyntheticStageClock(segments, physics)
  const finishReplay = buildMountainV2SyntheticFinishReplay(timed)
  if (timed.length !== physics.checkpoints.length ||
      finishReplay.replay.length !== timed.length) {
    throw new Error('Mountain V2 stage checkpoint lineage mismatch')
  }
  const expectedIds = new Set(riders.map(row => row.riderId))
  const finalIds = finishReplay.finish.map(row => row.riderId)
  if (finalIds.length !== expectedIds.size ||
      finalIds.some(id => !expectedIds.has(id))) {
    throw new Error('Mountain V2 stage finish membership mismatch')
  }
  for (let index = 0; index < timed.length; index++) {
    const physicsFrame = physics.checkpoints[index]
    const timeFrame = timed[index]
    const replayFrame = finishReplay.replay[index]
    if (physicsFrame.km !== timeFrame.km || timeFrame.km !== replayFrame.km) {
      throw new Error('Mountain V2 stage position mismatch')
    }
    for (const rider of physicsFrame.riders) {
      const gap = timeFrame.riderElapsedSeconds[rider.riderId] -
        timeFrame.leaderElapsedSeconds
      if (Math.abs(gap - rider.gapSeconds) > 0.0001) {
        throw new Error('Mountain V2 stage gap/time mismatch')
      }
    }
  }
  const last = timed[timed.length - 1]
  for (const row of finishReplay.finish) {
    if (Math.abs(row.elapsedSeconds - last.riderElapsedSeconds[row.riderId]) > 0.00001 ||
        Math.abs(row.gapSeconds - (row.elapsedSeconds - last.leaderElapsedSeconds)) > 0.00001) {
      throw new Error('Mountain V2 stage finish/replay mismatch')
    }
  }
  return {
    authority: 'synthetic_only' as const,
    modelVersion: physics.modelVersion,
    physicalCheckpoints: physics.checkpoints,
    timedCheckpoints: timed,
    finish: finishReplay.finish,
    replay: finishReplay.replay,
  }
}
