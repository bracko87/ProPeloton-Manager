/** A49 fixed-anchor, paired same-grid comparison and spotlighted event-time analysis. OFFLINE ONLY.
 * Tests source physical step sensitivity, identity/lateral symmetry,
 * swept space-time safety, exact replay and fixed commands.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as start,advanceSubstepPhysicalResearchV3 as move} from './a2SubstepPhysicalResearchV3.mjs'
import {resolveContactPriorityV3} from './a2CollisionPriorityResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
import {auditFirstContactPairV3,firstComparedDivergenceV3} from './a2PairGeometryAuditV3.mjs'
import {compareCommonReferenceV3,compareMatchedPoliciesV3} from './a2CommonReferenceAuditV3.mjs'
const r6=x=>Math.round(x*1e6)/1e6
const policies=['trapezoid_rear_priority','trapezoid_rear_corridor_guard','trapezoid_rear_corridor_leader']
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
 let checkpoint=null,nearStops=0,observed=[]
 for(let tick=0;tick<6;tick++){
  const before=new Map(state.riders.map(x=>[x.riderId,x.meters]))
  const cmd=commanded(state,v,g,{mirror,idMap}),frozen=structuredClone(cmd)
  state=move(state,cmd)
  if(diagnostics)observed.push({
   tick,tracks:state.lastTickTracks,
   previews:state.lastTickConflictTrace.filter(x=>x.kind==='physical_substep')
  })
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
  gap:r6(front-x.meters)})),nearStops,metrics:state.metrics,observed}
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


const policyIds=['trapezoid_rear_priority','trapezoid_rear_corridor_guard','trapezoid_rear_corridor_leader']
const labels={trapezoid_rear_priority:'rear',trapezoid_rear_corridor_guard:'guard',
 trapezoid_rear_corridor_leader:'leader'}
const anchors=['trapezoid_rear_priority','trapezoid_rear_corridor_guard']
const qvalues=[.5,1,2,2.5,5]
const records=[],spotlights=[],errors=[]
const sumMetrics=(rows,k)=>rows.reduce((v,x)=>v+x[k],0)
const allPolicyStats=[]
let totalPhysicalRuns=0,totalNonreference=0
const illustrativePair={
 a:{riderId:'follower',x0:100,y0:0,proposedMeters:3,proposedY:0},
 b:{riderId:'leader',x0:101,y0:1,proposedMeters:3,proposedY:0}}
const pairA=auditFirstContactPairV3(illustrativePair.a,illustrativePair.b,
 validateRoadScenarioV3(BATCH40_GEOMETRIES[1]))
const pairB=auditFirstContactPairV3({...illustrativePair.a,riderId:'ZZ',y0:4,proposedY:4},
 {...illustrativePair.b,riderId:'AA',y0:3,proposedY:4},
 validateRoadScenarioV3(BATCH40_GEOMETRIES[1]))
assert(pairA.contact&&pairA.stationaryFollowerHit)
assert.equal(pairA.movementType,pairB.movementType)
assert.equal(pairA.stationaryFollowerHit,pairB.stationaryFollowerHit)
assert.equal(pairA.contactFraction,pairB.contactFraction)
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  try{
   const states=Object.fromEntries(policyIds.map(p=>[p,{}]))
   for(const policy of policyIds){
    for(const quantum of qvalues){
     const shouldTrace=
      geometry.id==='baseline_5m'&&n===8&&v===1&&quantum===.5 ||
      geometry.id==='wide_6_5m'&&n===8&&v===1&&quantum===.5 ||
      geometry.id==='cautious_5m'&&n===32&&v===0&&quantum===2.5 ||
      geometry.id==='cautious_5m'&&n===32&&v===1&&quantum===2
     states[policy][String(quantum)]=simulate(geometry,g,n,v,policy,quantum,{diagnostics:shouldTrace})
     totalPhysicalRuns++
    }
   }
   const refs=Object.fromEntries(policyIds.map(p=>[p,states[p]['0.5'].riders]))
   for(const quantum of qvalues){
    const atQuantum=Object.fromEntries(policyIds.map(p=>[p,states[p][String(quantum)].riders]))
    const common=Object.fromEntries(anchors.map(p=>[
     labels[p],compareCommonReferenceV3(refs[p],atQuantum,{anchorId:p,quantum}).comparisons
    ]))
    const own=Object.fromEntries(policyIds.map(p=>[
     labels[p],compareCommonReferenceV3(refs[p],{[p]:atQuantum[p]},
      {anchorId:p,quantum}).comparisons[p]
    ]))
    const directRearGuard=compareMatchedPoliciesV3(atQuantum.trapezoid_rear_priority,
     atQuantum.trapezoid_rear_corridor_guard,
     {quantum,policyA:'rear',policyB:'guard'}).comparison
    const directRearLeader=compareMatchedPoliciesV3(atQuantum.trapezoid_rear_priority,
     atQuantum.trapezoid_rear_corridor_leader,
     {quantum,policyA:'rear',policyB:'leader'}).comparison
    const directGuardLeader=compareMatchedPoliciesV3(atQuantum.trapezoid_rear_corridor_guard,
     atQuantum.trapezoid_rear_corridor_leader,
     {quantum,policyA:'guard',policyB:'leader'}).comparison
    records.push({road:g.id,n,v,quantum,common,own,direct:{
     rearGuard:directRearGuard,rearLeader:directRearLeader,guardLeader:directGuardLeader},
     fallbacks:Object.fromEntries(policyIds.map(p=>[
      labels[p],states[p][String(quantum)].metrics.priorityHardFallbacks]))})
   }
   const pairs=[
    {road:'baseline_5m',n:8,v:1,quantum:.5,expectedTime:51},
    {road:'wide_6_5m',n:8,v:1,quantum:.5,expectedTime:51.5},
    {road:'cautious_5m',n:32,v:0,quantum:2.5,expectedTime:22.5},
    {road:'cautious_5m',n:32,v:1,quantum:2,expectedTime:22}
   ]
   const spotlight=pairs.find(k=>k.road===g.id&&k.n===n&&k.v===v)
   if(spotlight){
    const rear=states.trapezoid_rear_priority[String(spotlight.quantum)]
    const guard=states.trapezoid_rear_corridor_guard[String(spotlight.quantum)]
    const leader=states.trapezoid_rear_corridor_leader[String(spotlight.quantum)]
    const firstRL=firstComparedDivergenceV3(rear,leader,g,spotlight.quantum)
    const firstRG=firstComparedDivergenceV3(rear,guard,g,spotlight.quantum)
    const firstGL=firstComparedDivergenceV3(guard,leader,g,spotlight.quantum)
    assert(firstRL,'A49 expected first RL path divergence not recorded')
    assert(Math.abs(firstRL.simulationSeconds-spotlight.expectedTime)<1e-6,
     'A49 previous A48 causal spot changed unexpectedly')
    const inspect=(d)=>d?{
     seconds:d.simulationSeconds,rider:d.offendingRiderId,
     maxXDeltaM:d.maxXDeltaM,maxYDeltaM:d.maxYDeltaM,
     left:d.left,right:d.right}:null
    spotlights.push({...spotlight,
     rearVsLeader:inspect(firstRL),rearVsGuard:inspect(firstRG),
     guardVsLeader:inspect(firstGL)})
   }
  }catch(e){errors.push({road:g.id,n,v,error:String(e.stack??e)})
   console.error(JSON.stringify(errors.at(-1)))}
 }
}
assert.equal(errors.length,0,'A49 common reference or spotlight validation failed')
assert.equal(totalPhysicalRuns,600,'A49 expected 40x3x5 real physical simulations')
assert.equal(records.length,200,'A49 expected 40x5 fixture grid comparisons')
assert.equal(spotlights.length,4,'A49 missing an established 22/51s culprit')
for(const s of spotlights)assert(s.rearVsLeader.seconds===s.expectedTime)
const perQuantum=qvalues.map(quantum=>{
 const group=records.filter(x=>x.quantum===quantum)
 const metrics=['rear','guard','leader']
 const aggregate=(anchor)=>Object.fromEntries(metrics.map(p=>[p,{
  maxX:Math.max(...group.map(x=>x.common[anchor][policyIds.find(k=>labels[k]===p)].maxPositionM)),
  maxGap:Math.max(...group.map(x=>x.common[anchor][policyIds.find(k=>labels[k]===p)].maxLeaderGapM)),
  inversions:sumMetrics(group.map(x=>x.common[anchor][policyIds.find(k=>labels[k]===p)]),'positionOrderInversions'),
  rmsPositionMeanM:r6(sumMetrics(group.map(x=>x.common[anchor][policyIds.find(k=>labels[k]===p)]),'rmsPositionM')/group.length)
 }]))
 const pairAgg={rearGuard:sumMetrics(group.map(x=>x.direct.rearGuard),'positionOrderInversions'),
  rearLeader:sumMetrics(group.map(x=>x.direct.rearLeader),'positionOrderInversions'),
  guardLeader:sumMetrics(group.map(x=>x.direct.guardLeader),'positionOrderInversions')}
 const commonRear=aggregate('rear'),commonGuard=aggregate('guard')
 const sameGridTrajectoryMatches=Object.fromEntries(['rearGuard','rearLeader','guardLeader'].map(p=>[
  p,group.filter(x=>x.direct[p].changedRiders===0).length]))
 return {quantum,cases:group.length,
  commonRearReference:commonRear,commonGuardReference:commonGuard,
  directPairwiseOrderInversions:pairAgg,sameGridTrajectoryMatches,
  hardFallbacks:Object.fromEntries(metrics.map(p=>[p,
   sumMetrics(group.map(x=>({n:x.fallbacks[p]})),'n')]))}
})
const baseline=perQuantum.find(x=>x.quantum===.5)
assert.equal(baseline.hardFallbacks.rear,148,'A49 A44 baseline fallback count changed')
assert.equal(baseline.hardFallbacks.guard,0);assert.equal(baseline.hardFallbacks.leader,0)
const referenceSensitivity=qvalues.slice(1).map(q=>{
 const scope=perQuantum.find(x=>x.quantum===q)
 const rank=(scores)=>Object.entries(scores).sort((a,b)=>
  a[1].inversions-b[1].inversions||a[0].localeCompare(b[0])).map(([id])=>id)
 return {quantum:q,byRearReference:rank(scope.commonRearReference),
  byGuardReference:rank(scope.commonGuardReference),
  orderingDependsOnAnchor:JSON.stringify(rank(scope.commonRearReference))!==
   JSON.stringify(rank(scope.commonGuardReference))}
})
const selfToCommonDifferences=records.filter(x=>x.quantum!==.5).map(r=>{
 const per=Object.fromEntries(policyIds.map(p=>[labels[p],{
  own:r.own[labels[p]].positionOrderInversions,
  rearAnchor:r.common.rear[p].positionOrderInversions,
  guardAnchor:r.common.guard[p].positionOrderInversions,
  coarseSameAsRear:r.direct[labels[p]==='guard'?'rearGuard':labels[p]==='leader'?'rearLeader':'rearGuard'].changedRiders===0
 }]))
 return {road:r.road,n:r.n,v:r.v,quantum:r.quantum,per}
})
const sameCoarseDifferentFine=selfToCommonDifferences.filter(x=>
 x.per.leader.coarseSameAsRear&&x.per.leader.own!==x.per.rear.own)
const output={study:'A2_STEP49_COMMON_REFERENCE_AND_DIRECT_PAIRS',
 technicalGate:'PASS',sportingGate:'NO_GO',
 referenceStatus:'UNVALIDATED_COMPUTATIONAL_ANCHORS',
 anchors:{rear:'A44 rear-priority 0.5s, same fixture',
  guard:'A46 two-sided guard 0.5s, same fixture'},
 physicalRuns:totalPhysicalRuns,physicalFixtures:40,
 commonReferenceGridComparisons:records.length,
 perQuantum,referenceSensitivity,
 sameCoarseDifferentFineCount:sameCoarseDifferentFine.length,
 sameCoarseDifferentFineCases:sameCoarseDifferentFine,
 spotlights,individualComparisons:records,selfToCommonDifferences,
 syntheticPairMirrorSanity:{firstFraction:pairA.contactFraction,
  contactType:pairA.movementType,stationaryFollowerHit:pairA.stationaryFollowerHit},
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP49_DIR??'/tmp/a2-step49'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step49-common-reference.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({study:output.study,technicalGate:output.technicalGate,
 sportingGate:output.sportingGate,physicalRuns:output.physicalRuns,
 commonReferenceGridComparisons:output.commonReferenceGridComparisons,
 perQuantum,referenceSensitivity,
 sameCoarseDifferentFineCount:output.sameCoarseDifferentFineCount,
 spotlightEvents:spotlights.map(x=>({
  road:x.road,n:x.n,v:x.v,quantum:x.quantum,
  first:x.rearVsLeader.seconds,rider:x.rearVsLeader.rider,
  pairs:x.rearVsLeader.left.pairs,firstContactDeltaM:x.rearVsLeader.maxXDeltaM})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
