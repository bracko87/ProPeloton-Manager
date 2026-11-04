import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCheckpointGroupStagesV4 as classify} from './privateCheckpointGroupStagesV4.mjs';
const g=ids=>[{riderIds:ids}];
const base={riderId:'a',physicalMembers:['a','b'],raw:g(['a','b']),
 normalized:g(['a','b']),published:g(['a','b']),finalGroups:g(['a','b'])};
test('detects source definition discrepancy',()=>{
 assert.equal(classify({...base,raw:g(['a'])}),'DEFINITION_ALREADY_DIFFERS');
});
test('detects normalization, publication, and later changes',()=>{
 assert.equal(classify({...base,normalized:g(['a'])}),'NORMALIZATION_DIVERGENCE');
 assert.equal(classify({...base,published:g(['a'])}),'PUBLICATION_FILTER_DIVERGENCE');
 assert.equal(classify({...base,finalGroups:g(['a'])}),'POST_CONSTRUCTION_DIVERGENCE');
});
test('passes aligned evidence, fails closed on incomplete rider group',()=>{
 assert.equal(classify(base),'STAGES_MATCH_PHYSICAL');
 assert.equal(classify({...base,raw:g(['z'])}),'RIDER_GROUP_UNAVAILABLE');
});
