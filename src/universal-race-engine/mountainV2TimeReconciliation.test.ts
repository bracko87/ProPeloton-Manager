import { describe, it, expect } from 'vitest'
import { simulateMountainV2Contacts } from './mountainContactPhysicsV2.ts'
import { reconcileMountainV2SyntheticTime } from './mountainV2TimeReconciliation.ts'

const simulation = () => simulateMountainV2Contacts([
  { riderId: 'a', teamId: 'red', climbing: 90, endurance: 85, descending: 65, energy: 90, effort: 'steady', gapSeconds: 0 },
  { riderId: 'b', teamId: 'blue', climbing: 65, endurance: 65, descending: 65, energy: 90, effort: 'steady', gapSeconds: 0 },
  { riderId: 'c', teamId: 'blue', climbing: 75, endurance: 75, descending: 65, energy: 90, effort: 'attack', gapSeconds: 0 },
], [
  { lengthKm: 12, gradientPercent: 8, terrain: 'climb' },
  { lengthKm: 10, gradientPercent: -5, terrain: 'descent' },
])
describe('Mountain V2 synthetic timing reconciliation', () => {
  it('maps every physical rider and group onto consistent synthetic clocks', () => {
    const physical = simulation()
    const clocks = [3000, 5000]
    const timed = reconcileMountainV2SyntheticTime(physical.checkpoints, clocks)
    expect(timed).toHaveLength(2)
    for (const [i, checkpoint] of timed.entries()) {
      expect(checkpoint.leaderElapsedSeconds).toBe(clocks[i])
      expect(Object.keys(checkpoint.riderElapsedSeconds).sort()).toEqual(['a','b','c'])
      expect(checkpoint.groups.flatMap(group => group.riderIds).sort()).toEqual(['a','b','c'])
      for (const group of checkpoint.groups) {
        expect(group.leaderElapsedSeconds).toBeCloseTo(
          Math.min(...group.riderIds.map(id => checkpoint.riderElapsedSeconds[id])), 6)
      }
    }
    expect(reconcileMountainV2SyntheticTime(physical.checkpoints, clocks)).toEqual(timed)
  })
  it('refuses missing clocks and backward individual elapsed time', () => {
    const checkpoints = simulation().checkpoints
    expect(() => reconcileMountainV2SyntheticTime(checkpoints, [3000])).toThrow()
    expect(() => reconcileMountainV2SyntheticTime(checkpoints, [3000, 3001])).toThrow()
  })
  it('refuses an invalid group partition rather than creating a classification', () => {
    const checkpoint = simulation().checkpoints[0]
    const broken = { ...checkpoint, groups: checkpoint.groups.map((g, index) =>
      index === 0 ? {...g, riderIds: [...g.riderIds, g.riderIds[0]]} : g) }
    expect(() => reconcileMountainV2SyntheticTime([broken], [3000])).toThrow()
  })
})
