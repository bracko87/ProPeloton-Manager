/** Step32 OFFLINE ONLY: optional voluntarily reduced forward move for a
 * currently rejected Step31 swept-safe lane exit. Opponent commands unchanged.
 */
import {initializeObservedEscapeV3,advanceObservedEscapeV3} from './a2ObservedEscapeV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
const need=(yes,message)=>{if(!yes)throw Error(message)}
const ratios=[.90,.80,.70,.60,.50,.40,.30,.20,.10]
export function initializeBoundedSlotEscapeV3(){
 const state=initializeObservedEscapeV3()
 state.slot={version:1,attempts:0,accepted:0,rejected:0,safetyTrials:0,
  clippedForwardMeters:0,events:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
 return state
}
export function advanceBoundedSlotEscapeV3(snapshot,riders,intents,geometry){
 need(snapshot?.slot?.version===1&&snapshot.slot.officialWrites===0&&
 snapshot.slot.sportingApproval==='NOT_APPROVED','Invalid bounded slot checkpoint')
 const result=advanceObservedEscapeV3(snapshot,riders,intents,geometry)
 const state=result.state,slot=state.slot,esc=state.escape,last=esc.events.at(-1)
 if(esc.active||last?.tick!==state.tick||last.kind!=='escape_sweep_unsafe')return result
 const rear=riders.find(r=>r.riderId==='rear'),move=result.intents.find(m=>m.riderId==='rear')
 need(rear&&move,'Missing follower in slot research')
 const g=validateRoadScenarioV3(geometry),targetY=g.centerStepM
 if(Math.abs(rear.y)>1e-6)return result
 const cmd=new Map(result.intents.map(m=>[m.riderId,m]))
 const rivals=riders.filter(r=>r.riderId!=='rear').map(r=>{
  const m=cmd.get(r.riderId);need(m,'Missing active rival request')
  return {x0:r.meters,x1:r.meters+m.forwardMeters,y0:r.y,y1:m.targetY}
 })
 slot.attempts++
 for(const ratio of ratios){
  const forward=Math.round(move.forwardMeters*ratio*1e6)/1e6
  slot.safetyTrials++
  const path={x0:rear.meters,x1:rear.meters+forward,y0:rear.y,y1:targetY}
  if(rivals.some(v=>continuousBicycleCollisionV3(path,v,{longitudinal:1.8,lateral:g.lateralCollisionM})))continue
  const newIntents=result.intents.map(m=>m.riderId==='rear'?{...m,forwardMeters:forward,targetY}:m)
  const byId=new Map(intents.map(m=>[m.riderId,m]))
  for(const m of newIntents)if(m.riderId!=='rear'){
   const original=byId.get(m.riderId)
   need(original&&original.forwardMeters===m.forwardMeters&&original.targetY===m.targetY,'Unconsented rival command changed')
  }
  slot.accepted++;slot.clippedForwardMeters+=move.forwardMeters-forward
  slot.events.push({tick:state.tick,kind:'bounded_slot',rivalId:last.rivalId,ratio,forward,original:move.forwardMeters})
  esc.rejectedUnsafeExits--;esc.events.pop()
  esc.events.push({tick:state.tick,kind:'bounded_safe_exit',rivalId:last.rivalId,ratio})
  esc.active=true;esc.rivalId=last.rivalId;esc.sweptSafeExits++
  return {state,intents:newIntents,decision:'A32_SAFE_BOUNDED_SLOT'}
 }
 slot.rejected++;slot.events.push({tick:state.tick,kind:'slot_sweep_unsafe',rivalId:last.rivalId})
 return result
}
