/** Step80 long-horizon continuation and causal fairness evidence.
 * A completed technical test records rejected sports cases honestly.
 * The unchanged A64 bicycle solver has final authority on all ticks.
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
const main={mode:'five_dense',headwayStandOffM:4.5,
 controllerPolicy:'coordinated_demand',coreMergePolicy:'preview_only'}
const parity=[]
for(const pacePolicy of ['horizon2_guarded_v1','horizon3_guarded_v1']){
 for(const n of [8,32,106,168]){
  for(const roadGeometry of ['staged_pinch','double_pinch']){
   const opts={...main,n,pacePolicy,roadGeometry,
    rollingStartSpeedMps:n>=106?9:null}
   const regular=runMultiGatePhysicalCandidateV3(
    createMultiGatePhysicalCandidateV3(n,opts),{seconds:8})
   const reflected=runMultiGatePhysicalCandidateV3(
    createMultiGatePhysicalCandidateV3(n,{...opts,mirror:true}),
    {seconds:8})
   const renamed=runMultiGatePhysicalCandidateV3(
    createMultiGatePhysicalCandidateV3(n,{...opts,renamed:true}),
    {seconds:8})
   assert.equal(regular.reason,reflected.reason,
    'A80 reflected status diverged '+n+'/'+roadGeometry+'/'+pacePolicy)
   assert.equal(regular.reason,renamed.reason,
    'A80 rider renaming changed rejection '+n+'/'+roadGeometry+'/'+pacePolicy)
   assert.equal(regular.physical.at,reflected.physical.at)
   assert.equal(regular.physical.at,renamed.physical.at)
   assert.deepEqual(regular.horizonSelectedPolicies,
    reflected.horizonSelectedPolicies,
    'A80 mirrored selected different physical first actions')
   assert.deepEqual(regular.horizonSelectedPolicies,
    renamed.horizonSelectedPolicies,
    'A80 rider name changed selected physical first actions')
   for(let i=0;i<n;i++){
    const a=regular.physical.states[i],
     b=reflected.physical.states[i],
     c=renamed.physical.states[i]
    assert(eq(a.x,b.x)&&eq(a.y+b.y,4.4)&&eq(a.v,b.v),
     'A80 mirror physical path '+n+'/'+roadGeometry+'/'+pacePolicy+'/'+i)
    assert(eq(a.x,c.x)&&eq(a.y,c.y)&&eq(a.v,c.v),
     'A80 rename physical path '+n+'/'+roadGeometry+'/'+pacePolicy+'/'+i)
    assert(eq(a.energy.remainingWPrimeJoules,
     b.energy.remainingWPrimeJoules),
     'A80 mirrored W-prime diverged')
   }
   parity.push({n,roadGeometry,pacePolicy,at:regular.physical.at,
    reason:regular.reason,physicallyMirrored:true,
    renamedNeutral:true,selectedProposalParity:true})
  }
 }
}
function coupled(s,seconds,observer=null){
 let state=structuredClone(s),observed=observer??
  startSustainedOvertakeObserverV3(state.physical.states)
 const end=state.physical.at+seconds
 while(state.physical.at<end-1e-8&&!state.reason){
  const next=advanceMultiGatePhysicalCandidateV3(state)
  if(!next.reason)observed=advanceSustainedOvertakeObserverV3(
   observed,state.physical.states,next.physical.states,.5)
  state=next
 }
 return {state,observer:observed}
}
const completed8=[]
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const opts={...main,roadGeometry,pacePolicy:'horizon3_guarded_v1'}
 const initial=createMultiGatePhysicalCandidateV3(8,opts)
 const whole=coupled(initial,180),half=coupled(initial,90)
 assert.equal(whole.state.reason,null)
 assert.equal(whole.state.physical.at,180)
 const resumed=coupled(
  JSON.parse(JSON.stringify(half.state)),90,
  JSON.parse(JSON.stringify(half.observer)))
 assert.deepEqual(resumed,whole,
  'A80 serialized 90+90 physics and independent overtake observer mismatch')
 const m=multiGatePhysicalMetricsV3(initial,whole.state)
 const o=overtakeObserverSummaryV3(whole.observer)
 assert.equal(m.allPastSecondReopening,true)
 assert.equal(m.nearStops,0)
 assert.equal(m.firstCollision,null)
 assert.equal(m.firstRoadViolation,null)
 assert.equal(o.durationSeconds,180)
 completed8.push({n:8,roadGeometry,acceptedSeconds:180,
  allPastSecondOpening:true,nearStops:0,
  independentThreeSecondSustainedPasses:o.confirmedSustainedPasses,
  completedPhysicalLaneChanges:m.laneChanges,rearX:m.rearX,
  exactFullJsonPhysicsAndObserver90Plus90:true})
}
const longer32=[]
for(const [roadGeometry,pacePolicy] of [
 ['staged_pinch','horizon3_guarded_v1'],
 ['double_pinch','horizon2_guarded_v1']
]){
 const initial=createMultiGatePhysicalCandidateV3(32,{
  ...main,roadGeometry,pacePolicy})
 const result=runMultiGatePhysicalCandidateV3(initial,{seconds:180})
 const m=multiGatePhysicalMetricsV3(initial,result)
 assert.equal(result.officialWrites,0)
 assert(result.physical.at>=0&&result.physical.at<=180)
 if(result.reason){
  assert.equal(result.physical.reason,null)
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(result))
 }
 longer32.push({n:32,roadGeometry,pacePolicy,
  acceptedSeconds:result.physical.at,
  reason:result.reason??'COMPLETE_180',
  allPastSecondOpening:m.allPastSecondReopening,
  nearStops:m.nearStops,completedPhysicalLaneChanges:m.laneChanges,
  rearX:m.rearX,collision:m.firstCollision?.pair??null,
  roadViolation:m.firstRoadViolation?.riderId??null,
  sportingPass:!result.reason&&result.physical.at===180&&
   m.allPastSecondReopening&&m.nearStops===0})
}
const report={study:'A80_MIRROR_ID_JSON_REPLAY_AND_32_FULL_RACE',
 parityCases:parity.length,parity,completed8,longer32,
 unchangedSweptPhysicalAuthority:true,
 noRetrospectiveAcceptedStateRewrite:true,
 sportingApproval:'NO_GO_UNTIL_LARGE_FIELDS_PASS',officialWrites:0}
const dir=process.env.V3_A2_STEP80_LONG_DIR??'/tmp/v3-step80-long'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/step80-full-32-and-mirror-replay.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({
 study:report.study,parityCases:parity.length,
 completed8,longer32,officialWrites:0}))
