import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivateLatePhysicalMismatchV4 as classify} from './privateLatePhysicalMismatchV4.mjs';
const checkpoint=(id,km,groups,commentary=[],states)=>({
 checkpointId:id,raceProgress:{kmFromStart:km},
 groups:groups.map(riderIds=>({riderIds})),commentary,
 riderStates:states??groups.flatMap(ids=>ids.map(riderId=>({riderId,status:'racing'})))
});
const initial=checkpoint('initial',85,[['a','b'],['c']]);
const final=checkpoint('final',90,[['a'],['b','c']]);
const args={timeline:{checkpoints:[initial,final]},checkpointId:'final',riderId:'b'};
test('classifies true physical changes separately from mismatched replay groups',()=>{
 const out=classify({...args,physicalGroupsAtKm:km=>km===85?
  [{riderIds:['a','b']},{riderIds:['c']}]:
  [{riderIds:['a']},{riderIds:['b','c']}]});
 assert.deepEqual(out,{status:'CLASSIFIED',transition:'REAL_PARTITION_CHANGE',
 alignment:'BOTH_MATCH',incident:'NO_INCIDENT_EVIDENCE'});
});
test('classifies replay-only mismatch with unchanged physics',()=>{
 const out=classify({...args,physicalGroupsAtKm:()=>[
  {riderIds:['a','b']},{riderIds:['c']}]});
 assert.equal(out.transition,'STABLE_PARTITION');
 assert.equal(out.alignment,'PREVIOUS_ONLY_MATCH');
});
test('refuses to infer exact physical events between equal-distance checkpoints',()=>{
 const sameKm=checkpoint('final',85,[['a'],['b','c']]);
 const out=classify({...args,timeline:{checkpoints:[initial,sameKm]},
  physicalGroupsAtKm:()=>[{riderIds:['a','b']},{riderIds:['c']}]});
 assert.equal(out.transition,'SAME_DISTANCE_UNOBSERVABLE');
});
test('distinguishes confirmed DNF from unexplained incident removal',()=>{
 const cp=checkpoint('final',90,[['a'],['b','c']],[{eventType:'incident'}]);
 const stage={INITIAL:[{riderIds:['a','b','c']}],AFTER_DETACHMENT:[{riderIds:['a','b']}]};
 const out=classify({...args,timeline:{checkpoints:[initial,cp]},
  physicalGroupsAtKm:()=>[{riderIds:['a','b']},{riderIds:['c']}],
  phase10Stages:stage,reachedDnfRiderIds:['c']});
 assert.equal(out.incident,'CONFIRMED_DNF_REMOVAL');
 assert.equal(classify({...args,timeline:{checkpoints:[initial,cp]},
  physicalGroupsAtKm:()=>[{riderIds:['a','b']},{riderIds:['c']}],
  phase10Stages:stage,reachedDnfRiderIds:[]}).incident,'PHASE10_OTHER_REMOVAL');
});
test('returns fixed unavailable without rider or raw information',()=>{
 assert.equal(classify({...args,physicalGroupsAtKm:()=>[]}).status,'UNAVAILABLE');
});
