import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateResidualPhysicalCheckpointV4 as build} from './privateResidualPhysicalCheckpointV4.mjs';
const physical=[
 {groupCode:'peloton',displayCode:'P',riderIds:['a'],gapSeconds:0},
 {groupCode:'chase1',displayCode:'C1',riderIds:['b','c'],gapSeconds:12},
 {groupCode:'chase2',displayCode:'C2',riderIds:['d'],gapSeconds:30}
];
const stale=[
 {...physical[0]}, {...physical[1],riderIds:['b']},
 {...physical[2],riderIds:['c','d']}
];
const states=['a','b','c','d'].map(riderId=>({riderId,status:'racing',
 energy:42,displayCode:'C2',gapSeconds:30,groupCode:'chase2'}));
const checkpoint={checkpointId:'stale',checkpointKind:'event',
 raceProgress:{kmFromStart:90},finalResultsVisible:false,
 commentary:[{eventType:'late_chase',commentaryId:'source-commentary'}],
 incidents:[],groups:stale,gaps:stale.map(g=>({...g,gapSeconds:20})),
 riderStates:states};
const next={...checkpoint,checkpointId:'residual',
 raceProgress:{kmFromStart:92},groups:physical,
 gaps:physical.map(g=>({...g,gapSeconds:g.gapSeconds+2})),
 riderStates:states};
const timeline={checkpoints:[{checkpointId:'start'},checkpoint,next]};
const args={timeline,checkpointId:'stale',residualCheckpointId:'residual',
 physicalGroupsAtKm:()=>physical};
test('repairs only independently stable, passive stale checkpoint with same-km gaps',()=>{
 const result=build(args);
 assert.equal(result.status,'RESIDUAL_PHYSICAL_CHECKPOINT_CREATED');
 assert.deepEqual(result.timeline.checkpoints[1].groups.map(g=>g.riderIds),
  [['a'],['b','c'],['d']]);
 assert.deepEqual(result.timeline.checkpoints[1].gaps.map(g=>g.gapSeconds),[0,12,30]);
 const c=result.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='c');
 assert.deepEqual([c.displayCode,c.groupCode,c.energy],['C1','chase1',42]);
 assert.equal(result.timeline.checkpoints[1].commentary[0].commentaryId,'source-commentary');
 assert.deepEqual(result.timeline.checkpoints[2],next);
 assert.deepEqual(timeline.checkpoints[1].groups[2].riderIds,['c','d']);
 assert.equal(result.officialWrites,0);assert.equal(result.researchOnly,true);
});
test('cannot rewrite a causal transition, incident or published finish',()=>{
 for(const eventType of ['group_split','group_merge','catch','bridge_attack','attack']){
  assert.equal(build({...args,timeline:{checkpoints:[timeline.checkpoints[0],
   {...checkpoint,commentary:[{eventType}]},next]}}).status,
   'CAUSAL_OR_INCIDENT_UNSAFE');
 }
 assert.equal(build({...args,timeline:{checkpoints:[timeline.checkpoints[0],
  {...checkpoint,incidents:[{incidentId:'i'}]},next]}}).status,
  'CAUSAL_OR_INCIDENT_UNSAFE');
 assert.equal(build({...args,timeline:{checkpoints:[timeline.checkpoints[0],
  {...checkpoint,finalResultsVisible:true},next]}}).status,
  'CAUSAL_OR_INCIDENT_UNSAFE');
});
test('rejects a real physical transition, source drift or unmatched riders',()=>{
 const changing=km=>km<90?[physical[0],
  {...physical[1],riderIds:['b']},
  {...physical[2],riderIds:['c','d']}]:physical;
 assert.equal(build({...args,physicalGroupsAtKm:changing}).status,
  'PHYSICAL_MOVEMENT_PRESENT');
 assert.equal(build({...args,timeline:{checkpoints:[timeline.checkpoints[0],
   checkpoint,{...next,groups:stale}]}}).status,'CURRENT_NOT_PHYSICAL');
 assert.equal(build({...args,timeline:{checkpoints:[timeline.checkpoints[0],
  {...checkpoint,groups:stale.map((g,i)=>i===1?{...g,riderIds:['x']}:g)},next]}})
  .status,'RIDER_SET_MISMATCH');
});
test('rejects DNF, duplicate codes and changed physical lineage labels',()=>{
 assert.equal(build({...args,timeline:{checkpoints:[timeline.checkpoints[0],
  {...checkpoint,riderStates:states.map(s=>s.riderId==='c'?{...s,status:'dnf'}:s)},next]}})
  .status,'RIDER_STATE_UNSAFE');
 assert.equal(build({...args,physicalGroupsAtKm:()=>[
  physical[0],{...physical[1],displayCode:'C2'},physical[2]]}).status,
  'PHYSICAL_GROUP_IDENTITY_UNSAFE');
 assert.equal(build({...args,physicalGroupsAtKm:km=>km<=90?physical:
  physical.map(g=>g.displayCode==='C1'?{...g,displayCode:'C3'}:g)})
  .status,'PHYSICAL_GROUP_IDENTITY_UNSAFE');
});
