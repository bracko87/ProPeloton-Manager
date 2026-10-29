import assert from 'node:assert/strict';
import {step97BuildGlobalTimetableProbeV3}
  from './a2Step97TimetableProbeV3.mjs';
import {step100TimeExpandedOccupancyV3}
  from './a2Step100TimeExpandedOccupancyV3.mjs';
import {step102JointPhysicalCommandsV3,step102OriginalA64WitnessV3}
  from './a2Step102ContinuousA64WitnessV3.mjs';
function fixture(n,roadGeometry,mirror=false,renamed=false){
 const initial=step97BuildGlobalTimetableProbeV3(n,{
   roadGeometry,rollingStartSpeedMps:9,
   mirror,renamed,spacingSeconds:.35,
   pacePolicy:'persistent_global_strict_v1'}).initial;
 const result=step100TimeExpandedOccupancyV3(initial.physical.states,
   initial.admission.gates,initial.admission.bookings);
 assert.equal(result.appointmentCount,n*2);
 return {physical:initial.physical,
   bookings:initial.admission.bookings,
   appointments:result.appointments};
}
const f=fixture(8,'double_pinch');
const before=JSON.stringify(f);
const p=step102JointPhysicalCommandsV3(f.physical,
 f.bookings,f.appointments);
assert.equal(p.mode,'row_wave');
assert.equal(p.requests.length,8);
assert.equal(JSON.stringify(f),before);
for(const mode of ['convoy','row_wave','scheduled_merge']){
 const run=step102OriginalA64WitnessV3(f.physical,
   f.bookings,f.appointments,{mode,seconds:8,keepFullTrace:true});
 assert.equal(run.evidence.officialWrites,0);
 assert.equal(run.evidence.initialRaceGroups,1);
 assert.equal(run.evidence.eightSecondGroupRulePreserved,true);
 assert.equal(run.evidence.acceptedSamples,run.evidence.acceptedSeconds*2);
 assert(run.evidence.acceptedSeconds>=0.5);
 assert(!run.evidence.full180SportingAccepted);
 assert(!run.evidence.rejected.some(x=>x.reason==='COLLISION_ACCEPTED'));
 assert.equal(run.physical.reason,null);
 assert.equal(JSON.stringify(f),before);
}
// The restart must reproduce *identical accepted bicycle x/y/v and W-prime*.
const full=step102OriginalA64WitnessV3(f.physical,
  f.bookings,f.appointments,{mode:'convoy',seconds:8});
assert(full.evidence.acceptedSeconds>=4&&full.evidence.acceptedSeconds<=8);
const first=step102OriginalA64WitnessV3(f.physical,
  f.bookings,f.appointments,{mode:'convoy',seconds:4});
const second=step102OriginalA64WitnessV3(
 JSON.parse(JSON.stringify(first.physical)),f.bookings,f.appointments,
 {mode:'convoy',seconds:4});
assert.equal(first.evidence.acceptedSeconds+second.evidence.acceptedSeconds,
 full.evidence.acceptedSeconds);
assert.equal(second.evidence.reason,full.evidence.reason);
assert.deepEqual(second.physical,full.physical);
const wrong=structuredClone(f.appointments);
wrong[0].id='not-a-rider';
assert.throws(()=>step102OriginalA64WitnessV3(
  f.physical,f.bookings,wrong));
assert.throws(()=>step102JointPhysicalCommandsV3(
  f.physical,f.bookings,f.appointments,{mode:'unsafe'}));
// Group starting identity must survive original-A64 motion: even a full
// starting 32 field is ONE peloton, not 32 synthetic solo groups.
const group32=fixture(32,'staged_pinch');
const thirtyTwo=step102OriginalA64WitnessV3(
 group32.physical,group32.bookings,group32.appointments,
 {mode:'convoy',seconds:4});
assert.equal(thirtyTwo.evidence.initialRaceGroups,1);
assert(thirtyTwo.evidence.acceptedSeconds>=.5&&thirtyTwo.evidence.acceptedSeconds<=4);
console.log(JSON.stringify({study:'A102_ORIGINAL_A64_SIMULTANEOUS_PATH_WITNESS',
 status:'PASS',modes:['convoy','row_wave','scheduled_merge'],
 checkpointReplayExact:true,smallFieldActuallyAcceptedSeconds:full.evidence.acceptedSeconds,
 smallFieldFailure:full.evidence.reason,
 actualA64SweptAcceptedSteps:full.physical.acceptedSteps,
 one32RiderStartingPeloton:true,
 eightSecondGroupsRetained:true,
 onlyAcceptedPhysicsPersisted:true,
 largeFieldFullSportingProven:false,officialWrites:0}));
