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
  {neutral=false,terrain='flat',seed='v4-mixed-real-solver-01',humanChase=false,humanPursuitTeam=false,phase2Chase=humanChase,phase3Chase=false,phase4Chase=humanChase}={}) {
 const teams=[],riders=[],stagePlans=[],teamControl=[]
 const stageId='v4-synthetic-stage-01',raceId='v4-synthetic-race-01'
 for(let t=0;t<teamCount;t++){
   const teamId='team-'+t,clubId='club-'+t
   const acceptedRiderIds=[],planRiders=[]
   const kind=t>=teamCount-aiTeams?'ai':'human'
   const designatedHumanPursuitTeam=humanPursuitTeam&&kind==='human'&&t===teamCount-aiTeams-1
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
       commands:{phase1:!neutral&&kind==='human'&&!designatedHumanPursuitTeam&&i===4?'join_breakaway':'follow_team_plan',
         phase2:phase2Chase&&designatedHumanPursuitTeam&&[2,3,5].includes(i)?'chase':'follow_team_plan',
         phase3:phase3Chase&&designatedHumanPursuitTeam&&[2,3,5].includes(i)?'chase':'follow_team_plan',
         phase4:phase4Chase&&designatedHumanPursuitTeam&&[2,3,5].includes(i)?'chase':'follow_team_plan'},
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
  altGapAudit:alt?.gapAudit??null,
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

const diagnosed=seeded.filter(x=>x.altGapAudit!==null)
const escapedDiagnosed=diagnosed.filter(x=>x.altAccepted>0)
const peakOf=x=>x.altGapAudit?.observedSampleMaxGapSeconds??null
const validValues=values=>values.filter((x)=>typeof x==='number')
console.log('V4_GAP_TRAJECTORY_AUDIT_REPORT '+JSON.stringify({
 status:'RESEARCH_ONLY_NOT_REALISM_APPROVAL',syntheticSeeds:seeded.length,
 completedV4:diagnosed.length,acceptedBreakawayCases:escapedDiagnosed.length,
 medianReportedMaxGapSeconds:median(validValues(escapedDiagnosed.map(x=>x.altGap))),
 medianObservedSamplePeakSeconds:median(validValues(escapedDiagnosed.map(peakOf))),
 medianPhase1PeakSeconds:median(validValues(escapedDiagnosed.map(x=>x.altGapAudit?.phase1?.seconds??null))),
 medianPhase2PeakSeconds:median(validValues(escapedDiagnosed.map(x=>x.altGapAudit?.phase2?.seconds??null))),
 medianPhase4PeakSeconds:median(validValues(escapedDiagnosed.map(x=>x.altGapAudit?.phase4?.seconds??null))),
 reportedMaximumBelowObservedSampleCount:escapedDiagnosed.filter(x=>
  (x.altGapAudit?.unreportedSamplePeakSeconds??0)>0.000001).length,
 largestObservedPeakPhaseCounts:{
  phase1:escapedDiagnosed.filter(x=>x.altGapAudit?.observedPeakPhase==='phase1').length,
  phase2:escapedDiagnosed.filter(x=>x.altGapAudit?.observedPeakPhase==='phase2').length,
  phase4:escapedDiagnosed.filter(x=>x.altGapAudit?.observedPeakPhase==='phase4').length
 },
 noExplicitPhase2Chasers:escapedDiagnosed.filter(x=>
  x.altGapAudit?.phase2?.explicitChasingTeamCount===0).length,
 phase1Caught:escapedDiagnosed.filter(x=>
  x.altGapAudit?.phase1?.catchKm!==null).length,
 phase2Caught:escapedDiagnosed.filter(x=>
  x.altGapAudit?.phase2?.catchKm!==null).length,
 sampleOnly:true,originalV2SolverUnmodified:true,officialWrites:0
}))



// Controlled A/B chase sensitivity — SAME stage, roster, weather and AI plans.
// The ONLY intervention is explicit human-team pursuit in Phases 2 and 4.
// This is observational research, NOT a guarantee that a catch should occur.
if(process.env.V4_SKIP_EXPLICIT_CHASE_AB!=='1'){
const chasePairs=[]
for(let i=0;i<36;i++){
 const seed='v4-seven-second-regression-'+String(i).padStart(3,'0')
 const without=makeField(5,2,{neutral:false,terrain:'flat',seed,humanChase:false,humanPursuitTeam:true})
 const withChase=makeField(5,2,{neutral:false,terrain:'flat',seed,humanChase:true,humanPursuitTeam:true})
 assert.equal(JSON.stringify(without.input.riders),JSON.stringify(withChase.input.riders))
 assert.equal(JSON.stringify(without.input.stage),JSON.stringify(withChase.input.stage))
 assert.equal(JSON.stringify(without.input.weather),JSON.stringify(withChase.input.weather))
 assert.equal(JSON.stringify(without.input.engine),JSON.stringify(withChase.input.engine))
 const unmodified=JSON.stringify(withChase.input)
 const aiTeamIds=new Set(without.options.teamControl.filter(x=>x.kind==='ai').map(x=>x.teamId))
 const aiPlans=x=>prepareV4ShadowRace(x.input,x.options).combinedInput.stagePlans
  .filter(p=>aiTeamIds.has(p.teamId))
 assert.deepEqual(aiPlans(without),aiPlans(withChase),
  'human chase intervention must not rewrite AI tactical intentions')
 let a=null,b=null,errorA=null,errorB=null
 try{a=probeV4PhysicalRace(without.input,without.options)}catch(error){
  errorA=classifyError(error)
 }
 try{b=probeV4PhysicalRace(withChase.input,withChase.options)}catch(error){
  errorB=classifyError(error)
 }
 assert.equal(JSON.stringify(withChase.input),unmodified,
  'V4 chase sensitivity must not mutate locked human commands')
 if(a)assert.equal(a.officialWrites,0)
 if(b)assert.equal(b.officialWrites,0)
 chasePairs.push({seed:i,without:a,withChase:b,errorA,errorB})
}
const completedPairs=chasePairs.filter(x=>x.without!==null&&x.withChase!==null)
const matchedBreakawayPairs=completedPairs.filter(x=>
 x.without.acceptedBreakLaunches>0&&x.withChase.acceptedBreakLaunches>0)
assert(matchedBreakawayPairs.length>0,'A/B needs actual physical escape cases')
assert(matchedBreakawayPairs.some(x=>
 (x.withChase.gapAudit.phase2?.explicitChasingTeamCount??0)>0),
 'separate peloton human team must issue a recognized Phase-2 chase')
const originalGaps=matchedBreakawayPairs.map(x=>x.without.maximumBreakawayGapSeconds)
const chaseGaps=matchedBreakawayPairs.map(x=>x.withChase.maximumBreakawayGapSeconds)
const reductions=matchedBreakawayPairs.map(x=>
 x.without.maximumBreakawayGapSeconds-x.withChase.maximumBreakawayGapSeconds)
console.log('V4_EXPLICIT_CHASE_AB_REPORT '+JSON.stringify({
 status:'DIAGNOSTIC_ONLY_NOT_REALISM_ACCEPTANCE',
 pairedSeeds:chasePairs.length,withoutChaseComplete:chasePairs.filter(x=>x.without!==null).length,
 withHumanChaseComplete:chasePairs.filter(x=>x.withChase!==null).length,
 matchedValidPairs:completedPairs.length,matchedBreakawayPairs:matchedBreakawayPairs.length,
 medianNoChaseMaxGapSeconds:median(originalGaps.filter(x=>typeof x==='number')),
 medianHumanChaseMaxGapSeconds:median(chaseGaps.filter(x=>typeof x==='number')),
 medianPairedGapReductionSeconds:median(reductions.filter(Number.isFinite)),
 casesChaseReducesMaximum:reductions.filter(x=>x>0.000001).length,
 casesChaseIncreasesMaximum:reductions.filter(x=>x< -0.000001).length,
 medianPhase2ChasingTeamCount:median(matchedBreakawayPairs.map(x=>
  x.withChase.gapAudit.phase2?.explicitChasingTeamCount??0)),
 medianPhase4ExplicitChasers:median(matchedBreakawayPairs.map(x=>
  x.withChase.gapAudit.phase4?.explicitChasingTeamCount??0)),
 medianPhase1PhysicalGainSeconds:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase1?.netGapChangeSeconds??null).filter(x=>typeof x==='number')),
 medianPhase2PhysicalGainSeconds:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase2?.netGapChangeSeconds??null).filter(x=>typeof x==='number')),
 medianPhase3PhysicalGainSeconds:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase3?.netGapChangeSeconds??null).filter(x=>typeof x==='number')),
 medianPhase1FrontEnergySpent:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase1?.meanFrontEnergySpent??null).filter(x=>typeof x==='number')),
 medianPhase2FrontEnergySpent:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase2?.meanFrontEnergySpent??null).filter(x=>typeof x==='number')),
 medianPhase3FrontEnergySpent:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase3?.meanFrontEnergySpent??null).filter(x=>typeof x==='number')),
 medianPhase3ChasingTeams:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase3?.chaseTeamCount??null).filter(x=>typeof x==='number')),
 medianPhase3GrowingKm:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase3?.distanceGrowingKm??null).filter(x=>typeof x==='number')),
 medianPhase3ShrinkingKm:median(matchedBreakawayPairs.map(x=>
  x.withChase.earlyGapEvolution.phase3?.distanceShrinkingKm??null).filter(x=>typeof x==='number')),
 medianChasePelotonSpeedKmh:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.medianPelotonSpeedKmh??null).filter(x=>typeof x==='number')),
 medianChaseBreakawaySpeedKmh:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.medianEscapeSpeedKmh??null).filter(x=>typeof x==='number')),
 medianNoChasePelotonSpeedKmh:median(matchedBreakawayPairs.map(x=>x.without.chaseTelemetry?.medianPelotonSpeedKmh??null).filter(x=>typeof x==='number')),
 medianChaseResponseMultiplier:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.medianResponseMultiplier??null).filter(x=>typeof x==='number')),
 medianChaseWorkIntensity:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.medianWorkIntensity??null).filter(x=>typeof x==='number')),
 medianChaseWorkerFinishEnergy:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.averageExplicitChaserFinishEnergy??null).filter(x=>typeof x==='number')),
 medianChaseWorkerEnergyUsed:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.averageExplicitChaserEnergyUsed??null).filter(x=>typeof x==='number')),
 medianGapGrowthDespiteExplicitChaseKm:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.gapGrowingDespiteChaseKm??null).filter(x=>typeof x==='number')),
 medianEscapeFasterKm:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.escapeFasterKm??null).filter(x=>typeof x==='number')),
 medianPelotonFasterKm:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.pelotonFasterKm??null).filter(x=>typeof x==='number')),
 medianGapSpeedDisagreementKm:median(matchedBreakawayPairs.map(x=>x.withChase.chaseTelemetry?.gapSpeedDisagreementKm??null).filter(x=>typeof x==='number')),
 noChaseReplayErrors:chasePairs.filter(x=>x.errorA!==null).length,
 withChaseReplayErrors:chasePairs.filter(x=>x.errorB!==null).length,
 testFieldRiders:30,humanChaserTeams:1,humanPhase2And4ChaseRidersPerTeam:3,
 identicalAiPlansVerified:true,strictReplayValidation:true,
 officialRaceWrites:0,source:'synthetic_only'
}))

