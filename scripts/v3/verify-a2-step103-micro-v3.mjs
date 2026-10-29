import assert from 'node:assert/strict';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step103ClearanceRequestsV3,step103RunA64ClearanceV3}
 from './a2Step103PreTaperClearanceV3.mjs';
function make(n,roadGeometry,mirror=false,renamed=false){
 const f=step97BuildGlobalTimetableProbeV3(n,{
   roadGeometry,pacePolicy:'persistent_global_strict_v1',
   rollingStartSpeedMps:9,spacingSeconds:.35,mirror,renamed});
 return {physical:f.initial.physical,bookings:f.initial.admission.bookings};
}
const fixture=make(8,'staged_pinch');
const frozen=JSON.stringify(fixture);
const choices=['preopen_moderate','preopen_deep','row_phase',
 'early_join','frontload_inner'];
for(const mode of choices){
 const p=step103ClearanceRequestsV3(fixture.physical,fixture.physical,{mode});
 assert.equal(p.requests.length,8);
 assert.equal(p.groupSpeedLock,false);
 assert.equal(p.officialWrites,0);
 const v=step103RunA64ClearanceV3(fixture.physical,fixture.bookings,{
   mode,seconds:3,recordTrace:true});
 assert.equal(v.evidence.exactEightSecondGroupRule,true);
 assert.equal(v.evidence.collisionFreeAcceptedPrefix,true);
 assert.equal(v.evidence.acceptedSteps,v.evidence.acceptedSeconds*2);
 assert(v.evidence.acceptedSeconds>=.5);
 assert.equal(v.physical.reason,null,'a rejected preview may not be committed');
}
const a=step103RunA64ClearanceV3(fixture.physical,fixture.bookings,{
  mode:'preopen_moderate',seconds:2});
const b=step103RunA64ClearanceV3(fixture.physical,fixture.bookings,{
  mode:'preopen_moderate',seconds:1});
const c=step103RunA64ClearanceV3(fixture.physical,fixture.bookings,{
  mode:'preopen_moderate',seconds:1,
  startPhysical:JSON.parse(JSON.stringify(b.physical))});
assert.equal(a.evidence.acceptedSeconds,2);
assert.equal(b.evidence.acceptedSeconds,1);
assert.equal(c.evidence.acceptedSeconds,1);
assert.deepEqual(c.physical,a.physical,'A64 serialized physical replay must be exact');
assert.equal(JSON.stringify(fixture),frozen);
assert.throws(()=>step103ClearanceRequestsV3(fixture.physical,
 fixture.physical,{mode:'invalid'}));
assert.throws(()=>step103RunA64ClearanceV3(fixture.physical,
 fixture.bookings,{seconds:31.2}));
const x=make(32,'double_pinch');
const groups=step103RunA64ClearanceV3(x.physical,x.bookings,{
 mode:'preopen_moderate',seconds:1});
assert.equal(groups.evidence.pelotonRiders,32);
assert.equal(groups.evidence.physicalGroupCount,1);
console.log(JSON.stringify({study:'A103_PRETAPER_CLEARANCE_MICRO',
 status:'PASS',physicalModes:choices,exact1plus1Checkpoint:true,
 physical0point5Safety:true,initial32Peloton:true,
 eightSecondGroupsUnchanged:true,originalA64Unchanged:true,
 officialWrites:0}));
