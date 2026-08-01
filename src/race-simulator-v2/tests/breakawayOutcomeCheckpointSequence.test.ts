/**
 * breakawayOutcomeCheckpointSequence.test.ts
 *
 * Focused B1.9 tests for deterministic breakaway catch and survival scenarios.
 */

import { describe, expect, it } from 'vitest'
import { createInitialCheckpoint } from '../core/initialCheckpoint'
import { createStaticPelotonCheckpointSequence } from '../core/staticPelotonCheckpointSequence'
import { createControlledAttackCheckpointSequence } from '../core/controlledAttackCheckpointSequence'
import { createSeparateGroupMovementCheckpointSequence } from '../core/separateGroupMovementCheckpointSequence'
import { createCooperativeGroupMovementCheckpointSequence } from '../core/cooperativeGroupMovementCheckpointSequence'
import { createEnergyCheckpointSequence } from '../core/energyCheckpointSequence'
import { createLateStageChaseCheckpointSequence } from '../core/lateStageChaseCheckpointSequence'
import {
  createBreakawayOutcomeCheckpointSequence,
  type BreakawayOutcomeCheckpointSequenceResult,
} from '../core/breakawayOutcomeCheckpointSequence'
import { flatStageFixture } from '../fixtures/flatStage1'
import type { Checkpoint } from '../types/checkpoint'

const CHECKPOINT_COUNT = 7
const INTERVAL_SECONDS = 600

