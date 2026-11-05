import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivateResidualRiderSetOriginV4 as classify} from './privateResidualRiderSetOriginV4.mjs';
const raw=[
 {riderIds:['a','b'],groupCode:'P'},
 {riderIds:['c','d'],groupCode:'C1'}
];
const checkpoint=groups=>({
 raceProgress:{kmFromStart:100},groups
});
const args=(groups,stageGroups,detachment)=>({
 checkpoint:checkpoint(groups),physicalGroupsAtKm:()=>raw,
 phase10Stages:stageGroups?{
  INITIAL:stageGroups[0],AFTER_DISPLAY_NORMALIZATION:stageGroups[1]
 }:undefined,detachment
});
test('attributes mismatching rider sets to inherited Phase10 source',()=>{
 const replay=[{riderIds:['a','c']},{riderIds:['d']}];
 const result=classify(args(replay,[replay,replay],{
  dnfRiderIds:['b'],autonomousRiderIds:[]
 }));
 assert.equal(result.status,'CLASSIFIED');
 assert.equal(result.riderSetDirection,'PHYSICAL_EXTRA_ONLY');
 assert.equal(result.recordedMissingCoverage,'ALL_CONFIRMED_DNF');
 assert.equal(result.phase10Initial,'INITIAL_RIDER_SET_DIFFERS');
 assert.equal(result.phase10Final,'FINAL_MATCHES_PUBLISHED');
 assert.equal(result.firstSource,'INITIAL_ALREADY_DRIFTED');
 assert.equal(result.physicalMatch,'RIDER_SET_DIFFERS');
 assert.equal(result.riderIds,undefined);
});
test('reports a true physically aligned survivor partition',()=>{
 const survivors=[{riderIds:['a']},{riderIds:['c','d']}];
 const result=classify(args(survivors,[survivors,survivors],{
  dnfRiderIds:['b'],autonomousRiderIds:[]
 }));
 assert.equal(result.physicalMatch,'DNF_ADJUSTED_MATCH');
 assert.equal(result.recordedMissingCoverage,'ALL_CONFIRMED_DNF');
 assert.equal(result.firstSource,'SOURCE_ALIGNED');
 assert.equal(result.phase10Initial,'INITIAL_DNF_ADJUSTED');
});
test('separates unexplained extras and post-Phase10 divergence',()=>{
 const replay=[{riderIds:['a','e']},{riderIds:['c','d']}];
 const initial=[{riderIds:['a','b']},{riderIds:['c','d']}];
 const result=classify(args(replay,[initial,initial],{
  dnfRiderIds:[],autonomousRiderIds:[]
 }));
 assert.equal(result.riderSetDirection,'BOTH_DIRECTIONAL_DIFFERENCE');
 assert.equal(result.recordedMissingCoverage,'UNEXPLAINED_PHYSICAL_EXTRA');
 assert.equal(result.phase10Initial,'INITIAL_RAW_PHYSICAL');
 assert.equal(result.phase10Final,'FINAL_RIDER_SET_DIFFERS');
 assert.equal(result.firstSource,'POST_PHASE10_DIVERGENCE');
});
test('records group drift without changing any physical or published groups',()=>{
 const replay=[{riderIds:['a','c']},{riderIds:['b','d']}];
 const initial=[{riderIds:['a','b']},{riderIds:['c','d']}];
 const result=classify(args(replay,[initial,replay],{
  dnfRiderIds:[],autonomousRiderIds:[]
 }));
 assert.equal(result.riderSetDirection,'SAME_RIDER_SET');
 assert.equal(result.physicalMatch,'RIDER_SET_MATCH_PARTITION_DIFFERS');
 assert.equal(result.phase10Initial,'INITIAL_RAW_PHYSICAL');
 assert.equal(result.firstSource,'PHASE10_OR_SOURCE_DRIFT');
 assert.deepEqual(replay[0].riderIds,['a','c']);
 assert.deepEqual(initial[0].riderIds,['a','b']);
});
test('fails closed on duplicate riders, unavailable evidence and malformed physical input',()=>{
 assert.equal(classify({checkpoint:checkpoint(raw),
  physicalGroupsAtKm:()=>[{riderIds:['a','a']}]}).status,'UNAVAILABLE');
 assert.equal(classify({checkpoint:checkpoint(raw),
  physicalGroupsAtKm:()=>{throw Error('no')} }).status,'UNAVAILABLE');
 const result=classify(args([{riderIds:['a']}],null,null));
 assert.equal(result.firstSource,'STAGES_UNAVAILABLE');
 assert.equal(result.recordedMissingCoverage,'DETACHMENT_UNKNOWN');
 assert.equal(result.phase10Initial,'UNAVAILABLE');
});
