/** A55 OFFLINE acceleration-bounded substep feasibility certificate.
 * A54 energy-bookkeeping PASS is NOT a physical velocity-continuity PASS.
 * The only physically admissible ordinary reaction must obey the declared
 * ± acceleration envelope from the *start of this already frozen substep*.
 * Unreachable endpoints are labeled as needing earlier anticipation or
 * explicit emergency handling; never silently promoted or changed.
 */
import {resolveContactPriorityV3} from './a2CollisionPriorityResearchV3.mjs'
import {auditHybridEnergyNextV3} from './a2HybridEnergyNextAuditV3.mjs'
import {continuousBicycleCollisionV3} from './continuousLateralResearchV3.mjs'
const check=(v,m)=>{if(!v)throw Error(m)}
const r6=x=>Math.round(x*1e6)/1e6
const LOWER=-.85,UPPER=.45,LATERAL=.38,TOL=1e-5
function pmap(paths){return new Map(paths.map(p=>[p.riderId,p]))}
function clip(x,lo,hi){return Math.max(lo,Math.min(hi,x))}
export function inspectConstantAccelerationEnvelopeV3(preview,paths,dt){
 check(preview?.proposals?.length>=2&&Array.isArray(paths)&&dt>0&&dt<=5,
  'A55 invalid substep')
 const from=pmap(preview.proposals),end=pmap(paths)
 check(from.size===end.size&&from.size===preview.proposals.length&&
  from.size<=32,'A55 mismatched rider roster')
 const riders=[]
 for(const [id,p] of from){
  const q=end.get(id)
  check(q&&Number.isFinite(p.oldSpeedMps)&&p.oldSpeedMps>=0&&
   Number.isFinite(p.x0)&&Number.isFinite(p.y0)&&
   [q.x0,q.y0,q.x1,q.y1].every(Number.isFinite)&&
   Math.abs(q.x0-p.x0)<=1e-7&&Math.abs(q.y0-p.y0)<=1e-7,
   'A55 missing/malformed original path')
  const dx=q.x1-p.x0,v0=p.oldSpeedMps
  const a=2*(dx-v0*dt)/(dt*dt)
  const v1=v0+a*dt
  const brakingRequired=Math.max(0,-a)
  // A rider braking to a full stop inside dt can travel LESS than a
  // constant-acceleration full-interval parabola. Such a trajectory would
  // be piecewise and must NOT be certified by this module as quadratic.
  const minDistance=v0>=.85*dt?
   v0*dt-.5*.85*dt*dt:v0*v0/(2*.85)
  const maxDistance=v0*dt+.5*.45*dt*dt
  const lateral=Math.abs(q.y1-p.y0)
  const withinLongitudinal=a>=LOWER-TOL&&a<=UPPER+TOL&&
   v1>=-TOL&&v1<=20+TOL&&dx>=-TOL
  const lateralValid=lateral<=LATERAL*dt+TOL
  const feasible=withinLongitudinal&&lateralValid
  let reason=feasible?'BOUNDED_ACCELERATION_FEASIBLE':
   !lateralValid?'LATERAL_RATE_EXCEEDED':
   a<LOWER-TOL?'BRAKING_EXCEEDS_0_85_MPS2':
   a>UPPER+TOL?'ACCELERATION_EXCEEDS_0_45_MPS2':
   v1<0?'NEGATIVE_TERMINAL_SPEED':'SPEED_ENVELOPE_EXCEEDED'
  riders.push({riderId:id,startSpeedMps:r6(v0),
   acceptedDisplacementM:r6(dx),
   impliedEndSpeedMps:r6(v1),
   requiredConstantAccelerationMps2:r6(a),
   requiredBrakeMagnitudeMps2:r6(brakingRequired),
   allowedMinimumForwardM:r6(minDistance),
   allowedMaximumForwardM:r6(maxDistance),
   forwardShortfallFromLegalMinimumM:r6(Math.max(0,minDistance-dx)),
   lateralMovementM:r6(lateral),feasible,reason})
 }
 riders.sort((a,b)=>a.riderId.localeCompare(b.riderId))
 return {riders,allFeasible:riders.every(r=>r.feasible),
  infeasibleIds:riders.filter(r=>!r.feasible).map(r=>r.riderId),
  biggestRequiredBrakeMps2:r6(Math.max(0,...riders.map(x=>x.requiredBrakeMagnitudeMps2))),
  biggestForwardShortfallM:r6(Math.max(0,...riders.map(x=>x.forwardShortfallFromLegalMinimumM))),
  evidenceModel:'constant-acceleration full substep; not an approved sporting model'}
}
/** For a BOUNDED constant acceleration field, exact quadratic longitudinal
 * path and linear lateral path have max x-deviation |a|h²/8 from the
 * linear chord over an h-second microinterval. Inflate BOTH bicycle
 * longitudinal collision footprints by the SUM of those error bounds:
 * no hit in all expanded swept microsegments => certified continuous
 * clearance, not just a fixed-time sampling claim.
 */
