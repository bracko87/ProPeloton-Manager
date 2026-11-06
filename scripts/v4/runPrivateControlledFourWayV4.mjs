/**
 * Offline four-way research runner. NO DB, HTTP, scheduler or writers.
 * Compiles baseline + calibrated V4 as separate modules in one isolated child.
 * Raw source and rider rows flow only via child stdin, never to logs.
 */
import {build} from 'esbuild'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'
import {isValidV4PhysicalPatch} from './runIsolatedShadowV4.mjs'
import {isV4FourWaySafePhase} from './privateControlledFourWaySafeFailuresV4.mjs'
import {V4_SAFE_PHYSICS_FAILURE_STATUSES} from './isolatedShadowExecutionFailureV4.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const engine=resolve(root,'src/universal-race-engine/runRaceEngine.ts')
const worker=resolve(root,'src/race-engine-v4/privateControlledFourWayWorkerV4.ts')
const keys=(x,expected)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===expected.length&&expected.every(k=>Object.hasOwn(x,k))
const primitives=(x,allowed)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).every(k=>allowed.includes(k)&&
 (x[k]===null||typeof x[k]==='boolean'||
 (typeof x[k]==='number'&&Number.isFinite(x[k]))))
const cases=['baselineOriginal','baselineV4Tactics','v4Original','v4V4Tactics']
const effects=['aiTacticsOnBaseline','v4PhysicsWithOriginalTactics',
 'v4PhysicsWithAiTactics','aiTacticsOnV4Physics']
const caseFields=['finishers','dnf','winnerTimeSeconds','ridersAtZeroGap',
 'maximumFinishGapSeconds','finalGroupCount','calibrationReportedPeakSeconds',
 'observedBreakawayPeakSeconds','phase1EndGapSeconds','phase2EndGapSeconds',
 'phase3EndGapSeconds','phase4EndGapSeconds','phase3ChasingTeamCount',
 'openingBreakawaySize','caught','replayCheckpoints']
const officialFields=['sameWinner','winningTimeDeltaSeconds','rankChangedRiders',
 'statusChangedRiders','gapChangedRiders','identicalStatusRankGapRiders',
 'meanAbsoluteRankChange','maximumAbsoluteRankChange',
 'meanAbsoluteGapChangeSeconds','maximumAbsoluteGapChangeSeconds',
 'meanFinishEnergyDelta','meanAbsoluteFinishEnergyDelta',
 'maximumAbsoluteFinishEnergyDelta','meanEnergySpentDelta',
 'meanAbsoluteEnergySpentDelta']
const pairFields=['sameWinner','statusChangedRiders','rankChangedRiders',
 'gapChangedRiders','rankChangedWithSameGapAndStatus',
 'meanAbsoluteRankChange','maximumAbsoluteRankChange',
 'meanAbsoluteGapChangeSeconds','maximumAbsoluteGapChangeSeconds',
 'meanAbsoluteFinishEnergyDelta','maximumAbsoluteFinishEnergyDelta']
