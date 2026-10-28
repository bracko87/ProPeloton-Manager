/** Step74 independent post-acceptance observed physical passes and exact
 * checkpoint replay. These tests never award a pass for endpoint inversions.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3,finishNormalStartMetricsV3}
 from './a2NormalStartPelotonV3.mjs'
import {startSustainedOvertakeObserverV3,advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3,roadGeometry:'strong_pinch'}
function runCoupled(start,seconds,checkpoint=null){
 let current=checkpoint?.physical??structuredClone(start)
 let observer=checkpoint?.observer??startSustainedOvertakeObserverV3(
  current.states)
 const until=current.at+seconds
 while(current.at<until-1e-7&&!current.reason){
  const next=advanceNormalStartV3(current)
  if(next.reason){current=next;break}
  observer=advanceSustainedOvertakeObserverV3(observer,current.states,
   next.states,.5)
  current=next
 }
 return {physical:current,observer}
}
const tests=[]
for(const [n,policy,seconds] of [
 [32,'platoon_gate_interval60',120],
 [106,'platoon_gate_interval60',90],
 [106,'platoon_gate_interval60',120],
 [168,'platoon_gate_frontload',90]]){
 const start=createNormalStartV3(n,{...base,roadMergePolicy:policy})
 const entire=runCoupled(start,seconds)
 const metrics=finishNormalStartMetricsV3(start,entire.physical)
 const observed=overtakeObserverSummaryV3(entire.observer)
 assert(Math.abs(observed.durationSeconds-metrics.seconds)<1e-6,
  'A74 observer was advanced across a rejected or missing physical step')
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT',
  'ROAD_ENVELOPE_VIOLATION','ENERGY_FAILED','GATE_ENTRY_NO_WINDOW']
  .includes(metrics.status),'A74 unknown physical result')
 assert(entire.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0))
 if(n===32||n===106&&seconds===90){
  assert.equal(metrics.status,'FULL_HORIZON_CLEAR',
   'A74 validated 32/106 physically clear strong crossing regressed')
  assert.equal(metrics.seconds,seconds)
  assert(metrics.nearStopRiderTicks===0&&
   metrics.completedLaneChanges>0&&
   observed.confirmedSustainedPasses>0,
   'A74 apparent clearance without non-stalling sustained passes')
 }
 if(n===106&&seconds===120){
  assert.equal(metrics.status,'FULL_HORIZON_CLEAR',
   'A74 106 full-width multi-minute 2.2m traversal regressed')
  assert(Math.min(...entire.physical.states.map(s=>s.x))>1020,
   'A74 106 full-peloton claim without physically passing road reopening')
  assert(metrics.completedLaneChanges>=100&&
   observed.confirmedSustainedPasses>=100&&metrics.nearStopRiderTicks===0,
   'A74 106 strong-road non-stalling sustained physical passing regressed')
 }
 if(n===32){
  assert(entire.physical.states.every(s=>s.x>1020)&&
   observed.confirmedSustainedPasses>=35,
   'A74 32 proof needs all riders beyond road and verified passing')
 }
 if(n===168){
  assert(metrics.status==='SWEPT_CONTACT'&&metrics.seconds>=65&&
   metrics.nearStopRiderTicks===0,
   'A74 retained 168-rider 69s failure/capacity evidence regressed')
 }
 const first=runCoupled(start,seconds/2)
 assert.equal(first.physical.reason,null,
  'A74 cannot checkpoint midway through already failed field')
 const restored=runCoupled(start,seconds/2,{
  physical:JSON.parse(JSON.stringify(first.physical)),
  observer:JSON.parse(JSON.stringify(first.observer))})
 assert.deepEqual(restored.physical,entire.physical,
  'A74 resumed physics state differs after JSON checkpoint')
 assert.deepEqual(restored.observer,entire.observer,
  'A74 resumed independent pass observer differs after JSON checkpoint')
 tests.push({n,policy,requestedSeconds:seconds,
  status:metrics.status,acceptedSeconds:metrics.seconds,
  physicalLaneChanges:metrics.completedLaneChanges,
  sustainedPairPasses:observed.confirmedSustainedPasses,
  nearStopRiderTicks:metrics.nearStopRiderTicks,
  minX:Math.min(...entire.physical.states.map(s=>s.x)),
  maxX:Math.max(...entire.physical.states.map(s=>s.x)),
  firstCollision:metrics.firstCollision,
  firstRoadExit:metrics.firstRoadViolation})
}
const report={study:'A2_STEP74_STRONG_ROAD_REAL_PASSING_AND_REPLAY',
 technicalGate:'PASS',sportingGate:'NO_GO',
 fullyFinishedStrong106At90:true,
 strong32Preserved:true,full168StillNotApproved:true,
 exactlyReplayedFromSerializedPhysicalAndIndependentPassObserver:true,
 tests,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP74_PASS_DIR??'/tmp/a2-step74pass'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step74-independent-passing.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 results:tests.map(x=>({n:x.n,policy:x.policy,seconds:x.requestedSeconds,
 accepted:x.acceptedSeconds,status:x.status,
 laneChanges:x.physicalLaneChanges,
 verifiedPairPasses:x.sustainedPairPasses,nearStops:x.nearStopRiderTicks,
 minX:x.minX,firstContact:x.firstCollision?.pair??null})),
 sportingApproval:'NOT_APPROVED'}))
