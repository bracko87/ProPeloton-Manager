/** Step 75 independent 168-rider full strong road passage and genuine passing.
 * Observer only processes accepted 0.5s physics, never rejected trajectories.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
import {startSustainedOvertakeObserverV3,advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3,roadGeometry:'strong_pinch'}
function run(start,seconds,resumed=null){
 let physical=resumed?.physical??structuredClone(start)
 let observer=resumed?.observer??startSustainedOvertakeObserverV3(
  physical.states)
 const target=physical.at+seconds
 while(physical.at<target-1e-7&&!physical.reason){
  const next=advanceNormalStartV3(physical)
  if(next.reason){physical=next;break}
  observer=advanceSustainedOvertakeObserverV3(observer,
   physical.states,next.states,.5)
  physical=next
 }
 return {physical,observer}
}
const tests=[]
for(const policy of ['platoon_gate_tail_surge','platoon_gate_tail_focus']){
 const original=createNormalStartV3(168,{...base,roadMergePolicy:policy})
 assert.equal(original.roadGateStatus,'NECESSARY_WINDOWS_EXIST')
 assert.equal(original.roadGateBookings.length,168)
 const entire=run(original,120)
 const metrics=finishNormalStartMetricsV3(original,entire.physical)
 const observer=overtakeObserverSummaryV3(entire.observer)
 assert.equal(metrics.status,'FULL_HORIZON_CLEAR',
  'A75 lost all-field 168-rider physical 2.2m road crossing')
 assert.equal(entire.physical.at,120)
 assert(entire.physical.states.every(s=>s.x>1020&&s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  Math.abs(s.energy.seconds-120)<1e-5),
  'A75 168 rider did not cross full road reopening or had invalid energy')
 assert(metrics.completedLaneChanges>=150&&
  metrics.nearStopRiderTicks===0,
  'A75 168 field lacks 150 real bounded lane moves or near-stop safety')
 assert.equal(observer.durationSeconds,120,
  'A75 independent observer did not see exactly 120s accepted physics')
 assert(observer.confirmedSustainedPasses>0,
  'A75 168 clear peloton produced no genuine 3s forward overtake')
 const first=run(original,60)
 assert.equal(first.physical.at,60)
 const resumed=run(original,60,{
  physical:JSON.parse(JSON.stringify(first.physical)),
  observer:JSON.parse(JSON.stringify(first.observer))})
 assert.deepEqual(resumed.physical,entire.physical,
  'A75 168 saved physical state diverges in exact 60+60s checkpoint')
 assert.deepEqual(resumed.observer,entire.observer,
  'A75 168 saved independent overtake observer diverges')
 tests.push({policy,targetSeconds:120,status:metrics.status,
  fullRidersBeyondReopening:168,
  minX:Math.min(...entire.physical.states.map(s=>s.x)),
  maxX:Math.max(...entire.physical.states.map(s=>s.x)),
  completedLaneChanges:metrics.completedLaneChanges,
  confirmedSustainedPairPasses:observer.confirmedSustainedPasses,
  nearStopRiderTicks:metrics.nearStopRiderTicks,
  exactPhysicalAndObserverRestart:true,
  firstCollision:metrics.firstCollision,
  firstRoadExit:metrics.firstRoadViolation})
}
const report={study:'A2_STEP75_FULL_168_STRONG_BICYCLE_PASSING',
 technicalGate:'PASS',syntheticSportingMilestone:'PASS',
 fullStageSportingApproval:'NOT_APPROVED',
 provisionalBicycleHalfWidthM:.3,provisionalRoadWidthM:2.2,
 fullAllRiderExitX:1020,
 tests,officialWrites:0,productionAuthorized:false}
const dir=process.env.V3_A2_STEP75_PASS_DIR??'/tmp/a2-step75pass'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step75-168-sustained-passing.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 tests:tests.map(x=>({policy:x.policy,status:x.status,
  minX:x.minX,lanes:x.completedLaneChanges,
  actualSustainedPairPasses:x.confirmedSustainedPairPasses,
  nearStops:x.nearStopRiderTicks,checkpointExact:true})),
 fullStageSportingApproval:'NOT_APPROVED',officialWrites:0}))