function verifyReport(o){
 const partial=o?.status==='V4_CONTROLLED_PARTIAL_DIAGNOSTIC'
 const expected=['contract','status','researchOnly','officialWrites',
  'productionEnabled','productionParityVerified','originalProductionLockVerified',
  'ridersCompared','sharedReconstructedInputAndSeed','comparisonScope',
  'aiTeams','humanTeams','plannedAIIntents','archivedOfficial','cases',
  'isolatedEffects',...(partial?['completedArms','completeFourWay',
    'safeFailures','prefixProbes']:[])]
 if(!keys(o,expected)||
  o.contract!=='ppm.v4.private-controlled-four-way.v1'||
  !['V4_CONTROLLED_FOUR_WAY_COMPLETE','V4_CONTROLLED_PARTIAL_DIAGNOSTIC'].includes(o.status)||
  o.researchOnly!==true||o.officialWrites!==0||
  o.productionEnabled!==false||o.productionParityVerified!==false||
  o.originalProductionLockVerified!==false||o.ridersCompared!==108||
  o.sharedReconstructedInputAndSeed!==true||
  o.comparisonScope!=='factorial_same_reconstructed_input_and_seed_not_original_production_lock'||
  o.aiTeams!==18||o.humanTeams!==0||
  !Number.isSafeInteger(o.plannedAIIntents)||o.plannedAIIntents<=0||
  !keys(o.cases,cases)||!keys(o.isolatedEffects,effects)||
  !keys(o.archivedOfficial,['finishers','dnf','calibrationReportedPeakSeconds',
    'observedBreakawayPeakSeconds','observedSampleCount'])||
  !primitives(o.archivedOfficial,['finishers','dnf','calibrationReportedPeakSeconds',
    'observedBreakawayPeakSeconds','observedSampleCount']))
  throw Error('V4_FOUR_WAY_REPORT_REJECTED')
 const safeCodes=new Set(V4_SAFE_PHYSICS_FAILURE_STATUSES)
 if(partial){
  if(o.completeFourWay!==false||!Number.isSafeInteger(o.completedArms)||
     o.completedArms<1||o.completedArms>=4||
     !keys(o.safeFailures,cases)||
     !Array.isArray(o.prefixProbes)||o.prefixProbes.length!==4||
     !o.prefixProbes.every((p,i)=>
      keys(p,['throughPhase','status','reason'])&&p.throughPhase===i+1&&
      ['PASS','EXECUTION_REJECTED','REPLAY_REJECTED','NOT_RUN'].includes(p.status)&&
      (p.status==='PASS'||p.status==='NOT_RUN'?
       p.reason===null:safeCodes.has(p.reason))))
    throw Error('V4_FOUR_WAY_REPORT_REJECTED')
  if(!o.cases.baselineOriginal)throw Error('V4_FOUR_WAY_REPORT_REJECTED')
 }
 let successfulCases=0
 for(const name of cases){
  const m=o.cases[name]
  const failure=partial?o.safeFailures[name]:null
  if(partial && (
      (m===null)===(failure===null)||
      (failure!==null&&!safeCodes.has(failure))))
   throw Error('V4_FOUR_WAY_CASE_REJECTED')
  if(partial&&m===null)continue
  successfulCases++
  if(!keys(m,[...caseFields,'vsArchivedOfficial'])||
    !primitives(Object.fromEntries(caseFields.map(k=>[k,m?.[k]])),caseFields)||
    !keys(m.vsArchivedOfficial,officialFields)||
    !primitives(m.vsArchivedOfficial,officialFields))
   throw Error('V4_FOUR_WAY_CASE_REJECTED')
 }
 if(partial && successfulCases!==o.completedArms)
  throw Error('V4_FOUR_WAY_REPORT_REJECTED')
 for(const name of effects){
  const e=o.isolatedEffects[name]
  if(partial&&e===null)continue
  if(!keys(e,pairFields)||!primitives(e,pairFields))
   throw Error('V4_FOUR_WAY_EFFECT_REJECTED')
 }
 // Unavailable effects must correspond to unavailable case arms, never
 // silently suppress an otherwise measurable controlled pair.
 if(partial){
  const pairs={
   aiTacticsOnBaseline:['baselineOriginal','baselineV4Tactics'],
   v4PhysicsWithOriginalTactics:['baselineOriginal','v4Original'],
   v4PhysicsWithAiTactics:['baselineV4Tactics','v4V4Tactics'],
   aiTacticsOnV4Physics:['v4Original','v4V4Tactics']
  }
  for(const [name,[left,right]] of Object.entries(pairs))
   if((o.isolatedEffects[name]===null)===(o.cases[left]!==null&&o.cases[right]!==null))
    throw Error('V4_FOUR_WAY_EFFECT_REJECTED')
 }
 return o
}
export async function runPrivateControlledFourWayV4(envelope,
 {compile=build,execute=spawnSync}={}){
 const {input,options,reference}=envelope??{}
 if(typeof input?.stage?.stageId!=='string'||
    input.stage.stageId!==options?.lock?.stageId||
    input.stage.stageId!==reference?.stageId||
    input.race?.raceId!==reference?.raceId||
    !Array.isArray(input.riders)||input.riders.length!==108||
    !Array.isArray(reference?.officialRows)||reference.officialRows.length!==108||
    !Array.isArray(reference?.savedClassification)||reference.savedClassification.length!==108||
    !Array.isArray(reference?.savedEnergyRows)||reference.savedEnergyRows.length!==108)
  throw Error('V4_FOUR_WAY_INPUT_REJECTED')
 const payload=JSON.stringify({input,options,reference})
 if(Buffer.byteLength(payload,'utf8')>18*1024*1024)
  throw Error('V4_FOUR_WAY_SIZE_REJECTED')
 const original=readFileSync(engine,'utf8')
 const patch=patchV4CalibratedPhysicalSource(original,{
  peloton:true,cooperation:true,energy:true
 })
 if(!isValidV4PhysicalPatch(original,patch))throw Error('V4_FOUR_WAY_PHYSICS_REJECTED')
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-four-way-'))
 try{
  const outfile=join(folder,'isolated-four-way.mjs')
  let baselineLoads=0,patchLoads=0
  await compile({
   entryPoints:[worker],outfile,bundle:true,platform:'node',
   format:'esm',target:'node20',logLevel:'silent',
   plugins:[{name:'private-dual-physics-only',setup(api){
    api.onResolve({filter:/^ppm-v4-calibrated-physical$/},()=>({
     path:engine,namespace:'ppm-v4-offline-physics'
    }))
    api.onLoad({filter:/.*/,namespace:'ppm-v4-offline-physics'},args=>{
     if(resolve(args.path)!==engine||++patchLoads!==1)
      throw Error('V4_FOUR_WAY_PATCH_SOURCE_DRIFT')
     return {contents:patch,loader:'ts',resolveDir:dirname(engine)}
    })
    api.onLoad({filter:/[\\/]src[\\/]universal-race-engine[\\/]runRaceEngine\.ts$/},
     args=>{
      if(args.namespace!=='file'||resolve(args.path)!==engine||
         ++baselineLoads!==1)throw Error('V4_FOUR_WAY_BASELINE_SOURCE_DRIFT')
      return {contents:original,loader:'ts',resolveDir:dirname(engine)}
     })
   }}]
  })
  if(baselineLoads!==1||patchLoads!==1)throw Error('V4_FOUR_WAY_DUAL_BUILD_REJECTED')
  const child=execute(process.execPath,[outfile],{
   cwd:root,encoding:'utf8',timeout:240000,maxBuffer:512*1024,
   input:payload,env:{PATH:process.env.PATH??'',
    HOME:process.env.HOME??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',TMPDIR:process.env.TMPDIR??'',
    SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  const prefix='V4_FOUR_WAY_REPORT '
  const lines=String(child.stdout??'').trim().split(/\r?\n/)
  if(child.status!==0 && !child.error && !child.stderr &&
     lines.length===1 && lines[0].startsWith('V4_FOUR_WAY_REJECTED ')){
   const safePhase=lines[0].slice('V4_FOUR_WAY_REJECTED '.length)
   if(isV4FourWaySafePhase(safePhase))
    throw Error('V4_FOUR_WAY_'+safePhase+'_REJECTED')
  }
  if(child.error||child.status!==0||lines.length!==1||child.stderr||
     !lines[0].startsWith(prefix))
   throw Error('V4_FOUR_WAY_WORKER_REJECTED')
  return verifyReport(JSON.parse(lines[0].slice(prefix.length)))
 }finally{rmSync(folder,{recursive:true,force:true})}
}
