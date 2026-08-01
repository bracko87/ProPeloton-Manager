/**
 * groupCooperationCheckpointSequence.test.ts
 *
 * Focused tests for deterministic B1.6 drafting and group cooperation.
 */

import { describe, expect, it } from 'vitest'
import { createControlledAttackCheckpointSequence } from '../core/controlledAttackCheckpointSequence'
import {
  createCooperativeGroupMovementCheckpointSequence,
} from '../core/cooperativeGroupMovementCheckpointSequence'
import {
  calculateGroupCooperationAdvantage,
} from '../core/groupCooperationAdvantage'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import { createSeparateGroupMovementCheckpointSequence } from '../core/separateGroupMovementCheckpointSequence'
import { createStaticPelotonCheckpointSequence } from '../core/staticPelotonCheckpointSequence'
import { flatStageFixture } from '../fixtures/flatStage1'
import { Checkpoint } from '../types/checkpoint'

const CHECKPOINT_COUNT = 6
const INTERVAL_SECONDS = 600

function createB15Sequence(): Checkpoint[] {
  const { config, stage, riders, controlledAttack, separateGroupMovement } =
    flatStageFixture
  const initial = createInitialCheckpoint(config, stage, riders)
  const pelotonOnly = createStaticPelotonCheckpointSequence(stage, initial, {
    checkpointCount: CHECKPOINT_COUNT,
    intervalSeconds: INTERVAL_SECONDS,
  })
  const attacked = createControlledAttackCheckpointSequence(
    pelotonOnly,
    controlledAttack,
  )

  return createSeparateGroupMovementCheckpointSequence(
    stage,
    attacked,
    separateGroupMovement,
  )
}

function createB16Sequence(): Checkpoint[] {
  return createCooperativeGroupMovementCheckpointSequence(
    flatStageFixture.stage,
    createB15Sequence(),
    flatStageFixture.groupCooperation,
  )
}

function getGroup(checkpoint: Checkpoint, groupId: string) {
  const group = checkpoint.groups.find((candidate) => candidate.groupId === groupId)

  if (!group) throw new Error(`Missing test group: ${groupId}`)

  return group
}

