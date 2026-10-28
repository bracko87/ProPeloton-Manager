/** A44 isolated research — physically chosen collision concessions.
 * Never drives live races. Only executed via explicit opt-in policy.
 * Deterministic all-pair rounds, no priority by rider name or roster order.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
const ensure=(ok,m)=>{if(!ok)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const motion=(p,scale)=>({riderId:p.riderId,x0:p.original.meters,
 x1:r6(p.original.meters+p.forward*scale),y0:p.original.y,
 y1:r6(p.original.y+(p.y-p.original.y)*scale)})
export function resolveContactPriorityV3(proposals,g,{policy='rear_priority',maxRounds=64,diagnostics=false}={}){
 ensure(Array.isArray(proposals)&&proposals.length>=2&&proposals.length<=32&&
  ['rear_priority','rear_corridor_guard','lane_entry_priority'].includes(policy)&&
  Number.isInteger(maxRounds)&&maxRounds===64&&typeof diagnostics==='boolean'&&
  Number.isFinite(g?.lateralCollisionM),'Invalid A44 research contact inputs')
 const riders=[...proposals].sort((a,b)=>a.riderId.localeCompare(b.riderId))
 ensure(new Set(riders.map(r=>r.riderId)).size===riders.length,'A44 duplicate rider IDs')
 const limits={longitudinal:1.8,lateral:g.lateralCollisionM}
 const scales=new Map(riders.map(r=>[r.riderId,1]))
 let accepted=null,pairChecks=0,collisionProposals=0,rounds=0,
  rearYields=0,enteringYields=0,symmetricYields=0,hardFallbacks=0,
  corridorGuardYields=0,stalledGuardYields=0
 const diagnosticEvents=diagnostics?[]:null
 let firstCollidingPairs=null,lastCollidingPairs=null
 for(let round=0;round<=maxRounds;round++){
  const paths=riders.map(r=>motion(r,scales.get(r.riderId)))
  const reduce=new Set(),involved=new Set()
  const activePairs=diagnostics?[]:null
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
   pairChecks++
   if(!continuousBicycleCollisionV3(paths[i],paths[j],limits))continue
   collisionProposals++
   const a=riders[i],b=riders[j]
   involved.add(a.riderId);involved.add(b.riderId)
   if(diagnostics)activePairs.push({
    a:a.riderId,b:b.riderId,
    aStartX:a.original.meters,bStartX:b.original.meters,
    aStartY:a.original.y,bStartY:b.original.y,
    aProposedY:a.y,bProposedY:b.y,
    aScale:scales.get(a.riderId),bScale:scales.get(b.riderId)})
   const steerA=Math.abs(a.y-a.original.y)>1e-7
   const steerB=Math.abs(b.y-b.original.y)>1e-7
   const gap=a.original.meters-b.original.meters
   if(policy==='lane_entry_priority'&&steerA!==steerB){
    reduce.add(steerA?a.riderId:b.riderId)
    enteringYields++
   }else if(Math.abs(gap)>=1e-7&&
       (!steerA&&!steerB||policy==='rear_priority'||policy==='rear_corridor_guard')){
    const follower=gap<0?a:b,leader=gap<0?b:a
    if(policy==='rear_corridor_guard'){
     // A46: when stopping the follower does not clear the physical
     // leader's current swept trajectory, one-sided yielding cannot work.
     // Reduce both paths in bounded rounds; original swept fallback remains.
     const leaderPath=paths[gap<0?j:i]
     const stalled=continuousBicycleCollisionV3(motion(follower,0),leaderPath,limits)
     const minuscule=scales.get(follower.riderId)<1/65536
     if(stalled||minuscule){
      reduce.add(follower.riderId);reduce.add(leader.riderId)
      corridorGuardYields++
      if(minuscule)stalledGuardYields++
     }else{reduce.add(follower.riderId);rearYields++}
    }else{reduce.add(follower.riderId);rearYields++}
   }else{
    reduce.add(a.riderId);reduce.add(b.riderId)
    symmetricYields++
   }
  }
  if(diagnostics&&round===0)firstCollidingPairs=activePairs
  if(!involved.size){accepted=paths;break}
  if(diagnostics)lastCollidingPairs=activePairs
  if(round===maxRounds)break
  for(const id of reduce)scales.set(id,scales.get(id)/2)
  rounds++
 }
 // Must preserve the original A34 conservative all-pair fallback whenever
 // one-sided yielding cannot produce a safe space-time path in bounded rounds.
 if(!accepted){
  hardFallbacks++
  if(diagnostics){
   const exhaustedScales=[...scales.values()]
   diagnosticEvents.push({kind:'priority_full_fallback',
    policy,primaryRounds:maxRounds,firstContactCount:firstCollidingPairs?.length??0,
    unresolvedContactCount:lastCollidingPairs?.length??0,
    minimumScale:Math.min(...exhaustedScales),
    nearZeroScaleCount:exhaustedScales.filter(x=>x<=1e-12).length,
    firstPairs:(firstCollidingPairs??[]).slice(0,8),
    unresolvedPairs:(lastCollidingPairs??[]).slice(0,8)})
  }
  const original=new Map(riders.map(p=>[p.riderId,1]))
  for(let round=0;round<=64;round++){
   const paths=riders.map(p=>motion(p,original.get(p.riderId))),involved=new Set()
   for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
    pairChecks++
    if(continuousBicycleCollisionV3(paths[i],paths[j],limits)){
     involved.add(paths[i].riderId);involved.add(paths[j].riderId);collisionProposals++
    }
   }
   if(!involved.size){accepted=paths;break}
   ensure(round!==64,'A44 full symmetric safety fallback did not settle')
   for(const id of involved)original.set(id,original.get(id)/2)
   rounds++
  }
  for(const [id,scale] of original)scales.set(id,scale)
 }
 ensure(accepted!==null,'A44 no accepted safe movement')
 for(let i=0;i<accepted.length;i++)for(let j=i+1;j<accepted.length;j++)
  ensure(!continuousBicycleCollisionV3(accepted[i],accepted[j],limits),
   'A44 accepted continuous collision')
 return {paths:accepted,scales,pairChecks,collisionProposals,rounds,
  rearYields,enteringYields,symmetricYields,hardFallbacks,
  corridorGuardYields,stalledGuardYields,diagnosticEvents,
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
