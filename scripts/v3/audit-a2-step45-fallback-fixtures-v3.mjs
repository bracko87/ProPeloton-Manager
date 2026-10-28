/** A45: replay A44 exact configurations while inspecting individual fallback causes.
 * Tests source physical step sensitivity, identity/lateral symmetry,
 * swept space-time safety, exact replay and fixed commands.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as start,advanceSubstepPhysicalResearchV3 as move} from './a2SubstepPhysicalResearchV3.mjs'
import {resolveContactPriorityV3} from './a2CollisionPriorityResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const r6=x=>Math.round(x*1e6)/1e6
const policies=['symmetric_halving','symmetric_trapezoid_motion','trapezoid_rear_priority','trapezoid_lane_priority']
const quanta=[.5,1,2,2.5,5],counts=[2,8,12,24,32],variations=[0,1]
function initial(n,g,v,{mirror=false,names=null}={}){
 const maxY=r6((g.laneCount-1)*g.centerStepM)
 return Array.from({length:n},(_,i)=>({
  riderId:names?.get(i)??'r'+String(i).padStart(3,'0'),
  meters:100+i*6.4+v*2,
  y:mirror?Math.max(0,Math.min((g.laneCount-1)*g.centerStepM,r6(maxY-r6((i%g.laneCount)*g.centerStepM)))):(i%g.laneCount)*g.centerStepM,
  speedMps:4+i%4,cpWatts:210+(i%7)*18,wPrimeJoules:18000
 }))
}
function commanded(state,v,g,{mirror=false,idMap=null}={}){
 const maxY=(g.laneCount-1)*g.centerStepM,roundedMax=r6(maxY)
 return state.riders.map(r=>{
  const id=idMap?.get(r.riderId)??r.riderId
  const i=Number(id.slice(1)),lane=i%g.laneCount
  const step=state.tick%3===1&&(i+v)%4===0?-1:
   state.tick%3===2&&(i+v)%5===0?1:0
  const y=Math.min(maxY,r6(Math.max(0,Math.min(g.laneCount-1,lane+step))*g.centerStepM))
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+state.tick+v)%6,
   targetY:mirror?Math.max(0,Math.min(maxY,r6(roundedMax-y))):y,steeringWatts:35}
 })
}
function simulate(geometry,g,n,v,policy,quantum,{mirror=false,idMap=null,names=null,diagnostics=false}={}){
 const roster=initial(n,g,v,{mirror,names})
 let state=start({riders:roster,geometry,road:{gradePercent:[-3,0][v]},
  substeps:10/quantum,conflictPolicy:policy,diagnosticTrace:diagnostics})
 let checkpoint=null,nearStops=0,fallbackEntries=[]
 for(let tick=0;tick<6;tick++){
  const before=new Map(state.riders.map(x=>[x.riderId,x.meters]))
  const cmd=commanded(state,v,g,{mirror,idMap}),frozen=structuredClone(cmd)
  state=move(state,cmd)
  if(diagnostics){
   const trace=state.lastTickConflictTrace.filter(x=>x.kind==='priority_full_fallback')
   for(const entry of trace)fallbackEntries.push({tick,physicalStepSeconds:quantum,
    wallClockSimulationSeconds:tick*10+(entry.substep-1)*quantum,
    ...entry})
  }
  assert.deepEqual(cmd,frozen,'A44 source rider command was modified')
  assert.equal(auditObservedTrackSetV3(state.lastTickTracks,geometry).metrics.piecewiseCollisions,0,
   'A44 physical swept pair overlap')
  assert.equal(state.metrics.remainingPiecewiseOverlaps,0,'A44 accepted overlapping track')
  nearStops+=state.riders.filter(x=>x.meters-before.get(x.riderId)<.5).length
  if(tick===2)checkpoint=JSON.parse(JSON.stringify(state))
 }
 let rerun=checkpoint
 for(let tick=3;tick<6;tick++)rerun=move(rerun,commanded(rerun,v,g,{mirror,idMap}))
 assert.deepEqual(rerun,state,'A44 exact serialized midpoint replay failed')
 assert.equal(state.elapsedSeconds,60);assert.equal(state.officialWrites,0)
 assert.equal(state.sportingApproval,'NOT_APPROVED')
 assert(state.riders.every(x=>x.energy.seconds===60&&x.energy.remainingWPrimeJoules>=0&&
  Number.isFinite(x.energy.remainingWPrimeJoules)))
 assert(Math.abs(state.metrics.mechanicalJoules-state.riders.reduce((a,x)=>a+x.energy.cumulativeMechanicalJoules,0))<1e-5)
 const front=Math.max(...state.riders.map(x=>x.meters))
 return {riders:state.riders.map(x=>({id:idMap?.get(x.riderId)??x.riderId,
  x:x.meters,y:x.y,w:x.energy.remainingWPrimeJoules,
  gap:r6(front-x.meters)})),nearStops,metrics:state.metrics,fallbackEntries}
}
function delta(a,b,{mirror=false,maxY=0}={}){
 const map=new Map(b.riders.map(x=>[x.id,x]))
 let maxX=0,maxYdiff=0,maxGap=0,maxW=0,inversions=0
 for(const rider of a.riders){
  const q=map.get(rider.id);assert(q,'A44 missing physical rider identity')
  maxX=Math.max(maxX,Math.abs(rider.x-q.x))
  maxYdiff=Math.max(maxYdiff,Math.abs(rider.y-(mirror?r6(maxY-q.y):q.y)))
  maxW=Math.max(maxW,Math.abs(rider.w-q.w))
  maxGap=Math.max(maxGap,Math.abs(rider.gap-q.gap))
 }
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const p=a.riders[i],q=a.riders[j],bp=map.get(p.id),bq=map.get(q.id)
  const d=p.x-q.x,e=bp.x-bq.x
  if(Math.abs(d)>1e-6&&Math.abs(e)>1e-6&&d*e<0)inversions++
 }
 return {maxX:r6(maxX),maxY:r6(maxYdiff),maxGap:r6(maxGap),
  maxW:r6(maxW),inversions}
}

// This audit deliberately reproduces the 40 A44 configurations, but evaluates
// all per-fixture comparisons rather than relying on aggregate rank totals.
const cases=[],fallbacks=[],traceIdentity=[],failures=[],largeFieldLimit=[]
const quantaA45=[.5,1,2,2.5,5]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  try{
   const original=simulate(geometry,g,n,v,'symmetric_trapezoid_motion',.5)
   const rear=simulate(geometry,g,n,v,'trapezoid_rear_priority',.5,{diagnostics:true})
   const rearUntraced=simulate(geometry,g,n,v,'trapezoid_rear_priority',.5)
   assert.deepEqual(rear.riders,rearUntraced.riders,
    'A45 diagnostics changed accepted rear-priority outcomes')
   assert.deepEqual(rear.metrics,rearUntraced.metrics,
    'A45 diagnostic instrumentation changed numerical accounting')
   assert.equal(rear.metrics.priorityHardFallbacks,rear.fallbackEntries.length,
    'A45 fallback trace did not match official research counter')
   traceIdentity.push({road:g.id,n,v,physicsUnaffected:true,fallbacks:rear.fallbackEntries.length})
   const family={baseline:[original],rear:[rear]}
   for(const quantum of quantaA45.slice(1)){
    family.baseline.push(simulate(geometry,g,n,v,'symmetric_trapezoid_motion',quantum))
    family.rear.push(simulate(geometry,g,n,v,'trapezoid_rear_priority',quantum,{diagnostics:true}))
   }
   for(let i=0;i<quantaA45.length;i++){
    const q=quantaA45[i]
    const b=family.baseline[i],s=family.rear[i]
    const baseD=delta(original,b),rearD=delta(rear,s)
    const record={road:g.id,n,v,quantum:q,baseline:baseD,rear:rearD,
     improvement:{
      x:r6(baseD.maxX-rearD.maxX),
      gap:r6(baseD.maxGap-rearD.maxGap),
      wPrime:r6(baseD.maxW-rearD.maxW),
      inversions:baseD.inversions-rearD.inversions,
      noWorsePosition:rearD.maxX<=baseD.maxX+1e-6,
      noWorseGap:rearD.maxGap<=baseD.maxGap+1e-6,
      noWorseOrder:rearD.inversions<=baseD.inversions,
      allThree:rearD.maxX<=baseD.maxX+1e-6&&
       rearD.maxGap<=baseD.maxGap+1e-6&&rearD.inversions<=baseD.inversions
     },
     rearHardFallbacks:s.metrics.priorityHardFallbacks,
     rearYields:s.metrics.priorityRearYields,
     baselineNearStops:b.nearStops,rearNearStops:s.nearStops}
    cases.push(record)
    const events=i===0?rear.fallbackEntries:s.fallbackEntries
    assert.equal(events.length,s.metrics.priorityHardFallbacks)
    for(const e of events)fallbacks.push({road:g.id,n,v,quantum:q,...e})
   }
  }catch(error){const fail={road:g.id,n,v,error:String(error.stack??error)}
   failures.push(fail);console.error(JSON.stringify(fail))}
 }
}
assert.equal(failures.length,0,'A45 physical suite had a technical failure')
assert.equal(cases.length,200,'A45 expected 40 matched fixtures x 5 quanta')
assert.equal(traceIdentity.length,40,'A45 expected 40 diagnostic/no-diagnostic self checks')
const atHalf=fallbacks.filter(x=>x.quantum===.5)
assert.equal(atHalf.length,148,'A45 did not reproduce exactly 148 A44 hard fallbacks at 0.5s')
const expectedFallbacks=new Map([[.5,148],[1,30],[2,10],[2.5,12],[5,0]])
for(const [q,expected] of expectedFallbacks)
 assert.equal(fallbacks.filter(x=>x.quantum===q).length,expected,
  'A44 previously observed hard-fallback count changed')
const quantums=quantaA45.slice(1).map(q=>{
 const relevant=cases.filter(x=>x.quantum===q)
 const sum=(fn)=>relevant.reduce((acc,x)=>acc+fn(x),0)
 return {quantum:q,cases:relevant.length,
  positionRegressions:sum(x=>Number(!x.improvement.noWorsePosition)),
  gapRegressions:sum(x=>Number(!x.improvement.noWorseGap)),
  orderingRegressions:sum(x=>Number(!x.improvement.noWorseOrder)),
  allThreeImprovedOrEqual:sum(x=>Number(x.improvement.allThree)),
  allThreeFailures:sum(x=>Number(!x.improvement.allThree)),
  baselineInversions:sum(x=>x.baseline.inversions),
  rearInversions:sum(x=>x.rear.inversions),
  maxBaselineX:Math.max(...relevant.map(x=>x.baseline.maxX)),
  maxRearX:Math.max(...relevant.map(x=>x.rear.maxX)),
  maxBaselineGap:Math.max(...relevant.map(x=>x.baseline.maxGap)),
  maxRearGap:Math.max(...relevant.map(x=>x.rear.maxGap)),
  worstOrderRegression:relevant.filter(x=>x.improvement.inversions<0)
   .sort((a,b)=>a.improvement.inversions-b.improvement.inversions).slice(0,5).map(x=>({
     road:x.road,n:x.n,v:x.v,quantum:x.quantum,
     addedInversions:-x.improvement.inversions,
     baselineInversions:x.baseline.inversions,rearInversions:x.rear.inversions})),
  worstXRegression:relevant.filter(x=>x.improvement.x<-1e-6)
   .sort((a,b)=>a.improvement.x-b.improvement.x).slice(0,4).map(x=>({
     road:x.road,n:x.n,v:x.v,quantum:x.quantum,
     addedMaxX:r6(-x.improvement.x)}))
 }
})
const regressions=cases.filter(x=>x.quantum!==.5&&!x.improvement.allThree)
 .sort((a,b)=>a.improvement.inversions-b.improvement.inversions||
  a.improvement.x-b.improvement.x)
const fallbackByRoad=BATCH40_GEOMETRIES.map(geometry=>{
 const sub=atHalf.filter(x=>x.road===geometry.id)
 return {road:geometry.id,events:sub.length,
  byField:counts.map(n=>({n,events:sub.filter(x=>x.n===n).length})),
  minScaleZero:sub.filter(x=>x.nearZeroScaleCount>0).length,
  biggestUnresolved:Math.max(0,...sub.map(x=>x.unresolvedContactCount)),
  typicalFirstPairs:Math.max(0,...sub.map(x=>x.firstContactCount)),
  earliestSimulationSecond:sub.length?Math.min(...sub.map(x=>x.wallClockSimulationSeconds)):null,
  lateSimulationSecond:sub.length?Math.max(...sub.map(x=>x.wallClockSimulationSeconds)):null}
})
const fallbackReason={
 total:atHalf.length,
 withNearZeroYieldScale:atHalf.filter(x=>x.nearZeroScaleCount>0).length,
 withoutNearZeroYieldScale:atHalf.filter(x=>x.nearZeroScaleCount===0).length,
 persistentPairAtRound64:atHalf.filter(x=>x.unresolvedContactCount>0).length,
 hasSameFirstUnresolvedPair:atHalf.filter(x=>{
  const first=new Set(x.firstPairs.map(p=>[p.a,p.b].sort().join('::')))
  return x.unresolvedPairs.some(p=>first.has([p.a,p.b].sort().join('::')))
 }).length,
 maximumInitialContactPairs:Math.max(...atHalf.map(x=>x.firstContactCount)),
 maximumLastContactPairs:Math.max(...atHalf.map(x=>x.unresolvedContactCount))
}
for(const n of [106,168]){
 let rejected=false,message=''
 try{
  const g=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
  start({riders:initial(n,g,0),geometry:BATCH40_GEOMETRIES[1],
   substeps:20,conflictPolicy:'trapezoid_rear_priority'})
 }catch(e){rejected=true;message=String(e.message??e)}
 assert(rejected&&message.includes('roster count'),
  'A45 full-field 106/168 unsupported limit must remain explicit')
 largeFieldLimit.push({riderCount:n,fullFieldSimulationSupported:false,reason:message})
}
const output={study:'A2_STEP45_FALLBACK_AND_FIXTURE_FAIRNESS',engineeringGate:'PASS',
 sportingGate:'NO_GO',scope:'40 matched synthetic cases, 60s, five physical quanta',
 analyzedMatchedFixtures:cases.length,referenceAndTrialRuns:400,
 nonInstrumentedReplayCases:40,technicalRuns:440,
 fallbackAtHalf:atHalf.length,allFallbacks:fallbacks.length,
 fallbackReason,fallbackByRoad,quantums,regressionsCount:regressions.length,
 worstRegressions:regressions.slice(0,24),
 individualFixtures:cases,allFallbackDetails:fallbacks,
 untracedVsTraced:traceIdentity,largeFieldLimit,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP45_DIR??'/tmp/a2-step45'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step45-fallback-fixtures.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({
 study:output.study,engineeringGate:output.engineeringGate,
 sportingGate:output.sportingGate,technicalRuns:output.technicalRuns,
 matchedFixtures:output.analyzedMatchedFixtures,
 fallbackAtHalf:output.fallbackAtHalf,allFallbacks:output.allFallbacks,
 fallbackReason:output.fallbackReason,fallbackByRoad:output.fallbackByRoad,
 quantums:output.quantums,regressionsCount:output.regressionsCount,
 worstRegressions:output.worstRegressions.slice(0,8),largeFieldLimit:output.largeFieldLimit,
 officialWrites:0,sportingApproval:'NOT_APPROVED'
}))
