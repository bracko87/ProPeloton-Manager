/** Step84 causal 2D multi-group consensus, symmetry and true physical
 * accepted bicycle matrix. Technical green means truthful failed moves.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {step84CrossingConsensusV3,
 step84ConsensusCandidatesV3} from './a2Step84CrossingConsensusV3.mjs'
import {createMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,multiGatePhysicalMetricsV3}
 from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=[
 {id:'a',x:600,y:1.25,v:9},
 {id:'b',x:600,y:3.15,v:9},
 {id:'c',x:595,y:1.25,v:10},
 {id:'d',x:595,y:3.15,v:10}
]
const req=[
 {id:'a',speed:9,targetY:3.15},
 {id:'b',speed:9,targetY:1.25},
 {id:'c',speed:10,targetY:3.15},
 {id:'d',speed:10,targetY:1.25}
]
const saved=JSON.stringify({states,req})
const plan=step84ConsensusCandidatesV3(states,req)
assert(plan.consensus.urgentPairs>=1,
 'A84 did not recognize immediate identical-x lane swap')
assert(plan.consensus.ambiguousPairs>=1)
assert(plan.consensus.holdCount>=2)
assert.equal(plan.candidates.length,4)
assert.equal(plan.candidates[0].requests[0].targetY,states[0].y)
assert.equal(plan.candidates[0].requests[1].targetY,states[1].y)
assert.equal(plan.consensus.noPhysicalGuarantee,true)
assert.equal(plan.officialWrites,0)
assert.equal(JSON.stringify({states,req}),saved)
const mirror=step84ConsensusCandidatesV3(
 states.map(s=>({...s,y:4.4-s.y})),
 req.map(r=>({...r,targetY:4.4-r.targetY})))
const rename=step84ConsensusCandidatesV3(
 states.map(s=>({...s,id:'renamed'+s.id})),
 req.map(r=>({...r,id:'renamed'+r.id})))
assert.equal(plan.consensus.urgentPairs,mirror.consensus.urgentPairs)
assert.equal(plan.consensus.urgentPairs,rename.consensus.urgentPairs)
for(let p=0;p<4;p++)for(let i=0;i<states.length;i++){
 const a=plan.candidates[p].requests[i],
  b=mirror.candidates[p].requests[i],
  c=rename.candidates[p].requests[i]
 assert(eq(a.speed,b.speed)&&eq(a.targetY+b.targetY,4.4),
  'A84 reflected request disparity')
 assert(eq(a.speed,c.speed)&&eq(a.targetY,c.targetY),
  'A84 identity affected consent request')
}
const reversed=step84ConsensusCandidatesV3(
 [...states].reverse(),[...req].reverse())
for(let p=0;p<4;p++)for(let i=0;i<states.length;i++){
 const a=plan.candidates[p].requests[i],
  b=reversed.candidates[p].requests[states.length-1-i]
 assert(eq(a.speed,b.speed)&&eq(a.targetY,b.targetY),
  'A84 pair traversal order caused conflicting movement')
}
assert.throws(()=>step84ConsensusCandidatesV3(states,
 [req[0],req[0],...req.slice(2)]))
assert.throws(()=>step84CrossingConsensusV3(states,req,{
 urgentSeconds:14}))
const trials=[]
for(const pacePolicy of ['consensus_hold_v1','consensus_wave_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const initial=createMultiGatePhysicalCandidateV3(n,{
  mode:'five_dense',pacePolicy,roadGeometry,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',rollingStartSpeedMps:n>=106?9:null})
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 const original=JSON.stringify(initial)
 const horizon=n===8?45:n===32?55:25
 const done=runMultiGatePhysicalCandidateV3(initial,{seconds:horizon})
 assert.equal(JSON.stringify(initial),original)
 assert.equal(done.officialWrites,0)
 assert(done.physical.at>=0&&done.physical.at<=horizon)
 assert(done.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,done.physical.at)))
 const m=multiGatePhysicalMetricsV3(initial,done)
 if(done.reason){
  assert.equal(done.status,'REJECTED')
  assert.equal(done.physical.reason,null,
    'A84 committed original swept-body rejected movement')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(done))
 }else assert.equal(done.physical.at,horizon)
 assert(done.step84SelectedTicks>=done.physical.acceptedSteps)
 assert(done.step84SelectedTicks<=done.physical.acceptedSteps+1)
 trials.push({n,roadGeometry,pacePolicy,
  acceptedSeconds:done.physical.at,testSeconds:horizon,
  reason:done.reason??'TEST_HORIZON_ACCEPTED',
  firstContact:m.firstCollision?.pair??null,
  firstRoadViolation:m.firstRoadViolation?.riderId??null,
  nearStopRiderTicks:m.nearStops,physicalLaneChanges:m.laneChanges,
  rearX:m.rearX,allPastSecondGate:m.allPastSecondReopening,
  urgentConflictPairTicks:done.step84UrgentPairTicks,
  heldRequestTicks:done.step84HeldRequestTicks,
  selectedPolicies:done.step84SelectedPolicies,
  clean180:!done.reason&&done.physical.at===180&&
   m.allPastSecondReopening&&m.nearStops===0})
}
const report={study:'A84_SIMULTANEOUS_CROSSING_ORDER_PHYSICAL_MATRIX',
 technicalGate:'PASS_ONLY_IF_REAL_SWEPT_REJECTION_RETAINED',
 noTeleportedBicycles:true,realA64PhysicsUnchanged:true,
 physicalTrials:trials.length,officialWrites:0,
 largeFiveAbreastFull180:trials.filter(t=>t.n>=106&&t.clean180).length,
 best:Object.fromEntries([8,32,106,168].map(n=>[
  n,trials.filter(t=>t.n===n).sort(
   (a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]])),
 trials}
const dir=process.env.V3_A2_STEP84_DIR??'/tmp/v3step84'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a84-crossing-consensus-true-swept.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
