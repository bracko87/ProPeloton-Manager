import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivatePhase10InputProvenanceV4 as classify} from './privatePhase10InputProvenanceV4.mjs';
const groups=(...parts)=>parts.map(riderIds=>({riderIds}));
const original=groups(['a','b'],['c']);
const changed=groups(['a'],['b','c']);
const start={checkpointId:'original',checkpointIndex:0,raceProgress:{kmFromStart:80},groups:original};
const finish={checkpointId:'later',checkpointIndex:1,raceProgress:{kmFromStart:100},groups:changed};
const event={...start,checkpointId:'race:phase10-exact:incident-1:90.000000',
 raceProgress:{kmFromStart:90},checkpointIndex:1};
const args={checkpoint:event,phase10Stages:{INITIAL:original},
 baseTimeline:{checkpoints:[start,finish]},
 physicalGroupsAtKm:km=>km<90?original:changed};
test('establishes synthetic exact-event stale inheritance using independently valid base groups',()=>{
 const result=classify(args);
 assert.deepEqual(result,{
 status:'EXACT_INHERITED_STALE_BASE_MEMBERSHIP',
 origin:'EXACT_EVENT',initialParity:'INITIAL_STALE',
 baseParity:'BASE_PHYSICAL',inheritance:'COPIED_BASE',interval:'CHANGED_BEFORE_EVENT'
 });
 assert.ok(!JSON.stringify(result).includes('riderIds'));
});
test('distinguishes already-stale regular base checkpoint',()=>{
 const wrong={...start,groups:changed};
 const result=classify({...args,checkpoint:wrong,
 phase10Stages:{INITIAL:changed},baseTimeline:{checkpoints:[wrong,finish]},
 physicalGroupsAtKm:()=>original});
 assert.equal(result.status,'INHERITED_BASE_DRIFT');
 assert.equal(result.origin,'BASE_EVENT');
 assert.equal(result.baseParity,'BASE_STALE');
});
test('rejects unverified initial source or unknown checkpoint',()=>{
 assert.equal(classify({...args,phase10Stages:{}}).status,'UNAVAILABLE');
 assert.equal(classify({...args,checkpoint:{...start,checkpointId:'missing'}}).status,'BASE_NOT_FOUND');
});
