import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateIncidentAdjustedCheckpointV4 as build} from './privateIncidentAdjustedCheckpointV4.mjs';
const group=(code,riderIds)=>({displayCode:code,groupCode:'dropped_group',physicalPosition:'behind_peloton',colorKey:'dropped_gray',riderIds});
const initial={checkpointId:'before',raceProgress:{kmFromStart:90},groups:[group('C1',['a','b']),group('C2',['c'])],finalResultsVisible:false};
const after={checkpointId:'after',raceProgress:{kmFromStart:95},
 groups:[group('C1',['a']),group('C2',['b','c'])],
 gaps:[{displayCode:'C1',groupCode:'dropped_group',gapSeconds:10,officialTimeSeconds:null},
 {displayCode:'C2',groupCode:'dropped_group',gapSeconds:40,officialTimeSeconds:null}],
 riderStates:['a','b','c'].map((riderId,i)=>({riderId,status:'racing',
 groupCode:'dropped_group',displayCode:i===0?'C1':'C2',gapSeconds:i===0?10:40,energy:50})),
 commentary:[{eventType:'incident'}],finalResultsVisible:false};
const stages={AFTER_DISPLAY_NORMALIZATION:[group('C1',['a','b']),group('C2',['c'])]};
const physicalGroupsAtKm=()=>[{riderIds:['a','b'],gapSeconds:10},{riderIds:['c'],gapSeconds:40}];
const args={timeline:{checkpoints:[initial,after]},checkpointId:'after',
 physicalGroupsAtKm,phase10Stages:stages,reachedDnfRiderIds:[]};
test('reconstructs from physical-aligned Phase10 state and preserves every unrelated rider field',()=>{
 const out=build(args);
 assert.equal(out.status,'INCIDENT_CHECKPOINT_RECONSTRUCTED');
 assert.deepEqual(out.timeline.checkpoints[1].groups.map(g=>g.riderIds),[['a','b'],['c']]);
 assert.equal(out.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='b').displayCode,'C1');
 assert.equal(out.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='b').energy,50);
 assert.equal(out.timeline.checkpoints[1].commentary[0].eventType,'incident');
 assert.deepEqual(after.groups[0].riderIds,['a']);
 assert.equal(out.officialWrites,0);
});
test('rejects Phase10 partitions not grounded in physics and ambiguous group codes',()=>{
 const other={AFTER_DISPLAY_NORMALIZATION:[group('C1',['a']),group('C2',['b','c'])]};
 assert.equal(build({...args,phase10Stages:other}).status,'SOURCE_NOT_PHYSICAL');
 const bad={...after,groups:[group('C1',['a']),group('C1',['b','c'])]};
 assert.equal(build({...args,timeline:{checkpoints:[initial,bad]}}).status,'AMBIGUOUS_DISPLAY');
});
test('preserves reached DNF and refuses to restore nonphysical riders',()=>{
 const dnf={...after,groups:[group('C1',['a']),group('C2',['b'])],
 riderStates:after.riderStates.map(s=>s.riderId==='c'?{...s,status:'dnf',
 displayCode:null,groupCode:null,gapSeconds:null}:s)};
 const dnfStage={AFTER_DISPLAY_NORMALIZATION:[group('C1',['a','b'])]};
 const out=build({...args,timeline:{checkpoints:[initial,dnf]},
 phase10Stages:dnfStage,reachedDnfRiderIds:['c']});
 assert.equal(out.status,'GAP_OR_GROUP_IDENTITY_MISSING');
 assert.equal(build({...args,reachedDnfRiderIds:['c']}).status,'DNF_UNVERIFIED');
});
