/**
 * separateGroupMovementCheckpointSequence.test.ts
 *
 * Focused tests for deterministic B1.5 breakaway and peloton movement.
 */

import { describe, expect, it } from 'vitest'
import { createControlledAttackCheckpointSequence } from '../core/controlledAttackCheckpointSequence'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import {
  createSeparateGroupMovementCheckpointSequence,
  MAXIMUM_GROUP_SPEED_KMH,
  MINIMUM_GROUP_SPEED_KMH,
} from '../core/separateGroupMovementCheckpointSequence'
import { createStaticPelotonCheckpointSequence } from '../core/staticPelotonCheckpointSequence'
import { flatStageFixture } from '../fixtures/flatStage1'
import { Checkpoint } from '../types/checkpoint'

const CHECKPOINT_COUNT = 6
const INTERVAL_SECONDS = 600

function createAttackSequence(): Checkpoint[] {
  const { config, stage, riders, controlledAttack } = flatStageFixture
  const initial = createInitialCheckpoint(config, stage, riders)
  const pelotonOnly = createStaticPelotonCheckpointSequence(stage, initial, {
    checkpointCount: CHECKPOINT_COUNT,
    intervalSeconds: INTERVAL_SECONDS,
  })

  return createControlledAttackCheckpointSequence(
    pelotonOnly,
    controlledAttack,
  )
}

function createMovementSequence(): Checkpoint[] {
  return createSeparateGroupMovementCheckpointSequence(
    flatStageFixture.stage,
    createAttackSequence(),
    flatStageFixture.separateGroupMovement,
  )
}

function getGroup(checkpoint: Checkpoint, groupId: string) {
  const group = checkpoint.groups.find((candidate) => candidate.groupId === groupId)

  if (!group) throw new Error(`Missing test group: ${groupId}`)

  return group
}

