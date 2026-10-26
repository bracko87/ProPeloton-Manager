/** V3 Batch 37 OFFLINE, read-only, deterministic wheel-reservation attribution.
 * No source engine mutation, no scripted gaps, no free travelled metres.
 */
import {advanceSpatialPelotonV3} from '../../src/race-engine-v3/pelotonSpatialMotionV3.ts'
import {planAnticipatoryLanesV3} from '../../src/race-engine-v3/anticipatoryLaneResearchV3.ts'
const r6=x=>Math.round(x*1e6)/1e6
const same=(a,b,e=1e-4)=>Math.abs(a-b)<=e
const sorted=(rows)=>rows.slice().sort((a,b)=>b.meters-a.meters||a.riderId.localeCompare(b.riderId))
const safeSweep=(a,b,c,d,gap)=>{const x=a-c,y=b-d;return x*y>=0&&Math.min(Math.abs(x),Math.abs(y))>=gap-1e-6}
const assert=(condition,message)=>{if(!condition)throw Error(message)}
export function attributeWheelReservationsV3(before,moves,{laneCount=4,dtSeconds=10,minWheelGapMeters=1.8}={}){
 assert(Array.isArray(before)&&Array.isArray(moves)&&before.length>1&&before.length===moves.length&&new Set(before.map(x=>x.riderId)).size===before.length&&new Set(moves.map(x=>x.riderId)).size===moves.length,'Invalid wheel attribution roster')
 const reproduced=advanceSpatialPelotonV3(before,{laneCount,dtSeconds,minWheelGapMeters})
 const from=new Map(before.map(x=>[x.riderId,x])),observed=new Map(moves.map(x=>[x.riderId,x]))
 for(const m of reproduced){const x=observed.get(m.riderId);assert(x&&same(x.meters,m.meters,2e-5)&&x.lane===m.lane&&x.wheelLimited===m.wheelLimited&&same(x.speedMps,m.speedMps,2e-5),'Unreproduced wheel solver step')}
 const records=[],leaders=new Map(),done=[]
 let wheelLoss=0,unpassedSameLaneLoss=0,directSameLaneLimited=0,couldPassNow=0,lateralMoves=0
 for(const r of sorted(before)){
  const out=observed.get(r.riderId),target=r.meters+r.desiredMps*dtSeconds
  const leader=done.filter(m=>m.lane===r.lane&&m.oldMeters>=r.meters).sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))[0]
  const limit=leader?Math.max(r.meters,leader.meters-minWheelGapMeters):target
  const retained=Math.max(0,target-Math.min(target,limit))
  const actualLoss=Math.max(0,target-out.meters)
  const laneOptions=[r.lane-1,r.lane+1].filter(l=>l>=0&&l<laneCount).map(l=>{
   const conflict=before.filter(b=>b.riderId!==r.riderId&&b.lane===l&&b.meters>=r.meters-minWheelGapMeters&&b.meters<=target+minWheelGapMeters)
   const previous=done.filter(b=>b.lane===l&&b.oldMeters>=r.meters).sort((a,b)=>a.meters-b.meters||a.riderId.localeCompare(b.riderId))[0]
   const allowed=previous?Math.min(target,previous.meters-minWheelGapMeters):target
   return {lane:l,blockedByInitial:conflict.map(x=>x.riderId),frontReservationId:previous?.riderId??null,allowedMeters:r6(allowed),couldBeatSameLane:!conflict.length&&allowed>Math.min(target,limit)+1e-6}
  })
  const row={riderId:r.riderId,laneBefore:r.lane,laneAfter:out.lane,targetMeters:r6(target),actualMeters:r6(out.meters),commandedMps:r.desiredMps,achievedMps:out.speedMps,blocked:out.wheelLimited,lossMeters:r6(actualLoss),sameLaneReservationId:leader?.riderId??null,sameLaneClippedMeters:r6(retained),headwayCandidateLanes:laneOptions}
  records.push(row)
  if(actualLoss>1e-6){wheelLoss+=actualLoss;leaders.set(leader?.riderId??'none',(leaders.get(leader?.riderId??'none')??0)+1)}
  if(retained>1e-6){unpassedSameLaneLoss+=retained;directSameLaneLimited++}
  if(laneOptions.some(x=>x.couldBeatSameLane))couldPassNow++
  lateralMoves+=Number(out.lane!==r.lane)
  done.push(out)
 }
 return {summary:{riders:before.length,wheelLimitedRiderTicks:records.filter(x=>x.blocked).length,actualLostMeters:r6(wheelLoss),sameLaneInitialClipMeters:r6(unpassedSameLaneLoss),sameLaneLimitedRiderTicks:directSameLaneLimited,anyImmediateAdjacentOptionRiderTicks:couldPassNow,lateralMoves,topConstrainingLeaders:[...leaders].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,5).map(([riderId,count])=>({riderId,count}))},records}
}
/** Conservative one-rider end-of-tick lane preparation. No immediate forward distance.
 * Never rely on OTHER planned riders moving lanes for the candidate to be valid.
 */
