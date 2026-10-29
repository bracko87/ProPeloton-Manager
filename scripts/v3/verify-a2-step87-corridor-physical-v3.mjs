/** A87 true physical 5→2 row-order research. A green technical test
 * confirms honest swept rejection, NOT sporting completion.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {step87CorridorOrderV3,step87CorridorCandidatesV3}
 from './a2Step87CorridorOrderV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=Array.from({length:10},(_,i)=>({
 id:'r'+i,x:600-Math.floor(i/5)*5.2,
 startX:600-Math.floor(i/5)*5.2,y:.3+(i%5)*.95,v:9}))
const target=s=>s.y<2.2?1.25:s.y>2.2?3.15:2.2
const req=states.map(s=>({id:s.id,speed:9,targetY:target(s)}))
const bookings=states.flatMap(s=>[
 {id:s.id,gateId:'one',gateX:780,
  targetY:target(s),scheduledSeconds:24},
 {id:s.id,gateId:'two',gateX:1260,
  targetY:target(s),scheduledSeconds:84}])
const before=JSON.stringify({states,req,bookings})
const trial=step87CorridorCandidatesV3(states,req,bookings)
const graph=trial.order
assert.equal(trial.candidates.length,4)
assert(graph.entries.length===10)
assert(graph.edges.length>=4,'A87 no multi-row corridor precedence')
assert(graph.edges.some(e=>e.type==='SHARED_NARROW_CORRIDOR'))
assert.equal(graph.nextGateKinematicChains,10,
 'A87 next physical gate is not chained after the first')
assert.equal(graph.gatesScheduled,2)
for(const c of graph.nextGateEntries){
 if(!c.provisionalChain)continue;
 assert(c.assigned+1e-5>=
  c.previousGateAssigned+c.necessaryTravelAndSteerSeconds,
  'A87 scheduled second gate before physical first-to-second travel')
 for(const edge of graph.nextGateEdges.filter(e=>e.behind===c.i)){
  const lead=graph.nextGateEntries.find(e=>e.i===edge.ahead)
  if(lead?.assigned!==null)assert(
   c.assigned+1e-5>=lead.assigned+edge.requiredGapSeconds,
   'A87 scheduled second gate overlapping previous row')
 }
}
for(const edge of graph.edges){
 const ahead=states[edge.ahead],rear=states[edge.behind]
 assert(ahead.x>=rear.x-1e-7,
  'A87 geometric order reverses achieved x priority')
 assert(edge.requiredGapSeconds>=.5)
}
for(const e of graph.entries){
 const incoming=graph.edges.filter(x=>x.behind===e.i)
 for(const edge of incoming){
  const predecessor=graph.entries.find(x=>x.i===edge.ahead)
  if(e.assigned!==null&&predecessor.assigned!==null)
   assert(e.assigned+1e-5>=predecessor.assigned+
    edge.requiredGapSeconds,
    'A87 group booking assigned overlapping same corridor arrivals')
 }
}
assert.equal(trial.officialWrites,0)
assert.equal(graph.noSufficientJointFeasibilityProof,true)
assert.equal(JSON.stringify({states,req,bookings}),before)
const transforms=[
 [states.map(s=>({...s,y:4.4-s.y})),
  req.map(r=>({...r,targetY:4.4-r.targetY})),
  bookings.map(b=>({...b,targetY:4.4-b.targetY}))],
 [states.map(s=>({...s,id:'rename_'+s.id})),
  req.map(r=>({...r,id:'rename_'+r.id})),
  bookings.map(b=>({...b,id:'rename_'+b.id}))],
 [[...states].reverse(),[...req].reverse(),[...bookings].reverse()]
]
for(let t=0;t<transforms.length;t++){
 const [a,b,c]=transforms[t]
 const transformed=step87CorridorCandidatesV3(a,b,c)
 assert.equal(graph.edges.length,transformed.order.edges.length)
 assert.equal(graph.deferredRiders,transformed.order.deferredRiders)
 assert.equal(graph.nextGateKinematicChains,
  transformed.order.nextGateKinematicChains)
 assert.equal(graph.nextGateEdges.length,
  transformed.order.nextGateEdges.length)
 for(let policy=0;policy<4;policy++)
 for(let i=0;i<states.length;i++){
  const original=trial.candidates[policy].requests[i]
  const actual=transformed.candidates[policy].requests[
   t===2?states.length-1-i:i]
  assert(eq(original.speed,actual.speed),
   'A87 geometry-neutral pace mismatch')
  assert(t===0?eq(original.targetY+actual.targetY,4.4):
   eq(original.targetY,actual.targetY),
   'A87 mirror/name/order changes selected lateral motion')
 }
}
const tied=[
 {id:'left',x:600,y:1.25,v:9},
 {id:'right',x:600,y:3.15,v:9}
]
const ties=step87CorridorCandidatesV3(tied,
 tied.map(x=>({id:x.id,speed:9,targetY:2.2})),
 tied.map(x=>({id:x.id,gateId:'one',gateX:780,
  targetY:2.2,scheduledSeconds:23})))
assert.equal(ties.order.geometryTies,2)
assert(ties.order.entries.every(e=>e.blocked))
assert(ties.candidates.every(c=>c.requests.every(
 (r,i)=>eq(r.targetY,tied[i].y))))
// A close rear cyclist with an immediate lateral merge MUST yield
// until achieved leading-row x separation exists; no ID priority.
const closeStates=[
 {id:'front',x:600,y:1.25,v:8},
 {id:'rear',x:597,y:2.2,v:10}
]
const closeReq=[
 {id:'front',speed:8,targetY:1.25},
 {id:'rear',speed:10,targetY:1.25}
]
const closeBook=closeStates.map(s=>({id:s.id,gateId:'gate-one',
 gateX:780,targetY:1.25,scheduledSeconds:24}))
const close=step87CorridorCandidatesV3(
 closeStates,closeReq,closeBook)
assert(close.order.edges.some(e=>e.ahead===0&&e.behind===1))
assert.equal(close.candidates[0].requests[1].targetY,2.2)
assert(close.candidates[2].requests[1].speed<10,
 'A87 pace variant did not respond to physical closing headway')
assert(close.candidates[3].requests[1].speed<10,
 'A87 balanced variant did not respond to physical closing headway')
assert.throws(()=>step87CorridorOrderV3(states,
 [req[0],req[0],...req.slice(2)],bookings))
const matrix=[]
for(const pacePolicy of ['corridor_order_v1','corridor_release_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const initial=createMultiGatePhysicalCandidateV3(n,{
  mode:'five_dense',roadGeometry,pacePolicy,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',rollingStartSpeedMps:n>=106?9:null})
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(initial.admission.bookedCount,2*n)
 const frozen=JSON.stringify(initial)
 const limit=n===8?40:n===32?50:30
 const done=runMultiGatePhysicalCandidateV3(initial,{seconds:limit})
 assert.equal(JSON.stringify(initial),frozen)
 assert.equal(done.officialWrites,0)
 assert(done.physical.at>=0&&done.physical.at<=limit)
 const metrics=multiGatePhysicalMetricsV3(initial,done)
 if(pacePolicy==='corridor_order_v1')
  assert.equal(metrics.nearStops,0,
   'A87 strict committed a real near-stop')
 if(done.reason){
  assert.equal(done.physical.reason,null,
   'A87 committed a rejected original swept physical movement')
  assert.equal(done.status,'REJECTED')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(done))
 }else assert.equal(done.physical.at,limit)
 assert(done.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,done.physical.at)))
 assert(done.step87SelectedTicks>=done.physical.acceptedSteps)
 assert(done.step87SelectedTicks<=done.physical.acceptedSteps+1)
 matrix.push({n,roadGeometry,pacePolicy,
  acceptedSeconds:done.physical.at,targetSeconds:limit,
  reason:done.reason??'TEST_HORIZON_COMPLETED',
  nearStops:metrics.nearStops,laneChanges:metrics.laneChanges,
  rearX:metrics.rearX,allPastSecondGate:metrics.allPastSecondReopening,
  firstRejectedContact:metrics.firstCollision?.pair??null,
  firstRoadExit:metrics.firstRoadViolation?.riderId??null,
  predecessorEdgesSeen:done.step87OrderEdges,
  necessaryWindowWarnings:done.step87WindowWarnings,
  selectedPolicies:done.step87SelectedPolicies,
  full180SportingSuccess:!done.reason&&done.physical.at===180&&
   metrics.nearStops===0&&metrics.allPastSecondReopening})
}
const report={study:'A87_GEO_NEUTRAL_MULTIROW_ORDER_PHYSICAL_MATRIX',
 pureGeometryOrderAndTieTests:'PASS',strictA64Rejection:'PASS',
 matrixCount:matrix.length,officialWrites:0,
 largeFull180SportingSuccess:matrix.filter(x=>x.n>=106&&
  x.full180SportingSuccess).length,
 best:Object.fromEntries([8,32,106,168].map(n=>[
 n,matrix.filter(x=>x.n===n)
  .sort((a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]])),
 matrix}
const dir=process.env.V3_A2_STEP87_DIR??'/tmp/a87'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a87-row-order-true-a64-matrix.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
