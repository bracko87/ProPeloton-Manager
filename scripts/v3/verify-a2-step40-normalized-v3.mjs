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
const policies=['symmetric_halving','event_time_yield','event_time_fair','event_time_fair_normalized']
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
  conflictPolicy:policy,substeps,tickSeconds:10}
 let state=begin(setup),checkpoint=null,nearStopTicks=0
 for(let t=0;t<6;t++){
  const prior=new Map(state.riders.map(r=>[r.riderId,r.meters]))
  const intents=commands(state,v,g,opts),frozen=structuredClone(intents)
  state=advance(state,intents)
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
 return {policy,seconds:10/substeps,nearStopTicks,
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
const scenarioG=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const pair=[
 {riderId:'a',original:{meters:100,y:0},forward:10,y:0},
 {riderId:'b',original:{meters:106,y:0},forward:0,y:0},
 {riderId:'c',original:{meters:200,y:0},forward:10,y:0},
 {riderId:'d',original:{meters:206,y:0},forward:0,y:0}
]
const sample=resolveEventTimeYieldV3(pair,scenarioG,{tiePolicy:'physical_group'})
assert(sample.physicalTieGroups>0,'Simultaneous conflict group never exercised')
assert(sample.physicalTieParticipants>=4,'Both simultaneous pairs must participate')
const renamedPair=pair.map((p,i)=>({...p,riderId:['z','y','x','w'][i]}))
const sample2=resolveEventTimeYieldV3(renamedPair,scenarioG,{tiePolicy:'physical_group'})
assert(pair.every((p,i)=>sample.scales.get(p.riderId)===sample2.scales.get(renamedPair[i].riderId)),
 'Direct simultaneous tie depends on rider name')
const cases=[],mirrors=[],renames=[],failures=[]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry),maxY=(g.laneCount-1)*g.centerStepM
 for(const n of sizes)for(const v of variations){
  const start=starters(n,g,v),frozen=structuredClone(start)
  try{
   const rows=policies.map(policy=>grids.map(k=>run(start,geometry,g,v,policy,k)))
   assert.deepEqual(start,frozen,'Research input roster mutated')
   for(let p=0;p<policies.length;p++)for(let k=0;k<grids.length;k++){
    cases.push({road:g.id,n,v,policy:policies[p],seconds:10/grids[k],
     ...rows[p][k],versus2s:k?diff(rows[p][0],rows[p][k]):null})
   }
   const fair=rows[3]
   for(let k=0;k<grids.length;k++){
    const mirrored=start.map(r=>({...r,y:Math.max(0,Math.min(maxY,round(maxY-r.y)))}))
    const mirrorRun=run(mirrored,geometry,g,v,'event_time_fair_normalized',grids[k],{mirror:true})
    mirrors.push({road:g.id,n,v,seconds:10/grids[k],...diff(fair[k],mirrorRun)})
    if(n>=8){
     const names=new Map(),changed=start.map((r,i)=>{
      const id='z'+String(n-1-i).padStart(3,'0')
      names.set(id,r.riderId)
      return {...r,riderId:id}
     })
     const renameRun=run(changed,geometry,g,v,'event_time_fair_normalized',grids[k],{originalIds:names})
     renames.push({road:g.id,n,v,seconds:10/grids[k],...diff(fair[k],renameRun)})
    }
   }
  }catch(e){const failure={road:g.id,n,v,error:String(e.stack??e)}
   failures.push(failure);console.error(JSON.stringify(failure))}
 }
}
assert.equal(failures.length,0,'Physical research scenario failed technical checks')
assert.equal(cases.length,480);assert.equal(mirrors.length,120);assert.equal(renames.length,96)
const summary=[]
for(const policy of policies)for(const seconds of [2,2.5,5]){
 const matched=cases.filter(r=>r.policy===policy&&r.seconds===seconds)
 const deviations=matched.filter(r=>r.versus2s)
 summary.push({policy,seconds,caseCount:matched.length,
  maxPositionM:Math.max(0,...deviations.map(r=>r.versus2s.maxPositionM)),
  maxWPrimeJ:Math.max(0,...deviations.map(r=>r.versus2s.maxWPrimeJ)),
  inversions:deviations.reduce((s,r)=>s+r.versus2s.inversions,0),
  changedOrderingCases:deviations.filter(r=>r.versus2s.inversions>0).length,
  attenuated:matched.reduce((s,r)=>s+r.attenuation,0),
  nearStops:matched.reduce((s,r)=>s+r.nearStopTicks,0),
  hardFallbacks:matched.reduce((s,r)=>s+r.hardFallbacks,0),
  tieGroups:matched.reduce((s,r)=>s+r.tieGroups,0)})
}
const failRename=renames.filter(x=>x.maxPositionM>1e-5).length
const failMirror=mirrors.filter(x=>x.maxPositionM>1e-5).length
const control=summary.find(s=>s.policy==='symmetric_halving'&&s.seconds===2.5)
const experimental=summary.find(s=>s.policy==='event_time_fair_normalized'&&s.seconds===2.5)
const control5=summary.find(s=>s.policy==='symmetric_halving'&&s.seconds===5)
const experimental5=summary.find(s=>s.policy==='event_time_fair_normalized'&&s.seconds===5)
const better=[2.5,5].every(seconds=>{
 const c=summary.find(x=>x.policy==='symmetric_halving'&&x.seconds===seconds)
 const v=summary.find(x=>x.policy==='event_time_fair_normalized'&&x.seconds===seconds)
 return v.inversions<=c.inversions&&v.maxPositionM<=c.maxPositionM
})
assert.equal(control.inversions,626,'A39 original symmetric baseline changed')
assert.equal(summary.find(x=>x.policy==='event_time_fair'&&x.seconds===2.5).inversions,1164,
 'A39 unmodified experimental policy baseline changed')
const output={study:'A2_STEP40_MIRROR_NORMALIZED_CONTACT',technicalGate:'PASS',
 fairnessGate:failRename===0?'PASS':'FAIL',
 numericalGate:better?'IMPROVED_VS_SYMMETRIC_REFERENCE':'NOT_IMPROVED',
 approval:'NO_GO_PENDING_FULL_STAGE_SPORTING_GATE',
 syntheticOnly:true,cases:cases.length,mirrors:mirrors.length,renames:renames.length,
 failRename,failMirror,maxRenameM:Math.max(...renames.map(x=>x.maxPositionM)),
 maxMirrorM:Math.max(...mirrors.map(x=>x.maxPositionM)),
 summary,caseResults:cases,mirrorResults:mirrors,renameResults:renames,
 mirrorFailures:mirrors.filter(x=>x.maxPositionM>1e-5),
 fairnessOfMirrors:failMirror===0?'PASS':'FAIL',
 convergenceAgainstSymmetric:better?'IMPROVED':'NOT_IMPROVED',failures,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP40_DIR??'/tmp/a2-step40'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step40-normalized-results.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({study:output.study,technicalGate:output.technicalGate,
 fairnessGate:output.fairnessGate,mirrorGate:output.fairnessOfMirrors,numericalGate:output.numericalGate,
 approval:output.approval,cases:output.cases,mirrors:output.mirrors,renames:output.renames,
 failRename,failMirror,maxRenameM:output.maxRenameM,maxMirrorM:output.maxMirrorM,
 summary,mirrorFailures:output.mirrorFailures,officialWrites:0,sportingApproval:'NOT_APPROVED'}))
