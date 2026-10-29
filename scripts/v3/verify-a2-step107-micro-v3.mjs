import assert from 'node:assert/strict';
import {step97BuildGlobalTimetableProbeV3} from './a2Step97TimetableProbeV3.mjs';
import {step107InitialLaneReservationsV3,step107ClearanceAuditV3,
 step107GlobalSlotCommandsV3,step107RunOriginalA64ReservationsV3}
 from './a2Step107GlobalLaneReservationsV3.mjs';
function fixture(n,geometry='staged_pinch',mirror=false,renamed=false){
 const x=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry:geometry,rollingStartSpeedMps:9,
  pacePolicy:'persistent_global_strict_v1',spacingSeconds:.35,
  mirror,renamed}).initial;
 return {physical:x.physical,bookings:x.admission.bookings};
}
const f=fixture(8),before=JSON.stringify(f);
const names=['slots_compact','slots_balanced','slots_throughput',
 'slots_staggered','slots_conservative','slots_variable'];
const a=step107InitialLaneReservationsV3(f.physical,{
 spacingMeters:2.45});
assert.equal(a.originalRiders,8);
assert.equal(a.channels.length,2);
assert.equal(a.coveredCount,8);
assert.equal(a.unassignedCenterRiders.length,0);
const opposite=step107InitialLaneReservationsV3(f.physical,{
 spacingMeters:2.45,centerTie:'right'});
assert.equal(opposite.coveredCount,8);
const neutral=step107InitialLaneReservationsV3(f.physical,{
 spacingMeters:2.45,centerTie:'neutral'});
assert(neutral.unassignedCenterRiders.length>0,
 'symmetric all-9m/s center tie must not be silently assigned without a branch');
assert.equal(a.positionsNotMoved,true);
assert(a.channels.every(ch=>ch.orderedRiderIds.length===ch.count));
assert.equal(new Set(a.allocations.map(x=>x.riderId)).size,a.coveredCount);
const audit=step107ClearanceAuditV3(f.physical,a);
assert.equal(audit.edges.length,a.channels.reduce((s,c)=>
 s+Math.max(0,c.count-1),0));
assert(audit.fullLateralAndLongitudinalMotionNotYetProven);
const good=step107GlobalSlotCommandsV3(f.physical,
 f.physical,f.bookings,{mode:'slots_balanced'});
assert.equal(good.requests.length,8);
assert(good.requests.every(x=>x.speed>=7.3&&x.speed<=12.5));
assert.equal(good.noPositionRepair,true);
assert.equal(good.officialWrites,0);
for(const mode of names){
 const r=step107RunOriginalA64ReservationsV3(f.physical,
  f.bookings,{mode,seconds:2});
 assert(r.evidence.acceptedSeconds>=.5);
 assert.equal(r.evidence.acceptedSamples,r.evidence.acceptedSeconds*2);
 assert.equal(r.physical.reason,null);
 assert.equal(r.evidence.originalPhysicalSolverUnmodified,true);
 assert.equal(r.evidence.sameEightSecondRaceGroupRule,true);
 assert.equal(r.evidence.groupCount,1);
 assert.equal(r.evidence.officialWrites,0);
}
const one=step107RunOriginalA64ReservationsV3(f.physical,
 f.bookings,{mode:'slots_compact',seconds:2});
const partA=step107RunOriginalA64ReservationsV3(f.physical,
 f.bookings,{mode:'slots_compact',seconds:1});
const partB=step107RunOriginalA64ReservationsV3(f.physical,
 f.bookings,{mode:'slots_compact',seconds:1,
 checkpoint:JSON.parse(JSON.stringify(partA.physical))});
assert.equal(one.evidence.acceptedSeconds,2);
assert.equal(partB.evidence.acceptedSeconds,1);
assert.deepEqual(partB.physical,one.physical,
 'A64 original accepted positions, speeds and energy must replay identically');
const mirror=fixture(8,'staged_pinch',true,false),renamed=
 fixture(8,'staged_pinch',false,true);
for(const x of [mirror,renamed]){
 const mirrorBranch=x===mirror?'right':'left';
 const alt=step107InitialLaneReservationsV3(x.physical,{
  spacingMeters:2.45,centerTie:mirrorBranch});
 assert.equal(alt.coveredCount,a.coveredCount);
 assert.equal(alt.unassignedCenterRiders.length,0);
 assert.deepEqual(alt.channels.map(c=>c.count).sort((b,c)=>b-c),
  a.channels.map(c=>c.count).sort((b,c)=>b-c));
 const cmds=step107GlobalSlotCommandsV3(x.physical,
  x.physical,x.bookings,{mode:'slots_balanced',centerTie:mirrorBranch});
 assert.deepEqual(cmds.requests.map(z=>z.speed),good.requests.map(z=>z.speed));
}
const thirtyTwo=fixture(32,'double_pinch');
const o32=step107RunOriginalA64ReservationsV3(
 thirtyTwo.physical,thirtyTwo.bookings,{
 mode:'slots_compact',seconds:1});
assert.equal(o32.evidence.groupCount,1);
assert.equal(o32.evidence.pelotonRiders,32);
assert.throws(()=>step107GlobalSlotCommandsV3(f.physical,
 f.physical,f.bookings,{mode:'wrong'}));
assert.throws(()=>step107InitialLaneReservationsV3(f.physical,{
 spacingMeters:5}));
assert.throws(()=>step107RunOriginalA64ReservationsV3(f.physical,
 f.bookings,{mode:'slots_compact',seconds:1,centerTie:'neutral'}));
assert.equal(JSON.stringify(f),before);
console.log(JSON.stringify({study:'A107_GLOBAL_LANE_AND_GAP_ALLOCATOR_MICRO',
 status:'PASS',modes:names,exact1Plus1A64Replay:true,
 mirrorAndRenamedReservationParity:true,
 bothMirrorBranchesFullyAllocated:true,
 noUnapprovedLanePriority:true,initial32Peloton:true,
 originalA64SafetyAuthoritative:true,
 unchangedEightSecondGrouping:true,officialWrites:0}));
