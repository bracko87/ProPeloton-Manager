import { describe, expect, it } from 'vitest'
import { calculateUniversalRoadStageWinnerTimeSecondsV1 } from './roadStageWinningTimeV1.ts'
import type { UniversalRoadStageClockInputV1 } from './roadStageWinningTimeV1.ts'

// Real production input snapshots captured before the fix; no live DB needed.
const guadeloupeStage1: UniversalRoadStageClockInputV1 = {
  distanceKm: 146.2,
  elevationGainM: 420,
  terrainPercentages: { flat: 90, hilly: 10, mountain: 0, cobbled: 0 },
  profilePoints: [
    { km: 0, elevationM: 12 }, { km: 18, elevationM: 18 },
    { km: 42, elevationM: 10 }, { km: 66, elevationM: 22 },
    { km: 84, elevationM: 16 }, { km: 103, elevationM: 12 },
    { km: 126, elevationM: 20 }, { km: 146.2, elevationM: 8 },
  ],
}

const guadeloupeStage2: UniversalRoadStageClockInputV1 = {
  distanceKm: 136,
  elevationGainM: 620,
  terrainPercentages: { flat: 76, hilly: 24, mountain: 0, cobbled: 0 },
  profilePoints: [
    { km: 0, elevationM: 25 }, { km: 10, elevationM: 18 },
    { km: 20, elevationM: 32 }, { km: 30, elevationM: 45 },
    { km: 40, elevationM: 58 }, { km: 50, elevationM: 36 },
    { km: 60, elevationM: 21 }, { km: 70, elevationM: 40 },
    { km: 80, elevationM: 61 }, { km: 90, elevationM: 47 },
    { km: 100, elevationM: 29 }, { km: 110, elevationM: 35 },
    { km: 120, elevationM: 18 }, { km: 130, elevationM: 8 },
    { km: 136, elevationM: 6 },
  ],
}

const mauritius: UniversalRoadStageClockInputV1 = {
  distanceKm: 174,
  elevationGainM: 2380,
  terrainPercentages: { flat: 28, hilly: 42, mountain: 30, cobbled: 0 },
  profilePoints: [
    { km: 0, elevationM: 12 }, { km: 18, elevationM: 35 },
    { km: 30, elevationM: 120 }, { km: 42, elevationM: 480 },
    { km: 54, elevationM: 360 }, { km: 74, elevationM: 330 },
    { km: 80, elevationM: 350 }, { km: 92, elevationM: 705 },
    { km: 104, elevationM: 370 }, { km: 116, elevationM: 665 },
    { km: 128, elevationM: 310 }, { km: 146, elevationM: 22 },
    { km: 160, elevationM: 28 }, { km: 174, elevationM: 12 },
  ],
}

const averageSpeedKmh = (stage: UniversalRoadStageClockInputV1, seconds: number) =>
  (stage.distanceKm / seconds) * 3600

describe('V1 terrain-aware absolute road-stage winner clock', () => {
  it('removes the repeated 42 km/h clock on both Guadeloupe stages', () => {
    const first = calculateUniversalRoadStageWinnerTimeSecondsV1(
      guadeloupeStage1, { windKmh: 18 },
    )
    const second = calculateUniversalRoadStageWinnerTimeSecondsV1(
      guadeloupeStage2, { windKmh: 14 },
    )
    expect(averageSpeedKmh(guadeloupeStage1, first)).toBeGreaterThan(40)
    expect(averageSpeedKmh(guadeloupeStage1, first)).toBeLessThan(42)
    expect(averageSpeedKmh(guadeloupeStage2, second)).toBeGreaterThan(39)
    expect(averageSpeedKmh(guadeloupeStage2, second)).toBeLessThan(42)
    expect(averageSpeedKmh(guadeloupeStage1, first)).not.toBeCloseTo(
      averageSpeedKmh(guadeloupeStage2, second), 3,
    )
  })

  it('accounts for Mauritius climbing even though the finish is flat', () => {
    const seconds = calculateUniversalRoadStageWinnerTimeSecondsV1(
      mauritius, { windKmh: 22.5 },
    )
    expect(seconds).toBeGreaterThan(4.5 * 3600)
    expect(averageSpeedKmh(mauritius, seconds)).toBeGreaterThan(33)
    expect(averageSpeedKmh(mauritius, seconds)).toBeLessThan(38)
    expect(seconds).not.toBe(Math.round((174 / 42) * 3600))
  })

  it('uses the entire route, not just the final climb or finish classification', () => {
    const flat = { ...mauritius, elevationGainM: 0,
      terrainPercentages: { flat: 100, hilly: 0, mountain: 0, cobbled: 0 },
      profilePoints: [{ km: 0, elevationM: 0 }, { km: 174, elevationM: 0 }] }
    const hilly = { ...flat, terrainPercentages: {
      flat: 28, hilly: 42, mountain: 30, cobbled: 0,
    } }
    expect(calculateUniversalRoadStageWinnerTimeSecondsV1(hilly)).toBeGreaterThan(
      calculateUniversalRoadStageWinnerTimeSecondsV1(flat),
    )
    expect(calculateUniversalRoadStageWinnerTimeSecondsV1(mauritius))
      .toBeGreaterThan(calculateUniversalRoadStageWinnerTimeSecondsV1(hilly))
  })

  it('handles missing profile points and longer wind exposure deterministically', () => {
    const sparse = { ...mauritius, profilePoints: [] }
    const calm = calculateUniversalRoadStageWinnerTimeSecondsV1(sparse, { windKmh: 0 })
    const windy = calculateUniversalRoadStageWinnerTimeSecondsV1(sparse, { windKmh: 35 })
    expect(windy).toBeGreaterThan(calm)
    expect(windy).toBe(calculateUniversalRoadStageWinnerTimeSecondsV1(sparse, { windKmh: 35 }))
    expect(calm).toBeGreaterThan(0)
  })
})
