/** Step80 two/three-step receding horizon, strict actual physical pilot.
 * PASS means correct fail-closed outcomes, NOT 106/168 sporting readiness.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {chooseRecedingHorizonTickV3,
 step80ClearanceRiskV3} from './a2Step80RecedingHorizonV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'

const same=(a,b)=>Math.abs(a-b)<1e-5
const physical={at:0,acceptedSteps:0,nearStops:0,
 cumulativeAdvancement:0,states:[
  {id:'a',x:600,y:1.25,v:8.5},
  {id:'b',x:595,y:1.25,v:8.4}]}
const plans=[{policy:'shortsighted',
 requests:[{id:'a',speed:8.5,targetY:1},
  {id:'b',speed:8.4,targetY:1.25}]},
 {policy:'sustainable',
 requests:[{id:'a',speed:8.5,targetY:2.2},
  {id:'b',speed:8.4,targetY:1.25}]}]
const saved=JSON.stringify({physical,plans})
let probes=0
const fake=field=>{
 probes++
 if(field.at>.25&&field.states[0].targetY<1.5)
  return {...field,reason:'SWEPT_CONTACT',
   firstCollision:{pair:['a','b']}}
 return {...field,reason:null,at:field.at+.5,
  acceptedSteps:field.acceptedSteps+1,
  cumulativeAdvancement:field.cumulativeAdvancement+10}
}
const future=field=>[{policy:'continue',requests:field.states.map(s=>({
 id:s.id,speed:s.v,targetY:s.targetY
}))}]
const decision=chooseRecedingHorizonTickV3(physical,plans,future,
 fake,{depth:3,maxFirst:2,maxFuture:1})
assert.equal(decision.status,'PHYSICAL_FIRST_TICK_SELECTED')
assert.equal(decision.selectedPolicy,'sustainable',
 'A80 chose a near-future collision over physically feasible alternative')
assert.equal(decision.physicallySafeLookaheadTicks,3)
assert(probes>=5,'A80 did not physically check projected next ticks')
assert.equal(decision.noFutureStateCommitted,true)
assert.equal(JSON.stringify({physical,plans}),saved)
assert.equal(decision.officialWrites,0)
const denied=chooseRecedingHorizonTickV3(physical,plans,
 future,p=>({...p,reason:'SWEPT_CONTACT'}),{depth:2,maxFirst:2})
assert.equal(denied.status,'NO_SAFE_FIRST_TICK')
assert.equal(denied.firstPhysicalPreview,null)
assert.throws(()=>chooseRecedingHorizonTickV3(physical,plans,
 future,fake,{depth:4}))
const reflected=physical.states.map(s=>({...s,y:4.4-s.y,
 targetY:s.targetY===undefined?undefined:4.4-s.targetY}))
assert(same(step80ClearanceRiskV3(physical.states),
 step80ClearanceRiskV3(reflected)))
const trials=[]
for(const pacePolicy of ['horizon2_guarded_v1','horizon3_guarded_v1'])
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 // The full non-production race is run for small 8r pilots.
 // 32/106/168 can early-fail; limit first physics to 30 seconds
 // while evaluating the new planning algorithm. Large 180s sporting
 // approval requires a dedicated full-horizon test later.
 const seconds=n===8?180:30
 const args={mode:'five_dense',roadGeometry,pacePolicy,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  coreMergePolicy:'preview_only',
  rollingStartSpeedMps:n>=106?9:null}
 const initial=createMultiGatePhysicalCandidateV3(n,args)
 assert.equal(initial.admission.status,'NECESSARY_WINDOWS_EXIST')
 assert.equal(initial.admission.bookedCount,n*2)
 const frozen=JSON.stringify(initial)
 const final=runMultiGatePhysicalCandidateV3(initial,{seconds})
 assert.equal(JSON.stringify(initial),frozen,
  'A80 mutated original physical checkpoint')
 assert.equal(final.officialWrites,0)
 assert(final.physical.at>=0&&final.physical.at<=seconds)
 assert(final.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  same(s.energy.seconds,final.physical.at)))
 const metrics=multiGatePhysicalMetricsV3(initial,final)
 if(final.reason){
  assert.equal(final.physical.reason,null,
   'A80 committed an invalid full-body physical movement')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(final))
 }else assert.equal(final.physical.at,seconds)
 const actualTicks=final.physical.acceptedSteps
 const counted=Object.values(final.horizonSelectedPolicies)
  .reduce((a,b)=>a+b,0)
 assert(counted>=actualTicks&&counted<=actualTicks+1,
  'A80 policy accounting does not match actual physics')
 trials.push({n,roadGeometry,pacePolicy,
  acceptedSeconds:final.physical.at,horizonSeconds:seconds,
  status:final.reason??'FULL_TEST_HORIZON_ACCEPTED',
  nearStopRiderTicks:metrics.nearStops,
  allPastSecondOpening:metrics.allPastSecondReopening,
  rearX:metrics.rearX,
  realLaneChanges:metrics.laneChanges,
  firstCollision:metrics.firstCollision?.pair??null,
  firstRoadExit:metrics.firstRoadViolation?.riderId??null,
  chosen:final.horizonSelectedPolicies,
  fullHorizonPreviewTicks:final.horizonFullLookaheadTicks,
  incompletePreviewWarnings:final.horizonRejectedPredictions,
  sportingPass:!final.reason&&final.physical.at===180&&
   metrics.allPastSecondReopening&&metrics.nearStops===0})
}
const report={study:'A80_RECEDING_HORIZON_TRUE_PHYSICS_PHASE1',
 technicalGate:'PASS_FOR_VALIDATED_ACTUAL_CONTACT_RESULTS',
 depthTicks:[2,3],trialCount:trials.length,
 nearFutureCollisionRejectionProven:true,officialWrites:0,
 sportingApproval:'NO_GO_UNTIL_ALL_LARGE_FIELDS_FULL_180',
 fullLargeClear:trials.filter(t=>t.n>=106&&t.sportingPass).length,
 best:Object.fromEntries([32,106,168].map(n=>[n,
  trials.filter(t=>t.n===n).sort(
    (a,b)=>b.acceptedSeconds-a.acceptedSeconds)[0]])),
 trials}
const dir=process.env.V3_A2_STEP80_DIR??'/tmp/v3-step80'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/step80-horizon-physical-pilot.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
