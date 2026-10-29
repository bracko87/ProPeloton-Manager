import assert from 'node:assert/strict';
import {step97BuildGlobalTimetableProbeV3} from './a2Step97TimetableProbeV3.mjs';
import {step105ZipperEdgesV3,step105CoupledRequestsV3,
  step105SelectOriginalA64TickV3,step105RunOriginalA64ZipperV3}
 from './a2Step105CoupledZipperV3.mjs';
function fixture(n,road='staged_pinch',mirror=false,renamed=false){
 const x=step97BuildGlobalTimetableProbeV3(n,{
   roadGeometry:road,pacePolicy:'persistent_global_strict_v1',
   mirror,renamed,rollingStartSpeedMps:9,spacingSeconds:.35});
 return {physical:x.initial.physical,bookings:x.initial.admission.bookings};
}
const f=fixture(8),original=JSON.stringify(f);
const topo=step105ZipperEdgesV3(f.physical);
assert.equal(topo.fullRiderCount,8);
assert(topo.edges.length>=3);
assert.equal(topo.unassignedCenterRiders,2);
assert.equal(topo.centerHasNoIDPriority,true);
assert.deepEqual(topo.chains.map(c=>c.side),['LEFT','RIGHT']);
const physicalModes=['conservative','early','adaptive'];
for(const mode of physicalModes){
 const plan=step105CoupledRequestsV3(f.physical,f.physical,f.bookings,{mode});
 assert.equal(plan.requests.length,8);
 assert.equal(plan.checkedZipperEdges,topo.edges.length);
 assert.equal(plan.groupSpeedLock,false);
 assert.equal(plan.noIDOrLeftPriority,true);
 assert(plan.projectedInfeasiblePairCount>=0);
 assert(plan.requests.every(r=>r.speed>=0&&r.speed<=50));
 assert(plan.officialWrites===0);
 const real=step105SelectOriginalA64TickV3(f.physical,f.physical,f.bookings,{mode});
 assert.equal(real.status,'ORIGINAL_A64_SAFE_FIRST_TICK');
 assert.equal(real.actual.at,.5);
 assert.equal(real.actual.acceptedSteps,1);
 assert.equal(real.previewFutureStatesDiscarded,true);
 assert.equal(real.actual.reason,null);
}
assert.equal(JSON.stringify(f),original);
const full=step105RunOriginalA64ZipperV3(f.physical,f.bookings,{
 mode:'adaptive',seconds:2});
const one=step105RunOriginalA64ZipperV3(f.physical,f.bookings,{
 mode:'adaptive',seconds:1});
const two=step105RunOriginalA64ZipperV3(f.physical,f.bookings,{
 mode:'adaptive',seconds:1,checkpoint:structuredClone(one.physical)});
assert.equal(full.evidence.acceptedSeconds,2);
assert.equal(one.evidence.acceptedSeconds,1);
assert.equal(two.evidence.acceptedSeconds,1);
assert.deepEqual(two.physical,full.physical,'A105 1+1 original A64 checkpoint parity');
assert.equal(full.evidence.exactEightSecondRule,true);
assert.equal(full.evidence.eightSecondGroupCount,1);
const m=fixture(8,'staged_pinch',true,false);
const re=fixture(8,'staged_pinch',false,true);
const base=step105CoupledRequestsV3(f.physical,f.physical,f.bookings,{mode:'adaptive'});
for(const z of [m,re]){
 const other=step105CoupledRequestsV3(z.physical,z.physical,z.bookings,{mode:'adaptive'});
 assert.deepEqual(base.requests.map(x=>x.speed),other.requests.map(x=>x.speed),
   'geometry mirrored or IDs renamed must not change speed hierarchy');
 assert.equal(other.topology.edges.length,topo.edges.length);
}
const n32=fixture(32,'double_pinch');
const g32=step105RunOriginalA64ZipperV3(n32.physical,n32.bookings,{
 mode:'early',seconds:1});
assert.equal(g32.evidence.eightSecondGroupCount,1);
assert.equal(g32.evidence.pelotonCount,32);
assert.equal(g32.evidence.officialWrites,0);
assert.throws(()=>step105CoupledRequestsV3(f.physical,f.physical,
  f.bookings,{mode:'imaginary'}));
assert.throws(()=>step105RunOriginalA64ZipperV3(f.physical,f.bookings,{
 mode:'adaptive',seconds:181}));
assert.equal(JSON.stringify(f),original);
console.log(JSON.stringify({study:'A105_COUPLED_ZIPPER_ORIGINAL_A64_MICRO',
  status:'PASS',sweptModes:physicalModes,
  actualA64Seconds:full.evidence.acceptedSeconds,
  exactReplay1Plus1:true,mirror:true,renaming:true,
  anyPreviewCommitted:false,one32RiderPeloton:true,
  eightSecondGroupRuleIntact:true,officialWrites:0}));
