/** A82: necessary time window contract, mirror/name invariance, and
 * actual original swept-body physical 8/32/106/168 experiments.
 * A PASS here documents truthful early rejection, NOT race permission.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {step82ArrivalIntervalV3,step82WindowContractV3,
 step82ContractCandidatesV3} from './a2Step82FeasibleZipperWindowsV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const a={id:'a',x:600,y:2.2,v:9},b={id:'b',x:596,y:2.2,v:9}
const individual=step82ArrivalIntervalV3(a,650)
assert.equal(individual.status,'INDIVIDUAL_NECESSARY_INTERVAL')
assert(individual.earliest>0&&individual.latest>individual.earliest)
assert.throws(()=>step82ArrivalIntervalV3(a,650,{minMovingSpeed:-1}))
assert.equal(step82ArrivalIntervalV3(a,600).earliest,0)
const full=[a,b],requests=full.map(s=>({id:s.id,speed:9,targetY:2.2}))
const booking=full.map(s=>({id:s.id,gateId:'g1',gateX:650,
 scheduledSeconds:5.2,targetY:2.2}))
const original=JSON.stringify({full,requests,booking})
const contract=step82WindowContractV3(full,requests,booking,
 {atSeconds:0,searchSeconds:50})
assert(contract.entries.length===2)
assert(contract.timeSeparationSeconds>.5)
assert(contract.entries[1].assigned>=contract.entries[0].assigned+
 contract.timeSeparationSeconds-1e-5)
const impossible=booking.map(x=>({...x,scheduledSeconds:49}))
const impossibleResult=step82WindowContractV3(full,requests,impossible,
 {atSeconds:0,searchSeconds:50})
assert.equal(impossibleResult.status,'REQUEST_CONTRACT_INFEASIBLE')
assert(impossibleResult.contradictions.some(c=>
 c.type==='NECESSARY_TIME_WINDOW_CONFLICT'))
const sameX=[a,{...b,x:600,y:2.2}]
const equalX=step82WindowContractV3(sameX,requests,booking)
assert.equal(equalX.status,'REQUEST_CONTRACT_INFEASIBLE')
assert(equalX.contradictions.some(c=>
 c.type==='AMBIGUOUS_SAME_X_SAME_LANE'))
const constructed=step82ContractCandidatesV3(full,requests,booking)
assert.equal(constructed.candidates.length,4)
assert.equal(constructed.diagnosticOnly,true)
assert.equal(constructed.officialWrites,0)
assert.equal(JSON.stringify({full,requests,booking}),original)
const flipped=step82ContractCandidatesV3(
 full.map(s=>({...s,y:4.4-s.y})),
 requests.map(r=>({...r,targetY:4.4-r.targetY})),
 booking.map(c=>({...c,targetY:4.4-c.targetY})))
const renamed=step82ContractCandidatesV3(
 full.map(s=>({...s,id:'z'+s.id})),
 requests.map(r=>({...r,id:'z'+r.id})),
 booking.map(c=>({...c,id:'z'+c.id})))
assert.equal(flipped.contract.status,constructed.contract.status)
assert.equal(renamed.contract.status,constructed.contract.status)
for(let k=0;k<4;k++)for(let i=0;i<full.length;i++){
 const x=constructed.candidates[k].requests[i],
 y=flipped.candidates[k].requests[i],
 z=renamed.candidates[k].requests[i]
 assert(eq(x.speed,y.speed)&&eq(x.targetY+y.targetY,4.4))
 assert(eq(x.speed,z.speed)&&eq(x.targetY,z.targetY))
}
const trials=[];
for(const policy of ['feasible_window_v1','feasible_conservative_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const opts={mode:'five_dense',roadGeometry,
  pacePolicy:policy,controllerPolicy:'coordinated_demand',
  headwayStandOffM:4.5,coreMergePolicy:'preview_only',
  rollingStartSpeedMps:n>=106?9:null}
 const start=createMultiGatePhysicalCandidateV3(n,opts);
 assert.equal(start.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(start.admission.bookedCount,2*n)
 const frozen=JSON.stringify(start)
 const testSeconds=n===8?60:n===32?45:30
 const final=runMultiGatePhysicalCandidateV3(start,{seconds:testSeconds})
 assert.equal(JSON.stringify(start),frozen)
 assert.equal(final.officialWrites,0)
 assert(final.physical.at>=0&&final.physical.at<=testSeconds)
 assert(final.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,final.physical.at)))
 const m=multiGatePhysicalMetricsV3(start,final);
 if(final.reason){
  assert.equal(final.status,'REJECTED')
  assert.equal(final.physical.reason,null,
    'A82 accepted rejected collision or energy')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(final))
 }else assert.equal(final.physical.at,testSeconds)
 assert(final.step82SelectedTicks>=final.physical.acceptedSteps)
 assert(final.step82SelectedTicks<=final.physical.acceptedSteps+1)
 trials.push({n,roadGeometry,policy,
  acceptedSeconds:final.physical.at,
  testSeconds,reason:final.reason??'TEST_WINDOW_COMPLETED',
  rearX:m.rearX,allPastSecondGate:m.allPastSecondReopening,
  nearStopRiderTicks:m.nearStops,
  acceptedLaneChanges:m.laneChanges,
  firstRejectedPair:m.firstCollision?.pair??null,
  firstRoadViolation:m.firstRoadViolation?.riderId??null,
  necessaryWindowConsistentTicks:final.step82ConsistencyTicks,
  conflictingRequestCount:final.step82ConflictTicks,
  adjustedBookingTimeRequests:final.step82AdjustedTimeTicks,
  chosen:final.step82SelectedPolicies,
  completedFull180:!final.reason&&final.physical.at===180&&
   m.allPastSecondReopening&&m.nearStops===0})
}
const report={study:'A82_KINEMATIC_ZIPPER_WINDOWS_FIRST_PHYSICAL_MATRIX',
 contractProof:'INDIVIDUAL_NECESSARY_NOT_JOINT_SUFFICIENT',
 technicalGate:'PASS_ONLY_FOR_TRUE_STRICT_SWEPT_OUTCOMES',
 refusalNeverRepairsState:true,officialWrites:0,
 trials:trials.length,
 largeFull180Passed:trials.filter(t=>t.n>=106&&
  t.completedFull180).length,
 best:Object.fromEntries([8,32,106,168].map(n=>[
  n,trials.filter(t=>t.n===n).sort(
    (a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]])),cases:trials}
const dir=process.env.V3_A2_STEP82_DIR??'/tmp/a82window'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a82-necessary-contract-full-body-results.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
