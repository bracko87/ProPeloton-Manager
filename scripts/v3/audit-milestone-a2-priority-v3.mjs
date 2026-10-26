/** Milestone A2 — full-distance deterministic tie-priority and start-order sensitivity.
 * Strictly OFFLINE; never changes official race results, selectors or clocks.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {initializeCoupled2DResearchV3,advanceCoupled2DResearchV3,summarizeCoupled2DResearchV3} from './coupled2DMicroV3.mjs'
import {BATCH40_GEOMETRIES} from './roadWidthLookaheadV3.mjs'
import {batch26Input} from './batch26FixtureV3.mjs'
const fixture=process.env.V3_A2_FIXTURE??'dordrecht-2000-10-15'
assert(['dordrecht-2000-10-15','guangxi-2000-10-19'].includes(fixture))
const frozen=batch26Input(fixture),outdir=process.env.V3_A2_DIR??'/tmp/v3-a2'
mkdirSync(outdir,{recursive:true})
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x))
const r6=x=>Math.round(x*1e6)/1e6
const riders=frozen.riders.map((r,i)=>({riderId:r.riderId,meters:500-Math.floor(i/4)*2,lane:i%4,speedMps:0,cpWatts:clamp(155+r.flat*1.15+(r.raceSharpness-50)*.2,160,420),wPrimeJoules:clamp(10000+r.endurance*80,12000,25000),tactic:i%6===0?'attack':'tempo'}))
const swapped=structuredClone(riders);[swapped[0].lane,swapped[1].lane]=[swapped[1].lane,swapped[0].lane]
assert(swapped.every((r,i)=>r.riderId===riders[i].riderId&&r.meters===riders[i].meters&&r.cpWatts===riders[i].cpWatts&&r.tactic===riders[i].tactic))
function corr(x,y){
 assert(x.length===y.length&&x.length>4)
 const n=x.length,ax=x.reduce((a,v)=>a+v,0)/n,ay=y.reduce((a,v)=>a+v,0)/n
 const xy=x.reduce((a,v,i)=>a+(v-ax)*(y[i]-ay),0)
 const xx=x.reduce((a,v)=>a+(v-ax)**2,0),yy=y.reduce((a,v)=>a+(v-ay)**2,0)
 return xy/Math.sqrt(xx*yy)
}
function stat(result){
 const rankIndex=new Map(result.finish.map((x,i)=>[x.riderId,i+1]))
 const ranks=riders.map(r=>rankIndex.get(r.riderId)),starts=riders.map((r,i)=>i+1),powers=riders.map(r=>r.cpWatts)
 const rx=corr(starts,ranks),rz=corr(starts,powers),yz=corr(ranks,powers)
 const partial=(rx-rz*yz)/Math.sqrt((1-rz**2)*(1-yz**2))
 return {startRankPearson:r6(rx),powerFinishCorrelation:r6(yz),startPowerCorrelation:r6(rz),startRankAdjustedForCpWatts:r6(partial),topTenMeanStartingOrdinal:r6(result.finish.slice(0,10).reduce((a,r)=>a+starts.find((_,i)=>riders[i].riderId===r.riderId),0)/10)}
}
function compare(a,b){
 const br=new Map(b.finish.map(x=>[x.riderId,x.rank]))
 let inversions=0,rankChanges=0,shift=0
 for(let i=0;i<a.finish.length;i++){
  const u=a.finish[i],at=br.get(u.riderId)
  rankChanges+=Number(u.rank!==at);shift+=Math.abs(u.rank-at)
  for(let j=i+1;j<a.finish.length;j++)inversions+=Number(at>br.get(a.finish[j].riderId))
 }
 const pairs=a.finish.length*(a.finish.length-1)/2
 return {ranksChanged:rankChanges,meanAbsoluteRankShift:r6(shift/a.finish.length),pairInversions:inversions,totalPairs:pairs,invertedSharePercent:r6(100*inversions/pairs),winnerChanged:a.finish[0].riderId!==b.finish[0].riderId}
}
const scenarios=[]
for(const policy of ['rider_id','rotating_lane']){
 for(const grid of ['original','swapped']){
  const sample=grid==='original'?riders:swapped
  const input={riders:sample,route:frozen.route,geometry:BATCH40_GEOMETRIES[1],allowSteering:true,experimentalPriorityPolicy:policy,capacity:2,dt:10,quality:'synthetic_research'}
  let state=initializeCoupled2DResearchV3(input),snapshot=null,chunks=0
  const maxTicks=Math.ceil(state.input.finishDistanceMeters/25)+1200
  while(!state.complete){
   state=advanceCoupled2DResearchV3(state,24)
   chunks++
   if(!snapshot&&state.riders.some(r=>r.meters>state.input.finishDistanceMeters*.4)&&state.finish.length===0)snapshot=JSON.parse(JSON.stringify(state))
   assert(state.tick<maxTicks,'Unbounded complete 2D simulation')
   if(chunks%15===0)console.log(JSON.stringify({fixture,policy,grid,ticks:state.tick,finishers:state.finish.length,officialWrites:0}))
  }
  const summary=summarizeCoupled2DResearchV3(state)
  assert(summary.stageFinished&&summary.finish.length===riders.length)
  assert(summary.finish.every((r,i)=>r.rank===i+1&&r.finishSeconds>0&&Number.isFinite(r.finishSeconds)&&r.energyRemainingJ>=0))
  assert(snapshot)
  let resumed=snapshot,iterations=0
  while(!resumed.complete){
   resumed=JSON.parse(JSON.stringify(advanceCoupled2DResearchV3(resumed,[9,13,27,6][iterations%4])))
   assert(++iterations<maxTicks,'Unbounded recovery')
  }
  assert.deepEqual(resumed,state,'Priority-policy exact full-race restart failed')
  const reference={dordrecht:{original:['r004',11978.055549],swapped:['r001',11951.872259]},guangxi:{original:['r013',17649.792225],swapped:['r079',17701.394517]}}
  const known=reference[fixture.startsWith('dordrecht')?'dordrecht':'guangxi'][grid]
  if(policy==='rider_id')assert.deepEqual([summary.finish[0].riderId,summary.finish[0].finishSeconds],known,'Unchanged baseline historical full-race drift')
  const quality=stat(summary)
  scenarios.push({policy,grid,summary:{winner:summary.finish[0].riderId,winningSeconds:summary.finish[0].finishSeconds,tailGapSeconds:summary.finish.at(-1).gapSeconds,completedPasses:summary.metrics.completedPasses,blockedRiderTicks:summary.metrics.blockedRiderTicks,first30mGapSecond:summary.first30mGapSecond,quality},finish:summary.finish,checkpointExact:true,fullStateTicks:state.tick})
  console.log(JSON.stringify({fixture,policy,grid,finishers:summary.finish.length,quality,winner:summary.finish[0].riderId,tailGap:summary.finish.at(-1).gapSeconds,checkpointExact:true,officialWrites:0}))
 }
}
const oldOriginal=scenarios[0],oldSwapped=scenarios[1],newOriginal=scenarios[2],newSwapped=scenarios[3]
const baseline=compare(oldOriginal,oldSwapped),rotating=compare(newOriginal,newSwapped)
const outcome={experiment:'MILESTONE_A2_EQUAL_ROW_PRIORITY_FAIRNESS',fixture,roster:riders.length,officialWrites:0,sportingApproval:'NOT_APPROVED',technicalFullStageGate:true,policyDefaultUnchanged:true,baseline,rotating,deltaInvertedPercentagePoints:r6(rotating.invertedSharePercent-baseline.invertedSharePercent),scenarios,limitations:['This changes priority only for exactly equal longitudinal positions and cannot undo fundamental start-row advantage','No historical validation of realistic starting peloton position, power, road width or tempo','Alternative steering policy is experimental and not approved; default id tie-break is unchanged','First 30m geometric gap is not a validated sporting breakaway','Route source climbing (Guangxi 718m short, World Nations 1065m short) must be repaired separately','No official results, engine switch, game clock or Supabase writes']}
const file=outdir+'/'+fixture+'-a2-priority.json'
writeFileSync(file,JSON.stringify(outcome,null,2)+'\n')
console.log(JSON.stringify({fixture,milestone:'A2 priority test',status:'TECHNICAL_PASS_SPORTING_NO_GO',baseline,rotating,deltaInvertedPercentagePoints:outcome.deltaInvertedPercentagePoints,officialWrites:0,sportingApproval:'NOT_APPROVED',file}))
