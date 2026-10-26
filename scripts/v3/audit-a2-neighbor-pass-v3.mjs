/** A2 neighbor-corridor lane preference versus left-first, over three starts.
 * Entirely offline. All capacity, collisions, W-prime and tactics unchanged.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_A2_CORRIDOR_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const data=batch26Input(fixture),dir=process.env.V3_A2_CORRIDOR_DIR??'/tmp/v3-a2-neighbor-corridor'
mkdirSync(dir,{recursive:true})
const cp=r=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wp=r=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const base=data.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:cp(r),wPrimeJoules:wp(r),tactic:i%6===0?'attack':'tempo'}))
const swap=structuredClone(base)
;[swap[0].lane,swap[1].lane]=[swap[1].lane,swap[0].lane]
const rotated=base.map(r=>({...r,lane:(r.lane+1)%4}))
const grids=[['original',base],['two_lane_swap',swap],['all_lanes_rotated',rotated]]
const r6=x=>Math.round(x*1e6)/1e6
function compare(a,b){
 const ranks=new Map(b.finish.map(x=>[x.riderId,x.rank]))
 let changed=0,inverted=0
 for(let i=0;i<a.finish.length;i++){
  const id=a.finish[i].riderId
  changed+=Number(ranks.get(id)!==i+1)
  for(let j=i+1;j<a.finish.length;j++)inverted+=Number(ranks.get(id)>ranks.get(a.finish[j].riderId))
 }
 const pairs=a.finish.length*(a.finish.length-1)/2
 return {changedRanks:changed,pairInversions:inverted,inversionPercent:r6(100*inverted/pairs),winnerChanged:a.finish[0].riderId!==b.finish[0].riderId}
}
const records=[]
for(const policy of ['left_first','neighbor_space'])for(const [grid,roster] of grids){
 const input={riders:roster,route:data.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,dt:10,quality:'synthetic_research',experimentalPassLanePolicy:policy}
 let state=initializeCoupled2DResearchV3(input),checkpoint=null
 const limit=Math.ceil(state.input.finishDistanceMeters/25)+1200
 while(!state.complete){
  state=advanceCoupled2DResearchV3(state,24)
  if(policy==='neighbor_space'&&!checkpoint&&state.finish.length===0&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.4))checkpoint=JSON.parse(JSON.stringify(state))
  assert(state.tick<limit,'Excessive full-stage ticks')
 }
 const summary=summarizeCoupled2DResearchV3(state)
 assert(summary.stageFinished&&summary.finish.length===base.length&&summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
 assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
 if(policy==='neighbor_space'){
  assert(checkpoint,'Midstage checkpoint absent')
  let recovered=checkpoint,k=0
  while(!recovered.complete){recovered=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(recovered,[11,7,29,5][k%4])));assert(++k<limit)}
  assert.deepEqual(recovered,state,'Full-stage candidate recovery changed final state')
 }
 const metrics={winner:summary.finish[0].riderId,winningSeconds:summary.finish[0].finishSeconds,lastGapSeconds:summary.finish.at(-1).gapSeconds,blockedRiderTicks:summary.metrics.blockedRiderTicks,completedPasses:summary.metrics.completedPasses,abortedPasses:summary.metrics.abortedPasses,first30mGapSecond:summary.first30mGapSecond,checkpointExact:policy==='neighbor_space'}
 records.push({policy,grid,finish:summary.finish,metrics})
 console.log(JSON.stringify({fixture,policy,grid,riders:base.length,...metrics,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
}
const expected={'dordrecht-2000-10-15':{winner:'r003',gap:1193.300376},'guangxi-2000-10-19':{winner:'r003',gap:1231.182305}}[fixture]
assert.equal(records[0].metrics.winner,expected.winner,'Historical control winner changed')
assert(Math.abs(records[0].metrics.lastGapSeconds-expected.gap)<1e-5,'Historical control gap changed')
const controls={swap:compare(records[0],records[1]),rotation:compare(records[0],records[2])}
const candidates={swap:compare(records[3],records[4]),rotation:compare(records[3],records[5])}
const changes={
 swapInversionPercentagePoints:r6(candidates.swap.inversionPercent-controls.swap.inversionPercent),
 rotationInversionPercentagePoints:r6(candidates.rotation.inversionPercent-controls.rotation.inversionPercent),
 originalGapDeltaSeconds:r6(records[3].metrics.lastGapSeconds-records[0].metrics.lastGapSeconds),
 originalBlockedTickDelta:records[3].metrics.blockedRiderTicks-records[0].metrics.blockedRiderTicks,
 originalCompletedPassDelta:records[3].metrics.completedPasses-records[0].metrics.completedPasses
}
const report={study:'A2_NEIGHBOR_SPACE_PASS_LANE',fixture,riderCount:base.length,officialWrites:0,sportingApproval:'NOT_APPROVED',roadGeometry:'synthetic_5m',globalReservationCapacity:3,control:controls,candidate:candidates,changes,records,limitations:['Neighbor-space scores use present measured positions without forecasting future route/traffic','Only three synthetic start grids tested','Lane steering maneuvers are not necessarily tactical passes','Historical terrain/road width and power inputs remain unverified']}
writeFileSync(dir+'/'+fixture+'-neighbor-space.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,control:controls,candidate:candidates,changes,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
