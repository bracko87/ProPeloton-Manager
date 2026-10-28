/** A55 acceleration-bounded physical response feasibility and emergency screen. OFFLINE ONLY.
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








const baseG=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const directPreview={proposals:[
 {riderId:'P',x0:100,y0:0,oldSpeedMps:5},
 {riderId:'Q',x0:110,y0:0,oldSpeedMps:5}
]}
const nominal=[
 {riderId:'P',x0:100,y0:0,x1:105,y1:0},
 {riderId:'Q',x0:110,y0:0,x1:115,y1:0}
]
const valid=inspectConstantAccelerationEnvelopeV3(directPreview,nominal,1)
assert.equal(valid.allFeasible,true)
assert.equal(valid.infeasibleIds.length,0)
const clear=conservativeQuadraticSweepV3(directPreview,nominal,baseG,1)
assert.equal(clear.certifiedSafe,true)
assert.equal(clear.status,'QUADRATIC_CONTINUOUS_CLEARANCE_CERTIFIED')
const brake=inspectConstantAccelerationEnvelopeV3(directPreview,
 nominal.map(x=>x.riderId==='P'?{...x,x1:101}:x),1)
assert.equal(brake.allFeasible,false)
assert.equal(brake.riders[0].reason,'BRAKING_EXCEEDS_0_85_MPS2')
assert(brake.riders[0].requiredBrakeMagnitudeMps2>0.85)
assert(brake.riders[0].forwardShortfallFromLegalMinimumM>0)
const sprint=inspectConstantAccelerationEnvelopeV3(directPreview,
 nominal.map(x=>x.riderId==='P'?{...x,x1:107}:x),1)
assert.equal(sprint.allFeasible,false)
assert.equal(sprint.riders[0].reason,'ACCELERATION_EXCEEDS_0_45_MPS2')
const lateral=inspectConstantAccelerationEnvelopeV3(directPreview,
 nominal.map(x=>x.riderId==='P'?{...x,y1:1}:x),1)
assert.equal(lateral.riders[0].reason,'LATERAL_RATE_EXCEEDED')
const curveRisk=conservativeQuadraticSweepV3(directPreview,nominal.map(x=>
 x.riderId==='Q'?{...x,x1:109}:x),baseG,1)
 // intentionally malformed source must fail closed, not provide a certificate
assert.equal(curveRisk.status,'SKIPPED_INFEASIBLE_VELOCITY')
assert.throws(()=>inspectConstantAccelerationEnvelopeV3(directPreview,
 nominal.map(x=>x.riderId==='P'?{...x,x0:101}:x),1))
const sourceEvents=[
 {name:'baseline_r004_r005',road:'baseline_5m',n:8,v:1,q:.5,time:51},
 {name:'wide_r004_r005',road:'wide_6_5m',n:8,v:1,q:.5,time:51.5},
 {name:'cautious32_v0',road:'cautious_5m',n:32,v:0,q:2.5,time:22.5},
 {name:'cautious32_v1',road:'cautious_5m',n:32,v:1,q:2,time:22}
]
const rows=[],spotlights=[],failures=[]
let physicsRuns=0,localTrials=0,unionTrials=0
const totals=new Map([.5,2,2.5].map(q=>[q,{
 quantum:q,fixtures:0,firstDifferences:0,
 localTrials:0,geometryRejected:0,geometryAllowed:0,
 energyReplayed:0,velocityBounded:0,unbounded:0,
 introducedViolationCases:0,baselinePreexistingInfeasibleCases:0,
 changedInfeasibleCases:0,requiresEmergencyCases:0,
 quadraticSweepCertified:0,quadraticSweepUnresolved:0,
 nextReplayChecked:0,unchangedOutsideInfeasibleCases:0,
 maximumRequiredBrakingMps2:0,maximumForwardShortfallM:0,
 unions:0,unionGeometryRejected:0,unionVelocityBounded:0,
 unionEmergencyCases:0
}]))
function observedAudit(preview,next,g,grade,q,ids){
 const original=JSON.stringify([preview,next,ids])
 const result=auditVelocityBoundedHybridV3(preview,next,g,
  {gradePercent:grade},ids,{physicalSeconds:q})
 assert.equal(result.officialWrites,0)
 assert.equal(result.sportingApproval,'NOT_APPROVED')
 assert.equal(JSON.stringify([preview,next,ids]),original)
 if(result.geometryAllow){
  assert.equal(result.energyLedgerVerified,true)
  assert.equal(result.nextStepChecked,Boolean(next))
  assert.equal(result.exactTwoStepReplay,Boolean(next))
  assert(['BOUNDED_TWO_STEP_RESEARCH_CANDIDATE','REJECTED_UNBOUNDED_VELOCITY',
   'REJECTED_QUADRATIC_CONTACT_UNRESOLVED'].includes(result.status))
  assert(result.biggestRequiredBrakeMps2>=0)
  if(result.ordinaryVelocityPass){
   assert.equal(result.numberOfAllRiderVelocityFailures,0)
   assert.equal(result.quadraticSweep.certifiedSafe,true)
  }else assert.notEqual(result.status,'BOUNDED_TWO_STEP_RESEARCH_CANDIDATE')
 }else assert.equal(result.status,'REJECTED_GEOMETRY')
 return result
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const highlights=sourceEvents.filter(x=>x.road===g.id&&x.n===n&&x.v===v)
  const qs=highlights.some(x=>x.q===2)?[.5,2,2.5]:[.5,2.5]
  for(const q of qs){
   try{
    const reference=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const candidate=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,{diagnostics:true})
    physicsRuns+=2
    const stat=totals.get(q);stat.fixtures++
    const first=analyzeFirstDecisionV3(reference,candidate,g,q)
    const row={road:g.id,n,v,q,firstTime:first?.firstAcceptedDifferenceSeconds??null,
     locals:[],union:null}
    if(first){
     stat.firstDifferences++
     const tick=reference.observed[first.tick]
     const preview=tick.previews[first.substep-1]
     const next=tick.previews[first.substep]??null
     const previous=inspectFrozenComponentInterventionsV3(preview,g)
     const grade=[-3,0][v]
     // The unchanged A44 reference baseline is also explicitly assessed.
     const baseline=observedAudit(preview,next,g,grade,q,[])
     assert.equal(baseline.geometryAllow,true)
     assert.equal(baseline.numberOfIntroducedFailures,0)
     for(const local of previous.isolatedComponents){
      const result=observedAudit(preview,next,g,grade,q,local.members)
      localTrials++;stat.localTrials++
      assert.equal(result.geometryAllow,local.collisionFree,
       'A55 changed A53 independent geometric result')
      const record={members:local.members,status:result.status,
       geometryAllowed:result.geometryAllow}
      if(!result.geometryAllow)stat.geometryRejected++
      else{
       stat.geometryAllowed++;stat.energyReplayed++
       stat.nextReplayChecked+=Number(result.nextStepChecked)
       stat.velocityBounded+=Number(result.ordinaryVelocityPass)
       stat.unbounded+=Number(result.status==='REJECTED_UNBOUNDED_VELOCITY')
       stat.quadraticSweepCertified+=Number(result.quadraticSweep.certifiedSafe)
       stat.quadraticSweepUnresolved+=Number(
        result.quadraticSweep.status==='CONSERVATIVE_SWEEP_UNRESOLVED')
       stat.introducedViolationCases+=Number(result.numberOfIntroducedFailures>0)
       stat.changedInfeasibleCases+=Number(result.numberOfChangedRiderVelocityFailures>0)
       stat.baselinePreexistingInfeasibleCases+=Number(result.baselineFailureCount>0)
       stat.requiresEmergencyCases+=Number(result.requiresExplicitEmergency)
       stat.unchangedOutsideInfeasibleCases+=Number(
        result.frozenOutsideInfeasibleIds.length>0)
       stat.maximumRequiredBrakingMps2=Math.max(
        stat.maximumRequiredBrakingMps2,result.biggestRequiredBrakeMps2)
       stat.maximumForwardShortfallM=Math.max(
        stat.maximumForwardShortfallM,result.maxLegalForwardShortfallM)
       Object.assign(record,{
        introduced:result.introducedViolationIds,
        changedUnbounded:result.numberOfChangedRiderVelocityFailures,
        outsideUnbounded:result.frozenOutsideInfeasibleIds,
        requiresEmergency:result.requiresExplicitEmergency,
        biggestRequiredBrakingMps2:result.biggestRequiredBrakeMps2,
        maxLegalForwardShortfallM:result.maxLegalForwardShortfallM,
        quadraticStatus:result.quadraticSweep.status})
      }
      row.locals.push(record)
     }
     const combined=observedAudit(preview,next,g,grade,q,
      previous.combinedChangedComponents.members)
     unionTrials++;stat.unions++
     assert.equal(combined.geometryAllow,previous.interventionSafety.combinedSafe)
     stat.unionGeometryRejected+=Number(!combined.geometryAllow)
     stat.unionVelocityBounded+=Number(combined.ordinaryVelocityPass)
     stat.unionEmergencyCases+=Number(combined.requiresExplicitEmergency)
     row.union={status:combined.status,geometryAllowed:combined.geometryAllow,
      ordinaryVelocityPass:combined.ordinaryVelocityPass}
    }
    rows.push(row)
    for(const spec of highlights.filter(x=>x.q===q)){
     const tick=Math.floor((spec.time-1e-7)/10)
     const sub=Math.round((spec.time-tick*10)/q)-1
     const prev=reference.observed[tick].previews[sub]
     const next=reference.observed[tick].previews[sub+1]??null
     const src=inspectFrozenComponentInterventionsV3(prev,g)
     const x=observedAudit(prev,next,g,[-3,0][v],q,
      src.combinedChangedComponents.members)
     spotlights.push({...spec,firstTime:row.firstTime,
      sourcePairs:src.sourcePairs,sourceAffectedGroups:src.affectedGroups,
      status:x.status,geometryAllowed:x.geometryAllow,
      introduced:x.introducedViolationIds??[],
      emergencyBrakeIds:x.requiredEmergencyBrakeIds??[],
      maxRequiredBrakingMps2:x.biggestRequiredBrakeMps2??null,
      ordinaryVelocityPass:x.ordinaryVelocityPass})
    }
   }catch(e){const failure={road:g.id,n,v,q,error:String(e.stack??e)}
    failures.push(failure);console.error(JSON.stringify(failure))}
  }
 }
}
assert.equal(failures.length,0,'A55 velocity-bounded physical audit failed')
assert.equal(physicsRuns,162)
assert.equal(rows.length,81)
assert.equal(rows.filter(x=>x.firstTime!==null).length,57)
assert.equal(localTrials,75);assert.equal(unionTrials,57)
assert.equal(spotlights.length,4)
const byQuantum=[...totals.values()]
assert.deepEqual(byQuantum.map(x=>x.localTrials),[31,1,43])
assert.deepEqual(byQuantum.map(x=>x.geometryRejected),[0,0,5])
assert.deepEqual(byQuantum.map(x=>x.unionGeometryRejected),[0,0,4])
assert.equal(byQuantum.reduce((a,x)=>a+x.geometryAllowed,0),70)
const passTotal=byQuantum.reduce((a,x)=>a+x.velocityBounded,0)
const introTotal=byQuantum.reduce((a,x)=>a+x.introducedViolationCases,0)
const emergencyTotal=byQuantum.reduce((a,x)=>a+x.requiresEmergencyCases,0)
const report={study:'A2_STEP55_VELOCITY_BOUNDED_CONTACT_FEASIBILITY',
 technicalGate:'PASS',sportingGate:'NO_GO',physicsRuns,
 matchedGridComparisons:rows.length,localComponentTrials:localTrials,
 geometricSafeLocals:70,geometricBlockedLocals:5,
 boundedAndQuadraticSafeLocals:passTotal,
 introducedVelocityViolationCases:introTotal,
 explicitEmergencyRequiredCases:emergencyTotal,
 fullTenSecondHybridTick:'NOT_PERFORMED',
 policyActivated:false,
 byQuantum,spotlights,individualCases:rows,failures,
 approvedForProduction:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP55_DIR??'/tmp/a2-step55'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step55-velocity-bounded.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,physicsRuns:report.physicsRuns,
 geometricSafeLocals:report.geometricSafeLocals,geometricBlockedLocals:report.geometricBlockedLocals,
 boundedAndQuadraticSafeLocals:report.boundedAndQuadraticSafeLocals,
 introducedVelocityViolationCases:report.introducedVelocityViolationCases,
 explicitEmergencyRequiredCases:report.explicitEmergencyRequiredCases,
 byQuantum,spotlights,policyActivated:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
