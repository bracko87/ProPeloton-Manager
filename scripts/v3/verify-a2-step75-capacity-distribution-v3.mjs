/** A75 physically bound 168-rider queue redistribution screen.
 * Never infer safety from a theoretical booking alone. No official writes.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,runNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
import {auditTwoSlotFeasibilityV3} from './a2TwoSlotFeasibilityV3.mjs'
const close=(a,b)=>Math.abs(a-b)<1e-5
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3,roadGeometry:'strong_pinch'}
const profiles=[
 ['platoon_gate_frontload','front_loaded'],
 ['platoon_gate_late_pressure','late_pressure'],
 ['platoon_gate_mid_pressure','mid_pressure'],
 ['platoon_gate_late_peak','late_peak'],
 ['platoon_gate_late_moderate','late_moderate'],
 ['platoon_gate_tail_surge','tail_surge'],
 ['platoon_gate_tail_grad','tail_grad'],
 ['platoon_gate_tail_emphasis','tail_emphasis'],
 ['platoon_gate_tail_focus','tail_focus'],
 ['platoon_gate_tail_flip','tail_flip']]
const observed=[]
for(const [policy,profile] of profiles){
 const original=createNormalStartV3(168,{...base,roadMergePolicy:policy})
 const planned=auditTwoSlotFeasibilityV3(original.states,'strong_pinch',
  {halfBikeM:.3,minSpeedMps:5,slotSpacingSeconds:.5,
   slotSpacingProfile:profile})
 assert.equal(original.roadGateStatus,planned.status)
 assert.equal(original.roadGateBookings.length,planned.bookedCount)
 const seconds=120
 const a=runNormalStartV3(original,{seconds})
 const metrics=finishNormalStartMetricsV3(original,a)
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT',
 'ROAD_ENVELOPE_VIOLATION','ENERGY_FAILED','GATE_ENTRY_NO_WINDOW']
 .includes(metrics.status),'A75 unrecognized fail-closed physical status')
 assert(a.at<=seconds&&a.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&close(s.energy.seconds,a.at)),
  'A75 physics clock or W-prime invalid')
 if(metrics.status==='GATE_ENTRY_NO_WINDOW'){
  assert.equal(a.at,0)
  assert.equal(a.acceptedSteps,0)
  assert.deepEqual(a.states,original.states)
 }else if(a.reason)assert.throws(()=>advanceNormalStartV3(a),
  'A75 rejected state was restarted')
 const mirroredStart=createNormalStartV3(168,{...base,
  roadMergePolicy:policy,mirror:true})
 const renamedStart=createNormalStartV3(168,{...base,
  roadMergePolicy:policy,renamed:true})
 const mirror=runNormalStartV3(mirroredStart,{seconds})
 const renamed=runNormalStartV3(renamedStart,{seconds})
 assert.equal(a.reason,mirror.reason,'A75 reflection changed rejection category')
 assert.equal(a.reason,renamed.reason,'A75 identity changed rejection category')
 assert.equal(a.acceptedSteps,mirror.acceptedSteps)
 assert.equal(a.acceptedSteps,renamed.acceptedSteps)
 for(let i=0;i<168;i++){
  const s=a.states[i],m=mirror.states[i],r=renamed.states[i]
  assert(close(s.x,m.x)&&close(s.y,4.4-m.y),
   'A75 true mirrored rider track mismatch '+policy+'/'+i)
  assert(close(s.x,r.x)&&close(s.y,r.y),
   'A75 relabeled rider track mismatch '+policy+'/'+i)
  assert(close(s.energy.remainingWPrimeJoules,
   m.energy.remainingWPrimeJoules))
 }
 if(!a.reason){
  const half=runNormalStartV3(original,{seconds:seconds/2})
  assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(half)),
   {seconds:seconds/2}),a,'A75 half-run replay changed trajectory')
 }
 observed.push({policy,profile,plannedStatus:planned.status,
  plannedRiders:planned.bookedCount,
  lastBookingSeconds:planned.lastSlotReleaseSeconds,
  status:metrics.status,acceptedSeconds:metrics.seconds,
  completedLaneChanges:metrics.completedLaneChanges,
  nearStopRiderTicks:metrics.nearStopRiderTicks,
  minX:Math.min(...a.states.map(s=>s.x)),
  firstCollision:metrics.firstCollision,
  firstRoadExit:metrics.firstRoadViolation})
}
// Strong 168-rider full-body clearance is now experimentally proven
// under TWO distinct generic capacity schedules, and must not regress.
for(const key of ['platoon_gate_tail_surge','platoon_gate_tail_focus']){
 const good=observed.find(o=>o.policy===key)
 assert(good&&good.plannedStatus==='NECESSARY_WINDOWS_EXIST'&&
  good.plannedRiders===168&&good.status==='FULL_HORIZON_CLEAR'&&
  good.acceptedSeconds===120&&good.minX>1020&&
  good.completedLaneChanges>=150&&good.nearStopRiderTicks===0,
  'A75 lost verified all-168-rider full 2.2m road clearance: '+key)
}
// Matched existing proven field sizes, avoiding any promotion that breaks
// already accepted 32/106 strong-rider entry or passing baselines.
for(const [n,policy] of [[32,'platoon_gate_schedule'],
 [106,'platoon_gate_interval60']]){
 const start=createNormalStartV3(n,{...base,roadMergePolicy:policy})
 const finish=runNormalStartV3(start,{seconds:120})
 const metrics=finishNormalStartMetricsV3(start,finish)
 assert.equal(metrics.status,'FULL_HORIZON_CLEAR')
 assert(finish.states.every(s=>s.x>1020)&&
  metrics.nearStopRiderTicks===0,'A75 broke proven 32/106 strong traverse')
}
const report={study:'A2_STEP75_LARGE_PELOTON_CAPACITY_REDISTRIBUTION',
 technicalGate:'PASS',sportingGate:'NO_GO',
 allPoliciesReachabilityChecked:true,
 physicalMirrorAndIdParity:true,original32And106Safe:true,
 syntheticRoadOnly:true,bodyHalfWidthM:.3,
 results:observed,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP75_DIR??'/tmp/a2-step75'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step75-capacity-distribution.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 results:observed.map(v=>({policy:v.policy,booked:v.plannedRiders,
 bookingEnd:v.lastBookingSeconds,status:v.status,
 seconds:v.acceptedSeconds,lanes:v.completedLaneChanges,
 nearStops:v.nearStopRiderTicks,minX:v.minX,
 pair:v.firstCollision?.pair??null})),officialWrites:0}))
