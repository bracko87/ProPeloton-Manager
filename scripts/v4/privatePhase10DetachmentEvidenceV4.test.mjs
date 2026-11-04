import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhase10DetachmentEvidenceV4 as classify} from './privatePhase10DetachmentEvidenceV4.mjs';
const groups=ids=>[{riderIds:ids}];
const args={riderId:'a',physicalMembers:['a','b','c'],
 initialGroups:groups(['a','b','c']),detachedGroups:groups(['a','b']),
 autonomousRiderIds:['c'],dnfRiderIds:[]};
test('identifies authorized autonomous detachment without conflating it with a missing event',()=>{
 assert.equal(classify(args),'AUTONOMOUS_CHASE_DETACHMENT');
 assert.equal(classify({...args,autonomousRiderIds:[],dnfRiderIds:['c']}),'DNF_DETACHMENT');
});
test('rejects removals unaccounted for by Phase 10 physics or incidents',()=>{
 assert.equal(classify({...args,autonomousRiderIds:[]}), 'UNEXPLAINED_REMOVAL');
 assert.equal(classify({...args,initialGroups:groups(['a','b'])}),'INITIAL_MEMBERSHIP_MISMATCH');
 assert.equal(classify({...args,detachedGroups:groups(['a','d'])}),'GROUP_EXCHANGE_AFTER_DETACHMENT');
});
test('handles mixed detachment and fails closed on invalid group membership',()=>{
 const mix={...args,detachedGroups:groups(['a']),autonomousRiderIds:['b'],dnfRiderIds:['c']};
 assert.equal(classify(mix),'MIXED_LEGITIMATE_DETACHMENT');
 assert.equal(classify({...args,initialGroups:groups(['b','c'])}),'RIDER_GROUP_UNAVAILABLE');
 assert.equal(classify({...args,physicalMembers:['a','a']}),'UNAVAILABLE');
});
