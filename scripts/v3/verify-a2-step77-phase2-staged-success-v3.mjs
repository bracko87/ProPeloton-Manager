/** Step77 Phase2: 32-rider body-valid FIVE-abreast real physical passage
 * through 3.3m then 2.2m; independently tracked true 3-second overtakes.
 * Includes mirrored IDs, exact paired JSON checkpoint, larger-field probes.
 * All calculations isolated from any live/production race.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {startSustainedOvertakeObserverV3,
 advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const config={mode:'five_dense',roadGeometry:'staged_pinch',
 controllerPolicy:'coordinated_demand',headwayStandOffM:4.5,
 pacePolicy:'timed_safe_corridor'}
const eq=(a,b)=>Math.abs(a-b)<=1e-5
function simulateCoupled(initial,seconds,saved=null){
 let current=saved?.physical??structuredClone(initial)
 let observer=saved?.observer??startSustainedOvertakeObserverV3(
  current.physical.states)
 const until=current.physical.at+seconds
 while(current.physical.at<until-1e-7&&!current.reason){
  const next=advanceMultiGatePhysicalCandidateV3(current)
  if(!next.reason)observer=advanceSustainedOvertakeObserverV3(observer,
   current.physical.states,next.physical.states,.5)
  current=next
 }
 return {physical:current,observer}
}
const initial=createMultiGatePhysicalCandidateV3(32,config)
assert.equal(initial.admission.bookedCount,64)
const whole=simulateCoupled(initial,180)
const metrics=multiGatePhysicalMetricsV3(initial,whole.physical)
const passes=overtakeObserverSummaryV3(whole.observer)
assert.equal(whole.physical.reason,null,
 'A77 32r five-abreast staged two-gate physical pilot regressed')
assert.equal(whole.physical.physical.at,180)
assert(whole.physical.physical.states.every(s=>s.x>1470&&
 s.energy.remainingWPrimeJoules>=0&&s.v>=0&&
 eq(s.energy.seconds,180)),'A77 32r did not physically exit second gate')
assert.equal(metrics.nearStops,0,
 'A77 32r artificially stalled while negotiating five-to-two')
assert(metrics.laneChanges>=300,
 'A77 32r realistic bounded lane changes suppressed')
assert.equal(passes.durationSeconds,180)
assert(passes.confirmedSustainedPasses>=80,
 'A77 32r staged body-valid start lost >=80 genuine sustained passes')
const half=simulateCoupled(initial,90)
const restored=simulateCoupled(initial,90,{
 physical:JSON.parse(JSON.stringify(half.physical)),
 observer:JSON.parse(JSON.stringify(half.observer))
})
assert.deepEqual(restored,whole,
 'A77 90+90 persisted coupled physical and independent passing diverged')
for(const variation of [{mirror:true},{renamed:true}]){
 const variant=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(32,{...config,...variation}),
  {seconds:180})
 assert.equal(variant.reason,null)
 assert.equal(variant.physical.at,180)
 for(let i=0;i<32;i++){
  const a=whole.physical.physical.states[i],b=variant.physical.states[i]
  assert(eq(a.x,b.x)&&eq(a.y,variation.mirror?4.4-b.y:b.y),
   'A77 five-abreast mirror or renamed physical trajectory '+i)
  assert(eq(a.energy.remainingWPrimeJoules,
   b.energy.remainingWPrimeJoules))
 }
}
const stress=[]
for(const n of [106,168])for(const geometry of ['staged_pinch','double_pinch']){
 for(const pacePolicy of ['timed_safe_corridor',
  ...(geometry==='double_pinch'?['timed_speed_only']:[])]){
  const i=createMultiGatePhysicalCandidateV3(n,{
   ...config,roadGeometry:geometry,pacePolicy})
  const result=runMultiGatePhysicalCandidateV3(i,{seconds:180})
  const m=multiGatePhysicalMetricsV3(i,result)
  assert(['SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
   'ENERGY_FAILED','GATE_ENTRY_NO_WINDOW',null].includes(result.reason))
  assert(result.physical.at<=180)
  assert(result.physical.states.every(s=>s.v>=0&&
   s.energy.remainingWPrimeJoules>=0&&eq(s.energy.seconds,
   result.physical.at)))
  if(result.reason){
   assert.throws(()=>advanceMultiGatePhysicalCandidateV3(result))
  }else assert.equal(result.physical.at,180)
  stress.push({n,geometry,pacePolicy,
   acceptedSeconds:m.acceptedSeconds,status:m.status,
   rearX:m.rearX,nearStopTicks:m.nearStops,laneChanges:m.laneChanges,
   collision:m.firstCollision?.pair??null,
   roadViolation:m.firstRoadViolation?.riderId??null,
   allPastSecondReopening:m.allPastSecondReopening,
   fullStageNotProven:true})
 }
}
const report={study:'A2_STEP77_PHASE2_32_STAGED_FIVE_ABREAST_PHYSICAL_PASSING',
 technicalGate:'PASS_32_PHYSICAL_AND_REPLAY',
 sportingGate:'NO_GO',
 fieldSize:32,initialColumns:5,initialFullBikeWidthValid:true,
 firstNarrowingWidthM:3.3,secondNarrowingWidthM:2.2,
 acceptedSeconds:180,all32PastSecondReopening:true,
 physicalLaneChanges:metrics.laneChanges,
 rearX:metrics.rearX,nearStopTicks:metrics.nearStops,
 independentlyConfirmed3sPasses:passes.confirmedSustainedPasses,
 replay90Plus90ExactPhysicsAndObserverRecovery:true,
 mirrorAndRenamePhysicalParity:true,
 stress,officialWrites:0,unmodifiedOlderV3Solver:true}
const dir=process.env.V3_A2_STEP77_STAGED_DIR??'/tmp/a2-step77staged'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-phase2-32-staged-peloton-and-large-field.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,physicalGate:report.technicalGate,
 acceptedSeconds:180,lanes:metrics.laneChanges,rearX:metrics.rearX,
 trueSustained3sOvertakes:passes.confirmedSustainedPasses,
 exact90Plus90Replay:true,mirrorRenameParity:true,stress,
 sportingGate:'NO_GO',officialWrites:0}))
