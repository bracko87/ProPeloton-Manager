/** Batch 31 OFFLINE: actual full-stage coupled physical/energy passing A/B. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {compareFinishOrderV3,measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH31_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const out=process.env.V3_BATCH31_OUT_DIR??'/tmp/v3-batch31';mkdirSync(out,{recursive:true})
const source=batch26Input(fixture),conditions=[
 {name:'original',seed:source.seed},
 {name:'grid_B',seed:'batch28-research-grid-B'}
]
const report=[]
for(const condition of conditions){
 const base={...source,seed:condition.seed,experimentalPowerDurationEnergy:true}
 const trial={...base,experimentalFinitePassReservation:true}
 const control=runCoupledV3(base),experiment=runCoupledV3(trial)
 assert.equal(control.passingResearch,undefined)
 assert.equal(experiment.mode,'OFFLINE_RESEARCH_ONLY');assert.equal(experiment.sportingApproval,'NOT_APPROVED');assert.equal(experiment.officialWrites,0)
 assert.equal(experiment.finish.length,source.riders.length)
 assert(experiment.finish.every(r=>Number.isFinite(r.finishSeconds)&&r.energy>=0&&r.energy<=1))
 assert(experiment.passingResearch.attempts>=experiment.passingResearch.completed+experiment.passingResearch.rejected)
 assert(experiment.passingResearch.additionalMechanicalJoules>=350* (experiment.passingResearch.completed+experiment.passingResearch.rejected))
 const cp=initializeCoupledV3(trial);let batches=0,pendingRestarts=0
 while(!cp.complete){
  advanceCoupledV3(trial,cp,[1,5,13,7][batches%4])
  if(cp.passingResearch.pending)pendingRestarts++
  const saved=JSON.parse(JSON.stringify(cp))
  assert.deepEqual(saved,cp,'JSON checkpoint changed values')
  Object.assign(cp,saved)
  assert(++batches<2000,'Full-stage Batch 31 calculation exceeded cap')
 }
 assert.deepEqual(finalizeCoupledV3(trial,cp),experiment,'Full-race passing checkpoint restart mismatch')
 const changed=compareFinishOrderV3(control.finish,experiment.finish)
 const study={condition,baselineTailGapSeconds:control.finish.at(-1).gapSeconds,passingTailGapSeconds:experiment.finish.at(-1).gapSeconds,deltaBlockedTicks:experiment.movement.wheelLimitedTicks-control.movement.wheelLimitedTicks,energyA:control.powerDuration,energyB:experiment.powerDuration,passing:experiment.passingResearch,orderComparison:changed,restartedBatches:batches,pendingCheckpointObservations:pendingRestarts,completeFinish:experiment.finish}
 report.push(study)
 console.log(JSON.stringify({fixture,condition:condition.name,roster:source.riders.length,pass:study.passing,deltaBlockedTicks:study.deltaBlockedTicks,deltaTailGapSeconds:study.passingTailGapSeconds-study.baselineTailGapSeconds,pairOrderChanged:changed.discordantPairs,rankChanges:changed.changedRankCount,batches,pendingCheckpointObservations:pendingRestarts,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
}
const doc={experiment:'OFFLINE_BATCH31_ACTUAL_POWER_FINITE_PASS',fixture,roster:source.riders.length,sourceQuality:'synthetic_research',officialWrites:0,sportingApproval:'NOT_APPROVED',passDurationTicks:3,passAdditionalWatts:35,results:report,limitations:['W-prime and 35W passing cost provisional, not calibrated','A three-tick lane reservation is not interpolated lateral steering','Only two starting grid variants, no measured real weather','Guangxi frozen geometry omits 718m gain; Dordrecht maps sprint-points orders to tempo']}
const file=out+'/'+fixture+'-full-stage-energy-passing.json';writeFileSync(file,JSON.stringify(doc,null,2)+'\n')
