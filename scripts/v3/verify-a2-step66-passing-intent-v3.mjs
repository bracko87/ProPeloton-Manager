/** A66 optional persistent intent when bounded following suppresses speed
 * difference. Offline matched race-start study, no production integration.
 * Compare safety and physically *completed* lanes, not just pair order.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,runNormalStartV3,finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const scenarios=[]
const approx=(x,y)=>Math.abs(x-y)<1e-5
const variants=['coordinated_headway','coordinated_demand','coordinated_either']
const modeNames=['mixed','pressure','corridor']
function run(mode,policy,seconds,variant={}){
 const start=createNormalStartV3(32,{mode,controllerPolicy:policy,headwayStandOffM:3.2,...variant})
 const final=runNormalStartV3(start,{seconds})
 assert(final.at<=seconds&&final.states.every(s=>
  s.energy.remainingWPrimeJoules>=0&&Math.abs(s.energy.seconds-final.at)<1e-6))
 const m=finishNormalStartMetricsV3(start,final)
 assert.equal(m.officialWrites,0)
 assert(!final.reason||final.reason==='SWEPT_CONTACT'||final.reason==='ENERGY_FAILED')
 const snapshot={mode,policy,seconds,...m}
 scenarios.push(snapshot)
 return {start,final,m}
}
for(const mode of modeNames){
 const baseline=run(mode,variants[0],90)
 const results=variants.slice(1).map(policy=>run(mode,policy,90))
 assert.equal(baseline.m.status,'FULL_HORIZON_CLEAR','A66 baseline regression')
 assert.equal(baseline.m.nearStopRiderTicks,0,'A66 baseline near-stop')
 for(const {start,final,m} of results){
  const mirror=runNormalStartV3(createNormalStartV3(32,{
   mode,controllerPolicy:start.controllerPolicy,headwayStandOffM:3.2,mirror:true}),{seconds:90})
  const renamed=runNormalStartV3(createNormalStartV3(32,{
   mode,controllerPolicy:start.controllerPolicy,headwayStandOffM:3.2,renamed:true}),{seconds:90})
  assert.equal(mirror.reason,final.reason,'A66 mirror outcome mismatch '+mode)
  assert.equal(renamed.reason,final.reason,'A66 ID outcome mismatch '+mode)
  assert.equal(mirror.acceptedSteps,final.acceptedSteps)
  assert.equal(renamed.acceptedSteps,final.acceptedSteps)
  for(let i=0;i<32;i++){
   const a=final.states[i],b=mirror.states[i],c=renamed.states[i]
   assert(approx(a.x,b.x)&&approx(a.y+b.y,4.4),'A66 reflection changed motion')
   assert(approx(a.x,c.x)&&approx(a.y,c.y),'A66 rename changed motion')
   assert(approx(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
   assert(approx(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
  }
  if(m.status==='FULL_HORIZON_CLEAR'){
   const halfway=runNormalStartV3(start,{seconds:45})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(halfway)),{seconds:45}),
    final,'A66 exact restart failed '+mode+'/'+start.controllerPolicy)
  }
 }
}
// Longer tests are conditional on safe 90s outcome; a collision remains a
// documented rejection, not an invitation to truncate the race horizon.
const endurance=[]
for(const mode of modeNames){
 for(const policy of variants){
  const start=createNormalStartV3(32,{mode,controllerPolicy:policy,headwayStandOffM:3.2})
  const final=runNormalStartV3(start,{seconds:180})
  const result=finishNormalStartMetricsV3(start,final)
  assert(result.seconds<=180&&final.states.every(s=>
   s.energy.remainingWPrimeJoules>=0&&Math.abs(s.energy.seconds-final.at)<1e-6))
  if(policy==='coordinated_headway')assert(
   result.status==='FULL_HORIZON_CLEAR'&&result.seconds===180&&
   result.nearStopRiderTicks===0,'A66 baseline 180s failed')
  if(!final.reason){
   const first=runNormalStartV3(start,{seconds:90})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(first)),{seconds:90}),
    final,'A66 long resumed field mismatch')
  }
  endurance.push({mode,policy,...result})
 }
}
const corridorBase=scenarios.find(s=>s.mode==='corridor'&&s.policy==='coordinated_headway')
const corridorCandidates=scenarios.filter(s=>s.mode==='corridor'&&s.policy!=='coordinated_headway')
assert.equal(corridorBase.completedLaneChanges,13,'A66 reference corridor was altered')
const study={
 study:'A2_STEP66_PERSISTENT_PASSING_INTENT',
 technicalGate:'PASS',sportingGate:'NO_GO',
 baselineCorridorCompletedLanes:corridorBase.completedLaneChanges,
 candidateCorridor90s:corridorCandidates.map(s=>({
  policy:s.policy,status:s.status,completedLaneChanges:s.completedLaneChanges,
  startedLaneChanges:s.initiatedLaneChanges,
  pairOrderReversals:s.uniquePairOrderReversals,
  firstCollision:s.firstCollision})),
 strictPromotablePolicies:variants.slice(1).filter(policy=>{
  const short=scenarios.filter(s=>s.policy===policy)
  const long=endurance.filter(s=>s.policy===policy)
  return short.every(s=>s.status==='FULL_HORIZON_CLEAR'&&s.nearStopRiderTicks===0)&&
   long.every(s=>s.status==='FULL_HORIZON_CLEAR'&&s.nearStopRiderTicks===0)&&
   short.find(s=>s.mode==='corridor').completedLaneChanges>=22
 }),
 allRiderPhysicalConstraintsChecked:true,
 mirroredAndRenamed:true,exactSerializedReplayForClearRuns:true,
 officialWrites:0,scenarios,endurance,sportingApproval:'NOT_APPROVED'
}
const dir=process.env.V3_A2_STEP66_DIR??'/tmp/a2-step66'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step66-passing-intent-results.json',JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify({
 study:study.study,technicalGate:study.technicalGate,
 sportingGate:study.sportingGate,
 baselineCorridorCompletedLanes:study.baselineCorridorCompletedLanes,
 candidateCorridor90s:study.candidateCorridor90s,
 strictPromotablePolicies:study.strictPromotablePolicies,
 results90s:scenarios.map(s=>({mode:s.mode,policy:s.policy,status:s.status,
   seconds:s.seconds,lanes:s.completedLaneChanges,order:s.uniquePairOrderReversals,
   nearStops:s.nearStopRiderTicks,firstCollision:s.firstCollision})),
 results180s:endurance.map(s=>({mode:s.mode,policy:s.policy,status:s.status,
   seconds:s.seconds,lanes:s.completedLaneChanges,order:s.uniquePairOrderReversals,
   nearStops:s.nearStopRiderTicks,firstCollision:s.firstCollision})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'
}))