export function conservativeQuadraticSweepV3(preview,paths,g,dt,{intervals=32}={}){
 check(Number.isInteger(intervals)&&intervals>=8&&intervals<=128&&
  Number.isFinite(g?.lateralCollisionM),'A55 invalid sweep specification')
 const env=inspectConstantAccelerationEnvelopeV3(preview,paths,dt)
 if(!env.allFeasible)return {status:'SKIPPED_INFEASIBLE_VELOCITY',
  certifiedSafe:false,intervals,blockers:[],checkedPairs:0}
 const start=pmap(preview.proposals),end=pmap(paths)
 const h=dt/intervals,segments=new Map()
 for(const r of env.riders){
  const p=start.get(r.riderId),q=end.get(r.riderId)
  const a=r.requiredConstantAccelerationMps2
  const seg=[]
  for(let i=0;i<intervals;i++){
   const t0=i*h,t1=(i+1)*h
   const x=t=>p.x0+p.oldSpeedMps*t+.5*a*t*t
   const y=t=>p.y0+(q.y1-p.y0)*(t/dt)
   seg.push({riderId:r.riderId,x0:x(t0),x1:x(t1),y0:y(t0),y1:y(t1)})
  }
  segments.set(r.riderId,seg)
 }
 const blockers=[],items=env.riders
 let checkedPairs=0
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
  const a=items[i],b=items[j],eps=(Math.abs(a.requiredConstantAccelerationMps2)+
   Math.abs(b.requiredConstantAccelerationMps2))*h*h/8+1e-5
  for(let k=0;k<intervals;k++){
   checkedPairs++
   if(continuousBicycleCollisionV3(segments.get(a.riderId)[k],
    segments.get(b.riderId)[k],
    {longitudinal:1.8+eps,lateral:g.lateralCollisionM})){
    blockers.push({pair:[a.riderId,b.riderId],microinterval:k,
     expandedLongitudinalM:r6(1.8+eps)})
    break
   }
  }
 }
 return {status:blockers.length?'CONSERVATIVE_SWEEP_UNRESOLVED':
   'QUADRATIC_CONTINUOUS_CLEARANCE_CERTIFIED',
  certifiedSafe:blockers.length===0,intervals,checkedPairs,blockers,
  proof:'longitudinal chord deviation bound |a|*h²/8 for each cyclist'}
}
export function auditVelocityBoundedHybridV3(preview,nextPreview,g,road,selectedIds,
 {physicalSeconds:dt}={}){
 check(Number.isFinite(dt)&&dt>0&&dt<=5&&
  Array.isArray(selectedIds)&&new Set(selectedIds).size===selectedIds.length,
  'A55 invalid intervention')
 const frozen=JSON.stringify([preview,nextPreview,selectedIds,road])
 const prior=auditHybridEnergyNextV3(preview,nextPreview,g,road,selectedIds,
  {physicalSeconds:dt})
 if(prior.classification==='REJECTED_GEOMETRY'){
  return {status:'REJECTED_GEOMETRY',geometryAllow:false,
   preexistingGuard:prior.guard,ordinaryVelocityPass:false,
   requiresExplicitEmergency:false,
   energyLedgerVerified:false,nextStepChecked:false,
   officialWrites:0,sportingApproval:'NOT_APPROVED'}
 }
 check(prior.classification==='GEOMETRY_PASS_ENERGY_REPLAYED'&&
  prior.energyLedgerVerified,'A55 cannot inspect failed energy shadow')
 const input=preview.proposals.map(p=>({riderId:p.riderId,
  original:{meters:p.x0,y:p.y0,speedMps:p.oldSpeedMps},
  forward:p.proposedMeters,y:p.proposedY}))
 const can=resolveContactPriorityV3(input,g,{policy:'contact_time_lane_occupancy'})
 const candidate=pmap(can.paths)
 const orig=pmap(preview.achieved)
 const props=pmap(preview.proposals)
 const selected=new Set(selectedIds)
 const paths=preview.proposals.map(p=>{
  const c=selected.has(p.riderId)?candidate.get(p.riderId):orig.get(p.riderId)
  return {riderId:p.riderId,x0:p.x0,y0:p.y0,x1:c.x1,y1:c.y1}
 })
 const reference=preview.proposals.map(p=>{
  const c=orig.get(p.riderId)
  return {riderId:p.riderId,x0:p.x0,y0:p.y0,x1:c.x1,y1:c.y1}
 })
 const envelope=inspectConstantAccelerationEnvelopeV3(preview,paths,dt)
 const baseline=inspectConstantAccelerationEnvelopeV3(preview,reference,dt)
 const baseMap=pmap(baseline.riders)
 const changed=new Set(prior.guard.changedRiders)
 const introduced=envelope.riders.filter(r=>!r.feasible&&
  baseMap.get(r.riderId).feasible)
 const changedInfeasible=envelope.riders.filter(r=>!r.feasible&&changed.has(r.riderId))
 const outsideInfeasible=envelope.riders.filter(r=>!r.feasible&&!selected.has(r.riderId))
 const emergency=changedInfeasible.filter(r=>r.reason==='BRAKING_EXCEEDS_0_85_MPS2')
 const quadratic=conservativeQuadraticSweepV3(preview,paths,g,dt)
 const ordinaryVelocityPass=envelope.allFeasible&&quadratic.certifiedSafe
 const status=ordinaryVelocityPass?'BOUNDED_TWO_STEP_RESEARCH_CANDIDATE':
  !envelope.allFeasible?'REJECTED_UNBOUNDED_VELOCITY':
  'REJECTED_QUADRATIC_CONTACT_UNRESOLVED'
 check(JSON.stringify([preview,nextPreview,selectedIds,road])===frozen,
  'A55 modified frozen proposals or controls')
 return {status,geometryAllow:true,
  preexistingGuard:prior.guard,ordinaryVelocityPass,
  changedRiders:prior.changedRiders,
  numberOfAllRiderVelocityFailures:envelope.infeasibleIds.length,
  numberOfChangedRiderVelocityFailures:changedInfeasible.length,
  numberOfIntroducedFailures:introduced.length,
  introducedViolationIds:introduced.map(r=>r.riderId),
  frozenOutsideInfeasibleIds:outsideInfeasible.map(r=>r.riderId),
  changedRiderFailures:changedInfeasible,
  baselineFailureCount:baseline.infeasibleIds.length,
  requiredEmergencyBrakeIds:emergency.map(r=>r.riderId),
  requiresExplicitEmergency:emergency.length>0,
  biggestRequiredBrakeMps2:envelope.biggestRequiredBrakeMps2,
  maxLegalForwardShortfallM:envelope.biggestForwardShortfallM,
  quadraticSweep:quadratic,
  energyLedgerVerified:prior.energyLedgerVerified,
  nextStepChecked:prior.nextStepChecked,
  exactTwoStepReplay:prior.replayVerified,
  existingShadowAccelFlags:prior.provisionalAccelViolationCount,
  officialWrites:0,sportingApproval:'NOT_APPROVED'}
}
