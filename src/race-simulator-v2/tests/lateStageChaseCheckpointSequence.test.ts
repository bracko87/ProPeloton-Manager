/**
 * lateStageChaseCheckpointSequence.test.ts
 *
 * Focused tests for deterministic B1.8 late-stage peloton chasing.
 */

import { describe, expect, it } from 'vitest'
import { createControlledAttackCheckpointSequence } from '../core/controlledAttackCheckpointSequence'
import { createCooperativeGroupMovementCheckpointSequence } from '../core/cooperativeGroupMovementCheckpointSequence'
import { createEnergyCheckpointSequence } from '../core/energyCheckpointSequence'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import { createLateStageChaseCheckpointSequence } from '../core/lateStageChaseCheckpointSequence'
import { calculateLateStagePelotonChase } from '../core/lateStagePelotonChase'
import { createSeparateGroupMovementCheckpointSequence } from '../core/separateGroupMovementCheckpointSequence'
import { createStaticPelotonCheckpointSequence } from '../core/staticPelotonCheckpointSequence'
import { flatStageFixture } from '../fixtures/flatStage1'
import { Checkpoint } from '../types/checkpoint'

const CHECKPOINT_COUNT = 7
const INTERVAL_SECONDS = 600

function createB17Sequence(): Checkpoint[] {
  const {
    config,
    stage,
    riders,
    controlledAttack,
    separateGroupMovement,
    groupCooperation,
    energyModel,
  } = flatStageFixture
  const initial = createInitialCheckpoint(config, stage, riders)
  const pelotonOnly = createStaticPelotonCheckpointSequence(stage, initial, {
    checkpointCount: CHECKPOINT_COUNT,
    intervalSeconds: INTERVAL_SECONDS,
  })
  const attacked = createControlledAttackCheckpointSequence(
    pelotonOnly,
    controlledAttack,
  )
  const separated = createSeparateGroupMovementCheckpointSequence(
    stage,
    attacked,
    separateGroupMovement,
  )
  const cooperative = createCooperativeGroupMovementCheckpointSequence(
    stage,
    separated,
    groupCooperation,
  )

  return createEnergyCheckpointSequence(cooperative, riders, energyModel)
}

function createB18Sequence(): Checkpoint[] {
  return createLateStageChaseCheckpointSequence(
    flatStageFixture.stage,
    createB17Sequence(),
    flatStageFixture.riders,
    flatStageFixture.lateStageChase,
  )
}

function getGroup(checkpoint: Checkpoint, groupId: string) {
  const group = checkpoint.groups.find((candidate) => candidate.groupId === groupId)

  if (!group) throw new Error(`Missing test group: ${groupId}`)

  return group
}

function getRider(checkpoint: Checkpoint, riderId: string) {
  const rider = checkpoint.riderSnapshots.find(
    (candidate) => candidate.riderId === riderId,
  )

  if (!rider) throw new Error(`Missing test rider: ${riderId}`)

  return rider
}

