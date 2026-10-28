/** A52 isolated connected-component intervention and first-round contact graph audit. OFFLINE ONLY.
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





const cases=[],spotlights=[],failures=[]
const specified=[
 {id:'baseline5_r004_r005',road:'baseline_5m',n:8,v:1,q:.5,sourceTime:51},
 {id:'wide6_5_r004_r005',road:'wide_6_5m',n:8,v:1,q:.5,sourceTime:51.5},
 {id:'cautious32_v0',road:'cautious_5m',n:32,v:0,q:2.5,sourceTime:22.5},
 {id:'cautious32_v1',road:'cautious_5m',n:32,v:1,q:2,sourceTime:22}
]
let runCount=0
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const qs=[.5,2.5]
  const selected=specified.filter(t=>t.road===g.id&&t.n===n&&t.v===v)
  if(selected.some(x=>x.q===2))qs.push(2)
  for(const q of qs){
   try{
    const ref=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const trial=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,{diagnostics:true})
    runCount+=2
    const first=analyzeFirstDecisionV3(ref,trial,g,q)
    const propagation=first?analyzePropagationV3(ref,trial,first,q):null
    const contact=first?inspectFrozenComponentInterventionsV3(
     ref.observed[first.tick].previews[first.substep-1],g):null
    if(contact&&first){
     assert.deepEqual(contact.changedByFullCounterfactual,
      first.frozenCounterfactual.changedRiders.slice().sort(),
      'A52 separate independent frozen solver disagrees with A51')
     assert.equal(contact.immediateCounterfactual.contactFallbacks,
      first.frozenCounterfactual.contactHardFallbacks)
     assert.equal(contact.immediateCounterfactual.rearFallbacks,
      first.frozenCounterfactual.rearHardFallbacks)
    }
    const record={road:g.id,n,v,q,first,contact,
     propagation:propagation?{finalChanged:propagation.finalChangedRiders,
      finalOutside:propagation.finalOutsideSourceComponent,
      finalMaxX:propagation.finalMaximumPositionM,
      finalMaxSpeed:propagation.finalMaximumSpeedMps,
      finalMaxWPrime:propagation.finalMaximumWPrimeJ,
      spreadFirstSeen:propagation.firstOutsideSourceComponentSeconds}:null}
    cases.push(record)
    const target=selected.find(x=>x.q===q)
    if(target){
     const tick=Math.floor((target.sourceTime-1e-7)/10)
     const sub=Math.round((target.sourceTime-tick*10)/q)
     const source=ref.observed[tick].previews[sub-1]
     const sourceIsolation=inspectFrozenComponentInterventionsV3(source,g)
     const originalContact=source.previewConflictPairs.map(([a,b])=>{
      const map=new Map(source.proposals.map(p=>[p.riderId,p]))
      return auditFirstContactPairV3(map.get(a),map.get(b),g)
     })
     spotlights.push({...target,first,atFirstDivergence:contact,
      atHistoricalContact:sourceIsolation,
      sourceOriginalPairs:originalContact.map(x=>({
       pair:x.riderIds,kind:x.movementType,firstFraction:x.contactFraction,
       followerStopContact:x.stationaryFollowerHit
      })),propagation:record.propagation})
    }
   }catch(err){const failure={road:g.id,n,v,q,error:String(err.stack??err)}
    failures.push(failure);console.error(JSON.stringify(failure))}
  }
 }
}
assert.equal(failures.length,0,'A52 isolated intervention technical failure')
assert.equal(runCount,162,'A52 expected 81 full paired simulations (162)')
assert.equal(cases.length,81)
assert.equal(spotlights.length,4)
const divergent=cases.filter(x=>x.contact)
assert.equal(divergent.length,57,'A51 exact 57 first differences must reproduce')
assert.equal(divergent.filter(x=>x.first.sameFrozenInputAtDivergence).length,57,
 'A52 first divergence must be on identical source inputs')
const byQuantum=[.5,2,2.5].map(q=>{
 const rows=cases.filter(x=>x.q===q),active=rows.filter(x=>x.contact)
 const sum=key=>active.reduce((a,x)=>a+key(x),0)
 return {quantum:q,cases:rows.length,divergent:active.length,
  originalContactComponentCount:sum(x=>x.contact.sourceGroups.length),
  activatedComponentCount:sum(x=>x.contact.affectedGroupCount),
  isolatedComponentTrials:sum(x=>x.contact.isolatedComponents.length),
  safeIsolations:sum(x=>x.contact.interventionSafety.safeIsolatedComponents),
  blockedIsolations:sum(x=>x.contact.interventionSafety.blockedIsolatedComponents),
  safeCombined:sum(x=>Number(x.contact.interventionSafety.combinedSafe)),
  blockedCombined:sum(x=>Number(!x.contact.interventionSafety.combinedSafe)),
  counterfactualChangedOutsideOriginalGraph:sum(x=>x.contact.changedOutsideInitialGroups.length),
  laterSpreadOutsideOriginalGraph:sum(x=>Number.isFinite(x.propagation?.spreadFirstSeen)),
  firstRoundContactCount:sum(x=>x.contact.firstRound.initiallyConflictingPairs),
  firstRoundTieGroups:sum(x=>Number(x.contact.firstRound.simultaneousTies>1)),
  newConflictsAfterEarliestOnly:sum(x=>x.contact.firstRound.newPairsAfterFirstContactOnly),
  newConflictsAfterRearAllPair:sum(x=>x.contact.firstRound.newPairsAfterFirstRearAllPairs),
  maxFinalPositionDifferenceM:Math.max(0,...rows.map(x=>x.propagation?.finalMaxX??0))}
})
const blocked=divergent.filter(x=>!x.contact.interventionSafety.combinedSafe)
const noGraph=divergent.filter(x=>x.contact.affectedGroupCount===0)
const study={study:'A2_STEP52_ISOLATED_CONTACT_COMPONENTS',technicalGate:'PASS',
 sportingGate:'NO_GO',physicsRuns:runCount,matchedComparisons:cases.length,
 analyzedFirstDifferences:divergent.length,
 byQuantum,componentUnionBlockedCases:blocked.length,
 noInitialContactGroupCases:noGraph.length,
 sourceSpotlights:spotlights,
 caseEvidence:cases,failures,
 interpretation:'Frozen outside A44 accepted tracks in a single substep; not a completed 60s intervention race',
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP52_DIR??'/tmp/a2-step52'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step52-isolated-components.json',JSON.stringify(study,null,2)+'\n')
console.log(JSON.stringify({study:study.study,technicalGate:study.technicalGate,
 sportingGate:study.sportingGate,physicsRuns:study.physicsRuns,
 matchedComparisons:study.matchedComparisons,
 analyzedFirstDifferences:study.analyzedFirstDifferences,
 byQuantum:study.byQuantum,
 componentUnionBlockedCases:study.componentUnionBlockedCases,
 noInitialContactGroupCases:study.noInitialContactGroupCases,
 sourceSpotlights:study.sourceSpotlights.map(x=>({
  id:x.id,sourceTime:x.sourceTime,firstDifferentTime:x.first?.firstAcceptedDifferenceSeconds,
  firstChanged:x.atFirstDivergence?.changedByFullCounterfactual,
  firstGroups:x.atFirstDivergence?.affectedGroups,
  firstRound:x.atFirstDivergence?.firstRound,
  isolated:x.atFirstDivergence?.isolatedComponents,
  historicalPairs:x.sourceOriginalPairs,
  historicalUnionSafe:x.atHistoricalContact?.interventionSafety.combinedSafe,
  propagation:x.propagation})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
