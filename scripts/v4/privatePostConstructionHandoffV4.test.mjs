import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPostConstructionHandoffV4 as classify} from './privatePostConstructionHandoffV4.mjs';
const timeline=(members)=>({checkpoints:[{checkpointId:'cp',groups:[{riderIds:members}]}]});
const good=timeline(['a','b']),bad=timeline(['a']);
const args={riderId:'a',checkpointId:'cp',physicalMembers:['a','b'],
 baseTimeline:good,phase10Timeline:good,finalTimeline:good};
test('classifies phase10 as first divergent stage',()=>{
 assert.equal(classify({...args,phase10Timeline:bad,finalTimeline:bad}),'PHASE10_DIVERGED');
});
test('distinguishes intermediate reconciliation from earlier problems',()=>{
 assert.equal(classify({...args,finalTimeline:bad}),'INTERMEDIATE_RECONCILIATION_DIVERGED');
 assert.equal(classify({...args,baseTimeline:bad}),'BASE_REPLAY_DIVERGED');
});
test('fails closed for missing checkpoint and unchanged timelines',()=>{
 assert.equal(classify(args),'ALL_STAGES_MATCH');
 assert.equal(classify({...args,phase10Timeline:{checkpoints:[]}}),'CHECKPOINT_OR_RIDER_MISSING');
});
