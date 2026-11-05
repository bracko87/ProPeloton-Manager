/**
 * Credential-free, PRIVATE research-only bridge:
 * trusted Supabase admin SELECT -> mode-0600 file outside repo ->
 * independently verified immutable sidecar checksum -> pure input adapter ->
 * isolated V4 physics worker. No database writes, publication or live V4.
 *
 * Sidecar snapshots are NOT certified original production lock snapshots.
 */
import {createHash} from 'node:crypto'
import {readFileSync,realpathSync,statSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join,resolve,dirname,relative,sep,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
import {tmpdir} from 'node:os'
import {compilePrivateV4ProductionInput} from './privateReadOnlyLockedCaptureV4.mjs'
import {runIsolatedV4Shadow} from './runIsolatedShadowV4.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const template=resolve(root,'scripts/v4/sql/v4_private_research_sidecar_export.sql')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const sha=v=>createHash('sha256').update(v,'utf8').digest('hex')
const ts=v=>{
 const d=Date.parse(String(v??''))
 if(!Number.isFinite(d))throw Error('V4_RESEARCH_BAD_TIMESTAMP')
 return d
}
function privateInputPath(v){
 if(typeof v!=='string'||!isAbsolute(v))throw Error('V4_RESEARCH_PRIVATE_FILE_REQUIRED')
 const path=realpathSync(v),repo=realpathSync(root),r=relative(repo,path),m=statSync(path)
 if(r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r))||
    !m.isFile()||m.size<10||m.size>16*1024*1024||
    (process.platform!=='win32'&&(m.mode&0o077)!==0))
  throw Error('V4_RESEARCH_PRIVATE_FILE_REJECTED')
 return path
}
export function buildV4PrivateSidecarSelect(stageId){
 if(!uuid.test(stageId??''))throw Error('V4_STAGE_ID_INVALID')
 const sql=readFileSync(template,'utf8')
 if(sql.split('__STAGE_ID_UUID__').length!==2||
    !sql.includes('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')||
    !sql.includes('source_payload::text')||
    !sql.includes('current_user=')||
    !sql.trimEnd().endsWith('ROLLBACK;'))
  throw Error('V4_PRIVATE_SQL_TEMPLATE_REJECTED')
 return sql.replace('__STAGE_ID_UUID__',stageId.toLowerCase())
}
export function verifyPrivateV4ResearchSource(capture){
 if(!obj(capture)||
    capture.contract!=='ppm.v4.private-sidecar-research-export.v1'||
    capture.status!=='V4_PRIVATE_RESEARCH_SIDECAR_EXPORTED'||
    capture.researchOnly!==true||capture.officialWrites!==0||
    capture.productionParityVerified!==false||
    capture.sourceKind!=='v4_research_capture_not_official_production_lock'||
    !uuid.test(capture.stageId??'')||!uuid.test(capture.raceId??'')||
    !/^[0-9a-f]{64}$/i.test(capture.sourceSha256??'')||
    typeof capture.sourcePayloadText!=='string'||
    Buffer.byteLength(capture.sourcePayloadText,'utf8')>15*1024*1024||
    sha(capture.sourcePayloadText)!==capture.sourceSha256)
  throw Error('V4_RESEARCH_SIDECAR_PROOF_REJECTED')
 const s=JSON.parse(capture.sourcePayloadText)
 if(!obj(s)||
    s.sourceKind!=='v4_research_capture_not_official_production_lock'||
    s.sourceVersion!=='v4_private_stage_source_v1'||
    s.researchOnly!==true||s.originalPlanStatusesPreserved!==true||
    !obj(s.race)||!obj(s.stage)||!obj(s.profile)||
    s.race.id!==capture.raceId||s.stage.id!==capture.stageId||
    s.stage.race_id!==capture.raceId||
    s.stage.stage_format!=='road_race'||
    !['flat','hilly','mountain','cobbled'].includes(s.stage.terrain_type)||
    !Array.isArray(s.stagePoints)||
    !Array.isArray(s.participantTeams)||s.participantTeams.length<2||
    !Array.isArray(s.participantRiders)||s.participantRiders.length<2||
    !Array.isArray(s.riderInputRows)||s.riderInputRows.length<2||
    !Array.isArray(s.phaseCommandRows)||
    s.phaseCommandRows.length!==s.riderInputRows.length||
    !Array.isArray(s.lockedPlanRows)||!obj(s.phase9Payload)||
    !Array.isArray(s.preStageLeaders)||!Array.isArray(s.preStageStandings)||
    capture.teamCount!==s.participantTeams.length||
    capture.riderCount!==s.participantRiders.length)
  throw Error('V4_RESEARCH_SIDECAR_SOURCE_REJECTED')
 const start=ts(capture.stageStartGameTs),cutoff=ts(capture.lockCutoffGameTs)
 const captured=ts(capture.capturedGameTs)
 if(start-cutoff!==10800000||captured<cutoff||
    captured>cutoff+15*60000||captured>=start)
  throw Error('V4_RESEARCH_SIDECAR_LOCK_TIMING_REJECTED')
 const d=String(s.stage.stage_date??'').slice(0,10)
 const hour=Number(s.stage.planned_start_hour_number)
 const minute=Number(s.stage.planned_start_minute??0)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||
    !Number.isInteger(hour)||hour<0||hour>23||
    !Number.isInteger(minute)||minute<0||minute>59||
    Date.parse(d+'T'+String(hour).padStart(2,'0')+':'+
      String(minute).padStart(2,'0')+':00Z')!==start)
  throw Error('V4_RESEARCH_SIDECAR_STAGE_START_REJECTED')
 const unique=(a,k)=>a.every(x=>obj(x)&&typeof x[k]==='string'&&x[k])&&
    new Set(a.map(x=>x[k])).size===a.length
 if(!unique(s.participantTeams,'race_team_entry_id')||
    !unique(s.participantTeams,'participating_club_id')||
    !unique(s.participantRiders,'rider_id')||
    !unique(s.riderInputRows,'rider_id')||
    !unique(s.phaseCommandRows,'rider_id'))
  throw Error('V4_RESEARCH_SIDECAR_DUPLICATE_OWNER')
 const riders=new Set(s.participantRiders.map(x=>x.rider_id))
 if(s.riderInputRows.length!==riders.size||
    s.phaseCommandRows.length!==riders.size||
    s.riderInputRows.some(x=>!riders.has(x.rider_id))||
    s.phaseCommandRows.some(x=>!riders.has(x.rider_id)))
  throw Error('V4_RESEARCH_SIDECAR_RIDER_SET_MISMATCH')
 // Snapshot exactly as saved. The production records are not overwritten.
 return {sources:s,stageId:capture.stageId,raceId:capture.raceId,
  start:new Date(start).toISOString(),cutoff:new Date(cutoff).toISOString(),
  captured:new Date(captured).toISOString(),
  sourceHash:capture.sourceSha256}
}
function controlRows(proof,input){
 const entries=new Map(proof.sources.participantTeams.map(x=>[x.race_team_entry_id,x]))
 const teams=new Set()
 const out=[]
 for(const team of input.teams){
  const entry=entries.get(team.raceTeamEntryId)
  if(!entry||teams.has(team.teamId)||
     entry.participating_club_id!==team.participatingClubId)
   throw Error('V4_RESEARCH_TEAM_OWNERSHIP_MISMATCH')
  teams.add(team.teamId)
  const ai=entry.is_ai_filler===true||
    ['ai','ai_fill','ai_filler'].includes(String(entry.entry_source??'').toLowerCase())
  const marker=team.snapshot?.metadata?.scenarioAiControlled
  if(typeof marker==='boolean'&&marker!==ai)
   throw Error('V4_RESEARCH_AI_OWNERSHIP_CONFLICT')
  if(!ai&&!proof.sources.lockedPlanRows.some(p=>
      p.team_id===team.teamId&&['submitted','locked'].includes(p.status)))
   throw Error('V4_RESEARCH_HUMAN_PLAN_UNSAVED')
  out.push({teamId:team.teamId,kind:ai?'ai':'human'})
 }
 const plans=new Set(input.stagePlans.map(p=>p.teamId))
 if(out.length!==entries.size||out.length<2||
    plans.size!==out.length||out.some(x=>!plans.has(x.teamId)))
  throw Error('V4_RESEARCH_PLAN_TEAM_SET_MISMATCH')
 return out
}
/** Offline only, with safe categorical results; no original race data exported. */
export async function replayPrivateV4ResearchSidecar(capture,{
 inputBuilder=compilePrivateV4ProductionInput,shadowRunner=runIsolatedV4Shadow
}={}){
 const proof=verifyPrivateV4ResearchSource(capture)
 const input=await inputBuilder({...proof.sources,
  deterministicSeed:'v4:private-research-sidecar:'+
    proof.raceId+':'+proof.stageId+':'+proof.sourceHash})
 if(!obj(input)||input.race?.raceId!==proof.raceId||
    input.stage?.stageId!==proof.stageId||
    input.stage.stageFormat!=='road_race'||
    input.stage.terrainType!==proof.sources.stage.terrain_type)
  throw Error('V4_RESEARCH_BUILD_IDENTITY_INVALID')
 const control=controlRows(proof,input)
 const envelope={input,options:{
   lock:{
    stageId:proof.stageId,snapshotId:proof.sourceHash,
    snapshotStatus:'locked',stageStartGameTs:proof.start,
    lockCutoffGameTs:proof.cutoff,snapshotGameTs:proof.captured
   },
   teamControl:control,gameDate:proof.start.slice(0,10)
 }}
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-sidecar-private-'))
 const file=join(folder,'research-envelope.json')
 try{
  writeFileSync(file,JSON.stringify(envelope),{mode:0o600,flag:'wx'})
  const shadow=await shadowRunner(file)
  if(!obj(shadow)||shadow.officialWrites!==0||
     shadow.productionEnabled!==false||typeof shadow.status!=='string')
   throw Error('V4_RESEARCH_SHADOW_OUTPUT_UNTRUSTED')
  return {
   contract:'ppm.v4.private-sidecar-replay.v1',
   status:'V4_RESEARCH_SIDECAR_SHADOW_COMPLETED',
   shadowStatus:shadow.status,
   replayQuality:shadow.replayQuality,
   strictReplayPassed:shadow.status==='SHADOW_STRICT_REPLAY_PASS'&&
    shadow.replayQuality==='full',
   realSourceUsed:true,immutableResearchSnapshotVerified:true,
   originalProductionLockVerified:false,
   productionParityVerified:false,productionEnabled:false,
   officialWrites:0,researchOnly:true,
   aiTeams:control.filter(x=>x.kind==='ai').length,
   humanTeams:control.filter(x=>x.kind==='human').length
  }
 }finally{
  rmSync(folder,{recursive:true,force:true})
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length===4&&process.argv[2]==='--sql'){
   process.stdout.write(buildV4PrivateSidecarSelect(process.argv[3]))
  }else if(process.argv.length===4&&process.argv[2]==='--run'){
   const json=readFileSync(privateInputPath(process.argv[3]),'utf8')
   const capture=JSON.parse(json)
   const res=await replayPrivateV4ResearchSidecar(capture)
   console.log('V4_PRIVATE_SIDECAR_REPLAY '+JSON.stringify(res))
   if(!res.strictReplayPassed)process.exitCode=1
  }else throw Error('V4_RESEARCH_CLI_USAGE_REJECTED')
 }catch{
  console.error('V4_PRIVATE_SIDECAR_REPLAY_REJECTED')
  process.exitCode=1
 }
}
