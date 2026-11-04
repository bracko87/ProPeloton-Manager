import test from 'node:test';
import assert from 'node:assert/strict';
import {tracePrivateFirstPhysicalDivergenceV4 as trace} from './privateFirstPhysicalDivergenceV4.mjs';
const cp=(id,km,groups,commentary=[])=>({
 checkpointId:id,raceProgress:{kmFromStart:km},
 groups:groups.map(riderIds=>({riderIds})),commentary
});
const physicalGroupsAtKm=()=>[{riderIds:['a','b']},{riderIds:['c']}];
const a=cp('a',80,[['a','b'],['c']]);
const b=cp('b',85,[['a'],['b','c']]);
const c=cp('c',90,[['a'],['b','c']]);
test('finds earliest mismatched checkpoint, not last failure',()=>{
 const result=trace({timeline:{checkpoints:[a,b,c]},checkpointId:'c',physicalGroupsAtKm});
 assert.equal(result.status,'FIRST_DIVERGENCE_FOUND');
 assert.equal(result.firstDivergence,'MEMBERSHIP_DRIFT');
 assert.equal(result.sequence,'AFTER_PRIOR_ALIGNMENT');
 assert.equal(result.atFailedCheckpoint,false);
 assert.equal(result.inspected,3);
 assert.ok(!JSON.stringify(result).includes('checkpointId'));
});
test('identifies same-distance and incident origins separately',()=>{
 const result=trace({timeline:{checkpoints:[a,cp('b',80,[['a'],['b','c']])]},
 checkpointId:'b',physicalGroupsAtKm});
 assert.equal(result.firstDivergence,'SAME_KM_MEMBERSHIP_DRIFT');
 const incident=trace({timeline:{checkpoints:[a,cp('b',85,[['a'],['b','c']],[{eventType:'incident'}])]},
 checkpointId:'b',physicalGroupsAtKm});
 assert.equal(incident.firstDivergence,'INCIDENT_MEMBERSHIP_DRIFT');
});
test('distinguishes rider-set drift and unavailable physics',()=>{
 const result=trace({timeline:{checkpoints:[a,cp('b',85,[['a','b']])]},
 checkpointId:'b',physicalGroupsAtKm});
 assert.equal(result.firstDivergence,'RIDER_SET_DRIFT');
 assert.equal(trace({timeline:{checkpoints:[a]},checkpointId:'a',
 physicalGroupsAtKm:()=>[]}).status,'UNAVAILABLE');
});
