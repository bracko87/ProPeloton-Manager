/** Step98 definitive full 180-second request against original A64 body,
 * road, energy and Step95 achieved moving limits for 106/168 five-wide.
 * Always fail closed at first invalid proposal; do not treat a pass in
 * the 8-second graph as sporting proof of a true race.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,multiGatePhysicalMetricsV3}
 from './a2MultiGatePhysicalCandidateV3.mjs'
const results=[]
for(const n of [106,168])
for(const roadGeometry of ['staged_pinch','double_pinch'])
for(const pacePolicy of ['global_graph_strict_v1','global_graph_balanced_v1'])
for(const timetable of ['floor_aware_035']){
 const initial=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry,pacePolicy,rollingStartSpeedMps:9,
  spacingSeconds:.35}).initial
 const original=JSON.stringify(initial)
 let state=structuredClone(initial),slowUpstream=0,slowDownstream=0
 while(state.physical.at<180-1e-8&&!state.reason){
  const next=advanceMultiGatePhysicalCandidateV3(state)
  if(!next.reason)for(const s of next.physical.states){
   if(s.x<680&&s.v<6.5-1e-7)slowUpstream++
   if(s.x>=680&&s.v<4.5-1e-7)slowDownstream++
  }
  state=next
 }
 assert.equal(JSON.stringify(initial),original)
 assert.equal(state.officialWrites,0)
 assert.equal(state.physical.reason,null)
 assert.equal(slowUpstream,0);assert.equal(slowDownstream,0)
 const m=multiGatePhysicalMetricsV3(initial,state)
 assert.equal(m.nearStops,0)
 assert(state.physical.at<=180)
 if(state.reason){assert.equal(state.status,'REJECTED')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(state))}
 else assert.equal(state.physical.at,180)
 assert(state.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  Math.abs(s.energy.seconds-state.physical.at)<1e-5))
 results.push({n,roadGeometry,pacePolicy,timetable,
  acceptedSeconds:state.physical.at,fullTargetSeconds:180,
  realFailure:state.reason??'FULL_180',
  originalPhysicalCollision:m.firstCollision?.pair??null,
  originalRoadViolation:m.firstRoadViolation?.riderId??null,
  noAcceptedUpstreamCrawl:slowUpstream===0,
  noAcceptedDownstreamCrawl:slowDownstream===0,
  noAcceptedNearStops:m.nearStops===0,
  pastSecondGate:m.allPastSecondReopening,
  actualLaneChanges:m.laneChanges,
  graphConflictsInspected:state.step98GlobalConflicts,
  crossRowGraphConflicts:state.step98CrossRowConflicts,
  equalXGraphConflicts:state.step98EqualXConflicts,
  globalForecastUnresolved:state.step98UnresolvedForecasts,
  originalA64PreviewSweeps:state.step98PhysicalPreviewSweeps,
  sixSecondFullPreviewTicks:state.step98FullSixSecondPreviewTicks,
  selectedPolicies:state.step98SelectedPolicies,
  cleanFullSporting:!state.reason&&
   state.physical.at===180&&m.allPastSecondReopening&&
   m.nearStops===0})
}
const report={study:'A98_GLOBAL_6S_A64_106_168_FULL180',
 actualCases:results.length,
 fullSportingCompletions:results.filter(x=>x.cleanFullSporting).length,
 sportingDecision:results.every(x=>x.cleanFullSporting)?
  'NEEDS_OVERTAKE_AND_PARITY_CONFIRMATION':'NO_GO',
 noFull180ClaimsFrom6sPreview:true,
 originalA64Unmodified:true,officialWrites:0,results}
const dir=process.env.V3_A2_STEP98_LARGE_DIR??'/tmp/a98large'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a98-full-field-180-original-a64.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
