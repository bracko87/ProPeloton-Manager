/**
 * runB1RoadStageSimulation.test.ts
 *
 * Preservation tests for the unified B1 orchestration entry point.
 */

import { describe, expect, it } from 'vitest'
import { runB1RoadStageSimulation } from '../core/runB1RoadStageSimulation'
import { flatStageFixture } from '../fixtures/flatStage1'

function run(outcome: 'caught' | 'survived') {
  return runB1RoadStageSimulation(flatStageFixture, { outcome })
}

describe('unified B1 road-stage runner', () => {
  it('is deterministic for both accepted outcomes', () => {
    expect(run('caught')).toEqual(run('caught'))
    expect(run('survived')).toEqual(run('survived'))
  })

  it('preserves the accepted attack and two-group split', () => {
    const result = run('caught')
    const attackCheckpoint =
      result.outcomeSequence.checkpoints[
        flatStageFixture.controlledAttack.attackCheckpointIndex
      ]

    expect(attackCheckpoint.groups).toHaveLength(2)
    expect(
      attackCheckpoint.groups.find(
        (group) =>
          group.groupId ===
          flatStageFixture.separateGroupMovement.breakawayGroupId,
      )?.riderIds,
    ).toEqual(['r01', 'r06'])
  })

  it('preserves drafting, cooperation, attack cost and the late chase', () => {
    const result = run('caught')
    const attackCheckpoint = result.outcomeSequence.checkpoints[3]
    const chaseCheckpoint = result.outcomeSequence.checkpoints[5]
    const breakaway = attackCheckpoint.groups.find(
      (group) => group.groupId === 'breakaway-1',
    )
    const peloton = chaseCheckpoint.groups.find(
      (group) => group.groupId === 'peloton-1',
    )

    expect(breakaway?.totalGroupAdvantageKmh).toBeGreaterThan(0)
    expect(
      attackCheckpoint.riderSnapshots
        .filter((rider) => ['r01', 'r06'].includes(rider.riderId))
        .every(
          (rider) =>
            rider.attackEnergyCost ===
            flatStageFixture.energyModel.attackEnergyCost,
        ),
    ).toBe(true)
    expect(peloton?.chaseActive).toBe(true)
    expect(peloton?.chaseSpeedBonusKmh).toBe(
      flatStageFixture.lateStageChase.pelotonChaseSpeedBonusKmh,
    )
  })

  it('preserves the exact accepted catch result', () => {
    const result = run('caught')

    expect(result.outcomeSequence.outcome).toBe('caught')
    expect(result.outcomeSequence.outcomeCheckpointIndex).toBe(7)
    expect(result.outcomeSequence.finishCheckpointIndex).toBe(8)
    expect(result.stageResults.winnerRiderId).toBe('r06')
    expect(result.stageResults.winnerFinishTimeSeconds).toBe(4050.184)
    expect(
      new Set(
        result.stageResults.results.map((row) => row.finishTimeSeconds),
      ),
    ).toEqual(new Set([4050.184]))
    expect(
      new Set(
        result.stageResults.results.map((row) => row.gapSecondsToWinner),
      ),
    ).toEqual(new Set([0]))
  })

  it('preserves the exact accepted survival result', () => {
    const result = run('survived')
    const breakawayRows = result.stageResults.results.filter(
      (row) => row.finishingGroupId === 'breakaway-1',
    )
    const pelotonRows = result.stageResults.results.filter(
      (row) => row.finishingGroupId === 'peloton-1',
    )

    expect(result.outcomeSequence.outcome).toBe('survived')
    expect(result.stageResults.winnerRiderId).toBe('r06')
    expect(result.stageResults.winnerFinishTimeSeconds).toBe(4048.485)
    expect(breakawayRows.map((row) => row.riderId)).toEqual(['r06', 'r01'])
    expect(
      new Set(pelotonRows.map((row) => row.finishTimeSeconds)),
    ).toEqual(new Set([4050.705]))
    expect(
      new Set(pelotonRows.map((row) => row.gapSecondsToWinner)),
    ).toEqual(new Set([2.22]))
  })

  it('creates one contiguous deterministic result row per rider', () => {
    for (const outcome of ['caught', 'survived'] as const) {
      const result = run(outcome)

      expect(result.stageResults.results).toHaveLength(12)
      expect(result.stageResults.results.map((row) => row.rank)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ])
      expect(
        new Set(result.stageResults.results.map((row) => row.riderId)).size,
      ).toBe(12)
    }
  })
})