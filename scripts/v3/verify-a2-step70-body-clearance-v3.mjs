/** A70 bicycle-envelope roadside acceptance study. The historical A68
 * centre-only envelope remains the explicit backward-compatibility control.
 * This study does NOT relabel boundary contact as a successful race.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {physicalLateralCapacityV3} from './a2LaneCapacityPlannerV3.mjs'
import {roadEnvelopeViolationV3,researchRoadEnvelopeV3}
 from './a2VariableRoadWidthV3.mjs'
import {createNormalStartV3,advanceNormalStartV3,runNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const near=(x,y)=>Math.abs(x-y)<=1e-5
const profileSlots=['constant','mild_pinch','strong_pinch'].map(kind=>
 physicalLateralCapacityV3(kind,800,{bodyHalfWidthM:.3}))
assert.deepEqual(profileSlots.map(x=>x.simultaneousLateralSlots),[5,4,2],
 'A70 lateral bicycle capacity miscomputed: strong 2.2m road is not 3 parallel lanes')
assert(near(physicalLateralCapacityV3('strong_pinch',800).usableWidthM,1.6))
assert.equal(roadEnvelopeViolationV3('strong_pinch',800,1.1),null)
assert(roadEnvelopeViolationV3('strong_pinch',800,1.1,{bodyHalfWidthM:.3}),
 'A70 rider center at the road edge does not fit complete bike')
assert.equal(roadEnvelopeViolationV3('strong_pinch',800,2.2,{
 bodyHalfWidthM:.3}),null)
assert.throws(()=>physicalLateralCapacityV3('strong_pinch',800,{
 bodyHalfWidthM:-.3}))
const scenarios=[]
for(const n of [32,106,168])for(const geometry of [
 'mild_pinch','strong_pinch'
])for(const policy of ['platoon_lane_forecast','platoon_capacity_wave']){
 const seconds=n===32?120:90
 const cfg={mode:'corridor',controllerPolicy:'coordinated_demand',
  headwayStandOffM:3.2,roadGeometry:geometry,roadMergePolicy:policy,
  bodyHalfWidthM:.3}
 const run=(options={})=>{
  const start=createNormalStartV3(n,{...cfg,...options})
  const end=runNormalStartV3(start,{seconds})
  const m=finishNormalStartMetricsV3(start,end)
  assert(m.bodyHalfWidthM===.3&&end.at<=seconds)
  assert(end.states.every(s=>s.energy.remainingWPrimeJoules>=0&&
   near(s.energy.seconds,end.at)))
  assert(['FULL_HORIZON_CLEAR','ROAD_ENVELOPE_VIOLATION','SWEPT_CONTACT',
   'ENERGY_FAILED'].includes(m.status))
  if(end.reason){
   assert(end.at<seconds)
   assert.throws(()=>advanceNormalStartV3(end))
  }else{
   assert.equal(end.at,seconds)
   const mid=runNormalStartV3(start,{seconds:seconds/2})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(mid)),
    {seconds:seconds/2}),end,'A70 bicycle-body restart mismatch')
  }
  return {start,end,m}
 }
 const base=run(),mirror=run({mirror:true}),rename=run({renamed:true})
 assert.equal(base.end.reason,mirror.end.reason,'A70 body reflected status')
 assert.equal(base.end.reason,rename.end.reason,'A70 body rider rename status')
 assert.equal(base.end.acceptedSteps,mirror.end.acceptedSteps)
 assert.equal(base.end.acceptedSteps,rename.end.acceptedSteps)
 for(let i=0;i<n;i++){
  const a=base.end.states[i],b=mirror.end.states[i],c=rename.end.states[i]
  assert(near(a.x,b.x)&&near(a.y,4.4-b.y),'A70 body reflection drift')
  assert(near(a.x,c.x)&&near(a.y,c.y),'A70 body rider-ID drift')
  assert(near(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
 }
 scenarios.push({n,geometry,policy,status:base.m.status,
  secondsAccepted:base.m.seconds,secondsRequested:seconds,
  completedLanes:base.m.completedLaneChanges,
  nearStopTicks:base.m.nearStopRiderTicks,
  firstCollision:base.m.firstCollision,
  firstRoadViolation:base.m.firstRoadViolation})
}
// A source-free impossible body placement must be rejected at the first
// physical microinterval without advancing time or spending W-prime.
const impossible=createNormalStartV3(8,{
 mode:'corridor',controllerPolicy:'coordinated_demand',
 roadGeometry:'strong_pinch',roadMergePolicy:'platoon_capacity_wave',
 headwayStandOffM:3.2,bodyHalfWidthM:.3})
impossible.states[0].x=800
impossible.states[0].y=1.1
const rejected=advanceNormalStartV3(impossible)
assert.equal(rejected.reason,'ROAD_ENVELOPE_VIOLATION')
assert.equal(rejected.at,0)
assert.equal(rejected.acceptedSteps,0)
assert.deepEqual(rejected.states,impossible.states)
const report={study:'A2_STEP70_BICYCLE_BODY_EDGE_REALISM',
 technicalGate:'PASS',sportingGate:'NO_GO',
 halfBicycleWidthM:.3,provisionalUncalibrated:true,
 minLongitudinalClearanceUnchanged:true,
 fieldInitialThreeColumns:true,fullBikeWidthCheckedAtPhysicalSubintervals:true,
 nominalGeometrySimultaneousSlots:profileSlots,
 fullStageApproved:false,mirrorRenameParity:true,
 forbiddenRoadStartRejectedBeforeCommit:true,scenarios,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP70_DIR??'/tmp/a2-step70'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step70-bicycle-edge-capacity.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({
 study:report.study,technicalGate:report.technicalGate,
 geometricSlots:profileSlots.map(x=>({kind:x.kind,
   roadWidth:x.nominalWidthM,usableWidth:x.usableWidthM,
   lateralSlots:x.simultaneousLateralSlots})),
 scenarios:scenarios.map(x=>({n:x.n,geometry:x.geometry,policy:x.policy,
  status:x.status,secondsAccepted:x.secondsAccepted,
  firstCollision:x.firstCollision?.pair??null,
  firstRoadViolation:x.firstRoadViolation?.riderId??null})),
 sportingApproval:'NOT_APPROVED'
}))
