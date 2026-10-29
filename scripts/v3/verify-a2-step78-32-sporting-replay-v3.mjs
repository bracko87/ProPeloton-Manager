/** A78 completed 32r *real physical* staged-road proof.
 * Independently track 3-second sustained overtakes and exact checkpoint;
 * full 106/168 sporting approval remains a separate explicit NO-GO.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {startSustainedOvertakeObserverV3,
 advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const params={mode:'five_dense',roadGeometry:'staged_pinch',
 pacePolicy:'joint_prospective_v1',
 controllerPolicy:'coordinated_demand',headwayStandOffM:4.5,
 coreMergePolicy:'preview_only'}
const initial=createMultiGatePhysicalCandidateV3(32,params)
function simulate(snapshot,seconds,observer=null){
 let s=structuredClone(snapshot)
 let o=observer??startSustainedOvertakeObserverV3(s.physical.states)
 const until=s.physical.at+seconds
 while(s.physical.at<until-1e-8&&!s.reason){
  const next=advanceMultiGatePhysicalCandidateV3(s)
  if(!next.reason)o=advanceSustainedOvertakeObserverV3(
   o,s.physical.states,next.physical.states,.5)
  s=next
 }
 return {physical:s,observer:o}
}
const whole=simulate(initial,180)
const m=multiGatePhysicalMetricsV3(initial,whole.physical)
const passes=overtakeObserverSummaryV3(whole.observer)
assert.equal(whole.physical.reason,null)
assert.equal(whole.physical.physical.at,180)
assert.equal(m.allPastSecondReopening,true)
assert.equal(m.nearStops,0)
assert.equal(m.firstCollision,null)
assert.equal(m.firstRoadViolation,null)
assert.equal(passes.durationSeconds,180)
assert(whole.physical.prospectiveJointTicks>0)
assert(whole.physical.prospectiveBaselineTicks>0)
assert(whole.physical.physical.states.every(s=>
 s.v>=0&&s.energy.remainingWPrimeJoules>=0&&
 Math.abs(s.energy.seconds-180)<1e-5))
const half=simulate(initial,90)
const resumed=simulate(
 JSON.parse(JSON.stringify(half.physical)),90,
 JSON.parse(JSON.stringify(half.observer)))
assert.deepEqual(resumed,whole,'A78 physical and overtake observer checkpoint differs')
for(const variation of [{mirror:true},{renamed:true}]){
 const mirrorInit=createMultiGatePhysicalCandidateV3(32,{
  ...params,...variation})
 const sample=runMultiGatePhysicalCandidateV3(mirrorInit,{seconds:180})
 assert.equal(sample.reason,null)
 assert.equal(sample.physical.at,180)
 assert.equal(sample.prospectiveJointTicks,whole.physical.prospectiveJointTicks)
 for(let i=0;i<32;i++){
  const a=whole.physical.physical.states[i],b=sample.physical.states[i]
  assert(Math.abs(a.x-b.x)<1e-5&&
   Math.abs(a.y-(variation.mirror?4.4-b.y:b.y))<1e-5,
   'A78 full physical mirror or relabeling parity failed')
  assert(Math.abs(a.energy.remainingWPrimeJoules-
   b.energy.remainingWPrimeJoules)<1e-5)
 }
}
const report={study:'A78_FIVE_ABREAST_32R_PROSPECTIVE_REAL_PASSING',
 verified32R:true,n:32,startingColumns:5,route:'staged_pinch',
 acceptedSeconds:180,rearX:m.rearX,nearStops:m.nearStops,
 physicalLaneChanges:m.laneChanges,
 independentlyConfirmedThreeSecondPairPasses:passes.confirmedSustainedPasses,
 baselineCandidateTicks:whole.physical.prospectiveBaselineTicks,
 jointCandidateTicks:whole.physical.prospectiveJointTicks,
 exact90Plus90ObserverPhysicsReplay:true,
 mirroredAndRenamedPhysicalParity:true,
 allPastSecondOpening:true,noSweptCollision:true,noRoadExit:true,
 fullStageSportingGate:'NO_GO',officialWrites:0}
const dir=process.env.V3_A2_STEP78_32_DIR??'/tmp/a78-32'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a78-32-five-abreast-coupled-sustained-passes.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
