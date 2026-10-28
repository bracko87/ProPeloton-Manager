/** Step74: matched selective adjacent-lane stopping envelope research.
 * All results, including earlier collisions, are recorded honestly.
 * This is not approval to select a live race engine.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {adjacentLaneStoppingReserveV3} from './a2CrossRowFollowingV3.mjs'
import {createNormalStartV3,runNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const near=(a,b)=>Math.abs(a-b)<=1e-5
const nearLead={x:740,y:2.2,v:5}
const rear={x:736,y:1.45,v:6}
const a=adjacentLaneStoppingReserveV3(rear,nearLead)
assert(a.active&&a.gapM>3.2&&a.closingMps===1)
const gentle=adjacentLaneStoppingReserveV3(rear,nearLead,{mode:'gentle'})
assert(gentle.gapM<a.gapM)
const fasterLead=adjacentLaneStoppingReserveV3({...rear,v:4},nearLead)
assert(!fasterLead.active&&fasterLead.gapM===3.2)
const tooFarSide=adjacentLaneStoppingReserveV3({...rear,y:0},nearLead)
assert(!tooFarSide.active)
const reflect=adjacentLaneStoppingReserveV3({...rear,y:4.4-rear.y},
 {...nearLead,y:4.4-nearLead.y})
assert.equal(a.active,reflect.active)
assert(near(a.gapM,reflect.gapM)&&
 near(a.lateralGapM,reflect.lateralGapM)&&
 near(a.requiredStoppingM,reflect.requiredStoppingM))
const rename=adjacentLaneStoppingReserveV3({...rear,id:'t0'},
 {...nearLead,id:'t1'})
assert.deepEqual(rename,a)
assert.throws(()=>adjacentLaneStoppingReserveV3({...rear,v:-1},nearLead))
const base={mode:'corridor',controllerPolicy:'coordinated_demand',
 headwayStandOffM:3.2,bodyHalfWidthM:.3,roadGeometry:'strong_pinch'}
const policies=['platoon_gate_schedule','platoon_gate_pairwise',
 'platoon_gate_pairwise_gentle']
const cases=[]
for(const n of [32,106,168]){
 const seconds=n===32?120:90
 for(const policy of policies){
  const opts={...base,roadMergePolicy:policy}
  const original=createNormalStartV3(n,opts)
  const final=runNormalStartV3(original,{seconds})
  const metrics=finishNormalStartMetricsV3(original,final)
  assert(['FULL_HORIZON_CLEAR','SWEPT_CONTACT','ROAD_ENVELOPE_VIOLATION',
   'ENERGY_FAILED'].includes(metrics.status),'A74 unknown physical status')
  assert(final.at<=seconds&&final.states.every(s=>s.v>=0&&
   s.energy.remainingWPrimeJoules>=0&&near(s.energy.seconds,final.at)),
   'A74 invalid bounded speed/energy/clock')
  const mStart=createNormalStartV3(n,{...opts,mirror:true})
  const rStart=createNormalStartV3(n,{...opts,renamed:true})
  const m=runNormalStartV3(mStart,{seconds})
  const r=runNormalStartV3(rStart,{seconds})
  assert.equal(m.reason,final.reason,'A74 mirrored contact category changed')
  assert.equal(r.reason,final.reason,'A74 renamed contact category changed')
  assert.equal(m.acceptedSteps,final.acceptedSteps,'A74 mirror time drift')
  assert.equal(r.acceptedSteps,final.acceptedSteps,'A74 ID time drift')
  for(let i=0;i<n;i++){
   const x=final.states[i],y=m.states[i],z=r.states[i]
   assert(near(x.x,y.x)&&near(x.y,4.4-y.y),
    'A74 mirror trajectory changed at '+n+'/'+policy+'/'+i)
   assert(near(x.x,z.x)&&near(x.y,z.y),
    'A74 renamed trajectory changed at '+n+'/'+policy+'/'+i)
   assert(near(x.energy.remainingWPrimeJoules,y.energy.remainingWPrimeJoules))
   assert(near(x.energy.remainingWPrimeJoules,z.energy.remainingWPrimeJoules))
  }
  if(!final.reason){
   const mid=runNormalStartV3(original,{seconds:seconds/2})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(mid)),
    {seconds:seconds/2}),final,'A74 snapshot mismatch')
  }else{
   assert.throws(()=>advanceNormalStartV3(final))
  }
  if(n===32&&policy==='platoon_gate_schedule'){
   assert.equal(metrics.status,'FULL_HORIZON_CLEAR')
   assert(metrics.completedLaneChanges>=20&&
    metrics.nearStopRiderTicks===0&&final.states.every(s=>s.x>=1020),
    'A74 baseline lost proved full 32-rider traversal')
  }
  if(n>32&&policy==='platoon_gate_schedule')assert.equal(metrics.seconds,43,
   'A74 altered matched 106/168 first-contact control')
  cases.push({n,policy,targetSeconds:seconds,
   status:metrics.status,acceptedSeconds:metrics.seconds,
   completedLaneChanges:metrics.completedLaneChanges,
   nearStopRiderTicks:metrics.nearStopRiderTicks,
   selectiveGapWarningTicks:metrics.roadGateSelectiveGapWarningTicks,
   firstCollision:metrics.firstCollision,firstRoadExit:metrics.firstRoadViolation})
 }
}
const compared=cases.filter(c=>c.policy!=='platoon_gate_schedule').map(c=>{
 const prior=cases.find(x=>x.n===c.n&&x.policy==='platoon_gate_schedule')
 return {...c,vsBaselineAcceptedSeconds:
  c.acceptedSeconds-prior.acceptedSeconds,
  fullFieldClear:c.status==='FULL_HORIZON_CLEAR'}
})
assert(compared.every(c=>c.selectiveGapWarningTicks>0),
 'A74 new policy never exercised actual selective stopping reserve')
const report={study:'A2_STEP74_SELECTIVE_CROSS_ROW_FOLLOWING',
 technicalGate:'PASS',sportingGate:'NO_GO',
 hypothesis:'Scale 32 fully traversed strong road to 106/168 without broad braking',
 boundedAccelerationUnchanged:true,bicycleRoadEdgesUnchanged:true,
 mirrorAndIdentityParity:true,officialWrites:0,
 baseline32Retained:true,allCandidateComparisons:compared,
 cases,largeFieldClearCount:compared.filter(c=>c.n>32&&c.fullFieldClear).length,
 rejectedCandidateCount:compared.filter(c=>c.vsBaselineAcceptedSeconds<0).length,
 sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP74_DIR??'/tmp/a2-step74'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step74-selective-cross-row.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({
 study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,
 cases:cases.map(c=>({n:c.n,policy:c.policy,status:c.status,
  seconds:c.acceptedSeconds,laneChanges:c.completedLaneChanges,
  warnings:c.selectiveGapWarningTicks,
  nearStops:c.nearStopRiderTicks,
  firstContact:c.firstCollision?.pair??null,roadExit:c.firstRoadExit?.riderId??null})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'
}))
