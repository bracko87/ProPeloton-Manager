/** Batch 39 — research-only continuous 2D bicycle sweep, not active race physics.
 * All positions in metres. Lane centres are one metre apart in a deliberately
 * provisional road-lane model. A bicycle collision is a rectangle in relative
 * longitudinal/lateral separation, continuously across every recorded tick.
 */
const verify = (v, msg) => { if (!v) throw new Error(msg) }
const round = n => Math.round(n * 1e6) / 1e6
const LANE_WIDTH_M = 1
const LONGITUDINAL_GAP_M = 1.8
const LATERAL_GAP_M = .8 // 0.55m bike + 0.25m provisional clearance

/** Closed interval times for |a+(b-a)t| < threshold. Returns null if impossible. */
function overlapInterval(a,b,threshold) {
 verify([a,b,threshold].every(Number.isFinite) && threshold>0, 'Invalid geometric interval')
 if (a === b) return Math.abs(a) < threshold - 1e-9 ? [0,1] : null
 const t1 = (-threshold-a)/(b-a), t2=(threshold-a)/(b-a)
 const lo=Math.max(0,Math.min(t1,t2)),hi=Math.min(1,Math.max(t1,t2))
 return hi-lo>1e-9 ? [lo,hi] : null
}
/** Detect a simultaneous physical overlap, not merely close endpoints.
 * r: {x0,x1,y0,y1}; stationary or translating riders may use y0=y1.
 */
