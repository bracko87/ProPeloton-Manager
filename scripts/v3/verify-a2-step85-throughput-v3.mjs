/** Step85: prove that a physically accepted stop-wave is NOT a
 * sporting-selected command, then test actual original A64 8–168.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {chooseThroughputGuardedTickV3,
 step85ThroughputMetricsV3} from './a2Step85ThroughputGuardV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const field={at:0,acceptedSteps:0,nearStops:0,cumulativeAdvancement:0,
 states:[{id:'a',x:600,y:1.25,v:9,targetY:1.25},
  {id:'b',x:594,y:1.25,v:9,targetY:1.25}]}
const slow={policy:'stopping',requests:field.states.map(s=>({
 id:s.id,speed:0,targetY:s.y}))}
const fast={policy:'moving',requests:field.states.map(s=>({
 id:s.id,speed:9,targetY:s.y}))}
const snap=JSON.stringify(field)
const solver=s=>({
 ...s,at:s.at+.5,acceptedSteps:s.acceptedSteps+1,
 nearStops:s.nearStops+s.states.filter(r=>r.desired<2).length,
 cumulativeAdvancement:s.cumulativeAdvancement+
  s.states.reduce((a,b)=>a+b.desired*.5,0),
 states:s.states.map(r=>({...r,v:r.desired})),reason:null
})
const forward=s=>[{policy:'move_forward',
 requests:s.states.map(r=>({id:r.id,speed:r.v,targetY:r.y}))}]
const accepted=chooseThroughputGuardedTickV3(field,[slow,fast],
 forward,solver,{depth:3,maxFirst:2,maxFuture:1,
 strictNoNearStops:true})
assert.equal(accepted.selectedPolicy,'moving')
assert.equal(accepted.blockedNearStops,1)
assert.equal(accepted.noPredictedStatesCommitted,true)
assert.equal(accepted.officialWrites,0)
assert.equal(JSON.stringify(field),snap)
const allBlocked=chooseThroughputGuardedTickV3(field,[slow],
 forward,solver,{depth:2,strictNoNearStops:true})
assert.equal(allBlocked.status,'NO_NO_STOP_PHYSICAL_REQUEST')
assert.equal(allBlocked.firstPhysicalPreview,null)
assert.equal(allBlocked.selectedPolicy,null)
const soft=chooseThroughputGuardedTickV3(field,[slow,fast],
 forward,solver,{depth:3,maxFirst:2,maxFuture:1,
 strictNoNearStops:false})
assert.equal(soft.selectedPolicy,'moving')
const achieved=solver({...field,states:field.states.map(r=>({
 ...r,desired:9}))})
const metrics=step85ThroughputMetricsV3(field,achieved)
assert.equal(metrics.stoppedRiderTicks,0)
assert.equal(metrics.belowMovingFloor,0)
assert.equal(metrics.meanSpeedMps,9)
assert.throws(()=>chooseThroughputGuardedTickV3(field,
 [slow],forward,solver,{depth:4}))
const trials=[]
for(const pacePolicy of ['throughput_strict_v1','throughput_balanced_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const initial=createMultiGatePhysicalCandidateV3(n,{
  mode:'five_dense',pacePolicy,roadGeometry,headwayStandOffM:4.5,
  controllerPolicy:'coordinated_demand',coreMergePolicy:'preview_only',
  rollingStartSpeedMps:n>=106?9:null})
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 const frozen=JSON.stringify(initial)
 const maxSeconds=n===8?45:n===32?55:30
 const out=runMultiGatePhysicalCandidateV3(initial,{seconds:maxSeconds})
 assert.equal(JSON.stringify(initial),frozen)
 assert.equal(out.officialWrites,0)
 assert(out.physical.at>=0&&out.physical.at<=maxSeconds)
 assert(out.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,out.physical.at)))
 const m=multiGatePhysicalMetricsV3(initial,out)
 if(pacePolicy==='throughput_strict_v1')
  assert.equal(m.nearStops,0,
   'A85 strict mode committed a near-stop despite first-tick veto')
 if(out.reason){
  assert.equal(out.physical.reason,null,
   'A85 illegally accepted A64 collision/road/power reject')
  assert.equal(out.status,'REJECTED')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(out))
 }else assert.equal(out.physical.at,maxSeconds)
 assert(out.step85SelectedTicks>=out.physical.acceptedSteps)
 assert(out.step85SelectedTicks<=out.physical.acceptedSteps+1)
 trials.push({n,roadGeometry,pacePolicy,
  actualAcceptedSeconds:out.physical.at,testHorizonSeconds:maxSeconds,
  reason:out.reason??'TEST_HORIZON_ACCEPTED',
  nearStopRiderTicks:m.nearStops,
  physicalLaneChanges:m.laneChanges,
  rearX:m.rearX,allBeyondSecondGate:m.allPastSecondReopening,
  firstRejectedContact:m.firstCollision?.pair??null,
  firstRoadExit:m.firstRoadViolation?.riderId??null,
  nearStopCandidatesBlocked:out.step85RejectedStopCandidates,
  noLegalNonStopTicks:out.step85NoGoTicks,
  selectedPolicies:out.step85SelectedPolicies,
  fullSportingPass:!out.reason&&out.physical.at===180&&
   m.allPastSecondReopening&&m.nearStops===0})
}
const report={study:'A85_REAL_SWEPT_GROUP_THROUGHPUT_MATRIX',
 technicalGate:'PASS_ONLY_FOR_TRUE_PHYSICAL_AND_STOP_REJECTIONS',
 strictStopRequestRejectionProven:true,
 officialWrites:0,caseCount:trials.length,
 fullFiveAbreast106168Sporting:trials.filter(t=>t.n>=106&&
  t.fullSportingPass).length,
 best:Object.fromEntries([8,32,106,168].map(n=>
 [n,trials.filter(t=>t.n===n).sort(
  (a,b)=>b.actualAcceptedSeconds-a.actualAcceptedSeconds)[0]])),trials}
const dir=process.env.V3_A2_STEP85_DIR??'/tmp/step85'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a85-throughput-guard-physical-matrix.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
