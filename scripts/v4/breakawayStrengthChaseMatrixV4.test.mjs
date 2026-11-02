/**
 * 3x3 V4 read-only pilot. Same 170 km hilly course and template-first
 * AI tactical decisions within every seed. No official races or SQL.
 */
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-strength-chase-'))
const strengths=['weak','medium','strong'],chases=['passive','normal','aggressive']
const seedCount=12
const median=xs=>{
 const s=xs.filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b)
 return s.length?Number((s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2).toFixed(4)):null
}
try{
 const probe=readFileSync(join(root,'src/race-engine-v4/physicalResearchProbeV4.test.ts'),'utf8')
 const a=probe.indexOf('function makeField('),b=probe.indexOf('\nconst scenarios=',a)
 assert(a>=0&&b>a,'Pinned synthetic fixture factory must exist')
 const factory=probe.slice(a,b)
 const workerCode=[
  "import {createHash} from 'node:crypto'",
  "import {validateRunInput,PPM_UNIVERSAL_RACE_ENGINE_KEY,PPM_UNIVERSAL_RACE_ENGINE_VERSION} from './src/universal-race-engine/runRaceEngine.ts'",
  "import {runSelectedRaceEngineV1} from './src/universal-race-engine/runSelectedRaceEngineV1.ts'",
  "import {prepareV4ShadowRace} from './src/race-engine-v4/templateFirstPlannerV4.ts'",
  "import {historicalOpeningBreakawayJourney,historicalPhysicalGapAudit} from './src/race-engine-v4/privateHistoricalDiagnosticsV4.mjs'",
  factory,
  String.raw`
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const strengths=['weak','medium','strong'],chases=['passive','normal','aggressive']
const rows=[]
function run(input){
 if(validateRunInput(input).length)return {valid:false,error:'INVALID_INPUT'}
 try{
  const r=runSelectedRaceEngineV1(input)
  if(!r.validationPassed||r.replaySynchronization?.synchronized!==true)
   return {valid:false,error:'STRICT_REPLAY'}
  const opening=historicalOpeningBreakawayJourney(r,input.stage.distanceKm)
  const peak=historicalPhysicalGapAudit(r)
  const p3=r.roadRaceResolution?.phase3Decisive,p4=r.roadRaceResolution?.phase4Finish
  return {valid:true,opening:opening.openingAccepted,kmAhead:opening.kmAhead,
   survived:r.calibrationSummary?.breakawaySurvived===true,
   caught:r.calibrationSummary?.breakawayCaught===true,
   peakSeconds:peak.observedPeak,
   phase3Growth:p3&&Number.isFinite(p3.physicalStartGapSeconds)&&Number.isFinite(p3.physicalEndGapSeconds)?
    p3.physicalEndGapSeconds-p3.physicalStartGapSeconds:null,
   phase4Energy:p4?.riderStates?.length?
    p4.riderStates.reduce((total,x)=>total+x.energyAtFinish,0)/p4.riderStates.length:null}
 }catch(e){return {valid:false,error:e instanceof Error&&e.message.startsWith(
  'Universal replay synchronization failed:')?'STRICT_REPLAY':'OTHER_ERROR'}}
}
for(let seed=0;seed<12;seed++){
 const n=[18,19,20,21,22,18,19,20,21,22,18,19][seed]
 let {input,options}=makeField(n,Math.floor(n/2),{
  terrain:'hilly',neutral:false,seed:'v4-strength-chase-2026-'+seed,
  humanPursuitTeam:true,humanChase:false})
 const stageId='12345678-1234-4234-8234-'+String(1600+seed).padStart(12,'0')
 const raceId='12345678-1234-4234-8234-'+String(1700+seed).padStart(12,'0')
 input.race.raceId=raceId
 input.stage.stageId=stageId;input.stage.raceId=raceId
 input.stage.profileType='rolling';input.stage.finishType='flat_finish'
 input.stage.distanceKm=170;input.stage.elevationGainM=1120+(seed%9)*170
 input.stage.terrainPercentages={flat:27,hilly:58,mountain:15,cobbled:0}
 input.stage.profilePoints=[{km:0,elevationM:30},{km:27.2,elevationM:245},
  {km:61.2,elevationM:65},{km:96.9,elevationM:410},
  {km:129.2,elevationM:135},{km:153,elevationM:330},{km:170,elevationM:155}]
 for(const point of input.points){point.stageId=stageId
  if(point.pointType==='FINISH')point.kmFromStart=170}
 options.lock.stageId=stageId
 const prepared=prepareV4ShadowRace(input,options)
 if(prepared.status!=='ai_prepared'||!prepared.intents.length)
  throw Error('NO_AI_PREPARATION')
 const base=prepared.combinedInput
 const aiIds=new Set(options.teamControl.filter(t=>t.kind==='ai').map(t=>t.teamId))
 const pursuit=options.teamControl.filter(t=>t.kind==='human').at(-1)?.teamId
 if(!pursuit)throw Error('NO_PURSUIT_TEAM')
 const attackers=new Set(base.stagePlans.filter(t=>t.teamId!==pursuit)
  .flatMap(t=>t.riders.filter(r=>r.stageRole==='breakaway_rider'||
   r.commands.phase1==='join_breakaway').map(r=>r.riderId)))
 if(!attackers.size)throw Error('NO_ATTACKER_CANDIDATES')
 const aiHash=sha(base.stagePlans.filter(p=>aiIds.has(p.teamId)))
 const immutable=sha({engine:base.engine,race:base.race,stage:base.stage,
  teams:base.teams,weather:base.weather,points:base.points,
  preparation:base.preparation})
 for(const strength of strengths)for(const chase of chases){
  const modified=structuredClone(base)
  const delta=strength==='weak'?-12:strength==='strong'?12:0
  for(const rider of modified.riders){
   if(!attackers.has(rider.riderId))continue
   for(const stat of ['flat','climbing','endurance','resistance','raceIQ','teamwork','overall'])
    rider[stat]=Math.max(35,Math.min(99,rider[stat]+delta))
  }
  for(const plan of modified.stagePlans){
   if(plan.teamId!==pursuit)continue
   for(const [i,rider] of plan.riders.entries()){
    if(![2,3,5].includes(i))continue
    rider.commands.phase2=chase==='aggressive'?'chase':'follow_team_plan'
    rider.commands.phase3=chase==='aggressive'?'chase':'follow_team_plan'
    rider.commands.phase4=chase==='passive'?'follow_team_plan':'chase'
   }
  }
  if(sha(modified.stagePlans.filter(p=>aiIds.has(p.teamId)))!==aiHash||
   sha({engine:modified.engine,race:modified.race,stage:modified.stage,
    teams:modified.teams,weather:modified.weather,points:modified.points,
    preparation:modified.preparation})!==immutable)throw Error('BASELINE_DRIFT')
  rows.push({seed,strength,chase,attackerCandidates:attackers.size,
   inputHash:sha(modified),result:run(modified)})
 }
}
console.log('V4_MATRIX_WORKER '+JSON.stringify({
 rows,strictReplay:true,officialWrites:0,aiPlansPreparedOncePerSeed:true}))
`
 ].join('\n')
 const variants=[
  {key:'preserved_v2',patch:false,peloton:false,cooperation:false,energy:false},
  {key:'combined_energy',patch:true,peloton:true,cooperation:true,energy:true}
 ]
 const results={}
 for(const cfg of variants){
  const out=join(folder,cfg.key+'.mjs')
  let patched=0
  await build({absWorkingDir:root,
   stdin:{contents:workerCode,resolveDir:root,sourcefile:'v4-strength-chase-worker.ts',loader:'ts'},
   bundle:true,platform:'node',format:'esm',target:'node22',outfile:out,logLevel:'silent',
   plugins:[{name:'strict-v4-matrix-source',setup(ctx){
    ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
     if(!cfg.patch)return null
     patched++
     return {contents:patchV4CalibratedPhysicalSource(readFileSync(args.path,'utf8'),cfg),loader:'ts'}
    })
   }}]
  })
  assert.equal(patched,cfg.patch?1:0)
  const execution=spawnSync(process.execPath,[out],{
   cwd:root,encoding:'utf8',timeout:420000,maxBuffer:8*1024*1024,
   env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',TMPDIR:process.env.TMPDIR??''}
  })
  assert.equal(execution.status,0,cfg.key+' worker failed: '+String(execution.stderr??'').slice(-900))
  const lines=String(execution.stdout??'').split('\n').filter(x=>x.startsWith('V4_MATRIX_WORKER '))
  assert.equal(lines.length,1,'Expected one research worker report')
  const result=JSON.parse(lines[0].slice('V4_MATRIX_WORKER '.length))
  assert.equal(result.rows.length,seedCount*9)
  assert.equal(result.officialWrites,0)
  assert.equal(result.aiPlansPreparedOncePerSeed,true)
  results[cfg.key]=result.rows
 }
 const joined=results.preserved_v2.map((v2,i)=>{
  const v4=results.combined_energy[i]
  assert.deepEqual([v2.seed,v2.strength,v2.chase,v2.inputHash,v2.attackerCandidates],
   [v4.seed,v4.strength,v4.chase,v4.inputHash,v4.attackerCandidates],
   'Strict V2/V4 input matching is mandatory')
  return {seed:v2.seed,strength:v2.strength,chase:v2.chase,v2:v2.result,v4:v4.result}
 })
 const cells=strengths.flatMap(strength=>chases.map(chase=>{
  const all=joined.filter(r=>r.strength===strength&&r.chase===chase)
  const matched=all.filter(r=>r.v2.valid&&r.v4.valid)
  const opening=matched.filter(r=>r.v2.opening&&r.v4.opening)
  return {strength,chase,attempted:all.length,
   matchedValid:matched.length,matchedOpening:opening.length,
   survived:opening.filter(r=>r.v4.survived).length,
   caught:opening.filter(r=>r.v4.caught).length,
   medianKmAhead:median(opening.map(r=>r.v4.kmAhead)),
   medianPeakSeconds:median(opening.map(r=>r.v4.peakSeconds)),
   medianPhase3GrowthSeconds:median(opening.map(r=>r.v4.phase3Growth)),
   medianFinishEnergy:median(opening.map(r=>r.v4.phase4Energy)),
   v2ReplayFailures:all.filter(r=>r.v2.error==='STRICT_REPLAY').length,
   v4ReplayFailures:all.filter(r=>r.v4.error==='STRICT_REPLAY').length,
   otherFailures:all.filter(r=>r.v2.error==='OTHER_ERROR'||r.v4.error==='OTHER_ERROR'||
    r.v2.error==='INVALID_INPUT'||r.v4.error==='INVALID_INPUT').length}
 }))
 const sameStrength= strengths.map(strength=>{
  const matched=Array.from({length:seedCount},(_,seed)=>seed).filter(seed=>
   chases.every(chase=>joined.some(r=>r.seed===seed&&r.strength===strength&&
    r.chase===chase&&r.v2.valid&&r.v4.valid&&r.v2.opening&&r.v4.opening)))
  const get=(seed,chase)=>joined.find(r=>r.seed===seed&&r.strength===strength&&r.chase===chase).v4
  return {strength,fullyPairedOpeningSeeds:matched.length,
   passiveToAggressiveMedianPeakReductionSeconds:median(matched.map(seed=>
    get(seed,'passive').peakSeconds-get(seed,'aggressive').peakSeconds))}
 })
 const sameChase=chases.map(chase=>{
  const matched=Array.from({length:seedCount},(_,seed)=>seed).filter(seed=>
   strengths.every(strength=>joined.some(r=>r.seed===seed&&r.strength===strength&&
    r.chase===chase&&r.v2.valid&&r.v4.valid&&r.v2.opening&&r.v4.opening)))
  const get=(seed,strength)=>joined.find(r=>r.seed===seed&&r.strength===strength&&r.chase===chase).v4
  return {chase,fullyPairedOpeningSeeds:matched.length,
   weakToStrongMedianPeakIncreaseSeconds:median(matched.map(seed=>
    get(seed,'strong').peakSeconds-get(seed,'weak').peakSeconds))}
 })
 assert.equal(cells.length,9)
 assert(cells.every(c=>c.attempted===seedCount))
 assert(cells.every(c=>c.matchedValid>=10),
  'Each treatment needs at least ten strictly paired V2/V4 races')
 assert(cells.every(c=>c.matchedOpening>=5),
  'Each treatment needs at least five matched accepted opening escapes')
 assert(cells.every(c=>c.v4ReplayFailures===0),
  'Calibrated V4 must not silently lose strict replay validity')
 assert(sameStrength.every(r=>r.fullyPairedOpeningSeeds>=5&&
  r.passiveToAggressiveMedianPeakReductionSeconds>0),
  'Aggressive pursuit must reduce the measured peak gap in matched cases')
 assert(sameChase.every(r=>r.fullyPairedOpeningSeeds>=5&&
  r.weakToStrongMedianPeakIncreaseSeconds>0),
  'Stronger designated attackers must improve measured gaps in matched cases')
 console.log('V4_BREAKAWAY_STRENGTH_CHASE_MATRIX '+JSON.stringify({
  status:'SYNTHETIC_ONLY_NOT_REALISM_APPROVAL',seeds:seedCount,raceKm:170,
  terrain:'hilly',conditions:9,
  strengthTreatment:'designated opening attack riders +/-12 stats, clamped 35-99',
  chaseTreatments:['passive: no explicit chase',
   'normal: three riders chase Phase 4',
   'aggressive: same riders chase Phases 2, 3, and 4'],
  sameAiPlansPerSeed:true,sameInputsPerV2V4:true,
  strictReplay:true,invalidExcluded:true,productionWrites:0,
  cells,pairedAcrossChases:sameStrength,pairedAcrossStrengths:sameChase,
  realismApproved:false,preservedV2Unchanged:true
 }))
}finally{rmSync(folder,{recursive:true,force:true})}
