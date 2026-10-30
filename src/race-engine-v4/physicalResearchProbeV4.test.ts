/**
 * V4 shadow proof: real original V2 in-memory engine + V4 template-first input.
 * This fixture deliberately does NOT emulate result calculations.
 */
import assert from 'node:assert/strict'
import {PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION,
 validateRunInput} from '../universal-race-engine/runRaceEngine.ts'
import {prepareV4ShadowRace} from './templateFirstPlannerV4.ts'
import {probeV4PhysicalRace} from './physicalResearchProbeV4.ts'

function makeField(teamCount:number,aiTeams:number,
  {neutral=false,terrain='flat',seed='v4-mixed-real-solver-01'}={}) {
 const teams=[],riders=[],stagePlans=[],teamControl=[]
 const stageId='v4-synthetic-stage-01',raceId='v4-synthetic-race-01'
 for(let t=0;t<teamCount;t++){
   const teamId='team-'+t,clubId='club-'+t
   const acceptedRiderIds=[],planRiders=[]
   const kind=t>=teamCount-aiTeams?'ai':'human'
   teamControl.push({teamId,kind})
   for(let i=0;i<6;i++){
      const ordinal=t*6+i,id='rider-'+String(ordinal).padStart(3,'0')
      acceptedRiderIds.push(id)
      const overall=62+(ordinal*11)%28
      riders.push({
       participantRiderId:'participant-'+id,riderId:id,teamId,
       participatingClubId:clubId,
       sprint:overall,climbing:overall,timeTrial:overall,flat:overall,
       endurance:overall,recovery:overall,resistance:overall,raceIQ:overall,
       teamwork:overall,morale:75,fatigueBeforeStage:12,
       raceSharpness:74,startStamina:91,recentFormScore:0,
       availabilityStatus:'fit',unavailableUntil:null,unavailableReason:null,
       startStatus:'starter',healthSnapshot:null,
       overall,snapshot:{displayName:id,startNumber:ordinal+1}
      })
      planRiders.push({
       riderId:id,stageRole:i===4?'breakaway_rider':
         i===0?'team_leader_gc':i===1?'sprinter':'helper_domestique',
       commands:{phase1:!neutral&&kind==='human'&&i===4?'join_breakaway':'follow_team_plan',
         phase2:'follow_team_plan',phase3:'follow_team_plan',
         phase4:'follow_team_plan'},
       equipmentSelection:null,supplySelection:null
      })
   }
   teams.push({
    participantTeamId:'participant-team-'+t,teamId,clubId,
    participatingClubId:clubId,ownerClubId:clubId,parentClubId:null,
    raceTeamEntryId:'entry-'+t,clubType:'main',acceptedRiderIds,
    snapshot:{teamName:'Test Team '+t,countryCode:'DE'},
   })
   stagePlans.push({teamId,teamTactic:'balanced',status:'locked',
     locked:true,defaulted:false,riders:planRiders,metadata:{}})
 }
 const input={
  engine:{engineKey:PPM_UNIVERSAL_RACE_ENGINE_KEY,
   engineVersion:PPM_UNIVERSAL_RACE_ENGINE_VERSION,deterministicSeed:seed},
  race:{raceId,raceType:'stage_race',stageCount:4},
  stage:{raceId,stageId,stageNumber:1,stageFormat:'road_race',
   terrainType:terrain,profileType:terrain==='mountain'?'mountain':'sprinter',
   finishType:terrain==='mountain'?'summit_finish':'flat_finish',
   distanceKm:120,elevationGainM:terrain==='mountain'?2600:500,
   summitFinish:terrain==='mountain',
   terrainPercentages:terrain==='mountain'?
      {flat:10,hilly:15,mountain:75,cobbled:0}:
      {flat:80,hilly:15,mountain:5,cobbled:0},
   profilePoints:terrain==='mountain'?
      [{km:0,elevationM:100},{km:60,elevationM:900},{km:120,elevationM:2600}]:
      [{km:0,elevationM:10},{km:60,elevationM:120},{km:120,elevationM:15}]},
  points:[
   {pointId:'start',stageId,pointType:'START',kmFromStart:0,name:'Start',
    komCategory:null,pointsScheme:[],timeBonusSeconds:[],
    isFinishPoint:false,sortOrder:0,metadata:{}},
   {pointId:'finish',stageId,pointType:'FINISH',kmFromStart:120,name:'Finish',
    komCategory:null,pointsScheme:[50,35,30],timeBonusSeconds:[10,6,4],
    isFinishPoint:true,sortOrder:1,metadata:{}},
  ],
  teams,riders,stagePlans,
  weather:{condition:'clear',temperatureC:22,windKmh:12,
   precipitationMm:0,rainProbabilityPct:10,cancelled:false,
   cancellationReason:null,source:'test',snapshot:{}},
  preparation:{equipment:{},staff:{},assets:{},raceSupplies:{},
   standardizedBonuses:{}}
 }
 return {input,options:{
  lock:{stageId,snapshotId:'v4-readonly-synthetic-snapshot',
   snapshotStatus:'locked',stageStartGameTs:'2000-06-01T12:00:00.000Z',
   lockCutoffGameTs:'2000-06-01T09:00:00.000Z',
   snapshotGameTs:'2000-06-01T09:00:00.000Z'},
  gameDate:'2000-06-01',teamControl,history:[],
  crosswindRisk:.20,descentRisk:.25,rainRisk:.1,
 }}
}
const scenarios=[
 {name:'all_human_no_commands',n:4,ai:0,neutral:true,terrain:'flat'},
 {name:'mixed_human_ai_attacks',n:4,ai:2,neutral:false,terrain:'flat'},
 {name:'mixed_full_field',n:16,ai:8,neutral:false,terrain:'flat'},
]
const report=[]
for(const s of scenarios){
 const {input,options}=makeField(s.n,s.ai,{neutral:s.neutral,terrain:s.terrain})
 const errors=validateRunInput(input)
 assert.deepEqual(errors,[],'synthetic input must pass original solver validation')
 const compiled=prepareV4ShadowRace(input,options)
 assert.equal(compiled.aiTeams,s.ai)
 if(s.ai===0){
  assert.equal(compiled.selectedTemplate,null)
  assert.strictEqual(compiled.combinedInput,input)
 }else{
  assert(compiled.selectedTemplate)
  assert(compiled.intents.length>0)
 }
 const immutable=JSON.stringify(input)
 const result=probeV4PhysicalRace(input,options)
 if(s.name==='mixed_human_ai_attacks'){
  const repeat=probeV4PhysicalRace(input,options)
  assert.equal(repeat.officialResultHash,result.officialResultHash,
   'same locked commands must reproduce the original finish classification')
  assert.equal(repeat.replayTimelineHash,result.replayTimelineHash,
   'same locked commands must reproduce every original replay checkpoint')
 }
 assert.equal(result.validated,true)
 assert.equal(result.calculatedPhysicalRace,true)
 assert.equal(result.outcomePublished,false)
 assert.equal(result.officialWrites,0)
 assert.equal(result.productionDispatcherInvoked,false)
 assert.equal(result.officialFinishClassificationCount,s.n*6)
 assert(result.replayCheckpoints>0,'original solver must emit replay checkpoints')
 assert.equal(JSON.stringify(input),immutable)
 if(s.ai===0){
  assert.equal(result.aiPhase1BreakawayCommands,0)
  assert.equal(result.humanPhase1BreakawayCommands,0)
 }else{
  assert(result.aiPhase1BreakawayCommands>0)
  assert(result.humanPhase1BreakawayCommands>0)
 }
 const entry={scenario:s.name,riders:s.n*6,aiTeams:s.ai,
  humanTeams:s.n-s.ai,template:result.selectedTemplateId,
  acceptedBreakLaunches:result.acceptedBreakLaunches,
  acceptedHumanBreakLaunches:result.acceptedHumanBreakLaunches,
  acceptedAiBreakLaunches:result.acceptedAiBreakLaunches,
  mixedReplayGroups:result.observedSharedGroupCheckpoints,
  openingBreakawaySize:result.openingBreakawayRiderIds.length,
  maximumBreakawayGapSeconds:result.maximumBreakawayGapSeconds,
  replaySynchronized:result.replaySynchronized,
  replayIssues:result.replayIssues,
  officialFinishClassificationCount:result.officialFinishClassificationCount,
  replayCheckpoints:result.replayCheckpoints,
  officialResultHash:result.officialResultHash,
  replayTimelineHash:result.replayTimelineHash}
 console.log('V4_PHYSICAL_SCENARIO '+JSON.stringify(entry))
 report.push(entry)
}
console.log('V4_PHYSICAL_READONLY_REPORT '+JSON.stringify({
 status:'PASS',runs:report.length,independentFromOfficialDispatcher:true,
 usesOriginalRaceSolver:true,sourceInputsUnmodified:true,officialWrites:0,
 classificationAndReplayActuallyCalculated:true,
 humanAiActualEscapeMergeVerified:report.some(x=>
  x.acceptedHumanBreakLaunches>0&&x.acceptedAiBreakLaunches>0&&
  x.mixedReplayGroups>0),
 legacySevenSecondsIssueResolved:false,
 details:report
}))