// Isolate WHEN pursuing helps: same 36 seeds, same riders, same AI commands.
// The original two A/B variants above are reused (no chase / both phases).
const phaseTiming=[]
for(const pair of chasePairs){
 const seed='v4-seven-second-regression-'+String(pair.seed).padStart(3,'0')
 const make=({phase2,phase4})=>makeField(5,2,{
  neutral:false,terrain:'flat',seed,humanPursuitTeam:true,
  phase2Chase:phase2,phase4Chase:phase4
 })
 const only2=make({phase2:true,phase4:false})
 const only4=make({phase2:false,phase4:true})
 const inputHash2=JSON.stringify(only2.input),inputHash4=JSON.stringify(only4.input)
 const aiTeams=new Set(only2.options.teamControl.filter(x=>x.kind==='ai').map(x=>x.teamId))
 const ai=x=>prepareV4ShadowRace(x.input,x.options).combinedInput.stagePlans
  .filter(p=>aiTeams.has(p.teamId))
 assert.deepEqual(ai(only2),ai(only4),'AI plans must remain identical between chase timing variants')
 let p2=null,p4=null,e2=null,e4=null
 try{p2=probeV4PhysicalRace(only2.input,only2.options)}catch(error){e2=classifyError(error)}
 try{p4=probeV4PhysicalRace(only4.input,only4.options)}catch(error){e4=classifyError(error)}
 assert.equal(JSON.stringify(only2.input),inputHash2)
 assert.equal(JSON.stringify(only4.input),inputHash4)
 if(p2)assert.equal(p2.officialWrites,0)
 if(p4)assert.equal(p4.officialWrites,0)
 phaseTiming.push({...pair,only2:p2,only4:p4,error2:e2,error4:e4})
}
const phasePaired=phaseTiming.filter(x=>[x.without,x.only2,x.only4,x.withChase].every(Boolean))
const phaseEscapes=phasePaired.filter(x=>[x.without,x.only2,x.only4,x.withChase].every(y=>y.acceptedBreakLaunches>0))
assert(phaseEscapes.length>0,'Phase-specific comparison requires physically accepted breakaways')
const peak=(rows,key)=>median(rows.map(x=>x[key].maximumBreakawayGapSeconds).filter(x=>typeof x==='number'))
const phase2End=(rows,key)=>median(rows.map(x=>x[key].gapAudit.phase2?.endGapSeconds??null).filter(x=>typeof x==='number'))
const phase4Start=(rows,key)=>median(rows.map(x=>x[key].gapAudit.phase4?.startGapSeconds??null).filter(x=>typeof x==='number'))
console.log('V4_CHASE_PHASE_TIMING_REPORT '+JSON.stringify({
 status:'DIAGNOSTIC_ONLY_NO_PHYSICS_CHANGES',
 seeds:phaseTiming.length,
 fullyValidPairs:phasePaired.length,
 fullyValidBreakawayPairs:phaseEscapes.length,
 completed:{
  none:phaseTiming.filter(x=>x.without).length,
  phase2Only:phaseTiming.filter(x=>x.only2).length,
  phase4Only:phaseTiming.filter(x=>x.only4).length,
  both:phaseTiming.filter(x=>x.withChase).length
 },
 maximumGapMedianSeconds:{
  none:peak(phaseEscapes,'without'),phase2Only:peak(phaseEscapes,'only2'),
  phase4Only:peak(phaseEscapes,'only4'),both:peak(phaseEscapes,'withChase')
 },
 phase3NetGrowthMedianSeconds:{
  none:median(phaseEscapes.map(x=>x.without.earlyGapEvolution.phase3?.netGapChangeSeconds??null).filter(x=>typeof x==='number')),
  phase2Only:median(phaseEscapes.map(x=>x.only2.earlyGapEvolution.phase3?.netGapChangeSeconds??null).filter(x=>typeof x==='number')),
  phase4Only:median(phaseEscapes.map(x=>x.only4.earlyGapEvolution.phase3?.netGapChangeSeconds??null).filter(x=>typeof x==='number')),
  both:median(phaseEscapes.map(x=>x.withChase.earlyGapEvolution.phase3?.netGapChangeSeconds??null).filter(x=>typeof x==='number'))
 },
 phase3ChasingTeamsMedian:{
  none:median(phaseEscapes.map(x=>x.without.earlyGapEvolution.phase3?.chaseTeamCount??null).filter(x=>typeof x==='number')),
  both:median(phaseEscapes.map(x=>x.withChase.earlyGapEvolution.phase3?.chaseTeamCount??null).filter(x=>typeof x==='number'))
 },
 phase2EndGapMedianSeconds:{
  none:phase2End(phaseEscapes,'without'),phase2Only:phase2End(phaseEscapes,'only2'),
  phase4Only:phase2End(phaseEscapes,'only4'),both:phase2End(phaseEscapes,'withChase')
 },
 phase4StartGapMedianSeconds:{
  none:phase4Start(phaseEscapes,'without'),phase2Only:phase4Start(phaseEscapes,'only2'),
  phase4Only:phase4Start(phaseEscapes,'only4'),both:phase4Start(phaseEscapes,'withChase')
 },
 medPhase2ChasingTeamsOnly2:median(phaseEscapes.map(x=>
  x.only2.gapAudit.phase2?.explicitChasingTeamCount??0)),
 medPhase2ChasingTeamsOnly4:median(phaseEscapes.map(x=>
  x.only4.gapAudit.phase2?.explicitChasingTeamCount??0)),
 medPhase4ChasingTeamsOnly2:median(phaseEscapes.map(x=>
  x.only2.gapAudit.phase4?.explicitChasingTeamCount??0)),
 medPhase4ChasingTeamsOnly4:median(phaseEscapes.map(x=>
  x.only4.gapAudit.phase4?.explicitChasingTeamCount??0)),
 replayFailures:{
  none:phaseTiming.filter(x=>x.errorA).length,phase2Only:phaseTiming.filter(x=>x.error2).length,
  phase4Only:phaseTiming.filter(x=>x.error4).length,both:phaseTiming.filter(x=>x.errorB).length
 },
 syntheticOnly:true,identicalRiderAndAiPlans:true,officialWrites:0
}))


