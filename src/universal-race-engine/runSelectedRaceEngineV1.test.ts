import { describe, expect, it } from 'vitest'
import {
  PPM_UNIVERSAL_RACE_ENGINE_KEY,
  PPM_UNIVERSAL_RACE_ENGINE_VERSION,
  runRaceEngine as runBaselineRaceEngine,
  type UniversalRaceEngineInput,
} from './runRaceEngine.ts'
import { runRaceEngine as runExperimentalMountainCoreV1 } from './runMountainExperimentalEngineV1.ts'
import { runRaceEngine as runBreakawayCoreV1 } from './runBreakawayExperimentalEngineV1.ts'
import { isBreakawayOfficialPilotStageV1 } from './breakawayOfficialPilotV1.ts'
import { runSelectedRaceEngineV1, getSelectedRaceEngineModuleV1 } from './runSelectedRaceEngineV1.ts'
import { runOfficialWithBreakawayShadowV1 } from './runBreakawayShadowWithOfficialV1.ts'

/**
 * All data below are synthetic test fixtures, copied from the original
 * universal engine unit tests. They are never real production race inputs.
 */
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

function syntheticMountainPilotInput(): UniversalRaceEngineInput {
  const base = createValidInput()
  const stageId = '62c7ca62-b6aa-470f-bf32-0822f64849c0'
  return {
    ...base,
    engine: { ...base.engine, deterministicSeed: 'mountain-experimental-synthetic-physics-proof' },
    stage: {
      ...base.stage,
      stageId,
      terrainType: 'mountain',
      profileType: 'climber',
      finishType: 'flat_finish',
      summitFinish: false,
      summitFinishSelectivityV1: false,
      elevationGainM: 2440,
      terrainPercentages: { flat: 18, hilly: 32, mountain: 50, cobbled: 0 },
      profilePoints: [
        { km: 0, elevationM: 100 },
        { km: 48, elevationM: 800 },
        { km: 82, elevationM: 1400 },
        { km: 108, elevationM: 2300 },
        { km: 120, elevationM: 1800 },
      ],
    },
    points: base.points.map((point) => ({ ...point, stageId })),
  }
}

describe('isolated experimental mountain executable', () => {
  it('runs the original solver unchanged for nonpilot races', () => {
    const normal = createValidInput()
    expect(runSelectedRaceEngineV1(normal)).toEqual(runBaselineRaceEngine(normal))
  })

  it('preserves the full baseline result for every unapproved mountain stage', () => {
    const pilotShape = syntheticMountainPilotInput()
    const nonpilotStageId = 'not-a-pilot-stage'
    const nonpilot = {
      ...pilotShape,
      stage: { ...pilotShape.stage, stageId: nonpilotStageId },
      points: pilotShape.points.map((point) => ({ ...point, stageId: nonpilotStageId })),
    }
    expect(runSelectedRaceEngineV1(nonpilot)).toEqual(runBaselineRaceEngine(nonpilot))
  })

  it('selects the same solver module for checkpointed and one-shot execution', () => {
    const nonpilot = createValidInput()
    const experimental = syntheticMountainPilotInput()
    expect(getSelectedRaceEngineModuleV1(nonpilot.stage).runRaceEngine)
      .toBe(runBaselineRaceEngine)
    expect(getSelectedRaceEngineModuleV1(experimental.stage).runRaceEngine)
      .toBe(runExperimentalMountainCoreV1)
  })

  it('selects the experimental executable for an approved mountain stage', () => {
    const mountain = syntheticMountainPilotInput()
    const direct = runExperimentalMountainCoreV1(mountain)
    const selected = runSelectedRaceEngineV1(mountain)
    expect(selected).toEqual(direct)
    expect(selected.finishResolution.complete).toBe(true)
    expect(selected.finishResolution.classification).toHaveLength(mountain.riders.length)
  })

  it('preserves official sporting results when changing mountain replay grouping only', () => {
    const mountain = syntheticMountainPilotInput()
    const baseline = runBaselineRaceEngine(mountain)
    const experimental = runExperimentalMountainCoreV1(mountain)
    // Pilot replay group identity is now allowed to differ until the physical
    // catch event, but sporting time, rank and classification must not change.
    expect(experimental.finishResolution).toEqual(baseline.finishResolution)
    expect(experimental.groupAndTimeResolution).toEqual(baseline.groupAndTimeResolution)
    expect(experimental.calibrationSummary).toEqual(baseline.calibrationSummary)
  })
})


