import assert from 'node:assert/strict';
import {step97BuildGlobalTimetableProbeV3}
 from './a2Step97TimetableProbeV3.mjs';
import {step106TubeConflictsV3,step106ConflictFeedbackV3,
 step106ChooseTubeV3,step106RunPhysicalSpaceTimeV3}
 from './a2Step106PhysicalSpaceTimeTubesV3.mjs';
import {step104GlobalPrecedenceCommandsV3}
 from './a2Step104GlobalMultiRowPrecedenceV3.mjs';
function fixture(n,road='staged_pinch',mirror=false,renamed=false){
 const a=step97BuildGlobalTimetableProbeV3(n,{
  roadGeometry:road,pacePolicy:'persistent_global_strict_v1',
  rollingStartSpeedMps:9,spacingSeconds:.35,mirror,renamed}).initial;
 return {physical:a.physical,bookings:a.admission.bookings};
}
const f=fixture(8),original=JSON.stringify(f);
const graph=step106TubeConflictsV3(f.physical,f.physical,{
 horizonSeconds:6});
assert(graph.edgeCount>0);
assert.equal(graph.independentlySweptPathNotYetProven,true);
assert.equal(graph.officialWrites,0);
assert(graph.edges.every(e=>e.maxReachableSignedGap>=
 e.forecastSignedGap-1e-7));
const base=step104GlobalPrecedenceCommandsV3(f.physical,f.physical,
 f.bookings,{mode:'zipper_brake_strict'}).requests;
const front=f.physical.states[1],rear=f.physical.states[0];
const corrected=step106ConflictFeedbackV3(f.physical,f.physical,
 base,{pair:[rear.id,front.id]},{effort:1.2});
assert.equal(corrected.actionable,true);
assert.equal(corrected.kind,'same_row');
assert.equal(corrected.frontId,front.id);
assert.equal(corrected.rearId,rear.id);
assert.equal(corrected.originalPhysicalMandatory,true);
assert.deepEqual(corrected.requests.map(r=>r.id),base.map(r=>r.id));
assert.equal(JSON.stringify(f),original);
const choices=step106ChooseTubeV3(f.physical,f.physical,f.bookings,{
 horizonTicks:4,baseModes:['zipper_brake_strict','zipper_window'],
 efforts:[1]});
assert.equal(choices.status,'ORIGINAL_A64_RECHECKED_FIRST_TICK');
assert.equal(choices.selected.at,.5);
assert.equal(choices.evidence.actualFirstTickResweptIndependently,true);
assert.equal(choices.evidence.predictedStatesDiscarded,true);
assert(choices.evidence.sweptCandidateCount>=2);
assert.equal(choices.selected.reason,null);
assert.equal(choices.officialWrites,0);
const options={horizonTicks:4,
 baseModes:['zipper_brake_strict','zipper_window'],efforts:[1]};
const all=step106RunPhysicalSpaceTimeV3(f.physical,f.bookings,{
 ...options,seconds:2});
const first=step106RunPhysicalSpaceTimeV3(f.physical,f.bookings,{
 ...options,seconds:1});
const rest=step106RunPhysicalSpaceTimeV3(f.physical,f.bookings,{
 ...options,seconds:1,checkpoint:structuredClone(first.physical)});
assert.equal(all.evidence.acceptedSeconds,2);
assert.equal(first.evidence.acceptedSeconds,1);
assert.equal(rest.evidence.acceptedSeconds,1);
assert.deepEqual(all.physical,rest.physical);
assert.equal(all.evidence.exactlyEightSecondGroups,true);
assert.equal(all.evidence.groupCount,1);
const m=fixture(8,'staged_pinch',true,false);
const renamed=fixture(8,'staged_pinch',false,true);
for(const alt of [m,renamed]){
 const x=step106TubeConflictsV3(alt.physical,alt.physical,{
  horizonSeconds:6});
 assert.equal(x.edgeCount,graph.edgeCount);
 assert.equal(x.conditionalUnreachable,graph.conditionalUnreachable);
}
const g=fixture(32,'double_pinch');
const many=step106RunPhysicalSpaceTimeV3(g.physical,g.bookings,{
 seconds:1,horizonTicks:4,baseModes:['zipper_brake_strict'],efforts:[1]});
assert.equal(many.evidence.groupCount,1);
assert.equal(many.evidence.pelotonCount,32);
assert.equal(many.evidence.originalA64Unmodified,true);
assert.throws(()=>step106ChooseTubeV3(f.physical,f.physical,f.bookings,{
 horizonTicks:17}));
assert.throws(()=>step106ConflictFeedbackV3(f.physical,
 f.physical,base,{pair:['x','y']},{effort:4}));
assert.equal(JSON.stringify(f),original);
console.log(JSON.stringify({study:'A106_ORIGINAL_A64_SPACE_TIME_TUBES_MICRO',
 status:'PASS',physicalIndependentResweep:true,
 predictiveConditionalCertificateNotSportingProof:true,
 exact1plus1Serialization:true,
 mirrorAndRenameTopology:true,original32OnePeloton:true,
 userEightSecondGroupRuleIntact:true,
 allOfficialWrites:0}));
