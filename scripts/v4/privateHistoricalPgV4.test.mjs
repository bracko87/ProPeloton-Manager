import assert from 'node:assert/strict'
import {runPrivatePgHistoricalPilotV4,privatePgConfig,historicalPgCohortPlan,summarizePrivateHistoricalPilotV4} from './privateHistoricalPgV4.mjs'
import {readFileSync} from 'node:fs'
const env={PPM_V4_RESEARCH_DB_HOST:'aws-7-eu-central-2.pooler.supabase.com',
 PPM_V4_RESEARCH_DB_PASSWORD:'only-a-synthetic-test-password-12345'}
const cfg=privatePgConfig(env)
assert.deepEqual(historicalPgCohortPlan(env).targets,{flat:4,hilly:4,mountain:4,cobbled:1})
assert.equal(historicalPgCohortPlan(env).maxProbesPerTerrain,18)
const exact12=historicalPgCohortPlan({...env,PPM_V4_RESEARCH_COHORT:'chase_priority_12'})
assert.deepEqual(exact12.targets,{flat:4,hilly:4,mountain:4,cobbled:0})
assert.equal(exact12.maxProbesPerTerrain,18)
const focused=historicalPgCohortPlan({...env,PPM_V4_RESEARCH_COHORT:'hilly_latest_nine'})
assert.deepEqual(focused.targets,{flat:0,hilly:9,mountain:0,cobbled:0})
assert.equal(focused.maxProbesPerTerrain,24)
assert.throws(()=>historicalPgCohortPlan({...env,PPM_V4_RESEARCH_COHORT:'all_unlimited'}),/INVALID_HISTORICAL_COHORT/)
assert.equal(cfg.user,'v4_historical_research_login.okuravitxocyevkexfgi')
assert.equal(cfg.port,5432)
assert.equal(cfg.ssl.rejectUnauthorized,true)
assert.throws(()=>privatePgConfig({...env,PPM_V4_RESEARCH_DB_HOST:'evil.example'}))
assert.throws(()=>privatePgConfig({...env,PPM_V4_RESEARCH_DB_PASSWORD:'short'}))
const u=n=>'12345678-1234-4234-8234-'+String(n).padStart(12,'0')
const stage=u(1),race=u(2),entry=u(3),entry2=u(4)
const run={stage_id:stage,race_id:race,status:'completed',
 input_snapshot_json:{stage:{stageId:stage,stageFormat:'road_race',terrainType:'flat'},
 race:{raceId:race},riders:[{},{}],
 teams:[{teamId:'team-1',raceTeamEntryId:entry},{teamId:'team-2',raceTeamEntryId:entry2}],
 stagePlans:[{teamId:'team-1',locked:true,status:'locked'},
 {teamId:'team-2',locked:true,status:'locked'}]},
 result_summary_json:{stage_start_game_at:'2000-01-01T00:00:00Z',
 output_snapshot:{universalResult:{stageId:stage}}}}
let opened=0,closed=0,physics=0
class FakeClient{
 async connect(){opened++}
 async end(){closed++}
 async query(sql,args){
  if(sql==='SELECT session_user AS login_user,current_user AS active_user')
   return {rows:[{login_user:'v4_historical_research_login',
    active_user:'v4_historical_research_login'}]}
  if(sql==='SET ROLE v4_historical_research_reader')return {rows:[]}
  if(sql.includes('current_user AS db_user'))return{rows:[{
   login_user:'v4_historical_research_login',
   db_user:'v4_historical_research_reader',scoped_runs:true,scoped_entries:true,
   live_runs:false,live_entries:false,bypass_rls:false,reader_can_login:false}]}
  if(sql.includes('ORDER BY r.completed_at DESC')){
   assert.ok(sql.includes('v4_historical_research.race_entries'))
   assert.ok(sql.includes('AS all_entries_mapped'))
   assert.ok(!sql.includes('SELECT *'))
   return{rows:[{stage_id:stage,terrain:'flat',stage_format:'road_race',
    completed_at:'2026-10-25T00:00:00Z',
    saved_replay_synchronized:true,team_count:2,
    first_entry_mappable:true,all_entries_mapped:true}]}
  }
  if(sql.includes('WHERE stage_id=$1')){assert.deepEqual(args,[stage]);return{rows:[run]}}
  if(sql.includes('race_team_entry_id=ANY')){
   assert.deepEqual(args,[race,[entry,entry2]])
   return{rows:[{race_team_entry_id:entry,race_id:race,
    is_ai_filler:true,entry_source:'ai'},
   {race_team_entry_id:entry2,race_id:race,is_ai_filler:true,entry_source:'ai'}]}
  }
  throw Error('Forbidden SQL')
 }
}
const result=await runPrivatePgHistoricalPilotV4({
 env,ClientConstructor:FakeClient,
 physicalRunner:async manifest=>{
  physics++
  const paths=JSON.parse(readFileSync(manifest,'utf8')).privateEnvelopePaths
  assert.equal(paths.length,1)
  const data=JSON.parse(readFileSync(paths[0],'utf8'))
  assert.equal(data.team_control[0].kind,'ai')
  return{officialWrites:0,rawStageDataPublished:false,
   privatePathsPublished:false,consideredCompleteTriples:1,
   rejected:{baselineInvalid:0,baselineHistoricMismatch:7,
    baselineReplayUnsynchronized:2,calibratedReplayUnsynchronized:1}}
 }})
