/** A53 swept-path preacceptance and cross-component dependencies. OFFLINE ONLY.
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
import {analyzeFirstDecisionV3,analyzePropagationV3} from './a2ContactPropagationAuditV3.mjs'
import {inspectFrozenComponentInterventionsV3} from './a2IsolatedContactComponentAuditV3.mjs'
import {auditPreacceptanceDependencyV3,auditFullHybridOracleV3} from './a2PreacceptanceDependencyV3.mjs'
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
 let checkpoint=null,nearStops=0,observed=[],tickStates=[]
 for(let tick=0;tick<6;tick++){
  const before=new Map(state.riders.map(x=>[x.riderId,x.meters]))
  const cmd=commanded(state,v,g,{mirror,idMap}),frozen=structuredClone(cmd)
  state=move(state,cmd)
  if(diagnostics)tickStates.push({tick,seconds:state.elapsedSeconds,
   riders:state.riders.map(r=>({riderId:r.riderId,x:r.meters,y:r.y,
    speed:r.speedMps,wPrime:r.energy.remainingWPrimeJoules,
    mechanicalJoules:r.energy.cumulativeMechanicalJoules}))})
  if(diagnostics)observed.push({
   tick,tracks:state.lastTickTracks,
   previews:state.lastTickConflictTrace.filter(x=>x.kind==='physical_substep'),
   decisions:state.lastTickConflictTrace.filter(x=>x.kind==='contact_time_decision')
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
  gap:r6(front-x.meters)})),nearStops,metrics:state.metrics,observed,tickStates}
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






const road=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
// Synthetic negative control: A44 and complete A50 paths are both safe,
// but using only A50's first rider would overlap A44's second rider.
const ref=[{riderId:'A',x0:0,y0:0,x1:4,y1:0},
 {riderId:'B',x0:6,y0:0,x1:6,y1:0},
 {riderId:'C',x0:15,y0:0,x1:15,y1:0}]
const alt=[{riderId:'A',x0:0,y0:0,x1:6,y1:0},
 {riderId:'B',x0:6,y0:0,x1:9,y1:0},
 {riderId:'C',x0:15,y0:0,x1:15,y1:0}]
const bad=auditPreacceptanceDependencyV3(ref,alt,['A'],road)
assert.equal(bad.allow,false)
assert.deepEqual(bad.blockers.map(x=>x.pair),[['A','B']])
assert.equal(bad.blockers[0].kind,'CROSS_COMPONENT_DEPENDENCY')
assert.equal(auditPreacceptanceDependencyV3(ref,alt,['A','B'],road).allow,true)
assert.equal(auditPreacceptanceDependencyV3(ref,alt,[],road).allow,true)
assert.throws(()=>auditPreacceptanceDependencyV3(ref,alt,['MISSING'],road))
assert.throws(()=>auditPreacceptanceDependencyV3(ref,
 alt.map(x=>x.riderId==='A'?{...x,x0:1}:x),['A'],road))
assert.throws(()=>auditPreacceptanceDependencyV3(ref,
 alt.map(x=>x.riderId==='B'?{...x,x1:5}:x),['A'],road))
const back=auditPreacceptanceDependencyV3(ref.slice().reverse(),alt.slice().reverse(),
 ['A'],road)
assert.deepEqual(back.blockers,bad.blockers)
const H=(road.laneCount-1)*road.centerStepM
const reflect=x=>({...x,y0:r6(H-x.y0),y1:r6(H-x.y1)})
assert.deepEqual(auditPreacceptanceDependencyV3(ref.map(reflect),
 alt.map(reflect),['A'],road).blockers.map(x=>x.pair),bad.blockers.map(x=>x.pair))
const rename=x=>({...x,riderId:({A:'Z',B:'AA',C:'R'})[x.riderId]})
const named=auditPreacceptanceDependencyV3(ref.map(rename),alt.map(rename),['Z'],road)
assert.equal(named.allow,false)
assert.deepEqual(named.blockers[0].pair,['AA','Z'])

const highlighted=[
 {road:'baseline_5m',n:8,v:1,q:.5,sourceTime:51},
 {road:'wide_6_5m',n:8,v:1,q:.5,sourceTime:51.5},
 {road:'cautious_5m',n:32,v:0,q:2.5,sourceTime:22.5},
 {road:'cautious_5m',n:32,v:1,q:2,sourceTime:22}
]
let runs=0,oracles=0,symmetry=0
const rows=[],spotlights=[],errors=[]
const grids=new Map([.5,2,2.5].map(q=>[q,{quantum:q,fixtures:0,different:0,
 componentTrials:0,safeComponents:0,blockedComponents:0,
 unionTrials:0,safeUnions:0,blockedUnions:0,
 crossBoundaryBlockedPairs:0,internalBlockedPairs:0,
 firstRoundNewConflicts:0,maxAverageSpeedDifferenceMps:0}]))
function resolvePairPolicies(preview,g){
 const raw=preview.proposals.map(x=>({riderId:x.riderId,
  original:{meters:x.x0,y:x.y0,speedMps:x.oldSpeedMps},
  forward:x.proposedMeters,y:x.proposedY}))
 return {
  rear:resolveContactPriorityV3(raw,g,{policy:'rear_priority'}).paths,
  contact:resolveContactPriorityV3(raw,g,{policy:'contact_time_lane_occupancy'}).paths
 }
}
function inspect(preview,g,q,selected,mirrorAndRename){
 const two=resolvePairPolicies(preview,g),before=JSON.stringify(two)
 const outcome=auditPreacceptanceDependencyV3(two.rear,two.contact,selected,g,
  {physicalSeconds:q})
 const oracle=auditFullHybridOracleV3(two.rear,two.contact,selected,g)
 assert.equal(outcome.allow,oracle.length===0,'A53 false accept or false reject')
 assert.deepEqual(outcome.blockers.map(x=>x.pair),oracle,'A53 omitted a physical collision')
 assert.equal(JSON.stringify(two),before)
 assert(outcome.unchangedOutsideTracksVerified)
 assert.equal(outcome.energyLedgerVerified,false)
 assert.equal(outcome.officialWrites,0)
 oracles++
 if(mirrorAndRename){
  const reorder=auditPreacceptanceDependencyV3(two.rear.slice().reverse(),
   two.contact.slice().reverse(),selected,g,{physicalSeconds:q})
  assert.deepEqual(reorder.blockers,outcome.blockers)
  const ids=two.rear.map(x=>x.riderId)
  const ren=id=>'rev'+String(ids.length-ids.indexOf(id)).padStart(3,'0')
  const relabel=x=>({...x,riderId:ren(x.riderId)})
  const renamed=auditPreacceptanceDependencyV3(two.rear.map(relabel),
   two.contact.map(relabel),selected.map(ren),g,{physicalSeconds:q})
  assert.equal(renamed.allow,outcome.allow)
  assert.deepEqual(renamed.blockers.map(x=>x.kind).sort(),
   outcome.blockers.map(x=>x.kind).sort())
  const Y=r6((g.laneCount-1)*g.centerStepM)
  const refl=x=>({...x,y0:r6(Y-x.y0),y1:r6(Y-x.y1)})
  const mirrored=auditPreacceptanceDependencyV3(two.rear.map(refl),
   two.contact.map(refl),selected,g,{physicalSeconds:q})
  assert.equal(mirrored.allow,outcome.allow)
  assert.deepEqual(mirrored.blockers.map(x=>x.pair),outcome.blockers.map(x=>x.pair))
  symmetry+=3
 }
 return outcome
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const tagged=highlighted.filter(x=>x.road===g.id&&x.n===n&&x.v===v)
  const qs=tagged.some(x=>x.q===2)?[.5,2,2.5]:[.5,2.5]
  for(const q of qs){
   try{
    const reference=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const candidate=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,{diagnostics:true})
    runs+=2
    const grid=grids.get(q);grid.fixtures++
    const first=analyzeFirstDecisionV3(reference,candidate,g,q)
    const item={road:g.id,n,v,q,firstTime:first?.firstAcceptedDifferenceSeconds??null,
     components:[],union:null}
    if(first){
     grid.different++
     const preview=reference.observed[first.tick].previews[first.substep-1]
     const prior=inspectFrozenComponentInterventionsV3(preview,g)
     assert.deepEqual(prior.changedByFullCounterfactual,
      first.frozenCounterfactual.changedRiders.slice().sort())
     for(const component of prior.isolatedComponents){
      const guard=inspect(preview,g,q,component.members,true)
      assert.equal(guard.allow,component.collisionFree,
       'A53 disagreed with Step52 component oracle')
      assert.deepEqual(guard.blockers.map(x=>x.pair),component.blockedPairs)
      grid.componentTrials++;grid.safeComponents+=Number(guard.allow)
      grid.blockedComponents+=Number(!guard.allow)
      grid.crossBoundaryBlockedPairs+=guard.crossBoundaryConflictPairs.length
      grid.internalBlockedPairs+=guard.internalConflictPairs.length
      grid.maxAverageSpeedDifferenceMps=Math.max(grid.maxAverageSpeedDifferenceMps,
       guard.maxAverageSpeedDeltaMps)
      item.components.push({members:component.members,allow:guard.allow,
       blockingPairs:guard.blockers,maxAverageSpeedDeltaMps:guard.maxAverageSpeedDeltaMps})
     }
     const union=inspect(preview,g,q,prior.combinedChangedComponents.members,true)
     assert.equal(union.allow,prior.combinedChangedComponents.collisionFree,
      'A53 disagreed with Step52 combined union oracle')
     grid.unionTrials++;grid.safeUnions+=Number(union.allow)
     grid.blockedUnions+=Number(!union.allow)
     grid.firstRoundNewConflicts+=prior.firstRound.newPairsAfterFirstContactOnly
     item.union={allow:union.allow,members:prior.combinedChangedComponents.members,
      blockingPairs:union.blockers}
    }
    rows.push(item)
    for(const spot of tagged.filter(x=>x.q===q)){
     const tick=Math.floor((spot.sourceTime-1e-7)/10)
     const step=Math.round((spot.sourceTime-tick*10)/q)
     const preview=reference.observed[tick].previews[step-1]
     const old=inspectFrozenComponentInterventionsV3(preview,g)
     const guard=inspect(preview,g,q,old.combinedChangedComponents.members,false)
     assert.equal(guard.allow,old.interventionSafety.combinedSafe)
     spotlights.push({...spot,firstTime:item.firstTime,
      sourcePairs:old.sourcePairs,originalComponents:old.sourceGroups,
      guard:{action:guard.action,allow:guard.allow,blockers:guard.blockers,
       maxDistanceDeltaM:guard.maxDistanceDeltaM}})
    }
   }catch(error){const f={road:g.id,n,v,q,error:String(error.stack??error)}
    errors.push(f);console.error(JSON.stringify(f))}
  }
 }
}
assert.equal(errors.length,0,'A53 independent preacceptance test failures')
assert.equal(runs,162)
assert.equal(rows.length,81)
assert.equal(rows.filter(x=>x.firstTime!==null).length,57)
assert.equal(spotlights.length,4)
const byQuantum=[...grids.values()]
assert.deepEqual(byQuantum.map(x=>x.componentTrials),[31,1,43])
assert.deepEqual(byQuantum.map(x=>x.blockedComponents),[0,0,5])
assert.deepEqual(byQuantum.map(x=>x.blockedUnions),[0,0,4])
assert.equal(byQuantum.reduce((a,x)=>a+x.internalBlockedPairs,0),0)
const report={study:'A2_STEP53_PREACCEPTANCE_DEPENDENCIES',
 technicalGate:'PASS',sportingGate:'NO_GO',
 physicalRuns:runs,pairedComparisons:rows.length,firstDifferences:57,
 componentTrials:75,guardedSafe:70,guardedRejected:5,
 unionTrials:57,unionSafe:53,unionRejected:4,
 fullFieldOracleChecks:oracles,metamorphicChecks:symmetry,
 byQuantum,spotlights,individualResults:rows,
 hybridEnergyStatus:'NOT_RECOMPUTED: geometric-only substep candidate',
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const folder=process.env.V3_A2_STEP53_DIR??'/tmp/a2-step53'
mkdirSync(folder,{recursive:true})
writeFileSync(folder+'/a2-step53-preacceptance.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,physicalRuns:report.physicalRuns,
 componentTrials:report.componentTrials,guardedSafe:report.guardedSafe,
 guardedRejected:report.guardedRejected,unionTrials:report.unionTrials,
 unionRejected:report.unionRejected,fullFieldOracleChecks:report.fullFieldOracleChecks,
 metamorphicChecks:report.metamorphicChecks,byQuantum:report.byQuantum,
 spotlights:report.spotlights,hybridEnergyStatus:report.hybridEnergyStatus,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
