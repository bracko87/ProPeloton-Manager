/** A37 OFFLINE: first swept contact and bounded rear-rider yielding.
 * Operates only on this frozen synchronous substep's provisional paths.
 * Never changes submitted player commands, live simulation or official results.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
const need=(ok,msg)=>{if(!ok)throw Error(msg)}
const r6=x=>Math.round(x*1e6)/1e6
function openInterval(a,b,limit){
 if(Math.abs(a-b)<1e-12)return Math.abs(a)<limit-1e-10?[0,1]:null
 const p=(-limit-a)/(b-a),q=(limit-a)/(b-a)
 const lo=Math.max(0,Math.min(p,q)),hi=Math.min(1,Math.max(p,q))
 return hi-lo>1e-10?[lo,hi]:null
}
export function firstSweptContactFractionV3(a,b,{longitudinal=1.8,lateral=.8}={}){
 need([a?.x0,a?.x1,a?.y0,a?.y1,b?.x0,b?.x1,b?.y0,b?.y1,longitudinal,lateral].every(Number.isFinite)&&longitudinal>=1.8&&longitudinal<=3&&lateral>=.7&&lateral<=1.2,'Invalid A37 contact inputs')
 const x=openInterval(a.x0-b.x0,a.x1-b.x1,longitudinal),y=openInterval(a.y0-b.y0,a.y1-b.y1,lateral)
 if(!x||!y)return null
 const begin=Math.max(x[0],y[0]),end=Math.min(x[1],y[1])
 return end-begin>1e-9?Math.max(0,begin):null
}
function path(p,scale){return {riderId:p.riderId,x0:p.original.meters,x1:r6(p.original.meters+p.forward*scale),y0:p.original.y,y1:r6(p.original.y+(p.y-p.original.y)*scale)}}
/** First conflicting pair by current-substep contact time attempts a unilateral
 * rear-rider yield, verifying against ALL other frozen paths. We search the
 * entire [0,current] ratio without assuming monotonic swept safety.
 * If no unilateral clearance exists we fall back to symmetric halving.
 * Neither rider's COMMAND is rewritten. No crossing receives immunity.
 */
export function resolveEventTimeYieldV3(proposals,g,{maxRounds=64}={}){
 need(Array.isArray(proposals)&&proposals.length>=2&&proposals.length<=32&&g&&Number.isFinite(g.lateralCollisionM)&&Number.isInteger(maxRounds)&&maxRounds>=8&&maxRounds<=64,'Invalid A37 resolver')
 const ordered=[...proposals].sort((a,b)=>a.riderId.localeCompare(b.riderId))
 need(new Set(ordered.map(p=>p.riderId)).size===ordered.length,'Duplicate A37 rider')
 const scales=new Map(ordered.map(p=>[p.riderId,1])),options={longitudinal:1.8,lateral:g.lateralCollisionM}
 let pairChecks=0,collisionProposals=0,yieldSelections=0,fallbacks=0,rounds=0,contactFractionSum=0,contactSamples=0,contactBoundaryFallbacks=0
 let resolved=null
 for(let iteration=0;iteration<=maxRounds;iteration++){
  const paths=ordered.map(p=>path(p,scales.get(p.riderId))),hits=[]
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
   pairChecks++
   if(continuousBicycleCollisionV3(paths[i],paths[j],options)){
    const first=firstSweptContactFractionV3(paths[i],paths[j],options)
    // The canonical swept overlap wins even for degenerate floating-point boundaries.
    // Treat an unlocated overlap as immediate, never as clearance.
    if(first===null)contactBoundaryFallbacks++
    const time=first??0
    hits.push({a:ordered[i],b:ordered[j],time})
    collisionProposals++;contactSamples++;contactFractionSum+=time
   }
  }
  if(hits.length===0){resolved=paths;break}
  need(iteration<maxRounds,'A37 cannot find collision-free bounded research movement')
  hits.sort((u,v)=>u.time-v.time||u.a.riderId.localeCompare(v.a.riderId)||u.b.riderId.localeCompare(v.b.riderId))
  const {a,b}=hits[0]
  const rear=a.original.meters<b.original.meters?a:
   a.original.meters>b.original.meters?b:
   a.riderId.localeCompare(b.riderId)<0?a:b
  const prior=scales.get(rear.riderId),others=paths.filter(p=>p.riderId!==rear.riderId)
  let accepted=null
  for(let k=1;k<=32;k++){
   const candidateScale=r6(prior*(1-k/32))
   if(candidateScale>=prior-1e-7)continue
   const candidate=path(rear,candidateScale)
   let clear=true
   for(const opponent of others){
    pairChecks++
    if(continuousBicycleCollisionV3(candidate,opponent,options)){clear=false;break}
   }
   if(clear){accepted=candidateScale;break}
  }
  if(accepted!==null){scales.set(rear.riderId,accepted);yieldSelections++}
  else{
   scales.set(a.riderId,r6(scales.get(a.riderId)/2))
   scales.set(b.riderId,r6(scales.get(b.riderId)/2))
   fallbacks++
  }
  rounds++
 }
 need(resolved!==null,'A37 missing resolved movement')
 for(let i=0;i<resolved.length;i++)for(let j=i+1;j<resolved.length;j++)
  need(!continuousBicycleCollisionV3(resolved[i],resolved[j],options),'A37 returned swept-unsafe motion')
 return {paths:resolved,scales,pairChecks,collisionProposals,rounds,
  yieldSelections,fallbacks,contactSamples,contactFractionSum,contactBoundaryFallbacks,
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
