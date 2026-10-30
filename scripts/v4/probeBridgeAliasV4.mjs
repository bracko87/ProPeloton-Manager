/**
 * V4-only RESEARCH candidate: replace stale B1 target with active F1/F2
 * in a temporary in-memory bundle, never touching the original V2 source.
 * The untouched strict replay validator still accepts or rejects each race.
 */
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'

const root=resolve(import.meta.dirname,'../..')
const folder=mkdtempSync(join(tmpdir(),'ppm-v4-bridge-alias-'))
const file=join(folder,'v4-alias.mjs')
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
  entryPoints:['src/race-engine-v4/physicalResearchProbeV4.test.ts'],
  bundle:true,format:'esm',platform:'node',target:'node22',outfile:file,
  logLevel:'warning',
  plugins:[{name:'v4-synthetic-replay-alias',setup(ctx){
   ctx.onLoad({filter:/[\\/]runRaceEngine\.ts$/},args=>{
    const source=readFileSync(args.path,'utf8')
    if(source.split(needle).length!==2)
     throw Error('V2 replay source changed. Refuse fuzzy test patch.')
    patched++
    return {contents:
      "import { reconcileV4ReplayBridgeMergeTargets } from '../race-engine-v4/bridgeHandoffV4.ts'\n"+
      source.replace(needle,replacement),loader:'ts'}
   })
  }}]
 })
 if(patched!==1)throw Error('V4 isolated patch not applied exactly once')
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
 const status=diagnostic.v4ReplayExceptions===0?'CANDIDATE_PASSED':'UNRESOLVED'
 console.log('V4_BRIDGE_ALIAS_RESEARCH_REPORT '+JSON.stringify({
  status,syntheticSeeds:diagnostic.syntheticSeeds,
  replayExceptions:diagnostic.v4ReplayExceptions,
  completed:diagnostic.v4Complete,
  originalV2SourceModified:false,strictValidatorStillEnabled:true,
  officialRaceWrites:0,researchOnly:true
 }))
 if(status!=='CANDIDATE_PASSED')process.exitCode=3
}finally{
 rmSync(folder,{recursive:true,force:true})
}
