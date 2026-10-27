/** Step41: left/right canonical geometry, independent fairness and sporting gates. */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {BATCH40_GEOMETRIES,validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {initializeCanonicalMirrorResearchV3 as beginCanonical,
 advanceCanonicalMirrorResearchV3 as advanceCanonical} from './a2CanonicalMirrorResearchV3.mjs'
import {initializeSubstepPhysicalResearchV3 as begin,
 advanceSubstepPhysicalResearchV3 as advance} from './a2SubstepPhysicalResearchV3.mjs'
import {auditObservedTrackSetV3} from './a2NonlinearSweepAuditV3.mjs'
const r6=x=>Math.round(x*1e6)/1e6
const fields=[2,8,12,24,32],variants=[0,1],stepCounts=[5,4,2]
const starters=(n,g,v)=>Array.from({length:n},(_,i)=>({
 riderId:'r'+String(i).padStart(3,'0'),meters:100+i*6.4+v*2,
 y:(i%g.laneCount)*g.centerStepM,speedMps:4+i%4,
 cpWatts:210+(i%7)*18,wPrimeJoules:18000
}))
function commands(s,v,g,{originalIds=null,mirror=false}={}){
 const maxY=(g.laneCount-1)*g.centerStepM,roundedMax=r6(maxY)
 return s.riders.map(r=>{
  const id=originalIds?.get(r.riderId)??r.riderId
  const i=Number(id.slice(1)),lane=i%g.laneCount
  const offset=s.tick%3===1&&(i+v)%4===0?-1:
   s.tick%3===2&&(i+v)%5===0?1:0
  const target=Math.min(maxY,r6(Math.max(0,Math.min(g.laneCount-1,lane+offset))*g.centerStepM))
  return {riderId:r.riderId,targetSpeedMps:4.5+(i+s.tick+v)%6,
   targetY:mirror?Math.max(0,Math.min(maxY,r6(roundedMax-r6(target)))):target,
   steeringWatts:35}
 })
}
function simulate(original,geometry,g,v,substeps,{canonical=true,mirror=false,originalIds=null}={}){
 const opts={riders:original,geometry,road:{gradePercent:[-3,0][v]},
  substeps,tickSeconds:10,conflictPolicy:'event_time_fair'}
 let current=canonical?beginCanonical(opts):begin(opts),checkpoint=null,nearStops=0
 const move=canonical?advanceCanonical:advance
 for(let tick=0;tick<6;tick++){
  const prior=new Map(current.riders.map(r=>[r.riderId,r.meters]))
  const choices=commands(current,v,g,{originalIds,mirror}),frozen=structuredClone(choices)
  current=move(current,choices)
  assert.deepEqual(choices,frozen,'A41 mutated frozen rider controls')
  assert.equal(auditObservedTrackSetV3(current.lastTickTracks,geometry).metrics.piecewiseCollisions,0)
  assert.equal(current.metrics.remainingPiecewiseOverlaps,0)
  nearStops+=current.riders.filter(r=>r.meters-prior.get(r.riderId)<.5).length
  if(tick===2)checkpoint=JSON.parse(JSON.stringify(current))
 }
 let replay=checkpoint
 for(let tick=3;tick<6;tick++)replay=move(replay,commands(replay,v,g,{originalIds,mirror}))
 assert.deepEqual(replay,current,'A41 midpoint JSON checkpoint was not deterministic')
 assert.equal(current.elapsedSeconds,60)
 assert.equal(current.officialWrites,0)
 assert.equal(current.sportingApproval,'NOT_APPROVED')
 assert.equal(current.metrics.riderSubsteps,original.length*6*substeps)
 assert(current.riders.every(r=>Number.isFinite(r.energy.remainingWPrimeJoules)&&
  r.energy.remainingWPrimeJoules>=0&&r.energy.seconds===60))
 assert(Math.abs(current.metrics.mechanicalJoules-current.riders.reduce((sum,r)=>
  sum+r.energy.cumulativeMechanicalJoules,0))<1e-5)
 const front=Math.max(...current.riders.map(r=>r.meters))
 return {seconds:10/substeps,canonicalFlipped:canonical?current.canonicalFlipped:null,
  nearStops,attenuated:current.metrics.attenuatedRiderSubsteps,
  hardFallbacks:current.metrics.hardFallbacks,tieGroups:current.metrics.physicalTieGroups,
  riders:current.riders.map(r=>({id:originalIds?.get(r.riderId)??r.riderId,
   x:r.meters,y:r.y,gap:r6(front-r.meters),
   wPrime:r.energy.remainingWPrimeJoules}))}
}
function difference(a,b,geometry,{mirror=false}={}){
 const g=validateRoadScenarioV3(geometry),maxY=r6((g.laneCount-1)*g.centerStepM)
 const bv=new Map(b.riders.map(x=>[x.id,x]))
 let maxPositionM=0,maxLateralM=0,maxWPrimeJ=0,maxGapM=0,inversions=0
 for(const x of a.riders){
  const y=bv.get(x.id);assert(y,'A41 rider ID mapping incomplete')
  maxPositionM=Math.max(maxPositionM,Math.abs(x.x-y.x))
  maxGapM=Math.max(maxGapM,Math.abs(x.gap-y.gap))
  maxWPrimeJ=Math.max(maxWPrimeJ,Math.abs(x.wPrime-y.wPrime))
  const expectedY=mirror?r6(maxY-y.y):y.y
  maxLateralM=Math.max(maxLateralM,Math.abs(x.y-expectedY))
 }
 for(let i=0;i<a.riders.length;i++)for(let j=i+1;j<a.riders.length;j++){
  const x=a.riders[i],y=a.riders[j],u=bv.get(x.id),v=bv.get(y.id)
  const d=x.x-y.x,e=u.x-v.x
  if(Math.abs(d)>1e-6&&Math.abs(e)>1e-6&&d*e<0)inversions++
 }
 return {maxPositionM:r6(maxPositionM),maxLateralM:r6(maxLateralM),
  maxWPrimeJ:r6(maxWPrimeJ),maxGapM:r6(maxGapM),inversions}
}
const resolutions=[],mirrors=[],renames=[],baselineEquivalence=[],failures=[]
for(const geometry of BATCH40_GEOMETRIES){
 const g=validateRoadScenarioV3(geometry),maxY=r6((g.laneCount-1)*g.centerStepM)
 for(const n of fields)for(const v of variants){
  const original=starters(n,g,v),unchanged=structuredClone(original)
  try{
   const canonical=stepCounts.map(k=>simulate(original,geometry,g,v,k))
   const old=stepCounts.map(k=>simulate(original,geometry,g,v,k,{canonical:false}))
   assert.deepEqual(original,unchanged,'A41 original source list changed')
   for(let k=0;k<stepCounts.length;k++){
    const caseId={road:g.id,n,v,seconds:10/stepCounts[k]}
    const equal=difference(canonical[k],old[k],geometry)
    baselineEquivalence.push({...caseId,...equal})
    resolutions.push({...caseId,policy:'canonical_A39',
     versus2s:k?difference(canonical[0],canonical[k],geometry):null,
     attenuated:canonical[k].attenuated,nearStops:canonical[k].nearStops,
     hardFallbacks:canonical[k].hardFallbacks,tieGroups:canonical[k].tieGroups})
    const mirrorStart=original.map(r=>({...r,y:Math.max(0,Math.min((g.laneCount-1)*g.centerStepM,r6(maxY-r.y)))}))
    const reflected=simulate(mirrorStart,geometry,g,v,stepCounts[k],{mirror:true})
    assert.notEqual(canonical[k].canonicalFlipped,reflected.canonicalFlipped,
     'A41 initial orientation must invert under road reflection')
    mirrors.push({...caseId,...difference(canonical[k],reflected,geometry,{mirror:true})})
    if(n>=8){
     const names=new Map()
     const renamed=original.map((r,i)=>{
      const updatedId='z'+String(n-1-i).padStart(3,'0')
      names.set(updatedId,r.riderId)
      return {...r,riderId:updatedId}
     })
     const renamedRun=simulate(renamed,geometry,g,v,stepCounts[k],{originalIds:names})
     renames.push({...caseId,...difference(canonical[k],renamedRun,geometry)})
    }
   }
  }catch(e){
   const failure={road:g.id,n,v,message:String(e.stack??e)}
   failures.push(failure);console.error(JSON.stringify(failure))
  }
 }
}
assert.equal(failures.length,0,'A41 safety/replay/canonicalization fixture failures')
assert.equal(resolutions.length,120)
assert.equal(baselineEquivalence.length,120)
assert.equal(mirrors.length,120)
assert.equal(renames.length,96)
const max=(arr,key)=>Math.max(0,...arr.map(x=>x[key]))
const failMirror=mirrors.filter(x=>x.maxPositionM>1e-5||x.maxLateralM>1e-5).length
const failRename=renames.filter(x=>x.maxPositionM>1e-5||x.maxLateralM>1e-5).length
const lostEquivalence=baselineEquivalence.filter(x=>
 x.maxPositionM>1e-5||x.maxLateralM>1e-5||x.maxWPrimeJ>1e-5).length
const summary=[2,2.5,5].map(seconds=>{
 const arr=resolutions.filter(x=>x.seconds===seconds)
 return {seconds,cases:arr.length,
  maxPositionM:max(arr.map(x=>x.versus2s).filter(Boolean),'maxPositionM'),
  maxWPrimeJ:max(arr.map(x=>x.versus2s).filter(Boolean),'maxWPrimeJ'),
  totalInversions:arr.reduce((s,x)=>s+(x.versus2s?.inversions??0),0),
  tieGroups:arr.reduce((s,x)=>s+x.tieGroups,0),
  hardFallbacks:arr.reduce((s,x)=>s+x.hardFallbacks,0),
  nearStops:arr.reduce((s,x)=>s+x.nearStops,0)
})
const report={study:'A2_STEP41_CANONICAL_MIRROR_REPRESENTATION',technicalGate:'PASS',
 representationGate:failMirror===0&&failRename===0?'PASS':'FAIL',
 numericalConvergence:'NOT_APPROVED_A39_TIMEGRID_STILL_UNSTABLE',
 sportingGate:'NO_GO',
 resolutionCases:resolutions.length,referenceCases:baselineEquivalence.length,
 mirrorCases:mirrors.length,renameCases:renames.length,
 failMirror,failRename,lostEquivalence,
 maxMirrorPositionM:max(mirrors,'maxPositionM'),maxMirrorLateralM:max(mirrors,'maxLateralM'),
 maxRenamePositionM:max(renames,'maxPositionM'),
 summary,mirrorResults:mirrors,renameResults:renames,
 baselineEquivalence,caseResults:resolutions,failures,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}
const dir=process.env.V3_A2_STEP41_DIR??'/tmp/a2-step41'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a2-step41-canonical-mirror.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({study:report.study,technicalGate:report.technicalGate,
 representationGate:report.representationGate,numericalConvergence:report.numericalConvergence,
 sportingGate:report.sportingGate,resolutionCases:report.resolutionCases,
 referenceCases:report.referenceCases,mirrorCases:report.mirrorCases,
 renameCases:report.renameCases,failMirror,failRename,lostEquivalence,
 maxMirrorPositionM:report.maxMirrorPositionM,maxMirrorLateralM:report.maxMirrorLateralM,
 maxRenamePositionM:report.maxRenamePositionM,summary,
 officialWrites:0,sportingApproval:'NOT_APPROVED'}))
