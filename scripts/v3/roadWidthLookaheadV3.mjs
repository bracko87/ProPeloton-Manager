/** Batch 40 research only. Geometric SCENARIOS, not measured stage road widths.
 * UCI Jan-2026 road handlebar overall minimum: 0.40 m; human/bicycle
 * envelopes and longitudinal clearance below are safety assumptions.
 * Neither motion nor W-prime shadow is applied to the source race.
 */
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
import {advanceEnergyBalanceResearchV3} from '../../src/race-engine-v3/energyBalanceResearchV3.ts'
export const BATCH40_GEOMETRIES=Object.freeze([
 {id:'compact_4m',roadWidthM:4,centerStepM:.85,bikeWidthM:.45,bufferM:.25},
 {id:'baseline_5m',roadWidthM:5,centerStepM:1,bikeWidthM:.55,bufferM:.25},
 {id:'wide_6_5m',roadWidthM:6.5,centerStepM:1.2,bikeWidthM:.55,bufferM:.25},
 {id:'cautious_5m',roadWidthM:5,centerStepM:1,bikeWidthM:.60,bufferM:.35},
])
const finite=x=>Number.isFinite(x)
const check=(ok,message)=>{if(!ok)throw Error(message)}
const r6=x=>Math.round(x*1e6)/1e6
export function validateRoadScenarioV3(g,lanes=4){
 check(g&&Number.isInteger(lanes)&&lanes>=2&&lanes<=6&&[g.roadWidthM,g.centerStepM,g.bikeWidthM,g.bufferM].every(finite),'Invalid road scenario')
 check(g.roadWidthM>=3&&g.roadWidthM<=12&&g.centerStepM>=.65&&g.centerStepM<=2&&g.bikeWidthM>=.4&&g.bikeWidthM<=.9&&g.bufferM>=.1&&g.bufferM<=.5,'Invalid geometric bounds')
 const margin=(g.roadWidthM-(lanes-1)*g.centerStepM)/2-g.bikeWidthM/2
 check(margin>=.15-1e-8,'Insufficient edge margin for bicycle envelope')
 const lateral=g.bikeWidthM+g.bufferM
 check(lateral>=.7&&lateral<=1.2&&g.centerStepM>=lateral-1e-7,'Overlapping neutral bicycle tracks')
 return {id:g.id??'custom',roadWidthM:g.roadWidthM,centerStepM:g.centerStepM,bikeWidthM:g.bikeWidthM,lateralClearanceM:g.bufferM,lateralCollisionM:lateral,roadsideMarginM:r6(margin),laneCount:lanes,longitudinalCollisionM:1.8}
}
const laneY=(lane,g)=>lane*g.centerStepM
function collision(a,b,g){
 return continuousBicycleCollisionV3(a,b,{longitudinal:1.8,lateral:g.lateralCollisionM})
}
const stateFrom=(start,candidate,mode,g,react,steer)=>{
 check(candidate&&start?.riderId===candidate.riderId&&start.lane===candidate.fromLane&&Math.abs(candidate.toLane-candidate.fromLane)===1&&start.powerDurationEnergy,'Invalid proactive candidate')
 check([2,3].includes(react)&&[3,4].includes(steer)&&['early','persistent'].includes(mode),'Invalid shadow steering configuration')
 return {candidate:{riderId:candidate.riderId,fromLane:candidate.fromLane,toLane:candidate.toLane},profile:g.id,policy:mode,phase:'reaction',reactionLeft:react,steeringLeft:steer,steeringTicks:steer,progress:0,extraWatts:35,extraWorkJoules:0,energy:structuredClone(start.powerDurationEnergy),checks:0,reason:null}
}
/** Deliberately NONCLAIRVOYANT: freeze current achieved speed, lane, and
 * position as the predictor for each upcoming reaction/steering tick.
 * This checks a proposed horizon without consulting subsequent real ticks.
 */
