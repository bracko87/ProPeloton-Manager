import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReplayFromPhysicalGroupsV4} from './physicalGroupReplayAdapterV4.mjs';
const f=(km,groups)=>({km,groups:groups.map(([riderIds,gapSeconds])=>({riderIds,gapSeconds,displayCode:'IGNORED'}))});
test('adapts physical groups and detects split independent of labels',()=>{
 const x=buildReplayFromPhysicalGroupsV4([
  f(10,[[['a','b','c'],0],[['d'],20]]),
  f(20,[[['a','b'],0],[['c'],6],[['d'],20]])
 ],{groupToleranceSeconds:1});
 assert.equal(x.sourceReplayTimeline,false);
 assert.equal(x.physicsModified,false);
 assert.ok(x.observations.some(y=>y.type==='group_split_or_transfer'&&y.riderIds.includes('c')));
});
test('rejects duplicate riders and changing rider sets',()=>{
 assert.throws(()=>buildReplayFromPhysicalGroupsV4([
  f(10,[[['a','b'],0],[['b','c'],10]]),
  f(20,[[['a','b','c'],0]])
 ]),/DUPLICATE_OR_INVALID_PHYSICAL_RIDER/);
 assert.throws(()=>buildReplayFromPhysicalGroupsV4([
  f(10,[[['a','b'],0]]),f(20,[[['a','c'],0]])
 ]),/RIDER_SET_CHANGED/);
});
test('rejects malformed or negative physical gaps',()=>{
 assert.throws(()=>buildReplayFromPhysicalGroupsV4([
  f(10,[[['a','b'],-1]]),f(20,[[['a','b'],0]])
 ]),/INVALID_PHYSICAL_GROUP/);
});