// Explicit Phase-3 pursuit sensitivity. Keep Phase-2 and Phase-4 chase orders,
// all AI plans and the original deterministic fields unchanged.
const phase3Pairs=[]
for(const pair of chasePairs){
 const seed='v4-seven-second-regression-'+String(pair.seed).padStart(3,'0')
 const mk=(phase3Chase)=>makeField(5,2,{seed,neutral:false,terrain:'flat',
  humanPursuitTeam:true,phase2Chase:true,phase3Chase,phase4Chase:true})
 const normal=mk(false),experimental=mk(true)
 assert.deepEqual(normal.input.riders,experimental.input.riders)
 assert.deepEqual(normal.input.weather,experimental.input.weather)
 assert.deepEqual(normal.input.stage,experimental.input.stage)
 assert.deepEqual(normal.input.engine,experimental.input.engine)
 const initial=JSON.stringify(experimental.input)
 const owners=new Set(normal.options.teamControl.filter(x=>x.kind==='ai').map(x=>x.teamId))
 const plans=x=>prepareV4ShadowRace(x.input,x.options).combinedInput.stagePlans
 assert.deepEqual(plans(normal).filter(x=>owners.has(x.teamId)),
  plans(experimental).filter(x=>owners.has(x.teamId)),
  'Explicit Phase 3 pursuit must not modify AI tactics')
 const human0=plans(normal).filter(x=>!owners.has(x.teamId))
 const human1=plans(experimental).filter(x=>!owners.has(x.teamId))
 assert(human1.some((team,i)=>team.riders.some((r,j)=>
  r.commands.phase3!==human0[i].riders[j].commands.phase3)),
  'Phase 3 chase order must be recognized')
 let variant=null,error=null
 try{variant=probeV4PhysicalRace(experimental.input,experimental.options)}
 catch(err){error=classifyError(err)}
 assert.equal(JSON.stringify(experimental.input),initial)
 if(variant)assert.equal(variant.officialWrites,0)
 phase3Pairs.push({base:pair.withChase,variant,error})
}
const valid3=phase3Pairs.filter(x=>x.base!==null&&x.variant!==null)
const escaped3=valid3.filter(x=>x.base.acceptedBreakLaunches>0&&x.variant.acceptedBreakLaunches>0)
assert(escaped3.length>0,'Phase 3 comparison needs accepted escape cases')
const med=(key,phase,metric)=>median(escaped3.map(x=>
 x[key].earlyGapEvolution[phase]?.[metric]??null).filter(x=>typeof x==='number'))
