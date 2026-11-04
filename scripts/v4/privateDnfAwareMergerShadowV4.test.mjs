import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateDnfAwareMergerShadowV4 as build} from './privateDnfAwareMergerShadowV4.mjs';
const cp=(checkpointId,km,groups,states=[])=>({
 checkpointId,raceProgress:{kmFromStart:km},
 groups:groups.map(riderIds=>({riderIds})),commentary:[],riderStates:states
});
const timeline={checkpoints:[
 cp('before',10,[['a'],['b'],['c']]),
 cp('after',20,[['a','b']],[
  {riderId:'a',status:'racing'},{riderId:'b',status:'racing'},
  {riderId:'c',status:'dnf'}
 ])
]};
const proposal={eventType:'group_merge',source:'authoritative_physical_groups',
 exactEventKmKnown:false,exactEventTimeKnown:false,
 observedBetweenKm:[10,20],beforeMembers:['a'],afterMembers:['a','b','c']};
const args={timeline,checkpointId:'after',riderId:'a',proposal,reachedDnfRiderIds:['c']};
test('only confirmed DNF is excluded, preserving original timeline and proposal',()=>{
 const out=build(args);
 assert.equal(out.status,'DNF_AWARE_SHADOW_CREATED');
 assert.equal(out.dnfExclusions,1);
 assert.equal(out.timeline.checkpoints[1].commentary[0].eventType,'group_merge');
 assert.equal(timeline.checkpoints[1].commentary.length,0);
 assert.deepEqual(proposal.afterMembers,['a','b','c']);
 assert.equal(out.officialWrites,0);
});
test('missing rider cannot be silently excluded without incident and DNF status',()=>{
 assert.equal(build({...args,reachedDnfRiderIds:[]}).status,'NON_DNF_MEMBERSHIP_MISMATCH');
 const alive={checkpoints:[timeline.checkpoints[0],cp('after',20,[['a','b']],[
 {riderId:'c',status:'racing'}])]};
 assert.equal(build({...args,timeline:alive}).status,'DNF_STATUS_NOT_CONFIRMED');
});
test('rejects orphaned merger and extra published membership',()=>{
 const one={checkpoints:[timeline.checkpoints[0],cp('after',20,[['a']],[
 {riderId:'b',status:'dnf'},{riderId:'c',status:'dnf'}])]};
 assert.equal(build({...args,timeline:one,reachedDnfRiderIds:['b','c']}).status,'NO_SURVIVING_MERGER');
 const extra={checkpoints:[timeline.checkpoints[0],cp('after',20,[['a','b','x']],[
 {riderId:'c',status:'dnf'}])]};
 assert.equal(build({...args,timeline:extra}).status,'NON_DNF_MEMBERSHIP_MISMATCH');
});
