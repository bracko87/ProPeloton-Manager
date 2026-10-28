/** Step A49: common-reference and direct same-grid study for OFFLINE snapshots.
 * No solver, scoring, race result or player data mutation. Multiple anchors
 * are experimental comparators, not evidence of physical ground truth.
 */
const need=(b,m)=>{if(!b)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const numeric=x=>Number.isFinite(x)
function snapshot(r){
 need(Array.isArray(r)&&r.length>=2&&r.length<=32,
  'A49 unsupported rider snapshot, NOT a full-peloton simulation')
 const ids=new Set()
 for(const q of r){
  need(typeof q.id==='string'&&!ids.has(q.id),'A49 duplicate or missing rider')
  ids.add(q.id)
  need([q.x,q.y,q.gap,q.w].every(numeric),'A49 invalid rider snapshot')
 }
 return r
}
function compare(reference,actual){
 snapshot(reference);snapshot(actual)
 need(reference.length===actual.length,'A49 roster mismatch')
 const a=new Map(actual.map(x=>[x.id,x]))
 let maxX=0,maxY=0,maxGap=0,maxW=0,changedPairs=0,changedRiders=0
 let rmsX2=0,sumAbsX=0
 for(const p of reference){
  const q=a.get(p.id);need(q,'A49 unmatched rider identity')
  const dx=Math.abs(q.x-p.x),dy=Math.abs(q.y-p.y),dg=Math.abs(q.gap-p.gap)
  maxX=Math.max(maxX,dx);maxY=Math.max(maxY,dy)
  maxGap=Math.max(maxGap,dg);maxW=Math.max(maxW,Math.abs(q.w-p.w))
  rmsX2+=dx*dx;sumAbsX+=dx
  changedRiders+=Number(dx>1e-6||dy>1e-6)
 }
 for(let i=0;i<reference.length;i++)for(let j=i+1;j<reference.length;j++){
  const p=reference[i],q=reference[j],r=a.get(p.id),s=a.get(q.id)
  const before=p.x-q.x,after=r.x-s.x
  if(Math.abs(before)>1e-6&&Math.abs(after)>1e-6&&before*after<0)changedPairs++
 }
 return {maxPositionM:r6(maxX),maxLateralM:r6(maxY),
  maxLeaderGapM:r6(maxGap),maxWPrimeJ:r6(maxW),
  rmsPositionM:r6(Math.sqrt(rmsX2/reference.length)),
  meanAbsPositionM:r6(sumAbsX/reference.length),
  changedRiders,positionOrderInversions:changedPairs}
}
export function compareCommonReferenceV3(anchorSnapshot,policiesAtQuantum,{anchorId,quantum}={}){
 need(typeof anchorId==='string'&&anchorId.length>0&&
  [0.5,1,2,2.5,5].includes(quantum),'A49 common reference metadata invalid')
 snapshot(anchorSnapshot)
 need(policiesAtQuantum&&typeof policiesAtQuantum==='object'&&!Array.isArray(policiesAtQuantum),
  'A49 missing same time-grid candidate snapshots')
 const out={}
 for(const [policy,s] of Object.entries(policiesAtQuantum))
  out[policy]=compare(anchorSnapshot,s)
 return {anchorId,quantum,comparisons:out}
}
export function compareMatchedPoliciesV3(a,b,{quantum,policyA,policyB}={}){
 need([.5,1,2,2.5,5].includes(quantum)&&typeof policyA==='string'&&
  typeof policyB==='string'&&policyA!==policyB,'A49 invalid direct policy pairing')
 return {quantum,policyA,policyB,comparison:compare(a,b)}
}
