import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {
 privateCaptureDbConfig,V4_CAPTURE_QUERIES,
 captureReadOnlyLockedStageV4,runPrivateReadOnlyLockShadowV4
} from './privateReadOnlyLockedCaptureV4.mjs'

const stageId='11111111-1111-4111-8111-111111111111'
const raceId='22222222-2222-4222-8222-222222222222'
const clubs=[
 '33333333-3333-4333-8333-333333333333',
 '44444444-4444-4444-8444-444444444444'
]
const entries=[
 '55555555-5555-4555-8555-555555555555',
 '66666666-6666-4666-8666-666666666666'
]
const env={
 PPM_V4_CAPTURE_DB_HOST:'aws-0-eu-central-1.pooler.supabase.com',
 PPM_V4_CAPTURE_DB_PASSWORD:'fake-test-only-credential-12345678901234567890'
}
const start='2000-10-21T10:00:00.000Z'
const lock='2000-10-21T07:00:00.000Z'
const capture='2000-10-21T07:01:00.000Z'
const entriesRows=clubs.map((club,i)=>({
 race_team_entry_id:entries[i],race_id:raceId,club_id:club,
 participating_club_id:club,entry_source:i?'ai_fill':'human',
 is_ai_filler:i===1,status:'accepted'
}))
const plans=clubs.map((club,i)=>({
 id:'77777777-7777-4777-8777-77777777777'+i,
 race_id:raceId,stage_id:stageId,
 status:'locked',locked_at:'2026-11-05T15:00:00Z',
 metadata:{engine_stage_payload_snapshot_hash:(i?'b':'a').repeat(32)},
 engine_stage_payload_json:{
  immutable:true,club_id:club,stage_id:stageId,race_id:raceId,
  snapshot_schema_version:'race_engine_stage_plan_input_snapshot_v1',
  snapshot_hash:(i?'b':'a').repeat(32),
  source_hashes:{stage:'private-hash'},
  stage_start_game_ts:start,lock_game_ts:lock,built_at_game_ts:capture
 }
}))
const input={
 race:{raceId},stage:{stageId,stageFormat:'road_race',terrainType:'hilly'},
 teams:clubs.map((club,i)=>({
  teamId:club,raceTeamEntryId:entries[i],participatingClubId:club,
  snapshot:{metadata:{scenarioAiControlled:i===1}}
 })),
 stagePlans:clubs.map((club,i)=>({
  teamId:club,status:'locked',locked:true,
  riders:[{riderId:'private-rider-'+i,
   commands:{phase1:'follow_team_plan',phase2:'follow_team_plan',
    phase3:'follow_team_plan',phase4:'final_sprint'}}]
 })),
 riders:[{riderId:'private-rider-0'},{riderId:'private-rider-1'}]
}
const out={identity:{
 login_user:'v4_live_shadow_read_login',
 active_user:'v4_live_shadow_read_login',
 transaction_read_only:'on',rolsuper:false,rolbypassrls:false,
 rolcreatedb:false,rolcreaterole:false,can_insert_results:false,
 can_update_plans:false,can_publish:false
 },clock:{game_now:capture}}
function mockConnection(overrides={}){
 const calls=[],connections=[]
 class MockClient {
  constructor(conf){connections.push(conf)}
  async connect(){calls.push(['CONNECT'])}
  async end(){calls.push(['END'])}
  async query(sql,args=[]){
   calls.push([sql,args])
   if(sql.startsWith('BEGIN'))return {rows:[]}
   if(sql==='ROLLBACK')return {rows:[]}
   if(sql===V4_CAPTURE_QUERIES.identity)return {rows:[overrides.identity??out.identity]}
   if(sql===V4_CAPTURE_QUERIES.stable){
    return {rows:args[0].map(proname=>({proname,provolatile:'s'}))}
   }
   if(sql===V4_CAPTURE_QUERIES.clock)return {rows:[overrides.clock??out.clock]}
   if(sql===V4_CAPTURE_QUERIES.stage)return {rows:[{value:{
    id:stageId,race_id:raceId,stage_date:'2000-10-21',
    stage_number:1,stage_format:'road_race',
    planned_start_hour_number:10,planned_start_minute:0
   }}]}
   if(sql===V4_CAPTURE_QUERIES.race)return {rows:[{value:{id:raceId}}]}
   if(sql===V4_CAPTURE_QUERIES.entries)
    return {rows:(overrides.entries??entriesRows).map(value=>({value}))}
   if(sql===V4_CAPTURE_QUERIES.plans)
    return {rows:(overrides.plans??plans).map(value=>({value}))}
   if(sql===V4_CAPTURE_QUERIES.disqualifications)return {rows:[{n:0}]}
   if(sql===V4_CAPTURE_QUERIES.riders)
    return {rows:[{value:{rider_id:'private-rider-0'}},
     {value:{rider_id:'private-rider-1'}}]}
   if(sql===V4_CAPTURE_QUERIES.riderInputs)
    return {rows:[{value:{rider_id:'private-rider-0'}},
     {value:{rider_id:'private-rider-1'}}]}
   if(sql===V4_CAPTURE_QUERIES.phaseCommands)
    return {rows:[{value:{rider_id:'private-rider-0'}},
     {value:{rider_id:'private-rider-1'}}]}
   if(sql===V4_CAPTURE_QUERIES.points)return {rows:[]}
   if(sql===V4_CAPTURE_QUERIES.profile)return {rows:[{value:{distance_km:120}}]}
   if(sql===V4_CAPTURE_QUERIES.phase9)return {rows:[{value:{riderModifiers:[]}}]}
   if(sql===V4_CAPTURE_QUERIES.leaders)return {rows:[]}
   if(sql===V4_CAPTURE_QUERIES.standings)return {rows:[]}
   throw Error('Unexpected statement: '+sql)
  }
 }
 return {MockClient,calls,connections}
}
const builder=async sources=>{
 assert.equal(sources.riderInputRows.length,2)
 assert.equal(sources.participantTeams.length,2)
 assert.equal(sources.lockedPlanRows.length,2)
 assert(sources.deterministicSeed.startsWith('v4:read-only-lock:'))
 return structuredClone(input)
}

