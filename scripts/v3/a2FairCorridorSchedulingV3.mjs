/** OFFLINE A2 experiment: two-sided, consent-aware bounded lane scheduling.
 * Does not modify collision/energy physics. Every instruction is a voluntary
 * synthetic rider intent and the unchanged swept-collision solver is final.
 *
 * Safety/fairness guarantee only: a rival can be requested to defer no more
 * than maxHoldTicks, and its original lane-change request is NEVER erased
 * from the scheduler's queued intent. Actual completion is measured, not
 * guaranteed in a dynamic field with uncooperative third parties.
 */
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {selectEarlyCorridorV3} from './a2EarlyCorridorV3.mjs'
const check=(v,m)=>{if(!v)throw Error(m)}
const r6=v=>Math.round(v*1e6)/1e6
export function initializeFairCorridorV3({rearId='rear',leadId='lead',maxHoldTicks=1,releaseGapM=4,leaseTicks=8}={}){
 check(typeof rearId==='string'&&rearId.length>0&&typeof leadId==='string'&&leadId!==rearId&&Number.isInteger(maxHoldTicks)&&maxHoldTicks>=0&&maxHoldTicks<=2&&Number.isFinite(releaseGapM)&&releaseGapM>=2&&releaseGapM<=12&&Number.isInteger(leaseTicks)&&leaseTicks>=2&&leaseTicks<=12,'Invalid fair corridor initialization')
 return {version:1,gate:'A2_OFFLINE_TWO_SIDED_CORRIDOR_ONLY',rearId,leadId,maxHoldTicks,releaseGapM,leaseTicks,
  phase:'idle',tick:0,targetY:null,originY:null,remainingTicks:0,pending:{},previousRiders:null,
  metrics:{granted:0,holds:0,holdCapReached:0,refusals:0,releases:0,completed:0,uncompleted:0,
   gapCappedTicks:0,unrelatedHolds:0,otherIntentOverriddenWithoutConsent:0,expires:0},
  events:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceFairCorridorV3(state,riders,rawIntents,geometry,{acknowledgedRiderIds=[]}={}){
 check(state?.version===1&&state.gate==='A2_OFFLINE_TWO_SIDED_CORRIDOR_ONLY'&&state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED','Invalid fair corridor checkpoint')
 const g=validateRoadScenarioV3(geometry)
 check(Array.isArray(riders)&&riders.length>=2&&riders.length<=32&&Array.isArray(rawIntents)&&riders.length===rawIntents.length&&Array.isArray(acknowledgedRiderIds),'Invalid fair corridor inputs')
 const byId=new Map(riders.map(r=>[r.riderId,r])),requested=new Map(rawIntents.map(r=>[r.riderId,r])),consent=new Set(acknowledgedRiderIds)
 check(byId.size===riders.length&&requested.size===riders.length&&riders.every(r=>Number.isFinite(r.meters)&&Number.isFinite(r.y)&&requested.has(r.riderId)),'Invalid fair corridor roster')
 const rear=byId.get(state.rearId),lead=byId.get(state.leadId)
 check(rear&&lead,'Missing fair corridor rider')
 const out=structuredClone(state),intents=rawIntents.map(x=>({...x})),moves=new Map(intents.map(x=>[x.riderId,x]))
 out.tick++
 const emit=(reason,otherId)=>out.events.push({tick:out.tick,reason,otherId:otherId??null})
 if(out.phase==='idle'){
  const choice=selectEarlyCorridorV3(riders,state.rearId,geometry)
  if(choice.candidates[0].blockingRiders===0){
   out.phase='active';out.targetY=choice.selectedY;out.originY=rear.y;out.remainingTicks=out.leaseTicks;out.metrics.granted++;emit('granted')
  }else {out.phase='declined';emit('not_clear')}
 }
 // Progress counters represent actual OBSERVED start-of-tick positions only.
 for(const [id,entry] of Object.entries(out.pending)){
  const other=byId.get(id)
  if(!other)continue
  if(entry.phase==='release'&&Math.abs(other.y-out.targetY)<=g.lateralCollisionM*.5){
   entry.phase='completed';entry.completedAtTick=out.tick;out.metrics.completed++;emit('rival_completed',id)
  }
 }
 const prev=new Map((out.previousRiders??[]).map(r=>[r.riderId,r]))
 function approaching(r,own){
  const history=prev.get(r.riderId),observedDy=history?r.y-history.y:0
  const commandedDy=own.targetY-r.y
  const dy=observedDy+commandedDy
  if((r.y-out.targetY)*dy>=0)return false
  const projected=own.targetY+Math.max(-g.centerStepM,Math.min(g.centerStepM,dy))
  const closeY=Math.abs(projected-out.targetY)<=g.lateralCollisionM+.05||Math.abs(own.targetY-out.targetY)<=g.lateralCollisionM+.05
  const dx=r.meters-rear.meters
  return closeY&&dx>=-8&&dx<=90
 }
 if(out.phase==='active'){
  let mustRelease=false
  for(const other of riders){
   if(other.riderId===state.rearId||other.riderId===state.leadId)continue
   const id=other.riderId,m=requested.get(id)
   if(!approaching(other,m))continue
   let pending=out.pending[id]
   if(!pending)pending=out.pending[id]={phase:'queued',queuedAtTick:out.tick,holds:0,lastRequestedY:m.targetY}
   pending.lastRequestedY=m.targetY
   if(!consent.has(id)){out.metrics.refusals++;emit('consent_refused',id);mustRelease=true;break}
   if(pending.holds<out.maxHoldTicks){
    // Only a consenting opponent may voluntarily hold. Demand is queued.
    moves.get(id).targetY=other.y
    pending.holds++
    out.metrics.holds++;emit('acknowledged_hold',id)
   }else{
    pending.phase='release';out.metrics.holdCapReached++;out.metrics.releases++;emit('release_priority',id)
    mustRelease=true;break
   }
  }
  if(!mustRelease){
   moves.get(state.rearId).targetY=r6(rear.y+Math.max(-g.centerStepM,Math.min(g.centerStepM,out.targetY-rear.y)))
   out.remainingTicks--
   if(out.remainingTicks<=0){out.phase='released';out.metrics.expires++;emit('lease_expired')}
  }else out.phase='releasing'
 }
 // No more opposing rider moves are overwritten once release is due. The
 // opting-in trailing rider voluntarily caps speed to leave a spatial gap.
 if(out.phase==='releasing'||out.phase==='released'){
  moves.get(state.rearId).targetY=rear.y
  const active=Object.entries(out.pending).filter(([,p])=>p.phase!=='completed')
  for(const [id,p] of active){
   const rival=byId.get(id),raw=requested.get(id)
   if(!rival||!raw)continue
   p.phase='release'
   const rearMove=moves.get(state.rearId),before=rearMove.forwardMeters
   const safe=Math.max(0,rival.meters+raw.forwardMeters-rear.meters-out.releaseGapM)
   rearMove.forwardMeters=r6(Math.min(before,safe))
   if(rearMove.forwardMeters<before-1e-6){out.metrics.gapCappedTicks++;emit('rear_forward_yield',id)}
  }
  // Finish when all rivals' queued changes have actually reached target.
  if(active.length===0&&Object.keys(out.pending).length>0){out.phase='completed';emit('all_rivals_released')}
  // An unacknowledged rival is allowed to proceed immediately.
  if(Object.keys(out.pending).length===0){out.phase='declined';emit('no_cooperative_reservation')}
 }
 out.previousRiders=riders.map(r=>({riderId:r.riderId,meters:r.meters,y:r.y}))
 check(intents.every(m=>m.riderId===state.rearId||requested.get(m.riderId).forwardMeters===m.forwardMeters),'Opponent power/forward commands were overridden')
 for(const m of intents){
  if(m.riderId===state.rearId)continue
  if(m.targetY!==requested.get(m.riderId).targetY){
   check(consent.has(m.riderId)&&out.pending[m.riderId]?.phase==='queued','Nonconsenting rider lateral intent overridden')
  }
 }
 return {state:out,intents}
}