assert.equal(result.consideredCompleteTriples,1)
assert.equal(result.preflight.flat.passed,1)
assert.equal(result.preflight.flat.entryMapping,0)
assert.equal(result.rejected.baselineHistoricMismatch,7)
assert.equal(result.rejected.baselineReplayUnsynchronized,2)
assert.equal(result.rejected.calibratedReplayUnsynchronized,1)
assert.deepEqual(result.exportRejected,{flat:0,hilly:0,mountain:0,cobbled:0})
const messages=[]
await runPrivatePgHistoricalPilotV4({
 env,ClientConstructor:FakeClient,progress:r=>messages.push(r.phase),
 physicalRunner:async()=>({
  officialWrites:0,rawStageDataPublished:false,privatePathsPublished:false,
  consideredCompleteTriples:1})})
assert.deepEqual(messages,['METADATA_READY','EXPORTS_READY','PHYSICS_START'])
assert.equal(opened,2);assert.equal(closed,2);assert.equal(physics,1)
assert.equal(JSON.stringify(result).includes(env.PPM_V4_RESEARCH_DB_PASSWORD),false)
class Forbidden extends FakeClient{
 async query(sql,args){
  if(sql.includes('current_user AS db_user'))return{rows:[{
   db_user:'postgres',scoped_runs:true,scoped_entries:true,
   live_runs:true,live_entries:true,bypass_rls:true}]}
  return super.query(sql,args)
 }
}
await assert.rejects(()=>runPrivatePgHistoricalPilotV4({
 env,ClientConstructor:Forbidden}),/RESTRICTED_PG_ROLE_REQUIRED/)
assert.equal(closed,3)
// Synthetic full batch: the newest archive is unsynchronized, and nine
// fully mapped hilly records must be the exact private export set.
const nineStageIds=Array.from({length:9},(_,i)=>u(200+i))
class HillyClient extends FakeClient{
 async query(sql,args){
  if(sql.includes('ORDER BY r.completed_at DESC'))return {rows:[
   {stage_id:u(299),terrain:'hilly',stage_format:'road_race',
    completed_at:'2026-10-25T05:00:00Z',saved_replay_synchronized:false,
    team_count:2,first_entry_mappable:true,all_entries_mapped:true},
   ...nineStageIds.map((id,i)=>({stage_id:id,terrain:'hilly',stage_format:'road_race',
    completed_at:new Date(Date.UTC(2026,9,25,4,59-i)).toISOString(),
    saved_replay_synchronized:true,team_count:2,
    first_entry_mappable:true,all_entries_mapped:true}))]}
  if(sql.includes('WHERE stage_id=$1')){
   const id=args[0]
   assert.ok(nineStageIds.includes(id))
   const copy=structuredClone(run)
   copy.stage_id=id
   copy.input_snapshot_json.stage.stageId=id
   copy.input_snapshot_json.stage.terrainType='hilly'
   return {rows:[copy]}
  }
  return super.query(sql,args)
 }
}
let focusedPhysicsCalls=0
const nine=await runPrivatePgHistoricalPilotV4({
 env:{...env,PPM_V4_RESEARCH_COHORT:'hilly_latest_nine'},
 ClientConstructor:HillyClient,
 physicalRunner:async manifest=>{
  focusedPhysicsCalls++
  const paths=JSON.parse(readFileSync(manifest,'utf8')).privateEnvelopePaths
  assert.equal(paths.length,9)
  const exports=paths.map(path=>JSON.parse(readFileSync(path,'utf8')))
  assert.deepEqual(exports.map(x=>x.input_snapshot_json.stage.stageId),nineStageIds)
  assert.ok(exports.every(x=>x.input_snapshot_json.stage.terrainType==='hilly'))
  return {officialWrites:0,rawStageDataPublished:false,
   privatePathsPublished:false,consideredCompleteTriples:9}
 }
})
assert.equal(focusedPhysicsCalls,1)
assert.deepEqual(nine.attempted,{flat:0,hilly:9,mountain:0,cobbled:0})
assert.deepEqual(nine.accepted,{flat:0,hilly:9,mountain:0,cobbled:0})
assert.equal(nine.preflight.hilly.unsynchronized,1)
assert.equal(nine.preflight.hilly.passed,9)
assert.equal(nine.consideredCompleteTriples,9)
assert.equal(nine.officialWrites,0)
assert.equal(opened,4);assert.equal(closed,4)
// Opt-in can only use verified metadata. It must pass the explicit request to
// the private worker; no inline snapshot or identifier enters the public report.
let candidateCalls=0
const withCandidate=await runPrivatePgHistoricalPilotV4({
 env:{...env,PPM_V4_RESEARCH_CHASE_PRIORITY:'1'},
 ClientConstructor:FakeClient,
 physicalRunner:async (manifest,options)=>{
  candidateCalls++
  assert.deepEqual(options,{includeChasePriority:true})
  const paths=JSON.parse(readFileSync(manifest,'utf8')).privateEnvelopePaths
  assert.equal(paths.length,1)
  return {officialWrites:0,rawStageDataPublished:false,privatePathsPublished:false,
   consideredCompleteTriples:1,chasePriorityResearch:{
    status:'PRIVATE_RESEARCH_DIAGNOSTIC_NOT_REALISM_APPROVAL',
    enabledByExplicitOption:true,officialWrites:0,rawStageDataPublished:false,
    attemptedPrivateCandidateRuns:1,all:{compared:1}}}
 }})
