/** A77 Phase3 diagnostic of first rejected physical contacts.
 * It does not claim collision-avoidance is impossible across steering
 * options: it distinguishes lane-closing contact from inadequate
 * same-corridor longitudinal authority on the REJECTED half-second tick.
 */
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createMultiGatePhysicalCandidateV3,runMultiGatePhysicalCandidateV3}
 from './a2MultiGatePhysicalCandidateV3.mjs'
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x))
function inspect(first){
 if(!first?.preCollisionField?.riders?.length)return {
  status:'NO_PAIR_FORENSIC_INPUT',unavoidable:false}
 const [a,b]=first.preCollisionField.riders
 const lead=a.xStart>=b.xStart?a:b,rear=a.xStart>=b.xStart?b:a
 const gap=lead.xStart-rear.xStart
 const dv=lead.speedStartMps-rear.speedStartMps
 // The maximum instantaneous longitudinal difference in .5s is from
 // leading +0.45m/s² and trailing -0.85m/s² (no teleport or brake beyond cap).
 const da=.45+.85
 const minT=clamp(-dv/da,0,.5)
 const bestGapAtMinT=gap+dv*minT+.5*da*minT*minT
 const bestGapEnd=gap+dv*.5+.5*da*.25
 const lateralStart=Math.abs(a.yStart-b.yStart)
 const lateralContact=first.preCollisionField.actualLateralM
 const currentSameCorridor=lateralStart<.8
 const physicalLimitsWouldFailSameCorridor=bestGapAtMinT<1.8
 const kind=currentSameCorridor?
  physicalLimitsWouldFailSameCorridor?
   'INSUFFICIENT_IMMEDIATE_LONGITUDINAL_AUTHORITY_IF_LANE_PERSISTS':
   'SAME_LANE_CONTROLLER_CAN_STILL_FIND_ACCELERATION_MARGIN':
  'LATERAL_CONVERGENCE_WHILE_LONGITUDINALLY_CLOSE'
 return {status:'REJECTED_TICK_ANALYZED',pair:first.pair,
  kind,currentSameCorridor,lead:lead.id,rear:rear.id,
  leadX:lead.xStart,rearX:rear.xStart,
  leadSpeed:lead.speedStartMps,rearSpeed:rear.speedStartMps,
  firstContactTime:first.time,
  deltaStartX:gap,deltaStartY:lateralStart,
  deltaAtDetectedContactY:lateralContact,
  bestLongitudinalSeparationAtWorstMomentM:bestGapAtMinT,
  bestLongitudinalSeparationAtEndM:bestGapEnd,
  thresholdM:1.8,physicalLimitsWouldFailSameCorridor,
  lateralAlternativesNotYetAudited:true,
  noAutomaticRepair:true,officialWrites:0}
}
const trials=[]
for(const n of [32,106,168])
for(const roadGeometry of ['staged_pinch','double_pinch'])
for(const pacePolicy of ['timed_safe_corridor','anticipatory_queue_wave',
 'protect_lead_queue_wave']){
 const start=createMultiGatePhysicalCandidateV3(n,{mode:'five_dense',
  roadGeometry,headwayStandOffM:4.5,
  pacePolicy,startRowSpacingM:5.2})
 const end=runMultiGatePhysicalCandidateV3(start,{seconds:30})
 const detail=inspect(end.firstCollision)
 const sample={n,roadGeometry,pacePolicy,
  reason:end.reason??'ACCEPTED_30_SECONDS',
  seconds:end.physical.at,detail,
  preservedPhysicalStateOnRejection:end.reason?
   end.physical.reason===null:true}
 assert.equal(end.officialWrites,0)
 assert(sample.preservedPhysicalStateOnRejection)
 assert(end.physical.states.every(s=>s.v>=0&&
  s.energy.remainingWPrimeJoules>=0&&
  Math.abs(s.energy.seconds-end.physical.at)<1e-6))
 trials.push(sample)
}
const result={study:'A77_PHASE3_FIRST_CONTACT_CONTROL_AUTHORITY',
 trialCount:trials.length,unavoidableFullPhysicsNotClaimed:true,
 originalSolverNotModified:true,sportingApproval:'NOT_APPROVED',
 officialWrites:0,trials}
const dir=process.env.V3_A2_STEP77_CONTACT_DIR??'/tmp/a77-contact'
mkdirSync(dir,{recursive:true})
writeFileSync(dir+'/a77-phase3-first-contact-authority.json',
 JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({study:result.study,trialCount:result.trialCount,
 summary:trials.map(x=>({n:x.n,geometry:x.roadGeometry,
  policy:x.pacePolicy,seconds:x.seconds,reason:x.reason,
  firstContactKind:x.detail.kind??null,
  bestGapM:x.detail.bestLongitudinalSeparationAtWorstMomentM??null,
  firstContactPair:x.detail.pair??null})),officialWrites:0}))
