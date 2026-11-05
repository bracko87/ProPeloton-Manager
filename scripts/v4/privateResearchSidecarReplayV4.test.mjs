import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import {
 buildV4PrivateSidecarSelect,verifyPrivateV4ResearchSource,
 replayPrivateV4ResearchSidecar
} from './privateResearchSidecarReplayV4.mjs'

const stageId='11111111-1111-4111-8111-111111111111'
const raceId='22222222-2222-4222-8222-222222222222'
const clubs=['33333333-3333-4333-8333-333333333333',
 '44444444-4444-4444-8444-444444444444']
const entries=['55555555-5555-4555-8555-555555555555',
 '66666666-6666-4666-8666-666666666666']
const start='2000-10-21T10:00:00.000Z'
const cutoff='2000-10-21T07:00:00.000Z'
const captured='2000-10-21T07:12:00.000Z'
const hash=s=>createHash('sha256').update(s).digest('hex')

function setup(){
 const source={
  sourceKind:'v4_research_capture_not_official_production_lock',
  sourceVersion:'v4_private_stage_source_v1',
  researchOnly:true,originalPlanStatusesPreserved:true,
  race:{id:raceId},
  stage:{id:stageId,race_id:raceId,stage_format:'road_race',
   terrain_type:'hilly',stage_date:'2000-10-21',
   planned_start_hour_number:10,planned_start_minute:0},
  profile:{distance_km:112},stagePoints:[],
  participantTeams:clubs.map((club,i)=>({
   race_team_entry_id:entries[i],club_id:club,
   participating_club_id:club,
   is_ai_filler:i===1,entry_source:i?'ai_fill':'human'
  })),
  participantRiders:clubs.map((club,i)=>({
   rider_id:'private-rider-'+i,team_id:club
  })),
  riderInputRows:clubs.map((club,i)=>({
   rider_id:'private-rider-'+i,team_id:club
  })),
  phaseCommandRows:clubs.map((club,i)=>({
   rider_id:'private-rider-'+i,team_id:club
  })),
  lockedPlanRows:[{team_id:clubs[0],status:'submitted'}],
  phase9Payload:{riderModifiers:[]},
  preStageLeaders:[],preStageStandings:[]
 }
 const json=JSON.stringify(source)
 const capture={
  contract:'ppm.v4.private-sidecar-research-export.v1',
  status:'V4_PRIVATE_RESEARCH_SIDECAR_EXPORTED',
  researchOnly:true,officialWrites:0,productionParityVerified:false,
  sourceKind:'v4_research_capture_not_official_production_lock',
  stageId,raceId,stageStartGameTs:start,
  lockCutoffGameTs:cutoff,capturedGameTs:captured,
  sourceSha256:hash(json),teamCount:2,riderCount:2,sourcePayloadText:json
 }
 const input={
  race:{raceId},stage:{stageId,stageFormat:'road_race',terrainType:'hilly'},
  teams:clubs.map((club,i)=>({
   teamId:club,participatingClubId:club,raceTeamEntryId:entries[i],
   snapshot:{metadata:{scenarioAiControlled:i===1}}
  })),
  stagePlans:clubs.map((club,i)=>({
   teamId:club,status:'locked',locked:true,
   riders:[{riderId:'private-rider-'+i,commands:{
    phase1:'follow_team_plan',phase2:'follow_team_plan',
    phase3:'follow_team_plan',phase4:'final_sprint'}}]
  })),
  riders:[{riderId:'private-rider-0'},{riderId:'private-rider-1'}]
 }
 return {capture,input,source}
}
test('admin query selects only private stage source in read-only transaction',()=>{
 const q=buildV4PrivateSidecarSelect(stageId)
 assert.match(q,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/)
 assert.match(q,/FROM private\.v4_research_locked_full_stage_sources_v1/)
 assert.match(q,/extensions\.digest\(convert_to\(source_payload::text,'UTF8'\)/)
 assert.match(q,/current_user='postgres' AND session_user='postgres'/)
 assert.match(q,/ROLLBACK;\s*$/)
 assert(!q.includes('__STAGE_ID_UUID__'))
 assert.doesNotMatch(q,/(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\s/im)
 assert.throws(()=>buildV4PrivateSidecarSelect("'); DROP TABLE race_stages"))
})
test('checksum, source timing, ownership and original statuses stay intact',()=>{
 const {capture}=setup()
 const v=verifyPrivateV4ResearchSource(capture)
 assert.equal(v.stageId,stageId)
 assert.equal(v.raceId,raceId)
 assert.equal(v.captured,captured)
 assert.equal(v.sources.lockedPlanRows[0].status,'submitted')
 assert.equal(v.sourceHash,capture.sourceSha256)
})
test('reject forged source status, tampering and invalid production claims',()=>{
 const {capture}=setup()
 const cases=[
  c=>{c.status='V4_PRIVATE_RESEARCH_SIDECAR_HASH_REJECTED'},
  c=>{c.officialWrites=1},
  c=>{c.researchOnly=false},
  c=>{c.productionParityVerified=true},
  c=>{c.sourcePayloadText+=' '},
  c=>{c.sourceSha256='a'.repeat(64)},
  c=>{c.capturedGameTs='2000-10-21T07:16:00.000Z'},
  c=>{c.lockCutoffGameTs='2000-10-21T06:00:00.000Z'},
  c=>{c.teamCount=3},
  c=>{c.sourceKind='immutable_full_stage_lock'}
 ]
 for(const change of cases){
  const c=structuredClone(capture);change(c)
  assert.throws(()=>verifyPrivateV4ResearchSource(c))
 }
})
test('source-level mismatches also fail even with a recomputed hash',()=>{
 const {capture,source}=setup()
 const cases=[
  s=>{s.stage.terrain_type='time_trial'},
  s=>{s.originalPlanStatusesPreserved=false},
  s=>{s.participantTeams[1].race_team_entry_id=entries[0]},
  s=>{s.riderInputRows[1].rider_id='private-rider-0'},
  s=>{s.phaseCommandRows=[]},
  s=>{s.stage.stage_date='2000-10-20'}
 ]
 for(const change of cases){
  const c=structuredClone(capture),s=structuredClone(source)
  change(s);c.sourcePayloadText=JSON.stringify(s)
  c.sourceSha256=hash(c.sourcePayloadText)
  assert.throws(()=>verifyPrivateV4ResearchSource(c))
 }
})
test('isolated research replay deletes the envelope and never approves production',async()=>{
 const {capture,input}=setup()
 let temp
 const report=await replayPrivateV4ResearchSidecar(capture,{
  inputBuilder:async source=>{
   assert(source.deterministicSeed.startsWith('v4:private-research-sidecar:'))
   assert.equal(source.lockedPlanRows[0].status,'submitted')
   return input
  },
  shadowRunner:async file=>{
   temp=file
   const body=JSON.parse(readFileSync(file,'utf8'))
   assert.equal(body.input.stage.stageId,stageId)
   assert.equal(body.options.lock.snapshotStatus,'locked')
   assert.equal(body.options.lock.snapshotGameTs,captured)
   assert.deepEqual(body.options.teamControl,[
    {teamId:clubs[0],kind:'human'},{teamId:clubs[1],kind:'ai'}
   ])
   return {status:'SHADOW_STRICT_REPLAY_PASS',
    replayQuality:'full',officialWrites:0,productionEnabled:false}
  }
 })
 assert.equal(existsSync(temp),false)
 assert.equal(report.strictReplayPassed,true)
 assert.equal(report.immutableResearchSnapshotVerified,true)
 assert.equal(report.originalProductionLockVerified,false)
 assert.equal(report.productionParityVerified,false)
 assert.equal(report.productionEnabled,false)
 assert.equal(report.officialWrites,0)
 assert.doesNotMatch(JSON.stringify(report),/private-rider|stageId|raceId|teamId/)
})
test('runner errors cannot strand private research envelope on disk',async()=>{
 const {capture,input}=setup()
 let path
 await assert.rejects(()=>replayPrivateV4ResearchSidecar(capture,{
  inputBuilder:async()=>input,
  shadowRunner:async x=>{path=x;throw Error('private-engine-error')}
 }))
 assert.equal(existsSync(path),false)
})
