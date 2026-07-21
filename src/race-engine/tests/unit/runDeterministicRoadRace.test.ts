/**
 * runDeterministicRoadRace.test.ts
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import type { StageInput } from '../../domain/StageInput'
import {
  createCanonicalHashedValue,
} from '../../simulation/canonicalSerialization'
import {
  runDeterministicRoadRace,
} from '../../simulation/runDeterministicRoadRace'

const input: StageInput = {
  raceId: 'integration-boundary-race',
  stageId: 'integration-boundary-stage',
  stageName: 'Integration Boundary Test',
  stageFormat: 'road_race',
  distanceKm: 1,
  seed: 'integration-boundary-seed',
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

describe(
  'runDeterministicRoadRace',
  () => {
    it(
      'returns the authoritative output contract',
      () => {
        const output =
          runDeterministicRoadRace(input)

        expect(output).toMatchObject({
          raceId: 'integration-boundary-race',
          stageId: 'integration-boundary-stage',
          engineVersion: 'race_engine_ts_v1',
          simulationMode: 'deterministic_road_race_v1',
          seed: 'integration-boundary-seed',
        })

        expect(
          output.finalRiderStates,
        ).toHaveLength(4)

        expect(
          output.events.at(-1)?.eventType,
        ).toBe('SIMULATION_COMPLETED')
      },
    )

    it(
      'returns identical output for identical input',
      () => {
        const outputA =
          runDeterministicRoadRace(input)

        const outputB =
          runDeterministicRoadRace(input)

        expect(
          createCanonicalHashedValue(
            outputA,
          ).canonicalJson,
        ).toBe(
          createCanonicalHashedValue(
            outputB,
          ).canonicalJson,
        )
      },
    )

    it(
      'forwards the runner safety bound',
      () => {
        expect(() =>
          runDeterministicRoadRace(
            input,
            {
              runnerOptions: {
                maximumTickCount: 1,
              },
            },
          ),
        ).toThrow(
          'exceeded maximumTickCount',
        )
      },
    )
  },
)