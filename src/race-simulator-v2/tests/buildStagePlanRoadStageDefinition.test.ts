import { describe, expect, it } from 'vitest'

import {
  buildStagePlanRoadStageDefinition,
  type BuildStagePlanRoadStageDefinitionInput,
} from '../core/buildStagePlanRoadStageDefinition'
import {
  runB1TerrainRoadStageSimulation,
} from '../core/runB1TerrainRoadStageSimulation'
import {
  createRoadStageProfile,
} from '../core/roadStageProfile'
import {
  flatStageFixture,
} from '../fixtures/flatStage1'

const riders: BuildStagePlanRoadStageDefinitionInput['riders'] = [
  {
    riderId: 'real-rider-1',
    displayName: 'Real Rider One',
    teamId: 'team-a',
    teamName: 'Team A',
    overall: 82,
  },
  {
    riderId: 'real-rider-2',
    displayName: 'Real Rider Two',
    teamId: 'team-a',
    teamName: 'Team A',
    overall: 76,
  },
  {
    riderId: 'real-rider-3',
    displayName: 'Real Rider Three',
    teamId: 'team-b',
    teamName: 'Team B',
    overall: 74,
  },
  {
    riderId: 'real-rider-4',
    displayName: 'Real Rider Four',
    teamId: 'team-b',
    teamName: 'Team B',
    overall: 68,
  },
  {
    riderId: 'real-rider-5',
    displayName: 'Real Rider Five',
    teamId: 'team-c',
    teamName: 'Team C',
    overall: 71,
  },
  {
    riderId: 'real-rider-6',
    displayName: 'Real Rider Six',
    teamId: 'team-c',
    teamName: 'Team C',
    overall: 65,
  },
]

const profile = createRoadStageProfile({
  profileId: 'real-stage-orders-flat-100',
  stageType: 'flat',
  finishType: 'sprint',
  distanceKm: 100,
  profilePoints: [
    { km: 0, elevationM: 100 },
    { km: 100, elevationM: 100 },
  ],
})

function buildInput(
  stagePlans: BuildStagePlanRoadStageDefinitionInput['stagePlans'],
  fieldRiders: BuildStagePlanRoadStageDefinitionInput['riders'] = riders,
): BuildStagePlanRoadStageDefinitionInput {
  return {
    stageId: 'real-stage-1',
    raceId: 'real-race-1',
    distanceKm: 100,
    riders: fieldRiders,
    stagePlans,
  }
}

const largeFieldRiders: BuildStagePlanRoadStageDefinitionInput['riders'] = [
  ...riders,
  ...Array.from(
    { length: 90 },
    (_, index) => ({
      riderId: `neutral-rider-${String(index + 1).padStart(2, '0')}`,
      displayName: `Neutral Rider ${index + 1}`,
      teamId: `neutral-team-${Math.floor(index / 6) + 1}`,
      teamName: `Neutral Team ${Math.floor(index / 6) + 1}`,
      overall: 70,
    }),
  ),
]

const attackPlan = {
  planId: 'plan-a',
  teamId: 'team-a',
  teamTacticJson: { plan: 'breakaway' },
  riderRolesJson: {
    'real-rider-1': 'breakaway_rider',
    'real-rider-2': 'helper_domestique',
  },
  riderIndividualTacticsJson: {
    'real-rider-1': {
      phase_1: {
        command: 'attack',
        from_km: 0,
        to_km: 25,
      },
    },
    'real-rider-3': {
      phase_2: {
        command: 'join_breakaway',
        from_km: 25,
        to_km: 50,
      },
    },
  },
} as const

const chasePlan = {
  planId: 'plan-b',
  teamId: 'team-b',
  teamTacticJson: { plan: 'sprint_control' },
  riderRolesJson: {
    'real-rider-4': 'breakaway_chaser',
  },
  riderIndividualTacticsJson: {
    'real-rider-4': {
      phase_3: {
        command: 'chase_breakaway',
        from_km: 50,
        to_km: 75,
      },
    },
  },
} as const


const slowerAttackPlan = {
  planId: 'plan-c',
  teamId: 'team-c',
  teamTacticJson: { plan: 'breakaway' },
  riderRolesJson: {
    'real-rider-6': 'breakaway_rider',
  },
  riderIndividualTacticsJson: {
    'real-rider-6': {
      phase_1: {
        command: 'attack',
        from_km: 0,
        to_km: 25,
      },
    },
  },
} as const

