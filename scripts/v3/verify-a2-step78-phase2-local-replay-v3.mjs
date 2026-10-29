/** A78 Phase2: certify actual full 32 rider 180s physical and independent
 * 3s overtaking under the NEW local mode; parity also on rejected large runs.
 * Rejected physical ticks are never committed or repaired.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {startSustainedOvertakeObserverV3,
 advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const equal=(x,y)=>Math.abs(x-y)<1e-5
const config={mode:'five_dense',roadGeometry:'staged_pinch',
 pacePolicy:'joint_local_negotiation_v1',
 controllerPolicy:'coordinated_demand',headwayStandOffM:4.5}
function coupled(initial,seconds,observer=null){
 let snapshot=structuredClone(initial)
 let passing=observer??startSustainedOvertakeObserverV3(
  snapshot.physical.states)
 const target=snapshot.physical.at+seconds
 while(snapshot.physical.at<target-1e-8&&!snapshot.reason){
  const next=advanceMultiGatePhysicalCandidateV3(snapshot)
  if(!next.reason)passing=advanceSustainedOvertakeObserverV3(
   passing,snapshot.physical.states,next.physical.states,.5)
  snapshot=next
 }
 return {snapshot,passing}
}
const initial=createMultiGatePhysicalCandidateV3(32,config)
const complete=coupled(initial,180),end=complete.snapshot
const metrics=multiGatePhysicalMetricsV3(initial,end)
const observed=overtakeObserverSummaryV3(complete.passing)
assert.equal(end.reason,null)
assert.equal(end.physical.at,180)
assert.equal(metrics.nearStops,0)
assert.equal(metrics.allPastSecondReopening,true)
assert.equal(metrics.firstCollision,null)
assert.equal(metrics.firstRoadViolation,null)
assert(observed.confirmedSustainedPasses>=80,
 'A78 Phase2 local mode erased physically confirmed overtakes')
assert.equal(observed.durationSeconds,180)
const half=coupled(initial,90)
const restored=coupled(JSON.parse(JSON.stringify(half.snapshot)),90,
 JSON.parse(JSON.stringify(half.passing)))
assert.deepEqual(restored,complete,
 'A78 phase2 local 90+90 serialized physics/passing differs')
for(const variation of [{mirror:true},{renamed:true}]){
 const altered=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(32,{...config,...variation}),
  {seconds:180})
 assert.equal(altered.reason,null)
 assert.equal(altered.physical.at,180)
 for(let i=0;i<32;i++){
  const a=end.physical.states[i],b=altered.physical.states[i]
  assert(equal(a.x,b.x)&&equal(a.y,
   variation.mirror?4.4-b.y:b.y),
   'A78 phase2 local 32r mirror/rename physical trajectory '+i)
  assert(equal(a.energy.remainingWPrimeJoules,
   b.energy.remainingWPrimeJoules))
 }
}
const parity=[]
for(const n of [8,32,106,168]){
 for(const roadGeometry of ['staged_pinch','double_pinch']){
  for(const pacePolicy of ['joint_local_negotiation_v1',
   'joint_local_preemptive_v1']){
   const opts={...config,roadGeometry,pacePolicy}
   const base=runMultiGatePhysicalCandidateV3(
    createMultiGatePhysicalCandidateV3(n,opts),{seconds:12})
   const mirrored=runMultiGatePhysicalCandidateV3(
    createMultiGatePhysicalCandidateV3(n,{...opts,mirror:true}),
    {seconds:12})
   const renamed=runMultiGatePhysicalCandidateV3(
    createMultiGatePhysicalCandidateV3(n,{...opts,renamed:true}),
    {seconds:12})
   assert.equal(base.reason,mirrored.reason)
   assert.equal(base.reason,renamed.reason)
   assert.equal(base.physical.at,mirrored.physical.at)
   assert.equal(base.physical.at,renamed.physical.at)
   for(let i=0;i<n;i++){
    const a=base.physical.states[i],b=mirrored.physical.states[i],
     c=renamed.physical.states[i]
    assert(equal(a.x,b.x)&&equal(a.y+b.y,4.4),
     'A78 phase2 mirror violated '+n+'/'+i+'/'+pacePolicy)
    assert(equal(a.x,c.x)&&equal(a.y,c.y),
     'A78 phase2 rename violated '+n+'/'+i+'/'+pacePolicy)
   }
   parity.push({n,roadGeometry,pacePolicy,at:base.physical.at,
    reason:base.reason,mirror:true,rename:true})
  }
 }
}
const result={study:'A78_PHASE2_LOCAL_32_SPOTLIGHT_AND_PARITY',
 verifiedFull180s32R:true,route:'staged_pinch',
 threeSecondSustainedPairPasses:observed.confirmedSustainedPasses,
 rearX:metrics.rearX,laneChanges:metrics.laneChanges,
 noNearStops:true,collisionFree:true,roadSafe:true,
 exactSerializedPhysicsAndPassing90Plus90:true,
 full180sMirrorAndRenamedPhysicalParity:true,
 shortCaseParity:parity,officialWrites:0,
 largeFieldApproval:'NO_GO'}
const dir=process.env.V3_A2_STEP78_LOCAL_REPLAY_DIR??'/tmp/a78localreplay'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a78-phase2-local-full-32-physics-replay-parity.json',
 JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({study:result.study,passes:result.threeSecondSustainedPairPasses,
 rearX:result.rearX,lanes:result.laneChanges,
 exact90Plus90:true,parityCases:parity.length,
 largeFieldApproval:'NO_GO',officialWrites:0}))
