/**
 * Real-data V4 shadow capture, private and research-only.
 * The production payload RPCs may write jerseys, points or heartbeats.
 * NEVER call them from here. All source reads below are fixed SELECTs in
 * REPEATABLE READ READ ONLY. No worker, SQL migration, result or scheduler
 * writes; no service_role credentials or rider data in output.
 *
 * Source is RECONSTRUCTED at the lock window, not a certified original
 * production input. Even a full replay pass is not release approval.
 */
import {createHash,randomUUID} from 'node:crypto'
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {
 auditV4RealLockedStageEvidence,prepareV4RealLockedShadowEnvelope
} from './realLockedStageEvidenceV4.mjs'
import {runIsolatedV4Shadow} from './runIsolatedShadowV4.mjs'

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const reader='v4_live_shadow_read_login'
const project='okuravitxocyevkexfgi'
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
function iso(x){
 const d=x instanceof Date?x:new Date(x)
 if(!Number.isFinite(d.getTime()))throw Error('V4_CAPTURE_TIME_INVALID')
 return d.toISOString()
}

// Fixed query list. No volatile production payload or eligible-jersey RPC.
// Reject role changes and a STABLE -> VOLATILE function change before reading.
export const V4_CAPTURE_QUERIES=Object.freeze({
 identity:"SELECT session_user AS login_user,current_user AS active_user,current_setting('transaction_read_only') AS transaction_read_only,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolcanlogin,(SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.provolatile='v' AND p.prosecdef=true AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS callable_volatile_definer_count,has_table_privilege(current_user,'public.race_stage_simulation_runs','INSERT') AS can_insert_results,has_table_privilege(current_user,'public.race_stage_plans','UPDATE') AS can_update_plans,has_table_privilege(current_user,'public.race_stage_authoritative_runs','INSERT') AS can_publish FROM pg_roles r WHERE r.rolname=current_user",
 clock:"SELECT make_timestamptz(1999+season_number,month_number,day_number,coalesce(hour_number,0),coalesce(minute_number,0),0,'UTC') AS game_now FROM public.game_state WHERE id=true",
 stable:"SELECT p.proname,p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])",
 stage:"SELECT to_jsonb(s) AS value FROM public.race_stages s WHERE s.id=$1::uuid",
 race:"SELECT to_jsonb(r) AS value FROM public.races r WHERE r.id=$1::uuid",
 entries:"SELECT to_jsonb(t) AS value FROM public.race_participant_teams_v1 t WHERE t.race_id=$1::uuid AND lower(coalesce(t.status,'accepted'))='accepted' ORDER BY t.race_team_entry_id",
 plans:"SELECT to_jsonb(p)||jsonb_build_object('team_id',coalesce(rp.participating_club_id,rp.club_id),'club_id',rp.club_id,'participating_club_id',rp.participating_club_id) AS value FROM public.race_stage_plans p JOIN public.race_preparations rp ON rp.id=p.race_preparation_id WHERE p.stage_id=$1::uuid ORDER BY p.id",
 disqualifications:"SELECT count(*)::int AS n FROM public.race_team_stage_disqualifications WHERE race_id=$1::uuid AND from_stage_number<=$2::int",
 riders:"SELECT to_jsonb(r) AS value FROM public.race_participant_riders_v1 r WHERE r.race_id=$1::uuid ORDER BY r.start_number NULLS LAST,r.rider_id",
 riderInputs:"SELECT to_jsonb(x) AS value FROM public.race_engine_get_stage_rider_inputs_v1($1::uuid) x ORDER BY x.team_id,x.rider_id",
 phaseCommands:"SELECT to_jsonb(x) AS value FROM public.race_engine_get_stage_phase_commands_v1($1::uuid) x ORDER BY x.team_id,x.rider_id",
 points:"SELECT to_jsonb(p) AS value FROM public.race_stage_points p WHERE p.stage_id=$1::uuid ORDER BY p.sort_order,p.km_from_start,p.id",
 profile:"SELECT public.get_race_stage_profile_detail_v1($1::uuid) AS value",
 phase9:"SELECT public.universal_race_stage_filter_phase9_eligible_v1($1::uuid,public.race_engine_get_stage_phase9_inputs_v1($1::uuid)) AS value",
 leaders:"SELECT to_jsonb(x) AS value FROM public.get_race_stage_pre_stage_leaders_v1($1::uuid) x",
 standings:"SELECT to_jsonb(x) AS value FROM public.get_race_stage_pre_stage_standings_v1($1::uuid) x"
})
const stableFns=[
 'race_engine_get_stage_rider_inputs_v1','race_engine_get_stage_phase_commands_v1',
 'get_race_stage_profile_detail_v1','race_engine_get_stage_phase9_inputs_v1',
 'universal_race_stage_filter_phase9_eligible_v1',
 'get_race_stage_pre_stage_leaders_v1','get_race_stage_pre_stage_standings_v1'
]
export function privateCaptureDbConfig(env=process.env) {
 const host=String(env.PPM_V4_CAPTURE_DB_HOST??'').toLowerCase().trim()
 const pwd=env.PPM_V4_CAPTURE_DB_PASSWORD
 if(!/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)||
    typeof pwd!=='string'||pwd.length<24)
  throw Error('V4_READONLY_CAPTURE_CREDENTIALS_REQUIRED')
 const ssl={rejectUnauthorized:true}
 if(env.PPM_V4_CAPTURE_CA_FILE){
  if(!String(env.PPM_V4_CAPTURE_CA_FILE).endsWith('.crt'))
   throw Error('V4_CAPTURE_CA_REJECTED')
  ssl.ca=readFileSync(env.PPM_V4_CAPTURE_CA_FILE,'utf8')
 }
 return {host,port:5432,database:'postgres',user:reader+'.'+project,
  password:pwd,ssl,connectionTimeoutMillis:10000,query_timeout:30000,
  application_name:'v4-lock-readonly-shadow-research'}
}
const rows=async(db,sql,args=[])=>{
 const result=await db.query(sql,args)
 if(!Array.isArray(result?.rows))throw Error('V4_CAPTURE_QUERY_INVALID')
 return result.rows
}
const one=async(db,sql,args=[])=>{
 const x=await rows(db,sql,args)
 if(x.length!==1)throw Error('V4_CAPTURE_SOURCE_MISSING_OR_AMBIGUOUS')
 return x[0]
}
const values=async(db,sql,args=[])=> (await rows(db,sql,args)).map(x=>x.value)
function stageStart(stage) {
 const d=stage.stage_date instanceof Date?stage.stage_date.toISOString().slice(0,10):
  String(stage.stage_date??'').slice(0,10)
 const h=Number(stage.planned_start_hour_number),m=Number(stage.planned_start_minute)
 if(!/^\d{4}-\d\d-\d\d$/.test(d)||!Number.isInteger(h)||h<0||h>23||
    !Number.isInteger(m)||m<0||m>59)
  throw Error('V4_STAGE_START_UNVERIFIED')
 return iso(d+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00.000Z')
}
function assertRole(x) {
 if(x?.login_user!==reader||x?.active_user!==reader||
    x.transaction_read_only!=='on'||x.rolcanlogin!==true||
    x.callable_volatile_definer_count!==0||x.rolsuper!==false||
    x.rolbypassrls!==false||x.rolcreatedb!==false||
    x.rolcreaterole!==false||x.can_insert_results!==false||
    x.can_update_plans!==false||x.can_publish!==false)
  throw Error('V4_RESTRICTED_READONLY_ROLE_REQUIRED')
}
async function assertStableFns(db) {
 const found=await rows(db,V4_CAPTURE_QUERIES.stable,[stableFns])
 if(found.length!==stableFns.length||
    found.some(x=>!stableFns.includes(x.proname)||x.provolatile!=='s')||
    new Set(found.map(x=>x.proname)).size!==stableFns.length)
  throw Error('V4_SOURCE_FUNCTION_CHANGED_OR_UNSAFE')
}
export async function compilePrivateV4ProductionInput(sources,{
 compile=build
}={}){
 const temp=mkdtempSync(join(tmpdir(),'ppm-v4-readonly-builder-'))
 const outfile=join(temp,'read-only-builder.cjs')
 try{
  await compile({entryPoints:[resolve(repo,'src/universal-race-engine/buildProductionRaceInput.ts')],
   outfile,format:'cjs',platform:'node',target:'node20',bundle:true,logLevel:'silent'})
  const require=createRequire(import.meta.url)
  const fn=require(outfile).buildProductionUniversalRaceEngineInput
  if(typeof fn!=='function')throw Error('V4_CAPTURE_BUILDER_MISSING')
  const input=fn(sources)
  if(!isObj(input)||!Array.isArray(input.teams)||!Array.isArray(input.riders))
   throw Error('V4_CAPTURE_BUILDER_INVALID')
  return input
 }finally{rmSync(temp,{recursive:true,force:true})}
}
export async function captureReadOnlyLockedStageV4({
 stageId,ClientConstructor=null,env=process.env,
 inputBuilder=compilePrivateV4ProductionInput
}={}){
 if(!uuid.test(String(stageId??'')))throw Error('V4_STAGE_ID_INVALID')
 const cfg=privateCaptureDbConfig(env)
 const Client=ClientConstructor??(await import('pg')).default.Client
 const db=new Client(cfg)
 let connected=false,begun=false
 try {
  await db.connect();connected=true
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  begun=true
  assertRole(await one(db,V4_CAPTURE_QUERIES.identity))
  await assertStableFns(db)
  const stage=(await one(db,V4_CAPTURE_QUERIES.stage,[stageId])).value
  if(!isObj(stage)||stage.id!==stageId||!uuid.test(stage.race_id)||
     stage.stage_format!=='road_race')throw Error('V4_STAGE_UNSUPPORTED')
  const start=stageStart(stage),cutoff=iso(new Date(Date.parse(start)-10800000))
  const clock=await one(db,V4_CAPTURE_QUERIES.clock)
  const captured=iso(clock.game_now),lag=Date.parse(captured)-Date.parse(cutoff)
  if(lag<0||lag>5*60000||Date.parse(captured)>=Date.parse(start))
   throw Error('V4_NOT_IN_LOCK_CAPTURE_WINDOW')
  const race=(await one(db,V4_CAPTURE_QUERIES.race,[stage.race_id])).value
  const lockedPlans=await values(db,V4_CAPTURE_QUERIES.plans,[stageId])
  const authoritativeEntries=await values(db,V4_CAPTURE_QUERIES.entries,[stage.race_id])
  if(!lockedPlans.length||!authoritativeEntries.length||
     !lockedPlans.every(p=>p.status==='locked'))
   throw Error('V4_NO_AUTHORITATIVE_LOCKED_PLANS')
  if((await one(db,V4_CAPTURE_QUERIES.disqualifications,[stage.race_id,stage.stage_number])).n!==0)
   throw Error('V4_DISQUALIFIED_STAGE_UNSUPPORTED')
  const [participantRiders,riderInputRows,phaseCommandRows,stagePoints,
   profile,phase9Payload,preStageLeaders,preStageStandings]=await Promise.all([
   values(db,V4_CAPTURE_QUERIES.riders,[stage.race_id]),
   values(db,V4_CAPTURE_QUERIES.riderInputs,[stageId]),
   values(db,V4_CAPTURE_QUERIES.phaseCommands,[stageId]),
   values(db,V4_CAPTURE_QUERIES.points,[stageId]),
   one(db,V4_CAPTURE_QUERIES.profile,[stageId]).then(x=>x.value),
   one(db,V4_CAPTURE_QUERIES.phase9,[stageId]).then(x=>x.value),
   values(db,V4_CAPTURE_QUERIES.leaders,[stageId]),
   values(db,V4_CAPTURE_QUERIES.standings,[stageId])
  ])
  if(!isObj(race)||!isObj(profile)||!isObj(phase9Payload)||
     participantRiders.length<2||riderInputRows.length<2||
     phaseCommandRows.length!==riderInputRows.length)
   throw Error('V4_INCOMPLETE_READONLY_SOURCES')
  const sources={race,stage,profile,stagePoints,
   participantTeams:authoritativeEntries,participantRiders,
   riderInputRows,phaseCommandRows,lockedPlanRows:lockedPlans,
   preStageLeaders,preStageStandings,phase9Payload,
   deterministicSeed:'v4:read-only-lock:'+stage.race_id+':'+stageId+':'+cutoff}
  await db.query('ROLLBACK');begun=false
  const input=await inputBuilder(sources)
  if(input.stage?.stageId!==stageId||input.race?.raceId!==stage.race_id||
     input.stage?.stageFormat!==stage.stage_format||
     input.stage?.terrainType!==stage.terrain_type)
   throw Error('V4_CAPTURE_OUTPUT_IDENTITY_REJECTED')
  const evidence={
   stage:{stageId,raceId:stage.race_id,stageFormat:'road_race',
    terrainType:input.stage.terrainType,stageStartGameTs:start},
   lockedPlans,authoritativeEntries,
   completeLockSnapshot:{
    sourceKind:'read_only_lock_window_capture',status:'locked',immutable:true,
    stageId,raceId:stage.race_id,snapshotId:randomUUID(),
    stageStartGameTs:start,lockCutoffGameTs:cutoff,snapshotGameTs:captured,
    inputSha256:hash(input),input
   }
  }
  const gate=auditV4RealLockedStageEvidence(evidence)
  if(gate.status!=='V4_READ_ONLY_CAPTURE_RECONSTRUCTION_ONLY')
   throw Error('V4_READONLY_CAPTURE_GATE_REJECTED')
  return {envelope:prepareV4RealLockedShadowEnvelope(evidence),
   summary:{...gate,source:'read_only_lock_window_capture',
    productionParityVerified:false,realLockEvidenceVerified:false}}
 }finally{
  if(begun)try{await db.query('ROLLBACK')}catch{}
  if(connected)try{await db.end()}catch{}
 }
}
export async function runPrivateReadOnlyLockShadowV4({
 stageId,env=process.env,ClientConstructor=null,
 inputBuilder=compilePrivateV4ProductionInput,
 shadowRunner=runIsolatedV4Shadow
}={}){
 const captured=await captureReadOnlyLockedStageV4({
  stageId,env,ClientConstructor,inputBuilder
 })
 const folder=mkdtempSync(join(tmpdir(),'ppm-v4-real-lock-'))
 const path=join(folder,'locked-capture.json')
 try{
  writeFileSync(path,JSON.stringify(captured.envelope),
   {flag:'wx',encoding:'utf8',mode:0o600})
  const shadow=await shadowRunner(path)
  if(!shadow||shadow.officialWrites!==0||shadow.productionEnabled!==false)
   throw Error('V4_SHADOW_REPORT_INVALID')
  return {
   ...captured.summary,shadowStatus:shadow.status,
   replayQuality:shadow.replayQuality,realShadowExecuted:true,
   strictReplayPassed:shadow.status==='SHADOW_STRICT_REPLAY_PASS'&&
    shadow.replayQuality==='full',
   productionParityVerified:false,productionEnabled:false,officialWrites:0
  }
 }finally{rmSync(folder,{recursive:true,force:true})}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  if(process.argv.length!==3)throw Error('V4_STAGE_ID_REQUIRED')
  const report=await runPrivateReadOnlyLockShadowV4({stageId:process.argv[2]})
  console.log('V4_REAL_READONLY_SHADOW '+JSON.stringify(report))
  if(!report.strictReplayPassed)process.exitCode=1
 }catch{
  console.error('V4_REAL_READONLY_SHADOW_REJECTED: source/lock/role gate failed')
  process.exitCode=1
 }
}