function createB18Sequence(): Checkpoint[] {
  const {
    config,
    stage,
    riders,
    controlledAttack,
    separateGroupMovement,
    groupCooperation,
    energyModel,
    lateStageChase,
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
  const energy = createEnergyCheckpointSequence(cooperative, riders, energyModel)

  return createLateStageChaseCheckpointSequence(
    stage,
    energy,
    riders,
    lateStageChase,
  )
}

function createCatchResult(): BreakawayOutcomeCheckpointSequenceResult {
  return createBreakawayOutcomeCheckpointSequence(
    flatStageFixture.stage,
    createB18Sequence(),
    flatStageFixture.riders,
    flatStageFixture.breakawayCatchScenario,
  )
}

function createSurvivalResult(): BreakawayOutcomeCheckpointSequenceResult {
  return createBreakawayOutcomeCheckpointSequence(
    flatStageFixture.stage,
    createB18Sequence(),
    flatStageFixture.riders,
    flatStageFixture.breakawaySurvivalScenario,
  )
}

function getGroup(checkpoint: Checkpoint, groupId: string) {
  const group = checkpoint.groups.find((candidate) => candidate.groupId === groupId)

  if (!group) throw new Error(`Missing B1.9 test group: ${groupId}`)

  return group
}

function getRider(checkpoint: Checkpoint, riderId: string) {
  const rider = checkpoint.riderSnapshots.find(
    (candidate) => candidate.riderId === riderId,
  )

  if (!rider) throw new Error(`Missing B1.9 test rider: ${riderId}`)

  return rider
}

function expectCompleteUniqueMembership(checkpoint: Checkpoint): void {
  const expectedRiderIds = flatStageFixture.riders.map((rider) => rider.riderId)
  const snapshotRiderIds = checkpoint.riderSnapshots.map((rider) => rider.riderId)
  const groupedRiderIds = checkpoint.groups.flatMap((group) => group.riderIds)

  expect(snapshotRiderIds).toHaveLength(expectedRiderIds.length)
  expect(new Set(snapshotRiderIds).size).toBe(expectedRiderIds.length)
  expect(groupedRiderIds).toHaveLength(expectedRiderIds.length)
  expect(new Set(groupedRiderIds).size).toBe(expectedRiderIds.length)
  expect([...snapshotRiderIds].sort()).toEqual([...expectedRiderIds].sort())
  expect([...groupedRiderIds].sort()).toEqual([...expectedRiderIds].sort())
}

describe('B1.9 deterministic catch and breakaway survival', () => {
  it('produces an identical catch result for identical input', () => {
    expect(createCatchResult()).toEqual(createCatchResult())
  })

  it('produces an identical survival result for identical input', () => {
    expect(createSurvivalResult()).toEqual(createSurvivalResult())
  })

  it('preserves the complete B1.8 checkpoint prefix in both scenarios', () => {
    const source = createB18Sequence()
    const caught = createCatchResult()
    const survived = createSurvivalResult()

    expect(caught.checkpoints.slice(0, source.length)).toEqual(source)
    expect(survived.checkpoints.slice(0, source.length)).toEqual(source)
  })

  it('reports the catch outcome at deterministic checkpoint index seven', () => {
    const result = createCatchResult()

    expect(result.outcome).toBe('caught')
    expect(result.outcomeCheckpointIndex).toBe(7)
    expect(result.finishCheckpointIndex).toBe(8)
    expect(result.checkpoints).toHaveLength(9)
  })

  it('creates the catch at a deterministic race time and kilometre before the finish', () => {
    const catchCheckpoint = createCatchResult().checkpoints[7]

    expect(catchCheckpoint.raceSecond).toBeCloseTo(3830.452, 3)
    expect(catchCheckpoint.currentKm).toBeCloseTo(47.266107, 6)
    expect(catchCheckpoint.currentKm).toBeLessThan(flatStageFixture.stage.distanceKm)
  })

  it('merges the breakaway and peloton into one twelve-rider peloton at the catch', () => {
    const catchCheckpoint = createCatchResult().checkpoints[7]

    expect(catchCheckpoint.groups).toHaveLength(1)

    const peloton = getGroup(catchCheckpoint, 'peloton-1')

    expect(peloton.riderIds).toHaveLength(12)
    expect(peloton.gapSecondsToLeader).toBe(0)
    expect(peloton.chaseActive).toBe(false)
    expect(peloton.speedKmh).toBe(44.791)

    for (const rider of catchCheckpoint.riderSnapshots) {
      expect(rider.currentGroupId).toBe('peloton-1')
      expect(rider.distanceKm).toBe(peloton.distanceKm)
      expect(rider.speedKmh).toBe(peloton.speedKmh)
    }
  })

  it('preserves every rider exactly once when the catch merges the groups', () => {
    expectCompleteUniqueMembership(createCatchResult().checkpoints[7])
  })

  it('charges chase energy only to riders who were in the peloton before the catch', () => {
    const source = createB18Sequence()[6]
    const catchCheckpoint = createCatchResult().checkpoints[7]

    for (const caughtRider of catchCheckpoint.riderSnapshots) {
      const sourceRider = getRider(source, caughtRider.riderId)
      const wasPelotonRider = sourceRider.currentGroupId === 'peloton-1'

      expect(caughtRider.chaseEnergyCost).toBe(wasPelotonRider ? 2.5 : 0)
      expect(caughtRider.energy).toBeLessThan(sourceRider.energy)
      expect(caughtRider.energyCostSincePreviousCheckpoint).toBeGreaterThan(0)
    }
  })

  it('continues the caught peloton to one deterministic finish checkpoint', () => {
    const result = createCatchResult()
    const finish = result.checkpoints[result.finishCheckpointIndex]
    const peloton = getGroup(finish, 'peloton-1')

    expect(finish.checkpointIndex).toBe(8)
    expect(finish.raceSecond).toBeCloseTo(4050.184, 3)
    expect(finish.currentKm).toBe(flatStageFixture.stage.distanceKm)
    expect(finish.groups).toHaveLength(1)
    expect(peloton.distanceKm).toBe(flatStageFixture.stage.distanceKm)
    expect(peloton.riderIds).toHaveLength(12)

    for (const rider of finish.riderSnapshots) {
      expect(rider.distanceKm).toBe(flatStageFixture.stage.distanceKm)
      expect(rider.currentGroupId).toBe('peloton-1')
    }
  })

  it('stops charging chase effort after the breakaway has been caught', () => {
    const result = createCatchResult()
    const finish = result.checkpoints[result.finishCheckpointIndex]

    for (const rider of finish.riderSnapshots) {
      expect(rider.chaseEnergyCost).toBe(0)
      expect(rider.energyCostSincePreviousCheckpoint).toBe(
        rider.movementEnergyCost,
      )
    }
  })

  it('reports the survival outcome at the leader finish checkpoint', () => {
    const result = createSurvivalResult()

    expect(result.outcome).toBe('survived')
    expect(result.outcomeCheckpointIndex).toBe(7)
    expect(result.finishCheckpointIndex).toBe(7)
    expect(result.checkpoints).toHaveLength(8)
  })

  it('finishes the breakaway with a deterministic positive gap to the peloton', () => {
    const finish = createSurvivalResult().checkpoints[7]
    const breakaway = getGroup(finish, 'breakaway-1')
    const peloton = getGroup(finish, 'peloton-1')

    expect(finish.raceSecond).toBeCloseTo(4048.485, 3)
    expect(finish.currentKm).toBe(flatStageFixture.stage.distanceKm)
    expect(breakaway.distanceKm).toBe(flatStageFixture.stage.distanceKm)
    expect(peloton.distanceKm).toBeCloseTo(49.971924, 6)
    expect(peloton.gapSecondsToLeader).toBeCloseTo(2.22, 3)
    expect(peloton.gapSecondsToLeader).toBeGreaterThan(0)
  })

  it('keeps two complete groups when the breakaway survives', () => {
    const finish = createSurvivalResult().checkpoints[7]

    expect(finish.groups).toHaveLength(2)
    expect(getGroup(finish, 'breakaway-1').riderIds).toEqual(['r01', 'r06'])
    expect(getGroup(finish, 'peloton-1').riderIds).toHaveLength(10)
    expectCompleteUniqueMembership(finish)
  })

  it('continues charging chase effort only to peloton riders in the survival interval', () => {
    const finish = createSurvivalResult().checkpoints[7]

    for (const rider of finish.riderSnapshots) {
      const isPelotonRider = rider.currentGroupId === 'peloton-1'

      expect(rider.chaseEnergyCost).toBe(isPelotonRider ? 2.5 : 0)
      expect(rider.movementEnergyCost).toBeGreaterThan(0)
      expect(rider.energyCostSincePreviousCheckpoint).toBeGreaterThanOrEqual(
        rider.movementEnergyCost,
      )
    }
  })

  it('uses contiguous checkpoint indexes and increasing race time', () => {
    for (const result of [createCatchResult(), createSurvivalResult()]) {
      result.checkpoints.forEach((checkpoint, index) => {
        expect(checkpoint.checkpointIndex).toBe(index)

        if (index > 0) {
          expect(checkpoint.raceSecond).toBeGreaterThan(
            result.checkpoints[index - 1].raceSecond,
          )
          expect(checkpoint.currentKm).toBeGreaterThanOrEqual(
            result.checkpoints[index - 1].currentKm,
          )
        }
      })
    }
  })

  it('keeps all outcome distances, speeds and energy values valid', () => {
    for (const result of [createCatchResult(), createSurvivalResult()]) {
      for (const checkpoint of result.checkpoints) {
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

      for (const checkpoint of result.checkpoints.slice(
        result.outcomeCheckpointIndex,
      )) {
        for (const rider of checkpoint.riderSnapshots) {
          const group = getGroup(checkpoint, rider.currentGroupId)

          expect(rider.distanceKm).toBe(group.distanceKm)
          expect(rider.speedKmh).toBe(group.speedKmh)
        }
      }
    }
  })

  it('does not mutate the supplied B1.8 checkpoint collection', () => {
    const source = createB18Sequence()
    const sourceBefore = JSON.stringify(source)

    const caught = createBreakawayOutcomeCheckpointSequence(
      flatStageFixture.stage,
      source,
      flatStageFixture.riders,
      flatStageFixture.breakawayCatchScenario,
    )

    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(caught.checkpoints).not.toBe(source)
    expect(caught.checkpoints[0]).not.toBe(source[0])
  })

  it('rejects invalid configuration and an outcome that contradicts the physics', () => {
    const source = createB18Sequence()

    expect(() =>
      createBreakawayOutcomeCheckpointSequence(
        flatStageFixture.stage,
        source,
        flatStageFixture.riders,
        {
          ...flatStageFixture.breakawayCatchScenario,
          pelotonClosingSpeedBonusKmh: -1,
        },
      ),
    ).toThrow('pelotonClosingSpeedBonusKmh must be non-negative')

    expect(() =>
      createBreakawayOutcomeCheckpointSequence(
        flatStageFixture.stage,
        source,
        flatStageFixture.riders,
        {
          ...flatStageFixture.breakawayCatchScenario,
          expectedOutcome: 'survived',
        },
      ),
    ).toThrow(
      'Configured B1.9 outcome survived does not match physical outcome caught',
    )
  })
})
