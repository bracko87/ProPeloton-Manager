/**
 * V4-only RESEARCH candidate: replace stale B1 target with active F1/F2
 * in a temporary in-memory bundle, never touching the original V2 source.
 * The untouched strict replay validator still accepts or rejects each race.
 *
 * Default: run the validated 36-seed research test.
 * --build-probe <absolute output.mjs>: create a reusable V4-only research
 * probe bundle. This is NEVER the live race engine or production dispatcher.
 */
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import {patchV4FinishTransitionSource} from './finishTransitionResearchPatchV4.mjs'
import {patchV4MountainCarriedBridgeSource} from './mountainBridgeCarryResearchPatchV4.mjs'

const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-bridge-alias-'))
const file=join(folder,'v4-alias.mjs')
const buildProbe=process.argv[2]==='--build-probe'
if(buildProbe ? process.argv.length!==4 : process.argv.length!==2)
 throw Error('Usage: node scripts/v4/probeBridgeAliasV4.mjs [--build-probe /tmp/output.mjs]')
const output=buildProbe?resolve(process.argv[3]):file
if(buildProbe && (output===root||output.startsWith(root+sep)))
 throw Error('V4 research bundle must be outside the tracked repository')
// One exact Phase-3 pace sample in the temporary V4 research bundle.
// This attaches evidence to the measured gap sample without altering gap or speed.
const paceNeedle=[
 "    physicalGapTrajectory.push({",
 "      kmFromStart: deterministicRound(stepEndKm, 6),",
 "      gapSeconds: deterministicRound(physicalCurrentGapSeconds, 6),",
 "    })"
].join('\n')
const paceReplacement=[
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
].join('\n')
const needle="  const authoritativeBridgeGroups = phase4.bridgeGroups\n    .slice()\n    .sort("
const replacement=[
 "  const authoritativeBridgeGroups = reconcileV4ReplayBridgeMergeTargets(",
 "    phase4.bridgeGroups,",
 "    { openingBreakawayCarriesIntoPhase4,",
 "      activeFrontDisplayCode:openingFrontDisplayCode,",
 "      mergeToleranceSeconds:PHASE5_GROUP_MERGE_TOLERANCE_SECONDS }",
 "  )",
 "    .slice()",
 "    .sort("
].join('\n')
try{
 let patched=0
 await build({
  absWorkingDir:root,
  entryPoints:[buildProbe?
   'src/race-engine-v4/physicalResearchProbeV4.ts':
   'src/race-engine-v4/physicalResearchProbeV4.test.ts'],
  bundle:true,format:'esm',platform:'node',target:'node22',outfile:output,
  logLevel:'warning',
  plugins:[{name:'v4-synthetic-replay-alias',setup(ctx){
   ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
    const source=readFileSync(args.path,'utf8')
    if(source.split(needle).length!==2)
     throw Error('V2 replay source changed. Refuse fuzzy test patch.')
    if(source.split(paceNeedle).length!==2)
     throw Error('V2 Phase-3 source changed. Refuse fuzzy pace instrumentation.')
    patched++
    return {contents:
      "import { reconcileV4ReplayBridgeMergeTargets } from '../race-engine-v4/bridgeHandoffV4.ts'\n"+
      patchV4MountainCarriedBridgeSource(patchV4FinishTransitionSource(source.replace(needle,replacement).replace(paceNeedle,paceReplacement))),loader:'ts'}
   })
  }}]
 })
 if(patched!==1)throw Error('V4 isolated patch not applied exactly once')
 if(buildProbe){
  console.log('V4_RESEARCH_PROBE_BUILD '+JSON.stringify({
   status:'BUILT',output,ordinaryV4ProbeEntry:true,
   bridgeHandoffCorrectionBundled:true,phase3PaceSamplesInstrumented:true,
   originalV2SourceModified:false,
   officialRaceWrites:0,researchOnly:true
  }))
 }else{
  const run=spawnSync(process.execPath,[file],{
   cwd:root,encoding:'utf8',timeout:120000,maxBuffer:6*1024*1024
  })
  if(run.error)throw run.error
  const lines=String(run.stdout??'').split('\n')
  const line=lines.find(x=>x.startsWith('V4_SEVEN_SECOND_MULTI_SEED_REPORT '))
  if(run.status!==0||!line){
   console.error(String(run.stderr??'').slice(-1800))
   throw Error('Research V4 source normalization did not pass existing physical tests')
  }
  const diagnostic=JSON.parse(line.slice('V4_SEVEN_SECOND_MULTI_SEED_REPORT '.length))
  console.log(line)
  const chaseLine=lines.find(x=>x.startsWith('V4_EXPLICIT_CHASE_AB_REPORT '))
  if(!chaseLine)throw Error('V4 chase sensitivity report missing from corrected research bundle')
  const chase=JSON.parse(chaseLine.slice('V4_EXPLICIT_CHASE_AB_REPORT '.length))
  console.log('V4_CORRECTED_CHASE_AB_REPORT '+JSON.stringify({
   ...chase,solver:'v4_research_bridge_handoff_corrected',
   replayValidatorStillStrict:true,productionWrites:0
  }))
  const speedLine=lines.find(x=>x.startsWith('V4_PHASE3_SPEED_COMPARISON_REPORT '))
  if(!speedLine)throw Error('V4 Phase-3 physical pace comparison missing')
  const speed=JSON.parse(speedLine.slice('V4_PHASE3_SPEED_COMPARISON_REPORT '.length))
  if(speed.matchedInstrumentedBreakaways<=0)
   throw Error('V4 Phase-3 physical pace instrumentation did not produce samples')
  console.log('V4_CORRECTED_PHASE3_SPEED_REPORT '+JSON.stringify({
   ...speed,solver:'v4_research_in_memory_instrumented',
   originalV2SourceModified:false,strictValidatorStillEnabled:true,
   officialRaceWrites:0
  }))
  const valid=diagnostic.syntheticSeeds===36 &&
   diagnostic.v4Complete===36 && diagnostic.v4ReplayExceptions===0 &&
   diagnostic.v4WithEscape===18
  const status=valid?'CANDIDATE_PASSED':'UNRESOLVED'
  console.log('V4_BRIDGE_ALIAS_RESEARCH_REPORT '+JSON.stringify({
   status,syntheticSeeds:diagnostic.syntheticSeeds,
   replayExceptions:diagnostic.v4ReplayExceptions,
   completed:diagnostic.v4Complete,
   acceptedBreakawayCases:diagnostic.v4WithEscape,
   originalV2SourceModified:false,strictValidatorStillEnabled:true,
   officialRaceWrites:0,researchOnly:true
  }))
  if(!valid)process.exitCode=3
 }
}finally{
 rmSync(folder,{recursive:true,force:true})
}
