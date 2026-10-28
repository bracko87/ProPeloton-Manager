/** A51 controlled frozen-contact counterfactual and subsequent propagation audit. OFFLINE ONLY.
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




const spots=[
 {id:'baseline_5m_51',road:'baseline_5m',n:8,v:1,quantum:.5,sourceTime:51},
 {id:'wide_6_5m_51_5',road:'wide_6_5m',n:8,v:1,quantum:.5,sourceTime:51.5},
 {id:'cautious_5m_22_5',road:'cautious_5m',n:32,v:0,quantum:2.5,sourceTime:22.5},
 {id:'cautious_5m_22',road:'cautious_5m',n:32,v:1,quantum:2,sourceTime:22}
]
const cases=[],spotlightAudits=[],failures=[]
const referencePolicy='trapezoid_rear_priority'
const candidatePolicy='trapezoid_contact_time_occupancy'
let actualRuns=0
const allRoads=BATCH40_GEOMETRIES.map(g=>[g.id,g])
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  try{
   const auditQuanta=[.5,2.5]
   const selected=spots.filter(s=>s.road===g.id&&s.n===n&&s.v===v)
   if(selected.some(s=>s.quantum===2)&&!auditQuanta.includes(2))auditQuanta.push(2)
   for(const quantum of auditQuanta){
    const baseline=simulate(geometry,g,n,v,referencePolicy,quantum,{diagnostics:true})
    const proposed=simulate(geometry,g,n,v,candidatePolicy,quantum,{diagnostics:true})
    actualRuns+=2
    const first=analyzeFirstDecisionV3(baseline,proposed,g,quantum)
    const spread=first?analyzePropagationV3(baseline,proposed,first,quantum):null
    const result={road:g.id,n,v,quantum,first,spread,
     finalDelta:delta(baseline,proposed),
     acceptedPiecewiseOverlaps:[baseline.metrics.remainingPiecewiseOverlaps,
      proposed.metrics.remainingPiecewiseOverlaps],
     candidateHardFallbacks:proposed.metrics.priorityHardFallbacks,
     candidateTieGroups:proposed.metrics.contactTimeTieGroups}
    cases.push(result)
    const spotlight=selected.find(s=>s.quantum===quantum)
    if(spotlight){
     const tick=Math.floor((spotlight.sourceTime-1e-7)/10)
     const sub=Math.round((spotlight.sourceTime-tick*10)/quantum)
     const source=baseline.observed[tick].previews[sub-1]
     const candidate=proposed.observed[tick].previews[sub-1]
     const sourceGraph=source.previewConflictPairs.map(([a,b])=>{
      const by=new Map(source.proposals.map(p=>[p.riderId,p]))
      return auditFirstContactPairV3(by.get(a),by.get(b),g)
     })
     const canGraph=candidate.previewConflictPairs.map(([a,b])=>{
      const by=new Map(candidate.proposals.map(p=>[p.riderId,p]))
      return auditFirstContactPairV3(by.get(a),by.get(b),g)
     })
     spotlightAudits.push({...spotlight,first,spread,
      originalSourcePairs:sourceGraph.map(p=>({
       pair:p.riderIds,kind:p.movementType,firstFraction:p.contactFraction,
       stationaryFollowerHit:p.stationaryFollowerHit})),
      candidateAtOriginalTimePairs:canGraph.map(p=>({
       pair:p.riderIds,kind:p.movementType,firstFraction:p.contactFraction,
       stationaryFollowerHit:p.stationaryFollowerHit})),
      originalSourceContactCount:sourceGraph.length,
      candidateContactCountAtSourceTime:canGraph.length})
    }
   }
  }catch(e){const err={road:g.id,n,v,error:String(e.stack??e)}
   failures.push(err);console.error(JSON.stringify(err))}
 }
}
assert.equal(failures.length,0,'A51 causal propagation technical failure')
assert.equal(actualRuns,162,'A51 expected 80 tests at .5s, 80 at 2.5s, 2 at 2s')
assert.equal(cases.length,81,'A51 expected 81 same-grid comparisons')
assert.equal(spotlightAudits.length,4,'A51 missing historical source spotlight')
const byQuantum=[.5,2,2.5].map(quantum=>{
 const rows=cases.filter(x=>x.quantum===quantum)
 const first=rows.filter(x=>x.first)
 const spread=rows.filter(x=>Number.isFinite(x.spread?.firstOutsideSourceComponentSeconds))
 return {quantum,cases:rows.length,firstDifferentCases:first.length,
  differentBy60s:rows.filter(x=>x.spread?.finalChangedRiders>0).length,
  contactGraphSpreadCases:spread.length,
  firstDivergenceEarliestSeconds:first.length?Math.min(...first.map(x=>x.first.firstAcceptedDifferenceSeconds)):null,
  maxFinalDifferentRiders:Math.max(0,...rows.map(x=>x.spread?.finalChangedRiders??0)),
  maxFinalOutsideContactGraph:Math.max(0,...rows.map(x=>x.spread?.finalOutsideSourceComponent??0)),
  maxFinalXDifferenceM:Math.max(0,...rows.map(x=>x.spread?.finalMaximumPositionM??0)),
  maxFinalWPrimeDifferenceJ:Math.max(0,...rows.map(x=>x.spread?.finalMaximumWPrimeJ??0)),
  fullFallbacks:rows.reduce((a,x)=>a+x.candidateHardFallbacks,0)}
})
const independentFrozen=cases.filter(x=>x.first?.sameFrozenInputAtDivergence).length
const seedOutside=cases.filter(x=>x.first?.firstAcceptedChangeOutsideSourceGraph.length>0).length
const output={study:'A2_STEP51_CAUSAL_CONTACT_PROPAGATION',technicalGate:'PASS',
 sportingGate:'NO_GO',method:'independent frozen same-input counterfactual and observed six tick propagation',
 actualPhysicalRuns:actualRuns,sameGridComparisons:cases.length,
 firstDecisionCases:cases.filter(x=>x.first).length,
 frozenFirstInputComparableCases:independentFrozen,
 firstAcceptedDifferentOutsideGraphCases:seedOutside,
 summary:byQuantum,sourceSpotlights:spotlightAudits,
 individualCases:cases,failures,officialWrites:0,
 sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP51_DIR??'/tmp/a2-step51'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step51-contact-propagation.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({
 study:output.study,technicalGate:output.technicalGate,sportingGate:output.sportingGate,
 actualPhysicalRuns:output.actualPhysicalRuns,sameGridComparisons:output.sameGridComparisons,
 firstDecisionCases:output.firstDecisionCases,
 frozenFirstInputComparableCases:output.frozenFirstInputComparableCases,
 firstAcceptedDifferentOutsideGraphCases:output.firstAcceptedDifferentOutsideGraphCases,
 summary:output.summary,
 sourceSpotlights:output.sourceSpotlights.map(s=>({
  id:s.id,sourceTime:s.sourceTime,
  originalSourceContactCount:s.originalSourceContactCount,
  candidateContactCountAtSourceTime:s.candidateContactCountAtSourceTime,
  firstTime:s.first?.firstAcceptedDifferenceSeconds,
  firstReason:s.first?.earliestDecision,
  firstFrozenRiders:s.first?.frozenCounterfactual.changedRiders,
  propagation:s.spread?{finalChanged:s.spread.finalChangedRiders,
   finalOutside:s.spread.finalOutsideSourceComponent,
   finalX:s.spread.finalMaximumPositionM,
   finalSpeed:s.spread.finalMaximumSpeedMps,
   finalWPrime:s.spread.finalMaximumWPrimeJ,
   outsideFirstSeen:s.spread.firstOutsideSourceComponentSeconds}:null})),
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
