/**
 * Synthetic V4 Step 3 pilot: flat/mountain x 120/220km x 0/1/3/5
 * explicit human chase workers. Strict V2/V4 input parity, independent replay
 * validation, AI plans generated only once per seed/course. Zero official writes.
 */
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'
import {patchV4MeasuredChaseSplitResearchSource} from './mountainChaseSplitResearchPatchV4.mjs'
const root=resolve(import.meta.dirname,'../..')
const temporary=mkdtempSync(join(tmpdir(),'ppm-v4-terrain-workforce-'))
const focused=process.env.V4_MOUNTAIN_WINNER_FORENSIC==='1'
const targetedSeedText=process.env.V4_MOUNTAIN_TARGET_SEED??''
if(targetedSeedText && (!focused || !/^[0-7]$/.test(targetedSeedText)))
 throw Error('Target seed must be 0..7 and requires focused mountain forensic')
const seedIds=targetedSeedText?[Number(targetedSeedText)]:Array.from({length:8},(_,i)=>i)
const coalesceCandidate=process.env.V4_MOUNTAIN_WINNER_COALESCE_CANDIDATE==='1'
const measuredCSplitCandidate=process.env.V4_MOUNTAIN_C_SPLIT_CANDIDATE==='1'
if(measuredCSplitCandidate&&!coalesceCandidate)throw Error('Physical C split candidate requires detachment coalescence')
/** Optional strictly isolated V4-only research transform. */
function injectV4DetachmentCoalescenceCandidate(source){
 const original=[
  "    return [...retainedGroups, ...selectedGroups]",
  "      .sort(",
  "        (left, right) =>",
  "          left.gapSeconds - right.gapSeconds ||",
  "          left.groupOrder - right.groupOrder ||",
  "          left.displayCode.localeCompare(right.displayCode),",
  "      )",
  "      .map((group, index) => ({",
  "        ...group,",
  "        groupOrder: index + 1,",
  "      }))",
  "  }"
 ].join('\n')
 const replacement=original.replace(
  "return [...retainedGroups, ...selectedGroups]",
  "return [...retainedGroups, ...coalesceV4CoincidentDetachmentGroups(sourceGroups,selectedGroups)]")
 if(source.split(original).length!==2)throw Error('V4 candidate detachment anchor drift')
 return "import {coalesceV4CoincidentDetachmentGroups} from '../race-engine-v4/mountainWinnerDetachmentCandidateV4.mjs'\n"+
  source.replace(original,replacement)
}
const terrainWinnerReplayThrow=[
 "  if (!replayPublicationPolicy.publishable) {",
 "    throw new Error(",
 "      `Universal replay synchronization failed: ${replayPublicationPolicy.blockingIssues.join(', ')}`,",
 "    )",
 "  }"
].join('\n')
/** Instrument ONLY a synthetic V4 executable; strict replay still fails closed. */
function injectV4WinnerCollisionForensics(source){
 if(source.split(terrainWinnerReplayThrow).length!==2)
  throw Error('V4 winner forensic throw anchor changed; fail closed')
 const lines=[
  "  if (!replayPublicationPolicy.publishable) {",
  "    const cp=replayTimeline.checkpoints.find(x=>x.checkpointId.includes('|replay|winner-finish'))",
  "    const gaps=cp?.gaps??[]",
  "    const kind=code=>code==='P'?'P':code.startsWith('B')?'B':code.startsWith('F')?'F':code.startsWith('C')?'C':'OTHER'",
  "    const pairs=[]",
  "    const origins=[]",
  "    const cpIndex=replayTimeline.checkpoints.findIndex(x=>x.checkpointId.includes('|replay|winner-finish'))",
  "    const earlier=replayTimeline.checkpoints.slice(0,Math.max(0,cpIndex)).reverse().find(x=>cp&&x.raceProgress.kmFromStart<cp.raceProgress.kmFromStart-0.000001)",
  "    for(let i=0;i<gaps.length;i++)for(let j=i+1;j<gaps.length;j++){",
  "      if(Math.round(gaps[i].gapSeconds*1e6)!==Math.round(gaps[j].gapSeconds*1e6))continue",
  "      const pair=[kind(gaps[i].displayCode),kind(gaps[j].displayCode)].sort()",
  "      pairs.push(pair.includes('OTHER')?'OTHER':pair.join('_'))",
  "      const first=earlier?.gaps.find(x=>x.displayCode===gaps[i].displayCode)",
  "      const second=earlier?.gaps.find(x=>x.displayCode===gaps[j].displayCode)",
  "      origins.push(!first||!second?'NO_PREVIOUS_GROUP_CODE':Math.abs(first.gapSeconds-second.gapSeconds)<=0.000001?'PRE_SHARED_GAP':'PRE_SEPARATED_GAPS')",
  "    }",
  "    const err=new Error(`Universal replay synchronization failed: ${replayPublicationPolicy.blockingIssues.join(', ')}`)",
  "    Object.assign(err,{v4WinnerCollisionKinds:[...new Set(pairs)].sort(),v4WinnerCollisionOrigins:[...new Set(origins)].sort(),v4WinnerLineageAudit:auditV4WinnerGapCollisions(replayTimeline.checkpoints),v4TransferAudit:auditV4PostCatchWinnerTransfer(replayTimeline.checkpoints),v4MeasuredSplitCheckpoints:replayTimeline.checkpoints.filter(x=>x.checkpointId.includes('v4-measured-chase-split')).map(x=>Number(x.raceProgress.kmFromStart.toFixed(5))).slice(-16)})",
  "    throw err",
  "  }"
 ].join('\n')
 return "import {auditV4WinnerGapCollisions} from '../race-engine-v4/mountainWinnerLineageAuditV4.mjs'\n"+
  "import {auditV4PostCatchWinnerTransfer} from '../race-engine-v4/mountainPostCatchTransferAuditV4.mjs'\n"+
  source.replace(terrainWinnerReplayThrow,lines)
}
const terrains=focused?['mountain']:coalesceCandidate?['flat','hilly','mountain']:['flat','mountain']
const distances=focused?[220]:[120,220]
const workforces=[0,1,3,5]
const seeds=seedIds.length
const median=values=>{
 const sorted=values.filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b)
 return sorted.length?Number((sorted.length%2?sorted[(sorted.length-1)/2]:
  (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2).toFixed(4)):null
}
try{
 const fixture=readFileSync(join(root,'src/race-engine-v4/physicalResearchProbeV4.test.ts'),'utf8')
 const start=fixture.indexOf('function makeField('),end=fixture.indexOf('\nconst scenarios=',start)
 assert(start>=0&&end>start,'Pinned V4 synthetic field factory missing')
 const worker=[
  "import {createHash} from 'node:crypto'",
  "import {validateRunInput,PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION} from './src/universal-race-engine/runRaceEngine.ts'",
  "import {runSelectedRaceEngineV1} from './src/universal-race-engine/runSelectedRaceEngineV1.ts'",
  "import {prepareV4ShadowRace} from './src/race-engine-v4/templateFirstPlannerV4.ts'",
  "import {historicalOpeningBreakawayJourney,historicalPhysicalGapAudit,safeHistoricalFailureReason,safeHistoricalFailureLocation,safeHistoricalReplayIssueCategory,safeHistoricalReplayIssueCode,safeV4PostCatchTransferClass} from './src/race-engine-v4/privateHistoricalDiagnosticsV4.mjs'",
  fixture.slice(start,end),
  "const terrains="+JSON.stringify(terrains)+",distances="+JSON.stringify(distances)+",workers="+JSON.stringify(workforces)+",seeds="+seeds+",seedIds="+JSON.stringify(seedIds),
  String.raw`
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const rows=[]
const run=(input,pursuitTeamId)=>{
 const errors=validateRunInput(input)
 if(errors.length)return {valid:false,error:'INVALID_INPUT'}
 try{
  const result=runSelectedRaceEngineV1(input)
  if(!result.validationPassed||result.replaySynchronization?.synchronized!==true)
   return {valid:false,error:'STRICT_REPLAY'}
  const journey=historicalOpeningBreakawayJourney(result,input.stage.distanceKm)
  const audit=historicalPhysicalGapAudit(result)
  const phase4=result.roadRaceResolution?.phase4Finish
  const pursuitTeam=phase4?.chasingTeamStrength?.find(t=>t.teamId===pursuitTeamId)
  const states=phase4?.riderStates??[]
  const energy=states.length?
   states.reduce((sum,r)=>sum+(Number.isFinite(r.energyAtFinish)?r.energyAtFinish:0),0)/states.length:null
  return {valid:true,opening:journey.openingAccepted,
   kmAhead:journey.kmAhead,
   survived:journey.catchLocation==='survived_to_finish',
   catchLocation:journey.catchLocation,
   observedPeakSeconds:audit.observedPeak,
   endGapSeconds:Number.isFinite(phase4?.endGapSeconds)?phase4.endGapSeconds:null,
   energyAtFinish:energy,
   phase4ExplicitChaserTeams:phase4?.explicitChasingTeamIds?.length??null,
   pursuitExplicitRiders:pursuitTeam?.explicitChaserRiderIds?.length??0,
   pursuitTotalWorkers:pursuitTeam?.riderCount??0,
   pursuitStrengthScore:Number.isFinite(pursuitTeam?.strengthScore)?pursuitTeam.strengthScore:null,
   pursuitMeanEnergy:Number.isFinite(pursuitTeam?.averageLiveEnergy)?pursuitTeam.averageLiveEnergy:null}
 }catch(e){
  if(e instanceof Error&&e.message.startsWith('Universal replay synchronization failed:'))
   return {valid:false,error:'STRICT_REPLAY',
    transferAudit:Array.isArray(e?.v4TransferAudit)?e.v4TransferAudit.filter(x=>x&&
      ['SAME','JOIN','SPLIT','REARRANGE','UNKNOWN'].includes(x.membership)&&
      ['MULTIPLE','ONE','NONE'].includes(x.sourceGroupCount)&&
      ['EQUAL','WITHIN_FIVE_SECONDS','SIX_TO_TEN_SECONDS','SEPARATED','UNKNOWN'].includes(x.sourceGapSpread)&&
      ['SAME_KM','UNDER_100_METERS','UNDER_1_KM','OVER_1_KM','UNKNOWN'].includes(x.lastCheckpointDistance)):[],
    winnerLineageAudit:Array.isArray(e?.v4WinnerLineageAudit)?
     e.v4WinnerLineageAudit.filter(r=>r&&r.kind==='C_C'&&
      ['SAME_PREVIOUS_GROUP','DISTINCT_PREVIOUS_GROUPS','MIXED_PREVIOUS_GROUPS','MEMBERSHIP_MISSING','NO_PREVIOUS_CHECKPOINT'].includes(r.previousMembership)&&
      ['B','F','P','C','OTHER','MULTIPLE','NO_MATCH'].includes(r.previousSharedGroupKind)&&
      ['SAME_TAGGED_LINEAGE','DISTINCT_TAGGED_LINEAGES','UNTAGGED_LINEAGE'].includes(r.physicalLineage)&&
      ['PERSISTENT_SEPARATE_EQUAL_GAP','SEPARATE_DIFFERENT_GAPS','PHYSICALLY_MERGED','FINAL_MEMBERSHIP_CHANGED','NO_FINAL_CHECKPOINT'].includes(r.finalOutcome)&&
      ['ZERO','POSITIVE_UNDER_ONE_SECOND','ONE_TO_TEN_SECONDS','OVER_TEN_SECONDS'].includes(r.gapBand)):[],
    winnerCollisionOrigins:Array.isArray(e?.v4WinnerCollisionOrigins)?
     e.v4WinnerCollisionOrigins.filter(x=>['PRE_SHARED_GAP','PRE_SEPARATED_GAPS','NO_PREVIOUS_GROUP_CODE'].includes(x)):[],
    measuredSplitCheckpoints:Array.isArray(e?.v4MeasuredSplitCheckpoints)?e.v4MeasuredSplitCheckpoints:[],
    winnerCollisionKinds:Array.isArray(e?.v4WinnerCollisionKinds)?
     e.v4WinnerCollisionKinds.filter(k=>['B_B','B_C','B_F','B_P','C_C','C_F',
      'C_P','F_F','F_P','P_P','OTHER'].includes(k)):[],
    replayReason:safeHistoricalFailureReason(e),
    replayCheckpoint:safeHistoricalFailureLocation(e).checkpoint,
    replayIssueCategory:safeHistoricalReplayIssueCategory(e),
    replayIssueCode:safeHistoricalReplayIssueCode(e),
    postCatchTransfer:safeV4PostCatchTransferClass(e)}
  return {valid:false,error:'OTHER_ERROR'}
 }
}
for(const terrain of terrains)for(const km of distances)for(const seed of seedIds){
 const teams=[18,19,20,21,22,18,19,20][seed]
 let {input,options}=makeField(teams,Math.floor(teams/2),{
  seed:'v4-matched-terrain-workforce-2026-'+seed,
  terrain,humanPursuitTeam:true,humanChase:false,neutral:false})
 const key=(terrain==='mountain'?2:terrain==='hilly'?4:0)+(km===220?1:0)
 const stageId='12345678-1234-4234-8234-'+String(2400+key*100+seed).padStart(12,'0')
 const raceId='12345678-1234-4234-8234-'+String(2500+key*100+seed).padStart(12,'0')
 input.race.raceId=raceId
 input.stage.stageId=stageId
 input.stage.raceId=raceId
 input.stage.distanceKm=km
 input.stage.terrainType=terrain
 input.stage.profileType=terrain==='mountain'?'mountain':terrain==='hilly'?'rolling':'sprinter'
 input.stage.finishType=terrain==='mountain'?'summit_finish':'flat_finish'
 input.stage.summitFinish=terrain==='mountain'
 input.stage.elevationGainM=terrain==='mountain'?(km===120?2600:3600):
  terrain==='hilly'?(km===120?1350:2350):(km===120?500:750)
 input.stage.terrainPercentages=terrain==='mountain'?
  {flat:10,hilly:15,mountain:75,cobbled:0}:
  terrain==='hilly'?{flat:27,hilly:58,mountain:15,cobbled:0}:
  {flat:80,hilly:15,mountain:5,cobbled:0}
 input.stage.profilePoints=terrain==='mountain'?
  [{km:0,elevationM:100},{km:km*.22,elevationM:900},
   {km:km*.4,elevationM:300},{km:km*.62,elevationM:1300},
   {km:km*.8,elevationM:850},{km,elevationM:2600}]:
  terrain==='hilly'?
  [{km:0,elevationM:35},{km:km*.16,elevationM:280},
   {km:km*.36,elevationM:70},{km:km*.57,elevationM:415},
   {km:km*.76,elevationM:135},{km:km*.9,elevationM:330},{km,elevationM:150}]:
  [{km:0,elevationM:10},{km:km*.5,elevationM:120},{km,elevationM:15}]
 for(const point of input.points){
  point.stageId=stageId
  if(point.pointType==='FINISH')point.kmFromStart=km
 }
 options.lock.stageId=stageId
 const prepared=prepareV4ShadowRace(input,options)
 if(prepared.status!=='ai_prepared'||!prepared.intents.length)
  throw Error('MISSING_AI_PREPARATION')
 const base=prepared.combinedInput
 const aiIds=new Set(options.teamControl.filter(t=>t.kind==='ai').map(t=>t.teamId))
 const human=options.teamControl.filter(t=>t.kind==='human')
 const pursuit=human.at(-1)?.teamId
 if(!pursuit)throw Error('MISSING_HUMAN_PURSUIT_TEAM')
 const aiPlanHash=hash(base.stagePlans.filter(p=>aiIds.has(p.teamId)))
 const frozenHash=hash({engine:base.engine,stage:base.stage,race:base.race,
  teams:base.teams,riders:base.riders,weather:base.weather,points:base.points,
  preparation:base.preparation})
 for(const count of workers){
  const variant=structuredClone(base)
  const chosen=[2,3,5,0,1].slice(0,count)
  for(const plan of variant.stagePlans){
   if(plan.teamId!==pursuit)continue
   plan.riders.forEach((r,i)=>{
    if(!chosen.includes(i))return
    for(const phase of ['phase2','phase3','phase4'])r.commands[phase]='chase'
   })
  }
  const assigned=variant.stagePlans.filter(p=>p.teamId===pursuit)
   .flatMap(p=>p.riders).filter(r=>r.commands.phase4==='chase').length
  if(assigned!==count)throw Error('PURSUIT_WORKFORCE_NOT_ASSIGNED')
  if(hash(variant.stagePlans.filter(p=>aiIds.has(p.teamId)))!==aiPlanHash||
   hash({engine:variant.engine,stage:variant.stage,race:variant.race,
    teams:variant.teams,riders:variant.riders,weather:variant.weather,
    points:variant.points,preparation:variant.preparation})!==frozenHash)
   throw Error('IMMUTABLE_COURSE_ROSTER_OR_AI_DRIFT')
  rows.push({terrain,km,seed,workers:count,
   inputHash:hash(variant),assignedChaseRiders:assigned,result:run(variant,pursuit)})
 }
}
console.log('V4_TERRAIN_WORKFORCE_WORKER '+JSON.stringify({
 source:'synthetic_only',seeds,rows,aiPlansLocked:true,
 officialWrites:0,strictReplay:true}))
`
 ].join('\n')
 const variants=[
  {key:'preserved_v2',patch:false,peloton:false,cooperation:false,energy:false},
  {key:'calibrated_v4',patch:true,peloton:true,cooperation:true,energy:true}
 ]
 const results={}
 for(const config of variants){
  const output=join(temporary,config.key+'.mjs')
  let patched=0
  await build({absWorkingDir:root,stdin:{contents:worker,
   resolveDir:root,sourcefile:'v4-terrain-distance-workforce-synthetic.ts',loader:'ts'},
   bundle:true,platform:'node',format:'esm',target:'node22',outfile:output,
   logLevel:'silent',plugins:[{name:'strict-v4-terrain-isolation',setup(ctx){
    ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
     if(!config.patch)return null
     patched++
     const transformed=patchV4CalibratedPhysicalSource(readFileSync(args.path,'utf8'),config)
     const candidate=coalesceCandidate?injectV4DetachmentCoalescenceCandidate(transformed):transformed
     const withSplits=measuredCSplitCandidate?patchV4MeasuredChaseSplitResearchSource(candidate):candidate
     return {contents:focused?injectV4WinnerCollisionForensics(withSplits):withSplits,loader:'ts'}
    })
   }}]})
  assert.equal(patched,config.patch?1:0,'V4 research bundle patch count')
  const execution=spawnSync(process.execPath,[output],{
   cwd:root,encoding:'utf8',timeout:420000,maxBuffer:8*1024*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',TMPDIR:process.env.TMPDIR??''}
  })
  assert.equal(execution.status,0,
   config.key+' read-only worker failed '+String(execution.stderr??'').slice(-1100))
  const stdout=String(execution.stdout??'').split('\n')
  const report=stdout.filter(s=>s.startsWith('V4_TERRAIN_WORKFORCE_WORKER '))
  assert.equal(report.length,1)
  const parsed=JSON.parse(report[0].slice('V4_TERRAIN_WORKFORCE_WORKER '.length))
  assert.equal(parsed.rows.length,terrains.length*distances.length*workforces.length*seeds)
  assert.equal(parsed.officialWrites,0)
  assert.equal(parsed.aiPlansLocked,true)
  results[config.key]=parsed.rows
 }
 const paired=results.preserved_v2.map((a,i)=>{
  const b=results.calibrated_v4[i]
  assert.deepEqual(
   [a.terrain,a.km,a.seed,a.workers,a.inputHash,a.assignedChaseRiders],
   [b.terrain,b.km,b.seed,b.workers,b.inputHash,b.assignedChaseRiders],
   'Preserved V2 and isolated V4 must receive EXACTLY identical input')
  return {terrain:a.terrain,km:a.km,seed:a.seed,workers:a.workers,
   v2:a.result,v4:b.result}
 })
 const cells=[]
 for(const terrain of terrains)for(const km of distances)for(const workers of workforces){
  const candidates=paired.filter(r=>r.terrain===terrain&&r.km===km&&r.workers===workers)
  const valid=candidates.filter(r=>r.v2.valid&&r.v4.valid)
  const opening=valid.filter(r=>r.v2.opening&&r.v4.opening)
  cells.push({terrain,km,workers,attempted:candidates.length,
   pairedValid:valid.length,openingPaired:opening.length,
   survived:opening.filter(r=>r.v4.survived).length,
   medianKmAhead:median(opening.map(r=>r.v4.kmAhead)),
   medianPeakSeconds:median(opening.map(r=>r.v4.observedPeakSeconds)),
   medianEnergyAtFinish:median(opening.map(r=>r.v4.energyAtFinish)),
   explicitChasingTeams:median(valid.map(r=>r.v4.phase4ExplicitChaserTeams)),
   medianPursuitExplicitChaseRiders:median(valid.map(r=>r.v4.pursuitExplicitRiders)),
   medianPursuitTotalWorkers:median(valid.map(r=>r.v4.pursuitTotalWorkers)),
   medianPursuitTeamStrengthScore:median(valid.map(r=>r.v4.pursuitStrengthScore)),
   medianPursuitTeamEnergy:median(valid.map(r=>r.v4.pursuitMeanEnergy)),
   v2StrictReplayExclusions:candidates.filter(r=>r.v2.error==='STRICT_REPLAY').length,
   v4StrictReplayExclusions:candidates.filter(r=>r.v4.error==='STRICT_REPLAY').length,
   invalidInputOrOtherErrors:candidates.filter(r=>
    ['INVALID_INPUT','OTHER_ERROR'].includes(r.v2.error)||
    ['INVALID_INPUT','OTHER_ERROR'].includes(r.v4.error)).length,
   v2ReplayReasons:Object.fromEntries([...new Set(candidates.filter(r=>r.v2.error==='STRICT_REPLAY')
    .map(r=>r.v2.replayReason))].map(reason=>[reason,
     candidates.filter(r=>r.v2.replayReason===reason).length])),
   v4ReplayReasons:Object.fromEntries([...new Set(candidates.filter(r=>r.v4.error==='STRICT_REPLAY')
    .map(r=>r.v4.replayReason))].map(reason=>[reason,
     candidates.filter(r=>r.v4.replayReason===reason).length])),
   v2ReplayIssueCategories:Object.fromEntries([...new Set(candidates.filter(r=>r.v2.error==='STRICT_REPLAY')
    .map(r=>r.v2.replayIssueCategory))].map(category=>[category,
     candidates.filter(r=>r.v2.replayIssueCategory===category).length])),
   v4ReplayIssueCategories:Object.fromEntries([...new Set(candidates.filter(r=>r.v4.error==='STRICT_REPLAY')
    .map(r=>r.v4.replayIssueCategory))].map(category=>[category,
     candidates.filter(r=>r.v4.replayIssueCategory===category).length])),
   v2ReplayIssueCodes:Object.fromEntries([...new Set(candidates.filter(r=>r.v2.error==='STRICT_REPLAY')
    .map(r=>r.v2.replayIssueCode))].map(code=>[code,
     candidates.filter(r=>r.v2.replayIssueCode===code).length])),
   v4WinnerCollisionKinds:Object.fromEntries([...new Set(candidates.flatMap(r=>r.v4.winnerCollisionKinds??[]))].map(kind=>[kind,
     candidates.filter(r=>(r.v4.winnerCollisionKinds??[]).includes(kind)).length])),
   v4WinnerCollisionOrigins:Object.fromEntries([...new Set(candidates.flatMap(r=>r.v4.winnerCollisionOrigins??[]))].map(origin=>[origin,
     candidates.filter(r=>(r.v4.winnerCollisionOrigins??[]).includes(origin)).length])),
   v4WinnerMembership:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.winnerLineageAudit??[]).map(a=>a.previousMembership)))].map(k=>[k,
    candidates.filter(r=>(r.v4.winnerLineageAudit??[]).some(a=>a.previousMembership===k)).length])),
   v4WinnerPreviousGroupKinds:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.winnerLineageAudit??[]).map(a=>a.previousSharedGroupKind)))].map(k=>[k,
    candidates.filter(r=>(r.v4.winnerLineageAudit??[]).some(a=>a.previousSharedGroupKind===k)).length])),
   v4WinnerPhysicalLineages:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.winnerLineageAudit??[]).map(a=>a.physicalLineage)))].map(k=>[k,
    candidates.filter(r=>(r.v4.winnerLineageAudit??[]).some(a=>a.physicalLineage===k)).length])),
   v4WinnerFinalOutcomes:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.winnerLineageAudit??[]).map(a=>a.finalOutcome)))].map(k=>[k,
    candidates.filter(r=>(r.v4.winnerLineageAudit??[]).some(a=>a.finalOutcome===k)).length])),
   v4WinnerGapBands:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.winnerLineageAudit??[]).map(a=>a.gapBand)))].map(k=>[k,
    candidates.filter(r=>(r.v4.winnerLineageAudit??[]).some(a=>a.gapBand===k)).length])),
   v4PostCatchAuditMembership:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.transferAudit??[]).map(a=>a.membership)))].map(k=>[k,
    candidates.filter(r=>(r.v4.transferAudit??[]).some(a=>a.membership===k)).length])),
   v4PostCatchAuditSources:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.transferAudit??[]).map(a=>a.sourceGroupCount)))].map(k=>[k,
    candidates.filter(r=>(r.v4.transferAudit??[]).some(a=>a.sourceGroupCount===k)).length])),
   v4PostCatchAuditGapSpread:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.transferAudit??[]).map(a=>a.sourceGapSpread)))].map(k=>[k,
    candidates.filter(r=>(r.v4.transferAudit??[]).some(a=>a.sourceGapSpread===k)).length])),
   v4PostCatchAuditCheckpointDistance:Object.fromEntries([...new Set(candidates.flatMap(r=>(r.v4.transferAudit??[]).map(a=>a.lastCheckpointDistance)))].map(k=>[k,
    candidates.filter(r=>(r.v4.transferAudit??[]).some(a=>a.lastCheckpointDistance===k)).length])),
   v4PostCatchTransfers:Object.fromEntries([...new Set(candidates.filter(r=>r.v4.error==='STRICT_REPLAY'&&r.v4.postCatchTransfer!=='NOT_POST_CATCH')
    .map(r=>r.v4.postCatchTransfer))].map(k=>[k,
     candidates.filter(r=>r.v4.postCatchTransfer===k).length])),
   v4ReplayIssueCodes:Object.fromEntries([...new Set(candidates.filter(r=>r.v4.error==='STRICT_REPLAY')
    .map(r=>r.v4.replayIssueCode))].map(code=>[code,
     candidates.filter(r=>r.v4.replayIssueCode===code).length])),
   v2ReplayCheckpoints:Object.fromEntries([...new Set(candidates.filter(r=>r.v2.error==='STRICT_REPLAY')
    .map(r=>r.v2.replayCheckpoint))].map(checkpoint=>[checkpoint,
     candidates.filter(r=>r.v2.replayCheckpoint===checkpoint).length])),
   v4ReplayCheckpoints:Object.fromEntries([...new Set(candidates.filter(r=>r.v4.error==='STRICT_REPLAY')
    .map(r=>r.v4.replayCheckpoint))].map(checkpoint=>[checkpoint,
     candidates.filter(r=>r.v4.replayCheckpoint===checkpoint).length]))})
 }
 const pairedWorkforceContrasts=[]
 for(const terrain of terrains)for(const km of distances){
  const comparable=seedIds.filter(seed=>
   [0,1,3,5].every(workers=>paired.some(r=>
    r.terrain===terrain&&r.km===km&&r.seed===seed&&r.workers===workers&&
    r.v2.valid&&r.v4.valid&&r.v2.opening&&r.v4.opening)))
  const fetch=(seed,workers)=>paired.find(r=>
   r.terrain===terrain&&r.km===km&&r.seed===seed&&r.workers===workers).v4
  pairedWorkforceContrasts.push({terrain,km,fullyPairedOpeningSeeds:comparable.length,
   zeroToFiveMedianPeakReductionSeconds:median(comparable.map(seed=>
    fetch(seed,0).observedPeakSeconds-fetch(seed,5).observedPeakSeconds)),
   zeroToFiveMedianKmAheadReduction:median(comparable.map(seed=>
    fetch(seed,0).kmAhead-fetch(seed,5).kmAhead)),
   zeroToFiveFewerSurvivals:comparable.filter(seed=>fetch(seed,0).survived).length-
    comparable.filter(seed=>fetch(seed,5).survived).length})
 }
 assert.equal(cells.length,terrains.length*distances.length*workforces.length)
 assert(cells.every(c=>c.attempted===seeds))
 assert(cells.every(c=>c.invalidInputOrOtherErrors===0),
  'No invalid synthetic fields or unexpected runtime errors permitted')
 const flat=cells.filter(c=>c.terrain==='flat')
 assert(flat.every(c=>c.pairedValid===seeds&&c.openingPaired>=4&&
  c.v4StrictReplayExclusions===0),
  'Flat stage controls require adequate strictly matched openings')
 assert(pairedWorkforceContrasts.filter(r=>r.terrain==='flat')
  .every(r=>r.fullyPairedOpeningSeeds>=4&&
   r.zeroToFiveMedianPeakReductionSeconds>0),
  'Five explicit human chasers should reduce flat-stage peak gaps in paired openings')
 if(coalesceCandidate){
  const shortMountain=cells.filter(c=>c.terrain==='mountain'&&c.km===120)
  const longMountain=cells.filter(c=>c.terrain==='mountain'&&c.km===220)
  assert.equal(shortMountain.length,focused?0:4,
   'Focused 220km forensic must not require 120km mountain cells')
  assert.equal(longMountain.length,4)
  assert(shortMountain.every(c=>c.v4StrictReplayExclusions===0),
   'Candidate must preserve all V4 120km mountain strict replay validations')
  assert(longMountain.reduce((sum,c)=>sum+c.v4StrictReplayExclusions,0)<=2,
   'Candidate must not regress the 30/32 validated 220km mountain research pilot')
  assert(cells.every(c=>!Object.hasOwn(c.v4ReplayIssueCodes,'duplicate_physical_group_gap')),
   'Candidate must not resurrect duplicate physical finish gaps')
 }
 const diagnosedFailures=focused?paired.filter(x=>!x.v4.valid&&x.v4.error==='STRICT_REPLAY').map(x=>({terrain:x.terrain,km:x.km,seed:x.seed,workers:x.workers,issue:x.v4.replayIssueCode,measuredSplitCheckpoints:x.v4.measuredSplitCheckpoints})):[]
 const coverageWarnings=cells.filter(c=>c.pairedValid<4||c.openingPaired<3)
  .map(c=>({terrain:c.terrain,km:c.km,workers:c.workers,
   pairedValid:c.pairedValid,openingPaired:c.openingPaired,
   reason:'LOW_MATCHED_SAMPLE_DO_NOT_CALIBRATE'}))
 console.log('V4_TERRAIN_DISTANCE_WORKFORCE_PILOT '+JSON.stringify({
  status:'SYNTHETIC_DIAGNOSTIC_ONLY_NOT_REALISM_APPROVAL',focusedMountainWinnerForensics:focused,
  coalescenceCandidateApplied:coalesceCandidate,
  measuredCSplitCandidateApplied:measuredCSplitCandidate,
  diagnosedFailures,
  raceProfiles:terrains,raceDistancesKm:distances,
  explicitHumanChaseWorkforce:workforces,seedCount:seeds,seedIds,
  fieldTeamCounts:[18,19,20,21,22],
  humanChasePhases:[2,3,4],
  workerSelection:'indices [2,3,5,0,1]; 5-worker group includes leader and sprinter',
  aiPlansPreparedOncePerCourseSeed:true,weatherHeldFixedAcrossWorkers:true,
  preservedV2AndV4InputsIdentical:true,
  replayExclusionsNeverWaived:true,officialWrites:0,
  cells,pairedWorkforceContrasts,coverageWarnings,
  v4StrictReplayFailures:paired.filter(r=>!r.v4.valid&&r.v4.error==='STRICT_REPLAY').length,
  originalV2SolverModified:false,realismApproved:false
 }))
 if(targetedSeedText&&measuredCSplitCandidate)
  assert(paired.every(r=>r.v4.valid),
   'Targeted physical C split fix incomplete: strict replay still excludes a seed-2 scenario')
}finally{rmSync(temporary,{recursive:true,force:true})}
