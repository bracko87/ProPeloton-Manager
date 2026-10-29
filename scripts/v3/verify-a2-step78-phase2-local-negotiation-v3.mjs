/** A78 Phase2 evidence: real original swept-body physics; local 3–8 riders.
 * PASS on safety instrumentation does not imply 106/168 sporting success.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {localRiskNeighborhoodV3,localNegotiatedRequestsV3,
 chooseLocalNegotiatedPhysicalTickV3} from './a2Step78LocalNegotiationV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=[
 {id:'a',x:600,y:1.25,v:8.4},
 {id:'b',x:596,y:1.25,v:9.6},
 {id:'c',x:600,y:2.2,v:8.8},
 {id:'d',x:590,y:2.2,v:9.1}
]
const req=[
 {id:'a',speed:5,targetY:2.2},
 {id:'b',speed:9.6,targetY:1.25},
 {id:'c',speed:8.8,targetY:1.25},
 {id:'d',speed:9.1,targetY:2.2}
]
const before=JSON.stringify({states,req})
const neighborhood=localRiskNeighborhoodV3(states,req)
assert(neighborhood.size>=3&&neighborhood.size<=8)
const regular=localNegotiatedRequestsV3(states,req)
assert(regular.heldLanes>0)
assert(regular.brakedFollowers>=1)
const mirror=localNegotiatedRequestsV3(
 states.map(s=>({...s,y:4.4-s.y})),
 req.map(r=>({...r,targetY:4.4-r.targetY})))
const renamed=localNegotiatedRequestsV3(
 states.map(s=>({...s,id:'z'+s.id})),
 req.map(r=>({...r,id:'z'+r.id})))
for(let i=0;i<states.length;i++){
 assert(eq(regular.requests[i].speed,mirror.requests[i].speed))
 assert(eq(regular.requests[i].targetY+mirror.requests[i].targetY,4.4))
 assert(eq(regular.requests[i].speed,renamed.requests[i].speed))
 assert(eq(regular.requests[i].targetY,renamed.requests[i].targetY))
}
assert.equal(JSON.stringify({states,req}),before)
assert.throws(()=>localNegotiatedRequestsV3(states,
 [req[0],req[0],req[2],req[3]]))
assert.throws(()=>localRiskNeighborhoodV3(states,req,{maxRiders:9}))
const original={at:0,acceptedSteps:0,nearStops:0,
 cumulativeAdvancement:0,states}
const physicalStep=p=>p.states[0].targetY===p.states[0].y?
 {...p,at:.5,acceptedSteps:1,cumulativeAdvancement:20,reason:null}:
 {...p,reason:'SWEPT_CONTACT',firstCollision:{pair:['a','c']}}
const choice=chooseLocalNegotiatedPhysicalTickV3(
 original,req,req,physicalStep,{enablePreemptive:true})
assert.equal(choice.status,'ACCEPTED')
assert(choice.probes.some(p=>p.accepted))
assert(choice.rejectedUncommitted>0)
assert.equal(JSON.stringify({states,req}),before)
assert.equal(choice.officialWrites,0)
const denied=chooseLocalNegotiatedPhysicalTickV3(original,req,req,
 p=>({...p,reason:'SWEPT_CONTACT',
  firstCollision:{pair:['a','c']}}))
assert.equal(denied.status,'NO_ACCEPTABLE_PROPOSAL')
assert.equal(denied.physical,null)
const trials=[]
for(const pacePolicy of ['joint_local_negotiation_v1',
 'joint_local_preemptive_v1'])
for(const n of [8,32,106,168])
for(const geometry of ['staged_pinch','double_pinch'])
for(const speed of (n>=106?[null,9]:[null])){
 const args={mode:'five_dense',roadGeometry:geometry,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',pacePolicy,
  rollingStartSpeedMps:speed}
 const init=createMultiGatePhysicalCandidateV3(n,args)
 assert.equal(init.admission.status,'NECESSARY_WINDOWS_EXIST')
 const frozen=JSON.stringify(init)
 const final=runMultiGatePhysicalCandidateV3(init,{seconds:180})
 assert.equal(JSON.stringify(init),frozen)
 assert.equal(final.officialWrites,0)
 assert(final.physical.at>=0&&final.physical.at<=180)
 assert(final.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&eq(s.energy.seconds,
  final.physical.at)))
 if(final.reason){
  assert.equal(final.status,'REJECTED')
  assert.equal(final.physical.reason,null)
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(final))
 }else assert.equal(final.physical.at,180)
 const m=multiGatePhysicalMetricsV3(init,final)
 trials.push({n,geometry,speed,policy:pacePolicy,
  status:final.reason??'FULL_HORIZON_CLEAR',seconds:final.physical.at,
  noContactAndRoadViolation:final.reason===null,
  lastRiderX:m.rearX,allPastSecondReopening:m.allPastSecondReopening,
  nearStopTicks:m.nearStops,completedLateralChanges:m.laneChanges,
  rejectedPair:m.firstCollision?.pair??null,
  firstRoadExit:m.firstRoadViolation?.riderId??null,
  acceptedLocalNegotiatedTicks:final.localNegotiatedTicks,
  rejectedUncommittedTrialCount:final.localRejectedTrialTicks,
  neighborhoodRiderTicks:final.localNeighborhoodRiderTicks})
}
const best={};
for(const n of [32,106,168])best[n]=trials.filter(x=>x.n===n)
 .sort((a,b)=>b.seconds-a.seconds)[0]
const summary={study:'A78_PHASE2_3_TO_8_BICYCLE_LOCAL_NEGOTIATION',
 technicalGate:'PASS_FOR_STRICT_PHYSICAL_RESULTS_ONLY',
 sportingGate:'NO_GO_UNTIL_ALL_LARGE_FIELDS_PASS',
 tested:trials.length,acceptedLargeFullRuns:trials.filter(x=>
 x.n>=106&&x.seconds===180&&x.allPastSecondReopening&&
 x.nearStopTicks===0).length,
 noMotionRepair:true,authoritativeSolverUnchanged:true,
 syntheticallyPredictedNotAcceptedPath:true,
 independentSportsApproval:false,officialWrites:0,best,trials}
const dir=process.env.V3_A2_STEP78_PHASE2_DIR??'/tmp/a78-phase2'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a78-phase2-local-physical-outcomes.json',
 JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary))
