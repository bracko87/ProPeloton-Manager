/**
 * energyCheckpointSequence.test.ts
 *
 * Focused tests for deterministic B1.7 live energy and attack costs.
 */

import { describe, expect, it } from 'vitest'
import { createControlledAttackCheckpointSequence } from '../core/controlledAttackCheckpointSequence'
import { createCooperativeGroupMovementCheckpointSequence } from '../core/cooperativeGroupMovementCheckpointSequence'
import { createEnergyCheckpointSequence } from '../core/energyCheckpointSequence'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import {
  ATTACK_ENERGY_COST,
  calculateRiderEnergyStep,
  calculateShelterSavingPercent,
} from '../core/riderEnergy'
import { createSeparateGroupMovementCheckpointSequence } from '../core/separateGroupMovementCheckpointSequence'
import { createStaticPelotonCheckpointSequence } from '../core/staticPelotonCheckpointSequence'
import { flatStageFixture } from '../fixtures/flatStage1'
import { Checkpoint } from '../types/checkpoint'

const CHECKPOINT_COUNT = 6
const INTERVAL_SECONDS = 600

function createB16Sequence(): Checkpoint[] {
  const {
    config,
    stage,
    riders,
    controlledAttack,
    separateGroupMovement,
    groupCooperation,
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

  return createCooperativeGroupMovementCheckpointSequence(
    stage,
    separated,
    groupCooperation,
  )
}

function createB17Sequence(): Checkpoint[] {
  return createEnergyCheckpointSequence(
    createB16Sequence(),
    flatStageFixture.riders,
    flatStageFixture.energyModel,
  )
}

function getRider(checkpoint: Checkpoint, riderId: string) {
  const rider = checkpoint.riderSnapshots.find(
    (candidate) => candidate.riderId === riderId,
  )

  if (!rider) throw new Error(`Missing test rider: ${riderId}`)

  return rider
}

describe('B1.7 live energy and attack cost', () => {
  it('produces an identical checkpoint collection for identical input', () => {
    expect(createB17Sequence()).toEqual(createB17Sequence())
  })

  it('initializes every rider energy from controlled starting freshness', () => {
    const initial = createB17Sequence()[0]

    for (const riderInput of flatStageFixture.riders) {
      const rider = getRider(initial, riderInput.riderId)

      expect(rider.freshness).toBe(riderInput.startingFreshness)
      expect(rider.energy).toBe(riderInput.startingFreshness)
      expect(rider.energyCostSincePreviousCheckpoint).toBe(0)
      expect(rider.attackEnergyCost).toBe(0)
    }
  })

  it('reduces live energy through normal movement at every later checkpoint', () => {
    const checkpoints = createB17Sequence()

    for (const riderInput of flatStageFixture.riders) {
      let previousEnergy = getRider(checkpoints[0], riderInput.riderId).energy

      for (const checkpoint of checkpoints.slice(1)) {
        const rider = getRider(checkpoint, riderInput.riderId)

        expect(rider.energy).toBeLessThan(previousEnergy)
        expect(rider.movementEnergyCost).toBeGreaterThan(0)
        previousEnergy = rider.energy
      }
    }
  })

  it('charges the additional attack cost only to configured attackers at the attack checkpoint', () => {
    const attackCheckpoint = createB17Sequence()[3]
    const attackerIds = new Set<string>(flatStageFixture.energyModel.attackerRiderIds)

    for (const rider of attackCheckpoint.riderSnapshots) {
      expect(rider.attackEnergyCost).toBe(
        attackerIds.has(rider.riderId) ? ATTACK_ENERGY_COST : 0,
      )
    }
  })

  it('subtracts exactly the configured extra attack cost from each attacker', () => {
    const source = createB16Sequence()
    const withAttack = createEnergyCheckpointSequence(
      source,
      flatStageFixture.riders,
      flatStageFixture.energyModel,
    )
    const withoutAttack = createEnergyCheckpointSequence(
      source,
      flatStageFixture.riders,
      {
        ...flatStageFixture.energyModel,
        attackEnergyCost: 0,
      },
    )

    for (const attackerId of flatStageFixture.energyModel.attackerRiderIds) {
      expect(
        getRider(withoutAttack[3], attackerId).energy -
          getRider(withAttack[3], attackerId).energy,
      ).toBe(ATTACK_ENERGY_COST)
    }
  })

  it('combines movement and attack costs into the checkpoint energy cost', () => {
    const attacker = getRider(createB17Sequence()[3], 'r01')

    expect(attacker.energyCostSincePreviousCheckpoint).toBe(
      attacker.movementEnergyCost + attacker.attackEnergyCost,
    )
  })

  it('gives a solo rider no shelter energy saving', () => {
    expect(calculateShelterSavingPercent(1, 1)).toBe(0)
  })

  it('gives the organized peloton more shelter than the two-rider breakaway', () => {
    const breakawayShelter = calculateShelterSavingPercent(2, 0.65)
    const pelotonShelter = calculateShelterSavingPercent(10, 0.9)

    expect(breakawayShelter).toBeGreaterThan(0)
    expect(pelotonShelter).toBeGreaterThan(breakawayShelter)
  })

  it('records positive shelter savings for riders in both post-attack groups', () => {
    const attackCheckpoint = createB17Sequence()[3]

    for (const rider of attackCheckpoint.riderSnapshots) {
      expect(rider.shelterEnergySaving).toBeGreaterThan(0)
    }
  })

  it('keeps high, medium and low freshness ordered under equal conditions', () => {
    const common = {
      endurance: 70,
      speedKmh: 44,
      elapsedSeconds: 600,
      riderCount: 4,
      cooperationLevel: 0.8,
    }
    const high = calculateRiderEnergyStep({
      ...common,
      freshness: 95,
      currentEnergy: 95,
    })
    const medium = calculateRiderEnergyStep({
      ...common,
      freshness: 75,
      currentEnergy: 75,
    })
    const low = calculateRiderEnergyStep({
      ...common,
      freshness: 55,
      currentEnergy: 55,
    })

    expect(high.energyAfter).toBeGreaterThan(medium.energyAfter)
    expect(medium.energyAfter).toBeGreaterThan(low.energyAfter)
  })

  it('makes higher endurance reduce movement energy cost under equal conditions', () => {
    const common = {
      freshness: 90,
      currentEnergy: 90,
      speedKmh: 44,
      elapsedSeconds: 600,
      riderCount: 4,
      cooperationLevel: 0.8,
    }
    const lowEndurance = calculateRiderEnergyStep({
      ...common,
      endurance: 40,
    })
    const highEndurance = calculateRiderEnergyStep({
      ...common,
      endurance: 90,
    })

    expect(highEndurance.movementEnergyCost).toBeLessThan(
      lowEndurance.movementEnergyCost,
    )
    expect(highEndurance.energyAfter).toBeGreaterThan(
      lowEndurance.energyAfter,
    )
  })

  it('preserves every B1.6 movement, group and gap value', () => {
    const source = createB16Sequence()
    const energy = createB17Sequence()

    for (let index = 0; index < source.length; index += 1) {
      expect(energy[index].checkpointIndex).toBe(source[index].checkpointIndex)
      expect(energy[index].raceSecond).toBe(source[index].raceSecond)
      expect(energy[index].currentKm).toBe(source[index].currentKm)
      expect(energy[index].groups).toEqual(source[index].groups)

      for (const sourceRider of source[index].riderSnapshots) {
        const energyRider = getRider(energy[index], sourceRider.riderId)

        expect(energyRider.distanceKm).toBe(sourceRider.distanceKm)
        expect(energyRider.speedKmh).toBe(sourceRider.speedKmh)
        expect(energyRider.currentGroupId).toBe(sourceRider.currentGroupId)
      }
    }
  })

  it('keeps every energy value within zero and starting freshness', () => {
    for (const checkpoint of createB17Sequence()) {
      for (const rider of checkpoint.riderSnapshots) {
        expect(rider.energy).toBeGreaterThanOrEqual(0)
        expect(rider.energy).toBeLessThanOrEqual(rider.freshness)
        expect(rider.movementEnergyCost).toBeGreaterThanOrEqual(0)
        expect(rider.attackEnergyCost).toBeGreaterThanOrEqual(0)
        expect(rider.shelterEnergySaving).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('preserves complete and unique rider membership', () => {
    const expectedRiderIds = flatStageFixture.riders.map((rider) => rider.riderId)

    for (const checkpoint of createB17Sequence()) {
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

  it('does not mutate the B1.6 checkpoint collection', () => {
    const source = createB16Sequence()
    const sourceBefore = JSON.stringify(source)

    const energy = createEnergyCheckpointSequence(
      source,
      flatStageFixture.riders,
      flatStageFixture.energyModel,
    )

    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(energy).not.toBe(source)
    expect(energy[3]).not.toBe(source[3])
  })

  it('rejects invalid energy input and configuration', () => {
    expect(() =>
      calculateRiderEnergyStep({
        currentEnergy: 80,
        freshness: 80,
        endurance: 101,
        speedKmh: 44,
        elapsedSeconds: 600,
        riderCount: 4,
        cooperationLevel: 0.8,
      }),
    ).toThrow('endurance must be between 0 and 100')

    expect(() =>
      calculateShelterSavingPercent(0, 0.8),
    ).toThrow('riderCount must be a positive integer')

    expect(() =>
      createEnergyCheckpointSequence(
        createB16Sequence(),
        flatStageFixture.riders,
        {
          ...flatStageFixture.energyModel,
          attackCheckpointIndex: 99,
        },
      ),
    ).toThrow('attackCheckpointIndex was not found in the checkpoint collection')

    expect(() =>
      createEnergyCheckpointSequence(
        createB16Sequence(),
        flatStageFixture.riders,
        {
          ...flatStageFixture.energyModel,
          cooperationLevelByGroupId: {
            'breakaway-1': 0.65,
          },
        },
      ),
    ).toThrow('Missing energy cooperation level for group: peloton-1')
  })
})
