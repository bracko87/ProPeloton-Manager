/** A56 braking-distance prediction and retrospective first-warning audit. OFFLINE ONLY.
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
import {auditHybridEnergyNextV3} from './a2HybridEnergyNextAuditV3.mjs'
import {auditVelocityBoundedHybridV3,inspectConstantAccelerationEnvelopeV3,conservativeQuadraticSweepV3} from './a2VelocityEnvelopeAuditV3.mjs'
import {minimalOrdinaryDistanceV3,requiredOptimisticLeadV3,classifyRetrospectiveWarningV3,auditHistoricalWarningV3} from './a2AnticipatoryBrakingAuditV3.mjs'
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









const tol=1e-5
const road=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
assert(Math.abs(minimalOrdinaryDistanceV3(8,2)-14.3)<1e-8)
assert(Math.abs(minimalOrdinaryDistanceV3(1,10)-1/(2*.85))<1e-8)
assert.equal(requiredOptimisticLeadV3(7,.5,0).leadSeconds,0)
assert.equal(requiredOptimisticLeadV3(7,.5,4,{horizonSeconds:0}).reachable,false)
const necessary=requiredOptimisticLeadV3(7,.5,4)
assert(necessary.reachable&&necessary.leadSeconds>.5&&necessary.leadSeconds<10)
const p={proposals:[
 {riderId:'rear',x0:100,y0:0,oldSpeedMps:8,proposedMeters:4,proposedY:0},
 {riderId:'front',x0:105,y0:0,oldSpeedMps:6,proposedMeters:3,proposedY:0}
 ],previewConflictPairs:[['rear','front']]}
const warn=classifyRetrospectiveWarningV3(p,'rear',road,.5)
assert(warn.warning&&warn.rawCollisionPartners.includes('front'))
assert.equal(warn.following.length,1)
const rename=x=>x==='rear'?'Z':x==='front'?'A':x
const renamed={proposals:p.proposals.map(x=>({...x,riderId:rename(x.riderId)})),
 previewConflictPairs:p.previewConflictPairs.map(pair=>pair.map(rename))}
const renWarn=classifyRetrospectiveWarningV3(renamed,'Z',road,.5)
assert.equal(renWarn.warning,warn.warning)
assert.equal(renWarn.following[0].closingMps,warn.following[0].closingMps)
const maxY=(road.laneCount-1)*road.centerStepM
const mirror={proposals:p.proposals.map(x=>({...x,y0:maxY-x.y0,proposedY:maxY-x.proposedY})),
 previewConflictPairs:p.previewConflictPairs}
const mirrorWarn=classifyRetrospectiveWarningV3(mirror,'rear',road,.5)
assert.equal(mirrorWarn.warning,warn.warning)
assert.equal(mirrorWarn.following[0].alarmDistanceM,warn.following[0].alarmDistanceM)
// An actual bounded prior reaction makes the future pair safe in synthetic
// straight traffic. Delaying the same reaction until the event yields an
// impossible endpoint. This is a positive analytical control, not an
// intervention or calibration in the historical full synthetic peloton.
const early={proposals:[
 {riderId:'rear',x0:0,y0:0,oldSpeedMps:8},
 {riderId:'front',x0:10,y0:0,oldSpeedMps:6}
]}
const earlyPaths=[{riderId:'rear',x0:0,y0:0,x1:29.375,y1:0},
 {riderId:'front',x0:10,y0:0,x1:40,y1:0}]
const bounded=inspectConstantAccelerationEnvelopeV3(early,earlyPaths,5)
assert.equal(bounded.allFeasible,true)
const sweep=conservativeQuadraticSweepV3(early,earlyPaths,road,5)
assert.equal(sweep.certifiedSafe,true)
const unbraked=[{riderId:'rear',x0:0,y0:0,x1:40,y1:0},
 {riderId:'front',x0:10,y0:0,x1:40,y1:0}]
const noBrake=conservativeQuadraticSweepV3(early,unbraked,road,5)
assert.equal(noBrake.certifiedSafe,false)
assert.equal(noBrake.status,'CONSERVATIVE_SWEEP_UNRESOLVED')
const sourceEvents=[
 {name:'baseline_r004_r005',road:'baseline_5m',n:8,v:1,q:.5,sourceTime:51},
 {name:'wide_r004_r005',road:'wide_6_5m',n:8,v:1,q:.5,sourceTime:51.5},
 {name:'cautious32_v0',road:'cautious_5m',n:32,v:0,q:2.5,sourceTime:22.5},
 {name:'cautious32_v1',road:'cautious_5m',n:32,v:1,q:2,sourceTime:22}
]
const rows=[],spotlights=[],errors=[],warnings=[]
const groups=new Map([.5,2,2.5].map(q=>[q,{quantum:q,
 fixtureComparisons:0,firstDivergenceCases:0,localTrials:0,
 geometrySafe:0,geometryRejected:0,
 unboundedSafeGeometry:0,ordinaryBounded:0,
 changedRiderBrakingCases:0,changedRiderBrakingObservations:0,
 optimisticLeadWithin10s:0,optimisticLeadOver10s:0,
 noEarlierWarningRiders:0,earlierWarningRiders:0,
 earlierEnoughUnderOptimisticAssumptions:0,
 earlierTooLateUnderOptimisticAssumptions:0,
 beforeEventRawWarnings:0,beforeEventFollowingWarnings:0,
 warningAlreadyAtEvent:0,
 maximumEstimatedLeadSeconds:0,
 maximumForwardShortfallM:0,maximumRequiredBrakingMps2:0
}]))
let physicsRuns=0,localTotal=0,unchangedSourceCounterfactuals=0
function hybridPaths(preview,g,ids){
 const raw=preview.proposals.map(p=>({riderId:p.riderId,
  original:{meters:p.x0,y:p.y0,speedMps:p.oldSpeedMps},
  forward:p.proposedMeters,y:p.proposedY}))
 const candidate=new Map(resolveContactPriorityV3(raw,g,
  {policy:'contact_time_lane_occupancy'}).paths.map(x=>[x.riderId,x]))
 const ref=new Map(preview.achieved.map(x=>[x.riderId,x]))
 const selected=new Set(ids)
 return preview.proposals.map(p=>{
  const end=selected.has(p.riderId)?candidate.get(p.riderId):ref.get(p.riderId)
  return {riderId:p.riderId,x0:p.x0,y0:p.y0,x1:end.x1,y1:end.y1}
 })
}
function traceCase(preview,next,g,v,q,ids,observed,eventTime){
 const result=auditVelocityBoundedHybridV3(preview,next,g,
  {gradePercent:[-3,0][v]},ids,{physicalSeconds:q})
 assert.equal(result.officialWrites,0)
 assert.equal(result.sportingApproval,'NOT_APPROVED')
 if(!result.geometryAllow)return {result,riderWarnings:[]}
 const paths=hybridPaths(preview,g,ids)
 const envelope=inspectConstantAccelerationEnvelopeV3(preview,paths,q)
 assert.equal(envelope.allFeasible,Boolean(result.ordinaryVelocityPass)||
  result.quadraticSweep.status==='CONSERVATIVE_SWEEP_UNRESOLVED',
  'A56 inconsistent acceleration-envelope classification')
 const changed=new Set(result.changedRiders)
 const alertRiders=envelope.riders.filter(x=>changed.has(x.riderId)&&
  x.reason==='BRAKING_EXCEEDS_0_85_MPS2'&&
  x.forwardShortfallFromLegalMinimumM>0)
 const riderWarnings=alertRiders.map(r=>auditHistoricalWarningV3(
  observed,eventTime,r,q,g,{historySeconds:10}))
 return {result,riderWarnings}
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const selectedEvents=sourceEvents.filter(x=>x.road===g.id&&x.n===n&&x.v===v)
  const qs=selectedEvents.some(x=>x.q===2)?[.5,2,2.5]:[.5,2.5]
  for(const q of qs){
   try{
    const reference=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const comparison=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,{diagnostics:true})
    physicsRuns+=2
    const group=groups.get(q);group.fixtureComparisons++
    const first=analyzeFirstDecisionV3(reference,comparison,g,q)
    const entry={road:g.id,n,v,q,firstTime:first?.firstAcceptedDifferenceSeconds??null,
     locals:[]}
    if(first){
     group.firstDivergenceCases++
     assert(first.sameFrozenInputAtDivergence)
     unchangedSourceCounterfactuals++
     const tick=reference.observed[first.tick]
     const preview=tick.previews[first.substep-1],next=tick.previews[first.substep]??null
     const baseline=traceCase(preview,next,g,v,q,[],reference.observed,
      first.firstAcceptedDifferenceSeconds)
     assert.equal(baseline.result.geometryAllow,true)
     assert.equal(baseline.riderWarnings.length,0)
     const previous=inspectFrozenComponentInterventionsV3(preview,g)
     for(const component of previous.isolatedComponents){
      const c=traceCase(preview,next,g,v,q,component.members,
       reference.observed,first.firstAcceptedDifferenceSeconds)
      const result=c.result
      localTotal++;group.localTrials++
      assert.equal(result.geometryAllow,component.collisionFree)
      if(!result.geometryAllow)group.geometryRejected++
      else{
       group.geometrySafe++
       group.ordinaryBounded+=Number(result.ordinaryVelocityPass)
       group.unboundedSafeGeometry+=Number(!result.ordinaryVelocityPass)
       group.changedRiderBrakingCases+=Number(c.riderWarnings.length>0)
       group.changedRiderBrakingObservations+=c.riderWarnings.length
       for(const rider of c.riderWarnings){
        warnings.push({road:g.id,n,v,q,component:component.members,
         firstTime:first.firstAcceptedDifferenceSeconds,...rider})
        group.optimisticLeadWithin10s+=Number(
         rider.optimisticLeadSeconds!==null&&rider.optimisticLeadSeconds<=10)
        group.optimisticLeadOver10s+=Number(
         rider.optimisticLeadSeconds===null||rider.optimisticLeadSeconds>10)
        group.noEarlierWarningRiders+=Number(rider.noRecordedEarlyWarning)
        group.earlierWarningRiders+=Number(!rider.noRecordedEarlyWarning)
        group.earlierEnoughUnderOptimisticAssumptions+=Number(
         rider.enoughRecordedWarningUnderOptimisticAssumptions)
        group.earlierTooLateUnderOptimisticAssumptions+=Number(
         !rider.noRecordedEarlyWarning&&
         !rider.enoughRecordedWarningUnderOptimisticAssumptions)
        group.beforeEventRawWarnings+=Number(rider.priorRawWarnings>0)
        group.beforeEventFollowingWarnings+=Number(rider.priorFollowingWarnings>0)
        group.warningAlreadyAtEvent+=Number(rider.warnedAtEvent)
        group.maximumEstimatedLeadSeconds=Math.max(group.maximumEstimatedLeadSeconds,
         rider.optimisticLeadSeconds??0)
        group.maximumForwardShortfallM=Math.max(group.maximumForwardShortfallM,
         rider.forwardShortfallM)
        group.maximumRequiredBrakingMps2=Math.max(group.maximumRequiredBrakingMps2,
         rider.requiredBrakingMps2)
       }
      }
      entry.locals.push({members:component.members,geometryAllowed:result.geometryAllow,
       classification:result.status,
       changedRiderBrakingWarnings:c.riderWarnings.map(x=>({
        riderId:x.riderId,optimisticLead:x.optimisticLeadSeconds,
        earliestPriorWarning:x.firstEarlierWarningSeconds,
        leadEnough:x.enoughRecordedWarningUnderOptimisticAssumptions
       }))})
     }
    }
    rows.push(entry)
    for(const ev of selectedEvents.filter(x=>x.q===q)){
     const tick=Math.floor((ev.sourceTime-1e-7)/10)
     const sub=Math.round((ev.sourceTime-tick*10)/q)-1
     const preview=reference.observed[tick].previews[sub]
     const next=reference.observed[tick].previews[sub+1]??null
     const previous=inspectFrozenComponentInterventionsV3(preview,g)
     const e=traceCase(preview,next,g,v,q,previous.combinedChangedComponents.members,
      reference.observed,ev.sourceTime)
     spotlights.push({...ev,firstActualTime:entry.firstTime,
      sourceContactPairs:previous.sourcePairs,
      geometryAllowed:e.result.geometryAllow,
      classification:e.result.status,
      brakingWarnings:e.riderWarnings})
    }
   }catch(error){const f={road:g.id,n,v,q,error:String(error.stack??error)}
    errors.push(f);console.error(JSON.stringify(f))}
  }
 }
}
assert.equal(errors.length,0,'A56 retrospective anticipation audit failure')
assert.equal(physicsRuns,162)
assert.equal(localTotal,75)
assert.equal(rows.length,81)
assert.equal(spotlights.length,4)
assert.equal(unchangedSourceCounterfactuals,57)
const byQuantum=[...groups.values()]
assert.deepEqual(byQuantum.map(x=>x.localTrials),[31,1,43])
assert.deepEqual(byQuantum.map(x=>x.geometryRejected),[0,0,5])
assert.equal(byQuantum.reduce((a,x)=>a+x.geometrySafe,0),70)
assert.equal(byQuantum.reduce((a,x)=>a+x.ordinaryBounded,0),0)
const report={study:'A2_STEP56_RETROSPECTIVE_ANTICIPATION_AND_BRAKING',
 technicalGate:'PASS',sportingGate:'NO_GO',
 physicsRuns,firstFrozenDifferences:unchangedSourceCounterfactuals,
 localComponentTrials:localTotal,geometrySafeLocals:70,geometryRejectedLocals:5,
 boundedOrdinaryAlternatives:0,byQuantum,spotlights,
 individualRiderWarnings:warnings,individualCases:rows,
 syntheticBoundedEarlyBrakingCertified:true,
 syntheticLateUnbrakedContactRejected:true,
 warningHypothesis:'retrospective, 10s prior trace, frozen commands; no early intervention has been simulated in the full pack',
 productionPolicyChanged:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP56_DIR??'/tmp/a2-step56'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step56-anticipation.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,physicsRuns:report.physicsRuns,
 geometrySafeLocals:report.geometrySafeLocals,
 localTrials:report.localComponentTrials,
 boundedOrdinaryAlternatives:report.boundedOrdinaryAlternatives,
 byQuantum,spotlights:spotlights.map(x=>({
  name:x.name,sourceTime:x.sourceTime,firstActualTime:x.firstActualTime,
  sourceContactPairs:x.sourceContactPairs,
  geometryAllowed:x.geometryAllowed,classification:x.classification,
  riders:x.brakingWarnings.map(w=>({
   id:w.riderId,shortfall:w.forwardShortfallM,brake:w.requiredBrakingMps2,
   optimisticLead:w.optimisticLeadSeconds,
   firstWarning:w.firstEarlierWarningSeconds,
   leadEnough:w.enoughRecordedWarningUnderOptimisticAssumptions
  }))
 })),syntheticBoundedEarlyBrakingCertified:true,
 productionPolicyChanged:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
