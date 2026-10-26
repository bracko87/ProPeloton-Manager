/** Batch 33 OFFLINE: first positional, wheel and group divergence after a lane-row swap. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupledV3,advanceCoupledV3,finalizeCoupledV3,runCoupledV3} from '../../src/race-engine-v3/coupledRoadRaceResearchV3.ts'
import {batch26Input} from './batch26FixtureV3.mjs'
import {compareFinishOrderV3} from './finishOrderSensitivityV3.mjs'
import {pairedFirstDivergenceV3,verifyLaneRowSwapV3} from './pairedFirstDivergenceV3.mjs'
const fixture=process.env.V3_BATCH33_FIXTURE??'dordrecht-2000-10-15'
const mode=process.env.V3_BATCH33_MODE??'energy'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
assert(['energy','finite_pass'].includes(mode))
const source=batch26Input(fixture),outputDir=process.env.V3_BATCH33_OUT_DIR??'/tmp/v3-batch33'
mkdirSync(outputDir,{recursive:true})
const round=x=>Math.round(x*1e6)/1e6
const snap=state=>state.riders.map(r=>({riderId:r.riderId,meters:r.meters,lane:r.lane,wheelLimitedTicks:r.wheelLimitedTicks}))
function swapMiddleRow(state){
 const before=state.riders.map(r=>({...r}))
 const sorted=[...state.riders].sort((a,b)=>a.meters-b.meters||a.lane-b.lane||a.riderId.localeCompare(b.riderId))
 const level=sorted[Math.floor(sorted.length/2)].meters
 const row=sorted.filter(r=>Math.abs(r.meters-level)<1e-8).sort((a,b)=>a.lane-b.lane||a.riderId.localeCompare(b.riderId))
 assert(row.length>=2&&row[0].lane!==row[1].lane,'Grid has no pair for lateral swap')
 const prev=row[0].lane;row[0].lane=row[1].lane;row[1].lane=prev
 const evidence=verifyLaneRowSwapV3(before,state.riders)
 assert(!state.riders.some((r,i)=>state.riders.slice(i+1).some(s=>r.lane===s.lane&&Math.abs(r.meters-s.meters)<1.8-1e-6)),'Unsafe starting grid')
 return evidence
}
function compareScenario(grid){
 const input={...source,seed:grid.seed,experimentalPowerDurationEnergy:true,...(mode==='finite_pass'?{experimentalFinitePassReservation:true}:{})}
 let a=initializeCoupledV3(input),b=structuredClone(a)
 const swap=swapMiddleRow(b)
 const events={firstMotion:null,firstMaterial1m:null,firstMaterial5m:null,firstBlock:null,firstLeader:null,firstGroupCount:null,firstGroupGap30m:null}
 const ticks=[],earlyDifferent=new Set(),earlyBlocked=new Set()
 let bothCompleteAt=0,restoredAt=null,restoreCopy=null
 const dt=input.tickSeconds??10
 for(let tick=1;!(a.complete&&b.complete);tick++){
  assert(tick<6000,'Unbounded research full race')
  const beforeA=snap(a),beforeB=snap(b)
  if(!a.complete)advanceCoupledV3(input,a,1)
  if(!b.complete)advanceCoupledV3(input,b,1)
  const difference=pairedFirstDivergenceV3(beforeA,snap(a),beforeB,snap(b),dt,1)
  const afterA=new Map(snap(a).map(r=>[r.riderId,r])),afterB=new Map(snap(b).map(r=>[r.riderId,r]))
  const stamp={tick,second:tick*dt,kmLeader:round(Math.max(...a.riders.map(r=>r.meters))/1000)}
  if(!events.firstMotion&&difference.motionDifferent>0)events.firstMotion={...stamp,differentRiders:difference.motionDifferent,maxAdvanceDifferenceMeters:difference.maxAdvanceDifferenceMeters}
  if(!events.firstMaterial1m&&difference.material.length>0)events.firstMaterial1m={...stamp,firstThree:difference.material.slice(0,3)}
  if(!events.firstBlock&&difference.blockEvents.length>0)events.firstBlock={...stamp,firstThree:difference.blockEvents.slice(0,3)}
  if(!events.firstLeader&&difference.leaderDifferent>0)events.firstLeader={...stamp,count:difference.leaderDifferent}
  if(!events.firstGroupCount&&difference.control.groups!==difference.perturbed.groups)events.firstGroupCount={...stamp,groupsControl:difference.control.groups,groupsPerturbed:difference.perturbed.groups}
  if(!events.firstGroupGap30m&&((difference.control.groups>1)!==(difference.perturbed.groups>1)))events.firstGroupGap30m={...stamp,groupsControl:difference.control.groups,groupsPerturbed:difference.perturbed.groups}
  if(!events.firstMaterial5m){
   const large=[...afterA].filter(([id,x])=>Math.abs(x.meters-afterB.get(id).meters)>=5)
   if(large.length)events.firstMaterial5m={...stamp,affectedRiders:large.length,firstThree:large.slice(0,3).map(([id,x])=>({id,deltaMeters:round(afterB.get(id).meters-x.meters)}))}
  }
  if(tick<=120){for(const x of difference.material)earlyDifferent.add(x.id);for(const x of difference.blockEvents)earlyBlocked.add(x.id)}
  if(tick<=180&&(tick===1||tick===3||tick%12===0))ticks.push({...stamp,differentPositions:difference.positionDifferent,differentMotion:difference.motionDifferent,differentBlocking:difference.blockedDifferent,changedWheelLeader:difference.leaderDifferent,materialMovement:difference.material.length,groupsControl:difference.control.groups,groupsPerturbed:difference.perturbed.groups,maxAdjacentGapControl:difference.control.maxAdjacentGapMeters,maxAdjacentGapPerturbed:difference.perturbed.maxAdjacentGapMeters})
  if(tick===121&&grid.label==='original'){restoreCopy=JSON.parse(JSON.stringify(b));restoredAt=tick}
  if(tick%71===0){a=JSON.parse(JSON.stringify(a));b=JSON.parse(JSON.stringify(b))}
  bothCompleteAt=tick
 }
 const baseline=finalizeCoupledV3(input,a),candidate=finalizeCoupledV3(input,b)
 assert.equal(candidate.officialWrites,0);assert.equal(candidate.sportingApproval,'NOT_APPROVED')
 assert.equal(candidate.finish.length,source.riders.length)
 if(grid.label==='original')assert.deepEqual(baseline,runCoupledV3(input),'Unmodified control differs from independent full race')
 if(restoreCopy){advanceCoupledV3(input,restoreCopy,100000);assert.deepEqual(finalizeCoupledV3(input,restoreCopy),candidate,'Perturbed checkpoint replay not exact')}
 const finish=compareFinishOrderV3(baseline.finish,candidate.finish)
 const rank=new Map(candidate.finish.map(r=>[r.riderId,r.rank]))
 const ranksA=new Map(baseline.finish.map(r=>[r.riderId,r.rank]))
 const affected=[...earlyDifferent].filter(id=>rank.get(id)!==ranksA.get(id)).length
 const energy={baselineWPrimeRemainingJ:baseline.powerDuration?.remainingWPrimeJoules,perturbedWPrimeRemainingJ:candidate.powerDuration?.remainingWPrimeJoules,mechanicalWorkDifferenceJ:round(candidate.movement.totalWorkJoules-baseline.movement.totalWorkJoules)}
 const report={grid:grid.label,seed:grid.seed,roster:source.riders.length,mode,swap,events,first180Ticks:ticks,early120TickStats:{ridersWithAtLeast1mMovementTickDifference:earlyDifferent.size,ridersWithChangedBlocking:earlyBlocked.size,theseWithChangedFinishRank:affected},finish:{changedRankCount:finish.changedRankCount,discordantPairs:finish.discordantPairs,discordantShare:finish.discordantShare,medianAbsoluteFinishChangeSeconds:finish.medianAbsoluteFinishChangeSeconds,maxAbsoluteFinishChangeSeconds:finish.maxAbsoluteFinishChangeSeconds,deltaTailGapSeconds:round(candidate.finish.at(-1).gapSeconds-baseline.finish.at(-1).gapSeconds),winnerControl:baseline.finish[0].riderId,winnerPerturbed:candidate.finish[0].riderId},blocking:{baseline:baseline.movement.wheelLimitedTicks,perturbed:candidate.movement.wheelLimitedTicks,delta:candidate.movement.wheelLimitedTicks-baseline.movement.wheelLimitedTicks},passing:{baseline:baseline.passingResearch,perturbed:candidate.passingResearch},energy,restartedBranchAtTick:restoredAt,completeTicks:bothCompleteAt,completeResultControl:baseline.finish,completeResultPerturbed:candidate.finish}
 console.log(JSON.stringify({fixture,mode,grid:grid.label,swap,events,first120Stats:report.early120TickStats,finish:report.finish,blockDelta:report.blocking.delta,checkpointExact:restoredAt!==null,officialWrites:0}))
 return report
}
const cases=[{label:'original',seed:source.seed},{label:'grid_B',seed:'batch28-research-grid-B'}].map(compareScenario)
const result={experiment:'BATCH33_OFFLINE_FIRST_DIVERGENCE',sourceQuality:'synthetic_research',fixture,mode,roster:source.riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',cases,limitations:['Paired lane-row swap is an initial-condition perturbation, not measured cyclist starting positions','Same-lane upstream wheel and blocking changes are observational, not proven causal chains','First group splits use adjacent geometric gaps >=30m, not validated breakaway groups','Guangxi synthetic profile omits 718m reported elevation gain','Dordrecht sprint-points orders approximated as tempo','One deterministic original seed and one alternative; no population-level confidence interval']}
writeFileSync(outputDir+'/'+fixture+'-'+mode+'-first-divergence.json',JSON.stringify(result,null,2)+'\n')
