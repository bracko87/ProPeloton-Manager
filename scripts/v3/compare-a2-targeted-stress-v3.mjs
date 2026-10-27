/** Offline-only acceptance comparison, grounded in two identical stress fixtures. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
const size=Number(process.env.V3_A2_STRESS_RIDERS??12)
assert([12,24,32].includes(size))
const baselineDir=process.env.V3_A2_STRESS_DIR??'/tmp/v3-a2-micro'
const candidateDir=process.env.V3_A2_TARGETED_DIR??'/tmp/v3-a2-targeted'
const load=(dir)=>JSON.parse(readFileSync(dir+'/sustained-'+size+'.json','utf8'))
const baseline=load(baselineDir),candidate=load(candidateDir)
assert(baseline.size===size&&candidate.size===size)
assert.equal(baseline.technicalGate,'PASS')
assert.equal(candidate.technicalGate,'PASS')
assert.equal(candidate.officialWrites,0)
assert.equal(candidate.sportingApproval,'NOT_APPROVED')
const byName=new Map(candidate.scenarios.map(r=>[r.scenario,r]))
const round=x=>Math.round(x*1e6)/1e6
const scenarios=baseline.scenarios.map(a=>{
 const b=byName.get(a.scenario)
 assert(b&&a.checkpointExact&&b.checkpointExact&&a.permutationExact&&b.permutationExact)
 assert(a.technical==='PASS'&&b.technical==='PASS')
 return {scenario:a.scenario,
  baselineMovementPercent:a.fulfilmentPercent,candidateMovementPercent:b.fulfilmentPercent,deltaMovementPercentagePoints:round(b.fulfilmentPercent-a.fulfilmentPercent),
  baselineWorstTickPercent:a.worstTickFulfilmentPercent,candidateWorstTickPercent:b.worstTickFulfilmentPercent,deltaWorstTickPoints:round(b.worstTickFulfilmentPercent-a.worstTickFulfilmentPercent),
  baselineHaltedRiderSeconds:a.haltedRiderSeconds,candidateHaltedRiderSeconds:b.haltedRiderSeconds,
  baselineCrossings:a.longitudinalPairCrossings,candidateCrossings:b.longitudinalPairCrossings,
  baselineLateralMeters:a.lateralMeters,candidateLateralMeters:b.lateralMeters,
  baselineCollisionIterations:a.conflictIterations,candidateCollisionIterations:b.conflictIterations,
  singleRiderYieldDecisions:b.targetedYieldDecisions??0,symmetricFallbackEdges:b.symmetricFallbackEdges??0,largestFirstConflictComponent:b.largestFirstConflictComponent??0,
  candidateFlags:b.issues}
})
assert.equal(scenarios.length,4)
const flags=[]
for(const x of scenarios){
 if(x.deltaMovementPercentagePoints< -3)flags.push(x.scenario+':AGGREGATE_MOTION_WORSE')
 if(x.deltaWorstTickPoints< -3)flags.push(x.scenario+':WORST_TICK_WORSE')
 if(x.candidateHaltedRiderSeconds>x.baselineHaltedRiderSeconds*1.25+200)flags.push(x.scenario+':HALTS_WORSE')
 if(x.scenario==='passing_corridors'&&x.candidateCrossings===0)flags.push('NO_PASSING')
}
const conclusion=flags.length?'RESEARCH_REJECT_OR_REVISE':'FURTHER_RESEARCH_ONLY'
const summary={study:'A2_TARGETED_VS_SYMMETRIC_SUSTAINED',riders:size,technicalGate:'PASS',sportingApproval:'NOT_APPROVED',candidateDisposition:conclusion,signals:flags,scenarios,
 notes:['All numeric deltas compare the same 90-tick scripted initial roster and actions','Stage classification and authentic breakaways are not modeled','These screens are heuristic diagnostic thresholds, not calibrated sporting acceptance criteria','Full source road widths, climb profiles, tactics, finish-line handling and race integration remain unresolved'],
 officialWrites:0}
writeFileSync(candidateDir+'/comparison-'+size+'.json',JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify(summary))
