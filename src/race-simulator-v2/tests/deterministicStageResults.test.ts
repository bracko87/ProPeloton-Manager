/**
 * deterministicStageResults.test.ts
 *
 * Focused B1.10 tests for final deterministic rider ranks, times and gaps.
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
import { createDeterministicStageResults } from '../core/deterministicStageResults'
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

function createOutcome(
  scenario: typeof flatStageFixture.breakawayCatchScenario |
    typeof flatStageFixture.breakawaySurvivalScenario,
): BreakawayOutcomeCheckpointSequenceResult {
  return createBreakawayOutcomeCheckpointSequence(
    flatStageFixture.stage,
    createB18Sequence(),
    flatStageFixture.riders,
    scenario,
  )
}

function createCatchResults() {
  return createDeterministicStageResults(
    flatStageFixture.stage,
    flatStageFixture.riders,
    createOutcome(flatStageFixture.breakawayCatchScenario),
    flatStageFixture.finalResultModel,
  )
}

function createSurvivalResults() {
  return createDeterministicStageResults(
    flatStageFixture.stage,
    flatStageFixture.riders,
    createOutcome(flatStageFixture.breakawaySurvivalScenario),
    flatStageFixture.finalResultModel,
  )
}

describe('B1.10 deterministic final rider results', () => {
  it('produces identical catch results for identical input', () => {
    expect(createCatchResults()).toEqual(createCatchResults())
  })

  it('produces identical survival results for identical input', () => {
    expect(createSurvivalResults()).toEqual(createSurvivalResults())
  })

  it('creates exactly one result row for every controlled rider', () => {
    for (const result of [createCatchResults(), createSurvivalResults()]) {
      expect(result.results).toHaveLength(12)
      expect(new Set(result.results.map((row) => row.riderId)).size).toBe(12)
      expect(result.results.map((row) => row.riderId).sort()).toEqual(
        flatStageFixture.riders.map((rider) => rider.riderId).sort(),
      )
    }
  })

  it('assigns contiguous ranks one through twelve', () => {
    for (const result of [createCatchResults(), createSurvivalResults()]) {
      expect(result.results.map((row) => row.rank)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ])
    }
  })

  it('marks every controlled result as finished', () => {
    for (const result of [createCatchResults(), createSurvivalResults()]) {
      expect(result.results.every((row) => row.status === 'finished')).toBe(true)
    }
  })

  it('keeps every caught rider on one identical finish time and zero gap', () => {
    const result = createCatchResults()
    const finishTimes = new Set(result.results.map((row) => row.finishTimeSeconds))
    const gaps = new Set(result.results.map((row) => row.gapSecondsToWinner))
    const groupIds = new Set(result.results.map((row) => row.finishingGroupId))

    expect(result.outcome).toBe('caught')
    expect(finishTimes).toEqual(new Set([4050.184]))
    expect(gaps).toEqual(new Set([0]))
    expect(groupIds).toEqual(new Set(['peloton-1']))
    expect(result.results.every((row) => row.finishingGroupRank === 1)).toBe(true)
  })

  it('uses the deterministic flat-stage tie-break inside the caught peloton', () => {
    expect(createCatchResults().results.map((row) => row.riderId)).toEqual([
      'r06',
      'r02',
      'r11',
      'r01',
      'r03',
      'r08',
      'r10',
      'r05',
      'r04',
      'r09',
      'r12',
      'r07',
    ])
  })

  it('records the deterministic caught winner and stage metadata', () => {
    const result = createCatchResults()

    expect(result.stageId).toBe('flat-001')
    expect(result.raceId).toBe('race-001')
    expect(result.winnerRiderId).toBe('r06')
    expect(result.winnerFinishTimeSeconds).toBe(4050.184)
  })

  it('gives the surviving breakaway one shared winning time', () => {
    const result = createSurvivalResults()
    const breakawayRows = result.results.filter(
      (row) => row.finishingGroupId === 'breakaway-1',
    )

    expect(result.outcome).toBe('survived')
    expect(breakawayRows).toHaveLength(2)
    expect(breakawayRows.map((row) => row.riderId)).toEqual(['r06', 'r01'])
    expect(new Set(breakawayRows.map((row) => row.finishTimeSeconds))).toEqual(
      new Set([4048.485]),
    )
    expect(new Set(breakawayRows.map((row) => row.gapSecondsToWinner))).toEqual(
      new Set([0]),
    )
    expect(breakawayRows.every((row) => row.finishingGroupRank === 1)).toBe(true)
  })

  it('calculates one shared positive finish gap for the surviving peloton', () => {
    const result = createSurvivalResults()
    const pelotonRows = result.results.filter(
      (row) => row.finishingGroupId === 'peloton-1',
    )

    expect(pelotonRows).toHaveLength(10)
    expect(new Set(pelotonRows.map((row) => row.finishTimeSeconds))).toEqual(
      new Set([4050.705]),
    )
    expect(new Set(pelotonRows.map((row) => row.gapSecondsToWinner))).toEqual(
      new Set([2.22]),
    )
    expect(pelotonRows.every((row) => row.gapSecondsToWinner > 0)).toBe(true)
    expect(pelotonRows.every((row) => row.finishingGroupRank === 2)).toBe(true)
  })

  it('keeps both surviving attackers ahead of every peloton rider', () => {
    const result = createSurvivalResults()

    expect(result.results.slice(0, 2).map((row) => row.riderId)).toEqual([
      'r06',
      'r01',
    ])
    expect(
      result.results.slice(2).every((row) => row.finishingGroupId === 'peloton-1'),
    ).toBe(true)
  })

  it('uses the same stable tie-break inside the surviving peloton', () => {
    expect(createSurvivalResults().results.slice(2).map((row) => row.riderId)).toEqual([
      'r02',
      'r11',
      'r03',
      'r08',
      'r10',
      'r05',
      'r04',
      'r09',
      'r12',
      'r07',
    ])
  })

  it('records the deterministic survival winner', () => {
    const result = createSurvivalResults()

    expect(result.winnerRiderId).toBe('r06')
    expect(result.winnerFinishTimeSeconds).toBe(4048.485)
  })

  it('keeps finish times ordered and gaps aligned with the winner time', () => {
    for (const result of [createCatchResults(), createSurvivalResults()]) {
      result.results.forEach((row, index) => {
        if (index > 0) {
          expect(row.finishTimeSeconds).toBeGreaterThanOrEqual(
            result.results[index - 1].finishTimeSeconds,
          )
        }

        expect(row.gapSecondsToWinner).toBeCloseTo(
          row.finishTimeSeconds - result.winnerFinishTimeSeconds,
          3,
        )
      })
    }
  })

  it('uses rider id as the final stable fallback when attributes are equal', () => {
    const equalRiders = flatStageFixture.riders.map((rider) => ({
      ...rider,
      sprint: 50,
      flat: 50,
      endurance: 50,
    }))
    const result = createDeterministicStageResults(
      flatStageFixture.stage,
      equalRiders,
      createOutcome(flatStageFixture.breakawayCatchScenario),
      flatStageFixture.finalResultModel,
    )

    expect(result.results.map((row) => row.riderId)).toEqual([
      'r01',
      'r02',
      'r03',
      'r04',
      'r05',
      'r06',
      'r07',
      'r08',
      'r09',
      'r10',
      'r11',
      'r12',
    ])
  })

  it('does not mutate riders or the B1.9 outcome sequence', () => {
    const ridersBefore = JSON.stringify(flatStageFixture.riders)
    const outcome = createOutcome(flatStageFixture.breakawaySurvivalScenario)
    const outcomeBefore = JSON.stringify(outcome)

    createDeterministicStageResults(
      flatStageFixture.stage,
      flatStageFixture.riders,
      outcome,
      flatStageFixture.finalResultModel,
    )

    expect(JSON.stringify(flatStageFixture.riders)).toBe(ridersBefore)
    expect(JSON.stringify(outcome)).toBe(outcomeBefore)
  })

  it('rejects duplicate tie-break attributes', () => {
    expect(() =>
      createDeterministicStageResults(
        flatStageFixture.stage,
        flatStageFixture.riders,
        createOutcome(flatStageFixture.breakawayCatchScenario),
        { tieBreakAttributeOrder: ['sprint', 'sprint'] },
      ),
    ).toThrow('B1.10 tie-break attributes must be unique')
  })

  it('rejects incomplete finishing membership', () => {
    const outcome = createOutcome(flatStageFixture.breakawayCatchScenario)
    const finish = outcome.checkpoints[outcome.finishCheckpointIndex]
    const invalidOutcome = {
      ...outcome,
      checkpoints: outcome.checkpoints.map((checkpoint, index) =>
        index === outcome.finishCheckpointIndex
          ? {
              ...checkpoint,
              groups: [
                {
                  ...finish.groups[0],
                  riderIds: finish.groups[0].riderIds.slice(1),
                },
              ],
            }
          : checkpoint,
      ),
    }

    expect(() =>
      createDeterministicStageResults(
        flatStageFixture.stage,
        flatStageFixture.riders,
        invalidOutcome,
        flatStageFixture.finalResultModel,
      ),
    ).toThrow('B1.10 finishing groups must contain every rider exactly once')
  })

  it('rejects an unfinished trailing group with invalid speed', () => {
    const outcome = createOutcome(flatStageFixture.breakawaySurvivalScenario)
    const finish = outcome.checkpoints[outcome.finishCheckpointIndex]
    const invalidOutcome = {
      ...outcome,
      checkpoints: outcome.checkpoints.map((checkpoint, index) =>
        index === outcome.finishCheckpointIndex
          ? {
              ...checkpoint,
              groups: finish.groups.map((group) =>
                group.groupId === 'peloton-1'
                  ? { ...group, speedKmh: 0 }
                  : group,
              ),
            }
          : checkpoint,
      ),
    }

    expect(() =>
      createDeterministicStageResults(
        flatStageFixture.stage,
        flatStageFixture.riders,
        invalidOutcome,
        flatStageFixture.finalResultModel,
      ),
    ).toThrow('Unfinished B1.10 group requires positive speed: peloton-1')
  })
})
