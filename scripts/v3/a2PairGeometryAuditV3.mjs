/** A48: pure observational lens on A43's frozen physical substep.
 * This module NEVER chooses a yielding rider or modifies a swept path.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {firstSweptContactFractionV3} from './a2EventTimeYieldResearchV3.mjs'
const r6=x=>Math.round(x*1e6)/1e6
const valid=(ok,msg)=>{if(!ok)throw Error(msg)}
function path(r){
 valid(r&&Number.isFinite(r.x0)&&Number.isFinite(r.y0)&&
  Number.isFinite(r.proposedMeters)&&Number.isFinite(r.proposedY),'A48 invalid proposal')
 return {x0:r.x0,x1:r6(r.x0+r.proposedMeters),y0:r.y0,y1:r.proposedY}
}
export function auditFirstContactPairV3(a,b,g){
 valid(a?.riderId&&b?.riderId&&a.riderId!==b.riderId&&
  Number.isFinite(g?.lateralCollisionM),'A48 invalid observed pair')
 const p=path(a),q=path(b),limit={longitudinal:1.8,lateral:g.lateralCollisionM}
 const contact=continuousBicycleCollisionV3(p,q,limit)
 const first=firstSweptContactFractionV3(p,q,limit)
 const steerA=Math.abs(a.proposedY-a.y0)>1e-7
 const steerB=Math.abs(b.proposedY-b.y0)>1e-7
 const signA=Math.sign(a.proposedY-a.y0),signB=Math.sign(b.proposedY-b.y0)
 const movementType=!steerA&&!steerB?'straight':
  steerA!==steerB?'one_steering':
  signA===signB?'parallel_steering':'opposite_steering'
 const equalX=Math.abs(a.x0-b.x0)<=1e-7
 const follower=equalX?null:a.x0<b.x0?a:b
 const leader=equalX?null:a.x0>b.x0?a:b
 const front=leader?path(leader):null
 const stopped=follower?path(follower):null
 if(stopped){stopped.x1=stopped.x0;stopped.y1=stopped.y0}
 const stationaryFollowerHit=!!(front&&stopped&&
  continuousBicycleCollisionV3(front,stopped,limit))
 const at=first===null?null:{
  relativeLongitudinalM:r6(p.x0+(p.x1-p.x0)*first -
   (q.x0+(q.x1-q.x0)*first)),
  relativeLateralM:r6(p.y0+(p.y1-p.y0)*first -
   (q.y0+(q.y1-q.y0)*first))}
 return {riderIds:[a.riderId,b.riderId],contact,
  contactFraction:first===null?null:r6(first),
  movementType,steeringRiders:[a,b].filter(r=>Math.abs(r.proposedY-r.y0)>1e-7).map(r=>r.riderId),
  leaderId:leader?.riderId??null,followerId:follower?.riderId??null,
  stationaryFollowerHit,atFirstContact:at,
  originalForwardGapM:follower?r6(leader.x0-follower.x0):0,
  sourceLateralDifferenceM:r6(a.y0-b.y0),
  commandedLateralDifferenceM:r6(a.proposedY-b.proposedY),
  sourcePair:{
   a:{x0:a.x0,y0:a.y0,dx:a.proposedMeters,y1:a.proposedY},
   b:{x0:b.x0,y0:b.y0,dx:b.proposedMeters,y1:b.proposedY}
  }}
}
export function firstComparedDivergenceV3(left,right,g,physicalQuantumSeconds){
 valid(Array.isArray(left?.observed)&&Array.isArray(right?.observed)&&
  left.observed.length===right.observed.length&&
  [0.5,1,2,2.5,5].includes(physicalQuantumSeconds),'A48 incomplete same-grid traces')
 const seconds=physicalQuantumSeconds
 for(let tick=0;tick<left.observed.length;tick++){
  const L=left.observed[tick],R=right.observed[tick]
  valid(L.previews.length===10/seconds&&R.previews.length===10/seconds,'A48 incomplete substep preview')
  const other=new Map(R.tracks.map(r=>[r.riderId,r.knots]))
  for(let sub=1;sub<=10/seconds;sub++){
   let maxX=0,maxY=0,firstRider=null
   for(const record of L.tracks){
    const match=other.get(record.riderId)
    valid(match&&record.knots.length===match.length,'A48 unequal rider traces')
    const p=record.knots[sub],q=match[sub]
    const dx=Math.abs(p.x-q.x),dy=Math.abs(p.y-q.y)
    if(dx>Math.max(maxX,1e-6)||dy>Math.max(maxY,1e-6))
     firstRider=record.riderId
    maxX=Math.max(maxX,dx);maxY=Math.max(maxY,dy)
   }
   if(maxX<=1e-6&&maxY<=1e-6)continue
   const extract=x=>{
    const cur=x.previews[sub-1]
    const byId=new Map(cur.proposals.map(p=>[p.riderId,p]))
    const pairs=cur.previewConflictPairs.map(pair=>
     auditFirstContactPairV3(byId.get(pair[0]),byId.get(pair[1]),g))
    return {
     previewCount:cur.previewConflictCount,
     pairs:pairs.slice(0,14),
     typeCount:Object.fromEntries(['straight','one_steering','parallel_steering','opposite_steering'].map(t=>[
       t,pairs.filter(p=>p.movementType===t).length
     ])),
     stalledLeaderContacts:pairs.filter(p=>p.stationaryFollowerHit).length,
     accepted:cur.achieved.filter(p=>p.riderId===firstRider).map(p=>({
      riderId:p.riderId,x1:p.x1,y1:p.y1,movementScale:p.movementScale
     }))
    }
   }
   return {simulationSeconds:r6(tick*10+sub*seconds),
    tick,substep:sub,offendingRiderId:firstRider,
    maxXDeltaM:r6(maxX),maxYDeltaM:r6(maxY),
    left:extract(L),right:extract(R)}
  }
 }
 return null
}
