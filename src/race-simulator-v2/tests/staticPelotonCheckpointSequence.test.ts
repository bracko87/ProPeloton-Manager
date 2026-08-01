/**
 * staticPelotonCheckpointSequence.test.ts
 *
 * Focused tests for a deterministic sequence of peloton-only checkpoints.
 */

import { describe, expect, it } from 'vitest'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import { createStaticPelotonCheckpointSequence } from '../core/staticPelotonCheckpointSequence'
import { flatStageFixture } from '../fixtures/flatStage1'

const CHECKPOINT_COUNT = 6
const INTERVAL_SECONDS = 600

function createSequence() {
  const { config, stage, riders } = flatStageFixture
  const initial = createInitialCheckpoint(config, stage, riders)

  return createStaticPelotonCheckpointSequence(stage, initial, {
    checkpointCount: CHECKPOINT_COUNT,
    intervalSeconds: INTERVAL_SECONDS,
  })
}

describe('createStaticPelotonCheckpointSequence', () => {
  it('produces an identical checkpoint collection for identical input', () => {
    expect(createSequence()).toEqual(createSequence())
  })

  it('returns the requested number of checkpoints before the finish', () => {
    const checkpoints = createSequence()

    expect(checkpoints).toHaveLength(CHECKPOINT_COUNT)
  })

  it('uses contiguous checkpoint indexes', () => {
    const checkpoints = createSequence()

    expect(checkpoints.map((checkpoint) => checkpoint.checkpointIndex)).toEqual([
      0,
      1,
      2,
      3,
      4,
      5,
    ])
  })

  it('increases race time by the fixed interval', () => {
    const checkpoints = createSequence()

    expect(checkpoints.map((checkpoint) => checkpoint.raceSecond)).toEqual([
      0,
      600,
      1200,
      1800,
      2400,
      3000,
    ])
  })

  it('never moves distance backwards or beyond the stage distance', () => {
    const { stage } = flatStageFixture
    const checkpoints = createSequence()

    for (let index = 1; index < checkpoints.length; index += 1) {
      expect(checkpoints[index].currentKm).toBeGreaterThan(
        checkpoints[index - 1].currentKm,
      )
    }

    expect(checkpoints[checkpoints.length - 1].currentKm).toBeLessThanOrEqual(
      stage.distanceKm,
    )
  })

  it('keeps all riders in one peloton with stable membership and order', () => {
    const checkpoints = createSequence()
    const expectedRiderIds = checkpoints[0].groups[0].riderIds

    for (const checkpoint of checkpoints) {
      expect(checkpoint.groups).toHaveLength(1)
      expect(checkpoint.groups[0].groupId).toBe('peloton-1')
      expect(checkpoint.groups[0].riderIds).toEqual(expectedRiderIds)
      expect(
        checkpoint.riderSnapshots.map((snapshot) => snapshot.riderId),
      ).toEqual(expectedRiderIds)
      expect(
        checkpoint.riderSnapshots.every(
          (snapshot) =>
            snapshot.currentGroupId === 'peloton-1' &&
            snapshot.distanceKm === checkpoint.currentKm,
        ),
      ).toBe(true)
    }
  })

  it('stops after the finish instead of adding duplicate finish checkpoints', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const checkpoints = createStaticPelotonCheckpointSequence(stage, initial, {
      checkpointCount: 20,
      intervalSeconds: 3600,
    })

    expect(checkpoints[checkpoints.length - 1].currentKm).toBe(stage.distanceKm)
    expect(
      checkpoints.filter((checkpoint) => checkpoint.currentKm === stage.distanceKm),
    ).toHaveLength(1)
  })

  it('does not mutate the supplied initial checkpoint', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)
    const sourceBefore = JSON.stringify(initial)

    const checkpoints = createStaticPelotonCheckpointSequence(stage, initial, {
      checkpointCount: CHECKPOINT_COUNT,
      intervalSeconds: INTERVAL_SECONDS,
    })

    expect(JSON.stringify(initial)).toBe(sourceBefore)
    expect(checkpoints[0]).not.toBe(initial)
    expect(checkpoints[0]).toEqual(initial)
  })

  it('rejects invalid sequence options', () => {
    const { config, stage, riders } = flatStageFixture
    const initial = createInitialCheckpoint(config, stage, riders)

    expect(() =>
      createStaticPelotonCheckpointSequence(stage, initial, {
        checkpointCount: 1,
        intervalSeconds: INTERVAL_SECONDS,
      }),
    ).toThrow('checkpointCount must be an integer of at least 2')

    expect(() =>
      createStaticPelotonCheckpointSequence(stage, initial, {
        checkpointCount: CHECKPOINT_COUNT,
        intervalSeconds: 0,
      }),
    ).toThrow('intervalSeconds must be a positive finite number')
  })
})
