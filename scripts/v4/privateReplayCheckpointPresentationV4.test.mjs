import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReplayCheckpointPresentationV4 as classify} from './privateReplayCheckpointPresentationV4.mjs';
const cp=(km,code,ids)=>({raceProgress:{kmFromStart:km},groups:[{displayCode:code,riderIds:ids}]});
test('same-distance label change is not assumed to be physical movement',()=>{
 assert.equal(classify({riderId:'a',previous:cp(20,'C1',['a','b']),current:cp(20,'C2',['b','a'])}),'SAME_KM_RENUMBER_ONLY');
});
test('same-distance membership change remains separate from renumbering',()=>{
 assert.equal(classify({riderId:'a',previous:cp(20,'C1',['a','b']),current:cp(20,'C2',['a'])}),'SAME_KM_MEMBERSHIP_CHANGED');
});
test('distance-separated membership and label changes are distinguished',()=>{
 assert.equal(classify({riderId:'a',previous:cp(10,'C1',['a','b']),current:cp(20,'C2',['a','b'])}),'DISTANCE_RENUMBER_ONLY');
 assert.equal(classify({riderId:'a',previous:cp(10,'C1',['a','b']),current:cp(20,'C2',['a'])}),'DISTANCE_MEMBERSHIP_CHANGED');
});
test('missing or duplicated rider groups fail closed',()=>{
 assert.equal(classify({riderId:'x',previous:cp(10,'P',['a','b']),current:cp(20,'C1',['a'])}),'UNAVAILABLE');
});
