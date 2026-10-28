/** A71 two-slot stagger, normal-start 32/106/168 on full bike width.
 * A collision is failure evidence, never repaired or counted as completion.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {twoSlotStaggerPlanV3,physicalLateralCapacityV3}
 from './a2LaneCapacityPlannerV3.mjs'
import {createNormalStartV3,runNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const same=(a,b)=>Math.abs(a-b)<1e-5
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3}
assert.equal(physicalLateralCapacityV3('strong_pinch',800,
 {bodyHalfWidthM:.3}).simultaneousLateralSlots,2)
const trial=[]
const run=(n,roadGeometry,roadMergePolicy,seconds,other={})=>{
 const initial=createNormalStartV3(n,{...base,roadGeometry,roadMergePolicy,...other})
 const end=runNormalStartV3(initial,{seconds})
 const metrics=finishNormalStartMetricsV3(initial,end)
 assert(end.at<=seconds&&
  end.states.every(s=>s.v>=0&&s.energy.remainingWPrimeJoules>=0&&
   same(s.energy.seconds,end.at)),'A71 invalid clock/energy/speed')
 assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
 'ENERGY_FAILED'].includes(metrics.status),'A71 unknown status')
 if(end.reason){
  assert(end.at<seconds,'A71 reported future collision after accepting step')
  assert.throws(()=>advanceNormalStartV3(end),'A71 improperly retried failed step')
 }else{
  assert.equal(end.at,seconds)
  const half=runNormalStartV3(initial,{seconds:seconds/2})
  assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(half)),
   {seconds:seconds/2}),end,'A71 step checkpoint mismatch')
 }
 return {initial,end,metrics}
}
// The pure planner must be invariant under spatial reflection and renaming.
for(const n of [32,106,168]){
 const start=createNormalStartV3(n,base)
 const left=twoSlotStaggerPlanV3(start.states,'strong_pinch')
 const reflected=twoSlotStaggerPlanV3(
  createNormalStartV3(n,{...base,mirror:true}).states,'strong_pinch')
 const renamed=twoSlotStaggerPlanV3(
  createNormalStartV3(n,{...base,renamed:true}).states,'strong_pinch')
 assert.deepEqual(left.map(x=>[x.staggerRequested,x.speedRequest,
  x.referenceGapM,x.flankingRiderCount]),
 reflected.map(x=>[x.staggerRequested,x.speedRequest,
  x.referenceGapM,x.flankingRiderCount]),'A71 planner mirror parity')
 assert.deepEqual(left.map(x=>[x.staggerRequested,x.speedRequest,
  x.referenceGapM,x.flankingRiderCount]),
 renamed.map(x=>[x.staggerRequested,x.speedRequest,
  x.referenceGapM,x.flankingRiderCount]),'A71 planner renamed parity')
}
assert.throws(()=>twoSlotStaggerPlanV3([
 {id:'a',x:600,y:2.2,v:9,desired:9},
 {id:'a',x:599,y:3.3,v:9,desired:9}],'strong_pinch'))
for(const n of [32,106,168]){
 for(const roadGeometry of ['mild_pinch','strong_pinch']){
  const seconds=n===32?120:90
  for(const roadMergePolicy of ['platoon_lane_forecast',
   'platoon_two_slot_stagger','platoon_two_slot_wave',
   'platoon_two_slot_hazard_hold']){
   const {initial,end,metrics}=run(n,roadGeometry,roadMergePolicy,seconds)
   const mirror=run(n,roadGeometry,roadMergePolicy,seconds,{mirror:true})
   const rename=run(n,roadGeometry,roadMergePolicy,seconds,{renamed:true})
   assert.equal(mirror.end.reason,end.reason,'A71 mirrored status differed')
   assert.equal(rename.end.reason,end.reason,'A71 renamed status differed')
   assert.equal(mirror.end.acceptedSteps,end.acceptedSteps)
   assert.equal(rename.end.acceptedSteps,end.acceptedSteps)
   for(let i=0;i<n;i++){
    const a=end.states[i],b=mirror.end.states[i],c=rename.end.states[i]
    assert(same(a.x,b.x)&&same(a.y,4.4-b.y),
     'A71 mirrored physical trajectory mismatch '+n+'/'+roadGeometry+'/'+
      roadMergePolicy+'/r'+i+': x='+a.x+'/'+b.x+' y='+a.y+'/'+b.y+
      ' statuses='+end.reason+'/'+mirror.end.reason+
      ' accepted='+end.at+'/'+mirror.end.at)
    assert(same(a.x,c.x)&&same(a.y,c.y),
     'A71 renaming changed rider physical trajectory')
    assert(same(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
    assert(same(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
   }
   trial.push({n,roadGeometry,policy:roadMergePolicy,
    targetSeconds:seconds,status:metrics.status,
    acceptedSeconds:metrics.seconds,
    completedLaneChanges:metrics.completedLaneChanges,
    staggerRiderTicks:metrics.roadTwoSlotStaggerRiderTicks,
    nearStopRiderTicks:metrics.nearStopRiderTicks,
    firstContact:metrics.firstCollision?.pair??null,
    firstRoadViolation:metrics.firstRoadViolation?.riderId??null,
    firstCollision:metrics.firstCollision,
    roadViolation:metrics.firstRoadViolation})
  }
 }
}
// The older 8s extended candidate is intentionally REJECTED for
// mirror-symmetry failure (106-rider strong pinch, rider 100).
// Keep this counterexample visible, not inside the promotable test loop.
const extended=run(106,'strong_pinch','platoon_two_slot_extended',90)
const extendedMirror=run(106,'strong_pinch',
 'platoon_two_slot_extended',90,{mirror:true})
const parityDifferences=extended.end.states.filter((a,i)=>{
 const b=extendedMirror.end.states[i]
 return !same(a.x,b.x)||!same(a.y,4.4-b.y)
}).length
assert(parityDifferences>0,
 'A71 rejected extended policy counterexample is no longer reproduced')
const knownRejectedVariant={
 policy:'platoon_two_slot_extended',
 case:'106 strong pinch',status:extended.metrics.status,
 mirrorDifferences:parityDifferences,sportingApproval:'REJECTED'
}
// Adversarial three-abreast riders on an already narrow section fail closed.
const impossible=createNormalStartV3(8,{...base,
 roadGeometry:'strong_pinch',roadMergePolicy:'platoon_two_slot_stagger'})
for(const i of [0,1,2])impossible.states[i].x=800
impossible.states[0].y=1.55
impossible.states[1].y=2.2
impossible.states[2].y=2.85
const negative=advanceNormalStartV3(impossible)
assert.equal(negative.reason,'SWEPT_CONTACT',
 'A71 accepted three physically overlapping bikes abreast')
assert.equal(negative.acceptedSteps,0)
assert.equal(negative.at,0)
assert.deepEqual(negative.states,impossible.states)
const waveStrong=trial.filter(x=>x.roadGeometry==='strong_pinch'&&
 x.policy==='platoon_two_slot_wave')
assert(waveStrong.length===3,'A71 missing 3 size strong two-slot wave corpus')
assert(waveStrong.every(x=>x.staggerRiderTicks>0),
 'A71 upstream stagger planner never constrained actual speed')
const hazard=trial.filter(x=>x.policy==='platoon_two_slot_hazard_hold')
assert(hazard.length===6,'A71 hazard candidate lacks one field-size/width case')
assert(hazard.every(x=>x.nearStopRiderTicks===0),
 'A71 no-new-pass regulation physically stopped riders')
assert(hazard.every(x=>{
 const base=trial.find(y=>y.n===x.n&&y.roadGeometry===x.roadGeometry&&
  y.policy==='platoon_lane_forecast')
 return x.acceptedSeconds>=base.acceptedSeconds
}),'A71 hazard policy cannot regress accepted physical duration')
const strong32=hazard.find(x=>x.n===32&&x.roadGeometry==='strong_pinch')
assert(strong32.acceptedSeconds>=20&&
 strong32.completedLaneChanges>0&&
 strong32.status==='ROAD_ENVELOPE_VIOLATION',
 'A71 32 strong remains rejected at road margin; never mark it complete')
const report={study:'A2_STEP71_TWO_SLOT_LONGITUDINAL_STAGGER',
 technicalGate:'PASS',sportingGate:'NO_GO',
 totalCases:trial.length,
 candidateClear:trial.filter(x=>x.policy!=='platoon_lane_forecast'&&
 x.status==='FULL_HORIZON_CLEAR').length,
 candidateRegressions:trial.filter(x=>x.policy!=='platoon_lane_forecast').filter(x=>{
 const b=trial.find(y=>y.n===x.n&&y.roadGeometry===x.roadGeometry&&
  y.policy==='platoon_lane_forecast')
 return x.acceptedSeconds<b.acceptedSeconds
 }).length,
 threeAbreastAtNarrowestRejected:true,
 bodyHalfWidthM:.3,sourceGeometry:'SYNTHETIC_UNCALIBRATED',
 noOfficialWrites:true,mirrorAndRenameParity:true,
 knownRejectedVariant,knownBlockedStrong32:strong32,
 exactRecoveryIfComplete:true,trial,officialWrites:0,
 sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP71_DIR??'/tmp/a2-step71'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step71-two-slot-stagger.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({
 study:report.study,technicalGate:report.technicalGate,
 candidateClear:report.candidateClear,
 candidateRegressions:report.candidateRegressions,
 knownRejectedVariant,
 results:trial.map(x=>({n:x.n,road:x.roadGeometry,policy:x.policy,
  status:x.status,seconds:x.acceptedSeconds,
  lanes:x.completedLaneChanges,staggerTicks:x.staggerRiderTicks,
  nearStops:x.nearStopRiderTicks,contact:x.firstContact,
  roadExit:x.firstRoadViolation})),officialWrites:0,
 sportingApproval:'NOT_APPROVED'
}))
