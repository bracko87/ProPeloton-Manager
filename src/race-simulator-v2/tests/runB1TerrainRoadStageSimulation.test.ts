import { describe, expect, it } from 'vitest'

import {
  runB1TerrainRoadStageSimulation,
} from '../core/runB1TerrainRoadStageSimulation'
import {
  createRoadStageProfile,
} from '../core/roadStageProfile'
import {
  flatStageFixture,
} from '../fixtures/flatStage1'

const flat142 = createRoadStageProfile({
  profileId: 'flat-142',
  stageType: 'flat',
  finishType: 'sprint',
  distanceKm: 142,
  profilePoints: [
    { km: 0, elevationM: 0 },
    { km: 142, elevationM: 0 },
  ],
})

const mountain136 = createRoadStageProfile({
  profileId: 'mountain-136',
  stageType: 'mountain',
  finishType: 'standard',
  distanceKm: 136,
  profilePoints: [
    { km: 0, elevationM: 900 },
    { km: 32, elevationM: 930 },
    { km: 44, elevationM: 1410 },
    { km: 56, elevationM: 1290 },
    { km: 72, elevationM: 1010 },
    { km: 96, elevationM: 930 },
    { km: 108, elevationM: 1590 },
    { km: 120, elevationM: 1080 },
    { km: 136, elevationM: 876 },
  ],
})

function runFlat(outcome: 'caught' | 'survived') {
  return runB1TerrainRoadStageSimulation(
    flatStageFixture,
    { stageId: 'rio-1', raceId: 'rio', profile: flat142 },
    { outcome },
  )
}

function runMountain(outcome: 'caught' | 'survived') {
  return runB1TerrainRoadStageSimulation(
    flatStageFixture,
    { stageId: 'rio-3', raceId: 'rio', profile: mountain136 },
    { outcome },
  )
}

function runFlatWithResistance(riderId: string, resistance: number) {
  const definition = {
    ...flatStageFixture,
    riders: flatStageFixture.riders.map((rider) =>
      rider.riderId === riderId ? { ...rider, resistance } : rider,
    ),
  }

  return runB1TerrainRoadStageSimulation(
    definition,
    { stageId: 'rio-1', raceId: 'rio', profile: flat142 },
    { outcome: 'caught' },
  )
}

function averageMovementCost(
  checkpoint: ReturnType<typeof runMountain>['checkpoints'][number],
): number {
  return (
    checkpoint.riderSnapshots.reduce(
      (sum, rider) => sum + rider.movementEnergyCost,
      0,
    ) / checkpoint.riderSnapshots.length
  )
}

