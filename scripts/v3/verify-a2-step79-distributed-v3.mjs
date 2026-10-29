/** A79 distributed space-time multi-neighborhood current-state pilot.
 * Audit must report *real accepted physics*, not interpret a green test
 * as sporting success when 106/168 have rejected first contacts.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {distributedNeighborhoodsV3,
 distributedAdmissionCandidatesV3} from './a2Step79DistributedAdmissionV3.mjs'
import {chooseDistributedPhysicalTickV3} from './a2Step79PhysicalChoiceV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const states=[
 {id:'aa',x:600,y:1.25,v:8.4,startX:600},
 {id:'bb',x:595,y:1.25,v:9.6,startX:595},
 {id:'cc',x:600,y:2.2,v:8.8,startX:600},
 {id:'dd',x:595,y:2.2,v:9.2,startX:595},
 {id:'ee',x:590,y:1.25,v:8.8,startX:590},
 {id:'ff',x:585,y:2.2,v:9.1,startX:585},
 {id:'gg',x:580,y:1.25,v:8.7,startX:580},
 {id:'hh',x:575,y:2.2,v:9.4,startX:575}
]
const req=states.map(s=>({id:s.id,speed:8.8,targetY:2.2}))
const desired=Object.fromEntries(states.map(s=>[s.id,9.1]))
const frozen=JSON.stringify({states,req,desired})
const analysis=distributedAdmissionCandidatesV3(states,req,desired)
assert.equal(analysis.candidates.length,4)
assert(analysis.graph.groups.length>=2)
assert(analysis.graph.coveredRiders>=3)
assert(analysis.graph.overlappingRiders>=1)
assert(analysis.graph.maxNeighborhood<=8)
assert(analysis.candidates.every(x=>x.requests.length===states.length))
assert.equal(JSON.stringify({states,req,desired}),frozen)
const mirror=distributedAdmissionCandidatesV3(
 states.map(s=>({...s,y:4.4-s.y})),
 req.map(r=>({...r,targetY:4.4-r.targetY})),desired)
const renamed=distributedAdmissionCandidatesV3(
 states.map(s=>({...s,id:'z'+s.id})),
 req.map(r=>({...r,id:'z'+r.id})),
 Object.fromEntries(states.map(s=>['z'+s.id,9.1])))
assert.equal(analysis.graph.edgeCount,mirror.graph.edgeCount)
assert.equal(analysis.graph.edgeCount,renamed.graph.edgeCount)
for(let c=0;c<4;c++)for(let i=0;i<states.length;i++){
 const a=analysis.candidates[c].requests[i],
  b=mirror.candidates[c].requests[i],
  d=renamed.candidates[c].requests[i]
 assert(eq(a.speed,b.speed)&&eq(a.targetY+b.targetY,4.4),
  'A79 reflect c'+c+' i'+i+' base='+JSON.stringify(a)+
  ' mirror='+JSON.stringify(b))
 assert(eq(a.speed,d.speed)&&eq(a.targetY,d.targetY))
}
assert.throws(()=>distributedAdmissionCandidatesV3(states,
 [req[0],req[0],...req.slice(2)],desired))
const physical={at:0,acceptedSteps:0,nearStops:0,
 cumulativeAdvancement:0,states}
const opts=[{policy:'unsafe',requests:req},
 {policy:'safe',requests:analysis.candidates[0].requests}]
const fake=s=>s.states[0].desired===8.8?
 {...s,reason:'SWEPT_CONTACT'}:
 {...s,reason:null,at:.5,acceptedSteps:1,
 nearStops:0,cumulativeAdvancement:9}
const optionTest=chooseDistributedPhysicalTickV3(physical,opts,fake)
assert.equal(optionTest.status,'PHYSICALLY_ACCEPTED')
assert.equal(optionTest.policy,'safe')
assert.equal(optionTest.rejectedUncommitted,1)
assert.equal(optionTest.officialWrites,0)
const denied=chooseDistributedPhysicalTickV3(physical,opts,
 x=>({...x,reason:'SWEPT_CONTACT'}))
assert.equal(denied.status,'NO_SAFE_PROPOSAL')
assert.equal(denied.physical,null)
const trials=[]
for(const policy of ['distributed_multiwave_v1','distributed_risk_v1'])
for(const n of [8,32,106,168])
 for(const geometry of ['staged_pinch','double_pinch'])
  for(const speed of (n>=106?[null,9]:[null])){
   const config={mode:'five_dense',roadGeometry:geometry,
    controllerPolicy:'coordinated_demand',headwayStandOffM:4.5,
    coreMergePolicy:'preview_only',pacePolicy:policy,
    rollingStartSpeedMps:speed}
   const initial=createMultiGatePhysicalCandidateV3(n,config)
   assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
   const original=JSON.stringify(initial)
   const final=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
   assert.equal(JSON.stringify(initial),original,
    'A79 mutated previously accepted field or initial admission')
   assert.equal(final.officialWrites,0)
   assert(final.physical.at>=0&&final.physical.at<=180)
   assert(final.physical.states.every(s=>s.v>=0&&
     s.energy.remainingWPrimeJoules>=0&&
     eq(s.energy.seconds,final.physical.at)))
   assert.equal(final.distributedSelectedTicks,final.physical.acceptedSteps)
   if(final.reason){
    assert.equal(final.physical.reason,null,
     'A79 committed a rejected swept-body tick')
    assert.throws(()=>advanceMultiGatePhysicalCandidateV3(final))
   }else assert.equal(final.physical.at,180)
   const m=multiGatePhysicalMetricsV3(initial,final)
   trials.push({n,geometry,speed,policy,
    acceptedSeconds:final.physical.at,
    status:final.reason??'FULL_HORIZON_ACCEPTED',
    noNearStopFullPhysicalFinish:!final.reason&&
     m.allPastSecondReopening&&m.nearStops===0,
    rearX:m.rearX,firstCollision:m.firstCollision?.pair??null,
    firstRoadExit:m.firstRoadViolation?.riderId??null,
    nearStopRiderTicks:m.nearStops,
    physicalLaneChanges:m.laneChanges,
    selectedPolicies:final.distributedPolicyTicks,
    rejectedUncommittedCandidates:final.distributedRejectedTrialCount,
    overlappingGroupRiderTicks:final.distributedOverlappingRiderTicks})
  }
const outcomes={study:'A79_DISTRIBUTED_MULTI_NEIGHBORHOOD_RISK_5_COLUMN_PHYSICS',
 technicalGate:'PASS_IF_ALL_STRICT_AUDITS_HOLD',
 noOriginalPhysicsChanges:true,noProductionAuthorization:true,
 syntheticNotVerifiedRealRoads:true,
 trialCount:trials.length,
 fullyClearLarge:trials.filter(t=>t.n>=106&&
  t.noNearStopFullPhysicalFinish).length,
 best:Object.fromEntries([32,106,168].map(n=>[n,trials.filter(t=>t.n===n)
   .sort((a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]])),
 sportingApproval:'NOT_APPROVED',officialWrites:0,trials}
const dir=process.env.V3_A2_STEP79_DIR??'/tmp/a79-distributed'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a79-distributed-physics-matrix.json',
 JSON.stringify(outcomes,null,2)+'\n')
console.log(JSON.stringify(outcomes))
