/** A43 OFFLINE: locate 0.5s / 1s first difference and classify collisions
 * against identical free-road (all conflicts impossible) motion controls.
 * No candidate is approved merely for matching a small timestep.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as start,advanceSubstepPhysicalResearchV3 as move} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const sizes=[2,8,12,24,32],variants=[0,1],quanta=[.5,1],policies=['symmetric_halving','symmetric_trapezoid_motion']
const r6=x=>Math.round(x*1e6)/1e6
const players=(n,g,v,{free=false}={})=>Array.from({length:n},(_,i)=>({
 riderId:'r'+String(i).padStart(3,'0'),
 meters:100+i*(free?2000:6.4)+v*2,y:(i%g.laneCount)*g.centerStepM,
 speedMps:4+i%4,cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
function choices(s,g,v){
 const maxY=(g.laneCount-1)*g.centerStepM
 return s.riders.map(r=>{
  const i=Number(r.riderId.slice(1)),lane=i%g.laneCount
  const offset=s.tick%3===1&&(i+v)%4===0?-1:
   s.tick%3===2&&(i+v)%5===0?1:0
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+s.tick+v)%6,
   targetY:Math.min(maxY,r6(Math.max(0,Math.min(g.laneCount-1,lane+offset))*g.centerStepM)),
   steeringWatts:35}
 })
}
function run(roster,geom,g,v,quantum,policy){
 let s=start({riders:roster,geometry:geom,road:{gradePercent:[-3,0][v]},
  substeps:10/quantum,diagnosticTrace:true,conflictPolicy:policy})
 let checkpoint=null,firstTick=null,previewCount=0,attenuationCount=0
 for(let tick=0;tick<6;tick++){
  const c=choices(s,g,v),frozen=structuredClone(c)
  s=move(s,c)
  assert.deepEqual(c,frozen,'A43 command mutation')
  assert.equal(auditObservedTrackSetV3(s.lastTickTracks,geom).metrics.piecewiseCollisions,0)
  assert.equal(s.metrics.remainingPiecewiseOverlaps,0)
  const events=s.lastTickConflictTrace.filter(x=>x.kind==='physical_substep')
  assert.equal(events.length,10/quantum)
  previewCount+=events.reduce((sum,e)=>sum+e.previewConflictCount,0)
  attenuationCount+=events.reduce((sum,e)=>sum+e.attenuatedRiders.length,0)
  if(tick===0)firstTick={events:structuredClone(events),
    tracks:structuredClone(s.lastTickTracks),
    initial:roster.map(r=>({riderId:r.riderId,x:r.meters,y:r.y,v:r.speedMps}))}
  if(tick===2)checkpoint=JSON.parse(JSON.stringify(s))
 }
 let replay=checkpoint
 for(let tick=3;tick<6;tick++)replay=move(replay,choices(replay,g,v))
 assert.deepEqual(replay,s,'A43 checkpoint replay not exact')
 assert.equal(s.elapsedSeconds,60);assert.equal(s.officialWrites,0);assert.equal(s.sportingApproval,'NOT_APPROVED')
 assert.equal(s.metrics.riderSubsteps,roster.length*6*10/quantum)
 assert(s.riders.every(x=>x.energy.seconds===60&&
  Number.isFinite(x.energy.remainingWPrimeJoules)&&x.energy.remainingWPrimeJoules>=0))
 assert(Math.abs(s.metrics.mechanicalJoules-s.riders.reduce((sum,x)=>
  sum+x.energy.cumulativeMechanicalJoules,0))<1e-5)
 assert.equal(s.metrics.attenuatedRiderSubsteps,attenuationCount,'A43 trace/physical slowdown mismatch')
 return {quantum,firstTick,previewCount,attenuationCount,
  riders:s.riders.map(x=>({id:x.riderId,x:x.meters,y:x.y,
   w:x.energy.remainingWPrimeJoules})),metrics:s.metrics}
}
function getRider(proposal,id){return proposal.proposals.find(x=>x.riderId===id)}
function firstDifference(a,b){
 const aRecords=new Map(a.firstTick.tracks.map(x=>[x.riderId,x.knots]))
 const bRecords=new Map(b.firstTick.tracks.map(x=>[x.riderId,x.knots]))
 const ta=a.firstTick.events,tb=b.firstTick.events
 let first=null
 const atOne=[]
 for(let second=1;second<=10;second++){
  const fineStep=second*2,coarseStep=second
  const fineEvents=ta.slice(fineStep-2,fineStep)
  const coarseEvent=tb[coarseStep-1]
  let largest={meters:0,lateral:0,riderId:null}
  for(const [id,track] of aRecords){
   const old=bRecords.get(id),f=track[fineStep],c=old[coarseStep]
   const dx=Math.abs(f.x-c.x),dy=Math.abs(f.y-c.y)
   if(dx>largest.meters||dy>largest.lateral)
    largest={meters:r6(dx),lateral:r6(dy),riderId:id}
  }
  atOne.push({second,maxXDeltaM:largest.meters,maxYDeltaM:largest.lateral,
   offender:largest.riderId,
   finePreviewPairCount:fineEvents.reduce((sum,e)=>sum+e.previewConflictCount,0),
   coarsePreviewPairCount:coarseEvent.previewConflictCount,
   fineAttenuations:fineEvents.reduce((sum,e)=>sum+e.attenuatedRiders.length,0),
   coarseAttenuations:coarseEvent.attenuatedRiders.length,
   finePairSet:[...new Set(fineEvents.flatMap(e=>e.previewConflictPairs.map(p=>p.join('~'))))].sort(),
   coarsePairSet:coarseEvent.previewConflictPairs.map(p=>p.join('~')).sort()})
  if(!first&&(largest.meters>1e-5||largest.lateral>1e-5)){
   const id=largest.riderId
   first={second,...largest,
    finePhysical:{start:second-1,end:second},
    finePreviewPairs:fineEvents.map(e=>({dt:e.dtSeconds,pairs:e.previewConflictPairs,
      attenuated:e.attenuatedRiders,own:getRider(e,id)})),
    coarsePhysical:{dt:coarseEvent.dtSeconds,pairs:coarseEvent.previewConflictPairs,
     attenuated:coarseEvent.attenuatedRiders,own:getRider(coarseEvent,id)}}
  }
 }
 return {first,atOne}
}
function outcome(a,b){
 const bv=new Map(b.riders.map(r=>[r.id,r]))
 let maxX=0,maxY=0,maxW=0,inversions=0
 for(const r of a.riders){
  const x=bv.get(r.id)
  maxX=Math.max(maxX,Math.abs(r.x-x.x))
  maxY=Math.max(maxY,Math.abs(r.y-x.y))
  maxW=Math.max(maxW,Math.abs(r.w-x.w))
 }
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const p=a.riders[i],q=a.riders[j],x=bv.get(p.id),y=bv.get(q.id)
  const before=p.x-q.x,after=x.x-y.x
  if(Math.abs(before)>1e-6&&Math.abs(after)>1e-6&&before*after<0)inversions++
 }
 return {maxX:r6(maxX),maxY:r6(maxY),maxW:r6(maxW),inversions}
}
const fixtures=[],errors=[]
for(const geom of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geom)
 for(const n of sizes)for(const v of variants){
  try{
   const testTypes=['congested','free_road']
   for(const kind of testTypes){
    const roster=players(n,g,v,{free:kind==='free_road'}),copy=structuredClone(roster)
    for(const policy of policies){
     const fine=run(roster,geom,g,v,.5,policy),coarse=run(roster,geom,g,v,1,policy)
    assert.deepEqual(roster,copy)
    if(kind==='free_road'){
     assert.equal(fine.previewCount,0,'Unexpected fine-grid free-road proposal overlap')
     assert.equal(coarse.previewCount,0,'Unexpected coarse-grid free-road proposal overlap')
     assert.equal(fine.attenuationCount,0,'Free-road fine run attenuated a rider')
     assert.equal(coarse.attenuationCount,0,'Free-road coarse run attenuated a rider')
    }
    const divergence=firstDifference(fine,coarse),result=outcome(fine,coarse)
    fixtures.push({road:g.id,n,v,kind,policy,...result,first:divergence.first,
     first10Seconds:divergence.atOne,
     finePreviewPairs:fine.previewCount,coarsePreviewPairs:coarse.previewCount,
     fineAttenuated:fine.attenuationCount,coarseAttenuated:coarse.attenuationCount})
    }
   }
  }catch(e){const err={road:g.id,n,v,error:String(e.stack??e)};errors.push(err);console.error(JSON.stringify(err))}
 }
}
assert.equal(errors.length,0,'A43 diagnostic technical fixture failed')
assert.equal(fixtures.length,160)
const kindSummary=policies.flatMap(policy=>['free_road','congested'].map(kind=>{
 const subset=fixtures.filter(x=>x.kind===kind&&x.policy===policy)
 const largest=key=>Math.max(...subset.map(x=>x[key]))
 const sum=key=>subset.reduce((s,x)=>s+x[key],0)
 return {kind,policy,cases:subset.length,
  firstDivergenceAt1s:subset.filter(x=>x.first?.second===1).length,
  noFirst10sDivergence:subset.filter(x=>x.first===null).length,
  maximumFinalPositionM:largest('maxX'),
  maximumFinalWPrimeJ:largest('maxW'),
  changedOrderingCases:subset.filter(x=>x.inversions>0).length,
  inversions:sum('inversions'),previewFinePairs:sum('finePreviewPairs'),
  previewCoarsePairs:sum('coarsePreviewPairs'),
  attenuatedFine:sum('fineAttenuated'),attenuatedCoarse:sum('coarseAttenuated'),
  firstSecondLargestXDeltaM:Math.max(...subset.map(x=>x.first10Seconds[0].maxXDeltaM))}
}))
const firstFree=fixtures.filter(x=>x.kind==='free_road'&&x.policy==='symmetric_halving')
assert(firstFree.every(x=>x.first?.second===1),'A43 baseline physical first divergence changed')
const freeBaseline=kindSummary.find(x=>x.kind==='free_road'&&x.policy==='symmetric_halving')
const freeCandidate=kindSummary.find(x=>x.kind==='free_road'&&x.policy==='symmetric_trapezoid_motion')
const congestedBaseline=kindSummary.find(x=>x.kind==='congested'&&x.policy==='symmetric_halving')
const congestedCandidate=kindSummary.find(x=>x.kind==='congested'&&x.policy==='symmetric_trapezoid_motion')
assert.equal(freeBaseline.firstSecondLargestXDeltaM,.212501,'A43 control no-interaction trace changed')
const firstSecondImproves=freeCandidate.firstSecondLargestXDeltaM<freeBaseline.firstSecondLargestXDeltaM
const finalFreeImproves=freeCandidate.maximumFinalPositionM<freeBaseline.maximumFinalPositionM
const rankDoesNotWorsen=congestedCandidate.inversions<=congestedBaseline.inversions
const finalCongestedImproves=congestedCandidate.maximumFinalPositionM<=congestedBaseline.maximumFinalPositionM
const report={study:'A2_STEP43_TRAPEZOID_MOTION_TRIAL',technicalGate:'PASS',
 gate:'RESEARCH_ONLY',fixtures:160,actualRuns:320,
  firstSecondImproves,finalFreeImproves,rankDoesNotWorsen,finalCongestedImproves,
  numericalGate:firstSecondImproves&&finalFreeImproves&&rankDoesNotWorsen&&finalCongestedImproves?
   'PROMISING_SYNTHETIC_ONLY':'NOT_ALL_GATES_PASSED',
 finding:'Isolates terminal-speed distance integration from collision-induced divergence',
 summary:kindSummary,caseResults:fixtures,errors,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP43_TRIAL_DIR??'/tmp/a2-step43-trial'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step43-trapezoid-candidate.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,fixtures:report.fixtures,
 actualRuns:report.actualRuns,summary:report.summary,numericalGate:report.numericalGate,firstSecondImproves,
 finalFreeImproves,rankDoesNotWorsen,finalCongestedImproves,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
