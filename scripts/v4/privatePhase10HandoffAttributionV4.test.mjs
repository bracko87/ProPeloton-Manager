import test from 'node:test';
import assert from 'node:assert/strict';
import {attributePrivatePhase10HandoffV4 as attribute} from './privatePhase10HandoffAttributionV4.mjs';
const groups=(...arrays)=>arrays.map(riderIds=>({riderIds}));
const ORDER=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS','AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
const before=groups(['a','b','c'],['d']),survivors=groups(['a','b'],['d']);
const stages=Object.fromEntries(ORDER.map((key,i)=>[key,i===0?before:survivors]));
const base={checkpoint:{raceProgress:{kmFromStart:80},groups:survivors,
 riderStates:['a','b','d'].map(riderId=>({riderId,status:'racing'})).concat([{riderId:'c',status:'dnf'}])},
 physicalGroupsAtKm:()=>before,phase10Stages:stages,reachedDnfRiderIds:['c']};
test('correctly attributes a legitimate Phase10 DNF survivor group',()=>{
 const actual=attribute(base);
 assert.deepEqual(actual,{status:'CLASSIFIED',firstDifference:'NONE',
 finalAlignment:'PHYSICAL_SURVIVORS_MATCH',dnf:'CONFIRMED_DNF_EXCLUSION'});
});
test('finds first incorrect stage even when final checkpoint is wrong',()=>{
 const wrong=groups(['a'],['b','d']);
 const changed={...stages,AFTER_AUTONOMOUS_GROUPS:wrong,
 AFTER_CONSOLIDATION:wrong,AFTER_FINISH_COMMIT:wrong,AFTER_DISPLAY_NORMALIZATION:wrong};
 const result=attribute({...base,phase10Stages:changed,
 checkpoint:{...base.checkpoint,groups:wrong}});
 assert.equal(result.firstDifference,'FIRST_AFTER_AUTONOMOUS_GROUPS');
 assert.equal(result.finalAlignment,'GROUP_MEMBERSHIP_DIFFERS');
});
test('distinguishes initial physical error and post-Phase10 mutation',()=>{
 const wrong=groups(['a'],['b','c','d']);
 const result=attribute({...base,phase10Stages:{...stages,INITIAL:wrong}});
 assert.equal(result.firstDifference,'INITIAL_DIFFERS');
 const after=attribute({...base,checkpoint:{...base.checkpoint,groups:groups(['a','b','d'])}});
 assert.equal(after.firstDifference,'AFTER_PHASE10_STAGES');
});
test('does not accept unconfirmed DNF or missing stage evidence',()=>{
 const notDnf={...base,checkpoint:{...base.checkpoint,riderStates:
 base.checkpoint.riderStates.map(s=>s.riderId==='c'?{...s,status:'racing'}:s)}};
 assert.equal(attribute(notDnf).status,'UNVERIFIED_DNF');
 assert.equal(attribute({...base,phase10Stages:{INITIAL:before}}).status,'UNAVAILABLE');
});
