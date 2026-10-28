/** Step76 offline route geometry and five-abreast admissibility screens.
 * Deliberately tests the LIMITS of a single-gate policy; a complete
 * old single road is NOT sufficient proof of two constrictions.
 * All widths and stages are SYNTHETIC, not a real road authority.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {researchRoadEnvelopeV3,roadEnvelopeViolationV3}
 from './a2VariableRoadWidthV3.mjs'
import {createNormalStartV3,advanceNormalStartV3,runNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const at=(kind,x)=>researchRoadEnvelopeV3(kind,x)
const geometries=[
 ['constant',680,4.4],['mild_pinch',800,3.3],
 ['strong_pinch',800,2.2],['double_pinch',800,2.2],
 ['double_pinch',1020,4.4],['double_pinch',1130,4.4],
 ['double_pinch',1230,2.2],['double_pinch',1370,2.2],
 ['double_pinch',1470,4.4],['staged_pinch',800,3.3],
 ['staged_pinch',1230,2.2]]
for(const [name,x,width] of geometries){
 const box=at(name,x)
 assert(eq(box.widthM,width),'A76 incorrect static geographic road width')
 assert(eq(box.minY+box.maxY,4.4),'A76 road violated lateral mirror')
}
for(let x=0;x<=1800;x+=.5){
 const old=at('strong_pinch',x),double=at('double_pinch',x),
  staged=at('staged_pinch',x)
 if(x<=1020){
  assert(eq(old.widthM,double.widthM),
   'A76 changed protected first strong pinched geometry')
  if(x<=680||x>=1020)assert(eq(staged.widthM,4.4))
 }
 assert(old.widthM>=2.2-1e-7&&double.widthM>=2.2-1e-7&&
  staged.widthM>=2.2-1e-7)
}
// Additional full-bicycle width violations in SECOND restrictive segment
// must be rejected without teleporting the offender into the road.
const improper=roadEnvelopeViolationV3('double_pinch',1230,1.1,
 {bodyHalfWidthM:.3})
assert(improper&&improper.kind==='double_pinch'&&
 eq(improper.roadWidthM,2.2))
assert.equal(roadEnvelopeViolationV3('double_pinch',1230,1.4,
 {bodyHalfWidthM:.3}),null)
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3,
 roadMergePolicy:'platoon_gate_tail_surge'}
const examples=[]
for(const n of [32,106,168]){
 const first=createNormalStartV3(n,{...base,roadGeometry:'strong_pinch'})
 const downstream=createNormalStartV3(n,{...base,
  roadGeometry:'double_pinch'})
 assert.equal(downstream.roadGateStatus,'NECESSARY_WINDOWS_EXIST')
 assert.equal(downstream.roadGateBookings.length,n)
 // First-bottleneck reservations MUST be exactly the same; this
 // implementation has NOT booked a second bottleneck and never claims so.
 assert.deepEqual(downstream.roadGateBookings,first.roadGateBookings)
 const seconds=180
 const initial=downstream
 const final=runNormalStartV3(initial,{seconds})
 const m=finishNormalStartMetricsV3(initial,final)
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT',
  'ROAD_ENVELOPE_VIOLATION','ENERGY_FAILED','GATE_ENTRY_NO_WINDOW']
  .includes(m.status),'A76 unknown double road physical result')
 assert(final.at<=seconds&&final.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  eq(s.energy.seconds,final.at)),
  'A76 field committed an invalid speed/energy timeline')
 const mirror=runNormalStartV3(createNormalStartV3(n,{
  ...base,roadGeometry:'double_pinch',mirror:true}),{seconds})
 const renamed=runNormalStartV3(createNormalStartV3(n,{
  ...base,roadGeometry:'double_pinch',renamed:true}),{seconds})
 assert.equal(final.reason,mirror.reason,'A76 spatial mirror changed failure type')
 assert.equal(final.reason,renamed.reason,'A76 rider renaming changed failure type')
 assert.equal(final.acceptedSteps,mirror.acceptedSteps)
 assert.equal(final.acceptedSteps,renamed.acceptedSteps)
 for(let i=0;i<n;i++){
  const a=final.states[i],b=mirror.states[i],c=renamed.states[i]
  assert(eq(a.x,b.x)&&eq(a.y,4.4-b.y),
   'A76 double pinch mirrored real cyclist trajectory changed '+n+'/'+i)
  assert(eq(a.x,c.x)&&eq(a.y,c.y),
   'A76 double pinch renamed cyclist trajectory changed '+n+'/'+i)
  assert(eq(a.energy.remainingWPrimeJoules,
   b.energy.remainingWPrimeJoules))
 }
 if(final.reason){
  assert.throws(()=>advanceNormalStartV3(final),
   'A76 was able to advance rejected double-bottleneck state')
  assert(final.at<seconds)
 }else{
  const half=runNormalStartV3(initial,{seconds:90})
  assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(half)),
   {seconds:90}),final,'A76 second narrowing lost 90+90s exact restart')
 }
 examples.push({n,mode:'corridor',geometry:'double_pinch',
  physicalGateBookings:n,secondGateBookings:0,
  targetSeconds:seconds,status:m.status,acceptedSeconds:m.seconds,
  completedLaneChanges:m.completedLaneChanges,
  nearStopTicks:m.nearStopRiderTicks,
  lastRiderX:Math.min(...final.states.map(s=>s.x)),
  firstCollision:m.firstCollision,firstRoadViolation:m.firstRoadViolation})
}
// A real body-valid FIVE abreast x/y grid (not the historic y=0/4.4
// zero-body positions) is an adversarial capacity case: a three-track
// two-slot planner must return an EXPLICIT failure before accepting time.
for(const n of [32,106,168]){
 const start=createNormalStartV3(n,{...base,mode:'five_dense',
  roadGeometry:'strong_pinch'})
 assert(start.states.every(s=>s.y>=.3-1e-6&&s.y<=4.1+1e-6))
 const row=start.states.slice(0,5).map(s=>s.y)
 assert.deepEqual(row,[.3,1.25,2.2,3.15,4.1])
 assert.equal(start.roadGateStatus,'UNRESOLVED')
 const rejection=advanceNormalStartV3(start)
 assert.equal(rejection.reason,'GATE_ENTRY_NO_WINDOW')
 assert.equal(rejection.at,0)
 assert.equal(rejection.acceptedSteps,0)
 assert.deepEqual(rejection.states,start.states)
 const reflected=createNormalStartV3(n,{...base,mode:'five_dense',
  roadGeometry:'strong_pinch',mirror:true})
 const renamed=createNormalStartV3(n,{...base,mode:'five_dense',
  roadGeometry:'strong_pinch',renamed:true})
 assert.equal(advanceNormalStartV3(reflected).reason,'GATE_ENTRY_NO_WINDOW')
 assert.equal(advanceNormalStartV3(renamed).reason,'GATE_ENTRY_NO_WINDOW')
 examples.push({n,mode:'five_dense',geometry:'strong_pinch',
  status:'GATE_ENTRY_NO_WINDOW',acceptedSeconds:0,
  requestedRows:Math.ceil(n/5),fullBicycleStartsValid:true,
  firstRejection:'UNRESOLVED_FIVE_TO_TWO_ADMISSION',
  noOfficialWrites:true})
}
// A malformed physical starting position AT the second constriction is
// not a valid state merely because the first booked gate was once valid.
const invalid=createNormalStartV3(8,{...base,roadGeometry:'double_pinch'})
invalid.states[0].x=1230
invalid.states[0].y=1.1
const stopped=advanceNormalStartV3(invalid)
assert.equal(stopped.reason,'ROAD_ENVELOPE_VIOLATION',
 'A76 second pinch swept bicycle edge was not fail-closed')
assert.equal(stopped.at,0)
assert.deepEqual(stopped.states,invalid.states)
const report={study:'A2_STEP76_DOUBLE_BOTTLENECK_AND_FIVE_ABREAST',
 technicalGate:'PASS',sportingGate:'NO_GO',
 preservedOriginalRoadGeometry:true,
 secondBottleneckAtX:1230,
 secondPinchMinimumWidthM:2.2,
 bodyHalfWidthM:.3,originalFirstGateBookOnly:true,
 fiveAbreastBodyValidButAdmissionFailClosed:true,
 mirroredAndRenamedPhysicalParity:true,
 independentSecondRoadsideViolationRejected:true,
 actualFullStageSportingApproval:'NOT_APPROVED',
 examples,officialWrites:0}
const dir=process.env.V3_A2_STEP76_DIR??'/tmp/a2-step76'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step76-double-bottleneck-and-five-abreast.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,examples:examples.map(x=>({
 n:x.n,mode:x.mode,geometry:x.geometry,
 status:x.status,accepted:x.acceptedSeconds,
 laneChanges:x.completedLaneChanges??0,nearStops:x.nearStopTicks??0,
 rearX:x.lastRiderX,firstContact:x.firstCollision?.pair??null,
 firstRoadExit:x.firstRoadViolation?.riderId??null
 })),officialWrites:0}))
