/** Private archived-race V4 pilot via NOWRITE custom Postgres role. */
import {storePrivateHistoricalEnvelopeV4} from './privateHistoricalExportV4.mjs'
import {runPrivateHistoricalPilotV4} from './privateHistoricalPilotV4.mjs'
import {runPrivateHistoricalPhysicsV4} from './privateHistoricalPhysicsV4.mjs'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const role='v4_historical_research_reader'
const project='okuravitxocyevkexfgi'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const queryMetadata="SELECT stage_id,completed_at,input_snapshot_json #>> '{stage,terrainType}' AS terrain,input_snapshot_json #>> '{stage,stageFormat}' AS stage_format FROM v4_historical_research.completed_runs ORDER BY completed_at DESC LIMIT $1"
const queryRun='SELECT stage_id,race_id,status,input_snapshot_json,result_summary_json FROM v4_historical_research.completed_runs WHERE stage_id=$1 LIMIT 2'
const queryEntries='SELECT race_team_entry_id,race_id,participating_club_id,club_id,entry_source,is_ai_filler FROM v4_historical_research.race_entries WHERE race_id=$1 AND race_team_entry_id=ANY($2::uuid[])'
const queryRights="SELECT current_user AS db_user,has_table_privilege(current_user,'v4_historical_research.completed_runs','SELECT') AS scoped_runs,has_table_privilege(current_user,'v4_historical_research.race_entries','SELECT') AS scoped_entries,has_table_privilege(current_user,'public.race_stage_simulation_runs','SELECT') AS live_runs,has_table_privilege(current_user,'public.race_participant_teams_v1','SELECT') AS live_entries,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass_rls"
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
 return {host,port:5432,user:role+'.'+project,password,
  database:'postgres',ssl,connectionTimeoutMillis:12000,query_timeout:20000,
  application_name:'v4-research-readonly'}
}
export async function runPrivatePgHistoricalPilotV4({
 env=process.env,ClientConstructor=null,physicalRunner=runPrivateHistoricalPhysicsV4
}={}){
 const conf=privatePgConfig(env)
 const Client=ClientConstructor??(await import('pg')).default.Client
 const db=new Client(conf)
 let connected=false
 try{
  await db.connect();connected=true
  const x=(await db.query(queryRights)).rows[0]
  if(x?.db_user!==role||x.scoped_runs!==true||x.scoped_entries!==true||
     x.live_runs!==false||x.live_entries!==false||x.bypass_rls!==false)
   throw Error('RESTRICTED_PG_ROLE_REQUIRED')
  const metadataReader=async(limit)=>(
   await db.query(queryMetadata,[limit])).rows.map(r=>({
     ...r,completed_at:new Date(r.completed_at).toISOString()}))
  const exportStage=async({stageId})=>{
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
  return await runPrivateHistoricalPilotV4({
   metadataReader,exportStage,physicalRunner})
 }finally{if(connected)await db.end()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length!==2)throw Error('NO_CLI_ARGS')
  const report=await runPrivatePgHistoricalPilotV4()
  console.log('V4_PRIVATE_PG_HISTORICAL_PILOT '+JSON.stringify(report))
  if(!report.consideredCompleteTriples)process.exitCode=1
 }catch{
  console.error('V4_PRIVATE_PG_HISTORICAL_PILOT_REJECTED: local readonly access or archived evidence invalid')
  process.exitCode=1
 }
}
