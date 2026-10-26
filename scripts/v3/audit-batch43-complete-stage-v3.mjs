/** Milestone A — first full 2D stage acceptance. OFFLINE ONLY.
 * Finish classification MUST exist for all 106/168 riders; otherwise FAIL.
 * Two-rider same-row lane swap is a tightly controlled sporting sensitivity.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_MILESTONE_A_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const frozen=batch26Input(fixture),output=process.env.V3_MILESTONE_A_DIR??'/tmp/v3-milestone-a'
mkdirSync(output,{recursive:true})
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x))
const r6=x=>Math.round(x*1e6)/1e6
const base=frozen.riders.map((r,i)=>({
 riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,
 cpWatts:clamp(155+r.flat*1.15+(r.raceSharpness-50)*.2,160,420),
 wPrimeJoules:clamp(10000+r.endurance*80,12000,25000),tactic:i%6===0?'attack':'tempo'
}))
const swapped=structuredClone(base)
const first=swapped[0].lane;swapped[0].lane=swapped[1].lane;swapped[1].lane=first
assert(swapped.every((r,i)=>r.riderId===base[i].riderId&&r.meters===base[i].meters&&r.cpWatts===base[i].cpWatts&&r.wPrimeJoules===base[i].wPrimeJoules))
const schemes=[
 {name:'original_no_steering',riders:base,allowSteering:false},
 {name:'original_with_steering',riders:base,allowSteering:true},
 {name:'two_rider_lane_swap_with_steering',riders:swapped,allowSteering:true}
]
function checkFinish(a,riders){
 assert.equal(a.stageFinished,true,'No completed stage')
 assert.equal(a.finish.length,riders.length,'Missing finishers')
 assert.equal(new Set(a.finish.map(r=>r.riderId)).size,riders.length,'Duplicate finisher')
 assert(a.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.finishSeconds>0&&Number.isFinite(r.energyRemainingJ)&&r.gapSeconds>=0))
 assert(a.finish.every((r,i)=>i===0||r.finishSeconds>=a.finish[i-1].finishSeconds))
 assert.equal(a.officialWrites,0);assert.equal(a.sportingApproval,'NOT_APPROVED')
}
const all=[]
for(const scheme of schemes){
 const input={riders:scheme.riders,route:frozen.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:scheme.allowSteering,capacity:2,dt:10,quality:'synthetic_research'}
 let state=initializeCoupled2DResearchV3(input),saved=null,steps=0
 const declaredKm=r6(frozen.route.reduce((s,r)=>s+r.lengthKm,0))
 assert(Math.abs(state.input.finishDistanceMeters-declaredKm*1000)<.00001)
 const maxTicks=Math.ceil(state.input.finishDistanceMeters/25)+1200
 // Store a checkpoint after at least 40% of the stage's distance and replay it.
 while(!state.complete){
  state=advanceCoupled2DResearchV3(state,Math.min(24,1000))
  steps++
  if(!saved&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.40)&&state.finish.length===0)saved=JSON.parse(JSON.stringify(state))
  if(steps%12===0)console.log(JSON.stringify({fixture,scenario:scheme.name,elapsedSeconds:state.elapsedSeconds,leaders:state.riders.filter(r=>r.finishSeconds===null).sort((a,b)=>b.meters-a.meters).slice(0,1).map(x=>r6(x.meters)),finishers:state.finish.length,blocked:state.metrics.blockedRiderTicks,officialWrites:0}))
  assert(state.tick<maxTicks,'Full stage exceeded bounded simulation budget')
 }
 const summary=summarizeCoupled2DResearchV3(state)
 checkFinish(summary,base)
 assert(saved,'Missing in-race recovery checkpoint')
 const recovered=JSON.parse(JSON.stringify(saved))
 let resumed=recovered,restarts=0
 while(!resumed.complete){
  resumed=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(resumed,Math.min([11,7,29,5][restarts%4],1000))))
  assert(++restarts<maxTicks,'Unbounded resume batches')
 }
 assert.deepEqual(resumed,state,'Restored checkpoint changes entire final 2D stage')
 assert.deepEqual(advanceCoupled2DResearchV3(state,1),state,'Completed stage advanced again')
 const finish={winner:summary.finish[0].riderId,winningSeconds:summary.finish[0].finishSeconds,tailGapSeconds:summary.finish.at(-1).gapSeconds,spreadSeconds:r6(summary.finish.at(-1).finishSeconds-summary.finish[0].finishSeconds),top10:summary.finish.slice(0,10).map(x=>x.riderId)}
 all.push({name:scheme.name,finish,metrics:summary.metrics,finishDistanceMeters:summary.finishDistanceMeters,fullStageTicks:summary.ticks,checkpointStartTick:saved.tick,recoveryBatches:restarts,checkpointExact:true,finishRows:summary.finish,positions:summary.positions,samples:state.samples})
 console.log(JSON.stringify({fixture,scenario:scheme.name,fullStage:true,finishers:summary.finish.length,finish,metrics:{blocked:summary.metrics.blockedRiderTicks,passesStarted:summary.metrics.reservationsStarted,passesCompleted:summary.metrics.completedPasses,first30mGapSecond:summary.first30mGapSecond},checkpointExact:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
}
const orderPairs=(a,b)=>{
 const idx=new Map(b.finishRows.map((r,i)=>[r.riderId,i]))
 let swaps=0
 for(let i=0;i<a.finishRows.length;i++)for(let j=i+1;j<a.finishRows.length;j++)
  swaps+=Number(idx.get(a.finishRows[i].riderId)>idx.get(a.finishRows[j].riderId))
 return {pairReversals:swaps,totalPairs:a.finishRows.length*(a.finishRows.length-1)/2,sharePercent:r6(100*swaps/(a.finishRows.length*(a.finishRows.length-1)/2)),changedRanks:a.finishRows.filter((r,i)=>idx.get(r.riderId)!==i).length}
}
const robustness=orderPairs(all[1],all[2])
const steeringDelta={blockedRiderTicks:all[1].metrics.blockedRiderTicks-all[0].metrics.blockedRiderTicks,tailGapSeconds:r6(all[1].finish.tailGapSeconds-all[0].finish.tailGapSeconds),winnerChanged:all[1].finish.winner!==all[0].finish.winner}
const result={experiment:'V3_MILESTONE_A_FIRST_FULL_COUPLED_2D_STAGES',fixture,roster:base.length,distanceKm:r6(frozen.route.reduce((s,r)=>s+r.lengthKm,0)),officialWrites:0,sportingApproval:'NOT_APPROVED',newEngineFullStageGate:true,threeCompletedOfflineStages:all.length,uncalibratedRoadWidthMeters:5,robustness,steeringDelta,scenarios:all,releaseBlockers:['Race-phase tactics and genuine in-race team orders not connected to this experimental solver','Road-width, bicycle CdA and realistic power/fatigue not calibrated','Guangxi climb source missing 718m; World Nations race other fixture missing 1065m','Finish-line rider path spends remaining tick on road and energy is charged for full terminal tick','Need real multi-grid robustness, attack/chase groups and live tactical sectors, exact source topology','No authority to switch the game or resume clocks']}
const file=output+'/'+fixture+'-first-full-2d-stages.json'
writeFileSync(file,JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({fixture,milestone:'A full race TECHNICAL GATE',fullStages:all.length,allRidersFinished:true,robustness,steeringDelta,officialWrites:0,sportingApproval:'NOT_APPROVED',file}))
