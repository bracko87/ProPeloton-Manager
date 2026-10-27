/** A2 Step35 OFFLINE sensitivity audit: same deterministic rider commands at
 * 2.0, 2.5, 5.0s physics substeps; no production results or status changes.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as begin,advanceSubstepPhysicalResearchV3 as advance} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const fields=[2,8,12,24,32],substeps=[5,4,2],ticks=6,variations=[0,1,2]
const grade=[-3,0,2],round=v=>Math.round(v*1e6)/1e6
const results=[],comparisons=[],failures=[]
const ident=(road,n,v)=>road+'|'+n+'|'+v
const riders=(n,g,v)=>Array.from({length:n},(_,i)=>({riderId:'r'+String(i).padStart(3,'0'),
 meters:100+i*6.4+v*2,y:(i%g.laneCount)*g.centerStepM,speedMps:4+i%4,
 cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
// The command is a function ONLY of original rider ID, game tick and variation.
// Different step schedules never see or inherit another run's observations.
function commands(ids,tick,v,g){
 return ids.map(id=>{
  const i=Number(id.slice(1)),lane=i%g.laneCount
  const offset=tick%3===1&&(i+v)%4===0?-1:tick%3===2&&(i+v)%5===0?1:0
  return {riderId:id,targetSpeedMps:4.5+(i+tick+v)%6,
   targetY:Math.min((g.laneCount-1)*g.centerStepM,round(Math.max(0,lane+offset)*g.centerStepM)),
   steeringWatts:35}
 })
}
function compute(input,geometry,n,v,numSubsteps){
 const g=validateRoadScenarioV3(geometry)
 const config={riders:input,geometry,road:{gradePercent:grade[v]},tickSeconds:10,substeps:numSubsteps}
 const start=begin(config),reverse=begin({...config,riders:input.slice().reverse()})
 const cmds=s=>commands(s.riders.map(r=>r.riderId),s.tick,v,g)
 const orderedFirst=advance(start,cmds(start)),reversedFirst=advance(reverse,cmds(reverse).reverse())
 assert.deepEqual(orderedFirst,reversedFirst,'Input order changed A35 physics or energy')
 let state=start,mid=null,nearStoppedRiderTicks=0,observedPairs=0
 for(let tick=0;tick<ticks;tick++){
  const before=new Map(state.riders.map(r=>[r.riderId,r.meters]))
  const requested=cmds(state),frozen=structuredClone(requested)
  state=advance(state,requested)
  assert.deepEqual(requested,frozen,'A35 changed original rider commands')
  assert.equal(state.elapsedSeconds,(tick+1)*10)
  assert.equal(state.metrics.remainingPiecewiseOverlaps,0)
  const independent=auditObservedTrackSetV3(state.lastTickTracks,geometry)
  assert.equal(independent.metrics.piecewiseCollisions,0,'Accepted A35 swept collision')
  observedPairs+=independent.metrics.pairs
  nearStoppedRiderTicks+=state.riders.filter(r=>r.meters-before.get(r.riderId)<.5).length
  if(tick===2)mid=JSON.parse(JSON.stringify(state))
 }
 let replay=mid
 for(let tick=3;tick<ticks;tick++)replay=advance(replay,cmds(replay))
 assert.deepEqual(replay,state,'A35 checkpoint replay mismatch')
 assert.equal(state.officialWrites,0);assert.equal(state.sportingApproval,'NOT_APPROVED')
 assert.equal(state.tick,ticks);assert.equal(state.metrics.riderSubsteps,n*ticks*numSubsteps)
 assert.equal(observedPairs,ticks*n*(n-1)/2);assert.equal(state.metrics.observedPairs,observedPairs)
 assert(state.riders.every(r=>r.energy.seconds===60&&Number.isFinite(r.energy.remainingWPrimeJoules)&&r.energy.remainingWPrimeJoules>=0))
 assert(Math.abs(state.metrics.mechanicalJoules-state.riders.reduce((sum,r)=>sum+r.energy.cumulativeMechanicalJoules,0))<1e-5,'A35 inconsistent joule ledger')
 const front=Math.max(...state.riders.map(r=>r.meters))
 return {key:ident(g.id,n,v),road:g.id,field:n,variation:v,
  substepSeconds:10/numSubsteps,numSubsteps,nearStoppedRiderTicks,observedPairs,ticks,
  riders:state.riders.map(r=>({id:r.riderId,meters:r.meters,y:r.y,wPrime:r.energy.remainingWPrimeJoules,
   mechanical:r.energy.cumulativeMechanicalJoules,gapToFront:round(front-r.meters)})),
  finalMechanicalJ:state.metrics.mechanicalJoules,
  finalWPrimeJ:state.riders.reduce((s,r)=>s+r.energy.remainingWPrimeJoules,0),
  collisionProposals:state.metrics.collisionProposals,
  attenuatedRiderSubsteps:state.metrics.attenuatedRiderSubsteps,
  attenuationRate:state.metrics.attenuatedRiderSubsteps/state.metrics.riderSubsteps,
  attenuationRiderSeconds:state.metrics.attenuatedRiderSubsteps*(10/numSubsteps),
  riderSubsteps:state.metrics.riderSubsteps,checkpointExact:true,nonconsentingCommandsUnchanged:true}
}
function compare(a,b){
 assert.equal(a.key,b.key)
 const other=new Map(b.riders.map(r=>[r.id,r]))
 const pos=[],gap=[],wp=[],power=[]
 for(const r of a.riders){const q=other.get(r.id);assert(q,'Unmatched rider ID')
  pos.push(Math.abs(r.meters-q.meters));gap.push(Math.abs(r.gapToFront-q.gapToFront))
  wp.push(Math.abs(r.wPrime-q.wPrime));power.push(Math.abs(r.mechanical-q.mechanical))
 }
 let inversions=0,ties=0
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const u=a.riders[i],v=a.riders[j],w=other.get(u.id),z=other.get(v.id)
  const d=u.meters-v.meters,e=w.meters-z.meters
  if(Math.abs(d)<1e-6||Math.abs(e)<1e-6){ties++;continue}
  if(d*e<0)inversions++
 }
 const mean=x=>x.reduce((s,y)=>s+y,0)/x.length
 return {key:a.key,field:a.field,road:a.road,variation:a.variation,referenceSeconds:a.substepSeconds,
  comparedSeconds:b.substepSeconds,meanPositionDifferenceM:round(mean(pos)),
  maxPositionDifferenceM:round(Math.max(...pos)),maxGapToFrontDifferenceM:round(Math.max(...gap)),
  maxWPrimeDifferenceJ:round(Math.max(...wp)),maxMechanicalEnergyDifferenceJ:round(Math.max(...power)),
  rankingInversions:inversions,rankingTies:ties,rankedPairs:a.field*(a.field-1)/2,
  attenuationRateDifference:round(b.attenuationRate-a.attenuationRate),
  nearStoppedRiderTicksDifference:b.nearStoppedRiderTicks-a.nearStoppedRiderTicks}
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of fields)for(const variation of variations){
  const input=riders(n,g,variation),unchanged=structuredClone(input)
  try{
   const out=substeps.map(ss=>compute(input,geometry,n,variation,ss))
   assert.deepEqual(input,unchanged,'A35 mutated initial physical state')
   results.push(...out)
   comparisons.push(compare(out[0],out[1]),compare(out[0],out[2]))
  }catch(e){failures.push({road:g.id,n,variation,reason:String(e.stack??e)});console.error(JSON.stringify(failures.at(-1)))}
 }
}
assert.equal(failures.length,0,'A35 technical simulation failed')
assert.equal(results.length,180);assert.equal(comparisons.length,120)
const summary={}
for(const r of results){
 const k=String(r.substepSeconds),x=summary[k]??{seconds:r.substepSeconds,cases:0,
  riderSubsteps:0,attenuatedRiderSubsteps:0,attenuatedRiderSeconds:0,
  nearStoppedRiderTicks:0,collisionProposals:0,observedPairs:0,mechanicalJoules:0,remainingWPrimeJoules:0}
 x.cases++;x.riderSubsteps+=r.riderSubsteps;x.attenuatedRiderSubsteps+=r.attenuatedRiderSubsteps
 x.attenuatedRiderSeconds+=r.attenuationRiderSeconds;x.nearStoppedRiderTicks+=r.nearStoppedRiderTicks
 x.collisionProposals+=r.collisionProposals;x.observedPairs+=r.observedPairs
 x.mechanicalJoules+=r.finalMechanicalJ;x.remainingWPrimeJoules+=r.finalWPrimeJ
 summary[k]=x
}
for(const v of Object.values(summary)){
 v.attenuationFraction=round(v.attenuatedRiderSubsteps/v.riderSubsteps)
 v.attenuatedRiderSeconds=round(v.attenuatedRiderSeconds)
 v.mechanicalJoules=round(v.mechanicalJoules);v.remainingWPrimeJoules=round(v.remainingWPrimeJoules)
}
const differences={}
for(const v of comparisons){
 const k=String(v.comparedSeconds),x=differences[k]??{referenceSeconds:2,comparedSeconds:v.comparedSeconds,
  cases:0,changedOrderingCases:0,totalPairInversions:0,maxPositionDifferenceM:0,
  maxGapToFrontDifferenceM:0,maxWPrimeDifferenceJ:0,maxMechanicalEnergyDifferenceJ:0,
  casesWithMoreThan1mDifference:0,casesWithMoreThan5mDifference:0,
  positiveNearStopDifference:0,negativeNearStopDifference:0}
 x.cases++;x.changedOrderingCases+=Number(v.rankingInversions>0);x.totalPairInversions+=v.rankingInversions
 x.maxPositionDifferenceM=Math.max(x.maxPositionDifferenceM,v.maxPositionDifferenceM)
 x.maxGapToFrontDifferenceM=Math.max(x.maxGapToFrontDifferenceM,v.maxGapToFrontDifferenceM)
 x.maxWPrimeDifferenceJ=Math.max(x.maxWPrimeDifferenceJ,v.maxWPrimeDifferenceJ)
 x.maxMechanicalEnergyDifferenceJ=Math.max(x.maxMechanicalEnergyDifferenceJ,v.maxMechanicalEnergyDifferenceJ)
 x.casesWithMoreThan1mDifference+=Number(v.maxPositionDifferenceM>1)
 x.casesWithMoreThan5mDifference+=Number(v.maxPositionDifferenceM>5)
 x.positiveNearStopDifference+=Math.max(0,v.nearStoppedRiderTicksDifference)
 x.negativeNearStopDifference+=Math.min(0,v.nearStoppedRiderTicksDifference)
 differences[k]=x
}
const numericalGate=Object.values(differences).every(x=>
 x.maxPositionDifferenceM<=1&&x.changedOrderingCases===0&&x.maxWPrimeDifferenceJ<=200)?'EXPLORATORY_PASS':'NO_GO'
const report={study:'A2_STEP35_TIME_STEP_SENSITIVITY',technicalGate:'PASS',numericalGate,
 provisionalNumericalTolerance:{positionM:1,orderingInversions:0,wPrimeJ:200},
 syntheticOnly:true,referenceSeconds:2,comparedSeconds:[2.5,5],
 fieldSizes:fields,roadGeometries:BATCH40_GEOMETRIES.length,
 simulationCases:results.length,pairedComparisons:comparisons.length,
 timeSecondsPerCase:60,sameCommandsAcrossTimesteps:true,
 summary,differences,comparisons,results,failures,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP35_DIR??'/tmp/a2-step35'
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/a2-step35-sensitivity.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,numericalGate,
 simulationCases:report.simulationCases,pairedComparisons:report.pairedComparisons,
 summary,differences,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
