/** A2 independent, offline-only start-row confinement diagnostic.
 * Observes existing solver state; changes no physics, defaults, gameplay or SQL.
 * Run with V3_A2_CONFINEMENT_FIXTURE and optionally V3_A2_CONFINEMENT_DIR.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'

const fixture=process.env.V3_A2_CONFINEMENT_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const source=batch26Input(fixture),r6=x=>Math.round(x*1e6)/1e6
const cp=r=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wprime=r=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const riders=source.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:cp(r),wPrimeJoules:wprime(r),tactic:i%6===0?'attack':'tempo'}))
const n=riders.length
const startOrder=[...riders].sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
const initialRank=new Map(startOrder.map((r,i)=>[r.riderId,i]))
const quartile=rank=>Math.min(3,Math.floor(4*rank/n))
const initialWheel=new Map(startOrder.map(r=>{
 const front=startOrder.filter(x=>x.lane===r.lane&&x.meters>r.meters).sort((a,b)=>a.meters-b.meters)[0]
 return [r.riderId,front?.riderId??null]
}))
const counters=new Map(riders.map(r=>[r.riderId,{
 snapshots:0,sameStartingQuartile:0,absoluteRankStep:0,rankChangedSnapshots:0,
 forwardRankStep:0,backwardRankStep:0,frontWheelObserved:0,originalFrontWheelObserved:0,
 sampledBlocked:0,sampledBehindOriginalWheel:0,maxDisplacementFromStart:0
}]))
let previousRanks=new Map(initialRank),snapshots=0,pairInversionsSum=0,maxPairInversions=0
const checkpoints=[]
const stateInput={riders,route:source.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,dt:10,quality:'synthetic_research'}
let state=initializeCoupled2DResearchV3(stateInput)
assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
while(!state.complete){
 assert(state.tick<5000,'Exceeded full-stage tick budget')
 state=advanceCoupled2DResearchV3(state,12)
 // Use fixed-roster rank observations until first finisher; all other ticks
 // still advance to the finish and are covered by the terminal assertions.
 if(state.finish.length>0)continue
 const order=state.riders.slice().sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
 assert(order.length===n)
 const ranks=new Map(order.map((r,i)=>[r.riderId,i]))
 let inversions=0
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  if(initialRank.get(order[i].riderId)>initialRank.get(order[j].riderId))inversions++
 }
 pairInversionsSum+=inversions
 maxPairInversions=Math.max(maxPairInversions,inversions)
 for(const [rank,r] of order.entries()){
  const s=counters.get(r.riderId)
  const delta=previousRanks.get(r.riderId)-rank
  s.snapshots++
  s.sameStartingQuartile+=Number(quartile(rank)===quartile(initialRank.get(r.riderId)))
  s.absoluteRankStep+=Math.abs(delta)
  s.rankChangedSnapshots+=Number(delta!==0)
  s.forwardRankStep+=Math.max(delta,0)
  s.backwardRankStep+=Math.max(-delta,0)
  s.maxDisplacementFromStart=Math.max(s.maxDisplacementFromStart,Math.abs(initialRank.get(r.riderId)-rank))
  s.sampledBlocked+=Number(r.blockedStreak>0)
  s.sampledBehindOriginalWheel+=Number(r.blockedStreak>0&&r.blockedLeader===initialWheel.get(r.riderId))
  const wheel=order.filter(x=>x.riderId!==r.riderId&&x.meters>r.meters&&x.meters-r.meters<18&&Math.abs(x.y-r.y)<=1.3).sort((a,b)=>a.meters-b.meters)[0]
  s.frontWheelObserved+=Number(!!wheel)
  s.originalFrontWheelObserved+=Number(!!wheel&&wheel.riderId===initialWheel.get(r.riderId))
 }
 snapshots++
 previousRanks=ranks
 if(snapshots%10===0)checkpoints.push({tick:state.tick,elapsedSeconds:state.elapsedSeconds,pairInversions:inversions,blockedRiderTicks:state.metrics.blockedRiderTicks,completedPasses:state.metrics.completedPasses})
}
const summary=summarizeCoupled2DResearchV3(state)
assert(summary.stageFinished&&summary.finish.length===n&&summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
// Assert byte-compatible core control outcomes from the prior capacity-three
// A2 full-stage run. The instrumentation may not change solver results.
const control={
 'dordrecht-2000-10-15':{winner:'r003',tail:1193.300376},
 'guangxi-2000-10-19':{winner:'r003',tail:1231.182305},
}[fixture]
assert.equal(summary.finish[0].riderId,control.winner,'Baseline winner changed')
assert(Math.abs(summary.finish.at(-1).gapSeconds-control.tail)<1e-5,'Baseline finishing gap changed')
const all=[...counters.values()],sum=k=>all.reduce((a,s)=>a+s[k],0)
const denominator=sum('snapshots'),pairCount=n*(n-1)/2
assert(snapshots>0&&denominator===snapshots*n)
const result={
 study:'A2_START_ROW_CONFINEMENT_OBSERVATION',fixture,riders:n,officialWrites:0,
 sportingApproval:'NOT_APPROVED',baselineParity:true,stageFinished:true,
 sourceQuality:'synthetic_research',capacity:3,steering:true,sampleEveryTicks:12,
 observationsBeforeFirstFinisher:snapshots,riderObservations:denominator,
 startingQuartileRetentionPercent:r6(100*sum('sameStartingQuartile')/denominator),
 rankChangedSamplePercent:r6(100*sum('rankChangedSnapshots')/denominator),
 meanAbsoluteRankChangePerObservation:r6(sum('absoluteRankStep')/denominator),
 meanInitialPairInversionPercent:r6(100*pairInversionsSum/snapshots/pairCount),
 maxInitialPairInversionPercent:r6(100*maxPairInversions/pairCount),
 sampledBlockedPercent:r6(100*sum('sampledBlocked')/denominator),
 originalFrontWheelShareWhenWheelPresentPercent:sum('frontWheelObserved')?r6(100*sum('originalFrontWheelObserved')/sum('frontWheelObserved')):null,
 blockedBehindOriginalWheelSharePercent:sum('sampledBlocked')?r6(100*sum('sampledBehindOriginalWheel')/sum('sampledBlocked')):null,
 maxDisplacementFromStart:Math.max(...all.map(x=>x.maxDisplacementFromStart)),
 blockedRiderTicks:summary.metrics.blockedRiderTicks,completedSteeringManeuvers:summary.metrics.completedPasses,
 abortedSteeringManeuvers:summary.metrics.abortedPasses,winner:summary.finish[0].riderId,
 lastRiderGapSeconds:summary.finish.at(-1).gapSeconds,fullStageTicks:state.tick,
 perRider:[...counters].map(([riderId,v])=>({riderId,startRank:initialRank.get(riderId)+1,finishRank:summary.finish.find(x=>x.riderId===riderId).rank,...v})),
 checkpoints,
 limitations:[
  'Sampling every 12 ticks may miss brief overtakes or wheel changes',
  'Ranks moving are not equivalent to physically verified overtakes',
  'Observation stops before first finisher to maintain fixed roster',
  'Original wheel is the initially nearest same-lane bicycle ahead, not necessarily a real drafting neighbor',
  'Synthetic rider tactics, road widths and climbing; not a historical sporting benchmark',
  'No independent checkpoint recovery performed in this observation; prior A2 suites validate it',
 ]
}
const dir=process.env.V3_A2_CONFINEMENT_DIR??'/tmp/v3-a2-confinement'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/'+fixture+'-row-confinement.json',JSON.stringify(result,null,2)+'\n')
const {perRider,checkpoints:storedCheckpoints,...headline}=result
console.log(JSON.stringify({...headline,perRiderRows:perRider.length,checkpointSamples:storedCheckpoints.length}))
