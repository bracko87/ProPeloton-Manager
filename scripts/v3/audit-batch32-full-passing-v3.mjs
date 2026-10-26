/** Batch 32: complete frozen 106/168-rider, two-grid passing A/B. OFFLINE ONLY. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {compareFinishOrderV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH32_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const dest=process.env.V3_BATCH32_OUT_DIR??'/tmp/v3-batch32';mkdirSync(dest,{recursive:true})
const source=batch26Input(fixture),grids=[{name:'original',seed:source.seed},{name:'grid_B',seed:'batch28-research-grid-B'}]
const scenarios=[{name:'Batch31_default',settings:null},{name:'two_ticks',settings:{durationTicks:2}},{name:'four_ticks',settings:{durationTicks:4}},{name:'lower_cost_20W',settings:{additionalWatts:20}},{name:'higher_cost_50W',settings:{additionalWatts:50}},{name:'most_blocked_first',settings:{selection:'mostBlocked'}},{name:'first_two_km_only',settings:{startMaxKm:2}}]
const rows=[],round=x=>Math.round(x*1e6)/1e6
function checkpoint(input,expected){
 let s=initializeCoupledV3(input),n=0,pending=0
 while(!s.complete){advanceCoupledV3(input,s,[1,5,13,7][n%4]);if(s.passingResearch?.pending)pending++;s=JSON.parse(JSON.stringify(s));assert(++n<2500,'Unbounded checkpoint replay')}
 assert.deepEqual(finalizeCoupledV3(input,s),expected,'Nonidentical serialized passing checkpoint')
 return {chunks:n,pendingCheckpoints:pending}
}
for(const grid of grids){
 const base={...source,seed:grid.seed,experimentalPowerDurationEnergy:true}
 const untreated=runCoupledV3(base)
 const defaultInput={...base,experimentalFinitePassReservation:true}
 const defaultOutcome=runCoupledV3(defaultInput)
 const cases=[]
 for(const scenario of scenarios){
  const input=scenario.settings?{...defaultInput,experimentalFinitePassSensitivity:scenario.settings}:defaultInput
  const result=scenario.settings?runCoupledV3(input):defaultOutcome
  assert.equal(result.officialWrites,0);assert.equal(result.sportingApproval,'NOT_APPROVED');assert.equal(result.finish.length,source.riders.length)
  assert(result.finish.every(r=>Number.isFinite(r.finishSeconds)&&r.energy>=0&&r.energy<=1))
  const p=result.passingResearch
  assert(p.attempts>=p.completed+p.rejected&&p.additionalMechanicalJoules>=0)
  const diff=compareFinishOrderV3(defaultOutcome.finish,result.finish),toUntreated=compareFinishOrderV3(untreated.finish,result.finish)
  const checked=(grid.name==='original'||scenario.name==='Batch31_default')?checkpoint(input,result):null
  cases.push({name:scenario.name,settings:scenario.settings??{durationTicks:3,additionalWatts:35,selection:'id',startMaxKm:5},passing:p,deltaBlockedTicks:result.movement.wheelLimitedTicks-defaultOutcome.movement.wheelLimitedTicks,deltaTailGapSeconds:round(result.finish.at(-1).gapSeconds-defaultOutcome.finish.at(-1).gapSeconds),rankChanges:diff.changedRankCount,invertedPairs:diff.discordantPairs,invertedShare:diff.discordantShare,medianAbsFinishChange:diff.medianAbsoluteFinishChangeSeconds,rankChangesVsNoPassing:toUntreated.changedRankCount,checkpoint:checked,finish:result.finish})
 }
 const expected=fixture.startsWith('dordrecht')?(grid.name==='original'?[6,4,2,4900]:[6,5,1,5950]):(grid.name==='original'?[5,4,1,4550]:[6,5,1,5600])
 const p=cases[0].passing
 assert.deepEqual([p.attempts,p.completed,p.rejected,p.additionalMechanicalJoules],expected,'Existing Batch 31 default changed')
 rows.push({grid,unmodified:{tailGapSeconds:untreated.finish.at(-1).gapSeconds,blockedTicks:untreated.movement.wheelLimitedTicks},cases})
 console.log(JSON.stringify({fixture,grid:grid.name,roster:source.riders.length,scenarios:cases.map(x=>({name:x.name,attempts:x.passing.attempts,completed:x.passing.completed,rejected:x.passing.rejected,workJ:x.passing.additionalMechanicalJoules,deltaBlocked:x.deltaBlockedTicks,deltaTailGap:x.deltaTailGapSeconds,rankChanges:x.rankChanges,inversions:x.invertedPairs,checkpointBatches:x.checkpoint?.chunks??null})),officialWrites:0,sportingApproval:'NOT_APPROVED'}))
}
writeFileSync(dest+'/'+fixture+'-batch32-sensitivity.json',JSON.stringify({experiment:'BATCH32_OFFLINE_PASS_SENSITIVITY',sportingApproval:'NOT_APPROVED',officialWrites:0,fixture,roster:source.riders.length,grids:rows,limitations:['Guangxi route missing 718m reported ascent','Dordrecht sprint point tactics approximated','Discrete lateral occupancy not measured continuous steering','Synthetic grid and provisional rider power']},null,2)+'\n')
