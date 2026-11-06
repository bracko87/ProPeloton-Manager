/**
 * Local comparison process. No SQL, credentials, HTTP or production writer.
 * Receives verified private envelope and official source from the caller;
 * compiles the same calibrated V4 physical transform as the passing replay.
 */
import {build} from 'esbuild'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {patchV4CalibratedPhysicalSource} from './calibratedPhysicalTransformV4.mjs'
import {isValidV4PhysicalPatch} from './runIsolatedShadowV4.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const engine=resolve(root,'src/universal-race-engine/runRaceEngine.ts')
const worker=resolve(root,'src/race-engine-v4/privateRealVsOfficialWorkerV4.ts')
const validString=(v)=>typeof v==='string'&&v.length>0
export async function runPrivateRealVsOfficialV4(envelope,{compile=build,execute=spawnSync}={}){
 const {input,options,reference}=envelope??{}
 if(!validString(input?.stage?.stageId)||
    input.stage.stageId!==options?.lock?.stageId||
    input.stage.stageId!==reference?.stageId||
    input.race?.raceId!==reference?.raceId||
    !Array.isArray(reference?.officialRows)||reference.officialRows.length!==108||
    !Array.isArray(reference?.savedClassification)||reference.savedClassification.length!==108||
    !Array.isArray(reference?.savedEnergyRows)||reference.savedEnergyRows.length!==108)
   throw Error('V4_PRIVATE_COMPARISON_INPUT_REJECTED')
 const payload=JSON.stringify({input,options,reference})
 if(Buffer.byteLength(payload,'utf8')>18*1024*1024)
  throw Error('V4_PRIVATE_COMPARISON_SIZE_REJECTED')
 const original=readFileSync(engine,'utf8')
 const patch=patchV4CalibratedPhysicalSource(original,{
  peloton:true,cooperation:true,energy:true
 })
 if(!isValidV4PhysicalPatch(original,patch))throw Error('V4_PHYSICAL_SOURCE_REJECTED')
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-official-compare-'))
 try{
  const output=join(folder,'v4-official-compare.mjs')
  let sourceLoads=0
  await compile({
   entryPoints:[worker],outfile:output,bundle:true,
   platform:'node',format:'esm',target:'node20',logLevel:'silent',
   plugins:[{name:'v4-physical-only-comparison',setup(api){
    api.onLoad({filter:/[\\/]src[\\/]universal-race-engine[\\/]runRaceEngine\.ts$/},args=>{
     if(resolve(args.path)!==engine||++sourceLoads!==1)
      throw Error('V4_COMPARISON_ENGINE_DRIFT')
     return {contents:patch,loader:'ts',resolveDir:dirname(engine)}
    })
   }}]
  })
  if(sourceLoads!==1)throw Error('V4_COMPARISON_SOURCE_NOT_PATCHED')
  const child=execute(process.execPath,[output],{
   cwd:root,encoding:'utf8',timeout:180000,maxBuffer:512*1024,
   input:payload,env:{PATH:process.env.PATH??'',
    HOME:process.env.HOME??'',TEMP:process.env.TEMP??'',
    TMP:process.env.TMP??'',TMPDIR:process.env.TMPDIR??'',
    SYSTEMROOT:process.env.SYSTEMROOT??''}
  })
  const prefix='V4_COMPARISON_REPORT '
  const lines=String(child.stdout??'').trim().split(/\r?\n/)
  if(child.error||child.status!==0||lines.length!==1||
     child.stderr||!lines[0].startsWith(prefix))
   throw Error('V4_COMPARISON_WORKER_REJECTED')
  const out=JSON.parse(lines[0].slice(prefix.length))
  if(out?.contract!=='ppm.v4.private-official-outcome-comparison.v1'||
     out.status!=='V4_HISTORICAL_OUTCOMES_COMPARED'||
     out.stageMatched!==true||out.officialArchivedResultVerified!==true||
     out.researchOnly!==true||out.officialWrites!==0||
     out.productionEnabled!==false||out.productionParityVerified!==false||
     out.ridersCompared!==108||out.originalEngine!=='race_engine_ts_v1'||
     !out.official||!out.v4||!out.differences)
   throw Error('V4_COMPARISON_REPORT_REJECTED')
  // Do not forward any worker output except the independently checked
  // aggregate contract. All raw data is kept out of logs and stdout.
  return out
 }finally{rmSync(folder,{recursive:true,force:true})}
}