describe('Breakaway V1: official result identity and failure isolation',()=>{
  const BACKA='5523cf76-8fd4-4a12-ab28-7f285c9829ff'
  function selectedInput(){
    const base=createValidInput()
    return {
      ...base,
      stage:{...base.stage,stageId:BACKA},
      points:base.points.map(point=>({...point,stageId:BACKA})),
    }
  }
  const preview=(input:UniversalRaceEngineInput)=>({
    stage:{
      stageId:input.stage.stageId,stageFormat:input.stage.stageFormat,
      terrainType:input.stage.terrainType,distanceKm:input.stage.distanceKm,
    },
    pelotonChaseIntensity:0.15,
    riders:input.riders.map((r,i)=>({
      riderId:r.riderId,teamId:r.teamId,flat:r.flat,
      climbing:r.climbing,endurance:r.endurance,
      fatigue:r.fatigueBeforeStage,
      intent:i===0||i===2?'breakaway' as const:'neutral' as const,
      cooperation:0.9,
    })),
  })
  it('computes the official result ONCE and preserves finish, replay, scoring',()=>{
    const input=selectedInput(),before=JSON.stringify(input)
    const expected=runSelectedRaceEngineV1(input)
    let officialExecutions=0,previewBuilds=0
    const result=runOfficialWithBreakawayShadowV1(
      input,(v)=>{
        officialExecutions++
        return runSelectedRaceEngineV1(v)
      },
      (v)=>{previewBuilds++;return preview(v)},
    )
    expect(officialExecutions).toBe(1)
    expect(previewBuilds).toBe(1)
    expect(result.officialResult).toEqual(expected)
    expect(result.officialResult.finishResolution).toEqual(expected.finishResolution)
    expect(result.officialResult.replayTimeline).toEqual(expected.replayTimeline)
    expect(result.officialResultAuthoritative).toBe(true)
    expect(result.shadowStatus).toBe('evaluated')
    expect(result.shadowResult?.authority).toBe('shadow_only')
    expect(result.shadowResult?.status).not.toBe('not_selected')
    expect(JSON.stringify(input)).toBe(before)
  })
  it('bypasses the preview entirely for unlisted flat/mountain races',()=>{
    const input=createValidInput(),before=JSON.stringify(input)
    let builderCalled=false
    const result=runOfficialWithBreakawayShadowV1(
      input,runSelectedRaceEngineV1,()=>{builderCalled=true;throw new Error('unexpected')},
    )
    expect(builderCalled).toBe(false)
    expect(result.shadowStatus).toBe('not_selected')
    expect(result.shadowResult).toBeNull()
    expect(result.officialResult).toEqual(runSelectedRaceEngineV1(input))
    expect(JSON.stringify(input)).toBe(before)
  })
  it('retains official results when preview mapping throws or mismatches the stage',()=>{
    const input=selectedInput(),expected=runSelectedRaceEngineV1(input)
    const failed=runOfficialWithBreakawayShadowV1(
      input,runSelectedRaceEngineV1,()=>{throw new Error('preview is broken')},
    )
    expect(failed.shadowStatus).toBe('failed')
    expect(failed.officialResult).toEqual(expected)
    const mismatched=runOfficialWithBreakawayShadowV1(
      input,runSelectedRaceEngineV1,(v)=>({
        ...preview(v),stage:{...preview(v).stage,stageId:'wrong-stage'},
      }),
    )
    expect(mismatched.shadowStatus).toBe('failed')
    expect(mismatched.officialResult).toEqual(expected)
    expect(mismatched.officialResultAuthoritative).toBe(true)
  })
})

