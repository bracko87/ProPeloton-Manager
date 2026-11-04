import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPhase10MembershipStageV4 as classify} from './privatePhase10MembershipStagesV4.mjs';
const g=(ids)=>[{riderIds:ids}];
const keys=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS','AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
const stages=(badAt=-1)=>Object.fromEntries(keys.map((k,i)=>[k,g(i>=badAt?['a']:['a','b'])]));
const args={riderId:'a',physicalMembers:['a','b']};
test('finds first Phase 10 membership-changing boundary',()=>{
 assert.equal(classify({...args,stages:stages(1)}),'DIVERGED_AFTER_DETACHMENT');
 assert.equal(classify({...args,stages:stages(2)}),'DIVERGED_AFTER_AUTONOMOUS_GROUPS');
 assert.equal(classify({...args,stages:stages(3)}),'DIVERGED_AFTER_CONSOLIDATION');
 assert.equal(classify({...args,stages:stages(4)}),'DIVERGED_AFTER_FINISH_COMMIT');
 assert.equal(classify({...args,stages:stages(5)}),'DIVERGED_AFTER_DISPLAY_NORMALIZATION');
});
test('unchanged and unavailable checkpoint group remain distinguishable',()=>{
 assert.equal(classify({...args,stages:stages(99)}),'ALL_STAGES_MATCH');
 assert.equal(classify({...args,stages:stages(0)}),'INITIAL_ALREADY_DIFFERS');
 assert.equal(classify({...args,stages:{INITIAL:g(['a','b'])}}),'STAGE_MISSING');
 assert.equal(classify({...args,stages:{...stages(99),AFTER_DETACHMENT:g(['c'])}}),'RIDER_UNAVAILABLE_AFTER_DETACHMENT');
});
