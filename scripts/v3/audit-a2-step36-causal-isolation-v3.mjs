/** A2 Step36: controlled cause-isolation of Step35 nonlinear numerical instability.
 * Five families separate free acceleration, free steering, same-lane traffic,
 * multi-lane following and observed multi-lane merges, with immutable commands.
 * OFFLINE RESEARCH. Absolutely no official race writes or game-clock operations.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as begin,advanceSubstepPhysicalResearchV3 as advance} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const familyNames=['free_straight','free_steering','same_lane_follow','mixed_lane_hold','mixed_lane_merge']
const fieldSizes=[2,8,12,24,32],variations=[0,1,2],stepCounts=[5,4,2],grades=[-3,0,2]
const r6=x=>Math.round(x*1e6)/1e6
const scenarioKey=(g,n,v)=>g.id+'|'+n+'|'+v
const records=[],paired=[],failures=[]
function startRiders(n,g,variation,family){
 const spread=family.startsWith('free_')?250:6.4
 return Array.from({length:n},(_,i)=>({riderId:'r'+String(i).padStart(3,'0'),
   meters:100+i*spread+variation*2,y:family==='same_lane_follow'?0:(i%g.laneCount)*g.centerStepM,
   speedMps:4+i%4,cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
}
function commandForIds(ids,tick,variation,g,family){
 return ids.map(id=>{
  const i=Number(id.slice(1)),lane=family==='same_lane_follow'?0:i%g.laneCount
  const wantsSteering=family==='free_steering'||family==='mixed_lane_merge'
  const offset=wantsSteering&&(tick%3===1&&(i+variation)%4===0)?-1:
   wantsSteering&&(tick%3===2&&(i+variation)%5===0)?1:0
  const dest=Math.max(0,Math.min(g.laneCount-1,lane+offset))
  return {riderId:id,targetSpeedMps:4.5+(i+tick+variation)%6,
   targetY:r6(dest*g.centerStepM),steeringWatts:35}
 })
}
function runCase(initial,geometry,g,variation,family,substeps){
 const config={riders:initial,geometry,road:{gradePercent:grades[variation]},substeps,tickSeconds:10}
 const start=begin(config)
 const commands=s=>commandForIds(s.riders.map(r=>r.riderId),s.tick,variation,g,family)
 let current=start,checkpoint=null,nearStops=0,independentPairChecks=0
 for(let t=0;t<6;t++){
  const before=new Map(current.riders.map(r=>[r.riderId,r.meters]))
  const raw=commands(current),frozen=structuredClone(raw)
  current=advance(current,raw)
  assert.deepEqual(raw,frozen,'A36 changed submitted commands')
  const physical=auditObservedTrackSetV3(current.lastTickTracks,geometry)
  assert.equal(physical.metrics.piecewiseCollisions,0,'Unsafe accepted A36 trajectory')
  assert.equal(physical.metrics.missedByChord,0,'Uncertified accepted path')
  independentPairChecks+=physical.metrics.pairs
  nearStops+=current.riders.filter(r=>r.meters-before.get(r.riderId)<.5).length
  if(t===2)checkpoint=JSON.parse(JSON.stringify(current))
 }
 let replay=checkpoint
 for(let t=3;t<6;t++)replay=advance(replay,commands(replay))
 assert.deepEqual(replay,current,'A36 physical/energy checkpoint diverged')
 assert.equal(current.officialWrites,0);assert.equal(current.sportingApproval,'NOT_APPROVED')
 assert.equal(current.elapsedSeconds,60);assert.equal(current.tick,6)
 assert.equal(current.metrics.remainingPiecewiseOverlaps,0)
 assert.equal(current.metrics.observedPairs,independentPairChecks)
 assert.equal(current.metrics.riderSubsteps,initial.length*6*substeps)
 assert(current.riders.every(r=>r.energy.seconds===60&&Number.isFinite(r.energy.remainingWPrimeJoules)&&r.energy.remainingWPrimeJoules>=0))
 assert(Math.abs(current.metrics.mechanicalJoules-current.riders.reduce((s,r)=>s+r.energy.cumulativeMechanicalJoules,0))<1e-5,
  'A36 mechanical ledger mismatch')
 const rank=current.riders.map(r=>r).sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
 const front=Math.max(...rank.map(r=>r.meters))
 return {family,field:initial.length,road:g.id,variation,key:scenarioKey(g,initial.length,variation),
  substepSeconds:10/substeps,technicalGate:'PASS',nearStopRiderTicks:nearStops,
  conflicts:current.metrics.collisionProposals,
  attenuationCount:current.metrics.attenuatedRiderSubsteps,
  riderSubsteps:current.metrics.riderSubsteps,
  attenuationFraction:current.metrics.attenuatedRiderSubsteps/current.metrics.riderSubsteps,
  attenuationRiderSeconds:current.metrics.attenuatedRiderSubsteps*(10/substeps),
  totalMechanicalJ:current.metrics.mechanicalJoules,
  totalRemainingWPrimeJ:current.riders.reduce((s,r)=>s+r.energy.remainingWPrimeJoules,0),
  positions:rank.map(r=>({riderId:r.riderId,meters:r.meters,gapToFront:front-r.meters,
   y:r.y,wPrimeJ:r.energy.remainingWPrimeJoules,mechanicalJ:r.energy.cumulativeMechanicalJoules})),
  finalRankIds:rank.map(r=>r.riderId),replayExact:true,officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
function compare(a,b){
 assert.equal(a.family,b.family);assert.equal(a.key,b.key)
 const bmap=new Map(b.positions.map(r=>[r.riderId,r]))
 const max=(fn)=>Math.max(...a.positions.map(r=>fn(r,bmap.get(r.riderId))))
 let flips=0
 for(let i=0;i<a.positions.length;i++)for(let j=i+1;j<a.positions.length;j++){
  const u=a.positions[i],v=a.positions[j],w=bmap.get(u.riderId),z=bmap.get(v.riderId)
  const d=u.meters-v.meters,e=w.meters-z.meters
  if(Math.abs(d)>=1e-6&&Math.abs(e)>=1e-6&&d*e<0)flips++
 }
 return {family:a.family,key:a.key,field:a.field,road:a.road,variation:a.variation,
  referenceSeconds:a.substepSeconds,comparedSeconds:b.substepSeconds,
  rankingInversions:flips,changedOrdering:flips>0,
  maximumPositionDifferenceM:r6(max((r,q)=>Math.abs(r.meters-q.meters))),
  maximumGapDifferenceM:r6(max((r,q)=>Math.abs(r.gapToFront-q.gapToFront))),
  maximumWPrimeDifferenceJ:r6(max((r,q)=>Math.abs(r.wPrimeJ-q.wPrimeJ))),
  maximumMechanicalDifferenceJ:r6(max((r,q)=>Math.abs(r.mechanicalJ-q.mechanicalJ))),
  attenuationRateReference:r6(a.attenuationFraction),
  attenuationRateComparison:r6(b.attenuationFraction)}
}
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of fieldSizes)for(const variation of variations){
  for(const family of familyNames){
   try{
    const initial=startRiders(n,g,variation,family),frozen=structuredClone(initial)
    const ss=stepCounts.map(k=>runCase(initial,geometry,g,variation,family,k))
    assert.deepEqual(initial,frozen,'A36 source riders mutated')
    if(family.startsWith('free_')){
     for(const result of ss){
      assert.equal(result.conflicts,0,'A36 free movement unexpectedly congested')
      assert.equal(result.attenuationCount,0,'A36 no-conflict motion was attenuated')
     }
    }
    records.push(...ss)
    paired.push(compare(ss[0],ss[1]),compare(ss[0],ss[2]))
   }catch(e){const detail={geometry:g.id,n,variation,family,reason:String(e.stack??e)};failures.push(detail);console.error(JSON.stringify(detail))}
  }
 }
}
assert.equal(failures.length,0,'A36 controlled causal isolation technical failures')
assert.equal(records.length,900);assert.equal(paired.length,600)
const summary=[]
for(const family of familyNames)for(const step of [2,2.5,5]){
 const rr=records.filter(r=>r.family===family&&r.substepSeconds===step)
 const cp=paired.filter(x=>x.family===family&&x.comparedSeconds===step)
 const max=(f)=>cp.length?Math.max(...cp.map(f)):0
 const sum=(items,field)=>items.reduce((a,r)=>a+r[field],0)
 summary.push({family,stepSeconds:step,technicalCases:rr.length,
  rankingChangeCases:sum(cp,'changedOrdering'),rankingPairInversions:sum(cp,'rankingInversions'),
  maximumPositionDifferenceM:r6(max(r=>r.maximumPositionDifferenceM)),
  maximumGapDifferenceM:r6(max(r=>r.maximumGapDifferenceM)),
  maximumWPrimeDifferenceJ:r6(max(r=>r.maximumWPrimeDifferenceJ)),
  collisionsInRejectedProposals:sum(rr,'conflicts'),
  attenuatedRiderSubsteps:sum(rr,'attenuationCount'),
  riderSubsteps:sum(rr,'riderSubsteps'),
  attenuationFraction:r6(sum(rr,'attenuationCount')/sum(rr,'riderSubsteps')),
  nearStopRiderTicks:sum(rr,'nearStopRiderTicks'),
  totalMechanicalJ:r6(sum(rr,'totalMechanicalJ')),
  totalRemainingWPrimeJ:r6(sum(rr,'totalRemainingWPrimeJ'))})
}
// Reproduce the exact A35 2.5s mixed-merge baseline so it is known that
// this attribution audit did not silently alter the source problem.
const preserved=summary.find(x=>x.family==='mixed_lane_merge'&&x.stepSeconds===2.5)
assert.equal(preserved.attenuatedRiderSubsteps,10168,'A35 reference fixture changed')
assert.equal(preserved.collisionsInRejectedProposals,16421,'A35 conflict baseline changed')
const observed=summary.filter(x=>x.stepSeconds===2.5)
const control=Object.fromEntries(observed.map(x=>[x.family,x]))
const contrasts={
  freeSteeringMinusFreeStraightAttenuation:control.free_steering.attenuatedRiderSubsteps-control.free_straight.attenuatedRiderSubsteps,
  mixedMergeMinusMixedLaneHoldAttenuation:control.mixed_lane_merge.attenuatedRiderSubsteps-control.mixed_lane_hold.attenuatedRiderSubsteps,
  sameLaneFollowingMinusFreeStraightAttenuation:control.same_lane_follow.attenuatedRiderSubsteps-control.free_straight.attenuatedRiderSubsteps,
  freeSteeringMinusFreeStraightMechanicalJ:r6(control.free_steering.totalMechanicalJ-control.free_straight.totalMechanicalJ),
  mixedMergeMinusMixedLaneHoldMechanicalJ:r6(control.mixed_lane_merge.totalMechanicalJ-control.mixed_lane_hold.totalMechanicalJ)
}
const numericalGate='NO_GO' // A35 numerical validation remains failed; this diagnostic cannot grant approval.
const report={study:'A2_STEP36_CAUSAL_TIME_STEP_ISOLATION',technicalGate:'PASS',numericalGate,
  hypotheses:['no_conflict_acceleration_energy','no_conflict_steering',
   'same_lane_following_congestion','multi_lane_held','multi_lane_merge'],
  syntheticOnly:true,families:familyNames,fieldSizes,roadGeometries:4,
  variations:variations.length,sameCommandsAcrossTimesteps:true,
  substepSeconds:[2,2.5,5],simulatedSeconds:60,
  cases:records.length,comparisons:paired.length,summary,contrasts,
  results:records,paired,failures,officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP36_DIR??'/tmp/a2-step36'
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/a2-step36-causal.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:'PASS',numericalGate,cases:records.length,
 comparisons:paired.length,summary,contrasts,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
