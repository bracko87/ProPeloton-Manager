/** Step64 startup feasibility: ordinary grid and bounded full-field physical
 * steps, not historical A44 future trajectories or selected alert checkpoints.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createNormalStartV3,advanceNormalStartV3,runNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
const round=n=>Math.round(n*1e6)/1e6
const scenarios=[]
const run=(n,mode,seconds)=>{
 const start=createNormalStartV3(n,{mode})
 const end=runNormalStartV3(start,{seconds})
 const summary=finishNormalStartMetricsV3(start,end)
 assert.equal(summary.officialWrites,0)
 assert.equal(summary.sportingApproval,'NOT_APPROVED')
 assert(summary.acceptedSteps>=0&&summary.acceptedSteps<=seconds*2)
 assert(!end.states.some(s=>s.energy.remainingWPrimeJoules<0||
  s.energy.seconds!==end.at),'A64 energy/time divergence')
 assert(end.states.every(s=>s.y>=0&&s.y<=4.4+1e-6&&s.v>=0))
 scenarios.push({scenario:n+'_'+mode+'_'+seconds,summary})
 return {start,end,summary}
}
// A provisional tempo-only cohort is the no-contact/restart reference.
// Longitudinal road flow deliberately does NOT imply valid racing tactics.
const reference=run(32,'tempered',120)
assert.equal(reference.summary.status,'FULL_HORIZON_CLEAR',
 'A64 ordinary 32-rider reference failed continuous safety')
assert.equal(reference.summary.acceptedSteps,240)
// Exact same checkpoint recovery: no random seed or future oracle.
const first=runNormalStartV3(reference.start,{seconds:60})
const resumed=runNormalStartV3(JSON.parse(JSON.stringify(first)),{seconds:60})
assert.deepEqual(resumed,reference.end,'A64 serialized 60s checkpoint mismatch')
// Baseline parity under road reflection and lexical ID reversal; geometric
// dynamics must not inspect or privilege a rider name.
const mirrored=runNormalStartV3(createNormalStartV3(32,{mode:'tempered',mirror:true}),
 {seconds:120})
const relabeled=runNormalStartV3(createNormalStartV3(32,{mode:'tempered',renamed:true}),
 {seconds:120})
assert.equal(mirrored.reason,reference.end.reason)
assert.equal(relabeled.reason,reference.end.reason)
for(let i=0;i<32;i++){
 const orig=reference.end.states[i],mirror=mirrored.states[i],relabel=relabeled.states[i]
 assert(Math.abs(orig.y+mirror.y-4.4)<1e-6,
  'A64 road reflection changed final lateral position')
 assert.equal(orig.x,mirror.x,'A64 mirror changed road progress')
 assert.equal(orig.x,relabel.x,'A64 ID order changed road progress')
 assert.equal(orig.energy.remainingWPrimeJoules,mirror.energy.remainingWPrimeJoules)
 assert.equal(orig.energy.remainingWPrimeJoules,relabel.energy.remainingWPrimeJoules)
}
// Include nonuniform field demand; a failed collision closes the experiment,
// never mutates the accepted state to rescue a rider artificially.
for(const [n,mode,seconds] of [
 [8,'tempered',90],[106,'tempered',30],[168,'tempered',30],
 [8,'mixed',90],[32,'mixed',90],[32,'pressure',90],
 [8,'corridor',90],[32,'corridor',90]
])run(n,mode,seconds)
// A deliberately overlapping physical starting pair MUST fail closed.
const bad=createNormalStartV3(8)
bad.states[1].x=bad.states[0].x
bad.states[1].y=bad.states[0].y
bad.states[1].targetY=bad.states[0].targetY
const invalid=advanceNormalStartV3(bad)
assert.equal(invalid.reason,'SWEPT_CONTACT',
 'A64 improperly accepted a rider overlap')
assert.equal(invalid.acceptedSteps,0,'A64 committed an overlap')
assert.equal(invalid.at,0,'A64 advanced clock after collision')
// No invented race-wide approval even if a benign start makes 120s.
const study={
 study:'A2_STEP64_NORMAL_START_SUSTAINED_PILOT',
 technicalGate:'PASS',sportingGate:'NO_GO',
 ordinaryGridStartup:true,retrospectiveWarningSelection:false,
 provisionalFiveLaneGeometry:true,
 onlyCurrentStateDecisions:true,acceptedCollisionRepairs:0,
 physicalQuantumSeconds:.5,checkpointSeconds:60,
 exactSerializedRestart:true,mirrorProgressParity:true,riderIdProgressParity:true,
 forcedOverlappingStartRejected:true,scenarios,
 officialWrites:0,sportingApproval:'NOT_APPROVED'
}
const dir=process.env.V3_A2_STEP64_DIR??'/tmp/a2-step64'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step64-normal-start-results.json',JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify(study))
