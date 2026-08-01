/**
 * initialCheckpoint.test.ts
 *
 * Deterministic tests for the initial checkpoint function using Vitest.
 *
 * Purpose:
 * - Ensure identical seeds produce identical checkpoints.
 * - Ensure different seeds produce different checkpoints (sanity check).
 */

import { describe, it, expect } from 'vitest'
import { flatStageFixture } from '../fixtures/flatStage1'
import { createInitialCheckpoint } from '../core/initialCheckpoint'

describe('createInitialCheckpoint - deterministic behaviour', () => {
  it('produces identical checkpoints for the same seed', () => {
    const { config, stage, riders } = flatStageFixture

    const cp1 = createInitialCheckpoint(config, stage, riders)
    const cp2 = createInitialCheckpoint(config, stage, riders)

    // Deep equality assertion
    expect(cp1).toEqual(cp2)
  })

  it('produces different checkpoints for different seeds', () => {
    const { stage, riders } = flatStageFixture

    const configA = { seed: 'seed-alpha' }
    const configB = { seed: 'seed-bravo' }

    const cpA = createInitialCheckpoint(configA, stage, riders)
    const cpB = createInitialCheckpoint(configB, stage, riders)

    // It's extremely likely they differ; assert that either group speed or a rider speed differs.
    const groupSpeedA = cpA.groups[0].speedKmh
    const groupSpeedB = cpB.groups[0].speedKmh

    // The test allows for coincidental equality, but fails if identical.
    expect(groupSpeedA === groupSpeedB).toBe(false)
  })
})