const max3=key=>median(escaped3.map(x=>x[key].maximumBreakawayGapSeconds))
const delta3=escaped3.map(x=>x.base.maximumBreakawayGapSeconds-x.variant.maximumBreakawayGapSeconds)
console.log('V4_EXPLICIT_PHASE3_CHASE_REPORT '+JSON.stringify({
 status:'RESEARCH_ONLY_NO_PHYSICS_CHANGE',
 seeds:phase3Pairs.length,baselineComplete:phase3Pairs.filter(x=>x.base).length,
 explicitComplete:phase3Pairs.filter(x=>x.variant).length,
 matchedValid:valid3.length,matchedBreakaway:escaped3.length,
 phase3GapGrowthMedianSeconds:{automatic:med('base','phase3','netGapChangeSeconds'),
  explicit:med('variant','phase3','netGapChangeSeconds')},
 phase3GrowingKmMedian:{automatic:med('base','phase3','distanceGrowingKm'),
  explicit:med('variant','phase3','distanceGrowingKm')},
 phase3ChasingTeamCountMedian:{automatic:med('base','phase3','chaseTeamCount'),
  explicit:med('variant','phase3','chaseTeamCount')},
 phase3FrontEnergySpentMedian:{automatic:med('base','phase3','meanFrontEnergySpent'),
  explicit:med('variant','phase3','meanFrontEnergySpent')},
 phase2EndGapMedianSeconds:{automatic:med('base','phase2','endGapSeconds'),
  explicit:med('variant','phase2','endGapSeconds')},
 maxGapMedianSeconds:{automatic:max3('base'),explicit:max3('variant')},
 medianPairedMaxGapReductionSeconds:median(delta3),
 gapsReduced:delta3.filter(x=>x>0.000001).length,
 gapsIncreased:delta3.filter(x=>x< -0.000001).length,
 replayFailures:{automatic:phase3Pairs.filter(x=>x.base===null).length,
  explicit:phase3Pairs.filter(x=>x.error!==null).length},
 aiPlansUnchanged:true,sameInputsExceptPhase3Orders:true,
 strictReplay:true,syntheticOnly:true,officialWrites:0
}))

