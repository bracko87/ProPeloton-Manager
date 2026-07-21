/**
 * createMultiGroupSimulationOutput.test.ts
 *
 * Unit tests for the createMultiGroupSimulationOutput adapter which converts a
 * completed RunMultiGroupStageResult into the authoritative SimulationOutput.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import { createInitialState } from '../../simulation/createInitialState'
import { createDroppedGroup } from '../../simulation/droppedGroup'
import { createMultiGroupSimulationOutput } from '../../simulation/createMultiGroupSimulationOutput'
import { runMultiGroupStage } from '../../simulation/runMultiGroupStage'

const stageInput: StageInput = {
  raceId: 'multi-group-output-race',
  stageId: 'multi-group-output-stage',
  stageName: 'Multi Group Output Test',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed: 'multi-group-output-seed',
  settings: {
    tickSeconds: 30,
    replaySnapshotIntervalSeconds: 30,
    maximumBreakawaySize: 8,
    minimumSpeedKmh: 36,
    maximumSpeedKmh: 60,
  },
  teams: [
    {
      teamId: 'team-a',
      teamName: 'Team A',
      captainRiderId: 'rider-a1',
      riderIds: ['rider-a1', 'rider-a2'],
    },
    {
      teamId: 'team-b',
      teamName: 'Team B',
      captainRiderId: 'rider-b1',
      riderIds: ['rider-b1', 'rider-b2'],
    },
  ],
  riders: [
    {
      riderId: 'rider-a1',
      teamId: 'team-a',
      riderName: 'A1',
      teamName: 'Team A',
      role: 'captain',
      attributes: {
        flat: 75,
        sprint: 90,
        acceleration: 88,
        stamina: 74,
        resistance: 72,
        recovery: 70,
        teamwork: 78,
      },
    },
    {
      riderId: 'rider-a2',
      teamId: 'team-a',
      riderName: 'A2',
      teamName: 'Team A',
      role: 'rouleur',
      attributes: {
        flat: 86,
        sprint: 68,
        acceleration: 70,
        stamina: 84,
        resistance: 83,
        recovery: 78,
        teamwork: 82,
      },
    },
    {
      riderId: 'rider-b1',
      teamId: 'team-b',
      riderName: 'B1',
      teamName: 'Team B',
      role: 'captain',
      attributes: {
        flat: 78,
        sprint: 87,
        acceleration: 91,
        stamina: 76,
        resistance: 74,
        recovery: 73,
        teamwork: 77,
      },
    },
    {
      riderId: 'rider-b2',
      teamId: 'team-b',
      riderName: 'B2',
      teamName: 'Team B',
      role: 'domestique',
      attributes: {
        flat: 82,
        sprint: 64,
        acceleration: 65,
        stamina: 87,
        resistance: 86,
        recovery: 81,
        teamwork: 89,
      },
    },
  ],
  profilePoints: [
    { kilometre: 0, elevationMetres: 100 },
    { kilometre: 0.3, elevationMetres: 100 },
    { kilometre: 0.7, elevationMetres: 120 },
    { kilometre: 1, elevationMetres: 105 },
  ],
  orders: [],
}

/**
 * createCompletedStage
 *
 * Build a separated initial state and run it to completion returning the
 * completed RunMultiGroupStageResult used by the output adapter tests.
 */
function createCompletedStage() {
  const separatedState =
    createDroppedGroup({
      state:
        createInitialState(
          stageInput,
        ),
      sourceGroupId:
        'peloton_main',
      riderIds: [
        'rider-a2',
        'rider-b2',
      ],
      speedKmh: 34,
    }).state

  return runMultiGroupStage(
    separatedState,
  )
}

describe(
  'createMultiGroupSimulationOutput',
  () => {
    it(
      'creates the authoritative output identifiers',
      () => {
        const output =
          createMultiGroupSimulationOutput(
            createCompletedStage(),
          )

        expect(output).toMatchObject({
          raceId:
            'multi-group-output-race',
          stageId:
            'multi-group-output-stage',
          engineVersion:
            'race_engine_ts_v1',
          simulationMode:
            'deterministic_road_race_v1',
          seed:
            'multi-group-output-seed',
        })
      },
    )

    it(
      'maps every replay snapshot',
      () => {
        const stage =
          createCompletedStage()

        const output =
          createMultiGroupSimulationOutput(
            stage,
          )

        expect(
          output.snapshots.map(
            (snapshot) =>
              snapshot.raceSecond,
          ),
        ).toStrictEqual([
          0,
          30,
          60,
          90,
          120,
        ])
      },
    )

    it(
      'orders groups consistently',
      () => {
        const output =
          createMultiGroupSimulationOutput(
            createCompletedStage(),
          )

        for (
          const snapshot of
          output.snapshots
        ) {
          expect(
            snapshot.groupOrder,
          ).toStrictEqual(
            snapshot.groups.map(
              (group) =>
                group.groupId,
            ),
          )
        }
      },
    )

    it(
      'includes events available by each frame',
      () => {
        const output =
          createMultiGroupSimulationOutput(
            createCompletedStage(),
          )

        expect(
          output.snapshots[0]
            .eventSequenceNumbers,
        ).toStrictEqual([1])

        expect(
          output.snapshots[
            output.snapshots.length - 1
          ].eventSequenceNumbers,
        ).toStrictEqual([
          1,
          2,
          3,
          4,
          5,
          6,
        ])
      },
    )

    it(
      'orders final riders by finish position',
      () => {
        const output =
          createMultiGroupSimulationOutput(
            createCompletedStage(),
          )

        expect(
          output.finalRiderStates.map(
            (rider) =>
              rider.finishPosition,
          ),
        ).toStrictEqual([
          1,
          2,
          3,
          4,
        ])
      },
    )

    it(
      'is deterministic',
      () => {
        const stage =
          createCompletedStage()

        expect(
          createMultiGroupSimulationOutput(
            stage,
          ),
        ).toStrictEqual(
          createMultiGroupSimulationOutput(
            stage,
          ),
        )
      },
    )

    it(
      'rejects incomplete stages',
      () => {
        const stage =
          createCompletedStage()

        expect(() =>
          createMultiGroupSimulationOutput({
            ...stage,
            completed: false,
          }),
        ).toThrow(
          'must be completed',
        )
      },
    )
  },
)