/** Batch 41 OFFLINE coordinated continuous-lane reservations.
 * The race itself is never modified; all paths use provisional bicycle geometry.
 * Proposals are selected from currently-observed motion, not future frames.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {validateRoadScenarioV3,predictClearCorridorV3,beginRoadCorridorV3,stepRoadCorridorV3} from './roadWidthLookaheadV3.mjs'
import {pairedOneTickLanePreparationV3} from './wheelReservationAttributionV3.mjs'
const ok=(x,m)=>{if(!x)throw Error(m)}
const round=x=>Math.round(x*1e6)/1e6
export function createCorridorCoordinatorV3({geometry,capacity=2,forecast=true,lanes=4,steeringTicks=3}={}){
 const g=validateRoadScenarioV3(geometry,lanes)
 ok([1,2,3].includes(capacity)&&typeof forecast==='boolean'&&[3,4].includes(steeringTicks),'Invalid coordination policy')
 return {version:41,geometry:g.id,capacity,forecast,lanes,steeringTicks,active:[],waiting:[],stats:{decisions:0,admitted:0,blockedByCapacity:0,reservationConflicts:0,forecastVetoes:0,sourceRejections:0,physicalCollisions:0,mutualConflicts:0,insufficientEnergy:0,completed:0,validNextTick:0,invalidNextTick:0,movementChanges:0,blockedStatusChanges:0,candidateForwardDeltaM:0,completedExtraJ:0,maxConcurrent:0,multiConcurrentTicks:0,unspentProposals:0},examples:[]}
}
function afterProgress(s,n){
 if(s.phase==='reaction')return {a:s.progress,b:s.reactionLeft===1?s.progress:s.progress}
 if(s.phase==='steering')return {a:s.progress,b:Math.min(1,s.progress+1/s.steeringTicks)}
 return {a:1,b:1}
}
function y(s,progress,g){return (s.candidate.fromLane+(s.candidate.toLane-s.candidate.fromLane)*progress)*g.centerStepM}
function nowPath(s,positions,g){
 const r=positions.get(s.candidate.riderId)
 ok(r,'Missing reservation rider')
 const p=afterProgress(s)
 return {x0:r.oldMeters??r.meters,x1:r.meters,y0:y(s,p.a,g),y1:y(s,p.b,g)}
}
function pairHit(a,b,g){return continuousBicycleCollisionV3(a,b,{longitudinal:1.8,lateral:g.lateralCollisionM})}
function predictY(s,step){
 const reaction=s.phase==='reaction'?s.reactionLeft:0
 const current=s.progress
 const passed=Math.max(0,step-reaction)
 const p0=Math.min(1,current+Math.max(0,passed-1)/s.steeringTicks)
 const p1=Math.min(1,current+passed/s.steeringTicks)
 return [p0,p1]
}
function conflictsWithExisting(candidate,currentlyActive,atEnd,g,dt){
 // Reservation forecasts use only current source state and velocity; no future look.
 const end=new Map(atEnd.map(x=>[x.riderId,x]))
 const rider=end.get(candidate.candidate.riderId)
 ok(rider,'Missing proposed rider')
 for(const other of currentlyActive){
  if(other.candidate.riderId===candidate.candidate.riderId)return true
  const rival=end.get(other.candidate.riderId)
  ok(rival,'Missing active candidate in source')
  for(let j=1;j<=5;j++){
   const [a0,a1]=predictY(candidate,j),[b0,b1]=predictY(other,j)
   const a={x0:rider.meters+rider.speedMps*dt*(j-1),x1:rider.meters+rider.speedMps*dt*j,y0:y(candidate,a0,g),y1:y(candidate,a1,g)}
   const b={x0:rival.meters+rival.speedMps*dt*(j-1),x1:rival.meters+rival.speedMps*dt*j,y0:y(other,b0,g),y1:y(other,b1,g)}
   if(pairHit(a,b,g))return true
  }
 }
 return false
}
function rejectCount(stats,reason){
 if(reason==='continuous_collision')stats.physicalCollisions++
 else if(reason==='finite_wprime_budget')stats.insufficientEnergy++
 else stats.sourceRejections++
}
export function advanceCorridorCoordinatorV3(state,{before,moves,trace,geometry,road}){
 const g=validateRoadScenarioV3(geometry,road.laneCount)
 ok(state?.version===41&&state.geometry===g.id&&Array.isArray(state.active)&&Array.isArray(state.waiting),'Invalid coordinator checkpoint')
 const s=structuredClone(state),positions=new Map(moves.map(m=>[m.riderId,m]))
 for(const w of s.waiting){
  let result
  try{result=pairedOneTickLanePreparationV3(before,moves,w.candidate,road)}
  catch(e){if(/Stale lane candidate/.test(String(e)))result={safe:false,reason:'stale_source'};else throw e}
  if(result.safe){s.stats.validNextTick++;s.stats.movementChanges+=result.changedMovementRiders;s.stats.blockedStatusChanges+=result.changedWheelFlagRiders;s.stats.candidateForwardDeltaM=round(s.stats.candidateForwardDeltaM+result.deltaCandidateForwardMeters)}
  else s.stats.invalidNextTick++
 }
 s.waiting=[]
 const nextActive=[],acceptedThisTick=[]
 // Fixed priority: older reservation first, then deterministic rider ID. No overbooking.
 for(const active of s.active){
  const next=stepRoadCorridorV3(active,before,moves,trace,geometry,{dt:road.dtSeconds,lanes:road.laneCount})
  if(next.phase==='rejected'){rejectCount(s.stats,next.reason);continue}
  const first=nowPath(active,positions,g)
  const hit=acceptedThisTick.some(x=>pairHit(first,x,g))
  if(hit){s.stats.mutualConflicts++;continue}
  acceptedThisTick.push(first)
  if(next.phase==='complete'){
   s.stats.completed++;s.stats.completedExtraJ+=next.extraWorkJoules
   s.waiting.push({candidate:next.candidate})
   if(s.examples.length<12)s.examples.push({riderId:next.candidate.riderId,checkpoints:next.checks,extraJ:next.extraWorkJoules})
  }else nextActive.push(next)
 }
 s.active=nextActive
 s.stats.maxConcurrent=Math.max(s.stats.maxConcurrent,s.active.length)
 s.stats.multiConcurrentTicks+=Number(s.active.length>1)
 return s
}
export function admitCorridorReservationsV3(state,{proposals,atEnd,before,moves,sourceRiders,geometry,dt=10,queueLengths=null}){
 const g=validateRoadScenarioV3(geometry,state.lanes)
 ok(state?.version===41&&state.geometry===g.id&&Array.isArray(proposals)&&Array.isArray(atEnd),'Invalid admission state')
 const s=structuredClone(state),origin=new Map(sourceRiders.map(r=>[r.riderId,r]))
 const ranked=[...proposals].sort((a,b)=>(queueLengths?.[b.riderId]??0)-(queueLengths?.[a.riderId]??0)||a.riderId.localeCompare(b.riderId))
 const seen=new Set()
 for(const candidate of ranked){
  ok(candidate?.riderId&&!seen.has(candidate.riderId),'Duplicate reservation candidate');seen.add(candidate.riderId)
  if(s.active.some(a=>a.candidate.riderId===candidate.riderId)||s.waiting.some(w=>w.candidate.riderId===candidate.riderId))continue
  s.stats.decisions++
  if(s.active.length>=s.capacity){s.stats.blockedByCapacity++;continue}
  const source=origin.get(candidate.riderId)
  if(!source||source.lane!==candidate.fromLane||!source.powerDurationEnergy){s.stats.sourceRejections++;continue}
  if(s.forecast){
   const forecast=predictClearCorridorV3(candidate,before,moves,geometry,{reactionTicks:2,steeringTicks:s.steeringTicks,dt,lanes:s.lanes})
   if(!forecast.predictedClear){s.stats.forecastVetoes++;continue}
  }
  const proposed=beginRoadCorridorV3(candidate,source,geometry,'early',{reactionTicks:2,steeringTicks:s.steeringTicks,lanes:s.lanes})
  if(conflictsWithExisting(proposed,s.active,atEnd,g,dt)){s.stats.reservationConflicts++;continue}
  s.active.push(proposed);s.stats.admitted++
  s.stats.maxConcurrent=Math.max(s.stats.maxConcurrent,s.active.length)
 }
 return s
}