export function selectSafeSinglePreparationV3(before,moves,{laneCount=4,minWheelGapMeters=1.8}={}){
 let plan
 try{plan=planAnticipatoryLanesV3(before,moves,laneCount,minWheelGapMeters)}
 catch(e){if(e instanceof Error&&e.message==='Invalid anticipatory bicycle placement')return {candidate:null,rejectedUnsafe:true,reason:'planner_requires_multiple_reassignments'};throw e}
 const start=new Map(before.map(r=>[r.riderId,r])),mmap=new Map(moves.map(m=>[m.riderId,m]))
 const proposed=plan.riders.filter(x=>x.promoted&&x.lane!==x.fromLane).sort((a,b)=>a.riderId.localeCompare(b.riderId))
 for(const p of proposed){
  const original=start.get(p.riderId),end=mmap.get(p.riderId)
  if(!original||!end||original.tactic==='recover')continue
  const conflicts=moves.filter(other=>{
   if(other.riderId===p.riderId||other.lane!==p.lane)return false
   return !safeSweep(original.meters,end.meters,start.get(other.riderId).meters,other.meters,minWheelGapMeters)
  })
  const endpoint=moves.some(other=>other.riderId!==p.riderId&&other.lane===p.lane&&Math.abs(other.meters-end.meters)<minWheelGapMeters-1e-5)
  if(conflicts.length||endpoint)continue
  return {candidate:{riderId:p.riderId,fromLane:p.fromLane,toLane:p.lane,oldMeters:original.meters,meters:end.meters},rejectedUnsafe:false,reason:null}
 }
 return {candidate:null,rejectedUnsafe:proposed.length>0,reason:proposed.length?'dependent_lane_shift_or_swept_corridor':'no_promoted_wheel'}
}
/** Next tick: all physical speed targets fixed to the *observed* control demand.
 * Alternative differs in one initial lane ONLY; source W-prime/energy unchanged.
 */
export function pairedOneTickLanePreparationV3(before,referenceMoves,candidate,{laneCount=4,dtSeconds=10,minWheelGapMeters=1.8}={}){
 const base=advanceSpatialPelotonV3(before,{laneCount,dtSeconds,minWheelGapMeters}),byOriginal=new Map(referenceMoves.map(m=>[m.riderId,m]))
 for(const m of base){const r=byOriginal.get(m.riderId);assert(r&&same(r.meters,m.meters,2e-5)&&r.lane===m.lane,'Second-tick control was not reproducible')}
 assert(candidate&&before.some(r=>r.riderId===candidate.riderId&&r.lane===candidate.fromLane),'Stale lane candidate')
 const alt=before.map(r=>r.riderId===candidate.riderId?{...r,lane:candidate.toLane}:{...r})
 let experiment
 try{experiment=advanceSpatialPelotonV3(alt,{laneCount,dtSeconds,minWheelGapMeters})}
 catch(e){if(e instanceof Error&&(/Overlapping starting bicycle positions|Spatial lane reservation collision/.test(e.message)))return {safe:false,reason:'collision_in_next_tick',candidate,deltaAggregateForwardMeters:null};throw e}
 const byChange=new Map(experiment.map(m=>[m.riderId,m]))
 let changedMovement=0,changedBlockedFlag=0,aggregateDelta=0,candidateDelta=0
 for(const m of base){
  const other=byChange.get(m.riderId)
  const difference=(other.meters-other.oldMeters)-(m.meters-m.oldMeters)
  aggregateDelta+=difference
  changedMovement+=Number(Math.abs(difference)>1e-5)
  changedBlockedFlag+=Number(m.wheelLimited!==other.wheelLimited)
  if(m.riderId===candidate.riderId)candidateDelta=difference
 }
 return {safe:true,reason:null,candidate,deltaAggregateForwardMeters:r6(aggregateDelta),deltaCandidateForwardMeters:r6(candidateDelta),changedMovementRiders:changedMovement,changedWheelFlagRiders:changedBlockedFlag,noFreeFirstTickMeters:true}
}
