/** A79 risk-aware distributed prospective field fairness/recovery.
 * Verified physical motion; honest acceptance time for rejected fields.
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
const trials=[]
const defaultArgs={mode:'five_dense',headwayStandOffM:4.5,
 controllerPolicy:'coordinated_demand',
 pacePolicy:'distributed_risk_v1',coreMergePolicy:'preview_only'}
for(const n of [8,32,106,168]){
 for(const roadGeometry of ['staged_pinch','double_pinch']){
  const opts={...defaultArgs,roadGeometry}
  const normal=runMultiGatePhysicalCandidateV3(
   createMultiGatePhysicalCandidateV3(n,opts),{seconds:12})
  const reflected=runMultiGatePhysicalCandidateV3(
   createMultiGatePhysicalCandidateV3(n,{...opts,mirror:true}),
   {seconds:12})
  const relabeled=runMultiGatePhysicalCandidateV3(
   createMultiGatePhysicalCandidateV3(n,{...opts,renamed:true}),
   {seconds:12})
  assert.equal(normal.reason,reflected.reason,
   'A79 mirror changed failure status '+n+'/'+roadGeometry)
  assert.equal(normal.reason,relabeled.reason,
   'A79 rider name changed failure status '+n+'/'+roadGeometry)
  assert.equal(normal.physical.at,reflected.physical.at)
  assert.equal(normal.physical.at,relabeled.physical.at)
  assert.deepEqual(normal.distributedPolicyTicks,
   reflected.distributedPolicyTicks)
  assert.deepEqual(normal.distributedPolicyTicks,
   relabeled.distributedPolicyTicks)
  for(let i=0;i<n;i++){
   const a=normal.physical.states[i],b=reflected.physical.states[i],
    c=relabeled.physical.states[i]
   assert(eq(a.x,b.x)&&eq(a.y+b.y,4.4)&&eq(a.v,b.v),
    'A79 mirror physical x/y/v diverged '+n+'/'+roadGeometry+'/'+i)
   assert(eq(a.x,c.x)&&eq(a.y,c.y)&&eq(a.v,c.v),
    'A79 rider identity physical x/y/v diverged '+n+'/'+roadGeometry+'/'+i)
   assert(eq(a.energy.remainingWPrimeJoules,
    b.energy.remainingWPrimeJoules))
  }
  if(normal.reason){
   assert.equal(normal.physical.reason,null)
   assert.throws(()=>advanceMultiGatePhysicalCandidateV3(normal),
    'A79 proceeded after authoritative collision rejection')
  }
  trials.push({n,roadGeometry,acceptedSeconds:normal.physical.at,
   reason:normal.reason,physicalMirrorParity:true,
   riderRenameParity:true,selectedProposalsIdentical:true,
   originalSweptAuthority:true})
 }
}
function coupled(state,seconds,observer=null){
 let current=structuredClone(state)
 let o=observer??startSustainedOvertakeObserverV3(current.physical.states)
 const target=current.physical.at+seconds
 while(current.physical.at<target-1e-8&&!current.reason){
  const next=advanceMultiGatePhysicalCandidateV3(current)
  if(!next.reason)o=advanceSustainedOvertakeObserverV3(
   o,current.physical.states,next.physical.states,.5)
  current=next
 }
 return {state:current,observer:o}
}
const longRuns=[]
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const start=createMultiGatePhysicalCandidateV3(8,{
  ...defaultArgs,roadGeometry})
 const whole=coupled(start,180)
 const half=coupled(start,90)
 const restored=coupled(
  JSON.parse(JSON.stringify(half.state)),90,
  JSON.parse(JSON.stringify(half.observer)))
 assert.deepEqual(restored,whole,
  'A79 risk-aware accepted physics + independent observer replay mismatch')
 const m=multiGatePhysicalMetricsV3(start,whole.state),
  passing=overtakeObserverSummaryV3(whole.observer)
 assert.equal(whole.state.reason,null)
 assert.equal(whole.state.physical.at,180)
 assert.equal(m.nearStops,0)
 assert.equal(m.allPastSecondReopening,true)
 assert.equal(passing.durationSeconds,180)
 longRuns.push({n:8,roadGeometry,full180s:true,
  independentConfirmedThreeSecondOvertakes:
   passing.confirmedSustainedPasses,
  completedPhysicalLanes:m.laneChanges,
  nearStops:m.nearStops,rearX:m.rearX,
  exact90Plus90PhysicsAndObserverReplay:true})
}
const report={study:'A79_DISTRIBUTED_RISK_PARITY_REPLAY',
 technicalGate:'PASS_IF_ALL_ASSERTIONS_HOLD',trials,longRuns,
 sportingApproval:'NOT_APPROVED_FOR_106_OR_168',
 noLiveWrites:true,officialWrites:0}
const dir=process.env.V3_A2_STEP79_PARITY_DIR??'/tmp/a79-parity'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a79-distributed-fairness-replay.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
