import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {
 auditV4RealLockedStageEvidence,prepareV4RealLockedShadowEnvelope,
 V4_REAL_LOCK_PROOF_CONTRACT
} from './realLockedStageEvidenceV4.mjs'

const race='22222222-2222-4222-8222-222222222222'
const stage='11111111-1111-4111-8111-111111111111'
const teams=[
 {id:'team-a',club:'33333333-3333-4333-8333-333333333333',
  entry:'55555555-5555-4555-8555-555555555555'},
 {id:'team-b',club:'44444444-4444-4444-8444-444444444444',
  entry:'66666666-6666-4666-8666-666666666666'}
]
const start='2000-11-06T12:00:00.000Z'
const cutoff='2000-11-06T09:00:00.000Z'
const captured='2000-11-06T09:01:00.000Z'
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
function fixture(){
 const input={
  race:{raceId:race},
  stage:{stageId:stage,stageFormat:'road_race',terrainType:'hilly'},
  teams:teams.map(t=>({
   teamId:t.id,raceTeamEntryId:t.entry,participatingClubId:t.club,
   snapshot:{metadata:{scenarioAiControlled:t.id==='team-b'}}
  })),
  stagePlans:teams.map(t=>({
   teamId:t.id,status:'locked',locked:true,
   riders:[{riderId:'private-rider-'+t.id,commands:{
    phase1:'follow_team_plan',phase2:'control_tempo',
    phase3:'chase_breakaway',phase4:'final_sprint'
   }}]
  })),
  riders:[{riderId:'private-rider-team-a'},{riderId:'private-rider-team-b'}]
 }
 const lockedPlans=teams.map((t,i)=>({
  stage_id:stage,race_id:race,status:'locked',
  locked_at:'2026-11-05T08:00:00.000Z',
  engine_stage_payload_json:{
   immutable:true,stage_id:stage,race_id:race,club_id:t.club,
   snapshot_schema_version:'race_engine_stage_plan_input_snapshot_v1',
   snapshot_hash:(i?'b':'a').repeat(32),
   source_hashes:{stage:'private-evidence'},
   stage_start_game_ts:start,lock_game_ts:cutoff,
   built_at_game_ts:captured
  },
  metadata:{engine_stage_payload_snapshot_hash:(i?'b':'a').repeat(32)}
 }))
 const authoritativeEntries=teams.map((t,i)=>({
  race_team_entry_id:t.entry,race_id:race,participating_club_id:t.club,
  is_ai_filler:i===1,entry_source:i===1?'ai_fill':'human'
 }))
 const completeLockSnapshot={
  sourceKind:'immutable_full_stage_lock',status:'locked',immutable:true,
  stageId:stage,raceId:race,
  snapshotId:'77777777-7777-4777-8777-777777777777',
  stageStartGameTs:start,lockCutoffGameTs:cutoff,
  snapshotGameTs:captured,inputSha256:sha(input),input
 }
 return {stage:{stageId:stage,raceId:race,
  stageFormat:'road_race',terrainType:'hilly',stageStartGameTs:start},
  lockedPlans,authoritativeEntries,completeLockSnapshot}
}
test('locked plan evidence WITHOUT full immutable race input does NOT qualify',()=>{
 const evidence=fixture()
 delete evidence.completeLockSnapshot
 const report=auditV4RealLockedStageEvidence(evidence)
 assert.equal(report.status,'V4_FULL_STAGE_LOCKED_INPUT_MISSING')
 assert.equal(report.lockedPlans,2)
 assert.equal(report.officialWrites,0)
 assert.equal(report.productionEnabled,false)
 assert.equal(report.realShadowExecuted,false)
 assert.throws(()=>prepareV4RealLockedShadowEnvelope(evidence))
 assert.doesNotMatch(JSON.stringify(report),/private|stageId|raceId|snapshotId|team-a|team-b/i)
})
test('valid synthetic evidence is only an offline input candidate, NOT a replay pass',()=>{
 const evidence=fixture()
 const out=auditV4RealLockedStageEvidence(evidence)
 assert.deepEqual(out,{
  contract:V4_REAL_LOCK_PROOF_CONTRACT,
  status:'V4_REAL_INPUT_CANDIDATE_ONLY',researchOnly:true,
  officialWrites:0,productionEnabled:false,strictReplayPassed:false,
  realShadowExecuted:false,lockedPlans:2,humanTeams:1,aiTeams:1
 })
 const envelope=prepareV4RealLockedShadowEnvelope(evidence)
 assert.equal(envelope.input,evidence.completeLockSnapshot.input)
 assert.equal(envelope.options.lock.snapshotStatus,'locked')
 assert.equal(envelope.options.lock.lockCutoffGameTs,cutoff)
 assert.deepEqual(envelope.options.teamControl,[
  {teamId:'team-a',kind:'human'},{teamId:'team-b',kind:'ai'}
 ])
 assert.doesNotMatch(JSON.stringify(out),/private|team-a|raceId|stageId|snapshotId/i)
})
test('completed run and self-asserted lock without trusted immutable source are rejected',()=>{
 const e=fixture()
 e.completeLockSnapshot.sourceKind='completed_simulation_run'
 assert.equal(auditV4RealLockedStageEvidence(e).status,
  'V4_FULL_STAGE_LOCK_PROVENANCE_REJECTED')
 e.completeLockSnapshot.sourceKind='immutable_full_stage_lock'
 e.completeLockSnapshot.snapshotGameTs='2000-11-06T08:59:00.000Z'
 assert.equal(auditV4RealLockedStageEvidence(e).status,
  'V4_FULL_STAGE_LOCK_PROVENANCE_REJECTED')
})
test('lock proof fails closed for stale timestamps, wrong digest, duplicate evidence and mutation',()=>{
 const cases=[
  e=>{e.lockedPlans[0].engine_stage_payload_json.immutable=false},
  e=>{e.lockedPlans[0].engine_stage_payload_json.lock_game_ts='2000-11-06T08:00:00Z'},
  e=>{e.lockedPlans[0].engine_stage_payload_json.built_at_game_ts='2000-11-06T08:59:59Z'},
  e=>{e.lockedPlans[0].metadata.engine_stage_payload_snapshot_hash='fake'},
  e=>{e.lockedPlans.push(structuredClone(e.lockedPlans[0]))},
  e=>{e.lockedPlans[0].engine_stage_payload_json.source_hashes={}},
  e=>{e.authoritativeEntries[0].race_id='wrong'},
  e=>{e.authoritativeEntries.push(structuredClone(e.authoritativeEntries[0]))}
 ]
 for(const modify of cases){
  const e=fixture();modify(e)
  const result=auditV4RealLockedStageEvidence(e)
  assert.equal(result.status,'V4_LOCK_PROOF_REJECTED')
 }
 const e=fixture()
 e.completeLockSnapshot.input.teams[0].teamId='private-rider-corruption'
 assert.equal(auditV4RealLockedStageEvidence(e).status,
  'V4_FULL_STAGE_LOCKED_INPUT_REJECTED')
})
test('team input and authoritative AI ownership cannot be invented or silently swapped',()=>{
 const cases=[
  e=>{e.completeLockSnapshot.input.teams[0].raceTeamEntryId=teams[1].entry},
  e=>{e.completeLockSnapshot.input.teams[0].participatingClubId=teams[1].club},
  e=>{e.completeLockSnapshot.input.stagePlans[0].locked=false},
  e=>{e.authoritativeEntries[1].is_ai_filler=false;e.authoritativeEntries[1].entry_source='human'}
 ]
 for(const mutate of cases){
  const e=fixture();mutate(e)
  e.completeLockSnapshot.inputSha256=sha(e.completeLockSnapshot.input)
  const out=auditV4RealLockedStageEvidence(e)
  assert.equal(out.status,'V4_INPUT_TEAM_OWNERSHIP_REJECTED')
  assert.equal(out.officialWrites,0)
 }
})
