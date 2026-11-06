/**
 * Private CMD-only first real stage V4 vs official historical outcome comparison.
 * Read-only Supabase SELECTs, no result writes, no saved credentials, no raw
 * rider data in console or GitHub. Uses the same private research sidecar
 * snapshot as start_first_real_v4.cmd and identical calibrated solver.
 */
import {resolve,dirname,join} from 'node:path'
import {readFileSync,existsSync} from 'node:fs'
import {X509Certificate} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {createInterface} from 'node:readline/promises'
import {emitKeypressEvents} from 'node:readline'
import {stdin,stdout} from 'node:process'
import {buildV4PrivateSidecarSelect,verifyPrivateV4ResearchSource}
 from './scripts/v4/privateResearchSidecarReplayV4.mjs'
import {compilePrivateV4ProductionInput}
 from './scripts/v4/privateReadOnlyLockedCaptureV4.mjs'
import {runPrivateRealVsOfficialV4}
 from './scripts/v4/runPrivateRealVsOfficialV4.mjs'
import {runPrivateControlledFourWayV4}
 from './scripts/v4/runPrivateControlledFourWayV4.mjs'

const ref='okuravitxocyevkexfgi'
const stageId='c7800ffd-f417-4feb-8a66-b928551daa4d'
const expectedSha='6ca65541e38f6b3fcd2eda4af0891c2c3d8aa8953e2c4f8a47c3040eebb20715'
const root=dirname(fileURLToPath(import.meta.url))
let stage='CREDENTIALS'
const step=x=>{stage=x;console.log('V4_COMPARE_STEP '+x)}
async function askHost(){
 if(!stdin.isTTY||!stdout.isTTY)throw Error('TTY_REQUIRED')
 const rl=createInterface({input:stdin,output:stdout})
 try{return (await rl.question('Supabase database host: ')).trim().toLowerCase()}
 finally{rl.close()}
}
async function askPassword(){
 if(!stdin.isTTY||!stdout.isTTY||typeof stdin.setRawMode!=='function')
  throw Error('TTY_REQUIRED')
 emitKeypressEvents(stdin)
 const prior=Boolean(stdin.isRaw)
 stdout.write('Supabase database password (input hidden): ')
 stdin.setRawMode(true);stdin.resume()
 return new Promise((resolvePassword,reject)=>{
  let value=''
  const done=()=>{stdin.off('keypress',onKey);stdin.setRawMode(prior);stdin.pause();stdout.write('\n')}
  function onKey(char,key={}){
   if(key.ctrl&&key.name==='c'){done();reject(Error('CANCELLED'))}
   else if(key.name==='return'||key.name==='enter'){done();resolvePassword(value)}
   else if(key.name==='backspace'||key.name==='delete'){value=value.slice(0,-1)}
   else if(typeof char==='string'&&!key.ctrl&&!key.meta&&
      !/[\x00-\x1f\x7f]/.test(char))value+=char
  }
  stdin.on('keypress',onKey)
 })
}
function tls(host){
 const ca=process.env.PPM_V4_RESEARCH_DB_CA_FILE
 const p=ca?.trim()?resolve(ca.trim()):join(root,'supabase-ca.crt')
 if(!existsSync(p)){
  if(ca)throw Error('CA_MISSING')
  return {rejectUnauthorized:true,servername:host}
 }
 const pem=readFileSync(p,'utf8')
 if(!pem.includes('-----BEGIN CERTIFICATE-----'))
  throw Error('CA_INVALID')
 new X509Certificate(pem)
 step('TLS_CA_LOADED')
 return {rejectUnauthorized:true,servername:host,ca:pem}
}
function captureFrom(result){
 const sets=Array.isArray(result)?result:[result]
 const rows=sets.flatMap(x=>x?.rows??[]).filter(x=>Object.hasOwn(x,'private_capture'))
 if(rows.length!==1)throw Error('CAPTURE_MISSING')
 const c=rows[0].private_capture
 if(!c||c.stageId!==stageId||c.sourceSha256!==expectedSha||
  c.teamCount!==18||c.riderCount!==108||
  c.officialWrites!==0||c.productionParityVerified!==false)
  throw Error('CAPTURE_INVALID')
 return c
}
function controls(proof,input){
 const records=proof.sources.participantTeams
 const byEntry=new Map(records.map(x=>[x.race_team_entry_id,x]))
 const out=[]
 for(const team of input.teams){
  const e=byEntry.get(team.raceTeamEntryId)
  if(!e||e.participating_club_id!==team.participatingClubId)
   throw Error('TEAM_OWNER_MISMATCH')
  const isAi=e.is_ai_filler===true||
   ['ai','ai_fill','ai_filler'].includes(String(e.entry_source??'').toLowerCase())
  if(typeof team.snapshot?.metadata?.scenarioAiControlled==='boolean'&&
     team.snapshot.metadata.scenarioAiControlled!==isAi)
   throw Error('TEAM_KIND_MISMATCH')
  if(!isAi&&!proof.sources.lockedPlanRows.some(p=>
     p.team_id===team.teamId&&['submitted','locked'].includes(p.status)))
   throw Error('HUMAN_PLAN_MISSING')
  out.push({teamId:team.teamId,kind:isAi?'ai':'human'})
 }
 if(out.length!==18||out.some(x=>x.kind!=='ai')||
    new Set(out.map(x=>x.teamId)).size!==18||
    input.stagePlans.length!==18)
  throw Error('TEAM_CONTROL_INVALID')
 return out
}
const officialSQL=String.raw`WITH sim AS (
 SELECT id,stage_id,race_id,status,engine_version,
 result_summary_json->'output_snapshot'->'universalResult' AS u
 FROM public.race_stage_simulation_runs
 WHERE stage_id=$1::uuid AND status='completed'
)
SELECT jsonb_build_object(
 'stageId',s.stage_id::text,
 'raceId',s.race_id::text,
 'status',s.status,
 'engineVersion',s.engine_version,
 'officialRows',(
  SELECT jsonb_agg(jsonb_build_object(
   'riderId',r.rider_id::text,'rank',r.rank,
   'status',r.status,'gapSeconds',r.gap_seconds,
   'elapsedSeconds',r.elapsed_seconds
  ) ORDER BY r.rider_id)
  FROM public.race_stage_results r
  WHERE r.stage_id=s.stage_id AND r.simulation_run_id=s.id
 ),
 'savedClassification',s.u->'finishResolution'->'classification',
 'savedEnergyRows',(
  SELECT jsonb_agg(jsonb_build_object(
   'riderId',e->>'riderId',
   'finishEnergy',(e->>'finishEnergy')::numeric,
   'energySpent',(e->>'energySpent')::numeric
  ) ORDER BY e->>'riderId')
  FROM jsonb_array_elements(s.u->'postStageUpdate'->'riderUpdates') e
 ),
 'savedRaceSummary',jsonb_build_object(
  'acceptedOpeningAttacks',(
   SELECT count(*)
   FROM jsonb_array_elements(s.u->'roadRaceResolution'->'phase1Opening'->'attackAttempts') a
   WHERE a->>'acceptedEscapeLaunch'='true'
  ),
  'openingBreakawaySize',s.u->'calibrationSummary'->'openingBreakawaySize',
  'peakBreakawayGapSeconds',s.u->'calibrationSummary'->'maximumBreakawayGapSeconds',
  'breakawayCaught',s.u->'calibrationSummary'->'breakawayCaught',
  'breakawaySurvived',s.u->'calibrationSummary'->'breakawaySurvived',
  'finalGroupCount',s.u->'calibrationSummary'->'finalGroupCount',
  'replayCheckpoints',jsonb_array_length(s.u->'replayTimeline'->'checkpoints'),
  'phase4BridgeGroups',jsonb_array_length(s.u->'roadRaceResolution'->'phase4Finish'->'bridgeGroups')
 )
) AS private_official_reference,
 current_user='postgres' AND session_user='postgres' AS identity_ok
FROM sim s`
/**
 * Historical trajectory peak, computed independently from saved calibration.
 * The archived summary's "maximum" omits some intermediate phase samples.
 * Fixed SELECT only, inside the already-open read-only transaction.
 */
