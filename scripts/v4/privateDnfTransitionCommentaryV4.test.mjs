import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateDnfTransitionCommentaryV4 as build} from './privateDnfTransitionCommentaryV4.mjs';
const groups=(...ids)=>ids.map(riderIds=>({riderIds}));
const previous={
 checkpointId:'before',raceProgress:{kmFromStart:88},
 groups:groups(['a','b','c'],['d']),riderStates:[],commentary:[],finalResultsVisible:false
};
const current={
 checkpointId:'after',raceProgress:{kmFromStart:88},
 groups:groups(['a','b'],['d']),riderStates:['a','b','d'].map(riderId=>({riderId,status:'racing'}))
 .concat([{riderId:'c',status:'dnf'}]),commentary:[],finalResultsVisible:false
};
const args={
 timeline:{checkpoints:[previous,current]},checkpointId:'after',
 physicalGroupsAtKm:()=>groups(['a','b','c'],['d']),
 phase10Stages:{INITIAL:groups(['a','b','c'],['d']),
 AFTER_DETACHMENT:groups(['a','b'],['d'])},reachedDnfRiderIds:['c']
};
test('private documented DNF transition preserves groups, statuses and original timeline',()=>{
 const result=build(args);
 assert.equal(result.status,'DNF_TRANSITION_CREATED');
 assert.equal(result.timeline.checkpoints[1].commentary[0].eventType,'group_split');
 assert.deepEqual(result.timeline.checkpoints[1].groups,current.groups);
 assert.deepEqual(result.timeline.checkpoints[1].riderStates,current.riderStates);
 assert.equal(args.timeline.checkpoints[1].commentary.length,0);
 assert.equal(result.officialWrites,0);
});
test('rejects unverified DNF and already documented physical transition',()=>{
 assert.equal(build({...args,reachedDnfRiderIds:[]}).status,'EVIDENCE_NOT_CONFIRMED');
 const already={...current,commentary:[{eventType:'incident'}]};
 assert.equal(build({...args,timeline:{checkpoints:[previous,already]}}).status,'EXISTING_TRANSITION');
});
test('fails closed when no rider newly leaves a prior active group',()=>{
 const old={...previous,groups:groups(['a','b'],['d'])};
 assert.equal(build({...args,timeline:{checkpoints:[old,current]}}).status,'NOT_NEWLY_DETACHED');
});
