/** A72: test genuine time-window reservations for a two-slot bottleneck.
 * These are physical research screens, NOT full-stage sporting proof.
 * A failed collision/road-edge step is preserved, not repaired or omitted.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {reserveTwoSlotEntryV3} from './a2TwoSlotReservationsV3.mjs'
import {physicalLateralCapacityV3} from './a2LaneCapacityPlannerV3.mjs'
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
  assert.equal(x.slot,variant.mirror?
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
   'platoon_space_time_reservation']){
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
    nearStopTicks:base.metrics.nearStopRiderTicks,
    firstCollision:base.metrics.firstCollision,
    firstRoadViolation:base.metrics.firstRoadViolation})
  }
 }
}
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
const study={study:'A2_STEP72_PHYSICAL_TWO_SLOT_RESERVATIONS',
 technicalGate:'PASS',sportingGate:'NO_GO',originalReferenceRetained:true,
 provisionalBicycleHalfWidthM:.3,entryX:780,longitudinalOffsetM:2.6,
 initialThreeAbreastAccepted:false,noUnboundedAcceleration:true,
 deterministicReflectionAndRenaming:true,noOfficialWrites:true,
 cases,fullCrossingSuccesses:cases.filter(x=>
  x.policy==='platoon_space_time_reservation'&&
  x.status==='FULL_HORIZON_CLEAR').length,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP72_DIR??'/tmp/a2-step72'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step72-space-time-reservations.json',
 JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify({...study,cases:cases.map(x=>({
 n:x.n,road:x.geometry,policy:x.policy,status:x.status,
 acceptedSeconds:x.acceptedSeconds,lateral:x.lateralCompletions,
 reservationTicks:x.reservationRiderTicks,upstream:x.upstreamWarnings,
 nearStops:x.nearStopTicks,
 collision:x.firstCollision?.pair??null,
 roadExit:x.firstRoadViolation?.riderId??null}))}))
