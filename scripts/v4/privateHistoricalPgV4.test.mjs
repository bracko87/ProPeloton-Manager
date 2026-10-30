import assert from 'node:assert/strict'
import {runPrivatePgHistoricalPilotV4,privatePgConfig} from './privateHistoricalPgV4.mjs'
import {readFileSync} from 'node:fs'
const env={PPM_V4_RESEARCH_DB_HOST:'aws-0-eu-central-1.pooler.supabase.com',
 PPM_V4_RESEARCH_DB_PASSWORD:'only-a-synthetic-test-password-12345'}
const cfg=privatePgConfig(env)
assert.equal(cfg.user,'v4_historical_research_reader.okuravitxocyevkexfgi')
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
  if(sql.includes('current_user AS db_user'))return{rows:[{
   db_user:'v4_historical_research_reader',scoped_runs:true,scoped_entries:true,
   live_runs:false,live_entries:false,bypass_rls:false}]}
  if(sql.includes('ORDER BY completed_at DESC'))
   return{rows:[{stage_id:stage,terrain:'flat',stage_format:'road_race',
    completed_at:'2026-10-25T00:00:00Z'}]}
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
   privatePathsPublished:false,consideredCompleteTriples:1}
 }})
assert.equal(result.consideredCompleteTriples,1)
assert.equal(opened,1);assert.equal(closed,1);assert.equal(physics,1)
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
assert.equal(closed,2)
console.log('V4_PRIVATE_PG_READONLY_RESEARCH_UNIT '+JSON.stringify({
 status:'PASS',syntheticOnly:true,cases:16,officialWrites:0}))