assert.equal(candidateCalls,1)
assert.equal(withCandidate.chasePriorityResearch.all.compared,1)
assert.equal(withCandidate.preflight.flat.passed,1)
assert.equal(withCandidate.historicalV4RealismApproved,false)
await assert.rejects(()=>runPrivatePgHistoricalPilotV4({
 env:{...env,PPM_V4_RESEARCH_CHASE_PRIORITY:'all'},
 ClientConstructor:FakeClient}),/INVALID_PRIVATE_CANDIDATE_OPTION/)
await assert.rejects(()=>runPrivatePgHistoricalPilotV4({
 env:{...env,PPM_V4_RESEARCH_CHASE_PRIORITY:'1'},
 ClientConstructor:FakeClient,
 physicalRunner:async()=>({officialWrites:0,rawStageDataPublished:false,
  privatePathsPublished:false,consideredCompleteTriples:1})
}),/UNTRUSTED_PRIVATE_CHASE_PRIORITY_REPORT/)
assert.equal(opened,6);assert.equal(closed,6)

// Read-only 12-stage privacy/selection test: 4 flat + 4 hilly + 4 mountain,
// with three newer non-synchronized records deliberately excluded.
const stages=Array.from({length:12},(_,i)=>({
 stageId:u(400+i),terrain:['flat','hilly','mountain'][i%3]}))
class TwelveClient extends FakeClient{
 async query(sql,args){
  if(sql.includes('ORDER BY r.completed_at DESC')){
   const wrong=['flat','hilly','mountain'].map((terrain,i)=>({
    stage_id:u(500+i),terrain,stage_format:'road_race',
    completed_at:'2026-10-30T12:00:00Z',
    saved_replay_synchronized:false,team_count:2,
    first_entry_mappable:true,all_entries_mapped:true}))
   return {rows:[...wrong,...stages.map(({stageId,terrain},i)=>({
    stage_id:stageId,terrain,stage_format:'road_race',
    completed_at:new Date(Date.UTC(2026,9,29,23,59-i)).toISOString(),
    saved_replay_synchronized:true,team_count:2,
    first_entry_mappable:true,all_entries_mapped:true}))]}
  }
  if(sql.includes('WHERE stage_id=$1')){
   const match=stages.find(s=>s.stageId===args[0])
   assert(match,'Only selected synchronized stage may be exported')
   const copy=structuredClone(run)
   copy.stage_id=match.stageId
   copy.input_snapshot_json.stage.stageId=match.stageId
   copy.input_snapshot_json.stage.terrainType=match.terrain
   return {rows:[copy]}
  }
  return super.query(sql,args)
 }
}
const cohortEnv={...env,PPM_V4_RESEARCH_CHASE_PRIORITY:'1',
 PPM_V4_RESEARCH_COHORT:'chase_priority_12'}
