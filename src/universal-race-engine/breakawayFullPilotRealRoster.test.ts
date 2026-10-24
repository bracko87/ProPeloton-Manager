/**
 * Full official-contract sandbox for the FIRST breakaway pilot, 96 actual
 * anonymized registered rider attributes with simulated starting readiness
 * and hypothetical team orders. Never run or write a real stage.
 *
 * Original source data captured on 2026-10-23; real Bačka route / points.
 */
import {describe,expect,it} from 'vitest'
import {runRaceEngine as acceptedEngine,
  PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION,
  type UniversalRaceEngineInput} from './runRaceEngine.ts'
import {runSelectedRaceEngineV1,getSelectedRaceEngineModuleV1,
  selectCompleteRaceEngineLaneV1} from './runSelectedRaceEngineV1.ts'
import {runRaceEngine as specialistEngine,
  calculateBreakawayAutomaticPursuitCommitmentV1} from './runBreakawayExperimentalEngineV1.ts'
import * as baselineRoadCore from './runRaceEngine.ts'
import * as mountainRoadCore from './runMountainExperimentalEngineV1.ts'
import * as breakawayRoadCore from './runBreakawayExperimentalEngineV1.ts'

describe('Phase 4 experimental automatic chase effort budget', () => {
  const team = (workerCount: number, averageEnergy: number) => ({
    workerCount, averageEnergy,
  })

  it('never creates a chase coalition without interested, energetic teams', () => {
    expect(calculateBreakawayAutomaticPursuitCommitmentV1([], 1, 0))
      .toEqual({ workerCount: 0, teamCount: 0 })
    expect(calculateBreakawayAutomaticPursuitCommitmentV1(
      [team(6, 0)], 1, 0,
    )).toEqual({ workerCount: 0, teamCount: 0 })
    expect(calculateBreakawayAutomaticPursuitCommitmentV1(
      [team(6, 70)], 0, 0,
    )).toEqual({ workerCount: 0, teamCount: 0 })
  })

  it('caps automatic participation per team rather than counting all rouleurs', () => {
    expect(calculateBreakawayAutomaticPursuitCommitmentV1(
      [team(6, 70)], 1, 0,
    )).toEqual({ workerCount: 2, teamCount: 1 })
    expect(calculateBreakawayAutomaticPursuitCommitmentV1(
      [team(60, 70)], 1, 0,
    )).toEqual({ workerCount: 2, teamCount: 1 })
  })

  it('ramps late participation and reduces it with workload and energy', () => {
    const interestedTeams = Array.from({ length: 4 }, () => team(6, 70))
    expect(calculateBreakawayAutomaticPursuitCommitmentV1(
      interestedTeams, 0.25, 0,
    )).toEqual({ workerCount: 2, teamCount: 1 })
    expect(calculateBreakawayAutomaticPursuitCommitmentV1(
      interestedTeams, 1, 1,
    )).toEqual({ workerCount: 4, teamCount: 2 })
    expect(calculateBreakawayAutomaticPursuitCommitmentV1(
      interestedTeams.map(() => team(6, 35)), 1, 1,
    )).toEqual({ workerCount: 2, teamCount: 1 })
  })
})


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


