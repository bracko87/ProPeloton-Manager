/** A2 OFFLINE research: observable lane-claim switching, not future prediction.
 * Both planners advance as read-only counterfactual planners from the SAME
 * observed state; the selected intent alone enters the unchanged physical
 * collision and finite-energy resolver. No coercion of other riders.
 */
import {initializeBoundedLaneReleaseV3,advanceBoundedLaneReleaseV3} from './a2BoundedLaneReleaseV3.mjs'
import {initializeIntentAwareCorridorV3,advanceIntentAwareCorridorV3} from './a2IntentAwareCorridorV3.mjs'
import {initializeCurrentLaneFirstV3,advanceCurrentLaneFirstV3} from './a2CurrentLaneFirstV3.mjs'
const check=(x,m)=>{if(!x)throw Error(m)}
export function initializeActiveClaimSwitchV3({mode='active_only'}={}){
 check(['active_only','latched'].includes(mode),'Invalid active claim mode')
 return {version:1,gate:'A2_ACTIVE_CLAIM_SWITCH_OFFLINE_ONLY',mode,tick:0,latched:false,
  guarded:initializeCurrentLaneFirstV3({outerLaneOnly:true}),
  bounded:initializeBoundedLaneReleaseV3({maxHoldTicks:1}),
  baseline:initializeIntentAwareCorridorV3(),
  metrics:{activeClaims:0,activeSwitches:0,guardTicks:0,baselineTicks:0,latchTicks:0,otherRiderChanges:0},
  actions:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceActiveClaimSwitchV3(snapshot,riders,intents,geometry){
 check(snapshot?.version===1&&snapshot.gate==='A2_ACTIVE_CLAIM_SWITCH_OFFLINE_ONLY'&&snapshot.officialWrites===0&&snapshot.sportingApproval==='NOT_APPROVED'&&
 Array.isArray(riders)&&Array.isArray(intents)&&riders.length===intents.length&&riders.length>=2&&riders.length<=32,
 'Invalid active claim checkpoint')
 const next=structuredClone(snapshot);next.tick++
 const r=riders.find(x=>x.riderId==='rear'),lead=riders.find(x=>x.riderId==='lead')
 check(r&&lead,'Missing passing pair')
 // All candidate policies see identical actual observed positions and current
 // commands. Alternative hypothetical movements are NEVER fed back into the
 // unselected planners or used as alleged knowledge of the future.
 const guard=advanceCurrentLaneFirstV3(next.guarded,riders,intents,geometry)
 const bound=advanceBoundedLaneReleaseV3(next.bounded,riders,intents,geometry)
 const base=advanceIntentAwareCorridorV3(next.baseline,riders,intents,geometry)
 next.guarded=guard.state;next.bounded=bound.state;next.baseline=base.state
 const hazards=guard.state.eventLog.at(-1)?.hazards??[]
 const requested=new Map(intents.map(x=>[x.riderId,x])),byId=new Map(riders.map(x=>[x.riderId,x]))
 check(requested.size===riders.length&&byId.size===riders.length,'Duplicate rider IDs')
 const active=hazards.filter(id=>{
  if(id==='lead')return false
  const rider=byId.get(id),cmd=requested.get(id)
  return rider&&cmd&&Math.abs(cmd.targetY-rider.y)>1e-6&&cmd.targetY<rider.y
 }).sort()
 const eligible=guard.state.initialOuterLaneEligible===true
 const activeClaim=eligible&&active.length>0
 if(activeClaim){next.metrics.activeClaims++;if(!next.latched)next.metrics.activeSwitches++}
 if(activeClaim&&next.mode==='latched')next.latched=true
 const useBaseline=activeClaim||next.mode==='latched'&&next.latched
 const chosen=useBaseline?base:guard
 if(useBaseline)next.metrics.baselineTicks++;else next.metrics.guardTicks++
 if(next.mode==='latched'&&next.latched)next.metrics.latchTicks++
 const original=new Map(intents.map(x=>[x.riderId,x]))
 for(const m of chosen.intents)if(m.riderId!=='rear'){
  const prior=original.get(m.riderId)
  if(!prior||m.forwardMeters!==prior.forwardMeters||m.targetY!==prior.targetY)next.metrics.otherRiderChanges++
 }
 check(next.metrics.otherRiderChanges===0,'Nonconsenting opponent command altered')
 next.actions.push({tick:next.tick,decision:useBaseline?'BASELINE':'CURRENT_LANE',active,eligible,
  rivalCount:active.length})
 return {state:next,intents:chosen.intents,decision:useBaseline?'OBSERVED_ACTIVE_BASELINE':'CURRENT_LANE_GUARD'}
}