const makeReport=(manifest,{includeChasePriority},compared)=>{
 assert.equal(includeChasePriority,true)
 const paths=JSON.parse(readFileSync(manifest,'utf8')).privateEnvelopePaths
 assert.equal(paths.length,12)
 const exported=paths.map(path=>JSON.parse(readFileSync(path,'utf8')))
 const terrainCounts=Object.fromEntries(['flat','hilly','mountain'].map(t=>
  [t,exported.filter(v=>v.input_snapshot_json.stage.terrainType===t).length]))
 assert.deepEqual(terrainCounts,{flat:4,hilly:4,mountain:4})
 assert(exported.every(v=>stages.some(s=>s.stageId===v.input_snapshot_json.stage.stageId)))
 return {officialWrites:0,rawStageDataPublished:false,
  privatePathsPublished:false,consideredCompleteTriples:compared,
  chasePriorityResearch:{
   status:'PRIVATE_RESEARCH_DIAGNOSTIC_NOT_REALISM_APPROVAL',
   enabledByExplicitOption:true,officialWrites:0,rawStageDataPublished:false,
   attemptedPrivateCandidateRuns:12,all:{compared}}}
}
let countRuns=0
const twelve=await runPrivatePgHistoricalPilotV4({
 env:cohortEnv,ClientConstructor:TwelveClient,
 physicalRunner:async(m,o)=>{countRuns++;return makeReport(m,o,12)}})
assert.equal(countRuns,1)
assert.deepEqual(twelve.accepted,{flat:4,hilly:4,mountain:4,cobbled:0})
assert.deepEqual(twelve.attempted,{flat:4,hilly:4,mountain:4,cobbled:0})
assert.equal(twelve.preflight.flat.unsynchronized,1)
assert.equal(twelve.preflight.hilly.unsynchronized,1)
assert.equal(twelve.preflight.mountain.unsynchronized,1)
assert.equal(twelve.chasePriority12.status,'READY_FOR_HISTORICAL_REALISM_REVIEW')
assert.equal(twelve.chasePriority12.strictHistoricalPairs,12)
assert.equal(twelve.chasePriority12.productionReady,false)
const compact=summarizePrivateHistoricalPilotV4({
 ...twelve,
 rejected:{...twelve.rejected,baselineUnsupported:4,baselineInvalid:5,baselineHistoricMismatch:1,
  safeReplayIssueCodesByVariant:{preserved_v2:{
    pre_finish_status_mismatch:5,PRIVATE_STAGE_ID:'secret-should-not-leak'
   }},byTerrain:{flat:{eligible:1},hilly:{eligible:0},mountain:{eligible:1}}},
 chasePriorityResearch:{all:{compared:2,medianObservedPeakDifferenceSeconds:0,
  changedClassification:0,changedWinner:0}}
})
assert.equal(compact.status,'READY_FOR_HISTORICAL_REALISM_REVIEW')
assert.equal(compact.strictPairs,12)
assert.deepEqual(compact.pairedByTerrain,{flat:1,hilly:0,mountain:1})
assert.deepEqual(compact.exclusions.otherReplayIssues,{pre_finish_status_mismatch:5})
assert.deepEqual(compact.exclusions.postCatchFirstTransferTypes,{})
assert.deepEqual(compact.exclusions.postCatchFirstCheckpointPeriods,{})
assert.equal(compact.chasePriority.compared,2)
assert.equal(JSON.stringify(compact).includes('secret-should-not-leak'),false)
assert.equal(JSON.stringify(compact).includes('PRIVATE_STAGE_ID'),false)
assert.equal(compact.officialWrites,0)
assert.equal(twelve.chasePriority12.sourceRevisionHistoricallyAttested,false)
assert.equal(twelve.officialWrites,0)
const incomplete=await runPrivatePgHistoricalPilotV4({
 env:cohortEnv,ClientConstructor:TwelveClient,
 physicalRunner:async(m,o)=>makeReport(m,o,7)})
assert.equal(incomplete.chasePriority12.status,'STRICT_HISTORICAL_PAIRS_INCOMPLETE')
assert.equal(incomplete.chasePriority12.strictHistoricalPairs,7)
assert.equal(incomplete.chasePriority12.productionReady,false)
await assert.rejects(()=>runPrivatePgHistoricalPilotV4({
 env:{...cohortEnv,PPM_V4_RESEARCH_CHASE_PRIORITY:'0'},
 ClientConstructor:TwelveClient}),/CHASING_COHORT_REQUIRES_PRIORITY_OPT_IN/)
