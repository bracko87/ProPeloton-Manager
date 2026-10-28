/** A54 shadow energy/velocity and consecutive physical substep checks. OFFLINE ONLY.
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







const sourceEvents=[
 {name:'baseline_r004_r005',road:'baseline_5m',n:8,v:1,q:.5,sourceTime:51},
 {name:'wide_r004_r005',road:'wide_6_5m',n:8,v:1,q:.5,sourceTime:51.5},
 {name:'cautious32_v0',road:'cautious_5m',n:32,v:0,q:2.5,sourceTime:22.5},
 {name:'cautious32_v1',road:'cautious_5m',n:32,v:1,q:2,sourceTime:22}
]
const results=[],sources=[],failures=[]
let physicalRuns=0,componentTrials=0,unionTrials=0
const expected=[{q:.5,cases:40,divergent:28,local:31,safe:31},
 {q:2,cases:1,divergent:1,local:1,safe:1},
 {q:2.5,cases:40,divergent:28,local:43,safe:38}]
const safeShadow=(preview,nextPreview,g,grade,q,ids)=>{
 const x=auditHybridEnergyNextV3(preview,nextPreview,g,{gradePercent:grade},ids,
  {physicalSeconds:q})
 assert.equal(x.officialWrites,0)
 assert.equal(x.sportingApproval,'NOT_APPROVED')
 if(x.classification==='GEOMETRY_PASS_ENERGY_REPLAYED'){
  assert.equal(x.energyClockValid,true)
  assert.equal(x.energyLedgerVerified,true)
  assert.equal(x.unchangedEnergyExact,true)
  assert.equal(x.secondSweptSafe,nextPreview?true:null)
  assert.equal(x.replayVerified,Boolean(nextPreview))
  assert.equal(x.nextStepChecked,Boolean(nextPreview))
  assert.equal(x.baselineNextMatches,nextPreview?true:null)
  assert(x.firstStates.every(p=>p.energy.remainingWPrimeJoules>=0&&
   p.energy.cumulativeMechanicalJoules>=0))
 }else assert.equal(x.classification,'REJECTED_GEOMETRY')
 return x
}
const summaries=new Map(expected.map(e=>[e.q,{quantum:e.q,
 scenarios:0,differentFirstPaths:0,componentTrials:0,
 geometrySafe:0,geometryRejected:0,
 energyReplayed:0,energyRejected:0,
 provisionalAccelerationViolationCases:0,provisionalAccelerationViolatingRiders:0,
 baselineAccelerationViolatingRiders:0,introducedAccelerationViolationCases:0,
 introducedAccelerationViolatingRiders:0,accelerationLimitPasses:0,
 nextStepChecked:0,nextSubstepFailed:0,continuedWithoutNext:0,
 changedOnNextStepTotal:0,
 maximumWPrimeDifferenceJ:0,maximumTerminalSpeedDifferenceMps:0,
 maximumNextPositionDifferenceM:0,maximumNextWPrimeDifferenceJ:0,
 maximumAverageAccelerationMps2:0,
 unionsSafe:0,unionsRejected:0,unionsEnergyReplayed:0,unionsNextChecked:0}]))
const invalidEnergyErrors=[]
function auditCase(preview,next,g,grade,q,ids){
 try{return safeShadow(preview,next,g,grade,q,ids)}
 catch(err){
  if(String(err.message).includes('Motion exceeded research rider energy budget; recalculate motion'))
   return {classification:'ENERGY_BUDGET_REJECTED',error:String(err.message),
    guard:{allow:true},energyLedgerVerified:false,nextStepChecked:false,
    officialWrites:0,sportingApproval:'NOT_APPROVED'}
  // Unexpected numerical, replay or safety failure must fail this gate.
  throw err
 }
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const focused=sourceEvents.filter(x=>x.road===g.id&&x.n===n&&x.v===v)
  const qs=focused.some(x=>x.q===2)?[.5,2,2.5]:[.5,2.5]
  for(const q of qs){
   try{
    const grade=[-3,0][v]
    const ref=simulate(geometry,g,n,v,'trapezoid_rear_priority',q,{diagnostics:true})
    const cmp=simulate(geometry,g,n,v,'trapezoid_contact_time_occupancy',q,{diagnostics:true})
    physicalRuns+=2
    const row=summaries.get(q);row.scenarios++
    const first=analyzeFirstDecisionV3(ref,cmp,g,q)
    const record={road:g.id,n,v,q,firstTime:first?.firstAcceptedDifferenceSeconds??null,
     components:[],union:null}
    if(first){
     row.differentFirstPaths++
     const tick=ref.observed[first.tick]
     const preview=tick.previews[first.substep-1]
     const next=tick.previews[first.substep]??null
     const previous=inspectFrozenComponentInterventionsV3(preview,g)
     const baseline=auditCase(preview,next,g,grade,q,[])
     assert.equal(baseline.classification,'GEOMETRY_PASS_ENERGY_REPLAYED',
      'A54 reference baseline energy/next reproduction failed')
     assert.equal(baseline.guard.changedCount,0)
     assert.equal(baseline.maxWPrimeDifferenceJ,0)
     assert.equal(baseline.maxTerminalSpeedDifferenceMps,0)
     assert.equal(baseline.maxNextPositionDifferenceM,0)
     for(const component of previous.isolatedComponents){
      const shadow=auditCase(preview,next,g,grade,q,component.members)
      assert.equal(shadow.guard.allow,component.collisionFree,
       'A54 changed A53 geometric safety classification')
      row.componentTrials++;componentTrials++
      row.geometrySafe+=Number(shadow.guard.allow)
      row.geometryRejected+=Number(!shadow.guard.allow)
      const entry={members:component.members,geometryAllowed:shadow.guard.allow,
       classification:shadow.classification}
      if(shadow.guard.allow){
       if(shadow.classification==='GEOMETRY_PASS_ENERGY_REPLAYED'){
        row.energyReplayed++;entry.maxWPrimeDifferenceJ=shadow.maxWPrimeDifferenceJ
        entry.maxTerminalSpeedDifferenceMps=shadow.maxTerminalSpeedDifferenceMps
        entry.provisionalAccelerationViolations=shadow.provisionalAccelViolationCount
        entry.introducedAccelerationViolations=shadow.introducedAccelViolationCount
        row.provisionalAccelerationViolatingRiders+=shadow.provisionalAccelViolationCount
        row.baselineAccelerationViolatingRiders+=shadow.baselineAccelViolationCount
        row.introducedAccelerationViolatingRiders+=shadow.introducedAccelViolationCount
        row.introducedAccelerationViolationCases+=Number(shadow.introducedAccelViolationCount>0)
        row.accelerationLimitPasses+=Number(shadow.accelerationLimitPass)
        row.provisionalAccelerationViolationCases+=Number(shadow.provisionalAccelViolationCount>0)
        row.maximumWPrimeDifferenceJ=Math.max(row.maximumWPrimeDifferenceJ,
         shadow.maxWPrimeDifferenceJ)
        row.maximumTerminalSpeedDifferenceMps=Math.max(
         row.maximumTerminalSpeedDifferenceMps,shadow.maxTerminalSpeedDifferenceMps)
        row.maximumAverageAccelerationMps2=Math.max(
         row.maximumAverageAccelerationMps2,shadow.largestPostSubstepAccelerationMps2)
        if(shadow.nextStepChecked){
         row.nextStepChecked++;row.changedOnNextStepTotal+=shadow.changedNextRiders
         row.maximumNextPositionDifferenceM=Math.max(row.maximumNextPositionDifferenceM,
          shadow.maxNextPositionDifferenceM)
         row.maximumNextWPrimeDifferenceJ=Math.max(row.maximumNextWPrimeDifferenceJ,
          shadow.maxNextWPrimeDifferenceJ)
        }else row.continuedWithoutNext++
       }else row.energyRejected++
      }
      record.components.push(entry)
     }
     const group=previous.combinedChangedComponents.members
     const union=auditCase(preview,next,g,grade,q,group)
     assert.equal(union.guard.allow,previous.interventionSafety.combinedSafe)
     row.unionsSafe+=Number(union.guard.allow);row.unionsRejected+=Number(!union.guard.allow)
     unionTrials++
     if(union.classification==='GEOMETRY_PASS_ENERGY_REPLAYED'){
      row.unionsEnergyReplayed++;row.unionsNextChecked+=Number(union.nextStepChecked)
     }
     record.union={members:group,classification:union.classification,
      geometryAllowed:union.guard.allow,
      provisionalAccelerationViolations:union.provisionalAccelViolationCount??null,
      nextChecked:union.nextStepChecked}
    }
    results.push(record)
    for(const spec of focused.filter(x=>x.q===q)){
     const tick=Math.floor((spec.sourceTime-1e-7)/10)
     const index=Math.round((spec.sourceTime-tick*10)/q)-1
     const preview=ref.observed[tick].previews[index]
     const next=ref.observed[tick].previews[index+1]??null
     const prior=inspectFrozenComponentInterventionsV3(preview,g)
     const union=auditCase(preview,next,g,grade,q,
      prior.combinedChangedComponents.members)
     assert.equal(union.guard.allow,prior.interventionSafety.combinedSafe)
     sources.push({...spec,originalContactPairs:prior.sourcePairs,
      divergenceBeforeSource:record.firstTime!==spec.sourceTime,
      classification:union.classification,
      changedRiders:union.changedRiders??null,
      provisionalAccelViolationCount:union.provisionalAccelViolationCount??null,
      maxWPrimeDifferenceJ:union.maxWPrimeDifferenceJ??null,
      nextStepChecked:union.nextStepChecked??false})
    }
   }catch(e){const f={road:g.id,n,v,q,error:String(e.stack??e)}
    failures.push(f);console.error(JSON.stringify(f))}
  }
 }
}
assert.equal(failures.length,0,'A54 shadow physical-state/replay check failed')
assert.equal(physicalRuns,162)
assert.equal(results.length,81)
assert.equal(sources.length,4)
assert.equal(results.filter(x=>x.firstTime!==null).length,57)
assert.equal(componentTrials,75);assert.equal(unionTrials,57)
const byGrid=[...summaries.values()]
assert.deepEqual(byGrid.map(x=>x.componentTrials),[31,1,43])
assert.deepEqual(byGrid.map(x=>x.geometryRejected),[0,0,5])
assert.deepEqual(byGrid.map(x=>x.unionsRejected),[0,0,4])
assert.equal(byGrid.reduce((a,x)=>a+x.geometrySafe,0),70)
const verdict={study:'A2_STEP54_SHADOW_ENERGY_AND_NEXT_SUBSTEP',
 technicalGate:'PASS',sportingGate:'NO_GO',
 scope:'OFFLINE shadow transition with unchanged frozen commands; NOT a full 10-second tick or official racing',
 physicalRuns,pairedComparisons:results.length,
 localTrials:componentTrials,localGeometryAllowed:70,localGeometryRejected:5,
 unionTrials,unionGeometryAllowed:53,unionGeometryRejected:4,
 byGrid,sources,individualResults:results,
 energyBudgetRejected:byGrid.reduce((a,x)=>a+x.energyRejected,0),
 provisionalAccelViolationCases:byGrid.reduce((a,x)=>a+x.provisionalAccelerationViolationCases,0),
 introducedAccelerationViolationCases:byGrid.reduce((a,x)=>a+x.introducedAccelerationViolationCases,0),
 accelerationLimitPasses:byGrid.reduce((a,x)=>a+x.accelerationLimitPasses,0),
 nextStepReplays:byGrid.reduce((a,x)=>a+x.nextStepChecked,0),
 nextStepNotCovered:byGrid.reduce((a,x)=>a+x.continuedWithoutNext,0),
 activationApproved:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const folder=process.env.V3_A2_STEP54_DIR??'/tmp/a2-step54'
mkdirSync(folder,{recursive:true})
writeFileSync(folder+'/a2-step54-shadow-transitions.json',JSON.stringify(verdict,null,2)+'\n')
console.log(JSON.stringify({study:verdict.study,technicalGate:verdict.technicalGate,
 sportingGate:verdict.sportingGate,
 physicalRuns:verdict.physicalRuns,localTrials:verdict.localTrials,
 allowed:verdict.localGeometryAllowed,rejected:verdict.localGeometryRejected,
 energyBudgetRejected:verdict.energyBudgetRejected,
 provisionalAccelViolationCases:verdict.provisionalAccelViolationCases,
 introducedAccelerationViolationCases:verdict.introducedAccelerationViolationCases,
 accelerationLimitPasses:verdict.accelerationLimitPasses,
 nextStepReplays:verdict.nextStepReplays,nextStepNotCovered:verdict.nextStepNotCovered,
 byGrid:verdict.byGrid,sources:verdict.sources,
 activationApproved:false,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
