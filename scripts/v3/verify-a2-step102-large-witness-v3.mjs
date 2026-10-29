/** Original A64 0.5s full-body x/y/v/energy witness, not cell prediction.
 * Both geometry gates and Step100 bookings are unchanged and read only.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step100TimeExpandedOccupancyV3}
 from './a2Step100TimeExpandedOccupancyV3.mjs';
import {step102OriginalA64WitnessV3}
 from './a2Step102ContinuousA64WitnessV3.mjs';
const results=[];
for(const n of [106,168])
for(const roadGeometry of ['staged_pinch','double_pinch']){
 const initial=step97BuildGlobalTimetableProbeV3(n,{
    roadGeometry,pacePolicy:'persistent_global_strict_v1',
    rollingStartSpeedMps:9,spacingSeconds:.35}).initial;
 const before=JSON.stringify(initial);
 const lattice=step100TimeExpandedOccupancyV3(
    initial.physical.states,initial.admission.gates,
    initial.admission.bookings);
 assert.equal(lattice.appointmentCount,2*n);
 for(const mode of ['convoy','row_wave','scheduled_merge']){
   const probe=step102OriginalA64WitnessV3(initial.physical,
     initial.admission.bookings,lattice.appointments,{
       mode,seconds:30});
   const x=probe.evidence;
   assert.equal(JSON.stringify(initial),before);
   assert.equal(x.officialWrites,0);
   assert.equal(x.noGroupSpeedLock,true);
   assert.equal(x.eightSecondGroupRulePreserved,true);
   assert.equal(x.acceptedSamples,x.acceptedSeconds*2);
   assert(x.acceptedSeconds<=30);
   assert(!x.rejected.length||x.rejected.length===1);
   assert(!x.rejected.length||x.reason!==null);
   assert.equal(probe.physical.reason,null);
   results.push({n,roadGeometry,mode,
      acceptedSeconds:x.acceptedSeconds,requestedSeconds:30,
      failure:x.reason,fullRequestedPhysical:x.status===
       'FULL_REQUESTED_HORIZON_ACCEPTED',
      firstGatePassedByEveryRider:x.firstGatePassedByEveryRider,
      secondGatePassedByEveryRider:x.secondGatePassedByEveryRider,
      eightSecondGroupsStart:x.initialRaceGroups,
      eightSecondGroupsEnd:x.finalRaceGroups,
      minAcceptedSpeed:x.minAcceptedSpeedMps,
      commandedSteering:x.commandedSteering,
      physicallyAcceptedSteering:x.acceptedSteering,
      physicalTraceHash:x.physicalTraceHash,
      firstRejected:x.rejected[0]??null,
      exactOriginalPhysicalSolver:true,
      full180SportingAccepted:false});
 }
}
const report={study:'A102_FIRST_30S_ORIGINAL_A64_106_168_CONTINUOUS',
  physical30SecondWitnesses:results.filter(x=>x.fullRequestedPhysical).length,
  actualCases:results.length,
  sportingMilestoneA:'NO_GO_180S_AND_SECOND_GATE_NOT_PROVEN',
  step99ComparisonBestSeconds:4.5,
  physicalSolverUnchanged:true,originalBookingsUnchanged:true,
  eightSecondGroupRulePreserved:true,officialWrites:0,results};
const dir=process.env.V3_A2_STEP102_DIR??'/tmp/a102';
mkdirSync(dir,{recursive:true});
writeFileSync(dir+'/step102-original-a64-witness.json',
 JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
