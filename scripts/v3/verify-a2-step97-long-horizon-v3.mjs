/** Step97 evaluate complete global floor-aware gate timetables on the
 * actual original A64 complete-body solver, not booking-only predictions.
 * An accepted 0.5s tick must also pass the Step95 no-crawl guard.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs'
import {advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const results=[]
for(const n of [106,168])
for(const roadGeometry of ['staged_pinch','double_pinch'])
for(const pacePolicy of ['local_gap_strict_v1','local_gap_balanced_v1'])
for(const spacingSeconds of [.35,...(pacePolicy==='local_gap_strict_v1'&&
 (n===106||roadGeometry==='staged_pinch')?[.40]:[])]){
 const {initial,originalCertificate,proposedCertificate}=
  step97BuildGlobalTimetableProbeV3(n,{
   roadGeometry,pacePolicy,rollingStartSpeedMps:9,spacingSeconds})
 assert.equal(initial.admission.bookedCount,n*2)
 assert.equal(proposedCertificate.deadlineMisses,0)
 const untouched=JSON.stringify(initial)
 let current=structuredClone(initial),firstRejection=null
 let acceptedSlowUpstream=0,acceptedSlowDownstream=0
 while(current.physical.at<180-1e-8&&!current.reason){
  const next=advanceMultiGatePhysicalCandidateV3(current)
  if(next.reason){firstRejection=next.reason;current=next;break}
  for(const s of next.physical.states){
   if(s.x<680&&s.v<6.5)acceptedSlowUpstream++
   if(s.x>=680&&s.v<4.5)acceptedSlowDownstream++
  }
  current=next
 }
 assert.equal(JSON.stringify(initial),untouched)
 assert.equal(current.officialWrites,0)
 assert.equal(current.physical.reason,null,
  'A97 unaccepted A64 physical state must not commit')
 assert.equal(acceptedSlowUpstream,0)
 assert.equal(acceptedSlowDownstream,0)
 const metrics=multiGatePhysicalMetricsV3(initial,current)
 assert.equal(metrics.nearStops,0)
 if(current.reason){
  assert.equal(current.status,'REJECTED')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(current))
 }else assert.equal(current.physical.at,180)
 assert(current.physical.states.every(s=>
  s.energy.remainingWPrimeJoules>=0&&
  Math.abs(s.energy.seconds-current.physical.at)<1e-5))
 results.push({n,roadGeometry,pacePolicy,spacingSeconds,
  originalLateTimetableBookings:originalCertificate.deadlineMisses,
  rescheduledLateTimetableBookings:proposedCertificate.deadlineMisses,
  bookedSecondGate:initial.admission.bookings.filter(b=>b.gateId==='gate-2').length,
  actualAcceptedSeconds:current.physical.at,
  status:current.reason??'FULL_180',
  nearStopRiderTicks:metrics.nearStops,
  acceptedSlowUpstream,acceptedSlowDownstream,
  firstSweptContact:metrics.firstCollision?.pair??null,
  firstRoadViolation:metrics.firstRoadViolation?.riderId??null,
  allPastSecondGate:metrics.allPastSecondReopening,
  genuineLaneChanges:metrics.laneChanges,
  step96GeneratedCrossRowGapEdges:current.step96CrossRowEdges,
  movingBlockedPreviewCount:current.step95PreviewBlocked,
  originalA64AlwaysAuthoritative:true,officialWrites:0,
  completedSporting:!current.reason&&current.physical.at===180&&
   metrics.allPastSecondReopening&&metrics.nearStops===0})
}
const report={
 study:'A97_FLOOR_ALIGNED_GLOBAL_TIMETABLE_TRUE_A64_180S',
 cases:results.length,full180:results.filter(x=>x.completedSporting).length,
 originalA64Unchanged:true,
 noTimingCertificateIsPhysicalProof:true,
 sportingDecision:results.every(x=>x.completedSporting)?
  'NEEDS_INDEPENDENT_OVERTAKE_REPLAY':'NO_GO',
 officialWrites:0,results}
const dir=process.env.V3_A2_STEP97_LARGE_DIR??'/tmp/a97large'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/step97-full-180-original-A64-global-timetables.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
