/** Batch 28 OFFLINE research: multi-seed neutral grids, small row swap, synthetic wind. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {measurePelotonSeparationsV3} from './finishOrderSensitivityV3.mjs'
import {compareGridExperimentsV3,checkNeutralGridV3} from './gridRobustnessV3.mjs'
const mode=process.env.V3_BATCH28_MODE??'energy',fixture=process.env.V3_BATCH28_FIXTURE??'dordrecht-2000-10-15'
assert(['energy','combined'].includes(mode));assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const dest=process.env.V3_BATCH28_OUT_DIR??'/tmp/v3-batch28';mkdirSync(dest,{recursive:true})
const round6=x=>Math.round(x*1e6)/1e6
const base=batch26Input(fixture)
const flags=mode==='combined'?{experimentalPowerDurationEnergy:true,experimentalBottleneckTelemetry:true,experimentalAnticipatoryLaneMoves:true,experimentalPathDraftWork:true}:{experimentalPowerDurationEnergy:true}
const labels=['original_grid','reshuffle_A','reshuffle_B','one_middle_row_lane_swap']
const seeds=[base.seed,'batch28-research-grid-A','batch28-research-grid-B',base.seed]
const courseLength=base.route.reduce((n,r)=>n+r.lengthKm,0)
function swapMiddleRow(state){
 const sorted=[...state.riders].sort((a,b)=>a.meters-b.meters||a.lane-b.lane||a.riderId.localeCompare(b.riderId))
 const rowMeter=sorted[Math.floor(sorted.length/2)].meters
 const row=sorted.filter(x=>Math.abs(x.meters-rowMeter)<1e-8).sort((a,b)=>a.lane-b.lane)
 assert(row.length>=2&&row[0].lane!==row[1].lane,'Expected synthetic multi-lane grid')
 const before=JSON.stringify(state),left=row[0],right=row[1]
 const tmp=left.lane;left.lane=right.lane;right.lane=tmp
 assert.equal(left.meters,right.meters,'Swap must not grant a longitudinal gain')
 assert(!state.riders.some((x,i)=>state.riders.slice(i+1).some(y=>x.lane===y.lane&&Math.abs(x.meters-y.meters)<1.8-1e-6)),'Starting lane swap caused collision')
 const compare=structuredClone(state),a=compare.riders.find(x=>x.riderId===left.riderId),b=compare.riders.find(x=>x.riderId===right.riderId)
 const tmp2=a.lane;a.lane=b.lane;b.lane=tmp2
 assert.equal(JSON.stringify(compare),before,'Must alter exactly two lane assignments and nothing else')
 return {riderIds:[left.riderId,right.riderId],meters:rowMeter}
}
function simulate(input,label,{swapped=false,checkRestart=false}={}){
 const state=initializeCoupledV3(input)
 let swap=null;if(swapped)swap=swapMiddleRow(state)
 assert.equal(state.riders.length,base.riders.length)
 const neutral=state.riders.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane}))
 const sampleAt=[.1,.25,.5,.75].map(f=>round6(courseLength*f))
 const checkpoints=[];let firstSplit=null,chunks=0
 while(!state.complete){
  advanceCoupledV3(input,state,12)
  if(chunks===3||chunks===25||chunks===50){const saved=JSON.parse(JSON.stringify(state));assert.deepEqual(saved,state);Object.assign(state,saved)}
  const active=state.riders.filter(r=>r.finishSeconds===null),leader=Math.max(...active.length?active.map(r=>r.meters):[state.totalMeters])/1000
  const grouping=measurePelotonSeparationsV3(state,30)
  if(firstSplit===null&&leader>=2&&leader<courseLength*.95&&grouping.gapsAboveThreshold>0&&active.length>=.8*base.riders.length){firstSplit={second:state.elapsedSeconds,leaderKm:round6(leader),groups:grouping.separateGroups}}
  for(let k=checkpoints.length;k<sampleAt.length&&leader>=sampleAt[k];k++)checkpoints.push({thresholdKm:sampleAt[k],actualLeadKm:round6(leader),second:state.elapsedSeconds,...grouping})
  assert(++chunks<2500,'Unbounded full-race grid robustness run')
 }
 const result=finalizeCoupledV3(input,state)
 assert.equal(result.officialWrites,0);assert.equal(result.sportingApproval,'NOT_APPROVED');assert.equal(result.finish.length,base.riders.length)
 assert(result.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&Number.isFinite(r.gapSeconds)&&r.energy>=0&&r.energy<=1))
 assert(state.riders.every(r=>r.powerDurationEnergy?.remainingWPrimeJoules>=0&&r.powerDurationEnergy?.remainingWPrimeJoules<=r.powerDurationEnergy?.wPrimeJoules),'Invalid finite W-prime reserve')
 const attacks=new Map((input.orders??[]).filter(o=>o.tactic==='attack').map(o=>[o.riderId,[]]))
 for(const o of (input.orders??[]).filter(o=>o.tactic==='attack'))attacks.get(o.riderId).push(o)
 for(const r of state.riders)assert(r.attackAttempts<=(attacks.get(r.riderId)?.length??0),'Excessive attack restarts')
 if(checkRestart)assert.deepEqual(result,runCoupledV3(input),'Chunked/restarted baseline differs from uninterrupted simulator')
 return {label,seed:input.seed,swapped:swap,neutral,firstSplit,checkpoints,chunks,result}
}
function buildInput(seed,windy=false){const wind=windy?base.route.map(r=>({...r,headwindMps:3,crosswindMps:2})):base.route;return {...base,...flags,seed,route:wind}}
const calm=labels.map((label,i)=>simulate(buildInput(seeds[i]),label,{swapped:i===3,checkRestart:i===0}))
const windy=[simulate(buildInput(base.seed,true),'wind_original'),simulate(buildInput(seeds[1],true),'wind_reshuffle_A')]
for(const group of [calm,windy]){
 const initial=checkNeutralGridV3(group.map(x=>x.neutral))
 assert.equal(initial.roster,base.riders.length)
 assert(initial.uniqueLayouts>=2,'No actual neutral grid variation in study')
}
const comparisons=[{condition:'calm',cases:calm},{condition:'synthetic_headwind_3_crosswind_2',cases:windy}].map(({condition,cases})=>{
 const stat=compareGridExperimentsV3(cases[0].result,cases.slice(1).map(x=>x.result))
 return {condition,uniqueGrids:checkNeutralGridV3(cases.map(x=>x.neutral)).uniqueLayouts,...stat,cases:cases.map(x=>({label:x.label,seed:x.seed,swapped:x.swapped,firstSplit:x.firstSplit,groupCheckpoints:x.checkpoints,tailGapSeconds:x.result.finish.at(-1).gapSeconds,winner:x.result.finish[0].riderId,blocking:x.result.movement.wheelLimitedTicks,passes:x.result.movement.passes,attackAttempts:x.result.movement.attackAttempts,remainingWPrimeJ:x.result.powerDuration?.remainingWPrimeJoules,checkpointBatches:x.chunks}))}
})
const output={experiment:'BATCH28_OFFLINE_GRID_ROBUSTNESS',sourceQuality:'synthetic_research',mode,fixture,roster:base.riders.length,courseLengthKm:round6(courseLength),officialWrites:0,sportingApproval:'NOT_APPROVED',comparison:comparisons,limitations:['Guangxi reconstructed route missing 718m of reported ascent','Dordrecht eight sprint-point orders mapped to tempo','Wind scenario is artificial rather than observed race weather','Different neutral grid seeds are discrete permutations, not measured start-position distributions','Deterministic scenario outcomes are not confidence intervals or sporting proof']}
const file=dest+'/'+fixture+'-'+mode+'-robustness.json';writeFileSync(file,JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({fixture,mode,roster:output.roster,calm:{seeds:calm.length,uniqueLayouts:comparisons[0].uniqueGrids,distinctWinners:comparisons[0].distinctWinners,medianRankRange:comparisons[0].medianRankRange,maxRankRange:comparisons[0].maxRankRange,top10AlwaysCount:comparisons[0].top10AlwaysCount,transitions:comparisons[0].transitions,firstSplits:calm.map(x=>x.firstSplit)},wind:{scenarios:windy.length,distinctWinners:comparisons[1].distinctWinners,rankReversals:comparisons[1].transitions[1].discordantPairs},sportingApproval:'NOT_APPROVED',officialWrites:0,file}))
