/** Research-only A2: current-intent short-slot corridor scheduling.
 * No future intent access, no coercion of nonconsenting riders, no physics edits.
 * This scheduler may reject or delay the voluntary passing request; every
 * movement is still enforced by the existing continuous swept-collision model.
 */
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {selectEarlyCorridorV3} from './a2EarlyCorridorV3.mjs'
const ok=(v,message)=>{if(!v)throw Error(message)}
const r6=n=>Math.round(n*1e6)/1e6
export function initializeTimedCorridorV3({rearId='rear',leadId='lead',mode='rival_first',observeTicks=1,maxWaitTicks=8,maxHoldTicks=1}={}){
 ok(typeof rearId==='string'&&rearId.length>0&&typeof leadId==='string'&&leadId!==rearId&&['rival_first','pass_first'].includes(mode)&&
  Number.isInteger(observeTicks)&&observeTicks>=0&&observeTicks<=2&&Number.isInteger(maxWaitTicks)&&maxWaitTicks>=3&&maxWaitTicks<=12&&
  Number.isInteger(maxHoldTicks)&&maxHoldTicks>=0&&maxHoldTicks<=2,'Invalid timed corridor policy')
 return {version:1,gate:'A2_TIMED_CORRIDOR_OFFLINE_ONLY',rearId,leadId,mode,observeTicks,maxWaitTicks,maxHoldTicks,tick:0,
  phase:'observe',targetY:null,pendingRivalId:null,pendingFinalY:null,waitTicks:0,holdsUsed:0,previous:[],
  metrics:{detectedConflicts:0,rivalFirst:0,passFirst:0,consentHolds:0,refusals:0,passSlotsStarted:0,secondLaneSelections:0,
   timedOut:0,rivalCompleted:0,otherRidersOverriddenWithoutConsent:0},
  events:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceTimedCorridorV3(state,riders,requested,geometry,{acknowledgedRiderIds=[]}={}){
 ok(state?.version===1&&state.gate==='A2_TIMED_CORRIDOR_OFFLINE_ONLY'&&state.officialWrites===0&&state.sportingApproval==='NOT_APPROVED','Invalid timed corridor checkpoint')
 ok(Array.isArray(riders)&&riders.length>=2&&riders.length<=32&&Array.isArray(requested)&&requested.length===riders.length&&Array.isArray(acknowledgedRiderIds),'Invalid timed corridor frame')
 const g=validateRoadScenarioV3(geometry),byId=new Map(riders.map(r=>[r.riderId,r])),intents=new Map(requested.map(r=>[r.riderId,r])),consent=new Set(acknowledgedRiderIds)
 ok(byId.size===riders.length&&intents.size===riders.length&&riders.every(r=>intents.has(r.riderId)&&Number.isFinite(r.meters)&&Number.isFinite(r.y)),'Invalid timed corridor identities')
 const rear=byId.get(state.rearId),lead=byId.get(state.leadId)
 ok(rear&&lead,'Missing passing pair')
 const next=structuredClone(state);next.tick++
 const moves=requested.map(r=>({...r})),mut=new Map(moves.map(r=>[r.riderId,r]))
 const event=(kind,id=null)=>next.events.push({tick:next.tick,kind,riderId:id})
 const previous=new Map(state.previous.map(r=>[r.riderId,r]))
 const threats=[]
 for(const rider of riders){
  if(rider.riderId===state.rearId||rider.riderId===state.leadId)continue
  const m=intents.get(rider.riderId),p=previous.get(rider.riderId)
  const actualDelta=p?rider.y-p.y:0,commanded=m.targetY-rider.y
  // No prediction of unannounced target positions: only one adjacent
  // announced step and already-observed lateral velocity.
  const movingLeft=commanded< -1e-6||actualDelta< -1e-6
  const dx=rider.meters-rear.meters
  if(movingLeft&&dx>=-8&&dx<=90&&rider.y>=g.centerStepM*.5&&m.targetY<rider.y+1e-8)
   threats.push(rider.riderId)
 }
 if(next.phase==='observe'){
  mut.get(state.rearId).targetY=rear.y
  if(next.tick>next.observeTicks){
   const choice=selectEarlyCorridorV3(riders,state.rearId,geometry)
   next.targetY=choice.selectedY
   next.phase='passing'
   next.metrics.passSlotsStarted++;event('initial_corridor_selected')
  }
 }
 if(threats.length&&['observe','passing','pass_first'].includes(next.phase)){
  const id=threats.slice().sort()[0],other=byId.get(id)
  // A new observed contender overrides an earlier uncommitted slot.
  if(next.pendingRivalId!==id){
   next.pendingRivalId=id;next.pendingFinalY=0;next.waitTicks=0;next.holdsUsed=0
   next.metrics.detectedConflicts++;event('contested',id)
  }
  if(next.mode==='pass_first'&&consent.has(id)&&next.holdsUsed<next.maxHoldTicks){
   mut.get(id).targetY=other.y;next.holdsUsed++;next.phase='pass_first'
   next.metrics.consentHolds++;next.metrics.passFirst++;event('voluntary_hold',id)
  }else{
   if(!consent.has(id))next.metrics.refusals++
   next.phase='rival_first';next.metrics.rivalFirst++;event('rival_priority',id)
  }
 }
 // Rival always continues its submitted intent after consent expires.
 if(next.phase==='rival_first'){
  next.waitTicks++
  mut.get(state.rearId).targetY=rear.y
  const id=next.pendingRivalId,rival=byId.get(id)
  // Never command the opponent. Keep passing rider in original lane.
  // Limit a voluntary follower's closure while a rider crosses the lane.
  // This is NOT collision clearance: underlying solver handles all sweeps.
  if(rival){
   const carrier=mut.get(state.rearId)
   const maxForward=Math.max(0,rival.meters+intents.get(id).forwardMeters-rear.meters-4)
   carrier.forwardMeters=r6(Math.min(carrier.forwardMeters,maxForward))
   if(rival.y<=g.centerStepM*.5&&Math.abs(intents.get(id).targetY-rival.y)<=g.centerStepM*.5){
    next.metrics.rivalCompleted++;event('rival_lane_complete',id)
    next.phase='select_after'
   }
  }else next.phase='declined'
  if(next.waitTicks>next.maxWaitTicks&&next.phase!=='select_after'){
   next.phase='declined';next.metrics.timedOut++;event('wait_timeout',id)
  }
 }
 if(next.phase==='pass_first'){
  // Same current-tick data and bounded consenting hold as the old lease.
  mut.get(state.rearId).targetY=r6(rear.y+Math.max(-g.centerStepM,Math.min(g.centerStepM,next.targetY-rear.y)))
 }
 if(next.phase==='select_after'){
  const id=next.pendingRivalId,rival=byId.get(id)
  // Select AFTER a rival's actual completed maneuver; rank the adjacent
  // lanes against ALL observed riders within up to 40m. Where the rival
  // remains farther ahead, avoid its current occupied lane explicitly.
  const pick=selectEarlyCorridorV3(riders,state.rearId,geometry,{lookaheadMeters:40})
  const candidates=pick.candidates.filter(c=>!rival||Math.abs(c.targetY-rival.y)>=g.lateralCollisionM+.05)
  const safe=candidates.find(c=>c.blockingRiders===0)
  if(safe){next.targetY=safe.targetY;next.phase='passing';next.metrics.secondLaneSelections++;event('fresh_pass_lane',id)}
  else {next.phase='declined';event('no_safe_alternative',id)}
 }
 if(next.phase==='passing'){
  const desired=next.targetY
  if(desired!==null&&Math.abs(desired-rear.y)<=g.centerStepM+1e-6)
   mut.get(state.rearId).targetY=r6(desired)
  else if(desired!==null)mut.get(state.rearId).targetY=r6(rear.y+Math.sign(desired-rear.y)*g.centerStepM)
 }
 if(next.phase==='declined')mut.get(state.rearId).targetY=rear.y
 // No future decisions, no unintended opponent forward overrides.
 for(const m of moves){
  if(m.riderId===state.rearId)continue
  const original=intents.get(m.riderId)
  ok(m.forwardMeters===original.forwardMeters,'Other rider forward intent changed')
  if(m.targetY!==original.targetY)
   ok(consent.has(m.riderId)&&next.phase==='pass_first'&&next.holdsUsed<=next.maxHoldTicks,'Unacknowledged other rider was controlled')
 }
 next.previous=riders.map(r=>({riderId:r.riderId,meters:r.meters,y:r.y}))
 return {state:next,intents:moves}
}
