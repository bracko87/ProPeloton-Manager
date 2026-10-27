/** A2 OFFLINE MICRO RESEARCH: current-lane-first passing feasibility.
 * Pure intent adapter, not a collision engine. Keeps the faster cyclist in
 * an already separated current lane when there is no CURRENTLY SUBMITTED
 * conflicting trajectory; otherwise uses the unchanged legacy intent-aware
 * time slot planner. Nonconsenting rivals' instructions are never modified.
 */
import {validateRoadScenarioV3} from './roadWidthLookaheadV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {initializeIntentAwareCorridorV3,advanceIntentAwareCorridorV3} from './a2IntentAwareCorridorV3.mjs'
const check=(cond,msg)=>{if(!cond)throw Error(msg)}
export function initializeCurrentLaneFirstV3({rearId='rear',leadId='lead',lookaheadMeters=60,outerLaneOnly=false}={}){
 check(typeof rearId==='string'&&rearId.length>0&&typeof leadId==='string'&&leadId.length>0&&rearId!==leadId&&
 Number.isFinite(lookaheadMeters)&&lookaheadMeters>=30&&lookaheadMeters<=90&&typeof outerLaneOnly==='boolean','Invalid current-lane-first init')
 return {version:1,gate:'A2_CURRENT_LANE_FIRST_OFFLINE_ONLY',rearId,leadId,lookaheadMeters,outerLaneOnly,initialOuterLaneEligible:null,tick:0,
  legacy:initializeIntentAwareCorridorV3({rearId,leadId}),metrics:{stayTicks:0,fallbackTicks:0,stayFirstTicks:0,blockedSameLaneTicks:0,
   observedConflictingIntentTicks:0,legacyInitializations:0,changedOpponentIntents:0},
  eventLog:[],officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
export function advanceCurrentLaneFirstV3(state,riders,intents,geometry,{acknowledgedRiderIds=[]}={}){
 check(state?.version===1&&state.gate==='A2_CURRENT_LANE_FIRST_OFFLINE_ONLY'&&state.officialWrites===0&&
 state.sportingApproval==='NOT_APPROVED'&&Array.isArray(riders)&&Array.isArray(intents)&&riders.length===intents.length&&
 riders.length>=2&&riders.length<=32&&Array.isArray(acknowledgedRiderIds),'Invalid current-lane-first checkpoint')
 const g=validateRoadScenarioV3(geometry),byId=new Map(riders.map(x=>[x.riderId,x])),moves=new Map(intents.map(x=>[x.riderId,x]))
 check(byId.size===riders.length&&moves.size===riders.length&&riders.every(r=>moves.has(r.riderId)&&Number.isFinite(r.meters)&&Number.isFinite(r.y)),
  'Invalid current-lane-first roster')
 const rear=byId.get(state.rearId),lead=byId.get(state.leadId),rearMove=moves.get(state.rearId)
 check(rear&&lead&&rearMove&&Number.isFinite(rearMove.forwardMeters),'Missing requested passing pair')
 const result=structuredClone(state);result.tick++
 // No unnecessary sideways excursion when the target rider is already
 // laterally separated. If a rival's CURRENT communicated sweep contests
 // the route, hand control to the unchanged reactive time-slot policy.
 const sameLane=Math.abs(rear.y-lead.y)<g.lateralCollisionM+1e-7
 const own={x0:rear.meters,x1:rear.meters+rearMove.forwardMeters,y0:rear.y,y1:rear.y}
 const hazards=[]
 for(const r of riders){
  if(r.riderId===state.rearId)continue
  const instruction=moves.get(r.riderId)
  check(instruction&&Number.isFinite(instruction.forwardMeters)&&Number.isFinite(instruction.targetY),'Incomplete current lane intent')
  const dx=r.meters-rear.meters
  if(dx < -10||dx>result.lookaheadMeters)continue
  const theirs={x0:r.meters,x1:r.meters+instruction.forwardMeters,y0:r.y,y1:instruction.targetY}
  if(continuousBicycleCollisionV3(own,theirs,{longitudinal:1.8,lateral:g.lateralCollisionM}))hazards.push(r.riderId)
 }
 if(result.tick===1)result.initialOuterLaneEligible=Math.abs(rear.y)<1e-7&&!sameLane
 const currentLaneFeasible=(!state.outerLaneOnly||(result.initialOuterLaneEligible===true&&Math.abs(rear.y)<1e-7))&&!sameLane&&hazards.length===0
 if(currentLaneFeasible){
  const output=intents.map(x=>x.riderId===state.rearId?{...x,targetY:rear.y}:{...x})
  result.metrics.stayTicks++
  if(result.tick===1)result.metrics.stayFirstTicks++
  result.eventLog.push({tick:result.tick,action:'stay',hazards:[]})
  return {state:result,intents:output,decision:'STAY_CURRENT_CLEAR_LANE'}
 }
 if(sameLane)result.metrics.blockedSameLaneTicks++
 if(hazards.length)result.metrics.observedConflictingIntentTicks++
 const response=advanceIntentAwareCorridorV3(result.legacy,riders,intents,geometry,{acknowledgedRiderIds})
 if(result.legacy.policy===null)result.metrics.legacyInitializations++
 result.legacy=response.state;result.metrics.fallbackTicks++
 for(const instruction of response.intents){
  if(instruction.riderId===state.rearId)continue
  const old=moves.get(instruction.riderId)
  if(instruction.targetY!==old.targetY||instruction.forwardMeters!==old.forwardMeters){
   result.metrics.changedOpponentIntents++
   check(acknowledgedRiderIds.includes(instruction.riderId),'Nonconsenting rider modified')
  }
 }
 result.eventLog.push({tick:result.tick,action:'fallback',hazards:hazards.sort(),sameLane})
 return {state:result,intents:response.intents,decision:'LEGACY_CONFLICT_FALLBACK'}
}
