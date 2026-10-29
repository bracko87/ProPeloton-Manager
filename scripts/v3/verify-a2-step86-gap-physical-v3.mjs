/** Step86: assert original A64 physical authority plus symmetric real
 * multirider forward gap requests. A rejected race is NOT sporting PASS.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {step86RequiredGapV3,step86MultiRowGapPlanV3,
 step86GapCandidatesV3} from './a2Step86MultiRowGapV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=Array.from({length:10},(_,i)=>({
 id:'r'+i,x:600-Math.floor(i/5)*5.2,
 startX:600-Math.floor(i/5)*5.2,y:.3+(i%5)*.95,v:9}))
const target=s=>s.y<2.2?1.25:s.y>2.2?3.15:1.25
const req=states.map(s=>({id:s.id,speed:9,targetY:target(s)}))
const bookings=states.map(s=>({id:s.id,gateId:'gate-1',
 gateX:780,scheduledSeconds:21,targetY:target(s)}))
const frozen=JSON.stringify({states,req,bookings})
const plan=step86GapCandidatesV3(states,req,bookings,{lookAheadM:100})
assert.equal(plan.candidates.length,4)
assert.equal(plan.plan.fiveAbreastRows,2)
assert(plan.plan.holdRequests>=4,
 'A86 did not delay any same-row nonfeasible lateral merge')
assert(plan.plan.unsatisfiedMergeGaps>=4)
// Front row may open its gap; the same-side inner rider in the next
// row must NOT accelerate while it would consume the leading row's gap.
for(const i of [1,3])assert(Number.isFinite(
 plan.plan.leadBoosts[i]),'A86 did not assist a clear front-row inner rider')
for(const i of [6,8])assert(!Number.isFinite(
 plan.plan.leadBoosts[i]),'A86 accelerated into the preceding row')
assert.equal(plan.plan.futureMotionNotGuaranteed,true)
assert.equal(plan.officialWrites,0)
assert(plan.candidates[1].assisted>0)
assert(plan.candidates[0].held>0)
assert(plan.candidates[2].coasted>=0)
assert.equal(JSON.stringify({states,req,bookings}),frozen)
const front={x:600,v:8.5},rear={x:596,v:9.5}
assert(step86RequiredGapV3(front,rear)>
 step86RequiredGapV3(front,{...rear,v:8.5}))
assert.throws(()=>step86RequiredGapV3(front,rear,{responseSeconds:20}))
const mirror=step86GapCandidatesV3(
 states.map(s=>({...s,y:4.4-s.y})),
 req.map(r=>({...r,targetY:4.4-r.targetY})),
 bookings.map(b=>({...b,targetY:4.4-b.targetY})),
 {lookAheadM:100})
const renamed=step86GapCandidatesV3(
 states.map(s=>({...s,id:'z'+s.id})),
 req.map(r=>({...r,id:'z'+r.id})),
 bookings.map(b=>({...b,id:'z'+b.id})),
 {lookAheadM:100})
const reversed=step86GapCandidatesV3(
 [...states].reverse(),[...req].reverse(),[...bookings].reverse(),
 {lookAheadM:100})
for(let k=0;k<4;k++)for(let i=0;i<states.length;i++){
 const a=plan.candidates[k].requests[i],
  b=mirror.candidates[k].requests[i],
  c=renamed.candidates[k].requests[i],
  d=reversed.candidates[k].requests[states.length-i-1]
 assert(eq(a.speed,b.speed)&&eq(a.targetY+b.targetY,4.4),
  'A86 mirror changed requested physical acceleration/steering')
 assert(eq(a.speed,c.speed)&&eq(a.targetY,c.targetY),
  'A86 rider rename changed requested gap control')
 assert(eq(a.speed,d.speed)&&eq(a.targetY,d.targetY),
  'A86 reversed rider order changed synchronized request')
}
assert.throws(()=>step86GapCandidatesV3(states,
 [req[0],req[0],...req.slice(2)],bookings))
const trials=[]
for(const pacePolicy of ['multirow_gap_strict_v1','multirow_gap_wave_v1'])
 for(const n of [8,32,106,168])
  for(const roadGeometry of ['staged_pinch','double_pinch']){
   const initial=createMultiGatePhysicalCandidateV3(n,{
    mode:'five_dense',roadGeometry,pacePolicy,
    headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
    coreMergePolicy:'preview_only',rollingStartSpeedMps:n>=106?9:null})
   assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
   const old=JSON.stringify(initial)
   const seconds=n===8?45:n===32?50:30
   const done=runMultiGatePhysicalCandidateV3(initial,{seconds})
   assert.equal(JSON.stringify(initial),old)
   assert.equal(done.officialWrites,0)
   assert(done.physical.at>=0&&done.physical.at<=seconds)
   const metrics=multiGatePhysicalMetricsV3(initial,done)
   if(pacePolicy==='multirow_gap_strict_v1')
    assert.equal(metrics.nearStops,0,
     'A86 strict did not prevent physically accepted near-stop')
   if(done.reason){
    assert.equal(done.status,'REJECTED')
    assert.equal(done.physical.reason,null,
     'A86 committed rejected original swept 2D bicycle body')
    assert.throws(()=>advanceMultiGatePhysicalCandidateV3(done))
   }else assert.equal(done.physical.at,seconds)
   assert(done.physical.states.every(s=>s.v>=0&&
    s.energy.remainingWPrimeJoules>=0&&
    eq(s.energy.seconds,done.physical.at)))
   assert(done.step86SelectedTicks>=done.physical.acceptedSteps)
   assert(done.step86SelectedTicks<=done.physical.acceptedSteps+1)
   trials.push({n,roadGeometry,pacePolicy,
    acceptedSeconds:done.physical.at,testHorizonSeconds:seconds,
    reason:done.reason??'TEST_HORIZON_COMPLETED',
    nearStopRiderTicks:metrics.nearStops,
    physicalLaneChanges:metrics.laneChanges,
    lastRiderX:metrics.rearX,
    allBeyondSecondReopening:metrics.allPastSecondReopening,
    firstRejectedBodyPair:metrics.firstCollision?.pair??null,
    firstRoadExit:metrics.firstRoadViolation?.riderId??null,
    heldRequestRiderTicks:done.step86HeldRiderTicks,
    sharedCorridorWarningTicks:done.step86Warnings,
    blockedSportingCandidates:done.step86BlockedNoStopTrials,
    noSuitablePhysicalMoveTicks:done.step86NoGoTicks,
    chosen:done.step86SelectedPolicies,
    full180Clean:!done.reason&&done.physical.at===180&&
     metrics.allPastSecondReopening&&metrics.nearStops===0})
  }
const result={study:'A86_PHYSICAL_MULTIROW_GAP_FIRST_MATRIX',
 technicalGate:'TRUE_A64_REJECTION_AND_ZERO_STOP_STRICT_ASSERTED',
 officialWrites:0,testCount:trials.length,
 large106168180Clean:trials.filter(t=>t.n>=106&&t.full180Clean).length,
 best:Object.fromEntries([8,32,106,168].map(n=>[
  n,trials.filter(t=>t.n===n).sort(
   (a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]])),
 trials}
const dir=process.env.V3_A2_STEP86_DIR??'/tmp/a86'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a86-multirow-true-physical-matrix.json',
 JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
