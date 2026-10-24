import { describe, expect, it } from 'vitest'
import {
  calculateRoadOpeningLaunchGapSecondsV1,
  isOpeningAttemptPhysicallyLaunchedV1,
} from './runRaceEngine.ts'

describe('Physical opening-attack launch and post-catch replay contract', () => {
  it('uses deterministic rider-specific acceleration, never a fixed seven-second launch', () => {
    const weak = calculateRoadOpeningLaunchGapSecondsV1(30.88, 1.076, 53, 35)
    const strong = calculateRoadOpeningLaunchGapSecondsV1(34.22, 1.087, 83, 85)
    const middle = calculateRoadOpeningLaunchGapSecondsV1(31.34, 1.078, 67, 60)
    expect(weak).toBeGreaterThan(0)
    expect(strong).toBeGreaterThan(middle)
    expect(middle).toBeGreaterThan(weak)
    expect(new Set([weak, middle, strong]).size).toBe(3)
    expect(calculateRoadOpeningLaunchGapSecondsV1(31.34, 1.078, 67, 60)).toBe(middle)
    expect(calculateRoadOpeningLaunchGapSecondsV1(30, 1, 80, 80)).toBe(0)
  })

  it('recognizes Dordrecht first-wave physics and covers only the impossible second wave', () => {
    const physicalCatchKm = 9.548553
    const attempts = [5.812719, 6.548553, 10.290312, 11.122007]
    expect(attempts.map(km => isOpeningAttemptPhysicallyLaunchedV1(km, physicalCatchKm)))
      .toEqual([true, true, false, false])
    expect(isOpeningAttemptPhysicallyLaunchedV1(9.548553, physicalCatchKm)).toBe(false)
    expect(isOpeningAttemptPhysicallyLaunchedV1(11.122007, null)).toBe(true)
  })
})
