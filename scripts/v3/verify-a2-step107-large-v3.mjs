/** Verify actual A64 physical passage only, no timetable false positives. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step107RunOriginalA64ReservationsV3}
 from './a2Step107GlobalLaneReservationsV3.mjs';
const modes=['slots_compact','slots_balanced','slots_throughput',
 'slots_staggered','slots_conservative','slots_variable'];
const cases=[];
for(const n of [106,168])for(const roadGeometry of
 ['staged_pinch','double_pinch']){
 const f=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry,rollingStartSpeedMps:9,
  pacePolicy:'persistent_global_strict_v1',spacingSeconds:.35}).initial;
 const before=JSON.stringify(f);
 for(const mode of modes)for(const centerTie of ['left','right']){
  const p=step107RunOriginalA64ReservationsV3(
   f.physical,f.admission.bookings,{mode,centerTie,seconds:180});
  const e=p.evidence;
  assert.equal(JSON.stringify(f),before);
  assert.equal(p.physical.reason,null);
  assert.equal(e.officialWrites,0);
  assert.equal(e.physicallyAssignedAllRiders,true);
  assert.equal(e.unassignedCenters,0);
  assert.equal(e.sameEightSecondRaceGroupRule,true);
  assert.equal(e.acceptedSeconds*2,e.acceptedSamples);
  assert(e.acceptedSeconds>=0&&e.acceptedSeconds<=180);
  cases.push({n,roadGeometry,mode,centerTie,
   acceptedSeconds:e.acceptedSeconds,
   reached180Seconds:e.fullRequestedHorizonAccepted,
   passedFirstNarrowing:e.actualFirstGatePassed,
   passedSecondNarrowing:e.actualSecondGatePassed,
   firstRejected:e.firstRejected,
   allRidersInOnePeloton:e.pelotonRiders===n,
   groupCount:e.groupCount,
   actualMinSpeed:e.minActualSpeed,
   geometryAllocation:e.geometryAllocation,
   unassignedCenters:e.unassignedCenters,
   commandedEarlySteering:e.earlySteeringRiderTicks,
   blockedEarlySteering:e.blockedEarlySteeringTicks,
   globalSpeedCapTicks:e.speedLimitedRiderTicks,
   savedPhysicalTraceHash:e.checkpointTraceHash,
   originalPhysicsOnly:true,officialWrites:0});
 }
}
const report={study:'A107_GLOBAL_TWO_LANE_RESERVATION_A64_ACTUAL',
 physicalCases:cases.length,
 finished180:cases.filter(c=>c.reached180Seconds).length,
 allPassedFirstGate:cases.filter(c=>c.passedFirstNarrowing).length,
 allPassedSecondGate:cases.filter(c=>c.passedSecondNarrowing).length,
 bestAcceptedSeconds:Math.max(...cases.map(c=>c.acceptedSeconds)),
 previousCertifiedBestSeconds:14,
 groupRuleEightSecondsUntouched:true,
 bothMirrorBranchesPhysicallyTested:true,
 everyRiderReserved:true,
 originalA64Unchanged:true,officialWrites:0,
 milestoneA:'NO_GO_UNTIL_PHYSICALLY_CHECKED_180S_BOTH_GATES',cases};
const dir=process.env.V3_A2_STEP107_DIR??'/tmp/a107';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step107-original-a64-global-reservation.json',
 JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
