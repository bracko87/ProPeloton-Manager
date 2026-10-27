import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {firstSweptContactFractionV3 as first,resolveEventTimeYieldV3 as yieldPolicy} from './a2EventTimeYieldResearchV3.mjs'
import {initializeSubstepPhysicalResearchV3 as begin,advanceSubstepPhysicalResearchV3 as advance} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const family=process.env.V3_A2_STEP37_FAMILY??'following'
assert(['following','hold','merge'].includes(family))
const round=x=>Math.round(x*1e6)/1e6
const policies=['symmetric_halving','event_time_yield'],steps=[5,4,2],counts=[2,8,12,24,32],variations=[0,1]
const one={x0:100,x1:130,y0:0,y1:0},two={x0:110,x1:120,y0:0,y1:0}
assert(Math.abs(first(one,two)-.41)<1e-8)
assert.equal(first(one,{...two,y0:2,y1:2}),null)
assert.equal(continuousBicycleCollisionV3(one,two),true)
const g0=validateRoadScenarioV3(BATCH40_GEOMETRIES[1])
const pair=yieldPolicy([
 {riderId:'rear',original:{meters:100,y:0},forward:30,y:0},
 {riderId:'front',original:{meters:110,y:0},forward:10,y:0}],g0)
assert(pair.yieldSelections>0,'A37 unilateral following slot not exercised')
assert.equal(pair.fallbacks,0,'A37 simple following should not require symmetric fallback')
assert.equal(pair.scales.get('front'),1,'A37 reduced leading bike despite safe follower slot')
assert.equal(pair.officialWrites,0);assert.equal(pair.sportingApproval,'NOT_APPROVED')
for(let i=0;i<pair.paths.length;i++)for(let j=i+1;j<pair.paths.length;j++)
 assert.equal(continuousBicycleCollisionV3(pair.paths[i],pair.paths[j],{longitudinal:1.8,lateral:g0.lateralCollisionM}),false)
