import test from 'node:test';
import assert from 'node:assert/strict';
import {reconstructPhysicalCheckpointCandidateV4 as candidate} from './privatePhysicalCheckpointCandidateV4.mjs';
const physical=km=>km<20?
 [{riderIds:['a','b'],gapSeconds:0},{riderIds:['c','d'],gapSeconds:20}]:
 [{riderIds:['a'],gapSeconds:0},{riderIds:['b'],gapSeconds:5},{riderIds:['c','d'],gapSeconds:20}];
const run=(riderId,physicalGroupsAtKm=physical,previousKm=10,checkpointKm=20)=>
 candidate({riderId,previousKm,checkpointKm,physicalGroupsAtKm,groupToleranceSeconds:1});
test('physical membership change produces an isolated candidate',()=>{
 for(const riderId of ['a','b']){
  const result=run(riderId);
  assert.equal(result.classification,'PHYSICAL_TRANSITION_CANDIDATE');
  assert.equal(result.proposal.eventType,'group_split');
  assert.deepEqual(result.proposal.observedBetweenKm,[10,20]);
  assert.equal(result.proposal.exactEventKmKnown,false);
  assert.equal(result.proposal.exactEventTimeKnown,false);
  assert.equal(result.proposal.source,'authoritative_physical_groups');
  assert.deepEqual(result.proposal.beforeMembers,['a','b']);
  assert.deepEqual(result.proposal.afterMembers,[riderId]);
 }

});
test('stable group does not produce a candidate',()=>{
 assert.deepEqual(run('c'),{classification:'NO_PHYSICAL_MEMBERSHIP_CHANGE'});
});
test('zero distance cannot create a synthetic transition',()=>{
 assert.deepEqual(run('a',physical,20,20),{classification:'NOT_ELIGIBLE'});
});
test('physical rider-set drift and duplicate entries fail closed',()=>{
 assert.deepEqual(run('a',km=>km<20?physical(10):[{riderIds:['a'],gapSeconds:0}]),
  {classification:'INVALID_PHYSICAL_EVIDENCE'});
});

test('physical joins yield merge proposals, never made-up timestamps',()=>{
 const groups=km=>km<20?
 [{riderIds:['a'],gapSeconds:0},{riderIds:['b'],gapSeconds:10},{riderIds:['c','d'],gapSeconds:30}]:
 [{riderIds:['a','b'],gapSeconds:0},{riderIds:['c','d'],gapSeconds:30}];
 const result=run('a',groups);
 assert.equal(result.proposal.eventType,'group_merge');
 assert.equal(result.proposal.exactEventKmKnown,false);
});
