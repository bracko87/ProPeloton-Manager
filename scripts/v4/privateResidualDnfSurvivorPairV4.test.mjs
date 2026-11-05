import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateResidualDnfSurvivorPairV4 as trial} from './privateResidualDnfSurvivorPairV4.mjs';
const physical=[
 {groupCode:'peloton',displayCode:'P',gapSeconds:0,riderIds:['a']},
 {groupCode:'chase1',displayCode:'C1',gapSeconds:25,riderIds:['b','c']},
 {groupCode:'chase2',displayCode:'C2',gapSeconds:60,riderIds:['d','e']}
];
const initialStale=[
 physical[0],{...physical[1],riderIds:['b']},
 {...physical[2],riderIds:['c','d','e']}
];
const firstGroups=[
 physical[0],{...physical[1],riderIds:['b']},
 {...physical[2],riderIds:['c','d']}
];
const secondGroups=[
 physical[0],{...physical[1],riderIds:['b','d']},
 {...physical[2],riderIds:['c']}
];
const states=['a','b','c','d','e'].map(riderId=>({
 riderId,status:riderId==='e'?'dnf':'racing',
 energy:55,groupCode:'chase2',displayCode:'C2',gapSeconds:60
}));
const original=(id,km,groups)=>({
 checkpointId:id,checkpointKind:'event',
 raceProgress:{kmFromStart:km},finalResultsVisible:false,
 commentary:[{eventType:'late_chase',commentaryId:'source-'+id}],
 incidents:[{incidentId:'incident-'+id,riderIds:['e']}],
 groups,gaps:groups.map(g=>({...g,gapSeconds:g.gapSeconds})),
 riderStates:states
});
const first=original('first',90,firstGroups);
const second=original('second',92,secondGroups);
const source={checkpoints:[{checkpointId:'start'},first,second]};
const det={dnfRiderIds:['e'],autonomousRiderIds:[]};
const arg={timeline:source,checkpointId:'first',residualCheckpointId:'second',
 physicalGroupsAtKm:()=>physical,
 firstDetachment:det,secondDetachment:det,
 firstPhase10Stages:{INITIAL:initialStale},
 secondPhase10Stages:{INITIAL:physical}};
test('two DNF-adjusted checkpoints reconstruct ONLY survivor group snapshots',()=>{
 const out=trial(arg);
 assert.equal(out.status,'DNF_SURVIVOR_PAIR_CREATED');
 assert.equal(out.officialWrites,0);
 assert.equal(out.researchOnly,true);
 assert.equal(out.timeline.checkpoints.length,3);
 assert.deepEqual(out.timeline.checkpoints.map(c=>c.checkpointId),
  ['start','first','second']);
 for(const cp of out.timeline.checkpoints.slice(1)){
  assert.deepEqual(cp.groups.map(g=>g.riderIds),[['a'],['b','c'],['d']]);
  assert.deepEqual(cp.gaps.map(g=>g.gapSeconds),[0,25,60]);
  assert.equal(cp.riderStates.find(x=>x.riderId==='e').status,'dnf');
  assert.equal(cp.riderStates.find(x=>x.riderId==='e').energy,55);
 }
 assert.deepEqual(out.timeline.checkpoints[1].incidents,first.incidents);
 assert.deepEqual(out.timeline.checkpoints[2].incidents,second.incidents);
 assert.deepEqual(out.timeline.checkpoints[1].commentary,first.commentary);
 assert.deepEqual(out.timeline.checkpoints[2].commentary,second.commentary);
 assert.deepEqual(source.checkpoints[1].groups[2].riderIds,['c','d']);
 assert.deepEqual(source.checkpoints[2].groups[1].riderIds,['b','d']);
});
test('rejects imaginary DNF and incomplete physical or rider-state sources',()=>{
 assert.equal(trial({...arg,firstDetachment:{...det,dnfRiderIds:['d']}})
  .status,'SURVIVOR_SET_MISMATCH');
 assert.equal(trial({...arg,firstDetachment:{...det,dnfRiderIds:['x']}})
  .status,'DNF_RIDER_UNWITNESSED');
 const badFirst={...first,riderStates:states.map(x=>x.riderId==='e'?
  {...x,status:'racing'}:x)};
 assert.equal(trial({...arg,timeline:{checkpoints:[source.checkpoints[0],badFirst,second]}})
  .status,'RIDER_STATE_UNSAFE');
 assert.equal(trial({...arg,physicalGroupsAtKm:()=>[{...physical[0],riderIds:['a','a']}]})
  .status,'PHYSICAL_UNAVAILABLE');
});
test('preserves independent incident ledger and refuses fabricated comments',()=>{
 const narrated={...first,commentary:[...first.commentary,{
  eventType:'incident',commentaryId:'commentary:incident-first',riderIds:['e']
 }]};
 const valid=trial({...arg,timeline:{checkpoints:[source.checkpoints[0],narrated,second]}});
 assert.equal(valid.status,'DNF_SURVIVOR_PAIR_CREATED');
 assert.deepEqual(valid.timeline.checkpoints[1].commentary,narrated.commentary);
 const invented={...narrated,commentary:[...narrated.commentary,{
  eventType:'incident',commentaryId:'commentary:invented',riderIds:['a']}]};
 assert.equal(trial({...arg,timeline:{checkpoints:[source.checkpoints[0],invented,second]}})
  .status,'INCIDENT_OR_EVENT_UNSAFE');
});
test('cannot rewrite causal event, autonomous episode or already published finish',()=>{
 for(const type of ['catch','group_split','group_merge','attack']){
  const cp={...first,commentary:[{eventType:type,commentaryId:'action'}]};
  assert.equal(trial({...arg,timeline:{checkpoints:[source.checkpoints[0],cp,second]}})
   .status,'INCIDENT_OR_EVENT_UNSAFE');
 }
 assert.equal(trial({...arg,secondDetachment:{...det,autonomousRiderIds:['b']}})
  .status,'AUTONOMOUS_EPISODE_PRESENT');
 assert.equal(trial({...arg,timeline:{checkpoints:[source.checkpoints[0],first,
  {...second,finalResultsVisible:true}]}}).status,'CHECKPOINT_UNSAFE');
});
test('fails closed on nonphysical Phase10 source, actual physical movement and long interval',()=>{
 assert.equal(trial({...arg,firstPhase10Stages:{INITIAL:physical}})
  .status,'FIRST_SOURCE_NOT_STALE');
 assert.equal(trial({...arg,secondPhase10Stages:{INITIAL:initialStale}})
  .status,'SECOND_SOURCE_NOT_PHYSICAL');
 assert.equal(trial({...arg,physicalGroupsAtKm:km=>km<91?physical:initialStale})
  .status,'PHYSICAL_MOVEMENT_PRESENT');
 assert.equal(trial({...arg,timeline:{checkpoints:[source.checkpoints[0],first,
  {...second,raceProgress:{kmFromStart:110}}]}}).status,'DISTANCE_UNSAFE');
});
test('keeps deterministic source when one of the two checkpoints already aligned',()=>{
 const already={...second,groups:[
  physical[0],physical[1],{...physical[2],riderIds:['d']}
 ]};
 const out=trial({...arg,timeline:{checkpoints:[source.checkpoints[0],first,already]}});
 assert.equal(out.status,'DNF_SURVIVOR_PAIR_CREATED');
 assert.deepEqual(out.timeline.checkpoints[2],already);
 assert.equal(out.first,'SURVIVOR_RECONSTRUCTED');
 assert.equal(out.second,'ALREADY_ALIGNED');
});
