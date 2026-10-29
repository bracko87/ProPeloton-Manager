/** A77 phase 2: opt-in SYNTHETIC physical multi-gate research candidate.
 * Steering and pace are commands, not x/y/v relocation. The unchanged A64
 * swept all-pair, full bicycle road-edge and energy solver is authoritative.
 * A necessary gate booking is NEVER treated as proof of successful passage.
 */
import {createNormalStartV3,advanceNormalStartV3,
 finishNormalStartMetricsV3} from './a2NormalStartPelotonV3.mjs'
import {auditMultiGateAdmissionV3} from './a2MultiGateAdmissionV3.mjs'
import {phase3QueueWaveV3} from './a2Phase3QueueWaveV3.mjs'
import {jointViabilityCommandsV3} from './a2Step78JointViabilityV3.mjs'
import {chooseProspectivePhysicalTickV3} from './a2Step78ProspectiveChoiceV3.mjs'
import {chooseLocalNegotiatedPhysicalTickV3} from './a2Step78LocalNegotiationV3.mjs'
import {researchRoadEnvelopeV3} from './a2VariableRoadWidthV3.mjs'
import {distributedAdmissionCandidatesV3} from './a2Step79DistributedAdmissionV3.mjs'
import {chooseDistributedPhysicalTickV3} from './a2Step79PhysicalChoiceV3.mjs'
import {chooseRecedingHorizonTickV3} from './a2Step80RecedingHorizonV3.mjs'
import {multiSecondReservationCandidatesV3} from './a2Step81SpaceTimeReservationsV3.mjs'
import {step82ContractCandidatesV3} from './a2Step82FeasibleZipperWindowsV3.mjs'
import {step83JointTubeCandidatesV3} from './a2Step83JointTubesV3.mjs'
import {step84ConsensusCandidatesV3} from './a2Step84CrossingConsensusV3.mjs'
import {chooseThroughputGuardedTickV3} from './a2Step85ThroughputGuardV3.mjs'
import {step86GapCandidatesV3} from './a2Step86MultiRowGapV3.mjs'
import {step87CorridorCandidatesV3} from './a2Step87CorridorOrderV3.mjs'
import {step88RowFlowCandidatesV3} from './a2Step88CoupledRowFlowV3.mjs'
import {step89PremergeCandidatesV3} from './a2Step89PremergeReservationV3.mjs'
import {step90RowTrajectoryCandidatesV3} from './a2Step90RowTrajectoryV3.mjs'
import {step91LeaseCandidatesV3,step91AcceptedLeaseUpdateV3} from './a2Step91PersistentCorridorLeaseV3.mjs'
import {step92CohortCandidatesV3} from './a2Step92CohortSpaceTimeV3.mjs'
import {step93RollingStartCandidatesV3} from './a2Step93RollingStartV3.mjs'
const DT=.5,MAX_BRAKE=.85,EPS=1e-7
const clip=(v,a,b)=>Math.max(a,Math.min(b,v))
const round6=v=>Math.round(v*1e6)/1e6
function assert(x,m){if(!x)throw Error(m)}
function validate(snapshot){
 assert((!['lease_strict_v1','lease_balanced_v1']
   .includes(snapshot?.pacePolicy)||Array.isArray(snapshot?.step91Leases))&&
  snapshot?.version===1&&snapshot?.researchOnly===true&&
  snapshot?.physical?.dt===DT&&snapshot.admission?.researchOnly===true&&
  Array.isArray(snapshot.admission.gates)&&
  Array.isArray(snapshot.admission.bookings)&&
  snapshot.originalDesired&&typeof snapshot.originalDesired==='object',
  'A77 invalid saved physical candidate')
}
export function createMultiGatePhysicalCandidateV3(n,{
 mode='five_dense',roadGeometry='double_pinch',mirror=false,renamed=false,
 controllerPolicy='coordinated_demand',headwayStandOffM=3.2,
 pacePolicy='timed_safe_corridor',rollingStartSpeedMps=null,
 coreMergePolicy='preview_only',startRowSpacingM=5.2
}={}){
 assert([8,32,106,168].includes(n)&&
  ['five_dense','corridor'].includes(mode)&&
  ['double_pinch','staged_pinch','strong_pinch'].includes(roadGeometry)&&
  ['coordinated_demand','coordinated_headway'].includes(controllerPolicy)&&
  [3.2,3.8,4.5].includes(headwayStandOffM)&&
  ['timed_safe_corridor','timed_slot_only','timed_speed_only',
   'anticipatory_queue_wave','protect_lead_queue_wave',
   'joint_viability_v1','joint_prospective_v1',
   'joint_local_negotiation_v1','joint_local_preemptive_v1',
   'distributed_multiwave_v1','distributed_risk_v1',
   'horizon2_guarded_v1','horizon3_guarded_v1',
   'multisecond_reserve_v1','multisecond_zipper_v1',
   'feasible_window_v1','feasible_conservative_v1',
   'joint_tube_hold_v1','joint_tube_release_v1',
   'consensus_hold_v1','consensus_wave_v1',
   'throughput_strict_v1','throughput_balanced_v1',
   'multirow_gap_strict_v1','multirow_gap_wave_v1',
   'corridor_order_v1','corridor_release_v1',
   'whole_row_strict_v1','whole_row_balanced_v1',
  'premerge_strict_v1','premerge_balanced_v1',
   'trajectory_strict_v1','trajectory_balanced_v1',
   'lease_strict_v1','lease_balanced_v1',
   'cohort_strict_v1','cohort_balanced_v1',
   'rolling_strict_v1','rolling_balanced_v1'].includes(pacePolicy)&&
  ['preview_only','platoon_chain','platoon_soft_yield'].includes(coreMergePolicy)&&
  [5.2,6.5,8,10].includes(startRowSpacingM)&&
  (rollingStartSpeedMps===null||
   Number.isFinite(rollingStartSpeedMps)&&rollingStartSpeedMps>=5&&
   rollingStartSpeedMps<=12),
  'A77 unsupported physical candidate fixture')
 assert(typeof mirror==='boolean'&&typeof renamed==='boolean',
  'A77 invalid reflection or identity options')
 const physical=createNormalStartV3(n,{mode,roadGeometry,mirror,renamed,
  controllerPolicy,headwayStandOffM,bodyHalfWidthM:.3,
  roadMergePolicy:coreMergePolicy})
 // Physical grid-spacing research fixture, fixed before t=0 only.
 // Do not modify accepted positions, speeds or historic A64 grids.
 if(startRowSpacingM!==5.2)for(const s of physical.states){
  const columns=mode==='five_dense'?5:3
  s.startX=+(600-Math.floor(s.startOrder/columns)*startRowSpacingM).toFixed(6)
  s.x=s.startX
 }
 // Optional neutral rolling-start fixture: ALL riders are initialized
 // at the same physically valid speed before the first accepted tick.
 // This is not a post-start speed change, position repair or free braking.
 if(rollingStartSpeedMps!==null)
  for(const s of physical.states)s.v=rollingStartSpeedMps
 const admission=auditMultiGateAdmissionV3(physical.states,roadGeometry)
 return {version:1,researchOnly:true,pacePolicy,coreMergePolicy,
  rollingStartSpeedMps,startRowSpacingM,mirror,
  physical,admission,
  originalDesired:Object.fromEntries(physical.states.map(s=>[s.id,s.desired])),
  commandedRiderTicks:0,lateralRequestTicks:0,headwayWarningTicks:0,
  queueProtectedLeaderTicks:0,queueEarlyBrakeRiderTicks:0,
  jointBlockedLaneChangeTicks:0,jointLeadProtectionTicks:0,
  jointEarlyBrakeRiderTicks:0,jointUnresolvedWarningTicks:0,
  prospectiveBaselineTicks:0,prospectiveJointTicks:0,
  prospectiveRejectedProposals:0,
  localNegotiatedTicks:0,localRejectedTrialTicks:0,
  localNeighborhoodRiderTicks:0,
  distributedSelectedTicks:0,distributedRejectedTrialCount:0,
  distributedRiskEdgeTicks:0,distributedOverlappingRiderTicks:0,
  distributedPolicyTicks:{},
  horizonSelectedTicks:0,horizonFullLookaheadTicks:0,
  horizonRejectedPredictions:0,horizonSelectedPolicies:{},
  multisecondForecastEdgeTicks:0,multisecondSelectedTicks:0,
  multisecondPolicyTicks:{},
  step82ConsistencyTicks:0,step82ConflictTicks:0,
  step82AdjustedTimeTicks:0,step82SelectedTicks:0,
  step82SelectedPolicies:{},
  step83PredictedRiskTicks:0,step83LinkedGroupRiderTicks:0,
  step83SelectedTicks:0,step83SelectedPolicies:{},
  step84UrgentPairTicks:0,step84HeldRequestTicks:0,
  step84SelectedTicks:0,step84SelectedPolicies:{},
  step85SelectedTicks:0,step85RejectedStopCandidates:0,
  step85SelectedPolicies:{},step85NoGoTicks:0,
  step86SelectedTicks:0,step86SelectedPolicies:{},
  step86HeldRiderTicks:0,step86Warnings:0,
  step86NoGoTicks:0,step86BlockedNoStopTrials:0,
  step87OrderEdges:0,step87WindowWarnings:0,
  step87SelectedTicks:0,step87SelectedPolicies:{},
  step87NoGoTicks:0,step87BlockedStopCandidates:0,
  step88RowEdges:0,step88OccupiedPairTicks:0,
  step88HeldRiderTicks:0,step88SelectedTicks:0,
  step88SelectedPolicies:{},step88BlockedStops:0,step88NoGoTicks:0,
  step89Constraints:0,step89Holds:0,step89SelectedTicks:0,
  step89SelectedPolicies:{},step89NoGoTicks:0,
  step90Edges:0,step90Holds:0,step90SelectedTicks:0,
  step90SelectedPolicies:{},step90NoGoTicks:0,
  ...(pacePolicy==='lease_strict_v1'||pacePolicy==='lease_balanced_v1'?{
   step91Leases:[],step91Renewed:0,step91Acquired:0,step91Expired:0,
   step91SelectedTicks:0,step91SelectedPolicies:{},step91NoGoTicks:0
  }:{}),
  step92ConnectedCohorts:0,step92MultiRowCohorts:0,
  step92ProjectedCrossings:0,step92HeldRiders:0,
  step92SelectedTicks:0,step92SelectedPolicies:{},step92NoGoTicks:0,
  step93EarlyRolling:0,step93UnsafeMerges:0,
  step93CrossingWarnings:0,step93HeadwayWarnings:0,
  step93SelectedTicks:0,step93SelectedPolicies:{},step93NoGoTicks:0, 
  status:admission.status==='NECESSARY_WINDOWS_EXIST'?'READY':
   'GATE_ENTRY_NO_WINDOW',reason:null,officialWrites:0}
}
function nextGate(snapshot,s){
 return snapshot.admission.gates.find(g=>s.x<g.exitX-EPS)||null
}
function commandForRider(snapshot,s,bookingsById){
 const gate=nextGate(snapshot,s),original=snapshot.originalDesired[s.id]
 if(!gate)return {speed:original,targetY:s.targetY,guided:false,headway:false}
 const booking=bookingsById.get(s.id)?.find(b=>b.gateId===gate.id)
 if(!booking)return {error:'NO_GATE_BOOKING'}
 const now=snapshot.physical.at,remaining=booking.scheduledSeconds-now
 let speed=original
 if(s.x<booking.gateX-EPS&&remaining>DT)
  speed=Math.min(speed,Math.max(5,(booking.gateX-s.x)/remaining))
 // The longitudinal cross-row queue is computed from current actual
 // positions and STATIC reserved same-corridor intent, never future states.
 const leaders=snapshot.physical.states.filter(t=>t.id!==s.id&&
  t.x>s.x+EPS&&t.x-s.x<=35&&
  (bookingsById.get(t.id)||[]).some(b=>b.gateId===gate.id&&
   Math.abs(b.targetY-booking.targetY)<.8001))
 .sort((a,b)=>a.x-b.x)
 let headway=false
 if(leaders.length){
  const ahead=leaders[0],gap=ahead.x-s.x
  const closing=Math.max(0,s.v-ahead.v)
  const reserve=2.35+2.5*closing+closing*closing/(2*MAX_BRAKE)
  if(gap<reserve+5){
   speed=Math.min(speed,ahead.v+clip((gap-reserve)/2,-3,.5))
   headway=true
  }
 }
 // A body-valid five-abreast row requires the outer bicycle to move
 // laterally through the prior inner track. Do not steer into a currently
 // occupied corridor until actual longitudinal separation exists.
 // The two-slot planner's first wave receives initial priority through
 // physically scheduled speed requests, NOT by instantaneous reposition.
 let targetY=booking.targetY
 if(snapshot.pacePolicy==='timed_speed_only')targetY=s.targetY
 else if(['timed_safe_corridor','anticipatory_queue_wave',
  'protect_lead_queue_wave','joint_viability_v1',
  'joint_prospective_v1','joint_local_negotiation_v1',
  'joint_local_preemptive_v1','distributed_multiwave_v1',
  'distributed_risk_v1','horizon2_guarded_v1',
  'horizon3_guarded_v1','multisecond_reserve_v1',
  'multisecond_zipper_v1','feasible_window_v1',
  'feasible_conservative_v1','joint_tube_hold_v1',
  'joint_tube_release_v1','consensus_hold_v1',
  'consensus_wave_v1','throughput_strict_v1',
  'throughput_balanced_v1','multirow_gap_strict_v1',
   'multirow_gap_wave_v1','corridor_order_v1',
  'corridor_release_v1']
   .includes(snapshot.pacePolicy)&&
  Math.abs(targetY-s.y)>EPS){
  const delta=targetY-s.y
  const blocked=snapshot.physical.states.some(t=>{
   if(t.id===s.id)return false
   if(Math.abs(t.x-s.x)>=2.65)return false
   const between=delta>0?
    t.y>s.y+EPS&&t.y<=targetY+.8001:
    t.y<s.y-EPS&&t.y>=targetY-.8001
   return between
  })
  if(blocked)targetY=s.y
 }
 if(s.x>gate.exitX-EPS)targetY=s.targetY
 return {speed:Math.max(0,speed),targetY,headway,
  guided:true,gateId:gate.id,bookingTime:booking.scheduledSeconds}
}
export function advanceMultiGatePhysicalCandidateV3(snapshot){
 validate(snapshot)
 assert(snapshot.reason===null,'A77 cannot resume rejected physical field')
 const out=structuredClone(snapshot)
 if(out.admission.status!=='NECESSARY_WINDOWS_EXIST'){
  out.reason='GATE_ENTRY_NO_WINDOW';out.status='REJECTED'
  return out
 }
 const count=out.physical.states.length
 const {gates,bookings}=out.admission
 if(bookings.length!==count*gates.length){
  out.reason='GATE_ENTRY_NO_WINDOW';out.status='REJECTED'
  return out
 }
 const byId=new Map()
 for(const b of bookings){
  if(!byId.has(b.id))byId.set(b.id,[])
  byId.get(b.id).push(b)
 }
 const candidate=structuredClone(out.physical)
 let requests=0,laterals=0,heads=0
 const originalRequests=candidate.states.map(s=>({
  id:s.id,...commandForRider(out,s,byId)}))
 if(originalRequests.some(r=>r.error)){
  out.reason='GATE_ENTRY_NO_WINDOW';out.status='REJECTED'
  return out
 }
 // P3: communicate CURRENT leader deceleration intent upstream.
 // This changes only temporary requests, never physical x/y/v/energy.
 const queue=['anticipatory_queue_wave','protect_lead_queue_wave']
  .includes(out.pacePolicy)?
  phase3QueueWaveV3(candidate.states,originalRequests,out.originalDesired,{
   headwayM:out.physical.headwayStandOffM,
   mode:out.pacePolicy==='protect_lead_queue_wave'?
    'protect_lead':'anticipatory'}):null
 const joint=['joint_viability_v1','joint_prospective_v1',
  'joint_local_negotiation_v1','joint_local_preemptive_v1',
  'distributed_multiwave_v1','distributed_risk_v1',
  'horizon2_guarded_v1','horizon3_guarded_v1',
  'multisecond_reserve_v1','multisecond_zipper_v1',
  'feasible_window_v1','feasible_conservative_v1',
  'joint_tube_hold_v1','joint_tube_release_v1',
  'consensus_hold_v1','consensus_wave_v1',
  'throughput_strict_v1','throughput_balanced_v1',
  'multirow_gap_strict_v1','multirow_gap_wave_v1',
  'corridor_order_v1','corridor_release_v1',
   'whole_row_strict_v1','whole_row_balanced_v1',
  'premerge_strict_v1','premerge_balanced_v1',
   'trajectory_strict_v1','trajectory_balanced_v1',
   'lease_strict_v1','lease_balanced_v1',
   'cohort_strict_v1','cohort_balanced_v1',
   'rolling_strict_v1','rolling_balanced_v1']
  .includes(out.pacePolicy)?
  jointViabilityCommandsV3(candidate.states,originalRequests,{
   headwayM:out.physical.headwayStandOffM,
   horizonSeconds:3,maxIterations:4,
   roadEnvelope:x=>researchRoadEnvelopeV3(
    out.physical.roadGeometry,x),widthHalfM:out.physical.bodyHalfWidthM,
   scanSeconds:5}):null
 const commands=joint?.requests??queue?.requests??originalRequests
 for(let i=0;i<candidate.states.length;i++){
  const s=candidate.states[i],request=commands[i]
  s.desired=request.speed
  s.targetY=request.targetY
  if(request.guided)requests++
  if(Math.abs(s.y-request.targetY)>EPS)laterals++
  if(request.headway)heads++
 }
 // Step78 research: generate complete synchronized proposed fields BEFORE
 // accepting any rider movement. A64's full swept physical solver evaluates
 // each opt-in proposal on an isolated copy. A rejected proposal is never
 // committed or interpreted as an accepted rider path.
 const prospective=out.pacePolicy==='joint_prospective_v1'?
  chooseProspectivePhysicalTickV3(out.physical,[
   {policy:'baseline',requests:originalRequests},
   {policy:'joint',requests:joint.requests}
  ],advanceNormalStartV3):null
 // A78 P2 local negotiation: 3–8 nearby riders jointly choose legal
 // steering/pace requests, tested as whole-field pre-commit proposals.
 // No candidate can bypass the original swept physical solver.
 const localProspective=['joint_local_negotiation_v1',
  'joint_local_preemptive_v1'].includes(out.pacePolicy)?
  chooseLocalNegotiatedPhysicalTickV3(out.physical,originalRequests,
   joint.requests,advanceNormalStartV3,{
    maxRiders:8,maxEvaluations:7,
    enablePreemptive:out.pacePolicy==='joint_local_preemptive_v1'}):null
 // A79: coordinate many overlapping spatial neighborhoods *before*
 // accepting the synchronized movement. ALL proposals must pass the
 // untouched authoritative swept-body, road-edge and energy solver.
 const useDistributed=['distributed_multiwave_v1','distributed_risk_v1',
  'horizon2_guarded_v1','horizon3_guarded_v1',
  'multisecond_reserve_v1','multisecond_zipper_v1',
  'feasible_window_v1','feasible_conservative_v1',
  'joint_tube_hold_v1','joint_tube_release_v1',
  'consensus_hold_v1','consensus_wave_v1',
  'throughput_strict_v1','throughput_balanced_v1',
  'multirow_gap_strict_v1','multirow_gap_wave_v1',
  'corridor_order_v1','corridor_release_v1',
   'whole_row_strict_v1','whole_row_balanced_v1',
  'premerge_strict_v1','premerge_balanced_v1',
   'trajectory_strict_v1','trajectory_balanced_v1',
   'lease_strict_v1','lease_balanced_v1',
   'cohort_strict_v1','cohort_balanced_v1',
   'rolling_strict_v1','rolling_balanced_v1']
  .includes(out.pacePolicy)
 // Canonical *planning-only* input: mirrored worlds are evaluated in
 // the same symmetric road coordinates. Accepted physical motion is
 // ALWAYS re-swept in the original (possibly reflected) real field.
 const canonical=useDistributed&&out.mirror===true?
  structuredClone(out.physical):out.physical
 if(useDistributed&&out.mirror===true)
  for(const s of canonical.states){
   s.y=round6(4.4-s.y)
   s.targetY=round6(4.4-s.targetY)
  }
 const canonicalRequests=useDistributed&&out.mirror===true?
  originalRequests.map(r=>({...r,targetY:round6(4.4-r.targetY)})):
  originalRequests
 const canonicalJoint=useDistributed&&out.mirror===true?
  jointViabilityCommandsV3(canonical.states,canonicalRequests,{
   headwayM:canonical.headwayStandOffM,
   horizonSeconds:3,maxIterations:4,
   roadEnvelope:x=>researchRoadEnvelopeV3(
    canonical.roadGeometry,x),
   widthHalfM:canonical.bodyHalfWidthM,scanSeconds:5}).requests:
  joint?.requests
 const distributed=useDistributed?
  distributedAdmissionCandidatesV3(canonical.states,canonicalRequests,
   out.originalDesired,{firstExitX:1020,maxLocalRiders:8,rangeM:25}):null
 const distributedProposals=distributed?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   ...distributed.candidates.map(c=>({policy:c.variant,
    requests:c.requests}))
  ]:null
 const distributedChoice=distributed&&['distributed_multiwave_v1',
  'distributed_risk_v1'].includes(out.pacePolicy)?
  chooseDistributedPhysicalTickV3(canonical,distributedProposals,
   advanceNormalStartV3,{qualityMode:
   out.pacePolicy==='distributed_risk_v1'?'spatial_risk':'balanced'}):null
 // When planning used a canonical reflected view, do NOT accept that
 // preview's x/y/v/energy state. Apply the selected request to the
 // unchanged mirrored authoritative physics and reject if it fails.
 if(distributedChoice&&out.mirror===true&&distributedChoice.policy){
  const chosen=distributedProposals.find(p=>
   p.policy===distributedChoice.policy)
  const real=structuredClone(out.physical)
  for(let i=0;i<real.states.length;i++){
   real.states[i].desired=chosen.requests[i].speed
   real.states[i].targetY=round6(4.4-chosen.requests[i].targetY)
  }
  const rechecked=advanceNormalStartV3(real)
  if(rechecked.reason){
   distributedChoice.physical=null
   distributedChoice.firstRejected=rechecked
   distributedChoice.status='NO_SAFE_PROPOSAL'
   distributedChoice.policy=null
  }else distributedChoice.physical=rechecked
 }
 // Step80 receding horizon: each *hypothetical* future movement is
 // accepted only by the unchanged original swept solver. Recalculate
 // bookings from that hypothetical CURRENT state, then discard all
 // projected states. Return only the selected first request for a real
 // physical re-sweep; never commit an imaginary future trajectory.
 const isMultisecond=['multisecond_reserve_v1',
  'multisecond_zipper_v1'].includes(out.pacePolicy)
 const isContract=['feasible_window_v1',
  'feasible_conservative_v1'].includes(out.pacePolicy)
 const isStep83=['joint_tube_hold_v1',
  'joint_tube_release_v1'].includes(out.pacePolicy)
 const isStep84=['consensus_hold_v1',
  'consensus_wave_v1'].includes(out.pacePolicy)
 const isStep85=['throughput_strict_v1',
  'throughput_balanced_v1'].includes(out.pacePolicy)
 const isStep86=['multirow_gap_strict_v1',
  'multirow_gap_wave_v1'].includes(out.pacePolicy)
 const isStep87=['corridor_order_v1',
  'corridor_release_v1'].includes(out.pacePolicy)
 const isStep88=['whole_row_strict_v1',
  'whole_row_balanced_v1'].includes(out.pacePolicy)
 const isStep89=['premerge_strict_v1',
  'premerge_balanced_v1'].includes(out.pacePolicy)
 const isStep90=['trajectory_strict_v1',
  'trajectory_balanced_v1'].includes(out.pacePolicy)
 const isStep91=['lease_strict_v1',
  'lease_balanced_v1'].includes(out.pacePolicy)
 const isStep92=['cohort_strict_v1',
  'cohort_balanced_v1'].includes(out.pacePolicy)
 const isStep93=['rolling_strict_v1',
  'rolling_balanced_v1'].includes(out.pacePolicy)
 const isHorizon=['horizon2_guarded_v1','horizon3_guarded_v1',
  'multisecond_reserve_v1','multisecond_zipper_v1',
  'feasible_window_v1','feasible_conservative_v1',
  'joint_tube_hold_v1','joint_tube_release_v1',
  'consensus_hold_v1','consensus_wave_v1',
  'throughput_strict_v1','throughput_balanced_v1',
  'multirow_gap_strict_v1','multirow_gap_wave_v1',
  'corridor_order_v1','corridor_release_v1',
   'whole_row_strict_v1','whole_row_balanced_v1',
  'premerge_strict_v1','premerge_balanced_v1',
   'trajectory_strict_v1','trajectory_balanced_v1',
   'lease_strict_v1','lease_balanced_v1',
   'cohort_strict_v1','cohort_balanced_v1',
   'rolling_strict_v1','rolling_balanced_v1']
  .includes(out.pacePolicy)
 const futureById=out.mirror===true?
  new Map([...byId].map(([id,items])=>[id,items.map(b=>({
   ...b,targetY:round6(4.4-b.targetY)}))])):byId
 // Provisional 8-second corridor forecasts are computed from the
 // canonical *current* state and original static lane/gate bookings.
 // They do NOT grant physical passage or change official reservations.
 const canonicalBookings=out.mirror===true?
  bookings.map(b=>({...b,targetY:round6(4.4-b.targetY)})):
  bookings
 const consensusPilot=(isStep84||isStep85||isStep86||isStep87||isStep88||isStep89||isStep90||isStep91||isStep92||isStep93)?
  step84ConsensusCandidatesV3(canonical.states,canonicalRequests,{
   horizonSeconds:6,urgentSeconds:3.5}):null
 const gapPilot=(isStep86||isStep87||isStep88||isStep89||isStep90||isStep91||isStep92||isStep93)?
  step86GapCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at,lookAheadM:55,
    movingFloorMps:7.5}):null
 const orderPilot=(isStep87||isStep88||isStep89||isStep90||isStep91||isStep92||isStep93)?
  step87CorridorCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at,minMovingSpeedMps:7.3}):null
 const rowPilot=isStep88?
  step88RowFlowCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at}):null
 const premergePilot=isStep89?
  step89PremergeCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at}):null
 const trajectoryPilot=isStep90?
  step90RowTrajectoryCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at}):null
 const leasePilot=isStep91?
  step91LeaseCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at,
    existingLeases:out.step91Leases}):null
 const cohortPilot=isStep92?
  step92CohortCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at}):null
 const rollingPilot=isStep93?
  step93RollingStartCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at}):null
 const compatibleLeasePilot=isStep92?
  step91LeaseCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at}):null
 const tubePilot=isStep83?
  step83JointTubeCandidatesV3(canonical.states,canonicalRequests,{
   horizonSeconds:6}):null
 const contract=isContract?
  step82ContractCandidatesV3(canonical.states,canonicalRequests,
   canonicalBookings,{atSeconds:canonical.at,searchSeconds:50,
    paceFloor:out.pacePolicy==='feasible_conservative_v1'?7.3:6.7}):null
 const firstReservations=isMultisecond?
  multiSecondReservationCandidatesV3(canonical.states,
   canonicalRequests,canonicalBookings,{
    horizonSeconds:8,nowSeconds:canonical.at,paceFloor:6.4}):null
 const horizonProposals=isStep93?[
    {policy:'baseline',requests:canonicalRequests},
    {policy:'joint',requests:canonicalJoint},
    {policy:'proven_gap_wave',requests:gapPilot.candidates[2].requests},
    {policy:'proven_order_pace',requests:orderPilot.candidates[2].requests},
    {policy:'rolling_straight',requests:rollingPilot.candidates[0].requests},
    {policy:'rolling_gap_match',requests:rollingPilot.candidates[1].requests},
    {policy:'rolling_assist',requests:rollingPilot.candidates[2].requests}
   ]:isStep92?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'proven_gap_wave',requests:gapPilot.candidates[2].requests},
   {policy:'trajectory_flow',requests:step90RowTrajectoryCandidatesV3(
    canonical.states,canonicalRequests,canonicalBookings,
    {atSeconds:canonical.at}).candidates[2].requests},
   {policy:'previous_lease_flow',requests:compatibleLeasePilot.candidates[2].requests},
   {policy:'cohort_hold',requests:cohortPilot.candidates[0].requests},
   {policy:'cohort_yield',requests:cohortPilot.candidates[1].requests},
   {policy:'cohort_flow',requests:cohortPilot.candidates[2].requests}
  ]:isStep91?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'proven_gap_wave',requests:gapPilot.candidates[2].requests},
   {policy:'proven_order_pace',requests:orderPilot.candidates[2].requests},
   {policy:'lease_hold',requests:leasePilot.candidates[0].requests},
   {policy:'lease_yield',requests:leasePilot.candidates[1].requests},
   {policy:'lease_flow',requests:leasePilot.candidates[2].requests}
  ]:isStep90?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'proven_gap_wave',requests:gapPilot.candidates[2].requests},
   {policy:'proven_order_pace',requests:orderPilot.candidates[2].requests},
   {policy:'trajectory_hold',requests:trajectoryPilot.candidates[0].requests},
   {policy:'trajectory_yield',requests:trajectoryPilot.candidates[1].requests},
   {policy:'trajectory_flow',requests:trajectoryPilot.candidates[2].requests}
  ]:isStep89?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'proven_gap_wave',requests:gapPilot.candidates[2].requests},
   {policy:'proven_order_pace',requests:orderPilot.candidates[2].requests},
   {policy:'premerge_hold',requests:premergePilot.candidates[0].requests},
   {policy:'premerge_wave',requests:premergePilot.candidates[1].requests},
   {policy:'premerge_balanced',requests:premergePilot.candidates[2].requests}
  ]:isStep88?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'proven_gap_wave',requests:gapPilot.candidates[2].requests},
   {policy:'proven_order_hold',requests:orderPilot.candidates[0].requests},
   {policy:'proven_order_pace',requests:orderPilot.candidates[2].requests},
   {policy:'proven_consensus_hold',
    requests:consensusPilot.candidates[0].requests},
   {policy:'whole_row_hold',requests:rowPilot.candidates[0].requests},
   {policy:out.pacePolicy==='whole_row_strict_v1'?
    'whole_row_yield':'whole_row_balanced',
    requests:rowPilot.candidates[
     out.pacePolicy==='whole_row_strict_v1'?1:3].requests}
  ]:isStep87?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'proven_gap_wave',requests:gapPilot.candidates[2].requests},
   {policy:'order_hold',requests:orderPilot.candidates[0].requests},
   ...(out.pacePolicy==='corridor_order_v1'?[
    {policy:'order_pace',requests:orderPilot.candidates[2].requests},
    {policy:'proven_consensus_hold',
     requests:consensusPilot.candidates[0].requests}
   ]:[
    {policy:'order_release',requests:orderPilot.candidates[1].requests},
    {policy:'order_balanced',requests:orderPilot.candidates[3].requests}
   ])
  ]:isStep86?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'proven_consensus_hold',
    requests:consensusPilot.candidates[0].requests},
   {policy:'gap_frontload',requests:gapPilot.candidates[1].requests},
   {policy:'gap_hold',requests:gapPilot.candidates[0].requests},
   {policy:'gap_wave',requests:gapPilot.candidates[2].requests}
  ]:isStep85?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'throughput_consensus_hold',
    requests:consensusPilot.candidates[0].requests},
   {policy:out.pacePolicy==='throughput_strict_v1'?
     'throughput_gated_release':'throughput_balanced',
    requests:consensusPilot.candidates[
     out.pacePolicy==='throughput_strict_v1'?3:2].requests},
   {policy:out.pacePolicy==='throughput_strict_v1'?
     'throughput_cruise':'throughput_limited_wave',
    requests:out.pacePolicy==='throughput_strict_v1'?
     distributed.candidates[0].requests:
     consensusPilot.candidates[1].requests}
  ]:isStep84?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   ...(out.pacePolicy==='consensus_hold_v1'?[
    {policy:'consensus_crossing_hold',
     requests:consensusPilot.candidates[0].requests},
    {policy:'consensus_gated_release',
     requests:consensusPilot.candidates[3].requests}
   ]:[
    {policy:'consensus_limited_wave',
     requests:consensusPilot.candidates[1].requests},
    {policy:'consensus_balanced',
     requests:consensusPilot.candidates[2].requests}
   ]),
   {policy:'consensus_other',
    requests:consensusPilot.candidates[
     out.pacePolicy==='consensus_hold_v1'?2:0].requests}
  ]:isStep83?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   ...(out.pacePolicy==='joint_tube_hold_v1'?[
     {policy:'tube_hold_crossing',requests:tubePilot.candidates[0].requests},
     {policy:'tube_coordinated',requests:tubePilot.candidates[2].requests}
   ]:[
     {policy:'tube_yield_corridor',requests:tubePilot.candidates[1].requests},
     {policy:'tube_early_release',requests:tubePilot.candidates[3].requests}
   ]),
   {policy:'tube_other',requests:
    tubePilot.candidates[out.pacePolicy==='joint_tube_hold_v1'?3:0].requests}
  ]:isContract?[
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   {policy:'contract_window_pace',
    requests:contract.candidates[0].requests},
   {policy:'contract_hold_unavailable',
    requests:contract.candidates[1].requests},
   {policy:out.pacePolicy==='feasible_conservative_v1'?
    'contract_leader_protect':'contract_combined',
    requests:out.pacePolicy==='feasible_conservative_v1'?
     contract.candidates[2].requests:contract.candidates[3].requests}
  ]:isMultisecond?
  [
   {policy:'baseline',requests:canonicalRequests},
   {policy:'joint',requests:canonicalJoint},
   ...(out.pacePolicy==='multisecond_zipper_v1'?[
     {policy:'cruise',requests:distributed.candidates[0].requests},
     {policy:'reserved_row_stagger',
      requests:firstReservations.candidates[2].requests}
   ]:[
     {policy:'reserved_lane_hold',
      requests:firstReservations.candidates[1].requests},
     {policy:'reserved_pace_reserve',
      requests:firstReservations.candidates[0].requests}
   ]),
   {policy:'reserved_combined',
    requests:firstReservations.candidates[3].requests}
  ]:distributedProposals?.filter(p=>
   ['baseline','joint','cruise','distributed_hold','zipper'].includes(p.policy))
 const makeFuture=field=>{
  const pseudo={...out,physical:field}
  const requests=field.states.map(r=>({
   id:r.id,...commandForRider(pseudo,r,futureById)}))
  if(requests.some(r=>r.error))return []
  const plans=distributedAdmissionCandidatesV3(field.states,requests,
   out.originalDesired,{firstExitX:1020,maxLocalRiders:8,rangeM:25})
  if(isStep93){
   const current=step93RollingStartCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at})
   return [
    {policy:'future_rolling_straight',requests:current.candidates[0].requests},
    {policy:'future_rolling_gap_match',requests:current.candidates[1].requests},
    {policy:'future_rolling_assist',requests:current.candidates[2].requests}
   ]
  }
  if(isStep92){
   const current=step92CohortCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at})
   return [
    {policy:'future_cohort_hold',requests:current.candidates[0].requests},
    {policy:'future_cohort_yield',requests:current.candidates[1].requests},
    {policy:'future_cohort_flow',requests:current.candidates[2].requests}
   ]
  }
  if(isStep91){
   const current=step91LeaseCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,
     existingLeases:out.step91Leases})
   const old=step86GapCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,lookAheadM:55,movingFloorMps:7.5})
   return [
    {policy:'future_lease_hold',requests:current.candidates[0].requests},
    {policy:'future_lease_yield',requests:current.candidates[1].requests},
    {policy:'future_gap_wave',requests:old.candidates[2].requests}
   ]
  }
  if(isStep90){
   const current=step90RowTrajectoryCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at})
   const old=step86GapCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,lookAheadM:55,movingFloorMps:7.5})
   return [
    {policy:'future_trajectory_hold',requests:current.candidates[0].requests},
    {policy:'future_trajectory_yield',requests:current.candidates[1].requests},
    {policy:'future_gap_wave',requests:old.candidates[2].requests}
   ]
  }
  if(isStep89){
   const p=step89PremergeCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at})
   const prior=step87CorridorCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,minMovingSpeedMps:7.3})
   return [
    {policy:'future_premerge_hold',requests:p.candidates[0].requests},
    {policy:'future_premerge_wave',requests:p.candidates[1].requests},
    {policy:'future_order_hold',requests:prior.candidates[0].requests}
   ]
  }
  if(isStep88){
   const local=step88RowFlowCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at})
   const prior=step87CorridorCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,minMovingSpeedMps:7.3})
   const priorGap=step86GapCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,lookAheadM:55,
     movingFloorMps:7.5})
   return [
    {policy:'future_order_hold',requests:prior.candidates[0].requests},
    {policy:'future_gap_wave',requests:priorGap.candidates[2].requests},
    {policy:'future_row_hold',requests:local.candidates[0].requests}
   ]
  }
  if(isStep87){
   const local=step87CorridorCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,minMovingSpeedMps:7.3})
   const gap=step86GapCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,lookAheadM:55,
     movingFloorMps:7.5})
   return [
    {policy:'future_order_hold',requests:local.candidates[0].requests},
    {policy:'future_order_release',requests:local.candidates[1].requests},
    {policy:'future_gap_wave',requests:gap.candidates[2].requests}
   ]
  }
  if(isStep86){
   const local=step86GapCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,lookAheadM:55,
     movingFloorMps:7.5})
   const consensus=step84ConsensusCandidatesV3(field.states,requests,{
    horizonSeconds:6,urgentSeconds:3.5})
   return [
    {policy:'future_consensus_hold',
     requests:consensus.candidates[0].requests},
    {policy:'future_gap_frontload',requests:local.candidates[1].requests},
    {policy:'future_gap_hold',requests:local.candidates[0].requests}
   ]
  }
  if(isStep85){
   const local=step84ConsensusCandidatesV3(field.states,requests,{
    horizonSeconds:6,urgentSeconds:3.5})
   return [
    {policy:'follow_throughput_baseline',requests},
    {policy:'follow_throughput_hold',
     requests:local.candidates[0].requests},
    {policy:'follow_throughput_release',
     requests:local.candidates[3].requests}
   ]
  }
  if(isStep84){
   const local=step84ConsensusCandidatesV3(field.states,requests,{
    horizonSeconds:6,urgentSeconds:3.5})
   return [
    {policy:'follow_consensus_hold',
     requests:local.candidates[0].requests},
    {policy:'follow_consensus_wave',
     requests:local.candidates[1].requests},
    {policy:'follow_consensus_balanced',
     requests:local.candidates[2].requests}
   ]
  }
  if(isStep83){
   const local=step83JointTubeCandidatesV3(field.states,requests,{
    horizonSeconds:6})
   return [
    {policy:'follow_tube_hold',requests:local.candidates[0].requests},
    {policy:'follow_tube_yield',requests:local.candidates[1].requests},
    {policy:'follow_tube_coupled',requests:local.candidates[2].requests}
   ]
  }
  if(isContract){
   const local=step82ContractCandidatesV3(field.states,requests,
    canonicalBookings,{atSeconds:field.at,searchSeconds:50,
     paceFloor:out.pacePolicy==='feasible_conservative_v1'?7.3:6.7})
   return [
    {policy:'follow_contract_pace',requests:local.candidates[0].requests},
    {policy:'follow_contract_hold',requests:local.candidates[1].requests},
    {policy:'follow_contract_assist',requests:local.candidates[2].requests}
   ]
  }
  if(isMultisecond){
   const planned=multiSecondReservationCandidatesV3(field.states,requests,
    canonicalBookings,{horizonSeconds:8,nowSeconds:field.at,paceFloor:6.4})
   return [
    {policy:'follow_booked_speed',
     requests:planned.candidates[0].requests},
    {policy:'follow_booked_hold',
     requests:planned.candidates[1].requests},
    {policy:'follow_booked_combined',
     requests:planned.candidates[3].requests}
   ]
  }
  return [
   {policy:'follow_baseline',requests},
   {policy:'follow_hold',requests:plans.candidates[1].requests},
   {policy:'follow_zipper',requests:plans.candidates[2].requests}
  ]
 }
 const horizon=(isStep85||isStep86||isStep87||isStep88||isStep89||isStep90||isStep91||isStep92||isStep93)?
  chooseThroughputGuardedTickV3(canonical,horizonProposals,
   makeFuture,advanceNormalStartV3,{
    depth:3,maxFirst:isStep93?7:isStep92?8:isStep91?7:isStep90?7:isStep89?7:isStep88?8:isStep86||isStep87?6:5,maxFuture:3,
    clearanceFirst:isStep86||isStep87||isStep88||isStep89||isStep90||isStep91||isStep92,
    strictNoNearStops:out.pacePolicy==='throughput_strict_v1'||
     out.pacePolicy==='multirow_gap_strict_v1'||
     out.pacePolicy==='corridor_order_v1'||
     out.pacePolicy==='whole_row_strict_v1'||
     out.pacePolicy==='premerge_strict_v1'||
     out.pacePolicy==='trajectory_strict_v1'||
     out.pacePolicy==='lease_strict_v1'||
     out.pacePolicy==='cohort_strict_v1'||
      out.pacePolicy==='rolling_strict_v1',
    minimumMovingSpeedMps:out.pacePolicy==='throughput_strict_v1'||
     out.pacePolicy==='multirow_gap_strict_v1'||
     out.pacePolicy==='corridor_order_v1'||
     (out.pacePolicy==='whole_row_strict_v1'||
     out.pacePolicy==='premerge_strict_v1'||
     out.pacePolicy==='trajectory_strict_v1'||
     out.pacePolicy==='lease_strict_v1'||
     out.pacePolicy==='cohort_strict_v1'||
      out.pacePolicy==='rolling_strict_v1')?7.5:6.5
   }):
  isHorizon?
  chooseRecedingHorizonTickV3(canonical,horizonProposals,
   makeFuture,advanceNormalStartV3,{
    depth:out.pacePolicy==='horizon2_guarded_v1'?2:3,
    maxFirst:5,maxFuture:3}):null
 let horizonActual=null
 if(horizon?.selectedPolicy){
  const selected=horizonProposals.find(p=>
   p.policy===horizon.selectedPolicy)
  const strictReal=structuredClone(out.physical)
  for(let i=0;i<strictReal.states.length;i++){
   strictReal.states[i].desired=selected.requests[i].speed
   strictReal.states[i].targetY=out.mirror===true?
    round6(4.4-selected.requests[i].targetY):
    selected.requests[i].targetY
  }
  horizonActual=advanceNormalStartV3(strictReal)
 }
 const next=isHorizon?
  (horizonActual??horizon?.firstRejected):
  distributedChoice?
  (distributedChoice.physical??distributedChoice.firstRejected):
  localProspective?
  (localProspective.physical??localProspective.firstRejected):
  prospective?
  (prospective.physical??prospective.firstRejected):
  advanceNormalStartV3(candidate)
 if(isStep93){
  out.step93EarlyRolling+=rollingPilot.plan.earlyRolling
  out.step93UnsafeMerges+=rollingPilot.plan.unsafeMerges
  out.step93CrossingWarnings+=rollingPilot.plan.crossingWarnings
  out.step93HeadwayWarnings+=rollingPilot.plan.sameCorridorHeadways
  if(horizon?.selectedPolicy){
   out.step93SelectedTicks++
   out.step93SelectedPolicies[horizon.selectedPolicy]=
    (out.step93SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step93NoGoTicks++
 }
 if(isStep92){
  out.step92ConnectedCohorts+=cohortPilot.plan.connectedCohorts
  out.step92MultiRowCohorts+=cohortPilot.plan.multiRowCohorts
  out.step92ProjectedCrossings+=cohortPilot.plan.predictedCrossings
  out.step92HeldRiders+=cohortPilot.plan.heldRiders
  if(horizon?.selectedPolicy){
   out.step92SelectedTicks++
   out.step92SelectedPolicies[horizon.selectedPolicy]=
    (out.step92SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step92NoGoTicks++
 }
 if(isStep91){
  out.step91Renewed+=leasePilot.plan.kept
  out.step91Acquired+=leasePilot.plan.acquired
  out.step91Expired+=leasePilot.plan.expired
  if(horizon?.selectedPolicy){
   out.step91SelectedTicks++
   out.step91SelectedPolicies[horizon.selectedPolicy]=
    (out.step91SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step91NoGoTicks++
 }
 if(isStep90){
  out.step90Edges+=trajectoryPilot.plan.edges.length
  out.step90Holds+=trajectoryPilot.plan.holdCount
  if(horizon?.selectedPolicy){
   out.step90SelectedTicks++
   out.step90SelectedPolicies[horizon.selectedPolicy]=
    (out.step90SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step90NoGoTicks++
 }
 if(isStep89){
  out.step89Constraints+=premergePilot.plan.constraints.length
  out.step89Holds+=premergePilot.plan.held.filter(Boolean).length
  if(horizon?.selectedPolicy){
   out.step89SelectedTicks++
   out.step89SelectedPolicies[horizon.selectedPolicy]=
    (out.step89SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step89NoGoTicks++
 }
 if(isStep88){
  out.step88RowEdges+=rowPilot.plan.edges.length
  out.step88OccupiedPairTicks+=rowPilot.plan.occupiedPairs
  out.step88HeldRiderTicks+=rowPilot.plan.heldRiders
  out.step88BlockedStops+=horizon?.blockedNearStops??0
  if(horizon?.selectedPolicy){
   out.step88SelectedTicks++
   out.step88SelectedPolicies[horizon.selectedPolicy]=
    (out.step88SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step88NoGoTicks++
 }
 if(isStep87){
  out.step87OrderEdges+=orderPilot.order.edges.length
  out.step87WindowWarnings+=orderPilot.order.warnings.length
  out.step87BlockedStopCandidates+=horizon?.blockedNearStops??0
  if(horizon?.selectedPolicy){
   out.step87SelectedTicks++
   out.step87SelectedPolicies[horizon.selectedPolicy]=
    (out.step87SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step87NoGoTicks++
 }
 if(isStep86){
  out.step86HeldRiderTicks+=gapPilot.plan.holdRequests
  out.step86Warnings+=gapPilot.plan.sharedCorridorWarnings
  out.step86BlockedNoStopTrials+=horizon?.blockedNearStops??0
  if(horizon?.selectedPolicy){
   out.step86SelectedTicks++
   out.step86SelectedPolicies[horizon.selectedPolicy]=
    (out.step86SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step86NoGoTicks++
 }
 if(isStep85){
  out.step85RejectedStopCandidates+=horizon?.blockedNearStops??0
  if(horizon?.selectedPolicy){
   out.step85SelectedTicks++
   out.step85SelectedPolicies[horizon.selectedPolicy]=
    (out.step85SelectedPolicies[horizon.selectedPolicy]??0)+1
  }else out.step85NoGoTicks++
 }
 if(isStep84&&consensusPilot){
  out.step84UrgentPairTicks+=consensusPilot.consensus.urgentPairs
  out.step84HeldRequestTicks+=consensusPilot.consensus.holdCount
  if(horizon?.selectedPolicy){
   out.step84SelectedTicks++
   out.step84SelectedPolicies[horizon.selectedPolicy]=
    (out.step84SelectedPolicies[horizon.selectedPolicy]??0)+1
  }
 }
 if(tubePilot){
  out.step83PredictedRiskTicks+=tubePilot.tubes.warnings.length
  out.step83LinkedGroupRiderTicks+=tubePilot.tubes.groups.reduce(
   (sum,g)=>sum+g.length,0)
  if(horizon?.selectedPolicy){
   out.step83SelectedTicks++
   out.step83SelectedPolicies[horizon.selectedPolicy]=
    (out.step83SelectedPolicies[horizon.selectedPolicy]??0)+1
  }
 }
 if(contract){
  out.step82AdjustedTimeTicks+=contract.contract.adjusted
  if(contract.contract.status==='REQUEST_CONTRACT_NECESSARY_CONSISTENT')
   out.step82ConsistencyTicks++
  else out.step82ConflictTicks+=contract.contract.contradictions.length
  if(horizon?.selectedPolicy){
   out.step82SelectedTicks++
   out.step82SelectedPolicies[horizon.selectedPolicy]=
    (out.step82SelectedPolicies[horizon.selectedPolicy]??0)+1
  }
 }
 if(firstReservations){
  out.multisecondForecastEdgeTicks+=firstReservations.forecast.edges.length
  if(horizon?.selectedPolicy){
   out.multisecondSelectedTicks++
   out.multisecondPolicyTicks[horizon.selectedPolicy]=
    (out.multisecondPolicyTicks[horizon.selectedPolicy]??0)+1
  }
 }
 if(horizon){
  out.horizonRejectedPredictions+=horizon.evidence.filter(x=>
   (isStep85||isStep86||isStep87||isStep88||isStep89||isStep90||isStep91||isStep92||isStep93)?(!x.physicallyAccepted||!x.fullHorizon||
    x.rejectedBySportingBudget):(!x.accepted||!x.futureComplete)).length
  if(horizon.selectedPolicy){
   out.horizonSelectedTicks++
   out.horizonSelectedPolicies[horizon.selectedPolicy]=
    (out.horizonSelectedPolicies[horizon.selectedPolicy]??0)+1
   if(horizon.physicallySafeLookaheadTicks===
    (out.pacePolicy==='horizon2_guarded_v1'?2:3))
    out.horizonFullLookaheadTicks++
  }
 }
 if(distributedChoice){
  out.distributedRejectedTrialCount+=distributedChoice.rejectedUncommitted
  out.distributedRiskEdgeTicks+=distributed.graph.edgeCount
  out.distributedOverlappingRiderTicks+=distributed.graph.overlappingRiders
  const selected=distributedChoice.policy
  if(selected){
   out.distributedSelectedTicks++
   out.distributedPolicyTicks[selected]=(out.distributedPolicyTicks[selected]??0)+1
  }
 }
 if(localProspective){
  out.localNegotiatedTicks+=localProspective.policy?.startsWith('local_')||
   localProspective.policy?.startsWith('joint_')?1:0
  out.localRejectedTrialTicks+=localProspective.rejectedUncommitted
  out.localNeighborhoodRiderTicks+=localProspective.neighborhoodSize
 }
 if(prospective){
  out.prospectiveRejectedProposals+=prospective.probes.filter(
   x=>!x.accepted).length
  if(prospective.policy==='baseline')out.prospectiveBaselineTicks++
  else if(prospective.policy==='joint')out.prospectiveJointTicks++
 }
 // Never expose temporary speed intentions as permanent achieved motion.
 // Real x/y/v/energy and steering target are accepted only by the unchanged
 // physics solver. An unsuccessful tick retains EXACT previous rider state.
 if(!next||next.reason){
  out.reason=next?.reason??((isStep85||isStep86||isStep87||isStep88||isStep89||isStep90||isStep91||isStep92||isStep93)?
    horizon?.status??'NO_ACCEPTABLE_PROPOSAL':
    'NO_ACCEPTABLE_PROPOSAL');out.status='REJECTED'
  out.firstCollision=next?.firstCollision??null
  out.firstRoadViolation=next?.firstRoadViolation??null
  out.energyFailure=next?.energyFailure??null
  return out
 }
 if(isStep91){
  // Renew only AFTER the ORIGINAL A64 accepted this actual tick.
  // Mirrored worlds normalize to geometry-neutral planning coordinates.
  const achieved=out.mirror===true?structuredClone(next):next
  if(out.mirror===true)for(const s of achieved.states){
   s.y=round6(4.4-s.y)
   s.targetY=round6(4.4-s.targetY)
  }
  out.step91Leases=step91AcceptedLeaseUpdateV3(
   achieved.states,canonicalBookings,{atSeconds:achieved.at,
    existingLeases:out.step91Leases})
 }
 for(const s of next.states)s.desired=out.originalDesired[s.id]
 out.physical=next
 out.commandedRiderTicks+=requests
 out.lateralRequestTicks+=laterals
 out.headwayWarningTicks+=heads
 out.queueProtectedLeaderTicks+=(queue?.protectedLeaders??0)
 out.queueEarlyBrakeRiderTicks+=(queue?.earlyBrakeRequests??0)
 out.jointBlockedLaneChangeTicks+=(joint?.blockedLaneChanges??0)
 out.jointLeadProtectionTicks+=(joint?.leadProtection??0)
 out.jointEarlyBrakeRiderTicks+=(joint?.earlyBrakeCommands??0)
 out.jointUnresolvedWarningTicks+=(joint?.unresolvedOneSecondPairs??0)
 out.status='IN_PROGRESS'
 return out
}
export function runMultiGatePhysicalCandidateV3(initial,{seconds=180}={}){
 validate(initial)
 assert(Number.isFinite(seconds)&&seconds>=0&&seconds<=3600&&
  seconds/DT===Math.round(seconds/DT),'A77 invalid race horizon')
 let next=structuredClone(initial),end=next.physical.at+seconds
 while(next.physical.at<end-EPS&&!next.reason)
  next=advanceMultiGatePhysicalCandidateV3(next)
 return next
}
export function multiGatePhysicalMetricsV3(initial,final){
 validate(initial);validate(final)
 const metrics=finishNormalStartMetricsV3(initial.physical,final.physical)
 return {study:'A77_MULTI_GATE_COUPLED_CANDIDATE',
  n:initial.physical.states.length,geometry:initial.physical.roadGeometry,
  reason:final.reason,acceptedSeconds:final.physical.at,
  status:final.reason||metrics.status,
  nearStops:metrics.nearStopRiderTicks,
  laneChanges:metrics.completedLaneChanges,
  allPastSecondReopening:final.physical.states.every(s=>s.x>1470),
  rearX:Math.min(...final.physical.states.map(s=>s.x)),
  firstCollision:final.firstCollision??null,
  firstRoadViolation:final.firstRoadViolation??null,
  physicallyAcceptedMotion:final.physical.acceptedSteps>0,
  bookedCount:final.admission.bookedCount,
  noProductionApproval:true,officialWrites:0}
}
