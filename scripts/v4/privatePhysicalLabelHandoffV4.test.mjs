import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrivatePhysicalLabelHandoffV4 as build} from './privatePhysicalLabelHandoffV4.mjs';
const cp=(id,km,code,ids)=>({
 checkpointId:id,raceProgress:{kmFromStart:km},
 groups:[{riderIds:ids,displayCode:code}],
 gaps:[{displayCode:code,gapSeconds:30}],
 riderStates:ids.map(riderId=>({riderId,status:'racing',displayCode:code})),
 commentary:[]
});
const timeline={checkpoints:[cp('early',90,'P',['a','b']),cp('late',95,'C1',['a','b'])]};
const physicalGroupsAtKm=()=>[{riderIds:['a','b'],gapSeconds:30}];
const args={timeline,checkpointId:'late',riderId:'a',physicalGroupsAtKm};
test('renumbers only presentation when membership matches authoritative physical groups',()=>{
 const out=build(args);
 assert.equal(out.status,'LABEL_HANDOFF_CREATED');
 assert.equal(out.timeline.checkpoints[1].groups[0].displayCode,'P');
 assert.equal(out.timeline.checkpoints[1].riderStates[0].displayCode,'P');
 assert.equal(out.timeline.checkpoints[1].gaps[0].displayCode,'P');
 assert.equal(timeline.checkpoints[1].groups[0].displayCode,'C1');
 assert.equal(out.officialWrites,0);
});
test('same-distance checkpoint can be reconciled only on physical membership parity',()=>{
 const same={checkpoints:[timeline.checkpoints[0],{...timeline.checkpoints[1],raceProgress:{kmFromStart:90}}]};
 assert.equal(build({...args,timeline:same}).status,'LABEL_HANDOFF_CREATED');
 const mismatch={checkpoints:[timeline.checkpoints[0],cp('late',95,'C1',['a','c'])]};
 assert.equal(build({...args,timeline:mismatch}).status,'MEMBERSHIP_MISMATCH');
});
test('rejects ambiguous code collisions and physical changes',()=>{
 const collision={checkpoints:[timeline.checkpoints[0],{
 ...timeline.checkpoints[1],groups:[...timeline.checkpoints[1].groups,{riderIds:['c'],displayCode:'P'}]
 }]};
 assert.equal(build({...args,timeline:collision}).status,'CODE_COLLISION');
 const changed=()=>[{riderIds:['a'],gapSeconds:30},{riderIds:['b'],gapSeconds:30}];
 assert.equal(build({...args,physicalGroupsAtKm:changed}).status,'MEMBERSHIP_MISMATCH');
});
