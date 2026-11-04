import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateUnifiedMergerCandidateV4 as build} from './privateUnifiedMergerCandidateV4.mjs';
const cp=(checkpointId,km,groups,states=[])=>({
 checkpointId,raceProgress:{kmFromStart:km},groups:groups.map(riderIds=>({riderIds})),
 riderStates:states,commentary:[]
});
const proposal={eventType:'group_merge',source:'authoritative_physical_groups',
 exactEventKmKnown:false,exactEventTimeKnown:false,
 observedBetweenKm:[10,20],beforeMembers:['a'],afterMembers:['a','b']};
const before=cp('before',10,[['a'],['b'],['c']]);
const direct={timeline:{checkpoints:[before,cp('after',20,[['a','b'],['c']])]},
 checkpointId:'after',riderId:'a',proposal};
test('unifies direct physically grounded merger without changing original',()=>{
 const out=build(direct);
 assert.equal(out.status,'CANDIDATE_CREATED');
 assert.equal(out.mode,'PHYSICAL_MERGER');
 assert.equal(direct.timeline.checkpoints[1].commentary.length,0);
 assert.equal(out.timeline.checkpoints[1].commentary[0].eventType,'group_merge');
});
test('confirmed DNF is eligible through same research candidate path',()=>{
 const timeline={checkpoints:[before,cp('after',20,[['a','b']],[
 {riderId:'c',status:'dnf'}])]};
 const out=build({...direct,timeline,
 proposal:{...proposal,afterMembers:['a','b','c']},
 detachmentClass:'DNF_DETACHMENT',reachedDnfRiderIds:['c']});
 assert.equal(out.status,'CANDIDATE_CREATED');
 assert.equal(out.mode,'DNF_AWARE_MERGER');
 assert.equal(out.officialWrites,0);
});
test('rejects attempted DNF fallback without provenance or with inconsistent status',()=>{
 const timeline={checkpoints:[before,cp('after',20,[['a','b']],[
 {riderId:'c',status:'racing'}])]};
 const args={...direct,timeline,proposal:{...proposal,afterMembers:['a','b','c']},
 reachedDnfRiderIds:['c']};
 assert.equal(build(args).status,'NOT_ELIGIBLE');
 assert.equal(build({...args,detachmentClass:'DNF_DETACHMENT'}).status,'GUARD_REJECTED');
 assert.equal(build({...direct,proposal:{...proposal,eventType:'group_split'}}).status,'NOT_ELIGIBLE');
});
