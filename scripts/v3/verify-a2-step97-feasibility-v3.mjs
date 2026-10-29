/** A97: first gate 1D physically necessary moving window vs fixed queue.
 * A "NECESSARY_TIMING_ONLY" result is NEVER asserted to be safe passage.
 */
import assert from 'node:assert/strict'
import {step97BuildGlobalTimetableProbeV3} from './a2Step97TimetableProbeV3.mjs'
import {step97LatestFloorArrivalV3,
 step97NecessaryTimetableAuditV3} from './a2Step97FeasibilityCertificateV3.mjs'
import {createNormalStartV3,advanceNormalStartV3}
 from './a2NormalStartPelotonV3.mjs'
const summary=[]
const approx=(a,b)=>Math.abs(a-b)<1e-5
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const options={roadGeometry,pacePolicy:'local_gap_strict_v1',
  rollingStartSpeedMps:n>=106?9:null}
 const before=step97BuildGlobalTimetableProbeV3(n,{
  ...options,spacingSeconds:.35})
 assert.equal(before.initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(before.initial.admission.bookedCount,2*n)
 assert.equal(before.initial.physical.acceptedSteps,0)
 assert.equal(before.proposedCertificate.status,'NECESSARY_TIMING_ONLY')
 assert.equal(before.proposedCertificate.deadlineMisses,0)
 assert.equal(before.proposedCertificate.roadTargetViolations,0)
 assert.equal(before.proposedCertificate.earlyArrivalMisses,0)
 assert.equal(before.originalCertificate.riderCount,n)
 assert.equal(before.initial.officialWrites,0)
 const flipped=step97BuildGlobalTimetableProbeV3(n,{
  ...options,mirror:true,spacingSeconds:.35})
 const renamed=step97BuildGlobalTimetableProbeV3(n,{
  ...options,renamed:true,spacingSeconds:.35})
 assert.equal(flipped.proposedCertificate.deadlineMisses,0)
 assert.equal(renamed.proposedCertificate.deadlineMisses,0)
 assert.deepEqual(before.proposedCertificate.gateMetrics,
  flipped.proposedCertificate.gateMetrics)
 assert.deepEqual(before.proposedCertificate.gateMetrics,
  renamed.proposedCertificate.gateMetrics)
 for(let i=0;i<n;i++){
  const a=before.initial.physical.states[i],
   b=flipped.initial.physical.states[i],
   c=renamed.initial.physical.states[i]
  assert(approx(a.x,b.x)&&approx(a.y+b.y,4.4)&&
   approx(a.v,b.v)&&approx(a.v,c.v))
 }
 summary.push({n,roadGeometry,
  originalLateBookings:before.originalCertificate.deadlineMisses,
  alternativeLateBookings:before.proposedCertificate.deadlineMisses,
  originalFirstGateLast:before.originalCertificate.gateMetrics[0].latestBookedSeconds,
  alternativeFirstGateLast:before.proposedCertificate.gateMetrics[0].latestBookedSeconds,
  originalNecessaryStatus:before.originalCertificate.status,
  noPathOrCollisionGuarantee:before.proposedCertificate.noCollisionOrTrajectoryGuarantee})
 if(n===168&&roadGeometry==='double_pinch'){
  assert.equal(before.originalCertificate.deadlineMisses,34)
  assert(approx(before.originalCertificate.maxLateExcessSeconds,5.299588))
  assert.throws(()=>step97BuildGlobalTimetableProbeV3(n,{
   ...options,spacingSeconds:.40}),/no complete unchanged-physics/)
 }
}
// Original A64 straight-ahead physical control: this does NOT attempt to
// narrow a field or prove a 180-second trajectory, only validates that
// the actual initial 5-wide row can move without overlap for 4s.
const preTaper=[]
for(const n of [106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 let state=createNormalStartV3(n,{
  mode:'five_dense',roadGeometry,controllerPolicy:'coordinated_demand',
  headwayStandOffM:4.5,roadMergePolicy:'preview_only',
  bodyHalfWidthM:.3})
 for(const rider of state.states){
  rider.v=9;rider.desired=9;rider.targetY=rider.y
 }
 let worst=Infinity
 for(let k=0;k<8&&!state.reason;k++){
  state=advanceNormalStartV3(state)
  if(!state.reason){
   for(const s of state.states)worst=Math.min(worst,s.v)
  }
 }
 assert.equal(state.reason,null,'A97 original 4s A64 physical start collided')
 assert.equal(state.at,4)
 assert(state.states.every(s=>s.x<680))
 assert(state.states.every(s=>s.v>=6.5))
 preTaper.push({n,roadGeometry,acceptedSeconds:state.at,
  slowestAchievedMps:worst,bodyContacts:0})
}
assert(step97LatestFloorArrivalV3(600,9,780)>
 step97LatestFloorArrivalV3(600,9,780,{downstreamFloorMps:6.5}))
assert.throws(()=>step97LatestFloorArrivalV3(600,3,780))
const result={study:'A97_GLOBAL_NECESSARY_FEASIBILITY',
 cases:summary.length,firstGateFixedBookingMismatchProvenFor168Double:true,
 alternativeScheduleTimingOnly:true,
 physicalPreTaperControl:preTaper,
 originalA64Unchanged:true,officialWrites:0,summary}
console.log(JSON.stringify(result))
