/** A2 OFFLINE ONLY: a bounded, voluntary hold in an initially clear outer
 * lane when another cyclist submits a current-tick crossing request.
 *
 * Strictly retains all non-requesting riders' intents; physics resolves
 * collision sweeps, energy and actual movement. No official game writes.
 */
import {initializeCurrentLaneFirstV3,advanceCurrentLaneFirstV3} from './a2CurrentLaneFirstV3.mjs'
const assert=(yes,message)=>{if(!yes)throw Error(message)}
export function initializeBoundedLaneReleaseV3({maxHoldTicks=1,mode='hold_lane'}={}){
 assert(Number.isInteger(maxHoldTicks)&&maxHoldTicks>=1&&maxHoldTicks<=3&&mode==='hold_lane','Invalid bounded release setup')
 return {version:1,gate:'A2_OFFLINE_BOUNDED_LANE_RELEASE',maxHoldTicks,mode,tick:0,
  inner:initializeCurrentLaneFirstV3({outerLaneOnly:true}),
  holdingForTicks:0,metrics:{heldTicks:0,exhausted:0,releaseTicks:0,fallbacks:0,currentLaneTicks:0,
   nonconsentingChanges:0},events:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceBoundedLaneReleaseV3(snapshot,riders,intents,geometry){
 assert(snapshot?.version===1&&snapshot.gate==='A2_OFFLINE_BOUNDED_LANE_RELEASE'&&snapshot.officialWrites===0&&
 snapshot.sportingApproval==='NOT_APPROVED'&&Array.isArray(riders)&&Array.isArray(intents)&&riders.length===intents.length,
 'Invalid bounded release checkpoint')
 const next=structuredClone(snapshot);next.tick++
 const original=new Map(intents.map(i=>[i.riderId,i]))
 const r=riders.find(x=>x.riderId==='rear'),lead=riders.find(x=>x.riderId==='lead')
 assert(r&&lead&&original.size===riders.length&&original.has('rear'),'Missing bounded release pair')
 const response=advanceCurrentLaneFirstV3(next.inner,riders,intents,geometry)
 next.inner=response.state
 const event=response.state.eventLog.at(-1)
 const hazards=event?.hazards??[]
 const crossing=event?.action==='fallback'&&hazards.some(id=>id!=='lead')
 const eligible=response.state.initialOuterLaneEligible===true&&Math.abs(r.y)<1e-7&&Math.abs(r.y-lead.y)>1e-7
 if(eligible&&crossing&&next.holdingForTicks<next.maxHoldTicks){
  // The rear rider alone volunteers to remain on its CURRENT track. We do
  // not presume the rival will yield, or alter any opponent motion request.
  const moves=response.intents.map(m=>m.riderId==='rear'?{...m,targetY:r.y}:m)
  next.holdingForTicks++
  next.metrics.heldTicks++;next.events.push({tick:next.tick,kind:'voluntary_stay',hazards:[...hazards].sort()})
  for(const m of moves)if(m.riderId!=='rear'){
   const before=original.get(m.riderId)
   assert(m.targetY===before.targetY&&m.forwardMeters===before.forwardMeters,'Unacknowledged rider instruction changed')
  }
  return {state:next,intents:moves,decision:'VOLUNTARY_BOUNDED_STAY'}
 }
 if(eligible&&crossing&&next.holdingForTicks>=next.maxHoldTicks){
  next.metrics.exhausted++;next.events.push({tick:next.tick,kind:'hold_cap_reached'})
 }else if(!crossing&&next.holdingForTicks>0){
  next.metrics.releaseTicks++;next.events.push({tick:next.tick,kind:'hazard_cleared'})
 }
 next.holdingForTicks=0
 if(response.decision==='STAY_CURRENT_CLEAR_LANE')next.metrics.currentLaneTicks++
 else next.metrics.fallbacks++
 for(const m of response.intents)if(m.riderId!=='rear'){
  const before=original.get(m.riderId)
  if(m.targetY!==before.targetY||m.forwardMeters!==before.forwardMeters)next.metrics.nonconsentingChanges++
 }
 assert(next.metrics.nonconsentingChanges===0,'Unacknowledged rider instruction changed')
 return {state:next,intents:response.intents,decision:response.decision}
}
