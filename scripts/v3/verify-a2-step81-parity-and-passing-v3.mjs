/** Step81 true physical reflection/identity and sporting replay audit.
 * Technical PASS never promotes rejected five-column races to sporting PASS.
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
 controllerPolicy:'coordinated_demand',coreMergePolicy:'preview_only'}
const parity=[]
for(const pacePolicy of ['multisecond_reserve_v1','multisecond_zipper_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const opts={...common,pacePolicy,roadGeometry,
  rollingStartSpeedMps:n>=106?9:null}
 const regular=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,opts),{seconds:6})
 const reflected=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...opts,mirror:true}),
  {seconds:6})
 const renamed=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...opts,renamed:true}),
  {seconds:6})
 const tag=n+'/'+roadGeometry+'/'+pacePolicy
 assert.equal(regular.reason,reflected.reason,
  'A81 mirror changed physical collision status '+tag)
 assert.equal(regular.reason,renamed.reason,
  'A81 rename changed physical collision status '+tag)
 assert.equal(regular.physical.at,reflected.physical.at)
 assert.equal(regular.physical.at,renamed.physical.at)
 assert.deepEqual(regular.multisecondPolicyTicks,
  reflected.multisecondPolicyTicks,
  'A81 mirror changed provisional full-field proposal '+tag)
 assert.deepEqual(regular.multisecondPolicyTicks,
  renamed.multisecondPolicyTicks,
  'A81 rider ID changed proposed full-field option '+tag)
 for(let i=0;i<n;i++){
  const a=regular.physical.states[i],
   b=reflected.physical.states[i],c=renamed.physical.states[i]
  assert(eq(a.x,b.x)&&eq(a.y+b.y,4.4)&&eq(a.v,b.v),
   'A81 mirrored physically achieved bicycle path '+tag+'/'+i)
  assert(eq(a.x,c.x)&&eq(a.y,c.y)&&eq(a.v,c.v),
   'A81 changed actual rider movement after name shuffle '+tag+'/'+i)
  assert(eq(a.energy.remainingWPrimeJoules,
   b.energy.remainingWPrimeJoules))
 }
 parity.push({n,roadGeometry,pacePolicy,
  acceptedSeconds:regular.physical.at,reason:regular.reason,
  mirrorPass:true,renamedPass:true})
}
function simulate(initial,seconds,observer=null){
 let current=structuredClone(initial);
 let obs=observer??startSustainedOvertakeObserverV3(current.physical.states)
 const until=current.physical.at+seconds
 while(current.physical.at<until-1e-8&&!current.reason){
  const next=advanceMultiGatePhysicalCandidateV3(current)
  if(!next.reason)obs=advanceSustainedOvertakeObserverV3(obs,
   current.physical.states,next.physical.states,.5)
  current=next
 }
 return {state:current,observer:obs}
}
const long=[]
for(const pacePolicy of ['multisecond_reserve_v1','multisecond_zipper_v1'])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const initial=createMultiGatePhysicalCandidateV3(8,{
  ...common,pacePolicy,roadGeometry})
 const whole=simulate(initial,180)
 const m=multiGatePhysicalMetricsV3(initial,whole.state)
 if(whole.state.reason){
  assert.equal(whole.state.status,'REJECTED')
  assert.equal(whole.state.physical.reason,null)
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(whole.state))
 }else assert.equal(whole.state.physical.at,180)
 let exactReplay=false
 if(whole.state.physical.at>=90){
  const half=simulate(initial,90)
  const resumed=simulate(
   JSON.parse(JSON.stringify(half.state)),90,
   JSON.parse(JSON.stringify(half.observer)))
  assert.deepEqual(resumed,whole,
   'A81 90+90 serialized physics and independent overtake replay '+pacePolicy+'/'+roadGeometry)
  exactReplay=true
 }
 const passing=overtakeObserverSummaryV3(whole.observer)
 long.push({n:8,pacePolicy,roadGeometry,
  acceptedSeconds:whole.state.physical.at,
  reason:whole.state.reason??'FULL_180',
  allPastSecondReopening:m.allPastSecondReopening,
  nearStopRiderTicks:m.nearStops,laneChanges:m.laneChanges,
  realConfirmedThreeSecondPairOvertakes:passing.confirmedSustainedPasses,
  exact90Plus90PhysicsAndObserverReplay:exactReplay,
  firstRejectedPair:m.firstCollision?.pair??null,
  fullSportingPass:!whole.state.reason&&
   m.allPastSecondReopening&&m.nearStops===0})
}
const report={study:'A81_TRUE_PHYSICAL_PARITY_AND_8R_LONG_REPLAY',
 parityChecks:parity.length,parity,long,
 sportingGate:'NO_GO_FOR_106_168_FIVE_ABREAST',
 allRejectedMovementsUncommitted:true,officialWrites:0}
const dir=process.env.V3_A2_STEP81_PARITY_DIR??'/tmp/a81parity'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a81-8r-long-true-physical-and-parity.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
