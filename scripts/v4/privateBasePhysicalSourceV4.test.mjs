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
  'NON_NEUTRAL_EVENT');
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

test('repairs only independently witnessed P-to-C split at an existing event',()=>{
 const event={...cp,checkpointKind:'event',
  commentary:[{eventType:'group_split',riderIds:['b'],commentaryId:'split-evidence'}]};
 const original={...event};
 const physicallyWitnessed=km=>km<90?
  [{...physical[0],riderIds:['a','b']},
   {...physical[1],riderIds:['c']}]:physical;
 const result=build({...args,timeline:{checkpoints:[{checkpointId:'start'},event]},
  baseTimeline:{checkpoints:[original]},physicalGroupsAtKm:physicallyWitnessed});
 assert.equal(result.status,'BASE_PHYSICAL_EVENT_CREATED');
 assert.deepEqual(result.timeline.checkpoints[1].groups.map(g=>g.riderIds),[['a'],['b','c']]);
 assert.equal(result.timeline.checkpoints[1].commentary[0].commentaryId,'split-evidence');
 assert.equal(result.officialWrites,0);
 assert.deepEqual(event.groups[0].riderIds,['a','b']);
});
test('fails closed when P-to-C movement is not physically witnessed or incident riders differ',()=>{
 const event={...cp,checkpointKind:'event',
  commentary:[{eventType:'group_split',riderIds:['b']}]};
 const timeline={checkpoints:[{checkpointId:'start'},event]};
 assert.equal(build({...args,timeline,baseTimeline:{checkpoints:[event]}}).status,
  'EVENT_PHYSICAL_TRANSITION_UNVERIFIED');
 const witnessed=km=>km<90?
  [{...physical[0],riderIds:['a','b']},
   {...physical[1],riderIds:['c']}]:physical;
 assert.equal(build({...args,timeline:{checkpoints:[{checkpointId:'start'},
  {...event,commentary:[{eventType:'group_split',riderIds:['c']}]}]},
  baseTimeline:{checkpoints:[event]},physicalGroupsAtKm:witnessed}).status,
  'EVENT_RIDERS_UNVERIFIED');
 assert.equal(build({...args,timeline,baseTimeline:{checkpoints:[event]},
  physicalGroupsAtKm:witnessed,reachedDnfRiderIds:['c']}).status,'DNF_UNVERIFIED');
});
