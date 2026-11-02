import test from 'node:test';
import assert from 'node:assert/strict';
import {planPhysicalReplaySamplesV4,capturePhysicalReplaySamplesV4} from './physicalReplaySamplingV4.mjs';
import {buildReplayFromPhysicalGroupsV4} from './physicalGroupReplayAdapterV4.mjs';

test('samples start, finish and both sides of phase boundary',()=>{
 const kms=planPhysicalReplaySamplesV4({distanceKm:120,phaseBoundariesKm:[35,70,100],stepKm:10});
 for(const km of [0,120,34.999,35,35.001,69.999,70,70.001,99.999,100,100.001])
  assert.ok(kms.includes(km),String(km));
 assert.deepEqual(kms,[...new Set(kms)].sort((a,b)=>a-b));
});
test('research sampling adapter works with physical groups, not replay checkpoints',()=>{
 const kms=planPhysicalReplaySamplesV4({distanceKm:20,phaseBoundariesKm:[10],stepKm:10});
 const samples=capturePhysicalReplaySamplesV4(kms,km=>km<10?
  [{riderIds:['a','b','c'],gapSeconds:0},{riderIds:['d'],gapSeconds:20}]:
  [{riderIds:['a','b'],gapSeconds:0},{riderIds:['c'],gapSeconds:5},{riderIds:['d'],gapSeconds:20}]);
 const reconstructed=buildReplayFromPhysicalGroupsV4(samples);
 assert.ok(reconstructed.observations.some(x=>x.type==='group_split_or_transfer'));
 assert.equal(reconstructed.sourceReplayTimeline,false);
 assert.equal(reconstructed.physicsModified,false);
});
test('rejects invalid planning and excessively dense samples',()=>{
 assert.throws(()=>planPhysicalReplaySamplesV4({distanceKm:100,stepKm:0}));
 assert.throws(()=>planPhysicalReplaySamplesV4({distanceKm:100,stepKm:0.0001}),/TOO_LARGE/);
 assert.throws(()=>planPhysicalReplaySamplesV4({distanceKm:100,phaseBoundariesKm:[101]}));
});
