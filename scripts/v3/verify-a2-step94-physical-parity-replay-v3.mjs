/** Step94 full-field physical fairness and 8/32 full-race sporting audit.
 * Rejects are truthful and accepted states never rewritten.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {startSustainedOvertakeObserverV3,
 advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const base={mode:'five_dense',headwayStandOffM:4.5,
 controllerPolicy:'coordinated_demand',coreMergePolicy:'preview_only'}
const parity=[]
for(const pacePolicy of ['closure_strict_v1','closure_balanced_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const opts={...base,pacePolicy,roadGeometry,
  rollingStartSpeedMps:n>=106?9:null}
 const original=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,opts),{seconds:7})
 const flipped=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...opts,mirror:true}),
  {seconds:7})
 const renamed=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...opts,renamed:true}),
  {seconds:7})
 const tag=n+'/'+roadGeometry+'/'+pacePolicy
 assert.equal(original.reason,flipped.reason,'A94 mirrored contact '+tag)
 assert.equal(original.reason,renamed.reason,'A94 identity contact '+tag)
 assert.equal(original.physical.at,flipped.physical.at)
 assert.equal(original.physical.at,renamed.physical.at)
 assert.deepEqual(original.step94SelectedPolicies,
  flipped.step94SelectedPolicies,'A94 mirror chosen physical request '+tag)
 assert.deepEqual(original.step94SelectedPolicies,
  renamed.step94SelectedPolicies,'A94 name chosen physical request '+tag)
 for(let i=0;i<n;i++){
  const a=original.physical.states[i],
   b=flipped.physical.states[i],c=renamed.physical.states[i]
  assert(eq(a.x,b.x)&&eq(a.y+b.y,4.4)&&eq(a.v,b.v),
   'A94 actual reflected bicycle x/y/v diverged '+tag+'/'+i)
  assert(eq(a.x,c.x)&&eq(a.y,c.y)&&eq(a.v,c.v),
   'A94 name-dependent bicycle motion '+tag+'/'+i)
  assert(eq(a.energy.remainingWPrimeJoules,
   b.energy.remainingWPrimeJoules))
 }
 parity.push({n,roadGeometry,pacePolicy,
  acceptedSeconds:original.physical.at,reason:original.reason,
  mirroredPhysical:true,renamedPhysical:true})
}
function coupled(start,seconds,observer=null){
 let current=structuredClone(start)
 let obs=observer??startSustainedOvertakeObserverV3(
  current.physical.states)
 const finish=current.physical.at+seconds
 while(current.physical.at<finish-1e-8&&!current.reason){
  const next=advanceMultiGatePhysicalCandidateV3(current)
  if(!next.reason)obs=advanceSustainedOvertakeObserverV3(
   obs,current.physical.states,next.physical.states,.5)
  current=next
 }
 return {state:current,observer:obs}
}
const long=[]
for(const n of [8,32])
for(const roadGeometry of ['staged_pinch','double_pinch'])
for(const pacePolicy of (n===8?['closure_strict_v1']:
 ['closure_strict_v1','closure_balanced_v1'])){
 const opts={...base,pacePolicy,roadGeometry}
 const start=createMultiGatePhysicalCandidateV3(n,opts)
 const saved=JSON.stringify(start)
 const full=coupled(start,180)
 assert.equal(JSON.stringify(start),saved)
 const m=multiGatePhysicalMetricsV3(start,full.state)
 const pass=overtakeObserverSummaryV3(full.observer)
 if(full.state.reason){
  assert.equal(full.state.physical.reason,null)
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(full.state))
 }else assert.equal(full.state.physical.at,180)
 let exact=null
 if(full.state.physical.at>=90){
  const half=coupled(start,90)
  const restored=coupled(
   JSON.parse(JSON.stringify(half.state)),90,
   JSON.parse(JSON.stringify(half.observer)))
  assert.deepEqual(restored,full,
   'A94 90+90 full physics and independent observer mismatch '+n+'/'+roadGeometry)
  exact=true
 }
 long.push({n,roadGeometry,pacePolicy,
  physicalAcceptedSeconds:full.state.physical.at,
  reason:full.state.reason??'FULL_180',
  nearStopRiderTicks:m.nearStops,
  physicalLaneChanges:m.laneChanges,
  sustainedThreeSecondPairOvertakes:pass.confirmedSustainedPasses,
  rearX:m.rearX,allPastSecondGate:m.allPastSecondReopening,
  firstCollision:m.firstCollision?.pair??null,
  firstRoadExit:m.firstRoadViolation?.riderId??null,
  exact90Plus90PhysicalAndObserverCheckpoint:exact,
  cleanSportingCompletion:!full.state.reason&&
   m.allPastSecondReopening&&m.nearStops===0})
}
const report={study:'A94_TRUE_FULL_FIELD_MIRROR_AND_LONG_8_32_SPORTING',
 parityChecks:parity.length,parity,long,
 sportingApproval:'NO_GO_FOR_106_168_UNTIL_FULL_180',
 physicalSolverUnchanged:true,officialWrites:0}
const dir=process.env.V3_A2_STEP94_PARITY_DIR??'/tmp/a94parity'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a94-physical-mirror-8-32-full-and-observer.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,parityChecks:parity.length,
 long,officialWrites:0}))
