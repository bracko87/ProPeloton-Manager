/**
 * controlledAttackCheckpointSequence.test.ts
 *
 * Focused tests for one deterministic controlled attack.
 */

import { describe, expect, it } from 'vitest'
import { createControlledAttackCheckpointSequence } from '../core/controlledAttackCheckpointSequence'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import { createStaticPelotonCheckpointSequence } from '../core/staticPelotonCheckpointSequence'
import { flatStageFixture } from '../fixtures/flatStage1'
import { Checkpoint } from '../types/checkpoint'

const CHECKPOINT_COUNT = 6
const INTERVAL_SECONDS = 600

function createPelotonSequence(): Checkpoint[] {
  const { config, stage, riders } = flatStageFixture
  const initial = createInitialCheckpoint(config, stage, riders)

  return createStaticPelotonCheckpointSequence(stage, initial, {
    checkpointCount: CHECKPOINT_COUNT,
    intervalSeconds: INTERVAL_SECONDS,
  })
}

function createAttackSequence(): Checkpoint[] {
  return createControlledAttackCheckpointSequence(
    createPelotonSequence(),
    flatStageFixture.controlledAttack,
  )
}

describe('createControlledAttackCheckpointSequence', () => {
  it('produces an identical checkpoint collection for identical input', () => {
    expect(createAttackSequence()).toEqual(createAttackSequence())
  })

  it('creates the attack at the configured deterministic checkpoint, time and kilometre', () => {
    const checkpoints = createAttackSequence()
    const attackCheckpoint = checkpoints.find(
      (checkpoint) =>
        checkpoint.checkpointIndex ===
        flatStageFixture.controlledAttack.attackCheckpointIndex,
    )

    expect(attackCheckpoint).toBeDefined()
    expect(attackCheckpoint?.raceSecond).toBe(1800)
    expect(attackCheckpoint?.currentKm).toBe(21.806499)
  })

  it('keeps one peloton before the attack and exactly two groups from the attack onward', () => {
    const checkpoints = createAttackSequence()

    for (const checkpoint of checkpoints) {
      const expectedGroupCount =
        checkpoint.checkpointIndex <
        flatStageFixture.controlledAttack.attackCheckpointIndex
          ? 1
          : 2

      expect(checkpoint.groups).toHaveLength(expectedGroupCount)
    }
  })

  it('moves only the configured attackers into the breakaway', () => {
    const checkpoints = createAttackSequence()
    const attackCheckpoint = checkpoints.find(
      (checkpoint) =>
        checkpoint.checkpointIndex ===
        flatStageFixture.controlledAttack.attackCheckpointIndex,
    )!

    const breakaway = attackCheckpoint.groups.find(
      (group) =>
        group.groupId === flatStageFixture.controlledAttack.breakawayGroupId,
    )!
    const peloton = attackCheckpoint.groups.find(
      (group) => group.groupId === 'peloton-1',
    )!

    expect(breakaway.riderIds).toEqual(['r01', 'r06'])
    expect(peloton.riderIds).toEqual([
      'r02',
      'r03',
      'r04',
      'r05',
      'r07',
      'r08',
      'r09',
      'r10',
      'r11',
      'r12',
    ])
  })

  it('keeps every rider present exactly once after the split', () => {
    const checkpoints = createAttackSequence()
    const expectedRiderIds = createPelotonSequence()[0].groups[0].riderIds

    for (const checkpoint of checkpoints.filter(
      (value) =>
        value.checkpointIndex >=
        flatStageFixture.controlledAttack.attackCheckpointIndex,
    )) {
      const groupedRiderIds = checkpoint.groups.flatMap((group) => group.riderIds)

      expect(groupedRiderIds).toHaveLength(expectedRiderIds.length)
      expect(new Set(groupedRiderIds).size).toBe(expectedRiderIds.length)
      expect([...groupedRiderIds].sort()).toEqual([...expectedRiderIds].sort())
    }
  })

  it('keeps rider snapshot group assignments consistent with group membership', () => {
    const checkpoints = createAttackSequence()

    for (const checkpoint of checkpoints.filter(
      (value) =>
        value.checkpointIndex >=
        flatStageFixture.controlledAttack.attackCheckpointIndex,
    )) {
      const groupIdByRiderId = new Map(
        checkpoint.groups.flatMap((group) =>
          group.riderIds.map((riderId) => [riderId, group.groupId] as const),
        ),
      )

      for (const riderSnapshot of checkpoint.riderSnapshots) {
        expect(riderSnapshot.currentGroupId).toBe(
          groupIdByRiderId.get(riderSnapshot.riderId),
        )
      }
    }
  })

  it('does not introduce separate movement, speed or gaps during B1.4', () => {
    const source = createPelotonSequence()
    const attacked = createControlledAttackCheckpointSequence(
      source,
      flatStageFixture.controlledAttack,
    )

    for (let index = 0; index < attacked.length; index += 1) {
      expect(attacked[index].checkpointIndex).toBe(source[index].checkpointIndex)
      expect(attacked[index].raceSecond).toBe(source[index].raceSecond)
      expect(attacked[index].currentKm).toBe(source[index].currentKm)

      for (const group of attacked[index].groups) {
        expect(group.distanceKm).toBe(source[index].groups[0].distanceKm)
        expect(group.speedKmh).toBe(source[index].groups[0].speedKmh)
      }

      expect(
        attacked[index].riderSnapshots.map((snapshot) => ({
          riderId: snapshot.riderId,
          distanceKm: snapshot.distanceKm,
          speedKmh: snapshot.speedKmh,
        })),
      ).toEqual(
        source[index].riderSnapshots.map((snapshot) => ({
          riderId: snapshot.riderId,
          distanceKm: snapshot.distanceKm,
          speedKmh: snapshot.speedKmh,
        })),
      )
    }
  })

  it('preserves contiguous checkpoint indexes', () => {
    expect(
      createAttackSequence().map((checkpoint) => checkpoint.checkpointIndex),
    ).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('does not mutate the supplied peloton checkpoint collection', () => {
    const source = createPelotonSequence()
    const sourceBefore = JSON.stringify(source)

    const attacked = createControlledAttackCheckpointSequence(
      source,
      flatStageFixture.controlledAttack,
    )

    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(attacked).not.toBe(source)
    expect(attacked[0]).not.toBe(source[0])
  })

  it('rejects invalid attack configuration', () => {
    const source = createPelotonSequence()
    const allRiderIds = source[0].groups[0].riderIds

    expect(() =>
      createControlledAttackCheckpointSequence(source, {
        attackCheckpointIndex: 0,
        attackerRiderIds: ['r01'],
        breakawayGroupId: 'breakaway-1',
      }),
    ).toThrow('attackCheckpointIndex must reference a checkpoint after the start')

    expect(() =>
      createControlledAttackCheckpointSequence(source, {
        attackCheckpointIndex: 99,
        attackerRiderIds: ['r01'],
        breakawayGroupId: 'breakaway-1',
      }),
    ).toThrow('attackCheckpointIndex was not found in the checkpoint collection')

    expect(() =>
      createControlledAttackCheckpointSequence(source, {
        attackCheckpointIndex: 3,
        attackerRiderIds: [],
        breakawayGroupId: 'breakaway-1',
      }),
    ).toThrow('attackerRiderIds must contain at least one rider')

    expect(() =>
      createControlledAttackCheckpointSequence(source, {
        attackCheckpointIndex: 3,
        attackerRiderIds: ['r01', 'r01'],
        breakawayGroupId: 'breakaway-1',
      }),
    ).toThrow('attackerRiderIds must be unique')

    expect(() =>
      createControlledAttackCheckpointSequence(source, {
        attackCheckpointIndex: 3,
        attackerRiderIds: ['unknown-rider'],
        breakawayGroupId: 'breakaway-1',
      }),
    ).toThrow('Unknown attacker rider id: unknown-rider')

    expect(() =>
      createControlledAttackCheckpointSequence(source, {
        attackCheckpointIndex: 3,
        attackerRiderIds: allRiderIds,
        breakawayGroupId: 'breakaway-1',
      }),
    ).toThrow('At least one rider must remain in the peloton')

    expect(() =>
      createControlledAttackCheckpointSequence(source, {
        attackCheckpointIndex: 3,
        attackerRiderIds: ['r01'],
        breakawayGroupId: 'peloton-1',
      }),
    ).toThrow('breakawayGroupId must differ from the peloton group id')
  })
})
