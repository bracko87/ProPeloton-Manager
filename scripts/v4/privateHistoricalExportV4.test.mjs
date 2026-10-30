import assert from 'node:assert/strict'
import {readFileSync,statSync,rmSync} from 'node:fs'
import {dirname} from 'node:path'
import {preparePrivateHistoricalEnvelope,exportPrivateHistoricalStage} from './privateHistoricalExportV4.mjs'
const stageId='12345678-1234-4234-8234-1234567890ab'
const raceId='abcdabcd-1234-4234-8234-1234567890ab'
const entry1='11111111-1234-4234-8234-1234567890ab'
const entry2='22222222-1234-4234-8234-1234567890ab'
const team1='33333333-1234-4234-8234-1234567890ab'
const team2='44444444-1234-4234-8234-1234567890ab'
const teams=[
 {teamId:team1,raceTeamEntryId:entry1,snapshot:{metadata:{scenarioAiControlled:false}}},
 {teamId:team2,raceTeamEntryId:entry2,snapshot:{metadata:{scenarioAiControlled:true}}}]
const run={
 status:'completed',stage_id:stageId,race_id:raceId,
 input_snapshot_json:{
  race:{raceId},stage:{stageId,stageFormat:'road_race'},teams,
  riders:[{riderId:'r1'},{riderId:'r2'}],
  stagePlans:[{teamId:team1,status:'locked',locked:true},
    {teamId:team2,status:'locked',locked:true}]},
 result_summary_json:{stage_start_game_at:'2000-06-01T12:00:00',
  output_snapshot:{universalResult:{stageId,raceId,finishResolution:{classification:[{},{}]}}}}}
const entries=[
 {race_team_entry_id:entry1,race_id:raceId,entry_source:'user',is_ai_filler:false},
 {race_team_entry_id:entry2,race_id:raceId,entry_source:'ai_fill',is_ai_filler:true}]
const prepared=preparePrivateHistoricalEnvelope(run,entries,stageId)
assert.deepEqual(prepared.team_control,[{teamId:team1,kind:'human'},{teamId:team2,kind:'ai'}])
assert.throws(()=>preparePrivateHistoricalEnvelope({...run,status:'running'},entries,stageId),/completed/)
assert.throws(()=>preparePrivateHistoricalEnvelope({...run,input_snapshot_json:{archived:true}},entries,stageId),/missing or archived/)
assert.throws(()=>preparePrivateHistoricalEnvelope(run,entries.slice(0,1),stageId),/ownership mapping/)
assert.throws(()=>preparePrivateHistoricalEnvelope(run,[entries[0],entries[0]],stageId),/Ambiguous/)
const corrupted=structuredClone(run)
corrupted.input_snapshot_json.teams[0].snapshot.metadata.scenarioAiControlled=true
assert.throws(()=>preparePrivateHistoricalEnvelope(corrupted,entries,stageId),/conflicts/)
const incorrect=structuredClone(run)
incorrect.input_snapshot_json.stagePlans[0].teamId='wrong'
assert.throws(()=>preparePrivateHistoricalEnvelope(incorrect,entries,stageId),/Stage plan teams/)
let calls=0
const factory=()=>({from:table=>{
 assert(['race_stage_simulation_runs','race_participant_teams_v1'].includes(table))
 const builder={
  select:()=>builder,eq:()=>builder,in:()=>builder,
  limit:async()=>({data:[run],error:null}),
  then:(resolve,reject)=>Promise.resolve({data:entries,error:null}).then(resolve,reject)
 }
 calls++
 return builder
}})
const output=await exportPrivateHistoricalStage({
 stageId,url:'https://okuravitxocyevkexfgi.supabase.co',key:'fake',
 clientFactory:factory})
assert.deepEqual(JSON.parse(readFileSync(output.privatePath,'utf8')),prepared)
assert.equal(output.riders,2)
assert.equal(output.aiTeams,1)
assert.equal(output.humanTeams,1)
assert.equal(statSync(output.privatePath).mode&0o777,0o600)
assert.equal(calls,2)
rmSync(dirname(output.privatePath),{recursive:true,force:true})
await assert.rejects(()=>exportPrivateHistoricalStage({
 stageId:'not-a-uuid',url:'x',key:'y',clientFactory:factory}),/valid UUID/)
await assert.rejects(()=>exportPrivateHistoricalStage({
 stageId,url:'https://example.invalid',key:'fake',clientFactory:factory}),/ProPeloton Supabase origin/)
console.log('V4_PRIVATE_EXPORT_TEST_REPORT '+JSON.stringify({
 status:'PASS',completePrivateExport:true,privateFilePermissions:'0600',
 strictAiOwnership:true,unmappedEntriesRejected:true,
 conflictingSnapshotsRejected:true,archiveRejected:true,unfinishedRaceRejected:true,
 projectOriginRestricted:true,privateFileCleaned:true,
 networkCalls:0,productionWrites:0,realRaceDataExported:false}))
