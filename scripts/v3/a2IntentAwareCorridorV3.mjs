/** A2 OFFLINE micro research: screen *communicated* lateral intent, not mere
 * proximity. No future-intent access. The unchanged time-slot scheduler still
 * reacts to a subsequent newly signaled lane approach, while the unchanged
 * swept collision solver has the final authority over every 10-second move.
 */
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {selectEarlyCorridorV3} from './a2EarlyCorridorV3.mjs'
import {initializeTimedCorridorV3,advanceTimedCorridorV3} from './a2TimedCorridorV3.mjs'
const ensure=(v,m)=>{if(!v)throw Error(m)}
export function initializeIntentAwareCorridorV3({rearId='rear',leadId='lead',riskAheadM=60,observeRiskTicks=1,maxWaitTicks=8}={}){
 ensure(typeof rearId==='string'&&rearId.length>0&&typeof leadId==='string'&&leadId.length>0&&rearId!==leadId&&
  Number.isFinite(riskAheadM)&&riskAheadM>=30&&riskAheadM<=90&&Number.isInteger(observeRiskTicks)&&observeRiskTicks>=1&&observeRiskTicks<=2&&
  Number.isInteger(maxWaitTicks)&&maxWaitTicks>=3&&maxWaitTicks<=12,'Invalid intent-aware corridor settings')
 return {version:1,gate:'A2_INTENT_AWARE_OFFLINE_ONLY',rearId,leadId,riskAheadM,observeRiskTicks,maxWaitTicks,
  policy:null,planner:null,initialScreen:null,
  metrics:{fastStarts:0,watchStarts:0,activeHazards:0,nearbyNoIntent:0,lateSignaledConflicts:0},
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceIntentAwareCorridorV3(snapshot,riders,intents,geometry,{acknowledgedRiderIds=[]}={}){
 ensure(snapshot?.version===1&&snapshot.gate==='A2_INTENT_AWARE_OFFLINE_ONLY'&&snapshot.officialWrites===0&&snapshot.sportingApproval==='NOT_APPROVED','Invalid intent-aware checkpoint')
 const g=validateRoadScenarioV3(geometry),next=structuredClone(snapshot)
 ensure(Array.isArray(riders)&&Array.isArray(intents)&&riders.length>=2&&riders.length<=32&&riders.length===intents.length&&
  Array.isArray(acknowledgedRiderIds),'Invalid intent-aware roster')
 const byId=new Map(riders.map(r=>[r.riderId,r])),motion=new Map(intents.map(m=>[m.riderId,m]))
 ensure(byId.size===riders.length&&motion.size===riders.length&&riders.every(r=>Number.isFinite(r.meters)&&Number.isFinite(r.y)&&motion.has(r.riderId)),'Duplicate or missing intention')
 const rear=byId.get(next.rearId),lead=byId.get(next.leadId)
 ensure(rear&&lead,'Missing passing rider')
 if(next.policy===null){
  const choice=selectEarlyCorridorV3(riders,next.rearId,geometry)
  const nearby=[],active=[]
  for(const rider of riders.slice().sort((a,b)=>a.riderId.localeCompare(b.riderId))){
   if([next.rearId,next.leadId].includes(rider.riderId))continue
   const deltaX=rider.meters-rear.meters,deltaY=choice.selectedY-rider.y
   if(deltaX< -1.8||deltaX>next.riskAheadM||Math.abs(deltaY)>2*g.centerStepM+1e-6)continue
   nearby.push(rider.riderId)
   const submitted=motion.get(rider.riderId),step=submitted.targetY-rider.y
   // At entry, the only signal is the current *communicated* lateral step.
   // Keep possible inactive hazards in the logs, but never infer a future
   // change from their mere proximity. This is not an assurance of safety.
   if(Math.abs(step)>1e-6&&step*deltaY>0)active.push(rider.riderId)
  }
  const watch=choice.candidates[0].blockingRiders>0||active.length>0
  next.policy=watch?'watch':'fast'
  next.metrics[watch?'watchStarts':'fastStarts']++
  next.metrics.activeHazards+=active.length
  next.metrics.nearbyNoIntent+=nearby.length-active.length
  next.initialScreen={selectedY:choice.selectedY,blockedInitially:choice.candidates[0].blockingRiders>0,
   nearby,active,riskAheadM:next.riskAheadM}
  next.planner=initializeTimedCorridorV3({rearId:next.rearId,leadId:next.leadId,mode:'rival_first',
   observeTicks:watch?next.observeRiskTicks:0,maxWaitTicks:next.maxWaitTicks})
 }
 const oldConflicts=next.planner.metrics.detectedConflicts
 const value=advanceTimedCorridorV3(next.planner,riders,intents,geometry,{acknowledgedRiderIds})
 next.planner=value.state
 next.metrics.lateSignaledConflicts+=value.state.metrics.detectedConflicts-oldConflicts
 return {state:next,intents:value.intents}
}