export function predictClearCorridorV3(candidate,before,moves,rawGeometry,{reactionTicks=2,steeringTicks=3,dt=10,lanes=4}={}){
 const g=validateRoadScenarioV3(rawGeometry,lanes)
 check(candidate&&[3,4].includes(steeringTicks)&&Number.isInteger(reactionTicks)&&reactionTicks>=1&&dt>0&&dt<=20,'Invalid prediction')
 const original=new Map(before.map(r=>[r.riderId,r])),motion=new Map(moves.map(m=>[m.riderId,m]))
 const r=original.get(candidate.riderId),end=motion.get(candidate.riderId)
 check(r&&end&&r.lane===candidate.fromLane&&end.lane===candidate.fromLane,'Stale forecast rider')
 const forecastTicks=reactionTicks+steeringTicks
 for(let j=0;j<forecastTicks;j++){
  const p0=Math.max(0,Math.min(1,(j-reactionTicks)/steeringTicks))
  const p1=Math.max(0,Math.min(1,(j+1-reactionTicks)/steeringTicks))
  if(p0===0&&p1===0)continue
  const own={x0:end.meters+end.speedMps*dt*j,x1:end.meters+end.speedMps*dt*(j+1),y0:laneY(candidate.fromLane+(candidate.toLane-candidate.fromLane)*p0,g),y1:laneY(candidate.fromLane+(candidate.toLane-candidate.fromLane)*p1,g)}
  for(const other of before){
   if(other.riderId===candidate.riderId)continue
   const observed=motion.get(other.riderId)
   check(!!observed&&Number.isFinite(observed.speedMps),'Missing forecast wheel')
   const rival={x0:observed.meters+observed.speedMps*dt*j,x1:observed.meters+observed.speedMps*dt*(j+1),y0:laneY(observed.lane,g),y1:laneY(observed.lane,g)}
   if(collision(own,rival,g))return {predictedClear:false,reason:'constant_velocity_corridor_conflict',rivalId:other.riderId,forecastTick:j+1}
  }
 }
 return {predictedClear:true,reason:null,rivalId:null,forecastTick:null}
}
export function beginRoadCorridorV3(candidate,rider,geometry,policy,{reactionTicks=2,steeringTicks=3,lanes=4}={}){
 const g=validateRoadScenarioV3(geometry,lanes)
 return stateFrom(rider,candidate,policy,g,reactionTicks,steeringTicks)
}
/** Actual future source trajectories, observed ONE TICK AT A TIME.
 * Reject intersections within the interval, not just endpoints. Source is
 * immutable and the alternative never contributes longitudinal metres.
 */
export function stepRoadCorridorV3(shadow,before,moves,trace,rawGeometry,{dt=10,lanes=4}={}){
 const g=validateRoadScenarioV3(rawGeometry,lanes)
 check(shadow&&shadow.profile===g.id&&['reaction','steering'].includes(shadow.phase)&&Array.isArray(before)&&Array.isArray(moves)&&Array.isArray(trace)&&dt>0&&dt<=20,'Invalid resumed corridor checkpoint')
 const s=structuredClone(shadow),old=before.find(x=>x.riderId===s.candidate.riderId),end=moves.find(x=>x.riderId===s.candidate.riderId),obs=trace.find(x=>x.riderId===s.candidate.riderId)
 if(!old||!end||!obs||old.lane!==s.candidate.fromLane||end.lane!==s.candidate.fromLane||!finite(obs.actualMechanicalWatts)||end.meters<old.meters-1e-6)return {...s,phase:'rejected',reason:'source_lane_or_finish'}
 const from=laneY(s.candidate.fromLane,g),delta=laneY(s.candidate.toLane,g)-from
 const p0=s.progress,p1=s.phase==='reaction'?p0:r6(Math.min(1,p0+1/s.steeringTicks))
 if(s.phase==='steering'){
  const travel={x0:old.meters,x1:end.meters,y0:from+delta*p0,y1:from+delta*p1}
  for(const other of before){
   if(other.riderId===s.candidate.riderId)continue
   const next=moves.find(x=>x.riderId===other.riderId)
   check(!!next,'Missing actual rival trajectory')
   const rival={x0:other.meters,x1:next.meters,y0:laneY(other.lane,g),y1:laneY(next.lane,g)}
   if(collision(travel,rival,g))return {...s,phase:'rejected',reason:'continuous_collision',rivalId:other.riderId}
  }
 }
 const extra=s.phase==='steering'?s.extraWatts:0
 const charge=advanceEnergyBalanceResearchV3(s.energy,obs.actualMechanicalWatts+extra,dt)
 if(!charge.accepted)return {...s,phase:'rejected',reason:'wprime_insufficient'}
 s.energy=charge.state;s.extraWorkJoules+=extra*dt;s.checks++
 if(s.phase==='reaction'){s.reactionLeft--;if(s.reactionLeft===0)s.phase='steering'}
 else {s.progress=p1;if(--s.steeringLeft===0){check(Math.abs(s.progress-1)<1e-5,'Incomplete lane progress');s.phase='complete';s.progress=1}}
 return s
}
