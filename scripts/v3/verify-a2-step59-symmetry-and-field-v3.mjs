/** A59 all 67 mirrored/relabelled scenarios and all-rider bounded response stress test. OFFLINE ONLY.
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
import {auditCoupledBrakeChoicesV3,buildCoupledBrakeOptionsV3,replayCoupledEarlyBrakeV3} from './a2CoupledCheckpointBrakeAuditV3.mjs'
import {initializeEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
import {mirrorRecordedA44V3,relabelRecordedA44V3,mirrorStrategyV3,replayAllRiderAnticipationProbeV3} from './a2MirrorAndFullFieldProbeV3.mjs'
import {auditFirstFullFieldContactV3} from './a2FirstContactFeasibilityV3.mjs'
import {precedingPhysicalCheckpointsV3} from './a2UpstreamPredictionV3.mjs'
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


const spotlights=[
 {name:'baseline_5m',road:'baseline_5m',n:8,v:1,q:.5,time:51},
 {name:'wide_6_5m',road:'wide_6_5m',n:8,v:1,q:.5,time:51.5},
 {name:'cautious32_v0',road:'cautious_5m',n:32,v:0,q:2.5,time:22.5},
 {name:'cautious32_v1',road:'cautious_5m',n:32,v:1,q:2,time:22}
]
const totals=new Map([.5,2,2.5].map(q=>[q,{quantum:q,comparisons:0,
 firstDifferences:0,componentTrials:0,geometryRejected:0,
 brakingObservations:0,earlyWarnings:0,options:0,
 mirrorOptionMismatch:0,renameOptionMismatch:0,
 mirrorCollisionPairMismatch:0,renameCollisionPairMismatch:0,
 mirrorAnyOutcomeMismatch:0,renameAnyOutcomeMismatch:0,
 rightSteerRescues:0,mirroredLeftSteerRescues:0,
 frozenSuccess:0,fullFieldAttempts:0,fullFieldSuccess:0,
 fullFieldCriticalReached:0,fullFieldCollisionBlocked:0,
 fullFieldEnergyFailed:0,fullFieldHeadwayReactions:0,
 maxFullFieldLateralMps:0
}]))
const a61={scenarios:0,priorCheckpointsAvailable:0,startedEarlier:0,
 minLeadBeforeAlertSeconds:null,maxLeadBeforeAlertSeconds:0,
 earlyMatchedLaneIntentClear:0,upstream3sClear:0,upstream5sClear:0,
 upstream3sRescues:0,upstream3sRegressions:0,
 upstream5sRescues:0,upstream5sRegressions:0,
 upstream3sEventPairs:0,upstream5sEventPairs:0,
 upstream3sBrakes:0,upstream5sBrakes:0,
 mirrorOutcomeMismatch:0,renameOutcomeMismatch:0,
 mirrorFirstPairMismatch:0,renameFirstPairMismatch:0,jsonReplayMismatch:0,
 firstContactBeforeOriginalWarning:0,
 byQuantum:{'0.5':{scenarios:0,baseClear:0,upstream3Clear:0,upstream5Clear:0},
 '2.5':{scenarios:0,baseClear:0,upstream3Clear:0,upstream5Clear:0}}}
const cases=[],errors=[],historical=[]
const a60={scenarios:0,previousFieldClear:0,fixedBrakeClear:0,
 laneIntentClear:0,laneIntentRegressions:0,laneIntentRescues:0,
 newLaneIntentWarningPairs:0,laneIntentBrakeDecisions:0,
 legacyFirstContactTypes:{},laneIntentFirstContactTypes:{},
 legacyFirstFeasibility:{},laneIntentFirstFeasibility:{},
 mirrorOutcomeMismatches:0,renameOutcomeMismatches:0,
 mirrorFirstPairMismatches:0,renameFirstPairMismatches:0,
 sameInputPhysicalReplayMismatches:0}
let physicsRuns=0,mirrors=0,renames=0
const atAlert=(observed,warning,primary,g)=>{
 const p=observed.flatMap(x=>x.previews).find(x=>
  Math.abs(x.tickStartSeconds+x.substep*x.dtSeconds-warning)<1e-6)
 assert(p,'A59 alert-time source checkpoint absent')
 return buildCoupledBrakeOptionsV3(p,primary,g)
}
const compare=(reference,variant,keyTransform,idTransform)=>{
 const target=new Map(variant.attempts.map(x=>[x.strategy,x]))
 let outcomes=0,pairs=0
 for(const a of reference.attempts){
  const b=target.get(keyTransform(a.strategy))
  if(!b){outcomes++;continue}
  if(a.completedFullHorizon!==b.completedFullHorizon||
   a.energyValid!==b.energyValid||
   a.reactionCount!==b.reactionCount)outcomes++
  const ids=a.firstBlockers.map(x=>x.ids.map(idTransform).sort().join(',')).sort()
  const other=b.firstBlockers.map(x=>x.ids.slice().sort().join(',')).sort()
  if(JSON.stringify(ids)!==JSON.stringify(other))pairs++
 }
 if(reference.attempts.length!==variant.attempts.length)outcomes++
 return {outcomes,pairs}
}
// Entire-field positive and negative synthetic controls, with a real shared
// pre-step energy state for three cyclists.
const g0=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const e0=initializeEnergyBalanceResearchV3({criticalWatts:230,wPrimeJoules:18000})
const makeSource=(overlap=false)=>Array.from({length:6},(_,tick)=>({
 previews:Array.from({length:10},(_,i)=>{
  const t=tick*10+i
  return {tickStartSeconds:tick*10,substep:i+1,dtSeconds:1,
   proposals:[
    {riderId:'rear',x0:100+t*8,y0:0,oldSpeedMps:8,
     requestedSpeedMps:8,requestedY:0,steeringWatts:35,
     energyBefore:{...e0,seconds:t}},
    {riderId:'trailer',x0:94+t*8+(overlap?5.5:0),y0:0,oldSpeedMps:8,
     requestedSpeedMps:8,requestedY:0,steeringWatts:35,
     energyBefore:{...e0,seconds:t}},
    {riderId:'front',x0:110+t*6,y0:g0.centerStepM,oldSpeedMps:6,
     requestedSpeedMps:6,requestedY:g0.centerStepM,steeringWatts:35,
     energyBefore:{...e0,seconds:t}}
   ],achieved:[],previewConflictPairs:[]}
 })}))
const three=makeSource(),plan=atAlert(three,1,'rear',g0).options.find(x=>x.key==='WAKE_BRAKE')
const positive=replayAllRiderAnticipationProbeV3(three,g0,0,'rear',1,5,plan,{dt:1})
assert(positive.complete,'A59 positive full-field controlled wake response failed')
assert.deepEqual(positive,replayAllRiderAnticipationProbeV3(
 JSON.parse(JSON.stringify(three)),g0,0,'rear',1,5,plan,{dt:1}))
const mirror3=mirrorRecordedA44V3(three,g0)
assert(replayAllRiderAnticipationProbeV3(mirror3,g0,0,'rear',1,5,
 atAlert(mirror3,1,'rear',g0).options.find(x=>x.key==='WAKE_BRAKE'),{dt:1}).complete)
const rel3=relabelRecordedA44V3(three),id3=rel3.map.get('rear')
assert(replayAllRiderAnticipationProbeV3(rel3.source,g0,0,id3,1,5,
 atAlert(rel3.source,1,id3,g0).options.find(x=>x.key==='WAKE_BRAKE'),{dt:1}).complete)
assert.equal(replayAllRiderAnticipationProbeV3(makeSource(true),g0,0,
 'rear',1,5,plan,{dt:1}).status,'REJECTED_COLLISION')
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const tags=spotlights.filter(x=>x.road===g.id&&x.n===n&&x.v===v)
  const qs=tags.some(x=>x.q===2)?[.5,2,2.5]:[.5,2.5]
  for(const q of qs){
   try{
    const A=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const B=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,{diagnostics:true})
    physicsRuns+=2
    const s=totals.get(q);s.comparisons++
    const first=analyzeFirstDecisionV3(A,B,g,q)
    if(first){
     s.firstDifferences++
     const preview=A.observed[first.tick].previews[first.substep-1]
     const original=inspectFrozenComponentInterventionsV3(preview,g)
     for(const component of original.isolatedComponents){
      s.componentTrials++
      if(!component.collisionFree){s.geometryRejected++;continue}
      const analyses=analyzeHistory(A.observed,g,[-3,0][v],
       first.firstAcceptedDifferenceSeconds,preview,component.members,q)
      for(const a of analyses){
       s.brakingObservations++
       if(!a.shadow)continue
       s.earlyWarnings++
       const who=a.violation.riderId,alert=a.warning.firstEarlierWarningSeconds
       const before=JSON.stringify(A.observed)
       const normal=auditCoupledBrakeChoicesV3(A.observed,g,[-3,0][v],who,alert,
        first.firstAcceptedDifferenceSeconds,{dt:q,intervals:32})
       const mirroredSource=mirrorRecordedA44V3(A.observed,g)
       const mirror=auditCoupledBrakeChoicesV3(mirroredSource,g,[-3,0][v],who,alert,
        first.firstAcceptedDifferenceSeconds,{dt:q,intervals:32})
       mirrors++
       const relabeled=relabelRecordedA44V3(A.observed),newId=relabeled.map.get(who)
       const relabel=auditCoupledBrakeChoicesV3(relabeled.source,g,[-3,0][v],newId,alert,
        first.firstAcceptedDifferenceSeconds,{dt:q,intervals:32})
       renames++
       const M=compare(normal,mirror,mirrorStrategyV3,x=>x)
       const R=compare(normal,relabel,x=>x,x=>relabeled.map.get(x))
       assert.equal(JSON.stringify(A.observed),before,'A59 mutated immutable A44 history')
       s.mirrorOptionMismatch+=M.outcomes;s.mirrorCollisionPairMismatch+=M.pairs
       s.renameOptionMismatch+=R.outcomes;s.renameCollisionPairMismatch+=R.pairs
       s.mirrorAnyOutcomeMismatch+=Number(normal.anyFullHorizon!==mirror.anyFullHorizon)
       s.renameAnyOutcomeMismatch+=Number(normal.anyFullHorizon!==relabel.anyFullHorizon)
       s.options+=normal.attempts.length
       s.frozenSuccess+=Number(normal.anyFullHorizon)
       const rescued=normal.anyFullHorizon&&!normal.attempts[0].completedFullHorizon
       s.rightSteerRescues+=Number(rescued&&normal.firstFullHorizonStrategy==='SINGLE_BRAKE_STEER_RIGHT')
       s.mirroredLeftSteerRescues+=Number(mirror.anyFullHorizon&&
        !mirror.attempts[0].completedFullHorizon&&
        mirror.firstFullHorizonStrategy==='SINGLE_BRAKE_STEER_LEFT')
       // For a failed A58 case, use the FIRST alert-time option. For a
       // successful case, use the retrospectively clear plan only as a
       // stress-test comparator, NEVER as a proposed real-time controller.
       const name=normal.firstFullHorizonStrategy??'SINGLE_BRAKE'
       const chosen=atAlert(A.observed,alert,who,g).options.find(x=>x.key===name)
       assert(chosen,'A59 missing alert-time plan')
       const probe=replayAllRiderAnticipationProbeV3(A.observed,g,[-3,0][v],who,
        alert,first.firstAcceptedDifferenceSeconds,chosen,{dt:q,intervals:16})
       assert(probe.fullFieldIntegrated&&!probe.usedOriginalA44FrozenObstacles)
       const checkReplay=replayAllRiderAnticipationProbeV3(
        JSON.parse(JSON.stringify(A.observed)),g,[-3,0][v],who,alert,
        first.firstAcceptedDifferenceSeconds,JSON.parse(JSON.stringify(chosen)),
        {dt:q,intervals:16})
       assert.deepEqual(probe,checkReplay,'A59 all-field JSON replay failed')
       // A60 compares a SINGLE predetermined brake selection against a new
       // current-step lane-intent warning. There is NO hindsight choice among
       // A58 strategies in either of these full-field comparisons.
       const fixed=atAlert(A.observed,alert,who,g).options.find(x=>x.key==='SINGLE_BRAKE')
       const fixedMirror=atAlert(mirroredSource,alert,who,g).options.find(x=>x.key==='SINGLE_BRAKE')
       const fixedRename=atAlert(relabeled.source,alert,newId,g).options.find(x=>x.key==='SINGLE_BRAKE')
       assert(fixed&&fixedMirror&&fixedRename,'A60 missing prior-state fixed plan')
       const fixedOptions={dt:q,intervals:16}
       const legacyFixed=replayAllRiderAnticipationProbeV3(A.observed,g,[-3,0][v],
        who,alert,first.firstAcceptedDifferenceSeconds,fixed,fixedOptions)
       const laneFixed=replayAllRiderAnticipationProbeV3(A.observed,g,[-3,0][v],
        who,alert,first.firstAcceptedDifferenceSeconds,fixed,
        {...fixedOptions,preStepPolicy:'lane_intent'})
       const laneMirror=replayAllRiderAnticipationProbeV3(mirroredSource,g,[-3,0][v],
        who,alert,first.firstAcceptedDifferenceSeconds,fixedMirror,
        {...fixedOptions,preStepPolicy:'lane_intent'})
       const laneRename=replayAllRiderAnticipationProbeV3(relabeled.source,g,[-3,0][v],
        newId,alert,first.firstAcceptedDifferenceSeconds,fixedRename,
        {...fixedOptions,preStepPolicy:'lane_intent'})
       const laneJSON=replayAllRiderAnticipationProbeV3(
        JSON.parse(JSON.stringify(A.observed)),g,[-3,0][v],who,alert,
        first.firstAcceptedDifferenceSeconds,JSON.parse(JSON.stringify(fixed)),
        {...fixedOptions,preStepPolicy:'lane_intent'})
       a60.sameInputPhysicalReplayMismatches+=Number(
        JSON.stringify(laneFixed)!==JSON.stringify(laneJSON))
       a60.mirrorOutcomeMismatches+=Number(laneFixed.status!==laneMirror.status||
        laneFixed.steps!==laneMirror.steps)
       a60.renameOutcomeMismatches+=Number(laneFixed.status!==laneRename.status||
        laneFixed.steps!==laneRename.steps)
       const comparePair=(ref,other,convert)=>JSON.stringify(
        ref?.pair?.map(convert).sort()??[])===JSON.stringify(other?.pair?.slice().sort()??[])
       a60.mirrorFirstPairMismatches+=Number(!comparePair(laneFixed.firstBlocker,
        laneMirror.firstBlocker,x=>x))
       a60.renameFirstPairMismatches+=Number(!comparePair(laneFixed.firstBlocker,
        laneRename.firstBlocker,x=>relabeled.map.get(x)))
       const contactLegacy=auditFirstFullFieldContactV3(A.observed,g,alert,q,probe)
       const contactLane=auditFirstFullFieldContactV3(A.observed,g,alert,q,laneFixed)
       const count=(table,key)=>{table[key]=(table[key]??0)+1}
       count(a60.legacyFirstContactTypes,contactLegacy.firstPairKind??contactLegacy.status)
       count(a60.laneIntentFirstContactTypes,contactLane.firstPairKind??contactLane.status)
       count(a60.legacyFirstFeasibility,contactLegacy.feasibility??contactLegacy.status)
       count(a60.laneIntentFirstFeasibility,contactLane.feasibility??contactLane.status)
       a60.scenarios++;a60.previousFieldClear+=Number(probe.complete)
       a60.fixedBrakeClear+=Number(legacyFixed.complete)
       a60.laneIntentClear+=Number(laneFixed.complete)
       a60.laneIntentRegressions+=Number(legacyFixed.complete&&!laneFixed.complete)
       a60.laneIntentRescues+=Number(!legacyFixed.complete&&laneFixed.complete)
       a60.newLaneIntentWarningPairs+=laneFixed.intentWarningPairs
       a60.laneIntentBrakeDecisions+=laneFixed.additionalHeadwayBrakingDecisions
       // A61 starts the SAME original physical source checkpoint earlier
       // for all three autonomous policies. No rider is force-braked by
       // retrospectively identifying the A56 case primary.
       const prior=precedingPhysicalCheckpointsV3(A.observed,alert,q,{maxSeconds:5})
       const leadFrames=Math.min(Math.max(1,Math.floor(3/q)),prior.length)
       const settings={dt:q,intervals:16,controlMode:'autonomous',leadFrames}
       const earlierBaseline=replayAllRiderAnticipationProbeV3(A.observed,g,
        [-3,0][v],who,alert,first.firstAcceptedDifferenceSeconds,fixed,
        {...settings,preStepPolicy:'lane_intent'})
       const upstream3=replayAllRiderAnticipationProbeV3(A.observed,g,
        [-3,0][v],who,alert,first.firstAcceptedDifferenceSeconds,fixed,
        {...settings,preStepPolicy:'upstream_3s'})
       const upstream5=replayAllRiderAnticipationProbeV3(A.observed,g,
        [-3,0][v],who,alert,first.firstAcceptedDifferenceSeconds,fixed,
        {...settings,preStepPolicy:'upstream_5s'})
       const mirror5=replayAllRiderAnticipationProbeV3(mirroredSource,g,
        [-3,0][v],who,alert,first.firstAcceptedDifferenceSeconds,fixedMirror,
        {...settings,preStepPolicy:'upstream_5s'})
       const rename5=replayAllRiderAnticipationProbeV3(relabeled.source,g,
        [-3,0][v],newId,alert,first.firstAcceptedDifferenceSeconds,fixedRename,
        {...settings,preStepPolicy:'upstream_5s'})
       const serialized5=replayAllRiderAnticipationProbeV3(
        JSON.parse(JSON.stringify(A.observed)),g,[-3,0][v],who,alert,
        first.firstAcceptedDifferenceSeconds,JSON.parse(JSON.stringify(fixed)),
        {...settings,preStepPolicy:'upstream_5s'})
       const lead=Number((alert-q-upstream5.startSeconds).toFixed(6))
       a61.scenarios++
       a61.priorCheckpointsAvailable+=prior.length
       a61.startedEarlier+=Number(lead>1e-8)
       a61.minLeadBeforeAlertSeconds=a61.minLeadBeforeAlertSeconds===null?lead:
        Math.min(a61.minLeadBeforeAlertSeconds,lead)
       a61.maxLeadBeforeAlertSeconds=Math.max(a61.maxLeadBeforeAlertSeconds,lead)
       a61.earlyMatchedLaneIntentClear+=Number(earlierBaseline.complete)
       a61.upstream3sClear+=Number(upstream3.complete)
       a61.upstream5sClear+=Number(upstream5.complete)
       a61.upstream3sRescues+=Number(!earlierBaseline.complete&&upstream3.complete)
       a61.upstream5sRescues+=Number(!earlierBaseline.complete&&upstream5.complete)
       a61.upstream3sRegressions+=Number(earlierBaseline.complete&&!upstream3.complete)
       a61.upstream5sRegressions+=Number(earlierBaseline.complete&&!upstream5.complete)
       a61.upstream3sEventPairs+=upstream3.upstreamEventPairs
       a61.upstream5sEventPairs+=upstream5.upstreamEventPairs
       a61.upstream3sBrakes+=upstream3.additionalHeadwayBrakingDecisions
       a61.upstream5sBrakes+=upstream5.additionalHeadwayBrakingDecisions
       a61.mirrorOutcomeMismatch+=Number(upstream5.status!==mirror5.status||
        upstream5.steps!==mirror5.steps)
       a61.renameOutcomeMismatch+=Number(upstream5.status!==rename5.status||
        upstream5.steps!==rename5.steps)
       const firstPair=(x,mapper)=>JSON.stringify(x.firstBlocker?.pair?.map(mapper).sort()??[])
       a61.mirrorFirstPairMismatch+=Number(firstPair(upstream5,x=>x)!==firstPair(mirror5,x=>x))
       a61.renameFirstPairMismatch+=Number(firstPair(upstream5,x=>relabeled.map.get(x))!==
        firstPair(rename5,x=>x))
       a61.jsonReplayMismatch+=Number(JSON.stringify(upstream5)!==JSON.stringify(serialized5))
       a61.firstContactBeforeOriginalWarning+=Number(Boolean(upstream5.firstBlocker&&
        upstream5.firstBlocker.whenSeconds<alert-q-1e-7))
       const bq=a61.byQuantum[String(q)]
       assert(bq,'A61 missing bounded quantum group')
       bq.scenarios++;bq.baseClear+=Number(earlierBaseline.complete)
       bq.upstream3Clear+=Number(upstream3.complete)
       bq.upstream5Clear+=Number(upstream5.complete)
       s.fullFieldAttempts++;s.fullFieldSuccess+=Number(probe.complete)
       s.fullFieldCriticalReached+=Number(probe.criticalEventReached)
       s.fullFieldCollisionBlocked+=Number(probe.status==='REJECTED_COLLISION')
       s.fullFieldEnergyFailed+=Number(probe.status==='REJECTED_ENERGY_FAILED')
       s.fullFieldHeadwayReactions+=probe.additionalHeadwayBrakingDecisions
       s.maxFullFieldLateralMps=Math.max(s.maxFullFieldLateralMps,probe.maxLateralSpeedMps)
       cases.push({road:g.id,n,v,q,rider:who,warning:alert,
        originalClear:normal.anyFullHorizon,
        mirrorClear:mirror.anyFullHorizon,relabelClear:relabel.anyFullHorizon,
        originalFirst:normal.firstFullHorizonStrategy,
        mirroredFirst:mirror.firstFullHorizonStrategy,
        M,R,
        allField:{status:probe.status,complete:probe.complete,
         critical:probe.criticalEventReached,headway:probe.additionalHeadwayBrakingDecisions,
         firstBlocker:probe.firstBlocker,chosenStrategy:name,
         steps:probe.steps},
        a60:{legacyFixed:legacyFixed.status,laneIntent:laneFixed.status,
         laneIntentWarnings:laneFixed.intentWarningPairs,
         laneIntentBrakes:laneFixed.additionalHeadwayBrakingDecisions,
         originalFirstContact:contactLegacy,laneIntentFirstContact:contactLane},
        a61:{leadFramesUsed:leadFrames,actualEarlyStartSeconds:upstream5.startSeconds,
         leadBeforeWarningSeconds:lead,priorFramesIn5Seconds:prior.length,
         matchedEarlierBaseline:earlierBaseline.status,upstream3s:upstream3.status,
         upstream5s:upstream5.status,
         upstream5sFirstBlocker:upstream5.firstBlocker}})
      }
     }
    }
    for(const tag of tags.filter(x=>x.q===q)){
     historical.push({...tag,firstDifference:first?.firstAcceptedDifferenceSeconds??null})
    }
   }catch(err){const failure={road:g.id,n,v,q,error:String(err.stack??err)}
    errors.push(failure);console.error(JSON.stringify(failure))}
  }
 }
}
assert.equal(errors.length,0,'A59 mirror/identity/all-field technical error')
assert.equal(physicsRuns,162)
assert.equal(cases.length,67)
assert.equal(mirrors,67);assert.equal(renames,67)
assert.equal(historical.length,4)
assert.equal(a60.scenarios,67,'A60 missing full-field comparisons')
assert.equal(a61.scenarios,67,'A61 missing autonomous upstream comparisons')
assert.equal(a61.mirrorOutcomeMismatch,0,'A61 failed mirror outcomes')
assert.equal(a61.renameOutcomeMismatch,0,'A61 failed rider-ID outcomes')
assert.equal(a61.mirrorFirstPairMismatch,0,'A61 failed mirror contact identities')
assert.equal(a61.renameFirstPairMismatch,0,'A61 failed renamed contact identities')
assert.equal(a61.jsonReplayMismatch,0,'A61 failed exact serialized replay')
assert.equal(a60.mirrorOutcomeMismatches,0,'A60 failed reflected 10s outcomes')
assert.equal(a60.renameOutcomeMismatches,0,'A60 failed ID-invariant 10s outcomes')
assert.equal(a60.mirrorFirstPairMismatches,0,'A60 failed reflected contact-pair identities')
assert.equal(a60.renameFirstPairMismatches,0,'A60 failed renamed contact-pair identities')
assert.equal(a60.sameInputPhysicalReplayMismatches,0,'A60 failed exact JSON full-field replay')
const byQuantum=[...totals.values()]
assert.deepEqual(byQuantum.map(x=>x.componentTrials),[31,1,43])
assert.deepEqual(byQuantum.map(x=>x.geometryRejected),[0,0,5])
assert.equal(byQuantum.reduce((a,x)=>a+x.brakingObservations,0),110)
assert.equal(byQuantum.reduce((a,x)=>a+x.earlyWarnings,0),67)
assert.equal(byQuantum.reduce((a,x)=>a+x.options,0),383)
assert.equal(byQuantum.reduce((a,x)=>a+x.frozenSuccess,0),44)
assert.equal(byQuantum.reduce((a,x)=>a+x.rightSteerRescues,0),15)
const study={study:'A2_STEP59_FULL_MIRROR_RELABEL_AND_ALL_FIELD_STRESS',
 technicalGate:'PASS',sportingGate:'NO_GO',physicalRuns:physicsRuns,
 sameCheckpointScenarios:67,mirrorReplays:mirrors,relabelReplays:renames,
 originalA58Options:383,byQuantum,step60:a60,step61:a61,
 positiveThreeRiderFullField:{
  complete10s:true,exactJSON:true,mirror:true,rename:true,
  deliberatelyOverlappingInitialStateRejected:true},
 sourceSpotlights:historical,cases,
 conclusionScope:'mirror/relabel all 67 original early warning states; independent all-2–32-rider physically bounded command/headway shadow from shared checkpoint; reject on first conflict, no full racing classification; NOT a real-time strategy',
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP59_DIR??'/tmp/a2-step59'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step59-symmetry-and-all-field.json',JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify({study:study.study,technicalGate:study.technicalGate,
 sportingGate:study.sportingGate,physicalRuns:study.physicalRuns,
 mirrorReplays:mirrors,relabelReplays:renames,
 byQuantum,step60:study.step60,step61:study.step61,
 positiveThreeRiderFullField:study.positiveThreeRiderFullField,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
