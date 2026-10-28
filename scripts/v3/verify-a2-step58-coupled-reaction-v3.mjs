/** A58 bounded simultaneous brake/steer responses from real A44 checkpoints. OFFLINE ONLY.
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

// Explicit positive counterexample to A57 frozen-other-rider assumption:
// braking only 'rear' would be rear-ended by the 'trailer', while both riders
// braking from the *same actual pre-step state* maintain their 6m headway.
const wakeE=initializeEnergyBalanceResearchV3({criticalWatts:230,wPrimeJoules:18000})
const wakeSource=Array.from({length:6},(_,tick)=>({previews:Array.from({length:10},(_,i)=>{
 const s=tick*10+i
 return {tickStartSeconds:tick*10,substep:i+1,dtSeconds:1,
  proposals:[
   {riderId:'rear',x0:100+s*8,y0:0,oldSpeedMps:8,energyBefore:{...wakeE,seconds:s},steeringWatts:35},
   {riderId:'trailer',x0:94+s*8,y0:0,oldSpeedMps:8,energyBefore:{...wakeE,seconds:s},steeringWatts:35},
   {riderId:'front',x0:110+s*6,y0:g0.centerStepM,oldSpeedMps:6,energyBefore:{...wakeE,seconds:s},steeringWatts:35}
  ],achieved:[
   {riderId:'rear',x1:108+s*8,y1:0},
   {riderId:'trailer',x1:102+s*8,y1:0},
   {riderId:'front',x1:116+s*6,y1:g0.centerStepM}
  ],previewConflictPairs:[]}
})}))
const wakePlan=buildCoupledBrakeOptionsV3(wakeSource[0].previews[0],'rear',g0)
assert.deepEqual(wakePlan.group.selected,['rear','trailer'])
const syntheticJoint=auditCoupledBrakeChoicesV3(wakeSource,g0,0,'rear',1,5,
 {dt:1,horizonSeconds:10})
const singleResult=syntheticJoint.attempts.find(x=>x.strategy==='SINGLE_BRAKE')
const wakeResult=syntheticJoint.attempts.find(x=>x.strategy==='WAKE_BRAKE')
assert.equal(singleResult.completedFullHorizon,false)
assert(singleResult.firstBlockers.some(x=>x.ids.includes('trailer')))
assert.equal(wakeResult.completedFullHorizon,true)
assert.equal(wakeResult.reactionCount,2)
assert(wakeResult.energyValid&&wakeResult.maxLateralRateMps<=.38+1e-6)
assert(wakeResult.records.every(x=>x.collisions.length===0))
assert.deepEqual(syntheticJoint,auditCoupledBrakeChoicesV3(
 JSON.parse(JSON.stringify(wakeSource)),g0,0,'rear',1,5,
 {dt:1,horizonSeconds:10}))
const maxY=(g0.laneCount-1)*g0.centerStepM
const transformedWake=fn=>wakeSource.map(t=>({previews:t.previews.map(p=>({
 ...p,proposals:p.proposals.map(fn),achieved:p.achieved.map(fn),
 previewConflictPairs:[]
}))}))
const mirrorWake=transformedWake(x=>({
 ...x,y0:x.y0===undefined?undefined:r6(maxY-x.y0),
 y1:x.y1===undefined?undefined:r6(maxY-x.y1)}))
const mirroredJoint=auditCoupledBrakeChoicesV3(mirrorWake,g0,0,'rear',1,5,{dt:1})
assert.equal(mirroredJoint.anyFullHorizon,true)
assert.equal(mirroredJoint.attempts.find(x=>x.strategy==='WAKE_BRAKE').completedFullHorizon,true)
const idsMap={rear:'Z',trailer:'A',front:'M'}
const renSource=transformedWake(x=>({...x,riderId:idsMap[x.riderId]}))
const renameJoint=auditCoupledBrakeChoicesV3(renSource,g0,0,'Z',1,5,{dt:1})
assert.equal(renameJoint.anyFullHorizon,true)
assert.equal(renameJoint.attempts.find(x=>x.strategy==='WAKE_BRAKE').reactionCount,2)
assert.equal(renameJoint.attempts.find(x=>x.strategy==='WAKE_BRAKE').completedFullHorizon,true)
const maxReplaysToMirror=5
const sourceSpotlights=[
 {name:'baseline_5m',road:'baseline_5m',n:8,v:1,q:.5,time:51},
 {name:'wide_6_5m',road:'wide_6_5m',n:8,v:1,q:.5,time:51.5},
 {name:'cautious32_v0',road:'cautious_5m',n:32,v:0,q:2.5,time:22.5},
 {name:'cautious32_v1',road:'cautious_5m',n:32,v:1,q:2,time:22}
]
const counts58=new Map([.5,2,2.5].map(q=>[q,{
 physicalQuantum:q,fixtureComparisons:0,changedFirstSteps:0,localComponents:0,
 geometryRejected:0,brakingRiderObservations:0,missingEarlierWarning:0,
 eligibleEarlierWarnings:0,
 singleComplete:0,singleBlocked:0,
 testedJointChoices:0,withAdditionalReactors:0,
 jointComplete:0,jointBlocked:0,
 rescueAfterSingleBlocked:0,
 rescuedByWake:0,rescuedBySteering:0,
 jointExtraRiderCountMax:0,exactReplayChecks:0,mirrorChecks:0,
 maxSteeringRate:0,energyRejectedAttempts:0,
 firstStrategyCounts:{}
}]))
const errors=[],allCases=[],spotlights=[],metamorph=[]
let fullRuns=0,eligible=0
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const focused=sourceSpotlights.filter(x=>x.road===g.id&&x.n===n&&x.v===v)
  const qs=focused.some(x=>x.q===2)?[.5,2,2.5]:[.5,2.5]
  for(const q of qs){
   try{
    const A=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const B=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,
     {diagnostics:true})
    fullRuns+=2
    const total=counts58.get(q)
    total.fixtureComparisons++
    const first=analyzeFirstDecisionV3(A,B,g,q)
    if(first){
     total.changedFirstSteps++
     const p=A.observed[first.tick].previews[first.substep-1]
     const original=inspectFrozenComponentInterventionsV3(p,g)
     for(const group of original.isolatedComponents){
      total.localComponents++
      if(!group.collisionFree){total.geometryRejected++;continue}
      const cases=analyzeHistory(A.observed,g,[-3,0][v],
       first.firstAcceptedDifferenceSeconds,p,group.members,q)
      for(const e of cases){
       total.brakingRiderObservations++
       if(!e.shadow){total.missingEarlierWarning++;continue}
       total.eligibleEarlierWarnings++;eligible++
       const source=JSON.stringify(A.observed)
       const joint=auditCoupledBrakeChoicesV3(A.observed,g,[-3,0][v],
        e.violation.riderId,e.warning.firstEarlierWarningSeconds,
        first.firstAcceptedDifferenceSeconds,{dt:q,intervals:32})
       assert.equal(JSON.stringify(A.observed),source,'A58 mutated frozen A44 physical history')
       assert.equal(joint.officialWrites,0)
       assert.equal(joint.sportingApproval,'NOT_APPROVED')
       const direct=joint.attempts.find(x=>x.strategy==='SINGLE_BRAKE')
       assert(direct&&direct.reactionCount===1,'A58 missing comparable A57 baseline')
       // A58 may be strictly more conservative at a tiny chord margin, but
       // must never claim source A57 was blocked when the same motion passes.
       if(direct.completedFullHorizon)total.singleComplete++
       else total.singleBlocked++
       if(joint.anyFullHorizon)total.jointComplete++
       else total.jointBlocked++
       if(!direct.completedFullHorizon&&joint.anyFullHorizon)
        total.rescueAfterSingleBlocked++
       total.testedJointChoices+=joint.attempts.length
       total.withAdditionalReactors+=joint.attempts.filter(x=>x.reactionCount>1).length
       total.energyRejectedAttempts+=joint.attempts.filter(x=>!x.energyValid).length
       total.jointExtraRiderCountMax=Math.max(total.jointExtraRiderCountMax,
        Math.max(...joint.attempts.map(x=>x.reactionCount-1)))
       total.maxSteeringRate=Math.max(total.maxSteeringRate,
        ...joint.attempts.map(x=>x.maxLateralRateMps))
       if(joint.anyFullHorizon){
        const kind=joint.firstFullHorizonStrategy
        total.firstStrategyCounts[kind]=(total.firstStrategyCounts[kind]??0)+1
        if(kind.includes('WAKE'))total.rescuedByWake+=Number(!direct.completedFullHorizon)
        if(kind.includes('STEER'))total.rescuedBySteering+=Number(!direct.completedFullHorizon)
       }
       assert(joint.attempts.every(x=>x.maxLateralRateMps<=.38+1e-6&&
        x.brakeLimitMps2===.85&&x.allFrozenOutsidePathsUnchanged))
       const checked=joint.attempts.find(x=>x.completedFullHorizon)??direct
       const recheck=replayCoupledEarlyBrakeV3(
        JSON.parse(JSON.stringify(A.observed)),g,[-3,0][v],
        e.violation.riderId,e.warning.firstEarlierWarningSeconds,
        first.firstAcceptedDifferenceSeconds,
        buildCoupledBrakeOptionsV3(
          A.observed.flatMap(t=>t.previews).find(pv=>
           Math.abs(pv.tickStartSeconds+pv.substep*q-
             e.warning.firstEarlierWarningSeconds)<1e-7),
          e.violation.riderId,g).options.find(o=>o.key===checked.strategy),
        {dt:q,intervals:32})
       assert.deepEqual(checked,recheck,'A58 exact JSON checkpoint replay failure')
       total.exactReplayChecks++
       if(metamorph.length<maxReplaysToMirror){
        // Strict mirror and renaming on all actual frozen x/y and identities,
        // without rerouting the original historical observations.
        const maxY=r6((g.laneCount-1)*g.centerStepM)
        const mirror=A.observed.map(t=>({...t,previews:t.previews.map(pv=>({
         ...pv,proposals:pv.proposals.map(x=>({...x,y0:r6(maxY-x.y0),
          proposedY:r6(maxY-x.proposedY),requestedY:r6(maxY-x.requestedY)})),
         achieved:pv.achieved.map(x=>({...x,y0:r6(maxY-x.y0),y1:r6(maxY-x.y1)}))
        }))}))
        const reflected=auditCoupledBrakeChoicesV3(mirror,g,[-3,0][v],
         e.violation.riderId,e.warning.firstEarlierWarningSeconds,
         first.firstAcceptedDifferenceSeconds,{dt:q,intervals:32})
        assert.equal(reflected.anyFullHorizon,joint.anyFullHorizon,
         'A58 real checkpoint mirror changed viable status')
        total.mirrorChecks++
        metamorph.push({road:g.id,n,v,q,rider:e.violation.riderId,
         mirroredSameOutcome:true})
       }
       allCases.push({road:g.id,n,v,q,riderId:e.violation.riderId,
        firstTime:first.firstAcceptedDifferenceSeconds,
        priorWarning:e.warning.firstEarlierWarningSeconds,
        optimisticLead:e.warning.optimisticLeadSeconds,
        selectedAtStart:joint.group.selected,
        baselineA57Success:e.shadow.completedFullHorizon,
        baselineA58Success:direct.completedFullHorizon,
        coupledSuccess:joint.anyFullHorizon,
        firstSuccessfulStrategy:joint.firstFullHorizonStrategy,
        attempts:joint.attempts.map(x=>({strategy:x.strategy,
         reactors:x.reactedIds,complete:x.completedFullHorizon,
         collisions:x.firstBlockers,energyValid:x.energyValid,
         lateralRate:x.maxLateralRateMps,steps:x.steps}))})
      }
     }
    }
    for(const sp of focused.filter(x=>x.q===q)){
     const tick=Math.floor((sp.time-1e-7)/10),sub=Math.round((sp.time-tick*10)/q)-1
     const preview=A.observed[tick].previews[sub]
     const prior=inspectFrozenComponentInterventionsV3(preview,g)
     const seen=analyzeHistory(A.observed,g,[-3,0][v],sp.time,
      preview,prior.combinedChangedComponents.members,q)
     const results=seen.map(x=>{
      if(!x.shadow)return {rider:x.violation.riderId,alert:null,status:'NO_EARLIER_WARNING'}
      const joint=auditCoupledBrakeChoicesV3(A.observed,g,[-3,0][v],
       x.violation.riderId,x.warning.firstEarlierWarningSeconds,sp.time,{dt:q})
      return {rider:x.violation.riderId,
       alert:x.warning.firstEarlierWarningSeconds,
       candidateCount:joint.attempts.length,
       extraReactors:joint.group.followers,
       singleSuccess:joint.attempts[0].completedFullHorizon,
       anyCoupledSuccess:joint.anyFullHorizon,
       winningStrategy:joint.firstFullHorizonStrategy,
       firstSingleCollision:joint.attempts[0].firstBlockers[0]??null}
     })
     spotlights.push({...sp,firstActualDivergence:first?.firstAcceptedDifferenceSeconds,
      originalSourcePairs:prior.sourcePairs,changedRiderReplays:results})
    }
   }catch(err){const f={road:g.id,n,v,q,error:String(err.stack??err)}
    errors.push(f);console.error(JSON.stringify(f))}
  }
 }
}
assert.equal(errors.length,0,'A58 controlled coupled physical research failed')
assert.equal(fullRuns,162)
assert.equal(allCases.length,67)
assert.equal(eligible,67)
assert.equal(spotlights.length,4)
const sums=[...counts58.values()]
assert.deepEqual(sums.map(x=>x.localComponents),[31,1,43])
assert.deepEqual(sums.map(x=>x.geometryRejected),[0,0,5])
assert.equal(sums.reduce((a,x)=>a+x.brakingRiderObservations,0),110)
assert.equal(sums.reduce((a,x)=>a+x.eligibleEarlierWarnings,0),67)
assert.equal(sums.reduce((a,x)=>a+x.missingEarlierWarning,0),43)
const evidence={study:'A2_STEP58_COUPLED_BOUNDED_WAKE_AND_STEER_REPLAY',
 technicalGate:'PASS',sportingGate:'NO_GO',
 physicalRuns:fullRuns,pairedComparisons:81,localGroups:75,
 brakingObservations:110,earlyWarningScenarios:67,
 perQuantum:sums,sourceSpotlights:spotlights,metamorphicRealCases:metamorph,
 directWakeSyntheticControl:{singleBrakeBlocked:true,
  coupledWakeBrakeClear10s:true,energyValid:true,exactReplay:true,
  identityAndMirrorVerified:true},
 cases:allCases,
 limit:'Only the selected local reaction group responds from a real alert-time A44 pre-substep checkpoint. All outside riders follow immutable A44 accepted trajectories, some of which are not themselves velocity-bounded. Not a whole-peloton 10s race tick.',
 approvedPolicies:0,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const folder=process.env.V3_A2_STEP58_DIR??'/tmp/a2-step58'
mkdirSync(folder,{recursive:true})
writeFileSync(folder+'/a2-step58-coupled-brake.json',JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify({study:evidence.study,technicalGate:evidence.technicalGate,
 sportingGate:evidence.sportingGate,physicalRuns:fullRuns,
 earlyWarningScenarios:67,perQuantum:sums,
 spotlights:evidence.sourceSpotlights,
 realMirrorChecks:metamorph.length,
 directWakeSyntheticControl:evidence.directWakeSyntheticControl,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
