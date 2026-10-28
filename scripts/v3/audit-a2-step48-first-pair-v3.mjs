/** A48 exact pair geometry and first trajectory divergence audit. OFFLINE ONLY.
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

const physicalPolicies=['trapezoid_rear_priority','trapezoid_rear_corridor_guard','trapezoid_rear_corridor_leader']
const sampleG=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const pA={riderId:'a',x0:100,y0:0,proposedMeters:3,proposedY:0}
const pB={riderId:'b',x0:101,y0:1,proposedMeters:3,proposedY:0}
const geometrySanity=auditFirstContactPairV3(pA,pB,sampleG)
assert(geometrySanity.contact&&geometrySanity.movementType==='one_steering'&&
 geometrySanity.stationaryFollowerHit,'A48 missing explicit leader-into-stationary-follower case')
const mirrored=auditFirstContactPairV3({...pA,y0:4,proposedY:4},
 {...pB,y0:3,proposedY:4},sampleG)
assert.equal(geometrySanity.movementType,mirrored.movementType)
assert.equal(geometrySanity.stationaryFollowerHit,mirrored.stationaryFollowerHit)
const rename=auditFirstContactPairV3({...pA,riderId:'z99'},{...pB,riderId:'z01'},sampleG)
assert.equal(rename.movementType,geometrySanity.movementType)
assert.equal(rename.stationaryFollowerHit,geometrySanity.stationaryFollowerHit)
const cases=[],regressions=[],errors=[]
const qvalues=[.5,1,2,2.5,5]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  try{
   const ref=Object.fromEntries(physicalPolicies.map(policy=>[
    policy,simulate(geometry,g,n,v,policy,.5)]))
   for(const quantum of qvalues.slice(1)){
    const runs=Object.fromEntries(physicalPolicies.map(policy=>[
     policy,simulate(geometry,g,n,v,policy,quantum,{diagnostics:true})]))
    const contrasts=Object.fromEntries(physicalPolicies.map(policy=>[
     policy,delta(ref[policy],runs[policy])]))
    const rear=contrasts.trapezoid_rear_priority
    const guard=contrasts.trapezoid_rear_corridor_guard
    const leader=contrasts.trapezoid_rear_corridor_leader
    const mismatch=(x,y)=>({
     worsePosition:x.maxX>y.maxX+1e-6,
     worseGap:x.maxGap>y.maxGap+1e-6,
     worseOrder:x.inversions>y.inversions,
     addedInversions:x.inversions-y.inversions,
     addedPositionM:r6(x.maxX-y.maxX),
     addedGapM:r6(x.maxGap-y.maxGap)
    })
    const leaderVsRear=mismatch(leader,rear)
    const leaderVsGuard=mismatch(leader,guard)
    const guardVsRear=mismatch(guard,rear)
    const base={road:g.id,n,v,quantum,leaderVsRear,
     leaderVsGuard,guardVsRear,
     orderPairTotals:{rear:rear.inversions,guard:guard.inversions,leader:leader.inversions},
     finalPosition:{rear:rear.maxX,guard:guard.maxX,leader:leader.maxX},
     finalGap:{rear:rear.maxGap,guard:guard.maxGap,leader:leader.maxGap}}
    cases.push(base)
    if(Object.values(leaderVsRear).slice(0,3).some(Boolean)){
     const firstVsRear=firstComparedDivergenceV3(
      runs.trapezoid_rear_priority,runs.trapezoid_rear_corridor_leader,g,quantum)
     const firstVsGuard=firstComparedDivergenceV3(
      runs.trapezoid_rear_corridor_guard,runs.trapezoid_rear_corridor_leader,g,quantum)
     assert(firstVsRear,'A48 individual regression without any observed differing accepted path')
     regressions.push({...base,firstVsRear,firstVsGuard})
    }
   }
  }catch(e){const err={road:g.id,n,v,error:String(e.stack??e)}
   errors.push(err);console.error(JSON.stringify(err))}
 }
}
assert.equal(errors.length,0,'A48 technical pair-trace or safety check failure')
assert.equal(cases.length,160)
assert.equal(regressions.length,11,'A47 leader-only 11 per-fixture regressions not reproduced')
assert.equal(cases.filter(c=>Object.values(c.guardVsRear).slice(0,3).some(Boolean)).length,10,
 'A47 guard 10 per-fixture regressions not reproduced')
const byQuantum=qvalues.slice(1).map(quantum=>{
 const scoped=cases.filter(c=>c.quantum===quantum)
 const reg=regressions.filter(c=>c.quantum===quantum)
 return {quantum,comparisons:scoped.length,
  worseLeaderVsRear:reg.length,
  worseLeaderVsGuard:scoped.filter(c=>Object.values(c.leaderVsGuard).slice(0,3).some(Boolean)).length,
  leadingOnlyPositionRegressions:reg.filter(c=>c.leaderVsRear.worsePosition).length,
  leadingOnlyGapRegressions:reg.filter(c=>c.leaderVsRear.worseGap).length,
  leadingOnlyOrderRegressions:reg.filter(c=>c.leaderVsRear.worseOrder).length}
})
const firstPairFeatures=regressions.map(entry=>{
 const first=entry.firstVsRear
 const pairs=[...first.left.pairs,...first.right.pairs]
 return {road:entry.road,n:entry.n,v:entry.v,quantum:entry.quantum,
  firstTime:first.simulationSeconds,firstRider:first.offendingRiderId,
  leftConflictCount:first.left.previewCount,rightConflictCount:first.right.previewCount,
  movements:[...new Set(pairs.map(p=>p.movementType))],
  stationaryFollowerHits:pairs.filter(p=>p.stationaryFollowerHit).length,
  firstContactFractions:pairs.map(p=>p.contactFraction),
  leftAccepted:first.left.accepted,rightAccepted:first.right.accepted}
})
const categories=Object.fromEntries(['straight','one_steering','parallel_steering','opposite_steering'].map(kind=>[
 kind,firstPairFeatures.filter(x=>x.movements.includes(kind)).length
]))
const sourceM=regressions.reduce((a,x)=>Math.min(a,x.firstVsRear.simulationSeconds),Infinity)
const report={study:'A2_STEP48_FIRST_PAIR_GEOMETRY_AUDIT',technicalGate:'PASS',
 sportingGate:'NO_GO',source:'independent frozen-trajectory observer, NO physics changes',
 fixtures:40,gridComparisons:cases.length,
 analyzedPhysicalRuns:600, // 40 fixtures x 3 policies x (reference + 4 physical time grids)
 expectedLeaderOnlyRegressions:11,
 observedLeaderOnlyRegressions:regressions.length,
 observedGuardRegressions:10,
 byQuantum,firstPairFeatures,categories,
 firstDivergenceAtSeconds:sourceM,
 regressionCases:regressions,allFixtureComparisons:cases,
 geometrySanity,errors,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const folder=process.env.V3_A2_STEP48_DIR??'/tmp/a2-step48'
mkdirSync(folder,{recursive:true})
writeFileSync(folder+'/a2-step48-pair-geometry.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,fixtures:report.fixtures,gridComparisons:report.gridComparisons,
 analyzedPhysicalRuns:report.analyzedPhysicalRuns,
 observedLeaderOnlyRegressions:report.observedLeaderOnlyRegressions,
 observedGuardRegressions:report.observedGuardRegressions,
 byQuantum,categories,firstDivergenceAtSeconds:report.firstDivergenceAtSeconds,
 firstPairFeatures:report.firstPairFeatures,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