function entrants(n,g,v){
 return Array.from({length:n},(_,i)=>({riderId:'r'+String(i).padStart(3,'0'),
  meters:100+i*6.4+v*2,y:family==='following'?0:(i%g.laneCount)*g.centerStepM,
  speedMps:4+i%4,cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
}
function commands(state,v,g){
 return state.riders.map(r=>{
  const i=Number(r.riderId.slice(1)),lane=family==='following'?0:i%g.laneCount
  const adjust=family!=='merge'?0:state.tick%3===1&&(i+v)%4===0?-1:state.tick%3===2&&(i+v)%5===0?1:0
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+state.tick+v)%6,
   targetY:Math.min((g.laneCount-1)*g.centerStepM,round(Math.max(0,Math.min(g.laneCount-1,lane+adjust))*g.centerStepM)),
   steeringWatts:35}
 })
}
function doRun(original,geometry,g,v,policy,numSubsteps){
 const opts={riders:original,geometry,road:{gradePercent:[-3,0][v]},tickSeconds:10,substeps:numSubsteps,conflictPolicy:policy}
 const started=begin(opts)
 let state=started,checkpt=null,nearStops=0
 for(let tick=0;tick<6;tick++){
  const previous=new Map(state.riders.map(x=>[x.riderId,x.meters]))
  const cmd=commands(state,v,g),before=structuredClone(cmd)
  state=advance(state,cmd)
  assert.deepEqual(cmd,before,'Policy mutated commands')
  assert.equal(auditObservedTrackSetV3(state.lastTickTracks,geometry).metrics.piecewiseCollisions,0)
  nearStops+=state.riders.filter(r=>r.meters-previous.get(r.riderId)<.5).length
  if(tick===2)checkpt=JSON.parse(JSON.stringify(state))
 }
 let resume=checkpt
 for(let tick=3;tick<6;tick++)resume=advance(resume,commands(resume,v,g))
 assert.deepEqual(resume,state,'Restart state mismatch')
 assert.equal(state.officialWrites,0);assert.equal(state.sportingApproval,'NOT_APPROVED')
 assert.equal(state.metrics.remainingPiecewiseOverlaps,0)
 assert.equal(state.metrics.riderSubsteps,original.length*6*numSubsteps)
 assert(state.riders.every(r=>r.energy.seconds===60&&r.energy.remainingWPrimeJoules>=0))
 assert(Math.abs(state.metrics.mechanicalJoules-state.riders.reduce((s,r)=>s+r.energy.cumulativeMechanicalJoules,0))<1e-5)
 const ahead=Math.max(...state.riders.map(r=>r.meters))
 return {family,geometry:g.id,field:original.length,variation:v,policy,seconds:10/numSubsteps,
  nearStops,collisionProposals:state.metrics.collisionProposals,attenuated:state.metrics.attenuatedRiderSubsteps,
  riderSubsteps:state.metrics.riderSubsteps,contactSamples:state.metrics.contactSamples,
  contactTimeSumSeconds:state.metrics.contactFractionSum*(10/numSubsteps),
  yieldSelections:state.metrics.yieldSelections,fallBacks:state.metrics.symmetricFallbacks,
  energyJ:state.metrics.mechanicalJoules,
  riders:state.riders.map(r=>({id:r.riderId,x:r.meters,y:r.y,gap:ahead-r.meters,
    wPrime:r.energy.remainingWPrimeJoules,energy:r.energy.cumulativeMechanicalJoules}))}
}
function difference(a,b){
 assert.equal(a.riders.length,b.riders.length)
 const lookup=new Map(b.riders.map(r=>[r.id,r]))
 const max=f=>Math.max(...a.riders.map(r=>f(r,lookup.get(r.id))))
 let flips=0
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const r=a.riders[i],s=a.riders[j],u=lookup.get(r.id),v=lookup.get(s.id)
  const d=r.x-s.x,e=u.x-v.x
  if(Math.abs(d)>=1e-6&&Math.abs(e)>=1e-6&&d*e<0)flips++
 }
 return {maxPos:round(max((u,v)=>Math.abs(u.x-v.x))),
  maxGap:round(max((u,v)=>Math.abs(u.gap-v.gap))),
  maxWPrime:round(max((u,v)=>Math.abs(u.wPrime-v.wPrime))),
  pairInversions:flips}
}
const trials=[],comparisons=[],failures=[]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry)
 for(const n of counts)for(const v of variations){
  const source=entrants(n,g,v),unaltered=structuredClone(source)
  try{
   const all=policies.map(policy=>steps.map(substeps=>doRun(source,geometry,g,v,policy,substeps)))
   assert.deepEqual(source,unaltered)
   trials.push(...all.flat())
   for(let p=0;p<policies.length;p++)for(let i=1;i<steps.length;i++){
    comparisons.push({geometry:g.id,field:n,variation:v,policy:policies[p],against:10/steps[i],...difference(all[p][0],all[p][i])})
   }
   for(let i=0;i<steps.length;i++)comparisons.push({geometry:g.id,field:n,variation:v,
    policy:'event_vs_control',against:10/steps[i],...difference(all[0][i],all[1][i])})
  }catch(e){failures.push({geometry:g.id,n,v,family,reason:String(e.stack??e)});console.error(JSON.stringify(failures.at(-1)))}
 }
}
assert.equal(failures.length,0,'A37 physical test failed')
assert.equal(trials.length,240);assert.equal(comparisons.length,280)
const summaries=[]
for(const policy of policies)for(const seconds of [2,2.5,5]){
 const sub=trials.filter(r=>r.policy===policy&&r.seconds===seconds)
 const cmp=comparisons.filter(r=>r.policy===policy&&r.against===seconds)
 const sum=k=>sub.reduce((s,r)=>s+r[k],0)
 const sumcmp=k=>cmp.reduce((s,r)=>s+r[k],0)
 const maxcmp=k=>cmp.length?Math.max(...cmp.map(r=>r[k])):0
 summaries.push({family,policy,seconds,technicalCases:sub.length,
  collisionProposals:sum('collisionProposals'),attenuated:sum('attenuated'),riderSubsteps:sum('riderSubsteps'),
  attenuationFraction:round(sum('attenuated')/sum('riderSubsteps')),
  nearStops:sum('nearStops'),yields:sum('yieldSelections'),fallBacks:sum('fallBacks'),
  contactSamples:sum('contactSamples'),contactTimeSumSeconds:round(sum('contactTimeSumSeconds')),
  changedOrderCases:cmp.filter(r=>r.pairInversions>0).length,
  totalPairInversions:sumcmp('pairInversions'),maximumPositionDeltaM:maxcmp('maxPos'),
  maximumWPrimeDeltaJ:maxcmp('maxWPrime'),maximumGapDeltaM:maxcmp('maxGap')})
}
const report={study:'A2_STEP37_BOUNDED_EVENT_TIME_YIELD',family,technicalGate:'PASS',
 sportingApproval:'NOT_APPROVED',officialWrites:0,technicalCases:trials.length,
 referenceComparisons:comparisons.length,summary:summaries,comparisons,trials,failures,
 approvalDecision:'NO_GO_PENDING_MEASURED_SPORTING_CONVERGENCE'}
const dir=process.env.V3_A2_STEP37_DIR??'/tmp/a2-step37'
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/a2-step37-'+family+'.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,family,technicalGate:report.technicalGate,
 technicalCases:trials.length,referenceComparisons:comparisons.length,summary:summaries,
 approvalDecision:report.approvalDecision,officialWrites:0}))
