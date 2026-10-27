/** Step38: observe (not change) A37 active merges, and symmetric fairness. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeSubstepPhysicalResearchV3 as begin,advanceSubstepPhysicalResearchV3 as advance} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const rd=x=>Math.round(x*1e6)/1e6
const nSet=[2,8,12,24,32],sizes=[5,4,2],variants=[0,1],failures=[],bySeconds={},examples=[],mirrors=[],renames=[],baselineRenames=[]
const entries=(n,g,v)=>Array.from({length:n},(_,i)=>({riderId:'r'+String(i).padStart(3,'0'),
 meters:100+i*6.4+v*2,y:(i%g.laneCount)*g.centerStepM,speedMps:4+i%4,cpWatts:210+(i%7)*18,wPrimeJoules:18000}))
function command(s,v,g,{mirror=false,names=null}={}){
 const maxY=(g.laneCount-1)*g.centerStepM
 return s.riders.map(r=>{
  const id=names?.get(r.riderId)??r.riderId,i=Number(id.slice(1)),lane=i%g.laneCount
  const off=s.tick%3===1&&(i+v)%4===0?-1:s.tick%3===2&&(i+v)%5===0?1:0
  const y=Math.min(maxY,rd(Math.max(0,Math.min(g.laneCount-1,lane+off))*g.centerStepM))
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+s.tick+v)%6,
   targetY:mirror?Math.max(0,Math.min(maxY,rd(maxY-y))):y,steeringWatts:35}
 })
}
function run(roster,geometry,g,v,k,{policy='event_time_yield',mirror=false,names=null,trace=true}={}){
 let s=begin({riders:roster,geometry,road:{gradePercent:[-3,0][v]},substeps:k,
  conflictPolicy:policy,diagnosticTrace:policy==='event_time_yield'&&trace})
 let snap=null,nearStops=0,events=[],coupled=0
 for(let tick=0;tick<6;tick++){
  const prev=new Map(s.riders.map(r=>[r.riderId,r.meters])),cmd=command(s,v,g,{mirror,names}),frozen=structuredClone(cmd)
  s=advance(s,cmd)
  assert.deepEqual(cmd,frozen,'Rider commands changed in Step38')
  assert.equal(auditObservedTrackSetV3(s.lastTickTracks,geometry).metrics.piecewiseCollisions,0)
  nearStops+=s.riders.filter(r=>r.meters-prev.get(r.riderId)<.5).length
  if(trace&&policy==='event_time_yield')for(const e of s.lastTickConflictTrace)events.push({tick,...e})
  if(tick===2)snap=JSON.parse(JSON.stringify(s))
 }
 let replay=snap
 for(let tick=3;tick<6;tick++)replay=advance(replay,command(replay,v,g,{mirror,names}))
 assert.deepEqual(replay,s,'Checkpoint replay mismatch')
 assert.equal(s.officialWrites,0);assert.equal(s.sportingApproval,'NOT_APPROVED')
 assert.equal(s.metrics.remainingPiecewiseOverlaps,0)
 assert(s.riders.every(r=>r.energy.remainingWPrimeJoules>=0&&r.energy.seconds===60))
 assert(Math.abs(s.metrics.mechanicalJoules-s.riders.reduce((sum,r)=>sum+r.energy.cumulativeMechanicalJoules,0))<1e-5)
 assert.equal(events.filter(e=>e.outcome==='unilateral').length,s.metrics.yieldSelections)
 assert.equal(events.filter(e=>e.outcome==='local_symmetric_fallback').length,s.metrics.symmetricFallbacks)
 assert.equal(events.filter(e=>e.outcome==='whole_substep_fallback').length,s.metrics.hardFallbacks)
 const maxX=Math.max(...s.riders.map(r=>r.meters))
 return {policy,road:g.id,n:s.riders.length,v,seconds:10/k,hard:s.metrics.hardFallbacks,
  local:s.metrics.symmetricFallbacks,yields:s.metrics.yieldSelections,
  boundary:s.metrics.contactBoundaryFallbacks,nearStops,
  events,riders:s.riders.map(r=>({id:names?.get(r.riderId)??r.riderId,
   x:r.meters,w:r.energy.remainingWPrimeJoules,gap:rd(maxX-r.meters)}))}
}
function difference(a,b){
 const map=new Map(b.riders.map(q=>[q.id,q]))
 const max=fn=>Math.max(...a.riders.map(q=>fn(q,map.get(q.id))))
 let inversions=0
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const x=a.riders[i],y=a.riders[j],u=map.get(x.id),v=map.get(y.id)
  if(Math.abs(x.x-y.x)>1e-6&&Math.abs(u.x-v.x)>1e-6&&(x.x-y.x)*(u.x-v.x)<0)inversions++
 }
 return {maxX:rd(max((a,b)=>Math.abs(a.x-b.x))),maxW:rd(max((a,b)=>Math.abs(a.w-b.w))),inversions}
}
function acc(b,record){
 b.cases++;b.hard+=record.hard;b.local+=record.local;b.unilateral+=record.yields;b.boundary+=record.boundary
 for(const x of record.events){
  if(x.outcome==='whole_substep_fallback')continue
  b.crossing[x.crossing]=(b.crossing[x.crossing]??0)+1
  b.rejectedRatios+=x.unsafeRatioTrials
  b.tiedFirstContactChoices+=Number(x.tiedFirstContactPairs>1)
  b.tiedFirstContactExtraPairs+=Math.max(0,x.tiedFirstContactPairs-1)
  b.contactFractions+=x.contactTimeFraction
  b.minGapM=Math.min(b.minGapM,x.startGapM)
  const key=[x.a,x.b].sort().join('~')
  b.pairCounts[key]=(b.pairCounts[key]??0)+1
  const dir=x.yieldingRiderId===x.a?x.signA:x.signB
  b.yieldDirection[dir>0?'right':dir<0?'left':'stationary']++
  if(x.startGapM<1e-8)b.tiePriorities++
 }
}
for(const geom of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geom),maxY=(g.laneCount-1)*g.centerStepM
 for(const n of nSet)for(const v of variants){
  const roster=entries(n,g,v),copy=structuredClone(roster)
  try{
   const original=sizes.map(k=>run(roster,geom,g,v,k,{policy:'symmetric_halving',trace:false}))
   const candidate=sizes.map(k=>run(roster,geom,g,v,k))
   assert.deepEqual(roster,copy)
   for(let i=0;i<sizes.length;i++){
    const rec=candidate[i],ref=original[i],key=String(rec.seconds)
    const b=bySeconds[key]??{seconds:rec.seconds,cases:0,hard:0,local:0,unilateral:0,boundary:0,rejectedRatios:0,tiedFirstContactChoices:0,tiedFirstContactExtraPairs:0,
      contactFractions:0,minGapM:Infinity,crossing:{},pairCounts:{},
      yieldDirection:{left:0,right:0,stationary:0},tiePriorities:0,
      baselineInversions:0,candidateInversions:0,baselineMaxM:0,candidateMaxM:0}
    acc(b,rec)
    if(i>0){
     const old=difference(original[0],ref),trial=difference(candidate[0],rec)
     b.baselineInversions+=old.inversions;b.candidateInversions+=trial.inversions
     b.baselineMaxM=Math.max(b.baselineMaxM,old.maxX)
     b.candidateMaxM=Math.max(b.candidateMaxM,trial.maxX)
    }
    bySeconds[key]=b
    if(rec.hard)examples.push({road:g.id,n,v,seconds:rec.seconds,hard:rec.hard,
      forcedEvents:rec.events.filter(e=>e.outcome==='whole_substep_fallback'),
      frequentPairs:Object.entries(rec.events.filter(e=>e.a).reduce((z,e)=>{
       const t=[e.a,e.b].sort().join('~');z[t]=(z[t]??0)+1;return z
      },{})).sort((a,b)=>b[1]-a[1]).slice(0,5)})
    if(i===1){
     const mirrored=roster.map(r=>({...r,y:Math.max(0,Math.min(maxY,rd(maxY-r.y)))}))
     const m=run(mirrored,geom,g,v,4,{mirror:true})
     mirrors.push({road:g.id,n,v,...difference(rec,m),hardDiff:m.hard-rec.hard})
     if(n>=8){
      const names=new Map(),renamed=roster.map((r,j)=>{
       const newId='z'+String(n-1-j).padStart(3,'0');names.set(newId,r.riderId);return {...r,riderId:newId}
      })
      const x=run(renamed,geom,g,v,4,{names})
      const b=run(renamed,geom,g,v,4,{names,policy:'symmetric_halving',trace:false})
      baselineRenames.push({road:g.id,n,v,...difference(original[i],b)})
      renames.push({road:g.id,n,v,...difference(rec,x),hardDiff:x.hard-rec.hard})
     }
    }
   }
  }catch(e){failures.push({road:g.id,n,v,error:String(e.stack??e)});console.error(JSON.stringify(failures.at(-1)))}
 }
}
assert.equal(failures.length,0)
assert.equal(Object.values(bySeconds).reduce((s,x)=>s+x.cases,0),120)
assert.equal(mirrors.length,40);assert.equal(renames.length,32);assert.equal(baselineRenames.length,32)
assert.equal(Object.values(bySeconds).reduce((s,x)=>s+x.hard,0),11,'A37 hard fallback reference changed')
assert.equal(bySeconds['2.5'].baselineInversions,626)
assert.equal(bySeconds['2.5'].candidateInversions,798)
const sections=Object.values(bySeconds).sort((a,b)=>a.seconds-b.seconds).map(q=>({...q,
  topPairs:Object.entries(q.pairCounts).sort((a,b)=>b[1]-a[1]).slice(0,8),pairCounts:undefined,
  averageContactFraction:q.unilateral+q.local?q.contactFractions/(q.unilateral+q.local):null,
  minGapM:Number.isFinite(q.minGapM)?q.minGapM:null}))
const report={study:'A2_STEP38_ACTIVE_MERGE_DIAGNOSTIC',technical:'PASS',sporting:'NO_GO',
 cases:120,mirrorCases:mirrors.length,renamedCases:renames.length,
 sections,hardFallbackCases:examples,mirrorTests:mirrors,renamedTests:renames,
 mirroredCasesWithPositionDifference:mirrors.filter(x=>x.maxX>1e-4).length,
 baselineRenamedCasesWithPositionDifference:baselineRenames.filter(x=>x.maxX>1e-4).length,
 renamedCasesWithPositionDifference:renames.filter(x=>x.maxX>1e-4).length,
 maxMirroredPositionDifference:Math.max(...mirrors.map(x=>x.maxX)),
 maxRenamedPositionDifference:Math.max(...renames.map(x=>x.maxX)),
 maxBaselineRenamedDifference:Math.max(...baselineRenames.map(x=>x.maxX)),
 baselineRenames,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP38_DIR??'/tmp/a2-step38'
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/a2-step38.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technical:report.technical,cases:report.cases,
 mirrorCases:report.mirrorCases,renamedCases:report.renamedCases,
 sections:report.sections,hardFallbackCases:report.hardFallbackCases,
 mirroredCasesWithPositionDifference:report.mirroredCasesWithPositionDifference,
 renamedCasesWithPositionDifference:report.renamedCasesWithPositionDifference,
 maxMirroredPositionDifference:report.maxMirroredPositionDifference,
 maxRenamedPositionDifference:report.maxRenamedPositionDifference,
 baselineRenamedCasesWithPositionDifference:report.baselineRenamedCasesWithPositionDifference,
 maxBaselineRenamedDifference:report.maxBaselineRenamedDifference,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
