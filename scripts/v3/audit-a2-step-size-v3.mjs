/** A2 dt numerical/behavioral sensitivity audit, existing physics untouched.
 * Full 106/168-rider stages at 10s and 5s, each with 3 starting grids.
 * IMPORTANT: fixed reaction/steering tick counts and +/-0.9 m/s per tick
 * mean dt5 also changes physical decision/acceleration timing. Therefore this
 * is sensitivity of the as-implemented model, NOT an isolated convergence proof.
 * This module never writes to an official race, user database, or live clock.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'

const fixture=process.env.V3_A2_DT_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const dir=process.env.V3_A2_DT_DIR??'/tmp/v3-a2-step-size'
mkdirSync(dir,{recursive:true})
const data=batch26Input(fixture),r6=x=>Math.round(x*1e6)/1e6
const cp=r=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wp=r=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const base=data.riders.map((r,i)=>({
 riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,
 cpWatts:cp(r),wPrimeJoules:wp(r),tactic:i%6===0?'attack':'tempo'
}))
const swapped=structuredClone(base)
;[swapped[0].lane,swapped[1].lane]=[swapped[1].lane,swapped[0].lane]
const rotated=base.map(r=>({...r,lane:(r.lane+1)%4}))
const grids=[['original',base],['two_rider_lane_swap',swapped],['all_lanes_rotated',rotated]]
function compare(a,b){
 assert.equal(a.finish.length,b.finish.length)
 const ranks=new Map(b.finish.map(x=>[x.riderId,x.rank]))
 let changed=0,inversions=0
 for(let i=0;i<a.finish.length;i++){
  const id=a.finish[i].riderId
  assert(ranks.has(id),'Missing matching finisher')
  changed+=Number(ranks.get(id)!==i+1)
  for(let j=i+1;j<a.finish.length;j++)inversions+=Number(ranks.get(id)>ranks.get(a.finish[j].riderId))
 }
 const pairs=a.finish.length*(a.finish.length-1)/2
 return {changedRanks:changed,pairInversions:inversions,pairs,inversionPercent:r6(100*inversions/pairs),winnerChanged:a.finish[0].riderId!==b.finish[0].riderId}
}
const cases=[],failures=[]
for(const dt of [10,5])for(const [grid,roster] of grids){
 const started=performance.now()
 try{
  const settings={riders:roster,route:data.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,dt,quality:'synthetic_research'}
  let state=initializeCoupled2DResearchV3(settings),checkpoint=null
  const maxTicks=Math.ceil(state.input.finishDistanceMeters/12)+1500
  while(!state.complete){
   state=advanceCoupled2DResearchV3(state,24)
   if(!checkpoint&&state.finish.length===0&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.4))checkpoint=JSON.parse(JSON.stringify(state))
   assert(state.tick<maxTicks,'Full-stage tick budget exceeded')
  }
  assert(checkpoint,'No mid-race checkpoint captured')
  const summary=summarizeCoupled2DResearchV3(state)
  assert(summary.stageFinished&&summary.finish.length===base.length)
  assert(summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&Number.isFinite(r.energyRemainingJ)&&r.energyRemainingJ>=0))
  assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
  let restored=checkpoint,count=0
  while(!restored.complete){
   restored=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(restored,[11,7,29,5][count%4])))
   assert(++count<maxTicks,'Recovery loop exceeded budget')
  }
  assert.deepEqual(restored,state,'Non-deterministic mid-stage recovery')
  assert.deepEqual(advanceCoupled2DResearchV3(state,1),state,'Completed race changed')
  assert(summary.metrics.achievedMeters<=summary.metrics.commandedMeters+1e-3)
  const metrics={
   winner:summary.finish[0].riderId,winningSeconds:summary.finish[0].finishSeconds,
   lastRiderGapSeconds:summary.finish.at(-1).gapSeconds,
   blockedRiderTicks:summary.metrics.blockedRiderTicks,preventedMeters:r6(summary.metrics.preventedMeters),
   passingReservations:summary.metrics.reservationsStarted,completedPasses:summary.metrics.completedPasses,
   abortedPasses:summary.metrics.abortedPasses,peakReservations:summary.metrics.concurrentPeak,
   mechanicalEnergyJ:r6(summary.metrics.energyJ),
   minimumFinishWPrimeJ:r6(Math.min(...summary.finish.map(r=>r.energyRemainingJ))),
   first30MetreSplitSeconds:summary.first30mGapSecond,fullStageTicks:state.tick,
   wallClockSeconds:r6((performance.now()-started)/1000),checkpointExact:true
  }
  cases.push({dt,grid,metrics,finish:summary.finish})
  console.log(JSON.stringify({fixture,dt,grid,riders:base.length,...metrics,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }catch(e){
  const error={dt,grid,error:String(e?.stack??e),elapsedWallSeconds:r6((performance.now()-started)/1000)}
  failures.push(error)
  console.error(JSON.stringify({fixture,failed:error,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
 }
}
const baseline={'dordrecht-2000-10-15':{winner:'r003',gap:1193.300376},'guangxi-2000-10-19':{winner:'r003',gap:1231.182305}}[fixture]
let metrics=null
if(failures.length===0){
 assert.equal(cases.length,6)
 assert.equal(cases[0].metrics.winner,baseline.winner,'10s control winner changed')
 assert(Math.abs(cases[0].metrics.lastRiderGapSeconds-baseline.gap)<1e-5,'10s control gap changed')
 const ten={swap:compare(cases[0],cases[1]),rotation:compare(cases[0],cases[2])}
 const five={swap:compare(cases[3],cases[4]),rotation:compare(cases[3],cases[5])}
 const dtSensitivity=Object.fromEntries(grids.map(([grid],i)=>[grid,compare(cases[i],cases[i+3])]))
 metrics={
  tenSecond:ten,fiveSecond:five,dtSensitivity,
  changes:{
   twoRiderSwapInversionPercentagePoints:r6(five.swap.inversionPercent-ten.swap.inversionPercent),
   rotationInversionPercentagePoints:r6(five.rotation.inversionPercent-ten.rotation.inversionPercent),
   originalLastGapDeltaSeconds:r6(cases[3].metrics.lastRiderGapSeconds-cases[0].metrics.lastRiderGapSeconds),
   originalMechanicalEnergyDeltaJ:r6(cases[3].metrics.mechanicalEnergyJ-cases[0].metrics.mechanicalEnergyJ),
   originalBlockedRiderTicksDelta:cases[3].metrics.blockedRiderTicks-cases[0].metrics.blockedRiderTicks
  }
 }
}
const report={
 experiment:'MILESTONE_A2_TIME_STEP_SENSITIVITY',fixture,roster:base.length,
 gate:failures.length?'TECHNICAL_FAIL':'TECHNICAL_PASS',sportingApproval:'NOT_APPROVED',officialWrites:0,
 simulatedPhysics:'unchanged offline coupled2DResearchV3',
 numericalInterpretation:'5s vs 10s is confounded by fixed two-tick reaction, three-tick steering and per-tick speed-ramp rules',
 physicalTiming:{tenSecond:{reactionSeconds:20,steeringSeconds:30,maxPerTickSpeedChangeMps:.9},
 fiveSecond:{reactionSeconds:10,steeringSeconds:15,maxPerTickSpeedChangeMps:.9}},
 metrics,cases,failures,
 limitations:[
  'This tests as-implemented step-size sensitivity, not numerical convergence with identical real-time controls',
  'Sequential priority collision resolution is unchanged; its independent contribution cannot be isolated here',
  'Synthetic five-meter road and rider attributes, with missing source elevation',
  'Finish energy is charged for the whole crossing tick rather than the exact fractional finish time',
  'Pair inversions measure sensitivity, not sufficient proof of authentic racing or stage groups',
  'No production engine or official race results are updated'
 ]
}
const file=dir+'/'+fixture+'-step-size.json'
writeFileSync(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,status:report.gate,comparison:metrics,failures:failures.length,officialWrites:0,sportingApproval:'NOT_APPROVED',file}))
assert.equal(failures.length,0,'Full-stage step-size validation failed; see archived report and logs')
