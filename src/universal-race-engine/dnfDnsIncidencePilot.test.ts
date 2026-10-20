/**
 * Synthetic-only pilot incidence audit. No database imports, persistence or production IDs.
 * This is a small pilot, NOT evidence of season-wide realism.
 */
import { describe, expect, it } from 'vitest'
import { runRaceEngine, PPM_UNIVERSAL_RACE_ENGINE_KEY, PPM_UNIVERSAL_RACE_ENGINE_VERSION, type UniversalRaceEngineInput } from './runRaceEngine.ts'

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



const statuses = ['finished', 'dnf', 'dns', 'otl', 'dsq'] as const
const terrains = {
  flat: {finishType:'flat_finish',profileType:'sprinter',elevationGainM:500,terrainPercentages:{flat:80,hilly:15,mountain:5,cobbled:0}},
  hilly: {finishType:'uphill_finish',profileType:'puncheur',elevationGainM:1700,terrainPercentages:{flat:35,hilly:55,mountain:10,cobbled:0}},
  mountain: {finishType:'summit_finish',profileType:'climber',elevationGainM:3500,terrainPercentages:{flat:10,hilly:20,mountain:70,cobbled:0}},
  cobbled: {finishType:'cobbled_finish',profileType:'classics',elevationGainM:900,terrainPercentages:{flat:45,hilly:20,mountain:5,cobbled:30}},
} as const
const cohorts = ['baseline','fatigued','windy','rainy','combined'] as const
describe('Issue #139 — read-only DNF/DNS pilot incidence',()=>{
  it('measures terrain, fatigue and weather separately without imposing withdrawal targets',()=>{
    const summary: Array<Record<string,number|string>>=[]
    for(const cohort of cohorts) for(const terrain of Object.keys(terrains) as Array<keyof typeof terrains>) for(const fieldSize of [48,72,96]){
      const totals:Record<(typeof statuses)[number],number>={finished:0,dnf:0,dns:0,otl:0,dsq:0}
      let zeroDnf=0
      for(let seedIndex=0;seedIndex<3;seedIndex++){
        const base=createExpandedFieldInput(fieldSize)
        const config=terrains[terrain]
        const id=`audit139-${cohort}-${terrain}-${fieldSize}-${seedIndex}`
        const fatigued=cohort==='fatigued'||cohort==='combined'
        const windy=cohort==='windy'||cohort==='combined'
        const rainy=cohort==='rainy'||cohort==='combined'
        const input:UniversalRaceEngineInput={
          ...base,
          engine:{...base.engine,deterministicSeed:id},
          race:{...base.race,raceId:id},
          stage:{...base.stage,raceId:id,stageId:`${id}-stage`,terrainType:terrain,
            finishType:config.finishType,profileType:config.profileType,elevationGainM:config.elevationGainM,
            terrainPercentages:config.terrainPercentages,
            profilePoints:[{km:0,elevationM:20},{km:45,elevationM:terrain==='mountain'?800:160},
              {km:90,elevationM:terrain==='mountain'?1600:330},{km:120,elevationM:terrain==='mountain'?1950:50}]},
          points:base.points.map(p=>({...p,stageId:`${id}-stage`})),
          riders:base.riders.map(r=>fatigued?{...r,fatigueBeforeStage:75,startStamina:55}:r),
          weather:{...base.weather!,condition:rainy?'rain':windy?'sunny_windy':'clear',
            windKmh:windy?35:12,precipitationMm:rainy?8:0,rainProbabilityPct:rainy?95:10},
        }
        const result=runRaceEngine(input)
        expect(result.validationPassed).toBe(true)
        expect(result.replaySynchronization.synchronized).toBe(true)
        const rows=result.finishResolution.classification
        expect(rows.length).toBe(fieldSize)
        expect(new Set(rows.map(r=>r.riderId)).size).toBe(fieldSize)
        const counts:Record<string,number>={}
        for(const row of rows){
          expect(statuses).toContain(row.status)
          counts[row.status]=(counts[row.status]??0)+1
          totals[row.status as (typeof statuses)[number]]++
        }
        if((counts.dnf??0)===0) zeroDnf++
      }
      summary.push({cohort,terrain,fieldSize,simulations:3,entries:fieldSize*3,...totals,
        zeroDnfRaces:zeroDnf})
    }
    console.info('ISSUE_139_ADVERSE_COHORT_JSON',JSON.stringify(summary))
  },120000)
})
