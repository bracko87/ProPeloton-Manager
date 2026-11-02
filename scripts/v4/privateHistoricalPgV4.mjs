/** Private archived-race V4 pilot via NOWRITE custom Postgres role. */
import {storePrivateHistoricalEnvelopeV4} from './privateHistoricalExportV4.mjs'
import {runPrivateHistoricalPilotV4} from './privateHistoricalPilotV4.mjs'
import {TERRAIN_TARGETS} from './privateHistoricalPilotSelectionV4.mjs'
import {runPrivateHistoricalPhysicsV4} from './privateHistoricalPhysicsV4.mjs'
import {HISTORICAL_REPLAY_KNOWN_ISSUE_CODES,V4_POST_CATCH_TRANSFER_CLASSES,HISTORICAL_POST_CATCH_PERIODS} from '../../src/race-engine-v4/privateHistoricalDiagnosticsV4.mjs'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const role='v4_historical_research_reader'
// Reader is intentionally NOLOGIN. Authenticate with a separate NOINHERIT
// login, then SET ROLE inside the shared SESSION pooler connection.
const loginRole='v4_historical_research_login'
const project='okuravitxocyevkexfgi'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const queryMetadata=[
 "SELECT stage_id,completed_at,input_snapshot_json #>> '{stage,terrainType}' AS terrain,",
 "input_snapshot_json #>> '{stage,stageFormat}' AS stage_format,",
 "CASE result_summary_json #>> '{output_snapshot,universalResult,replaySynchronization,synchronized}'",
 "WHEN 'true' THEN true WHEN 'false' THEN false ELSE NULL END AS saved_replay_synchronized,",
 "CASE WHEN jsonb_typeof(input_snapshot_json->'teams')='array'",
 "THEN jsonb_array_length(input_snapshot_json->'teams') ELSE NULL END AS team_count,",
 "COALESCE((input_snapshot_json #>> '{teams,0,raceTeamEntryId}') SIMILAR TO",
 "'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',false)",
 "AS first_entry_mappable,",
 "COALESCE((SELECT count(*) BETWEEN 2 AND 40",
 "AND count(*)=count(DISTINCT team.elem->>'raceTeamEntryId')",
 "AND count(*)=count(entries.race_team_entry_id)",
 "FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.input_snapshot_json->'teams')='array'",
 "THEN r.input_snapshot_json->'teams' ELSE '[]'::jsonb END) AS team(elem)",
 "LEFT JOIN v4_historical_research.race_entries AS entries",
 "ON entries.race_id=r.race_id AND entries.race_team_entry_id::text=team.elem->>'raceTeamEntryId'",
 "),false) AS all_entries_mapped",
 "FROM v4_historical_research.completed_runs AS r ORDER BY r.completed_at DESC LIMIT $1",
].join(' ')
const queryRun='SELECT stage_id,race_id,status,input_snapshot_json,result_summary_json FROM v4_historical_research.completed_runs WHERE stage_id=$1 LIMIT 2'
const queryEntries='SELECT race_team_entry_id,race_id,participating_club_id,club_id,entry_source,is_ai_filler FROM v4_historical_research.race_entries WHERE race_id=$1 AND race_team_entry_id=ANY($2::uuid[])'
export function historicalPgCohortPlan(env={}){
 const mode=env.PPM_V4_RESEARCH_COHORT??'balanced'
 if(mode==='balanced')return {targets:TERRAIN_TARGETS,maxProbesPerTerrain:18}
 if(mode==='chase_priority_12')return {
  targets:{flat:4,hilly:4,mountain:4,cobbled:0},maxProbesPerTerrain:18}
 if(mode==='hilly_latest_nine')return {
  targets:{flat:0,hilly:9,mountain:0,cobbled:0},maxProbesPerTerrain:24}
 throw Error('INVALID_HISTORICAL_COHORT')
}
const queryLoginIdentity='SELECT session_user AS login_user,current_user AS active_user'
const activateReaderRole='SET ROLE v4_historical_research_reader'
const queryRights="SELECT session_user AS login_user,current_user AS db_user,has_table_privilege(current_user,'v4_historical_research.completed_runs','SELECT') AS scoped_runs,has_table_privilege(current_user,'v4_historical_research.race_entries','SELECT') AS scoped_entries,has_table_privilege(current_user,'public.race_stage_simulation_runs','SELECT') AS live_runs,has_table_privilege(current_user,'public.race_participant_teams_v1','SELECT') AS live_entries,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls,(SELECT rolcanlogin FROM pg_roles WHERE rolname=current_user) AS reader_can_login"
export function privatePgConfig(env){
 const host=String(env.PPM_V4_RESEARCH_DB_HOST??'').trim().toLowerCase()
 const password=env.PPM_V4_RESEARCH_DB_PASSWORD
 if(!/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)||
   typeof password!=='string'||password.length<24)
  throw Error('PRIVATE_PG_CONFIGURATION_REQUIRED')
 const ssl={rejectUnauthorized:true}
 if(env.PPM_V4_RESEARCH_DB_CA_FILE){
  if(typeof env.PPM_V4_RESEARCH_DB_CA_FILE!=='string'||!env.PPM_V4_RESEARCH_DB_CA_FILE.endsWith('.crt'))
   throw Error('INVALID_PRIVATE_CA_PATH')
  ssl.ca=readFileSync(env.PPM_V4_RESEARCH_DB_CA_FILE,'utf8')
 }
 return {host,port:5432,user:loginRole+'.'+project,password,
  database:'postgres',ssl,connectionTimeoutMillis:12000,query_timeout:20000,
  application_name:'v4-research-readonly'}
}
export async function runPrivatePgHistoricalPilotV4({
 env=process.env,ClientConstructor=null,physicalRunner=runPrivateHistoricalPhysicsV4,
 progress=null
}={}){
 const plan=historicalPgCohortPlan(env)
 const candidateFlag=env.PPM_V4_RESEARCH_CHASE_PRIORITY
 if(candidateFlag!==undefined&&candidateFlag!=='0'&&candidateFlag!=='1')
  throw Error('INVALID_PRIVATE_CANDIDATE_OPTION')
 const includeChasePriority=candidateFlag==='1'
 if(env.PPM_V4_RESEARCH_COHORT==='chase_priority_12'&&!includeChasePriority)
  throw Error('CHASING_COHORT_REQUIRES_PRIORITY_OPT_IN')
 const conf=privatePgConfig(env)
 const Client=ClientConstructor??(await import('pg')).default.Client
 const db=new Client(conf)
 let connected=false
 let phase='CONNECT'
 try{
  await db.connect();connected=true
  phase='VERIFY_LOGIN_IDENTITY'
  const auth=(await db.query(queryLoginIdentity)).rows[0]
  if(auth?.login_user!==loginRole||auth?.active_user!==loginRole)
   throw Error('RESTRICTED_LOGIN_ROLE_REQUIRED')
  phase='ACTIVATE_RESTRICTED_ROLE'
  await db.query(activateReaderRole)
  phase='VERIFY_RESEARCH_ROLE'
  const x=(await db.query(queryRights)).rows[0]
  if(x?.login_user!==loginRole||x.db_user!==role||
     x.reader_can_login!==false||
     x.scoped_runs!==true||x.scoped_entries!==true||
     x.live_runs!==false||x.live_entries!==false||x.bypass_rls!==false)
   throw Error('RESTRICTED_PG_ROLE_REQUIRED')
  const metadataReader=async(limit)=>{
   phase='READ_METADATA'
   return (await db.query(queryMetadata,[limit])).rows.map(r=>({
     ...r,completed_at:new Date(r.completed_at).toISOString()}))
  }
  const exportStage=async({stageId})=>{
   phase='READ_AND_VALIDATE_EXPORTS'
   if(!uuid.test(String(stageId??'')))throw Error('INVALID_STAGE_ID')
   const runs=(await db.query(queryRun,[stageId])).rows
   if(runs.length!==1)throw Error('MISSING_OR_AMBIGUOUS_STAGE')
   const run=runs[0],teams=run.input_snapshot_json?.teams
   if(!Array.isArray(teams)||!teams.length)throw Error('NO_ARCHIVED_TEAMS')
   const ids=teams.map(t=>t.raceTeamEntryId)
   if(ids.some(id=>!uuid.test(String(id??''))))throw Error('INVALID_ENTRY_MAPPING')
   const entries=(await db.query(queryEntries,[run.race_id,ids])).rows
   return storePrivateHistoricalEnvelopeV4(run,entries,stageId)
  }
  const candidateRunner=includeChasePriority?async manifest=>{
   const report=await physicalRunner(manifest,{includeChasePriority:true})
   const priority=report?.chasePriorityResearch
   if(!priority||priority.enabledByExplicitOption!==true||
      priority.status!=='PRIVATE_RESEARCH_DIAGNOSTIC_NOT_REALISM_APPROVAL'||
      priority.officialWrites!==0||priority.rawStageDataPublished!==false||
      !Number.isSafeInteger(priority.attemptedPrivateCandidateRuns)||
      priority.attemptedPrivateCandidateRuns<1||
      !Number.isSafeInteger(priority.all?.compared)||priority.all.compared<0)
    throw Error('UNTRUSTED_PRIVATE_CHASE_PRIORITY_REPORT')
   return report
  }:physicalRunner
  const report=await runPrivateHistoricalPilotV4({
   metadataReader,exportStage,physicalRunner:candidateRunner,
   requireVerifiedMetadata:includeChasePriority,
   targets:plan.targets,maxProbesPerTerrain:plan.maxProbesPerTerrain,
   progress:state=>{
    phase=state.phase
    if(progress)progress(state)
   }})
  if(env.PPM_V4_RESEARCH_COHORT!=='chase_priority_12')return report
  const exported=report.accepted??{flat:0,hilly:0,mountain:0,cobbled:0}
  const exactlyTwelve=['flat','hilly','mountain'].every(t=>exported[t]===4)&&
    exported.cobbled===0
  const strictPaired=report.chasePriorityResearch?.all?.compared??0
  const complete=exactlyTwelve&&strictPaired===12
  return {...report,chasePriority12:{
   status:complete?'READY_FOR_HISTORICAL_REALISM_REVIEW':
    exactlyTwelve?'STRICT_HISTORICAL_PAIRS_INCOMPLETE':'EXPORT_COHORT_INCOMPLETE',
   researchOnly:true,officialWrites:0,
   targets:{flat:4,hilly:4,mountain:4,cobbled:0},
   actualExports:exported,strictHistoricalPairs:strictPaired,
   sourceRevisionHistoricallyAttested:false,
   productionReady:false
  }}
 }catch(err){
  if(err&&typeof err==='object')err.v4ResearchPhase=phase
  throw err
 }finally{if(connected)await db.end()}
}
/** Small privacy-safe operator summary. Never projects race IDs or file paths. */
export function summarizePrivateHistoricalPilotV4(report){
 const terrains=['flat','hilly','mountain']
 const codes=report?.rejected?.safeReplayIssueCodesByVariant?.preserved_v2??{}
 const allowed=new Set([...HISTORICAL_REPLAY_KNOWN_ISSUE_CODES,'UNKNOWN_ISSUE_CODE','NOT_REPLAY'])
 const replayIssueCounts=Object.fromEntries(Object.entries(codes).filter(([k,v])=>
  allowed.has(k)&&Number.isSafeInteger(v)&&v>0))
 const safeHistogram=(items,allow)=>Object.fromEntries(Object.entries(items??{})
  .filter(([k,v])=>allow.includes(k)&&Number.isSafeInteger(v)&&v>0))
 const firstFailureTransfers=safeHistogram(
  report?.rejected?.postCatchTransferClassesByVariant?.preserved_v2,
  V4_POST_CATCH_TRANSFER_CLASSES)
 const firstFailurePeriods=safeHistogram(
  report?.rejected?.postCatchPeriodsByVariant?.preserved_v2,
  HISTORICAL_POST_CATCH_PERIODS)
 return {
  status:report?.chasePriority12?.status??report?.status??'UNKNOWN',
  historicalSourceRevisionAttested:false,historicalV4RealismApproved:false,
  officialWrites:0,
  exportCounts:report?.accepted??null,
  strictPairs:report?.consideredCompleteTriples??0,
  pairedByTerrain:Object.fromEntries(terrains.map(k=>
   [k,report?.rejected?.byTerrain?.[k]?.eligible??0])),
  exclusions:{
   unsupportedSolver:report?.rejected?.baselineUnsupported??0,
   baselineReplayOrOtherInvalid:report?.rejected?.baselineInvalid??0,
   historicalResultDrift:report?.rejected?.baselineHistoricMismatch??0,
   otherReplayIssues:replayIssueCounts,
   postCatchFirstTransferTypes:firstFailureTransfers,
   postCatchFirstCheckpointPeriods:firstFailurePeriods,
  },
  chasePriority:{
   compared:report?.chasePriorityResearch?.all?.compared??0,
   medianPeakChangeSeconds:report?.chasePriorityResearch?.all?.medianObservedPeakDifferenceSeconds??null,
   changedClassification:report?.chasePriorityResearch?.all?.changedClassification??0,
   changedWinner:report?.chasePriorityResearch?.all?.changedWinner??0,
  }
 }
}
function safeError(err){
 const msg=String(err?.message??'')
 const allowed=['INVALID_HISTORICAL_COHORT','RESTRICTED_PG_ROLE_REQUIRED','RESTRICTED_LOGIN_ROLE_REQUIRED','PRIVATE_PG_CONFIGURATION_REQUIRED',
  'INVALID_PRIVATE_CA_PATH','INVALID_PRIVATE_CANDIDATE_OPTION','CHASING_COHORT_REQUIRES_PRIORITY_OPT_IN','UNTRUSTED_PRIVATE_CHASE_PRIORITY_REPORT','INVALID_STAGE_ID','MISSING_OR_AMBIGUOUS_STAGE',
  'NO_ARCHIVED_TEAMS','INVALID_ENTRY_MAPPING','PRIVATE_PHYSICAL_ENGINE_FAILED',
  'UNTRUSTED_PRIVATE_PHYSICAL_EVIDENCE','PHYSICAL_HISTORIC_INPUT_MISMATCH',
  'PRIVATE_PATH_REJECTED','DUPLICATE_PRIVATE_INPUT','INVALID_MANIFEST',
  'Unsafe physics report','Metadata SELECT denied','Invalid historical pilot selection limits']
 const code=String(err?.code??'')
 return {phase:typeof err?.v4ResearchPhase==='string'?err.v4ResearchPhase:'CONFIGURATION',
  postgresCode:/^[0-9A-Z]{5}$/.test(code)?code:null,
  systemCode:['ENOENT','EACCES','EPERM','ETIMEDOUT'].includes(code)?code:null,
  reason:allowed.includes(msg)?msg:code==='SELF_SIGNED_CERT_IN_CHAIN'?'TLS_CHAIN':code==='XX000'&&err?.v4ResearchPhase==='CONNECT'?'POOLER_ROUTING_OR_LOGIN_REJECTED':null,
  errorType:['Error','TypeError','RangeError'].includes(err?.name)?err.name:'UNKNOWN'}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length!==2)throw Error('NO_CLI_ARGS')
  const report=await runPrivatePgHistoricalPilotV4({
   progress:state=>console.log('V4_PRIVATE_PG_PROGRESS '+JSON.stringify(state))})
  console.log('V4_PRIVATE_PG_COMPACT_SUMMARY '+JSON.stringify(summarizePrivateHistoricalPilotV4(report)))
  console.log('V4_PRIVATE_PG_HISTORICAL_PILOT '+JSON.stringify(report))
  if(!report.consideredCompleteTriples)process.exitCode=1
 }catch(err){
  console.error('V4_PRIVATE_PG_HISTORICAL_PILOT_REJECTED '+JSON.stringify(safeError(err)))
  process.exitCode=1
 }
}
