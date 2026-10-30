/**
 * V4 shadow proof: real original V2 in-memory engine + V4 template-first input.
 * This fixture deliberately does NOT emulate result calculations.
 */
import assert from 'node:assert/strict'
import {PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION,
 validateRunInput} from '../universal-race-engine/runRaceEngine.ts'
import {prepareV4ShadowRace} from './templateFirstPlannerV4.ts'
import {probeV4PhysicalRace} from './physicalResearchProbeV4.ts'
import {compareHistoricalStageV4} from './historicalComparisonV4.ts'
import {runSelectedRaceEngineV1} from '../universal-race-engine/runSelectedRaceEngineV1.ts'

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
  assert.equal(result.acceptedBreakLaunches,0,
    'all-human neutral race must not invent tactical breakaways')
  assert.equal(result.observedMixedAcceptedBreakawayGroup,false)
 }else{
  assert(result.aiPhase1BreakawayCommands>0)
  assert(result.humanPhase1BreakawayCommands>0)
  assert(result.acceptedHumanBreakLaunches>0)
  assert(result.acceptedAiBreakLaunches>0)
  assert.equal(result.observedMixedAcceptedBreakawayGroup,true,
    'accepted AI and human escape riders must share an actual replay B group')
  assert(result.observedMixedAcceptedBreakawayCheckpoints>0)
 }
 const entry={scenario:s.name,riders:s.n*6,aiTeams:s.ai,
  humanTeams:s.n-s.ai,template:result.selectedTemplateId,
  acceptedBreakLaunches:result.acceptedBreakLaunches,
  acceptedHumanBreakLaunches:result.acceptedHumanBreakLaunches,
  acceptedAiBreakLaunches:result.acceptedAiBreakLaunches,
  mixedReplayGroups:result.observedSharedGroupCheckpoints,
  actualMixedAcceptedBreakawayGroup:result.observedMixedAcceptedBreakawayGroup,
  mixedAcceptedBreakawayCheckpoints:result.observedMixedAcceptedBreakawayCheckpoints,
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
  x.actualMixedAcceptedBreakawayGroup),
 legacySevenSecondsIssueResolved:false,
 details:report
}))


// Offline historical-shaped comparison contract: synthetic fixture only.
// Real past race snapshots are never committed to a public repository.
for(const [name,aiCount] of [['historical_shape_all_human',0],['historical_shape_mixed',2]]){
 const fixture=makeField(4,aiCount,{neutral:aiCount===0,terrain:'flat'})
 const originalHash=JSON.stringify(fixture.input)
 const historicalSaved=runSelectedRaceEngineV1(fixture.input)
 const envelope={
  status:'completed',
  input_snapshot_json:fixture.input,
  result_summary_json:{
   stage_start_game_at:'2000-06-01T12:00:00',
   output_snapshot:{universalResult:historicalSaved}
  },
  team_control:fixture.options.teamControl
 }
 const comparison=compareHistoricalStageV4(envelope)
 assert.equal(comparison.researchOnly,true)
 assert.equal(comparison.officialWrites,0)
 assert.equal(comparison.historicLockCutoffActuallyVerified,false)
 assert.equal(comparison.savedResultReproducedByCurrentV2,true)
 assert.equal(comparison.savedResultRankStatusGapAgreement,1)
 assert.equal(comparison.riderCount,24)
 assert.equal(comparison.aiTeams,aiCount)
 assert.equal(comparison.humanTeams,4-aiCount)
 assert.equal(comparison.replay.currentV2Synchronized,true)
 assert.equal(comparison.replay.v4ResearchSynchronized,true)
 assert(comparison.v4ChangedRankCountComparedToCurrentV2>=0)
 assert.equal(JSON.stringify(fixture.input),originalHash)
 if(aiCount===0)assert.equal(comparison.preSimulationTemplate,null)
 else assert(comparison.preSimulationTemplate?.startsWith('flat_'))
 const repeat=compareHistoricalStageV4(envelope)
 assert.deepEqual(repeat,comparison)
 console.log('V4_HISTORICAL_SHAPE_TEST '+JSON.stringify({
  name,baselineReproduced:comparison.savedResultReproducedByCurrentV2,
  v4Template:comparison.preSimulationTemplate,
  officialWrites:comparison.officialWrites,
  historicalTimingNotProven:!comparison.historicLockCutoffActuallyVerified
 }))
}
{
 const fixture=makeField(4,2,{neutral:false,terrain:'flat'})
 const saved=runSelectedRaceEngineV1(fixture.input)
 const good={
  status:'completed',
  input_snapshot_json:fixture.input,
  result_summary_json:{stage_start_game_at:'2000-06-01T12:00:00',
    output_snapshot:{universalResult:saved}},
  team_control:fixture.options.teamControl
 }
 assert.throws(()=>compareHistoricalStageV4({...good,status:'running'}),
  /completed historical stage/)
 assert.throws(()=>compareHistoricalStageV4({...good,
  input_snapshot_json:{archived:true,original_bytes:100000}}),
  /full input\/output snapshot missing/)
 assert.throws(()=>compareHistoricalStageV4({...good,team_control:[]}),
  /controller evidence/)
 const badMap=good.team_control.map((t,i)=>i===2?{...t,kind:'human'}:t)
 assert.throws(()=>compareHistoricalStageV4({...good,team_control:badMap,
    input_snapshot_json:{...good.input_snapshot_json,teams:
      good.input_snapshot_json.teams.map((t,i)=>i===2?{...t,snapshot:{
        ...t.snapshot,metadata:{scenarioAiControlled:true}}}:t)}}),
  /AI ownership conflicts/)
}
console.log('V4_HISTORICAL_COMPARATOR_TEST_REPORT '+JSON.stringify({
 status:'PASS',testCases:2,sourceIsSynthetic:true,
 savedV2ResultReconstructionVerified:true,offlineOnly:true,
 failClosedOnMissingOwnership:true,failClosedOnCompactedArchive:true,
 noHistoricalRiderDataPublished:true,actualHistoricalReplaysStillRequired:true,
 noOfficialRaceWrites:true
}))


