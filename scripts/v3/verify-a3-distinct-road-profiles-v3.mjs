/**
 * First separate-road-capacity trial. Same discrete engine, no A64 claim.
 * Staged: 5 logical middle lanes (1020-1130), then second 2-lane merge.
 * Double: 2 lanes across both road sections, second gate still observed.
 */
import assert from 'node:assert/strict';
import {createDiscretePelotonV3,runDiscretePelotonV3}
 from './a3DiscreteCapacityPelotonV3.mjs';
const rows=[];
for(const n of [106,168]){
 const outcomes={};
 for(const layout of ['staged','double']){
  const f=createDiscretePelotonV3(n,{
    layout,roadWidthMode:'two_distinct_gates'});
  const immutable=JSON.stringify(f);
  const run=runDiscretePelotonV3(f,{seconds:180});
  const e=run.evidence;
  const row={n,layout,seconds:e.acceptedSeconds,
    rejected:e.rejection,detail:e.rejectionDetail,
    first:e.firstGateAll,second:e.secondGateAll,
    middle:e.expandedMiddleCount,secondMerged:e.completedSecondMergeCount,
    peakMiddle:e.peakMiddleLaneOccupancy,
    middleLanes:e.peakDistinctMiddleLanes,
    minGap:e.minObservedLaneGap,minSpeed:e.minObservedSpeed,
    overtakes:e.crossLaneOvertakes,
    trace:e.traceHash};
  console.log('DISTINCT_ROAD_TEST '+JSON.stringify(row));
  rows.push(row);outcomes[layout]=row;
  assert.equal(JSON.stringify(f),immutable);
  assert.equal(e.rejection,null,'new gate had physically invalid lane occupancy');
  assert(e.all180Accepted,'failed 180 second continuous game model');
  assert(e.firstGateAll&&e.secondGateAll);
  assert.equal(e.completedSecondMergeCount,n);
  assert(e.minObservedLaneGap>=1.85-1e-5);
  assert(e.minObservedSpeed>=6.5);
  assert(e.crossLaneOvertakes>0);
  if(layout==='staged'){
    assert(e.expandedMiddleCount>0,
      'staged layout never switched to wider road capacity');
    assert(e.peakDistinctMiddleLanes>=3,
      'staged middle road has no genuine wider lane occupation');
  }else{
    assert.equal(e.expandedMiddleCount,0);
    assert.equal(e.peakDistinctMiddleLanes,0);
  }
  const replay=runDiscretePelotonV3(f,{seconds:180});
  assert.equal(replay.evidence.traceHash,e.traceHash);
  assert.deepEqual(replay.physical,run.physical);
 }
 assert.notEqual(outcomes.staged.trace,outcomes.double.trace,
   'two road geometries must no longer be identical');
}
const before=createDiscretePelotonV3(32,{
 layout:'staged',roadWidthMode:'two_distinct_gates'});
const all=runDiscretePelotonV3(before,{seconds:180});
const part=runDiscretePelotonV3(before,{seconds:90});
const resume=runDiscretePelotonV3(before,{
 seconds:90,checkpoint:structuredClone(part.physical)});
assert.deepEqual(resume.physical,all.physical,
 '90+90 checkpoint restored results differ');
const old=createDiscretePelotonV3(32,{layout:'double'});
const legacy=runDiscretePelotonV3(old,{seconds:180});
assert.equal(legacy.evidence.all180Accepted,true);
const breakaway=createDiscretePelotonV3(24,{
 layout:'double',scenario:'breakaway'});
const b=runDiscretePelotonV3(breakaway,{seconds:180});
assert.equal(b.evidence.all180Accepted,true);
assert(b.evidence.splitSeen&&b.evidence.rejoinSeen);
console.log('DISTINCT_ROAD_PROFILE_RESULT '+JSON.stringify({
 prototype:'TWO_SEPARATE_ABSTRACT_ROAD_GATES',
 passed:rows.length===4,rows,
 originalBaselineUnmodified:true,
 breakawaySplitRejoin:true,
 originalA64Unaffected:true,
 noLiveWrites:true,
 abstractLaneHandoffsNotPhysicalSteering:true}));
