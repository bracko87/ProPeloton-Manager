/**
 * staticPelotonProgression.test.ts
 *
 * Focused tests for deterministic single-peloton progression.
 */

import { describe, expect, it } from 'vitest'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import { advanceStaticPeloton } from '../core/staticPelotonProgression'
import { flatStageFixture } from '../fixtures/flatStage1'

const STEP_SECONDS = 600

describe('advanceStaticPeloton', () => {
  it('produces an identical later checkpoint for identical input', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)

    const first = advanceStaticPeloton(stage, initial, STEP_SECONDS)
    const second = advanceStaticPeloton(stage, initial, STEP_SECONDS)

    expect(first).toEqual(second)
  })

  it('advances race time and distance using the deterministic peloton speed', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const later = advanceStaticPeloton(stage, initial, STEP_SECONDS)

    const expectedDistanceKm =
      initial.groups[0].distanceKm +
      (initial.groups[0].speedKmh * STEP_SECONDS) / 3600

    expect(later.raceSecond).toBe(initial.raceSecond + STEP_SECONDS)
    expect(later.currentKm).toBeGreaterThan(initial.currentKm)
    expect(later.currentKm).toBeCloseTo(expectedDistanceKm, 6)
    expect(later.groups[0].distanceKm).toBe(later.currentKm)
  })

  it('keeps every rider together in the same single peloton and preserves order', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const later = advanceStaticPeloton(stage, initial, STEP_SECONDS)

    expect(later.groups).toHaveLength(1)
    expect(later.groups[0].groupId).toBe('peloton-1')
    expect(later.groups[0].active).toBe(true)
    expect(later.groups[0].riderIds).toEqual(initial.groups[0].riderIds)
    expect(later.riderSnapshots.map((snapshot) => snapshot.riderId)).toEqual(
      initial.riderSnapshots.map((snapshot) => snapshot.riderId),
    )
    expect(
      later.riderSnapshots.every(
        (snapshot) => snapshot.currentGroupId === 'peloton-1',
      ),
    ).toBe(true)
    expect(
      later.riderSnapshots.every(
        (snapshot) => snapshot.distanceKm === later.groups[0].distanceKm,
      ),
    ).toBe(true)
  })

  it('does not lose or duplicate riders', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const later = advanceStaticPeloton(stage, initial, STEP_SECONDS)

    const groupRiderIds = later.groups[0].riderIds
    const snapshotRiderIds = later.riderSnapshots.map(
      (snapshot) => snapshot.riderId,
    )

    expect(groupRiderIds).toHaveLength(riders.length)
    expect(snapshotRiderIds).toHaveLength(riders.length)
    expect(new Set(groupRiderIds).size).toBe(riders.length)
    expect(new Set(snapshotRiderIds).size).toBe(riders.length)
    expect(snapshotRiderIds).toEqual(groupRiderIds)
  })

  it('preserves rider and group speeds during static progression', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const later = advanceStaticPeloton(stage, initial, STEP_SECONDS)

    expect(later.groups[0].speedKmh).toBe(initial.groups[0].speedKmh)
    expect(later.riderSnapshots.map((snapshot) => snapshot.speedKmh)).toEqual(
      initial.riderSnapshots.map((snapshot) => snapshot.speedKmh),
    )
  })

  it('clamps the peloton and every rider at the stage distance', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const later = advanceStaticPeloton(stage, initial, 60_000)

    expect(later.currentKm).toBe(stage.distanceKm)
    expect(later.groups[0].distanceKm).toBe(stage.distanceKm)
    expect(
      later.riderSnapshots.every(
        (snapshot) => snapshot.distanceKm === stage.distanceKm,
      ),
    ).toBe(true)
  })

  it('does not mutate the source checkpoint', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const sourceBefore = JSON.stringify(initial)

    advanceStaticPeloton(stage, initial, STEP_SECONDS)

    expect(JSON.stringify(initial)).toBe(sourceBefore)
  })

  it('rejects invalid elapsed time values', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)

    expect(() => advanceStaticPeloton(stage, initial, 0)).toThrow(
      'elapsedSeconds must be a positive finite number',
    )
    expect(() => advanceStaticPeloton(stage, initial, Number.NaN)).toThrow(
      'elapsedSeconds must be a positive finite number',
    )
  })
})
