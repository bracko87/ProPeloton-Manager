/** Controlled A2 full-stage admission experiment; offline-only and non-authoritative. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_A2_ADMISSION_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const data=batch26Input(fixture),dir=process.env.V3_A2_ADMISSION_DIR??'/tmp/v3-a2-local-admission'
mkdirSync(dir,{recursive:true})
const cp=r=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wp=r=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const riders=data.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:cp(r),wPrimeJoules:wp(r),tactic:i%6===0?'attack':'tempo'}))
const swapped=structuredClone(riders)
;[swapped[0].lane,swapped[1].lane]=[swapped[1].lane,swapped[0].lane]
const r6=x=>Math.round(x*1e6)/1e6
function comparison(a,b){
 const ranks=new Map(b.finish.map(x=>[x.riderId,x.rank]))
 let changed=0,flips=0
 for(let i=0;i<a.finish.length;i++){
  const id=a.finish[i].riderId
  changed+=Number(ranks.get(id)!==i+1)
  for(let j=i+1;j<a.finish.length;j++)flips+=Number(ranks.get(id)>ranks.get(a.finish[j].riderId))
 }
 const pairs=a.finish.length*(a.finish.length-1)/2
 return {changedRanks:changed,pairInversions:flips,pairs,inversionPercent:r6(100*flips/pairs),winnerChanged:a.finish[0].riderId!==b.finish[0].riderId}
}
const results=[]
for(const policy of ['global','local_30m'])for(const [name,grid] of [['original',riders],['two_rider_lane_swap',swapped]]){
 const input={riders:grid,route:data.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,experimentalPassingAdmissionPolicy:policy,dt:10,quality:'synthetic_research'}
 let state=initializeCoupled2DResearchV3(input),checkpoint=null
 const limit=Math.ceil(state.input.finishDistanceMeters/25)+1200
 let mobilitySnapshots=0,sampledOrderChanges=0,previous=null
 while(!state.complete){
  state=advanceCoupled2DResearchV3(state,24)
  assert(state.tick<limit,'Full-stage tick limit')
  if(!checkpoint&&state.finish.length===0&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.4))checkpoint=JSON.parse(JSON.stringify(state))
  if(!state.finish.length){
   const positions=state.riders.slice().sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
   const ranks=new Map(positions.map((r,i)=>[r.riderId,i]))
   if(previous)sampledOrderChanges+=positions.filter(r=>previous.get(r.riderId)!==ranks.get(r.riderId)).length
   previous=ranks;mobilitySnapshots++
  }
 }
 const summary=summarizeCoupled2DResearchV3(state)
 assert(summary.stageFinished&&summary.finish.length===riders.length&&summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
 assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED'&&checkpoint)
 if(policy==='local_30m'){
  let recovery=checkpoint,i=0
  while(!recovery.complete){recovery=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(recovery,[11,7,29,5][i%4])));assert(++i<limit)}
  assert.deepEqual(recovery,state,'Local admission full-stage checkpoint mismatch')
 }
 const metrics={winner:summary.finish[0].riderId,winnerSeconds:summary.finish[0].finishSeconds,tailGapSeconds:summary.finish.at(-1).gapSeconds,blockedRiderTicks:summary.metrics.blockedRiderTicks,completedPasses:summary.metrics.completedPasses,abortedPasses:summary.metrics.abortedPasses,reservationsStarted:summary.metrics.reservationsStarted,concurrentPeak:summary.metrics.concurrentPeak,first30MetreSplitSeconds:summary.first30mGapSecond,fullStageTicks:state.tick,mobilitySnapshots,sampledRankChanges:sampledOrderChanges,checkpointRecovered:policy==='local_30m'}
 const result={policy,name,metrics,finish:summary.finish}
 results.push(result)
 console.log(JSON.stringify({fixture,policy,scenario:name,riders:riders.length,...metrics,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
}
const existingBaseline={'dordrecht-2000-10-15':{winner:'r003',gap:1193.300376},'guangxi-2000-10-19':{winner:'r003',gap:1231.182305}}[fixture]
assert.equal(results[0].metrics.winner,existingBaseline.winner,'Global baseline winner changed')
assert(Math.abs(results[0].metrics.tailGapSeconds-existingBaseline.gap)<1e-5,'Global baseline gap changed')
const globalSensitivity=comparison(results[0],results[1]),localSensitivity=comparison(results[2],results[3])
const change={inversionPercentagePoints:r6(localSensitivity.inversionPercent-globalSensitivity.inversionPercent),changedRanks:localSensitivity.changedRanks-globalSensitivity.changedRanks,originalTailGapSeconds:r6(results[2].metrics.tailGapSeconds-results[0].metrics.tailGapSeconds),originalBlockedTicks:results[2].metrics.blockedRiderTicks-results[0].metrics.blockedRiderTicks,originalCompletedPasses:results[2].metrics.completedPasses-results[0].metrics.completedPasses}
const report={study:'A2_SPATIALLY_LOCAL_PASSING_ADMISSION',fixture,roster:riders.length,sourceQuality:'synthetic_research',globalCapacity:3,localCapacity:3,localWindowMeters:30,officialWrites:0,sportingApproval:'NOT_APPROVED',globalSensitivity,localSensitivity,change,results,limitations:['Local cap is based on instantaneous longitudinal distance, not real stage-specific road width','Original and two-lane-swapped grids do not establish broad statistical robustness','Rank-change snapshots are not a count of collision-checked overtakes','Physical collision and energy handling are unchanged, but realism remains unapproved','Synthetic rider CP, tactics and incomplete terrain profiles are not historical race benchmarks']}
const file=dir+'/'+fixture+'-admission.json'
writeFileSync(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,globalSensitivity,localSensitivity,change,officialWrites:0,sportingApproval:'NOT_APPROVED',file}))