describe('createSeparateGroupMovementCheckpointSequence', () => {
  it('produces an identical checkpoint collection for identical input', () => {
    expect(createMovementSequence()).toEqual(createMovementSequence())
  })

  it('preserves the peloton-only checkpoints before the attack', () => {
    const source = createAttackSequence()
    const moved = createSeparateGroupMovementCheckpointSequence(
      flatStageFixture.stage,
      source,
      flatStageFixture.separateGroupMovement,
    )

    expect(moved.slice(0, 3)).toEqual(source.slice(0, 3))
  })

  it('assigns distinct deterministic speeds at the split without an immediate gap', () => {
    const splitCheckpoint = createMovementSequence()[3]
    const breakaway = getGroup(splitCheckpoint, 'breakaway-1')
    const peloton = getGroup(splitCheckpoint, 'peloton-1')

    expect(breakaway.distanceKm).toBe(peloton.distanceKm)
    expect(breakaway.speedKmh).toBe(44.813)
    expect(peloton.speedKmh).toBe(43.213)
    expect(breakaway.gapSecondsToLeader).toBe(0)
    expect(peloton.gapSecondsToLeader).toBe(0)
  })

  it('moves the breakaway and peloton independently after the split', () => {
    const checkpoints = createMovementSequence()

    for (const checkpoint of checkpoints.slice(4)) {
      const breakaway = getGroup(checkpoint, 'breakaway-1')
      const peloton = getGroup(checkpoint, 'peloton-1')

      expect(breakaway.distanceKm).toBeGreaterThan(peloton.distanceKm)
      expect(breakaway.speedKmh).toBeGreaterThan(peloton.speedKmh)
    }
  })

  it('creates a deterministic time gap that changes between later checkpoints', () => {
    const checkpoints = createMovementSequence()
    const checkpointFivePeloton = getGroup(checkpoints[4], 'peloton-1')
    const checkpointSixPeloton = getGroup(checkpoints[5], 'peloton-1')

    expect(checkpointFivePeloton.gapSecondsToLeader).toBeGreaterThan(0)
    expect(checkpointSixPeloton.gapSecondsToLeader).toBeGreaterThan(
      checkpointFivePeloton.gapSecondsToLeader,
    )
  })

  it('calculates the gap from physical distance using the trailing group speed', () => {
    const checkpoint = createMovementSequence()[4]
    const breakaway = getGroup(checkpoint, 'breakaway-1')
    const peloton = getGroup(checkpoint, 'peloton-1')
    const expectedGapSeconds =
      ((breakaway.distanceKm - peloton.distanceKm) / peloton.speedKmh) * 3600

    expect(peloton.gapSecondsToLeader).toBe(
      Math.round(expectedGapSeconds * 1000) / 1000,
    )
    expect(breakaway.gapSecondsToLeader).toBe(0)
  })

  it('uses the leading group distance as checkpoint currentKm', () => {
    for (const checkpoint of createMovementSequence().slice(3)) {
      const leaderDistanceKm = Math.max(
        ...checkpoint.groups.map((group) => group.distanceKm),
      )

      expect(checkpoint.currentKm).toBe(leaderDistanceKm)
    }
  })

  it('keeps group speeds and distances inside valid limits', () => {
    const checkpoints = createMovementSequence()

    for (let checkpointIndex = 0; checkpointIndex < checkpoints.length; checkpointIndex += 1) {
      const checkpoint = checkpoints[checkpointIndex]

      for (const group of checkpoint.groups) {
        expect(group.speedKmh).toBeGreaterThanOrEqual(MINIMUM_GROUP_SPEED_KMH)
        expect(group.speedKmh).toBeLessThanOrEqual(MAXIMUM_GROUP_SPEED_KMH)
        expect(group.distanceKm).toBeGreaterThanOrEqual(0)
        expect(group.distanceKm).toBeLessThanOrEqual(flatStageFixture.stage.distanceKm)

        if (checkpointIndex > 0) {
          const previousGroup = checkpoints[checkpointIndex - 1].groups.find(
            (candidate) => candidate.groupId === group.groupId,
          )

          if (previousGroup) {
            expect(group.distanceKm).toBeGreaterThanOrEqual(previousGroup.distanceKm)
          }
        }
      }
    }
  })

  it('keeps rider distances and speeds aligned with their current group', () => {
    for (const checkpoint of createMovementSequence().slice(3)) {
      for (const riderSnapshot of checkpoint.riderSnapshots) {
        const group = getGroup(checkpoint, riderSnapshot.currentGroupId)

        expect(riderSnapshot.distanceKm).toBe(group.distanceKm)
        expect(riderSnapshot.speedKmh).toBe(group.speedKmh)
      }
    }
  })

  it('preserves complete and unique rider membership', () => {
    const expectedRiderIds = createAttackSequence()[0].riderSnapshots.map(
      (riderSnapshot) => riderSnapshot.riderId,
    )

    for (const checkpoint of createMovementSequence()) {
      const groupedRiderIds = checkpoint.groups.flatMap((group) => group.riderIds)

      expect(groupedRiderIds).toHaveLength(expectedRiderIds.length)
      expect(new Set(groupedRiderIds).size).toBe(expectedRiderIds.length)
      expect([...groupedRiderIds].sort()).toEqual([...expectedRiderIds].sort())
    }
  })

  it('does not mutate the controlled attack checkpoint collection', () => {
    const source = createAttackSequence()
    const sourceBefore = JSON.stringify(source)

    const moved = createSeparateGroupMovementCheckpointSequence(
      flatStageFixture.stage,
      source,
      flatStageFixture.separateGroupMovement,
    )

    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(moved).not.toBe(source)
    expect(moved[3]).not.toBe(source[3])
  })

  it('rejects invalid movement configuration', () => {
    const source = createAttackSequence()
    const valid = flatStageFixture.separateGroupMovement

    expect(() =>
      createSeparateGroupMovementCheckpointSequence(
        flatStageFixture.stage,
        source,
        {
          ...valid,
          splitCheckpointIndex: 99,
        },
      ),
    ).toThrow('splitCheckpointIndex was not found in the checkpoint collection')

    expect(() =>
      createSeparateGroupMovementCheckpointSequence(
        flatStageFixture.stage,
        source,
        {
          ...valid,
          pelotonGroupId: valid.breakawayGroupId,
        },
      ),
    ).toThrow('Breakaway and peloton group ids must differ')

    expect(() =>
      createSeparateGroupMovementCheckpointSequence(
        flatStageFixture.stage,
        source,
        {
          ...valid,
          pelotonSpeedOffsetKmh: valid.breakawaySpeedOffsetKmh,
        },
      ),
    ).toThrow('Group speed offsets must create distinct speeds')

    expect(() =>
      createSeparateGroupMovementCheckpointSequence(
        flatStageFixture.stage,
        source,
        {
          ...valid,
          breakawaySpeedOffsetKmh: 100,
        },
      ),
    ).toThrow('Derived group speed must remain between 20 and 70 km/h')
  })
})
