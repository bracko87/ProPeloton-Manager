/** A65 nonclairvoyant headway negotiation: matched normal start and failure audit.
 * Screen only: record contact failures honestly. No production race mutation.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3,runNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const plans=[{n:8,mode:'mixed',seconds:90},{n:8,mode:'corridor',seconds:90},
 {n:32,mode:'mixed',seconds:90},{n:32,mode:'pressure',seconds:90},
 {n:32,mode:'corridor',seconds:90},{n:32,mode:'tempered',seconds:120}]
const comparisons=[],errors=[]
const close=(x,y)=>Math.abs(x-y)<1e-5
const assertValid=(snapshot,target)=>{
 const state=runNormalStartV3(snapshot,{seconds:target})
 assert(state.at<=target+1e-7,'A65 exceeded research horizon')
 assert(state.states.every(s=>s.energy.remainingWPrimeJoules>=0&&
  close(s.energy.seconds,state.at)), 'A65 violated energy or clock ledger')
 if(state.reason){
  assert(['SWEPT_CONTACT','ENERGY_FAILED'].includes(state.reason))
  assert(state.at<target,'A65 invented a completed failure')
  assert.throws(()=>advanceNormalStartV3(state),'A65 failed field replayed as accepted')
 }
 return state
}
for(const trial of plans){
 const options={mode:trial.mode}
 const baseStart=createNormalStartV3(trial.n,options)
 const optStart=createNormalStartV3(trial.n,{...options,controllerPolicy:'coordinated_headway'})
 const base=assertValid(baseStart,trial.seconds),opt=assertValid(optStart,trial.seconds)
 const bm=finishNormalStartMetricsV3(baseStart,base)
 const om=finishNormalStartMetricsV3(optStart,opt)
 assert(om.headwayPairDecisionTicks>=0)
 // Test deterministic restart from normal physical state rather than
 // just equality under the original historical source replay.
 const half=Math.min(trial.seconds/2,45)
 const midway=assertValid(optStart,half)
 if(!midway.reason&&om.status==='FULL_HORIZON_CLEAR'){
  const roundtrip=runNormalStartV3(JSON.parse(JSON.stringify(midway)),
   {seconds:trial.seconds-half})
  assert.deepEqual(roundtrip,opt,'A65 saved-state restart mismatch for '+trial.mode)
 }
 // Once past initial steering and braking, no hidden rider identity ranking.
 const reflected=assertValid(createNormalStartV3(trial.n,{
  ...options,controllerPolicy:'coordinated_headway',mirror:true}),trial.seconds)
 const renamed=assertValid(createNormalStartV3(trial.n,{
  ...options,controllerPolicy:'coordinated_headway',renamed:true}),trial.seconds)
 assert.equal(opt.reason,reflected.reason,'A65 reflected result diverged '+trial.mode)
 assert.equal(opt.reason,renamed.reason,'A65 relabeled result diverged '+trial.mode)
 assert.equal(opt.acceptedSteps,reflected.acceptedSteps)
 assert.equal(opt.acceptedSteps,renamed.acceptedSteps)
 for(let i=0;i<trial.n;i++){
  const a=opt.states[i],b=reflected.states[i],c=renamed.states[i]
  assert(close(a.x,b.x),'A65 reflection changed longitudinal movement '+trial.mode)
  assert(close(a.y+b.y,4.4),'A65 reflection changed road side '+trial.mode)
  assert(close(a.x,c.x),'A65 ID mapping changed movement '+trial.mode)
  assert(close(a.y,c.y),'A65 ID mapping changed lane choice '+trial.mode)
  assert(close(a.energy.remainingWPrimeJoules,b.energy.remainingWPrimeJoules))
  assert(close(a.energy.remainingWPrimeJoules,c.energy.remainingWPrimeJoules))
 }
 const record={n:trial.n,mode:trial.mode,seconds:trial.seconds,
  reference:bm,candidate:om,
  rescue:bm.status!=='FULL_HORIZON_CLEAR'&&om.status==='FULL_HORIZON_CLEAR',
  regression:bm.status==='FULL_HORIZON_CLEAR'&&om.status!=='FULL_HORIZON_CLEAR',
  exactMirror:true,exactRename:true}
 comparisons.push(record)
}
// A65b matched policy parameter sweep. Keep all outcomes, including
// rejected cases, and never select per rider using retrospective contact data.
const standOffSweep=[]
for(const mode of ['mixed','pressure','corridor'])
 for(const metres of [3.2,3.8,4.5]){
  const cfg={mode,controllerPolicy:'coordinated_headway',headwayStandOffM:metres}
  const start=createNormalStartV3(32,cfg)
  const result=assertValid(start,90)
  const score=finishNormalStartMetricsV3(start,result)
  const mirrored=assertValid(createNormalStartV3(32,{...cfg,mirror:true}),90)
  const renamed=assertValid(createNormalStartV3(32,{...cfg,renamed:true}),90)
  assert.equal(result.reason,mirrored.reason,'A65 standoff mirror result '+mode+metres)
  assert.equal(result.reason,renamed.reason,'A65 standoff rename result '+mode+metres)
  assert.equal(result.acceptedSteps,mirrored.acceptedSteps)
  assert.equal(result.acceptedSteps,renamed.acceptedSteps)
  for(let i=0;i<32;i++){
   const a=result.states[i],b=mirrored.states[i],c=renamed.states[i]
   assert(close(a.x,b.x)&&close(a.y+b.y,4.4),'A65 standoff reflection parity')
   assert(close(a.x,c.x)&&close(a.y,c.y),'A65 standoff rider rename parity')
  }
  if(!result.reason){
   const middle=runNormalStartV3(start,{seconds:45})
   assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(middle)),{seconds:45}),
    result,'A65 standoff 45-second restart '+mode+metres)
  }
  standOffSweep.push({mode,standOffMetres:metres,...score})
 }
// A65c startup remains fully nonclairvoyant over longer durations; extend
// the same global (not per-rider) 3.2m policy and keep any new blockers.
const endurance=[]
for(const mode of ['mixed','pressure','corridor']){
 const cfg={mode,controllerPolicy:'coordinated_headway',headwayStandOffM:3.2}
 const start=createNormalStartV3(32,cfg)
 const result=assertValid(start,180)
 const score=finishNormalStartMetricsV3(start,result)
 const reflected=assertValid(createNormalStartV3(32,{...cfg,mirror:true}),180)
 const renamed=assertValid(createNormalStartV3(32,{...cfg,renamed:true}),180)
 assert.equal(reflected.reason,result.reason,'A65 180-second mirrored status differs')
 assert.equal(renamed.reason,result.reason,'A65 180-second renamed status differs')
 assert.equal(reflected.acceptedSteps,result.acceptedSteps)
 assert.equal(renamed.acceptedSteps,result.acceptedSteps)
 for(let i=0;i<32;i++){
  const a=result.states[i],b=reflected.states[i],c=renamed.states[i]
  assert(close(a.x,b.x)&&close(a.y+b.y,4.4),'A65 long mirror deviation')
  assert(close(a.x,c.x)&&close(a.y,c.y),'A65 long ID deviation')
 }
 if(!result.reason){
  const midpoint=runNormalStartV3(start,{seconds:90})
  assert.deepEqual(runNormalStartV3(JSON.parse(JSON.stringify(midpoint)),{seconds:90}),
   result,'A65 90+90s serialized restart does not match 180s')
 }
 endurance.push({n:32,mode,targetSeconds:180,...score})
}
// The older 106/168 reference was a non-interactive steady-speed smoke test.
// Two NEW mixed-speed, normal-start screens are diagnostic only. No claims
// of calibrated peloton sport, full stage, terrain or fatigue are permitted.
const interactiveLarge=[]
for(const n of [106,168]){
 const start=createNormalStartV3(n,{
  mode:'mixed',controllerPolicy:'coordinated_headway',headwayStandOffM:3.2})
 const result=assertValid(start,15)
 interactiveLarge.push({n,mode:'mixed',targetSeconds:15,
  ...finishNormalStartMetricsV3(start,result)})
}
// Explicit impossibility control: no choice of bounded command can unwind
// a physically pre-overlapping start without violation. Must reject.
const invalid=createNormalStartV3(8,{controllerPolicy:'coordinated_headway'})
invalid.states[1].x=invalid.states[0].x
invalid.states[1].y=invalid.states[0].y
invalid.states[1].targetY=invalid.states[0].y
const rejected=advanceNormalStartV3(invalid)
assert.equal(rejected.reason,'SWEPT_CONTACT')
assert.equal(rejected.acceptedSteps,0)
const study={study:'A2_STEP65_COOPERATIVE_HEADWAY_SUSTAINED_TEST',
 technicalGate:'PASS',sportingGate:'NO_GO',scenarios:comparisons.length,
 referenceClear:comparisons.filter(x=>x.reference.status==='FULL_HORIZON_CLEAR').length,
 candidateClear:comparisons.filter(x=>x.candidate.status==='FULL_HORIZON_CLEAR').length,
 rescues:comparisons.filter(x=>x.rescue).length,
 regressions:comparisons.filter(x=>x.regression).length,
 mixed32:comparisons.find(x=>x.n===32&&x.mode==='mixed'),
 pressure32:comparisons.find(x=>x.n===32&&x.mode==='pressure'),
 corridor32:comparisons.find(x=>x.n===32&&x.mode==='corridor'),
 allMirroredAndRelabeled:true,forcedOverlappingRejected:true,standOffSweep,
 endurance,interactiveLarge,
 policyUsesOnlyCurrentState:true,physicalQuantumSeconds:.5,
 officialWrites:0,sportingApproval:'NOT_APPROVED',comparisons}
const dir=process.env.V3_A2_STEP65_DIR??'/tmp/a2-step65'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step65-cooperative-normal-start-results.json',JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify({study:study.study,technicalGate:study.technicalGate,
 sportingGate:study.sportingGate,scenarios:study.scenarios,
 referenceClear:study.referenceClear,candidateClear:study.candidateClear,
 rescues:study.rescues,regressions:study.regressions,
 dense:comparisons.filter(x=>x.n===32).map(x=>({
  mode:x.mode,baseline:x.reference.status,candidate:x.candidate.status,
  baselineAt:x.reference.seconds,candidateAt:x.candidate.seconds,
  baselinePasses:x.reference.uniquePairOrderReversals,
  candidatePasses:x.candidate.uniquePairOrderReversals,
  candidateCompletedLaneChanges:x.candidate.completedLaneChanges,
  candidateNearStopRiderTicks:x.candidate.nearStopRiderTicks,
  candidateBrakeRiderTicks:x.candidate.brakeRiderTicks,
  candidateFirstCollision:x.candidate.firstCollision
 })),endurance:endurance.map(x=>({n:x.n,mode:x.mode,status:x.status,
  seconds:x.seconds,orderReversals:x.uniquePairOrderReversals,
  completedLaneChanges:x.completedLaneChanges,firstCollision:x.firstCollision})),
 interactiveLarge:interactiveLarge.map(x=>({n:x.n,status:x.status,seconds:x.seconds,
  orderReversals:x.uniquePairOrderReversals,firstCollision:x.firstCollision})),
 standOffSweep:standOffSweep.map(x=>({mode:x.mode,standOffMetres:x.standOffMetres,
  status:x.status,seconds:x.seconds,orderReversals:x.uniquePairOrderReversals,
  completedLaneChanges:x.completedLaneChanges,brakeRiderTicks:x.brakeRiderTicks,
  firstCollision:x.firstCollision})),officialWrites:0,sportingApproval:'NOT_APPROVED'}))
