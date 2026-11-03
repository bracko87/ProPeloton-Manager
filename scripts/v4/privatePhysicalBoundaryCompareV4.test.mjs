import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhysicalCheckpointBoundaryV4 as classify} from './privatePhysicalBoundaryCompareV4.mjs';
const run=(fn)=>classify({riderId:'a',previousKm:10,checkpointKm:20,physicalGroupsAtKm:fn});
test('detects membership change with identical group labels',()=>{
 assert.equal(run(km=>km<20?
 [{riderIds:['a','b'],gapSeconds:0},{riderIds:['c'],gapSeconds:8}]:
 [{riderIds:['a'],gapSeconds:0},{riderIds:['b','c'],gapSeconds:8}]),'CHANGED_MEMBERSHIP');
});
test('treats only unchanged membership as stable',()=>{
 assert.equal(run(km=>[{riderIds:km===10?['a','b']:['b','a'],gapSeconds:0}]),'SAME_MEMBERSHIP');
});
test('fails closed on malformed physical groups',()=>{
 assert.equal(run(()=>[{riderIds:['a','a'],gapSeconds:-1}]),'UNAVAILABLE');
 assert.equal(classify({riderId:'a',previousKm:20,checkpointKm:10,physicalGroupsAtKm:()=>[]}), 'UNAVAILABLE');
});
