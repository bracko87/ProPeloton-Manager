/** A2 RESEARCH ONLY: explicit short-horizon acknowledged passing corridor.
 * This is a cooperative intent protocol, NOT clairvoyance or a collision
 * solver. Only rider-submitted current-tick intents and previously observed
 * positions/sideways motion are available. Unacknowledged opponents are NEVER
 * compelled to yield. The unchanged swept-collision solver remains decisive.
 */
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {selectEarlyCorridorV3} from './a2EarlyCorridorV3.mjs'
const invariant=(ok,msg)=>{if(!ok)throw Error(msg)}
const round=x=>Math.round(x*1e6)/1e6
export function initializeCorridorReservationV3({rearId='rear',leadId='lead',leaseTicks=8,maxDeferralsPerRival=2}={}){
 invariant(typeof rearId==='string'&&rearId.length>0&&typeof leadId==='string'&&leadId!==rearId&&Number.isInteger(leaseTicks)&&leaseTicks>=2&&leaseTicks<=12&&Number.isInteger(maxDeferralsPerRival)&&maxDeferralsPerRival>=0&&maxDeferralsPerRival<=4,'Invalid corridor reservation')
 return {version:1,gate:'A2_OFFLINE_CORRIDOR_RESERVATION_ONLY',rearId,leadId,leaseTicks,maxDeferralsPerRival,tick:0,phase:'idle',targetY:null,remaining:0,heldBy:{},lastRiders:null,
  metrics:{grants:0,acknowledgedDeferrals:0,revocations:0,unacknowledgedCancels:0,observedLateralThreats:0,expired:0,maxRivalHolds:0},events:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function stepCorridorReservationV3(snapshot,riders,rawIntents,rawGeometry,{acknowledgedRiderIds=[]}={}){
 invariant(snapshot?.version===1&&snapshot.gate==='A2_OFFLINE_CORRIDOR_RESERVATION_ONLY'&&snapshot.officialWrites===0&&snapshot.sportingApproval==='NOT_APPROVED'&&Number.isInteger(snapshot.tick),'Invalid reservation checkpoint')
 const g=validateRoadScenarioV3(rawGeometry)
 invariant(Array.isArray(riders)&&riders.length>=2&&riders.length<=32&&Array.isArray(rawIntents)&&riders.length===rawIntents.length&&Array.isArray(acknowledgedRiderIds),'Invalid reservation inputs')
 const original=new Map(riders.map(r=>[r.riderId,r])),intents=new Map(rawIntents.map(m=>[m.riderId,m])),acks=new Set(acknowledgedRiderIds)
 invariant(original.size===riders.length&&intents.size===riders.length&&riders.every(r=>Number.isFinite(r.meters)&&Number.isFinite(r.y)&&intents.has(r.riderId)),'Invalid reservation roster')
 const rear=original.get(snapshot.rearId),lead=original.get(snapshot.leadId)
 invariant(rear&&lead,'Missing passing pair')
 const next=structuredClone(snapshot);next.tick++
 const approved=rawIntents.map(x=>({...x})),actions=new Map(approved.map(x=>[x.riderId,x]))
 const emit=(reason,otherId=null)=>next.events.push({tick:next.tick,reason,otherId})
 const revoke=(reason,otherId=null)=>{
  if(next.phase==='active'){next.metrics.revocations++;if(reason==='unacknowledged_conflict')next.metrics.unacknowledgedCancels++;emit(reason,otherId)}
  next.phase='aborted';next.targetY=null;next.remaining=0
 }
 // New consent-based request is admitted solely from what is visible NOW.
 if(next.phase==='idle'){
  const pick=selectEarlyCorridorV3(riders,next.rearId,rawGeometry)
  if(pick.candidates[0].blockingRiders===0){
   next.phase='active';next.targetY=pick.selectedY;next.remaining=next.leaseTicks
   next.metrics.grants++;emit('granted')
  }else{next.phase='unavailable';emit('not_clear')}
 }
 if(next.phase==='active'){
  // Predict intent, not the next actual decision: current lateral velocity
  // from last observed state plus this-tick communicated target position.
  const observed=new Map((next.lastRiders??[]).map(r=>[r.riderId,r]))
  const threatened=[]
  for(const r of riders){
   if(r.riderId===next.rearId||r.riderId===next.leadId)continue
   const desire=intents.get(r.riderId),previous=observed.get(r.riderId)
   const dy=previous?r.y-previous.y:0
   const nextY=desire.targetY
   const corridorY=next.targetY
   const movingToward=(r.y-corridorY)*(nextY-r.y)<0||(dy!==0&&(r.y-corridorY)*dy<0)
   const forecast=round(nextY+Math.max(-g.centerStepM,Math.min(g.centerStepM,dy)))
   const nearLane=Math.abs(nextY-corridorY)<=g.lateralCollisionM+.05||Math.abs(forecast-corridorY)<=g.lateralCollisionM+.05
   const dx=r.meters-rear.meters
   // A bound of 90 m explicitly covers 2 nominal ~10s movement ticks,
   // not unseen future actions. This is a synthetic screening choice.
   if(dx>=-8&&dx<=90&&nearLane&&movingToward){
    next.metrics.observedLateralThreats++;threatened.push(r.riderId)
   }
  }
  for(const id of threatened){
   if(!acks.has(id)){revoke('unacknowledged_conflict',id);break}
   if((next.heldBy[id]??0)>=next.maxDeferralsPerRival){revoke('deferral_limit',id);break}
   const m=actions.get(id),r=original.get(id)
   // Explicit acknowledgement makes a voluntary HOLD request. This is
   // not a command to any adversarial/non-consenting cyclist.
   m.targetY=r.y
   next.heldBy[id]=(next.heldBy[id]??0)+1
   next.metrics.acknowledgedDeferrals++
   next.metrics.maxRivalHolds=Math.max(next.metrics.maxRivalHolds,next.heldBy[id])
   emit('yield_acknowledged',id)
  }
  if(next.phase==='active'){
   const own=actions.get(next.rearId)
   const previous=rear.y,desired=next.targetY
   own.targetY=round(previous+Math.max(-g.centerStepM,Math.min(g.centerStepM,desired-previous)))
   next.remaining--
   if(next.remaining===0){next.phase='expired';next.metrics.expired++;emit('lease_expired')}
  }
 } 
 if(next.phase==='aborted'){
  // Cancel preference, do not force another actor to move. The carrier
  // keeps the currently achieved lane; physics may still safely slow it.
  actions.get(next.rearId).targetY=rear.y
 }
 next.lastRiders=riders.map(r=>({riderId:r.riderId,meters:r.meters,y:r.y}))
 invariant(next.officialWrites===0&&next.sportingApproval==='NOT_APPROVED','Reservation modified official state')
 return {reservation:next,intents:approved,decision:next.phase}
}
