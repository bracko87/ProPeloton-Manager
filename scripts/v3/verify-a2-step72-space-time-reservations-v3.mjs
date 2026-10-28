/** A72: test genuine time-window reservations for a two-slot bottleneck.
 * These are physical research screens, NOT full-stage sporting proof.
 * A failed collision/road-edge step is preserved, not repaired or omitted.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {reserveTwoSlotEntryV3} from './a2TwoSlotReservationsV3.mjs'
import {physicalLateralCapacityV3} from './a2LaneCapacityPlannerV3.mjs'
import {startSustainedOvertakeObserverV3,advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
import {createNormalStartV3,runNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const close=(a,b)=>Math.abs(a-b)<1e-5
const options={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3}
assert.equal(physicalLateralCapacityV3('strong_pinch',800,{
 bodyHalfWidthM:.3}).simultaneousLateralSlots,2)
const initial=createNormalStartV3(32,{...options,roadGeometry:'strong_pinch'})
const plan=reserveTwoSlotEntryV3(initial.states,'strong_pinch')
assert.equal(plan.kind,'strong_pinch')
assert.equal(plan.activeReservationCount,32,
 'A72 ordinary starting field must have advance two-slot reservations')
assert(plan.waitingCenters>=10,'A72 lacked real center-row reservations')
assert.equal(plan.sideAdmissions,0,'A72 let 3 abreast into 2 slots immediately')
for(const row of plan.rows.filter(x=>x.groupCount===3)){
 const decisions=plan.decisions.filter(d=>d.rowStartX===row.rowStartX)
 assert.equal(decisions.length,3)
 const left=decisions.find(d=>d.slot==='LEFT')
 const right=decisions.find(d=>d.slot==='RIGHT')
 const center=decisions.find(d=>d.slot==='FOLLOWING_ROW')
 assert(left&&right&&center,'A72 missing a physical two-slot row')
 assert(close(left.lateralTargetY,1.45)&&close(right.lateralTargetY,2.95))
 assert(center.entryReleaseSeconds>left.entryReleaseSeconds,
  'A72 center entered at same time as two physical flank slots')
 assert(center.requestedPaceMps<=initial.states.find(s=>
  s.id===center.id).desired)
}
assert.throws(()=>reserveTwoSlotEntryV3(
 [...initial.states.slice(0,2),initial.states[0]],'strong_pinch'))
assert.throws(()=>reserveTwoSlotEntryV3(initial.states,'strong_pinch',{
 bodyHalfWidthM:-.3}))
const comparePlan=(n,variant)=>{
 const a=createNormalStartV3(n,{...options,roadGeometry:'strong_pinch'})
 const b=createNormalStartV3(n,{...options,roadGeometry:'strong_pinch',...variant})
 const left=reserveTwoSlotEntryV3(a.states,'strong_pinch')
 const other=reserveTwoSlotEntryV3(b.states,'strong_pinch')
 assert.equal(left.waitingCenters,other.waitingCenters)
 assert.equal(left.activeReservationCount,other.activeReservationCount)
 for(let i=0;i<n;i++){
  const x=left.decisions[i],y=other.decisions[i]
  assert.equal(y.slot,variant.mirror?
   ({LEFT:'RIGHT',RIGHT:'LEFT',FOLLOWING_ROW:'FOLLOWING_ROW',
     null:null})[x.slot]:x.slot)
  assert.equal(x.requiredTwoSlots,y.requiredTwoSlots)
  assert.equal(x.sideMoveAuthorized,y.sideMoveAuthorized)
  assert(close(x.requestedPaceMps,y.requestedPaceMps),
   'A72 rider identity or reflection changed planned pace')
  assert(close(x.lateralTargetY,
   variant.mirror?4.4-y.lateralTargetY:y.lateralTargetY),
   'A72 physically reflective slot target differs')
 }
}
for(const n of [32,106,168]){
 comparePlan(n,{mirror:true})
 comparePlan(n,{renamed:true})
}
const cases=[]
const run=(n,geometry,policy,seconds,extra={})=>{
 const source=createNormalStartV3(n,{...options,roadGeometry:geometry,
  roadMergePolicy:policy,...extra})
 const final=runNormalStartV3(source,{seconds})
 const metrics=finishNormalStartMetricsV3(source,final)
 assert(final.at<=seconds&&final.states.every(s=>
  s.v>=0&&s.v<=50&&s.energy.remainingWPrimeJoules>=0&&
  close(s.energy.seconds,final.at)),'A72 speed, clock or energy invalid')
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
  'ENERGY_FAILED'].includes(metrics.status),'A72 unknown fail-closed outcome')
 if(final.reason){
  assert(final.at<seconds,'A72 invalid early completion credit')
  assert.throws(()=>advanceNormalStartV3(final),
   'A72 accepted a field already rejected for collision or road exit')
 }else{
  assert.equal(final.at,seconds)
  const halfway=runNormalStartV3(source,{seconds:seconds/2})
  assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(halfway)),{
   seconds:seconds/2}),final,'A72 physical exact checkpoint changed')
 }
 return {source,final,metrics}
}
for(const n of [32,106,168]){
 for(const geometry of ['mild_pinch','strong_pinch']){
  const seconds=n===32?120:90
  for(const policy of ['platoon_two_slot_hazard_hold',
   'platoon_no_yield_control','platoon_space_time_reservation',
   'platoon_space_time_admission']){
   const base=run(n,geometry,policy,seconds)
   const mirror=run(n,geometry,policy,seconds,{mirror:true})
   const rename=run(n,geometry,policy,seconds,{renamed:true})
   assert.equal(base.final.reason,mirror.final.reason,'A72 mirror changed outcome')
   assert.equal(base.final.reason,rename.final.reason,'A72 ID changed outcome')
   assert.equal(base.final.acceptedSteps,mirror.final.acceptedSteps)
   assert.equal(base.final.acceptedSteps,rename.final.acceptedSteps)
   for(let i=0;i<n;i++){
    const a=base.final.states[i],b=mirror.final.states[i],
     c=rename.final.states[i]
    assert(close(a.x,b.x)&&close(a.y,4.4-b.y),
     'A72 mirror path changed '+n+'/'+geometry+'/'+policy+'/r'+i)
    assert(close(a.x,c.x)&&close(a.y,c.y),
     'A72 renamed ID affected trajectory')
    assert(close(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
    assert(close(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
   }
   cases.push({n,geometry,policy,targetSeconds:seconds,
    acceptedSeconds:base.metrics.seconds,status:base.metrics.status,
    lateralCompletions:base.metrics.completedLaneChanges,
    reservationRiderTicks:base.metrics.roadSlotReservationRiderTicks,
    upstreamWarnings:base.metrics.roadSlotPaceWarningRiderTicks,
    crossRowHolds:base.metrics.roadSlotCrossRowHoldRiderTicks,
    nearStopTicks:base.metrics.nearStopRiderTicks,
    firstCollision:base.metrics.firstCollision,
    firstRoadViolation:base.metrics.firstRoadViolation})
  }
 }
}
// On mild road, reservations are deliberately INACTIVE. Any improvement
// over Step71 must therefore be attributed to the matched no-yield steering
// controller, NOT to A72 future entry window scheduling. Compare exactly.
for(const n of [32,106,168]){
 const a=cases.find(x=>x.n===n&&x.geometry==='mild_pinch'&&
  x.policy==='platoon_no_yield_control')
 const b=cases.find(x=>x.n===n&&x.geometry==='mild_pinch'&&
  x.policy==='platoon_space_time_reservation')
 assert(a&&b&&a.status===b.status&&
  a.acceptedSeconds===b.acceptedSeconds&&
  a.lateralCompletions===b.lateralCompletions&&
  b.reservationRiderTicks===0&&b.upstreamWarnings===0,
  'A72 falsely attributed mild road physics to inactive two-slot scheduling')
}
for(const n of [32,106,168]){
 const control=cases.find(x=>x.n===n&&x.geometry==='mild_pinch'&&
  x.policy==='platoon_no_yield_control')
 const admission=cases.find(x=>x.n===n&&x.geometry==='mild_pinch'&&
  x.policy==='platoon_space_time_admission')
 assert(admission&&control&&admission.status===control.status&&
  admission.acceptedSeconds===control.acceptedSeconds&&
  admission.lateralCompletions===control.lateralCompletions&&
  admission.reservationRiderTicks===0,
  'A72 deferred admission improperly affected mild-width controls')
}
const strongAdmission=cases.filter(x=>x.geometry==='strong_pinch'&&
 x.policy==='platoon_space_time_admission')
assert(strongAdmission.length===3&&strongAdmission.every(x=>
 x.crossRowHolds>0),'A72 never exercised cross-row lateral exclusion')
// Existing three-abreast physical overlap at the worst pinch is NEVER
// granted a reservation that instantly resolves x/y or commits W-prime.
const impossible=createNormalStartV3(8,{...options,
 roadGeometry:'strong_pinch',roadMergePolicy:'platoon_space_time_reservation'})
for(const i of [0,1,2])impossible.states[i].x=800
impossible.states[0].y=1.55
impossible.states[1].y=2.2
impossible.states[2].y=2.85
const reject=advanceNormalStartV3(impossible)
assert.equal(reject.reason,'SWEPT_CONTACT')
assert.equal(reject.at,0)
assert.equal(reject.acceptedSteps,0)
assert.deepEqual(reject.states,impossible.states)
// Sustain the actually safer MILD controller beyond the original
// 90s screen. Independent physical after-acceptance observer prevents
// mistaking endpoint rank inversion for a real, persistent bicycle pass.
const longerMild=[]
const coupled=(start,seconds,checkpoint=null)=>{
 let physical=checkpoint?.physical??structuredClone(start)
 let observer=checkpoint?.observer??startSustainedOvertakeObserverV3(
  physical.states)
 const end=physical.at+seconds
 while(physical.at<end-1e-7&&!physical.reason){
  const moved=advanceNormalStartV3(physical)
  if(moved.reason){physical=moved;break}
  observer=advanceSustainedOvertakeObserverV3(observer,physical.states,
   moved.states,.5)
  physical=moved
 }
 return {physical,observer}
}
for(const n of [106,168]){
 const start=createNormalStartV3(n,{...options,
  roadGeometry:'mild_pinch',roadMergePolicy:'platoon_no_yield_control'})
 const end=coupled(start,120)
 const m=finishNormalStartMetricsV3(start,end.physical)
 const passes=overtakeObserverSummaryV3(end.observer)
 assert(close(passes.durationSeconds,m.seconds),
  'A72 separate overtake observer clock changed')
 assert(end.physical.states.every(r=>r.energy.remainingWPrimeJoules>=0))
 // These newly observed mild 120-second successes are REPRODUCIBLE
 // benchmarks: a regression must fail CI, never silently be documented
 // as a shorter but "technically passing" field.
 assert.equal(m.status,'FULL_HORIZON_CLEAR',
  'A72 lost safe 120s 106/168 mild full-bicycle peloton continuity')
 assert.equal(m.seconds,120)
 assert(m.completedLaneChanges>=(n===106?45:70)&&
  passes.confirmedSustainedPasses>=(n===106?300:500)&&
  m.nearStopRiderTicks===0,
  'A72 long mild field lost meaningful physical passing or near-stop safety')
 if(m.status==='FULL_HORIZON_CLEAR'){
  assert(m.nearStopRiderTicks===0&&m.completedLaneChanges>0&&
   passes.confirmedSustainedPasses>0,
   'A72 longer physically clear field has no real sustained racing')
  const first=coupled(start,60)
  const restored=coupled(start,60,{physical:JSON.parse(
   JSON.stringify(first.physical)),observer:JSON.parse(
   JSON.stringify(first.observer))})
  assert.deepEqual(restored.physical,end.physical,
   'A72 long mild physical 60+60 exact restart differs')
  assert.deepEqual(restored.observer,end.observer,
   'A72 long mild real-overtake 60+60 exact restart differs')
 }
 longerMild.push({n,requestedSeconds:120,acceptedSeconds:m.seconds,
  status:m.status,completedLaneChanges:m.completedLaneChanges,
  endpointPairOrderReversals:m.uniquePairOrderReversals,
  confirmedSustainedPairPasses:passes.confirmedSustainedPasses,
  nearStopRiderTicks:m.nearStopRiderTicks,
  firstCollision:m.firstCollision,firstRoadViolation:m.firstRoadViolation})
}
const study={study:'A2_STEP72_PHYSICAL_TWO_SLOT_RESERVATIONS',
 technicalGate:'PASS',sportingGate:'NO_GO',originalReferenceRetained:true,
 provisionalBicycleHalfWidthM:.3,entryX:780,longitudinalOffsetM:2.6,
 matchedNoYieldControl:true,mildReservationInactive:true,
 independentCrossRowHoldControl:true,passedPairDetectorIndependent:true,
 longerMild,
 initialThreeAbreastAccepted:false,noUnboundedAcceleration:true,
 deterministicReflectionAndRenaming:true,noOfficialWrites:true,
 cases,fullCrossingSuccesses:cases.filter(x=>
  ['platoon_space_time_reservation','platoon_space_time_admission']
   .includes(x.policy)&&x.status==='FULL_HORIZON_CLEAR').length,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP72_DIR??'/tmp/a2-step72'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step72-space-time-reservations.json',
 JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify({...study,cases:cases.map(x=>({
 n:x.n,road:x.geometry,policy:x.policy,status:x.status,
 acceptedSeconds:x.acceptedSeconds,lateral:x.lateralCompletions,
 reservationTicks:x.reservationRiderTicks,upstream:x.upstreamWarnings,
 crossRowHolds:x.crossRowHolds,
 nearStops:x.nearStopTicks,
 collision:x.firstCollision?.pair??null,
 roadExit:x.firstRoadViolation?.riderId??null})),longerMild}))
