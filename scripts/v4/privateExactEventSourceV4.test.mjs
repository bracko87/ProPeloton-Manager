import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivateExactEventSourceV4 as classify} from './privateExactEventSourceV4.mjs';
const group=(...rows)=>rows.map(riderIds=>({riderIds}));
const old={checkpointId:'base-old',checkpointIndex:0,raceProgress:{kmFromStart:80},groups:group(['a','b'],['c'])};
const next={checkpointId:'base-new',checkpointIndex:1,raceProgress:{kmFromStart:100},groups:group(['a'],['b','c'])};
const exact={...old,checkpointId:'stage:phase10-exact:incident-1:90.000000',
 raceProgress:{kmFromStart:90},checkpointIndex:1};
const args={timeline:{checkpoints:[old,exact,next]},checkpointId:exact.checkpointId,
 baseTimeline:{checkpoints:[old,next]},
 physicalGroupsAtKm:km=>km<90?group(['a','b'],['c']):group(['a'],['b','c'])};
test('finds exact-event copy that missed a physical change',()=>{
 const got=classify(args);
 assert.equal(got.status,'CLASSIFIED');
 assert.equal(got.inheritance,'COPIED_PREVIOUS');
 assert.equal(got.baseParity,'BASE_PHYSICAL');
 assert.equal(got.exactParity,'EXACT_DIFFERS');
 assert.equal(got.interval,'CHANGE_BEFORE_EXACT');
 assert.ok(!JSON.stringify(got).includes('riderIds'));
});
test('recognizes a synthetic checkpoint whose physical groups have not changed yet',()=>{
 const got=classify({...args,physicalGroupsAtKm:km=>
  km<=90?group(['a','b'],['c']):group(['a'],['b','c'])});
 assert.equal(got.exactParity,'EXACT_PHYSICAL');
 assert.equal(got.interval,'CHANGE_AFTER_EXACT');
});
test('does not classify an ordinary replay checkpoint as synthetic',()=>{
 assert.equal(classify({...args,checkpointId:old.checkpointId}).status,'NOT_EXACT_EVENT');
 assert.equal(classify({...args,baseTimeline:{checkpoints:[]}}).status,'UNAVAILABLE');
});
