/** Milestone A2 physical traffic capacity A/B — exactly two versus three
 * concurrent passing reservations. Both use identical 2D physics, road width,
 * rider attributes and unchanged discrete full crossing policy. OFFLINE ONLY.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_A2_CAPACITY_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const data=batch26Input(fixture),dir=process.env.V3_A2_CAPACITY_DIR??'/tmp/v3-a2-capacity'
mkdirSync(dir,{recursive:true})
const cp=(r)=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wprime=(r)=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const base=data.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:cp(r),wPrimeJoules:wprime(r),tactic:i%6===0?'attack':'tempo'}))
const swapped=structuredClone(base)
;[swapped[0].lane,swapped[1].lane]=[swapped[1].lane,swapped[0].lane]
const r6=x=>Math.round(x*1e6)/1e6
function compare(a,b){
 const rank=new Map(b.finish.map(x=>[x.riderId,x.rank]))
 let changed=0,inversions=0
 for(let i=0;i<a.finish.length;i++){
  const x=a.finish[i];changed+=Number(rank.get(x.riderId)!==x.rank)
  for(let j=i+1;j<a.finish.length;j++)inversions+=Number(rank.get(x.riderId)>rank.get(a.finish[j].riderId))
 }
 const pairs=a.finish.length*(a.finish.length-1)/2
 return {changedRanks:changed,pairInversions:inversions,pairs,inversionPercent:r6(inversions/pairs*100),winnerChanged:a.finish[0].riderId!==b.finish[0].riderId}
}
const results=[]
for(const [name,riders] of [['original',base],['two_rider_lane_swap',swapped]]){
 const input={riders,route:data.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,experimentalPriorityPolicy:'rider_id',capacity:3,dt:10,quality:'synthetic_research'}
 let state=initializeCoupled2DResearchV3(input),checkpoint=null
 const maxTicks=Math.ceil(state.input.finishDistanceMeters/25)+1200
 while(!state.complete){
  state=advanceCoupled2DResearchV3(state,24)
  if(!checkpoint&&state.finish.length===0&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.4))checkpoint=JSON.parse(JSON.stringify(state))
  assert(state.tick<maxTicks,'Too many full-race ticks')
 }
 assert(checkpoint)
 const summary=summarizeCoupled2DResearchV3(state)
 assert(summary.stageFinished&&summary.finish.length===base.length&&summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
 let restored=checkpoint,steps=0
 while(!restored.complete){restored=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(restored,[11,7,29,5][steps%4])));assert(++steps<maxTicks,'Excessive recovery batches')}
 assert.deepEqual(restored,state,'Capacity 3 final state not reproducible')
 assert.deepEqual(advanceCoupled2DResearchV3(state,1),state,'Completed race mutable')
 results.push({name,finish:summary.finish,statistics:{winner:summary.finish[0].riderId,winningSeconds:summary.finish[0].finishSeconds,lastGapSeconds:summary.finish.at(-1).gapSeconds,blockedRiderTicks:summary.metrics.blockedRiderTicks,passingAttempts:summary.metrics.reservationsStarted,completedPasses:summary.metrics.completedPasses,abortedPasses:summary.metrics.abortedPasses,maxConcurrentReservations:summary.metrics.concurrentPeak,first30MetreSplitSeconds:summary.first30mGapSecond,checkpointExact:true,fullStageTicks:state.tick}})
 console.log(JSON.stringify({fixture,capacity:3,scenario:name,riders:summary.finish.length,...results.at(-1).statistics,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
}
const capacityThree=compare(results[0],results[1])
const prior=fixture.startsWith('dordrecht')?{capacityTwoPairInversions:746,capacityTwoPairSharePercent:13.405211,capacityTwoRanksChanged:102,capacityTwoWinnerOriginal:'r004',capacityTwoWinnerSwap:'r001'}:{capacityTwoPairInversions:3925,capacityTwoPairSharePercent:27.979755,capacityTwoRanksChanged:163,capacityTwoWinnerOriginal:'r013',capacityTwoWinnerSwap:'r079'}
const out={experiment:'MILESTONE_A2_CAPACITY_THREE_FULL_STAGE',fixture,roster:base.length,officialWrites:0,sportingApproval:'NOT_APPROVED',sourceNoProductionWrites:true,comparedBaselineProvenance:'Milestone A2 complete fixed-ID capacity 2, confirmed against A1',priorCapacityTwo:prior,capacityThree,deltaInvertedPercentagePoints:r6(capacityThree.inversionPercent-prior.capacityTwoPairSharePercent),results,limitations:['Three simultaneous passing reservations do not calibrate rider width or road geometry','Measured inversions are between two starting grids, not real historical result predictiveness','Both finishes are synthetic and route grade/ascent is incomplete','No in-game race selector, stage scheduling or database writes occurred']}
const file=dir+'/'+fixture+'-capacity3.json'
writeFileSync(file,JSON.stringify(out,null,2)+'\n')
console.log(JSON.stringify({fixture,milestone:'A2 simultaneous overtaking capacity',capacityThree,deltaInvertedPercentagePoints:out.deltaInvertedPercentagePoints,officialWrites:0,sportingApproval:'NOT_APPROVED',file}))