describe('B1.8 late-stage peloton chase', () => {
  it('produces an identical checkpoint collection for identical input', () => {
    expect(createB18Sequence()).toEqual(createB18Sequence())
  })

  it('does not activate the chase before the configured final thirty percent', () => {
    const result = calculateLateStagePelotonChase({
      stageDistanceKm: 100,
      currentKm: 69.9,
      breakawayAhead: true,
      pelotonBaseSpeedKmh: 44,
      chaseStartProgress: 0.7,
      pelotonChaseSpeedBonusKmh: 0.8,
    })

    expect(result.chaseActive).toBe(false)
    expect(result.chaseSpeedBonusKmh).toBe(0)
    expect(result.effectiveSpeedKmh).toBe(44)
  })

  it('activates the chase at the configured late-stage threshold', () => {
    const result = calculateLateStagePelotonChase({
      stageDistanceKm: 100,
      currentKm: 70,
      breakawayAhead: true,
      pelotonBaseSpeedKmh: 44,
      chaseStartProgress: 0.7,
      pelotonChaseSpeedBonusKmh: 0.8,
    })

    expect(result.chaseActive).toBe(true)
    expect(result.stageProgress).toBe(0.7)
    expect(result.chaseSpeedBonusKmh).toBe(0.8)
    expect(result.effectiveSpeedKmh).toBe(44.8)
  })

  it('does not chase when no breakaway remains ahead', () => {
    const result = calculateLateStagePelotonChase({
      stageDistanceKm: 100,
      currentKm: 80,
      breakawayAhead: false,
      pelotonBaseSpeedKmh: 44,
      chaseStartProgress: 0.7,
      pelotonChaseSpeedBonusKmh: 0.8,
    })

    expect(result.chaseActive).toBe(false)
    expect(result.effectiveSpeedKmh).toBe(44)
  })

  it('preserves every checkpoint before chase activation', () => {
    const source = createB17Sequence()
    const chase = createB18Sequence()

    expect(chase.slice(0, 5)).toEqual(source.slice(0, 5))
  })

  it('activates at deterministic checkpoint index five once the leader passes seventy percent', () => {
    const checkpoints = createB18Sequence()
    const activation = checkpoints[5]
    const peloton = getGroup(activation, 'peloton-1')

    expect(activation.currentKm).toBe(36.853165)
    expect(activation.currentKm / flatStageFixture.stage.distanceKm).toBeGreaterThanOrEqual(
      flatStageFixture.lateStageChase.chaseStartProgress,
    )
    expect(peloton.chaseActive).toBe(true)
    expect(peloton.gapSecondsToLeader).toBe(11.216)
  })

  it('increases only peloton speed by the configured chase bonus', () => {
    const source = createB17Sequence()[5]
    const activation = createB18Sequence()[5]
    const sourceBreakaway = getGroup(source, 'breakaway-1')
    const sourcePeloton = getGroup(source, 'peloton-1')
    const chaseBreakaway = getGroup(activation, 'breakaway-1')
    const chasePeloton = getGroup(activation, 'peloton-1')

    expect(chaseBreakaway.speedKmh).toBe(sourceBreakaway.speedKmh)
    expect(chasePeloton.baseSpeedBeforeChaseKmh).toBe(sourcePeloton.speedKmh)
    expect(chasePeloton.chaseSpeedBonusKmh).toBe(0.8)
    expect(chasePeloton.speedKmh).toBe(sourcePeloton.speedKmh + 0.8)
  })

  it('does not create an artificial distance change at the activation checkpoint', () => {
    const source = createB17Sequence()[5]
    const activation = createB18Sequence()[5]

    expect(getGroup(activation, 'breakaway-1').distanceKm).toBe(
      getGroup(source, 'breakaway-1').distanceKm,
    )
    expect(getGroup(activation, 'peloton-1').distanceKm).toBe(
      getGroup(source, 'peloton-1').distanceKm,
    )
    expect(getGroup(activation, 'peloton-1').gapSecondsToLeader).toBe(
      getGroup(source, 'peloton-1').gapSecondsToLeader,
    )
  })

  it('closes the gap at the next checkpoint without catching the breakaway', () => {
    const checkpoints = createB18Sequence()
    const activationGap = getGroup(checkpoints[5], 'peloton-1').gapSecondsToLeader
    const laterGap = getGroup(checkpoints[6], 'peloton-1').gapSecondsToLeader

    expect(activationGap).toBe(11.216)
    expect(laterGap).toBe(5.984)
    expect(laterGap).toBeGreaterThan(0)
    expect(laterGap).toBeLessThan(activationGap)
    expect(getGroup(checkpoints[6], 'breakaway-1').distanceKm).toBeGreaterThan(
      getGroup(checkpoints[6], 'peloton-1').distanceKm,
    )
  })

  it('charges chase energy only to peloton riders at activation', () => {
    const activation = createB18Sequence()[5]

    for (const rider of activation.riderSnapshots) {
      expect(rider.chaseEnergyCost).toBe(
        rider.currentGroupId === 'peloton-1'
          ? flatStageFixture.lateStageChase.chaseEnergyCost
          : 0,
      )
    }
  })

  it('subtracts exactly the configured chase cost at activation', () => {
    const source = createB17Sequence()[5]
    const activation = createB18Sequence()[5]

    for (const rider of activation.riderSnapshots.filter(
      (candidate) => candidate.currentGroupId === 'peloton-1',
    )) {
      const sourceRider = getRider(source, rider.riderId)

      expect(sourceRider.energy - rider.energy).toBeCloseTo(
        flatStageFixture.lateStageChase.chaseEnergyCost,
        9,
      )
      expect(rider.energyCostSincePreviousCheckpoint).toBeCloseTo(
        sourceRider.energyCostSincePreviousCheckpoint +
          flatStageFixture.lateStageChase.chaseEnergyCost,
        9,
      )
    }
  })

  it('continues charging chase effort and normal movement at the next checkpoint', () => {
    const later = createB18Sequence()[6]

    for (const rider of later.riderSnapshots) {
      expect(rider.movementEnergyCost).toBeGreaterThan(0)

      if (rider.currentGroupId === 'peloton-1') {
        expect(rider.chaseEnergyCost).toBe(2.5)
        expect(rider.energyCostSincePreviousCheckpoint).toBeCloseTo(
          rider.movementEnergyCost + 2.5,
          9,
        )
      } else {
        expect(rider.chaseEnergyCost).toBe(0)
        expect(rider.energyCostSincePreviousCheckpoint).toBe(
          rider.movementEnergyCost,
        )
      }
    }
  })

  it('keeps rider distance and speed aligned with the current chase group', () => {
    for (const checkpoint of createB18Sequence().slice(5)) {
      for (const rider of checkpoint.riderSnapshots) {
        const group = getGroup(checkpoint, rider.currentGroupId)

        expect(rider.distanceKm).toBe(group.distanceKm)
        expect(rider.speedKmh).toBe(group.speedKmh)
      }
    }
  })

  it('keeps speeds, distances and energy inside valid limits', () => {
    for (const checkpoint of createB18Sequence()) {
      expect(checkpoint.currentKm).toBeGreaterThanOrEqual(0)
      expect(checkpoint.currentKm).toBeLessThanOrEqual(
        flatStageFixture.stage.distanceKm,
      )

      for (const group of checkpoint.groups) {
        expect(group.distanceKm).toBeGreaterThanOrEqual(0)
        expect(group.distanceKm).toBeLessThanOrEqual(
          flatStageFixture.stage.distanceKm,
        )
        expect(group.speedKmh).toBeGreaterThan(0)
      }

      for (const rider of checkpoint.riderSnapshots) {
        expect(rider.energy).toBeGreaterThanOrEqual(0)
        expect(rider.energy).toBeLessThanOrEqual(rider.freshness)
      }
    }
  })

  it('preserves complete and unique rider membership', () => {
    const expectedRiderIds = flatStageFixture.riders.map((rider) => rider.riderId)

    for (const checkpoint of createB18Sequence()) {
      const snapshotRiderIds = checkpoint.riderSnapshots.map(
        (rider) => rider.riderId,
      )
      const groupedRiderIds = checkpoint.groups.flatMap((group) => group.riderIds)

      expect(snapshotRiderIds).toHaveLength(expectedRiderIds.length)
      expect(new Set(snapshotRiderIds).size).toBe(expectedRiderIds.length)
      expect(new Set(groupedRiderIds).size).toBe(expectedRiderIds.length)
      expect([...snapshotRiderIds].sort()).toEqual([...expectedRiderIds].sort())
    }
  })

  it('does not mutate the B1.7 checkpoint collection', () => {
    const source = createB17Sequence()
    const sourceBefore = JSON.stringify(source)
    const chase = createLateStageChaseCheckpointSequence(
      flatStageFixture.stage,
      source,
      flatStageFixture.riders,
      flatStageFixture.lateStageChase,
    )

    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(chase).not.toBe(source)
    expect(chase[5]).not.toBe(source[5])
  })

  it('rejects invalid chase configuration and an unreachable chase threshold', () => {
    expect(() =>
      calculateLateStagePelotonChase({
        stageDistanceKm: 100,
        currentKm: 70,
        breakawayAhead: true,
        pelotonBaseSpeedKmh: 44,
        chaseStartProgress: 1,
        pelotonChaseSpeedBonusKmh: 0.8,
      }),
    ).toThrow('chaseStartProgress must be between zero and one')

    expect(() =>
      createLateStageChaseCheckpointSequence(
        flatStageFixture.stage,
        createB17Sequence(),
        flatStageFixture.riders,
        {
          ...flatStageFixture.lateStageChase,
          chaseEnergyCost: -1,
        },
      ),
    ).toThrow('chaseEnergyCost must be a non-negative finite number')

    expect(() =>
      createLateStageChaseCheckpointSequence(
        flatStageFixture.stage,
        createB17Sequence(),
        flatStageFixture.riders,
        {
          ...flatStageFixture.lateStageChase,
          chaseStartProgress: 0.95,
        },
      ),
    ).toThrow('No checkpoint is eligible for the configured late-stage chase')
  })
})
