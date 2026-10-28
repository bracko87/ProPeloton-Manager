/** Step 69: multi-rider zipper admission and leader-assist feasibility
 * Same normal starts and spatial width fixtures as A68. No future A44 paths,
 * mutation of official race outcomes, post-contact motion or test exclusions.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3,runNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const policies=['yield_reservation','platoon_soft_yield','platoon_chain',
 'platoon_lane_forecast','platoon_lane_forecast_chain',
 'platoon_lane_forecast_buffer']
const geometries=['mild_pinch','strong_pinch']
const equal=(x,y)=>Math.abs(x-y)<=1e-5
const cases=[]
function evaluate(n,geometry,policy,seconds,{mirror=false,renamed=false}={}){
 const initial=createNormalStartV3(n,{
  mode:'corridor',controllerPolicy:'coordinated_demand',headwayStandOffM:3.2,
  roadGeometry:geometry,roadMergePolicy:policy,mirror,renamed
 })
 const end=runNormalStartV3(initial,{seconds})
 const metrics=finishNormalStartMetricsV3(initial,end)
 assert(end.at<=seconds,'A69 accepted clock exceeds full horizon')
 assert(metrics.acceptedSteps===end.acceptedSteps,'A69 missing step')
 assert(end.states.every(s=>s.v>=0&&s.v<=50&&
  s.energy.remainingWPrimeJoules>=0&&equal(s.energy.seconds,end.at)),
  'A69 invalid bounded speed or energy/clock')
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
  'ENERGY_FAILED'].includes(metrics.status),'A69 unknown fail-closed reason')
 if(metrics.status==='FULL_HORIZON_CLEAR')
  assert(equal(metrics.seconds,seconds),'A69 fabricated completion')
 if(end.reason){
  assert(end.at<seconds,'A69 rejected step was accepted')
  assert.throws(()=>advanceNormalStartV3(end),'A69 failed race resumed')
 }
 const item={n,geometry,policy,seconds,status:metrics.status,
  acceptedSeconds:metrics.seconds,contact:metrics.firstCollision,
  roadExit:metrics.firstRoadViolation,
  completedLaneChanges:metrics.completedLaneChanges,
  riderOrderReversals:metrics.uniquePairOrderReversals,
  nearStopRiderTicks:metrics.nearStopRiderTicks,
  yieldTicks:metrics.roadMergeYieldRiderTicks,
  leaderAssistTicks:metrics.roadPlatoonAssistRiderTicks,
  unresolvedPairConstraints:metrics.roadPlatoonUnresolvedConstraints,
  deadEndLaneGuards:metrics.roadLaneForecastGuardTicks,
  lastGapM:metrics.frontToLastGapM}
 if(!mirror&&!renamed)cases.push(item)
 return {initial,end,metrics,item}
}
for(const n of [32,106,168]){
 const seconds=n===32?120:90
 for(const geometry of geometries){
  for(const policy of policies){
   const {initial,end,metrics,item}=evaluate(n,geometry,policy,seconds)
   // All variants must actually confront the same narrowing, not mask it
   // by choosing a separate grid or relaxing the collision checker.
   if(policy.startsWith('platoon_lane_forecast')){
    assert(metrics.roadLaneForecastGuardTicks>0,
     'A69 forecast policy failed to prevent any dead-end outside-lane entry')
   }else{
    assert(metrics.roadMergeYieldRiderTicks>0,
     'A69 zipper policy did not exercise any actual occupied-lane yielding')
   }
   if(n===32&&policy==='platoon_lane_forecast'){
    assert.equal(metrics.status,'FULL_HORIZON_CLEAR',
     'A69 known 32-rider width-transition forecast success regressed')
    assert.equal(metrics.nearStopRiderTicks,0,
     'A69 32-rider road pinching caused prohibited near-halts')
    assert(metrics.completedLaneChanges>0,
     'A69 32-rider road safety achieved only by suppressing all passes')
   }
   const mirror=evaluate(n,geometry,policy,seconds,{mirror:true})
   const rename=evaluate(n,geometry,policy,seconds,{renamed:true})
   assert.equal(mirror.end.reason,end.reason,'A69 mirror status mismatch')
   assert.equal(rename.end.reason,end.reason,'A69 rename status mismatch')
   assert.equal(mirror.end.acceptedSteps,end.acceptedSteps,
    'A69 mirror accepted-step mismatch')
   assert.equal(rename.end.acceptedSteps,end.acceptedSteps,
    'A69 rename accepted-step mismatch')
   for(let i=0;i<n;i++){
    const a=end.states[i],b=mirror.end.states[i],c=rename.end.states[i]
    assert(equal(a.x,b.x)&&equal(a.y,4.4-b.y),
     'A69 mirror x/y differs at same physical checkpoint')
    assert(equal(a.x,c.x)&&equal(a.y,c.y),
     'A69 renaming influenced the intended physical field')
    assert(equal(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules),
     'A69 mirror Wprime differs')
    assert(equal(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules),
     'A69 renaming Wprime differs')
   }
   if(!end.reason){
    const mid=runNormalStartV3(initial,{seconds:seconds/2})
    assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(mid)),
     {seconds:seconds/2}),end,'A69 full checkpoint recovery differs')
   }
  }
 }
}
// Adversarial physical start beyond the active road border cannot be
// rescued by coordinated acceleration or erased with a lateral jump.
for(const policy of policies.slice(1)){
 const start=createNormalStartV3(8,{
  mode:'corridor',controllerPolicy:'coordinated_demand',headwayStandOffM:3.2,
  roadGeometry:'strong_pinch',roadMergePolicy:policy})
 start.states[0].x=800;start.states[0].y=0
 const rejected=advanceNormalStartV3(start)
 assert.equal(rejected.reason,'ROAD_ENVELOPE_VIOLATION')
 assert.equal(rejected.at,0)
 assert.equal(rejected.acceptedSteps,0)
 assert.deepEqual(rejected.states,start.states)
}
const paired=cases.filter(c=>c.policy!=='yield_reservation').map(c=>{
 const baseline=cases.find(b=>b.n===c.n&&b.geometry===c.geometry&&
  b.policy==='yield_reservation')
 return {...c,baselineStatus:baseline.status,
  baselineAcceptedSeconds:baseline.acceptedSeconds,
  acceptedSecondsDelta:Math.round((c.acceptedSeconds-
   baseline.acceptedSeconds)*1e6)/1e6,
  collisionPairChanged:JSON.stringify(c.contact?.pair??null)!==
   JSON.stringify(baseline.contact?.pair??null)}
})
const summary={
 study:'A2_STEP69_MULTI_RIDER_MERGE_CHAIN',
 technicalGate:'PASS',sportingGate:'NO_GO',
 acceptedContacts:0,invalidOfficialWrites:0,
 originalConstantWidthControlsRetained:true,
 allMirrorAndIdFairnessChecksPass:true,
 forcedOutsideRoadStartRejected:true,
 noRiderSpecificExceptions:true,
 candidateCount:paired.length,
 improvementCases:paired.filter(c=>c.acceptedSecondsDelta>0).length,
 regressionCases:paired.filter(c=>c.acceptedSecondsDelta<0).length,
 fullWidthTransitionSuccesses:paired.filter(c=>c.status==='FULL_HORIZON_CLEAR').length,
 comparisons:paired,cases,officialWrites:0,sportingApproval:'NOT_APPROVED'
}
const dir=process.env.V3_A2_STEP69_DIR??'/tmp/a2-step69'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step69-chain-merging.json',JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({
 study:summary.study,technicalGate:summary.technicalGate,
 sportingGate:summary.sportingGate,improvementCases:summary.improvementCases,
 regressionCases:summary.regressionCases,
 fullWidthTransitionSuccesses:summary.fullWidthTransitionSuccesses,
 cases:cases.map(c=>({n:c.n,geometry:c.geometry,policy:c.policy,
  status:c.status,acceptedSeconds:c.acceptedSeconds,
  firstCollision:c.contact?.pair??null,firstRoadExit:c.roadExit?.riderId??null,
  nearStopRiderTicks:c.nearStopRiderTicks,completedLaneChanges:c.completedLaneChanges,
  yieldTicks:c.yieldTicks,leaderAssistTicks:c.leaderAssistTicks,
  deadEndLaneGuards:c.deadEndLaneGuards,
  unresolvedPairConstraints:c.unresolvedPairConstraints})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'
}))
