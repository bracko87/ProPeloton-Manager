/** Batch 36 multi-seed, two-weather, full-roster matched energy/demand/occupancy test.
 * No production code or database connections. Finished race results are reference only.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {auditFrozenTickV3} from './frozenFactorialV3.mjs'
import {compareGridExperimentsV3} from './gridRobustnessV3.mjs'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
const fixture=process.env.V3_BATCH36_FIXTURE??'dordrecht-2000-10-15',mode=process.env.V3_BATCH36_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture)&&['energy','finite_pass'].includes(mode))
const dir=process.env.V3_BATCH36_OUT_DIR??'/tmp/v3-batch36';mkdirSync(dir,{recursive:true})
const source=batch26Input(fixture),seeds=[source.seed,'batch28-research-grid-A','batch28-research-grid-B']
const cases=[],r6=x=>Math.round(x*1e6)/1e6
for(const regime of ['frozen_weather','synthetic_headwind_3_crosswind_2']){
 const bySeed=[]
 for(let k=0;k<seeds.length;k++){
  const seed=seeds[k],input={...source,seed,experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{}),...(regime==='frozen_weather'?{}:{route:source.route.map(r=>({...r,headwindMps:3,crosswindMps:2}))})}
  const state=initializeCoupledV3(input)
  const summary={factor0:{changedDemand:0,changedAchieved:0,changedWheelFlag:0,totalClippedMeters:0,totalForwardMeters:0},factorHalf:{changedDemand:0,changedAchieved:0,changedWheelFlag:0,totalClippedMeters:0,totalForwardMeters:0},factorFull:{changedDemand:0,changedAchieved:0,changedWheelFlag:0,totalClippedMeters:0,totalForwardMeters:0},laneOnly:{opportunities:0,changedAchieved:0,changedWheelFlag:0,aggregateForwardDeltaMeters:0},sameMovement:{riderTicks:0,benefitingTicks:0,work0J:0,work50J:0,work100J:0}}
  let first30mGroup=null
  const slices=[]
  for(let tick=0;tick<96&&!state.complete;tick++){
   const before=structuredClone(state.riders.filter(r=>r.finishSeconds===null))
   const pendingPassRiderId=state.passingResearch?.pending?.riderId??null
   let tickSample=null
   advanceCoupledV3(input,state,1,sample=>{tickSample=sample})
   assert(tickSample&&tickSample.rows.length===before.length)
   const snapshot=auditFrozenTickV3(before,tickSample.rows,{laneCount:input.grid.ridersAcross,dtSeconds:input.tickSeconds??10,pendingPassRiderId})
   for(const [index,key] of ['factor0','factorHalf','factorFull'].entries()){
    const v=snapshot.factorial[index],target=summary[key]
    target.changedDemand+=v.changedDemand;target.changedAchieved+=v.changedAchieved;target.changedWheelFlag+=v.changedWheelFlag;target.totalClippedMeters+=v.clippedMeters;target.totalForwardMeters+=v.achievedMeters
   }
   for(const key of Object.keys(summary.sameMovement))summary.sameMovement[key]+=snapshot.energyWork[key]??0
   if(snapshot.laneOnly){summary.laneOnly.opportunities++;for(const key of ['changedAchieved','changedWheelFlag','aggregateForwardDeltaMeters'])summary.laneOnly[key]+=snapshot.laneOnly[key]}
   if(tick===0||tick===5||tick===11||tick===47||tick===95)slices.push({second:tickSample.elapsedSeconds,shadow:snapshot})
   const groups=measurePelotonSeparationsV3(state)
   if(first30mGroup===null&&groups.separateGroups>1&&state.elapsedSeconds>=120)first30mGroup={second:state.elapsedSeconds,groups:groups.separateGroups}
  }
  const at960=measurePelotonSeparationsV3(state)
  const frozenEnd=structuredClone(state)
  const snap=JSON.parse(JSON.stringify(state));assert.deepEqual(state,snap,'Not JSON-safe checkpoint')
  advanceCoupledV3(input,state,100000)
  const result=finalizeCoupledV3(input,state)
  assert.equal(result.sportingApproval,'NOT_APPROVED');assert.equal(result.officialWrites,0);assert.equal(result.finish.length,source.riders.length)
  assert(result.finish.every((x,i)=>x.rank===i+1&&Number.isFinite(x.finishSeconds)&&x.energy>=0&&x.energy<=1))
  if(k===0&&regime==='frozen_weather')assert.deepEqual(result,runCoupledV3(input),'Observer changed uninterrupted original race')
  // Replaying from the exact frozen checkpoint must reproduce this entire finish.
  advanceCoupledV3(input,snap,100000)
  assert.deepEqual(finalizeCoupledV3(input,snap),result,'Paused full-race checkpoint changed finish')
  assert.deepEqual(frozenEnd,JSON.parse(JSON.stringify(frozenEnd)))
  for(const x of Object.values(summary))for(const key of Object.keys(x))if(Number.isFinite(x[key]))x[key]=r6(x[key])
  bySeed.push({seed,index:k,summary,first30mGroup,at960:{groups:at960.separateGroups,frontToBackMeters:at960.frontToBackMeters},slices,finish:result.finish,tailGapSeconds:result.finish.at(-1).gapSeconds,finishOrderFirstTen:result.finish.slice(0,10).map(x=>x.riderId),blockedWholeRace:result.movement.wheelLimitedTicks,checkpointExact:true})
  console.log(JSON.stringify({fixture,mode,regime,grid:k,roster:source.riders.length,frozenFirst960Seconds:{sameMovement:summary.sameMovement,factor0:summary.factor0,factorHalf:summary.factorHalf,laneOnly:summary.laneOnly},first30mGroup,tailGapSeconds:result.finish.at(-1).gapSeconds,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
 const across=compareGridExperimentsV3({finish:bySeed[0].finish,officialWrites:0,sportingApproval:'NOT_APPROVED'},bySeed.slice(1).map(x=>({finish:x.finish,officialWrites:0,sportingApproval:'NOT_APPROVED'})))
 cases.push({regime,gridCount:3,acrossGrid:{distinctWinners:across.distinctWinners,medianRankRange:across.medianRankRange,top10AlwaysCount:across.top10AlwaysCount,transitions:across.transitions},bySeed})
 }
 const report={experiment:'BATCH36_OFFLINE_FACTORED_DEMAND_VS_WHEEL',fixture,mode,roster:source.riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',frozenTicks:96,frozenMechanics:'Each source tick starts from the SAME original rider metres, lane, previous speed, available watts, and W-prime for every counterfactual arm',factorialControls:{aeroFactors:[0,.5,1],energyOnly:'same achieved speed, alternate mechanical work, not debited',powerDemand:'same pre-tick energy and road, alternate shelter in speed solution; one isolated physical tick',laneOnly:'two equal-row riders exchange lanes with identical speed commands, power, energy; one isolated tick'},cases,limitations:['The 96 counterfactual ticks are independent shadows of control checkpoints, not alternative race histories','The isolated lane swap exists only when two equal-distance same-row riders offer safe tracks','Full finish classifications refer ONLY to unchanged coupled control races, not counterfactual isolated arms','Synthetic headwind and crosswind are hypothetical','Guangxi proxy lacks 718m of reported ascent; Dordrecht sprint orders approximated as tempo']}
const file=dir+'/'+fixture+'-'+mode+'-factorial.json';writeFileSync(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,summary:'BATCH36_DONE',frozenScenarios:cases.length,gridRuns:cases.reduce((n,c)=>n+c.bySeed.length,0),percentages:cases.map(c=>({weather:c.regime,gridPairInversionShares:c.acrossGrid.transitions.slice(1).map(x=>x.discordantShare)})),file,sportingApproval:'NOT_APPROVED',officialWrites:0}))
