/** Step78 prospective physical lane-speed trial.
 * Multiple complete requested fields are checked BEFORE commitment.
 * No rejected candidate is ever an accepted tick or an approved race.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {chooseProspectivePhysicalTickV3} from './a2Step78ProspectiveChoiceV3.mjs'
import {createMultiGatePhysicalCandidateV3,
 advanceMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3,
 multiGatePhysicalMetricsV3} from './a2MultiGatePhysicalCandidateV3.mjs'
const old={at:0,acceptedSteps:0,nearStops:0,cumulativeAdvancement:0,
 states:[{id:'a',x:3,y:2,v:10},{id:'b',x:0,y:2,v:10}]}
const options=[
 {policy:'unsafe',requests:[{id:'a',speed:10,targetY:2},
  {id:'b',speed:10,targetY:2}]},
 {policy:'safe',requests:[{id:'a',speed:7,targetY:2},
  {id:'b',speed:7,targetY:2}]}
]
const saved=JSON.stringify({old,options})
const step=x=>x.states[0].desired>8?
 {...x,reason:'SWEPT_CONTACT'}:
 {...x,reason:null,at:.5,acceptedSteps:1,nearStops:0,
  cumulativeAdvancement:10}
const chosen=chooseProspectivePhysicalTickV3(old,options,step)
assert.equal(chosen.status,'ACCEPTED')
assert.equal(chosen.policy,'safe')
assert.deepEqual(chosen.probes.map(x=>x.accepted),[false,true])
assert.equal(JSON.stringify({old,options}),saved)
assert.equal(chooseProspectivePhysicalTickV3(
 old,[options[0]],step).status,'NO_ACCEPTABLE_PROPOSAL')
assert.throws(()=>chooseProspectivePhysicalTickV3(old,
 [{policy:'bad',requests:[options[0].requests[0]]}],step))
const trials=[]
for(const n of [8,32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch'])
for(const rollingStartSpeedMps of [null,9]){
 const options={mode:'five_dense',roadGeometry,
  headwayStandOffM:4.5,controllerPolicy:'coordinated_demand',
  pacePolicy:'joint_prospective_v1',coreMergePolicy:'preview_only',
  rollingStartSpeedMps}
 const init=createMultiGatePhysicalCandidateV3(n,options)
 assert.equal(init.admission.status,'NECESSARY_WINDOWS_EXIST')
 const before=JSON.stringify(init)
 const result=runMultiGatePhysicalCandidateV3(init,{seconds:180})
 assert.equal(JSON.stringify(init),before,'A78 changed original snapshot')
 const m=multiGatePhysicalMetricsV3(init,result)
 assert(result.physical.at>=0&&result.physical.at<=180)
 assert.equal(result.officialWrites,0)
 assert(result.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  Math.abs(s.energy.seconds-result.physical.at)<1e-6))
 assert(result.prospectiveBaselineTicks+result.prospectiveJointTicks===
  result.physical.acceptedSteps)
 if(result.reason){
  assert.equal(result.status,'REJECTED')
  assert.equal(result.physical.reason,null,
   'A78 committed an invalid physical proposal')
  assert.throws(()=>advanceMultiGatePhysicalCandidateV3(result))
 }else assert.equal(result.physical.at,180)
 trials.push({n,roadGeometry,rollingStartSpeedMps,
  acceptedSeconds:result.physical.at,reason:result.reason,
  allRidersPastSecondOpening:m.allPastSecondReopening,
  trueNoStopPhysicalCompletion:!result.reason&&
   m.allPastSecondReopening&&m.nearStops===0,
  nearStopRiderTicks:m.nearStops,laneChanges:m.laneChanges,
  rearX:m.rearX,contact:m.firstCollision?.pair??null,
  roadsideViolation:m.firstRoadViolation?.riderId??null,
  baselineSelectedTicks:result.prospectiveBaselineTicks,
  jointSelectedTicks:result.prospectiveJointTicks,
  rejectedUncommittedProposals:result.prospectiveRejectedProposals})
}
// The full physical field is never given an ID-based preference or a
// favorite left or right road side. Require parity on observed short runs.
for(const n of [8,32])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const common={mode:'five_dense',roadGeometry,headwayStandOffM:4.5,
  pacePolicy:'joint_prospective_v1'}
 const baseline=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,common),{seconds:12})
 const mirror=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...common,mirror:true}),
  {seconds:12})
 const rename=runMultiGatePhysicalCandidateV3(
  createMultiGatePhysicalCandidateV3(n,{...common,renamed:true}),
  {seconds:12})
 assert.equal(baseline.reason,mirror.reason)
 assert.equal(baseline.reason,rename.reason)
 assert.equal(baseline.physical.at,mirror.physical.at)
 assert.equal(baseline.physical.at,rename.physical.at)
 for(let i=0;i<n;i++){
  const a=baseline.physical.states[i],
   b=mirror.physical.states[i],c=rename.physical.states[i]
  assert(Math.abs(a.x-b.x)<1e-5&&
   Math.abs(a.y+b.y-4.4)<1e-5,'A78 mirror mismatched')
  assert(Math.abs(a.x-c.x)<1e-5&&
   Math.abs(a.y-c.y)<1e-5,'A78 identity influenced proposal')
 }
}
const complete=trials.filter(t=>t.trueNoStopPhysicalCompletion)
const report={study:'A78_PRECOMMIT_WHOLE_FIELD_PHYSICAL_CHOICE',
 technicalGate:'PASS_ONLY_WHEN_ASSERTIONS_HOLD',
 sportingGate:'NO_GO_UNTIL_ALL_LARGE_FIELDS_AND_LONG_STAGES',
 prospectiveNotRetrospective:true,collisionAndRoadGuardsUnchanged:true,
 initialFieldCounts:[8,32,106,168],
 fullNoStopRaces:complete,officialWrites:0,trials}
const dir=process.env.V3_A2_STEP78_PROSPECTIVE_DIR??'/tmp/a78prospective'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a78-prospective-real-physics-results.json',
 JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