const measured3=escaped3.filter(x=>x.base.phase3SpeedAudit!==null&&x.variant.phase3SpeedAudit!==null)
const speedMed=(variant,key)=>median(measured3.map(x=>
 x[variant].phase3SpeedAudit?.[key]??null).filter(x=>typeof x==='number'))
console.log('V4_PHASE3_SPEED_COMPARISON_REPORT '+JSON.stringify({
 status:'MEASURED_PACE_DIAGNOSTIC_ONLY',
 matchedBreakawayCases:escaped3.length,
 matchedInstrumentedBreakaways:measured3.length,
 observedPhysicalStepsBaseline:measured3.reduce((sum,x)=>sum+(x.base.phase3SpeedAudit?.sampleSteps??0),0),
 observedPhysicalStepsExplicit:measured3.reduce((sum,x)=>sum+(x.variant.phase3SpeedAudit?.sampleSteps??0),0),
 medianPelotonKmh:{automatic:speedMed('base','medianPelotonPaceKmh'),
  explicit:speedMed('variant','medianPelotonPaceKmh')},
 medianEscapeKmh:{automatic:speedMed('base','medianEscapePaceKmh'),
  explicit:speedMed('variant','medianEscapePaceKmh')},
 medianEscapeSpeedAdvantageKmh:{
  automatic:speedMed('base','medianSpeedAdvantageToEscapeKmh'),
  explicit:speedMed('variant','medianSpeedAdvantageToEscapeKmh')
 },
 medianSelectedResponseMultiplier:{
  automatic:speedMed('base','medianSelectedResponseMultiplier'),
  explicit:speedMed('variant','medianSelectedResponseMultiplier')
 },
 medianAvailableChaseAssets:{
  automatic:speedMed('base','medianChaseAssets'),
  explicit:speedMed('variant','medianChaseAssets')
 },
 medianChasingTeams:{
  automatic:speedMed('base','medianChasingTeamCount'),
  explicit:speedMed('variant','medianChasingTeamCount')
 },
 medianExplicitChasingTeams:{
  automatic:speedMed('base','medianExplicitChasingTeams'),
  explicit:speedMed('variant','medianExplicitChasingTeams')
 },
 medianAutomaticChasingTeams:{
  automatic:speedMed('base','medianAutomaticChasingTeams'),
  explicit:speedMed('variant','medianAutomaticChasingTeams')
 },
 medianGcThreatChasingTeams:{
  automatic:speedMed('base','medianGcThreatChasingTeams'),
  explicit:speedMed('variant','medianGcThreatChasingTeams')
 },
 medianCooperationMultiplier:{
  automatic:speedMed('base','medianCooperationMultiplier'),
  explicit:speedMed('variant','medianCooperationMultiplier')
 },
 medianChaseInterestScore:{
  automatic:speedMed('base','medianChaseInterestScore'),
  explicit:speedMed('variant','medianChaseInterestScore')
 },
 medianChaseCapacityScore:{
  automatic:speedMed('base','medianChaseCapacityScore'),
  explicit:speedMed('variant','medianChaseCapacityScore')
 },
 medianMeasuredKm:{
  automatic:speedMed('base','measuredKm'),
  explicit:speedMed('variant','measuredKm')
 },
 medianGapGrowthKm:{
  automatic:speedMed('base','gapGrowingKm'),
  explicit:speedMed('variant','gapGrowingKm')
 },
 physicalSource:'temporary_v4_only_in_memory_bundle',originalV2FileModified:false,officialWrites:0
}))

}