const replayProbe=await runPrivatePgHistoricalPilotV4({
 env:{...cohortEnv,PPM_V4_RESEARCH_REPLAY_CANDIDATE:'1'},
 ClientConstructor:TwelveClient,
 physicalRunner:async(m,o)=>{
  assert.equal(o.includeChasePriority,true)
  assert.equal(o.includeReplayCandidate,true)
  const normal=makeReport(m,o,2)
  return {...normal,
  rejected:{safeReplayIssueCodesByVariant:{private_replay_candidate:{
    post_catch_group_transfer_without_physical_transition:4,
    PRIVATE_STAGE_ID:'should-never-show'}},
   postCatchTransferClassesByVariant:{private_replay_candidate:{
    C_TO_P:2,P_TO_C:2,PRIVATE_RIDER_NAME:123}},
   postCatchPeriodsByVariant:{private_replay_candidate:{
    MIDDLE_35_70_PERCENT:4,PRIVATE_CHECKPOINT:7}},
   postCatchForensicPhasesByVariant:{private_replay_candidate:{
    SAME_PHASE:4,PRIVATE_PHASE:7}},
   postCatchForensicGapsByVariant:{private_replay_candidate:{
    SEPARATED:4,PRIVATE_GAP:5}}},
  replayCandidateResearch:{
   status:'ISOLATED_REPLAY_REPAIR_DIAGNOSTIC_NOT_HISTORIC_APPROVAL',
   attempted:12,strictReplayValid:7,rejectedInvalid:1,rejectedUnsupported:4,
   recoveredStrictFromUnmodifiedBaseline:5,
   recoveredWithArchivedClassificationParity:4,
   recoveredByTerrain:{flat:1,hilly:4,mountain:0},
   officialWrites:0,researchOnly:true,historicalV4RealismApproved:false
  }}
 }
})
assert.equal(replayProbe.consideredCompleteTriples,2)
assert.equal(replayProbe.replayCandidateResearch.recoveredStrictFromUnmodifiedBaseline,5)
const replayCompact=summarizePrivateHistoricalPilotV4(replayProbe)
assert.equal(replayCompact.strictPairs,2)
assert.equal(replayCompact.replayRepairCandidate.recoveredStrictFromBaseline,5)
assert.equal(replayCompact.replayRepairCandidate.recoveredAndArchivedParity,4)
assert.equal(replayCompact.replayRepairCandidate.approved,false)
assert.deepEqual(replayCompact.replayRepairCandidate.remainingReplayIssues,
 {post_catch_group_transfer_without_physical_transition:4})
assert.deepEqual(replayCompact.replayRepairCandidate.remainingFirstTransferTypes,
 {C_TO_P:2,P_TO_C:2})
assert.deepEqual(replayCompact.replayRepairCandidate.remainingFirstCheckpointPeriods,
 {MIDDLE_35_70_PERCENT:4})
assert.deepEqual(replayCompact.replayRepairCandidate.remainingFirstPhaseRelation,
 {SAME_PHASE:4})
assert.deepEqual(replayCompact.replayRepairCandidate.remainingFirstChaseGapBand,
 {SEPARATED:4})
assert.equal(JSON.stringify(replayCompact).includes('PRIVATE_'),false)
assert.equal(JSON.stringify(replayCompact).includes('should-never-show'),false)
assert.equal(opened,9);assert.equal(closed,9)
// Fail closed if the authenticated session is a privileged or unexpected login.
class WrongLogin extends FakeClient{
 async query(sql,args){
  if(sql==='SELECT session_user AS login_user,current_user AS active_user')
   return {rows:[{login_user:'postgres',active_user:'postgres'}]}
  return super.query(sql,args)
 }
}
await assert.rejects(()=>runPrivatePgHistoricalPilotV4({
 env,ClientConstructor:WrongLogin}),/RESTRICTED_LOGIN_ROLE_REQUIRED/)
class SetRoleDenied extends FakeClient{
 async query(sql,args){
  if(sql==='SET ROLE v4_historical_research_reader')
   throw Error('Role not granted (synthetic)')
  return super.query(sql,args)
 }
}
await assert.rejects(()=>runPrivatePgHistoricalPilotV4({
 env,ClientConstructor:SetRoleDenied}),/Role not granted/)
assert.equal(opened,11);assert.equal(closed,11)
console.log('V4_PRIVATE_PG_READONLY_RESEARCH_UNIT '+JSON.stringify({
 status:'PASS',syntheticOnly:true,cases:56,sessionRoleActivationVerified:true,
 optionalCandidateVerified:true,strictTwelveCohortVerified:true,officialWrites:0}))
