/** V3 A2 Step31 OFFLINE micro research: an observed, no-coercion escape
 * from a closing outer lane. The only modified instruction is the follower's;
 * existing continuous swept-path collision physics remains authoritative.
 * Not applied to live racing or stage simulation.
 */
import {initializeActiveClaimSwitchV3,advanceActiveClaimSwitchV3} from './a2ActiveClaimSwitchV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const assert=(value,message)=>{if(!value)throw Error(message)}
const epsilon=1e-6
export function initializeObservedEscapeV3(){
 const state=initializeActiveClaimSwitchV3({mode:'signal_memory_3'})
 state.escape={version:1,rivalId:null,active:false,
  observedTriggers:0,sweptSafeExits:0,heldAdjacentTicks:0,
  rejectedUnsafeExits:0,releasedAfterClearance:0,otherIntentChanges:0,
  events:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
 return state
}
export function advanceObservedEscapeV3(snapshot,riders,intents,geometry){
 assert(snapshot?.escape?.version===1&&snapshot.escape.officialWrites===0&&
  snapshot.escape.sportingApproval==='NOT_APPROVED','Invalid escape checkpoint')
 const chosen=advanceActiveClaimSwitchV3(snapshot,riders,intents,geometry),state=chosen.state
 const esc=state.escape,g=validateRoadScenarioV3(geometry),c=g.centerStepM
 const byId=new Map(riders.map(x=>[x.riderId,x]))
 const supplied=new Map(intents.map(x=>[x.riderId,x]))
 const original=new Map(chosen.intents.map(x=>[x.riderId,x]))
 const rear=byId.get('rear'),lead=byId.get('lead')
 assert(rear&&lead&&original.size===riders.length&&supplied.size===riders.length,'Incomplete escape roster')
 // No fixture names or future movement labels are visible to this policy.
 // Keep an entered adjacent lane only while the initially observed rival
 // remains ahead or within 12m behind; then release the extra condition.
 if(esc.active){
  const rival=byId.get(esc.rivalId)
  if(!rival||rear.meters-rival.meters>12){
   esc.active=false;esc.rivalId=null;esc.releasedAfterClearance++
   esc.events.push({tick:state.tick,kind:'rival_cleared'})
  }
 }
 let contender=null
 if(!esc.active&&Math.abs(rear.y)<epsilon&&Math.abs(lead.y-c)<c*.1&&
    state.guarded.initialOuterLaneEligible===false){
  const advancing=riders.filter(x=>x.riderId!=='rear'&&x.riderId!=='lead')
   .filter(x=>x.meters-rear.meters>=0&&x.meters-rear.meters<=35)
   .filter(x=>x.y>c*.5&&x.y<=2*c+epsilon)
   .filter(x=>supplied.get(x.riderId).targetY<x.y-epsilon)
   .sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))
  contender=advancing[0]??null
 }
 if(contender)esc.observedTriggers++
 if(esc.active||contender){
  const toY=esc.active?rear.y:c
  const rearRequest=original.get('rear')
  const candidate={...rearRequest,targetY:toY}
  assert(Math.abs(toY-rear.y)<=c+epsilon,'Overlong escape lateral move')
  const own={x0:rear.meters,x1:rear.meters+candidate.forwardMeters,y0:rear.y,y1:toY}
  const unsafe=riders.some(other=>{
   if(other.riderId==='rear')return false
   const m=original.get(other.riderId)
   return continuousBicycleCollisionV3(own,
    {x0:other.meters,x1:other.meters+m.forwardMeters,y0:other.y,y1:m.targetY},
    {longitudinal:1.8,lateral:g.lateralCollisionM})
  })
  if(!unsafe){
   // The opponent's desired path is NEVER rewritten.
   const rewritten=chosen.intents.map(m=>m.riderId==='rear'?candidate:m)
   for(const m of rewritten)if(m.riderId!=='rear'){
    const old=supplied.get(m.riderId)
    if(m.forwardMeters!==old.forwardMeters||m.targetY!==old.targetY)esc.otherIntentChanges++
   }
   assert(esc.otherIntentChanges===0,'Other rider command changed')
   if(contender&&!esc.active){
    esc.rivalId=contender.riderId;esc.active=true;esc.sweptSafeExits++
    esc.events.push({tick:state.tick,kind:'observed_exit',rivalId:contender.riderId})
   }else if(esc.active)esc.heldAdjacentTicks++
   return {state,intents:rewritten,decision:contender?'OBSERVED_SAFE_ESCAPE':'ESCAPE_LANE_STAY'}
  }
  esc.rejectedUnsafeExits++
  esc.events.push({tick:state.tick,kind:'escape_sweep_unsafe',rivalId:esc.rivalId??contender?.riderId??null})
 }
 return {...chosen,state}
}
