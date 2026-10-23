/// <reference lib="deno.ns" />
/**
 * Synthetic, read-only canary for the COMPLETE Breakaway V1 official contract.
 * No database, user identities, secrets, production race tasks or mutation.
 */
import { runSelectedRaceEngineV1, selectCompleteRaceEngineLaneV1 }
  from "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/decf613ae309ee9f1216c2085a4f69deab255260/src/universal-race-engine/runSelectedRaceEngineV1.ts";
import { PPM_UNIVERSAL_RACE_ENGINE_KEY, PPM_UNIVERSAL_RACE_ENGINE_VERSION,
  type UniversalRaceEngineInput } from
  "https://raw.githubusercontent.com/bracko87/ProPeloton-Manager/decf613ae309ee9f1216c2085a4f69deab255260/src/universal-race-engine/runRaceEngine.ts";

const SOURCE_COMMIT="decf613ae309ee9f1216c2085a4f69deab255260";
const CONTRACT="breakaway_full_official_contract_synthetic_canary_v1";
const PILOT="5523cf76-8fd4-4a12-ab28-7f285c9829ff";
const BINCHE="335708f7-d56a-4816-9068-38399e8f74e3";
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"}
});

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



Deno.serve(async req=>{
  if(req.method!=="GET")return respond({error:"method_not_allowed"},405);
  try{
    const fixture=createValidInput();
    const binche=new URL(req.url).searchParams.get("stage")==="binche";
    const target=binche?BINCHE:PILOT;
    const input:UniversalRaceEngineInput={
      ...fixture,
      engine:{...fixture.engine,deterministicSeed:"read_only_breakaway_release_canary_v1"},
      stage:{...fixture.stage,stageId:target,...(binche?{
        terrainType:"hilly" as const,profileType:"sprinter" as const,
        distanceKm:203.2,elevationGainM:1710,
        terrainPercentages:{flat:58,hilly:38,mountain:0,cobbled:4},
        profilePoints:[{km:0,elevationM:120},{km:49,elevationM:240},
          {km:77,elevationM:310},{km:101,elevationM:125},
          {km:111,elevationM:225},{km:160,elevationM:118},
          {km:203.2,elevationM:120}],
      }: {})},
      points:fixture.points.map(row=>({...row,stageId:target,kmFromStart:binche
        ? (row.pointType==="FINISH"?203.2:row.pointType==="KOM"?77:row.pointType==="INTERMEDIATE_SPRINT"?64:0)
        : row.kmFromStart})),
    };
    const selected=selectCompleteRaceEngineLaneV1(input.stage);
    if(selected!=="experimental_breakaway_v1")
      return respond({error:"authoritative_pilot_not_selected",selected},503);
    const result=runSelectedRaceEngineV1(input);
    if(!result.validationPassed || !result.finishResolution.complete ||
       !result.replaySynchronization.synchronized ||
       !result.phase9Acceptance.passed ||
       !result.phase78Acceptance.passed ||
       result.finishResolution.classification.length!==input.riders.length ||
       result.postStageUpdate.persistenceContract.directDatabaseWritePerformed)
      return respond({error:"official_contract_validation_failed"},503);
    return respond({
      status:"ok",contract:CONTRACT,source_commit:SOURCE_COMMIT,
      engine_lane:selected,stage_id:target,
      input_type:"fixed_synthetic_four_riders",
      riders:result.finishResolution.classification.length,
      winner:result.finishResolution.winnerRiderId,
      finish_complete:result.finishResolution.complete,
      replay_synchronized:result.replaySynchronization.synchronized,
      replay_checkpoints:result.replayTimeline.checkpoints.length,
      phase9_accepted:result.phase9Acceptance.passed,
      phase78_accepted:result.phase78Acceptance.passed,
      incident_records:result.phase10Incidents.incidents.length,
      classification:result.finishResolution.classification.map(row=>({
        rider_id:row.riderId,rank:row.rank,status:row.status,
        gap_seconds:row.gapSeconds,official_time_seconds:row.officialTimeSeconds,
      })),
      database_read:false,database_write:false,
      official_live_worker_unchanged:true,
    });
  }catch(error){
    return respond({error:"synthetic_full_engine_failed",
      detail:error instanceof Error ? error.message.slice(0,240):"unknown",
      official_live_worker_unchanged:true},500);
  }
});