const STAGE_ID='5523cf76-8fd4-4a12-ab28-7f285c9829ff'
const ATTRS:readonly (readonly [number,number,number,number,number])[]=[[0,71,65,67,100],[0,64,68,69,100],[0,73,67,77,100],[0,73,69,76,100],[0,66,69,75,100],[0,75,75,77,100],[1,61,56,59,65],[1,60,61,64,58],[1,62,68,66,64],[1,72,74,74,42],[1,62,58,63,59],[1,63,63,72,55],[2,71,80,82,99],[2,66,64,70,100],[2,72,74,79,100],[2,63,66,68,100],[2,74,86,77,84],[2,60,62,65,100],[3,75,71,80,31],[3,60,64,69,100],[3,74,69,76,70],[3,57,64,64,100],[3,62,62,70,84],[3,61,62,65,100],[4,90,81,86,100],[4,85,87,92,100],[4,89,87,90,100],[4,84,87,95,94],[4,84,86,91,100],[4,87,79,85,93],[5,75,71,77,84],[5,68,74,79,100],[5,63,66,67,100],[5,67,69,76,100],[5,67,59,71,100],[5,64,69,74,100],[6,55,66,64,100],[6,65,54,65,100],[6,69,78,70,95],[6,58,65,68,100],[6,58,65,65,100],[6,63,59,70,36],[7,64,65,69,36],[7,63,55,63,53],[7,71,70,73,11],[7,53,57,60,0],[7,68,68,66,23],[7,53,56,56,14],[8,66,64,67,83],[8,63,70,70,85],[8,61,58,66,94],[8,62,61,66,94],[8,60,59,62,82],[8,62,64,63,93],[9,67,66,72,48],[9,64,61,68,71],[9,61,59,64,84],[9,55,57,66,81],[9,58,65,63,57],[9,67,76,78,45],[10,59,64,60,83],[10,57,59,64,79],[10,59,71,62,80],[10,54,56,62,94],[10,54,53,61,64],[10,58,60,69,95],[11,63,52,59,87],[11,69,68,71,70],[11,63,57,64,97],[11,67,67,68,31],[11,68,67,70,12],[11,57,63,66,75],[12,62,62,63,80],[12,59,55,63,80],[12,62,59,66,70],[12,70,73,74,34],[12,57,62,61,53],[12,74,75,75,33],[13,63,55,64,84],[13,55,58,60,94],[13,69,69,66,94],[13,59,59,67,40],[13,54,60,65,94],[13,56,51,60,94],[14,62,58,65,65],[14,50,53,58,0],[14,60,65,68,79],[14,57,61,62,65],[14,61,55,66,66],[14,61,63,71,81],[15,69,66,73,67],[15,58,63,61,97],[15,55,63,65,52],[15,66,72,77,12],[15,61,62,66,14],[15,54,60,64,45]]
const PROFILE:readonly (readonly [number,number])[]=[[0,80],[16,82],[32,78],[46,83],[60,88],[76,94],[92,104],[102,110],[118,113],[130,116],[139.2,114]]
const POINTS=[["START",0,"Start",[],[],false,0],["INTERMEDIATE_SPRINT",46,"Sprint 1",[12,8,5,3,1],[3,2,1],false,10],["INTERMEDIATE_SPRINT",102,"Sprint 2",[10,6,4,2,1],[3,2,1],false,20],["FINISH",139.2,"Finish",[25,20,16,14,12,10,8,6,4,2],[10,6,4],true,30]] as const
function scenario(chase:'minimal'|'organized', sustainEscape=false):UniversalRaceEngineInput {
  const base=createValidInput()
  // Cooperating escape candidates: strongest available *per separate team*.
  const skill=(r:typeof attrs[number])=>r[1]*0.55+r[3]*0.4-r[4]*0.12
  const attrs=ATTRS.map(([team,flat,climbing,endurance,fatigue],i)=>({
    team,flat,climbing,endurance,fatigue,i,
  }))
  const best=new Map<number,typeof attrs[number]>()
  for(const a of attrs){
    if(a.endurance<40 || a.fatigue>=96)continue
    const prev=best.get(a.team)
    if(!prev||skill(a)>skill(prev))best.set(a.team,a)
  }
  const selected=[...best.values()].sort((a,b)=>skill(b)-skill(a)).slice(0,5)
  const leaders=new Set(selected.map(a=>a.i))
  const leadAttackIndex=selected[0]?.i
  const teamIds=[...new Set(attrs.map(a=>a.team))].sort((a,b)=>a-b)
  const allRiders=attrs.map(a=>{
    const id='R'+String(a.i+1).padStart(3,'0'),teamId='T'+String(a.team+1).padStart(2,'0')
    const overall=Math.round(a.flat*0.45+a.climbing*0.15+a.endurance*0.4)
    return {
      ...createRider(id,'participant-'+id,teamId,overall),
      participatingClubId:'C'+String(a.team+1).padStart(2,'0'),
      flat:a.flat,climbing:a.climbing,endurance:a.endurance,
      fatigueBeforeStage:a.fatigue,
      // A synthetic start estimate: NOT a real locked start-line energy.
      startStamina:Math.max(25,90-a.fatigue*0.36),
      raceIQ:Math.min(92,overall+5),teamwork:Math.min(95,overall+7),
    }
  })
  const teams=teamIds.map(t=>{
    const teamId='T'+String(t+1).padStart(2,'0')
    const ids=allRiders.filter(r=>r.teamId===teamId).map(r=>r.riderId)
    return {
      ...base.teams[0],participantTeamId:'P'+teamId,
      teamId,clubId:'C'+String(t+1).padStart(2,'0'),
      participatingClubId:'C'+String(t+1).padStart(2,'0'),
      ownerClubId:'C'+String(t+1).padStart(2,'0'),
      raceTeamEntryId:'E'+teamId,acceptedRiderIds:ids,
      snapshot:{teamName:teamId,countryCode:'RS'},
    }
  })
  const teamPlans=teamIds.map(t=>{
    const teamId='T'+String(t+1).padStart(2,'0')
    const inTeam=attrs.filter(a=>a.team===t)
    const hasAttacker=inTeam.some(a=>leaders.has(a.i))
    return {
      teamId,
      teamTactic:hasAttacker?'aggressive' as const:
        chase==='organized'?'balanced' as const:'balanced' as const,
      status:'locked' as const,locked:true,defaulted:false,
      riders:inTeam.map((r,j)=>{
        const hasBreak=leaders.has(r.i)
        return {
          riderId:'R'+String(r.i+1).padStart(3,'0'),
          stageRole:hasBreak?'breakaway_rider' as const:
            chase==='organized'?'breakaway_chaser' as const:'rouleur' as const,
          commands:hasBreak
            ? {phase1:r.i===leadAttackIndex?'attack' as const:'join_breakaway' as const,phase2:'control_tempo' as const,
                phase3:sustainEscape?'control_tempo' as const:'conserve_energy' as const,
                phase4:'ride_for_stage_result' as const}
            : chase==='organized'
              ? {phase1:'stay_near_front' as const,phase2:'chase_breakaway' as const,
                  phase3:'chase_breakaway' as const,phase4:'chase_breakaway' as const}
              : {phase1:'conserve_energy' as const,phase2:'conserve_energy' as const,
                  phase3:'conserve_energy' as const,phase4:'stay_near_front' as const},
          equipmentSelection:null,supplySelection:null,
        }
      }),
      metadata:{scenario:chase},
    }
  })
  return {
    ...base,
    engine:{...base.engine,deterministicSeed:'breakaway-BACKA-registered-roster-'+chase},
    stage:{
      ...base.stage,stageId:STAGE_ID,stageNumber:1,terrainType:'flat',
      profileType:'sprinter',distanceKm:139.2,elevationGainM:420,
      terrainPercentages:{flat:92,hilly:8,mountain:0,cobbled:0},
      profilePoints:PROFILE.map(([km,elevationM])=>({km,elevationM})),
    },
    points:POINTS.map(([pointType,km,name,pointsScheme,timeBonusSeconds,
      isFinishPoint,sortOrder],i)=>({
      pointId:'pt-'+i,stageId:STAGE_ID,pointType,kmFromStart:km,name,
      komCategory:null,pointsScheme:[...pointsScheme],
      timeBonusSeconds:[...timeBonusSeconds],isFinishPoint,sortOrder,metadata:{},
    })),
    teams,riders:allRiders,stagePlans:teamPlans,
  } as UniversalRaceEngineInput
}
describe('full sporting breakaway pilot Bačka 96-rider real profile, anonymous cohort',()=>{
  it('tests full specialist core with tentative escape and minimal peloton chase',()=>{
    const input=scenario('minimal')
    expect(input.riders).toHaveLength(96)
    expect(input.stagePlans).toHaveLength(16)
    expect(selectCompleteRaceEngineLaneV1(input.stage)).toBe('experimental_breakaway_v1')
    expect(getSelectedRaceEngineModuleV1(input.stage).runRaceEngine).toBe(specialistEngine)
    const before=JSON.stringify(input)
    const core=getSelectedRaceEngineModuleV1(input.stage)
    const p9=core.buildUniversalPhase9ModifierSummary(input)
    const calc=core.applyUniversalPhase9ModifiersToInput(input,p9)
    const readiness=core.calculateAllRiderReadiness(calc.riders)
    const cmds=core.buildRoadCommandResolution(calc,readiness)
    const opening=core.resolveRoadPhase1Opening(calc,readiness,cmds)
    const o=opening.phase1Opening
    console.log('BREAKAWAY_OPENING_BEFORE_OFFICIAL='+JSON.stringify({
      officialStage:input.stage.stageId,active:opening.active,
      endGap:o?.endGapSeconds,catchKm:o?.breakawayCatchKm,
      breakawayRiders:o?.breakawayRiderIds,
      attackAttempts:o?.attackAttempts.map(a=>({
        rider:a.riderId,command:a.command,wave:a.waveCode,
        attemptKm:a.attemptKm,success:a.attackSucceeded,
        accepted:a.acceptedEscapeLaunch,initialGap:a.initialGapSeconds,
        probability:a.attackSuccessProbability,roll:a.deterministicOutcomeRoll,
      })),
      physicalGapTrajectory:o?.physicalGapTrajectory,
    }))
    const result=runSelectedRaceEngineV1(input)
    console.log('BREAKAWAY_FULL_PILOT_DIAGNOSTIC='+JSON.stringify({
      phase1PlanJoiners:input.stagePlans.flatMap(p=>p.riders)
        .filter(x=>x.commands.phase1==='join_breakaway').length,
      roadJoinerCount:result.roadCommandResolution.riders.filter(x=>
        x.phases[0]?.resolvedCommand==='join_breakaway').length,
      firstWaveAttacks:result.roadRaceResolution.phase1Opening?.attackAttempts.map(x=>({
        riderId:x.riderId,command:x.command,attackSucceeded:x.attackSucceeded,
        acceptedEscapeLaunch:x.acceptedEscapeLaunch,
        probability:x.attackSuccessProbability,roll:x.deterministicOutcomeRoll,
      })),
      phase1Active:result.roadRaceResolution.active,
    }))
    expect(JSON.stringify(input)).toBe(before)
    expect(result.validationPassed).toBe(true)
    expect(result.finishResolution.complete).toBe(true)
    expect(result.finishResolution.classification).toHaveLength(96)
    expect(result.replaySynchronization.synchronized).toBe(true)
    expect(result.phase9Acceptance.passed).toBe(true)
    expect(result.phase78Acceptance.passed).toBe(true)
    expect(result.postStageUpdate.persistenceContract.directDatabaseWritePerformed).toBe(false)
    const p=result.roadRaceResolution
    const resultSummary={
      scenario:'minimal',pilotStage:STAGE_ID,
      opener:p.phase1Opening?.breakawayRiderIds.length??0,
      openingEndGapSeconds:p.phase1Opening?.endGapSeconds??0,
      phase2GapSeconds:p.phase2Development?.endGapSeconds??0,
      phase3GapSeconds:p.phase3Decisive?.physicalEndGapSeconds??0,
      phase4GapSeconds:p.phase4Finish?.endGapSeconds??0,
      winner:result.finishResolution.winnerRiderId,
      finalGroupCount:result.calibrationSummary.finalGroupCount,
      breakawaySurvived:result.calibrationSummary.breakawaySurvived,
      breakawayCaught:result.calibrationSummary.breakawayCaught,
      lastGapSeconds:result.finishResolution.classification.at(-1)?.gapSeconds,
      replayCount:result.replayTimeline.checkpoints.length,
      issues:result.replaySynchronization.issues,
    }
    console.log('BREAKAWAY_FULL_PILOT_REAL_ROSTER='+JSON.stringify(resultSummary))
    expect(result.finishResolution.classification.every(x=>x.status==='finished'||x.status==='otl'||x.status==='dnf'||x.status==='dns')).toBe(true)
  })
  it('runs the same 96-rider source with an organized peloton chase',()=>{
    const input=scenario('organized')
    const official=runSelectedRaceEngineV1(input)
    expect(official.finishResolution.complete).toBe(true)
    expect(official.replaySynchronization.synchronized).toBe(true)
    const p=official.roadRaceResolution
    console.log('BREAKAWAY_FULL_PILOT_REAL_ROSTER='+JSON.stringify({
      scenario:'organized',pilotStage:STAGE_ID,
      opener:p.phase1Opening?.breakawayRiderIds.length??0,
      openingEndGapSeconds:p.phase1Opening?.endGapSeconds??0,
      phase2GapSeconds:p.phase2Development?.endGapSeconds??0,
      phase3GapSeconds:p.phase3Decisive?.physicalEndGapSeconds??0,
      phase4GapSeconds:p.phase4Finish?.endGapSeconds??0,
      winner:official.finishResolution.winnerRiderId,
      finalGroupCount:official.calibrationSummary.finalGroupCount,
      breakawaySurvived:official.calibrationSummary.breakawaySurvived,
      breakawayCaught:official.calibrationSummary.breakawayCaught,
      replayCount:official.replayTimeline.checkpoints.length,
      issues:official.replaySynchronization.issues,
    }))
  })
  it('audits deterministic halfway survival across different seeds and chase orders',()=>{
    const rows: Array<Record<string, unknown>>=[]
    for(const chase of ['minimal','organized'] as const){
      for(const seed of ['seed-a','seed-b']){
        const input=scenario(chase)
        input.engine.deterministicSeed += '-'+seed
        const before=JSON.stringify(input)
        const result=runSelectedRaceEngineV1(input)
        expect(JSON.stringify(input)).toBe(before)
        expect(result.validationPassed).toBe(true)
        expect(result.replaySynchronization.synchronized).toBe(true)
        expect(result.finishResolution.complete).toBe(true)
        expect(result.finishResolution.classification).toHaveLength(96)
        expect(result.postStageUpdate.persistenceContract.directDatabaseWritePerformed).toBe(false)
        const road=result.roadRaceResolution
        const p2=road.phase2Development
        const halfwayPrimaryGap=p2?.endGapSeconds??0
        const halfwaySecondaryRiders=p2?.secondaryFrontRiderIdsAtEnd.length??0
        rows.push({
          chase,seed,stageKm:input.stage.distanceKm,
          openingRiders:road.phase1Opening?.breakawayRiderIds.length??0,
          quarterGapSeconds:road.phase1Opening?.endGapSeconds??0,
          halfwayPrimaryGapSeconds:halfwayPrimaryGap,
          halfwaySecondaryRiders,
          anyFrontAtHalf:halfwayPrimaryGap>0.5||halfwaySecondaryRiders>0,
          seventyPercentPhysicalGapSeconds:road.phase3Decisive?.physicalEndGapSeconds??0,
          finishGapSeconds:road.phase4Finish?.endGapSeconds??0,
          breakawaySurvived:result.calibrationSummary.breakawaySurvived,
          breakawayCaught:result.calibrationSummary.breakawayCaught,
          winner:result.finishResolution.winnerRiderId,
        })
      }
    }
    console.log('BREAKAWAY_MULTI_SEED_HALFWAY_AUDIT='+JSON.stringify(rows))
    // This calibration gate must fail rather than silently accepting a
    // physically valid but ineffective specialist. A cooperative, minimally
    // chased escape needs to reach halfway in at least one deterministic seed.
    const minimallyChasedWithEscape=rows.filter(x=>
      x.chase==='minimal' && (x.openingRiders as number)>0)
    expect(minimallyChasedWithEscape.length).toBeGreaterThan(0)
    expect(minimallyChasedWithEscape.some(x=>x.anyFrontAtHalf===true)).toBe(true)
    expect(rows).toHaveLength(4)
  })

  it('compares deliberate Phase-3 breakaway rotation with energy conservation at the same seed',()=>{
    const samples=[]
    for(const rotateInPhase3 of [false,true]){
      const input=scenario('minimal',rotateInPhase3)
      input.engine.deterministicSeed+='-seed-a'
      const original=JSON.stringify(input)
      const result=runSelectedRaceEngineV1(input)
      expect(JSON.stringify(input)).toBe(original)
      expect(result.validationPassed).toBe(true)
      expect(result.replaySynchronization.synchronized).toBe(true)
      expect(result.finishResolution.complete).toBe(true)
      expect(result.finishResolution.classification).toHaveLength(96)
      expect(result.postStageUpdate.persistenceContract.directDatabaseWritePerformed).toBe(false)
      const road=result.roadRaceResolution
      const initialEscapeRiders=road.phase1Opening?.breakawayRiderIds??[]
      const winner=result.finishResolution.winnerRiderId
      samples.push({
        rotateInPhase3,
        openingRiders:initialEscapeRiders.length,
        km25GapSeconds:road.phase1Opening?.endGapSeconds??0,
        km50GapSeconds:road.phase2Development?.endGapSeconds??0,
        km70PhysicalGapSeconds:road.phase3Decisive?.physicalEndGapSeconds??0,
        finishGapSeconds:road.phase4Finish?.endGapSeconds??0,
        phase4StartGapSeconds:road.phase4Finish?.startGapSeconds??0,
        phase4EscapeSurvived:road.phase4Finish?.breakawaySurvived??false,
        phase4ChaseSamples:(road.phase4Finish?.chaseSteps??[])
          .filter((_,index)=>index % 3===0)
          .map(x=>({km:x.kmEnd,gap:x.endGapSeconds,
            escapeKmh:x.escapePaceKmh,pelotonKmh:x.effectivePelotonPaceKmh,
            explicitChasers:x.explicitChasingTeamCount,
            automaticChasers:x.automaticChasingTeamCount,
            response:x.responseMode})),
        escapeEnergyAtHalf:(road.phase2Development?.riderEnergy??[])
          .filter(x=>initialEscapeRiders.includes(x.riderId))
          .map(x=>({riderId:x.riderId, energyAfterPhase:x.energyAfterPhase})),
        escapePhase3Orders:result.roadCommandResolution.riders
          .filter(x=>initialEscapeRiders.includes(x.riderId))
          .map(x=>({riderId:x.riderId,
            command:x.phases.find(p=>p.phaseNumber===3)?.resolvedCommand,
            behaviour:x.phases.find(p=>p.phaseNumber===3)?.behaviour})),
        winner,
        originalAttackerWasStageWinner:initialEscapeRiders.includes(winner??''),
        breakawaySurvived:result.calibrationSummary.breakawaySurvived,
        replayIssues:result.replaySynchronization.issues,
      })
    }
    console.log('BREAKAWAY_SUSTAINED_ROTATION_AUDIT='+JSON.stringify(samples))
    expect(samples).toHaveLength(2)
    // The exact same riders and seed must do physically better when they
    // keep rotating in Phase 3 instead of taking conservation orders.
    expect(samples[1].km70PhysicalGapSeconds).toBeGreaterThan(0)
    expect(samples[1].km70PhysicalGapSeconds)
      .toBeGreaterThan(samples[0].km70PhysicalGapSeconds)
    // A rotating 4-rider escape with 113 seconds at the 70% mark should
    // be capable of defeating an unorganized pursuit. This asserts the
    // measured sporting outcome rather than forcing a result in the engine.
    expect(samples[1].phase4StartGapSeconds).toBeGreaterThan(100)
    expect(samples[1].phase4EscapeSurvived).toBe(true)
    expect(samples[1].finishGapSeconds).toBeGreaterThan(0)
  })


  it('executes the Binche 203.2 km hilly pilot with 96 anonymized riders and real route geometry',()=>{
    const BIN='335708f7-d56a-4816-9068-38399e8f74e3'
    const DANUBE='f5af8665-91c1-4585-937e-11fb94f65819'
    const original=scenario('minimal',true)
    const binche:UniversalRaceEngineInput={
      ...original,
      engine:{...original.engine,deterministicSeed:'binche-official-hilly-roster-synthetic-seed-a'},
      stage:{
        ...original.stage,stageId:BIN,stageFormat:'road_race',
        terrainType:'hilly',profileType:'sprinter',
        distanceKm:203.2,elevationGainM:1710,
        terrainPercentages:{flat:58,hilly:38,mountain:0,cobbled:4},
        profilePoints:[
          {km:0,elevationM:120},{km:25,elevationM:180},
          {km:49,elevationM:240},{km:70,elevationM:205},
          {km:77,elevationM:310},{km:91,elevationM:150},
          {km:101,elevationM:125},{km:111,elevationM:225},
          {km:123.8,elevationM:168},{km:139.7,elevationM:168},
          {km:160.6,elevationM:118},{km:176.5,elevationM:118},
          {km:190,elevationM:150},{km:203.2,elevationM:120},
        ],
      },
      points:[
        {...original.points[0],stageId:BIN},
        {...original.points[1],stageId:BIN,kmFromStart:64},
        {...original.points[1],stageId:BIN,pointId:'binche-kom-77',
          pointType:'KOM',kmFromStart:77,name:'Petit Poggio',
          komCategory:'3',pointsScheme:[5,3,2,1],timeBonusSeconds:[],sortOrder:15},
        {...original.points[1],stageId:BIN,pointId:'binche-kom-111',
          pointType:'KOM',kmFromStart:111,name:'Thuin North Rise',
          komCategory:'3',pointsScheme:[5,3,2,1],timeBonusSeconds:[],sortOrder:20},
        {...original.points.at(-1)!,stageId:BIN,kmFromStart:203.2,sortOrder:30},
      ],
    }
    expect(selectCompleteRaceEngineLaneV1(binche.stage)).toBe('experimental_breakaway_v1')
    expect(getSelectedRaceEngineModuleV1(binche.stage).runRaceEngine).toBe(specialistEngine)
    expect(selectCompleteRaceEngineLaneV1({...binche.stage,terrainType:'flat'}))
      .toBe('baseline_universal')
    expect(selectCompleteRaceEngineLaneV1({...binche.stage,stageId:DANUBE}))
      .toBe('baseline_universal')
    const unchanged=JSON.stringify(binche)
    const result=runSelectedRaceEngineV1(binche)
    expect(JSON.stringify(binche)).toBe(unchanged)
    expect(result.validationPassed).toBe(true)
    expect(result.finishResolution.complete).toBe(true)
    expect(result.finishResolution.classification).toHaveLength(96)
    expect(result.replaySynchronization.synchronized).toBe(true)
    expect(result.phase9Acceptance.passed).toBe(true)
    expect(result.phase78Acceptance.passed).toBe(true)
    expect(result.postStageUpdate.persistenceContract.directDatabaseWritePerformed).toBe(false)
    console.log('BINCHE_HILLY_PILOT_AUDIT='+JSON.stringify({
      stage:BIN,terrain:binche.stage.terrainType,
      distanceKm:binche.stage.distanceKm,
      classification:result.finishResolution.classification.length,
      winner:result.finishResolution.winnerRiderId,
      openingEscapeCount:result.roadRaceResolution.phase1Opening?.breakawayRiderIds.length??0,
      gapAt70Pct:result.roadRaceResolution.phase3Decisive?.physicalEndGapSeconds??0,
      endGap:result.roadRaceResolution.phase4Finish?.endGapSeconds??0,
      survived:result.calibrationSummary.breakawaySurvived,
      replayIssues:result.replaySynchronization.issues,
    }))
  })


  it('distinguishes widespread tempo-control orders from an actual opening chase',()=>{
    const tempo=scenario('minimal',true)
    // Reconstruct the production tactic mix without using private rider data:
    // most teams control tempo but nobody has ordered an opening pursuit.
    tempo.stagePlans=tempo.stagePlans.map(plan=>({
      ...plan,
      riders:plan.riders.map(row=>row.stageRole==='breakaway_rider'
        ? row : {...row,commands:{...row.commands,phase1:'control_tempo' as const}}),
    }))
    const chasers:UniversalRaceEngineInput={
      ...tempo,
      stagePlans:tempo.stagePlans.map(plan=>({
        ...plan,
        riders:plan.riders.map(row=>row.stageRole==='breakaway_rider'
          ? row : {...row,commands:{...row.commands,phase1:'chase_breakaway' as const}}),
      })),
    }
    const opening=(input:UniversalRaceEngineInput)=>{
      const core=getSelectedRaceEngineModuleV1(input.stage)
      const p9=core.buildUniversalPhase9ModifierSummary(input)
      const calc=core.applyUniversalPhase9ModifiersToInput(input,p9)
      const readiness=core.calculateAllRiderReadiness(calc.riders)
      const commands=core.buildRoadCommandResolution(calc,readiness)
      return core.resolveRoadPhase1Opening(calc,readiness,commands).phase1Opening!
    }
    const tempoOpening=opening(tempo)
    const chasedOpening=opening(chasers)
    const verifyNoPostCatchB1Join=(phase1:typeof tempoOpening)=>{
      const catchKm=phase1.breakawayCatchKm
      if(catchKm!==null){
        for(const attempt of phase1.attackAttempts){
          if(attempt.attemptKm>catchKm+0.000001){
            expect(attempt.acceptedEscapeLaunch).toBe(false)
          }
        }
      }
    }
    verifyNoPostCatchB1Join(tempoOpening)
    verifyNoPostCatchB1Join(chasedOpening)
    const maximumPhysicalGap=(phase1:typeof tempoOpening)=>
      Math.max(0,...phase1.physicalGapTrajectory.map(sample=>sample.gapSeconds))
    expect(tempoOpening.breakawayRiderIds.length).toBeGreaterThan(0)
    // A physically established gap must grow beyond the 7-second launch
    // when teams control tempo rather than explicitly chase. Weak escapes
    // can still be caught; there is deliberately no mandatory survival.
    expect(maximumPhysicalGap(tempoOpening)).toBeGreaterThan(7)
    expect(maximumPhysicalGap(tempoOpening)).toBeGreaterThan(maximumPhysicalGap(chasedOpening))
    const chasedFull=runSelectedRaceEngineV1(chasers)
    expect(chasedFull.validationPassed).toBe(true)
    expect(chasedFull.replaySynchronization.synchronized).toBe(true)
    expect(chasedFull.phase78Acceptance.passed).toBe(true)
    const official=runSelectedRaceEngineV1(tempo)
    expect(official.validationPassed).toBe(true)
    expect(official.replaySynchronization.synchronized).toBe(true)
    expect(official.phase78Acceptance.passed).toBe(true)
    expect(official.finishResolution.complete).toBe(true)
    expect(official.finishResolution.classification).toHaveLength(96)
    console.log('BREAKAWAY_TEMPO_VS_CHASE_REGRESSION='+JSON.stringify({
      tempoEndGapSeconds:tempoOpening.endGapSeconds,
      chaseEndGapSeconds:chasedOpening.endGapSeconds,
      tempoMaximumPhysicalGapSeconds:maximumPhysicalGap(tempoOpening),
      chaseMaximumPhysicalGapSeconds:maximumPhysicalGap(chasedOpening),
      tempoCatchKm:tempoOpening.breakawayCatchKm,
      chaseCatchKm:chasedOpening.breakawayCatchKm,
      replayIssues:official.replaySynchronization.issues,
    }))
  })

  it('validates Baseline decisive-phase unopposed breaks, chase and possible victory',()=>{
    const input=scenario('minimal',true)
    const testStageId='synthetic-baseline-breakaway-96-no-prod'
    input.stage={...input.stage,stageId:testStageId}
    input.points=input.points.map(row=>({...row,stageId:testStageId}))
    input.engine={...input.engine,deterministicSeed:'baseline-readonly-cohort-same-seed-1'}
    const plans=(chase=false)=>input.stagePlans.map(plan=>({
      ...plan,
      riders:plan.riders.map((row,index)=>{
        if(row.stageRole==='breakaway_rider')return row
        const pursuing=chase && (plan.teamId==='T07'||plan.teamId==='T10') && index<2
        return {...row,
          stageRole:pursuing?'breakaway_chaser' as const:'rouleur' as const,
          commands:{...row.commands,
            phase1:pursuing?'chase_breakaway' as const:'conserve_energy' as const,
            phase2:pursuing?'chase_breakaway' as const:'conserve_energy' as const,
            phase3:pursuing?'chase_breakaway' as const:'conserve_energy' as const,
            phase4:pursuing?'chase_breakaway' as const:'stay_near_front' as const,
          },
        }
      }),
    }))
    input.stagePlans=plans()
    expect(selectCompleteRaceEngineLaneV1(input.stage)).toBe('baseline_universal')
    const normal=runSelectedRaceEngineV1(input)
    expect(normal.validationPassed).toBe(true)
    expect(normal.finishResolution.classification).toHaveLength(96)
    expect(normal.replaySynchronization.synchronized).toBe(true)
    expect(normal.replaySynchronization.issues).toEqual([])
    expect(normal.phase78Acceptance.passed).toBe(true)
    expect(normal.phase9Acceptance.passed).toBe(true)
    expect(normal.postStageUpdate.persistenceContract.directDatabaseWritePerformed).toBe(false)
    expect(normal.roadRaceResolution.phase1Opening?.breakawayRiderIds.length).toBeGreaterThan(0)
    expect(normal.roadRaceResolution.phase2Development?.endGapSeconds).toBeGreaterThan(30)
    expect(normal.roadRaceResolution.phase3Decisive?.physicalChasingTeamIds).toEqual([])
    expect(normal.roadRaceResolution.phase3Decisive?.physicalEndGapSeconds).toBeGreaterThan(30)
    const chased=runSelectedRaceEngineV1({...input,stagePlans:plans(true)})
    expect(chased.validationPassed).toBe(true)
    expect(chased.replaySynchronization.synchronized).toBe(true)
    expect(chased.phase78Acceptance.passed).toBe(true)
    expect(chased.roadRaceResolution.phase2Development?.endGapSeconds).toBe(0)
    const chosen=new Set(input.stagePlans.flatMap(plan=>plan.riders)
      .filter(row=>row.stageRole==='breakaway_rider').map(row=>row.riderId))
    const fresh={...input,riders:input.riders.map(row=>chosen.has(row.riderId)
      ? {...row,fatigueBeforeStage:8,startStamina:96,
          flat:Math.max(86,row.flat),endurance:Math.max(90,row.endurance),
          raceIQ:Math.max(85,row.raceIQ),teamwork:Math.max(86,row.teamwork)}
      : row)}
    const escaped=runSelectedRaceEngineV1(fresh)
    expect(escaped.validationPassed).toBe(true)
    expect(escaped.finishResolution.classification).toHaveLength(96)
    expect(escaped.replaySynchronization.synchronized).toBe(true)
    expect(escaped.phase78Acceptance.passed).toBe(true)
    expect(escaped.phase9Acceptance.passed).toBe(true)
    expect(escaped.calibrationSummary.breakawaySurvived).toBe(true)
    expect(escaped.roadRaceResolution.phase4Finish?.endGapSeconds).toBeGreaterThan(30)
  })

  it('executes Zeeland 204.6 km exposed flat route with 120 synthetic riders from 20 teams',()=>{
    const ZEELAND='7f69e552-b116-453c-bf55-16ef655ea021'
    const base=scenario('minimal',true)
    // Expand the existing anonymized 96-rider fixture to the registered
    // 120-rider / 20-team field size. These are synthetic clones, NOT live
    // user riders or copied race tactics.
    const sourceTeams=base.teams.slice(0,4)
    const extraTeams=sourceTeams.map((team,i)=>{
      const suffix='-Z'+String(i+1)
      return {...team,teamId:team.teamId+suffix,
        participantTeamId:team.participantTeamId+suffix,
        clubId:team.clubId+suffix,
        participatingClubId:team.participatingClubId+suffix,
        ownerClubId:team.ownerClubId+suffix,
        raceTeamEntryId:team.raceTeamEntryId+suffix,
        acceptedRiderIds:team.acceptedRiderIds.map(id=>id+suffix),
        snapshot:{...team.snapshot,teamName:team.snapshot.teamName+suffix}}
    })
    const extraRiders=sourceTeams.flatMap((team,i)=>{
      const suffix='-Z'+String(i+1)
      return base.riders.filter(r=>r.teamId===team.teamId)
        .map(r=>({...r,riderId:r.riderId+suffix,
          participantRiderId:r.participantRiderId+suffix,
          teamId:r.teamId+suffix,
          participatingClubId:r.participatingClubId+suffix,
          snapshot:{...r.snapshot,displayName:r.riderId+suffix}}))
    })
    const extraPlans=base.stagePlans.slice(0,4).map((plan,i)=>{
      const suffix='-Z'+String(i+1)
      return {...plan,teamId:plan.teamId+suffix,
        riders:plan.riders.map(row=>({
          ...row,riderId:row.riderId+suffix,
          commands:{...row.commands,phase1:'control_tempo' as const},
        }))}
    })
    const route:UniversalRaceEngineInput={
      ...base,
      engine:{...base.engine,deterministicSeed:'zeeland-official-flat-120-rider-synthetic-regression'},
      race:{...base.race,raceId:'zeeland-test-race'},
      stage:{...base.stage,raceId:'zeeland-test-race',
        stageId:ZEELAND,stageFormat:'road_race',terrainType:'flat',
        profileType:'sprinter',finishType:'flat_finish',
        distanceKm:204.6,elevationGainM:360,
        terrainPercentages:{flat:96,hilly:4,mountain:0,cobbled:0},
        profilePoints:[[0,3],[10,5],[28,2],[52,5],[72.5,4],
          [86,15],[104,4],[122,12],[143,9],[174,14],[185,2],
          [201,15],[204.6,5]]
          .map(([km,elevationM])=>({km,elevationM})),
      },
      points:[
        {...base.points[0],stageId:ZEELAND,kmFromStart:0},
        {...base.points[1],stageId:ZEELAND,kmFromStart:72.5,
          pointId:'zeeland-sprint-1',pointsScheme:[12,8,5,3,1],
          timeBonusSeconds:[],sortOrder:10},
        {...base.points[1],stageId:ZEELAND,kmFromStart:143,
          pointId:'zeeland-sprint-2',pointsScheme:[10,6,4,2,1],
          timeBonusSeconds:[],sortOrder:20},
        {...base.points.at(-1)!,stageId:ZEELAND,kmFromStart:204.6,
          pointId:'zeeland-finish',pointsScheme:[25,20,16,14,12,10,8,6,4,2],
          timeBonusSeconds:[],sortOrder:30},
      ],
      weather:{...base.weather,windKmh:27,source:'synthetic-test'},
      teams:[...base.teams,...extraTeams],
      riders:[...base.riders,...extraRiders],
      stagePlans:[...base.stagePlans,...extraPlans],
    }
    expect(route.teams).toHaveLength(20)
    expect(route.riders).toHaveLength(120)
    expect(new Set(route.riders.map(r=>r.riderId)).size).toBe(120)
    expect(selectCompleteRaceEngineLaneV1(route.stage)).toBe('experimental_breakaway_v1')
    expect(getSelectedRaceEngineModuleV1(route.stage).runRaceEngine).toBe(specialistEngine)
    const immutable=JSON.stringify(route)
    const result=runSelectedRaceEngineV1(route)
    expect(JSON.stringify(route)).toBe(immutable)
    expect(result.validationPassed).toBe(true)
    expect(result.finishResolution.complete).toBe(true)
    expect(result.finishResolution.classification).toHaveLength(120)
    expect(result.replaySynchronization.synchronized).toBe(true)
    expect(result.phase78Acceptance.passed).toBe(true)
    expect(result.phase9Acceptance.passed).toBe(true)
    expect(result.postStageUpdate.persistenceContract.directDatabaseWritePerformed).toBe(false)
    console.log('ZEELAND_PILOT_AUDIT='+JSON.stringify({
      stageId:ZEELAND,
      riderCount:result.finishResolution.classification.length,
      teams:route.teams.length,
      openingBreakawayRiders:result.roadRaceResolution.phase1Opening?.breakawayRiderIds.length??0,
      maxGap:result.calibrationSummary.maximumBreakawayGapSeconds,
      breakawaySurvived:result.calibrationSummary.breakawaySurvived,
      replayIssues:result.replaySynchronization.issues,
    }))
  })


  it('keeps tempo-control from silently becoming a breakaway chase across all three cores',()=>{
    const source=scenario('minimal',true)
    const inputFor=(chase:boolean):UniversalRaceEngineInput=>({
      ...source,
      riders:source.riders.map(r=>({...r,
        // Typical fresh racing fitness: the historical roster was heavily fatigued.
        fatigueBeforeStage:Math.min(35,r.fatigueBeforeStage),
        startStamina:Math.max(82,r.startStamina),
      })),
      stagePlans:source.stagePlans.map(plan=>({
        ...plan,riders:plan.riders.map(row=>row.stageRole==='breakaway_rider'
          ? row:{...row,commands:{...row.commands,
              phase1:chase?'chase_breakaway' as const:'control_tempo' as const,
              phase2:chase?'chase_breakaway' as const:'control_tempo' as const,
            }}),
      })),
    })
    const readOpening=(core:typeof baselineRoadCore,input:UniversalRaceEngineInput)=>{
      const p9=core.buildUniversalPhase9ModifierSummary(input)
      const calc=core.applyUniversalPhase9ModifiersToInput(input,p9)
      const readiness=core.calculateAllRiderReadiness(calc.riders)
      const commands=core.buildRoadCommandResolution(calc,readiness)
      return core.resolveRoadPhase1Opening(calc,readiness,commands).phase1Opening!
    }
    for(const [lane,core] of [
      ['baseline',baselineRoadCore],
      ['mountain',mountainRoadCore],
      ['specialist',breakawayRoadCore],
    ] as const){
      const easy=readOpening(core,inputFor(false))
      const hard=readOpening(core,inputFor(true))
      const maxGap=(p:typeof easy)=>Math.max(0,
        ...p.physicalGapTrajectory.map(step=>step.gapSeconds))
      const easyMax=maxGap(easy),hardMax=maxGap(hard)
      console.log('SHARED_OPENING_PHYSICS_AUDIT='+JSON.stringify({
        lane,easyMaximumGapSeconds:easyMax,hardMaximumGapSeconds:hardMax,
        easyCatchKm:easy.breakawayCatchKm,hardCatchKm:hard.breakawayCatchKm,
        easyEndGapSeconds:easy.endGapSeconds,
        hardEndGapSeconds:hard.endGapSeconds,
      }))
      expect(easy.attackAttempts.some(a=>a.acceptedEscapeLaunch)).toBe(true)
      expect(hard.attackAttempts.some(a=>a.acceptedEscapeLaunch)).toBe(true)
      expect(easyMax).toBeGreaterThan(7)
      expect(easyMax).toBeGreaterThan(hardMax)
      expect(easy.physicalGapTrajectory.every(step=>step.gapSeconds>=0)).toBe(true)
      expect(hard.physicalGapTrajectory.every(step=>step.gapSeconds>=0)).toBe(true)
    }
  })

})
