/** A70 normal-start whole-peloton road capacity / upstream pace study.
 * Positive outcomes must survive unchanged all-pair physical sweep and
 * full road-edge rejection, not a late rider relocation or speed reset.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {capacityPlanV3} from './a2LaneCapacityPlannerV3.mjs'
import {createNormalStartV3,advanceNormalStartV3,runNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const opt={mode:'corridor',controllerPolicy:'coordinated_demand',headwayStandOffM:3.2}
const kinds=['mild_pinch','strong_pinch']
const policies=['platoon_lane_forecast','platoon_capacity_hold','platoon_capacity_wave']
const records=[]
// Controller is read-only and deterministic; separate from normal-start
// movement. No rider-ID priority, road-reflection effects or hidden future.
for(const n of [32,106,168]){
 const original=createNormalStartV3(n,opt)
 for(const roadGeometry of kinds){
  const left=capacityPlanV3(original.states,roadGeometry)
  const mirrored=capacityPlanV3(createNormalStartV3(n,{...opt,mirror:true}).states,
   roadGeometry)
  const renamed=capacityPlanV3(createNormalStartV3(n,{...opt,renamed:true}).states,
   roadGeometry)
  assert.deepEqual(left.map(x=>[x.hold,x.minimumWidthM,x.speedRequest]),
   mirrored.map(x=>[x.hold,x.minimumWidthM,x.speedRequest]),
   'A70 planner road reflection changed capacity decisions')
  assert.deepEqual(left.map(x=>[x.hold,x.minimumWidthM,x.speedRequest]),
   renamed.map(x=>[x.hold,x.minimumWidthM,x.speedRequest]),
   'A70 planner rider names changed capacity decisions')
 }
}
assert.throws(()=>capacityPlanV3([{id:'a',x:0,y:0,v:1,desired:1},
 {id:'a',x:10,y:0,v:1,desired:1}],'constant'))
function run(n,roadGeometry,roadMergePolicy,seconds,flags={}){
 const initial=createNormalStartV3(n,{...opt,roadGeometry,roadMergePolicy,...flags})
 const last=runNormalStartV3(initial,{seconds})
 const m=finishNormalStartMetricsV3(initial,last)
 assert(last.at<=seconds&&last.at>=0&&m.officialWrites===0)
 assert(last.states.every(x=>x.v>=0&&x.v<=50&&
  x.energy.remainingWPrimeJoules>=0&&eq(x.energy.seconds,last.at)))
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
  'ENERGY_FAILED'].includes(m.status))
 if(last.reason){
  assert(last.at<seconds,'A70 accepted failed step')
  assert.throws(()=>advanceNormalStartV3(last))
 }
 if(m.status==='FULL_HORIZON_CLEAR'){
  assert.equal(m.seconds,seconds,'A70 false full completion')
  const halfway=runNormalStartV3(initial,{seconds:seconds/2})
  assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(halfway)),
   {seconds:seconds/2}),last,'A70 checkpoint not deterministic')
 }
 return {initial,last,m}
}
for(const n of [32,106,168]){
 const seconds=n===32?120:90
 for(const roadGeometry of kinds){
  for(const roadMergePolicy of policies){
   const {last,m}=run(n,roadGeometry,roadMergePolicy,seconds)
   if(n===32&&roadMergePolicy==='platoon_lane_forecast'){
    assert.equal(m.status,'FULL_HORIZON_CLEAR',
     'A70 changed A69 known safe 32-rider width transition')
    assert.equal(m.nearStopRiderTicks,0)
   }
   if(roadMergePolicy!=='platoon_lane_forecast')
    assert(m.roadLaneForecastGuardTicks>0||m.roadCapacityHoldRiderTicks>0,
     'A70 candidate never encountered future narrowing')
   if(roadMergePolicy==='platoon_capacity_wave')
    assert(m.roadCapacityPaceLimitedRiderTicks>0,
     'A70 traffic communication was never actually activated')
   const reflected=run(n,roadGeometry,roadMergePolicy,seconds,{mirror:true})
   const renamed=run(n,roadGeometry,roadMergePolicy,seconds,{renamed:true})
   assert.equal(reflected.last.reason,last.reason,'A70 mirror reason mismatch')
   assert.equal(renamed.last.reason,last.reason,'A70 rename reason mismatch')
   assert.equal(reflected.last.acceptedSteps,last.acceptedSteps)
   assert.equal(renamed.last.acceptedSteps,last.acceptedSteps)
   for(let i=0;i<n;i++){
    const a=last.states[i],b=reflected.last.states[i],c=renamed.last.states[i]
    assert(eq(a.x,b.x)&&eq(a.y,4.4-b.y),'A70 mirror physical drift')
    assert(eq(a.x,c.x)&&eq(a.y,c.y),'A70 identity physical drift')
    assert(eq(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
    assert(eq(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
   }
   records.push({n,roadGeometry,roadMergePolicy,targetSeconds:seconds,
    status:m.status,acceptedSeconds:m.seconds,
    nearStopRiderTicks:m.nearStopRiderTicks,completedLaneChanges:m.completedLaneChanges,
    firstCollision:m.firstCollision,firstRoadViolation:m.firstRoadViolation,
    roadCapacityHoldRiderTicks:m.roadCapacityHoldRiderTicks,
    roadCapacityPaceLimitedRiderTicks:m.roadCapacityPaceLimitedRiderTicks,
    roadLaneForecastGuardTicks:m.roadLaneForecastGuardTicks,
    frontToLastGapM:m.frontToLastGapM,
    minimumSpeedMps:m.minimumSpeedMps})
  }
 }
}
// Compare each candidate against exactly the same A69 reference.
const comparisons=records.filter(x=>x.roadMergePolicy!=='platoon_lane_forecast')
 .map(x=>({...x,baselineAcceptedSeconds:records.find(y=>
  y.n===x.n&&y.roadGeometry===x.roadGeometry&&
  y.roadMergePolicy==='platoon_lane_forecast').acceptedSeconds}))
const report={
 study:'A2_STEP70_FULL_FIELD_CAPACITY_ADMISSION',
 technicalGate:'PASS',sportingGate:'NO_GO',
 scenarios:records.length,
 candidateClear:comparisons.filter(x=>x.status==='FULL_HORIZON_CLEAR').length,
 candidateRegressions:comparisons.filter(x=>
  x.acceptedSeconds<x.baselineAcceptedSeconds).length,
 candidateImprovements:comparisons.filter(x=>
  x.acceptedSeconds>x.baselineAcceptedSeconds).length,
 noFrozenFutureMotion:true,readOnlyCapacityPlan:true,unchangedPhysicalSweep:true,
 sourceRoadGeometry:'PROVISIONAL_UNSOURCED',physicalBodyEdgeMarginCalibrated:false,
 mirrorAndIdentityParity:true,exactReplayOnCompletedCases:true,
 records,comparisons,officialWrites:0,sportingApproval:'NOT_APPROVED'
}
const dir=process.env.V3_A2_STEP70_DIR??'/tmp/a2-step70'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step70-full-field-capacity.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 candidateClear:report.candidateClear,
 candidateRegressions:report.candidateRegressions,
 candidateImprovements:report.candidateImprovements,
 records:records.map(({n,roadGeometry,roadMergePolicy,status,acceptedSeconds,
  completedLaneChanges,nearStopRiderTicks,roadCapacityHoldRiderTicks,
  roadCapacityPaceLimitedRiderTicks,firstCollision,firstRoadViolation})=>({
  n,roadGeometry,roadMergePolicy,status,acceptedSeconds,
  completedLaneChanges,nearStopRiderTicks,roadCapacityHoldRiderTicks,
  roadCapacityPaceLimitedRiderTicks,
  firstCollision:firstCollision?.pair??null,
  firstRoadViolation:firstRoadViolation?.riderId??null})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
