/**
 * Local PRIVATE historical V4 physical comparison of the exact locked input.
 * Builds three isolated solver binaries; modifies no V2 file; no Supabase.
 * Real history NEVER enters GitHub, logs, or production.
 */
import {build} from 'esbuild'
import {readFileSync,realpathSync,statSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,relative,sep,isAbsolute} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'
import {HISTORICAL_TERRAINS,HISTORICAL_PARITY_REASONS,HISTORICAL_ERROR_TYPES,
 HISTORICAL_FAILURE_REASONS}
 from '../../src/race-engine-v4/privateHistoricalDiagnosticsV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const safeFile=(raw,size)=>{
 if(typeof raw!=='string'||!isAbsolute(raw))throw Error('PRIVATE_PATH_REJECTED')
 const canonical=realpathSync(raw),repository=realpathSync(root)
 const rel=relative(repository,canonical),meta=statSync(canonical)
 if(rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))||
    !meta.isFile()||meta.size<=0||meta.size>size||
    (process.platform!=='win32'&&(meta.mode&0o077)!==0))
  throw Error('PRIVATE_PATH_REJECTED')
 return canonical
}
const median=(nums)=>{
 const s=nums.filter(x=>typeof x==='number'&&Number.isFinite(x)).sort((a,b)=>a-b)
 return s.length?Number((s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2).toFixed(6)):null
}
const by=(rows,metric)=>median(rows.map(row=>row[metric]))
const variants=[
 {key:'preserved_v2',patch:false,peloton:false,cooperation:false,energy:false},
 {key:'combined',patch:true,peloton:true,cooperation:true,energy:false},
 {key:'combined_energy',patch:true,peloton:true,cooperation:true,energy:true},
]
function aggregate(comparisons,rejected){
 const group=(subset)=>{
 const active=subset.filter(x=>x.preserved_v2.acceptedOpeningAttacks>0&&
  x.combined.acceptedOpeningAttacks>0)
 return ({
  eligible:subset.length,
  matchedOpeningBreakawayCases:active.length,
  v4OpeningAtLeast25KmCount:active.filter(x=>
   x.combined.openingJourney?.kmAhead>=25).length,
  v4OpeningAtLeast50KmCount:active.filter(x=>
   x.combined.openingJourney?.kmAhead>=50).length,
  v4OpeningAtLeast100KmCount:active.filter(x=>
   x.combined.openingJourney?.kmAhead>=100).length,
  v4OpeningAbove60SecondsAtLeast10KmCount:active.filter(x=>
   x.combined.openingJourney?.sampledAbove60Km>=10).length,
  v4OpeningAbove120SecondsAtLeast10KmCount:active.filter(x=>
   x.combined.openingJourney?.sampledAbove120Km>=10).length,
  v2OpeningCatchDistanceKmMedian:by(active.map(x=>x.preserved_v2.openingJourney),'kmAhead'),
  v4OpeningCatchDistanceKmMedian:by(active.map(x=>x.combined.openingJourney),'kmAhead'),
  v4OpeningDistanceOver60SecondsKmMedian:by(active.map(x=>x.combined.openingJourney),'sampledAbove60Km'),
  v4OpeningDistanceOver120SecondsKmMedian:by(active.map(x=>x.combined.openingJourney),'sampledAbove120Km'),
  v4OpeningCatchExactCount:active.filter(x=>['phase1_exact','phase2_exact','phase3_exact'].includes(
   x.combined.openingJourney?.catchLocation)).length,
  v4OpeningCatchEstimatedCount:active.filter(x=>
   x.combined.openingJourney?.phase4Estimated===true).length,
  v4OpeningSurvivedCount:active.filter(x=>
   x.combined.openingJourney?.catchLocation==='survived_to_finish').length,
  v4OpeningUntraceableCount:active.filter(x=>
   x.combined.openingJourney?.kmAhead===null).length,
  baselineMedianObservedPeakAmongBreakawaysSeconds:by(active.map(x=>x.preserved_v2),'observedPhysicalPeakSeconds'),
  combinedMedianObservedPeakAmongBreakawaysSeconds:by(active.map(x=>x.combined),'observedPhysicalPeakSeconds'),
  combinedEnergyMedianObservedPeakAmongBreakawaysSeconds:by(active.map(x=>x.combined_energy),'observedPhysicalPeakSeconds'),
  baselineBreakawayCaughtAmongBreakaways:active.filter(x=>x.preserved_v2.breakawayCaught).length,
  combinedBreakawayCaughtAmongBreakaways:active.filter(x=>x.combined.breakawayCaught).length,
  baselineBreakawaySurvivedAmongBreakaways:active.filter(x=>x.preserved_v2.breakawaySurvived).length,
  combinedBreakawaySurvivedAmongBreakaways:active.filter(x=>x.combined.breakawaySurvived).length,
  medianCombinedPhase3GrowthAmongBreakawaysSeconds:by(active.map(x=>x.combined),'phase3GapGrowthSeconds'),
  medianCombinedEnergyAtFinishAmongBreakaways:by(active.map(x=>x.combined),'meanPhase4EnergyAtFinish'),
  baselineFieldsWithAcceptedOpeningAttacks:subset.filter(x=>x.preserved_v2.acceptedOpeningAttacks>0).length,
  combinedFieldsWithAcceptedOpeningAttacks:subset.filter(x=>x.combined.acceptedOpeningAttacks>0).length,
  baselineMedianAcceptedOpeningAttacks:by(subset.map(x=>x.preserved_v2),'acceptedOpeningAttacks'),
  combinedMedianAcceptedOpeningAttacks:by(subset.map(x=>x.combined),'acceptedOpeningAttacks'),
  baselineMedianMaxBreakawaySeconds:by(subset.map(x=>x.preserved_v2),'maximumBreakawayGapSeconds'),
  combinedMedianMaxBreakawaySeconds:by(subset.map(x=>x.combined),'maximumBreakawayGapSeconds'),
  energyMedianMaxBreakawaySeconds:by(subset.map(x=>x.combined_energy),'maximumBreakawayGapSeconds'),
  baselineMedianObservedPhysicalPeakSeconds:by(subset.map(x=>x.preserved_v2),'observedPhysicalPeakSeconds'),
  combinedMedianObservedPhysicalPeakSeconds:by(subset.map(x=>x.combined),'observedPhysicalPeakSeconds'),
  energyMedianObservedPhysicalPeakSeconds:by(subset.map(x=>x.combined_energy),'observedPhysicalPeakSeconds'),
  baselinePublishedMaximumMissedInteriorPeak:subset.filter(x=>
   x.preserved_v2.omittedPhysicalPeakSeconds>0.01).length,
  combinedChangedClassification:subset.filter(x=>
   x.preserved_v2.classificationHash!==x.combined.classificationHash).length,
  energyChangedClassification:subset.filter(x=>
   x.combined.classificationHash!==x.combined_energy.classificationHash).length,
  combinedChangedWinner:subset.filter(x=>
   x.preserved_v2.winnerHash!==x.combined.winnerHash).length,
  energyChangedWinner:subset.filter(x=>
   x.combined.winnerHash!==x.combined_energy.winnerHash).length,
  medianCombinedPhase3GapGrowthSeconds:by(subset.map(x=>x.combined),'phase3GapGrowthSeconds'),
  medianEnergyPhase3GapGrowthSeconds:by(subset.map(x=>x.combined_energy),'phase3GapGrowthSeconds'),
  medianCombinedPhase4Energy:by(subset.map(x=>x.combined),'meanPhase4EnergyAtFinish'),
  medianEnergyPhase4Energy:by(subset.map(x=>x.combined_energy),'meanPhase4EnergyAtFinish'),
  anyWinnerChanged:subset.some(x=>x.preserved_v2.winnerHash!==x.combined.winnerHash),
 })}
 return {
  status:'PRIVATE_HISTORICAL_CALIBRATED_V4_PHYSICS_DIAGNOSTIC',
  source:'private_local_locked_historical_snapshots',
  calibratedV4PhysicalReruns:comparisons.length*2,
  historicalV2Reruns:comparisons.length,
  historicalSourceRevisionAttested:false,
  savedArchiveReplaySynchronizedAmongEvaluable:rejected.savedArchiveReplaySynchronized,
  savedArchiveReplayNotSynchronizedAmongEvaluable:rejected.savedArchiveReplayNotSynchronized,
  historicalV4RealismApproved:false,
  existingV2ProductionChanged:false,strictReplayRequired:true,officialWrites:0,
  rawStageDataPublished:false,privatePathsPublished:false,
  consideredCompleteTriples:comparisons.length,
  rejected,
  all:group(comparisons),
  terrain:['flat','hilly','mountain','cobbled'].map(terrain=>({terrain,
   ...group(comparisons.filter(x=>x.preserved_v2.terrain===terrain))})),
  warning:'Exact historical source revision is not recorded in the archive. Git commit time is not deployment proof. Classification parity and replay checks are required, but these comparisons remain diagnostic only.',
 }
}
export async function runPrivateHistoricalPhysicsV4(manifestRaw){
 const manifest=safeFile(manifestRaw,128*1024)
 const envelope=JSON.parse(readFileSync(manifest,'utf8'))
 if(!envelope||!Array.isArray(envelope.privateEnvelopePaths)||
    envelope.privateEnvelopePaths.length<1||envelope.privateEnvelopePaths.length>100||
    Object.keys(envelope).some(k=>k!=='privateEnvelopePaths'))
  throw Error('INVALID_MANIFEST')
 const paths=envelope.privateEnvelopePaths.map(x=>safeFile(x,64*1024*1024))
 if(new Set(paths).size!==paths.length)throw Error('DUPLICATE_PRIVATE_INPUT')
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-historical-physics-'))
 try{
  const results=[]
  for(const cfg of variants){
   const outfile=join(folder,cfg.key+'.mjs')
   let patched=0
   await build({
    absWorkingDir:root,entryPoints:['src/race-engine-v4/privateHistoricalPhysicalEntryV4.ts'],
    bundle:true,platform:'node',format:'esm',target:'node22',outfile,logLevel:'silent',
    define:{__V4_PRIVATE_PHYSICS_VARIANT__:JSON.stringify(cfg.key)},
    plugins:[{name:'v4-private-physical-src',setup(ctx){
     ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
      if(!cfg.patch)return null
      const contents=patchV4CalibratedPhysicalSource(readFileSync(args.path,'utf8'),cfg)
      patched++
      return {contents,loader:'ts'}
     })
    }}]
   })
   if(patched!==(cfg.patch?1:0))throw Error('CALIBRATED_ENGINE_SOURCE_NOT_LOADED')
   const run=spawnSync(process.execPath,[outfile,manifest],{
    cwd:root,encoding:'utf8',timeout:300000,maxBuffer:4*1024*1024,
    env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',TMPDIR:process.env.TMPDIR??''},
   })
   const printed=String(run.stdout??'').trim().split('\n').filter(line=>line.startsWith('V4_PRIVATE_PHYSICAL_VARIANT '))
   if(run.status!==0||printed.length!==1)throw Error('PRIVATE_PHYSICAL_ENGINE_FAILED')
   const report=JSON.parse(printed[0].slice('V4_PRIVATE_PHYSICAL_VARIANT '.length))
   if(report.variant!==cfg.key||report.officialWrites!==0||report.networkCalls!==0||
     report.researchOnly!==true||report.attempted!==paths.length||
     !Array.isArray(report.rows)||!report.failureClasses||
     Object.values(report.failureClasses).some(n=>!Number.isSafeInteger(n)||n<0)||
     report.rows.length+report.rejected.invalid+report.rejected.unsupported!==paths.length||
     !report.failureTerrains||!report.otherErrorTypes||!report.otherFailureReasons||
     Object.keys(report.failureTerrains).length!==HISTORICAL_TERRAINS.length||
     HISTORICAL_TERRAINS.some(t=>!report.failureTerrains[t]||
      ['invalid','unsupported','other'].some(k=>!Number.isSafeInteger(report.failureTerrains[t][k])||
      report.failureTerrains[t][k]<0))||
     Object.keys(report.otherErrorTypes).length!==HISTORICAL_ERROR_TYPES.length||
     HISTORICAL_ERROR_TYPES.some(t=>!Number.isSafeInteger(report.otherErrorTypes[t])||
      report.otherErrorTypes[t]<0)||
     Object.keys(report.otherFailureReasons).length!==HISTORICAL_FAILURE_REASONS.length||
     HISTORICAL_FAILURE_REASONS.some(t=>!Number.isSafeInteger(report.otherFailureReasons[t])||
      report.otherFailureReasons[t]<0))
    throw Error('UNTRUSTED_PRIVATE_PHYSICAL_EVIDENCE')
   results.push(report)
  }
  const maps=results.map(result=>new Map(result.rows.map(r=>[r.stageHash,r])))
  if(maps.some((m,i)=>m.size!==results[i].rows.length))
   throw Error('DUPLICATE_ANON_STAGE_REJECTED')
  const savedArchiveGapSummary={
   evaluableRows:results[0].rows.length,
   archivedPhysicalPeakRecorded:results[0].rows.filter(r=>
    typeof r.archivedObservedPhysicalPeakSeconds==='number').length,
   publishedSummaryUnderreportedObservedPeak:results[0].rows.filter(r=>
    r.archivedOmittedPhysicalPeakSeconds>0.01).length,
   largestArchivedPeakOmissionSeconds:results[0].rows.reduce((max,r)=>
    Math.max(max,r.archivedOmittedPhysicalPeakSeconds??0),0)
  }
  const byTerrain=Object.fromEntries(HISTORICAL_TERRAINS.map(t=>[t,{
   ...results[0].failureTerrains[t],historicMismatch:0,baselineReplayUnsynchronized:0,
   calibratedReplayUnsynchronized:0,eligible:0}]))
  const historicalMismatchKinds=Object.fromEntries(HISTORICAL_PARITY_REASONS.map(k=>[k,0]))
  const rejects={baselineInvalid:results[0].rejected.invalid,
   savedArchiveReplaySynchronized:results[0].rows.filter(r=>r.historicalReplaySynchronized===true).length,
   savedArchiveReplayNotSynchronized:results[0].rows.filter(r=>r.historicalReplaySynchronized!==true).length,
   baselineUnsupported:results[0].rejected.unsupported,
   baselineReplayUnsynchronized:0,baselineHistoricMismatch:0,
   calibratedReplayUnsynchronized:0,calibratedMissing:0,
   failedPhysicsByVariant:Object.fromEntries(results.map(r=>[r.variant,r.failureClasses])),
   otherErrorTypesByVariant:Object.fromEntries(results.map(r=>[r.variant,r.otherErrorTypes])),
   otherFailureReasonsByVariant:Object.fromEntries(results.map(r=>[r.variant,r.otherFailureReasons])),
   historicalMismatchKinds,byTerrain}
  const triples=[]
  for(const [id,v2] of maps[0]){
   if(!HISTORICAL_TERRAINS.includes(v2.terrain)||!Array.isArray(v2.savedV2ParityFailureKinds)||
      v2.savedV2ParityFailureKinds.some(k=>!HISTORICAL_PARITY_REASONS.includes(k)))
     throw Error('UNTRUSTED_PRIVATE_PHYSICAL_EVIDENCE')
   if(!v2.savedV2ClassificationParity){
    rejects.baselineHistoricMismatch++
    byTerrain[v2.terrain].historicMismatch++
    for(const k of new Set(v2.savedV2ParityFailureKinds))historicalMismatchKinds[k]++
    continue
   }
   if(!v2.replaySynchronized){
    rejects.baselineReplayUnsynchronized++
    byTerrain[v2.terrain].baselineReplayUnsynchronized++
    continue
   }
   const a=maps[1].get(id),b=maps[2].get(id)
   if(!a||!b){rejects.calibratedMissing++;continue}
   if(a.sourceHash!==v2.sourceHash||b.sourceHash!==v2.sourceHash||
      a.riderCount!==v2.riderCount||b.riderCount!==v2.riderCount||
      a.terrain!==v2.terrain||b.terrain!==v2.terrain)
    throw Error('PHYSICAL_HISTORIC_INPUT_MISMATCH')
   if(!a.replaySynchronized||!b.replaySynchronized){
    rejects.calibratedReplayUnsynchronized++
    byTerrain[v2.terrain].calibratedReplayUnsynchronized++
    continue
   }
   byTerrain[v2.terrain].eligible++
   triples.push({preserved_v2:v2,combined:a,combined_energy:b})
  }
  const agg=aggregate(triples,rejects)
  return {...agg,savedArchiveGapSummary}
 }finally{rmSync(folder,{recursive:true,force:true})}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const report=await runPrivateHistoricalPhysicsV4(process.argv[2])
  console.log('V4_PRIVATE_HISTORICAL_PHYSICS_REPORT '+JSON.stringify(report))
  if(report.consideredCompleteTriples===0)process.exitCode=1
 }catch{
  console.error('V4_PRIVATE_HISTORICAL_PHYSICS_REJECTED: private input or exact calibration did not validate')
  process.exitCode=1
 }
}
