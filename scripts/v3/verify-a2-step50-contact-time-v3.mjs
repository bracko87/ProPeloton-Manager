/** A50 first-contact right-of-way hypothesis and common-anchor tests. OFFLINE ONLY.
 * Tests source physical step sensitivity, identity/lateral symmetry,
 * swept space-time safety, exact replay and fixed commands.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as start,advanceSubstepPhysicalResearchV3 as move} from './a2SubstepPhysicalResearchV3.mjs'
import {resolveContactPriorityV3,classifyContactTimeRightOfWayV3} from './a2CollisionPriorityResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
import {auditFirstContactPairV3,firstComparedDivergenceV3} from './a2PairGeometryAuditV3.mjs'
import {compareCommonReferenceV3,compareMatchedPoliciesV3} from './a2CommonReferenceAuditV3.mjs'
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



// A50's explicit rule invariants, independent of full-stage simulator.
const road=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const mover=(id,x,y,forward,targetY)=>({riderId:id,original:{meters:x,y},
 forward,y:targetY})
const occupancy=[mover('follower',100,1,3,1),mover('leader',101.6,.19,3,.38)]
const entering=classifyContactTimeRightOfWayV3(occupancy[0],occupancy[1],road)
assert(entering&&entering.reason==='lane_entrant_yields')
assert.deepEqual(entering.yielding,['leader'])
const rearCloser=classifyContactTimeRightOfWayV3(
 mover('rear',100,0,10,0),mover('front',106,0,0,0),road)
assert(rearCloser&&rearCloser.reason==='rear_closing_yields')
assert.deepEqual(rearCloser.yielding,['rear'])
const ambiguity=classifyContactTimeRightOfWayV3(
 mover('a',100,0,3,1),mover('b',101.5,1,3,0),road)
assert(ambiguity&&ambiguity.reason==='ambiguous_mutual')
const fullY=(road.laneCount-1)*road.centerStepM
const reflected=classifyContactTimeRightOfWayV3(
 mover('renamed_F',100,fullY-1,3,fullY-1),
 mover('renamed_L',101.6,fullY-.19,3,fullY-.38),road)
assert(reflected&&reflected.reason===entering.reason&&
 reflected.firstFraction===entering.firstFraction)
assert.deepEqual(reflected.yielding,['renamed_L'])
const parallel=[mover('a',100,0,10,0),mover('b',106,0,0,0),
 mover('c',100,2,10,2),mover('d',106,2,0,2)]
const ties=resolveContactPriorityV3(parallel,road,{policy:'contact_time_lane_occupancy'})
assert(ties.contactTieGroups>0,'A50 must process simultaneous earliest contact components')
assert.equal(ties.hardFallbacks,0)
const symmetryCase=[mover('foo',100,0,10,0),mover('bar',106,0,0,0)]
const renamed=resolveContactPriorityV3(
 [mover('z',100,0,10,0),mover('a',106,0,0,0)],road,{policy:'contact_time_lane_occupancy'})
assert(renamed.scales.get('z')<1&&renamed.scales.get('a')===1)

const policies50=['trapezoid_rear_priority','trapezoid_rear_corridor_guard',
 'trapezoid_rear_corridor_leader','trapezoid_contact_time_occupancy']
const names50={trapezoid_rear_priority:'rear',
 trapezoid_rear_corridor_guard:'guard',
 trapezoid_rear_corridor_leader:'leader',
 trapezoid_contact_time_occupancy:'contact'}
const anchors50=['trapezoid_rear_priority','trapezoid_rear_corridor_guard']
const grids50=[.5,1,2,2.5,5],outcomes=[],fairness=[],mirror=[],spotlights=[],errors=[]
let runs=0
const snapshots=new Map()
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry),mirrorY=r6((g.laneCount-1)*g.centerStepM)
 for(const n of counts)for(const v of variations){
  try{
   const key=[g.id,n,v].join('|')
   const values={}
   for(const policy of policies50){
    values[policy]={}
    for(const quantum of grids50){
     const trace=(g.id==='baseline_5m'&&n===8&&v===1&&quantum===.5)||
      (g.id==='wide_6_5m'&&n===8&&v===1&&quantum===.5)||
      (g.id==='cautious_5m'&&n===32&&v===0&&quantum===2.5)||
      (g.id==='cautious_5m'&&n===32&&v===1&&quantum===2)
     values[policy][String(quantum)]=simulate(geometry,g,n,v,policy,quantum,{diagnostics:trace})
     runs++
    }
   }
   const references=Object.fromEntries(anchors50.map(x=>[x,values[x]['0.5'].riders]))
   for(const quantum of grids50){
    const candidates=Object.fromEntries(policies50.map(p=>[p,values[p][String(quantum)].riders]))
    const byAnchor=Object.fromEntries(anchors50.map(a=>[
     names50[a],compareCommonReferenceV3(references[a],candidates,
      {anchorId:a,quantum}).comparisons]))
    const direct=Object.fromEntries(policies50.slice(0,3).map(p=>[
     names50[p],compareMatchedPoliciesV3(values[p][String(quantum)].riders,
      values.trapezoid_contact_time_occupancy[String(quantum)].riders,
      {quantum,policyA:p,policyB:'contact'}).comparison]))
    outcomes.push({road:g.id,n,v,quantum,byAnchor,direct,
     fallbacks:Object.fromEntries(policies50.map(p=>[
      names50[p],values[p][String(quantum)].metrics.priorityHardFallbacks])),
     entrantYields:values.trapezoid_contact_time_occupancy[String(quantum)].metrics.contactTimeEntrantYields,
     rearYields:values.trapezoid_contact_time_occupancy[String(quantum)].metrics.contactTimeRearYields,
     mutualYields:values.trapezoid_contact_time_occupancy[String(quantum)].metrics.contactTimeMutualYields,
     tieGroups:values.trapezoid_contact_time_occupancy[String(quantum)].metrics.contactTimeTieGroups})
   }
   const renamedMap=new Map(),originalId=new Map()
   for(let i=0;i<n;i++){const old='r'+String(i).padStart(3,'0'),now='z'+String(n-i-1).padStart(3,'0');renamedMap.set(i,now);originalId.set(now,old)}
   const base=values.trapezoid_contact_time_occupancy['0.5']
   const perm=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',.5,
    {names:renamedMap,idMap:originalId})
   const side=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',.5,{mirror:true})
   const permDelta=delta(base,perm)
   const mirrorDelta=delta(base,side,{mirror:true,maxY:mirrorY})
   fairness.push({road:g.id,n,v,...permDelta})
   mirror.push({road:g.id,n,v,...mirrorDelta})
   const fixtureSpecs=[
    {road:'baseline_5m',n:8,v:1,quantum:.5,expected:51},
    {road:'wide_6_5m',n:8,v:1,quantum:.5,expected:51.5},
    {road:'cautious_5m',n:32,v:0,quantum:2.5,expected:22.5},
    {road:'cautious_5m',n:32,v:1,quantum:2,expected:22}
   ]
   const spec=fixtureSpecs.find(x=>x.road===g.id&&x.n===n&&x.v===v)
   if(spec){
    const lhs=values.trapezoid_rear_priority[String(spec.quantum)]
    const rhs=values.trapezoid_contact_time_occupancy[String(spec.quantum)]
    const first=firstComparedDivergenceV3(lhs,rhs,g,spec.quantum)
    const all=rhs.observed.flatMap(t=>t.previews)
    const contactEvents=all.reduce((a,t)=>a+t.previewConflictCount,0)
    const candidatesAt=rhs.observed.flatMap(t=>t.previews).filter(t=>
     t.tickStartSeconds+(t.substep)*t.dtSeconds>=spec.expected-1e-9&&
     t.tickStartSeconds+(t.substep)*t.dtSeconds<=spec.expected+1e-9)
    const classified=candidatesAt.flatMap(e=>{
     const m=new Map(e.proposals.map(p=>[p.riderId,p]))
     return e.previewConflictPairs.map(([a,b])=>{
      const aa=m.get(a),bb=m.get(b)
      const decision=classifyContactTimeRightOfWayV3(
       {riderId:a,original:{meters:aa.x0,y:aa.y0},
        forward:aa.proposedMeters,y:aa.proposedY},
       {riderId:b,original:{meters:bb.x0,y:bb.y0},
        forward:bb.proposedMeters,y:bb.proposedY},g)
      return {pair:[a,b],reason:decision?.reason,firstContact:decision?.firstFraction,
       selectedYields:decision?.yielding}
     })
    })
    assert(classified.length>0,'A50 must classify actual frozen source contact')
    spotlights.push({...spec,firstRelativeToRear:first?{
      time:first.simulationSeconds,rider:first.offendingRiderId,
      maxXDeltaM:first.maxXDeltaM}:null,
     inputConflicts:contactEvents,atSourceContact:classified,
     contactTimeCandidateFallbacks:rhs.metrics.priorityHardFallbacks})
   }
  }catch(e){const item={road:g.id,n,v,error:String(e.stack??e)};errors.push(item);console.error(JSON.stringify(item))}
 }
}
assert.equal(errors.length,0,'A50 physical validation failure')
assert.equal(runs,800,'A50 expected exactly 800 control and candidate physics runs')
assert.equal(outcomes.length,200,'A50 expected 200 common-anchor groups')
assert.equal(fairness.length,40);assert.equal(mirror.length,40);assert.equal(spotlights.length,4)
const notMirror=mirror.filter(x=>x.maxX>1e-5||x.maxY>1e-5||x.maxW>1e-5)
const notId=fairness.filter(x=>x.maxX>1e-5||x.maxY>1e-5||x.maxW>1e-5)
const perGrid=grids50.map(quantum=>{
 const rows=outcomes.filter(x=>x.quantum===quantum)
 const sum=fn=>rows.reduce((a,x)=>a+fn(x),0)
 const max=fn=>Math.max(...rows.map(fn))
 const eachAnchor=Object.fromEntries(['rear','guard'].map(anchor=>[
  anchor,Object.fromEntries(['rear','guard','leader','contact'].map(name=>{
   const ref=policies50.find(p=>names50[p]===name)
   return [name,{
    maxX:max(x=>x.byAnchor[anchor][ref].maxPositionM),
    maxGap:max(x=>x.byAnchor[anchor][ref].maxLeaderGapM),
    inversions:sum(x=>x.byAnchor[anchor][ref].positionOrderInversions)
   }]
  }))]))
 return {quantum,cases:rows.length,anchors:eachAnchor,
  contactFallbacks:sum(x=>x.fallbacks.contact),
  contactEntrantYields:sum(x=>x.entrantYields),
  contactRearYields:sum(x=>x.rearYields),
  contactMutualYields:sum(x=>x.mutualYields),
  contactTieGroups:sum(x=>x.tieGroups),
  directlyIdenticalVsRear:sum(x=>Number(x.direct.rear.changedRiders===0)),
  directlyIdenticalVsGuard:sum(x=>Number(x.direct.guard.changedRiders===0)),
  directlyIdenticalVsLeader:sum(x=>Number(x.direct.leader.changedRiders===0)),
  directPairInversionsVsRear:sum(x=>x.direct.rear.positionOrderInversions)}
})
const byAnchorWorst=perGrid.slice(1).map(x=>{
 const cand=x.anchors.rear.contact,ref=x.anchors.rear.rear
 return {quantum:x.quantum,
  contactBeatsRearPosition:cand.maxX<=ref.maxX+1e-6,
  contactBeatsRearGap:cand.maxGap<=ref.maxGap+1e-6,
  contactBeatsRearPairOrder:cand.inversions<=ref.inversions}
})
const noRegressionAgainstControl=outcomes.filter(x=>x.quantum!==.5).filter(x=>{
 const a=x.byAnchor.rear.trapezoid_contact_time_occupancy,
  b=x.byAnchor.rear.trapezoid_rear_priority
 return a.maxPositionM>b.maxPositionM+1e-6||
  a.maxLeaderGapM>b.maxLeaderGapM+1e-6||
  a.positionOrderInversions>b.positionOrderInversions
})
const promotionReady=notId.length===0&&notMirror.length===0&&
 perGrid.every(g=>g.contactFallbacks===0)&&
 noRegressionAgainstControl.length===0&&byAnchorWorst.every(x=>
  x.contactBeatsRearPosition&&x.contactBeatsRearGap&&x.contactBeatsRearPairOrder)
const output={study:'A2_STEP50_FIRST_CONTACT_RIGHT_OF_WAY',
 technicalGate:'PASS',sportingGate:'NO_GO',promotionReady,
 scope:'OFFLINE 2-32 riders 60s synthetic geometry, no production writes',
 physicsRuns:runs,identityRuns:fairness.length,mirrorRuns:mirror.length,
 totalTechnicalExecutions:runs+fairness.length+mirror.length,
 commonAnchorGroups:outcomes.length,assertedInvariants:{
  laneEntrantGivesWay:true,rearClosingGivesWay:true,
  ambiguousSteeringMutual:true,simultaneousContactTies:true,
  riderRenamingAndMirrorPurePair:true},
 identityFailures:notId.length,mirrorFailures:notMirror.length,
 commonRearAnchorPerGrid:perGrid,
 controls:byAnchorWorst,
 perFixtureRegressionCount:noRegressionAgainstControl.length,
 regressions:noRegressionAgainstControl.slice(0,60),
 eventSpotlights:spotlights,
 allCases:outcomes,identityChecks:fairness,mirrorChecks:mirror,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP50_DIR??'/tmp/a2-step50'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step50-first-contact-rule.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({study:output.study,technicalGate:output.technicalGate,
 sportingGate:output.sportingGate,promotionReady:output.promotionReady,
 physicsRuns:output.physicsRuns,identityRuns:output.identityRuns,
 mirrorRuns:output.mirrorRuns,identityFailures:output.identityFailures,
 mirrorFailures:output.mirrorFailures,commonAnchorGroups:output.commonAnchorGroups,
 perGrid,perFixtureRegressionCount:output.perFixtureRegressionCount,
 eventSpotlights:output.eventSpotlights,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
