/** A78 first physical coupling screen. A green technical test means
 * accurate PASS/NO-GO classification, NOT a successful 106/168 peloton.
 * All movements are accepted by the unchanged A64 swept-body solver.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {jointViabilityCommandsV3} from './a2Step78JointViabilityV3.mjs'
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const close=(a,b)=>Math.abs(a-b)<1e-5
const states=[{id:'A',x:600,y:1.25,v:8.3},
 {id:'B',x:596,y:1.25,v:9.4},
 {id:'C',x:600,y:2.2,v:8.8}]
const requests=[{id:'A',speed:5.3,targetY:2.2},
 {id:'B',speed:9.4,targetY:1.25},
 {id:'C',speed:8.8,targetY:1.25}]
const before=JSON.stringify({states,requests})
const plain=jointViabilityCommandsV3(states,requests)
assert.equal(JSON.stringify({states,requests}),before)
assert(plain.blockedLaneChanges>=1,'A78 must hold crowded merges')
assert.equal(plain.noMotionAuthority,true)
assert.equal(plain.officialWrites,0)
assert.throws(()=>jointViabilityCommandsV3(states,
 [requests[0],requests[0],requests[2]]))
assert.throws(()=>jointViabilityCommandsV3(states,requests,{maxIterations:0}))
const reflected=jointViabilityCommandsV3(
 states.map(s=>({...s,y:4.4-s.y})),
 requests.map(r=>({...r,targetY:4.4-r.targetY})))
const renamed=jointViabilityCommandsV3(
 states.map(s=>({...s,id:'z'+s.id})),
 requests.map(r=>({...r,id:'z'+r.id})))
assert.equal(plain.blockedLaneChanges,reflected.blockedLaneChanges)
for(let i=0;i<states.length;i++){
 assert(close(plain.requests[i].speed,reflected.requests[i].speed))
 assert(close(plain.requests[i].targetY+
  reflected.requests[i].targetY,4.4))
 assert(close(plain.requests[i].speed,renamed.requests[i].speed))
 assert(close(plain.requests[i].targetY,renamed.requests[i].targetY))
}
const risk=jointViabilityCommandsV3([
 {id:'a',x:679,y:.3,v:10},{id:'b',x:660,y:2.2,v:9}],
 [{id:'a',speed:12,targetY:.3},{id:'b',speed:9,targetY:2.2}],
 {roadEnvelope:x=>researchRoadEnvelopeV3('strong_pinch',x)})
assert(risk.roadWarnings>0,'A78 must forecast narrowing road body edge')
const trials=[]
for(const n of [8,32,106,168]){
 for(const geometry of ['staged_pinch','double_pinch']){
  for(const startSpeed of [null,9]){
   const opts={mode:'five_dense',roadGeometry:geometry,
    headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
    pacePolicy:'joint_viability_v1',rollingStartSpeedMps:startSpeed,
    coreMergePolicy:'preview_only'}
   const initial=createMultiGatePhysicalCandidateV3(n,opts)
   assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
   const originalJson=JSON.stringify(initial)
   const final=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
   assert.equal(JSON.stringify(initial),originalJson,
    'A78 changed initial physical state or gate reservations')
   assert.equal(final.officialWrites,0)
   assert(final.physical.at<=180)
   assert(final.physical.states.every(s=>s.v>=0&&
    s.energy.remainingWPrimeJoules>=0&&
    close(s.energy.seconds,final.physical.at)))
   const metrics=multiGatePhysicalMetricsV3(initial,final)
   if(final.reason){
    assert.equal(final.status,'REJECTED')
    assert.equal(final.physical.reason,null,
     'A78 improperly committed rejected original physics tick')
    assert.throws(()=>advanceMultiGatePhysicalCandidateV3(final))
   }else assert.equal(final.physical.at,180)
   const complete=!final.reason&&
    final.physical.states.every(s=>s.x>1470)&&
    metrics.nearStops===0
   trials.push({n,geometry,startSpeedMps:startSpeed,
    reason:final.reason,acceptedSeconds:final.physical.at,
    allPastSecondOpening:metrics.allPastSecondReopening,
    laneChanges:metrics.laneChanges,nearStops:metrics.nearStops,
    collision:metrics.firstCollision?.pair??null,
    roadExit:metrics.firstRoadViolation?.riderId??null,
    jointBlockedLaneChangeTicks:final.jointBlockedLaneChangeTicks,
    jointLeadProtectionTicks:final.jointLeadProtectionTicks,
    jointEarlyBrakeRiderTicks:final.jointEarlyBrakeRiderTicks,
    jointUnresolvedWarningTicks:final.jointUnresolvedWarningTicks,
    physicallyClearAndNoNearStops:complete})
  }
 }
}
const long=trials.filter(t=>t.n>=106)
const completeLarge=long.filter(t=>t.physicallyClearAndNoNearStops)
const best=Object.fromEntries([32,106,168].map(n=>[n,
 trials.filter(t=>t.n===n).sort((a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]]))
const output={study:'A78_JOINT_2D_VIABILITY_FIRST_PHYSICAL_SCREEN',
 technicalGate:'PASS_ONLY_IF_PHYSICAL_TEST_ASSERTIONS_HOLD',
 sportingGate:completeLarge.length===4?'REQUIRES_MORE_VALIDATION':'NO_GO',
 fieldCount:trials.length,
 fullyClearLargeCount:completeLarge.length,
 allPhysicalSolverGuardsUnchanged:true,mirrorAndRenamePureParity:true,
 noDatabaseWrites:true,officialWrites:0,best,trials}
const dir=process.env.V3_A2_STEP78_DIR??'/tmp/a2-step78'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a78-joint-viability-physical-pilot.json',
 JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output))