// The preserved solver can throw replay synchronization errors on some seeds.
// This is a DIAGNOSTIC, not a pass/fail claim for each physical outcome.
// Record all expected replay errors without hiding unrelated errors or
// classifying a failed calculation as a valid result.
const seeded=[]
const classifyError=error=>{
 const message=error instanceof Error?error.message:String(error)
 if(!message.startsWith('Universal replay synchronization failed:'))throw error
 return message.split(':')[1]?.trim()?.split(':')[0]??'replay_sync_error'
}
for(let i=0;i<36;i++){
 const fixture=makeField(4,2,{neutral:false,terrain:'flat',
   seed:'v4-seven-second-regression-'+String(i).padStart(3,'0')})
 let base=null,alt=null,baseError=null,altError=null
 try {base=runSelectedRaceEngineV1(fixture.input)} catch(error) {
   baseError=classifyError(error)
 }
 try {alt=probeV4PhysicalRace(fixture.input,fixture.options)} catch(error) {
   altError=classifyError(error)
 }
 if(base)assert.equal(base.validationPassed,true)
 if(alt){assert.equal(alt.validated,true);assert.equal(alt.officialWrites,0)}
 const baseGap=base?.calibrationSummary?.maximumBreakawayGapSeconds??null
 const altGap=alt?.maximumBreakawayGapSeconds??null
 const baseAccepted=base?.roadRaceResolution?.phase1Opening?.attackAttempts
   ?.filter(a=>a.acceptedEscapeLaunch).length??null
 const altAccepted=alt?.acceptedBreakLaunches??null
 seeded.push({seed:i,baseGap,altGap,baseAccepted,altAccepted,
  baseSync:base?.replaySynchronization.synchronized??null,
  altSync:alt?.replaySynchronized??null,baseError,altError})
}
const exact7=(gap,accepted)=>accepted>0&&Number(gap.toFixed(2))===7
const baselineValid=seeded.filter(x=>x.baseError===null)
const v4Valid=seeded.filter(x=>x.altError===null)
const baseEscapes=baselineValid.filter(x=>x.baseAccepted>0)
const v4Escapes=v4Valid.filter(x=>x.altAccepted>0)
const median=a=>a.length?a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)]:null
const errors=rows=>rows.map(x=>({seed:x.seed,reason:x.baseError??x.altError}))
const gapAudit={
 status:'DIAGNOSTIC_ONLY_NOT_REALISM_ACCEPTANCE',
 syntheticSeeds:seeded.length,
 baselineComplete:baselineValid.length,
 v4Complete:v4Valid.length,
 baselineReplayExceptions:seeded.length-baselineValid.length,
 v4ReplayExceptions:seeded.length-v4Valid.length,
 baselineExceptionSamples:errors(seeded.filter(x=>x.baseError!==null)).slice(0,10),
 v4ExceptionSamples:errors(seeded.filter(x=>x.altError!==null)).slice(0,10),
 baselineWithEscape:baseEscapes.length,
 v4WithEscape:v4Escapes.length,
 baselineExact7Sec:baseEscapes.filter(x=>exact7(x.baseGap,x.baseAccepted)).length,
 v4Exact7Sec:v4Escapes.filter(x=>exact7(x.altGap,x.altAccepted)).length,
 baselineOver60Sec:baseEscapes.filter(x=>x.baseGap>60).length,
 v4Over60Sec:v4Escapes.filter(x=>x.altGap>60).length,
 baselineMedianMaxGapSeconds:median(baseEscapes.map(x=>x.baseGap)),
 v4MedianMaxGapSeconds:median(v4Escapes.map(x=>x.altGap)),
 baselineSynced:baselineValid.filter(x=>x.baseSync).length,
 v4Synced:v4Valid.filter(x=>x.altSync).length,
 dataset:'synthetic_only',officialWrites:0
}
assert.equal(seeded.length,36)
console.log('V4_SEVEN_SECOND_MULTI_SEED_REPORT '+JSON.stringify(gapAudit))