describe('real stage field and saved Stage Plan bridge', () => {
  it('uses the actual rider identities instead of fixture rider IDs', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput([]),
    )

    expect(built.definition.riders.map((rider) => rider.riderId)).toEqual(
      riders.map((rider) => rider.riderId),
    )
    expect(built.definition.riders[0]?.displayName).toBe('Real Rider One')
    expect(built.definition.riders[0]?.flat).toBe(82)
    expect(built.summary.neutralAttributeBridge).toBe(true)
  })

  it('uses only explicit attack or join-breakaway commands as attackers', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput([attackPlan]),
    )

    expect(built.summary.attackEnabled).toBe(true)
    expect(built.summary.attackerRiderIds).toEqual([
      'real-rider-1',
    ])
    expect(built.summary.deferredAttackCommandCount).toBe(1)
    expect(built.definition.controlledAttack.attackerRiderIds).toEqual(
      built.summary.attackerRiderIds,
    )
    expect(built.summary.earliestAttackKm).toBe(12.5)
    expect(built.summary.attackCheckpointIndex).toBeGreaterThan(0)
  })

  it('does not manufacture an attack when no saved command requests one', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput([
        {
          planId: 'neutral-plan',
          teamId: 'team-a',
          teamTacticJson: { plan: 'balanced' },
          riderIndividualTacticsJson: {
            'real-rider-1': {
              phase_1: {
                command: 'follow_team_plan',
                from_km: 0,
                to_km: 25,
              },
            },
          },
        },
      ]),
    )

    expect(built.summary.attackEnabled).toBe(false)
    expect(built.summary.attackerRiderIds).toEqual([])
    expect(built.summary.attackCheckpointIndex).toBeNull()
    expect(built.definition.controlledAttack.attackerRiderIds).toEqual([])
  })

  it('derives a caught request when explicit chase signals accompany an attack', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput([attackPlan, chasePlan]),
    )

    expect(built.summary.explicitChaseSignalCount).toBe(3)
    expect(built.summary.requestedOutcome).toBe('caught')
  })

  it('derives a survival request when an attack has no explicit chase signal', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput([attackPlan]),
    )

    expect(built.summary.explicitChaseSignalCount).toBe(0)
    expect(built.summary.requestedOutcome).toBe('survived')
  })

  it('is deterministic for the same field and saved plans', () => {
    const input = buildInput([attackPlan, chasePlan])

    expect(
      buildStagePlanRoadStageDefinition(flatStageFixture, input),
    ).toEqual(
      buildStagePlanRoadStageDefinition(flatStageFixture, input),
    )
  })

  it('runs a no-order stage as one peloton while preserving the frozen B1 foundation', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput([]),
    )
    const result = runB1TerrainRoadStageSimulation(
      built.definition,
      {
        stageId: built.definition.stage.stageId,
        raceId: built.definition.stage.raceId,
        profile,
      },
      {
        outcome: built.summary.requestedOutcome,
        terrainEnabled: true,
        foundationDefinition: flatStageFixture,
      },
    )

    expect(result.checkpoints.every((checkpoint) => checkpoint.groups.length === 1)).toBe(true)
    expect(
      new Set(
        result.stageResults.results.map((row) => row.finishingGroupId),
      ).size,
    ).toBe(1)
    expect(result.foundation.stageResults.winnerFinishTimeSeconds).toBe(4048.485)
  })

  it('neutralizes a solo attack when a full-size peloton is physically faster', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput(
        [slowerAttackPlan, chasePlan],
        largeFieldRiders,
      ),
    )
    const result = runB1TerrainRoadStageSimulation(
      built.definition,
      {
        stageId: built.definition.stage.stageId,
        raceId: built.definition.stage.raceId,
        profile,
      },
      {
        outcome: built.summary.requestedOutcome,
        terrainEnabled: true,
        foundationDefinition: flatStageFixture,
      },
    )
    const splitCheckpoint = result.checkpoints.find(
      (checkpoint) => checkpoint.groups.length === 2,
    )
    const breakaway = splitCheckpoint?.groups.find(
      (group) =>
        group.groupId ===
        built.definition.controlledAttack.breakawayGroupId,
    )
    const peloton = splitCheckpoint?.groups.find(
      (group) =>
        group.groupId ===
        built.definition.separateGroupMovement.pelotonGroupId,
    )

    expect(built.summary.fieldRiderCount).toBe(96)
    expect(breakaway).toBeDefined()
    expect(peloton).toBeDefined()
    expect(peloton!.speedKmh).toBeGreaterThan(
      breakaway!.speedKmh,
    )
    expect(result.physicalOutcome).toBe('caught')
    expect(
      new Set(
        result.stageResults.results.map(
          (row) => row.finishingGroupId,
        ),
      ).size,
    ).toBe(1)
    expect(
      result.checkpoints.at(-1)?.groups,
    ).toHaveLength(1)
  })

  it('runs saved real attacker IDs through the accepted integrated split', () => {
    const built = buildStagePlanRoadStageDefinition(
      flatStageFixture,
      buildInput([attackPlan]),
    )
    const result = runB1TerrainRoadStageSimulation(
      built.definition,
      {
        stageId: built.definition.stage.stageId,
        raceId: built.definition.stage.raceId,
        profile,
      },
      {
        outcome: built.summary.requestedOutcome,
        terrainEnabled: true,
        foundationDefinition: flatStageFixture,
      },
    )
    const splitCheckpoint = result.checkpoints.find(
      (checkpoint) => checkpoint.groups.length === 2,
    )
    const breakaway = splitCheckpoint?.groups.find(
      (group) =>
        group.groupId === built.definition.controlledAttack.breakawayGroupId,
    )

    expect(splitCheckpoint).toBeDefined()
    expect(breakaway?.riderIds).toEqual([
      'real-rider-1',
    ])
    expect(result.stageResults.results).toHaveLength(riders.length)
  })
})
