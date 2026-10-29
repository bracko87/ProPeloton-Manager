/** A82 expanded true original-physics and sporting checkpoint audit.
 * Short mirrored/renamed checks across all field sizes; full 8/32
 * field runs for the best 32r staged policy.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,
 runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {startSustainedOvertakeObserverV3,
 advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const eq=(a,b)=>Math.abs(a-b)<1e-5
const common={mode:'five_dense',headwayStandOffM:4.5,
 controllerPolicy:'coordinated_demand',
 coreMergePolicy:'preview_only'}
const parity=[]
for(const pacePolicy of ['feasible_window_v1','feasible_conservative_v1'])
 for(const n of [8,32,106,168])
 for(const roadGeometry of ['staged_pinch','double_pinch']){
  const opts={...common,pacePolicy,roadGeometry,
   rollingStartSpeedMps:n>=106?9:null}
  const normal=runMultiGatePhysicalCandidateV3(
   createMultiGatePhysicalCandidateV3(n,opts),{seconds:6})
  const mirror=runMultiGatePhysicalCandidateV3(
   createMultiGatePhysicalCandidateV3(n,{...opts,mirror:true}),{seconds:6})
  const rename=runMultiGatePhysicalCandidateV3(
   createMultiGatePhysicalCandidateV3(n,{...opts,renamed:true}),{seconds:6})
  const id=n+'/'+roadGeometry+'/'+pacePolicy
  assert.equal(normal.reason,mirror.reason,'A82 mirror status '+id)
  assert.equal(normal.reason,rename.reason,'A82 rename status '+id)
  assert.equal(normal.physical.at,mirror.physical.at,'A82 mirror clock '+id)
  assert.equal(normal.physical.at,rename.physical.at,'A82 rename clock '+id)
  assert.deepEqual(normal.step82SelectedPolicies,
   mirror.step82SelectedPolicies,'A82 reflected chosen physical proposal '+id)
  assert.deepEqual(normal.step82SelectedPolicies,
   rename.step82SelectedPolicies,'A82 renamed chosen proposal '+id)
  for(let k=0;k<n;k++){
   const a=normal.physical.states[k],b=mirror.physical.states[k],
    c=rename.physical.states[k]
   assert(eq(a.x,b.x)&&eq(a.y+b.y,4.4)&&eq(a.v,b.v),
    'A82 mirrored x/y/v '+id+'/'+k)
   assert(eq(a.x,c.x)&&eq(a.y,c.y)&&eq(a.v,c.v),
    'A82 relabeled x/y/v '+id+'/'+k)
   assert(eq(a.energy.remainingWPrimeJoules,
    b.energy.remainingWPrimeJoules),
    'A82 mirrored energy '+id+'/'+k)
  }
  parity.push({n,roadGeometry,pacePolicy,acceptedSeconds:normal.physical.at,
   reason:normal.reason,mirror:true,rename:true,realPhysics:true})
 }
function coupled(initial,seconds,observer=null){
 let current=structuredClone(initial)
 let passing=observer??
  startSustainedOvertakeObserverV3(current.physical.states)
 const stop=current.physical.at+seconds
 while(current.physical.at<stop-1e-8&&!current.reason){
  const next=advanceMultiGatePhysicalCandidateV3(current)
  if(!next.reason)passing=advanceSustainedOvertakeObserverV3(
   passing,current.physical.states,next.physical.states,.5)
  current=next
 }
 return {state:current,passing}
}
const pilots=[]
for(const n of [8,32])
 for(const roadGeometry of ['staged_pinch','double_pinch']){
  const opts={...common,roadGeometry,pacePolicy:'feasible_window_v1'}
  const start=createMultiGatePhysicalCandidateV3(n,opts)
  const full=coupled(start,180)
  const m=multiGatePhysicalMetricsV3(start,full.state)
  if(full.state.reason){
   assert.equal(full.state.status,'REJECTED')
   assert.equal(full.state.physical.reason,null)
   assert.throws(()=>advanceMultiGatePhysicalCandidateV3(full.state))
  }else assert.equal(full.state.physical.at,180)
  const passing=overtakeObserverSummaryV3(full.passing)
  let exactRecovery=null
  if(full.state.physical.at>=90){
   const half=coupled(start,90)
   const restored=coupled(
    JSON.parse(JSON.stringify(half.state)),90,
    JSON.parse(JSON.stringify(half.passing)))
   assert.deepEqual(restored,full,
    'A82 exact 90+90 physical+passing replay '+n+'/'+roadGeometry)
   exactRecovery=true
  }
  pilots.push({n,roadGeometry,
   acceptedSeconds:full.state.physical.at,
   reason:full.state.reason??'FULL_180',
   rearX:m.rearX,
   nearStopRiderTicks:m.nearStops,
   completedPhysicalLaneChanges:m.laneChanges,
   independentSustainedThreeSecondPairPasses:
    passing.confirmedSustainedPasses,
   fullPhysicalFinish:full.state.reason===null&&
    m.allPastSecondReopening&&m.nearStops===0,
   firstRejectedPair:m.firstCollision?.pair??null,
   firstRoadExit:m.firstRoadViolation?.riderId??null,
   exactSerialized90Plus90PhysicsObserver:exactRecovery})
 }
const output={study:'A82_TRUE_PHYSICAL_MIRROR_AND_FULL_SMALL_FIELDS',
 parityCases:parity.length,parity,pilots,
 sportingApproval:'NO_GO_UNTIL_LARGE_180_AND_WEAVING_PASS',
 originalA64FullBicyclePhysicalAuthority:true,
 originalRejectionsRetained:true,officialWrites:0}
const dir=process.env.V3_A2_STEP82_LONG_DIR??'/tmp/a82long'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a82-true-mirror-32-full-and-energy-replay.json',
 JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({study:output.study,parityCases:parity.length,
 pilots,officialWrites:0}))
