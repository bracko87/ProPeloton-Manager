import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {
 buildV4AdminReadOnlySql,classifyV4AdminExport,
 runV4AdminReadOnlyExport
} from './adminReadOnlyStageExportV4.mjs'

const raceId='22222222-2222-4222-8222-222222222222'
const stageId='11111111-1111-4111-8111-111111111111'
const clubs=[
 '33333333-3333-4333-8333-333333333333',
 '44444444-4444-4444-8444-444444444444'
]
const entries=[
 '55555555-5555-4555-8555-555555555555',
 '66666666-6666-4666-8666-666666666666'
]
const start='2000-10-21T10:00:00.000Z'
const cutoff='2000-10-21T07:00:00.000Z'
const now='2000-10-21T07:01:00.000Z'
function fixture(){
 const stage={id:stageId,race_id:raceId,
  stage_format:'road_race',terrain_type:'hilly',
  stage_date:'2000-10-21',
  planned_start_hour_number:10,planned_start_minute:0
 }
 const participantTeams=clubs.map((club,i)=>({
  race_team_entry_id:entries[i],race_id:raceId,
  club_id:club,participating_club_id:club,
  status:'accepted',is_ai_filler:i===1,entry_source:i?'ai_fill':'human'
 }))
 const lockedPlanRows=clubs.map((club,i)=>({
  race_id:raceId,stage_id:stageId,status:'locked',
  locked_at:'2026-11-05T16:30:00Z',team_id:club,
  engine_stage_payload_json:{
   stage_id:stageId,race_id:raceId,club_id:club,
   stage_start_game_ts:start,lock_game_ts:cutoff,
   built_at_game_ts:now,immutable:true,
   snapshot_schema_version:'race_engine_stage_plan_input_snapshot_v1',
   snapshot_hash:(i?'b':'a').repeat(32),
   source_hashes:{stage:'private-snapshot-source'}
  },
  metadata:{engine_stage_payload_snapshot_hash:(i?'b':'a').repeat(32)}
 }))
 const sources={
  race:{id:raceId},stage,profile:{distance_km:100},
  stagePoints:[],
  participantTeams,
  participantRiders:[
   {rider_id:'private-rider-0',team_id:clubs[0]},
   {rider_id:'private-rider-1',team_id:clubs[1]}
  ],
  riderInputRows:[
   {rider_id:'private-rider-0',team_id:clubs[0]},
   {rider_id:'private-rider-1',team_id:clubs[1]}
  ],
  phaseCommandRows:[
   {rider_id:'private-rider-0',team_id:clubs[0]},
   {rider_id:'private-rider-1',team_id:clubs[1]}
  ],
  lockedPlanRows,phase9Payload:{},preStageLeaders:[],preStageStandings:[]
 }
 const input={
  race:{raceId},
  stage:{stageId,stageFormat:'road_race',terrainType:'hilly'},
  teams:clubs.map((club,i)=>({
   teamId:club,raceTeamEntryId:entries[i],participatingClubId:club,
   snapshot:{metadata:{scenarioAiControlled:i===1}}
  })),
  stagePlans:clubs.map((club,i)=>({
   teamId:club,status:'locked',locked:true,
   riders:[{riderId:'private-rider-'+i,commands:{
    phase1:'follow_team_plan',phase2:'follow_team_plan',
    phase3:'follow_team_plan',phase4:'final_sprint'
   }}]
  })),
  riders:[
   {riderId:'private-rider-0'},
   {riderId:'private-rider-1'}
  ]
 }
 const capture={
  contract:'ppm.v4.admin-readonly-sql-export.v1',
  status:'V4_LOCKED_RESEARCH_SOURCE_EXPORTED',
  reader:'v4_live_shadow_read_login',
  transaction_read_only:'on',
  bundle:{
   sourceKind:'read_only_lock_window_capture',
   activeRole:'v4_live_shadow_read_login',
   authenticatedRole:'postgres',
   transactionReadOnly:'on',gameNow:now,
   stageStartGameTs:start,lockCutoffGameTs:cutoff,sources
  }
 }
 return {capture,input}
}
test('query contains strict read-only transaction, role switch and one UUID',()=>{
 const sql=buildV4AdminReadOnlySql(stageId)
 assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/)
 assert.match(sql,/SET LOCAL ROLE v4_live_shadow_read_login;/)
 assert.match(sql,/ROLLBACK;\s*$/)
 assert.match(sql,/V4_LOCKED_RESEARCH_SOURCE_NOT_ELIGIBLE/)
 assert.match(sql,/ELSE NULL END/)
 assert(sql.includes(stageId))
 assert(!sql.includes('__STAGE_ID_UUID__'))
 assert.doesNotMatch(sql,/universal_race_stage_get_calculation_payload/)
 assert.doesNotMatch(sql,/universal_race_stage_force_mandatory_jersey/)
 assert.doesNotMatch(sql,/sync_race_stage_points_from_stage_json/)
 assert.doesNotMatch(sql,/(^|\n)\s*(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\s/im)
 assert.throws(()=>buildV4AdminReadOnlySql("invalid'); DROP TABLE x"))
})
test('unqualified report never passes through or leaks private input',()=>{
 const {capture}=fixture()
 const blocked={...capture,status:'V4_LOCKED_RESEARCH_SOURCE_NOT_ELIGIBLE',
  bundle:null}
 const summary=classifyV4AdminExport(blocked)
 assert.equal(summary.status,'V4_NO_VERIFIED_LOCKED_SOURCE')
 assert.equal(summary.productionEnabled,false)
 assert.equal(summary.officialWrites,0)
 assert.equal(summary.realShadowExecuted,false)
 assert.doesNotMatch(JSON.stringify(summary),/private-rider|stageId|teamId|raceId/i)
})
test('source tampering and missing proofs are rejected before engine executes',async()=>{
 const {capture,input}=fixture()
 const cases=[
  x=>{x.reader='postgres'},
  x=>{x.transaction_read_only='off'},
  x=>{x.bundle.transactionReadOnly='off'},
  x=>{x.bundle.activeRole='postgres'},
  x=>{x.bundle.sourceKind='completed_simulation_run'},
  x=>{x.bundle.gameNow='2000-10-21T07:05:01.000Z'},
  x=>{x.bundle.sources.stage.terrain_type='unknown'},
  x=>{x.bundle.sources.stage.race_id=stageId},
  x=>{x.bundle.sources.lockedPlanRows[0].status='submitted'},
  x=>{x.bundle.sources.phaseCommandRows=[]},
  x=>{x.bundle.sources.participantTeams=[]}
 ]
 for(const change of cases){
  const c=structuredClone(capture);change(c)
  let invoked=false
  await assert.rejects(()=>runV4AdminReadOnlyExport(c,{
   inputBuilder:async()=>{invoked=true;return input}
  }))
  if(c.bundle?.sources?.phaseCommandRows?.length!==0&&
     c.bundle?.sources?.participantTeams?.length!==0)
   assert.equal(invoked,false)
 }
})
test('real-style locked synthetic input reaches the isolated runner, returns only categories, deletes file',async()=>{
 const {capture,input}=fixture()
 let path
 const result=await runV4AdminReadOnlyExport(capture,{
  inputBuilder:async sources=>{
   assert.equal(sources.riderInputRows.length,2)
   assert(sources.deterministicSeed.startsWith('v4:admin-readonly:'))
   return input
  },
  shadowRunner:async privatePath=>{
   path=privatePath
   const envelope=JSON.parse(readFileSync(privatePath,'utf8'))
   assert.equal(envelope.input.stage.stageId,stageId)
   assert.deepEqual(envelope.options.teamControl,[
    {teamId:clubs[0],kind:'human'},
    {teamId:clubs[1],kind:'ai'}
   ])
   return {status:'SHADOW_STRICT_REPLAY_PASS',
    replayQuality:'full',officialWrites:0,productionEnabled:false}
  }
 })
 assert.equal(existsSync(path),false)
 assert.equal(result.realShadowExecuted,true)
 assert.equal(result.strictReplayPassed,true)
 assert.equal(result.immutableProductionSourceVerified,false)
 assert.equal(result.productionParityVerified,false)
 assert.equal(result.officialWrites,0)
 assert.equal(result.productionEnabled,false)
 assert.doesNotMatch(JSON.stringify(result),/private-rider|stageId|raceId|teamId|input/i)
})
test('engine error does not retain private local data',async()=>{
 const {capture,input}=fixture()
 let path
 await assert.rejects(()=>runV4AdminReadOnlyExport(capture,{
  inputBuilder:async()=>input,
  shadowRunner:async x=>{path=x;throw Error('private data from stage')}
 }))
 assert.equal(existsSync(path),false)
})
