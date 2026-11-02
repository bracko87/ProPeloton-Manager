import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPhysicalFailureCheckpointV4 as match} from './privatePhysicalFailureMatchV4.mjs';
const observations=[{riderIds:['r1'],observedBetweenKm:[80,85]}];
test('physical movement overlapping failed interval is only evidence, not automatic validation',()=>{
 assert.equal(match({riderId:'r1',previousKm:79,checkpointKm:83,observations}),'CHECKPOINT_INTERVAL_OVERLAP');
});
test('movement outside checkpoint is rejected',()=>{
 assert.equal(match({riderId:'r1',previousKm:90,checkpointKm:95,observations}),'MOVEMENT_OUTSIDE_CHECKPOINT');
});
test('unknown rider and invalid intervals are distinguished',()=>{
 assert.equal(match({riderId:'r2',previousKm:79,checkpointKm:83,observations}),'NO_RIDER_MOVEMENT');
 assert.equal(match({riderId:'r1',previousKm:90,checkpointKm:83,observations}),'UNMATCHABLE');
});
