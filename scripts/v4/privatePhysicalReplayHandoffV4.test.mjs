import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhysicalReplayMembershipHandoffV4 as classify} from './privatePhysicalReplayHandoffV4.mjs';
const run=(physicalMembers,replayMembers)=>classify({
 riderId:'a',physicalMembers,replayGroups:replayMembers.map(riderIds=>({riderIds}))
});
test('exact membership ignores order',()=>{
 assert.equal(run(['a','b'],[['b','a'],['c']]),'MATCH');
});
test('distinguishes stale extra members, missing members and exchange',()=>{
 assert.equal(run(['a','b'],[['a','b','c']]),'REPLAY_CONTAINS_EXTRA_MEMBERS');
 assert.equal(run(['a','b','c'],[['a','b']]),'REPLAY_MISSING_PHYSICAL_MEMBERS');
 assert.equal(run(['a','b'],[['a','c'],['b']]),'REPLAY_GROUP_EXCHANGE');
});
test('absent and duplicate rider fail closed',()=>{
 assert.equal(run(['a','b'],[['b']]),'RIDER_MISSING_FROM_REPLAY');
 assert.equal(run(['a','b'],[['a'],['a','b']]),'RIDER_DUPLICATED_IN_REPLAY');
 assert.equal(run(['a','a'],[['a']]),'INVALID_EVIDENCE');
});