describe('Breakaway V1 full sporting core stage-authority selection',()=>{
  const BAČKA='5523cf76-8fd4-4a12-ab28-7f285c9829ff'
  const BINCHE='335708f7-d56a-4816-9068-38399e8f74e3'
  const FRUSKA='f5af8665-91c1-4585-937e-11fb94f65819'
  function breakawayFixture(stageId:string,terrainType:'flat'|'hilly'='flat'){
    const source=createValidInput()
    return {
      ...source,
      engine:{...source.engine,deterministicSeed:'breakaway-complete-pilot-synthetic-v1'},
      stage:{
        ...source.stage,stageId,terrainType,
        profileType:terrainType==='flat'?'sprinter' as const:'hilly' as const,
      },
      points:source.points.map(p=>({...p,stageId})),
    }
  }
  it('selects the complete independent core for both explicitly approved pilot stages',()=>{
    for(const id of [BAČKA,BINCHE]){
      const stage=breakawayFixture(id,id===BAČKA?'flat':'hilly')
      expect(getSelectedRaceEngineModuleV1(stage.stage).runRaceEngine)
        .toBe(runBreakawayCoreV1)
      const selected=runSelectedRaceEngineV1(stage)
      const direct=runBreakawayCoreV1(stage)
      expect(selected).toEqual(direct)
      expect(selected.finishResolution.complete).toBe(true)
      expect(selected.finishResolution.classification).toHaveLength(stage.riders.length)
      expect(selected.replaySynchronization.synchronized).toBe(true)
      expect(selected.postStageUpdate.persistenceContract.directDatabaseWritePerformed)
        .toBe(false)
      expect(selected.phase9Acceptance.passed).toBe(true)
      expect(runSelectedRaceEngineV1(stage)).toEqual(selected)
    }
  })
  it('never selects the specialist core for other candidate stages, wrong terrain or TT',()=>{
    for(const stage of [
      breakawayFixture(BINCHE,'flat'),
      breakawayFixture(FRUSKA,'hilly'),
      breakawayFixture('unlisted-flat-stage'),
      breakawayFixture(BAČKA,'hilly'),
      {
        ...breakawayFixture(BAČKA),
        stage:{...breakawayFixture(BAČKA).stage,stageFormat:'individual_time_trial' as const},
      },
    ]){
      expect(getSelectedRaceEngineModuleV1(stage.stage).runRaceEngine)
        .toBe(runBaselineRaceEngine)
    }
    expect(isBreakawayOfficialPilotStageV1(breakawayFixture(BAČKA).stage)).toBe(true)
    expect(isBreakawayOfficialPilotStageV1(breakawayFixture(BINCHE,'hilly').stage)).toBe(true)
    expect(isBreakawayOfficialPilotStageV1(breakawayFixture(FRUSKA,'hilly').stage)).toBe(false)
    expect(()=>runBreakawayCoreV1(breakawayFixture('unlisted-flat-stage')))
      .toThrow('refuses non-allowlisted stages')
  })
  it('retains all complete official scoring and replay contracts in specialist mode',()=>{
    const input=breakawayFixture(BAČKA)
    const official=runSelectedRaceEngineV1(input)
    const expected=runBaselineRaceEngine(input)
    expect(official.stageId).toBe(expected.stageId)
    expect(official.finishResolution.classification.map(x=>x.riderId).sort())
      .toEqual(expected.finishResolution.classification.map(x=>x.riderId).sort())
    expect(official.intermediatePointFinalization).toBeDefined()
    expect(official.phase10Incidents).toBeDefined()
    expect(official.replayTimeline.checkpoints.length).toBeGreaterThan(0)
    expect(official.phase78Acceptance.issues.filter(x=>x.startsWith('blocking')))
      .toHaveLength(0)
  })
})
