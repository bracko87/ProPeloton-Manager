/** A67 independent completed-overtake observer tests and dynamic 106/168
 * 2D peloton admission screens. Offline / no official player or race data.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3,finishNormalStartMetricsV3}
 from './a2NormalStartPelotonV3.mjs'
import {startSustainedOvertakeObserverV3,advanceSustainedOvertakeObserverV3,
 overtakeObserverSummaryV3} from './a2SustainedOvertakeObserverV3.mjs'
const close=(x,y)=>Math.abs(x-y)<1e-5
const replay=(start,seconds,checkpoint=null)=>{
 let field=checkpoint?.field??structuredClone(start)
 let observer=checkpoint?.observer??startSustainedOvertakeObserverV3(field.states)
 const end=field.at+seconds
 assert(Number.isInteger(seconds*2)&&seconds>0&&seconds<=120)
 while(field.at<end-1e-7&&!field.reason){
  const moved=advanceNormalStartV3(field)
  if(moved.reason){field=moved;break}
  observer=advanceSustainedOvertakeObserverV3(observer,field.states,moved.states,.5)
  field=moved
 }
 return {field,observer}
}
// Synthetic detector controls: signed crossing with enough lateral space
// and sustained forward margin is not the same as endpoint ordering.
const simple=(dy=1.1)=>[{id:'rear',x:0,y:dy},{id:'lead',x:5,y:0}]
const advancePair=(current,dt=.5)=>{
 const next=current.map(s=>({...s,x:s.x+(s.id==='rear'?9.5:8.2)*dt}))
 return next
}
{
 const first=simple(),p0=startSustainedOvertakeObserverV3(first)
 let p=p0,states=first
 for(let i=0;i<20;i++){
  const next=advancePair(states)
  p=advanceSustainedOvertakeObserverV3(p,states,next,.5)
  states=next
 }
 const result=overtakeObserverSummaryV3(p)
 assert.equal(result.confirmedSustainedPasses,1)
 assert.equal(result.rejectedLateralCrossings,0)
 assert(result.verifiedCrossingSamples[0].crossingLateralM>=.8)
 assert(result.verifiedCrossingSamples[0].confirmedSeconds-
  result.verifiedCrossingSamples[0].establishedSeconds>=3)
 const restored=JSON.parse(JSON.stringify(p))
 assert.deepEqual(overtakeObserverSummaryV3(restored),result)
 let q=startSustainedOvertakeObserverV3(simple(0)),same=simple(0)
 for(let i=0;i<20;i++){
  const next=advancePair(same)
  q=advanceSustainedOvertakeObserverV3(q,same,next,.5);same=next
 }
 assert.equal(q.confirmedCount,0,'A67 counted unsafe same-lane cross')
 assert.equal(q.rejectedLateralCrossings,1,'A67 failed to reject cross')
 const nameSwap=simple().map(s=>({...s,id:s.id==='rear'?'z9':'z1'}))
 let nr=startSustainedOvertakeObserverV3(nameSwap),ns=nameSwap
 for(let i=0;i<20;i++){
  const next=ns.map(s=>({...s,x:s.x+(s.id==='z9'?9.5:8.2)*.5}))
  nr=advanceSustainedOvertakeObserverV3(nr,ns,next,.5);ns=next
 }
 assert.equal(nr.confirmedCount,1,'A67 rider ID influenced safety pass')
}
const cases=[]
function run(n,mode,seconds,{mirror=false,renamed=false}={}){
 const source=createNormalStartV3(n,{mode,mirror,renamed,
  controllerPolicy:'coordinated_demand',headwayStandOffM:3.2})
 const result=replay(source,seconds)
 const scalar=finishNormalStartMetricsV3(source,result.field)
 const overtake=overtakeObserverSummaryV3(result.observer)
 assert(close(scalar.seconds,overtake.durationSeconds),
  'A67 overtake clock differs from accepted physical clock')
 assert(overtake.confirmedSustainedPasses<=overtake.establishedClearance)
 assert(!result.field.reason||result.field.reason==='SWEPT_CONTACT'||
  result.field.reason==='ENERGY_FAILED')
 assert(result.field.states.every(s=>s.energy.remainingWPrimeJoules>=0))
 assert.equal(overtake.officialWrites,0)
 const data={n,mode,seconds,mirror,renamed,physical:scalar,overtake}
 cases.push(data)
 return {start:source,...result,scalar,overtake}
}
// Well-spaced outer corridors vs fully filled starts expose whether the
// 106/168 grid simply prevents physical lateral access.
const control=run(32,'corridor',90)
assert.equal(control.scalar.status,'FULL_HORIZON_CLEAR','A67 damaged 32-rider corridor')
assert(control.scalar.completedLaneChanges>=22,
 'A67 damaged Step66 32-rider lane completion reference')
const initial=control.start
const firstHalf=replay(initial,45)
const resumed=replay(initial,45,{
 field:JSON.parse(JSON.stringify(firstHalf.field)),
 observer:JSON.parse(JSON.stringify(firstHalf.observer))})
assert.deepEqual(resumed.field,control.field,'A67 physical restart mismatch')
assert.deepEqual(resumed.observer,control.observer,'A67 overtaking checkpoint mismatch')
for(const variant of [{mirror:true},{renamed:true}]){
 const other=run(32,'corridor',90,variant)
 assert.equal(other.scalar.status,control.scalar.status)
 assert.equal(other.overtake.confirmedSustainedPasses,
  control.overtake.confirmedSustainedPasses,
  'A67 mirrored/renamed crossing tally differs')
 assert.equal(other.overtake.attemptedCrossings,control.overtake.attemptedCrossings)
 assert.equal(other.overtake.establishedClearance,control.overtake.establishedClearance)
 for(let i=0;i<32;i++){
  const a=control.field.states[i],b=other.field.states[i]
  assert(close(a.x,b.x),'A67 changed progress with reflection or ID')
  assert(close(a.y,variant.mirror?4.4-b.y:b.y),'A67 changed road-relative side')
 }
}
for(const mode of ['mixed','pressure'])
 run(32,mode,90)
for(const n of [106,168]){
 const mixed=run(n,'mixed',30)
 const corridor=run(n,'corridor',30)
 assert.equal(corridor.scalar.status,'FULL_HORIZON_CLEAR',
  'A67 normal-start interactive open corridor swept safety regressed')
 assert(corridor.scalar.completedLaneChanges>0,
  'A67 large peloton has open road but no physically completed lane changes')
 assert(corridor.overtake.confirmedSustainedPasses>0,
  'A67 no sustained position/clearance overtake in open corridor')
 assert(corridor.overtake.confirmedSustainedPasses>
  mixed.overtake.confirmedSustainedPasses,
  'A67 available road corridors did not improve verified passing')
 // 60s is a diagnostic increase over the previously validated 30s window.
 // Failure is retained as a result; never mark sporting approval from a
 // no-contact snapshot, synthetic stage grid, or pair-order inversion alone.
 const longer=run(n,'corridor',60)
 if(longer.scalar.status==='FULL_HORIZON_CLEAR'){
  const halfway=replay(longer.start,30)
  const restored=replay(longer.start,30,{
   field:JSON.parse(JSON.stringify(halfway.field)),
   observer:JSON.parse(JSON.stringify(halfway.observer))})
  assert.deepEqual(restored.field,longer.field,'A67 large 30+30 physics recovery')
  assert.deepEqual(restored.observer,longer.observer,'A67 large 30+30 pass audit recovery')
 }
 // Both large fields must also be fair under left/right reflection and
 // bijectively renamed riders, measured on the nontrivial 30s corridor.
 for(const variant of [{mirror:true},{renamed:true}]){
  const t=run(n,'corridor',30,variant)
  assert.equal(t.scalar.status,corridor.scalar.status)
  assert.equal(t.overtake.confirmedSustainedPasses,
   corridor.overtake.confirmedSustainedPasses,
   'A67 large crossed-pair count depends on reflection/renaming')
  assert.equal(t.overtake.attemptedCrossings,
   corridor.overtake.attemptedCrossings)
  for(let i=0;i<n;i++){
   const a=corridor.field.states[i],b=t.field.states[i]
   assert(close(a.x,b.x)&&close(a.y,variant.mirror?4.4-b.y:b.y),
    'A67 large full-field geometry changes with reflection/ID')
  }
 }
}
const compact=cases.filter(c=>!c.mirror&&!c.renamed)
const report={study:'A2_STEP67_SUSTAINED_OVERTAKES_AND_LARGE_CORRIDORS',
 technicalGate:'PASS',sportingGate:'NO_GO',
 observerDoesNotAffectMotion:true,checkpointExact:true,
 lateralCrossingVerified:true,requiredContinuousLeadSeconds:3,
 startEndPairReversalsNotCalledPasses:true,
 physicallyInvalidSameLaneCrossRejected:true,
 reflectionAndRiderIdParity:true,
 provisionalFiveLaneSyntheticRoad:true,
 comparisons:compact.map(c=>({
  n:c.n,mode:c.mode,targetSeconds:c.seconds,
  completedSeconds:c.physical.seconds,
  status:c.physical.status,
  sweptCollision:c.physical.firstCollision,
  completedLaneChanges:c.physical.completedLaneChanges,
  endpointPairOrderReversals:c.physical.uniquePairOrderReversals,
  sustainedPhysicalPasses:c.overtake.confirmedSustainedPasses,
  crossings:c.overtake.attemptedCrossings,
  crossingsRejectedByLateralDistance:c.overtake.rejectedLateralCrossings,
  pendingOvertakes:c.overtake.pendingOrAbandonedPasses,
  nearStopRiderTicks:c.physical.nearStopRiderTicks,
  firstConfirmed:c.overtake.verifiedCrossingSamples.slice(0,5)
 })),
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP67_DIR??'/tmp/a2-step67'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step67-physical-overtakes.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
