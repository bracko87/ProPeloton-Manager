/**
 * createStageInputFromSourceRows.test.ts
 *
 * Unit coverage for the pure database-source-row to StageInput adapter.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../integration/createStageInputFromSourceRows'

/**
 * createFixture
 *
 * Build a deterministic fixture matching the adapter's expected input shape.
 */
function createFixture():
  CreateStageInputFromSourceRowsParams {
  return {
    race: {
      id: 'race-001',
      name: 'Fixture Race',
    },

    stage: {
      id: 'stage-001',
      race_id: 'race-001',
      name: 'Fixture Stage',
      stage_format: 'road_race',
      distance_km: 1,
    },

    participantTeams: [
      {
        team_id: 'team-b',
        status: 'accepted',
        team_name_snapshot: 'Team B Snapshot',
      },
      {
        team_id: 'team-a',
        status: 'accepted',
        team_name_snapshot: 'Team A Snapshot',
      },
      {
        team_id: 'team-empty',
        status: 'accepted',
        team_name_snapshot: 'Empty Team',
      },
      {
        team_id: 'team-rejected',
        status: 'rejected',
        team_name_snapshot: 'Rejected Team',
      },
    ],

    participantRiders: [
      {
        rider_id: 'rider-b2',
        team_id: 'team-b',
        start_number: 12,
        role_snapshot: 'Domestique',
      },
      {
        rider_id: 'rider-a2',
        team_id: 'team-a',
        start_number: 2,
        role_snapshot: 'Sprinter',
      },
      {
        rider_id: 'rider-b1',
        team_id: 'team-b',
        start_number: 11,
        role_snapshot: 'Leader',
      },
      {
        rider_id: 'rider-a1',
        team_id: 'team-a',
        start_number: 1,
        role_snapshot: 'All-rounder',
      },
      {
        rider_id: 'rider-rejected',
        team_id: 'team-rejected',
        start_number: 20,
        role_snapshot: 'Leader',
      },
    ],

    riders: [
      {
        id: 'rider-a1',
        first_name: 'Alex',
        last_name: 'One',
        display_name: null,
        flat: 80,
        sprint: 70,
        endurance: 75,
        resistance: 72,
        recovery: 71,
        race_iq: 74,
        teamwork: 79,
      },
      {
        id: 'rider-a2',
        first_name: 'Alex',
        last_name: 'Two',
        display_name: 'Alex Display',
        flat: 76,
        sprint: 88,
        endurance: 73,
        resistance: 70,
        recovery: 68,
        race_iq: 82,
        teamwork: 75,
      },
      {
        id: 'rider-b1',
        first_name: 'Bruno',
        last_name: 'One',
        display_name: null,
        flat: 79,
        sprint: 84,
        endurance: 77,
        resistance: 76,
        recovery: 74,
        race_iq: 80,
        teamwork: 78,
      },
      {
        id: 'rider-b2',
        first_name: 'Bruno',
        last_name: 'Two',
        display_name: null,
        flat: 82,
        sprint: 65,
        endurance: 86,
        resistance: 85,
        recovery: 81,
        race_iq: 70,
        teamwork: 88,
      },
      {
        id: 'rider-rejected',
        first_name: 'Rejected',
        last_name: 'Rider',
        display_name: null,
        flat: 50,
        sprint: 50,
        endurance: 50,
        resistance: 50,
        recovery: 50,
        race_iq: 50,
        teamwork: 50,
      },
    ],

    stagePlans: [
      {
        id: 'plan-team-a',
        club_id: 'team-a',
        participating_club_id: 'team-a',
        status: 'draft',
        metadata: {
          default_race_captain_rider_id:
            'rider-a2',
        },
        rider_roles_json: {
          'rider-a1': 'rouleur',
          'rider-a2': 'sprinter',
        },
      },
      {
        id: 'plan-team-b',
        club_id: 'team-b',
        participating_club_id: 'team-b',
        status: 'draft',
        metadata: null,
        rider_roles_json: {
          'rider-b2': 'helper_domestique',
        },
      },
    ],

    profilePoints: [
      {
        km: 1,
        elevation_m: 105,
      },
      {
        km: 0,
        elevation_m: 100,
      },
      {
        km: 0.5,
        elevation_m: 110,
      },
    ],
  }
}

