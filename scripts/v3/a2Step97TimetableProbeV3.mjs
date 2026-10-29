/** Step97 research-only alternate global timetable at t=0.
 * Replaces *only* synthetic future gate bookings before any rider moves,
 * never a historical/accepted x/y/v/energy or live race record.
 * The original A64 swept body+road+W-prime is always authoritative.
 */
import {createMultiGatePhysicalCandidateV3} from './a2MultiGatePhysicalCandidateV3.mjs'
import {auditMultiGateAdmissionV3} from './a2MultiGateAdmissionV3.mjs'
import {step97NecessaryTimetableAuditV3} from './a2Step97FeasibilityCertificateV3.mjs'
export function step97BuildGlobalTimetableProbeV3(n,{
 roadGeometry='double_pinch',pacePolicy='local_gap_strict_v1',
 mirror=false,renamed=false,rollingStartSpeedMps=null,
 spacingSeconds=.35
}={}){
 if(![.35,.40,.50].some(t=>Math.abs(t-spacingSeconds)<1e-8))
  throw Error('A97 unsupported global temporal slot interval')
 const initial=createMultiGatePhysicalCandidateV3(n,{
  mode:'five_dense',roadGeometry,pacePolicy,mirror,renamed,
  controllerPolicy:'coordinated_demand',
  headwayStandOffM:4.5,coreMergePolicy:'preview_only',
  rollingStartSpeedMps})
 const physicalBefore=JSON.stringify(initial.physical)
 const original=step97NecessaryTimetableAuditV3(
  initial.physical.states,initial.admission)
 const proposal=auditMultiGateAdmissionV3(
  initial.physical.states,roadGeometry,{
   half:.3,separation:.8001,minSpeedMps:6.5,
   maxSpeedMps:50,spacingSeconds,deadlineSeconds:180
  })
 const audit=step97NecessaryTimetableAuditV3(
  initial.physical.states,proposal)
 if(proposal.status!=='NECESSARY_WINDOWS_EXIST'||
  proposal.bookedCount!==2*n||
  audit.status!=='NECESSARY_TIMING_ONLY'||
  JSON.stringify(initial.physical)!==physicalBefore)
  throw Error('A97 no complete unchanged-physics global booking certificate')
 // A necessary schedule is not proof of safe arrival or full race.
 initial.admission=proposal
 return {initial,originalCertificate:original,
  proposedCertificate:audit,slotSpacingSeconds:spacingSeconds,
  syntheticInitialBookingsOnly:true,noTrajectoryGuarantee:true,
  officialWrites:0}
}
