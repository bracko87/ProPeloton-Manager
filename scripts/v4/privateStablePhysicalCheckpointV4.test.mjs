import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivateStablePhysicalCheckpointV4 as build} from './privateStablePhysicalCheckpointV4.mjs';
const cp=(checkpointId,km,parts,comments=[])=>({
 checkpointId,raceProgress:{kmFromStart:km},finalResultsVisible:false,
 groups:parts.map(([code,riderIds])=>({groupCode:'dropped_group',displayCode:code,
 physicalPosition:'behind_peloton',colorKey:'dropped_gray',riderIds})),
 gaps:parts.map(([code],i)=>({groupCode:'dropped_group',displayCode:code,gapSeconds:i*30,officialTimeSeconds:null})),
 riderStates:parts.flatMap(([code,ids],i)=>ids.map(riderId=>({riderId,status:'racing',
 groupCode:'dropped_group',displayCode:code,gapSeconds:i*30,energy:40}))),
 commentary:comments
});
const previous=cp('before',90,[['C1',['a','b']],['C2',['c']]]);
const broken=cp('after',90,[['C1',['a']],['C2',['b','c']]]);
const physicalGroupsAtKm=()=>[
 {riderIds:['a','b'],gapSeconds:0},{riderIds:['c'],gapSeconds:30}];
const args={timeline:{checkpoints:[previous,broken]},checkpointId:'after',physicalGroupsAtKm};
test('repairs same-km membership drift using stable authoritative physical partition',()=>{
 const result=build(args);
 assert.equal(result.status,'STABLE_CHECKPOINT_CREATED');
 assert.equal(result.mode,'SAME_KM_STABLE');
 assert.deepEqual(result.timeline.checkpoints[1].groups[0].riderIds,['a','b']);
 assert.equal(result.timeline.checkpoints[1].riderStates.find(s=>s.riderId==='b').displayCode,'C1');
 assert.equal(args.timeline.checkpoints[1].groups[0].riderIds.length,1);
 assert.equal(result.officialWrites,0);
});
test('repairs distant checkpoint only if physical partitions never differ at bounds',()=>{
 const later=cp('after',95,[['C1',['a']],['C2',['b','c']]]);
 const physicalAt=km=>[{riderIds:['a','b'],gapSeconds:km===90?0:5},
 {riderIds:['c'],gapSeconds:km===90?30:35}];
 const result=build({...args,timeline:{checkpoints:[previous,later]},physicalGroupsAtKm:physicalAt});
 assert.equal(result.status,'STABLE_CHECKPOINT_CREATED');
 assert.equal(result.mode,'DISTANCE_STABLE');
 assert.equal(result.timeline.checkpoints[1].gaps[0].gapSeconds,5);
});
test('rejects physical change, DNF, incidental transition and missing riders',()=>{
 const change=()=>[{riderIds:['a'],gapSeconds:0},{riderIds:['b','c'],gapSeconds:30}];
 assert.equal(build({...args,physicalGroupsAtKm:change}).status,'PHYSICAL_NOT_STABLE');
 const incident=cp('after',90,[['C1',['a']],['C2',['b','c']]],[{eventType:'incident'}]);
 assert.equal(build({...args,timeline:{checkpoints:[previous,incident]}}).status,'INCIDENT_OR_FINISH_UNSAFE');
 const dnf=structuredClone(broken);dnf.riderStates[0].status='dnf';
 assert.equal(build({...args,timeline:{checkpoints:[previous,dnf]}}).status,'INCIDENT_OR_FINISH_UNSAFE');
 const missing=cp('after',90,[['C1',['a']],['C2',['c']]]);
 assert.equal(build({...args,timeline:{checkpoints:[previous,missing]}}).status,'RIDER_SET_MISMATCH');
});
