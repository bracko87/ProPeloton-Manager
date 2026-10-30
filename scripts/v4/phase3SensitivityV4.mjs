/**
 * V4 RESEARCH ONLY — Phase-3 physical pace sensitivity matrix.
 * Executes the original strict replay physics in temporary esbuild bundles.
 * All V2 source files on disk remain bit-identical; never calls Supabase,
 * dispatches an official race, edits game data, or publishes results.
 */
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'

const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-phase3-sensitivity-'))
const needle=(lines)=>lines.join('\n')
const bridgeNeedle="  const authoritativeBridgeGroups = phase4.bridgeGroups\n    .slice()\n    .sort("
const bridgeReplacement=needle([
 "  const authoritativeBridgeGroups = reconcileV4ReplayBridgeMergeTargets(",
 "    phase4.bridgeGroups,",
 "    { openingBreakawayCarriesIntoPhase4,",
 "      activeFrontDisplayCode:openingFrontDisplayCode,",
 "      mergeToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS }",
 "  )",
 "    .slice()",
 "    .sort("
])
const paceNeedle=needle([
 "    physicalGapTrajectory.push({",
 "      kmFromStart: deterministicRound(stepEndKm, 6),",
 "      gapSeconds: deterministicRound(physicalCurrentGapSeconds, 6),",
 "    })"
])
const paceReplacement=needle([
 "    physicalGapTrajectory.push({",
 "      kmFromStart: deterministicRound(stepEndKm, 6),",
 "      gapSeconds: deterministicRound(physicalCurrentGapSeconds, 6),",
 "      v4ResearchPace: {",
 "        pelotonPaceKmh, escapePaceKmh,",
 "        selectedResponseMultiplier:response.selectedResponseMultiplier,",
 "        chaseAssets:phase3FiniteChaseAssets,",
 "        chasingTeamCount:physicalChasingTeamIds.length,",
 "        explicitChasingTeamCount:explicitPhase3ChasingTeamIds.length,",
 "        automaticChasingTeamCount:phase3AutomaticFinishInterestTeamIds.length,",
 "        gcThreatChasingTeamCount:phase3GcThreatTeamIds.length,",
 "        cooperationMultiplier:phase3DynamicCooperationMultiplier,",
 "        chaseInterestScore:response.chaseInterestScore,",
 "        chaseCapacityScore:response.chaseCapacityScore,",
 "        responseMode:response.responseMode",
 "      }",
 "    })"
])
const pelotonNeedle=needle([
 "        response.selectedResponseMultiplier *",
 "        // No organized chase: ordinary peloton tempo is not an active pursuit."
])
const pelotonReplacement=needle([
 "        (physicalChasingTeamIds.length>0",
 "          ? Math.max(response.selectedResponseMultiplier,1.015)",
 "          : response.selectedResponseMultiplier) *",
 "        // No organized chase: ordinary peloton tempo is not an active pursuit."
])
const cooperationNeedle="        : phase3DynamicCooperationMultiplier)"
const cooperationReplacement="        : 1 + (phase3DynamicCooperationMultiplier - 1) * 0.5)"
const configs=[
 {key:'baseline',peloton:false,cooperation:false},
 {key:'peloton_response',peloton:true,cooperation:false},
 {key:'breakaway_cooperation',peloton:false,cooperation:true},
 {key:'combined',peloton:true,cooperation:true}
]
const exact=(source,from,to)=>{
 if(source.split(from).length!==2)throw Error('V2 research anchor changed or ambiguous: '+from.slice(0,110))
 return source.replace(from,to)
}
const median=(values)=>{
 if(values.length===0)return null
 const arr=[...values].sort((a,b)=>a-b)
 return Number(arr[Math.floor(arr.length/2)].toFixed(6))
}
const field=(cases,key)=>median(cases.map(x=>x[key]).filter(x=>typeof x==='number'&&Number.isFinite(x)))
const paced=(cases,key)=>median(cases.map(x=>x.pace?.[key]).filter(x=>typeof x==='number'&&Number.isFinite(x)))
const results=[]
try{
 for(const config of configs){
  let transformed=0
  const out=join(folder,config.key+'.mjs')
  await build({
   absWorkingDir:root,
   entryPoints:['src/race-engine-v4/physicalResearchProbeV4.test.ts'],
   bundle:true,platform:'node',format:'esm',target:'node22',outfile:out,
   logLevel:'warning',
   plugins:[{name:'v4-only-phase3-physical-sensitivity',setup(ctx){
    ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
     let source=readFileSync(args.path,'utf8')
     source=exact(source,bridgeNeedle,bridgeReplacement)
     source=exact(source,paceNeedle,paceReplacement)
     // Before applying either candidate, verify both knobs remain unique.
     if(source.split(pelotonNeedle).length!==2||
        source.split(cooperationNeedle).length!==2)
      throw Error('Phase-3 physical source changed; refuse fuzzy calibration')
     if(config.peloton)source=exact(source,pelotonNeedle,pelotonReplacement)
     if(config.cooperation)source=exact(source,cooperationNeedle,cooperationReplacement)
     transformed++
     return {
      contents:"import { reconcileV4ReplayBridgeMergeTargets } from '../race-engine-v4/bridgeHandoffV4.ts'\n"+source,
      loader:'ts'
     }
    })
   }}]
  })
  if(transformed!==1)throw Error(config.key+': in-memory V2 source transform not applied once')
  const run=spawnSync(process.execPath,[out],{
   cwd:root,encoding:'utf8',
   env:{...process.env,V4_PHASE3_SENSITIVITY:'1'},
   timeout:240000,maxBuffer:20*1024*1024
  })
  if(run.error)throw run.error
  const lines=String(run.stdout??'').split('\n')
  const get=(prefix)=>{
   const found=lines.find(x=>x.startsWith(prefix+' '))
   return found?JSON.parse(found.slice(prefix.length+1)):null
  }
  const diag=get('V4_SEVEN_SECOND_MULTI_SEED_REPORT')
  const seeds=get('V4_PHASE3_SENSITIVITY_SEEDS')
  if(run.status!==0||!diag||!seeds||seeds.cases.length!==36){
   console.error(String(run.stderr??'').slice(-1800))
   throw Error(config.key+': strict replay suite, diagnostic extraction or seed count failed')
  }
  if(!seeds.researchOnly||seeds.officialRaceWrites!==0)
   throw Error('V4 experiment lost its read-only invariant')
  const cases=seeds.cases
  if(cases.some(x=>x.completed&&x.officialWrites!==0))
   throw Error('Official race writes were reported')
  results.push({key:config.key,config,diag,cases})
  console.log('V4_PHASE3_CANDIDATE_RUN '+JSON.stringify({
   candidate:config.key,
   smallFieldCompleted:diag.v4Complete,
   smallFieldReplayExceptions:diag.v4ReplayExceptions,
   smallFieldAcceptedEscapes:diag.v4WithEscape,
   largerFieldComplete:cases.filter(x=>x.completed).length,
   largerFieldAcceptedEscape:cases.filter(x=>x.completed&&x.acceptedBreakaway>0).length,
   largerFieldReplayExceptions:cases.filter(x=>!x.completed).length,
   originalV2SourceModified:false,officialWrites:0
  }))
 }
 const common=Array.from({length:36},(_,i)=>i).filter(seed=>
  results.every(r=>{
   const x=r.cases[seed]
   return x?.completed&&x?.replaySynchronized&&x?.acceptedBreakaway>0&&x?.pace?.instrumented
  }))
 if(common.length===0)throw Error('No valid matched escape races across all Phase-3 variants')
 for(const seed of common){
  const hashes=results.map(r=>r.cases[seed].sourceSnapshotHash)
  if(hashes.some(x=>!x)||new Set(hashes).size!==1)
   throw Error('Calibrations changed the locked input snapshot for seed '+seed)
 }
 const comparable=results.map(r=>{
  const cases=common.map(seed=>r.cases[seed])
  return {
   candidate:r.key,
   medianPhase3GapGrowthSeconds:field(cases,'phase3GrowthSeconds'),
   medianMaxGapSeconds:field(cases,'maximumGapSeconds'),
   medianPelotonKmh:paced(cases,'medianPelotonPaceKmh'),
   medianEscapeKmh:paced(cases,'medianEscapePaceKmh'),
   medianEscapeSpeedAdvantageKmh:paced(cases,'medianSpeedAdvantageToEscapeKmh'),
   medianPhase3ChaseResponse:paced(cases,'medianSelectedResponseMultiplier'),
   medianPhase3ChaseAssets:paced(cases,'medianChaseAssets'),
   medianBreakawayCooperation:paced(cases,'medianCooperationMultiplier'),
   medianFrontEnergySpent:field(cases,'phase3FrontEnergySpent'),
   medianPhase3GapGrowingKm:paced(cases,'gapGrowingKm'),
   completedSmallField:r.diag.v4Complete,
   replayExceptionsSmallField:r.diag.v4ReplayExceptions
  }
 })
 const baseline=results[0]
 const paired=results.slice(1).map(r=>({
  candidate:r.key,
  gapReductionCases:common.filter(seed=>
   baseline.cases[seed].phase3GrowthSeconds>r.cases[seed].phase3GrowthSeconds+0.000001).length,
  gapIncreaseCases:common.filter(seed=>
   baseline.cases[seed].phase3GrowthSeconds<r.cases[seed].phase3GrowthSeconds-0.000001).length,
  medianPairedPhase3GapReductionSeconds:median(common.map(seed=>
   baseline.cases[seed].phase3GrowthSeconds-r.cases[seed].phase3GrowthSeconds)),
  medianPairedMaxGapReductionSeconds:median(common.map(seed=>
   baseline.cases[seed].maximumGapSeconds-r.cases[seed].maximumGapSeconds))
 }))
 const strictCandidates=results.map(r=>({
  candidate:r.key,
  smallFieldPassed:r.diag.v4Complete===36&&r.diag.v4ReplayExceptions===0,
  largerFieldReplayFailures:r.cases.filter(x=>!x.completed).length
 }))
 const report={
  status:'DIAGNOSTIC_ONLY_NO_REALISM_APPROVAL',
  seeds:36,matchedValidAcceptedEscapes:common.length,
  scenarios:configs.map(x=>x.key),
  measured:comparable,pairedVsBaseline:paired,
  strictReplay:strictCandidates,
  pelotonCandidate:'Phase-3 organized pursuit minimum response 1.015',
  cooperationCandidate:'Phase-3 dynamic cooperation contribution reduced by 50% only on full-cooperation branch',
  changedPhysicsInMemory:true,originalV2SourceModified:false,
  officialRaceWrites:0,syntheticOnly:true,strictValidatorStillEnabled:true
 }
 console.log('V4_PHASE3_CALIBRATION_MATRIX '+JSON.stringify(report))
 if(!strictCandidates[0].smallFieldPassed)throw Error('Corrected baseline strict replay unexpectedly regressed')
}finally{
 rmSync(folder,{recursive:true,force:true})
}
