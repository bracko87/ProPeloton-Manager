import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateBasePhysicalSourceV4 as build} from './privateBasePhysicalSourceV4.mjs';
const physical=[
 {groupCode:'peloton',displayCode:'P',physicalPosition:'peloton',colorKey:'peloton_blue',
  riderIds:['a'],gapSeconds:0},
 {groupCode:'chase_group',displayCode:'C1',physicalPosition:'behind_peloton',
  colorKey:'chasing_orange',riderIds:['b','c'],gapSeconds:12}
];
const stale=[
 {groupCode:'peloton',displayCode:'P',riderIds:['a','b']},
 {groupCode:'chase_group',displayCode:'C1',riderIds:['c']}
];
const cp={checkpointId:'race|replay|phase-3-end',checkpointKind:'base',
 raceProgress:{kmFromStart:90},groups:stale,
 gaps:[{groupCode:'peloton',displayCode:'P',gapSeconds:0},
 {groupCode:'chase_group',displayCode:'C1',gapSeconds:10}],
 riderStates:['a','b','c'].map(riderId=>({riderId,status:'racing',
  groupCode:'peloton',displayCode:'P',gapSeconds:0,energy:47})),
 commentary:[{eventType:'race_status',commentaryId:'existing'}],
 finalResultsVisible:false};
const args={timeline:{checkpoints:[{checkpointId:'start'},cp]},
 baseTimeline:{checkpoints:[cp]},checkpointId:cp.checkpointId,
 physicalGroupsAtKm:()=>physical,
 provenance:{status:'INHERITED_BASE_DRIFT',origin:'BASE_EVENT'},
 reachedDnfRiderIds:[]};
test('reconstructs a neutral base replay checkpoint from same-km physical group identity and gap',()=>{
 const result=build(args);
 assert.equal(result.status,'BASE_PHYSICAL_SOURCE_CREATED');
 assert.deepEqual(result.timeline.checkpoints[1].groups.map(g=>g.riderIds),[['a'],['b','c']]);
 assert.deepEqual(result.timeline.checkpoints[1].gaps.map(g=>g.gapSeconds),[0,12]);
 const rider=result.timeline.checkpoints[1].riderStates.find(x=>x.riderId==='b');
 assert.deepEqual([rider.displayCode,rider.gapSeconds,rider.energy],['C1',12,47]);
 assert.equal(result.timeline.checkpoints[1].commentary[0].commentaryId,'existing');
 assert.deepEqual(cp.groups[0].riderIds,['a','b']);
 assert.equal(result.officialWrites,0);
 assert.equal(result.researchOnly,true);
});
test('does not invent movement at a causal transition or overwrite result',()=>{
 const changed={...cp,commentary:[{eventType:'group_split'}]};
 assert.equal(build({...args,timeline:{checkpoints:[{checkpointId:'start'},changed]}}).status,
  'CHECKPOINT_UNSAFE');
 assert.equal(build({...args,timeline:{checkpoints:[{checkpointId:'start'},
  {...cp,finalResultsVisible:true}]}}).status,'CHECKPOINT_UNSAFE');
 assert.equal(build({...args,provenance:{status:'EXACT_INHERITED_STALE_BASE_MEMBERSHIP',
  origin:'EXACT_EVENT'}}).status,'PROVENANCE_NOT_CONFIRMED');
});
test('fails closed on unmatched riders, absent physical gaps and DNF mismatches',()=>{
 assert.equal(build({...args,physicalGroupsAtKm:()=>[
  {...physical[0],riderIds:['a','x']},physical[1]]}).status,'RIDER_SET_MISMATCH');
 assert.equal(build({...args,physicalGroupsAtKm:()=>[
  physical[0],{...physical[1],gapSeconds:NaN}]}).status,
  'PHYSICAL_GROUP_IDENTITY_UNSAFE');
 assert.equal(build({...args,reachedDnfRiderIds:['b']}).status,'DNF_UNVERIFIED');
});