describe('B1.6 drafting and group cooperation', () => {
  it('produces an identical checkpoint collection for identical input', () => {
    expect(createB16Sequence()).toEqual(createB16Sequence())
  })

  it('gives a solo rider no drafting or cooperation advantage', () => {
    const solo = calculateGroupCooperationAdvantage({
      baseSpeedKmh: 44,
      riderCount: 1,
      cooperationLevel: 1,
    })

    expect(solo.draftingBonusKmh).toBe(0)
    expect(solo.cooperationBonusKmh).toBe(0)
    expect(solo.totalBonusKmh).toBe(0)
    expect(solo.effectiveSpeedKmh).toBe(44)
  })

  it('makes equally strong coordinated groups progressively faster as group size grows', () => {
    const baseSpeedKmh = 44
    const cooperationLevel = 0.9
    const solo = calculateGroupCooperationAdvantage({
      baseSpeedKmh,
      riderCount: 1,
      cooperationLevel,
    })
    const pair = calculateGroupCooperationAdvantage({
      baseSpeedKmh,
      riderCount: 2,
      cooperationLevel,
    })
    const smallGroup = calculateGroupCooperationAdvantage({
      baseSpeedKmh,
      riderCount: 4,
      cooperationLevel,
    })
    const peloton = calculateGroupCooperationAdvantage({
      baseSpeedKmh,
      riderCount: 10,
      cooperationLevel,
    })

    expect(pair.effectiveSpeedKmh).toBeGreaterThan(solo.effectiveSpeedKmh)
    expect(smallGroup.effectiveSpeedKmh).toBeGreaterThan(pair.effectiveSpeedKmh)
    expect(peloton.effectiveSpeedKmh).toBeGreaterThan(
      smallGroup.effectiveSpeedKmh,
    )
  })

  it('gives a better-organized group more cooperation benefit at equal size and strength', () => {
    const disorganized = calculateGroupCooperationAdvantage({
      baseSpeedKmh: 44,
      riderCount: 6,
      cooperationLevel: 0,
    })
    const organized = calculateGroupCooperationAdvantage({
      baseSpeedKmh: 44,
      riderCount: 6,
      cooperationLevel: 1,
    })

    expect(organized.draftingBonusKmh).toBe(disorganized.draftingBonusKmh)
    expect(organized.cooperationBonusKmh).toBeGreaterThan(
      disorganized.cooperationBonusKmh,
    )
    expect(organized.effectiveSpeedKmh).toBeGreaterThan(
      disorganized.effectiveSpeedKmh,
    )
  })

  it('preserves all checkpoints before the controlled attack', () => {
    const source = createB15Sequence()
    const cooperative = createCooperativeGroupMovementCheckpointSequence(
      flatStageFixture.stage,
      source,
      flatStageFixture.groupCooperation,
    )

    expect(cooperative.slice(0, 3)).toEqual(source.slice(0, 3))
  })

  it('applies deterministic group advantages at the split without an immediate gap', () => {
    const split = createB16Sequence()[3]
    const breakaway = getGroup(split, 'breakaway-1')
    const peloton = getGroup(split, 'peloton-1')

    expect(breakaway.baseSpeedBeforeGroupAdvantageKmh).toBe(44.813)
    expect(peloton.baseSpeedBeforeGroupAdvantageKmh).toBe(43.213)
    expect(breakaway.speedKmh).toBe(45.14)
    expect(peloton.speedKmh).toBe(44.722)
    expect(breakaway.totalGroupAdvantageKmh).toBe(0.327)
    expect(peloton.totalGroupAdvantageKmh).toBe(1.509)
    expect(breakaway.gapSecondsToLeader).toBe(0)
    expect(peloton.gapSecondsToLeader).toBe(0)
  })

  it('reduces the raw attack speed advantage while preserving a temporary breakaway lead', () => {
    const b15Split = createB15Sequence()[3]
    const b16Split = createB16Sequence()[3]
    const b15Difference =
      getGroup(b15Split, 'breakaway-1').speedKmh -
      getGroup(b15Split, 'peloton-1').speedKmh
    const b16Difference =
      getGroup(b16Split, 'breakaway-1').speedKmh -
      getGroup(b16Split, 'peloton-1').speedKmh

    expect(b16Difference).toBeGreaterThan(0)
    expect(b16Difference).toBeLessThan(b15Difference)
  })

  it('moves both groups with their cooperation-adjusted speeds and creates a changing gap', () => {
    const checkpoints = createB16Sequence()
    const checkpointFiveBreakaway = getGroup(checkpoints[4], 'breakaway-1')
    const checkpointFivePeloton = getGroup(checkpoints[4], 'peloton-1')
    const checkpointSixPeloton = getGroup(checkpoints[5], 'peloton-1')

    expect(checkpointFiveBreakaway.distanceKm).toBeGreaterThan(
      checkpointFivePeloton.distanceKm,
    )
    expect(checkpointFivePeloton.gapSecondsToLeader).toBeGreaterThan(0)
    expect(checkpointSixPeloton.gapSecondsToLeader).toBeGreaterThan(
      checkpointFivePeloton.gapSecondsToLeader,
    )
  })

  it('creates a smaller gap than B1.5 because the organized peloton gains more group benefit', () => {
    const b15 = createB15Sequence()
    const b16 = createB16Sequence()

    expect(getGroup(b16[4], 'peloton-1').gapSecondsToLeader).toBeLessThan(
      getGroup(b15[4], 'peloton-1').gapSecondsToLeader,
    )
    expect(getGroup(b16[5], 'peloton-1').gapSecondsToLeader).toBeLessThan(
      getGroup(b15[5], 'peloton-1').gapSecondsToLeader,
    )
  })

  it('keeps rider distance and speed aligned with each rider current group', () => {
    for (const checkpoint of createB16Sequence().slice(3)) {
      for (const riderSnapshot of checkpoint.riderSnapshots) {
        const group = getGroup(checkpoint, riderSnapshot.currentGroupId)

        expect(riderSnapshot.distanceKm).toBe(group.distanceKm)
        expect(riderSnapshot.speedKmh).toBe(group.speedKmh)
      }
    }
  })

  it('preserves complete and unique rider membership', () => {
    const expectedRiderIds = createB15Sequence()[0].riderSnapshots.map(
      (riderSnapshot) => riderSnapshot.riderId,
    )

    for (const checkpoint of createB16Sequence()) {
      const groupedRiderIds = checkpoint.groups.flatMap((group) => group.riderIds)

      expect(groupedRiderIds).toHaveLength(expectedRiderIds.length)
      expect(new Set(groupedRiderIds).size).toBe(expectedRiderIds.length)
      expect([...groupedRiderIds].sort()).toEqual([...expectedRiderIds].sort())
    }
  })

  it('does not mutate the B1.5 checkpoint collection', () => {
    const source = createB15Sequence()
    const sourceBefore = JSON.stringify(source)

    const cooperative = createCooperativeGroupMovementCheckpointSequence(
      flatStageFixture.stage,
      source,
      flatStageFixture.groupCooperation,
    )

    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(cooperative).not.toBe(source)
    expect(cooperative[3]).not.toBe(source[3])
  })

  it('rejects invalid advantage and sequence configuration', () => {
    expect(() =>
      calculateGroupCooperationAdvantage({
        baseSpeedKmh: 44,
        riderCount: 0,
        cooperationLevel: 0.8,
      }),
    ).toThrow('riderCount must be a positive integer')

    expect(() =>
      calculateGroupCooperationAdvantage({
        baseSpeedKmh: 44,
        riderCount: 4,
        cooperationLevel: 1.1,
      }),
    ).toThrow('cooperationLevel must be between 0 and 1')

    expect(() =>
      createCooperativeGroupMovementCheckpointSequence(
        flatStageFixture.stage,
        createB15Sequence(),
        {
          ...flatStageFixture.groupCooperation,
          splitCheckpointIndex: 99,
        },
      ),
    ).toThrow('splitCheckpointIndex was not found in the checkpoint collection')

    expect(() =>
      createCooperativeGroupMovementCheckpointSequence(
        flatStageFixture.stage,
        createB15Sequence(),
        {
          ...flatStageFixture.groupCooperation,
          cooperationLevelByGroupId: {
            'breakaway-1': 0.65,
          },
        },
      ),
    ).toThrow('Missing cooperation level for group: peloton-1')
  })
})
