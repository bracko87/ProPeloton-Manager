/** Step88: true A64 authoritative full-body racing vs coupled row flow.
 * Technically accepted rejection is not a successful sporting race.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {step88CoupledRowFlowV3,step88RowFlowCandidatesV3}
 from './a2Step88CoupledRowFlowV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=Array.from({length:10},(_,i)=>({
 id:'r'+i,x:600-Math.floor(i/5)*5.2,
 startX:600-Math.floor(i/5)*5.2,y:.3+(i%5)*.95,v:9}))
const target=s=>s.y<2.2?1.25:s.y>2.2?3.15:2.2
const requests=states.map(s=>({id:s.id,speed:9,targetY:target(s)}))
const bookings=states.flatMap(s=>[
 {id:s.id,gateId:'one',gateX:780,targetY:target(s),
  scheduledSeconds:24},
 {id:s.id,gateId:'two',gateX:1260,targetY:target(s),
  scheduledSeconds:84}])
const before=JSON.stringify({states,requests,bookings})
const first=step88RowFlowCandidatesV3(states,requests,bookings)
const plan=first.plan
assert.equal(first.candidates.length,4)
assert.equal(plan.rows,2)
assert.equal(plan.reservations.length,2)
assert(plan.reservations.every(r=>r.fiveAbreast))
assert(plan.edges.some(e=>e.ahead===0&&e.behind===1))
assert(plan.occupiedPairs>0,'A88 missed originally occupied 2D paths')
assert(plan.heldRiders>=2,'A88 did not hold a conflicting same-row crossing')
assert(plan.order.nextGateKinematicChains===10)
assert.equal(plan.officialWrites,0)
assert.equal(plan.futureSlotIsNotSafePhysicalPassage,true)
assert.equal(JSON.stringify({states,requests,bookings}),before)
for(const r of plan.reservations){
 for(const side of [-1,1]){
  const booked=r.occupancy.filter(e=>e.side===side).sort((a,b)=>a.time-b.time)
  for(let i=1;i<booked.length;i++)
   assert(booked[i].time>=booked[i-1].time,
    'A88 illegally reverses same-side row slot order')
 }
}
const transformations=[
 [states.map(s=>({...s,y:4.4-s.y})),
  requests.map(r=>({...r,targetY:4.4-r.targetY})),
  bookings.map(b=>({...b,targetY:4.4-b.targetY}))],
 [states.map(s=>({...s,id:'rename-'+s.id})),
  requests.map(r=>({...r,id:'rename-'+r.id})),
  bookings.map(b=>({...b,id:'rename-'+b.id}))],
 [[...states].reverse(),[...requests].reverse(),
  [...bookings].reverse()]
]
for(let t=0;t<transformations.length;t++){
 const [st,re,bo]=transformations[t]
 const m=step88RowFlowCandidatesV3(st,re,bo)
 assert.equal(m.plan.rows,plan.rows)
 assert.equal(m.plan.edges.length,plan.edges.length)
 assert.equal(m.plan.heldRiders,plan.heldRiders)
 for(let k=0;k<4;k++)for(let i=0;i<states.length;i++){
  const a=first.candidates[k].requests[i],
   b=m.candidates[k].requests[t===2?states.length-1-i:i]
  assert(eq(a.speed,b.speed),
   'A88 mirrored/renamed/reversed row speed request divergence')
  assert(t===0?eq(a.targetY+b.targetY,4.4):
   eq(a.targetY,b.targetY),
   'A88 mirrored/renamed/reversed row steering divergence')
 }
}
const tie=[
 {id:'a',x:600,startX:600,y:1.25,v:9},
 {id:'b',x:600,startX:600,y:3.15,v:9}
]
const tied=step88RowFlowCandidatesV3(tie,
 tie.map(s=>({id:s.id,speed:9,targetY:2.2})),
 tie.map(s=>({id:s.id,gateId:'first',gateX:780,
  targetY:2.2,scheduledSeconds:23})))
assert(tied.plan.held.every(Boolean),'A88 equal-x tie favors one side')
assert(tied.candidates.every(c=>c.requests.every(
 (r,i)=>eq(r.targetY,tie[i].y))))
assert.throws(()=>step88RowFlowCandidatesV3(states,
 [requests[0],requests[0],...requests.slice(2)],bookings))
const matrix=[]
for(const pacePolicy of ['whole_row_strict_v1','whole_row_balanced_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const initial=createMultiGatePhysicalCandidateV3(n,{
  mode:'five_dense',pacePolicy,roadGeometry,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',rollingStartSpeedMps:n>=106?9:null})
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(initial.admission.bookedCount,2*n)
 const frozen=JSON.stringify(initial)
 const seconds=n===8?40:n===32?50:30
 const done=runMultiGatePhysicalCandidateV3(initial,{seconds})
 assert.equal(JSON.stringify(initial),frozen)
 assert.equal(done.officialWrites,0)
 assert(done.physical.at>=0&&done.physical.at<=seconds)
 const m=multiGatePhysicalMetricsV3(initial,done)
 if(pacePolicy==='whole_row_strict_v1')
  assert.equal(m.nearStops,0,
   'A88 strict committed a physically accepted near-stop')
 if(done.reason){
  assert.equal(done.status,'REJECTED')
  assert.equal(done.physical.reason,null,
   'A88 committed a rejected swept full-body bicycle movement')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(done))
 }else assert.equal(done.physical.at,seconds)
 assert(done.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,done.physical.at)))
 assert(done.step88SelectedTicks>=done.physical.acceptedSteps)
 assert(done.step88SelectedTicks<=done.physical.acceptedSteps+1)
 matrix.push({n,roadGeometry,pacePolicy,
  acceptedSeconds:done.physical.at,
  requestedSeconds:seconds,
  reason:done.reason??'TEST_HORIZON_ACCEPTED',
  nearStops:m.nearStops,physicalLaneChanges:m.laneChanges,
  rearX:m.rearX,allPastSecondGate:m.allPastSecondReopening,
  firstSweptContact:m.firstCollision?.pair??null,
  firstRoadExit:m.firstRoadViolation?.riderId??null,
  groupEdges:done.step88RowEdges,
  occupiedPairTicks:done.step88OccupiedPairTicks,
  heldRiderTicks:done.step88HeldRiderTicks,
  selectedPolicies:done.step88SelectedPolicies,
  full180SportingPass:!done.reason&&done.physical.at===180&&
   m.nearStops===0&&m.allPastSecondReopening})
}
const report={study:'A88_TRUE_A64_COUPLED_ROW_OCCUPANCY_16_MATRIX',
 physicalRejectionPreserved:true,pureRowSymmetry:'PASS',
 caseCount:matrix.length,
 clean106168FiveWide180:matrix.filter(m=>m.n>=106&&
  m.full180SportingPass).length,
 officialWrites:0,
 matrix}
const dir=process.env.V3_A2_STEP88_DIR??'/tmp/v3step88'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a88-coupled-true-body-matrix.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
