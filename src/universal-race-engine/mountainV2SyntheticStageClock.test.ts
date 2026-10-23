import { describe, expect, it } from 'vitest'
import { simulateMountainV2Contacts, type MountainV2Segment } from './mountainContactPhysicsV2.ts'
import { buildMountainV2SyntheticStageClock } from './mountainV2SyntheticStageClock.ts'

const segments: MountainV2Segment[] = [
  { lengthKm: 12, gradientPercent: 8, terrain: 'climb' },
  { lengthKm: 10, gradientPercent: -5, terrain: 'descent' },
  { lengthKm: 8, gradientPercent: 0, terrain: 'flat' },
]
const riders = [
  { riderId: 'a', teamId: 'red', climbing: 90, endurance: 85, descending: 65, energy: 90, effort: 'steady' as const, gapSeconds: 0 },
  { riderId: 'b', teamId: 'blue', climbing: 65, endurance: 65, descending: 65, energy: 90, effort: 'steady' as const, gapSeconds: 0 },
  { riderId: 'c', teamId: 'blue', climbing: 75, endurance: 75, descending: 65, energy: 90, effort: 'attack' as const, gapSeconds: 0 },
]
describe('mountain V2 synthetic stage clock', () => {
  it('derives cumulative absolute rider time from rider speed over all segments', () => {
    const simulation = simulateMountainV2Contacts(riders, segments)
    const timed = buildMountainV2SyntheticStageClock(segments, simulation)
    expect(timed).toHaveLength(segments.length)
    expect(timed.map(c => c.km)).toEqual([12, 22, 30])
    for (let i = 0; i < timed.length; i++) {
      const checkpoint = timed[i]
      expect(checkpoint.leaderElapsedSeconds).toBeGreaterThan(i ? timed[i-1].leaderElapsedSeconds : 0)
      for (const rider of simulation.checkpoints[i].riders) {
        expect(checkpoint.riderElapsedSeconds[rider.riderId] - checkpoint.leaderElapsedSeconds)
          .toBeCloseTo(rider.gapSeconds, 4)
        if (i > 0) {
          expect(checkpoint.riderElapsedSeconds[rider.riderId]).toBeGreaterThan(
            timed[i-1].riderElapsedSeconds[rider.riderId])
        }
      }
    }
    expect(buildMountainV2SyntheticStageClock(segments, simulation)).toEqual(timed)
  })
  it('fails closed on modified speeds rather than manufacturing official times', () => {
    const simulation = simulateMountainV2Contacts(riders, segments)
    const bad = {
      ...simulation,
      checkpoints: simulation.checkpoints.map((checkpoint, index) => index === 0
        ? { ...checkpoint, riders: checkpoint.riders.map((rider, riderIndex) =>
            riderIndex === 0 ? {...rider, speedKmh: rider.speedKmh * 0.5} : rider) }
        : checkpoint),
    }
    expect(() => buildMountainV2SyntheticStageClock(segments, bad)).toThrow()
  })
  it('rejects a stage with missing sectors', () => {
    const simulation = simulateMountainV2Contacts(riders, segments)
    expect(() => buildMountainV2SyntheticStageClock(segments.slice(1), simulation)).toThrow()
  })
})
