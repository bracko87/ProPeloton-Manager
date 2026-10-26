/** A2 seconds-normalized dt experiment, research only; no official writes.
 * Separate 10-second legacy (historical), 5-second legacy (confounded),
 * 5-second normalized (20s reaction, 30s steering, .09 m/s^2 acceleration).
 * Each uses three frozen initial lane layouts.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_A2_NORMALIZED_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const dir=process.env.V3_A2_NORMALIZED_DIR??'/tmp/v3-a2-normalized'
mkdirSync(dir,{recursive:true})
const data=batch26Input(fixture),r6=x=>Math.round(x*1e6)/1e6
const cp=r=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wp=r=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const roster=data.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:cp(r),wPrimeJoules:wp(r),tactic:i%6===0?'attack':'tempo'}))
const swap=structuredClone(roster)
;[swap[0].lane,swap[1].lane]=[swap[1].lane,swap[0].lane]
const rotation=roster.map(r=>({...r,lane:(r.lane+1)%4}))
const grids=[['original',roster],['two_rider_lane_swap',swap],['all_lanes_rotated',rotation]]
const policies=[{key:'dt10_legacy',dt:10,policy:'legacy'},{key:'dt5_legacy',dt:5,policy:'legacy'},{key:'dt5_normalized',dt:5,policy:'seconds_normalized'}]
function compare(a,b){
 const positions=new Map(b.finish.map(x=>[x.riderId,x.rank]))
 let changed=0,inversions=0
 for(let i=0;i<a.finish.length;i++){
  const x=a.finish[i];assert(positions.has(x.riderId));changed+=Number(positions.get(x.riderId)!==x.rank)
  for(let j=i+1;j<a.finish.length;j++)inversions+=Number(positions.get(x.riderId)>positions.get(a.finish[j].riderId))
 }
 const pairs=a.finish.length*(a.finish.length-1)/2
 return {changedRanks:changed,pairInversions:inversions,pairs,inversionPercent:r6(100*inversions/pairs),winnerChanged:a.finish[0].riderId!==b.finish[0].riderId}
}
const results=[],failures=[]
for(const {key,dt,policy} of policies)for(const [grid,riders] of grids){
 const start=performance.now()
 try{
  const settings={riders,route:data.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,dt,experimentalTimingPolicy:policy,quality:'synthetic_research'}
  let state=initializeCoupled2DResearchV3(settings),checkpoint=null
  const maxTicks=Math.ceil(state.input.finishDistanceMeters/12)+1500
  while(!state.complete){
   state=advanceCoupled2DResearchV3(state,24)
   if(!checkpoint&&state.finish.length===0&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.4))checkpoint=JSON.parse(JSON.stringify(state))
   assert(state.tick<maxTicks,'Stage tick budget exceeded')
  }
  assert(checkpoint,'Mid-stage checkpoint not captured')
  const summary=summarizeCoupled2DResearchV3(state)
  assert(summary.stageFinished&&summary.finish.length===roster.length&&summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
  assert(summary.metrics.achievedMeters<=summary.metrics.commandedMeters+1e-3)
  assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
  if(policy==='seconds_normalized'){
   let restored=checkpoint,i=0
   while(!restored.complete){restored=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(restored,[11,7,29,5][i%4])));assert(++i<maxTicks,'Checkpoint loop exceeded')}
   assert.deepEqual(restored,state,'5s normalized checkpoint recovery failed')
  }
  const metrics={
   winner:summary.finish[0].riderId,winningSeconds:summary.finish[0].finishSeconds,lastGapSeconds:summary.finish.at(-1).gapSeconds,
   blockedRiderSeconds:summary.metrics.blockedRiderTicks*dt,preventedMeters:r6(summary.metrics.preventedMeters),
   completedReservations:summary.metrics.completedPasses,abortedReservations:summary.metrics.abortedPasses,
   mechanicalEnergyJ:r6(summary.metrics.energyJ),first30mGapSecond:summary.first30mGapSecond,stageTicks:state.tick,
   checkpointExact:policy==='seconds_normalized',wallSeconds:r6((performance.now()-start)/1000)
  }
  results.push({key,grid,dt,policy,metrics,finish:summary.finish})
  console.log(JSON.stringify({fixture,key,grid,riders:roster.length,...metrics,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }catch(e){
  const failure={key,grid,error:String(e?.stack??e)}
  failures.push(failure);console.error(JSON.stringify({fixture,failure,officialWrites:0}))
 }
}
let comparisons=null
if(failures.length===0){
 assert.equal(results.length,9)
 const expected={'dordrecht-2000-10-15':{winner:'r003',gap:1193.300376},'guangxi-2000-10-19':{winner:'r003',gap:1231.182305}}[fixture]
 assert.equal(results[0].metrics.winner,expected.winner,'Historic 10s winner changed')
 assert(Math.abs(results[0].metrics.lastGapSeconds-expected.gap)<1e-5,'Historic 10s gap changed')
 const groups={}
 for(let i=0;i<policies.length;i++){
  const base=i*3
  groups[policies[i].key]={swap:compare(results[base],results[base+1]),rotation:compare(results[base],results[base+2])}
 }
 const normalizedVsTen=Object.fromEntries(grids.map(([grid],i)=>[grid,compare(results[i],results[i+6])]))
 const normalizedVsFive=Object.fromEntries(grids.map(([grid],i)=>[grid,compare(results[i+3],results[i+6])]))
 const deltas={
  swapVsTenPercentPoints:r6(groups.dt5_normalized.swap.inversionPercent-groups.dt10_legacy.swap.inversionPercent),
  rotationVsTenPercentPoints:r6(groups.dt5_normalized.rotation.inversionPercent-groups.dt10_legacy.rotation.inversionPercent),
  swapVsUnnormalizedFivePercentPoints:r6(groups.dt5_normalized.swap.inversionPercent-groups.dt5_legacy.swap.inversionPercent),
  rotationVsUnnormalizedFivePercentPoints:r6(groups.dt5_normalized.rotation.inversionPercent-groups.dt5_legacy.rotation.inversionPercent),
  originalTailGapVsTenSeconds:r6(results[6].metrics.lastGapSeconds-results[0].metrics.lastGapSeconds),
  originalBlockedSecondsVsTen:results[6].metrics.blockedRiderSeconds-results[0].metrics.blockedRiderSeconds,
  originalMechanicalEnergyVsTenJ:r6(results[6].metrics.mechanicalEnergyJ-results[0].metrics.mechanicalEnergyJ)
 }
 comparisons={withinGridSensitivity:groups,normalizedVsTen,normalizedVsLegacyFive:normalizedVsFive,deltas}
}
const report={
 study:'MILESTONE_A2_SECONDS_NORMALIZED_DT',fixture,riderCount:roster.length,
 gate:failures.length?'TECHNICAL_FAIL':'TECHNICAL_PASS',sportingApproval:'NOT_APPROVED',officialWrites:0,
 controlDurationSeconds:{reaction:20,steering:30},accelerationMps2:.09,
 noSolverSwitch:true,comparisons,results,failures,
 caveats:['Real-time reaction/steering/acceleration envelopes equalized but discrete blocking, collision order and energy integration still differ by dt','Count of blocked rider seconds includes sampled blocked ticks and is not exact rider dwell time','No source-verified road widths or elevation, calibrated tactics, or full historical performance benchmarks','Sub-tick finish W-prime accounting remains provisional','Intermediate 5s legacy scenarios are included to isolate timing-control effects; do not use as approved game racing physics']
}
const file=dir+'/'+fixture+'-normalized-dt.json'
writeFileSync(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,gate:report.gate,comparisons,failures:failures.length,officialWrites:0,sportingApproval:'NOT_APPROVED',file}))
assert.equal(failures.length,0,'One or more full-stage simulations failed')
