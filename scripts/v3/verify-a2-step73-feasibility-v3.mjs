/** A73: verify only NECESSARY two-slot entry windows, then falsify
 * any mistaken claim that they guarantee a collision-free actual race.
 * Offline, no production policies, no hypothetical accepted A44 paths.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {auditTwoSlotFeasibilityV3,physicalArrivalWindowV3}
 from './a2TwoSlotFeasibilityV3.mjs'
import {startSustainedOvertakeObserverV3,advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
import {createNormalStartV3,runNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const close=(a,b)=>Math.abs(a-b)<1e-6
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3,
 roadGeometry:'strong_pinch',roadMergePolicy:'platoon_two_slot_hazard_hold'}
const sample=physicalArrivalWindowV3(779,30,780,{
 minSpeedMps:5,maxSpeedMps:30,deadlineSeconds:120})
assert(sample.status==='REACHABLE_WINDOW'&&
 sample.earliestSeconds>0&&sample.earliestSeconds<.04&&
 sample.latestSeconds>=sample.earliestSeconds)
const far=physicalArrivalWindowV3(0,5,780,{
 minSpeedMps:5,maxSpeedMps:5,deadlineSeconds:60})
assert.equal(far.status,'UNREACHABLE_BEFORE_DEADLINE')
assert.throws(()=>physicalArrivalWindowV3(0,0,780))
assert.throws(()=>auditTwoSlotFeasibilityV3([], 'strong_pinch'))
const common=[]
for(const n of [32,106,168]){
 const start=createNormalStartV3(n,base)
 const plan=auditTwoSlotFeasibilityV3(start.states,'strong_pinch')
 assert.equal(plan.status,'NECESSARY_WINDOWS_EXIST',
  'A73 expected current synthetic start to have necessary kinematic windows')
 assert.equal(plan.bookedCount,n)
 assert(plan.lastSlotReleaseSeconds<120)
 assert(plan.bookings.every(b=>b.scheduledSeconds>=b.earliestSeconds-1e-7&&
  b.scheduledSeconds<=b.latestSeconds+1e-7))
 const mirrored=createNormalStartV3(n,{...base,mirror:true})
 const renamed=createNormalStartV3(n,{...base,renamed:true})
 const a=auditTwoSlotFeasibilityV3(mirrored.states,'strong_pinch')
 const b=auditTwoSlotFeasibilityV3(renamed.states,'strong_pinch')
 assert.equal(a.status,plan.status);assert.equal(b.status,plan.status)
 assert.equal(a.bookedCount,n);assert.equal(b.bookedCount,n)
 const mapping=(states,p)=>new Map(p.bookings.map(booking=>[
  states.findIndex(s=>s.id===booking.id),booking]))
 const main=mapping(start.states,plan),flip=mapping(mirrored.states,a),
  ids=mapping(renamed.states,b)
 for(let i=0;i<n;i++){
  const x=main.get(i),y=flip.get(i),z=ids.get(i)
  assert(x&&y&&z,'A73 missing rider in spatial two-slot booking')
  assert(close(x.scheduledSeconds,y.scheduledSeconds)&&
   close(x.scheduledSeconds,z.scheduledSeconds),
   'A73 booking depends on lateral reflection or rider identifier')
  assert(close(x.targetY,4.4-y.targetY)&&
   close(x.targetY,z.targetY),
   'A73 booking lateral target not physical-mirror invariant')
 }
 // A reservation table is only a necessary condition. Demonstrate
 // falsification by running the ORIGINAL bicycle-wide coupled solver:
 // its actual old strong road still rejects motion, proving no trajectory
 // or finish certificate can be inferred from this positive ledger.
 const rejected=runNormalStartV3(start,{seconds:Math.min(n===32?120:90,120)})
 const actual=finishNormalStartMetricsV3(start,rejected)
 assert(actual.status==='SWEPT_CONTACT'||
  actual.status==='ROAD_ENVELOPE_VIOLATION',
  'A73 synthetic body-wide strong-road counterexample unexpectedly cleared')
 assert.throws(()=>advanceNormalStartV3(rejected),
  'A73 historical fail-closed field was accidentally reactivated')
 assert(actual.seconds<90,
  'A73 actual collision was hidden behind a theoretical booking')
 common.push({n,windowStatus:plan.status,necessaryBookedRiders:n,
  finalScheduledEntrySeconds:plan.lastSlotReleaseSeconds,
  actualPhysicalStatus:actual.status,actualAcceptedSeconds:actual.seconds,
  physicalFirstCollision:actual.firstCollision,
  physicalFirstRoadExit:actual.firstRoadViolation})
}
const mild=auditTwoSlotFeasibilityV3(
 createNormalStartV3(32,{...base,roadGeometry:'mild_pinch'}).states,
 'mild_pinch')
assert.equal(mild.status,'NOT_TWO_SLOT',
 'A73 should not falsely apply strong 2-slot schedule to 3.3m road')
// At only 1m before the gate, three riders in one physical row at 30m/s
// have <0.04s arrival flexibility. They CANNOT establish even a 0.42s
// longitudinal insertion gap, so the correct output is NO-GO.
const late=[1.1,2.2,3.3].map((y,i)=>({
 id:'late'+i,startX:779,x:779,y,v:30,desired:30
}))
const impossible=auditTwoSlotFeasibilityV3(late,'strong_pinch')
assert.equal(impossible.status,'UNRESOLVED')
assert.equal(impossible.bookedCount,0)
assert.equal(impossible.unresolved[0].reason,'NO_REACHABLE_SLOT_WINDOW')
const alreadyPassed=auditTwoSlotFeasibilityV3(late.map(s=>({
 ...s,x:781})),'strong_pinch')
assert.equal(alreadyPassed.status,'UNRESOLVED')
assert(alreadyPassed.unresolved.some(r=>r.reason==='NO_REACHABLE_SLOT_WINDOW'))
const deadline=auditTwoSlotFeasibilityV3(
 createNormalStartV3(32,base).states,'strong_pinch',{
 deadlineSeconds:10})
assert.equal(deadline.status,'UNRESOLVED')
assert.equal(deadline.bookedCount,0)
// Multiple rows cannot be booked after an earlier infeasible row.
const extended=[...late,...late.map((s,i)=>({
 ...s,id:'back'+i,x:760,startX:760}))]
const blocked=auditTwoSlotFeasibilityV3(extended,'strong_pinch')
assert.equal(blocked.status,'UNRESOLVED')
assert(blocked.unresolved.some(r=>r.reason==='BLOCKED_BY_EARLIER_ROW'))
// An actual coupled-controller experiment follows the pure necessary
// timetable audit. Unsafe movements must still fail closed, not be "fixed"
// by jumping a rider into an assigned space-time slot.
const physicallyScheduled=[]
for(const n of [32,106,168]){
 for(const policy of ['platoon_gate_schedule','platoon_gate_crossrow']){
 const opts={...base,roadMergePolicy:policy}
 const initial=createNormalStartV3(n,opts)
 assert.equal(initial.roadGateStatus,'NECESSARY_WINDOWS_EXIST')
 assert.equal(initial.roadGateBookings.length,n)
 const seconds=n===32?120:90
 const actual=runNormalStartV3(initial,{seconds})
 const metrics=finishNormalStartMetricsV3(initial,actual)
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
  'ENERGY_FAILED'].includes(metrics.status),'A73 invalid gate policy outcome')
 assert(actual.states.every(s=>s.energy.remainingWPrimeJoules>=0&&
  s.v>=0&&close(s.energy.seconds,actual.at)))
 const mirroredStart=createNormalStartV3(n,{...opts,mirror:true})
 const renamedStart=createNormalStartV3(n,{...opts,renamed:true})
 const mirror=runNormalStartV3(mirroredStart,{seconds})
 const rename=runNormalStartV3(renamedStart,{seconds})
 assert.equal(actual.reason,mirror.reason)
 assert.equal(actual.reason,rename.reason)
 assert.equal(actual.acceptedSteps,mirror.acceptedSteps)
 assert.equal(actual.acceptedSteps,rename.acceptedSteps)
 for(let i=0;i<n;i++){
  const a=actual.states[i],b=mirror.states[i],c=rename.states[i]
  assert(close(a.x,b.x)&&close(a.y,4.4-b.y),
   'A73 gate timetable mirror changed movement '+n+'/'+i)
  assert(close(a.x,c.x)&&close(a.y,c.y),
   'A73 rider renaming changed scheduled movement '+n+'/'+i)
  assert(close(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
  assert(close(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
 }
 if(n===32&&policy==='platoon_gate_schedule'){
  assert.equal(metrics.status,'FULL_HORIZON_CLEAR',
   'A73 regressed first 32-rider full-bicycle 2.2m 120s clear stage')
  assert.equal(metrics.seconds,120)
  assert(metrics.completedLaneChanges>=20&&metrics.nearStopRiderTicks===0&&
   metrics.roadGateLateWindowRiderTicks===0,
   'A73 32 strong only cleared by suppressing lanes, late bookings or near stops')
  assert(actual.states.every(s=>s.x>=1020),
   'A73 32-rider report did not physically leave widening road')
 }
 if(n>32&&policy==='platoon_gate_schedule'){
  assert(metrics.seconds>=40,
   'A73 106/168 physical narrowing progress regressed below 40 seconds')
  assert(metrics.nearStopRiderTicks===0,
   'A73 large physical field stalled to postpone collision')
 }
 if(metrics.status==='FULL_HORIZON_CLEAR'){
  const half=runNormalStartV3(initial,{seconds:seconds/2})
  assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(half)),{
   seconds:seconds/2}),actual,'A73 schedule checkpoint recovery differs')
 }
 if(actual.reason){
  assert.throws(()=>advanceNormalStartV3(actual))
  assert(actual.at<seconds)
 }
 physicallyScheduled.push({n,policy,targetSeconds:seconds,acceptedSeconds:metrics.seconds,
  status:metrics.status,completedLaneChanges:metrics.completedLaneChanges,
  nearStopRiderTicks:metrics.nearStopRiderTicks,
  timetableSteeringRiderTicks:metrics.roadGateWindowRiderTicks,
  timetableHeldRiderTicks:metrics.roadGateLateralHoldRiderTicks,
  timetableLateRiderTicks:metrics.roadGateLateWindowRiderTicks,
  earlyCrossRowWarningTicks:metrics.roadGateCrossRowWarningRiderTicks,
  firstCollision:metrics.firstCollision,firstRoadViolation:metrics.firstRoadViolation})
 }
}
// A73 hostile checkpoint-data controls: never accept a missing rider,
 // duplicate slot, impossible booking time or nonfinite timetable number.
 for(const tamper of [
  p=>p.roadGateBookings.pop(),
  p=>{p.roadGateBookings[1].id=p.roadGateBookings[0].id},
  p=>{p.roadGateBookings[0].scheduledSeconds=NaN},
  p=>{p.roadGateBookings[0].targetY=-2}
 ]){
  const checkpoint=createNormalStartV3(32,{...base,
   roadMergePolicy:'platoon_gate_schedule'})
  tamper(checkpoint)
  const rejected=advanceNormalStartV3(checkpoint)
  assert.equal(rejected.reason,'GATE_ENTRY_NO_WINDOW')
  assert.equal(rejected.at,0)
  assert.equal(rejected.acceptedSteps,0)
  assert.deepEqual(rejected.states,checkpoint.states,
   'A73 invalid slot checkpoint advanced physical rider state')
 }
// A separately maintained read-only observer certifies REAL sustained
// strong-pinch passing and exact combined race+observer restart, not just
// endpoint inversions or lane moves. It sees only accepted movements.
const replay=(start,seconds,checkpoint=null)=>{
 let physical=checkpoint?.physical??structuredClone(start)
 let observer=checkpoint?.observer??startSustainedOvertakeObserverV3(
  physical.states)
 const end=physical.at+seconds
 while(physical.at<end-1e-7&&!physical.reason){
  const next=advanceNormalStartV3(physical)
  if(next.reason){physical=next;break}
  observer=advanceSustainedOvertakeObserverV3(observer,
   physical.states,next.states,.5)
  physical=next
 }
 return {physical,observer}
}
const clear32=createNormalStartV3(32,{...base,
 roadMergePolicy:'platoon_gate_schedule'})
const whole=replay(clear32,120)
assert.equal(whole.physical.reason,null)
assert.equal(whole.physical.at,120)
const passSummary=overtakeObserverSummaryV3(whole.observer)
assert(passSummary.confirmedSustainedPasses>0,
 'A73 no independently proven sustained overtake in clear strong road')
const saved=replay(clear32,60)
const resumed=replay(clear32,60,{physical:JSON.parse(
 JSON.stringify(saved.physical)),observer:JSON.parse(
 JSON.stringify(saved.observer))})
assert.deepEqual(resumed.physical,whole.physical,
 'A73 first completely clear strong road physical restart not exact')
assert.deepEqual(resumed.observer,whole.observer,
 'A73 strong-road sustained passing observer restart not exact')
const report={
 study:'A2_STEP73_NECESSARY_TWO_SLOT_REACHABILITY',
 technicalGate:'PASS',sportingGate:'NO_GO',
 physicsBoundedAccelerationMps2:{increase:.45,decrease:-.85},
 minimumNonStalledSpeedMps:5,roadWidthM:2.2,
 bodyHalfWidthM:.3,gateX:780,slotSpacingSeconds:.5,
 confirmedKinematicallyInfeasibleLateArrival:true,
 cannotInferRaceFinishFromNecessaryWindows:true,
 realStrongPinchStillRejected:true,
 actualAllPairSweptContactUnchanged:true,
 mirroredAndRelabeledBookkeepingParity:true,
 normalStarts:common,physicallyScheduled,
 firstStrongFullyTraversed32:true,
 firstStrongSustainedPairPasses32:passSummary.confirmedSustainedPasses,
 firstStrongExactPhysicalAndPassObserverRestart:true,
 adversarial:{
 lateNoWindow:impossible.unresolved[0],
 cannotBookAfterUnresolvedPredecessor:true,
 shortDeadlineNoWindow:deadline.status,
 mildRoadNotTwoSlot:true},
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP73_DIR??'/tmp/a2-step73'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step73-reachability-and-infeasibility.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,
 technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,normalStarts:common.map(x=>({
 n:x.n,necessaryBookedRiders:x.necessaryBookedRiders,
 latestBookedArrival:x.finalScheduledEntrySeconds,
 actualPhysicalStatus:x.actualPhysicalStatus,
 actualAcceptedSeconds:x.actualAcceptedSeconds})),
 strong32VerifiedSustainedPairPasses:passSummary.confirmedSustainedPasses,
 physicallyScheduled:physicallyScheduled.map(x=>({n:x.n,policy:x.policy,
 status:x.status,
 acceptedSeconds:x.acceptedSeconds,laneChanges:x.completedLaneChanges,
 nearStops:x.nearStopRiderTicks,held:x.timetableHeldRiderTicks,
 late:x.timetableLateRiderTicks,warnings:x.earlyCrossRowWarningTicks,
 firstContact:x.firstCollision?.pair??null,
 roadExit:x.firstRoadViolation?.riderId??null})),
 impossibleLateArrival:report.confirmedKinematicallyInfeasibleLateArrival,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
