/**
 * runRaceEngine.test.ts
 *
 * Consolidated tests for the PPM Universal Race v1 input contract,
 * validation, terrain-profile analysis, stage classification, difficulty,
 * Phase 2 rider readiness, fatigue balance, stage-skill weights, TTT rules,
 * deterministic suitability, favourites, four-phase commands, Phase 1
 * opening resolution, Phase 2 development, Phase 3 decisive-section,
 * Phase 4 chase-and-finish resolution, final Phase 3 safeguards, and the
 * Phase 4 intermediate-point catalogue, eligibility plan, deterministic
 * battle rankings, KOM category influence, exact awards, battle costs,
 * synchronized replay/commentary, the cumulative point ledger, and the
 * immutable Phase 6 finish-resolution foundation, flat-sprint resolver,
 * reduced-group sprint resolver, hill-finish resolver, summit-finish resolver,
 * cobbled-finish resolver, individual-time-trial resolver, prologue resolver,
 * team-time-trial resolver, pair-time-trial resolver, solo-finish resolver,
 * the cross-format Phase 6 completion audit, the Phase 6.1 engine-owned
 * starting-condition and full energy-chain regression audit, and the Phase 7
 * replay-timeline foundation, engine-owned calculated event checkpoints, and
 * the final Phase 7 replay-to-result synchronization validator, and the
 * Phase 8 complete pre-race condition, race-effort, fatigue, incident-risk, recovery-demand, and persistence-handoff contract.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  PPM_UNIVERSAL_RACE_ENGINE_KEY,
  PPM_UNIVERSAL_RACE_ENGINE_VERSION,
  PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
  PRODUCTION_SAVED_ROAD_COMMANDS,
  ROAD_COMMAND_INPUTS,
  ROAD_RACE_PHASES,
  STAGE_FORMATS,
  UNIVERSAL_PHASE10_OFFICIAL_STATUSES,
  UNIVERSAL_ROAD_COMMANDS,
  assertUniversalFinishResolutionComplete,
  buildUniversalFinishResolutionFoundation,
  buildUniversalPostStageUpdateSummary,
  buildTeamTimeTrialSuitabilityRules,
  calculateRoadCommandEffect,
  classifyUniversalFinishMode,
  assignPhase5PhysicalGroupIdentities,
  buildUniversalRaceCalibrationSummary,
  buildUniversalReplaySynchronizationSummary,
  buildUniversalPhase78AcceptanceReport,
  buildUniversalPhase9ModifierSummary,
  calculatePhase5OpeningBreakawayGapSeconds,
  calculatePhase5DevelopmentBreakawayGapSeconds,
  calculateDeterministicUnitRoll,
  calculateUniversalFatigueIncidentRiskMultiplier,
  calculateUniversalPhase10IncidentProbability,
  calculateUniversalPhase10TimeLimitPercentage,
  isUniversalPhase10OutsideTimeLimit,
  evaluateUniversalPostStagePersistenceDecision,
  calculateTeamTimeTrialCohesionPenaltyPct,
  getRoadCommandBehaviour,
  mergeAdjacentPhase5RoadGroups,
  runRaceEngine,
  calculateUniversalIndividualTimeTrialBaseSeconds,
  calculateUniversalPrologueBaseSeconds,
  scoreUniversalCobbledFinishRider,
  scoreUniversalHillFinishRider,
  scoreUniversalIndividualTimeTrialRider,
  scoreUniversalPrologueRider,
  scoreUniversalPairTimeTrialTeam,
  scoreUniversalTeamTimeTrialTeam,
  scoreUniversalSummitFinishRider,
  scoreUniversalReducedGroupSprintRider,
  UniversalRaceEngineValidationError,
  validateRunInput,
  type FinishType,
  type RaceType,
  type StageFormat,
  type TerrainType,
  type UniversalFinishRiderContext,
  type UniversalRaceEngineInput,
  type UniversalPhase5RoadGroupCandidate,
  applyUniversalReplayProgressGuarantee,
} from './runRaceEngine'
import {
  buildProductionUniversalRaceEngineInput,
  type ProductionUniversalRaceSources,
} from './buildProductionRaceInput'
import {
  UNIVERSAL_PHASE11_MANIFEST_CONTRACT,
  UNIVERSAL_RACE_STAGE_OUTPUT_CONTRACT,
  buildProductionUniversalRaceOutput,
} from './buildProductionRaceOutput'

function createValidInput(): UniversalRaceEngineInput {
  return {
    engine: {
      engineKey: PPM_UNIVERSAL_RACE_ENGINE_KEY,
      engineVersion: PPM_UNIVERSAL_RACE_ENGINE_VERSION,
      deterministicSeed: 'race-1:stage-1:v1',
    },
    race: {
      raceId: 'race-1',
      raceType: 'one_day',
      stageCount: 1,
    },
    stage: {
      raceId: 'race-1',
      stageId: 'stage-1',
      stageNumber: 1,
      stageFormat: 'road_race',
      terrainType: 'flat',
      profileType: 'sprinter',
      finishType: 'flat_finish',
      distanceKm: 120,
      elevationGainM: 500,
      summitFinish: false,
      terrainPercentages: {
        flat: 80,
        hilly: 15,
        mountain: 5,
        cobbled: 0,
      },
      profilePoints: [
        { km: 0, elevationM: 10 },
        { km: 60, elevationM: 120 },
        { km: 120, elevationM: 15 },
      ],
    },
    points: [
      {
        pointId: 'point-start',
        stageId: 'stage-1',
        pointType: 'START',
        kmFromStart: 0,
        name: 'Start',
        komCategory: null,
        pointsScheme: [],
        timeBonusSeconds: [],
        isFinishPoint: false,
        sortOrder: 0,
        metadata: {},
      },
      {
        pointId: 'point-sprint',
        stageId: 'stage-1',
        pointType: 'INTERMEDIATE_SPRINT',
        kmFromStart: 60,
        name: 'Intermediate sprint',
        komCategory: null,
        pointsScheme: [20, 17, 15],
        timeBonusSeconds: [3, 2, 1],
        isFinishPoint: false,
        sortOrder: 1,
        metadata: {},
      },
      {
        pointId: 'point-kom',
        stageId: 'stage-1',
        pointType: 'KOM',
        kmFromStart: 90,
        name: 'Category 3 climb',
        komCategory: '3',
        pointsScheme: [5, 3, 2, 1],
        timeBonusSeconds: [],
        isFinishPoint: false,
        sortOrder: 2,
        metadata: {},
      },
      {
        pointId: 'point-finish',
        stageId: 'stage-1',
        pointType: 'FINISH',
        kmFromStart: 120,
        name: 'Finish',
        komCategory: null,
        pointsScheme: [50, 35, 30],
        timeBonusSeconds: [10, 6, 4],
        isFinishPoint: true,
        sortOrder: 3,
        metadata: {},
      },
    ],
    teams: [
      {
        participantTeamId: 'participant-team-a',
        teamId: 'team-a',
        clubId: 'club-a',
        participatingClubId: 'club-a',
        ownerClubId: 'club-a',
        parentClubId: null,
        raceTeamEntryId: 'entry-a',
        clubType: 'main',
        acceptedRiderIds: ['rider-1', 'rider-2'],
        snapshot: {
          teamName: 'Team A',
          countryCode: 'DE',
        },
      },
      {
        participantTeamId: 'participant-team-b',
        teamId: 'team-b',
        clubId: 'club-b',
        participatingClubId: 'club-b',
        ownerClubId: 'club-b',
        parentClubId: null,
        raceTeamEntryId: 'entry-b',
        clubType: 'main',
        acceptedRiderIds: ['rider-3', 'rider-4'],
        snapshot: {
          teamName: 'Team B',
          countryCode: 'FR',
        },
      },
    ],
    riders: [
      createRider('rider-1', 'participant-rider-1', 'team-a', 80),
      createRider('rider-2', 'participant-rider-2', 'team-a', 70),
      createRider('rider-3', 'participant-rider-3', 'team-b', 75),
      createRider('rider-4', 'participant-rider-4', 'team-b', 65),
    ],
    stagePlans: [
      {
        teamId: 'team-a',
        teamTactic: 'balanced',
        status: 'locked',
        locked: true,
        defaulted: false,
        riders: [
          {
            riderId: 'rider-1',
            stageRole: 'team_leader_gc',
            commands: {
              phase1: 'stay_near_front',
              phase2: 'protect_leader',
              phase3: 'conserve_energy',
              phase4: 'final_sprint',
            },
            equipmentSelection: null,
            supplySelection: null,
          },
          {
            riderId: 'rider-2',
            stageRole: 'helper_domestique',
            commands: {
              phase1: 'follow_team_plan',
              phase2: 'control_tempo',
              phase3: 'chase_breakaway',
              phase4: 'lead_out_rider',
            },
            equipmentSelection: null,
            supplySelection: null,
          },
        ],
        metadata: {},
      },
      {
        teamId: 'team-b',
        teamTactic: 'aggressive',
        status: 'locked',
        locked: true,
        defaulted: false,
        riders: [
          {
            riderId: 'rider-3',
            stageRole: 'breakaway_rider',
            commands: {
              phase1: 'join_breakaway',
              phase2: 'attack',
              phase3: 'fight_sprint_points',
              phase4: 'fight_sprint_points',
            },
            equipmentSelection: null,
            supplySelection: null,
          },
          {
            riderId: 'rider-4',
            stageRole: 'free_role',
            commands: {
              phase1: 'avoid_risks',
              phase2: 'follow_team_plan',
              phase3: 'fight_kom_points',
              phase4: 'avoid_risks',
            },
            equipmentSelection: null,
            supplySelection: null,
          },
        ],
        metadata: {},
      },
    ],
    weather: {
      condition: 'clear',
      temperatureC: 22,
      windKmh: 12,
      precipitationMm: 0,
      rainProbabilityPct: 10,
      cancelled: false,
      cancellationReason: null,
      source: 'test',
      snapshot: {},
    },
    preparation: {
      equipment: {},
      staff: {},
      assets: {},
      raceSupplies: {},
      standardizedBonuses: {},
    },
  }
}

function createSoloFinishInput(): UniversalRaceEngineInput {
  const input = createValidInput()
  return {
    ...input,
    riders: input.riders.map((rider, index) =>
      index === 0
        ? rider
        : { ...rider, startStatus: 'dns' as const },
    ),
  }
}

function createRider(
  riderId: string,
  participantRiderId: string,
  teamId: string,
  overall: number,
) {
  return {
    participantRiderId,
    riderId,
    teamId,
    participatingClubId: teamId === 'team-a' ? 'club-a' : 'club-b',
    sprint: overall,
    climbing: overall,
    timeTrial: overall,
    flat: overall,
    endurance: overall,
    recovery: overall,
    resistance: overall,
    raceIQ: overall,
    teamwork: overall,
    overall,
    morale: 75,
    fatigueBeforeStage: 10,
    raceSharpness: 70,
    startStamina: 90,
    recentFormScore: 0,
    availabilityStatus: 'fit' as const,
    unavailableUntil: null,
    unavailableReason: null,
    startStatus: 'starter' as const,
    healthSnapshot: null,
    snapshot: {
      displayName: riderId,
    },
  }
}

function withStageFormat(
  input: UniversalRaceEngineInput,
  values: {
    readonly raceType?: RaceType
    readonly stageFormat: StageFormat
    readonly terrainType: TerrainType
    readonly finishType: FinishType
    readonly profileType?: string | null
  },
): UniversalRaceEngineInput {
  return {
    ...input,
    race: {
      ...input.race,
      raceType: values.raceType ?? input.race.raceType,
    },
    stage: {
      ...input.stage,
      stageFormat: values.stageFormat,
      terrainType: values.terrainType,
      finishType: values.finishType,
      profileType: values.profileType ?? input.stage.profileType,
    },
  }
}

function withTimeTrialRules(
  input: UniversalRaceEngineInput,
  countingRiderNumber: number | null,
): UniversalRaceEngineInput {
  return {
    ...input,
    stage: {
      ...input.stage,
      timeTrialRules: {
        startOrderMode: 'automatic',
        startIntervalSeconds: 180,
        countingRiderNumber,
        equipmentRequired: true,
        replayDurationSeconds: 900,
        droppedRiderTimeMode: 'personal_time',
        metadata: {},
      },
    },
  }
}


function createExpandedFieldInput(riderCount = 26): UniversalRaceEngineInput {
  const base = createValidInput()
  const ridersPerTeam = 6
  const teamCount = Math.ceil(riderCount / ridersPerTeam)
  const teams: UniversalRaceEngineInput['teams'][number][] = []
  const riders: UniversalRaceEngineInput['riders'][number][] = []
  const stagePlans: UniversalRaceEngineInput['stagePlans'][number][] = []

  for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
    const teamId = `expanded-team-${teamIndex + 1}`
    const clubId = `expanded-club-${teamIndex + 1}`
    const acceptedRiderIds: string[] = []
    const planRiders: UniversalRaceEngineInput['stagePlans'][number]['riders'][number][] = []

    for (
      let teamRiderIndex = 0;
      teamRiderIndex < ridersPerTeam;
      teamRiderIndex += 1
    ) {
      const fieldIndex = teamIndex * ridersPerTeam + teamRiderIndex
      if (fieldIndex >= riderCount) break

      const riderNumber = fieldIndex + 1
      const riderId = `expanded-rider-${String(riderNumber).padStart(2, '0')}`
      const overall = 55 + ((fieldIndex * 7) % 36)
      const roleCycle = [
        'Leader',
        'Sprinter',
        'Climber',
        'TT',
        'Breakaway',
        'Domestique',
      ] as const
      const stageRoleCycle = [
        'team_leader_gc',
        'sprinter',
        'climber',
        'rouleur',
        'breakaway_rider',
        'helper_domestique',
      ] as const
      const stageRole = stageRoleCycle[teamRiderIndex]

      acceptedRiderIds.push(riderId)
      riders.push({
        ...createRider(
          riderId,
          `expanded-participant-${riderNumber}`,
          teamId,
          overall,
        ),
        participatingClubId: clubId,
        seasonResultPoints: fieldIndex * 9,
        roleSnapshot: roleCycle[teamRiderIndex],
        snapshot: {
          displayName: `Expanded Rider ${String(riderNumber).padStart(2, '0')}`,
          startNumber: riderNumber,
        },
      })
      planRiders.push({
        riderId,
        stageRole,
        commands: {
          phase1:
            stageRole === 'breakaway_rider'
              ? 'join_breakaway'
              : 'follow_team_plan',
          phase2:
            stageRole === 'breakaway_rider' ? 'attack' : 'follow_team_plan',
          phase3: 'follow_team_plan',
          phase4:
            stageRole === 'sprinter' ? 'final_sprint' : 'follow_team_plan',
        },
        equipmentSelection: null,
        supplySelection: null,
      })
    }

    teams.push({
      participantTeamId: `expanded-participant-team-${teamIndex + 1}`,
      teamId,
      clubId,
      participatingClubId: clubId,
      ownerClubId: clubId,
      parentClubId: null,
      raceTeamEntryId: `expanded-entry-${teamIndex + 1}`,
      clubType: 'main',
      acceptedRiderIds,
      snapshot: {
        teamName: `Expanded Team ${teamIndex + 1}`,
        countryCode: 'DE',
      },
    })
    stagePlans.push({
      teamId,
      teamTactic: 'balanced',
      status: 'locked',
      locked: true,
      defaulted: false,
      riders: planRiders,
      metadata: {},
    })
  }

  return {
    ...base,
    teams,
    riders,
    stagePlans,
  }
}

function createSuccessfulOpeningEscapeInput(): UniversalRaceEngineInput {
  const base = createValidInput()
  return {
    ...base,
    stagePlans: base.stagePlans.map((plan) => ({
      ...plan,
      riders: plan.riders.map((riderPlan) =>
        riderPlan.riderId === 'rider-3'
          ? {
              ...riderPlan,
              commands: { ...riderPlan.commands, phase1: 'attack' },
            }
          : riderPlan,
      ),
    })),
    riders: base.riders.map((rider) =>
      rider.riderId === 'rider-3'
        ? {
            ...rider,
            flat: 100,
            endurance: 100,
            resistance: 100,
            raceIQ: 100,
            morale: 100,
          }
        : rider,
    ),
  }
}

function expectValidationField(
  input: UniversalRaceEngineInput,
  field: string,
): void {
  const errors = validateRunInput(input)
  expect(errors.some((error) => error.field === field)).toBe(true)
  expect(() => runRaceEngine(input)).toThrow(UniversalRaceEngineValidationError)
}

describe('PPM Universal Race v1 input contract', () => {
  it('accepts a valid one-day road race', () => {
    const result = runRaceEngine(createValidInput())

    expect(result.engineKey).toBe(PPM_UNIVERSAL_RACE_ENGINE_KEY)
    expect(result.engineVersion).toBe(PPM_UNIVERSAL_RACE_ENGINE_VERSION)
    expect(result.raceId).toBe('race-1')
    expect(result.stageId).toBe('stage-1')
    expect(result.validationPassed).toBe(true)
    expect(result.stageClassification).toBe('flat_road_stage')
    expect(result.terrain.flatShare).toBe(1)
  })

  it('accepts a valid road stage inside a stage race', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      race: {
        ...input.race,
        raceType: 'stage_race',
        stageCount: 5,
      },
    })

    expect(result.validationPassed).toBe(true)
  })

  it('accepts an individual time trial', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })

    expect(runRaceEngine(input).stageClassification).toBe(
      'individual_time_trial',
    )
  })

  it('accepts a team time trial', () => {
    const input = withTimeTrialRules(
      withStageFormat(createExpandedFieldInput(12), {
        stageFormat: 'team_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      4,
    )

    expect(runRaceEngine(input).stageClassification).toBe('team_time_trial')
  })

  it('accepts a pair time trial', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'pair_time_trial',
      terrainType: 'team_time_trial',
      finishType: 'team_time_trial_finish',
      profileType: 'time_trial',
    })

    expect(runRaceEngine(input).stageClassification).toBe('pair_time_trial')
  })

  it('accepts a prologue', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'prologue',
      terrainType: 'prologue',
      finishType: 'prologue_finish',
      profileType: 'time_trial',
    })

    expect(runRaceEngine(input).stageClassification).toBe('prologue')
  })

  it('accepts a cobbled road stage as road_race plus cobbled terrain', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'road_race',
      terrainType: 'cobbled',
      finishType: 'cobbled_finish',
      profileType: 'cobbled',
    })

    expect(runRaceEngine(input).stageClassification).toBe(
      'cobbled_road_stage',
    )
  })

  it('returns identical results for identical inputs', () => {
    const input = createValidInput()

    expect(runRaceEngine(input)).toEqual(runRaceEngine(input))
  })

  it('rejects an invalid race type', () => {
    const input = createValidInput()
    const invalid = {
      ...input,
      race: {
        ...input.race,
        raceType: 'road_race',
      },
    } as unknown as UniversalRaceEngineInput

    expectValidationField(invalid, 'race.raceType')
  })

  it('rejects an invalid stage format', () => {
    const input = createValidInput()
    const invalid = {
      ...input,
      stage: {
        ...input.stage,
        stageFormat: 'cobbled_road',
      },
    } as unknown as UniversalRaceEngineInput

    expectValidationField(invalid, 'stage.stageFormat')
  })

  it('rejects an invalid finish type', () => {
    const input = createValidInput()
    const invalid = {
      ...input,
      stage: {
        ...input.stage,
        finishType: 'mass',
      },
    } as unknown as UniversalRaceEngineInput

    expectValidationField(invalid, 'stage.finishType')
  })

  it('rejects an empty deterministic seed', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      engine: {
        ...input.engine,
        deterministicSeed: '',
      },
    }

    expectValidationField(invalid, 'engine.deterministicSeed')
  })

  it('rejects an invalid distance', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      stage: {
        ...input.stage,
        distanceKm: 0,
      },
    }

    expectValidationField(invalid, 'stage.distanceKm')
  })


  it('rejects a sprint-zone distance above the supported five-kilometre maximum', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      stage: {
        ...input.stage,
        sprintZoneKm: 5.01,
      },
    }

    expectValidationField(invalid, 'stage.sprintZoneKm')
  })

  it('rejects unordered profile points', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      stage: {
        ...input.stage,
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 80, elevationM: 100 },
          { km: 70, elevationM: 80 },
          { km: 120, elevationM: 0 },
        ],
      },
    }

    expectValidationField(invalid, 'stage.profilePoints[2].km')
  })

  it('rejects a profile that does not begin at kilometre zero', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      stage: {
        ...input.stage,
        profilePoints: [
          { km: 1, elevationM: 0 },
          { km: 120, elevationM: 0 },
        ],
      },
    }

    expectValidationField(invalid, 'stage.profilePoints[0].km')
  })

  it('rejects a profile that does not end at stage distance', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      stage: {
        ...input.stage,
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 119, elevationM: 0 },
        ],
      },
    }

    expectValidationField(invalid, 'stage.profilePoints[1].km')
  })

  it('rejects a point outside stage distance', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      points: input.points.map((point) =>
        point.pointId === 'point-sprint'
          ? { ...point, kmFromStart: 121 }
          : point,
      ),
    }

    expectValidationField(invalid, 'points[1].kmFromStart')
  })

  it('rejects a duplicate participant team', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      teams: [input.teams[0], { ...input.teams[1], participantTeamId: 'participant-team-a' }],
    }

    expectValidationField(invalid, 'teams[1].participantTeamId')
  })

  it('rejects a duplicate rider input', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      riders: [input.riders[0], { ...input.riders[1], riderId: 'rider-1' }],
    }

    expectValidationField(invalid, 'riders[1].riderId')
  })

  it('rejects a rider assigned to no accepted team', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      teams: input.teams.map((team) => ({
        ...team,
        acceptedRiderIds: team.acceptedRiderIds.filter(
          (riderId) => riderId !== 'rider-1',
        ),
      })),
    }

    expectValidationField(invalid, 'riders[0].riderId')
  })

  it('rejects a rider assigned to two accepted teams', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      teams: [
        input.teams[0],
        {
          ...input.teams[1],
          acceptedRiderIds: [...input.teams[1].acceptedRiderIds, 'rider-1'],
        },
      ],
    }

    expectValidationField(invalid, 'teams[1].acceptedRiderIds[2]')
  })

  it('rejects a stage plan that references an unknown rider', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      stagePlans: [
        {
          ...input.stagePlans[0],
          riders: [
            ...input.stagePlans[0].riders,
            {
              ...input.stagePlans[0].riders[0],
              riderId: 'unknown-rider',
            },
          ],
        },
        input.stagePlans[1],
      ],
    }

    expectValidationField(invalid, 'stagePlans[0].riders[2].riderId')
  })

  it('rejects a rider numeric input above the verified range', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      riders: [
        { ...input.riders[0], sprint: 101 },
        ...input.riders.slice(1),
      ],
    }

    expectValidationField(invalid, 'riders[0].sprint')
  })

  it('rejects numeric phase commands', () => {
    const input = createValidInput()
    const invalid = {
      ...input,
      stagePlans: [
        {
          ...input.stagePlans[0],
          riders: [
            {
              ...input.stagePlans[0].riders[0],
              commands: {
                ...input.stagePlans[0].riders[0].commands,
                phase1: 80,
              },
            },
            input.stagePlans[0].riders[1],
          ],
        },
        input.stagePlans[1],
      ],
    } as unknown as UniversalRaceEngineInput

    expectValidationField(invalid, 'stagePlans[0].riders[0].commands.phase1')
  })

  it('contains no generic default of 80', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toMatch(/\?\?\s*80\b/)
    expect(source).not.toMatch(/\|\|\s*80\b/)
    expect(source).not.toMatch(/default\w*\s*=\s*80\b/i)
  })

  it('contains no named-race or old-fixture condition', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toMatch(/Rio Tour|RIO_TOUR|B1|flatStageFixture|canonicalRoadStages/)
  })

  it('does not import forbidden old-engine modules', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )
    const importSpecifiers = Array.from(
      source.matchAll(/from\s+['"]([^'"]+)['"]/g),
      (match) => match[1],
    )

    expect(importSpecifiers).not.toContainEqual(
      expect.stringContaining('race-simulator-v2'),
    )
    expect(importSpecifiers).not.toContainEqual(
      expect.stringContaining('/race-engine/'),
    )
    expect(importSpecifiers).not.toContainEqual(
      expect.stringContaining('race-replay'),
    )
    expect(importSpecifiers).not.toContainEqual(
      expect.stringContaining('pages/dev'),
    )
  })
})

describe('PPM Universal Race v1 terrain analysis and classification', () => {
  function withProfile(
    input: UniversalRaceEngineInput,
    distanceKm: number,
    profilePoints: UniversalRaceEngineInput['stage']['profilePoints'],
    stageOverrides: Partial<UniversalRaceEngineInput['stage']> = {},
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stage: {
        ...input.stage,
        ...stageOverrides,
        distanceKm,
        profilePoints,
      },
      points: [],
    }
  }

  it('classifies flat, hilly, mountain, and cobbled road stages from stored terrain type', () => {
    const input = createValidInput()

    expect(
      runRaceEngine({
        ...input,
        stage: { ...input.stage, terrainType: 'flat' },
      }).stageClassification,
    ).toBe('flat_road_stage')

    expect(
      runRaceEngine({
        ...input,
        stage: { ...input.stage, terrainType: 'hilly' },
      }).stageClassification,
    ).toBe('hilly_road_stage')

    expect(
      runRaceEngine({
        ...input,
        stage: { ...input.stage, terrainType: 'mountain' },
      }).stageClassification,
    ).toBe('mountain_road_stage')

    expect(
      runRaceEngine({
        ...input,
        stage: {
          ...input.stage,
          terrainType: 'cobbled',
          finishType: 'cobbled_finish',
        },
      }).stageClassification,
    ).toBe('cobbled_road_stage')
  })

  it('rejects an incompatible stage format and terrain type', () => {
    const input = createValidInput()
    const invalid: UniversalRaceEngineInput = {
      ...input,
      stage: {
        ...input.stage,
        stageFormat: 'individual_time_trial',
        terrainType: 'flat',
        finishType: 'time_trial_finish',
      },
    }

    expectValidationField(invalid, 'stage.terrainType')
  })

  it('returns terrain shares that total exactly one', () => {
    const input = withProfile(createValidInput(), 40, [
      { km: 0, elevationM: 0 },
      { km: 10, elevationM: 0 },
      { km: 20, elevationM: 200 },
      { km: 30, elevationM: 100 },
      { km: 40, elevationM: 100 },
    ])

    const terrain = runRaceEngine(input).terrain

    expect(
      terrain.flatShare +
        terrain.rollingShare +
        terrain.climbingShare +
        terrain.descentShare,
    ).toBe(1)
  })

  it('weights terrain shares by segment distance rather than segment count', () => {
    const input = withProfile(createValidInput(), 10, [
      { km: 0, elevationM: 0 },
      { km: 8, elevationM: 0 },
      { km: 10, elevationM: 200 },
    ])

    const terrain = runRaceEngine(input).terrain

    expect(terrain.flatShare).toBe(0.8)
    expect(terrain.climbingShare).toBe(0.2)
  })

  it('calculates flat, rolling, climbing, and descent shares', () => {
    const input = withProfile(createValidInput(), 40, [
      { km: 0, elevationM: 0 },
      { km: 10, elevationM: 0 },
      { km: 20, elevationM: 400 },
      { km: 30, elevationM: 100 },
      { km: 40, elevationM: 250 },
    ])

    const terrain = runRaceEngine(input).terrain

    expect(terrain.flatShare).toBe(0.25)
    expect(terrain.rollingShare).toBe(0.25)
    expect(terrain.climbingShare).toBe(0.25)
    expect(terrain.descentShare).toBe(0.25)
  })

  it('sums only positive elevation changes for total ascent', () => {
    const input = withProfile(createValidInput(), 20, [
      { km: 0, elevationM: 200 },
      { km: 5, elevationM: 100 },
      { km: 10, elevationM: 300 },
      { km: 15, elevationM: 250 },
      { km: 20, elevationM: 400 },
    ])

    expect(runRaceEngine(input).terrain.totalAscentM).toBe(350)
  })

  it('calculates ascent per 100 kilometres', () => {
    const input = withProfile(createValidInput(), 20, [
      { km: 0, elevationM: 0 },
      { km: 20, elevationM: 1000 },
    ])

    expect(runRaceEngine(input).terrain.ascentPer100Km).toBe(5000)
  })

  it('calculates the longest consecutive climb', () => {
    const input = withProfile(createValidInput(), 8, [
      { km: 0, elevationM: 0 },
      { km: 1, elevationM: 40 },
      { km: 3, elevationM: 120 },
      { km: 4, elevationM: 120 },
      { km: 5, elevationM: 160 },
      { km: 8, elevationM: 280 },
    ])

    expect(runRaceEngine(input).terrain.longestClimbKm).toBe(4)
  })

  it('does not combine climbs separated by a non-climbing segment', () => {
    const input = withProfile(createValidInput(), 7, [
      { km: 0, elevationM: 0 },
      { km: 2, elevationM: 80 },
      { km: 3, elevationM: 80 },
      { km: 7, elevationM: 240 },
    ])

    expect(runRaceEngine(input).terrain.longestClimbKm).toBe(4)
  })

  it('ignores positive-gradient segments shorter than 0.5 km for maximum important gradient', () => {
    const input = withProfile(createValidInput(), 2, [
      { km: 0, elevationM: 0 },
      { km: 0.2, elevationM: 100 },
      { km: 1, elevationM: 116 },
      { km: 2, elevationM: 216 },
    ])

    expect(runRaceEngine(input).terrain.maximumImportantGradient).toBe(10)
  })

  it('detects a summit finish from the stored boolean', () => {
    const input = createValidInput()

    expect(
      runRaceEngine({
        ...input,
        stage: { ...input.stage, summitFinish: true },
      }).terrain.summitFinish,
    ).toBe(true)
  })

  it('detects a summit finish from summit_finish', () => {
    const input = createValidInput()

    expect(
      runRaceEngine({
        ...input,
        stage: { ...input.stage, finishType: 'summit_finish' },
      }).terrain.summitFinish,
    ).toBe(true)
  })

  it('allows negative elevation values below sea level', () => {
    const input = withProfile(createValidInput(), 10, [
      { km: 0, elevationM: -20 },
      { km: 10, elevationM: 0 },
    ])

    expect(runRaceEngine(input).validationPassed).toBe(true)
  })

  it('produces identical complete results for identical inputs', () => {
    const input = withProfile(createValidInput(), 10, [
      { km: 0, elevationM: 0 },
      { km: 5, elevationM: 200 },
      { km: 10, elevationM: 100 },
    ])

    expect(runRaceEngine(input)).toEqual(runRaceEngine(input))
  })
})

describe('PPM Universal Race v1 difficulty classification', () => {
  function withDifficultyProfile(
    input: UniversalRaceEngineInput,
    distanceKm: number,
    profilePoints: UniversalRaceEngineInput['stage']['profilePoints'],
    stageOverrides: Partial<UniversalRaceEngineInput['stage']> = {},
    weather: UniversalRaceEngineInput['weather'] = input.weather,
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stage: {
        ...input.stage,
        ...stageOverrides,
        distanceKm,
        profilePoints,
      },
      points: [],
      weather,
    }
  }

  it('assigns all five difficulty categories from production-calibrated metrics', () => {
    const base = createValidInput()

    const easy = withDifficultyProfile(
      base,
      4,
      [
        { km: 0, elevationM: 0 },
        { km: 4, elevationM: 0 },
      ],
      {
        stageFormat: 'prologue',
        terrainType: 'prologue',
        finishType: 'prologue_finish',
      },
    )

    const moderate = withDifficultyProfile(
      base,
      180,
      [
        { km: 0, elevationM: 0 },
        { km: 180, elevationM: 0 },
      ],
      { finishType: 'uphill_finish' },
    )

    const hard = withDifficultyProfile(base, 160, [
      { km: 0, elevationM: 0 },
      { km: 10, elevationM: 800 },
      { km: 160, elevationM: 800 },
    ])

    const veryHard = withDifficultyProfile(
      base,
      170,
      [
        { km: 0, elevationM: 0 },
        { km: 10, elevationM: 1500 },
        { km: 170, elevationM: 1500 },
      ],
      {
        terrainType: 'mountain',
        finishType: 'summit_finish',
        summitFinish: true,
      },
    )

    const extreme = withDifficultyProfile(
      base,
      200,
      [
        { km: 0, elevationM: 0 },
        { km: 25, elevationM: 3000 },
        { km: 200, elevationM: 3000 },
      ],
      {
        terrainType: 'mountain',
        finishType: 'summit_finish',
        summitFinish: true,
      },
    )

    expect(runRaceEngine(easy).difficulty.category).toBe(1)
    expect(runRaceEngine(moderate).difficulty.category).toBe(2)
    expect(runRaceEngine(hard).difficulty.category).toBe(3)
    expect(runRaceEngine(veryHard).difficulty.category).toBe(4)
    expect(runRaceEngine(extreme).difficulty.category).toBe(5)
  })

  it('includes finish profile in difficulty', () => {
    const base = withDifficultyProfile(createValidInput(), 160, [
      { km: 0, elevationM: 0 },
      { km: 160, elevationM: 0 },
    ])

    const flat = runRaceEngine(base).difficulty
    const summit = runRaceEngine({
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        finishType: 'summit_finish',
        summitFinish: true,
      },
    }).difficulty

    expect(summit.score > flat.score).toBe(true)
    expect(summit.components.finishProfile).toBe(4)
  })

  it('includes runnable weather severity in difficulty', () => {
    const base = withDifficultyProfile(createValidInput(), 160, [
      { km: 0, elevationM: 0 },
      { km: 160, elevationM: 0 },
    ])

    const neutral = runRaceEngine(base).difficulty
    const severe = runRaceEngine({
      ...base,
      weather: {
        ...base.weather!,
        condition: 'heavy_rain',
        temperatureC: 8,
        windKmh: 36,
        precipitationMm: 12,
        rainProbabilityPct: 75,
        crosswindRisk: 'high',
        descentRisk: 'medium_high',
        surfaceRisk: 'high',
      },
    }).difficulty

    expect(severe.score > neutral.score).toBe(true)
    expect(severe.components.weatherSeverity).toBe(4)
  })

  it('treats missing weather as neutral', () => {
    const input = createValidInput()
    const withoutWeather: UniversalRaceEngineInput = {
      ...input,
      weather: undefined,
    }

    expect(runRaceEngine(withoutWeather).difficulty.components.weatherSeverity).toBe(0)
  })

  it('does not parse arbitrary free-form condition names as weather severity', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      weather: {
        ...input.weather!,
        condition: 'warm_valley_cool_high_mountain_finish',
        temperatureC: 22,
        windKmh: 12,
        precipitationMm: 0,
        rainProbabilityPct: 10,
      },
    })

    expect(result.difficulty.components.weatherSeverity).toBe(0)
  })

  it('rejects stages already cancelled by weather', () => {
    const input = createValidInput()
    expectValidationField(
      {
        ...input,
        weather: { ...input.weather!, cancelled: true },
      },
      'weather.cancelled',
    )
  })

  it('rejects runnable weather below the backend cancellation temperature', () => {
    const input = createValidInput()
    expectValidationField(
      {
        ...input,
        weather: { ...input.weather!, temperatureC: 4.9 },
      },
      'weather.temperatureC',
    )
  })

  it('rejects the exact canonical snow condition before calculation', () => {
    const input = createValidInput()
    expectValidationField(
      {
        ...input,
        weather: { ...input.weather!, condition: 'snow' },
      },
      'weather.condition',
    )
  })

  it('returns deterministic difficulty for identical inputs', () => {
    const input = createValidInput()
    expect(runRaceEngine(input).difficulty).toEqual(
      runRaceEngine(input).difficulty,
    )
  })
})

describe('PPM Universal Race v1 rider readiness', () => {
  it('returns the universal readiness contract for every rider', () => {
    const result = runRaceEngine(createValidInput())

    expect(result.riderReadiness).toHaveLength(4)
    expect(result.riderReadiness[0]).toMatchObject({
      riderId: 'rider-1',
      teamId: 'team-a',
      eligibleToStart: true,
      modelVersion: 'universal_rider_readiness_v2',
    })
    expect(result.riderReadiness[0].components).toMatchObject({
      effectiveFatigue: 10,
      raceSharpness: 70,
      recentFormScore: 0,
    })
    expect(result.riderReadiness[0].fatigueBalance).toMatchObject({
      active: true,
      directFatigueEnergyCostMultiplier: 1,
      inStageEnergyCostMultiplier: 1,
      postStageFatigueMultiplier: 1,
      postStageRecoveryBonusPoints: 0,
      fatigueWritePolicy: 'ledger_guarded_once',
      historicalReapplyAllowed: false,
      modelVersion: 'universal_fatigue_balance_v2',
    })
  })

  it('uses the authoritative start-freshness formula', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              fatigueBeforeStage: 40,
              raceSharpness: 70,
              recentFormScore: 0,
              morale: 65,
            }
          : rider,
      ),
    })

    const readiness = result.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(readiness.components.startFreshness).toBe(85)
    expect(readiness.readinessScore).toBe(85)
  })

  it('clamps fatigue to the configured 0-100 limits', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) => {
        if (index === 0) return { ...rider, fatigueBeforeStage: -20 }
        if (index === 1) return { ...rider, fatigueBeforeStage: 140 }
        return rider
      }),
    })

    const low = result.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const high = result.riderReadiness.find(
      (row) => row.riderId === 'rider-2',
    )!

    expect(low.components.effectiveFatigue).toBe(0)
    expect(high.components.effectiveFatigue).toBe(100)
    expect(high.components.startFreshness).toBe(55)
  })

  it('uses recent form on the authoritative -15 to 30 scale', () => {
    const input = createValidInput()
    const poor = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0 ? { ...rider, recentFormScore: -15 } : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    const excellent = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0 ? { ...rider, recentFormScore: 30 } : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(poor.components.normalizedRecentForm).toBe(0)
    expect(excellent.components.normalizedRecentForm).toBe(100)
    expect(excellent.readinessScore).toBeGreaterThan(poor.readinessScore)
  })

  it('applies the production not-fully-fit readiness penalty', () => {
    const input = createValidInput()
    const neutralRiders = input.riders.map((rider, index) =>
      index === 0
        ? {
            ...rider,
            fatigueBeforeStage: 30,
            raceSharpness: 50,
            morale: 65,
            recentFormScore: 0,
          }
        : rider,
    )
    const fit = runRaceEngine({
      ...input,
      riders: neutralRiders,
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!
    const limited = runRaceEngine({
      ...input,
      riders: neutralRiders.map((rider, index) =>
        index === 0
          ? { ...rider, availabilityStatus: 'not_fully_fit' as const }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(limited.components.availabilityModifier).toBe(-8)
    expect(fit.readinessScore - limited.readinessScore).toBe(8)
  })

  it('marks injured and sick DNS riders unavailable', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              availabilityStatus: 'injured' as const,
              startStatus: 'dns' as const,
            }
          : rider,
      ),
    })
    const readiness = result.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(readiness.eligibleToStart).toBe(false)
    expect(readiness.readinessScore).toBe(0)
    expect(readiness.label).toBe('unavailable')
  })

  it('honours selection-blocking health cases and return fatigue floors', () => {
    const input = createValidInput()
    const blocked = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              startStatus: 'dns' as const,
              healthCase: {
                healthCaseId: 'health-1',
                caseType: 'injury' as const,
                severity: 'moderate' as const,
                status: 'active' as const,
                selectionBlocked: true,
                fatigueFloorOnReturn: 60,
                activeUntil: '2026-08-03',
                recoveryUntil: '2026-08-05',
              },
            }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(blocked.healthSelectionBlocked).toBe(true)
    expect(blocked.eligibleToStart).toBe(false)

    const recovering = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              healthCase: {
                healthCaseId: 'health-2',
                caseType: 'sickness' as const,
                severity: 'minor' as const,
                status: 'recovering' as const,
                selectionBlocked: false,
                fatigueFloorOnReturn: 45,
                activeUntil: '2026-08-01',
                recoveryUntil: '2026-08-04',
              },
            }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(recovering.healthFatigueFloor).toBe(45)
    expect(recovering.components.effectiveFatigue).toBe(45)
  })

  it('reports previous-stage recovery without double-counting it', () => {
    const input = createValidInput()
    const readiness = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              fatigueBeforeStage: 30,
              previousStage: {
                stageId: 'stage-previous',
                stageStatus: 'finished' as const,
                finishStamina: 22,
                fatigueAfterStage: 55,
                fatigueGain: 25,
                daysSincePreviousStage: 1,
              },
            }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(readiness.previousStageRecovery).toEqual({
      stageId: 'stage-previous',
      stageStatus: 'finished',
      finishStamina: 22,
      fatigueAfterPreviousStage: 55,
      fatigueBeforeCurrentStage: 30,
      recoveredFatiguePoints: 25,
      accumulatedFatiguePoints: 0,
      daysSincePreviousStage: 1,
      state: 'recovered',
      representedByCurrentFatigue: true,
    })
  })

  it('uses start freshness once for pre-stage performance and start energy', () => {
    const input = createValidInput()
    const readiness = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              fatigueBeforeStage: 40,
              raceSharpness: 70,
              morale: 65,
              recentFormScore: 0,
            }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(readiness.components.startFreshness).toBe(85)
    expect(readiness.fatigueBalance.startEnergy).toBe(85)
    expect(readiness.fatigueBalance.preStagePerformanceModifier).toBe(0)
    expect(readiness.fatigueBalance.channels).toEqual({
      preStagePerformance: 'start_freshness',
      inStageEnergy: 'start_energy',
      postStageFatigue: 'ledger_guarded_once',
      betweenStageRecovery: 'current_fatigue_snapshot',
    })
  })

  it('does not multiply movement energy cost by raw fatigue a second time', () => {
    const input = createValidInput()
    const lowFatigue = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? { ...rider, fatigueBeforeStage: 0, raceSharpness: 50 }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!
    const highFatigue = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? { ...rider, fatigueBeforeStage: 100, raceSharpness: 0 }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(lowFatigue.fatigueBalance.startEnergy).toBe(100)
    expect(highFatigue.fatigueBalance.startEnergy).toBe(37.5)
    expect(lowFatigue.fatigueBalance.directFatigueEnergyCostMultiplier).toBe(1)
    expect(highFatigue.fatigueBalance.directFatigueEnergyCostMultiplier).toBe(1)
    expect(lowFatigue.fatigueBalance.inStageEnergyCostMultiplier).toBe(1)
    expect(highFatigue.fatigueBalance.inStageEnergyCostMultiplier).toBe(1)
  })

  it('uses one engine-owned starting condition instead of the supplied legacy startStamina', () => {
    const input = createValidInput()
    const withLegacyStamina = (startStamina: number) => ({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              fatigueBeforeStage: 60,
              raceSharpness: 40,
              startStamina,
            }
          : rider,
      ),
    })

    const lowLegacy = runRaceEngine(withLegacyStamina(1))
    const highLegacy = runRaceEngine(withLegacyStamina(100))
    const lowReadiness = lowLegacy.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const highReadiness = highLegacy.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(lowReadiness.components.providedStartStamina).toBe(1)
    expect(highReadiness.components.providedStartStamina).toBe(100)
    expect(lowReadiness.fatigueBalance.startEnergy).toBe(67.5)
    expect(highReadiness.fatigueBalance.startEnergy).toBe(67.5)
    expect(lowReadiness.fatigueBalance.startEnergySource).toBe(
      'engine_starting_condition_v2',
    )
    expect(lowLegacy.roadRaceResolution).toEqual(
      highLegacy.roadRaceResolution,
    )
    expect(lowLegacy.groupAndTimeResolution).toEqual(
      highLegacy.groupAndTimeResolution,
    )
    expect(lowLegacy.finishResolution).toEqual(
      highLegacy.finishResolution,
    )
  })

  it('makes fatigue alone lower the physical reserve through every race phase', () => {
    const input = createValidInput()
    const runWithFatigue = (fatigueBeforeStage: number) =>
      runRaceEngine({
        ...input,
        riders: input.riders.map((rider, index) =>
          index === 0
            ? {
                ...rider,
                fatigueBeforeStage,
                raceSharpness: 50,
                morale: 65,
                recentFormScore: 0,
              }
            : rider,
        ),
      })

    const fresh = runWithFatigue(0)
    const tired = runWithFatigue(80)
    const readiness = (result: ReturnType<typeof runRaceEngine>) =>
      result.riderReadiness.find((row) => row.riderId === 'rider-1')!
    const phase1 = (result: ReturnType<typeof runRaceEngine>) =>
      result.roadRaceResolution.phase1Opening!.riderEnergy.find(
        (row) => row.riderId === 'rider-1',
      )!
    const phase2 = (result: ReturnType<typeof runRaceEngine>) =>
      result.roadRaceResolution.phase2Development!.riderEnergy.find(
        (row) => row.riderId === 'rider-1',
      )!
    const phase3 = (result: ReturnType<typeof runRaceEngine>) =>
      result.roadRaceResolution.phase3Decisive!.riderStates.find(
        (row) => row.riderId === 'rider-1',
      )!
    const phase4 = (result: ReturnType<typeof runRaceEngine>) =>
      result.roadRaceResolution.phase4Finish!.riderStates.find(
        (row) => row.riderId === 'rider-1',
      )!

    expect(readiness(fresh).fatigueBalance.startEnergy).toBe(100)
    expect(readiness(tired).fatigueBalance.startEnergy).toBe(60)
    expect(phase1(tired).startEnergy).toBeLessThan(phase1(fresh).startEnergy)
    expect(phase1(tired).energyAfterPhase).toBeLessThan(
      phase1(fresh).energyAfterPhase,
    )
    expect(phase2(tired).energyAfterPhase).toBeLessThan(
      phase2(fresh).energyAfterPhase,
    )
    expect(phase3(tired).energyAfterPhase).toBeLessThan(
      phase3(fresh).energyAfterPhase,
    )
    expect(phase4(tired).energyAtFinish).toBeLessThan(
      phase4(fresh).energyAtFinish,
    )
    const freshFinishRow = fresh.finishResolution.classification.find(
      (row) => row.riderId === 'rider-1',
    )!
    const tiredFinishRow = tired.finishResolution.classification.find(
      (row) => row.riderId === 'rider-1',
    )!
    expect(tiredFinishRow.finishScore!).toBeLessThan(
      freshFinishRow.finishScore!,
    )
    expect(tiredFinishRow.rank).toBeGreaterThan(freshFinishRow.rank!)
  })

  it('makes race sharpness alone change start energy and the complete energy chain', () => {
    const input = createValidInput()
    const runWithSharpness = (raceSharpness: number) =>
      runRaceEngine({
        ...input,
        riders: input.riders.map((rider, index) =>
          index === 0
            ? {
                ...rider,
                fatigueBeforeStage: 60,
                raceSharpness,
                morale: 65,
                recentFormScore: 0,
              }
            : rider,
        ),
      })

    const dull = runWithSharpness(0)
    const sharp = runWithSharpness(100)
    const dullReadiness = dull.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const sharpReadiness = sharp.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const dullFinish = dull.roadRaceResolution.phase4Finish!.riderStates.find(
      (row) => row.riderId === 'rider-1',
    )!
    const sharpFinish = sharp.roadRaceResolution.phase4Finish!.riderStates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(dullReadiness.components.sharpnessStartEnergyAdjustment).toBe(-12.5)
    expect(sharpReadiness.components.sharpnessStartEnergyAdjustment).toBe(12.5)
    expect(dullReadiness.fatigueBalance.startEnergy).toBe(57.5)
    expect(sharpReadiness.fatigueBalance.startEnergy).toBe(82.5)
    expect(sharpFinish.energyAtFinish).toBeGreaterThan(
      dullFinish.energyAtFinish,
    )
    const dullFinishRow = dull.finishResolution.classification.find(
      (row) => row.riderId === 'rider-1',
    )!
    const sharpFinishRow = sharp.finishResolution.classification.find(
      (row) => row.riderId === 'rider-1',
    )!
    expect(sharpFinishRow.finishScore!).toBeGreaterThan(
      dullFinishRow.finishScore!,
    )
    expect(sharpFinishRow.rank).toBeLessThan(dullFinishRow.rank)
  })

  it('charges not-fully-fit availability once through physical start energy', () => {
    const input = createValidInput()
    const build = (availabilityStatus: 'fit' | 'not_fully_fit') => ({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              fatigueBeforeStage: 40,
              raceSharpness: 50,
              morale: 65,
              recentFormScore: 0,
              availabilityStatus,
            }
          : rider,
      ),
    })
    const fit = runRaceEngine(build('fit')).riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const limited = runRaceEngine(build('not_fully_fit')).riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(fit.fatigueBalance.startEnergy).toBe(80)
    expect(limited.fatigueBalance.startEnergy).toBe(72)
    expect(limited.components.availabilityModifier).toBe(-8)
    expect(limited.components.availabilityStartEnergyPenalty).toBe(-8)
    expect(fit.readinessScore - limited.readinessScore).toBe(8)
  })

  it('does not apply recovery skill again when current fatigue is identical', () => {
    const input = createValidInput()
    const runWithRecovery = (recovery: number) =>
      runRaceEngine({
        ...input,
        riders: input.riders.map((rider, index) =>
          index === 0
            ? {
                ...rider,
                recovery,
                fatigueBeforeStage: 50,
                raceSharpness: 50,
              }
            : rider,
        ),
      }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    const lowRecovery = runWithRecovery(0)
    const highRecovery = runWithRecovery(100)

    expect(lowRecovery.fatigueBalance.startEnergy).toBe(75)
    expect(highRecovery.fatigueBalance.startEnergy).toBe(75)
    expect(highRecovery.fatigueBalance.intrinsicDailyRecoveryPoints).toBeGreaterThan(
      lowRecovery.fatigueBalance.intrinsicDailyRecoveryPoints,
    )
  })

  it('passes the authoritative reserve continuously from Phase 1 to Phase 4', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              fatigueBeforeStage: 55,
              raceSharpness: 30,
              morale: 65,
              recentFormScore: 0,
            }
          : rider,
      ),
    })
    const readiness = result.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const phase1 = result.roadRaceResolution.phase1Opening!.riderEnergy.find(
      (row) => row.riderId === 'rider-1',
    )!
    const phase2 = result.roadRaceResolution.phase2Development!.riderEnergy.find(
      (row) => row.riderId === 'rider-1',
    )!
    const phase3 = result.roadRaceResolution.phase3Decisive!.riderStates.find(
      (row) => row.riderId === 'rider-1',
    )!
    const phase4 = result.roadRaceResolution.phase4Finish!.riderStates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(readiness.fatigueBalance.startEnergy).toBe(67.5)
    expect(phase1.startEnergy).toBe(readiness.fatigueBalance.startEnergy)
    expect(phase2.startEnergy).toBe(phase1.energyAfterPhase)
    expect(phase3.startEnergy).toBe(phase2.energyAfterPhase)
    expect(phase4.startEnergy).toBe(phase3.energyAfterPhase)
  })

  it('is deterministic for identical engine-owned starting conditions', () => {
    const input = createValidInput()
    const conditioned = {
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              fatigueBeforeStage: 73,
              raceSharpness: 27,
              availabilityStatus: 'not_fully_fit' as const,
            }
          : rider,
      ),
    }

    expect(runRaceEngine(conditioned)).toEqual(runRaceEngine(conditioned))
  })

  it('keeps preparation energy and post-stage modifiers in separate channels', () => {
    const input = createValidInput()
    const baseline = runRaceEngine(input).riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const prepared = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              preparationModifiers: {
                inStageEnergyCostMultiplier: 0.92,
                postStageFatigueMultiplier: 0.85,
                postStageRecoveryBonusPoints: 2.5,
              },
            }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(prepared.readinessScore).toBe(baseline.readinessScore)
    expect(prepared.fatigueBalance.inStageEnergyCostMultiplier).toBe(0.92)
    expect(prepared.fatigueBalance.postStageFatigueMultiplier).toBe(0.85)
    expect(prepared.fatigueBalance.postStageRecoveryBonusPoints).toBe(2.5)
    expect(prepared.fatigueBalance.directFatigueEnergyCostMultiplier).toBe(1)
  })

  it('calculates intrinsic recovery from recovery skill and morale only', () => {
    const input = createValidInput()
    const neutral = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? { ...rider, recovery: 50, morale: 65 }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!
    const highMorale = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? { ...rider, recovery: 50, morale: 80 }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!
    const lowMorale = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? { ...rider, recovery: 50, morale: 39 }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(neutral.fatigueBalance.intrinsicDailyRecoveryPoints).toBe(11)
    expect(highMorale.fatigueBalance.intrinsicDailyRecoveryPoints).toBe(12)
    expect(lowMorale.fatigueBalance.intrinsicDailyRecoveryPoints).toBe(10)
  })

  it('deactivates performance and start-energy channels for DNS riders', () => {
    const input = createValidInput()
    const readiness = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              availabilityStatus: 'injured' as const,
              startStatus: 'dns' as const,
            }
          : rider,
      ),
    }).riderReadiness.find((row) => row.riderId === 'rider-1')!

    expect(readiness.fatigueBalance.active).toBe(false)
    expect(readiness.fatigueBalance.startEnergy).toBe(0)
    expect(readiness.fatigueBalance.preStagePerformanceModifier).toBe(0)
  })

  it('rejects invalid preparation fatigue-channel modifiers', () => {
    const input = createValidInput()
    expectValidationField(
      {
        ...input,
        riders: input.riders.map((rider, index) =>
          index === 0
            ? {
                ...rider,
                preparationModifiers: {
                  inStageEnergyCostMultiplier: 0,
                  postStageFatigueMultiplier: -1,
                  postStageRecoveryBonusPoints: -1,
                },
              }
            : rider,
        ),
      },
      'riders[0].preparationModifiers.inStageEnergyCostMultiplier',
    )

    const errors = validateRunInput({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              preparationModifiers: {
                inStageEnergyCostMultiplier: 0,
                postStageFatigueMultiplier: -1,
                postStageRecoveryBonusPoints: -1,
              },
            }
          : rider,
      ),
    })

    expect(errors.map((error) => error.field)).toEqual(
      expect.arrayContaining([
        'riders[0].preparationModifiers.postStageFatigueMultiplier',
        'riders[0].preparationModifiers.postStageRecoveryBonusPoints',
      ]),
    )
  })

  it('rejects recent-form values outside the production range', () => {
    const input = createValidInput()
    expectValidationField(
      {
        ...input,
        riders: input.riders.map((rider, index) =>
          index === 0 ? { ...rider, recentFormScore: 31 } : rider,
        ),
      },
      'riders[0].recentFormScore',
    )
  })

  it('is deterministic and independent of rider input ordering', () => {
    const input = createValidInput()
    const reversed: UniversalRaceEngineInput = {
      ...input,
      riders: [...input.riders].reverse(),
    }

    expect(runRaceEngine(reversed).riderReadiness).toEqual(
      runRaceEngine(input).riderReadiness,
    )
  })
})

describe('PPM Universal Race v1 stage skill weights and TTT rules', () => {
  it('defines the flat-stage skill weights without mixing readiness into skill', () => {
    const model = runRaceEngine(createValidInput()).stageSkillModel

    expect(model.profile).toBe('flat')
    expect(model.rawWeights).toEqual({
      sprint: 0.3,
      climbing: 0,
      timeTrial: 0,
      flat: 0.25,
      endurance: 0.2,
      recovery: 0,
      resistance: 0.1,
      raceIQ: 0.1,
      teamwork: 0.05,
    })
    expect(model.weights).toEqual(model.rawWeights)
    expect(model.normalizedWeightTotal).toBe(1)
  })

  it('defines the production hilly-stage skill weights', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'road_race',
      terrainType: 'hilly',
      finishType: 'uphill_finish',
      profileType: 'hilly',
    })
    const model = runRaceEngine(input).stageSkillModel

    expect(model.profile).toBe('hilly')
    expect(model.weights).toEqual({
      sprint: 0.1,
      climbing: 0.25,
      timeTrial: 0,
      flat: 0.2,
      endurance: 0.2,
      recovery: 0,
      resistance: 0.15,
      raceIQ: 0.1,
      teamwork: 0,
    })
  })

  it('defines the production mountain-stage skill weights', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'road_race',
      terrainType: 'mountain',
      finishType: 'summit_finish',
      profileType: 'mountain',
    })
    const model = runRaceEngine(input).stageSkillModel

    expect(model.profile).toBe('mountain')
    expect(model.weights).toEqual({
      sprint: 0,
      climbing: 0.45,
      timeTrial: 0,
      flat: 0,
      endurance: 0.2,
      recovery: 0.15,
      resistance: 0.1,
      raceIQ: 0.1,
      teamwork: 0,
    })
  })

  it('defines cobbled-stage weights for every supported road terrain', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'road_race',
      terrainType: 'cobbled',
      finishType: 'cobbled_finish',
      profileType: 'cobbled',
    })
    const model = runRaceEngine(input).stageSkillModel

    expect(model.weights).toEqual({
      sprint: 0.1,
      climbing: 0,
      timeTrial: 0,
      flat: 0.3,
      endurance: 0.2,
      recovery: 0,
      resistance: 0.25,
      raceIQ: 0.15,
      teamwork: 0,
    })
  })

  it('uses the production route-sensitive weights for a short flat ITT', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })
    const model = runRaceEngine(input).stageSkillModel

    expect(model.profile).toBe('individual_time_trial')
    expect(model.routeContext.distanceBand).toBe('at_least_40_km')
    expect(model.rawWeights).toMatchObject({
      timeTrial: 0.44,
      flat: 0.16,
      climbing: 0.04,
      endurance: 0.18,
      resistance: 0.12,
      raceIQ: 0.07,
      teamwork: 0.02,
    })
    expect(model.normalizedWeightTotal).toBe(1)
  })

  it('changes ITT endurance and resistance weights at forty kilometres', () => {
    const base = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })
    const short = runRaceEngine({
      ...base,
      stage: {
        ...base.stage,
        distanceKm: 39,
        profilePoints: [
          { km: 0, elevationM: 10 },
          { km: 39, elevationM: 15 },
        ],
      },
      points: base.points.map((point) => ({
        ...point,
        kmFromStart: point.pointType === 'START' ? 0 : 39,
      })),
    }).stageSkillModel
    const long = runRaceEngine({
      ...base,
      stage: {
        ...base.stage,
        distanceKm: 40,
        profilePoints: [
          { km: 0, elevationM: 10 },
          { km: 40, elevationM: 15 },
        ],
      },
      points: base.points.map((point) => ({
        ...point,
        kmFromStart: point.pointType === 'START' ? 0 : 40,
      })),
    }).stageSkillModel

    expect(short.rawWeights.timeTrial).toBe(0.42)
    expect(short.rawWeights.endurance).toBe(0.15)
    expect(short.rawWeights.resistance).toBe(0.11)
    expect(long.rawWeights.timeTrial).toBe(0.44)
    expect(long.rawWeights.endurance).toBe(0.18)
    expect(long.rawWeights.resistance).toBe(0.12)
  })

  it('gives prologues their separate explosive pacing profile', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'prologue',
      terrainType: 'prologue',
      finishType: 'prologue_finish',
      profileType: 'time_trial',
    })
    const model = runRaceEngine({
      ...input,
      stage: {
        ...input.stage,
        distanceKm: 8,
        profilePoints: [
          { km: 0, elevationM: 10 },
          { km: 8, elevationM: 15 },
        ],
      },
      points: input.points.map((point) => ({
        ...point,
        kmFromStart: point.pointType === 'START' ? 0 : 8,
      })),
    }).stageSkillModel

    expect(model.profile).toBe('prologue')
    expect(model.routeContext.distanceBand).toBe('prologue')
    expect(model.rawWeights.timeTrial).toBe(0.38)
    expect(model.rawWeights.endurance).toBe(0.1)
    expect(model.rawWeights.resistance).toBe(0.1)
    expect(model.rawWeights.raceIQ).toBe(0.16)
  })

  it('uses team coordination for pair and team time trials', () => {
    const pair = runRaceEngine(
      withStageFormat(createValidInput(), {
        stageFormat: 'pair_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
    ).stageSkillModel
    const team = runRaceEngine(
      withTimeTrialRules(
        withStageFormat(createExpandedFieldInput(12), {
          stageFormat: 'team_time_trial',
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
          profileType: 'time_trial',
        }),
        4,
      ),
    ).stageSkillModel

    expect(pair.rawWeights.teamwork).toBe(0.1)
    expect(team.rawWeights.teamwork).toBe(0.1)
  })

  it('defines TTT counting-group, team-time, cohesion, and tie-break rules', () => {
    const input = withTimeTrialRules(
      withStageFormat(createExpandedFieldInput(12), {
        stageFormat: 'team_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      4,
    )
    const rules = runRaceEngine(input).teamTimeTrialSuitabilityRules

    expect(rules.active).toBe(true)
    expect(rules.configured).toBe(true)
    expect(rules.countingRiderNumber).toBe(4)
    expect(rules.minimumTeamSize).toBe(4)
    expect(rules.validCountingRiderRange).toEqual([2, 8])
    expect(rules.teamTimeRule).toBe('slowest_counting_group_rider')
    expect(rules.droppedRiderTimeMode).toBe('personal_time')
    expect(rules.teamRankTieBreak).toEqual([
      'team_finish_time_seconds',
      'counting_group_average_score_desc',
      'team_id',
    ])
  })

  it('reproduces the capped production TTT cohesion penalty', () => {
    expect(calculateTeamTimeTrialCohesionPenaltyPct(70, 6)).toBe(0)
    expect(calculateTeamTimeTrialCohesionPenaltyPct(60, 10)).toBe(0.0057)
    expect(calculateTeamTimeTrialCohesionPenaltyPct(0, 100)).toBe(0.04)
  })

  it('does not invent a generic TTT counting-rider default', () => {
    const input = withStageFormat(createExpandedFieldInput(12), {
      stageFormat: 'team_time_trial',
      terrainType: 'team_time_trial',
      finishType: 'team_time_trial_finish',
      profileType: 'time_trial',
    })
    const rules = buildTeamTimeTrialSuitabilityRules(input.stage)

    expect(rules.active).toBe(true)
    expect(rules.configured).toBe(false)
    expect(rules.countingRiderNumber).toBe(null)
    expect(rules.minimumTeamSize).toBe(null)
    expect(() => runRaceEngine(input)).toThrow(
      'Team time-trial resolution requires a configured counting rider number from 2 through 8.',
    )
  })

  it('rejects a TTT counting-rider number outside the production range', () => {
    const input = withTimeTrialRules(
      withStageFormat(createValidInput(), {
        stageFormat: 'team_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      9,
    )

    expectValidationField(
      input,
      'stage.timeTrialRules.countingRiderNumber',
    )
  })
})

describe('Phase 2 deterministic suitability and favourites', () => {
  it('calculates rider suitability from stage skill and audited readiness modifiers', () => {
    const result = runRaceEngine(createValidInput())
    const row = result.riderSuitability.find(
      (candidate) => candidate.riderId === 'rider-1',
    )!

    expect(row.stageSkillScore).toBe(80)
    expect(row.components.freshnessModifier).toBe(1.2)
    expect(row.components.moraleModifier).toBe(0.4)
    expect(row.components.totalReadinessAdjustment).toBe(1.6)
    expect(row.suitabilityScore).toBe(81.6)
  })

  it('changes rider ranking with the stage-specific skill matrix', () => {
    const input = createValidInput()
    const riders = input.riders.map((rider, index) => {
      if (index === 0) {
        return {
          ...rider,
          sprint: 100,
          flat: 100,
          climbing: 20,
          endurance: 70,
        }
      }
      if (index === 2) {
        return {
          ...rider,
          sprint: 20,
          flat: 55,
          climbing: 100,
          endurance: 90,
          recovery: 90,
        }
      }
      return { ...rider, sprint: 50, flat: 50, climbing: 50 }
    })

    const flat = runRaceEngine({ ...input, riders })
    const mountainInput = withStageFormat(
      { ...input, riders },
      {
        stageFormat: 'road_race',
        terrainType: 'mountain',
        finishType: 'summit_finish',
        profileType: 'mountain',
      },
    )
    const mountain = runRaceEngine(mountainInput)

    expect(flat.riderSuitability[0].riderId).toBe('rider-1')
    expect(mountain.riderSuitability[0].riderId).toBe('rider-3')
  })

  it('keeps ineligible riders out of all favourite and breakaway lists', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              availabilityStatus: 'injured' as const,
              startStatus: 'dns' as const,
            }
          : rider,
      ),
    })

    const ineligible = result.riderSuitability.find(
      (row) => row.riderId === 'rider-1',
    )!
    expect(ineligible.suitabilityScore).toBe(0)
    expect(
      result.favourites.mainFavourites.some(
        (row) => row.riderId === 'rider-1',
      ),
    ).toBe(false)
    expect(
      result.favourites.breakawayCandidates.some(
        (row) => row.riderId === 'rider-1',
      ),
    ).toBe(false)
  })

  it('calculates ordinary team strength from the top three eligible riders', () => {
    const result = runRaceEngine(createExpandedFieldInput(12))

    result.teamStrength.forEach((team) => {
      expect(team.strengthBasis).toBe('top_three_average_suitability')
      expect(team.teamStrengthScore).toBe(
        team.topThreeAverageSuitabilityScore,
      )
      expect(team.eligibleRiderCount).toBe(6)
    })
  })

  it('uses the slowest counting rider and cohesion for TTT team strength', () => {
    const base = createExpandedFieldInput(12)
    const ttt = withTimeTrialRules(
      withStageFormat(base, {
        stageFormat: 'team_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      4,
    )
    const result = runRaceEngine({
      ...ttt,
      riders: ttt.riders.map((rider) =>
        rider.teamId === 'expanded-team-1'
          ? { ...rider, teamwork: 30 }
          : rider,
      ),
    })
    const team = result.teamStrength.find(
      (row) => row.teamId === 'expanded-team-1',
    )!

    expect(team.strengthBasis).toBe(
      'ttt_slowest_counting_rider_after_cohesion',
    )
    expect(team.countingRiderNumber).toBe(4)
    expect(team.countingRiderSuitabilityScore).not.toBe(null)
    expect(team.cohesionPenaltyPct).toBeGreaterThan(0)
    expect(
      team.teamStrengthScore < team.countingRiderSuitabilityScore!,
    ).toBe(true)
  })

  it('reuses the production favourite score shares and caps season points at 300', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              seasonResultPoints: 500,
              roleSnapshot: 'Leader Sprinter',
            }
          : rider,
      ),
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === 'rider-1'
            ? { ...riderPlan, stageRole: 'sprinter' as const }
            : riderPlan,
        ),
      })),
    })
    const suitability = result.riderSuitability.find(
      (row) => row.riderId === 'rider-1',
    )!
    const favourite = result.favourites.mainFavourites.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(favourite.seasonResultBonus).toBe(30)
    expect(favourite.roleBonus).toBe(9)
    expect(favourite.teamworkBonus).toBe(2.4)
    expect(favourite.favouriteScore).toBe(
      Number((suitability.suitabilityScore * 0.72 + 41.4).toFixed(4)),
    )
  })

  it('partitions the ranked field into main, secondary, and outsider groups', () => {
    const result = runRaceEngine(createExpandedFieldInput(26))

    expect(result.favourites.mainFavourites).toHaveLength(5)
    expect(result.favourites.secondaryContenders).toHaveLength(10)
    expect(result.favourites.outsiders).toHaveLength(10)
    expect(result.favourites.mainFavourites[0].rank).toBe(1)
    expect(result.favourites.secondaryContenders[0].rank).toBe(1)
    expect(result.favourites.outsiders[0].rank).toBe(1)
  })

  it('produces separate sprinter, climber, and time-trial favourite lists', () => {
    const input = createValidInput()
    const result = runRaceEngine({
      ...input,
      riders: input.riders.map((rider, index) => {
        if (index === 0) {
          return {
            ...rider,
            sprint: 100,
            flat: 100,
            climbing: 20,
            timeTrial: 40,
          }
        }
        if (index === 1) {
          return {
            ...rider,
            sprint: 20,
            flat: 50,
            climbing: 100,
            recovery: 100,
            timeTrial: 40,
          }
        }
        if (index === 2) {
          return {
            ...rider,
            sprint: 40,
            flat: 90,
            climbing: 40,
            timeTrial: 100,
            endurance: 95,
          }
        }
        return {
          ...rider,
          sprint: 45,
          flat: 45,
          climbing: 45,
          timeTrial: 45,
        }
      }),
    })

    expect(result.favourites.sprinterFavourites[0].riderId).toBe('rider-1')
    expect(result.favourites.climberFavourites[0].riderId).toBe('rider-2')
    expect(result.favourites.timeTrialFavourites[0].riderId).toBe('rider-3')
  })

  it('uses the audited breakaway score and deterministic 4-6 candidate count', () => {
    const input = createExpandedFieldInput(12)
    const result = runRaceEngine(input)
    const breakawayRider = result.favourites.breakawayCandidates.find(
      (row) => row.stageRole === 'breakaway_rider',
    )

    expect(result.favourites.breakawayCandidateCount >= 4).toBe(true)
    expect(result.favourites.breakawayCandidateCount <= 6).toBe(true)
    expect(Boolean(breakawayRider)).toBe(true)
    expect(breakawayRider!.rolePoints).toBe(14)
    expect(breakawayRider!.enduranceContribution).toBe(
      Number(
        (
          input.riders.find((rider) => rider.riderId === breakawayRider!.riderId)!
            .endurance * 0.34
        ).toFixed(4),
      ),
    )
  })

  it('uses start number before name and rider ID for favourite ties', () => {
    const input = createValidInput()
    const tiedRiders = input.riders.map((rider, index) => ({
      ...rider,
      sprint: 70,
      climbing: 70,
      timeTrial: 70,
      flat: 70,
      endurance: 70,
      recovery: 70,
      resistance: 70,
      raceIQ: 70,
      teamwork: 70,
      overall: 70,
      morale: 65,
      fatigueBeforeStage: 20,
      raceSharpness: 50,
      recentFormScore: 0,
      seasonResultPoints: 0,
      roleSnapshot: null,
      snapshot: {
        displayName: `Tie Rider ${index + 1}`,
        startNumber: [40, 10, 30, 20][index],
      },
    }))
    const neutralPlans = input.stagePlans.map((plan) => ({
      ...plan,
      riders: plan.riders.map((riderPlan) => ({
        ...riderPlan,
        stageRole: 'free_role' as const,
      })),
    }))
    const result = runRaceEngine({
      ...input,
      riders: tiedRiders,
      stagePlans: neutralPlans,
    })

    expect(
      result.favourites.mainFavourites.map((row) => row.startNumber),
    ).toEqual([10, 20, 30, 40])
  })

  it('is deterministic for suitability, team strength, and every favourite list', () => {
    const input = createExpandedFieldInput(26)
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)

    expect(first.riderSuitability).toEqual(second.riderSuitability)
    expect(first.teamStrength).toEqual(second.teamStrength)
    expect(first.favourites).toEqual(second.favourites)
  })

  it('validates optional season points instead of accepting negative values', () => {
    const input = createValidInput()
    expectValidationField(
      {
        ...input,
        riders: input.riders.map((rider, index) =>
          index === 0 ? { ...rider, seasonResultPoints: -1 } : rider,
        ),
      },
      'riders[0].seasonResultPoints',
    )
  })
})

describe('Phase 2 final readiness and cross-format verification', () => {
  it('penalizes a high-skill rider when readiness is poor', () => {
    const input = createValidInput()
    const highSkillPoorReadiness = {
      ...input.riders[0],
      sprint: 100,
      climbing: 100,
      timeTrial: 100,
      flat: 100,
      endurance: 100,
      recovery: 100,
      resistance: 100,
      raceIQ: 100,
      teamwork: 100,
      overall: 100,
      morale: 0,
      fatigueBeforeStage: 100,
      raceSharpness: 0,
      recentFormScore: -15,
      availabilityStatus: 'not_fully_fit' as const,
    }
    const highSkillReady = {
      ...highSkillPoorReadiness,
      morale: 100,
      fatigueBeforeStage: 0,
      raceSharpness: 100,
      recentFormScore: 30,
      availabilityStatus: 'fit' as const,
    }

    const poorResult = runRaceEngine({
      ...input,
      riders: [highSkillPoorReadiness, ...input.riders.slice(1)],
    })
    const readyResult = runRaceEngine({
      ...input,
      riders: [highSkillReady, ...input.riders.slice(1)],
    })
    const poor = poorResult.riderSuitability.find(
      (row) => row.riderId === highSkillPoorReadiness.riderId,
    )!
    const ready = readyResult.riderSuitability.find(
      (row) => row.riderId === highSkillReady.riderId,
    )!

    expect(poor.stageSkillScore).toBe(100)
    expect(poor.components.totalReadinessAdjustment < 0).toBe(true)
    expect(poor.suitabilityScore < ready.suitabilityScore).toBe(true)
    expect(poor.readinessScore < ready.readinessScore).toBe(true)
  })

  it('allows lower skill with excellent readiness to outrank higher skill with poor readiness', () => {
    const input = createValidInput()
    const riders = input.riders.map((rider, index) => {
      if (index === 0) {
        return {
          ...rider,
          sprint: 100,
          climbing: 100,
          timeTrial: 100,
          flat: 100,
          endurance: 100,
          recovery: 100,
          resistance: 100,
          raceIQ: 100,
          teamwork: 100,
          overall: 100,
          morale: 0,
          fatigueBeforeStage: 100,
          raceSharpness: 0,
          recentFormScore: -15,
          availabilityStatus: 'not_fully_fit' as const,
        }
      }

      if (index === 1) {
        return {
          ...rider,
          sprint: 90,
          climbing: 90,
          timeTrial: 90,
          flat: 90,
          endurance: 90,
          recovery: 90,
          resistance: 90,
          raceIQ: 90,
          teamwork: 90,
          overall: 90,
          morale: 100,
          fatigueBeforeStage: 0,
          raceSharpness: 100,
          recentFormScore: 30,
          availabilityStatus: 'fit' as const,
        }
      }

      return {
        ...rider,
        sprint: 50,
        climbing: 50,
        timeTrial: 50,
        flat: 50,
        endurance: 50,
        recovery: 50,
        resistance: 50,
        raceIQ: 50,
        teamwork: 50,
        overall: 50,
      }
    })
    const result = runRaceEngine({ ...input, riders })
    const highSkill = result.riderSuitability.find(
      (row) => row.riderId === 'rider-1',
    )!
    const excellentReadiness = result.riderSuitability.find(
      (row) => row.riderId === 'rider-2',
    )!

    expect(highSkill.stageSkillScore).toBe(100)
    expect(excellentReadiness.stageSkillScore).toBe(90)
    expect(excellentReadiness.suitabilityScore).toBeGreaterThan(
      highSkill.suitabilityScore,
    )
    expect(excellentReadiness.rank < highSkill.rank).toBe(true)
  })

  it('runs the complete readiness and suitability pipeline for every supported format and profile', () => {
    const base = createValidInput()
    const cases: readonly {
      readonly name: string
      readonly input: UniversalRaceEngineInput
      readonly expectedProfile:
        | 'flat'
        | 'hilly'
        | 'mountain'
        | 'cobbled'
        | 'individual_time_trial'
        | 'prologue'
        | 'pair_time_trial'
        | 'team_time_trial'
    }[] = [
      {
        name: 'flat road race',
        input: base,
        expectedProfile: 'flat',
      },
      {
        name: 'hilly road race',
        input: withStageFormat(base, {
          stageFormat: 'road_race',
          terrainType: 'hilly',
          finishType: 'uphill_finish',
          profileType: 'hilly',
        }),
        expectedProfile: 'hilly',
      },
      {
        name: 'mountain road race',
        input: withStageFormat(base, {
          stageFormat: 'road_race',
          terrainType: 'mountain',
          finishType: 'summit_finish',
          profileType: 'mountain',
        }),
        expectedProfile: 'mountain',
      },
      {
        name: 'cobbled road race',
        input: withStageFormat(base, {
          stageFormat: 'road_race',
          terrainType: 'cobbled',
          finishType: 'cobbled_finish',
          profileType: 'cobbled',
        }),
        expectedProfile: 'cobbled',
      },
      {
        name: 'individual time trial',
        input: withStageFormat(base, {
          stageFormat: 'individual_time_trial',
          terrainType: 'individual_time_trial',
          finishType: 'time_trial_finish',
          profileType: 'time_trial',
        }),
        expectedProfile: 'individual_time_trial',
      },
      {
        name: 'prologue',
        input: withStageFormat(base, {
          stageFormat: 'prologue',
          terrainType: 'prologue',
          finishType: 'prologue_finish',
          profileType: 'time_trial',
        }),
        expectedProfile: 'prologue',
      },
      {
        name: 'pair time trial',
        input: withStageFormat(base, {
          stageFormat: 'pair_time_trial',
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
          profileType: 'time_trial',
        }),
        expectedProfile: 'pair_time_trial',
      },
      {
        name: 'team time trial',
        input: withTimeTrialRules(
          withStageFormat(createExpandedFieldInput(12), {
            stageFormat: 'team_time_trial',
            terrainType: 'team_time_trial',
            finishType: 'team_time_trial_finish',
            profileType: 'time_trial',
          }),
          4,
        ),
        expectedProfile: 'team_time_trial',
      },
    ]

    const coveredFormats = new Set<StageFormat>()
    const coveredProfiles = new Set<string>()

    cases.forEach((testCase) => {
      const first = runRaceEngine(testCase.input)
      const second = runRaceEngine(testCase.input)

      coveredFormats.add(first.stageSkillModel.stageFormat)
      coveredProfiles.add(first.stageSkillModel.profile)

      expect(first.validationPassed).toBe(true)
      expect(first.stageSkillModel.profile).toBe(testCase.expectedProfile)
      expect(first.riderReadiness).toHaveLength(testCase.input.riders.length)
      expect(first.riderSuitability).toHaveLength(testCase.input.riders.length)
      expect(first.teamStrength).toHaveLength(testCase.input.teams.length)
      expect(first.riderReadiness).toEqual(second.riderReadiness)
      expect(first.riderSuitability).toEqual(second.riderSuitability)
      expect(first.teamStrength).toEqual(second.teamStrength)
      expect(first.favourites).toEqual(second.favourites)
    })

    expect([...coveredFormats].sort()).toEqual([...STAGE_FORMATS].sort())
    expect([...coveredProfiles].sort()).toEqual(
      [
        'flat',
        'hilly',
        'mountain',
        'cobbled',
        'individual_time_trial',
        'prologue',
        'pair_time_trial',
        'team_time_trial',
      ].sort(),
    )
  })

  it('contains no rider-, team-, race-, or stage-specific ID conditions', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toMatch(
      /(?:riderId|teamId|raceId|stageId)\s*(?:===|==|!==|!=)\s*['"][^'"]+['"]|['"][^'"]+['"]\s*(?:===|==|!==|!=)\s*[^\n]*(?:riderId|teamId|raceId|stageId)/,
    )
    expect(source).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    )
    expect(source).not.toMatch(
      /(?:special|exception|override)\w*\s*(?:rider|team|race|stage)/i,
    )
  })
})

describe('Phase 3 command contract and objective eligibility', () => {
  function withRiderPhaseCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phase: 'phase1' | 'phase2' | 'phase3' | 'phase4',
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  [phase]: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function phaseForRider(
    input: UniversalRaceEngineInput,
    riderId: string,
    phaseNumber: 1 | 2 | 3 | 4,
  ) {
    return runRaceEngine(input).roadCommandResolution.riders
      .find((row) => row.riderId === riderId)!
      .phases.find((phase) => phase.phaseNumber === phaseNumber)!
  }

  it('defines one validated command contract and the exact four road phases', () => {
    const resolution = runRaceEngine(createValidInput()).roadCommandResolution

    expect(resolution.active).toBe(true)
    expect(resolution.phaseBoundaries).toEqual([
      {
        phaseNumber: 1,
        key: 'phase1',
        label: 'opening',
        startFraction: 0,
        endFraction: 0.25,
        startKm: 0,
        endKm: 30,
      },
      {
        phaseNumber: 2,
        key: 'phase2',
        label: 'race_development',
        startFraction: 0.25,
        endFraction: 0.5,
        startKm: 30,
        endKm: 60,
      },
      {
        phaseNumber: 3,
        key: 'phase3',
        label: 'decisive_section',
        startFraction: 0.5,
        endFraction: 0.7,
        startKm: 60,
        endKm: 84,
      },
      {
        phaseNumber: 4,
        key: 'phase4',
        label: 'chase_and_finish',
        startFraction: 0.7,
        endFraction: 1,
        startKm: 84,
        endKm: 120,
      },
    ])
    expect(resolution.inputContract.universalCommands).toEqual(
      UNIVERSAL_ROAD_COMMANDS,
    )
    expect(resolution.inputContract.productionSavedCommands).toEqual(
      PRODUCTION_SAVED_ROAD_COMMANDS,
    )
    expect(resolution.inputContract.acceptedInputCommands).toEqual(
      ROAD_COMMAND_INPUTS,
    )
    expect(resolution.inputContract.fallbackPrecedence).toEqual([
      'explicit_individual_command',
      'saved_role_default',
      'saved_team_tactic_base',
    ])
    expect(
      resolution.inputContract.objectiveEligibilityRequiresExplicitSavedCommand,
    ).toBe(true)
    expect(
      resolution.inputContract.skillAloneCanAuthorizeObjectiveContest,
    ).toBe(false)
  })

  it('rejects unknown commands and unsupported road team tactics', () => {
    const input = createValidInput()
    const invalidCommand = {
      ...input,
      stagePlans: input.stagePlans.map((plan, planIndex) =>
        planIndex === 0
          ? {
              ...plan,
              riders: plan.riders.map((riderPlan, riderIndex) =>
                riderIndex === 0
                  ? {
                      ...riderPlan,
                      commands: {
                        ...riderPlan.commands,
                        phase2: 'teleport_to_front',
                      },
                    }
                  : riderPlan,
              ),
            }
          : plan,
      ),
    } as unknown as UniversalRaceEngineInput

    expectValidationField(
      invalidCommand,
      'stagePlans[0].riders[0].commands.phase2',
    )

    const invalidTeamTactic: UniversalRaceEngineInput = {
      ...input,
      stagePlans: input.stagePlans.map((plan, index) =>
        index === 0 ? { ...plan, teamTactic: 'mass_attack_everyone' } : plan,
      ),
    }

    expectValidationField(
      invalidTeamTactic,
      'stagePlans[0].teamTactic',
    )
  })

  it('maps every accepted saved command to deterministic behaviour and effects', () => {
    const behaviours = ROAD_COMMAND_INPUTS.map((command) => ({
      command,
      behaviour: getRoadCommandBehaviour(command),
      effect: calculateRoadCommandEffect(command, 'free_role', 4),
    }))

    expect(behaviours).toHaveLength(28)
    expect(
      behaviours.find((row) => row.command === 'control_race'),
    ).toMatchObject({
      behaviour: 'race_control',
      effect: {
        effectReferenceCommand: 'control_tempo',
        baseEffortMultiplier: 1.18,
        performanceModifier: 0.75,
      },
    })
    expect(
      behaviours.find((row) => row.command === 'protect_jersey'),
    ).toMatchObject({
      behaviour: 'jersey_protection',
      effect: {
        effectReferenceCommand: 'protect_leader',
        baseEffortMultiplier: 1.12,
        performanceModifier: 0.5,
      },
    })
    expect(
      behaviours.find(
        (row) => row.command === 'contest_intermediate_sprint',
      ),
    ).toMatchObject({
      behaviour: 'intermediate_sprint_contest',
      effect: {
        effectReferenceCommand: 'sprint',
        effectTiming: 'objective_only',
      },
    })
    expect(
      behaviours.find((row) => row.command === 'contest_kom_points'),
    ).toMatchObject({
      behaviour: 'kom_contest',
      effect: {
        effectReferenceCommand: 'climb_hard',
        effectTiming: 'objective_only',
      },
    })
  })

  it('preserves production role efficiency in command effort', () => {
    expect(calculateRoadCommandEffect('attack', 'breakaway_rider', 1)).toMatchObject({
      effectReferenceCommand: 'attack',
      baseEffortMultiplier: 1.45,
      roleAdjustedEffortMultiplier: 1.305,
      performanceModifier: 3,
    })
    expect(calculateRoadCommandEffect('sprint', 'sprinter', 4)).toMatchObject({
      effectReferenceCommand: 'sprint',
      baseEffortMultiplier: 1.4,
      roleAdjustedEffortMultiplier: 1.288,
      performanceModifier: 2.25,
    })
  })

  it('resolves explicit command before role default before team fallback', () => {
    const input = createValidInput()
    const explicit = phaseForRider(
      withRiderPhaseCommand(input, 'rider-1', 'phase1', 'attack'),
      'rider-1',
      1,
    )
    const roleDefault = phaseForRider(
      withRiderPhaseCommand(
        input,
        'rider-1',
        'phase2',
        'follow_team_plan',
      ),
      'rider-1',
      2,
    )
    const teamFallback = phaseForRider(
      withRiderPhaseCommand(
        input,
        'rider-4',
        'phase1',
        'follow_team_plan',
      ),
      'rider-4',
      1,
    )

    expect(explicit).toMatchObject({
      savedCommand: 'attack',
      resolvedCommand: 'attack',
      resolvedSource: 'explicit_individual_command',
      precedenceRank: 1,
    })
    expect(roleDefault).toMatchObject({
      savedCommand: 'follow_team_plan',
      resolvedCommand: 'conserve_energy',
      resolvedSource: 'saved_role_default',
      precedenceRank: 2,
    })
    expect(teamFallback).toMatchObject({
      savedCommand: 'follow_team_plan',
      resolvedCommand: 'stay_near_front',
      resolvedSource: 'saved_team_tactic_base',
      precedenceRank: 3,
    })
  })

  it('requires an explicit saved command for attacks and opening breakaways', () => {
    const highSkillInput = createValidInput()
    const highSkillNoExplicit = runRaceEngine({
      ...highSkillInput,
      riders: highSkillInput.riders.map((rider) =>
        rider.riderId === 'rider-3'
          ? {
              ...rider,
              flat: 100,
              climbing: 100,
              endurance: 100,
              resistance: 100,
              raceIQ: 100,
              morale: 100,
            }
          : rider,
      ),
      stagePlans: highSkillInput.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === 'rider-3'
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  phase1: 'follow_team_plan' as const,
                },
              }
            : riderPlan,
        ),
      })),
    }).roadCommandResolution.riders
      .find((row) => row.riderId === 'rider-3')!
      .phases[0]

    expect(highSkillNoExplicit.resolvedCommand).toBe('attack')
    expect(highSkillNoExplicit.resolvedSource).toBe('saved_role_default')
    expect(highSkillNoExplicit.deliberateAttack).toEqual({
      eligible: false,
      reason: 'explicit_saved_command_required',
    })
    expect(highSkillNoExplicit.openingBreakaway).toEqual({
      eligible: false,
      reason: 'explicit_saved_command_required',
    })

    const explicitAttack = phaseForRider(
      withRiderPhaseCommand(
        createValidInput(),
        'rider-3',
        'phase1',
        'attack',
      ),
      'rider-3',
      1,
    )
    const explicitJoin = phaseForRider(
      withRiderPhaseCommand(
        createValidInput(),
        'rider-3',
        'phase1',
        'join_breakaway',
      ),
      'rider-3',
      1,
    )

    expect(explicitAttack.deliberateAttack.eligible).toBe(true)
    expect(explicitAttack.openingBreakaway.eligible).toBe(true)
    expect(explicitJoin.deliberateAttack.eligible).toBe(false)
    expect(explicitJoin.openingBreakaway.eligible).toBe(true)
  })

  it('requires an explicit sprint command and a sprint point in that phase', () => {
    const phase3 = phaseForRider(
      withRiderPhaseCommand(
        createValidInput(),
        'rider-1',
        'phase3',
        'contest_intermediate_sprint',
      ),
      'rider-1',
      3,
    )
    const phase2 = phaseForRider(
      withRiderPhaseCommand(
        createValidInput(),
        'rider-1',
        'phase2',
        'contest_intermediate_sprint',
      ),
      'rider-1',
      2,
    )

    expect(phase3.intermediateSprintPointIds).toEqual(['point-sprint'])
    expect(phase3.intermediateSprintContest).toEqual({
      eligible: true,
      reason: 'eligible',
    })
    expect(phase2.intermediateSprintPointIds).toEqual([])
    expect(phase2.intermediateSprintContest).toEqual({
      eligible: false,
      reason: 'no_intermediate_sprint_in_phase',
    })
  })

  it('requires an explicit KOM command and a KOM point in that phase', () => {
    const phase4 = phaseForRider(
      withRiderPhaseCommand(
        createValidInput(),
        'rider-2',
        'phase4',
        'contest_kom_points',
      ),
      'rider-2',
      4,
    )
    const phase3 = phaseForRider(
      withRiderPhaseCommand(
        createValidInput(),
        'rider-2',
        'phase3',
        'contest_kom_points',
      ),
      'rider-2',
      3,
    )

    expect(phase4.komPointIds).toEqual(['point-kom'])
    expect(phase4.komContest).toEqual({
      eligible: true,
      reason: 'eligible',
    })
    expect(phase3.komPointIds).toEqual([])
    expect(phase3.komContest).toEqual({
      eligible: false,
      reason: 'no_kom_in_phase',
    })
  })

  it('blocks all deliberate objective contests for unavailable riders', () => {
    const input = withRiderPhaseCommand(
      createValidInput(),
      'rider-1',
      'phase1',
      'attack',
    )
    const unavailable = runRaceEngine({
      ...input,
      riders: input.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? {
              ...rider,
              availabilityStatus: 'injured' as const,
              startStatus: 'dns' as const,
            }
          : rider,
      ),
    }).roadCommandResolution.riders
      .find((row) => row.riderId === 'rider-1')!
      .phases[0]

    expect(unavailable.deliberateAttack).toEqual({
      eligible: false,
      reason: 'rider_unavailable',
    })
    expect(unavailable.openingBreakaway).toEqual({
      eligible: false,
      reason: 'rider_unavailable',
    })
  })

  it('keeps road command resolution inactive for non-road formats', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })
    const resolution = runRaceEngine(input).roadCommandResolution

    expect(resolution.active).toBe(false)
    expect(resolution.inactiveReason).toBe('non_road_stage')
    expect(resolution.riders).toEqual([])
    expect(resolution.phaseBoundaries).toHaveLength(4)
  })

  it('returns identical command resolution for identical inputs', () => {
    const input = withRiderPhaseCommand(
      createValidInput(),
      'rider-3',
      'phase1',
      'join_breakaway',
    )

    expect(runRaceEngine(input).roadCommandResolution).toEqual(
      runRaceEngine(input).roadCommandResolution,
    )
    expect(ROAD_RACE_PHASES).toHaveLength(4)
  })
})

describe('Phase 3 Race Phase 1 opening resolution', () => {
  function withOpeningCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  phase1: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function opening(input: UniversalRaceEngineInput) {
    return runRaceEngine(input).roadRaceResolution.phase1Opening!
  }

  it('reproduces the production MD5 deterministic unit roll', () => {
    expect(calculateDeterministicUnitRoll('')).toBe(0.8285759)
    expect(calculateDeterministicUnitRoll('abc')).toBe(0.562520063)
    expect(calculateDeterministicUnitRoll('race-1:stage-1:v1')).toBe(
      0.420192957,
    )
  })

  it('resolves the complete opening phase from zero to twenty-five percent', () => {
    const result = opening(createValidInput())

    expect(result.phaseNumber).toBe(1)
    expect(result.phaseBoundary).toMatchObject({
      startFraction: 0,
      endFraction: 0.25,
      startKm: 0,
      endKm: 30,
    })
    expect(result.neutralizedDistanceKm).toBeGreaterThanOrEqual(1.5)
    expect(result.neutralizedDistanceKm).toBeLessThanOrEqual(3)
    expect(result.opportunityWindowKm).toBe(5)
    expect(result.firstWaveAttemptKm).toBeGreaterThanOrEqual(2.25)
    expect(result.firstWaveAttemptKm).toBeLessThanOrEqual(3.75)
    if (result.secondWaveAttemptKm !== null) {
      expect(result.secondWaveAttemptKm).toBeGreaterThanOrEqual(3.25)
      expect(result.secondWaveAttemptKm).toBeLessThanOrEqual(4.75)
    }
  })

  it('blocks a join-only opening because an eligible attack must launch the move', () => {
    const result = opening(createValidInput())

    expect(result.eligibleAttackerIds).toEqual([])
    expect(result.eligibleJoinerIds).toEqual(['rider-3'])
    expect(result.joinOnlyEscapeBlocked).toBe(true)
    expect(result.status).toBe('join_only_blocked')
    expect(result.breakawayRiderIds).toEqual([])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].groupCode).toBe('main_peloton')
  })

  it('creates a deterministic opening breakaway from a successful explicit attack', () => {
    const base = withOpeningCommand(
      createValidInput(),
      'rider-3',
      'attack',
    )
    const input: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-3'
          ? {
              ...rider,
              flat: 100,
              endurance: 100,
              resistance: 100,
              raceIQ: 100,
              morale: 100,
            }
          : rider,
      ),
    }
    const result = opening(input)

    expect(result.status).toBe('breakaway_formed')
    expect(result.selectedCandidateIds).toEqual(['rider-3'])
    expect(result.breakawayRiderIds).toEqual(['rider-3'])
    expect(result.initialGapSeconds).toBeGreaterThan(0)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0]).toMatchObject({
      groupCode: 'opening_breakaway',
      groupOrder: 1,
      riderIds: ['rider-3'],
      gapSeconds: 0,
    })
    expect(result.groups[1].groupCode).toBe('main_peloton')
    expect(result.groups[1].gapSeconds).toBe(result.initialGapSeconds)
  })

  it('selects attack commands before joiners and enforces the deterministic wave cap', () => {
    let input = createExpandedFieldInput(18)
    const commandsByRider: Readonly<Record<string, 'attack' | 'join_breakaway'>> = {
      'expanded-rider-01': 'attack',
      'expanded-rider-02': 'join_breakaway',
      'expanded-rider-03': 'attack',
      'expanded-rider-04': 'join_breakaway',
      'expanded-rider-05': 'attack',
      'expanded-rider-06': 'join_breakaway',
      'expanded-rider-07': 'attack',
      'expanded-rider-08': 'join_breakaway',
      'expanded-rider-09': 'attack',
      'expanded-rider-10': 'join_breakaway',
    }

    input = {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) => ({
          ...riderPlan,
          commands: {
            ...riderPlan.commands,
            phase1:
              commandsByRider[riderPlan.riderId] ??
              riderPlan.commands.phase1,
          },
        })),
      })),
    }

    const result = opening(input)

    expect(result.effectiveWaveCap).toBeGreaterThan(3)
    expect(result.effectiveWaveCap).toBeLessThan(7)
    expect(result.selectedCandidateIds).toHaveLength(result.effectiveWaveCap)
    const selectedAttempts = result.attackAttempts
    const firstJoinIndex = selectedAttempts.findIndex(
      (attempt) => attempt.command === 'join_breakaway',
    )
    const lastAttackIndex = selectedAttempts
      .map((attempt) => attempt.command)
      .lastIndexOf('attack')
    expect(firstJoinIndex === -1 || lastAttackIndex < firstJoinIndex).toBe(true)
  })

  it('charges attack launch energy in addition to normal opening energy', () => {
    const input = withOpeningCommand(
      createValidInput(),
      'rider-3',
      'attack',
    )
    const result = opening(input)
    const attacker = result.riderEnergy.find(
      (row) => row.riderId === 'rider-3',
    )!
    const attempt = result.attackAttempts.find(
      (row) => row.riderId === 'rider-3',
    )!

    expect(attempt.physicallyValidAttempt).toBe(true)
    expect(attacker.attackEnergyCost).toBeGreaterThan(0)
    expect(attacker.totalOpeningEnergyCost).toBe(
      Number(
        (
          attacker.baselineOpeningEnergyCost + attacker.attackEnergyCost
        ).toFixed(6),
      ),
    )
    expect(attacker.energyAfterPhase < attacker.startEnergy).toBe(true)
  })

  it('makes conserve-energy visibly cheaper than an active opening command', () => {
    let input = createValidInput()
    input = withOpeningCommand(input, 'rider-1', 'stay_near_front')
    input = withOpeningCommand(input, 'rider-2', 'conserve_energy')
    input = {
      ...input,
      riders: input.riders.map((rider) =>
        rider.riderId === 'rider-1' || rider.riderId === 'rider-2'
          ? {
              ...rider,
              endurance: 75,
              resistance: 75,
              recovery: 75,
            }
          : rider,
      ),
    }
    const result = opening(input)
    const active = result.riderEnergy.find(
      (row) => row.riderId === 'rider-1',
    )!
    const conserving = result.riderEnergy.find(
      (row) => row.riderId === 'rider-2',
    )!

    expect(conserving.commandEffortMultiplier).toBeLessThan(
      active.commandEffortMultiplier,
    )
    expect(conserving.baselineOpeningEnergyCost).toBeLessThan(
      active.baselineOpeningEnergyCost,
    )
    expect(conserving.energyAfterPhase).toBeGreaterThan(
      active.energyAfterPhase,
    )
  })

  it('keeps riders with failed or unselected attempts in the peloton', () => {
    const base = withOpeningCommand(
      createValidInput(),
      'rider-1',
      'attack',
    )
    const input: UniversalRaceEngineInput = {
      ...base,
      engine: {
        ...base.engine,
        deterministicSeed: 'opening-failure-seed-3',
      },
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? {
              ...rider,
              flat: 1,
              endurance: 1,
              resistance: 1,
              raceIQ: 1,
              morale: 1,
              startStamina: 35,
              fatigueBeforeStage: 100,
              raceSharpness: 0,
            }
          : rider,
      ),
    }
    const result = opening(input)

    expect(result.breakawayRiderIds.includes('rider-1')).toBe(false)
    expect(result.pelotonRiderIds.includes('rider-1')).toBe(true)
    expect(
      result.riderEnergy.find((row) => row.riderId === 'rider-1')!
        .finalGroupCode,
    ).toBe('main_peloton')
  })

  it('keeps Phase 1 resolution inactive for non-road stages', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })
    const result = runRaceEngine(input).roadRaceResolution

    expect(result.active).toBe(false)
    expect(result.inactiveReason).toBe('non_road_stage')
    expect(result.phase1Opening).toBe(null)
  })

  it('returns identical opening groups, gaps, attempts, and energy for identical inputs', () => {
    const input = withOpeningCommand(
      createValidInput(),
      'rider-3',
      'attack',
    )

    expect(runRaceEngine(input).roadRaceResolution).toEqual(
      runRaceEngine(input).roadRaceResolution,
    )
  })

  it('does not create a separate opening, attack, breakaway, or energy engine', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:opening|attack|breakaway|energy)[^'"]*engine[^'"]*['"]/i,
    )
  })
})


describe('Phase 3 Race Phase 2 development resolution', () => {
  function withPhaseCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phase: 'phase1' | 'phase2',
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  [phase]: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function createPhase2BreakawayInput(): UniversalRaceEngineInput {
    let input = createValidInput()
    input = withPhaseCommand(input, 'rider-3', 'phase1', 'attack')
    return {
      ...input,
      riders: input.riders.map((rider) =>
        rider.riderId === 'rider-3'
          ? {
              ...rider,
              flat: 100,
              endurance: 100,
              resistance: 100,
              raceIQ: 100,
              teamwork: 90,
              morale: 100,
            }
          : rider,
      ),
    }
  }

  function phase2(input: UniversalRaceEngineInput) {
    return runRaceEngine(input).roadRaceResolution.phase2Development!
  }

  it('resolves Race Phase 2 from twenty-five to fifty percent', () => {
    const result = phase2(createPhase2BreakawayInput())

    expect(result.phaseNumber).toBe(2)
    expect(result.phaseBoundary).toMatchObject({
      startFraction: 0.25,
      endFraction: 0.5,
      startKm: 30,
      endKm: 60,
    })
    expect(result.breakawayRiderIdsAtStart).toEqual(['rider-3'])
    expect(result.breakawayCooperation).not.toBeNull()
    expect(result.breakawayCooperation!.averageTeamwork).toBe(90)
    expect(result.riderEnergy).toHaveLength(4)
  })

  it('calculates deterministic breakaway cooperation from the actual escape riders', () => {
    const result = phase2(createPhase2BreakawayInput())
    const cooperation = result.breakawayCooperation!

    expect(cooperation.riderCount).toBe(1)
    expect(cooperation.teamCount).toBe(1)
    expect(cooperation.cooperationScore).toBe(90)
    expect(cooperation.cooperationSpeedMultiplier).toBeGreaterThan(1)
    expect(cooperation.projectedEscapePaceKmh).toBeGreaterThan(40)
  })

  it('makes explicit chase and control commands increase peloton chase resources', () => {
    const neutral = phase2(createPhase2BreakawayInput())
    let activeInput = createPhase2BreakawayInput()
    activeInput = withPhaseCommand(activeInput, 'rider-1', 'phase2', 'chase')
    activeInput = withPhaseCommand(
      activeInput,
      'rider-2',
      'phase2',
      'control_race',
    )
    const active = phase2(activeInput)

    expect(active.pelotonResponse.chasingTeamIds).toContain('team-a')
    expect(active.pelotonResponse.controllingTeamIds).toContain('team-a')
    expect(active.pelotonResponse.availableChaseAssets).toBeGreaterThan(
      neutral.pelotonResponse.availableChaseAssets,
    )
    expect(active.pelotonResponse.chaseInterestScore).toBeGreaterThanOrEqual(
      neutral.pelotonResponse.chaseInterestScore,
    )
    expect(active.endGapSeconds).toBeLessThanOrEqual(neutral.endGapSeconds)
  })

  it('creates measurable leader-protection work and assigns it to the team leader', () => {
    let input = createPhase2BreakawayInput()
    input = withPhaseCommand(
      input,
      'rider-2',
      'phase2',
      'protect_leader',
    )
    const result = phase2(input)
    const action = result.supportActions.find(
      (row) => row.supporterRiderId === 'rider-2',
    )!

    expect(action).toMatchObject({
      command: 'protect_leader',
      targetRiderId: 'rider-1',
      targetReason: 'team_leader',
    })
    expect(action.supportWorkScore).toBeGreaterThan(0)
    expect(action.protectionReceivedScore).toBeGreaterThan(0)
    expect(
      result.riderEnergy.find((row) => row.riderId === 'rider-2')!
        .supportWorkScore,
    ).toBe(action.supportWorkScore)
    expect(
      result.riderEnergy.find((row) => row.riderId === 'rider-1')!
        .protectionReceivedScore,
    ).toBe(action.protectionReceivedScore)
  })

  it('uses the immutable pre-stage leader snapshot for protect-jersey', () => {
    let input = createPhase2BreakawayInput()
    input = withPhaseCommand(
      input,
      'rider-2',
      'phase2',
      'protect_jersey',
    )
    input = {
      ...input,
      preStageLeaders: {
        hasEstablishedLeaders: true,
        general: {
          classificationType: 'general',
          riderId: 'rider-1',
          teamId: 'team-a',
          rank: 1,
        },
      },
    }
    const action = phase2(input).supportActions.find(
      (row) => row.supporterRiderId === 'rider-2',
    )!

    expect(action.targetRiderId).toBe('rider-1')
    expect(action.targetReason).toBe('pre_stage_general_leader')
  })

  it('does not invent a jersey-protection target when no jersey owner exists', () => {
    let input = createPhase2BreakawayInput()
    input = withPhaseCommand(
      input,
      'rider-2',
      'phase2',
      'protect_jersey',
    )
    const action = phase2(input).supportActions.find(
      (row) => row.supporterRiderId === 'rider-2',
    )!

    expect(action.targetRiderId).toBeNull()
    expect(action.targetReason).toBe('no_valid_target')
    expect(action.supportWorkScore).toBe(0)
  })

  it('resolves an intermediate sprint only for explicit eligible contestants', () => {
    let input = createPhase2BreakawayInput()
    input = {
      ...input,
      points: [
        ...input.points.filter((point) => point.pointId !== 'point-sprint'),
        {
          pointId: 'phase2-sprint',
          stageId: input.stage.stageId,
          pointType: 'INTERMEDIATE_SPRINT',
          kmFromStart: 45,
          name: 'Phase 2 sprint',
          komCategory: null,
          pointsScheme: [5, 3, 1],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 1,
          metadata: {},
        },
      ],
    }
    input = withPhaseCommand(
      input,
      'rider-1',
      'phase2',
      'contest_intermediate_sprint',
    )
    const battle = phase2(input).pointBattles.find(
      (row) => row.pointId === 'phase2-sprint',
    )!

    expect(battle.status).toBe('contested')
    expect(battle.eligibleContestantIds).toEqual(['rider-1'])
    expect(battle.winnerRiderId).toBe('rider-1')
    expect(battle.rankings[0].pointsAwarded).toBe(5)
  })

  it('keeps a Phase 2 sprint unopposed when no rider has the explicit contest command', () => {
    const input = {
      ...createPhase2BreakawayInput(),
      points: [
        {
          pointId: 'phase2-sprint',
          stageId: 'stage-1',
          pointType: 'INTERMEDIATE_SPRINT' as const,
          kmFromStart: 45,
          name: 'Phase 2 sprint',
          komCategory: null,
          pointsScheme: [5, 3, 1],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 1,
          metadata: {},
        },
      ],
    }
    const battle = phase2(input).pointBattles[0]

    expect(battle.status).toBe('not_contested')
    expect(battle.eligibleContestantIds).toEqual([])
    expect(battle.winnerRiderId).toBeNull()
  })

  it('uses the production KOM score weights for an eligible Phase 2 KOM contest', () => {
    let input = createPhase2BreakawayInput()
    input = {
      ...input,
      points: [
        {
          pointId: 'phase2-kom',
          stageId: input.stage.stageId,
          pointType: 'KOM',
          kmFromStart: 50,
          name: 'Phase 2 climb',
          komCategory: '3',
          pointsScheme: [5, 3, 2, 1],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 1,
          metadata: {},
        },
      ],
    }
    input = withPhaseCommand(
      input,
      'rider-2',
      'phase2',
      'contest_kom_points',
    )
    const battle = phase2(input).pointBattles[0]
    const energy = phase2(input).riderEnergy.find(
      (row) => row.riderId === 'rider-2',
    )!

    expect(battle.scoringModel).toBe('production_kom_score_v1')
    expect(battle.winnerRiderId).toBe('rider-2')
    expect(energy.objectiveEnergyCost).toBeGreaterThan(0)
  })

  it('assigns stage objectives to their actual phase instead of resolving them early', () => {
    let input = createPhase2BreakawayInput()
    input = withPhaseCommand(
      input,
      'rider-2',
      'phase2',
      'contest_kom_points',
    )
    const result = phase2(input)

    expect(result.pointBattles.some((row) => row.pointId === 'point-kom')).toBe(
      false,
    )
  })

  it('returns identical Phase 2 gaps, support, battles, groups, and energy for identical inputs', () => {
    let input = createPhase2BreakawayInput()
    input = withPhaseCommand(input, 'rider-1', 'phase2', 'chase')
    input = withPhaseCommand(
      input,
      'rider-2',
      'phase2',
      'protect_leader',
    )

    expect(runRaceEngine(input).roadRaceResolution.phase2Development).toEqual(
      runRaceEngine(input).roadRaceResolution.phase2Development,
    )
  })

  it('keeps Phase 2 inactive for non-road formats', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })

    expect(runRaceEngine(input).roadRaceResolution.phase2Development).toBeNull()
  })

  it('makes stronger breakaway teamwork produce a stronger Phase 2 escape pace', () => {
    const highInput = createPhase2BreakawayInput()
    const lowInput: UniversalRaceEngineInput = {
      ...highInput,
      riders: highInput.riders.map((rider) =>
        rider.riderId === 'rider-3' ? { ...rider, teamwork: 10 } : rider,
      ),
    }
    const high = phase2(highInput)
    const low = phase2(lowInput)

    expect(
      high.breakawayCooperation!.projectedEscapePaceKmh,
    ).toBeGreaterThan(low.breakawayCooperation!.projectedEscapePaceKmh)
    expect(high.endGapSeconds).toBeGreaterThanOrEqual(low.endGapSeconds)
  })

  it('resolves support-leader and work-for-team into measurable team support', () => {
    let input = createPhase2BreakawayInput()
    input = withPhaseCommand(
      input,
      'rider-2',
      'phase2',
      'support_leader',
    )
    input = withPhaseCommand(
      input,
      'rider-4',
      'phase2',
      'work_for_team',
    )
    const actions = phase2(input).supportActions

    expect(
      actions.find((row) => row.supporterRiderId === 'rider-2')!,
    ).toMatchObject({
      command: 'support_leader',
      targetRiderId: 'rider-1',
      targetReason: 'team_leader',
    })
    expect(
      actions.find((row) => row.supporterRiderId === 'rider-4')!
        .supportWorkScore,
    ).toBeGreaterThan(0)
  })

  it('does not create separate cooperation, control, support, sprint, or KOM engines', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:cooperation|peloton|control|support|sprint|kom)[^'"]*engine[^'"]*['"]/i,
    )
  })
})


describe('Phase 3 Race Phase 3 decisive-section resolution', () => {
  function withPhase3Command(
    input: UniversalRaceEngineInput,
    riderId: string,
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  phase3: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function createDecisiveMountainInput(): UniversalRaceEngineInput {
    let input = createValidInput()
    input = {
      ...input,
      stage: {
        ...input.stage,
        terrainType: 'mountain',
        profileType: 'mountain',
        finishType: 'uphill_finish',
        elevationGainM: 1_000,
        terrainPercentages: {
          flat: 25,
          hilly: 20,
          mountain: 55,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 30, elevationM: 50 },
          { km: 60, elevationM: 100 },
          { km: 72, elevationM: 1_000 },
          { km: 84, elevationM: 1_020 },
          { km: 120, elevationM: 300 },
        ],
      },
      points: [
        ...input.points.filter((point) => point.pointType !== 'KOM'),
        {
          pointId: 'phase3-kom',
          stageId: input.stage.stageId,
          pointType: 'KOM',
          kmFromStart: 72,
          name: 'Decisive climb',
          komCategory: '1',
          pointsScheme: [10, 8, 6, 4],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 2,
          metadata: {},
        },
      ],
      riders: input.riders.map((rider) => {
        if (rider.riderId === 'rider-1') {
          return {
            ...rider,
            climbing: 98,
            endurance: 94,
            resistance: 92,
            recovery: 90,
            raceIQ: 90,
            morale: 90,
            startStamina: 100,
          }
        }
        if (rider.riderId === 'rider-4') {
          return {
            ...rider,
            climbing: 5,
            endurance: 10,
            resistance: 8,
            recovery: 10,
            raceIQ: 15,
            morale: 25,
            startStamina: 30,
            fatigueBeforeStage: 100,
            raceSharpness: 0,
          }
        }
        return rider
      }),
    }
    input = withPhase3Command(input, 'rider-1', 'attack')
    input = withPhase3Command(input, 'rider-2', 'protect_leader')
    input = withPhase3Command(input, 'rider-3', 'conserve_energy')
    input = withPhase3Command(input, 'rider-4', 'contest_kom_points')
    return input
  }

  function phase3(input: UniversalRaceEngineInput) {
    return runRaceEngine(input).roadRaceResolution.phase3Decisive!
  }

  it('resolves the decisive section from fifty to seventy percent', () => {
    const result = phase3(createDecisiveMountainInput())

    expect(result.phaseNumber).toBe(3)
    expect(result.phaseBoundary).toMatchObject({
      startFraction: 0.5,
      endFraction: 0.7,
      startKm: 60,
      endKm: 84,
    })
    expect(result.riderStates).toHaveLength(4)
  })

  it('selects the strongest terrain segment inside the decisive section', () => {
    const terrain = phase3(createDecisiveMountainInput()).decisiveTerrain

    expect(terrain).toMatchObject({
      kmStart: 60,
      kmEnd: 72,
      terrainType: 'steep_climb',
      primarySkill: 'climbing',
    })
    expect(terrain.averageGradientPercent).toBeGreaterThan(7)
    expect(terrain.selectionSeverity).toBeGreaterThan(0)
  })

  it('creates decisive attack attempts only for explicit Phase 3 attack commands', () => {
    let input = createDecisiveMountainInput()
    input = withPhase3Command(input, 'rider-3', 'follow_team_plan')
    const attempts = phase3(input).attackAttempts

    expect(attempts.map((attempt) => attempt.riderId)).toEqual(['rider-1'])
    expect(attempts[0].attackIntentScore).toBeGreaterThan(0)
    expect(attempts[0].attackEnergyCost).toBeGreaterThan(0)
  })

  it('uses skills, readiness, live energy and terrain to create deterministic selection groups', () => {
    const result = phase3(createDecisiveMountainInput())
    const strong = result.riderStates.find((row) => row.riderId === 'rider-1')!
    const weak = result.riderStates.find((row) => row.riderId === 'rider-4')!

    expect(strong.terrainAbilityScore).toBeGreaterThan(weak.terrainAbilityScore)
    expect(strong.decisiveScore).toBeGreaterThan(weak.decisiveScore)
    expect(strong.gapSeconds).toBeLessThan(weak.gapSeconds)
    expect(weak.finalGroupCode).toBe('dropped_group')
  })

  it('marks a severely fatigued dropped rider as energy depleted', () => {
    const result = phase3(createDecisiveMountainInput())
    const weak = result.riderStates.find((row) => row.riderId === 'rider-4')!

    expect(weak.finalGroupCode).toBe('dropped_group')
    expect(weak.depletionPenalty).toBeGreaterThan(0)
    expect(weak.finishContestEligible).toBe(false)
    expect(weak.finishEligibilityReason).toBe('energy_depleted')
    expect(result.finishIneligibleRiderIds).toContain('rider-4')
  })

  it('keeps riders in front, main, chasing or dropped groups with ordered gaps', () => {
    const result = phase3(createDecisiveMountainInput())

    expect(result.groups[0].groupCode).toBe('front_group')
    expect(result.groups[0].gapSeconds).toBe(0)
    for (let index = 1; index < result.groups.length; index += 1) {
      expect(result.groups[index].gapSeconds).toBeGreaterThanOrEqual(
        result.groups[index - 1].gapSeconds,
      )
    }
  })

  it('resolves a Phase 3 KOM only for the explicit eligible contestant', () => {
    const battle = phase3(createDecisiveMountainInput()).pointBattles.find(
      (row) => row.pointId === 'phase3-kom',
    )!

    expect(battle.phaseNumber).toBe(3)
    expect(battle.status).toBe('contested')
    expect(battle.eligibleContestantIds).toEqual(['rider-4'])
    expect(battle.winnerRiderId).toBe('rider-4')
  })

  it('does not let a strong climber contest a Phase 3 KOM without the saved command', () => {
    const battle = phase3(createDecisiveMountainInput()).pointBattles.find(
      (row) => row.pointId === 'phase3-kom',
    )!

    expect(battle.eligibleContestantIds).not.toContain('rider-1')
  })

  it('returns identical terrain, attacks, groups, gaps and eligibility for identical inputs', () => {
    const input = createDecisiveMountainInput()

    expect(runRaceEngine(input).roadRaceResolution.phase3Decisive).toEqual(
      runRaceEngine(input).roadRaceResolution.phase3Decisive,
    )
  })

  it('does not hand a flat performance-score band to Phase 4 as a physical escape without a real attack', () => {
    const result = runRaceEngine(createValidInput())

    expect(result.roadRaceResolution.phase3Decisive?.successfulAttackRiderIds).toEqual([])
    expect(result.roadRaceResolution.phase4Finish?.escapeRiderIdsAtStart).toEqual([])
  })

  it('keeps the decisive road section inactive for non-road formats', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })

    expect(runRaceEngine(input).roadRaceResolution.phase3Decisive).toBeNull()
  })

  it('does not create a separate decisive, terrain-selection, dropping, or group engine', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:decisive|terrain-selection|dropping|group)[^'"]*engine[^'"]*['"]/i,
    )
  })
})


describe('Phase 3 Race Phase 4 chase and finish resolution', () => {
  function withPhase4Command(
    input: UniversalRaceEngineInput,
    riderId: string,
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  phase4: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function withPhaseCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phase: 'phase1' | 'phase3',
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  [phase]: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function createLateBreakawayInput(): UniversalRaceEngineInput {
    let input = createValidInput()
    input = withPhaseCommand(input, 'rider-3', 'phase1', 'attack')
    input = withPhaseCommand(input, 'rider-3', 'phase3', 'attack')
    input = withPhase4Command(input, 'rider-3', 'ride_for_stage_result')
    input = withPhase4Command(input, 'rider-2', 'chase')
    input = withPhase4Command(input, 'rider-1', 'ride_for_stage_result')
    input = withPhase4Command(input, 'rider-4', 'work_for_team')
    return {
      ...input,
      riders: input.riders.map((rider) => {
        if (rider.riderId === 'rider-3') {
          return {
            ...rider,
            flat: 100,
            sprint: 94,
            endurance: 100,
            resistance: 100,
            raceIQ: 100,
            teamwork: 100,
            morale: 100,
            startStamina: 100,
          }
        }
        if (rider.riderId === 'rider-2') {
          return {
            ...rider,
            sprint: 95,
            flat: 95,
            climbing: 90,
            endurance: 95,
            resistance: 95,
            raceIQ: 95,
            teamwork: 95,
            morale: 95,
            startStamina: 100,
          }
        }
        if (rider.riderId === 'rider-1') {
          return {
            ...rider,
            sprint: 94,
            flat: 94,
            climbing: 90,
            endurance: 94,
            resistance: 94,
            raceIQ: 94,
            teamwork: 90,
            morale: 94,
            startStamina: 100,
          }
        }
        if (rider.riderId === 'rider-4') {
          return {
            ...rider,
            sprint: 90,
            flat: 90,
            climbing: 88,
            endurance: 90,
            resistance: 90,
            raceIQ: 90,
            teamwork: 92,
            morale: 90,
            startStamina: 100,
          }
        }
        return rider
      }),
    }
  }

  function phase4(input: UniversalRaceEngineInput) {
    return runRaceEngine(input).roadRaceResolution.phase4Finish!
  }

  it('starts the first chase step from the exact inherited Phase 3 peloton gap', () => {
    const result = phase4(createLateBreakawayInput())

    expect(result.chaseSteps.length).toBeGreaterThan(0)
    expect(result.chaseSteps[0].startGapSeconds).toBe(
      result.startGapSeconds,
    )
  })

  it('does not mark the opening breakaway caught above the merge tolerance', () => {
    const result = phase4(createLateBreakawayInput())

    if (result.breakawayCaught) {
      expect(result.endGapSeconds).toBeLessThanOrEqual(
        PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
      )
    }

    if (
      result.endGapSeconds >
      PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
    ) {
      expect(result.breakawayCaught).toBe(false)
      expect(result.breakawaySurvived).toBe(true)
    }
  })

  it('creates no more than one physical catch-threshold crossing', () => {
    const result = phase4(createLateBreakawayInput())

    const catchCrossings = result.chaseSteps.filter(
      (step) =>
        step.startGapSeconds >
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS &&
        step.endGapSeconds <=
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    )

    expect(catchCrossings.length).toBeLessThanOrEqual(1)

    if (result.breakawayCaught) {
      expect(catchCrossings).toHaveLength(1)
    }
  })

  it('keeps the opening-breakaway gap permanently closed after catch', () => {
    const result = phase4(createSuccessfulOpeningEscapeInput())

    const catchIndex = result.chaseSteps.findIndex(
      (step) =>
        step.startGapSeconds >
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS &&
        step.endGapSeconds <=
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    )

    expect(catchIndex).toBeGreaterThanOrEqual(0)
    expect(result.breakawayCaught).toBe(true)
    expect(result.chaseSteps[catchIndex].endGapSeconds).toBe(0)

    for (const step of result.chaseSteps.slice(catchIndex + 1)) {
      expect(step.startGapSeconds).toBe(0)
      expect(step.endGapSeconds).toBe(0)
    }
  })

  it('starts a flat-stage chase no later than 70 percent for a gap of at least four minutes', () => {
    const result = phase4(createLateBreakawayInput())

    if (result.startGapSeconds >= 240) {
      expect(
        result.automaticActivityStartsAtFraction,
      ).toBeLessThanOrEqual(0.7)
    }
  })

  it('resolves Race Phase 4 from seventy percent to the finish', () => {
    const result = phase4(createLateBreakawayInput())

    expect(result.phaseNumber).toBe(4)
    expect(result.phaseBoundary).toMatchObject({
      startFraction: 0.7,
      endFraction: 1,
      startKm: 84,
      endKm: 120,
    })
    expect(result.automaticActivityStartsAtFraction).toBeGreaterThanOrEqual(0.65)
    expect(result.automaticActivityStartsAtFraction).toBeLessThanOrEqual(0.8)
    expect(result.chaseSteps[0].kmStart).toBeCloseTo(
      120 * result.automaticActivityStartsAtFraction,
      5,
    )
    expect(result.chaseSteps.at(-1)!.kmEnd).toBe(120)
  })

  it('automatically increases peloton activity after the dynamic chase threshold without requiring an explicit chase', () => {
    let input = createLateBreakawayInput()
    input = withPhase4Command(input, 'rider-2', 'lead_out_sprinter')
    input = withPhase4Command(input, 'rider-4', 'conserve_energy')
    const result = phase4(input)

    expect(result.automaticActivityApplied).toBe(true)
    expect(result.chaseSteps[0].automaticActivityFactor).toBeGreaterThan(0)
    expect(result.chaseSteps.at(-1)!.automaticActivityFactor).toBe(1)
    expect(result.automaticChasingTeamIds).toContain('team-a')
  })

  it('uses explicit chase commands to increase chasing-team strength and late pace', () => {
    const explicit = phase4(createLateBreakawayInput())
    let neutralInput = createLateBreakawayInput()
    neutralInput = withPhase4Command(neutralInput, 'rider-2', 'conserve_energy')
    const neutral = phase4(neutralInput)

    expect(explicit.explicitChasingTeamIds).toContain('team-a')
    expect(
      explicit.chasingTeamStrength.find((row) => row.teamId === 'team-a')!
        .explicitChaserRiderIds,
    ).toContain('rider-2')
    expect(
      explicit.chasingTeamStrength.find((row) => row.teamId === 'team-a')!
        .strengthScore,
    ).toBeGreaterThan(
      neutral.chasingTeamStrength.find((row) => row.teamId === 'team-a')!
        .strengthScore,
    )
    expect(
      Math.max(...explicit.chaseSteps.map((step) => step.effectivePelotonPaceKmh)),
    ).toBeGreaterThan(
      Math.max(...neutral.chaseSteps.map((step) => step.effectivePelotonPaceKmh)),
    )
  })

  it('deterministically decides whether the leading group survives or is caught', () => {
    const result = phase4(createLateBreakawayInput())

    expect(result.breakawaySurvived || result.breakawayCaught || result.startGapSeconds === 0).toBe(true)
    expect(result.endGapSeconds).toBeGreaterThanOrEqual(0)
    if (result.breakawaySurvived) {
      expect(result.endGapSeconds).toBeGreaterThan(0.5)
      expect(result.status).toBe('breakaway_survived')
    }
    if (result.breakawayCaught) {
      expect(result.endGapSeconds).toBeLessThanOrEqual(0.5)
      expect(result.status).toBe('breakaway_caught')
    }
  })

  it('creates final rider groups with ordered gaps and one winning group', () => {
    const result = phase4(createLateBreakawayInput())

    expect(result.finalGroups[0].groupCode).toBe('winning_group')
    expect(result.finalGroups[0].gapSeconds).toBe(0)
    for (let index = 1; index < result.finalGroups.length; index += 1) {
      expect(result.finalGroups[index].gapSeconds).toBeGreaterThanOrEqual(
        result.finalGroups[index - 1].gapSeconds,
      )
      expect(result.finalGroups[index].finishTimeSeconds).toBeGreaterThanOrEqual(
        result.finalGroups[index - 1].finishTimeSeconds,
      )
    }
  })

  it('uses the production flat sprint score and makes sprint preparation and lead-out visible', () => {
    const supported = phase4(createValidInput())
    let unsupportedInput = withPhase4Command(
      createValidInput(),
      'rider-1',
      'conserve_energy',
    )
    unsupportedInput = withPhase4Command(
      unsupportedInput,
      'rider-2',
      'conserve_energy',
    )
    const unsupported = phase4(unsupportedInput)
    const supportedRider = supported.finish.rankings.find(
      (row) => row.riderId === 'rider-1',
    )!
    const unsupportedRider = unsupported.finish.rankings.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(supported.finish.modelVersion).toBe(
      'production_front_group_sprint_score_v1',
    )
    expect(supportedRider.finishScore).toBeGreaterThan(
      unsupportedRider.finishScore,
    )
    expect(
      supported.riderStates.find((row) => row.riderId === 'rider-1')!
        .leadOutSupportReceived,
    ).toBeGreaterThan(0)
  })

  for (const [finishType, expectedModel] of [
    ['uphill_finish', 'uphill_finish'],
    ['summit_finish', 'summit_finish'],
    ['cobbled_finish', 'cobbled_finish'],
  ] as const) {
    it(`resolves the correct ${finishType} road finish model`, () => {
      const base = createValidInput()
      const input: UniversalRaceEngineInput = {
        ...base,
        stage: {
          ...base.stage,
          finishType,
          terrainType:
            finishType === 'cobbled_finish'
              ? 'cobbled'
              : finishType === 'summit_finish'
                ? 'mountain'
                : 'hilly',
          summitFinish: finishType === 'summit_finish',
        },
      }

      expect(phase4(input).finish.finishModel).toBe(expectedModel)
    })
  }

  it('awards configured finish points and bonuses in deterministic finish order', () => {
    const result = phase4(createValidInput())

    expect(result.finish.rankings[0].pointsAwarded).toBe(50)
    expect(result.finish.rankings[0].bonusSecondsAwarded).toBe(10)
    expect(result.finish.rankings.map((row) => row.rank)).toEqual([1, 2, 3, 4])
    expect(runRaceEngine(createValidInput()).roadRaceResolution.phase4Finish).toEqual(
      runRaceEngine(createValidInput()).roadRaceResolution.phase4Finish,
    )
  })

  it('drops weak riders on a selective late climb and publishes the physical split at the climb', () => {
    const base = createLateBreakawayInput()
    const input: UniversalRaceEngineInput = {
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        profileType: 'mountain',
        finishType: 'uphill_finish',
        elevationGainM: 900,
        terrainPercentages: {
          flat: 35,
          hilly: 20,
          mountain: 45,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 84, elevationM: 80 },
          { km: 96, elevationM: 100 },
          { km: 106, elevationM: 1_000 },
          { km: 120, elevationM: 1_020 },
        ],
      },
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-4'
          ? {
              ...rider,
              climbing: 5,
              endurance: 35,
              resistance: 30,
              recovery: 30,
              raceIQ: 35,
              startStamina: 55,
              fatigueBeforeStage: 35,
            }
          : rider,
      ),
    }
    const result = runRaceEngine(input)
    const phase4Result = result.roadRaceResolution.phase4Finish!
    const selection = phase4Result.lateTerrainSelection

    expect(selection).not.toBeNull()
    expect(selection!.terrainType).toBe('steep_climb')
    expect(selection!.selectionKm).toBeCloseTo(106, 5)
    expect(selection!.droppedRiderIds).toContain('rider-4')
    expect(selection!.retainedPelotonRiderIds).not.toContain('rider-4')
    const weakTerrainRow = selection!.riders.find(
      (row) => row.riderId === 'rider-4',
    )!
    expect(weakTerrainRow.contactLossKm).not.toBeNull()
    expect(weakTerrainRow.contactLossKm!).toBeGreaterThanOrEqual(selection!.kmStart)
    expect(weakTerrainRow.contactLossKm!).toBeLessThanOrEqual(selection!.selectionKm)
    const weakPhase4State = phase4Result.riderStates.find(
      (row) => row.riderId === 'rider-4',
    )!
    expect(weakPhase4State.contactLossKm).not.toBeNull()
    expect(weakPhase4State.finalGapSeconds).toBeGreaterThan(5)

    const splitCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.checkpointId.includes('late-terrain-contact-loss') &&
        checkpoint.commentary.some((entry) => entry.riderIds.includes('rider-4')),
    )
    expect(splitCheckpoint).toBeDefined()
    expect(splitCheckpoint!.raceProgress.kmFromStart).toBeGreaterThanOrEqual(
      selection!.kmStart,
    )
    expect(splitCheckpoint!.raceProgress.kmFromStart).toBeLessThanOrEqual(106)
    expect(
      splitCheckpoint!.groups.find((group) => group.displayCode === 'P')?.riderIds,
    ).not.toContain('rider-4')
  })

  it('spreads late-climb contact losses across the climb instead of one summit-wide mass split', () => {
    const base = createExpandedFieldInput(18)
    const input: UniversalRaceEngineInput = {
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        profileType: 'mountain',
        finishType: 'uphill_finish',
        elevationGainM: 900,
        terrainPercentages: {
          flat: 35,
          hilly: 20,
          mountain: 45,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 84, elevationM: 80 },
          { km: 96, elevationM: 100 },
          { km: 106, elevationM: 1_000 },
          { km: 120, elevationM: 1_020 },
        ],
      },
      riders: base.riders.map((rider) => {
        if (rider.riderId === 'expanded-rider-06') {
          return {
            ...rider,
            climbing: 8,
            endurance: 34,
            resistance: 32,
            recovery: 32,
            raceIQ: 36,
            fatigueBeforeStage: 36,
          }
        }
        if (rider.riderId === 'expanded-rider-12') {
          return {
            ...rider,
            climbing: 24,
            endurance: 44,
            resistance: 42,
            recovery: 42,
            raceIQ: 48,
            fatigueBeforeStage: 24,
          }
        }
        if (rider.riderId === 'expanded-rider-18') {
          return {
            ...rider,
            climbing: 38,
            endurance: 52,
            resistance: 50,
            recovery: 50,
            raceIQ: 54,
            fatigueBeforeStage: 18,
          }
        }
        return rider
      }),
    }
    const result = runRaceEngine(input)
    const phase4Result = result.roadRaceResolution.phase4Finish!
    const contactLossRows = phase4Result.riderStates
      .filter(
        (row) =>
          row.contactLossReason === 'terrain_pressure' &&
          row.contactLossKm !== null,
      )
      .sort((left, right) => left.contactLossKm! - right.contactLossKm!)
    const distinctContactLossKm = Array.from(
      new Set(contactLossRows.map((row) => row.contactLossKm)),
    )

    expect(contactLossRows.length).toBeGreaterThanOrEqual(2)
    expect(distinctContactLossKm.length).toBeGreaterThanOrEqual(2)
    expect(contactLossRows[0].contactLossKm!).toBeGreaterThanOrEqual(
      phase4Result.lateTerrainSelection!.kmStart,
    )
    expect(contactLossRows.at(-1)!.contactLossKm!).toBeLessThanOrEqual(
      phase4Result.lateTerrainSelection!.selectionKm,
    )

    const terrainSplitCheckpoints = result.replayTimeline.checkpoints.filter(
      (checkpoint) =>
        checkpoint.checkpointId.includes('late-terrain-contact-loss'),
    )
    expect(terrainSplitCheckpoints.length).toBeGreaterThanOrEqual(2)
    expect(terrainSplitCheckpoints[0].raceProgress.kmFromStart).toBeLessThan(
      terrainSplitCheckpoints.at(-1)!.raceProgress.kmFromStart,
    )
  })

  it('drops a depleted Phase 4 peloton rider from contact without converting exhaustion into DNF', () => {
    let input = createLateBreakawayInput()
    input = withPhaseCommand(input, 'rider-4', 'phase3', 'conserve_energy')
    input = withPhase4Command(input, 'rider-4', 'work_for_team')
    input = {
      ...input,
      stage: {
        ...input.stage,
        terrainType: 'flat',
        profileType: 'sprinter',
        finishType: 'flat_finish',
        elevationGainM: 100,
        terrainPercentages: {
          flat: 100,
          hilly: 0,
          mountain: 0,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 84, elevationM: 5 },
          { km: 96, elevationM: 5 },
          { km: 108, elevationM: 5 },
          { km: 120, elevationM: 5 },
        ],
      },
      riders: input.riders.map((rider) =>
        rider.riderId === 'rider-4'
          ? {
              ...rider,
              fatigueBeforeStage: 95,
              raceSharpness: 0,
              endurance: 62,
              resistance: 62,
              recovery: 58,
            }
          : rider,
      ),
    }

    const result = runRaceEngine(input)
    const phase3State = result.roadRaceResolution.phase3Decisive!.riderStates.find(
      (row) => row.riderId === 'rider-4',
    )!
    const riderState = result.roadRaceResolution.phase4Finish!.riderStates.find(
      (row) => row.riderId === 'rider-4',
    )!
    const classification = result.finishResolution.classification.find(
      (row) => row.riderId === 'rider-4',
    )!

    expect(phase3State.energyAfterPhase).toBeGreaterThan(3)
    expect(riderState.energyAtFinish).toBeLessThan(6)
    expect(riderState.contactLossReason).toBe('energy_depleted')
    expect(riderState.contactLossKm).not.toBeNull()
    expect(riderState.finalGapSeconds).toBeGreaterThan(5)
    expect(classification.status).toBe('finished')
    expect(
      result.replayTimeline.checkpoints.some((checkpoint) =>
        checkpoint.checkpointId.includes('phase4-energy-contact-loss'),
      ),
    ).toBe(true)
  })

  it('keeps a capable expanded field from collapsing into a fixed tiny late front group', () => {
    const base = createExpandedFieldInput(60)
    const input: UniversalRaceEngineInput = {
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        profileType: 'mountain',
        finishType: 'uphill_finish',
        elevationGainM: 900,
        terrainPercentages: {
          flat: 35,
          hilly: 20,
          mountain: 45,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 84, elevationM: 80 },
          { km: 96, elevationM: 100 },
          { km: 106, elevationM: 1_000 },
          { km: 120, elevationM: 1_020 },
        ],
      },
    }
    const selection = runRaceEngine(input).roadRaceResolution.phase4Finish!
      .lateTerrainSelection!

    expect(selection.pelotonRiderIdsBefore).toHaveLength(60)
    expect(selection.retainedPelotonRiderIds.length).toBeGreaterThan(18)
    expect(selection.retainedPelotonRiderIds.length).toBeLessThan(60)
    expect(selection.droppedRiderIds.length).toBeGreaterThan(0)
  })

  it('spreads a large late-climb selection into bounded replay waves with differentiated gap penalties', () => {
    const base = createExpandedFieldInput(60)
    const input: UniversalRaceEngineInput = {
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        profileType: 'mountain',
        finishType: 'uphill_finish',
        elevationGainM: 900,
        terrainPercentages: {
          flat: 35,
          hilly: 20,
          mountain: 45,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 84, elevationM: 80 },
          { km: 96, elevationM: 100 },
          { km: 106, elevationM: 1_000 },
          { km: 120, elevationM: 1_020 },
        ],
      },
    }
    const result = runRaceEngine(input)
    const terrainLossStates = result.roadRaceResolution.phase4Finish!.riderStates
      .filter(
        (row) =>
          row.contactLossReason === 'terrain_pressure' &&
          row.contactLossKm !== null,
      )
      .sort((left, right) => left.contactLossKm! - right.contactLossKm!)
    const terrainSplitCheckpoints = result.replayTimeline.checkpoints.filter(
      (checkpoint) =>
        checkpoint.checkpointId.includes('late-terrain-contact-loss'),
    )
    const distinctLossKm = new Set(
      terrainLossStates.map((row) => row.contactLossKm),
    )
    const distinctPenaltyTenths = new Set(
      terrainLossStates.map((row) =>
        Math.round(row.contactLossGapPenaltySeconds * 10),
      ),
    )
    const maximumRidersInOneWave = Math.max(
      ...terrainSplitCheckpoints.map((checkpoint) =>
        checkpoint.commentary.reduce(
          (count, entry) => count + entry.riderIds.length,
          0,
        ),
      ),
    )

    expect(terrainLossStates.length).toBeGreaterThan(8)
    expect(distinctLossKm.size).toBeGreaterThanOrEqual(4)
    expect(distinctPenaltyTenths.size).toBeGreaterThanOrEqual(3)
    expect(terrainSplitCheckpoints.length).toBeGreaterThanOrEqual(3)
    expect(maximumRidersInOneWave).toBeLessThanOrEqual(8)
  })

  it('lets an earlier cracked rider keep losing time instead of being reset by later +6s crack waves', () => {
    const base = createExpandedFieldInput(60)
    const input: UniversalRaceEngineInput = {
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        profileType: 'mountain',
        finishType: 'uphill_finish',
        elevationGainM: 900,
        terrainPercentages: {
          flat: 35,
          hilly: 20,
          mountain: 45,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 84, elevationM: 80 },
          { km: 96, elevationM: 100 },
          { km: 106, elevationM: 1_000 },
          { km: 120, elevationM: 1_020 },
        ],
      },
    }
    const result = runRaceEngine(input)
    const terrainLossStates = result.roadRaceResolution.phase4Finish!.riderStates
      .filter(
        (row) =>
          row.contactLossReason === 'terrain_pressure' &&
          row.contactLossKm !== null,
      )
      .sort((left, right) => left.contactLossKm! - right.contactLossKm!)
    const earliest = terrainLossStates[0]
    const latestLossKm = Math.max(
      ...terrainLossStates.map((row) => row.contactLossKm!),
    )
    const laterCheckpoint = result.replayTimeline.checkpoints
      .filter(
        (checkpoint) =>
          !checkpoint.finalResultsVisible &&
          checkpoint.raceProgress.kmFromStart >= latestLossKm - 0.000001,
      )
      .sort(
        (left, right) =>
          left.raceProgress.kmFromStart - right.raceProgress.kmFromStart,
      )[0]

    expect(earliest).toBeTruthy()
    expect(laterCheckpoint).toBeTruthy()
    const state = laterCheckpoint.riderStates.find(
      (row) => row.riderId === earliest.riderId,
    )!
    const pelotonGap =
      laterCheckpoint.gaps.find((gap) => gap.displayCode === 'P')?.gapSeconds ?? 0
    expect((state.gapSeconds ?? 0) - pelotonGap).toBeGreaterThan(
      PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
    )
  })

  it('preserves differentiated Phase 4 contact-loss gaps through the Phase 5 physical merge handoff', () => {
    const base = createExpandedFieldInput(60)
    const input: UniversalRaceEngineInput = {
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        profileType: 'mountain',
        finishType: 'uphill_finish',
        elevationGainM: 900,
        terrainPercentages: {
          flat: 35,
          hilly: 20,
          mountain: 45,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 0 },
          { km: 84, elevationM: 80 },
          { km: 96, elevationM: 100 },
          { km: 106, elevationM: 1_000 },
          { km: 120, elevationM: 1_020 },
        ],
      },
    }
    const result = runRaceEngine(input)
    const phase4 = result.roadRaceResolution.phase4Finish!
    const terrainLossStates = phase4.riderStates.filter(
      (row) =>
        row.contactLossReason === 'terrain_pressure' &&
        row.contactLossKm !== null,
    )
    const phase5GroupByRider = new Map(
      result.groupAndTimeResolution.finalGroups.flatMap((group) =>
        group.riderIds.map((riderId) => [riderId, group] as const),
      ),
    )
    const terrainLossPhase5Gaps = new Set(
      terrainLossStates.map(
        (row) => phase5GroupByRider.get(row.riderId)!.gapSeconds,
      ),
    )
    const terrainLossPhase5Groups = new Set(
      terrainLossStates.map(
        (row) => phase5GroupByRider.get(row.riderId)!.displayCode,
      ),
    )

    expect(terrainLossStates.length).toBeGreaterThan(8)
    expect(
      new Set(terrainLossStates.map((row) => Math.round(row.finalGapSeconds)))
        .size,
    ).toBeGreaterThanOrEqual(5)
    expect(terrainLossPhase5Gaps.size).toBeGreaterThanOrEqual(4)
    expect(terrainLossPhase5Groups.size).toBeGreaterThanOrEqual(4)

    for (const group of result.groupAndTimeResolution.finalGroups) {
      const sourceGaps = group.riderIds
        .map(
          (riderId) =>
            phase4.riderStates.find((row) => row.riderId === riderId)!
              .finalGapSeconds,
        )
        .map((gap) => Math.round(gap))
      expect(Math.max(...sourceGaps) - Math.min(...sourceGaps)).toBeLessThanOrEqual(
        PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
      )
    }
  })

  it('uses the stage-specific engine seed for Phase 4 bridge outcomes', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain(
      '`${input.engine.deterministicSeed}|${input.stage.stageId}|phase4-bridge|${row.riderId}`',
    )
    expect(source).not.toContain(
      '`${getFrozenPhase56LegacySeed(input)}:phase4-bridge:${row.riderId}`',
    )
  })

  it('keeps Phase 4 inactive for non-road formats', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })

    expect(runRaceEngine(input).roadRaceResolution.phase4Finish).toBeNull()
  })

  it('does not create separate chase, breakaway-survival, group, or finish engines', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:chase|survival|group|finish)[^'"]*engine[^'"]*['"]/i,
    )
  })
})


describe('Phase 3 final command safeguards and four-phase verification', () => {
  type PhaseKey = keyof UniversalRaceEngineInput['stagePlans'][number]['riders'][number]['commands']
  type PhaseCommand = UniversalRaceEngineInput['stagePlans'][number]['riders'][number]['commands']['phase1']

  function withCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phase: PhaseKey,
    command: PhaseCommand,
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  [phase]: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function withNeutralSavedCommands(
    input: UniversalRaceEngineInput,
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        teamTactic: 'balanced',
        riders: plan.riders.map((riderPlan) => ({
          ...riderPlan,
          commands: {
            phase1: 'follow_team_plan',
            phase2: 'follow_team_plan',
            phase3: 'follow_team_plan',
            phase4: 'follow_team_plan',
          },
        })),
      })),
    }
  }

  function createFourPhaseComparisonInput(): UniversalRaceEngineInput {
    const base = withNeutralSavedCommands(createValidInput())
    let input: UniversalRaceEngineInput = {
      ...base,
      engine: {
        ...base.engine,
        deterministicSeed: 'phase-3-final-visible-command-differences',
      },
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-3' || rider.riderId === 'rider-4'
          ? {
              ...rider,
              flat: 100,
              climbing: 100,
              sprint: 96,
              endurance: 100,
              resistance: 100,
              recovery: 100,
              raceIQ: 100,
              teamwork: 100,
              morale: 100,
              startStamina: 100,
            }
          : rider,
      ),
    }

    input = withCommand(input, 'rider-3', 'phase1', 'attack')
    input = withCommand(input, 'rider-4', 'phase1', 'join_breakaway')
    input = withCommand(input, 'rider-2', 'phase2', 'chase')
    input = withCommand(input, 'rider-2', 'phase3', 'work_for_team')
    input = withCommand(input, 'rider-3', 'phase3', 'attack')
    input = withCommand(input, 'rider-2', 'phase4', 'chase')
    input = withCommand(input, 'rider-1', 'phase4', 'ride_for_stage_result')
    return input
  }

  it('publishes the final command-conflict and ineligibility safeguards', () => {
    const contract = runRaceEngine(createValidInput()).roadCommandResolution
      .inputContract

    expect(contract.oneCommandPerRiderPerPhase).toBe(true)
    expect(contract.conflictingFallbacksResolvedByPrecedence).toBe(true)
    expect(contract.unmatchedObjectiveCommandsAreSuppressed).toBe(true)
    expect(contract.invalidSupportCommandsAreSuppressed).toBe(true)
    expect(contract.joinBreakawayRequiresAttackLauncher).toBe(true)
  })

  it('uses exactly one scalar command per phase and rejects conflicting command collections', () => {
    const input = createValidInput()
    const malformed = {
      ...input,
      stagePlans: input.stagePlans.map((plan, planIndex) =>
        planIndex === 0
          ? {
              ...plan,
              riders: plan.riders.map((riderPlan, riderIndex) =>
                riderIndex === 0
                  ? {
                      ...riderPlan,
                      commands: {
                        ...riderPlan.commands,
                        phase1: ['attack', 'conserve_energy'],
                      },
                    }
                  : riderPlan,
              ),
            }
          : plan,
      ),
    } as unknown as UniversalRaceEngineInput

    expectValidationField(
      malformed,
      'stagePlans[0].riders[0].commands.phase1',
    )
  })

  it('resolves explicit commands ahead of conflicting role and team fallbacks', () => {
    let input = createValidInput()
    input = {
      ...input,
      stagePlans: input.stagePlans.map((plan) =>
        plan.teamId === 'team-a'
          ? {
              ...plan,
              teamTactic: 'sprint_control',
              riders: plan.riders.map((riderPlan) =>
                riderPlan.riderId === 'rider-1'
                  ? { ...riderPlan, stageRole: 'sprinter' }
                  : riderPlan,
              ),
            }
          : plan,
      ),
    }
    input = withCommand(input, 'rider-1', 'phase4', 'conserve_energy')

    const phase = runRaceEngine(input).roadCommandResolution.riders
      .find((row) => row.riderId === 'rider-1')!
      .phases.find((row) => row.phaseNumber === 4)!

    expect(phase.savedCommand).toBe('conserve_energy')
    expect(phase.resolvedCommand).toBe('conserve_energy')
    expect(phase.resolvedSource).toBe('explicit_individual_command')
    expect(phase.precedenceRank).toBe(1)
    expect(phase.behaviour).toBe('energy_conservation')
  })

  it('suppresses unmatched objective commands and invalid support commands', () => {
    let objectiveInput = createValidInput()
    objectiveInput = withCommand(
      objectiveInput,
      'rider-4',
      'phase2',
      'contest_intermediate_sprint',
    )
    const objectiveResult = runRaceEngine(objectiveInput)
    const objectivePhase = objectiveResult.roadCommandResolution.riders
      .find((row) => row.riderId === 'rider-4')!
      .phases.find((row) => row.phaseNumber === 2)!
    const objectiveEnergy = objectiveResult.roadRaceResolution.phase2Development!
      .riderEnergy.find((row) => row.riderId === 'rider-4')!

    expect(objectivePhase.intermediateSprintContest.eligible).toBe(false)
    expect(objectivePhase.intermediateSprintContest.reason).toBe(
      'no_intermediate_sprint_in_phase',
    )
    expect(objectiveEnergy.objectiveEnergyCost).toBe(0)

    let supportInput = createValidInput()
    supportInput = withCommand(
      supportInput,
      'rider-2',
      'phase2',
      'protect_jersey',
    )
    const supportResult = runRaceEngine(supportInput)
    const supportAction = supportResult.roadRaceResolution.phase2Development!
      .supportActions.find((row) => row.supporterRiderId === 'rider-2')!
    const supportEnergy = supportResult.roadRaceResolution.phase2Development!
      .riderEnergy.find((row) => row.riderId === 'rider-2')!

    expect(supportAction.status).toBe('suppressed_no_valid_target')
    expect(supportAction.targetRiderId).toBeNull()
    expect(supportAction.supportWorkScore).toBe(0)
    expect(supportAction.protectionReceivedScore).toBe(0)

    let neutralEffortInput = createValidInput()
    neutralEffortInput = withCommand(
      neutralEffortInput,
      'rider-2',
      'phase2',
      'contest_intermediate_sprint',
    )
    const neutralEffortEnergy = runRaceEngine(neutralEffortInput)
      .roadRaceResolution.phase2Development!.riderEnergy.find(
        (row) => row.riderId === 'rider-2',
      )!

    expect(supportEnergy.baselinePhaseEnergyCost).toBe(
      neutralEffortEnergy.baselinePhaseEnergyCost,
    )
  })

  it('blocks unavailable riders from creating attack attempts or race actions', () => {
    let input = createValidInput()
    input = withCommand(input, 'rider-3', 'phase1', 'attack')
    input = {
      ...input,
      riders: input.riders.map((rider) =>
        rider.riderId === 'rider-3'
          ? {
              ...rider,
              availabilityStatus: 'injured' as const,
              startStatus: 'dns' as const,
            }
          : rider,
      ),
    }

    const result = runRaceEngine(input)
    const command = result.roadCommandResolution.riders
      .find((row) => row.riderId === 'rider-3')!
      .phases.find((row) => row.phaseNumber === 1)!

    expect(command.deliberateAttack.eligible).toBe(false)
    expect(command.deliberateAttack.reason).toBe('rider_unavailable')
    expect(
      result.roadRaceResolution.phase1Opening!.attackAttempts.some(
        (row) => row.riderId === 'rider-3',
      ),
    ).toBe(false)
  })

  it('makes saved commands visibly change behaviour, energy, groups, gaps, and outcomes versus a neutral plan', () => {
    const commandedInput = createFourPhaseComparisonInput()
    const neutralInput = withNeutralSavedCommands(commandedInput)
    const commanded = runRaceEngine(commandedInput)
    const neutral = runRaceEngine(neutralInput)

    const commandedOpening = commanded.roadRaceResolution.phase1Opening!
    const neutralOpening = neutral.roadRaceResolution.phase1Opening!
    const commandedRiderEnergy = commandedOpening.riderEnergy.find(
      (row) => row.riderId === 'rider-3',
    )!
    const neutralRiderEnergy = neutralOpening.riderEnergy.find(
      (row) => row.riderId === 'rider-3',
    )!

    expect(commandedOpening.attackAttempts.length).toBeGreaterThan(
      neutralOpening.attackAttempts.length,
    )
    expect(commandedRiderEnergy.totalOpeningEnergyCost).toBeGreaterThan(
      neutralRiderEnergy.totalOpeningEnergyCost,
    )
    expect(commandedOpening.groups).not.toEqual(neutralOpening.groups)
    expect(
      commanded.roadRaceResolution.phase2Development!.endGapSeconds,
    ).not.toBe(neutral.roadRaceResolution.phase2Development!.endGapSeconds)
    expect(
      commanded.roadRaceResolution.phase3Decisive!.groups,
    ).not.toEqual(neutral.roadRaceResolution.phase3Decisive!.groups)
    expect(
      commanded.roadRaceResolution.phase4Finish!.finish.rankings,
    ).not.toEqual(neutral.roadRaceResolution.phase4Finish!.finish.rankings)
    expect(commanded.roadRaceResolution).not.toEqual(
      neutral.roadRaceResolution,
    )
  })

  it('produces exactly identical command and phase results for identical complete inputs', () => {
    const input = createFourPhaseComparisonInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)

    expect(first.roadCommandResolution).toEqual(second.roadCommandResolution)
    expect(first.roadRaceResolution.phase1Opening).toEqual(
      second.roadRaceResolution.phase1Opening,
    )
    expect(first.roadRaceResolution.phase2Development).toEqual(
      second.roadRaceResolution.phase2Development,
    )
    expect(first.roadRaceResolution.phase3Decisive).toEqual(
      second.roadRaceResolution.phase3Decisive,
    )
    expect(first.roadRaceResolution.phase4Finish).toEqual(
      second.roadRaceResolution.phase4Finish,
    )
    expect(first).toEqual(second)
  })

  it('keeps all four phases inside the one authoritative universal engine', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )
    const engineFunctionNames = Array.from(
      source.matchAll(/function\s+([A-Za-z0-9_]*Engine[A-Za-z0-9_]*)\s*\(/g),
      (match) => match[1],
    )

    expect(engineFunctionNames).toEqual(['runRaceEngine'])
    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:opening|development|decisive|chase|breakaway|sprint|kom|finish)[^'"]*engine[^'"]*['"]/i,
    )
    expect(source.match(/export\s+function\s+runRaceEngine\s*\(/g) ?? []).toHaveLength(1)
  })
})


describe('Phase 4 Task 4.1 intermediate-point catalogue and eligibility plan', () => {
  function withPointCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phaseKey: 'phase1' | 'phase2' | 'phase3' | 'phase4',
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((rider) =>
          rider.riderId === riderId
            ? {
                ...rider,
                commands: {
                  ...rider.commands,
                  [phaseKey]: command,
                },
              }
            : rider,
        ),
      })),
    }
  }

  it('reads every configured sprint and KOM point in route order and excludes start and finish', () => {
    const plan = runRaceEngine(createValidInput()).intermediatePointPlan

    expect(plan.active).toBe(true)
    expect(plan.configuredPointCount).toBe(2)
    expect(plan.sprintPointCount).toBe(1)
    expect(plan.komPointCount).toBe(1)
    expect(plan.points.map((point) => point.pointId)).toEqual([
      'point-sprint',
      'point-kom',
    ])
    expect(plan.points.map((point) => point.phaseNumber)).toEqual([3, 4])
  })

  it('preserves the exact configured points and time-bonus schemes from the stage profile', () => {
    const plan = runRaceEngine(createValidInput()).intermediatePointPlan
    const sprint = plan.points.find((point) => point.pointId === 'point-sprint')!
    const kom = plan.points.find((point) => point.pointId === 'point-kom')!

    expect(sprint.configuredPointsScheme).toEqual([20, 17, 15])
    expect(sprint.configuredTimeBonusSeconds).toEqual([3, 2, 1])
    expect(kom.komCategory).toBe('3')
    expect(kom.configuredPointsScheme).toEqual([5, 3, 2, 1])
  })

  it('selects explicit sprint and KOM contestants in the phase where each point occurs', () => {
    let input = createValidInput()
    input = withPointCommand(
      input,
      'rider-3',
      'phase3',
      'contest_intermediate_sprint',
    )
    input = withPointCommand(
      input,
      'rider-4',
      'phase4',
      'contest_kom_points',
    )
    const plan = runRaceEngine(input).intermediatePointPlan
    const sprint = plan.points.find((point) => point.pointId === 'point-sprint')!
    const kom = plan.points.find((point) => point.pointId === 'point-kom')!

    expect(sprint.eligibleRiderIds).toContain('rider-3')
    expect(
      sprint.candidates.find((candidate) => candidate.riderId === 'rider-3')!
        .eligibilityReasons,
    ).toContain('explicit_contest_command')
    expect(kom.eligibleRiderIds).toContain('rider-4')
    expect(
      kom.candidates.find((candidate) => candidate.riderId === 'rider-4')!
        .eligibilityReasons,
    ).toContain('explicit_contest_command')
  })

  it('allows a sprint-control team to nominate a suitably positioned sprinter without using skill alone', () => {
    const input = {
      ...createValidInput(),
      stagePlans: createValidInput().stagePlans.map((plan) =>
        plan.teamId === 'team-a'
          ? {
              ...plan,
              teamTactic: 'sprint_control',
              riders: plan.riders.map((rider) =>
                rider.riderId === 'rider-1'
                  ? { ...rider, stageRole: 'sprinter' as const }
                  : rider,
              ),
            }
          : plan,
      ),
    }
    const sprint = runRaceEngine(input).intermediatePointPlan.points.find(
      (point) => point.pointId === 'point-sprint',
    )!
    const candidate = sprint.candidates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(candidate.eligible).toBe(true)
    expect(candidate.eligibilityReasons).toContain('team_sprint_objective')
  })

  it('does not enter a strong rider when neither command, team objective nor race position authorizes the battle', () => {
    const input = {
      ...createValidInput(),
      riders: createValidInput().riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? {
              ...rider,
              sprint: 100,
              climbing: 100,
              endurance: 100,
              resistance: 100,
              raceIQ: 100,
            }
          : rider,
      ),
    }
    const sprint = runRaceEngine(input).intermediatePointPlan.points.find(
      (point) => point.pointId === 'point-sprint',
    )!
    const candidate = sprint.candidates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(candidate.eligible).toBe(false)
    expect(candidate.eligibilityReasons).toEqual([])
  })

  it('returns the identical intermediate-point plan for identical complete race inputs', () => {
    const input = createValidInput()

    expect(runRaceEngine(input).intermediatePointPlan).toEqual(
      runRaceEngine(input).intermediatePointPlan,
    )
  })

  it('keeps the intermediate-point plan inactive for non-road formats', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })

    expect(runRaceEngine(input).intermediatePointPlan.active).toBe(false)
    expect(runRaceEngine(input).intermediatePointPlan.inactiveReason).toBe(
      'non_road_stage',
    )
  })
})

describe('Phase 4 deterministic intermediate-point battles — items 4–6', () => {
  function withBattleCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phaseKey: 'phase1' | 'phase2' | 'phase3' | 'phase4',
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((rider) =>
          rider.riderId === riderId
            ? {
                ...rider,
                commands: {
                  ...rider.commands,
                  [phaseKey]: command,
                },
              }
            : rider,
        ),
      })),
    }
  }

  function createContestedPointInput(): UniversalRaceEngineInput {
    let input = createValidInput()
    input = withBattleCommand(
      input,
      'rider-1',
      'phase3',
      'contest_intermediate_sprint',
    )
    input = withBattleCommand(
      input,
      'rider-3',
      'phase3',
      'contest_intermediate_sprint',
    )
    input = withBattleCommand(
      input,
      'rider-2',
      'phase4',
      'contest_kom_points',
    )
    input = withBattleCommand(
      input,
      'rider-4',
      'phase4',
      'contest_kom_points',
    )
    return input
  }

  it('resolves every eligible sprint and KOM contestant into a deterministic complete ranking', () => {
    const input = createContestedPointInput()
    const first = runRaceEngine(input).intermediatePointBattles
    const second = runRaceEngine(input).intermediatePointBattles
    const sprint = first.battles.find(
      (battle) => battle.pointId === 'point-sprint',
    )!
    const kom = first.battles.find(
      (battle) => battle.pointId === 'point-kom',
    )!

    expect(first).toEqual(second)
    expect(first.configuredPointCount).toBe(2)
    expect(first.contestedPointCount).toBe(2)
    expect(sprint.status).toBe('contested')
    expect(kom.status).toBe('contested')
    expect(sprint.rankings.map((row) => row.rank)).toEqual([1, 2, 3, 4])
    expect(kom.rankings.map((row) => row.rank)).toEqual([1, 2, 3, 4])
    expect(sprint.committedContestantIds).toEqual(['rider-1', 'rider-3'])
    expect(kom.committedContestantIds).toEqual(['rider-2', 'rider-4'])
    expect(sprint.rankingMode).toBe('mixed_crossing_order')
    expect(kom.rankingMode).toBe('mixed_crossing_order')
    expect(sprint.winnerRiderId).toBe(sprint.rankings[0].riderId)
    expect(kom.winnerRiderId).toBe(kom.rankings[0].riderId)
  })

  it('awards every configured place from the deterministic crossing order when nobody deliberately contests', () => {
    const neutralInput = {
      ...createValidInput(),
      stagePlans: createValidInput().stagePlans.map((plan) => ({
        ...plan,
        teamTactic: 'balanced' as const,
        riders: plan.riders.map((rider) => ({
          ...rider,
          stageRole: 'free_role' as const,
          commands: {
            phase1: 'follow_team_plan' as const,
            phase2: 'follow_team_plan' as const,
            phase3: 'follow_team_plan' as const,
            phase4: 'follow_team_plan' as const,
          },
        })),
      })),
    }
    const result = runRaceEngine(neutralInput)
    const sprint = result.intermediatePointBattles.battles.find(
      (battle) => battle.pointId === 'point-sprint',
    )!
    const kom = result.intermediatePointBattles.battles.find(
      (battle) => battle.pointId === 'point-kom',
    )!

    expect(sprint.status).toBe('contested')
    expect(sprint.rankingMode).toBe('automatic_crossing_order')
    expect(sprint.committedContestantIds).toEqual([])
    expect(sprint.rankings).toHaveLength(4)
    expect(sprint.rankings.slice(0, 3).map((row) => row.pointsAwarded)).toEqual([
      20,
      17,
      15,
    ])
    expect(
      sprint.rankings.slice(0, 3).map((row) => row.bonusSecondsAwarded),
    ).toEqual([3, 2, 1])
    expect(kom.status).toBe('contested')
    expect(kom.rankingMode).toBe('automatic_crossing_order')
    expect(kom.rankings.map((row) => row.pointsAwarded)).toEqual([5, 3, 2, 1])
    expect(
      result.intermediatePointFinalization.costApplications.filter(
        (row) => row.pointId === 'point-sprint' || row.pointId === 'point-kom',
      ),
    ).toEqual([])
  })

  it('uses readiness, race position, team support, energy spent, commitment and bounded seeded variation', () => {
    const input = {
      ...createContestedPointInput(),
      stagePlans: createContestedPointInput().stagePlans.map((plan) =>
        plan.teamId === 'team-a'
          ? {
              ...plan,
              teamTactic: 'sprint_control' as const,
              riders: plan.riders.map((rider) =>
                rider.riderId === 'rider-2'
                  ? {
                      ...rider,
                      commands: {
                        ...rider.commands,
                        phase2: 'protect_leader' as const,
                      },
                    }
                  : rider,
              ),
            }
          : plan,
      ),
    }
    const sprint = runRaceEngine(input).intermediatePointBattles.battles.find(
      (battle) => battle.pointId === 'point-sprint',
    )!
    const rider = sprint.rankings.find((row) => row.riderId === 'rider-1')!

    expect(rider.components.readinessContribution).toBeGreaterThan(0)
    expect(rider.components.racePositionContribution).not.toBe(0)
    expect(rider.components.teamSupportContribution).toBeGreaterThan(0)
    expect(rider.components.commandCommitmentContribution).toBe(6)
    expect(rider.components.energySpentPenalty).toBeGreaterThanOrEqual(0)
    expect(rider.components.deterministicVariation).toBeGreaterThanOrEqual(-1.5)
    expect(rider.components.deterministicVariation).toBeLessThanOrEqual(1.5)
  })

  it('makes harder KOM categories increase the importance of climbing skill', () => {
    const base = {
      ...createContestedPointInput(),
      riders: createContestedPointInput().riders.map((rider) => {
        if (rider.riderId === 'rider-2') return { ...rider, climbing: 95 }
        if (rider.riderId === 'rider-4') return { ...rider, climbing: 55 }
        return rider
      }),
    }
    const category4 = {
      ...base,
      points: base.points.map((point) =>
        point.pointId === 'point-kom'
          ? { ...point, komCategory: '4' as const }
          : point,
      ),
    }
    const horsCategorie = {
      ...base,
      points: base.points.map((point) =>
        point.pointId === 'point-kom'
          ? { ...point, komCategory: 'HC' as const }
          : point,
      ),
    }
    const lowDifficulty = runRaceEngine(
      category4,
    ).intermediatePointBattles.battles.find(
      (battle) => battle.pointId === 'point-kom',
    )!
    const highDifficulty = runRaceEngine(
      horsCategorie,
    ).intermediatePointBattles.battles.find(
      (battle) => battle.pointId === 'point-kom',
    )!
    const lowStrong = lowDifficulty.rankings.find(
      (row) => row.riderId === 'rider-2',
    )!
    const lowWeak = lowDifficulty.rankings.find(
      (row) => row.riderId === 'rider-4',
    )!
    const highStrong = highDifficulty.rankings.find(
      (row) => row.riderId === 'rider-2',
    )!
    const highWeak = highDifficulty.rankings.find(
      (row) => row.riderId === 'rider-4',
    )!

    expect(lowDifficulty.komCategoryDifficultyFactor).toBe(1)
    expect(highDifficulty.komCategoryDifficultyFactor).toBe(1.12)
    expect(highStrong.components.komCategoryContribution).toBeGreaterThan(
      lowStrong.components.komCategoryContribution,
    )
    expect(
      highStrong.score - highWeak.score,
    ).toBeGreaterThan(lowStrong.score - lowWeak.score)
  })

  it('awards the exact configured points and time bonuses without inventing extra values', () => {
    let input = createContestedPointInput()
    input = withBattleCommand(
      input,
      'rider-2',
      'phase3',
      'contest_intermediate_sprint',
    )
    input = withBattleCommand(
      input,
      'rider-4',
      'phase3',
      'contest_intermediate_sprint',
    )
    const sprint = runRaceEngine(input).intermediatePointBattles.battles.find(
      (battle) => battle.pointId === 'point-sprint',
    )!

    expect(sprint.rankings.map((row) => row.pointsAwarded)).toEqual([
      20,
      17,
      15,
      0,
    ])
    expect(sprint.rankings.map((row) => row.bonusSecondsAwarded)).toEqual([
      3,
      2,
      1,
      0,
    ])
    expect(sprint.totalPointsAwarded).toBe(52)
    expect(sprint.totalBonusSecondsAwarded).toBe(6)
  })

  it('keeps authoritative point battles inactive for non-road formats', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })
    const battles = runRaceEngine(input).intermediatePointBattles

    expect(battles.active).toBe(false)
    expect(battles.inactiveReason).toBe('non_road_stage')
    expect(battles.battles).toEqual([])
  })
})


describe('Phase 4 final point-battle synchronization — items 7–10', () => {
  function withFinalPointCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phaseKey: 'phase1' | 'phase2' | 'phase3' | 'phase4',
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((rider) =>
          rider.riderId === riderId
            ? {
                ...rider,
                commands: {
                  ...rider.commands,
                  [phaseKey]: command,
                },
              }
            : rider,
        ),
      })),
    }
  }

  function createCompletePointStageInput(): UniversalRaceEngineInput {
    let input = createValidInput()
    input = {
      ...input,
      points: [
        ...input.points,
        {
          pointId: 'point-sprint-early',
          stageId: 'stage-1',
          pointType: 'INTERMEDIATE_SPRINT',
          name: 'Early sprint',
          kmFromStart: 20,
          komCategory: null,
          pointsScheme: [10, 6, 4],
          timeBonusSeconds: [2, 1],
          isFinishPoint: false,
          sortOrder: 4,
          metadata: {},
        },
        {
          pointId: 'point-kom-late',
          stageId: 'stage-1',
          pointType: 'KOM',
          name: 'Late KOM',
          kmFromStart: 105,
          komCategory: '1',
          pointsScheme: [10, 6, 4, 2, 1],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 5,
          metadata: {},
        },
      ],
    }
    input = withFinalPointCommand(
      input,
      'rider-1',
      'phase1',
      'contest_intermediate_sprint',
    )
    input = withFinalPointCommand(
      input,
      'rider-3',
      'phase1',
      'contest_intermediate_sprint',
    )
    input = withFinalPointCommand(
      input,
      'rider-1',
      'phase3',
      'contest_intermediate_sprint',
    )
    input = withFinalPointCommand(
      input,
      'rider-3',
      'phase3',
      'contest_intermediate_sprint',
    )
    input = withFinalPointCommand(
      input,
      'rider-2',
      'phase4',
      'contest_kom_points',
    )
    input = withFinalPointCommand(
      input,
      'rider-4',
      'phase4',
      'contest_kom_points',
    )
    return input
  }

  it('applies one energy and fatigue cost record per point and rider without duplicates', () => {
    const finalization = runRaceEngine(
      createCompletePointStageInput(),
    ).intermediatePointFinalization
    const keys = finalization.costApplications.map(
      (row) => row.applicationKey,
    )

    expect(finalization.active).toBe(true)
    expect(finalization.totalEnergyCost).toBeGreaterThan(0)
    expect(finalization.totalFatigueCost).toBeGreaterThan(0)
    expect(new Set(keys).size).toBe(keys.length)
    expect(
      finalization.costApplications.every(
        (row) =>
          row.applicationCount === 1 &&
          Math.abs(
            row.energyAfterBattle -
              Math.max(0, row.energyBeforeBattle - row.energyCost),
          ) < 0.000001,
      ),
    ).toBe(true)
    expect(finalization.synchronization.duplicateCostApplicationCount).toBe(0)
  })

  it('marks phase 2 or 3 objective costs as already represented instead of applying them twice', () => {
    const input = createCompletePointStageInput()
    const finalization = runRaceEngine(input).intermediatePointFinalization
    const phase3SprintRows = finalization.costApplications.filter(
      (row) => row.pointId === 'point-sprint',
    )
    const phase4KomRows = finalization.costApplications.filter(
      (row) => row.pointId === 'point-kom-late',
    )

    expect(
      phase3SprintRows.every(
        (row) => row.applicationMode === 'existing_phase_objective_cost',
      ),
    ).toBe(true)
    expect(
      phase4KomRows.every(
        (row) => row.applicationMode === 'point_finalization_cost',
      ),
    ).toBe(true)
  })

  it('creates exactly one synchronized replay event and commentary entry for every configured point', () => {
    const result = runRaceEngine(createCompletePointStageInput())
    const finalization = result.intermediatePointFinalization

    expect(finalization.configuredPointCount).toBe(4)
    expect(finalization.finalizedPointCount).toBe(4)
    expect(finalization.replayEvents).toHaveLength(4)
    expect(finalization.commentaryEntries).toHaveLength(4)
    expect(finalization.synchronization.synchronized).toBe(true)
    expect(finalization.synchronization.missingBattlePointIds).toEqual([])
    expect(finalization.synchronization.missingReplayEventPointIds).toEqual([])
    expect(finalization.synchronization.missingCommentaryPointIds).toEqual([])
    expect(
      finalization.replayEvents.map((event) => event.commentaryEntryId),
    ).toEqual(
      finalization.commentaryEntries.map(
        (entry) => entry.commentaryEntryId,
      ),
    )
  })

  it('maintains one cumulative duplicate-safe point ledger using only configured awards', () => {
    const result = runRaceEngine(createCompletePointStageInput())
    const finalization = result.intermediatePointFinalization
    const ledgerKeys = finalization.pointLedger.map(
      (entry) => entry.ledgerEntryKey,
    )
    const ledgerPoints = finalization.pointLedger.reduce(
      (sum, entry) => sum + entry.pointsAwarded,
      0,
    )
    const ledgerBonuses = finalization.pointLedger.reduce(
      (sum, entry) => sum + entry.bonusSecondsAwarded,
      0,
    )

    expect(new Set(ledgerKeys).size).toBe(ledgerKeys.length)
    expect(finalization.synchronization.duplicateLedgerEntryCount).toBe(0)
    expect(ledgerPoints).toBe(result.intermediatePointBattles.totalPointsAwarded)
    expect(ledgerBonuses).toBe(
      result.intermediatePointBattles.totalBonusSecondsAwarded,
    )
    expect(
      finalization.riderPointTotals.reduce(
        (sum, row) => sum + row.totalPoints,
        0,
      ),
    ).toBe(ledgerPoints)
    expect(
      finalization.teamPointTotals.reduce(
        (sum, row) => sum + row.totalPoints,
        0,
      ),
    ).toBe(ledgerPoints)
  })

  it('finalizes every configured point in route order for a complete stage and remains deterministic', () => {
    const input = createCompletePointStageInput()
    const first = runRaceEngine(input).intermediatePointFinalization
    const second = runRaceEngine(input).intermediatePointFinalization

    expect(first).toEqual(second)
    expect(first.replayEvents.map((event) => event.pointId)).toEqual([
      'point-sprint-early',
      'point-sprint',
      'point-kom',
      'point-kom-late',
    ])
    expect(
      first.replayEvents.map((event) => event.kmFromStart),
    ).toEqual([20, 60, 90, 105])
  })

  it('keeps final point replay generation inside the authoritative universal engine file', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).toContain('buildUniversalIntermediatePointFinalization')
    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:intermediate|sprint|kom|point)[^'"]*engine[^'"]*['"]/i,
    )
  })

  it('keeps point finalization inactive and empty for non-road formats', () => {
    const input = withStageFormat(createValidInput(), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })
    const finalization = runRaceEngine(input).intermediatePointFinalization

    expect(finalization.active).toBe(false)
    expect(finalization.inactiveReason).toBe('non_road_stage')
    expect(finalization.costApplications).toEqual([])
    expect(finalization.replayEvents).toEqual([])
    expect(finalization.commentaryEntries).toEqual([])
    expect(finalization.pointLedger).toEqual([])
  })
})

describe('Phase 5 deterministic groups, selection, gaps, and official times', () => {
  it('returns one complete deterministic road grouping and timing contract', () => {
    const input = createExpandedFieldInput(26)
    const first = runRaceEngine(input).groupAndTimeResolution
    const second = runRaceEngine(input).groupAndTimeResolution

    expect(first).toEqual(second)
    expect(first.active).toBe(true)
    expect(first.stageFormat).toBe('road_race')
    expect(first.everyStarterAssignedExactlyOnce).toBe(true)
    expect(first.groupTimesMonotonic).toBe(true)
    expect(first.officialResults).toHaveLength(26)
    expect(new Set(first.officialResults.map((row) => row.riderId)).size).toBe(26)
  })

  it('keeps same-group riders on the same official road time', () => {
    const result = runRaceEngine(createExpandedFieldInput(26)).groupAndTimeResolution

    for (const group of result.finalGroups) {
      const times = result.officialResults
        .filter((row) => group.riderIds.includes(row.riderId))
        .map((row) => row.officialTimeSeconds)

      expect(new Set(times).size).toBeLessThanOrEqual(1)
    }
  })

  it('uses wider flat bands and larger mountain selection gaps', () => {
    const base = createExpandedFieldInput(26)
    const flat = runRaceEngine({
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'flat',
        finishType: 'flat_finish',
        elevationGainM: 350,
        summitFinish: false,
        terrainPercentages: { flat: 90, hilly: 10, mountain: 0, cobbled: 0 },
        profilePoints: [
          { km: 0, elevationM: 10 },
          { km: 120, elevationM: 20 },
        ],
      },
    }).groupAndTimeResolution
    const mountain = runRaceEngine({
      ...base,
      stage: {
        ...base.stage,
        terrainType: 'mountain',
        finishType: 'summit_finish',
        elevationGainM: 4200,
        summitFinish: true,
        terrainPercentages: { flat: 15, hilly: 20, mountain: 65, cobbled: 0 },
        profilePoints: [
          { km: 0, elevationM: 200 },
          { km: 45, elevationM: 1700 },
          { km: 75, elevationM: 900 },
          { km: 120, elevationM: 2400 },
        ],
      },
    }).groupAndTimeResolution

    expect(flat.selectionProfile).toBe('flat_large_groups')
    expect(mountain.selectionProfile).toMatch(/mountain/)
    expect(mountain.deterministicGapCapSeconds).toBeGreaterThan(
      flat.deterministicGapCapSeconds,
    )
    expect(
      mountain.phaseGroups.find((group) => group.phaseNumber === 3)
        ?.performanceBand.threshold,
    ).toBeLessThan(
      flat.phaseGroups.find((group) => group.phaseNumber === 3)
        ?.performanceBand.threshold ?? Infinity,
    )
  })

  it('caps every road gap and keeps group ordering monotonic', () => {
    const result = runRaceEngine(createExpandedFieldInput(26)).groupAndTimeResolution

    expect(
      result.phaseGroups.every(
        (group) =>
          group.gapSeconds >= 0 &&
          group.gapSeconds <= result.deterministicGapCapSeconds,
      ),
    ).toBe(true)
    expect(
      result.finalGroups.every(
        (group, index) =>
          index === 0 ||
          group.gapSeconds >= result.finalGroups[index - 1].gapSeconds,
      ),
    ).toBe(true)
  })

  it('returns deterministic individual timing units for ITT and prologue', () => {
    for (const stageFormat of ['individual_time_trial', 'prologue'] as const) {
      const base = createValidInput()
      const input = withStageFormat(base, {
        stageFormat,
        terrainType:
          stageFormat === 'prologue' ? 'prologue' : 'individual_time_trial',
        finishType:
          stageFormat === 'prologue' ? 'prologue_finish' : 'time_trial_finish',
        profileType: 'time_trial',
      })
      const result = runRaceEngine(input).groupAndTimeResolution

      expect(result.selectionProfile).toBe('individual_timing')
      expect(result.finalGroups).toHaveLength(input.riders.length)
      expect(result.finalGroups.every((group) => group.riderIds.length === 1)).toBe(true)
      expect(result.everyStarterAssignedExactlyOnce).toBe(true)
      expect(result.groupTimesMonotonic).toBe(true)
    }
  })

  it('uses one shared official team time for TTT and pair time trial', () => {
    for (const stageFormat of ['team_time_trial', 'pair_time_trial'] as const) {
      const base = createValidInput()
      const formatted = withStageFormat(base, {
        stageFormat,
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      })
      const input = withTimeTrialRules(
        formatted,
        stageFormat === 'pair_time_trial' ? 2 : 2,
      )
      const result = runRaceEngine(input).groupAndTimeResolution

      expect(result.selectionProfile).toBe('team_timing')
      expect(result.everyStarterAssignedExactlyOnce).toBe(true)
      for (const group of result.finalGroups) {
        const times = result.officialResults
          .filter((row) => group.riderIds.includes(row.riderId))
          .map((row) => row.officialTimeSeconds)
        expect(new Set(times).size).toBe(1)
      }
    }
  })


  it('merges adjacent groups at four and five seconds but not at six seconds', () => {
    const candidates: UniversalPhase5RoadGroupCandidate[] = [
      {
        sourceOrder: 1,
        preferredGroupCode: 'front_favourites' as const,
        riderIds: ['rider-a'],
        gapSeconds: 0,
        riderPerformanceScores: { 'rider-a': 90 },
        formationReason: 'finish_group' as const,
      },
      {
        sourceOrder: 2,
        preferredGroupCode: 'chasing_group' as const,
        riderIds: ['rider-b'],
        gapSeconds: 4,
        riderPerformanceScores: { 'rider-b': 88 },
        formationReason: 'finish_group' as const,
      },
      {
        sourceOrder: 3,
        preferredGroupCode: 'chasing_group' as const,
        riderIds: ['rider-c'],
        gapSeconds: 5,
        riderPerformanceScores: { 'rider-c': 87 },
        formationReason: 'finish_group' as const,
      },
      {
        sourceOrder: 4,
        preferredGroupCode: 'dropped_group' as const,
        riderIds: ['rider-d'],
        gapSeconds: 11,
        riderPerformanceScores: { 'rider-d': 80 },
        formationReason: 'finish_group' as const,
      },
    ]

    const merged = mergeAdjacentPhase5RoadGroups(candidates)

    expect(PHASE5_GROUP_MERGE_TOLERANCE_SECONDS).toBe(5)
    expect(merged).toHaveLength(2)
    expect(merged[0].riderIds).toEqual(['rider-a', 'rider-b', 'rider-c'])
    expect(merged[0].gapSeconds).toBe(0)
    expect(merged[1].riderIds).toEqual(['rider-d'])
    expect(merged[1].gapSeconds).toBe(11)
  })

  it('repeats adjacent merging until no mergeable road groups remain', () => {
    const merged = mergeAdjacentPhase5RoadGroups([
      {
        sourceOrder: 1,
        preferredGroupCode: 'front_favourites',
        riderIds: ['rider-a'],
        gapSeconds: 10,
        riderPerformanceScores: { 'rider-a': 90 },
        formationReason: 'finish_group',
      },
      {
        sourceOrder: 2,
        preferredGroupCode: 'chasing_group',
        riderIds: ['rider-b'],
        gapSeconds: 14,
        riderPerformanceScores: { 'rider-b': 88 },
        formationReason: 'finish_group',
      },
      {
        sourceOrder: 3,
        preferredGroupCode: 'chasing_group',
        riderIds: ['rider-c'],
        gapSeconds: 15,
        riderPerformanceScores: { 'rider-c': 87 },
        formationReason: 'finish_group',
      },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].riderIds).toEqual(['rider-a', 'rider-b', 'rider-c'])
    expect(merged[0].gapSeconds).toBe(10)
  })

  it('uses one authoritative group gap and official time for every road rider', () => {
    const result = runRaceEngine(createExpandedFieldInput(26)).groupAndTimeResolution
    const winnerTime = result.officialResults[0].officialTimeSeconds

    for (const group of result.finalGroups) {
      const rows = result.officialResults.filter((row) =>
        group.riderIds.includes(row.riderId),
      )

      expect(rows.length).toBe(group.riderIds.length)
      expect(new Set(rows.map((row) => row.gapSeconds))).toEqual(
        new Set([group.gapSeconds]),
      )
      expect(new Set(rows.map((row) => row.officialTimeSeconds))).toEqual(
        new Set([group.officialTimeSeconds]),
      )
      expect(
        rows.every(
          (row) => row.officialTimeSeconds - winnerTime === row.gapSeconds,
        ),
      ).toBe(true)
    }
  })

  it('keeps physical rider order monotonic by group gap', () => {
    const rows = runRaceEngine(
      createExpandedFieldInput(38),
    ).groupAndTimeResolution.officialResults

    expect(
      rows.every(
        (row, index) =>
          index === 0 || row.gapSeconds >= rows[index - 1].gapSeconds,
      ),
    ).toBe(true)
  })

  it('never leaves adjacent final groups within the five-second merge tolerance', () => {
    const groups = runRaceEngine(
      createExpandedFieldInput(38),
    ).groupAndTimeResolution.finalGroups

    expect(
      groups.every(
        (group, index) =>
          index === 0 ||
          group.gapSeconds - groups[index - 1].gapSeconds >
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
      ),
    ).toBe(true)
  })

  it('uses at most one authoritative peloton group per phase snapshot', () => {
    const phaseGroups = runRaceEngine(
      createExpandedFieldInput(38),
    ).groupAndTimeResolution.phaseGroups

    for (const phaseNumber of [1, 2, 3, 4] as const) {
      const groups = phaseGroups.filter(
        (group) => group.phaseNumber === phaseNumber,
      )
      expect(
        groups.filter((group) => group.groupCode === 'main_peloton'),
      ).toHaveLength(groups.some((group) => group.groupCode === 'main_peloton') ? 1 : 0)
    }
  })

  it('orders riders inside groups by performance rather than by team blocks', () => {
    const result = runRaceEngine(createExpandedFieldInput(38)).groupAndTimeResolution

    for (const group of result.finalGroups) {
      const rows = group.riderIds.map((riderId) =>
        result.officialResults.find((row) => row.riderId === riderId),
      )
      const scores = rows.map((row) => row?.performanceScore ?? 0)
      expect(
        scores.every(
          (score, index) => index === 0 || score <= scores[index - 1] + 0.000001,
        ),
      ).toBe(true)
    }
  })

  it('keeps every phase snapshot complete, unique, ordered and gap-consistent', () => {
    const input = createExpandedFieldInput(38)
    const result = runRaceEngine(input).groupAndTimeResolution
    const starterIds = input.riders.map((rider) => rider.riderId).sort()

    for (const phaseNumber of [1, 2, 3, 4] as const) {
      const groups = result.phaseGroups.filter(
        (group) => group.phaseNumber === phaseNumber,
      )
      const riderIds = groups.flatMap((group) => group.riderIds)

      expect([...riderIds].sort()).toEqual(starterIds)
      expect(new Set(riderIds).size).toBe(riderIds.length)
      expect(
        groups.every(
          (group, index) =>
            group.groupOrder === index + 1 &&
            (index === 0 || group.gapSeconds >= groups[index - 1].gapSeconds),
        ),
      ).toBe(true)
    }
  })

  it('preserves Phase 4 winner and intermediate-point awards', () => {
    const result = runRaceEngine(createExpandedFieldInput(26))
    const phase4Winner = result.roadRaceResolution.phase4Finish?.finish.winnerRiderId
    const officialWinner = result.groupAndTimeResolution.officialResults[0]?.riderId

    expect(officialWinner).toBe(phase4Winner)
    expect(result.intermediatePointFinalization.synchronization.synchronized).toBe(true)
  })
})


describe('Phase 5 physical race order, labels, colours and minute-scale gaps', () => {
  it('uses one C display family and one chase colour for every group behind the peloton', () => {
    const identities = assignPhase5PhysicalGroupIdentities(7, 2, 4, true)

    expect(identities.map((row) => row.displayCode)).toEqual([
      'B1',
      'B2',
      'P',
      'C1',
      'C2',
      'C3',
      'C4',
    ])
    expect(identities.slice(0, 2).every(
      (row) => row.physicalPosition === 'ahead_of_peloton' && row.groupCode === 'breakaway',
    )).toBe(true)
    expect(identities[2]).toMatchObject({
      displayCode: 'P',
      physicalPosition: 'peloton',
      colorKey: 'peloton_blue',
    })
    expect(identities.slice(3).every(
      (row) =>
        row.physicalPosition === 'behind_peloton' &&
        row.displayCode.startsWith('C') &&
        row.colorKey === 'chasing_orange',
    )).toBe(true)
    expect(identities.at(-1)?.groupCode).toBe('time_limit_group')
  })

  it('never assigns a chasing group ahead of the peloton or a breakaway behind it', () => {
    for (let groupCount = 1; groupCount <= 9; groupCount += 1) {
      for (let pelotonIndex = 0; pelotonIndex < groupCount; pelotonIndex += 1) {
        const identities = assignPhase5PhysicalGroupIdentities(
          groupCount,
          pelotonIndex,
          3,
          false,
        )
        expect(identities.slice(0, pelotonIndex).every(
          (row) => row.groupCode === 'breakaway',
        )).toBe(true)
        expect(identities.slice(pelotonIndex + 1).every(
          (row) => row.groupCode !== 'breakaway',
        )).toBe(true)
        expect(identities.filter((row) => row.displayCode === 'P')).toHaveLength(1)
      }
    }
  })

  it('keeps the peloton identity and colour stable in every road phase', () => {
    for (const phaseNumber of [1, 2, 3, 4] as const) {
      const identities = assignPhase5PhysicalGroupIdentities(
        5,
        2,
        phaseNumber,
        phaseNumber === 4,
      )
      expect(identities[2].displayCode).toBe('P')
      expect(identities[2].physicalPosition).toBe('peloton')
      expect(identities[2].colorKey).toBe('peloton_blue')
    }
  })

  it('creates a minute-scale gap for a successful opening breakaway', () => {
    expect(calculatePhase5OpeningBreakawayGapSeconds(1, 1, 20)).toBeGreaterThanOrEqual(120)
    expect(calculatePhase5OpeningBreakawayGapSeconds(5, 4, 30)).toBeGreaterThanOrEqual(180)
    expect(calculatePhase5OpeningBreakawayGapSeconds(0, 0, 30)).toBe(0)
    expect(calculatePhase5OpeningBreakawayGapSeconds(20, 20, 30)).toBeLessThanOrEqual(300)
  })

  it('makes release grow the gap, control restrain it, and chase reduce it', () => {
    const openingGap = 180
    const released = calculatePhase5DevelopmentBreakawayGapSeconds(
      openingGap,
      'release_escape',
      0,
      0,
      50,
    )
    const controlled = calculatePhase5DevelopmentBreakawayGapSeconds(
      openingGap,
      'control_gap',
      2,
      0,
      50,
    )
    const chased = calculatePhase5DevelopmentBreakawayGapSeconds(
      openingGap,
      'organized_chase',
      0,
      2,
      50,
    )

    expect(released).toBeGreaterThan(openingGap)
    expect(controlled).toBeLessThan(released)
    expect(chased).toBeLessThan(controlled)
  })

  it('makes additional controlling and chasing teams visibly stronger', () => {
    const oneController = calculatePhase5DevelopmentBreakawayGapSeconds(
      240,
      'control_gap',
      1,
      0,
      45,
    )
    const twoControllers = calculatePhase5DevelopmentBreakawayGapSeconds(
      240,
      'control_gap',
      2,
      0,
      45,
    )
    const oneChaser = calculatePhase5DevelopmentBreakawayGapSeconds(
      240,
      'organized_chase',
      0,
      1,
      45,
    )
    const twoChasers = calculatePhase5DevelopmentBreakawayGapSeconds(
      240,
      'organized_chase',
      0,
      2,
      45,
    )

    expect(twoControllers).toBeLessThan(oneController)
    expect(twoChasers).toBeLessThan(oneChaser)
  })

  it('publishes stable physical labels and colours in the complete road result', () => {
    const result = runRaceEngine(createValidInput())
    const roadGroups = result.groupAndTimeResolution.phaseGroups.filter(
      (group) => group.phaseNumber > 0,
    )

    for (const phaseNumber of [1, 2, 3, 4] as const) {
      const groups = roadGroups
        .filter((group) => group.phaseNumber === phaseNumber)
        .sort((left, right) => left.groupOrder - right.groupOrder)
      const pelotonIndex = groups.findIndex((group) => group.displayCode === 'P')
      expect(pelotonIndex).toBeGreaterThanOrEqual(0)
      expect(groups[pelotonIndex].colorKey).toBe('peloton_blue')
      expect(groups.slice(0, pelotonIndex).every(
        (group) =>
          (group.displayCode.startsWith('B') || group.displayCode.startsWith('F')) &&
          group.physicalPosition === 'ahead_of_peloton',
      )).toBe(true)
      expect(groups.slice(pelotonIndex + 1).every(
        (group) => !group.displayCode.startsWith('B') && group.physicalPosition === 'behind_peloton',
      )).toBe(true)
    }
  })
})


describe('Phase 5 persistent breakaway lineage and post-70 chase lifecycle', () => {
  it('keeps B1 restricted to the successful opening escape lineage', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const openingIds = result.roadRaceResolution.phase1Opening?.breakawayRiderIds ?? []

    for (const phaseNumber of [1, 2, 3] as const) {
      const bRiderIds = result.groupAndTimeResolution.phaseGroups
        .filter(
          (group) =>
            group.phaseNumber === phaseNumber &&
            group.displayCode.startsWith('B'),
        )
        .flatMap((group) => group.riderIds)
      expect([...bRiderIds].sort()).toEqual([...openingIds].sort())
    }
  })

  it('does not manufacture a large breakaway from ordinary performance bands', () => {
    const result = runRaceEngine(createExpandedFieldInput(38))
    const openingIds = new Set(
      result.roadRaceResolution.phase1Opening?.breakawayRiderIds ?? [],
    )

    for (const group of result.groupAndTimeResolution.phaseGroups.filter(
      (row) => row.phaseNumber <= 3 && row.displayCode.startsWith('B'),
    )) {
      expect(group.riderIds.every((riderId) => openingIds.has(riderId))).toBe(true)
    }
  })

  it('preserves the same opening breakaway through 25, 50 and 70 percent', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const b1ByPhase = [1, 2, 3].map((phaseNumber) =>
      result.groupAndTimeResolution.phaseGroups.find(
        (group) =>
          group.phaseNumber === phaseNumber && group.displayCode === 'B1',
      ),
    )

    expect(b1ByPhase.every(Boolean)).toBe(true)
    expect(b1ByPhase[1]?.riderIds).toEqual(b1ByPhase[0]?.riderIds)
    expect(b1ByPhase[2]?.riderIds).toEqual(b1ByPhase[0]?.riderIds)
  })

  it('keeps the peloton gap positive before the 70 percent chase threshold', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const pelotonGaps = [1, 2, 3].map(
      (phaseNumber) =>
        result.groupAndTimeResolution.phaseGroups.find(
          (group) =>
            group.phaseNumber === phaseNumber && group.displayCode === 'P',
        )?.gapSeconds ?? 0,
    )

    expect(pelotonGaps[0]).toBeGreaterThanOrEqual(90)
    expect(pelotonGaps[1]).toBeGreaterThanOrEqual(90)
    expect(pelotonGaps[2]).toBeGreaterThanOrEqual(pelotonGaps[1])
  })

  it('labels late front selection F rather than creating another opening B group', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const phase3 = result.groupAndTimeResolution.phaseGroups.filter(
      (group) => group.phaseNumber === 3,
    )
    const openingIds = new Set(
      result.roadRaceResolution.phase1Opening?.breakawayRiderIds ?? [],
    )

    for (const group of phase3.filter((row) => row.displayCode.startsWith('F'))) {
      expect(group.groupCode).toBe('front_favourites')
      expect(group.riderIds.every((riderId) => !openingIds.has(riderId))).toBe(true)
    }
  })

  it('never publishes a second B lineage after the original escape is caught', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const finish = result.roadRaceResolution.phase4Finish
    if (finish?.breakawayCaught) {
      expect(
        result.groupAndTimeResolution.finalGroups.some((group) =>
          group.displayCode.startsWith('B'),
        ),
      ).toBe(false)
    }
  })

  it('keeps one blue P group in every phase while preserving complete membership', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const result = runRaceEngine(input)
    const starterIds = result.riderReadiness
      .filter((row) => row.eligibleToStart)
      .map((row) => row.riderId)
      .sort()

    for (const phaseNumber of [1, 2, 3, 4] as const) {
      const groups = result.groupAndTimeResolution.phaseGroups.filter(
        (group) => group.phaseNumber === phaseNumber,
      )
      expect(groups.filter((group) => group.displayCode === 'P')).toHaveLength(1)
      expect(groups.find((group) => group.displayCode === 'P')?.colorKey).toBe(
        'peloton_blue',
      )
      expect(groups.flatMap((group) => group.riderIds).sort()).toEqual(starterIds)
    }
  })

  it('keeps flat-stage late front groups small and tied to real decisive attacks', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const successfulLateAttackers = new Set(
      result.roadRaceResolution.phase3Decisive?.successfulAttackRiderIds ?? [],
    )

    for (const group of result.groupAndTimeResolution.finalGroups.filter(
      (candidate) => candidate.displayCode.startsWith('F'),
    )) {
      expect(group.riderIds.length).toBeLessThanOrEqual(8)
      expect(
        group.riderIds.every((riderId) => successfulLateAttackers.has(riderId)),
      ).toBe(true)
    }
  })

  it('merges unsupported flat front bands back into the finishing peloton', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const peloton = result.groupAndTimeResolution.finalGroups.find(
      (group) => group.displayCode === 'P',
    )
    const unsupportedFront = result.groupAndTimeResolution.finalGroups.find(
      (group) =>
        group.displayCode.startsWith('F') && group.riderIds.length > 8,
    )

    expect(peloton).toBeDefined()
    expect(unsupportedFront).toBeUndefined()
  })

  it('keeps every final displayed group more than five seconds apart', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const groups = result.groupAndTimeResolution.finalGroups
      .slice()
      .sort((left, right) => left.groupOrder - right.groupOrder)

    for (let index = 1; index < groups.length; index += 1) {
      expect(groups[index].gapSeconds - groups[index - 1].gapSeconds).toBeGreaterThan(5)
    }
  })

})


describe('Phase 5 dynamic chase activation and stage-profile survival targets', () => {
  it('keeps the automatic chase activation between 65 and 80 percent', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('clamp(startFraction, 0.65, 0.8)')
    expect(source).toContain('gapSeconds >= 360')
    expect(source).toContain('gapSeconds >= 60')
  })

  it('does not preselect breakaway survival or alter peloton pace to force an outcome', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('getRoadBreakawaySurvivalTargetRate')
    expect(source).not.toContain('phase4-breakaway-survival')
    expect(source).not.toContain('targetBreakawaySurvival')
    expect(source).not.toContain('terrainOutcomeMultiplier')
    expect(source).toContain(
      'const breakawaySurvived = activeEscape && escapeStillActive',
    )
  })

  it('places opening attempts after a short neutral section and before five kilometres', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('1.5 + openingTimingRoll * 1.5')
    expect(source).toContain('neutralizedDistanceKm + 0.75')
    expect(source).toContain('neutralizedDistanceKm + 1.75')
  })

  it('uses the authoritative peloton gap rather than the nearest front chase group', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const phase3 = result.roadRaceResolution.phase3Decisive!
    const phase4 = result.roadRaceResolution.phase4Finish!
    const leadingGroup = phase3.groups[0]
    const peloton = phase3.groups
      .filter((group) => group.groupOrder > leadingGroup.groupOrder)
      .slice()
      .sort(
        (left, right) =>
          right.riderIds.length - left.riderIds.length ||
          left.gapSeconds - right.gapSeconds ||
          left.groupOrder - right.groupOrder,
      )[0]

    expect(peloton).toBeDefined()
    expect(phase4.startGapSeconds).toBe(peloton.gapSeconds)
    expect(phase4.chaseSteps[0].startGapSeconds).toBe(
      phase4.startGapSeconds,
    )
  })

  it('bounds every late-chase gap change by travelled distance', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const phase4 = result.roadRaceResolution.phase4Finish!

    for (const step of phase4.chaseSteps) {
      const distanceKm = step.kmEnd - step.kmStart
      expect(step.startGapSeconds - step.endGapSeconds).toBeLessThanOrEqual(
        distanceKm * 10 + 0.000001,
      )
      expect(step.endGapSeconds - step.startGapSeconds).toBeLessThanOrEqual(
        distanceKm * 4 + 0.000001,
      )
    }
  })
  it('keeps the Phase 3 to Phase 4 replay on one continuous stored checkpoint sequence', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const timeline = result.replayTimeline
    const phase3Checkpoint = timeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.checkpointKind === 'base' && checkpoint.phase === 3,
    )
    const finishCheckpoint = timeline.checkpoints.find(
      (checkpoint) => checkpoint.checkpointId === timeline.finalCheckpointId,
    )

    expect(phase3Checkpoint).toBeDefined()
    expect(finishCheckpoint).toBeDefined()
    expect(phase3Checkpoint!.raceProgress.fraction).toBe(0.7)
    expect(finishCheckpoint!.raceProgress.fraction).toBe(1)

    for (let index = 1; index < timeline.checkpoints.length; index += 1) {
      expect(
        timeline.checkpoints[index].raceProgress.kmFromStart,
      ).toBeGreaterThanOrEqual(
        timeline.checkpoints[index - 1].raceProgress.kmFromStart,
      )
    }

    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    expect(pageSource).not.toContain('function buildUniversalReplayFrames')
    expect(pageSource).toContain(
      'shadowBuild.result?.replayTimeline.checkpoints ?? []',
    )
  })

  it('reveals stored groups and gaps without frontend race-state normalization', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

    expect(pageSource).not.toContain(
      'function calculateUniversalDisplayedPelotonGap',
    )
    expect(pageSource).not.toContain(
      'function normalizeUniversalRenderedRows',
    )
    expect(pageSource).toContain('currentFrame.riderStates.map(')
    expect(pageSource).toContain('currentFrame.groups.map(')
    expect(pageSource).toContain('currentFrame.activeCommands.map(')
    expect(pageSource).toContain(
      'currentFrame?.finalResultsVisible === true',
    )
  })


})


describe('Phase 6 immutable finish-resolution foundation', () => {
  it('builds a deterministic read-only foundation before the selected resolver runs', () => {
    const input = createSoloFinishInput()
    const result = runRaceEngine(input)
    const foundation = buildUniversalFinishResolutionFoundation({
      input,
      stageClassification: result.stageClassification,
      riderReadiness: result.riderReadiness,
      riderSuitability: result.riderSuitability,
      roadCommandResolution: result.roadCommandResolution,
      roadRaceResolution: result.roadRaceResolution,
      groupAndTimeResolution: result.groupAndTimeResolution,
    })

    expect(foundation).toMatchObject({
      active: true,
      complete: false,
      stageClassification: result.stageClassification,
      winnerRiderId: null,
      winnerTeamId: null,
      deterministic: true,
      modelVersion: 'universal_finish_resolution_foundation_v1',
    })
    expect(foundation.classification).toEqual([])
    expect(foundation.teamTimes).toEqual([])
    expect(foundation.riderContexts).toHaveLength(input.riders.length)
    expect(result.finishResolution.complete).toBe(true)
  })

  it('classifies every supported time-trial format directly from the stored stage format', () => {
    const base = createValidInput()

    expect(
      classifyUniversalFinishMode(
        {
          ...base.stage,
          stageFormat: 'individual_time_trial',
          terrainType: 'individual_time_trial',
          finishType: 'time_trial_finish',
        },
        'individual_time_trial',
        1,
      ),
    ).toBe('individual_time_trial')

    expect(
      classifyUniversalFinishMode(
        {
          ...base.stage,
          stageFormat: 'prologue',
          terrainType: 'prologue',
          finishType: 'prologue_finish',
        },
        'prologue',
        1,
      ),
    ).toBe('prologue')

    expect(
      classifyUniversalFinishMode(
        {
          ...base.stage,
          stageFormat: 'team_time_trial',
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
        },
        'team_time_trial',
        8,
      ),
    ).toBe('team_time_trial')

    expect(
      classifyUniversalFinishMode(
        {
          ...base.stage,
          stageFormat: 'pair_time_trial',
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
        },
        'pair_time_trial',
        2,
      ),
    ).toBe('pair_time_trial')
  })

  it('classifies the accepted road finish modes without recalculating groups', () => {
    const base = createValidInput()

    expect(
      classifyUniversalFinishMode(
        base.stage,
        'flat_road_stage',
        1,
      ),
    ).toBe('solo_finish')
    expect(
      classifyUniversalFinishMode(
        base.stage,
        'flat_road_stage',
        24,
      ),
    ).toBe('flat_sprint')
    expect(
      classifyUniversalFinishMode(
        base.stage,
        'flat_road_stage',
        8,
      ),
    ).toBe('reduced_group_sprint')
    expect(
      classifyUniversalFinishMode(
        {
          ...base.stage,
          finishType: 'uphill_finish',
        },
        'hilly_road_stage',
        8,
      ),
    ).toBe('hill_finish')
    expect(
      classifyUniversalFinishMode(
        {
          ...base.stage,
          terrainType: 'mountain',
          finishType: 'summit_finish',
          summitFinish: true,
        },
        'mountain_road_stage',
        8,
      ),
    ).toBe('summit_finish')
    expect(
      classifyUniversalFinishMode(
        {
          ...base.stage,
          terrainType: 'cobbled',
          finishType: 'cobbled_finish',
        },
        'cobbled_road_stage',
        8,
      ),
    ).toBe('cobbled_finish')
  })

  it('reads Phase 1-5 outputs without mutating them', () => {
    const input = createSoloFinishInput()
    const result = runRaceEngine(input)
    const before = JSON.stringify({
      roadCommandResolution: result.roadCommandResolution,
      roadRaceResolution: result.roadRaceResolution,
      intermediatePointPlan: result.intermediatePointPlan,
      intermediatePointBattles: result.intermediatePointBattles,
      intermediatePointFinalization:
        result.intermediatePointFinalization,
      groupAndTimeResolution: result.groupAndTimeResolution,
    })

    const rebuilt = buildUniversalFinishResolutionFoundation({
      input,
      stageClassification: result.stageClassification,
      riderReadiness: result.riderReadiness,
      riderSuitability: result.riderSuitability,
      roadCommandResolution: result.roadCommandResolution,
      roadRaceResolution: result.roadRaceResolution,
      groupAndTimeResolution: result.groupAndTimeResolution,
    })

    expect(rebuilt.complete).toBe(false)
    expect(rebuilt.riderContexts).toEqual(
      result.finishResolution.riderContexts,
    )
    expect(
      JSON.stringify({
        roadCommandResolution: result.roadCommandResolution,
        roadRaceResolution: result.roadRaceResolution,
        intermediatePointPlan: result.intermediatePointPlan,
        intermediatePointBattles: result.intermediatePointBattles,
        intermediatePointFinalization:
          result.intermediatePointFinalization,
        groupAndTimeResolution: result.groupAndTimeResolution,
      }),
    ).toBe(before)
  })

  it('copies only accepted readiness, energy, command, support, preparation and physical-group inputs', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const context = result.finishResolution.riderContexts.find(
      (row) => row.riderId === 'rider-1',
    )!
    const readiness = result.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const suitability = result.riderSuitability.find(
      (row) => row.riderId === 'rider-1',
    )!
    const finalGroup = result.groupAndTimeResolution.finalGroups.find(
      (group) => group.riderIds.includes('rider-1'),
    )!

    expect(context.sprintSkill).toBe(
      input.riders.find((rider) => rider.riderId === 'rider-1')!.sprint,
    )
    expect(context.timeTrialSkill).toBe(
      input.riders.find((rider) => rider.riderId === 'rider-1')!.timeTrial,
    )
    expect(context.startFreshness).toBe(
      readiness.components.startFreshness,
    )
    expect(context.climbingSkill).toBe(
      input.riders.find((rider) => rider.riderId === 'rider-1')!.climbing,
    )
    expect(context.readinessScore).toBe(readiness.readinessScore)
    expect(context.suitabilityScore).toBe(
      suitability.suitabilityScore,
    )
    expect(context.physicalGroupCode).toBe(finalGroup.groupCode)
    expect(context.physicalGroupOrder).toBe(finalGroup.groupOrder)
    expect(context.physicalGapSeconds).toBe(finalGroup.gapSeconds)
    expect(context.preparation).toEqual({
      inStageEnergyCostMultiplier: 1,
      postStageFatigueMultiplier: 1,
      postStageRecoveryBonusPoints: 0,
    })
  })

  it('returns an identical finish foundation for identical inputs', () => {
    const input = createSoloFinishInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const firstFoundation = buildUniversalFinishResolutionFoundation({
      input,
      stageClassification: first.stageClassification,
      riderReadiness: first.riderReadiness,
      riderSuitability: first.riderSuitability,
      roadCommandResolution: first.roadCommandResolution,
      roadRaceResolution: first.roadRaceResolution,
      groupAndTimeResolution: first.groupAndTimeResolution,
    })
    const secondFoundation = buildUniversalFinishResolutionFoundation({
      input,
      stageClassification: second.stageClassification,
      riderReadiness: second.riderReadiness,
      riderSuitability: second.riderSuitability,
      roadCommandResolution: second.roadCommandResolution,
      roadRaceResolution: second.roadRaceResolution,
      groupAndTimeResolution: second.groupAndTimeResolution,
    })

    expect(firstFoundation).toEqual(secondFoundation)
  })
})


describe('Phase 6 solo finish resolution', () => {
  it('returns the physically isolated rider as winner with a complete classification', () => {
    const input = createSoloFinishInput()
    const result = runRaceEngine(input)
    const finishers = result.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )
    const dnsRows = result.finishResolution.classification.filter(
      (row) => row.status === 'dns',
    )

    expect(result.finishResolution).toMatchObject({
      finishMode: 'solo_finish',
      complete: true,
      deterministic: true,
      modelVersion: 'universal_solo_finish_v1',
    })
    expect(finishers).toHaveLength(1)
    expect(finishers[0].rank).toBe(1)
    expect(finishers[0].riderId).toBe(result.finishResolution.winnerRiderId)
    expect(finishers[0].teamId).toBe(result.finishResolution.winnerTeamId)
    expect(finishers[0].gapSeconds).toBe(0)
    expect(dnsRows).toHaveLength(input.riders.length - 1)
    expect(dnsRows.every((row) => row.rank == null)).toBe(true)
  })

  it('preserves the accepted Phase 5 group and official time', () => {
    const result = runRaceEngine(createSoloFinishInput())
    const winner = result.finishResolution.classification.find(
      (row) => row.rank === 1,
    )!
    const context = result.finishResolution.riderContexts.find(
      (row) => row.riderId === winner.riderId,
    )!

    expect(winner.physicalGroupCode).toBe(context.physicalGroupCode)
    expect(winner.physicalGroupOrder).toBe(context.physicalGroupOrder)
    expect(winner.officialTimeSeconds).toBe(
      context.phase5OfficialTimeSeconds,
    )
    expect(runRaceEngine(createSoloFinishInput()).finishResolution).toEqual(
      result.finishResolution,
    )
  })
})


describe('Phase 6 flat sprint finish resolution', () => {
  function withPhase4Commands(
    input: UniversalRaceEngineInput,
    commandByRiderId: Readonly<Record<string, string>>,
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((rider) => ({
          ...rider,
          commands: {
            ...rider.commands,
            phase4: (commandByRiderId[rider.riderId] ??
              'avoid_risks') as typeof rider.commands.phase4,
          },
        })),
      })),
    }
  }

  it('returns one complete deterministic classification for a flat sprint', () => {
    const input = createExpandedFieldInput(26)
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('flat_sprint')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_flat_sprint_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves every Phase 5 physical group and official time', () => {
    const input = createExpandedFieldInput(26)
    const result = runRaceEngine(input)
    const phase5ByRider = new Map(
      result.groupAndTimeResolution.officialResults.map((row) => [
        row.riderId,
        row,
      ]),
    )
    const groupByRider = new Map<string, number>()
    for (const group of result.groupAndTimeResolution.finalGroups) {
      for (const riderId of group.riderIds) {
        groupByRider.set(riderId, group.groupOrder)
      }
    }
    const winnerTime = result.finishResolution.classification.find(
      (row) => row.rank === 1,
    )!.officialTimeSeconds!

    for (const row of result.finishResolution.classification.filter(
      (candidate) => candidate.status === 'finished',
    )) {
      const phase5 = phase5ByRider.get(row.riderId)!
      expect(row.physicalGroupOrder).toBe(groupByRider.get(row.riderId))
      expect(row.officialTimeSeconds).toBe(phase5.officialTimeSeconds)
      expect(row.gapSeconds).toBe(
        phase5.officialTimeSeconds - winnerTime,
      )
    }
  })

  it('allows only deliberate sprint contenders to fight for victory', () => {
    const base = createExpandedFieldInput(26)
    const baseline = runRaceEngine(base)
    const frontGroup = baseline.groupAndTimeResolution.finalGroups[0]
    const contenderId = frontGroup.riderIds.find((riderId) =>
      base.stagePlans.some((plan) =>
        plan.riders.some(
          (rider) =>
            rider.riderId === riderId && rider.stageRole === 'sprinter',
        ),
      ),
    )!
    const passiveId = frontGroup.riderIds.find(
      (riderId) => riderId !== contenderId,
    )!
    const input = withPhase4Commands(base, {
      [contenderId]: 'final_sprint',
    })
    const result = runRaceEngine(input)
    const contender = result.finishResolution.classification.find(
      (row) => row.riderId === contenderId,
    )!
    const passive = result.finishResolution.classification.find(
      (row) => row.riderId === passiveId,
    )!

    expect(contender.physicalGroupOrder).toBe(1)
    expect(passive.physicalGroupOrder).toBe(1)
    expect(result.finishResolution.winnerRiderId).toBe(contenderId)
    expect(contender.components?.command).toBe(7)
    expect(passive.components?.command).toBe(0)
    expect(passive.officialTimeSeconds).toBe(contender.officialTimeSeconds)
    expect(passive.rank).toBeGreaterThan(contender.rank!)
  })

  it('adds lead-out support without changing the physical group time', () => {
    const noSupportInput = withPhase4Commands(
      createExpandedFieldInput(26),
      {
        'expanded-rider-26': 'final_sprint',
      },
    )
    const withSupportInput = withPhase4Commands(
      createExpandedFieldInput(26),
      {
        'expanded-rider-25': 'lead_out_sprinter',
        'expanded-rider-26': 'final_sprint',
      },
    )
    const noSupport = runRaceEngine(noSupportInput)
    const withSupport = runRaceEngine(withSupportInput)
    const withoutRow = noSupport.finishResolution.classification.find(
      (row) => row.riderId === 'expanded-rider-26',
    )!
    const withRow = withSupport.finishResolution.classification.find(
      (row) => row.riderId === 'expanded-rider-26',
    )!

    expect(withoutRow.components?.support).toBe(0)
    expect(withRow.components?.support).toBeGreaterThan(0)
    expect(withRow.finishScore).toBeGreaterThan(withoutRow.finishScore!)
    expect(withRow.officialTimeSeconds).toBe(
      withoutRow.officialTimeSeconds,
    )
    expect(withRow.physicalGroupOrder).toBe(
      withoutRow.physicalGroupOrder,
    )
  })

  it('keeps seeded variation small enough that a large sprint advantage wins', () => {
    let input = withPhase4Commands(createExpandedFieldInput(26), {
      'expanded-rider-20': 'final_sprint',
      'expanded-rider-26': 'final_sprint',
    })
    input = {
      ...input,
      riders: input.riders.map((rider) =>
        rider.riderId === 'expanded-rider-20'
          ? { ...rider, sprint: 100 }
          : rider.riderId === 'expanded-rider-26'
            ? { ...rider, sprint: 60 }
            : rider,
      ),
    }
    const result = runRaceEngine(input)
    const stronger = result.finishResolution.classification.find(
      (row) => row.riderId === 'expanded-rider-20',
    )!
    const weaker = result.finishResolution.classification.find(
      (row) => row.riderId === 'expanded-rider-26',
    )!

    expect(Math.abs(stronger.components?.variation ?? 0)).toBeLessThanOrEqual(
      1.25,
    )
    expect(Math.abs(weaker.components?.variation ?? 0)).toBeLessThanOrEqual(
      1.25,
    )
    expect(stronger.physicalGroupOrder).toBe(1)
    expect(weaker.physicalGroupOrder).toBe(1)
    expect(stronger.rank).toBeLessThan(weaker.rank!)
  })
})


describe('Phase 6 reduced-group sprint finish resolution', () => {
  function cloneReducedGroupContext(
    context: UniversalFinishRiderContext,
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext {
    return { ...context, ...overrides }
  }

  function withReducedGroupPhase4Commands(
    input: UniversalRaceEngineInput,
    commandByRiderId: Readonly<Record<string, string>>,
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((rider) => ({
          ...rider,
          commands: {
            ...rider.commands,
            phase4: (commandByRiderId[rider.riderId] ??
              rider.commands.phase4) as typeof rider.commands.phase4,
          },
        })),
      })),
    }
  }

  it('returns one complete deterministic classification for a reduced-group sprint', () => {
    const input = createValidInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('reduced_group_sprint')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_reduced_group_sprint_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves every Phase 5 physical group, official time and gap', () => {
    const result = runRaceEngine(createValidInput())
    const phase5ByRider = new Map(
      result.groupAndTimeResolution.officialResults.map((row) => [
        row.riderId,
        row,
      ]),
    )
    const groupByRider = new Map<string, number>()
    for (const group of result.groupAndTimeResolution.finalGroups) {
      for (const riderId of group.riderIds) {
        groupByRider.set(riderId, group.groupOrder)
      }
    }
    const winnerTime = result.finishResolution.classification.find(
      (row) => row.rank === 1,
    )!.officialTimeSeconds!

    for (const row of result.finishResolution.classification.filter(
      (candidate) => candidate.status === 'finished',
    )) {
      const phase5 = phase5ByRider.get(row.riderId)!
      expect(row.physicalGroupOrder).toBe(groupByRider.get(row.riderId))
      expect(row.officialTimeSeconds).toBe(phase5.officialTimeSeconds)
      expect(row.gapSeconds).toBe(
        phase5.officialTimeSeconds - winnerTime,
      )
    }
  })

  it('gives climbing and hilly suitability meaningful influence', () => {
    const result = runRaceEngine(createValidInput())
    const base = result.finishResolution.riderContexts[0]
    const lowClimbing = scoreUniversalReducedGroupSprintRider(
      cloneReducedGroupContext(base, {
        sprintSkill: 75,
        climbingSkill: 40,
        remainingEnergy: 70,
        suitabilityScore: 65,
        phase4FinishRank: 1,
        leadOutSupportReceived: 0,
        phase4Command: 'final_sprint',
      }),
      'reduced-group-climbing-test',
      6,
    )
    const highClimbing = scoreUniversalReducedGroupSprintRider(
      cloneReducedGroupContext(base, {
        sprintSkill: 75,
        climbingSkill: 90,
        remainingEnergy: 70,
        suitabilityScore: 85,
        phase4FinishRank: 1,
        leadOutSupportReceived: 0,
        phase4Command: 'final_sprint',
      }),
      'reduced-group-climbing-test',
      6,
    )

    expect(highClimbing.components.skill).toBeGreaterThan(
      lowClimbing.components.skill,
    )
    expect(highClimbing.components.suitability).toBeGreaterThan(
      lowClimbing.components.suitability,
    )
    expect(highClimbing.finishScore).toBeGreaterThan(
      lowClimbing.finishScore,
    )
  })

  it('makes remaining energy more valuable in a smaller finishing group', () => {
    const result = runRaceEngine(createValidInput())
    const base = result.finishResolution.riderContexts[0]
    const lowEnergy = scoreUniversalReducedGroupSprintRider(
      cloneReducedGroupContext(base, {
        remainingEnergy: 35,
        phase4FinishRank: 1,
        leadOutSupportReceived: 0,
        phase4Command: 'final_sprint',
      }),
      'reduced-group-energy-test',
      4,
    )
    const highEnergy = scoreUniversalReducedGroupSprintRider(
      cloneReducedGroupContext(base, {
        remainingEnergy: 85,
        phase4FinishRank: 1,
        leadOutSupportReceived: 0,
        phase4Command: 'final_sprint',
      }),
      'reduced-group-energy-test',
      4,
    )

    expect(highEnergy.components.energy).toBeGreaterThan(
      lowEnergy.components.energy,
    )
    expect(highEnergy.finishScore).toBeGreaterThan(lowEnergy.finishScore)
  })

  it('reduces lead-out influence as the front group becomes smaller', () => {
    const result = runRaceEngine(createValidInput())
    const context = cloneReducedGroupContext(
      result.finishResolution.riderContexts[0],
      {
        leadOutSupportReceived: 4,
        phase4FinishRank: 1,
        phase4Command: 'final_sprint',
      },
    )
    const verySmallGroup = scoreUniversalReducedGroupSprintRider(
      context,
      'reduced-group-size-test',
      3,
    )
    const maximumReducedGroup = scoreUniversalReducedGroupSprintRider(
      context,
      'reduced-group-size-test',
      12,
    )

    expect(verySmallGroup.components.support).toBeLessThan(
      maximumReducedGroup.components.support,
    )
  })

  it('keeps seeded variation deterministic and bounded to one point', () => {
    const result = runRaceEngine(createValidInput())
    const context = result.finishResolution.riderContexts[0]
    const first = scoreUniversalReducedGroupSprintRider(
      context,
      'reduced-group-variation-test',
      6,
    )
    const second = scoreUniversalReducedGroupSprintRider(
      context,
      'reduced-group-variation-test',
      6,
    )

    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(1)
  })

  it('allows eligible attackers and climbers to contest without a sprint command', () => {
    const input = withReducedGroupPhase4Commands(createValidInput(), {
      'rider-1': 'attack',
      'rider-2': 'climb_hard',
      'rider-3': 'avoid_risks',
      'rider-4': 'avoid_risks',
    })
    const result = runRaceEngine(input)
    const frontGroupOrder = Math.min(
      ...result.finishResolution.riderContexts
        .filter(
          (row) => row.eligibleToStart && row.physicalGroupOrder != null,
        )
        .map((row) => row.physicalGroupOrder!),
    )
    const frontRows = result.finishResolution.classification.filter(
      (row) => row.physicalGroupOrder === frontGroupOrder,
    )

    expect(result.finishResolution.complete).toBe(true)
    expect(frontRows.length).toBeGreaterThan(0)
    expect(
      frontRows.some((row) => (row.components?.command ?? 0) >= 3),
    ).toBe(true)
    expect(result.finishResolution.winnerRiderId).toBeTruthy()
  })

})


describe('Phase 6 hill finish resolution', () => {
  function createHillFinishInput(): UniversalRaceEngineInput {
    const base = withStageFormat(createExpandedFieldInput(26), {
      stageFormat: 'road_race',
      terrainType: 'hilly',
      finishType: 'uphill_finish',
      profileType: 'hilly',
    })

    return {
      ...base,
      stage: {
        ...base.stage,
        elevationGainM: 1450,
        terrainPercentages: {
          flat: 30,
          hilly: 60,
          mountain: 10,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 20 },
          { km: 45, elevationM: 260 },
          { km: 90, elevationM: 180 },
          { km: 115, elevationM: 300 },
          { km: 120, elevationM: 520 },
        ],
      },
    }
  }

  function cloneHillContext(
    context: UniversalFinishRiderContext,
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext {
    return { ...context, ...overrides }
  }

  it('returns one complete deterministic classification for an uphill finish', () => {
    const input = createHillFinishInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('hill_finish')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_hill_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves every Phase 5 physical group, official time and gap', () => {
    const result = runRaceEngine(createHillFinishInput())
    const phase5ByRider = new Map(
      result.groupAndTimeResolution.officialResults.map((row) => [
        row.riderId,
        row,
      ]),
    )
    const groupByRider = new Map<string, number>()
    for (const group of result.groupAndTimeResolution.finalGroups) {
      for (const riderId of group.riderIds) {
        groupByRider.set(riderId, group.groupOrder)
      }
    }
    const winnerTime = result.finishResolution.classification.find(
      (row) => row.rank === 1,
    )!.officialTimeSeconds!

    for (const row of result.finishResolution.classification.filter(
      (candidate) => candidate.status === 'finished',
    )) {
      const phase5 = phase5ByRider.get(row.riderId)!
      expect(row.physicalGroupOrder).toBe(groupByRider.get(row.riderId))
      expect(row.officialTimeSeconds).toBe(phase5.officialTimeSeconds)
      expect(row.gapSeconds).toBe(
        phase5.officialTimeSeconds - winnerTime,
      )
    }
  })

  it('combines climbing with sprint as the acceleration proxy', () => {
    const result = runRaceEngine(createHillFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const lowerClimbing = scoreUniversalHillFinishRider(
      cloneHillContext(base, {
        climbingSkill: 45,
        sprintSkill: 75,
        remainingEnergy: 70,
        suitabilityScore: 70,
        phase4Command: 'ride_for_stage_result',
      }),
      'hill-skill-test',
      1,
      4,
    )
    const higherClimbing = scoreUniversalHillFinishRider(
      cloneHillContext(base, {
        climbingSkill: 90,
        sprintSkill: 75,
        remainingEnergy: 70,
        suitabilityScore: 70,
        phase4Command: 'ride_for_stage_result',
      }),
      'hill-skill-test',
      1,
      4,
    )
    const higherAcceleration = scoreUniversalHillFinishRider(
      cloneHillContext(base, {
        climbingSkill: 45,
        sprintSkill: 95,
        remainingEnergy: 70,
        suitabilityScore: 70,
        phase4Command: 'ride_for_stage_result',
      }),
      'hill-skill-test',
      1,
      4,
    )

    expect(higherClimbing.components.skill).toBeGreaterThan(
      lowerClimbing.components.skill,
    )
    expect(higherAcceleration.components.skill).toBeGreaterThan(
      lowerClimbing.components.skill,
    )
    expect(higherClimbing.finishScore).toBeGreaterThan(
      lowerClimbing.finishScore,
    )
    expect(higherAcceleration.finishScore).toBeGreaterThan(
      lowerClimbing.finishScore,
    )
  })

  it('rewards remaining freshness without recalculating energy', () => {
    const result = runRaceEngine(createHillFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const tired = scoreUniversalHillFinishRider(
      cloneHillContext(base, {
        remainingEnergy: 25,
        phase4Command: 'ride_for_stage_result',
      }),
      'hill-energy-test',
      1,
      4,
    )
    const fresh = scoreUniversalHillFinishRider(
      cloneHillContext(base, {
        remainingEnergy: 85,
        phase4Command: 'ride_for_stage_result',
      }),
      'hill-energy-test',
      1,
      4,
    )

    expect(fresh.components.energy).toBeGreaterThan(tired.components.energy)
    expect(fresh.finishScore).toBeGreaterThan(tired.finishScore)
  })

  it('gives an explicit attack a larger finish bonus than a neutral command', () => {
    const result = runRaceEngine(createHillFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const neutral = scoreUniversalHillFinishRider(
      cloneHillContext(base, { phase4Command: 'follow_team_plan' }),
      'hill-command-test',
      1,
      4,
    )
    const attack = scoreUniversalHillFinishRider(
      cloneHillContext(base, { phase4Command: 'attack' }),
      'hill-command-test',
      1,
      4,
    )

    expect(neutral.components.command).toBe(0)
    expect(attack.components.command).toBe(6)
    expect(attack.finishScore).toBeGreaterThan(neutral.finishScore)
  })

  it('uses the rider position inside the current physical group', () => {
    const result = runRaceEngine(createHillFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const frontPosition = scoreUniversalHillFinishRider(
      base,
      'hill-position-test',
      1,
      6,
    )
    const backPosition = scoreUniversalHillFinishRider(
      base,
      'hill-position-test',
      6,
      6,
    )

    expect(frontPosition.components.positioning).toBeGreaterThan(
      backPosition.components.positioning,
    )
    expect(frontPosition.finishScore).toBeGreaterThan(
      backPosition.finishScore,
    )
  })

  it('keeps deterministic variation bounded to one point', () => {
    const result = runRaceEngine(createHillFinishInput())
    const context = result.finishResolution.riderContexts[0]
    const first = scoreUniversalHillFinishRider(
      context,
      'hill-variation-test',
      1,
      4,
    )
    const second = scoreUniversalHillFinishRider(
      context,
      'hill-variation-test',
      1,
      4,
    )

    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(1)
  })

  it('never lets a later physical group overtake the first group', () => {
    const result = runRaceEngine(createHillFinishInput())
    const finishers = result.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )
    const firstGroupOrder = Math.min(
      ...finishers.map((row) => row.physicalGroupOrder!),
    )
    const firstLaterGroupIndex = finishers.findIndex(
      (row) => row.physicalGroupOrder! > firstGroupOrder,
    )

    if (firstLaterGroupIndex >= 0) {
      expect(
        finishers
          .slice(0, firstLaterGroupIndex)
          .every((row) => row.physicalGroupOrder === firstGroupOrder),
      ).toBe(true)
      expect(
        finishers
          .slice(firstLaterGroupIndex)
          .every(
            (row) =>
              row.officialTimeSeconds! >=
              finishers[firstLaterGroupIndex - 1].officialTimeSeconds!,
          ),
      ).toBe(true)
    }
  })
})


describe('Phase 6 summit finish resolution', () => {
  function createSummitFinishInput(): UniversalRaceEngineInput {
    const base = withStageFormat(createExpandedFieldInput(26), {
      stageFormat: 'road_race',
      terrainType: 'mountain',
      finishType: 'summit_finish',
      profileType: 'mountain',
    })

    return {
      ...base,
      stage: {
        ...base.stage,
        elevationGainM: 3400,
        summitFinish: true,
        terrainPercentages: {
          flat: 15,
          hilly: 25,
          mountain: 60,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 80 },
          { km: 35, elevationM: 420 },
          { km: 70, elevationM: 260 },
          { km: 95, elevationM: 920 },
          { km: 110, elevationM: 1280 },
          { km: 120, elevationM: 1880 },
        ],
      },
    }
  }

  function cloneSummitContext(
    context: UniversalFinishRiderContext,
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext {
    return { ...context, ...overrides }
  }

  it('returns one complete deterministic classification for a summit finish', () => {
    const input = createSummitFinishInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('summit_finish')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_summit_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves every Phase 5 physical group, official time and gap', () => {
    const result = runRaceEngine(createSummitFinishInput())
    const phase5ByRider = new Map(
      result.groupAndTimeResolution.officialResults.map((row) => [
        row.riderId,
        row,
      ]),
    )
    const groupByRider = new Map<string, number>()
    for (const group of result.groupAndTimeResolution.finalGroups) {
      for (const riderId of group.riderIds) {
        groupByRider.set(riderId, group.groupOrder)
      }
    }
    const winnerTime = result.finishResolution.classification.find(
      (row) => row.rank === 1,
    )!.officialTimeSeconds!

    for (const row of result.finishResolution.classification.filter(
      (candidate) => candidate.status === 'finished',
    )) {
      const phase5 = phase5ByRider.get(row.riderId)!
      expect(row.physicalGroupOrder).toBe(groupByRider.get(row.riderId))
      expect(row.officialTimeSeconds).toBe(phase5.officialTimeSeconds)
      expect(row.gapSeconds).toBe(
        phase5.officialTimeSeconds - winnerTime,
      )
    }
  })

  it('combines climbing, endurance and resistance', () => {
    const result = runRaceEngine(createSummitFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const lower = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, {
        climbingSkill: 50,
        enduranceSkill: 50,
        resistanceSkill: 50,
        remainingEnergy: 65,
      }),
      'summit-skill-test',
      1,
      4,
    )
    const stronger = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, {
        climbingSkill: 90,
        enduranceSkill: 85,
        resistanceSkill: 80,
        remainingEnergy: 65,
      }),
      'summit-skill-test',
      1,
      4,
    )

    expect(stronger.components.skill).toBeGreaterThan(lower.components.skill)
    expect(stronger.finishScore).toBeGreaterThan(lower.finishScore)
  })

  it('rewards remaining freshness and applies only a modest direct fatigue penalty', () => {
    const result = runRaceEngine(createSummitFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const tired = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, {
        remainingEnergy: 25,
        fatigueBeforeStage: 80,
      }),
      'summit-energy-fatigue-test',
      1,
      4,
    )
    const fresh = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, {
        remainingEnergy: 85,
        fatigueBeforeStage: 10,
      }),
      'summit-energy-fatigue-test',
      1,
      4,
    )

    expect(fresh.components.energy).toBeGreaterThan(tired.components.energy)
    expect(fresh.components.fatigue).toBeGreaterThan(tired.components.fatigue)
    expect(fresh.finishScore).toBeGreaterThan(tired.finishScore)
    expect(tired.components.fatigue).toBe(-3.2)
  })

  it('uses actual successful Phase 3 attack timing instead of inventing a finish attack', () => {
    const result = runRaceEngine(createSummitFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const noSuccessfulAttack = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, {
        phase4Command: 'attack',
        successfulAttackAttemptKm: null,
        successfulAttackTimingFraction: null,
      }),
      'summit-attack-timing-test',
      1,
      4,
    )
    const lateSuccessfulAttack = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, {
        phase4Command: 'attack',
        successfulAttackAttemptKm: 82,
        successfulAttackTimingFraction: 0.8,
      }),
      'summit-attack-timing-test',
      1,
      4,
    )

    expect(noSuccessfulAttack.components.command).toBe(5)
    expect(noSuccessfulAttack.components.attackTiming).toBe(0)
    expect(lateSuccessfulAttack.components.attackTiming).toBe(4.4)
    expect(lateSuccessfulAttack.finishScore).toBeGreaterThan(
      noSuccessfulAttack.finishScore,
    )
  })

  it('uses team support already calculated during the decisive phase', () => {
    const result = runRaceEngine(createSummitFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const unsupported = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, { teamSupportReceived: 0 }),
      'summit-support-test',
      1,
      4,
    )
    const supported = scoreUniversalSummitFinishRider(
      cloneSummitContext(base, { teamSupportReceived: 4 }),
      'summit-support-test',
      1,
      4,
    )

    expect(unsupported.components.support).toBe(0)
    expect(supported.components.support).toBe(4)
    expect(supported.finishScore).toBeGreaterThan(unsupported.finishScore)
  })

  it('keeps deterministic variation bounded to three quarters of a point', () => {
    const result = runRaceEngine(createSummitFinishInput())
    const context = result.finishResolution.riderContexts[0]
    const first = scoreUniversalSummitFinishRider(
      context,
      'summit-variation-test',
      1,
      4,
    )
    const second = scoreUniversalSummitFinishRider(
      context,
      'summit-variation-test',
      1,
      4,
    )

    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(0.75)
  })

  it('never lets a later physical group overtake the summit front group', () => {
    const result = runRaceEngine(createSummitFinishInput())
    const finishers = result.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )
    const firstGroupOrder = Math.min(
      ...finishers.map((row) => row.physicalGroupOrder!),
    )
    const firstLaterGroupIndex = finishers.findIndex(
      (row) => row.physicalGroupOrder! > firstGroupOrder,
    )

    if (firstLaterGroupIndex >= 0) {
      expect(
        finishers
          .slice(0, firstLaterGroupIndex)
          .every((row) => row.physicalGroupOrder === firstGroupOrder),
      ).toBe(true)
    }
  })
})


describe('Phase 6 cobbled finish resolution', () => {
  function createCobbledFinishInput(): UniversalRaceEngineInput {
    const base = withStageFormat(createExpandedFieldInput(26), {
      stageFormat: 'road_race',
      terrainType: 'cobbled',
      finishType: 'cobbled_finish',
      profileType: 'cobbled',
    })

    return {
      ...base,
      stage: {
        ...base.stage,
        elevationGainM: 1150,
        summitFinish: false,
        terrainPercentages: {
          flat: 55,
          hilly: 25,
          mountain: 5,
          cobbled: 15,
        },
        profilePoints: [
          { km: 0, elevationM: 40 },
          { km: 25, elevationM: 90 },
          { km: 50, elevationM: 55 },
          { km: 75, elevationM: 150 },
          { km: 100, elevationM: 105 },
          { km: 120, elevationM: 135 },
        ],
      },
    }
  }

  function cloneCobbledContext(
    context: UniversalFinishRiderContext,
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext {
    return { ...context, ...overrides }
  }

  it('returns one complete deterministic classification for a cobbled finish', () => {
    const input = createCobbledFinishInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('cobbled_finish')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_cobbled_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves every Phase 5 physical group, official time and gap', () => {
    const result = runRaceEngine(createCobbledFinishInput())
    const phase5ByRider = new Map(
      result.groupAndTimeResolution.officialResults.map((row) => [
        row.riderId,
        row,
      ]),
    )
    const groupByRider = new Map<string, number>()
    for (const group of result.groupAndTimeResolution.finalGroups) {
      for (const riderId of group.riderIds) {
        groupByRider.set(riderId, group.groupOrder)
      }
    }
    const winnerTime = result.finishResolution.classification.find(
      (row) => row.rank === 1,
    )!.officialTimeSeconds!

    for (const row of result.finishResolution.classification.filter(
      (candidate) => candidate.status === 'finished',
    )) {
      const phase5 = phase5ByRider.get(row.riderId)!
      expect(row.physicalGroupOrder).toBe(groupByRider.get(row.riderId))
      expect(row.officialTimeSeconds).toBe(phase5.officialTimeSeconds)
      expect(row.gapSeconds).toBe(
        phase5.officialTimeSeconds - winnerTime,
      )
    }
  })

  it('combines flat skill, resistance, endurance and sprint ability', () => {
    const result = runRaceEngine(createCobbledFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const weaker = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, {
        flatSkill: 45,
        resistanceSkill: 45,
        enduranceSkill: 45,
        sprintSkill: 45,
        remainingEnergy: 65,
      }),
      'cobbled-skill-test',
      1,
      6,
    )
    const stronger = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, {
        flatSkill: 90,
        resistanceSkill: 85,
        enduranceSkill: 80,
        sprintSkill: 75,
        remainingEnergy: 65,
      }),
      'cobbled-skill-test',
      1,
      6,
    )

    expect(stronger.components.skill).toBeGreaterThan(weaker.components.skill)
    expect(stronger.finishScore).toBeGreaterThan(weaker.finishScore)
  })

  it('rewards remaining freshness and applies only a small direct fatigue penalty', () => {
    const result = runRaceEngine(createCobbledFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const tired = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, {
        remainingEnergy: 25,
        fatigueBeforeStage: 80,
      }),
      'cobbled-energy-fatigue-test',
      1,
      6,
    )
    const fresh = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, {
        remainingEnergy: 85,
        fatigueBeforeStage: 10,
      }),
      'cobbled-energy-fatigue-test',
      1,
      6,
    )

    expect(fresh.components.energy).toBeGreaterThan(tired.components.energy)
    expect(fresh.components.fatigue).toBeGreaterThan(tired.components.fatigue)
    expect(fresh.finishScore).toBeGreaterThan(tired.finishScore)
    expect(tired.components.fatigue).toBe(-2)
  })

  it('rewards aggressive cobbled positioning commands and penalizes risk avoidance', () => {
    const result = runRaceEngine(createCobbledFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const cautious = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, { phase4Command: 'avoid_risks' }),
      'cobbled-command-test',
      1,
      6,
    )
    const attacking = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, { phase4Command: 'attack' }),
      'cobbled-command-test',
      1,
      6,
    )

    expect(cautious.components.command).toBe(-1.5)
    expect(attacking.components.command).toBe(5)
    expect(attacking.finishScore).toBeGreaterThan(cautious.finishScore)
  })

  it('uses current group position and existing support without changing physical time', () => {
    const result = runRaceEngine(createCobbledFinishInput())
    const base = result.finishResolution.riderContexts[0]
    const unsupportedBack = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, {
        teamSupportReceived: 0,
        leadOutSupportReceived: 0,
      }),
      'cobbled-position-support-test',
      6,
      6,
    )
    const supportedFront = scoreUniversalCobbledFinishRider(
      cloneCobbledContext(base, {
        teamSupportReceived: 2,
        leadOutSupportReceived: 2,
      }),
      'cobbled-position-support-test',
      1,
      6,
    )

    expect(supportedFront.components.positioning).toBe(5)
    expect(unsupportedBack.components.positioning).toBe(0)
    expect(supportedFront.components.support).toBeGreaterThan(
      unsupportedBack.components.support,
    )
    expect(supportedFront.finishScore).toBeGreaterThan(
      unsupportedBack.finishScore,
    )
  })

  it('keeps deterministic variation bounded to one point', () => {
    const result = runRaceEngine(createCobbledFinishInput())
    const context = result.finishResolution.riderContexts[0]
    const first = scoreUniversalCobbledFinishRider(
      context,
      'cobbled-variation-test',
      1,
      6,
    )
    const second = scoreUniversalCobbledFinishRider(
      context,
      'cobbled-variation-test',
      1,
      6,
    )

    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(1)
  })

  it('never lets a later physical group overtake the cobbled front group', () => {
    const result = runRaceEngine(createCobbledFinishInput())
    const finishers = result.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )
    const firstGroupOrder = Math.min(
      ...finishers.map((row) => row.physicalGroupOrder!),
    )
    const firstLaterGroupIndex = finishers.findIndex(
      (row) => row.physicalGroupOrder! > firstGroupOrder,
    )

    if (firstLaterGroupIndex >= 0) {
      expect(
        finishers
          .slice(0, firstLaterGroupIndex)
          .every((row) => row.physicalGroupOrder === firstGroupOrder),
      ).toBe(true)
    }
  })
})


describe('Phase 6 individual time trial finish resolution', () => {
  function createIndividualTimeTrialInput(
    distanceKm = 40,
  ): UniversalRaceEngineInput {
    const formatted = withStageFormat(createExpandedFieldInput(26), {
      stageFormat: 'individual_time_trial',
      terrainType: 'individual_time_trial',
      finishType: 'time_trial_finish',
      profileType: 'time_trial',
    })
    const input = withTimeTrialRules(formatted, null)

    return {
      ...input,
      stage: {
        ...input.stage,
        distanceKm,
        elevationGainM: Math.round(distanceKm * 8),
        summitFinish: false,
        terrainPercentages: {
          flat: 70,
          hilly: 20,
          mountain: 10,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 40 },
          { km: distanceKm * 0.5, elevationM: 180 },
          { km: distanceKm, elevationM: 90 },
        ],
      },
      points: [
        {
          pointId: 'itt-start',
          stageId: input.stage.stageId,
          pointType: 'START',
          kmFromStart: 0,
          name: 'Start',
          komCategory: null,
          pointsScheme: [],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 0,
          metadata: {},
        },
        {
          pointId: 'itt-finish',
          stageId: input.stage.stageId,
          pointType: 'FINISH',
          kmFromStart: distanceKm,
          name: 'Finish',
          komCategory: null,
          pointsScheme: [50, 35, 30],
          timeBonusSeconds: [],
          isFinishPoint: true,
          sortOrder: 1,
          metadata: {},
        },
      ],
    }
  }

  function cloneIndividualTimeTrialContext(
    context: UniversalFinishRiderContext,
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext {
    return { ...context, ...overrides }
  }

  it('returns one complete deterministic classification with independent rider times', () => {
    const input = createIndividualTimeTrialInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('individual_time_trial')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_individual_time_trial_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.teamTimes).toEqual([])
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(
      finishers.every(
        (row, index) =>
          index === 0 ||
          row.officialTimeSeconds! >=
            finishers[index - 1].officialTimeSeconds!,
      ),
    ).toBe(true)
    const winnerTime = finishers[0].officialTimeSeconds!
    expect(
      finishers.every(
        (row) => row.gapSeconds === row.officialTimeSeconds! - winnerTime,
      ),
    ).toBe(true)
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('does not mutate the accepted Phase 5 timing result while publishing Phase 6 times', () => {
    const result = runRaceEngine(createIndividualTimeTrialInput())
    const phase5Before = JSON.stringify(result.groupAndTimeResolution)

    expect(result.finishResolution.complete).toBe(true)
    expect(JSON.stringify(result.groupAndTimeResolution)).toBe(phase5Before)
    expect(result.groupAndTimeResolution.modelVersion).toBe(
      'universal_phase_5_lineage_groups_and_times_v2',
    )
  })

  it('gives stronger time-trial ability a lower official time', () => {
    const input = createIndividualTimeTrialInput()
    const result = runRaceEngine(input)
    const base = result.finishResolution.riderContexts[0]
    const weaker = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, {
        timeTrialSkill: 45,
        flatSkill: 50,
        enduranceSkill: 55,
        readinessScore: 70,
        suitabilityScore: 65,
        startFreshness: 72,
      }),
      input,
    )
    const stronger = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, {
        timeTrialSkill: 90,
        flatSkill: 82,
        enduranceSkill: 82,
        readinessScore: 70,
        suitabilityScore: 65,
        startFreshness: 72,
      }),
      input,
    )

    expect(stronger.components.skill).toBeGreaterThan(weaker.components.skill)
    expect(stronger.finishScore).toBeGreaterThan(weaker.finishScore)
    expect(stronger.officialTimeSeconds).toBeLessThan(
      weaker.officialTimeSeconds,
    )
  })

  it('increases the endurance influence as time-trial distance grows', () => {
    const shortInput = createIndividualTimeTrialInput(8)
    const longInput = createIndividualTimeTrialInput(55)
    const shortResult = runRaceEngine(shortInput)
    const longResult = runRaceEngine(longInput)
    const shortBase = shortResult.finishResolution.riderContexts[0]
    const longBase = longResult.finishResolution.riderContexts[0]

    const shortWeak = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(shortBase, { enduranceSkill: 45 }),
      shortInput,
    )
    const shortStrong = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(shortBase, { enduranceSkill: 90 }),
      shortInput,
    )
    const longWeak = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(longBase, { enduranceSkill: 45 }),
      longInput,
    )
    const longStrong = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(longBase, { enduranceSkill: 90 }),
      longInput,
    )

    const shortAdvantage =
      shortWeak.officialTimeSeconds - shortStrong.officialTimeSeconds
    const longAdvantage =
      longWeak.officialTimeSeconds - longStrong.officialTimeSeconds

    expect(longAdvantage).toBeGreaterThan(shortAdvantage)
    expect(
      calculateUniversalIndividualTimeTrialBaseSeconds(longInput.stage),
    ).toBeGreaterThan(
      calculateUniversalIndividualTimeTrialBaseSeconds(shortInput.stage),
    )
  })

  it('uses readiness, freshness and the normalized preparation-equipment channel', () => {
    const input = createIndividualTimeTrialInput()
    const result = runRaceEngine(input)
    const base = result.finishResolution.riderContexts[0]
    const tired = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, {
        readinessScore: 45,
        startFreshness: 48,
        preparation: {
          ...base.preparation,
          inStageEnergyCostMultiplier: 1.08,
        },
      }),
      input,
    )
    const prepared = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, {
        readinessScore: 88,
        startFreshness: 90,
        preparation: {
          ...base.preparation,
          inStageEnergyCostMultiplier: 0.92,
        },
      }),
      input,
    )

    expect(prepared.components.readiness).toBeGreaterThan(
      tired.components.readiness,
    )
    expect(prepared.components.energy).toBeGreaterThan(tired.components.energy)
    expect(prepared.components.equipment).toBeGreaterThan(
      tired.components.equipment,
    )
    expect(prepared.officialTimeSeconds).toBeLessThan(
      tired.officialTimeSeconds,
    )
  })

  it('applies weather deterministically and lets resistance mitigate part of it', () => {
    const clearInput = createIndividualTimeTrialInput()
    const harshInput: UniversalRaceEngineInput = {
      ...clearInput,
      weather: {
        ...clearInput.weather!,
        condition: 'heavy_rain',
        temperatureC: 8,
        windKmh: 42,
        precipitationMm: 9,
        rainProbabilityPct: 95,
      },
    }
    const result = runRaceEngine(clearInput)
    const base = result.finishResolution.riderContexts[0]
    const clear = scoreUniversalIndividualTimeTrialRider(base, clearInput)
    const harshLowResistance = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, { resistanceSkill: 35 }),
      harshInput,
    )
    const harshHighResistance = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, { resistanceSkill: 90 }),
      harshInput,
    )

    expect(harshLowResistance.weatherPenaltySeconds).toBeGreaterThan(0)
    expect(harshLowResistance.officialTimeSeconds).toBeGreaterThan(
      clear.officialTimeSeconds,
    )
    expect(harshHighResistance.weatherPenaltySeconds).toBeLessThan(
      harshLowResistance.weatherPenaltySeconds,
    )
  })

  it('uses the saved finish command as a deterministic pacing command', () => {
    const input = createIndividualTimeTrialInput()
    const result = runRaceEngine(input)
    const base = result.finishResolution.riderContexts[0]
    const conservative = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, {
        phase4Command: 'conserve_energy',
      }),
      input,
    )
    const timeFocused = scoreUniversalIndividualTimeTrialRider(
      cloneIndividualTimeTrialContext(base, {
        phase4Command: 'ride_for_time_gc',
      }),
      input,
    )

    expect(conservative.components.pacing).toBe(-1.5)
    expect(timeFocused.components.pacing).toBe(3)
    expect(timeFocused.officialTimeSeconds).toBeLessThan(
      conservative.officialTimeSeconds,
    )
  })

  it('keeps the seeded variation small and deterministic', () => {
    const input = createIndividualTimeTrialInput()
    const result = runRaceEngine(input)
    const context = result.finishResolution.riderContexts[0]
    const first = scoreUniversalIndividualTimeTrialRider(context, input)
    const second = scoreUniversalIndividualTimeTrialRider(context, input)

    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(0.75)
  })
})


describe('Phase 6 prologue finish resolution', () => {
  function createPrologueInput(
    distanceKm = 6,
  ): UniversalRaceEngineInput {
    const formatted = withStageFormat(createExpandedFieldInput(26), {
      stageFormat: 'prologue',
      terrainType: 'prologue',
      finishType: 'prologue_finish',
      profileType: 'prologue',
    })
    const input = withTimeTrialRules(formatted, null)

    return {
      ...input,
      stage: {
        ...input.stage,
        distanceKm,
        elevationGainM: Math.round(distanceKm * 5),
        summitFinish: false,
        terrainPercentages: {
          flat: 85,
          hilly: 15,
          mountain: 0,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 20 },
          { km: distanceKm * 0.5, elevationM: 50 },
          { km: distanceKm, elevationM: 28 },
        ],
      },
      points: [
        {
          pointId: 'prologue-start',
          stageId: input.stage.stageId,
          pointType: 'START',
          kmFromStart: 0,
          name: 'Start',
          komCategory: null,
          pointsScheme: [],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 0,
          metadata: {},
        },
        {
          pointId: 'prologue-finish',
          stageId: input.stage.stageId,
          pointType: 'FINISH',
          kmFromStart: distanceKm,
          name: 'Finish',
          komCategory: null,
          pointsScheme: [50, 35, 30],
          timeBonusSeconds: [],
          isFinishPoint: true,
          sortOrder: 1,
          metadata: {},
        },
      ],
    }
  }

  function clonePrologueContext(
    context: UniversalFinishRiderContext,
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext {
    return { ...context, ...overrides }
  }

  it('returns one complete deterministic prologue classification with independent rider times', () => {
    const input = createPrologueInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('prologue')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_prologue_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.teamTimes).toEqual([])
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(
      finishers.every(
        (row, index) =>
          index === 0 ||
          row.officialTimeSeconds! >=
            finishers[index - 1].officialTimeSeconds!,
      ),
    ).toBe(true)
    const winnerTime = finishers[0].officialTimeSeconds!
    expect(
      finishers.every(
        (row) => row.gapSeconds === row.officialTimeSeconds! - winnerTime,
      ),
    ).toBe(true)
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves the accepted Phase 5 timing result while publishing Phase 6 prologue times', () => {
    const result = runRaceEngine(createPrologueInput())
    const phase5Before = JSON.stringify(result.groupAndTimeResolution)

    expect(result.finishResolution.complete).toBe(true)
    expect(JSON.stringify(result.groupAndTimeResolution)).toBe(phase5Before)
    expect(result.groupAndTimeResolution.modelVersion).toBe(
      'universal_phase_5_lineage_groups_and_times_v2',
    )
  })

  it('gives sharpness more influence and endurance less influence than an equally short ITT', () => {
    const prologueInput = createPrologueInput(6)
    const ittInput: UniversalRaceEngineInput = {
      ...prologueInput,
      stage: {
        ...prologueInput.stage,
        stageFormat: 'individual_time_trial',
        terrainType: 'individual_time_trial',
        finishType: 'time_trial_finish',
        profileType: 'time_trial',
      },
    }
    const prologueResult = runRaceEngine(prologueInput)
    const ittResult = runRaceEngine(ittInput)
    const prologueBase = prologueResult.finishResolution.riderContexts[0]
    const ittBase = ittResult.finishResolution.riderContexts[0]

    const prologueLowSharpness = scoreUniversalPrologueRider(
      clonePrologueContext(prologueBase, { raceSharpness: 40 }),
      prologueInput,
    )
    const prologueHighSharpness = scoreUniversalPrologueRider(
      clonePrologueContext(prologueBase, { raceSharpness: 90 }),
      prologueInput,
    )
    const ittLowSharpness = scoreUniversalIndividualTimeTrialRider(
      clonePrologueContext(ittBase, { raceSharpness: 40 }),
      ittInput,
    )
    const ittHighSharpness = scoreUniversalIndividualTimeTrialRider(
      clonePrologueContext(ittBase, { raceSharpness: 90 }),
      ittInput,
    )
    const prologueWeakEndurance = scoreUniversalPrologueRider(
      clonePrologueContext(prologueBase, { enduranceSkill: 40 }),
      prologueInput,
    )
    const prologueStrongEndurance = scoreUniversalPrologueRider(
      clonePrologueContext(prologueBase, { enduranceSkill: 90 }),
      prologueInput,
    )
    const ittWeakEndurance = scoreUniversalIndividualTimeTrialRider(
      clonePrologueContext(ittBase, { enduranceSkill: 40 }),
      ittInput,
    )
    const ittStrongEndurance = scoreUniversalIndividualTimeTrialRider(
      clonePrologueContext(ittBase, { enduranceSkill: 90 }),
      ittInput,
    )

    expect(
      prologueHighSharpness.components.sharpness -
        prologueLowSharpness.components.sharpness,
    ).toBeGreaterThan(
      ittHighSharpness.components.sharpness -
        ittLowSharpness.components.sharpness,
    )
    expect(
      prologueStrongEndurance.components.skill -
        prologueWeakEndurance.components.skill,
    ).toBeLessThan(
      ittStrongEndurance.components.skill -
        ittWeakEndurance.components.skill,
    )
  })

  it('rewards short-distance sprint and flat specialization without replacing time-trial skill', () => {
    const input = createPrologueInput(5)
    const result = runRaceEngine(input)
    const base = result.finishResolution.riderContexts[0]
    const lessExplosive = scoreUniversalPrologueRider(
      clonePrologueContext(base, {
        timeTrialSkill: 78,
        sprintSkill: 45,
        flatSkill: 50,
        raceSharpness: 75,
      }),
      input,
    )
    const moreExplosive = scoreUniversalPrologueRider(
      clonePrologueContext(base, {
        timeTrialSkill: 78,
        sprintSkill: 90,
        flatSkill: 88,
        raceSharpness: 75,
      }),
      input,
    )
    const weakTimeTrial = scoreUniversalPrologueRider(
      clonePrologueContext(base, {
        timeTrialSkill: 45,
        sprintSkill: 90,
        flatSkill: 88,
        raceSharpness: 75,
      }),
      input,
    )

    expect(moreExplosive.components.skill).toBeGreaterThan(
      lessExplosive.components.skill,
    )
    expect(moreExplosive.officialTimeSeconds).toBeLessThan(
      lessExplosive.officialTimeSeconds,
    )
    expect(moreExplosive.finishScore).toBeGreaterThan(
      weakTimeTrial.finishScore,
    )
  })

  it('reuses deterministic ITT weather, preparation and pacing channels', () => {
    const clearInput = createPrologueInput()
    const harshInput: UniversalRaceEngineInput = {
      ...clearInput,
      weather: {
        ...clearInput.weather!,
        condition: 'heavy_rain',
        temperatureC: 7,
        windKmh: 40,
        precipitationMm: 8,
        rainProbabilityPct: 95,
      },
    }
    const result = runRaceEngine(clearInput)
    const base = result.finishResolution.riderContexts[0]
    const conservative = scoreUniversalPrologueRider(
      clonePrologueContext(base, {
        phase4Command: 'conserve_energy',
        preparation: {
          ...base.preparation,
          inStageEnergyCostMultiplier: 1.08,
        },
      }),
      clearInput,
    )
    const prepared = scoreUniversalPrologueRider(
      clonePrologueContext(base, {
        phase4Command: 'ride_for_time_gc',
        preparation: {
          ...base.preparation,
          inStageEnergyCostMultiplier: 0.92,
        },
      }),
      clearInput,
    )
    const harsh = scoreUniversalPrologueRider(base, harshInput)
    const clear = scoreUniversalPrologueRider(base, clearInput)

    expect(prepared.components.pacing).toBeGreaterThan(
      conservative.components.pacing,
    )
    expect(prepared.components.equipment).toBeGreaterThan(
      conservative.components.equipment,
    )
    expect(prepared.officialTimeSeconds).toBeLessThan(
      conservative.officialTimeSeconds,
    )
    expect(harsh.weatherPenaltySeconds).toBeGreaterThan(0)
    expect(harsh.officialTimeSeconds).toBeGreaterThan(
      clear.officialTimeSeconds,
    )
  })

  it('uses the ITT route-time base and keeps variation small and deterministic', () => {
    const input = createPrologueInput()
    const result = runRaceEngine(input)
    const context = result.finishResolution.riderContexts[0]
    const first = scoreUniversalPrologueRider(context, input)
    const second = scoreUniversalPrologueRider(context, input)

    expect(calculateUniversalPrologueBaseSeconds(input.stage)).toBe(
      calculateUniversalIndividualTimeTrialBaseSeconds(input.stage),
    )
    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(0.75)
  })
})



describe('Phase 6 team time trial finish resolution', () => {
  function createTeamTimeTrialInput(
    distanceKm = 36,
    countingRiderNumber = 4,
  ): UniversalRaceEngineInput {
    const formatted = withStageFormat(createExpandedFieldInput(24), {
      stageFormat: 'team_time_trial',
      terrainType: 'team_time_trial',
      finishType: 'team_time_trial_finish',
      profileType: 'time_trial',
    })
    const input = withTimeTrialRules(formatted, countingRiderNumber)

    return {
      ...input,
      stage: {
        ...input.stage,
        distanceKm,
        elevationGainM: Math.round(distanceKm * 7),
        summitFinish: false,
        terrainPercentages: {
          flat: 75,
          hilly: 20,
          mountain: 5,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 30 },
          { km: distanceKm * 0.5, elevationM: 145 },
          { km: distanceKm, elevationM: 65 },
        ],
      },
      points: [
        {
          pointId: 'ttt-start',
          stageId: input.stage.stageId,
          pointType: 'START',
          kmFromStart: 0,
          name: 'Start',
          komCategory: null,
          pointsScheme: [],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 0,
          metadata: {},
        },
        {
          pointId: 'ttt-finish',
          stageId: input.stage.stageId,
          pointType: 'FINISH',
          kmFromStart: distanceKm,
          name: 'Finish',
          komCategory: null,
          pointsScheme: [50, 35, 30],
          timeBonusSeconds: [],
          isFinishPoint: true,
          sortOrder: 1,
          metadata: {},
        },
      ],
    }
  }

  function cloneTeamContexts(
    contexts: readonly UniversalFinishRiderContext[],
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext[] {
    return contexts.map((context) => ({ ...context, ...overrides }))
  }

  it('returns one complete deterministic team classification using the configured counting rider', () => {
    const input = createTeamTimeTrialInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('team_time_trial')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_team_time_trial_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.teamTimes).toHaveLength(input.teams.length)
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(
      first.finishResolution.teamTimes.every(
        (team) =>
          team.countingRiderNumber === 4 &&
          team.countingRiderIds.length === 4 &&
          team.selectedRiderIds.length === 6 &&
          team.countingRiderId === team.countingRiderIds[3],
      ),
    ).toBe(true)
    for (const teamTime of first.finishResolution.teamTimes) {
      const riderTimes = finishers
        .filter((row) => row.teamId === teamTime.teamId)
        .map((row) => row.officialTimeSeconds)
      expect(new Set(riderTimes)).toEqual(
        new Set([teamTime.officialTimeSeconds]),
      )
    }
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves the accepted Phase 5 team timing output', () => {
    const result = runRaceEngine(createTeamTimeTrialInput())
    const phase5Snapshot = JSON.stringify(result.groupAndTimeResolution)

    expect(result.finishResolution.complete).toBe(true)
    expect(JSON.stringify(result.groupAndTimeResolution)).toBe(
      phase5Snapshot,
    )
    expect(result.groupAndTimeResolution.modelVersion).toBe(
      'universal_phase_5_lineage_groups_and_times_v2',
    )
    expect(
      result.groupAndTimeResolution.finalGroups.every(
        (group) =>
          new Set(
            result.groupAndTimeResolution.officialResults
              .filter((row) => group.riderIds.includes(row.riderId))
              .map((row) => row.officialTimeSeconds),
          ).size === 1,
      ),
    ).toBe(true)
  })

  it('uses strongest riders, team average and the weakest counting rider', () => {
    const input = createTeamTimeTrialInput()
    const result = runRaceEngine(input)
    const teamContexts = result.finishResolution.riderContexts
      .filter((context) => context.teamId === input.teams[0].teamId)
      .slice(0, 4)
    const base = scoreUniversalTeamTimeTrialTeam(teamContexts, input, 4)
    const stronger = scoreUniversalTeamTimeTrialTeam(
      teamContexts.map((context) => ({
        ...context,
        timeTrialSkill: Math.min(100, context.timeTrialSkill + 15),
        suitabilityScore: Math.min(100, context.suitabilityScore + 10),
      })),
      input,
      4,
    )
    const weakerCountingRider = scoreUniversalTeamTimeTrialTeam(
      teamContexts.map((context, index) =>
        index === 3
          ? {
              ...context,
              timeTrialSkill: Math.max(0, context.timeTrialSkill - 35),
              enduranceSkill: Math.max(0, context.enduranceSkill - 25),
            }
          : context,
      ),
      input,
      4,
    )

    expect(stronger.components.strongestRiders).toBeGreaterThan(
      base.components.strongestRiders,
    )
    expect(stronger.components.teamAverage).toBeGreaterThan(
      base.components.teamAverage,
    )
    expect(stronger.officialTimeSeconds).toBeLessThan(
      base.officialTimeSeconds,
    )
    expect(weakerCountingRider.components.weakestCountingRider).toBeLessThan(
      base.components.weakestCountingRider,
    )
    expect(weakerCountingRider.officialTimeSeconds).toBeGreaterThan(
      base.officialTimeSeconds,
    )
  })

  it('rewards cooperation and penalizes fatigue deterministically', () => {
    const input = createTeamTimeTrialInput()
    const result = runRaceEngine(input)
    const teamContexts = result.finishResolution.riderContexts
      .filter((context) => context.teamId === input.teams[0].teamId)
      .slice(0, 4)
    const poorCooperation = scoreUniversalTeamTimeTrialTeam(
      cloneTeamContexts(teamContexts, {
        teamworkSkill: 35,
        fatigueBeforeStage: 35,
      }),
      input,
      4,
    )
    const strongCooperation = scoreUniversalTeamTimeTrialTeam(
      cloneTeamContexts(teamContexts, {
        teamworkSkill: 90,
        fatigueBeforeStage: 5,
      }),
      input,
      4,
    )

    expect(strongCooperation.components.cooperation).toBeGreaterThan(
      poorCooperation.components.cooperation,
    )
    expect(strongCooperation.components.fatigue).toBeGreaterThan(
      poorCooperation.components.fatigue,
    )
    expect(strongCooperation.officialTimeSeconds).toBeLessThan(
      poorCooperation.officialTimeSeconds,
    )
  })

  it('uses preparation, weather and pacing without changing the selected lineup contract', () => {
    const clearInput = createTeamTimeTrialInput()
    const harshInput: UniversalRaceEngineInput = {
      ...clearInput,
      weather: {
        ...clearInput.weather!,
        condition: 'heavy_rain',
        temperatureC: 6,
        windKmh: 42,
        precipitationMm: 9,
        rainProbabilityPct: 95,
      },
    }
    const result = runRaceEngine(clearInput)
    const teamContexts = result.finishResolution.riderContexts
      .filter((context) => context.teamId === clearInput.teams[0].teamId)
      .slice(0, 4)
    const conservative = scoreUniversalTeamTimeTrialTeam(
      teamContexts.map((context) => ({
        ...context,
        phase4Command: 'conserve_energy' as const,
        preparation: {
          ...context.preparation,
          inStageEnergyCostMultiplier: 1.08,
        },
      })),
      clearInput,
      4,
    )
    const prepared = scoreUniversalTeamTimeTrialTeam(
      teamContexts.map((context) => ({
        ...context,
        phase4Command: 'ride_for_time_gc' as const,
        preparation: {
          ...context.preparation,
          inStageEnergyCostMultiplier: 0.92,
        },
      })),
      clearInput,
      4,
    )
    const harsh = scoreUniversalTeamTimeTrialTeam(
      teamContexts,
      harshInput,
      4,
    )
    const clear = scoreUniversalTeamTimeTrialTeam(
      teamContexts,
      clearInput,
      4,
    )

    expect(prepared.components.pacing).toBeGreaterThan(
      conservative.components.pacing,
    )
    expect(prepared.components.equipment).toBeGreaterThan(
      conservative.components.equipment,
    )
    expect(prepared.officialTimeSeconds).toBeLessThan(
      conservative.officialTimeSeconds,
    )
    expect(harsh.components.weather).toBeLessThan(
      clear.components.weather,
    )
    expect(harsh.officialTimeSeconds).toBeGreaterThan(
      clear.officialTimeSeconds,
    )
    expect(prepared.countingRiderIds).toHaveLength(4)
  })

  it('keeps team-level variation small and deterministic', () => {
    const input = createTeamTimeTrialInput()
    const result = runRaceEngine(input)
    const teamContexts = result.finishResolution.riderContexts
      .filter((context) => context.teamId === input.teams[0].teamId)
    const first = scoreUniversalTeamTimeTrialTeam(
      teamContexts,
      input,
      4,
    )
    const second = scoreUniversalTeamTimeTrialTeam(
      teamContexts,
      input,
      4,
    )

    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(0.5)
  })
})



describe('Phase 6 pair time trial finish resolution', () => {
  function createPairTimeTrialInput(
    distanceKm = 24,
  ): UniversalRaceEngineInput {
    const formatted = withStageFormat(createValidInput(), {
      stageFormat: 'pair_time_trial',
      terrainType: 'team_time_trial',
      finishType: 'team_time_trial_finish',
      profileType: 'time_trial',
    })
    const input = withTimeTrialRules(formatted, 2)

    return {
      ...input,
      stage: {
        ...input.stage,
        distanceKm,
        elevationGainM: Math.round(distanceKm * 6),
        summitFinish: false,
        terrainPercentages: {
          flat: 78,
          hilly: 18,
          mountain: 4,
          cobbled: 0,
        },
        profilePoints: [
          { km: 0, elevationM: 20 },
          { km: distanceKm * 0.5, elevationM: 105 },
          { km: distanceKm, elevationM: 40 },
        ],
      },
      points: [
        {
          pointId: 'pair-start',
          stageId: input.stage.stageId,
          pointType: 'START',
          kmFromStart: 0,
          name: 'Start',
          komCategory: null,
          pointsScheme: [],
          timeBonusSeconds: [],
          isFinishPoint: false,
          sortOrder: 0,
          metadata: {},
        },
        {
          pointId: 'pair-finish',
          stageId: input.stage.stageId,
          pointType: 'FINISH',
          kmFromStart: distanceKm,
          name: 'Finish',
          komCategory: null,
          pointsScheme: [50, 35, 30],
          timeBonusSeconds: [],
          isFinishPoint: true,
          sortOrder: 1,
          metadata: {},
        },
      ],
    }
  }

  function clonePairContexts(
    contexts: readonly UniversalFinishRiderContext[],
    overrides: Partial<UniversalFinishRiderContext>,
  ): UniversalFinishRiderContext[] {
    return contexts.map((context) => ({ ...context, ...overrides }))
  }

  it('returns one complete deterministic classification for every two-rider pair', () => {
    const input = createPairTimeTrialInput()
    const first = runRaceEngine(input)
    const second = runRaceEngine(input)
    const finishers = first.finishResolution.classification.filter(
      (row) => row.status === 'finished',
    )

    expect(first.finishResolution.finishMode).toBe('pair_time_trial')
    expect(first.finishResolution).toMatchObject({
      active: true,
      complete: true,
      deterministic: true,
      modelVersion: 'universal_pair_time_trial_finish_v1',
    })
    expect(first.finishResolution.winnerRiderId).toBeTruthy()
    expect(first.finishResolution.winnerTeamId).toBeTruthy()
    expect(first.finishResolution.teamTimes).toHaveLength(input.teams.length)
    expect(first.finishResolution.classification).toHaveLength(
      input.riders.length,
    )
    expect(finishers.map((row) => row.rank)).toEqual(
      Array.from({ length: finishers.length }, (_, index) => index + 1),
    )
    expect(
      first.finishResolution.teamTimes.every(
        (team) =>
          team.countingRiderNumber === 2 &&
          team.selectedRiderIds.length === 2 &&
          team.countingRiderIds.length === 2 &&
          team.countingRiderId === team.countingRiderIds[1],
      ),
    ).toBe(true)
    for (const teamTime of first.finishResolution.teamTimes) {
      const riderTimes = finishers
        .filter((row) => row.teamId === teamTime.teamId)
        .map((row) => row.officialTimeSeconds)
      expect(new Set(riderTimes)).toEqual(
        new Set([teamTime.officialTimeSeconds]),
      )
    }
    expect(first.finishResolution).toEqual(second.finishResolution)
  })

  it('preserves the accepted Phase 5 pair timing output', () => {
    const result = runRaceEngine(createPairTimeTrialInput())
    const phase5Snapshot = JSON.stringify(result.groupAndTimeResolution)

    expect(result.finishResolution.complete).toBe(true)
    expect(JSON.stringify(result.groupAndTimeResolution)).toBe(
      phase5Snapshot,
    )
    expect(result.groupAndTimeResolution.modelVersion).toBe(
      'universal_phase_5_lineage_groups_and_times_v2',
    )
    expect(
      result.groupAndTimeResolution.officialResults.every(
        (row) => row.timeSource === 'pair_time',
      ),
    ).toBe(true)
  })

  it('makes both riders matter and weights the weaker rider more strongly', () => {
    const input = createPairTimeTrialInput()
    const result = runRaceEngine(input)
    const pairContexts = result.finishResolution.riderContexts.filter(
      (context) => context.teamId === input.teams[0].teamId,
    )
    const base = scoreUniversalPairTimeTrialTeam(pairContexts, input)
    const strongerId = base.selectedRiderIds[0]
    const weakerId = base.selectedRiderIds[1]
    const weakerStrongRider = scoreUniversalPairTimeTrialTeam(
      pairContexts.map((context) =>
        context.riderId === strongerId
          ? {
              ...context,
              timeTrialSkill: Math.max(0, context.timeTrialSkill - 5),
              enduranceSkill: Math.max(0, context.enduranceSkill - 5),
            }
          : context,
      ),
      input,
    )
    const weakerWeakRider = scoreUniversalPairTimeTrialTeam(
      pairContexts.map((context) =>
        context.riderId === weakerId
          ? {
              ...context,
              timeTrialSkill: Math.max(0, context.timeTrialSkill - 5),
              enduranceSkill: Math.max(0, context.enduranceSkill - 5),
            }
          : context,
      ),
      input,
    )

    expect(weakerStrongRider.officialTimeSeconds).toBeGreaterThan(
      base.officialTimeSeconds,
    )
    expect(weakerWeakRider.officialTimeSeconds).toBeGreaterThan(
      base.officialTimeSeconds,
    )
    expect(
      weakerWeakRider.officialTimeSeconds - base.officialTimeSeconds,
    ).toBeGreaterThanOrEqual(
      weakerStrongRider.officialTimeSeconds - base.officialTimeSeconds,
    )
    expect(weakerWeakRider.components.weakestCountingRider).toBeLessThan(
      base.components.weakestCountingRider,
    )
  })

  it('rewards pair cooperation and penalizes fatigue', () => {
    const input = createPairTimeTrialInput()
    const result = runRaceEngine(input)
    const pairContexts = result.finishResolution.riderContexts.filter(
      (context) => context.teamId === input.teams[0].teamId,
    )
    const poorPair = scoreUniversalPairTimeTrialTeam(
      clonePairContexts(pairContexts, {
        teamworkSkill: 35,
        fatigueBeforeStage: 35,
      }),
      input,
    )
    const strongPair = scoreUniversalPairTimeTrialTeam(
      clonePairContexts(pairContexts, {
        teamworkSkill: 90,
        fatigueBeforeStage: 5,
      }),
      input,
    )

    expect(strongPair.components.cooperation).toBeGreaterThan(
      poorPair.components.cooperation,
    )
    expect(strongPair.components.fatigue).toBeGreaterThan(
      poorPair.components.fatigue,
    )
    expect(strongPair.officialTimeSeconds).toBeLessThan(
      poorPair.officialTimeSeconds,
    )
  })

  it('uses preparation, weather and pacing for both riders', () => {
    const clearInput = createPairTimeTrialInput()
    const harshInput: UniversalRaceEngineInput = {
      ...clearInput,
      weather: {
        ...clearInput.weather!,
        condition: 'heavy_rain',
        temperatureC: 6,
        windKmh: 42,
        precipitationMm: 9,
        rainProbabilityPct: 95,
      },
    }
    const result = runRaceEngine(clearInput)
    const pairContexts = result.finishResolution.riderContexts.filter(
      (context) => context.teamId === clearInput.teams[0].teamId,
    )
    const conservative = scoreUniversalPairTimeTrialTeam(
      pairContexts.map((context) => ({
        ...context,
        phase4Command: 'conserve_energy' as const,
        preparation: {
          ...context.preparation,
          inStageEnergyCostMultiplier: 1.08,
        },
      })),
      clearInput,
    )
    const prepared = scoreUniversalPairTimeTrialTeam(
      pairContexts.map((context) => ({
        ...context,
        phase4Command: 'ride_for_time_gc' as const,
        preparation: {
          ...context.preparation,
          inStageEnergyCostMultiplier: 0.92,
        },
      })),
      clearInput,
    )
    const harsh = scoreUniversalPairTimeTrialTeam(
      pairContexts,
      harshInput,
    )
    const clear = scoreUniversalPairTimeTrialTeam(
      pairContexts,
      clearInput,
    )

    expect(prepared.components.pacing).toBeGreaterThan(
      conservative.components.pacing,
    )
    expect(prepared.components.equipment).toBeGreaterThan(
      conservative.components.equipment,
    )
    expect(prepared.officialTimeSeconds).toBeLessThan(
      conservative.officialTimeSeconds,
    )
    expect(harsh.components.weather).toBeLessThan(
      clear.components.weather,
    )
    expect(harsh.officialTimeSeconds).toBeGreaterThan(
      clear.officialTimeSeconds,
    )
  })

  it('requires exactly two eligible riders and keeps variation small and deterministic', () => {
    const input = createPairTimeTrialInput()
    const result = runRaceEngine(input)
    const pairContexts = result.finishResolution.riderContexts.filter(
      (context) => context.teamId === input.teams[0].teamId,
    )
    const first = scoreUniversalPairTimeTrialTeam(pairContexts, input)
    const second = scoreUniversalPairTimeTrialTeam(pairContexts, input)

    expect(first).toEqual(second)
    expect(Math.abs(first.components.variation)).toBeLessThanOrEqual(0.4)
    expect(() =>
      scoreUniversalPairTimeTrialTeam(pairContexts.slice(0, 1), input),
    ).toThrow(/exactly two eligible riders/i)
  })
})


describe('Phase 6 cross-format completion and invariant audit', () => {
  function createAuditInput(
    finishMode:
      | 'solo_finish'
      | 'flat_sprint'
      | 'reduced_group_sprint'
      | 'hill_finish'
      | 'summit_finish'
      | 'cobbled_finish'
      | 'individual_time_trial'
      | 'prologue'
      | 'team_time_trial'
      | 'pair_time_trial',
  ): UniversalRaceEngineInput {
    switch (finishMode) {
      case 'solo_finish':
        return createSoloFinishInput()
      case 'flat_sprint':
        return createExpandedFieldInput(26)
      case 'reduced_group_sprint':
        return createValidInput()
      case 'hill_finish': {
        const input = createExpandedFieldInput(26)
        return {
          ...input,
          stage: {
            ...input.stage,
            terrainType: 'hilly',
            finishType: 'uphill_finish',
            profileType: 'hilly',
            terrainPercentages: {
              flat: 35,
              hilly: 55,
              mountain: 10,
              cobbled: 0,
            },
          },
        }
      }
      case 'summit_finish': {
        const input = createExpandedFieldInput(26)
        return {
          ...input,
          stage: {
            ...input.stage,
            terrainType: 'mountain',
            finishType: 'summit_finish',
            profileType: 'mountain',
            summitFinish: true,
            terrainPercentages: {
              flat: 20,
              hilly: 25,
              mountain: 55,
              cobbled: 0,
            },
          },
        }
      }
      case 'cobbled_finish': {
        const input = createExpandedFieldInput(26)
        return {
          ...input,
          stage: {
            ...input.stage,
            terrainType: 'cobbled',
            finishType: 'cobbled_finish',
            profileType: 'cobbled',
            terrainPercentages: {
              flat: 55,
              hilly: 15,
              mountain: 0,
              cobbled: 30,
            },
          },
        }
      }
      case 'individual_time_trial':
        return withTimeTrialRules(
          withStageFormat(createValidInput(), {
            stageFormat: 'individual_time_trial',
            terrainType: 'individual_time_trial',
            finishType: 'time_trial_finish',
            profileType: 'time_trial',
          }),
          null,
        )
      case 'prologue':
        return withTimeTrialRules(
          withStageFormat(createValidInput(), {
            stageFormat: 'prologue',
            terrainType: 'prologue',
            finishType: 'prologue_finish',
            profileType: 'prologue',
          }),
          null,
        )
      case 'team_time_trial':
        return withTimeTrialRules(
          withStageFormat(createValidInput(), {
            stageFormat: 'team_time_trial',
            terrainType: 'team_time_trial',
            finishType: 'team_time_trial_finish',
            profileType: 'time_trial',
          }),
          2,
        )
      case 'pair_time_trial':
        return withTimeTrialRules(
          withStageFormat(createValidInput(), {
            stageFormat: 'pair_time_trial',
            terrainType: 'team_time_trial',
            finishType: 'team_time_trial_finish',
            profileType: 'time_trial',
          }),
          2,
        )
    }
  }

  const scenarios = [
    'solo_finish',
    'flat_sprint',
    'reduced_group_sprint',
    'hill_finish',
    'summit_finish',
    'cobbled_finish',
    'individual_time_trial',
    'prologue',
    'team_time_trial',
    'pair_time_trial',
  ] as const

  it.each(scenarios)(
    'returns a complete valid deterministic %s result',
    (expectedMode) => {
      const input = createAuditInput(expectedMode)
      const first = runRaceEngine(input)
      const second = runRaceEngine(input)
      const resolution = first.finishResolution
      const finishers = resolution.classification.filter(
        (row) => row.status === 'finished',
      )
      const winnerTime = finishers[0].officialTimeSeconds!

      expect(resolution.finishMode).toBe(expectedMode)
      expect(resolution.complete).toBe(true)
      expect(resolution.modelVersion).not.toBe(
        'universal_finish_resolution_foundation_v1',
      )
      expect(resolution.winnerRiderId).toBeTruthy()
      expect(resolution.winnerTeamId).toBeTruthy()
      expect(resolution.classification).toHaveLength(input.riders.length)
      expect(new Set(resolution.classification.map((row) => row.riderId)).size)
        .toBe(input.riders.length)
      expect(finishers.map((row) => row.rank)).toEqual(
        Array.from({ length: finishers.length }, (_, index) => index + 1),
      )
      expect(
        finishers.every(
          (row, index) =>
            row.officialTimeSeconds != null &&
            row.officialTimeSeconds >= winnerTime &&
            row.gapSeconds ===
              Math.round(
                (row.officialTimeSeconds - winnerTime) * 1_000_000,
              ) / 1_000_000 &&
            (index === 0 ||
              row.officialTimeSeconds >=
                finishers[index - 1].officialTimeSeconds!),
        ),
      ).toBe(true)
      expect(() =>
        assertUniversalFinishResolutionComplete(input, resolution),
      ).not.toThrow()
      expect(first.finishResolution).toEqual(second.finishResolution)
      expect({
        ...first,
        finishResolution: undefined,
      }).toEqual({
        ...second,
        finishResolution: undefined,
      })
    },
  )

  it('preserves Phase 5 physical groups and times for every road finish mode', () => {
    for (const mode of [
      'solo_finish',
      'flat_sprint',
      'reduced_group_sprint',
      'hill_finish',
      'summit_finish',
      'cobbled_finish',
    ] as const) {
      const result = runRaceEngine(createAuditInput(mode))
      const contextByRider = new Map(
        result.finishResolution.riderContexts.map((context) => [
          context.riderId,
          context,
        ]),
      )

      for (const row of result.finishResolution.classification.filter(
        (candidate) => candidate.status === 'finished',
      )) {
        const context = contextByRider.get(row.riderId)!
        expect(row.physicalGroupCode).toBe(context.physicalGroupCode)
        expect(row.physicalGroupOrder).toBe(context.physicalGroupOrder)
        expect(row.officialTimeSeconds).toBe(
          context.phase5OfficialTimeSeconds,
        )
      }
    }
  })

  it('publishes team times only for TTT formats and keeps them complete', () => {
    for (const mode of scenarios) {
      const result = runRaceEngine(createAuditInput(mode))
      const teamFormat =
        mode === 'team_time_trial' || mode === 'pair_time_trial'

      if (!teamFormat) {
        expect(result.finishResolution.teamTimes).toEqual([])
        continue
      }

      const teamTimes = result.finishResolution.teamTimes
      expect(teamTimes.map((row) => row.rank)).toEqual(
        Array.from({ length: teamTimes.length }, (_, index) => index + 1),
      )
      expect(teamTimes[0].teamId).toBe(
        result.finishResolution.winnerTeamId,
      )
      expect(teamTimes[0].countingRiderId).toBe(
        result.finishResolution.winnerRiderId,
      )
      expect(
        teamTimes.every(
          (row) =>
            row.gapSeconds ===
            Math.round(
              (row.officialTimeSeconds -
                teamTimes[0].officialTimeSeconds) *
                1_000_000,
            ) / 1_000_000,
        ),
      ).toBe(true)
    }
  })

  it('has no inactive finish mode in the final dispatcher', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )
    const resolverStart = source.indexOf(
      'export function resolveUniversalFinishResolution',
    )
    const resolverEnd = source.indexOf(
      'export function runRaceEngine',
      resolverStart,
    )
    const resolverSource = source.slice(resolverStart, resolverEnd)

    expect(resolverSource).toContain("case 'solo_finish':")
    expect(resolverSource).toContain(
      'assertUniversalFinishResolutionComplete(sources.input, resolution)',
    )
    expect(resolverSource).not.toContain('return foundation')
  })
})



describe('Phase 7 replay timeline foundation — Task 7.1', () => {
  it('calculates the complete road replay before playback with five base checkpoints', () => {
    const timeline = runRaceEngine(createValidInput()).replayTimeline

    expect(timeline.active).toBe(true)
    expect(timeline.inactiveReason).toBeNull()
    expect(timeline.completeBeforePlayback).toBe(true)
    expect(timeline.playbackRecalculatesRace).toBe(false)
    const baseCheckpoints = timeline.checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'base',
    )

    expect(timeline.baseCheckpointCount).toBe(5)
    expect(timeline.eventCheckpointCount).toBeGreaterThan(0)
    expect(baseCheckpoints).toHaveLength(5)
    expect(baseCheckpoints.map((checkpoint) => checkpoint.phase)).toEqual([
      0,
      1,
      2,
      3,
      4,
    ])
    expect(
      baseCheckpoints.map(
        (checkpoint) => checkpoint.raceProgress.fraction,
      ),
    ).toEqual([0, 0.25, 0.5, 0.7, 1])
  })

  it('stores every required checkpoint-contract field for every base checkpoint', () => {
    const input = createValidInput()
    const timeline = runRaceEngine(input).replayTimeline

    timeline.checkpoints.forEach((checkpoint, index) => {
      expect(checkpoint.checkpointIndex).toBe(index)
      expect(['base', 'event']).toContain(checkpoint.checkpointKind)
      expect(Array.isArray(checkpoint.groups)).toBe(true)
      expect(Array.isArray(checkpoint.gaps)).toBe(true)
      expect(Array.isArray(checkpoint.riderStates)).toBe(true)
      expect(Array.isArray(checkpoint.teamStates)).toBe(true)
      expect(Array.isArray(checkpoint.activeCommands)).toBe(true)
      expect(Array.isArray(checkpoint.intermediateResults)).toBe(true)
      expect(Array.isArray(checkpoint.incidents)).toBe(true)
      expect(Array.isArray(checkpoint.commentary)).toBe(true)
      expect(checkpoint.riderStates).toHaveLength(input.riders.length)
      expect(new Set(checkpoint.riderStates.map((row) => row.riderId)).size).toBe(
        input.riders.length,
      )
      expect(checkpoint.commentary.length).toBeGreaterThan(0)
    })
  })

  it('keeps results hidden until the final replay checkpoint', () => {
    const timeline = runRaceEngine(createValidInput()).replayTimeline
    const finalCheckpoint = timeline.checkpoints.find(
      (checkpoint) => checkpoint.checkpointId === timeline.finalCheckpointId,
    )!

    expect(
      timeline.checkpoints.slice(0, -1).every(
        (checkpoint) => checkpoint.finalResultsVisible === false,
      ),
    ).toBe(true)
    expect(finalCheckpoint.finalResultsVisible).toBe(true)
    expect(timeline.finalCheckpointId).toBe(finalCheckpoint.checkpointId)
    expect(timeline.resultsVisibleFromCheckpointId).toBe(
      finalCheckpoint.checkpointId,
    )
  })

  it('makes the finish checkpoint exactly match final groups, gaps and classification', () => {
    const result = runRaceEngine(createExpandedFieldInput(26))
    const finalCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.checkpointId === result.replayTimeline.finalCheckpointId,
    )!

    expect(
      finalCheckpoint.groups.map((group) => ({
        groupCode: group.groupCode,
        displayCode: group.displayCode,
        riderIds: group.riderIds,
      })),
    ).toEqual(
      result.groupAndTimeResolution.finalGroups.map((group) => ({
        groupCode: group.groupCode,
        displayCode: group.displayCode,
        riderIds: group.riderIds,
      })),
    )
    expect(finalCheckpoint.gaps).toEqual(
      result.groupAndTimeResolution.finalGroups.map((group) => ({
        groupCode: group.groupCode,
        displayCode: group.displayCode,
        gapSeconds: group.gapSeconds,
        officialTimeSeconds: group.officialTimeSeconds,
      })),
    )

    const replayRiderById = new Map(
      finalCheckpoint.riderStates.map((row) => [row.riderId, row] as const),
    )
    result.finishResolution.classification.forEach((official) => {
      const replay = replayRiderById.get(official.riderId)

      expect(replay).toBeDefined()
      expect(replay?.status).toBe(official.status)
      expect(replay?.finishRank).toBe(official.rank)
      expect(replay?.officialTimeSeconds).toBe(official.officialTimeSeconds)
      expect(replay?.gapSeconds).toBe(official.gapSeconds)
    })
  })

  it('stores the already-resolved active command for each rider in each road phase', () => {
    const result = runRaceEngine(createValidInput())

    for (const checkpoint of result.replayTimeline.checkpoints) {
      if (checkpoint.phase === 0) {
        expect(checkpoint.activeCommands).toEqual([])
        continue
      }

      expect(checkpoint.activeCommands).toHaveLength(
        result.riderReadiness.filter((row) => row.eligibleToStart).length,
      )
      checkpoint.activeCommands.forEach((command) => {
        expect(command.phaseNumber).toBe(checkpoint.phase)
        const resolved = result.roadCommandResolution.riders
          .find((row) => row.riderId === command.riderId)
          ?.phases.find((phase) => phase.phaseNumber === checkpoint.phase)

        expect(resolved).toBeDefined()
        expect(command.resolvedCommand).toBe(resolved?.resolvedCommand)
        expect(command.resolvedSource).toBe(resolved?.resolvedSource)
        expect(command.behaviour).toBe(resolved?.behaviour)
      })
    }
  })

  it('carries calculated intermediate results cumulatively into reached base checkpoints', () => {
    const result = runRaceEngine(createValidInput())
    const checkpoints = result.replayTimeline.checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'base',
    )

    expect(
      checkpoints.map((checkpoint) =>
        checkpoint.intermediateResults.map((event) => event.pointId),
      ),
    ).toEqual([
      [],
      [],
      ['point-sprint'],
      ['point-sprint'],
      ['point-sprint', 'point-kom'],
    ])
  })

  it('returns an identical complete replay timeline for identical inputs', () => {
    const input = createExpandedFieldInput(26)

    expect(runRaceEngine(input).replayTimeline).toEqual(
      runRaceEngine(input).replayTimeline,
    )
  })

  it('keeps the road replay complete while cross-format timelines use the same contract', () => {
    const roadTimeline = runRaceEngine(createValidInput()).replayTimeline

    expect(roadTimeline.active).toBe(true)
    expect(roadTimeline.baseCheckpointCount).toBe(5)
    expect(roadTimeline.finalCheckpointId).not.toBeNull()
  })

  it('keeps replay generation inside the one authoritative universal engine file', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./runRaceEngine.ts', import.meta.url)),
      'utf8',
    )

    expect(source).toContain('buildUniversalReplayTimeline')
    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:replay|commentary)[^'"]*engine[^'"]*['"]/i,
    )
  })
})


describe('Phase 7 calculated replay events — Task 7.2', () => {
  function withReplayPhaseCommand(
    input: UniversalRaceEngineInput,
    riderId: string,
    phase: 'phase1' | 'phase3' | 'phase4',
    command: (typeof ROAD_COMMAND_INPUTS)[number],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? {
                ...riderPlan,
                commands: {
                  ...riderPlan.commands,
                  [phase]: command,
                },
              }
            : riderPlan,
        ),
      })),
    }
  }

  function createReplayCatchInput(): UniversalRaceEngineInput {
    let input = createValidInput()
    input = withReplayPhaseCommand(input, 'rider-3', 'phase1', 'attack')
    input = withReplayPhaseCommand(input, 'rider-3', 'phase3', 'attack')
    input = withReplayPhaseCommand(
      input,
      'rider-3',
      'phase4',
      'ride_for_stage_result',
    )
    input = withReplayPhaseCommand(input, 'rider-2', 'phase4', 'chase')
    input = withReplayPhaseCommand(
      input,
      'rider-1',
      'phase4',
      'ride_for_stage_result',
    )
    input = withReplayPhaseCommand(
      input,
      'rider-4',
      'phase4',
      'work_for_team',
    )

    return {
      ...input,
      riders: input.riders.map((rider) => {
        if (rider.riderId === 'rider-3') {
          return {
            ...rider,
            flat: 100,
            sprint: 94,
            endurance: 100,
            resistance: 100,
            raceIQ: 100,
            teamwork: 100,
            morale: 100,
            startStamina: 100,
          }
        }
        if (rider.riderId === 'rider-2') {
          return {
            ...rider,
            sprint: 95,
            flat: 95,
            climbing: 90,
            endurance: 95,
            resistance: 95,
            raceIQ: 95,
            teamwork: 95,
            morale: 95,
            startStamina: 100,
          }
        }
        if (rider.riderId === 'rider-1') {
          return {
            ...rider,
            sprint: 94,
            flat: 94,
            climbing: 90,
            endurance: 94,
            resistance: 94,
            raceIQ: 94,
            teamwork: 90,
            morale: 94,
            startStamina: 100,
          }
        }
        if (rider.riderId === 'rider-4') {
          return {
            ...rider,
            sprint: 90,
            flat: 90,
            climbing: 88,
            endurance: 90,
            resistance: 90,
            raceIQ: 90,
            teamwork: 92,
            morale: 90,
            startStamina: 100,
          }
        }
        return rider
      }),
    }
  }

  it('inserts calculated event checkpoints in deterministic route order with contiguous indexes', () => {
    const timeline = runRaceEngine(createValidInput()).replayTimeline
    const eventCheckpoints = timeline.checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'event',
    )

    expect(timeline.eventCheckpointCount).toBe(eventCheckpoints.length)
    expect(eventCheckpoints.length).toBeGreaterThan(0)
    expect(
      timeline.checkpoints.map((checkpoint) => checkpoint.checkpointIndex),
    ).toEqual(timeline.checkpoints.map((_, index) => index))
    expect(
      new Set(
        timeline.checkpoints.map((checkpoint) => checkpoint.checkpointId),
      ).size,
    ).toBe(timeline.checkpoints.length)

    timeline.checkpoints.forEach((checkpoint, index, checkpoints) => {
      if (index === 0) return
      expect(checkpoint.raceProgress.kmFromStart).toBeGreaterThanOrEqual(
        checkpoints[index - 1].raceProgress.kmFromStart,
      )
    })

    const expectedStarterIds = timeline.checkpoints[0].groups
      .flatMap((group) => group.riderIds)
      .slice()
      .sort()

    eventCheckpoints.forEach((checkpoint) => {
      expect(checkpoint.finalResultsVisible).toBe(false)
      expect(
        checkpoint.riderStates.every(
          (rider) =>
            rider.finishRank === null && rider.officialTimeSeconds === null,
        ),
      ).toBe(true)
      expect(
        checkpoint.gaps.every((gap) => gap.officialTimeSeconds === null),
      ).toBe(true)

      const groupedRiderIds = checkpoint.groups
        .flatMap((group) => group.riderIds)
        .slice()
        .sort()
      expect(groupedRiderIds).toEqual(expectedStarterIds)
      expect(new Set(groupedRiderIds).size).toBe(groupedRiderIds.length)
    })
  })

  it('creates exactly one engine checkpoint for every calculated sprint and KOM event', () => {
    const result = runRaceEngine(createValidInput())
    const pointCheckpoints = result.replayTimeline.checkpoints.filter(
      (checkpoint) =>
        checkpoint.checkpointKind === 'event' &&
        checkpoint.commentary.some((commentary) =>
          ['intermediate_sprint', 'bonus_sprint', 'kom'].includes(
            commentary.eventType,
          ),
        ),
    )

    expect(pointCheckpoints).toHaveLength(
      result.intermediatePointFinalization.replayEvents.length,
    )

    result.intermediatePointFinalization.replayEvents.forEach((event) => {
      const checkpoint = pointCheckpoints.find(
        (row) =>
          row.checkpointId ===
          `${result.stageId}|replay|point-${event.pointId}`,
      )

      expect(checkpoint).toBeDefined()
      expect(checkpoint?.raceProgress.kmFromStart).toBe(event.kmFromStart)
      expect(
        checkpoint?.intermediateResults.some(
          (pointResult) => pointResult.eventId === event.eventId,
        ),
      ).toBe(true)
      expect(checkpoint?.commentary[0].title).toBe(event.title)
      expect(checkpoint?.commentary[0].riderIds).toEqual(
        event.rankings.map((ranking) => ranking.riderId),
      )
    })
  })

  it('stores accepted opening attacks and the one original breakaway formation', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const phase1 = result.roadRaceResolution.phase1Opening!
    const acceptedAttempts = phase1.attackAttempts.filter(
      (attempt) => attempt.acceptedEscapeLaunch,
    )
    const attackCheckpoints = result.replayTimeline.checkpoints.filter(
      (checkpoint) =>
        checkpoint.checkpointKind === 'event' &&
        checkpoint.commentary[0]?.eventType === 'attack' &&
        checkpoint.phase === 1,
    )
    const formationCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.commentary[0]?.eventType === 'breakaway_formation',
    )

    expect(acceptedAttempts.length).toBeGreaterThan(0)
    expect(attackCheckpoints).toHaveLength(acceptedAttempts.length)
    expect(formationCheckpoint).toBeDefined()
    expect(formationCheckpoint?.commentary[0].riderIds).toEqual(
      phase1.breakawayRiderIds,
    )
    expect(
      formationCheckpoint?.groups.some((group) =>
        group.displayCode.startsWith('B'),
      ),
    ).toBe(true)
    expect(
      formationCheckpoint?.gaps.find((gap) => gap.displayCode === 'P')
        ?.gapSeconds,
    ).toBe(phase1.initialGapSeconds)
  })

  it('inserts every successful decisive attack and the calculated group split', () => {
    const result = runRaceEngine(createReplayCatchInput())
    const phase3 = result.roadRaceResolution.phase3Decisive!
    const successfulAttempts = phase3.attackAttempts.filter(
      (attempt) => attempt.attackSucceeded,
    )
    const decisiveAttackCheckpoints = result.replayTimeline.checkpoints.filter(
      (checkpoint) =>
        checkpoint.checkpointKind === 'event' &&
        checkpoint.phase === 3 &&
        checkpoint.commentary[0]?.eventType === 'attack',
    )
    const splitCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.commentary[0]?.eventType === 'group_split',
    )

    expect(successfulAttempts.length).toBeGreaterThan(0)
    expect(decisiveAttackCheckpoints).toHaveLength(successfulAttempts.length)
    expect(splitCheckpoint).toBeDefined()
    expect(splitCheckpoint?.groups.every(
      (group) => group.riderIds.length > 0,
    )).toBe(true)
    expect(
      splitCheckpoint?.groups
        .flatMap((group) => group.riderIds)
        .slice()
        .sort(),
    ).toEqual(
      result.riderReadiness
        .filter((row) => row.eligibleToStart)
        .map((row) => row.riderId)
        .sort(),
    )
  })

  it('reveals the calculated late chase and performs one atomic catch checkpoint', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const phase4 = result.roadRaceResolution.phase4Finish!
    const catchStep = phase4.chaseSteps.find(
      (step) =>
        step.startGapSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS &&
        step.endGapSeconds <= PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    )!
    const chaseCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.commentary[0]?.eventType === 'late_chase',
    )
    const catchCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) => checkpoint.commentary[0]?.eventType === 'catch',
    )

    expect(phase4.breakawayCaught).toBe(true)
    expect(chaseCheckpoint).toBeDefined()
    expect(chaseCheckpoint?.raceProgress.fraction).toBe(
      phase4.automaticActivityStartsAtFraction,
    )
    expect(catchCheckpoint).toBeDefined()
    expect(catchCheckpoint?.raceProgress.kmFromStart).toBe(catchStep.kmEnd)
    expect(
      catchCheckpoint?.groups.some((group) =>
        group.displayCode.startsWith('B'),
      ),
    ).toBe(false)

    const peloton = catchCheckpoint?.groups.find(
      (group) => group.displayCode === 'P',
    )
    const pelotonGap = catchCheckpoint?.gaps.find(
      (gap) => gap.displayCode === 'P',
    )

    expect(peloton).toBeDefined()
    phase4.escapeRiderIdsAtStart.forEach((riderId) => {
      expect(peloton?.riderIds).toContain(riderId)
    })
    expect(pelotonGap?.gapSeconds).toBe(0)
  })

  it('does not invent incidents before the incident phase supplies them', () => {
    const timeline = runRaceEngine(createValidInput()).replayTimeline

    expect(
      timeline.checkpoints.every(
        (checkpoint) => checkpoint.incidents.length === 0,
      ),
    ).toBe(true)
  })

  it('returns exactly the same complete event timeline for identical inputs', () => {
    const input = createReplayCatchInput()

    expect(runRaceEngine(input).replayTimeline).toEqual(
      runRaceEngine(input).replayTimeline,
    )
  })
})

describe('Phase 6 read-only calibration summary', () => {
  function createCalibrationStageInput(
    terrain: 'flat' | 'hilly' | 'mountain',
    distanceKm: number,
  ): UniversalRaceEngineInput {
    const input = createExpandedFieldInput(26)
    const finishType =
      terrain === 'mountain'
        ? 'summit_finish'
        : terrain === 'hilly'
          ? 'uphill_finish'
          : 'flat_finish'
    const profilePoints =
      terrain === 'mountain'
        ? [
            { km: 0, elevationM: 150 },
            { km: distanceKm * 0.35, elevationM: 350 },
            { km: distanceKm * 0.68, elevationM: 1200 },
            { km: distanceKm * 0.86, elevationM: 700 },
            { km: distanceKm, elevationM: 1450 },
          ]
        : terrain === 'hilly'
          ? [
              { km: 0, elevationM: 80 },
              { km: distanceKm * 0.3, elevationM: 420 },
              { km: distanceKm * 0.55, elevationM: 160 },
              { km: distanceKm * 0.8, elevationM: 520 },
              { km: distanceKm, elevationM: 380 },
            ]
          : [
              { km: 0, elevationM: 20 },
              { km: distanceKm, elevationM: 25 },
            ]

    return {
      ...input,
      stage: {
        ...input.stage,
        distanceKm,
        terrainType: terrain,
        profileType: terrain,
        finishType,
        summitFinish: terrain === 'mountain',
        elevationGainM:
          terrain === 'mountain' ? 3200 : terrain === 'hilly' ? 1800 : 120,
        terrainPercentages:
          terrain === 'mountain'
            ? { flat: 15, hilly: 25, mountain: 60, cobbled: 0 }
            : terrain === 'hilly'
              ? { flat: 30, hilly: 60, mountain: 10, cobbled: 0 }
              : { flat: 92, hilly: 8, mountain: 0, cobbled: 0 },
        profilePoints,
      },
      points: input.points.map((point) =>
        point.pointType === 'FINISH'
          ? { ...point, kmFromStart: distanceKm }
          : point.kmFromStart > distanceKm
            ? { ...point, kmFromStart: distanceKm * 0.75 }
            : point,
      ),
    }
  }

  const calibrationScenarios = [
    {
      label: 'flat validation stage',
      input: () => createCalibrationStageInput('flat', 142),
      classification: 'flat_road_stage',
    },
    {
      label: 'hilly validation stage',
      input: () => createCalibrationStageInput('hilly', 156),
      classification: 'hilly_road_stage',
    },
    {
      label: 'mountain validation stage',
      input: () => createCalibrationStageInput('mountain', 168),
      classification: 'mountain_road_stage',
    },
    {
      label: 'unusually long validation stage',
      input: () => createCalibrationStageInput('flat', 260),
      classification: 'flat_road_stage',
    },
  ] as const

  it.each(calibrationScenarios)(
    'publishes a deterministic, internally consistent $label summary',
    ({ input: createInput, classification }) => {
      const input = createInput()
      const first = runRaceEngine(input)
      const second = runRaceEngine(input)
      const summary = first.calibrationSummary
      const winner = first.finishResolution.classification.find(
        (row) => row.rank === 1,
      )!

      expect(summary).toEqual(second.calibrationSummary)
      expect(summary.stageClassification).toBe(classification)
      expect(summary.finishMode).toBe(first.finishResolution.finishMode)
      expect(summary.winnerRiderId).toBe(
        first.finishResolution.winnerRiderId,
      )
      expect(summary.winnerTeamId).toBe(first.finishResolution.winnerTeamId)
      expect(summary.winningTimeSeconds).toBe(winner.officialTimeSeconds)
      expect(summary.finishingRiderCount).toBe(
        first.finishResolution.classification.filter(
          (row) => row.status === 'finished',
        ).length,
      )
      expect(summary.finalGroupCount).toBe(
        first.groupAndTimeResolution.finalGroups.length,
      )
      expect(summary.finalGroupGapsSeconds).toEqual(
        first.groupAndTimeResolution.finalGroups
          .slice()
          .sort((left, right) => left.groupOrder - right.groupOrder)
          .map((group) => group.gapSeconds),
      )
      expect(summary.averageSpeedKmh).toBeGreaterThan(10)
      expect(summary.averageSpeedKmh).toBeLessThan(90)
      expect(summary.finalGroupGapsSeconds.every((gap) => gap >= 0)).toBe(
        true,
      )
      expect(
        summary.finalGroupGapsSeconds.every(
          (gap, index, rows) => index === 0 || gap >= rows[index - 1],
        ),
      ).toBe(true)
      expect(summary.maximumBreakawayGapSeconds).toBeGreaterThanOrEqual(0)
      expect(summary.averageRemainingEnergy).not.toBeNull()
      expect(summary.minimumRemainingEnergy).not.toBeNull()
      expect(summary.averageRemainingEnergy!).toBeGreaterThanOrEqual(0)
      expect(summary.averageRemainingEnergy!).toBeLessThanOrEqual(100)
      expect(summary.minimumRemainingEnergy!).toBeGreaterThanOrEqual(0)
      expect(summary.minimumRemainingEnergy!).toBeLessThanOrEqual(
        summary.averageRemainingEnergy!,
      )
      expect(summary.deterministic).toBe(true)
      expect(summary.modelVersion).toBe(
        'universal_race_calibration_summary_v1',
      )
    },
  )

  it('derives breakaway and catch diagnostics only from accepted physical outputs', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const summary = result.calibrationSummary
    const phase1 = result.roadRaceResolution.phase1Opening!

    expect(summary.openingBreakawaySize).toBe(phase1.breakawayRiderIds.length)
    expect(summary.openingBreakawaySize).toBeGreaterThan(0)
    expect(summary.openingAttackKm).not.toBeNull()
    expect(summary.maximumBreakawayGapSeconds).toBeGreaterThanOrEqual(
      phase1.initialGapSeconds,
    )

    if (summary.catchKm !== null) {
      expect(summary.breakawayCaught).toBe(true)
    }
  })

  it('does not mutate any Phase 1 to Phase 6 result while deriving diagnostics', () => {
    const input = createCalibrationStageInput('mountain', 168)
    const result = runRaceEngine(input)
    const before = JSON.stringify({
      roadRaceResolution: result.roadRaceResolution,
      groupAndTimeResolution: result.groupAndTimeResolution,
      finishResolution: result.finishResolution,
    })

    const rebuilt = buildUniversalRaceCalibrationSummary(
      input,
      result.stageClassification,
      result.roadRaceResolution,
      result.groupAndTimeResolution,
      result.finishResolution,
    )

    expect(rebuilt).toEqual(result.calibrationSummary)
    expect(
      JSON.stringify({
        roadRaceResolution: result.roadRaceResolution,
        groupAndTimeResolution: result.groupAndTimeResolution,
        finishResolution: result.finishResolution,
      }),
    ).toBe(before)
  })

  it('keeps non-road energy and breakaway diagnostics explicitly unavailable or zero', () => {
    const input = withTimeTrialRules(
      withStageFormat(createValidInput(), {
        stageFormat: 'individual_time_trial',
        terrainType: 'individual_time_trial',
        finishType: 'time_trial_finish',
        profileType: 'time_trial',
      }),
      null,
    )
    const summary = runRaceEngine(input).calibrationSummary

    expect(summary.openingBreakawaySize).toBe(0)
    expect(summary.openingAttackKm).toBeNull()
    expect(summary.maximumBreakawayGapSeconds).toBe(0)
    expect(summary.breakawayCaught).toBe(false)
    expect(summary.breakawaySurvived).toBe(false)
    expect(summary.catchKm).toBeNull()
    expect(summary.averageRemainingEnergy).toBeNull()
    expect(summary.minimumRemainingEnergy).toBeNull()
  })
})

describe('Phase 7 read-only replay page integration — Task 7.3', () => {
  const readReplayPageSource = () =>
    readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

  it('consumes the complete engine timeline instead of constructing replay frames', () => {
    const source = readReplayPageSource()

    expect(source).toContain(
      'shadowBuild.result?.replayTimeline.checkpoints ?? []',
    )
    expect(source).not.toContain('function buildUniversalReplayFrames')
    expect(source).not.toContain('createUniversalFrameMaps')
  })

  it('reveals commentary stored on engine checkpoints instead of generating commentary', () => {
    const source = readReplayPageSource()

    expect(source).toContain(
      'result.replayTimeline.checkpoints.flatMap((checkpoint)',
    )
    expect(source).toContain('checkpoint.commentary.map((entry)')
    expect(source).not.toContain('function buildUniversalShadowCommentary')
  })

  it('runs the universal race calculation exactly once on the backend and never in the replay page', () => {
    const source = readReplayPageSource()
    const runnerSource = readFileSync(
      new URL('../../netlify/functions/universal-race-stage-runner.ts', import.meta.url),
      'utf8',
    )

    expect(source.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
    expect(runnerSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(1)
    expect(source).not.toContain('buildUniversalPhase6SprintAudit')
    expect(source).not.toContain('__PPM_PHASE6_SPRINT_AUDIT__')
  })

  it('reads rider state, commands and point results from the reached checkpoint', () => {
    const source = readReplayPageSource()

    expect(source).toContain('currentFrame.riderStates.map(')
    expect(source).toContain('currentFrame.activeCommands.map(')
    expect(source).toContain('checkpoint.intermediateResults.forEach(')
    expect(source).not.toContain('pointFinalizationEnergyCostByRiderId')
  })

  it('uses the final checkpoint flag as the only replay result-visibility gate', () => {
    const source = readReplayPageSource()

    expect(source).toContain(
      'const resultsVisible = currentFrame?.finalResultsVisible === true',
    )
    expect(source).toContain('{result && resultsVisible ? (')
    expect(source).toContain(
      `resultsVisible
                        ? 'Final stage result · riders'`,
    )
    expect(source).toContain('!resultsVisible ||')
  })

  it('preserves playback controls and presents time trials with deterministic staggered starters', () => {
    const source = readReplayPageSource()

    expect(source).toContain('useState<1 | 2 | 4 | 8>(1)')
    expect(source).toContain('{[1, 2, 4, 8].map((value) => (')
    expect(source).toContain('onClick={finishReplay}')
    expect(source).toContain('onClick={restartReplay}')
    expect(source).toContain("stageFormat === 'individual_time_trial' || stageFormat === 'prologue'")
    expect(source).toContain("stageFormat === 'team_time_trial' || stageFormat === 'pair_time_trial'")
    expect(source).toContain('const timeTrialReplayPresentation = useMemo(() => {')
    expect(source).toContain('result.favourites.timeTrialFavourites.map(')
    expect(source).toContain('result.riderSuitability.map(')
    expect(source).toContain('Number(row.suitabilityScore)')
    expect(source).toContain('result.teamStrength.map(')
    expect(source).toContain('Number(row.teamStrengthScore)')
    expect(source).toContain('left.strength - right.strength')
    expect(source).toContain("state: 'waiting' | 'on_course' | 'finished'")
    expect(source).toContain('replayEntityMarkers={')
    expect(source).toContain('isTimeTrialReplay ? null : distanceReplayProgress * 100')
    expect(source).toContain('Waiting to start')
    expect(source).toContain('Compressed replay starts')
  })

  it('preserves the production replay-access RPCs', () => {
    const source = readReplayPageSource()

    expect(source).toContain("'get_race_replay_coin_access_v1'")
    expect(source).toContain("'purchase_race_replay_access_v1'")
  })

  it('does not restore an alternate replay route or legacy replay engine', () => {
    const source = readReplayPageSource()

    expect(source).not.toContain('RaceReplayFrame')
    expect(source).not.toContain('LegacyRaceReplayModal')
    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:race-replay|pages\/dev)[^'"]*['"]/i,
    )
  })
})

describe('Phase 7 cross-format replay and final synchronization — Task 7.4', () => {
  function createReplayFormatInput(
    stageFormat:
      | 'individual_time_trial'
      | 'prologue'
      | 'team_time_trial'
      | 'pair_time_trial',
  ): UniversalRaceEngineInput {
    if (stageFormat === 'team_time_trial') {
      return withTimeTrialRules(
        withStageFormat(createExpandedFieldInput(24), {
          stageFormat,
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
          profileType: 'time_trial',
        }),
        4,
      )
    }

    if (stageFormat === 'pair_time_trial') {
      return withTimeTrialRules(
        withStageFormat(createValidInput(), {
          stageFormat,
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
          profileType: 'time_trial',
        }),
        2,
      )
    }

    const formatted = withTimeTrialRules(
      withStageFormat(createExpandedFieldInput(26), {
        stageFormat,
        terrainType:
          stageFormat === 'prologue' ? 'prologue' : 'individual_time_trial',
        finishType:
          stageFormat === 'prologue' ? 'prologue_finish' : 'time_trial_finish',
        profileType: stageFormat === 'prologue' ? 'prologue' : 'time_trial',
      }),
      null,
    )

    if (stageFormat !== 'prologue') return formatted

    const startPoint = formatted.points.find(
      (point) => point.kmFromStart === 0,
    )!
    const finishPoint = formatted.points.find((point) => point.isFinishPoint)!

    return {
      ...formatted,
      stage: {
        ...formatted.stage,
        distanceKm: 6,
        elevationGainM: 30,
        profilePoints: [
          { km: 0, elevationM: 20 },
          { km: 3, elevationM: 50 },
          { km: 6, elevationM: 28 },
        ],
      },
      points: [
        { ...startPoint, kmFromStart: 0, sortOrder: 0 },
        { ...finishPoint, kmFromStart: 6, sortOrder: 1 },
      ],
    }
  }

  const formats = [
    'individual_time_trial',
    'prologue',
    'team_time_trial',
    'pair_time_trial',
  ] as const

  it('generates the complete five-checkpoint base timeline for every time-trial format', () => {
    formats.forEach((stageFormat) => {
      const result = runRaceEngine(createReplayFormatInput(stageFormat))
      const timeline = result.replayTimeline
      const baseCheckpoints = timeline.checkpoints.filter(
        (checkpoint) => checkpoint.checkpointKind === 'base',
      )

      expect(timeline.active).toBe(true)
      expect(timeline.inactiveReason).toBeNull()
      expect(timeline.completeBeforePlayback).toBe(true)
      expect(timeline.playbackRecalculatesRace).toBe(false)
      expect(timeline.baseCheckpointCount).toBe(5)
      expect(timeline.eventCheckpointCount).toBe(1)
      expect(baseCheckpoints.map((checkpoint) => checkpoint.phase)).toEqual([
        0,
        1,
        2,
        3,
        4,
      ])
      expect(
        baseCheckpoints.map((checkpoint) => checkpoint.raceProgress.fraction),
      ).toEqual([0, 0.25, 0.5, 0.7, 1])
      expect(
        timeline.checkpoints.map((checkpoint) => checkpoint.checkpointIndex),
      ).toEqual(
        timeline.checkpoints.map((_, index) => index),
      )
    })
  })

  it('keeps all final ranks, statuses, times, groups and gaps synchronized in every format', () => {
    formats.forEach((stageFormat) => {
      const result = runRaceEngine(createReplayFormatInput(stageFormat))
      const finalCheckpoint = result.replayTimeline.checkpoints.find(
        (checkpoint) =>
          checkpoint.checkpointId === result.replayTimeline.finalCheckpointId,
      )!

      expect(finalCheckpoint.finalResultsVisible).toBe(true)
      const finishedRiderIds = result.finishResolution.classification
        .filter((row) => row.status === 'finished')
        .map((row) => row.riderId)
        .sort()
      expect(
        finalCheckpoint.groups.flatMap((group) => group.riderIds).sort(),
      ).toEqual(finishedRiderIds)

      const replayByRiderId = new Map(
        finalCheckpoint.riderStates.map((row) => [row.riderId, row] as const),
      )
      result.finishResolution.classification.forEach((official) => {
        const replay = replayByRiderId.get(official.riderId)

        expect(replay).toBeDefined()
        expect(replay?.status).toBe(official.status)
        expect(replay?.finishRank).toBe(official.rank)
        expect(replay?.officialTimeSeconds).toBe(official.officialTimeSeconds)
        expect(replay?.gapSeconds).toBe(official.gapSeconds)
      })

      finalCheckpoint.groups.forEach((group, index) => {
        const gap = finalCheckpoint.gaps[index]
        const firstRiderId = group.riderIds[0]
        const official = result.finishResolution.classification.find(
          (row) => row.riderId === firstRiderId,
        )

        expect(gap.groupCode).toBe(group.groupCode)
        expect(gap.displayCode).toBe(group.displayCode)
        expect(gap.gapSeconds).toBe(official?.gapSeconds)
        expect(gap.officialTimeSeconds).toBe(official?.officialTimeSeconds)
      })
    })
  })

  it('hides all official result fields until the final time-trial checkpoint', () => {
    formats.forEach((stageFormat) => {
      const timeline = runRaceEngine(
        createReplayFormatInput(stageFormat),
      ).replayTimeline
      const finalCheckpointIndex = timeline.checkpoints.findIndex(
        (checkpoint) => checkpoint.checkpointId === timeline.finalCheckpointId,
      )

      expect(finalCheckpointIndex).toBe(timeline.checkpoints.length - 1)
      timeline.checkpoints.slice(0, finalCheckpointIndex).forEach((checkpoint) => {
        expect(checkpoint.finalResultsVisible).toBe(false)
        expect(
          checkpoint.riderStates.every(
            (row) => row.finishRank === null && row.officialTimeSeconds === null,
          ),
        ).toBe(true)
        expect(
          checkpoint.gaps.every((gap) => gap.officialTimeSeconds === null),
        ).toBe(true)
      })
    })
  })

  it('stores progressive split gaps without changing the accepted final timing result', () => {
    formats.forEach((stageFormat) => {
      const result = runRaceEngine(createReplayFormatInput(stageFormat))
      const finalCheckpoint = result.replayTimeline.checkpoints.find(
        (checkpoint) =>
          checkpoint.checkpointId === result.replayTimeline.finalCheckpointId,
      )!
      const finalGapByDisplayCode = new Map(
        finalCheckpoint.gaps.map(
          (group) => [group.displayCode, group.gapSeconds] as const,
        ),
      )
      const splitCheckpoints = result.replayTimeline.checkpoints.filter(
        (checkpoint) =>
          checkpoint.checkpointKind === 'base' &&
          checkpoint.raceProgress.fraction > 0 &&
          checkpoint.raceProgress.fraction < 1,
      )

      splitCheckpoints.forEach((checkpoint) => {
        checkpoint.gaps.forEach((gap) => {
          expect(gap.gapSeconds).toBe(
            Number(
              (
                (finalGapByDisplayCode.get(gap.displayCode) ?? 0) *
                checkpoint.raceProgress.fraction
              ).toFixed(6),
            ),
          )
        })
      })
    })
  })

  it('uses individual timing units for ITT/prologue and complete team units for TTT/pairs', () => {
    ;(['individual_time_trial', 'prologue'] as const).forEach((stageFormat) => {
      const timeline = runRaceEngine(
        createReplayFormatInput(stageFormat),
      ).replayTimeline
      const firstSplit = timeline.checkpoints.find(
        (checkpoint) =>
          checkpoint.checkpointKind === 'base' && checkpoint.phase === 1,
      )!

      expect(
        firstSplit.groups.every(
          (group) =>
            group.groupCode === 'individual_time_unit' &&
            group.riderIds.length === 1,
        ),
      ).toBe(true)
    })

    ;(['team_time_trial', 'pair_time_trial'] as const).forEach((stageFormat) => {
      const input = createReplayFormatInput(stageFormat)
      const timeline = runRaceEngine(input).replayTimeline
      const firstSplit = timeline.checkpoints.find(
        (checkpoint) =>
          checkpoint.checkpointKind === 'base' && checkpoint.phase === 1,
      )!
      const teamByRiderId = new Map(
        input.riders.map((rider) => [rider.riderId, rider.teamId] as const),
      )

      expect(
        firstSplit.groups.every(
          (group) =>
            group.groupCode === 'team_time_unit' &&
            new Set(group.riderIds.map((riderId) => teamByRiderId.get(riderId)))
              .size === 1,
        ),
      ).toBe(true)
    })
  })

  it('returns identical cross-format replay timelines for identical complete inputs', () => {
    formats.forEach((stageFormat) => {
      const input = createReplayFormatInput(stageFormat)

      expect(runRaceEngine(input).replayTimeline).toEqual(
        runRaceEngine(input).replayTimeline,
      )
    })
  })

  it('makes the replay page distinguish repeated timing group codes by display identity', () => {
    const source = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain('const groupOrderByDisplayCode = new Map(')
    expect(source).toContain('const groupByDisplayCode = new Map(')
    expect(source).toContain('groupByDisplayCode.get(currentState.displayCode)')
    expect(source).not.toContain('const groupOrderByCode = new Map(')
  })
})

describe('Phase 7 final replay-to-result synchronization — Task 7.5', () => {
  function rebuildSynchronization(
    input: UniversalRaceEngineInput,
    result: ReturnType<typeof runRaceEngine>,
    replayTimeline = result.replayTimeline,
  ) {
    return buildUniversalReplaySynchronizationSummary(
      input,
      result.riderReadiness,
      result.roadCommandResolution,
      result.intermediatePointFinalization,
      result.groupAndTimeResolution,
      result.finishResolution,
      result.phase10Incidents,
      replayTimeline,
    )
  }

  it('publishes one successful synchronization audit for the complete calculated race', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const result = runRaceEngine(input)
    const summary = result.replaySynchronization

    expect(summary.synchronized).toBe(true)
    expect(summary.checkpointCount).toBe(result.replayTimeline.checkpoints.length)
    expect(summary.baseCheckpointCount).toBe(5)
    expect(summary.eventCheckpointCount).toBeGreaterThan(0)
    expect(summary.uniqueCheckpointIdCount).toBe(summary.checkpointCount)
    expect(summary.resultsVisibleCheckpointCount).toBe(1)
    expect(summary.allCheckpointsChronological).toBe(true)
    expect(summary.allCheckpointRidersComplete).toBe(true)
    expect(summary.allGroupMembershipUnique).toBe(true)
    expect(summary.allGapsMatchGroups).toBe(true)
    expect(summary.allTeamStatesMatchRiders).toBe(true)
    expect(summary.allCommandsMatchResolution).toBe(true)
    expect(summary.allIntermediateResultsCumulative).toBe(true)
    expect(summary.allCommentaryReferencesValid).toBe(true)
    expect(summary.allResultFieldsHiddenBeforeFinish).toBe(true)
    expect(summary.finalCheckpointMatchesClassification).toBe(true)
    expect(summary.incidentSynchronizationStatus).toBe('not_available')
    expect(summary.incidentIntegrationComplete).toBe(false)
    expect(summary.incidentCount).toBe(0)
    expect(summary.issues).toEqual([])
    expect(summary.modelVersion).toBe('universal_replay_synchronization_v1')
  })

  it('detects any official rank or time exposed before the finish checkpoint', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const firstNonFinal = result.replayTimeline.checkpoints.find(
      (checkpoint) => !checkpoint.finalResultsVisible,
    )!
    const leakedTimeline = {
      ...result.replayTimeline,
      checkpoints: result.replayTimeline.checkpoints.map((checkpoint) =>
        checkpoint.checkpointId === firstNonFinal.checkpointId
          ? {
              ...checkpoint,
              riderStates: checkpoint.riderStates.map((row, index) =>
                index === 0
                  ? { ...row, finishRank: 1, officialTimeSeconds: 12345 }
                  : row,
              ),
            }
          : checkpoint,
      ),
    }
    const summary = rebuildSynchronization(input, result, leakedTimeline)

    expect(summary.synchronized).toBe(false)
    expect(summary.allResultFieldsHiddenBeforeFinish).toBe(false)
    expect(
      summary.issues.some((issue) => issue.startsWith('official_result_leak:')),
    ).toBe(true)
  })

  it('detects duplicate group membership and a rider/group gap disagreement', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const result = runRaceEngine(input)
    const checkpoint = result.replayTimeline.checkpoints.find(
      (row) => row.groups.length >= 2,
    )!
    const firstRiderId = checkpoint.groups[0].riderIds[0]
    const brokenTimeline = {
      ...result.replayTimeline,
      checkpoints: result.replayTimeline.checkpoints.map((row) =>
        row.checkpointId === checkpoint.checkpointId
          ? {
              ...row,
              groups: row.groups.map((group, index) =>
                index === 1
                  ? {
                      ...group,
                      riderIds: [...group.riderIds, firstRiderId],
                    }
                  : group,
              ),
              riderStates: row.riderStates.map((state) =>
                state.riderId === firstRiderId
                  ? { ...state, gapSeconds: (state.gapSeconds ?? 0) + 7 }
                  : state,
              ),
            }
          : row,
      ),
    }
    const summary = rebuildSynchronization(input, result, brokenTimeline)

    expect(summary.synchronized).toBe(false)
    expect(summary.allGroupMembershipUnique).toBe(false)
    expect(summary.allGapsMatchGroups).toBe(false)
  })

  it('detects stale commands, point results and invalid commentary references', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const checkpoint = result.replayTimeline.checkpoints.find(
      (row) => row.phase === 2 && row.intermediateResults.length > 0,
    )!
    const brokenTimeline = {
      ...result.replayTimeline,
      checkpoints: result.replayTimeline.checkpoints.map((row) =>
        row.checkpointId === checkpoint.checkpointId
          ? {
              ...row,
              activeCommands: [],
              intermediateResults: [],
              commentary: row.commentary.map((entry, index) =>
                index === 0
                  ? { ...entry, riderIds: ['unknown-rider'] }
                  : entry,
              ),
            }
          : row,
      ),
    }
    const summary = rebuildSynchronization(input, result, brokenTimeline)

    expect(summary.synchronized).toBe(false)
    expect(summary.allCommandsMatchResolution).toBe(false)
    expect(summary.allIntermediateResultsCumulative).toBe(false)
    expect(summary.allCommentaryReferencesValid).toBe(false)
  })

  it('rejects replay incidents that do not exist in the authoritative Phase 10 incident set', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const checkpoint = result.replayTimeline.checkpoints[1]
    const brokenTimeline = {
      ...result.replayTimeline,
      checkpoints: result.replayTimeline.checkpoints.map((row) =>
        row.checkpointId === checkpoint.checkpointId
          ? {
              ...row,
              incidents: [
                {
                  incidentId: 'invented-incident',
                  incidentType: 'crash',
                  phase: 1 as const,
                  kmFromStart: row.raceProgress.kmFromStart,
                  riderIds: [input.riders[0].riderId],
                  teamIds: [input.riders[0].teamId],
                  title: 'Invented crash',
                  description: 'This must not be accepted without Phase 10.',
                },
              ],
            }
          : row,
      ),
    }
    const summary = rebuildSynchronization(input, result, brokenTimeline)

    expect(summary.synchronized).toBe(false)
    expect(summary.incidentSynchronizationStatus).toBe('not_available')
    expect(summary.incidentIntegrationComplete).toBe(false)
    expect(summary.incidentCount).toBe(1)
    expect(summary.issues).toContain('incident_id_set_mismatch')
  })

  it('returns the identical synchronization summary for identical complete inputs', () => {
    const input = createValidInput()

    expect(runRaceEngine(input).replaySynchronization).toEqual(
      runRaceEngine(input).replaySynchronization,
    )
  })

  it('makes the replay page reject any engine output that is not synchronized', () => {
    const source = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain(
      'if (!result.replaySynchronization.synchronized)',
    )
    expect(source).toContain(
      "error: 'Replay data could not be synchronized.'",
    )
    expect(source).not.toContain('result.replaySynchronization.issues.join')
    expect(source.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
  })
})

describe('Phase 7 final replay-page closeout', () => {
  function readReplayPageSource(): string {
    return readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
  }

  it('removes obsolete Phase 6 raw-RPC diagnostics from the player replay page', () => {
    const source = readReplayPageSource()

    expect(source).not.toContain('PHASE 6 RIDER INPUT RPC — RAW RESPONSE')
    expect(source).not.toContain("console.error('PHASE 6 RIDER INPUT RPC RAW'")
    expect(source).not.toContain('Phase 6 audit stopped')
    expect(source).toContain('Race replay')
  })

  it('uses player-facing stored-replay error messages and never offers a browser calculation fallback', () => {
    const source = readReplayPageSource()

    expect(source).toContain('Replay could not be loaded. Please try again shortly.')
    expect(source).toContain('Replay is unavailable for this stage.')
    expect(source).toContain('Replay data could not be synchronized.')
    expect(source).not.toContain('Stored backend replay could not be loaded:')
    expect(source).not.toContain('No browser fallback calculation was executed.')
    expect(source).not.toContain('Universal shadow calculation failed.')
    expect(source).not.toContain(
      'The universal finish resolution did not return a complete winner and classification.',
    )
    expect(source.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
  })

  it('preserves backend-only calculation, synchronization rejection and all playback speeds', () => {
    const source = readReplayPageSource()
    const runnerSource = readFileSync(
      new URL('../../netlify/functions/universal-race-stage-runner.ts', import.meta.url),
      'utf8',
    )

    expect(source.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
    expect(runnerSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(1)
    expect(source).toContain('if (!result.replaySynchronization.synchronized)')
    expect(source).toContain('[1, 2, 4, 8].map')
    expect(source).toContain('Finish replay')
    expect(source).toContain('Restart')
  })

  it('keeps the accepted Phase 5/6 seed path frozen while newer paths use the canonical nested seed', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('input.deterministicSeed')
    expect(source).toContain('input.engine.deterministicSeed')
    expect(source).toContain('getFrozenPhase56LegacySeed')
    expect(source).toContain('incidentIntegrationComplete: phase10Incidents.active')
  })
})

describe('Phase 8 post-stage fatigue, energy and recovery foundation — Task 8.1', () => {
  it('returns one complete immutable post-stage update for every rider', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const summary = result.postStageUpdate

    expect(summary.active).toBe(true)
    expect(summary.calculatedBeforePersistence).toBe(true)
    expect(summary.persistenceApplied).toBe(false)
    expect(summary.persistenceBoundary).toBe('phase_11_application_service')
    expect(summary.writePolicy).toBe('ledger_guarded_once')
    expect(summary.riderUpdateCount).toBe(input.riders.length)
    expect(summary.riderUpdates).toHaveLength(input.riders.length)
    expect(new Set(summary.riderUpdates.map((row) => row.riderId)).size).toBe(
      input.riders.length,
    )
    expect(new Set(summary.riderUpdates.map((row) => row.writeKey)).size).toBe(
      input.riders.length,
    )
  })

  it('derives final energy and total energy spent only from accepted calculated outputs', () => {
    const result = runRaceEngine(createValidInput())

    result.postStageUpdate.riderUpdates.forEach((update) => {
      if (!update.eligibleToStart) {
        expect(update.totalEnergySpent).toBe(0)
        return
      }

      expect(update.finishEnergy).toBeGreaterThanOrEqual(0)
      expect(update.finishEnergy).toBeLessThanOrEqual(update.startEnergy)
      expect(update.totalEnergySpent).toBeCloseTo(
        update.startEnergy - update.finishEnergy,
        6,
      )
      expect(update.energySpentPctOfStart).toBeCloseTo(
        (update.totalEnergySpent / update.startEnergy) * 100,
        6,
      )
    })
  })

  it('applies point-finalization energy costs exactly once', () => {
    const result = runRaceEngine(createValidInput())
    const expectedByRiderId = new Map<string, number>()

    result.intermediatePointFinalization.costApplications
      .filter((row) => row.applicationMode === 'point_finalization_cost')
      .forEach((row) => {
        expectedByRiderId.set(
          row.riderId,
          (expectedByRiderId.get(row.riderId) ?? 0) + row.energyCost,
        )
      })

    result.postStageUpdate.riderUpdates.forEach((update) => {
      expect(update.additionalPointEnergyCost).toBeCloseTo(
        Math.min(
          update.finishEnergyBeforePointCosts,
          expectedByRiderId.get(update.riderId) ?? 0,
        ),
        6,
      )
      expect(update.finishEnergy).toBeCloseTo(
        update.finishEnergyBeforePointCosts - update.additionalPointEnergyCost,
        6,
      )
    })
  })

  it('keeps DNS riders unchanged and excludes them from fatigue persistence', () => {
    const input = createSoloFinishInput()
    const summary = runRaceEngine(input).postStageUpdate
    const dnsUpdates = summary.riderUpdates.filter(
      (row) => row.finishStatus === 'dns',
    )

    expect(dnsUpdates).toHaveLength(input.riders.length - 1)
    dnsUpdates.forEach((update) => {
      expect(update.eligibleToStart).toBe(false)
      expect(update.startEnergy).toBe(0)
      expect(update.finishEnergy).toBe(0)
      expect(update.totalEnergySpent).toBe(0)
      expect(update.appliedFatigueGain).toBe(0)
      expect(update.fatigueAfterStage).toBe(
        update.effectiveFatigueBeforeStage,
      )
      expect(update.writeEligible).toBe(false)
      expect(update.previousStageSeed.finishStamina).toBeNull()
      expect(update.previousStageSeed.fatigueGain).toBeNull()
    })
    expect(summary.dnsCount).toBe(dnsUpdates.length)
  })

  it('applies the post-stage multiplier and recovery bonus once after physical load', () => {
    const base = createValidInput()
    const input: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? {
              ...rider,
              preparationModifiers: {
                inStageEnergyCostMultiplier: 1,
                postStageFatigueMultiplier: 1.25,
                postStageRecoveryBonusPoints: 2,
              },
            }
          : rider,
      ),
    }
    const update = runRaceEngine(input).postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(update.postStageFatigueMultiplier).toBe(1.25)
    expect(update.postStageRecoveryBonusPoints).toBe(2)
    expect(update.adjustedFatigueGain).toBeCloseTo(
      Math.max(0, update.grossFatigueGain * 1.25 - 2),
      6,
    )
  })

  it('keeps recovery out of same-stage fatigue and publishes the next-day projection separately', () => {
    const update = runRaceEngine(createValidInput()).postStageUpdate.riderUpdates[0]

    expect(update.fatigueAfterStage).toBeCloseTo(
      Math.min(
        100,
        update.effectiveFatigueBeforeStage + update.adjustedFatigueGain,
      ),
      6,
    )
    expect(update.fatigueAfterOneRecoveryDay).toBeCloseTo(
      Math.max(
        0,
        update.fatigueAfterStage - update.intrinsicDailyRecoveryPoints,
      ),
      6,
    )
    expect(update.estimatedDaysToPreStageFatigue).toBe(
      update.appliedFatigueGain > 0
        ? Math.ceil(
            update.appliedFatigueGain / update.intrinsicDailyRecoveryPoints,
          )
        : 0,
    )
  })

  it('clamps post-stage fatigue to the verified zero-to-one-hundred range', () => {
    const base = createValidInput()
    const input: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider) => ({
        ...rider,
        fatigueBeforeStage: 99,
        preparationModifiers: {
          inStageEnergyCostMultiplier: 1,
          postStageFatigueMultiplier: 10,
          postStageRecoveryBonusPoints: 0,
        },
      })),
    }
    const updates = runRaceEngine(input).postStageUpdate.riderUpdates.filter(
      (row) => row.eligibleToStart,
    )

    expect(updates.length).toBeGreaterThan(0)
    expect(updates.every((row) => row.fatigueAfterStage <= 100)).toBe(true)
    expect(updates.some((row) => row.fatigueClampedAtMaximum)).toBe(true)
  })

  it('publishes a previous-stage seed compatible with the next stage readiness input', () => {
    const result = runRaceEngine(createValidInput())

    result.postStageUpdate.riderUpdates.forEach((update) => {
      expect(update.previousStageSeed.stageId).toBe(result.stageId)
      expect(update.previousStageSeed.stageStatus).toBe(update.finishStatus)
      expect(update.previousStageSeed.fatigueAfterStage).toBe(
        update.fatigueAfterStage,
      )
      expect(update.previousStageSeed.finishStamina).toBe(
        update.eligibleToStart ? update.finishEnergy : null,
      )
      expect(update.previousStageSeed.fatigueGain).toBe(
        update.writeEligible ? update.appliedFatigueGain : null,
      )
    })
  })

  it('supports road and every time-trial format through the same update contract', () => {
    const formatInputs: UniversalRaceEngineInput[] = [createValidInput()]
    const individual = withTimeTrialRules(
      withStageFormat(createValidInput(), {
        stageFormat: 'individual_time_trial',
        terrainType: 'individual_time_trial',
        finishType: 'time_trial_finish',
        profileType: 'time_trial',
      }),
      null,
    )
    const prologueBase = withTimeTrialRules(
      withStageFormat(createValidInput(), {
        stageFormat: 'prologue',
        terrainType: 'prologue',
        finishType: 'prologue_finish',
        profileType: 'prologue',
      }),
      null,
    )
    const prologue: UniversalRaceEngineInput = {
      ...prologueBase,
      stage: {
        ...prologueBase.stage,
        distanceKm: 6,
        elevationGainM: 30,
        profilePoints: [
          { km: 0, elevationM: 20 },
          { km: 3, elevationM: 50 },
          { km: 6, elevationM: 28 },
        ],
      },
      points: prologueBase.points
        .filter((point) => point.pointType === 'START' || point.isFinishPoint)
        .map((point, index) => ({
          ...point,
          kmFromStart: index === 0 ? 0 : 6,
          sortOrder: index,
        })),
    }
    const team = withTimeTrialRules(
      withStageFormat(createExpandedFieldInput(24), {
        stageFormat: 'team_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      4,
    )
    const pair = withTimeTrialRules(
      withStageFormat(createValidInput(), {
        stageFormat: 'pair_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      2,
    )
    formatInputs.push(individual, prologue, team, pair)

    formatInputs.forEach((input) => {
      const result = runRaceEngine(input)
      expect(result.postStageUpdate.riderUpdateCount).toBe(input.riders.length)
      expect(result.postStageUpdate.riderUpdates).toHaveLength(
        input.riders.length,
      )
      expect(
        result.postStageUpdate.riderUpdates.every(
          (row) => row.modelVersion === 'universal_post_stage_rider_update_v2',
        ),
      ).toBe(true)
      expect(
        result.postStageUpdate.riderUpdates
          .filter((row) => row.eligibleToStart)
          .every((row) => row.energySpent > 0),
      ).toBe(true)
    })
  })

  it('is deterministic, independent of rider input ordering, and declares integrated modifier coverage', () => {
    const input = createValidInput()
    const reordered: UniversalRaceEngineInput = {
      ...input,
      riders: [...input.riders].reverse(),
      teams: [...input.teams].reverse(),
      stagePlans: [...input.stagePlans].reverse(),
    }
    const first = runRaceEngine(input).postStageUpdate
    const second = runRaceEngine(input).postStageUpdate
    const reorderedResult = runRaceEngine(reordered).postStageUpdate

    expect(first).toEqual(second)
    expect(first).toEqual(reorderedResult)
    expect(first.sourceCoverage).toEqual({
      terrain: 'represented_by_energy_and_difficulty',
      riderEffort: 'represented_by_calculated_energy_spent',
      savedCommands: 'represented_by_resolved_command_effort',
      attacks: 'represented_by_attack_energy',
      chasing: 'represented_by_chase_energy',
      breakaway: 'represented_by_breakaway_energy_and_duration',
      supportWork: 'represented_by_support_and_lead_out_energy',
      intermediatePoints: 'represented_exactly_once',
      weather: 'represented_by_energy_and_difficulty',
      equipment: 'represented_by_capped_performance_reliability_and_wear',
      assets: 'represented_by_condition_dependent_support_and_wear',
      supplies: 'represented_by_benefits_shortages_and_consumption',
      staff: 'represented_by_approved_capped_role_support',
      incidents:
        'consumes_authoritative_incidents_when_available_and_exposes_fatigue_risk',
    })
  })
})

describe('Phase 8 complete fatigue, effort, risk and persistence handoff', () => {
  function withRiderCommands(
    input: UniversalRaceEngineInput,
    riderId: string,
    commands: UniversalRaceEngineInput['stagePlans'][number]['riders'][number]['commands'],
  ): UniversalRaceEngineInput {
    return {
      ...input,
      stagePlans: input.stagePlans.map((teamPlan) => ({
        ...teamPlan,
        riders: teamPlan.riders.map((riderPlan) =>
          riderPlan.riderId === riderId
            ? { ...riderPlan, commands }
            : riderPlan,
        ),
      })),
    }
  }

  it('returns the exact canonical Phase 8 rider result aliases', () => {
    const result = runRaceEngine(createValidInput())

    result.postStageUpdate.riderUpdates.forEach((update) => {
      expect(update.fatigueBefore).toBe(update.effectiveFatigueBeforeStage)
      expect(update.fatigueGained).toBe(update.appliedFatigueGain)
      expect(update.fatigueAfter).toBe(update.fatigueAfterStage)
      expect(update.energySpent).toBe(update.totalEnergySpent)
      expect(update.recoveryDemand).toBe(update.recoveryDemandPoints)
      expect(update.fatigueBefore).toBeGreaterThanOrEqual(0)
      expect(update.fatigueAfter).toBeLessThanOrEqual(100)
      expect(update.recoveryDemand).toBeLessThanOrEqual(100)
    })
  })

  it('loads current freshness, sharpness and previous recovery condition without applying recovery twice', () => {
    const base = createValidInput()
    const input: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? {
              ...rider,
              fatigueBeforeStage: 20,
              raceSharpness: 82,
              previousStage: {
                stageId: 'previous-stage',
                stageStatus: 'finished',
                finishStamina: 45,
                fatigueAfterStage: 48,
                fatigueGain: 16,
                daysSincePreviousStage: 2,
              },
            }
          : rider,
      ),
    }
    const result = runRaceEngine(input)
    const readiness = result.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const update = result.postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(update.startFreshness).toBe(readiness.components.startFreshness)
    expect(update.raceSharpness).toBe(82)
    expect(update.previousRecoveryState).toBe('recovered')
    expect(readiness.previousStageRecovery?.representedByCurrentFatigue).toBe(
      true,
    )
    expect(update.fatigueBefore).toBe(20)
  })

  it('respects active illness and injury restrictions in readiness and updates', () => {
    const base = createValidInput()
    const input: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider) => {
        if (rider.riderId === 'rider-1') {
          return {
            ...rider,
            availabilityStatus: 'injured' as const,
            startStatus: 'dns' as const,
            unavailableReason: 'active injury',
          }
        }
        if (rider.riderId === 'rider-2') {
          return {
            ...rider,
            availabilityStatus: 'sick' as const,
            startStatus: 'dns' as const,
            unavailableReason: 'active illness',
          }
        }
        return rider
      }),
    }
    const result = runRaceEngine(input)
    const injured = result.postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!
    const sick = result.postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-2',
    )!

    expect(injured.healthRestrictionApplied).toBe(true)
    expect(injured.healthRestrictionReason).toBe('injured')
    expect(injured.eligibleToStart).toBe(false)
    expect(injured.energySpent).toBe(0)
    expect(sick.healthRestrictionApplied).toBe(true)
    expect(sick.healthRestrictionReason).toBe('sick')
    expect(sick.eligibleToStart).toBe(false)
    expect(sick.fatigueGained).toBe(0)
  })

  it('makes high fatigue reduce performance and increase the incident-risk signal', () => {
    const base = createValidInput()
    const lowInput: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? { ...rider, fatigueBeforeStage: 10 }
          : rider,
      ),
    }
    const highInput: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? { ...rider, fatigueBeforeStage: 80 }
          : rider,
      ),
    }
    const low = runRaceEngine(lowInput)
    const high = runRaceEngine(highInput)
    const lowReadiness = low.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const highReadiness = high.riderReadiness.find(
      (row) => row.riderId === 'rider-1',
    )!
    const lowUpdate = low.postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!
    const highUpdate = high.postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(highReadiness.readinessScore).toBeLessThan(
      lowReadiness.readinessScore,
    )
    expect(highUpdate.startEnergy).toBeLessThan(lowUpdate.startEnergy)
    expect(highUpdate.incidentRiskMultiplierBefore).toBeGreaterThan(
      lowUpdate.incidentRiskMultiplierBefore,
    )
    expect(calculateUniversalFatigueIncidentRiskMultiplier(90)).toBeGreaterThan(
      calculateUniversalFatigueIncidentRiskMultiplier(30),
    )
  })

  it('makes high fatigue produce at least as much recovery demand as low fatigue', () => {
    const base = createValidInput()
    const low = runRaceEngine({
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? { ...rider, fatigueBeforeStage: 5 }
          : rider,
      ),
    }).postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!
    const high = runRaceEngine({
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? { ...rider, fatigueBeforeStage: 75 }
          : rider,
      ),
    }).postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(high.recoveryDemand).toBeGreaterThan(low.recoveryDemand)
    expect(high.estimatedDaysToFullRecovery).toBeGreaterThanOrEqual(
      low.estimatedDaysToFullRecovery,
    )
  })

  it('charges aggressive effort more than protected riding for the same rider', () => {
    const base = createValidInput()
    const aggressive = withRiderCommands(base, 'rider-1', {
      phase1: 'attack',
      phase2: 'chase_breakaway',
      phase3: 'climb_hard',
      phase4: 'final_sprint',
    })
    const protectedInput = withRiderCommands(base, 'rider-1', {
      phase1: 'avoid_risks',
      phase2: 'conserve_energy',
      phase3: 'conserve_energy',
      phase4: 'avoid_risks',
    })
    const hard = runRaceEngine(aggressive).postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!
    const protectedUpdate = runRaceEngine(
      protectedInput,
    ).postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!

    expect(hard.effort.averageCommandEffortMultiplier).toBeGreaterThan(
      protectedUpdate.effort.averageCommandEffortMultiplier,
    )
    expect(hard.energySpent).toBeGreaterThan(protectedUpdate.energySpent)
    expect(hard.fatigueGained).toBeGreaterThan(
      protectedUpdate.fatigueGained,
    )
    expect(protectedUpdate.effort.effortCategory).toBe('protected')
  })

  it('records attack, chase, breakaway and point-battle effort from calculated outputs', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const breakawayIds =
      result.roadRaceResolution.phase1Opening?.breakawayRiderIds ?? []
    const breakawayUpdates = result.postStageUpdate.riderUpdates.filter(
      (row) => breakawayIds.includes(row.riderId),
    )

    expect(breakawayUpdates.length).toBeGreaterThan(0)
    expect(
      breakawayUpdates.some(
        (row) =>
          row.effort.breakawayPhaseCount > 0 &&
          row.effort.attackEnergySpent > 0,
      ),
    ).toBe(true)
    expect(
      result.postStageUpdate.riderUpdates.some(
        (row) => row.effort.intermediatePointEnergySpent > 0,
      ),
    ).toBe(true)
    expect(
      result.postStageUpdate.riderUpdates.some(
        (row) => row.effort.chaseEnergySpent > 0,
      ),
    ).toBe(true)
  })

  it('includes weather in both energy expenditure and fatigue gain', () => {
    const clearInput = createValidInput()
    const harshInput: UniversalRaceEngineInput = {
      ...clearInput,
      weather: {
        ...clearInput.weather!,
        condition: 'heavy_rain',
        temperatureC: 34,
        windKmh: 38,
        precipitationMm: 10,
        rainProbabilityPct: 95,
        crosswindRisk: 'high',
        descentRisk: 'high',
        surfaceRisk: 'high',
      },
    }
    const clear = runRaceEngine(clearInput).postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-2',
    )!
    const harsh = runRaceEngine(harshInput).postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-2',
    )!

    expect(harsh.weatherSeverity).toBeGreaterThan(clear.weatherSeverity)
    expect(harsh.energySpent).toBeGreaterThan(clear.energySpent)
    expect(harsh.fatigueGained).toBeGreaterThan(clear.fatigueGained)
  })

  it('adds fatigue only from authoritative calculated incident records when they exist', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const target = result.postStageUpdate.riderUpdates.find(
      (row) => row.riderId === 'rider-1',
    )!
    const incidentTimeline = {
      ...result.replayTimeline,
      checkpoints: result.replayTimeline.checkpoints.map((checkpoint, index) =>
        index === 1
          ? {
              ...checkpoint,
              incidents: [
                {
                  incidentId: 'authoritative-crash-1',
                  incidentType: 'individual_crash',
                  phase: 1 as const,
                  kmFromStart: checkpoint.raceProgress.kmFromStart,
                  riderIds: ['rider-1'],
                  teamIds: ['team-a'],
                  title: 'Calculated crash',
                  description: 'Authoritative incident supplied by the race calculation.',
                },
              ],
            }
          : checkpoint,
      ),
    }
    const withIncident = buildUniversalPostStageUpdateSummary(
      input,
      result.difficulty,
      result.riderReadiness,
      result.roadCommandResolution,
      result.roadRaceResolution,
      result.intermediatePointFinalization,
      result.finishResolution,
      result.phase10Incidents,
      incidentTimeline,
      result.replaySynchronization,
    ).riderUpdates.find((row) => row.riderId === 'rider-1')!

    expect(withIncident.incidentCount).toBe(1)
    expect(withIncident.incidentFatigueLoad).toBe(2.5)
    expect(withIncident.fatigueGained).toBeGreaterThan(target.fatigueGained)
  })

  it('keeps incident fatigue at zero on a deterministic race where Phase 10 produces no incident', () => {
    const summary = runRaceEngine(createValidInput()).postStageUpdate

    expect(
      summary.riderUpdates.every(
        (row) => row.incidentCount === 0 && row.incidentFatigueLoad === 0,
      ),
    ).toBe(true)
    expect(
      summary.riderUpdates.every(
        (row) =>
          row.incidentRiskMultiplierBefore >= 1 &&
          row.incidentRiskMultiplierAfter >=
            row.incidentRiskMultiplierBefore,
      ),
    ).toBe(true)
    expect(summary.sourceCoverage.incidents).toBe(
      'consumes_authoritative_incidents_when_available_and_exposes_fatigue_risk',
    )
  })

  it('builds a complete idempotent application-service persistence payload', () => {
    const result = runRaceEngine(createValidInput())
    const contract = result.postStageUpdate.persistenceContract

    expect(contract.requiresOfficialStageFinalization).toBe(true)
    expect(contract.requiresCompleteClassification).toBe(true)
    expect(contract.requiresSynchronizedReplay).toBe(true)
    expect(contract.directDatabaseWritePerformed).toBe(false)
    expect(contract.sourceClassificationComplete).toBe(true)
    expect(contract.sourceReplaySynchronized).toBe(true)
    expect(contract.payloadValid).toBe(true)
    expect(contract.rowCount).toBe(result.postStageUpdate.writeEligibleCount)
    expect(new Set(contract.rows.map((row) => row.writeKey)).size).toBe(
      contract.rows.length,
    )
  })

  it('refuses persistence before finalization and allows the validated handoff afterwards', () => {
    const summary = runRaceEngine(createValidInput()).postStageUpdate
    const before = evaluateUniversalPostStagePersistenceDecision(summary, {
      stageFinalized: false,
      finishResolutionComplete: true,
      replaySynchronized: true,
    })
    const after = evaluateUniversalPostStagePersistenceDecision(summary, {
      stageFinalized: true,
      finishResolutionComplete: true,
      replaySynchronized: true,
    })

    expect(before.allowed).toBe(false)
    expect(before.reasons).toContain('stage_not_finalized')
    expect(after.allowed).toBe(true)
    expect(after.reasons).toEqual([])
  })

  it('keeps database persistence outside the pure universal engine', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toMatch(/supabase\s*\./i)
    expect(source).not.toMatch(/supabase\s*\.\s*from\s*\(/i)
    expect(source).not.toMatch(/\b(insert|update|delete)\s*\(/i)
    expect(source).toContain(
      "activationBoundary: 'existing_application_service_after_stage_finalization'",
    )
  })
})

describe('Combined Phase 7 + Phase 8 engine and UI acceptance audit', () => {
  it('returns one passing acceptance report from the same universal engine result', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const report = result.phase78Acceptance

    expect(report.passed).toBe(true)
    expect(report.source).toBe('single_runRaceEngine_result')
    expect(report.raceId).toBe(input.race.raceId)
    expect(report.stageId).toBe(input.stage.stageId)
    expect(report.riderCount).toBe(input.riders.length)
    expect(report.phase7.replaySynchronized).toBe(true)
    expect(report.phase7.completeBeforePlayback).toBe(true)
    expect(report.phase7.playbackRecalculatesRace).toBe(false)
    expect(report.phase8.updateCount).toBe(input.riders.length)
    expect(report.phase8.payloadValid).toBe(true)
    expect(report.phase8.directDatabaseWritePerformed).toBe(false)
    expect(report.invariants.every((row) => row.passed)).toBe(true)
    expect(report.issues).toEqual([])
  })

  it('proves final replay, classification and fatigue rows describe the same riders', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const result = runRaceEngine(input)
    const report = result.phase78Acceptance
    const classificationByRiderId = new Map(
      result.finishResolution.classification.map(
        (row) => [row.riderId, row] as const,
      ),
    )
    const updateByRiderId = new Map(
      result.postStageUpdate.riderUpdates.map(
        (row) => [row.riderId, row] as const,
      ),
    )

    expect(report.riderRows).toHaveLength(input.riders.length)
    report.riderRows.forEach((row) => {
      const classification = classificationByRiderId.get(row.riderId)
      const update = updateByRiderId.get(row.riderId)

      expect(classification).toBeDefined()
      expect(update).toBeDefined()
      expect(row.finishStatus).toBe(classification!.status)
      expect(row.finishRank).toBe(classification!.rank)
      expect(row.replayFinishStatus).toBe(classification!.status)
      expect(row.replayFinishRank).toBe(classification!.rank)
      expect(row.energySpent).toBe(update!.energySpent)
      expect(row.fatigueBefore).toBe(update!.fatigueBefore)
      expect(row.fatigueGained).toBe(update!.fatigueGained)
      expect(row.fatigueAfter).toBe(update!.fatigueAfter)
      expect(row.recoveryDemand).toBe(update!.recoveryDemand)
      expect(
        Math.abs(row.startEnergy - row.finishEnergy - row.energySpent),
      ).toBeLessThanOrEqual(0.00001)
    })
  })

  it('detects a display-or-output-only energy change that is not backed by the race calculation', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const firstUpdate = result.postStageUpdate.riderUpdates[0]
    const brokenPostStageUpdate = {
      ...result.postStageUpdate,
      riderUpdates: result.postStageUpdate.riderUpdates.map((row) =>
        row.riderId === firstUpdate.riderId
          ? { ...row, energySpent: row.energySpent + 1 }
          : row,
      ),
    }
    const report = buildUniversalPhase78AcceptanceReport(
      input,
      result.finishResolution,
      result.replayTimeline,
      result.replaySynchronization,
      brokenPostStageUpdate,
    )

    expect(report.passed).toBe(false)
    expect(report.issues).toContain('phase8_energy_balance_valid')
  })

  it('passes the combined acceptance contract for every supported stage format', () => {
    const road = createValidInput()
    const individual = withTimeTrialRules(
      withStageFormat(createExpandedFieldInput(8), {
        stageFormat: 'individual_time_trial',
        terrainType: 'individual_time_trial',
        finishType: 'time_trial_finish',
        profileType: 'time_trial',
      }),
      null,
    )
    const prologueBase = withTimeTrialRules(
      withStageFormat(createExpandedFieldInput(8), {
        stageFormat: 'prologue',
        terrainType: 'prologue',
        finishType: 'prologue_finish',
        profileType: 'time_trial',
      }),
      null,
    )
    const prologue: UniversalRaceEngineInput = {
      ...prologueBase,
      stage: {
        ...prologueBase.stage,
        distanceKm: 6,
        profilePoints: [
          { km: 0, elevationM: 10 },
          { km: 6, elevationM: 15 },
        ],
      },
      points: prologueBase.points
        .filter((point) => point.pointType === 'START' || point.isFinishPoint)
        .map((point, index) => ({
          ...point,
          kmFromStart: index === 0 ? 0 : 6,
          sortOrder: index,
        })),
    }
    const team = withTimeTrialRules(
      withStageFormat(createExpandedFieldInput(24), {
        stageFormat: 'team_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      4,
    )
    const pair = withTimeTrialRules(
      withStageFormat(createValidInput(), {
        stageFormat: 'pair_time_trial',
        terrainType: 'team_time_trial',
        finishType: 'team_time_trial_finish',
        profileType: 'time_trial',
      }),
      2,
    )

    ;[
      ['road', road],
      ['individual', individual],
      ['prologue', prologue],
      ['team', team],
      ['pair', pair],
    ].forEach(([label, input]) => {
      try {
        const result = runRaceEngine(input as UniversalRaceEngineInput)

        expect(result.phase78Acceptance.passed).toBe(true)
        expect(result.phase78Acceptance.stageFormat).toBe(
          (input as UniversalRaceEngineInput).stage.stageFormat,
        )
        expect(result.phase78Acceptance.phase7.replaySynchronized).toBe(true)
        expect(result.phase78Acceptance.phase8.updateCount).toBe(
          (input as UniversalRaceEngineInput).riders.length,
        )
        expect(
          result.phase78Acceptance.riderRows
            .filter((row) => row.eligibleToStart)
            .every((row) => row.energySpent > 0),
        ).toBe(true)
      } catch (caught) {
        if (caught instanceof UniversalRaceEngineValidationError) {
          throw new Error(
            `${label}: ${caught.errors
              .map((row) => `${row.field} ${row.message}`)
              .join(' | ')}`,
          )
        }
        throw caught
      }
    })
  })

  it('keeps the replay page on one engine run and exposes a visible downloadable audit', () => {
    const source = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    const replayStart = source.indexOf('function UniversalRaceReplayPage')
    const replayEnd = source.indexOf(
      'function SimpleRaceReplayPage',
      replayStart,
    )
    const replaySource = source.slice(replayStart, replayEnd)
    const runCalls = replaySource.match(/\brunRaceEngine\s*\(/g) ?? []

    expect(replayStart).toBeGreaterThanOrEqual(0)
    expect(replayEnd).toBeGreaterThan(replayStart)
    expect(runCalls).toHaveLength(0)
    expect(replaySource).toContain('result.replayTimeline.checkpoints')
    expect(replaySource).toContain('get_universal_race_stage_replay_payload_v1')
    expect(replaySource).toContain('result.phase78Acceptance')
    expect(replaySource).toContain('Phase 7 + Phase 8 acceptance audit')
    expect(replaySource).toContain('downloadPhase78AcceptanceReport')
    expect(replaySource).toContain('Phase 8 rider updates from the same final race result')
    expect(replaySource).toContain('Report unlocks at finish')
    expect(replaySource).toContain('result.phase9Acceptance')
    expect(replaySource).toContain(
      'Phase 9 weather, preparation and resource audit',
    )
    expect(replaySource).toContain('downloadPhase9AcceptanceReport')
    expect(replaySource).toContain('Phase 9 report unlocks at finish')
    expect(source).toContain('buildUniversalPhase9PreparationInput')
    expect(replaySource).toContain(
      'Equipment, asset and supply usage calculated for this race',
    )
    expect(replaySource).toContain(
      'Rider effects from weather and preparation in the same race result',
    )
    expect(replaySource).not.toContain('buildUniversalReplayFrames')
    expect(replaySource).not.toContain('buildUniversalShadowCommentary')
  })
})



describe('Phase 7 replay continuity and measured chase pacing', () => {
  function createOpeningBreakawayWithLateFrontSelectionInput(): UniversalRaceEngineInput {
    const base = createExpandedFieldInput(18)
    const openingAttackerId = 'expanded-rider-05'
    const lateAttackRiderIds = new Set([
      'expanded-rider-01',
      'expanded-rider-02',
      'expanded-rider-03',
      'expanded-rider-07',
      'expanded-rider-08',
      'expanded-rider-09',
    ])

    return {
      ...base,
      stagePlans: base.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) => ({
          ...riderPlan,
          commands: {
            ...riderPlan.commands,
            phase1:
              riderPlan.riderId === openingAttackerId
                ? 'attack'
                : riderPlan.commands.phase1,
            phase3: lateAttackRiderIds.has(riderPlan.riderId)
              ? 'attack'
              : riderPlan.commands.phase3,
          },
        })),
      })),
      riders: base.riders.map((rider) =>
        rider.riderId === openingAttackerId ||
        lateAttackRiderIds.has(rider.riderId)
          ? {
              ...rider,
              flat: 100,
              climbing: 100,
              endurance: 100,
              resistance: 100,
              raceIQ: 100,
              teamwork: 100,
              morale: 100,
              raceSharpness: 100,
              fatigueBeforeStage: 0,
            }
          : rider,
      ),
    }
  }
  function createOpeningBreakawayWithPhase4BridgeInput(): UniversalRaceEngineInput {
    const base = createExpandedFieldInput(18)
    const openingAttackerId = 'expanded-rider-05'
    const phase4BridgeRiderIds = new Set([
      'expanded-rider-01',
      'expanded-rider-02',
      'expanded-rider-03',
      'expanded-rider-07',
      'expanded-rider-08',
      'expanded-rider-09',
      'expanded-rider-13',
      'expanded-rider-14',
      'expanded-rider-15',
    ])

    return {
      ...base,
      stagePlans: base.stagePlans.map((plan) => ({
        ...plan,
        riders: plan.riders.map((riderPlan) => ({
          ...riderPlan,
          commands: {
            ...riderPlan.commands,
            phase1:
              riderPlan.riderId === openingAttackerId
                ? 'attack'
                : riderPlan.commands.phase1,
            phase3: 'follow_team_plan',
            phase4: phase4BridgeRiderIds.has(riderPlan.riderId)
              ? 'attack'
              : riderPlan.commands.phase4,
          },
        })),
      })),
      riders: base.riders.map((rider) =>
        rider.riderId === openingAttackerId ||
        phase4BridgeRiderIds.has(rider.riderId)
          ? {
              ...rider,
              flat: 100,
              climbing: 96,
              endurance: 100,
              resistance: 100,
              raceIQ: 100,
              teamwork: 95,
              morale: 100,
              raceSharpness: 100,
              fatigueBeforeStage: 0,
            }
          : rider,
      ),
    }
  }


  function createPhase4ChaseInterestInput(
    chasingTeamCount: number,
  ): UniversalRaceEngineInput {
    const base = createExpandedFieldInput(90)
    const openingAttackerId = 'expanded-rider-05'
    const selectedChaseTeamIds = new Set(
      base.teams
        .slice(1, 1 + chasingTeamCount)
        .map((team) => team.teamId),
    )

    return {
      ...base,
      stagePlans: base.stagePlans.map((plan) => ({
        ...plan,
        teamTactic: 'balanced',
        riders: plan.riders.map((riderPlan) => ({
          ...riderPlan,
          stageRole:
            riderPlan.riderId === openingAttackerId
              ? 'breakaway_rider'
              : 'free_role',
          commands: {
            phase1:
              riderPlan.riderId === openingAttackerId ? 'attack' : 'avoid_risks',
            phase2: 'follow_team_plan',
            phase3: 'follow_team_plan',
            phase4: selectedChaseTeamIds.has(plan.teamId)
              ? 'chase_breakaway'
              : 'avoid_risks',
          },
        })),
      })),
      riders: base.riders.map((rider) =>
        rider.riderId === openingAttackerId
          ? {
              ...rider,
              flat: 95,
              endurance: 95,
              resistance: 95,
              raceIQ: 95,
              teamwork: 95,
              morale: 100,
              raceSharpness: 100,
              fatigueBeforeStage: 0,
            }
          : rider,
      ),
    }
  }

  it('preserves Phase 1–4 while keeping a caught field physically together through Phase 5/6', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const phase1 = result.roadRaceResolution.phase1Opening!
    const phase2 = result.roadRaceResolution.phase2Development!
    const phase3 = result.roadRaceResolution.phase3Decisive!
    const phase4 = result.roadRaceResolution.phase4Finish!

    expect({
      phase1: {
        status: phase1.status,
        initialGapSeconds: phase1.initialGapSeconds,
        breakawayRiderIds: phase1.breakawayRiderIds,
      },
      phase2: {
        status: phase2.status,
        startGapSeconds: phase2.startGapSeconds,
        endGapSeconds: phase2.endGapSeconds,
      },
      phase3: {
        status: phase3.status,
        groups: phase3.groups.map((group) => ({
          code: group.groupCode,
          riderIds: group.riderIds,
          gapSeconds: group.gapSeconds,
        })),
      },
      phase4: {
        status: phase4.status,
        startGapSeconds: phase4.startGapSeconds,
        endGapSeconds: phase4.endGapSeconds,
        breakawayCaught: phase4.breakawayCaught,
        chaseSteps: phase4.chaseSteps.map((step) => ({
          kmStart: step.kmStart,
          kmEnd: step.kmEnd,
          startGapSeconds: step.startGapSeconds,
          endGapSeconds: step.endGapSeconds,
        })),
      },
      phase5FinalGroups: result.groupAndTimeResolution.finalGroups.map(
        (group) => ({
          displayCode: group.displayCode,
          gapSeconds: group.gapSeconds,
          riderIds: group.riderIds,
          officialTimeSeconds: group.officialTimeSeconds,
        }),
      ),
      phase6: {
        winnerRiderId: result.finishResolution.winnerRiderId,
        finishMode: result.finishResolution.finishMode,
        classification: result.finishResolution.classification.map((row) => ({
          riderId: row.riderId,
          rank: row.rank,
          status: row.status,
          officialTimeSeconds: row.officialTimeSeconds,
          gapSeconds: row.gapSeconds,
          physicalGroupCode: row.physicalGroupCode,
        })),
      },
      phase8: {
        totalEnergySpent: result.postStageUpdate.totalEnergySpent,
        averageAppliedFatigueGain:
          result.postStageUpdate.averageAppliedFatigueGain,
      },
    }).toEqual({
      phase1: {
        status: 'breakaway_formed',
        initialGapSeconds: 4.073217,
        breakawayRiderIds: ['rider-3'],
      },
      phase2: {
        status: 'organized_chase',
        startGapSeconds: 4.073217,
        endGapSeconds: 131.109235,
      },
      phase3: {
        status: 'front_selection_formed',
        groups: [
          {
            code: 'front_group',
            riderIds: ['rider-3'],
            gapSeconds: 0,
          },
          {
            code: 'dropped_group',
            riderIds: ['rider-1', 'rider-2', 'rider-4'],
            gapSeconds: 131.109235,
          },
        ],
      },
      phase4: {
        status: 'breakaway_caught',
        startGapSeconds: 131.109235,
        endGapSeconds: 0,
        breakawayCaught: true,
        chaseSteps: [
          {
            kmStart: 87.6,
            kmEnd: 92.6,
            startGapSeconds: 131.109235,
            endGapSeconds: 103.60924,
          },
          {
            kmStart: 92.6,
            kmEnd: 97.6,
            startGapSeconds: 103.60924,
            endGapSeconds: 77.475142,
          },
          {
            kmStart: 97.6,
            kmEnd: 102.6,
            startGapSeconds: 77.475142,
            endGapSeconds: 53.518885,
          },
          {
            kmStart: 102.6,
            kmEnd: 107.6,
            startGapSeconds: 53.518885,
            endGapSeconds: 31.558983,
          },
          {
            kmStart: 107.6,
            kmEnd: 112.6,
            startGapSeconds: 31.558983,
            endGapSeconds: 11.429073,
          },
          {
            kmStart: 112.6,
            kmEnd: 117.6,
            startGapSeconds: 11.429073,
            endGapSeconds: 0,
          },
          {
            kmStart: 117.6,
            kmEnd: 120,
            startGapSeconds: 0,
            endGapSeconds: 0,
          },
        ],
      },
      phase5FinalGroups: [
        {
          displayCode: 'P',
          gapSeconds: 0,
          riderIds: ['rider-3', 'rider-1', 'rider-2', 'rider-4'],
          officialTimeSeconds: 10286,
        },
      ],
      phase6: {
        winnerRiderId: 'rider-3',
        finishMode: 'reduced_group_sprint',
        classification: [
          {
            riderId: 'rider-3',
            rank: 1,
            status: 'finished',
            officialTimeSeconds: 10286,
            gapSeconds: 0,
            physicalGroupCode: 'main_peloton',
          },
          {
            riderId: 'rider-1',
            rank: 2,
            status: 'finished',
            officialTimeSeconds: 10286,
            gapSeconds: 0,
            physicalGroupCode: 'main_peloton',
          },
          {
            riderId: 'rider-2',
            rank: 3,
            status: 'finished',
            officialTimeSeconds: 10286,
            gapSeconds: 0,
            physicalGroupCode: 'main_peloton',
          },
          {
            riderId: 'rider-4',
            rank: 4,
            status: 'finished',
            officialTimeSeconds: 10286,
            gapSeconds: 0,
            physicalGroupCode: 'main_peloton',
          },
        ],
      },
      phase8: {
        totalEnergySpent: 145.855787,
        averageAppliedFatigueGain: 8.834232,
      },
    })
  })

  it('uses one identical physical state for every checkpoint at the same kilometre', () => {
    const timeline = runRaceEngine(
      createSuccessfulOpeningEscapeInput(),
    ).replayTimeline
    const byKilometre = new Map<number, typeof timeline.checkpoints>()

    timeline.checkpoints.forEach((checkpoint) => {
      const existing = byKilometre.get(
        checkpoint.raceProgress.kmFromStart,
      ) ?? []
      byKilometre.set(
        checkpoint.raceProgress.kmFromStart,
        [...existing, checkpoint],
      )
    })

    byKilometre.forEach((checkpoints) => {
      const physicalStates = checkpoints.map((checkpoint) =>
        JSON.stringify({
          groups: checkpoint.groups,
          gaps: checkpoint.gaps.map((gap) => ({
            groupCode: gap.groupCode,
            displayCode: gap.displayCode,
            gapSeconds: gap.gapSeconds,
          })),
        }),
      )
      expect(new Set(physicalStates).size).toBe(1)
    })
  })

  it('keeps the phase-boundary point checkpoint on the same physical gap as the base checkpoint', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const boundaryKm =
      result.roadRaceResolution.phase2Development!.phaseBoundary.endKm
    const checkpoints = result.replayTimeline.checkpoints.filter(
      (checkpoint) =>
        checkpoint.raceProgress.kmFromStart === boundaryKm,
    )

    expect(checkpoints.length).toBeGreaterThanOrEqual(2)
    expect(
      new Set(
        checkpoints.map((checkpoint) =>
          JSON.stringify({
            groups: checkpoint.groups,
            gaps: checkpoint.gaps,
          }),
        ),
      ).size,
    ).toBe(1)
    expect(
      checkpoints[0].gaps.find((gap) => gap.displayCode === 'P')
        ?.gapSeconds,
    ).toBe(90)
  })

  it('uses the stored Phase 4 chase-step path at sprint and KOM checkpoints instead of a phase snapshot', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const komCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.commentary[0]?.eventType === 'kom',
    )!
    const pelotonGap = komCheckpoint.gaps.find(
      (gap) => gap.displayCode === 'P',
    )?.gapSeconds

    expect(
      komCheckpoint.groups.some((group) =>
        group.displayCode.startsWith('B'),
      ),
    ).toBe(true)
    expect(pelotonGap).toBeGreaterThan(104.247796)
    expect(pelotonGap).toBeLessThan(131.109235)
  })

  it('never exposes internal phase labels or decimal-second values in player commentary', () => {
    const timeline = runRaceEngine(
      createSuccessfulOpeningEscapeInput(),
    ).replayTimeline
    const commentaryText = timeline.checkpoints
      .flatMap((checkpoint) => checkpoint.commentary)
      .map((entry) => `${entry.title} ${entry.description}`)
      .join('\n')

    expect(commentaryText).not.toMatch(/\bphase\s+[1-9]\b/i)
    expect(commentaryText).not.toMatch(
      /\d+\.\d+\s*(?:-\s*)?seconds?/i,
    )
    expect(commentaryText).not.toContain('End of Phase')
  })

  it('adds regular race-situation commentary instead of only major events', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const statusEntries = result.replayTimeline.checkpoints.filter(
      (checkpoint) =>
        checkpoint.commentary[0]?.eventType === 'race_status',
    )

    expect(statusEntries.length).toBeGreaterThanOrEqual(12)
    expect(result.replayTimeline.checkpoints.length).toBeGreaterThanOrEqual(25)
  })

  it('keeps the caught front group gone and stops chase commentary after the catch', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const catchIndex = result.replayTimeline.checkpoints.findIndex(
      (checkpoint) =>
        checkpoint.commentary[0]?.eventType === 'catch',
    )

    expect(catchIndex).toBeGreaterThanOrEqual(0)
    result.replayTimeline.checkpoints
      .slice(catchIndex + 1)
      .forEach((checkpoint) => {
        expect(
          checkpoint.groups.some(
            (group) =>
              group.displayCode.startsWith('B') ||
              group.displayCode.startsWith('F'),
          ),
        ).toBe(false)
        expect(
          checkpoint.commentary.some(
            (entry) => entry.eventType === 'late_chase',
          ),
        ).toBe(false)
      })
  })

  it('animates whole-second gaps while the same physical group identity remains active', () => {
    const source = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    const replayStart = source.indexOf('function UniversalRaceReplayPage')
    const replayEnd = source.indexOf(
      'function SimpleRaceReplayPage',
      replayStart,
    )
    const replaySource = source.slice(replayStart, replayEnd)

    expect(source).toContain('haveSameUniversalReplayGroupLineage')
    expect(source).toContain('interpolateStableUniversalReplayGapSeconds')
    expect(replaySource).toContain('nextFrame.riderStates')
    expect(replaySource).toContain('stableGroupLineage')
    expect(replaySource).toContain('behindPelotonGapLineage')
    expect(replaySource).toContain('framePair.fraction')
    expect(replaySource).toContain(
      "liveGapDisplayMode: 'autonomous_incident_group_interpolation_with_exact_phase10_events'",
    )
    expect(replaySource).toContain('bridgeSequencesPhysicallyValid')
    expect(replaySource).toContain('bridgeLifecycle')
    expect(replaySource).toContain('frontStrengthRecalculatedAfterBridge')
    expect(replaySource).toContain('currentState?.energy ??')
    expect(replaySource).not.toContain('nextState?.energy')
  })

  it('spreads a moderate late catch across the remaining road instead of closing the gap immediately', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const result = runRaceEngine(input)
    const phase4 = result.roadRaceResolution.phase4Finish!
    const closingSteps = phase4.chaseSteps.filter(
      (step) => step.endGapSeconds < step.startGapSeconds,
    )

    expect(phase4.breakawayCaught).toBe(true)
    expect(closingSteps.length).toBeGreaterThanOrEqual(5)
    closingSteps.forEach((step) => {
      const distanceKm = step.kmEnd - step.kmStart
      const closurePerKm =
        (step.startGapSeconds - step.endGapSeconds) /
        Math.max(0.000001, distanceKm)
      expect(closurePerKm).toBeLessThanOrEqual(5.5)
    })

    const catchStep = closingSteps.find(
      (step) => step.endGapSeconds === 0,
    )!
    expect(catchStep.kmEnd / input.stage.distanceKm).toBeGreaterThanOrEqual(
      0.95,
    )
  })

  it('announces clearly when the main group increases its pace to chase the breakaway', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const chaseEntry = result.replayTimeline.checkpoints
      .flatMap((checkpoint) => checkpoint.commentary)
      .find((entry) => entry.eventType === 'late_chase')

    expect(chaseEntry).toBeDefined()
    expect(chaseEntry?.title).toBe('The peloton increases the pace')
    expect(chaseEntry?.description).toContain(
      'The main group speeds up and begins an organized chase',
    )
  })

  it('keeps the original opening-breakaway riders unchanged until the physical catch', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const checkpoints = result.replayTimeline.checkpoints
    const formationIndex = checkpoints.findIndex((checkpoint) =>
      checkpoint.commentary.some(
        (entry) => entry.eventType === 'breakaway_formation',
      ),
    )
    const catchIndex = checkpoints.findIndex((checkpoint) =>
      checkpoint.commentary.some((entry) => entry.eventType === 'catch'),
    )
    const formationGroup = checkpoints[formationIndex].groups.find((group) =>
      group.displayCode.startsWith('B'),
    )!
    const expectedRiderIds = [...formationGroup.riderIds].sort()

    expect(formationIndex).toBeGreaterThanOrEqual(0)
    expect(catchIndex).toBeGreaterThan(formationIndex)
    checkpoints
      .slice(formationIndex, catchIndex)
      .filter((checkpoint) => !checkpoint.finalResultsVisible)
      .forEach((checkpoint) => {
        const breakawayGroups = checkpoint.groups.filter((group) =>
          group.displayCode.startsWith('B'),
        )
        expect(breakawayGroups).toHaveLength(1)
        expect([...breakawayGroups[0].riderIds].sort()).toEqual(
          expectedRiderIds,
        )
      })
  })

  it('keeps bridge attackers separate until they physically reach and strengthen the opening breakaway', () => {
    const result = runRaceEngine(
      createOpeningBreakawayWithLateFrontSelectionInput(),
    )
    const phase4 = result.roadRaceResolution.phase4Finish!
    const bridge = phase4.bridgeGroups[0]
    const bridgeAttackCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.commentary.some(
          (entry) => entry.eventType === 'bridge_attack',
        ),
    )!
    const bridgeMergeCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        checkpoint.commentary.some(
          (entry) => entry.eventType === 'bridge_merge',
        ),
    )!
    const bridgeGroupAtLaunch = bridgeAttackCheckpoint.groups.find((group) =>
      group.displayCode.startsWith('F'),
    )!
    const openingGroupAtLaunch = bridgeAttackCheckpoint.groups.find((group) =>
      group.displayCode.startsWith('B'),
    )!
    const pelotonAtLaunch = bridgeAttackCheckpoint.groups.find(
      (group) => group.displayCode === 'P',
    )!
    const mergedOpeningGroup = bridgeMergeCheckpoint.groups.find((group) =>
      group.displayCode.startsWith('B'),
    )!

    expect(bridge).toBeDefined()
    expect(bridge.mergedIntoOpeningBreakaway).toBe(true)
    expect(bridge.mergeKm).toBeGreaterThan(bridge.launchKm)
    expect(bridgeGroupAtLaunch.riderIds.length).toBeGreaterThan(0)
    expect(
      bridgeGroupAtLaunch.riderIds.some((riderId) =>
        openingGroupAtLaunch.riderIds.includes(riderId),
      ),
    ).toBe(false)
    expect(
      bridgeGroupAtLaunch.riderIds.some((riderId) =>
        pelotonAtLaunch.riderIds.includes(riderId),
      ),
    ).toBe(false)
    expect(
      bridgeMergeCheckpoint.groups.some((group) =>
        group.displayCode.startsWith('F'),
      ),
    ).toBe(false)
    expect([...mergedOpeningGroup.riderIds].sort()).toEqual(
      Array.from(
        new Set([
          ...openingGroupAtLaunch.riderIds,
          ...bridgeGroupAtLaunch.riderIds,
        ]),
      ).sort(),
    )
    expect(
      bridgeMergeCheckpoint.groups
        .find((group) => group.displayCode === 'P')
        ?.riderIds.some((riderId) =>
          bridgeGroupAtLaunch.riderIds.includes(riderId),
        ),
    ).toBe(false)
    expect(phase4.frontStrengthRecalculatedAfterBridge).toBe(true)
    expect(phase4.frontRiderIdsAfterBridges.length).toBe(
      phase4.escapeRiderIdsAtStart.length + bridge.riderIds.length,
    )
    bridge.energyCostByRider.forEach((row) => {
      expect(row.energyCost).toBeGreaterThan(0)
      expect(
        phase4.riderStates.find((state) => state.riderId === row.riderId)
          ?.bridgeEnergyCost,
      ).toBe(row.energyCost)
    })
    for (let index = 1; index < bridge.gapSamples.length; index += 1) {
      expect(
        bridge.gapSamples[index].gapToLeaderSeconds,
      ).toBeLessThanOrEqual(
        bridge.gapSamples[index - 1].gapToLeaderSeconds,
      )
    }
    expect(result.replaySynchronization.openingBreakawayLineageStable).toBe(
      true,
    )
    expect(
      result.replaySynchronization.allFrontGroupTransfersPhysicallyValid,
    ).toBe(true)
    expect(
      result.replaySynchronization.allBridgeSequencesPhysicallyValid,
    ).toBe(true)
  })

  it('creates a late bridge from the peloton while the overall peloton gap continues its own chase path', () => {
    const result = runRaceEngine(createOpeningBreakawayWithPhase4BridgeInput())
    const phase4 = result.roadRaceResolution.phase4Finish!
    const bridge = phase4.bridgeGroups[0]

    expect(bridge).toBeDefined()
    expect(bridge.launchGapToLeaderSeconds).toBeGreaterThan(
      PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    )
    expect(bridge.launchGapToPelotonSeconds).toBeGreaterThanOrEqual(0)
    expect(bridge.mergedIntoOpeningBreakaway).toBe(true)
    expect(bridge.mergeKm).not.toBeNull()
    expect(phase4.frontRiderIdsAfterBridges.length).toBe(
      phase4.escapeRiderIdsAtStart.length + bridge.riderIds.length,
    )
    expect(phase4.frontStrengthRecalculatedAfterBridge).toBe(true)
    bridge.energyCostByRider.forEach((row) => {
      expect(row.energyCost).toBeGreaterThan(0)
    })
    const finalBridgeSample = bridge.gapSamples.at(-1)!
    expect(finalBridgeSample.gapToLeaderSeconds).toBe(0)
    expect(finalBridgeSample.gapToPelotonSeconds).toBeGreaterThan(
      bridge.launchGapToPelotonSeconds,
    )

    const stepsWithBridge = phase4.chaseSteps.filter(
      (step) =>
        step.bridgeStartGapToLeaderSeconds !== null ||
        step.bridgeMergedIntoFront,
    )
    expect(stepsWithBridge.length).toBeGreaterThan(0)
    stepsWithBridge.forEach((step) => {
      if (
        step.bridgeStartGapToLeaderSeconds !== null &&
        step.bridgeEndGapToLeaderSeconds !== null
      ) {
        expect(step.bridgeEndGapToLeaderSeconds).toBeLessThanOrEqual(
          step.bridgeStartGapToLeaderSeconds,
        )
      }
      expect(step.endGapSeconds).toBeLessThanOrEqual(
        step.startGapSeconds + 2,
      )
    })

    const mergeStepIndex = phase4.chaseSteps.findIndex(
      (step) => step.bridgeMergedIntoFront,
    )
    expect(mergeStepIndex).toBeGreaterThanOrEqual(0)
    const preMergeStep = phase4.chaseSteps[mergeStepIndex]
    expect(preMergeStep.bridgeStartGapToLeaderSeconds).toBeGreaterThan(
      PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    )
    expect(preMergeStep.bridgeEndGapToLeaderSeconds).toBe(0)
    expect(preMergeStep.bridgeEndGapToPelotonSeconds!).toBeGreaterThan(
      preMergeStep.bridgeStartGapToPelotonSeconds!,
    )
    expect(preMergeStep.endGapSeconds).toBeLessThanOrEqual(
      preMergeStep.startGapSeconds,
    )
    const firstPostMergeStep = phase4.chaseSteps[mergeStepIndex + 1]
    if (firstPostMergeStep) {
      const preMergeClosurePerKm =
        (preMergeStep.startGapSeconds - preMergeStep.endGapSeconds) /
        Math.max(0.000001, preMergeStep.kmEnd - preMergeStep.kmStart)
      const postMergeClosurePerKm =
        (firstPostMergeStep.startGapSeconds -
          firstPostMergeStep.endGapSeconds) /
        Math.max(
          0.000001,
          firstPostMergeStep.kmEnd - firstPostMergeStep.kmStart,
        )
      expect(postMergeClosurePerKm).toBeLessThan(preMergeClosurePerKm)
    }
  })

  it('starts the final chase from the persistent opening breakaway rather than the decisive front selection', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())
    const phase2 = result.roadRaceResolution.phase2Development!
    const phase4 = result.roadRaceResolution.phase4Finish!

    expect([...phase4.escapeRiderIdsAtStart].sort()).toEqual(
      [...phase2.breakawayRiderIdsAtEnd].sort(),
    )
    const storedPhase3PelotonGap =
      result.groupAndTimeResolution.phaseGroups.find(
        (group) => group.phaseNumber === 3 && group.displayCode === 'P',
      )?.gapSeconds ?? 0
    expect(
      Math.abs(phase4.startGapSeconds - storedPhase3PelotonGap),
    ).toBeLessThanOrEqual(1)
  })

  it('rejects riders teleporting into the opening breakaway across a non-zero gap', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const result = runRaceEngine(input)
    const targetIndex = result.replayTimeline.checkpoints.findIndex(
      (checkpoint) =>
        checkpoint.commentary.some(
          (entry) => entry.eventType === 'late_chase',
        ) &&
        checkpoint.groups.some((group) => group.displayCode.startsWith('B')) &&
        checkpoint.groups.some((group) => group.displayCode === 'P'),
    )
    const target = result.replayTimeline.checkpoints[targetIndex]
    const breakaway = target.groups.find((group) =>
      group.displayCode.startsWith('B'),
    )!
    const peloton = target.groups.find((group) => group.displayCode === 'P')!
    const teleportedRiderId = peloton.riderIds[0]
    const mutatedCheckpoint = {
      ...target,
      groups: target.groups.map((group) =>
        group === breakaway
          ? {
              ...group,
              riderIds: [...group.riderIds, teleportedRiderId].sort(),
            }
          : group === peloton
            ? {
                ...group,
                riderIds: group.riderIds.filter(
                  (riderId) => riderId !== teleportedRiderId,
                ),
              }
            : group,
      ),
      riderStates: target.riderStates.map((row) =>
        row.riderId === teleportedRiderId
          ? {
              ...row,
              groupCode: breakaway.groupCode,
              displayCode: breakaway.displayCode,
              gapSeconds: breakaway.gapSeconds,
            }
          : row,
      ),
    }
    const replayTimeline = {
      ...result.replayTimeline,
      checkpoints: result.replayTimeline.checkpoints.map(
        (checkpoint, index) =>
          index === targetIndex ? mutatedCheckpoint : checkpoint,
      ),
    }
    const summary = buildUniversalReplaySynchronizationSummary(
      input,
      result.riderReadiness,
      result.roadCommandResolution,
      result.intermediatePointFinalization,
      result.groupAndTimeResolution,
      result.finishResolution,
      result.phase10Incidents,
      replayTimeline,
    )

    expect(summary.synchronized).toBe(false)
    expect(summary.openingBreakawayLineageStable).toBe(false)
    expect(summary.allFrontGroupTransfersPhysicallyValid).toBe(false)
    expect(
      summary.issues.some((issue) =>
        issue.startsWith('opening_breakaway_lineage_changed'),
      ),
    ).toBe(true)
    expect(
      summary.issues.some((issue) =>
        issue.startsWith('front_group_transfer_without_physical_transition:'),
      ),
    ).toBe(true)
  })

  it('rejects a large breakaway-gap collapse that is not supported by travelled distance', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const result = runRaceEngine(input)
    const checkpoints = result.replayTimeline.checkpoints
    const targetIndex = checkpoints.findIndex((checkpoint, index) => {
      if (index === 0 || checkpoint.finalResultsVisible) return false
      const previous = checkpoints[index - 1]
      const previousBreakaway = previous.groups.find((group) =>
        group.displayCode.startsWith('B'),
      )
      const currentBreakaway = checkpoint.groups.find((group) =>
        group.displayCode.startsWith('B'),
      )
      const previousPelotonGap = previous.gaps.find(
        (gap) => gap.displayCode === 'P',
      )?.gapSeconds
      return (
        previousBreakaway !== undefined &&
        currentBreakaway !== undefined &&
        JSON.stringify([...previousBreakaway.riderIds].sort()) ===
          JSON.stringify([...currentBreakaway.riderIds].sort()) &&
        previousPelotonGap !== undefined &&
        previousPelotonGap > 40 &&
        checkpoint.raceProgress.kmFromStart -
          previous.raceProgress.kmFromStart > 1
      )
    })
    const target = checkpoints[targetIndex]
    const collapsedGapSeconds = 10
    const mutatedCheckpoint = {
      ...target,
      groups: target.groups.map((group) =>
        group.displayCode === 'P'
          ? { ...group, gapSeconds: collapsedGapSeconds }
          : group,
      ),
      gaps: target.gaps.map((gap) =>
        gap.displayCode === 'P'
          ? { ...gap, gapSeconds: collapsedGapSeconds }
          : gap,
      ),
      riderStates: target.riderStates.map((row) =>
        row.displayCode === 'P'
          ? { ...row, gapSeconds: collapsedGapSeconds }
          : row,
      ),
    }
    const replayTimeline = {
      ...result.replayTimeline,
      checkpoints: checkpoints.map((checkpoint, index) =>
        index === targetIndex ? mutatedCheckpoint : checkpoint,
      ),
    }
    const summary = buildUniversalReplaySynchronizationSummary(
      input,
      result.riderReadiness,
      result.roadCommandResolution,
      result.intermediatePointFinalization,
      result.groupAndTimeResolution,
      result.finishResolution,
      result.phase10Incidents,
      replayTimeline,
    )

    expect(summary.synchronized).toBe(false)
    expect(summary.allGapChangesDistanceBounded).toBe(false)
    expect(
      summary.issues.some((issue) =>
        issue.startsWith('gap_change_not_distance_bounded:'),
      ),
    ).toBe(true)
  })

  it('lets a genuinely uninterested peloton allow the breakaway gap to grow instead of creating a magic Phase 4 chase', () => {
    const result = runRaceEngine(createPhase4ChaseInterestInput(0))
    const phase4 = result.roadRaceResolution.phase4Finish!

    expect(phase4.chaseSteps.length).toBeGreaterThan(0)
    expect(
      phase4.chaseSteps.every(
        (step) => step.responseMode === 'uninterested_peloton',
      ),
    ).toBe(true)
    expect(phase4.breakawayCaught).toBe(false)
    expect(phase4.endGapSeconds).toBeGreaterThan(phase4.startGapSeconds)
    expect(
      phase4.chaseSteps.every(
        (step) =>
          step.explicitChasingTeamCount === 0 &&
          step.automaticChasingTeamCount === 0,
      ),
    ).toBe(true)
  })

  it('makes larger explicit chase coalitions stronger after four teams with diminishing returns', () => {
    const four = runRaceEngine(createPhase4ChaseInterestInput(4))
      .roadRaceResolution.phase4Finish!
    const six = runRaceEngine(createPhase4ChaseInterestInput(6))
      .roadRaceResolution.phase4Finish!
    const ten = runRaceEngine(createPhase4ChaseInterestInput(10))
      .roadRaceResolution.phase4Finish!
    const maxPace = (phase4: typeof four) =>
      Math.max(...phase4.chaseSteps.map((step) => step.effectivePelotonPaceKmh))

    const pace4 = maxPace(four)
    const pace6 = maxPace(six)
    const pace10 = maxPace(ten)
    expect(pace6).toBeGreaterThan(pace4)
    expect(pace10).toBeGreaterThan(pace6)
    expect((pace6 - pace4) / 2).toBeGreaterThan((pace10 - pace6) / 4)
    expect(
      Math.max(...ten.chaseSteps.map((step) => step.explicitChasingTeamCount)),
    ).toBeGreaterThanOrEqual(10)
  })

  it('publishes the new physical-continuity checks in the synchronization and acceptance reports', () => {
    const result = runRaceEngine(createSuccessfulOpeningEscapeInput())

    expect(result.replaySynchronization.allSameKilometreStatesConsistent).toBe(
      true,
    )
    expect(result.replaySynchronization.allGapChangesDistanceBounded).toBe(
      true,
    )
    expect(result.replaySynchronization.openingBreakawayLineageStable).toBe(
      true,
    )
    expect(
      result.replaySynchronization.allFrontGroupTransfersPhysicallyValid,
    ).toBe(true)
    expect(
      result.replaySynchronization.allBridgeSequencesPhysicallyValid,
    ).toBe(true)
    expect(result.replaySynchronization.allCommentaryPhaseNeutral).toBe(true)
    expect(
      result.replaySynchronization.allCommentaryWholeSecondFormatting,
    ).toBe(true)
    expect(result.replaySynchronization.postCatchStateStable).toBe(true)
    expect(result.phase78Acceptance.phase7.sameKilometreStatesConsistent).toBe(
      true,
    )
    expect(result.phase78Acceptance.phase7.gapChangesDistanceBounded).toBe(
      true,
    )
    expect(
      result.phase78Acceptance.phase7.openingBreakawayLineageStable,
    ).toBe(true)
    expect(
      result.phase78Acceptance.phase7.frontGroupTransfersPhysicallyValid,
    ).toBe(true)
    expect(
      result.phase78Acceptance.phase7.bridgeSequencesPhysicallyValid,
    ).toBe(true)
    expect(result.phase78Acceptance.phase7.commentaryPhaseNeutral).toBe(true)
    expect(
      result.phase78Acceptance.phase7.commentaryWholeSecondFormatting,
    ).toBe(true)
    expect(result.phase78Acceptance.phase7.postCatchStateStable).toBe(true)
  })
})

  it('publishes a real split before a non-opening Phase 4 front group can appear', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain("checkpointIdSuffix: 'late-front-selection-formed'")
    expect(source).toContain("title: 'A front group forms under pressure'")
    expect(source).toContain('nonOpeningFrontGapAtKm')
    expect(source).toContain('decisiveFrontTransferRiderIds')
    expect(source).toContain("preDecisiveGroupByRiderId.get(riderId) === 'P'")
    expect(source).toContain("decisiveGroupByRiderId.get(riderId)?.startsWith('F')")
    expect(source).not.toContain(
      "(openingFormationCheckpointIndex < 0 && eventTypes.has('late_chase'))",
    )
  })

  it('publishes late climbing attrition as an engine-owned replay split instead of a finish-only rewrite', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('late-terrain-contact-loss-')
    expect(source).toContain("title: 'Riders crack on the climb'")
    expect(source).toContain('applyPhase4ContactLossToGroups')
    expect(source).toContain('row.contactLossKm')
  })

  it('keeps the catch state separate from any later finishing-group split', () => {
    const source = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('normalizeReplayGroups(buildPhase4ChaseGroups(catchKm, 0))')
    expect(source).toContain("checkpointIdSuffix: 'post-catch-peloton-split'")
    expect(source).toContain("title: 'The peloton splits under late pressure'")
    expect(source).toContain('buildPostCatchEvolutionGroups')
    expect(source).toContain(
      'post_catch_group_transfer_without_physical_transition',
    )
    expect(source).not.toContain(
      'const buildCaughtGroups = (): readonly UniversalPhase5GroupSnapshot[] =>\n    finalGroups.map',
    )
  })


describe('Phase 9 unified weather, preparation and resource modifiers', () => {
  it('keeps neutral Phase 9 input on the existing universal calculation path', () => {
    const base = createValidInput()
    const explicitNeutral: UniversalRaceEngineInput = {
      ...base,
      preparation: {
        ...base.preparation,
        standardizedBonuses: {
          teams: {
            'team-a': {},
            'team-b': {},
          },
        },
      },
    }

    const implicit = runRaceEngine(base)
    const explicit = runRaceEngine(explicitNeutral)

    expect(explicit.phase9Modifiers.singleCalculationPath).toBe(true)
    expect(explicit.riderSuitability).toEqual(implicit.riderSuitability)
    expect(explicit.roadRaceResolution).toEqual(implicit.roadRaceResolution)
    expect(explicit.finishResolution).toEqual(implicit.finishResolution)
    expect(explicit.postStageUpdate).toEqual(implicit.postStageUpdate)
  })

  it('treats omitted weather and preparation as exact neutral Phase 9 input', () => {
    const incomplete = { ...createValidInput() } as Partial<UniversalRaceEngineInput>
    delete incomplete.weather
    delete incomplete.preparation

    const result = runRaceEngine(incomplete as UniversalRaceEngineInput)

    expect(result.phase9Modifiers.weather).toEqual({
      speedMultiplier: 1,
      energyCostMultiplier: 1,
      fatigueMultiplier: 1,
      breakawaySurvivalMultiplier: 1,
      incidentRiskMultiplier: 1,
      severe: false,
    })
    expect(result.phase9Modifiers.resourceUpdates).toEqual([])
    expect(
      result.phase9Modifiers.teams.every(
        (team) =>
          team.performanceBonusPoints === 0 &&
          team.speedMultiplier === 1 &&
          team.energyCostMultiplier === 1 &&
          team.fatigueMultiplier === 1 &&
          team.breakawaySurvivalMultiplier === 1 &&
          team.incidentRiskMultiplier === 1 &&
          team.recoveryBonusPoints === 0 &&
          team.tacticalSupportPoints === 0 &&
          team.reliabilitySupportPoints === 0,
      ),
    ).toBe(true)
  })

  it('applies severe heat and headwind through capped weather modifiers', () => {
    const input = createSuccessfulOpeningEscapeInput()
    const severe: UniversalRaceEngineInput = {
      ...input,
      weather: {
        ...input.weather,
        condition: 'strong_headwind',
        temperatureC: 39,
        windKmh: 65,
        snapshot: { headwindPct: 100 },
      },
    }

    const neutralResult = runRaceEngine(input)
    const severeResult = runRaceEngine(severe)

    expect(severeResult.phase9Modifiers.weather.energyCostMultiplier).toBeGreaterThan(1)
    expect(severeResult.phase9Modifiers.weather.fatigueMultiplier).toBeGreaterThan(1)
    expect(severeResult.phase9Modifiers.weather.speedMultiplier).toBeLessThan(1)
    expect(severeResult.phase9Modifiers.weather.breakawaySurvivalMultiplier).toBeLessThan(1)
    expect(severeResult.postStageUpdate.totalEnergySpent).toBeGreaterThan(
      neutralResult.postStageUpdate.totalEnergySpent,
    )
  })

  it('caps combined equipment, supply, asset and staff bonuses', () => {
    const input = createValidInput()
    const modified: UniversalRaceEngineInput = {
      ...input,
      preparation: {
        ...input.preparation,
        standardizedBonuses: {
          teams: {
            'team-a': {
              equipmentPerformanceBonusPoints: 20,
              equipmentSuitabilityBonusPoints: 20,
              supplySupportPoints: 20,
              assetSupportPoints: 20,
              staffSupportPoints: 20,
              tacticalSupportPoints: 20,
              reliabilitySupportPoints: 20,
              energySavingPct: 90,
              fatigueReductionPct: 90,
              recoveryBonusPoints: 20,
            },
          },
        },
      },
    }

    const summary = buildUniversalPhase9ModifierSummary(modified)
    const team = summary.teams.find((row) => row.teamId === 'team-a')

    expect(team?.performanceBonusPoints).toBe(5)
    expect(team?.speedMultiplier).toBeLessThanOrEqual(1.03)
    expect(team?.energyCostMultiplier).toBeGreaterThanOrEqual(0.88)
    expect(team?.fatigueMultiplier).toBeGreaterThanOrEqual(0.9)
    expect(team?.recoveryBonusPoints).toBe(4)
    expect(team?.incidentRiskMultiplier).toBeGreaterThanOrEqual(0.7)
  })

  it('returns deterministic supply use and equipment and asset condition updates', () => {
    const input = createValidInput()
    const prepared: UniversalRaceEngineInput = {
      ...input,
      preparation: {
        ...input.preparation,
        equipment: {
          bike: {
            teamId: 'team-a',
            condition: 80,
            intensity: 0.5,
          },
        },
        raceSupplies: {
          hydration: {
            teamId: 'team-a',
            quantity: 4,
            selectedQuantity: 6,
          },
        },
        assets: {
          service_vehicle: {
            teamId: 'team-a',
            condition: 70,
            intensity: 1,
          },
        },
      },
    }

    const first = runRaceEngine(prepared)
    const second = runRaceEngine(prepared)
    const hydration = first.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'hydration',
    )
    const bike = first.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'bike',
    )
    const vehicle = first.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'service_vehicle',
    )

    expect(first).toEqual(second)
    expect(hydration).toMatchObject({
      quantityBefore: 4,
      quantityUsed: 4,
      quantityAfter: 0,
      shortageApplied: true,
    })
    expect(bike?.conditionAfter).toBeLessThan(80)
    expect(vehicle?.conditionAfter).toBeLessThan(70)
  })

  it('uses the catalog equipment wear rate scaled by stage distance', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      preparation: {
        ...base.preparation,
        equipment: {
          exact_wear_item: {
            teamId: 'team-a',
            condition: 80,
            conditionLossPerRaceDay: 2.4,
            intensity: 1,
          },
        },
      },
    })
    const update = result.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'exact_wear_item',
    )
    const expectedLoss = (base.stage.distanceKm / 100) * 2.4

    expect(update?.conditionUsed).toBeCloseTo(expectedLoss, 6)
    expect(update?.conditionAfter).toBeCloseTo(80 - expectedLoss, 6)
  })

  it('uses the configured asset wear rate with the authoritative distance clamp', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      preparation: {
        ...base.preparation,
        assets: {
          exact_asset_wear: {
            teamId: 'team-a',
            condition: 70,
            conditionLossPerRaceDay: 1.25,
            intensity: 1,
          },
        },
      },
    })
    const update = result.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'exact_asset_wear',
    )
    const distanceFactor = Math.min(
      1.6,
      Math.max(0.6, base.stage.distanceKm / 120),
    )
    const expectedLoss = Math.min(2.5, Math.max(0.05, 1.25 * distanceFactor))

    expect(update?.conditionUsed).toBeCloseTo(expectedLoss, 6)
    expect(update?.conditionAfter).toBeCloseTo(70 - expectedLoss, 6)
  })

  it('calculates one Race Jersey durable use without consuming the reusable unit as quantity', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      preparation: {
        ...base.preparation,
        raceSupplies: {
          'durable:jersey-1': {
            teamId: 'team-a',
            riderId: 'rider-1',
            resourceKind: 'durable_supply_unit',
            supplyKey: 'race_jersey_complete',
            stageUsesRemaining: 10,
            maxStageUses: 10,
            selectedStageUses: 1,
          },
        },
      },
    })
    const update = result.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'durable:jersey-1',
    )

    expect(update).toMatchObject({
      quantityBefore: null,
      quantityUsed: null,
      quantityAfter: null,
      stageUsesBefore: 10,
      stageUsesUsed: 1,
      stageUsesAfter: 9,
      maxStageUses: 10,
      shortageApplied: false,
    })
    expect(
      result.phase9Acceptance.resourceUpdateSummary
        .durableSupplyUseUpdatesCalculated,
    ).toBe(1)
  })

  it('applies the rain-jacket efficiency penalty and durability use even in good weather', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      weather: {
        ...base.weather,
        condition: 'clear',
        temperatureC: 20,
        precipitationMm: 0,
        rainProbabilityPct: 0,
      },
      preparation: {
        ...base.preparation,
        raceSupplies: {
          'durable:jacket-1': {
            teamId: 'team-a',
            riderId: 'rider-1',
            resourceKind: 'durable_supply_unit',
            supplyKey: 'rain_jackets',
            stageUsesRemaining: 25,
            maxStageUses: 25,
            selectedStageUses: 1,
          },
        },
      },
    })
    const rider = result.phase9Acceptance.riderEffects.find(
      (row) => row.riderId === 'rider-1',
    )
    const update = result.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'durable:jacket-1',
    )

    expect(rider?.supplyStagePerformancePct).toBe(-1)
    expect(rider?.healthIncidentRiskMultiplier).toBe(1)
    expect(update).toMatchObject({
      stageUsesBefore: 25,
      stageUsesUsed: 1,
      stageUsesAfter: 24,
    })
  })

  it('adds rain-jacket sickness protection and cold/rain fatigue support only in bad weather', () => {
    const base = createValidInput()
    const badWeather = {
      ...base.weather,
      condition: 'rain',
      temperatureC: 10,
      precipitationMm: 4,
      rainProbabilityPct: 90,
    }
    const withoutJacket = runRaceEngine({ ...base, weather: badWeather })
    const withJacket = runRaceEngine({
      ...base,
      weather: badWeather,
      preparation: {
        ...base.preparation,
        raceSupplies: {
          'durable:jacket-1': {
            teamId: 'team-a',
            riderId: 'rider-1',
            resourceKind: 'durable_supply_unit',
            supplyKey: 'rain_jackets',
            stageUsesRemaining: 8,
            maxStageUses: 25,
            selectedStageUses: 1,
          },
        },
      },
    })
    const noJacketRider = withoutJacket.phase9Acceptance.riderEffects.find(
      (row) => row.riderId === 'rider-1',
    )
    const jacketRider = withJacket.phase9Acceptance.riderEffects.find(
      (row) => row.riderId === 'rider-1',
    )

    expect(jacketRider?.supplyStagePerformancePct).toBe(-1)
    expect(jacketRider?.healthIncidentRiskMultiplier).toBe(0.5)
    expect(jacketRider?.incidentRiskMultiplier).toBe(
      noJacketRider?.incidentRiskMultiplier,
    )
    expect(jacketRider?.effectiveFatigueMultiplier).toBeCloseTo(
      (noJacketRider?.effectiveFatigueMultiplier ?? 1) * 0.995,
      6,
    )
  })

  it('keeps the Race Preparation final-stage preview aligned with the pre-Phase-10 resource contract', () => {
    const source = readFileSync(
      new URL('../pages/dashboard/RacePreparation.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain('weighted UI % ×5 · condition-scaled')
    expect(source).toContain('catalog wear × ${equipmentWearDistanceFactor.toFixed(2)}')
    expect(source).toContain('asset-level wear × clamped stage-distance factor')
    expect(source).toContain('Jerseys ${needs.race_jersey_complete} ×1 · Jackets ${needs.rain_jackets} ×1')
    expect(source).toContain('-50% sickness risk / -0.5% fatigue / -1% efficiency')
    expect(source).toContain('Saving this plan consumes nothing.')
    expect(source).not.toContain('void exactBonusPreview;')
  })

  it('publishes a truthful browser-ready Phase 9 acceptance report', () => {
    const input = createValidInput()
    const prepared: UniversalRaceEngineInput = {
      ...input,
      preparation: {
        equipment: {
          race_bike: {
            teamId: 'team-a',
            condition: 91,
            intensity: 0.75,
          },
        },
        raceSupplies: {
          hydration: {
            teamId: 'team-a',
            quantity: 12,
            selectedQuantity: 6,
          },
        },
        assets: {
          service_vehicle: {
            teamId: 'team-a',
            condition: 84,
            intensity: 0.5,
          },
        },
        staff: {
          sports_director: {
            teamId: 'team-a',
            role: 'sports_director',
          },
        },
        standardizedBonuses: {
          teams: {
            'team-a': {
              equipmentPerformanceBonusPoints: 1,
              equipmentSuitabilityBonusPoints: 1,
              supplySupportPoints: 1,
              supplyEnergySavingPct: 6,
              supplyFatigueReductionPct: 5,
              supplyRecoveryBonusPoints: 1,
              assetSupportPoints: 1,
              staffSupportPoints: 1,
              tacticalSupportPoints: 1,
              reliabilitySupportPoints: 1,
            },
          },
        },
      },
    }

    const result = runRaceEngine(prepared)
    const coverage = new Map(
      result.phase9Acceptance.categories.map((row) => [row.category, row]),
    )

    expect(result.phase9Acceptance.passed).toBe(true)
    expect(result.phase9Acceptance.singleCalculationPath).toBe(true)
    expect(result.phase9Acceptance.completeFiveSystemInputCoverage).toBe(true)
    expect(coverage.get('weather')?.status).not.toBe('not_supplied')
    expect(coverage.get('equipment')?.status).toBe('applied')
    expect(coverage.get('supplies')?.status).toBe('applied')
    expect(coverage.get('assets')?.status).toBe('applied')
    expect(coverage.get('staff')?.status).toBe('applied')
    expect(
      result.phase9Acceptance.resourceUpdateSummary
        .equipmentConditionUpdatesCalculated,
    ).toBe(1)
    expect(
      result.phase9Acceptance.resourceUpdateSummary
        .assetConditionUpdatesCalculated,
    ).toBe(1)
    expect(
      result.phase9Acceptance.resourceUpdateSummary
        .supplyQuantityUpdatesCalculated,
    ).toBe(1)
    expect(result.phase9Acceptance.resourceUpdateSummary.resourceMathValid).toBe(
      true,
    )
    expect(result.phase9Acceptance.riderEffects).toHaveLength(
      prepared.riders.length,
    )
    expect(result.phase9Acceptance.persistence).toEqual({
      pureEngineDatabaseWrites: false,
      conditionAndQuantityUpdatesCalculated: true,
      persistenceApplied: false,
      requiredBoundary: 'phase_11_application_service',
    })
  })

  it('shows supply and weather effects on the final rider update rows', () => {
    const base = createValidInput()
    const neutral = runRaceEngine(base)
    const prepared = runRaceEngine({
      ...base,
      weather: {
        ...base.weather,
        condition: 'strong_headwind',
        temperatureC: 36,
        windKmh: 50,
        snapshot: { headwindPct: 100 },
      },
      preparation: {
        ...base.preparation,
        raceSupplies: {
          hydration: {
            teamId: 'team-a',
            quantity: 10,
            selectedQuantity: 4,
          },
        },
        standardizedBonuses: {
          teams: {
            'team-a': {
              supplySupportPoints: 1.5,
              supplyEnergySavingPct: 8,
              supplyFatigueReductionPct: 8,
              supplyRecoveryBonusPoints: 1,
            },
          },
        },
      },
    })
    const neutralRider = neutral.phase9Acceptance.riderEffects.find(
      (row) => row.riderId === 'rider-1',
    )
    const preparedRider = prepared.phase9Acceptance.riderEffects.find(
      (row) => row.riderId === 'rider-1',
    )

    expect(prepared.phase9Acceptance.weather.energyCostMultiplier).toBeGreaterThan(
      1,
    )
    expect(prepared.phase9Acceptance.weather.fatigueMultiplier).toBeGreaterThan(
      1,
    )
    expect(preparedRider?.supplySupportPoints).toBe(1.5)
    expect(preparedRider?.effectiveRecoveryBonusPoints).toBe(1)
    expect(preparedRider?.effectiveEnergyCostMultiplier).not.toBe(
      neutralRider?.effectiveEnergyCostMultiplier,
    )
    expect(preparedRider?.effectiveFatigueMultiplier).not.toBe(
      neutralRider?.effectiveFatigueMultiplier,
    )
    expect(preparedRider?.actualEnergySpent).toBeGreaterThan(0)
    expect(preparedRider?.actualFatigueGained).toBeGreaterThan(0)
  })

  it('improves chances without overriding rider ability or guaranteeing the result', () => {
    const input = createValidInput()
    const prepared: UniversalRaceEngineInput = {
      ...input,
      preparation: {
        ...input.preparation,
        standardizedBonuses: {
          teams: {
            'team-b': {
              equipmentPerformanceBonusPoints: 1,
              equipmentSuitabilityBonusPoints: 1,
              supplySupportPoints: 1,
              staffSupportPoints: 1,
              tacticalSupportPoints: 1,
            },
          },
        },
      },
    }

    const result = runRaceEngine(prepared)
    const strongest = result.riderSuitability.find(
      (row) => row.riderId === 'rider-1',
    )
    const weakestPrepared = result.riderSuitability.find(
      (row) => row.riderId === 'rider-4',
    )

    expect(weakestPrepared?.suitabilityScore).toBeGreaterThan(65)
    expect(strongest?.suitabilityScore).toBeGreaterThan(
      weakestPrepared?.suitabilityScore ?? 0,
    )
  })

  it('loads canonical Phase 9 production inputs into the single backend engine call', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    const runnerSource = readFileSync(
      new URL('../../netlify/functions/universal-race-stage-runner.ts', import.meta.url),
      'utf8',
    )
    const migrationSource = readFileSync(
      new URL(
        '../../supabase/migrations/20260818_phase11b_universal_production_cutover.sql',
        import.meta.url,
      ),
      'utf8',
    )

    expect(migrationSource).toContain('race_engine_get_stage_phase9_inputs_v1')
    expect(migrationSource).toContain("'phase9_inputs'")
    expect(runnerSource).toContain('phase9Payload: firstObject(payload.phase9_inputs)')
    expect(runnerSource).toContain('buildProductionUniversalRaceEngineInput(sources)')
    expect(pageSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
    expect(runnerSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(1)
  })

  it('keeps Phase 9 production loading backend-only while the replay page remains read-only', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    const runnerSource = readFileSync(
      new URL('../../netlify/functions/universal-race-stage-runner.ts', import.meta.url),
      'utf8',
    )

    expect(pageSource).toContain('directDatabaseWritePerformed: false')
    expect(pageSource).toContain('persistenceAppliedByThisPage: false')
    expect(pageSource).toContain('get_universal_race_stage_replay_payload_v1')
    expect(pageSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
    expect(runnerSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(1)
  })

  it('merges server-normalized equipment and supplies into the Phase 9 engine input', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

    expect(pageSource).toContain(
      'productionPayload.preparation.equipment as JsonObject',
    )
    expect(pageSource).toContain(
      'productionPayload.preparation.raceSupplies as JsonObject',
    )
    expect(pageSource).toContain(
      'productionDiagnostics: productionPayload.diagnostics',
    )
    expect(pageSource).toContain(
      'productionModelVersion: productionPayload.modelVersion',
    )
    expect(pageSource).toContain('phase9Modifier.equipment_selection')
  })

  it('does not grant positive supply benefits when selected stock is unavailable', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      preparation: {
        ...base.preparation,
        raceSupplies: {
          unavailable_gels: {
            teamId: 'team-a',
            quantity: 0,
            selectedQuantity: 12,
          },
        },
        standardizedBonuses: {
          teams: {
            'team-a': {
              supplySupportPoints: 0,
              supplyEnergySavingPct: 0,
              supplyFatigueReductionPct: 0,
              supplyRecoveryBonusPoints: 0,
              supplyFatiguePenaltyPct: 3,
            },
          },
        },
      },
    })

    const team = result.phase9Modifiers.teams.find(
      (row) => row.teamId === 'team-a',
    )
    const supplyUpdate = result.phase9Modifiers.resourceUpdates.find(
      (row) => row.resourceId === 'unavailable_gels',
    )

    expect(team?.sources.supplySupportPoints).toBe(0)
    expect(team?.sources.supplyEnergySavingPct).toBe(0)
    expect(team?.sources.supplyFatigueReductionPct).toBe(0)
    expect(team?.sources.supplyRecoveryBonusPoints).toBe(0)
    expect(team?.sources.supplyFatiguePenaltyPct).toBe(3)
    expect(team?.energyCostMultiplier).toBe(1)
    expect(team?.fatigueMultiplier).toBe(1.03)
    expect(team?.recoveryBonusPoints).toBe(0)
    expect(supplyUpdate).toMatchObject({
      quantityBefore: 0,
      quantityUsed: 0,
      quantityAfter: 0,
      shortageApplied: true,
    })
  })

  it('does not report staff as supplied from generic tactical support alone', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      preparation: {
        ...base.preparation,
        staff: {},
        standardizedBonuses: {
          teams: {
            'team-a': {
              tacticalSupportPoints: 0.5,
              reliabilitySupportPoints: 0.5,
              recoveryBonusPoints: 0.5,
            },
          },
        },
      },
    })

    const staff = result.phase9Acceptance.categories.find(
      (row) => row.category === 'staff',
    )
    expect(staff).toMatchObject({
      status: 'not_supplied',
      inputRecordCount: 0,
      appliedSignalCount: 0,
      updateCount: 0,
    })
  })

  it('reports real Staff as applied when saved staff effects flow through canonical rider modifiers', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      riders: base.riders.map((rider) =>
        rider.riderId === 'rider-1'
          ? {
              ...rider,
              preparationModifiers: {
                inStageEnergyCostMultiplier: 0.98,
                postStageFatigueMultiplier: 0.97,
                postStageRecoveryBonusPoints: 1,
                performanceBonusPoints: 0,
                equipmentStagePerformancePct: 0,
                incidentRiskMultiplier: 0.94,
                healthIncidentRiskMultiplier: 0.94,
              },
            }
          : rider,
      ),
      preparation: {
        ...base.preparation,
        staff: {
          doctor: {
            teamId: 'team-a',
            role: 'team_doctor',
            hasEffectSnapshot: true,
          },
        },
      },
    })

    const staff = result.phase9Acceptance.categories.find(
      (row) => row.category === 'staff',
    )
    const rider = result.phase9Acceptance.riderEffects.find(
      (row) => row.riderId === 'rider-1',
    )

    expect(staff).toMatchObject({
      status: 'applied',
      inputRecordCount: 1,
    })
    expect(rider?.effectiveEnergyCostMultiplier).toBe(0.98)
    expect(rider?.effectiveRecoveryBonusPoints).toBe(1)
    expect(rider?.healthIncidentRiskMultiplier).toBe(0.94)
  })

  it('keeps equipment x5 as a dedicated percentage instead of saturating generic +5 points', () => {
    const base = createValidInput()
    const withEquipmentPct: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider, index) => ({
        ...rider,
        preparationModifiers: {
          inStageEnergyCostMultiplier: 1,
          postStageFatigueMultiplier: 1,
          postStageRecoveryBonusPoints: 0,
          performanceBonusPoints: 0,
          equipmentStagePerformancePct: index === 0 ? 5 : 10,
          incidentRiskMultiplier: 1,
        },
      })),
    }

    const result = runRaceEngine(withEquipmentPct)
    const first = result.riderSuitability.find(
      (row) => row.riderId === base.riders[0].riderId,
    )
    const second = result.riderSuitability.find(
      (row) => row.riderId === base.riders[1].riderId,
    )

    expect(first?.components.genericPerformanceBonusPoints).toBe(0)
    expect(first?.components.equipmentStagePerformancePct).toBe(5)
    expect(second?.components.equipmentStagePerformancePct).toBe(10)
    expect(first?.components.equipmentPerformanceAdjustment).toBeCloseTo(
      (first?.stageSkillScore ?? 0) * 0.05,
      4,
    )
    expect(second?.components.equipmentPerformanceAdjustment).toBeCloseTo(
      (second?.stageSkillScore ?? 0) * 0.1,
      4,
    )
    expect(second?.components.equipmentPerformanceAdjustment).not.toBe(
      first?.components.equipmentPerformanceAdjustment,
    )
  })

  it('allows independent equipment effects even when canonical race preparation is absent', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

    expect(pageSource).toContain(
      'phase9Modifier.equipment_fatigue_reduction_pct',
    )
    expect(pageSource).toContain(
      'phase9Modifier.equipment_engine_stage_bonus_pct',
    )
    expect(pageSource).toContain('equipmentStagePerformancePct')
    expect(pageSource).toContain(
      'Object.keys(getRecord(phase9Modifier.equipment_selection)).length > 0',
    )
    expect(pageSource).toContain(
      'phase9Modifier.preparation_applied !== false ||',
    )
  })

})

describe('Phase 10 deterministic incidents, availability and final statuses', () => {
  function enablePhase10HighRisk(
    input: UniversalRaceEngineInput,
    seed: string,
  ): UniversalRaceEngineInput {
    return {
      ...input,
      engine: {
        ...input.engine,
        deterministicSeed: seed,
      },
      incidentModel: {
        enabled: true,
      },
      weather: {
        ...input.weather!,
        condition: 'heavy_rain',
        temperatureC: 5,
        windKmh: 55,
        precipitationMm: 20,
        rainProbabilityPct: 100,
        cancelled: false,
        cancellationReason: null,
        source: 'phase10-regression',
        snapshot: {},
      },
      riders: input.riders.map((rider, index) => ({
        ...rider,
        fatigueBeforeStage: 85,
        resistance: 30,
        raceIQ: 30,
        preparationModifiers: {
          inStageEnergyCostMultiplier: 1,
          postStageFatigueMultiplier: 1,
          postStageRecoveryBonusPoints: 0,
          incidentRiskMultiplier: 1.4,
          mechanicalIncidentRiskMultiplier: 1.5,
          mechanicalTimeLossMultiplier: 1,
          equipmentConditionPercent: index % 2 === 0 ? 10 : 35,
        },
      })),
    }
  }

  function createPhase10HighRiskInput(seed: string): UniversalRaceEngineInput {
    return enablePhase10HighRisk(createExpandedFieldInput(96), seed)
  }

  it('keeps a competition point at the finish kilometre before the authoritative final checkpoint', () => {
    const base = createPhase10HighRiskInput('phase10-high-0')
    const finishKm = base.stage.distanceKm
    const finishLineSprintId = 'point-sprint-at-finish'

    const input: UniversalRaceEngineInput = {
      ...base,
      points: base.points.map((point) =>
        point.pointType === 'INTERMEDIATE_SPRINT'
          ? {
              ...point,
              pointId: finishLineSprintId,
              kmFromStart: finishKm,
            }
          : point,
      ),
    }

    const result = runRaceEngine(input)

    const pointCheckpointId =
      `${result.stageId}|replay|point-${finishLineSprintId}`

    const pointCheckpointIndex =
      result.replayTimeline.checkpoints.findIndex(
        (checkpoint) => checkpoint.checkpointId === pointCheckpointId,
      )

    const finalCheckpointIndex =
      result.replayTimeline.checkpoints.findIndex(
        (checkpoint) =>
          checkpoint.checkpointId === result.replayTimeline.finalCheckpointId,
      )

    expect(pointCheckpointIndex).toBeGreaterThanOrEqual(0)
    expect(finalCheckpointIndex).toBeGreaterThan(pointCheckpointIndex)
    expect(finalCheckpointIndex).toBe(
      result.replayTimeline.checkpoints.length - 1,
    )

    const pointCheckpoint =
      result.replayTimeline.checkpoints[pointCheckpointIndex]
    const finalCheckpoint =
      result.replayTimeline.checkpoints[finalCheckpointIndex]

    expect(pointCheckpoint.raceProgress.kmFromStart).toBe(finishKm)
    expect(finalCheckpoint.raceProgress.kmFromStart).toBe(finishKm)
    expect(pointCheckpoint.finalResultsVisible).toBe(false)
    expect(finalCheckpoint.finalResultsVisible).toBe(true)
    expect(pointCheckpoint.groups).toEqual(finalCheckpoint.groups)

    expect(
      pointCheckpoint.gaps.map((gap) => ({
        groupCode: gap.groupCode,
        displayCode: gap.displayCode,
        gapSeconds: gap.gapSeconds,
      })),
    ).toEqual(
      finalCheckpoint.gaps.map((gap) => ({
        groupCode: gap.groupCode,
        displayCode: gap.displayCode,
        gapSeconds: gap.gapSeconds,
      })),
    )

    expect(
      pointCheckpoint.intermediateResults.some(
        (event) => event.pointId === finishLineSprintId,
      ),
    ).toBe(true)
    expect(result.replaySynchronization.synchronized).toBe(true)
    expect(
      result.replaySynchronization.issues.some(
        (issue) =>
          issue === 'final_checkpoint_identity_mismatch' ||
          issue.startsWith('same_kilometre_physical_state_mismatch:'),
      ),
    ).toBe(false)
  })

  it('defines exactly the four supported official rider statuses and assigns one to every accepted rider', () => {
    expect(UNIVERSAL_PHASE10_OFFICIAL_STATUSES).toEqual([
      'finished',
      'dns',
      'dnf',
      'otl',
    ])

    const result = runRaceEngine(createValidInput())
    expect(result.phase10Incidents.allAcceptedRidersHaveExactlyOneStatus).toBe(
      true,
    )
    expect(result.phase10Incidents.allAcceptedRidersPresentInStatusGroups).toBe(
      true,
    )
    expect(result.phase10Incidents.statusGroups.flatMap((row) => row.riderIds))
      .toHaveLength(result.finishResolution.classification.length)
  })

  it('consumes existing health/start availability as DNS without creating a second health system', () => {
    const base = createValidInput()
    const input: UniversalRaceEngineInput = {
      ...base,
      riders: base.riders.map((rider, index) =>
        index === 0
          ? {
              ...rider,
              availabilityStatus: 'injured' as const,
              startStatus: 'dns' as const,
              healthCase: {
                healthCaseId: 'existing-health-case',
                caseType: 'injury' as const,
                severity: 'moderate' as const,
                status: 'active' as const,
                selectionBlocked: true,
                fatigueFloorOnReturn: 20,
                activeUntil: null,
                recoveryUntil: null,
              },
            }
          : rider,
      ),
    }
    const result = runRaceEngine(input)
    const row = result.phase10Incidents.preRaceAvailability.find(
      (entry) => entry.riderId === base.riders[0].riderId,
    )!
    const final = result.finishResolution.classification.find(
      (entry) => entry.riderId === base.riders[0].riderId,
    )!

    expect(row).toMatchObject({
      dns: true,
      startAllowed: false,
      source: 'existing_health_system',
      restriction: 'persisted_health_case',
      healthSelectionBlocked: true,
    })
    expect(final.status).toBe('dns')
    expect(result.phase10Incidents.persistentHealthWritesPerformed).toBe(false)
    expect(result.phase10Incidents.directDatabaseWritesPerformed).toBe(false)
  })

  it('represents excessive fatigue and severe runnable weather as participation restrictions without inventing DNS', () => {
    const base = createValidInput()
    const input: UniversalRaceEngineInput = {
      ...base,
      weather: {
        ...base.weather!,
        condition: 'heavy_rain',
        temperatureC: 5,
        windKmh: 65,
        precipitationMm: 12,
        rainProbabilityPct: 100,
      },
      riders: base.riders.map((rider, index) =>
        index === 0 ? { ...rider, fatigueBeforeStage: 95 } : rider,
      ),
    }
    const result = runRaceEngine(input)
    const row = result.phase10Incidents.preRaceAvailability.find(
      (entry) => entry.riderId === base.riders[0].riderId,
    )!

    expect(row.startAllowed).toBe(true)
    expect(row.dns).toBe(false)
    expect(['excessive_fatigue', 'severe_weather']).toContain(row.restriction)
  })

  it('raises deterministic crash probability with weather, fatigue and aggressive command intensity', () => {
    const neutral = calculateUniversalPhase10IncidentProbability({
      incidentKind: 'individual_crash',
      tickSeconds: 30,
      weatherMultiplier: 1,
      currentSpeedKmh: 42,
      gradientPercent: 0,
      groupSize: 12,
      runtimeFatigue: 20,
      resistance: 70,
      raceIq: 70,
      preparationSupportMultiplier: 1,
      commandIntensityMultiplier: 1,
    })
    const risky = calculateUniversalPhase10IncidentProbability({
      incidentKind: 'individual_crash',
      tickSeconds: 30,
      weatherMultiplier: 1.35,
      currentSpeedKmh: 55,
      gradientPercent: -6,
      groupSize: 35,
      runtimeFatigue: 85,
      resistance: 40,
      raceIq: 40,
      preparationSupportMultiplier: 1.2,
      commandIntensityMultiplier: 1.45,
    })

    expect(risky.finalProbability).toBeGreaterThan(neutral.finalProbability)
    expect(risky.weatherMultiplier).toBeGreaterThan(neutral.weatherMultiplier)
    expect(risky.fatigueMultiplier).toBeGreaterThan(neutral.fatigueMultiplier)
    expect(risky.commandIntensityMultiplier).toBeGreaterThan(
      neutral.commandIntensityMultiplier,
    )
  })

  it('uses equipment condition and mechanic support only for technical-incident probability', () => {
    const shared = {
      tickSeconds: 30,
      weatherMultiplier: 1,
      currentSpeedKmh: 42,
      gradientPercent: 0,
      groupSize: 15,
      runtimeFatigue: 40,
      resistance: 65,
      raceIq: 65,
      preparationSupportMultiplier: 1,
      commandIntensityMultiplier: 1,
    } as const
    const goodTechnical = calculateUniversalPhase10IncidentProbability({
      ...shared,
      incidentKind: 'technical_incident',
      equipmentConditionPercent: 100,
      mechanicalIncidentRiskMultiplier: 0.82,
    })
    const wornTechnical = calculateUniversalPhase10IncidentProbability({
      ...shared,
      incidentKind: 'technical_incident',
      equipmentConditionPercent: 20,
      mechanicalIncidentRiskMultiplier: 1.4,
    })
    const crashGoodEquipment = calculateUniversalPhase10IncidentProbability({
      ...shared,
      incidentKind: 'individual_crash',
      equipmentConditionPercent: 100,
      mechanicalIncidentRiskMultiplier: 0.82,
    })
    const crashWornEquipment = calculateUniversalPhase10IncidentProbability({
      ...shared,
      incidentKind: 'individual_crash',
      equipmentConditionPercent: 20,
      mechanicalIncidentRiskMultiplier: 1.4,
    })

    expect(wornTechnical.finalProbability).toBeGreaterThan(
      goodTechnical.finalProbability,
    )
    expect(crashWornEquipment.finalProbability).toBe(
      crashGoodEquipment.finalProbability,
    )
  })

  it('keeps a normal deterministic baseline incident-free while activating incident synchronization', () => {
    const base = createValidInput()
    const result = runRaceEngine({
      ...base,
      incidentModel: { enabled: true },
    })

    expect(result.phase10Incidents.active).toBe(true)
    expect(result.phase10Incidents.incidentCount).toBe(0)
    expect(result.replaySynchronization.incidentSynchronizationStatus).toBe(
      'synchronized',
    )
    expect(result.replaySynchronization.incidentIntegrationComplete).toBe(true)
    expect(result.replaySynchronization.issues).toEqual([])
  })

  it('resolves individual and technical incidents from the same deterministic high-risk race', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))
    const individual = result.phase10Incidents.incidents.find(
      (row) => row.incidentKind === 'individual_crash',
    )!
    const technical = result.phase10Incidents.incidents.find(
      (row) => row.incidentKind === 'technical_incident',
    )!

    expect(individual).toBeTruthy()
    expect(technical).toBeTruthy()
    expect(individual.riderConsequences[0].energyLossPoints).toBeGreaterThan(0)
    expect(technical.technicalType).not.toBeNull()
    expect(technical.severity).toBe('serious')
    const seriousTechnicalRanges = {
      dropped_chain: [36, 60],
      puncture: [61, 95],
      wheel_damage: [91, 140],
      drivetrain_failure: [96, 160],
      bike_change: [141, 220],
    } as const
    const [minimumTechnicalLoss, maximumTechnicalLoss] =
      seriousTechnicalRanges[technical.technicalType!]
    expect(technical.timeLossSeconds).toBeGreaterThanOrEqual(
      minimumTechnicalLoss,
    )
    expect(technical.timeLossSeconds).toBeLessThanOrEqual(
      maximumTechnicalLoss,
    )
    expect(technical.healthCaseEligible).toBe(false)
    expect(technical.persistentHealthOutcome).toBe(
      'application_health_system_after_finalization',
    )
    expect(result.replaySynchronization.synchronized).toBe(true)
  })

  it('resolves a deterministic group crash with two to six affected riders and one shared delay', () => {
    const first = runRaceEngine(createPhase10HighRiskInput('phase10-high-71'))
    const second = runRaceEngine(createPhase10HighRiskInput('phase10-high-71'))
    const groupCrash = first.phase10Incidents.incidents.find(
      (row) => row.incidentKind === 'group_crash',
    )!

    expect(groupCrash).toBeTruthy()
    expect(groupCrash.riderIds.length).toBeGreaterThanOrEqual(2)
    expect(groupCrash.riderIds.length).toBeLessThanOrEqual(6)
    expect(groupCrash.riderConsequences).toHaveLength(groupCrash.riderIds.length)
    expect(groupCrash.timeLossSeconds).toBeGreaterThanOrEqual(20)
    expect(groupCrash.timeLossSeconds).toBeLessThanOrEqual(210)
    expect(first.phase10Incidents).toEqual(second.phase10Incidents)
  })

  it('moves a rider with consequential time loss into a later road group without losing the rider', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))
    const incident = result.phase10Incidents.incidents.find((row) =>
      row.riderConsequences.some(
        (consequence) =>
          consequence.movedToLaterGroup && consequence.timePenaltySeconds > 0,
      ),
    )!
    const consequence = incident.riderConsequences.find(
      (row) => row.movedToLaterGroup && row.timePenaltySeconds > 0,
    )!
    const final = result.finishResolution.classification.find(
      (row) => row.riderId === consequence.riderId,
    )!

    expect(consequence.timePenaltySeconds).toBeGreaterThan(0)
    expect(final.status).toBe('finished')
    expect(final.physicalGroupCode).toBe('dropped_group')
    expect(
      result.replayTimeline.checkpoints.every((checkpoint) =>
        checkpoint.riderStates.some((row) => row.riderId === consequence.riderId),
      ),
    ).toBe(true)
  })

  it('turns a serious individual crash into synchronized DNF while leaving long-term injury creation to health application', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-4'))
    const crash = result.phase10Incidents.incidents.find(
      (row) =>
        row.incidentKind === 'individual_crash' && row.severity === 'serious',
    )!
    const riderId = crash.riderIds[0]
    const final = result.finishResolution.classification.find(
      (row) => row.riderId === riderId,
    )!

    expect(crash.healthCaseEligible).toBe(true)
    expect(crash.healthSeverityHint).toBe('major')
    expect(crash.healthSubtypeHint).toBe('fracture')
    expect(crash.riderConsequences[0].statusImpact).toBe('dnf')
    expect(final.status).toBe('dnf')
    expect(final.rank).toBeNull()
    expect(
      result.replayTimeline.checkpoints.every((checkpoint) =>
        checkpoint.riderStates.some((row) => row.riderId === riderId),
      ),
    ).toBe(true)
    expect(result.phase10Incidents.everyIncidentRiderRemainsTracked).toBe(true)
    expect(result.phase10Incidents.persistentHealthWritesPerformed).toBe(false)
    expect(result.replaySynchronization.synchronized).toBe(true)
  })

  it('represents finished-with-incident as official finished plus an authoritative incident record', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))
    const minor = result.phase10Incidents.incidents.find(
      (row) =>
        row.incidentKind === 'individual_crash' && row.severity === 'minor',
    )!
    const riderId = minor.riderIds[0]
    const final = result.finishResolution.classification.find(
      (row) => row.riderId === riderId,
    )!

    expect(final.status).toBe('finished')
    expect(minor.riderConsequences[0].statusImpact).toBe('finished')
    expect(minor.riderConsequences[0].energyLossPoints).toBeGreaterThan(0)
  })

  it('keeps an autonomous incident rider behind its target until the dynamic chase actually closes the gap', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))
    const incident = result.phase10Incidents.incidents.find(
      (row) =>
        row.sourceDisplayCode === 'P' &&
        row.riderConsequences.some(
          (consequence) =>
            consequence.movedToLaterGroup && consequence.actualRejoinKm !== null,
        ),
    )!
    const consequence = incident.riderConsequences.find(
      (row) => row.movedToLaterGroup && row.actualRejoinKm !== null,
    )!

    expect(incident).toBeTruthy()
    expect(consequence.temporarySeparation).toBe(true)
    expect(consequence.expectedRejoinKm).toBe(consequence.actualRejoinKm)
    expect(consequence.chaseEnergyCostPoints).toBeGreaterThan(0)

    const separatedCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        !checkpoint.finalResultsVisible &&
        checkpoint.raceProgress.kmFromStart > incident.kmFromStart + 0.000001 &&
        checkpoint.raceProgress.kmFromStart <
          (consequence.actualRejoinKm ?? Number.POSITIVE_INFINITY) - 0.000001 &&
        checkpoint.riderStates.some((state) => {
          if (state.riderId !== consequence.riderId || !state.displayCode) {
            return false
          }
          const group = checkpoint.groups.find(
            (row) => row.displayCode === state.displayCode,
          )
          return group?.physicalPosition === 'behind_peloton'
        }),
    )!
    expect(separatedCheckpoint).toBeTruthy()
    const incidentState = separatedCheckpoint.riderStates.find(
      (state) => state.riderId === consequence.riderId,
    )!
    const pelotonGap =
      separatedCheckpoint.gaps.find((gap) => gap.displayCode === 'P')?.gapSeconds ?? 0
    const autonomousGapToPeloton = (incidentState.gapSeconds ?? 0) - pelotonGap
    expect(autonomousGapToPeloton).toBeGreaterThan(
      PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    )

    // The old v10a-v10c fixed 3.5 sec/km closure rule must no longer drive
    // the replay. The autonomous gap is allowed to differ because phase,
    // rider skill, energy, group size and target pressure now decide it.
    const oldFixedGap = Math.max(
      0,
      incident.timeLossSeconds -
        (separatedCheckpoint.raceProgress.kmFromStart - incident.kmFromStart) *
          (35 / 10),
    )
    expect(Math.abs(autonomousGapToPeloton - oldFixedGap)).toBeGreaterThan(0.01)

    const rejoinedCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        !checkpoint.finalResultsVisible &&
        consequence.actualRejoinKm !== null &&
        Math.abs(
          checkpoint.raceProgress.kmFromStart - consequence.actualRejoinKm,
        ) <= 0.000001,
    )!
    expect(rejoinedCheckpoint).toBeTruthy()
    const rejoinedState = rejoinedCheckpoint.riderStates.find(
      (state) => state.riderId === consequence.riderId,
    )!
    expect(rejoinedState.displayCode).toBe('P')
  })

  it('places Phase 10 incidents and recoverable rejoins on exact replay checkpoints', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))

    result.phase10Incidents.incidents.forEach((incident) => {
      const incidentCheckpoint = result.replayTimeline.checkpoints.find(
        (checkpoint) =>
          Math.abs(
            checkpoint.raceProgress.kmFromStart - incident.kmFromStart,
          ) <= 0.000001,
      )!
      expect(incidentCheckpoint).toBeTruthy()
      expect(
        incidentCheckpoint.commentary.some(
          (entry) => entry.commentaryId === `commentary:${incident.incidentId}`,
        ),
      ).toBe(true)

      const expectedRejoinKm = incident.riderConsequences
        .filter(
          (row) => row.temporarySeparation && row.expectedRejoinKm !== null,
        )
        .reduce<number | null>(
          (maximum, row) =>
            maximum === null
              ? row.expectedRejoinKm
              : Math.max(maximum, row.expectedRejoinKm ?? maximum),
          null,
        )
      if (expectedRejoinKm === null) return

      const rejoinCheckpoint = result.replayTimeline.checkpoints.find(
        (checkpoint) =>
          Math.abs(
            checkpoint.raceProgress.kmFromStart - expectedRejoinKm,
          ) <= 0.000001,
      )!
      expect(rejoinCheckpoint).toBeTruthy()
      expect(
        rejoinCheckpoint.commentary.some(
          (entry) =>
            entry.commentaryId === `commentary:${incident.incidentId}:rejoin`,
        ),
      ).toBe(true)
    })
  })

  it('lets a late autonomous incident group lose ground when the peloton is riding faster', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))
    const incident = result.phase10Incidents.incidents.find(
      (row) =>
        row.phase === 4 &&
        row.sourceDisplayCode === 'P' &&
        row.riderConsequences.some(
          (consequence) =>
            consequence.movedToLaterGroup && consequence.actualRejoinKm === null,
        ),
    )!
    const consequence = incident.riderConsequences.find(
      (row) => row.movedToLaterGroup && row.actualRejoinKm === null,
    )!

    expect(incident).toBeTruthy()
    expect(consequence.temporarySeparation).toBe(false)
    expect(consequence.finalGapToTargetSeconds).toBeGreaterThan(
      incident.timeLossSeconds,
    )
    expect(consequence.timePenaltySeconds).toBeGreaterThanOrEqual(
      incident.timeLossSeconds,
    )

    const samples = result.replayTimeline.checkpoints
      .filter(
        (checkpoint) =>
          !checkpoint.finalResultsVisible &&
          checkpoint.raceProgress.kmFromStart >= incident.kmFromStart - 0.000001,
      )
      .map((checkpoint) => {
        const state = checkpoint.riderStates.find(
          (row) => row.riderId === consequence.riderId,
        )
        const group = state?.displayCode
          ? checkpoint.groups.find((row) => row.displayCode === state.displayCode)
          : null
        if (
          !state ||
          state.gapSeconds === null ||
          group?.physicalPosition !== 'behind_peloton'
        ) {
          return null
        }
        const pelotonGap =
          checkpoint.gaps.find((gap) => gap.displayCode === 'P')?.gapSeconds ?? 0
        return state.gapSeconds - pelotonGap
      })
      .filter((value): value is number => value !== null)

    expect(samples.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...samples)).toBeGreaterThan(samples[0] + 5)
  })

  it('keeps live gap interpolation active when incident membership changes the same physical group', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    const lineageStart = pageSource.indexOf(
      'function haveSameUniversalReplayGroupLineage',
    )
    const lineageEnd = pageSource.indexOf(
      'function interpolateStableUniversalReplayGapSeconds',
      lineageStart,
    )
    const lineageSource = pageSource.slice(lineageStart, lineageEnd)

    expect(lineageSource).toContain(
      'currentGroup.groupCode === nextGroup.groupCode',
    )
    expect(lineageSource).toContain(
      'currentGroup.displayCode === nextGroup.displayCode',
    )
    expect(lineageSource).not.toContain('riderIds.length')
    expect(pageSource).toContain("group?.physicalPosition === 'behind_peloton'")
    expect(pageSource).toContain("nextGroup?.physicalPosition === 'behind_peloton'")
    expect(pageSource).not.toContain("displayCode?.startsWith('I')")
    expect(pageSource).not.toContain('nextGapSeconds <= currentGapSeconds')
    expect(pageSource).toContain(
      "autonomous_incident_group_interpolation_with_exact_phase10_events",
    )
  })


  it('merges nearby autonomous incident groups into one cooperative chase group', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))

    expect(result.phase10Incidents.autonomousChase.active).toBe(true)
    expect(result.phase10Incidents.autonomousChase.groupMergeCount).toBeGreaterThan(0)
    expect(result.phase10Incidents.autonomousChase.groupMergeKms.length).toBe(
      result.phase10Incidents.autonomousChase.groupMergeCount,
    )
    const mergeKm = result.phase10Incidents.autonomousChase.groupMergeKms[0]
    const mergeCheckpoint = result.replayTimeline.checkpoints.find(
      (checkpoint) =>
        Math.abs(checkpoint.raceProgress.kmFromStart - mergeKm) <= 0.000001,
    )!
    expect(mergeCheckpoint).toBeTruthy()
    expect(
      mergeCheckpoint.groups.some(
        (group) =>
          group.physicalPosition === 'behind_peloton' &&
          group.displayCode.startsWith('C') &&
          group.riderIds.length >= 2,
      ),
    ).toBe(true)
    expect(
      mergeCheckpoint.commentary.some(
        (entry) => entry.title === 'Incident chase groups join forces',
      ),
    ).toBe(true)
  })

  it('makes early incident recovery materially easier than a solo Phase 4 chase', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))
    const earlyRecovery = result.phase10Incidents.incidents.find(
      (incident) =>
        incident.phase <= 2 &&
        incident.riderConsequences.some(
          (row) => row.movedToLaterGroup && row.actualRejoinKm !== null,
        ),
    )
    const lateFailure = result.phase10Incidents.incidents.find(
      (incident) =>
        incident.phase === 4 &&
        incident.riderConsequences.some(
          (row) => row.movedToLaterGroup && row.actualRejoinKm === null,
        ),
    )

    expect(earlyRecovery).toBeTruthy()
    expect(lateFailure).toBeTruthy()
    expect(
      lateFailure!.riderConsequences.find((row) => row.movedToLaterGroup)!
        .timePenaltySeconds,
    ).toBeGreaterThan(0)
  })

  it('charges autonomous chase effort through the existing Phase 8 energy path', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))
    const consequenceChaseEnergy = result.phase10Incidents.incidents.reduce(
      (sum, incident) =>
        sum +
        incident.riderConsequences.reduce(
          (inner, row) => inner + row.chaseEnergyCostPoints,
          0,
        ),
      0,
    )

    expect(result.phase10Incidents.autonomousChase.totalChaseEnergyCostPoints).toBeGreaterThan(0)
    expect(consequenceChaseEnergy).toBeCloseTo(
      result.phase10Incidents.autonomousChase.totalChaseEnergyCostPoints,
      5,
    )
    const engineSource = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )
    expect(engineSource).toContain('row.chaseEnergyCostPoints')
  })
  it('protects official sprint-zone time while preserving the rider physical finish position and continuing injury consequence', () => {
    const input = enablePhase10HighRisk(
      createExpandedFieldInput(26),
      'sprint-seed-63',
    )
    const result = runRaceEngine(input)
    const incident = result.phase10Incidents.incidents.find(
      (row) =>
        row.riderConsequences.some(
          (consequence) => consequence.sprintZoneProtection.applied,
        ),
    )!
    expect(incident).toBeTruthy()
    const consequence = incident.riderConsequences.find(
      (row) => row.sprintZoneProtection.applied,
    )!
    const classification = result.phase10Incidents.finalClassification.find(
      (row) => row.riderId === consequence.riderId,
    )!
    const physicalGroup = result.phase10Incidents.finalRoadGroups.find((group) =>
      group.riderIds.includes(consequence.riderId),
    )!
    const physicalGap = result.phase10Incidents.finalRoadGaps.find(
      (gap) => gap.displayCode === physicalGroup.displayCode,
    )!

    expect(consequence.sprintZoneProtection.eligible).toBe(true)
    expect(consequence.sprintZoneProtection.zoneKm).toBe(3)
    expect(
      consequence.sprintZoneProtection.protectedOfficialTimeSeconds,
    ).not.toBeNull()
    expect(classification.status).toBe('finished')
    expect(classification.officialTimeSeconds).toBe(
      consequence.sprintZoneProtection.protectedOfficialTimeSeconds,
    )
    expect(classification.gapSeconds).toBe(0)
    expect(physicalGroup.displayCode.startsWith('C')).toBe(true)
    expect(physicalGroup.colorKey).toBe('chasing_orange')
    expect(physicalGap.gapSeconds).toBeGreaterThan(0)
    expect(consequence.healthOutcome.injuryOccurred).toBe(true)
    expect(consequence.healthOutcome.caseCode).toBe('ankle_sprain')
    expect(consequence.healthOutcome.severity).toBe('moderate')
    expect(consequence.healthOutcome.currentStageContinuation).toBe(
      'continues_injured',
    )
    expect(
      consequence.healthOutcome.currentStagePerformancePenaltyPoints,
    ).toBe(8)
    expect(consequence.healthOutcome.additionalEnergyLossPoints).toBe(2.5)
    expect(result.phase10Incidents.sprintZone.protectedRiderCount).toBeGreaterThan(0)
    expect(result.phase10Incidents.healthHandoff.persistentCaseCandidateCount).toBeGreaterThan(0)
    expect(result.phase10Incidents.healthHandoff.persistentWritesPerformed).toBe(false)
    expect(result.phase10Incidents.directDatabaseWritesPerformed).toBe(false)
  })

  it('resolves rider-specific deterministic health outcomes inside one group crash without writing health cases', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-71'))
    const groupCrash = result.phase10Incidents.incidents.find(
      (row) => row.incidentKind === 'group_crash',
    )!
    expect(groupCrash).toBeTruthy()
    expect(groupCrash.riderConsequences.length).toBeGreaterThanOrEqual(2)

    const signatures = new Set(
      groupCrash.riderConsequences.map(
        (row) =>
          `${row.healthOutcome.injuryOccurred}:${row.healthOutcome.caseCode ?? 'none'}:${row.healthOutcome.severity ?? 'none'}`,
      ),
    )
    expect(signatures.size).toBeGreaterThan(1)
    expect(
      groupCrash.riderConsequences.some(
        (row) => row.healthOutcome.injuryOccurred,
      ),
    ).toBe(true)
    expect(
      groupCrash.riderConsequences.some(
        (row) => !row.healthOutcome.injuryOccurred,
      ),
    ).toBe(true)
    groupCrash.riderConsequences.forEach((row) => {
      expect(row.healthOutcome.source).toBe(
        'universal_phase10_crash_health_handoff_v1',
      )
    })
    expect(result.phase10Incidents.healthHandoff.persistentWritesPerformed).toBe(false)
    expect(result.phase10Incidents.persistentHealthWritesPerformed).toBe(false)
  })

  it('does not allow the 900-second cooldown to create an overlapping second incident while a rider is still detached', () => {
    const result = runRaceEngine(
      enablePhase10HighRisk(createExpandedFieldInput(26), 'sprint-seed-37'),
    )

    expect(result.replaySynchronization.synchronized).toBe(true)
    expect(result.replaySynchronization.issues).toEqual([])
    result.replayTimeline.checkpoints.forEach((checkpoint) => {
      const riderIds = checkpoint.groups.flatMap((group) => group.riderIds)
      expect(new Set(riderIds).size).toBe(riderIds.length)
    })

    const incidentsByRider = new Map<string, typeof result.phase10Incidents.incidents[number][]>()
    result.phase10Incidents.incidents.forEach((incident) => {
      incident.riderConsequences.forEach((consequence) => {
        const existing = incidentsByRider.get(consequence.riderId) ?? []
        existing.push(incident)
        incidentsByRider.set(consequence.riderId, existing)
      })
    })
    incidentsByRider.forEach((incidents, riderId) => {
      const ordered = [...incidents].sort((a, b) => a.kmFromStart - b.kmFromStart)
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1].riderConsequences.find(
          (row) => row.riderId === riderId,
        )!
        expect(previous.actualRejoinKm).not.toBeNull()
        expect(ordered[index].kmFromStart).toBeGreaterThanOrEqual(
          previous.actualRejoinKm!,
        )
      }
    })
  })

  it('keeps generic road-group commentary synchronized with post-incident physical groups', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))

    result.replayTimeline.checkpoints.forEach((checkpoint) => {
      checkpoint.commentary.forEach((entry) => {
        if (entry.title === 'The race remains split') {
          expect(entry.description).toContain(
            `with ${checkpoint.groups.length} groups on the road.`,
          )
        }
        if (entry.title === 'The field remains together') {
          expect(checkpoint.groups).toHaveLength(1)
        }
      })
    })
  })

  it('puts rider and team names in individual, technical and group incident commentary', () => {
    const individualInput = createPhase10HighRiskInput('phase10-high-0')
    const individualResult = runRaceEngine(individualInput)
    const individual = individualResult.phase10Incidents.incidents.find(
      (row) => row.incidentKind === 'individual_crash',
    )!
    const technical = individualResult.phase10Incidents.incidents.find(
      (row) => row.incidentKind === 'technical_incident',
    )!

    for (const incident of [individual, technical]) {
      const rider = individualInput.riders.find(
        (row) => row.riderId === incident.riderIds[0],
      )!
      const team = individualInput.teams.find(
        (row) => row.teamId === rider.teamId,
      )!
      expect(incident.description).toContain(rider.snapshot.displayName)
      expect(incident.description).toContain(team.snapshot.teamName)
    }

    const groupInput = createPhase10HighRiskInput('phase10-high-71')
    const groupResult = runRaceEngine(groupInput)
    const groupCrash = groupResult.phase10Incidents.incidents.find(
      (row) => row.incidentKind === 'group_crash',
    )!
    groupCrash.riderIds.forEach((riderId) => {
      const rider = groupInput.riders.find((row) => row.riderId === riderId)!
      const team = groupInput.teams.find((row) => row.teamId === rider.teamId)!
      expect(groupCrash.description).toContain(rider.snapshot.displayName)
      expect(groupCrash.description).toContain(team.snapshot.teamName)
    })
  })

  it('uses one explicit OTL time-limit contract by stage type', () => {
    const flat = createValidInput().stage
    const mountain = {
      ...flat,
      terrainType: 'mountain' as const,
    }
    const itt = {
      ...flat,
      stageFormat: 'individual_time_trial' as const,
      terrainType: 'individual_time_trial' as const,
      finishType: 'time_trial_finish' as const,
    }

    expect(calculateUniversalPhase10TimeLimitPercentage(flat)).toBe(18)
    expect(calculateUniversalPhase10TimeLimitPercentage(mountain)).toBe(25)
    expect(calculateUniversalPhase10TimeLimitPercentage(itt)).toBe(30)
    expect(isUniversalPhase10OutsideTimeLimit(flat, 10_000, 11_800)).toBe(false)
    expect(isUniversalPhase10OutsideTimeLimit(flat, 10_000, 11_801)).toBe(true)
  })

  it('allows up to ten incidents while preserving later-phase capacity and real cooldowns', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))

    expect(result.phase10Incidents.maximumIncidentsPerStage).toBe(10)
    expect(result.phase10Incidents.maximumIncidentsPerPhase).toEqual({
      1: 2,
      2: 3,
      3: 3,
      4: 4,
    })
    expect(result.phase10Incidents.globalCooldownSeconds).toBe(120)
    expect(result.phase10Incidents.riderCooldownSeconds).toBe(900)
    expect(result.phase10Incidents.incidentCount).toBeLessThanOrEqual(10)
    expect(result.phase10Incidents.incidentCountByPhase[1]).toBeLessThanOrEqual(2)
    expect(result.phase10Incidents.incidentCountByPhase[2]).toBeLessThanOrEqual(3)
    expect(result.phase10Incidents.incidentCountByPhase[3]).toBeLessThanOrEqual(3)
    expect(result.phase10Incidents.incidentCountByPhase[4]).toBeLessThanOrEqual(4)

    result.phase10Incidents.incidents.slice(1).forEach((incident, index) => {
      expect(
        incident.raceSecond - result.phase10Incidents.incidents[index].raceSecond,
      ).toBeGreaterThanOrEqual(120)
    })

    const timesByRider = new Map<string, number[]>()
    result.phase10Incidents.incidents.forEach((incident) => {
      incident.riderIds.forEach((riderId) => {
        const times = timesByRider.get(riderId) ?? []
        times.push(incident.raceSecond)
        timesByRider.set(riderId, times)
      })
    })
    timesByRider.forEach((times) => {
      times.sort((a, b) => a - b)
      times.slice(1).forEach((time, index) => {
        expect(time - times[index]).toBeGreaterThanOrEqual(900)
      })
    })
  })

  it('keeps ordinary technical problems more frequent than ordinary individual crashes before race-state multipliers', () => {
    const shared = {
      tickSeconds: 30,
      weatherMultiplier: 1,
      currentSpeedKmh: 38,
      gradientPercent: 0,
      groupSize: 1,
      runtimeFatigue: 20,
      resistance: 70,
      raceIq: 70,
      preparationSupportMultiplier: 1,
      commandIntensityMultiplier: 1,
      raceSituationMultiplier: 1,
    } as const
    const technical = calculateUniversalPhase10IncidentProbability({
      ...shared,
      incidentKind: 'technical_incident',
      equipmentConditionPercent: 100,
      mechanicalIncidentRiskMultiplier: 1,
    })
    const individual = calculateUniversalPhase10IncidentProbability({
      ...shared,
      incidentKind: 'individual_crash',
    })

    expect(technical.baseProbabilityPer30Seconds).toBeGreaterThan(
      individual.baseProbabilityPer30Seconds,
    )
    expect(technical.finalProbability).toBeGreaterThan(individual.finalProbability)
  })

  it('raises crash probability for authoritative chase and sprint race situations', () => {
    const shared = {
      incidentKind: 'group_crash' as const,
      tickSeconds: 30,
      weatherMultiplier: 1,
      currentSpeedKmh: 50,
      gradientPercent: 0,
      groupSize: 70,
      runtimeFatigue: 45,
      resistance: 65,
      raceIq: 65,
      preparationSupportMultiplier: 1,
      commandIntensityMultiplier: 1.1,
    }
    const ordinary = calculateUniversalPhase10IncidentProbability({
      ...shared,
      raceSituationMultiplier: 1,
    })
    const hardChase = calculateUniversalPhase10IncidentProbability({
      ...shared,
      raceSituationMultiplier: 2.4,
    })
    const lateSprint = calculateUniversalPhase10IncidentProbability({
      ...shared,
      currentSpeedKmh: 60,
      raceSituationMultiplier: 4.5,
    })

    expect(hardChase.finalProbability).toBeGreaterThan(ordinary.finalProbability)
    expect(lateSprint.finalProbability).toBeGreaterThan(hardChase.finalProbability)
  })

  it('uses the real 900-second rider cooldown instead of stage-long incident immunity', () => {
    const engineSource = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )

    expect(engineSource).toContain('nextRiderEligibleSecondById')
    expect(engineSource).toContain('raceSecond + PHASE10_RIDER_COOLDOWN_SECONDS')
    expect(engineSource).not.toContain('previouslyAffected')
    expect(engineSource).toContain('sprint_congestion')
    expect(engineSource).toContain('peloton_chase')
    expect(engineSource).toContain(
      'left.roll / Math.max(left.probability.finalProbability, 1e-12)',
    )
  })

  it('keeps every accepted rider synchronized across final classification, replay and Phase 10 status groups', () => {
    const input = createPhase10HighRiskInput('phase10-high-5')
    const result = runRaceEngine(input)
    const accepted = input.riders.map((row) => row.riderId).sort()
    const classified = result.finishResolution.classification
      .map((row) => row.riderId)
      .sort()
    const statusGrouped = result.phase10Incidents.statusGroups
      .flatMap((row) => row.riderIds)
      .sort()

    expect(classified).toEqual(accepted)
    expect(statusGrouped).toEqual(accepted)
    expect(
      result.replayTimeline.checkpoints.every(
        (checkpoint) =>
          checkpoint.riderStates.length === accepted.length &&
          checkpoint.riderStates
            .map((row) => row.riderId)
            .sort()
            .every((id, index) => id === accepted[index]),
      ),
    ).toBe(true)
    expect(result.replaySynchronization.allCheckpointRidersComplete).toBe(true)
    expect(result.replaySynchronization.finalCheckpointMatchesClassification).toBe(
      true,
    )
  })

  it('keeps Phase 10 status and replay synchronization valid for ITT, prologue, TTT and pair time trial', () => {
    const formats = [
      withTimeTrialRules(
        withStageFormat(createExpandedFieldInput(26), {
          stageFormat: 'individual_time_trial',
          terrainType: 'individual_time_trial',
          finishType: 'time_trial_finish',
          profileType: 'time_trial',
        }),
        null,
      ),
      (() => {
        const formatted = withTimeTrialRules(
          withStageFormat(createExpandedFieldInput(26), {
            stageFormat: 'prologue',
            terrainType: 'prologue',
            finishType: 'prologue_finish',
            profileType: 'prologue',
          }),
          null,
        )
        const startPoint = formatted.points.find((point) => point.kmFromStart === 0)!
        const finishPoint = formatted.points.find((point) => point.isFinishPoint)!
        return {
          ...formatted,
          stage: {
            ...formatted.stage,
            distanceKm: 6,
            elevationGainM: 30,
            profilePoints: [
              { km: 0, elevationM: 20 },
              { km: 3, elevationM: 50 },
              { km: 6, elevationM: 28 },
            ],
          },
          points: [
            { ...startPoint, kmFromStart: 0, sortOrder: 0 },
            { ...finishPoint, kmFromStart: 6, sortOrder: 1 },
          ],
        }
      })(),
      withTimeTrialRules(
        withStageFormat(createExpandedFieldInput(24), {
          stageFormat: 'team_time_trial',
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
          profileType: 'time_trial',
        }),
        4,
      ),
      withTimeTrialRules(
        withStageFormat(createValidInput(), {
          stageFormat: 'pair_time_trial',
          terrainType: 'team_time_trial',
          finishType: 'team_time_trial_finish',
          profileType: 'time_trial',
        }),
        2,
      ),
    ]

    formats.forEach((base, index) => {
      const input = enablePhase10HighRisk(base, `phase10-cross-format-${index}`)
      const result = runRaceEngine(input)
      const accepted = input.riders.map((row) => row.riderId).sort()
      const classified = result.finishResolution.classification
        .map((row) => row.riderId)
        .sort()

      expect(result.phase10Incidents.active).toBe(true)
      expect(result.replaySynchronization.synchronized).toBe(true)
      expect(result.phase10Incidents.allAcceptedRidersHaveExactlyOneStatus).toBe(true)
      expect(result.phase10Incidents.allAcceptedRidersPresentInStatusGroups).toBe(true)
      expect(classified).toEqual(accepted)
      expect(
        result.replayTimeline.checkpoints.every(
          (checkpoint) => checkpoint.riderStates.length === accepted.length,
        ),
      ).toBe(true)
    })
  })

  it('keeps Phase 9/10 calculation ownership in the universal backend engine instead of the production page', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    const runnerSource = readFileSync(
      new URL(
        '../../netlify/functions/universal-race-stage-runner.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(pageSource).toContain('phase9Modifier.mechanical_incident_risk_multiplier')
    expect(pageSource).toContain('phase9Modifier.mechanical_time_loss_multiplier')
    expect(pageSource).toContain('phase9Modifier.equipment_condition_factor')
    expect(pageSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
    expect(runnerSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(1)
  })

  it('keeps every Rio Tour replay behind the same stored backend lifecycle with no development unlock', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

    expect(pageSource).not.toContain('ENABLE_RIO_TOUR_INTEGRATION_REPLAYS')
    expect(pageSource).not.toContain('isRioTourDevelopmentReplayUnlocked')
    expect(pageSource).toContain('get_universal_race_stage_replay_payload_v1')
    expect(pageSource).toContain('Replay unavailable')
    expect(pageSource).toContain(
      'Replay will be available at the scheduled stage time.',
    )
    expect(pageSource).not.toContain('Awaiting backend calculation')
    expect(pageSource).not.toContain('Replay not open yet')
    expect(pageSource).not.toContain('no browser fallback')
    expect(pageSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
  })

  it('publishes every road group behind the peloton as one C-family chase colour, including incident groups', () => {
    const result = runRaceEngine(createPhase10HighRiskInput('phase10-high-0'))

    result.replayTimeline.checkpoints.forEach((checkpoint) => {
      checkpoint.groups
        .filter((group) => group.physicalPosition === 'behind_peloton')
        .forEach((group) => {
          expect(group.displayCode.startsWith('C')).toBe(true)
          expect(group.colorKey).toBe('chasing_orange')
        })
    })
    expect(
      result.phase10Incidents.finalRoadGroups
        .filter((group) => group.physicalPosition === 'behind_peloton')
        .every(
          (group) =>
            group.displayCode.startsWith('C') &&
            group.colorKey === 'chasing_orange',
        ),
    ).toBe(true)
  })

  it('keeps Phase 10 pure and leaves persistent health creation to the existing application boundary', () => {
    const engineSource = readFileSync(
      new URL('./runRaceEngine.ts', import.meta.url),
      'utf8',
    )
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )

    expect(engineSource).toContain(
      "persistentHealthOutcome: 'application_health_system_after_finalization'",
    )
    expect(engineSource).toContain('persistentHealthWritesPerformed: false')
    expect(engineSource).toContain('directDatabaseWritesPerformed: false')
    expect(engineSource).not.toContain("from('rider_health_cases')")
    expect(engineSource).not.toContain('health_create_rider_case_v1(')
    expect(pageSource).toContain('Download Phase 10 JSON report')
  })
})



describe('Phase 11 replay progress guarantee', () => {
  it('allows replay-only synchronization defects without changing official results', () => {
    const result = runRaceEngine(createValidInput())
    const degraded = applyUniversalReplayProgressGuarantee({
      ...result.replaySynchronization,
      synchronized: false,
      allSameKilometreStatesConsistent: false,
      allFrontGroupTransfersPhysicallyValid: false,
      postCatchStateStable: false,
      issues: [
        'duplicate_group_display_code:stage-1|replay|post-catch',
        'same_kilometre_physical_state_mismatch:checkpoint-a->checkpoint-b',
        'front_group_transfer_without_physical_transition:rider-1:P->F1:checkpoint-c',
        'post_catch_group_transfer_without_physical_transition:rider-2:C4->C3:checkpoint-d',
      ],
    })

    expect(degraded.synchronized).toBe(true)
    expect(degraded.issues).toHaveLength(4)
    expect(degraded.allSameKilometreStatesConsistent).toBe(true)
    expect(degraded.allFrontGroupTransfersPhysicallyValid).toBe(true)
    expect(degraded.postCatchStateStable).toBe(true)
    expect(result.finishResolution.complete).toBe(true)
    expect(result.finishResolution.classification).toHaveLength(
      createValidInput().riders.length,
    )
  })

  it('still blocks hard sporting/final-result synchronization defects', () => {
    const result = runRaceEngine(createValidInput())
    const blocked = applyUniversalReplayProgressGuarantee({
      ...result.replaySynchronization,
      synchronized: false,
      finalCheckpointMatchesClassification: false,
      issues: ['final_checkpoint_identity_mismatch'],
    })

    expect(blocked.synchronized).toBe(false)
    expect(blocked.finalCheckpointMatchesClassification).toBe(false)
    expect(blocked.issues).toContain('final_checkpoint_identity_mismatch')
  })

  it('keeps result-visibility and rider-coverage failures hard', () => {
    const result = runRaceEngine(createValidInput())

    const visibleEarly = applyUniversalReplayProgressGuarantee({
      ...result.replaySynchronization,
      synchronized: false,
      allResultFieldsHiddenBeforeFinish: false,
      issues: ['result_fields_visible_before_finish:checkpoint-a'],
    })
    expect(visibleEarly.synchronized).toBe(false)

    const missingRider = applyUniversalReplayProgressGuarantee({
      ...result.replaySynchronization,
      synchronized: false,
      allCheckpointRidersComplete: false,
      issues: ['checkpoint_rider_coverage_mismatch:checkpoint-b'],
    })
    expect(missingRider.synchronized).toBe(false)
  })
})


describe('Phase 11B production lifecycle cutover', () => {
  it('maps one completed universal result into the production output contract without persistence side effects', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const output = buildProductionUniversalRaceOutput(input, result)

    expect(output.contractVersion).toBe(UNIVERSAL_RACE_STAGE_OUTPUT_CONTRACT)
    expect(output.applicationManifest.contractVersion).toBe(
      UNIVERSAL_PHASE11_MANIFEST_CONTRACT,
    )
    expect(output.universalResult).toBe(result)
    expect(output.publication.stageResults).toHaveLength(input.riders.length)
    expect(output.applicationManifest.riderStateRows).toHaveLength(
      result.postStageUpdate.persistenceContract.rowCount,
    )
    expect(output.applicationManifest.readyForApplication).toBe(true)
    expect(output.applicationManifest.persistenceApplied).toBe(false)
    expect(output.verification.officialOutputsWrittenByBuilder).toBe(false)
    expect(output.verification.historicalRowsMutatedByBuilder).toBe(false)
  })

  it('keeps every accepted rider synchronized across status, classification and the Phase 11 persistence manifest', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const output = buildProductionUniversalRaceOutput(input, result)
    const accepted = new Set(input.riders.map((rider) => rider.riderId))
    const classified = new Set(
      output.publication.stageResults.map((row) => row.riderId),
    )
    const persisted = new Set(
      output.applicationManifest.riderStateRows.map((row) => row.riderId),
    )

    expect(result.phase10Incidents.allAcceptedRidersHaveExactlyOneStatus).toBe(
      true,
    )
    expect(classified).toEqual(accepted)
    expect(persisted).toEqual(accepted)
    expect(
      output.publication.stageResults.every((row) =>
        UNIVERSAL_PHASE10_OFFICIAL_STATUSES.includes(row.status),
      ),
    ).toBe(true)
  })

  it('persists the exact Phase 8/9/10 handoff in the manifest instead of recalculating it', () => {
    const input = createValidInput()
    const result = runRaceEngine(input)
    const output = buildProductionUniversalRaceOutput(input, result)

    expect(output.applicationManifest.fatiguePersistenceRows).toEqual(
      result.postStageUpdate.persistenceContract.rows,
    )
    expect(output.applicationManifest.phase9ResourceUpdates).toEqual(
      result.phase9Modifiers.resourceUpdates,
    )
    expect(output.applicationManifest.healthCaseCandidates).toHaveLength(
      result.phase10Incidents.healthHandoff.persistentCaseCandidateCount,
    )
    expect(output.applicationManifest.validation.replaySynchronized).toBe(true)
    expect(
      output.applicationManifest.validation.finalResultsHiddenUntilFinalCheckpoint,
    ).toBe(true)
  })

  it('builds the canonical universal input from accepted production teams, riders, commands and Phase 9 payload', () => {
    const base = createValidInput()
    const sources: ProductionUniversalRaceSources = {
      race: {
        id: base.race.raceId,
        race_type: base.race.raceType,
        is_stage_race: base.race.raceType === 'stage_race',
        stage_count: base.race.stageCount,
      },
      stage: {
        id: base.stage.stageId,
        race_id: base.race.raceId,
        stage_number: base.stage.stageNumber,
        stage_format: base.stage.stageFormat,
        terrain_type: base.stage.terrainType,
        profile_type: base.stage.profileType,
        finish_type: base.stage.finishType,
        distance_km: base.stage.distanceKm,
        elevation_gain_m: base.stage.elevationGainM,
        is_summit_finish: base.stage.summitFinish,
      },
      profile: {
        distance_km: base.stage.distanceKm,
        terrain_type: base.stage.terrainType,
        profile_type: base.stage.profileType,
        elevation_gain_m: base.stage.elevationGainM,
        profile_points: base.stage.profilePoints.map((point) => ({
          km: point.km,
          elevation_m: point.elevationM,
        })),
      },
      stagePoints: base.points.map((point) => ({
        id: point.pointId,
        point_type: point.pointType,
        km_from_start: point.kmFromStart,
        name: point.name,
        kom_category: point.komCategory,
        points_scheme: point.pointsScheme,
        time_bonus_seconds: point.timeBonusSeconds,
        is_finish_point: point.isFinishPoint,
        sort_order: point.sortOrder,
        metadata: point.metadata,
      })),
      participantTeams: base.teams.map((team) => ({
        id: team.participantTeamId,
        race_id: base.race.raceId,
        team_id: team.teamId,
        club_id: team.clubId ?? team.teamId,
        participating_club_id: team.participatingClubId ?? team.teamId,
        status: 'accepted',
        team_name_snapshot: team.snapshot.teamName ?? team.teamId,
      })),
      participantRiders: base.riders.map((rider, index) => ({
        id: rider.participantRiderId,
        race_id: base.race.raceId,
        rider_id: rider.riderId,
        team_id: rider.teamId,
        start_number: index + 1,
        role_snapshot: rider.roleSnapshot,
        display_name: rider.snapshot.displayName,
      })),
      riderInputRows: base.riders.map((rider) => ({
        rider_id: rider.riderId,
        team_id: rider.teamId,
        rider_name: rider.snapshot.displayName,
        role_code: rider.roleSnapshot,
        sprint: rider.sprint,
        climbing: rider.climbing,
        time_trial: rider.timeTrial,
        flat: rider.flat,
        endurance: rider.endurance,
        recovery: rider.recovery,
        resistance: rider.resistance,
        race_iq: rider.raceIQ,
        teamwork: rider.teamwork,
        overall: rider.overall,
        morale: rider.morale,
        fatigue_before_stage: rider.fatigueBeforeStage,
        start_stamina: rider.startStamina,
        availability_status: rider.availabilityStatus,
        rider_snapshot_json: {
          race_sharpness: rider.raceSharpness,
          recent_form_score: rider.recentFormScore,
          season_result_points: rider.seasonResultPoints ?? 0,
        },
      })),
      phaseCommandRows: base.stagePlans.flatMap((plan) =>
        plan.riders.map((rider) => ({
          rider_id: rider.riderId,
          team_id: plan.teamId,
          team_plan: plan.teamTactic,
          role_code: rider.stageRole,
          phase_1_command: rider.commands.phase1,
          phase_2_command: rider.commands.phase2,
          phase_3_command: rider.commands.phase3,
          phase_4_command: rider.commands.phase4,
        })),
      ),
      lockedPlanRows: base.stagePlans.map((plan) => ({
        id: `plan-${plan.teamId}`,
        team_id: plan.teamId,
        club_id: plan.teamId,
        status: 'locked',
        team_tactic_json: { plan: plan.teamTactic },
      })),
      preStageLeaders: null,
      phase9Payload: {
        source: 'race_engine_get_stage_phase9_inputs_v1',
        modelVersion: 'phase11a-test',
        riderModifiers: base.riders.map((rider) => ({
          rider_id: rider.riderId,
          team_id: rider.teamId,
          preparation_applied: false,
          in_stage_energy_cost_multiplier: 1,
          post_stage_fatigue_multiplier: 1,
          post_stage_recovery_bonus_points: 0,
          health_incident_risk_multiplier: 1,
          mechanical_incident_risk_multiplier: 1,
          mechanical_time_loss_multiplier: 1,
        })),
        preparation: {
          equipment: {},
          staff: {},
          assets: {},
          raceSupplies: {},
          standardizedBonuses: {},
        },
      },
      deterministicSeed: 'phase11a-production-adapter-test',
    }

    const productionInput = buildProductionUniversalRaceEngineInput(sources)
    expect(productionInput.riders).toHaveLength(base.riders.length)
    expect(productionInput.teams).toHaveLength(base.teams.length)
    expect(productionInput.stagePlans).toHaveLength(base.stagePlans.length)
    expect(productionInput.engine.deterministicSeed).toBe(
      'phase11a-production-adapter-test',
    )
    expect(productionInput.incidentModel?.enabled).toBe(true)
    expect(productionInput.preparation).toBeDefined()
    expect(() => runRaceEngine(productionInput)).not.toThrow()
  })

  it('installs one disabled Phase 11B lifecycle, one scheduled backend calculation path, exact-once persistence and a read-only production replay', () => {
    const pageSource = readFileSync(
      new URL('../pages/dashboard/RaceDetailPage.tsx', import.meta.url),
      'utf8',
    )
    const migrationSource = readFileSync(
      new URL(
        '../../supabase/migrations/20260818_phase11b_universal_production_cutover.sql',
        import.meta.url,
      ),
      'utf8',
    )
    const runnerSource = readFileSync(
      new URL(
        '../../netlify/functions/universal-race-stage-runner.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(pageSource).toContain('get_universal_race_stage_replay_payload_v1')
    expect(pageSource).toContain("production_authoritative_run")
    expect(pageSource).toContain("production_authoritative_pending")
    expect(pageSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(0)
    expect(pageSource).not.toContain('ENABLE_RIO_TOUR_INTEGRATION_REPLAYS')

    expect(runnerSource).toContain("schedule: '* * * * *'")
    expect(runnerSource.match(/runRaceEngine\(/g) ?? []).toHaveLength(1)
    expect(runnerSource).toContain('universal_race_stage_claim_next_due_v1')
    expect(runnerSource).toContain('universal_race_stage_process_lifecycle_v1')
    expect(runnerSource).toContain('UNIVERSAL_RACE_WORKER_SECRET')
    expect(runnerSource).not.toContain('workerSecret(request) === serviceRoleKey')

    expect(migrationSource).toContain('typescript_lifecycle_enabled = false')
    expect(migrationSource).toContain(
      'create or replace function public.universal_race_stage_claim_next_due_v1',
    )
    expect(migrationSource).toContain(
      'create or replace function public.universal_race_stage_finalize_v1',
    )
    expect(migrationSource).toContain('universal_phase11b_calculated_hidden_v1')
    expect(migrationSource).toContain('race_engine_apply_stage_fatigue_v1')
    expect(migrationSource).toContain('apply_race_stage_supply_usage_v1')
    expect(migrationSource).toContain('race_engine_apply_stage_equipment_asset_wear_v1')
    expect(migrationSource).toContain('health_create_rider_case_v1')
    expect(migrationSource).toContain('race_engine_write_cumulative_classifications_v1')
    expect(migrationSource).toContain("'race_engine_ts_v1'")
    expect(migrationSource).toContain("'deterministic_road_race_v1'")
    expect(migrationSource).toContain(
      "set_config('app.race_engine_writer_family', 'typescript', true)",
    )
    expect(migrationSource).not.toContain('cron.schedule')
    expect(migrationSource).not.toContain('order by team.team_id')
  })

  it('repairs Phase 11B publication so static profile reports cannot block results and one broken stage cannot starve the queue', () => {
    const repairSource = readFileSync(
      new URL(
        '../../supabase/migrations/20260819_phase11b_publication_queue_repair.sql',
        import.meta.url,
      ),
      'utf8',
    )

    expect(repairSource).toContain(
      'create or replace function public.universal_race_stage_finalize_v1',
    )
    expect(repairSource).toContain(
      "report_event.metadata ->> 'output_contract' = 'universal_race_stage_output_v1'",
    )
    expect(repairSource).toContain(
      "delete from public.race_stage_report_events report_event",
    )
    expect(repairSource).toContain(
      "nullif(report_event.metadata ->> 'simulation_run_id', '') is null",
    )
    expect(repairSource).toContain('v_removed_setup_report_event_count')
    expect(repairSource).toContain(
      "nullif(report_event.metadata ->> 'simulation_run_id', '') is not null",
    )
    expect(repairSource).not.toContain(
      'or exists (select 1 from public.race_stage_report_events report_event where report_event.stage_id = p_stage_id)',
    )
    expect(repairSource).toContain(
      'create or replace function public.universal_race_stage_process_lifecycle_v1',
    )
    expect(repairSource).toContain('exception when others then')
    expect(repairSource).toContain("'publication_failure_count'")
    expect(repairSource).toContain("'publication_failures'")
    expect(repairSource).toContain("last_error = sqlerrm")
    expect(repairSource).toContain('typescript_replay_duration_real_seconds')
  })
})
