import assert from 'node:assert/strict';
import {step97BuildGlobalTimetableProbeV3} from './a2Step97TimetableProbeV3.mjs';
import {step104GlobalPrecedenceCommandsV3,step104OriginalA64PassageV3}
 from './a2Step104GlobalMultiRowPrecedenceV3.mjs';
const modes=['chain_soft','chain_strict','global_reserve',
  'stepped_release','early_ordered_merge',
  'zipper_uniform','zipper_soft','zipper_pace',
  'zipper_slower','zipper_window'];
function make(n,road='staged_pinch',mirror=false,renamed=false){
 const x=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry:road,pacePolicy:'persistent_global_strict_v1',
  mirror,renamed,rollingStartSpeedMps:9,spacingSeconds:.35});
 return {physical:x.initial.physical,bookings:x.initial.admission.bookings};
}
const f=make(8),untouched=JSON.stringify(f);
for(const mode of modes){
 const plan=step104GlobalPrecedenceCommandsV3(f.physical,
   f.physical,f.bookings,{mode});
 assert.equal(plan.requests.length,8);
 assert.equal(plan.noIDPriority,true);
 assert.equal(plan.noGroupSpeedLock,true);
 assert(plan.checkedGlobalPairConstraints>=0);
 assert.equal(plan.officialWrites,0);
 const actual=step104OriginalA64PassageV3(f.physical,f.bookings,{
  mode,seconds:2});
 assert.equal(actual.evidence.acceptedSamples,actual.evidence.acceptedSeconds*2);
 assert(actual.evidence.acceptedSeconds>=.5);
 assert.equal(actual.evidence.eightSecondGroupRule,true);
 assert.equal(actual.physical.reason,null);
}
assert.equal(JSON.stringify(f),untouched);
const a=step104OriginalA64PassageV3(f.physical,f.bookings,{
 mode:'chain_soft',seconds:2});
const b=step104OriginalA64PassageV3(f.physical,f.bookings,{
 mode:'chain_soft',seconds:1});
const c=step104OriginalA64PassageV3(f.physical,f.bookings,{
 mode:'chain_soft',seconds:1,
 startingCheckpoint:JSON.parse(JSON.stringify(b.physical))});
assert.equal(a.evidence.acceptedSeconds,2);
assert.equal(c.evidence.acceptedSeconds,1);
assert.deepEqual(c.physical,a.physical,'1+1 A64 physical checkpoint must exactly replay');
const g32=make(32,'double_pinch');
const run32=step104OriginalA64PassageV3(g32.physical,g32.bookings,{
 mode:'chain_strict',seconds:1});
assert.equal(run32.evidence.groupCount,1);
assert.equal(run32.evidence.pelotonRiders,32);
const mirror=make(8,'staged_pinch',true,false);
const originalPlan=step104GlobalPrecedenceCommandsV3(f.physical,
 f.physical,f.bookings,{mode:'chain_soft'});
const mirrorPlan=step104GlobalPrecedenceCommandsV3(mirror.physical,
 mirror.physical,mirror.bookings,{mode:'chain_soft'});
assert.deepEqual(originalPlan.requests.map(r=>r.speed),
 mirrorPlan.requests.map(r=>r.speed));
const rename=make(8,'staged_pinch',false,true);
const renamePlan=step104GlobalPrecedenceCommandsV3(rename.physical,
 rename.physical,rename.bookings,{mode:'chain_soft'});
assert.deepEqual(originalPlan.requests.map(r=>r.speed),
 renamePlan.requests.map(r=>r.speed));
assert.throws(()=>step104OriginalA64PassageV3(f.physical,f.bookings,{
 mode:'missing'}));
console.log(JSON.stringify({study:'A104_GLOBAL_PRECEDENCE_ORIGINAL_A64_MICRO',
 result:'PASS',modes,checkpoint1plus1:true,
 mirroredSpeedRequests:true,renamedSpeedRequests:true,
 initial32RiderOnePeloton:true,eightSecondGroupsPreserved:true,
 originalPhysicalAuthority:true,officialWrites:0}));