test('dedicated read-only role required and credentials never included in results',()=>{
 assert.equal(privateCaptureDbConfig(env).user,
  'v4_live_shadow_read_login.okuravitxocyevkexfgi')
 assert.throws(()=>privateCaptureDbConfig({...env,PPM_V4_CAPTURE_DB_PASSWORD:'short'}))
 assert.throws(()=>privateCaptureDbConfig({...env,PPM_V4_CAPTURE_DB_HOST:'fake.example.com'}))
 for(const sql of Object.values(V4_CAPTURE_QUERIES)){
  assert.match(sql,/^SELECT\s/)
  assert.doesNotMatch(sql,/universal_race_stage_get_calculation_payload/)
  assert.doesNotMatch(sql,/universal_race_stage_force_mandatory_jersey/)
  assert.doesNotMatch(sql,/sync_race_stage_points_from_stage_json/)
 }
})
test('safe locked snapshot becomes only real-data reconstruction research candidate',async()=>{
 const db=mockConnection()
 const x=await captureReadOnlyLockedStageV4({
  stageId,env,ClientConstructor:db.MockClient,inputBuilder:builder
 })
 assert.equal(x.summary.status,'V4_READ_ONLY_CAPTURE_RECONSTRUCTION_ONLY')
 assert.equal(x.summary.officialWrites,0)
 assert.equal(x.summary.realShadowExecuted,false)
 assert.equal(x.summary.productionParityVerified,false)
 assert.equal(x.summary.realLockEvidenceVerified,false)
 assert.deepEqual(x.envelope.options.teamControl,[
  {teamId:clubs[0],kind:'human'},{teamId:clubs[1],kind:'ai'}
 ])
 assert.equal(x.envelope.options.lock.snapshotStatus,'locked')
 assert.equal(x.envelope.options.lock.lockCutoffGameTs,lock)
 assert.equal(db.calls.filter(x=>x[0].startsWith('BEGIN')).length,1)
 assert.equal(db.calls.filter(x=>x[0]==='ROLLBACK').length,1)
 assert.equal(db.calls.at(-1)[0],'END')
 assert.doesNotMatch(JSON.stringify(x.summary),/private-rider|teamId|stageId|raceId|fake-test-only/)
})
test('a late game-time source or a role with write privileges is rejected before capture',async()=>{
 for(const override of [
  {clock:{game_now:'2000-10-21T07:08:00.000Z'}},
  {clock:{game_now:'2000-10-21T06:59:00.000Z'}},
  {identity:{...out.identity,can_publish:true}},
  {identity:{...out.identity,rolbypassrls:true}},
  {plans:[]}
 ]){
  const db=mockConnection(override)
  await assert.rejects(()=>captureReadOnlyLockedStageV4({
   stageId,env,ClientConstructor:db.MockClient,inputBuilder:builder
  }))
  assert.equal(db.calls.filter(x=>x[0]==='ROLLBACK').length,1)
  assert.equal(db.calls.at(-1)[0],'END')
 }
})
test('private race input stays temporary and only sanitized result leaves the runner',async()=>{
 const db=mockConnection()
 let privatePath
 const x=await runPrivateReadOnlyLockShadowV4({
  stageId,env,ClientConstructor:db.MockClient,inputBuilder:builder,
  shadowRunner:async path=>{
   privatePath=path
   const body=JSON.parse(readFileSync(path,'utf8'))
   assert.equal(body.input.stage.stageId,stageId)
   assert.equal(body.options.teamControl.length,2)
   return {status:'SHADOW_STRICT_REPLAY_PASS',
    replayQuality:'full',officialWrites:0,productionEnabled:false}
  }
 })
 assert.equal(x.strictReplayPassed,true)
 assert.equal(x.realShadowExecuted,true)
 assert.equal(x.productionParityVerified,false)
 assert.equal(x.realLockEvidenceVerified,false)
 assert.equal(x.officialWrites,0)
 assert.equal(existsSync(privatePath),false)
 assert.doesNotMatch(JSON.stringify(x),/private-rider|stageId|raceId|fake-test-only/)
})
test('mocked shadow failure cannot leave private race input on disk',async()=>{
 const db=mockConnection()
 let path
 await assert.rejects(()=>runPrivateReadOnlyLockShadowV4({
  stageId,env,ClientConstructor:db.MockClient,inputBuilder:builder,
  shadowRunner:async p=>{path=p;throw Error('private-details')}
 }),/private-details/)
 assert.equal(existsSync(path),false)
})
