/**
 * Credential-free admin-mediated real-data V4 research capture.
 *
 * An administrator executes the generated SQL in Supabase using an existing
 * trusted connection; it starts READ ONLY, switches to a NOLOGIN reader,
 * SELECTs pre-verified sources, and ROLLBACKs. This program itself has NO
 * database, network or production write access. Eligible private output is
 * kept outside the repo and passed only to the isolated V4 shadow runner.
 *
 * Research snapshots reconstructed in the lock window are NOT confirmed
 * immutable production inputs and NEVER approve a production V4 rollout.
 */
import {readFileSync,realpathSync,statSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {dirname,resolve,relative,isAbsolute,join,sep} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import {compilePrivateV4ProductionInput} from './privateReadOnlyLockedCaptureV4.mjs'
import {
 auditV4RealLockedStageEvidence,prepareV4RealLockedShadowEnvelope
} from './realLockedStageEvidenceV4.mjs'
import {runIsolatedV4Shadow} from './runIsolatedShadowV4.mjs'

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const template=resolve(repo,'scripts/v4/adminReadOnlyStageCaptureV4.sql')
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const contract='ppm.v4.admin-readonly-sql-export.v1'
function iso(x){
 const d=new Date(x)
 if(!Number.isFinite(d.getTime()))throw Error('V4_INVALID_CAPTURE_TIME')
 return d.toISOString()
}
const report=status=>({
 contract:'ppm.v4.admin-readonly-shadow.v1',
 status,researchOnly:true,officialWrites:0,productionEnabled:false,
 immutableProductionSourceVerified:false,
 productionParityVerified:false,realShadowExecuted:false,
 strictReplayPassed:false
})
function reject(code='V4_ADMIN_SOURCE_NOT_ELIGIBLE'){
 return report(code)
}
/** The generated statement is intentionally fixed: no arbitrary SQL. */
export function buildV4AdminReadOnlySql(stageId){
 if(!uid.test(String(stageId??'')))throw Error('V4_STAGE_ID_INVALID')
 const raw=readFileSync(template,'utf8')
 if(raw.split('__STAGE_ID_UUID__').length!==2)
  throw Error('V4_SQL_TEMPLATE_UNVERIFIED')
 const sql=raw.replace('__STAGE_ID_UUID__',String(stageId).toLowerCase())
 if(!sql.includes('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;')||
    !sql.includes('SET LOCAL ROLE v4_live_shadow_read_login;')||
    !sql.trimEnd().endsWith('ROLLBACK;'))
  throw Error('V4_SQL_TEMPLATE_UNVERIFIED')
 return sql
}
/** Missing-eligibility output NEVER contains a full private rider bundle. */
export function classifyV4AdminExport(capture){
 if(!isObj(capture)||capture.contract!==contract||
    capture.reader!=='v4_live_shadow_read_login'||
    capture.transaction_read_only!=='on')
  return reject('V4_ADMIN_EXPORT_REJECTED')
 if(capture.status==='V4_LOCKED_RESEARCH_SOURCE_NOT_ELIGIBLE'&&
    capture.bundle===null)
  return reject('V4_NO_VERIFIED_LOCKED_SOURCE')
 if(capture.status!=='V4_LOCKED_RESEARCH_SOURCE_EXPORTED'||
    !isObj(capture.bundle))
  return reject('V4_ADMIN_EXPORT_REJECTED')
 return report('V4_EXPORT_REQUIRES_PRIVATE_VALIDATION')
}
function privatePath(path){
 if(typeof path!=='string'||!isAbsolute(path))throw Error('V4_PRIVATE_PATH_REQUIRED')
 const real=realpathSync(path),root=realpathSync(repo)
 const rel=relative(root,real),st=statSync(real)
 if(rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))||
    !st.isFile()||st.size<10||st.size>16*1024*1024||
    (process.platform!=='win32'&&(st.mode&0o077)!==0))
  throw Error('V4_PRIVATE_PATH_REJECTED')
 return real
}
function verifiedSource(capture){
 const gate=classifyV4AdminExport(capture)
 if(gate.status!=='V4_EXPORT_REQUIRES_PRIVATE_VALIDATION')
  throw Error('V4_CAPTURE_NOT_ELIGIBLE')
 const x=capture.bundle,s=x.sources
 if(x.sourceKind!=='read_only_lock_window_capture'||
    x.activeRole!=='v4_live_shadow_read_login'||
    x.authenticatedRole!=='postgres'||x.transactionReadOnly!=='on'||
    !isObj(s)||!isObj(s.stage)||!isObj(s.race)||
    !uid.test(s.stage.id)||!uid.test(s.race.id)||
    s.stage.race_id!==s.race.id||
    s.stage.stage_format!=='road_race'||
    !['flat','hilly','mountain','cobbled'].includes(s.stage.terrain_type)||
    !Array.isArray(s.lockedPlanRows)||!s.lockedPlanRows.length||
    !Array.isArray(s.participantTeams)||s.participantTeams.length<2||
    !Array.isArray(s.participantRiders)||s.participantRiders.length<2||
    !Array.isArray(s.riderInputRows)||s.riderInputRows.length<2||
    !Array.isArray(s.phaseCommandRows)||
    s.phaseCommandRows.length!==s.riderInputRows.length||
    !isObj(s.profile)||!isObj(s.phase9Payload)||
    !Array.isArray(s.stagePoints)||!Array.isArray(s.preStageLeaders)||
    !Array.isArray(s.preStageStandings))
  throw Error('V4_INCOMPLETE_READONLY_BUNDLE')
 const start=iso(x.stageStartGameTs),cutoff=iso(x.lockCutoffGameTs)
 const captured=iso(x.gameNow)
 if(Date.parse(start)-Date.parse(cutoff)!==10800000||
    Date.parse(captured)<Date.parse(cutoff)||
    Date.parse(captured)-Date.parse(cutoff)>=5*60000||
    Date.parse(captured)>=Date.parse(start))
  throw Error('V4_CAPTURE_OUTSIDE_LOCK_WINDOW')
 const d=String(s.stage.stage_date??'').slice(0,10)
 const h=Number(s.stage.planned_start_hour_number)
 const m=Number(s.stage.planned_start_minute??0)
 if(!/^\d{4}-\d\d-\d\d$/.test(d)||
    !Number.isInteger(h)||h<0||h>23||
    !Number.isInteger(m)||m<0||m>59||
    iso(d+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00Z')!==start)
  throw Error('V4_CAPTURE_STAGE_START_MISMATCH')
 // Fail closed on missing or nonimmutable plan evidence.
 if(s.lockedPlanRows.some(p=>!isObj(p)||p.status!=='locked'||
    p.locked_at===null||p.locked_at===undefined||
    p.engine_stage_payload_json?.immutable!==true))
  throw Error('V4_CAPTURE_LOCK_PROOF_REJECTED')
 return {sources:s,start,cutoff,captured}
}
/**
 * Returns no private race data. The private input is deleted even when the
 * engine rejects it. The production sources are deliberately not modified.
 */
export async function runV4AdminReadOnlyExport(capture,{
 inputBuilder=compilePrivateV4ProductionInput,
 shadowRunner=runIsolatedV4Shadow
}={}){
 const proof=verifiedSource(capture)
 const s=proof.sources,stageId=s.stage.id,raceId=s.race.id
 const input=await inputBuilder({...s,
   deterministicSeed:'v4:admin-readonly:'+raceId+':'+stageId+':'+proof.cutoff
 })
 if(!isObj(input)||input.stage?.stageId!==stageId||
    input.race?.raceId!==raceId||
    input.stage.stageFormat!=='road_race'||
    input.stage.terrainType!==s.stage.terrain_type)
  throw Error('V4_CAPTURE_BUILDER_MISMATCH')
 const lockedEvidence={
  stage:{stageId,raceId,stageFormat:'road_race',
   terrainType:input.stage.terrainType,stageStartGameTs:proof.start},
  lockedPlans:s.lockedPlanRows,authoritativeEntries:s.participantTeams,
  completeLockSnapshot:{
   sourceKind:'read_only_lock_window_capture',
   status:'locked',immutable:true,
   stageId,raceId,snapshotId:randomUUID(),
   stageStartGameTs:proof.start,lockCutoffGameTs:proof.cutoff,
   snapshotGameTs:proof.captured,
   inputSha256:sha(input),input
  }
 }
 const result=auditV4RealLockedStageEvidence(lockedEvidence)
 if(result.status!=='V4_READ_ONLY_CAPTURE_RECONSTRUCTION_ONLY')
  throw Error('V4_REAL_LOCK_RECONSTRUCTION_REJECTED')
 const envelope=prepareV4RealLockedShadowEnvelope(lockedEvidence)
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-admin-capture-'))
 const file=join(folder,'private-stage.json')
 try{
  writeFileSync(file,JSON.stringify(envelope),{encoding:'utf8',flag:'wx',mode:0o600})
  const shadow=await shadowRunner(file)
  if(shadow?.productionEnabled!==false||shadow?.officialWrites!==0||
     typeof shadow.status!=='string')
   throw Error('V4_PRIVATE_SHADOW_REPORT_INVALID')
  return {...report('V4_ADMIN_READONLY_SHADOW_RESEARCH_COMPLETED'),
   realShadowExecuted:true,
   shadowStatus:shadow.status,replayQuality:shadow.replayQuality,
   strictReplayPassed:shadow.status==='SHADOW_STRICT_REPLAY_PASS'&&
    shadow.replayQuality==='full',
   immutableProductionSourceVerified:false,productionParityVerified:false}
 }finally{
  rmSync(folder,{recursive:true,force:true})
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length===4&&process.argv[2]==='--sql'){
   process.stdout.write(buildV4AdminReadOnlySql(process.argv[3]))
  }else if(process.argv.length===4&&process.argv[2]==='--run'){
   const raw=readFileSync(privatePath(process.argv[3]),'utf8')
   const capture=JSON.parse(raw)
   const status=classifyV4AdminExport(capture)
   if(status.status!=='V4_EXPORT_REQUIRES_PRIVATE_VALIDATION'){
    console.log('V4_ADMIN_CAPTURE_STATUS '+JSON.stringify(status))
    process.exitCode=1
   }else{
    const result=await runV4AdminReadOnlyExport(capture)
    console.log('V4_ADMIN_CAPTURE_STATUS '+JSON.stringify(result))
    if(!result.strictReplayPassed)process.exitCode=1
   }
  }else throw Error('V4_ADMIN_CAPTURE_USAGE_REJECTED')
 }catch{
  // No input, SQL exception, ids, rider names, credentials or stack traces.
  console.error('V4_ADMIN_CAPTURE_REJECTED: invalid source, lock or execution')
  process.exitCode=1
 }
}
