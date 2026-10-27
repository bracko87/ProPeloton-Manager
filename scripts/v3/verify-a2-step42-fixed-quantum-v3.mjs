/** A42 offline: separate PHYSICAL timestep from 2/2.5/5s reporting cadence.
 * Caution: invariant outputs across report cadences follow construction;
 * physical 0.5s versus 1s non-convergence is tested separately.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as startBase,advanceSubstepPhysicalResearchV3 as moveBase} from './a2SubstepPhysicalResearchV3.mjs'
import {initializeFixedQuantumResearchV3 as startFixed,advanceFixedQuantumResearchV3 as moveFixed} from './a2FixedQuantumResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const r6=x=>Math.round(x*1e6)/1e6
const sizes=[2,8,12,24,32],variations=[0,1],physicalQuanta=[.5,1,2,2.5,5],reportCadences=[2,2.5,5]
const players=(n,g,v)=>Array.from({length:n},(_,i)=>({
 riderId:'r'+String(i).padStart(3,'0'),meters:100+i*6.4+v*2,
 y:(i%g.laneCount)*g.centerStepM,speedMps:4+i%4,
 cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
function commands(state,g,v){
 const maxY=(g.laneCount-1)*g.centerStepM
 return state.riders.map(r=>{
  const i=Number(r.riderId.slice(1)),lane=i%g.laneCount
  const offset=state.tick%3===1&&(i+v)%4===0?-1:
   state.tick%3===2&&(i+v)%5===0?1:0
  const y=Math.min(maxY,r6(Math.max(0,Math.min(g.laneCount-1,lane+offset))*g.centerStepM))
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+state.tick+v)%6,
   targetY:y,steeringWatts:35}
 })
}
function stepRun(initial,geometry,g,v,{quantum=1,reportCadence=null}={}){
 const settings={riders:initial,geometry,road:{gradePercent:[-3,0][v]},tickSeconds:10}
 const fixed=reportCadence!==null
 let state=fixed?startFixed({...settings,physicalQuantumSeconds:quantum,reportingIntervalSeconds:reportCadence}):
  startBase({...settings,substeps:10/quantum,conflictPolicy:'symmetric_halving'})
 const move=fixed?moveFixed:moveBase
 let saved=null,nearStopTicks=0,checkedPairs=0
 for(let tick=0;tick<6;tick++){
  const before=new Map(state.riders.map(r=>[r.riderId,r.meters]))
  const intent=commands(state,g,v),frozen=structuredClone(intent)
  state=move(state,intent)
  assert.deepEqual(intent,frozen,'A42 mutated requested rider commands')
  const observer=auditObservedTrackSetV3(state.lastTickTracks,geometry)
  assert.equal(observer.metrics.piecewiseCollisions,0)
  assert.equal(observer.metrics.missedByChord,0)
  checkedPairs+=observer.metrics.pairs
  assert.equal(state.lastTickTracks.length,initial.length)
  for(const track of state.lastTickTracks){
   assert.equal(track.knots.length,1+10/quantum,
    'A42 displayed cadence illegally removed physical microstep knots')
   for(let j=0;j<track.knots.length;j++)
    assert(Math.abs(track.knots[j].t-j/(10/quantum))<1e-10,
     'A42 physical track time shifted to display cadence')
  }
  nearStopTicks+=state.riders.filter(r=>r.meters-before.get(r.riderId)<.5).length
  if(tick===2)saved=JSON.parse(JSON.stringify(state))
 }
 let restored=saved
 for(let tick=3;tick<6;tick++)restored=move(restored,commands(restored,g,v))
 assert.deepEqual(restored,state,'A42 JSON restore changed physical achieved motion')
 assert.equal(state.elapsedSeconds,60)
 assert.equal(state.officialWrites,0)
 assert.equal(state.sportingApproval,'NOT_APPROVED')
 const source=fixed?state.source:state
 assert.equal(source.metrics.riderSubsteps,initial.length*6*10/quantum)
 assert.equal(source.metrics.observedPairs,checkedPairs)
 assert.equal(source.metrics.remainingPiecewiseOverlaps,0)
 assert(source.riders.every(r=>r.energy.seconds===60&&
  Number.isFinite(r.energy.remainingWPrimeJoules)&&r.energy.remainingWPrimeJoules>=0))
 assert(Math.abs(source.metrics.mechanicalJoules-source.riders.reduce((s,r)=>
  s+r.energy.cumulativeMechanicalJoules,0))<1e-5)
 const front=Math.max(...state.riders.map(r=>r.meters))
 return {quantum,reportCadence,nearStopTicks,
  riderSubsteps:source.metrics.riderSubsteps,
  conflictPairChecks:source.metrics.conflictPairChecks,
  collisionProposals:source.metrics.collisionProposals,
  attenuated:source.metrics.attenuatedRiderSubsteps,
  observedPairs:source.metrics.observedPairs,
  source, // Exact physics checkpoint to compare across reporting cadences.
  riders:state.riders.map(r=>({id:r.riderId,x:r.meters,y:r.y,
   gap:r6(front-r.meters),wPrime:r.energy.remainingWPrimeJoules}))}
}
function compare(a,b){
 const lookup=new Map(b.riders.map(x=>[x.id,x]))
 let maxPositionM=0,maxGapM=0,maxWPrimeJ=0,maxLateralM=0,inversions=0
 for(const x of a.riders){
  const y=lookup.get(x.id);assert(y)
  maxPositionM=Math.max(maxPositionM,Math.abs(x.x-y.x))
  maxGapM=Math.max(maxGapM,Math.abs(x.gap-y.gap))
  maxWPrimeJ=Math.max(maxWPrimeJ,Math.abs(x.wPrime-y.wPrime))
  maxLateralM=Math.max(maxLateralM,Math.abs(x.y-y.y))
 }
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const x=a.riders[i],y=a.riders[j],xb=lookup.get(x.id),yb=lookup.get(y.id)
  const d=x.x-y.x,e=xb.x-yb.x
  if(Math.abs(d)>1e-6&&Math.abs(e)>1e-6&&d*e<0)inversions++
 }
 return {maxPositionM:r6(maxPositionM),maxGapM:r6(maxGapM),
  maxWPrimeJ:r6(maxWPrimeJ),maxLateralM:r6(maxLateralM),inversions}
}
const results=[],comparison=[],wrapperMatches=[],problems=[]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of sizes)for(const v of variations){
  const roster=players(n,g,v),frozen=structuredClone(roster)
  try{
   const native=physicalQuanta.map(quantum=>stepRun(roster,geometry,g,v,{quantum}))
   const atHalf=native[0],atOne=native[1]
   for(const q of native){
    const metrics={road:g.id,n,v,quantum:q.quantum,nearStopTicks:q.nearStopTicks,
     riderSubsteps:q.riderSubsteps,conflictPairChecks:q.conflictPairChecks,
     collisionProposals:q.collisionProposals,attenuated:q.attenuated,
     observedPairs:q.observedPairs}
    results.push(metrics)
    comparison.push({...metrics,...compare(atHalf,q)})
   }
   for(const quantum of [.5,1]){
    const control=quantum===.5?atHalf:atOne
    let first=null
    for(const cadence of reportCadences){
     const wrap=stepRun(roster,geometry,g,v,{quantum,reportCadence:cadence})
     const result=compare(control,wrap)
     assert.deepEqual(wrap.source,control.source,
      'A42 physics changes when only the requested report cadence changes')
     if(first)assert.deepEqual(wrap.source,first.source,
      'A42 cadence variants do not share actual physical path')
     else first=wrap
     wrapperMatches.push({road:g.id,n,v,quantum,reportCadence:cadence,...result,
      riderSubsteps:wrap.riderSubsteps})
    }
   }
   assert.deepEqual(roster,frozen,'A42 simulation mutated source riders')
  }catch(e){
   const error={road:g.id,n,v,message:String(e.stack??e)}
   problems.push(error);console.error(JSON.stringify(error))
  }
 }
}
assert.equal(problems.length,0,'A42 technical physical simulation failure')
assert.equal(results.length,200)
assert.equal(comparison.length,200)
assert.equal(wrapperMatches.length,240)
assert(wrapperMatches.every(x=>x.maxPositionM===0&&x.maxGapM===0&&
 x.maxLateralM===0&&x.maxWPrimeJ===0&&x.inversions===0),
 'A42 nonzero reporting-only physical delta')
const summary=physicalQuanta.map(quantum=>{
 const cases=comparison.filter(x=>x.quantum===quantum)
 const max=f=>Math.max(...cases.map(f))
 const sum=f=>cases.reduce((s,x)=>s+f(x),0)
 return {quantumSeconds:quantum,cases:cases.length,reference:'0.5s physical microstep',
  maxPositionDifferenceM:r6(max(x=>x.maxPositionM)),
  maxGapDifferenceM:r6(max(x=>x.maxGapM)),
  maxWPrimeDifferenceJ:r6(max(x=>x.maxWPrimeJ)),
  pairInversions:sum(x=>x.inversions),
  changedOrderingCases:sum(x=>x.inversions>0?1:0),
  nearStopRiderTicks:sum(x=>x.nearStopTicks),
  riderSubsteps:sum(x=>x.riderSubsteps),
  collisionProposals:sum(x=>x.collisionProposals),
  conflictPairChecks:sum(x=>x.conflictPairChecks),
  physicallyAuditedPairs:sum(x=>x.observedPairs)}
})
const a1=comparison.filter(x=>x.quantum===1)
const nonconverged=a1.some(x=>x.maxPositionM>1||x.inversions>0)
const report={study:'A2_STEP42_FIXED_PHYSICAL_QUANTUM',technicalGate:'PASS',
 reportingCadenceGate:'PASS_BY_CONSTRUCTION',
 quantumConvergenceGate:nonconverged?'NOT_DEMONSTRATED':'FURTHER_RESEARCH_REQUIRED',
 sportingGate:'NO_GO',
 nativeCases:200,wrapperCases:240,totalTechnicalRuns:440,
 reportingOnlyComparisons:240,physicalQuantumsSeconds:physicalQuanta,
 requestedReportCadencesSeconds:reportCadences,
 summary,nativeFixtureComparisons:comparison,reportingFixtureComparisons:wrapperMatches,
 officialWrites:0,sportingApproval:'NOT_APPROVED',problems}
const dir=process.env.V3_A2_STEP42_DIR??'/tmp/a2-step42'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step42-fixed-physical-quantum.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 reportingCadenceGate:report.reportingCadenceGate,
 quantumConvergenceGate:report.quantumConvergenceGate,
 sportingGate:report.sportingGate,nativeCases:report.nativeCases,
 wrapperCases:report.wrapperCases,totalTechnicalRuns:report.totalTechnicalRuns,
 reportingOnlyComparisons:report.reportingOnlyComparisons,summary,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
