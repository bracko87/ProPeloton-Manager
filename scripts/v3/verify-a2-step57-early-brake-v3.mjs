/** A57 actual pre-substep checkpoint bounded-braking shadow intervention. OFFLINE ONLY.
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
import {replayEarlyBrakingShadowV3} from './a2EarlyCheckpointBrakeReplayV3.mjs'
import {initializeEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
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










const g0=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
// Concrete controlled forward integration: from actual frozen t=0 state,
// a rear rider at 8m/s brakes at -0.85m/s² while an unreactive front rider
// at 6m/s is 10m ahead. The full 10s quadratic sweep stays clear.
const synthEnergy=initializeEnergyBalanceResearchV3({criticalWatts:230,wPrimeJoules:18000})
const synthetic=Array.from({length:6},(_,tick)=>({previews:Array.from({length:10},(_,i)=>{
 const s=tick*10+i,e=s+1
 const front=10+s*6,back=s<=3?s*8:24+(s-3)*6
 return {tickStartSeconds:tick*10,substep:i+1,dtSeconds:1,
  proposals:[
   {riderId:'rear',x0:back,y0:0,oldSpeedMps:s<3?8:6,
    energyBefore:{...synthEnergy,seconds:s}},
   {riderId:'front',x0:front,y0:0,oldSpeedMps:6,
    energyBefore:{...synthEnergy,seconds:s}}
  ],achieved:[
   {riderId:'rear',x1:s<3?back+8:back+6,y1:0},
   {riderId:'front',x1:front+6,y1:0}
  ] }
 })}))
const syntheticMirror=synthetic.map(t=>({previews:t.previews.map(p=>({
 ...p,proposals:p.proposals.map(x=>({...x,y0:(g0.laneCount-1)*g0.centerStepM})),
 achieved:p.achieved.map(x=>({...x,y1:(g0.laneCount-1)*g0.centerStepM}))
}))}))
const syntheticTrial=replayEarlyBrakingShadowV3(synthetic,g0,0,'rear',1,5,
 {dt:1,horizonSeconds:10})
assert.equal(syntheticTrial.completedFullHorizon,true)
assert.equal(syntheticTrial.reachedCriticalEvent,true)
assert.equal(syntheticTrial.blockers.length,0)
assert.equal(syntheticTrial.energyValid,true)
assert.equal(syntheticTrial.stepCount,10)
assert(syntheticTrial.records.every(s=>s.ordinaryBrakingMps2<=.85))
const replayCopy=replayEarlyBrakingShadowV3(JSON.parse(JSON.stringify(synthetic)),
 g0,0,'rear',1,5,{dt:1,horizonSeconds:10})
assert.deepEqual(replayCopy,syntheticTrial)
const mirrorControl=replayEarlyBrakingShadowV3(syntheticMirror,g0,0,'rear',1,5,
 {dt:1,horizonSeconds:10})
assert.equal(mirrorControl.completedFullHorizon,syntheticTrial.completedFullHorizon)
assert.equal(mirrorControl.blockers.length,syntheticTrial.blockers.length)
const syntheticRen=synthetic.map(t=>({previews:t.previews.map(p=>({
 ...p,proposals:p.proposals.map(x=>({...x,riderId:x.riderId==='rear'?'Z':'A'})),
 achieved:p.achieved.map(x=>({...x,riderId:x.riderId==='rear'?'Z':'A'}))
}))}))
const renamedTrial=replayEarlyBrakingShadowV3(syntheticRen,g0,0,'Z',1,5,
 {dt:1,horizonSeconds:10})
assert.equal(renamedTrial.completedFullHorizon,true)
assert.equal(renamedTrial.blockers.length,0)
// Negative control: contact at the *starting* point cannot be fixed by
// subsequent ordinary braking; explicit blocked result, never a pass.
const crowded=synthetic.map(t=>({previews:t.previews.map(p=>({
 ...p,proposals:p.proposals.map(x=>x.riderId==='front'?{...x,x0:x.x0-8}:x),
 achieved:p.achieved.map(x=>x.riderId==='front'?{...x,x1:x.x1-8}:x)
}))}))
const crowdedTrial=replayEarlyBrakingShadowV3(crowded,g0,0,'rear',1,5,
 {dt:1,horizonSeconds:10})
assert.equal(crowdedTrial.completedFullHorizon,false)
assert(crowdedTrial.blockers.length>0)

const spotlights=[
 {name:'baseline_5m',road:'baseline_5m',n:8,v:1,q:.5,time:51},
 {name:'wide_6_5m',road:'wide_6_5m',n:8,v:1,q:.5,time:51.5},
 {name:'cautious32_v0',road:'cautious_5m',n:32,v:0,q:2.5,time:22.5},
 {name:'cautious32_v1',road:'cautious_5m',n:32,v:1,q:2,time:22}
]
const byQuantum=new Map([.5,2,2.5].map(q=>[q,{quantum:q,
 fixtureComparisons:0,firstDivergenceCases:0,localComponents:0,
 safeGeometricComponents:0,blockedGeometricComponents:0,
 brakingObservations:0,noEarlierWarningObservations:0,
 earlierWarnings:0,optimisticLeadSatisfiedObservations:0,
 actualReplays:0,completedFullHorizon:0,
 reachedCriticalEventWithoutBlock:0,
 collidedWithFrozenOtherRider:0,energyFailed:0,
 missedFullHorizon:0,maxBrakingLeadSeconds:0,
 maxBrakeMechanicalJ:0,largestReplaySeconds:0
}]))
const evidence=[],sourceSpotlights=[],failures=[]
let physicalRuns=0,episodeCount=0
function frozenHybridPaths(preview,g,ids){
 const raw=preview.proposals.map(p=>({riderId:p.riderId,
  original:{meters:p.x0,y:p.y0,speedMps:p.oldSpeedMps},
  forward:p.proposedMeters,y:p.proposedY}))
 const can=new Map(resolveContactPriorityV3(raw,g,
  {policy:'contact_time_lane_occupancy'}).paths.map(x=>[x.riderId,x]))
 const a44=new Map(preview.achieved.map(x=>[x.riderId,x]))
 const selected=new Set(ids)
 return preview.proposals.map(p=>{
  const x=selected.has(p.riderId)?can.get(p.riderId):a44.get(p.riderId)
  return {riderId:p.riderId,x0:p.x0,y0:p.y0,x1:x.x1,y1:x.y1}
 })
}
function analyzeHistory(trace,g,grade,eventTime,preview,ids,q){
 const hypothetical=frozenHybridPaths(preview,g,ids)
 const env=inspectConstantAccelerationEnvelopeV3(preview,hypothetical,q)
 const selectedChanged=new Set(inspectFrozenComponentInterventionsV3(preview,g).changedByFullCounterfactual)
 const changed=new Set(ids.filter(id=>selectedChanged.has(id)))
 const riders=env.riders.filter(x=>changed.has(x.riderId)&&
  x.reason==='BRAKING_EXCEEDS_0_85_MPS2'&&
  x.forwardShortfallFromLegalMinimumM>0)
 return riders.map(violation=>{
  const warning=auditHistoricalWarningV3(trace,eventTime,violation,q,g,
   {historySeconds:10})
  const before=JSON.stringify(trace)
  const shadow=warning.firstEarlierWarningSeconds===null?null:
   replayEarlyBrakingShadowV3(trace,g,grade,violation.riderId,
    warning.firstEarlierWarningSeconds,eventTime,{dt:q,horizonSeconds:10})
  const clone=shadow?replayEarlyBrakingShadowV3(
   JSON.parse(JSON.stringify(trace)),g,grade,violation.riderId,
   warning.firstEarlierWarningSeconds,eventTime,{dt:q,horizonSeconds:10}):null
  if(shadow)assert.deepEqual(shadow,clone,'A57 serialized early checkpoint replay mismatch')
  assert.equal(JSON.stringify(trace),before,'A57 modified A44 frozen source history')
  return {violation,warning,shadow}
 })
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const matched=spotlights.filter(x=>x.road===g.id&&x.n===n&&x.v===v)
  const quanta=matched.some(x=>x.q===2)?[.5,2,2.5]:[.5,2.5]
  for(const q of quanta){
   try{
    const ref=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const alternative=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,
     {diagnostics:true})
    physicalRuns+=2
    const totals=byQuantum.get(q);totals.fixtureComparisons++
    const first=analyzeFirstDecisionV3(ref,alternative,g,q)
    if(first){
     totals.firstDivergenceCases++
     const prev=ref.observed[first.tick].previews[first.substep-1]
     const groups=inspectFrozenComponentInterventionsV3(prev,g)
     for(const component of groups.isolatedComponents){
      totals.localComponents++
      if(!component.collisionFree){totals.blockedGeometricComponents++;continue}
      totals.safeGeometricComponents++
      const trials=analyzeHistory(ref.observed,g,[-3,0][v],
       first.firstAcceptedDifferenceSeconds,prev,component.members,q)
      for(const one of trials){
       episodeCount++;totals.brakingObservations++
       const w=one.warning,s=one.shadow
       totals.noEarlierWarningObservations+=Number(w.noRecordedEarlyWarning)
       totals.earlierWarnings+=Number(!w.noRecordedEarlyWarning)
       totals.optimisticLeadSatisfiedObservations+=Number(
        w.enoughRecordedWarningUnderOptimisticAssumptions)
       if(s){
        totals.actualReplays++
        totals.completedFullHorizon+=Number(s.completedFullHorizon)
        totals.reachedCriticalEventWithoutBlock+=Number(s.reachedCriticalEvent)
        totals.collidedWithFrozenOtherRider+=Number(s.blockers.length>0)
        totals.energyFailed+=Number(!s.energyValid)
        totals.missedFullHorizon+=Number(!s.completedFullHorizon)
        totals.maxBrakingLeadSeconds=Math.max(totals.maxBrakingLeadSeconds,
         first.firstAcceptedDifferenceSeconds-s.sourceStartSeconds)
        totals.maxBrakeMechanicalJ=Math.max(totals.maxBrakeMechanicalJ,
         s.achievedMechanicalJ)
        totals.largestReplaySeconds=Math.max(totals.largestReplaySeconds,
         s.records.length*q)
       }
       evidence.push({road:g.id,n,v,q,component:component.members,
        firstTime:first.firstAcceptedDifferenceSeconds,riderId:one.violation.riderId,
        warning:{firstEarlierWarningSeconds:w.firstEarlierWarningSeconds,
         optimisticLeadSeconds:w.optimisticLeadSeconds,
         leadEnough:w.enoughRecordedWarningUnderOptimisticAssumptions},
        attempted:Boolean(s),
        actual:s?{startingAt:s.sourceStartSeconds,steps:s.stepCount,
         firstBlocked:s.firstBlockedSeconds,blockedPairs:s.blockers,
         energyValid:s.energyValid,criticalEventReached:s.reachedCriticalEvent,
         fullHorizonComplete:s.completedFullHorizon,
         terminalSpeedMps:s.records.at(-1)?.endSpeedMps,
         remainingWPrimeJ:s.remainingWPrimeJ}:null})
      }
     }
    }
    for(const sp of matched.filter(x=>x.q===q)){
     const t=Math.floor((sp.time-1e-7)/10),k=Math.round((sp.time-t*10)/q)-1
     const pv=ref.observed[t].previews[k]
     const controls=inspectFrozenComponentInterventionsV3(pv,g)
     const trial=analyzeHistory(ref.observed,g,[-3,0][v],
      sp.time,pv,controls.combinedChangedComponents.members,q)
     sourceSpotlights.push({...sp,firstActualTime:first?.firstAcceptedDifferenceSeconds,
      originalPairs:controls.sourcePairs,
      riders:trial.map(x=>({riderId:x.violation.riderId,
       earliestAlert:x.warning.firstEarlierWarningSeconds,
       optimisticLead:x.warning.optimisticLeadSeconds,
       attempted:Boolean(x.shadow),
       fullHorizonComplete:x.shadow?.completedFullHorizon??null,
       collisionSeconds:x.shadow?.firstBlockedSeconds??null,
       reachedEvent:x.shadow?.reachedCriticalEvent??null}))})
    }
   }catch(e){const f={road:g.id,n,v,q,error:String(e.stack??e)}
    failures.push(f);console.error(JSON.stringify(f))}
  }
 }
}
assert.equal(failures.length,0,'A57 early checkpoint replay technical failures')
assert.equal(physicalRuns,162)
assert.equal(episodeCount,110)
assert.equal(evidence.length,110)
assert.equal(sourceSpotlights.length,4)
const totals=[...byQuantum.values()]
assert.deepEqual(totals.map(x=>x.localComponents),[31,1,43])
assert.deepEqual(totals.map(x=>x.blockedGeometricComponents),[0,0,5])
assert.equal(totals.reduce((a,x)=>a+x.actualReplays,0),67)
assert.equal(totals.reduce((a,x)=>a+x.noEarlierWarningObservations,0),43)
assert.equal(totals.reduce((a,x)=>a+x.optimisticLeadSatisfiedObservations,0),21)
const report={study:'A2_STEP57_ACTUAL_CHECKPOINT_EARLY_BRAKE_SHADOW',
 technicalGate:'PASS',sportingGate:'NO_GO',
 physicsRuns,localComponents:75,geometricallyBlocked:5,
 brakingObservations:episodeCount,
 recordedEarlyWarningObservations:67,absentEarlyWarningObservations:43,
 actualPreSubstepCheckpointInterventions:67,
 byQuantum:totals,sourceSpotlights,caseEvidence:evidence,
 positiveTwoRiderControlledEarlyBrake:{fullySweptSafe:syntheticTrial.completedFullHorizon,
  exactJSONReplay:true,mirrorInvariant:true,renamingInvariant:true,
  deliberatelyCrowdedRejected:true},
 limitation:'Each alternate cyclist is integrated with bounded braking from the observed actual A44 pre-substep state; all other riders replay exactly original A44 accepted paths without response. Full interactive pack physics NOT certified.',
 activationApproved:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP57_DIR??'/tmp/a2-step57'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step57-early-braking.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,physicsRuns:report.physicsRuns,
 brakingObservations:report.brakingObservations,
 actualPreSubstepCheckpointInterventions:report.actualPreSubstepCheckpointInterventions,
 byQuantum:report.byQuantum,sourceSpotlights:report.sourceSpotlights,
 positiveTwoRiderControlledEarlyBrake:report.positiveTwoRiderControlledEarlyBrake,
 activationApproved:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
