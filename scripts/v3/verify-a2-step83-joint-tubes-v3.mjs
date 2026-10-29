/** A83: 2D simultaneous crossing risk and actual full-body physics.
 * A green result certifies honest acceptance/rejection, not a release.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {jointReachableTubesV3,step83JointTubeCandidatesV3}
 from './a2Step83JointTubesV3.mjs'
import {createMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,multiGatePhysicalMetricsV3}
 from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=[
 {id:'a',x:600,y:1.25,v:9,startX:600},
 {id:'b',x:600,y:3.15,v:9,startX:600},
 {id:'c',x:595,y:1.25,v:9.5,startX:595},
 {id:'d',x:595,y:3.15,v:9.5,startX:595}
]
const requests=[
 {id:'a',speed:9,targetY:3.15},
 {id:'b',speed:9,targetY:1.25},
 {id:'c',speed:9,targetY:3.15},
 {id:'d',speed:9,targetY:1.25}
]
const original=JSON.stringify({states,requests})
const tube=step83JointTubeCandidatesV3(states,requests,{horizonSeconds:6})
assert(tube.tubes.warnings.length>=2)
assert(tube.tubes.warnings.some(w=>w.equalX))
assert(tube.tubes.groups.some(g=>g.length>=2))
assert(tube.tubes.firstRiskSeconds>0)
assert(tube.candidates[0].lateralHeld>=2)
assert(tube.candidates[2].originalPhysicsStillMandatory)
assert.equal(tube.tubes.unavoidableContactProven,false)
assert.equal(tube.officialWrites,0)
assert.equal(JSON.stringify({states,requests}),original)
const mirrored=step83JointTubeCandidatesV3(
 states.map(s=>({...s,y:4.4-s.y})),
 requests.map(r=>({...r,targetY:4.4-r.targetY})))
const renamed=step83JointTubeCandidatesV3(
 states.map(s=>({...s,id:'z'+s.id})),
 requests.map(r=>({...r,id:'z'+r.id})))
assert.equal(tube.tubes.warnings.length,mirrored.tubes.warnings.length)
assert.equal(tube.tubes.warnings.length,renamed.tubes.warnings.length)
assert(eq(tube.tubes.firstRiskSeconds,mirrored.tubes.firstRiskSeconds))
for(let k=0;k<4;k++)for(let i=0;i<states.length;i++){
 const a=tube.candidates[k].requests[i],
 b=mirrored.candidates[k].requests[i],
 c=renamed.candidates[k].requests[i]
 assert(eq(a.speed,b.speed)&&eq(a.targetY+b.targetY,4.4))
 assert(eq(a.speed,c.speed)&&eq(a.targetY,c.targetY))
}
assert.throws(()=>jointReachableTubesV3(states,
 [requests[0],requests[0],...requests.slice(2)]))
assert.throws(()=>jointReachableTubesV3(states,requests,{
 horizonSeconds:14}))
const noSwap=jointReachableTubesV3(
 states.slice(0,2),
 [{id:'a',speed:9,targetY:1.25},
  {id:'b',speed:9,targetY:3.15}])
assert.equal(noSwap.warnings.length,0)
const matrix=[]
for(const policy of ['joint_tube_hold_v1','joint_tube_release_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const opts={mode:'five_dense',pacePolicy:policy,roadGeometry,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',
  rollingStartSpeedMps:n>=106?9:null}
 const initial=createMultiGatePhysicalCandidateV3(n,opts)
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(initial.admission.bookedCount,2*n)
 const before=JSON.stringify(initial)
 const seconds=n===8?45:n===32?50:25
 const out=runMultiGatePhysicalCandidateV3(initial,{seconds})
 assert.equal(JSON.stringify(initial),before)
 assert.equal(out.officialWrites,0)
 assert(out.physical.at>=0&&out.physical.at<=seconds)
 assert(out.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,out.physical.at)))
 const m=multiGatePhysicalMetricsV3(initial,out)
 if(out.reason){
  assert.equal(out.physical.reason,null,
   'A83 committed authoritative rejected 2D physical motion')
  assert.equal(out.status,'REJECTED')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(out))
 }else assert.equal(out.physical.at,seconds)
 assert(out.step83SelectedTicks>=out.physical.acceptedSteps)
 assert(out.step83SelectedTicks<=out.physical.acceptedSteps+1)
 matrix.push({policy,n,roadGeometry,actualAcceptedSeconds:out.physical.at,
  testHorizonSeconds:seconds,reason:out.reason??'TEST_HORIZON_ACCEPTED',
  sweptCollisionPair:m.firstCollision?.pair??null,
  roadExit:m.firstRoadViolation?.riderId??null,
  nearStopRiderTicks:m.nearStops,acceptedLaneChanges:m.laneChanges,
  rearX:m.rearX,allRidersPastSecondGate:m.allPastSecondReopening,
  projectedWarningPairTicks:out.step83PredictedRiskTicks,
  connectedGroupRiderTicks:out.step83LinkedGroupRiderTicks,
  chosen:out.step83SelectedPolicies,
  full180Clean:!out.reason&&out.physical.at===180&&
   m.allPastSecondReopening&&m.nearStops===0})
}
const report={study:'A83_JOINT_2D_REACHABLE_TUBES_FIRST_PHYSICAL_MATRIX',
 technicalGate:'PASS_FOR_TRUE_A64_PHYSICAL_ASSERTIONS',
 projectedWarningIsNotGuaranteedCollision:true,originalPhysicsUnmodified:true,
 officialWrites:0,tests:matrix.length,
 largeFieldFull180Clean:matrix.filter(t=>t.n>=106&&t.full180Clean).length,
 best:Object.fromEntries([8,32,106,168].map(n=>[
  n,matrix.filter(t=>t.n===n).sort(
   (a,b)=>b.actualAcceptedSeconds-a.actualAcceptedSeconds)[0]])),
 matrix}
const dir=process.env.V3_A2_STEP83_DIR??'/tmp/a83tube'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a83-2d-tube-physical-matrix.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