describe('true integrated B1 + B2 road-stage runner', () => {
  it('preserves the frozen B1 result exactly when terrain is disabled', () => {
    const result = runB1TerrainRoadStageSimulation(
      flatStageFixture,
      {
        stageId: flatStageFixture.stage.stageId,
        raceId: flatStageFixture.stage.raceId,
        profile: flat142,
      },
      { outcome: 'caught', terrainEnabled: false },
    )

    expect(result.stageResults.winnerFinishTimeSeconds).toBe(4050.184)
    expect(result.stageResults.results).toHaveLength(12)
    expect(result.outcomeSequence.checkpoints).toEqual(
      result.foundation.outcomeSequence.checkpoints,
    )
  })

  it('runs the B1 behavior chain dynamically over the real stage instead of stretching nine checkpoints', () => {
    const result = runFlat('caught')

    expect(result.stage.distanceKm).toBe(142)
    expect(result.checkpoints.length).toBeGreaterThan(9)
    expect(result.checkpoints.at(-1)?.currentKm).toBe(142)
    expect(
      result.checkpoints.some(
        (checkpoint) => checkpoint.groups.length === 2,
      ),
    ).toBe(true)
    expect(result.stageResults.results).toHaveLength(12)
  })

  it('keeps B1 attack, drafting, cooperation and B2 terrain active in the same physical checkpoints', () => {
    const result = runMountain('survived')
    const splitCheckpoint = result.checkpoints.find(
      (checkpoint, index) =>
        checkpoint.groups.length === 2 &&
        result.checkpoints[index - 1]?.groups.length === 1,
    )

    expect(splitCheckpoint).toBeDefined()
    expect(
      splitCheckpoint?.groups.every(
        (group) =>
          group.totalGroupAdvantageKmh !== undefined &&
          group.baseSpeedBeforeTerrainKmh !== undefined &&
          group.terrainSpeedMultiplier !== undefined,
      ),
    ).toBe(true)
    expect(
      splitCheckpoint?.riderSnapshots.reduce(
        (sum, rider) => sum + rider.attackEnergyCost,
        0,
      ),
    ).toBe(16)
  })

  it('counts the seven unique boundaries of the eight-phase mountain profile exactly once', () => {
    const result = runMountain('caught')

    expect(mountain136.terrainPhases).toHaveLength(8)
    expect(result.phaseBoundaryCrossingCount).toBe(7)
  })

  it('uses terrain-adjusted movement to create physical gaps and catch timing', () => {
    const flat = runFlat('caught')
    const mountain = runMountain('caught')
    const mountainPositiveGaps = mountain.checkpoints.flatMap(
      (checkpoint) =>
        checkpoint.groups.map((group) => group.gapSecondsToLeader),
    )

    expect(mountainPositiveGaps.some((gap) => gap > 0)).toBe(true)
    expect(mountain.stageResults.winnerFinishTimeSeconds).not.toBe(
      flat.stageResults.winnerFinishTimeSeconds,
    )
    expect(mountain.outcomeSequence.outcomeCheckpointIndex).not.toBe(
      flat.outcomeSequence.outcomeCheckpointIndex,
    )
  })

  it('makes climb energy cost greater than an earlier flat checkpoint in terrain-enabled mode', () => {
    const result = runMountain('caught')
    const flatCheckpoint = result.checkpoints.find(
      (checkpoint) => checkpoint.groups[0]?.terrainType === 'flat' && checkpoint.checkpointIndex > 0,
    )
    const climbCheckpoint = result.checkpoints.find(
      (checkpoint) => checkpoint.groups[0]?.terrainType === 'climb',
    )

    expect(flatCheckpoint).toBeDefined()
    expect(climbCheckpoint).toBeDefined()
    expect(averageMovementCost(climbCheckpoint!)).toBeGreaterThan(
      averageMovementCost(flatCheckpoint!),
    )
  })

  it('derives catch and survival from the integrated physical finish state', () => {
    const caught = runMountain('caught')
    const survived = runMountain('survived')

    expect(caught.physicalOutcome).toBe('caught')
    expect(
      new Set(
        caught.stageResults.results.map(
          (row) => row.finishingGroupId,
        ),
      ).size,
    ).toBe(1)
    expect(survived.physicalOutcome).toBe('survived')
    expect(
      new Set(
        survived.stageResults.results.map(
          (row) => row.finishingGroupId,
        ),
      ).size,
    ).toBe(2)
    expect(survived.stageResults.results.some((row) => row.gapSecondsToWinner > 0)).toBe(true)
  })

  it('is deterministic for repeated true integrated runs', () => {
    expect(runMountain('caught')).toEqual(runMountain('caught'))
    expect(runMountain('survived')).toEqual(runMountain('survived'))
  })

  it('uses resistance only for integrated energy cost without changing movement or results', () => {
    const lowResistance = runFlatWithResistance('r03', 10)
    const highResistance = runFlatWithResistance('r03', 90)

    const lowResistanceSnapshot =
      lowResistance.checkpoints
        .at(-1)
        ?.riderSnapshots.find(
          (rider) => rider.riderId === 'r03',
        )
    const highResistanceSnapshot =
      highResistance.checkpoints
        .at(-1)
        ?.riderSnapshots.find(
          (rider) => rider.riderId === 'r03',
        )

    const lowResistanceResult =
      lowResistance.stageResults.results.find(
        (row) => row.riderId === 'r03',
      )
    const highResistanceResult =
      highResistance.stageResults.results.find(
        (row) => row.riderId === 'r03',
      )

    expect(lowResistanceSnapshot).toBeDefined()
    expect(highResistanceSnapshot).toBeDefined()
    expect(lowResistanceResult).toBeDefined()
    expect(highResistanceResult).toBeDefined()

    expect(
      highResistanceSnapshot!.movementEnergyCost,
    ).toBeLessThan(
      lowResistanceSnapshot!.movementEnergyCost,
    )
    expect(highResistanceSnapshot!.energy).toBeGreaterThan(
      lowResistanceSnapshot!.energy,
    )

    expect(highResistanceSnapshot!.distanceKm).toBe(
      lowResistanceSnapshot!.distanceKm,
    )
    expect(highResistanceSnapshot!.speedKmh).toBe(
      lowResistanceSnapshot!.speedKmh,
    )

    expect(highResistanceResult!.finishTimeSeconds).toBe(
      lowResistanceResult!.finishTimeSeconds,
    )
    expect(highResistanceResult!.gapSecondsToWinner).toBe(
      lowResistanceResult!.gapSecondsToWinner,
    )
    expect(highResistanceResult!.finishingGroupId).toBe(
      lowResistanceResult!.finishingGroupId,
    )

    expect(
      highResistance.stageResults.winnerFinishTimeSeconds,
    ).toBe(
      lowResistance.stageResults.winnerFinishTimeSeconds,
    )
    expect(highResistance.physicalOutcome).toBe(
      lowResistance.physicalOutcome,
    )
  })
})