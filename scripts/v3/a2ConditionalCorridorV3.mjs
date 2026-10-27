/** Offline A2 test only: conditional time-slot activation based on current
 * corridor occupancy and geometry. No access to future scripted intentions.
 * Actual moves are ALWAYS handled by the unchanged continuous 2D solver.
 */
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {selectEarlyCorridorV3} from './a2EarlyCorridorV3.mjs'
import {initializeTimedCorridorV3,advanceTimedCorridorV3} from './a2TimedCorridorV3.mjs'
const check=(test,message)=>{if(!test)throw Error(message)}
export function initializeConditionalCorridorV3({rearId='rear',leadId='lead',riskAheadM=60,observeRiskTicks=1,maxWaitTicks=8}={}){
 check(typeof rearId==='string'&&rearId!==leadId&&typeof leadId==='string'&&Number.isFinite(riskAheadM)&&riskAheadM>=30&&riskAheadM<=90&&Number.isInteger(observeRiskTicks)&&observeRiskTicks>=1&&observeRiskTicks<=2&&Number.isInteger(maxWaitTicks)&&maxWaitTicks>=3&&maxWaitTicks<=12,'Invalid conditional corridor settings')
 return {version:1,gate:'A2_CONDITIONAL_SLOTS_OFFLINE_ONLY',rearId,leadId,riskAheadM,observeRiskTicks,maxWaitTicks,policy:null,planner:null,
  riskExplanation:null,metrics:{fastStarts:0,watchStarts:0,eventsAfterStart:0},officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceConditionalCorridorV3(snapshot,riders,intents,geometry,{acknowledgedRiderIds=[]}={}){
 check(snapshot?.version===1&&snapshot.gate==='A2_CONDITIONAL_SLOTS_OFFLINE_ONLY'&&snapshot.officialWrites===0&&snapshot.sportingApproval==='NOT_APPROVED','Invalid conditional slot checkpoint')
 const g=validateRoadScenarioV3(geometry),next=structuredClone(snapshot)
 check(Array.isArray(riders)&&Array.isArray(intents)&&riders.length===intents.length&&riders.length>=2&&riders.length<=32,'Invalid conditional slot roster')
 if(next.policy===null){
  const rear=riders.find(r=>r.riderId===next.rearId)
  check(rear,'Missing conditional slot requester')
  const selected=selectEarlyCorridorV3(riders,next.rearId,geometry)
  // Current geometry only: someone less than two one-tick lateral steps
  // from the proposed track within a 60m (configurable) forward screen.
  // This checks possible contention, not a prediction of future commands.
  const hazards=riders.filter(r=>r.riderId!==next.rearId&&r.riderId!==next.leadId)
   .filter(r=>r.meters-rear.meters>=-1.8&&r.meters-rear.meters<=next.riskAheadM)
   .filter(r=>Math.abs(r.y-selected.selectedY)<=2*g.centerStepM+1e-6)
   .map(r=>r.riderId).sort()
  const initialWatch=selected.candidates[0].blockingRiders>0||hazards.length>0
  next.policy=initialWatch?'watch':'fast'
  next.metrics[initialWatch?'watchStarts':'fastStarts']++
  next.riskExplanation={selectedY:selected.selectedY,initialBlockers:selected.candidates[0].blockingRiders,hazards,riskAheadM:next.riskAheadM}
  next.planner=initializeTimedCorridorV3({rearId:next.rearId,leadId:next.leadId,mode:'rival_first',
   observeTicks:initialWatch?next.observeRiskTicks:0,maxWaitTicks:next.maxWaitTicks})
 }
 const before=next.planner.metrics.detectedConflicts
 const result=advanceTimedCorridorV3(next.planner,riders,intents,geometry,{acknowledgedRiderIds})
 next.planner=result.state
 next.metrics.eventsAfterStart+=result.state.metrics.detectedConflicts-before
 return {state:next,intents:result.intents}
}