describe(
  'createStageInputFromSourceRows',
  () => {
    it(
      'creates a deterministic StageInput',
      () => {
        const fixture = createFixture()

        const first =
          createStageInputFromSourceRows(
            fixture,
          )

        const second =
          createStageInputFromSourceRows(
            createFixture(),
          )

        expect(first).toEqual(second)

        expect(first.raceId).toBe(
          'race-001',
        )

        expect(first.stageId).toBe(
          'stage-001',
        )

        expect(first.stageFormat).toBe(
          'road_race',
        )

        expect(first.seed).toBe(
          'race_engine_ts_v1:race-001:stage-001',
        )

        expect(first.orders).toEqual([])

        expect(first.teams).toHaveLength(
          2,
        )

        expect(
          first.teams.map(
            (team) => team.teamId,
          ),
        ).toEqual([
          'team-a',
          'team-b',
        ])

        expect(
          first.riders.map(
            (rider) => rider.riderId,
          ),
        ).toEqual([
          'rider-a1',
          'rider-a2',
          'rider-b1',
          'rider-b2',
        ])
      },
    )

    it(
      'excludes rejected and empty teams',
      () => {
        const output =
          createStageInputFromSourceRows(
            createFixture(),
          )

        expect(
          output.teams.some(
            (team) =>
              team.teamId ===
              'team-empty',
          ),
        ).toBe(false)

        expect(
          output.teams.some(
            (team) =>
              team.teamId ===
              'team-rejected',
          ),
        ).toBe(false)

        expect(
          output.riders.some(
            (rider) =>
              rider.riderId ===
              'rider-rejected',
          ),
        ).toBe(false)
      },
    )

    it(
      'uses stored and deterministic captains',
      () => {
        const output =
          createStageInputFromSourceRows(
            createFixture(),
          )

        const teamA =
          output.teams.find(
            (team) =>
              team.teamId === 'team-a',
          )

        const teamB =
          output.teams.find(
            (team) =>
              team.teamId === 'team-b',
          )

        expect(
          teamA?.captainRiderId,
        ).toBe('rider-a2')

        expect(
          teamB?.captainRiderId,
        ).toBe('rider-b1')

        expect(
          output.riders.find(
            (rider) =>
              rider.riderId ===
              'rider-a2',
          )?.role,
        ).toBe('captain')

        expect(
          output.riders.find(
            (rider) =>
              rider.riderId ===
              'rider-b1',
          )?.role,
        ).toBe('captain')
      },
    )

    it(
      'maps attributes and derives acceleration',
      () => {
        const output =
          createStageInputFromSourceRows(
            createFixture(),
          )

        const rider =
          output.riders.find(
            (entry) =>
              entry.riderId ===
              'rider-a1',
          )

        expect(rider?.attributes).toEqual({
          flat: 80,
          sprint: 70,
          acceleration: 73,
          stamina: 75,
          resistance: 72,
          recovery: 71,
          teamwork: 79,
        })
      },
    )

    it(
      'uses stage-plan role overrides',
      () => {
        const output =
          createStageInputFromSourceRows(
            createFixture(),
          )

        expect(
          output.riders.find(
            (rider) =>
              rider.riderId ===
              'rider-a1',
          )?.role,
        ).toBe('rouleur')

        expect(
          output.riders.find(
            (rider) =>
              rider.riderId ===
              'rider-b2',
          )?.role,
        ).toBe('domestique')
      },
    )

    it(
      'sorts profile points',
      () => {
        const output =
          createStageInputFromSourceRows(
            createFixture(),
          )

        expect(
          output.profilePoints.map(
            (point) =>
              point.kilometre,
          ),
        ).toEqual([
          0,
          0.5,
          1,
        ])
      },
    )

    it(
      'rejects a mismatched race',
      () => {
        const fixture =
          createFixture()

        expect(() =>
          createStageInputFromSourceRows({
            ...fixture,
            stage: {
              ...fixture.stage,
              race_id:
                'different-race',
            },
          }),
        ).toThrow(
          'The stage does not belong to the supplied race.',
        )
      },
    )

    it(
      'rejects an invalid profile boundary',
      () => {
        const fixture =
          createFixture()

        expect(() =>
          createStageInputFromSourceRows({
            ...fixture,
            profilePoints: [
              {
                km: 0,
                elevation_m: 100,
              },
              {
                km: 0.8,
                elevation_m: 105,
              },
            ],
          }),
        ).toThrow(
          'The final profile point must equal the stage distance.',
        )
      },
    )
  },
)