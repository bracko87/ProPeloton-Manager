import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivatePhysicalMergerShadowV4 as build} from './privatePhysicalMergerShadowV4.mjs';
const cp=(id,km,members,commentary=[])=>({
 checkpointId:id,raceProgress:{kmFromStart:km},
 groups:members.map(riderIds=>({riderIds})),commentary
});
const timeline={modelVersion:'universal_replay_timeline_v1',checkpoints:[
 cp('before',10,[['a'],['b'],['c','d']]),cp('after',20,[['a','b'],['c','d']])
]};
const proposal={eventType:'group_merge',source:'authoritative_physical_groups',
 exactEventKmKnown:false,exactEventTimeKnown:false,observedBetweenKm:[10,20],
 beforeMembers:['a'],afterMembers:['a','b']};
const args={timeline,checkpointId:'after',riderId:'a',proposal};
test('shadow merge is attached only to existing checkpoint and never claims exact time',()=>{
 const result=build(args);
 assert.equal(result.status,'SHADOW_CREATED');
 assert.equal(timeline.checkpoints[1].commentary.length,0);
 assert.equal(result.timeline.checkpoints.length,2);
 assert.equal(result.timeline.checkpoints[1].commentary[0].eventType,'group_merge');
 assert.match(result.timeline.checkpoints[1].commentary[0].description,/exact merger point undetermined/);
 assert.equal(result.officialWrites,0);
});
test('rejects unsupported physical changes and mismatched replay memberships',()=>{
 assert.equal(build({...args,proposal:{...proposal,eventType:'group_split'}}).status,'REJECTED_EVIDENCE');
 assert.equal(build({...args,proposal:{...proposal,beforeMembers:['b']}}).status,'REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH');
 assert.equal(build({...args,proposal:{...proposal,exactEventKmKnown:true}}).status,'REJECTED_EVIDENCE');
});
test('does not duplicate or override existing transition commentary',()=>{
 const existing={...timeline,checkpoints:[timeline.checkpoints[0],cp('after',20,[['a','b'],['c','d']],[{eventType:'group_merge',commentaryId:'existing'}])]};
 assert.equal(build({...args,timeline:existing}).status,'ALREADY_HAS_TRANSITION');
});
test('identical-distance checkpoints cannot create a shadow merger',()=>{
 const same={...timeline,checkpoints:[cp('before',20,[['a'],['b'],['c','d']]),timeline.checkpoints[1]]};
 assert.equal(build({...args,timeline:same}).status,'REPLAY_PHYSICAL_MEMBERSHIP_MISMATCH');
});
