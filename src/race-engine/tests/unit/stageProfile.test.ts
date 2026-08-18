/**
 * stageProfile.test.ts
 *
 * Unit tests for the stage terrain profile sampling utility.
 *
 * Focus:
 * - Gradient sign and magnitude on flat, uphill, and downhill segments.
 * - Linear interpolation for midpoints.
 * - Exact profile point elevation lookups.
 * - Handling of unsorted input and immutability of the original array.
 * - Robust validation and error conditions.
 */

import { describe, it, expect } from 'vitest'
import type {
  StageInput,
  StageProfilePoint,
} from '../../domain/StageInput'
import { getStageTerrainSample } from '../../simulation/stageProfile'

/**
 * createStageInput
 *
 * Helper to construct a minimal StageInput fixture for tests.
 * Uses only the fields required by getStageTerrainSample:
 * - distanceKm
 * - profilePoints
 *
 * The object is cast to StageInput to avoid depending on the full
 * production contract in these unit tests.
 */
function createStageInput(
  profilePoints: StageProfilePoint[],
  distanceKm: number,
): StageInput {
  return {
    distanceKm,
    profilePoints,
  } as unknown as StageInput
}

describe('getStageTerrainSample', () => {
  it('returns zero gradient for a flat segment', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: 100 },
    ]
    const stage = createStageInput(profilePoints, 1)

    const sample = getStageTerrainSample(stage, 0.5)

    expect(sample.gradientPercent).toBe(0)
    expect(sample.elevationMetres).toBe(100)
  })

  it('returns positive gradient for an uphill segment', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: 200 },
    ]
    const stage = createStageInput(profilePoints, 1)

    const sample = getStageTerrainSample(stage, 0.5)

    expect(sample.gradientPercent).toBeCloseTo(10)
    expect(sample.elevationMetres).toBeCloseTo(150)
  })

  it('returns negative gradient for a downhill segment', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 200 },
      { kilometre: 1, elevationMetres: 100 },
    ]
    const stage = createStageInput(profilePoints, 1)

    const sample = getStageTerrainSample(stage, 0.5)

    expect(sample.gradientPercent).toBeCloseTo(-10)
    expect(sample.elevationMetres).toBeCloseTo(150)
  })

  it('linearly interpolates elevation at the midpoint between two points', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 50 },
      { kilometre: 2, elevationMetres: 150 },
    ]
    const stage = createStageInput(profilePoints, 2)

    const sample = getStageTerrainSample(stage, 1)

    // Midpoint between 50 m and 150 m over 2 km should be 100 m.
    expect(sample.elevationMetres).toBeCloseTo(100)
    expect(sample.lowerPointKilometre).toBe(0)
    expect(sample.upperPointKilometre).toBe(2)
  })

  it('returns exact profile point elevation when sampling at a profile point', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 80 },
      { kilometre: 1, elevationMetres: 120 },
      { kilometre: 2, elevationMetres: 200 },
    ]
    const stage = createStageInput(profilePoints, 2)

    const sampleAtFirst = getStageTerrainSample(stage, 0)
    const sampleAtMiddle = getStageTerrainSample(stage, 1)
    const sampleAtLast = getStageTerrainSample(stage, 2)

    expect(sampleAtFirst.elevationMetres).toBe(80)
    expect(sampleAtMiddle.elevationMetres).toBe(120)
    expect(sampleAtLast.elevationMetres).toBe(200)
  })

  it('handles unsorted profile points deterministically', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 2, elevationMetres: 200 },
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: 150 },
    ]
    const stage = createStageInput(profilePoints, 2)

    const sample = getStageTerrainSample(stage, 1)

    // After sorting, lower = 1 km, upper = 2 km for km = 1.
    expect(sample.lowerPointKilometre).toBe(1)
    expect(sample.upperPointKilometre).toBe(2)
    expect(sample.elevationMetres).toBe(150)
  })

  it('does not mutate the original profilePoints array', () => {
    const original: StageProfilePoint[] = [
      { kilometre: 1, elevationMetres: 150 },
      { kilometre: 0, elevationMetres: 100 },
    ]
    const copyBefore = original.map((p) => ({ ...p }))

    const stage = createStageInput(original, 1)

    void getStageTerrainSample(stage, 0.5)

    // Ensure order and values are unchanged.
    expect(original).toEqual(copyBefore)
  })

  it('rejects duplicate kilometre values', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 0, elevationMetres: 150 },
    ]
    const stage = createStageInput(profilePoints, 1)

    expect(() => getStageTerrainSample(stage, 0)).toThrowError()
  })

  it('rejects fewer than two profile points', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
    ]
    const stage = createStageInput(profilePoints, 1)

    expect(() => getStageTerrainSample(stage, 0)).toThrowError()
  })

  it('rejects negative requested kilometre', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: 100 },
    ]
    const stage = createStageInput(profilePoints, 1)

    expect(() => getStageTerrainSample(stage, -0.1)).toThrowError()
  })

  it('rejects requested kilometre beyond stage distance', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: 100 },
    ]
    const stage = createStageInput(profilePoints, 1)

    expect(() => getStageTerrainSample(stage, 1.1)).toThrowError()
  })

  it('rejects non-finite requested kilometre', () => {
    const profilePoints: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: 100 },
    ]
    const stage = createStageInput(profilePoints, 1)

    expect(() => getStageTerrainSample(stage, Number.NaN)).toThrowError()
    expect(() => getStageTerrainSample(stage, Number.POSITIVE_INFINITY)).toThrowError()
    expect(() => getStageTerrainSample(stage, Number.NEGATIVE_INFINITY)).toThrowError()
  })

  it('rejects non-finite profile point values', () => {
    const badKilometre: StageProfilePoint[] = [
      { kilometre: Number.NaN, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: 100 },
    ]
    const badElevation: StageProfilePoint[] = [
      { kilometre: 0, elevationMetres: 100 },
      { kilometre: 1, elevationMetres: Number.POSITIVE_INFINITY },
    ]

    const stageWithBadKilometre = createStageInput(badKilometre, 1)
    const stageWithBadElevation = createStageInput(badElevation, 1)

    expect(() => getStageTerrainSample(stageWithBadKilometre, 0.5)).toThrowError()
    expect(() => getStageTerrainSample(stageWithBadElevation, 0.5)).toThrowError()
  })
})
