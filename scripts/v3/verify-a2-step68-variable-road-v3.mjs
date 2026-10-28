/** A68 standalone: variable road width and physically bounded merging.
 * This probes honest failure from ordinary t=0 starts; road loss is neither
 * accepted nor made to vanish via collision/velocity/position repairs.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {researchRoadEnvelopeV3,constrainedLaneTargetV3,
 roadEnvelopeViolationV3} from './a2VariableRoadWidthV3.mjs'
import {createNormalStartV3,advanceNormalStartV3,runNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const approx=(x,y)=>Math.abs(x-y)<1e-5
const CHECK=[0,600,680,720,780,800,920,950,1020,1200]
for(const kind of ['constant','mild_pinch','strong_pinch']){
 for(const x of CHECK){
  const e=researchRoadEnvelopeV3(kind,x)
  assert(approx(e.minY+e.maxY,4.4),'A68 road reflection biased')
  assert(e.minY>=0&&e.maxY<=4.4&&e.minY<=e.maxY)
  assert(approx(e.widthM,e.maxY-e.minY))
  if(kind==='constant')assert(approx(e.widthM,4.4))
 }
}
assert(approx(researchRoadEnvelopeV3('mild_pinch',800).widthM,3.3))
assert(approx(researchRoadEnvelopeV3('strong_pinch',800).widthM,2.2))
assert(approx(researchRoadEnvelopeV3('mild_pinch',1000).widthM,4.18))
assert.equal(roadEnvelopeViolationV3('constant',850,0),null)
assert(roadEnvelopeViolationV3('mild_pinch',850,0))
assert(roadEnvelopeViolationV3('strong_pinch',850,4.4))
const guarded=constrainedLaneTargetV3('mild_pinch',690,9,0,{previewSeconds:8})
assert(guarded.changed&&guarded.targetY>0&&guarded.targetY<=2.2)
assert(approx(constrainedLaneTargetV3('mild_pinch',690,9,4.4,{
 previewSeconds:8}).targetY,4.4-guarded.targetY),
 'A68 preview road correction left/right mismatch')
assert.throws(()=>researchRoadEnvelopeV3('bad',710))
assert.throws(()=>roadEnvelopeViolationV3('mild_pinch',Infinity,1))
const startOptions={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2}
const trials=[]
function run(n,geometry,seconds,variant={}){
 const start=createNormalStartV3(n,{...startOptions,roadGeometry:geometry,...variant})
 const end=runNormalStartV3(start,{seconds})
 const metrics=finishNormalStartMetricsV3(start,end)
 assert(metrics.seconds<=seconds,'A68 fabricated completed interval')
 assert(end.states.every(s=>s.energy.remainingWPrimeJoules>=0&&
  approx(s.energy.seconds,end.at)),'A68 energy accounting corrupted')
 assert(!end.reason||['ROAD_ENVELOPE_VIOLATION','SWEPT_CONTACT','ENERGY_FAILED']
  .includes(end.reason),'A68 unknown rejection')
 if(end.reason)assert(end.at<seconds,'A68 failed after completion')
 if(end.reason==='ROAD_ENVELOPE_VIOLATION'){
  assert(end.firstRoadViolation&&end.firstRoadViolation.riderId,
   'A68 missing first actual swept road breach')
  assert.throws(()=>advanceNormalStartV3(end),'A68 rejected state accepted by retry')
 }
 const report={n,geometry,roadMergePolicy:start.roadMergePolicy,
  requestedSeconds:seconds,...metrics,mode:'corridor'}
 trials.push(report)
 return {start,end,report}
}
// Fixed geometry must EXACTLY reproduce the previously accepted A67
// normal-start flow; this is a guard against changing the old controller.
for(const n of [32,106,168]){
 const seconds=n===32?90:60
 const {start,end,report}=run(n,'constant',seconds)
 assert.equal(report.status,'FULL_HORIZON_CLEAR',
  'A68 changed known constant-road reference')
 assert.equal(report.roadBoundaryGuardRiderTicks,0)
 assert.equal(report.firstRoadViolation,null)
 const halfway=runNormalStartV3(start,{seconds:seconds/2})
 assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(halfway)),
  {seconds:seconds/2}),end,'A68 constant checkpoint drift')
}
// Narrowing/reopening profiles are independent, not calibrated. Compare
// the same 32-,106-,168-rider starts and preserve ALL failures as evidence.
for(const n of [32,106,168]){
 const seconds=n===32?120:90
 for(const geometry of ['mild_pinch','strong_pinch']){
  const {start,end,report}=run(n,geometry,seconds)
  const mirrored=runNormalStartV3(createNormalStartV3(n,{
   ...startOptions,roadGeometry:geometry,mirror:true}),{seconds})
  const renamed=runNormalStartV3(createNormalStartV3(n,{
   ...startOptions,roadGeometry:geometry,renamed:true}),{seconds})
  assert.equal(mirrored.reason,end.reason,
   'A68 symmetric road profile changed failure category')
  assert.equal(renamed.reason,end.reason,
   'A68 rider rename changed failure category')
  assert.equal(mirrored.acceptedSteps,end.acceptedSteps,
   'A68 reflection changed time of road failure')
  assert.equal(renamed.acceptedSteps,end.acceptedSteps,
   'A68 rename changed time of road failure')
  for(let i=0;i<n;i++){
   const a=end.states[i],b=mirrored.states[i],c=renamed.states[i]
   assert(approx(a.x,b.x)&&approx(a.y,4.4-b.y),
    'A68 mirrored accepted trajectory differs')
   assert(approx(a.x,c.x)&&approx(a.y,c.y),
    'A68 renamed accepted trajectory differs')
   assert(approx(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
   assert(approx(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
  }
  if(!end.reason){
   const first=runNormalStartV3(start,{seconds:seconds/2})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(first)),
    {seconds:seconds/2}),end,'A68 variable-width exact restart mismatch')
  }
 }
}
// Matched A68b: buffered following increases a spatially forecast headway
// before a narrowed lane closes. Every acceleration remains bounded and
// all same-pair swept contacts remain fail-closed. Never select a policy
// retrospectively per rider, per road case or from future accepted motion.
for(const n of [32,106,168]){
 const seconds=n===32?120:90
 for(const geometry of ['mild_pinch','strong_pinch']){
  const cfg={roadMergePolicy:'buffered_headway'}
  const {start,end,report}=run(n,geometry,seconds,cfg)
  assert(report.roadMergeBufferedRiderTicks>0,
   'A68 buffered policy did not see spatial pinch in time')
  const reflected=runNormalStartV3(createNormalStartV3(n,{
   ...startOptions,roadGeometry:geometry,...cfg,mirror:true}),{seconds})
  const renamed=runNormalStartV3(createNormalStartV3(n,{
   ...startOptions,roadGeometry:geometry,...cfg,renamed:true}),{seconds})
  assert.equal(reflected.reason,end.reason,'A68 buffered mirror status differs')
  assert.equal(renamed.reason,end.reason,'A68 buffered rename status differs')
  assert.equal(reflected.acceptedSteps,end.acceptedSteps)
  assert.equal(renamed.acceptedSteps,end.acceptedSteps)
  for(let i=0;i<n;i++){
   const a=end.states[i],b=reflected.states[i],c=renamed.states[i]
   assert(approx(a.x,b.x)&&approx(a.y,4.4-b.y),
    'A68 buffered mirrored geometry differs')
   assert(approx(a.x,c.x)&&approx(a.y,c.y),
    'A68 buffered renamed rider changes accepted movement')
  }
  if(!end.reason){
   const first=runNormalStartV3(start,{seconds:seconds/2})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(first)),
    {seconds:seconds/2}),end,'A68 buffered accepted restart is not exact')
  }
 }
}
// A68c: physics-only trailing yield, explicit lane occupancy reservation.
// Do not assume the bottleneck is fixed: each result may honestly be rejected.
for(const n of [32,106,168]){
 const seconds=n===32?120:90
 for(const geometry of ['mild_pinch','strong_pinch']){
  const cfg={roadMergePolicy:'yield_reservation'}
  const {start,end,report}=run(n,geometry,seconds,cfg)
  assert(report.roadMergeYieldRiderTicks>0,
   'A68 physical merge reservation was not exercised')
  const reflected=runNormalStartV3(createNormalStartV3(n,{
   ...startOptions,roadGeometry:geometry,...cfg,mirror:true}),{seconds})
  const renamed=runNormalStartV3(createNormalStartV3(n,{
   ...startOptions,roadGeometry:geometry,...cfg,renamed:true}),{seconds})
  assert.equal(reflected.reason,end.reason,
   'A68 yield physical reflection changed status')
  assert.equal(renamed.reason,end.reason,'A68 yield identity changed status')
  assert.equal(reflected.acceptedSteps,end.acceptedSteps)
  assert.equal(renamed.acceptedSteps,end.acceptedSteps)
  for(let i=0;i<n;i++){
   const a=end.states[i],b=reflected.states[i],c=renamed.states[i]
   assert(approx(a.x,b.x)&&approx(a.y,4.4-b.y),
    'A68 yield mirror motion changed')
   assert(approx(a.x,c.x)&&approx(a.y,c.y),'A68 yield ID motion changed')
   assert(approx(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
   assert(approx(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
  }
  if(!end.reason){
   const first=runNormalStartV3(start,{seconds:seconds/2})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(first)),
    {seconds:seconds/2}),end,'A68 yield checkpoint restart differs')
  }
 }
}
// Intentionally road-infeasible ordinary state must fail closed at time
// zero, with no energy, position or race-clock advance.
const invalid=createNormalStartV3(8,{
 ...startOptions,roadGeometry:'mild_pinch'})
invalid.states[0].x=800
invalid.states[0].y=0
const rejection=advanceNormalStartV3(invalid)
assert.equal(rejection.reason,'ROAD_ENVELOPE_VIOLATION')
assert.equal(rejection.at,0)
assert.equal(rejection.acceptedSteps,0)
assert.deepEqual(rejection.states,invalid.states,
 'A68 mutated rider during impossible margin rejection')
const study={
 study:'A2_STEP68_SPATIAL_ROAD_WIDTH_TRANSITIONS',
 technicalGate:'PASS',sportingGate:'NO_GO',profiles:['constant','mild_pinch','strong_pinch'],
 widthAtNarrowest:{mildM:3.3,strongM:2.2},
 initialRoadWidthM:4.4,
 narrowingStartX:680,fullNarrowByX:780,fullNarrowUntilX:920,
 reopenedAtX:1020,
 roadBoundariesCheckedAtMicrointervals:true,
 firstBreachesRejectWholePhysicalStep:true,
 provisionalUnverifiedSourceGeometry:true,
 originalConstantRoadNotChanged:true,
 mirrorAndRenameStatusParity:true,exactCheckpointForCompletedTrials:true,
 failedBoundaryCannotCommit:true,
 trials,officialWrites:0,sportingApproval:'NOT_APPROVED'
}
const dir=process.env.V3_A2_STEP68_DIR??'/tmp/a2-step68'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step68-road-transition-results.json',JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify({study:study.study,technicalGate:study.technicalGate,
 sportingGate:study.sportingGate,roadGrid:study.widthAtNarrowest,
 testResults:trials.map(x=>({n:x.n,profile:x.geometry,
  requestedSeconds:x.requestedSeconds,acceptedSeconds:x.seconds,
  status:x.status,mergePolicy:x.roadMergePolicy,
  roadGuards:x.roadBoundaryGuardRiderTicks,
  bufferedTicks:x.roadMergeBufferedRiderTicks,
  yieldTicks:x.roadMergeYieldRiderTicks,
  completedLanes:x.completedLaneChanges,
  firstRoadViolation:x.firstRoadViolation,firstCollision:x.firstCollision})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
