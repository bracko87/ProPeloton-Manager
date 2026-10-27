/** Offline counterfactual A2 sequential-solve-order test at fixed dt=10.
 * This is a stress test of the front-first planner's dependence on treating
 * unsolved riders as stationary, NOT an approved rear-first racing solver.
 * All failures are recorded; no unsafe candidate is silently accepted.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {initializeCoupled2DResearchV3 as officialOfflineInitialize,advanceCoupled2DResearchV3 as officialOfflineAdvance,summarizeCoupled2DResearchV3 as officialOfflineSummary} from './coupled2DMicroV3.mjs'
import {initializeCoupled2DResearchV3 as probeInitialize,advanceCoupled2DResearchV3 as probeAdvance,summarizeCoupled2DResearchV3 as probeSummary} from './coupled2DOrderResearchV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_A2_ORDER_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const dir=process.env.V3_A2_ORDER_DIR??'/tmp/v3-a2-order'
mkdirSync(dir,{recursive:true})
const data=batch26Input(fixture),round=n=>Math.round(n*1e6)/1e6
const cp=r=>Math.max(160,Math.min(420,155+r.flat*1.15+(r.raceSharpness-50)*.2))
const wp=r=>Math.max(12000,Math.min(25000,10000+r.endurance*80))
const riders=data.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:cp(r),wPrimeJoules:wp(r),tactic:i%6===0?'attack':'tempo'}))
const swap=structuredClone(riders)
;[swap[0].lane,swap[1].lane]=[swap[1].lane,swap[0].lane]
const grids=[['original',riders],['two_rider_lane_swap',swap]]
const policies=['front_first','rear_first','alternate_ticks']
const runs=[]
function compare(a,b){
 const ranks=new Map(b.finish.map(x=>[x.riderId,x.rank]))
 let changed=0,inversions=0
 for(let i=0;i<a.finish.length;i++){
  const current=a.finish[i].riderId
  changed+=Number(ranks.get(current)!==i+1)
  for(let j=i+1;j<a.finish.length;j++)inversions+=Number(ranks.get(current)>ranks.get(a.finish[j].riderId))
 }
 return {changedRanks:changed,invertedPairs:inversions,inversionPercent:round(100*inversions/(a.finish.length*(a.finish.length-1)/2)),winnerChanged:a.finish[0].riderId!==b.finish[0].riderId}
}
for(const policy of policies)for(const [grid,roster] of grids){
 const started=performance.now()
 const input={riders:roster,route:data.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,capacity:3,dt:10,quality:'synthetic_research'}
 const record={policy,grid,technicalStatus:'UNKNOWN',officialWrites:0}
 let checkpoint=null
 try{
  const initial=policy==='front_first'?officialOfflineInitialize(input):probeInitialize({...input,experimentalMovementOrder:policy})
  const base=policy==='front_first'?probeInitialize(input):null
  if(base)assert.deepEqual(initial,base,'Canonical default checkpoint differs')
  let state=initial,tickLimit=Math.ceil(state.input.finishDistanceMeters/25)+1200
  while(!state.complete){
   state=(policy==='front_first'?officialOfflineAdvance:probeAdvance)(state,24)
   if(!checkpoint&&state.finish.length===0&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.4))checkpoint=JSON.parse(JSON.stringify(state))
   assert(state.tick<tickLimit,'Full stage exceeded tick budget')
  }
  const summary=(policy==='front_first'?officialOfflineSummary:probeSummary)(state)
  assert(summary.stageFinished&&summary.finish.length===riders.length&&summary.finish.every((r,i)=>r.rank===i+1&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
  assert(state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED')
  assert(checkpoint,'Missing controlled checkpoint')
  let restored=checkpoint,k=0
  while(!restored.complete){
   restored=JSON.parse(JSON.stringify((policy==='front_first'?officialOfflineAdvance:probeAdvance)(restored,[11,7,29,5][k%4])))
   assert(++k<tickLimit,'Restart exceeded tick budget')
  }
  assert.deepEqual(restored,state,'Unstable checkpoint recovery')
  if(policy==='front_first'){
   const known={'dordrecht-2000-10-15':{winner:'r003',gap:1193.300376},'guangxi-2000-10-19':{winner:'r003',gap:1231.182305}}[fixture]
   if(grid==='original'){assert.equal(summary.finish[0].riderId,known.winner);assert(Math.abs(summary.finish.at(-1).gapSeconds-known.gap)<1e-5)}
   // Also compare a full-stage independent copy, not merely 24 micro ticks.
   let independent=probeInitialize(input)
   while(!independent.complete){independent=probeAdvance(independent,24);assert(independent.tick<tickLimit)}
   assert.deepEqual(independent,state,'Research snapshot changed canonical full-stage physics')
  }
  record.technicalStatus='PASS'
  record.metrics={winner:summary.finish[0].riderId,lastGapSeconds:summary.finish.at(-1).gapSeconds,blockedRiderTicks:summary.metrics.blockedRiderTicks,preventedMeters:round(summary.metrics.preventedMeters),completedSteering:summary.metrics.completedPasses,abortedSteering:summary.metrics.abortedPasses,energyJ:round(summary.metrics.energyJ),fullStageTicks:state.tick,checkpointExact:true}
  record.finish=summary.finish
 }catch(e){
  record.technicalStatus='FAIL';record.failure={message:String(e?.message??e),name:String(e?.name??'Error')}
 }
 record.wallSeconds=round((performance.now()-started)/1000)
 runs.push(record)
 const {finish,...logged}=record
 console.log(JSON.stringify({fixture,...logged,sportingApproval:'NOT_APPROVED'}))
}
const by=(policy,grid)=>runs.find(x=>x.policy===policy&&x.grid===grid)
assert(runs.length===6,'Incomplete study coverage')
assert(by('front_first','original').technicalStatus==='PASS'&&by('front_first','two_rider_lane_swap').technicalStatus==='PASS','Canonical solver control failed')
const comparisons=Object.fromEntries(policies.map(policy=>{
 const a=by(policy,'original'),b=by(policy,'two_rider_lane_swap')
 return [policy,a.technicalStatus==='PASS'&&b.technicalStatus==='PASS'?compare(a,b):{status:'REJECTED_TECHNICALLY',original:a.technicalStatus,swap:b.technicalStatus}]
}))
const report={study:'A2_SEQUENTIAL_COLLISION_ORDER_STRESS',fixture,riders:riders.length,dtSeconds:10,syntheticRoadWidthM:5,officialWrites:0,sportingApproval:'NOT_APPROVED',canonicalControlPass:true,
 comparisons,runs,limitations:[
 'Reverse/alternating solves are stress tests, not physically valid collision-resolution policies',
 'Reversal changes treatment of unsolved static bicycle paths, revealing order dependence rather than solving it',
 'Only two grids; stage elevation, road width, calibrated rider physiology and finish-tick energy unresolved',
 'A passing technical check is necessary but not sufficient for stable sporting results',
 'Physics and production game selector are unchanged; all tests use a separate solver snapshot'
 ]}
const file=dir+'/'+fixture+'-solve-order.json'
writeFileSync(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({fixture,canonical:'PASS',comparisons,candidateFailures:runs.filter(x=>x.policy!=='front_first'&&x.technicalStatus==='FAIL').map(x=>({policy:x.policy,grid:x.grid,reason:x.failure.message})),file,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
