/** Step81 pure multi-second spatial reservations + real swept-body trials.
 * Green technical gate only certifies true PASS/FAIL classification.
 * All large fields must pass 180s before sporting authorization.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {forecastMultiSecondOccupancyV3,
 predictReservationPoseV3,
 multiSecondReservationCandidatesV3} from './a2Step81SpaceTimeReservationsV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=Array.from({length:10},(_,i)=>({
 id:'r'+i,x:600-Math.floor(i/5)*5.2,
 y:.3+(i%5)*.95,v:8.45+((i*7)%9)*.14,
 startX:600-Math.floor(i/5)*5.2}))
const req=states.map((s,i)=>({
 id:s.id,speed:s.v,targetY:i%2===0?1.25:3.15}))
const bookings=states.map(s=>({id:s.id,
 gateId:'first',gateX:780,targetY:1.25,scheduledSeconds:25}))
const frozen=JSON.stringify({states,req,bookings})
const planned=multiSecondReservationCandidatesV3(states,req,bookings)
assert.equal(JSON.stringify({states,req,bookings}),frozen)
assert(planned.forecast.edges.length>0,
 'A81 forecast did not detect future same-corridor conflicts')
assert(planned.forecast.ridersWithConflict>0)
assert(planned.forecast.linkedGroups.length>=1)
assert.equal(planned.candidates.length,4)
assert(planned.candidates.some(p=>p.predictedWarnings>0))
assert(planned.candidates.some(p=>p.heldSteering>0))
assert(planned.candidates.some(p=>p.rowRequests===10))
assert.equal(planned.officialWrites,0)
assert.throws(()=>forecastMultiSecondOccupancyV3(states,
 [req[0],req[0],...req.slice(2)],bookings))
assert.throws(()=>forecastMultiSecondOccupancyV3(states,req,
 bookings,{horizonSeconds:13}))
const mirroredStates=states.map(s=>({...s,y:4.4-s.y}))
const mirrorRequests=req.map(r=>({...r,targetY:4.4-r.targetY}))
const mirroredBookings=bookings.map(b=>({...b,targetY:4.4-b.targetY}))
const mirrored=multiSecondReservationCandidatesV3(
 mirroredStates,mirrorRequests,mirroredBookings)
const renamed=multiSecondReservationCandidatesV3(
 states.map(s=>({...s,id:'z'+s.id})),
 req.map(r=>({...r,id:'z'+r.id})),
 bookings.map(b=>({...b,id:'z'+b.id})))
assert.equal(planned.forecast.edges.length,mirrored.forecast.edges.length)
assert.equal(planned.forecast.edges.length,renamed.forecast.edges.length)
for(let i=0;i<10;i++)for(let j=0;j<4;j++){
 const a=planned.candidates[j].requests[i],
 b=mirrored.candidates[j].requests[i],
 c=renamed.candidates[j].requests[i]
 assert(eq(a.speed,b.speed)&&eq(a.targetY+b.targetY,4.4),
  'A81 mirror provisional command diverged')
 assert(eq(a.speed,c.speed)&&eq(a.targetY,c.targetY),
  'A81 rider name influenced a provisional command')
}
const predicted=predictReservationPoseV3(
 states[0],{id:states[0].id,speed:40,targetY:3.15},5)
assert(predicted.v<=states[0].v+.45*5+1e-5,
 'A81 prediction exceeded physical acceleration')
assert(Math.abs(predicted.y-states[0].y)<=.38*5+1e-5,
 'A81 prediction exceeded physical lateral speed')
const trials=[]
for(const policy of ['multisecond_reserve_v1','multisecond_zipper_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const opts={mode:'five_dense',roadGeometry,pacePolicy:policy,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',
  rollingStartSpeedMps:n>=106?9:null}
 const start=createMultiGatePhysicalCandidateV3(n,opts)
 assert.equal(start.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(start.admission.bookedCount,2*n)
 const saved=JSON.stringify(start)
 const horizon=n===8?60:n===32?45:30
 const final=runMultiGatePhysicalCandidateV3(start,{seconds:horizon})
 assert.equal(JSON.stringify(start),saved)
 assert.equal(final.officialWrites,0)
 assert(final.physical.at>=0&&final.physical.at<=horizon)
 assert(final.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,final.physical.at)))
 const m=multiGatePhysicalMetricsV3(start,final)
 if(final.reason){
  assert.equal(final.status,'REJECTED')
  assert.equal(final.physical.reason,null,
   'A81 incorrectly committed a rejected swept bicycle movement')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(final))
 }else assert.equal(final.physical.at,horizon)
 assert(final.multisecondSelectedTicks>=final.physical.acceptedSteps)
 assert(final.multisecondSelectedTicks<=final.physical.acceptedSteps+1)
 trials.push({n,roadGeometry,policy,
  horizonSeconds:horizon,acceptedSeconds:final.physical.at,
  reason:final.reason??'ACCEPTED_TEST_HORIZON',
  nearStopRiderTicks:m.nearStops,physicalLaneChanges:m.laneChanges,
  allBeyondSecondGate:m.allPastSecondReopening,
  rearX:m.rearX,firstRejectedBodyPair:m.firstCollision?.pair??null,
  firstRoadViolation:m.firstRoadViolation?.riderId??null,
  forecastConflictEdgeTicks:final.multisecondForecastEdgeTicks,
  chosen:final.multisecondPolicyTicks,
  rejectedFutureWarnings:final.horizonRejectedPredictions,
  physicallyClearAndRealistic:!final.reason&&
   final.physical.at===180&&m.allPastSecondReopening&&
   m.nearStops===0})
}
const result={study:'A81_PROVISIONAL_MULTI_SECOND_CORRIDOR_PHYSICS',
 technicalGate:'PASS_ONLY_FOR_TRUE_SWEPT_PHYSICAL_ASSERTIONS',
 sportingGate:'NO_GO_UNTIL_FULL_180',
 trialCount:trials.length,officialWrites:0,
 zeroCommittedRejectedMovements:true,
 honestLargeFieldsComplete:trials.filter(t=>t.n>=106&&
  t.physicallyClearAndRealistic).length,
 best:Object.fromEntries([8,32,106,168].map(n=>[
  n,trials.filter(t=>t.n===n).sort(
   (a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]])),trials}
const dir=process.env.V3_A2_STEP81_DIR??'/tmp/a81-reservation'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a81-space-time-provisional-physical-matrix.json',
 JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
