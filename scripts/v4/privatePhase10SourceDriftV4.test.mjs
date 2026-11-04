import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivatePhase10SourceDriftV4 as classify} from './privatePhase10SourceDriftV4.mjs';
const group=(...riderIds)=>riderIds.map(ids=>({riderIds:ids}));
const labels=['INITIAL','AFTER_DETACHMENT','AFTER_AUTONOMOUS_GROUPS',
 'AFTER_CONSOLIDATION','AFTER_FINISH_COMMIT','AFTER_DISPLAY_NORMALIZATION'];
const physical=group(['a','b'],['c','d']);
const stages=Object.fromEntries(labels.map(label=>[label,physical]));
const args={checkpoint:{raceProgress:{kmFromStart:90},groups:physical,
 riderStates:['a','b','c','d'].map(riderId=>({riderId,status:'racing'}))},
 physicalGroupsAtKm:()=>physical,phase10Stages:stages,
 reachedDnfRiderIds:[],autonomousRiderIds:[]};
test('classifies fully aligned source without exposing identifiers',()=>{
 const actual=classify(args);
 assert.equal(actual.sourceStatus,'SOURCE_ALIGNED');
 assert.equal(actual.publication,'SOURCE_PUBLISHED');
 assert.equal(actual.firstDifference,'NO_STAGE_DRIFT');
 assert.ok(!JSON.stringify(actual).includes('riderId'));
});
test('isolates autonomous-only partition change from unrelated transfer',()=>{
 const different=group(['a','c'],['b','d']);
 const stages2={...stages,AFTER_AUTONOMOUS_GROUPS:different,
 AFTER_CONSOLIDATION:different,AFTER_FINISH_COMMIT:different,
 AFTER_DISPLAY_NORMALIZATION:different};
 const result=classify({...args,phase10Stages:stages2,
 autonomousRiderIds:['b','c']});
 assert.equal(result.sourceStatus,'GROUP_PARTITION_DIFFERS');
 assert.equal(result.firstDifference,'AFTER_AUTONOMOUS_GROUPS');
 assert.equal(result.autonomousEffect,'CHANGED');
 assert.equal(result.autonomousAttribution,'AUTONOMOUS_ONLY');
 assert.equal(classify({...args,phase10Stages:stages2,
 autonomousRiderIds:['a']}).autonomousAttribution,'INCLUDES_NON_AUTONOMOUS');
});
test('distinguishes downstream change and protects DNF status',()=>{
 const changed=classify({...args,checkpoint:{...args.checkpoint,groups:group(['a'],['b','c','d'])}});
 assert.equal(changed.publication,'POST_SOURCE_CHANGE');
 assert.equal(classify({...args,reachedDnfRiderIds:['b']}).status,'UNAVAILABLE');
});
