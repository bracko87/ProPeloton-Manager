/** A76 genuine 3-second overtakes, full double-constriction 180s passage,
 * and exact 90+90s saved-state recovery. Offline synthetic research.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
import {startSustainedOvertakeObserverV3,advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3,
 roadGeometry:'double_pinch',roadMergePolicy:'platoon_gate_tail_surge'}
function coupled(initial,seconds,checkpoint=null){
 let physical=checkpoint?.physical??structuredClone(initial)
 let observer=checkpoint?.observer??startSustainedOvertakeObserverV3(
  physical.states)
 const target=physical.at+seconds
 while(physical.at<target-1e-7&&!physical.reason){
  const next=advanceNormalStartV3(physical)
  if(next.reason){physical=next;break}
  observer=advanceSustainedOvertakeObserverV3(
   observer,physical.states,next.states,.5)
  physical=next
 }
 return {physical,observer}
}
const trials=[]
for(const n of [32,106,168]){
 const initial=createNormalStartV3(n,base)
 assert.equal(initial.roadGateStatus,'NECESSARY_WINDOWS_EXIST')
 const whole=coupled(initial,180)
 const metrics=finishNormalStartMetricsV3(initial,whole.physical)
 const passes=overtakeObserverSummaryV3(whole.observer)
 assert.equal(metrics.status,'FULL_HORIZON_CLEAR',
  'A76 one of the three multiple pinch field sizes failed physical screen')
 assert.equal(whole.physical.at,180)
 assert(whole.physical.states.every(s=>s.x>1470&&s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  Math.abs(s.energy.seconds-180)<1e-5),
  'A76 has not actually crossed BOTH full 2.2m road constrictions')
 assert(metrics.completedLaneChanges>=({32:30,106:110,168:150})[n]&&
  metrics.nearStopRiderTicks===0,
  'A76 double-road passing suppressed or physical field stalled')
 assert.equal(passes.durationSeconds,180)
 assert(passes.confirmedSustainedPasses>0,
  'A76 double road has zero independently confirmed actual 3s passes')
 const first=coupled(initial,90)
 assert.equal(first.physical.reason,null)
 const restored=coupled(initial,90,{
  physical:JSON.parse(JSON.stringify(first.physical)),
  observer:JSON.parse(JSON.stringify(first.observer))
 })
 assert.deepEqual(restored.physical,whole.physical,
  'A76 double-pinch physical 90+90 JSON recovery changed result')
 assert.deepEqual(restored.observer,whole.observer,
  'A76 double-pinch real 3s overtakes changed after snapshot recovery')
 trials.push({n,acceptedSeconds:180,
  physicalLanes:metrics.completedLaneChanges,
  independentSustainedPairPasses:passes.confirmedSustainedPasses,
  lastRiderX:Math.min(...whole.physical.states.map(s=>s.x)),
  nearStops:metrics.nearStopRiderTicks,
  noSweptCollision:true,noRoadsideExit:true,
  exactPhysicsAndObserverReplay:true})
}
const report={study:'A2_STEP76_DOUBLE_NARROWING_180S_PASSING',
 technicalGate:'PASS',syntheticTwoPinchSafety:'PASS',
 fullStageSportingApproval:'NOT_APPROVED',
 physicalBicycleHalfWidthM:.3,
 secondConstrictionEndsAtX:1470,
 twoPinchAllRiderPassing:true,
 tests:trials,officialWrites:0}
const dir=process.env.V3_A2_STEP76_PASS_DIR??'/tmp/a2-step76pass'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step76-double-narrowing-sustained-passes.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,
 technicalGate:report.technicalGate,tests:trials,
 fullStageSportingApproval:'NOT_APPROVED',officialWrites:0}))
