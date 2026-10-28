/** A53 research-only preacceptance guard for isolated component movement.
 * Never commits movement, W-prime, classifications or any live result.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {firstSweptContactFractionV3} from './a2EventTimeYieldResearchV3.mjs'
const check=(b,m)=>{if(!b)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const limits=g=>({longitudinal:1.8,lateral:g.lateralCollisionM})
const collision=(a,b,g)=>continuousBicycleCollisionV3(a,b,limits(g))
function validate(paths,g,name){
 check(Array.isArray(paths)&&paths.length>=2&&paths.length<=32&&
  Number.isFinite(g?.lateralCollisionM),'A53 invalid collection')
 const by=new Map()
 for(const p of paths){
  check(typeof p?.riderId==='string'&&p.riderId.length>0&&
   [p.x0,p.x1,p.y0,p.y1].every(Number.isFinite)&&!by.has(p.riderId)&&
   p.x1>=p.x0-1e-6,'A53 invalid or duplicate path in '+name)
  by.set(p.riderId,p)
 }
 return by
}
function pairs(paths,g){
 const hits=[]
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)
  if(collision(paths[i],paths[j],g))
   hits.push([paths[i].riderId,paths[j].riderId].sort())
 return hits.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]))
}
const same=(a,b)=>a.x0===b.x0&&a.y0===b.y0
const sameTrack=(a,b)=>same(a,b)&&a.x1===b.x1&&a.y1===b.y1
export function auditPreacceptanceDependencyV3(referencePaths,candidatePaths,
 selectedIds,g,{physicalSeconds=1}={}){
 const baseline=validate(referencePaths,g,'baseline')
 const candidate=validate(candidatePaths,g,'candidate')
 check(baseline.size===candidate.size&&Number.isFinite(physicalSeconds)&&
  physicalSeconds>0&&physicalSeconds<=5,'A53 mismatched roster or physical timestep')
 check(Array.isArray(selectedIds)&&new Set(selectedIds).size===selectedIds.length,
  'A53 invalid selected rider IDs')
 const selected=new Set(selectedIds)
 for(const id of selected)check(baseline.has(id),'A53 unknown rider selected')
 for(const [id,path] of baseline)
  check(candidate.has(id)&&same(path,candidate.get(id)),'A53 source positions differ')
 // The baseline and complete proposed-policy paths must already be safe.
 check(!pairs(referencePaths,g).length&&!pairs(candidatePaths,g).length,
  'A53 source policy input unsafe')
 const hybrid=[...baseline.keys()].sort().map(id=>
  selected.has(id)?candidate.get(id):baseline.get(id))
 const changed=[...selected].filter(id=>!sameTrack(
  baseline.get(id),candidate.get(id))).sort()
 const changedSet=new Set(changed)
 const blockers=[]
 let boundaryChecks=0,internalChecks=0
 for(let i=0;i<hybrid.length;i++)for(let j=i+1;j<hybrid.length;j++){
  const a=hybrid[i],b=hybrid[j]
  if(!changedSet.has(a.riderId)&&!changedSet.has(b.riderId))continue
  const boundary=selected.has(a.riderId)!==selected.has(b.riderId)
  if(boundary)boundaryChecks++;else internalChecks++
  if(!collision(a,b,g))continue
  const t=firstSweptContactFractionV3(a,b,limits(g))
  blockers.push({pair:[a.riderId,b.riderId].sort(),
   kind:boundary?'CROSS_COMPONENT_DEPENDENCY':'INTERNAL_COMPONENT_CONFLICT',
   firstContactFraction:t===null?null:r6(t)})
 }
 blockers.sort((a,b)=>a.pair[0].localeCompare(b.pair[0])||
  a.pair[1].localeCompare(b.pair[1]))
 const maxDistanceDeltaM=r6(Math.max(0,...changed.map(id=>
  Math.abs(baseline.get(id).x1-candidate.get(id).x1))))
 const allow=blockers.length===0
 return {action:allow?'SAFE_AS_ONE_SUBSTEP_CANDIDATE':'REJECT_UNSAFE_SUBSTITUTION',
  allow,selectedCount:selected.size,changedCount:changed.length,
  changedRiders:changed,unchangedRiders:baseline.size-selected.size,
  unchangedOutsideTracksVerified:[...baseline].every(([id,p])=>
   selected.has(id)||sameTrack(p,hybrid.find(x=>x.riderId===id))),
  blockers,crossBoundaryConflictPairs:blockers.filter(x=>x.kind==='CROSS_COMPONENT_DEPENDENCY'),
  internalConflictPairs:blockers.filter(x=>x.kind==='INTERNAL_COMPONENT_CONFLICT'),
  checks:{crossBoundary:boundaryChecks,internal:internalChecks},
  maxDistanceDeltaM,maxAverageSpeedDeltaMps:r6(maxDistanceDeltaM/physicalSeconds),
  energyReevaluationRequired:changed.length>0,energyLedgerVerified:false,
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
/** Independent full-pair physical oracle, used only in A53 test harness. */
export function auditFullHybridOracleV3(referencePaths,candidatePaths,selectedIds,g){
 const chosen=new Set(selectedIds),candidate=new Map(candidatePaths.map(x=>[x.riderId,x]))
 const hybrid=referencePaths.map(p=>chosen.has(p.riderId)?candidate.get(p.riderId):p)
 return pairs(hybrid,g)
}
