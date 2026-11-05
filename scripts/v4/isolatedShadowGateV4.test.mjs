import test from 'node:test'
import assert from 'node:assert/strict'
import {
 classifyV4IsolatedShadow,V4_ISOLATED_SHADOW_CONTRACT
} from './isolatedShadowGateV4.mjs'
const plan={status:'ai_prepared',aiTeams:2,humanTeams:1,
 intents:[{riderId:'secret-rider',teamId:'secret-team'}],
 combinedInput:{race:{raceId:'secret-race'},
  stage:{stageId:'secret-stage'}},
 productionWrites:0,calculationCount:0}
const result={raceId:'secret-race',stageId:'secret-stage',
 validationPassed:true,
 replaySynchronization:{synchronized:true,issues:[]},
 riderReadiness:[{riderId:'secret-rider'}],
 finishResolution:{riders:[{riderId:'secret-rider',position:1}]}}
const gate={publishable:true,replayQuality:'full',
 blockingIssues:[],nonBlockingIssues:[]}

test('strict synchronized V4 shadow reports aggregate-only pass and zero writes',()=>{
 const output=classifyV4IsolatedShadow({plan,result,gate})
 assert.deepEqual(output,{
  contract:V4_ISOLATED_SHADOW_CONTRACT,
  researchOnly:true,officialWrites:0,productionEnabled:false,
  replayQuality:'full',phase:'ISOLATED_EXECUTION',
  plannedAIIntents:1,aiTeams:2,humanTeams:1,
  status:'SHADOW_STRICT_REPLAY_PASS'
 })
 const serialized=JSON.stringify(output)
 assert.doesNotMatch(serialized,/secret|stageId|raceId|riderId|classification|issue/i)
})
test('blocked and degraded replay always fail even when gate says publishable',()=>{
 for(const variation of [
  {gate:{...gate,publishable:false,replayQuality:'blocked',
   blockingIssues:['private-issue:secret-rider']}},
  {gate:{...gate,replayQuality:'degraded'}},
  {result:{...result,replaySynchronization:{synchronized:false,issues:['x']}}},
  {gate:{...gate,blockingIssues:['private-issue:secret-rider']}}
 ]){
  const outcome=classifyV4IsolatedShadow({plan,result,gate,...variation})
  assert.equal(outcome.status,'SHADOW_STRICT_REPLAY_BLOCKED')
  assert.equal(outcome.officialWrites,0)
  assert.doesNotMatch(JSON.stringify(outcome),/secret/)
 }
})
test('rejects wrong engine, mismatched race identity and malformed policy',()=>{
 for(const variation of [
  {result:{...result,validationPassed:false}},
  {result:{...result,stageId:'other-stage'}},
  {result:{...result,raceId:'other-race'}},
  {gate:{...gate,blockingIssues:'not-an-array'}},
  {result:{...result,replaySynchronization:null}},
  {gate:null},
  {result:null}
 ]){
  const output=classifyV4IsolatedShadow({plan,result,gate,...variation})
  assert.equal(output.status,'SHADOW_ENGINE_CONTRACT_REJECTED')
 }
})
test('never treats unsupported or all-human inputs as a V4 execution pass',()=>{
 for(const status of ['unsupported_stage','neutral_all_human']){
  const output=classifyV4IsolatedShadow({
   plan:{...plan,status},result,gate})
  assert.equal(output.status,'SHADOW_STAGE_NOT_ELIGIBLE')
 }
 const output=classifyV4IsolatedShadow({plan:{
  ...plan,status:'ai_prepared',aiTeams:0},result,gate})
 assert.equal(output.status,'SHADOW_STAGE_NOT_ELIGIBLE')
})
test('rejects plans that claim writes, calculations or invalid ownership',()=>{
 for(const change of [
  {productionWrites:1},{calculationCount:1},{aiTeams:-1},
  {humanTeams:1.5},{intents:null},{status:'ready_for_production'}
 ]){
  const output=classifyV4IsolatedShadow({
   plan:{...plan,...change},result,gate})
  assert.equal(output.status,'SHADOW_PLAN_REJECTED')
 }
})