export function continuousBicycleCollisionV3(a,b,{longitudinal=LONGITUDINAL_GAP_M,lateral=LATERAL_GAP_M}={}) {
 const v=[a?.x0,a?.x1,a?.y0,a?.y1,b?.x0,b?.x1,b?.y0,b?.y1]
 verify(v.every(Number.isFinite) && longitudinal>=1.8 && longitudinal<=3 && lateral>=.7 && lateral<=1.2, 'Invalid bicycle trajectory or clearance')
 const ix=overlapInterval(a.x0-b.x0,a.x1-b.x1,longitudinal)
 const iy=overlapInterval(a.y0-b.y0,a.y1-b.y1,lateral)
 return !!ix&&!!iy&&Math.min(ix[1],iy[1])-Math.max(ix[0],iy[0])>1e-9
}
const isIdentity = p => p?.riderId && Number.isInteger(p.fromLane) && Number.isInteger(p.toLane) && Math.abs(p.toLane-p.fromLane)===1
export function startContinuousPassV3(candidate, rider, {reactionTicks=2,steeringTicks=3,extraWatts=35,laneWidthM=LANE_WIDTH_M}={}) {
 verify(isIdentity(candidate) && rider?.riderId===candidate.riderId && rider.lane===candidate.fromLane && rider.powerDurationEnergy && [3,4].includes(steeringTicks) && Number.isInteger(reactionTicks) && reactionTicks>=1 && reactionTicks<=4 && [20,35,50].includes(extraWatts) && laneWidthM===1, 'Invalid continuous research pass')
 return {riderId:candidate.riderId,fromLane:candidate.fromLane,toLane:candidate.toLane,
  leaderId:candidate.blockingLeaderId??null,reactionLeft:reactionTicks,steeringLeft:steeringTicks,steeringTicks,
  extraWatts,progress:0,phase:'reaction',reason:null,energy:structuredClone(rider.powerDurationEnergy),
  extraWorkJoules:0,actualChecks:0,minimumPhysicalSeparation:{longitudinal:LONGITUDINAL_GAP_M,lateral:LATERAL_GAP_M}}
}
function advanceLedger(energy,watts,seconds) {
 verify(energy && Number.isFinite(watts) && watts>=0 && Number.isFinite(seconds) && seconds>0 && seconds<=20,'Invalid steering energy')
 const above=Math.max(0,watts-energy.criticalWatts)*seconds
 if(above>energy.remainingWPrimeJoules+1e-7)return null
 const remaining=Math.max(0,energy.remainingWPrimeJoules-above+(watts<energy.criticalWatts?(energy.wPrimeJoules-energy.remainingWPrimeJoules)*(1-Math.exp(-(energy.criticalWatts-watts)/energy.criticalWatts*seconds/300)):0))
 return {...energy,remainingWPrimeJoules:Math.min(energy.wPrimeJoules,remaining),
  cumulativeMechanicalJoules:energy.cumulativeMechanicalJoules+watts*seconds,
  cumulativeMetabolicJoules:energy.cumulativeMetabolicJoules+watts*seconds/energy.efficiency,
  cumulativeSupraCriticalJoules:energy.cumulativeSupraCriticalJoules+above,
  cumulativeRecoveredWPrimeJoules:energy.cumulativeRecoveredWPrimeJoules+(watts<energy.criticalWatts?Math.max(0,remaining-energy.remainingWPrimeJoules):0),seconds:energy.seconds+seconds}
}
export function advanceContinuousPassV3(reservation,before,moves,trace,{dt=10,laneWidthM=LANE_WIDTH_M,lanes=4}={}) {
 verify(reservation && ['reaction','steering'].includes(reservation.phase) && Array.isArray(before) && Array.isArray(moves) && Array.isArray(trace) && dt>0 && dt<=20 && laneWidthM===1 && lanes>=2 && lanes<=6,'Invalid moving pass checkpoint')
 const s=structuredClone(reservation)
 const old=before.find(r=>r.riderId===s.riderId),next=moves.find(r=>r.riderId===s.riderId),actual=trace.find(r=>r.riderId===s.riderId)
 if(!old||!next||!actual ||old.lane!==s.fromLane||next.lane!==s.fromLane||!Number.isFinite(old.meters)||!Number.isFinite(next.meters)||next.meters<old.meters-1e-6)return {...s,phase:'rejected',reason:'source_rider_left_lane_or_finished'}
 if(s.toLane<0||s.toLane>=lanes)return {...s,phase:'rejected',reason:'off_road'}
 // Fully continuous lateral coordinate. This is shadow progress, NOT a move in the actual race.
 const y0=(s.fromLane+(s.toLane-s.fromLane)*s.progress)*laneWidthM
 const proposedProgress=s.phase==='reaction'?s.progress:round(s.progress+1/s.steeringTicks)
 const y1=(s.fromLane+(s.toLane-s.fromLane)*proposedProgress)*laneWidthM
 if(s.phase==='steering'){
  for(const other of before){if(other.riderId===s.riderId)continue
   const moved=moves.find(r=>r.riderId===other.riderId)
   verify(!!moved && Number.isFinite(moved.meters), 'Missing real competing trajectory')
   const contender={x0:old.meters,x1:next.meters,y0,y1}
   // Every unchanged rider has integer lane centres, but accepted V3 solver moves may
   // change discrete lane between endpoints. Interpolate those paths conservatively.
   const rival={x0:other.meters,x1:moved.meters,y0:other.lane*laneWidthM,y1:moved.lane*laneWidthM}
   if(continuousBicycleCollisionV3(contender,rival))return {...s,phase:'rejected',reason:'continuous_2d_swept_collision',rivalId:other.riderId}
  }
 }
 const surcharge=s.phase==='steering'?s.extraWatts:0
 const newEnergy=advanceLedger(s.energy,actual.actualMechanicalWatts+surcharge,dt)
 if(!newEnergy)return {...s,phase:'rejected',reason:'finite_wprime_budget'}
 s.energy=newEnergy;s.extraWorkJoules+=surcharge*dt;s.actualChecks++
 if(s.phase==='reaction'){
  s.reactionLeft--
  if(s.reactionLeft===0)s.phase='steering'
 }else{
  s.progress=proposedProgress;s.steeringLeft--
  if(s.steeringLeft===0){verify(Math.abs(s.progress-1)<1e-5,'Continuous lateral completion mismatch');s.progress=1;s.phase='complete'}
 }
 return s
}
export function continuousPassCompletedV3(s){return s?.phase==='complete'&&s.progress===1&&s.steeringLeft===0}
