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
  'EVENT_SOURCE_UNVERIFIED');
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

test('preserves an independently sourced passive base event plus Phase10 incident commentary',()=>{
 const base={...cp,checkpointKind:'event',commentary:[
  {eventType:'late_chase',commentaryId:'race|replay|late-chase-step-1|commentary'}]};
 const published={...base,incidents:[{incidentId:'inc-1',riderIds:['c']}],
  commentary:[...base.commentary,{
   eventType:'incident',commentaryId:'commentary:inc-1',riderIds:['c']}]};
 const out=build({...args,timeline:{checkpoints:[{checkpointId:'start'},published]},
  baseTimeline:{checkpoints:[base]}});
 assert.equal(out.status,'BASE_PHYSICAL_PASSIVE_EVENT_CREATED');
 assert.deepEqual(out.timeline.checkpoints[1].groups.map(g=>g.riderIds),[['a'],['b','c']]);
 assert.equal(out.timeline.checkpoints[1].commentary[1].commentaryId,'commentary:inc-1');
 assert.deepEqual(out.timeline.checkpoints[1].incidents,published.incidents);
 assert.equal(out.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='b').energy,47);
 assert.deepEqual(published.groups[0].riderIds,['a','b']);
});
test('rejects unverified Phase10 commentary and physically causal base events',()=>{
 const base={...cp,checkpointKind:'event',commentary:[
  {eventType:'late_chase',commentaryId:'late|commentary'}]};
 const bad={...base,incidents:[],commentary:[...base.commentary,{
  eventType:'incident',commentaryId:'commentary:unconfirmed',riderIds:['a']}]};
 assert.equal(build({...args,timeline:{checkpoints:[{checkpointId:'start'},bad]},
  baseTimeline:{checkpoints:[base]}}).status,'ADDITIONAL_EVENT_UNVERIFIED');
 const causal={...base,commentary:[{eventType:'bridge_attack',commentaryId:'attack'}]};
 assert.equal(build({...args,timeline:{checkpoints:[{checkpointId:'start'},causal]},
  baseTimeline:{checkpoints:[causal]}}).status,'EVENT_RIDERS_UNVERIFIED');
});

test('accepts an existing bridge attack only when physical P-to-C movement is independently witnessed',()=>{
 const bridge={...cp,checkpointKind:'event',commentary:[
  {eventType:'bridge_attack',commentaryId:'existing-bridge-attack',riderIds:['b']}]};
 const witnessed=km=>km<90?[
  {...physical[0],riderIds:['a','b']},
  {...physical[1],riderIds:['c']}
 ]:physical;
 const out=build({...args,timeline:{checkpoints:[{checkpointId:'start'},bridge]},
  baseTimeline:{checkpoints:[bridge]},physicalGroupsAtKm:witnessed});
 assert.equal(out.status,'BASE_PHYSICAL_EVENT_CREATED');
 assert.equal(out.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='b').displayCode,'C1');
 assert.equal(out.timeline.checkpoints[1].commentary[0].commentaryId,'existing-bridge-attack');
});

test('reports only fixed event kind and physical boundary when causal base event is blocked',()=>{
 const catchEvent={...cp,checkpointKind:'event',
  commentary:[{eventType:'catch',commentaryId:'existing-catch',riderIds:['b']}]};
 const candidate={...args,
  timeline:{checkpoints:[{checkpointId:'start'},catchEvent]},
  baseTimeline:{checkpoints:[catchEvent]}};
 const unchanged=build(candidate);
 assert.equal(unchanged.status,'CATCH_PHYSICAL_TRANSITION_UNVERIFIED');
 assert.equal(unchanged.timeline,undefined);
 const witnessed=km=>km<90?
  [{...physical[0],riderIds:['a','b']},
   {...physical[1],riderIds:['c']}]:physical;
 const changed=build({...candidate,physicalGroupsAtKm:witnessed});
 assert.equal(changed.status,'CATCH_DIRECTION_OR_RIDERS_UNVERIFIED');
 assert.equal(changed.timeline,undefined);
});

test('corrects an existing catch checkpoint ONLY when its riders physically join the peloton',()=>{
 const staleCatchGroups=[
  {...physical[0],riderIds:['a']},
  {...physical[1],riderIds:['b','c']}
 ];
 const catchEvent={...cp,checkpointKind:'event',
  groups:staleCatchGroups,
  commentary:[{eventType:'catch',commentaryId:'recorded-catch',
    title:'An existing group is caught',riderIds:['b']}]
 };
 const physicallyWitnessed=km=>km<90?staleCatchGroups:[
  {...physical[0],riderIds:['a','b']},
  {...physical[1],riderIds:['c']}
 ];
 const result=build({...args,
  timeline:{checkpoints:[{checkpointId:'start'},catchEvent]},
  baseTimeline:{checkpoints:[catchEvent]},
  physicalGroupsAtKm:physicallyWitnessed
 });
 assert.equal(result.status,'BASE_PHYSICAL_CATCH_CREATED');
 assert.deepEqual(result.timeline.checkpoints[1].groups.map(g=>g.riderIds),[['a','b'],['c']]);
 assert.equal(result.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='b').displayCode,'P');
 assert.equal(result.timeline.checkpoints[1].commentary[0].commentaryId,'recorded-catch');
 assert.equal(result.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='b').energy,47);
 assert.equal(result.officialWrites,0);
 assert.deepEqual(catchEvent.groups[0].riderIds,['a']);
});
test('rejects catch when movement into peloton is absent, fabricated, or disagrees with source riders',()=>{
 const event={...cp,checkpointKind:'event',commentary:[
  {eventType:'catch',commentaryId:'recorded-catch',riderIds:['c']}]};
 const physicalMove=km=>km<90?[
  {...physical[0],riderIds:['a','b']},
  {...physical[1],riderIds:['c']}
 ]:[
  {...physical[0],riderIds:['a','b','x']}
 ];
 const candidate={...args,timeline:{checkpoints:[{checkpointId:'start'},event]},
  baseTimeline:{checkpoints:[event]},physicalGroupsAtKm:physicalMove};
 // No checkpoint repair can introduce or hide riders.
 assert.equal(build(candidate).status,'CATCH_PHYSICAL_TRANSITION_UNVERIFIED');
 const wrong={...event,commentary:[{...event.commentary[0],riderIds:['b']}]};
 assert.equal(build({...candidate,timeline:{checkpoints:[{checkpointId:'start'},wrong]}}).status,
  'CATCH_EVENT_SOURCE_UNVERIFIED');
});
