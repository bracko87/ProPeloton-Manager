/** A39 isolated physics-only test: time-grid and ID-renaming fairness.
 * Sporting acceptance is deliberately NOT inferred from technical PASS.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {resolveEventTimeYieldV3} from './a2EventTimeYieldResearchV3.mjs'
import {initializeSubstepPhysicalResearchV3 as begin,advanceSubstepPhysicalResearchV3 as advance} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const round=x=>Math.round(x*1e6)/1e6
const policies=['symmetric_halving','event_time_yield','event_time_fair']
const sizes=[2,8,12,24,32],variations=[0,1],grids=[5,4,2]
const starters=(n,g,v)=>Array.from({length:n},(_,i)=>({
 riderId:'r'+String(i).padStart(3,'0'),meters:100+i*6.4+v*2,
 y:(i%g.laneCount)*g.centerStepM,speedMps:4+i%4,
 cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
function commands(state,v,g,{originalIds=null,mirror=false}={}){
 const maxY=(g.laneCount-1)*g.centerStepM
 return state.riders.map(r=>{
  const id=originalIds?.get(r.riderId)??r.riderId
  const i=Number(id.slice(1)),lane=i%g.laneCount
  const delta=state.tick%3===1&&(i+v)%4===0?-1:
   state.tick%3===2&&(i+v)%5===0?1:0
  const y=Math.min(maxY,round(Math.max(0,Math.min(g.laneCount-1,lane+delta))*g.centerStepM))
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+state.tick+v)%6,
   targetY:mirror?Math.max(0,Math.min(maxY,round(maxY-y))):y,steeringWatts:35}
 })
}
function run(start,geometry,g,v,policy,substeps,opts={}){
 const setup={riders:start,geometry,road:{gradePercent:[-3,0][v]},
  conflictPolicy:policy,substeps,tickSeconds:10,diagnosticTrace:true}
 let state=begin(setup),checkpoint=null,nearStopTicks=0,snapshots=[]
 for(let t=0;t<6;t++){
  const prior=new Map(state.riders.map(r=>[r.riderId,r.meters]))
  const intents=commands(state,v,g,opts),frozen=structuredClone(intents)
  state=advance(state,intents)
  snapshots.push({tick:t,tracks:structuredClone(state.lastTickTracks),events:structuredClone(state.lastTickConflictTrace),
    metrics:{tieGroups:state.metrics.physicalTieGroups,hardFallbacks:state.metrics.hardFallbacks}})
  assert.deepEqual(intents,frozen,'Physical integrator changed frozen intent')
  assert.equal(auditObservedTrackSetV3(state.lastTickTracks,geometry).metrics.piecewiseCollisions,0)
  assert.equal(state.metrics.remainingPiecewiseOverlaps,0)
  nearStopTicks+=state.riders.filter(r=>r.meters-prior.get(r.riderId)<.5).length
  if(t===2)checkpoint=JSON.parse(JSON.stringify(state))
 }
 let replay=checkpoint
 for(let t=3;t<6;t++)replay=advance(replay,commands(replay,v,g,opts))
 assert.deepEqual(replay,state,'Serialized halfway replay must be exact')
 assert.equal(state.elapsedSeconds,60)
 assert.equal(state.officialWrites,0)
 assert.equal(state.sportingApproval,'NOT_APPROVED')
 assert.equal(state.metrics.riderSubsteps,6*start.length*substeps)
 assert(state.riders.every(r=>Number.isFinite(r.energy.remainingWPrimeJoules)&&
  r.energy.remainingWPrimeJoules>=0&&r.energy.seconds===60))
 assert(Math.abs(state.metrics.mechanicalJoules-state.riders.reduce((s,r)=>
  s+r.energy.cumulativeMechanicalJoules,0))<1e-5)
 const front=Math.max(...state.riders.map(r=>r.meters))
 return {policy,seconds:10/substeps,nearStopTicks,snapshots,
  attenuation:state.metrics.attenuatedRiderSubsteps,
  tieGroups:state.metrics.physicalTieGroups??0,
  hardFallbacks:state.metrics.hardFallbacks,
  riders:state.riders.map(r=>({id:opts.originalIds?.get(r.riderId)??r.riderId,
   meters:r.meters,gap:round(front-r.meters),
   wPrime:r.energy.remainingWPrimeJoules}))}
}
function diff(a,b){
 assert.equal(a.riders.length,b.riders.length)
 const match=new Map(b.riders.map(r=>[r.id,r]))
 let maxPositionM=0,maxGapM=0,maxWPrimeJ=0,inversions=0
 for(const u of a.riders){
  const v=match.get(u.id);assert(v,'Matching logical ID missing')
  maxPositionM=Math.max(maxPositionM,Math.abs(u.meters-v.meters))
  maxGapM=Math.max(maxGapM,Math.abs(u.gap-v.gap))
  maxWPrimeJ=Math.max(maxWPrimeJ,Math.abs(u.wPrime-v.wPrime))
 }
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const u=a.riders[i],v=a.riders[j],x=match.get(u.id),y=match.get(v.id)
  const lhs=u.meters-v.meters,rhs=x.meters-y.meters
  if(Math.abs(lhs)>1e-6&&Math.abs(rhs)>1e-6&&lhs*rhs<0)inversions++
 }
 return {maxPositionM:round(maxPositionM),maxGapM:round(maxGapM),
  maxWPrimeJ:round(maxWPrimeJ),inversions}
}

const mismatches=[],checked=[]
function firstDifference(a,b,maxY){
 const ma=new Map(a.riders.map(x=>[x.id,x])),mb=new Map(b.riders.map(x=>[x.id,x]))
 for(let tick=0;tick<a.snapshots.length;tick++){
  const sa=a.snapshots[tick],sb=b.snapshots[tick],ka=new Map(sa.tracks.map(x=>[x.riderId,x.knots])),kb=new Map(sb.tracks.map(x=>[x.riderId,x.knots]))
  for(let step=0;step<ka.values().next().value.length;step++){
   for(const [id,knots] of ka){
    const x=knots[step],y=kb.get(id)[step]
    const xDifference=Math.abs(x.x-y.x),yDifference=Math.abs(maxY-x.y-y.y)
    if(xDifference>1e-5||yDifference>1e-5){
     return {tick,step,riderId:id,xDifference:round(xDifference),mirroredYDeviation:round(yDifference),
      baselineKnot:x,reflectedKnot:y,
      baselinePairEvents:sa.events.slice(0,12),mirrorPairEvents:sb.events.slice(0,12),
      originalSummary:sa.metrics,reflectedSummary:sb.metrics,
      neighboringKnots:[...ka.keys()].filter(k=>k!==id).slice(0,4).map(k=>({id:k,a:ka.get(k)[step],b:kb.get(k)[step]}))}
    }
   }
  }
 }
 return null
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry),maxY=(g.laneCount-1)*g.centerStepM
 for(const n of sizes)for(const v of variations)for(const grid of grids){
  const start=starters(n,g,v)
  const normal=run(start,geometry,g,v,'event_time_fair',grid)
  const reflected=start.map(r=>({...r,y:Math.max(0,Math.min(maxY,round(maxY-r.y)))}))
  const mirror=run(reflected,geometry,g,v,'event_time_fair',grid,{mirror:true})
  const delta=diff(normal,mirror),first=firstDifference(normal,mirror,maxY)
  checked.push({road:g.id,n,v,seconds:10/grid,maxXDifferenceM:delta.maxPositionM})
  if(delta.maxPositionM>1e-5)
   mismatches.push({road:g.id,n,v,seconds:10/grid,...delta,first})
 }
}
assert.equal(checked.length,120)
assert.equal(mismatches.length,3,'Step39 documented three mirror counterexamples must reproduce')
const out={study:'A2_STEP40_MIRROR_ROOT_CAUSE',technicalGate:'PASS',checked:checked.length,
 mismatches,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP40_DIR??'/tmp/a2-step40'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step40-mirror-diagnosis.json',JSON.stringify(out,null,2)+'\n')
console.log(JSON.stringify({study:out.study,technicalGate:out.technicalGate,checked:out.checked,
 mismatches:out.mismatches,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
