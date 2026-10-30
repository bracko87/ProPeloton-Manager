/**
 * PRIVATE LOCAL, SELECT-ONLY historical candidate discovery and physics pilot.
 * No production calculations, user-data uploads, GitHub credentials or writes.
 */
import {createClient} from '@supabase/supabase-js'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join,dirname,basename,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
import {exportPrivateHistoricalStage} from './privateHistoricalExportV4.mjs'
import {runPrivateHistoricalPhysicsV4} from './privateHistoricalPhysicsV4.mjs'
import {selectV4HistoricalPilotCandidates,TERRAIN_TARGETS} from './privateHistoricalPilotSelectionV4.mjs'
const origin='https://okuravitxocyevkexfgi.supabase.co'
const terrains=Object.keys(TERRAIN_TARGETS)
function connect(url,key,factory){
 if(!url||!key)throw Error('Local read-authorized credential required')
 const parsed=new URL(url)
 if(parsed.origin!==origin||parsed.pathname!=='/'||parsed.search||parsed.hash||
    parsed.username||parsed.password)throw Error('Unauthorized project origin')
 return factory(url,key,{auth:{autoRefreshToken:false,
  persistSession:false,detectSessionInUrl:false}})
}
export async function runPrivateHistoricalPilotV4({
 url,key,clientFactory=createClient,exportStage=exportPrivateHistoricalStage,
 metadataReader=null,physicalRunner=runPrivateHistoricalPhysicsV4,progress=null,targets=TERRAIN_TARGETS,
 metadataLimit=250,maxProbesPerTerrain=18
}={}){
 if(!Number.isSafeInteger(metadataLimit)||metadataLimit<1||metadataLimit>350||
 !Number.isSafeInteger(maxProbesPerTerrain)||maxProbesPerTerrain<1||maxProbesPerTerrain>24||
 !targets||Object.keys(targets).some(t=>!terrains.includes(t))||
 terrains.some(t=>!Number.isSafeInteger(targets[t])||targets[t]<0||targets[t]>12))
  throw Error('Unsafe private pilot limits')
 const db=metadataReader===null?connect(url,key,clientFactory):null
 const response=metadataReader===null?await db.from('race_stage_simulation_runs')
  .select('stage_id,completed_at,terrain:input_snapshot_json->stage->>terrainType,stage_format:input_snapshot_json->stage->>stageFormat')
  .eq('status','completed').order('completed_at',{ascending:false}).limit(metadataLimit):
  {data:await metadataReader(metadataLimit),error:null}
 if(response.error||!Array.isArray(response.data))throw Error('Metadata SELECT denied')
 const selection=selectV4HistoricalPilotCandidates(response.data,{maxPerTerrain:maxProbesPerTerrain})
 if(progress)progress({phase:'METADATA_READY',metadataRows:selection.metadataRows,potential:selection.potential})
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-historical-pilot-'))
 const created=[],files=[]
 const attempted=Object.fromEntries(terrains.map(t=>[t,0]))
 const accepted=Object.fromEntries(terrains.map(t=>[t,0]))
 const rejected=Object.fromEntries(terrains.map(t=>[t,0]))
 try{
  for(let i=0;i<maxProbesPerTerrain;i++)for(const terrain of terrains){
   if(accepted[terrain]>=targets[terrain])continue
   const id=selection.groups[terrain][i]
   if(!id)continue
   attempted[terrain]++
   try{
    const out=await exportStage({stageId:id,url,key,clientFactory:()=>db})
    if(typeof out?.privatePath==='string'){
     const f=dirname(out.privatePath)
     if(dirname(f)===tmpdir()&&basename(f).startsWith('ppm-v4-private-history-'))
      created.push(f)
    }
    if(typeof out?.privatePath!=='string'||!Number.isSafeInteger(out.riders)||
     out.riders<2||!Number.isSafeInteger(out.teams)||out.teams<2||
     out.teams>40||out.teams>out.riders)
     throw Error('Unsafe original team structure')
    files.push(out.privatePath);accepted[terrain]++
   }catch{rejected[terrain]++}
  }
  if(progress)progress({phase:'EXPORTS_READY',attempted,accepted,rejected})
  if(files.length===0)return {status:'PRIVATE_HISTORICAL_PILOT_NO_ELIGIBLE_EXPORTS',
   metadataRows:selection.metadataRows,potential:selection.potential,
   attempted,accepted,rejected,officialWrites:0,historicalV4RealismApproved:false}
  const manifest=join(folder,'private-manifest.json')
  writeFileSync(manifest,JSON.stringify({privateEnvelopePaths:files}),
   {encoding:'utf8',mode:0o600,flag:'wx'})
  if(progress)progress({phase:'PHYSICS_START',exports:files.length})
  const report=await physicalRunner(manifest)
  if(!report||report.officialWrites!==0||report.rawStageDataPublished!==false||
    report.privatePathsPublished!==false)throw Error('Unsafe physics report')
  return {...report,status:'PRIVATE_HISTORICAL_PILOT_DIAGNOSTIC_ONLY',
   metadataRows:selection.metadataRows,potential:selection.potential,
   attempted,accepted,rejected,historicalV4RealismApproved:false}
 }finally{
  rmSync(folder,{recursive:true,force:true})
  for(const f of created)rmSync(f,{recursive:true,force:true})
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length!==2)throw Error('No command-line input accepted')
  const result=await runPrivateHistoricalPilotV4({
   url:process.env.PPM_V4_RESEARCH_URL,key:process.env.PPM_V4_RESEARCH_READ_KEY})
  process.stdout.write('V4_PRIVATE_AUTO_HISTORICAL_PILOT '+JSON.stringify(result)+'\n')
  if(!result.consideredCompleteTriples)process.exitCode=1
 }catch{
  console.error('V4_PRIVATE_AUTO_HISTORICAL_PILOT_REJECTED: read-only pilot not completed')
  process.exitCode=1
 }
}
