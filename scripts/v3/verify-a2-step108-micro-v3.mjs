import assert from 'node:assert/strict';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step107GlobalSlotCommandsV3}
 from './a2Step107GlobalLaneReservationsV3.mjs';
import {step108JointCommandsV3,step108SelectPhysicalTickV3,
 step108RunOriginalA64V3} from './a2Step108JointMovingA64V3.mjs';
function fixture(n,road='staged_pinch',mirror=false,renamed=false){
 const a=step97BuildGlobalTimetableProbeV3(n,{
   roadGeometry:road,pacePolicy:'persistent_global_strict_v1',
   rollingStartSpeedMps:9,spacingSeconds:.35,mirror,renamed}).initial;
 return {physical:a.physical,bookings:a.admission.bookings};
}
const f=fixture(8),before=JSON.stringify(f);
const modes=['base','floor','wave','fast','compact','stagger'];
const baseline=step108JointCommandsV3(f.physical,f.physical,
 f.bookings,{mode:'base',centerTie:'left'});
const old=step107GlobalSlotCommandsV3(f.physical,f.physical,
 f.bookings,{mode:'slots_balanced',centerTie:'left'});
assert.deepEqual(baseline.requests,old.requests);
for(const mode of modes){
 const p=step108JointCommandsV3(f.physical,f.physical,
  f.bookings,{mode,centerTie:'left'});
 assert.equal(p.requests.length,8);
 assert.equal(p.completeRoster,true);
 assert.equal(p.officialWrites,0);
 assert.equal(p.achievedSpeedGateMandatory,true);
 const run=step108RunOriginalA64V3(f.physical,f.bookings,{
  seconds:1,centerTie:'left',depth:2,modes:[mode]});
 assert.equal(run.evidence.acceptedSeconds,1);
 assert.equal(run.evidence.acceptedTicks,2);
 assert.equal(run.evidence.exactEightSecondRule,true);
 assert.equal(run.physical.reason,null);
}
const opts={centerTie:'left',depth:2,modes:['base','floor','wave']};
const first=step108SelectPhysicalTickV3(f.physical,f.physical,
 f.bookings,opts);
assert.equal(first.status,'A64_AND_STEP95_RECHECKED');
assert.equal(first.previewsDiscarded,true);
assert.equal(first.physical.at,.5);
const full=step108RunOriginalA64V3(f.physical,f.bookings,{
 ...opts,seconds:2});
const partial=step108RunOriginalA64V3(f.physical,f.bookings,{
 ...opts,seconds:1});
const resume=step108RunOriginalA64V3(f.physical,f.bookings,{
 ...opts,seconds:1,checkpoint:structuredClone(partial.physical)});
assert.equal(full.evidence.acceptedSeconds,2);
assert.deepEqual(full.physical,resume.physical);
const m=fixture(8,'staged_pinch',true);
const n=fixture(8,'staged_pinch',false,true);
for(const [z,centerTie] of [[m,'right'],[n,'left']]){
 const cmds=step108JointCommandsV3(z.physical,z.physical,z.bookings,{
   mode:'base',centerTie});
 assert.deepEqual(cmds.requests.map(r=>r.speed),
    baseline.requests.map(r=>r.speed));
}
const g=fixture(32,'double_pinch');
const groups=step108RunOriginalA64V3(g.physical,g.bookings,{
 centerTie:'left',seconds:1,depth:2,modes:['base','floor']});
assert.equal(groups.evidence.groupCount,1);
assert.equal(groups.evidence.pelotonCount,32);
assert.equal(groups.evidence.officialWrites,0);
assert.throws(()=>step108JointCommandsV3(f.physical,f.physical,
 f.bookings,{mode:'bad'}));
assert.throws(()=>step108SelectPhysicalTickV3(f.physical,f.physical,
 f.bookings,{depth:7}));
assert.equal(JSON.stringify(f),before);
console.log(JSON.stringify({study:'A108_JOINT_MOVING_FLOOR_ORIGINAL_A64_MICRO',
 status:'PASS',modes,realA64EachTick:true,
 independentFirstTickResweep:true,
 originalStep107ControlUnchanged:true,
 exactCheckpoint1Plus1:true,mirroredRenamed:true,
 one32RiderPeloton:true,exactEightSecondGroups:true,
 noProductionWrites:true}));
