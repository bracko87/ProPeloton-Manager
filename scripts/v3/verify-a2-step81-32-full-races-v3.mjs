/** Step81 full 180s 32-rider five-column physical audit.
 * A completed 45s pilot is NOT a sporting success. This file exercises
 * full race and independent 3-second passing with original strict A64.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {startSustainedOvertakeObserverV3,
 advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const cases=[
 {roadGeometry:'staged_pinch',pacePolicy:'multisecond_zipper_v1'},
 {roadGeometry:'double_pinch',pacePolicy:'multisecond_reserve_v1'}
]
function run(initial,seconds,observer=null){
 let current=structuredClone(initial),passing=observer??
  startSustainedOvertakeObserverV3(initial.physical.states)
 const target=current.physical.at+seconds
 while(current.physical.at<target-1e-8&&!current.reason){
  const next=advanceMultiGatePhysicalCandidateV3(current)
  if(!next.reason)passing=advanceSustainedOvertakeObserverV3(
   passing,current.physical.states,next.physical.states,.5)
  current=next
 }
 return {state:current,passing}
}
const trials=[]
for(const c of cases){
 const initial=createMultiGatePhysicalCandidateV3(32,{
  mode:'five_dense',headwayStandOffM:4.5,
  controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',...c})
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 const before=JSON.stringify(initial)
 const whole=run(initial,180)
 assert.equal(JSON.stringify(initial),before)
 assert.equal(whole.state.officialWrites,0)
 assert(whole.state.physical.at>=0&&whole.state.physical.at<=180)
 const metrics=multiGatePhysicalMetricsV3(initial,whole.state)
 if(whole.state.reason){
  assert.equal(whole.state.physical.reason,null)
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(whole.state))
 }else assert.equal(whole.state.physical.at,180)
 const pass=overtakeObserverSummaryV3(whole.passing)
 let replay=null
 if(whole.state.physical.at>=90){
  const first=run(initial,90)
  const resumed=run(
   JSON.parse(JSON.stringify(first.state)),90,
   JSON.parse(JSON.stringify(first.passing)))
  assert.deepEqual(resumed,whole,
   'A81 32-rider exact 90+90 physics+observer replay failed')
  replay=true
 }
 trials.push({...c,acceptedSeconds:whole.state.physical.at,
  collisionRejected:whole.state.reason??null,
  full180WithoutNearStops:whole.state.reason===null&&
   metrics.nearStops===0&&metrics.allPastSecondReopening,
  rearX:metrics.rearX,firstCollision:metrics.firstCollision?.pair??null,
  roadExit:metrics.firstRoadViolation?.riderId??null,
  nearStopRiderTicks:metrics.nearStops,
  actualPhysicalLaneChanges:metrics.laneChanges,
  confirmedThreeSecondSustainedOvertakes:
   pass.confirmedSustainedPasses,
  exact90Plus90IndependentReplay:replay,
  noDatabaseWrites:true})
}
const report={study:'A81_FIVE_COLUMN_32R_FULL_180_OBSERVER_AUDIT',
 sportingApproval:'NO_GO_UNLESS_ALL_A81_SIZE_PROFILES_PASS',
 originalPhysicalAuthority:true,officialWrites:0,trials}
const dir=process.env.V3_A2_STEP81_FULL32_DIR??'/tmp/a81full32'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a81-32-full-real-physics-and-independent-passes.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
