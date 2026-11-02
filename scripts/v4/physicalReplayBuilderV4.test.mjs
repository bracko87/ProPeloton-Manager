import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPhysicalReplayV4} from './physicalReplayBuilderV4.mjs';

const frame=(km,gaps)=>({km,riders:Object.entries(gaps).map(([id,gapSeconds])=>({id,gapSeconds}))});
test('stable groups and reordered riders produce no invented events',()=>{
 const result=buildPhysicalReplayV4([
  frame(0,{a:0,b:0.2,c:15,d:15.2}),
  frame(20,{d:15.1,b:0.1,c:15,a:0})
 ],{groupToleranceSeconds:1});
 assert.equal(result.observations.length,0);
 assert.equal(result.physicsModified,false);
});
test('physical split is detected but exact location is not fabricated',()=>{
 const result=buildPhysicalReplayV4([
  frame(10,{a:0,b:0.1,c:0.2,d:20}),
  frame(20,{a:0,b:0.2,c:7,d:20})
 ],{groupToleranceSeconds:1});
 assert.ok(result.observations.some(e=>e.type==='group_split_or_transfer' &&
  e.riderIds.includes('c') && e.observedBetweenKm[0]===10 &&
  e.observedBetweenKm[1]===20 && e.exactEventKmKnown===false));
});
test('a physical merge can be observed without asserting how it happened',()=>{
 const result=buildPhysicalReplayV4([
  frame(10,{a:0,b:0.2,c:15,d:15.2}),
  frame(20,{a:0,b:0.2,c:0.4,d:0.5})
 ],{groupToleranceSeconds:1});
 assert.ok(result.observations.some(e=>e.type==='group_merge_or_exchange'));
});
test('rejects missing riders, invalid gaps and nonincreasing checkpoints',()=>{
 assert.throws(()=>buildPhysicalReplayV4([frame(10,{a:0,b:2}),frame(9,{a:0,b:2})]));
 assert.throws(()=>buildPhysicalReplayV4([frame(10,{a:0,b:2}),frame(20,{a:0,c:2})]),/RIDER_SET_CHANGED/);
 assert.throws(()=>buildPhysicalReplayV4([frame(10,{a:0,b:2}),frame(20,{a:0,b:-2})]),/INVALID_V4_REPLAY_RIDER/);
});