const officialTrajectoryPeakSQL=String.raw`WITH sim AS (
 SELECT result_summary_json->'output_snapshot'->'universalResult'->'roadRaceResolution' AS r
 FROM public.race_stage_simulation_runs
 WHERE stage_id=$1::uuid AND status='completed'
), gaps AS (
 SELECT (v->>'gapSeconds')::double precision AS gap FROM sim,
  LATERAL jsonb_array_elements(coalesce(r->'phase1Opening'->'physicalGapTrajectory','[]'::jsonb)) v
 UNION ALL
 SELECT (v->>'gapSeconds')::double precision AS gap FROM sim,
  LATERAL jsonb_array_elements(coalesce(r->'phase2Development'->'physicalGapTrajectory','[]'::jsonb)) v
 UNION ALL
 SELECT (v->>'gapSeconds')::double precision AS gap FROM sim,
  LATERAL jsonb_array_elements(coalesce(r->'phase3Decisive'->'physicalGapTrajectory','[]'::jsonb)) v
 UNION ALL
 SELECT (v->>'startGapSeconds')::double precision AS gap FROM sim,
  LATERAL jsonb_array_elements(coalesce(r->'phase4Finish'->'chaseSteps','[]'::jsonb)) v
 UNION ALL
 SELECT (v->>'endGapSeconds')::double precision AS gap FROM sim,
  LATERAL jsonb_array_elements(coalesce(r->'phase4Finish'->'chaseSteps','[]'::jsonb)) v
), valid AS (
 SELECT gap FROM gaps WHERE gap IS NOT NULL AND gap>=0 AND gap<100000000
)
SELECT max(gap) AS peak_seconds,count(*)::int AS sample_count FROM valid`
async function main(){
 const fourWay=process.argv.length===3&&process.argv[2]==='--four-way'
 if(!fourWay&&process.argv.length!==2)throw Error('NO_ARGUMENTS')
 const host=(process.env.PPM_V4_RESEARCH_ADMIN_DB_HOST||await askHost()).trim().toLowerCase()
 const isDirect=host==='db.'+ref+'.supabase.co'
 const isPooler=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
 if(!isDirect&&!isPooler)throw Error('BAD_HOST')
 const password=process.env.PPM_V4_RESEARCH_ADMIN_DB_PASSWORD||await askPassword()
 if(typeof password!=='string'||!password)throw Error('BAD_PASSWORD')
 const ssl=tls(host)
 step('CONNECT_DATABASE')
 const {default:pg}=await import('pg')
 const client=new pg.Client({
  host,port:5432,database:'postgres',
  user:isDirect?'postgres':'postgres.'+ref,
  password,ssl,connectionTimeoutMillis:10000,query_timeout:60000,
  application_name:'ppm-v4-official-comparison-readonly'
 })
 let capture,reference,connected=false,started=false
 try{
  await client.connect();connected=true
  step('EXPORT_RESEARCH_SOURCE_READ_ONLY')
  capture=captureFrom(await client.query(buildV4PrivateSidecarSelect(stageId)))
  step('READ_OFFICIAL_ARCHIVE_READ_ONLY')
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  started=true
  const r=await client.query(officialSQL,[stageId])
  if(r.rows.length!==1||r.rows[0].identity_ok!==true)
   throw Error('OFFICIAL_REFERENCE_NOT_VERIFIED')
  reference=r.rows[0].private_official_reference
  if(!reference||reference.status!=='completed'||
     reference.engineVersion!=='race_engine_ts_v1'||
     !Array.isArray(reference.officialRows)||reference.officialRows.length!==108)
   throw Error('OFFICIAL_REFERENCE_INVALID')
  if(fourWay){
   const peak=await client.query(officialTrajectoryPeakSQL,[stageId])
   const value=peak.rows[0]
   if(peak.rows.length!==1||!Number.isFinite(Number(value.peak_seconds))||
      !(Number(value.sample_count)>0))throw Error('OFFICIAL_TRAJECTORY_MISSING')
   reference.savedRaceSummary={
    ...reference.savedRaceSummary,
    observedPeakBreakawayGapSeconds:Number(value.peak_seconds),
    observedPeakSampleCount:Number(value.sample_count)
   }
  }
  await client.query('ROLLBACK');started=false
 }finally{
  if(started)try{await client.query('ROLLBACK')}catch{}
  if(connected)await client.end()
 }
 // Privileged DB session is fully closed BEFORE local engine compilation.
 step('BUILD_VERIFIED_V4_INPUT')
 const proof=verifyPrivateV4ResearchSource(capture)
 const input=await compilePrivateV4ProductionInput({
  ...proof.sources,
  deterministicSeed:'v4:private-research-sidecar:'+
   proof.raceId+':'+proof.stageId+':'+proof.sourceHash
 })
 if(input.race?.raceId!==proof.raceId||input.stage?.stageId!==proof.stageId||
    input.stage.stageFormat!=='road_race'||input.riders.length!==108)
  throw Error('RESEARCH_INPUT_INVALID')
 const teamControl=controls(proof,input)
 const options={
  lock:{stageId:proof.stageId,snapshotId:proof.sourceHash,
   snapshotStatus:'locked',stageStartGameTs:proof.start,
   lockCutoffGameTs:proof.cutoff,snapshotGameTs:proof.captured},
  teamControl,gameDate:proof.start.slice(0,10)
 }
 step(fourWay?'COMPARE_CONTROLLED_FOUR_WAY':'COMPARE_V4_WITH_OFFICIAL')
 const envelope={input,options,reference}
 const report=fourWay?await runPrivateControlledFourWayV4(envelope):
  await runPrivateRealVsOfficialV4(envelope)
 step('COMPARISON_COMPLETE')
 console.log((fourWay?'V4_CONTROLLED_FOUR_WAY ':'V4_VS_OFFICIAL ')+JSON.stringify(report))
}
try{await main()}catch(error){
 console.error('V4_COMPARE_FAILED_AT '+stage)
 // Emit only an explicitly enumerated data-free code, never raw exception text.
 const safeCodes=new Set([
  'V4_FOUR_WAY_INPUT_REJECTED','V4_FOUR_WAY_SIZE_REJECTED',
  'V4_FOUR_WAY_PHYSICS_REJECTED','V4_FOUR_WAY_DUAL_BUILD_REJECTED',
  'V4_FOUR_WAY_WORKER_REJECTED','V4_FOUR_WAY_REPORT_REJECTED',
  'V4_FOUR_WAY_CASE_REJECTED','V4_FOUR_WAY_EFFECT_REJECTED',
  'V4_FOUR_WAY_BASELINE_ORIGINAL_EXECUTION_REJECTED',
  'V4_FOUR_WAY_BASELINE_ORIGINAL_REPLAY_REJECTED',
  'V4_FOUR_WAY_BASELINE_V4_TACTICS_EXECUTION_REJECTED',
  'V4_FOUR_WAY_BASELINE_V4_TACTICS_REPLAY_REJECTED',
  'V4_FOUR_WAY_V4_ORIGINAL_EXECUTION_REJECTED',
  'V4_FOUR_WAY_V4_ORIGINAL_REPLAY_REJECTED',
  'V4_FOUR_WAY_V4_V4_TACTICS_EXECUTION_REJECTED',
  'V4_FOUR_WAY_V4_V4_TACTICS_REPLAY_REJECTED',
  'V4_FOUR_WAY_PLAN_REJECTED','V4_FOUR_WAY_AGGREGATION_REJECTED'
 ])
 if(stage==='COMPARE_CONTROLLED_FOUR_WAY'&&safeCodes.has(error?.message))
  console.error('V4_FOUR_WAY_SAFE_DIAGNOSTIC '+error.message)
 process.exitCode=1
}
