/** A46 opt-in follower corridor guard vs unchanged A44 control. NEVER approves live racing.
 * Tests source physical step sensitivity, identity/lateral symmetry,
 * swept space-time safety, exact replay and fixed commands.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as start,advanceSubstepPhysicalResearchV3 as move} from './a2SubstepPhysicalResearchV3.mjs'
import {resolveContactPriorityV3} from './a2CollisionPriorityResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const r6=x=>Math.round(x*1e6)/1e6
const policies=['symmetric_halving','symmetric_trapezoid_motion','trapezoid_rear_priority','trapezoid_rear_corridor_guard']
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
function simulate(geometry,g,n,v,policy,quantum,{mirror=false,idMap=null,names=null}={}){
 const roster=initial(n,g,v,{mirror,names})
 let state=start({riders:roster,geometry,road:{gradePercent:[-3,0][v]},
  substeps:10/quantum,conflictPolicy:policy})
 let checkpoint=null,nearStops=0
 for(let tick=0;tick<6;tick++){
  const before=new Map(state.riders.map(x=>[x.riderId,x.meters]))
  const cmd=commanded(state,v,g,{mirror,idMap}),frozen=structuredClone(cmd)
  state=move(state,cmd)
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
  gap:r6(front-x.meters)})),nearStops,metrics:state.metrics}
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
const g=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const two=[
 {riderId:'rear',original:{meters:100,y:0},forward:10,y:0},
 {riderId:'front',original:{meters:106,y:0},forward:0,y:0}
]
const three=[
 {riderId:'staying',original:{meters:100,y:0},forward:4,y:0},
 {riderId:'entering',original:{meters:100,y:1},forward:4,y:0}
]
const rear=resolveContactPriorityV3(two,g,{policy:'rear_priority'})
const entry=resolveContactPriorityV3(three,g,{policy:'lane_entry_priority'})
assert(rear.rearYields>0&&rear.scales.get('rear')<1&&rear.scales.get('front')===1,
 'Rear-priority physical fixture did not preserve front rider')
assert(entry.enteringYields>0&&entry.scales.get('entering')<1,
 'Existing lane rider priority direct fixture not exercised')
assert(rear.hardFallbacks===0&&entry.hardFallbacks===0)
const corridorFixture=[
 {riderId:'follower',original:{meters:100,y:0},forward:3,y:0},
 {riderId:'leader',original:{meters:101,y:1},forward:3,y:0}
]
const corridorDirect=resolveContactPriorityV3(corridorFixture,g,{policy:'rear_corridor_guard'})
assert(corridorDirect.corridorGuardYields>0,
 'A46 stationary-follower contact must trigger moving-leader guard')
assert(corridorDirect.hardFallbacks===0,
 'A46 controlled two-rider corridor should settle without hard fallback')
const cases=[],fairness=[],reflection=[],problems=[]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry),maxY=r6((g.laneCount-1)*g.centerStepM)
 for(const n of counts)for(const v of variations){
  try{
   const byPolicy={}
   for(const policy of policies){
    const reference=simulate(geometry,g,n,v,policy,.5)
    byPolicy[policy]=reference
    cases.push({road:g.id,n,v,policy,quantum:.5,vsHalf:delta(reference,reference),
     nearStops:reference.nearStops,metrics:reference.metrics})
    for(const quantum of quanta.slice(1)){
     const run=simulate(geometry,g,n,v,policy,quantum)
     cases.push({road:g.id,n,v,policy,quantum,vsHalf:delta(reference,run),
      nearStops:run.nearStops,metrics:run.metrics})
    }
   }
   for(const policy of policies.slice(2)){
    const fixed=byPolicy[policy]
    if(n>=8){
     const renamed=new Map(),idMap=new Map()
     for(let i=0;i<n;i++){
      const name='z'+String(n-1-i).padStart(3,'0'),original='r'+String(i).padStart(3,'0')
      renamed.set(i,name);idMap.set(name,original)
     }
     const run=simulate(geometry,g,n,v,policy,.5,{names:renamed,idMap})
     fairness.push({road:g.id,n,v,policy,...delta(fixed,run)})
    }
    const run=simulate(geometry,g,n,v,policy,.5,{mirror:true})
    reflection.push({road:g.id,n,v,policy,...delta(fixed,run,{mirror:true,maxY})})
   }
  }catch(e){const err={road:g.id,n,v,error:String(e.stack??e)};problems.push(err);console.error(JSON.stringify(err))}
 }
}
assert.equal(problems.length,0,'A44 technical simulation failure')
assert.equal(cases.length,800);assert.equal(fairness.length,64);assert.equal(reflection.length,80)
const summary=policies.flatMap(policy=>quanta.map(quantum=>{
 const relevant=cases.filter(x=>x.policy===policy&&x.quantum===quantum)
 const biggest=key=>Math.max(...relevant.map(x=>x.vsHalf[key]))
 const sum=fn=>relevant.reduce((a,x)=>a+fn(x),0)
 return {policy,quantum,cases:relevant.length,
  maxX:biggest('maxX'),maxGap:biggest('maxGap'),
  maxW:biggest('maxW'),
  inversions:sum(x=>x.vsHalf.inversions),
  changedRankingCases:sum(x=>x.vsHalf.inversions>0?1:0),
  nearStops:sum(x=>x.nearStops),
  rearYields:sum(x=>x.metrics.priorityRearYields??0),
  enteringYields:sum(x=>x.metrics.priorityEnteringYields??0),
  symmetricYields:sum(x=>x.metrics.prioritySymmetricYields??0),
  hardFallbacks:sum(x=>x.metrics.priorityHardFallbacks??0),
  corridorGuards:sum(x=>x.metrics.priorityCorridorGuards??0),
  stalledGuards:sum(x=>x.metrics.priorityStalledGuards??0)}
}))
const reference=summary.find(x=>x.policy==='symmetric_trapezoid_motion'&&x.quantum===1)
assert.equal(reference.maxX,239.187501,'A43 trapezoid drift changed')
assert.equal(reference.inversions,920,'A43 trapezoid inversion baseline changed')
const paired=policies.slice(2).map(policy=>{
 const improvements=quanta.slice(1).map(quantum=>{
  const base=summary.find(x=>x.policy==='symmetric_trapezoid_motion'&&x.quantum===quantum)
  const trial=summary.find(x=>x.policy===policy&&x.quantum===quantum)
  return {quantum,
   betterOrEqualX:trial.maxX<=base.maxX,
   betterOrEqualGap:trial.maxGap<=base.maxGap,
   betterOrEqualRanking:trial.inversions<=base.inversions,
   xImprovementM:r6(base.maxX-trial.maxX),
   gapImprovementM:r6(base.maxGap-trial.maxGap),
   inversionImprovement:base.inversions-trial.inversions}
 })
 const rename=fairness.filter(x=>x.policy===policy)
 const mirror=reflection.filter(x=>x.policy===policy)
 const renameFailures=rename.filter(x=>x.maxX>1e-5||x.maxY>1e-5).length
 const mirrorFailures=mirror.filter(x=>x.maxX>1e-5||x.maxY>1e-5).length
 return {policy,improvements,renameFailures,mirrorFailures,
  bestNumeric:improvements.every(x=>x.betterOrEqualX&&x.betterOrEqualGap&&x.betterOrEqualRanking),
  sportingStatus:'NO_GO'}
})
const byKey=new Map(cases.map(x=>[
 [x.road,x.n,x.v,x.quantum,x.policy].join('|'),x]))
const individual=[]
for(const x of cases.filter(x=>x.policy==='trapezoid_rear_corridor_guard'&&x.quantum!==.5)){
 const get=p=>byKey.get([x.road,x.n,x.v,x.quantum,p].join('|'))
 const rear=get('trapezoid_rear_priority')
 const original=get('symmetric_trapezoid_motion')
 const cmp=(p)=>({
  x:r6(p.vsHalf.maxX-x.vsHalf.maxX),
  gap:r6(p.vsHalf.maxGap-x.vsHalf.maxGap),
  inversions:p.vsHalf.inversions-x.vsHalf.inversions,
  noRegression:x.vsHalf.maxX<=p.vsHalf.maxX+1e-6&&
   x.vsHalf.maxGap<=p.vsHalf.maxGap+1e-6&&
   x.vsHalf.inversions<=p.vsHalf.inversions
 })
 individual.push({road:x.road,n:x.n,v:x.v,quantum:x.quantum,
  vsRear:cmp(rear),vsTrapezoid:cmp(original),
  rearFallbacks:rear.metrics.priorityHardFallbacks,
  guardedFallbacks:x.metrics.priorityHardFallbacks,
  corridorActions:x.metrics.priorityCorridorGuards,
  stalledActions:x.metrics.priorityStalledGuards})
}
assert.equal(individual.length,160)
const perGrid=[1,2,2.5,5].map(quantum=>{
 const rows=individual.filter(x=>x.quantum===quantum)
 return {quantum,total:rows.length,
  regressionsVsRear:rows.filter(x=>!x.vsRear.noRegression).length,
  regressionsVsTrapezoid:rows.filter(x=>!x.vsTrapezoid.noRegression).length,
  addedOrderInversionsVsRear:rows.filter(x=>x.vsRear.inversions<0).length,
  morePositionDifferenceVsRear:rows.filter(x=>x.vsRear.x<-1e-6).length,
  moreGapDifferenceVsRear:rows.filter(x=>x.vsRear.gap<-1e-6).length,
  rearFallbacks:rows.reduce((s,x)=>s+x.rearFallbacks,0),
  guardedFallbacks:rows.reduce((s,x)=>s+x.guardedFallbacks,0)}
})
const halfRear=summary.find(x=>x.policy==='trapezoid_rear_priority'&&x.quantum===.5)
const halfGuard=summary.find(x=>x.policy==='trapezoid_rear_corridor_guard'&&x.quantum===.5)
assert.equal(halfRear.hardFallbacks,148,'A45 148 fallback reference shifted')
const candidate=paired.find(x=>x.policy==='trapezoid_rear_corridor_guard')
const promotionEligible=halfGuard.hardFallbacks<148&&
 candidate.renameFailures===0&&candidate.mirrorFailures===0&&
 perGrid.every(x=>x.regressionsVsRear===0&&x.regressionsVsTrapezoid===0)
const report={study:'A2_STEP46_FOLLOWER_CLEARANCE_GUARD',technicalGate:'PASS',
 sportingGate:'NO_GO',promotionEligible,
 corridorDirectCase:{guardActions:corridorDirect.corridorGuardYields,fallback:corridorDirect.hardFallbacks},
  originalRearFallbackAtHalf:148,guardFallbackAtHalf:halfGuard.hardFallbacks,
  guardActionsAtHalf:halfGuard.corridorGuards??0,
  perGrid,individual,individualRegressionTotal:individual.filter(x=>!x.vsRear.noRegression).length,
  sampleScope:'synthetic 2-32 riders, 60s, four provisional road envelopes',
 totalAcceptedRuns:944,referenceCases:800,renameCases:64,mirrorCases:80,
 summary,paired,caseResults:cases,identityChecks:fairness,mirrorChecks:reflection,
 problems,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP46_DIR??'/tmp/a2-step46'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step46-corridor-guard-results.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 sportingGate:report.sportingGate,totalAcceptedRuns:report.totalAcceptedRuns,
 referenceCases:report.referenceCases,renameCases:report.renameCases,
 mirrorCases:report.mirrorCases,summary,paired,perGrid,promotionEligible,
  originalRearFallbackAtHalf:report.originalRearFallbackAtHalf,
  guardFallbackAtHalf:report.guardFallbackAtHalf,
  individualRegressionTotal:report.individualRegressionTotal,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
