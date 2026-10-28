/** Step 51 OFFLINE: audit a real frozen collision choice and later spread.
 * This module observes or counterfactually resolves cloned frozen A44 proposals.
 * It NEVER writes current race state, Supabase, player data or classifications.
 */
import {resolveContactPriorityV3} from './a2CollisionPriorityResearchV3.mjs'
import {auditFirstContactPairV3} from './a2PairGeometryAuditV3.mjs'
const need=(b,m)=>{if(!b)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const pathKey=(x)=>x.riderId
const diff=(a,b)=>Math.abs(a-b)>1e-6
function buildGraph(preview){
 const source=new Map(preview.proposals.map(p=>[p.riderId,p]))
 const edges=preview.previewConflictPairs.map(pair=>[...pair])
 const adjacency=new Map([...source.keys()].map(id=>[id,new Set()]))
 for(const [a,b] of edges){
  need(adjacency.has(a)&&adjacency.has(b),'A51 preview invalid pair identity')
  adjacency.get(a).add(b);adjacency.get(b).add(a)
 }
 const components=[],seen=new Set()
 for(const id of adjacency.keys()){
  if(seen.has(id)||!adjacency.get(id).size)continue
  const q=[id],component=[]
  seen.add(id)
  while(q.length){
   const here=q.shift();component.push(here)
   for(const near of adjacency.get(here))if(!seen.has(near)){seen.add(near);q.push(near)}
  }
  components.push(component.sort())
 }
 return {source,edges,components}
}
const proposalsOf=preview=>preview.proposals.map(p=>({
 riderId:p.riderId,forward:p.proposedMeters,y:p.proposedY,
 original:{meters:p.x0,y:p.y0,speedMps:p.oldSpeedMps}}))
export function analyzeFirstDecisionV3(reference,candidate,g,seconds){
 need(reference?.observed?.length&&candidate?.observed?.length&&
  reference.observed.length===candidate.observed.length&&[.5,1,2,2.5,5].includes(seconds),
  'A51 invalid traced same-grid comparison')
 for(let tick=0;tick<reference.observed.length;tick++){
  const a=reference.observed[tick],b=candidate.observed[tick]
  need(a.previews.length===10/seconds&&b.previews.length===10/seconds,'A51 expected complete tick')
  for(let i=0;i<a.previews.length;i++){
   const A=a.previews[i],B=b.previews[i]
   const aa=new Map(A.achieved.map(x=>[pathKey(x),x]))
   const bb=new Map(B.achieved.map(x=>[pathKey(x),x]))
   const changed=[...aa.keys()].filter(id=>{
    const x=aa.get(id),y=bb.get(id)
    need(y,'A51 expected same roster')
    return diff(x.x1,y.x1)||diff(x.y1,y.y1)
   })
   if(!changed.length)continue
   const initialGraph=buildGraph(A)
   const targetGraph=buildGraph(B)
   const frozen=proposalsOf(A)
   // A51 true one-substep counterfactual: evaluate both algorithms with
   // *identical* immutable starting rider position and submitted intent.
   const unchanged=structuredClone(frozen)
   const rear=resolveContactPriorityV3(frozen,g,{policy:'rear_priority',diagnostics:true})
   const contact=resolveContactPriorityV3(frozen,g,{policy:'contact_time_lane_occupancy',diagnostics:true})
   need(JSON.stringify(frozen)===JSON.stringify(unchanged),'A51 mutated frozen proposals')
   const expectedRear=new Map(rear.paths.map(x=>[x.riderId,x]))
   for(const p of A.achieved){
    const x=expectedRear.get(p.riderId)
    need(x&&Math.abs(x.x1-p.x1)<=1e-6&&Math.abs(x.y1-p.y1)<=1e-6,
     'A51 original observed A44 path disagrees with frozen counterfactual')
   }
   // The A50 run may have entered this step with a different prior state;
   // in that case replaying the A44 frozen proposals is still a valid
   // counterfactual, but NOT a claim that A50 chose this same input.
   const sameInput=JSON.stringify(A.proposals)===JSON.stringify(B.proposals)
   if(sameInput){
    const expectedContact=new Map(contact.paths.map(x=>[x.riderId,x]))
    for(const p of B.achieved){
     const x=expectedContact.get(p.riderId)
     need(x&&Math.abs(x.x1-p.x1)<=1e-6&&Math.abs(x.y1-p.y1)<=1e-6,
      'A51 current A50 path disagrees with same-input counterfactual')
    }
   }
   const localDifferent=[]
   const expectedContact=new Map(contact.paths.map(x=>[x.riderId,x]))
   for(const p of rear.paths){
    const q=expectedContact.get(p.riderId)
    if(diff(p.x1,q.x1)||diff(p.y1,q.y1))localDifferent.push(p.riderId)
   }
   const decision=b.decisions.filter(x=>x.substep===i+1).filter(x=>x.round===0)[0]??null
   const firstPairs=A.previewConflictPairs.map(([a,b])=>
    auditFirstContactPairV3(initialGraph.source.get(a),initialGraph.source.get(b),g))
   const affectedComponentIds=new Set()
   for(const component of initialGraph.components)
    if(component.some(id=>localDifferent.includes(id)))
     for(const id of component)affectedComponentIds.add(id)
   return {firstAcceptedDifferenceSeconds:r6(tick*10+(i+1)*seconds),
    tick,substep:i+1,actualChangedIds:changed,
    sameFrozenInputAtDivergence:sameInput,
    referenceConflictPairs:initialGraph.edges.length,
    candidateConflictPairs:targetGraph.edges.length,
    sourceContactComponents:initialGraph.components,
    sourcePairTypes:firstPairs.map(x=>({
     riders:x.riderIds,kind:x.movementType,contactFraction:x.contactFraction,
     leader:x.leaderId,stationaryFollowerHit:x.stationaryFollowerHit})),
    earliestDecision:decision?{
     competingPairs:decision.competingPairs,
     firstContactFraction:decision.firstContactFraction,
     tiedPairs:decision.tiedPairs}:null,
    frozenCounterfactual:{
     changedRiders:localDifferent,scopeOfSourceComponents:[...affectedComponentIds].sort(),
     contactHardFallbacks:contact.hardFallbacks,
     rearHardFallbacks:rear.hardFallbacks,
     contactEntrantYields:contact.contactEntrantYields,
     contactMutualYields:contact.contactMutualYields,
     rearCollisionRounds:rear.rounds,
     contactCollisionRounds:contact.rounds},
    firstAcceptedChangeOutsideSourceGraph:changed.filter(x=>!affectedComponentIds.has(x)),
    sourceContactCountByType:Object.fromEntries(
     ['straight','one_steering','parallel_steering','opposite_steering'].map(k=>
      [k,firstPairs.filter(x=>x.movementType===k).length]))}
  }
 }
 return null
}
export function analyzePropagationV3(reference,candidate,first,quantum){
 need(first&&reference.tickStates?.length===6&&candidate.tickStates?.length===6,
  'A51 propagation requires 60s traced tick state')
 const seed=new Set(first.frozenCounterfactual.scopeOfSourceComponents)
 const firstTime=first.firstAcceptedDifferenceSeconds
 const ticks=[]
 for(let i=0;i<6;i++){
  const a=reference.tickStates[i],b=candidate.tickStates[i]
  const current=new Map(b.riders.map(x=>[x.riderId,x]))
  let maxX=0,maxSpeed=0,maxW=0,maxMechanical=0
  let changed=0,outside=0,seedAffected=0
  const impacted=[]
  for(const p of a.riders){
   const q=current.get(p.riderId);need(q,'A51 missing tick rider')
   const dx=r6(q.x-p.x),speed=r6(q.speed-p.speed),
    w=r6(q.wPrime-p.wPrime),joules=r6(q.mechanicalJoules-p.mechanicalJoules)
   maxX=Math.max(maxX,Math.abs(dx));maxSpeed=Math.max(maxSpeed,Math.abs(speed))
   maxW=Math.max(maxW,Math.abs(w));maxMechanical=Math.max(maxMechanical,Math.abs(joules))
   const diverged=diff(q.x,p.x)||diff(q.y,p.y)||diff(q.speed,p.speed)||
    diff(q.wPrime,p.wPrime)
   if(diverged){
    changed++
    if(seed.has(p.riderId))seedAffected++;else outside++
    impacted.push({id:p.riderId,dx,dspeed:speed,dWPrime:w,dJoules:joules,
     insideInitialContactGraph:seed.has(p.riderId)})
   }
  }
  ticks.push({simulationSeconds:a.seconds,
   afterFirstDifference:a.seconds+1e-9>=firstTime,
   changedRiders:changed,changedInsideFirstContactGraph:seedAffected,
   changedOutsideFirstContactGraph:outside,
   maxAbsPositionM:r6(maxX),maxAbsSpeedMps:r6(maxSpeed),
   maxAbsWPrimeJ:r6(maxW),maxAbsMechanicalJ:r6(maxMechanical),
   strongestPositionChanges:impacted.sort((x,y)=>Math.abs(y.dx)-Math.abs(x.dx)).slice(0,5)})
 }
 const last=ticks.at(-1)
 const firstAffectedTick=ticks.find(t=>t.changedRiders>0)
 const spreadTick=ticks.find(t=>t.changedOutsideFirstContactGraph>0)
 need(!firstAffectedTick||firstAffectedTick.simulationSeconds+1e-9>=firstTime,
  'A51 saw tick-level difference preceding first accepted path divergence')
 return {physicalQuantumSeconds:quantum,firstAffectedTickSeconds:firstAffectedTick?.simulationSeconds??null,
  firstOutsideSourceComponentSeconds:spreadTick?.simulationSeconds??null,
  finalChangedRiders:last.changedRiders,
  finalOutsideSourceComponent:last.changedOutsideFirstContactGraph,
  finalMaximumPositionM:last.maxAbsPositionM,
  finalMaximumSpeedMps:last.maxAbsSpeedMps,
  finalMaximumWPrimeJ:last.maxAbsWPrimeJ,
  finalMaximumMechanicalJ:last.maxAbsMechanicalJ,
  ticks}
}
